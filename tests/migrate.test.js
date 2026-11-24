'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { M, S, A, I, resetStorage } = require('./helpers/env');

const desc = 'We are hiring a 1st line IT Support Analyst to support 300 users across Microsoft 365, Active Directory and Windows 11. '.repeat(4);
const base = (o) => ({ id: o.id, ticket: o.ticket, title: 'IT Support Analyst', company: 'Acme', url: 'https://www.linkedin.com/jobs/view/1/', urlKey: 'linkedin.com/jobs/view/1',
  status: 'applied', appliedAt: '2026-10-01T10:00:00.000Z', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
  history: [{ at: '2026-10-01T10:00:00.000Z', status: 'applied' }], description: desc, notes: '', ...o });

test('v1 → v2: the same link saved twice becomes one record with everything kept', () => {
  const a = base({ id: 'a1', ticket: 'APP-0001', notes: 'called them', history: [{ at: '2026-10-01T10:00:00.000Z', status: 'applied' }, { at: '2026-10-20T10:00:00.000Z', status: 'rejected' }], status: 'rejected' });
  const b = base({ id: 'a2', ticket: 'APP-0002', description: '', notes: 'from sheet', syncedAt: '2026-11-01T00:00:00.000Z', followUps: [{ at: '2026-10-08T10:00:00.000Z', channel: 'email' }] });
  const out = M.migrateV2({ apps: [a, b], profile: { timeLimitedRtw: true }, counter: 2 });
  assert.equal(out.apps.length, 1);
  const k = out.apps[0];
  assert.equal(k.id, 'a1');
  assert.equal(k.status, 'rejected');
  assert.match(k.notes, /called them/); assert.match(k.notes, /from sheet/);
  assert.equal(k.followUps.length, 1);
  assert.deepEqual(k.mergedIds, ['a2']);
  assert.deepEqual(out.pendingDeletes, ['a2'], 'the copy is removed from the sheet too');
  assert.equal(out.profile.timeLimitedRtw, false);
  assert.equal(out.schema, 2);
});

test('v1 → v2: history entries become events with ids, and the migration can run twice', () => {
  const out = M.migrateV2({ apps: [base({ id: 'a1', ticket: 'APP-0001', history: [{ at: '2026-10-01T10:00:00.000Z', status: 'applied' }, { at: '2026-10-01T10:00:20.000Z', status: 'applied' }, { at: '2026-10-09T10:00:00.000Z', status: 'noresponse' }] })], profile: {} });
  const h = out.apps[0].history;
  assert.equal(h.length, 2, 'two captures of the same moment are one event');
  assert.ok(h.every(e => e.id && e.type === 'status' && e.by));
  assert.equal(h[1].from, 'applied');
  const again = M.migrateV2(out);
  assert.deepEqual(again.apps[0].history.map(e => e.id), h.map(e => e.id));
});

test('v1 → v2: dates from empty sheet cells (1970) are replaced, salaries re-read', () => {
  const out = M.migrateV2({ apps: [base({ id: 'a1', ticket: 'APP-0001', appliedAt: '1970-01-01T00:00:00.000Z', nextDate: '1970-01-01', salaryText: '£26-28,000', salary: { text: '£26-28,000', min: 26, max: 28000, annualMin: 26, annualMax: 28000, period: 'year' } })], profile: {} });
  const a = out.apps[0];
  assert.equal(a.appliedAt, '2026-10-01T10:00:00.000Z');
  assert.equal(a.nextDate, '');
  assert.equal(a.salary.annualMin, 26000);
});

test('v1 → v2: a record without an ad shows ? instead of a percentage', () => {
  const out = M.migrateV2({ apps: [base({ id: 'a1', ticket: 'APP-0001', description: '', company: '', chance: { score: 60, label: 'Medium' } })], profile: {} });
  assert.equal(A.display(out.apps[0].chance).text, '?');
});

test('history: every status change is an event, undo puts the old status back', async () => {
  resetStorage();
  const app = await S.addApp({ title: 'IT Support', company: 'Acme', url: 'https://example.com/job/1' });
  const after = await S.updateApp(app.id, { status: 'rejected' });
  const ev = after.history[after.history.length - 1];
  assert.equal(ev.status, 'rejected'); assert.equal(ev.from, 'applied'); assert.equal(ev.by, 'me');
  const undone = await S.undoEvent(app.id, ev.id);
  assert.equal(undone.status, 'applied');
  assert.ok(undone.history.find(h => h.id === ev.id).undone, 'the event is marked, not deleted');
  assert.equal(S.liveHistory(undone).length, 1);
  assert.ok(!S.everReached(undone, ['rejected']), 'an undone rejection does not count');
  assert.equal(await S.undoEvent(app.id, ev.id), null, 'cannot undo twice');
});

test('history: an automatic No response that was undone is never set again', async () => {
  resetStorage();
  const app = await S.addApp({ title: 'IT Support', company: 'Acme', url: 'https://example.com/job/2', appliedAt: '2026-09-01T10:00:00.000Z' });
  assert.deepEqual(I.staleIds(await S.getApps(), 30, '2026-11-24'), [app.id]);
  const auto = await S.updateApp(app.id, { status: 'noresponse', outcome: { type: 'ghosted', auto: true } }, { by: 'auto' });
  const ev = auto.history[auto.history.length - 1];
  const back = await S.undoEvent(app.id, ev.id);
  assert.equal(back.status, 'applied');
  assert.equal(back.outcome, null);
  assert.deepEqual(I.staleIds(await S.getApps(), 30, '2026-11-24'), []);
});

test('history: edits that are not tracked (a typo in the title) add no event', () => {
  assert.equal(S.eventFor({ status: 'applied', title: 'a' }, { title: 'b' }), null);
  assert.equal(S.eventFor({ status: 'applied' }, { status: 'applied' }), null);
  assert.deepEqual(S.eventFor({ status: 'applied' }, { nextDate: '2026-12-01' }).fields, ['nextDate']);
});

test('addApp re-checks the link right before saving, so two quick captures make one record', async () => {
  resetStorage();
  const [x, y] = await Promise.all([S.addApp({ url: 'https://example.com/job/9', title: 'A' }), S.addApp({ url: 'https://example.com/job/9', title: 'A' })]);
  assert.equal((await S.getApps()).length, 1);
  assert.equal(x.id, y.id);
});
