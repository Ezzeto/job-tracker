/* Job Tracker — writes a tailored CV as a Word (.docx) file in the browser.
   A .docx is a zip of XML files; this builds one with plain paragraphs (no tables or text boxes,
   which applicant tracking systems read badly). */
(function (root) {
  'use strict';

  // ---------- Zip (stored, no compression) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    const u16 = (v, a, o) => { a[o] = v & 0xFF; a[o + 1] = (v >>> 8) & 0xFF; };
    const u32 = (v, a, o) => { a[o] = v & 0xFF; a[o + 1] = (v >>> 8) & 0xFF; a[o + 2] = (v >>> 16) & 0xFF; a[o + 3] = (v >>> 24) & 0xFF; };
    files.forEach(f => {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const h = new Uint8Array(30 + name.length);
      u32(0x04034b50, h, 0); u16(20, h, 4); u16(0x0800, h, 6); u16(0, h, 8); u16(0, h, 10); u16(0x21, h, 12);
      u32(crc, h, 14); u32(data.length, h, 18); u32(data.length, h, 22); u16(name.length, h, 26); u16(0, h, 28); h.set(name, 30);
      const c = new Uint8Array(46 + name.length);
      u32(0x02014b50, c, 0); u16(20, c, 4); u16(20, c, 6); u16(0x0800, c, 8); u16(0, c, 10); u16(0, c, 12); u16(0x21, c, 14);
      u32(crc, c, 16); u32(data.length, c, 20); u32(data.length, c, 24); u16(name.length, c, 28); u16(0, c, 30); u16(0, c, 32);
      u16(0, c, 34); u16(0, c, 36); u32(0, c, 38); u32(offset, c, 42); c.set(name, 46);
      parts.push(h, data); central.push(c); offset += h.length + data.length;
    });
    const cSize = central.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22);
    u32(0x06054b50, end, 0); u16(files.length, end, 8); u16(files.length, end, 10); u32(cSize, end, 12); u32(offset, end, 16);
    const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let o = 0; all.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }

  // ---------- Word XML ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const ACCENT = '1F4E79';
  // run: { text, b, i, size (half-points), color }
  const run = r => `<w:r><w:rPr>${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}${r.color ? `<w:color w:val="${r.color}"/>` : ''}${r.size ? `<w:sz w:val="${r.size}"/><w:szCs w:val="${r.size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;
  function para(runs, o = {}) {
    const ppr = [
      o.center ? '<w:jc w:val="center"/>' : '',
      `<w:spacing w:before="${o.before || 0}" w:after="${o.after == null ? 40 : o.after}" w:line="${o.line || 252}" w:lineRule="auto"/>`,
      o.bullet ? '<w:ind w:left="284" w:hanging="227"/>' : '',
      o.border ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${ACCENT}"/></w:pBdr>` : '',
      o.keep ? '<w:keepNext/>' : '',
    ].join('');
    return `<w:p><w:pPr>${ppr}</w:pPr>${[].concat(runs).map(run).join('')}</w:p>`;
  }
  // 'Service desk: ticketing…' → the label in bold
  function labelled(text, size) {
    const m = String(text).match(/^([^:]{2,40}:)(\s.*)$/);
    return m ? [{ text: m[1], b: true, size }, { text: m[2], size }] : [{ text, size }];
  }

  const wrapBody = body => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  // Cover letter: your name and contact lines, the date, then plain paragraphs
  function letterXml(L, cv) {
    const body = [];
    body.push(para({ text: cv.name || L.name, b: true, size: 28, color: ACCENT }, { after: 20 }));
    (cv.contact || []).forEach(c => body.push(para({ text: c, size: 18 }, { after: 0 })));
    body.push(para({ text: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), size: 21 }, { before: 360, after: 240 }));
    body.push(para({ text: L.greeting, size: 22 }, { after: 200 }));
    L.paragraphs.forEach(p => body.push(para({ text: p, size: 22 }, { after: 200, line: 276 })));
    body.push(para({ text: L.signoff, size: 22 }, { after: 0 }));
    body.push(para({ text: L.name, size: 22 }, { after: 0 }));
    return wrapBody(body);
  }

  function documentXml(cv) {
    const body = [];
    body.push(para({ text: cv.name, b: true, size: 36, color: ACCENT }, { center: true, after: 20 }));
    if (cv.headline) body.push(para({ text: cv.headline, b: true, size: 22 }, { center: true, after: 40 }));
    cv.contact.forEach(c => body.push(para({ text: c, size: 18 }, { center: true, after: 0 })));
    cv.sections.forEach(s => {
      body.push(para({ text: s.title.toUpperCase(), b: true, size: 21, color: ACCENT }, { before: 200, after: 80, border: true, keep: true }));
      s.blocks.forEach(b => {
        if (b.t === 'entry') {
          body.push(para({ text: b.title, b: true, size: 21 }, { before: 80, after: 0, keep: true }));
          b.meta.forEach(m => body.push(para({ text: m, i: true, size: 19, color: '555555' }, { after: 30, keep: true })));
          b.bullets.forEach(x => body.push(para([{ text: '•\t', size: 20 }, { text: x, size: 20 }], { bullet: true, after: 20 })));
        } else if (b.t === 'bullet') body.push(para([{ text: '•\t', size: 20 }, ...labelled(b.text, 20)], { bullet: true, after: 20 }));
        else body.push(para(labelled(b.text, 20), { after: 40 }));
      });
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="907" w:bottom="850" w:left="907" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  }

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="40"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

  function build(cv, meta = {}) { return pack(documentXml(cv), cv, meta); }
  function buildLetter(L, cv, meta = {}) { return pack(letterXml(L, cv), cv, { title: meta.title || `${cv.name} cover letter` }); }
  function pack(docXml, cv, meta) {
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return zip([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
      { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'word/document.xml', data: docXml },
      { name: 'word/styles.xml', data: STYLES },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(meta.title || (cv.name + ' CV'))}</dc:title><dc:creator>${esc(cv.name)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>` },
    ]);
  }

  root.JT_Docx = { build, buildLetter, zip, crc32 };
})(typeof globalThis !== 'undefined' ? globalThis : this);
