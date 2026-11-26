'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { S, Sync, resetStorage } = require('./helpers/env');
const { createFakeSheet } = require('./helpers/fake-sheet');

async function setup(opts) {
  resetStorage();
  const sheet = createFakeSheet(opts);
  globalThis.fetch = sheet.fetch;
  await S.set({ sheetCfg: { url: sheet.url, token: 'secret', auto: true } });
  return sheet;
}

test('pushes new applications once, then has nothing to send', async () => {
  const sheet = await setup();
  await S.addApp({ title: 'Intern', company: 'Acme', status: 'applied' });
  const first = await Sync.syncNow();
  assert.ok(first.ok, first.error);
  assert.equal(sheet.rows.size, 1);
  assert.equal([...sheet.rows.values()][0].status, 'Applied');
  const posts = () => sheet.calls.filter(c => c.method === 'POST').length;
  const before = posts();
  await Sync.syncNow();
  assert.equal(posts(), before, 'nothing changed, so nothing is posted');
});

test('an edit made in the sheet comes back to the extension', async () => {
  const sheet = await setup();
  const a = await S.addApp({ title: 'Intern', company: 'Acme' });
  await Sync.syncNow();
  sheet.edit(a.id, { status: 'Interview 1', notes: 'Call on Monday' });
  const r = await Sync.syncNow();
  assert.match(r.msg, /1 changed/);
  const [after] = await S.getApps();
  assert.equal(after.status, 'interview1');
  assert.equal(after.notes, 'Call on Monday');
  assert.deepEqual(after.history.map(h => h.status), ['applied', 'interview1']);
});

test('an older sheet row does not overwrite a newer local change', async () => {
  const sheet = await setup();
  const a = await S.addApp({ title: 'Intern', company: 'Acme' });
  await Sync.syncNow();
  sheet.edit(a.id, { status: 'Rejected' }, 1); // edited long ago
  await S.updateApp(a.id, { status: 'offer' });
  await Sync.syncNow();
  const [after] = await S.getApps();
  assert.equal(after.status, 'offer');
  assert.equal(sheet.rows.get(a.id).status, 'Offer');
});

test('a row typed into the sheet becomes a new application with a ticket', async () => {
  const sheet = await setup();
  sheet.rows.set('s1', { id: 's1', title: 'Data Intern', company: 'Beta', status: 'Applied', appliedAt: '2026-10-01', updated: Date.now() });
  await Sync.syncNow();
  const apps = await S.getApps();
  assert.equal(apps.length, 1);
  assert.equal(apps[0].ticket, 'APP-0001');
  assert.equal(apps[0].title, 'Data Intern');
});

test('sheets created before 2.0 with Russian statuses are still read', async () => {
  const sheet = await setup();
  const a = await S.addApp({ title: 'Intern', company: 'Acme' });
  await Sync.syncNow();
  sheet.edit(a.id, { status: 'Оффер' });
  await Sync.syncNow();
  assert.equal((await S.getApps())[0].status, 'offer');
});

test('deleting in the extension removes the row from the sheet', async () => {
  const sheet = await setup();
  const a = await S.addApp({ title: 'Intern', company: 'Acme' });
  await Sync.syncNow();
  await S.deleteApp(a.id);
  await Sync.syncNow();
  assert.equal(sheet.rows.size, 0);
  assert.deepEqual((await S.get('pendingDeletes')).pendingDeletes, []);
});

test('a wrong token and an outdated script give clear errors', async () => {
  await setup({ token: 'other' });
  const bad = await Sync.syncNow();
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Wrong token/);

  const old = await setup({ version: 7 });
  const t = await Sync.test({ url: old.url, token: 'secret' });
  assert.equal(t.ok, false);
  assert.match(t.error, /out of date/);
});

test('a change in the same millisecond as the last sync is still sent', async () => {
  const sheet = await setup();
  const a = await S.addApp({ title: 'Intern', company: 'Acme' });
  await Sync.syncNow();
  // Force the worst case: the next edit gets exactly the same timestamp as the synced version
  const [synced] = await S.getApps();
  const realNow = Date.prototype.toISOString;
  Date.prototype.toISOString = function () { return synced.updatedAt; };
  try { await S.updateApp(a.id, { status: 'test' }); } finally { Date.prototype.toISOString = realNow; }
  await Sync.syncNow();
  assert.equal(sheet.rows.get(a.id).status, 'Test task');
});

test('applying an edit from the sheet does not echo it back', async () => {
  const sheet = await setup();
  const a = await S.addApp({ title: 'Intern', company: 'Acme' });
  await Sync.syncNow();
  sheet.edit(a.id, { status: 'Screening' });
  const posts = () => sheet.calls.filter(c => c.method === 'POST').length;
  const before = posts();
  await Sync.syncNow();
  assert.equal(posts(), before);
});

test('the profile reaches a version 13 sheet once, for the phone app', async () => {
  resetStorage();
  const sheet = createFakeSheet({ version: 13 });
  globalThis.fetch = sheet.fetch;
  await S.set({ sheetCfg: { url: sheet.url, token: 'secret' } });
  await S.addApp({ title: 'IT Support', company: 'Acme', url: 'https://example.com/1' });
  await Sync.syncNow();
  await Sync.syncNow();
  const withProfile = sheet.calls.filter(c => c.method === 'POST' && c.body.profile);
  assert.equal(withProfile.length, 1);
  assert.ok(withProfile[0].body.profile.skills, 'skills are sent');
  assert.equal(withProfile[0].body.profile.factBank, undefined, 'the fact bank stays on the computer');
});

test('a follow-up recorded on the phone comes back as a follow-up with its date', async () => {
  const sheet = await setup();
  const a = await S.addApp({ title: 'Service Desk Analyst', company: 'Acme', status: 'applied' });
  await Sync.syncNow();
  sheet.edit(a.id, { followup: '1 · 20/11/2026' });
  await Sync.syncNow();
  const [after] = await S.getApps();
  assert.equal(after.followUps.length, 1);
  assert.equal(after.followUps[0].at.slice(0, 10), '2026-11-20');
  assert.ok(after.history.some(h => (h.fields || []).includes('followUps')), 'recorded as an event that can be undone');
  sheet.edit(a.id, { followup: '1 · 20/11/2026' });
  await Sync.syncNow();
  assert.equal((await S.getApps())[0].followUps.length, 1, 'the same count adds nothing');
});
