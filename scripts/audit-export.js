// Runs the current analyser over a backup file (Settings → Download backup) and prints, for
// every application, the old score next to the new verdict, so a change to the rules can be
// checked against real ads before it ships. The file is read locally and never committed.
//   node scripts/audit-export.js job-tracker-2026-10-19.json [--json]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
globalThis.chrome = { storage: { local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() } } };
['quality.js', 'analyzer.js', 'store.js', 'recheck.js'].forEach(f => { const p = path.join(__dirname, '..', 'lib', f); if (fs.existsSync(p)) require(p); });
const A = globalThis.JT_Analyzer, R = globalThis.JT_Recheck;

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/audit-export.js <backup.json> [--json]'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const profile = { ...A.DEFAULT_PROFILE, ...data.profile, intern: { ...A.DEFAULT_PROFILE.intern, ...(data.profile || {}).intern } };
const apps = JSON.parse(JSON.stringify(data.apps));
const report = R ? R.recheckAll(apps, profile) : null;

const rows = apps.map(a => {
  const old = (data.apps.find(o => o.id === a.id) || {}).chance;
  const c = a.chance || {};
  const g = c.gates || { blocks: [], asks: [] };
  return {
    ticket: a.ticket, track: a.track || 'job', title: (a.title || '').slice(0, 40), company: (a.company || '').slice(0, 22),
    status: a.status, old: old ? old.score : '', score: c.score, verdict: c.verdict, conf: c.confidence,
    blocks: g.blocks.map(x => x.text), asks: g.asks.map(x => x.text), quality: c.quality && !c.quality.ok ? c.quality.issues.map(i => i.code) : [],
    dupOf: a.dupOf || '',
  };
});
if (process.argv.includes('--json')) { console.log(JSON.stringify({ rows, report }, null, 2)); process.exit(0); }
const pad = (s, n) => String(s == null ? '' : s).slice(0, n).padEnd(n);
rows.forEach(r => console.log(`${pad(r.ticket, 9)} ${pad(r.track, 6)} ${pad(r.title, 40)} ${pad(r.company, 22)} ${pad(r.status, 10)} ${pad(r.old, 3)}→${pad(r.score, 3)} ${pad(r.verdict, 10)} ${pad(r.conf, 6)} ${[...r.quality.map(q => 'Q:' + q), ...r.blocks.map(b => '⛔ ' + b), ...r.asks.map(x => '? ' + x), r.dupOf ? 'dup of ' + r.dupOf : ''].filter(Boolean).join(' | ')}`));
const by = k => rows.reduce((m, r) => (m[r[k]] = (m[r[k]] || 0) + 1, m), {});
console.log('\nVerdicts:', by('verdict'));
console.log('Confidence:', by('conf'));
if (report) console.log('Re-check:', report.summary);
