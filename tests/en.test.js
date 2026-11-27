'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/en.js');

test('English for the Russian parts: longest phrases first, values kept, Russian decimals become dots', () => {
  assert.equal(E.tr('До цели по рынку Б не хватает 4: выходные — хорошее время для откликов в школы и колледжи.'), 'Short of the market B target by 4: the weekend is a good time to apply to schools and colleges.');
  assert.equal(E.tr('нет у тебя в 5 вакансиях · в первую очередь'), 'missing in 5 jobs · first');
  assert.equal(E.tr('Рынок Б · с учёбой'), 'Market B · alongside study');
  assert.equal(E.tr('2 из 8: 25%, вероятный диапазон 7,1–59,1%'), '2 of 8: 25%, likely range 7.1–59.1%');
  assert.equal(E.tr('£24,000 - £26,500'), '£24,000 - £26,500');
  assert.equal(E.tr('Harlow College'), 'Harlow College');
});
