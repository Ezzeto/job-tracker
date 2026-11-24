/* Job Tracker — the two job searches (spec 3.5.1 §7) and ready answers for application forms.
 * Market B: work alongside study (part-time, weekends, term-time, few office days).
 * Market A: full-time, only for roles worth taking a study break for (worthLeave).
 * Pure functions: the extension and the phone app use the same code. */
(function (root) {
  'use strict';

  const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const n = s => NUM[String(s).toLowerCase()] || parseInt(s, 10);

  /** Office days a week the ad asks for: 0 (remote) … 5, or null when it does not say. */
  function officeDays(text) {
    const t = String(text || '').toLowerCase();
    let m = t.match(/\b(one|two|three|four|five|[1-5])\s*(?:\+\s*)?(?:days?|x)\s*(?:a|per|each|\/)?\s*week\s*(?:on[- ]?site|(?:in|at|from)\b[^.\n]{0,30}?\b(?:office|site|hq|campus))/)
      || t.match(/\b(one|two|three|four|five|[1-5])\s*days?\s*(?:in|at)\s*(?:the|our)?\s*(?:office|site)/)
      || t.match(/\b(?:office|on[- ]?site|in[- ]office)\s*(?:for|presence of)?\s*(one|two|three|four|five|[1-5])\s*days?/)
      || t.match(/\bhybrid\s*\(?\s*(one|two|three|four|five|[1-5])\s*days?/);
    if (m) return Math.min(5, n(m[1]));
    if (/\bfully remote\b|\b100% remote\b|\bremote[- ]first\b|\bwork from home\b(?! (one|two|\d))/.test(t) && !/\bhybrid\b/.test(t)) return 0;
    if (/\b(fully|100%) (office|on[- ]?site)[- ]based\b|\bon[- ]?site (role|position),? (5|five) days\b|\bmonday to friday,? (in|at) (the )?office\b|\boffice[- ]based\b(?!.*hybrid)/.test(t)) return 5;
    return null;
  }

  const PART = /\bpart[- ]time\b|\bweekends?\b|\bsaturday\b|\bsunday\b|\bterm[- ]time\b|\bzero[- ]hours?\b|\bflexible hours\b|\b(16|20|24|25|28|30)\s*hours\b|\b[1-4] days a week\b|\bstudent\b|\bshift(s|work)?\b|\bpro[- ]rata\b|\bcasual\b|\btemp(orary)?\b/i;
  const FULL = /\bfull[- ]time\b|\bmonday to friday\b|\b37\.5\s*hours\b|\b40\s*hours\b|\b(35|36|37)\s*hours\b|\bpermanent,? full\b/i;

  /** 'A' (full-time) or 'B' (alongside study), from the work type words in the ad. */
  function marketOf(job) {
    const text = [job.title, (job.workTypes || []).join(' '), job.salaryText, job.description].join('\n');
    const part = PART.test(text) || (job.workTypes || []).some(w => /part|temp|shift|weekend|flex/i.test(w));
    const full = FULL.test(text) || (job.workTypes || []).some(w => /full/i.test(w));
    return part && !(full && !/\bpart[- ]time\b/i.test(text)) ? 'B' : full ? 'A' : 'B';
  }

  const BIG = ['cloudflare', 'google', 'microsoft', 'amazon', 'aws', 'apple', 'meta', 'netflix', 'stripe', 'monzo', 'revolut', 'wise', 'starling', 'deliveroo', 'arm', 'deepmind', 'bloomberg', 'ocado', 'sky', 'bbc', 'dyson', 'jagex', 'spotify', 'atlassian', 'salesforce', 'ibm', 'oracle', 'cisco', 'nvidia', 'intel', 'samsung', 'bt', 'vodafone', 'goldman sachs', 'jp morgan', 'jpmorgan', 'barclays', 'hsbc', 'lloyds', 'deloitte', 'pwc', 'ey', 'kpmg', 'accenture', 'capgemini', 'cambridge university', 'university of cambridge', 'astrazeneca'];
  const GROWTH = /\b(junior|graduate|grad|trainee|apprentice|associate|entry[- ]level|specialist i|engineer i|analyst i|level 1|1st line)\b|\btraining (provided|programme|budget)\b|\bcertifications?\b.*\b(paid|funded|sponsored|support)\b|\bcareer (path|progression|development)\b|\bprogression\b/i;

  /**
   * Is this full-time job worth a study break? All three: a known company, salary at or above the
   * threshold (or not stated by a company on the list), and a junior role with a path up or training.
   */
  function worthLeave(job, profile) {
    const p = profile || {};
    const list = (p.bigTechList && p.bigTechList.length ? p.bigTechList : BIG).map(x => String(x).toLowerCase().trim()).filter(Boolean);
    const co = String(job.company || '').toLowerCase();
    const known = list.some(x => co === x || co.startsWith(x + ' ') || co.includes(x) && x.length > 3);
    const min = Number(p.salaryThresholdA) || 30000;
    const s = job.salary || {};
    const top = s.annualMax || s.annualMin || 0;
    const pay = top ? top >= min : known;
    const growth = GROWTH.test([job.title, job.description].join('\n'));
    return { ok: known && pay && growth, known, pay, growth, min };
  }

  const DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const daysText = wd => {
    const d = (wd || []).slice().sort((a, b) => a - b);
    if (!d.length) return '';
    const runs = []; let s = d[0], prev = d[0];
    for (let i = 1; i <= d.length; i++) {
      if (d[i] === prev + 1) { prev = d[i]; continue; }
      runs.push(s === prev ? DAY[s] : `${DAY[s]} to ${DAY[prev]}`);
      s = prev = d[i];
    }
    return runs.join(' and ');
  };
  const money = v => '£' + Math.round(v).toLocaleString('en-GB');

  /**
   * Ready answers for the usual form questions, from the profile and this ad.
   * Returns [{ q, a, note? }]. English, because the forms are in English.
   */
  function answers(job, profile, an) {
    const p = profile || {};
    const mk = marketOf(job);
    const out = [];
    out.push({ q: 'Do you have the right to work in the UK?', a: 'Yes' });
    out.push({ q: 'Will you now or in the future require visa sponsorship?', a: p.timeLimitedRtw ? 'No sponsorship needed (time-limited permission: check the ad)' : 'No' });
    const days = daysText(p.workDays);
    const hours = Number(p.hoursPerWeek) || 0;
    if (mk === 'B') out.push({ q: 'What is your availability?', a: [days ? `${days}` : `${p.daysPerWeek || 4} days a week`, hours ? `up to ${hours} hours a week` : '', 'alongside my Computing degree'].filter(Boolean).join(', '), note: 'Рынок Б: работа параллельно с учёбой' });
    else out.push({ q: 'Are you available full-time?', a: 'Yes, I can start full-time', note: 'Рынок А: только если вакансия стоит академа' });
    out.push({ q: 'When can you start?', a: 'Immediately' });
    const s = job.salary || (an && an.salary) || null;
    const thr = Number(p.salaryThresholdA) || 30000;
    let sal;
    if (s && s.annualMin) {
      const lo = s.annualMin, hi = s.annualMax || s.annualMin;
      sal = mk === 'A' ? `${money(Math.max(lo, Math.min(hi, thr)))}${hi > lo ? `–${money(hi)}` : ''}, in line with the advertised range` : (s.period === 'hour' ? `${money(s.min)} an hour, as advertised` : `${money(lo)}${hi > lo ? `–${money(hi)}` : ''} pro rata, as advertised`);
    } else sal = mk === 'A' ? `${money(thr)}–${money(thr + 5000)}` : 'In line with the advertised rate, pro rata';
    out.push({ q: 'What are your salary expectations?', a: sal });
    const yrs = p.experienceYears != null ? Number(p.experienceYears) : null;
    if (yrs != null) out.push({ q: 'How many years of IT support experience do you have?', a: `${yrs} year${yrs === 1 ? '' : 's'} (freelance IT support for small businesses), plus a home lab`, note: p.commercialYears != null ? `В штате: ${p.commercialYears}` : '' });
    out.push({ q: 'Do you have a full UK driving licence?', a: p.hasDrivingLicence ? 'Yes' : 'No' });
    if (p.pitch) out.push({ q: 'Why are you interested in this role?', a: `I'm ${p.pitch.replace(/^(i'?m|i am)\s+/i, '')}. ${job.company ? `${job.company}'s` : 'This'} ${job.title || 'role'} matches the work I already do: [one sentence on this employer]`, note: 'Допиши одно предложение про работодателя' });
    return out;
  }

  root.JT_Market = { officeDays, marketOf, worthLeave, answers, daysText, BIG };
})(typeof globalThis !== 'undefined' ? globalThis : this);
