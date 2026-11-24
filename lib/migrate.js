/* Job Tracker — data schema migrations.
 * Version 2 (3.7): history becomes a list of events that can be undone, exact duplicates
 * (the same link saved twice, mostly by the Google Sheets pull) are merged, dates before 2000
 * and salaries read wrongly by older versions are repaired, and every record is re-checked with
 * the current rules, so records without an ad show '?' instead of a percentage.
 * Pure: takes { apps, profile, counter, pendingDeletes } and returns a new copy plus a report.
 * The caller keeps a backup before saving (background.js, dashboard import). */
(function (root) {
  'use strict';
  const SCHEMA = 2;

  const yearOk = v => { const t = Date.parse(v); return !isNaN(t) && new Date(t).getUTCFullYear() >= 2000; };
  const clone = o => JSON.parse(JSON.stringify(o));
  let seq = 0;
  const evId = at => 'e' + (Date.parse(at) || Date.now()).toString(36) + (seq++).toString(36).padStart(3, '0');

  /** Old history entries { at, status } become events { id, at, type, status, from, by }. */
  function upgradeHistory(a) {
    let prev = null, changed = false;
    a.history = (a.history || []).filter(h => h && h.at).map(h => {
      if (h.id) { if (h.status) prev = h.status; return h; }
      changed = true;
      const ev = { id: evId(h.at), at: h.at, type: h.status ? 'status' : (h.type || 'edit'), by: h.by || 'me' };
      if (h.status) { ev.status = h.status; if (prev && prev !== h.status) ev.from = prev; prev = h.status; }
      return ev;
    });
    // Repeated 'applied' at the same moment (two captures) is one event
    const out = [];
    a.history.forEach(h => {
      const last = out[out.length - 1];
      if (last && last.status && last.status === h.status && Math.abs(Date.parse(h.at) - Date.parse(last.at)) < 6e4) { changed = true; return; }
      out.push(h);
    });
    a.history = out;
    return changed;
  }

  /** Dates before 2000 (01.01.1970 from an empty cell) are replaced by the best real date. */
  function fixDates(a, now) {
    let changed = false;
    const firstEvent = (a.history || []).map(h => h.at).find(yearOk);
    ['appliedAt', 'createdAt', 'updatedAt'].forEach(k => {
      if (a[k] && yearOk(a[k])) return;
      a[k] = (k !== 'createdAt' && yearOk(a.createdAt) && a.createdAt) || firstEvent || (yearOk(a.appliedAt) && a.appliedAt) || now;
      changed = true;
    });
    if (a.nextDate && (!/^\d{4}-\d{2}-\d{2}$/.test(a.nextDate) || !yearOk(a.nextDate))) { a.nextDate = ''; changed = true; }
    (a.history || []).forEach(h => { if (!yearOk(h.at)) { h.at = a.appliedAt; changed = true; } });
    return changed;
  }

  /** Salaries saved by older parsers ('£26-28,000' as £26) are read again from their text. */
  function fixSalary(a, A) {
    const text = a.salaryText || (a.salary && a.salary.text) || '';
    if (!text || !A || !A.parseSalary) return false;
    const s = A.parseSalary(text);
    const o = a.salary || {};
    if (!s || (s.annualMin === o.annualMin && s.annualMax === o.annualMax && s.period === o.period && s.min === o.min && s.max === o.max)) return false;
    a.salary = s;
    return true;
  }

  // Order of progress: the record that got furthest is the one kept
  const STAGE = ['applied', 'noresponse', 'withdrawn', 'screening', 'test', 'rejected', 'interview1', 'interview2', 'interview3', 'declined', 'offer', 'accepted'];
  function better(x, y) {
    const sx = STAGE.indexOf(x.status), sy = STAGE.indexOf(y.status);
    if (sx !== sy) return sx > sy ? x : y;
    const dx = (x.description || '').length, dy = (y.description || '').length;
    if (dx !== dy) return dx > dy ? x : y;
    return (Date.parse(x.createdAt) || 0) <= (Date.parse(y.createdAt) || 0) ? x : y;
  }

  function migrateV2(input, opts) {
    const o = opts || {};
    const A = o.A || root.JT_Analyzer, R = o.R || root.JT_Recheck;
    const now = o.now || new Date().toISOString();
    const data = clone({ apps: input.apps || [], profile: input.profile || null, counter: input.counter || 0, pendingDeletes: input.pendingDeletes || [] });
    const report = { from: input.schema || 1, to: SCHEMA, apps: data.apps.length, history: 0, dates: 0, salaries: 0, merged: [], rescored: 0, renumbered: [], profile: [] };

    data.apps.forEach(a => {
      if (upgradeHistory(a)) report.history++;
      if (fixDates(a, now)) report.dates++;
      if (fixSalary(a, A)) report.salaries++;
    });

    // The same link saved twice is one application
    const byKey = new Map();
    data.apps.forEach(a => { if (a.urlKey) { if (!byKey.has(a.urlKey)) byKey.set(a.urlKey, []); byKey.get(a.urlKey).push(a); } });
    const gone = new Set();
    byKey.forEach(list => {
      if (list.length < 2) return;
      const keep = list.reduce(better);
      list.forEach(d => {
        if (d === keep) return;
        if (R && R.foldInto) R.foldInto(keep, d);
        else keep.mergedIds = [...new Set([...(keep.mergedIds || []), d.id])];
        if ((d.description || '').length > (keep.description || '').length) { keep.description = d.description; if (d.rawDescription) keep.rawDescription = d.rawDescription; }
        gone.add(d.id);
        if (d.syncedAt) data.pendingDeletes.push(d.id);
        report.merged.push({ ticket: d.ticket, into: keep.ticket });
      });
      keep.history.sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
    });
    data.apps = data.apps.filter(a => !gone.has(a.id));

    // Current rules over every record: titles, descriptions, scores, '?' without an ad
    const profile = A && data.profile ? { ...A.DEFAULT_PROFILE, ...data.profile, intern: { ...A.DEFAULT_PROFILE.intern, ...(data.profile.intern || {}) } } : null;
    if (R && R.recheckOne && profile) data.apps.forEach(a => { const ch = R.recheckOne(a, profile); if (ch.includes('score') || ch.includes('rescored') || ch.length) report.rescored++; });
    if (R && R.fixTickets) { const t = R.fixTickets(data.apps, data.counter); report.renumbered = t.renumbered; data.counter = t.counter; }

    if (data.profile && !data.profile.schema) {
      // The export of 24.11.2026 had this set by mistake: full right to work, no sponsorship
      if (data.profile.timeLimitedRtw) { data.profile.timeLimitedRtw = false; report.profile.push('timeLimitedRtw'); }
      data.profile.schema = SCHEMA;
    }
    data.pendingDeletes = [...new Set(data.pendingDeletes)];
    data.schema = SCHEMA;
    report.summary = `${report.apps} records · ${report.merged.length} duplicates merged · ${report.dates} dates repaired · ${report.salaries} salaries re-read · ${report.history} histories upgraded`;
    return { ...data, report };
  }

  /** True when stored data is older than this version's schema. */
  const needsMigration = schema => !schema || schema < SCHEMA;

  root.JT_Migrate = { SCHEMA, migrateV2, needsMigration, upgradeHistory, fixDates, fixSalary };
})(typeof globalThis !== 'undefined' ? globalThis : this);
