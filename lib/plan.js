/* Job Tracker — weekly plan: last week's numbers, a plan built from them, and a plan pasted from an AI chat */
(function (root) {
  'use strict';
  const A = root.JT_Analyzer;
  const F = root.JT_Follow;
  const DAY = 864e5;

  // Weeks run Monday to Sunday; a week is named by its Monday, e.g. '2026-10-26'
  function weekStart(now, offset) {
    const d = now ? new Date(now) : new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * (offset || 0));
    return d;
  }
  const pad = n => String(n).padStart(2, '0');
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const weekKey = (now, offset) => keyOf(weekStart(now, offset));
  // Named in almost every ad and learnt on the job: not worth a task of their own
  const BASICS = ['Microsoft Office', 'Outlook', 'Customer service', 'Windows 10/11', 'Hardware', 'Printers', 'Peripherals', 'Documentation / KB', 'Remote support', 'Ticketing', 'Communication'];
  const DAYS = { en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], ru: ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'] };
  const MAX_FOLLOWUPS_A_WEEK = 15;
  const inRange = (iso, from, to) => { const t = new Date(iso).getTime(); return !isNaN(t) && t >= from && t < to; };

  /** What happened in one week: offset 0 is this week so far, -1 is last week. */
  function report(apps, profile, now, offset) {
    profile = profile || {};
    const start = weekStart(now, offset || 0), from = start.getTime(), to = from + 7 * DAY;
    const jobs = (apps || []).filter(a => a.track !== 'intern' || profile.showInternships);
    const sent = jobs.filter(a => a.appliedAt && inRange(a.appliedAt, from, to) && a.status !== 'withdrawn');
    const entered = (a, list) => (a.history || []).some(h => list.includes(h.status) && inRange(h.at, from, to));
    const rejectedIn = jobs.filter(a => (a.history || []).some(h => h.status === 'rejected' && inRange(h.at, from, to)));
    const fast = rejectedIn.filter(a => {
      const h = a.history.find(x => x.status === 'rejected');
      return a.appliedAt && (new Date(h.at) - new Date(a.appliedAt)) / DAY <= 3;
    });
    const followUps = jobs.reduce((n, a) => n + (a.followUps || []).filter(f => inRange(f.at, from, to)).length, 0);
    // Tools the week's ads asked for that you marked None: what to learn next
    const missing = {};
    sent.forEach(a => ((a.chance && a.chance.tools) || a.tools || []).forEach(t => {
      if (!BASICS.includes(t) && ((profile.skills || {})[t] || 'none') === 'none') missing[t] = (missing[t] || 0) + 1;
    }));
    const sources = {};
    sent.forEach(a => { sources[a.platform || 'Other'] = (sources[a.platform || 'Other'] || 0) + 1; });
    const target = Math.max(1, profile.dailyLimit || 5) * Math.max(1, Math.min(7, profile.daysPerWeek || 5));
    return {
      week: keyOf(start), from: new Date(from).toISOString(), to: new Date(to - 1).toISOString(),
      applied: sent.length, target,
      tailored: sent.filter(a => a.apply && a.apply.cvTailored).length,
      letters: sent.filter(a => a.apply && a.apply.cover === 'tailored').length,
      skip: sent.filter(a => a.chance && a.chance.verdict === 'skip').length,
      followUps,
      replies: jobs.filter(a => entered(a, A.RESPONDED.filter(s => s !== 'rejected'))).length,
      interviews: jobs.filter(a => entered(a, A.INTERVIEW)).length,
      rejections: rejectedIn.length, fastRejections: fast.length,
      missing: Object.entries(missing).sort((x, y) => y[1] - x[1]).slice(0, 5),
      sources: Object.entries(sources).sort((x, y) => y[1] - x[1]),
    };
  }

  // ---------- Texts ----------
  const T = {
    en: {
      apply: v => `Send ${v.target} careful applications: ${v.daily} on each of your ${v.days} job-search days${v.on ? ` (${v.on})` : ''}`,
      applyWhy: v => v.last ? `Last week: ${v.last} sent.` : 'Fewer, better applications get read.',
      tailor: () => 'Tailor the CV for every job marked Apply or Tailor CV before you send it',
      tailorWhy: v => `Last week ${v.tailored} of ${v.applied} applications had a tailored CV.`,
      letter: () => 'Write a short cover letter for every job you really want',
      letterWhy: v => `Last week: ${v.letters} of ${v.applied}.`,
      followUp: v => `Send ${v.n} follow-up${v.n === 1 ? '' : 's'} (Follow-ups page)${v.more ? `, the most recent first; ${v.more} more can wait` : ''}`,
      followUpWhy: v => v.contacts ? `${v.contacts} already have a contact; the rest need a quick LinkedIn search.` : 'Find the recruiter or IT manager on LinkedIn for each one.',
      skip: () => 'Do not apply to jobs marked Skip',
      skipWhy: v => `Last week ${v.skip} application${v.skip === 1 ? '' : 's'} went to jobs that rule you out.`,
      fast: () => 'Rework the top of the CV: headline, profile and first job bullets',
      fastWhy: v => `${v.fast} rejection${v.fast === 1 ? '' : 's'} within 3 days last week: the CV is screened out before a person reads it.`,
      learn: v => `Learn ${v.tool} and add it to your home lab`,
      learnWhy: v => `Asked for in ${v.n} of last week's ads; you marked it None.`,
      direct: () => 'Write to 3 local employers directly: IT support companies, schools, NHS trusts',
      directWhy: () => 'No replies last week: jobs that are never advertised have less competition.',
      stale: v => `Mark ${v.n} old application${v.n === 1 ? '' : 's'} as No response`,
      staleWhy: () => 'Over 30 days with no reply: clear them so the lists show what matters.',
      interview: v => `Prepare for ${v.title}${v.company ? ' at ' + v.company : ''}: the ad, the company and 3 examples from your work`,
      interviewWhy: () => 'An interview is in progress.',
      backup: () => 'Download a backup (Data page)',
      backupWhy: () => 'Your data lives only in this browser.',
    },
    ru: {
      apply: v => `Отправить ${v.target} продуманных откликов: по ${v.daily} в каждый из ${v.days} дней поиска${v.on ? ` (${v.on})` : ''}`,
      applyWhy: v => v.last ? `На прошлой неделе: ${v.last}.` : 'Меньше, но лучше: такие отклики читают.',
      tailor: () => 'Адаптировать резюме под каждую вакансию с вердиктом «Откликаться» или «Адаптировать резюме»',
      tailorWhy: v => `На прошлой неделе адаптировано ${v.tailored} из ${v.applied}.`,
      letter: () => 'Писать короткое сопроводительное письмо на вакансии, которые очень нужны',
      letterWhy: v => `На прошлой неделе: ${v.letters} из ${v.applied}.`,
      followUp: v => `Отправить фоллоуапы: ${v.n} (вкладка «Фоллоуапы»)${v.more ? `, сначала самые свежие; ещё ${v.more} подождут` : ''}`,
      followUpWhy: v => v.contacts ? `У ${v.contacts} уже есть контакт, для остальных найдите рекрутера в LinkedIn.` : 'Для каждого найдите рекрутера или IT-менеджера в LinkedIn.',
      skip: () => 'Не откликаться на вакансии с вердиктом «Пропустить»',
      skipWhy: v => `На прошлой неделе ${v.skip} откл. ушло на вакансии, которые вас исключают.`,
      fast: () => 'Переделать верх резюме: заголовок, профиль и первые пункты опыта',
      fastWhy: v => `Отказов в течение 3 дней на прошлой неделе: ${v.fast}. Резюме отсеивают до того, как его прочтёт человек.`,
      learn: v => `Изучить ${v.tool} и добавить в домашнюю лабораторию`,
      learnWhy: v => `Встречалось в ${v.n} вакансиях прошлой недели, у вас отмечено «нет».`,
      direct: () => 'Написать напрямую 3 местным работодателям: IT-компании, школы, NHS',
      directWhy: () => 'Ответов на прошлой неделе не было: на неопубликованные вакансии меньше конкурентов.',
      stale: v => `Отметить старые отклики как «Нет ответа»: ${v.n}`,
      staleWhy: () => 'Больше 30 дней без ответа: уберите их, чтобы списки показывали важное.',
      interview: v => `Подготовиться к интервью: ${v.title}${v.company ? ', ' + v.company : ''}. Вакансия, компания и 3 примера из опыта`,
      interviewWhy: () => 'Идёт процесс интервью.',
      backup: () => 'Скачать резервную копию (вкладка «Данные»)',
      backupWhy: () => 'Данные хранятся только в этом браузере.',
    },
  };

  // profile.workDays: 0 = Monday … 6 = Sunday; empty when not set
  const dayNames = (profile, lang) => (profile.workDays || []).slice().sort().map(d => (DAYS[lang] || DAYS.en)[d]).filter(Boolean).join(', ');

  /** Tasks for this week, worked out from last week's report and what is waiting now. */
  function autoPlan(apps, profile, now, lang) {
    const t = T[lang] || T.en;
    profile = profile || {};
    const last = report(apps, profile, now, -1);
    const days = Math.max(1, Math.min(7, profile.daysPerWeek || 5)), daily = Math.max(1, profile.dailyLimit || 5);
    const items = [];
    const add = (id, text, why) => items.push({ id, text, why });
    const live = (apps || []).filter(a => a.track !== 'intern' || profile.showInternships);

    live.filter(a => ['test', 'interview1', 'interview2', 'interview3'].includes(a.status))
      .forEach(a => add('interview:' + a.id, t.interview({ title: a.title || '', company: a.company || '' }), t.interviewWhy()));
    if (F) {
      const q = F.queue(live, now);
      // Follow-ups due now (not the old ones) plus those that fall due during the week
      const due = q.due.filter(x => !x.late).concat(q.soon.filter(x => x.inDays <= 5));
      const n = Math.min(due.length, MAX_FOLLOWUPS_A_WEEK);
      if (due.length) add('followups', t.followUp({ n, more: due.length - n }), t.followUpWhy({ contacts: due.filter(x => x.contacts.length).length }));
    }
    add('apply', t.apply({ target: daily * days, daily, days, on: dayNames(profile, lang), last: last.applied }), t.applyWhy({ last: last.applied }));
    if (last.applied && last.tailored / last.applied < 0.5) add('tailor', t.tailor(), t.tailorWhy(last));
    if (last.applied >= 3 && last.letters / last.applied < 0.3) add('letter', t.letter(), t.letterWhy(last));
    if (last.skip) add('skip', t.skip(), t.skipWhy(last));
    if (last.fastRejections >= 2) add('fast', t.fast(), t.fastWhy({ fast: last.fastRejections }));
    if (last.missing[0] && last.missing[0][1] >= 2) add('learn:' + last.missing[0][0], t.learn({ tool: last.missing[0][0] }), t.learnWhy({ n: last.missing[0][1] }));
    if (last.applied >= 5 && !last.replies) add('direct', t.direct(), t.directWhy());
    const stale = live.filter(a => a.status === 'applied' && a.appliedAt && (new Date(now || Date.now()) - new Date(a.appliedAt)) / DAY > 30).length;
    if (stale) add('stale', t.stale({ n: stale }), t.staleWhy());
    add('backup', t.backup(), t.backupWhy());
    return { last, items };
  }

  /** A plan pasted from an AI chat: one task per line; '#' lines and lines ending in ':' are headings. */
  function parsePlan(text) {
    const out = [];
    String(text || '').split(/\r?\n/).forEach(raw => {
      let s = raw.trim();
      if (!s) return;
      const heading = /^#{1,6}\s/.test(s) || (/:$/.test(s) && !/^[-*•]|^\d+[.)]|^\[[ xX]?\]/.test(s));
      s = s.replace(/^#{1,6}\s*/, '').replace(/^(?:[-*•–]\s*)?(?:\[[ xX]?\]\s*)?(?:\d+[.)]\s*)?/, '').replace(/\*\*(.+?)\*\*/g, '$1').trim();
      if (!s) return;
      out.push(heading ? { heading: s.replace(/:$/, '') } : { text: s });
    });
    return out;
  }

  /** A prompt for Claude or ChatGPT with the week's numbers; asks for a checklist the extension can read back. */
  function aiPrompt(apps, profile, now, lang) {
    profile = profile || {};
    const r = report(apps, profile, now, -1), cur = report(apps, profile, now, 0);
    const live = (apps || []).filter(a => a.track !== 'intern' || profile.showInternships);
    const waiting = live.filter(a => ['applied', 'screening'].includes(a.status)).length;
    const inProcess = live.filter(a => ['test', 'interview1', 'interview2', 'interview3', 'offer'].includes(a.status)).map(a => `${a.title} (${a.company || '?'}): ${A.statusLabel(a.status)}`);
    const pctOf = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
    const lines = [
      'You are an experienced UK IT recruiter and job-search coach. Make my job-search plan for this week.',
      '',
      'About me:',
      `- Target roles: ${(profile.targetCategories || []).join(', ') || '1st/2nd line IT support, helpdesk'}`,
      `- Available ${profile.daysPerWeek || 5} days a week${dayNames(profile, 'en') ? ` (${dayNames(profile, 'en')})` : ''}, up to ${profile.hoursPerWeek || 37.5} hours; areas: ${(profile.areas || []).slice(0, 8).join(', ') || 'not set'}`,
      `- Years of IT experience I can show: ${profile.experienceYears == null ? '?' : profile.experienceYears}; in a paid IT job: ${profile.commercialYears == null ? 'not set' : profile.commercialYears}`,
      profile.pitch ? `- In short: ${profile.pitch}` : '',
      '',
      `Last week (${r.week}):`,
      `- Applications: ${r.applied} (target ${r.target}); CV tailored: ${r.tailored} (${pctOf(r.tailored, r.applied)}); cover letters: ${r.letters}`,
      `- Applied to jobs the tracker marked Skip: ${r.skip}`,
      `- Follow-ups sent: ${r.followUps}; replies: ${r.replies}; interviews: ${r.interviews}; rejections: ${r.rejections} (${r.fastRejections} within 3 days)`,
      `- Sources: ${r.sources.map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`,
      `- Tools in the ads that I lack: ${r.missing.map(([k, v]) => `${k} (${v})`).join(', ') || 'none'}`,
      `This week so far: ${cur.applied} applications, ${cur.followUps} follow-ups.`,
      `Waiting for a reply: ${waiting}. In process: ${inProcess.join('; ') || 'none'}.`,
      '',
      'Write the plan as a checklist the tracker can read:',
      '- one task per line, starting with "- "',
      '- group tasks under day headings that end with a colon (only the days I am available), e.g. "Monday:"',
      '- at most 15 tasks, each concrete and doable in under 2 hours, with numbers where possible',
      '- after the checklist, nothing else',
      lang === 'ru' ? '\nWrite the tasks in Russian.' : '',
    ];
    return lines.filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n').trim();
  }

  const api = { weekStart, weekKey, report, autoPlan, parsePlan, aiPrompt, dayNames, DAYS, TEXTS: T };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_Plan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
