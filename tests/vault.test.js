'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../app/vault.js');
const V = globalThis.JT_Vault;

test('vault: data sealed with a PIN opens only with that PIN', async () => {
  const k = await V.newKey('2580');
  const box = await V.seal(k, { cfg: { url: 'https://script.google.com/x/exec', token: 'secret-token' }, rows: [{ id: 'a1' }] });
  assert.ok(!JSON.stringify(box).includes('secret-token'), 'nothing readable in the stored box');
  const { data } = await V.open('2580', box);
  assert.equal(data.cfg.token, 'secret-token');
  await assert.rejects(V.open('1111', box));
});

test('vault: PINs are 4 to 8 digits', () => {
  for (const p of ['1234', '12345678']) assert.ok(V.validPin(p));
  for (const p of ['123', '123456789', 'abcd', '12a4', '']) assert.ok(!V.validPin(p));
});
