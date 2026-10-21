/* Job Tracker — fit scores inside search result lists, plus a filter by score */
(function () {
  'use strict';
  if (window.__jtListLoaded || window.top !== window) return;
  window.__jtListLoaded = true;

  const A = globalThis.JT_Analyzer, S = globalThis.JT_Store, E = globalThis.JT_Extract;
  const site = E.siteFor(location.hostname);
  if (!site.cardLink) return;

  const DEFAULTS = { enabled: true, fetch: false, min: 0, mode: 'dim', hideApplied: false, hideOutArea: false, hideSenior: false, hideSkip: false, onlyIntern: false, hidePlacementFail: false, collapsed: false };
  let cfg = { ...DEFAULTS };
  let profile = null;
  let appliedKeys = new Set();
  const cache = new Map();          // key -> result
  const queue = [];                 // keys to fetch
  const queued = new Set();
  let active = 0, pausedUntil = 0, failCount = 0;
  const CACHE_DAYS = 7, MAX_CONCURRENT = 2, GAP_MS = 700;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const color = n => n >= 70 ? '#23905a' : n >= 50 ? '#b47a12' : '#c0463b';

  // ---------- Storage ----------
  async function loadState() {
    const got = await S.get(['listFilter', 'scoreCache']);
    cfg = { ...DEFAULTS, ...(got.listFilter || {}) };
    profile = await S.getProfile();
    const now = Date.now();
    // Cached jobs are scored again with the current rules: a cached verdict from an older
    // version (a facilities job rated 72% Apply before 3.0.3) must not outlive the update
    Object.entries(got.scoreCache || {}).forEach(([k, v]) => {
      if (!(now - v.at < CACHE_DAYS * 864e5 && v.v === 3 && v.job)) return;
      try { v.res = score(v.job); cache.set(k, v); } catch (e) { /* drop a broken entry */ }
    });
    const apps = await S.getApps();
    appliedKeys = new Set(apps.map(a => a.urlKey).filter(Boolean));
  }
  let saveTimer = null;
  function saveCache() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const { scoreCache = {} } = await S.get('scoreCache');
      cache.forEach((v, k) => { if (v.full) scoreCache[k] = v; });
      const entries = Object.entries(scoreCache).sort((a, b) => b[1].at - a[1].at).slice(0, 600);
      await S.set({ scoreCache: Object.fromEntries(entries) });
    }, 1500);
  }
  const saveCfg = () => S.set({ listFilter: cfg });

  chrome.storage.onChanged.addListener(async ch => {
    if (ch.apps) { const apps = await S.getApps(); appliedKeys = new Set(apps.map(a => a.urlKey).filter(Boolean)); scheduleScan(); }
    if (ch.profile) { profile = await S.getProfile(); cache.forEach(v => { if (v.job) v.res = score(v.job); }); scheduleScan(); }
  });

  // ---------- Finding job cards ----------
  function idOf(el) {
    for (const a of site.idAttrs || []) { const v = el.getAttribute && el.getAttribute(a); if (v && /^[\w-]{5,}$/.test(v)) return v; }
    return null;
  }
  function keyFromHref(href) { const m = href && href.match(site.cardLink); return m ? m[1] : null; }

  function cardIdFrom(card, titleEl) {
    const own = idOf(card); if (own) return own;
    for (const a of site.idAttrs || []) { const x = card.querySelector(`[${a}]`); const v = x && idOf(x); if (v) return v; }
    const links = [...card.querySelectorAll('a[href]')];
    if (titleEl && titleEl.href) links.unshift(titleEl);
    for (const a of links) { const id = keyFromHref(a.href); if (id) return id; }
    const idEl = card.querySelector('a[id^="job_"], a[id^="sj_"]');
    if (idEl) return idEl.id.replace(/^(job_|sj_)/, '');
    return null;
  }
  const sizeOk = el => { const r = el.getBoundingClientRect(); return r.height >= 40 && r.width >= 150 && r.height <= 700 && r.width <= 1000; };

  function findCards() {
    const map = new Map();
    // 1) Known card selectors for the site
    if (site.cardSel) {
      let els = [...document.querySelectorAll(site.cardSel)].filter(el => !(site.pane && el.closest(site.pane)) && sizeOk(el));
      els = els.filter(el => !els.some(o => o !== el && el.contains(o))); // innermost only
      for (const el of els) {
        const titleEl = site.cardTitle ? el.querySelector(site.cardTitle) : null;
        const id = cardIdFrom(el, titleEl);
        if (!id || map.has(id)) continue;
        map.set(id, { id, el, titleEl, href: titleEl && titleEl.href ? titleEl.href : ([...el.querySelectorAll('a[href]')].map(a => a.href).find(h => keyFromHref(h) === id) || null),
          title: titleEl ? (titleEl.getAttribute('aria-label') || titleEl.textContent || '').replace(/\s+/g, ' ').replace(/\s+with verification$/i, '').trim() : '' });
      }
      if (map.size >= 3) return [...map.values()];
    }
    // 2) Generic fallback: climb from a job link while the block still holds only that job
    map.clear();
    const seeds = [];
    (site.idAttrs || []).forEach(a => document.querySelectorAll(`[${a}]`).forEach(el => { const id = idOf(el); if (id) seeds.push({ id, el, href: null }); }));
    document.querySelectorAll('a[href]').forEach(a => { const id = keyFromHref(a.href); if (id) seeds.push({ id, el: a, href: a.href }); });
    const idsIn = el => {
      const s = new Set();
      el.querySelectorAll('a[href]').forEach(a => { const id = keyFromHref(a.href); if (id) s.add(id); });
      (site.idAttrs || []).forEach(at => el.querySelectorAll(`[${at}]`).forEach(x => { const id = idOf(x); if (id) s.add(id); }));
      const own = idOf(el); if (own) s.add(own);
      return s;
    };
    for (const { id, el, href } of seeds) {
      if (map.has(id) && map.get(id).href) continue;
      let card = el, n = el.parentElement;
      for (let k = 0; n && k < 10 && n !== document.body; k++, n = n.parentElement) {
        if (idsIn(n).size > 1 || !sizeOk(n) && n.getBoundingClientRect().height > 700) break;
        card = n;
      }
      if (card.tagName === 'A' && card.parentElement) card = card.parentElement;
      if (site.pane && card.closest(site.pane)) continue;
      if (!sizeOk(card) || card.closest('header, nav, footer')) continue;
      const titleEl = href ? el : card.querySelector('a[href]');
      const prev = map.get(id);
      map.set(id, { id, el: card, titleEl, href: href || (prev && prev.href) || (titleEl && titleEl.href) || null, title: titleEl ? (titleEl.getAttribute('aria-label') || titleEl.textContent || '').replace(/\s+/g, ' ').trim() : '' });
    }
    return [...map.values()];
  }

  const canonOf = c => site.canon ? site.canon(c.id) : (c.href ? S.cleanUrl(c.href) : null);
  const fetchOf = c => site.fetchUrl ? site.fetchUrl(c.id) : c.href;

  // ---------- Scoring ----------
  function score(job, approx) {
    const an = A.analyze(job, profile, { approx: !!approx });
    const c = an.chance;
    const blocks = (c.gates && c.gates.blocks) || [];
    // A card is too short for a verdict, except when something on it already rules the job out
    const verdict = approx ? (blocks.length ? 'skip' : null) : c.verdict;
    return {
      score: c.score, label: c.label, lowData: c.lowData, verdict, blocks: blocks.map(b => b.text),
      asks: approx ? [] : ((c.gates && c.gates.asks) || []).map(b => b.text),
      outArea: !!c.outArea,
      senior: !!c.senior,
      missing: c.keyMissing && c.keyMissing.length ? c.keyMissing : c.missing.slice(0, 4),
      why: c.reasons.filter(r => r.delta !== null).slice(0, 6).map(r => `${r.text}: ${r.delta > 0 ? '+' : ''}${r.delta}`).join('\n'),
      salary: (an.salary && an.salary.text) || job.salaryText || '',
      intern: an.track === 'intern', rules: an.placement ? an.placement.verdict : null,
      rulesWhy: an.placement ? an.placement.items.filter(i => i.state === 'fail' || i.state === 'warn').map(i => `${i.state === 'fail' ? '✕' : '!'} ${i.text}`).join('\n') : '',
    };
  }
  function quickScore(card) {
    const text = (card.el.innerText || '').slice(0, 1200);
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    const title = card.title || lines[0] || '';
    const job = { title, description: text, location: guessLocation(lines, title) };
    return { ...score(job, true), approx: true };
  }
  function guessLocation(lines, title) {
    const areas = (profile.areas || []).map(a => a.toLowerCase());
    const l = lines.find(x => x !== title && x.length < 60 && (/,\s*[A-Z]|England|United Kingdom|London|shire\b|Remote|Hybrid/.test(x) || areas.some(a => x.toLowerCase().includes(a))));
    return l ? l.replace(/\(.*?\)/g, '').replace(/\s*·.*$/, '').trim() : '';
  }

  async function worker() {
    if (active >= MAX_CONCURRENT || !queue.length || Date.now() < pausedUntil || document.hidden) return;
    active++;
    const key = queue.shift();
    const entry = cache.get(key);
    try {
      const job = await E.fetchAndParse(entry.fetchUrl, entry.canon);
      if (!job.title || E.BAD_TITLE.test(job.title)) job.title = entry.title || job.title;
      if (!job.description || job.description.length < 150) throw new Error('empty');
      entry.job = { title: job.title, description: job.description, location: job.location, salaryText: job.salaryText, extraText: job.extraText };
      entry.res = score(entry.job);
      entry.full = true; entry.at = Date.now(); entry.v = 3;
      saveCache();
    } catch (e) {
      // The site is refusing: stop fetching for hours (shared with other tabs), never retry in a loop
      if (e.status === 429 || e.status === 403 || e.status === 999 || e.status === 'cooldown') { pausedUntil = Date.now() + 6 * 3600e3; queue.length = 0; queued.clear(); }
      entry.failed = true;
      failCount++;
    } finally {
      queued.delete(key);
      active--;
      render();
      setTimeout(worker, GAP_MS);
    }
  }

  // ---------- Rendering ----------
  let cards = [];
  function render() {
    if (!cfg.enabled) { cards.forEach(c => clearCard(c.el)); updatePanel(); return; }
    document.querySelectorAll('.jt-card-badge').forEach(b => { if (!cards.some(c => c.el.contains(b))) b.remove(); });
    let shown = 0, rated = 0;
    for (const c of cards) {
      const key = canonOf(c);
      if (!key) continue;
      let entry = cache.get(key);
      if (!entry) { entry = { canon: key, fetchUrl: fetchOf(c), title: c.title }; cache.set(key, entry); }
      if (!entry.res && !entry.quick) entry.quick = quickScore(c);
      if (cfg.fetch && !entry.full && !entry.failed && !queued.has(key) && entry.fetchUrl) { queued.add(key); queue.push(key); }
      const res = entry.res || entry.quick;
      const applied = appliedKeys.has(S.normUrl(key));
      if (entry.res) rated++;
      const hide = (res.verdict !== 'incomplete' && res.score < cfg.min) || (cfg.hideSkip && res.verdict === 'skip') || (cfg.hideApplied && applied) || (cfg.hideOutArea && res.outArea) || (cfg.hideSenior && res.senior)
        || (cfg.onlyIntern && !res.intern) || (cfg.hidePlacementFail && res.intern && res.rules === 'fail');
      decorate(c, res, !entry.res, applied, hide);
      if (!hide) shown++;
    }
    updatePanel(shown, rated);
    for (let i = 0; i < MAX_CONCURRENT; i++) worker();
  }

  function clearCard(el) {
    el.querySelectorAll('.jt-card-badge').forEach(b => b.remove());
    el.style.removeProperty('display'); el.style.removeProperty('opacity'); el.style.removeProperty('filter');
  }

  function decorate(c, res, approx, applied, hide) {
    const el = c.el;
    let b = el.querySelector('.jt-card-badge');
    if (!b) {
      b = document.createElement('span');
      b.className = 'jt-card-badge';
      const t = c.titleEl && el.contains(c.titleEl) ? c.titleEl : null;
      if (t && t.tagName === 'A' && t.parentElement) t.parentElement.insertBefore(b, t.nextSibling);
      else if (t) t.appendChild(b);
      else { if (getComputedStyle(el).position === 'static') el.style.position = 'relative'; b.dataset.abs = '1'; el.appendChild(b); }
    }
    const VL = { apply: 'Apply', tailor: 'Tailor', ask: 'Check', skip: 'Skip', incomplete: '?' };
    const txt = (res.verdict === 'incomplete' ? '?' : `${approx ? '≈' : ''}${res.score}%`) + (res.verdict && res.verdict !== 'incomplete' ? ' · ' + VL[res.verdict] : '') + (res.intern ? (res.rules === 'ok' ? ' · rules ✓' : res.rules === 'fail' ? ' · rules ✕' : res.rules ? ' · rules ?' : ' · intern') : '') + (applied ? ' ✓' : '');
    const VC = { apply: '#23905a', tailor: '#2f7fb5', ask: '#b47a12', skip: '#c0463b', incomplete: '#7a8794' };
    const bg = applied ? '#1d3b53' : res.verdict ? VC[res.verdict] : color(res.score);
    const title = (approx ? 'Estimate from the card text. Open the job for the full score.\n' : '') + (applied ? 'Already in your tracker\n' : '') + (res.intern ? 'Internship\n' : '') + (res.blocks && res.blocks.length ? res.blocks.map(x => '✕ ' + x).join('\n') + '\n' : '') + (res.asks && res.asks.length ? res.asks.map(x => '! ' + x).join('\n') + '\n' : '') + res.why + (res.missing && res.missing.length ? `\nMissing: ${res.missing.join(', ')}` : '') + (res.rulesWhy ? `\n\nPlacement rules:\n${res.rulesWhy}` : '');
    if (b.dataset.t !== txt + bg) {
      b.dataset.t = txt + bg;
      b.textContent = txt;
      const pos = b.dataset.abs ? 'position:absolute;top:6px;right:6px;z-index:5;' : 'display:inline-block;vertical-align:middle;margin:0 0 0 8px;';
      b.setAttribute('style', `${pos}background:${bg};color:#fff;font:600 11.5px/1 "Segoe UI",system-ui,sans-serif;padding:4px 7px;border-radius:10px;cursor:help;white-space:nowrap;text-decoration:none;box-shadow:0 1px 3px rgba(0,0,0,.25);${approx ? 'opacity:.8;' : ''}`);
    }
    b.title = title;
    if (hide) {
      if (cfg.mode === 'hide') { el.style.setProperty('display', 'none', 'important'); el.style.removeProperty('opacity'); }
      else { el.style.removeProperty('display'); el.style.setProperty('opacity', '0.28'); el.style.setProperty('filter', 'grayscale(0.7)'); }
    } else {
      el.style.removeProperty('display'); el.style.removeProperty('opacity'); el.style.removeProperty('filter');
    }
  }

  // ---------- Filter panel ----------
  let host, shadow;
  function ensurePanel() {
    if (host && document.documentElement.contains(host)) return;
    host = document.createElement('div');
    host.id = 'job-tracker-filter';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host{all:initial}
      [hidden]{display:none!important}
      .p{position:fixed;left:16px;bottom:16px;z-index:2147483644;width:268px;background:#fbfcfd;color:#1c2733;border:1px solid #cfd8e1;border-radius:10px;
        box-shadow:0 10px 28px rgba(20,40,60,.2);font:13px/1.4 "Segoe UI",system-ui,-apple-system,sans-serif}
      .h{display:flex;align-items:center;gap:8px;padding:9px 11px;background:#1d3b53;color:#fff;border-radius:9px 9px 0 0;cursor:pointer;user-select:none}
      .h b{flex:1;font-size:13px}.h small{opacity:.8;font-variant-numeric:tabular-nums}
      .c.collapsed .b{display:none}.c.collapsed .h{border-radius:9px}
      .b{padding:10px 12px 12px}
      label{display:flex;align-items:center;gap:7px;margin:6px 0;font-size:12.5px;cursor:pointer}
      .row{display:flex;align-items:center;gap:8px}
      input[type=range]{flex:1;accent-color:#1f6fa8}
      output{font-weight:700;min-width:36px;text-align:right;font-variant-numeric:tabular-nums}
      .seg{display:flex;border:1px solid #cfd8e1;border-radius:6px;overflow:hidden;margin:8px 0 4px}
      .seg button{flex:1;border:0;background:#fff;padding:5px;font:inherit;font-size:12px;cursor:pointer;color:#5a6b7d}
      .seg button+button{border-left:1px solid #cfd8e1}
      .seg button[aria-pressed=true]{background:#1d3b53;color:#fff}
      .note{font-size:11.5px;color:#5a6b7d;margin-top:6px}
      .lg{display:flex;gap:10px;font-size:11px;color:#5a6b7d;margin-top:8px}
      .lg i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:3px;vertical-align:-1px}
      :focus-visible{outline:2px solid #2f7fb5;outline-offset:1px}
    </style>
    <div class="p"><div class="c">
      <div class="h" role="button" tabindex="0" aria-label="Filter by fit"><b>Filter by fit</b><small id="cnt"></small><span id="arr">▾</span></div>
      <div class="b">
        <div class="row">Minimum <input type="range" id="min" min="0" max="90" step="5" aria-label="Minimum fit score"><output id="minv"></output></div>
        <div class="seg" role="group" aria-label="What to do with the rest"><button data-m="dim">Dim</button><button data-m="hide">Hide</button></div>
        <label><input type="checkbox" id="hideApplied"> Hide jobs I applied to</label>
        <label><input type="checkbox" id="hideOutArea"> Hide outside my areas</label>
        <label><input type="checkbox" id="hideSenior"> Hide senior / lead / 3rd line</label>
        <label><input type="checkbox" id="hideSkip"> Hide jobs that rule you out (licence, years, local only…)</label>
        <label><input type="checkbox" id="onlyIntern"> Internships only</label>
        <label><input type="checkbox" id="hidePlacementFail"> Hide internships that break my placement rules</label>
        <label id="fetchRow"><input type="checkbox" id="fetch"> Full score (load each description, slower)</label>
        <label><input type="checkbox" id="enabled"> Show scores in results</label>
        <div class="lg"><span><i style="background:#23905a"></i>70+</span><span><i style="background:#b47a12"></i>50–69</span><span><i style="background:#c0463b"></i>&lt;50</span><span>≈ estimate</span></div>
        <div class="note" id="status"></div>
      </div></div></div>`;
    document.documentElement.appendChild(host);
    const $ = id => shadow.getElementById(id);
    const c = shadow.querySelector('.c');
    const toggle = () => { cfg.collapsed = !cfg.collapsed; saveCfg(); updatePanel(); };
    shadow.querySelector('.h').onclick = toggle;
    shadow.querySelector('.h').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
    $('min').oninput = () => { $('minv').textContent = $('min').value + '%'; cfg.min = +$('min').value; render(); };
    $('min').onchange = saveCfg;
    shadow.querySelectorAll('.seg button').forEach(bt => bt.onclick = () => { cfg.mode = bt.dataset.m; saveCfg(); render(); });
    ['hideApplied', 'hideOutArea', 'hideSenior', 'hideSkip', 'onlyIntern', 'hidePlacementFail', 'fetch', 'enabled'].forEach(k => $(k).onchange = () => { cfg[k] = $(k).checked; saveCfg(); if (k === 'fetch' && cfg.fetch) cache.forEach(v => { v.failed = false; }); render(); });
    c.classList.toggle('collapsed', !!cfg.collapsed);
    $('fetchRow').hidden = !site.fetchUrl; // nothing to load on sites without background fetching
  }

  function updatePanel(shown, rated) {
    if (!cards.length) { if (host) host.remove(); return; }
    ensurePanel();
    const $ = id => shadow.getElementById(id);
    shadow.querySelector('.c').classList.toggle('collapsed', !!cfg.collapsed);
    $('arr').textContent = cfg.collapsed ? '▴' : '▾';
    $('min').value = cfg.min; $('minv').textContent = cfg.min + '%';
    shadow.querySelectorAll('.seg button').forEach(bt => bt.setAttribute('aria-pressed', bt.dataset.m === cfg.mode));
    ['hideApplied', 'hideOutArea', 'hideSenior', 'hideSkip', 'onlyIntern', 'hidePlacementFail', 'fetch', 'enabled'].forEach(k => { $(k).checked = !!cfg[k]; });
    if (shown != null) $('cnt').textContent = `${shown}/${cards.length}`;
    const pending = queue.length + active;
    $('status').textContent = !cfg.enabled ? 'Scores are off.'
      : Date.now() < pausedUntil ? 'The site is blocking automatic requests, so full ads are not loaded for a few hours. Scores are estimates (≈) from the cards; open a job to see its full score.'
      : cfg.fetch && failCount >= 3 && !rated ? 'This site does not return descriptions in the background, so scores are estimates (≈). Open a job to see its full score.'
      : cfg.fetch ? (pending ? `Loading descriptions: ${pending} left. Full score for ${rated || 0} of ${cards.length}.` : `Full score for ${rated || 0} of ${cards.length}. Hover a score to see why.`)
      : !site.fetchUrl ? 'Scores come from the card text (≈). Open a job to see its full score.' : 'Scores come from the card text (≈). Turn on full score to load each description.';
  }

  // ---------- Start and watch the list ----------
  let scanTimer = null;
  function scheduleScan(ms = 700) { clearTimeout(scanTimer); scanTimer = setTimeout(scan, ms); }
  function scan() {
    if (!profile || profile.listScan === false) { cards = []; updatePanel(); return; }
    const found = findCards();
    cards = found.length >= 3 ? found : [];
    render();
  }
  new MutationObserver(muts => {
    if (muts.every(m => [...m.addedNodes].every(n => n.nodeType === 1 && (n.classList && n.classList.contains('jt-card-badge'))))) return;
    scheduleScan(900);
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  loadState().then(() => scheduleScan(1200)).catch(() => {});
})();
