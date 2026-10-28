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

  // ---------- Cover letter, from the CV's own lines ----------
  // Bullets become sentences only when they start with a verb, so 'I' + bullet reads as written
  const VERB = /^(look|run|create|administer|set|resolve|write|support|practise|practice|configure|secure|install|fix|manage|deliver|handle|train|prioriti[sz]e|build|maintain|monitor|provide|lead|help|use|work|serve|migrate|enrol|deploy|troubleshoot|document|image|replace|repair|log|assist|answer|respond|coordinate|organi[sz]e|plan|update|upgrade|test|automate|design|develop|create|remove|enable|keep|ran|[a-z]+ed)\b/i;
  const asSentence = b => {
    const t = String(b).trim().replace(/\s+/g, ' ');
    if (!VERB.test(t)) return '';
    return 'I ' + t[0].toLowerCase() + t.slice(1).replace(/[;,]?\s*$/, '') + (/[.!?]$/.test(t) ? '' : '.');
  };
  const an = w => /^[aeiou]|^(it|mfa|sla)\b/i.test(w) && !/^(one|use|uni)/i.test(w) ? 'an' : 'a';
  const sinceOf = meta => { const m = (meta || []).join(' ').match(/\b(?:[A-Z][a-z]{2,8}\s+)?(\d{4})\s*[–-]\s*(present|now|current)/i); return m ? m[1] : ''; };
  const orgOf = (meta, title) => {
    const first = (meta || [])[0] || '';
    const org = first.split('|')[0].trim();
    return /self-employed|freelance/i.test(org + ' ' + title) ? '' : org.replace(/,\s*(uk|ukraine)$/i, '');
  };

  /**
   * letter(cv, job, profile, { why, availability })
   *   why          — your own sentence on why this employer (used as written)
   *   availability — optional line, e.g. 'I can start immediately and work all three shifts.'
   * Returns { greeting, paragraphs: [string], signoff, name, used: [bullets used] }
   */
  function letter(cv, job, profile, opts = {}) {
    const kws = keywords(job);
    const title = cleanTitle(job.title) || 'advertised';
    const company = String(job.company || '').trim();
    const entries = [];
    cv.sections.forEach(s => s.blocks.forEach(b => { if (b.t === 'entry') entries.push({ sec: s, e: b }); }));
    const it = entries.filter(x => x.sec.kind === 'experience' && !/customer|retail|hospitality|other/i.test(x.sec.title));
    const proj = entries.filter(x => x.sec.kind === 'projects');
    const people = entries.filter(x => x.sec.kind === 'experience' && /customer|retail|hospitality/i.test(x.sec.title + ' ' + x.e.title));
    const pick = (list, n) => stableSort(list.flatMap(x => x.e.bullets.map(b => ({ x, b, s: scoreOf(b, kws), t: asSentence(b) }))).filter(o => o.t), o => o.s).slice(0, n);
    const used = [];
    const P = [];

    // 1. The role and who you are
    const main = it[0] || entries[0];
    let open = `I'm applying for the ${title} role${company ? ` at ${company}` : ''}.`;
    if (main) {
      const since = sinceOf(main.e.meta), org = orgOf(main.e.meta, main.e.title);
      const role = main.e.title.replace(/\s*\((freelance|contract)\)/i, '');
      const free = /freelance|self-employed/i.test(main.e.title + ' ' + main.e.meta.join(' '));
      const what = (free ? 'freelance ' : '') + role;
      open += since ? ` Since ${since} I have worked as ${an(what)} ${what}${org ? ` at ${org}` : ''}.`
        : ` Most recently I worked as ${an(what)} ${what}${org ? ` at ${org}` : ''}.`;
    }
    P.push(open.replace(/\s+/g, ' '));
    if (opts.why && opts.why.trim()) P.push(opts.why.trim().replace(/([^.!?])$/, '$1.'));

    // 2. What the ad asks for, answered with your own lines
    // 'Documentation / KB' → 'documentation'; brand names keep their capitals
    const say = n => { const w = n.split(' / ')[0]; return /^[A-Z][a-z]+( [a-z]+)*$/.test(w) && !/^(Linux|Python|Bash|Docker|Cisco|Jira|Azure|Intune|Exchange|Outlook|Proxmox|Citrix|Zendesk)$/.test(w) ? w.toLowerCase() : w; };
    const have = kws.filter(k => k.re.test(toText(cv))).slice(0, 4).map(k => say(k.name));
    const best = pick(it, 2), lab = pick(proj, 1);
    const p2 = [];
    if (have.length) p2.push(`Your ad asks for ${have.slice(0, -1).join(', ')}${have.length > 1 ? ' and ' : ''}${have[have.length - 1]}, which is the work I do now.`);
    best.forEach(o => { p2.push(o.t); used.push(o.b); });
    lab.forEach(o => { const name = o.x.e.title.split(':')[0].trim(); p2.push(`In my ${name.toLowerCase().startsWith('home lab') ? 'home lab' : name + ' project'}, ${o.t[0].toLowerCase() === 'i' ? o.t : o.t}`); used.push(o.b); });
    if (p2.length) P.push(p2.join(' '));

    // 3. People skills, when the ad is about users in person
    if (/\b(customer|face[- ]to[- ]face|desk[- ]side|end[- ]users?|in person|on[- ]?site)\b/i.test(job.description || '') && people.length) {
      const o = pick(people, 1)[0];
      if (o) {
        const org = orgOf(o.x.e.meta, o.x.e.title);
        P.push(`As ${an(o.x.e.title)} ${o.x.e.title}${org ? ` at ${org}` : ''}, ${o.t[2].toLowerCase()}${o.t.slice(3)}`.replace(/,\s+I /, ', I ').replace(/^(As .+?), (?!I )/, '$1, I '));
        used.push(o.b);
      }
    }
    if (opts.availability && opts.availability.trim()) P.push(opts.availability.trim().replace(/([^.!?])$/, '$1.'));
    P.push(`I'd welcome the chance to talk about how I could help${company ? ' ' + company : ' your team'}.`);
    return { greeting: 'Dear Hiring Manager,', paragraphs: P, signoff: 'Kind regards,', name: cv.name || (profile && profile.signName) || '', used };
  }
  const letterText = L => [L.greeting, '', ...L.paragraphs.flatMap(p => [p, '']), L.signoff, L.name].join('\n');

  function fileName(cv, job) {
    const safe = s => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    return safe(`${cv.name || 'CV'} CV - ${job.company || cleanTitle(job.title) || 'tailored'}`).slice(0, 90);
  }

  root.JT_Tailor = { parse, tailor, toText, keywords, reorderItems, cleanTitle, fileName, joinLines, letter, letterText, asSentence };
})(typeof globalThis !== 'undefined' ? globalThis : this);
