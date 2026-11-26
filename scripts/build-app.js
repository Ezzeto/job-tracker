#!/usr/bin/env node
/* Builds the phone app into dist-app/: app/ plus the lib/ files it shares with the extension.
 * Deploy dist-app/ to any static host (Cloudflare Pages: build command `node scripts/build-app.js`,
 * output directory `dist-app`). */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'dist-app');
const LIB = ['quality.js', 'analyzer.js', 'store.js', 'extract.js', 'insights.js', 'market.js', 'i18n.js', 'followup.js', 'templates.js', 'prompt.js', 'fit.js', 'chance.js', 'llm.js', 'learn.js', 'outreach.js', 'tailor.js', 'docx.js', 'cvpdf.js', 'cv.js', 'cvread.mjs'];
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'app'), out, { recursive: true });
fs.mkdirSync(path.join(out, 'lib'), { recursive: true });
LIB.forEach(f => fs.copyFileSync(path.join(root, 'lib', f), path.join(out, 'lib', f)));
// pdf.js, mammoth and jsPDF for reading and writing CVs; loaded only when the CV page needs them
fs.cpSync(path.join(root, 'lib', 'vendor'), path.join(out, 'lib', 'vendor'), { recursive: true });
// A new cache name per build, so phones pick up the new version
const sw = path.join(out, 'sw.js');
fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace("'jt-app-v1'", `'jt-app-${Date.now().toString(36)}'`));
console.log('Built dist-app/ (' + fs.readdirSync(out).length + ' entries)');
