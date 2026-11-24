// Phone app end to end: builds dist-app, serves it on a fake origin with a fake Apps Script,
// pastes a job link, adds it, changes a status with undo. Optional screenshots.
// Usage: node tests/e2e/phone.js [screenshot-dir]   (needs Playwright; not run in CI)
'use strict';
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const OUT = process.argv[2];
execFileSync('node', [path.join(ROOT, 'scripts', 'build-app.js')]);
const DIST = path.join(ROOT, 'dist-app');
const wait = ms => new Promise(r => setTimeout(r, ms));

const JOB_HTML = `<!doctype html><html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"IT Support Technician","hiringOrganization":{"@type":"Organization","name":"Hertford Regional College"},
"jobLocation":{"@type":"Place","address":{"addressLocality":"Broxbourne"}},"employmentType":"PART_TIME","baseSalary":{"@type":"MonetaryAmount","currency":"GBP","value":{"@type":"QuantitativeValue","minValue":24000,"maxValue":26500,"unitText":"YEAR"}},
"description":"<p>We are looking for a friendly IT Support Technician to join our college IT team, term-time only, 30 hours a week over 4 days.</p><h3>Essential</h3><ul><li>Experience supporting Microsoft 365 and Active Directory users</li><li>Windows 10/11 troubleshooting and imaging</li><li>Excellent customer service</li></ul><h3>Desirable</h3><ul><li>Intune or SCCM</li><li>ITIL Foundation</li></ul><p>Hybrid: 3 days a week on site. Training and certifications funded by the college.</p>"}</script></head><body><h1>IT Support Technician</h1></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 7'], ...(OUT ? {} : { deviceScaleFactor: 1 }) });
  const rows = [
    { id: 'a1', ticket: 'APP-0231', title: 'Service Desk Analyst', company: 'Hays', status: 'Applied', appliedAt: '2026-11-14', chance: 72, url: 'https://www.reed.co.uk/jobs/1', updated: 1 },
    { id: 'a2', ticket: 'APP-0228', title: 'IT Operations Specialist I', company: 'Cloudflare', status: 'Interview 1', appliedAt: '2026-11-03', chance: 82, updated: 1 },
    { id: 'a3', ticket: 'APP-0190', title: '1st Line Support Engineer', company: 'Zachary Daniels', status: 'Rejected', appliedAt: '2026-10-20', chance: 64, updated: 1 },
    { id: 'a4', ticket: 'APP-0150', title: 'Desktop Support Technician', company: 'Acme Systems', status: 'Applied', appliedAt: '2026-10-10', chance: 58, updated: 1 },
  ];
  const posts = [];
  await ctx.route('https://script.google.com/**', async r => {
    const req = r.request();
    const u = new URL(req.url());
    let body;
    if (req.method() === 'POST') { const b = JSON.parse(req.postData()); posts.push(b); (b.apps || []).forEach(a => rows.unshift(a)); (b.patches || []).forEach(p => Object.assign(rows.find(x => x.id === p.id) || {}, p)); body = { ok: true, version: 13 }; }
    else if (u.searchParams.get('action') === 'ping') body = { ok: true, version: 13, name: 'Job search', rows: rows.length };
    else if (u.searchParams.get('action') === 'profile') body = { ok: true, profile: { skills: { 'Microsoft 365': 'strong', 'Active Directory': 'strong', 'Windows 10/11': 'strong', Intune: 'basic' }, areas: ['Hertfordshire', 'Broxbourne', 'Harlow', 'London'], workDays: [0, 1, 2, 5], hoursPerWeek: 32, experienceYears: 2, pitch: 'a second-year Computing student who supports Microsoft 365 and Active Directory users' } };
    else if (u.searchParams.get('action') === 'fetchJob') body = { ok: true, url: u.searchParams.get('url'), html: JOB_HTML };
    else body = { ok: true, rows };
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  });
  await ctx.route('https://jt.example/**', r => {
    let f = new URL(r.request().url()).pathname.replace(/^\//, '') || 'index.html';
    const p = path.join(DIST, f);
    if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: 'nf' });
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(p)] || 'text/plain';
    r.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  const fresh = await ctx.newPage();
  await fresh.goto('https://jt.example/index.html'); await wait(600);
  console.log('first open without a connection link:', await fresh.textContent('.lock h1').catch(() => 'NO LOCK SCREEN'));
  await fresh.close();
  const conn = Buffer.from(JSON.stringify({ u: 'https://script.google.com/macros/s/TEST/exec', t: 'secret' })).toString('base64');
  await page.goto('https://jt.example/index.html#connect=' + conn); await wait(800);
  const shot = async n => { if (OUT) await page.screenshot({ path: path.join(OUT, `phone-${n}.png`), fullPage: false }); };
  const typePin = async pin => { for (const d of pin) await page.click(`[data-key="${d}"]`); await page.click('#pinGo'); await wait(900); };
  console.log('lock screen:', await page.textContent('.lock h1'));
  await shot('0-pin');
  await typePin('2580'); await typePin('2580');
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  console.log('token stored in plain text:', stored.includes('secret'), '| vault:', stored.includes('jt.vault'));
  await wait(800);
  const listCount = await page.$$eval('.app-row', l => l.length);
  console.log('list rows (active):', listCount); await shot('1-list');
  await page.click('a[data-tab="add"]'); await wait(300);
  await page.fill('#jobInput', 'https://www.linkedin.com/jobs/view/4499999999/?trk=abc'); await page.click('#go'); await wait(1200);
  console.log('verdict:', await page.textContent('.verdict'), '| ring:', await page.textContent('.ring b'));
  console.log('chips:', (await page.$$eval('#result .chip', l => l.map(x => x.textContent))).join(' | '));
  await shot('2-result');
  await page.evaluate(() => document.querySelector('details.card').scrollIntoView()); await wait(200); await shot('3-answers');
  await page.click('[data-add="applied"]'); await wait(800);
  const added = posts.find(p => (p.apps || []).length);
  console.log('added row:', added && added.apps[0].ticket, added && added.apps[0].title, '|', added && added.apps[0].status, '| desc chars', added && added.apps[0].description.length);
  await page.click('.app-row'); await wait(400); await shot('4-sheet');
  await page.click('[data-set="screening"]'); await wait(700);
  console.log('patch sent:', JSON.stringify(posts.filter(p => (p.patches || []).length).pop().patches));
  await shot('5-toast');
  await page.click('#toast button'); await wait(700);
  console.log('after undo:', JSON.stringify(posts.filter(p => (p.patches || []).length).pop().patches));
  await page.click('a[data-tab="today"]'); await wait(400); await shot('6-today');
  await page.evaluate(() => window.JT_App.lockNow()); await wait(300);
  await typePin('1111');
  console.log('wrong PIN:', await page.textContent('.pin-msg'));
  await typePin('2580');
  console.log('unlocked, rows:', await page.evaluate(() => window.JT_App.st.rows.length), '| token back:', await page.evaluate(() => !!(window.JT_App.st.cfg && window.JT_App.st.cfg.token)));
  await page.reload(); await wait(800);
  console.log('after reload:', await page.textContent('.lock h1'));
  await typePin('2580');
  console.log('after reload unlocked, rows:', await page.evaluate(() => window.JT_App.st.rows.length));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log('horizontal overflow:', overflow);
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
  await browser.close();
  process.exit(errors.length || overflow ? 1 : 0);
})();
