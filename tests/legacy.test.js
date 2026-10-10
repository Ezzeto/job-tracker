'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { A, L } = require('./helpers/env');

test('every legacy status maps to a current status id', () => {
  const ids = A.STATUSES.map(s => s.id);
  for (const [ru, id] of Object.entries(L.STATUS)) assert.ok(ids.includes(id), ru);
  assert.equal(Object.keys(L.STATUS).length, A.STATUSES.length);
});

test('migrateApp translates stored values and refreshes old explanations', () => {
  const a = {
    title: 'IT Support Analyst', description: 'Windows and Active Directory support.', category: 'Другое', platform: 'Сайт компании',
    notes: 'Что нужно:\n• Windows', contacts: [{ type: 'email', value: 'x@y.example', source: 'описание' }],
    offer: { mode: 'Гибрид' }, chance: { score: 40, reasons: [{ text: 'Навыки: совпадение 40%', delta: 20 }] },
  };
  assert.equal(L.migrateApp(a, A, A.DEFAULT_PROFILE), true);
  assert.equal(a.category, 'Other');
  assert.equal(a.platform, 'Company website');
  assert.equal(a.offer.mode, 'Hybrid');
  assert.equal(a.notes, 'Requirements:\n• Windows');
  assert.equal(a.contacts[0].source, 'description');
  assert.ok(!/[А-Яа-я]/.test(JSON.stringify(a.chance)));
  assert.equal(L.migrateApp(a, A, A.DEFAULT_PROFILE), false, 'running twice changes nothing');
});

test('migrateProfile keeps the old behaviour until the user changes it', () => {
  const p = { speaksUkrainianRussian: true };
  assert.equal(L.migrateProfile(p), true);
  assert.deepEqual(p.languages, ['Ukrainian', 'Russian']);
  assert.deepEqual(p.targetCategories, ['IT Help Desk / Service Desk', 'IT Technician / Field Support']);
  assert.ok(!('speaksUkrainianRussian' in p));
  assert.equal(L.migrateProfile(p), false);
});
