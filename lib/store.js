/* Job Tracker — storage layer (chrome.storage.local) */
(function (root) {
  'use strict';
  const A = root.JT_Analyzer;
  const area = () => chrome.storage.local;
  const get = keys => new Promise(r => area().get(keys, r));
  const set = obj => new Promise(r => area().set(obj, r));

  async function getProfile() {
    const { profile } = await get('profile');
    const d = A.DEFAULT_PROFILE;
    if (!profile) return JSON.parse(JSON.stringify(d));
    return { ...d, ...profile, skills: { ...(profile.skills || d.skills) }, areas: profile.areas || d.areas };
  }
  async function saveProfile(profile) { await set({ profile }); }

  async function getApps() {
    const { apps } = await get('apps');
    return Array.isArray(apps) ? apps : [];
  }
  async function saveApps(apps) { await set({ apps }); }

  function normUrl(u) {
    try {
      const x = new URL(u);
      const keep = ['currentJobId', 'jk', 'vjk', 'jobId', 'id'];
      const params = new URLSearchParams();
      keep.forEach(k => { if (x.searchParams.get(k)) params.set(k, x.searchParams.get(k)); });
      const q = params.toString();
      return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '') + (q ? '?' + q : '')).toLowerCase();
    } catch (e) { return (u || '').toLowerCase(); }
  }

  async function findByUrl(url) {
    const n = normUrl(url);
    return (await getApps()).find(a => a.urlKey === n) || null;
  }

  async function nextTicket() {
    const { counter } = await get('counter');
    const c = (counter || 0) + 1;
    await set({ counter: c });
    return 'APP-' + String(c).padStart(4, '0');
  }

  async function addApp(data) {
    const apps = await getApps();
    const now = new Date().toISOString();
    const app = {
      id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ticket: await nextTicket(),
      title: '', company: '', location: '', url: '', platform: '', category: 'Other',
      workTypes: [], salaryText: '', salary: null, appliedAt: now, status: 'applied',
      history: [{ status: data.status || 'applied', at: now }],
      tools: [], details: [], benefits: [], contacts: [], followUps: [], chance: null, description: '', notes: '', nextDate: '', offer: null,
      createdAt: now, updatedAt: now, rev: 1,
      ...data,
    };
    app.urlKey = app.url ? normUrl(app.url) : '';
    apps.unshift(app);
    await saveApps(apps);
    return app;
  }

  async function updateApp(id, patch) {
    const apps = await getApps();
    const i = apps.findIndex(a => a.id === id);
    if (i < 0) return null;
    const cur = apps[i];
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString(), rev: (cur.rev || 0) + 1 };
    if (patch.status && patch.status !== cur.status) {
      next.history = (cur.history || []).concat([{ status: patch.status, at: new Date().toISOString() }]);
    }
    if (patch.url !== undefined) next.urlKey = patch.url ? normUrl(patch.url) : '';
    apps[i] = next;
    await saveApps(apps);
    return next;
  }

  async function deleteApp(id) {
    const apps = await getApps();
    const app = apps.find(a => a.id === id);
    if (app && app.syncedAt) {
      const { pendingDeletes = [] } = await get('pendingDeletes');
      await set({ pendingDeletes: pendingDeletes.concat(id) });
    }
    await saveApps(apps.filter(a => a.id !== id));
  }

  function platformFromUrl(url) {
    let h = '';
    try { h = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return 'Other'; }
    const map = [
      [/linkedin\./, 'LinkedIn'], [/indeed\./, 'Indeed'], [/reed\.co\.uk/, 'Reed'],
      [/totaljobs\./, 'Totaljobs'], [/cv-library\./, 'CV-Library'], [/cwjobs\./, 'CWJobs'],
      [/glassdoor\./, 'Glassdoor'], [/jobs\.ac\.uk/, 'jobs.ac.uk'], [/monster\./, 'Monster'],
      [/adzuna\./, 'Adzuna'], [/findajob\.dwp|gov\.uk/, 'Find a job (GOV.UK)'], [/ziprecruiter\./, 'ZipRecruiter'],
      [/hays\./, 'Hays'], [/otta\.|welcometothejungle/, 'Welcome to the Jungle'],
    ];
    for (const [re, name] of map) if (re.test(h)) return name;
    return 'Company website';
  }

  const PLATFORMS = ['LinkedIn', 'Indeed', 'Reed', 'Totaljobs', 'CV-Library', 'CWJobs', 'Glassdoor', 'jobs.ac.uk',
    'Monster', 'Adzuna', 'ZipRecruiter', 'Find a job (GOV.UK)', 'Hays', 'Welcome to the Jungle', 'Recruiter / agency', 'Company website', 'Other'];

  function everReached(app, list) {
    if (list.includes(app.status)) return true;
    return (app.history || []).some(h => list.includes(h.status));
  }

  // Short permanent job link without ad and tracking parameters
  function cleanUrl(u) {
    try {
      const x = new URL(u);
      const h = x.hostname;
      if (/indeed\./.test(h)) {
        const jk = x.searchParams.get('vjk') || x.searchParams.get('jk');
        if (jk) return `${x.origin}/viewjob?jk=${jk}`;
      }
      if (/linkedin\./.test(h)) {
        const id = x.searchParams.get('currentJobId') || (x.pathname.match(/\/jobs\/view\/(\d+)/) || [])[1];
        if (id) return `https://www.linkedin.com/jobs/view/${id}/`;
      }
      [...x.searchParams.keys()].forEach(k => {
        if (/^(utm_|gad_|gclid|gclsrc|gbraid|wbraid|fbclid|msclkid|aceid|mc_|_hs|trk|trackingId|refId|source$|sourceUrl|ref$|searchId|from$)/i.test(k)) x.searchParams.delete(k);
      });
      x.hash = '';
      return x.toString();
    } catch (e) { return u; }
  }

  // Every change bumps a revision number. The sync compares revisions rather than timestamps,
  // because two writes in the same millisecond share a timestamp and one of them would be lost.
  function touch(app) { app.updatedAt = new Date().toISOString(); app.rev = (app.rev || 0) + 1; return app; }
  const revKey = app => (app.rev ? 'r' + app.rev : 't' + app.updatedAt); // apps saved before 2.0 have no rev
  const isDirty = app => app.syncedKey !== revKey(app) && (app.rev || app.syncedAt !== app.updatedAt);
  function markSynced(app) { app.syncedAt = app.updatedAt; app.syncedKey = revKey(app); }

  root.JT_Store = { touch, revKey, isDirty, markSynced, cleanUrl, get, set, getProfile, saveProfile, getApps, saveApps, addApp, updateApp, deleteApp, findByUrl, normUrl, platformFromUrl, PLATFORMS, everReached };
})(typeof globalThis !== 'undefined' ? globalThis : this);
