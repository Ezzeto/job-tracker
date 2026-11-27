'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const AS = require('../lib/assistant.js');

const now = Date.parse('2026-11-27T12:00:00Z');
const iso = d => new Date(now - d * 864e5).toISOString();
const apps = [
  { title: 'IT Support Technician', company: 'Harlow College', status: 'applied', appliedAt: iso(6), market: 'B', channel: 'LinkedIn', replied: false, reached: false, followUps: 0, workingDays: 5, missing: ['Jira'] },
  { title: 'IT Technician', company: 'Birchwood High School', status: 'screening', appliedAt: iso(20), market: 'B', channel: 'Сайт компании', replied: true, reached: true, missing: ['Jira', 'ServiceNow'] },
  { title: 'Service Desk Analyst', company: 'Saragossa', status: 'rejected', appliedAt: iso(40), market: 'A', channel: 'Easy Apply', replied: true, reached: false, missing: [] },
];

test('assistant: the context holds counts made by code, what is due and the query result', () => {
  const c = AS.context(apps, { now, targets: { B: 7, A: 5, C: 3 }, studyDays: [3, 4], session: 2, query: '1 applications match' });
  assert.match(c, /Last 30 days: 2 applications, 1 with any answer, 1 reached screening/);
  assert.match(c, /Follow-ups due .*Harlow College/);
  assert.match(c, /In progress: IT Technician — Birchwood High School \(screening\)/);
  assert.match(c, /Jira ×2/);
  assert.match(c, /Days with classes: Thu, Fri/);
  assert.match(c, /tonight's application session: 2/);
  assert.match(c, /QUERY RESULT for the question: 1 applications match/);
});

test('assistant: data questions run a query first, plan requests become the week plan', () => {
  assert.ok(AS.wantsQuery('Сколько я подал в школы в октябре?'));
  assert.ok(AS.wantsQuery('Which channel gives answers?'));
  assert.ok(!AS.wantsQuery('Что мне сделать сегодня?'));
  assert.ok(AS.wantsPlan('Составь план на неделю'));
  assert.match(AS.system(true), /5–8 tasks/);
  assert.doesNotMatch(AS.system(false), /5–8 tasks/);
});
