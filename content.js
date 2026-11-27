/* Job Tracker — content script: catches Apply clicks, reads the job and shows the side panel. */
(function () {
  'use strict';
  if (window.__jtLoaded) return;
  window.__jtLoaded = true;

  const A = globalThis.JT_Analyzer;
  const S = globalThis.JT_Store;

  const E = globalThis.JT_Extract;
  const I = globalThis.JT_Insights;

  // ---------- Reading the job ----------
  const txt = el => (el ? (el.innerText || el.textContent || '').trim() : '');
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 50 && r.height > 50 && getComputedStyle(el).visibility !== 'hidden'; };

  // The open job: right-hand pane (LinkedIn, Indeed), side drawer (Reed) or the block around the button
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

  // Job link next to the pressed button (a card in the list) or in the open pane
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

  // CV-Library's split view (also it-jobs.co.uk, which runs on the same platform): the open job is ?jobId=… in the address, shown in a pane on the right.
  // The pane has no JSON-LD, so the job page itself is fetched (same site, same cookies).
  function paneJobLink(originEl, site) {
    if (site.name !== 'cvlibrary') return null;
    const id = new URL(location.href).searchParams.get('jobId');
    if (!id || !/^\d{5,}$/.test(id)) return null;
    const inPane = !originEl || originEl.closest('[class*="JobDetailPane"], [class*="JobView_"]');
    if (!inPane) return null;
    const card = document.querySelector(`a[href*="/job/${id}/"]`);
    return card ? card.href : `${location.origin}/job/${id}`;
  }

  const isJobPage = site => {
    if (site.name === 'reed') return /\/jobs\/[^/?#]+\/\d+/.test(location.pathname);
    if (site.name === 'totaljobs') return /\/job\//.test(location.pathname);
    if (site.name === 'cvlibrary') return /\/job\/\d+/.test(location.pathname);
    return true;
  };

  const fetchCache = new Map();

  // The highlighted card in the list is the most reliable source of title, company and town
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

  // LinkedIn changes its markup often. If the title is missing or is a section heading
  // ('About the job'), fall back to the tab title or the public version of this one job.
  async function fixLinkedIn(job) {
    const bad = t => !t || t.length < 3 || E.BAD_TITLE.test(t);
    const m = location.href.match(/currentJobId=(\d+)/) || location.href.match(/\/jobs\/view\/(\d+)/);
    const id = m && m[1];
    if (bad(job.title)) {
      // 1) The active card in the left-hand list
      if (id) {
        const card = document.querySelector(`[data-occludable-job-id="${id}"], [data-job-id="${id}"]`);
        const a = card && card.querySelector('a[href*="/jobs/view/"]');
        const t = a && (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').replace(/\s+with verification$/i, '').trim();
        if (t && !bad(t)) job.title = t;
      }
    }
    if (bad(job.title)) {
      // 2) Tab title: '(3) Title | Company | LinkedIn'
      const parts = document.title.replace(/^\(\d+\)\s*/, '').split(/\s+\|\s+/);
      if (parts.length >= 3 && !bad(parts[0])) { job.title = parts[0]; if (!job.company) job.company = parts[1]; }
    }
    if ((bad(job.title) || !job.company || !job.description || job.description.length < 200) && id) {
      // 3) Public version of the job the user is viewing (one request, same origin)
      try {
        const key = 'li:' + id;
        if (!fetchCache.has(key)) fetchCache.set(key, E.fetchAndParse(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`, `https://www.linkedin.com/jobs/view/${id}/`));
        const g = await fetchCache.get(key);
        if (bad(job.title) && !bad(g.title)) job.title = g.title;
        if (!job.company && g.company) job.company = g.company;
        if (!job.location && g.location) job.location = g.location;
        if ((job.description || '').length < 200 && g.description) job.description = g.description;
        if (!job.salaryText && g.salaryText) job.salaryText = g.salaryText;
      } catch (e) { /* offline: keep what we have */ }
    }
    if (bad(job.title)) job.title = '';
    if (id) job.url = `https://www.linkedin.com/jobs/view/${id}/`;
  }
  // Returns the job, or null when the page has no single open job
  async function extractJob(originEl) {
    const site = E.siteFor(location.hostname);
    const scope = findScope(originEl, site);
    const needFetch = ['reed', 'totaljobs', 'cvlibrary'].includes(site.name) && !isJobPage(site);
    // Sites with strict bot protection: read the open drawer or the ad seen just before, never fetch
    if (needFetch && site.noFetch) {
      if (scope) return E.parse(scope, document, site, location.href, { useLd: false, fallbackText: E.blockText(scope) });
      const prev = await E.recentJob(location.hostname).catch(() => null);
      const link = originEl && findJobLink(originEl, null, site);
      // Apply pressed on a result card: the card is the job, unless it is the ad seen just before
      if (link && !(prev && prev.url && S.normUrl(prev.url) === S.normUrl(link))) {
        let card = originEl;
        for (let i = 0; card && i < 8 && !(card.querySelector && card.querySelector('a[href]') && txt(card).length > 80); i++) card = card.parentElement;
        const text = card ? E.blockText(card) : '';
        const title = (text.split('\n').find(l => l.trim().length > 3) || '').trim();
        return { title, company: (E.linesAfterTitle(text, title)[0] || ''), location: '', description: text, url: S.cleanUrl(link), platform: S.platformFromUrl(link) };
      }
      return prev;
    }
    if (needFetch) {
      const link = paneJobLink(originEl, site) || findJobLink(originEl, scope, site);
      if (link) {
        const key = S.cleanUrl(link);
        // A failed fetch is remembered for 10 minutes: the page changes often, and retrying on
        // every change would hammer a site that is already refusing (Totaljobs 'Access Denied')
        if (!fetchCache.has(key)) fetchCache.set(key, E.fetchAndParse(link, link).catch(e => { setTimeout(() => fetchCache.delete(key), 10 * 60e3); throw e; }));
        try { return await fetchCache.get(key); } catch (e) { console.warn('[Job Tracker] fetch', e); }
      }
      if (!scope) return null;
    }
    // Indeed sometimes shows the job inside a same-site iframe
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
      // Last resort: the largest block of text
      let best = '', len = 0;
      document.querySelectorAll('main section, main div, article, [class*="description"], [id*="description"]').forEach(el => {
        const t = el.innerText || '';
        if (t.length > len && t.length < 20000 && el.querySelectorAll('a').length < 40) { best = t; len = t.length; }
      });
      const Q = globalThis.JT_Quality;
      const usable = t => !Q || (!Q.looksLikeResultsList(t) && !Q.looksLikeApplicationForm(t));
      if (best.length > (job.description || '').length && usable(best)) job.description = best.slice(0, 15000);
    }
    return job;
  }

  // Text near the job header: 'Reposted 2 weeks ago · Over 100 people clicked apply'
  const TOP_CARD = '.job-details-jobs-unified-top-card__tertiary-description-container, .job-details-jobs-unified-top-card__primary-description-container, .jobs-unified-top-card__subtitle-primary-grouping, .jobs-unified-top-card, .job-details-jobs-unified-top-card__container--two-pane, [data-testid="jobsearch-JobInfoHeader-title"] ~ div, .jobsearch-JobMetadataFooter, [data-testid="myJobsStateDate"], .job-header, [class*="jobHeader" i], [class*="job-header" i]';
  function postingText(originEl, job) {
    const parts = [];
    document.querySelectorAll(TOP_CARD).forEach(el => { if (parts.length < 6) parts.push(txt(el).slice(0, 600)); });
    const scope = findScope(originEl, E.siteFor(location.hostname));
    if (scope) parts.push(txt(scope).slice(0, 4000));
    if (job.headText) parts.push(job.headText);
    return parts.join(' · ');
  }
  function postingFor(originEl, job) {
    if (!I) return null;
    const m = I.postingMeta(postingText(originEl, job));
    let daysAgo = m.postedDaysAgo;
    const ld = job.datePosted && new Date(job.datePosted);
    if (daysAgo == null && ld && !isNaN(ld) && ld <= new Date()) daysAgo = Math.floor((Date.now() - ld) / 864e5);
    if (daysAgo == null && m.applicants == null) return null;
    return { daysAgo, reposted: m.reposted, applicants: m.applicants, applicantsText: m.applicantsText, seenAt: new Date().toISOString() };
  }

  // The block around the job title: company, place, pay and work type chips. Short lines only (not the ad).
  const HEAD_SEL = '.job-details-fit-level-preferences, .job-details-preferences-and-skills, .jobs-unified-top-card__job-insight, [class*="job-insight" i], [class*="jobsearch-JobInfoHeader" i], [data-testid*="jobDetails" i] [data-testid*="salary" i], [data-testid*="attribute" i], [id*="salaryInfoAndJobType" i]';
  function headerText(job) {
    const lines = [];
    try {
      // chip by chip: buttons sit side by side with no space between them in the text
      document.querySelectorAll(HEAD_SEL).forEach(el => { if (lines.length < 30) { const leaves = [...el.querySelectorAll('*')].filter(x => !x.children.length && txt(x)); (leaves.length ? leaves.map(txt) : [txt(el)]).forEach(t => lines.push(...t.split(/\n|·/))); } });
      const t = String(job.title || '').trim().toLowerCase().slice(0, 40);
      const h = [...document.querySelectorAll('h1, h2')].find(x => t && txt(x).toLowerCase().includes(t)) || document.querySelector('h1');
      let el = h;
      for (let i = 0; el && i < 6; i++) { el = el.parentElement; const n = el ? (el.innerText || '').length : 0; if (n > 200) break; }
      if (el) lines.push(...(el.innerText || '').slice(0, 2500).split(/\n|·/));
    } catch (e) { /* the description still has most of it */ }
    return lines.map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l && l.length < 70).slice(0, 60).join('\n');
  }

  async function buildRecord(originEl, how) {
    let job = await extractJob(originEl);
    if (!job) return null;
    const Q = globalThis.JT_Quality;
    // An application form instead of an ad: use the ad opened on this site in the last 45 minutes
    if (Q && (Q.looksLikeApplicationForm(job.description || '') || ((!job.title || Q.isJunkTitle(job.title)) && /apply|application/i.test(location.pathname)))) {
      const prev = await E.recentJob(location.hostname).catch(() => null);
      if (prev) job = { ...job, ...prev, contacts: E.mergeContacts(prev.contacts || [], job.contacts || []) };
    }
    // A search heading or form title instead of the job title: look for the real one in the text
    if (Q && (!job.title || Q.isJunkTitle(job.title))) {
      const raw = job.description || '';
      const h = (Q.looksLikeApplicationForm(raw) && Q.headerFromForm(raw)) || Q.recoverHeader(Q.cleanDescription(raw).text) || Q.recoverHeader(raw);
      if (h && h.title) { job.title = h.title; if (h.company && !job.company) job.company = h.company; }
    }
    // The facts shown above the ad (LinkedIn chips '35K GBP/yr + Bonus', 'Hybrid', 'Full-time'; pay in the title)
    // are often not in the description: read them so pay and work type are not missed
    const head = headerText(job);
    if (head) {
      job.employmentType = [job.employmentType, head].filter(Boolean).join(' ');
      const hw = A.detectWorkTypes(head);
      if (hw.length && job.workTypes && job.workTypes.length) job.workTypes = [...new Set(job.workTypes.concat(hw))];
    }
    if (!job.salaryText) {
      const pay = A.parseSalary(job.title || '') || head.split('\n').map(l => l.trim()).filter(l => l.length < 70 && /£|gbp/i.test(l)).map(l => A.parseSalary(l)).find(x => x && x.annualMax >= 8000 && x.annualMax <= 250000);
      if (pay) job.salaryText = pay.text;
    }
    const profile = await S.getProfile();
    const an = A.analyze(job, profile);
    const pageContacts = E.contactsFromDom(document);
    let atsMatch = null, cvLabel = '';
    try {
      const { cvs } = await S.get('cvs');
      const cv = cvs && cvs[an.track];
      if (cv && cv.name) cvLabel = cv.name + (cv.at ? ' (' + new Date(cv.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ')' : '');
      const skills = an.track === 'intern' ? profile.intern.skills : profile.skills;
      if (cv && cv.text && globalThis.JT_CV) atsMatch = JT_CV.jobMatch(cv.text, job, skills);
    } catch (e) { /* no CV loaded */ }
    // A CV made on the Tailor CV page for this job in the last 30 days
    let tailored = null;
    try {
      const { tailoredCvs = [] } = await S.get('tailoredCvs');
      const key = job.url ? S.normUrl(job.url) : '';
      tailored = key && tailoredCvs.slice().reverse().find(t => t.urlKey === key && Date.now() - Date.parse(t.at) < 30 * 864e5);
    } catch (e) { /* nothing tailored */ }
    return {
      track: an.track, placement: an.placement, atsMatch,
      contacts: E.mergeContacts(job.contacts || [], pageContacts),
      notes: an.notes, benefits: an.benefits,
      title: job.title, company: job.company, location: job.location, url: job.url, platform: job.platform,
      description: an.description || job.description, category: an.category, workTypes: an.workTypes,
      salaryText: (an.salary && an.salary.text) || job.salaryText || '', salary: an.salary,
      tools: an.chance.tools, details: an.details, chance: an.chance,
      fitPrecise: (() => { try { const F = globalThis.JT_Fit; if (!F) return null; const f = F.compute(F.fromAd(an.description || job.description, job.company), profile, job); return { score: f.score, summary: f.summary, source: 'ad' }; } catch (e) { return null; } })(),
      posting: postingFor(originEl, job),
      reqs: I ? I.requirements(an.description || job.description) : null,
      apply: {
        method: I && how ? I.methodFromButton(how.text, job.platform, how.yes) : 'unknown',
        button: how && how.text ? how.text.slice(0, 40) : '',
        cover: (profile.applyDefaults && profile.applyDefaults.cover) || 'none',
        cv: tailored && tailored.file ? tailored.file : cvLabel,
        ...(tailored && tailored.file ? { cvTailored: true } : {}),
        ...(tailored && tailored.cover ? { cover: 'tailored' } : {}),
      },
    };
  }

  // ---------- Panel (Shadow DOM) ----------
  // 3.11: the same look as the dashboard and the phone (sage, white paper, forest green), and the AI at work:
  // requirements read by AI, the precise Fit and the chance computed by code, a cover letter, form answers,
  // and "For tonight" that puts the job into the application session with its pack prepared.
  let host = null, shadow = null;
  const L = (en, ru) => (globalThis.JT_I18n && JT_I18n.lang === 'ru' ? ru : en);
  const CSS = `
  :host{all:initial}
  .jt{position:fixed;top:14px;right:14px;z-index:2147483646;width:380px;max-height:calc(100vh - 28px);overflow:auto;
    background:#fbfcfa;color:#14201b;border:1px solid #d3d9d0;border-radius:18px;box-shadow:0 16px 40px rgba(10,24,18,.22);
    font:13.5px/1.5 "Golos Text","Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
  .hd{display:flex;align-items:center;gap:8px;padding:12px 14px 8px}
  .hd b{flex:1;font-size:12.5px;color:#5c6a62;font-weight:600}
  .lg{width:22px;height:22px;border-radius:7px;background:#1d6b4f;position:relative;flex:none}
  .lg::after{content:"";position:absolute;left:6px;top:5px;width:9px;height:5px;border-left:2.5px solid #fff;border-bottom:2.5px solid #fff;transform:rotate(-45deg)}
  .tk{font:600 11.5px/1 "Golos Text",system-ui,sans-serif;background:#f2f4ef;padding:4px 7px;border-radius:7px;color:#14201b}
  .x{background:none;border:0;color:#5c6a62;font-size:20px;cursor:pointer;line-height:1;padding:0 4px}
  .bd{padding:0 14px 12px;display:flex;flex-direction:column;gap:10px}
  .job{font-weight:700;font-size:15px;line-height:1.3}
  .sub{color:#5c6a62;font-size:12.5px}
  .tags{display:flex;flex-wrap:wrap;gap:5px}
  .tag{font-size:11.5px;font-weight:650;padding:2px 8px;border-radius:7px;background:#f2f4ef;color:#14201b}
  .tag.B{background:#dcebe3;color:#1d6b4f}.tag.A{background:#f6e7cf;color:#a85f00}.tag.bad{background:#f7ddd6;color:#c23b22}.tag.ok{background:#dcebe3;color:#1d6b4f}.tag.warn{background:#f6e7cf;color:#a85f00}
  .box{border-radius:14px;background:#f2f4ef;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
  .box.warn{background:#f6e7cf}.box.bad{background:#f7ddd6}.box.info{background:#dde8f2}
  .box h5{margin:0;font-size:12.5px}
  ul.ck{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;font-size:12.5px}
  ul.ck li{display:grid;grid-template-columns:18px 1fr;gap:6px}
  ul.ck i{font-style:normal;font-weight:800;text-align:center}
  .k1{color:#1d6b4f}.k2{color:#a85f00}.k3{color:#c23b22}.k4{color:#5c6a62}
  .tools{display:flex;flex-wrap:wrap;gap:4px}
  .t{font-size:11.5px;padding:2px 8px;border-radius:8px;font-weight:600}
  .t.s{background:#dcebe3;color:#1d6b4f}.t.b{background:#f6e7cf;color:#a85f00}.t.m{background:#f7ddd6;color:#c23b22}
  .acts{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  button.a{border:1.5px solid #d3d9d0;background:#fff;border-radius:11px;padding:8px 10px;font:600 12.5px/1.2 "Golos Text",system-ui,sans-serif;color:#14201b;cursor:pointer;text-align:left}
  button.a:hover{border-color:#1d6b4f}
  button.a.go{background:#1d6b4f;border-color:#1d6b4f;color:#fff}
  button.a[disabled]{opacity:.55;cursor:default}
  .out{display:flex;flex-direction:column;gap:6px}
  .out textarea{min-height:170px;font:12.5px/1.5 "Golos Text",system-ui,sans-serif}
  .qa{border-top:1px solid #e4e8e1;padding-top:6px}.qa b{display:block;font-size:11.5px;color:#5c6a62;font-weight:600}
  label{display:block;font-size:11.5px;color:#5c6a62;margin:6px 0 3px}
  input,select,textarea{width:100%;box-sizing:border-box;border:1.5px solid #d3d9d0;border-radius:10px;padding:7px 9px;font:inherit;color:inherit;background:#fff}
  input:focus,select:focus,textarea:focus{outline:none;border-color:#1d6b4f;box-shadow:0 0 0 3px #dcebe3}
  textarea{resize:vertical;min-height:44px}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .chips{display:flex;flex-wrap:wrap;gap:4px}
  .chip{border:1.5px solid #d3d9d0;border-radius:12px;padding:2px 8px;font-size:11.5px;cursor:pointer;background:#fff;user-select:none}
  .chip.on{background:#14201b;color:#fff;border-color:#14201b}
  .ft{display:flex;gap:8px;padding:10px 14px;border-top:1px solid #e4e8e1;position:sticky;bottom:0;background:#fbfcfa}
  button.p{flex:1;background:#1d6b4f;color:#fff;border:0;border-radius:11px;padding:10px;font:600 13px/1 "Golos Text",system-ui,sans-serif;cursor:pointer}
  button.s{background:#fff;color:#14201b;border:1.5px solid #d3d9d0;border-radius:11px;padding:9px 12px;font:600 12.5px/1 "Golos Text",system-ui,sans-serif;cursor:pointer}
  button.s.red{color:#c23b22;border-color:#f7ddd6}
  button:focus-visible{outline:2.5px solid #1d6b4f;outline-offset:2px}
  .top{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:start}
  .vbox{text-align:right}.vbox .num{font-size:30px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap}.vbox .vl{font-size:11.5px;font-weight:700;max-width:120px}
  ul.sc{background:#f2f4ef;border-radius:14px;padding:10px 12px;gap:5px}
  ul.sc b{font-weight:700}
  .tabs{display:flex;gap:2px;border-bottom:1.5px solid #e4e8e1;margin:0 -2px;overflow-x:auto}
  .tabs button{flex:1;border:0;background:none;padding:7px 4px 8px;font:600 12px/1 "Golos Text",system-ui,sans-serif;color:#5c6a62;cursor:pointer;border-bottom:2.5px solid transparent;margin-bottom:-1.5px;white-space:nowrap}
  .tabs button[aria-selected=true]{color:#1d6b4f;border-bottom-color:#1d6b4f}
  .pane{display:flex;flex-direction:column;gap:8px}
  .jd{white-space:pre-wrap;font-size:12px;max-height:260px;overflow:auto;background:#fff;border:1px solid #e4e8e1;border-radius:10px;padding:8px;margin-top:6px}
  ul.hist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;font-size:12px}
  ul.hist li{display:grid;grid-template-columns:52px 1fr auto;gap:6px;align-items:baseline}
  ul.hist li.undone span{text-decoration:line-through;opacity:.6}
  label.inl{display:flex;gap:6px;align-items:center;color:#14201b;font-size:12.5px}label.inl input{width:auto;margin:0}
  button.a.red{color:#c23b22;border-color:#f7ddd6}
  .tag.pay{background:#14201b;color:#fff}
  .jt{overflow-x:hidden}.bd,.pane,.box{min-width:0}.note,.sub,.box span,label.inl{overflow-wrap:anywhere}label.inl{flex-wrap:wrap}
  .note{font-size:11.5px;color:#5c6a62}
  a.lk{color:#1d6b4f;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
  details>summary{cursor:pointer;font-size:12.5px;font-weight:650;color:#5c6a62;list-style:none}
  details>summary::-webkit-details-marker{display:none}
  details>summary::before{content:"▸ "}details[open]>summary::before{content:"▾ "}
  .reasons{list-style:none;margin:6px 0 0;padding:0;font-size:12px}
  .reasons li{display:flex;justify-content:space-between;gap:8px;padding:2px 0}
  .det{margin:4px 0 0;padding-left:16px;font-size:12px}
  .spin{display:inline-block;width:11px;height:11px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:sp .7s linear infinite;vertical-align:-1px}
  @keyframes sp{to{transform:rotate(360deg)}}
  .badge{position:fixed;right:18px;bottom:18px;z-index:2147483645;display:flex;align-items:center;gap:8px;cursor:pointer;
    background:#fbfcfa;color:#14201b;border:1px solid #d3d9d0;border-radius:22px;padding:6px 12px 6px 6px;
    box-shadow:0 8px 22px rgba(10,24,18,.2);font:600 13px/1 "Golos Text","Segoe UI",system-ui,sans-serif}
  .badge:hover{border-color:#1d6b4f}
  .badge .pc{color:#fff;border-radius:16px;padding:6px 9px;font-variant-numeric:tabular-nums}
  .badge .hide{border:0;background:none;color:#8a968f;font-size:15px;cursor:pointer;padding:0 0 0 2px;line-height:1}
  .toast{position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#14201b;color:#fbfcfa;padding:11px 14px;border-radius:12px;
    font:13px/1.4 "Golos Text","Segoe UI",system-ui,sans-serif;box-shadow:0 10px 26px rgba(0,0,0,.25);max-width:330px}
  .toast a{color:#a8e0c4;cursor:pointer;text-decoration:underline;margin-left:6px}
  @media (prefers-reduced-motion:reduce){.spin{animation:none}}
  `;

  function ensureHost() {
    if (host && document.documentElement.contains(host)) return;
    host = document.createElement('div');
    host.id = 'job-tracker-host';
    shadow = host.attachShadow({ mode: 'open' });
    if (globalThis.JT_I18n) JT_I18n.watch(shadow);
    shadow.innerHTML = `<style>${CSS}</style><div id="root"></div>`;
    document.documentElement.appendChild(host);
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const send = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => res(r || {})); } catch (e) { res({ error: String(e) }); } });

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

  // Colour by verdict, not by the number: a job you are ruled out of is red whatever its score
  const VCOL = { apply: '#1d6b4f', tailor: '#1d6b4f', ask: '#a85f00', skip: '#c23b22', incomplete: '#5c6a62' };
  const vColor = c => (c && c.verdict ? VCOL[c.verdict] : '#5c6a62');
  const VLABEL = { apply: ['Apply', 'Подавай'], tailor: ['Tailor the CV and apply', 'Подгони CV и подавай'], ask: ['Check first', 'Сначала уточни'], skip: ['Better not to apply', 'Лучше не подавать'], incomplete: ['Not enough data', 'Мало данных'] };
  const toolsHtml = c => `<div class="tools">${(c.matched || []).map(t => `<span class="t s">${esc(t)}</span>`).join('')}${(c.basic || []).map(t => `<span class="t b">${esc(t)}</span>`).join('')}${(c.missing || []).map(t => `<span class="t m">${esc(t)}</span>`).join('')}</div>`;
  const reasonsHtml = c => `<ul class="reasons">${(c.reasons || []).map(r => `<li><span>${esc(r.text)}</span><b style="color:${r.delta == null ? '#5c6a62' : r.delta > 0 ? '#1d6b4f' : r.delta < 0 ? '#c23b22' : '#5c6a62'}">${r.delta == null ? 'base' : r.delta > 0 ? '+' + r.delta : r.delta === 0 ? 'tip' : r.delta}</b></li>`).join('')}</ul>`;
  const PL_ICON = { ok: ['✓', 'k1'], warn: ['!', 'k2'], fail: ['✕', 'k3'], unknown: ['?', 'k4'], info: ['i', 'k4'] };
  const PL_HEAD = { ok: 'Fits your placement rules', warn: 'Placement rules: check with the employer', unknown: 'Placement rules: the ad does not say, ask', fail: 'Breaks your placement rules' };
  const placementHtml = (pl, compact) => {
    if (!pl) return '';
    const items = compact ? pl.items.filter(i => i.state !== 'ok') : pl.items;
    return `<div class="box ${pl.verdict === 'fail' ? 'bad' : pl.verdict === 'ok' ? '' : 'warn'}"><h5>${PL_HEAD[pl.verdict]}</h5><ul class="ck">${items.map(i => `<li><i class="${PL_ICON[i.state][1]}">${PL_ICON[i.state][0]}</i><span><b>${esc(i.label.replace(/\s*\(.*\)/, ''))}:</b> ${esc(i.text)}</span></li>`).join('')}</ul></div>`;
  };
  const plMark = pl => pl ? ({ ok: ' · rules ✓', warn: ' · rules !', unknown: ' · rules ?', fail: ' · rules ✕' })[pl.verdict] : '';

  // ---------- One panel for a job, with tabs (3.12) ----------
  // Score: four questions answered at the top (do I fit, will they answer, does it suit me, what are the risks).
  // The old skills algorithm and the requirements read by AI are shown side by side; numbers come from code.
  // Tabs: Analysis · Skills · Job · Application · Documents. Everything is done here, without the dashboard.
  const EVK = { work: ['✓', 'k1'], lab: ['✓', 'k1'], similar: ['~', 'k2'], none: ['✕', 'k3'], check: ['?', 'k2'] };
  const aiCache = {}, coCache = {};
  const ST_RU = { applied: 'Отправлен', screening: 'Скрининг', test: 'Тестовое', interview1: 'Интервью 1', interview2: 'Интервью 2', interview3: 'Интервью 3', offer: 'Оффер', accepted: 'Оффер принят', declined: 'Оффер отклонён', rejected: 'Отказ', noresponse: 'Нет ответа', withdrawn: 'Отозван' };
  const stLabel = id => (L('x', 'ru') === 'ru' && ST_RU[id]) || A.statusLabel(id);
  function jobOf(rec) { return { title: rec.title, company: rec.company, location: rec.location, url: rec.url || location.href, platform: rec.platform, description: rec.description, salaryText: rec.salaryText }; }
  const fmtDay = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
  const WHY = { ref: 'same job reference', text: 'same ad text', title: 'same title and company' };

  // ----- the four questions -----
  // 'Over 100 applicants' is stored as 101 so it sorts above 100; it reads as the site wrote it
  const apText = p => { const over = /over|more than|\+/i.test(p.applicantsText || ''); const n = over ? (String(p.applicantsText).match(/\d[\d,]*/) || [p.applicants])[0] : p.applicants; return L(p.applicantsText || n + ' applicants', (over ? 'больше ' : '') + n + ' откликов'); };
  function officeOf(rec, r) {
    const M = globalThis.JT_Market, wt = rec.workTypes || [];
    let od = r && r.officeDays != null ? r.officeDays : M ? M.officeDays(rec.description) : null;
    if (od === 0 && wt.includes('Hybrid')) od = null;
    return od;
  }
  // The facts that matter first, as on the job site: pay, hours, where you work, how fresh, how crowded
  function factsHtml(rec, r) {
    const wt = rec.workTypes || [], p = rec.posting || {}, od = officeOf(rec, r);
    const WT = { 'Full-time': 'Full-time', 'Part-time': 'Part-time', Permanent: L('Permanent', 'Постоянная'), Contract: L('Contract', 'Контракт'), Temporary: L('Temporary', 'Временная'), Remote: L('Remote', 'Удалённо'), Hybrid: L('Hybrid', 'Гибрид'), 'On-site': L('On-site', 'В офисе'), Apprenticeship: L('Apprenticeship', 'Апрентис'), 'Graduate / Placement': L('Graduate / placement', 'Выпускник / стажировка') };
    const chips = [];
    chips.push(rec.salaryText ? `<span class="tag pay">${esc(rec.salaryText)}</span>` : `<span class="tag warn">${L('Pay not stated', 'Зарплата не указана')}</span>`);
    wt.filter(w => WT[w]).forEach(w => chips.push(`<span class="tag ${/Full-time/.test(w) ? 'A' : /Part-time/.test(w) ? 'B' : ''}">${esc(WT[w])}${w === 'Hybrid' && od ? ` · ${L(`office ${od} d/wk`, `офис ${od} дн/нед`)}` : ''}</span>`));
    if (od != null && !wt.includes('Hybrid')) chips.push(`<span class="tag">${od === 0 ? L('Remote', 'Удалённо') : L(`office ${od} d/wk`, `офис ${od} дн/нед`)}</span>`);
    if (p.daysAgo != null) chips.push(`<span class="tag ${p.daysAgo > 21 ? 'warn' : ''}">${p.reposted ? L('reposted ', 'переопубл. ') : ''}${p.daysAgo === 0 ? L('today', 'сегодня') : p.daysAgo + L(' d ago', ' дн. назад')}</span>`);
    if (p.applicants != null) chips.push(`<span class="tag ${p.applicants > 100 ? 'warn' : ''}">${esc(apText(p))}</span>`);
    return `<div class="tags">${chips.join('')}</div>`;
  }
  function scoreRow(icon, cls, head, body) { return `<li><i class="${cls}">${icon}</i><span><b>${head}</b> ${body}</span></li>`; }
  function scorecardHtml(rec, r, app, elsewhere) {
    const c = rec.chance || {}, M = globalThis.JT_Market, out = [];
    // 1. Do I fit? The skills algorithm and the requirements (AI or the ad's sections), side by side
    const alg = c.score != null ? `${L('skills', 'по навыкам')} <b>${c.score}%</b>` : '';
    const noReq = r && r.fit && !(r.fit.essential.length + r.fit.desirable.length);
    const req = noReq ? L('the ad has no list of requirements', 'в вакансии нет списка требований') : r && r.fit && r.fit.score != null ? `${r.source === 'ai' ? L('requirements (AI)', 'по требованиям (AI)') : L('requirements', 'по требованиям')} <b>${r.fit.score}%</b> · ${r.fit.essOk}/${r.fit.essential.length} ${L('essential', 'обяз.')}` : r ? '' : `<span class="spin"></span>`;
    const fitN = r && r.fit && r.fit.score != null && !noReq ? r.fit.score : c.score || 0;
    out.push(scoreRow(fitN >= 70 ? '✓' : fitN >= 50 ? '~' : '✕', fitN >= 70 ? 'k1' : fitN >= 50 ? 'k2' : 'k3', L('Do I fit?', 'Подхожу?'), [alg, req].filter(Boolean).join(' · ')));
    // 2. Will they answer? From your own history of applications
    if (r && r.chance) { const up = /выше/.test(r.chance.main + (r.chance.pct ? r.chance.sub : '')), down = /ниже/.test(r.chance.main + (r.chance.pct ? r.chance.sub : '')); out.push(scoreRow(up ? '↑' : down ? '↓' : '=', up ? 'k1' : down ? 'k3' : 'k4', L('Will they answer?', 'Ответят?'), `${esc(r.chance.main)}${r.chance.sub ? ` <span class="note">· ${esc(r.chance.sub)}</span>` : ''}`)); }
    else out.push(scoreRow('%', 'k4', L('Will they answer?', 'Ответят?'), '<span class="spin"></span>'));
    // 3. Does it suit me? Market A/B, office days, pay, placement rules, hard blocks
    const suit = [], mk = M ? M.marketOf(rec) : 'B';
    let sc = 'k1';
    suit.push(mk === 'A' ? L('market A (full-time)', 'рынок А (full-time)') : L('market B (with study)', 'рынок Б (с учёбой)'));
    const od = officeOf(rec, r);
    if (mk === 'B' && od != null && od >= 4) { sc = 'k3'; suit.push(L(`office ${od} days a week`, `офис ${od} дн/нед`)); }
    if (mk === 'A' && M) {
      const w = M.worthLeave({ ...rec, salary: rec.salary }, profileCache || {});
      suit.push(w.ok ? L('worth a study break', 'стоит академа') : L('not worth a study break', 'не стоит академа') + ` (${[!w.known && L('not a known company', 'не известная компания'), !w.pay && L(`pay under £${Math.round(w.min / 1000)}k`, `зарплата < £${Math.round(w.min / 1000)}k`), !w.growth && L('no growth path', 'нет роста')].filter(Boolean).join(', ')})`);
      if (!w.ok) sc = 'k3';
    }
    const g = c.gates || { blocks: [], asks: [] };
    if (g.blocks.length) { sc = 'k3'; suit.push(g.blocks.map(b => esc(b.text)).join('; ')); }
    else if (g.asks.length && sc === 'k1') sc = 'k2';
    if (rec.placement && rec.placement.verdict === 'fail') sc = 'k3';
    out.push(scoreRow(sc === 'k1' ? '✓' : sc === 'k2' ? '!' : '✕', sc, L('Suits me?', 'Мне подходит?'), suit.join(' · ')));
    // 4. Risks: agency, ad age, applicants, data quality, applied before
    const risk = [], p = rec.posting || {};
    if (elsewhere) risk.push(L(`already applied via ${esc(app.platform || 'another site')}`, `уже откликался через ${esc(app.platform || 'другой сайт')}`));
    const br = (r && r.broker) || (M && M.broker ? M.broker(rec.company, rec.description) : null);
    if (br === 'board') risk.push(L(`intermediary (${esc(rec.company)}): the employer is hidden`, `посредник (${esc(rec.company)}): работодатель неизвестен`) + (r && r.employer ? ` → ${esc(r.employer)}` : ''));
    else if (br === 'agency' || (r && r.agency)) risk.push(L('agency', 'агентство') + (r && r.employer ? ` → ${esc(r.employer)}` : ''));
    if (p.daysAgo != null && p.daysAgo > 21) risk.push(L(`ad ${p.daysAgo} days old`, `объявлению ${p.daysAgo} дн.`));
    if (p.applicants != null && p.applicants > 100) risk.push(esc(apText(p)));
    const q = c.quality && !c.quality.ok ? c.quality.issues.filter(i => i.hard) : [];
    q.forEach(i => risk.push(esc(i.text)));
    out.push(scoreRow(risk.length ? '!' : '✓', risk.length ? 'k2' : 'k1', L('Risks', 'Риски'), risk.length ? risk.join(' · ') : L('none found', 'не найдено') + (p.daysAgo != null ? ` · ${L('ad', 'объявление')} ${p.daysAgo === 0 ? L('today', 'сегодня') : p.daysAgo + L(' d old', ' дн.')}` : '')));
    return `<ul class="ck sc">${out.join('')}</ul>`;
  }
  let profileCache = null;

  // ----- tab: analysis -----
  function reqListHtml(r) {
    if (!r) return `<div class="box"><span class="sub"><span class="spin"></span> ${L('Reading the requirements…', 'Читаю требования…')}</span></div>`;
    if (r.error && !r.fit) return `<div class="box bad"><span class="sub">${esc(r.error)}</span></div>`;
    if (r.fit && !(r.fit.essential.length + r.fit.desirable.length)) return `<div class="box"><h5>${L('The ad has no list of requirements', 'В вакансии нет списка требований')}</h5><span class="note">${L('The score is the skills match: see the Skills tab and “Why” below.', 'Оценка — по совпадению навыков: смотри вкладку «Навыки» и «Почему» ниже.')}</span></div>`;
    const f = r.fit, line = q => { const k = EVK[q.check && q.level !== 'work' && q.level !== 'none' ? 'check' : q.level] || EVK.check; const note = [q.level === 'lab' ? L('home lab', 'лаборатория') : q.level === 'similar' ? L('similar tool', 'похожий инструмент') : '', q.note].filter(Boolean).join(' · '); return `<li><i class="${k[1]}">${k[0]}</i><span>${esc(q.text)}${note ? ` <span class="note">· ${esc(note)}</span>` : ''}</span></li>`; };
    return `<div class="box">
      <h5>${r.source === 'ai' ? L('Requirements read by AI', 'Требования (прочитал AI)') : L('Requirements from the ad', 'Требования из текста')}: ${f.essOk}/${f.essential.length} ${L('essential', 'обязательных')}${f.desirable.length ? `, ${f.desOk}/${f.desirable.length} ${L('desirable', 'желательных')}` : ''}</h5>
      <ul class="ck">${f.essential.slice(0, 10).map(line).join('')}</ul>
      ${f.desirable.length ? `<ul class="ck" style="opacity:.85">${f.desirable.map(line).join('')}</ul>` : ''}
      ${r.dropped ? `<div class="note">${L('Lines AI made up that are not in the ad, dropped', 'Строк, которых нет в вакансии, AI выдумал и код отбросил')}: ${r.dropped}</div>` : ''}
      ${!r.hasKey ? `<div class="note">${L('With a free AI key the requirements are read precisely:', 'С бесплатным ключом AI требования читаются точнее:')} <a class="lk" data-act="settings">${L('Settings → AI', 'Настройки → AI')}</a></div>` : r.error ? `<div class="note">AI: ${esc(r.error)}</div>` : ''}
    </div>`;
  }
  function analysisTab(rec, r) {
    const c = rec.chance || {};
    return `<div data-req>${reqListHtml(r)}</div>
      ${r && r.chance ? `<div class="box"><h5>${L('Chance of an invitation', 'Шанс приглашения')}: ${esc(r.chance.main)}</h5><span class="sub">${esc(r.chance.sub)}${r.chance.why ? ' · ' + esc(r.chance.why) : ''}</span>${r.chance.note ? `<span class="note">${esc(r.chance.note)}</span>` : ''}</div>` : ''}
      ${r && r.employer && (r.agency || r.broker) ? `<div class="box warn"><span>${L('The real employer looks like', 'Похоже, настоящий работодатель —')} <b>${esc(r.employer)}</b>. ${L('Agencies have not given you a screening yet: apply on the employer’s site if you can.', 'От агентств скринингов пока нет: если можешь, откликнись у работодателя напрямую.')} <a class="lk" href="https://www.google.com/search?q=${encodeURIComponent('"' + r.employer + '" jobs')}" target="_blank" rel="noopener">${L('Search', 'Искать')}</a></span></div>` : ''}
      <div class="box"><h5>${L('Why the skills score is', 'Почему по навыкам')} ${c.score != null ? c.score + '%' : ''}</h5>${reasonsHtml(c)}</div>
      ${placementHtml(rec.placement)}
      <div class="note"><a class="lk" id="wrong">${L('Wrong verdict?', 'Неверная оценка?')}</a></div>
      <div id="fb" hidden>
        <select id="fbV"><option value="apply">Apply</option><option value="tailor">Tailor CV</option><option value="ask">Check first</option><option value="skip">Skip</option><option value="notjob">Not a job / not IT</option></select>
        <input id="fbN" placeholder="${L('Why (optional)', 'Почему (необязательно)')}" style="margin-top:6px">
        <button class="s" id="fbSave" style="margin-top:6px">${L('Save', 'Сохранить')}</button>
      </div>`;
  }

  // ----- tab: skills -----
  function skillsTab(rec, r) {
    const c = rec.chance || {};
    const gaps = r && r.fit && r.fit.gaps ? r.fit.gaps : [];
    return `<div class="box"><h5>${L('Tools in the ad', 'Инструменты в вакансии')}</h5>
        ${(c.tools || []).length ? toolsHtml(c) : `<span class="note">${L('None found in the description.', 'В описании не найдено.')}</span>`}
        <span class="note"><span class="t s">${L('you know well', 'знаешь уверенно')}</span> <span class="t b">${L('basic', 'базово')}</span> <span class="t m">${L('missing', 'нет')}</span></span>
      </div>
      ${(c.missing || []).length ? `<div class="box warn"><h5>${L('Worth preparing before the interview', 'Подтянуть к интервью')}</h5><span>${c.missing.map(esc).join(', ')}</span></div>` : ''}
      ${gaps.length ? `<div class="box"><h5>${L('Requirements you do not meet', 'Требования, которых у тебя нет')}</h5><ul class="ck">${gaps.map(g => `<li><i class="k3">✕</i><span>${esc(typeof g === 'string' ? g : g.text)}</span></li>`).join('')}</ul></div>` : ''}
      ${rec.atsMatch ? `<div class="box"><h5>${L('Your CV against the ad', 'Твоё CV против вакансии')}: ${rec.atsMatch.score}%</h5>${rec.atsMatch.addable.length ? `<span>${L('You have these but the CV does not say so — add them', 'Есть у тебя, но нет в CV — добавь')}: <b>${rec.atsMatch.addable.map(esc).join(', ')}</b></span>` : ''}${rec.atsMatch.missing.length ? `<span class="note">${L('Not in your CV or skills', 'Нет ни в CV, ни в навыках')}: ${rec.atsMatch.missing.slice(0, 6).map(esc).join(', ')}</span>` : ''}</div>` : ''}
      <button class="a" data-act="tailor">${L('Tailor the CV for this job', 'Адаптировать CV под вакансию')}</button>`;
  }

  // ----- tab: job -----
  function postingLine(app) {
    const p = app.posting || {}, out = [];
    if (p.daysAgo != null) out.push((p.reposted ? L('Reposted ', 'Переопубликовано ') : L('Posted ', 'Опубликовано ')) + (p.daysAgo === 0 ? L('today', 'сегодня') : p.daysAgo + L(' days ago', ' дн. назад')));
    if (p.applicants != null) out.push(p.applicantsText || p.applicants + L(' applicants', ' откликов'));
    return out.join(' · ');
  }
  function jobTab(rec, app) {
    const co = rec.company || '';
    const q = encodeURIComponent(co);
    const saved = app ? `<div class="box"><h5>${L('Saved in your tracker', 'Сохранено в трекере')} · ${esc(app.ticket || '')}</h5><span class="note">${L('Description', 'Описание')}: ${(app.description || '').length} ${L('chars', 'знаков')} · ${L('benefits', 'бенефиты')}: ${(app.benefits || []).length} · ${L('key details', 'детали')}: ${(app.details || []).length}${app.salaryText ? ' · ' + L('salary', 'зарплата') + ': ' + esc(app.salaryText) : ''}</span></div>` : `<div class="note">${L('The description, benefits and details are saved with the application when you press Apply (or “I applied” on the Application tab).', 'Описание, бенефиты и детали сохранятся вместе с откликом, когда нажмёшь Apply (или «Я откликнулся» во вкладке «Отклик»).')}</div>`;
    return `<div class="box"><h5>${esc(rec.title || '')}</h5>
        <span>${esc([co, rec.location, rec.platform].filter(Boolean).join(' · '))}</span>
        <span>${rec.salaryText ? esc(rec.salaryText) : L('Pay not stated', 'Зарплата не указана')}</span>
        ${postingLine(rec) ? `<span class="note">${esc(postingLine(rec))}</span>` : ''}
      </div>
      ${saved}
      <div class="box"><h5>${L('About the employer', 'О работодателе')}</h5><div data-co><span class="note"><span class="spin"></span> ${L('Reading the ad…', 'Читаю вакансию…')}</span></div>
        ${co ? `<span class="note"><a class="lk" target="_blank" rel="noopener" href="https://www.google.com/search?q=${q}">Google</a> · <a class="lk" target="_blank" rel="noopener" href="https://www.glassdoor.co.uk/Search/results.htm?keyword=${q}">Glassdoor</a> · <a class="lk" target="_blank" rel="noopener" href="https://find-and-update.company-information.service.gov.uk/search?q=${q}">Companies House</a> · <a class="lk" target="_blank" rel="noopener" href="https://www.linkedin.com/search/results/companies/?keywords=${q}">LinkedIn</a></span>` : ''}
      </div>
      ${(rec.benefits || []).length ? `<div class="box"><h5>${L('Benefits', 'Бенефиты')}</h5><ul class="det">${rec.benefits.slice(0, 10).map(d => `<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}
      ${(rec.details || []).length ? `<div class="box"><h5>${L('Key details', 'Главное из вакансии')}</h5><ul class="det">${rec.details.slice(0, 10).map(d => `<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}
      <details><summary>${L('Full description', 'Полное описание')}</summary><div class="jd">${esc(rec.description || '')}</div></details>`;
  }
  async function loadCompany(box, rec) {
    const key = rec.url + '|' + (rec.description || '').length;
    if (!coCache[key]) coCache[key] = await send({ type: 'aiCompany', job: jobOf(rec) });
    const r = coCache[key];
    const why = box.querySelector('#why'); if (why && !why.value && r.why) { why.value = r.why; why.dataset.ai = '1'; }
    const slot = box.querySelector('[data-co]'); if (!slot || !slot.isConnected) return;
    if (r.error === 'no-key') { slot.innerHTML = `<span class="note">${L('With an AI key: what the employer does and what they offer, from the ad.', 'С ключом AI: чем занимается работодатель и что предлагает — по тексту вакансии.')}</span>`; return; }
    if (r.error) { slot.innerHTML = `<span class="note">AI: ${esc(r.error)}</span>`; return; }
    slot.innerHTML = `${r.about.length ? `<ul class="det">${r.about.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${r.offers.length ? `<span class="note">${L('They offer', 'Предлагают')}: ${r.offers.map(esc).join('; ')}</span>` : ''}`;
  }

  // ----- tab: application -----
  function historyHtml(app) {
    const h = (app.history || []).slice().reverse();
    if (!h.length) return '';
    const NAMES = { followUps: L('follow-up', 'фоллоуап'), outcome: L('outcome', 'итог'), closed: L('closed', 'закрыт'), nextDate: L('next step date', 'дата след. шага'), contactChannel: L('contact', 'контакт'), noChannel: L('no contact', 'некуда писать'), snoozeUntil: L('snoozed', 'отложено') };
    return `<div class="box"><h5>${L('History', 'История')}</h5><ul class="hist">${h.slice(0, 12).map(e => {
      const what = e.status ? (e.from ? `${esc(stLabel(e.from))} → ` : '') + `<b>${esc(stLabel(e.status))}</b>` : (e.fields || [e.type]).map(f => NAMES[f] || f).join(', ');
      return `<li class="${e.undone ? 'undone' : ''}"><span class="note">${esc(fmtDay(e.at))}</span><span>${what}${e.by && e.by !== 'me' ? ` <span class="note">· ${esc(e.by)}</span>` : ''}</span>${!e.undone && e.prev ? `<a class="lk" data-undo="${esc(e.id)}">${L('undo', 'отменить')}</a>` : e.undone ? `<span class="note">${L('undone', 'отменено')}</span>` : '<span></span>'}</li>`;
    }).join('')}</ul></div>`;
  }
  function applicationTab(rec, app, isNew) {
    if (!app) return `<div class="box"><h5>${L('Not in your tracker yet', 'Ещё не в трекере')}</h5><span class="note">${L('It is saved by itself when you press Apply on the site. Applied another way?', 'Сохранится само, когда нажмёшь Apply на сайте. Откликнулся иначе?')}</span>
        <button class="a go" data-act="applied">${L('I applied — save it', 'Я откликнулся — сохранить')}</button></div>
      <button class="a" data-act="later">${L('Not now: put it in tonight’s session', 'Не сейчас: в сессию на вечер')}</button>`;
    const opt = (list, cur) => list.map(v => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
    const platforms = S.PLATFORMS.includes(app.platform) ? S.PLATFORMS : [app.platform].concat(S.PLATFORMS);
    const c = app.chance || {};
    return `${isNew && c.verdict === 'skip' ? `<div class="box bad"><span>${L('This job was marked “better not to apply”. Only opened the form? Press “I did not apply”.', 'Эта вакансия помечена «лучше не подавать». Только открыл форму — нажми «Я не подавался».')}</span></div>` : ''}
      <div class="row"><div><label>${L('Status', 'Статус')}</label><select id="status">${A.STATUSES.map(s => `<option value="${s.id}" ${s.id === app.status ? 'selected' : ''}>${esc(stLabel(s.id))}</option>`).join('')}</select></div>
        <div><label>${L('Salary', 'Зарплата')}</label><input id="salaryText" value="${esc(app.salaryText || '')}" placeholder="${L('e.g. £24,000', 'напр. £24,000')}"></div></div>
      ${I ? `<div class="row"><div><label>${L('How you applied', 'Как откликнулся')}</label><select id="method">${I.METHODS.map(m => `<option value="${m.id}" ${m.id === ((app.apply && app.apply.method) || 'unknown') ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></div>
        <div><label>${L('Cover letter', 'Письмо')}</label><select id="cover">${I.COVERS.map(m => `<option value="${m.id}" ${m.id === ((app.apply && app.apply.cover) || 'unknown') ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></div></div>` : ''}
      <label class="inl"><input type="checkbox" id="cvTailored" ${app.apply && app.apply.cvTailored ? 'checked' : ''}> ${L('CV tailored for this job', 'CV адаптировано под вакансию')}${app.apply && app.apply.cv ? ` <span class="note">· ${esc(app.apply.cv)}</span>` : ''}</label>
      <label>${L('Notes', 'Заметки')}</label><textarea id="notes" rows="3" placeholder="${L('Recruiter, what to prepare…', 'Рекрутер, что подготовить…')}">${esc(app.notes || '')}</textarea>
      <details><summary>${L('Edit job details', 'Изменить данные вакансии')}</summary>
        <label>${L('Job title', 'Должность')}</label><input id="title" value="${esc(app.title || '')}">
        <div class="row"><div><label>${L('Company', 'Компания')}</label><input id="company" value="${esc(app.company || '')}"></div><div><label>${L('Location', 'Место')}</label><input id="location" value="${esc(app.location || '')}"></div></div>
        <div class="row"><div><label>${L('Source', 'Источник')}</label><select id="platform">${opt(platforms, app.platform)}</select></div><div><label>${L('Role type', 'Тип роли')}</label><select id="category">${opt(A.CATEGORY_NAMES, app.category)}</select></div></div>
        <label>${L('Work type', 'Тип работы')}</label><div class="chips" id="wt">${A.WORK_TYPES.map(w => `<span class="chip ${(app.workTypes || []).includes(w) ? 'on' : ''}" data-v="${esc(w)}" role="checkbox" tabindex="0" aria-checked="${(app.workTypes || []).includes(w)}">${esc(w)}</span>`).join('')}</div>
        <label>${L('Application type', 'Тип заявки')}</label><select id="track"><option value="job" ${app.track !== 'intern' ? 'selected' : ''}>Job</option><option value="intern" ${app.track === 'intern' ? 'selected' : ''}>Internship / placement</option></select>
      </details>
      <div class="acts"><button class="a go" id="save">${L('Save', 'Сохранить')}</button><button class="a red" id="undo">${L('I did not apply — remove', 'Я не подавался — убрать')}</button></div>
      ${historyHtml(app)}
      <a class="lk note" data-act="dash">${L('Open in the dashboard', 'Открыть в трекере')}</a>`;
  }

  // ----- tab: documents -----
  function documentsTab(rec, app, r) {
    const asks = globalThis.JT_Prompt ? JT_Prompt.wantsLetter(rec.description) : /cover(ing)? letter/i.test(rec.description || '');
    return `<div class="note">${asks ? L('The ad asks for a cover letter.', 'Вакансия просит сопроводительное письмо.') : L('The ad does not ask for a cover letter.', 'Письмо вакансия не просит.')}</div>
      <button class="a" data-act="tailor">${L('Tailor the CV (Word / PDF)', 'Адаптировать CV (Word / PDF)')}</button>
      <label>${L('Why this employer (AI suggests it from the ad; change it to your words)', 'Почему этот работодатель (AI предложит из вакансии, поправь своими словами)')}</label>
      <textarea id="why" rows="2">${esc((app && app.whyThem) || '')}</textarea>
      <div class="acts"><button class="a go" data-act="letter">${L('Write the cover letter', 'Написать письмо')}</button><button class="a" data-act="answers">${L('Form answers', 'Ответы для анкеты')}</button></div>
      <button class="a" data-act="later">${L('Prepare a pack for tonight’s session', 'Собрать пакет в сессию на вечер')}</button>
      <div class="out" data-out></div>
      ${r && !r.hasKey ? `<div class="note">${L('The letter and the answers to the ad’s own questions need a free AI key:', 'Письмо и ответы на вопросы вакансии — с бесплатным ключом AI:')} <a class="lk" data-act="settings">${L('Settings → AI', 'Настройки → AI')}</a>. ${L('Without it: the template on the Templates page.', 'Без ключа — шаблон на странице «Шаблоны».')}</div>` : ''}`;
  }

  // ----- the panel -----
  const TABS = () => [['an', L('Analysis', 'Оценка')], ['sk', L('Skills', 'Навыки')], ['job', L('Job', 'Вакансия')], ['app', L('Application', 'Отклик')], ['doc', L('Documents', 'Документы')]];
  // One number everywhere: requirements met (AI or the ad's sections); the skills score when there is none or the job is ruled out
  const mainNum = (rec, r) => { const c = rec.chance || {}; const f = r && r.fit && r.fit.score != null && (r.fit.essential.length + r.fit.desirable.length) ? r.fit.score : r && r.fit ? null : rec.fitPrecise && rec.fitPrecise.score != null ? rec.fitPrecise.score : null; return f != null && c.verdict !== 'skip' ? f + '%' : (A.display ? A.display(c).text : (c.score || 0) + '%'); };
  async function showJob(rec, app, { isNew = false, elsewhere = null, tab } = {}) {
    ensureHost();
    const root = shadow.getElementById('root');
    root.querySelector('.jt') && root.querySelector('.jt').remove();
    try { profileCache = await S.getProfile(); } catch (e) { /* works without it */ }
    const key = rec.url + '|' + (rec.description || '').length;
    let r = aiCache[key] || null;
    const c = rec.chance || {};
    const box = document.createElement('div');
    box.className = 'jt';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Job Tracker');
    let cur = tab || (isNew ? 'app' : 'an');
    const d0 = A.display ? A.display(c) : { text: (c.score || 0) + '%', label: c.label };
    const head = app ? `<span class="tk">${esc(app.ticket || '')}</span><b>${isNew ? L('Application saved', 'Отклик сохранён') : esc(stLabel(app.status))}${elsewhere ? ' · ' + L('via ', 'через ') + esc(app.platform || '') : ''}</b>` : `<b>${L('Before you apply', 'Перед откликом')}</b>`;
    box.innerHTML = `
      <div class="hd"><span class="lg" aria-hidden="true"></span>${head}<button class="x" aria-label="Close">×</button></div>
      <div class="bd">
        <div class="top"><div><div class="job">${esc(rec.title || '')}${rec.track === 'intern' ? ' · internship' : ''}</div><div class="sub">${esc([rec.company, rec.location, rec.platform].filter(Boolean).join(' · '))}</div></div>
          <div class="vbox" style="color:${vColor(c)}"><div class="num">${esc(mainNum(rec, r))}</div><div class="vl">${esc(VLABEL[c.verdict] ? L(...VLABEL[c.verdict]) : d0.label || '')}</div></div></div>
        <div data-facts>${factsHtml(rec, r)}</div>
        <div data-score>${scorecardHtml(rec, r, app, elsewhere)}</div>
        <div class="tabs" role="tablist">${TABS().map(([id, t]) => `<button role="tab" data-tab="${id}" aria-selected="${id === cur}">${t}</button>`).join('')}</div>
        <div class="pane" data-pane></div>
      </div>`;
    root.appendChild(box);
    box.querySelector('.x').onclick = () => box.remove();
    const pane = box.querySelector('[data-pane]');
    const render = () => {
      box.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === cur));
      pane.innerHTML = cur === 'an' ? analysisTab(rec, r) : cur === 'sk' ? skillsTab(rec, r) : cur === 'job' ? jobTab(rec, app) : cur === 'app' ? applicationTab(rec, app, isNew) : documentsTab(rec, app, r);
      bindPane();
      if (cur === 'job' || cur === 'doc') loadCompany(box, rec);
    };
    box.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { cur = b.dataset.tab; render(); });

    const bindPane = () => {
      const $ = id => pane.querySelector('#' + id);
      pane.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', e => { e.preventDefault(); act(btn.dataset.act, btn); }));
      pane.querySelectorAll('.chip').forEach(ch => {
        const toggle = () => { ch.classList.toggle('on'); ch.setAttribute('aria-checked', ch.classList.contains('on')); };
        ch.onclick = toggle; ch.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } };
      });
      if ($('wrong')) $('wrong').onclick = () => { const f = $('fb'); f.hidden = !f.hidden; };
      if ($('fbSave')) $('fbSave').onclick = async () => {
        const { verdictFeedback = [] } = await S.get('verdictFeedback');
        verdictFeedback.push({ at: new Date().toISOString(), version: chrome.runtime.getManifest().version, url: rec.url, title: rec.title, company: rec.company, location: rec.location,
          salaryText: rec.salaryText, verdict: c.verdict, score: c.score, expected: $('fbV').value, note: $('fbN').value.trim(), description: String(rec.description || '').slice(0, 8000) });
        await S.set({ verdictFeedback: verdictFeedback.slice(-200) });
        $('fb').innerHTML = `<div class="note">${L('Saved. Data → Wrong verdicts downloads the list.', 'Сохранено. Список — в «Данные → Неверные оценки».')}</div>`;
      };
      if ($('why') && app) $('why').onchange = async () => { app.whyThem = $('why').value.trim(); await S.updateApp(app.id, { whyThem: app.whyThem }); };
      if ($('save')) $('save').onclick = async () => {
        const salaryText = $('salaryText').value.trim(), track = $('track').value;
        let re = {};
        if (track !== (app.track || 'job')) { const an = A.analyze({ ...app, title: $('title').value.trim(), location: $('location').value.trim(), track, category: '' }, await S.getProfile()); re = { chance: an.chance, placement: an.placement, tools: an.chance.tools }; }
        app = await S.updateApp(app.id, { track, ...re,
          title: $('title').value.trim(), company: $('company').value.trim(), location: $('location').value.trim(),
          platform: $('platform').value, status: $('status').value, category: $('category').value,
          workTypes: [...pane.querySelectorAll('.chip.on')].map(x => x.dataset.v),
          salaryText, salary: A.parseSalary(salaryText) || (salaryText ? { text: salaryText } : null), notes: $('notes').value,
          apply: { ...(app.apply || {}), ...(I ? { method: $('method').value, cover: $('cover').value } : {}), cvTailored: $('cvTailored').checked } }) || app;
        isNew = false; render();
        toast(L('Saved', 'Сохранено'), null, null, 2000);
        previewSig = ''; setTimeout(() => refreshPreview(false), 300);
      };
      if ($('undo')) $('undo').onclick = async () => {
        if (!isNew && !confirm(L('Remove this application from your tracker?', 'Убрать этот отклик из трекера?'))) return;
        await S.deleteApp(app.id);
        app = null; isNew = false; cur = 'an';
        box.querySelector('.hd b').textContent = L('Before you apply', 'Перед откликом');
        const tk = box.querySelector('.hd .tk'); if (tk) tk.remove();
        render();
        toast(L('Removed: it is not counted as sent', 'Убрано: отклик не считается отправленным'), null, null, 3000);
        previewSig = ''; setTimeout(() => refreshPreview(false), 300);
      };
      pane.querySelectorAll('[data-undo]').forEach(a => a.onclick = async () => {
        const res = await send({ type: 'undo', appId: app.id, eventId: a.dataset.undo });
        if (res.ok) { app = (await S.getApps()).find(x => x.id === app.id) || app; render(); previewSig = ''; setTimeout(() => refreshPreview(false), 300); }
      });
    };

    const copyBtn = ta => { const b = document.createElement('button'); b.className = 's'; b.textContent = L('Copy', 'Копировать'); b.onclick = async () => { try { await navigator.clipboard.writeText(ta.value); b.textContent = L('Copied', 'Скопировано'); } catch (e) { ta.select(); } }; return b; };
    const act = async (a, btn) => {
      const job = jobOf(rec);
      const out = pane.querySelector('[data-out]');
      if (a === 'settings') { chrome.runtime.sendMessage({ type: 'openDashboard', hash: '#settings' }); return; }
      if (a === 'dash') { chrome.runtime.sendMessage({ type: 'openDashboard', hash: app ? '#app=' + app.id : '' }); return; }
      if (a === 'tailor') { chrome.runtime.sendMessage({ type: 'openTailor', job: { ...job, track: rec.track } }); return; }
      if (a === 'applied') { box.remove(); captureApplication('manual'); return; }
      if (a === 'later') {
        btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${L('Preparing the pack…', 'Готовлю пакет…')}`;
        const res = await send({ type: 'saveForSession', job });
        btn.innerHTML = res.ok ? L(`In tonight’s session ✓ (${res.count})`, `В сессии на вечер ✓ (${res.count})`) : L('Could not save', 'Не получилось');
        if (res.ok) toast(L('Pack ready: CV, letter and answers. Open Application session tonight.', 'Пакет готов: CV, письмо и ответы. Вечером открой «Сессию откликов».'), L('Open', 'Открыть'), () => chrome.runtime.sendMessage({ type: 'openSession' }), 6000);
        return;
      }
      out.innerHTML = `<div class="sub"><span class="spin"></span> ${a === 'letter' ? L('Writing the letter…', 'Пишу письмо…') : L('Preparing answers…', 'Готовлю ответы…')}</div>`;
      if (a === 'letter') {
        const why = (pane.querySelector('#why') || {}).value || '';
        const res = await send({ type: 'aiLetter', job: { ...job, why: why.trim() } });
        if (res.error === 'no-key') { out.innerHTML = `<div class="note">${L('The letter needs a free AI key:', 'Для письма нужен бесплатный ключ AI:')} <a class="lk" data-act="settings">${L('Settings → AI', 'Настройки → AI')}</a></div>`; out.querySelector('[data-act]').onclick = () => act('settings'); return; }
        if (res.error) { out.innerHTML = `<div class="box bad"><span>${esc(res.error)}</span></div>`; return; }
        out.innerHTML = `${res.warn && res.warn.length ? `<div class="box warn"><span>${L('Check: the letter names', 'Проверь: в письме есть')} ${esc(res.warn.join(', '))} — ${L('not in your facts or skills', 'этого нет в твоих фактах и навыках')}.</span></div>` : ''}<textarea>${esc(res.text)}</textarea>`;
        const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px'; row.appendChild(copyBtn(out.querySelector('textarea'))); out.appendChild(row);
        if (app) { app = await S.updateApp(app.id, { apply: { ...(app.apply || {}), cover: 'tailored' } }) || app; }
      } else {
        const qs = (r && r.questions) || [];
        const res = await send({ type: 'aiAnswers', job, questions: qs });
        if (res.error) { out.innerHTML = `<div class="box bad"><span>${esc(res.error)}</span></div>`; return; }
        out.innerHTML = res.answers.map((x, i) => `<div class="qa"><b>${esc(x.q)}${x.src === 'ai' ? ' · AI' : ''}</b><textarea data-i="${i}" style="min-height:${x.a.length > 120 ? 96 : 40}px">${esc(x.a)}</textarea></div>`).join('');
        out.querySelectorAll('textarea').forEach(ta => { ta.onfocus = () => ta.select(); });
      }
    };

    render();
    // AI reads the requirements once per ad; the score card and the analysis follow it
    if (!r) {
      r = aiCache[key] = await send({ type: 'aiJob', job: jobOf(rec) });
      aiCache[rec.url] = r;
      if (!box.isConnected) return;
      box.querySelector('[data-score]').innerHTML = scorecardHtml(rec, r, app, elsewhere);
      box.querySelector('[data-facts]').innerHTML = factsHtml(rec, r);
      if (r.fit && r.fit.score != null) rec.fitPrecise = { score: r.fit.score, summary: r.fit.summary, source: r.source };
      box.querySelector('.vbox .num').textContent = mainNum(rec, r);
      const bp = shadow.querySelector('.badge .pc'); if (bp && previewRec && previewRec.url === rec.url) bp.textContent = mainNum(rec, r);
      if (cur === 'an' || cur === 'sk' || cur === 'doc') { const keep = pane.querySelector('[data-out]'); if (!keep || !keep.innerHTML) render(); }
    }
  }
  const showPanel = (app, { isNew }) => showJob(app, app, { isNew });
  const showPreviewPanel = (rec, existing, elsewhere) => showJob(rec, existing, { elsewhere });

  function openDashboard() { chrome.runtime.sendMessage({ type: 'openDashboard' }); }
  let previewSig = '', previewRec = null, previewHidden = false;

  function looksLikeJobPage(rec) {
    if (!(rec && rec.title && rec.title.length > 3 && (rec.description || '').length > 300)) return false;
    const issues = (rec.chance && rec.chance.quality && rec.chance.quality.issues) || [];
    return !issues.some(i => ['junk-title', 'results-page', 'form-page', 'no-title'].includes(i.code));
  }

  function removeBadge() { if (shadow) { const b = shadow.getElementById('root').querySelector('.badge'); if (b) b.remove(); } }

  async function refreshPreview(force) {
    if (window.top !== window) return; // no badge inside iframes: the top page shows it
    try {
      const profile = await S.getProfile();
      if (!force && (profile.showPreview === false || previewHidden)) { removeBadge(); return; }
      const rec = await buildRecord();
      if (!looksLikeJobPage(rec)) { removeBadge(); previewSig = ''; return force ? null : undefined; }
      E.rememberJob(location.hostname, rec);
      const sig = rec.title + '|' + rec.company + '|' + Math.round(rec.description.length / 200);
      let existing = await S.findByUrl(rec.url), elsewhere = null;
      if (!existing) { const s = await S.findSameJob(rec); if (s) { existing = s.app; elsewhere = s; } }
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
      b.title = L('Open the analysis', 'Открыть разбор');
      const d = A.display(c);
      const num = mainNum(rec, aiCache[rec.url + '|' + (rec.description || '').length]);
      const lab = VLABEL[c.verdict] ? L(...VLABEL[c.verdict]) : d.label;
      b.innerHTML = `<span class="pc" style="background:${vColor(c)}">${esc(num)}</span><span>${existing ? (elsewhere ? L('Already applied via ', 'Уже откликался через ') + esc(existing.platform || '') : esc(A.statusLabel(existing.status))) : esc(lab) + (rec.track === 'intern' ? ' · internship' : '') + plMark(rec.placement)}</span><button class="hide" aria-label="Hide">×</button>`;
      b.onclick = e => { if (e.target.closest('.hide')) { previewHidden = true; b.remove(); return; } showPreviewPanel(previewRec, existing, elsewhere); };
      b.onkeydown = e => { if (e.key === 'Enter') showPreviewPanel(previewRec, existing, elsewhere); };
      root.appendChild(b);
      if (force) showPreviewPanel(rec, existing, elsewhere);
      else {
        // AI reads the requirements right away (once per ad, cached), so the badge shows the same number as the panel
        const k = rec.url + '|' + (rec.description || '').length;
        if (!aiCache[k]) send({ type: 'aiJob', job: jobOf(rec) }).then(r => { if (!aiCache[k]) { aiCache[k] = r; aiCache[rec.url] = r; } const pc = b.querySelector('.pc'); if (pc && b.isConnected) pc.textContent = mainNum(rec, aiCache[k]); });
      }
    } catch (e) {
      if (!String(e).includes('Extension context invalidated')) console.warn('[Job Tracker]', e);
    }
  }

  // Watch for job changes (LinkedIn and Indeed switch jobs without reloading the page)
  let lastUrl = location.href, previewTimer = null;
  const schedulePreview = (ms = 900) => { clearTimeout(previewTimer); previewTimer = setTimeout(() => refreshPreview(false), ms); };
  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; previewHidden = false; previewSig = ''; schedulePreview(1200); }
    else schedulePreview(1500);
  }).observe(document.documentElement, { childList: true, subtree: true });
  schedulePreview(1200);
  // Indeed's job iframe changes its URL without changing the main page
  new MutationObserver(() => { previewSig = ''; schedulePreview(1500); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['src'], subtree: true });
  document.addEventListener('load', e => { if (e.target && e.target.tagName === 'IFRAME') { previewSig = ''; schedulePreview(800); } }, true);

  let busy = false;
  async function captureApplication(source, originEl, how) {
    if (busy) return;
    busy = true;
    try {
      const rec = await buildRecord(originEl, how);
      if (!rec) { toast('Couldn\'t find a job on this page', 'Add by hand', openDashboard, 6000); return; }
      const issues = ((rec.chance && rec.chance.quality && rec.chance.quality.issues) || []).map(i => i.code);
      // An application form or a page without a real title belongs to the job saved from its ad;
      // a real ad with a new link is saved (Re-check flags it if it repeats an older one)
      const notAnAd = issues.some(c => ['form-page', 'junk-title', 'no-title', 'results-page'].includes(c));
      let existing = (await S.findByUrl(rec.url)) || (notAnAd ? await S.findSimilar(rec.title, rec.company) : null);
      let elsewhere = null;
      if (!existing && !notAnAd) { elsewhere = await S.findSameJob(rec); if (elsewhere) existing = elsewhere.app; }
      if (!existing && (issues.includes('results-page') || issues.includes('junk-title') || issues.includes('no-title'))) {
        toast('This looks like a list of jobs, not one ad: open the job itself and press Apply there', 'Add by hand', openDashboard, 7000);
        return;
      }
      if (existing) {
        if (source === 'manual') showPanel(existing, { isNew: false });
        else toast(elsewhere ? `You already applied for this job via ${existing.platform || 'another site'}: ${existing.ticket} · ${A.statusLabel(existing.status)}` : `Already in your tracker: ${existing.ticket} · ${A.statusLabel(existing.status)}`, 'Show', () => showPanel(existing, { isNew: false }), 8000);
        return;
      }
      // The Fit read by AI on this page (if it ran) goes with the application
      const ai = aiCache[rec.url];
      if (ai && ai.fit && ai.fit.score != null) rec.fitPrecise = { score: ai.fit.score, summary: ai.fit.summary, source: ai.source };
      const app = await S.addApp(rec);
      showPanel(app, { isNew: true });
      previewSig = '';
      setTimeout(() => refreshPreview(false), 500);
    } catch (e) {
      if (String(e).includes('Extension context invalidated')) toast('Job Tracker was updated. Reload the page.');
      else console.warn('[Job Tracker]', e);
    } finally {
      setTimeout(() => { busy = false; }, 1500);
    }
  }

  // ---------- Catching the Apply button ----------
  // The Russian and Ukrainian phrases match job sites shown in those languages.
  const APPLY_RE = /^(easy apply|apply|apply now|quick apply|apply on (the )?company (site|website)|apply on employer site|continue to apply|continue applying|apply externally|apply for (this )?job|apply with (indeed|cv)|submit application|send application|подать заявку|откликнуться|податися|податись)\b/i;
  const NOT_RE = /(filter|applied|already|save|alert|show results|sign in|clear)/i;

  const APPLY_ATTR = '.jobs-apply-button, [data-live-test-job-apply-button], [data-control-name*="apply" i], [id*="applyButton" i], [id^="jobsearch-ApplyButton"], [data-testid*="apply-button" i], [data-testid*="applyButton" i], [data-qa*="apply" i], [data-at*="apply-button" i], [class*="apply-button" i], [class*="applyButton" i]';

  // After you return from a company site, LinkedIn asks 'Did you apply?'. 'Yes' counts as applying too
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
    const text = ((el.innerText || el.value || '') + ' ' + (el.getAttribute('aria-label') || '')).replace(/\s+/g, ' ').trim();
    if (auto) captureApplication('click', el, { text, yes });
  }
  // pointerdown fires before the site opens a new tab or navigates away
  window.addEventListener('pointerdown', e => { if (e.button === 0 || e.button === 1) onPress(e); }, true);
  window.addEventListener('click', onPress, true);
  window.addEventListener('auxclick', onPress, true);
  window.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') onPress(e); }, true);

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg && msg.type === 'manualAdd') { captureApplication('manual'); reply({ ok: true }); }
    if (msg && msg.type === 'ping') reply({ ok: true });
    if (msg && msg.type === 'preview') {
      previewHidden = false;
      refreshPreview(true).then(r => { if (r === null) toast('No job description found on this page'); });
      reply({ ok: true });
    }
  });
})();
