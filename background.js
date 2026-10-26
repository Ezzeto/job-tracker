/* Job Tracker — background service worker */
importScripts('lib/quality.js', 'lib/analyzer.js', 'lib/store.js', 'lib/legacy.js', 'lib/insights.js', 'lib/sync.js');

async function openDashboard(hash) {
  const url = chrome.runtime.getURL('dashboard.html') + (hash || '');
  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('dashboard.html') + '*' });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true, url });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

async function updateBadge() {
  const apps = await JT_Store.getApps();
  const weekAgo = Date.now() - 7 * 864e5;
  const n = apps.filter(a => new Date(a.appliedAt).getTime() >= weekAgo).length;
  chrome.action.setBadgeBackgroundColor({ color: '#1f6fa8' });
  chrome.action.setBadgeText({ text: n ? String(n) : '' });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { profile } = await chrome.storage.local.get('profile');
  if (!profile) await chrome.storage.local.set({ profile: JT_Analyzer.DEFAULT_PROFILE });
  if (reason === 'install') openDashboard('#settings');
  if (reason === 'update') {
    // Shorten old links with ad parameters and migrate data saved by the Russian-language versions
    const p = await JT_Store.getProfile();
    if (JT_Legacy.migrateProfile(p)) await JT_Store.saveProfile(p);
    const apps = await JT_Store.getApps();
    let n = 0;
    apps.forEach(a => {
      let changed = JT_Legacy.migrateApp(a, JT_Analyzer, p);
      if (a.url) {
        const c = JT_Store.cleanUrl(a.url);
        if (c !== a.url) { a.url = c; a.urlKey = JT_Store.normUrl(c); changed = true; }
      }
      if (changed) { JT_Store.touch(a); n++; }
    });
    if (n) await JT_Store.saveApps(apps);
  }
  updateBadge();
});
chrome.runtime.onStartup.addListener(() => { updateBadge(); autoSync(); markStale(); });

// Auto-sync: push a few seconds after a change, full sync every 10 minutes
let pushTimer = null;
async function autoSync(pushOnly) {
  const cfg = await JT_Sync.getCfg();
  if (cfg.url && cfg.token && cfg.auto !== false) return JT_Sync.syncNow({ pushOnly });
}
chrome.storage.onChanged.addListener((ch) => {
  if (ch.apps) {
    updateBadge();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => autoSync(true), 4000);
  }
});
chrome.alarms.create('jt-sync', { periodInMinutes: 10 });
chrome.alarms.create('jt-stale', { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener(a => {
  if (a.name === 'jt-sync') autoSync(false);
  if (a.name === 'jt-stale') markStale();
});

// 'Applied' with no reply and no follow-up for N days (Settings) becomes 'No response',
// so the reply-rate charts count silence as an answer instead of waiting forever
async function markStale() {
  const p = await JT_Store.getProfile();
  const ids = JT_Insights.staleIds(await JT_Store.getApps(), Number(p.autoNoResponseDays) || 0);
  for (const id of ids) await JT_Store.updateApp(id, { status: 'noresponse', outcome: { type: 'ghosted', auto: true, at: new Date().toISOString() } });
  return ids.length;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === 'openDashboard') { openDashboard(msg.hash); reply({ ok: true }); }
  if (msg && msg.type === 'syncNow') { JT_Sync.syncNow().then(reply); return true; }
  if (msg && msg.type === 'markStale') { markStale().then(n => reply({ ok: true, n })); return true; }
  if (msg && msg.type === 'syncTest') { JT_Sync.test(msg.cfg).then(reply); return true; }
});
