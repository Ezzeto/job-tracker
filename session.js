/* Job Tracker — application session: the queue of jobs to apply for from the PC, a pack prepared for each,
 * and one button that opens them one by one with the autofill ready. Also your details for forms and the AI key.
 * The details and the key stay in chrome.storage.local: they are never synced, exported or sent to the sheet. */
(async function () {
  'use strict';
  const S = window.JT_Store, E = window.JT_Extract, PK = window.JT_Packs, LLM = window.JT_LLM;
  const $ = (s, el) => (el || document).querySelector(s), $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const get = async k => (await chrome.storage.local.get(k))[k];
  const set = obj => chrome.storage.local.set(obj);
  const st = { open: '', busy: {}, msg: '' };

  async function sheet(method, params, body) {
    const cfg = await get('sheetCfg');
    if (!cfg || !cfg.url) throw new Error('Google Таблица не подключена (Skills & settings → Google Sheet)');
    if (method === 'GET') { const u = new URL(cfg.url); u.searchParams.set('token', cfg.token); Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v)); const r = await fetch(u); const d = await r.json(); if (!d.ok) throw new Error(d.error || 'Ошибка скрипта'); return d; }
    const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: cfg.token, apps: [], patches: [], deletes: [], ...body }) });
    return r.json();
  }
  async function items() { return (await get('sessionItems')) || []; }
  async function packs() { return (await get('packs')) || {}; }

  // Jobs saved "for later" on the phone come through the sheet
  async function pullPhone() {
    try {
      const d = await sheet('GET', { action: 'later' });
      const list = await items();
      const have = new Set(list.map(x => x.key));
      (d.later || []).forEach(x => { const key = PK.keyOf(x); if (!have.has(key)) { list.push({ key, id: x.id, title: x.title, company: x.company, url: x.url, location: x.location, platform: x.platform, description: x.description, src: 'phone', at: x.at }); have.add(key); } });
      await set({ sessionItems: list });
      return (d.later || []).length;
    } catch (e) { st.msg = String(e.message || e); return 0; }
  }
  async function addJob(raw) {
    const text = String(raw || '').trim(), m = text.match(/https?:\/\/\S+/);
    let job;
    if (m && text.replace(m[0], '').trim().length < 40) {
      const d = await sheet('GET', { action: 'fetchJob', url: m[0] });
      const doc = new DOMParser().parseFromString(d.html || '', 'text/html');
      job = E.parse(doc, doc, E.siteFor(new URL(d.url || m[0]).hostname), d.url || m[0], { useLd: true });
      if (!job.description || job.description.length < 200) throw new Error('Сайт не отдал текст вакансии: вставь ссылку и текст вместе');
    } else {
      if (text.length < 150) throw new Error('Вставь ссылку или полный текст вакансии');
      const lines = text.split('\n').map(x => x.trim()).filter(Boolean);
      job = { title: lines[0].slice(0, 120), company: '', description: text, url: m ? m[0] : '', platform: 'Other' };
    }
    const list = await items();
    const key = PK.keyOf(job);
    if (!list.some(x => x.key === key)) list.push({ key, ...job, src: 'manual', at: new Date().toISOString().slice(0, 10) });
    await set({ sessionItems: list });
    return key;
  }
  async function prepare(key) {
    const list = await items(), it = list.find(x => x.key === key);
    if (!it) return;
    st.busy[key] = 'начинаю'; render();
    try {
      const [profile, cvs, templates, me, llm] = await Promise.all([S.getProfile(), get('cvs'), get('templates'), get('autofillMe'), get('llmCfg')]);
      const cache = (await get('llmCache')) || {};
      const cfg = llm && llm.key ? { ...llm, cache: { get: k => cache[k], set: async (k, v) => { cache[k] = v; const ks = Object.keys(cache); if (ks.length > 200) ks.slice(0, ks.length - 200).forEach(x => delete cache[x]); await set({ llmCache: cache }); } } } : null;
      const pack = await PK.build(it, { profile, cvText: cvs && cvs.job && cvs.job.text, templates, me: me || {}, llm: cfg, onStep: t => { st.busy[key] = t; renderBusy(key); } });
      const all = await packs(); all[pack.key] = pack; await set({ packs: all });
    } catch (e) { const all = await packs(); all[key] = { key, status: 'error', error: String(e.message || e), job: it }; await set({ packs: all }); }
    delete st.busy[key]; render();
  }
  async function prepareAll() { const all = await packs(); for (const it of await items()) { if (!all[it.key] || all[it.key].status === 'error') await prepare(it.key); } }
  async function start() {
    const all = await packs(), list = (await items()).filter(x => all[x.key] && all[x.key].status === 'ready' && !all[x.key].done && all[x.key].job.url);
    if (!list.length) { st.msg = 'Нет готовых пакетов со ссылкой на вакансию.'; return render(); }
    const tab = await chrome.tabs.create({ url: list[0].url || all[list[0].key].job.url });
    await set({ session: { queue: list.map(x => x.key), index: 0, current: list[0].key, at: Date.now(), itemAt: Date.now(), startedAt: Date.now(), tabId: tab.id } });
  }
  function b64Blob(b64, type) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); }

  // ---------- Views ----------
  async function viewQueue() {
    const [list, all, cvs, me, llm, session] = await Promise.all([items(), packs(), get('cvs'), get('autofillMe'), get('llmCfg'), get('session')]);
    const ready = list.filter(x => all[x.key] && all[x.key].status === 'ready' && !all[x.key].done).length;
    const warn = [!(cvs && cvs.job && cvs.job.text) && 'нет CV — загрузи его на странице <a href="dashboard.html#cv">CV & ATS</a>, иначе пакет будет без подогнанного CV', !(me && me.email) && 'не заполнены <a href="#me">данные для анкет</a> (имя, email, телефон)', !(llm && llm.key) && 'нет ключа AI — письмо будет из шаблона, ответов на вопросы не будет (<a href="#me">добавить</a>)'].filter(Boolean);
    const done = location.hash === '#done' && session && session.finished;
    return `${done ? `<div class="note ok">Сессия завершена: ${session.queue.length} ${session.queue.length === 1 ? 'вакансия' : 'вакансий'} за ${Math.round((Date.parse(session.finished) - session.startedAt) / 60000)} мин. Отклики записаны в трекер.</div>` : ''}
      ${warn.length ? `<div class="note">${warn.map(w => '• ' + w).join('<br>')}</div>` : ''}
      ${st.msg ? `<div class="note info">${esc(st.msg)}</div>` : ''}
      <div class="panel"><div class="row-between"><h2>Очередь · ${list.length}</h2><div class="btns"><button class="btn" id="pull">Обновить из телефона</button><button class="btn" id="prepAll">Подготовить все</button><button class="btn primary big" id="start" ${ready ? '' : 'disabled'}>Начать сессию · ${ready}</button></div></div>
        <p class="hint">Вакансии, сохранённые на телефоне кнопкой «На потом», появляются здесь сами. Можно добавить и вручную.</p>
        <div class="row-between" style="align-items:flex-end;gap:8px"><textarea id="addText" placeholder="Ссылка на вакансию или её текст" style="flex:1;min-height:44px"></textarea><button class="btn" id="add">Добавить</button></div>
        <div style="margin-top:10px">${list.map(it => itemHtml(it, all[it.key])).join('') || '<p class="hint" style="margin:14px 0 0">Очередь пуста. На телефоне: «Разбор» → «На потом».</p>'}</div></div>`;
  }
  function itemHtml(it, p) {
    const busy = st.busy[it.key];
    const tag = busy ? `<span class="tag">готовлю: ${esc(busy)}</span>` : !p ? '<span class="tag">без пакета</span>' : p.status === 'error' ? '<span class="tag bad">ошибка</span>' : p.done ? '<span class="tag ok">откликнулся</span>' : '<span class="tag ok">пакет готов</span>';
    return `<div class="item" data-key="${esc(it.key)}"><div><div class="t">${esc(it.title || 'Без названия')}</div><div class="s">${esc([it.company, it.location, it.src === 'phone' ? 'с телефона' : ''].filter(Boolean).join(' · '))}</div>
        <div style="margin-top:6px">${p && p.market ? `<span class="tag ${p.market}">рынок ${p.market === 'A' ? 'А' : 'Б'}</span>` : ''}${p && p.fit != null ? `<span class="tag">Fit ${p.fit}%</span>` : ''}${tag}${p && p.errors && p.errors.length ? `<span class="tag bad" title="${esc(p.errors.join('\n'))}">${p.errors.length} предупр.</span>` : ''}</div></div>
      <div class="btns">${p && p.status === 'ready' ? `<button class="btn small" data-open="${esc(it.key)}">${st.open === it.key ? 'Скрыть' : 'Пакет'}</button>` : ''}<button class="btn small" data-prep="${esc(it.key)}" ${busy ? 'disabled' : ''}>${p ? 'Пересобрать' : 'Подготовить'}</button>${it.url ? `<a class="btn small" href="${esc(it.url)}" target="_blank">Вакансия</a>` : ''}<button class="btn small danger" data-del="${esc(it.key)}">Убрать</button></div>
      ${st.open === it.key && p ? packHtml(p) : ''}</div>`;
  }
  function packHtml(p) {
    return `<div class="pack">
      ${p.cv ? `<div class="row-between"><span>CV: <b>${esc(p.cv.name)}</b>${p.cvReport ? ` · совпадение ${p.cvReport.before}% → ${p.cvReport.after}%` : ''}</span><button class="btn small" data-cv="${esc(p.key)}">Скачать</button></div>` : '<span class="hint">CV не подготовлено (нет CV в трекере).</span>'}
      ${p.employer ? `<span class="hint">Похоже, настоящий работодатель — <b>${esc(p.employer)}</b>.</span>` : ''}
      <label style="display:flex;flex-direction:column;gap:4px"><b>Письмо${p.letterAi ? ' (AI — проверь)' : ' (из шаблона — допиши [скобки])'}</b><textarea data-letter="${esc(p.key)}">${esc(p.letter || '')}</textarea></label>
      ${p.letterWarn && p.letterWarn.length ? `<div class="note" style="margin:0">Проверь: в письме есть ${esc(p.letterWarn.join(', '))} — этого нет в CV.</div>` : ''}
      <div><b>Ответы для анкеты</b>${(p.answers || []).map((a, i) => `<div class="qa"><b>${esc(a.q)}${a.src === 'ai' ? ' · AI' : ''}</b><textarea data-ans="${esc(p.key)}:${i}" style="min-height:${a.a.length > 120 ? 110 : 44}px">${esc(a.a)}</textarea></div>`).join('')}</div>
      <label style="display:flex;flex-direction:column;gap:4px;max-width:360px"><b>Зарплатные ожидания</b><input type="text" data-salary="${esc(p.key)}" value="${esc(p.salary || '')}"></label>
    </div>`;
  }
  async function viewMe() {
    const me = (await get('autofillMe')) || {}, llm = (await get('llmCfg')) || {};
    const f = (k, label, ph, type) => `<label>${label}<input type="${type || 'text'}" data-me="${k}" value="${esc(me[k] || '')}" placeholder="${esc(ph || '')}"></label>`;
    return `<div class="panel"><h2>Данные для анкет</h2><p class="hint">Хранятся только в этом браузере: не синхронизируются с таблицей и не попадают в экспорт.</p>
      <div class="grid">${f('firstName', 'Имя', 'Oleh')}${f('lastName', 'Фамилия', '')}${f('email', 'Email для откликов', 'oleh.poratui@gmail.com', 'email')}${f('phone', 'Телефон', '+44 …', 'tel')}${f('address1', 'Адрес (улица, дом)', '')}${f('town', 'Город', "Bishop's Stortford")}${f('postcode', 'Индекс', 'CM23 …')}${f('linkedin', 'LinkedIn', 'https://www.linkedin.com/in/…')}${f('website', 'GitHub или портфолио', 'https://github.com/…')}${f('notice', 'Когда можешь выйти', 'Immediately')}${f('salaryB', 'Зарплата для рынка Б', '£12.50 an hour, pro rata')}${f('salaryA', 'Зарплата для рынка А', '£30,000–£35,000')}${f('source', 'Как узнал о вакансии (по умолчанию)', 'Job board')}</div>
      <p class="hint" style="margin-top:10px">Право на работу — «Yes», спонсорство — «No», водительские права — из Skills & settings. Вопросы о поле, этничности, инвалидности — «Prefer not to say». Галочки согласия ты ставишь сам.</p>
      <button class="btn primary" id="saveMe">Сохранить</button> <span id="meMsg" class="hint"></span></div>
      <div class="panel"><h2>AI</h2><p class="hint">Один бесплатный ключ: Groq (console.groq.com/keys), Gemini (aistudio.google.com/apikey) или OpenRouter (openrouter.ai/keys). В AI уходят текст вакансии и твоё CV без контактов.</p>
        <div class="grid"><label>Ключ<input type="password" id="llmKey" value="${esc(llm.key || '')}" placeholder="gsk_… / AIza… / sk-or-…"></label><label>Модель (можно не трогать)<input type="text" id="llmModel" value="${esc(llm.model || '')}" placeholder="${esc(llm.key ? LLM.modelFor(llm.key, '') : 'выберется сама')}"></label></div>
        <div class="btns" style="margin-top:10px"><button class="btn primary" id="saveLlm">Сохранить</button><button class="btn" id="testLlm">Проверить</button><span id="llmMsg" class="hint"></span></div></div>`;
  }
  async function render() {
    const tab = location.hash === '#me' ? 'me' : 'queue';
    $$('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
    $('#view').innerHTML = tab === 'me' ? await viewMe() : await viewQueue();
    bind();
  }
  function renderBusy(key) { const el = $(`.item[data-key="${CSS.escape(key)}"] .tag:last-child`); if (el) el.textContent = 'готовлю: ' + st.busy[key]; }
  function bind() {
    const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
    on('#pull', async () => { const n = await pullPhone(); st.msg = n ? '' : st.msg || 'На телефоне пока ничего не сохранено «На потом».'; render(); });
    on('#prepAll', prepareAll);
    on('#start', start);
    on('#add', async () => { try { const k = await addJob($('#addText').value); st.msg = ''; render(); prepare(k); } catch (e) { st.msg = String(e.message || e); render(); } });
    $$('[data-prep]').forEach(b => b.onclick = () => prepare(b.dataset.prep));
    $$('[data-open]').forEach(b => b.onclick = () => { st.open = st.open === b.dataset.open ? '' : b.dataset.open; render(); });
    $$('[data-del]').forEach(b => b.onclick = async () => { await set({ sessionItems: (await items()).filter(x => x.key !== b.dataset.del) }); render(); });
    $$('[data-cv]').forEach(b => b.onclick = async () => { const p = (await packs())[b.dataset.cv]; const u = URL.createObjectURL(b64Blob(p.cv.b64, p.cv.type)); const a = document.createElement('a'); a.href = u; a.download = p.cv.name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); });
    const edit = async (key, fn) => { const all = await packs(); if (all[key]) { fn(all[key]); await set({ packs: all }); } };
    $$('[data-letter]').forEach(t => t.onchange = () => edit(t.dataset.letter, p => { p.letter = t.value; }));
    $$('[data-ans]').forEach(t => t.onchange = () => { const [k, i] = t.dataset.ans.split(':'); edit(k, p => { p.answers[+i].a = t.value; }); });
    $$('[data-salary]').forEach(t => t.onchange = () => edit(t.dataset.salary, p => { p.salary = t.value; }));
    on('#saveMe', async () => { const me = {}; $$('[data-me]').forEach(i => { me[i.dataset.me] = i.value.trim(); }); await set({ autofillMe: me }); $('#meMsg').textContent = 'Сохранено'; });
    on('#saveLlm', async () => { await set({ llmCfg: { key: $('#llmKey').value.trim(), model: $('#llmModel').value.trim() } }); $('#llmMsg').textContent = 'Сохранено'; });
    on('#testLlm', async () => { const cfg = { key: $('#llmKey').value.trim(), model: $('#llmModel').value.trim() }; await set({ llmCfg: cfg }); $('#llmMsg').textContent = 'Проверяю…'; try { const t = await LLM.chat(cfg, [{ role: 'user', content: 'Reply with the single word: ready' }], { cacheKey: false }); $('#llmMsg').textContent = 'Работает: ' + t.slice(0, 30); } catch (e) { $('#llmMsg').textContent = e.message; } });
  }
  window.addEventListener('hashchange', render);
  chrome.storage.onChanged.addListener(ch => { if ((ch.packs || ch.session) && !Object.keys(st.busy).length && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') render(); });
  await render();
  // New jobs from the phone, and packs for them, without a click
  const n = await pullPhone();
  if (n) render();
  prepareAll();
})();
