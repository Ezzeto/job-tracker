/* Job Tracker — what happens to an application after you send it, and why it gets no interview.
   Records how you applied (Easy Apply, company site, agency…), which CV and cover letter went with it,
   how old the ad was and how many people had applied, and how a rejection came back.
   breakdown() turns that into reply and interview rates per factor for the dashboard. */
(function (root) {
  'use strict';

  const METHODS = [
    { id: 'easy', label: 'Easy Apply / quick apply' },
    { id: 'external', label: 'Company website / ATS' },
    { id: 'board', label: 'Job board form' },
    { id: 'agency', label: 'Recruitment agency' },
    { id: 'email', label: 'Email / direct' },
    { id: 'referral', label: 'Referral' },
    { id: 'unknown', label: 'Not recorded' },
  ];
  const COVERS = [
    { id: 'none', label: 'No cover letter' },
    { id: 'generic', label: 'Standard letter' },
    { id: 'tailored', label: 'Written for this job' },
    { id: 'unknown', label: 'Not recorded' },
  ];
  // How the 'no' came back. 'fast' is almost always an automatic or recruiter CV screen
  const OUTCOMES = [
    { id: 'fast', label: 'CV screen (within 3 days)' },
    { id: 'review', label: 'After a longer review' },
    { id: 'after_call', label: 'After a call or test' },
    { id: 'after_interview', label: 'After an interview' },
    { id: 'closed', label: 'Job closed / filled' },
  ];
  const REASONS = [
    { id: '', label: 'No reason given' },
    { id: 'experience', label: 'Not enough experience' },
    { id: 'skills', label: 'Missing skills / certificates' },
    { id: 'schedule', label: 'Hours or availability' },
    { id: 'location', label: 'Location / commute' },
    { id: 'rtw', label: 'Right to work / sponsorship' },
    { id: 'salary', label: 'Salary expectations' },
    { id: 'other_candidate', label: 'Chose a stronger candidate' },
    { id: 'other', label: 'Other (see notes)' },
  ];
  const label = (list, id) => (list.find(x => x.id === id) || list[list.length - 1]).label;

  // ---------- At capture ----------
  // The text of the button you pressed says how you applied
  function methodFromButton(text, platform, didApplyYes) {
    const t = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (didApplyYes) return 'external';
    if (/easy apply|quick apply|apply with (indeed|cv)|one.?click/.test(t)) return 'easy';
    if (/company (site|website)|employer('s)? (site|website)|externally|continue to apply|on (the )?company/.test(t)) return 'external';
    if (/submit application|send application|continue applying/.test(t)) return platform === 'Company website' ? 'external' : 'board';
    if (platform === 'Company website') return 'external';
    if (/\bapply\b/.test(t)) return platform === 'LinkedIn' ? 'external' : 'board';
    return 'unknown';
  }

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  // 'Reposted 2 weeks ago · Over 100 people clicked apply', 'Posted 30+ days ago', 'Posted 21 October by Hays'
  function postingMeta(text, now) {
    const s = String(text || '').replace(/\s+/g, ' ');
    const nowD = now ? new Date(now) : new Date();
    const out = { postedDaysAgo: null, reposted: false, applicants: null, applicantsText: '' };
    let m;
    if ((m = s.match(/\b(re)?(?:posted|published|active|listed)?:?\s*(\d+)\+?\s*(minute|min|hour|hr|day|week|wk|month)s?\s+ago\b/i))) {
      const n = +m[2], u = m[3].toLowerCase();
      out.postedDaysAgo = /^(minute|min|hour|hr)/.test(u) ? 0 : /^day/.test(u) ? n : /^(week|wk)/.test(u) ? n * 7 : n * 30;
      out.reposted = !!m[1] || /\breposted\b/i.test(s.slice(Math.max(0, m.index - 12), m.index + m[0].length));
    } else if (/\b(just posted|posted today|today by|new today|posted just now)\b/i.test(s)) out.postedDaysAgo = 0;
    else if (/\b(posted yesterday|yesterday by)\b/i.test(s)) out.postedDaysAgo = 1;
    else if ((m = s.match(/\b(?:posted|published|date posted)(?: on)?:?\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*(?:\s+(\d{4}))?/i)) && MONTHS.includes(m[2].toLowerCase())) {
      const d = new Date(m[3] ? +m[3] : nowD.getFullYear(), MONTHS.indexOf(m[2].toLowerCase()), +m[1], 12);
      if (d > nowD) d.setFullYear(d.getFullYear() - 1);
      out.postedDaysAgo = Math.max(0, Math.floor((nowD - d) / 864e5));
    } else if ((m = s.match(/\b(?:posted|published|date posted)(?: on)?:?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i))) {
      const d = new Date(+m[3], +m[2] - 1, +m[1], 12);
      if (!isNaN(d)) out.postedDaysAgo = Math.max(0, Math.floor((nowD - d) / 864e5));
    }
    if ((m = s.match(/\bbe among the first (\d+) applicants\b/i))) {
      out.applicants = Math.max(0, +m[1] - 1); out.applicantsText = m[0];
    } else if ((m = s.match(/\b(over|more than)\s+(\d[\d,]*)\s+(applicants|people clicked apply|people applied|applications)/i))) {
      out.applicants = +m[2].replace(/,/g, '') + 1; out.applicantsText = m[0];
    } else if ((m = s.match(/\b(\d[\d,]*)\s+(applicants|people clicked apply|people applied|applications)\b/i))) {
      out.applicants = +m[1].replace(/,/g, ''); out.applicantsText = m[0];
    }
    return out;
  }

  // ---------- Hard requirements in the ad ----------
  const REQS = [
    { id: 'priorExp', label: 'Asks for previous IT / support experience', re: /\b(previous|prior|proven|demonstrable|professional|commercial|relevant|hands.on)\s+(\w+\s+){0,3}experience\b|\bexperience (in|of|with) (an? )?(it|technical|service desk|helpdesk|help desk|support|1st|first|2nd|second) (line )?(support|role|environment|position)|\bexperience (is )?(essential|required)\b/i },
    { id: 'years', label: 'Asks for 1+ years', re: /\b(\d+|one|two|three|four|five)\+?\s*(\+\s*)?(years?|yrs)('|’)?\s*(of\s+)?(\w+\s+){0,3}(experience|exp\.?)\b|\bminimum (of )?(\d+|one|two|three) years?\b/i },
    { id: 'enterprise', label: 'Corporate / enterprise environment', re: /\b(corporate|enterprise|business|professional|commercial|office|msp|managed service)\s+(it\s+)?(environment|setting|background)\b/i },
    { id: 'fullTime', label: 'Full-time / 5 days', re: /\bfull[\s-]?time\b|\b(5|five) days (a|per) week\b|\bmonday (to|-|–) friday\b|\b(37\.5|40|39|38|37|36|35) hours\b/i },
    { id: 'degree', label: 'Degree required', re: /\b(degree|bsc|ba hons|bachelor'?s?)\b(?![^.]{0,40}\b(not (required|essential|necessary)|or equivalent experience|desirable|preferred|advantageous|a plus|beneficial)\b)/i },
    { id: 'driving', label: 'Driving licence', re: /\b(full|clean|valid)?\s*(uk\s+)?driving licen[cs]e\b|\bown (car|transport|vehicle)\b/i },
    { id: 'certs', label: 'Certificate required (ITIL, A+, MS…)', re: /\b(itil|comptia|a\+|network\+|security\+|ccna|md-102|ms-900|az-900|mcsa|mcp)\b[^.]{0,60}\b(required|essential|must|necessary)\b|\b(required|essential|must have)\b[^.]{0,60}\b(itil|comptia|a\+|ccna|md-102|ms-900|az-900)\b/i },
    { id: 'clearance', label: 'Security clearance / long UK residency', re: /\b(sc|dv|bpss|nppv\d?)\s+clear(ance|ed)\b|\bsecurity clearance\b|\b(resided|lived|residency) in the uk for\b|\b5 years.{0,20}uk residen/i },
  ];
  // 'not essential' / 'desirable' right after the phrase turns a requirement into a nice-to-have
  const SOFT = /^[^.\n]{0,50}\b(not (essential|required|necessary)|desirable|preferred|advantageous|a plus|beneficial|would be nice|bonus)\b/i;
  function requirements(desc) {
    const s = String(desc || '');
    if (s.length < 150) return null;
    return REQS.filter(r => {
      const m = s.match(r.re);
      return m && !SOFT.test(s.slice(m.index + m[0].length));
    }).map(r => r.id);
  }

  // ---------- After applying ----------
  const DAY = 864e5;
  const days = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / DAY));
  function rejectedAt(app) {
    const h = (app.history || []).filter(x => x.status === 'rejected');
    return h.length ? h[h.length - 1].at : (app.status === 'rejected' ? app.updatedAt : null);
  }
  function daysToRejection(app) {
    const at = (app.outcome && app.outcome.at) || rejectedAt(app);
    return at && app.appliedAt ? days(app.appliedAt, at) : null;
  }
  // What the outcome probably was when you didn't say: a 'no' within 3 days is a CV screen
  function outcomeType(app, reachedInterview) {
    if (app.outcome && app.outcome.type) return app.outcome.type;
    if (app.status !== 'rejected') return '';
    if (reachedInterview) return 'after_interview';
    const d = daysToRejection(app);
    return d == null ? '' : d <= 3 ? 'fast' : 'review';
  }

  // Applications that still say 'Applied' long after you sent them
  function staleIds(apps, limitDays, now) {
    if (!limitDays || limitDays <= 0) return [];
    const t = now ? new Date(now).getTime() : Date.now();
    return apps.filter(a => {
      if (a.status !== 'applied' || !a.appliedAt) return false;
      const last = [a.appliedAt].concat((a.followUps || []).map(f => f.at)).map(x => new Date(x).getTime()).filter(x => !isNaN(x));
      return (t - Math.max(...last)) / DAY >= limitDays;
    }).map(a => a.id);
  }

  // ---------- Dashboard breakdown ----------
  const ageBucket = d => d == null ? 'Unknown' : d <= 2 ? '0–2 days' : d <= 7 ? '3–7 days' : d <= 14 ? '8–14 days' : '15+ days';
  const applicantsBucket = n => n == null ? 'Unknown' : n < 25 ? 'Under 25' : n <= 100 ? '25–100' : 'Over 100';
  const ORDER = { age: ['0–2 days', '3–7 days', '8–14 days', '15+ days', 'Unknown'], applicants: ['Under 25', '25–100', 'Over 100', 'Unknown'] };

  // ok(list) decides whether the app replied/interviewed; injected so this file works without the Store
  const VERDICT_LABEL = { apply: 'Apply', tailor: 'Tailor CV', ask: 'Check first', skip: 'Skip', incomplete: 'No verdict' };

  // Applications sent on the same calendar day as now: the daily counter in the side panel
  function today(apps, now) {
    const t = now ? new Date(now) : new Date();
    const same = iso => { const d = new Date(iso); return !isNaN(d) && d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate(); };
    const list = (apps || []).filter(a => a.appliedAt && same(a.appliedAt) && a.status !== 'withdrawn');
    return {
      n: list.length,
      skip: list.filter(a => a.chance && a.chance.verdict === 'skip').length,
      tailored: list.filter(a => a.apply && a.apply.cvTailored).length,
    };
  }

  // Monday to Friday days between two dates (a follow-up is due after 4 of them, not 7 calendar days)
  function workingDaysSince(iso, now) {
    const from = new Date(iso), to = now ? new Date(now) : new Date();
    if (isNaN(from) || to <= from) return 0;
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    let n = 0;
    while (d < end) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
    return n;
  }

  function breakdown(apps, { responded, interviewed, now, minAgeDays = 0 } = {}) {
    const t = now ? new Date(now) : new Date();
    const pool = apps.filter(a => a.appliedAt && days(a.appliedAt, t) >= minAgeDays);
    const row = (key, list) => ({
      key, n: list.length,
      replied: list.filter(responded).length,
      interview: list.filter(interviewed).length,
      rejected: list.filter(a => a.status === 'rejected').length,
    });
    const group = (title, keyOf, order) => {
      const map = new Map();
      pool.forEach(a => [].concat(keyOf(a)).forEach(k => { if (k == null) return; if (!map.has(k)) map.set(k, []); map.get(k).push(a); }));
      let rows = [...map.entries()].map(([k, l]) => row(k, l));
      rows = order ? rows.sort((x, y) => order.indexOf(x.key) - order.indexOf(y.key)) : rows.sort((x, y) => y.n - x.n);
      return { title, rows };
    };
    const ap = a => a.apply || {};
    const groups = [
      group('How you applied', a => label(METHODS, ap(a).method || 'unknown')),
      group('Cover letter', a => label(COVERS, ap(a).cover || 'unknown')),
      group('CV sent', a => ap(a).cv || 'Not recorded'),
      group('CV tailored to the ad', a => ap(a).cvTailored === true ? 'Yes' : ap(a).cvTailored === false ? 'No' : 'Not recorded', ['Yes', 'No', 'Not recorded']),
      group('Verdict when you applied', a => VERDICT_LABEL[(a.chance && a.chance.verdict) || ''] || 'No verdict', ['Apply', 'Tailor CV', 'Check first', 'Skip', 'No verdict']),
      group('Age of the ad when you applied', a => ageBucket(a.posting ? a.posting.daysAgo : null), ORDER.age),
      group('Applicants before you', a => applicantsBucket(a.posting ? a.posting.applicants : null), ORDER.applicants),
    ];
    // Requirements: each app counts once per flag it has, plus once in 'None of these'
    const reqOf = a => a.reqs || requirements(a.description) || null;
    const reqGroup = group('What the ad demanded', a => {
      const r = reqOf(a);
      if (!r) return 'Description not saved';
      return r.length ? r.map(id => REQS.find(x => x.id === id).label) : 'None of these';
    });
    groups.push(reqGroup);

    const rej = pool.filter(a => a.status === 'rejected');
    const speeds = rej.map(daysToRejection).filter(d => d != null).sort((x, y) => x - y);
    const fast = speeds.filter(d => d <= 3).length;
    const types = {};
    rej.forEach(a => { const k = outcomeType(a, interviewed(a)) || 'unknown'; types[k] = (types[k] || 0) + 1; });
    const reasons = {};
    rej.forEach(a => { const k = (a.outcome && a.outcome.reason) || ''; reasons[k] = (reasons[k] || 0) + 1; });
    return {
      total: pool.length,
      groups,
      rejection: {
        n: rej.length, fast, median: speeds.length ? speeds[Math.floor(speeds.length / 2)] : null,
        types, reasons,
        silent: pool.filter(a => !responded(a)).length,
      },
    };
  }

  root.JT_Insights = {
    METHODS, COVERS, OUTCOMES, REASONS, REQS, label,
    methodFromButton, postingMeta, requirements,
    rejectedAt, daysToRejection, outcomeType, staleIds,
    ageBucket, applicantsBucket, breakdown, today, workingDaysSince,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
