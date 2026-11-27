'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const AS = require('../lib/assist.js');

test('alert jobs: target roles first, senior and off-target out, already applied and hidden skipped', () => {
  const now = new Date().toISOString();
  const items = [
    { key: 'li1', title: 'Senior Infrastructure Engineer', after: 'BigCo · London', date: now, source: 'LinkedIn', url: 'u1' },
    { key: 'li2', title: 'IT Support Technician', after: 'Harlow College · Harlow · Part-time', date: now, source: 'LinkedIn', url: 'u2' },
    { key: 'in3', title: 'Service Desk Analyst', after: 'Acme · Cambridge', date: '2026-01-01T00:00:00Z', source: 'Indeed', url: 'u3' },
    { key: 'in4', title: 'Software Developer', after: 'X · London', date: now, source: 'Indeed', url: 'u4' },
    { key: 'li5', title: 'IT Support Analyst', after: 'Cloudflare · London', date: now, source: 'LinkedIn', url: 'u5' },
    { key: 'li6', title: 'Desktop Support', after: 'Y · Ware', date: now, source: 'LinkedIn', url: 'u6' },
  ];
  const rows = [{ url: 'https://www.linkedin.com/jobs/view/5/', title: 'IT Support Analyst', company: 'Cloudflare' }];
  const r = AS.rankAlerts(items.map(x => ({ ...x, key: x.key === 'li5' ? 'li5' : x.key })), rows, { li6: 1 }, { areas: ['Harlow'] });
  assert.deepEqual(r.map(x => x.key), ['li2', 'in3']);
  assert.equal(r[0].market, 'B');
  assert.ok(r[0].why.includes('можно с учёбой') && r[0].why.includes('рядом'));
});

test('interview slots: no study days, no Sunday, one a day, clear of busy events with a buffer', () => {
  const now = new Date(2026, 10, 26, 12, 0); // Thursday 26 Nov 2026
  const busy = [{ s: new Date(2026, 10, 30, 9, 0).toISOString(), e: new Date(2026, 10, 30, 10, 30).toISOString() }]; // Monday morning
  const slots = AS.freeSlots(busy, { now, studyDays: [3, 4] });
  assert.equal(slots.length, 3);
  const dows = slots.map(d => d.getDay());
  assert.ok(!dows.includes(4) && !dows.includes(5) && !dows.includes(0), dows.join(','));
  assert.equal(new Set(slots.map(d => d.toDateString())).size, 3);
  const mon = slots.find(d => d.getDay() === 1);
  assert.ok(mon && mon.getHours() * 60 + mon.getMinutes() >= 11 * 60, 'Monday slot starts 30 minutes after the busy event');
  const text = AS.replyDraft({ name: 'Sara Jones', company: 'Harlow College', title: 'IT Technician', slots, signName: 'Test Person' });
  assert.match(text, /^Hi Sara,/);
  assert.match(text, /Saturday 28 November at 09:00/);
});
