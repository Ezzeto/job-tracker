// The panel on a job site end to end: a Reed job page (mocked) with an AI key and a mocked AI. Checks that the
// AI reads the requirements, the precise Fit replaces the number, and the letter, answers and "For tonight" work.
// Usage: node tests/e2e/panel.js [screenshot-dir]   (Playwright with Chromium; not run in CI)
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const EXT = path.join(__dirname, '..', '..');
const OUT = process.argv[2];
const wait = ms => new Promise(r => setTimeout(r, ms));

const AD = `IT Support Technician (Part-time, 3 days a week)
Harlow College is looking for a friendly IT Support Technician to join our college IT team, term-time, 24 hours a week over 3 days.

Essential:
- Experience supporting Microsoft 365 and Active Directory users
- Windows 10/11 troubleshooting and imaging
- Excellent customer service and communication skills
- Logging and resolving tickets in a service desk system

Desirable:
- Intune or SCCM
- ITIL Foundation

Hybrid: 2 days a week on site in Harlow. Salary £24,000 - £26,500 pro rata. Please answer: Why do you want to work in education?`;
const PAGE = `<!doctype html><html><head><title>IT Support Technician - Harlow College - Reed.co.uk</title>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'JobPosting', title: 'IT Support Technician', hiringOrganization: { '@type': 'Organization', name: 'Harlow College' }, jobLocation: { '@type': 'Place', address: { addressLocality: 'Harlow' } }, employmentType: 'PART_TIME', description: AD.replace(/\n/g, '<br>') })}</script></head>
<body><h1>IT Support Technician</h1><p>Harlow College</p><div class="description">${AD.replace(/\n/g, '<br>')}</div><button>Apply now</button></body></html>`;

(async () => {
  const ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1280, height: 900 }, deviceScaleFactor: OUT ? 2 : 1 });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  await ctx.route('https://www.reed.co.uk/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  // The service worker's own fetches are not routed by the context: the AI is mocked inside it
  await sw.evaluate(() => {
    const extract = { essential: ['Experience supporting Microsoft 365 and Active Directory users', 'Windows 10/11 troubleshooting and imaging', 'Excellent customer service and communication skills', 'Logging and resolving tickets in a service desk system', 'Five years of Kubernetes administration'], desirable: ['Intune or SCCM', 'ITIL Foundation'], officeDays: 2, level: 'junior', agency: false, employer: null, questions: ['Why do you want to work in education?'] };
    const real = self.fetch.bind(self);
    self.fetch = async (url, opts) => {
      if (!/api\.groq\.com/.test(String(url))) return real(url, opts);
      const body = JSON.parse(opts.body);
      const sys = body.messages[0].content;
      const content = body.response_format ? JSON.stringify(/tells about the employer/.test(sys) ? { about: ['Further education college in Harlow', 'The IT team supports staff and students'], offers: ['Training', 'Pension'], why: 'I would like to support staff and students at a college where IT keeps teaching running.' } : extract) : /cover letters/.test(body.messages[0].content) ? 'Dear Hiring Manager,\n\nI am applying for the IT Support Technician role at Harlow College.\n\nI support Microsoft 365 and Active Directory users.' : 'Because supporting staff and students is work I enjoy.';
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  });
  await sw.evaluate(async () => {
    const p = (await chrome.storage.local.get('profile')).profile || {};
    await chrome.storage.local.set({
      profile: { ...p, lang: 'ru', skills: { 'Microsoft 365': 'strong', 'Active Directory': 'strong', 'Windows 10/11': 'strong', Intune: 'basic', osTicket: 'basic', Ticketing: 'basic' }, evidence: { Intune: 'lab', osTicket: 'lab', Ticketing: 'lab' }, targets: { B: 7, A: 8, C: 3 }, workDays: [0, 1, 2, 5], signName: 'Test Person' },
      llmCfg: { key: 'gsk_test' }, cvs: { job: { text: 'Test Person\nIT Support\n\nPROFILE\nComputing student supporting Microsoft 365 users.\n\nSKILLS\n• Microsoft 365, Active Directory, Windows 11\n\nEXPERIENCE\nFreelance IT Support | 2024 – present\n• Reset passwords in Active Directory for 20 users\n• Fixed Wi-Fi and printer faults\n\nEDUCATION\nBSc Computing' } },
    });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.stack || e)));
  await page.goto('https://www.reed.co.uk/jobs/it-support-technician/56123456'); await wait(3500);
  const badge = await page.textContent('#job-tracker-host >> css=.badge').catch(() => 'NO BADGE');
  console.log('badge:', badge.replace(/\s+/g, ' '));
  await page.click('#job-tracker-host >> css=.badge'); await wait(2500);
  const H = '#job-tracker-host >> css=';
  const txt = async sel => (await page.textContent(H + sel)).replace(/\s+/g, ' ').trim();
  console.log('score card:', await txt('[data-score]'));
  console.log('analysis:', (await txt('[data-pane]')).slice(0, 220));
  if (OUT) await page.screenshot({ path: path.join(OUT, 'panel.png') });
  await page.click(H + '[data-tab="sk"]'); await wait(300);
  console.log('skills:', (await txt('[data-pane]')).slice(0, 160));
  await page.click(H + '[data-tab="job"]'); await wait(1200);
  console.log('job:', (await txt('[data-co]')).slice(0, 160));
  await page.click(H + '[data-tab="app"]'); await wait(300);
  console.log('application:', (await txt('[data-pane]')).slice(0, 120));
  await page.click(H + '[data-tab="doc"]'); await wait(1200);
  console.log('why (from the ad):', await page.inputValue(H + '#why'));
  await page.click(H + '[data-act="letter"]'); await wait(1500);
  const letter = await page.inputValue(H + '[data-out] textarea');
  console.log('letter:', letter.slice(0, 90).replace(/\n/g, ' '), '| placeholders:', /\[/.test(letter));
  if (OUT) await page.screenshot({ path: path.join(OUT, 'panel-letter.png') });
  await page.click(H + '[data-act="answers"]'); await wait(1500);
  console.log('answers:', await page.$$eval(H + '[data-out] .qa b', l => l.map(x => x.textContent).join(' | ')));
  await page.click(H + '[data-act="later"]'); await wait(2500);
  const st = await sw.evaluate(async () => { const s = await chrome.storage.local.get(['sessionItems', 'packs']); return { items: (s.sessionItems || []).length, pack: Object.values(s.packs || {})[0] }; });
  console.log('session:', st.items, '| pack:', st.pack && st.pack.status, st.pack && st.pack.cv && st.pack.cv.name, '| letter AI:', st.pack && st.pack.letterAi);
  // Applied by hand, then "I did not apply" takes it back out
  await page.click(H + '[data-tab="app"]'); await wait(300);
  await page.click(H + '[data-act="applied"]'); await wait(2000);
  console.log('after "I applied":', (await txt('.hd')).slice(0, 60), '| apps:', await sw.evaluate(async () => ((await chrome.storage.local.get('apps')).apps || []).length));
  await page.fill(H + '#salaryText', '£25,000'); await page.selectOption(H + '#status', 'screening'); await page.click(H + '#save'); await wait(800);
  console.log('history:', (await txt('ul.hist')).slice(0, 120));
  await page.click(H + '[data-undo]'); await wait(800);
  console.log('after undo:', await sw.evaluate(async () => { const a = (await chrome.storage.local.get('apps')).apps[0]; return a.status + ' ' + a.salaryText; }));
  if (OUT) await page.screenshot({ path: path.join(OUT, 'panel-app.png') });
  page.once('dialog', d => d.accept());
  await page.click(H + '#undo'); await wait(800);
  console.log('after "I did not apply": apps', await sw.evaluate(async () => ((await chrome.storage.local.get('apps')).apps || []).length));
  // LinkedIn-style header: pay and work type only in the chips above the ad
  const LI = `<!doctype html><html><head><meta charset="utf-8"><title>Service Desk Analyst | Saragossa | LinkedIn</title></head><body><main>
<div class="job-details-jobs-unified-top-card__container--two-pane"><div><a>Saragossa</a></div><h1>Service Desk Analyst - Wealth Management - £35,000</h1>
<div class="job-details-jobs-unified-top-card__tertiary-description-container"><span>London Area, United Kingdom · Reposted 1 week ago · Over 100 applicants</span></div>
<div class="job-details-fit-level-preferences"><button>35K GBP/yr + Bonus</button><button>Hybrid</button><button>Full-time</button></div></div>
<div class="jobs-description__content"><div id="job-details"><h2>About the job</h2>${'A wealth management firm is looking for a Service Desk Analyst to support users across the business. You will resolve Microsoft 365, Active Directory and Windows issues, log tickets and help with onboarding. Experience in first line support is essential. '.repeat(3)}</div></div></main></body></html>`;
  await ctx.route('https://www.linkedin.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: LI }));
  const li = await ctx.newPage(); li.on('pageerror', e => errors.push('linkedin: ' + e));
  await li.goto('https://www.linkedin.com/jobs/view/4123456789/'); await wait(3500);
  await li.click(H + '.badge').catch(() => {}); await wait(2000);
  console.log('linkedin facts:', (await li.textContent(H + '[data-facts]').catch(() => 'NO PANEL')).replace(/\s+/g, ' ').trim());
  if (OUT) await li.screenshot({ path: path.join(OUT, 'panel-linkedin.png') });
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
  await ctx.close();
  process.exit(errors.length ? 1 : 0);
})();
