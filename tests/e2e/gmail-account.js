// Two Gmail addresses in Settings: Email asks which one, and the compose link names the chosen account.
// Usage: node tests/e2e/gmail-account.js [path-to-extension]   (needs Playwright and Chromium; not run in CI)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');

const EXT = path.resolve(process.argv[2] || '.');
const wait = ms => new Promise(r => setTimeout(r, ms));
const A = 'first.example@gmail.com', B = 'second.example@gmail.com';
const day = n => new Date(Date.now() - n * 864e5).toISOString();
const APPS = [{ id: 'g1', ticket: 'APP-0001', title: 'IT Support Analyst', company: 'Acme Ltd', status: 'applied', track: 'job', appliedAt: day(10),
  history: [{ status: 'applied', at: day(10) }], contacts: [{ type: 'email', value: 'jobs@acme.example', name: '' }], description: 'IT support role.' }];

(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'jt-')), {
    headless: true, channel: 'chromium', args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  await ctx.route('https://mail.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: 'gmail' }));
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const base = `chrome-extension://${sw.url().split('/')[2]}/dashboard.html`;
  await wait(1200);
  await sw.evaluate(async apps => { await chrome.storage.local.set({ apps }); }, APPS);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  let failed = 0;
  const check = (ok, what) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };

  await page.goto(base + '#settings'); await wait(800);
  await page.fill('#pGmail', `${A}, ${B}`); await page.press('#pGmail', 'Tab'); await wait(400);
  check(await page.locator('#pGmailCheck a').count() === 4, 'Check in Gmail and Sign in links for each address');

  const send = async (pick, where) => {
    await page.goto(base + '#followups'); await wait(900);
    await page.locator('#fuDue [data-mail]').first().click(); await wait(300);
    const [tab] = await Promise.all([ctx.waitForEvent('page'), page.locator(`.acct-menu [data-acct="${pick}"]`).click()]);
    await wait(300);
    const u = new URL(tab.url()); await tab.close();
    check(u.pathname === '/mail/' && u.searchParams.get('authuser') === pick, `${where}: compose opens with authuser=${pick}`);
    check(u.searchParams.get('to') === 'jobs@acme.example', `${where}: addressed to the contact`);
  };
  await send(B, 'first send');
  await send(A, 'second send (switching back)');
  await page.goto(base + '#followups'); await wait(900);
  await page.locator('#fuDue [data-mail]').first().click(); await wait(300);
  check(await page.locator('.acct-menu [data-acct]').first().innerText() === A, 'the last account used is listed first');
  if (errors.length) { failed++; console.log(errors.join('\n')); }
  await ctx.close();
  process.exit(failed ? 1 : 0);
})();
