/* Job Tracker phone app.
 * Data lives in your Google Sheet; this page talks to the Apps Script web app with your token.
 * Analysis runs here with the same code as the extension (lib/analyzer.js, lib/market.js).
 * Nothing is sent anywhere else. Settings stay in this browser (localStorage). */
(function () {
  'use strict';
  const A = window.JT_Analyzer, S = window.JT_Store, E = window.JT_Extract, Q = window.JT_Quality, Mk = window.JT_Market, I = window.JT_Insights, T = window.JT_I18n;
  if (T) T.setLang('ru');
  const tr = s => (T ? T.tr(s) : s);
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Local storage (settings, cached rows, pending changes) ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('jt.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('jt.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const V = window.JT_Vault;
  const st = {
    cfg: null, rows: [], profile: null, queue: [], syncedAt: 0,
    filter: LS.get('filter', 'active'), q: '', input: LS.get('draft', ''), result: null, busy: false, error: '',
    // PIN lock: 'unlock' (a PIN is set, enter it), 'create' (connected, choose a PIN), null (open)
    lock: null, pin: '', pin1: '', pinMsg: '', pendingCfg: null, pendingShare: null,
  };
  let K = null;            // key derived from the PIN, only in memory while unlocked
  let hiddenAt = 0;
  const LOCK_AFTER_MS = 5 * 60e3, MAX_FAILS = 10;
  const VAULT_KEYS = ['cfg', 'rows', 'profile', 'queue', 'syncedAt'];
  // Data written by the first version without a PIN is moved into the vault, then removed
  const legacy = () => { const o = {}; let any = false; VAULT_KEYS.forEach(k => { const v = LS.get(k, undefined); if (v !== undefined) { o[k] = v; any = true; } }); return any ? o : null; };
  let saving = Promise.resolve();
  function save() {
    if (!K) return saving;
    const data = {}; VAULT_KEYS.forEach(k => { data[k] = st[k]; });
    saving = saving.then(() => V.seal(K, data)).then(box => { LS.set('vault', box); VAULT_KEYS.forEach(k => { try { localStorage.removeItem('jt.' + k); } catch (e) { /* ignore */ } }); }).catch(() => {});
    return saving;
  }
  function lockNow() {
    if (!LS.get('vault', null)) return;
    K = null; VAULT_KEYS.forEach(k => { st[k] = k === 'rows' || k === 'queue' ? [] : k === 'syncedAt' ? 0 : null; });
    st.result = null; st.lock = 'unlock'; st.pin = ''; st.pinMsg = '';
    closeSheet(); render();
  }
  function wipe() {
    ['vault', 'pinFails', ...VAULT_KEYS].forEach(k => { try { localStorage.removeItem('jt.' + k); } catch (e) { /* ignore */ } });
    K = null; VAULT_KEYS.forEach(k => { st[k] = k === 'rows' || k === 'queue' ? [] : k === 'syncedAt' ? 0 : null; });
  }

  // ---------- Statuses ----------
  const RU = { applied: 'Отклик', screening: 'Скрининг', test: 'Тестовое', interview1: 'Интервью 1', interview2: 'Интервью 2', interview3: 'Интервью 3',
    offer: 'Оффер', accepted: 'Принял оффер', declined: 'Отказался', rejected: 'Отказ', noresponse: 'Нет ответа', withdrawn: 'Отозвал' };
  const ORDER = ['applied', 'screening', 'test', 'interview1', 'interview2', 'interview3', 'offer', 'accepted', 'rejected', 'noresponse', 'withdrawn', 'declined'];
  const idOf = label => { const s = A.STATUSES.find(x => x.label === String(label).trim() || x.id === label); return s ? s.id : 'applied'; };
  const colorOf = id => (A.STATUSES.find(x => x.id === id) || { color: '#888' }).color;
  const pill = id => `<span class="pill" style="background:color-mix(in srgb, ${colorOf(id)} 16%, transparent);color:${colorOf(id)}">${esc(RU[id] || id)}</span>`;
  const ACTIVE = ['applied', 'screening', 'test', 'interview1', 'interview2', 'interview3', 'offer'];
  const REPLIED = ['screening', 'test', 'interview1', 'interview2', 'interview3', 'offer', 'accepted', 'declined'];
  const CLOSED = ['rejected', 'noresponse', 'withdrawn', 'declined', 'accepted'];

  const VERD = { apply: ['Подавай', 'var(--ok)'], tailor: ['Подгони CV и подавай', 'var(--primary)'], ask: ['Сначала уточни', 'var(--warn)'], skip: ['Не стоит', 'var(--bad)'], incomplete: ['Мало данных', 'var(--muted)'] };

  // ---------- Profile (from the sheet, sent there by the extension) ----------
  function profile() {
    const d = JSON.parse(JSON.stringify(A.DEFAULT_PROFILE));
    const p = st.profile || {};
    return { ...d, ...p, skills: { ...(p.skills || d.skills) }, areas: p.areas || d.areas, intern: { ...d.intern, ...(p.intern || {}), placement: { ...d.intern.placement, ...((p.intern || {}).placement || {}) } } };
  }

  // ---------- Apps Script API ----------
  async function api(method, params, body) {
    if (!st.cfg || !st.cfg.url || !st.cfg.token) throw new Error('Таблица не подключена');
    let res;
    if (!/^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec\/?$/.test(st.cfg.url.split('?')[0])) throw new Error('Адрес должен быть вида https://script.google.com/macros/s/…/exec (не /dev и не ссылка на саму таблицу).');
    try {
      if (method === 'GET') {
        const u = new URL(st.cfg.url);
        u.searchParams.set('token', st.cfg.token);
        Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
        res = await fetch(u.toString(), { redirect: 'follow' });
      } else {
        res = await fetch(st.cfg.url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, token: st.cfg.token }) });
      }
    } catch (e) {
      // The extension can reach a script open only to your Google account; a web page cannot,
      // so Google answers with a sign-in page the browser refuses to read ('Failed to fetch')
      if (!navigator.onLine) throw new Error('Нет интернета');
      throw new Error('Скрипт не отвечает этой странице. В Apps Script: Deploy → Manage deployments → ✏ → «Who has access: Anyone» (не «Anyone with Google account») → Version: New version → Deploy. Данные защищает токен.');
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
      const [{ rows }, pr] = await Promise.all([api('GET', {}), api('GET', { action: 'profile' }).catch(() => ({}))]);
      st.rows = rows;
      if (pr && pr.profile) st.profile = pr.profile;
      // Changes still waiting to be sent stay visible
      st.queue.forEach(it => { const r = st.rows.find(x => String(x.id) === String(it.id)); if (r && it.type === 'patch') Object.assign(r, it.patch); if (!r && it.type === 'add') st.rows.unshift(it.row); });
      st.syncedAt = Date.now();
      save();
      setOnline(true);
      if (!quiet) toast('Данные обновлены');
    } catch (e) {
      setOnline(navigator.onLine && !/fetch|network/i.test(String(e.message)));
      if (!quiet) toast(String(e.message || e));
    }
    render();
  }

  let flushing = null;
  async function flush() {
    if (flushing) return flushing;
    if (!st.queue.length || !st.cfg) return;
    flushing = (async () => {
      const batch = st.queue.slice();
      await api('POST', null, { apps: batch.filter(x => x.type === 'add').map(x => x.row), patches: batch.filter(x => x.type === 'patch').map(x => ({ id: x.id, ...x.patch })), deletes: [] });
      st.queue = st.queue.filter(x => !batch.includes(x));
      save();
      setOnline(true);
    })();
    try { await flushing; } catch (e) { setOnline(false); } finally { flushing = null; }
  }
  const enqueue = item => { st.queue.push(item); save(); flush().then(updateBadges); };

  function setOnline(ok) { const n = $('#net'); if (n) n.hidden = ok && !st.queue.length; if (n && st.queue.length) n.textContent = `не отправлено: ${st.queue.length}`; else if (n) n.textContent = 'офлайн'; }

  // ---------- Quick status changes, with undo ----------
  function setStatus(id, status, extra) {
    const r = st.rows.find(x => String(x.id) === String(id));
    if (!r) return;
    const before = { status: r.status, nextDate: r.nextDate, notes: r.notes };
    const patch = { status: A.statusLabel(status), ...(extra || {}) };
    Object.assign(r, patch, { updated: Date.now() });
    const item = { type: 'patch', id: r.id, patch, at: Date.now() };
    enqueue(item);
    render();
    toast(`${r.company || r.title}: ${RU[status]}`, 'Отменить', () => {
      const i = st.queue.indexOf(item);
      if (i >= 0) st.queue.splice(i, 1); else enqueue({ type: 'patch', id: r.id, patch: { status: before.status, ...(extra && 'nextDate' in extra ? { nextDate: before.nextDate || '' } : {}) }, at: Date.now() });
      Object.assign(r, before);
      save(); render(); closeSheet(); toast('Отменено');
    });
  }

  // ---------- Reading a job: link or pasted text ----------
  const URL_RE = /https?:\/\/[^\s<>"']+/i;
  async function readJob(raw) {
    const text = String(raw || '').trim();
    const m = text.match(URL_RE);
    const onlyLink = m && text.replace(m[0], '').trim().length < 40;
    if (onlyLink) {
      const url = S.cleanUrl(m[0].replace(/[).,]+$/, ''));
      if (!st.cfg) throw new Error('Чтобы читать вакансии по ссылке, подключи Google Таблицу в настройках (⚙). Пока можно вставить текст вакансии.');
      const d = await api('GET', { action: 'fetchJob', url });
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
    return { job: { ...job, title: job.title || 'Без названия' }, an, c, market, office, worth, dup, answers: Mk.answers(full, p, an) };
  }

  async function analyze(raw) {
    st.busy = true; st.error = ''; st.result = null; render();
    try {
      const job = await readJob(raw);
      st.result = analyzeJob(job);
    } catch (e) { st.error = String(e.message || e); }
    st.busy = false; render();
    const r = $('#result'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function addFromResult(status) {
    const r = st.result;
    if (!r) return;
    const nums = st.rows.map(x => parseInt(String(x.ticket || '').replace(/\D/g, ''), 10) || 0);
    const ticket = 'APP-' + String(Math.max(0, ...nums) + 1).padStart(4, '0');
    const today = new Date().toISOString().slice(0, 10);
    const row = {
      id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ticket,
      title: r.job.title, company: r.job.company || '', location: r.job.location || '', category: r.an.category || '', workTypes: (r.an.workTypes || []).join(', '),
      salary: (r.an.salary && r.an.salary.text) || r.job.salaryText || '', platform: r.job.platform || (r.job.url ? S.platformFromUrl(r.job.url) : 'Other'),
      appliedAt: today, status: A.statusLabel(status), chance: r.c.verdict !== 'incomplete' ? r.c.score : '', nextDate: '', notes: 'Добавлено с телефона',
      missing: (r.c.missing || []).join(', '), tools: (r.c.tools || []).join(', '), details: (r.an.details || []).join(' • '), url: r.job.url || '',
      benefits: (r.an.benefits || []).join(' • '), track: r.an.track === 'intern' ? 'Internship' : 'Job', verdict: A.VERDICTS[r.c.verdict] ? A.VERDICTS[r.c.verdict].label : '',
      description: String(r.an.description || r.job.description || '').slice(0, 40000), updated: Date.now(),
    };
    st.rows.unshift(row);
    enqueue({ type: 'add', id: row.id, row, at: Date.now() });
    st.result = null; st.input = ''; LS.set('draft', '');
    toast(`Добавлено в таблицу: ${row.ticket}`, 'Открыть', () => openApp(row.id));
    location.hash = '#list';
  }

  // ---------- Views ----------
  function viewAdd() {
    const r = st.result;
    return `
      <h1>Стоит подавать?</h1>
      <p class="sub">Вставь ссылку на вакансию или её текст. Разбор займёт пару секунд.</p>
      <div class="card">
        <label for="jobInput" class="small muted">Ссылка (LinkedIn, Indeed, Reed, Totaljobs…) или описание</label>
        <textarea id="jobInput" class="input" placeholder="https://www.linkedin.com/jobs/view/…" autocomplete="off">${esc(st.input)}</textarea>
        <div class="row">
          <button class="btn ghost" id="paste">Вставить</button>
          <button class="btn primary grow" id="go" ${st.busy ? 'disabled' : ''}>${st.busy ? '<span class="spinner"></span> Читаю вакансию' : 'Разобрать'}</button>
        </div>
        ${!st.cfg ? '<div class="notice info small">Ссылки читает твой скрипт в Google Таблице. Подключи её в настройках ⚙, а пока работает вставка текста.</div>' : ''}
      </div>
      ${st.error ? `<div class="notice bad">${esc(st.error)}</div>` : ''}
      ${r ? resultHtml(r) : ''}`;
  }

  function resultHtml(r) {
    const c = r.c, d = A.display(c);
    const v = VERD[c.verdict] || VERD.ask;
    const blocks = (c.gates && c.gates.blocks) || [], asks = (c.gates && c.gates.asks) || [];
    const p = profile();
    const officeBad = r.market === 'B' && r.office != null && r.office >= 4;
    const chips = [
      r.market === 'B' ? '<span class="chip B">Б · с учёбой</span>' : `<span class="chip A">А · full-time${r.worth ? (r.worth.ok ? ' · стоит академа' : ' · не цель') : ''}</span>`,
      r.office != null ? `<span class="chip ${officeBad ? 'bad' : r.office <= 2 ? 'ok' : ''}">${r.office === 0 ? 'удалённо' : `офис ${r.office} дн/нед`}</span>` : '',
      r.an.salary && r.an.salary.text ? `<span class="chip">${esc(r.an.salary.text)}</span>` : '',
      r.job.location ? `<span class="chip">${esc(r.job.location)}</span>` : '',
      ...(r.an.workTypes || []).slice(0, 3).map(w => `<span class="chip">${esc(w)}</span>`),
    ].filter(Boolean).join('');
    const worthWhy = r.worth && !r.worth.ok ? [!r.worth.known && 'компании нет в списке', !r.worth.pay && `зарплата ниже £${(r.worth.min / 1000).toFixed(0)}k`, !r.worth.growth && 'не видно роста или обучения'].filter(Boolean).join(', ') : '';
    return `
      <section id="result" class="card">
        ${r.dup ? `<div class="notice">Уже в таблице: <b>${esc(r.dup.ticket || '')}</b> · ${esc(RU[idOf(r.dup.status)] || r.dup.status)}. <a href="#" data-open="${esc(r.dup.id)}">Открыть</a></div>` : ''}
        <div>
          <div class="job-t">${esc(r.job.title)}</div>
          <div class="muted small">${esc(r.job.company || 'компания не указана')}</div>
        </div>
        <div class="hero">
          <div class="ring" style="--p:${c.verdict === 'incomplete' ? 0 : c.score};--c:${v[1]}"><b style="${d.text.length > 3 ? 'font-size:18px' : ''}">${esc(d.text)}</b></div>
          <div>
            <div class="verdict" style="color:${v[1]}">${v[0]}</div>
            <div class="muted small">${esc(tr(d.hint || ''))}</div>
          </div>
        </div>
        <div class="chips">${chips}</div>
        ${officeBad ? `<div class="notice bad">Для работы с учёбой не подходит: офис ${r.office} дня в неделю${p.workDays && p.workDays.length ? '' : ''}.</div>` : ''}
        ${worthWhy ? `<div class="notice small">Full-time без признаков «стоит академа»: ${esc(worthWhy)}.</div>` : ''}
        ${blocks.length || asks.length ? `<ul class="list-plain">${blocks.map(b => `<li><span class="mark bad">✕</span><span>${esc(tr(b.text))}</span></li>`).join('')}${asks.map(b => `<li><span class="mark warn">!</span><span>${esc(tr(b.text))}</span></li>`).join('')}</ul>` : ''}
        ${(c.tools || []).length ? `<div><h2 style="margin-bottom:8px">Навыки из вакансии</h2><div class="skills">${(c.matched || []).map(t => `<span class="chip ok">${esc(t)}</span>`).join('')}${(c.basic || []).map(t => `<span class="chip warn">${esc(t)}</span>`).join('')}${(c.missing || []).map(t => `<span class="chip bad">${esc(t)}</span>`).join('')}</div><p class="small muted" style="margin:8px 0 0">зелёный — уверенно, жёлтый — базово, красный — нет</p></div>` : ''}
      </section>
      <details class="card" open>
        <summary><h2>Основные ответы для анкеты</h2></summary>
        ${r.answers.map((x, i) => `<div class="qa"><div class="q">${esc(x.q)}</div><div class="a">${esc(x.a)}</div><button class="copy" data-copy="${i}">Копировать</button>${x.note ? `<div class="n">${esc(x.note)}</div>` : ''}</div>`).join('')}
      </details>
      <div class="card">
        <h2>Добавить в таблицу</h2>
        <button class="btn primary block" data-add="applied">Я откликнулся</button>
        <div class="row">
          ${r.job.url ? `<a class="btn line grow" href="${esc(r.job.url)}" target="_blank" rel="noopener">Открыть вакансию</a>` : ''}
          <button class="btn ghost grow" id="clear">Новая вакансия</button>
        </div>
        ${!st.cfg ? '<p class="small muted" style="margin:0">Без подключённой таблицы заявка сохранится на телефоне и отправится, когда подключишь.</p>' : ''}
      </div>`;
  }

  function filtered() {
    const q = st.q.trim().toLowerCase();
    const f = st.filter;
    return st.rows.filter(r => {
      const id = idOf(r.status);
      if (f === 'active' && !ACTIVE.includes(id)) return false;
      if (f === 'replied' && !REPLIED.includes(id) && id !== 'rejected') return false;
      if (f === 'closed' && !CLOSED.includes(id)) return false;
      return !q || [r.title, r.company, r.ticket, r.location].join(' ').toLowerCase().includes(q);
    }).sort((x, y) => String(y.appliedAt).localeCompare(String(x.appliedAt)) || (y.updated || 0) - (x.updated || 0));
  }
  const ago = iso => { if (!iso) return ''; const d = Math.floor((Date.now() - Date.parse(iso + (iso.length === 10 ? 'T12:00:00' : ''))) / 864e5); return d <= 0 ? 'сегодня' : d === 1 ? 'вчера' : `${d} дн назад`; };
  const rowHtml = r => { const id = idOf(r.status); return `<button class="app-row" data-open="${esc(r.id)}"><span class="t">${esc(r.title || 'Без названия')}</span><span class="st">${pill(id)}</span><span class="m">${esc([r.company, ago(r.appliedAt), r.chance !== '' && r.chance != null ? `fit ${r.chance}%` : ''].filter(Boolean).join(' · '))}</span></button>`; };

  function viewList() {
    const all = st.rows, ids = all.map(r => idOf(r.status));
    const replied = ids.filter(x => REPLIED.includes(x) || x === 'rejected').length;
    const inter = ids.filter(x => ['interview1', 'interview2', 'interview3', 'offer', 'accepted'].includes(x)).length;
    const list = filtered();
    const F = [['active', 'В работе'], ['replied', 'Ответили'], ['closed', 'Закрытые'], ['all', 'Все']];
    return `
      <h1>Заявки</h1>
      <div class="stats">
        <div class="stat"><b>${all.length}</b><span>всего</span></div>
        <div class="stat"><b>${all.length ? Math.round(replied / all.length * 1000) / 10 : 0}%</b><span>ответили</span></div>
        <div class="stat"><b>${inter}</b><span>интервью</span></div>
      </div>
      <input class="input" id="q" type="search" placeholder="Поиск: компания, роль, APP-…" value="${esc(st.q)}" autocomplete="off">
      <div class="seg" role="group" aria-label="Фильтр">${F.map(([k, l]) => `<button data-filter="${k}" aria-pressed="${st.filter === k}">${l}</button>`).join('')}</div>
      <div class="list">${list.length ? list.slice(0, 200).map(rowHtml).join('') : `<div class="empty"><b>${st.cfg ? 'Пусто' : 'Таблица не подключена'}</b>${st.cfg ? 'Под этот фильтр заявок нет.' : 'Открой настройки ⚙ и вставь ссылку подключения из расширения.'}</div>`}</div>
      ${st.syncedAt ? `<p class="small muted" style="text-align:center">Обновлено ${new Date(st.syncedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · <a href="#" id="refresh">обновить</a></p>` : ''}`;
  }

  function todayItems() {
    const today = new Date().toISOString().slice(0, 10);
    const due = [], follow = [], stale = [];
    st.rows.forEach(r => {
      const id = idOf(r.status);
      if (r.nextDate && String(r.nextDate) <= today && !CLOSED.includes(id)) due.push(r);
      else if (id === 'applied' && r.appliedAt) {
        const wd = I ? I.workingDaysSince(r.appliedAt + 'T12:00:00') : 0;
        const days = Math.floor((Date.now() - Date.parse(r.appliedAt + 'T12:00:00')) / 864e5);
        if (days >= 30) stale.push(r);
        else if (wd >= 4 && !r.followup) follow.push(r);
      }
    });
    return { due, follow, stale };
  }
  function viewToday() {
    const { due, follow, stale } = todayItems();
    const sec = (title, list, btns) => list.length ? `<div class="group-h">${title} · ${list.length}</div><div class="list">${list.slice(0, 30).map(r => `<div class="card" style="gap:10px">${rowHtml(r).replace('class="app-row"', 'class="app-row" style="box-shadow:none;padding:0"')}<div class="row">${btns(r)}</div></div>`).join('')}</div>` : '';
    const html = sec('Шаг на сегодня', due, r => `<button class="btn primary sm grow" data-open="${esc(r.id)}">Обновить статус</button>`)
      + sec('Пора написать follow-up', follow, r => `<button class="btn ghost sm grow" data-quick="${esc(r.id)}:screening">Пригласили</button><button class="btn ghost sm grow" data-quick="${esc(r.id)}:rejected">Отказ</button><button class="btn line sm" data-open="${esc(r.id)}">…</button>`)
      + sec('Месяц без ответа', stale, r => `<button class="btn ghost sm grow" data-quick="${esc(r.id)}:noresponse">Нет ответа</button><button class="btn line sm" data-open="${esc(r.id)}">…</button>`);
    return `<h1>Сегодня</h1><p class="sub">${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>${html || '<div class="empty"><b>Всё сделано</b>Новые дела появятся, когда подойдёт срок follow-up или следующий шаг.</div>'}`;
  }

  function viewSetup() {
    const c = st.cfg || {};
    return `
      <h1>Подключение</h1>
      <p class="sub">Приложение работает с твоей Google Таблицей через скрипт, который уже синхронизирует расширение.</p>
      <div class="card">
        <ol class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">
          <li>В расширении открой <b>Settings → Phone app</b> и скопируй ссылку подключения. Открой её на телефоне — всё заполнится само.</li>
          <li>Или вставь вручную адрес веб-приложения и токен из меню таблицы <b>Job Tracker → Show sync token</b>.</li>
        </ol>
        <label class="small muted" for="cfgUrl">Адрес веб-приложения (…/exec)</label>
        <input class="input" id="cfgUrl" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(c.url || '')}" autocomplete="off">
        <label class="small muted" for="cfgToken">Токен</label>
        <input class="input" id="cfgToken" type="password" value="${esc(c.token || '')}" autocomplete="off">
        <button class="btn primary block" id="cfgSave">Сохранить и проверить</button>
        <div id="cfgMsg" class="small"></div>
      </div>
      <div class="card">
        <h2>Как поставить на главный экран</h2>
        <p class="small muted" style="margin:0">Chrome на Android: меню ⋮ → «Установить приложение». После этого Job Tracker появится в меню «Поделиться» в LinkedIn, Indeed и Reed: нажми «Поделиться» на вакансии → Job Tracker.</p>
      </div>
      ${K ? `<div class="card"><h2>PIN-код</h2><p class="small muted" style="margin:0">Приложение блокируется через 5 минут в фоне. Токен и заявки на телефоне зашифрованы этим PIN. После 10 неверных попыток данные на телефоне стираются (в таблице всё остаётся).</p><div class="row"><button class="btn ghost grow" id="lockNow">Заблокировать</button><button class="btn line grow" id="changePin">Сменить PIN</button></div></div>` : ''}
      ${st.cfg ? '<button class="btn line block" id="disconnect">Отключить таблицу на этом телефоне</button>' : ''}`;
  }

  // ---------- Application sheet ----------
  function openApp(id) {
    const r = st.rows.find(x => String(x.id) === String(id));
    if (!r) return;
    const cur = idOf(r.status);
    const sh = $('#sheet');
    sh.innerHTML = `
      <div>
        <div class="muted small mono">${esc(r.ticket || '')}${r.platform ? ' · ' + esc(r.platform) : ''}</div>
        <div class="job-t">${esc(r.title || 'Без названия')}</div>
        <div class="muted small">${esc([r.company, r.location, r.salary].filter(Boolean).join(' · '))}</div>
      </div>
      <div><h2 style="margin-bottom:8px">Что произошло?</h2>
        <div class="status-grid">${ORDER.map(s => `<button data-set="${s}" aria-pressed="${s === cur}"><i style="background:${colorOf(s)}"></i>${RU[s]}</button>`).join('')}</div>
      </div>
      <div class="row">
        <label class="small muted grow" for="nd">Следующий шаг</label>
        <input class="input" id="nd" type="date" value="${esc(/^\d{4}-\d{2}-\d{2}$/.test(r.nextDate || '') ? r.nextDate : '')}" style="width:auto;flex:1;min-width:150px">
      </div>
      <textarea class="input" id="notes" placeholder="Заметки: кто звонил, дата интервью…" style="min-height:90px">${esc(r.notes || '')}</textarea>
      <div class="row">
        <button class="btn primary grow" id="saveNotes">Сохранить</button>
        ${r.url ? `<a class="btn line grow" href="${esc(r.url)}" target="_blank" rel="noopener">Вакансия</a>` : ''}
      </div>
      ${r.description ? `<button class="btn ghost block" id="reAnalyze">Разобрать снова</button>` : ''}`;
    sh.hidden = false; $('#scrim').hidden = false; $('#toast').hidden = true;
    sh.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { setStatus(r.id, b.dataset.set); closeSheet(); });
    $('#saveNotes').onclick = () => {
      const patch = { notes: $('#notes').value, nextDate: $('#nd').value || '' };
      Object.assign(r, patch, { updated: Date.now() });
      enqueue({ type: 'patch', id: r.id, patch, at: Date.now() });
      closeSheet(); render(); toast('Сохранено');
    };
    const ra = $('#reAnalyze');
    if (ra) ra.onclick = () => { closeSheet(); st.result = analyzeJob({ title: r.title, company: r.company, location: r.location, description: r.description, url: r.url, platform: r.platform }); location.hash = '#add'; render(); };
  }
  function closeSheet() { $('#sheet').hidden = true; $('#scrim').hidden = true; }

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg, action, fn) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
    t.hidden = false;
    if (action) t.querySelector('button').onclick = () => { t.hidden = true; fn(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, action ? 10000 : 2600);
  }

  // ---------- Router and events ----------
  const route = () => (location.hash.replace('#', '').split('=')[0] || 'add');
  function updateBadges() {
    const t = todayItems();
    $('#cntToday').textContent = (t.due.length + t.follow.length) || '';
    $('#cntList').textContent = '';
    setOnline(true);
  }
  // ---------- PIN screen ----------
  function viewLock() {
    const create = st.lock === 'create';
    const step2 = create && st.pin1;
    const title = create ? (step2 ? 'Повтори PIN' : 'Придумай PIN-код') : 'Введи PIN';
    const sub = create ? (step2 ? 'Ещё раз, чтобы не ошибиться.' : 'От 4 до 8 цифр. Им шифруются токен таблицы и заявки на этом телефоне.') : 'Job Tracker заблокирован.';
    const dots = Array.from({ length: Math.max(4, st.pin.length) }, (_, i) => `<i class="${i < st.pin.length ? 'on' : ''}"></i>`).join('');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    return `
      <div class="lock">
        <span class="logo big" aria-hidden="true">JT</span>
        <h1>${title}</h1>
        <p class="sub">${sub}</p>
        <div class="dots ${st.pinMsg ? 'shake' : ''}" aria-label="Введено цифр: ${st.pin.length}">${dots}</div>
        <p class="pin-msg" role="alert">${esc(st.pinMsg)}</p>
        <div class="keypad">${keys.map(k => k ? `<button data-key="${k}" aria-label="${k === '⌫' ? 'Стереть' : k}">${k}</button>` : '<span></span>').join('')}</div>
        <button class="btn primary block" id="pinGo" ${st.pin.length >= 4 ? '' : 'disabled'}>${create ? (step2 ? 'Сохранить PIN' : 'Дальше') : 'Открыть'}</button>
        ${!create ? '<button class="btn line block" id="pinForgot">Забыл PIN</button>' : ''}
      </div>`;
  }
  async function pinSubmit() {
    const pin = st.pin;
    if (!V.validPin(pin)) return;
    if (st.lock === 'create') {
      if (!st.pin1) { st.pin1 = pin; st.pin = ''; st.pinMsg = ''; return render(); }
      if (pin !== st.pin1) { st.pin1 = ''; st.pin = ''; st.pinMsg = 'PIN не совпал, попробуй снова'; return render(); }
      K = await V.newKey(pin);
      st.lock = null; st.pin = st.pin1 = ''; st.pinMsg = '';
      await save();
      toast('PIN сохранён');
      return afterUnlock();
    }
    st.pinMsg = 'Проверяю…'; render();
    try {
      const { data, k } = await V.open(pin, LS.get('vault', null));
      K = k; VAULT_KEYS.forEach(key => { if (data[key] !== undefined) st[key] = data[key]; });
      LS.set('pinFails', 0);
      st.lock = null; st.pin = ''; st.pinMsg = '';
      afterUnlock();
    } catch (e) {
      const fails = (LS.get('pinFails', 0) || 0) + 1;
      LS.set('pinFails', fails);
      st.pin = '';
      if (fails >= MAX_FAILS) { wipe(); st.lock = null; st.pinMsg = ''; location.hash = '#setup'; render(); toast('10 неверных PIN подряд: данные на телефоне стёрты. Подключи таблицу заново.'); return; }
      st.pinMsg = `Неверный PIN. Осталось попыток: ${MAX_FAILS - fails}`;
      render();
    }
  }
  function afterUnlock() {
    if (st.pendingCfg) { st.cfg = st.pendingCfg; st.pendingCfg = null; save(); }
    const sh = st.pendingShare; st.pendingShare = null;
    render();
    if (sh) { st.input = sh; location.hash = '#add'; render(); analyze(sh); }
    if (st.cfg) refresh(true);
  }
  function bindLock(v) {
    v.querySelectorAll('[data-key]').forEach(b => b.onclick = () => pinKey(b.dataset.key));
    const go = $('#pinGo', v); if (go) go.onclick = pinSubmit;
    const fg = $('#pinForgot', v);
    if (fg) fg.onclick = () => {
      if (fg.dataset.sure) { wipe(); st.lock = null; location.hash = '#setup'; render(); toast('Данные на телефоне стёрты. Подключи таблицу заново: заявки в Google Таблице на месте.'); return; }
      fg.dataset.sure = '1'; fg.textContent = 'Стереть данные на телефоне и подключить заново?';
    };
  }
  function pinKey(k) {
    if (k === '⌫') st.pin = st.pin.slice(0, -1);
    else if (/^\d$/.test(k) && st.pin.length < 8) st.pin += k;
    st.pinMsg = '';
    render();
  }

  function render() {
    const r = route();
    const v = $('#view');
    document.body.classList.toggle('locked', !!st.lock);
    if (st.lock) { v.innerHTML = viewLock(); bindLock(v); return; }
    v.innerHTML = r === 'list' ? viewList() : r === 'today' ? viewToday() : r === 'setup' ? viewSetup() : viewAdd();
    document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === r ? 'page' : 'false'));
    updateBadges();
    bind(v);
  }
  function bind(v) {
    v.querySelectorAll('[data-open]').forEach(b => b.onclick = e => { e.preventDefault(); openApp(b.dataset.open); });
    v.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => { const [id, s] = b.dataset.quick.split(':'); setStatus(id, s); });
    v.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { st.filter = b.dataset.filter; LS.set('filter', st.filter); render(); });
    v.querySelectorAll('[data-add]').forEach(b => b.onclick = () => addFromResult(b.dataset.add));
    v.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
      const a = st.result.answers[+b.dataset.copy].a;
      try { await navigator.clipboard.writeText(a); b.textContent = 'Готово'; } catch (e) { b.textContent = 'Не вышло'; }
      setTimeout(() => { b.textContent = 'Копировать'; }, 1500);
    });
    const inp = $('#jobInput', v);
    if (inp) {
      inp.oninput = () => { st.input = inp.value; LS.set('draft', st.input); };
      $('#go', v).onclick = () => analyze(inp.value);
      $('#paste', v).onclick = async () => {
        try { const t = await navigator.clipboard.readText(); inp.value = t; st.input = t; LS.set('draft', t); if (t.trim()) analyze(t); }
        catch (e) { inp.focus(); toast('Нажми и удерживай поле, чтобы вставить'); }
      };
      const cl = $('#clear', v); if (cl) cl.onclick = () => { st.result = null; st.input = ''; LS.set('draft', ''); render(); $('#jobInput').focus(); };
    }
    const q = $('#q', v);
    if (q) q.oninput = () => { st.q = q.value; const l = v.querySelector('.list'); l.innerHTML = filtered().slice(0, 200).map(rowHtml).join('') || '<div class="empty">Ничего не найдено</div>'; bind(l); };
    const rf = $('#refresh', v); if (rf) rf.onclick = e => { e.preventDefault(); refresh(); };
    const cs = $('#cfgSave', v);
    if (cs) cs.onclick = async () => {
      st.cfg = { url: $('#cfgUrl').value.trim(), token: $('#cfgToken').value.trim() };
      const msg = $('#cfgMsg');
      msg.textContent = 'Проверяю…';
      try { const d = await api('GET', { action: 'ping' }); if (K) save(); else { st.pendingCfg = st.cfg; st.lock = 'create'; } msg.innerHTML = `<span style="color:var(--ok)">Подключено: «${esc(d.name)}», строк: ${d.rows}${d.version < 13 ? '. Обнови Code.gs до версии 13, чтобы читать ссылки' : ''}.</span>`; if (st.lock) render(); else refresh(true); }
      catch (e) { msg.innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; }
    };
    const dc = $('#disconnect', v); if (dc) dc.onclick = () => { wipe(); render(); toast('Таблица отключена, данные на телефоне стёрты'); };
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
    history.replaceState(null, '', location.pathname + '#list');
    return true;
  }
  // 'Share' from a job app on Android lands here as ?title=&text=&url=
  function readShare() {
    const p = new URLSearchParams(location.search);
    if (!p.has('text') && !p.has('url') && !p.has('title')) return null;
    const parts = [p.get('url'), p.get('text')].filter(Boolean);
    history.replaceState(null, '', location.pathname + '#add');
    return parts.join('\n').trim() || p.get('title');
  }

  $('#openSetup').onclick = () => { location.hash = '#setup'; };
  $('#scrim').onclick = closeSheet;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  window.addEventListener('hashchange', () => { closeSheet(); render(); window.scrollTo(0, 0); });
  window.addEventListener('online', () => flush().then(() => refresh(true)));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (K && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) { hiddenAt = 0; return lockNow(); }
    if (!st.lock && Date.now() - st.syncedAt > 60e3) refresh(true);
  });

  const old = legacy();
  if (old) { VAULT_KEYS.forEach(k => { if (old[k] !== undefined) st[k] = old[k]; }); }
  readConnect();
  const shared = readShare();
  if (!V || !V.supported()) {
    // No WebCrypto (plain http): no PIN possible, the app still works but warns in Settings
    if (st.pendingCfg) { st.cfg = st.pendingCfg; st.pendingCfg = null; }
  } else if (LS.get('vault', null)) {
    st.lock = 'unlock'; st.pendingShare = shared;
    if (old) VAULT_KEYS.forEach(k => { try { localStorage.removeItem('jt.' + k); } catch (e) { /* ignore */ } });
  } else {
    // First open on this phone: choose a PIN before anything is shown or stored
    if (st.cfg && !st.pendingCfg) st.pendingCfg = st.cfg;
    st.lock = 'create'; st.pendingShare = shared;
  }
  render();
  if (!st.lock) {
    if (shared) { st.input = shared; render(); analyze(shared); }
    if (st.cfg) refresh(true);
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    // A new version takes over as soon as it is downloaded: reload once so it is used straight away
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
  }
  window.JT_App = { st, analyzeJob, readJob, setStatus, render, lockNow };
})();
