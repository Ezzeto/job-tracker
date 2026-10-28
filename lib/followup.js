/* Job Tracker — follow-ups: message templates tailored to the job, plus quick-send links */
(function (root) {
  'use strict';
  const AGENCY_RE = /recruit|resourcing|staffing|talent|personnel|search|associates|consult(ing|ants)|people|careers|selection|hays|reed|randstad|adecco|harvey nash|robert (half|walters)|michael page|page group|spencer ogden|nigel frank|computer futures|zachary daniels|ashdown|doherty|cornucopia|vivo talent|tempting|planetrecruitment|ser \(staffing\)/i;
  const COMMON = ['Windows 10/11', 'Ticketing', 'Customer service', 'Hardware', 'Documentation / KB', 'Microsoft Office', 'Outlook', 'Printers', 'Peripherals', 'Remote support', 'SLA', 'Git'];

  const isAgency = app => AGENCY_RE.test(app.company || '') || /\bour client\b|on behalf of (a|our) client|recruitment agency|employment agency/i.test(app.description || '');
  const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';
  const fmtDay = iso => { try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }); } catch (e) { return ''; } };
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const sentence = s => { s = String(s || '').trim(); return !s ? '' : /[.!?]$/.test(s) ? s : s + '.'; };

  function listJoin(arr) {
    const a = arr.filter(Boolean);
    if (a.length <= 1) return a[0] || '';
    return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  }
  const pretty = t => ({ 'Windows 10/11': 'Windows 11', 'Entra ID / Azure AD': 'Entra ID', 'Freshdesk / Freshservice': 'Freshservice', 'ConnectWise / Autotask': 'ConnectWise', 'SCCM / MECM': 'SCCM', 'Switches / Routers': 'networking', 'iOS / Android': 'mobile devices', 'Documentation / KB': 'documentation', 'Remote support': 'remote support', 'Customer service': 'customer service', 'REST APIs': 'REST APIs', 'LLMs / RAG': 'LLM applications' })[t] || t;

  // Skills from the ad that you have: less common ones first, then the basics
  function skillLine(app) {
    const c = app.chance || {};
    const have = (c.matched || []).concat(c.basic || []).filter(t => !(c.similar || []).includes(t));
    const rare = have.filter(t => !COMMON.includes(t));
    const pick = rare.concat(have.filter(t => COMMON.includes(t))).slice(0, 3).map(pretty);
    return listJoin(pick);
  }

  function hook(app) {
    const d = (app.description || '').toLowerCase();
    if (/\b(schools?|academ(y|ies)|pupils|students and staff|staff and students|education (sector|setting|trust|provider))\b|\b(our|the) (college|university|campus)\b/.test(d)) return 'supporting staff and students in an education setting';
    if (/\bretail|stores?\b|epos/.test(d)) return 'supporting colleagues across stores and head office';
    if (/\bnhs|health|clinic|hospital/.test(d)) return 'working in a healthcare environment';
    if (/\bstartup|start-up|early[- ]stage|seed|series a\b/.test(d)) return 'building product in a small, fast-moving team';
    if (/\bmsp\b|managed service/.test(d)) return 'supporting a range of different clients';
    if (/\bglobal|international|europe/.test(d)) return 'working with people across different locations';
    return '';
  }

  /**
   * channel: 'email' | 'linkedin' | 'call'
   * contact: { name, value, type }
   * profile: { signName, signPhone, signLinkedIn, pitch, highlights }
   *   pitch      — a short phrase about you, e.g. 'second-year Computing with AI student'
   *   highlights — one or two sentences for emails and calls
   */
  // For internships: the dates and deadline from your placement rules, as plain sentences
  const longDay = iso => { try { return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return ''; } };
  function placementLines(profile, now) {
    const pl = ((profile && profile.intern) || {}).placement || {};
    const period = pl.start && pl.end ? `${longDay(pl.start)} to ${longDay(pl.end)}` : '';
    const days = pl.daysPerWeek && pl.daysPerWeek < 5 ? `, ${pl.daysPerWeek} days a week alongside my classes` : '';
    const next = (pl.deadlines || []).filter(d => d.date && new Date(d.date + 'T23:59:59Z') >= (now || new Date())).sort((a, b) => a.date < b.date ? -1 : 1)[0];
    return {
      period: period ? `The placement would run from ${period}${days}.` : '',
      deadline: next ? `My university needs the offer by ${longDay(next.date)}, so any update would really help.` : '',
    };
  }

  function build(app, channel, contact, profile, now) {
    profile = profile || {};
    const intern = app.track === 'intern';
    const ip = profile.intern || {};
    if (intern) profile = { ...profile, pitch: ip.pitch || profile.pitch, highlights: ip.highlights || profile.highlights };
    const pl = intern ? placementLines(profile, now) : { period: '', deadline: '' };
    const n = (app.followUps || []).length;
    const agency = isAgency(app);
    const fname = firstName(contact && contact.name);
    const me = firstName(profile.signName);
    const thanks = me ? `Thanks, ${me}` : 'Thanks';
    const title = app.title || 'the role';
    const company = app.company || '';
    const when = fmtDay(app.appliedAt);
    const skills = skillLine(app);
    const pitch = String(profile.pitch || '').trim().replace(/[.!]$/, '');
    const highlights = sentence(profile.highlights);
    const sig = [profile.signName || '', profile.signPhone || '', profile.signLinkedIn || ''].filter(Boolean).join('\n');
    const where = agency && company ? ` (advertised by ${company})` : company ? ` at ${company}` : '';
    const nameTag = profile.signName ? ` – ${profile.signName}` : '';

    if (channel === 'linkedin') {
      // A LinkedIn connection note allows 200 characters. Try variants from longest to shortest.
      const hi = fname ? `Hi ${fname},` : 'Hi,';
      const t = title.length > 45 ? title.slice(0, 42).replace(/\s+\S*$/, '') + '…' : title;
      const co = company && company.length <= 30 ? ' at ' + company : '';
      const short = skillLine({ chance: { ...(app.chance || {}), matched: ((app.chance || {}).matched || []).slice(0, 2), basic: [] } });
      const about = pitch ? ` ${cap(pitch)}${short ? ` (${short})` : ''}.` : short ? ` I work with ${short}.` : '';
      const aboutShort = pitch ? ` ${cap(pitch)}.` : '';
      const variants = n === 0 ? [
        `${hi} I've applied for the ${t} role${co} and I'm very keen.${about} Happy to share more. ${thanks}`,
        `${hi} I've applied for the ${t} role${co} and I'm very keen.${about} ${thanks}`,
        `${hi} I've applied for the ${t} role${co} and I'm very keen.${aboutShort} ${thanks}`,
        `${hi} I've applied for the ${t} role and I'm very keen to hear back. ${thanks}`,
      ] : [
        `${hi} just checking in on my ${t} application${co}. Still very keen and happy to share anything else you need. ${thanks}`,
        `${hi} just checking in on my ${t} application. Still very keen. ${thanks}`,
      ];
      const body = variants.find(v => v.length <= LI_LIMIT) || variants[variants.length - 1].slice(0, LI_LIMIT);
      return { subject: '', body };
    }

    if (channel === 'call') {
      const summary = highlights || [pitch ? sentence(cap(pitch)) : '', skills ? `I have hands-on experience with ${skills}.` : ''].filter(Boolean).join(' ');
      return {
        subject: '',
        body: [
          `Hi${fname ? ' ' + fname : ''}, this is ${profile.signName || '[your name]'}.`,
          `I applied for the ${title} role${where}${when ? ' on ' + when : ''} and wanted to check how the process is going.`,
          summary ? `Quick summary: ${summary}` : '',
          intern && pl.period ? pl.period.replace('The placement would run', 'I\'m looking for a placement running') : '',
          agency ? 'Is the client still reviewing CVs? And do you have any similar roles I could be considered for?' : 'Is there anything else I can send to support my application?',
          intern && pl.deadline ? pl.deadline : '',
          '',
          '— If nobody answers: leave a short voicemail with your name, the job title and your phone number.',
        ].filter((l, i, arr) => l || String(arr[i + 1] || '').startsWith('—')).join('\n'),
      };
    }

    // email
    const greet = fname ? `Hi ${fname},` : agency ? 'Hi,' : 'Dear Hiring Team,';
    const h = hook(app);
    const fit = h ? `The role's focus on ${h} is exactly the kind of work I'd like to do.` : 'The role is exactly the kind of work I\'d like to do.';
    // The pitch is a noun phrase for short notes; emails use the full highlights sentence instead
    const about = highlights || (skills ? `I have hands-on experience with ${skills}.` : '');
    let subject, body;
    if (n === 0) {
      subject = `Follow-up: ${title} application${nameTag}`;
      body = [
        greet, '',
        `I applied for the ${title} role${where}${when ? ' on ' + when : ''} and wanted to follow up, as I'm very interested in the position.`, '',
        [fit, about].filter(Boolean).join(' '), '',
        ...(intern && (pl.period || pl.deadline) ? [[pl.period, pl.deadline].filter(Boolean).join(' '), ''] : []),
        agency
          ? 'Could you let me know whether my application is progressing, or if you need anything else from me? I\'d also be glad to hear about any similar roles you\'re working on.'
          : 'I\'d be happy to provide any further information. Thank you for your time, and I look forward to hearing from you.', '',
        'Kind regards,', sig,
      ].join('\n').trim();
    } else {
      subject = `Re: ${title} application${nameTag}`;
      body = [
        greet, '',
        `I wanted to check in once more on my application for the ${title} role${where}. I'm still very keen on the position and happy to share anything else that would help.${intern && pl.deadline ? ' ' + pl.deadline : ''}`, '',
        agency ? 'If this one has closed, I\'d appreciate being considered for any similar roles you have.' : 'Thank you for your time.', '',
        'Kind regards,', sig,
      ].join('\n').trim();
    }
    return { subject, body };
  }

  const LI_LIMIT = 200;
  const enc = encodeURIComponent;
  const links = {
    gmail: (to, s, b) => `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to || '')}&su=${enc(s)}&body=${enc(b)}`,
    outlook: (to, s, b) => `https://outlook.live.com/mail/0/deeplink/compose?to=${enc(to || '')}&subject=${enc(s)}&body=${enc(b)}`,
    mailto: (to, s, b) => `mailto:${enc(to || '')}?subject=${enc(s)}&body=${enc(b)}`,
    linkedinSearch: (company) => `https://www.linkedin.com/search/results/people/?keywords=${enc((company || '') + ' recruiter')}`,
    // Where to look when the ad named nobody: the company's recruiters, its IT manager, a careers mailbox
    linkedinPeople: (company, role) => `https://www.linkedin.com/search/results/people/?keywords=${enc(`${company || ''} ${role}`.trim())}`,
    googleEmail: (company) => `https://www.google.com/search?q=${enc(`"${company || ''}" recruitment OR careers OR jobs email`)}`,
  };

  // ---------- The follow-up queue ----------
  // First message after 4 working days, a second one 5 working days after that, then stop.
  const FIRST_AFTER = 4, SECOND_AFTER = 5, MAX_FOLLOWUPS = 2, LATE_DAYS = 14;
  const WAITING = ['applied', 'screening'];
  function workingDays(iso, now) {
    const from = new Date(iso), to = now ? new Date(now) : new Date();
    if (isNaN(from) || to <= from) return 0;
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    let n = 0;
    while (d < end) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
    return n;
  }
  const usable = a => (a.contacts || []).filter(c => c.type === 'email' || c.type === 'linkedin' || c.type === 'phone');

  /**
   * Sorts waiting applications into what to send today, what comes up next and what is finished.
   * due:  [{ a, n, wd, contacts, late }]  — n follow-ups sent so far, wd working days since the last touch,
   *       late when the first one was never sent and the application is over two weeks old
   * soon: [{ a, n, inDays, contacts }]
   * done: [{ a, n, days }]          — both follow-ups sent; days since the last one
   */
  function queue(apps, now) {
    const due = [], soon = [], done = [];
    (apps || []).forEach(a => {
      if (!WAITING.includes(a.status) || !a.appliedAt) return;
      const fu = a.followUps || [];
      const last = fu.length ? fu[fu.length - 1].at : a.appliedAt;
      const wd = workingDays(last, now);
      const contacts = usable(a);
      if (fu.length >= MAX_FOLLOWUPS) { done.push({ a, n: fu.length, days: Math.floor(((now ? new Date(now) : new Date()) - new Date(last)) / 864e5) }); return; }
      const need = fu.length ? SECOND_AFTER : FIRST_AFTER;
      if (wd >= need) due.push({ a, n: fu.length, wd, contacts });
      else soon.push({ a, n: fu.length, inDays: need - wd, contacts });
    });
    // Jobs with someone to write to and a good fit first: that is where a message changes the outcome
    const fit = a => (a.chance && a.chance.verdict !== 'skip' && typeof a.chance.score === 'number') ? a.chance.score : 0;
    // A follow-up two weeks after applying still helps; after that most shortlists are made, so those go last
    const now_ = now ? new Date(now) : new Date();
    due.forEach(x => { x.late = !x.n && (now_ - new Date(x.a.appliedAt)) / 864e5 > LATE_DAYS; });
    due.sort((x, y) => x.late - y.late || (y.contacts.length > 0) - (x.contacts.length > 0) || fit(y.a) - fit(x.a) || x.wd - y.wd);
    soon.sort((x, y) => x.inDays - y.inDays || fit(y.a) - fit(x.a));
    done.sort((x, y) => y.days - x.days);
    return { due, soon, done };
  }

  const api = { build, isAgency, links, LI_LIMIT, skillLine, queue, workingDays, FIRST_AFTER, SECOND_AFTER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_Follow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
