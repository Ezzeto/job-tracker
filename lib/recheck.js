/* Job Tracker — re-checks saved applications: repairs titles, cleans descriptions,
 * re-scores, finds duplicates and fixes clashing ticket numbers. Pure functions on an array of
 * applications, so the dashboard and scripts/audit-export.js run exactly the same code. */
(function (root) {
  'use strict';
  const A = root.JT_Analyzer, Q = root.JT_Quality;

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const cleanDate = v => (ISO_DATE.test(String(v || '')) && !isNaN(Date.parse(v)) ? v : '');

  // 'Service Desk Support Analyst | FRP Advisory |' → title + company
  function splitTitle(title, company) {
    let t = String(title || '').trim(), c = String(company || '').trim();
    const parts = t.split(/\s*\|\s*/).map(x => x.trim()).filter(x => x && !/^linkedin$/i.test(x));
    if (parts.length > 1) { t = parts[0]; if (!c) c = parts[1]; }
    // Reed card dates leak into the company: '16 September by GroupNexus'
    c = c.replace(/^\d{1,2}\s+[A-Za-z]+\s+by\s+/i, '').trim();
    return { title: t, company: c };
  }

  const normTitle = t => String(t || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9+#]+/g, ' ').replace(/\b(job|role|vacancy|uk|london|remote|hybrid)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const normCompany = c => String(c || '').toLowerCase().replace(/\b(ltd|limited|plc|inc|llc|group|uk|the|recruitment|international|technologies|solutions|consulting|talent|services|co)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const ticketNum = t => { const m = String(t || '').match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : 0; };
  const created = a => Date.parse(a.createdAt || a.appliedAt) || 0;
  const DAY = 864e5;
  // Words 2…60 of the ad body, so page chrome at the very start does not matter
  function fingerprint(desc) {
    const w = String(desc || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(x => x.length > 2);
    if (w.length < 80) return '';
    return w.slice(20, 80).join(' ');
  }

  /** Re-checks one application in place. Returns a list of what changed. */
  function recheckOne(a, profile) {
    const changes = [];
    // 1) Dates the sheet cannot read (',' or '1970-01-01') become empty
    if (a.nextDate && !cleanDate(a.nextDate)) { a.nextDate = ''; changes.push('date'); }
    if (a.nextDate === '1970-01-01') { a.nextDate = ''; changes.push('date'); }

    // 2) Title and company
    const st = splitTitle(a.title, a.company);
    if (st.title !== a.title || st.company !== a.company) { a.title = st.title; a.company = st.company; changes.push('title'); }
    const raw = String(a.rawDescription || a.description || '');
    a.formPage = !!(Q && Q.looksLikeApplicationForm(raw));
    if (Q && (Q.isJunkTitle(a.title) || !a.title || a.formPage)) {
      const cleaned = Q.cleanDescription(raw, {}).text;
      const h = (a.formPage && Q.headerFromForm(raw)) || Q.recoverHeader(raw) || Q.recoverHeader(cleaned);
      if (h && h.title && h.title !== a.title) {
        a.title = h.title;
        if (h.company && (!a.company || Q.isJunkTitle(a.company))) a.company = h.company;
        changes.push('title');
      }
    }

    // 3) Description without page chrome (the original is kept once, so a later re-check can redo it)
    if (Q && raw) {
      const c = Q.cleanDescription(raw, { title: a.title });
      if (c.text !== String(a.description || '')) {
        if (!a.rawDescription && c.removed > 0) a.rawDescription = raw;
        a.description = c.text;
        changes.push('description');
      }
    }

    // 4) Score again with the current rules; a record with nothing to score is incomplete
    if (!a.title && !a.description) {
      const was = a.chance && a.chance.verdict;
      a.chance = { ...(a.chance || {}), verdict: 'incomplete', confidence: 'low', score: (a.chance && a.chance.score) || 0, tools: [], reasons: [], gates: { blocks: [], asks: [] }, quality: { ok: false, issues: [{ code: 'no-description', text: 'No title or description saved', hard: true }] }, v: 3 };
      if (was !== 'incomplete') changes.push('score');
    } else {
      const an = A.analyze({ title: a.title, company: a.company, description: a.description || '', location: a.location, workTypes: a.workTypes, category: a.category, track: a.track, salaryText: a.salaryText }, profile);
      const before = a.chance ? a.chance.verdict + ':' + a.chance.score : '';
      a.chance = an.chance; a.tools = an.chance.tools; a.track = an.track; a.placement = an.placement;
      if (a.description) a.details = an.details;
      if (before !== a.chance.verdict + ':' + a.chance.score) changes.push('score');
    }
    return changes;
  }

  /**
   * Groups of the same job: same link, or same company and title saved within two weeks.
   * Application-form records join the job they were made from. Returns Map(id → primary id).
   */
  function findDuplicates(apps) {
    const dupOf = new Map();
    const better = (x, y) => { // the record to keep: a real ad first, then the oldest
      const qx = x.chance && x.chance.verdict !== 'incomplete', qy = y.chance && y.chance.verdict !== 'incomplete';
      if (qx !== qy) return qx ? x : y;
      return created(x) <= created(y) ? x : y;
    };
    const groups = new Map();
    const put = (k, a) => { if (!k) return; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); };
    apps.forEach(a => {
      put(a.urlKey ? 'u:' + a.urlKey : '', a);
      const t = normTitle(a.title), c = normCompany(a.company);
      if (t && c) put('t:' + t + '|' + c, a);
      // The same ad text saved twice (titles may be junk, so the text is the key)
      const fp = a.formPage ? '' : fingerprint(a.description);
      if (fp) put('d:' + fp, a);
    });
    // Union of overlapping groups
    const parent = new Map(apps.map(a => [a.id, a.id]));
    const find = id => { while (parent.get(id) !== id) { parent.set(id, parent.get(parent.get(id))); id = parent.get(id); } return id; };
    groups.forEach((list, key) => {
      for (let i = 1; i < list.length; i++) {
        const x = list[0], y = list[i];
        // Same text but different real titles: two jobs at a company that reuses its blurb
        if (key.startsWith('d:') && normTitle(x.title) !== normTitle(y.title) && !(Q && (Q.isJunkTitle(x.title) || Q.isJunkTitle(y.title)))) continue;
        if (!key.startsWith('u:') && Math.abs(created(x) - created(y)) > 14 * DAY && Math.abs((Date.parse(x.appliedAt) || 0) - (Date.parse(y.appliedAt) || 0)) > 14 * DAY) continue;
        parent.set(find(y.id), find(x.id));
      }
    });
    const sets = new Map();
    apps.forEach(a => { const r = find(a.id); if (!sets.has(r)) sets.set(r, []); sets.get(r).push(a); });
    sets.forEach(list => {
      if (list.length < 2) return;
      const keep = list.reduce(better);
      list.forEach(a => { if (a !== keep) dupOf.set(a.id, keep.id); });
    });
    return dupOf;
  }

  // Order of progress, to keep the furthest status when two records are merged
  const STAGE = ['applied', 'noresponse', 'withdrawn', 'screening', 'test', 'rejected', 'interview1', 'interview2', 'interview3', 'declined', 'offer', 'accepted'];

  /** Folds duplicates into the record kept. Returns { apps, merged: [{ ticket, into }] }. */
  function mergeDuplicates(apps) {
    const dup = findDuplicates(apps);
    const byId = new Map(apps.map(a => [a.id, a]));
    const merged = [];
    dup.forEach((keepId, id) => {
      const keep = byId.get(keepId), d = byId.get(id);
      if (!keep || !d) return;
      const hist = (keep.history || []).concat(d.history || []).sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
      keep.history = hist.filter((h, i) => i === 0 || !(h.status === hist[i - 1].status && Math.abs(Date.parse(h.at) - Date.parse(hist[i - 1].at)) < 6e4));
      // The latest change of status wins; a later 'applied' never undoes a rejection
      const last = keep.history[keep.history.length - 1];
      if (last && STAGE.indexOf(last.status) >= STAGE.indexOf(keep.status)) keep.status = last.status;
      if (Date.parse(d.appliedAt) < Date.parse(keep.appliedAt)) keep.appliedAt = d.appliedAt;
      if (d.notes && !String(keep.notes || '').includes(d.notes.trim())) keep.notes = [keep.notes, d.notes].filter(Boolean).join('\n\n');
      keep.contacts = (keep.contacts || []).concat((d.contacts || []).filter(c => !(keep.contacts || []).some(k => k.type === c.type && k.value === c.value)));
      keep.followUps = (keep.followUps || []).concat(d.followUps || []);
      if (!keep.nextDate && d.nextDate) keep.nextDate = d.nextDate;
      if (!keep.salaryText && d.salaryText) { keep.salaryText = d.salaryText; keep.salary = d.salary; }
      if ((!keep.description || keep.description.length < (d.description || '').length / 2) && d.chance && d.chance.verdict !== 'incomplete') keep.description = d.description;
      merged.push({ id, ticket: d.ticket, into: keep.ticket, keepId });
    });
    const gone = new Set(merged.map(m => m.id));
    return { apps: apps.filter(a => !gone.has(a.id)), merged };
  }

  /** Clashing ticket numbers: the oldest keeps its number, the rest get new ones. */
  function fixTickets(apps, counter) {
    let next = Math.max(counter || 0, ...apps.map(a => ticketNum(a.ticket)));
    const seen = new Set();
    const renumbered = [];
    apps.slice().sort((x, y) => created(x) - created(y)).forEach(a => {
      const t = a.ticket;
      if (t && !seen.has(t)) { seen.add(t); return; }
      next += 1;
      a.ticket = 'APP-' + String(next).padStart(4, '0');
      seen.add(a.ticket);
      renumbered.push({ id: a.id, from: t || '(none)', to: a.ticket });
    });
    return { renumbered, counter: next };
  }

  /** Runs everything except merging (which deletes records, so the user confirms it). */
  function recheckAll(apps, profile, counter) {
    const report = { checked: 0, titles: 0, cleaned: 0, dates: 0, rescored: 0, incomplete: [], duplicates: [], renumbered: [], verdicts: {} };
    apps.forEach(a => {
      const ch = recheckOne(a, profile);
      report.checked++;
      if (ch.includes('title')) report.titles++;
      if (ch.includes('description')) report.cleaned++;
      if (ch.includes('date')) report.dates++;
      if (ch.includes('score')) report.rescored++;
      const v = (a.chance && a.chance.verdict) || 'none';
      report.verdicts[v] = (report.verdicts[v] || 0) + 1;
      if (v === 'incomplete') report.incomplete.push(a.ticket);
      delete a.dupOf;
    });
    const dup = findDuplicates(apps);
    const byId = new Map(apps.map(a => [a.id, a]));
    dup.forEach((keepId, id) => { const a = byId.get(id); a.dupOf = byId.get(keepId).ticket; report.duplicates.push({ ticket: a.ticket, of: a.dupOf }); });
    const t = fixTickets(apps, counter);
    report.renumbered = t.renumbered; report.counter = t.counter;
    report.summary = `${report.checked} checked · ${report.titles} titles repaired · ${report.cleaned} descriptions cleaned · ${report.rescored} re-scored · ${report.incomplete.length} incomplete · ${report.duplicates.length} duplicates · ${report.renumbered.length} tickets renumbered`;
    return report;
  }

  const api = { recheckOne, recheckAll, findDuplicates, mergeDuplicates, fixTickets, splitTitle, normTitle, normCompany, cleanDate };
  root.JT_Recheck = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
