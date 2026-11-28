/* Job Tracker — reads a CV file (PDF, Word, TXT) in the browser; nothing is uploaded */
import * as pdfjs from './vendor/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = globalThis.chrome && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('lib/vendor/pdf.worker.min.mjs') : new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;

// Columns on a page (role profiles, job descriptions in a table): vertical gaps that no text crosses.
// Returns the x ranges of the columns, or one range when the page is a single column.
function columnsOf(items, width) {
  const bins = new Uint16Array(Math.ceil(width / 2) + 2);
  items.forEach(it => { const a = Math.max(0, Math.floor(it.x / 2)), b = Math.min(bins.length - 1, Math.ceil((it.x + it.w) / 2)); for (let i = a; i <= b; i++) bins[i]++; });
  const minX = Math.min(...items.map(i => i.x)), maxX = Math.max(...items.map(i => i.x + i.w));
  // A gap may be crossed by a few headings that span columns: allow up to 3% of the rows
  const allow = Math.max(1, Math.round(new Set(items.map(i => i.y)).size * 0.03));
  const cuts = [];
  let run = 0;
  for (let i = Math.floor(minX / 2); i <= Math.ceil(maxX / 2); i++) {
    if (bins[i] <= allow) run++; else { if (run >= 2) cuts.push((i - run / 2) * 2); run = 0; }
  }
  const edges = [minX - 1].concat(cuts, [maxX + 1]);
  const cols = [];
  for (let i = 0; i < edges.length - 1; i++) cols.push([edges[i], edges[i + 1]]);
  // A column needs real text in it: narrow strips of numbers or bullets join the column to their right
  return cols.filter(c => items.filter(it => it.x >= c[0] && it.x < c[1]).reduce((t, it) => t + it.s.length, 0) > 40);
}
function rowsToText(items) {
  const rows = [];
  for (const it of items) {
    let row = rows.find(r => Math.abs(r.y - it.y) <= 2);
    if (!row) { row = { y: it.y, parts: [] }; rows.push(row); }
    row.parts.push(it);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => {
    r.parts.sort((a, b) => a.x - b.x);
    let out = '', end = null;
    for (const pt of r.parts) {
      if (end !== null && pt.x - end > 2 && !out.endsWith(' ') && !pt.s.startsWith(' ')) out += pt.x - end > 40 ? '   ' : ' ';
      out += pt.s; end = pt.x + pt.w;
    }
    return out.replace(/\s+$/, '');
  }).join('\n');
}

async function readPdf(buf, opts = {}) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true }).promise;
  const pages = [];
  let images = false;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    if (opts.columns) {
      // Job descriptions: read each column top to bottom, left to right, so lists stay whole
      const items = tc.items.filter(it => 'str' in it && it.str.trim()).map(it => ({ x: it.transform[4], y: Math.round(it.transform[5]), w: it.width || 0, s: it.str }));
      if (items.length) {
        const vp = page.getViewport({ scale: 1 });
        // A heading row that spans the page (title, level, business) is read first, as rows
        const cols = columnsOf(items, vp.width);
        if (cols.length > 1) {
          const inCol = it => cols.findIndex(c => it.x + Math.min(it.w, 8) / 2 >= c[0] && it.x < c[1]);
          const parts = cols.map((c, k) => rowsToText(items.filter(it => Math.max(0, inCol(it)) === k)));
          pages.push(parts.join('\n\n'));
        } else pages.push(rowsToText(items));
      }
      continue;
    }
    // Group text into lines by Y position, then left to right within a line
    const rows = [];
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const y = Math.round(it.transform[5]), x = it.transform[4];
      let row = rows.find(r => Math.abs(r.y - y) <= 2);
      if (!row) { row = { y, parts: [] }; rows.push(row); }
      row.parts.push({ x, s: it.str, w: it.width || 0 });
    }
    rows.sort((a, b) => b.y - a.y);
    const lines = rows.map(r => {
      r.parts.sort((a, b) => a.x - b.x);
      let out = '', end = null;
      for (const pt of r.parts) {
        if (end !== null && pt.x - end > 2 && !out.endsWith(' ') && !pt.s.startsWith(' ')) out += pt.x - end > 40 ? '   ' : ' ';
        out += pt.s; end = pt.x + pt.w;
      }
      return out.replace(/\s+$/, '');
    });
    pages.push(lines.join('\n'));
    try {
      const ops = await page.getOperatorList();
      if (ops.fnArray.some(f => f === pdfjs.OPS.paintImageXObject || f === pdfjs.OPS.paintInlineImageXObject)) images = true;
    } catch (e) { /* not important */ }
  }
  return { text: pages.join('\n'), kind: 'pdf', pages: doc.numPages, images };
}

async function readDocx(buf) {
  const res = await globalThis.mammoth.convertToHtml({ arrayBuffer: buf });
  const html = res.value || '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = globalThis.JT_Extract.blockText(doc.body);
  const words = (text.match(/\b\w+\b/g) || []).length;
  return { text, kind: 'docx', pages: Math.max(1, Math.round(words / 450)), tables: /<table/i.test(html), images: /<img/i.test(html) };
}

/** Reads a CV or a job description. opts.columns: read a PDF column by column (role profiles in a table). */
globalThis.JT_ReadCV = async function (file, opts) {
  const name = file.name || '';
  const buf = await file.arrayBuffer();
  if (/\.pdf$/i.test(name) || file.type === 'application/pdf') return { name, ...(await readPdf(buf, opts || {})) };
  if (/\.docx$/i.test(name)) return { name, ...(await readDocx(buf)) };
  if (/\.doc$/i.test(name)) throw new Error('The old .doc format is not supported: save the CV as .docx or PDF');
  return { name, text: new TextDecoder().decode(buf), kind: 'txt' };
};
globalThis.dispatchEvent(new Event('jt-cvreader-ready'));
