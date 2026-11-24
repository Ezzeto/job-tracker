#!/usr/bin/env node
/* Runs the schema migration over a real backup and checks nothing is lost.
 * Usage: node scripts/migrate-check.js backup.json
 * Keep backups outside the repository: they hold personal data. */
'use strict';
const fs = require('fs');
const { M } = require('../tests/helpers/env');
const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/migrate-check.js backup.json'); process.exit(2); }
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const out = M.migrateV2(data);
const STAGE = ['applied', 'noresponse', 'withdrawn', 'screening', 'test', 'rejected', 'interview1', 'interview2', 'interview3', 'declined', 'offer', 'accepted'];
const problems = [];
const kept = new Map(out.apps.map(a => [a.id, a]));
const mergedInto = new Map();
out.apps.forEach(a => (a.mergedIds || []).forEach(id => mergedInto.set(id, a)));
for (const a of data.apps) {
  const b = kept.get(a.id) || mergedInto.get(a.id);
  if (!b) { problems.push(`${a.ticket}: lost`); continue; }
  if (STAGE.indexOf(b.status) < STAGE.indexOf(a.status)) problems.push(`${a.ticket}: status went back from ${a.status} to ${b.status}`);
  if ((a.notes || '').trim() && !String(b.notes || '').includes(a.notes.trim())) problems.push(`${a.ticket}: notes lost`);
  if ((a.followUps || []).length > (b.followUps || []).length) problems.push(`${a.ticket}: follow-ups lost`);
  if ((b.description || '').length < (a.description || '').length * 0.5) problems.push(`${a.ticket}: description shrank`);
}
const tickets = new Set();
out.apps.forEach(a => { if (tickets.has(a.ticket)) problems.push(`${a.ticket}: ticket used twice`); tickets.add(a.ticket); });
out.apps.forEach(a => ['appliedAt', 'createdAt'].forEach(k => { if (new Date(a[k]).getUTCFullYear() < 2000) problems.push(`${a.ticket}: ${k} before 2000`); }));
out.apps.forEach(a => (a.history || []).forEach(h => { if (!h.id) problems.push(`${a.ticket}: event without id`); }));
const again = M.migrateV2(out);
if (again.apps.length !== out.apps.length) problems.push('a second run changed the number of records');
console.log(out.report.summary);
out.report.merged.forEach(m => console.log(`  merged ${m.ticket} into ${m.into}`));
if (out.report.profile.length) console.log('  profile fixed: ' + out.report.profile.join(', '));
console.log(problems.length ? `${problems.length} problem(s):\n  ` + problems.join('\n  ') : 'OK: nothing lost, no status went back, tickets unique, dates real, every event has an id');
process.exit(problems.length ? 1 : 0);
