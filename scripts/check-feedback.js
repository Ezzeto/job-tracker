// Re-runs the current rules over the verdicts you marked as wrong (Data → Wrong verdicts) and
// shows which ones are now right. The file holds ad text you saved; keep it out of the repo.
//   node scripts/check-feedback.js job-tracker-wrong-verdicts.json [backup.json for your profile]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
globalThis.chrome = { storage: { local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() } } };
['quality.js', 'analyzer.js'].forEach(f => require(path.join(__dirname, '..', 'lib', f)));
const A = globalThis.JT_Analyzer;
const [file, backup] = process.argv.slice(2);
if (!file) { console.error('Usage: node scripts/check-feedback.js <wrong-verdicts.json> [backup.json]'); process.exit(1); }
const list = JSON.parse(fs.readFileSync(file, 'utf8')).verdictFeedback || [];
const prof = backup ? JSON.parse(fs.readFileSync(backup, 'utf8')).profile : {};
const profile = { ...A.DEFAULT_PROFILE, ...prof, intern: { ...A.DEFAULT_PROFILE.intern, ...(prof || {}).intern } };
const ok = (got, want) => want === 'notjob' ? got === 'skip' : got === want || (want === 'ask' && got === 'skip');
let fixed = 0;
list.forEach(f => {
  const c = A.analyze({ title: f.title, company: f.company, location: f.location, description: f.description, salaryText: f.salaryText }, profile).chance;
  const good = ok(c.verdict, f.expected);
  if (good) fixed++;
  console.log(`${good ? 'OK  ' : 'MISS'} ${String(f.title).slice(0, 40).padEnd(40)} was ${f.verdict}, want ${f.expected}, now ${c.verdict} ${c.score}%${f.note ? ' — ' + f.note : ''}`);
});
console.log(`\n${fixed} of ${list.length} now match what you expected`);
