'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const AF = require('../lib/autofill.js');

test('options are picked by meaning: yes, no, prefer not to say, closest text', () => {
  assert.equal(AF.matches('Yes', 'yes'), 3);
  assert.equal(AF.matches('No, I do not', 'no'), 3);
  assert.equal(AF.matches('No - prefer not to say', 'no'), 0, 'that option means prefer not to say');
  assert.equal(AF.matches('I would rather not say', 'prefer not to say'), 3);
  assert.equal(AF.matches('Decline to self-identify', 'prefer not to say'), 3);
  assert.equal(AF.matches('United Kingdom', 'United Kingdom'), 3);
  assert.equal(AF.matches('Female', 'prefer not to say'), 0);
});

test('labels map to the right field: sponsorship before right to work, consent and diversity recognised', () => {
  const key = label => (AF.RULES.find(([, re]) => re.test(label)) || [null])[0];
  assert.equal(key('First Name *'), 'firstName');
  assert.equal(key('Will you now or in the future require visa sponsorship?'), 'sponsor');
  assert.equal(key('Are you legally entitled to work in the UK?'), 'rtw');
  assert.equal(key('Do you hold a full UK driving licence?'), 'licence');
  assert.equal(key('What is your notice period?'), 'notice');
  assert.equal(key('Ethnicity'), 'diversity');
  assert.equal(key('I agree to the privacy policy'), 'consent');
  assert.equal(key('Upload your CV'), 'cv');
});

test('a free-text question takes the prepared answer that shares most words with it', () => {
  const answers = [{ q: 'Why do you want to work for us?', a: 'Because…' }, { q: 'Describe a time you solved a difficult technical problem', a: 'At Côte…' }];
  assert.equal(AF.bestAnswer('Tell us why you want to work for Harlow College', answers), 'Because…');
  assert.equal(AF.bestAnswer('Please describe a time you solved a technical problem under pressure', answers), 'At Côte…');
  assert.equal(AF.bestAnswer('What is your favourite colour?', answers), null);
  assert.ok(AF.SUCCESS.test('Thank you for applying! We have received your application.'));
});
