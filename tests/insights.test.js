'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { I, S, A, Sync, resetStorage } = require('./helpers/env');
const { createFakeSheet } = require('./helpers/fake-sheet');

test('methodFromButton reads the button you pressed', () => {
  assert.equal(I.methodFromButton('Easy Apply', 'LinkedIn'), 'easy');
  assert.equal(I.methodFromButton('Apply Apply to IT Support on company website', 'LinkedIn'), 'external');
  assert.equal(I.methodFromButton('Apply on company site', 'Indeed'), 'external');
  assert.equal(I.methodFromButton('Apply now', 'Indeed'), 'board');
  assert.equal(I.methodFromButton('Apply', 'LinkedIn'), 'external');
  assert.equal(I.methodFromButton('Submit application', 'Company website'), 'external');
  assert.equal(I.methodFromButton('Yes', 'LinkedIn', true), 'external');
  assert.equal(I.methodFromButton('', 'Reed'), 'unknown');
});

test('postingMeta reads ad age and the number of applicants', () => {
  const now = '2026-10-26T12:00:00Z';
  let m = I.postingMeta('London, England · Reposted 2 weeks ago · Over 100 people clicked apply', now);
  assert.equal(m.postedDaysAgo, 14); assert.equal(m.reposted, true); assert.equal(m.applicants, 101);
  m = I.postingMeta('Manchester · 3 days ago · 45 applicants', now);
  assert.equal(m.postedDaysAgo, 3); assert.equal(m.reposted, false); assert.equal(m.applicants, 45);
  assert.equal(I.postingMeta('Just posted', now).postedDaysAgo, 0);
  assert.equal(I.postingMeta('Posted 5 hours ago', now).postedDaysAgo, 0);
  assert.equal(I.postingMeta('Posted 30+ days ago', now).postedDaysAgo, 30);
  assert.equal(I.postingMeta('Posted 21 October by Hays', now).postedDaysAgo, 5);
  assert.equal(I.postingMeta('Posted 20 December by Hays', now).postedDaysAgo, 310, 'a date in the future means last year');
  assert.equal(I.postingMeta('Posted Yesterday by Reed', now).postedDaysAgo, 1);
  assert.equal(I.postingMeta('Be among the first 25 applicants', now).applicants, 24);
  const none = I.postingMeta('A great IT role in Leeds', now);
  assert.equal(none.postedDaysAgo, null); assert.equal(none.applicants, null);
});

test('requirements flags hard demands and ignores nice-to-haves', () => {
  const pad = ' We are a friendly team in Leeds looking for someone to join us and grow with the business over the next few years.'.repeat(2);
  const r = I.requirements('Previous experience in an IT support role is essential. Full-time, Monday to Friday. Full UK driving licence required.' + pad);
  assert.ok(r.includes('priorExp')); assert.ok(r.includes('fullTime')); assert.ok(r.includes('driving'));
  const soft = I.requirements('A degree is desirable but not essential. ITIL would be nice.' + pad);
  assert.ok(!soft.includes('degree'));
  assert.ok(I.requirements('2+ years of experience with Microsoft 365.' + pad).includes('years'));
  assert.equal(I.requirements('short'), null, 'no description, no verdict');
});

test('outcome: a rejection within 3 days counts as a CV screen', () => {
  const app = { status: 'rejected', appliedAt: '2026-10-01T10:00:00Z', history: [{ status: 'applied', at: '2026-10-01T10:00:00Z' }, { status: 'rejected', at: '2026-10-03T09:00:00Z' }] };
  assert.equal(I.daysToRejection(app), 2);
  assert.equal(I.outcomeType(app, false), 'fast');
  assert.equal(I.outcomeType({ ...app, history: [{ status: 'rejected', at: '2026-10-20T09:00:00Z' }] }, false), 'review');
  assert.equal(I.outcomeType(app, true), 'after_interview');
  assert.equal(I.outcomeType({ ...app, outcome: { type: 'closed' } }, false), 'closed', 'what you chose wins');
});

test('staleIds finds silent applications, counting follow-ups as activity', () => {
  const now = '2026-10-26T12:00:00Z';
  const apps = [
    { id: 'old', status: 'applied', appliedAt: '2026-09-01T12:00:00Z' },
    { id: 'chased', status: 'applied', appliedAt: '2026-09-01T12:00:00Z', followUps: [{ at: '2026-10-20T12:00:00Z' }] },
    { id: 'new', status: 'applied', appliedAt: '2026-10-20T12:00:00Z' },
    { id: 'rej', status: 'rejected', appliedAt: '2026-08-01T12:00:00Z' },
  ];
  assert.deepEqual(I.staleIds(apps, 30, now), ['old']);
  assert.deepEqual(I.staleIds(apps, 0, now), [], '0 turns it off');
});

test('breakdown splits reply and interview rates by factor', () => {
  const at = '2026-09-01T12:00:00Z';
  const mk = (method, status, extra = {}) => ({ appliedAt: at, status, history: [{ status: 'applied', at }].concat(status === 'applied' ? [] : [{ status, at: '2026-09-02T12:00:00Z' }]), apply: { method, cover: 'none', cv: 'CV v2' }, posting: { daysAgo: 1, applicants: 150 }, ...extra });
  const apps = [mk('easy', 'rejected'), mk('easy', 'applied'), mk('easy', 'applied'), mk('external', 'interview1'), mk('external', 'screening'), mk('external', 'applied', { posting: null })];
  const b = I.breakdown(apps, { responded: a => S.everReached(a, A.RESPONDED), interviewed: a => S.everReached(a, A.INTERVIEW), now: '2026-10-26T12:00:00Z' });
  const how = b.groups.find(g => g.title === 'How you applied').rows;
  const easy = how.find(r => r.key === I.label(I.METHODS, 'easy'));
  const ext = how.find(r => r.key === I.label(I.METHODS, 'external'));
  assert.deepEqual([easy.n, easy.replied, easy.interview, easy.rejected], [3, 1, 0, 1]);
  assert.deepEqual([ext.n, ext.replied, ext.interview], [3, 2, 1]);
  const crowd = b.groups.find(g => g.title === 'Applicants before you').rows;
  assert.deepEqual(crowd.map(r => r.key), ['Over 100', 'Unknown'], 'buckets keep their natural order');
  assert.equal(b.rejection.n, 1); assert.equal(b.rejection.fast, 1); assert.equal(b.rejection.silent, 3);
});

test('a new application keeps apply, posting, reqs and outcome, and they reach the sheet', async () => {
  resetStorage();
  const a = await S.addApp({ title: 'IT Support', company: 'Acme', status: 'rejected', apply: { method: 'easy', cover: 'none', cv: 'CV v2' }, posting: { daysAgo: 9, applicants: 120 }, reqs: ['priorExp'], outcome: { reason: 'experience' } });
  const got = (await S.getApps())[0];
  assert.equal(got.apply.method, 'easy'); assert.equal(got.posting.applicants, 120);
  const sheet = createFakeSheet({ version: 12 });
  globalThis.fetch = sheet.fetch;
  await S.set({ sheetCfg: { url: sheet.url, token: 'secret' } });
  const r = await Sync.syncNow();
  assert.ok(r.ok, r.error);
  assert.doesNotMatch(r.msg, /out of date/);
  const row = sheet.rows.get(a.id);
  assert.equal(row.method, 'Easy Apply / quick apply');
  assert.equal(row.cv, 'CV v2'); assert.equal(row.adAge, 9); assert.equal(row.applicants, 120);
  assert.match(row.outcome, /CV screen/); assert.match(row.outcome, /Not enough experience/);
  assert.match(row.reqs, /previous IT/);
});
