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

// ---------- 3.1.0: the same vacancy on another site ----------
const zd = 'Zachary Daniels Recruitment is partnering with a well-established consumer-facing business to recruit an IT Support Engineer for its growing internal technology team. ' +
  'You will become a key point of contact for colleagues across a busy multi-site organisation, providing day-to-day technical support while gaining exposure to wider technology deployments and infrastructure projects. ' +
  'Acting as the first point of contact for IT queries and service requests, logging prioritising and resolving incidents through the IT service management platform, troubleshooting laptops desktops printers mobile devices and other business hardware. ' +
  'Supporting users across Windows macOS Android and iOS, managing user accounts password resets and access permissions, supporting Active Directory and Google Workspace environments, completing onboarding and offboarding activities for employees.';
test('jobRefs reads agency references', () => {
  assert.deepEqual(S.jobRefs('Some ad text\nApply today.\nBH37630'), ['BH37630']);
  assert.ok(S.jobRefs('(Ref: AJ47736 - Please include this)').includes('AJ47736'));
  assert.ok(S.jobRefs('Job Reference: 1359902').includes('1359902'));
});
test('sameJobIn finds the same vacancy saved from another site', () => {
  const saved = [{ id: 'a', ticket: 'APP-0101', platform: 'CV-Library', urlKey: 'cv-library.co.uk/job/1', title: 'IT Support Engineer', company: 'Zachary Daniels Recruitment', description: zd + '\nBH37630', appliedAt: new Date().toISOString() }];
  const byRef = S.sameJobIn({ url: 'https://www.reed.co.uk/jobs/it-support-engineer/2', title: 'IT Support Engineer', company: 'Zachary Daniels', description: 'Short text.\nBH37630' }, saved);
  assert.equal(byRef.why, 'ref'); assert.equal(byRef.app.ticket, 'APP-0101');
  const byText = S.sameJobIn({ url: 'https://www.reed.co.uk/x', title: 'IT Support Engineer', company: 'A consumer brand', description: zd }, saved);
  assert.equal(byText.why, 'text');
  assert.equal(S.sameJobIn({ url: 'https://www.reed.co.uk/x', title: '2nd Line Engineer', company: 'Someone', description: zd }, saved), null, 'same blurb, different job');
  const byTitle = S.sameJobIn({ url: 'https://www.reed.co.uk/y', title: 'IT Support Engineer', company: 'Zachary Daniels', description: 'Different short text' }, saved);
  assert.equal(byTitle.why, 'title');
  assert.equal(S.sameJobIn({ url: 'https://cv-library.co.uk/job/1', title: 'IT Support Engineer', company: 'Zachary Daniels', description: zd }, saved), null, 'the same link is not "another site"');
  assert.equal(S.sameJobIn({ url: 'https://www.reed.co.uk/z', title: '1st Line Support', company: 'Reed', description: 'Another job entirely.' }, saved), null);
});
