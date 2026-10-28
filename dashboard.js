/* Job Tracker — dashboard */
(async function () {
  'use strict';
  const A = JT_Analyzer, S = JT_Store, I = JT_Insights;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const money = n => (n == null || isNaN(n)) ? '—' : '£' + Math.round(n).toLocaleString('en-GB');
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  const daysSince = d => Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
  const chanceClass = n => n >= 70 ? 'c-good' : n >= 50 ? 'c-mid' : 'c-bad';
  // A verdict pill: Apply / Tailor CV / Check first / Skip / ? (incomplete)
  const V_CLASS = { apply: 'c-good', tailor: 'c-tailor', ask: 'c-mid', skip: 'c-bad', incomplete: 'c-none' };
  const V_RANK = { apply: 0, tailor: 1, ask: 2, skip: 3, incomplete: 4 };
  function fitPill(c) {
    if (!c) return '—';
    const d = A.display(c);
    if (!c.verdict) return `<span class="chance ${chanceClass(c.score)}">${c.score}%</span>`;
    const why = [d.hint, ...((c.gates && c.gates.blocks) || []).map(b => '✕ ' + b.text), ...((c.gates && c.gates.asks) || []).map(b => '! ' + b.text), ...((c.quality && !c.quality.ok && c.quality.issues) || []).filter(i => i.hard).map(i => '? ' + i.text)].filter(Boolean).join('\n');
    return `<span class="chance ${V_CLASS[c.verdict]}" title="${esc(why)}">${esc(d.text)}</span> <span class="vlabel">${esc(d.label)}</span>`;
  }
  const sure = a => a.chance && a.chance.verdict !== 'incomplete' && a.chance.confidence !== 'low' && a.chance.v >= 3;
  const PER = { year: '/yr', hour: '/hr', day: '/day', week: '/wk', month: '/mo' };
  const fmtSal = a => {
    const x = a.salary;
    if (!x || !x.min) return a.salaryText ? esc(a.salaryText) : '<span style="color:#5a6b7d">not listed</span>';
    const f = n => n >= 1000 ? '£' + (Math.round(n / 100) / 10) + 'k' : '£' + n;
    return `<span style="white-space:nowrap">${f(x.min)}${x.max && x.max !== x.min ? '–' + f(x.max).slice(1) : ''}${PER[x.period] || ''}</span>`;
  };
  const toDateInput = iso => iso ? new Date(iso).toISOString().slice(0, 10) : '';

  const trackOf = a => a.track === 'intern' || a.track === 'job' ? a.track : (A.detectInternship(a.title, a.description) ? 'intern' : 'job');
  const skillsFor = t => t === 'intern' ? profile.intern.skills : profile.skills;
  let ovTrack = 'all', skTrack = 'job';
  const PL_ICON = { ok: ['✓', 'var(--good)'], warn: ['!', 'var(--mid)'], fail: ['✕', 'var(--bad)'], unknown: ['?', 'var(--muted)'], info: ['i', 'var(--blue)'] };
  const PL_HEAD = { ok: 'Fits your placement rules', warn: 'Placement rules: check with the employer', fail: 'Breaks your placement rules' };
  const plBadge = pl => pl ? `<span class="apb ap-${pl.verdict}" title="${esc(PL_HEAD[pl.verdict])}">rules ${({ ok: '✓', warn: '?', fail: '✕' })[pl.verdict]}</span>` : '';
  const daysTo = iso => Math.ceil((new Date(iso + 'T23:59:59') - Date.now()) / 864e5);
  const longDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

  let apps = await S.getApps();
  let profile = await S.getProfile();
  // Internships are hidden unless switched on in Settings; the records stay and show again when it is on
  function applyInternVisibility() { document.body.classList.toggle('no-intern', !profile.showInternships); }
  applyInternVisibility();
  let current = null; // the open drawer

  chrome.storage.onChanged.addListener(async ch => {
    if (ch.apps) { apps = await S.getApps(); renderAll(); }
    if (ch.profile) { profile = await S.getProfile(); }
    if (ch.cvs) { cvsCache = null; if (!$('#view-cv').hidden) renderCV(); }
  });

  // ---------- Navigation ----------
  function route() {
    const h = location.hash.slice(1) || 'overview';
    let view = h.split('=')[0];
    if (view === 'app') view = 'apps';
    if (!['overview', 'apps', 'followups', 'offers', 'intern', 'cv', 'settings', 'data'].includes(view)) view = 'overview';
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
    $('#navIntern').textContent = apps.filter(a => trackOf(a) === 'intern').length || '';
    $('#navFu').textContent = JT_Follow.queue(ovApps()).due.filter(x => !x.late).length || '';
    ({ intern: renderIntern, cv: renderCV, overview: renderOverview, apps: renderApps, followups: renderFollowups, offers: renderOffers, settings: renderSettings, data: () => {} })[v]();
  }

  // ---------- OVERVIEW ----------
  const ovApps = () => !profile.showInternships ? apps.filter(a => trackOf(a) === 'job') : ovTrack === 'all' ? apps : apps.filter(a => trackOf(a) === ovTrack);
  $$('#ovTrack button').forEach(b => b.onclick = () => { ovTrack = b.dataset.t; renderOverview(); });
  function renderOverview() {
    $$('#ovTrack button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === ovTrack));
    const total = ovApps().length;
    const responded = ovApps().filter(a => S.everReached(a, A.RESPONDED)).length;
    const interviews = ovApps().filter(a => S.everReached(a, A.INTERVIEW)).length;
    const offers = ovApps().filter(a => S.everReached(a, A.OFFER)).length;
    const stages = [
      { lbl: 'Applied', n: total, conv: total ? 'all time' : 'press Apply on a job site', c: '#5a6b7d' },
      { lbl: 'Responses', n: responded, conv: `${pct(responded, total)} of applications`, c: '#1f7fb0' },
      { lbl: 'Interviews', n: interviews, conv: `${pct(interviews, responded)} of responses`, c: '#7a4fc0' },
      { lbl: 'Offers', n: offers, conv: `${pct(offers, interviews)} of interviews`, c: '#23905a' },
    ];
    $('#pipeline').innerHTML = stages.map(s => `
      <div class="stage"><div class="lbl">${s.lbl}</div><div class="num">${s.n}</div>
      <div class="bar"><i style="width:${total ? Math.max(s.n ? 3 : 0, s.n / total * 100) : 0}%;background:${s.c}"></i></div>
      <div class="conv">${s.conv}</div></div>`).join('');

    const rejected = ovApps().filter(a => a.status === 'rejected').length;
    const noresp = ovApps().filter(a => a.status === 'noresponse').length;
    const active = ovApps().filter(a => ['applied', 'screening', 'test', 'interview1', 'interview2', 'interview3', 'offer'].includes(a.status)).length;
    const week = ovApps().filter(a => daysSince(a.appliedAt) < 7).length;
    // Only scores you can trust go into the average; incomplete records are counted separately
    const withChance = ovApps().filter(sure);
    const avg = withChance.length ? Math.round(withChance.reduce((s, a) => s + a.chance.score, 0) / withChance.length) : null;
    const incomplete = ovApps().filter(a => a.chance && a.chance.verdict === 'incomplete').length;
    const skipped = ovApps().filter(a => a.chance && a.chance.verdict === 'skip').length;
    $('#kpis').innerHTML = `<span>In progress: <b>${active}</b></span><span>Rejected: <b>${rejected}</b></span><span>No response: <b>${noresp}</b></span>
      <span>Last 7 days: <b>${week}</b></span><span title="Only applications with a full job ad">Average fit: <b>${avg == null ? '—' : avg + '%'}</b></span>
      ${skipped ? `<span title="Applications the tracker now marks Skip: something in the ad ruled you out">Applied to Skip jobs: <b>${skipped}</b></span>` : ''}
      ${incomplete ? `<span title="The job ad was not captured: open the job page and re-save, or paste the description">Incomplete: <b>${incomplete}</b></span>` : ''}`;
    renderCalibration();
    renderWhy();

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
    ovApps().forEach(a => {
      const m = monday(a.appliedAt).getTime();
      const b = buckets.find(x => x.s.getTime() === m);
      if (b) { b.n++; if (S.everReached(a, A.RESPONDED)) b.r++; }
    });
    const max = Math.ceil(Math.max(4, ...buckets.map(b => b.n)) / 2) * 2;
    const W = 560, H = 200, pad = 26, bw = (W - pad) / weeks;
    let svg = `<svg viewBox="0 0 ${W} ${H + 24}" width="100%" role="img" aria-label="Applications per week">`;
    [0, .5, 1].forEach(f => { const y = H - f * (H - 10); svg += `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="#e3e9ef"/><text x="0" y="${y + 4}" font-size="11" fill="#5a6b7d">${Math.round(max * f)}</text>`; });
    buckets.forEach((b, i) => {
      const x = pad + i * bw + 6, w = bw - 12;
      const h = b.n / max * (H - 10), hr = b.r / max * (H - 10);
      svg += `<rect x="${x}" y="${H - h}" width="${w}" height="${h}" rx="3" fill="#b9d3e8"><title>${b.n} applied</title></rect>`;
      svg += `<rect x="${x}" y="${H - hr}" width="${w}" height="${hr}" rx="3" fill="#1f6fa8"><title>${b.r} with a response</title></rect>`;
      if (b.n) svg += `<text x="${x + w / 2}" y="${H - h - 5}" font-size="11" text-anchor="middle" fill="#1c2733">${b.n}</text>`;
      svg += `<text x="${x + w / 2}" y="${H + 16}" font-size="10.5" text-anchor="middle" fill="#5a6b7d">${b.s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</text>`;
    });
    svg += '</svg>';
    $('#weekly').innerHTML = svg + `<div class="legend"><span style="--c:#b9d3e8">Applied</span><span style="--c:#1f6fa8">Got a response</span></div>`;
  }

  function renderPlatforms() {
    const map = {};
    ovApps().forEach(a => { const p = a.platform || 'Other'; map[p] = map[p] || { n: 0, r: 0 }; map[p].n++; if (S.everReached(a, A.RESPONDED)) map[p].r++; });
    const rows = Object.entries(map).sort((a, b) => b[1].n - a[1].n);
    if (!rows.length) { $('#platforms').innerHTML = '<p class="empty">This will show which sites lead to responses.</p>'; return; }
    const max = rows[0][1].n;
    $('#platforms').innerHTML = rows.map(([p, v]) => `
      <div class="hbar"><span class="name" title="${esc(p)}">${esc(p)}</span>
      <span class="track"><i style="width:${v.r / max * 100}%;background:#1f6fa8"></i><i style="width:${(v.n - v.r) / max * 100}%;background:#b9d3e8"></i></span>
      <span class="v">${v.n} · ${pct(v.r, v.n)}</span></div>`).join('') +
      `<div class="legend"><span style="--c:#1f6fa8">Response</span><span style="--c:#b9d3e8">No response</span><span style="--c:transparent">right: total · response rate</span></div>`;
  }

  // Does the verdict mean anything? Replies and interviews per verdict, from your own history
  function renderCalibration() {
    const box = $('#calibration');
    if (!box) return;
    const rows = ['apply', 'tailor', 'ask', 'skip'].map(v => {
      const list = ovApps().filter(a => a.chance && a.chance.verdict === v && daysSince(a.appliedAt) >= 14);
      return { v, n: list.length, r: list.filter(a => S.everReached(a, A.RESPONDED)).length, i: list.filter(a => S.everReached(a, ['interview1', 'interview2', 'interview3', 'offer', 'accepted'])).length };
    }).filter(x => x.n);
    if (!rows.length) { box.innerHTML = '<p class="empty">After a few weeks this shows whether Apply jobs really answer more often than Skip jobs.</p>'; return; }
    const max = Math.max(...rows.map(x => x.n));
    box.innerHTML = rows.map(x => `<div class="hbar"><span class="name">${esc(A.VERDICTS[x.v].label)}</span>
      <span class="track"><i style="width:${x.r / max * 100}%;background:#1f6fa8"></i><i style="width:${(x.n - x.r) / max * 100}%;background:#b9d3e8"></i></span>
      <span class="v">${x.n} · ${pct(x.r, x.n)} reply · ${pct(x.i, x.n)} interview</span></div>`).join('') +
      `<p class="hint" style="margin:8px 0 0">Applications older than two weeks. If Skip replies as often as Apply, the rules need changing: tell me which ads were wrong.</p>`;
  }

  // Reply and interview rate per factor: method, cover letter, CV, ad age, competition, requirements
  function renderWhy() {
    const box = $('#why');
    if (!box) return;
    const b = I.breakdown(ovApps(), { responded: a => S.everReached(a, A.RESPONDED), interviewed: a => S.everReached(a, A.INTERVIEW), minAgeDays: 7 });
    if (b.total < 5) { box.innerHTML = '<p class="empty">After about 10 applications older than a week this shows what the ones that got a reply have in common.</p>'; return; }
    const r = b.rejection;
    const head = `<div class="why-head">
      <div><b>${b.total}</b><span>applications older than a week</span></div>
      <div><b>${pct(b.total - r.silent, b.total)}</b><span>got any reply</span></div>
      <div><b>${r.n ? pct(r.fast, r.n) : '—'}</b><span>of rejections came within 3 days${r.median != null ? ` (median ${r.median} d)` : ''}</span></div>
      <div><b>${r.silent}</b><span>never answered</span></div></div>`;
    const reasonRows = Object.entries(r.reasons).filter(([k]) => k).sort((x, y) => y[1] - x[1]);
    const verdict = [];
    if (r.n >= 3 && r.fast / r.n >= 0.6) verdict.push('Most rejections arrive within 3 days: the CV is filtered before anyone talks to you. Change the CV and the first lines of the application, not your interview prep.');
    const grp = t => b.groups.find(g => g.title === t);
    const rate = x => x.n ? x.replied / x.n : 0;
    const meth = grp('How you applied').rows.filter(x => x.n >= 5 && x.key !== 'Not recorded');
    if (meth.length >= 2) { const s2 = meth.slice().sort((x, y) => rate(y) - rate(x)); if (rate(s2[0]) - rate(s2[s2.length - 1]) >= 0.1) verdict.push(`${s2[0].key} answers ${pct(s2[0].replied, s2[0].n)} of the time, ${s2[s2.length - 1].key} ${pct(s2[s2.length - 1].replied, s2[s2.length - 1].n)}.`); }
    const crowd = grp('Applicants before you').rows.find(x => x.key === 'Over 100');
    if (crowd && crowd.n >= 5 && !crowd.interview) verdict.push(`${crowd.n} applications went to ads with 100+ applicants and none led to an interview: apply in the first 2–3 days or skip them.`);
    const exp = grp('What the ad demanded').rows.find(x => x.key === I.REQS[0].label);
    if (exp && exp.n >= 5 && !exp.interview) verdict.push(`Ads that demand previous professional IT experience: ${exp.n} applied, ${exp.replied} replies, no interviews. Your freelance and home-lab work needs to be visible as experience, or target roles that train.`);
    const vg = grp('Verdict when you applied');
    const skipRow = vg && vg.rows.find(x => x.key === 'Skip');
    if (skipRow && skipRow.n >= 5 && !skipRow.interview) verdict.push(`${skipRow.n} applications went to jobs marked Skip and none led to an interview. Those slots are better spent tailoring the CV for a Tailor CV or Apply job.`);
    const tg = grp('CV tailored to the ad');
    const ty = tg && tg.rows.find(x => x.key === 'Yes'), tn = tg && tg.rows.find(x => x.key === 'No');
    if (ty && tn && ty.n >= 3 && tn.n >= 3) verdict.push(`Tailored CV: ${pct(ty.replied, ty.n)} replies. Same CV for everything: ${pct(tn.replied, tn.n)}.`);
    const unknown = grp('How you applied').rows.find(x => x.key === 'Not recorded');
    const tbl = g => `<div class="why-grp"><h3>${esc(g.title)}</h3><table class="why-t"><thead><tr><th></th><th>Sent</th><th>Reply</th><th>Interview</th><th>Rejected</th></tr></thead><tbody>${g.rows.map(x => `
      <tr><td>${esc(x.key)}</td><td>${x.n}</td><td><span class="bar" style="--w:${x.n ? x.replied / x.n * 100 : 0}%"></span>${pct(x.replied, x.n)}</td><td>${pct(x.interview, x.n)}</td><td>${x.rejected}</td></tr>`).join('')}</tbody></table></div>`;
    box.innerHTML = head +
      (verdict.length ? `<ul class="why-v">${verdict.map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : '') +
      `<div class="why-grid">${b.groups.filter(g => g.rows.length > 1 || !/^(Not recorded|Unknown)$/.test(g.rows[0] ? g.rows[0].key : 'Unknown')).map(tbl).join('')}
        ${reasonRows.length ? `<div class="why-grp"><h3>Reasons employers gave</h3><table class="why-t"><tbody>${reasonRows.map(([k, n]) => `<tr><td>${esc(I.label(I.REASONS, k))}</td><td>${n}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>` +
      (unknown && unknown.n / b.total > 0.5 ? `<p class="hint" style="margin:10px 0 0">${unknown.n} applications have no method recorded (saved before version 3.2). New ones are filled in automatically from the button you press; for older ones open the application and set it.</p>` : '');
  }

  function renderToolsTop() {
    const cnt = {};
    ovApps().forEach(a => (a.tools || []).forEach(t => { cnt[t] = (cnt[t] || 0) + 1; }));
    const rows = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 12);
    if (!rows.length) { $('#toolsTop').innerHTML = '<p class="empty">After your first applications this lists the skills worth brushing up before interviews.</p>'; return; }
    const max = rows[0][1];
    const col = t => ({ strong: '#5fb487', basic: '#e0ae4a', none: '#d9776c' })[profile.skills[t] || 'none'];
    const miss = Object.entries(cnt).filter(([t]) => (profile.skills[t] || 'none') === 'none').sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
    $('#toolsTop').innerHTML = rows.map(([t, n]) => `
      <div class="hbar"><span class="name" title="${esc(t)}">${esc(t)}</span><span class="track"><i style="width:${n / max * 100}%;background:${col(t)}"></i></span><span class="v">${n}×</span></div>`).join('') +
      (miss.length ? `<p class="hint" style="margin:10px 0 0">Learn first: <b>${miss.map(esc).join(', ')}</b></p>` : '');
  }

  function renderAttention() {
    const items = [];
    ovApps().forEach(a => {
      if (a.nextDate) {
        const d = Math.ceil((new Date(a.nextDate) - Date.now()) / 864e5);
        if (d >= -1 && d <= 7) items.push({ a, prio: 0, text: d <= 0 ? 'Next step is today' : `Next step in ${d} day${d === 1 ? '' : 's'} (${fmtDate(a.nextDate)})` });
      }
      if (a.status === 'applied') {
        const d = daysSince(a.appliedAt);
        const fu = a.followUps || [];
        const dl = fu.length ? daysSince(fu[fu.length - 1].at) : null;
        const cnt = (a.contacts || []).filter(c => c.type !== 'name').length;
        const ctext = cnt ? ` · ${cnt} contact${cnt === 1 ? '' : 's'}` : '';
        if ((fu.length >= 2 && dl >= 10) || d >= 35) items.push({ a, prio: 2, text: `${d} days without a reply${fu.length ? `, ${fu.length} follow-up${fu.length === 1 ? '' : 's'}` : ''}`, action: 'noresponse' });
        // First nudge after 4 working days: recruiters shortlist in the first week, a message on day 10 is too late
        else if (fu.length === 0 && I.workingDaysSince(a.appliedAt) >= 4) items.push({ a, prio: 1, text: `${I.workingDaysSince(a.appliedAt)} working days without a reply: time to follow up${ctext || ' · find a recruiter or hiring manager on LinkedIn first'}`, fu: true });
        else if (fu.length === 1 && I.workingDaysSince(fu[0].at) >= 5) items.push({ a, prio: 1, text: `Followed up ${dl} days ago: you can send a second one${ctext}`, fu: true });
      }
      if (a.status === 'offer' && a.offer && a.offer.deadline) items.push({ a, prio: 0, text: `Reply to the offer by ${fmtDate(a.offer.deadline)}` });
    });
    items.sort((x, y) => x.prio - y.prio);
    if (!items.length) { $('#attention').innerHTML = '<p class="empty">Nothing urgent. Reminders about follow-ups, interviews and offer deadlines appear here.</p>'; return; }
    $('#attention').innerHTML = items.slice(0, 8).map((it, i) => `
      <div class="att"><div class="what"><b>${esc(it.a.title || 'Untitled')}${it.a.company ? ' — ' + esc(it.a.company) : ''}</b><span>${esc(it.text)}</span></div>
      <div class="btns">${it.action ? `<button class="btn small" data-nr="${it.a.id}">Mark as no response</button>` : ''}${it.fu ? `<button class="btn small primary" data-fu="${it.a.id}">Follow-up</button>` : ''}<button class="btn small" data-open="${it.a.id}">Open</button></div></div>`).join('');
    $$('#attention [data-open]').forEach(b => b.onclick = () => openDrawer(ovApps().find(a => a.id === b.dataset.open)));
    $$('#attention [data-fu]').forEach(b => b.onclick = () => openDrawer(ovApps().find(a => a.id === b.dataset.fu), { focusFollowUp: true }));
    $$('#attention [data-nr]').forEach(b => b.onclick = async () => { await S.updateApp(b.dataset.nr, { status: 'noresponse' }); });
  }

  // ---------- APPLICATIONS ----------
  function fillFilters() {
    const keep = id => $(id).value;
    const st = keep('#fStatus'), pl = keep('#fPlatform'), ca = keep('#fCategory');
    $('#fStatus').innerHTML = '<option value="">All statuses</option>' + A.STATUSES.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
    const plats = [...new Set(apps.map(a => a.platform).filter(Boolean))].sort();
    $('#fPlatform').innerHTML = '<option value="">All sources</option>' + plats.map(p => `<option>${esc(p)}</option>`).join('');
    const cats = [...new Set(apps.map(a => a.category).filter(Boolean))].sort();
    $('#fCategory').innerHTML = '<option value="">All role types</option>' + cats.map(p => `<option>${esc(p)}</option>`).join('');
    $('#fStatus').value = st; $('#fPlatform').value = pl; $('#fCategory').value = ca;
  }
  ['#fSearch', '#fTrack', '#fStatus', '#fPlatform', '#fCategory', '#fSort'].forEach(id => $(id).addEventListener('input', renderAppsRows));

  function renderApps() { fillFilters(); renderAppsRows(); }

  function renderAppsRows() {
    const qs = $('#fSearch').value.trim().toLowerCase();
    const st = $('#fStatus').value, pl = $('#fPlatform').value, ca = $('#fCategory').value, sort = $('#fSort').value;
    const tr = profile.showInternships ? $('#fTrack').value : 'job';
    let list = apps.filter(a => (!tr || trackOf(a) === tr) &&
      (!st || a.status === st) && (!pl || a.platform === pl) && (!ca || a.category === ca) &&
      (!qs || [a.title, a.company, a.location, a.notes, a.ticket].join(' ').toLowerCase().includes(qs)));
    const vr = a => (a.chance && a.chance.verdict in V_RANK ? V_RANK[a.chance.verdict] : 5);
    if (sort === 'chance') list.sort((x, y) => vr(x) - vr(y) || ((y.chance || {}).score || 0) - ((x.chance || {}).score || 0));
    else if (sort === 'salary') list.sort((x, y) => ((y.salary || {}).annualMax || 0) - ((x.salary || {}).annualMax || 0));
    else list.sort((x, y) => new Date(y.appliedAt) - new Date(x.appliedAt));

    const empty = $('#appsEmpty');
    empty.hidden = list.length > 0;
    empty.textContent = apps.length ? 'Nothing matches these filters.' : 'No applications yet. Open a job on LinkedIn, Indeed, Reed, Totaljobs or CV-Library and press Apply, and it appears here. Or add one with New application.';
    $('.table-wrap').hidden = !list.length;

    const stOpts = cur => A.STATUSES.map(s => `<option value="${s.id}" ${s.id === cur ? 'selected' : ''}>${esc(s.label)}</option>`).join('');
    const SHORT_CAT = { 'IT Help Desk / Service Desk': 'Service Desk', 'IT Technician / Field Support': 'IT Technician', 'Systems / Infrastructure': 'Infrastructure', 'Software Developer': 'Developer', 'Data / Analyst': 'Data', 'AI / Machine Learning': 'AI / ML', 'Cloud / DevOps': 'Cloud / DevOps' };
    $('#appsBody').innerHTML = list.map(a => `
      <tr data-id="${a.id}">
        <td><span class="ticket">${esc(a.ticket)}</span></td>
        <td class="nowrap">${fitPill(a.chance)}${a.dupOf ? ` <span class="tag" title="Looks like the same job as ${esc(a.dupOf)}">dup</span>` : ''}${trackOf(a) === 'intern' ? ' ' + plBadge(a.placement) : ''}</td>
        <td class="job"><b title="${esc(a.title)}">${trackOf(a) === 'intern' ? '<span class="trk">Internship</span>' : ''}${esc(a.title || 'Untitled')}</b><span title="${esc([a.company, a.location].filter(Boolean).join(' · '))}">${esc([a.company, a.location].filter(Boolean).join(' · '))}</span></td>
        <td><select class="st-select" data-st="${a.id}" aria-label="Status" style="background-image:radial-gradient(circle,${A.statusColor(a.status)} 60%,transparent 62%)">${stOpts(a.status)}</select></td>
        <td class="nowrap">${fmtDate(a.appliedAt)}</td>
        <td>${fmtSal(a)}</td>
        <td class="c-plat">${esc(a.platform || '—')}</td>
        <td class="c-type"><div class="tags">${(a.workTypes || []).slice(0, 2).map(w => `<span class="tag">${esc(w)}</span>`).join('') || '—'}${(a.workTypes || []).length > 2 ? `<span class="tag" title="${esc(a.workTypes.slice(2).join(', '))}">+${a.workTypes.length - 2}</span>` : ''}</div></td>
        <td class="c-cat nowrap">${esc(SHORT_CAT[a.category] || a.category || '—')}</td>
      </tr>`).join('');
    $$('#appsBody tr').forEach(tr => tr.onclick = e => { if (e.target.closest('select')) return; openDrawer(apps.find(a => a.id === tr.dataset.id)); });
    $$('#appsBody .st-select').forEach(s => { s.onclick = e => e.stopPropagation(); s.onchange = () => S.updateApp(s.dataset.st, { status: s.value }); });
  }

  // ---------- DRAWER ----------
  const V_COL = { apply: '#23905a', tailor: '#2f7fb5', ask: '#b47a12', skip: '#c0463b', incomplete: '#7a8794' };
  function ring(score, ch) {
    const unknown = ch && ch.verdict === 'incomplete';
    const r = 36, c = 2 * Math.PI * r, col = ch && ch.verdict ? V_COL[ch.verdict] : score >= 70 ? '#23905a' : score >= 50 ? '#b47a12' : '#c0463b';
    const label = ch ? A.display(ch).text : score + '%';
    return `<svg class="score-ring" viewBox="0 0 84 84" role="img" aria-label="Fit ${esc(label)}"><circle cx="42" cy="42" r="${r}" fill="none" stroke="#e3e9ef" stroke-width="8"/>
      ${unknown ? '' : `<circle cx="42" cy="42" r="${r}" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c * score / 100} ${c}" transform="rotate(-90 42 42)"/>`}
      <text x="42" y="48" text-anchor="middle" font-size="19" font-weight="700" fill="${col}">${esc(label)}</text></svg>`;
  }
  function gatesHtml(c) {
    const g = c.gates || { blocks: [], asks: [] };
    const q = c.quality && !c.quality.ok ? c.quality.issues.filter(i => i.hard) : [];
    if (!q.length && !g.blocks.length && !g.asks.length) return '';
    return `<ul class="aplist gates">${q.map(i => `<li><i style="color:#7a8794">?</i><span>${esc(i.text)}</span></li>`).join('')}${g.blocks.map(b => `<li><i style="color:#c0463b">✕</i><span>${esc(b.text)}</span></li>`).join('')}${g.asks.map(b => `<li><i style="color:#b47a12">!</i><span>${esc(b.text)}</span></li>`).join('')}</ul>`;
  }

  function analysisHtml(a) {
    if (!a.chance) return '<p class="empty">Paste the job description below and press Re-analyse.</p>';
    const c = a.chance;
    const d = A.display(c);
    const conf = c.verdict && c.verdict !== 'incomplete' ? ({ high: ' · confident', medium: ' · fairly sure', low: ' · rough guess' })[c.confidence] || '' : '';
    return `<div class="score-card">${ring(c.score, c)}<div style="flex:1"><b style="color:${c.verdict ? V_COL[c.verdict] : 'inherit'}">${esc(c.verdict ? d.label : 'Fit: ' + c.label)}</b><span class="hint">${esc(conf)}</span>${c.verdict ? `<div class="hint" style="margin:2px 0 0">${esc(c.verdict === 'incomplete' ? d.hint + ', or paste the description below and press Re-analyse' : d.hint)}</div>` : ''}
      ${gatesHtml(c)}
      <ul class="reasons">${(c.verdict === 'incomplete' ? [] : c.reasons).map(r => `<li><span>${esc(r.text)}</span><span class="d" style="color:${r.delta == null ? '#5a6b7d' : r.delta > 0 ? '#23905a' : r.delta < 0 ? '#c0463b' : '#5a6b7d'}">${r.delta == null ? 'base' : r.delta > 0 ? '+' + r.delta : r.delta === 0 ? 'tip' : r.delta}</span></li>`).join('')}</ul></div></div>
      <div class="tools">${c.matched.map(t => `<span class="t s">${esc(t)}</span>`).join('')}${c.basic.map(t => `<span class="t b">${esc(t)}</span>`).join('')}${c.missing.map(t => `<span class="t m">${esc(t)}</span>`).join('')}</div>
      ${c.missing.length ? `<p class="hint" style="margin:8px 0 0">Prepare for the interview: ${c.missing.map(esc).join(', ')}.</p>` : ''}`;
  }

  function benefitsHtml(a) {
    return (a.benefits || []).length ? `<ul class="details">${a.benefits.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="empty">None found in the description. You can add them to your notes.</p>';
  }
  // ---------- PLACEMENT RULES, ATS, CHECKLIST ----------
  function placementPanelHtml(a) {
    if (trackOf(a) !== 'intern') return '';
    const pl = a.placement || A.checkPlacement(a, profile);
    if (!pl) return `<h2>Placement rules</h2><p class="empty">Add your university's placement rules on the <a href="#intern">Internships</a> page and every internship is checked against them.</p>`;
    return `<div class="row-between"><h2>Placement rules</h2><span class="apb ap-${pl.verdict}">${esc(PL_HEAD[pl.verdict])}</span></div>
      <ul class="aplist">${pl.items.map(i => `<li><i style="color:${PL_ICON[i.state][1]}" aria-label="${i.state}">${PL_ICON[i.state][0]}</i><span><b>${esc(i.label)}</b><br>${esc(i.text)}</span></li>`).join('')}</ul>
      ${pl.items.some(i => i.state === 'unknown' || i.state === 'warn') ? '<p class="hint" style="margin:8px 0 0">Ask the employer about anything unclear before the interview. If in doubt, send the ad to your placement team to check it would be approved.</p>' : ''}`;
  }
  let cvsCache = null;
  async function getCvs() { if (!cvsCache) cvsCache = (await S.get('cvs')).cvs || {}; return cvsCache; }
  async function renderAtsPanel(a) {
    const box = $('#atsPanel'); if (!box) return;
    const t = trackOf(a), cv = (await getCvs())[t];
    box.hidden = false;
    if (!cv || !cv.text) { box.innerHTML = `<h2>ATS check</h2><p class="empty">Add your ${t === 'intern' ? 'internship' : 'job'} CV on the <a href="#cv">CV &amp; ATS</a> page to see how an applicant tracking system would match it to this ad.</p>`; return; }
    const m = JT_CV.jobMatch(cv.text, a, skillsFor(t));
    if (!m) { box.hidden = true; return; }
    const tagRow = (label, list, cls) => list.length ? `<div class="tools"><span class="hint" style="margin:0 6px 0 0">${label}</span>${list.map(x => `<span class="t ${cls}">${esc(x)}</span>`).join('')}</div>` : '';
    box.innerHTML = `<div class="row-between"><h2>ATS match with your CV</h2><span class="chance ${chanceClass(m.score)}">${m.score}%</span></div>
      <p class="hint" style="margin:0 0 8px">${esc(cv.name || 'Pasted text')}. An ATS looks for the ad's keywords in your CV.</p>
      ${tagRow('In your CV:', m.inCV, 's')}${tagRow('You have these, but your CV doesn\'t say so:', m.addable, 'b')}${tagRow('Not in your CV or skills:', m.missing, 'm')}
      ${m.titleWords.length && m.titleHit.length < m.titleWords.length ? `<p class="hint" style="margin:8px 0 0">Words from the job title missing from your CV: ${m.titleWords.filter(w => !m.titleHit.includes(w)).map(esc).join(', ')}. Use them in your summary if they are true.</p>` : ''}`;
  }
  const CHECK_ITEMS = [
    ['letter', 'Official offer letter'], ['company', 'Letter: company name and address'], ['me', 'Letter: your name and contact details'],
    ['role', 'Letter: job title, salary, on-site / hybrid / remote, benefits'], ['dates', 'Letter: start and end dates, working hours'],
    ['manager', 'Line manager contact details (email and phone)'], ['jd', 'Detailed job description: specific duties and skills'],
    ['days', 'Working days agreed with the employer'], ['submitted', 'Submitted to the university'], ['empRA', 'Employer completed their risk assessment'],
    ['myRA', 'You completed your risk assessment'], ['approved', 'Approved: you can start'],
  ];
  function checklistHtml(a) {
    const ck = a.placementChecklist || {}, done = CHECK_ITEMS.filter(([k]) => ck[k]).length;
    const next = (profile.intern.placement.deadlines || []).filter(d => d.date && daysTo(d.date) >= 0).sort((x, y) => x.date < y.date ? -1 : 1)[0];
    return `<div class="row-between"><h2>Placement paperwork</h2><span class="hint" style="margin:0">${done} of ${CHECK_ITEMS.length}${next ? ` · next: ${esc(next.label)}, ${longDate(next.date)}` : ''}</span></div>
      <div class="checklist">${CHECK_ITEMS.map(([k, l]) => `<label class="check"><input type="checkbox" data-k="${k}" ${ck[k] ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>`;
  }

  // ---------- CV + COVER LETTER PROMPT ----------
  // Builds a prompt for Claude or ChatGPT from this ad and your fact bank. Nothing is sent: it goes to the clipboard.
  function renderCvPrompt(a) {
    const box = $('#cvPanel'); if (!box || !window.JT_Prompt) return;
    const P = window.JT_Prompt;
    const v = a.chance && a.chance.verdict;
    const asks = P.wantsLetter(a.description);
    box.innerHTML = `
      <div class="row-between"><h2>CV for this job</h2><span class="hint" style="margin:0">${v === 'skip' ? 'Marked Skip: probably not worth tailoring' : asks ? 'The ad asks for a cover letter' : 'No cover letter asked for'}</span></div>
      <p class="hint">Your CV from the CV &amp; ATS page, reordered so this ad's tools come first, and a cover letter built from the same lines. Edit them, then download Word or PDF. Nothing is invented.</p>
      <div class="btns"><a class="btn primary" href="tailor.html?app=${encodeURIComponent(a.id)}" target="_blank">Tailor CV</a><a class="btn" href="tailor.html?app=${encodeURIComponent(a.id)}&tab=letter" target="_blank">Cover letter</a></div>
      <details class="howto" style="margin-top:12px"><summary>Or rewrite it with an AI chat (prompt to copy)</summary>
        <div class="form-grid" style="margin-top:8px">
          <label class="full">Why this employer, in your own words (needed for a letter)<textarea id="cvWhy" rows="2" placeholder="e.g. You support three NHS trusts, and I want my first IT job to be one where the fix matters to someone's day.">${esc(a.whyThem || '')}</textarea></label>
          <label class="check"><input type="checkbox" id="cvLetter" ${asks ? 'checked' : ''}> Also write a cover letter</label>
        </div>
        <div class="btns" style="margin-top:10px"><button class="btn" id="cvCopy">Copy prompt</button></div>
      </details>
      <p class="msg" id="cvMsg" role="status"></p>`;
    $('#cvWhy').onchange = async () => { a.whyThem = $('#cvWhy').value.trim(); await S.updateApp(a.id, { whyThem: a.whyThem }); };
    $('#cvCopy').onclick = async () => {
      const cvText = ((await getCvs())[trackOf(a) === 'intern' ? 'intern' : 'job'] || {}).text || '';
      const r = P.build(a, profile, { why: $('#cvWhy').value, letter: $('#cvLetter').checked, cvText });
      if (!r.ok) { $('#cvMsg').textContent = r.error; return; }
      try { await navigator.clipboard.writeText(r.text); $('#cvMsg').textContent = 'Copied. Paste it into Claude or ChatGPT. When you send the tailored CV, set "CV tailored to this ad" to Yes below.'; }
      catch (e) { $('#cvMsg').textContent = 'Could not copy: the browser blocked the clipboard. Try again after clicking on the page.'; }
    };
  }

  // ---------- FOLLOW-UPS VIEW ----------
  // Everything waiting for a reply in one list: who to write to, where to find them, one button to write
  function contactChips(a, list) {
    return JT_Extract.cleanContacts(list).map(c => {
      const label = esc(c.name ? c.name : c.value);
      if (c.type === 'linkedin') return `<a class="fu-c fu-link" href="${esc(c.value)}" target="_blank" rel="noopener"><b>in</b> ${label}</a>`;
      if (c.type === 'email') return `<span class="fu-c"><b>✉</b> ${esc(c.value)}</span>`;
      return `<a class="fu-c fu-link" href="tel:${esc(String(c.value).replace(/\s/g, ''))}"><b>☎</b> ${esc(c.name ? c.name + ' · ' : '')}${esc(c.value)}</a>`;
    }).join('');
  }
  function findLinks(a) {
    const F = JT_Follow, co = a.company || '';
    if (!co) return '<span class="hint" style="margin:0">Add the company name to search for contacts.</span>';
    const agency = F.isAgency(a);
    return [
      `<a class="btn small" href="${esc(F.links.linkedinPeople(co, agency ? 'IT recruitment consultant' : 'talent acquisition'))}" target="_blank" rel="noopener">${agency ? 'Agency consultants' : 'Recruiters'} on LinkedIn</a>`,
      agency ? '' : `<a class="btn small" href="${esc(F.links.linkedinPeople(co, 'IT manager'))}" target="_blank" rel="noopener">IT manager on LinkedIn</a>`,
      `<a class="btn small" href="${esc(F.links.googleEmail(co))}" target="_blank" rel="noopener">Careers email (Google)</a>`,
    ].join('');
  }
  function renderFollowups() {
    const F = JT_Follow;
    const q = F.queue(ovApps());
    const missing = [!profile.signName && 'your name', !profile.signPhone && 'phone', !profile.pitch && 'a short pitch', !profile.highlights && 'one or two sentences about you'].filter(Boolean);
    $('#fuSetup').innerHTML = missing.length ? `<div class="panel fu-setup"><b>Fill in once so every message is signed and says who you are:</b> ${esc(missing.join(', '))}. <a href="#settings" class="btn small primary" style="margin-left:8px">Open settings</a></div>` : '';
    const fresh = q.due.filter(x => !x.late);
    $('#fuDueN').textContent = q.due.length ? `${fresh.length} fresh · ${q.due.length - fresh.length} older · ${q.due.filter(x => x.contacts.length).length} with a contact` : '';
    const ago = a => { const d = daysSince(a.appliedAt); return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
    const head = (a, extra) => `<div class="what"><b>${a.ticket ? `<span class="ticket">${esc(a.ticket)}</span> ` : ''}${esc(a.title || 'Untitled')}${a.company ? ' — ' + esc(a.company) : ''}</b><span>${F.isAgency(a) ? 'Agency' : 'Employer'} · applied ${ago(a)}${extra ? ' · ' + extra : ''}</span></div>`;
    $('#fuDue').innerHTML = q.due.length ? q.due.map(({ a, n, contacts, late }, i) => `
      ${late && (i === 0 || !q.due[i - 1].late) ? '<h3 class="sub3">Over two weeks old: one short check-in at most, newer applications come first</h3>' : ''}
      <div class="fu-card">
        <div class="row-between">${head(a, n ? 'second follow-up' : 'first follow-up')}
          <div class="btns"><button class="btn small primary" data-fu="${a.id}">Write follow-up</button><button class="btn small" data-nr="${a.id}" title="Closed or not worth chasing">No response</button></div></div>
        <div class="fu-who">${contacts.length ? `<span class="fu-lbl">Write to:</span>${contactChips(a, contacts)}` : `<span class="fu-lbl">No contact in the ad. Find one:</span>${findLinks(a)}`}</div>
      </div>`).join('') : '<p class="empty">Nothing to send today. Applications show up here 4 working days after you apply.</p>';
    $('#fuSoon').innerHTML = q.soon.length ? q.soon.slice(0, 25).map(({ a, n, inDays, contacts }) => `
      <div class="att">${head(a, `${n ? 'second' : 'first'} follow-up in ${inDays} working day${inDays === 1 ? '' : 's'}${contacts.length ? ` · ${contacts.length} contact${contacts.length === 1 ? '' : 's'}` : ''}`)}
      <div class="btns"><button class="btn small" data-open="${a.id}">Open</button></div></div>`).join('') + (q.soon.length > 25 ? `<p class="empty">and ${q.soon.length - 25} more</p>` : '') : '<p class="empty">Nothing coming up.</p>';
    $('#fuDone').innerHTML = q.done.length ? q.done.map(({ a, days }) => `
      <div class="att">${head(a, `last message ${days} day${days === 1 ? '' : 's'} ago`)}
      <div class="btns">${days >= 7 ? `<button class="btn small" data-nr="${a.id}">Mark as no response</button>` : ''}<button class="btn small" data-open="${a.id}">Open</button></div></div>`).join('') : '<p class="empty">None yet.</p>';
    const find = id => apps.find(a => a.id === id);
    $$('#view-followups [data-fu]').forEach(b => b.onclick = () => openDrawer(find(b.dataset.fu), { focusFollowUp: true }));
    $$('#view-followups [data-open]').forEach(b => b.onclick = () => openDrawer(find(b.dataset.open)));
    $$('#view-followups [data-nr]').forEach(b => b.onclick = async () => { await S.updateApp(b.dataset.nr, { status: 'noresponse' }); });
  }

  // ---------- FOLLOW-UP ----------
  const TYPE_ICON = { email: '✉', phone: '☎', linkedin: 'in', name: '👤' };
  function renderFollowUp(a) {
    const F = globalThis.JT_Follow;
    const box = $('#fuPanel');
    if (!box || !F) return;
    const contacts = JT_Extract.cleanContacts(a.contacts || []);
    const fu = a.followUps || [];
    const agency = F.isAgency(a);
    let channel = box.dataset.channel || (contacts.some(c => c.type === 'email') ? 'email' : contacts.some(c => c.type === 'linkedin') ? 'linkedin' : agency && contacts.some(c => c.type === 'phone') ? 'call' : 'email');
    const forChannel = ch => contacts.filter(c => ch === 'email' ? c.type === 'email' : ch === 'linkedin' ? c.type === 'linkedin' : ch === 'call' ? c.type === 'phone' : false);
    const options = forChannel(channel);
    const sel = options[+box.dataset.to || 0] || options[0] || contacts.find(c => c.name) || null;
    const msg = F.build(a, channel, sel, profile);
    box.innerHTML = `
      <div class="row-between"><h2>Follow-up</h2><span class="hint" style="margin:0">${agency ? 'Agency' : 'Employer'} · sent: ${fu.length}${fu.length ? `, last on ${fmtDate(fu[fu.length - 1].at)}` : ''}</span></div>
      <div class="fu-contacts">${contacts.length ? contacts.map((c, i) => `<span class="fu-c" title="${esc(c.source || '')}"><b>${TYPE_ICON[c.type] || '•'}</b> ${esc(c.name && c.type !== 'name' ? c.name + ' · ' : '')}${esc(c.type === 'linkedin' ? 'LinkedIn' : c.value)}<button data-rm="${i}" aria-label="Remove contact">×</button></span>`).join('') : `<p class="empty" style="margin:0 0 6px">No contacts found in the ad. Find the recruiter or hiring manager and add them below (paste a LinkedIn profile link or an email):</p><div class="btns">${findLinks(a)}</div>`}</div>
      <div class="fu-add">
        <select id="fuType" aria-label="Contact type"><option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="phone">Phone</option><option value="name">Name only</option></select>
        <input type="text" id="fuVal" placeholder="email, link or phone" aria-label="Contact">
        <input type="text" id="fuName" placeholder="Name (optional)" aria-label="Name">
        <button class="btn small" id="fuAdd">Add</button>
      </div>
      <div class="seg fu-seg" role="group" aria-label="Channel">
        ${[['email', 'Email'], ['linkedin', 'LinkedIn'], ['call', 'Call']].map(([k, l]) => `<button data-ch="${k}" aria-pressed="${k === channel}">${l}</button>`).join('')}
      </div>
      ${options.length > 1 ? `<label>To<select id="fuTo">${options.map((c, i) => `<option value="${i}" ${c === sel ? 'selected' : ''}>${esc((c.name ? c.name + ' — ' : '') + (c.type === 'linkedin' ? 'LinkedIn' : c.value))}</option>`).join('')}</select></label>` : ''}
      ${channel === 'email' ? `<label>Subject<input type="text" id="fuSubj" value="${esc(msg.subject)}"></label>` : ''}
      <label>${channel === 'call' ? 'What to say on the phone' : 'Message'}<textarea id="fuBody" rows="${channel === 'linkedin' ? 5 : 11}">${esc(msg.body)}</textarea></label>
      ${channel === 'linkedin' ? '<p class="hint" style="margin:4px 0 0" id="fuLen"></p>' : ''}
      <div class="btns" style="margin-top:10px">
        ${channel === 'email' ? `<button class="btn primary" id="fuSend">${profile.mailClient === 'outlook' ? 'Open in Outlook' : profile.mailClient === 'mailto' ? 'Open in mail app' : 'Open in Gmail'}</button>` : ''}
        ${channel === 'linkedin' ? `<button class="btn primary" id="fuLi">${sel ? 'Copy and open profile' : 'Copy and find a recruiter'}</button>` : ''}
        ${channel === 'call' && sel ? `<a class="btn primary" href="tel:${esc(sel.value.replace(/\s/g, ''))}">Call ${esc(sel.value)}</a>` : ''}
        <button class="btn" id="fuCopy">Copy text</button>
        <button class="btn" id="fuDone">Mark as sent</button>
      </div>
      <p class="msg" id="fuMsg" role="status"></p>
      ${fu.length ? `<ul class="timeline" style="margin-top:10px">${fu.map(f => `<li style="--c:#1f6fa8">Follow-up · ${esc({ email: 'Email', linkedin: 'LinkedIn', call: 'Call' }[f.channel] || f.channel)}${f.to ? ' · ' + esc(f.to) : ''}<span>${fmtDate(f.at)}</span></li>`).join('')}</ul>` : ''}`;

    const saveContacts = async list => { a.contacts = list; await S.updateApp(a.id, { contacts: list }); apps = await S.getApps(); renderFollowUp(a); };
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => saveContacts(contacts.filter((_, i) => i !== +b.dataset.rm)));
    $('#fuAdd').onclick = () => {
      const type = $('#fuType').value, value = $('#fuVal').value.trim(), name = $('#fuName').value.trim();
      if (!value && !name) return;
      saveContacts(contacts.concat([{ type, value: value || name, name, source: 'added manually' }]));
    };
    box.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { box.dataset.channel = b.dataset.ch; box.dataset.to = 0; renderFollowUp(a); });
    if ($('#fuTo')) $('#fuTo').onchange = () => { box.dataset.to = $('#fuTo').value; renderFollowUp(a); };
    const body = () => $('#fuBody').value, subj = () => ($('#fuSubj') ? $('#fuSubj').value : '');
    const say = t => { $('#fuMsg').textContent = t; };
    const copy = async () => { try { await navigator.clipboard.writeText(body()); return true; } catch (e) { $('#fuBody').select(); document.execCommand('copy'); return true; } };
    const upd = () => {
      if (!$('#fuLen')) return;
      const n = body().length, lim = F.LI_LIMIT;
      $('#fuLen').textContent = n > lim ? `${n} / ${lim}: too long for a connection note. If you are already connected, send it as a normal message.` : `${n} / ${lim} characters: fits in a connection note.`;
      $('#fuLen').style.color = n > lim ? '#8f2f26' : '';
    };
    $('#fuBody').oninput = upd; upd();
    $('#fuCopy').onclick = async () => { await copy(); say('Copied.'); };
    if ($('#fuSend')) $('#fuSend').onclick = () => {
      const to = sel && sel.type === 'email' ? sel.value : '';
      const url = (F.links[profile.mailClient] || F.links.gmail)(to, subj(), body());
      window.open(url, '_blank');
      say(to ? 'Email opened. Check it, press Send, then mark it as sent here.' : 'No address yet: add the recipient in the email. After sending, mark it as sent here.');
    };
    if ($('#fuLi')) $('#fuLi').onclick = async () => {
      await copy();
      window.open(sel ? sel.value : F.links.linkedinSearch(a.company), '_blank');
      say(sel ? 'Copied. On LinkedIn press Connect → Add a note, or Message, and paste (Ctrl+V).' : 'Copied. Find the company\'s recruiter in the results, add them to this list and send the message.');
    };
    $('#fuDone').onclick = async () => {
      const list = (a.followUps || []).concat([{ at: new Date().toISOString(), channel, to: sel ? (sel.name || sel.value) : '' }]);
      const next = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
      a.followUps = list;
      await S.updateApp(a.id, { followUps: list, nextDate: list.length < 2 ? next : (a.nextDate || '') });
      apps = await S.getApps();
      if ($('#dNext') && list.length < 2) $('#dNext').value = next;
      renderFollowUp(a);
      $('#fuMsg').textContent = list.length < 2 ? 'Marked. You\'ll be reminded about a second follow-up in a week.' : 'Marked. If there is still no reply, set the status to No response.';
    };
  }

  function detailsHtml(a) {
    return (a.details || []).length ? `<ul class="details">${a.details.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="empty">Nothing yet. Appears once the description is analysed.</p>';
  }

  function openDrawer(app, opts = {}) {
    const isNew = !app;
    const a = app ? JSON.parse(JSON.stringify(app)) : {
      track: opts.track || 'job',
      title: '', company: '', location: '', url: '', platform: 'LinkedIn', category: 'Other',
      workTypes: [], salaryText: '', status: 'applied', appliedAt: new Date().toISOString(), notes: '', nextDate: '', description: '', history: [], details: [], tools: [], chance: null,
    };
    current = a;
    const opt = (list, cur) => list.map(v => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
    const plats = S.PLATFORMS.includes(a.platform) || !a.platform ? S.PLATFORMS : [a.platform].concat(S.PLATFORMS);
    const d = $('#drawer');
    d.innerHTML = `
      <div class="dr-head">${a.ticket ? `<span class="ticket">${esc(a.ticket)}</span>` : ''}<h2>${isNew ? 'New application' : esc(a.title || 'Untitled')}</h2><button class="x" aria-label="Close">×</button></div>
      <div class="dr-body">
        <div class="panel"><h2>Fit against your skills</h2><div id="anBox">${analysisHtml(a)}</div></div>
        <div class="panel" id="plPanel"${trackOf(a) === 'intern' ? '' : ' hidden'}>${placementPanelHtml(a)}</div>
        <div class="panel" id="atsPanel" hidden></div>
        ${!isNew && trackOf(a) === 'intern' && S.everReached(a, A.OFFER) ? `<div class="panel" id="ckPanel">${checklistHtml(a)}</div>` : ''}
        ${!isNew ? '<div class="panel" id="cvPanel"></div>' : ''}
        ${!isNew ? '<div class="panel" id="fuPanel"></div>' : ''}
        <div class="panel"><h2>Job</h2>
          <div class="form-grid">
            <label class="full">Job title<input type="text" id="dTitle" value="${esc(a.title)}"></label>
            <label>Application type<select id="dTrack"><option value="job" ${trackOf(a) === 'job' ? 'selected' : ''}>Job</option><option value="intern" ${trackOf(a) === 'intern' ? 'selected' : ''}>Internship / placement</option></select></label>
            <label>Company<input type="text" id="dCompany" value="${esc(a.company)}"></label>
            <label>Location<input type="text" id="dLocation" value="${esc(a.location)}"></label>
            <label>Status<select id="dStatus">${A.STATUSES.map(s => `<option value="${s.id}" ${s.id === a.status ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
            <label>Source<select id="dPlatform">${opt(plats, a.platform)}</select></label>
            <label>Role type<select id="dCategory">${opt(A.CATEGORY_NAMES, a.category)}</select></label>
            <label>Salary<input type="text" id="dSalary" value="${esc(a.salaryText || (a.salary && a.salary.text) || '')}" placeholder="£26,000 - £28,000 per annum"></label>
            <label>Applied on<input type="date" id="dApplied" value="${toDateInput(a.appliedAt)}"></label>
            <label>Next step (date)<input type="date" id="dNext" value="${esc(a.nextDate || '')}"></label>
            <label class="full">Link<input type="url" id="dUrl" value="${esc(a.url)}" placeholder="https://"></label>
            <div class="full"><label>Work type</label><div class="chips" id="dWt">${A.WORK_TYPES.map(w => `<button type="button" class="chip" aria-pressed="${(a.workTypes || []).includes(w)}" data-v="${esc(w)}">${esc(w)}</button>`).join('')}</div></div>
            <label class="full">Notes<textarea id="dNotes" rows="8" placeholder="Recruiter contact, interview questions, what to prepare">${esc(a.notes)}</textarea></label>
          </div>
          ${a.url ? `<p style="margin:10px 0 0"><a href="${esc(a.url)}" target="_blank" rel="noopener">Open job ad</a></p>` : ''}
        </div>
        ${applyPanelHtml(a)}
        <div class="panel"><h2>Benefits</h2><div id="benBox">${benefitsHtml(a)}</div></div>
        <div class="panel"><h2>Key details</h2><div id="detBox">${detailsHtml(a)}</div></div>
        <div class="panel"><div class="row-between"><h2>Job description</h2><button class="btn small" id="dReanalyze">Re-analyse</button></div>
          <textarea id="dDesc" rows="8" placeholder="Paste the job ad here if it was not captured automatically">${esc(a.description)}</textarea>
        </div>
        ${!isNew ? `<div class="panel"><h2>History</h2><ul class="timeline">${(a.history || []).map(h => `<li style="--c:${A.statusColor(h.status)}">${esc(A.statusLabel(h.status))}<span>${fmtDate(h.at)}</span></li>`).join('')}</ul></div>` : ''}
      </div>
      <div class="dr-foot">
        <div class="btns">${!isNew ? '<button class="btn danger" id="dDelete">Delete</button>' : ''}${!isNew && S.everReached(a, A.OFFER) ? '<button class="btn" id="dOffer">Compare offers</button>' : ''}</div>
        <div class="btns"><button class="btn" id="dCancel">Close</button><button class="btn primary" id="dSave">${isNew ? 'Add application' : 'Save'}</button></div>
      </div>`;
    d.hidden = false; $('#scrim').hidden = false;
    renderAtsPanel(a);
    $('#dTrack').onchange = () => $('#dReanalyze').click();
    const bindChecklist = () => $$('#ckPanel input[type=checkbox]').forEach(cb => cb.onchange = async () => {
      a.placementChecklist = { ...(a.placementChecklist || {}), [cb.dataset.k]: cb.checked };
      await S.updateApp(a.id, { placementChecklist: a.placementChecklist }); apps = await S.getApps();
      $('#ckPanel').innerHTML = checklistHtml(a); bindChecklist();
    });
    if ($('#ckPanel')) bindChecklist();
    if (!isNew) { renderFollowUp(a); renderCvPrompt(a); }
    if (opts.focusFollowUp && $('#fuPanel')) { $('#fuPanel').scrollIntoView({ block: 'start' }); $('#fuBody') && $('#fuBody').focus(); }
    else $('#dTitle').focus();

    $$('#dWt .chip').forEach(ch => ch.onclick = () => ch.setAttribute('aria-pressed', ch.getAttribute('aria-pressed') !== 'true'));
    const showOutcome = () => { const st = $('#dStatus').value; $('#dOutcome').hidden = st !== 'rejected'; };
    $('#dStatus').addEventListener('change', showOutcome); showOutcome();
    const close = () => { d.hidden = true; $('#scrim').hidden = true; current = null; if (location.hash.startsWith('#app=')) history.replaceState(null, '', '#apps'); };
    d.querySelector('.x').onclick = close; $('#dCancel').onclick = close; $('#scrim').onclick = close;
    d.onkeydown = e => { if (e.key === 'Escape') close(); };

    const collect = () => {
      const salaryText = $('#dSalary').value.trim();
      const applied = $('#dApplied').value;
      return {
        title: $('#dTitle').value.trim(), company: $('#dCompany').value.trim(), location: $('#dLocation').value.trim(),
        status: $('#dStatus').value, platform: $('#dPlatform').value, category: $('#dCategory').value, track: $('#dTrack').value,
        salaryText, salary: A.parseSalary(salaryText) || (salaryText ? { text: salaryText } : null),
        appliedAt: applied ? new Date(applied + 'T12:00:00').toISOString() : new Date().toISOString(),
        nextDate: $('#dNext').value, url: $('#dUrl').value.trim(),
        workTypes: $$('#dWt .chip[aria-pressed=true]').map(c => c.dataset.v),
        notes: $('#dNotes').value, description: $('#dDesc').value,
        ...collectApply(a, $('#dStatus').value),
      };
    };

    $('#dReanalyze').onclick = () => {
      const f = collect();
      const an = A.analyze({ title: f.title, description: f.description, location: f.location, workTypes: [], category: '', track: f.track, salaryText: f.salaryText }, profile);
      Object.assign(a, { chance: an.chance, tools: an.chance.tools, details: an.details, benefits: an.benefits, placement: an.placement, track: f.track, title: f.title, description: f.description });
      $('#plPanel').hidden = f.track !== 'intern'; $('#plPanel').innerHTML = placementPanelHtml(a); renderAtsPanel(a);
      $('#anBox').innerHTML = analysisHtml(a);
      $('#detBox').innerHTML = detailsHtml(a);
      $('#benBox').innerHTML = benefitsHtml(a);
      if (!$('#dNotes').value.trim() && an.notes) $('#dNotes').value = an.notes;
      if (!f.workTypes.length) $$('#dWt .chip').forEach(c => c.setAttribute('aria-pressed', an.workTypes.includes(c.dataset.v)));
      if (!f.salaryText && an.salary) $('#dSalary').value = an.salary.text;
      if (an.category !== 'Other') $('#dCategory').value = an.category;
      a.analyzedDesc = f.description;
    };

    $('#dSave').onclick = async () => {
      const f = collect();
      let extra = {};
      const descChanged = f.description !== (a.analyzedDesc != null ? a.analyzedDesc : (app ? app.description : ''));
      const trackChanged = !app || f.track !== app.track;
      if ((f.description || f.title) && (descChanged || !a.chance || trackChanged)) {
        const an = A.analyze({ title: f.title, description: f.description, location: f.location, workTypes: f.workTypes, category: f.category, track: f.track, salaryText: f.salaryText }, profile);
        extra = { chance: an.chance, tools: an.chance.tools, details: an.details, benefits: an.benefits, placement: an.placement, reqs: I.requirements(f.description) };
        if (!f.notes.trim() && an.notes) extra.notes = an.notes;
      } else if (a.chance) extra = { chance: a.chance, tools: a.tools, details: a.details, benefits: a.benefits || [], placement: a.placement || null };
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
      if (!confirm(`Delete ${a.ticket}? This can't be undone.`)) return;
      await S.deleteApp(a.id); close();
    };
    if ($('#dOffer')) $('#dOffer').onclick = () => { close(); location.hash = '#offers'; };

  }

  // ---------- How you applied and how it ended (JT_Insights) ----------
  const numOrNull = v => (v === '' || v == null || isNaN(+v) ? null : +v);
  function applyPanelHtml(a) {
    const ap = a.apply || {}, po = a.posting || {}, oc = a.outcome || {};
    const sel = (id, list, cur) => `<select id="${id}">${list.map(x => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>`;
    const reqs = a.reqs || I.requirements(a.description) || [];
    const guess = I.outcomeType({ ...a, status: 'rejected', outcome: null }, S.everReached(a, A.INTERVIEW));
    const dr = I.daysToRejection(a);
    return `<div class="panel"><h2>How you applied</h2>
      <p class="hint">Fill these in for every application: after 20–30 of them the overview shows which way of applying gets replies.</p>
      <div class="form-grid">
        <label>Method${sel('dMethod', I.METHODS, ap.method || 'unknown')}</label>
        <label>Cover letter${sel('dCover', I.COVERS, ap.cover || 'unknown')}</label>
        <label class="full">CV sent<input type="text" id="dCv" value="${esc(ap.cv || '')}" placeholder="File name or version, e.g. CV IT Support v2"></label>
        <label>CV tailored to this ad<select id="dCvT"><option value="" ${ap.cvTailored == null ? 'selected' : ''}>Not recorded</option><option value="yes" ${ap.cvTailored === true ? 'selected' : ''}>Yes</option><option value="no" ${ap.cvTailored === false ? 'selected' : ''}>No, the usual CV</option></select></label>
        <label>Ad age when you applied, days<input type="number" min="0" id="dPosted" value="${po.daysAgo == null ? '' : po.daysAgo}"></label>
        <label>Applicants before you<input type="number" min="0" id="dApplicants" value="${po.applicants == null ? '' : po.applicants}" placeholder="LinkedIn shows it"></label>
        <label class="full">Screening questions they asked<input type="text" id="dScreen" value="${esc(ap.screening || '')}" placeholder="e.g. years of experience, right to work, salary, notice"></label>
      </div>
      ${reqs.length ? `<p class="hint" style="margin:10px 0 0">The ad demands: <b>${reqs.map(id => esc((I.REQS.find(r => r.id === id) || {}).label || id)).join(' · ')}</b></p>` : ''}
      <div id="dOutcome" hidden style="margin-top:12px">
        <h2>Why it was a no</h2>
        <div class="form-grid">
          <label>When<select id="dOcType"><option value="">${esc(guess ? 'Guess: ' + I.label(I.OUTCOMES, guess) : 'Not sure')}</option>${I.OUTCOMES.map(x => `<option value="${x.id}" ${x.id === oc.type && !oc.guess ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
          <label>Reason they gave${sel('dOcReason', I.REASONS, oc.reason || '')}</label>
          <label class="full">What they wrote (paste the key line)<textarea id="dOcText" rows="3" placeholder="'…we have decided to progress with candidates whose experience more closely matches…'">${esc(oc.text || '')}</textarea></label>
        </div>
        ${dr != null ? `<p class="hint" style="margin:6px 0 0">The reply came ${dr} day${dr === 1 ? '' : 's'} after you applied${dr <= 3 ? ': too fast for a person to have read it closely, so it was a CV screen or an automatic filter.' : '.'}</p>` : ''}
      </div>
    </div>`;
  }
  function collectApply(a, status) {
    if (!$('#dMethod')) return {};
    const out = {
      apply: { ...(a.apply || {}), method: $('#dMethod').value, cover: $('#dCover').value, cv: $('#dCv').value.trim(), cvTailored: { yes: true, no: false }[$('#dCvT').value], screening: $('#dScreen').value.trim() },
      posting: { ...(a.posting || {}), daysAgo: numOrNull($('#dPosted').value), applicants: numOrNull($('#dApplicants').value) },
    };
    if (out.posting.daysAgo == null && out.posting.applicants == null && !a.posting) out.posting = null;
    if (status === 'rejected') {
      const type = $('#dOcType').value, reason = $('#dOcReason').value, text = $('#dOcText').value.trim();
      out.outcome = { ...(a.outcome || {}), type: type || '', reason, text, at: (a.outcome && a.outcome.at) || I.rejectedAt(a) || new Date().toISOString() };
      if (!type) delete out.outcome.type;
    }
    return out;
  }

  // ---------- OFFERS ----------
  const OFFER_FIELDS = [
    { sec: 'Money' },
    { k: 'salary', l: 'Salary, £/year (before tax)', t: 'number', better: 'max' },
    { k: 'pension', l: 'Employer pension, %', t: 'number', better: 'max' },
    { k: 'bonus', l: 'Bonus, £/year', t: 'number', better: 'max' },
    { sec: 'Time and commute' },
    { k: 'hours', l: 'Hours per week', t: 'number', better: 'min' },
    { k: 'days', l: 'Days per week', t: 'number', better: 'min' },
    { k: 'mode', l: 'Working pattern', t: 'select', opts: ['Office', 'Hybrid', 'Remote'] },
    { k: 'officeDays', l: 'Office days per week', t: 'number', better: 'min' },
    { k: 'commuteMin', l: 'Commute one way, min', t: 'number', better: 'min' },
    { k: 'commuteCost', l: 'Commute cost, £/month', t: 'number', better: 'min' },
    { k: 'holiday', l: 'Annual leave, days', t: 'number', better: 'max' },
    { sec: 'Growth and terms' },
    { k: 'training', l: 'Training / certifications, £/year', t: 'number', better: 'max' },
    { k: 'contract', l: 'Contract', t: 'select', opts: ['Permanent', 'Fixed-term', 'Contract', 'Temporary'] },
    { k: 'start', l: 'Start date', t: 'date' },
    { k: 'deadline', l: 'Reply by', t: 'date' },
    { k: 'benefits', l: 'Benefits', t: 'textarea' },
    { k: 'pros', l: 'Pros', t: 'textarea' },
    { k: 'cons', l: 'Cons', t: 'textarea' },
    { k: 'gut', l: 'Gut feeling about the team, 1–5', t: 'number', better: 'max' },
  ];
  const WEIGHTS_DEFAULT = { money: 5, balance: 4, flex: 3, growth: 3, gut: 3 };
  const WEIGHT_LABELS = { money: 'Money', balance: 'Time and commute', flex: 'Flexible hours', growth: 'Learning and growth', gut: 'Feeling about the company' };

  function offerCalc(o) {
    const salary = +o.salary || 0, hours = +o.hours || 37.5;
    const officeDays = o.mode === 'Remote' ? 0 : (o.officeDays !== '' && o.officeDays != null ? +o.officeDays : (+o.days || 5));
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
      wrap.innerHTML = `<p class="empty-state">No offers yet. When you set an application to Offer it appears here, and you can compare pay, commute, flexibility and training side by side.</p>`;
      return;
    }
    const { offerWeights } = await S.get('offerWeights');
    const w = { ...WEIGHTS_DEFAULT, ...(offerWeights || {}) };
    const offers = list.map(a => ({ a, o: { mode: 'Hybrid', contract: 'Permanent', hours: profile.hoursPerWeek || '', days: profile.daysPerWeek || '', salary: (a.salary && a.salary.annualMin) || '', benefits: (a.benefits || []).join('\n'), ...(a.offer || {}) } }));
    const calcs = offers.map(x => offerCalc(x.o));

    // normalise to 0..1
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
      let s = { Remote: 1, Hybrid: 0.6, Office: 0.2 }[o.mode] ?? 0.5;
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
    rows += `<tr class="sec"><th colspan="${offers.length + 1}">Calculated</th></tr>`;
    rows += calcRow('Hourly rate', calcs.map(c => c.hourly), 'max', v => '£' + v.toFixed(2));
    rows += calcRow('Monthly minus commute (before tax)', calcs.map(c => c.monthly), 'max', money);
    rows += calcRow('Weekly hours including commute', calcs.map(c => c.weekTotal), 'min', v => v.toFixed(1));
    rows += calcRow('Effective hourly rate with commute', calcs.map(c => c.effHourly), 'max', v => '£' + v.toFixed(2));
    rows += `<tr class="total"><th>Score by your priorities</th>${scores.map((s, i) => `<td class="${i === bestIdx && offers.length > 1 ? 'best' : ''}">${s} / 100</td>`).join('')}</tr>`;

    wrap.innerHTML = `
      <div class="panel"><h2>What matters to you</h2><p class="hint">Move the sliders and the score updates. 0 means not important, 10 very important.</p>
        <div class="weights">${Object.keys(WEIGHT_LABELS).map(k => `<label>${WEIGHT_LABELS[k]} <output id="wo-${k}">${w[k]}</output><input type="range" min="0" max="10" value="${w[k]}" data-w="${k}"></label>`).join('')}</div>
        ${offers.length > 1 ? `<p class="winner" style="margin-top:14px">Leading now: <b>${esc(offers[bestIdx].a.company || offers[bestIdx].a.title)}</b>, ${scores[bestIdx]} out of 100.</p>` : '<p class="hint" style="margin:14px 0 0">The comparison starts once you have two or more offers. You can fill in the terms now.</p>'}
      </div>
      <div class="offers-table-wrap"><table class="offers">
        <thead><tr><th>Terms</th>${offers.map(({ a }) => `<th>${esc(a.company || 'Company')}<small>${esc(a.title)} · ${esc(A.statusLabel(a.status))}</small></th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="hint">Green marks the best value in each row. Figures are before tax and approximate: they compare the offers with each other, not your exact take-home pay.</p>`;

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

  // ---------- SKILLS AND SETTINGS ----------
  function renderSettings() {
    $('#pDays').value = profile.daysPerWeek; $('#pHours').value = profile.hoursPerWeek;
    $('#pExp').value = profile.experienceYears == null ? 1 : profile.experienceYears;
    $('#pComm').value = profile.commercialYears == null ? '' : profile.commercialYears;
    $('#pDaily').value = profile.dailyLimit || 5;
    $('#pIntern').checked = !!profile.showInternships;
    $('#pFacts').value = profile.factBank || '';
    $('#pLicence').checked = !!profile.hasDrivingLicence; $('#pRtw').checked = !!profile.timeLimitedRtw; $('#pLangs').value = (profile.languages || []).join(', ');
    $('#pAuto').checked = profile.autoDetect !== false;
    $('#pStale').value = profile.autoNoResponseDays == null ? 30 : profile.autoNoResponseDays;
    $('#pCover').innerHTML = I.COVERS.filter(c => c.id !== 'unknown').map(c => `<option value="${c.id}" ${c.id === ((profile.applyDefaults && profile.applyDefaults.cover) || 'none') ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
    $('#pPreview').checked = profile.showPreview !== false;
    $('#pSched').checked = !!profile.penalizeSchedule;
    $('#pList').checked = profile.listScan !== false;
    $('#pSignName').value = profile.signName || ''; $('#pSignPhone').value = profile.signPhone || '';
    $('#pSignLi').value = profile.signLinkedIn || ''; $('#pMail').value = profile.mailClient || 'gmail';
    $('#pPitch').value = profile.pitch || ''; $('#pHighlights').value = profile.highlights || '';
    $('#pAreas').value = (profile.areas || []).join(', ');
    $('#pHome').value = profile.home || ''; $('#pHome').placeholder = (A.homeOf(profile) || {}).name || "Bishop's Stortford";
    $('#pCommute').value = profile.maxCommuteKm || 50;
    const targets = profile.targetCategories || [];
    $('#pTargets').innerHTML = A.CATEGORY_NAMES.filter(c => c !== 'Other').map(c => `<button type="button" class="chip" data-target="${esc(c)}" aria-pressed="${targets.includes(c)}">${esc(c)}</button>`).join('');
    $$('#pTargets .chip').forEach(ch => ch.onclick = async () => {
      ch.setAttribute('aria-pressed', ch.getAttribute('aria-pressed') !== 'true');
      profile.targetCategories = $$('#pTargets .chip[aria-pressed=true]').map(x => x.dataset.target);
      await S.saveProfile(profile);
    });
    $$('#skTrack button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.t === skTrack); b.onclick = () => { skTrack = b.dataset.t; renderSettings(); }; });
    const sk = skillsFor(skTrack);
    const groups = {};
    A.TOOLS.forEach(t => { (groups[t.group] = groups[t.group] || []).push(t.name); });
    // For internships, put software and AI first
    const order = skTrack === 'intern' ? ['Software development', 'Data and AI'] : [];
    const names0 = Object.keys(groups);
    const rank = g => order.includes(g) ? order.indexOf(g) : 100 + names0.indexOf(g);
    $('#skillsGrid').innerHTML = Object.entries(groups).sort((x, y) => rank(x[0]) - rank(y[0])).map(([g, names]) => `
      <div class="skill-group"><h3>${esc(g)}</h3><div class="skills">${names.map(n => {
        const lv = sk[n] || 'none';
        return `<div class="skill"><span>${esc(n)}</span><span class="seg" role="group" aria-label="${esc(n)}">
          <button class="s" data-sk="${esc(n)}" data-lv="strong" aria-pressed="${lv === 'strong'}">Confident</button>
          <button class="b" data-sk="${esc(n)}" data-lv="basic" aria-pressed="${lv === 'basic'}">Basic</button>
          <button class="n" data-sk="${esc(n)}" data-lv="none" aria-pressed="${lv === 'none'}">None</button></span></div>`;
      }).join('')}</div></div>`).join('');
    $$('#skillsGrid [data-sk]').forEach(b => b.onclick = async () => {
      skillsFor(skTrack)[b.dataset.sk] = b.dataset.lv;
      $$(`#skillsGrid [data-sk="${CSS.escape(b.dataset.sk)}"]`).forEach(x => x.setAttribute('aria-pressed', x === b));
      await S.saveProfile(profile);
    });
  }
  const saveProfileFields = async () => {
    profile.daysPerWeek = +$('#pDays').value || 5; profile.hoursPerWeek = +$('#pHours').value || 37.5;
    const yrs = parseFloat($('#pExp').value); profile.experienceYears = isNaN(yrs) ? 1 : yrs;
    const com = parseFloat($('#pComm').value); profile.commercialYears = isNaN(com) ? null : com;
    profile.dailyLimit = Math.max(1, Math.min(50, parseInt($('#pDaily').value, 10) || 5));
    const internChanged = profile.showInternships !== $('#pIntern').checked;
    profile.showInternships = $('#pIntern').checked;
    profile.factBank = $('#pFacts').value.trim();
    profile.hasDrivingLicence = $('#pLicence').checked;
    profile.timeLimitedRtw = $('#pRtw').checked;
    profile.languages = $('#pLangs').value.split(',').map(x => x.trim()).filter(Boolean);
    profile.autoDetect = $('#pAuto').checked;
    profile.autoNoResponseDays = Math.max(0, Math.min(180, parseInt($('#pStale').value, 10) || 0));
    profile.applyDefaults = { ...(profile.applyDefaults || {}), cover: $('#pCover').value };
    profile.showPreview = $('#pPreview').checked;
    profile.penalizeSchedule = $('#pSched').checked;
    profile.listScan = $('#pList').checked;
    profile.signName = $('#pSignName').value.trim(); profile.signPhone = $('#pSignPhone').value.trim();
    profile.signLinkedIn = $('#pSignLi').value.trim(); profile.mailClient = $('#pMail').value;
    profile.pitch = $('#pPitch').value.trim(); profile.highlights = $('#pHighlights').value.trim();
    profile.areas = $('#pAreas').value.split(',').map(x => x.trim()).filter(Boolean);
    profile.home = $('#pHome').value.trim(); profile.maxCommuteKm = +$('#pCommute').value || 50;
    await S.saveProfile(profile);
    // Re-render only after every field is read: renderAll redraws this form from the profile,
    // and doing it earlier put the old values back into the boxes still to be read
    if (internChanged) { applyInternVisibility(); renderAll(); }
  };
  ['#pExp', '#pComm', '#pDaily', '#pIntern', '#pFacts', '#pDays', '#pHours', '#pLicence', '#pRtw', '#pLangs', '#pAuto', '#pPreview', '#pSched', '#pList', '#pAreas', '#pHome', '#pCommute', '#pSignName', '#pSignPhone', '#pSignLi', '#pMail', '#pPitch', '#pHighlights'].forEach(id => $(id).addEventListener('change', saveProfileFields));
  $('#resetSkills').onclick = async () => {
    if (!confirm(`Clear all ${skTrack === 'intern' ? 'internship' : 'job'} skill levels?`)) return;
    if (skTrack === 'intern') profile.intern.skills = {}; else profile.skills = { ...A.DEFAULT_SKILLS };
    await S.saveProfile(profile); renderSettings();
  };
  $('#recalcAll').onclick = () => recalcAll();
  async function recalcAll(onlyTrack) {
    const list = await S.getApps();
    let filled = 0;
    list.forEach(a => {
      if (!a.description && !a.title) return;
      if (onlyTrack && trackOf(a) !== onlyTrack) return;
      const an = A.analyze({ title: a.title, company: a.company, description: a.description || '', location: a.location, workTypes: a.workTypes, category: a.category, track: a.track, salaryText: a.salaryText }, profile);
      a.chance = an.chance; a.tools = an.chance.tools; a.track = an.track; a.placement = an.placement;
      if (a.description) {
        a.details = an.details;
        // Fill in notes and benefits on older applications without touching anything you wrote
        if (!(a.benefits || []).length && an.benefits.length) { a.benefits = an.benefits; filled++; }
        if (!String(a.notes || '').trim() && an.notes) { a.notes = an.notes; filled++; }
        if (globalThis.JT_Extract) {
          const found = JT_Extract.contactsFromText(a.description);
          const merged = JT_Extract.mergeContacts(a.contacts || [], found);
          if (merged.length > (a.contacts || []).length) { a.contacts = merged; filled++; }
        }
      }
      S.touch(a); // so the changes reach the Google Sheet
    });
    await S.saveApps(list);
    apps = await S.getApps();
    if (onlyTrack) return;
    $('#recalcAll').textContent = filled ? `Done: fit recalculated, ${filled} field${filled === 1 ? '' : 's'} filled in` : 'Done: fit recalculated';
    setTimeout(() => { $('#recalcAll').textContent = 'Recalculate fit for all applications'; }, 2500);
  }

  // ---------- INTERNSHIPS ----------
  $$('[data-new-intern]').forEach(b => b.onclick = () => openDrawer(null, { track: 'intern' }));
  const savePlacement = async () => { await S.saveProfile(profile); await recalcAll('intern'); renderIntern(); };
  function renderIntern() {
    const pl = profile.intern.placement;
    const dls = (pl.deadlines || []).filter(d => d.date).concat(pl.start ? [{ label: 'Placement starts', date: pl.start }] : []).sort((x, y) => x.date < y.date ? -1 : 1);
    $('#plDeadlines').innerHTML = dls.length ? dls.slice(0, 4).map(d => {
      const n = daysTo(d.date);
      return `<div class="dl ${n < 0 ? 'past' : n <= 7 ? 'urgent' : n <= 21 ? 'soon' : ''}"><span class="dl-n">${n < 0 ? '✓' : n}</span><div><b>${esc(d.label)}</b><span>${longDate(d.date)} · ${n < 0 ? 'passed' : n === 0 ? 'today' : `in ${n} day${n === 1 ? '' : 's'}`}</span></div></div>`;
    }).join('') : '';
    $('#plDeadlines').hidden = !dls.length;

    const list = apps.filter(a => trackOf(a) === 'intern').sort((x, y) => ((y.chance || {}).score || 0) - ((x.chance || {}).score || 0));
    const offers = list.filter(a => S.everReached(a, A.OFFER)).length;
    $('#plList').innerHTML = !list.length
      ? '<p class="empty">No internships yet. Open an internship ad and the extension recognises it, checks it against your placement rules and saves it when you press Apply. In search results, tick "Internships only".</p>'
      : `<p class="hint" style="margin:0 0 8px">${list.length} application${list.length === 1 ? '' : 's'} · fit your rules: ${list.filter(a => a.placement && a.placement.verdict === 'ok').length} · offers: ${offers}</p>` +
        list.slice(0, 12).map(a => `<div class="att"><div class="what"><b>${esc(a.title || 'Untitled')}${a.company ? ' — ' + esc(a.company) : ''}</b><span>${esc(A.statusLabel(a.status))} · ${a.chance ? esc(A.display(a.chance).text + (a.chance.verdict ? ' ' + A.VERDICTS[a.chance.verdict].label : '')) : '—'}${a.placement ? ' · ' + esc(PL_HEAD[a.placement.verdict]) : ''}</span></div><div class="btns">${plBadge(a.placement)}<button class="btn small" data-open="${a.id}">Open</button></div></div>`).join('');
    $$('#plList [data-open]').forEach(b => b.onclick = () => openDrawer(apps.find(a => a.id === b.dataset.open)));

    const F = { plStart: 'start', plEnd: 'end', plWeeks: 'minWeeks', plMinH: 'minHours', plMaxH: 'maxHours', plDays: 'daysPerWeek' };
    Object.entries(F).forEach(([id, k]) => {
      $('#' + id).value = pl[k] || '';
      $('#' + id).onchange = () => { pl[k] = $('#' + id).type === 'number' ? (+$('#' + id).value || 0) : $('#' + id).value; savePlacement(); };
    });
    $('#plOverseas').checked = !!pl.overseasRemoteOnly; $('#plOverseas').onchange = () => { pl.overseasRemoteOnly = $('#plOverseas').checked; savePlacement(); };
    $('#plPaid').checked = !!pl.paidPreferred; $('#plPaid').onchange = () => { pl.paidPreferred = $('#plPaid').checked; savePlacement(); };

    $('#plDl').innerHTML = (pl.deadlines || []).map((d, i) => `<div class="dl-row"><input type="text" data-dl-l="${i}" value="${esc(d.label)}" aria-label="Deadline"><input type="date" data-dl-d="${i}" value="${esc(d.date)}" aria-label="Date"><button class="btn small" data-dl-x="${i}" aria-label="Remove">×</button></div>`).join('') || '<p class="empty" style="margin:0 0 8px">No deadlines yet.</p>';
    $$('#plDl [data-dl-l]').forEach(x => x.onchange = () => { pl.deadlines[+x.dataset.dlL].label = x.value; savePlacement(); });
    $$('#plDl [data-dl-d]').forEach(x => x.onchange = () => { pl.deadlines[+x.dataset.dlD].date = x.value; savePlacement(); });
    $$('#plDl [data-dl-x]').forEach(x => x.onclick = () => { pl.deadlines.splice(+x.dataset.dlX, 1); savePlacement(); });
    $('#plDlAdd').onclick = () => { pl.deadlines = (pl.deadlines || []).concat([{ label: 'New deadline', date: '' }]); S.saveProfile(profile).then(renderIntern); };

    const ip = profile.intern;
    $('#plTargets').innerHTML = A.CATEGORY_NAMES.filter(c => c !== 'Other').map(c => {
      const st = (ip.priorityCategories || []).includes(c) ? 'priority' : (ip.targetCategories || []).includes(c) ? 'target' : 'no';
      return `<div class="tg"><span>${esc(c)}</span><span class="seg">${[['priority', 'Priority'], ['target', 'Target'], ['no', 'Not a target']].map(([v, l]) => `<button data-c="${esc(c)}" data-v="${v}" aria-pressed="${st === v}">${l}</button>`).join('')}</span></div>`;
    }).join('') + '<p class="hint" style="margin:6px 0 0;grid-column:1/-1">With nothing marked, every role type counts. Priority roles score highest.</p>';
    $$('#plTargets button').forEach(b => b.onclick = () => {
      const c = b.dataset.c, v = b.dataset.v;
      ip.priorityCategories = (ip.priorityCategories || []).filter(x => x !== c);
      ip.targetCategories = (ip.targetCategories || []).filter(x => x !== c);
      if (v === 'priority') { ip.priorityCategories.push(c); ip.targetCategories.push(c); } else if (v === 'target') ip.targetCategories.push(c);
      savePlacement();
    });
    $('#plPitch').value = ip.pitch || ''; $('#plHighlights').value = ip.highlights || '';
    $('#plPitch').onchange = () => { ip.pitch = $('#plPitch').value.trim(); S.saveProfile(profile); };
    $('#plHighlights').onchange = () => { ip.highlights = $('#plHighlights').value.trim(); S.saveProfile(profile); };
  }
  $('#plRead').onclick = async () => {
    const found = A.parsePlacementRules($('#plPaste').value);
    const keys = Object.keys(found);
    if (!keys.length) { $('#plMsg').textContent = 'No dates, hours or deadlines found in that text. Fill in the fields below instead.'; $('#plMsg').className = 'msg err'; return; }
    Object.assign(profile.intern.placement, found);
    await savePlacement();
    const parts = [found.start && `dates ${longDate(found.start)} – ${longDate(found.end)}`, found.minWeeks && `at least ${found.minWeeks} weeks`, found.minHours && `${found.minHours}–${found.maxHours} hours`, found.daysPerWeek && `${found.daysPerWeek} days a week`, found.deadlines && `${found.deadlines.length} deadline${found.deadlines.length === 1 ? '' : 's'}`].filter(Boolean);
    $('#plMsg').textContent = `Found ${parts.join(', ')}. Internships have been re-checked.`; $('#plMsg').className = 'msg ok';
  };

  // ---------- CV AND ATS ----------
  const LVL = { strong: 'confident', basic: 'basic', none: 'none' };
  function applyCvSkills(track, found) {
    const target = track === 'intern' ? profile.intern : profile;
    const before = { ...target.skills }, next = {};
    A.TOOLS.forEach(t => { if (found[t.name]) next[t.name] = found[t.name]; });
    target.skills = next;
    const changes = A.TOOLS.map(t => t.name).filter(n => (before[n] || 'none') !== (next[n] || 'none')).map(n => ({ n, from: before[n] || 'none', to: next[n] || 'none' }));
    return { before, changes };
  }
  async function renderCV() {
    const cvs = await getCvs();
    const card = (t, title, hint) => {
      const cv = cvs[t];
      const rep = cv && cv.text ? JT_CV.atsReport(cv.text, cv) : null;
      const found = cv && cv.text ? JT_CV.skillsFromCV(cv.text) : null;
      return `<div class="panel cv-card">
        <div class="row-between"><h2>${title}</h2>${rep ? `<span class="chance ${chanceClass(rep.score)}" title="ATS check of the CV itself">ATS ${rep.score}%</span>` : ''}</div>
        <p class="hint">${hint}</p>
        <label class="drop" tabindex="0"><input type="file" accept=".pdf,.docx,.txt,.md" hidden data-file="${t}">
          <b>${cv ? 'Replace CV' : 'Drop your CV here or click to choose'}</b><span>PDF, Word (.docx) or plain text</span></label>
        <details class="paste"><summary>or paste the text</summary><textarea rows="6" data-paste="${t}" placeholder="Paste the full text of your CV"></textarea><button class="btn small" data-paste-go="${t}">Read the text</button></details>
        <p class="msg" data-msg="${t}" role="status"></p>
        ${cv ? `<p class="hint" style="margin:8px 0">Loaded: <b>${esc(cv.name || 'pasted text')}</b> · ${new Date(cv.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${cv.pages ? ` · ${cv.pages} page${cv.pages > 1 ? 's' : ''}` : ''}</p>` : ''}
        ${cv && cv.lastChanges ? `<div class="cv-changes"><b>Skills updated from your CV:</b> ${cv.lastChanges.length ? cv.lastChanges.slice(0, 18).map(c => `<span class="t ${c.to === 'strong' ? 's' : c.to === 'basic' ? 'b' : 'm'}" title="was: ${LVL[c.from]}">${esc(c.n)}: ${LVL[c.to]}</span>`).join(' ') + (cv.lastChanges.length > 18 ? ` and ${cv.lastChanges.length - 18} more` : '') : 'no changes'}
          ${cv.prevSkills ? `<button class="btn small" data-undo="${t}">Undo</button>` : ''}</div>` : ''}
        ${rep ? `<h3 class="sub3">ATS check of your CV</h3><ul class="aplist">${rep.checks.map(c => `<li><i style="color:${PL_ICON[c.state][1]}">${PL_ICON[c.state][0]}</i><span><b>${esc(c.label)}</b><br>${esc(c.text)}</span></li>`).join('')}</ul>` : ''}
        ${found ? `<h3 class="sub3">${Object.keys(found.skills).length} skills found</h3><div class="tools">${Object.entries(found.skills).sort((x, y) => (y[1] === 'strong') - (x[1] === 'strong')).map(([n, l]) => `<span class="t ${l === 'strong' ? 's' : 'b'}" title="${esc(found.evidence[n] || '')}">${esc(n)}</span>`).join('')}</div>` : ''}
        ${cv ? `<p style="margin:10px 0 0"><button class="btn small danger" data-del="${t}">Remove CV</button></p>` : ''}
      </div>`;
    };
    $('#cvCards').innerHTML = card('job', 'CV for jobs', 'Used to score regular jobs.') + card('intern', 'CV for internships', 'Used to score internships and placements.');
    const msg = (t, txt, ok) => { const el = $(`[data-msg="${t}"]`); if (el) { el.textContent = txt; el.className = 'msg ' + (ok ? 'ok' : 'err'); } };
    async function importCv(t, data) {
      const rep = JT_CV.atsReport(data.text, data), found = JT_CV.skillsFromCV(data.text);
      if (!Object.keys(found.skills).length && rep.words < 80) { msg(t, 'Could not read any text from that file. If it is a scan, export the CV from Word as PDF or upload the .docx.', false); return; }
      const { before, changes } = applyCvSkills(t, found.skills);
      await S.saveProfile(profile);
      const all = { ...(await getCvs()) };
      all[t] = { name: data.name || '', kind: data.kind, pages: data.pages || 0, tables: !!data.tables, images: !!data.images, text: data.text, at: new Date().toISOString(), prevSkills: before, lastChanges: changes };
      await S.set({ cvs: all }); cvsCache = all;
      msg(t, 'Recalculating fit for your applications…', true);
      await recalcAll(t);
      await renderCV();
      msg(t, `Done: ${Object.keys(found.skills).length} skills found, ${changes.length} changed. Fit recalculated.`, true);
    }
    $$('#cvCards [data-file]').forEach(inp => {
      const t = inp.dataset.file, drop = inp.closest('.drop');
      const go = async file => {
        if (!file) return;
        msg(t, 'Reading the file…', true);
        try {
          if (!globalThis.JT_ReadCV) await new Promise(r => addEventListener('jt-cvreader-ready', r, { once: true }));
          await importCv(t, await JT_ReadCV(file));
        } catch (e) { msg(t, 'Could not read the file: ' + (e.message || e), false); }
      };
      inp.onchange = () => go(inp.files[0]);
      drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); go(e.dataTransfer.files[0]); };
    });
    $$('#cvCards [data-paste-go]').forEach(b => b.onclick = () => { const t = b.dataset.pasteGo, txt = $(`[data-paste="${t}"]`).value; if (txt.trim()) importCv(t, { text: txt, kind: 'txt', name: 'pasted text' }); });
    $$('#cvCards [data-undo]').forEach(b => b.onclick = async () => {
      const t = b.dataset.undo, all = { ...(await getCvs()) };
      if (!all[t] || !all[t].prevSkills) return;
      (t === 'intern' ? profile.intern : profile).skills = all[t].prevSkills;
      all[t] = { ...all[t], prevSkills: null, lastChanges: null };
      await S.saveProfile(profile); await S.set({ cvs: all }); cvsCache = all; await recalcAll(t); renderCV();
    });
    $$('#cvCards [data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Remove this CV? Your skill levels stay as they are.')) return;
      const all = { ...(await getCvs()) }; delete all[b.dataset.del]; await S.set({ cvs: all }); cvsCache = all; renderCV();
    });
  }

  // ---------- GOOGLE SHEET ----------
  async function renderSheetCfg() {
    const cfg = await JT_Sync_cfg();
    $('#gsUrl').value = cfg.url || ''; $('#gsToken').value = cfg.token || ''; $('#gsAuto').checked = cfg.auto !== false;
    renderSyncState();
  }
  async function JT_Sync_cfg() { const { sheetCfg } = await S.get('sheetCfg'); return sheetCfg || {}; }
  async function renderSyncState() {
    const { syncState } = await S.get('syncState');
    const el = $('#syncState');
    if (!syncState) { el.textContent = 'Not connected'; el.className = 'sync-state'; return; }
    el.textContent = (syncState.ok ? 'Synced ' : 'Error ') + new Date(syncState.at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + (syncState.ok ? '' : ': ' + syncState.msg);
    el.className = 'sync-state ' + (syncState.ok ? 'ok' : 'err');
  }
  const readCfg = () => ({ url: $('#gsUrl').value.trim(), token: $('#gsToken').value.trim(), auto: $('#gsAuto').checked });
  const gsMsg = (t, ok) => { $('#gsMsg').textContent = t; $('#gsMsg').className = 'msg ' + (ok ? 'ok' : 'err'); };
  ['#gsUrl', '#gsToken', '#gsAuto'].forEach(id => $(id).addEventListener('change', () => S.set({ sheetCfg: readCfg() })));
  $('#gsTest').onclick = async () => {
    await S.set({ sheetCfg: readCfg() });
    gsMsg('Checking…', true);
    const r = await chrome.runtime.sendMessage({ type: 'syncTest', cfg: readCfg() });
    gsMsg(r.ok ? r.msg : r.error, r.ok);
  };
  $('#gsSync').onclick = async () => {
    await S.set({ sheetCfg: readCfg() });
    gsMsg('Syncing…', true);
    const r = await chrome.runtime.sendMessage({ type: 'syncNow' });
    gsMsg(r.ok ? r.msg : r.error, r.ok);
  };
  chrome.storage.onChanged.addListener(ch => { if (ch.syncState) renderSyncState(); });
  renderSheetCfg();
  (async () => { const c = await JT_Sync_cfg(); if (c.url && c.token && c.auto !== false) chrome.runtime.sendMessage({ type: 'syncNow' }); })();

  // ---------- DATA ----------
  const download = (name, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const stamp = () => new Date().toISOString().slice(0, 10);
  // ---------- RE-CHECK ----------
  // Repairs titles, cleans descriptions, re-scores, marks duplicates and fixes clashing tickets.
  // A backup is downloaded first, since descriptions are rewritten.
  const recheckMsg = t => { $('#recheckMsg').innerHTML = t; };
  async function downloadBackup(suffix) {
    const all = await S.get(['apps', 'profile', 'counter', 'offerWeights']);
    const blob = new Blob([JSON.stringify({ version: chrome.runtime.getManifest().version, exportedAt: new Date().toISOString(), ...all }, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = u; link.download = `job-tracker-${new Date().toISOString().slice(0, 10)}${suffix || ''}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  }
  function renderDupList(list) {
    const dups = list.filter(a => a.dupOf);
    $('#mergeDups').hidden = !dups.length;
    $('#dupList').innerHTML = dups.length ? `<ul class="details">${dups.map(a => `<li><b>${esc(a.ticket)}</b> ${esc(a.title || 'Untitled')}${a.company ? ' — ' + esc(a.company) : ''} → same job as <b>${esc(a.dupOf)}</b></li>`).join('')}</ul>` : '';
  }
  $('#recheckAll').onclick = async () => {
    if (!globalThis.JT_Recheck) return;
    $('#recheckAll').disabled = true;
    try {
      await downloadBackup('-before-recheck');
      const list = await S.getApps();
      const { counter } = await S.get('counter');
      const rep = JT_Recheck.recheckAll(list, profile, counter);
      list.forEach(a => S.touch(a));
      await S.saveApps(list);
      await S.set({ counter: rep.counter });
      apps = await S.getApps();
      const v = rep.verdicts, L = k => A.VERDICTS[k] ? A.VERDICTS[k].label : k;
      recheckMsg(`<b>${esc(rep.summary)}</b><br>${Object.keys(v).map(k => `${esc(L(k))}: ${v[k]}`).join(' · ')}` +
        (rep.renumbered.length ? `<br>New ticket numbers: ${rep.renumbered.map(r => esc(r.from + ' → ' + r.to)).join(', ')}` : '') +
        (rep.incomplete.length ? `<br>Incomplete (open the job page and save again, or paste the description): ${rep.incomplete.map(esc).join(', ')}` : ''));
      renderDupList(apps);
      renderAll();
    } finally { $('#recheckAll').disabled = false; }
  };
  $('#mergeDups').onclick = async () => {
    const list = await S.getApps();
    const n = list.filter(a => a.dupOf).length;
    if (!n || !confirm(`Merge ${n} duplicate record${n === 1 ? '' : 's'} into the job they repeat? Notes, contacts, follow-ups and status history are kept.`)) return;
    const { apps: kept, merged } = JT_Recheck.mergeDuplicates(list);
    kept.forEach(a => { delete a.dupOf; S.touch(a); });
    // Merged records are deleted from the sheet on the next sync
    const { pendingDeletes = [] } = await S.get('pendingDeletes');
    await S.set({ pendingDeletes: pendingDeletes.concat(merged.map(m => m.id).filter(id => (list.find(a => a.id === id) || {}).syncedAt)) });
    await S.saveApps(kept);
    apps = await S.getApps();
    recheckMsg(`Merged: ${merged.map(m => esc(m.ticket + ' → ' + m.into)).join(', ')}`);
    renderDupList(apps); renderAll();
  };

  // ---------- WRONG VERDICTS ----------
  async function renderFeedback() {
    const { verdictFeedback = [] } = await S.get('verdictFeedback');
    $('#fbMsg').textContent = verdictFeedback.length ? `${verdictFeedback.length} reported` : 'None reported yet. Use "Wrong verdict?" in the panel on a job page.';
    $('#fbExport').disabled = $('#fbClear').disabled = !verdictFeedback.length;
  }
  $('#fbExport').onclick = async () => {
    const { verdictFeedback = [] } = await S.get('verdictFeedback');
    const blob = new Blob([JSON.stringify({ version: chrome.runtime.getManifest().version, exportedAt: new Date().toISOString(), verdictFeedback }, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = `job-tracker-wrong-verdicts-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  };
  $('#fbClear').onclick = async () => { if (confirm('Clear the list of wrong verdicts?')) { await S.set({ verdictFeedback: [] }); renderFeedback(); } };
  renderFeedback();

  $('#exportJson').onclick = async () => {
    const all = await S.get(['apps', 'profile', 'counter', 'offerWeights']);
    download(`job-tracker-${stamp()}.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...all }, null, 2), 'application/json');
  };
  $('#exportCsv').onclick = () => {
    const cols = [['Ticket', a => a.ticket], ['Job title', a => a.title], ['Company', a => a.company], ['Location', a => a.location],
      ['Role type', a => a.category], ['Work type', a => (a.workTypes || []).join(', ')], ['Salary', a => (a.salary && a.salary.text) || a.salaryText],
      ['Source', a => a.platform], ['Applied on', a => fmtDate(a.appliedAt)], ['Status', a => A.statusLabel(a.status)],
      ['Fit %', a => a.chance && a.chance.verdict !== 'incomplete' ? a.chance.score : ''], ['Verdict', a => a.chance && a.chance.verdict ? A.VERDICTS[a.chance.verdict].label : ''], ['Tools', a => (a.tools || []).join(', ')],
      ['Missing', a => a.chance ? a.chance.missing.join(', ') : ''], ['Benefits', a => (a.benefits || []).join(' • ')], ['Notes', a => a.notes], ['Link', a => a.url]];
    const cellv = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = '\ufeff' + [cols.map(c => cellv(c[0])).join(',')].concat(apps.map(a => cols.map(c => cellv(c[1](a))).join(','))).join('\r\n');
    download(`job-tracker-${stamp()}.csv`, csv, 'text/csv;charset=utf-8');
  };
  $('#importJson').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.apps)) throw new Error('no list of applications');
      const cur = await S.getApps();
      const ids = new Set(cur.map(a => a.id));
      const incoming = data.apps.filter(a => a && a.id && !ids.has(a.id));
      if (data.profile) JT_Legacy.migrateProfile(data.profile); // backups from versions before 2.0
      incoming.forEach(a => JT_Legacy.migrateApp(a, A, data.profile || profile));
      const merged = cur.concat(incoming);
      await S.set({ apps: merged, counter: Math.max(data.counter || 0, (await S.get('counter')).counter || 0) });
      if (data.profile) await S.saveProfile(data.profile);
      $('#dataMsg').textContent = `Restored: ${merged.length - cur.length} applications added.`;
    } catch (err) {
      $('#dataMsg').textContent = 'This file can\'t be used: ' + err.message + '. Choose a JSON file saved with Download backup.';
    }
    e.target.value = '';
  };
  $('#wipe').onclick = async () => {
    if (!confirm('Delete all applications and offers? Download a backup first.')) return;
    await S.saveApps([]); $('#dataMsg').textContent = 'All applications deleted.';
  };

  route();
})();
