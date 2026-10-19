/* Job Tracker — data quality: cleans a captured description and decides whether a record
 * holds a real job ad. A fit score is only worth showing when the data under it is real. */
(function (root) {
  'use strict';

  // ---------- Titles that are not job titles ----------
  // Search headings, application forms, tab titles and section headings
  const JUNK_TITLE = [
    /^\s*$/,
    /^\s*[\d,.]+\+?\s+.*\bjobs?\b/i,                 // '11,098 It Support Jobs in London'
    /\bjobs? in\b/i,                                   // 'it helpdesk jobs in London'
    /^[\w\s&/-]{0,40}\bjobs\s*$/i,                    // 'It Engineer Jobs'
    /\b(results|vacancies)\b/i,
    /let'?s complete your application|complete your application|you will need to apply directly|^apply (now|for this job)$|^application (form|submitted)|^your application|^thank you for applying|^sign in|^log ?in\b|^register\b|^upload your cv/i,
    /^\s*(about (the|this) (job|company|role)|about us|job (details|description)|full job description|responsibilities|requirements|overview|benefits|description)\s*$/i,
    /^(google (sheets|docs|drive)|untitled spreadsheet|inbox|gmail)\b/i,
  ];
  const isJunkTitle = t => JUNK_TITLE.some(re => re.test(String(t || '').trim()));

  // ---------- Page chrome that ends up in descriptions ----------
  // Lines that are never part of a job ad
  const CHROME_LINE = /^(?:\d+\+? results|how promoted jobs are ranked|promoted by hirer|actively reviewing applicants|be an early applicant|easy apply|apply|save|saved|viewed|applied|show more|show less|see more|… more|\.\.\. more|·|•|show match details|beta • is this information helpful\?|is this information helpful\?|your profile and resume (match|are missing).*|job match summary not available|this job post doesn.t have enough information.*|did you finish applying\?|you'll find this job under in progress.*|yes|no|undo|your profile was shared with the job poster\.? ?undo|people you can reach out to|meet the hiring team|message|connect|follow|job poster|company photos|i.m interested|get job alerts for this search|are these results helpful\?|your feedback helps us improve search results\.|see jobs where you.re a top applicant|start premium for £0|previous|next|\d{1,2}|posted (?:\d+|an?) (?:minutes?|hours?|days?|weeks?|months?) ago|\d+ (?:minutes?|hours?|days?|weeks?|months?) ago|reposted \d+ \w+ ago|\(verified job\)|.*\(verified job\)|selected, .*|over \d+ (?:applicants|people clicked apply)|\d+ (?:applicants|people clicked apply)|responses managed off linkedin|no response insights available yet|company review time is typically .*|\d+(?:,\d+)? followers|\d+(?:,\d+)? on linkedin|\d+-\d+ employees|\d+,?\d*\+? employees|keyword : all jobs|&nbsp;|edit location input box label|find jobs|report job|post your cv and find your next job on indeed!|sort by:|relevance - date|urgently needed|easily apply|new|hiring multiple candidates|\d+ hires? made in (?:the )?past 30 days|often responds in \d+ days?|top-rated employer|here.s how the job details align with your profile\.|pulled from the full job description|shift and schedule|job details|job type|pay|benefits found in job post)$/i;

  // Where the ad itself starts and stops on LinkedIn and Indeed pages
  const START_MARK = /^(about the job|full job description)$/i;
  const END_MARK = /^(… more|\.\.\. more|unlock hiring insights on .*|job search faster with premium|about the company|interested in working with us in the future\?|benefits found in job post|requirements added by the job poster|report job|people also searched:|i want to receive the latest job alerts.*|more jobs like this|similar jobs|linkedin corporation © \d{4})$/i;
  // A list of other jobs (search results) in front of the ad
  const RESULT_LIST = /how promoted jobs are ranked|\b\d+\+? results\b|keyword : all jobs|edit location input box label|people also searched/i;

  /**
   * Removes the search results list, LinkedIn widgets and footers around the ad.
   * Returns the cleaned text and what was removed, so a caller can tell a clean ad from page chrome.
   */
  function cleanDescription(text, hint = {}) {
    let lines = String(text || '').replace(/\r/g, '').replace(/ /g, ' ').split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim());
    const before = lines.join('\n').length;
    const hadList = RESULT_LIST.test(lines.slice(0, 40).join('\n'));

    // 1) Start at 'About the job' / 'Full job description' when the page shows one
    let start = -1;
    lines.forEach((l, i) => { if (START_MARK.test(l)) start = i; });
    // On a results page the ad header (company, title) sits after the last 'Get job alerts for this search'
    if (start < 0 && hadList) {
      const alerts = lines.reduce((m, l, i) => (/^get job alerts for this search$/i.test(l) ? i : m), -1);
      if (alerts >= 0) start = alerts;
      else if (hint.title) {
        const t = hint.title.toLowerCase().slice(0, 40);
        const hits = lines.map((l, i) => (l.toLowerCase().startsWith(t) ? i : -1)).filter(i => i >= 0);
        if (hits.length) start = hits[hits.length - 1] - 1;
      }
    }
    if (start >= 0) lines = lines.slice(start + 1);

    // 2) Stop at the first footer marker after the ad text
    const end = lines.findIndex((l, i) => i > 0 && END_MARK.test(l));
    if (end > 0) lines = lines.slice(0, end);

    // 3) Drop single lines of page chrome
    lines = lines.filter(l => !CHROME_LINE.test(l));
    const out = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return { text: out, removed: Math.max(0, before - out.length), hadList };
  }

  // ---------- Pages that are not a job ad ----------
  const FORM_HINTS = /first name|last name|email address|phone number|upload (your )?cv|send application|submit application|contact details|supporting files|cover letter \(optional\)|\+1242\b|\+44\b/gi;
  function looksLikeApplicationForm(text) {
    const t = String(text || '');
    const hits = new Set((t.match(FORM_HINTS) || []).map(x => x.toLowerCase()));
    const codes = (t.match(/^\+\d{1,4}$/gm) || []).length; // a country-code drop-down
    return codes > 20 || hits.size >= 4 || /let'?s complete your application|you will need to apply directly|once you submit your application, your data will be forwarded/i.test(t);
  }
  function looksLikeResultsList(text) {
    const t = String(text || '');
    const posted = (t.match(/^posted \d+ \w+ ago$|^\d+ (days?|weeks?) ago$/gim) || []).length;
    const easy = (t.match(/^easy apply$/gim) || []).length;
    if (RESULT_LIST.test(t) || posted >= 4 || easy >= 3) return true;
    // A list of cards is short lines (title, company, town, pay) with hardly any sentences
    const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 20) return false;
    const prose = lines.filter(l => l.split(/\s+/).length >= 8).length;
    return prose / lines.length < 0.12;
  }

  // Title and company from the text around the ad when the saved ones are missing or junk.
  // Indeed pages: 'Title\nCompany\nTown\n£…\nApply now'; plain ads start with 'Title\n\nCompany'.
  const TITLE_WORD = /\b(support|engineers?|analysts?|technicians?|developers?|desk|interns?(hip)?|administrators?|specialists?|consultants?|assistants?|officers?|coordinators?|programmers?|scientists?|architects?|managers?|trainees?|apprentices?|graduates?|testers?|operators?)\b/i;
  function recoverHeader(raw) {
    const lines = String(raw || '').split('\n').map(l => l.trim()).filter(Boolean);
    const isTitle = t => t && t.length < 100 && TITLE_WORD.test(t) && !isJunkTitle(t) && !/[.!?]$/.test(t) && t.split(/\s+/).length <= 12;
    const isCompany = c => c && c.length < 80 && !TITLE_WORD.test(c) && !/£|\d{3}|:|^(location|salary|job type|about)\b/i.test(c);
    const apply = lines.findIndex(l => /^(apply now|apply on company site)$/i.test(l));
    if (apply > 0) {
      for (let i = Math.max(0, apply - 8); i < apply - 1; i++) if (isTitle(lines[i]) && isCompany(lines[i + 1])) return { title: lines[i], company: lines[i + 1] };
    }
    if (isTitle(lines[0])) return { title: lines[0], company: isCompany(lines[1]) ? lines[1] : '' };
    // 'Join EMS as a 1st Line Support Engineer', 'We are looking for an IT Support Technician to join…'
    const head = lines.slice(0, 25).join('\n');
    const m = head.match(/\b[Jj]oin\s+(?:the\s+)?([A-Z][\w&.' -]{1,40}?)\s+as\s+(?:an?\s+)?([A-Z0-9][\w+/&() -]{3,70}?)(?=[.,!\n]|\s+(?:to|and|in|on|based|where|who)\b)/)
      || head.match(/\b(?:[Ll]ooking for|[Rr]ecruiting|[Hh]iring|[Ss]eeking)\s+(?:an?\s+)?(?:experienced\s+|talented\s+|motivated\s+)*()([A-Z0-9][\w+/&() -]{3,70}?)(?=\s+to join|\s+(?:in|at|for|based|who|with)\b|[.,!\n])/);
    if (m && isTitle(m[2])) return { title: m[2].trim(), company: m[1] && isCompany(m[1]) ? m[1].trim() : '' };
    return null;
  }

  // ---------- Is the record a real job ad? ----------
  /**
   * Returns { ok, issues: [{ code, text, hard }], confidence: 'high'|'medium'|'low' }.
   * ok=false means the record cannot be scored: the fit badge shows '?' and the record is
   * marked incomplete until the job page is opened again.
   * opts.toolsFound / opts.hasRequirements come from the analyser when known.
   */
  function validate(job, opts = {}) {
    const issues = [];
    const add = (code, text, hard) => issues.push({ code, text, hard: !!hard });
    const title = String(job.title || '').trim();
    const desc = String(job.description || '');
    if (!title) add('no-title', 'No job title', true);
    else if (isJunkTitle(title)) add('junk-title', `"${title.slice(0, 60)}" is not a job title`, true);
    if (!String(job.company || '').trim()) add('no-company', 'No company', false);
    if (!desc.trim()) add('no-description', 'No description saved', true);
    else if (looksLikeApplicationForm(desc)) add('form-page', 'Saved from an application form, not the job ad', true);
    else if (looksLikeResultsList(desc)) add('results-page', 'The description still contains a list of other jobs', true);
    else if (desc.length < 400) add('short-description', `Description is only ${desc.length} characters`, true);
    if (/[äöüß]|\b(und|der|die|das|mit|für|sie|ihre)\b/gi.test(desc) && foreignShare(desc) > 0.25) add('foreign-language', 'The ad is not in English', false);

    const ok = !issues.some(i => i.hard);
    let confidence = 'low';
    if (ok) {
      const tools = opts.toolsFound == null ? 3 : opts.toolsFound;
      if (desc.length >= 1200 && tools >= 5 && opts.hasRequirements !== false) confidence = 'high';
      else if (desc.length >= 600 && tools >= 3) confidence = 'medium';
    }
    return { ok, issues, confidence };
  }

  // Share of German/French/Spanish function words among common function words
  function foreignShare(text) {
    const w = String(text || '').toLowerCase().match(/\b[\p{L}]+\b/gu) || [];
    const en = new Set(['the', 'and', 'you', 'with', 'for', 'our', 'will', 'are', 'your', 'this', 'to', 'of', 'in']);
    const other = new Set(['und', 'der', 'die', 'das', 'mit', 'für', 'sie', 'ihre', 'wir', 'eine', 'von', 'zu', 'le', 'la', 'les', 'et', 'des', 'vous', 'nous', 'pour', 'avec', 'el', 'los', 'las', 'y', 'con', 'para']);
    let e = 0, o = 0;
    w.forEach(x => { if (en.has(x)) e++; else if (other.has(x)) o++; });
    return e + o ? o / (e + o) : 0;
  }

  // Company and title from the header of an application form ('Zachary Daniels\nIT Support Specialist\nStrong fit')
  function headerFromForm(text) {
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 4);
    if (lines.length < 2 || lines[0].length > 80 || lines[1].length > 120) return null;
    return { company: lines[0], title: lines[1] };
  }

  root.JT_Quality = { cleanDescription, validate, isJunkTitle, looksLikeApplicationForm, looksLikeResultsList, foreignShare, headerFromForm, recoverHeader, JUNK_TITLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.JT_Quality;
})(typeof globalThis !== 'undefined' ? globalThis : this);
