/* Job Tracker — контент-скрипт: ловит «Apply», собирает данные вакансии, показывает панель. */
(function () {
  'use strict';
  if (window.__jtLoaded) return;
  window.__jtLoaded = true;

  const A = globalThis.JT_Analyzer;
  const S = globalThis.JT_Store;

  const E = globalThis.JT_Extract;

  // ---------- Извлечение данных ----------
  const txt = el => (el ? (el.innerText || el.textContent || '').trim() : '');
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 50 && r.height > 50 && getComputedStyle(el).visibility !== 'hidden'; };

  // Открытая вакансия: правая панель (LinkedIn, Indeed), боковое окно (Reed) или блок вокруг кнопки
  const isBadHead = t => !t || t.length < 3 || t.length > 140 || E.BAD_TITLE.test(t);
  function scopeFromDescription(site) {
    if (!site.desc) return null;
    const d = E.q(site.desc, document);
    if (!d || !visible(d)) return null;
    let n = d.parentElement;
    for (let i = 0; n && i < 12 && n !== document.body; i++, n = n.parentElement) {
      const heads = [...n.querySelectorAll('h1, h2')].filter(h => (h.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING) && !isBadHead((h.textContent || '').trim()));
      if (heads.length) return n;
    }
    return null;
  }

  function findScope(originEl, site) {
    if (site.name === 'indeed') { const s = scopeFromDescription(site); if (s) return s; }
    if (site.pane) {
      const p = [...document.querySelectorAll(site.pane)].find(el => visible(el) && txt(el).length > 300);
      if (p) return p;
    }
    const cands = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], [data-qa*="drawer" i], [data-qa*="modal" i], [class*="drawer" i], [class*="Drawer"], [class*="job-details" i], [data-qa*="job-details" i]')]
      .filter(el => visible(el) && el.querySelector('h1, h2') && txt(el).length > 600 && !el.querySelector('input[type="file"]'));
    cands.sort((a, b) => txt(b).length - txt(a).length);
    if (cands[0]) return cands[0];
    if (originEl && site.name === 'other') {
      let n = originEl.parentElement;
      while (n && n !== document.body && n !== document.documentElement) {
        if (n.querySelector('h1, h2') && txt(n).length > 600) return n;
        n = n.parentElement;
      }
    }
    return null;
  }

  // Ссылка на вакансию рядом с нажатой кнопкой (карточка в списке) или в открытой панели
  function findJobLink(originEl, scope, site) {
    if (!site.cardLink) return null;
    const ok = h => site.cardLink.test(h);
    if (originEl) {
      let n = originEl;
      for (let i = 0; n && i < 12; i++, n = n.parentElement) {
        if (n.tagName === 'A' && ok(n.href)) return n.href;
        const links = n.querySelectorAll ? [...n.querySelectorAll('a[href]')].map(a => a.href).filter(ok) : [];
        const uniq = [...new Set(links.map(h => h.match(site.cardLink)[1]))];
        if (uniq.length === 1) return links[0];
        if (uniq.length > 1) break;
      }
    }
    if (scope) { const a = [...scope.querySelectorAll('a[href]')].map(x => x.href).find(ok); if (a) return a; }
    return null;
  }

  const isJobPage = site => {
    if (site.name === 'reed') return /\/jobs\/[^/?#]+\/\d+/.test(location.pathname);
    if (site.name === 'totaljobs') return /\/job\//.test(location.pathname);
    if (site.name === 'cvlibrary') return /\/job\/\d+/.test(location.pathname);
    return true;
  };

  const fetchCache = new Map();

  // Карточка выделенной вакансии в списке — самый надёжный источник названия, компании и города
  function fixFromCard(job, site) {
    const bad = t => !t || t.length < 3 || E.BAD_TITLE.test(t);
    const m = location.href.match(/[?&](?:vjk|jk)=([a-f0-9]{8,})/i);
    if (!m) return;
    const id = m[1];
    const anchor = document.querySelector(`[data-jk="${id}"], a[id="job_${id}"], a[href*="jk=${id}"]`);
    const card = anchor && (anchor.closest(site.cardSel) || anchor.closest('li'));
    if (!card) return;
    const tEl = card.querySelector(site.cardTitle) || anchor;
    const title = ((tEl.querySelector('[title]') || {}).title || tEl.textContent || '').replace(/\s+/g, ' ').trim();
    if (!bad(title)) job.title = title;
    const after = E.linesAfterTitle(card.innerText || '', title || job.title);
    if (after[0]) job.company = E.cleanTitleCompany(job.title, after[0]).company || job.company;
    if (after[1] && after[1].length < 60) job.location = after[1];
    if (id) job.url = S.cleanUrl(`${location.origin}/viewjob?jk=${id}`);
  }

  // LinkedIn часто меняет вёрстку. Если название не нашлось или это заголовок блока
  // («About the job»), берём данные из заголовка вкладки или из публичной версии вакансии.
  async function fixLinkedIn(job) {
    const bad = t => !t || t.length < 3 || E.BAD_TITLE.test(t);
    const m = location.href.match(/currentJobId=(\d+)/) || location.href.match(/\/jobs\/view\/(\d+)/);
    const id = m && m[1];
    if (bad(job.title)) {
      // 1) Активная карточка в списке слева
      if (id) {
        const card = document.querySelector(`[data-occludable-job-id="${id}"], [data-job-id="${id}"]`);
        const a = card && card.querySelector('a[href*="/jobs/view/"]');
        const t = a && (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').replace(/\s+with verification$/i, '').trim();
        if (t && !bad(t)) job.title = t;
      }
    }
    if (bad(job.title)) {
      // 2) Заголовок вкладки: «(3) Название | Компания | LinkedIn»
      const parts = document.title.replace(/^\(\d+\)\s*/, '').split(/\s+\|\s+/);
      if (parts.length >= 3 && !bad(parts[0])) { job.title = parts[0]; if (!job.company) job.company = parts[1]; }
    }
    if ((bad(job.title) || !job.company || !job.description || job.description.length < 200) && id) {
      // 3) Публичная версия вакансии
      try {
        const key = 'li:' + id;
        if (!fetchCache.has(key)) fetchCache.set(key, E.fetchAndParse(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`, `https://www.linkedin.com/jobs/view/${id}/`));
        const g = await fetchCache.get(key);
        if (bad(job.title) && !bad(g.title)) job.title = g.title;
        if (!job.company && g.company) job.company = g.company;
        if (!job.location && g.location) job.location = g.location;
        if ((job.description || '').length < 200 && g.description) job.description = g.description;
        if (!job.salaryText && g.salaryText) job.salaryText = g.salaryText;
      } catch (e) { /* нет сети — оставляем как есть */ }
    }
    if (bad(job.title)) job.title = '';
    if (id) job.url = `https://www.linkedin.com/jobs/view/${id}/`;
  }
  // Возвращает данные вакансии или null, если на странице нет одной открытой вакансии
  async function extractJob(originEl) {
    const site = E.siteFor(location.hostname);
    const scope = findScope(originEl, site);
    const needFetch = ['reed', 'totaljobs', 'cvlibrary'].includes(site.name) && !isJobPage(site);
    if (needFetch) {
      const link = findJobLink(originEl, scope, site);
      if (link) {
        const key = S.cleanUrl(link);
        if (!fetchCache.has(key)) fetchCache.set(key, E.fetchAndParse(link, link).catch(e => { fetchCache.delete(key); throw e; }));
        try { return await fetchCache.get(key); } catch (e) { console.warn('[Job Tracker] fetch', e); }
      }
      if (!scope) return null;
    }
    // Indeed иногда показывает вакансию во встроенном окне (iframe) того же сайта
    if (site.frame && window.top === window && (!scope || !(scope.innerText || '').trim() || (scope.innerText || '').length < 300)) {
      const fr = [...document.querySelectorAll(site.frame)].find(f => { try { return f.contentDocument && f.contentDocument.body; } catch (e) { return false; } });
      if (fr) {
        const d = fr.contentDocument;
        const j = E.parse(d, d, site, fr.contentWindow.location.href || fr.src, { useLd: true });
        if (j.description && j.description.length > 200) return j;
      }
    }
    const rootEl = scope || document;
    const job = E.parse(rootEl, document, site, location.href, { useLd: !scope || site.ldFirst, fallbackText: scope ? E.blockText(scope) : '' });
    if (site.name === 'linkedin') await fixLinkedIn(job);
    if (site.name === 'indeed') fixFromCard(job, site);
    if (!job.description || job.description.length < 200) {
      // Последний шанс: самый большой текстовый блок
      let best = '', len = 0;
      document.querySelectorAll('main section, main div, article, [class*="description"], [id*="description"]').forEach(el => {
        const t = el.innerText || '';
        if (t.length > len && t.length < 20000 && el.querySelectorAll('a').length < 40) { best = t; len = t.length; }
      });
      if (best.length > (job.description || '').length) job.description = best.slice(0, 15000);
    }
    return job;
  }

  async function buildRecord(originEl) {
    const job = await extractJob(originEl);
    if (!job) return null;
    const profile = await S.getProfile();
    const an = A.analyze(job, profile);
    const pageContacts = E.contactsFromDom(document);
    return {
      contacts: E.mergeContacts(job.contacts || [], pageContacts),
      notes: an.notes, benefits: an.benefits,
      title: job.title, company: job.company, location: job.location, url: job.url, platform: job.platform,
      description: job.description, category: an.category, workTypes: an.workTypes,
      salaryText: (an.salary && an.salary.text) || job.salaryText || '', salary: an.salary,
      tools: an.chance.tools, details: an.details, chance: an.chance,
    };
  }

  // ---------- Панель (Shadow DOM) ----------
  let host = null, shadow = null;
  const CSS = `
  :host{all:initial}
  .jt{position:fixed;top:16px;right:16px;z-index:2147483646;width:360px;max-height:calc(100vh - 32px);overflow:auto;
    background:#fbfcfd;color:#1c2733;border:1px solid #cfd8e1;border-radius:10px;box-shadow:0 12px 32px rgba(20,40,60,.22);
    font:13px/1.45 "Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
  .hd{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#1d3b53;color:#fff;border-radius:9px 9px 0 0}
  .hd b{font-size:13px;font-weight:600;flex:1}
  .tk{font:600 11px/1 "Cascadia Mono",Consolas,monospace;background:#2f5877;padding:4px 6px;border-radius:4px}
  .x{background:none;border:0;color:#fff;font-size:18px;cursor:pointer;line-height:1;padding:0 4px}
  .bd{padding:12px}
  label{display:block;font-size:11px;color:#5a6b7d;margin:8px 0 3px}
  input,select,textarea{width:100%;box-sizing:border-box;border:1px solid #cfd8e1;border-radius:6px;padding:6px 8px;font:inherit;color:inherit;background:#fff}
  input:focus,select:focus,textarea:focus{outline:2px solid #2f7fb5;outline-offset:0;border-color:#2f7fb5}
  textarea{resize:vertical;min-height:44px}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .chips{display:flex;flex-wrap:wrap;gap:4px}
  .chip{border:1px solid #cfd8e1;border-radius:12px;padding:2px 8px;font-size:11px;cursor:pointer;background:#fff;user-select:none}
  .chip.on{background:#1d3b53;color:#fff;border-color:#1d3b53}
  .score{display:flex;align-items:center;gap:10px;margin:4px 0 2px;padding:8px 10px;border-radius:8px;background:#eef3f7}
  .score .n{font:700 22px/1 "Segoe UI",system-ui,sans-serif;font-variant-numeric:tabular-nums}
  .tools{margin-top:6px;display:flex;flex-wrap:wrap;gap:4px}
  .t{font-size:11px;padding:1px 7px;border-radius:10px}
  .t.s{background:#dcefe3;color:#1d6b40}.t.b{background:#fbeccc;color:#7a5510}.t.m{background:#f7dcd9;color:#8f2f26}
  .ft{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e3e9ef;position:sticky;bottom:0;background:#fbfcfd}
  button.p{flex:1;background:#1f6fa8;color:#fff;border:0;border-radius:6px;padding:8px;font-weight:600;font-size:13px;line-height:1;cursor:pointer}
  button.s{background:#fff;color:#8f2f26;border:1px solid #e0b8b3;border-radius:6px;padding:8px 10px;font:inherit;cursor:pointer}
  button:focus-visible{outline:2px solid #2f7fb5;outline-offset:2px}
  .note{font-size:11px;color:#5a6b7d;margin-top:6px}
  .badge{position:fixed;right:18px;bottom:18px;z-index:2147483645;display:flex;align-items:center;gap:8px;cursor:pointer;
    background:#fbfcfd;color:#1c2733;border:1px solid #cfd8e1;border-radius:22px;padding:6px 12px 6px 6px;
    box-shadow:0 6px 18px rgba(20,40,60,.18);font:600 13px/1 "Segoe UI",system-ui,sans-serif}
  .badge:hover{border-color:#8fa9bf}
  .badge .pc{color:#fff;border-radius:16px;padding:6px 9px;font-variant-numeric:tabular-nums}
  .badge .hide{border:0;background:none;color:#8a96a3;font-size:15px;cursor:pointer;padding:0 0 0 2px;line-height:1}
  .reasons{list-style:none;margin:8px 0 0;padding:0;font-size:12px}
  .reasons li{display:flex;justify-content:space-between;gap:8px;padding:2px 0}
  .reasons b{font-variant-numeric:tabular-nums;white-space:nowrap}
  .det{margin:4px 0 0;padding-left:16px;font-size:12px}
  .det li{margin:2px 0}
  h4{font-size:12px;color:#5a6b7d;margin:12px 0 4px;font-weight:600}
  .toast{position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#1d3b53;color:#fff;padding:10px 14px;border-radius:8px;
    font:13px/1.4 "Segoe UI",system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:320px}
  .toast a{color:#9fd3ff;cursor:pointer;text-decoration:underline;margin-left:6px}
  `;

  function ensureHost() {
    if (host && document.documentElement.contains(host)) return;
    host = document.createElement('div');
    host.id = 'job-tracker-host';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${CSS}</style><div id="root"></div>`;
    document.documentElement.appendChild(host);
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function toast(msg, linkText, onLink, ms = 4500) {
    ensureHost();
    const root = shadow.getElementById('root');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = esc(msg) + (linkText ? `<a>${esc(linkText)}</a>` : '');
    if (linkText) t.querySelector('a').onclick = onLink;
    root.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  function scoreColor(n) { return n >= 70 ? '#23905a' : n >= 50 ? '#b47a12' : '#c0463b'; }

  function showPanel(app, { isNew }) {
    ensureHost();
    const root = shadow.getElementById('root');
    root.querySelector('.jt') && root.querySelector('.jt').remove();
    const c = app.chance || { score: 0, label: '—', matched: [], basic: [], missing: [] };
    const opt = (list, cur) => list.map(v => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
    const stOpt = A.STATUSES.map(s => `<option value="${s.id}" ${s.id === app.status ? 'selected' : ''}>${esc(s.label)}</option>`).join('');
    const platforms = S.PLATFORMS.includes(app.platform) ? S.PLATFORMS : [app.platform].concat(S.PLATFORMS);
    const box = document.createElement('div');
    box.className = 'jt';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Заявка сохранена в трекере');
    box.innerHTML = `
      <div class="hd"><span class="tk">${esc(app.ticket)}</span><b>${isNew ? 'Заявка сохранена' : 'Заявка в трекере'}</b><button class="x" title="Закрыть" aria-label="Закрыть">×</button></div>
      <div class="bd">
        <div class="score"><span class="n" style="color:${scoreColor(c.score)}">${c.score}%</span><div><b>Шансы: ${esc(c.label)}</b><div class="note" style="margin:0">по сравнению с твоим резюме</div></div></div>
        <div class="tools">${c.matched.map(t => `<span class="t s">${esc(t)}</span>`).join('')}${c.basic.map(t => `<span class="t b">${esc(t)}</span>`).join('')}${c.missing.map(t => `<span class="t m">${esc(t)}</span>`).join('')}</div>
        <label>Вакансия</label><input id="title" value="${esc(app.title)}">
        <div class="row"><div><label>Компания</label><input id="company" value="${esc(app.company)}"></div>
          <div><label>Локация</label><input id="location" value="${esc(app.location)}"></div></div>
        <div class="row"><div><label>Платформа</label><select id="platform">${opt(platforms, app.platform)}</select></div>
          <div><label>Статус</label><select id="status">${stOpt}</select></div></div>
        <label>Направление</label><select id="category">${opt(A.CATEGORY_NAMES, app.category)}</select>
        <label>Тип работы</label><div class="chips" id="wt">${A.WORK_TYPES.map(w => `<span class="chip ${app.workTypes.includes(w) ? 'on' : ''}" data-v="${esc(w)}" role="checkbox" tabindex="0" aria-checked="${app.workTypes.includes(w)}">${esc(w)}</span>`).join('')}</div>
        <label>Зарплата</label><input id="salaryText" value="${esc(app.salaryText)}" placeholder="Не указана — впиши, если узнаешь">
        ${(app.benefits || []).length ? `<label>Что даёт компания</label><ul class="det">${app.benefits.slice(0, 8).map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
        <label>Заметки (главное из описания — можно дописать своё)</label><textarea id="notes" rows="6" placeholder="Контакт рекрутера, что подготовить…">${esc(app.notes)}</textarea>
        <div class="note">Проверь поля: сайты меняют вёрстку, и что-то могло считаться неточно. Полное описание и важные детали — в дашборде.</div>
      </div>
      <div class="ft"><button class="p" id="save">Сохранить изменения</button><button class="s" id="undo">${isNew ? 'Отменить заявку' : 'Удалить'}</button></div>`;
    root.appendChild(box);
    const $ = id => box.querySelector('#' + id);
    box.querySelector('.x').onclick = () => box.remove();
    box.querySelectorAll('.chip').forEach(ch => {
      const toggle = () => { ch.classList.toggle('on'); ch.setAttribute('aria-checked', ch.classList.contains('on')); };
      ch.onclick = toggle;
      ch.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } };
    });
    $('save').onclick = async () => {
      const salaryText = $('salaryText').value.trim();
      await S.updateApp(app.id, {
        title: $('title').value.trim(), company: $('company').value.trim(), location: $('location').value.trim(),
        platform: $('platform').value, status: $('status').value, category: $('category').value,
        workTypes: [...box.querySelectorAll('.chip.on')].map(x => x.dataset.v),
        salaryText, salary: A.parseSalary(salaryText) || (salaryText ? { text: salaryText } : null),
        notes: $('notes').value,
      });
      box.remove();
      toast('Сохранено', 'Открыть дашборд', openDashboard, 3000);
    };
    $('undo').onclick = async () => {
      await S.deleteApp(app.id);
      box.remove();
      toast('Заявка удалена из трекера', null, null, 2500);
    };
  }

  function openDashboard() { chrome.runtime.sendMessage({ type: 'openDashboard' }); }

  // ---------- Шансы до подачи ----------
  const reasonsHtml = c => `<ul class="reasons">${(c.reasons || []).map(r => `<li><span>${esc(r.text)}</span><b style="color:${r.delta == null ? '#5a6b7d' : r.delta > 0 ? '#23905a' : r.delta < 0 ? '#c0463b' : '#5a6b7d'}">${r.delta == null ? 'база' : r.delta > 0 ? '+' + r.delta : r.delta === 0 ? 'совет' : r.delta}</b></li>`).join('')}</ul>`;
  const toolsHtml = c => `<div class="tools">${c.matched.map(t => `<span class="t s">${esc(t)}</span>`).join('')}${c.basic.map(t => `<span class="t b">${esc(t)}</span>`).join('')}${c.missing.map(t => `<span class="t m">${esc(t)}</span>`).join('')}</div>`;

  let previewSig = '', previewRec = null, previewHidden = false;

  function looksLikeJobPage(rec) {
    return rec && rec.title && rec.title.length > 3 && (rec.description || '').length > 300;
  }

  async function showPreviewPanel(rec, existing) {
    ensureHost();
    const root = shadow.getElementById('root');
    root.querySelector('.jt') && root.querySelector('.jt').remove();
    const c = rec.chance;
    const box = document.createElement('div');
    box.className = 'jt';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Шансы по этой вакансии');
    box.innerHTML = `
      <div class="hd">${existing ? `<span class="tk">${esc(existing.ticket)}</span>` : ''}<b>${existing ? 'Уже в трекере · ' + esc(A.statusLabel(existing.status)) : 'Шансы до подачи'}</b><button class="x" aria-label="Закрыть">×</button></div>
      <div class="bd">
        <div style="font-weight:600;margin-bottom:6px">${esc(rec.title)}${rec.company ? ' — ' + esc(rec.company) : ''}</div>
        <div class="score"><span class="n" style="color:${scoreColor(c.score)}">${c.score}%</span><div><b>Шансы: ${esc(c.label)}</b><div class="note" style="margin:0">${esc([rec.location, rec.salaryText].filter(Boolean).join(' · ') || 'по сравнению с твоим резюме')}</div></div></div>
        ${reasonsHtml(c)}
        <h4>Инструменты из вакансии</h4>
        ${c.tools.length ? toolsHtml(c) : '<div class="note">Не найдены в описании.</div>'}
        ${c.missing.length ? `<div class="note">Подготовиться: ${c.missing.map(esc).join(', ')}.</div>` : ''}
        ${(rec.benefits || []).length ? `<h4>Что даёт компания</h4><ul class="det">${rec.benefits.slice(0, 6).map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
        ${(rec.details || []).length ? `<h4>Важное из описания</h4><ul class="det">${rec.details.slice(0, 7).map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
        <div class="note">Заявка сохранится автоматически, когда нажмёшь «Apply».</div>
      </div>
      <div class="ft"><button class="p" id="close">Понятно</button><button class="s" id="hide" style="color:#5a6b7d;border-color:#cfd8e1">Скрыть здесь</button></div>`;
    root.appendChild(box);
    box.querySelector('.x').onclick = () => box.remove();
    box.querySelector('#close').onclick = () => box.remove();
    box.querySelector('#hide').onclick = () => { previewHidden = true; box.remove(); removeBadge(); };
  }

  function removeBadge() { if (shadow) { const b = shadow.getElementById('root').querySelector('.badge'); if (b) b.remove(); } }

  async function refreshPreview(force) {
    if (window.top !== window) return; // внутри встроенного окна значок не нужен — его покажет основная страница
    try {
      const profile = await S.getProfile();
      if (!force && (profile.showPreview === false || previewHidden)) { removeBadge(); return; }
      const rec = await buildRecord();
      if (!looksLikeJobPage(rec)) { removeBadge(); previewSig = ''; return force ? null : undefined; }
      const sig = rec.title + '|' + rec.company + '|' + Math.round(rec.description.length / 200);
      const existing = await S.findByUrl(rec.url);
      if (sig === previewSig && !force) return;
      previewSig = sig; previewRec = rec;
      ensureHost();
      const root = shadow.getElementById('root');
      removeBadge();
      const c = rec.chance;
      const b = document.createElement('div');
      b.className = 'badge';
      b.setAttribute('role', 'button');
      b.setAttribute('tabindex', '0');
      b.title = 'Подробнее о шансах';
      b.innerHTML = `<span class="pc" style="background:${scoreColor(c.score)}">${c.score}%</span><span>${existing ? esc(A.statusLabel(existing.status)) : 'Шансы: ' + esc(c.label.toLowerCase())}</span><button class="hide" aria-label="Скрыть">×</button>`;
      b.onclick = e => { if (e.target.closest('.hide')) { previewHidden = true; b.remove(); return; } showPreviewPanel(previewRec, existing); };
      b.onkeydown = e => { if (e.key === 'Enter') showPreviewPanel(previewRec, existing); };
      root.appendChild(b);
      if (force) showPreviewPanel(rec, existing);
    } catch (e) {
      if (!String(e).includes('Extension context invalidated')) console.warn('[Job Tracker]', e);
    }
  }

  // Следим за сменой вакансии (LinkedIn и Indeed меняют вакансию без перезагрузки страницы)
  let lastUrl = location.href, previewTimer = null;
  const schedulePreview = (ms = 900) => { clearTimeout(previewTimer); previewTimer = setTimeout(() => refreshPreview(false), ms); };
  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; previewHidden = false; previewSig = ''; schedulePreview(1200); }
    else schedulePreview(1500);
  }).observe(document.documentElement, { childList: true, subtree: true });
  schedulePreview(1200);
  // Встроенное окно вакансии (Indeed) меняет адрес без изменения основной страницы
  new MutationObserver(() => { previewSig = ''; schedulePreview(1500); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['src'], subtree: true });
  document.addEventListener('load', e => { if (e.target && e.target.tagName === 'IFRAME') { previewSig = ''; schedulePreview(800); } }, true);

  let busy = false;
  async function captureApplication(source, originEl) {
    if (busy) return;
    busy = true;
    try {
      const rec = await buildRecord(originEl);
      if (!rec) { toast('Не получилось определить вакансию на этой странице', 'Добавить вручную', openDashboard, 6000); return; }
      const existing = await S.findByUrl(rec.url);
      if (existing) {
        if (source === 'manual') showPanel(existing, { isNew: false });
        else toast(`Уже в трекере: ${existing.ticket} · ${A.statusLabel(existing.status)}`, 'Показать', () => showPanel(existing, { isNew: false }));
        return;
      }
      const app = await S.addApp(rec);
      showPanel(app, { isNew: true });
      previewSig = '';
      setTimeout(() => refreshPreview(false), 500);
    } catch (e) {
      if (String(e).includes('Extension context invalidated')) toast('Расширение обновилось — перезагрузи страницу');
      else console.warn('[Job Tracker]', e);
    } finally {
      setTimeout(() => { busy = false; }, 1500);
    }
  }

  // ---------- Перехват кнопки «Apply» ----------
  const APPLY_RE = /^(easy apply|apply|apply now|quick apply|apply on (the )?company (site|website)|apply on employer site|continue to apply|continue applying|apply externally|apply for (this )?job|apply with (indeed|cv)|submit application|send application|подать заявку|откликнуться|податися|податись)\b/i;
  const NOT_RE = /(filter|applied|already|save|alert|show results|sign in|clear)/i;

  const APPLY_ATTR = '.jobs-apply-button, [data-live-test-job-apply-button], [data-control-name*="apply" i], [id*="applyButton" i], [id^="jobsearch-ApplyButton"], [data-testid*="apply-button" i], [data-testid*="applyButton" i], [data-qa*="apply" i], [data-at*="apply-button" i], [class*="apply-button" i], [class*="applyButton" i]';

  // LinkedIn после возврата с сайта компании спрашивает «Did you apply?» — «Yes» тоже считаем подачей
  function isDidApplyYes(el) {
    const inner = ((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')).trim();
    if (!/^(yes|да|так)\b/i.test(inner)) return false;
    const box = el.closest('[role="dialog"], [role="alertdialog"], .artdeco-modal, .jobs-post-apply-modal, [class*="modal" i], [class*="toast" i], [class*="banner" i]') || el.parentElement && el.parentElement.parentElement;
    return !!box && /did you (apply|finish applying)|applied\?|вы подали|ви подали/i.test(box.innerText || '');
  }

  function isApplyButton(el) {
    if (el.matches && el.matches(APPLY_ATTR) && !/applied|save|filter/i.test(el.innerText || '')) return true;
    const inner = ((el.innerText || el.value || '') + '').replace(/\s+/g, ' ').trim();
    const aria = (el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    if (inner.length > 60) return false;
    if (inner && NOT_RE.test(inner)) return false;
    return (inner && APPLY_RE.test(inner)) || (aria && APPLY_RE.test(aria) && !NOT_RE.test(aria.slice(0, 20)));
  }

  function findClickable(e) {
    const path = e.composedPath ? e.composedPath() : [e.target];
    for (const n of path) {
      if (!n || n.nodeType !== 1) continue;
      if (host && n === host) return null;
      if (n.matches && n.matches('button, a, [role="button"], [role="link"], input[type="submit"], ' + APPLY_ATTR)) return n;
    }
    return null;
  }

  let lastHit = 0;
  async function onPress(e) {
    if (e.type === 'auxclick' && e.button !== 1) return;
    const el = findClickable(e);
    if (!el) return;
    const apply = isApplyButton(el), yes = !apply && isDidApplyYes(el);
    if (!apply && !yes) return;
    if (Date.now() - lastHit < 1500) return;
    lastHit = Date.now();
    let auto = true;
    try { auto = (await S.getProfile()).autoDetect !== false; } catch (err) { return; }
    if (auto) captureApplication('click', el);
  }
  // pointerdown срабатывает раньше, чем сайт успеет открыть новую вкладку или сменить страницу
  window.addEventListener('pointerdown', e => { if (e.button === 0 || e.button === 1) onPress(e); }, true);
  window.addEventListener('click', onPress, true);
  window.addEventListener('auxclick', onPress, true);
  window.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') onPress(e); }, true);

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg && msg.type === 'manualAdd') { captureApplication('manual'); reply({ ok: true }); }
    if (msg && msg.type === 'ping') reply({ ok: true });
    if (msg && msg.type === 'preview') {
      previewHidden = false;
      refreshPreview(true).then(r => { if (r === null) toast('Не вижу описания вакансии на этой странице'); });
      reply({ ok: true });
    }
  });
})();
