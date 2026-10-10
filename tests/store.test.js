'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { S, resetStorage } = require('./helpers/env');

test('cleanUrl keeps one permanent link per job', () => {
  assert.equal(S.cleanUrl('https://uk.indeed.com/jobs?q=python&vjk=abc123def456&from=serp'), 'https://uk.indeed.com/viewjob?jk=abc123def456');
  assert.equal(S.cleanUrl('https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=python'), 'https://www.linkedin.com/jobs/view/4012345678/');
  assert.equal(S.cleanUrl('https://careers.acme.example/job/42?utm_source=x&gclid=y&team=eng#apply'), 'https://careers.acme.example/job/42?team=eng');
});

test('normUrl gives the same key for links that differ only in noise', () => {
  assert.equal(S.normUrl('https://www.reed.co.uk/jobs/dev/123/'), S.normUrl('https://reed.co.uk/jobs/dev/123?source=email'));
});

test('platformFromUrl names the source', () => {
  assert.equal(S.platformFromUrl('https://uk.indeed.com/viewjob?jk=1'), 'Indeed');
  assert.equal(S.platformFromUrl('https://app.welcometothejungle.com/jobs/1'), 'Welcome to the Jungle');
  assert.equal(S.platformFromUrl('https://careers.acme.example/1'), 'Company website');
  assert.equal(S.platformFromUrl('not a url'), 'Other');
});

test('addApp, updateApp and deleteApp keep tickets, history and pending deletes', async () => {
  resetStorage();
  const a = await S.addApp({ title: 'Intern', company: 'Acme', url: 'https://acme.example/jobs/1?utm_source=x' });
  const b = await S.addApp({ title: 'Intern 2', company: 'Beta' });
  assert.equal(a.ticket, 'APP-0001'); assert.equal(b.ticket, 'APP-0002');
  assert.equal((await S.findByUrl('https://acme.example/jobs/1')).id, a.id);

  const u = await S.updateApp(a.id, { status: 'interview1' });
  assert.deepEqual(u.history.map(h => h.status), ['applied', 'interview1']);
  assert.ok(S.everReached(u, ['interview1']));

  await S.updateApp(a.id, { syncedAt: u.updatedAt });
  await S.deleteApp(a.id);
  const { pendingDeletes } = await S.get('pendingDeletes');
  assert.deepEqual(pendingDeletes, [a.id], 'a synced app must be deleted from the sheet too');
  await S.deleteApp(b.id);
  assert.deepEqual((await S.get('pendingDeletes')).pendingDeletes, [a.id], 'an app never synced needs no sheet delete');
  assert.equal((await S.getApps()).length, 0);
});
