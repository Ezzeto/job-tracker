'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Tpl } = require('./helpers/env');

const me = { signName: 'Alex Example', signPhone: '07700 900123', signLinkedIn: 'linkedin.com/in/alex' };

test('fill puts in the job, the contact and the signature', () => {
  const out = Tpl.fill(Tpl.DEFAULTS.cover.body, { title: 'IT Support Analyst', company: 'Acme Ltd', name: 'Sarah' }, me);
  assert.match(out, /^Dear Sarah,/);
  assert.match(out, /the IT Support Analyst role at Acme Ltd\./);
  assert.match(out, /Kind regards,\nAlex Example\n07700 900123 · linkedin\.com\/in\/alex$/);
  assert.deepEqual(Tpl.leftovers(out), ['[One sentence on why this employer, from the ad or their website.]']);
});

test('with no contact name the greeting still reads well', () => {
  assert.match(Tpl.fill(Tpl.DEFAULTS.cover.body, {}, me), /^Dear Hiring Manager,/);
  assert.match(Tpl.fill(Tpl.DEFAULTS.speculative.body, {}, me), /^Hi,/);
});

test('an empty signature leaves no line of placeholders behind', () => {
  const out = Tpl.fill(Tpl.DEFAULTS.cover.body, { title: 'X', company: 'Y' }, { signName: 'Alex' });
  assert.doesNotMatch(out, /\[My phone\]/);
  assert.match(out, /Kind regards,\nAlex$/);
});

test('merge keeps edits and falls back to the defaults', () => {
  const m = Tpl.merge({ cover: { body: 'Mine' } });
  assert.equal(m.cover.body, 'Mine');
  assert.equal(m.cover.title, 'Cover letter');
  assert.equal(m.answers.body, Tpl.DEFAULTS.answers.body);
});

test('readSettings takes known fields of the right type and skips the rest', () => {
  const r = Tpl.readSettings({
    jobTrackerSettings: 1,
    profile: { workDays: [0, 1, 2, 5], timeLimitedRtw: true, signName: 'Alex', gmailAccounts: ['Alex@Gmail.com'], lang: 'ru', skills: { Python: 'strong' }, dailyLimit: 'five' },
    templates: { cover: { body: 'Hi' }, unknown: { body: 'x' } },
  });
  assert.deepEqual(r.profile, { workDays: [0, 1, 2, 5], timeLimitedRtw: true, signName: 'Alex', gmailAccounts: ['alex@gmail.com'], lang: 'ru', daysPerWeek: 4 });
  assert.deepEqual(r.templates, { cover: { body: 'Hi' } });
  assert.deepEqual(r.skipped.sort(), ['dailyLimit', 'skills', 'templates.unknown']);
});

test('readSettings refuses a backup and random JSON', () => {
  assert.throws(() => Tpl.readSettings({ apps: [] }), /backup of applications/);
  assert.throws(() => Tpl.readSettings({ foo: 1 }), /not a Job Tracker settings file/);
});
