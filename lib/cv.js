/* Job Tracker — CV parsing: skill levels and a built-in ATS check (all local) */
(function (root) {
  'use strict';
  const A = root.JT_Analyzer;

  // ---------- CV sections ----------
  const HEADS = [
    ['skills', /^(core |key |technical |it |relevant )?(technical )?skills( & (competencies|tools))?|^technologies|^tech stack|^competencies|^tools( & technologies)?|^expertise/i],
    ['weak', /^(working knowledge|knowledgeable|familiar with|familiarity|basic( knowledge)?|exposure|learning|currently learning|other skills)/i],
    ['experience', /^(professional |work |it( & technical)? |relevant |employment |uk |customer service )?(experience|employment|history)|^work history|^career history/i],
    ['projects', /^((selected |personal |technical |key |academic )*projects|home lab|portfolio)/i],
    ['education', /^(education|qualifications|academic)/i],
    ['certs', /^(certifications?|certificates|courses|training|licen[cs]es)/i],
    ['summary', /^(professional |personal )?(summary|profile|about me|objective|personal statement)/i],
    ['other', /^(languages|interests|hobbies|additional information|references|right to work|availability|volunteering|achievements|awards)/i],
  ];
  const WEAK_LINE = /\b(basic|basics|familiar|familiarity|working knowledge|knowledgeable|exposure|learning|in progress|beginner|introductory|some experience|foundational|understanding of|awareness)\b/i;

  function headingOf(line) {
    // "Languages: Python, SQL" is a skill line, not a heading
    if (/:\s*\S/.test(line.replace(/^[#*•\s]+/, ''))) return null;
    const t = line.replace(/[:•*\-–—#|]+$/, '').replace(/^[#*•\s]+/, '').trim();
    if (!t || t.length > 48) return null;
    const words = t.split(/\s+/).length;
    const upper = t === t.toUpperCase() && /[A-Z]/.test(t);
    const hit = HEADS.find(([, re]) => re.test(t));
    if (hit && (upper || words <= 5 || /:$/.test(line.trim()))) return hit[0];
    return null;
  }

  const BULLET = /^[•●▪◦*\-–]\s+/;
  // Re-join wrapped lines: PDFs split one long bullet across several lines
  function joinWrapped(text) {
    const out = [];
    String(text || '').replace(/\r/g, '').split('\n').map(x => x.replace(/\s+/g, ' ').trim()).forEach(line => {
      if (!line) { out.push(''); return; }
      const prev = out.length ? out[out.length - 1] : '';
      const cont = prev && !BULLET.test(line) && !headingOf(line) && !/\|/.test(line)
        && (/[,&/(-]$/.test(prev) || /^[a-z(]/.test(line) || (BULLET.test(prev) && !/[.!?:]$/.test(prev) && line.length < 120 && !/\b20\d\d\b/.test(line)));
      if (cont) out[out.length - 1] = prev + ' ' + line; else out.push(line);
    });
    return out.filter(Boolean);
  }

  function sections(text) {
    const out = [];
    let cur = 'header', weakSub = false;
    joinWrapped(text).forEach(line => {
      const h = headingOf(line);
      if (h === 'weak') { cur = 'skills'; weakSub = true; return; }
      if (h) { cur = h; weakSub = false; if (h === 'skills' && /core|key/i.test(line)) weakSub = false; return; }
      // 'Core skills' / 'Working knowledge' as a sub-heading inside the skills block
      if (cur === 'skills' && /^(core|main|primary) (skills|technical skills)\s*:?$/i.test(line)) { weakSub = false; return; }
      out.push({ sec: cur, line, weak: weakSub });
    });
    return out;
  }

  /** Skill levels from CV text. Returns { skills, evidence } */
  function skillsFromCV(text) {
    const lines = sections(text);
    const skills = {}, evidence = {};
    const rank = { none: 0, basic: 1, strong: 2 };
    const set = (name, lvl, why) => {
      if (rank[lvl] > rank[skills[name] || 'none']) { skills[name] = lvl; evidence[name] = why; }
      else if (!evidence[name]) evidence[name] = why;
    };
    for (const tool of A.TOOLS) {
      for (const l of lines) {
        if (!tool.re.test(l.line)) continue;
        // A label on the skills line ('Working knowledge: AD, SQL') or a note in brackets next to the skill
        const near = (() => { const m = l.line.match(tool.re); if (!m) return ''; const i = l.line.search(tool.re); return l.line.slice(Math.max(0, i - 40), i + m[0].length + 40); })();
        const label = (l.line.split(':')[0] || '');
        const weak = l.weak || (l.line.includes(':') && WEAK_LINE.test(label)) || /\((basic|basics|learning|beginner|familiar|in progress)[^)]*\)|\b(in progress|working towards|currently studying|expected (completion|20\d\d))\b/i.test(near);
        if (l.sec === 'skills') set(tool.name, weak ? 'basic' : 'strong', weak ? 'skills: working knowledge' : 'core skills');
        else if (l.sec === 'experience') set(tool.name, weak ? 'basic' : 'strong', 'work experience');
        else if (l.sec === 'certs') set(tool.name, /in progress|expected|studying|working towards/i.test(l.line) ? 'basic' : 'strong', 'certifications');
        else if (l.sec === 'projects') set(tool.name, 'basic', 'projects');
        else set(tool.name, 'basic', l.sec === 'summary' ? 'summary' : l.sec === 'education' ? 'education' : 'mentioned');
      }
    }
    return { skills, evidence };
  }

  // ---------- ATS check of the CV itself ----------
  const ACTION = /^(built|developed|designed|implemented|created|led|delivered|resolved|diagnosed|configured|deployed|automated|improved|reduced|increased|managed|maintained|trained|wrote|set up|installed|migrated|analy[sz]ed|optimi[sz]ed|launched|supported|troubleshot|fixed|ran|traced|integrated|tested|researched|engineered|provide|resolve|diagnose|configure|build|develop|write|set|run|look|train|prioriti[sz]e|keep|kept|look)/i;
  const WEAK_VERB = /^(assisted|helped|responsible for|duties included|worked on|involved in|participated in)\b/i;

  function atsReport(text, meta = {}) {
    const t = String(text || '');
    const lines = joinWrapped(t);
    const words = (t.match(/\b[\w'’-]+\b/g) || []).length;
    const secs = new Set(sections(t).map(l => l.sec));
    const hasBullets = lines.filter(l => BULLET.test(l)).length >= 4;
    const bullets = lines.filter(l => hasBullets ? BULLET.test(l) && !/:/.test(l.slice(0, 40)) : (l.length > 40 && l.length < 300 && /\.$/.test(l)));
    const bulletText = bullets.map(b => b.replace(BULLET, ''));
    const strongStart = bulletText.filter(b => ACTION.test(b)).length;
    const weakStart = bulletText.filter(b => WEAK_VERB.test(b)).length;
    const numbers = bulletText.filter(b => /\b\d{1,3}(\+|%|k)?\b/.test(b.replace(/\b(19|20)\d\d\b/g, ''))).length;
    const checks = [];
    const c = (state, label, text2) => checks.push({ state, label, text: text2 });

    if (!t.trim() || words < 80) c('fail', 'Text can be read', meta.kind === 'pdf' ? 'Almost no text came out of the PDF, so it may be a scan. An ATS cannot read it: export the CV from Word as PDF or send the .docx' : 'Too little text');
    else c('ok', 'Text can be read', `${words} words extracted${meta.kind ? ' from ' + meta.kind.toUpperCase() : ''}`);

    const email = /[\w.+-]+@[\w-]+\.[\w.]+/.test(t), phone = /(\+44|\b0)\s?\d[\d\s]{8,12}/.test(t), li = /linkedin\.com\/in\//i.test(t), gh = /github\.com\//i.test(t);
    c(email && phone ? 'ok' : 'fail', 'Contact details', [email ? 'email ✓' : 'no email', phone ? 'phone ✓' : 'no phone', li ? 'LinkedIn ✓' : 'no LinkedIn', gh ? 'GitHub ✓' : null].filter(Boolean).join(' · '));
    if (/your\.email|7XXX|yourprofile|\{\{|\[cite:|google\.com\/search\?q=/i.test(t)) c('fail', 'Leftovers in the text', 'Placeholders, [cite] tags or Google redirect links found: remove them before sending');

    const need = [['summary', 'Summary'], ['skills', 'Skills'], ['experience', 'Experience'], ['education', 'Education']];
    const miss = need.filter(([k]) => !secs.has(k)).map(([, l]) => l);
    c(miss.length ? (miss.length > 1 ? 'fail' : 'warn') : 'ok', 'Standard sections', miss.length ? 'Not found: ' + miss.join(', ') + '. An ATS looks for familiar headings' : 'Summary, Skills, Experience and Education are there');

    c(words >= 300 && words <= 900 ? 'ok' : 'warn', 'Length', words < 300 ? 'Short: under 300 words' : words > 900 ? 'Long: over 900 words, 1–2 pages is better at entry level' : `${words} words, right for 1–2 pages`);
    if (meta.pages) c(meta.pages <= 2 ? 'ok' : 'warn', 'Pages', `${meta.pages} page${meta.pages > 1 ? 's' : ''}${meta.pages > 2 ? ', cut to 2' : ''}`);
    if (bulletText.length >= 4) {
      const pct = Math.round(100 * strongStart / bulletText.length);
      c(pct >= 60 ? 'ok' : 'warn', 'Action verbs', `${pct}% of bullets start with an action${weakStart ? `; weak openings ('assisted', 'helped', 'responsible for'): ${weakStart}` : ''}`);
      c(numbers >= 2 ? 'ok' : 'warn', 'Numbers and results', numbers >= 2 ? `${numbers} bullets with numbers` : 'Hardly any numbers: add honest figures (users, clients, machines, time saved)');
    }
    if (meta.tables) c('warn', 'Tables', 'The document has tables, which some older ATS mangle');
    if (meta.images) c('warn', 'Images', 'The document has images: an ATS cannot read text inside them');
    if (/[\u{1F300}-\u{1FAFF}]/u.test(t)) c('warn', 'Emoji', 'Emoji can break parsing: better removed');
    const dates = (t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+20\d\d\b/gi) || []).length;
    c(dates >= 2 ? 'ok' : 'warn', 'Dates in experience', dates >= 2 ? "Dates like 'Sep 2022', which an ATS understands" : "Few dates in 'Month Year' form");

    const weight = { ok: 1, warn: 0.5, fail: 0 };
    const score = Math.round(100 * checks.reduce((s, x) => s + weight[x.state], 0) / checks.length);
    return { score, checks, words };
  }

  // ---------- How well the CV matches one job, the way an ATS compares them ----------
  const STOP = new Set('and the for with you our are your will have this that from not but can all any who what job role team work working within across including'.split(' '));
  function jobMatch(cvText, job, skills) {
    const cv = String(cvText || '');
    if (!cv.trim()) return null;
    const jt = (job.title || '') + '\n' + (job.description || '');
    const tools = A.extractTools(jt);
    const inCV = tools.filter(n => A.TOOLS.find(x => x.name === n).re.test(cv));
    const notInCV = tools.filter(n => !inCV.includes(n));
    const addable = notInCV.filter(n => skills && skills[n] && skills[n] !== 'none');
    const missing = notInCV.filter(n => !addable.includes(n));
    // Words from the job title (an ATS often compares titles)
    const titleWords = String(job.title || '').toLowerCase().replace(/[^a-z0-9+#\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w) && !/^(intern|internship|placement|junior|senior|graduate|london|remote|hybrid|ltd|uk)$/.test(w));
    const titleHit = titleWords.filter(w => cv.toLowerCase().includes(w));
    const toolPart = tools.length ? inCV.length / tools.length : 0.5;
    const titlePart = titleWords.length ? titleHit.length / titleWords.length : 1;
    const score = Math.round(100 * (0.8 * toolPart + 0.2 * titlePart));
    return { score, inCV, addable, missing, titleWords, titleHit };
  }

  root.JT_CV = { sections, skillsFromCV, atsReport, jobMatch };
})(typeof globalThis !== 'undefined' ? globalThis : this);
