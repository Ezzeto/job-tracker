'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RV = require('../lib/review.js');

const apps = [
  { status: 'screening', appliedAt: '2026-11-24T12:00:00', company: 'Harlow College', title: 'IT Technician', platform: 'Company website', market: 'B', method: 'Company website', cvKind: 'Tailored', minutes: 40, missing: ['ITIL'], tools: ['ITIL', 'Microsoft 365'] },
  { status: 'rejected', appliedAt: '2026-11-22T12:00:00', company: 'Hays', title: 'Service Desk', platform: 'LinkedIn', market: 'A', agency: true, method: 'Easy Apply', rejDays: 1, missing: ['ServiceNow'], tools: ['ServiceNow'] },
  { status: 'applied', appliedAt: '2026-11-17T12:00:00', company: 'Birchwood High School', title: 'IT Support Assistant', platform: 'Reed', market: 'B', method: 'Job board form', missing: [], tools: [] },
  { status: 'noresponse', appliedAt: '2026-10-02T12:00:00', company: 'Acme', title: 'Desktop Support', platform: 'LinkedIn', market: 'A', method: 'Easy Apply', missing: ['ITIL'], tools: ['ITIL'] },
];
const now = Date.parse('2026-11-26T12:00:00');

test('week: this week against last, totals, fast rejections, missing tools', () => {
  const w = RV.week(apps, now);
  assert.deepEqual(w.thisWeek, { n: 1, B: 1, A: 0, tailored: 1, agency: 0 });
  assert.equal(w.lastWeek.n, 2);
  assert.equal(w.total.fast, 1);
  assert.equal(w.topMissing[0][0], 'ITIL');
  assert.match(RV.summaryForAi(w, { A: 5, B: 7, C: 3 }), /This week: 1 applications/);
});

test('cost of a screening: timed minutes win, estimates fill the rest, cheapest channel first', () => {
  const c = RV.costPerScreen(apps);
  const site = c.find(x => x.channel === 'Сайт компании');
  assert.equal(site.screens, 1); assert.equal(site.perScreen, 0.7);
  assert.equal(c[0].channel, 'Сайт компании');
  assert.equal(c.find(x => x.channel === 'Агентство').perScreen, null);
});

test('ask: the AI query is cleaned, then run by code', () => {
  const q = RV.cleanQuery({ filter: { text: 'school', from: '2026-11-01', status: ['applied', 'hired'], market: 'C' }, groupBy: 'status', show: 'list' });
  assert.deepEqual(q.filter.status, ['applied']);
  assert.equal(q.filter.market, null);
  const r = RV.runQuery(apps, q);
  assert.equal(r.total, 1);
  assert.equal(r.rows[0].company, 'Birchwood High School');
  const r2 = RV.runQuery(apps, RV.cleanQuery({ filter: { missing: 'ITIL', screened: false }, show: 'count' }));
  assert.equal(r2.total, 1);
  const r3 = RV.runQuery(apps, RV.cleanQuery({ filter: {}, groupBy: 'channel' }));
  assert.ok(r3.groups.some(g => g.key === 'Easy Apply' && g.n === 1));
});

test('offer maths: the commute lowers the real hourly pay', () => {
  const near = RV.offerMaths({ salary: 26000, hours: 37.5, days: 5, commuteMin: 10, commuteCost: 0 });
  const far = RV.offerMaths({ salary: 30000, hours: 37.5, days: 5, commuteMin: 75, commuteCost: 25 });
  assert.equal(near.hourly, 13.33);
  assert.ok(far.effective < near.effective, `${far.effective} < ${near.effective}`);
});
