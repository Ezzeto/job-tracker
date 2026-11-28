/* Job Tracker — precise Fit (spec §2): "do my skills meet the requirements?"
 * Requirements come either from AI extraction (lib/llm.js, validated here against the ad text) or,
 * without a key, from the ad's own sections. The percentage is always computed by this code:
 *   evidence per requirement: real work 1.0 · home lab / study 0.6 · similar tool 0.4 · none 0
 *   Fit = 100 × (0.75 × mean(essential) + 0.25 × mean(desirable)) − level penalty
 * Hard filters (office days, licence, clearance, years) are shown separately, never mixed into the number.
 * Pure functions: the extension, the web app and the tests use the same code. */
(function (root) {
  'use strict';
  const A = root.JT_Analyzer || (typeof require === 'function' ? require('./analyzer.js') : null);
  const W = { work: 1, lab: 0.6, similar: 0.4, none: 0 };
  const LABEL = { work: 'работа', lab: 'лаборатория / учёба', similar: 'похожий инструмент', none: 'нет', check: 'проверь' };

  /** Where a skill comes from: profile.evidence[skill] ('work' | 'lab'), else Confident → work, Basic → lab. */
  function ownLevel(skill, profile) {
    const ev = ((profile && profile.evidence) || {})[skill];
    const lv = ((profile && profile.skills) || {})[skill];
    if (!lv || lv === 'none') return null;
    if (ev === 'work' || ev === 'lab') return ev;
    return lv === 'strong' ? 'work' : 'lab';
  }
  /** { level, w, via? } for one tool from the dictionary. */
  function evidenceOf(skill, profile) {
    const own = ownLevel(skill, profile);
    if (own) return { level: own, w: W[own] };
    const implied = ((A && A.IMPLIED) || {})[skill] || [];
    const parent = implied.map(p => ownLevel(p, profile)).find(Boolean);
    if (parent) return { level: parent, w: W[parent], via: implied[0] };
    const group = ((A && A.SIMILAR) || []).filter(g => g.includes(skill)).flat().filter(x => x !== skill);
    const sim = group.find(x => ownLevel(x, profile));
    if (sim) return { level: 'similar', w: W.similar, via: sim };
    return { level: 'none', w: 0 };
  }

  // Requirements about people, answered by four years of front of house work (or by what the profile says)
  const SOFT = /customer (service|focus|facing)|communicat|interpersonal|team ?(player|work)|work(ing)? (well )?(under|with) pressure|prioriti[sz]|people skills|friendly|patien(t|ce)|empath|calm|organi[sz]ed|attention to detail|problem[- ]solv|self[- ]motivat|willing(ness)? to learn|enthusias|positive attitude|reliab|punctual/i;
  const YEARS = /(\d{1,2})\s*\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs)/i;
  const QUAL = /\b(degree|bachelor|bsc|ba\b|hnd|hnc|a[- ]levels?|gcse|certif\w*|comptia|itil|ccna|mcsa|md-?102|ms-?900|az-?900|qualification)\b/i;
  const LICENCE = /driving licen[cs]e|own (car|transport|vehicle)/i;
  const CLEAR = /\b(sc|dv|bpss|nppv)\b.{0,20}(clearance|cleared)|security clearance|dbs check|enhanced dbs/i;

  /** What kind of requirement a line is, and which dictionary tools it names. */
  function classify(text) {
    const t = String(text || '');
    let skills = A ? A.extractTools(t) : [];
    // 'Customer service' is in the tools dictionary, but as a requirement it is about people
    if (SOFT.test(t)) skills = skills.filter(x => x !== 'Customer service');
    if (LICENCE.test(t)) return { kind: 'licence', skills };
    if (CLEAR.test(t)) return { kind: 'clearance', skills };
    const y = t.match(YEARS);
    if (y && /experience|support|role|industry|commercial|working/i.test(t)) return { kind: 'years', years: +y[1], skills };
    if (skills.length) return { kind: 'tool', skills };
    if (QUAL.test(t)) return { kind: 'qualification', skills };
    if (SOFT.test(t)) return { kind: 'soft', skills };
    return { kind: 'other', skills };
  }

  /** Scores one requirement: { text, kind, w, level, note, check } */
  function scoreReq(req, profile) {
    const text = typeof req === 'string' ? req : req.text;
    const c = classify(text);
    const p = profile || {};
    const out = { text, kind: c.kind, skills: c.skills, w: 0, level: 'none', note: '', check: false };
    if (c.kind === 'tool') {
      // "Intune or SCCM": the best one counts. "M365 and AD": the average of all named
      const evs = c.skills.map(s => ({ s, ...evidenceOf(s, p) }));
      const anyOf = /\bor\b|\/|either|such as|e\.g\.|for example|including/i.test(text) || evs.length === 1;
      const pick = anyOf ? evs.reduce((m, e) => (e.w > m.w ? e : m), evs[0]) : null;
      out.w = anyOf ? pick.w : evs.reduce((t, e) => t + e.w, 0) / evs.length;
      const best = pick || evs.reduce((m, e) => (e.w > m.w ? e : m), evs[0]);
      out.level = out.w >= 1 ? 'work' : out.w >= 0.6 ? 'lab' : out.w > 0 ? 'similar' : 'none';
      const missing = evs.filter(e => !e.w).map(e => e.s);
      out.note = best.via ? `есть ${best.via}` : !anyOf && missing.length && missing.length < evs.length ? `нет: ${missing.join(', ')}` : '';
    } else if (c.kind === 'soft') {
      out.w = 1; out.level = 'work'; out.note = 'клиентский опыт (front of house)';
    } else if (c.kind === 'years') {
      const have = p.commercialYears != null ? Number(p.commercialYears) : Number(p.experienceYears || 0);
      out.w = have >= c.years ? 1 : have >= c.years - 1 ? 0.4 : 0;
      out.level = out.w >= 1 ? 'work' : out.w ? 'similar' : 'none';
      out.note = `просят ${c.years}+, у тебя ${have}`;
    } else if (c.kind === 'qualification') {
      const t = text.toLowerCase();
      if (/degree|bachelor|bsc|\bba\b/.test(t)) { out.w = 0.6; out.level = 'lab'; out.note = 'учишься на BSc'; out.check = /required|essential|must/.test(t); }
      else if (/comptia|a\+/.test(t)) { out.w = 0.4; out.level = 'similar'; out.note = 'A+ в процессе'; }
      else if (/gcse|a[- ]level/.test(t)) { out.w = 1; out.level = 'work'; out.check = true; out.note = 'проверь, что подходит'; }
      else { out.w = 0; out.level = 'none'; out.check = true; }
    } else if (c.kind === 'licence') {
      out.w = p.hasDrivingLicence ? 1 : 0; out.level = p.hasDrivingLicence ? 'work' : 'none'; out.note = p.hasDrivingLicence ? '' : 'прав нет';
    } else if (c.kind === 'clearance') {
      out.w = 0.5; out.level = 'similar'; out.check = true; out.note = 'обычно оформляют после оффера';
    } else {
      out.w = 0.5; out.level = 'check'; out.check = true;
    }
    return out;
  }

  /** Penalty for the role level (spec §2 step 4): 0 junior / I / graduate, 10 2nd line / engineer, 30 senior / lead. */
  function levelPenalty(title) {
    const t = String(title || '').toLowerCase();
    if (/\b(senior|lead|principal|head of|manager|architect|3rd line|third line)\b/.test(t)) return { p: 30, label: 'senior / lead' };
    if (/\b(junior|graduate|trainee|apprentice|entry|1st line|first line|level 1|assistant|intern)\b|\b(specialist|analyst|engineer|technician) i\b/.test(t)) return { p: 0, label: 'junior' };
    if (/\b(2nd line|second line|engineer|administrator|admin)\b/.test(t)) return { p: 10, label: '2nd line / engineer' };
    return { p: 0, label: '' };
  }

  /**
   * reqs: { essential: [text], desirable: [text], source: 'ai' | 'ad' | 'tools' }
   * Returns { score|null, lowData, essential: [...], desirable: [...], essOk, desOk, penalty, summary, gaps, source }
   */
  function compute(reqs, profile, job) {
    const ess = (reqs.essential || []).map(r => scoreReq(r, profile));
    const des = (reqs.desirable || []).map(r => scoreReq(r, profile));
    const n = ess.length + des.length;
    const mean = a => a.reduce((t, r) => t + r.w, 0) / a.length;
    const pen = levelPenalty(job && job.title);
    const ok = r => r.w >= 0.6;
    const res = { essential: ess, desirable: des, essOk: ess.filter(ok).length, desOk: des.filter(ok).length, penalty: pen, source: reqs.source || 'ad' };
    res.gaps = ess.concat(des).filter(r => r.w < 0.6 && !r.check).map(r => r.skills.length ? r.skills.filter(s => !evidenceOf(s, profile).w).join(', ') || r.text : r.text).filter(Boolean);
    if (n < 3) return { ...res, score: null, lowData: true, summary: 'Мало распознанных требований — нужен полный текст вакансии' };
    const base = ess.length && des.length ? 0.75 * mean(ess) + 0.25 * mean(des) : ess.length ? mean(ess) : mean(des);
    const score = Math.max(0, Math.min(100, Math.round(100 * base - pen.p)));
    const missEss = ess.filter(r => !ok(r)).slice(0, 2).map(r => r.note ? `${short(r.text)} → ${r.note}` : short(r.text));
    const summary = `${res.essOk}/${ess.length} обязательных${des.length ? `, ${res.desOk}/${des.length} желательных` : ''}${missEss.length ? ` (${missEss.join('; ')})` : ''}${pen.p ? `, −${pen.p} за уровень ${pen.label}` : ''}`;
    return { ...res, score, lowData: false, summary };
  }
  const short = s => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > 60 ? s.slice(0, 57) + '…' : s; };

  /** Requirements from the ad itself, without AI: its Requirements / Desirable sections, else one line per tool. */
  function fromAd(description, company) {
    const sec = A.extractSections(String(description || ''));
    if (sec.requirements.length + sec.desirable.length >= 3) return { essential: sec.requirements, desirable: sec.desirable, source: 'ad' };
    const tools = A.extractTools(A.relevantText ? A.relevantText(description, company) : description);
    return { essential: sec.requirements.concat(tools.filter(t => !sec.requirements.some(r => r.includes(t)))), desirable: sec.desirable, source: 'tools' };
  }

  // ---------- AI extraction: the prompt and the check of its answer ----------
  const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9+#./ ]+/g, ' ').split(/\s+/).map(w => w.replace(/^[./]+|[./]+$/g, '')).filter(w => w.length >= 3);
  /** Is this line really in the ad? At least 60% of its words must appear there. */
  function inAd(line, adWords) {
    const w = words(line);
    if (!w.length) return false;
    return w.filter(x => adWords.has(x)).length / w.length >= 0.6;
  }
  const LEVELS = ['junior', 'mid', 'senior'];
  /** Checks an AI answer against the ad. Lines the ad does not contain are dropped. */
  function validate(obj, ad) {
    if (!obj || typeof obj !== 'object') throw new Error('AI ответил не JSON');
    const adWords = new Set(words(ad));
    const list = v => (Array.isArray(v) ? v : []).map(x => (typeof x === 'string' ? x : x && x.text) || '').map(s => s.trim()).filter(s => s.length >= 3 && s.length <= 300);
    const ess = list(obj.essential), des = list(obj.desirable);
    const keep = l => l.filter(x => inAd(x, adWords)).slice(0, 15);
    const int = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null; };
    const dropped = ess.length + des.length - keep(ess).length - keep(des).length;
    return {
      essential: keep(ess), desirable: keep(des), source: 'ai', dropped,
      workType: obj.workType === 'full-time' || obj.workType === 'part-time' ? obj.workType : null,
      officeDays: int(obj.officeDays, 0, 5), yearsRequired: int(obj.yearsRequired, 0, 20),
      salaryMin: int(obj.salaryMin, 5, 300000), salaryMax: int(obj.salaryMax, 5, 300000),
      level: LEVELS.includes(obj.level) ? obj.level : null, agency: typeof obj.agency === 'boolean' ? obj.agency : null,
      employer: typeof obj.employer === 'string' && obj.employer.trim() && obj.employer.length <= 80 ? obj.employer.trim() : null,
      questions: list(obj.questions).filter(x => /\?$/.test(x)).slice(0, 8),
    };
  }
  function prompt(job) {
    return [
      { role: 'system', content: 'You extract facts from UK job ads. Answer with one JSON object and nothing else. Copy requirement lines from the ad (shorten them, but keep the ad\'s own words). Never add requirements that are not in the ad.' },
      { role: 'user', content: `Return JSON with these keys:
"essential": array of requirement lines that are required (required, essential, must, you will have, or a plain requirements list),
"desirable": array of lines marked nice to have, desirable, bonus, ideally, advantageous,
"workType": "full-time" or "part-time" as the ad states it (hours of 35+ a week or Monday to Friday mean full-time; under 30 hours, term-time only, weekends or shifts mean part-time), or null if the ad does not say,
"officeDays": number of days a week in the office (0 = fully remote, 5 = fully office-based) or null if not stated,
"yearsRequired": minimum years of experience asked for, or null,
"salaryMin", "salaryMax": numbers in GBP (per year, or per hour if the ad is hourly), or null,
"level": "junior", "mid" or "senior",
"agency": true if a recruitment agency posted it for a client,
"employer": the real employer's name if the ad names or clearly describes it, else null,
"questions": questions the ad asks applicants to answer (end each with ?), or [].

TITLE: ${job.title || ''}
COMPANY: ${job.company || ''}
AD:
"""
${String(job.description || '').slice(0, 9000)}
"""` },
    ];
  }

  const api = { W, LABEL, evidenceOf, ownLevel, classify, scoreReq, levelPenalty, compute, fromAd, validate, prompt, inAd };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_Fit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
