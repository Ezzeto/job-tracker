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

// Shaped like a real Reed ad that scored 67% 'Tailor CV' in 3.0.0
const JP = `-IT Support / Microsoft 365 / Hybrid Working-
A bank is currently recruiting a Japanese speakingIT Helpdesk & Administrator to join its London team on a temporary assignment.
The role will provide IT helpdesk and administrative support, assisting users with technical issues while supporting day-to-day IT operations. The successful candidate will work closely with IT and HR teams and will receive full induction and on-the-job training.
This opportunity would suit an IT support professional with good communication skills, a methodical approach and the ability to work effectively in a busy corporate environment.
Key responsibilities
- Troubleshoot and resolve user-related IT issues, escalating where required
- Support Microsoft 365 users and keep documentation up to date
- Administrative support for the IT and HR teams, using Microsoft Office
Requirements
- Previous experience in IT helpdesk, IT support or a related role
- Good customer service
Working Hours: weekend work and bank holiday work required, shifts between 7:30–15:30, 8:00–16:00, 9:00–17:00 and 10:00–18:00; overtime may be required and is payable
Benefits: 20 days' annual leave plus 8 Bank Holidays for the first 12 weeks; 25 days' annual leave plus 8 Bank Holidays thereafter
Working Style: Hybrid; full-time office attendance required for up to the first 4 weeks`;

test('a language in the job title or "X speaking" rules the job out', () => {
  const an = A.analyze({ title: 'IT Helpdesk & Administrator (fluent Japanese)', company: 'Centre People Appointments', location: 'London', description: JP }, profile({ languages: ['English', 'Russian', 'Ukrainian'] }));
  assert.equal(an.chance.verdict, 'skip');
  assert.match(an.chance.gates.blocks.map(b => b.text).join(), /Japanese/);
  const body2 = A.analyze({ title: 'IT Helpdesk & Administrator', company: 'X', location: 'London', description: JP }, profile({ languages: ['English'] }));
  assert.ok(body2.chance.gates.blocks.some(b => b.key === 'language'), 'found in "Japanese speakingIT" too');
  const mine = A.analyze({ title: 'IT Helpdesk (fluent Russian)', company: 'X', location: 'London', description: JP.replace(/Japanese/g, 'Russian') }, profile({ languages: ['English', 'Russian'] }));
  assert.ok(!mine.chance.gates.blocks.some(b => b.key === 'language'), 'a language you speak is fine');
});

test('shifts and weekend work are a note; hours, visas and taglines are not benefits', () => {
  const an = A.analyze({ title: 'IT Helpdesk & Administrator', company: 'X', location: 'London', description: JP }, profile({ languages: ['English', 'Japanese'] }));
  assert.ok(an.chance.reasons.some(r => /^Shifts or weekends: weekend work/.test(r.text)));
  assert.ok(!an.chance.gates.asks.some(a => a.key === 'shifts'), 'a note, not a question');
  assert.ok(an.chance.reasons.some(r => /Temporary/.test(r.text)));
  assert.ok(!an.benefits.some(b => /IT Support \/|weekend work|visa/i.test(b)), JSON.stringify(an.benefits));
  assert.ok(an.chance.matched.includes('Microsoft Office'), 'Microsoft 365 covers Office');
});

// ---------- 3.0.2: places, day rates, non-IT roles (CV-Library search, Oct 2026) ----------
test('London districts and Hertfordshire towns count as your areas', () => {
  const areas = ['london', 'hertfordshire', 'essex', 'cambridge'];
  for (const l of ['Whitechapel, England', 'Elstree and Borehamwood, England', 'Potters Bar, England', 'Clapham, London (2 miles)', 'SE11, Greater London', 'Harlow, Essex'])
    assert.ok(A.inAreas(l, areas), l);
  for (const l of ['Manchester', 'Crawley, England', 'Bristol']) assert.ok(!A.inAreas(l, areas), l);
  const an = A.analyze({ title: 'IT Support Engineer', company: 'X', location: 'Whitechapel, England', description: body('- 1 year of IT support') }, profile({ areas: ['London'] }));
  assert.ok(!an.chance.gates.asks.some(a => a.key === 'commute'));
});

test('a modest day rate is a contract question, not a senior role', () => {
  const j = { ...job('1st Line Support', '- 1 year of IT support'), salaryText: '£200 - £250 per day' };
  const an = A.analyze(j, profile());
  assert.ok(!an.chance.gates.blocks.some(b => b.key === 'level'), JSON.stringify(an.chance.gates));
  assert.ok(an.chance.gates.asks.some(a => a.key === 'contract'));
  const high = A.analyze({ ...j, salaryText: '£450 per day' }, profile());
  assert.equal(high.chance.verdict, 'skip');
});

test('a job that is not in IT is ruled out; IT titles outside the categories are not', () => {
  const water = 'You will carry out water hygiene and legionella risk assessments, flush outlets, take water samples and keep site records for commercial buildings across London. '.repeat(6);
  const an = A.analyze({ title: 'Water Treatment Engineer', company: 'X', location: 'London', description: water }, profile());
  assert.equal(an.chance.verdict, 'skip');
  assert.ok(an.chance.gates.blocks.some(b => b.key === 'role'));
  assert.equal(A.detectCategory('ICT Technician Schools', ''), 'IT Technician / Field Support');
  assert.equal(A.detectCategory('Desktop Analyst', ''), 'IT Help Desk / Service Desk');
  const ict = A.analyze(job('ICT Technician Schools', '- 1 year of IT support'), profile());
  assert.ok(!ict.chance.gates.blocks.some(b => b.key === 'role'));
});

// ---------- 3.0.3: admin, facilities and adverts that named only office skills scored 70%+ ----------
const office = (title, lines) => ({ title, company: 'X', location: 'London', description: lines.join('\n') + '\n' + '- Proficiency in Microsoft Office, including Outlook, Word and Excel.\n- Excellent customer service and communication.\n- Keep accurate records of every request and follow it up promptly with the right team.\n'.repeat(3) });

test('facilities, reception and admin roles are not IT roles, even with a "helpdesk"', () => {
  for (const [t, lines] of [
    ['Facilities Management Officer', ['- Manage Facilities Management helpdesk requests', '- Issue building passes to visitors']],
    ['Workspace Services Receptionist', ['- Raise and track maintenance requests through CAFM systems', '- Manage visitor sign-in']],
    ['Help Desk Admin', ['- Raise new jobs on our CAFM system for engineers', '- Process engineer timesheets']],
    ['Fire & Security Administrator', ['- Raise reactive work orders for engineers', '- Update the IT/CAFM system with PPM completion']],
    ['School Administrator', ['- Admissions, student data and the school calendar', '- Ability to use SIMS']],
  ]) {
    const an = A.analyze(office(t, lines), profile());
    assert.equal(an.chance.verdict, 'skip', t);
    assert.ok(an.chance.gates.blocks.some(b => b.key === 'role'), t);
  }
});

test('training courses and survey sites are not jobs', () => {
  const course = A.analyze(office('IT Support Assistant - Training Course', ['Course Details', '- Duration: 7 weeks', 'Price: £0', '- This is a fully government-funded course - there are no fees to pay.']), profile());
  assert.ok(course.chance.gates.blocks.some(b => b.key === 'not-a-job'));
  const survey = A.analyze(office('Paid Research', ['Take part in paid surveys, focus groups and mystery shopping.', "It's not a suitable replacement for a job."]), profile());
  assert.ok(survey.chance.gates.blocks.some(b => b.key === 'not-a-job'));
});

test('IT roles that mention admin or an IT system are still IT roles', () => {
  for (const t of ['IT Administrator', 'Systems Administrator', 'I.T Helpdesk', 'IT Support Engineer (Mac)', '1st Line Support'])
    assert.ok(!A.analyze(job(t, '- 1 year of IT support'), profile()).chance.gates.blocks.some(b => b.key === 'role' || b.key === 'not-a-job'), t);
});

// ---------- 3.0.4: a rural office that needs a car scored 82% 'Apply' ----------
test('"you will need to be able to drive" and the car screening question rule a job out', () => {
  for (const line of ["- Our office is on a farm, so you'll need to be able to drive and have reliable transport to get to work.", 'Application question(s):\nDo you have a car and a driver\'s license?']) {
    const an = A.analyze(job('Technical Support Technician', line), profile());
    assert.ok(an.chance.gates.blocks.some(b => b.key === 'licence'), line);
  }
});

test("Indeed's 'Technical support: 2 years (required)' counts as years asked", () => {
  assert.deepEqual(A.yearsAsked('Experience:\nTechnical support: 2 years (required)\nWork Location: In person'), { years: 2, preferred: false, text: 'Technical support: 2 years (required)' });
  assert.equal(A.yearsAsked('IT support: 1 year (preferred)').preferred, true);
});

test("'remote locations' and 'remote support' are not remote work", () => {
  assert.ok(!A.detectWorkTypes('Cameras for farms and remote locations. Provide remote and on-site support.').includes('Remote'));
  for (const t of ['Remote working available', 'Hybrid: 3 days office / 2 days remote', 'This is a fully remote role', 'Work from home'])
    assert.ok(A.detectWorkTypes(t).includes('Remote') || A.detectWorkTypes(t).includes('Hybrid'), t);
  assert.ok(!A.detectWorkTypes('Contract: Permanent').includes('Contract'));
  assert.ok(A.detectWorkTypes('Work Location: In person').includes('On-site'));
});

// ---------- 3.0.7: an apprenticeship closed to people with a higher qualification scored 87% 'Apply' ----------
test('an apprenticeship that excludes existing qualifications is a question, not Apply', () => {
  const an = A.analyze(job('IT Apprentice', '- Prospective apprentices must not hold an existing qualification at the same or higher level as this apprenticeship in a similar subject'), profile());
  assert.ok(an.chance.gates.asks.some(a => a.key === 'eligibility'));
  assert.notEqual(an.chance.verdict, 'apply');
});

test('paid traineeships with a "guaranteed offer" are not jobs', () => {
  const an = A.analyze(office('Trainee IT Support', ['We back our confidence in your job placement with a guaranteed offer for everyone who completes our IT Traineeship.', 'Step 1 Online study with 24/7 support from our mentors', 'Step 2 CV workshop followed by job interview with one of our recruitment partners in your area.']), profile());
  assert.ok(an.chance.gates.blocks.some(b => b.key === 'not-a-job'));
});

// ---------- 3.0.8: Orpington counted as London, two hours from home ----------
test('a London office far from home asks about the journey; a hybrid one only notes it', () => {
  const p = profile({ areas: ['London', 'Hertfordshire', "Bishop's Stortford"] });
  assert.equal(A.homeOf(p).name, "Bishop's Stortford");
  const far = A.analyze({ ...job('IT Support Engineer', '- 1 year of IT support'), location: 'Orpington, Kent' }, p);
  assert.ok(far.chance.gates.asks.some(a => a.key === 'commute' && /km from Bishop's Stortford/.test(a.text)), JSON.stringify(far.chance.gates));
  assert.notEqual(far.chance.verdict, 'apply');
  const near = A.analyze({ ...job('IT Support Engineer', '- 1 year of IT support'), location: 'Islington, Greater London' }, p);
  assert.ok(!near.chance.gates.asks.some(a => a.key === 'commute'));
  const hybrid = A.analyze({ ...job('IT Support Engineer', '- 1 year of IT support\n- Hybrid: 3 days in the office'), location: 'Croydon' }, p);
  assert.ok(!hybrid.chance.gates.asks.some(a => a.key === 'commute'));
  const home = A.analyze({ ...job('IT Support Engineer', '- 1 year of IT support'), location: 'Croydon' }, { ...p, home: 'Croydon' });
  assert.ok(!home.chance.gates.asks.some(a => a.key === 'commute'), 'home set explicitly');
});

test('a time-limited right to work is ruled out only when the ad says so and the profile is set', () => {
  const ad = job('IT Support Analyst', '- Applicants must have the unrestricted right to work in the UK. Unfortunately, we cannot offer visa sponsorship or consider candidates with time-limited work permission for this position.');
  assert.ok(A.analyze(ad, profile({ timeLimitedRtw: true })).chance.gates.blocks.some(b => b.key === 'rtw'));
  assert.ok(!A.analyze(ad, profile()).chance.gates.blocks.some(b => b.key === 'rtw'));
  const soft = job('IT Support Analyst', '- You must have the unrestricted right to work in the UK.');
  const g = A.analyze(soft, profile({ timeLimitedRtw: true })).chance.gates;
  assert.ok(!g.blocks.some(b => b.key === 'rtw'));
  assert.ok(g.asks.some(b => b.key === 'rtw'));
});
