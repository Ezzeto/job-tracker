// Application session and autofill end to end: loads the unpacked extension, seeds a CV, your details and one
// job, prepares its pack on the session page, starts the session, fills a Greenhouse-like form, submits it
// and checks the application was recorded. Usage: node tests/e2e/autofill.js [screenshot-dir]  (Playwright)
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const EXT = path.join(__dirname, '..', '..');
const OUT = process.argv[2];
const wait = ms => new Promise(r => setTimeout(r, ms));

const FORM = `<!doctype html><html><head><title>Apply: IT Support Technician at Harlow College</title></head><body>
<h1>IT Support Technician</h1><p>Harlow College</p>
<form id="f" onsubmit="event.preventDefault(); document.body.innerHTML = '<h1>Thank you for applying!</h1><p>We have received your application.</p>';">
  <label for="fn">First Name *</label><input id="fn" name="first_name">
  <label for="ln">Last Name *</label><input id="ln" name="last_name">
  <label for="em">Email *</label><input id="em" type="email">
  <label for="ph">Phone</label><input id="ph" type="tel">
  <label for="li">LinkedIn Profile</label><input id="li">
  <label for="cv">Resume/CV</label><input id="cv" type="file">
  <label for="cl">Cover Letter</label><textarea id="cl"></textarea>
  <fieldset><legend>Do you have the right to work in the UK?</legend><label><input type="radio" name="rtw" value="1"> Yes</label><label><input type="radio" name="rtw" value="0"> No</label></fieldset>
  <label for="sp">Will you require visa sponsorship?</label><select id="sp"><option value="">Select…</option><option>Yes</option><option>No</option></select>
  <label for="gd">Gender</label><select id="gd"><option value="">Select…</option><option>Male</option><option>Female</option><option>Prefer not to say</option></select>
  <label for="why">Why do you want to work for us?</label><textarea id="why"></textarea>
  <label><input type="checkbox" id="gdpr"> I agree to the privacy policy</label>
  <button type="submit">Submit application</button>
</form></body></html>`;

(async () => {
  const ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1280, height: 900 } });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = sw.url().split('/')[2];
  await ctx.route('https://boards.greenhouse.io/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: FORM }));
  const errors = [];
  const CV = "Test Person\nIT Support\n\nPROFILE\nSecond-year Computing student supporting Microsoft 365 users. Calm under pressure. Available 3 days a week.\n\nSKILLS\n• Windows 11, Microsoft 365, Active Directory, Intune\n\nEXPERIENCE\nFreelance IT Support | Self-employed | 2024 – present\n• Reset passwords and unlocked accounts in Active Directory for 20 users\n• Fixed Wi-Fi and printer faults on site\n\nFront of House | Côte | 2022 – 2026\n• Served around 250 guests a shift\n\nEDUCATION\nBSc Computing with AI Technology";
  const job = { key: 'u:boards.greenhouse.io/harlow/jobs/1', title: 'IT Support Technician', company: 'Harlow College', url: 'https://boards.greenhouse.io/harlow/jobs/1', location: 'Harlow', platform: 'Company website', src: 'manual',
    description: 'Harlow College is looking for an IT Support Technician, part-time, 30 hours a week, term-time. Requirements: Microsoft 365 and Active Directory support; Windows 10/11 troubleshooting; excellent customer service. Desirable: Intune, ITIL. Hybrid: 3 days a week on site.' };
  await sw.evaluate(async ({ CV, job }) => {
    await chrome.storage.local.set({ cvs: { job: { text: CV, name: 'cv.pdf' } }, autofillMe: { firstName: 'Test', lastName: 'Person', email: 'test@example.com', phone: '+44 7700 900123', linkedin: 'https://www.linkedin.com/in/test', notice: 'Immediately', salaryB: '£12.50 an hour, pro rata' }, sessionItems: [job] });
  }, { CV, job });
  // Session page: the pack is prepared on open (no AI key: template letter, profile answers)
  const sp = await ctx.newPage();
  sp.on('pageerror', e => errors.push('session: ' + e.message));
  await sp.goto(`chrome-extension://${id}/session.html`); await wait(2500);
  const packs = await sw.evaluate(async () => (await chrome.storage.local.get('packs')).packs || {});
  const pk = Object.values(packs)[0];
  console.log('pack:', pk && pk.status, '| cv:', pk && pk.cv && pk.cv.name, '| letter chars:', pk && (pk.letter || '').length, '| answers:', pk && pk.answers.length, '| fit:', pk && pk.fit);
  if (OUT) { await sp.click('[data-open]'); await wait(300); await sp.screenshot({ path: path.join(OUT, 'session.png'), fullPage: true }); }
  const [form] = await Promise.all([ctx.waitForEvent('page'), sp.click('#start')]);
  form.on('pageerror', e => errors.push('form: ' + e.message));
  await form.waitForLoadState(); await wait(1500);
  await form.click('text=Заполнить анкету'); await wait(1500);
  const v = await form.evaluate(() => ({ fn: fn.value, ln: ln.value, em: em.value, ph: ph.value, li: li.value, cv: cv.files.length ? cv.files[0].name : '', cl: cl.value.slice(0, 40), rtw: document.querySelector('[name=rtw]:checked') && document.querySelector('[name=rtw]:checked').parentElement.textContent.trim(), sp: sp.value, gd: gd.value, why: why.value.slice(0, 30), gdpr: gdpr.checked, outlined: document.querySelectorAll('[data-jt-filled]').length }));
  console.log('filled:', JSON.stringify(v));
  console.log('report:', (await form.textContent('[data-jt-panel] >> css=.p')).replace(/\s+/g, ' ').slice(0, 160));
  if (OUT) await form.screenshot({ path: path.join(OUT, 'autofill.png'), fullPage: true });
  await form.click('button[type=submit]'); await wait(4000);
  const apps = await sw.evaluate(async () => (await chrome.storage.local.get('apps')).apps || []);
  const a = apps[0];
  console.log('recorded:', a && a.ticket, a && a.title, a && a.company, '| apply:', a && JSON.stringify(a.apply), '| minutes:', a && a.minutes);
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
  await ctx.close();
  process.exit(errors.length || !a ? 1 : 0);
})();
