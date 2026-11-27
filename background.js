/* Job Tracker — background service worker */
importScripts('lib/quality.js', 'lib/analyzer.js', 'lib/store.js', 'lib/legacy.js', 'lib/insights.js', 'lib/sync.js', 'lib/recheck.js', 'lib/migrate.js', 'lib/market.js', 'lib/fit.js', 'lib/llm.js', 'lib/templates.js');

// Schema migration: a full copy of the data is kept in 'backups' (last 3) before anything changes,
// and Data → Backups downloads it. Runs once per schema version, on install, update or start.
async function migrateSchema() {
  const got = await chrome.storage.local.get(['apps', 'profile', 'counter', 'pendingDeletes', 'schema', 'backups']);
  if (!JT_Migrate.needsMigration(got.schema) || !Array.isArray(got.apps)) return null;
  const backup = { at: new Date().toISOString(), reason: 'before schema ' + JT_Migrate.SCHEMA, version: chrome.runtime.getManifest().version, apps: got.apps, profile: got.profile, counter: got.counter };
  await chrome.storage.local.set({ backups: [backup, ...(got.backups || [])].slice(0, 3) });
  const r = JT_Migrate.migrateV2({ apps: got.apps, profile: got.profile, counter: got.counter, pendingDeletes: got.pendingDeletes, schema: got.schema });
  await chrome.storage.local.set({ apps: r.apps, profile: r.profile || got.profile, counter: r.counter, pendingDeletes: r.pendingDeletes, schema: r.schema, lastMigration: { at: backup.at, ...r.report } });
  return r.report;
}


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
  if (reason === 'install') { await chrome.storage.local.set({ schema: JT_Migrate.SCHEMA }); openDashboard('#settings'); }
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
    await migrateSchema();
  }
  updateBadge();
});
chrome.runtime.onStartup.addListener(async () => { await migrateSchema(); updateBadge(); autoSync(); markStale(); });

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
  for (const id of ids) await JT_Store.updateApp(id, { status: 'noresponse', outcome: { type: 'ghosted', auto: true, at: new Date().toISOString() } }, { by: 'auto' });
  return ids.length;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === 'openDashboard') { openDashboard(msg.hash); reply({ ok: true }); }
  // 'Tailor CV' on a job page: keep the ad for the tailor page, then open it next to the job
  if (msg && msg.type === 'openTailor' && msg.job) {
    chrome.storage.local.set({ tailorJob: { ...msg.job, at: new Date().toISOString() } })
      .then(() => chrome.tabs.create({ url: chrome.runtime.getURL('tailor.html?src=page'), index: _sender.tab ? _sender.tab.index + 1 : undefined }))
      .then(() => reply({ ok: true }));
    return true;
  }
  if (msg && msg.type === 'undo') { JT_Store.undoEvent(msg.appId, msg.eventId).then(a => reply({ ok: !!a })); return true; }
  if (msg && msg.type === 'syncNow') { JT_Sync.syncNow().then(reply); return true; }
  if (msg && msg.type === 'markStale') { markStale().then(n => reply({ ok: true, n })); return true; }
  if (msg && msg.type === 'syncTest') { JT_Sync.test(msg.cfg).then(reply); return true; }
  // ---------- Application session and autofill (3.10) ----------
  if (msg && msg.type === 'autofillData') { autofillData(msg, _sender).then(reply); return true; }
  if (msg && msg.type === 'llmAnswer') { llmAnswer(msg).then(reply, e => reply({ error: String(e.message || e) })); return true; }
  if (msg && msg.type === 'recordApplied') { recordApplied(msg, _sender).then(reply); return true; }
  if (msg && msg.type === 'sessionNext') { sessionNext(_sender, msg.skip).then(reply); return true; }
  if (msg && msg.type === 'openSession') { chrome.tabs.create({ url: chrome.runtime.getURL('session.html') + (msg.hash || '') }); reply({ ok: true }); }
});

// The pack for the page a form is on: the session's current job, or a ready pack whose company or link
// matches the page, or none (then only your details and the usual answers are used).
async function packFor(url, title, text, tabId) {
  const { packs = {}, session = null } = await chrome.storage.local.get(['packs', 'session']);
  if (session && session.current && packs[session.current] && (session.tabId === tabId || Date.now() - (session.at || 0) < 3 * 3600e3)) return packs[session.current];
  const hay = (String(url) + ' ' + String(title) + ' ' + String(text).slice(0, 3000)).toLowerCase();
  const list = Object.values(packs).filter(p => p.status === 'ready' && !p.done);
  return list.find(p => p.job.url && JT_Store.normUrl(p.job.url) === JT_Store.normUrl(url))
    || list.find(p => { const c = String(p.job.company || '').toLowerCase().replace(/\b(ltd|limited|plc|uk)\b/g, '').trim(); return c.length >= 4 && hay.includes(c); }) || null;
}
async function autofillData(msg, sender) {
  const { autofillMe = null, llmCfg = null, session = null } = await chrome.storage.local.get(['autofillMe', 'llmCfg', 'session']);
  if (!autofillMe || !autofillMe.email) return { me: null };
  const p = await JT_Store.getProfile();
  const pack = await packFor(msg.url, msg.title, msg.text, sender.tab && sender.tab.id);
  const me = { ...autofillMe, licence: !!p.hasDrivingLicence, needsSponsor: false };
  const generic = JT_Market.answers({ title: '', description: '' }, p, null).map(x => ({ q: x.q, a: x.a }));
  const platform = pack && pack.job.platform && pack.job.platform !== 'Company website' ? pack.job.platform : '';
  return {
    me, packKey: pack ? pack.key : '', job: pack ? { title: pack.job.title, company: pack.job.company, url: pack.job.url } : null,
    answers: pack ? pack.answers : generic, letter: pack ? pack.letter : '', salary: pack ? pack.salary : autofillMe.salaryB || '',
    notice: autofillMe.notice || 'Immediately', source: platform || (autofillMe.source || ''), cv: pack && pack.cv ? pack.cv : null,
    ai: !!(llmCfg && llmCfg.key), next: !!(session && session.queue && session.index < session.queue.length - 1),
  };
}
async function llmAnswer(msg) {
  const { llmCfg = null, packs = {}, cvs = {} } = await chrome.storage.local.get(['llmCfg', 'packs', 'cvs']);
  if (!llmCfg || !llmCfg.key) return { error: 'Нет ключа AI' };
  const pack = msg.packKey ? packs[msg.packKey] : null;
  const p = await JT_Store.getProfile();
  const facts = String(p.factBank && p.factBank.length > 80 ? p.factBank : (cvs.job && cvs.job.text) || '').slice(0, 4000);
  if (facts.length < 80) return { error: 'Загрузи CV на странице CV & ATS' };
  const text = await JT_LLM.answer(llmCfg, { question: msg.question, job: pack ? pack.job : { title: '', company: '', description: '' }, facts, skills: Object.keys(p.skills || {}).filter(k => p.skills[k] === 'strong').join(', ') });
  return { text: text.trim() };
}
async function recordApplied(msg, sender) {
  const { packs = {}, session = null } = await chrome.storage.local.get(['packs', 'session']);
  const pack = msg.packKey ? packs[msg.packKey] : null;
  const job = pack ? pack.job : msg.job;
  if (!job || !(job.title || job.company)) return { ok: false };
  const minutes = msg.startedAt ? Math.max(1, Math.min(240, Math.round((Date.now() - (session && session.current === msg.packKey && session.itemAt ? session.itemAt : msg.startedAt)) / 60000))) : null;
  const apply = { method: 'external', cover: pack && pack.letter ? (pack.letterAi ? 'tailored' : 'generic') : 'none', cv: pack && pack.cv ? pack.cv.name : '', ...(pack && pack.cv ? { cvTailored: true } : {}), autofill: true };
  let app = (job.url && await JT_Store.findByUrl(job.url)) || await JT_Store.findSimilar(job.title, job.company);
  if (app) app = await JT_Store.updateApp(app.id, { apply: { ...(app.apply || {}), ...apply }, ...(minutes ? { minutes } : {}), ...(pack && pack.fit != null ? { fitPrecise: { score: pack.fit, source: 'pack' } } : {}) });
  else {
    const p = await JT_Store.getProfile();
    const an = job.description ? JT_Analyzer.analyze(job, p) : null;
    app = await JT_Store.addApp({
      title: job.title, company: job.company, url: job.url || msg.url, location: job.location || '', platform: job.platform || 'Company website',
      description: an ? an.description || job.description : '', category: an ? an.category : 'Other', workTypes: an ? an.workTypes : [],
      salaryText: an && an.salary ? an.salary.text : '', salary: an ? an.salary : null, tools: an ? an.chance.tools : [], details: an ? an.details : [], chance: an ? an.chance : null,
      apply, ...(minutes ? { minutes } : {}), ...(pack && pack.fit != null ? { fitPrecise: { score: pack.fit, source: 'pack' } } : {}),
    });
  }
  if (pack) { pack.done = true; pack.appliedAt = new Date().toISOString(); packs[pack.key] = pack; await chrome.storage.local.set({ packs }); }
  // Done on the phone's "for later" list too
  try { const { sheetCfg } = await chrome.storage.local.get('sheetCfg'); if (sheetCfg && sheetCfg.url && pack) await fetch(sheetCfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: sheetCfg.token, apps: [], patches: [], deletes: [], laterDone: [pack.job.url || pack.key] }) }); } catch (e) { /* the sync will catch up */ }
  JT_Sync.syncNow({ pushOnly: true }).catch(() => {});
  return { ok: true, ticket: app && app.ticket, next: !!(session && session.queue && session.index < session.queue.length - 1) };
}
async function sessionNext(sender, skip) {
  const { session = null, packs = {} } = await chrome.storage.local.get(['session', 'packs']);
  if (!session || !session.queue) return { ok: false };
  let i = session.index + 1;
  while (i < session.queue.length && (!packs[session.queue[i]] || packs[session.queue[i]].done)) i++;
  if (i >= session.queue.length) {
    await chrome.storage.local.set({ session: { ...session, index: i, current: '', finished: new Date().toISOString() } });
    chrome.tabs.create({ url: chrome.runtime.getURL('session.html#done') });
    return { ok: true, done: true };
  }
  const key = session.queue[i], url = packs[key].job.url;
  await chrome.storage.local.set({ session: { ...session, index: i, current: key, at: Date.now(), itemAt: Date.now(), tabId: sender.tab ? sender.tab.id : session.tabId } });
  if (sender.tab && url) chrome.tabs.update(sender.tab.id, { url }); else if (url) chrome.tabs.create({ url });
  return { ok: true, skipped: !!skip };
}
