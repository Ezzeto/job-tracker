/* Job Tracker — reads a CV file (PDF, Word, TXT) in the browser; nothing is uploaded */
import * as pdfjs from './vendor/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/vendor/pdf.worker.min.mjs');

async function readPdf(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true }).promise;
  const pages = [];
  let images = false;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
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

globalThis.JT_ReadCV = async function (file) {
  const name = file.name || '';
  const buf = await file.arrayBuffer();
  if (/\.pdf$/i.test(name) || file.type === 'application/pdf') return { name, ...(await readPdf(buf)) };
  if (/\.docx$/i.test(name)) return { name, ...(await readDocx(buf)) };
  if (/\.doc$/i.test(name)) throw new Error('The old .doc format is not supported: save the CV as .docx or PDF');
  return { name, text: new TextDecoder().decode(buf), kind: 'txt' };
};
globalThis.dispatchEvent(new Event('jt-cvreader-ready'));
