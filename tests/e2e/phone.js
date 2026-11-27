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
  const dayIso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const desc = 'Part-time IT support, 3 days a week, term-time. Microsoft 365, Active Directory, Windows 11, Intune. Excellent customer service.';
  const rows = [
    { id: 'a1', ticket: 'APP-0231', title: 'Service Desk Analyst', company: 'Hays', status: 'Applied', appliedAt: dayIso(8), chance: 72, url: 'https://www.reed.co.uk/jobs/1', contacts: 'Jane Smith: jane.smith@hays.com', tools: 'Microsoft 365, Active Directory, ServiceNow', missing: 'ServiceNow', description: 'Full-time, Monday to Friday. ' + desc, updated: 1 },
    { id: 'a2', ticket: 'APP-0228', title: 'IT Operations Specialist I', company: 'Cloudflare', status: 'Interview 1', appliedAt: dayIso(20), chance: 82, nextDate: dayIso(0), description: 'Full-time role, 37.5 hours.', updated: 1 },
    { id: 'a3', ticket: 'APP-0190', title: '1st Line Support Engineer', company: 'Zachary Daniels', status: 'Rejected', appliedAt: dayIso(30), chance: 64, rejDays: 2, updated: 1 },
    { id: 'a4', ticket: 'APP-0150', title: 'Desktop Support Technician', company: 'Acme Systems', status: 'Applied', appliedAt: dayIso(40), chance: 58, updated: 1 },
    { id: 'a5', ticket: 'APP-0240', title: 'IT Technician', company: 'Harlow College', status: 'Applied', appliedAt: dayIso(1), chance: 77, description: desc, followup: '', missing: 'ITIL, ServiceNow', tools: 'ITIL, ServiceNow, Microsoft 365', updated: 1 },
    { id: 'a6', ticket: 'APP-0241', title: 'IT Support Assistant', company: 'Birchwood High School', status: 'Applied', appliedAt: dayIso(12), chance: 70, description: desc, followup: '1 · 20/11/2026', missing: 'ITIL', tools: 'ITIL, Microsoft 365', updated: 1 },
  ];
  const inbox = [{ id: 't1', kind: 'rejected', subject: 'Your application to Acme Systems', from: 'Acme Systems Careers', date: new Date().toISOString(), rowId: 'a4', company: 'Acme Systems', human: false, link: 'https://mail.google.com/mail/#all/t1' },
    { id: 't2', kind: 'interview', subject: 'Interview invitation', from: 'Tom Brown', fromEmail: 'tom.brown@hays.com', date: new Date().toISOString(), rowId: 'a1', company: 'Hays', human: true, link: 'https://mail.google.com/mail/#all/t2' },
    { id: 't3', kind: 'applied', subject: 'Thank you for applying', from: 'Ware Academy', company: 'Ware Academy', title: '', date: new Date().toISOString(), link: 'https://mail.google.com/mail/#all/t3' }];
  const alerts = [{ key: 'li4199', url: 'https://www.linkedin.com/jobs/view/4199/', title: 'IT Support Assistant (Part-time)', after: 'Hockerill Anglo-European College · Bishop\'s Stortford', source: 'LinkedIn', date: new Date().toISOString() },
    { key: 'in00aa', url: 'https://uk.indeed.com/viewjob?jk=00aa', title: 'Senior Network Architect', after: 'BigCo · London', source: 'Indeed', date: new Date().toISOString() }];
  const posts = [];
  await ctx.route('https://script.google.com/**', async r => {
    const req = r.request();
    const u = new URL(req.url());
    let body;
    if (req.method() === 'POST') { const b = JSON.parse(req.postData()); posts.push(b); (b.apps || []).forEach(a => rows.unshift(a)); (b.patches || []).forEach(p => Object.assign(rows.find(x => x.id === p.id) || {}, p)); (b.inboxDismiss || []).forEach(id => { const i = inbox.findIndex(x => x.id === id); if (i >= 0) inbox.splice(i, 1); }); body = { ok: true, version: 23, events: (b.events || []).map(() => ({ ok: true, id: 'ev1' })) }; }
    else if (u.searchParams.get('action') === 'ping') body = { ok: true, version: 23, name: 'Job search', rows: rows.length };
    else if (u.searchParams.get('action') === 'profile') body = { ok: true, profile: { skills: { 'Microsoft 365': 'strong', 'Active Directory': 'strong', 'Windows 10/11': 'strong', Intune: 'basic' }, areas: ['Hertfordshire', 'Broxbourne', 'Harlow', 'London'], workDays: [0, 1, 2, 5], hoursPerWeek: 32, experienceYears: 2, signName: 'Test Person', gmailAccounts: ['me@example.com'], pitch: 'a second-year Computing student who supports Microsoft 365 and Active Directory users' } };
    else if (u.searchParams.get('action') === 'inbox') body = { ok: true, items: inbox, alerts, added: 0 };
    else if (u.searchParams.get('action') === 'slots') body = { ok: true, busy: [] };
    else if (u.searchParams.get('action') === 'employers') body = { ok: true, employers: [] };
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
  const voiceJson = () => JSON.stringify({ company: 'Harlow College', status: 'interview1', event: { title: 'Interview', date: dayIso(-5), time: '10:00', minutes: 45 }, nextDate: null, note: 'Sara called: interview on Tuesday at 10.', todo: ['bring passport'] });
  await ctx.route('https://api.groq.com/**', r => {
    const body = r.request().postData() || '';
    const content = /job search tracker/.test(body) ? JSON.stringify({ filter: { text: 'school' }, groupBy: null, show: 'list' })
      : /job search coach/.test(body) ? 'Что сработало:\n- Отклики напрямую в колледжи.\nПлан на неделю:\n- 7 откликов на рынке Б.'
      : /prepare an entry-level IT support candidate for an interview/.test(body) ? '1. Чем занимается компания: проверь.\n3. Вопросы: Tell me about a time you helped a frustrated user.'
      : voiceJson();
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ choices: [{ message: { content } }] }) });
  });
  await ctx.route('https://overpass-api.de/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ elements: [
    { type: 'node', id: 11, lat: 51.88, lon: 0.18, tags: { amenity: 'school', name: 'Birchwood High School', website: 'https://www.birchwoodhigh.org' } },
    { type: 'node', id: 12, lat: 51.87, lon: 0.16, tags: { office: 'it', name: 'Stortford IT Ltd', email: 'hello@stortfordit.co.uk' } },
    { type: 'node', id: 13, lat: 51.86, lon: 0.16, tags: { amenity: 'school', name: 'Thorley Hill Primary School' } } ] }) }));
  await ctx.route('https://tile.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64') }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.stack || e)));
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
  await wait(1200);
  console.log('alerts on today:', (await page.$$eval('[data-alert-check]', l => l.map(b => b.closest('.item').querySelector('.t').textContent))).join(' | '));
  await page.click('[data-slots="t2"]'); await wait(700);
  console.log('slots reply:', (await page.inputValue('#slotText')).split('\n').filter(l => l.startsWith('•')).join(' / '), '| to:', decodeURIComponent(await page.getAttribute('#slotMail', 'href')).slice(0, 40));
  await page.keyboard.press('Escape'); await wait(200);
  await page.click('[data-inbox-add="t3"]'); await wait(300); await page.fill('#qaTi', 'IT Technician'); await page.click('#qaGo'); await wait(700);
  const qa = posts.filter(p => (p.apps || []).length).pop();
  console.log('quick add:', qa && qa.apps[0].company, qa && qa.apps[0].title, qa && qa.apps[0].status);
  console.log('today sections:', (await page.$$eval('.sec-h h2', l => l.map(x => x.textContent.trim()))).join(' | '));
  console.log('week goals:', (await page.$$eval('.goal b', l => l.map(x => x.textContent))).join(' | '));
  await shot('1-today');
  await page.click('[data-inbox-apply="t1"]'); await wait(700);
  const pAfter = posts.filter(p => (p.patches || []).length).pop();
  console.log('inbox hint applied:', JSON.stringify(pAfter && pAfter.patches[0].status), '| dismissed:', JSON.stringify(posts.filter(p => p.inboxDismiss).map(p => p.inboxDismiss)));
  await page.click('[data-sent="a1"]'); await wait(700);
  console.log('follow-up patch:', JSON.stringify(posts.filter(p => (p.patches || []).length).pop().patches));
  const mailLink = await page.getAttribute('[data-mail]', 'href').catch(() => '');
  console.log('follow-up mail link:', mailLink.slice(0, 60));
  await page.goto('https://jt.example/index.html#cv'); await wait(500); if (await page.$('.lock')) await typePin('2580');
  await page.evaluate(() => { document.querySelector('[data-cvtext="B"]').closest('details').open = true; });
  await page.fill('[data-cvtext="B"]', "Test Person\nIT Support\nBishop's Stortford\n\nPROFILE\nSecond-year Computing student. I support small businesses with Microsoft 365. I run a home lab. Available 3 days a week.\n\nSKILLS\n• Windows 11, Microsoft 365, Active Directory, Intune\n\nEXPERIENCE\nFreelance IT Support | Self-employed | 2024 – present\n• Reset passwords and unlocked accounts in Active Directory for 20 users\n• Fixed Wi-Fi and printer faults on site\n• Set up Intune policies for new laptops\n\nFront of House | Côte | 2022 – 2026\n• Served around 250 guests a shift\n• Trained 25 new staff\n\nEDUCATION\nBSc Computing with AI Technology, Northumbria University London"); await page.click('[data-cvsave="B"]'); await wait(400);
  console.log('cv saved:', await page.textContent('.tag.ok').catch(() => 'NO'));
  await page.click('a[data-tab="check"]').catch(() => page.goto('https://jt.example/index.html#check')); await wait(300);
  await page.fill('#jobInput', 'https://www.linkedin.com/jobs/view/4499999999/?trk=abc'); await page.click('#go'); await wait(1200);
  console.log('verdict:', await page.textContent('.verdict .v'), '| score:', await page.textContent('.score'));
  console.log('tags:', (await page.$$eval('#result .tag', l => l.map(x => x.textContent))).join(' | '));
  console.log('fit block:', (await page.textContent('#result .paper.tight').catch(() => 'NO FIT')).replace(/\s+/g, ' ').slice(0, 220));
  await shot('2-result');
  await page.click('#promptCopy').catch(() => {}); await wait(300);
  await page.click('#tailorGo'); await wait(500);
  console.log('tailored:', (await page.textContent('details.paper.fold[open] p').catch(() => 'NO')).replace(/\s+/g, ' '));
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null); await page.click('#cvDocx'); const d = await dl; console.log('docx download:', d ? d.suggestedFilename() : 'NONE');
  await page.click('#applied'); await wait(800);
  const added = posts.filter(p => (p.apps || []).length).pop();
  console.log('added row:', added && added.apps[0].ticket, added && added.apps[0].title, '|', added && added.apps[0].status, '| desc chars', added && added.apps[0].description.length);
  await page.click('a[data-tab="apps"]'); await wait(400); await shot('3-apps');
  console.log('list rows (active):', await page.$$eval('.app-row', l => l.length));
  await page.click('.app-row'); await wait(400); await shot('4-sheet');
  await page.click('[data-set="screening"]'); await wait(700);
  console.log('patch sent:', JSON.stringify(posts.filter(p => (p.patches || []).length).pop().patches));
  await page.click('#toast button'); await wait(700);
  console.log('after undo:', JSON.stringify(posts.filter(p => (p.patches || []).length).pop().patches));
  for (const r of ['stats', 'employers', 'templates', 'setup', 'more', 'cv', 'learn', 'review', 'offer']) { await page.goto('https://jt.example/index.html#' + r); await wait(500); if (r !== 'more' && (await page.$('.lock'))) await typePin('2580'); await wait(300); await shot('5-' + r); console.log(r + ':', (await page.textContent('h1')).trim()); }
  await page.goto('https://jt.example/index.html#today'); await wait(500); if (await page.$('.lock')) await typePin('2580');
  await page.evaluate(() => { window.JT_App.st.local.ai.key = 'gsk_test'; window.JT_App.render(); });
  await page.click('#voiceOpen'); await wait(300);
  await page.fill('#vText', 'Звонила Сара из Harlow College, интервью во вторник в 10, взять паспорт'); await page.click('#vParse'); await wait(800);
  console.log('voice parsed:', await page.$eval('#vRow', s => s.options[s.selectedIndex].text), '|', await page.$eval('#vStatus', s => s.value), '|', await page.textContent('label.check').catch(() => 'NO EVENT'));
  await shot('6-voice');
  await page.click('#vApply'); await wait(900);
  const vp = posts.filter(p => (p.patches || []).length).pop();
  console.log('voice applied:', JSON.stringify(vp.patches[0]).slice(0, 160), '| events:', JSON.stringify(posts.filter(p => p.events).map(p => p.events[0].title)));
  await page.goto('https://jt.example/index.html#stats'); await wait(600); if (await page.$('.lock')) await typePin('2580');
  await page.fill('#askQ', 'Сколько я подал в школы?'); await page.click('#askGo'); await wait(800);
  console.log('ask:', (await page.textContent('#askOut b')).trim(), '|', await page.$$eval('#askOut .app-row .m', l => l.map(x => x.textContent).join(', ')));
  console.log('cost rows:', await page.$$eval('.tbl', t => t.find(x => /Часов на скрининг/.test(x.textContent)).querySelectorAll('tbody tr').length));
  await page.goto('https://jt.example/index.html#review'); await wait(500); if (await page.$('.lock')) await typePin('2580');
  await page.click('#revAi'); await wait(800);
  await page.click('#revSend'); await wait(600);
  console.log('weekly note sent:', JSON.stringify(posts.filter(p => p.weeklyNote).map(p => p.weeklyNote.slice(0, 30))));
  await shot('8-review');
  await page.evaluate(() => { window.JT_App.st.briefId = 'a2'; location.hash = '#brief'; }); await wait(400);
  await page.click('#briefAi'); await wait(800);
  console.log('brief:', (await page.textContent('.ad')).slice(0, 60));
  await page.goto('https://jt.example/index.html#offer'); await wait(500); if (await page.$('.lock')) await typePin('2580');
  await page.click('#offAdd'); await wait(300);
  const offId = await page.$eval('[data-off$=":salary"]', i => i.dataset.off.split(':')[0]);
  await page.fill(`[data-off="${offId}:salary"]`, '26000'); await page.press(`[data-off="${offId}:salary"]`, 'Tab'); await wait(300);
  await page.fill(`[data-off="${offId}:commuteMin"]`, '45'); await page.press(`[data-off="${offId}:commuteMin"]`, 'Tab'); await wait(300);
  console.log('offer:', (await page.$$eval('.kpi b', l => l.map(x => x.textContent))).slice(-3).join(' | '));
  await page.goto('https://jt.example/index.html#employers'); await wait(800); if (await page.$('.lock')) await typePin('2580');
  await page.click('#osmLoad'); await wait(900);
  console.log('employers:', await page.$$eval('#empList .app-row', l => l.length), '| queue:', (await page.$$eval('[data-emp-mail]', l => l.map(a => a.closest('.item').querySelector('.t').textContent))).slice(0, 5).join(', '));
  console.log('map:', await page.$eval('#empMap', el => el.querySelector('.leaflet-container, .leaflet-pane') ? 'leaflet ok' : el.textContent.trim().slice(0, 60) || 'empty'));
  const firstMail = await page.$('[data-emp-mail]'); const href = await firstMail.getAttribute('href');
  console.log('cold email:', decodeURIComponent(href).slice(0, 140).replace(/\n/g, ' '));
  await page.evaluate(() => { document.querySelector('[data-emp-mail]').addEventListener('click', e => e.preventDefault(), { capture: true }); });
  await firstMail.click(); await wait(2600);
  console.log('after mail:', await page.evaluate(() => window.JT_App.employers().filter(e => e.status === 'sent').map(e => e.name + ' ' + e.contactedAt).join(', ')));
  console.log('synced employers:', JSON.stringify(posts.filter(p => p.employers).map(p => p.employers.map(e => e.name + ':' + e.status))).slice(0, 200));
  await shot('7-employers');
  await page.goto('https://jt.example/index.html#learn'); await wait(500); if (await page.$('.lock')) await typePin('2580');
  console.log('learn items:', (await page.$$eval('[data-ldone]', l => l.map(x => x.dataset.ldone))).join(', '));
  await page.click('[data-ldone]'); await wait(600);
  console.log('learned sent:', JSON.stringify(posts.filter(p => p.learned).map(p => p.learned)));
  await page.goto('https://jt.example/index.html#today'); await wait(500); if (await page.$('.lock')) await typePin('2580');
  await page.evaluate(() => window.JT_App.lockNow()); await wait(300);
  await typePin('1111');
  console.log('wrong PIN:', await page.textContent('.pin-msg'));
  await typePin('2580');
  console.log('unlocked, rows:', await page.evaluate(() => window.JT_App.st.rows.length), '| token back:', await page.evaluate(() => !!(window.JT_App.st.cfg && window.JT_App.st.cfg.token)));
  await page.reload(); await wait(800);
  console.log('after reload:', await page.textContent('.lock h1'));
  await typePin('2580');
  console.log('after reload unlocked, rows:', await page.evaluate(() => window.JT_App.st.rows.length));
  let overflow = false;
  for (const r of ['today', 'check', 'apps', 'stats', 'employers', 'templates', 'setup', 'review', 'offer', 'cv', 'learn']) { await page.evaluate(h => { location.hash = h; }, '#' + r); await wait(250); if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) { overflow = true; console.log('overflow on', r); } }
  if (OUT) {
    await page.setViewportSize({ width: 1360, height: 860 }); await page.evaluate(() => { location.hash = '#today'; }); await wait(400); await shot('7-desktop-today');
    await page.evaluate(() => { location.hash = '#stats'; }); await wait(400); await shot('7-desktop-stats');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; location.hash = '#today'; }); await page.setViewportSize({ width: 412, height: 915 }); await wait(400); await shot('8-dark-today');
  }
  console.log('horizontal overflow:', overflow);
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
  await browser.close();
  process.exit(errors.length || overflow ? 1 : 0);
})();
