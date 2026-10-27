/* Job Tracker — 'Copy CV prompt': puts the job ad, your fact bank and strict rules into one prompt
   for Claude or ChatGPT. Nothing is sent anywhere: the text goes to the clipboard and you paste it.
   The rules forbid inventing anything; the fact bank is the only source of truth about you. */
(function (root) {
  'use strict';

  const MAX_AD = 7000;
  const clean = s => String(s || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();

  // Does the ad ask for a cover letter or a supporting statement?
  function wantsLetter(text) {
    return /\b(cover(ing)? letter|supporting statement|personal statement|tell us why you)\b/i.test(String(text || ''));
  }

  function yearsLine(profile) {
    const c = profile.commercialYears;
    if (c === null || c === undefined || c === '' || isNaN(+c)) return '';
    return +c === 0
      ? 'I have not yet held a paid IT job with an employer. Present freelance and home-lab work as what it is (freelance / personal projects), never as employment.'
      : `I have ${+c} year${+c === 1 ? '' : 's'} in a paid IT job with an employer.`;
  }

  /**
   * build(app, profile, { why, letter })
   *   app     — a saved application (title, company, location, salaryText, description, chance)
   *   profile — uses factBank (falls back to opts.cvText), signName, commercialYears
   *   why     — your own words on why this employer (used as written, only grammar may change)
   *   letter  — true to ask for a cover letter as well
   * Returns { ok, text } or { ok: false, error }.
   */
  function build(app, profile, opts = {}) {
    profile = profile || {};
    // The fact bank if you wrote one, otherwise the CV you uploaded on the CV & ATS page
    const facts = clean(profile.factBank && profile.factBank.length >= 80 ? profile.factBank : opts.cvText);
    if (facts.length < 80) return { ok: false, error: 'Upload your CV on the CV & ATS page first (or fill in the fact bank in Settings).' };
    const ad = clean(app.description || app.rawDescription);
    if (ad.length < 200) return { ok: false, error: 'This application has no job description saved. Open the job page again so the tracker can read it.' };
    const why = clean(opts.why);
    if (opts.letter && why.length < 20) return { ok: false, error: 'Write a sentence or two on why this employer: the letter is built around it, and it has to be yours.' };

    const c = app.chance || {};
    const have = [].concat(c.matched || [], c.basic || []);
    const missing = c.missing || [];
    const job = [
      `Job title: ${app.title || 'not stated'}`,
      `Employer: ${app.company || 'not stated'}`,
      app.location ? `Location: ${app.location}` : '',
      app.salaryText ? `Salary: ${app.salaryText}` : '',
    ].filter(Boolean).join('\n');

    const rules = [
      'Use ONLY facts from MY FACT BANK. Never invent employers, job titles, dates, numbers, certificates, tools or achievements. If the ad asks for something that is not in the fact bank, do not add it: list it under "Gaps" instead.',
      'You may choose which facts to use, reorder them, merge them and reword them so they use the ad\'s own words for things I really have done.',
      yearsLine(profile),
      'British English. Plain, concrete sentences. No buzzwords ("passionate", "dynamic", "synergy", "go-getter", "results-driven") and no first-person pronouns in CV bullets.',
      'Each bullet starts with a verb and says what I did, with what tool, and the result if the fact bank gives one.',
      'Keep the CV to one page of content: 3-line profile, a skills line, then 3–5 bullets per role.',
    ].filter(Boolean);

    const out = [
      'I am applying for an IT support job in the UK. Tailor my CV to the job ad below.',
      '',
      'RULES',
      rules.map((r, i) => `${i + 1}. ${r}`).join('\n'),
      '',
      'WHAT TO RETURN',
      '1. Profile: 3 lines aimed at this job.',
      '2. Skills line: my tools in the order this ad cares about them.',
      '3. For each role or project in my fact bank that is relevant: 3–5 bullets chosen and reworded for this ad. Keep the role names and dates exactly as in the fact bank.',
      '4. Gaps: what the ad asks for that I cannot show, and one honest line I could say about each at interview.',
      '5. Changes: a short list of what you changed and why, so I can check it.',
    ];
    if (opts.letter) {
      out.push(
        '6. Cover letter: 150–200 words, three short paragraphs, addressed to the hiring manager by name if the ad gives one, otherwise "Dear Hiring Manager".',
        '   - Paragraph 1: the job title, and WHY THIS EMPLOYER below, kept in my words (fix only grammar).',
        '   - Paragraph 2: two facts from the fact bank that match the two most important requirements of the ad.',
        '   - Paragraph 3: availability and a plain request for a call. No "I am writing to express my interest", no "I believe I would be a great fit".',
        `   - Sign off "Kind regards," and ${profile.signName || 'my name'}.`,
      );
    }
    out.push(
      '',
      'THE JOB',
      job,
      have.length ? `Tools from the ad I already have (from my tracker): ${have.join(', ')}` : '',
      missing.length ? `Tools from the ad I do not have: ${missing.join(', ')}` : '',
      '',
      'JOB AD',
      '"""',
      ad.length > MAX_AD ? ad.slice(0, MAX_AD) + '\n[…cut]' : ad,
      '"""',
      '',
      'MY FACT BANK (the only source of facts about me)',
      '"""',
      facts,
      '"""',
    );
    if (why) out.push('', 'WHY THIS EMPLOYER (my words)', '"""', why, '"""');
    out.push('', 'Before you answer, check every line of the CV against the fact bank and remove anything that is not there.');
    return { ok: true, text: out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n') };
  }

  root.JT_Prompt = { build, wantsLetter };
})(typeof globalThis !== 'undefined' ? globalThis : this);
