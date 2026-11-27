'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/env');
const Fit = require('../lib/fit.js');
const Ch = require('../lib/chance.js');
const L = require('../lib/llm.js');

const profile = {
  skills: { 'Microsoft 365': 'strong', 'Active Directory': 'strong', 'Windows 10/11': 'strong', Intune: 'basic', osTicket: 'basic', Proxmox: 'basic' },
  evidence: { Intune: 'lab', osTicket: 'lab' }, experienceYears: 2, commercialYears: 0, hasDrivingLicence: false,
};

test('evidence: work 1.0, lab 0.6, similar tool 0.4, none 0', () => {
  assert.equal(Fit.evidenceOf('Microsoft 365', profile).w, 1);
  assert.equal(Fit.evidenceOf('Intune', profile).w, 0.6);
  const jira = Fit.evidenceOf('ServiceNow', profile);
  assert.equal(jira.w, 0.4); assert.equal(jira.via, 'osTicket');
  assert.equal(Fit.evidenceOf('Python', profile).w, 0);
});

test('a requirement in "nice to have" moves Fit less than the same one in "required"', () => {
  const base = ['Microsoft 365 administration', 'Active Directory user management', 'Windows 11 troubleshooting'];
  const req = Fit.compute({ essential: base.concat('Experience with Python scripting'), desirable: ['Excellent customer service'] }, profile, { title: 'IT Support Technician' });
  const des = Fit.compute({ essential: base, desirable: ['Excellent customer service', 'Experience with Python scripting'] }, profile, { title: 'IT Support Technician' });
  assert.ok(des.score > req.score, `${des.score} > ${req.score}`);
});

test('a senior title is penalised by 30, fewer than 3 requirements give no number', () => {
  const reqs = { essential: ['Microsoft 365', 'Active Directory', 'Windows 11'], desirable: [] };
  assert.equal(Fit.compute(reqs, profile, { title: 'IT Support Technician' }).score, 100);
  assert.equal(Fit.compute(reqs, profile, { title: 'Senior Systems Engineer' }).score, 70);
  const low = Fit.compute({ essential: ['Microsoft 365'], desirable: [] }, profile, {});
  assert.equal(low.score, null); assert.ok(low.lowData);
});

test('years, soft skills and degrees are scored by kind, with a note', () => {
  const y = Fit.scoreReq('3+ years of experience in an IT support role', profile);
  assert.equal(y.kind, 'years'); assert.equal(y.w, 0);
  assert.equal(Fit.scoreReq('Excellent communication and customer service skills', profile).w, 1);
  assert.equal(Fit.scoreReq('A degree in Computer Science', profile).w, 0.6);
  assert.equal(Fit.scoreReq('Full UK driving licence', profile).w, 0);
});

test('the same ad text gives the same Fit, whatever site it came from', () => {
  const ad = 'IT Support Analyst\nRequirements:\n- Microsoft 365 and Active Directory\n- Windows 10/11 support\n- Ticketing systems such as ServiceNow\nDesirable:\n- Intune\n- ITIL Foundation';
  const a = Fit.compute(Fit.fromAd(ad), profile, { title: 'IT Support Analyst' });
  const b = Fit.compute(Fit.fromAd(ad + '\n'), profile, { title: 'IT Support Analyst' });
  assert.equal(a.score, b.score);
  assert.ok(a.essential.length >= 3);
});

test('AI answers are checked against the ad: invented lines are dropped', () => {
  const ad = 'We need someone with Microsoft 365 administration experience and strong Active Directory skills. Nice to have: Intune.';
  const v = Fit.validate({ essential: ['Microsoft 365 administration experience', 'Kubernetes cluster management'], desirable: ['Intune'], officeDays: 9, level: 'junior', agency: false }, ad);
  assert.deepEqual(v.essential, ['Microsoft 365 administration experience']);
  assert.equal(v.dropped, 1);
  assert.equal(v.officeDays, null, 'out of range is ignored');
  assert.equal(v.level, 'junior');
});

test('chance: smoothing keeps "1 of 3" far from 33%, the result stays within 0.2–30%', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  const old = '2026-09-01T12:00:00Z';
  const apps = [];
  for (let i = 0; i < 200; i++) apps.push({ status: i < 3 ? 'screening' : 'rejected', appliedAt: old, title: 'IT Support', agency: i % 7 === 0, location: 'London' });
  apps.push({ status: 'screening', appliedAt: old, title: 'IT Technician', location: 'Harlow' }, { status: 'rejected', appliedAt: old, title: 'IT Technician', location: 'Harlow' }, { status: 'rejected', appliedAt: old, title: 'IT Technician', location: 'Harlow' });
  const s = Ch.stats(apps, now);
  assert.ok(Math.abs(s.p0 - 4 / 203) < 1e-9);
  const pr = Ch.predict({ title: 'IT Technician', location: 'Harlow' }, s);
  assert.ok(pr.p < 0.1 && pr.p > s.p0, `p=${pr.p}`);
  assert.ok(pr.lowData);
  const d = Ch.describe(pr);
  assert.match(d.main, /выше твоей средней/);
  assert.match(d.note, /мало данных/);
});

test('chance: waiting applications are left out, 21 days of silence counts as no', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  assert.equal(Ch.outcome({ status: 'applied', appliedAt: '2026-11-20T12:00:00Z' }, now), null);
  assert.equal(Ch.outcome({ status: 'applied', appliedAt: '2026-10-20T12:00:00Z' }, now), 'neg');
  assert.equal(Ch.outcome({ status: 'rejected', history: [{ status: 'screening' }] }, now), 'pos');
});

test('llm: contact details are scrubbed, JSON answers are parsed and cached, the key picks the provider', async () => {
  const calls = [];
  const fetch = async (url, o) => { calls.push({ url, body: JSON.parse(o.body) }); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"essential":["Microsoft 365"],"desirable":[]}' } }] }) }; };
  const store = new Map();
  const cfg = { key: 'gsk_test', fetch, cache: { get: k => store.get(k), set: (k, v) => store.set(k, v) } };
  const msgs = [{ role: 'user', content: 'Call me on 07700 900123 or me@example.com' }];
  const a = await L.chat(cfg, msgs, { json: true });
  const b = await L.chat(cfg, msgs, { json: true });
  assert.deepEqual(a, b);
  assert.equal(calls.length, 1, 'second call comes from the cache');
  assert.doesNotMatch(calls[0].body.messages[0].content, /07700|example\.com/);
  assert.match(calls[0].url, /groq/);
  await L.chat({ key: 'AIzaTest', fetch }, msgs);
  assert.match(calls[1].url, /generativelanguage/);
  assert.equal(calls[1].body.model, 'gemini-2.5-flash');
});

test('voice note: the AI answer is checked, unknown companies and bad dates are dropped', async () => {
  const answer = { company: 'Harlow College', status: 'interview1', event: { title: 'Interview', date: '2026-12-01', time: '10:00', minutes: 45 }, nextDate: '2026-12-01', note: 'Sara called, interview Tuesday 10am', todo: ['bring passport'] };
  const fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(answer) } }] }) });
  const r = await L.voiceNote({ key: 'gsk_x', fetch }, { text: 'Sara from Harlow College called', companies: ['Harlow College', 'Cloudflare'], today: '2026-11-26 (Thursday)' });
  assert.equal(r.company, 'Harlow College');
  assert.equal(r.status, 'interview1');
  assert.deepEqual(r.event, { title: 'Interview', date: '2026-12-01', time: '10:00', minutes: 45 });
  assert.deepEqual(r.todo, ['bring passport']);
  const bad = { ...answer, company: 'Made Up Ltd', status: 'hired', event: { title: 'x', date: 'Tuesday' }, nextDate: 'soon' };
  const fetch2 = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(bad) } }] }) });
  const r2 = await L.voiceNote({ key: 'gsk_x', fetch: fetch2 }, { text: 'x', companies: ['Harlow College'], today: '2026-11-26' });
  assert.equal(r2.company, null); assert.equal(r2.status, null); assert.equal(r2.event, null); assert.equal(r2.nextDate, null);
});
