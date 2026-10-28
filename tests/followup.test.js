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

test('queue: first follow-up after 4 working days, second after 5 more, then done', () => {
  const now = '2026-10-28T12:00:00Z'; // a Wednesday
  const base = { status: 'applied', chance: { score: 70, verdict: 'apply' } };
  const apps = [
    { ...base, id: 'fresh', appliedAt: '2026-10-26T09:00:00Z' },                                    // 2 working days
    { ...base, id: 'due', appliedAt: '2026-10-20T09:00:00Z' },                                      // 6 working days
    { ...base, id: 'due-contact', appliedAt: '2026-10-21T09:00:00Z', chance: { score: 50, verdict: 'tailor' }, contacts: [{ type: 'email', value: 'jo@acme.co.uk' }] },
    { ...base, id: 'second', appliedAt: '2026-10-01T09:00:00Z', followUps: [{ at: '2026-10-23T09:00:00Z' }] }, // 3 working days since
    { ...base, id: 'finished', appliedAt: '2026-10-01T09:00:00Z', followUps: [{ at: '2026-10-08T09:00:00Z' }, { at: '2026-10-15T09:00:00Z' }] },
    { ...base, id: 'rejected', status: 'rejected', appliedAt: '2026-10-01T09:00:00Z' },
  ];
  const q = F.queue(apps, now);
  assert.deepEqual(q.due.map(x => x.a.id), ['due-contact', 'due']);
  assert.deepEqual(q.soon.map(x => [x.a.id, x.inDays]), [['fresh', 2], ['second', 2]]);
  assert.deepEqual(q.done.map(x => x.a.id), ['finished']);
});

test('queue ignores a bare name: it is not someone you can message', () => {
  const q = F.queue([{ id: 'x', status: 'applied', appliedAt: '2026-10-01T09:00:00Z', contacts: [{ type: 'name', value: 'Sam Lee', name: 'Sam Lee' }] }], '2026-10-28T12:00:00Z');
  assert.equal(q.due[0].contacts.length, 0);
});

test('queue puts applications over two weeks old without a follow-up after the fresh ones', () => {
  const now = '2026-10-28T12:00:00Z';
  const q = F.queue([
    { id: 'old', status: 'applied', appliedAt: '2026-10-01T09:00:00Z', contacts: [{ type: 'email', value: 'a@b.co' }] },
    { id: 'new', status: 'applied', appliedAt: '2026-10-21T09:00:00Z' },
  ], now);
  assert.deepEqual(q.due.map(x => [x.a.id, x.late]), [['new', false], ['old', true]]);
});

test('the education hook needs a school or students, not a word like "education" in the benefits', () => {
  const { body } = F.build({ title: 'Service Desk Analyst', company: 'Acme', appliedAt: '2026-10-01T12:00:00Z', description: 'We support continuing education and tuition reimbursement.' }, 'email', null, {});
  assert.doesNotMatch(body, /education setting/);
  const s = F.build({ title: 'IT Technician', company: 'Oak Academy', appliedAt: '2026-10-01T12:00:00Z', description: 'Support staff and students across the trust.' }, 'email', null, {});
  assert.match(s.body, /education setting/);
});

test('a Gmail link can name the account to send from', () => {
  const u = new URL(F.links.gmail('a@b.co', 'Hi', 'Body', 'me.work@gmail.com'));
  // No address in the path: /mail/u/<address>/ made Gmail answer 'Temporary Error (404)'
  assert.equal(u.pathname, '/mail/');
  assert.equal(u.searchParams.get('authuser'), 'me.work@gmail.com');
  assert.equal(u.searchParams.get('view'), 'cm');
  assert.equal(u.searchParams.get('to'), 'a@b.co');
  assert.equal(u.searchParams.get('su'), 'Hi');
  assert.equal(new URL(F.links.gmailInbox('x@gmail.com')).searchParams.get('authuser'), 'x@gmail.com');
  assert.match(F.links.gmail('a@b.co', 'Hi', 'Body'), /^https:\/\/mail\.google\.com\/mail\/\?view=cm/);
});
