'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { S, Sync, resetStorage } = require('./helpers/env');
const { createFakeSheet } = require('./helpers/fake-sheet');
const Lr = require('../lib/learn.js');

test('gaps: the tools missing most often come first, market B counts double, known and learned ones are skipped', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  const recent = '2026-11-10T12:00:00Z';
  const apps = [
    { missing: ['ServiceNow', 'ITIL'], market: 'A', appliedAt: recent },
    { missing: ['ServiceNow'], market: 'A', appliedAt: recent },
    { missing: ['ITIL', 'Jamf'], market: 'B', appliedAt: recent },
    { missing: ['ITIL', 'Intune'], market: 'B', appliedAt: recent },
    { missing: ['Intune', 'Jamf'], market: 'B', appliedAt: recent },
  ];
  const g = Lr.gaps(apps, { skills: { Intune: 'basic' } }, { Jamf: '2026-11-20' }, now);
  assert.deepEqual(g.map(x => x.name), ['ITIL', 'ServiceNow']);
  assert.equal(g[0].count, 3);
  assert.ok(g[0].task.length > 40 && g[0].minutes > 0);
});

test('a finished task counts as a basic skill from the home lab, a skill used at work stays', () => {
  const p = Lr.withLearned({ skills: { 'Microsoft 365': 'strong' }, evidence: { 'Microsoft 365': 'work' } }, { ServiceNow: '2026-11-26', 'Microsoft 365': '2026-11-26' });
  assert.equal(p.skills.ServiceNow, 'basic');
  assert.equal(p.evidence.ServiceNow, 'lab');
  assert.equal(p.skills['Microsoft 365'], 'strong');
  assert.equal(p.evidence['Microsoft 365'], 'work');
});

test('skills learned on the phone reach the extension once, and None set later sticks', async () => {
  resetStorage();
  const sheet = createFakeSheet({ version: 23, learned: { ServiceNow: '2026-11-26' } });
  globalThis.fetch = sheet.fetch;
  await S.set({ sheetCfg: { url: sheet.url, token: 'secret', auto: true } });
  await Sync.syncNow();
  let p = await S.getProfile();
  assert.equal(p.skills.ServiceNow, 'basic');
  assert.equal(p.evidence.ServiceNow, 'lab');
  p.skills.ServiceNow = 'none'; await S.saveProfile(p);
  await Sync.syncNow();
  p = await S.getProfile();
  assert.equal(p.skills.ServiceNow, 'none');
});
