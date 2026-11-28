'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Mk, A } = require('./helpers/env');

test('officeDays reads the office days an ad asks for', () => {
  assert.equal(Mk.officeDays('Hybrid working: 3 days a week in the office'), 3);
  assert.equal(Mk.officeDays('This is a hybrid role with two days per week in our London office.'), 2);
  assert.equal(Mk.officeDays('Hybrid (2 days) in Cambridge'), 2);
  assert.equal(Mk.officeDays('Fully remote role, UK based'), 0);
  assert.equal(Mk.officeDays('An office-based role in Harlow, Monday to Friday'), 5);
  assert.equal(Mk.officeDays('Great benefits and a friendly team'), null);
});

test('marketOf: part-time, weekends and term-time are market B; plain full-time is A', () => {
  assert.equal(Mk.marketOf({ title: 'IT Technician (term-time)', description: 'Term-time only, 30 hours a week' }), 'B');
  assert.equal(Mk.marketOf({ title: 'Service Desk Analyst', description: 'Full-time, Monday to Friday, 37.5 hours' }), 'A');
  assert.equal(Mk.marketOf({ title: 'Weekend IT Support', description: 'Saturday and Sunday shifts' }), 'B');
});

test('worthLeave needs a known company, the salary threshold and a path up', () => {
  const job = { title: 'IT Operations Specialist I', company: 'Cloudflare', description: 'Career progression into systems engineering', salary: A.parseSalary('£32,000 - £38,000') };
  assert.equal(Mk.worthLeave(job, {}).ok, true);
  assert.equal(Mk.worthLeave({ ...job, company: 'Local Builders Ltd' }, {}).ok, false);
  assert.equal(Mk.worthLeave({ ...job, salary: A.parseSalary('£24,000') }, {}).ok, false);
  assert.equal(Mk.worthLeave({ ...job, salary: null }, {}).ok, true, 'a listed company that does not state pay passes');
  assert.equal(Mk.worthLeave({ ...job, company: 'Acme' }, { bigTechList: ['Acme'] }).ok, true);
});

test('answers fill availability from work days and quote the advertised salary', () => {
  const p = { workDays: [0, 1, 2, 5], hoursPerWeek: 32, experienceYears: 1, pitch: 'a second-year Computing student who supports Microsoft 365 users' };
  const a = Mk.answers({ title: 'IT Technician', company: 'Harlow College', description: 'Part-time, 30 hours a week', salary: A.parseSalary('£24,000 - £26,000') }, p);
  const get = q => a.find(x => x.q.startsWith(q)).a;
  assert.equal(get('What is your availability'), 'Monday to Wednesday and Saturday, up to 32 hours a week, alongside my Computing degree');
  assert.match(get('What are your salary'), /£24,000–£26,000 pro rata/);
  assert.equal(get('Will you now'), 'No');
  assert.match(get('Why are you'), /The IT Technician role at Harlow College is the work I already do/);
  assert.doesNotMatch(get('Why are you'), /\[/);
});

test('broker: job boards posting under their own name and agencies hide the employer', () => {
  assert.equal(Mk.broker('DICE'), 'board');
  assert.equal(Mk.broker('CV-Library'), 'board');
  assert.equal(Mk.broker('Totaljobs'), 'board');
  assert.equal(Mk.broker('Hays Technology'), 'agency');
  assert.equal(Mk.broker('Acme Ltd', 'We are recruiting on behalf of our client, a school in Essex.'), 'agency');
  assert.equal(Mk.broker('Harlow College', 'Join our IT team.'), null);
  assert.equal(Mk.broker('Dicey Games Ltd'), null);
});

test('a role profile laid out as a form: title, company and the requirements list are read, not the broken lines', () => {
  const Q = require('../lib/quality.js'), F = require('../lib/fit.js');
  const pasted = 'Title\nLevel\nReports to\nJunior System Developer\nNT4\nDirector of Information\nBusiness: Harlow College\nLocation: Harlow, Essex\n\nBe the Expert (technical knowledge, qualifications,\nexperience, occupational competence & requirements, etc)\n1.\nLevel 2 Maths and English\n2.\nCompetent ICT at Level 3 or equivalent\n3.\nKnowledge of most up to date ILR data\nand funding rules/guidance.\n4.\nKnowledge of relational databases is\ndesirable.\n5.\nSound knowledge of Microsoft office.\n\nCritical Success Factors\n4. Achievement of annual Performance\nDevelopment Agreement (PDA), comprising:\n• The Core Values\n• Role Profile';
  assert.deepEqual(Q.recoverHeader(pasted), { company: 'Harlow College', location: 'Harlow, Essex', title: 'Junior System Developer' });
  const r = F.fromAd(pasted, 'Harlow College');
  assert.deepEqual(r.essential.slice(0, 4), ['Level 2 Maths and English', 'Competent ICT at Level 3 or equivalent', 'Knowledge of most up to date ILR data and funding rules/guidance.', 'Sound knowledge of Microsoft office.']);
  assert.deepEqual(r.desirable, ['Knowledge of relational databases is desirable.']);
  assert.ok(!r.essential.some(x => /^(The Core Values|Role Profile)$|comprising:$/.test(x)));
});

test('marketOf: an ad that never says part-time is full-time (A); your choice and the AI work type come first', () => {
  assert.equal(Mk.marketOf({ title: 'Junior System Developer', description: 'Support college systems through maintenance and development of information systems.' }), 'A');
  assert.equal(Mk.marketOf({ title: 'IT Technician', description: 'Part-time, 20 hours a week' }), 'B');
  assert.equal(Mk.marketOf({ title: 'IT Technician', description: 'Part-time, 20 hours a week', market: 'A' }), 'A');
  assert.equal(Mk.marketOf({ title: 'Junior System Developer', description: 'Support college systems.', workType: 'part-time' }), 'B');
  assert.equal(Mk.marketOf({ title: 'IT Technician', description: 'Term-time, 30 hours', workType: 'full-time' }), 'A');
});
