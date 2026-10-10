/* Job Tracker — фоновый сервис */
importScripts('lib/analyzer.js', 'lib/store.js', 'lib/sync.js');

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
    // Укоротить старые длинные ссылки с рекламными параметрами
    const apps = await JT_Store.getApps();
    let n = 0;
    apps.forEach(a => {
      if (!a.url) return;
      const c = JT_Store.cleanUrl(a.url);
      if (c !== a.url) { a.url = c; a.urlKey = JT_Store.normUrl(c); a.updatedAt = new Date().toISOString(); n++; }
    });
    if (n) await JT_Store.saveApps(apps);
  }
  updateBadge();
});
chrome.runtime.onStartup.addListener(() => { updateBadge(); autoSync(); });

// Автосинхронизация: отправка через несколько секунд после изменений, полная — каждые 10 минут
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
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'jt-sync') autoSync(false); });

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === 'openDashboard') { openDashboard(msg.hash); reply({ ok: true }); }
  if (msg && msg.type === 'syncNow') { JT_Sync.syncNow().then(reply); return true; }
  if (msg && msg.type === 'syncTest') { JT_Sync.test(msg.cfg).then(reply); return true; }
});
