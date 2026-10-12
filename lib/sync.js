/* Job Tracker — two-way sync with a Google Sheet through Apps Script (runs in the service worker) */
(function (root) {
  'use strict';
  const A = root.JT_Analyzer, S = root.JT_Store, L = root.JT_Legacy;
  let running = null;
  const NEED_SCRIPT = 8; // 8 = English sheet and per-install token
  let scriptVersion = null;
  const oldScriptMsg = () => ' The script in your sheet is out of date: paste the new Code.gs and update the deployment (Manage deployments → New version).';

  async function getCfg() { const { sheetCfg } = await S.get('sheetCfg'); return sheetCfg || {}; }
  async function setState(state) { await S.set({ syncState: { at: new Date().toISOString(), ...state } }); }

  async function call(cfg, method, payload) {
    if (!cfg.url || !cfg.token) throw new Error('Sheet link or token is missing');
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(cfg.url)) throw new Error('The link should look like https://script.google.com/macros/s/…/exec');
    let res;
    if (method === 'GET') {
      const u = new URL(cfg.url);
      u.searchParams.set('token', cfg.token);
      Object.entries(payload || {}).forEach(([k, v]) => u.searchParams.set(k, v));
      res = await fetch(u.toString(), { redirect: 'follow' });
    } else {
      res = await fetch(cfg.url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...payload, token: cfg.token }) });
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) {
      throw new Error(/accounts\.google|Sign in|ServiceLogin/i.test(text)
        ? 'Google is asking to sign in: deploy the web app with "Who has access: Anyone"'
        : 'The sheet did not reply with JSON (HTTP ' + res.status + '). Check that the latest script version is deployed.');
    }
    if (!data.ok) throw new Error(data.error || 'Script error');
    return data;
  }

  function toRow(a) {
    return {
      id: a.id, ticket: a.ticket || '', title: a.title || '', company: a.company || '', location: a.location || '',
      category: a.category || '', workTypes: (a.workTypes || []).join(', '),
      salary: a.salaryText || (a.salary && a.salary.text) || '', platform: a.platform || '',
      appliedAt: a.appliedAt || '', status: A.statusLabel(a.status), chance: a.chance ? a.chance.score : '',
      nextDate: a.nextDate || '', notes: a.notes || '', missing: a.chance ? (a.chance.missing || []).join(', ') : '',
      tools: (a.tools || []).join(', '), details: (a.details || []).join(' • '), url: a.url || '',
      benefits: (a.benefits || []).join(' • '),
      track: a.track === 'intern' ? 'Internship' : 'Job',
      placement: a.track === 'intern' && a.placement ? ({ ok: 'Fits', warn: 'Check', fail: 'Breaks rules' })[a.placement.verdict] : '',
      contacts: (a.contacts || []).filter(c => c.type !== 'name' || !(a.contacts || []).some(o => o !== c && o.name === c.value)).map(c => (c.name && c.type !== 'name' ? c.name + ': ' : '') + c.value).join(' • '),
      followup: (a.followUps || []).length ? `${a.followUps.length} · ${new Date(a.followUps[a.followUps.length - 1].at).toLocaleDateString('en-GB')}` : '',
      updated: Date.parse(a.updatedAt) || Date.now(),
    };
  }
  // Accepts the English labels and the Russian ones used by sheets created before 2.0
  const statusIdFromLabel = l => (A.STATUSES.find(s => s.label === String(l).trim()) || {}).id || L.statusId(l);

  async function push(cfg) {
    const apps = await S.getApps();
    const { pendingDeletes = [] } = await S.get('pendingDeletes');
    const dirty = apps.filter(S.isDirty);
    if (!dirty.length && !pendingDeletes.length) return { pushed: 0, deleted: 0 };
    let pushed = 0;
    for (let i = 0; i < Math.max(dirty.length, 1); i += 80) {
      const chunk = dirty.slice(i, i + 80);
      const res = await call(cfg, 'POST', { apps: chunk.map(toRow), deletes: i === 0 ? pendingDeletes : [] });
      scriptVersion = res.version || 0;
      pushed += chunk.length;
    }
    const sent = new Map(dirty.map(a => [a.id, S.revKey(a)]));
    const fresh = await S.getApps();
    // Only mark what was sent; anything edited while the request was in flight stays dirty
    fresh.forEach(a => { if (sent.has(a.id) && sent.get(a.id) === S.revKey(a)) S.markSynced(a); });
    await S.saveApps(fresh);
    const { pendingDeletes: pd2 = [] } = await S.get('pendingDeletes');
    await S.set({ pendingDeletes: pd2.filter(id => !pendingDeletes.includes(id)) });
    return { pushed, deleted: pendingDeletes.length };
  }

  async function pull(cfg) {
    const { rows } = await call(cfg, 'GET', {});
    const apps = await S.getApps();
    const { pendingDeletes = [] } = await S.get('pendingDeletes');
    const byId = new Map(apps.map(a => [a.id, a]));
    const inSheet = new Set();
    let changed = 0, created = 0;
    const now = new Date().toISOString();
    for (const r of rows) {
      const id = String(r.id);
      inSheet.add(id);
      const a = byId.get(id);
      if (!a) {
        if (pendingDeletes.includes(id)) continue;
        const status = statusIdFromLabel(r.status) || 'applied';
        const appliedAt = r.appliedAt ? new Date(r.appliedAt + 'T12:00:00').toISOString() : now;
        const score = Number(r.chance);
        const salary = r.salary ? (A.parseSalary(String(r.salary)) || { text: String(r.salary) }) : null;
        const na = {
          id, ticket: r.ticket || '', title: String(r.title || ''), company: String(r.company || ''), location: String(r.location || ''),
          url: String(r.url || ''), platform: String(L.value(r.platform) || 'Other'), category: String(L.value(r.category) || 'Other'),
          workTypes: String(r.workTypes || '').split(',').map(s => s.trim()).filter(Boolean),
          salaryText: salary ? salary.text : '', salary, appliedAt, status, history: [{ status, at: appliedAt }],
          tools: String(r.tools || '').split(',').map(s => s.trim()).filter(Boolean),
          details: String(r.details || '').split(' • ').filter(Boolean),
          benefits: String(r.benefits || '').split(' • ').filter(Boolean),
          chance: score ? { score, label: score >= 70 ? 'High' : score >= 50 ? 'Medium' : score >= 30 ? 'Low' : 'Very low', tools: [], matched: [], basic: [], missing: String(r.missing || '').split(',').map(s => s.trim()).filter(Boolean), reasons: [{ text: 'Restored from Google Sheet', delta: null }] } : null,
          description: '', notes: String(r.notes || ''), nextDate: r.nextDate || '', offer: null,
          createdAt: now, updatedAt: now, rev: 1,
        };
        if (!na.ticket) {
          const { counter } = await S.get('counter');
          const c = (counter || 0) + 1; await S.set({ counter: c });
          na.ticket = 'APP-' + String(c).padStart(4, '0');
        }
        na.urlKey = na.url ? S.normUrl(na.url) : '';
        apps.unshift(na); byId.set(id, na); created++;
        continue;
      }
      if (!(r.updated > (Date.parse(a.updatedAt) || 0))) continue;
      const patch = {};
      const st = statusIdFromLabel(r.status);
      if (st && st !== a.status) patch.status = st;
      ['title', 'company', 'location', 'notes'].forEach(k => { const v = String(r[k] == null ? '' : r[k]); if (v !== (a[k] || '')) patch[k] = v; });
      if ((r.nextDate || '') !== (a.nextDate || '')) patch.nextDate = r.nextDate || '';
      const sal = String(r.salary || '');
      if (sal !== (a.salaryText || (a.salary && a.salary.text) || '')) { patch.salaryText = sal; patch.salary = sal ? (A.parseSalary(sal) || { text: sal }) : null; }
      if (!Object.keys(patch).length) continue;
      if (patch.status) a.history = (a.history || []).concat([{ status: patch.status, at: new Date(r.updated).toISOString() }]);
      const wasClean = !S.isDirty(a);
      Object.assign(a, patch);
      S.touch(a);
      if (wasClean) S.markSynced(a); // now equal to the sheet row, no need to send it back
      changed++;
    }
    // Rows deleted in the sheet are sent back on the next push
    apps.forEach(a => { if (a.syncedAt && !inSheet.has(a.id)) { delete a.syncedAt; delete a.syncedKey; } });
    await S.saveApps(apps);
    return { changed, created };
  }

  async function syncNow(opts = {}) {
    if (running) return running;
    running = (async () => {
      const cfg = await getCfg();
      if (!cfg.url || !cfg.token) return { ok: false, error: 'Sync is not set up' };
      try {
        let pulled = { changed: 0, created: 0 };
        if (!opts.pushOnly) pulled = await pull(cfg);
        const pushed = await push(cfg);
        let msg = `From the sheet: ${pulled.changed} changed, ${pulled.created} added. To the sheet: ${pushed.pushed} sent${pushed.deleted ? ', ' + pushed.deleted + ' deleted' : ''}.`;
        if (scriptVersion !== null && scriptVersion < NEED_SCRIPT) msg += oldScriptMsg();
        await setState({ ok: true, msg });
        return { ok: true, msg };
      } catch (e) {
        await setState({ ok: false, msg: String(e.message || e) });
        return { ok: false, error: String(e.message || e) };
      }
    })();
    try { return await running; } finally { running = null; }
  }

  async function test(cfg) {
    try {
      const d = await call(cfg, 'GET', { action: 'ping' });
      scriptVersion = d.version || 0;
      const old = scriptVersion < NEED_SCRIPT;
      return { ok: !old, ok2: true, msg: `Connected to "${d.name}", ${d.rows} rows.` + (old ? oldScriptMsg() : ''), error: old ? `Connected to "${d.name}", but` + oldScriptMsg() : undefined };
    }
    catch (e) { return { ok: false, error: String(e.message || e) }; }
  }

  root.JT_Sync = { syncNow, test, getCfg };
})(typeof globalThis !== 'undefined' ? globalThis : this);
