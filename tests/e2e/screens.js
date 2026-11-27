// README screenshots, in English, with invented companies and demo data.
// Extension: the panel on a job page (three tabs), the popup, the Progress page with the assistant,
// applications, CV & skills, settings, the application session and a form after autofill.
// Web app: phone (Today, checking a job, statistics, CV & skills) and the same app on a laptop.
// Usage: node tests/e2e/screens.js [out-dir, default docs/images]   (Playwright with Chromium)
'use strict';
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const OUT = process.argv[2] || path.join(ROOT, 'docs', 'images');
const TMP = path.join(OUT, '.raw');
fs.mkdirSync(TMP, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
// A whole page as one picture with the sidebar reaching the bottom: the window is made as tall as the page
const tall = async (pg, file) => { const h = await pg.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)); const w = pg.viewportSize().width; await pg.setViewportSize({ width: w, height: Math.min(h, 4000) }); await wait(300); await pg.screenshot({ path: file }); await pg.setViewportSize({ width: w, height: 900 }); };
const now = Date.now(), iso = d => new Date(now - d * 864e5).toISOString(), day = d => iso(d).slice(0, 10);
const errors = [], russian = [];
// Any Russian left on the page (the page, the job-page panel and the autofill window) is reported
const cyr = async (pg, name) => { const t = await pg.evaluate(() => { const parts = [document.body.innerText]; document.querySelectorAll('#job-tracker-host, [data-jt-panel]').forEach(h => h.shadowRoot && parts.push(h.shadowRoot.textContent)); return parts.join('\n'); }); const m = t.match(/[А-Яа-яЁё][^\n]{0,60}/g); if (m) russian.push(name + ': ' + [...new Set(m)].slice(0, 6).join(' | ')); };

const AD = `IT Support Technician (Part-time, 3 days a week)
Northgate College is looking for a friendly IT Support Technician to join our college IT team, term-time, 24 hours a week over 3 days. You will support staff and students across two campuses.

Essential:
- Experience supporting Microsoft 365 and Active Directory users
- Windows 10/11 troubleshooting and imaging
- Excellent customer service and communication skills
- Logging and resolving tickets in a service desk system

Desirable:
- Intune or SCCM
- ITIL Foundation

What we offer: training and certifications funded by the college, 27 days holiday plus bank holidays, a pension scheme.
Hybrid: 2 days a week on site in Hertford. Salary £24,000 - £26,500 pro rata. Please answer: Why do you want to work in education?`;
const JOB_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>IT Support Technician - Northgate College - Reed.co.uk</title>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'JobPosting', title: 'IT Support Technician', hiringOrganization: { '@type': 'Organization', name: 'Northgate College' }, jobLocation: { '@type': 'Place', address: { addressLocality: 'Hertford' } }, employmentType: 'PART_TIME', datePosted: day(2), description: AD.replace(/\n/g, '<br>') })}</script>
<style>body{font:15px/1.6 Arial,sans-serif;margin:0;color:#222}header{background:#d6002f;color:#fff;padding:14px 32px;font-weight:700;font-size:20px}main{max-width:760px;margin:24px 32px}h1{font-size:28px;margin:0 0 4px}.meta{color:#555;margin-bottom:16px}.desc{white-space:pre-wrap}button{background:#d6002f;color:#fff;border:0;border-radius:6px;padding:12px 26px;font-size:16px;margin-top:16px}</style></head>
<body><header>reed.co.uk</header><main><h1>IT Support Technician</h1><div class="meta">Northgate College · Hertford · £24,000 - £26,500 pro rata · Part-time · Posted 2 days ago</div><div class="description desc">${AD}</div><button>Apply now</button></main></body></html>`;
const FORM = `<!doctype html><html><head><meta charset="utf-8"><title>Apply: IT Support Technician at Northgate College</title>
<style>body{font:15px/1.5 Arial,sans-serif;max-width:640px;margin:24px 40px;color:#222}label,legend{display:block;margin-top:12px;font-weight:600}input,select,textarea{width:100%;padding:8px;border:1px solid #bbb;border-radius:4px;font:inherit;box-sizing:border-box}input[type=radio],input[type=checkbox]{width:auto}fieldset{border:0;padding:0}button{margin-top:16px;background:#1a7f5a;color:#fff;border:0;border-radius:4px;padding:10px 22px;font-size:15px}</style></head><body>
<h1>IT Support Technician</h1><p>Northgate College · Greenhouse</p>
<form onsubmit="event.preventDefault()">
  <label for="fn">First Name *</label><input id="fn"><label for="ln">Last Name *</label><input id="ln">
  <label for="em">Email *</label><input id="em" type="email"><label for="ph">Phone</label><input id="ph" type="tel">
  <label for="li">LinkedIn Profile</label><input id="li"><label for="cv">Resume/CV</label><input id="cv" type="file">
  <label for="cl">Cover Letter</label><textarea id="cl" rows="5"></textarea>
  <fieldset><legend>Do you have the right to work in the UK?</legend><label style="font-weight:400"><input type="radio" name="rtw"> Yes</label><label style="font-weight:400"><input type="radio" name="rtw"> No</label></fieldset>
  <label for="sp">Will you require visa sponsorship?</label><select id="sp"><option value="">Select…</option><option>Yes</option><option>No</option></select>
  <label for="why">Why do you want to work in education?</label><textarea id="why" rows="3"></textarea>
  <label style="font-weight:400"><input type="checkbox"> I agree to the privacy policy</label>
  <button type="submit">Submit application</button></form></body></html>`;
const CV = "Alex Morgan\nIT Support\n\nPROFILE\nSecond-year Computing student supporting Microsoft 365 users for small businesses. Available 3 days a week.\n\nSKILLS\n• Windows 11, Microsoft 365, Active Directory, Intune, osTicket\n\nEXPERIENCE\nFreelance IT Support | Self-employed | 2024 – present\n• Reset passwords and unlocked accounts in Active Directory for 20 users\n• Fixed Wi-Fi and printer faults on site and remotely\n• Set up Intune policies for new laptops\n\nCustomer Service Assistant | High Street Café | 2022 – 2025\n• Served around 250 customers a shift\n• Trained 12 new staff\n\nEDUCATION\nBSc Computing, second year";

// The AI is mocked: answers are fixed English text, so the screenshots never depend on a live model
const AI = body => {
  const sys = (body.messages[0] || {}).content || '';
  if (body.response_format) {
    if (/tells about the employer/.test(sys)) return JSON.stringify({ about: ['A further education college with two campuses in Hertfordshire', 'The IT team supports around 900 staff and students'], offers: ['Funded training and certifications', '27 days holiday plus bank holidays', 'Pension scheme'], why: 'I would like to help staff and students at a college where reliable IT keeps teaching running.' });
    if (/job search tracker/.test(sys)) return JSON.stringify({ filter: { text: 'college' }, groupBy: null, show: 'count' });
    return JSON.stringify({ essential: ['Experience supporting Microsoft 365 and Active Directory users', 'Windows 10/11 troubleshooting and imaging', 'Excellent customer service and communication skills', 'Logging and resolving tickets in a service desk system'], desirable: ['Intune or SCCM', 'ITIL Foundation'], officeDays: 2, level: 'junior', agency: false, employer: null, questions: ['Why do you want to work in education?'] });
  }
  if (/cover letters/.test(sys)) return 'Dear Hiring Manager,\n\nI would like to help staff and students at Northgate College, where reliable IT keeps teaching running, and I am applying for the IT Support Technician role.\n\nAs a freelance IT support technician I administer Microsoft 365 users and licences, reset passwords and unlock accounts in Active Directory, and fix Windows, Wi-Fi and printer faults on site and remotely. In my home lab I enrol devices in Intune and log and close tickets in osTicket.\n\nThree years in customer service taught me to stay patient and explain things clearly, which matters on a busy service desk.\n\nI can work three days a week alongside my Computing degree and can start immediately.';
  if (/5–8 tasks/.test(sys)) return '- Monday: 3 market B applications to colleges and schools\n- Tuesday: follow up Northgate College and Riverside High School\n- Wednesday: 2 market B applications with a tailored CV\n- Saturday: 3 cold emails to employers nearby\n- Sunday: the Jira home lab task (about 2 hours)';
  if (/job search coach/.test(sys)) return 'Today: send the follow-up to Riverside High School (6 working days without a reply) and two market B applications — you are 4 short of this week\'s target. Direct applications have answered 3 times more often than agencies, so start with the college jobs.';
  if (/Answer interview|application form|form question|question/i.test(sys)) return 'Because supporting staff and students is work I enjoy, and a college is a place where good IT support makes a visible difference every day.';
  return 'OK';
};

const APPS = () => {
  const d = 'Part-time IT support role, 3 days a week, term-time. Microsoft 365, Active Directory, Windows 11, Intune, Jira. Excellent customer service.';
  const mk = (i, title, company, status, days, extra = {}) => ({ id: 'a' + i, ticket: 'APP-' + String(200 + i).padStart(4, '0'), title, company, status, appliedAt: iso(days), history: [{ id: 'e' + i, at: iso(days), type: 'status', status: 'applied', by: 'me' }], workTypes: ['Part-time'], location: 'Hertfordshire', platform: 'LinkedIn', description: d, salaryText: '£24,000', chance: { score: 72, verdict: 'apply', label: 'Apply', tools: ['Microsoft 365', 'Active Directory', 'Jira', 'ServiceNow'], matched: ['Microsoft 365', 'Active Directory'], basic: [], missing: ['Jira', 'ServiceNow'], reasons: [] }, apply: { method: 'external', cover: 'tailored', cvTailored: true }, rev: 1, updatedAt: iso(days), ...extra });
  return [
    mk(1, 'IT Support Technician', 'Riverside High School', 'applied', 9),
    mk(2, 'IT Technician', 'Northgate College', 'screening', 18, { nextDate: day(-2), platform: 'Company website' }),
    mk(3, 'Service Desk Analyst', 'Brightline Recruitment', 'rejected', 25, { workTypes: ['Full-time'], apply: { method: 'easy apply', cover: 'none' } }),
    mk(4, '1st Line Support', 'Acme Systems', 'applied', 2),
    mk(5, 'IT Assistant', 'Hillcrest Academy', 'interview1', 30, { platform: 'Indeed' }),
    mk(6, 'Helpdesk Analyst', 'Kestrel Cloud', 'noresponse', 45, { workTypes: ['Full-time'] }),
    mk(7, 'Desktop Support', 'Oakfield Council', 'applied', 4, { platform: 'Indeed' }),
    mk(8, 'IT Support Apprentice', 'Westbrook School', 'rejected', 35, { platform: 'Reed' }),
    mk(9, 'Service Desk Technician', 'Harbour Hospital', 'applied', 1, { platform: 'Reed' }),
    mk(10, 'IT Technician (Weekends)', 'Meadow Retail', 'applied', 0),
  ];
};

async function extension() {
  const ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = sw.url().split('/')[2];
  await wait(2500);
  await ctx.route('https://www.reed.co.uk/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: JOB_PAGE }));
  await ctx.route('https://boards.greenhouse.io/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: FORM }));
  // pages call the AI themselves too (the session page builds packs)
  await ctx.route('https://api.groq.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: AI(JSON.parse(r.request().postData())) } }] }) }));
  await sw.evaluate(src => {
    const ai = eval('(' + src + ')');
    const real = self.fetch.bind(self);
    self.fetch = async (url, opts) => /api\.groq\.com/.test(String(url)) ? new Response(JSON.stringify({ choices: [{ message: { content: ai(JSON.parse(opts.body)) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }) : real(url, opts);
  }, AI.toString());
  await sw.evaluate(async ({ apps, CV }) => {
    const p = (await chrome.storage.local.get('profile')).profile || {};
    await chrome.storage.local.set({
      profile: { ...p, lang: 'en', skills: { 'Microsoft 365': 'strong', 'Active Directory': 'strong', 'Windows 10/11': 'strong', Intune: 'basic', osTicket: 'basic', Ticketing: 'basic', 'Customer service': 'strong' }, evidence: { Intune: 'lab', osTicket: 'lab', Ticketing: 'lab', 'Customer service': 'work' }, targets: { B: 7, A: 5, C: 3 }, workDays: [0, 1, 2, 5], studyDays: [3, 4], signName: 'Alex Morgan', areas: ['Hertfordshire', 'London'] },
      llmCfg: { key: 'gsk_demo' }, cvs: { job: { text: CV, name: 'Alex Morgan CV.pdf', at: new Date().toISOString() } }, apps,
      autofillMe: { firstName: 'Alex', lastName: 'Morgan', email: 'alex.morgan@example.com', phone: '+44 7700 900123', linkedin: 'https://www.linkedin.com/in/example', notice: 'Immediately', salaryB: '£12.50 an hour, pro rata' },
    });
  }, { apps: APPS(), CV });

  // ----- the panel on a job page -----
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push('job page: ' + e));
  await page.goto('https://www.reed.co.uk/jobs/it-support-technician/56123456'); await wait(4000);
  const H = '#job-tracker-host >> css=';
  await page.screenshot({ path: path.join(TMP, 'badge.png') }); await cyr(page, 'badge');
  await page.click(H + '.badge'); await wait(2500);
  await page.screenshot({ path: path.join(TMP, 'panel-analysis.png') }); await cyr(page, 'panel-analysis');
  await page.click(H + '[data-tab="sk"]'); await wait(400); await page.screenshot({ path: path.join(TMP, 'panel-skills.png') }); await cyr(page, 'panel-skills');
  await page.click(H + '[data-tab="job"]'); await wait(1500); await page.screenshot({ path: path.join(TMP, 'panel-job.png') }); await cyr(page, 'panel-job');
  await page.click(H + '[data-tab="doc"]'); await wait(1500);
  await page.click(H + '[data-act="letter"]'); await wait(1500);
  await page.evaluate(() => { const h = document.querySelector('#job-tracker-host').shadowRoot.querySelector('.jt'); h.scrollTop = 120; });
  await page.screenshot({ path: path.join(TMP, 'panel-letter.png') }); await cyr(page, 'panel-letter');
  await page.click(H + '[data-tab="app"]'); await wait(300);
  await page.click(H + '[data-act="applied"]'); await wait(2000);
  await page.selectOption(H + '#status', 'screening'); await page.fill(H + '#salaryText', '£25,000'); await page.click(H + '#save'); await wait(900);
  await page.evaluate(() => { const h = document.querySelector('#job-tracker-host').shadowRoot.querySelector('.jt'); h.scrollTop = h.scrollHeight; });
  await page.screenshot({ path: path.join(TMP, 'panel-application.png') }); await cyr(page, 'panel-application');
  // put the demo applications back (the one saved above is kept)
  const keep = await sw.evaluate(async () => (await chrome.storage.local.get('apps')).apps);
  await sw.evaluate(async apps => chrome.storage.local.set({ apps }), APPS().concat(keep.filter(a => a.company === 'Northgate College' && a.title === 'IT Support Technician')));

  // ----- popup -----
  const pop = await ctx.newPage(); await pop.setViewportSize({ width: 380, height: 560 });
  await pop.goto(`chrome-extension://${id}/popup.html`); await wait(1200);
  await pop.screenshot({ path: path.join(TMP, 'popup.png') }); await cyr(pop, 'popup'); await pop.close();

  // ----- dashboard -----
  const dash = await ctx.newPage(); dash.on('pageerror', e => errors.push('dashboard: ' + e));
  await dash.goto(`chrome-extension://${id}/dashboard.html#overview`); await wait(1800);
  await dash.click('#pgChatPanel [data-q]'); await wait(1500);
  await dash.fill('#chatQ', 'Make a plan for the week'); await dash.click('#chatGo'); await wait(1800);
  await tall(dash, path.join(TMP, 'progress.png')); await cyr(dash, 'progress');
  await dash.goto(`chrome-extension://${id}/dashboard.html#apps`); await wait(1200);
  await dash.screenshot({ path: path.join(TMP, 'applications.png') }); await cyr(dash, 'applications');
  await dash.click('#appsBody tr:nth-child(2) td:nth-child(3)'); await wait(1500);
  await dash.screenshot({ path: path.join(TMP, 'drawer.png') }); await cyr(dash, 'drawer');
  await dash.goto(`chrome-extension://${id}/dashboard.html#cv`); await wait(1500);
  await tall(dash, path.join(TMP, 'cv-skills.png')); await cyr(dash, 'cv-skills');
  await dash.goto(`chrome-extension://${id}/dashboard.html#settings`); await wait(1500);
  await tall(dash, path.join(TMP, 'settings.png')); await cyr(dash, 'settings');

  // ----- application session and autofill -----
  await sw.evaluate(async () => chrome.storage.local.set({ sessionItems: [
    { key: 'u:boards.greenhouse.io/northgate/jobs/1', title: 'IT Support Technician', company: 'Northgate College', url: 'https://boards.greenhouse.io/northgate/jobs/1', location: 'Hertford', platform: 'Company website', src: 'phone', description: 'Northgate College is looking for an IT Support Technician, part-time, 24 hours a week, term-time. Essential: Microsoft 365 and Active Directory support; Windows 10/11 troubleshooting; excellent customer service. Desirable: Intune, ITIL. Hybrid: 2 days a week on site. Please answer: Why do you want to work in education?' },
    { key: 'u:boards.greenhouse.io/riverside/jobs/2', title: 'IT Assistant (Term-time)', company: 'Riverside High School', url: 'https://boards.greenhouse.io/riverside/jobs/2', location: 'Ware', platform: 'LinkedIn', src: 'manual', description: 'Part-time IT assistant in a secondary school, 20 hours a week. Microsoft 365, Windows 11, printers and classroom AV. Excellent customer service.' } ] }));
  const sp = await ctx.newPage(); sp.on('pageerror', e => errors.push('session: ' + e));
  await sp.goto(`chrome-extension://${id}/session.html`); await wait(4500);
  await sp.click('[data-open]').catch(() => {}); await wait(400);
  await tall(sp, path.join(TMP, 'session.png')); await cyr(sp, 'session');
  const [form] = await Promise.all([ctx.waitForEvent('page'), sp.click('#start')]);
  form.on('pageerror', e => errors.push('form: ' + e));
  await form.setViewportSize({ width: 1440, height: 1000 });
  await form.waitForLoadState(); await wait(2000);
  await form.click('[data-jt-panel] >> css=#go');
  await wait(2000);
  await form.screenshot({ path: path.join(TMP, 'autofill.png') }); await cyr(form, 'autofill');
  await ctx.close();
}

async function webApp() {
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-app.js')]);
  const DIST = path.join(ROOT, 'dist-app');
  const browser = await chromium.launch();
  const rows = [
    { id: 'a1', ticket: 'APP-0211', title: 'IT Support Technician', company: 'Riverside High School', status: 'Applied', appliedAt: day(9), chance: 74, missing: 'Jira, ServiceNow', tools: 'Microsoft 365, Jira, ServiceNow', description: 'Part-time IT support, 3 days a week, term-time. Microsoft 365, Active Directory, Jira.', contacts: 'Sam Lee: s.lee@riverside.example', updated: 1 },
    { id: 'a2', ticket: 'APP-0212', title: 'IT Technician', company: 'Northgate College', status: 'Screening', appliedAt: day(18), chance: 81, nextDate: day(0), description: 'Part-time, 24 hours a week over 3 days.', missing: 'Jira', updated: 1 },
    { id: 'a3', ticket: 'APP-0213', title: 'Service Desk Analyst', company: 'Brightline Recruitment', status: 'Rejected', appliedAt: day(25), chance: 62, rejDays: 2, method: 'Easy Apply', description: 'Full-time, Monday to Friday.', updated: 1 },
    { id: 'a4', ticket: 'APP-0214', title: '1st Line Support', company: 'Acme Systems', status: 'Applied', appliedAt: day(2), chance: 70, description: 'Part-time 20 hours.', missing: 'ServiceNow', updated: 1 },
    { id: 'a5', ticket: 'APP-0215', title: 'IT Assistant', company: 'Hillcrest Academy', status: 'Interview 1', appliedAt: day(30), chance: 78, description: 'Term-time, part-time.', updated: 1 },
    { id: 'a6', ticket: 'APP-0216', title: 'Helpdesk Analyst', company: 'Kestrel Cloud', status: 'No response', appliedAt: day(45), chance: 58, description: 'Full-time role, 37.5 hours.', updated: 1 },
    { id: 'a7', ticket: 'APP-0217', title: 'Desktop Support', company: 'Oakfield Council', status: 'Applied', appliedAt: day(4), chance: 66, missing: 'Jira', description: 'Part-time 3 days.', updated: 1 },
    { id: 'a8', ticket: 'APP-0218', title: 'Service Desk Technician', company: 'Harbour Hospital', status: 'Applied', appliedAt: day(1), chance: 72, description: 'Part-time, weekends.', updated: 1 },
  ];
  const inbox = [{ id: 't1', kind: 'interview', subject: 'Interview invitation: IT Assistant', from: 'Jamie Hart', fromEmail: 'j.hart@hillcrest.example', date: new Date().toISOString(), rowId: 'a5', company: 'Hillcrest Academy', title: 'IT Assistant', human: true, link: 'https://mail.google.com/mail/#all/t1' },
    { id: 't2', kind: 'rejected', subject: 'Your application to Acme Systems', from: 'Acme Systems Careers', date: new Date().toISOString(), rowId: 'a4', company: 'Acme Systems', human: false, link: 'https://mail.google.com/mail/#all/t2' }];
  const alerts = [{ key: 'li4199', url: 'https://www.linkedin.com/jobs/view/4199/', title: 'IT Support Assistant (Part-time)', after: 'Eastfield College · Hertford', source: 'LinkedIn', date: new Date().toISOString() },
    { key: 're5311', url: 'https://www.reed.co.uk/jobs/5311', title: 'IT Technician — Term-time', after: 'Maple Grove School · Ware', source: 'Reed', date: new Date().toISOString() }];
  const route = async ctx => {
    await ctx.addInitScript(() => { try { localStorage.setItem('jt.lang', '"en"'); } catch (e) { /* */ } });
    await ctx.route('https://script.google.com/**', async r => {
      const req = r.request(), u = new URL(req.url()), a = u.searchParams.get('action');
      let body;
      if (req.method() === 'POST') body = { ok: true, version: 25, events: [] };
      else if (a === 'ping') body = { ok: true, version: 25, name: 'Job search', rows: rows.length };
      else if (a === 'profile') body = { ok: true, profile: { skills: { 'Microsoft 365': 'strong', 'Active Directory': 'strong', 'Windows 10/11': 'strong', Intune: 'basic' }, areas: ['Hertfordshire', 'London'], workDays: [0, 1, 2, 5], studyDays: [3, 4], targets: { B: 7, A: 5, C: 3 }, signName: 'Alex Morgan' } };
      else if (a === 'inbox') body = { ok: true, items: inbox, alerts, added: 0 };
      else if (a === 'employers') body = { ok: true, employers: [] };
      else if (a === 'fetchJob') body = { ok: true, url: u.searchParams.get('url'), html: JOB_PAGE };
      else body = { ok: true, rows };
      await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
    });
    await ctx.route('https://jt.example/**', r => {
      const f = new URL(r.request().url()).pathname.replace(/^\//, '') || 'index.html', p = path.join(DIST, f);
      if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: 'nf' });
      r.fulfill({ status: 200, contentType: { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(p)] || 'text/plain', body: fs.readFileSync(p) });
    });
    await ctx.route('https://api.groq.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ choices: [{ message: { content: AI(JSON.parse(r.request().postData())) } }] }) }));
  };
  const conn = Buffer.from(JSON.stringify({ u: 'https://script.google.com/macros/s/DEMO/exec', t: 'demo' })).toString('base64');
  const unlock = async page => { for (let k = 0; k < 2; k++) { if (!(await page.$('.lock'))) break; for (const d of '2580') await page.click(`[data-key="${d}"]`); await page.click('#pinGo'); await wait(900); } };
  const open = async (page, hash) => { await page.goto('https://jt.example/index.html#' + hash); await wait(900); await unlock(page); await wait(900); };

  // phone
  const phone = await browser.newContext({ ...devices['Pixel 7'] });
  await route(phone);
  const p = await phone.newPage(); p.on('pageerror', e => errors.push('phone: ' + e));
  await p.goto('https://jt.example/index.html#connect=' + conn); await wait(900); await unlock(p); await wait(4500);
  await p.screenshot({ path: path.join(TMP, 'phone-today.png') }); await cyr(p, 'phone-today');
  await open(p, 'check'); await p.fill('#jobInput', 'https://www.reed.co.uk/jobs/it-support-technician/56123456'); await p.click('#go'); await wait(2500);
  await p.screenshot({ path: path.join(TMP, 'phone-check.png') }); await cyr(p, 'phone-check');
  await open(p, 'stats'); await p.screenshot({ path: path.join(TMP, 'phone-stats.png') }); await cyr(p, 'phone-stats');
  await open(p, 'more'); await p.screenshot({ path: path.join(TMP, 'phone-more.png') }); await cyr(p, 'phone-more');
  await phone.close();
  // laptop
  const lap = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await route(lap);
  const l = await lap.newPage(); l.on('pageerror', e => errors.push('laptop: ' + e));
  await l.goto('https://jt.example/index.html#connect=' + conn); await wait(900); await unlock(l); await wait(4500);
  await l.screenshot({ path: path.join(TMP, 'web-today.png') }); await cyr(l, 'web-today');
  await open(l, 'stats'); await l.screenshot({ path: path.join(TMP, 'web-stats.png') }); await cyr(l, 'web-stats');
  await lap.close();
  await browser.close();
}

(async () => {
  await extension();
  await webApp();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
  console.log(russian.length ? 'RUSSIAN LEFT:\n' + russian.join('\n') : 'no Russian on the screenshots');
  console.log('raw screenshots in', TMP);
})();
