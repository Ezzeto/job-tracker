'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { E } = require('./helpers/env');

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
