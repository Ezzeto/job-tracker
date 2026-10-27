/* Job Tracker — Tailor CV page: your CV reordered for one job ad, editable, saved as Word or PDF */
(async function () {
  'use strict';
  const S = JT_Store, T = JT_Tailor;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // The job comes from a saved application (?app=id) or from the job page you were on (?src=page)
  const q = new URLSearchParams(location.search);
  let job = null, app = null;
  if (q.get('app')) { app = (await S.getApps()).find(a => a.id === q.get('app')) || null; job = app; }
  else { job = (await S.get('tailorJob')).tailorJob || null; }
  const profile = await S.getProfile();
  const { cvs = {} } = await S.get('cvs');
  const cvRec = cvs[(job && job.track) === 'intern' ? 'intern' : 'job'] || cvs.job;

  function empty(html) { $('#empty').innerHTML = html; $('#empty').hidden = false; }
  if (!job || String(job.description || '').length < 200) {
    empty('<h2>No job ad to tailor to</h2><p class="hint" style="margin:0">Open a job page and press <b>Tailor CV</b> in the Job Tracker panel, or open an application in the dashboard. The job description has to be on the page.</p>');
    return;
  }
  $('#jobLine').textContent = [job.title, job.company, job.location].filter(Boolean).join(' · ');
  document.title = `Tailor CV — ${job.title || 'job'}`;
  if (!cvRec || !cvRec.text) {
    empty(`<h2>Add your CV first</h2><p class="hint">The tailored CV is built from your own CV, so nothing is made up. Upload it once (PDF or Word) on the CV &amp; ATS page, then come back here.</p><a class="btn primary" href="dashboard.html#cv" target="_blank">Open CV &amp; ATS</a>`);
    return;
  }

  const base = T.parse(cvRec.text);
  if (!base.sections.length) { empty('<h2>Could not find the sections of your CV</h2><p class="hint" style="margin:0">Headings such as PROFILE, KEY SKILLS, EXPERIENCE and EDUCATION on their own lines help. Try uploading the Word version of the CV.</p>'); return; }
  $('#work').hidden = false; $('#dlDocx').disabled = false; $('#dlPdf').disabled = false;

  let opts = { headline: null, addTools: null };
  let tab = q.get('tab') === 'letter' ? 'letter' : 'cv', L = null;
  $('#why').value = (app && app.whyThem) || job.whyThem || '';
  function setTab(t) {
    tab = t;
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
    $('#page').hidden = t !== 'cv'; $('#cvSide').hidden = t !== 'cv'; $('#kwSide').hidden = t !== 'cv';
    $('#lpage').hidden = t !== 'letter'; $('#letterSide').hidden = t !== 'letter'; $('#copyTxt').hidden = t !== 'letter';
    document.querySelector('h1').textContent = t === 'cv' ? 'Tailor CV' : 'Cover letter';
    if (t === 'letter') buildLetter();
  }
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));

  // The letter is built from the tailored CV, so its lines come from your own CV
  function buildLetter() {
    L = T.letter(cur, job, profile, { why: $('#why').value, availability: $('#avail').value });
    renderLetter();
  }
  function renderLetter() {
    const lrefs = [];
    const led = (v, set, tag, cls, del) => { lrefs.push(set); return `<${tag} class="${cls || ''}" contenteditable="true" spellcheck="true" data-lref="${lrefs.length - 1}">${esc(v)}</${tag}>`; };
    $('#lpage').innerHTML = `<div class="l-name">${esc(cur.name)}</div>${cur.contact.map(c => `<div class="l-contact">${esc(c)}</div>`).join('')}
      <div class="l-date">${esc(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
      ${led(L.greeting, v => { L.greeting = v; }, 'p')}
      ${L.paragraphs.map((p, i) => `<p><span contenteditable="true" spellcheck="true" data-lref="${lrefs.push(v => { L.paragraphs[i] = v; }) - 1}">${esc(p)}</span><button class="x" title="Remove" data-ldel="${i}">×</button></p>`).join('')}
      ${led(L.signoff, v => { L.signoff = v; }, 'p', '')}${led(L.name, v => { L.name = v; }, 'div')}`;
    $('#lpage').querySelectorAll('[data-lref]').forEach(el => el.addEventListener('input', () => { lrefs[+el.dataset.lref](el.innerText.replace(/\s*\n\s*/g, ' ').trim()); words(); }));
    $('#lpage').querySelectorAll('[data-ldel]').forEach(b => b.onclick = () => { L.paragraphs.splice(+b.dataset.ldel, 1); renderLetter(); });
    words();
  }
  const words = () => {
    const n = L.paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
    $('#lWords').textContent = `${n} words${n > 250 ? ': a bit long, recruiters skim. Remove a paragraph with ×.' : n < 120 ? '' : ''}`;
  };
  let whyTimer = null;
  ['#why', '#avail'].forEach(id => $(id).addEventListener('input', () => { clearTimeout(whyTimer); whyTimer = setTimeout(buildLetter, 400); }));
  $('#why').addEventListener('change', async () => { if (app) await S.updateApp(app.id, { whyThem: $('#why').value.trim() }); });
  $('#copyTxt').onclick = async () => {
    try { await navigator.clipboard.writeText(T.letterText(L)); $('#lmsg').className = 'msg ok'; $('#lmsg').textContent = 'Copied: paste it into the application form.'; await remember('', true); }
    catch (e) { $('#lmsg').className = 'msg err'; $('#lmsg').textContent = 'The browser blocked the clipboard: select the text and copy it by hand.'; }
  };
  let cur = null, report = null;

  function build() {
    const r = T.tailor(base, job, profile, opts);
    cur = r.cv; report = r.report;
    if (opts.headline == null) opts.headline = report.headline;
    if (opts.addTools == null) opts.addTools = report.added.slice();
    renderSide(); renderPage();
  }

  function renderSide() {
    $('#cBefore').textContent = report.coverBefore + '%';
    $('#cAfter').textContent = report.coverAfter + '%';
    $('#moved').textContent = report.moved ? `${report.moved} line${report.moved === 1 ? '' : 's'} moved so the ad's tools come first.` : 'Your CV already lists things in the order this ad cares about.';
    $('#oHeadline').checked = !!opts.headline;
    $('#addBox').innerHTML = report.canAdd.length ? `<p class="hint" style="margin:10px 0 4px">In the ad and marked as known in your skills, but not in the CV:</p>` +
      report.canAdd.map(n => `<label class="check"><input type="checkbox" data-add="${esc(n)}" ${opts.addTools.includes(n) ? 'checked' : ''}> Add ${esc(n)} to the skills</label>`).join('') : '';
    document.querySelectorAll('[data-add]').forEach(c => c.onchange = () => {
      opts.addTools = [...document.querySelectorAll('[data-add]:checked')].map(x => x.dataset.add); build();
    });
    $('#kw').innerHTML = report.keywords.map(k => `<span class="t ${k.inCV ? 's' : k.added ? 'b' : 'm'}" title="weight ${k.weight}">${esc(k.name)}</span>`).join('') || '<span class="hint">No tools named in the ad.</span>';
  }

  // Each editable text points into the CV model, so the files get what you see
  const refs = [];
  const ed = (get, set, tag = 'span', cls = '') => { refs.push(set); return `<${tag} class="${cls}" contenteditable="true" spellcheck="true" data-ref="${refs.length - 1}">${esc(get)}</${tag}>`; };
  function renderPage() {
    refs.length = 0;
    const c = cur, h = [];
    h.push(ed(c.name, v => { c.name = v; }, 'div', 'cv-name'));
    h.push(ed(c.headline, v => { c.headline = v; }, 'div', 'cv-head' + (c.headline !== base.headline ? ' changed' : '')));
    c.contact.forEach((x, i) => h.push(ed(x, v => { c.contact[i] = v; }, 'div', 'cv-contact')));
    c.sections.forEach((s, si) => {
      h.push(ed(s.title, v => { s.title = v; }, 'div', 'cv-sec'));
      let list = [];
      const flush = () => { if (list.length) { h.push(`<ul>${list.join('')}</ul>`); list = []; } };
      s.blocks.forEach((b, bi) => {
        if (b.t === 'bullet') { list.push(`<li class="${b.added ? 'added' : ''}">${ed(b.text, v => { b.text = v; })}<button class="x" title="Remove" data-del="${si}.${bi}">×</button></li>`); return; }
        flush();
        if (b.t === 'entry') {
          h.push(`<div class="cv-entry">${ed(b.title, v => { b.title = v; }, 'div', 'cv-et')}${b.meta.map((m, mi) => ed(m, v => { b.meta[mi] = v; }, 'div', 'cv-meta')).join('')}<ul>${b.bullets.map((x, xi) => `<li>${ed(x, v => { b.bullets[xi] = v; })}<button class="x" title="Remove" data-del="${si}.${bi}.${xi}">×</button></li>`).join('')}</ul></div>`);
        } else h.push(ed(b.text, v => { b.text = v; }, 'p'));
      });
      flush();
    });
    $('#page').innerHTML = h.join('');
    $('#page').querySelectorAll('[data-ref]').forEach(el => {
      el.addEventListener('input', () => refs[+el.dataset.ref](el.innerText.replace(/\s*\n\s*/g, ' ').trim()));
      el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    });
    $('#page').querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const [si, bi, xi] = b.dataset.del.split('.').map(Number);
      const blocks = cur.sections[si].blocks;
      if (xi == null) blocks.splice(bi, 1); else blocks[bi].bullets.splice(xi, 1);
      renderPage();
    });
  }

  $('#oHeadline').onchange = () => { opts.headline = $('#oHeadline').checked; build(); };
  $('#reset').onclick = () => { opts = { headline: null, addTools: null }; build(); };

  function save(bytes, name, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  // Remember that this job got a tailored CV: the application is marked when you apply (or now, if it is saved)
  async function remember(file, cover) {
    const key = job.url ? S.normUrl(job.url) : '';
    const { tailoredCvs = [] } = await S.get('tailoredCvs');
    const old = tailoredCvs.find(t => key && t.urlKey === key) || {};
    const rec = { ...old, urlKey: key, appId: app ? app.id : '', title: job.title || '', company: job.company || '', at: new Date().toISOString() };
    if (cover) { rec.cover = true; if (file) rec.letterFile = file; } else rec.file = file;
    const list = tailoredCvs.filter(t => !(key && t.urlKey === key)).concat([rec]).slice(-100);
    await S.set({ tailoredCvs: list });
    const saved = app || (key ? (await S.getApps()).find(a => a.urlKey === key) : null);
    if (saved) await S.updateApp(saved.id, { apply: { ...(saved.apply || {}), ...(cover ? { cover: 'tailored' } : { cvTailored: true, cv: file }) } });
    if (!file) return;
    const out = cover ? $('#lmsg') : $('#msg');
    out.className = 'msg ok';
    out.textContent = saved ? `Saved ${file}. The application is updated.` : `Saved ${file}. When you press Apply on the job page, the application records it.`;
  }
  const name = () => tab === 'letter' ? T.fileName(cur, job).replace(' CV - ', ' Cover Letter - ') : T.fileName(cur, job);
  $('#dlDocx').onclick = async () => {
    const f = name() + '.docx';
    save(tab === 'letter' ? JT_Docx.buildLetter(L, cur) : JT_Docx.build(cur, { title: f }), f, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    await remember(f, tab === 'letter');
  };
  $('#dlPdf').onclick = async () => {
    try { const f = name() + '.pdf'; save(tab === 'letter' ? JT_CvPdf.buildLetter(L, cur) : JT_CvPdf.build(cur), f, 'application/pdf'); await remember(f, tab === 'letter'); }
    catch (e) { const out = tab === 'letter' ? $('#lmsg') : $('#msg'); out.className = 'msg err'; out.textContent = 'Could not make the PDF: ' + e.message + '. The Word file still works.'; }
  };

  build();
  setTab(tab);
})();
