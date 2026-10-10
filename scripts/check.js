// Static checks run in CI: the manifest points at files that exist, every script parses,
// and no secret token is committed.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const problems = [];
const exists = f => fs.existsSync(path.join(root, f)) || problems.push(`missing file: ${f}`);

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3');
exists(manifest.background.service_worker);
exists(manifest.action.default_popup);
Object.values(manifest.icons).forEach(exists);
manifest.content_scripts.forEach(cs => cs.js.forEach(exists));

// importScripts in the service worker and <script> tags in the pages
const sw = fs.readFileSync(path.join(root, manifest.background.service_worker), 'utf8');
(sw.match(/importScripts\(([^)]*)\)/) || ['', ''])[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean).forEach(exists);
for (const page of ['dashboard.html', 'popup.html']) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  [...html.matchAll(/<script src="([^"]+)"/g)].forEach(m => exists(m[1]));
}

// Every JavaScript file, and the Apps Script, must parse
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
  d.name === 'node_modules' || d.name.startsWith('.') ? [] : d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
const files = walk(root);
for (const f of files.filter(f => /\.(js|gs)$/.test(f))) {
  try { new vm.Script(fs.readFileSync(f, 'utf8'), { filename: f }); } catch (e) { problems.push(`${path.relative(root, f)}: ${e.message}`); }
}

// The Apps Script token must be generated per install, never committed
const gs = fs.readFileSync(path.join(root, 'google-sheets', 'Code.gs'), 'utf8');
if (/const\s+TOKEN\s*=\s*['"]/.test(gs)) problems.push('google-sheets/Code.gs: hard-coded TOKEN found');

if (problems.length) { console.error(problems.map(p => '✗ ' + p).join('\n')); process.exit(1); }
console.log(`✓ manifest and ${files.filter(f => /\.(js|gs)$/.test(f)).length} script files OK`);
