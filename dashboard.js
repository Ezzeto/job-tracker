/* Job Tracker — дашборд */
(async function () {
  'use strict';
  const A = JT_Analyzer, S = JT_Store;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = d => d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const money = n => (n == null || isNaN(n)) ? '—' : '£' + Math.round(n).toLocaleString('en-GB');
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  const daysSince = d => Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
  const chanceClass = n => n >= 70 ? 'c-good' : n >= 50 ? 'c-mid' : 'c-bad';
  const PER = { year: '/год', hour: '/час', day: '/день', week: '/нед', month: '/мес' };
  const fmtSal = a => {
    const x = a.salary;
    if (!x || !x.min) return a.salaryText ? esc(a.salaryText) : '<span style="color:#5a6b7d">не указана</span>';
    const f = n => n >= 1000 ? '£' + (Math.round(n / 100) / 10) + 'k' : '£' + n;
    return `<span style="white-space:nowrap">${f(x.min)}${x.max && x.max !== x.min ? '–' + f(x.max).slice(1) : ''}${PER[x.period] || ''}</span>`;
  };
  const toDateInput = iso => iso ? new Date(iso).toISOString().slice(0, 10) : '';

  let apps = await S.getApps();
  let profile = await S.getProfile();
  let current = null; // карточка открыта

  chrome.storage.onChanged.addListener(async ch => {
    if (ch.apps) { apps = await S.getApps(); renderAll(); }
    if (ch.profile) { profile = await S.getProfile(); }
  });

  // ---------- Навигация ----------
  function route() {
    const h = location.hash.slice(1) || 'overview';
    let view = h.split('=')[0];
    if (view === 'app') view = 'apps';
    if (!['overview', 'apps', 'offers', 'settings', 'data'].includes(view)) view = 'overview';
    $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + view; });
    $$('.side a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
    if (h.startsWith('app=')) { const a = apps.find(x => x.id === h.slice(4)); if (a) openDrawer(a); }
    renderView(view);
  }
  window.addEventListener('hashchange', route);
  $$('[data-new]').forEach(b => b.onclick = () => openDrawer(null));

  function renderAll() {
    $('#navCount').textContent = apps.length || '';
    const offers = apps.filter(a => S.everReached(a, A.OFFER)).length;
    $('#navOffers').textContent = offers || '';
    const v = ($$('.side a.active')[0] || {}).dataset;
    renderView(v ? v.view : 'overview');
  }
  function renderView(v) {
    $('#navCount').textContent = apps.length || '';
    $('#navOffers').textContent = apps.filter(a => S.everReached(a, A.OFFER)).length || '';
    ({ overview: renderOverview, apps: renderApps, offers: renderOffers, settings: renderSettings, data: () => {} })[v]();
  }

  // ---------- ОБЗОР ----------
  function renderOverview() {
    const total = apps.length;
    const responded = apps.filter(a => S.everReached(a, A.RESPONDED)).length;
    const interviews = apps.filter(a => S.everReached(a, A.INTERVIEW)).length;
    const offers = apps.filter(a => S.everReached(a, A.OFFER)).length;
    const stages = [
      { lbl: 'Подано', n: total, conv: total ? `за всё время` : 'нажми «Apply» на сайте', c: '#5a6b7d' },
      { lbl: 'Ответили', n: responded, conv: `${pct(responded, total)} от поданных`, c: '#1f7fb0' },
      { lbl: 'Интервью', n: interviews, conv: `${pct(interviews, responded)} от ответивших`, c: '#7a4fc0' },
      { lbl: 'Офферы', n: offers, conv: `${pct(offers, interviews)} от интервью`, c: '#23905a' },
    ];
    $('#pipeline').innerHTML = stages.map(s => `
      <div class="stage"><div class="lbl">${s.lbl}</div><div class="num">${s.n}</div>
      <div class="bar"><i style="width:${total ? Math.max(s.n ? 3 : 0, s.n / total * 100) : 0}%;background:${s.c}"></i></div>
      <div class="conv">${s.conv}</div></div>`).join('');

    const rejected = apps.filter(a => a.status === 'rejected').length;
    const noresp = apps.filter(a => a.status === 'noresponse').length;
    const active = apps.filter(a => ['applied', 'screening', 'test', 'interview1', 'interview2', 'interview3', 'offer'].includes(a.status)).length;
    const week = apps.filter(a => daysSince(a.appliedAt) < 7).length;
    const withChance = apps.filter(a => a.chance);
    const avg = withChance.length ? Math.round(withChance.reduce((s, a) => s + a.chance.score, 0) / withChance.length) : null;
    $('#kpis').innerHTML = `<span>В процессе: <b>${active}</b></span><span>Отказы: <b>${rejected}</b></span><span>Без ответа: <b>${noresp}</b></span>
      <span>За 7 дней: <b>${week}</b></span><span>Средние шансы: <b>${avg == null ? '—' : avg + '%'}</b></span>`;

    renderWeekly();
    renderPlatforms();
    renderToolsTop();
    renderAttention();
  }

  function renderWeekly() {
    const weeks = 10, now = new Date();
    const monday = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
    const start = monday(now);
    const buckets = [];
    for (let i = weeks - 1; i >= 0; i--) { const s = new Date(start); s.setDate(s.getDate() - i * 7); buckets.push({ s, n: 0, r: 0 }); }
    apps.forEach(a => {
      const m = monday(a.appliedAt).getTime();
      const b = buckets.find(x => x.s.getTime() === m);
      if (b) { b.n++; if (S.everReached(a, A.RESPONDED)) b.r++; }
    });
    const max = Math.ceil(Math.max(4, ...buckets.map(b => b.n)) / 2) * 2;
    const W = 560, H = 200, pad = 26, bw = (W - pad) / weeks;
    let svg = `<svg viewBox="0 0 ${W} ${H + 24}" width="100%" role="img" aria-label="Заявки по неделям">`;
    [0, .5, 1].forEach(f => { const y = H - f * (H - 10); svg += `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="#e3e9ef"/><text x="0" y="${y + 4}" font-size="11" fill="#5a6b7d">${Math.round(max * f)}</text>`; });
    buckets.forEach((b, i) => {
      const x = pad + i * bw + 6, w = bw - 12;
      const h = b.n / max * (H - 10), hr = b.r / max * (H - 10);
      svg += `<rect x="${x}" y="${H - h}" width="${w}" height="${h}" rx="3" fill="#b9d3e8"><title>${b.n} подано</title></rect>`;
      svg += `<rect x="${x}" y="${H - hr}" width="${w}" height="${hr}" rx="3" fill="#1f6fa8"><title>${b.r} с ответом</title></rect>`;
      if (b.n) svg += `<text x="${x + w / 2}" y="${H - h - 5}" font-size="11" text-anchor="middle" fill="#1c2733">${b.n}</text>`;
      svg += `<text x="${x + w / 2}" y="${H + 16}" font-size="10.5" text-anchor="middle" fill="#5a6b7d">${b.s.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</text>`;
    });
    svg += '</svg>';
    $('#weekly').innerHTML = svg + `<div class="legend"><span style="--c:#b9d3e8">Подано</span><span style="--c:#1f6fa8">Получили ответ</span></div>`;
  }

  function renderPlatforms() {
    const map = {};
    apps.forEach(a => { const p = a.platform || 'Другое'; map[p] = map[p] || { n: 0, r: 0 }; map[p].n++; if (S.everReached(a, A.RESPONDED)) map[p].r++; });
    const rows = Object.entries(map).sort((a, b) => b[1].n - a[1].n);
    if (!rows.length) { $('#platforms').innerHTML = '<p class="empty">Здесь появится, какие сайты чаще дают ответ.</p>'; return; }
    const max = rows[0][1].n;
    $('#platforms').innerHTML = rows.map(([p, v]) => `
      <div class="hbar"><span class="name" title="${esc(p)}">${esc(p)}</span>
      <span class="track"><i style="width:${v.r / max * 100}%;background:#1f6fa8"></i><i style="width:${(v.n - v.r) / max * 100}%;background:#b9d3e8"></i></span>
      <span class="v">${v.n} · ${pct(v.r, v.n)}</span></div>`).join('') +
      `<div class="legend"><span style="--c:#1f6fa8">С ответом</span><span style="--c:#b9d3e8">Без ответа</span><span style="--c:transparent">справа: всего · % ответа</span></div>`;
  }

  function renderToolsTop() {
    const cnt = {};
    apps.forEach(a => (a.tools || []).forEach(t => { cnt[t] = (cnt[t] || 0) + 1; }));
    const rows = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 12);
    if (!rows.length) { $('#toolsTop').innerHTML = '<p class="empty">После первых заявок здесь будет список того, что стоит подтянуть к интервью.</p>'; return; }
    const max = rows[0][1];
    const col = t => ({ strong: '#5fb487', basic: '#e0ae4a', none: '#d9776c' })[profile.skills[t] || 'none'];
    const miss = Object.entries(cnt).filter(([t]) => (profile.skills[t] || 'none') === 'none').sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
    $('#toolsTop').innerHTML = rows.map(([t, n]) => `
      <div class="hbar"><span class="name" title="${esc(t)}">${esc(t)}</span><span class="track"><i style="width:${n / max * 100}%;background:${col(t)}"></i></span><span class="v">${n} ${[2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'раза' : 'раз'}</span></div>`).join('') +
      (miss.length ? `<p class="hint" style="margin:10px 0 0">Подтянуть в первую очередь: <b>${miss.map(esc).join(', ')}</b></p>` : '');
  }

  function renderAttention() {
    const items = [];
    apps.forEach(a => {
      if (a.nextDate) {
        const d = Math.ceil((new Date(a.nextDate) - Date.now()) / 864e5);
        if (d >= -1 && d <= 7) items.push({ a, prio: 0, text: d <= 0 ? 'Следующий шаг сегодня' : `Следующий шаг через ${d} дн. (${fmtDate(a.nextDate)})` });
      }
      if (a.status === 'applied') {
        const d = daysSince(a.appliedAt);
        const fu = a.followUps || [];
        const dl = fu.length ? daysSince(fu[fu.length - 1].at) : null;
        const cnt = (a.contacts || []).filter(c => c.type !== 'name').length;
        const ctext = cnt ? ` · контактов: ${cnt}` : '';
        if ((fu.length >= 2 && dl >= 10) || d >= 35) items.push({ a, prio: 2, text: `${d} дн. без ответа${fu.length ? `, follow-up: ${fu.length}` : ''}`, action: 'noresponse' });
        else if (fu.length === 0 && d >= 7) items.push({ a, prio: 1, text: `${d} дн. без ответа — пора follow-up${ctext}`, fu: true });
        else if (fu.length === 1 && dl >= 7) items.push({ a, prio: 1, text: `Follow-up был ${dl} дн. назад — можно второй${ctext}`, fu: true });
      }
      if (a.status === 'offer' && a.offer && a.offer.deadline) items.push({ a, prio: 0, text: `Ответить на оффер до ${fmtDate(a.offer.deadline)}` });
    });
    items.sort((x, y) => x.prio - y.prio);
    if (!items.length) { $('#attention').innerHTML = '<p class="empty">Всё под контролем. Здесь появятся напоминания о follow-up, интервью и сроках офферов.</p>'; return; }
    $('#attention').innerHTML = items.slice(0, 8).map((it, i) => `
      <div class="att"><div class="what"><b>${esc(it.a.title || 'Без названия')}${it.a.company ? ' — ' + esc(it.a.company) : ''}</b><span>${esc(it.text)}</span></div>
      <div class="btns">${it.action ? `<button class="btn small" data-nr="${it.a.id}">Отметить «Нет ответа»</button>` : ''}${it.fu ? `<button class="btn small primary" data-fu="${it.a.id}">Follow-up</button>` : ''}<button class="btn small" data-open="${it.a.id}">Открыть</button></div></div>`).join('');
    $$('#attention [data-open]').forEach(b => b.onclick = () => openDrawer(apps.find(a => a.id === b.dataset.open)));
    $$('#attention [data-fu]').forEach(b => b.onclick = () => openDrawer(apps.find(a => a.id === b.dataset.fu), { focusFollowUp: true }));
    $$('#attention [data-nr]').forEach(b => b.onclick = async () => { await S.updateApp(b.dataset.nr, { status: 'noresponse' }); });
  }

  // ---------- ЗАЯВКИ ----------
  function fillFilters() {
    const keep = id => $(id).value;
    const st = keep('#fStatus'), pl = keep('#fPlatform'), ca = keep('#fCategory');
    $('#fStatus').innerHTML = '<option value="">Все статусы</option>' + A.STATUSES.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
    const plats = [...new Set(apps.map(a => a.platform).filter(Boolean))].sort();
    $('#fPlatform').innerHTML = '<option value="">Все платформы</option>' + plats.map(p => `<option>${esc(p)}</option>`).join('');
    const cats = [...new Set(apps.map(a => a.category).filter(Boolean))].sort();
    $('#fCategory').innerHTML = '<option value="">Все направления</option>' + cats.map(p => `<option>${esc(p)}</option>`).join('');
    $('#fStatus').value = st; $('#fPlatform').value = pl; $('#fCategory').value = ca;
  }
  ['#fSearch', '#fStatus', '#fPlatform', '#fCategory', '#fSort'].forEach(id => $(id).addEventListener('input', renderAppsRows));

  function renderApps() { fillFilters(); renderAppsRows(); }

  function renderAppsRows() {
    const qs = $('#fSearch').value.trim().toLowerCase();
    const st = $('#fStatus').value, pl = $('#fPlatform').value, ca = $('#fCategory').value, sort = $('#fSort').value;
    let list = apps.filter(a =>
      (!st || a.status === st) && (!pl || a.platform === pl) && (!ca || a.category === ca) &&
      (!qs || [a.title, a.company, a.location, a.notes, a.ticket].join(' ').toLowerCase().includes(qs)));
    if (sort === 'chance') list.sort((x, y) => ((y.chance || {}).score || 0) - ((x.chance || {}).score || 0));
    else if (sort === 'salary') list.sort((x, y) => ((y.salary || {}).annualMax || 0) - ((x.salary || {}).annualMax || 0));
    else list.sort((x, y) => new Date(y.appliedAt) - new Date(x.appliedAt));

    const empty = $('#appsEmpty');
    empty.hidden = list.length > 0;
    empty.textContent = apps.length ? 'Ничего не найдено по этим фильтрам.' : 'Заявок пока нет. Открой вакансию на LinkedIn, Indeed, Reed, Totaljobs или CV-Library и нажми «Apply» — она появится здесь. Или добавь вручную кнопкой «Новая заявка».';
    $('.table-wrap').hidden = !list.length;

    const stOpts = cur => A.STATUSES.map(s => `<option value="${s.id}" ${s.id === cur ? 'selected' : ''}>${esc(s.label)}</option>`).join('');
    const SHORT_CAT = { 'IT Help Desk / Service Desk': 'Service Desk', 'IT Technician / Field Support': 'IT Technician', 'Systems / Infrastructure': 'Infrastructure', 'Software Developer': 'Developer', 'Data / Analyst': 'Data', 'AI / Machine Learning': 'AI / ML', 'Cloud / DevOps': 'Cloud / DevOps' };
    $('#appsBody').innerHTML = list.map(a => `
      <tr data-id="${a.id}">
        <td><span class="ticket">${esc(a.ticket)}</span></td>
        <td>${a.chance ? `<span class="chance ${chanceClass(a.chance.score)}">${a.chance.score}%</span>` : '—'}</td>
        <td class="job"><b title="${esc(a.title)}">${esc(a.title || 'Без названия')}</b><span title="${esc([a.company, a.location].filter(Boolean).join(' · '))}">${esc([a.company, a.location].filter(Boolean).join(' · '))}</span></td>
        <td><select class="st-select" data-st="${a.id}" aria-label="Статус" style="background-image:radial-gradient(circle,${A.statusColor(a.status)} 60%,transparent 62%)">${stOpts(a.status)}</select></td>
        <td class="nowrap">${fmtDate(a.appliedAt)}</td>
        <td>${fmtSal(a)}</td>
        <td class="c-plat">${esc(a.platform || '—')}</td>
        <td class="c-type"><div class="tags">${(a.workTypes || []).slice(0, 2).map(w => `<span class="tag">${esc(w)}</span>`).join('') || '—'}${(a.workTypes || []).length > 2 ? `<span class="tag" title="${esc(a.workTypes.slice(2).join(', '))}">+${a.workTypes.length - 2}</span>` : ''}</div></td>
        <td class="c-cat nowrap">${esc(SHORT_CAT[a.category] || a.category || '—')}</td>
      </tr>`).join('');
    $$('#appsBody tr').forEach(tr => tr.onclick = e => { if (e.target.closest('select')) return; openDrawer(apps.find(a => a.id === tr.dataset.id)); });
    $$('#appsBody .st-select').forEach(s => { s.onclick = e => e.stopPropagation(); s.onchange = () => S.updateApp(s.dataset.st, { status: s.value }); });
  }

  // ---------- КАРТОЧКА ----------
  function ring(score) {
    const r = 36, c = 2 * Math.PI * r, col = score >= 70 ? '#23905a' : score >= 50 ? '#b47a12' : '#c0463b';
    return `<svg class="score-ring" viewBox="0 0 84 84" role="img" aria-label="Шансы ${score}%"><circle cx="42" cy="42" r="${r}" fill="none" stroke="#e3e9ef" stroke-width="8"/>
      <circle cx="42" cy="42" r="${r}" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c * score / 100} ${c}" transform="rotate(-90 42 42)"/>
      <text x="42" y="48" text-anchor="middle" font-size="19" font-weight="700" fill="${col}">${score}%</text></svg>`;
  }

  function analysisHtml(a) {
    if (!a.chance) return '<p class="empty">Вставь описание вакансии ниже и нажми «Пересчитать анализ».</p>';
    const c = a.chance;
    return `<div class="score-card">${ring(c.score)}<div style="flex:1"><b>Шансы: ${esc(c.label)}</b>
      <ul class="reasons">${c.reasons.map(r => `<li><span>${esc(r.text)}</span><span class="d" style="color:${r.delta == null ? '#5a6b7d' : r.delta > 0 ? '#23905a' : r.delta < 0 ? '#c0463b' : '#5a6b7d'}">${r.delta == null ? 'база' : r.delta > 0 ? '+' + r.delta : r.delta === 0 ? 'совет' : r.delta}</span></li>`).join('')}</ul></div></div>
      <div class="tools">${c.matched.map(t => `<span class="t s">${esc(t)}</span>`).join('')}${c.basic.map(t => `<span class="t b">${esc(t)}</span>`).join('')}${c.missing.map(t => `<span class="t m">${esc(t)}</span>`).join('')}</div>
      ${c.missing.length ? `<p class="hint" style="margin:8px 0 0">Подготовиться к интервью: ${c.missing.map(esc).join(', ')}.</p>` : ''}`;
  }

  function benefitsHtml(a) {
    return (a.benefits || []).length ? `<ul class="details">${a.benefits.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="empty">В описании не найдено. Можно дописать в заметки.</p>';
  }
  // ---------- FOLLOW-UP ----------
  const TYPE_ICON = { email: '✉', phone: '☎', linkedin: 'in', name: '👤' };
  function renderFollowUp(a) {
    const F = globalThis.JT_Follow;
    const box = $('#fuPanel');
    if (!box || !F) return;
    const contacts = a.contacts || [];
    const fu = a.followUps || [];
    const agency = F.isAgency(a);
    let channel = box.dataset.channel || (contacts.some(c => c.type === 'email') ? 'email' : contacts.some(c => c.type === 'linkedin') ? 'linkedin' : agency && contacts.some(c => c.type === 'phone') ? 'call' : 'email');
    const forChannel = ch => contacts.filter(c => ch === 'email' ? c.type === 'email' : ch === 'linkedin' ? c.type === 'linkedin' : ch === 'call' ? c.type === 'phone' : false);
    const options = forChannel(channel);
    const sel = options[+box.dataset.to || 0] || options[0] || contacts.find(c => c.name) || null;
    const msg = F.build(a, channel, sel, profile);
    box.innerHTML = `
      <div class="row-between"><h2>Follow-up</h2><span class="hint" style="margin:0">${agency ? 'Агентство' : 'Работодатель'} · отправлено: ${fu.length}${fu.length ? `, последний ${fmtDate(fu[fu.length - 1].at)}` : ''}</span></div>
      <div class="fu-contacts">${contacts.length ? contacts.map((c, i) => `<span class="fu-c" title="${esc(c.source || '')}"><b>${TYPE_ICON[c.type] || '•'}</b> ${esc(c.name && c.type !== 'name' ? c.name + ' · ' : '')}${esc(c.type === 'linkedin' ? 'LinkedIn' : c.value)}<button data-rm="${i}" aria-label="Удалить контакт">×</button></span>`).join('') : '<p class="empty" style="margin:0">Контактов в вакансии не нашлось. Добавь вручную: имя рекрутера из объявления, почту агентства или ссылку на профиль в LinkedIn.</p>'}</div>
      <div class="fu-add">
        <select id="fuType" aria-label="Тип контакта"><option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="phone">Телефон</option><option value="name">Только имя</option></select>
        <input type="text" id="fuVal" placeholder="email, ссылка или телефон" aria-label="Контакт">
        <input type="text" id="fuName" placeholder="Имя (необязательно)" aria-label="Имя">
        <button class="btn small" id="fuAdd">Добавить</button>
      </div>
      <div class="seg fu-seg" role="group" aria-label="Канал">
        ${[['email', 'Email'], ['linkedin', 'LinkedIn'], ['call', 'Звонок']].map(([k, l]) => `<button data-ch="${k}" aria-pressed="${k === channel}">${l}</button>`).join('')}
      </div>
      ${options.length > 1 ? `<label>Кому<select id="fuTo">${options.map((c, i) => `<option value="${i}" ${c === sel ? 'selected' : ''}>${esc((c.name ? c.name + ' — ' : '') + (c.type === 'linkedin' ? 'LinkedIn' : c.value))}</option>`).join('')}</select></label>` : ''}
      ${channel === 'email' ? `<label>Тема<input type="text" id="fuSubj" value="${esc(msg.subject)}"></label>` : ''}
      <label>${channel === 'call' ? 'Что сказать по телефону' : 'Текст'}<textarea id="fuBody" rows="${channel === 'linkedin' ? 5 : 11}">${esc(msg.body)}</textarea></label>
      ${channel === 'linkedin' ? '<p class="hint" style="margin:4px 0 0" id="fuLen"></p>' : ''}
      <div class="btns" style="margin-top:10px">
        ${channel === 'email' ? `<button class="btn primary" id="fuSend">${profile.mailClient === 'outlook' ? 'Открыть в Outlook' : profile.mailClient === 'mailto' ? 'Открыть в почте' : 'Открыть в Gmail'}</button>` : ''}
        ${channel === 'linkedin' ? `<button class="btn primary" id="fuLi">${sel ? 'Скопировать и открыть профиль' : 'Скопировать и найти рекрутера'}</button>` : ''}
        ${channel === 'call' && sel ? `<a class="btn primary" href="tel:${esc(sel.value.replace(/\s/g, ''))}">Позвонить ${esc(sel.value)}</a>` : ''}
        <button class="btn" id="fuCopy">Скопировать текст</button>
        <button class="btn" id="fuDone">Отметить как отправленный</button>
      </div>
      <p class="msg" id="fuMsg" role="status"></p>
      ${fu.length ? `<ul class="timeline" style="margin-top:10px">${fu.map(f => `<li style="--c:#1f6fa8">Follow-up · ${esc({ email: 'Email', linkedin: 'LinkedIn', call: 'Звонок' }[f.channel] || f.channel)}${f.to ? ' · ' + esc(f.to) : ''}<span>${fmtDate(f.at)}</span></li>`).join('')}</ul>` : ''}`;

    const saveContacts = async list => { a.contacts = list; await S.updateApp(a.id, { contacts: list }); apps = await S.getApps(); renderFollowUp(a); };
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => saveContacts(contacts.filter((_, i) => i !== +b.dataset.rm)));
    $('#fuAdd').onclick = () => {
      const type = $('#fuType').value, value = $('#fuVal').value.trim(), name = $('#fuName').value.trim();
      if (!value && !name) return;
      saveContacts(contacts.concat([{ type, value: value || name, name, source: 'добавлено вручную' }]));
    };
    box.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { box.dataset.channel = b.dataset.ch; box.dataset.to = 0; renderFollowUp(a); });
    if ($('#fuTo')) $('#fuTo').onchange = () => { box.dataset.to = $('#fuTo').value; renderFollowUp(a); };
    const body = () => $('#fuBody').value, subj = () => ($('#fuSubj') ? $('#fuSubj').value : '');
    const say = t => { $('#fuMsg').textContent = t; };
    const copy = async () => { try { await navigator.clipboard.writeText(body()); return true; } catch (e) { $('#fuBody').select(); document.execCommand('copy'); return true; } };
    const upd = () => {
      if (!$('#fuLen')) return;
      const n = body().length, lim = F.LI_LIMIT;
      $('#fuLen').textContent = n > lim ? `${n} / ${lim} — для записки к приглашению нужно короче. Если вы уже в контактах, можно отправить как обычное сообщение.` : `${n} / ${lim} символов — помещается в записку к приглашению.`;
      $('#fuLen').style.color = n > lim ? '#8f2f26' : '';
    };
    $('#fuBody').oninput = upd; upd();
    $('#fuCopy').onclick = async () => { await copy(); say('Текст скопирован.'); };
    if ($('#fuSend')) $('#fuSend').onclick = () => {
      const to = sel && sel.type === 'email' ? sel.value : '';
      const url = (F.links[profile.mailClient] || F.links.gmail)(to, subj(), body());
      window.open(url, '_blank');
      say(to ? 'Письмо открыто — проверь и нажми «Отправить», затем отметь follow-up.' : 'Адреса нет — впиши получателя в письме. После отправки отметь follow-up.');
    };
    if ($('#fuLi')) $('#fuLi').onclick = async () => {
      await copy();
      window.open(sel ? sel.value : F.links.linkedinSearch(a.company), '_blank');
      say(sel ? 'Текст скопирован. На LinkedIn нажми «Connect» → «Add a note» или «Message» и вставь (Ctrl+V).' : 'Текст скопирован. Найди рекрутера компании в результатах поиска, добавь его в этот список и отправь сообщение.');
    };
    $('#fuDone').onclick = async () => {
      const list = (a.followUps || []).concat([{ at: new Date().toISOString(), channel, to: sel ? (sel.name || sel.value) : '' }]);
      const next = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
      a.followUps = list;
      await S.updateApp(a.id, { followUps: list, nextDate: list.length < 2 ? next : (a.nextDate || '') });
      apps = await S.getApps();
      if ($('#dNext') && list.length < 2) $('#dNext').value = next;
      renderFollowUp(a);
      $('#fuMsg').textContent = list.length < 2 ? 'Отмечено. Напомню о втором follow-up через неделю.' : 'Отмечено. Если ответа не будет — отметь заявку «Нет ответа».';
    };
  }

  function detailsHtml(a) {
    return (a.details || []).length ? `<ul class="details">${a.details.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="empty">Пока ничего. Появится после анализа описания.</p>';
  }

  function openDrawer(app, opts = {}) {
    const isNew = !app;
    const a = app ? JSON.parse(JSON.stringify(app)) : {
      title: '', company: '', location: '', url: '', platform: 'LinkedIn', category: 'IT Help Desk / Service Desk',
      workTypes: [], salaryText: '', status: 'applied', appliedAt: new Date().toISOString(), notes: '', nextDate: '', description: '', history: [], details: [], tools: [], chance: null,
    };
    current = a;
    const opt = (list, cur) => list.map(v => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
    const plats = S.PLATFORMS.includes(a.platform) || !a.platform ? S.PLATFORMS : [a.platform].concat(S.PLATFORMS);
    const d = $('#drawer');
    d.innerHTML = `
      <div class="dr-head">${a.ticket ? `<span class="ticket">${esc(a.ticket)}</span>` : ''}<h2>${isNew ? 'Новая заявка' : esc(a.title || 'Без названия')}</h2><button class="x" aria-label="Закрыть">×</button></div>
      <div class="dr-body">
        <div class="panel"><h2>Анализ по резюме</h2><div id="anBox">${analysisHtml(a)}</div></div>
        ${!isNew ? '<div class="panel" id="fuPanel"></div>' : ''}
        <div class="panel"><h2>Вакансия</h2>
          <div class="form-grid">
            <label class="full">Название<input type="text" id="dTitle" value="${esc(a.title)}"></label>
            <label>Компания<input type="text" id="dCompany" value="${esc(a.company)}"></label>
            <label>Локация<input type="text" id="dLocation" value="${esc(a.location)}"></label>
            <label>Статус<select id="dStatus">${A.STATUSES.map(s => `<option value="${s.id}" ${s.id === a.status ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
            <label>Платформа<select id="dPlatform">${opt(plats, a.platform)}</select></label>
            <label>Направление<select id="dCategory">${opt(A.CATEGORY_NAMES, a.category)}</select></label>
            <label>Зарплата<input type="text" id="dSalary" value="${esc(a.salaryText || (a.salary && a.salary.text) || '')}" placeholder="£26,000 - £28,000 per annum"></label>
            <label>Дата подачи<input type="date" id="dApplied" value="${toDateInput(a.appliedAt)}"></label>
            <label>Следующий шаг (дата)<input type="date" id="dNext" value="${esc(a.nextDate || '')}"></label>
            <label class="full">Ссылка<input type="url" id="dUrl" value="${esc(a.url)}" placeholder="https://"></label>
            <div class="full"><label>Тип работы</label><div class="chips" id="dWt">${A.WORK_TYPES.map(w => `<button type="button" class="chip" aria-pressed="${(a.workTypes || []).includes(w)}" data-v="${esc(w)}">${esc(w)}</button>`).join('')}</div></div>
            <label class="full">Заметки<textarea id="dNotes" rows="8" placeholder="Контакт рекрутера, вопросы с интервью, что подготовить">${esc(a.notes)}</textarea></label>
          </div>
          ${a.url ? `<p style="margin:10px 0 0"><a href="${esc(a.url)}" target="_blank" rel="noopener">Открыть вакансию</a></p>` : ''}
        </div>
        <div class="panel"><h2>Что даёт компания</h2><div id="benBox">${benefitsHtml(a)}</div></div>
        <div class="panel"><h2>Важное из описания</h2><div id="detBox">${detailsHtml(a)}</div></div>
        <div class="panel"><div class="row-between"><h2>Описание вакансии</h2><button class="btn small" id="dReanalyze">Пересчитать анализ</button></div>
          <textarea id="dDesc" rows="8" placeholder="Вставь сюда текст вакансии, если он не считался автоматически">${esc(a.description)}</textarea>
        </div>
        ${!isNew ? `<div class="panel"><h2>История</h2><ul class="timeline">${(a.history || []).map(h => `<li style="--c:${A.statusColor(h.status)}">${esc(A.statusLabel(h.status))}<span>${fmtDate(h.at)}</span></li>`).join('')}</ul></div>` : ''}
      </div>
      <div class="dr-foot">
        <div class="btns">${!isNew ? '<button class="btn danger" id="dDelete">Удалить</button>' : ''}${!isNew && S.everReached(a, A.OFFER) ? '<button class="btn" id="dOffer">Сравнить офферы</button>' : ''}</div>
        <div class="btns"><button class="btn" id="dCancel">Закрыть</button><button class="btn primary" id="dSave">${isNew ? 'Добавить заявку' : 'Сохранить'}</button></div>
      </div>`;
    d.hidden = false; $('#scrim').hidden = false;
    if (!isNew) renderFollowUp(a);
    if (opts.focusFollowUp && $('#fuPanel')) { $('#fuPanel').scrollIntoView({ block: 'start' }); $('#fuBody') && $('#fuBody').focus(); }
    else $('#dTitle').focus();

    $$('#dWt .chip').forEach(ch => ch.onclick = () => ch.setAttribute('aria-pressed', ch.getAttribute('aria-pressed') !== 'true'));
    const close = () => { d.hidden = true; $('#scrim').hidden = true; current = null; if (location.hash.startsWith('#app=')) history.replaceState(null, '', '#apps'); };
    d.querySelector('.x').onclick = close; $('#dCancel').onclick = close; $('#scrim').onclick = close;
    d.onkeydown = e => { if (e.key === 'Escape') close(); };

    const collect = () => {
      const salaryText = $('#dSalary').value.trim();
      const applied = $('#dApplied').value;
      return {
        title: $('#dTitle').value.trim(), company: $('#dCompany').value.trim(), location: $('#dLocation').value.trim(),
        status: $('#dStatus').value, platform: $('#dPlatform').value, category: $('#dCategory').value,
        salaryText, salary: A.parseSalary(salaryText) || (salaryText ? { text: salaryText } : null),
        appliedAt: applied ? new Date(applied + 'T12:00:00').toISOString() : new Date().toISOString(),
        nextDate: $('#dNext').value, url: $('#dUrl').value.trim(),
        workTypes: $$('#dWt .chip[aria-pressed=true]').map(c => c.dataset.v),
        notes: $('#dNotes').value, description: $('#dDesc').value,
      };
    };

    $('#dReanalyze').onclick = () => {
      const f = collect();
      const an = A.analyze({ title: f.title, description: f.description, location: f.location, workTypes: [], category: '' }, profile);
      Object.assign(a, { chance: an.chance, tools: an.chance.tools, details: an.details, benefits: an.benefits });
      $('#anBox').innerHTML = analysisHtml(a);
      $('#detBox').innerHTML = detailsHtml(a);
      $('#benBox').innerHTML = benefitsHtml(a);
      if (!$('#dNotes').value.trim() && an.notes) $('#dNotes').value = an.notes;
      if (!f.workTypes.length) $$('#dWt .chip').forEach(c => c.setAttribute('aria-pressed', an.workTypes.includes(c.dataset.v)));
      if (!f.salaryText && an.salary) $('#dSalary').value = an.salary.text;
      if (an.category !== 'Другое') $('#dCategory').value = an.category;
      a.analyzedDesc = f.description;
    };

    $('#dSave').onclick = async () => {
      const f = collect();
      let extra = {};
      const descChanged = f.description !== (a.analyzedDesc != null ? a.analyzedDesc : (app ? app.description : ''));
      if (f.description && (descChanged || !a.chance)) {
        const an = A.analyze({ title: f.title, description: f.description, location: f.location, workTypes: f.workTypes, category: f.category }, profile);
        extra = { chance: an.chance, tools: an.chance.tools, details: an.details, benefits: an.benefits };
        if (!f.notes.trim() && an.notes) extra.notes = an.notes;
      } else if (a.chance) extra = { chance: a.chance, tools: a.tools, details: a.details, benefits: a.benefits || [] };
      if (isNew) {
        const created = await S.addApp({ ...f, ...extra, history: [{ status: f.status, at: f.appliedAt }] });
        apps = await S.getApps();
        close(); openDrawer(created);
      } else {
        await S.updateApp(a.id, { ...f, ...extra });
        apps = await S.getApps();
        close();
      }
    };
    if ($('#dDelete')) $('#dDelete').onclick = async () => {
      if (!confirm(`Удалить заявку ${a.ticket}? Это нельзя отменить.`)) return;
      await S.deleteApp(a.id); close();
    };
    if ($('#dOffer')) $('#dOffer').onclick = () => { close(); location.hash = '#offers'; };

  }

  // ---------- ОФФЕРЫ ----------
  const OFFER_FIELDS = [
    { sec: 'Деньги' },
    { k: 'salary', l: 'Зарплата, £/год (до налогов)', t: 'number', better: 'max' },
    { k: 'pension', l: 'Пенсия от работодателя, %', t: 'number', better: 'max' },
    { k: 'bonus', l: 'Бонусы, £/год', t: 'number', better: 'max' },
    { sec: 'Время и дорога' },
    { k: 'hours', l: 'Часов в неделю', t: 'number', better: 'min' },
    { k: 'days', l: 'Дней в неделю', t: 'number', better: 'min' },
    { k: 'mode', l: 'Формат', t: 'select', opts: ['Офис', 'Гибрид', 'Удалённо'] },
    { k: 'officeDays', l: 'Дней в офисе в неделю', t: 'number', better: 'min' },
    { k: 'commuteMin', l: 'Дорога в одну сторону, мин', t: 'number', better: 'min' },
    { k: 'commuteCost', l: 'Дорога, £/месяц', t: 'number', better: 'min' },
    { k: 'holiday', l: 'Отпуск, дней в году', t: 'number', better: 'max' },
    { sec: 'Развитие и условия' },
    { k: 'training', l: 'Обучение / сертификаты, £/год', t: 'number', better: 'max' },
    { k: 'contract', l: 'Контракт', t: 'select', opts: ['Permanent', 'Fixed-term', 'Contract', 'Temporary'] },
    { k: 'start', l: 'Дата выхода', t: 'date' },
    { k: 'deadline', l: 'Ответить до', t: 'date' },
    { k: 'benefits', l: 'Бонусы и льготы', t: 'textarea' },
    { k: 'pros', l: 'Плюсы', t: 'textarea' },
    { k: 'cons', l: 'Минусы', t: 'textarea' },
    { k: 'gut', l: 'Ощущение от команды, 1–5', t: 'number', better: 'max' },
  ];
  const WEIGHTS_DEFAULT = { money: 5, balance: 4, flex: 3, growth: 3, gut: 3 };
  const WEIGHT_LABELS = { money: 'Деньги', balance: 'Время и дорога', flex: 'Гибкость графика', growth: 'Обучение и рост', gut: 'Ощущение от компании' };

  function offerCalc(o) {
    const salary = +o.salary || 0, hours = +o.hours || 37.5;
    const officeDays = o.mode === 'Удалённо' ? 0 : (o.officeDays !== '' && o.officeDays != null ? +o.officeDays : (+o.days || 5));
    const commuteH = (+o.commuteMin || 0) * 2 * officeDays / 60;
    const annualNet = salary + (+o.bonus || 0) + salary * (+o.pension || 0) / 100 - (+o.commuteCost || 0) * 12;
    return {
      hourly: salary ? salary / (hours * 52) : null,
      effHourly: salary ? annualNet / ((hours + commuteH) * 52) : null,
      monthly: salary ? (salary / 12 - (+o.commuteCost || 0)) : null,
      commuteH, annualNet,
      weekTotal: hours + commuteH,
    };
  }

  async function renderOffers() {
    const list = apps.filter(a => S.everReached(a, A.OFFER));
    const wrap = $('#offersWrap');
    if (!list.length) {
      wrap.innerHTML = `<p class="empty-state">Офферов пока нет. Когда поставишь заявке статус «Оффер», она появится здесь, и можно будет сравнить условия по деньгам, времени на дорогу, гибкости и обучению.</p>`;
      return;
    }
    const { offerWeights } = await S.get('offerWeights');
    const w = { ...WEIGHTS_DEFAULT, ...(offerWeights || {}) };
    const offers = list.map(a => ({ a, o: { mode: 'Гибрид', contract: 'Permanent', hours: profile.hoursPerWeek || '', days: profile.daysPerWeek || '', salary: (a.salary && a.salary.annualMin) || '', benefits: (a.benefits || []).join('\n'), ...(a.offer || {}) } }));
    const calcs = offers.map(x => offerCalc(x.o));

    // нормализация 0..1
    const norm = (vals, better) => {
      const nums = vals.map(v => (v == null || isNaN(v)) ? null : v);
      const ok = nums.filter(v => v != null);
      if (!ok.length) return nums.map(() => 0.5);
      const mn = Math.min(...ok), mx = Math.max(...ok);
      return nums.map(v => v == null ? 0.3 : mx === mn ? 1 : better === 'max' ? (v - mn) / (mx - mn) : (mx - v) / (mx - mn));
    };
    const moneyN = norm(calcs.map(c => c.annualNet || null), 'max');
    const balN = norm(calcs.map((c, i) => c.weekTotal - (+offers[i].o.holiday || 0) * 0.15), 'min');
    const flexN = offers.map(({ o }) => {
      let s = { 'Удалённо': 1, 'Гибрид': 0.6, 'Офис': 0.2 }[o.mode] ?? 0.5;
      if (+o.days && +o.days <= (profile.daysPerWeek || 5)) s += 0.3;
      else if (+o.days > (profile.daysPerWeek || 5)) s -= 0.3;
      return Math.max(0, Math.min(1, s));
    });
    const growN = norm(offers.map(({ o }) => +o.training || 0), 'max');
    const gutN = offers.map(({ o }) => +o.gut ? (+o.gut - 1) / 4 : 0.5);
    const wsum = Object.values(w).reduce((s, v) => s + v, 0) || 1;
    const scores = offers.map((_, i) => Math.round((w.money * moneyN[i] + w.balance * balN[i] + w.flex * flexN[i] + w.growth * growN[i] + w.gut * gutN[i]) / wsum * 100));
    const bestIdx = scores.indexOf(Math.max(...scores));

    const bestOf = (f) => {
      if (!f.better) return -1;
      const vals = offers.map(({ o }) => o[f.k] === '' || o[f.k] == null ? null : +o[f.k]);
      const ok = vals.filter(v => v != null && !isNaN(v));
      if (ok.length < 2) return -1;
      const target = f.better === 'max' ? Math.max(...ok) : Math.min(...ok);
      return vals.indexOf(target);
    };
    const cell = (f, o, i) => {
      const v = o[f.k] == null ? '' : o[f.k];
      const attrs = `data-i="${i}" data-k="${f.k}"`;
      if (f.t === 'select') return `<select ${attrs}>${f.opts.map(x => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
      if (f.t === 'textarea') return `<textarea ${attrs} rows="2">${esc(v)}</textarea>`;
      return `<input type="${f.t}" ${attrs} value="${esc(v)}" ${f.t === 'number' ? 'step="any" min="0"' : ''}>`;
    };
    const calcRow = (label, vals, better, fmt) => {
      const ok = vals.filter(v => v != null && !isNaN(v));
      const target = ok.length > 1 ? (better === 'max' ? Math.max(...ok) : Math.min(...ok)) : null;
      return `<tr class="calc"><th>${label}</th>${vals.map(v => `<td class="${v != null && v === target ? 'best' : ''}">${v == null ? '—' : fmt(v)}</td>`).join('')}</tr>`;
    };

    let rows = '';
    OFFER_FIELDS.forEach(f => {
      if (f.sec) { rows += `<tr class="sec"><th colspan="${offers.length + 1}">${f.sec}</th></tr>`; return; }
      const b = bestOf(f);
      rows += `<tr><th>${f.l}</th>${offers.map(({ o }, i) => `<td class="${i === b ? 'best' : ''}">${cell(f, o, i)}</td>`).join('')}</tr>`;
    });
    rows += `<tr class="sec"><th colspan="${offers.length + 1}">Расчёт</th></tr>`;
    rows += calcRow('Ставка в час', calcs.map(c => c.hourly), 'max', v => '£' + v.toFixed(2));
    rows += calcRow('В месяц минус дорога (до налогов)', calcs.map(c => c.monthly), 'max', money);
    rows += calcRow('Часов в неделю с дорогой', calcs.map(c => c.weekTotal), 'min', v => v.toFixed(1));
    rows += calcRow('Реальная ставка с учётом дороги', calcs.map(c => c.effHourly), 'max', v => '£' + v.toFixed(2));
    rows += `<tr class="total"><th>Итог по твоим приоритетам</th>${scores.map((s, i) => `<td class="${i === bestIdx && offers.length > 1 ? 'best' : ''}">${s} / 100</td>`).join('')}</tr>`;

    wrap.innerHTML = `
      <div class="panel"><h2>Что для тебя важнее</h2><p class="hint">Двигай ползунки: итог пересчитается. 0 — не важно, 10 — очень важно.</p>
        <div class="weights">${Object.keys(WEIGHT_LABELS).map(k => `<label>${WEIGHT_LABELS[k]} <output id="wo-${k}">${w[k]}</output><input type="range" min="0" max="10" value="${w[k]}" data-w="${k}"></label>`).join('')}</div>
        ${offers.length > 1 ? `<p class="winner" style="margin-top:14px">Сейчас лидирует: <b>${esc(offers[bestIdx].a.company || offers[bestIdx].a.title)}</b> — ${scores[bestIdx]} из 100.</p>` : '<p class="hint" style="margin:14px 0 0">Сравнение заработает, когда офферов станет два или больше. Пока можно заполнить условия.</p>'}
      </div>
      <div class="offers-table-wrap"><table class="offers">
        <thead><tr><th>Условия</th>${offers.map(({ a }) => `<th>${esc(a.company || 'Компания')}<small>${esc(a.title)} · ${esc(A.statusLabel(a.status))}</small></th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="hint">Зелёным отмечено лучшее значение в строке. Расчёт до налогов и примерный: сравнивает варианты между собой, а не считает точную зарплату на руки.</p>`;

    $$('#offersWrap [data-k]').forEach(inp => inp.addEventListener('change', async () => {
      const i = +inp.dataset.i, k = inp.dataset.k;
      const a = offers[i].a;
      const offer = { ...offers[i].o, [k]: inp.value };
      await S.updateApp(a.id, { offer });
      apps = await S.getApps();
      renderOffers();
    }));
    $$('#offersWrap [data-w]').forEach(r => {
      r.oninput = () => { $('#wo-' + r.dataset.w).textContent = r.value; };
      r.onchange = async () => { w[r.dataset.w] = +r.value; await S.set({ offerWeights: w }); renderOffers(); };
    });
  }

  // ---------- НАВЫКИ И НАСТРОЙКИ ----------
  function renderSettings() {
    $('#pDays').value = profile.daysPerWeek; $('#pHours').value = profile.hoursPerWeek;
    $('#pLicence').checked = !!profile.hasDrivingLicence; $('#pLang').checked = !!profile.speaksUkrainianRussian;
    $('#pAuto').checked = profile.autoDetect !== false;
    $('#pPreview').checked = profile.showPreview !== false;
    $('#pSched').checked = !!profile.penalizeSchedule;
    $('#pList').checked = profile.listScan !== false;
    $('#pSignName').value = profile.signName || ''; $('#pSignPhone').value = profile.signPhone || '';
    $('#pSignLi').value = profile.signLinkedIn || ''; $('#pMail').value = profile.mailClient || 'gmail';
    $('#pAreas').value = (profile.areas || []).join(', ');
    const groups = {};
    A.TOOLS.forEach(t => { (groups[t.group] = groups[t.group] || []).push(t.name); });
    $('#skillsGrid').innerHTML = Object.entries(groups).map(([g, names]) => `
      <div class="skill-group"><h3>${esc(g)}</h3><div class="skills">${names.map(n => {
        const lv = profile.skills[n] || 'none';
        return `<div class="skill"><span>${esc(n)}</span><span class="seg" role="group" aria-label="${esc(n)}">
          <button class="s" data-sk="${esc(n)}" data-lv="strong" aria-pressed="${lv === 'strong'}">Уверенно</button>
          <button class="b" data-sk="${esc(n)}" data-lv="basic" aria-pressed="${lv === 'basic'}">Базово</button>
          <button class="n" data-sk="${esc(n)}" data-lv="none" aria-pressed="${lv === 'none'}">Нет</button></span></div>`;
      }).join('')}</div></div>`).join('');
    $$('#skillsGrid [data-sk]').forEach(b => b.onclick = async () => {
      profile.skills[b.dataset.sk] = b.dataset.lv;
      $$(`#skillsGrid [data-sk="${CSS.escape(b.dataset.sk)}"]`).forEach(x => x.setAttribute('aria-pressed', x === b));
      await S.saveProfile(profile);
    });
  }
  const saveProfileFields = async () => {
    profile.daysPerWeek = +$('#pDays').value || 5; profile.hoursPerWeek = +$('#pHours').value || 37.5;
    profile.hasDrivingLicence = $('#pLicence').checked; profile.speaksUkrainianRussian = $('#pLang').checked;
    profile.autoDetect = $('#pAuto').checked;
    profile.showPreview = $('#pPreview').checked;
    profile.penalizeSchedule = $('#pSched').checked;
    profile.listScan = $('#pList').checked;
    profile.signName = $('#pSignName').value.trim(); profile.signPhone = $('#pSignPhone').value.trim();
    profile.signLinkedIn = $('#pSignLi').value.trim(); profile.mailClient = $('#pMail').value;
    profile.areas = $('#pAreas').value.split(',').map(x => x.trim()).filter(Boolean);
    await S.saveProfile(profile);
  };
  ['#pDays', '#pHours', '#pLicence', '#pLang', '#pAuto', '#pPreview', '#pSched', '#pList', '#pAreas', '#pSignName', '#pSignPhone', '#pSignLi', '#pMail'].forEach(id => $(id).addEventListener('change', saveProfileFields));
  $('#resetSkills').onclick = async () => {
    if (!confirm('Вернуть уровни навыков к значениям из резюме?')) return;
    profile.skills = { ...A.DEFAULT_SKILLS }; await S.saveProfile(profile); renderSettings();
  };
  $('#recalcAll').onclick = async () => {
    const list = await S.getApps();
    const now = new Date().toISOString();
    let filled = 0;
    list.forEach(a => {
      if (!a.description && !a.title) return;
      const an = A.analyze({ title: a.title, description: a.description || '', location: a.location, workTypes: a.workTypes, category: a.category }, profile);
      a.chance = an.chance; a.tools = an.chance.tools;
      if (a.description) {
        a.details = an.details;
        // Дозаполняем заметки и бонусы у старых заявок, не трогая то, что ты написал сам
        if (!(a.benefits || []).length && an.benefits.length) { a.benefits = an.benefits; filled++; }
        if (!String(a.notes || '').trim() && an.notes) { a.notes = an.notes; filled++; }
        if (globalThis.JT_Extract) {
          const found = JT_Extract.contactsFromText(a.description);
          const merged = JT_Extract.mergeContacts(a.contacts || [], found);
          if (merged.length > (a.contacts || []).length) { a.contacts = merged; filled++; }
        }
      }
      a.updatedAt = now; // чтобы изменения ушли в Google Таблицу
    });
    await S.saveApps(list);
    $('#recalcAll').textContent = filled ? `Готово — шансы пересчитаны, дозаполнено полей: ${filled}` : 'Готово — шансы пересчитаны';
    setTimeout(() => { $('#recalcAll').textContent = 'Пересчитать шансы для всех заявок'; }, 2500);
  };

  // ---------- GOOGLE ТАБЛИЦА ----------
  async function renderSheetCfg() {
    const cfg = await JT_Sync_cfg();
    $('#gsUrl').value = cfg.url || ''; $('#gsToken').value = cfg.token || ''; $('#gsAuto').checked = cfg.auto !== false;
    renderSyncState();
  }
  async function JT_Sync_cfg() { const { sheetCfg } = await S.get('sheetCfg'); return sheetCfg || {}; }
  async function renderSyncState() {
    const { syncState } = await S.get('syncState');
    const el = $('#syncState');
    if (!syncState) { el.textContent = 'Не подключено'; el.className = 'sync-state'; return; }
    el.textContent = (syncState.ok ? 'Синхронизировано ' : 'Ошибка ') + new Date(syncState.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + (syncState.ok ? '' : ': ' + syncState.msg);
    el.className = 'sync-state ' + (syncState.ok ? 'ok' : 'err');
  }
  const readCfg = () => ({ url: $('#gsUrl').value.trim(), token: $('#gsToken').value.trim(), auto: $('#gsAuto').checked });
  const gsMsg = (t, ok) => { $('#gsMsg').textContent = t; $('#gsMsg').className = 'msg ' + (ok ? 'ok' : 'err'); };
  ['#gsUrl', '#gsToken', '#gsAuto'].forEach(id => $(id).addEventListener('change', () => S.set({ sheetCfg: readCfg() })));
  $('#gsTest').onclick = async () => {
    await S.set({ sheetCfg: readCfg() });
    gsMsg('Проверяю…', true);
    const r = await chrome.runtime.sendMessage({ type: 'syncTest', cfg: readCfg() });
    gsMsg(r.ok ? r.msg : r.error, r.ok);
  };
  $('#gsSync').onclick = async () => {
    await S.set({ sheetCfg: readCfg() });
    gsMsg('Синхронизирую…', true);
    const r = await chrome.runtime.sendMessage({ type: 'syncNow' });
    gsMsg(r.ok ? r.msg : r.error, r.ok);
  };
  chrome.storage.onChanged.addListener(ch => { if (ch.syncState) renderSyncState(); });
  renderSheetCfg();
  (async () => { const c = await JT_Sync_cfg(); if (c.url && c.token && c.auto !== false) chrome.runtime.sendMessage({ type: 'syncNow' }); })();

  // ---------- ДАННЫЕ ----------
  const download = (name, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const stamp = () => new Date().toISOString().slice(0, 10);
  $('#exportJson').onclick = async () => {
    const all = await S.get(['apps', 'profile', 'counter', 'offerWeights']);
    download(`job-tracker-${stamp()}.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...all }, null, 2), 'application/json');
  };
  $('#exportCsv').onclick = () => {
    const cols = [['Тикет', a => a.ticket], ['Вакансия', a => a.title], ['Компания', a => a.company], ['Локация', a => a.location],
      ['Направление', a => a.category], ['Тип', a => (a.workTypes || []).join(', ')], ['Зарплата', a => (a.salary && a.salary.text) || a.salaryText],
      ['Платформа', a => a.platform], ['Дата подачи', a => fmtDate(a.appliedAt)], ['Статус', a => A.statusLabel(a.status)],
      ['Шансы %', a => a.chance ? a.chance.score : ''], ['Инструменты', a => (a.tools || []).join(', ')],
      ['Не хватает', a => a.chance ? a.chance.missing.join(', ') : ''], ['Бонусы', a => (a.benefits || []).join(' • ')], ['Заметки', a => a.notes], ['Ссылка', a => a.url]];
    const cellv = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = '\ufeff' + [cols.map(c => cellv(c[0])).join(',')].concat(apps.map(a => cols.map(c => cellv(c[1](a))).join(','))).join('\r\n');
    download(`job-tracker-${stamp()}.csv`, csv, 'text/csv;charset=utf-8');
  };
  $('#importJson').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.apps)) throw new Error('нет списка заявок');
      const cur = await S.getApps();
      const ids = new Set(cur.map(a => a.id));
      const merged = cur.concat(data.apps.filter(a => a && a.id && !ids.has(a.id)));
      await S.set({ apps: merged, counter: Math.max(data.counter || 0, (await S.get('counter')).counter || 0) });
      if (data.profile) await S.saveProfile(data.profile);
      $('#dataMsg').textContent = `Загружено: добавлено ${merged.length - cur.length} заявок.`;
    } catch (err) {
      $('#dataMsg').textContent = 'Файл не подошёл: ' + err.message + '. Нужен JSON, скачанный кнопкой «Скачать копию».';
    }
    e.target.value = '';
  };
  $('#wipe').onclick = async () => {
    if (!confirm('Удалить все заявки и офферы? Сначала лучше скачать копию.')) return;
    await S.saveApps([]); $('#dataMsg').textContent = 'Все заявки удалены.';
  };

  // ---------- Починка названий LinkedIn («About the job» и т.п.) ----------
  async function repairTitles() {
    const E = globalThis.JT_Extract;
    if (!E) return;
    const bad = t => !t || t.length < 3 || E.BAD_TITLE.test(t);
    const list = apps.filter(a => bad(a.title) && /linkedin\.com\/jobs\/view\/(\d+)/.test(a.url || '')).slice(0, 40);
    if (!list.length) return;
    let fixed = 0;
    $('#repairMsg').textContent = `Исправляю названия вакансий LinkedIn: 0 из ${list.length}…`;
    for (const a of list) {
      const id = a.url.match(/linkedin\.com\/jobs\/view\/(\d+)/)[1];
      try {
        const g = await E.fetchAndParse(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`, a.url);
        if (bad(g.title)) continue;
        const desc = (a.description || '').length >= 200 ? a.description : (g.description || a.description || '');
        const an = A.analyze({ title: g.title, description: desc, location: a.location || g.location, workTypes: a.workTypes, category: '' }, profile);
        const patch = { title: g.title, category: an.category, chance: an.chance, tools: an.chance.tools, details: an.details, description: desc };
        if (!a.company || bad(a.company)) patch.company = g.company;
        if (!a.location) patch.location = g.location;
        if (!(a.benefits || []).length && an.benefits.length) patch.benefits = an.benefits;
        if (!String(a.notes || '').trim() && an.notes) patch.notes = an.notes;
        if (!a.salaryText && g.salaryText) { patch.salaryText = g.salaryText; patch.salary = A.parseSalary(g.salaryText); }
        await S.updateApp(a.id, patch);
        fixed++;
      } catch (e) { /* пропускаем */ }
      $('#repairMsg').textContent = `Исправляю названия вакансий LinkedIn: ${fixed} из ${list.length}…`;
      await new Promise(r => setTimeout(r, 700));
    }
    apps = await S.getApps();
    $('#repairMsg').textContent = fixed ? `Исправлено названий: ${fixed}.` : 'Не удалось получить названия — LinkedIn не ответил. Попробую при следующем открытии.';
    setTimeout(() => { $('#repairMsg').textContent = ''; }, 8000);
  }

  route();
  repairTitles();
})();
