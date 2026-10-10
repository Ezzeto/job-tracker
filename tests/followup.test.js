'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { F } = require('./helpers/env');

const app = {
  title: 'Software Engineering Intern (Platform and Developer Experience Team)', company: 'Acme Analytics', appliedAt: '2026-10-01T12:00:00Z',
  description: 'A seed-stage startup building developer tools.',
  chance: { matched: ['Python', 'FastAPI'], basic: ['Docker'], similar: [] },
};
const profile = { signName: 'Alex Example', signPhone: '07700 900123', pitch: 'second-year Computing student building Python projects', highlights: 'I build Python back ends with FastAPI.' };

test('LinkedIn notes always fit the 200-character limit', () => {
  for (const n of [0, 1]) {
    const { body } = F.build({ ...app, followUps: Array(n).fill({}) }, 'linkedin', { name: 'Priya Shah' }, profile);
    assert.ok(body.length <= F.LI_LIMIT, `${body.length}: ${body}`);
    assert.match(body, /^Hi Priya,/);
  }
});

test('email follow-up uses the profile, the hook and the signature', () => {
  const { subject, body } = F.build(app, 'email', null, profile);
  assert.equal(subject, `Follow-up: ${app.title} application – Alex Example`);
  assert.match(body, /small, fast-moving team/);
  assert.match(body, /I build Python back ends with FastAPI\./);
  assert.match(body, /Kind regards,\nAlex Example\n07700 900123$/);
});

test('templates work with an empty profile and no personal data', () => {
  const { subject, body } = F.build(app, 'email', null, {});
  assert.equal(subject, `Follow-up: ${app.title} application`);
  assert.ok(!/undefined|null/.test(body));
  const call = F.build(app, 'call', null, {});
  assert.match(call.body, /\[your name\]/);
});

test('agencies get a different closing line', () => {
  const agency = { ...app, company: 'Bright Recruitment Ltd' };
  assert.equal(F.isAgency(agency), true);
  assert.match(F.build(agency, 'email', null, profile).body, /similar roles/);
});
