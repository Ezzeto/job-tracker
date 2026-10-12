'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { A, F, L } = require('./helpers/env');

const BRIEFING = `KEY DETAILS
* Placement semester dates: 25 January – 28 May 2027
* Length: at least 12 weeks, covering the whole semester
* Hours: normally full-time, 35–40 hrs/week, Mon–Fri
* Computing students: 4 days per week, not 5
* Overseas company + you live in the UK = must be fully remote
* Paid internships are allowed and recommended
KEY DEADLINES
* 18 November – submit your internship on the placement platform (final deadline)
* 27 November – employer completes their risk assessment form
* 4 December – you complete the student risk assessment form`;

function profileWithRules() {
  const p = JSON.parse(JSON.stringify(A.DEFAULT_PROFILE));
  p.areas = ['London', 'Hertfordshire'];
  Object.assign(p.intern.placement, A.parsePlacementRules(BRIEFING, '2026-10-12'));
  p.intern.targetCategories = ['AI / Machine Learning', 'Software Developer', 'Data / Analyst'];
  p.intern.priorityCategories = ['AI / Machine Learning', 'Software Developer'];
  p.intern.skills = { Python: 'strong', Git: 'strong', SQL: 'basic' };
  return p;
}

test('parsePlacementRules reads dates, length, hours, days and deadlines from a briefing', () => {
  const r = A.parsePlacementRules(BRIEFING, '2026-10-12');
  assert.equal(r.start, '2027-01-25');
  assert.equal(r.end, '2027-05-28');
  assert.equal(r.minWeeks, 12);
  assert.deepEqual([r.minHours, r.maxHours, r.daysPerWeek], [35, 40, 4]);
  assert.equal(r.overseasRemoteOnly, true);
  assert.equal(r.paidPreferred, true);
  assert.deepEqual(r.deadlines.map(d => d.date), ['2026-11-18', '2026-11-27', '2026-12-04']);
  assert.match(r.deadlines[0].label, /^submit your internship/);
});

test('parsePlacementRules returns nothing for unrelated text', () => {
  assert.deepEqual(A.parsePlacementRules('We sell coffee in London.'), {});
});

test('detectInternship spots internship titles and descriptions', () => {
  assert.equal(A.detectInternship('AI Engineering Intern', ''), true);
  assert.equal(A.detectInternship('Industrial Placement – Software', ''), true);
  assert.equal(A.detectInternship('Python Developer', 'Join this 12-week internship programme'), true);
  assert.equal(A.detectInternship('1st Line IT Support Analyst', 'Windows 11 and printers'), false);
});

test('a January internship in London passes the placement rules', () => {
  const an = A.analyze({ title: 'AI Engineering Intern', location: 'London', description: '16-week internship starting 25 January 2027. Develop and deploy machine learning models with Python and PyTorch, build REST APIs, analyse data and write unit tests. Full-time, 37.5 hours per week. Paid £24,000 pro rata. Open to penultimate year undergraduates.' }, profileWithRules());
  assert.equal(an.track, 'intern');
  assert.equal(an.placement.verdict, 'ok');
  assert.equal(an.placement.items.find(i => i.key === 'weeks').state, 'ok');
  assert.ok(an.chance.reasons.some(r => /priority/.test(r.text)));
});

test('summer internships, overseas offices and non-technical roles break the rules', () => {
  const p = profileWithRules();
  const summer = A.analyze({ title: 'Software Engineer Intern (Summer 2027)', location: 'London', description: 'Our 10-week summer internship runs June to August 2027.' }, p);
  assert.equal(summer.placement.items.find(i => i.key === 'dates').state, 'fail');
  const berlin = A.analyze({ title: 'Python Developer Intern', location: 'Berlin, Germany', description: 'Internship starting February 2027 in our Berlin office.' }, p);
  assert.equal(berlin.placement.items.find(i => i.key === 'location').state, 'fail');
  const marketing = A.analyze({ title: 'Marketing Intern', location: 'London', description: 'Assist with various tasks, social media posting, filing and data entry.' }, p);
  assert.equal(marketing.placement.items.find(i => i.key === 'relevance').state, 'fail');
  const good = A.analyze({ title: 'AI Engineering Intern', location: 'London', description: '16-week internship starting 25 January 2027 building machine learning models in Python.' }, p);
  for (const bad of [summer, berlin, marketing]) assert.ok(bad.chance.score < good.chance.score, bad.chance.score + ' < ' + good.chance.score);
});

test('internships use the internship skills, jobs keep the job skills', () => {
  const p = profileWithRules();
  p.skills = { 'Windows 10/11': 'strong' };
  const job = A.analyze({ title: '1st Line IT Support', description: 'Windows 11 and Python.' }, p);
  assert.equal(job.track, 'job');
  assert.ok(job.chance.matched.includes('Windows 10/11'));
  assert.ok(!job.chance.matched.includes('Python'));
  const intern = A.analyze({ title: 'Software Intern', description: 'Windows 11 and Python.' }, p);
  assert.ok(intern.chance.matched.includes('Python'));
  assert.ok(!intern.chance.matched.includes('Windows 10/11'));
});

test('without placement rules an internship is scored but not checked', () => {
  const p = JSON.parse(JSON.stringify(A.DEFAULT_PROFILE));
  const an = A.analyze({ title: 'Data Analyst Intern', description: 'SQL and Python.' }, p);
  assert.equal(an.track, 'intern');
  assert.equal(an.placement, null);
});

test('internship follow-ups mention the placement period and the next deadline', () => {
  const p = profileWithRules();
  p.signName = 'Alex Doe';
  p.intern.highlights = 'I build Python projects.';
  const app = { track: 'intern', title: 'AI Intern', company: 'Acme', followUps: [], chance: { matched: ['Python'], basic: [] } };
  const email = F.build(app, 'email', { name: 'Sam Lee' }, p, new Date('2026-10-12')).body;
  assert.match(email, /25 January 2027 to 28 May 2027, 4 days a week/);
  assert.match(email, /by 18 November 2026/);
  const note = F.build(app, 'linkedin', { name: 'Sam Lee' }, p, new Date('2026-10-12')).body;
  assert.ok(note.length <= F.LI_LIMIT);
  const jobEmail = F.build({ ...app, track: 'job' }, 'email', { name: 'Sam Lee' }, p, new Date('2026-10-12')).body;
  assert.doesNotMatch(jobEmail, /placement would run/);
});

test('legacy: placement data from the 1.8 test build is migrated', () => {
  const p = { intern: { skills: {}, ap: { start: '2027-01-25', end: '2027-05-28', minWeeks: 12, minHours: 35, maxHours: 40, daysPerWeek: 4, deadline: '2026-11-18', priority: ['Software Developer'], targets: ['Software Developer'] } } };
  assert.equal(L.migrateProfile(p), true);
  assert.equal(p.intern.placement.start, '2027-01-25');
  assert.equal(p.intern.placement.deadlines[0].date, '2026-11-18');
  assert.deepEqual(p.intern.priorityCategories, ['Software Developer']);
  assert.equal(p.intern.ap, undefined);
  const a = { ap: { verdict: 'ok', items: [] } };
  assert.equal(L.migrateApp(a, null, null), true);
  assert.equal(a.placement.verdict, 'ok');
});

test('checkPlacement reads month ranges, "(14 weeks)" and technical duties written as -ing words', () => {
  const p = profileWithRules();
  const job = { title: 'AI Engineering Intern (Spring 2027)', location: 'Remote', salaryText: '£22,000',
    description: 'Spring internship, February 2027 to May 2027 (14 weeks), 37.5 hours per week, fully remote. ' +
      'Requirements: Python and SQL, Git, some PyTorch. Paid: £22,000 pro rata. Currently studying Computer Science. ' +
      'You will join our applied AI team, building retrieval tools and evaluation pipelines for language models, writing tests and documentation, and presenting your work to the wider engineering group every fortnight.' };
  const r = A.checkPlacement(job, p);
  const st = k => (r.items.find(i => i.key === k) || {}).state;
  assert.equal(st('dates'), 'ok');
  assert.equal(st('weeks'), 'ok');
  assert.equal(st('level'), 'ok');
  assert.notEqual(r.verdict, 'fail');
  assert.equal(A.parsePlacementRules('Minimum length 12 weeks.').minWeeks, 12);
});
