'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { A, Plan } = require('./helpers/env');

const NOW = '2026-10-28T12:00:00'; // Wednesday; last week is 19–25 October
const profile = { ...A.DEFAULT_PROFILE, daysPerWeek: 4, dailyLimit: 5, skills: { 'Microsoft 365': 'strong' } };
const app = (id, applied, over = {}) => ({ id, title: 'IT Support ' + id, company: 'Acme', status: 'applied', track: 'job', appliedAt: applied, history: [{ status: 'applied', at: applied }], ...over });

test('weeks start on Monday', () => {
  assert.equal(Plan.weekKey(NOW), '2026-10-26');
  assert.equal(Plan.weekKey(NOW, -1), '2026-10-19');
  assert.equal(Plan.weekKey('2026-10-26T00:30:00'), '2026-10-26');
  assert.equal(Plan.weekKey('2026-11-01T23:00:00'), '2026-10-26');
});

test('report counts last week only', () => {
  const apps = [
    app('a', '2026-10-20T10:00:00', { apply: { cvTailored: true, cover: 'tailored' }, chance: { verdict: 'apply', tools: ['Microsoft 365', 'ServiceNow'] } }),
    app('b', '2026-10-21T10:00:00', { status: 'rejected', history: [{ status: 'applied', at: '2026-10-21T10:00:00' }, { status: 'rejected', at: '2026-10-22T09:00:00' }], chance: { verdict: 'skip', tools: ['ServiceNow'] }, followUps: [{ at: '2026-10-24T09:00:00' }] }),
    app('c', '2026-10-27T10:00:00'),
    app('d', '2026-10-10T10:00:00', { status: 'interview1', history: [{ status: 'applied', at: '2026-10-10T10:00:00' }, { status: 'interview1', at: '2026-10-23T10:00:00' }] }),
  ];
  const r = Plan.report(apps, profile, NOW, -1);
  assert.equal(r.applied, 2);
  assert.equal(r.target, 20);
  assert.equal(r.tailored, 1);
  assert.equal(r.letters, 1);
  assert.equal(r.skip, 1);
  assert.equal(r.followUps, 1);
  assert.equal(r.rejections, 1);
  assert.equal(r.fastRejections, 1);
  assert.equal(r.interviews, 1);
  assert.equal(r.replies, 1);
  assert.deepEqual(r.missing, [['ServiceNow', 2]]);
  assert.equal(Plan.report(apps, profile, NOW, 0).applied, 1);
});

test('auto plan turns last week into tasks', () => {
  const apps = [
    app('a', '2026-10-20T10:00:00', { chance: { verdict: 'skip', tools: ['ServiceNow'] } }),
    app('b', '2026-10-21T10:00:00', { chance: { verdict: 'apply', tools: ['ServiceNow'] } }),
    app('old', '2026-09-01T10:00:00'),
    app('int', '2026-10-01T10:00:00', { status: 'interview1', company: 'Oak Academy' }),
  ];
  const { items } = Plan.autoPlan(apps, profile, NOW, 'en');
  const ids = items.map(i => i.id);
  for (const id of ['interview:int', 'followups', 'apply', 'tailor', 'skip', 'learn:ServiceNow', 'stale', 'backup']) assert.ok(ids.includes(id), id);
  assert.match(items.find(i => i.id === 'apply').text, /Send 20 careful applications: 5 on each of your 4/);
  const ru = Plan.autoPlan(apps, profile, NOW, 'ru').items;
  assert.match(ru.find(i => i.id === 'apply').text, /^Отправить 20/);
});

test('parsePlan reads checklists, numbers, headings and bold', () => {
  const out = Plan.parsePlan(`Monday:
- [ ] Send **5** applications
2. Follow up with Acme

## Saturday
* [x] Study ITIL for 1 hour
`);
  assert.deepEqual(out, [{ heading: 'Monday' }, { text: 'Send 5 applications' }, { text: 'Follow up with Acme' }, { heading: 'Saturday' }, { text: 'Study ITIL for 1 hour' }]);
});

test('the AI prompt carries the numbers and asks for a readable checklist', () => {
  const p = Plan.aiPrompt([app('a', '2026-10-20T10:00:00')], profile, NOW, 'ru');
  assert.match(p, /Applications: 1 \(target 20\)/);
  assert.match(p, /one task per line, starting with "- "/);
  assert.match(p, /Write the tasks in Russian\./);
});

test('the plan names the days you work and skips basics like Microsoft Office', () => {
  const p = { ...profile, workDays: [5, 0, 1, 2] };
  const apps = [0, 1].map(i => app('x' + i, '2026-10-2' + i + 'T10:00:00', { chance: { verdict: 'apply', tools: ['Microsoft Office', 'Jira'] } }));
  const { last, items } = Plan.autoPlan(apps, p, NOW, 'en');
  assert.deepEqual(last.missing, [['Jira', 2]]);
  assert.match(items.find(i => i.id === 'apply').text, /\(Monday, Tuesday, Wednesday, Saturday\)$/);
  assert.match(Plan.aiPrompt(apps, p, NOW, 'en'), /4 days a week \(Monday, Tuesday, Wednesday, Saturday\)/);
});
