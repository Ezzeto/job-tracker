/* Job Tracker — weekly review numbers, the cost of one screening, and "ask the tracker".
 * Numbers are computed here; AI only writes conclusions from them, or turns a question into a query
 * that this code runs. Pure functions.
 * An app here is a plain object: { status, appliedAt (ISO), company, title, platform, market, agency,
 *   method, cvKind, cover, minutes, fit, missing: [], tools: [], salaryText, rejDays }. */
(function (root) {
  'use strict';
  const POS = ['screening', 'test', 'interview1', 'interview2', 'interview3', 'offer', 'accepted', 'declined'];
  const INT = ['interview1', 'interview2', 'interview3', 'offer', 'accepted', 'declined'];
  const DAY = 864e5;
  const monday = (d, off) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7 + 7 * (off || 0)); return x; };

  function channelOf(a) {
    const m = String(a.method || '').toLowerCase();
    if (a.agency || /agency|recruit/.test(m)) return 'Агентство';
    if (/easy apply|quick apply|indeed apply/.test(m)) return 'Easy Apply';
    if (/referr/.test(m)) return 'Рекомендация';
    if (/email|speculative|cold/.test(m)) return 'Письмо работодателю';
    if (/company|website|careers|workday|greenhouse|lever/.test(m) || a.platform === 'Company website') return 'Сайт компании';
    return a.platform || 'Другое';
  }
  // Minutes an application usually takes when it was not timed
  function minutesOf(a) {
    if (a.minutes !== '' && a.minutes != null && Number(a.minutes) > 0) return Number(a.minutes);
    const ch = channelOf(a);
    let m = ch === 'Easy Apply' ? 5 : ch === 'Сайт компании' ? 30 : ch === 'Письмо работодателю' ? 10 : 15;
    if (a.cvKind === 'Tailored') m += 10;
    if (a.cover && !/^(no|none)/i.test(String(a.cover))) m += 15;
    return m;
  }
  /** Hours spent per screening, by channel: [{ channel, n, screens, hours, perScreen, timed }] */
  function costPerScreen(apps) {
    const g = {};
    (apps || []).forEach(a => {
      const c = channelOf(a);
      const x = g[c] = g[c] || { channel: c, n: 0, screens: 0, minutes: 0, timed: 0 };
      x.n++; x.minutes += minutesOf(a); if (Number(a.minutes) > 0) x.timed++;
      if (POS.includes(a.status)) x.screens++;
    });
    return Object.values(g).map(x => ({ ...x, hours: Math.round(x.minutes / 6) / 10, perScreen: x.screens ? Math.round(x.minutes / x.screens / 6) / 10 : null }))
      .sort((a, b) => (a.perScreen == null) - (b.perScreen == null) || (a.perScreen || 0) - (b.perScreen || 0) || b.n - a.n);
  }

  /** This week against last week, and what to look at. */
  function week(apps, now) {
    const t = now || Date.now();
    const w0 = monday(t, 0).getTime(), w1 = monday(t, -1).getTime();
    const inW = (a, s) => { const d = Date.parse(a.appliedAt); return d >= s && d < s + 7 * DAY; };
    const sum = s => {
      const l = (apps || []).filter(a => inW(a, s));
      return { n: l.length, B: l.filter(a => a.market === 'B').length, A: l.filter(a => a.market === 'A').length, tailored: l.filter(a => a.cvKind === 'Tailored').length, agency: l.filter(a => a.agency).length };
    };
    const all = apps || [];
    const closedRecent = all.filter(a => Date.parse(a.appliedAt) >= t - 42 * DAY);
    const total = { n: all.length, screens: all.filter(a => POS.includes(a.status)).length, interviews: all.filter(a => INT.includes(a.status)).length, rejected: all.filter(a => a.status === 'rejected').length, fast: all.filter(a => a.status === 'rejected' && a.rejDays !== '' && a.rejDays != null && Number(a.rejDays) <= 3).length };
    const missing = {};
    closedRecent.forEach(a => (a.missing || []).forEach(m => { missing[m] = (missing[m] || 0) + 1; }));
    return { thisWeek: sum(w0), lastWeek: sum(w1), total, topMissing: Object.entries(missing).sort((a, b) => b[1] - a[1]).slice(0, 5), cost: costPerScreen(all) };
  }

  /** Numbers only, no names: what the AI sees for the weekly conclusions. */
  function summaryForAi(w, targets, extra) {
    const c = w.cost.map(x => `${x.channel}: ${x.n} applications, ${x.screens} screenings, ~${x.hours} h`).join('; ');
    return [
      `This week: ${w.thisWeek.n} applications (market B alongside study ${w.thisWeek.B}, market A full-time ${w.thisWeek.A}), tailored CV ${w.thisWeek.tailored}, via agencies ${w.thisWeek.agency}. Targets: B ${targets.B}, A ${targets.A}, cold emails ${targets.C}.`,
      `Last week: ${w.lastWeek.n} applications (B ${w.lastWeek.B}, A ${w.lastWeek.A}).`,
      `All time: ${w.total.n} applications, ${w.total.screens} screenings, ${w.total.interviews} interviews, ${w.total.rejected} rejections (${w.total.fast} within 3 days).`,
      `By channel: ${c}.`,
      w.topMissing.length ? `Tools asked for that the candidate lacks (last 6 weeks): ${w.topMissing.map(([k, n]) => `${k} ×${n}`).join(', ')}.` : '',
      extra || '',
    ].filter(Boolean).join('\n');
  }

  // ---------- Ask the tracker ----------
  const FIELDS = ['status', 'platform', 'market', 'month', 'week', 'company', 'channel', 'cv'];
  const STAT = ['applied', 'screening', 'test', 'interview1', 'interview2', 'interview3', 'offer', 'accepted', 'declined', 'rejected', 'noresponse', 'withdrawn'];
  function askPrompt(question, today, companies) {
    return [
      { role: 'system', content: 'You turn a question about a job search tracker into a JSON query. Answer with one JSON object only.' },
      { role: 'user', content: `Today is ${today}. Return JSON:
{"filter": {"status": [statuses from ${STAT.join(', ')}] or null, "replied": true/false/null (any answer from the employer, including rejection), "screened": true/false/null, "from": "YYYY-MM-DD" or null, "to": "YYYY-MM-DD" or null, "text": words that must appear in the job title or company or null, "company": exact company from the list or null, "platform": "LinkedIn"/"Indeed"/"Reed"/... or null, "market": "A" or "B" or null, "agency": true/false/null, "missing": a tool the candidate lacks or null, "has": a tool named in the ad or null, "tailored": true/false/null},
 "groupBy": one of ${FIELDS.join(', ')} or null, "show": "count" or "list" or "rate" (share that reached screening)}
Schools, colleges and universities: put "school", "college" or "university" in "text". Known companies: ${companies.slice(0, 150).join(' | ')}.
QUESTION: """${question}"""` },
    ];
  }
  const norm = s => String(s || '').toLowerCase();
  function cleanQuery(q) {
    const f = (q && q.filter) || {};
    const date = s => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
    const bool = v => (v === true || v === false ? v : null);
    return {
      filter: {
        status: Array.isArray(f.status) ? f.status.filter(s => STAT.includes(s)) : null, replied: bool(f.replied), screened: bool(f.screened),
        from: date(f.from), to: date(f.to), text: typeof f.text === 'string' && f.text.trim() ? f.text.trim().slice(0, 60) : null,
        company: typeof f.company === 'string' && f.company.trim() ? f.company.trim() : null, platform: typeof f.platform === 'string' && f.platform ? f.platform : null,
        market: f.market === 'A' || f.market === 'B' ? f.market : null, agency: bool(f.agency), missing: typeof f.missing === 'string' && f.missing ? f.missing : null,
        has: typeof f.has === 'string' && f.has ? f.has : null, tailored: bool(f.tailored),
      },
      groupBy: FIELDS.includes(q && q.groupBy) ? q.groupBy : null,
      show: ['count', 'list', 'rate'].includes(q && q.show) ? q.show : 'count',
    };
  }
  /** Runs a cleaned query: { rows, groups?: [{ key, n, screens }], total, screens } */
  function runQuery(apps, q) {
    const f = q.filter;
    const rows = (apps || []).filter(a => {
      const d = String(a.appliedAt || '').slice(0, 10);
      if (f.status && f.status.length && !f.status.includes(a.status)) return false;
      if (f.replied != null && (POS.includes(a.status) || a.status === 'rejected') !== f.replied) return false;
      if (f.screened != null && POS.includes(a.status) !== f.screened) return false;
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
      if (f.text && !norm(a.title + ' ' + a.company).includes(norm(f.text))) return false;
      if (f.company && norm(a.company) !== norm(f.company)) return false;
      if (f.platform && norm(a.platform) !== norm(f.platform)) return false;
      if (f.market && a.market !== f.market) return false;
      if (f.agency != null && !!a.agency !== f.agency) return false;
      if (f.missing && !(a.missing || []).some(m => norm(m).includes(norm(f.missing)))) return false;
      if (f.has && !(a.tools || []).concat(a.missing || []).some(m => norm(m).includes(norm(f.has)))) return false;
      if (f.tailored != null && (a.cvKind === 'Tailored') !== f.tailored) return false;
      return true;
    });
    const out = { rows, total: rows.length, screens: rows.filter(a => POS.includes(a.status)).length };
    if (q.groupBy) {
      const key = a => q.groupBy === 'month' ? String(a.appliedAt).slice(0, 7) : q.groupBy === 'week' ? monday(Date.parse(a.appliedAt)).toISOString().slice(0, 10) : q.groupBy === 'channel' ? channelOf(a) : q.groupBy === 'cv' ? (a.cvKind || 'не отмечено') : (a[q.groupBy] || '—');
      const g = {};
      rows.forEach(a => { const k = key(a); const x = g[k] = g[k] || { key: k, n: 0, screens: 0 }; x.n++; if (POS.includes(a.status)) x.screens++; });
      out.groups = Object.values(g).sort((a, b) => (q.groupBy === 'month' || q.groupBy === 'week') ? a.key.localeCompare(b.key) : b.n - a.n);
    }
    return out;
  }

  // ---------- Offers ----------
  /** Effective hourly pay once the commute is counted. o: { salary (year), hourly, hours, days, commuteMin (one way), commuteCost (a day), weeks = 46 } */
  function offerMaths(o) {
    const hours = Number(o.hours) || 37.5, days = Number(o.days) || 5, weeks = Number(o.weeks) || 46;
    const year = Number(o.salary) || (Number(o.hourly) ? Number(o.hourly) * hours * 52 : 0);
    const workHours = hours * weeks, travelHours = (Number(o.commuteMin) || 0) * 2 / 60 * days * weeks;
    const travelCost = (Number(o.commuteCost) || 0) * days * weeks;
    const net = year - travelCost;
    return { year: Math.round(year), hourly: year ? Math.round(year / (hours * 52) * 100) / 100 : 0, effective: year ? Math.round(net / (workHours + travelHours) * 100) / 100 : 0, travelHours: Math.round(travelHours), travelCost: Math.round(travelCost) };
  }

  const api = { channelOf, minutesOf, costPerScreen, week, summaryForAi, askPrompt, cleanQuery, runQuery, offerMaths, POS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_Review = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
