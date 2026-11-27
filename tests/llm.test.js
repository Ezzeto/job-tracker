'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const LLM = require('../lib/llm.js');

const fake = content => ({ key: 'gsk_test', fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }) });

test('the cover letter goes out ready to send: placeholders are dropped, the signature is added', async () => {
  const r = await LLM.coverLetter(fake('Dear Hiring Manager,\n\nI support Microsoft 365 users. [One sentence on why this employer] I can start immediately.\n\nKind regards,\n[Your name]'),
    { job: { title: 'IT Support', company: 'Harlow College', description: 'IT support for a college' }, facts: 'I support Microsoft 365 users in my freelance work for small businesses and students.', profile: { skills: { 'Microsoft 365': 'strong' } }, signature: 'Test Person' });
  assert.equal(/\[/.test(r.text), false);
  assert.match(r.text, /I support Microsoft 365 users\. I can start immediately\./);
  assert.match(r.text, /Kind regards,\nTest Person$/);
});

test('what the ad says about the employer: lists are trimmed, a "why" with a placeholder is dropped', async () => {
  const r = await LLM.companyFromAd(fake(JSON.stringify({ about: ['A college in Harlow', '', 'Supports 300 staff'], offers: ['Training'], why: 'I would like to [reason]' })), { company: 'Harlow College', title: 'IT Support', description: 'ad' });
  assert.deepEqual(r.about, ['A college in Harlow', 'Supports 300 staff']);
  assert.deepEqual(r.offers, ['Training']);
  assert.equal(r.why, '');
});
