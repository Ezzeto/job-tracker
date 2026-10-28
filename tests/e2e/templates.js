// Imports a settings file on the Settings page, then copies a filled-in template from the Templates page.
// Usage: node tests/e2e/templates.js [path-to-extension]   (needs Playwright and Chromium; not run in CI)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');

const EXT = path.resolve(process.argv[2] || '.');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SETTINGS = { jobTrackerSettings: 1, profile: { workDays: [0, 1, 2, 5], timeLimitedRtw: true, signName: 'Alex Example', signPhone: '07700 900123', skills: { Python: 'strong' } } };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify(SETTINGS));
  const ctx = await chromium.launchPersistentContext(path.join(dir, 'profile'), {
    headless: true, channel: 'chromium', args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const base = `chrome-extension://${sw.url().split('/')[2]}/dashboard.html`;
  await wait(1200);
  await sw.evaluate(async () => { await chrome.storage.local.set({ apps: [{ id: 'x', title: 'Kept', status: 'applied', appliedAt: new Date().toISOString(), history: [] }] }); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  let failed = 0;
  const check = (ok, what) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };

  await page.goto(base + '#settings'); await wait(800);
  await page.setInputFiles('#importSettings', file); await wait(800);
  check(/Imported: 5 settings/.test(await page.innerText('#importMsg')) && /Skipped: skills/.test(await page.innerText('#importMsg')), 'settings imported, skills skipped');
  await page.reload(); await wait(800);
  check(await page.inputValue('#pSignName') === 'Alex Example', 'signature name filled in');
  check(await page.isChecked('#pRtw'), 'right-to-work box ticked');
  check(await page.inputValue('#pDays') === '4', 'days per week follows the work days');
  check((await sw.evaluate(async () => (await chrome.storage.local.get('apps')).apps.length)) === 1, 'applications untouched');

  await page.goto(base + '#templates'); await wait(800);
  await page.fill('#tJob', 'IT Support Analyst'); await page.fill('#tCo', 'Acme Ltd');
  await page.click('[data-copy="cover"]'); await wait(300);
  const text = await page.evaluate(() => navigator.clipboard.readText());
  check(/^Dear Hiring Manager,/.test(text) && /IT Support Analyst role at Acme Ltd/.test(text) && /Alex Example\n07700 900123/.test(text), 'cover letter copied with job and signature');
  await page.fill('[data-body="linkedin"]', 'Edited note'); await wait(700);
  await page.reload(); await wait(800);
  check(await page.inputValue('[data-body="linkedin"]') === 'Edited note', 'an edited template is kept');
  if (errors.length) { failed++; console.log(errors.join('\n')); }
  await ctx.close();
  process.exit(failed ? 1 : 0);
})();
