/* Job Tracker — message templates (cover letter, speculative email, answers for application forms)
   and a settings file that fills in Settings and the templates in one go. */
(function (root) {
  'use strict';

  // [Job title], [Company] and [Name] come from the boxes on the Templates page; [My name], [My phone]
  // and [My LinkedIn] from Settings. Anything else in square brackets is for you to write.
  const DEFAULTS = {
    cover: {
      title: 'Cover letter',
      subject: '',
      body: `Dear [Name],

I'm applying for the [Job title] role at [Company]. [One sentence on why this employer, from the ad or their website.]

I already do the core of 1st line work. As a part-time freelancer I look after Microsoft 365 for small businesses — users, licences, MFA, shared mailboxes — reset accounts in Active Directory and fix Windows, Wi-Fi and printer faults on site and remotely. In my home lab I run Windows Server, Entra ID and Intune, and log and close tickets against SLA targets, writing each fix up as a knowledge base article.

For four years I worked front of house at Côte, handling complaints and competing requests calmly under pressure. That is the part of service desk work most people find hardest, and it is what I do best.

I'm available Monday to Wednesday and Saturdays, up to 35 hours a week, alongside my Computing degree, and can start immediately. I have the right to work in the UK with no sponsorship needed.

Thank you for your time — I'd welcome the chance to talk.

Kind regards,
[My name]
[My phone] · [My LinkedIn]`,
    },
    speculative: {
      title: 'Email to a local IT company or school (no advert)',
      subject: '1st line IT support — available Mon–Wed and Saturdays',
      body: `Hi [Name],

I'm a 1st line IT support starter based in Bishop's Stortford. I support small businesses with Microsoft 365, Active Directory and Windows issues, and practise service desk work in a home lab with Entra ID, Intune and a ticketing system.

I'm looking for a junior, part-time or weekend support role — Monday to Wednesday and Saturdays, up to 35 hours a week. If you ever need an extra pair of hands on the desk or on site, I'd love to help. My CV is attached.

Kind regards,
[My name]
[My phone]`,
    },
    linkedin: {
      title: 'LinkedIn note after applying (200 characters)',
      subject: '',
      body: `Hi [Name], I've just applied for the [Job title] role. I support M365, AD and Windows users and run an Intune home lab. Would value a quick look at my CV. Thanks, [My name]`,
    },
    answers: {
      title: 'Answers for application forms',
      subject: '',
      body: `Do you have the right to work in the UK? — Yes
Will you now or in the future require sponsorship? — No
Do you have unrestricted / indefinite right to work? — No. Ukraine Permission Extension until March 2027; I will apply for the free 24-month extension as soon as the window opens.
Years of experience in IT support — [the real figure, freelance included]
Years of professional / paid IT experience — [0–1, honestly]
Can you work Monday to Friday? — No, Monday to Wednesday and Saturdays (skip the job if it is a must)
Salary expectation — £24,000–£27,000`,
    },
  };
  const ORDER = ['cover', 'speculative', 'linkedin', 'answers'];

  /** Saved templates over the defaults; a template you never edited follows the defaults. */
  function merge(saved) {
    const out = {};
    ORDER.forEach(k => { out[k] = { ...DEFAULTS[k], ...((saved || {})[k] || {}) }; });
    return out;
  }

  function fill(text, job, profile) {
    job = job || {}; profile = profile || {};
    const map = {
      'Job title': job.title, 'Company': job.company, 'Name': job.name,
      'My name': profile.signName, 'My phone': profile.signPhone, 'My LinkedIn': profile.signLinkedIn,
    };
    let s = String(text || '').replace(/\[(Job title|Company|Name|My name|My phone|My LinkedIn)\]/g, (m, k) => (map[k] || '').trim() || m);
    // 'Dear [Name],' with no name becomes 'Dear Hiring Manager,'; 'Hi [Name],' becomes 'Hi,'
    s = s.replace(/^Dear \[Name\],/m, 'Dear Hiring Manager,').replace(/^Hi \[Name\],/m, 'Hi,');
    // A signature line left with only separators after empty fields
    return s.split('\n').filter(l => !/^\s*[·|,\-–]?\s*\[My (phone|LinkedIn)\]\s*([·|,\-–]\s*\[My (phone|LinkedIn)\]\s*)?$/.test(l)).join('\n');
  }
  // Placeholders still to replace by hand
  const leftovers = text => [...new Set((String(text || '').match(/\[[^\]\n]{1,80}\]/g) || []))];

  // ---------- Settings file ----------
  // Only these profile fields can come from a settings file; applications and skills are never touched
  const PROFILE_KEYS = {
    daysPerWeek: 'number', workDays: 'days', hoursPerWeek: 'number', experienceYears: 'number', commercialYears: 'numberOrNull',
    dailyLimit: 'number', hasDrivingLicence: 'boolean', timeLimitedRtw: 'boolean', penalizeSchedule: 'boolean', showInternships: 'boolean',
    autoDetect: 'boolean', showPreview: 'boolean', listScan: 'boolean', autoNoResponseDays: 'number',
    signName: 'string', signPhone: 'string', signLinkedIn: 'string', pitch: 'string', highlights: 'string', factBank: 'string',
    mailClient: ['gmail', 'outlook', 'mailto'], gmailAccounts: 'emails', lang: ['en', 'ru'],
    areas: 'strings', home: 'string', maxCommuteKm: 'number', languages: 'strings', targetCategories: 'strings',
  };
  const ok = (type, v) => {
    if (Array.isArray(type)) return type.includes(v);
    switch (type) {
      case 'number': return typeof v === 'number' && isFinite(v) && v >= 0 && v <= 1000;
      case 'numberOrNull': return v === null || (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 60);
      case 'boolean': return typeof v === 'boolean';
      case 'string': return typeof v === 'string' && v.length <= 2000;
      case 'strings': return Array.isArray(v) && v.every(x => typeof x === 'string' && x.length <= 100);
      case 'emails': return Array.isArray(v) && v.every(x => typeof x === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
      case 'days': return Array.isArray(v) && v.every(x => Number.isInteger(x) && x >= 0 && x <= 6);
      default: return false;
    }
  };

  /**
   * Reads a settings file: { "jobTrackerSettings": 1, "profile": {…}, "templates": { cover: { body }, … } }.
   * Returns what to apply and what was skipped, or throws when the file is not a settings file.
   */
  function readSettings(data) {
    if (!data || typeof data !== 'object' || !data.jobTrackerSettings) {
      if (data && Array.isArray(data.apps)) throw new Error('this is a backup of applications: restore it on the Data page');
      throw new Error('not a Job Tracker settings file');
    }
    const profile = {}, skipped = [];
    Object.entries(data.profile || {}).forEach(([k, v]) => {
      if (PROFILE_KEYS[k] && ok(PROFILE_KEYS[k], v)) profile[k] = k === 'gmailAccounts' ? v.map(x => x.toLowerCase()) : v;
      else skipped.push(k);
    });
    if (profile.workDays && profile.workDays.length && profile.daysPerWeek == null) profile.daysPerWeek = profile.workDays.length;
    const templates = {};
    Object.entries(data.templates || {}).forEach(([k, v]) => {
      if (!DEFAULTS[k] || !v || typeof v !== 'object') { skipped.push('templates.' + k); return; }
      const t = {};
      if (typeof v.body === 'string' && v.body.length <= 8000) t.body = v.body;
      if (typeof v.subject === 'string' && v.subject.length <= 300) t.subject = v.subject;
      if (Object.keys(t).length) templates[k] = t; else skipped.push('templates.' + k);
    });
    return { profile, templates, skipped };
  }

  const api = { DEFAULTS, ORDER, merge, fill, leftovers, readSettings, PROFILE_KEYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_Templates = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
