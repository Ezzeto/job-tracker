/* Job Tracker — helpers that save time: ranking jobs from alert emails, and free slots for an interview.
 * Pure functions, shared by the web app and the tests. */
(function (root) {
  'use strict';
  const TARGET = /\b(it support|support (analyst|technician|engineer|specialist|officer|assistant)|service ?desk|help ?desk|technician|1st line|first line|2nd line|desktop|it operations|end ?user|deskside|it assistant|it apprentice|infrastructure support|it analyst|it officer|ict)\b/i;
  const SENIOR = /\b(senior|lead|manager|head of|principal|architect|director|3rd line|third line)\b/i;
  const OFF = /\b(developer|software engineer|data scientist|sales|recruit(er|ment consultant)|teacher|nurse|accountant|marketing|electrician|mechanic|driver|chef)\b/i;
  const PART = /\bpart[- ]time\b|\bweekend|\bterm[- ]time\b|\b(16|20|24|25|28|30)\s*hours\b|\bflexible\b|\bstudent\b|\btemporary\b/i;

  /**
   * items: [{ key, url, title, after, source, date }] from alert emails
   * rows: sheet rows (to skip jobs already applied for); hidden: { key: true }
   * Returns the best first: [{ ...item, score, why: [text], market }]
   */
  function rankAlerts(items, rows, hidden, profile) {
    const keyIn = (u, key) => u && key && String(u).includes(key.slice(2));
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const applied = (rows || []).map(r => ({ url: String(r.url || ''), t: norm(r.title), c: norm(r.company) }));
    const areas = ((profile && profile.areas) || []).map(a => String(a).toLowerCase()).filter(Boolean);
    const seen = new Set();
    return (items || []).filter(x => !(hidden || {})[x.key]).map(x => {
      const why = [];
      const text = x.title + ' ' + (x.after || '');
      let score = 0;
      if (TARGET.test(x.title)) { score += 3; why.push('твоя роль'); }
      if (SENIOR.test(x.title)) { score -= 5; why.push('senior'); }
      if (OFF.test(x.title)) score -= 4;
      const part = PART.test(text);
      if (part) { score += 2; why.push('можно с учёбой'); }
      if (areas.length && areas.some(a => text.toLowerCase().includes(a))) { score += 1; why.push('рядом'); }
      if (/\bremote\b/i.test(text)) { score += 0.5; why.push('удалённо'); }
      const ageH = (Date.now() - Date.parse(x.date)) / 36e5;
      if (ageH < 24) { score += 1; why.push('свежая'); }
      const company = String(x.after || '').split(' · ')[0];
      const dup = applied.some(a => keyIn(a.url, x.key) || (a.t && a.t === norm(x.title) && a.c && norm(company).includes(a.c)));
      return { ...x, company, score, why, market: part ? 'B' : 'A', dup };
    }).filter(x => !x.dup && x.score > 0 && !seen.has(norm(x.title + x.company)) && seen.add(norm(x.title + x.company)))
      .sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)));
  }

  /**
   * Free interview slots: working hours on your work days, not on study days, not on Sunday evening,
   * with a buffer around busy events. busy: [{ s, e, allDay }] ISO strings.
   * opts: { now, days = 10, studyDays = [3, 4] (0 = Monday), start = 9, end = 17, minutes = 60, buffer = 30, count = 3 }
   * Returns [Date] — at most one slot a day, spread over different days.
   */
  function freeSlots(busy, opts = {}) {
    const now = opts.now ? new Date(opts.now) : new Date();
    const days = opts.days || 10, study = opts.studyDays || [3, 4], start = opts.start || 9, end = opts.end || 17;
    const len = (opts.minutes || 60) * 60e3, buf = (opts.buffer == null ? 30 : opts.buffer) * 60e3, count = opts.count || 3;
    const B = (busy || []).map(b => ({ s: Date.parse(b.s), e: Date.parse(b.e), allDay: b.allDay }));
    const out = [];
    for (let d = 1; d <= days && out.length < count; d++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
      const dow = (day.getDay() + 6) % 7; // 0 = Monday
      if (study.includes(dow) || dow === 6) continue; // classes, and Sunday
      const dayStart = new Date(day); dayStart.setHours(start, 0, 0, 0);
      const dayEnd = new Date(day); dayEnd.setHours(end, 0, 0, 0);
      if (B.some(b => b.allDay && b.s <= dayStart.getTime() && b.e > dayStart.getTime())) continue;
      for (let t = dayStart.getTime(); t + len <= dayEnd.getTime(); t += 30 * 60e3) {
        if (t < now.getTime() + 18 * 36e5) continue; // not earlier than tomorrow-ish
        const clash = B.some(b => !b.allDay && t < b.e + buf && t + len > b.s - buf);
        if (!clash) { out.push(new Date(t)); break; }
      }
    }
    return out;
  }
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const slotText = d => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} at ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  /** A reply to an interview invitation offering the slots. English, plain. */
  function replyDraft({ name, company, title, slots, signName, phone }) {
    const hi = name ? `Hi ${String(name).split(/\s+/)[0]},` : 'Hello,';
    return [
      hi, '',
      `Thank you for inviting me to interview for the ${title || 'role'}${company ? ' at ' + company : ''}. I would be glad to.`,
      slots.length ? `I am available at any of these times:\n${slots.map(s => '• ' + slotText(s)).join('\n')}` : 'Please let me know a few times that suit you.',
      slots.length ? 'If none of these work, I am happy to fit around a time that suits you.' : '',
      '', 'Kind regards,', [signName || '[My name]', phone].filter(Boolean).join('\n'),
    ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  }

  const api = { rankAlerts, freeSlots, slotText, replyDraft, TARGET, SENIOR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_Assist = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
