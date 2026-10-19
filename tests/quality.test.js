'use strict';
// Data quality, gates and verdicts (v3). Every ad here is synthetic: a real backup holds personal data.
const test = require('node:test');
const assert = require('node:assert/strict');
const { A, Q, S, R, resetStorage } = require('./helpers/env');

const profile = (over = {}) => ({ ...A.DEFAULT_PROFILE, areas: ['London'], daysPerWeek: 3, experienceYears: 1, ...over,
  skills: { 'Windows 10/11': 'strong', 'Microsoft 365': 'strong', 'Active Directory': 'strong', 'Ticketing': 'strong', 'Networking basics': 'basic', ...(over.skills || {}) } });
const body = extra => `About the role
You will provide first line support to 300 users across our London office, working with Windows 10/11, Microsoft 365 and Active Directory.
Responsibilities
- Log, triage and resolve tickets in our ticketing system within agreed SLAs
- Set up laptops, phones and printers for new starters, and manage leavers
- Reset passwords and manage accounts in Active Directory and Microsoft 365
- Support Teams meetings rooms and basic networking issues such as Wi-Fi and VPN
- Keep documentation up to date so colleagues can self-serve
Requirements
${extra}
- Good communication with non-technical people
- Familiar with Windows 10/11 and Microsoft 365 administration
Benefits
- 25 days holiday and a pension`;
const job = (title, extra, over = {}) => ({ title, company: 'Acme Ltd', location: 'London', description: body(extra), ...over });

// ---------- Data quality ----------
test('cleanDescription drops the LinkedIn results list and widgets before the ad', () => {
  const raw = ['Get job alerts for this search', 'IT Support Analyst', 'Other Co', 'Promoted by hirer', 'Easy Apply', '1,234 results',
    'How promoted jobs are ranked', 'Helpdesk Analyst', 'Easy Apply', 'About the job', 'You will support users.', 'Show match details', 'About the company', 'We sell things.'].join('\n');
  const c = Q.cleanDescription(raw);
  assert.equal(c.text, 'You will support users.');
  assert.ok(c.removed > 0);
});

test('search headings, form titles and tab names are not job titles', () => {
  for (const t of ['37,252 It Engineer Jobs', 'it helpdesk jobs in London', "Let's complete your application", 'Google Sheets', 'About the job', ''])
    assert.ok(Q.isJunkTitle(t), t);
  for (const t of ['IT Support Engineer', '1st Line Support Technician', 'Service Desk Analyst (Hybrid)'])
    assert.ok(!Q.isJunkTitle(t), t);
});

test('an application form is not scored and gets verdict incomplete', () => {
  const form = 'Acme Ltd\nIT Support Engineer\nFirst name\nLast name\nEmail address\nPhone number\nUpload your CV\nSubmit application\n' + 'x '.repeat(300);
  assert.ok(Q.looksLikeApplicationForm(form));
  const an = A.analyze({ title: 'IT Support Engineer', company: 'Acme Ltd', description: form }, profile());
  assert.equal(an.chance.verdict, 'incomplete');
  assert.equal(A.display(an.chance).text, '?');
});

test('a list of job cards is recognised as a results page', () => {
  const cards = Array.from({ length: 8 }, (_, i) => `IT Support ${i}\nCompany ${i}\nLondon\n£28,000\nPosted ${i + 1} days ago`).join('\n');
  assert.ok(Q.looksLikeResultsList(cards));
  assert.ok(!Q.looksLikeResultsList(body('- 1 year of IT support')));
});

test('recoverHeader finds the title in "Join X as …" and in an Indeed header', () => {
  assert.deepEqual(Q.recoverHeader('Full job description\nJoin Northwood as IT Support Engineer and support our teams.\nMore text here.'), { title: 'IT Support Engineer', company: 'Northwood' });
  assert.deepEqual(Q.recoverHeader('Skip\nService Desk Analyst\nAcme Ltd\nLondon\n£30,000 a year\nApply now\nText'), { title: 'Service Desk Analyst', company: 'Acme Ltd' });
});

test('a short description lowers confidence instead of producing a confident number', () => {
  const an = A.analyze({ title: 'IT Support Technician', company: 'Acme', description: 'IT support role in London. Windows and Microsoft 365. Apply now. '.repeat(4) }, profile());
  assert.equal(an.chance.verdict, 'incomplete');
});

// ---------- Experience ----------
test('yearsAsked reads "3+ years in a … role" and ignores the company history', () => {
  assert.equal(A.yearsAsked('3+ years in a technical support, help desk, or IT operations role.').years, 3);
  assert.equal(A.yearsAsked('2 years as a service desk analyst within a busy team').years, 2);
  assert.equal(A.yearsAsked('We have over 20 years of experience in IT recruitment.'), null);
});

test('"ideally" far from the years does not make them optional', () => {
  const y = A.yearsAsked('3+ years of experience in IT support or a similar role, ideally in a corporate environment.');
  assert.equal(y.years, 3); assert.equal(y.preferred, false);
  assert.equal(A.yearsAsked('Ideally 2 years of experience in IT support').preferred, true);
});

test('years far above yours rule the job out; one more year is a question', () => {
  const far = A.analyze(job('IT Support Analyst', '- 3+ years in a service desk role'), profile());
  assert.equal(far.chance.verdict, 'skip');
  assert.ok(far.chance.gates.blocks.some(b => b.key === 'experience'));
  assert.ok(far.chance.score <= 25);
  const near = A.analyze(job('IT Support Analyst', '- 2 years of IT support experience'), profile());
  assert.ok(near.chance.gates.asks.some(b => b.key === 'experience'));
  assert.notEqual(near.chance.verdict, 'skip');
});

// ---------- Gates ----------
test('a short licence bullet is a requirement, a "desirable" one is not', () => {
  const must = A.analyze(job('IT Support Technician', '- Full, clean driving licence'), profile());
  assert.ok(must.chance.gates.blocks.some(b => b.key === 'licence'));
  const nice = A.analyze(job('IT Support Technician', '- A driving licence would be desirable'), profile());
  assert.ok(!nice.chance.gates.blocks.some(b => b.key === 'licence'));
});

test('"only accepting candidates based within this area" uses the place named in the ad', () => {
  const j = job('IT Service Desk Analyst', '- This is an on-site role in Thatcham so we are only accepting applications from candidates based within this area.');
  const an = A.analyze(j, profile());
  assert.equal(an.chance.verdict, 'skip');
  assert.match(an.chance.gates.blocks.map(b => b.text).join(), /Thatcham/);
});

test('3rd line and contractor day rates are ruled out', () => {
  assert.equal(A.analyze(job('3rd Line Support Engineer', '- Windows experience'), profile()).chance.verdict, 'skip');
  assert.equal(A.analyze({ ...job('EUC Engineer', '- Windows experience'), salaryText: '£450 per day' }, profile()).chance.verdict, 'skip');
});

test('full-time hours are a note, not a question, unless you asked to penalise them', () => {
  const j = job('IT Support Technician', '- Full-time, Monday to Friday, 37.5 hours');
  const relaxed = A.analyze(j, profile());
  assert.ok(!relaxed.chance.gates.asks.some(a => a.key === 'hours'));
  assert.ok(relaxed.chance.reasons.some(r => /Full-time/.test(r.text)));
  const strict = A.analyze(j, profile({ penalizeSchedule: true }));
  assert.ok(strict.chance.gates.asks.some(a => a.key === 'hours'));
});

test('a good entry-level ad gets Apply or Tailor with a real confidence', () => {
  const an = A.analyze(job('1st Line IT Support Technician', '- 1 year of IT support or helpdesk experience'), profile());
  assert.ok(['apply', 'tailor'].includes(an.chance.verdict), an.chance.verdict);
  assert.notEqual(an.chance.confidence, 'low');
  assert.match(A.display(an.chance).text, /^\d+%$/);
});

test('an unknown heading after "About us" does not swallow the requirements', () => {
  const d = `About us\nWe are a fast-growing firm.\nOur Stack:\n- Windows 10/11, Microsoft 365, Intune, Jamf and Okta\n- 1 year of helpdesk experience\n` + body('- Ticketing');
  const an = A.analyze({ title: 'Service Desk Technician', company: 'X', description: d }, profile());
  assert.ok(an.chance.tools.includes('Intune'));
});

// ---------- Re-check ----------
const rec = (id, over = {}) => ({ id, ticket: 'APP-' + id, title: 'IT Support Engineer', company: 'Acme Ltd', status: 'applied', createdAt: '2026-10-01T10:00:00Z', appliedAt: '2026-10-01T10:00:00Z', history: [{ status: 'applied', at: '2026-10-01T10:00:00Z' }], description: body('- 1 year of IT support'), ...over });

test('re-check repairs a junk title and finds the duplicate it belongs to', () => {
  const apps = [rec('0001'), rec('0002', { title: '37,252 It Engineer Jobs', company: 'Acme Ltd', description: 'Join Acme as IT Support Engineer and help our teams.\n' + body('- 1 year of IT support') })];
  const rep = R.recheckAll(apps, profile(), 2);
  assert.equal(apps[1].title, 'IT Support Engineer');
  assert.equal(rep.duplicates.length, 1);
});

test('two different jobs at a company that reuses its blurb are not duplicates', () => {
  const apps = [rec('0001', { title: 'Service Desk Technician L1' }), rec('0002', { title: 'Service Desk Technician L2' })];
  assert.equal(R.findDuplicates(apps).size, 0);
});

test('merging keeps the furthest status, notes and history', () => {
  const a = rec('0001', { notes: 'Recruiter: Sam' });
  const b = rec('0002', { url: 'https://x/1', status: 'interview1', notes: 'Phone screen Friday', history: [{ status: 'applied', at: '2026-10-02T10:00:00Z' }, { status: 'interview1', at: '2026-10-08T10:00:00Z' }], createdAt: '2026-10-02T10:00:00Z' });
  const { apps, merged } = R.mergeDuplicates([a, b]);
  assert.equal(apps.length, 1); assert.equal(merged.length, 1);
  assert.equal(apps[0].status, 'interview1');
  assert.match(apps[0].notes, /Sam/); assert.match(apps[0].notes, /Phone screen/);
});

test('clashing tickets: the oldest keeps its number, the rest get new ones', () => {
  const apps = [rec('a', { ticket: 'APP-0002', createdAt: '2026-09-01T00:00:00Z' }), rec('b', { ticket: 'APP-0002', createdAt: '2026-10-01T00:00:00Z' }), rec('c', { ticket: 'APP-0009' })];
  const r = R.fixTickets(apps, 3);
  assert.equal(apps[0].ticket, 'APP-0002');
  assert.equal(apps[1].ticket, 'APP-0010');
  assert.equal(r.counter, 10);
});

test('bad next-step dates are cleared', () => {
  for (const bad of [',', '1970-01-01', 'next week']) {
    const a = rec('1', { nextDate: bad });
    R.recheckOne(a, profile());
    assert.equal(a.nextDate, '', bad);
  }
  const ok = rec('1', { nextDate: '2026-11-18' }); R.recheckOne(ok, profile()); assert.equal(ok.nextDate, '2026-11-18');
});

// ---------- Store ----------
test('nextTicket never reuses a number when the counter is behind', async () => {
  resetStorage();
  await S.set({ counter: 2, apps: [{ id: 'x', ticket: 'APP-0041' }] });
  const a = await S.addApp({ title: 'New', url: 'https://example.com/job/1' });
  assert.equal(a.ticket, 'APP-0042');
  const again = await S.addApp({ title: 'New', url: 'https://example.com/job/1' });
  assert.equal(again.id, a.id, 'the same link is not saved twice');
});

test('findSimilar matches an application form to the job saved from the ad', async () => {
  resetStorage();
  await S.set({ apps: [{ id: 'x', ticket: 'APP-0001', title: 'IT Support Specialist', company: 'Zachary Daniels Recruitment', createdAt: new Date().toISOString() }] });
  const hit = await S.findSimilar('IT Support Specialist', 'Zachary Daniels');
  assert.equal(hit && hit.id, 'x');
});
