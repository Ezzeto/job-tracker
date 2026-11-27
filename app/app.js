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
    FIT = window.JT_Fit, CH = window.JT_Chance, LLM = window.JT_LLM, LRN = window.JT_Learn, TL = window.JT_Tailor, DX = window.JT_Docx, OR = window.JT_Outreach, AS = window.JT_Assist, RV = window.JT_Review;
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
    ai: { key: '', model: '' }, facts: DEFAULT_FACTS, llmCache: {}, cvs: {}, learned: {}, learnTasks: {}, learnNotes: {}, outreach: { radius: 30, primary: false, osmAt: '' }, cvLink: '', alertsHidden: {}, briefs: {}, reviews: {}, offers: [],
    snooze: {}, noChannel: {}, inboxDone: [], later: [], employers: null, templates: {}, tplJob: { title: '', company: '', name: '' }, why: '',
  });
  const st = {
    cfg: null, rows: [], profile: null, queue: [], syncedAt: 0, local: DEFAULT_LOCAL(), inbox: [], alerts: [], scriptVersion: 0,
    filter: LS.get('filter', 'active'), market: LS.get('marketFilter', 'all'), q: '', input: LS.get('draft', ''), result: null, busy: false, error: '',
    letter: '', letterBusy: false, letterWarn: [], empFilter: 'all', inboxBusy: false,
    lock: null, pin: '', pin1: '', pinMsg: '', pendingCfg: null, pendingShare: null,
  };
  let K = null;
  let hiddenAt = 0;
  const LOCK_AFTER_MS = 5 * 60e3, MAX_FAILS = 10;
  const VAULT_KEYS = ['cfg', 'rows', 'profile', 'queue', 'syncedAt', 'local', 'inbox', 'scriptVersion', 'alerts'];
  const EMPTY = { rows: [], queue: [], inbox: [], alerts: [], syncedAt: 0, scriptVersion: 0 };
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

  // Targets, class days and facts are set once in the extension (Skills & settings) and reach the phone with the
  // profile; the phone's own values are only used until the extension has sent them.
  const targets = () => { const t = (st.profile || {}).targets; return t && typeof t.B === 'number' ? t : st.local.targets; };
  const studyDays = () => { const d = (st.profile || {}).studyDays; return Array.isArray(d) ? d : st.local.studyDays || [3, 4]; };
  const factsText = () => { const own = st.local.facts; if (own && own !== DEFAULT_FACTS) return own; const fb = (st.profile || {}).factBank; return fb && fb.length >= 80 ? fb : DEFAULT_FACTS; };
  function profile() {
    const d = JSON.parse(JSON.stringify(A.DEFAULT_PROFILE));
    const p = st.profile || {};
    const out = { ...d, ...p, skills: { ...(p.skills || d.skills) }, areas: p.areas || d.areas, intern: { ...d.intern, ...(p.intern || {}), placement: { ...d.intern.placement, ...((p.intern || {}).placement || {}) } } };
    return LRN ? LRN.withLearned(out, (st.local && st.local.learned) || {}) : out;
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
      if (st.scriptVersion >= 21) pullEmployers();
      if (st.scriptVersion >= 24) pullLater();
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
      st.inbox = d.items || []; if (Array.isArray(d.alerts)) st.alerts = d.alerts; save();
      if (d.added) { toast(`Из писем-подтверждений добавлено откликов: ${d.added}`); setTimeout(() => refresh(true), 300); }
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
      cvKind: res && res.tailored ? 'Tailored' : res && res.cvVer ? 'Standard' : '', cv: res && res.cvVer ? `CV ${res.cvVer === 'A' ? 'А' : 'Б'}${res.tailored ? ' · tailored' : ''}` : '', minutes: res && res.startedAt ? Math.max(1, Math.min(240, Math.round((Date.now() - res.startedAt) / 60000))) : '', description: String(an.description || job.description || '').slice(0, 40000), updated: Date.now(),
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
  let laterTimer = null;
  function pushLater() { if (!st.cfg || st.scriptVersion < 24) return; clearTimeout(laterTimer); laterTimer = setTimeout(() => { laterTimer = null; api('POST', null, { later: st.local.later }).catch(() => {}); }, 800); }
  async function pullLater() { try { const d = await api('GET', { action: 'later' }); if (Array.isArray(d.later) && !laterTimer) { const local = new Map(st.local.later.map(x => [x.id, x])); st.local.later = d.later.map(x => ({ ...(local.get(x.id) || {}), ...x })); save(); } } catch (e) { /* older script */ } }
  function saveLater() {
    const r = st.result; if (!r) return;
    if (!st.local.later.some(x => r.job.url && x.url === r.job.url)) {
      st.local.later.unshift({ id: 'l' + Date.now().toString(36), at: todayIso(), title: r.job.title, company: r.job.company || '', url: r.job.url || '', location: r.job.location || '', description: String(r.job.description || '').slice(0, 15000), platform: r.job.platform || '', market: r.market, verdict: r.c.verdict, score: r.c.score });
    }
    save(); pushLater(); toast('Сохранено в «Откликнуться с ПК»: расширение подготовит пакет отклика');
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
      'FACTS:', '"""', String(factsText()).slice(0, 3000), '"""',
      `SKILLS (confident): ${sk.strong.join(', ') || 'see facts'}`, `SKILLS (basic, say "familiar with"): ${sk.basic.join(', ') || 'none'}`,
      `AVAILABILITY: ${avail}`, why ? `WHY THIS EMPLOYER: ${why}` : '',
    ].filter(Boolean).join('\n');
    let text = await groq([{ role: 'system', content: sys }, { role: 'user', content: user }]);
    text = text.replace(/\n+(kind regards|best regards|yours (sincerely|faithfully)|regards)[\s\S]*$/i, '').trim();
    const sig = [p.signName, [p.signPhone, p.signLinkedIn].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
    // Tools the letter names that are neither in the facts nor in the skills profile
    const known = new Set([...sk.strong, ...sk.basic, ...A.extractTools(factsText())]);
    const warn = A.extractTools(text).filter(t => !known.has(t));
    return { text: text + '\n\nKind regards,\n' + (sig || '[My name]'), warn };
  }
  function claudePrompt(app) {
    const p = profile();
    const why = String(st.local.why || '').trim();
    return P.build(app, { ...p, factBank: factsText() }, { letter: why.length >= 20, why });
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
    (st.local.employers || []).forEach(e => { if (e.contactedAt && byIso[e.contactedAt]) byIso[e.contactedAt].cold++; if (e.followedAt && byIso[e.followedAt]) byIso[e.followedAt].cold++; });
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
      if (it.employerId) { const e = (st.local.employers || []).find(x => x.id === it.employerId); return !!e && (it.kind === 'vacancy' || e.status !== 'replied'); }
      if (it.kind === 'added' || it.kind === 'applied') return true;
      const r = it.rowId && rowById(it.rowId); if (!r) return true;
      const s = idOf(r.status);
      return !(it.kind === 'rejected' && s === 'rejected') && !(['interview', 'assessment'].includes(it.kind) && (POS.includes(s))) && !(it.kind === 'offer' && ['offer', 'accepted', 'declined'].includes(s));
    });
    return { follow: q.due, soon: q.soon, due, stale, inbox };
  }
  const KIND = { rejected: ['Отказ', 'bad', 'rejected'], interview: ['Приглашение', 'info', 'screening'], assessment: ['Тест / ассессмент', 'info', 'test'], offer: ['Оффер', 'ok', 'offer'], added: ['Отклик добавлен из письма', 'ok', ''], applied: ['Похоже, ты откликнулся', 'warn', ''], employer: ['Ответ работодателя', 'ok', ''], vacancy: ['Новое на странице вакансий', 'warn', ''] };
  // ---------- Jobs from alert emails ----------
  function alertsHtml() {
    if (st.scriptVersion < 22) return '';
    const list = AS.rankAlerts(st.alerts || [], st.rows, st.local.alertsHidden, profile()).slice(0, 5);
    if (!list.length) return (st.alerts || []).length ? '' : '<div class="sec-h"><h2>Вакансии из рассылок</h2></div><p class="small muted" style="margin:0 2px">Пока пусто. Включи рассылки вакансий на LinkedIn, Indeed и Reed (поиск «IT support», твой город, раз в день) — скрипт прочитает письма и покажет здесь 5 лучших.</p>';
    return `<div class="sec-h"><h2>Вакансии из рассылок</h2><span class="small muted">лучшие из ${(st.alerts || []).length}</span></div><div class="group">${list.map(x => `<div class="item"><div class="top"><span class="tag ${x.market}">${mkRu(x.market)}</span><div class="grow"><div class="t">${esc(x.title)}</div><div class="s">${esc(x.after || x.source)}</div></div><span class="when">${esc(ago(String(x.date).slice(0, 10)))}</span></div>
      <div class="tags">${x.why.map(w => `<span class="tag">${esc(w)}</span>`).join('')}<span class="tag">${esc(x.source)}</span></div>
      <div class="row"><button class="btn go sm" data-alert-check="${esc(x.key)}">Разобрать</button><a class="btn line sm" href="${esc(x.url)}" target="_blank" rel="noopener">Вакансия</a><button class="btn quiet sm" data-alert-hide="${esc(x.key)}">Скрыть</button></div></div>`).join('')}</div>`;
  }
  // ---------- Interview slots ----------
  async function openSlots(it) {
    const sh = $('#sheet');
    sh.innerHTML = '<p class="small muted"><span class="spinner" style="display:inline-block;vertical-align:-4px"></span> Смотрю календарь…</p>';
    sh.hidden = false; $('#scrim').hidden = false;
    let busy = [];
    try { const d = await api('GET', { action: 'slots', days: '10' }); busy = d.busy || []; } catch (e) { toast(String(e.message || e)); }
    const study = studyDays();
    const slots = AS.freeSlots(busy, { studyDays: study });
    const r = it.rowId && rowById(it.rowId), p = profile();
    const name = /\s/.test(it.from || '') && !/@/.test(it.from) ? it.from : '';
    const draft = AS.replyDraft({ name, company: r ? r.company : it.company, title: r ? r.title : '', slots, signName: p.signName, phone: p.signPhone });
    sh.innerHTML = `<div><h2 style="font-size:20px">Ответ на приглашение</h2><p class="small muted">Свободные окна из твоего календаря: будни с 9 до 17, кроме дней с парами и воскресенья, с запасом 30 минут вокруг событий.</p></div>
      <textarea class="out" id="slotText" style="min-height:240px">${esc(draft)}</textarea>
      <div class="row"><a class="btn go grow" id="slotMail" target="_blank" rel="noopener">Открыть ответ в почте</a><button class="btn line" id="slotCopy">Копировать</button></div>
      <p class="tiny muted">Когда договоритесь о времени, добавь интервью через «Заметку после звонка» — оно попадёт в календарь с напоминанием.</p>`;
    const upd = () => { $('#slotMail').href = mailHref(it.fromEmail || '', 'Re: ' + (it.subject || 'Interview'), $('#slotText').value); };
    upd(); $('#slotText').oninput = upd;
    $('#slotCopy').onclick = () => copy($('#slotText').value, $('#slotCopy'));
  }
  function quickAdd(it) {
    const sh = $('#sheet');
    sh.innerHTML = `<div><h2 style="font-size:20px">Добавить отклик</h2><p class="small muted">${esc(it.subject)}</p></div>
      <label class="f">Компания<input class="input" id="qaCo" value="${esc(it.company || '')}"></label>
      <label class="f">Должность<input class="input" id="qaTi" value="${esc(it.title || '')}" placeholder="IT Support Technician"></label>
      <label class="f">Дата отклика<input class="input" id="qaDate" type="date" value="${esc(String(it.date || '').slice(0, 10) || todayIso())}"></label>
      <button class="btn go block" id="qaGo">Добавить</button>`;
    sh.hidden = false; $('#scrim').hidden = false;
    $('#qaGo').onclick = () => {
      const company = $('#qaCo').value.trim(), title = $('#qaTi').value.trim();
      if (!company || !title) return toast('Нужны компания и должность');
      const nums = st.rows.map(x => parseInt(String(x.ticket || '').replace(/\D/g, ''), 10) || 0);
      addRow({ id: 'm' + Date.now().toString(36), ticket: 'APP-' + String(Math.max(0, ...nums) + 1).padStart(4, '0'), title, company, platform: it.platform || 'Company website', appliedAt: $('#qaDate').value || todayIso(), status: 'Applied', notes: 'Добавлено из письма-подтверждения', updated: Date.now() });
      st.local.inboxDone.push(it.id); save(); api('POST', null, { inboxDismiss: [it.id] }).catch(() => {});
      closeSheet(); render();
    };
  }

  function viewToday() {
    const w = weekData(), t = targets(), L = todayLists(), p = profile();
    const study = studyDays();
    const DN = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const strip = w.days.map((x, i) => `<div class="day${study.includes(i) ? ' study' : ''}${i === w.dow ? ' today' : ''}"><div class="col" aria-label="${DN[i]}: ${x.apps.length} откликов">${x.apps.slice(0, 7).map(a => `<i class="${a.market}"></i>`).join('')}${Array.from({ length: Math.min(x.cold, 3) }, () => '<i class="C"></i>').join('')}</div><div class="lbl">${DN[i]}<small>${x.d.getDate()}</small></div></div>`).join('');
    const goal = (cls, n, of, label, hint) => `<div class="goal ${cls}"><b>${n}<span> / ${of}</span></b><div class="bar"><i style="width:${Math.min(100, of ? n / of * 100 : 0)}%"></i></div><small>${label}${hint ? '<br>' + hint : ''}</small></div>`;
    const sentence = w.B < t.B && w.dow >= 4 ? `До цели по рынку Б не хватает ${t.B - w.B}: выходные — хорошее время для откликов в школы и колледжи.` : w.B >= t.B ? 'Цель по рынку Б на неделю выполнена. Остальное время — follow-up и подготовка.' : (n => `Сегодня: ${n} ${plural(n, 'отклик', 'отклика', 'откликов')} на рынке Б, потом follow-up.`)(Math.max(1, Math.ceil((t.B - w.B) / Math.max(1, 7 - w.dow - study.filter(d => d >= w.dow).length))));

    const inbox = L.inbox.slice(0, 8).map(it => {
      const k = KIND[it.kind] || KIND.interview;
      if (it.employerId) {
        const e = (st.local.employers || []).find(x => x.id === it.employerId) || { name: it.from };
        return `<div class="item"><div class="top"><div class="grow"><div class="tags"><span class="tag ${k[1]}">${k[0]}</span></div><div class="t" style="margin-top:8px">${esc(e.name)}</div><div class="s">${esc(it.subject || '')}</div></div><span class="when">${esc(ago(String(it.date).slice(0, 10)))}</span></div>
          <div class="row">${it.kind === 'employer' ? `<button class="btn go sm" data-inbox-emp="${esc(it.id)}">Отметить: ответили</button>` : ''}<a class="btn line sm" href="${esc(it.link)}" target="_blank" rel="noopener">${it.kind === 'vacancy' ? 'Открыть страницу' : 'Открыть письмо'}</a><button class="btn quiet sm" data-inbox-skip="${esc(it.id)}">Скрыть</button></div></div>`;
      }
      if (it.kind === 'added' || it.kind === 'applied') {
        return `<div class="item"><div class="top"><div class="grow"><div class="tags"><span class="tag ${k[1]}">${k[0]}</span></div><div class="t" style="margin-top:8px">${esc([it.company, it.title].filter(Boolean).join(' — '))}</div><div class="s">${esc(it.subject)}</div></div><span class="when">${esc(ago(String(it.date).slice(0, 10)))}</span></div>
          <div class="row">${it.kind === 'applied' ? `<button class="btn go sm" data-inbox-add="${esc(it.id)}">Добавить в трекер</button>` : it.rowId && rowById(it.rowId) ? `<button class="btn line sm" data-open="${esc(it.rowId)}">Открыть заявку</button>` : ''}<a class="btn line sm" href="${esc(it.link)}" target="_blank" rel="noopener">Письмо</a><button class="btn quiet sm" data-inbox-skip="${esc(it.id)}">${it.kind === 'added' ? 'Понятно' : 'Не то'}</button></div></div>`;
      }
      const r = it.rowId && rowById(it.rowId);
      return `<div class="item"><div class="top"><div class="grow"><div class="tags"><span class="tag ${k[1]}">${k[0]}</span>${it.human ? '<span class="tag warn">пишет человек — ответь</span>' : ''}</div>
        <div class="t" style="margin-top:8px">${esc(r ? `${r.company} — ${r.title}` : it.from)}</div><div class="s">${esc(it.subject)}${r ? '' : ' · заявку в таблице не нашёл'}</div></div><span class="when">${esc(ago(String(it.date).slice(0, 10)))}</span></div>
        <div class="row">${r ? `<button class="btn go sm" data-inbox-apply="${esc(it.id)}">Отметить: ${k[0].toLowerCase()}</button>` : ''}${it.kind === 'interview' && st.scriptVersion >= 22 ? `<button class="btn line sm" data-slots="${esc(it.id)}">Предложить время</button>` : ''}<a class="btn line sm" href="${esc(it.link)}" target="_blank" rel="noopener">Открыть письмо</a><button class="btn quiet sm" data-inbox-skip="${esc(it.id)}">Не то</button></div></div>`;
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
      ${st.cfg ? `<button class="btn line block" id="voiceOpen" style="justify-content:flex-start;gap:12px"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style="fill:none;stroke:var(--go);stroke-width:2;stroke-linecap:round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>Заметка после звонка — голосом или текстом</button>` : ''}
      <section class="paper" aria-label="Неделя">
        <div class="week">${strip}</div>
        <div class="goals">${goal('B', w.B, t.B, 'рынок Б', 'с учёбой')}${goal('A', w.A, t.A, 'рынок А', 'стоит академа')}${goal('B', w.C, t.C, 'холодных писем', '<a href="#employers">работодатели</a>')}</div>
        <p class="small muted">${esc(sentence)}</p>
        <div class="legend"><span><i></i>Б</span><span><i class="A"></i>А</span><span><i class="C"></i>письмо работодателю</span><span><i class="S"></i>пары</span></div>
      </section>
      ${st.scriptVersion >= 17 ? `<div class="sec-h"><h2>Из почты <span class="n">${L.inbox.length || ''}</span></h2><button class="btn quiet sm" id="scanInbox" ${st.inboxBusy ? 'disabled' : ''}>${st.inboxBusy ? 'Проверяю…' : 'Проверить почту'}</button></div>${inbox ? `<div class="group">${inbox}</div>` : '<p class="small muted" style="margin:0 2px">Новых писем об откликах нет. Ярлык и пересылка не нужны: скрипт читает весь ящик, ничего не меняя.</p>'}` : st.cfg ? '<div class="note small">Обнови Code.gs до версии 17 — тогда здесь появятся отказы и приглашения из Gmail, и статус меняется одним нажатием.</div>' : ''}
      ${(() => { const soon = st.rows.filter(r => ['screening', 'test', 'interview1', 'interview2', 'interview3'].includes(idOf(r.status)) && r.nextDate && r.nextDate >= todayIso() && (Date.parse(r.nextDate) - Date.now()) / 864e5 <= 4); return soon.length ? `<div class="sec-h"><h2>Подготовка к интервью</h2></div><div class="group">${soon.map(r => `<div class="item"><div class="top">${dot(idOf(r.status))}<div class="grow"><div class="t">${esc(r.company)}</div><div class="s">${esc(r.title)} · ${esc(r.nextDate === todayIso() ? 'сегодня' : r.nextDate)}</div></div></div><div class="row"><button class="btn go sm" data-brief="${esc(r.id)}">Справка и вопросы</button></div></div>`).join('')}</div>` : ''; })()}
      ${alertsHtml()}
      ${due ? `<div class="sec-h"><h2>Следующий шаг <span class="n">${L.due.length}</span></h2></div><div class="group">${due}</div>` : ''}
      ${follow ? `<div class="sec-h"><h2>Follow-up <span class="n">${L.follow.length}</span></h2>${L.follow.length > 8 ? `<span class="small muted">первые 8 из ${L.follow.length}</span>` : ''}</div><div class="group">${follow}</div>` : ''}
      ${(() => { const em = st.local.employers || []; const due = OR.followUpsDue(em).length; const left = Math.max(0, targets().C - weekData().C); return em.length && (due || left) ? `<a class="paper tight" href="#employers" style="text-decoration:none;color:var(--ink);flex-direction:row;align-items:center;gap:12px"><span class="grow"><b>Холодные письма</b><br><span class="small muted">${left ? `ещё ${left} до цели недели` : 'цель недели выполнена'}${due ? ` · второе письмо: ${due}` : ''}</span></span><span class="btn go sm">Открыть</span></a>` : ''; })()}
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
        <div class="verdict" style="--c:${v[1]}"><div class="score" title="Точный Fit по требованиям вакансии">${esc(r.fit && r.fit.score != null && c.verdict !== 'skip' ? r.fit.score + '%' : d.text)}</div><div><div class="v">${v[0]}</div><p class="small muted">${esc(tr(d.hint || ''))}</p></div></div>
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
      ${cvBlock(r)}
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
      <div class="split"><div><p class="tiny muted">Требования</p><p style="font-size:26px;font-weight:750;letter-spacing:-.03em">${f.essOk}/${f.essential.length}</p><p class="tiny muted">обязательных</p></div>
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

  // ---------- CV: two versions, tailored to each job without inventing anything ----------
  const cvFor = market => { const c = st.local.cvs || {}; const want = market === 'A' ? 'A' : 'B'; return c[want] ? want : c[want === 'A' ? 'B' : 'A'] ? (want === 'A' ? 'B' : 'A') : null; };
  function cvBlock(r) {
    const ver = cvFor(r.market);
    if (!ver) return `<div class="paper tight"><h2>CV под вакансию</h2><p class="small muted">Загрузи свои CV (версия А — full-time, Б — с учёбой) на странице <a href="#cv">CV</a>, и здесь появится подогнанная версия под каждую вакансию: нужные пункты выше, твои формулировки без изменений.</p></div>`;
    const t = r.tl;
    const ruVer = ver === 'A' ? 'А' : 'Б';
    return `<details class="paper fold" open><summary><h2>CV под вакансию</h2></summary>
      <p class="small muted">Берётся версия ${ruVer}${(st.local.cvs[r.market === 'A' ? 'A' : 'B']) ? '' : ' (другой версии нет)'}. Пункты переставляются под требования, ничего не добавляется и не переписывается.</p>
      ${!t ? `<button class="btn go" id="tailorGo">Подогнать CV ${ruVer}</button>` : `
        <p>Совпадение с вакансией: <b>${t.report.coverBefore}% → ${t.report.coverAfter}%</b>, переставлено пунктов: ${t.report.moved}.</p>
        ${t.report.added.length ? `<p class="small">Добавлено в навыки (ты отметил их как знакомые): ${esc(t.report.added.join(', '))}</p>` : ''}
        ${t.report.gaps.length ? `<p class="small muted">Нет в CV и не добавлено: ${esc(t.report.gaps.slice(0, 8).join(', '))}</p>` : ''}
        ${t.summaryWarn && t.summaryWarn.length ? `<div class="note bad small">Проверь профиль: AI упомянул ${esc(t.summaryWarn.join(', '))}, этого нет в CV и навыках.</div>` : ''}
        <textarea class="out" readonly aria-label="Подогнанное CV">${esc(TL.toText(t.cv))}</textarea>
        <div class="row"><button class="btn go sm" id="cvDocx">Скачать Word</button><button class="btn line sm" id="cvPdf">Скачать PDF</button>${st.local.ai.key ? `<button class="btn quiet sm" id="cvSummary" ${t.summaryBusy ? 'disabled' : ''}>${t.summaryBusy ? 'Пишу…' : 'Профиль под вакансию (AI)'}</button>` : ''}<button class="btn quiet sm" id="cvReset">Сбросить</button></div>`}
    </details>`;
  }
  function doTailor(r) {
    const ver = cvFor(r.market); if (!ver) return;
    const base = TL.parse(st.local.cvs[ver].text);
    const out = TL.tailor(base, r.job, profile());
    r.tl = { ...out, ver }; r.tailored = true; r.cvVer = ver;
    if (r.facts) { r.facts.tailored = true; r.chanceP = CH.predict(r.facts, CH.stats(st.rows.map(rowFacts))); r.chanceD = CH.describe(r.chanceP); }
    render();
  }
  async function tailorSummary(r) {
    const t = r.tl; if (!t) return;
    const sum = t.cv.sections.find(x => x.kind === 'summary');
    const cvText = TL.toText(t.cv);
    t.summaryBusy = true; render();
    try {
      const text = await LLM.draft(aiCfg(), { task: `Rewrite the CV profile (3 lines, no first-person pronouns) for this job: ${r.job.title} at ${r.job.company || 'the employer'}. Use the job's own words only for things the CV already shows. ${r.market === 'B' ? 'Mention availability alongside a Computing degree.' : 'Present as ready for a full-time role.'}`, facts: cvText.slice(0, 5000), skills: '', context: r.job.description, words: 60 });
      const clean = text.replace(/^["']|["']$/g, '').trim();
      t.summaryWarn = LLM.unknownTools(clean, cvText, profile());
      if (sum) { const para = sum.blocks.find(b => b.t === 'para'); if (para) para.text = clean; else sum.blocks.unshift({ t: 'para', text: clean }); }
      else t.cv.sections.unshift({ title: 'PROFILE', kind: 'summary', blocks: [{ t: 'para', text: clean }] });
    } catch (e) { toast(String(e.message || e)); }
    t.summaryBusy = false; render();
  }
  function saveBlob(data, name, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 3000);
  }
  const loadScript = src => new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = () => no(new Error('Не удалось загрузить ' + src)); document.head.appendChild(el); });
  async function cvPdf(cv) {
    await loadScript('lib/vendor/jspdf.umd.min.js'); await loadScript('lib/cvpdf.js');
    return window.JT_CvPdf.build(cv);
  }
  async function readCvFile(file) {
    if (/\.docx$/i.test(file.name)) await loadScript('lib/vendor/mammoth.browser.min.js');
    await import('./lib/cvread.mjs');
    return window.JT_ReadCV(file);
  }
  function viewCv() {
    const c = st.local.cvs || {};
    const slot = (k, title, hint) => { const v = c[k]; return `<section class="paper"><div class="row"><h2 class="grow">${title}</h2>${v ? `<span class="tag ok">загружено</span>` : '<span class="tag">нет</span>'}</div>
      <p class="small muted">${hint}</p>
      ${v ? `<p class="small">${esc(v.name || 'вставленный текст')}, ${(v.text.match(/\b\w+\b/g) || []).length} слов, обновлено ${esc(ago(v.at))}</p>` : ''}
      <div class="row"><label class="btn go sm" style="cursor:pointer">Загрузить PDF или Word<input type="file" accept=".pdf,.docx,.txt" data-cvfile="${k}" hidden></label>${v ? `<button class="btn line sm" data-cvview="${k}">Показать текст</button><button class="btn quiet sm" data-cvdel="${k}">Удалить</button>` : ''}</div>
      <details class="fold"><summary><h3>Или вставь текст CV</h3></summary><textarea class="input" data-cvtext="${k}" style="margin-top:10px;min-height:160px" placeholder="Скопируй весь текст CV сюда">${esc(v ? v.text : '')}</textarea><button class="btn line sm" data-cvsave="${k}" style="margin-top:8px">Сохранить текст</button></details>
      ${v && st.local.ai.key ? `<button class="btn quiet sm" data-cvai="${k}">Профиль для рынка ${k === 'A' ? 'А' : 'Б'} (AI)</button><div data-cvaiout="${k}"></div>` : ''}
    </section>`; };
    const apps = st.rows.filter(r => r.cvKind);
    return `<div><h1>CV</h1><p class="lead">Две версии под две цели. Файл читается на этом устройстве и хранится зашифрованным, никуда не загружается.</p></div>
      ${slot('B', 'Версия Б — работа с учёбой', 'В шапке: «available 3–4 days a week incl. weekends», учёба заметно. Для университетского helpdesk, школ, колледжей, part-time.')}
      ${slot('A', 'Версия А — full-time', 'Учёба внизу, акцент на готовность к full-time. Только для вакансий, ради которых стоит взять академ.')}
      <div class="note info small">В «Разборе» трекер сам берёт версию по рынку вакансии и подгоняет её. Отметка «подогнано» идёт в таблицу — в статистике будет видно, помогает ли подгонка${apps.length ? ` (уже отмечено заявок: ${apps.length})` : ''}.</div>`;
  }

  // ---------- Learning plan from the gaps ----------
  function viewLearn() {
    const apps = st.rows.map(r => { const a = toApp(r); return { missing: a.chance.missing, market: a.market, appliedAt: a.appliedAt }; });
    const base = st.profile ? { ...st.profile } : profile();
    const list = LRN.gaps(apps, base, st.local.learned || {});
    const done = Object.entries(st.local.learned || {}).sort((a, b) => b[1].localeCompare(a[1]));
    const card = (g, i) => { const custom = (st.local.learnTasks || {})[g.name]; return `<div class="item"><div class="top"><div class="grow"><div class="t">${esc(g.name)}</div><div class="s">нет у тебя в ${g.count} ${plural(g.count, 'вакансии', 'вакансиях', 'вакансиях')}${i < 3 ? ' · в первую очередь' : ''}</div></div><span class="when">~${Math.round((custom ? 90 : g.minutes) / 15) * 15} мин</span></div>
      <p class="small">${esc(custom || g.task)}</p>
      <textarea class="input" data-lnote="${esc(g.name)}" style="min-height:60px;font-size:14px" placeholder="Что сделал — пара строк. Пригодится для CV и портфолио">${esc((st.local.learnNotes || {})[g.name] || '')}</textarea>
      <div class="row"><button class="btn go sm" data-ldone="${esc(g.name)}">Сделал</button>${st.local.ai.key ? `<button class="btn quiet sm" data-lai="${esc(g.name)}">Другое задание (AI)</button>` : ''}</div></div>`; };
    return `<div><h1>План обучения</h1><p class="lead">Чего чаще всего не хватает в твоих вакансиях — в виде заданий для домашней лаборатории. Сделал — навык считается «лабораторией» (0,6 в Fit), и после синхронизации появится в расширении.</p></div>
      ${list.length ? `<div class="group">${list.slice(0, 6).map(card).join('')}</div>` : `<div class="empty"><b>${st.rows.length ? 'Пробелов не найдено' : 'Пока нет данных'}</b>${st.rows.length ? 'В твоих вакансиях нет инструмента, которого не хватало бы хотя бы дважды.' : 'План появится после первых откликов.'}</div>`}
      ${done.length ? `<div class="sec-h"><h2>Уже сделано <span class="n">${done.length}</span></h2></div><div class="group">${done.map(([n, d]) => `<div class="item"><div class="top"><span class="k ok" style="width:22px;height:22px;border-radius:7px;display:grid;place-items:center;font-weight:800">✓</span><div class="grow"><div class="t">${esc(n)}</div><div class="s">${esc(d)}${(st.local.learnNotes || {})[n] ? ' · ' + esc(st.local.learnNotes[n].slice(0, 120)) : ''}</div></div><button class="btn quiet sm" data-lundo="${esc(n)}">Отменить</button></div></div>`).join('')}</div>` : ''}
      <p class="tiny muted">Двойной вес у вакансий рынка Б и у откликов за последние 90 дней.</p>`;
  }
  function setLearned(name, date) {
    st.local.learned = st.local.learned || {};
    if (date) st.local.learned[name] = date; else delete st.local.learned[name];
    save(); render();
    if (st.cfg) api('POST', null, { learned: { [name]: date || null } }).catch(() => {});
  }

  // ---------- Week review, cost of a screening, ask the tracker ----------
  function plainApp(r) {
    const a = toApp(r);
    return { status: a.status, appliedAt: a.appliedAt, company: a.company, title: a.title, platform: a.platform, market: a.market, agency: a.agency, method: r.method, cvKind: r.cvKind, cover: r.cover, minutes: r.minutes,
      fit: r.fit2 !== '' && r.fit2 != null ? r.fit2 : r.chance, missing: a.chance.missing, tools: a.chance.tools, salaryText: a.salaryText, rejDays: r.rejDays, id: a.id, ticket: a.ticket };
  }
  const weekKey = () => { const d = new Date(); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return isoOf(d); };
  function costTable(cost) {
    return `<table class="tbl"><thead><tr><th>Канал</th><th>Откликов</th><th>Скрин.</th><th>Часов</th><th>Часов на скрининг</th></tr></thead><tbody>${cost.map(x => `<tr><td>${esc(x.channel)}</td><td>${x.n}</td><td>${x.screens}</td><td>${String(x.hours).replace('.', ',')}</td><td>${x.perScreen == null ? (x.screens ? '—' : `0 из ${String(x.hours).replace('.', ',')} ч`) : String(x.perScreen).replace('.', ',')}</td></tr>`).join('')}</tbody></table>
      <p class="tiny muted">Время отклика замеряется с телефона (от разбора до «Я откликнулся»); где замера нет — оценка: Easy Apply 5 мин, форма на сайте 15, сайт компании 30, письмо 10, +10 за подгонку CV, +15 за письмо.</p>`;
  }
  function viewReview() {
    const apps = st.rows.map(plainApp), w = RV.week(apps), t = targets(), k = weekKey();
    const note = (st.local.reviews || {})[k];
    const cell = (label, a, b) => `<div class="kpi"><b>${a}</b><span>${label}${b != null ? ` · было ${b}` : ''}</span></div>`;
    return `<div><h1>Неделя</h1><p class="lead">Что сделано, что сработало и что делать дальше. Цифры считает трекер, выводы пишет AI.</p></div>
      <div class="kpis">${cell('откликов', w.thisWeek.n, w.lastWeek.n)}${cell(`рынок Б · цель ${t.B}`, w.thisWeek.B, w.lastWeek.B)}${cell(`рынок А · цель ${t.A}`, w.thisWeek.A, w.lastWeek.A)}${cell('подогнанных CV', w.thisWeek.tailored, w.lastWeek.tailored)}</div>
      <div class="paper"><h2>Сколько стоит один скрининг</h2>${costTable(w.cost)}</div>
      <div class="paper"><h2>Выводы и план на неделю</h2>
        ${note ? `<textarea class="out" id="revText" style="min-height:260px">${esc(note)}</textarea><div class="row"><button class="btn go sm" id="revSend" ${st.scriptVersion >= 23 ? '' : 'disabled'}>В воскресное письмо</button><button class="btn line sm" id="revCopy">Копировать</button><button class="btn quiet sm" id="revAi">Переписать</button></div>${st.scriptVersion && st.scriptVersion < 23 ? '<p class="tiny muted">Для письма нужен Code.gs версии 23.</p>' : ''}`
          : st.local.ai.key ? `<button class="btn go" id="revAi" ${st.revBusy ? 'disabled' : ''}>${st.revBusy ? 'Пишу…' : 'Написать выводы (AI)'}</button>` : '<p class="small muted">С ключом AI здесь появятся 5 выводов по цифрам и план на неделю. <a href="#setup">Настройки → AI</a></p>'}
        <p class="tiny muted">В AI уходят только цифры, без названий компаний и твоих данных.</p></div>`;
  }
  async function writeReview() {
    const apps = st.rows.map(plainApp), w = RV.week(apps);
    const emp = (st.local.employers || []);
    const extra = `Cold emails to local employers this week: ${weekData().C}; replies from employers so far: ${emp.filter(e => e.status === 'replied').length}. Baseline on 24.11.2026: 3 screenings from 209 applications (1.4%), agencies 0 from 28.`;
    st.revBusy = true; render();
    try {
      const text = await LLM.chat(aiCfg(), [
        { role: 'system', content: 'You are a job search coach for a UK IT support student. Write in Russian. Be specific and honest about small samples (say when numbers are too small to conclude). No invented numbers: use only the ones given.' },
        { role: 'user', content: `Numbers:\n${RV.summaryForAi(w, targets(), extra)}\n\nWrite: "Что сработало" (up to 3 bullets), "Что не сработало" (up to 3 bullets), "План на неделю" (4–5 concrete actions with numbers, market B first: part-time IT alongside study, then market A only for roles worth a study break). Plain text, short bullets.` },
      ], { temperature: 0.4, cacheKey: false });
      st.local.reviews = { ...(st.local.reviews || {}), [weekKey()]: text.trim() }; save();
    } catch (e) { toast(String(e.message || e)); }
    st.revBusy = false; render();
  }
  async function askTracker(question) {
    const out = $('#askOut');
    out.innerHTML = '<p class="small muted">Думаю…</p>';
    try {
      const raw = await LLM.chat(aiCfg(), RV.askPrompt(question, todayIso(), companiesList()), { json: true, temperature: 0, cacheKey: false });
      const q = RV.cleanQuery(raw), apps = st.rows.map(plainApp), r = RV.runQuery(apps, q);
      const pc = r.total ? Math.round(r.screens / r.total * 1000) / 10 : 0;
      const head = q.show === 'rate' ? `${r.screens} из ${r.total} дошли до скрининга (${String(pc).replace('.', ',')}%)` : `${r.total} ${plural(r.total, 'заявка', 'заявки', 'заявок')}${r.screens ? `, из них со скринингом ${r.screens}` : ''}`;
      const groups = r.groups ? `<table class="tbl"><tbody>${r.groups.slice(0, 20).map(g => `<tr><td>${esc(RU[g.key] || g.key)}</td><td>${g.n}</td><td>${g.screens ? 'скрин. ' + g.screens : ''}</td></tr>`).join('')}</tbody></table>` : '';
      const list = (q.show === 'list' || r.total <= 8) && r.total ? `<div class="group" style="margin-top:8px">${r.rows.slice(0, 30).map(a => `<button class="app-row" data-open="${esc(a.id)}">${dot(a.status)}<span class="t">${esc(a.title)}</span><span class="r"><b>${esc(RU[a.status] || a.status)}</b>${esc(String(a.appliedAt).slice(0, 10))}</span><span class="m">${esc(a.company)}</span></button>`).join('')}</div>` : '';
      out.innerHTML = `<p><b>${esc(head)}</b></p>${groups}${list}<p class="tiny muted">Фильтр: ${esc(Object.entries(q.filter).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)).map(([k2, v]) => `${k2}=${Array.isArray(v) ? v.join('/') : v}`).join(', ') || 'все заявки')}</p>`;
      bind(out);
    } catch (e) { out.innerHTML = `<p class="small" style="color:var(--red)">${esc(e.message)}</p>`; }
  }

  // ---------- Company brief before an interview ----------
  function viewBrief() {
    const r = rowById(st.briefId);
    if (!r) return '<h1>Справка о компании</h1><div class="empty"><b>Выбери заявку</b>Открой заявку и нажми «Справка о компании».</div>';
    const b = (st.local.briefs || {})[r.id], co = r.company || '';
    const links = [['Сайт компании', `https://www.google.com/search?q=${encodeURIComponent(co + ' official site')}`], ['Отзывы сотрудников', `https://www.google.com/search?q=${encodeURIComponent(co + ' Glassdoor reviews')}`], ['LinkedIn', `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(co)}`], ['Новости', `https://news.google.com/search?q=${encodeURIComponent(co)}`], ['Companies House', `https://find-and-update.company-information.service.gov.uk/search?q=${encodeURIComponent(co)}`]];
    return `<div><p class="ticket">${esc(r.ticket || '')} · ${esc(RU[idOf(r.status)] || '')}</p><h1>${esc(co || 'Компания')}</h1><p class="lead">${esc(r.title || '')}</p></div>
      <div class="paper tight"><h2>Источники</h2><div class="row">${links.map(([l, u]) => `<a class="btn line sm" href="${esc(u)}" target="_blank" rel="noopener">${l}</a>`).join('')}${r.location ? `<a class="btn line sm" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(co + ' ' + r.location)}&travelmode=transit" target="_blank" rel="noopener">Как добраться</a>` : ''}</div></div>
      <div class="paper"><h2>Справка и подготовка</h2>
        ${b ? `<div class="ad" style="max-height:none">${esc(b)}</div><div class="row"><button class="btn line sm" id="briefCopy">Копировать</button><button class="btn quiet sm" id="briefAi">Переписать</button></div>`
          : st.local.ai.key ? `<button class="btn go" id="briefAi" ${st.briefBusy ? 'disabled' : ''}>${st.briefBusy ? 'Готовлю…' : 'Подготовить справку (AI)'}</button>` : '<p class="small muted">С ключом AI здесь будет справка: чем занимается компания, что за роль, вероятные вопросы с твоими историями STAR и вопросы работодателю.</p>'}
        <p class="tiny muted">AI работает по тексту вакансии и своим общим знаниям, без поиска в интернете: факты о компании проверь по источникам выше. Свежие новости и отзывы найдёт Claude с веб-поиском — кнопка ниже.</p>
        <button class="btn line sm" id="briefPrompt">Промпт для Claude с поиском</button></div>`;
  }
  async function writeBrief(r) {
    st.briefBusy = true; render();
    try {
      const text = await LLM.chat(aiCfg(), [
        { role: 'system', content: `You prepare an entry-level IT support candidate for an interview. Write in Russian, but keep example answers in English. ${LLM.NO_INVENT} Mark anything about the company that is not in the ad as "проверь" — you have no internet access.` },
        { role: 'user', content: `Company: ${r.company}\nRole: ${r.title}\nLocation: ${r.location || ''}\nAD:\n<<<\n${String(r.description || '').slice(0, 6000)}\n>>>\nCANDIDATE FACTS:\n<<<\n${factsText()}\n>>>\nWrite these sections:\n1. Чем занимается компания (2–3 строки, что известно; остальное — «проверь»).\n2. Что на самом деле за роль (по тексту вакансии): главные задачи и инструменты.\n3. 6 вероятных вопросов на интервью; к каждому — какую историю из фактов кандидата рассказать (по STAR, коротко) и одну фразу-начало ответа на английском.\n4. Пробелы: что просят, а у кандидата нет, и как честно ответить.\n5. 3 умных вопроса работодателю (на английском).\n6. Чек-лист на день интервью (5 пунктов).` },
      ], { temperature: 0.4, maxTokens: 2200, cacheKey: false });
      st.local.briefs = { ...(st.local.briefs || {}), [r.id]: text.trim() }; save();
    } catch (e) { toast(String(e.message || e)); }
    st.briefBusy = false; render();
  }

  // ---------- Offers and salary talks ----------
  function viewOffer() {
    const offers = st.local.offers || [];
    const sal = st.rows.map(r => A.parseSalary(String(r.salary || ''))).filter(x => x && x.annualMin >= 12000 && x.annualMin < 120000).map(x => (x.annualMin + (x.annualMax || x.annualMin)) / 2).sort((a, b) => a - b);
    const median = sal.length ? Math.round(sal[Math.floor(sal.length / 2)]) : 0;
    const money = v => '£' + Math.round(v).toLocaleString('en-GB');
    const field = (o, k, label, ph) => `<label class="f">${label}<input class="input" data-off="${esc(o.id)}:${k}" value="${esc(o[k] == null ? '' : o[k])}" placeholder="${ph || ''}" inputmode="decimal"></label>`;
    const cards = offers.map(o => { const m = RV.offerMaths(o); return `<div class="paper"><div class="row"><input class="input grow" data-off="${esc(o.id)}:company" value="${esc(o.company || '')}" placeholder="Компания" style="font-weight:700"><button class="btn quiet sm" data-off-del="${esc(o.id)}">Удалить</button></div>
      <div class="split">${field(o, 'salary', 'Зарплата в год, £', '26000')}${field(o, 'hourly', 'или в час, £', '13.50')}</div>
      <div class="split">${field(o, 'hours', 'Часов в неделю', '37.5')}${field(o, 'days', 'Дней в неделю', '5')}</div>
      <div class="split">${field(o, 'commuteMin', 'Дорога в одну сторону, мин', '30')}${field(o, 'commuteCost', 'Дорога в день, £', '8')}</div>
      <div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><b>${m.year ? money(m.year) : '—'}</b><span>в год</span></div><div class="kpi"><b>${m.hourly ? '£' + m.hourly.toFixed(2) : '—'}</b><span>в час</span></div><div class="kpi"><b>${m.effective ? '£' + m.effective.toFixed(2) : '—'}</b><span>в час с дорогой</span></div></div>
      ${m.travelHours ? `<p class="small muted">Дорога: ${m.travelHours} ч и ${money(m.travelCost)} в год.</p>` : ''}
      ${st.local.ai.key ? `<button class="btn line sm" data-off-ai="${esc(o.id)}">Что сказать на переговорах (AI)</button>` : ''}<div data-off-out="${esc(o.id)}">${o.script ? `<textarea class="out" style="min-height:220px">${esc(o.script)}</textarea>` : ''}</div></div>`; }).join('');
    return `<div><h1>Оффер и зарплата</h1><p class="lead">Сравни предложения с учётом дороги и подготовься к разговору о зарплате.</p></div>
      <div class="paper tight"><p>Медиана зарплат в твоих вакансиях: <b>${median ? money(median) : 'нет данных'}</b>${sal.length ? ` (${sal.length} вакансий)` : ''}. Порог для рынка А: £${Math.round((profile().salaryThresholdA || 30000) / 1000)}k.</p></div>
      ${cards || '<div class="empty"><b>Офферов пока нет</b>Добавь предложение, когда оно появится, — или сравни две вакансии заранее.</div>'}
      <button class="btn go block" id="offAdd">Добавить предложение</button>`;
  }
  async function offerScript(o) {
    const m = RV.offerMaths(o), out = $(`[data-off-out="${o.id}"]`);
    out.innerHTML = '<p class="small muted">Пишу…</p>';
    const sal = st.rows.map(r => A.parseSalary(String(r.salary || ''))).filter(x => x && x.annualMin >= 12000).map(x => (x.annualMin + (x.annualMax || x.annualMin)) / 2).sort((a, b) => a - b);
    const median = sal.length ? Math.round(sal[Math.floor(sal.length / 2)]) : 0;
    const ask = m.year ? Math.ceil(Math.max(m.year + 1000, Math.min(m.year * 1.1, Math.max(median, m.year * 1.05))) / 500) * 500 : 0;
    try {
      const text = await LLM.chat(aiCfg(), [
        { role: 'system', content: `You coach a UK entry-level IT support candidate on salary negotiation. Russian explanations, English scripts. ${LLM.NO_INVENT} Polite, short, no ultimatums.` },
        { role: 'user', content: `Offer: ${o.company || 'the employer'}, £${m.year} a year (£${m.hourly}/h), ${o.hours || 37.5} h/week, ${o.days || 5} days. Commute: ${o.commuteMin || 0} min each way, £${o.commuteCost || 0}/day; effective £${m.effective}/h. Median salary in the candidate's saved job ads: £${median || 'unknown'}. Suggested ask (computed): £${ask}.\nFACTS:\n<<<\n${factsText()}\n>>>\nWrite: 1) стоит ли торговаться и почему (2 строки); 2) email на английском с просьбой о £${ask} или о компенсации дороги/гибком графике; 3) фразы для звонка (3–4); 4) что ответить, если откажут.` },
      ], { temperature: 0.4, maxTokens: 1500, cacheKey: false });
      o.script = text.trim(); save(); render();
    } catch (e) { out.innerHTML = `<p class="small" style="color:var(--red)">${esc(e.message)}</p>`; }
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
  const rowHtml = r => { const id = idOf(r.status), a = toApp(r); const fu = parseFollow(r.followup).length; return `<button class="app-row" data-open="${esc(r.id)}">${dot(id)}<span class="t">${esc(r.title || 'Без названия')}</span><span class="r"><b>${esc(RU[id] || id)}</b>${esc(ago(r.appliedAt))}</span><span class="m">${esc([r.company, a.market === 'A' ? 'рынок А' : 'рынок Б', r.fit2 !== '' && r.fit2 != null ? `fit ${r.fit2}%` : r.chance !== '' && r.chance != null ? `≈fit ${r.chance}%` : '', fu ? `✉ ${fu}` : ''].filter(Boolean).join(', '))}</span></button>`; };
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
      <div class="row"><button class="btn go grow" id="saveNotes">Сохранить</button><button class="btn line" id="sheetVoice">Заметка голосом</button>${r.url ? `<a class="btn line grow" href="${esc(r.url)}" target="_blank" rel="noopener">Вакансия</a>` : ''}</div>
      ${a.chance.tools.length ? `<div class="stack"><h3>Навыки</h3><div class="tags">${a.chance.matched.map(t => `<span class="tag ok">${esc(t)}</span>`).join('')}${a.chance.missing.map(t => `<span class="tag bad">${esc(t)}</span>`).join('')}</div></div>` : ''}
      ${ACTIVE.includes(cur) || cur === 'accepted' ? `<div class="row"><button class="btn line grow" id="sheetBrief">Справка о компании</button>${['offer', 'accepted'].includes(cur) ? '<button class="btn line grow" id="sheetOffer">Оффер</button>' : ''}</div>` : ''}
      ${r.description ? `<details class="fold"><summary><h3>Текст вакансии</h3></summary><div class="ad" style="margin-top:10px">${esc(r.description)}</div></details>
        <div class="row"><button class="btn line grow" id="reAnalyze">Разобрать снова</button><button class="btn line grow" id="sheetPrompt">Промпт для Claude</button></div>` : ''}`;
    sh.hidden = false; $('#scrim').hidden = false; $('#toast').hidden = true;
    $$('[data-set]', sh).forEach(b => b.onclick = () => { setStatus(r.id, b.dataset.set); closeSheet(); });
    const sent = $('#sheetSent', sh); if (sent) sent.onclick = () => { markSent(r.id); closeSheet(); };
    $('#sheetVoice', sh).onclick = () => openVoice(`${r.company}: `);
    const sb = $('#sheetBrief', sh); if (sb) sb.onclick = () => { st.briefId = r.id; closeSheet(); location.hash = '#brief'; };
    const so = $('#sheetOffer', sh); if (so) so.onclick = () => { st.local.offers = st.local.offers || []; if (!st.local.offers.some(o => o.rowId === r.id)) { const sa = A.parseSalary(String(r.salary || '')); st.local.offers.unshift({ id: 'f' + Date.now().toString(36), rowId: r.id, company: r.company, salary: sa && sa.annualMin ? Math.round((sa.annualMin + (sa.annualMax || sa.annualMin)) / 2) : '' }); save(); } closeSheet(); location.hash = '#offer'; };
    $('#saveNotes', sh).onclick = () => { patchRow(r, { notes: $('#notes').value, nextDate: $('#nd').value || '' }); closeSheet(); toast('Сохранено'); };
    const ra = $('#reAnalyze', sh);
    if (ra) ra.onclick = () => { closeSheet(); st.result = analyzeJob({ title: r.title, company: r.company, location: r.location, description: r.description, url: r.url, platform: r.platform }); st.letter = ''; location.hash = '#check'; render(); };
    const sp = $('#sheetPrompt', sh);
    if (sp) sp.onclick = () => { const res = claudePrompt(a); if (res.ok) copy(res.text, sp); else toast(res.error); };
  }
  function closeSheet() { stopRec(); $('#sheet').hidden = true; $('#scrim').hidden = true; }

  // ---------- Voice note after a call ----------
  // Speak (Whisper on Groq) or type; AI turns it into a status, next step, calendar event and note; you check and apply.
  let rec = null;
  function stopRec() { if (rec && rec.state === 'recording') { rec.onstop = null; rec.stop(); rec.stream.getTracks().forEach(t => t.stop()); } rec = null; }
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function companiesList() {
    const seen = new Set(), out = [];
    st.rows.slice().sort((a, b) => (ACTIVE.includes(idOf(b.status)) - ACTIVE.includes(idOf(a.status))) || String(b.appliedAt).localeCompare(String(a.appliedAt)))
      .forEach(r => { const c = String(r.company || '').trim(); if (c && !seen.has(c)) { seen.add(c); out.push(c); } });
    return out;
  }
  function calLink(ev, details) {
    const d = ev.date.replace(/-/g, '');
    let dates;
    if (ev.time) { const [h, m] = ev.time.split(':').map(Number); const s0 = new Date(+ev.date.slice(0, 4), +ev.date.slice(5, 7) - 1, +ev.date.slice(8, 10), h, m); const e0 = new Date(s0.getTime() + (ev.minutes || 60) * 60000); const f = x => `${isoOf(x).replace(/-/g, '')}T${String(x.getHours()).padStart(2, '0')}${String(x.getMinutes()).padStart(2, '0')}00`; dates = `${f(s0)}/${f(e0)}`; }
    else { const n = new Date(+ev.date.slice(0, 4), +ev.date.slice(5, 7) - 1, +ev.date.slice(8, 10) + 1); dates = `${d}/${isoOf(n).replace(/-/g, '')}`; }
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${dates}&details=${encodeURIComponent(details || '')}`;
  }
  function openVoice(preset) {
    const sh = $('#sheet');
    const canRec = !!(navigator.mediaDevices && window.MediaRecorder) && st.local.ai.key && LLM.providerOf(st.local.ai.key) === 'groq';
    sh.innerHTML = `<div><h2 style="font-size:20px">Заметка после звонка</h2><p class="small muted">Например: «Звонила Сара из Harlow College, интервью во вторник в 10, взять паспорт». Трекер предложит статус, следующий шаг и событие в календаре — ты проверишь и применишь.</p></div>
      ${canRec ? '<button class="btn go block" id="recBtn" style="min-height:64px;font-size:17px">● Записать</button>' : `<p class="small muted">${st.local.ai.key ? 'Запись голоса работает с ключом Groq. Можно надиктовать текст кнопкой микрофона на клавиатуре телефона.' : 'Нужен ключ AI (Настройки → AI). Пока можно надиктовать текст микрофоном клавиатуры и сохранить как заметку.'}</p>`}
      <textarea class="input" id="vText" placeholder="Текст заметки" style="min-height:110px">${esc(preset || '')}</textarea>
      <button class="btn ${canRec ? 'line' : 'go'} block" id="vParse" ${st.local.ai.key ? '' : 'disabled'}>Разобрать заметку</button>
      <div id="vOut"></div>`;
    sh.hidden = false; $('#scrim').hidden = false; $('#toast').hidden = true;
    const rb = $('#recBtn', sh);
    if (rb) rb.onclick = async () => {
      if (rec) { rec.stop(); rb.disabled = true; rb.textContent = 'Распознаю…'; return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];
        rec = new MediaRecorder(stream); rec.stream = stream;
        rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        rec.onstop = async () => {
          stream.getTracks().forEach(t => t.stop()); rec = null;
          try { const text = await LLM.transcribe(aiCfg(), new Blob(chunks, { type: chunks[0] ? chunks[0].type : 'audio/webm' })); $('#vText').value = text; rb.textContent = '● Записать ещё'; rb.disabled = false; if (text) parseVoice(); }
          catch (e) { toast(String(e.message || e)); rb.textContent = '● Записать'; rb.disabled = false; }
        };
        rec.start(); rb.textContent = '■ Остановить'; rb.style.background = 'var(--red)';
      } catch (e) { toast('Нет доступа к микрофону: разреши его в настройках браузера'); }
    };
    $('#vParse', sh).onclick = parseVoice;
  }
  async function parseVoice() {
    const text = $('#vText').value.trim(), out = $('#vOut');
    if (!text) return toast('Сначала скажи или напиши заметку');
    out.innerHTML = '<p class="small muted"><span class="spinner" style="display:inline-block;vertical-align:-4px"></span> Разбираю…</p>';
    const now = new Date();
    let r;
    try { r = await LLM.voiceNote(aiCfg(), { text, companies: companiesList(), today: `${todayIso()} (${DOW[now.getDay()]})` }); }
    catch (e) { out.innerHTML = `<p class="small" style="color:var(--red)">${esc(e.message)}</p>`; return; }
    const comps = companiesList();
    const row = r.company ? st.rows.filter(x => x.company === r.company).sort((a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt)))[0] : null;
    if (r.event && row && !/[—-]/.test(r.event.title)) r.event.title = `${r.event.title} — ${row.company}`;
    out.innerHTML = `<div class="paper tight" style="background:var(--paper-2);border:0">
      <label class="f">Заявка<select class="input" id="vRow"><option value="">— не привязывать —</option>${st.rows.filter(x => comps.includes(x.company)).sort((a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt))).slice(0, 120).map(x => `<option value="${esc(x.id)}" ${row && x.id === row.id ? 'selected' : ''}>${esc(x.company)} — ${esc(x.title)}</option>`).join('')}</select></label>
      <label class="f">Новый статус<select class="input" id="vStatus"><option value="">не менять</option>${ORDER.map(k => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${RU[k]}</option>`).join('')}</select></label>
      <div class="split"><label class="f">Следующий шаг<input class="input" type="date" id="vNext" value="${esc(r.nextDate || (r.event && r.event.date) || '')}"></label><div></div></div>
      ${r.event ? `<label class="check"><input type="checkbox" id="vCal" checked> В календарь: ${esc(r.event.title)}, ${esc(r.event.date)}${r.event.time ? ' в ' + esc(r.event.time) : ''}</label>` : ''}
      <label class="f">Заметка<textarea class="input" id="vNote" style="min-height:70px">${esc(r.note + (r.todo.length ? '\nСделать: ' + r.todo.join('; ') : ''))}</textarea></label>
      <button class="btn go block" id="vApply">Применить</button></div>`;
    $('#vApply').onclick = () => applyVoice(r);
  }
  async function applyVoice(r) {
    const id = $('#vRow').value, status = $('#vStatus').value, next = $('#vNext').value, note = $('#vNote').value.trim(), cal = $('#vCal') && $('#vCal').checked;
    const row = id && rowById(id);
    if (row) {
      const patch = { notes: [row.notes, `${ukDate(new Date())}: ${note}`].filter(Boolean).join('\n') };
      if (status) patch.status = A.statusLabel(status);
      if (next) patch.nextDate = next;
      patchRow(row, patch, `${row.company}: заметка сохранена${status ? ', статус «' + RU[status] + '»' : ''}`);
    }
    if (cal && r.event) {
      const ev = { ...r.event, description: note + (row && row.url ? '\n' + row.url : ''), remindMinutes: 60 };
      if (st.scriptVersion >= 20) {
        try { const d = await api('POST', null, { events: [ev] }); const e = (d.events || [])[0] || {}; if (!e.ok) throw new Error(e.error || 'не получилось'); toast(e.duplicate ? 'Событие уже есть в календаре' : 'Событие добавлено в Google Календарь'); }
        catch (e) { window.open(calLink(ev, ev.description), '_blank'); toast('Открываю Google Календарь: ' + e.message); }
      } else window.open(calLink(ev, ev.description), '_blank');
    }
    if (!row && !cal) toast('Ничего не выбрано: привяжи заявку или событие');
    closeSheet();
  }

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
      <div><h1>Статистика</h1><p class="lead">Что работает, а что нет — по твоим заявкам. Итоги недели — на странице <a href="#review">Неделя</a>.</p></div>
      ${st.local.ai.key ? `<div class="paper tight"><h2>Спроси трекер</h2><div class="row"><input class="input grow" id="askQ" placeholder="Сколько я подал в школы в ноябре и кто ответил?" aria-label="Вопрос"><button class="btn go" id="askGo">Спросить</button></div><div id="askOut"></div></div>` : ''}
      <div class="kpis"><div class="kpi"><b>${n}</b><span>откликов</span></div><div class="kpi"><b>${pct(screens.length, n)}</b><span>до скрининга</span></div><div class="kpi"><b>${inter.length}</b><span>интервью</span></div><div class="kpi"><b>${pct(replied.length, n)}</b><span>ответили</span></div></div>
      <div class="paper"><h2>Конверсия в скрининг</h2>
        <p>${screens.length} из ${n}: <b>${pf(rate)}%</b>, вероятный диапазон ${pf(lo)}–${pf(hi)}%.</p>
        <p class="small muted">База на 24.11.2026: 3 из 209 (1,4%). ${n < 60 ? 'Выборка пока маленькая, выводы делать рано.' : rate > base * 1.5 ? 'Лучше базы — то, что изменилось, работает.' : rate < base / 1.5 ? 'Ниже базы: меньше откликов, больше подгонки и прямых откликов.' : 'Примерно на уровне базы.'} Одна удача из трёх — это не 33%: смотри на диапазон.</p></div>
      <div class="paper"><h2>Воронка</h2><div class="funnel">${funnel.map(([l, v]) => `<div class="f"><span>${l}</span><i style="width:${Math.max(1, v / n * 100)}%"></i><b>${v}</b></div>`).join('')}</div></div>
      <div class="paper"><h2>Отклики по неделям</h2><div class="bars">${weeks.map(w => `<div><b>${w.n || ''}</b><i style="height:${w.n / maxW * 100}%"></i>${w.s.getDate()}.${String(w.s.getMonth() + 1).padStart(2, '0')}</div>`).join('')}</div></div>
      <div class="paper"><h2>Сколько стоит один скрининг</h2>${costTable(RV.costPerScreen(st.rows.map(plainApp)))}</div>
      ${table('По источнику', seg(a => a.platform))}
      ${table('Агентство или работодатель', seg(a => a.agency ? 'Агентство' : 'Напрямую'))}
      ${table('По рынку', seg(a => a.market === 'A' ? 'А · full-time' : 'Б · с учёбой'))}
      ${closed.some(a => rowById(a.id) && rowById(a.id).cvKind) ? table('CV: подогнанное или обычное', seg(a => ({ Tailored: 'Подогнанное', Standard: 'Обычное' })[(rowById(a.id) || {}).cvKind] || 'Не отмечено')) + table('Версия CV', seg(a => String((rowById(a.id) || {}).cv || '').replace(/ · .*$/, '') || 'Не отмечено')) : ''}
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

  // ---------- Employers nearby (market B): map, OpenStreetMap list, today's five, second emails ----------
  const SEED = [
    ['University of Hertfordshire', 'university', 'Hatfield'], ['Anglia Ruskin University', 'university', 'Cambridge'], ['University of Cambridge', 'university', 'Cambridge'],
    ['Northumbria University London: careers', 'university', 'London'], ['Harlow College', 'college', 'Harlow'], ['Hertford Regional College', 'college', 'Ware'],
    ['Cambridge Regional College', 'college', 'Cambridge'], ['Chelmsford College', 'college', 'Chelmsford'], ['North Hertfordshire College', 'college', 'Stevenage'],
    ['Bishop\'s Stortford College', 'school', 'Bishop\'s Stortford'], ['Hockerill Anglo-European College', 'school', 'Bishop\'s Stortford'], ['Birchwood High School', 'school', 'Bishop\'s Stortford'],
    ['The Bishop\'s Stortford High School', 'school', 'Bishop\'s Stortford'], ['Herts and Essex High School', 'school', 'Bishop\'s Stortford'], ['Saffron Walden County High School', 'school', 'Saffron Walden'],
    ['Felsted School', 'school', 'Felsted'], ['Haileybury', 'school', 'Hertford'], ['East Herts Council', 'council', 'Hertford'], ['Uttlesford District Council', 'council', 'Saffron Walden'],
    ['Harlow Council', 'council', 'Harlow'], ['Hertfordshire County Council', 'council', 'Hertford'], ['Essex County Council', 'council', 'Chelmsford'],
    ['The Princess Alexandra Hospital NHS Trust', 'hospital', 'Harlow'], ['Cambridge University Hospitals (Addenbrooke\'s)', 'hospital', 'Cambridge'], ['London Stansted Airport', 'other', 'Stansted'],
    ['Currys', 'retail', 'Harlow'], ['Apple Store, Grand Arcade', 'retail', 'Cambridge'],
  ];
  const OLD_TYPE = { 'Университет': 'university', 'Колледж': 'college', 'Школа': 'school', 'Совет': 'council', 'NHS': 'hospital', 'Аэропорт': 'other', 'Ритейл': 'retail', 'MSP': 'it', 'Другое': 'other' };
  const EST = { todo: ['Не писал', ''], sent: ['Написал', 'info'], replied: ['Ответили', 'ok'], no: ['Не подходит', 'bad'] };
  const ECOL = { todo: '#8a968f', sent: '#2e5e8c', replied: '#1d6b4f', no: '#c23b22', queue: '#a85f00' };
  function homeLL() { const p = profile(); const town = p.home || (p.areas || [])[0] || 'Bishop\'s Stortford'; return A.coordsOf(town) || A.coordsOf('Bishop\'s Stortford') || [51.872, 0.159]; }
  function employers() {
    if (!st.local.employers) st.local.employers = [];
    const list = st.local.employers;
    let changed = false;
    if (!list.some(e => e.src === 'seed' || /^e\d+$/.test(e.id))) { SEED.forEach(([name, type, town], i) => list.push({ id: 'e' + i, name, type, town, status: 'todo', src: 'seed' })); changed = true; }
    const home = homeLL();
    list.forEach(e => {
      if (OLD_TYPE[e.type]) { e.type = OLD_TYPE[e.type]; changed = true; }
      if (e.lat == null) { const c = A.coordsOf(String(e.town || '').split(',')[0].trim()); if (c) { e.lat = c[0]; e.lon = c[1]; e.approx = true; changed = true; } }
      if (e.lat != null && e.km == null) { e.km = Math.round(OR.km(home, [e.lat, e.lon]) * 10) / 10; changed = true; }
      if (e.contact && !e.email && /@/.test(e.contact)) { e.email = e.contact; changed = true; }
      if (e.contact && !e.website && /^https?:/.test(e.contact)) { e.website = e.contact; changed = true; }
    });
    if (changed) save();
    return list;
  }
  const empById = id => employers().find(e => e.id === id);
  let empSyncTimer = null;
  function touchEmp(e, patch) {
    Object.assign(e, patch, { upd: Date.now() }); save();
    clearTimeout(empSyncTimer);
    if (st.cfg && st.scriptVersion >= 21) empSyncTimer = setTimeout(() => api('POST', null, { employers: OR.touched(employers()) }).catch(() => {}), 1500);
  }
  async function pullEmployers() {
    try { const d = await api('GET', { action: 'employers' }); if (Array.isArray(d.employers)) { st.local.employers = OR.merge(employers(), d.employers); save(); } } catch (e) { /* older script */ }
  }
  const typeLabel = t => (OR.TYPES[t] || OR.TYPES.other)[0];
  const kmText = e => e.km == null || (e.approx && e.km < 2) ? '' : `${e.approx ? '≈' : ''}${String(e.km).replace('.', ',')} км`;
  const HOOK = {
    school: 'I would love to help your IT team support staff and students, especially at busy times such as the start of term or the summer device refresh.',
    college: 'I would love to help your IT team support staff and students, especially at busy times such as enrolment and the start of term.',
    university: 'I would love to help your service desk support staff and students, especially at busy times such as the start of term.',
    it: 'I would be glad to help your engineers with first-line tickets, new device setups and on-site visits.',
    computer: 'I would be glad to help in store or in the workshop: diagnosing faults, setting up new devices and helping customers.',
    hospital: 'I would be glad to support your service desk with first-line tickets and device setups.',
    council: 'I would be glad to support your service desk with first-line tickets and device setups.',
  };
  function empMail(e, second) {
    const p = profile();
    const tpl = TP.merge(st.local.templates).speculative;
    let body = TP.fill(tpl.body, { name: '', company: e.name.replace(/:.*$/, '') }, p);
    const hook = HOOK[e.type];
    if (hook) { const parts = body.split('\n\n'); parts.splice(Math.min(2, parts.length), 0, hook); body = parts.join('\n\n'); }
    if (st.local.cvLink) body = body.replace(/My CV is attached\.?/, `My CV: ${st.local.cvLink}`).replace(/(\nKind regards)/, st.local.cvLink && !/My CV:/.test(body) ? `\nMy CV: ${st.local.cvLink}\n$1` : '$1');
    if (second) body = `Hi,\n\nI wrote to you last week about helping with 1st line IT support part-time. I just wanted to follow up in case anything has come up — I can start immediately and I'm happy to come in for a chat.\n\n${st.local.cvLink ? 'My CV: ' + st.local.cvLink + '\n\n' : ''}Kind regards,\n${p.signName || '[My name]'}${p.signPhone ? '\n' + p.signPhone : ''}`;
    const subject = second ? 'Following up: 1st line IT support' : TP.fill(tpl.subject, {}, p);
    return { to: e.email || '', subject, body };
  }
  const empSearch = e => e.type === 'it' && /MSP|рядом/.test(e.name) ? `https://www.google.com/maps/search/${encodeURIComponent('IT support company near ' + (profile().home || 'Bishop\'s Stortford'))}` : `https://www.google.com/search?q=${encodeURIComponent(`"${e.name.replace(/:.*$/, '')}" ${e.town || ''} IT vacancies OR jobs`)}`;
  async function importOsm() {
    const o = st.local.outreach, home = homeLL();
    st.osmBusy = true; render();
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(OR.overpassQuery(home[0], home[1], o.radius)) });
      if (!res.ok) throw new Error(res.status === 429 || res.status === 504 ? 'OpenStreetMap сейчас перегружен, попробуй через пару минут' : 'OpenStreetMap ответил ошибкой ' + res.status);
      const d = await res.json();
      const found = OR.fromOsm(d.elements, home, { primary: o.primary });
      const list = employers();
      const norm = x => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|school|college|ltd)\b/g, ' ').replace(/\s+/g, ' ').trim();
      let added = 0;
      found.forEach(f => {
        const twin = list.find(e => e.id === f.id || (e.src !== 'osm' && norm(e.name) && (norm(e.name) === norm(f.name) || (norm(e.name).length > 8 && norm(f.name).includes(norm(e.name))))));
        if (twin) { if (twin.approx || twin.lat == null) Object.assign(twin, { lat: f.lat, lon: f.lon, km: f.km, approx: false }); if (!twin.website && f.website) twin.website = f.website; if (!twin.email && f.email) twin.email = f.email; if (!twin.phone && f.phone) twin.phone = f.phone; return; }
        list.push(f); added++;
      });
      o.osmAt = todayIso(); save();
      toast(`Найдено ${found.length}, новых ${added}`);
    } catch (e) { toast(String(e.message || e)); }
    st.osmBusy = false; render();
  }
  function viewEmployers() {
    const list = employers(), f = st.empFilter, w = weekData(), t = targets(), o = st.local.outreach;
    const q5 = OR.queue(list, 5), due = OR.followUpsDue(list);
    const qset = new Set(q5.map(e => e.id));
    const term = (st.empQ || '').toLowerCase();
    const shown = list.filter(e => (f === 'all' || e.status === f) && (!st.empType || e.type === st.empType) && (!term || (e.name + ' ' + (e.town || '')).toLowerCase().includes(term)))
      .sort((a, b) => OR.priority(b) - OR.priority(a));
    const types = [...new Set(list.map(e => e.type))];
    const card = (e, second) => { const m = empMail(e, second); return `<div class="item"><div class="top"><span class="dot" style="background:${ECOL[qset.has(e.id) && !second ? 'queue' : e.status]};margin-top:7px"></span><div class="grow"><div class="t">${esc(e.name)}</div><div class="s">${esc(typeLabel(e.type))}${e.town ? ', ' + esc(e.town) : ''}${kmText(e) ? ' · ' + kmText(e) : ''}${second ? ` · написал ${esc(ago(e.contactedAt))}` : ''}</div></div></div>
      <p class="small ${e.email ? '' : 'muted'}">${e.email ? esc(e.email) : e.website ? 'Email не найден — найди на сайте страницу Vacancies / Contact' : 'Контактов нет — начни с поиска вакансий'}</p>
      <div class="row"><a class="btn go sm" href="${esc(mailHref(m.to, m.subject, m.body))}" target="_blank" rel="noopener" data-emp-mail="${esc(e.id)}"${second ? ' data-second="1"' : ''}>${second ? 'Второе письмо' : 'Письмо'}</a>${e.website ? `<a class="btn line sm" href="${esc(e.website)}" target="_blank" rel="noopener">Сайт</a>` : ''}<a class="btn line sm" href="${esc(empSearch(e))}" target="_blank" rel="noopener">Вакансии</a>${second ? `<button class="btn quiet sm" data-emp-set="${esc(e.id)}:replied">Ответили</button><button class="btn quiet sm" data-emp-set="${esc(e.id)}:closed">Не ответили</button>` : `<button class="btn quiet sm" data-emp-open="${esc(e.id)}">Ещё</button>`}</div></div>`; };
    return `
      <div><h1>Работодатели рядом</h1><p class="lead">Школы, колледжи, больницы, советы и IT-компании в радиусе ${o.radius} км. Холодных писем на этой неделе: ${w.C} из ${t.C}.</p></div>
      <div id="empMap" style="height:340px;border-radius:var(--r-lg);overflow:hidden;border:1px solid var(--line-2);background:var(--paper-2)" aria-label="Карта работодателей"></div>
      <div class="legend"><span><i style="background:${ECOL.queue}"></i>написать сегодня</span><span><i style="background:${ECOL.todo}"></i>не писал</span><span><i style="background:${ECOL.sent}"></i>написал</span><span><i style="background:${ECOL.replied}"></i>ответили</span><span><i style="background:${ECOL.no}"></i>не подходит</span></div>
      <div class="paper tight"><div class="row"><select class="input" id="osmRadius" style="width:auto;min-height:40px;padding:6px 34px 6px 12px">${[15, 30, 50].map(r => `<option value="${r}" ${o.radius === r ? 'selected' : ''}>${r} км</option>`).join('')}</select><label class="check small"><input type="checkbox" id="osmPrimary" ${o.primary ? 'checked' : ''}>начальные школы</label></div><button class="btn go block" id="osmLoad" ${st.osmBusy ? 'disabled' : ''}>${st.osmBusy ? 'Загружаю…' : o.osmAt ? 'Обновить из OpenStreetMap' : 'Найти всех работодателей рядом'}</button>
        <p class="tiny muted">${o.osmAt ? `Загружено ${esc(ago(o.osmAt))}, всего в списке ${list.length}.` : 'Сейчас в списке только 27 работодателей из стартового набора. OpenStreetMap добавит все школы, колледжи, больницы и IT-компании вокруг — бесплатно, без ключей.'}</p></div>
      ${due.length ? `<div class="sec-h"><h2>Второе письмо <span class="n">${due.length}</span></h2><span class="small muted">7 дней без ответа</span></div><div class="group">${due.slice(0, 5).map(e => card(e, true)).join('')}</div>` : ''}
      <div class="sec-h"><h2>5 писем на сегодня</h2></div>
      <div class="group">${q5.map(e => card(e)).join('') || '<div class="empty">Всем из списка уже написал. Обнови список из OpenStreetMap или добавь работодателя вручную.</div>'}</div>
      ${!st.local.cvLink ? '<p class="small muted">Из ссылки на письмо нельзя приложить файл. Добавь ссылку на CV в Google Drive в <a href="#setup">Настройках</a> — она встанет в письмо сама.</p>' : ''}
      <div class="sec-h"><h2>Все <span class="n">${shown.length}</span></h2></div>
      <input class="input" id="empQ" type="search" placeholder="Название или город" value="${esc(st.empQ || '')}" aria-label="Поиск работодателя">
      <div class="seg" role="group" aria-label="Статус">${[['all', 'Все'], ['todo', 'Не писал'], ['sent', 'Написал'], ['replied', 'Ответили'], ['no', 'Не подходит']].map(([k, l]) => `<button data-emp-filter="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
      <div class="seg" role="group" aria-label="Тип"><button data-emp-type="" aria-pressed="${!st.empType}">Все типы</button>${types.map(k => `<button data-emp-type="${k}" aria-pressed="${st.empType === k}">${esc(typeLabel(k))}</button>`).join('')}</div>
      <div class="group" id="empList">${shown.slice(0, st.empMore || 40).map(e => `<button class="app-row" data-emp-open="${esc(e.id)}"><i class="dot" style="background:${ECOL[qset.has(e.id) ? 'queue' : e.status]}"></i><span class="t">${esc(e.name)}</span><span class="r"><b>${EST[e.status][0]}</b>${kmText(e)}</span><span class="m">${esc(typeLabel(e.type))}${e.town ? ', ' + esc(e.town) : ''}${e.email ? ' · есть email' : ''}${e.watchUrl ? ' · слежу за вакансиями' : ''}</span></button>`).join('') || '<div class="empty">Никого не нашлось.</div>'}</div>
      ${shown.length > (st.empMore || 40) ? `<button class="btn line block" id="empMore">Показать ещё</button>` : ''}
      <details class="paper fold"><summary><h2>Добавить работодателя</h2></summary>
        <label class="f">Название<input class="input" id="empName" placeholder="Например, местная IT-компания"></label>
        <div class="split"><label class="f">Тип<select class="input" id="empType">${Object.entries(OR.TYPES).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></label><label class="f">Город<input class="input" id="empTown" placeholder="Harlow"></label></div>
        <label class="f">Email (если знаешь)<input class="input" id="empEmail" type="email"></label>
        <button class="btn go" id="empAdd">Добавить</button></details>`;
  }
  function openEmployer(id) {
    const e = empById(id); if (!e) return;
    const m = empMail(e), sh = $('#sheet');
    sh.innerHTML = `<div><p class="ticket">${esc(typeLabel(e.type))}${kmText(e) ? ' · ' + kmText(e) : ''}${e.src === 'osm' ? ' · OpenStreetMap' : ''}</p><h2 style="font-size:20px">${esc(e.name)}</h2><p class="muted">${esc([e.town, e.phone].filter(Boolean).join(' · '))}</p></div>
      <div class="status-grid">${Object.entries(EST).map(([k, v]) => `<button data-eset="${k}" aria-pressed="${e.status === k}"><i class="dot" style="background:${ECOL[k]}"></i>${v[0]}</button>`).join('')}</div>
      <label class="f">Email отдела IT или HR<input class="input" id="eEmail" type="email" value="${esc(e.email || '')}" placeholder="it@… или recruitment@…"></label>
      <label class="f">Страница вакансий — трекер будет проверять её раз в 12 часов<input class="input" id="eWatch" value="${esc(e.watchUrl || '')}" placeholder="https://…/vacancies"></label>
      <label class="f">Заметка<textarea class="input" id="eNote" style="min-height:70px">${esc(e.note || '')}</textarea></label>
      <div class="row"><button class="btn go grow" id="eSave">Сохранить</button><a class="btn line grow" href="${esc(mailHref(m.to, m.subject, m.body))}" target="_blank" rel="noopener" data-emp-mail="${esc(e.id)}">Письмо</a></div>
      <div class="row">${e.website ? `<a class="btn line sm" href="${esc(e.website)}" target="_blank" rel="noopener">Сайт</a>` : ''}<a class="btn line sm" href="${esc(empSearch(e))}" target="_blank" rel="noopener">Вакансии в Google</a>${e.lat != null ? `<a class="btn line sm" href="https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lon}&travelmode=transit" target="_blank" rel="noopener">Как добраться</a>` : ''}${st.local.ai.key ? '<button class="btn quiet sm" id="eAi">Письмо от AI</button>' : ''}</div>
      <div id="eAiOut"></div>
      ${e.src === 'user' ? '<button class="btn danger block" id="eDel">Удалить</button>' : ''}`;
    sh.hidden = false; $('#scrim').hidden = false; $('#toast').hidden = true;
    $$('[data-eset]', sh).forEach(b => b.onclick = () => { setEmpStatus(e, b.dataset.eset); closeSheet(); });
    $('#eSave', sh).onclick = () => { touchEmp(e, { email: $('#eEmail').value.trim(), watchUrl: $('#eWatch').value.trim(), note: $('#eNote').value.trim() }); closeSheet(); render(); toast('Сохранено'); };
    $$('[data-emp-mail]', sh).forEach(a => a.addEventListener('click', () => mailSent(a.dataset.empMail, false)));
    const del = $('#eDel', sh); if (del) del.onclick = () => { st.local.employers = employers().filter(x => x.id !== e.id); save(); closeSheet(); render(); };
    const ai = $('#eAi', sh);
    if (ai) ai.onclick = async () => {
      const out = $('#eAiOut'); out.innerHTML = '<p class="small muted">Пишу…</p>';
      try {
        const text = await LLM.draft(aiCfg(), { task: `Write a short speculative email (under 130 words) to ${e.name} (${typeLabel(e.type)} in ${e.town || 'the area'}, near Bishop's Stortford) asking about part-time or weekend 1st line IT support work alongside a Computing degree, available 3–4 days a week including weekends. Make the second sentence specific to this kind of employer. End with a polite ask for a short chat. No sign-off.`, facts: factsText(), words: 120 });
        const p = profile(); const full = text.trim() + `\n\n${st.local.cvLink ? 'My CV: ' + st.local.cvLink + '\n\n' : ''}Kind regards,\n${p.signName || '[My name]'}${p.signPhone ? '\n' + p.signPhone : ''}`;
        const warn = LLM.unknownTools(full, factsText(), profile());
        out.innerHTML = `<textarea class="out" id="eAiText">${esc(full)}</textarea>${warn.length ? `<p class="small" style="color:var(--red)">Проверь: ${esc(warn.join(', '))} нет в твоих фактах.</p>` : ''}<a class="btn go block" id="eAiSend" target="_blank" rel="noopener">Открыть в почте</a>`;
        const send = $('#eAiSend'); const upd = () => { send.href = mailHref($('#eEmail').value.trim(), m.subject, $('#eAiText').value); };
        upd(); $('#eAiText').oninput = upd; send.addEventListener('click', () => mailSent(e.id, false));
      } catch (err) { out.innerHTML = `<p class="small" style="color:var(--red)">${esc(err.message)}</p>`; }
    };
  }
  function setEmpStatus(e, status) {
    const prev = { status: e.status, contactedAt: e.contactedAt, followedAt: e.followedAt };
    const patch = { status: status === 'closed' ? 'no' : status };
    if (status === 'sent' && !e.contactedAt) patch.contactedAt = todayIso();
    if (status === 'closed') patch.note = [e.note, 'Без ответа после двух писем'].filter(Boolean).join('\n');
    touchEmp(e, patch); render();
    toast(`${e.name}: ${EST[patch.status][0].toLowerCase()}`, 'Отменить', () => { touchEmp(e, prev); render(); });
  }
  function mailSent(id, second) {
    const e = empById(id); if (!e) return;
    setTimeout(() => {
      if (second) touchEmp(e, { followedAt: todayIso() }); else if (e.status === 'todo') touchEmp(e, { status: 'sent', contactedAt: todayIso() });
      render(); toast(second ? 'Второе письмо отмечено' : 'Отмечено: написал. Напомню через 7 дней, если не ответят', 'Отменить', () => { if (second) touchEmp(e, { followedAt: '' }); else touchEmp(e, { status: 'todo', contactedAt: '' }); render(); });
    }, 500);
  }
  let empMap = null;
  async function drawMap() {
    const el = $('#empMap'); if (!el) return;
    try {
      if (!window.L) {
        if (!document.querySelector('link[data-leaflet]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'lib/vendor/leaflet/leaflet.css'; l.dataset.leaflet = '1'; document.head.appendChild(l); }
        await loadScript('lib/vendor/leaflet/leaflet.js');
      }
    } catch (e) { el.innerHTML = '<p class="small muted" style="padding:16px">Карта не загрузилась — нет интернета. Список ниже работает.</p>'; return; }
    if (!$('#empMap')) return;
    if (empMap) { empMap.remove(); empMap = null; }
    const L = window.L, home = homeLL(), list = employers(), q5 = new Set(OR.queue(list, 5).map(e => e.id));
    empMap = L.map(el, { zoomControl: true, attributionControl: true }).setView(home, st.local.outreach.radius > 30 ? 9 : 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(empMap);
    L.circle(home, { radius: st.local.outreach.radius * 1000, color: '#1d6b4f', weight: 1.5, fillOpacity: 0.04 }).addTo(empMap);
    L.circleMarker(home, { radius: 8, color: '#14201b', fillColor: '#14201b', fillOpacity: 1 }).addTo(empMap).bindTooltip('Дом');
    list.filter(e => e.lat != null && (st.empFilter === 'all' || e.status === st.empFilter) && (!st.empType || e.type === st.empType)).forEach(e => {
      const col = ECOL[q5.has(e.id) ? 'queue' : e.status];
      L.circleMarker([e.lat, e.lon], { radius: q5.has(e.id) ? 8 : (OR.TYPES[e.type] || [0, 1])[1] >= 2.4 ? 6 : 4.5, color: '#fff', weight: 1.2, fillColor: col, fillOpacity: 0.95 })
        .addTo(empMap).bindPopup(`<b>${esc(e.name)}</b><br>${esc(typeLabel(e.type))}${kmText(e) ? ' · ' + kmText(e) : ''}<br>${EST[e.status][0]}<br><a href="#" data-emp-open="${esc(e.id)}">Открыть</a>`);
    });
    el.onclick = ev => { const a = ev.target.closest('[data-emp-open]'); if (a) { ev.preventDefault(); openEmployer(a.dataset.empOpen); } };
  }

  // ---------- More (phone) and Settings ----------
  function viewMore() {
    const link = (href, icon, title, sub) => `<a class="more-link" href="${href}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${title}<small>${sub}</small></span></a>`;
    return `<h1>Ещё</h1><div class="group">
      ${link('#stats', '<path d="M5 20V11M10 20V5M15 20v-7M20 20V9" />', 'Статистика', 'конверсия, воронка, источники, отказы')}
      ${link('#employers', '<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6" />', 'Работодатели рядом', 'школы, колледжи, MSP — холодные письма')}
      ${link('#review', '<path d="M4 5h16v14H4zM4 9h16M9 13h6M9 16h4" />', 'Неделя', 'итоги, стоимость скрининга, план от AI')}
      ${link('#offer', '<path d="M12 3v18M16 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7" />', 'Оффер и зарплата', 'сравнение с дорогой, переговоры')}
      ${link('#cv', '<path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />', 'CV', 'версии А и Б, подгонка под вакансию')}
      ${link('#learn', '<path d="M3 8l9-4 9 4-9 4zM7 10v5c3 2 7 2 10 0v-5" />', 'План обучения', 'задания для лаборатории из пробелов')}
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
      <section class="paper"><h2>Цели на неделю и рынки А/Б</h2>
        ${(st.profile || {}).targets ? `<p>Рынок Б: <b>${targets().B}</b> · рынок А: <b>${targets().A}</b> · холодных писем: <b>${targets().C}</b> в неделю. Дни с парами: ${studyDays().map(i => ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][i]).join(', ') || 'нет'}.</p>
          <p class="small muted">Меняются в одном месте — в расширении: Skills &amp; settings → «Two job searches: markets A and B» (там же порог зарплаты, список компаний для рынка А и зарплатные ожидания). Сюда приходят через таблицу.</p>`
        : `<div class="goals">
        <label class="f">Рынок Б<input class="input" type="number" min="0" max="40" data-target="B" value="${l.targets.B}"></label>
        <label class="f">Рынок А<input class="input" type="number" min="0" max="40" data-target="A" value="${l.targets.A}"></label>
        <label class="f">Холодные письма<input class="input" type="number" min="0" max="40" data-target="C" value="${l.targets.C}"></label></div>
        <p class="small muted">Пока расширение не прислало свои настройки, цели хранятся здесь. Основное место — расширение: Skills &amp; settings → markets A and B.</p>`}</section>
      <section class="paper"><h2>Почта</h2>
        <label class="f">Как открывать письма<select class="input" id="mailMode"><option value="auto" ${l.mail === 'auto' ? 'selected' : ''}>Само: на телефоне — приложение, на компьютере — Gmail</option><option value="mailto" ${l.mail === 'mailto' ? 'selected' : ''}>Приложение почты</option><option value="gmail" ${l.mail === 'gmail' ? 'selected' : ''}>Gmail в браузере</option></select></label>
        <label class="f">Отправлять из Gmail-аккаунта<input class="input" id="mailFrom" list="accts" value="${esc(l.from)}" placeholder="oleh.poratui@gmail.com"><datalist id="accts">${accounts.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
        <label class="f">Ссылка на CV в Google Drive (для холодных писем)<input class="input" id="cvLink" value="${esc(l.cvLink || '')}" placeholder="https://drive.google.com/…"></label>
        <p class="small muted">Письмо всегда только открывается готовым — отправляешь ты. Файл из ссылки mailto приложить нельзя, поэтому CV идёт ссылкой: в Drive «Открыть доступ → Все, у кого есть ссылка».</p></section>
      <section class="paper"><h2>AI</h2>
        <p class="small muted">Нужен один бесплатный ключ — любой из трёх. Ключ хранится только на этом устройстве, зашифрованный PIN-кодом. В AI уходят текст вакансии и факты ниже, без имени, телефона и почты.</p>
        <ul class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px">
          <li><b>Groq</b> (лучший вариант, есть распознавание голоса): <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> → Create API Key.</li>
          <li><b>Gemini</b> (если Groq не пускает): <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> → Create API key. На бесплатном тарифе Google может использовать запросы для улучшения моделей.</li>
          <li><b>OpenRouter</b>: <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>, бесплатные модели, около 50 запросов в день.</li></ul>
        <label class="f">Ключ (gsk_…, AIza… или sk-or-…)<input class="input" id="aiKey" type="password" value="${esc(l.ai.key)}" placeholder="вставь ключ" autocomplete="off"></label>
        <label class="f">Модель — можно не трогать<input class="input" id="aiModel" value="${esc(l.ai.model)}" placeholder="${esc(l.ai.key ? LLM.modelFor(l.ai.key, '') : 'выберется сама')}"></label>
        <div class="row"><button class="btn go" id="aiSave">Сохранить</button><button class="btn line" id="aiTest">Проверить ключ</button></div><div id="aiMsg" class="small"></div>
        <label class="f">Факты о тебе — единственный источник для AI${(st.profile || {}).factBank && (st.profile || {}).factBank.length >= 80 && l.facts === DEFAULT_FACTS ? ' (сейчас берутся из расширения: Skills &amp; settings → Facts about you)' : ''}<textarea class="input" id="facts" style="min-height:200px">${esc(factsText())}</textarea></label>
        <div class="row"><button class="btn line" id="factsSave">Сохранить факты</button><button class="btn quiet" id="factsReset">Вернуть исходные</button></div></section>
      <section class="paper"><h2>Telegram</h2>
        <p class="small muted">Важное приходит в Telegram, даже когда приложение закрыто и компьютер выключен: ответы живых людей, приглашения, офферы, ответы работодателей, новые вакансии на страницах, за которыми следишь. Утром в 8:30 — сводка с лучшими вакансиями из рассылок, в 18:00 — интервью на завтра. Ночью тихо, в чт/пт днём — только приглашения.</p>
        <ol class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px"><li>В Telegram открой <b>@BotFather</b> → <code>/newbot</code> → придумай имя. Он пришлёт токен.</li><li>Открой своего нового бота и напиши ему <code>/start</code>.</li><li>В Google Таблице: меню <b>Job Tracker → Telegram: connect</b> → вставь токен. Токен хранится в скрипте, сюда его вводить не нужно.</li></ol>
        ${st.scriptVersion && st.scriptVersion < 22 ? '<p class="small" style="color:var(--amber)">Нужен Code.gs версии 22.</p>' : ''}</section>
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
  const ROUTES = { today: viewToday, check: viewCheck, apps: viewApps, stats: viewStats, templates: viewTemplates, employers: viewEmployers, cv: viewCv, learn: viewLearn, review: viewReview, brief: viewBrief, offer: viewOffer, more: viewMore, setup: viewSetup };
  const route = () => { const r = location.hash.replace('#', '').split('=')[0]; return ROUTES[r] ? r : (r === 'add' ? 'check' : r === 'list' ? 'apps' : 'today'); };
  function updateBadges() {
    if (st.lock) return;
    const L = todayLists();
    $('#cntToday').textContent = (L.inbox.length + L.due.length + L.follow.length + OR.followUpsDue(st.local.employers || []).length) || '';
    setOnline(true);
  }
  function render() {
    const r = route(), v = $('#view');
    document.body.classList.toggle('locked', !!st.lock);
    if (st.lock) { v.innerHTML = viewLock(); bindLock(v); return; }
    v.innerHTML = ROUTES[r]();
    const tab = ['stats', 'templates', 'employers', 'setup', 'cv', 'learn', 'review', 'brief', 'offer'].includes(r) && matchMedia('(max-width: 919px)').matches ? 'more' : r;
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
    $$('[data-inbox-emp]', v).forEach(b => b.onclick = () => { const it = st.inbox.find(x => x.id === b.dataset.inboxEmp); if (!it) return; const e = empById(it.employerId); st.local.inboxDone.push(it.id); if (e) touchEmp(e, { status: 'replied' }); save(); render(); api('POST', null, { inboxDismiss: [it.id] }).catch(() => {}); toast((e ? e.name : 'Работодатель') + ': ответили'); });
    const vo = $('#voiceOpen', v); if (vo) vo.onclick = () => openVoice();
    $$('[data-alert-hide]', v).forEach(b => b.onclick = () => { st.local.alertsHidden[b.dataset.alertHide] = 1; save(); render(); });
    $$('[data-alert-check]', v).forEach(b => b.onclick = () => { const x = (st.alerts || []).find(a => a.key === b.dataset.alertCheck); if (!x) return; st.local.alertsHidden[x.key] = 1; save(); st.input = x.url; LS.set('draft', x.url); location.hash = '#check'; analyze(x.url); });
    $$('[data-slots]', v).forEach(b => b.onclick = () => { const it = st.inbox.find(x => x.id === b.dataset.slots); if (it) openSlots(it); });
    $$('[data-inbox-add]', v).forEach(b => b.onclick = () => { const it = st.inbox.find(x => x.id === b.dataset.inboxAdd); if (it) quickAdd(it); });
    const sa = $('#staleAll', v);
    if (sa) sa.onclick = () => {
      const list = todayLists().stale; const before = list.map(a => [rowById(a.id), rowById(a.id).status]);
      const items = list.map(a => { const r = rowById(a.id); r.status = A.statusLabel('noresponse'); r.updated = Date.now(); const it = { type: 'patch', id: r.id, patch: { status: r.status }, at: Date.now() }; st.queue.push(it); return it; });
      save(); flush().then(updateBadges); render();
      toast(`${list.length} отмечено «Нет ответа»`, 'Отменить', () => { before.forEach(([r, s]) => { const i = st.queue.findIndex(x => items.includes(x) && x.id === r.id); if (i >= 0) st.queue.splice(i, 1); else st.queue.push({ type: 'patch', id: r.id, patch: { status: s }, at: Date.now() }); r.status = s; }); save(); flush(); render(); });
    };
    $$('[data-later-drop]', v).forEach(b => b.onclick = () => { st.local.later = st.local.later.filter(x => x.id !== b.dataset.laterDrop); save(); pushLater(); render(); });
    $$('[data-later-check]', v).forEach(b => b.onclick = () => { const x = st.local.later.find(y => y.id === b.dataset.laterCheck); if (!x) return; st.result = analyzeJob(x); st.letter = ''; location.hash = '#check'; });
    $$('[data-later-apply]', v).forEach(b => b.onclick = () => {
      const x = st.local.later.find(y => y.id === b.dataset.laterApply); if (!x) return;
      const r = analyzeJob(x); addRow(rowFromJob(r.job, r.an, r.c, 'applied', r));
      st.local.later = st.local.later.filter(y => y.id !== x.id); save(); pushLater(); render();
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
    // Week, ask, brief, offer
    const ra2 = $('#revAi', v); if (ra2) ra2.onclick = writeReview;
    const rc = $('#revCopy', v); if (rc) rc.onclick = () => copy($('#revText').value, rc);
    const rt = $('#revText', v); if (rt) rt.onchange = () => { st.local.reviews[weekKey()] = rt.value; save(); };
    const rs = $('#revSend', v); if (rs) rs.onclick = async () => { try { await api('POST', null, { weeklyNote: $('#revText').value }); toast('Выводы попадут в воскресное письмо'); } catch (e) { toast(String(e.message || e)); } };
    const ag = $('#askGo', v); if (ag) { ag.onclick = () => { const q = $('#askQ').value.trim(); if (q) askTracker(q); }; $('#askQ', v).onkeydown = e => { if (e.key === 'Enter') ag.click(); }; }
    $$('[data-brief]', v).forEach(b => b.onclick = () => { st.briefId = b.dataset.brief; location.hash = '#brief'; });
    const ba = $('#briefAi', v); if (ba) ba.onclick = () => writeBrief(rowById(st.briefId));
    const bc = $('#briefCopy', v); if (bc) bc.onclick = () => copy(st.local.briefs[st.briefId], bc);
    const bp = $('#briefPrompt', v); if (bp) bp.onclick = () => { const r = rowById(st.briefId); copy(`I have an interview for "${r.title}" at ${r.company}${r.location ? ' (' + r.location + ')' : ''}. Search the web and give me: what the company does and how big it is, recent news (last 6 months), what employees say about working there and about the IT team, the IT systems they likely use, and 3 smart questions to ask. Cite sources.\n\nJob ad:\n${String(r.description || '').slice(0, 5000)}`, bp); };
    const oa = $('#offAdd', v); if (oa) oa.onclick = () => { st.local.offers = st.local.offers || []; st.local.offers.push({ id: 'f' + Date.now().toString(36), company: '' }); save(); render(); };
    $$('[data-off]', v).forEach(i => i.onchange = () => { const [id, k] = i.dataset.off.split(':'); const o = st.local.offers.find(x => x.id === id); if (!o) return; o[k] = k === 'company' ? i.value.trim() : i.value.replace(',', '.').replace(/[^\d.]/g, ''); save(); render(); });
    $$('[data-off-del]', v).forEach(b => b.onclick = () => { st.local.offers = st.local.offers.filter(x => x.id !== b.dataset.offDel); save(); render(); });
    $$('[data-off-ai]', v).forEach(b => b.onclick = () => { const o = st.local.offers.find(x => x.id === b.dataset.offAi); if (o) offerScript(o); });
    // CV
    const tg = $('#tailorGo', v); if (tg) tg.onclick = () => doTailor(st.result);
    const cr = $('#cvReset', v); if (cr) cr.onclick = () => { const r = st.result; r.tl = null; r.tailored = false; render(); };
    const cs2 = $('#cvSummary', v); if (cs2) cs2.onclick = () => tailorSummary(st.result);
    const cd = $('#cvDocx', v); if (cd) cd.onclick = () => { const t = st.result.tl; saveBlob(DX.build(t.cv, { title: TL.fileName(t.cv, st.result.job) }), TL.fileName(t.cv, st.result.job) + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); };
    const cp2 = $('#cvPdf', v); if (cp2) cp2.onclick = async () => { const t = st.result.tl; try { saveBlob(await cvPdf(t.cv), TL.fileName(t.cv, st.result.job) + '.pdf', 'application/pdf'); } catch (e) { toast(String(e.message || e)); } };
    $$('[data-cvfile]', v).forEach(i => i.onchange = async () => {
      const f = i.files[0]; if (!f) return; const k = i.dataset.cvfile;
      toast('Читаю файл…');
      try { const d = await readCvFile(f); if ((d.text || '').trim().length < 200) throw new Error('В файле почти нет текста (скан?). Вставь текст вручную.'); st.local.cvs = { ...(st.local.cvs || {}), [k]: { text: d.text, name: f.name, at: todayIso() } }; save(); render(); toast('CV сохранено'); }
      catch (e) { toast(String(e.message || e)); }
    });
    $$('[data-cvsave]', v).forEach(b => b.onclick = () => { const k = b.dataset.cvsave; const t = $(`[data-cvtext="${k}"]`, v).value.trim(); if (t.length < 200) return toast('Слишком короткий текст для CV'); st.local.cvs = { ...(st.local.cvs || {}), [k]: { text: t, name: '', at: todayIso() } }; save(); render(); toast('CV сохранено'); });
    $$('[data-cvdel]', v).forEach(b => b.onclick = () => { const c = { ...(st.local.cvs || {}) }; delete c[b.dataset.cvdel]; st.local.cvs = c; save(); render(); });
    $$('[data-cvview]', v).forEach(b => b.onclick = () => { const d = b.closest('section').querySelector('details'); d.open = true; d.scrollIntoView({ block: 'center' }); });
    $$('[data-cvai]', v).forEach(b => b.onclick = async () => {
      const k = b.dataset.cvai, out = $(`[data-cvaiout="${k}"]`, v); out.innerHTML = '<p class="small muted">Пишу…</p>';
      try {
        const cvText = st.local.cvs[k].text;
        const text = await LLM.draft(aiCfg(), { task: k === 'B' ? 'Write a 3-line CV profile for part-time / weekend IT support roles alongside a Computing degree: say availability 3–4 days a week including weekends.' : 'Write a 3-line CV profile for full-time junior IT support / service desk roles at a strong tech company: ready to start full-time.', facts: cvText.slice(0, 5000), words: 60 });
        const warn = LLM.unknownTools(text, cvText, profile());
        out.innerHTML = `<textarea class="out" style="min-height:110px">${esc(text)}</textarea>${warn.length ? `<p class="small" style="color:var(--red)">Проверь: ${esc(warn.join(', '))} нет в CV.</p>` : ''}<p class="tiny muted">Вставь в CV вместо профиля и загрузи файл заново.</p>`;
      } catch (e) { out.innerHTML = `<p class="small" style="color:var(--red)">${esc(e.message)}</p>`; }
    });
    // Learning plan
    $$('[data-ldone]', v).forEach(b => b.onclick = () => { const n = b.dataset.ldone; setLearned(n, todayIso()); toast(`${n}: засчитано как лаборатория`, 'Отменить', () => setLearned(n, null)); });
    $$('[data-lundo]', v).forEach(b => b.onclick = () => setLearned(b.dataset.lundo, null));
    $$('[data-lnote]', v).forEach(t => t.onchange = () => { st.local.learnNotes = { ...(st.local.learnNotes || {}), [t.dataset.lnote]: t.value }; save(); });
    $$('[data-lai]', v).forEach(b => b.onclick = async () => {
      const n = b.dataset.lai; b.disabled = true; b.textContent = 'Придумываю…';
      try {
        const text = await LLM.draft(aiCfg(), { task: `Suggest one practical home lab task (Russian language, 2–3 sentences, about 90 minutes) that proves the skill "${n}" for an entry-level IT support job. Use only free tools or free tiers. The candidate already has a Proxmox home lab with Windows Server, Active Directory, Entra ID, Intune and osTicket. End with what to write in a knowledge base note.`, facts: factsText(), words: 70 });
        st.local.learnTasks = { ...(st.local.learnTasks || {}), [n]: text.trim() }; save(); render();
      } catch (e) { toast(String(e.message || e)); b.disabled = false; b.textContent = 'Другое задание (AI)'; }
    });
    // Applications
    const q = $('#q', v);
    if (q) q.oninput = () => { st.q = q.value; const l = $('#list', v); l.innerHTML = filtered().slice(0, 300).map(rowHtml).join('') || '<div class="empty">Ничего не найдено</div>'; bind(l); };
    // Templates
    $$('[data-tj]', v).forEach(i => i.onchange = () => { st.local.tplJob[i.dataset.tj] = i.value; save(); render(); });
    $$('[data-tcopy]', v).forEach(b => b.onclick = () => copy($(`[data-tbody="${b.dataset.tcopy}"]`, v).value, b));
    $$('[data-tsave]', v).forEach(b => b.onclick = () => { const k = b.dataset.tsave; st.local.templates[k] = { ...(st.local.templates[k] || {}), body: $(`[data-tbody="${k}"]`, v).value }; save(); toast('Шаблон сохранён'); render(); });
    $$('[data-treset]', v).forEach(b => b.onclick = () => { delete st.local.templates[b.dataset.treset]; save(); render(); });
    // Employers
    if ($('#empMap', v)) drawMap();
    $$('[data-emp-filter]', v).forEach(b => b.onclick = () => { st.empFilter = b.dataset.empFilter; st.empMore = 40; render(); });
    $$('[data-emp-type]', v).forEach(b => b.onclick = () => { st.empType = b.dataset.empType; st.empMore = 40; render(); });
    $$('[data-emp-open]', v).forEach(b => b.onclick = e => { e.preventDefault(); openEmployer(b.dataset.empOpen); });
    $$('[data-emp-set]', v).forEach(b => b.onclick = () => { const [id, stt] = b.dataset.empSet.split(':'); const e = empById(id); if (e) setEmpStatus(e, stt); });
    $$('[data-emp-mail]', v).forEach(a => a.addEventListener('click', () => mailSent(a.dataset.empMail, !!a.dataset.second)));
    const eq = $('#empQ', v); if (eq) eq.onchange = () => { st.empQ = eq.value; render(); };
    const em = $('#empMore', v); if (em) em.onclick = () => { st.empMore = (st.empMore || 40) + 60; render(); };
    const orad = $('#osmRadius', v); if (orad) orad.onchange = () => { st.local.outreach.radius = +orad.value; save(); };
    const opr = $('#osmPrimary', v); if (opr) opr.onchange = () => { st.local.outreach.primary = opr.checked; save(); };
    const ol = $('#osmLoad', v); if (ol) ol.onclick = importOsm;
    const ea = $('#empAdd', v);
    if (ea) ea.onclick = () => { const name = $('#empName').value.trim(); if (!name) return toast('Впиши название'); const e = { id: 'u' + Date.now().toString(36), name, type: $('#empType').value, town: $('#empTown').value.trim(), email: $('#empEmail').value.trim(), status: 'todo', src: 'user' }; employers().unshift(e); touchEmp(e, {}); render(); toast('Добавлено'); };
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
    const cl2 = $('#cvLink', v); if (cl2) cl2.onchange = () => { st.local.cvLink = cl2.value.trim(); save(); toast('Ссылка на CV сохранена'); };
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
  window.JT_App = { st, openVoice, employers, importOsm, analyzeJob, readJob, setStatus, render, lockNow, toApp, todayLists, weekData, parseFollow, parseContacts };
})();
