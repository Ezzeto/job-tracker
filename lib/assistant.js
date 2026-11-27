/* Job Tracker — the assistant on the Progress page (and the same rules for Telegram).
 * Code counts everything: the week against the targets, the last 30 days, answers by channel, what is due,
 * what is missing most. AI only talks about these numbers, answers questions and writes a plan.
 * A question about your applications ("how many to schools in October") is first turned into a query that
 * this code runs (lib/review.js), and the result goes into the context. Pure functions.
 * An app is the plain object of lib/review.js plus { replied, reached, nextDate, followUps, workingDays }. */
(function (root) {
  'use strict';
  const DAY = 864e5;
  const POS = ['screening', 'test', 'interview1', 'interview2', 'interview3', 'offer', 'accepted', 'declined'];

  /** A question about the data itself: worth running a query first. */
  const wantsQuery = q => /сколько|какие|какой|кто |кому|список|покажи|где я|когда я|how many|which|who |list|show me|when did/i.test(String(q || ''));
  /** A request for a plan: the answer becomes the week's AI plan. */
  const wantsPlan = q => /план|plan|распиш|schedule|на неделю|for the week/i.test(String(q || ''));

  function context(apps, opts = {}) {
    const now = opts.now || Date.now();
    const list = apps || [];
    const mon = new Date(now); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - (mon.getDay() + 6) % 7);
    const wk = list.filter(a => Date.parse(a.appliedAt) >= mon.getTime());
    const t = opts.targets || { B: 7, A: 5, C: 3 };
    const win = (from, to) => { const l = list.filter(a => { const d = Date.parse(a.appliedAt); return d >= from && d < to; }); return `${l.length} applications, ${l.filter(a => a.replied).length} with any answer, ${l.filter(a => a.reached).length} reached screening or further`; };
    const ch = {};
    list.forEach(a => { const k = a.channel || 'Other'; const x = ch[k] = ch[k] || { n: 0, r: 0, s: 0 }; x.n++; if (a.replied) x.r++; if (a.reached) x.s++; });
    const due = list.filter(a => a.status === 'applied' && !(a.followUps || 0) && (a.workingDays || 0) >= 4).slice(0, 6);
    const next = list.filter(a => a.nextDate && Date.parse(a.nextDate) - now < 7 * DAY && Date.parse(a.nextDate) - now > -DAY).slice(0, 6);
    const inter = list.filter(a => /^interview|^test$|^screening$/.test(a.status || '')).slice(0, 6);
    const miss = {};
    list.filter(a => Date.parse(a.appliedAt) >= now - 60 * DAY).forEach(a => (a.missing || []).forEach(m => { miss[m] = (miss[m] || 0) + 1; }));
    const recent = list.slice().sort((a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt))).slice(0, 12);
    const day = new Date(now);
    return [
      `Today: ${day.toISOString().slice(0, 10)} (${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day.getDay()]}).${opts.studyDays && opts.studyDays.length ? ` Days with classes: ${opts.studyDays.map(d => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d]).join(', ')}.` : ''}`,
      'Two searches: market B = part-time work alongside a Computing degree (main priority); market A = full-time, only if worth a study break (known company, £30k+, growth).',
      `This week: market B ${wk.filter(a => a.market === 'B').length} of ${t.B}, market A ${wk.filter(a => a.market === 'A').length} of ${t.A}. Cold emails target ${t.C} a week (counted on the phone).`,
      `Last 30 days: ${win(now - 30 * DAY, now + DAY)}. The 30 days before: ${win(now - 60 * DAY, now - 30 * DAY)}.`,
      `All time: ${list.length} applications, ${list.filter(a => a.replied).length} answered, ${list.filter(a => POS.includes(a.status) || a.reached).length} screenings, ${list.filter(a => a.status === 'rejected').length} rejections.`,
      `By channel (applications / answered / screenings): ${Object.entries(ch).sort((a, b) => b[1].n - a[1].n).map(([k, x]) => `${k} ${x.n}/${x.r}/${x.s}`).join('; ') || 'none'}.`,
      due.length ? `Follow-ups due (4+ working days, none sent): ${due.map(a => `${a.title} — ${a.company}`).join('; ')}.` : 'No follow-ups due.',
      next.length ? `Next steps within 7 days: ${next.map(a => `${String(a.nextDate).slice(0, 10)} ${a.title} — ${a.company}`).join('; ')}.` : '',
      inter.length ? `In progress: ${inter.map(a => `${a.title} — ${a.company} (${a.status})`).join('; ')}.` : '',
      opts.session ? `Jobs waiting in tonight's application session: ${opts.session}.` : '',
      Object.keys(miss).length ? `Tools the jobs ask for that the candidate lacks (last 60 days): ${Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ×${n}`).join(', ')}.` : '',
      `Latest applications: ${recent.map(a => `${String(a.appliedAt).slice(0, 10)} ${a.title} — ${a.company} [${a.status}${a.market ? ', ' + a.market : ''}]`).join('; ') || 'none'}.`,
      opts.query ? `QUERY RESULT for the question: ${opts.query}` : '',
    ].filter(Boolean).join('\n');
  }

  function system(plan) {
    return [
      'You are the job search coach inside the candidate\'s tracker. The candidate is a Computing student in the UK looking for entry-level IT support work.',
      'Answer ONLY from the DATA below; never invent numbers, companies or events. If the data does not say, say so.',
      'Reply in the language of the question. Short and concrete: at most 150 words unless a plan is asked for.',
      'When you suggest actions, use what the tracker can do: follow-ups from the Follow-ups page, the panel on a job page (cover letter, form answers, tailored CV), the application session for the evening, cold emails to employers nearby on the phone, home lab tasks under CV & skills.',
      plan ? 'The candidate asks for a plan: give 5–8 tasks for the week, one per line, each starting with "- ", concrete and countable (how many, which market, which day). Respect days with classes. No intro, no outro.' : '',
    ].filter(Boolean).join('\n');
  }

  /** The query result in words, for the context. r = JT_Review.runQuery(...) */
  function queryText(r) {
    if (!r) return '';
    const g = r.groups ? ' Groups: ' + r.groups.slice(0, 12).map(x => `${x.key}: ${x.n}${x.screens ? ` (${x.screens} screenings)` : ''}`).join('; ') + '.' : '';
    const rows = r.total && r.total <= 15 ? ' Rows: ' + r.rows.map(a => `${String(a.appliedAt).slice(0, 10)} ${a.title} — ${a.company} [${a.status}]`).join('; ') + '.' : '';
    return `${r.total} applications match, ${r.screens} reached screening.${g}${rows}`;
  }

  const api = { context, system, queryText, wantsQuery, wantsPlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_Assistant = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
