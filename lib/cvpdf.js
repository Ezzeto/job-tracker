/* Job Tracker — writes a tailored CV as a PDF with real, selectable text (ATS-readable), using jsPDF. */
(function (root) {
  'use strict';
  const MM = 2.8346; // points per mm
  const ACCENT = [31, 78, 121], GREY = [85, 85, 85], BLACK = [20, 20, 20];

  function build(cv) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const L = 16 * MM, R = W - 16 * MM, TOP = 15 * MM, BOTTOM = H - 15 * MM;
    let y = TOP;
    const font = (style, size, color) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...(color || BLACK)); };
    const lh = size => size * 1.25;
    const room = h => { if (y + h > BOTTOM) { doc.addPage(); y = TOP; } };

    // Text with an optional bold 'Label:' at the start, wrapped to the width
    function text(str, { size = 10, style = 'normal', color, x = L, indent = 0, center = false, after = 2, bullet = false, labelBold = false } = {}) {
      font(style, size, color);
      const left = x + indent, width = R - left - 2;
      const lines = doc.splitTextToSize(String(str), width);
      const m = labelBold ? String(str).match(/^([^:]{2,40}:)\s/) : null;
      lines.forEach((ln, i) => {
        room(lh(size));
        y += size;
        if (bullet && i === 0) { font('normal', size, color); doc.text('•', x + 2, y); font(style, size, color); }
        if (center) doc.text(ln, W / 2, y, { align: 'center' });
        else if (m && i === 0 && ln.startsWith(m[1])) {
          font('bold', size, color); doc.text(m[1], left, y);
          const w = doc.getTextWidth(m[1] + ' ');
          font(style, size, color); doc.text(ln.slice(m[1].length).trimStart(), left + w, y);
        } else doc.text(ln, left, y);
        y += lh(size) - size;
      });
      y += after;
    }

    text(cv.name, { size: 18, style: 'bold', color: ACCENT, center: true, after: 2 });
    if (cv.headline) text(cv.headline, { size: 11, style: 'bold', center: true, after: 2 });
    cv.contact.forEach(c => text(c, { size: 8.5, center: true, after: 0 }));
    y += 4;
    cv.sections.forEach(s => {
      room(40);
      y += 8;
      text(s.title.toUpperCase(), { size: 10.5, style: 'bold', color: ACCENT, after: 0 });
      doc.setDrawColor(...ACCENT); doc.setLineWidth(0.6); doc.line(L, y + 1, R, y + 1);
      y += 6;
      s.blocks.forEach(b => {
        if (b.t === 'entry') {
          room(30);
          y += 3;
          text(b.title, { size: 10.5, style: 'bold', after: 0 });
          b.meta.forEach(m => text(m, { size: 9, style: 'italic', color: GREY, after: 1 }));
          b.bullets.forEach(x => text(x, { size: 9.8, bullet: true, indent: 12, after: 1.5 }));
        } else if (b.t === 'bullet') text(b.text, { size: 9.8, bullet: true, indent: 12, after: 1.5, labelBold: true });
        else text(b.text, { size: 9.8, after: 2, labelBold: true });
      });
    });
    doc.setProperties({ title: `${cv.name} CV`, author: cv.name });
    return doc.output('arraybuffer');
  }

  function buildLetter(L, cv) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const LM = 20 * MM, R = W - 20 * MM;
    let y = 20 * MM;
    const line = (str, size, style, color, gap) => {
      doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size); doc.setTextColor(...(color || BLACK));
      doc.splitTextToSize(String(str), R - LM).forEach(ln => { if (y + size > H - 20 * MM) { doc.addPage(); y = 20 * MM; } y += size; doc.text(ln, LM, y); y += size * 0.35; });
      y += gap || 0;
    };
    line(cv.name || L.name, 14, 'bold', ACCENT, 2);
    (cv.contact || []).forEach(c => line(c, 8.5, 'normal', GREY, 0));
    y += 22;
    line(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), 10.5, 'normal', BLACK, 14);
    line(L.greeting, 11, 'normal', BLACK, 9);
    L.paragraphs.forEach(p => line(p, 11, 'normal', BLACK, 9));
    line(L.signoff, 11, 'normal', BLACK, 0);
    line(L.name, 11, 'normal', BLACK, 0);
    doc.setProperties({ title: `${cv.name} cover letter`, author: cv.name });
    return doc.output('arraybuffer');
  }

  root.JT_CvPdf = { build, buildLetter };
})(typeof globalThis !== 'undefined' ? globalThis : this);
