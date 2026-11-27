'use strict';
// Pure helpers from google-sheets/Code.gs, loaded into a sandbox without the Apps Script services.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'google-sheets', 'Code.gs'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(code + '\n;this.G = { parseAlertHtml_, parseConfirmation_, tgShouldSend_, jobKey_ };', ctx);
const G0 = ctx.G;
// Arrays and objects from the sandbox have its own prototypes: compare plain copies
const G = new Proxy({}, { get: (o, k) => (...a) => JSON.parse(JSON.stringify(G0[k](...a))) });

test('alert emails: job links from LinkedIn, Indeed and Reed with title and the text after it', () => {
  const html = `<table><tr><td><a href="https://www.linkedin.com/comm/jobs/view/4123456789/?trackingId=x&amp;refId=y">IT Support Technician</a></td></tr>
    <tr><td>Harlow College · Harlow, England, United Kingdom</td></tr>
    <tr><td><a href="https://www.linkedin.com/comm/jobs/view/4123456789/">View job</a></td></tr>
    <a href="https://uk.indeed.com/rc/clk/dl?jk=0123456789abcdef&amp;from=ja">Service Desk Analyst</a><p>Acme Ltd</p><p>Cambridge</p>
    <a href="https://www.reed.co.uk/jobs/1st-line-support/53123456?source=alert">1st Line Support</a> Reed Recruitment - Stansted
    <a href="https://www.linkedin.com/comm/jobs/search">See all jobs</a></table>`;
  const r = G.parseAlertHtml_(html);
  assert.deepEqual(r.map(x => x.key), ['li4123456789', 'in0123456789abcdef', 're53123456']);
  assert.equal(r[0].title, 'IT Support Technician');
  assert.equal(r[0].url, 'https://www.linkedin.com/jobs/view/4123456789/');
  assert.match(r[0].after, /^Harlow College/);
  assert.equal(r[1].url, 'https://uk.indeed.com/viewjob?jk=0123456789abcdef');
  assert.match(r[1].after, /Acme Ltd/);
});

test('confirmation emails: company and title from LinkedIn, Indeed and an employer', () => {
  const li = G.parseConfirmation_('Oleh, your application was sent to Cloudflare', 'LinkedIn <jobs-noreply@linkedin.com>', 'Your application was sent to Cloudflare. IT Operations Specialist I');
  assert.equal(li.company, 'Cloudflare'); assert.equal(li.platform, 'LinkedIn');
  const ind = G.parseConfirmation_('Indeed Application: IT Support Technician', 'Indeed <indeedapply@indeed.com>', 'Your application has been submitted to Hertford Regional College.');
  assert.equal(ind.title, 'IT Support Technician');
  const emp = G.parseConfirmation_('Thank you for applying', 'Harlow College Recruitment <recruitment@harlow-college.ac.uk>', 'Dear Oleh, thank you for your application for the position of IT Technician at Harlow College. We will be in touch.');
  assert.equal(emp.title, 'IT Technician');
  assert.equal(emp.company, 'Harlow College');
});

test('Telegram: quiet at night, only invitations and offers during Thursday and Friday classes, rejections never alone', () => {
  assert.equal(G.tgShouldSend_({ kind: 'interview' }, 23, 2), false);
  assert.equal(G.tgShouldSend_({ kind: 'interview' }, 11, 4), true);
  assert.equal(G.tgShouldSend_({ kind: 'employer' }, 11, 4), false);
  assert.equal(G.tgShouldSend_({ kind: 'employer' }, 18, 4), true);
  assert.equal(G.tgShouldSend_({ kind: 'rejected', human: true }, 12, 1), false);
  assert.equal(G.tgShouldSend_({ kind: 'vacancy' }, 9, 6), true);
});
