'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { P } = require('./helpers/env');

const AD = 'We are looking for a 1st Line IT Support Analyst to join our service desk. You will resolve tickets in ServiceNow, manage users in Active Directory and Microsoft 365, and build laptops with Intune. Please include a cover letter. '.repeat(2);
const FACTS = 'Freelance IT support, Sep 2018 – present: fixed home and small-office PCs, set up Wi-Fi and printers.\nHome lab: Windows Server AD, Entra ID, Intune, osTicket ticketing.';
const app = { title: '1st Line IT Support Analyst', company: 'Acme', description: AD, chance: { matched: ['Active Directory'], basic: ['Intune'], missing: ['ServiceNow'] } };

test('the prompt carries the ad, the fact bank and the no-invention rule', () => {
  const r = P.build(app, { factBank: FACTS, commercialYears: 0, signName: 'Oleh' });
  assert.ok(r.ok);
  assert.match(r.text, /Use ONLY facts from MY FACT BANK/);
  assert.match(r.text, /not yet held a paid IT job/);
  assert.ok(r.text.includes(FACTS));
  assert.match(r.text, /I do not have: ServiceNow/);
  assert.doesNotMatch(r.text, /Cover letter:/);
});

test('a cover letter needs your own reason for the employer', () => {
  assert.equal(P.build(app, { factBank: FACTS }, { letter: true }).ok, false);
  const r = P.build(app, { factBank: FACTS, signName: 'Oleh' }, { letter: true, why: 'Your team supports three hospitals and I want to work in healthcare IT.' });
  assert.ok(r.ok);
  assert.match(r.text, /150–200 words/);
  assert.match(r.text, /healthcare IT/);
});

test('missing fact bank or description is reported, not guessed', () => {
  assert.match(P.build(app, {}).error, /fact bank/);
  assert.match(P.build({ ...app, description: 'short' }, { factBank: FACTS }).error, /no job description/);
});

test('wantsLetter spots a request for a cover letter', () => {
  assert.ok(P.wantsLetter(AD));
  assert.ok(!P.wantsLetter('Apply with your CV.'));
});
