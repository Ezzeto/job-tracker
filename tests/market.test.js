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
  assert.match(get('Why are you'), /Harlow College's IT Technician/);
});
