/* Job Tracker — background service worker */
importScripts('lib/quality.js', 'lib/analyzer.js', 'lib/store.js', 'lib/legacy.js', 'lib/insights.js', 'lib/sync.js', 'lib/recheck.js', 'lib/migrate.js', 'lib/market.js', 'lib/fit.js', 'lib/llm.js', 'lib/templates.js', 'lib/chance.js', 'lib/tailor.js', 'lib/docx.js', 'lib/packs.js', 'lib/review.js', 'lib/assistant.js');

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
  // ---------- AI on the job page (3.11) ----------
  if (msg && msg.type === 'aiJob') { aiJob(msg.job).then(reply, e => reply({ error: String(e.message || e) })); return true; }
  if (msg && msg.type === 'aiLetter') { aiLetter(msg.job).then(reply, e => reply({ error: String(e.message || e) })); return true; }
  if (msg && msg.type === 'aiCompany') { aiCompany(msg.job).then(reply, e => reply({ error: String(e.message || e) })); return true; }
  if (msg && msg.type === 'aiChat') { aiChat(msg.msgs || []).then(reply, e => reply({ error: String(e.message || e) })); return true; }
  if (msg && msg.type === 'aiAnswers') { aiAnswers(msg.job, msg.questions).then(reply, e => reply({ error: String(e.message || e) })); return true; }
  if (msg && msg.type === 'saveForSession') { saveForSession(msg.job).then(reply, e => reply({ error: String(e.message || e) })); return true; }
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
    answers: pack ? pack.answers : generic, letter: pack ? pack.letter : '', salary: pack ? pack.salary : p.salaryB || autofillMe.salaryB || '',
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


// ---------- AI on the job page (3.11) ----------
// The panel on a job site asks for these. AI reads the requirements (checked against the ad); the Fit and
// the chance are computed here by code. Answers are cached by the ad's text, so a job is read once.
async function llmCfg() {
  const { llmCfg: c = null, llmCache = {} } = await chrome.storage.local.get(['llmCfg', 'llmCache']);
  if (!c || !c.key) return null;
  return { ...c, cache: { get: k => llmCache[k], set: async (k, v) => { llmCache[k] = v; const ks = Object.keys(llmCache); if (ks.length > 300) ks.slice(0, ks.length - 300).forEach(x => delete llmCache[x]); await chrome.storage.local.set({ llmCache }); } } };
}
function appFacts(a) {
  return { status: a.status, history: a.history, appliedAt: a.appliedAt, title: a.title, company: a.company, location: a.location,
    agency: !!JT_Market.broker(a.company, a.description), method: (a.apply || {}).method, adAge: (a.posting || {}).daysAgo, applicants: (a.posting || {}).applicants,
    fit: a.fitPrecise && a.fitPrecise.score != null ? a.fitPrecise.score : (a.chance || {}).score, market: JT_Market.marketOf(a),
    tailored: (a.apply || {}).cvTailored == null ? null : !!a.apply.cvTailored, cover: (a.apply || {}).cover ? !/none|unknown/.test(a.apply.cover) : null };
}
async function factsText() {
  const p = await JT_Store.getProfile();
  const { cvs = {} } = await chrome.storage.local.get('cvs');
  return String(p.factBank && p.factBank.length > 80 ? p.factBank : (cvs.job && cvs.job.text) || '').slice(0, 4000);
}
async function aiJob(job) {
  const p = await JT_Store.getProfile();
  const cfg = await llmCfg();
  let reqs = JT_Fit.fromAd(job.description, job.company), ai = null, error = '';
  if (cfg) { try { ai = await JT_LLM.extract(cfg, job); if (ai.essential.length + ai.desirable.length >= 3) reqs = ai; } catch (e) { error = String(e.message || e); } }
  const fit = JT_Fit.compute(reqs, p, job);
  const facts = { ...appFacts({ ...job, apply: {} }), agency: !!JT_Market.broker(job.company, job.description) || !!(ai && ai.agency), fit: fit.score, market: JT_Market.marketOf(job), cover: null, tailored: null };
  const pr = JT_Chance.predict(facts, JT_Chance.stats((await JT_Store.getApps()).map(appFacts)));
  const strip = r => ({ text: r.text, level: r.level, note: r.note, check: r.check, w: r.w });
  return { hasKey: !!cfg, error, source: ai && reqs === ai ? 'ai' : reqs.source,
    fit: { score: fit.score, summary: fit.summary, essOk: fit.essOk, desOk: fit.desOk, essential: fit.essential.map(strip), desirable: fit.desirable.map(strip), lowData: fit.lowData, gaps: fit.gaps.slice(0, 6) },
    chance: JT_Chance.describe(pr), employer: ai && ai.employer, agency: !!(ai && ai.agency) || JT_Market.broker(job.company, job.description) === 'agency', broker: JT_Market.broker(job.company, job.description) || (ai && ai.agency ? 'agency' : null), officeDays: ai ? ai.officeDays : null, questions: ai ? ai.questions : [], dropped: ai ? ai.dropped : 0 };
}
async function aiLetter(job) {
  const cfg = await llmCfg(); if (!cfg) return { error: 'no-key' };
  const p = await JT_Store.getProfile(), facts = await factsText();
  if (facts.length < 80) return { error: 'Upload your CV on the CV & skills page first (or fill in Facts about you).' };
  const mk = JT_Market.marketOf(job);
  const avail = mk === 'B' ? `${JT_Market.daysText(p.workDays) || (p.daysPerWeek || 4) + ' days a week'}${p.hoursPerWeek ? ', up to ' + p.hoursPerWeek + ' hours a week' : ''}, alongside my Computing degree; can start immediately` : 'full-time, can start immediately';
  const sig = [p.signName, [p.signPhone, p.signLinkedIn].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
  return JT_LLM.coverLetter(cfg, { job, facts, profile: p, availability: avail, why: job.why || '', signature: sig });
}
async function aiCompany(job) {
  const cfg = await llmCfg(); if (!cfg) return { error: 'no-key' };
  return JT_LLM.companyFromAd(cfg, job);
}
async function aiAnswers(job, questions) {
  const p = await JT_Store.getProfile();
  const an = JT_Analyzer.analyze(job, p);
  const out = JT_Market.answers({ ...job, salary: an.salary, workTypes: an.workTypes }, p, an).map(x => ({ q: x.q, a: x.a, src: 'profile' }));
  const mk = JT_Market.marketOf({ ...job, workTypes: an.workTypes });
  const own = mk === 'A' ? p.salaryA : p.salaryB;
  const sal = out.find(x => /salary/i.test(x.q)); if (sal && own) sal.a = own;
  const cfg = await llmCfg(), facts = await factsText();
  if (cfg && facts.length > 80) {
    const qs = (questions && questions.length ? questions : []).concat(['Why do you want to work for us?']).slice(0, 4);
    for (const q of qs) { try { const a = await JT_LLM.answer(cfg, { question: q, job, facts, skills: Object.keys(p.skills || {}).filter(k => p.skills[k] === 'strong').join(', ') }); out.push({ q, a: a.trim(), src: 'ai' }); } catch (e) { break; } }
  }
  return { answers: out, hasKey: !!cfg };
}
// "For tonight": the job joins the application session and its pack is prepared now
async function saveForSession(job) {
  const { sessionItems = [], packs = {}, cvs = {}, templates = {}, autofillMe = {} } = await chrome.storage.local.get(['sessionItems', 'packs', 'cvs', 'templates', 'autofillMe']);
  const key = JT_Packs.keyOf(job);
  if (!sessionItems.some(x => x.key === key)) sessionItems.push({ key, title: job.title, company: job.company, url: job.url, location: job.location, platform: job.platform, description: String(job.description || '').slice(0, 15000), src: 'page', at: new Date().toISOString().slice(0, 10) });
  await chrome.storage.local.set({ sessionItems });
  const pack = await JT_Packs.build(job, { profile: await JT_Store.getProfile(), cvText: cvs.job && cvs.job.text, templates, me: autofillMe, llm: await llmCfg() });
  packs[pack.key] = pack; await chrome.storage.local.set({ packs });
  return { ok: true, key, count: sessionItems.length, cv: !!pack.cv, letterAi: !!pack.letterAi };
}


// ---------- The assistant on the Progress page (3.13) ----------
// Code counts (lib/assistant.js, lib/review.js); AI talks about the numbers. A data question runs a query first.
async function aiChat(msgs) {
  const cfg = await llmCfg(); if (!cfg) return { error: 'no-key' };
  const p = await JT_Store.getProfile();
  const apps = (await JT_Store.getApps()).filter(a => a.track !== 'intern' || p.showInternships);
  const plain = apps.map(a => {
    const agency = !!JT_Market.broker(a.company, a.description);
    const x = { status: a.status, appliedAt: a.appliedAt, company: a.company || '', title: a.title || '', platform: a.platform, market: JT_Market.marketOf(a), agency,
      method: (a.apply || {}).method, cvKind: (a.apply || {}).cvTailored ? 'Tailored' : 'Standard', cover: (a.apply || {}).cover, minutes: a.minutes,
      missing: (a.chance || {}).missing || [], tools: (a.chance || {}).tools || [], salaryText: a.salaryText, id: a.id,
      replied: JT_Store.everReached(a, JT_Analyzer.RESPONDED), reached: JT_Store.everReached(a, JT_Review.POS), nextDate: a.nextDate,
      followUps: (a.followUps || []).length, workingDays: JT_Insights.workingDaysSince ? JT_Insights.workingDaysSince(a.appliedAt) : 0 };
    x.channel = JT_Review.channelOf(x);
    return x;
  });
  const last = String((msgs[msgs.length - 1] || {}).content || '');
  let query = '';
  if (JT_Assistant.wantsQuery(last)) {
    try {
      const companies = [...new Set(plain.map(a => a.company).filter(Boolean))];
      const raw = await JT_LLM.chat(cfg, JT_Review.askPrompt(last, new Date().toISOString().slice(0, 10), companies), { json: true, temperature: 0, cacheKey: false });
      query = JT_Assistant.queryText(JT_Review.runQuery(plain, JT_Review.cleanQuery(raw)));
    } catch (e) { /* answer from the summary */ }
  }
  const { sessionItems = [] } = await chrome.storage.local.get('sessionItems');
  const plan = JT_Assistant.wantsPlan(last);
  const data = JT_Assistant.context(plain, { targets: p.targets, studyDays: p.studyDays, session: sessionItems.length, query });
  const history = msgs.slice(-8).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 1500) }));
  const text = await JT_LLM.chat(cfg, [{ role: 'system', content: JT_Assistant.system(plan) + '\n\nDATA:\n' + data }].concat(history), { temperature: 0.3, cacheKey: false, maxTokens: plan ? 900 : 500 });
  return { text: String(text).trim(), plan: plan && /^\s*-\s+/m.test(text) ? String(text).trim() : '' };
}
