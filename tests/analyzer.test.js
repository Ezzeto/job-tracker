'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { A } = require('./helpers/env');

const profile = (over = {}) => ({ ...A.DEFAULT_PROFILE, ...over, skills: { ...(over.skills || {}) } });

test('extractTools finds software, data and AI skills', () => {
  const tools = A.extractTools('Build REST APIs in Python with FastAPI and PostgreSQL, test with pytest, deploy with Docker. Exposure to PyTorch and LLMs is a plus.');
  for (const t of ['Python', 'FastAPI', 'PostgreSQL', 'REST APIs', 'Unit testing', 'Docker', 'PyTorch', 'LLMs / RAG']) assert.ok(tools.includes(t), t);
});

test('extractTools keeps Java, JavaScript, C++ and C# apart', () => {
  assert.deepEqual(A.extractTools('Java').filter(t => /Java/.test(t)), ['Java']);
  assert.deepEqual(A.extractTools('JavaScript').filter(t => /Java/.test(t)), ['JavaScript']);
  assert.ok(A.extractTools('Modern C++ and C# (.NET 8)').includes('C++'));
  assert.ok(A.extractTools('Modern C++ and C# (.NET 8)').includes('C# / .NET'));
});

test('extractTools ignores common words that look like skills', () => {
  const tools = A.extractTools('Report RAG status weekly; the rest of the team will react quickly to feedback.');
  assert.ok(!tools.includes('LLMs / RAG'));
  assert.ok(!tools.includes('REST APIs'));
  assert.ok(!tools.includes('React'));
});

test('parseSalary reads ranges, k-suffixes and periods', () => {
  const y = A.parseSalary('£25,000 - £29,000 a year');
  assert.equal(y.min, 25000); assert.equal(y.max, 29000); assert.equal(y.period, 'year');
  const h = A.parseSalary('£14 - £16 per hour');
  assert.equal(h.period, 'hour'); assert.equal(h.annualMin, Math.round(14 * 37.5 * 52));
  const k = A.parseSalary('£30k per annum');
  assert.equal(k.min, 30000);
});

test('parseSalary in strict mode ignores money that is not pay', () => {
  assert.equal(A.parseSalary('We recently raised £5,000,000 in funding to grow the team.', true), null);
  const p = A.parseSalary('Salary: £24,000 per annum plus pension.', true);
  assert.equal(p.min, 24000);
});

test('detectCategory recognises intern titles', () => {
  assert.equal(A.detectCategory('Software Engineering Intern', ''), 'Software Developer');
  assert.equal(A.detectCategory('AI Engineer Intern', ''), 'AI / Machine Learning');
  assert.equal(A.detectCategory('1st Line IT Support Analyst', ''), 'IT Help Desk / Service Desk');
  assert.equal(A.detectCategory('Barista', 'Make great coffee'), 'Other');
});

test('detectWorkTypes drops On-site when the job is hybrid', () => {
  const wt = A.detectWorkTypes('Hybrid role, two days on-site in London. Full-time, permanent.');
  assert.ok(wt.includes('Hybrid')); assert.ok(!wt.includes('On-site')); assert.ok(wt.includes('Full-time'));
});

test('computeChance rewards matching skills and entry-level titles', () => {
  const ad = 'Requirements: strong Python, SQL and Git. Docker is essential.';
  const strong = A.computeChance('Junior Python Developer', ad, [], profile({ skills: { Python: 'strong', SQL: 'strong', Git: 'strong', Docker: 'strong' } }), 'London');
  const none = A.computeChance('Junior Python Developer', ad, [], profile(), 'London');
  assert.ok(strong.score > none.score + 30, `${strong.score} vs ${none.score}`);
  assert.deepEqual(none.keyMissing.sort(), ['Docker', 'Python', 'SQL'].sort());
});

test('computeChance flags senior roles and keeps the score in range', () => {
  const r = A.computeChance('Senior Software Engineer', '8+ years of experience with Java required. Security clearance (SC) required.', [], profile(), '');
  assert.equal(r.senior, true);
  assert.ok(r.score >= 3 && r.score <= 97);
});

test('computeChance lowers jobs outside your areas and flags them', () => {
  const p = profile({ areas: ['London'] });
  const away = A.computeChance('Graduate Developer', 'Python', ['On-site'], p, 'Manchester');
  const near = A.computeChance('Graduate Developer', 'Python', ['On-site'], p, 'London, UK');
  assert.equal(away.outArea, true); assert.equal(near.outArea, false);
  assert.ok(near.score > away.score);
});

test('target role types change the level points', () => {
  const ad = 'Python developer role.';
  const any = A.computeChance('Graduate Python Developer', ad, [], profile(), '');
  const itOnly = A.computeChance('Graduate Python Developer', ad, [], profile({ targetCategories: ['IT Help Desk / Service Desk'] }), '');
  assert.ok(any.score > itOnly.score);
  assert.match(itOnly.reasons.map(r => r.text).join('\n'), /not one of your target roles/);
});

test('language bonus applies only to languages you list', () => {
  const ad = 'Polish speaker preferred. Windows and Microsoft 365 support.';
  const yes = A.computeChance('IT Support Analyst', ad, [], profile({ languages: ['Polish'] }), '');
  const no = A.computeChance('IT Support Analyst', ad, [], profile({ languages: ['Ukrainian'] }), '');
  assert.equal(yes.score - no.score, 5);
});

test('extractSections splits requirements, nice-to-haves and benefits', () => {
  const s = A.extractSections(['Requirements:', '• Good knowledge of Python', '• Some SQL experience', 'Desirable:', '• Familiarity with Docker', 'Benefits', '• 25 days annual leave', '• Company pension scheme'].join('\n'));
  assert.deepEqual(s.requirements, ['Good knowledge of Python', 'Some SQL experience']);
  assert.deepEqual(s.desirable, ['Familiarity with Docker']);
  assert.deepEqual(s.benefits, ['25 days annual leave', 'Company pension scheme']);
  assert.match(A.buildNotes(s), /^Requirements:\n• Good knowledge of Python/);
});

test('every status has a label and colour', () => {
  for (const s of A.STATUSES) {
    assert.equal(A.statusLabel(s.id), s.label);
    assert.match(A.statusColor(s.id), /^#[0-9a-f]{6}$/i);
  }
});

test('parseSalary reads a range with the thousands written once', () => {
  const a = A.parseSalary('£26-28,000 per annum');
  assert.equal(a.min, 26000); assert.equal(a.max, 28000); assert.equal(a.annualMin, 26000);
  const b = A.parseSalary('£26-28k');
  assert.equal(b.min, 26000); assert.equal(b.max, 28000);
  const h = A.parseSalary('£13.50 - £15 per hour');
  assert.equal(h.min, 13.5); assert.equal(h.period, 'hour');
});

const SD = (extra) => `1st Line IT Support Analyst. You will support 300 users across Microsoft 365, Active Directory, Intune and Windows 11, log tickets in ServiceNow and escalate to 2nd line. ${extra} Full training on our systems. Salary £27,000 per annum. Hybrid, London.`;

test('commercial years decide the experience gate when set', () => {
  const two = { title: '1st Line Support Analyst', description: SD('You must have 2 years of experience in an IT support role.') };
  const oldWay = A.checkGates(two, profile({ experienceYears: 1 }), { level: { level: 'entry' }, years: { years: 2, preferred: false } });
  assert.ok(!oldWay.blocks.some(b => b.key === 'experience'));
  const honest = A.checkGates(two, profile({ experienceYears: 1, commercialYears: 0 }), { level: { level: 'entry' }, years: { years: 2, preferred: false } });
  assert.ok(honest.blocks.some(b => b.key === 'experience' && /paid IT job/.test(b.text)));
  assert.equal(A.myYearsOf(profile({ experienceYears: 3, commercialYears: '' })), 3);
  assert.equal(A.myYearsOf(profile({ experienceYears: 3, commercialYears: 0 })), 0);
});

test('previous IT support experience with no years stated is a question when you have none in a paid job', () => {
  const job = { title: '1st Line Support', description: SD('Previous experience in an IT support role is essential.') };
  const g = A.checkGates(job, profile({ commercialYears: 0 }), { level: { level: 'entry' } });
  assert.ok(g.asks.some(a => a.key === 'experience'));
  const pref = { title: '1st Line Support', description: SD('Previous experience in a service desk role is desirable.') };
  assert.ok(!A.checkGates(pref, profile({ commercialYears: 0 }), { level: { level: 'entry' } }).asks.some(a => a.key === 'experience'));
  assert.ok(!A.checkGates(job, profile({ commercialYears: 1 }), { level: { level: 'entry' } }).asks.some(a => a.key === 'experience'));
});

test('a job you are ruled out of shows no percentage', () => {
  const d = A.display({ verdict: 'skip', score: 62, confidence: 'high', gates: { blocks: [{ key: 'licence', text: 'x' }], asks: [] } });
  assert.equal(d.text, '✕');
  assert.equal(A.display({ verdict: 'skip', score: 30, confidence: 'high', gates: { blocks: [], asks: [] } }).text, '30%');
});
