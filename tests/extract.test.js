'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, resetStorage } = require('./helpers/env');

test('contactsFromText finds emails and UK phone numbers, skipping no-reply addresses', () => {
  const c = E.contactsFromText('Email careers@acme.example or call 020 7946 0958. Do not reply to noreply@acme.example.');
  assert.deepEqual(c.filter(x => x.type === 'email').map(x => x.value), ['careers@acme.example']);
  assert.deepEqual(c.filter(x => x.type === 'phone').map(x => x.value), ['020 7946 0958']);
});

test('contactsFromText picks up a recruiter name after a cue word', () => {
  const c = E.contactsFromText('For more details speak to Sarah Jones in our talent team.');
  assert.ok(c.some(x => x.type === 'name' && x.value === 'Sarah Jones'));
});

test('mergeContacts removes duplicates and attaches names to matching emails', () => {
  const merged = E.mergeContacts(
    [{ type: 'email', value: 'sarah.jones@acme.example', name: '' }],
    [{ type: 'email', value: 'Sarah.Jones@acme.example ', name: '' }, { type: 'name', value: 'Sarah Jones', name: 'Sarah Jones' }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, 'Sarah Jones');
});

test('cleanTitleCompany splits LinkedIn-style titles', () => {
  assert.deepEqual(E.cleanTitleCompany('Software Engineer Intern | Acme Ltd | LinkedIn', ''), { title: 'Software Engineer Intern', company: 'Acme Ltd' });
});

test('BAD_TITLE rejects section headings and search pages, not real titles', () => {
  for (const t of ['About the job', '245 IT support jobs in London', 'Requirements:']) assert.ok(E.BAD_TITLE.test(t), t);
  for (const t of ['Software Engineer', 'AI Engineer Intern', 'Junior Python Developer']) assert.ok(!E.BAD_TITLE.test(t), t);
});

test('linesAfterTitle returns company and town, skipping noise', () => {
  const text = ['Junior Python Developer', 'Easily apply', 'Fernhill Digital', 'Cambridge', '£14 an hour'].join('\n');
  assert.deepEqual(E.linesAfterTitle(text, 'Junior Python Developer'), ['Fernhill Digital', 'Cambridge']);
});

test('siteFor matches supported job boards', () => {
  assert.equal(E.siteFor('uk.indeed.com').name, 'indeed');
  assert.equal(E.siteFor('www.linkedin.com').name, 'linkedin');
  assert.equal(E.siteFor('careers.example.com').name, 'other');
  assert.equal(E.siteFor('www.linkedin.com').fetchUrl, null, 'LinkedIn results are never fetched in the background');
});

test('CV-Library job links match with and without the slug', () => {
  const s = E.siteFor('www.cv-library.co.uk');
  assert.ok(s.cardLink.test('https://www.cv-library.co.uk/job/225697311/it-support-engineer'));
  assert.ok(s.cardLink.test('https://www.cv-library.co.uk/job/225697311'));
  assert.ok(!s.cardLink.test('https://www.cv-library.co.uk/jobs/it-support'));
});

test('it-jobs.co.uk is read as the CV-Library platform it runs on', () => {
  const s = E.siteFor('www.it-jobs.co.uk');
  assert.equal(s.name, 'cvlibrary');
  assert.ok(s.cardLink.test('https://www.it-jobs.co.uk/job/225705834/it-support-analyst'));
});

test('a site that answers 403 is left alone for hours instead of being retried', async () => {
  resetStorage();
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 403, text: async () => 'Access Denied' }; };
  try {
    await assert.rejects(E.fetchAndParse('https://www.totaljobs.com/job/x-job1'), e => e.status === 403);
    await assert.rejects(E.fetchAndParse('https://www.totaljobs.com/job/y-job2'), e => e.status === 'cooldown');
    assert.equal(calls, 1, 'the second request never reached the site');
    assert.ok(await E.blockedUntil('www.totaljobs.com') > Date.now() + 5 * 3600e3);
  } finally { globalThis.fetch = realFetch; }
});

test('cleanContacts drops junk names and adjustment mailboxes and strips LinkedIn badges', () => {
  const out = E.cleanContacts([
    { type: 'name', value: 'Hybrid Working', name: 'Hybrid Working' },
    { type: 'email', value: 'disability-accomodations@qualcomm.com', name: '' },
    { type: 'linkedin', value: 'https://www.linkedin.com/in/a/', name: 'Robert James Hunt, SHRM-CP • 3rd+' },
    { type: 'linkedin', value: 'https://www.linkedin.com/in/b/', name: 'Marc Martínez i Daunis’ profile' },
    { type: 'name', value: 'Sruthi Soman', name: 'Sruthi Soman' },
  ]);
  assert.deepEqual(out.map(c => c.name), ['Robert James Hunt', 'Marc Martínez i Daunis', 'Sruthi Soman']);
});
