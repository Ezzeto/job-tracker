/* Job Tracker — tailors your CV to one job ad, without AI and without inventing anything.
   parse() turns the CV text (from the CV & ATS tab) into sections, entries and bullets;
   tailor() reorders what is already there so the ad's tools come first, can put the job title
   in the headline, and can add tools you marked as known in Settings. Wording stays yours. */
(function (root) {
  'use strict';
  const A = root.JT_Analyzer;

  // ---------- Parsing ----------
  const BULLET = /^[•●▪◦■*·-]\s*/;
  const isBullet = l => BULLET.test(l) && !/^-\s*\d/.test(l);
  const KINDS = [
    ['summary', /^(professional |personal |career )?(summary|profile|about me|objective|personal statement)$/i],
    ['skills', /skills|competencies|technologies|tech stack|tools|expertise/i],
    ['experience', /experience|employment|work history|career history/i],
    ['projects', /projects?|home lab|portfolio/i],
    ['education', /education|qualifications|certifications?|training|academic/i],
  ];
  function headingKind(line) {
    const t = line.replace(/[:\s]+$/, '').trim();
    if (!t || t.length > 48 || isBullet(t) || /\|/.test(t) || /[.,;]$/.test(t)) return null;
    const letters = t.replace(/[^A-Za-z]/g, '');
    const upper = letters.length >= 4 && t === t.toUpperCase();
    const known = KINDS.find(([, re]) => re.test(t));
    if (upper) return known ? known[0] : 'other';
    // 'Experience', 'Key skills:' in sentence case
    if (known && t.split(/\s+/).length <= 4 && /^[A-Z]/.test(t) && (/:$/.test(line.trim()) || KINDS.some(([, re]) => re.test(t) && t.length < 30))) return known[0];
    return null;
  }

  // Re-join lines a PDF wrapped: 'set up user accounts and' + 'password resets.'
  function joinLines(text) {
    const out = [];
    let lastRaw = '';
    String(text || '').replace(/\r/g, '').split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).forEach(line => {
      const prev = out.length ? out[out.length - 1] : null;
      const cont = prev && !isBullet(line) && !headingKind(line) && !headingKind(prev) && !/\|/.test(line) && (
        /^[a-z(]/.test(line) || /[,;:&/(–-]$/.test(prev) || /^[–-]\s*(\d{4}|present)\b/i.test(line) ||
        // a full-width line with no full stop wraps, unless the next one starts a new title ('Diploma, X – College')
        (lastRaw.length >= 88 && !/[.!?]$/.test(lastRaw) && !/\s[–—]\s/.test(line)));
      if (cont) out[out.length - 1] = prev + ' ' + line; else out.push(line);
      lastRaw = line;
    });
    return out;
  }

  function parse(text) {
    const lines = joinLines(text);
    const cv = { name: '', headline: '', contact: [], sections: [] };
    let sec = null, entry = null;
    lines.forEach((line, i) => {
      const kind = headingKind(line);
      if (kind && (i > 0 || cv.name)) {
        sec = { title: line.replace(/:\s*$/, ''), kind, blocks: [] };
        cv.sections.push(sec); entry = null; return;
      }
      if (!sec) {
        if (!cv.name) cv.name = line;
        else if (!cv.headline && !/@|\+?\d[\d\s]{8,}|linkedin|github|\.(com|dev|uk|io)\b/i.test(line)) cv.headline = line;
        else cv.contact.push(line);
        return;
      }
      const bullet = isBullet(line), txt = line.replace(BULLET, '').trim();
      if (sec.kind === 'summary') {
        const last = sec.blocks[sec.blocks.length - 1];
        if (last && last.t === 'para' && !bullet) last.text += ' ' + txt; else sec.blocks.push({ t: bullet ? 'bullet' : 'para', text: txt });
        return;
      }
      if (sec.kind === 'experience' || sec.kind === 'projects') {
        if (bullet) { if (entry) entry.bullets.push(txt); else sec.blocks.push({ t: 'bullet', text: txt }); return; }
        if (entry && !entry.bullets.length) { entry.meta.push(txt); return; }
        entry = { t: 'entry', title: txt, meta: [], bullets: [] };
        sec.blocks.push(entry);
        return;
      }
      sec.blocks.push({ t: bullet ? 'bullet' : 'line', text: txt });
    });
    return cv;
  }

  // ---------- What the ad cares about ----------
  const EXTRA = [
    { name: 'Password resets', re: /\bpassword resets?\b/i },
    { name: 'New starters / onboarding', re: /\b(new starters?|onboarding|joiners?,? movers?|leavers?)\b/i },
    { name: 'Escalation', re: /\bescalat/i },
    { name: 'Troubleshooting', re: /\btroubleshoot|\bdiagnos/i },
    { name: 'BitLocker / encryption', re: /\bbitlocker|\bencrypt/i },
    { name: 'Asset management', re: /\basset (management|register|tracking)|\binventory\b/i },
  ];
  function keywords(job) {
    const desc = String(job.description || ''), title = String(job.title || '');
    const req = (A.extractSections(desc).requirements || []).join('\n');
    const list = [];
    A.TOOLS.forEach(t => { if (t.re.test(desc) || t.re.test(title)) list.push({ name: t.name, re: t.re, tool: true }); });
    EXTRA.forEach(t => { if (t.re.test(desc) || t.re.test(title)) list.push({ ...t, tool: false }); });
    list.forEach(k => {
      const hits = (desc.match(new RegExp(k.re.source, 'gi')) || []).length;
      k.weight = 1 + Math.min(hits, 3) * 0.5 + (k.re.test(req) ? 2 : 0) + (k.re.test(title) ? 2 : 0);
    });
    return list.sort((x, y) => y.weight - x.weight);
  }
  const scoreOf = (text, kws) => kws.reduce((s, k) => s + (k.re.test(text) ? k.weight : 0), 0);
  const stableSort = (arr, key) => arr.map((v, i) => ({ v, i, k: key(v) })).sort((a, b) => b.k - a.k || a.i - b.i).map(x => x.v);

  // Split 'a, b (c, d); e' at top-level commas or semicolons
  function splitTop(s, sep) {
    const out = []; let depth = 0, cur = '';
    for (const ch of s) {
      if (ch === '(') depth++; else if (ch === ')') depth = Math.max(0, depth - 1);
      if (ch === sep && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  // 'Networking: TCP/IP, DNS, DHCP, Wi-Fi' → the ad's items first
  function reorderItems(text, kws) {
    const m = text.match(/^([^:]{2,40}):\s*(.+)$/);
    const label = m ? m[1] + ': ' : '', body = m ? m[2] : text;
    if (!/,|;/.test(body)) return text;
    const groups = splitTop(body.replace(/\.$/, ''), ';').map(g => stableSort(splitTop(g, ','), it => scoreOf(it, kws)).join(', '));
    const sorted = stableSort(groups, g => scoreOf(g, kws));
    return label + sorted.join('; ') + (/\.$/.test(body) ? '.' : '');
  }

  function cleanTitle(t) {
    return String(t || '').split(/\s+[-–|]\s+|\s*\(|\s*\/\s*(?=hybrid|remote|on-?site)/i)[0].replace(/\s+/g, ' ').trim();
  }
  const IT_TITLE = /\b(support|help ?desk|service ?desk|technician|desktop|it engineer|infrastructure|analyst|administrator|engineer)\b/i;

  // ---------- Plain text (ATS check, keyword coverage) ----------
  function toText(cv) {
    const out = [cv.name, cv.headline, ...cv.contact];
    cv.sections.forEach(s => {
      out.push('', s.title.toUpperCase());
      s.blocks.forEach(b => {
        if (b.t === 'entry') { out.push(b.title, ...b.meta, ...b.bullets.map(x => '• ' + x)); }
        else out.push((b.t === 'bullet' ? '• ' : '') + b.text);
      });
    });
    return out.filter(x => x != null).join('\n');
  }

  /**
   * tailor(cv, job, profile, opts)
   *   opts.headline  — put the job title in the headline (default: when the title is an IT role)
   *   opts.addTools  — names of tools to add to the skills (only ones marked known in Settings are offered)
   * Returns { cv, report }
   */
  function tailor(base, job, profile, opts = {}) {
    const cv = JSON.parse(JSON.stringify(base));
    const kws = keywords(job);
    const before = toText(base);
    let moved = 0;
    const count = (a, b) => a.forEach((x, i) => { if (b[i] !== x) moved++; });

    const title = cleanTitle(job.title);
    const useTitle = opts.headline != null ? opts.headline : IT_TITLE.test(title);
    if (useTitle && title) cv.headline = title;

    cv.sections.forEach(s => {
      if (s.kind === 'summary') {
        s.blocks.forEach(b => {
          if (b.t !== 'para') return;
          const sents = b.text.split(/(?<=[.!?])\s+(?=[A-Z])/);
          if (sents.length < 3) return;
          const first = sents[0], lastIsAvail = /\b(available|availability|right to work|notice)\b/i.test(sents[sents.length - 1]);
          const mid = sents.slice(1, lastIsAvail ? -1 : undefined);
          const sorted = stableSort(mid, x => scoreOf(x, kws));
          count(mid, sorted);
          b.text = [first, ...sorted, ...(lastIsAvail ? [sents[sents.length - 1]] : [])].join(' ');
        });
      } else if (s.kind === 'skills') {
        s.blocks.forEach(b => { if (b.t !== 'entry') b.text = reorderItems(b.text, kws); });
        const sorted = stableSort(s.blocks, b => scoreOf(b.text || '', kws));
        count(s.blocks, sorted); s.blocks = sorted;
      } else if (s.kind === 'experience' || s.kind === 'projects') {
        s.blocks.forEach(b => {
          if (b.t !== 'entry') return;
          const sorted = stableSort(b.bullets, x => scoreOf(x, kws));
          count(b.bullets, sorted); b.bullets = sorted;
        });
      }
    });

    // Tools the ad names that you said you know (Settings → skills) but the CV never mentions
    const skills = (profile && profile.skills) || {};
    const known = kws.filter(k => k.tool && !k.re.test(before) && (skills[k.name] === 'strong' || skills[k.name] === 'basic')).map(k => k.name);
    const add = (opts.addTools || known).filter(n => known.includes(n));
    if (add.length) {
      const sk = cv.sections.find(s => s.kind === 'skills');
      const line = 'Also: ' + add.join(', ');
      if (sk) sk.blocks.push({ t: 'bullet', text: line, added: true });
      else cv.sections.splice(1, 0, { title: 'KEY SKILLS', kind: 'skills', blocks: [{ t: 'bullet', text: line, added: true }] });
    }

    const after = toText(cv);
    const inCV = kws.filter(k => k.re.test(after));
    const report = {
      keywords: kws.map(k => ({ name: k.name, weight: k.weight, inCV: k.re.test(before), added: !k.re.test(before) && k.re.test(after) })),
      coverBefore: kws.length ? Math.round(kws.filter(k => k.re.test(before)).reduce((s, k) => s + k.weight, 0) / kws.reduce((s, k) => s + k.weight, 0) * 100) : 0,
      coverAfter: kws.length ? Math.round(inCV.reduce((s, k) => s + k.weight, 0) / kws.reduce((s, k) => s + k.weight, 0) * 100) : 0,
      canAdd: known, added: add, moved, headline: useTitle,
      gaps: kws.filter(k => !k.re.test(after)).map(k => k.name),
      top: kws.slice(0, 8).map(k => k.name),
    };
    return { cv, report };
  }

  function fileName(cv, job) {
    const safe = s => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    return safe(`${cv.name || 'CV'} CV - ${job.company || cleanTitle(job.title) || 'tailored'}`).slice(0, 90);
  }

  root.JT_Tailor = { parse, tailor, toText, keywords, reorderItems, cleanTitle, fileName, joinLines };
})(typeof globalThis !== 'undefined' ? globalThis : this);
