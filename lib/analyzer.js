/* Job Tracker — offline job description analyser (no network calls). */
(function (root) {
  'use strict';

  // Dictionary of tools and skills. Profile level: 'strong' | 'basic' | 'none'
  const TOOLS = [
    // Microsoft
    { name: 'Active Directory', group: 'Microsoft', re: /\bactive directory\b|\bAD ?DS\b|\bADUC\b/i },
    { name: 'Entra ID / Azure AD', group: 'Microsoft', re: /\bentra( id)?\b|\bazure ad\b|\bazure active directory\b/i },
    { name: 'Microsoft 365', group: 'Microsoft', re: /\bmicrosoft 365\b|\boffice ?365\b|\bo365\b|\bm365\b/i },
    { name: 'Exchange', group: 'Microsoft', re: /\bExchange\b(?! rate)|\bexchange (online|server)\b/ },
    { name: 'Outlook', group: 'Microsoft', re: /\bOutlook\b/ },
    { name: 'Microsoft Teams', group: 'Microsoft', re: /\b(microsoft|ms) teams\b/i },
    { name: 'SharePoint / OneDrive', group: 'Microsoft', re: /\bsharepoint\b|\bonedrive\b/i },
    { name: 'Microsoft Office', group: 'Microsoft', re: /\b(microsoft|ms) office\b|\bexcel\b/i },
    { name: 'Intune', group: 'Microsoft', re: /\bintune\b|\bendpoint manager\b/i },
    { name: 'SCCM / MECM', group: 'Microsoft', re: /\bsccm\b|\bmecm\b|\bconfiguration manager\b/i },
    { name: 'Group Policy', group: 'Microsoft', re: /\bgroup polic(y|ies)\b|\bGPOs?\b/i },
    { name: 'Windows Server', group: 'Microsoft', re: /\bwindows server\b/i },
    { name: 'PowerShell', group: 'Microsoft', re: /\bpowershell\b/i },
    { name: 'Azure', group: 'Cloud', re: /\bazure\b(?!\s*(ad|active directory))/i },
    { name: 'AWS', group: 'Cloud', re: /\baws\b|\bamazon web services\b/i },
    { name: 'Google Workspace', group: 'Cloud', re: /\bg ?suite\b|\bgoogle workspace\b/i },
    // OS and devices
    { name: 'Windows 10/11', group: 'OS and devices', re: /\bwindows\b(?!\s*server)/i },
    { name: 'macOS', group: 'OS and devices', re: /\bmac ?os\b|\bos x\b|\bmacbooks?\b|\bapple (devices|mac)/i },
    { name: 'Jamf', group: 'OS and devices', re: /\bjamf\b/i },
    { name: 'Linux', group: 'OS and devices', re: /\blinux\b|\bubuntu\b|\bdebian\b|\bred ?hat\b|\brhel\b/i },
    { name: 'iOS / Android', group: 'OS and devices', re: /\bios\b|\bandroid\b|\bmobile devices?\b|\bsmartphones?\b/i },
    { name: 'ChromeOS', group: 'OS and devices', re: /\bchrome ?os\b|\bchromebooks?\b/i },
    { name: 'Hardware', group: 'OS and devices', re: /\bhardware\b/i },
    { name: 'Printers', group: 'OS and devices', re: /\bprinters?\b|\bprinting\b/i },
    { name: 'Peripherals', group: 'OS and devices', re: /\bperipherals?\b/i },
    { name: 'Imaging / Deployment', group: 'OS and devices', re: /\bimaging\b|\bdevice (deployment|provisioning)\b|\bbuilding (laptops|pcs|machines)\b/i },
    { name: 'AV / Audio-Visual', group: 'OS and devices', re: /\baudio[- ]?visual\b|\bAV (equipment|support)\b/i },
    // Networking
    { name: 'TCP/IP', group: 'Networking', re: /\btcp\/?ip\b/i },
    { name: 'DNS', group: 'Networking', re: /\bdns\b/i },
    { name: 'DHCP', group: 'Networking', re: /\bdhcp\b/i },
    { name: 'VPN', group: 'Networking', re: /\bvpns?\b/i },
    { name: 'Wi-Fi', group: 'Networking', re: /\bwi-?fi\b|\bwireless\b/i },
    { name: 'LAN / WAN', group: 'Networking', re: /\blan\b|\bwan\b/i },
    { name: 'Switches / Routers', group: 'Networking', re: /\bswitch(es|ing)\b|\brouters?\b|\brouting\b/i },
    { name: 'Firewalls', group: 'Networking', re: /\bfirewalls?\b/i },
    { name: 'Cisco', group: 'Networking', re: /\bcisco\b|\bmeraki\b/i },
    { name: 'VoIP / Telephony', group: 'Networking', re: /\bvoip\b|\btelephony\b|\b3cx\b/i },
    // Service desk
    { name: 'ITIL', group: 'Service desk', re: /\bitil\b/i },
    { name: 'ServiceNow', group: 'Service desk', re: /\bservice ?now\b/i },
    { name: 'Jira', group: 'Service desk', re: /\bjira\b/i },
    { name: 'Zendesk', group: 'Service desk', re: /\bzendesk\b/i },
    { name: 'Freshdesk / Freshservice', group: 'Service desk', re: /\bfresh(desk|service)\b/i },
    { name: 'ConnectWise / Autotask', group: 'Service desk', re: /\bconnectwise\b|\bautotask\b|\bdatto\b|\bhalo ?(psa|itsm)\b/i },
    { name: 'osTicket', group: 'Service desk', re: /\bosticket\b/i },
    { name: 'Ticketing', group: 'Service desk', re: /\btickets?\b|\bticketing\b/i },
    { name: 'SLA', group: 'Service desk', re: /\bslas?\b|\bservice level/i },
    { name: 'Documentation / KB', group: 'Service desk', re: /\bknowledge base\b|\bdocumentation\b|\bknowledge articles?\b/i },
    { name: 'Remote support', group: 'Service desk', re: /\bremote (support|assistance|access|desktop)\b|\brdp\b/i },
    { name: 'TeamViewer', group: 'Service desk', re: /\bteamviewer\b/i },
    { name: 'AnyDesk', group: 'Service desk', re: /\banydesk\b/i },
    { name: 'Customer service', group: 'Service desk', re: /\bcustomer[- ](service|facing|focused)\b|\bclient[- ]facing\b/i },
    // Virtualisation and security
    { name: 'VMware', group: 'Virtualisation', re: /\bvmware\b|\besxi\b|\bvsphere\b/i },
    { name: 'Hyper-V', group: 'Virtualisation', re: /\bhyper-?v\b/i },
    { name: 'Proxmox', group: 'Virtualisation', re: /\bproxmox\b/i },
    { name: 'Citrix', group: 'Virtualisation', re: /\bcitrix\b/i },
    { name: 'Virtualisation', group: 'Virtualisation', re: /\bvirtuali[sz]ation\b|\bvirtual machines?\b/i },
    { name: 'Antivirus / EDR', group: 'Security', re: /\banti-?virus\b|\bantimalware\b|\bedr\b|\bdefender\b|\bsophos\b|\bcrowdstrike\b/i },
    { name: 'MFA', group: 'Security', re: /\bmfa\b|\bmulti-?factor\b|\b2fa\b|\btwo-?factor\b/i },
    { name: 'Backups', group: 'Security', re: /\bbackups?\b|\bback-?ups?\b/i },
    // Code
    { name: 'Python', group: 'Scripting and code', re: /\bpython\b/i },
    { name: 'Bash', group: 'Scripting and code', re: /\bbash\b|\bshell script/i },
    { name: 'SQL', group: 'Scripting and code', re: /\bsql\b/i },
    { name: 'Git', group: 'Scripting and code', re: /\bgit\b|\bgithub\b/i },
    // Certifications
    { name: 'CompTIA A+', group: 'Certifications', re: /\b(comptia\s*)?a\+(?!\+)/i },
    { name: 'CompTIA Network+', group: 'Certifications', re: /\bnetwork\+/i },
    { name: 'CompTIA Security+', group: 'Certifications', re: /\bsecurity\+/i },
    { name: 'Microsoft certifications', group: 'Certifications', re: /\bms-900\b|\bmd-10[02]\b|\baz-900\b|\bmicrosoft certified\b/i },
    { name: 'CCNA', group: 'Certifications', re: /\bccna\b/i },
  ];

  // Skill levels start empty: each user sets their own in Settings
  const DEFAULT_SKILLS = {};

  const DEFAULT_PROFILE = {
    skills: DEFAULT_SKILLS,
    hasDrivingLicence: false,
    daysPerWeek: 4,
    hoursPerWeek: 32,
    languages: [], // languages besides English, e.g. ['Ukrainian', 'Polish']
    autoDetect: true,
    showPreview: true,
    penalizeSchedule: false,
    listScan: true,
    signName: '', signPhone: '', signLinkedIn: '', mailClient: 'gmail',
    areas: [],
  };

  const CATEGORIES = [
    { name: 'IT Help Desk / Service Desk', re: /\b(help ?desk|service ?desk|1st[- ]line|first[- ]line|2nd[- ]line|second[- ]line|it support|technical support|support analyst|support technician|support engineer|desktop support|end[- ]user support)\b/i },
    { name: 'IT Technician / Field Support', re: /\b(it technician|it apprentice(ship)?|field (engineer|technician)|deskside|onsite support|it assistant|computer technician)\b/i },
    { name: 'Systems / Infrastructure', re: /\b(systems? (administrator|engineer|admin)|infrastructure|sysadmin|3rd[- ]line|third[- ]line)\b/i },
    { name: 'Network Engineer', re: /\bnetwork (engineer|technician|administrator|analyst)\b|\bnoc\b/i },
    { name: 'Cyber Security', re: /\b(cyber|security analyst|soc analyst|information security)\b/i },
    { name: 'Cloud / DevOps', re: /\b(devops|cloud engineer|site reliability|sre|platform engineer)\b/i },
    { name: 'Software Developer', re: /\b(software|web|front[- ]?end|back[- ]?end|full[- ]?stack|python|java(script)?|\.net|mobile) (developer|engineer)\b|\bdeveloper\b|\bprogrammer\b/i },
    { name: 'Data / Analyst', re: /\b(data (analyst|engineer|scientist)|business analyst|bi analyst)\b/i },
    { name: 'AI / Machine Learning', re: /\b(machine learning|ml engineer|ai engineer|artificial intelligence)\b/i },
    { name: 'QA / Testing', re: /\b(qa|quality assurance|test(er| analyst| engineer))\b/i },
  ];
  const CATEGORY_NAMES = CATEGORIES.map(c => c.name).concat(['Other']);

  const WORK_TYPES = ['Full-time', 'Part-time', 'Permanent', 'Contract', 'Temporary', 'Remote', 'Hybrid', 'On-site', 'Apprenticeship', 'Graduate / Placement'];
  const WORK_TYPE_RE = {
    'Full-time': /\bfull[- ]?time\b|\bFULL_TIME\b/i,
    'Part-time': /\bpart[- ]?time\b|\bPART_TIME\b/i,
    'Permanent': /\bpermanent\b/i,
    'Contract': /\bcontract(or)?\b|\bfixed[- ]term\b|\bCONTRACTOR\b/i,
    'Temporary': /\btemporary\b|\btemp\b|\bTEMPORARY\b/i,
    'Remote': /\bremote(ly)?\b|\bwork from home\b|\bwfh\b|\bTELECOMMUTE\b/i,
    'Hybrid': /\bhybrid\b/i,
    'On-site': /\bon[- ]?site\b|\bin[- ]office\b|\boffice[- ]based\b/i,
    'Apprenticeship': /\bapprentice(ship)?\b/i,
    'Graduate / Placement': /\bgraduate\b|\bplacement\b|\binternship\b|\bintern\b/i,
  };

  const STATUSES = [
    { id: 'applied', label: 'Applied', color: '#5a6b7d' },
    { id: 'screening', label: 'Screening', color: '#1f7fb0' },
    { id: 'test', label: 'Test task', color: '#3a6fd0' },
    { id: 'interview1', label: 'Interview 1', color: '#7a4fc0' },
    { id: 'interview2', label: 'Interview 2', color: '#6a3fb3' },
    { id: 'interview3', label: 'Interview 3', color: '#5a31a0' },
    { id: 'offer', label: 'Offer', color: '#23905a' },
    { id: 'accepted', label: 'Offer accepted', color: '#157a45' },
    { id: 'declined', label: 'Offer declined', color: '#8a9a5b' },
    { id: 'rejected', label: 'Rejected', color: '#c0463b' },
    { id: 'noresponse', label: 'No response', color: '#9aa3ad' },
    { id: 'withdrawn', label: 'Withdrawn', color: '#b3a58c' },
  ];
  const RESPONDED = ['screening', 'test', 'interview1', 'interview2', 'interview3', 'offer', 'accepted', 'declined', 'rejected'];
  const INTERVIEW = ['test', 'interview1', 'interview2', 'interview3', 'offer', 'accepted', 'declined'];
  const OFFER = ['offer', 'accepted', 'declined'];

  function extractTools(text) {
    if (!text) return [];
    return TOOLS.filter(t => t.re.test(text)).map(t => t.name);
  }

  function detectWorkTypes(text) {
    if (!text) return [];
    let r = WORK_TYPES.filter(w => WORK_TYPE_RE[w].test(text));
    if (r.includes('On-site') && (r.includes('Hybrid') || r.includes('Remote'))) r = r.filter(w => w !== 'On-site');
    return r;
  }

  function detectCategory(title, text) {
    for (const c of CATEGORIES) if (c.re.test(title || '')) return c.name;
    for (const c of CATEGORIES) if (c.re.test((text || '').slice(0, 1500))) return c.name;
    return 'Other';
  }

  function num(s) { return s ? parseFloat(String(s).replace(/,/g, '')) : NaN; }

  function parseSalary(text, strict) {
    if (!text) return null;
    if (strict) return parseSalaryStrict(text);
    const re = /£\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k)?(?:\s*(?:-|–|—|to)\s*£?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k)?)?\s*(per\s+(hour|annum|year|day|week|month)|an? (hour|year|day)|p\/?h\b|ph\b|p\.?a\.?\b|\/\s?(hr|hour|year|yr|day))?/i;
    const m = text.match(re);
    if (!m) return null;
    let min = num(m[1]) * (m[2] ? 1000 : 1);
    let max = m[3] ? num(m[3]) * (m[4] || m[2] ? 1000 : 1) : min;
    if (m[3] && !m[4] && m[2] && max < 1000) max = max * 1000;
    let unit = (m[5] || '').toLowerCase();
    let period;
    if (/hour|hr|p\/?h|ph/.test(unit)) period = 'hour';
    else if (/day/.test(unit)) period = 'day';
    else if (/week/.test(unit)) period = 'week';
    else if (/month/.test(unit)) period = 'month';
    else if (/annum|year|yr|p\.?a/.test(unit)) period = 'year';
    else period = max < 100 ? 'hour' : max < 1000 ? 'day' : 'year';
    const mult = { hour: 37.5 * 52, day: 5 * 52, week: 52, month: 12, year: 1 }[period];
    return { text: m[0].trim(), min, max, period, annualMin: Math.round(min * mult), annualMax: Math.round(max * mult) };
  }

  // In free text, only take an amount when pay-related words are nearby
  const PAY_CTX = /salary|pay\b|paid|per annum|per year|a year|p\.?a\.?\b|per hour|an hour|\/ ?(yr|hr|hour|year)|hourly|package|\bote\b|compensation|wage|rate|\bdoe\b|depending on experience|dependent on experience|\bneg\b|negotiable/i;
  const NOT_PAY = /revenue|turnover|million|\bbn\b|billion|funding|raised|premium|claims|budget of|worth|valued|investment|insur(ed|ance) (limit|cover)|bonus/i;
  function parseSalaryStrict(text) {
    const re = /£\s?\d[\d,.]*\s?k?(?:\s*(?:-|–|—|to)\s*£?\s?\d[\d,.]*\s?k?)?[^\n£]{0,25}/gi;
    let m;
    while ((m = re.exec(text))) {
      const start = Math.max(text.lastIndexOf('\n', m.index), text.lastIndexOf('. ', m.index), m.index - 90);
      let end = text.slice(m.index).search(/\n|\. [A-Z]/);
      end = end < 0 ? text.length : m.index + end;
      const sentence = text.slice(Math.max(0, start), Math.min(end + 1, m.index + 140));
      if (!PAY_CTX.test(sentence) || NOT_PAY.test(sentence)) continue;
      const p = parseSalary(text.slice(m.index, m.index + 80));
      if (p && p.annualMax >= 8000 && p.annualMax <= 250000) return p;
    }
    return null;
  }

  const DETAIL_RE = /\b(essential|required|requirement|must|minimum|at least|\d+\+?\s*(years?|yrs)|experience (of|with|in)|driving licen[cs]e|full uk licen[cs]e|own (car|transport)|dbs|security clearance|sc clearance|\bsc\b cleared|bpss|on-?call|shifts?|rota|weekends?|evenings|travel(ling)? (to|between|across)|degree|certification|certified|qualification|sponsorship|visa|right to work|hours|monday|mon ?- ?fri|salary|bonus|pension|holiday|annual leave|training|progression|career development|probation|start date|immediate start|interview)\b/i;

  function extractDetails(text) {
    if (!text) return [];
    const parts = text
      .split(/\n+|(?<=[.!?])\s+(?=[A-Z•\-])|•|·|\u2022/)
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(s => s.length > 12 && s.length < 400);
    const out = [];
    const seen = new Set();
    for (const p of parts) {
      if (!DETAIL_RE.test(p)) continue;
      const key = p.toLowerCase().slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p.length > 240 ? p.slice(0, 237) + '…' : p);
      if (out.length >= 14) break;
    }
    return out;
  }

  // Basics that appear in almost every entry-level ad weigh less
  const COMMON = new Set(['Windows 10/11', 'Ticketing', 'Customer service', 'Hardware', 'Documentation / KB', 'Microsoft Office', 'Outlook', 'Printers', 'Peripherals', 'Remote support', 'SLA']);
  const DES_CTX = /\b(desirable|advantage|advantageous|beneficial|nice to have|a plus|is a bonus|ideally|preferred|would be good|familiarity|exposure to|awareness of|any of)\b/i;
  const REQ_CTX = /\b(essential|must|required|requirement|proven|strong|solid|extensive|in-depth|expert|demonstrable)\b/i;

  // ---------- Splitting the description into sections ----------
  const SEC_HEAD = [
    ['des', /\b(desirable|nice[- ]to[- ]have|bonus points|would be (a )?(plus|advantage|beneficial)|preferred (skills|experience)|advantageous)\b/i],
    ['ben', /\b(benefits?|what (you'?ll|you will|we) (get|offer|receive)|what'?s in it for you|perks|rewards?|our offer|package|in return|why (join|work for) us|we offer)\b/i],
    ['req', /\b(requirements?|what we'?re looking for|who we'?re looking for|about you|you will (have|need|bring)|you'?ll (have|need|bring)|skills( and| &)? (experience|knowledge)|essential|qualifications?|experience required|key skills|the ideal candidate|person specification|what you('?ll)? need|to be successful|you should have)\b/i],
    ['resp', /\b(responsibilit(y|ies)|what you'?ll be doing|what you will be doing|the role|your role|duties|day[- ]to[- ]day|key tasks|main tasks|role overview|job purpose|you will be)\b/i],
  ];
  const BEN_LINE = /\b(\d{2}\s*days?'?\s*(annual leave|holiday)|holiday|annual leave|pension|bonus|private (medical|health)|health(care| cash| insurance)|dental|life (insurance|assurance)|income protection|sick pay|gym|cycle[- ]to[- ]work|discounts?|employee assistance|eap\b|wellbeing|well-being|hybrid working|flexible working|work from home|remote working|training budget|paid (training|certifications?)|certifications? (paid|funded)|career (progression|development)|share (scheme|options)|season ticket|free (lunch|breakfast|parking|food)|parking|birthday|volunteering|charity days?|enhanced (maternity|paternity|parental)|company car|car allowance|electric vehicle|ev scheme|tech scheme)\b/i;

  function splitLines(text) {
    const out = [];
    String(text || '').replace(/\r/g, '').split(/\n+/).forEach(raw => {
      // One line can hold several bullet points separated by '•'
      raw.split(/\s[•·▪●◦■]\s/).forEach((piece, i) => {
        const bullet = i > 0 || /^\s*[•·▪●◦■*\-–—]\s*/.test(piece);
        const t = piece.replace(/^[\s*\-–—•·▪●◦■]+/, '').replace(/\s+/g, ' ').trim();
        if (t.length > 2) out.push({ t, bullet });
      });
    });
    return out;
  }

  function isHeading(l) {
    if (l.bullet || l.t.length > 60) return false;
    const words = l.t.replace(/:$/, '').split(/\s+/).length;
    if (words > 8 || /[.;!?]$/.test(l.t)) return false;
    const head = l.t.replace(/:.*$/, '');
    return SEC_HEAD.some(([, re]) => re.test(head)) && (l.t.endsWith(':') || words <= 6);
  }

  function parseSections(text) {
    const out = [];
    let cur = 'other';
    for (const l of splitLines(text)) {
      if (isHeading(l)) {
        const head = l.t.replace(/:.*$/, '');
        cur = (SEC_HEAD.find(([, re]) => re.test(head)) || [cur])[0];
        continue;
      }
      // 'Heading: text' on a single line
      const m = !l.bullet && l.t.match(/^([^:]{3,40}):\s+(.{12,})$/);
      if (m && SEC_HEAD.some(([, re]) => re.test(m[1]))) {
        cur = SEC_HEAD.find(([, re]) => re.test(m[1]))[0];
        out.push({ text: m[2], sec: cur });
        continue;
      }
      out.push({ text: l.t, sec: cur });
    }
    return out;
  }

  function extractSections(text) {
    const parts = parseSections(text);
    const ok = p => p.text.length > 8 && p.text.length < 300;
    // 'Desirable' items found in the requirements list move to 'Nice to have'
    const req = parts.filter(p => p.sec === 'req' && ok(p));
    const requirements = req.filter(p => !DES_CTX.test(p.text)).map(p => p.text).slice(0, 12);
    const desirable = parts.filter(p => p.sec === 'des' && ok(p)).map(p => p.text).concat(req.filter(p => DES_CTX.test(p.text)).map(p => p.text)).slice(0, 8);
    const responsibilities = parts.filter(p => p.sec === 'resp' && ok(p)).map(p => p.text).slice(0, 8);
    let benefits = parts.filter(p => p.sec === 'ben' && ok(p)).map(p => p.text).slice(0, 12);
    if (!benefits.length) {
      const seen = new Set();
      benefits = splitLines(text).map(l => l.t).filter(l => l.length < 220 && BEN_LINE.test(l)).filter(l => { const k = l.slice(0, 40).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
    }
    return { requirements, desirable, responsibilities, benefits };
  }

  function buildNotes(sec) {
    const block = (h, arr) => arr.length ? h + ':\n' + arr.map(x => '• ' + x).join('\n') : '';
    return [block('Requirements', sec.requirements), block('Nice to have', sec.desirable), block('Responsibilities', sec.responsibilities)].filter(Boolean).join('\n\n');
  }

  // ---------- Fit score ----------
  // Similar tools: knowing one tool in a group gives partial credit for the others
  const SIMILAR = [
    ['osTicket', 'ServiceNow', 'Jira', 'Zendesk', 'Freshdesk / Freshservice', 'ConnectWise / Autotask'],
    ['Proxmox', 'VMware', 'Hyper-V', 'Virtualisation', 'Citrix'],
    ['TeamViewer', 'AnyDesk', 'Remote support'],
    ['Intune', 'SCCM / MECM', 'Jamf'],
    ['Active Directory', 'Entra ID / Azure AD'],
  ];
  function similarCredit(name, skills) {
    const g = SIMILAR.find(x => x.includes(name));
    if (!g) return 0;
    const best = g.filter(x => x !== name).map(x => skills[x]).reduce((m, l) => Math.max(m, l === 'strong' ? 0.5 : l === 'basic' ? 0.3 : 0), 0);
    return best;
  }

  function toolWeights(title, text) {
    const parts = parseSections(text);
    const tools = extractTools((title || '') + '\n' + (text || ''));
    return tools.map(t => {
      const re = TOOLS.find(x => x.name === t).re;
      const lines = parts.filter(p => re.test(p.text));
      let ctx = 1;
      if (lines.length) {
        const ws = lines.map(p => (p.sec === 'des' || DES_CTX.test(p.text)) ? 0.5 : (p.sec === 'req' || REQ_CTX.test(p.text)) ? 1.5 : 1);
        ctx = Math.max(...ws);
      }
      return { name: t, w: (COMMON.has(t) ? 0.5 : 1) * ctx, desirable: ctx === 0.5 };
    });
  }

  function computeChance(title, text, workTypes, profile, location) {
    profile = profile || DEFAULT_PROFILE;
    const skills = profile.skills || {};
    const full = (title || '') + '\n' + (text || '');
    const low = full.toLowerCase();
    const reasons = [];
    const add = (cond, delta, t) => { if (cond) reasons.push({ text: t, delta }); return cond ? delta : 0; };

    // 1. Skills: up to 50 points, weighted by how important each tool is in the ad
    const tw = toolWeights(title, text);
    const matched = [], basic = [], missing = [], similar = [];
    let got = 0, total = 0;
    tw.forEach(({ name, w }) => {
      const lvl = skills[name] || 'none';
      total += w;
      if (lvl === 'strong') { matched.push(name); got += w; }
      else if (lvl === 'basic') { basic.push(name); got += w * 0.6; }
      else {
        const sim = similarCredit(name, skills);
        if (sim) { basic.push(name); similar.push(name); got += w * sim; }
        else missing.push(name);
      }
    });
    const tools = tw.map(x => x.name);
    const keyMissing = tw.filter(x => missing.includes(x.name) && x.w >= 1.5).map(x => x.name);
    let skillPts;
    if (tools.length < 3) skillPts = 28 + (total ? Math.round(12 * got / total) : 0);
    else skillPts = Math.round(50 * got / total);
    reasons.push({ text: tools.length < 3 ? `Skills: few tools named in the ad (${tools.length}), rough estimate` : `Skills: ${Math.round(100 * got / total)}% match, weighted by importance`, delta: skillPts, max: 50 });
    if (similar.length) reasons.push({ text: `Partial credit for similar experience: ${similar.join(', ')}`, delta: 0 });
    if (keyMissing.length) reasons.push({ text: `Required but missing: ${keyMissing.join(', ')}`, delta: 0 });

    // 2. Seniority: up to 20
    const lt = (title || '').toLowerCase();
    const cat = detectCategory(title, text);
    let levelPts, levelText, senior = false;
    const target = cat === 'IT Help Desk / Service Desk' || cat === 'IT Technician / Field Support';
    const entryWords = /\b(1st[- ]line|first[- ]line|junior|graduate|trainee|apprentice|entry[- ]level|assistant)\b/;
    if (/\b(senior|lead|manager|head of|principal|architect|3rd[- ]line|third[- ]line|team leader)\b/.test(lt)) { levelPts = 0; levelText = 'Level: senior / lead / 3rd line'; senior = true; }
    else if (!target) { levelPts = entryWords.test(lt) ? 8 : 3; levelText = `Area: ${cat} is not one of your target roles`; }
    else if (entryWords.test(lt)) { levelPts = 20; levelText = 'Level: entry / 1st line, matches yours'; }
    else if (/\b(2nd[- ]line|second[- ]line|1st\/2nd|first\/second)\b/.test(lt)) { levelPts = 13; levelText = 'Level: 2nd line, doable but more competition'; }
    else if (/\b(1st[- ]line|first[- ]line|entry[- ]level|junior)\b/i.test(String(text || '').slice(0, 1500))) { levelPts = 18; levelText = 'Level: 1st line according to the description'; }
    else { levelPts = 16; levelText = 'Level: IT support, line not stated'; }
    reasons.push({ text: levelText, delta: levelPts, max: 20 });

    // 3. Experience: up to 15
    let years = 0;
    const yrRe = /(\d{1,2})\s*\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs)(?:'|’)?\s*(?:of\s+)?(?:\w+\s+){0,4}?(?:experience|exp)\b/gi;
    let ym;
    while ((ym = yrRe.exec(low))) years = Math.max(years, parseInt(ym[1], 10));
    const noExp = /\bno (previous |prior )?experience (is )?(required|necessary|needed)|full training (is )?(provided|given)|we will train you|training will be provided\b/i.test(low);
    let expPts, expText;
    if (noExp) { expPts = 15; expText = 'Experience: not required, training provided'; }
    else if (!years) { expPts = 12; expText = 'Experience: years not stated'; }
    else if (years <= 1) { expPts = 15; expText = `Experience: ${years} year, you have it`; }
    else if (years === 2) { expPts = 9; expText = 'Experience: 2 years, lean on your project and freelance work'; }
    else if (years <= 4) { expPts = 3; expText = `Experience: ${years}+ years, above yours`; }
    else { expPts = 0; expText = `Experience: ${years}+ years, well above yours`; }
    reasons.push({ text: expText, delta: expPts, max: 15 });

    // 4. Hard constraints
    let pen = 0, outArea = false;
    pen += add(!profile.hasDrivingLicence && /(full|valid|clean)?\s*(uk )?driving licen[cs]e|own (car|transport|vehicle)/i.test(low) && /(essential|required|must)/i.test(low), -10, 'Driving licence / own car required');
    pen += add(/\b(sc|dv|security) clearance\b|\bsc cleared\b|\bnppv\b|\bdv cleared\b/i.test(low), -12, 'Security clearance (SC/DV) required');
    pen += add(/\bdegree\b[^.]{0,40}\b(required|essential)\b/i.test(low), -4, 'Completed degree required');

    const wt = workTypes && workTypes.length ? workTypes : detectWorkTypes(full);
    const loc = String(location || '').trim();
    const isRemote = wt.includes('Remote') && !wt.includes('Hybrid') && !wt.includes('On-site');
    const localOnly = /(only|solely) (accepting|considering) (applications|candidates) from (candidates )?(based|living|located)|candidates (must be )?(based|living|located) (within|in|near) (this|the) (area|locality|region)|must (live|reside|be based) (within|in|near|locally)|local candidates only/i.test(low);
    const areas = (profile.areas || []).map(a => a.toLowerCase()).filter(Boolean);
    const vague = !loc || /^(united kingdom|uk|england|great britain|gb|remote)$/i.test(loc);
    const inArea = areas.some(a => loc.toLowerCase().includes(a));
    if (!isRemote && !vague && areas.length && !inArea) {
      pen += add(true, -12, `Location "${loc}" is outside your areas`); outArea = true;
      pen += add(localOnly, -8, 'Local candidates only');
    } else if (localOnly && !inArea) add(true, 0, 'Local candidates only: check where the office is');

    // 5. Bonuses
    let bonus = 0;
    const partOk = wt.includes('Part-time') || /\bflexible (hours|working)\b|\b4[- ]day\b|\bfour[- ]day\b|\bcompressed hours\b/i.test(low);
    bonus += add((profile.daysPerWeek || 5) < 5 && partOk, 5, 'Flexible / part-time hours');
    const langs = (profile.languages || []).filter(l => l && !/^english$/i.test(l));
    const askedLang = langs.find(l => new RegExp('\\b' + l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(low));
    bonus += add(!!askedLang, 5, `Asks for ${askedLang}, which you speak`);
    const fullTimeOnly = (profile.daysPerWeek || 5) < 5 && !partOk && (wt.includes('Full-time') || /\bmonday to friday\b|\bmon\s*-\s*fri\b|37\.5 hours|40 hours/i.test(low));
    pen += add(fullTimeOnly, profile.penalizeSchedule ? -8 : 0, 'Full-time Mon–Fri: discuss hours at interview');
    add(/\bcomptia a\+|\ba\+ (cert|qualif)/i.test(low) && skills['CompTIA A+'] !== 'strong', 0, 'Mentions CompTIA A+: say when you sit the exam');

    let score = skillPts + levelPts + expPts + pen + bonus;
    score = Math.max(3, Math.min(97, Math.round(score)));
    const label = score >= 70 ? 'High' : score >= 50 ? 'Medium' : score >= 30 ? 'Low' : 'Very low';
    return { score, label, tools, matched, basic, missing, similar, keyMissing, reasons, lowData: tools.length < 3, senior, outArea };
  }

  function analyze(job, profile) {
    const text = [job.description || '', job.extraText || ''].join('\n');
    const full = (job.title || '') + '\n' + text;
    const workTypes = job.workTypes && job.workTypes.length ? job.workTypes : detectWorkTypes(full + ' ' + (job.employmentType || ''));
    const salary = job.salaryText ? parseSalary(job.salaryText) || { text: job.salaryText } : parseSalary(text, true);
    const sections = extractSections(job.description || '');
    return {
      workTypes,
      category: job.category || detectCategory(job.title, text),
      salary,
      details: extractDetails(text),
      sections,
      notes: buildNotes(sections),
      benefits: sections.benefits,
      chance: computeChance(job.title, job.description || '', workTypes, profile, job.location),
    };
  }

  const api = {
    TOOLS, DEFAULT_PROFILE, DEFAULT_SKILLS, CATEGORY_NAMES, WORK_TYPES, STATUSES,
    RESPONDED, INTERVIEW, OFFER,
    extractTools, detectWorkTypes, detectCategory, parseSalary, extractDetails, computeChance, analyze, extractSections, buildNotes,
    statusLabel: id => (STATUSES.find(s => s.id === id) || { label: id }).label,
    statusColor: id => (STATUSES.find(s => s.id === id) || { color: '#999' }).color,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_Analyzer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
