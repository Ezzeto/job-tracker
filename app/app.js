/* Job Tracker web app (phone and laptop).
 * Data lives in your Google Sheet; this page talks to your Apps Script web app with your token.
 * Analysis runs here with the same code as the extension (lib/analyzer.js, lib/market.js, lib/followup.js).
 * Everything kept on the device (token, applications, settings, AI key) is encrypted with the PIN.
 * The only other address the page talks to is api.groq.com, and only when you add a Groq key and press
 * an AI button: the job ad and your facts go there, never your name, email or phone. */
(function () {
  'use strict';
  const A = window.JT_Analyzer, S = window.JT_Store, E = window.JT_Extract, Q = window.JT_Quality, Mk = window.JT_Market,
    I = window.JT_Insights, T = window.JT_I18n, F = window.JT_Follow, TP = window.JT_Templates, P = window.JT_Prompt,
    FIT = window.JT_Fit, CH = window.JT_Chance, LLM = window.JT_LLM;
  if (T) T.setLang('ru');
  const tr = s => (T ? T.tr(s) : s);
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const split = (s, sep) => String(s || '').split(sep).map(x => x.trim()).filter(Boolean);
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ukDate = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many; };

  // ---------- Local storage ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('jt.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('jt.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const V = window.JT_Vault;
  // Facts for AI drafts and the Claude prompt. Only what is true; edit them in Settings.
  const DEFAULT_FACTS = `Education: BSc Computing with AI Technology, Northumbria University London, second year (classes on Thursdays and Fridays).
Freelance IT support for small businesses: Microsoft 365 administration (users, licences, MFA, shared mailboxes), Active Directory account resets, Windows troubleshooting, Wi-Fi and network faults, printers, backups, BitLocker; on site and remote.
Home lab: Windows Server, Active Directory, Entra ID, Intune, osTicket (logging and closing tickets against SLA targets, writing knowledge base articles), Proxmox.
Front of House, Côte (restaurant), September 2022 – October 2026: around 250 guests a shift, handled complaints and competing requests under pressure, trained 25 new staff.
Certificates: CompTIA A+ in progress; Cisco "Introduction to Modern AI".
Right to work in the UK, no sponsorship needed. Lives in Bishop's Stortford.`;
  const DEFAULT_LOCAL = () => ({
    targets: { B: 7, A: 5, C: 3 }, studyDays: [3, 4], mail: 'auto', from: '',
    ai: { key: '', model: '' }, facts: DEFAULT_FACTS, llmCache: {},
    snooze: {}, noChannel: {}, inboxDone: [], later: [], employers: null, templates: {}, tplJob: { title: '', company: '', name: '' }, why: '',
  });
  const st = {
    cfg: null, rows: [], profile: null, queue: [], syncedAt: 0, local: DEFAULT_LOCAL(), inbox: [], scriptVersion: 0,
    filter: LS.get('filter', 'active'), market: LS.get('marketFilter', 'all'), q: '', input: LS.get('draft', ''), result: null, busy: false, error: '',
    letter: '', letterBusy: false, letterWarn: [], empFilter: 'all', inboxBusy: false,
    lock: null, pin: '', pin1: '', pinMsg: '', pendingCfg: null, pendingShare: null,
  };
  let K = null;
  let hiddenAt = 0;
  const LOCK_AFTER_MS = 5 * 60e3, MAX_FAILS = 10;
  const VAULT_KEYS = ['cfg', 'rows', 'profile', 'queue', 'syncedAt', 'local', 'inbox', 'scriptVersion'];
  const EMPTY = { rows: [], queue: [], inbox: [], syncedAt: 0, scriptVersion: 0 };
  const legacy = () => { const o = {}; let any = false; ['cfg', 'rows', 'profile', 'queue', 'syncedAt'].forEach(k => { const v = LS.get(k, undefined); if (v !== undefined) { o[k] = v; any = true; } }); return any ? o : null; };
  const fixLocal = () => { const d = DEFAULT_LOCAL(); const l = st.local || {}; st.local = { ...d, ...l, targets: { ...d.targets, ...(l.targets || {}) }, ai: { ...d.ai, ...(l.ai || {}) }, tplJob: { ...d.tplJob, ...(l.tplJob || {}) } }; };
  let saving = Promise.resolve();
  function save() {
    if (!K) return saving;
    const data = {}; VAULT_KEYS.forEach(k => { data[k] = st[k]; });
    saving = saving.then(() => V.seal(K, data)).then(box => { LS.set('vault', box); ['cfg', 'rows', 'profile', 'queue', 'syncedAt'].forEach(k => { try { localStorage.removeItem('jt.' + k); } catch (e) { /* ignore */ } }); }).catch(() => {});
    return saving;
  }
  function clearState() { K = null; VAULT_KEYS.forEach(k => { st[k] = k in EMPTY ? (Array.isArray(EMPTY[k]) ? [] : EMPTY[k]) : null; }); st.local = DEFAULT_LOCAL(); }
  function lockNow() {
    if (!LS.get('vault', null)) return;
    clearState(); st.result = null; st.lock = 'unlock'; st.pin = ''; st.pinMsg = '';
    closeSheet(); render();
  }
  function wipe() { ['vault', 'pinFails', 'cfg', 'rows', 'profile', 'queue', 'syncedAt'].forEach(k => { try { localStorage.removeItem('jt.' + k); } catch (e) { /* ignore */ } }); clearState(); }

  // ---------- Statuses ----------
  const RU = { applied: 'Отклик', screening: 'Скрининг', test: 'Тестовое', interview1: 'Интервью 1', interview2: 'Интервью 2', interview3: 'Интервью 3',
    offer: 'Оффер', accepted: 'Принял оффер', declined: 'Отказался', rejected: 'Отказ', noresponse: 'Нет ответа', withdrawn: 'Отозвал' };
  const ORDER = ['applied', 'screening', 'test', 'interview1', 'interview2', 'interview3', 'offer', 'accepted', 'rejected', 'noresponse', 'withdrawn', 'declined'];
  const idOf = label => { const s = A.STATUSES.find(x => x.label === String(label).trim() || x.id === label); return s ? s.id : 'applied'; };
  const COLOR = { applied: 'var(--dim)', screening: 'var(--sky)', test: 'var(--sky)', interview1: 'var(--sky)', interview2: 'var(--sky)', interview3: 'var(--sky)',
    offer: 'var(--go)', accepted: 'var(--go)', declined: 'var(--amber)', rejected: 'var(--red)', noresponse: 'var(--line)', withdrawn: 'var(--line)' };
  const dot = id => `<i class="dot" style="background:${COLOR[id] || 'var(--dim)'}"></i>`;
  const ACTIVE = ['applied', 'screening', 'test', 'interview1', 'interview2', 'interview3', 'offer'];
  const POS = ['screening', 'test', 'interview1', 'interview2', 'interview3', 'offer', 'accepted', 'declined'];
  const INTERVIEW = ['interview1', 'interview2', 'interview3', 'offer', 'accepted', 'declined'];
  const CLOSED = ['rejected', 'noresponse', 'withdrawn', 'declined', 'accepted'];
  const VERD = { apply: ['Подавай', 'var(--go)'], tailor: ['Подгони CV и подавай', 'var(--go)'], ask: ['Сначала уточни', 'var(--amber)'], skip: ['Не стоит', 'var(--red)'], incomplete: ['Мало данных', 'var(--muted)'] };
  const mkRu = m => (m === 'A' ? 'А' : 'Б');
  const verdictId = label => Object.keys(A.VERDICTS).find(k => A.VERDICTS[k].label === label) || '';

  function profile() {
    const d = JSON.parse(JSON.stringify(A.DEFAULT_PROFILE));
    const p = st.profile || {};
    return { ...d, ...p, skills: { ...(p.skills || d.skills) }, areas: p.areas || d.areas, intern: { ...d.intern, ...(p.intern || {}), placement: { ...d.intern.placement, ...((p.intern || {}).placement || {}) } } };
  }

  // ---------- Sheet rows as application objects for the shared lib code ----------
  function parseContacts(s) {
    return split(s, '•').map(x => {
      let name = '', value = x;
      const m = x.match(/^([^:]{2,60}):\s*(.+)$/);
      if (m && !/^https?$/i.test(m[1])) { name = m[1].trim(); value = m[2].trim(); }
      const type = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 'email' : /linkedin\.com/i.test(value) ? 'linkedin' : /^[+\d][\d\s()-]{8,}$/.test(value) ? 'phone' : 'name';
      return { name, value, type };
    });
  }
  function parseFollow(s) {
    const m = String(s || '').match(/^(\d+)\s*·\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return [];
    const at = new Date(+m[4], +m[3] - 1, +m[2], 12).toISOString();
    return Array.from({ length: Math.min(5, +m[1]) }, () => ({ at, channel: 'email' }));
  }
  const memo = new Map();
  function toApp(r) {
    const key = [r.updated, r.status, r.followup, r.contacts, (r.description || '').length].join('|');
    const hit = memo.get(r.id);
    if (hit && hit.key === key) return hit.app;
    const tools = split(r.tools, ','), missing = split(r.missing, ',');
    const app = {
      id: String(r.id), ticket: r.ticket || '', title: String(r.title || ''), company: String(r.company || ''), location: String(r.location || ''), url: String(r.url || ''),
      platform: String(r.platform || ''), status: idOf(r.status), appliedAt: /^\d{4}-\d{2}-\d{2}$/.test(String(r.appliedAt || '')) ? r.appliedAt + 'T12:00:00' : '',
      followUps: parseFollow(r.followup), contacts: parseContacts(r.contacts), description: String(r.description || ''), track: /intern/i.test(String(r.track || '')) ? 'intern' : 'job',
      chance: { score: r.chance === '' || r.chance == null ? null : Number(r.chance), matched: tools.filter(t => !missing.includes(t)), basic: [], similar: [], missing, tools, verdict: verdictId(r.verdict) },
      salaryText: String(r.salary || ''), nextDate: r.nextDate || '', notes: String(r.notes || ''), rejDays: r.rejDays, method: r.method,
    };
    app.market = Mk.marketOf({ title: app.title, workTypes: split(r.workTypes, ','), salaryText: app.salaryText, description: app.description });
    app.agency = F.isAgency(app);
    memo.set(r.id, { key, app });
    return app;
  }
  const rowById = id => st.rows.find(x => String(x.id) === String(id));
  const ageDays = r => r.appliedAt ? Math.floor((Date.now() - Date.parse(r.appliedAt + 'T12:00:00')) / 864e5) : 0;
  const ago = iso => { if (!iso) return ''; const d = Math.floor((Date.now() - Date.parse(iso + (iso.length === 10 ? 'T12:00:00' : ''))) / 864e5); return d <= 0 ? 'сегодня' : d === 1 ? 'вчера' : `${d} ${plural(d, 'день', 'дня', 'дней')} назад`; };

  // ---------- Apps Script API ----------
  async function api(method, params, body) {
    if (!st.cfg || !st.cfg.url || !st.cfg.token) throw new Error('Таблица не подключена');
    if (!/^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec\/?$/.test(st.cfg.url.split('?')[0])) throw new Error('Адрес должен быть вида https://script.google.com/macros/s/…/exec (не /dev и не ссылка на саму таблицу).');
    let res;
    try {
      if (method === 'GET') {
        const u = new URL(st.cfg.url);
        u.searchParams.set('token', st.cfg.token);
        Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
        res = await fetch(u.toString(), { redirect: 'follow' });
      } else {
        res = await fetch(st.cfg.url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ apps: [], patches: [], deletes: [], ...body, token: st.cfg.token }) });
      }
    } catch (e) {
      if (!navigator.onLine) throw new Error('Нет интернета');
      throw new Error('Скрипт не отвечает этой странице. В Apps Script: Deploy → Manage deployments → ✏ → «Who has access: Anyone» → Version: New version → Deploy. Данные защищает токен.');
    }
    let d;
    try { d = await res.json(); } catch (e) { throw new Error('Скрипт ответил не JSON. Проверь ссылку на веб-приложение и что развёрнута последняя версия Code.gs.'); }
    if (!d.ok) throw new Error(d.error === 'Wrong token' ? 'Неверный токен' : (d.error || 'Ошибка скрипта'));
    return d;
  }

  async function refresh(quiet) {
    if (!st.cfg) return;
    try {
      await flush();
      const [{ rows }, pr, ping] = await Promise.all([api('GET', {}), api('GET', { action: 'profile' }).catch(() => ({})), api('GET', { action: 'ping' }).catch(() => ({}))]);
      st.rows = rows;
      if (pr && pr.profile) st.profile = pr.profile;
      if (ping && ping.version) st.scriptVersion = ping.version;
      st.queue.forEach(it => { const r = rowById(it.id); if (r && it.type === 'patch') Object.assign(r, it.patch); if (!r && it.type === 'add') st.rows.unshift(it.row); });
      st.syncedAt = Date.now();
      save();
      setOnline(true);
      if (!quiet) toast('Данные обновлены');
      if (st.scriptVersion >= 17) loadInbox(false);
    } catch (e) {
      setOnline(navigator.onLine && !/fetch|network/i.test(String(e.message)));
      if (!quiet) toast(String(e.message || e));
    }
    render();
  }
  async function loadInbox(force) {
    st.inboxBusy = true; if (force) render();
    try {
      const d = await api('GET', { action: 'inbox', ...(force ? { force: '1' } : {}) });
      st.inbox = d.items || []; save();
      if (force) toast(`Почта проверена: ${st.inbox.length ? 'есть ' + st.inbox.length + ' ' + plural(st.inbox.length, 'письмо', 'письма', 'писем') : 'новых писем о вакансиях нет'}`);
    } catch (e) { if (force) toast(String(e.message || e)); }
    st.inboxBusy = false; render();
  }

  let flushing = null;
  async function flush() {
    if (flushing) return flushing;
    if (!st.queue.length || !st.cfg) return;
    flushing = (async () => {
      const batch = st.queue.slice();
      await api('POST', null, { apps: batch.filter(x => x.type === 'add').map(x => x.row), patches: batch.filter(x => x.type === 'patch').map(x => ({ id: x.id, ...x.patch })) });
      st.queue = st.queue.filter(x => !batch.includes(x));
      save(); setOnline(true);
    })();
    try { await flushing; } catch (e) { setOnline(false); } finally { flushing = null; }
  }
  const enqueue = item => { st.queue.push(item); save(); flush().then(updateBadges); };
  function patchRow(r, patch, msg, undoMsg) {
    const before = {}; Object.keys(patch).forEach(k => { before[k] = r[k] == null ? '' : r[k]; });
    Object.assign(r, patch, { updated: Date.now() });
    const item = { type: 'patch', id: r.id, patch, at: Date.now() };
    enqueue(item); render();
    if (msg) toast(msg, 'Отменить', () => {
      const i = st.queue.indexOf(item);
      if (i >= 0) st.queue.splice(i, 1); else enqueue({ type: 'patch', id: r.id, patch: before, at: Date.now() });
      Object.assign(r, before); save(); render(); closeSheet(); toast(undoMsg || 'Отменено');
    });
  }
  function setOnline(ok) {
    const f = $('#navFoot');
    if (f) f.textContent = st.queue.length ? `Не отправлено: ${st.queue.length}` : !ok ? 'Нет связи с таблицей' : st.syncedAt ? 'Синхронизировано ' + new Date(st.syncedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
  }
  const setStatus = (id, status) => { const r = rowById(id); if (r) patchRow(r, { status: A.statusLabel(status) }, `${r.company || r.title}: ${RU[status]}`); };

  // ---------- Mail ----------
  function mailHref(to, subject, body) {
    const mode = st.local.mail === 'auto' ? (matchMedia('(pointer: coarse)').matches ? 'mailto' : 'gmail') : st.local.mail;
    if (mode === 'mailto') return `mailto:${to || ''}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;
    return F.links.gmail(to, subject, body, st.local.from || '');
  }
  const bestContact = app => (app.contacts || []).find(c => c.type === 'email') || (app.contacts || []).find(c => c.type === 'phone') || (app.contacts || []).find(c => c.type === 'linkedin') || null;
  function followMsg(app) {
    const c = bestContact(app);
    const named = (app.contacts || []).find(x => x.name) || {};
    return { c, ...F.build(app, 'email', { name: (c && c.name) || named.name || '', value: c ? c.value : '' }, profile()) };
  }
  function markSent(id) {
    const r = rowById(id); if (!r) return;
    const n = parseFollow(r.followup).length;
    patchRow(r, { followup: `${n + 1} · ${ukDate(new Date())}` }, `Follow-up №${n + 1} отмечен: ${r.company || r.title}`);
    if (st.scriptVersion && st.scriptVersion < 17) setTimeout(() => toast('Обнови Code.gs до версии 17, иначе отметка follow-up не сохранится в таблице'), 2800);
  }
  function localFlag(kind, id, value, msg) {
    const prev = st.local[kind][id];
    if (value == null) delete st.local[kind][id]; else st.local[kind][id] = value;
    save(); render();
    toast(msg, 'Отменить', () => { if (prev == null) delete st.local[kind][id]; else st.local[kind][id] = prev; save(); render(); });
  }

  // ---------- Reading a job ----------
  const URL_RE = /https?:\/\/[^\s<>"']+/i;
  async function readJob(raw) {
    const text = String(raw || '').trim();
    const m = text.match(URL_RE);
    const onlyLink = m && text.replace(m[0], '').trim().length < 40;
    if (onlyLink) {
      const url = S.cleanUrl(m[0].replace(/[).,]+$/, ''));
      if (!st.cfg) throw new Error('Чтобы читать вакансии по ссылке, подключи Google Таблицу в настройках. Пока можно вставить текст вакансии.');
      let d;
      try { d = await api('GET', { action: 'fetchJob', url }); }
      catch (e) {
        if (/busy|429|999/.test(String(e.message))) throw new Error((/linkedin/i.test(url) ? 'LinkedIn' : 'Сайт') + ' сейчас не пускает автоматическое чтение. Скопируй текст вакансии (в приложении LinkedIn: «…» → «Поделиться» → «Копировать» или выдели описание в браузере) и вставь сюда вместе со ссылкой.');
        throw e;
      }
      const doc = new DOMParser().parseFromString(d.html || '', 'text/html');
      const site = E.siteFor(new URL(d.url || url).hostname);
      const job = E.parse(doc, doc, site, d.url || url, { useLd: true });
      if (!job.description || job.description.length < 200) {
        const body = E.blockText(doc.body);
        if (body.length > (job.description || '').length && Q && !Q.looksLikeResultsList(body)) job.description = body.slice(0, 15000);
      }
      if (!job.description || job.description.length < 200) throw new Error('Сайт не отдал текст вакансии. Открой вакансию, скопируй описание и вставь сюда.');
      return job;
    }
    if (text.length < 150) throw new Error('Вставь ссылку на вакансию или весь текст объявления.');
    const h = (Q && (Q.recoverHeader(text) || Q.recoverHeader(Q.cleanDescription(text).text))) || {};
    const lines = text.split('\n').map(x => x.trim()).filter(Boolean);
    const title = h.title || (lines[0] && lines[0].length < 90 ? lines[0] : '');
    const url = m ? S.cleanUrl(m[0]) : '';
    return { title, company: h.company || '', location: '', description: text, url, platform: url ? S.platformFromUrl(url) : 'Other' };
  }
  function analyzeJob(job) {
    const p = profile();
    const an = A.analyze(job, p);
    const c = an.chance;
    const full = { ...job, salary: an.salary, workTypes: an.workTypes };
    const market = Mk.marketOf(full);
    const office = Mk.officeDays(job.description);
    const worth = market === 'A' ? Mk.worthLeave(full, p) : null;
    const key = job.url ? S.normUrl(job.url) : '';
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const dup = st.rows.find(r => (key && r.url && S.normUrl(r.url) === key) || (job.title && norm(r.title) === norm(job.title) && norm(r.company) === norm(job.company)));
    const agency = F.isAgency({ company: job.company, description: job.description });
    const res = { job: { ...job, title: job.title || 'Без названия' }, an, c, market, office, worth, dup, agency, answers: Mk.answers(full, p, an), startedAt: Date.now() };
    scoreFit(res);
    return res;
  }
  async function analyze(raw) {
    st.busy = true; st.error = ''; st.result = null; st.letter = ''; st.letterWarn = []; render();
    try { st.result = analyzeJob(await readJob(raw)); } catch (e) { st.error = String(e.message || e); }
    st.busy = false; render();
    if (st.result) aiExtract(st.result);
    const r = $('#result'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function rowFromJob(job, an, c, status, res) {
    const nums = st.rows.map(x => parseInt(String(x.ticket || '').replace(/\D/g, ''), 10) || 0);
    return {
      id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ticket: 'APP-' + String(Math.max(0, ...nums) + 1).padStart(4, '0'),
      title: job.title, company: job.company || '', location: job.location || '', category: an.category || '', workTypes: (an.workTypes || []).join(', '),
      salary: (an.salary && an.salary.text) || job.salaryText || '', platform: job.platform || (job.url ? S.platformFromUrl(job.url) : 'Other'),
      appliedAt: todayIso(), status: A.statusLabel(status), chance: c.verdict !== 'incomplete' ? c.score : '', nextDate: '', notes: 'Добавлено с телефона',
      missing: (c.missing || []).join(', '), tools: (c.tools || []).join(', '), details: (an.details || []).join(' • '), url: job.url || '',
      benefits: (an.benefits || []).join(' • '), track: an.track === 'intern' ? 'Internship' : 'Job', verdict: A.VERDICTS[c.verdict] ? A.VERDICTS[c.verdict].label : '',
      cover: st.letter ? 'Written for this job' : '', fit2: res && res.fit && res.fit.score != null ? res.fit.score : '', predicted: res && res.chanceP ? Math.round(res.chanceP.p * 1000) / 10 : '',
      cvKind: res && res.tailored ? 'Tailored' : '', minutes: res && res.startedAt ? Math.max(1, Math.min(240, Math.round((Date.now() - res.startedAt) / 60000))) : '', description: String(an.description || job.description || '').slice(0, 40000), updated: Date.now(),
    };
  }
  function addRow(row) {
    st.rows.unshift(row);
    enqueue({ type: 'add', id: row.id, row, at: Date.now() });
    toast(`Добавлено в таблицу: ${row.ticket}`, 'Открыть', () => openApp(row.id));
  }
  function addFromResult() {
    const r = st.result; if (!r) return;
    if (r.chanceP) { r.facts.cover = !!st.letter; r.chanceP = CH.predict(r.facts, CH.stats(st.rows.map(rowFacts))); }
    addRow(rowFromJob(r.job, r.an, r.c, 'applied', r));
    st.local.later = st.local.later.filter(x => !(r.job.url && x.url === r.job.url));
    st.result = null; st.input = ''; st.letter = ''; LS.set('draft', ''); save();
    location.hash = '#today';
  }
  function saveLater() {
    const r = st.result; if (!r) return;
    if (!st.local.later.some(x => r.job.url && x.url === r.job.url)) {
      st.local.later.unshift({ id: 'l' + Date.now().toString(36), at: todayIso(), title: r.job.title, company: r.job.company || '', url: r.job.url || '', location: r.job.location || '', description: String(r.job.description || '').slice(0, 15000), platform: r.job.platform || '', market: r.market, verdict: r.c.verdict, score: r.c.score });
    }
    save(); toast('Сохранено в «Откликнуться с ПК» на экране «Сегодня»');
  }

  // ---------- AI (Groq) and the Claude prompt ----------
  // The AI cache lives in the encrypted vault; the oldest answers go when it grows past 150
  const aiCfg = () => ({ key: st.local.ai.key, model: st.local.ai.model, cache: {
    get: k => (st.local.llmCache || {})[k],
    set: (k, v) => { const c = st.local.llmCache = st.local.llmCache || {}; c[k] = v; const ks = Object.keys(c); if (ks.length > 150) ks.slice(0, ks.length - 150).forEach(x => delete c[x]); save(); },
  } });
  const groq = messages => LLM.chat(aiCfg(), messages, { cacheKey: false, temperature: 0.4 });
  const providerName = () => (st.local.ai.key ? LLM.PROVIDERS[LLM.providerOf(st.local.ai.key)].name : 'AI');

  // ---------- Precise Fit and interview chance ----------
  function rowFacts(r) {
    const a = toApp(r);
    return { status: a.status, appliedAt: a.appliedAt, title: a.title, company: a.company, location: a.location, agency: a.agency, method: r.method, adAge: r.adAge, applicants: r.applicants,
      fit: r.fit2 !== '' && r.fit2 != null ? r.fit2 : r.chance, market: a.market, tailored: r.cvKind ? r.cvKind === 'Tailored' : null, cover: r.cover ? !/^(no|none)/i.test(String(r.cover)) : null, predicted: r.predicted };
  }
  function scoreFit(res) {
    const reqs = res.ai && (res.ai.essential.length + res.ai.desirable.length >= 3) ? res.ai : FIT.fromAd(res.job.description, res.job.company);
    res.fit = FIT.compute(reqs, profile(), res.job);
    const agency = res.ai && res.ai.agency != null ? res.ai.agency : res.agency;
    res.facts = { title: res.job.title, company: res.job.company, location: res.job.location, agency, method: agency ? 'agency' : '', fit: res.fit.score, market: res.market, cover: !!st.letter };
    res.chanceP = CH.predict(res.facts, CH.stats(st.rows.map(rowFacts)));
    res.chanceD = CH.describe(res.chanceP);
  }
  async function aiExtract(res) {
    if (!st.local.ai.key || res.aiBusy || res.ai) return;
    res.aiBusy = true; render();
    try { res.ai = await LLM.extract(aiCfg(), res.job); if (res.ai.officeDays != null && res.office == null) res.office = res.ai.officeDays; scoreFit(res); }
    catch (e) { res.aiError = String(e.message || e); }
    res.aiBusy = false; if (st.result === res) render();
  }

  function skillsLine() {
    const sk = profile().skills || {};
    const of = lvl => Object.keys(sk).filter(k => sk[k] === lvl);
    return { strong: of('strong'), basic: of('basic') };
  }
  async function writeLetter(job, market) {
    const p = profile(), sk = skillsLine();
    const avail = market === 'B' ? `${Mk.daysText(p.workDays) || (p.daysPerWeek || 4) + ' days a week'}${p.hoursPerWeek ? ', up to ' + p.hoursPerWeek + ' hours a week' : ''}, alongside my Computing degree; can start immediately` : 'full-time, can start immediately';
    const why = String(st.local.why || '').trim();
    const sys = [
      'You write short UK cover letters for an entry-level IT support candidate.',
      'Use ONLY the facts given in FACTS and SKILLS. Never invent employers, dates, numbers, certificates, tools or achievements. If the ad asks for something not in the facts, do not claim it.',
      'British English, plain concrete sentences, 150–200 words, three or four short paragraphs. No buzzwords (passionate, dynamic, results-driven), no "I am writing to express my interest".',
      'Start with "Dear Hiring Manager," unless the ad names a contact person. End with the last paragraph: do NOT add a sign-off or a name.',
      why ? 'Use WHY THIS EMPLOYER in the first paragraph, keeping the meaning and wording close to the original.' : 'Where a reason for choosing this employer belongs, write exactly: [One sentence on why this employer].',
      'Return only the letter text.',
    ].join('\n');
    const user = [
      `JOB TITLE: ${job.title || 'not stated'}`, `EMPLOYER: ${job.company || 'not stated'}`,
      'JOB AD:', '"""', String(job.description || '').slice(0, 6000), '"""',
      'FACTS:', '"""', String(st.local.facts || DEFAULT_FACTS).slice(0, 3000), '"""',
      `SKILLS (confident): ${sk.strong.join(', ') || 'see facts'}`, `SKILLS (basic, say "familiar with"): ${sk.basic.join(', ') || 'none'}`,
      `AVAILABILITY: ${avail}`, why ? `WHY THIS EMPLOYER: ${why}` : '',
    ].filter(Boolean).join('\n');
    let text = await groq([{ role: 'system', content: sys }, { role: 'user', content: user }]);
    text = text.replace(/\n+(kind regards|best regards|yours (sincerely|faithfully)|regards)[\s\S]*$/i, '').trim();
    const sig = [p.signName, [p.signPhone, p.signLinkedIn].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
    // Tools the letter names that are neither in the facts nor in the skills profile
    const known = new Set([...sk.strong, ...sk.basic, ...A.extractTools(st.local.facts || '')]);
    const warn = A.extractTools(text).filter(t => !known.has(t));
    return { text: text + '\n\nKind regards,\n' + (sig || '[My name]'), warn };
  }
  function claudePrompt(app) {
    const p = profile();
    const why = String(st.local.why || '').trim();
    return P.build(app, { ...p, factBank: st.local.facts || DEFAULT_FACTS }, { letter: why.length >= 20, why });
  }
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); if (btn) { const t = btn.textContent; btn.textContent = 'Скопировано'; setTimeout(() => { btn.textContent = t; }, 1500); } else toast('Скопировано'); }
    catch (e) { toast('Не удалось скопировать: выдели текст и скопируй вручную'); }
  }

  // ---------- Today ----------
  function weekData() {
    const now = new Date(); const dow = (now.getDay() + 6) % 7;
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return { iso: isoOf(d), d, apps: [], cold: 0 }; });
    const byIso = Object.fromEntries(days.map(x => [x.iso, x]));
    st.rows.forEach(r => { const x = byIso[r.appliedAt]; if (x) x.apps.push(toApp(r)); });
    (st.local.employers || []).forEach(e => { if (e.contactedAt && byIso[e.contactedAt]) byIso[e.contactedAt].cold++; });
    const all = days.flatMap(x => x.apps);
    return { days, dow, B: all.filter(a => a.market === 'B').length, A: all.filter(a => a.market === 'A').length, C: days.reduce((t, x) => t + x.cold, 0) };
  }
  function todayLists() {
    const today = todayIso();
    const apps = st.rows.map(toApp);
    const snoozed = id => st.local.snooze[id] && st.local.snooze[id] > today;
    const q = F.queue(apps.filter(a => !st.local.noChannel[a.id] && !snoozed(a.id)));
    const due = apps.filter(a => a.nextDate && String(a.nextDate) <= today && !CLOSED.includes(a.status));
    const stale = st.rows.filter(r => idOf(r.status) === 'applied' && ageDays(r) >= 30 && !parseFollow(r.followup).length).map(toApp);
    const done = new Set(st.local.inboxDone || []);
    const inbox = (st.inbox || []).filter(it => {
      if (done.has(it.id)) return false;
      const r = it.rowId && rowById(it.rowId); if (!r) return true;
      const s = idOf(r.status);
      return !(it.kind === 'rejected' && s === 'rejected') && !(['interview', 'assessment'].includes(it.kind) && (POS.includes(s))) && !(it.kind === 'offer' && ['offer', 'accepted', 'declined'].includes(s));
    });
    return { follow: q.due, soon: q.soon, due, stale, inbox };
  }
  const KIND = { rejected: ['Отказ', 'bad', 'rejected'], interview: ['Приглашение', 'info', 'screening'], assessment: ['Тест / ассессмент', 'info', 'test'], offer: ['Оффер', 'ok', 'offer'] };
  function viewToday() {
    const w = weekData(), t = st.local.targets, L = todayLists(), p = profile();
    const study = st.local.studyDays || [];
    const DN = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const strip = w.days.map((x, i) => `<div class="day${study.includes(i) ? ' study' : ''}${i === w.dow ? ' today' : ''}"><div class="col" aria-label="${DN[i]}: ${x.apps.length} откликов">${x.apps.slice(0, 7).map(a => `<i class="${a.market}"></i>`).join('')}${Array.from({ length: Math.min(x.cold, 3) }, () => '<i class="C"></i>').join('')}</div><div class="lbl">${DN[i]}<small>${x.d.getDate()}</small></div></div>`).join('');
    const goal = (cls, n, of, label, hint) => `<div class="goal ${cls}"><b>${n}<span> / ${of}</span></b><div class="bar"><i style="width:${Math.min(100, of ? n / of * 100 : 0)}%"></i></div><small>${label}${hint ? '<br>' + hint : ''}</small></div>`;
    const sentence = w.B < t.B && w.dow >= 4 ? `До цели по рынку Б не хватает ${t.B - w.B}: выходные — хорошее время для откликов в школы и колледжи.` : w.B >= t.B ? 'Цель по рынку Б на неделю выполнена. Остальное время — follow-up и подготовка.' : (n => `Сегодня: ${n} ${plural(n, 'отклик', 'отклика', 'откликов')} на рынке Б, потом follow-up.`)(Math.max(1, Math.ceil((t.B - w.B) / Math.max(1, 7 - w.dow - study.filter(d => d >= w.dow).length))));

    const inbox = L.inbox.slice(0, 8).map(it => {
      const k = KIND[it.kind] || KIND.interview;
      const r = it.rowId && rowById(it.rowId);
      return `<div class="item"><div class="top"><div class="grow"><div class="tags"><span class="tag ${k[1]}">${k[0]}</span>${it.human ? '<span class="tag warn">пишет человек — ответь</span>' : ''}</div>
        <div class="t" style="margin-top:8px">${esc(r ? `${r.company} — ${r.title}` : it.from)}</div><div class="s">${esc(it.subject)}${r ? '' : ' · заявку в таблице не нашёл'}</div></div><span class="when">${esc(ago(String(it.date).slice(0, 10)))}</span></div>
        <div class="row">${r ? `<button class="btn go sm" data-inbox-apply="${esc(it.id)}">Отметить: ${k[0].toLowerCase()}</button>` : ''}<a class="btn line sm" href="${esc(it.link)}" target="_blank" rel="noopener">Открыть письмо</a><button class="btn quiet sm" data-inbox-skip="${esc(it.id)}">Не то</button></div></div>`;
    }).join('');

    const follow = L.follow.slice(0, 8).map(x => {
      const a = x.a, m = followMsg(a), c = m.c;
      const to = c && c.type === 'email' ? c.value : '';
      const contactLine = c ? `${c.name ? c.name + ': ' : ''}${c.value}` : 'контакта в вакансии нет — письмо на общий адрес или звонок';
      return `<div class="item"><div class="top">${dot(a.status)}<div class="grow"><div class="t">${esc(a.company || 'Компания не указана')}</div><div class="s">${esc(a.title)}</div></div><span class="when">${x.n ? `${x.n}-й отправлен` : esc(ago(a.appliedAt.slice(0, 10)))}</span></div>
        <div class="s small">${esc(contactLine)}${a.agency ? ' · агентство: лучше позвонить' : ''}</div>
        <div class="row"><a class="btn go sm" href="${esc(mailHref(to, m.subject, m.body))}" target="_blank" rel="noopener" data-mail="${esc(a.id)}">Написать</a>${c && c.type === 'phone' ? `<a class="btn line sm" href="tel:${esc(c.value.replace(/\s/g, ''))}">Позвонить</a>` : ''}<button class="btn line sm" data-sent="${esc(a.id)}">Отправил</button><button class="btn quiet sm" data-snooze="${esc(a.id)}">Через 3 дня</button><button class="btn quiet sm" data-nochan="${esc(a.id)}">Некуда писать</button></div></div>`;
    }).join('');
    const due = L.due.map(a => `<button class="app-row" data-open="${esc(a.id)}">${dot(a.status)}<span class="t">${esc(a.company || a.title)}</span><span class="r"><b>${esc(RU[a.status])}</b>${esc(a.nextDate === todayIso() ? 'сегодня' : 'просрочено')}</span><span class="m">${esc(a.title)}${a.notes ? ' · ' + esc(a.notes.slice(0, 60)) : ''}</span></button>`).join('');
    const later = st.local.later.slice(0, 10).map(x => `<div class="item"><div class="top"><span class="tag ${x.market}">${mkRu(x.market)}</span><div class="grow"><div class="t">${esc(x.title)}</div><div class="s">${esc([x.company, x.location].filter(Boolean).join(', '))}</div></div><span class="when">${esc(ago(x.at))}</span></div>
      <div class="row">${x.url ? `<a class="btn line sm" href="${esc(x.url)}" target="_blank" rel="noopener">Вакансия</a>` : ''}<button class="btn go sm" data-later-apply="${esc(x.id)}">Я откликнулся</button><button class="btn quiet sm" data-later-check="${esc(x.id)}">Разбор</button><button class="btn quiet sm" data-later-drop="${esc(x.id)}">Убрать</button></div></div>`).join('');

    const nothing = !L.inbox.length && !L.follow.length && !L.due.length && !L.stale.length;
    return `
      <div class="head"><div><h1>Сегодня</h1><p class="lead">${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>${st.cfg ? `<button class="btn quiet sm" id="refresh" aria-label="Обновить">Обновить</button>` : ''}</div>
      ${!st.cfg ? `<div class="note info">Подключи Google Таблицу, чтобы видеть заявки и дела: <a href="#setup">Настройки</a>. Разбор вакансий по тексту работает и без неё.</div>` : ''}
      <section class="paper" aria-label="Неделя">
        <div class="week">${strip}</div>
        <div class="goals">${goal('B', w.B, t.B, 'рынок Б', 'с учёбой')}${goal('A', w.A, t.A, 'рынок А', 'стоит академа')}${goal('B', w.C, t.C, 'холодных писем', '<a href="#employers">работодатели</a>')}</div>
        <p class="small muted">${esc(sentence)}</p>
        <div class="legend"><span><i></i>Б</span><span><i class="A"></i>А</span><span><i class="C"></i>письмо работодателю</span><span><i class="S"></i>пары</span></div>
      </section>
      ${st.scriptVersion >= 17 ? `<div class="sec-h"><h2>Из почты <span class="n">${L.inbox.length || ''}</span></h2><button class="btn quiet sm" id="scanInbox" ${st.inboxBusy ? 'disabled' : ''}>${st.inboxBusy ? 'Проверяю…' : 'Проверить почту'}</button></div>${inbox ? `<div class="group">${inbox}</div>` : '<p class="small muted" style="margin:0 2px">Новых писем об откликах нет. Ярлык и пересылка не нужны: скрипт читает весь ящик, ничего не меняя.</p>'}` : st.cfg ? '<div class="note small">Обнови Code.gs до версии 17 — тогда здесь появятся отказы и приглашения из Gmail, и статус меняется одним нажатием.</div>' : ''}
      ${due ? `<div class="sec-h"><h2>Следующий шаг <span class="n">${L.due.length}</span></h2></div><div class="group">${due}</div>` : ''}
      ${follow ? `<div class="sec-h"><h2>Follow-up <span class="n">${L.follow.length}</span></h2>${L.follow.length > 8 ? `<span class="small muted">первые 8 из ${L.follow.length}</span>` : ''}</div><div class="group">${follow}</div>` : ''}
      ${L.stale.length ? `<div class="sec-h"><h2>Месяц без ответа <span class="n">${L.stale.length}</span></h2></div><div class="paper tight"><p class="small muted">Отклики старше 30 дней без ответа и без follow-up. Закрой их, чтобы статистика была честной.</p><button class="btn line block" id="staleAll">Отметить все как «Нет ответа»</button></div>` : ''}
      ${later ? `<div class="sec-h"><h2>Откликнуться с ПК <span class="n">${st.local.later.length}</span></h2></div><div class="group">${later}</div>` : ''}
      ${nothing && st.cfg ? `<div class="empty"><b>Срочных дел нет</b>Разбери новую вакансию или напиши местному работодателю.<div class="row" style="justify-content:center;margin-top:12px"><a class="btn go sm" href="#check">Разобрать вакансию</a><a class="btn line sm" href="#employers">Работодатели рядом</a></div></div>` : ''}
      ${p && !st.profile && st.cfg ? '<div class="note small">Профиль навыков ещё не пришёл с компьютера. В расширении: Skills &amp; settings → Google Sheet → Sync now.</div>' : ''}`;
  }

  // ---------- Check a job ----------
  function viewCheck() {
    const r = st.result;
    return `
      <div><h1>Стоит подавать?</h1><p class="lead">Ссылка на вакансию или её текст. Разбор займёт пару секунд.</p></div>
      <div class="paper">
        <textarea id="jobInput" class="input" placeholder="https://www.linkedin.com/jobs/view/… или текст объявления" aria-label="Ссылка или текст вакансии" autocomplete="off">${esc(st.input)}</textarea>
        <div class="row"><button class="btn" id="paste">Вставить</button><button class="btn go grow" id="go" ${st.busy ? 'disabled' : ''}>${st.busy ? '<span class="spinner"></span> Читаю вакансию' : 'Разобрать'}</button></div>
        ${!st.cfg ? '<p class="small muted">Ссылки читает твой скрипт в Google Таблице — подключи её в настройках. Текст вакансии разбирается и без неё.</p>' : ''}
      </div>
      ${st.error ? `<div class="note bad">${esc(st.error)}</div>` : ''}
      ${r ? resultHtml(r) : ''}`;
  }
  function resultHtml(r) {
    const c = r.c, d = A.display(c);
    const v = VERD[c.verdict] || VERD.ask;
    const blocks = (c.gates && c.gates.blocks) || [], asks = (c.gates && c.gates.asks) || [];
    const officeBad = r.market === 'B' && r.office != null && r.office >= 4;
    const tags = [
      r.market === 'B' ? '<span class="tag B">Рынок Б · с учёбой</span>' : `<span class="tag A">Рынок А · full-time${r.worth ? (r.worth.ok ? ' · стоит академа' : ' · не цель') : ''}</span>`,
      r.agency ? '<span class="tag warn">агентство</span>' : '',
      r.office != null ? `<span class="tag ${officeBad ? 'bad' : r.office <= 2 ? 'ok' : ''}">${r.office === 0 ? 'удалённо' : `офис ${r.office} ${plural(r.office, 'день', 'дня', 'дней')} в неделю`}</span>` : '',
      r.an.salary && r.an.salary.text ? `<span class="tag">${esc(r.an.salary.text)}</span>` : '',
      r.job.location ? `<span class="tag">${esc(r.job.location)}</span>` : '',
    ].filter(Boolean).join('');
    const worthWhy = r.worth && !r.worth.ok ? [!r.worth.known && 'компании нет в списке', !r.worth.pay && `зарплата ниже £${(r.worth.min / 1000).toFixed(0)}k`, !r.worth.growth && 'не видно роста или обучения'].filter(Boolean).join(', ') : '';
    const ai = !!st.local.ai.key;
    return `
      <section id="result" class="paper">
        ${r.dup ? `<div class="note">Уже в таблице: <b>${esc(r.dup.ticket || '')}</b>, ${esc(RU[idOf(r.dup.status)] || r.dup.status)}. <a href="#" data-open="${esc(r.dup.id)}">Открыть</a></div>` : ''}
        <div><h2>${esc(r.job.title)}</h2><p class="small muted">${esc(r.job.company || 'компания не указана')}</p></div>
        <div class="verdict" style="--c:${v[1]}"><div class="score">${esc(d.text)}</div><div><div class="v">${v[0]}</div><p class="small muted">${esc(tr(d.hint || ''))}</p></div></div>
        <div class="tags">${tags}</div>
        ${officeBad ? `<div class="note bad">Для работы с учёбой не подходит: офис ${r.office} ${plural(r.office, 'день', 'дня', 'дней')} в неделю.</div>` : ''}
        ${worthWhy ? `<div class="note small">Full-time без признаков «стоит академа»: ${esc(worthWhy)}.</div>` : ''}
        ${r.agency ? '<p class="small muted">Агентства пока дали 0 скринингов из 28. Если работодатель известен — лучше откликнуться у него напрямую.</p>' : ''}
        ${blocks.length || asks.length ? `<ul class="checks">${blocks.map(b => `<li><span class="k bad">✕</span><span>${esc(tr(b.text))}</span></li>`).join('')}${asks.map(b => `<li><span class="k warn">?</span><span>${esc(tr(b.text))}</span></li>`).join('')}</ul>` : ''}
        ${fitHtml(r)}
        ${(c.tools || []).length ? `<div class="stack"><h3>Навыки из вакансии</h3><div class="tags">${(c.matched || []).map(t => `<span class="tag ok">${esc(t)}</span>`).join('')}${(c.basic || []).map(t => `<span class="tag warn">${esc(t)}</span>`).join('')}${(c.missing || []).map(t => `<span class="tag bad">${esc(t)}</span>`).join('')}</div><p class="tiny muted">зелёный — уверенно, жёлтый — базово, красный — нет</p></div>` : ''}
        ${!st.profile ? '<div class="note small">Профиль навыков ещё не пришёл с компьютера, поэтому навыки могут быть красными. В расширении: Skills &amp; settings → Google Sheet → Sync now.</div>' : ''}
      </section>
      <div class="row"><button class="btn go grow" id="applied">Я откликнулся</button><button class="btn line" id="later">На потом</button>${r.job.url ? `<a class="btn line" href="${esc(r.job.url)}" target="_blank" rel="noopener">Вакансия</a>` : ''}</div>
      <details class="paper fold" open><summary><h2>Ответы для анкеты</h2></summary>
        <div class="group">${r.answers.map((x, i) => `<div class="qa"><div class="q">${esc(x.q)}</div><div class="a">${esc(x.a)}</div><button class="btn sm" data-copy-answer="${i}">Копировать</button>${x.note ? `<div class="n">${esc(x.note)}</div>` : ''}</div>`).join('')}</div>
      </details>
      <details class="paper fold" ${st.letter ? 'open' : ''}><summary><h2>Cover letter</h2></summary>
        <label class="f">Почему эта компания — одно-два предложения своими словами
          <textarea class="input" id="why" style="min-height:70px" placeholder="Например: I use your app every week and want to support the people who build it.">${esc(st.local.why || '')}</textarea></label>
        <div class="row">${ai ? `<button class="btn go grow" id="aiLetter" ${st.letterBusy ? 'disabled' : ''}>${st.letterBusy ? '<span class="spinner"></span> Пишу письмо' : 'Написать письмо (AI)'}</button>` : ''}<button class="btn line grow" id="promptCopy">Промпт для Claude</button></div>
        ${!ai ? '<p class="small muted">С бесплатным ключом AI письмо пишется прямо здесь: <a href="#setup">Настройки → AI</a>. Промпт можно вставить в приложение Claude.</p>' : ''}
        ${st.letterWarn.length ? `<div class="note bad small">Проверь: в письме есть ${esc(st.letterWarn.join(', '))} — этого нет в твоих фактах и навыках. Убери, если не делал.</div>` : ''}
        ${st.letter ? `<textarea class="out" id="letterOut" aria-label="Текст письма">${esc(st.letter)}</textarea><div class="row"><button class="btn go grow" id="letterCopy">Копировать письмо</button><button class="btn quiet" id="letterClear">Очистить</button></div>` : ''}
      </details>
      <button class="btn quiet block" id="clear">Разобрать другую вакансию</button>`;
  }

  const EVK = { work: ['✓', 'ok'], lab: ['◐', 'ok'], similar: ['~', 'warn'], none: ['✕', 'bad'], check: ['?', 'warn'] };
  function reqLine(q) {
    const k = EVK[q.check && q.level !== 'none' && q.level !== 'work' ? 'check' : q.level] || EVK.check;
    return `<li><span class="k ${k[1]}">${k[0]}</span><span>${esc(q.text)}${q.note || q.level !== 'none' ? `<br><span class="tiny muted">${esc([FIT.LABEL[q.level] || '', q.note].filter(Boolean).join(' · '))}</span>` : ''}</span></li>`;
  }
  function fitHtml(r) {
    const f = r.fit, d = r.chanceD; if (!f) return '';
    const src = r.ai ? `требования прочитал AI (${providerName()})${r.ai.dropped ? `, ${r.ai.dropped} выдуманных строк отброшено` : ''}` : r.aiBusy ? 'AI читает требования…' : f.source === 'ad' ? 'требования из разделов вакансии' : 'требования по названным инструментам — приблизительно';
    return `<div class="paper tight" style="background:var(--paper-2);border:0">
      <div class="split"><div><p class="tiny muted">Точный Fit</p><p style="font-size:26px;font-weight:750;letter-spacing:-.03em">${f.score == null ? '—' : f.score + '%'}</p></div>
        <div><p class="tiny muted">Шанс приглашения</p><p style="font-size:${d.main.length > 8 ? 16 : 26}px;font-weight:750;letter-spacing:-.02em;line-height:1.25">${esc(d.main)}</p><p class="tiny muted">${esc(d.sub)}</p></div></div>
      <p class="small">${esc(f.summary)}</p>
      ${d.why ? `<p class="small muted">Шанс: ${esc(d.why)}${d.note ? '. ' + esc(d.note) : ''}</p>` : d.note ? `<p class="small muted">${esc(d.note)}</p>` : ''}
      <details class="fold"><summary><h3>Требования: ${f.essOk}/${f.essential.length} обязательных${f.desirable.length ? `, ${f.desOk}/${f.desirable.length} желательных` : ''}</h3></summary>
        ${f.essential.length ? `<p class="tiny muted" style="margin-top:10px">Обязательные</p><ul class="checks">${f.essential.map(reqLine).join('')}</ul>` : ''}
        ${f.desirable.length ? `<p class="tiny muted" style="margin-top:10px">Желательные</p><ul class="checks">${f.desirable.map(reqLine).join('')}</ul>` : ''}
        <p class="tiny muted" style="margin-top:8px">✓ работа · ◐ лаборатория или учёба · ~ похожий инструмент · ✕ нет · ? проверь сам. Откуда навык — отмечается в расширении: Skills &amp; settings.</p></details>
      <p class="tiny muted">${esc(src)}${!st.local.ai.key ? ' · с ключом AI разбор точнее: <a href="#setup">Настройки</a>' : ''}${r.aiError ? ' · ' + esc(r.aiError) : ''}</p>
      ${r.ai && r.ai.employer && r.agency ? `<div class="note small">Похоже, настоящий работодатель — <b>${esc(r.ai.employer)}</b>. Найди эту вакансию у него на сайте и откликнись напрямую: от агентств пока 0 скринингов из 28. <a href="https://www.google.com/search?q=${encodeURIComponent(`"${r.ai.employer}" ${r.job.title} job`)}" target="_blank" rel="noopener">Искать</a></div>` : ''}
    </div>`;
  }

  // ---------- Applications ----------
  function filtered() {
    const q = st.q.trim().toLowerCase(), f = st.filter, mk = st.market;
    return st.rows.filter(r => {
      const id = idOf(r.status);
      if (f === 'active' && !ACTIVE.includes(id)) return false;
      if (f === 'replied' && !POS.includes(id) && id !== 'rejected') return false;
      if (f === 'closed' && !CLOSED.includes(id)) return false;
      if (mk !== 'all' && toApp(r).market !== mk) return false;
      return !q || [r.title, r.company, r.ticket, r.location].join(' ').toLowerCase().includes(q);
    }).sort((x, y) => String(y.appliedAt).localeCompare(String(x.appliedAt)) || (y.updated || 0) - (x.updated || 0));
  }
  const rowHtml = r => { const id = idOf(r.status), a = toApp(r); const fu = parseFollow(r.followup).length; return `<button class="app-row" data-open="${esc(r.id)}">${dot(id)}<span class="t">${esc(r.title || 'Без названия')}</span><span class="r"><b>${esc(RU[id] || id)}</b>${esc(ago(r.appliedAt))}</span><span class="m">${esc([r.company, a.market === 'A' ? 'рынок А' : 'рынок Б', r.chance !== '' && r.chance != null ? `fit ${r.chance}%` : '', fu ? `✉ ${fu}` : ''].filter(Boolean).join(', '))}</span></button>`; };
  function viewApps() {
    const list = filtered();
    const F_ = [['active', 'В работе'], ['replied', 'Ответили'], ['closed', 'Закрытые'], ['all', 'Все']];
    const M_ = [['all', 'Оба рынка'], ['B', 'Б'], ['A', 'А']];
    return `
      <div class="head"><div><h1>Заявки</h1><p class="lead">${st.rows.length} всего${st.syncedAt ? ', обновлено ' + new Date(st.syncedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p></div>${st.cfg ? '<button class="btn quiet sm" id="refresh">Обновить</button>' : ''}</div>
      <input class="input" id="q" type="search" placeholder="Компания, роль или APP-…" value="${esc(st.q)}" aria-label="Поиск" autocomplete="off">
      <div class="seg" role="group" aria-label="Статус">${F_.map(([k, l]) => `<button data-filter="${k}" aria-pressed="${st.filter === k}">${l}</button>`).join('')}</div>
      <div class="seg" role="group" aria-label="Рынок">${M_.map(([k, l]) => `<button data-market="${k}" aria-pressed="${st.market === k}">${l}</button>`).join('')}</div>
      <div class="group" id="list">${list.length ? list.slice(0, 300).map(rowHtml).join('') : `<div class="empty"><b>${st.cfg ? 'Ничего не нашлось' : 'Таблица не подключена'}</b>${st.cfg ? 'Поменяй фильтр или поиск.' : '<a href="#setup">Подключить в настройках</a>'}</div>`}</div>`;
  }

  function openApp(id) {
    const r = rowById(id); if (!r) return;
    const a = toApp(r), cur = a.status;
    const m = followMsg(a);
    const to = m.c && m.c.type === 'email' ? m.c.value : '';
    const fu = a.followUps.length;
    const sh = $('#sheet');
    sh.innerHTML = `
      <div><p class="ticket">${esc([r.ticket, r.platform, r.appliedAt ? 'отклик ' + ago(r.appliedAt) : ''].filter(Boolean).join(' · '))}</p><h2 style="font-size:20px;margin-top:2px">${esc(r.title || 'Без названия')}</h2><p class="muted">${esc([r.company, r.location, r.salary].filter(Boolean).join(', '))}</p></div>
      <div class="tags"><span class="tag ${a.market}">Рынок ${mkRu(a.market)}</span>${a.agency ? '<span class="tag warn">агентство</span>' : ''}${r.chance !== '' && r.chance != null ? `<span class="tag">fit ${esc(r.chance)}%</span>` : ''}${r.verdict ? `<span class="tag">${esc(tr(r.verdict))}</span>` : ''}</div>
      <div class="stack"><h3>Что произошло?</h3><div class="status-grid">${ORDER.map(s => `<button data-set="${s}" aria-pressed="${s === cur}">${dot(s)}${RU[s]}</button>`).join('')}</div></div>
      ${ACTIVE.includes(cur) ? `<div class="paper tight" style="background:var(--paper-2);border:0"><div class="row"><h3 class="grow">Follow-up${fu ? `: отправлено ${fu}` : ''}</h3></div>
        <p class="small muted">${m.c ? esc(`${m.c.name ? m.c.name + ': ' : ''}${m.c.value}`) : 'Контакта в вакансии нет.'}${!m.c ? ` <a href="${esc(F.links.googleEmail(a.company))}" target="_blank" rel="noopener">Найти адрес компании</a>` : ''}</p>
        <div class="row"><a class="btn go sm" href="${esc(mailHref(to, m.subject, m.body))}" target="_blank" rel="noopener">Написать follow-up</a><button class="btn line sm" id="sheetSent">Отправил</button></div></div>` : ''}
      <div class="split"><label class="f">Следующий шаг<input class="input" id="nd" type="date" value="${esc(/^\d{4}-\d{2}-\d{2}$/.test(r.nextDate || '') ? r.nextDate : '')}"></label><div></div></div>
      <label class="f">Заметки<textarea class="input" id="notes" placeholder="Кто звонил, дата интервью, что спросили…" style="min-height:90px">${esc(r.notes || '')}</textarea></label>
      <div class="row"><button class="btn go grow" id="saveNotes">Сохранить</button>${r.url ? `<a class="btn line grow" href="${esc(r.url)}" target="_blank" rel="noopener">Вакансия</a>` : ''}</div>
      ${a.chance.tools.length ? `<div class="stack"><h3>Навыки</h3><div class="tags">${a.chance.matched.map(t => `<span class="tag ok">${esc(t)}</span>`).join('')}${a.chance.missing.map(t => `<span class="tag bad">${esc(t)}</span>`).join('')}</div></div>` : ''}
      ${r.description ? `<details class="fold"><summary><h3>Текст вакансии</h3></summary><div class="ad" style="margin-top:10px">${esc(r.description)}</div></details>
        <div class="row"><button class="btn line grow" id="reAnalyze">Разобрать снова</button><button class="btn line grow" id="sheetPrompt">Промпт для Claude</button></div>` : ''}`;
    sh.hidden = false; $('#scrim').hidden = false; $('#toast').hidden = true;
    $$('[data-set]', sh).forEach(b => b.onclick = () => { setStatus(r.id, b.dataset.set); closeSheet(); });
    const sent = $('#sheetSent', sh); if (sent) sent.onclick = () => { markSent(r.id); closeSheet(); };
    $('#saveNotes', sh).onclick = () => { patchRow(r, { notes: $('#notes').value, nextDate: $('#nd').value || '' }); closeSheet(); toast('Сохранено'); };
    const ra = $('#reAnalyze', sh);
    if (ra) ra.onclick = () => { closeSheet(); st.result = analyzeJob({ title: r.title, company: r.company, location: r.location, description: r.description, url: r.url, platform: r.platform }); st.letter = ''; location.hash = '#check'; render(); };
    const sp = $('#sheetPrompt', sh);
    if (sp) sp.onclick = () => { const res = claudePrompt(a); if (res.ok) copy(res.text, sp); else toast(res.error); };
  }
  function closeSheet() { $('#sheet').hidden = true; $('#scrim').hidden = true; }

  // ---------- Stats ----------
  function wilson(k, n) {
    if (!n) return [0, 0];
    const z = 1.96, p = k / n, c = (p + z * z / (2 * n)) / (1 + z * z / n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n);
    return [Math.max(0, (c - h) * 100), Math.min(100, (c + h) * 100)];
  }
  const pct = (k, n) => n ? (Math.round(k / n * 1000) / 10).toString().replace('.', ',') + '%' : '—';
  const pf = x => (Math.round(x * 10) / 10).toString().replace('.', ',');
  function viewStats() {
    const apps = st.rows.map(toApp), n = apps.length;
    if (!n) return `<h1>Статистика</h1><div class="empty"><b>Пока пусто</b>${st.cfg ? 'Цифры появятся после первых откликов.' : '<a href="#setup">Подключи таблицу</a>, чтобы увидеть цифры.'}</div>`;
    const reach = list => list.length;
    const replied = apps.filter(a => POS.includes(a.status) || a.status === 'rejected');
    const screens = apps.filter(a => POS.includes(a.status));
    const inter = apps.filter(a => INTERVIEW.includes(a.status));
    const offers = apps.filter(a => ['offer', 'accepted', 'declined'].includes(a.status));
    const [lo, hi] = wilson(screens.length, n);
    const closed = apps.filter(a => a.status !== 'applied' || (a.appliedAt && (Date.now() - Date.parse(a.appliedAt)) / 864e5 >= 21));
    const seg = (fn, min = 1) => {
      const g = {}; closed.forEach(a => { const k = fn(a) || '—'; (g[k] = g[k] || []).push(a); });
      return Object.entries(g).filter(([, v]) => v.length >= min).sort((x, y) => y[1].length - x[1].length).slice(0, 8)
        .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.length}</td><td>${v.filter(a => POS.includes(a.status)).length}</td><td>${pct(v.filter(a => a.status === 'rejected').length, v.length)}</td></tr>`).join('');
    };
    const table = (title, rows) => `<div class="paper"><h2>${title}</h2><table class="tbl"><thead><tr><th>Группа</th><th>Закрыто</th><th>Скрин.</th><th>Отказ</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    // Last 8 weeks
    const now = new Date(), mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
    const weeks = Array.from({ length: 8 }, (_, i) => { const s = new Date(mon); s.setDate(mon.getDate() - 7 * (7 - i)); const e = new Date(s); e.setDate(s.getDate() + 7); return { s, n: st.rows.filter(r => r.appliedAt >= isoOf(s) && r.appliedAt < isoOf(e)).length }; });
    const maxW = Math.max(1, ...weeks.map(w => w.n));
    const rej = apps.filter(a => a.status === 'rejected');
    const fast = rej.filter(a => a.rejDays !== '' && a.rejDays != null && Number(a.rejDays) <= 3).length;
    const miss = {}; apps.forEach(a => a.chance.missing.forEach(t => { miss[t] = (miss[t] || 0) + 1; }));
    const topMiss = Object.entries(miss).sort((x, y) => y[1] - x[1]).slice(0, 10);
    const sal = apps.map(a => A.parseSalary(a.salaryText)).filter(s => s && s.annualMin >= 12000 && s.annualMin < 120000).map(s => (s.annualMin + (s.annualMax || s.annualMin)) / 2).sort((x, y) => x - y);
    const median = sal.length ? sal[Math.floor(sal.length / 2)] : 0;
    const funnel = [['Отклики', n], ['Ответили', reach(replied)], ['Скрининг+', reach(screens)], ['Интервью+', reach(inter)], ['Оффер', reach(offers)]];
    const base = 1.4;
    const rate = screens.length / n * 100;
    return `
      <div><h1>Статистика</h1><p class="lead">Что работает, а что нет — по твоим заявкам.</p></div>
      <div class="kpis"><div class="kpi"><b>${n}</b><span>откликов</span></div><div class="kpi"><b>${pct(screens.length, n)}</b><span>до скрининга</span></div><div class="kpi"><b>${inter.length}</b><span>интервью</span></div><div class="kpi"><b>${pct(replied.length, n)}</b><span>ответили</span></div></div>
      <div class="paper"><h2>Конверсия в скрининг</h2>
        <p>${screens.length} из ${n}: <b>${pf(rate)}%</b>, вероятный диапазон ${pf(lo)}–${pf(hi)}%.</p>
        <p class="small muted">База на 24.11.2026: 3 из 209 (1,4%). ${n < 60 ? 'Выборка пока маленькая, выводы делать рано.' : rate > base * 1.5 ? 'Лучше базы — то, что изменилось, работает.' : rate < base / 1.5 ? 'Ниже базы: меньше откликов, больше подгонки и прямых откликов.' : 'Примерно на уровне базы.'} Одна удача из трёх — это не 33%: смотри на диапазон.</p></div>
      <div class="paper"><h2>Воронка</h2><div class="funnel">${funnel.map(([l, v]) => `<div class="f"><span>${l}</span><i style="width:${Math.max(1, v / n * 100)}%"></i><b>${v}</b></div>`).join('')}</div></div>
      <div class="paper"><h2>Отклики по неделям</h2><div class="bars">${weeks.map(w => `<div><b>${w.n || ''}</b><i style="height:${w.n / maxW * 100}%"></i>${w.s.getDate()}.${String(w.s.getMonth() + 1).padStart(2, '0')}</div>`).join('')}</div></div>
      ${table('По источнику', seg(a => a.platform))}
      ${table('Агентство или работодатель', seg(a => a.agency ? 'Агентство' : 'Напрямую'))}
      ${table('По рынку', seg(a => a.market === 'A' ? 'А · full-time' : 'Б · с учёбой'))}
      <p class="tiny muted" style="margin:-8px 2px 0">«Закрыто» — есть ответ или прошло 21+ день. Ожидающие свежие отклики не считаются.</p>
      <div class="paper"><h2>Отказы</h2><p>${rej.length} ${plural(rej.length, 'отказ', 'отказа', 'отказов')}${fast ? `, из них ${fast} за 0–3 дня — это автоматический отсев по анкете или CV, а не решение человека.` : '.'}</p>${fast >= 5 ? '<p class="small muted">Быстрые отказы чаще всего из-за ответов в анкете (график, стаж, права) или ключевых слов в CV. Сравни эти вакансии с теми, где был скрининг.</p>' : ''}</div>
      ${topMiss.length ? `<div class="paper"><h2>Чего не хватает чаще всего</h2><div class="tags">${topMiss.map(([t, k]) => `<span class="tag bad">${esc(t)} · ${k}</span>`).join('')}</div><p class="small muted">Первые 2–3 — кандидаты для домашней лаборатории или курса: каждая закроет пробел во многих вакансиях.</p></div>` : ''}
      ${median ? `<div class="paper"><h2>Зарплаты в твоих вакансиях</h2><p>Медиана <b>£${Math.round(median).toLocaleString('en-GB')}</b> в год по ${sal.length} вакансиям с указанной зарплатой.</p></div>` : ''}`;
  }

  // ---------- Templates ----------
  function viewTemplates() {
    const tpl = TP.merge(st.local.templates), j = st.local.tplJob, p = profile();
    return `
      <div><h1>Шаблоны писем</h1><p class="lead">Впиши роль, компанию и имя — шаблоны заполнятся сами.</p></div>
      <div class="paper"><div class="split"><label class="f">Роль<input class="input" data-tj="title" value="${esc(j.title)}" placeholder="IT Support Technician"></label><label class="f">Компания<input class="input" data-tj="company" value="${esc(j.company)}" placeholder="Harlow College"></label></div>
        <label class="f">Кому (имя, если знаешь)<input class="input" data-tj="name" value="${esc(j.name)}" placeholder="Jane"></label>
        ${!p.signName ? '<p class="small muted">Имя и телефон для подписи берутся из настроек расширения (Settings → Follow-ups).</p>' : ''}</div>
      ${TP.ORDER.map(k => { const t = tpl[k]; const body = TP.fill(t.body, j, p); const left = TP.leftovers(body); const subj = TP.fill(t.subject || '', j, p); return `
        <details class="paper fold"><summary><h2>${esc(tr(t.title))}</h2></summary>
          ${left.length ? `<p class="small" style="color:var(--amber)">Дописать: ${esc(left.join(', '))}</p>` : ''}
          <textarea class="out" data-tbody="${k}" aria-label="${esc(t.title)}">${esc(body)}</textarea>
          <div class="row"><button class="btn go sm" data-tcopy="${k}">Копировать</button>${k === 'speculative' ? `<a class="btn line sm" href="${esc(mailHref('', subj, body))}" target="_blank" rel="noopener">Открыть в почте</a>` : ''}<button class="btn quiet sm" data-tsave="${k}">Сохранить как шаблон</button>${st.local.templates[k] ? `<button class="btn quiet sm" data-treset="${k}">Вернуть исходный</button>` : ''}</div>
        </details>`; }).join('')}
      <p class="tiny muted">Правки сохраняются на этом устройстве. «Сохранить как шаблон» запоминает текст вместе с подстановками — роль и компанию потом поменяй вручную.</p>`;
  }

  // ---------- Employers nearby (market B) ----------
  const SEED = [
    ['University of Hertfordshire', 'Университет', 'Hatfield'], ['Anglia Ruskin University', 'Университет', 'Cambridge, Chelmsford'], ['University of Cambridge', 'Университет', 'Cambridge'],
    ['Northumbria University London: careers', 'Университет', 'London'], ['Harlow College', 'Колледж', 'Harlow'], ['Hertford Regional College', 'Колледж', 'Ware, Broxbourne'],
    ['Cambridge Regional College', 'Колледж', 'Cambridge'], ['Chelmsford College', 'Колледж', 'Chelmsford'], ['North Hertfordshire College', 'Колледж', 'Stevenage'],
    ['Bishop\'s Stortford College', 'Школа', 'Bishop\'s Stortford'], ['Hockerill Anglo-European College', 'Школа', 'Bishop\'s Stortford'], ['Birchwood High School', 'Школа', 'Bishop\'s Stortford'],
    ['The Bishop\'s Stortford High School', 'Школа', 'Bishop\'s Stortford'], ['Herts and Essex High School', 'Школа', 'Bishop\'s Stortford'], ['Saffron Walden County High School', 'Школа', 'Saffron Walden'],
    ['Felsted School', 'Школа', 'Felsted'], ['Haileybury', 'Школа', 'Hertford'], ['East Herts Council', 'Совет', 'Hertford, Bishop\'s Stortford'], ['Uttlesford District Council', 'Совет', 'Saffron Walden'],
    ['Harlow Council', 'Совет', 'Harlow'], ['Hertfordshire County Council', 'Совет', 'Hertford'], ['Essex County Council', 'Совет', 'Chelmsford'],
    ['The Princess Alexandra Hospital NHS Trust', 'NHS', 'Harlow'], ['Cambridge University Hospitals (Addenbrooke\'s)', 'NHS', 'Cambridge'], ['London Stansted Airport', 'Аэропорт', 'Stansted'],
    ['Currys', 'Ритейл', 'Harlow'], ['Apple Store, Grand Arcade', 'Ритейл', 'Cambridge'], ['IT-компании (MSP) рядом', 'MSP', 'Bishop\'s Stortford, Harlow'],
  ];
  const EST = { todo: ['Не писал', ''], sent: ['Написал', 'info'], replied: ['Ответили', 'ok'], no: ['Не подходит', 'bad'] };
  function employers() {
    if (!st.local.employers) { st.local.employers = SEED.map(([name, type, town], i) => ({ id: 'e' + i, name, type, town, status: 'todo', contact: '', contactedAt: '', note: '' })); save(); }
    return st.local.employers;
  }
  function viewEmployers() {
    const list = employers(), f = st.empFilter, w = weekData(), t = st.local.targets;
    const shown = list.filter(e => f === 'all' || e.status === f);
    const tpl = TP.merge(st.local.templates).speculative, p = profile();
    const search = e => e.type === 'MSP' ? `https://www.google.com/maps/search/${encodeURIComponent('IT support company near Bishop\'s Stortford')}` : `https://www.google.com/search?q=${encodeURIComponent(`"${e.name.replace(/:.*$/, '')}" IT jobs OR vacancies`)}`;
    return `
      <div><h1>Работодатели рядом</h1><p class="lead">Рынок Б без конкуренции LinkedIn: школы, колледжи, советы, больницы и местные IT-компании. Холодных писем на этой неделе: ${w.C} из ${t.C}.</p></div>
      <div class="seg" role="group" aria-label="Фильтр">${[['all', 'Все'], ['todo', 'Не писал'], ['sent', 'Написал'], ['replied', 'Ответили']].map(([k, l]) => `<button data-emp-filter="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
      <div class="group">${shown.map(e => { const body = TP.fill(tpl.body, { name: '', company: e.name }, p); return `
        <div class="item"><div class="top"><div class="grow"><div class="t">${esc(e.name)}</div><div class="s">${esc(e.type)}, ${esc(e.town)}${e.contactedAt ? ` · написал ${esc(ago(e.contactedAt))}` : ''}</div></div><span class="tag ${EST[e.status][1]}">${EST[e.status][0]}</span></div>
          <input class="input" data-emp-contact="${esc(e.id)}" value="${esc(e.contact)}" placeholder="Email отдела IT/HR или ссылка на вакансии" aria-label="Контакт ${esc(e.name)}" style="padding:9px 12px;font-size:15px">
          <div class="row"><a class="btn line sm" href="${esc(search(e))}" target="_blank" rel="noopener">${e.type === 'MSP' ? 'Найти на карте' : 'Вакансии'}</a><a class="btn go sm" href="${esc(mailHref(/@/.test(e.contact) ? e.contact : '', TP.fill(tpl.subject, {}, p), body))}" target="_blank" rel="noopener" data-emp-mail="${esc(e.id)}">Письмо</a>
            <select class="input" data-emp-status="${esc(e.id)}" aria-label="Статус" style="width:auto;padding:7px 34px 7px 12px;font-size:14px;min-height:38px">${Object.entries(EST).map(([k, v]) => `<option value="${k}" ${e.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>${e.id.startsWith('u') ? `<button class="btn quiet sm" data-emp-del="${esc(e.id)}">Удалить</button>` : ''}</div></div>`; }).join('') || '<div class="empty">Под этот фильтр никого нет.</div>'}</div>
      <details class="paper fold"><summary><h2>Добавить работодателя</h2></summary>
        <label class="f">Название<input class="input" id="empName" placeholder="Например, местная IT-компания"></label>
        <div class="split"><label class="f">Тип<select class="input" id="empType">${['MSP', 'Школа', 'Колледж', 'Университет', 'Совет', 'NHS', 'Ритейл', 'Другое'].map(x => `<option>${x}</option>`).join('')}</select></label><label class="f">Город<input class="input" id="empTown" placeholder="Harlow"></label></div>
        <button class="btn go" id="empAdd">Добавить</button></details>
      <p class="tiny muted">«Письмо» открывает шаблон «Email to a local IT company or school» и отмечает работодателя как «Написал». Список хранится на этом устройстве.</p>`;
  }

  // ---------- More (phone) and Settings ----------
  function viewMore() {
    const link = (href, icon, title, sub) => `<a class="more-link" href="${href}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${title}<small>${sub}</small></span></a>`;
    return `<h1>Ещё</h1><div class="group">
      ${link('#stats', '<path d="M5 20V11M10 20V5M15 20v-7M20 20V9" />', 'Статистика', 'конверсия, воронка, источники, отказы')}
      ${link('#employers', '<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6" />', 'Работодатели рядом', 'школы, колледжи, MSP — холодные письма')}
      ${link('#templates', '<path d="M4 6l8 6 8-6M4 6h16v12H4z" />', 'Шаблоны писем', 'cover letter, письмо работодателю, ответы')}
      ${link('#setup', '<circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" />', 'Настройки', 'таблица, цели, почта, AI, PIN')}</div>
      <div class="paper tight"><h3>Тема</h3><div class="seg" role="group" aria-label="Тема">${[['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([k, l]) => `<button data-theme-set="${k}" aria-pressed="${(LS.get('theme', 'auto') || 'auto') === k}">${l}</button>`).join('')}</div></div>`;
  }
  function viewSetup() {
    const c = st.cfg || {}, l = st.local, p = profile();
    const accounts = (p.gmailAccounts || []).filter(Boolean);
    return `
      <h1>Настройки</h1>
      <section class="paper"><h2>Google Таблица</h2>
        <p class="small muted">В расширении открой Settings → Phone app и открой ссылку подключения на этом устройстве — всё заполнится само. Или вставь адрес и токен (меню таблицы Job Tracker → Show sync token).</p>
        <label class="f">Адрес веб-приложения (…/exec)<input class="input" id="cfgUrl" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(c.url || '')}" autocomplete="off"></label>
        <label class="f">Токен<input class="input" id="cfgToken" type="password" value="${esc(c.token || '')}" autocomplete="off"></label>
        <button class="btn go" id="cfgSave">Сохранить и проверить</button><div id="cfgMsg" class="small"></div>
        ${st.scriptVersion ? `<p class="small ${st.scriptVersion < 17 ? '' : 'muted'}" ${st.scriptVersion < 17 ? 'style="color:var(--amber)"' : ''}>Code.gs версии ${st.scriptVersion}${st.scriptVersion < 17 ? ' — обнови до 17: письма из Gmail и отметки follow-up с телефона' : ''}.</p>` : ''}
      </section>
      <section class="paper"><h2>Цели на неделю</h2><div class="goals">
        <label class="f">Рынок Б<input class="input" type="number" min="0" max="40" data-target="B" value="${l.targets.B}"></label>
        <label class="f">Рынок А<input class="input" type="number" min="0" max="40" data-target="A" value="${l.targets.A}"></label>
        <label class="f">Холодные письма<input class="input" type="number" min="0" max="40" data-target="C" value="${l.targets.C}"></label></div>
        <p class="small muted">По плану: Б 6–8 откликов и 2–3 письма, А 8–10 точечных, только если «стоит академа». Дни с парами на полоске недели: ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d, i) => `<label class="check" style="display:inline-flex;margin-right:8px"><input type="checkbox" data-study="${i}" ${l.studyDays.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</p></section>
      <section class="paper"><h2>Почта</h2>
        <label class="f">Как открывать письма<select class="input" id="mailMode"><option value="auto" ${l.mail === 'auto' ? 'selected' : ''}>Само: на телефоне — приложение, на компьютере — Gmail</option><option value="mailto" ${l.mail === 'mailto' ? 'selected' : ''}>Приложение почты</option><option value="gmail" ${l.mail === 'gmail' ? 'selected' : ''}>Gmail в браузере</option></select></label>
        <label class="f">Отправлять из Gmail-аккаунта<input class="input" id="mailFrom" list="accts" value="${esc(l.from)}" placeholder="oleh.poratui@gmail.com"><datalist id="accts">${accounts.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
        <p class="small muted">Письмо всегда только открывается готовым — отправляешь ты.</p></section>
      <section class="paper"><h2>AI</h2>
        <p class="small muted">Нужен один бесплатный ключ — любой из трёх. Ключ хранится только на этом устройстве, зашифрованный PIN-кодом. В AI уходят текст вакансии и факты ниже, без имени, телефона и почты.</p>
        <ul class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px">
          <li><b>Groq</b> (лучший вариант, есть распознавание голоса): <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> → Create API Key.</li>
          <li><b>Gemini</b> (если Groq не пускает): <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> → Create API key. На бесплатном тарифе Google может использовать запросы для улучшения моделей.</li>
          <li><b>OpenRouter</b>: <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>, бесплатные модели, около 50 запросов в день.</li></ul>
        <label class="f">Ключ (gsk_…, AIza… или sk-or-…)<input class="input" id="aiKey" type="password" value="${esc(l.ai.key)}" placeholder="вставь ключ" autocomplete="off"></label>
        <label class="f">Модель — можно не трогать<input class="input" id="aiModel" value="${esc(l.ai.model)}" placeholder="${esc(l.ai.key ? LLM.modelFor(l.ai.key, '') : 'выберется сама')}"></label>
        <div class="row"><button class="btn go" id="aiSave">Сохранить</button><button class="btn line" id="aiTest">Проверить ключ</button></div><div id="aiMsg" class="small"></div>
        <label class="f">Факты о тебе — единственный источник для AI и промпта Claude<textarea class="input" id="facts" style="min-height:200px">${esc(l.facts)}</textarea></label>
        <div class="row"><button class="btn line" id="factsSave">Сохранить факты</button><button class="btn quiet" id="factsReset">Вернуть исходные</button></div></section>
      ${K ? `<section class="paper"><h2>PIN-код</h2><p class="small muted">Приложение блокируется через 5 минут в фоне. После 10 неверных попыток данные на устройстве стираются (в таблице всё остаётся).</p><div class="row"><button class="btn line grow" id="lockNow">Заблокировать</button><button class="btn line grow" id="changePin">Сменить PIN</button></div></section>` : ''}
      <section class="paper"><h2>На главный экран</h2><p class="small muted">Chrome на Android: меню ⋮ → «Установить приложение». После этого Job Tracker появится в меню «Поделиться» в LinkedIn, Indeed и Reed. На компьютере: значок установки в адресной строке Chrome.</p></section>
      <div class="seg" role="group" aria-label="Тема">${[['auto', 'Тема как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([k, lb]) => `<button data-theme-set="${k}" aria-pressed="${(LS.get('theme', 'auto') || 'auto') === k}">${lb}</button>`).join('')}</div>
      ${st.cfg ? '<button class="btn danger block" id="disconnect">Отключить таблицу на этом устройстве</button>' : ''}`;
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg, action, fn) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
    t.hidden = false;
    if (action) t.querySelector('button').onclick = () => { t.hidden = true; fn(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, action ? 10000 : 2800);
  }

  // ---------- PIN ----------
  function viewLock() {
    const create = st.lock === 'create', step2 = create && st.pin1;
    const title = create ? (step2 ? 'Повтори PIN' : 'Придумай PIN-код') : 'Введи PIN';
    const sub = create ? (step2 ? 'Ещё раз, чтобы не ошибиться.' : 'От 4 до 8 цифр. Им шифруются токен таблицы, заявки и ключ AI на этом устройстве.') : 'Job Tracker заблокирован.';
    const dots = Array.from({ length: Math.max(4, st.pin.length) }, (_, i) => `<i class="${i < st.pin.length ? 'on' : ''}"></i>`).join('');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    return `<div class="lock"><span class="mark-logo" aria-hidden="true"></span><h1>${title}</h1><p class="lead">${sub}</p>
      <div class="dots ${st.pinMsg ? 'shake' : ''}" aria-label="Введено цифр: ${st.pin.length}">${dots}</div><p class="pin-msg" role="alert">${esc(st.pinMsg)}</p>
      <div class="keypad">${keys.map(k => k ? `<button data-key="${k}" aria-label="${k === '⌫' ? 'Стереть' : k}">${k}</button>` : '<span></span>').join('')}</div>
      <button class="btn go block" id="pinGo" ${st.pin.length >= 4 ? '' : 'disabled'}>${create ? (step2 ? 'Сохранить PIN' : 'Дальше') : 'Открыть'}</button>
      ${!create ? '<button class="btn quiet block" id="pinForgot">Забыл PIN</button>' : ''}</div>`;
  }
  async function pinSubmit() {
    const pin = st.pin;
    if (!V.validPin(pin)) return;
    if (st.lock === 'create') {
      if (!st.pin1) { st.pin1 = pin; st.pin = ''; st.pinMsg = ''; return render(); }
      if (pin !== st.pin1) { st.pin1 = ''; st.pin = ''; st.pinMsg = 'PIN не совпал, попробуй снова'; return render(); }
      K = await V.newKey(pin);
      st.lock = null; st.pin = st.pin1 = ''; st.pinMsg = '';
      await save(); toast('PIN сохранён');
      return afterUnlock();
    }
    st.pinMsg = 'Проверяю…'; render();
    try {
      const { data, k } = await V.open(pin, LS.get('vault', null));
      K = k; VAULT_KEYS.forEach(key => { if (data[key] !== undefined && data[key] !== null) st[key] = data[key]; });
      fixLocal();
      LS.set('pinFails', 0);
      st.lock = null; st.pin = ''; st.pinMsg = '';
      afterUnlock();
    } catch (e) {
      const fails = (LS.get('pinFails', 0) || 0) + 1;
      LS.set('pinFails', fails); st.pin = '';
      if (fails >= MAX_FAILS) { wipe(); st.lock = null; st.pinMsg = ''; location.hash = '#setup'; render(); toast('10 неверных PIN подряд: данные на устройстве стёрты. Подключи таблицу заново.'); return; }
      st.pinMsg = `Неверный PIN. Осталось попыток: ${MAX_FAILS - fails}`; render();
    }
  }
  function afterUnlock() {
    if (st.pendingCfg) { st.cfg = st.pendingCfg; st.pendingCfg = null; save(); }
    const sh = st.pendingShare; st.pendingShare = null;
    render();
    if (sh) { st.input = sh; location.hash = '#check'; render(); analyze(sh); }
    if (st.cfg) refresh(true);
  }
  function bindLock(v) {
    $$('[data-key]', v).forEach(b => b.onclick = () => pinKey(b.dataset.key));
    const go = $('#pinGo', v); if (go) go.onclick = pinSubmit;
    const fg = $('#pinForgot', v);
    if (fg) fg.onclick = () => {
      if (fg.dataset.sure) { wipe(); st.lock = null; location.hash = '#setup'; render(); toast('Данные на устройстве стёрты. Подключи таблицу заново: заявки в Google Таблице на месте.'); return; }
      fg.dataset.sure = '1'; fg.textContent = 'Стереть данные на устройстве и подключить заново?';
    };
  }
  function pinKey(k) {
    if (k === '⌫') st.pin = st.pin.slice(0, -1); else if (/^\d$/.test(k) && st.pin.length < 8) st.pin += k;
    st.pinMsg = ''; render();
  }
  document.addEventListener('keydown', e => {
    if (!st.lock) { if (e.key === 'Escape') closeSheet(); return; }
    if (/^\d$/.test(e.key)) pinKey(e.key); else if (e.key === 'Backspace') pinKey('⌫'); else if (e.key === 'Enter') pinSubmit();
  });

  // ---------- Router ----------
  const ROUTES = { today: viewToday, check: viewCheck, apps: viewApps, stats: viewStats, templates: viewTemplates, employers: viewEmployers, more: viewMore, setup: viewSetup };
  const route = () => { const r = location.hash.replace('#', '').split('=')[0]; return ROUTES[r] ? r : (r === 'add' ? 'check' : r === 'list' ? 'apps' : 'today'); };
  function updateBadges() {
    if (st.lock) return;
    const L = todayLists();
    $('#cntToday').textContent = (L.inbox.length + L.due.length + L.follow.length) || '';
    setOnline(true);
  }
  function render() {
    const r = route(), v = $('#view');
    document.body.classList.toggle('locked', !!st.lock);
    if (st.lock) { v.innerHTML = viewLock(); bindLock(v); return; }
    v.innerHTML = ROUTES[r]();
    const tab = ['stats', 'templates', 'employers', 'setup'].includes(r) && matchMedia('(max-width: 919px)').matches ? 'more' : r;
    $$('.nav a[data-tab]').forEach(a => a.setAttribute('aria-current', a.dataset.tab === tab || a.dataset.tab === r ? 'page' : 'false'));
    updateBadges();
    bind(v);
  }
  function setTheme(k) { LS.set('theme', k === 'auto' ? null : k); if (k === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = k; render(); }

  function bind(v) {
    $$('[data-open]', v).forEach(b => b.onclick = e => { e.preventDefault(); openApp(b.dataset.open); });
    $$('[data-filter]', v).forEach(b => b.onclick = () => { st.filter = b.dataset.filter; LS.set('filter', st.filter); render(); });
    $$('[data-market]', v).forEach(b => b.onclick = () => { st.market = b.dataset.market; LS.set('marketFilter', st.market); render(); });
    $$('[data-theme-set]', v).forEach(b => b.onclick = () => setTheme(b.dataset.themeSet));
    const rf = $('#refresh', v); if (rf) rf.onclick = () => refresh();
    // Today
    $$('[data-sent]', v).forEach(b => b.onclick = () => markSent(b.dataset.sent));
    $$('[data-mail]', v).forEach(b => b.addEventListener('click', () => setTimeout(() => { const r = rowById(b.dataset.mail); if (r) toast('Отправил письмо?', 'Да, отметить', () => markSent(r.id)); }, 600)));
    $$('[data-snooze]', v).forEach(b => b.onclick = () => { const d = new Date(); d.setDate(d.getDate() + 3); localFlag('snooze', b.dataset.snooze, isoOf(d), 'Напомню через 3 дня'); });
    $$('[data-nochan]', v).forEach(b => b.onclick = () => localFlag('noChannel', b.dataset.nochan, true, 'Убрал из follow-up: ждём ответа'));
    $$('[data-inbox-apply]', v).forEach(b => b.onclick = () => {
      const it = st.inbox.find(x => x.id === b.dataset.inboxApply); if (!it) return;
      const r = rowById(it.rowId); if (!r) return;
      const kind = KIND[it.kind] || KIND.interview;
      const date = new Date(it.date);
      const note = `${ukDate(date)} Gmail: ${it.subject}`.slice(0, 200);
      st.local.inboxDone.push(it.id); save();
      patchRow(r, { status: A.statusLabel(kind[2]), notes: [r.notes, note].filter(Boolean).join('\n') }, `${r.company}: ${RU[kind[2]]}`);
      api('POST', null, { inboxDismiss: [it.id] }).catch(() => {});
    });
    $$('[data-inbox-skip]', v).forEach(b => b.onclick = () => { st.local.inboxDone.push(b.dataset.inboxSkip); save(); render(); api('POST', null, { inboxDismiss: [b.dataset.inboxSkip] }).catch(() => {}); });
    const si = $('#scanInbox', v); if (si) si.onclick = () => loadInbox(true);
    const sa = $('#staleAll', v);
    if (sa) sa.onclick = () => {
      const list = todayLists().stale; const before = list.map(a => [rowById(a.id), rowById(a.id).status]);
      const items = list.map(a => { const r = rowById(a.id); r.status = A.statusLabel('noresponse'); r.updated = Date.now(); const it = { type: 'patch', id: r.id, patch: { status: r.status }, at: Date.now() }; st.queue.push(it); return it; });
      save(); flush().then(updateBadges); render();
      toast(`${list.length} отмечено «Нет ответа»`, 'Отменить', () => { before.forEach(([r, s]) => { const i = st.queue.findIndex(x => items.includes(x) && x.id === r.id); if (i >= 0) st.queue.splice(i, 1); else st.queue.push({ type: 'patch', id: r.id, patch: { status: s }, at: Date.now() }); r.status = s; }); save(); flush(); render(); });
    };
    $$('[data-later-drop]', v).forEach(b => b.onclick = () => { st.local.later = st.local.later.filter(x => x.id !== b.dataset.laterDrop); save(); render(); });
    $$('[data-later-check]', v).forEach(b => b.onclick = () => { const x = st.local.later.find(y => y.id === b.dataset.laterCheck); if (!x) return; st.result = analyzeJob(x); st.letter = ''; location.hash = '#check'; });
    $$('[data-later-apply]', v).forEach(b => b.onclick = () => {
      const x = st.local.later.find(y => y.id === b.dataset.laterApply); if (!x) return;
      const r = analyzeJob(x); addRow(rowFromJob(r.job, r.an, r.c, 'applied', r));
      st.local.later = st.local.later.filter(y => y.id !== x.id); save(); render();
    });
    // Check
    const inp = $('#jobInput', v);
    if (inp) {
      inp.oninput = () => { st.input = inp.value; LS.set('draft', st.input); };
      $('#go', v).onclick = () => analyze(inp.value);
      $('#paste', v).onclick = async () => {
        try { const t = await navigator.clipboard.readText(); inp.value = t; st.input = t; LS.set('draft', t); if (t.trim()) analyze(t); }
        catch (e) { inp.focus(); toast('Нажми и удерживай поле, чтобы вставить'); }
      };
    }
    $$('[data-copy-answer]', v).forEach(b => b.onclick = () => copy(st.result.answers[+b.dataset.copyAnswer].a, b));
    const ap = $('#applied', v); if (ap) ap.onclick = addFromResult;
    const lt = $('#later', v); if (lt) lt.onclick = saveLater;
    const cl = $('#clear', v); if (cl) cl.onclick = () => { st.result = null; st.input = ''; st.letter = ''; LS.set('draft', ''); render(); window.scrollTo(0, 0); $('#jobInput').focus(); };
    const why = $('#why', v); if (why) why.oninput = () => { st.local.why = why.value; save(); };
    const al = $('#aiLetter', v);
    if (al) al.onclick = async () => {
      st.letterBusy = true; render();
      try { const r = st.result; const out = await writeLetter(r.job, r.market); st.letter = out.text; st.letterWarn = out.warn; }
      catch (e) { toast(String(e.message || e)); }
      st.letterBusy = false; render();
      const o = $('#letterOut'); if (o) o.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    const pc = $('#promptCopy', v);
    if (pc) pc.onclick = () => { const r = st.result; const res = claudePrompt({ ...r.job, salaryText: r.an.salary && r.an.salary.text, chance: r.c }); if (res.ok) copy(res.text, pc); else toast(res.error); };
    const lo = $('#letterOut', v); if (lo) lo.oninput = () => { st.letter = lo.value; };
    const lc = $('#letterCopy', v); if (lc) lc.onclick = () => copy(st.letter, lc);
    const lx = $('#letterClear', v); if (lx) lx.onclick = () => { st.letter = ''; st.letterWarn = []; render(); };
    // Applications
    const q = $('#q', v);
    if (q) q.oninput = () => { st.q = q.value; const l = $('#list', v); l.innerHTML = filtered().slice(0, 300).map(rowHtml).join('') || '<div class="empty">Ничего не найдено</div>'; bind(l); };
    // Templates
    $$('[data-tj]', v).forEach(i => i.onchange = () => { st.local.tplJob[i.dataset.tj] = i.value; save(); render(); });
    $$('[data-tcopy]', v).forEach(b => b.onclick = () => copy($(`[data-tbody="${b.dataset.tcopy}"]`, v).value, b));
    $$('[data-tsave]', v).forEach(b => b.onclick = () => { const k = b.dataset.tsave; st.local.templates[k] = { ...(st.local.templates[k] || {}), body: $(`[data-tbody="${k}"]`, v).value }; save(); toast('Шаблон сохранён'); render(); });
    $$('[data-treset]', v).forEach(b => b.onclick = () => { delete st.local.templates[b.dataset.treset]; save(); render(); });
    // Employers
    $$('[data-emp-filter]', v).forEach(b => b.onclick = () => { st.empFilter = b.dataset.empFilter; render(); });
    const emp = id => employers().find(e => e.id === id);
    $$('[data-emp-contact]', v).forEach(i => i.onchange = () => { const e = emp(i.dataset.empContact); if (e) { e.contact = i.value.trim(); save(); render(); } });
    $$('[data-emp-status]', v).forEach(s => s.onchange = () => { const e = emp(s.dataset.empStatus); if (!e) return; e.status = s.value; if (s.value === 'sent' && !e.contactedAt) e.contactedAt = todayIso(); save(); render(); });
    $$('[data-emp-mail]', v).forEach(a => a.addEventListener('click', () => { const e = emp(a.dataset.empMail); if (e && e.status === 'todo') { e.status = 'sent'; e.contactedAt = todayIso(); save(); setTimeout(render, 400); } }));
    $$('[data-emp-del]', v).forEach(b => b.onclick = () => { st.local.employers = employers().filter(e => e.id !== b.dataset.empDel); save(); render(); });
    const ea = $('#empAdd', v);
    if (ea) ea.onclick = () => { const name = $('#empName').value.trim(); if (!name) return toast('Впиши название'); employers().unshift({ id: 'u' + Date.now().toString(36), name, type: $('#empType').value, town: $('#empTown').value.trim() || '—', status: 'todo', contact: '', contactedAt: '', note: '' }); save(); render(); toast('Добавлено'); };
    // Settings
    const cs = $('#cfgSave', v);
    if (cs) cs.onclick = async () => {
      st.cfg = { url: $('#cfgUrl').value.trim(), token: $('#cfgToken').value.trim() };
      const msg = $('#cfgMsg'); msg.textContent = 'Проверяю…';
      try {
        const d = await api('GET', { action: 'ping' });
        st.scriptVersion = d.version || 0;
        if (K) save(); else { st.pendingCfg = st.cfg; st.lock = 'create'; }
        msg.innerHTML = `<span style="color:var(--go)">Подключено: «${esc(d.name)}», строк: ${d.rows}.</span>`;
        if (st.lock) render(); else refresh(true);
      } catch (e) { msg.innerHTML = `<span style="color:var(--red)">${esc(e.message)}</span>`; }
    };
    $$('[data-target]', v).forEach(i => i.onchange = () => { st.local.targets[i.dataset.target] = Math.max(0, Math.min(40, parseInt(i.value, 10) || 0)); save(); });
    $$('[data-study]', v).forEach(i => i.onchange = () => { const d = +i.dataset.study; st.local.studyDays = i.checked ? [...new Set([...st.local.studyDays, d])] : st.local.studyDays.filter(x => x !== d); save(); });
    const mm = $('#mailMode', v); if (mm) mm.onchange = () => { st.local.mail = mm.value; save(); };
    const mf = $('#mailFrom', v); if (mf) mf.onchange = () => { st.local.from = mf.value.trim(); save(); };
    const as = $('#aiSave', v); if (as) as.onclick = () => { st.local.ai = { key: $('#aiKey').value.trim(), model: $('#aiModel').value.trim() }; save(); toast('Сохранено'); render(); };
    const at = $('#aiTest', v);
    if (at) at.onclick = async () => {
      st.local.ai = { key: $('#aiKey').value.trim(), model: $('#aiModel').value.trim() }; save();
      const msg = $('#aiMsg'); msg.textContent = 'Проверяю…';
      try { const t = await groq([{ role: 'user', content: 'Reply with the single word: ready' }]); msg.innerHTML = `<span style="color:var(--go)">Работает: ${esc(t.slice(0, 40))}</span>`; }
      catch (e) { msg.innerHTML = `<span style="color:var(--red)">${esc(e.message)}</span>`; }
    };
    const fs = $('#factsSave', v); if (fs) fs.onclick = () => { st.local.facts = $('#facts').value; save(); toast('Факты сохранены'); };
    const fr = $('#factsReset', v); if (fr) fr.onclick = () => { st.local.facts = DEFAULT_FACTS; save(); render(); };
    const dc = $('#disconnect', v); if (dc) dc.onclick = () => { if (dc.dataset.sure) { wipe(); render(); toast('Таблица отключена, данные на устройстве стёрты'); } else { dc.dataset.sure = '1'; dc.textContent = 'Точно? Данные на устройстве будут стёрты'; } };
    const lk = $('#lockNow', v); if (lk) lk.onclick = lockNow;
    const cp = $('#changePin', v); if (cp) cp.onclick = () => { st.pendingCfg = st.cfg; st.lock = 'create'; st.pin = st.pin1 = ''; render(); };
  }

  // Connection link from the extension: #connect=<base64 of {"u": url, "t": token}>
  function readConnect() {
    const m = location.hash.match(/^#connect=([A-Za-z0-9_\-+/=]+)/);
    if (!m) return false;
    try {
      const j = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
      if (j.u && j.t) { if (K) { st.cfg = { url: j.u, token: j.t }; save(); } else st.pendingCfg = { url: j.u, token: j.t }; }
    } catch (e) { /* broken link */ }
    history.replaceState(null, '', location.pathname + '#today');
    return true;
  }
  // 'Share' from a job app on Android lands here as ?title=&text=&url=
  function readShare() {
    const p = new URLSearchParams(location.search);
    if (!p.has('text') && !p.has('url') && !p.has('title')) return null;
    const parts = [p.get('url'), p.get('text')].filter(Boolean);
    history.replaceState(null, '', location.pathname + '#check');
    return parts.join('\n').trim() || p.get('title');
  }

  $('#scrim').onclick = closeSheet;
  window.addEventListener('hashchange', () => { closeSheet(); render(); window.scrollTo(0, 0); });
  window.addEventListener('online', () => flush().then(() => refresh(true)));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (K && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) { hiddenAt = 0; return lockNow(); }
    if (!st.lock && Date.now() - st.syncedAt > 60e3) refresh(true);
  });

  const old = legacy();
  if (old) Object.keys(old).forEach(k => { st[k] = old[k]; });
  readConnect();
  const shared = readShare();
  if (!V || !V.supported()) {
    if (st.pendingCfg) { st.cfg = st.pendingCfg; st.pendingCfg = null; }
  } else if (LS.get('vault', null)) {
    st.lock = 'unlock'; st.pendingShare = shared;
    if (old) ['cfg', 'rows', 'profile', 'queue', 'syncedAt'].forEach(k => { try { localStorage.removeItem('jt.' + k); } catch (e) { /* ignore */ } });
  } else {
    if (st.cfg && !st.pendingCfg) st.pendingCfg = st.cfg;
    st.lock = 'create'; st.pendingShare = shared;
  }
  render();
  if (!st.lock) {
    if (shared) { st.input = shared; location.hash = '#check'; render(); analyze(shared); }
    if (st.cfg) refresh(true);
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
  }
  window.JT_App = { st, analyzeJob, readJob, setStatus, render, lockNow, toApp, todayLists, weekData, parseFollow, parseContacts };
})();
