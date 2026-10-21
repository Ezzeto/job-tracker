/* Job Tracker — extracts job data from the open page or from fetched HTML */
(function (root) {
  'use strict';
  const A = root.JT_Analyzer, S = root.JT_Store;

  const BLOCK = /^(P|DIV|LI|UL|OL|H1|H2|H3|H4|H5|H6|SECTION|ARTICLE|HEADER|FOOTER|TR|TABLE|BLOCKQUOTE|DD|DT|PRE)$/;
  // Text with line breaks; also works for fetched (not rendered) documents
  function blockText(el) {
    if (!el) return '';
    let out = '';
    const walk = n => {
      if (n.nodeType === 3) { out += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (t === 'SCRIPT' || t === 'STYLE' || t === 'NOSCRIPT' || t === 'SVG' || t === 'BUTTON') return;
      if (t === 'BR') { out += '\n'; return; }
      const block = BLOCK.test(t);
      if (block) out += '\n';
      if (t === 'LI') out += '• ';
      n.childNodes.forEach(walk);
      if (block) out += '\n';
    };
    walk(el);
    return out.replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  const line = el => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  const q = (sels, rootEl) => {
    if (!sels || !rootEl) return null;
    for (const s of sels.split(',')) {
      try { const el = rootEl.querySelector(s.trim()); if (el && line(el)) return el; } catch (e) { /* bad selector */ }
    }
    return null;
  };
  function htmlToText(h) {
    try { return blockText(new DOMParser().parseFromString(h || '', 'text/html').body); } catch (e) { return String(h || '').replace(/<[^>]+>/g, ' '); }
  }

  const SITES = [
    { name: 'linkedin', host: /linkedin\./,
      pane: '.jobs-search__job-details--wrapper, .jobs-search__job-details, .jobs-details, .job-view-layout, .scaffold-layout__detail',
      title: '.job-details-jobs-unified-top-card__job-title h1, .job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .top-card-layout__title, .topcard__title, h1.t-24, [class*="unified-top-card"] h1, [class*="top-card"] h1, a[href*="/jobs/view/"], h1',
      company: '.job-details-jobs-unified-top-card__company-name a, .job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name, .topcard__org-name-link, .top-card-layout__second-subline a, a[href*="/company/"]',
      location: '.job-details-jobs-unified-top-card__primary-description-container .tvm__text, .job-details-jobs-unified-top-card__bullet, .job-details-jobs-unified-top-card__primary-description-container, .job-details-jobs-unified-top-card__tertiary-description-container, .topcard__flavor--bullet',
      extra: '.job-details-preferences-and-skills, .job-details-jobs-unified-top-card__job-insight, .job-details-fit-level-preferences, .description__job-criteria-list',
      desc: '#job-details, .jobs-description__content, .jobs-box__html-content, .show-more-less-html__markup, .description__text, .jobs-description',
      cardLink: /\/jobs\/view\/(\d+)/, idAttrs: ['data-occludable-job-id', 'data-job-id'],
      cardSel: 'li[data-occludable-job-id], .job-card-container, .jobs-search-results__list-item, [data-job-id]', cardTitle: 'a[href*="/jobs/view/"]',
      canon: id => `https://www.linkedin.com/jobs/view/${id}/`,
      // LinkedIn results are never fetched in the background: cards are scored from their own text
      fetchUrl: null },
    { name: 'indeed', host: /indeed\./,
      pane: '#jobsearch-ViewjobPaneWrapper, .jobsearch-RightPane, [class*="jobsearch-ViewJobLayout--embedded"], #viewJobSSRRoot',
      title: '[data-testid="jobsearch-JobInfoHeader-title"], [data-testid*="JobInfoHeader-title"], h1.jobsearch-JobInfoHeader-title, h2.jobsearch-JobInfoHeader-title, [class*="JobInfoHeader-title"], h2[class*="jobTitle"]',
      company: '[data-testid="inlineHeader-companyName"], [data-company-name="true"], [data-testid*="companyName"], [data-testid="jobsearch-CompanyInfoContainer"] a, .jobsearch-CompanyInfoContainer a, [class*="companyName"]',
      location: '[data-testid="inlineHeader-companyLocation"], [data-testid="job-location"], [data-testid="jobsearch-JobInfoHeader-companyLocation"], [data-testid*="companyLocation"], [class*="companyLocation"]',
      salary: '#salaryInfoAndJobType, [data-testid="jobsearch-OtherJobDetailsContainer"]',
      extra: '#jobDetailsSection, [data-testid="jobsearch-OtherJobDetailsContainer"], #salaryInfoAndJobType',
      desc: '#jobDescriptionText, [data-testid="jobsearch-JobComponent-description"]',
      cardLink: /[?&](?:jk|vjk)=([a-f0-9]{8,})/i, idAttrs: ['data-jk'],
      cardSel: '.job_seen_beacon, [data-testid="slider_item"], .cardOutline, .tapItem, li [class*="cardOutline"]', cardTitle: 'h2.jobTitle a, a.jcs-JobTitle, h2 a[data-jk], h2 a, [id^="jobTitle-"]',
      frame: 'iframe#vjs-container-iframe, iframe[src*="viewjob"], iframe[name="vjs-container-iframe"]',
      canon: id => `${location.origin}/viewjob?jk=${id}`,
      fetchUrl: id => `${location.origin}/viewjob?jk=${id}` },
    { name: 'reed', host: /reed\.co\.uk/, ldFirst: true,
      title: '[data-qa="job-title"], [data-qa="jobTitle"], h1[itemprop="title"], [itemprop="title"]',
      company: '[data-qa="recruiter-name"], [data-qa="recruiterName"], [data-qa="job-posted-by"] a, [itemprop="hiringOrganization"] [itemprop="name"], .posted-by a, [class*="posted-by" i] a',
      location: '[data-qa="localityLbl"], [data-qa="regionLbl"], [data-qa="job-location"], [itemprop="addressLocality"]',
      salary: '[data-qa="salaryLbl"], [data-qa="salary"], [itemprop="baseSalary"]',
      extra: '[data-qa="jobTypeLbl"], [data-qa="jobTypeMobileLbl"], [data-qa="job-type"], [data-qa="job-metadata"]',
      desc: '[data-qa="job-description"], [itemprop="description"], [class*="job-description" i], [class*="jobDescription"]',
      cardLink: /\/jobs\/[^/?#]+\/(\d+)/, canon: null, fetchUrl: null,
      cardSel: 'article[data-qa*="job-card" i], [data-qa*="job-result" i], article[class*="job" i], article', cardTitle: 'h2 a, h3 a, a[data-qa*="title" i], a[href*="/jobs/"]' },
    { name: 'totaljobs', host: /totaljobs\.|cwjobs\./, ldFirst: true,
      title: 'h1[data-at="header-job-title"], [data-at="job-ad-header"] h1',
      company: '[data-at="metadata-company-name"], [data-at="header-company-name"]',
      location: '[data-at="metadata-location"]', salary: '[data-at="metadata-salary"]',
      extra: '[data-at="metadata-work-type"], [data-at="metadata-contract-type"], [data-at="job-ad-header"]',
      desc: '[data-at="job-ad-content"], [data-at="section-text-description-content"], .job-ad-display, .job-description',
      cardLink: /\/job\/[^?#]*?job(\d{5,})/, canon: null, fetchUrl: null,
      cardSel: 'article[data-at="job-item"], [data-testid="job-item"], article', cardTitle: 'a[data-at="job-item-title"], h2 a, a[href*="/job/"]' },
    { name: 'cvlibrary', host: /cv-library\.|it-jobs\.co\.uk/, // it-jobs.co.uk runs on the CV-Library platform
      ldFirst: true,
      title: 'h1.job__title, h1[class*="JobView_jobTitle"]', company: '.job__header-info a, [data-company-name], .job__company, [class*="JobView_companyTitle"] a',
      location: '.job__header-location, .job__details-location', salary: '.job__header-salary, .job__details-value.salary',
      extra: '.job__details, .job__header', desc: '.job__description, #job-description, .job-description, [class*="JobView_jobDescription"]',
      cardLink: /\/job\/(\d{5,})(?:\/|$)/, canon: null, fetchUrl: null,
      cardSel: 'article.job, li.results__item, article', cardTitle: 'h2 a, a.job__title-link, a[href*="/job/"]' },
    { name: 'glassdoor', host: /glassdoor\./,
      title: '[data-test="job-title"], h1', company: '[data-test="employer-name"], [data-test="employerName"]',
      location: '[data-test="location"]', salary: '[data-test="detailSalary"]',
      desc: '[class*="JobDetails_jobDescription"], .jobDescriptionContent, [data-test="jobDescriptionContent"]' },
  ];
  const siteFor = host => SITES.find(s => s.host.test(host)) || { name: 'other' };

  function readJsonLd(doc) {
    const out = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try {
        const walk = o => {
          if (!o || typeof o !== 'object') return;
          if (Array.isArray(o)) return o.forEach(walk);
          const t = o['@type'];
          if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) out.push(o);
          if (o['@graph']) walk(o['@graph']);
        };
        walk(JSON.parse(s.textContent));
      } catch (e) { /* ignore */ }
    });
    return out[0] || null;
  }

  function salaryFromLd(bs) {
    if (!bs) return '';
    const v = bs.value || {};
    const min = v.minValue || v.value, max = v.maxValue;
    if (!min || isNaN(+min)) return '';
    const unit = String(v.unitText || bs.unitText || '').toLowerCase();
    const per = unit === 'hour' ? ' per hour' : unit === 'day' ? ' per day' : unit === 'month' ? ' per month' : unit === 'week' ? ' per week' : ' per annum';
    const f = n => '£' + Number(n).toLocaleString('en-GB');
    return (max && +max !== +min ? `${f(min)} - ${f(max)}` : f(min)) + per;
  }

  // A search page heading ('245 IT support jobs in London') is not a job title
  const BAD_TITLE = /:\s*$|^\s*(job advert|responsibilities|requirements|key responsibilities|duties|about (you|us|the role)|the role|role overview|what you|who we|we are|our client)\b|^\s*[\d,.]+\s|\bjobs\b|\bresults\b|\bvacancies\b|\bsearch\b|^\s*(apply|easy apply|sign in|home|save)\s*$|^\s*(about (the|this) (job|company|role|position)|about us|people you can reach out to|meet the hiring team|job (details|description|summary)|similar jobs|more jobs|how you match|full job description|profile insights|job activity|hiring insights|location|pay|job type|shift and schedule|skills|benefits|description|overview|requirements|responsibilities|premium|show more|see more|job search|recommended for you)\s*$/i;

  function cleanTitleCompany(title, company) {
    title = String(title || '').split('\n')[0].replace(/\s*-\s*job post$/i, '').trim();
    company = String(company || '').split('\n')[0].trim();
    // LinkedIn sometimes returns 'Title | Company | LinkedIn'
    const tParts = title.split(/\s+[|·]\s+/).map(x => x.trim()).filter(x => x && !/^linkedin$|^indeed|^reed|^totaljobs|^cv-library|^it-jobs|^it jobs$/i.test(x));
    title = tParts[0] || title;
    const cParts = company.split(/\s+[|·]\s+|\s*\|\s*/).map(x => x.trim()).filter(x => x && !/linkedin/i.test(x) && x.toLowerCase() !== title.toLowerCase());
    company = cParts[0] || '';
    if (!company && tParts[1]) company = tParts[1];
    company = company.replace(/^(company,?\s*)/i, '').replace(/\s*(logo|\.)$/i, '').trim();
    return { title: title.slice(0, 160), company: company.slice(0, 120) };
  }

  /**
   * Parses the job inside rootEl (a document, a side pane or a fetched page).
   * opts.useLd: whether to read the document's JSON-LD (skipped when a pane shows a different job).
   */
  function parse(rootEl, doc, site, url, opts = {}) {
    const g = k => site[k] ? line(q(site[k], rootEl)) : '';
    let ld = opts.useLd !== false ? readJsonLd(doc) : null;
    let pageTitle = g('title');
    if (pageTitle && BAD_TITLE.test(pageTitle)) pageTitle = '';
    if (ld && opts.expectTitle && String(ld.title || '').trim().toLowerCase() !== opts.expectTitle.trim().toLowerCase()) ld = null;

    let title = site.ldFirst && ld && ld.title ? ld.title : (pageTitle || (ld && ld.title) || '');
    if (!title || BAD_TITLE.test(title)) {
      const heads = [...rootEl.querySelectorAll('h1, h2')].map(line).filter(t => t && t.length < 140 && !BAD_TITLE.test(t));
      title = heads[0] || opts.fallbackTitle || '';
    }
    let company = (site.ldFirst && ld && ld.hiringOrganization && (ld.hiringOrganization.name || '')) || g('company') || (ld && ld.hiringOrganization && (ld.hiringOrganization.name || '')) || '';
    if (typeof company !== 'string') company = '';
    let loc = g('location');
    if ((!loc || site.ldFirst) && ld && ld.jobLocation) {
      const jl = Array.isArray(ld.jobLocation) ? ld.jobLocation[0] : ld.jobLocation;
      const ad = jl && jl.address;
      const l2 = ad ? [ad.addressLocality, ad.addressRegion].filter(Boolean).join(', ') : '';
      if (l2) loc = l2;
    }
    let description = site.desc ? blockText(q(site.desc, rootEl)) : '';
    if ((!description || description.length < 200) && ld && ld.description) description = htmlToText(ld.description);
    if (!description && opts.fallbackText) description = opts.fallbackText;

    const extraText = [g('extra'), g('salary'), ld ? [ld.employmentType, ld.jobLocationType].flat().filter(Boolean).join(' ') : ''].join('\n');
    let salaryText = ld && ld.baseSalary ? salaryFromLd(ld.baseSalary) : '';
    if (!salaryText) {
      const siteSalary = g('salary');
      const first = siteSalary.split('\n')[0];
      const p = siteSalary ? (A.parseSalary(siteSalary, true) || A.parseSalary(first)) : null;
      if (p && /£/.test(first + p.text)) salaryText = p.text;
    }
    if (!salaryText && title && rootEl.innerText) {
      // Salary in the job header: '£450 a day', '£25,000 - £29,000 a year'
      const lines = rootEl.innerText.split('\n').map(x => x.trim()).filter(Boolean);
      const ti = lines.findIndex(l => l.toLowerCase().includes(title.toLowerCase().slice(0, 30)));
      const near = lines.slice(Math.max(0, ti), Math.max(0, ti) + 15).find(l => /£\s?\d/.test(l) && l.length < 80);
      const p = near && A.parseSalary(near);
      if (p) salaryText = p.text;
    }
    if ((!company || !loc) && title && rootEl.innerText !== undefined) {
      const after = linesAfterTitle(rootEl.innerText || '', title);
      if (!company && after[0]) company = after[0];
      if (!loc && after[1] && after[1].length < 60) loc = after[1];
    }
    const tc = cleanTitleCompany(title, company);
    loc = (loc || '').split('\n')[0].replace(/\s*·.*$/, '').replace(/\(.*?\)/g, '').trim().slice(0, 120);
    const cleanUrl = S.cleanUrl(url);
    const contacts = mergeContacts(contactsFromDom(rootEl), contactsFromText(description));
    return {
      contacts,
      title: tc.title, company: tc.company, location: loc, url: cleanUrl,
      platform: S.platformFromUrl(cleanUrl),
      description: (description || '').slice(0, 15000),
      extraText: extraText.slice(0, 2000),
      salaryText,
    };
  }

  // ---------- Contacts for follow-ups ----------
  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const PHONE_RE = /(?:\+44\s?\(?0?\)?\s?|\b0)\d(?:[\s-]?\d){8,9}\b/g;
  const NAME_RE = /\b(?:contact|speak (?:to|with)|call|email|reach out to|get in touch with|consultant|recruiter|recruitment partner|hiring manager|talent partner)[:\s,–-]+(?:me,?\s+)?([A-Z][a-z]+(?:[ '-][A-Z][a-z]+){1,2})\b/g;
  const NOT_NAME = /^(Us|Our|The|This|Me|We|You|Your|Team|Recruitment|Human|Talent|Hiring|Please|Apply|Email|Phone|Call)\b/;

  function contactsFromText(text) {
    const out = [];
    const t = String(text || '');
    (t.match(EMAIL_RE) || []).forEach(e => {
      if (/\.(png|jpe?g|gif|svg|webp)$/i.test(e) || /example\.|sentry|wixpress|noreply|no-reply|donotreply/i.test(e)) return;
      out.push({ type: 'email', value: e.toLowerCase(), name: '', source: 'description' });
    });
    (t.match(PHONE_RE) || []).forEach(p => {
      const digits = p.replace(/\D/g, '').replace(/^44/, '0');
      if (digits.length < 10 || digits.length > 11 || /^0(800|808)/.test(digits)) return;
      out.push({ type: 'phone', value: p.trim(), name: '', source: 'description' });
    });
    let m;
    NAME_RE.lastIndex = 0;
    while ((m = NAME_RE.exec(t))) { if (!NOT_NAME.test(m[1])) out.push({ type: 'name', value: m[1], name: m[1], source: 'description' }); }
    return out;
  }

  // LinkedIn 'Meet the hiring team' / 'People you can reach out to' block
  function contactsFromDom(rootEl) {
    const out = [];
    if (!rootEl || !rootEl.querySelectorAll) return out;
    const blocks = [...rootEl.querySelectorAll('section, div')].filter(el => /meet the hiring team|people you can reach out to|hiring team|job poster|message the recruiter/i.test((el.firstElementChild && el.firstElementChild.textContent) || '') && el.querySelector('a[href*="/in/"]'));
    const block = blocks.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0];
    const links = block ? block.querySelectorAll('a[href*="/in/"]') : rootEl.querySelectorAll('.message-the-recruiter a[href*="/in/"], .hirer-card__hirer-information a[href*="/in/"]');
    links.forEach(a => {
      const url = a.href.split('?')[0];
      const name = (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').replace(/^View |’s profile$|'s profile$|, ?\d.*$/g, '').trim().split(/\s{2,}|\n/)[0];
      if (name && name.length < 60) out.push({ type: 'linkedin', value: url, name, source: 'LinkedIn: hiring team' });
    });
    return out;
  }

  function mergeContacts(...lists) {
    const out = [], seen = new Set();
    lists.flat().filter(Boolean).forEach(c => {
      const k = c.type + ':' + String(c.value).toLowerCase().replace(/\s/g, '');
      if (seen.has(k)) return;
      // Drop a bare name when a contact with that name already exists
      if (c.type === 'name' && out.some(o => o.name && o.name.toLowerCase() === c.value.toLowerCase())) return;
      seen.add(k); out.push(c);
    });
    // Attach a name found in the text to an unnamed email or phone
    const nm = out.find(c => c.type === 'name');
    if (nm) {
      const first = nm.value.split(' ')[0].toLowerCase();
      out.forEach(c => {
        if (c.name || c.type === 'name') return;
        if (c.type === 'phone' || (c.type === 'email' && c.value.includes(first))) c.name = nm.value;
      });
      if (out.some(c => c.type !== 'name' && c.name === nm.value)) out.splice(out.indexOf(nm), 1);
    }
    return out.slice(0, 12);
  }

  // Lines right after the job title (usually company, then town)
  const JUNK_LINE = /£|\$|€|out of 5|reviews?$|^\d+(\.\d)?$|^(easily apply|new|urgently needed|apply now|apply|save|share|promoted|be an early applicant|actively hiring|responds within|hiring multiple|job post|full job description|job details|\d+ (days?|hours?|weeks?) ago|posted .*|easy apply|·)$/i;
  function linesAfterTitle(text, title) {
    const lines = String(text).split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const t = title.toLowerCase().slice(0, 40);
    const i = lines.findIndex(l => l.toLowerCase().startsWith(t) || l.toLowerCase().includes(t));
    if (i < 0) return [];
    return lines.slice(i + 1, i + 8).filter(l => l.length < 90 && !JUNK_LINE.test(l) && !BAD_TITLE.test(l)).slice(0, 2);
  }

  async function fetchAndParse(fetchUrl, canonUrl) {
    const res = await fetch(fetchUrl, { credentials: 'include' });
    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const site = siteFor(new URL(fetchUrl, location.href).hostname);
    return parse(doc, doc, site, canonUrl || fetchUrl, { useLd: true });
  }

  root.JT_Extract = { contactsFromText, contactsFromDom, mergeContacts, linesAfterTitle, SITES, siteFor, parse, fetchAndParse, blockText, line, q, readJsonLd, cleanTitleCompany, BAD_TITLE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
