// Loads the unpacked extension, clicks every checkbox on the Settings page, reloads and checks it stuck.
// Usage: node tests/e2e/settings.js [path-to-extension]   (needs Playwright and Chromium; not run in CI)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');

const EXT = path.resolve(process.argv[2] || '.');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'jt-')), {
    headless: true, channel: 'chromium', args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`chrome-extension://${sw.url().split('/')[2]}/dashboard.html#settings`); await wait(1000);
  let failed = 0;
  for (const id of await page.$$eval('#view-settings input[type=checkbox]', l => l.map(x => x.id))) {
    const before = await page.isChecked('#' + id);
    await page.click('#' + id); await wait(300);
    await page.reload(); await wait(800);
    const ok = (await page.isChecked('#' + id)) === !before;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${id}`);
  }
  await page.fill('#pSignName', 'Alex Example'); await page.press('#pSignName', 'Tab'); await wait(300);
  await page.reload(); await wait(800);
  const name = await page.inputValue('#pSignName');
  if (name !== 'Alex Example') { failed++; console.log('FAIL signature name'); } else console.log('ok   signature name');
  if (errors.length) { failed++; console.log(errors.join('\n')); }
  await ctx.close();
  process.exit(failed ? 1 : 0);
})();
