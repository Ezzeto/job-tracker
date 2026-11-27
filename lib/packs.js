/* Job Tracker — the application pack, prepared before you sit down to apply (idea "pack ready in advance").
 * For one job: your CV reordered for the ad (Word file), a cover letter (AI from your CV, or your
 * template), answers to the ad's own questions and to the usual form questions, the salary to give and
 * the precise Fit. The autofill uses it; you only check and press Submit.
 * Needs JT_Analyzer, JT_Market, JT_Templates, JT_Tailor, JT_Docx, JT_Fit and, for AI parts, JT_LLM. */
(function (root) {
  'use strict';
  const g = n => root[n];
  const b64 = bytes => { let s = ''; const u = new Uint8Array(bytes); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return root.btoa(s); };
  const keyOf = job => (job.url && g('JT_Store') ? 'u:' + g('JT_Store').normUrl(job.url) : 'k:' + String((job.company || '') + '|' + (job.title || '')).toLowerCase().replace(/[^a-z0-9|]+/g, ''));

  /**
   * job: { title, company, url, description, location, platform }
   * env: { profile, cvText, templates, me (autofill data), llm: cfg|null, onStep?(text) }
   * Returns the pack. AI failures leave the non-AI parts in place and record the error.
   */
  async function build(job, env) {
    const A = g('JT_Analyzer'), Mk = g('JT_Market'), TP = g('JT_Templates'), TL = g('JT_Tailor'), DX = g('JT_Docx'), FIT = g('JT_Fit'), LLM = g('JT_LLM');
    const p = env.profile || {}, me = env.me || {};
    const step = env.onStep || (() => {});
    const an = A.analyze(job, p);
    const full = { ...job, salary: an.salary, workTypes: an.workTypes };
    const market = Mk.marketOf(full);
    const pack = { key: keyOf(job), job: { title: job.title || '', company: job.company || '', url: job.url || '', location: job.location || '', platform: job.platform || '', description: String(job.description || '').slice(0, 15000) }, market, createdAt: new Date().toISOString(), errors: [] };
    // Form answers from the profile: right to work, sponsorship, availability, salary, start date
    pack.answers = Mk.answers(full, p, an).map(x => ({ q: x.q, a: x.a, src: 'profile' }));
    const sal = pack.answers.find(x => /salary/i.test(x.q));
    pack.salary = (market === 'A' ? p.salaryA || me.salaryA : p.salaryB || me.salaryB) || (sal && sal.a) || '';
    // CV reordered for the ad
    if (env.cvText && TL && DX) {
      try {
        step('CV');
        const out = TL.tailor(TL.parse(env.cvText), job, p);
        const name = TL.fileName(out.cv, job) + '.docx';
        pack.cv = { name, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', b64: b64(DX.build(out.cv, { title: name.replace(/\.docx$/, '') })) };
        pack.cvReport = { before: out.report.coverBefore, after: out.report.coverAfter, gaps: out.report.gaps.slice(0, 8) };
      } catch (e) { pack.errors.push('CV: ' + e.message); }
    }
    // Requirements, the ad's questions and the precise Fit
    let reqs = FIT.fromAd(job.description, job.company), questions = [];
    if (env.llm && env.llm.key && LLM) {
      try { step('требования'); const x = await LLM.extract(env.llm, job); if (x.essential.length + x.desirable.length >= 3) reqs = x; questions = x.questions || []; pack.employer = x.employer; } catch (e) { pack.errors.push('требования: ' + e.message); }
    }
    pack.fit = FIT.compute(reqs, p, job).score;
    // Cover letter: AI from your CV, else your template
    const facts = String(p.factBank && p.factBank.length > 80 ? p.factBank : env.cvText || '').slice(0, 4000);
    const sig = [p.signName, [p.signPhone, p.signLinkedIn].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
    if (env.llm && env.llm.key && LLM && facts.length > 80) {
      try {
        step('письмо');
        const avail = market === 'B' ? `${Mk.daysText(p.workDays) || (p.daysPerWeek || 4) + ' days a week'}, alongside my Computing degree; can start immediately` : 'full-time, can start immediately';
        const l = await LLM.coverLetter(env.llm, { job, facts, profile: p, availability: avail, signature: sig });
        pack.letter = l.text; pack.letterWarn = l.warn; pack.letterAi = true;
      } catch (e) { pack.errors.push('письмо: ' + e.message); }
    }
    if (!pack.letter && TP) pack.letter = TP.fill(TP.merge(env.templates).cover.body, { title: job.title, company: job.company }, p);
    // The ad's own questions, answered from your facts
    if (env.llm && env.llm.key && LLM && facts.length > 80) {
      const ask = questions.concat(/why (do you|are you).*(work|join|role)|why us/i.test(job.description || '') ? [] : ['Why do you want to work for us?']).slice(0, 4);
      for (const q of ask) {
        try { step('ответ: ' + q.slice(0, 40)); const a = await LLM.answer(env.llm, { question: q, job, facts, skills: Object.keys(p.skills || {}).filter(k => p.skills[k] === 'strong').join(', ') }); pack.answers.push({ q, a: a.trim(), src: 'ai' }); }
        catch (e) { pack.errors.push('ответ: ' + e.message); break; }
      }
    }
    pack.status = 'ready';
    return pack;
  }

  const api = { build, keyOf, b64 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_Packs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
