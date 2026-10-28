'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib/i18n.js');

test('exact strings, numbers and multi-line tooltips are translated', () => {
  assert.equal(L.tr('Weekly plan'), 'План на неделю');
  assert.equal(L.tr('  Send today  '), 'Отправить сегодня');
  assert.equal(L.tr('5 working days without a reply: time to follow up'), '5 рабочих дней без ответа: пора написать фоллоуап');
  assert.equal(L.tr('applied 21 days ago'), 'отклик 21 день назад');
  assert.equal(L.tr('Something here rules you out\n✕ Needs a driving licence or a car'), 'Что-то здесь вас исключает\n✕ Нужны права или машина');
  assert.equal(L.tr('Employer · applied yesterday · first follow-up'), 'Работодатель · отклик вчера · первый фоллоуап');
});

test('unknown text, tool names and job titles stay as they are', () => {
  for (const s of ['Microsoft 365', 'IT Support Technician', 'Acme Ltd', 'ServiceNow']) assert.equal(L.tr(s), s);
});

test('every Russian entry is a non-empty string and no key has stray spaces', () => {
  for (const [k, v] of Object.entries(L.RU)) {
    assert.equal(k, k.replace(/\s+/g, ' ').trim(), `key "${k}"`);
    assert.ok(typeof v === 'string' && v.length, k);
  }
});

test('follow-up counters are translated', () => {
  assert.equal(L.tr('Employer · sent: 1, last on 28 Oct 2026'), 'Работодатель · отправлено: 1, последний 28 Oct 2026');
  assert.equal(L.tr('Follow-ups sent: 2'), 'Отправлено фоллоуапов: 2');
});
