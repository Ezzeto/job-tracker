'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { T, D, P } = require('./helpers/env');

// A fictional CV laid out the way pdf.js reads a two-column-free PDF: wrapped lines, bullets, caps headings
const CV = `Alex Example
IT Support Technician | Service Desk
Stevenage, Hertfordshire | 07000 000000 | alex@example.com
linkedin.com/in/alex-example | github.com/alex-example
PROFILE
IT support technician who fixes laptops, printers and accounts for small offices and home users across
Hertfordshire. Calm with customers after three years in retail. Runs a home lab with Windows Server and
Active Directory to practise service desk work. Available immediately.
KEY SKILLS
• Service desk: ticketing (osTicket), escalation, SLA targets, remote support (AnyDesk), customer
service
• Microsoft 365: users, licences, MFA, Outlook, Teams; Active Directory password resets
• Networking: TCP/IP, DNS, DHCP, Wi-Fi, routers and switches
EXPERIENCE
IT Support (Freelance)
Self-employed | Jan 2021 – Present
• Install and update business software and set up user accounts for a 4-PC office.
• Fix printers, Wi-Fi and router faults on site and remotely with AnyDesk.
• Reset passwords in Active Directory and Microsoft 365 and enforce MFA.
Sales Assistant
Example Retail Ltd | Mar 2020 – Dec 2022
• Served customers and handled complaints at a busy till.
EDUCATION
BSc Computing – Example University, 2024
– 2027
CompTIA A+ – studying, 2026`;

const JOB = { title: '1st Line Support Engineer - Hybrid (£27k)', company: 'Acme Ltd', url: 'https://example.com/job/1',
  description: 'Requirements:\n• Active Directory and Microsoft 365 administration, including password resets\n• Experience with ServiceNow\n• VPN troubleshooting\nYou will support 300 users, reset passwords in Active Directory, manage Microsoft 365 licences and escalate network issues. Printers too.' };

test('parse finds the header, sections, entries and wrapped lines', () => {
  const cv = T.parse(CV);
  assert.equal(cv.name, 'Alex Example');
  assert.equal(cv.headline, 'IT Support Technician | Service Desk');
  assert.equal(cv.contact.length, 2);
  assert.deepEqual(cv.sections.map(s => s.kind), ['summary', 'skills', 'experience', 'education']);
  assert.match(cv.sections[0].blocks[0].text, /across Hertfordshire\. Calm/);
  assert.match(cv.sections[1].blocks[0].text, /customer service$/);
  const exp = cv.sections[2].blocks;
  assert.equal(exp.length, 2);
  assert.deepEqual(exp[0].meta, ['Self-employed | Jan 2021 – Present']);
  assert.equal(exp[0].bullets.length, 3);
  assert.equal(cv.sections[3].blocks[0].text, 'BSc Computing – Example University, 2024 – 2027');
});

test('tailor reorders what is there and never adds unknown tools', () => {
  const cv = T.parse(CV);
  const { cv: out, report } = T.tailor(cv, JOB, { skills: { VPN: 'basic' } });
  assert.equal(out.headline, '1st Line Support Engineer');
  assert.match(out.sections[2].blocks[0].bullets[0], /Active Directory/);
  assert.match(out.sections[1].blocks[0].text, /^Microsoft 365: /);
  assert.ok(report.canAdd.includes('VPN'));
  assert.ok(out.sections[1].blocks.some(b => b.added && /VPN/.test(b.text)));
  assert.ok(report.gaps.includes('ServiceNow'));
  assert.doesNotMatch(T.toText(out), /ServiceNow/);
  // same words in, same words out (apart from the headline and the added line)
  const words = s => s.replace(/[^a-z0-9]+/gi, ' ').toLowerCase().split(' ').filter(Boolean).sort().join(' ');
  const body = c => T.toText({ ...c, headline: '', sections: c.sections.map(s => ({ ...s, blocks: s.blocks.filter(b => !b.added) })) });
  assert.equal(words(body(out)), words(body(cv)));
  assert.ok(report.coverAfter >= report.coverBefore);
});

test('the headline can stay as it was and added tools can be switched off', () => {
  const cv = T.parse(CV);
  const { cv: out } = T.tailor(cv, JOB, { skills: { VPN: 'basic' } }, { headline: false, addTools: [] });
  assert.equal(out.headline, cv.headline);
  assert.ok(!out.sections[1].blocks.some(b => b.added));
});

test('skill items are reordered inside a line, keeping brackets together', () => {
  const kws = T.keywords({ title: '', description: 'We use AnyDesk and SLA targets.' });
  assert.equal(T.reorderItems('Service desk: ticketing (osTicket, Jira), SLA targets, remote support (AnyDesk)', kws),
    'Service desk: SLA targets, remote support (AnyDesk), ticketing (osTicket, Jira)');
});

test('the Word file is a valid zip with the CV text in it', () => {
  const bytes = D.build(T.tailor(T.parse(CV), JOB, {}).cv);
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b);
  const s = Buffer.from(bytes).toString('utf8');
  assert.match(s, /word\/document\.xml/);
  assert.match(s, /Alex Example/);
  assert.equal(D.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  assert.equal(T.fileName({ name: 'Alex Example' }, JOB), 'Alex Example CV - Acme Ltd');
});

test('the AI prompt uses the uploaded CV when there is no fact bank', () => {
  const r = P.build({ ...JOB, description: JOB.description.repeat(2) }, {}, { cvText: CV });
  assert.ok(r.ok);
  assert.match(r.text, /Alex Example/);
});
