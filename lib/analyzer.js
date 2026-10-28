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
    { name: 'GCP', group: 'Cloud', re: /\bgcp\b|\bgoogle cloud( platform)?\b/i },
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
    // Software development
    { name: 'JavaScript', group: 'Software development', re: /\bjavascript\b|\bes6\b/i },
    { name: 'TypeScript', group: 'Software development', re: /\btypescript\b/i },
    { name: 'Java', group: 'Software development', re: /\bjava\b/i },
    { name: 'C# / .NET', group: 'Software development', re: /\bc#|\.net\b|\bdotnet\b/i },
    { name: 'C++', group: 'Software development', re: /\bc\+\+/i },
    { name: 'Go', group: 'Software development', re: /\bgolang\b/i },
    { name: 'HTML / CSS', group: 'Software development', re: /\bhtml5?\b|\bcss3?\b/i },
    { name: 'React', group: 'Software development', re: /\bReact(?:\.?js)?\b|\breact\.js\b|\breactjs\b/ },
    { name: 'Node.js', group: 'Software development', re: /\bnode\.?js\b/i },
    { name: 'Django', group: 'Software development', re: /\bdjango\b/i },
    { name: 'Flask', group: 'Software development', re: /\bflask\b/i },
    { name: 'FastAPI', group: 'Software development', re: /\bfast ?api\b/i },
    { name: 'REST APIs', group: 'Software development', re: /\brestful\b|\brest\s?apis?\b|\bapis\b|\bapi (design|development|integrations?)\b/i },
    { name: 'OOP', group: 'Software development', re: /\bobject[- ]oriented\b|\boop\b/i },
    { name: 'Algorithms & data structures', group: 'Software development', re: /\bdata structures\b|\balgorithms\b/i },
    { name: 'Unit testing', group: 'Software development', re: /\bunit tests?\b|\bunit testing\b|\bpytest\b|\bjest\b|\btest[- ]driven\b|\btdd\b|\bautomated tests?\b/i },
    { name: 'Agile / Scrum', group: 'Software development', re: /\bagile\b|\bscrum\b|\bkanban\b/i },
    { name: 'Docker', group: 'Software development', re: /\bdocker\b|\bcontaineri[sz]/i },
    { name: 'Kubernetes', group: 'Software development', re: /\bkubernetes\b|\bk8s\b/i },
    { name: 'CI/CD', group: 'Software development', re: /\bci\s?\/\s?cd\b|\bcontinuous integration\b|\bgithub actions\b|\bjenkins\b|\bgitlab ci\b/i },
    { name: 'PostgreSQL', group: 'Software development', re: /\bpostgres(ql)?\b/i },
    { name: 'MySQL', group: 'Software development', re: /\bmysql\b/i },
    { name: 'MongoDB', group: 'Software development', re: /\bmongo(db)?\b/i },
    // Data and AI
    { name: 'Machine learning', group: 'Data and AI', re: /\bmachine learning\b|\bml models?\b/i },
    { name: 'pandas', group: 'Data and AI', re: /\bpandas\b/i },
    { name: 'NumPy', group: 'Data and AI', re: /\bnumpy\b/i },
    { name: 'scikit-learn', group: 'Data and AI', re: /\bscikit[- ]learn\b|\bsklearn\b/i },
    { name: 'PyTorch', group: 'Data and AI', re: /\bpytorch\b/i },
    { name: 'TensorFlow', group: 'Data and AI', re: /\btensorflow\b|\bkeras\b/i },
    { name: 'Hugging Face', group: 'Data and AI', re: /\bhugging ?face\b/i },
    { name: 'LLMs / RAG', group: 'Data and AI', re: /\bllms?\b|\blarge language models?\b|\bretrieval[- ]augmented\b|\bgenerative ai\b|\bgenai\b|\bprompt engineering\b|\blangchain\b|\bvector (database|search|store)s?\b/i },
    { name: 'NLP', group: 'Data and AI', re: /\bnlp\b|\bnatural language processing\b/i },
    { name: 'Computer vision', group: 'Data and AI', re: /\bcomputer vision\b|\bopencv\b/i },
    { name: 'Spark', group: 'Data and AI', re: /\bpyspark\b|\bapache spark\b|\bspark (sql|streaming)\b/i },
    { name: 'Power BI / Tableau', group: 'Data and AI', re: /\bpower ?bi\b|\btableau\b/i },
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
    timeLimitedRtw: false, // right to work with an end date (Ukraine scheme, Graduate visa): some employers will not consider it
    experienceYears: 1, // years of relevant work experience you can show (freelance counts)
    commercialYears: null, // years in a paid IT job with an employer (not freelance); null = not set, experienceYears is used
    daysPerWeek: 4,
    workDays: [],      // days you can work, 0 = Monday … 6 = Sunday; empty = not set
    hoursPerWeek: 32,
    languages: [], // languages besides English, e.g. ['Ukrainian', 'Polish']
    targetCategories: [], // role types you are aiming for; empty means every role type counts
    autoDetect: true,
    autoNoResponseDays: 30, // 'Applied' with no reply for this long becomes 'No response'; 0 = never
    applyDefaults: { cover: 'none' }, // what the side panel pre-fills for a new application
    showPreview: true,
    penalizeSchedule: false,
    listScan: true,
    signName: '', signPhone: '', signLinkedIn: '', mailClient: 'gmail',
    areas: [],
    home: '',          // home town for the journey check; empty = the first town in areas
    maxCommuteKm: 50,  // straight-line distance; beyond it an office-based job asks about the journey
    // Internships are scored against a separate profile: their own skills (often from a
    // different CV), target roles and the placement rules set by the university.
    intern: {
      skills: {},
      targetCategories: [],   // empty means every role type counts
      priorityCategories: [], // role types you want most
      pitch: '', highlights: '',
      placement: {
        start: '', end: '',     // ISO dates of the placement period
        minWeeks: 0, minHours: 0, maxHours: 0, daysPerWeek: 0,
        overseasRemoteOnly: false, paidPreferred: false,
        deadlines: [],          // [{ label, date }]
      },
    },
  };

  const CATEGORIES = [
    { name: 'IT Help Desk / Service Desk', re: /\b(help ?desk|service ?desk|1st[- ]line|first[- ]line|2nd[- ]line|second[- ]line|it support|technical support|support analyst|support technician|support engineer|desktop (support|analyst|engineer|technician)|end[- ]user (support|computing)|euc (engineer|analyst|technician)|user support)\b/i },
    { name: 'IT Technician / Field Support', re: /\b(it technician|it apprentice(ship)?|field (engineer|technician)|deskside|onsite support|it assistant|computer technician|ict technician|ict support|ict assistant|ict apprentice|it engineer)\b/i },
    { name: 'Systems / Infrastructure', re: /\b(systems? (administrator|engineer|admin)|infrastructure|sysadmin|3rd[- ]line|third[- ]line)\b/i },
    { name: 'Network Engineer', re: /\bnetwork (engineer|technician|administrator|analyst)\b|\bnoc\b/i },
    { name: 'Cyber Security', re: /\b(cyber|security analyst|soc analyst|information security)\b/i },
    { name: 'Cloud / DevOps', re: /\b(devops|cloud engineer(ing)?|site reliability|sre|platform engineer(ing)?)\b/i },
    { name: 'Database Developer', re: /\b(database (developer|engineer|administrator)|dba|sql developer)\b/i },
    { name: 'Software Developer', re: /\b(software|web|front[- ]?end|back[- ]?end|full[- ]?stack|python|java(script)?|\.net|mobile) (developer|engineer(ing)?)\b|\bdeveloper\b|\bprogrammer\b|\bswe intern\b/i },
    { name: 'Data / Analyst', re: /\b(data (analyst|engineer|scientist)|business analyst|bi analyst)\b/i },
    { name: 'AI / Machine Learning', re: /\b(machine learning|ml engineer|ai engineer(ing)?|ai developer|artificial intelligence|data scientist|llm engineer)\b/i },
    { name: 'QA / Testing', re: /\b(qa|quality assurance|test(er| analyst| engineer))\b/i },
  ];
  const CATEGORY_NAMES = CATEGORIES.map(c => c.name).concat(['Other']);

  const WORK_TYPES = ['Full-time', 'Part-time', 'Permanent', 'Contract', 'Temporary', 'Remote', 'Hybrid', 'On-site', 'Apprenticeship', 'Graduate / Placement'];
  const WORK_TYPE_RE = {
    'Full-time': /\bfull[- ]?time\b|\bFULL_TIME\b/i,
    'Part-time': /\bpart[- ]?time\b|\bPART_TIME\b/i,
    'Permanent': /\bpermanent\b/i,
    'Contract': /\bcontract(or)?\b(?!\s*(type)?\s*:\s*permanent)|\bfixed[- ]term\b|\bCONTRACTOR\b/i,
    'Temporary': /\btemporary\b|\btemp\b|\bTEMPORARY\b/i,
    // 'remote' as a way of working, not 'remote locations' or 'remote support'
    'Remote': /\b(fully |100% )?remote(?=[\s,(/-]*(work|working|role|position|job|first|only|based|option|days?|$))|\bwork(ing)? (from home|remotely)\b|\bwfh\b|\bTELECOMMUTE\b|\bhome[- ]based\b/im,
    'Hybrid': /\bhybrid\b/i,
    'On-site': /\bon[- ]?site\b|\bin[- ]office\b|\boffice[- ]based\b|\bin person\b|\bbased (at|in) our (office|site)\b|\bpredominantly (office[- ])?based\b/i,
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

  // Towns and districts inside the areas people usually type, so 'Whitechapel' counts as London
  const AREA_PLACES = {
    london: 'london|city of london|westminster|camden|islington|hackney|tower hamlets|whitechapel|shoreditch|aldgate|liverpool street|moorgate|old street|farringdon|clerkenwell|barbican|holborn|covent garden|soho|mayfair|marylebone|fitzrovia|bloomsbury|euston|king\'?s cross|st pancras|paddington|bayswater|notting hill|kensington|chelsea|knightsbridge|belgravia|victoria|pimlico|vauxhall|kennington|oval|lambeth|waterloo|southwark|london bridge|bermondsey|borough|elephant and castle|blackfriars|temple|strand|charing cross|chancery lane|canary wharf|isle of dogs|docklands|poplar|mile end|bow|stratford|greenwich|woolwich|deptford|lewisham|peckham|dulwich|brixton|clapham|battersea|wandsworth|putney|wimbledon|merton|sutton|croydon|bromley|bexley|kingston upon thames|kingston|richmond|twickenham|teddington|hounslow|feltham|heathrow|west drayton|hayes|uxbridge|hillingdon|southall|ealing|acton|chiswick|brentford|hammersmith|fulham|shepherd\'?s bush|white city|earls court|wembley|harrow|brent|barnet|finchley|hendon|edgware|enfield|edmonton|tottenham|haringey|wood green|highgate|hampstead|kentish town|angel|walthamstow|waltham forest|leyton|leytonstone|ilford|redbridge|romford|havering|barking|dagenham|newham|east ham|canning town|park royal|morden|tooting|streatham|sydenham|catford|eltham|orpington',
    hertfordshire: 'hertfordshire|herts|watford|st albans|hemel hempstead|stevenage|hatfield|welwyn|hertford|ware|bishop\'?s stortford|sawbridgeworth|hitchin|letchworth|baldock|royston|harpenden|potters bar|borehamwood|elstree|cheshunt|hoddesdon|broxbourne|berkhamsted|tring|rickmansworth|bushey|radlett|kings langley|abbots langley',
    essex: 'essex|harlow|chelmsford|colchester|basildon|southend|brentwood|epping|loughton|stansted|saffron walden|braintree|witham|great dunmow|dunmow|waltham abbey|grays|thurrock|billericay|wickford|rayleigh|ongar',
    cambridgeshire: 'cambridgeshire|cambridge|ely|huntingdon|st neots|st ives|cambourne|histon|sawston|duxford',
  };
  const AREA_ALIAS = { herts: 'hertfordshire', cambridge: 'cambridgeshire', cambs: 'cambridgeshire', 'greater london': 'london' };
  const PLACE_RE = {};
  Object.entries(AREA_PLACES).forEach(([k, v]) => { PLACE_RE[k] = new RegExp(`\\b(${v})\\b`, 'i'); });
  /** Is a location string inside one of your areas? Uses the towns and London districts above and London postcodes. */
  function inAreas(loc, areas) {
    const l = String(loc || '').toLowerCase().replace(/\(\d+(\.\d+)? miles?\)/, '');
    if (!l.trim()) return false;
    return areas.some(a => {
      const k = AREA_ALIAS[a] || a;
      if (l.includes(a)) return true;
      if (PLACE_RE[k] && PLACE_RE[k].test(l)) return true;
      if (k === 'london' && /\b(EC|WC|E|N|NW|SE|SW|W)\d{1,2}[A-Z]?\b/.test(loc)) return true;
      return false;
    });
  }

  // Rough coordinates (lat, lon) of London districts and towns around it, for the journey check.
  // A place can be inside your areas and still be a long way from home: Orpington is 'London'.
  const PLACE_COORDS = {
    'city of london': [51.515, -0.092], 'london': [51.507, -0.128], westminster: [51.497, -0.137], camden: [51.539, -0.143], islington: [51.538, -0.099], hackney: [51.545, -0.055], 'tower hamlets': [51.520, -0.030], whitechapel: [51.519, -0.059], shoreditch: [51.526, -0.078], aldgate: [51.514, -0.075], 'liverpool street': [51.518, -0.082], moorgate: [51.519, -0.089], 'old street': [51.526, -0.088], farringdon: [51.520, -0.105], clerkenwell: [51.524, -0.106], barbican: [51.520, -0.098], holborn: [51.517, -0.120], 'covent garden': [51.512, -0.124], soho: [51.514, -0.136], mayfair: [51.511, -0.148], marylebone: [51.519, -0.150], fitzrovia: [51.519, -0.137], bloomsbury: [51.522, -0.126], euston: [51.528, -0.134], "king's cross": [51.531, -0.124], 'kings cross': [51.531, -0.124], 'st pancras': [51.530, -0.126], paddington: [51.516, -0.176], bayswater: [51.512, -0.188], 'notting hill': [51.509, -0.196], kensington: [51.499, -0.193], chelsea: [51.487, -0.169], knightsbridge: [51.501, -0.161], belgravia: [51.497, -0.153], victoria: [51.496, -0.144], pimlico: [51.489, -0.134], vauxhall: [51.486, -0.123], kennington: [51.488, -0.106], oval: [51.482, -0.112], lambeth: [51.495, -0.116], waterloo: [51.503, -0.113], southwark: [51.503, -0.090], 'london bridge': [51.505, -0.086], bermondsey: [51.498, -0.064], 'elephant and castle': [51.495, -0.100], blackfriars: [51.511, -0.104], 'canary wharf': [51.505, -0.020], 'isle of dogs': [51.495, -0.017], poplar: [51.508, -0.017], 'mile end': [51.525, -0.033], stratford: [51.541, -0.003], greenwich: [51.477, -0.001], woolwich: [51.490, 0.063], deptford: [51.479, -0.026], lewisham: [51.462, -0.010], peckham: [51.470, -0.069], dulwich: [51.446, -0.083], brixton: [51.462, -0.114], clapham: [51.462, -0.138], battersea: [51.474, -0.155], wandsworth: [51.457, -0.193], putney: [51.461, -0.217], wimbledon: [51.421, -0.206], merton: [51.410, -0.188], morden: [51.402, -0.195], tooting: [51.428, -0.168], streatham: [51.428, -0.131], sutton: [51.362, -0.194], croydon: [51.373, -0.099], bromley: [51.406, 0.015], orpington: [51.375, 0.100], bexley: [51.441, 0.149], eltham: [51.451, 0.052], sydenham: [51.427, -0.054], catford: [51.445, -0.020], kingston: [51.412, -0.300], 'kingston upon thames': [51.412, -0.300], richmond: [51.461, -0.304], twickenham: [51.449, -0.337], teddington: [51.427, -0.332], hounslow: [51.468, -0.361], feltham: [51.446, -0.414], heathrow: [51.470, -0.454], 'west drayton': [51.508, -0.472], hayes: [51.503, -0.421], uxbridge: [51.546, -0.479], hillingdon: [51.534, -0.450], southall: [51.511, -0.376], ealing: [51.513, -0.305], acton: [51.508, -0.272], chiswick: [51.492, -0.258], brentford: [51.487, -0.309], hammersmith: [51.492, -0.223], fulham: [51.473, -0.205], "shepherd's bush": [51.505, -0.218], 'white city': [51.512, -0.224], 'earls court': [51.492, -0.193], 'park royal': [51.527, -0.284], wembley: [51.556, -0.280], harrow: [51.580, -0.341], barnet: [51.653, -0.200], finchley: [51.600, -0.193], hendon: [51.583, -0.226], edgware: [51.614, -0.275], enfield: [51.652, -0.081], edmonton: [51.624, -0.061], tottenham: [51.598, -0.072], 'wood green': [51.597, -0.109], highgate: [51.571, -0.147], hampstead: [51.556, -0.178], 'kentish town': [51.550, -0.141], angel: [51.532, -0.106], walthamstow: [51.584, -0.020], leyton: [51.567, -0.013], leytonstone: [51.568, 0.008], ilford: [51.559, 0.074], romford: [51.575, 0.183], barking: [51.536, 0.081], dagenham: [51.541, 0.148], 'east ham': [51.539, 0.052], 'canning town': [51.514, 0.008], southgate: [51.632, -0.128], 'hatton garden': [51.520, -0.108], 'chigwell': [51.618, 0.076],
    watford: [51.656, -0.396], 'st albans': [51.755, -0.336], 'hemel hempstead': [51.753, -0.448], stevenage: [51.903, -0.196], hatfield: [51.763, -0.226], welwyn: [51.801, -0.204], 'welwyn garden city': [51.801, -0.204], hertford: [51.796, -0.078], ware: [51.811, -0.028], "bishop's stortford": [51.872, 0.159], 'bishops stortford': [51.872, 0.159], sawbridgeworth: [51.814, 0.149], hitchin: [51.949, -0.283], letchworth: [51.978, -0.230], baldock: [51.990, -0.188], royston: [52.048, -0.024], harpenden: [51.815, -0.356], 'potters bar': [51.698, -0.181], borehamwood: [51.656, -0.272], elstree: [51.645, -0.300], cheshunt: [51.702, -0.034], hoddesdon: [51.761, -0.013], broxbourne: [51.747, -0.019], berkhamsted: [51.760, -0.566], tring: [51.795, -0.660], rickmansworth: [51.639, -0.471], bushey: [51.643, -0.360], radlett: [51.685, -0.317],
    harlow: [51.768, 0.095], chelmsford: [51.736, 0.479], colchester: [51.889, 0.903], basildon: [51.576, 0.488], southend: [51.538, 0.714], brentwood: [51.621, 0.305], epping: [51.700, 0.112], loughton: [51.646, 0.056], stansted: [51.890, 0.200], 'saffron walden': [52.023, 0.243], braintree: [51.878, 0.553], witham: [51.800, 0.640], 'great dunmow': [51.873, 0.364], dunmow: [51.873, 0.364], 'waltham abbey': [51.687, -0.004], grays: [51.476, 0.323], thurrock: [51.476, 0.323], billericay: [51.628, 0.419],
    cambridge: [52.205, 0.122], ely: [52.399, 0.262], huntingdon: [52.331, -0.183], 'st neots': [52.229, -0.264], cambourne: [52.218, -0.069],
    dartford: [51.444, 0.218], sevenoaks: [51.272, 0.190], maidstone: [51.272, 0.529], sittingbourne: [51.340, 0.734], chatham: [51.380, 0.528], gravesend: [51.441, 0.370], 'tunbridge wells': [51.132, 0.263], guildford: [51.236, -0.570], woking: [51.319, -0.558], reading: [51.454, -0.973], slough: [51.511, -0.595], crawley: [51.109, -0.187], redhill: [51.240, -0.170], epsom: [51.333, -0.268], luton: [51.879, -0.418], 'milton keynes': [52.040, -0.759], 'high wycombe': [51.629, -0.749], bedford: [52.136, -0.467], oxford: [51.752, -1.258], brighton: [50.822, -0.137], ipswich: [52.056, 1.148], staines: [51.433, -0.511], 'staines-upon-thames': [51.433, -0.511], weybridge: [51.372, -0.457], camberley: [51.336, -0.742], bracknell: [51.416, -0.751],
  };
  const PLACE_COORD_RE = new RegExp(`\\b(${Object.keys(PLACE_COORDS).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace("'", "'?")).join('|')})\\b`, 'i');
  const coordsOf = place => { const m = String(place || '').toLowerCase().replace(/[’]/g, "'").match(PLACE_COORD_RE); return m ? PLACE_COORDS[m[1].replace(/^kings cross$/, 'kings cross')] || PLACE_COORDS[m[1]] || PLACE_COORDS[m[1].replace(/(\w)s /, "$1's ")] : null; };
  const kmBetween = (a, b) => { const dy = (a[0] - b[0]) * 111, dx = (a[1] - b[1]) * 111 * Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180); return Math.round(Math.sqrt(dx * dx + dy * dy)); };
  /** Home for the journey check: the profile's home town, else the first town in your areas that is not London or a county. */
  function homeOf(profile) {
    const cand = [profile.home, ...(profile.areas || []).filter(a => !/^(london|greater london|hertfordshire|herts|essex|cambridgeshire|cambs|kent|surrey|middlesex)$/i.test(String(a).trim()))].filter(Boolean);
    for (const c of cand) { const x = coordsOf(c); if (x) return { name: String(c).trim(), at: x }; }
    return null;
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
    // '£26-28,000' and '£26-28k': the thousands are written once, on the upper figure
    if (m[3] && !m[2] && min < 1000 && max >= 1000 && min * 1000 <= max * 1.01) min = min * 1000;
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
  // Skills any office job names; an ad that names only these is not an IT job
  const OFFICE_TOOLS = new Set(['Microsoft Office', 'Outlook', 'Customer service', 'Documentation / KB', 'SLA']);
  const COMMON = new Set(['Windows 10/11', 'Ticketing', 'Customer service', 'Hardware', 'Documentation / KB', 'Microsoft Office', 'Outlook', 'Printers', 'Peripherals', 'Remote support', 'SLA', 'Git', 'Agile / Scrum', 'OOP', 'HTML / CSS']);
  const DES_CTX = /\b(desirable|advantage|advantageous|beneficial|nice to have|a plus|is a bonus|ideally|preferred|would be good|familiarity|exposure to|awareness of|any of)\b/i;
  const REQ_CTX = /\b(essential|must|required|requirement|proven|strong|solid|extensive|in-depth|expert|demonstrable)\b/i;

  // ---------- Splitting the description into sections ----------
  const SEC_HEAD = [
    ['des', /\b(desirable|nice[- ]to[- ]have|bonus points|would be (a )?(plus|advantage|beneficial)|preferred (skills|experience)|advantageous)\b/i],
    ['ben', /\b(benefits?|what (you'?ll|you will|we) (get|offer|receive)|what'?s in it for you|perks|rewards?|our offer|package|in return|why (join|work for) us|we offer)\b/i],
    ['req', /\b(requirements?|what we'?re looking for|who we'?re looking for|what we look for|what we require|about you|you will (have|need|bring)|you'?ll (have|need|bring)|what you(?:'?ll)? bring|skills( and| &)? (experience|knowledge|qualifications)|knowledge,? skills|essential|qualifications?|experience required|key skills|mandatory skills|technical skills|^skills$|^experience$|your (profile|skills|experience)|the ideal candidate|person specification|what you('?ll)? need|to be successful|you should have|who you are|must haves?)\b/i],
    ['resp', /\b(responsibilit(y|ies)|what you'?ll (be )?do(ing)?|what you will (be )?do(ing)?|the role|your role|duties|day[- ]to[- ]day|key tasks|main tasks|(role|job|position) (overview|summary|description|purpose)|job purpose|^overview$|the opportunity|you will be|about the (role|job|position))\b/i],
    // The company blurb, culture and equal-opportunity text: never a requirement
    ['about', /^(about (?!you\b|the (role|job|position|opportunity)\b|this (role|job|position)\b)[\w&.'’ -]{2,40}|who (we are|are we)|our (company|story|mission|values|culture|commitment|journey|client)|company (overview|description|information)|the company|the firm|life at\b.*|what makes us .*|equal opportunit\w*.*|diversity.*|inclusion.*|disability statement|safeguarding statement|compliance statement|applicant safety.*|beware of scams|notice to (job seekers|recruitment agencies).*|note to recruitment agencies)\s*[:?]?$/i],
  ];
  // Single lines of boilerplate inside other sections
  const BOILER_LINE = /\b(equal opportunit|we (are|re) committed to (diversity|inclusion|equal)|reasonable (adjustments?|accommodations?)|disability confident|regardless of (race|age|gender|background)|do not accept unsolicited|recruitment agenc(y|ies)|visa sponsorship|right to work in the uk|privacy (policy|notice)|data protection notice|employee growth|followers|on linkedin)\b/i;
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
    if (words > 8 || /[.;!]$/.test(l.t)) return false;
    const head = l.t.replace(/:.*$/, '');
    return SEC_HEAD.some(([, re]) => re.test(head)) && (l.t.endsWith(':') || words <= 6);
  }

  // A short line that reads like a heading even if it is not one we know ('Our Tech Stack:')
  const looksLikeHeading = l => !l.bullet && l.t.length < 50 && !/[.;!,]$/.test(l.t) && l.t.split(/\s+/).length <= 6
    && (l.t.endsWith(':') || l.t === l.t.toUpperCase() || /^([A-Z][\w'&/-]*|and|of|to|the|for|you|we|in|a|an|with|our)(\s+([A-Z][\w'&/-]*|and|of|to|the|for|you|we|in|a|an|with|our))*\??:?$/.test(l.t));

  function parseSections(text) {
    const out = [];
    let cur = 'other';
    for (const l of splitLines(String(text || '').replace(/[’‘]/g, "'"))) {
      if (isHeading(l)) {
        const head = l.t.replace(/:.*$/, '');
        cur = (SEC_HEAD.find(([, re]) => re.test(head)) || [cur])[0];
        continue;
      }
      // An unknown heading ends the company blurb or the benefits: what follows may be requirements
      if ((cur === 'about' || cur === 'ben') && looksLikeHeading(l)) { cur = 'other'; continue; }
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

  // Lines that mention a holiday or hybrid working but are not a benefit: hours, shifts, visas, taglines
  const NOT_BEN = /bank holiday (work|cover)|weekend (work|cover|shifts?)|working holiday|\bvisa\b|\bshifts?\b|\brota\b|overtime may be required|^\W*[\w&+.]+(?:\s[\w&+.]+)*(?:\s\/\s[\w&+.]+(?:\s[\w&+.]+)*){2,}\W*$/i;
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
      benefits = splitLines(text).map(l => l.t).filter(l => l.length < 220 && BEN_LINE.test(l) && !NOT_BEN.test(l)).filter(l => { const k = l.slice(0, 40).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
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
    ['Django', 'Flask', 'FastAPI'],
    ['PostgreSQL', 'MySQL', 'SQL'],
    ['PyTorch', 'TensorFlow'],
    ['AWS', 'Azure', 'GCP'],
    ['Java', 'C# / .NET'],
    ['JavaScript', 'TypeScript'],
    ['Jira', 'Agile / Scrum'],
  ];
  // Knowing the parent counts in full: Microsoft 365 includes Office and Outlook
  const IMPLIED = { 'Microsoft Office': ['Microsoft 365'], 'Outlook': ['Microsoft 365'] };
  function similarCredit(name, skills) {
    const lv = (IMPLIED[name] || []).map(x => skills[x]).reduce((m, l) => Math.max(m, l === 'strong' ? 1 : l === 'basic' ? 0.6 : 0), 0);
    if (lv) return lv;
    const g = SIMILAR.find(x => x.includes(name));
    if (!g) return 0;
    const best = g.filter(x => x !== name).map(x => skills[x]).reduce((m, l) => Math.max(m, l === 'strong' ? 0.5 : l === 'basic' ? 0.3 : 0), 0);
    return best;
  }

  // Text that can hold requirements: the ad without the company blurb, benefits and boilerplate.
  // The company name is blanked so 'Scrumconnect' does not count as Scrum.
  function relevantText(text, company) {
    const parts = parseSections(text).filter(p => p.sec !== 'about' && p.sec !== 'ben' && !BOILER_LINE.test(p.text));
    let t = parts.map(p => p.text).join('\n');
    const words = String(company || '').replace(/\b(ltd|limited|plc|inc|llc|group|uk|the|international|technologies|solutions|consulting|recruitment|services)\b\.?/gi, ' ').split(/[^\p{L}\d+#.]+/u).filter(w => w.length >= 3);
    words.forEach(w => { t = t.replace(new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), ' '); });
    return { text: t, parts };
  }

  function toolWeights(title, text, company) {
    const rel = relevantText(text, company);
    const parts = rel.parts;
    const tools = extractTools((title || '') + '\n' + rel.text);
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

  // ---------- Level, experience and hard gates ----------
  const sentencesOf = text => String(text || '').replace(/\r/g, '').split(/\n+|(?<=[.!?;])\s+(?=[A-Z•])/).map(x => x.replace(/^[\s•·\-*]+/, '').trim()).filter(x => x.length > 3);
  const NOT_YOU = /\b(we|we've|we have|our|us|company|business|firm|agency|recruitment|established|founded|history|trading|heritage|clients? for|serving|been (in|delivering|helping|working)|since \d{4}|over the (last|past)|decades?)\b/i;
  const ABOUT_YOU = /\b(you|your|candidate|applicants?|minimum|at least|required|requirement|essential|must|need|proven|previous|prior|experience (of|in|with|providing|working|supporting))\b/i;
  const PREFERRED = /\b(preferred|ideally|desirable|advantage(ous)?|beneficial|nice to have|a plus|bonus)\b/i;

  /**
   * Years of experience the ad asks for: { years, preferred, text } or null.
   * Ignores the company's own history ('20 years' experience in IT recruitment', 'over 30 years of expertise').
   */
  function yearsAsked(text) {
    let best = null;
    // Indeed's screening line: 'Technical support: 2 years (required)'
    for (const m of String(text || '').matchAll(/^\s*([A-Za-z][\w /&+.-]{1,40}):\s*(\d{1,2})\+?\s*years?\s*\((required|preferred)\)/gim)) {
      const y = parseInt(m[2], 10), preferred = /preferred/i.test(m[3]);
      if (y && y <= 15 && (!best || y > best.years)) best = { years: y, preferred, text: m[0].trim().slice(0, 160) };
    }
    for (const s of sentencesOf(text)) {
      const low = s.toLowerCase();
      const re = /(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?(years?|yrs|months?)(?:'|’)?\s*(?:of\s+)?(?:(?:[\w/&-]+\s+){0,5}?(?:experience|exp)\b|(?:working |hands-on |professional )?(?:in|as|within)\s+(?:an?\s+|the\s+)?(?:[\w/&,-]+\s+){0,8}?(?:role|position|environment|capacity|team|support|setting|function)s?\b)/gi;
      let m;
      while ((m = re.exec(low))) {
        let y = parseInt(m[1], 10);
        if (/month/.test(m[2])) y = y >= 12 ? Math.floor(y / 12) : 0;
        if (!y || y > 15) continue;
        // '20 years' experience in IT recruitment' is the company, not you
        if (NOT_YOU.test(low) && !ABOUT_YOU.test(low.replace(/experience/g, ''))) continue;
        // 'ideally' counts only near the years ('ideally 2 years…', '3 years preferred'), not elsewhere in the bullet
        const near = low.slice(Math.max(0, m.index - 40), m.index + m[0].length + 30);
        const preferred = PREFERRED.test(near) && !/\b(required|essential|must|minimum|at least)\b/.test(near);
        if (!best || y > best.years || (y === best.years && best.preferred && !preferred)) best = { years: y, preferred, text: s.slice(0, 160) };
      }
    }
    return best;
  }

  const SENIOR_TITLE = /\b(senior|snr|lead|manager|head of|principal|architect|staff engineer|team leader|director|3rd[- ]line|third[- ]line|tier ?3|level ?3|l3)\b|\b(iii|iv)\b/i;
  const MID_TITLE = /\b(2nd[- ]line|second[- ]line|tier ?2|level ?2|l2|ii|mid[- ]level|intermediate|experienced)\b/i;
  const ENTRY_TITLE = /\b(1st[- ]line|first[- ]line|tier ?1|level ?1|l1|junior|jnr|graduate|grad|trainee|apprentice(ship)?|entry[- ]level|assistant|intern(ship)?|placement|student|associate)\b/i;
  const ENTRY_TEXT = /\b(no (previous |prior )?experience (is )?(required|necessary|needed)|full training (is )?(provided|given)|training will be provided|we will train you|recent graduates?|ideal first role|start your career|entry[- ]level|0[- –]1 years?|suit(s|able for) (a )?(recent )?graduate)\b/i;

  /** Seniority from the title, the text and the pay: { level: entry|mid|senior|unknown, why } */
  function detectLevel(title, text, salary, cat) {
    const t = String(title || '');
    if (SENIOR_TITLE.test(t) && !/\b(1st[- ]line|first[- ]line)\b.*\b(2nd|second)\b/i.test(t)) return { level: 'senior', why: `"${t.slice(0, 60)}" is a senior or 3rd-line title` };
    const itSupport = cat === 'IT Help Desk / Service Desk' || cat === 'IT Technician / Field Support';
    if (salary && salary.period === 'day' && salary.max >= 350) return { level: 'senior', why: `Contractor day rate (${salary.text}): aimed at experienced people` };
    if (MID_TITLE.test(t) && !ENTRY_TITLE.test(t)) return { level: 'mid', why: `"${t.slice(0, 60)}": 2nd line or mid-level` };
    if (ENTRY_TITLE.test(t)) return { level: 'entry', why: 'Entry-level title' };
    if (itSupport && salary && salary.annualMax && salary.period !== 'day' && salary.annualMax >= 40000) return { level: 'mid', why: `Pays up to £${Math.round(salary.annualMax / 1000)}k: usually means a few years of experience` };
    if (ENTRY_TEXT.test(String(text || ''))) return { level: 'entry', why: 'The ad says it suits beginners or gives training' };
    return { level: 'unknown', why: '' };
  }

  // Titles that are IT, titles that are not, and ads that are not jobs
  const IT_TITLE = /\b(it|i\.t\.?|ict|tech(nical)? support|computer|digital|software|data|cyber|cloud|network(ing)?|systems?|infrastructure|service ?desk|desktop|devops|developer|web|device|repair|hardware|pcs?|laptops?|apple|mac|euc|end user|support (engineer|analyst|technician)|technology|programmer|sysadmin|2nd line|1st line|first line|second line|3rd line)\b/i;
  const NON_IT_TITLE = /\b(facilit(y|ies)|reception(ist)?|front of house|concierge|admin(istrator|istration|istrative)?|office (manager|assistant|coordinator|junior)|secretary|pa\b|personal assistant|fire|security officer|guard|cleaner|porter|caretaker|electric(ian|al)|plumb(er|ing)|installer|installation engineer|cabling|audio ?visual|hvac|mechanical|water|building|estates?|maintenance|driver|warehouse|sales|recruit(er|ment)|nurse|carer|care assistant|chef|barista|waiter|retail assistant|accounts|bookkeep(er|ing)|payroll|hr\b|marketing|teacher|tutor)\b/i;
  const FACILITIES_TEXT = /\bCAFM\b|facilit(y|ies) management|\bPPM\b|building passes|visitor (sign-in|access)|engineer timesheets|work orders? for engineers/i;
  const NOT_A_JOB = /traineeship|guaranteed (job )?(offer|interview|placement)|job guarantee|online study|study online|cv workshop|recruitment partners in your area|training course|government[- ]funded (course|training)|skills bootcamp|price:\s*£0|course details|no fees to pay|paid surveys?|mystery shop(per|ping)|focus groups?|product tester|not a suitable replacement for a job|register on our website|earn additional income/gi;
  const LOCAL_ONLY = /(only|solely) (accepting|considering) (applications|candidates) from (candidates )?(based|living|located)|candidates (must be )?(based|living|located) (within|in|near) (this|the) (area|locality|region)|must (live|reside|be based) (within|in|near|locally)|local candidates only/i;
  const LANGS = 'german|french|spanish|italian|dutch|polish|portuguese|arabic|mandarin|cantonese|japanese|korean|russian|turkish|romanian|hindi|urdu|swedish|danish|norwegian|finnish|greek|hebrew|ukrainian|czech|hungarian';

  /**
   * Hard conditions. blocks: you cannot meet it as you are (licence, clearance, language, far too
   * senior). asks: worth checking before you spend time (commute, 2nd line, hours, degree).
   * Each item: { key, text }.
   */
  // Years an HR screen will count. Freelance and a home lab help in the interview, but a
  // filter for '1 year in an IT support role' usually looks for a paid job with an employer.
  function myYearsOf(profile) {
    const c = profile && profile.commercialYears;
    if (c !== null && c !== undefined && c !== '' && !isNaN(+c)) return +c;
    return profile && profile.experienceYears != null ? Number(profile.experienceYears) || 0 : 1;
  }
  const usesCommercial = p => p && p.commercialYears !== null && p.commercialYears !== undefined && p.commercialYears !== '' && !isNaN(+p.commercialYears);
  // 'previous experience in an IT support role', 'proven service desk experience' with no years given
  const PRIOR_ROLE = /\b(previous|prior|proven|demonstrable|demonstrated|commercial|professional|recent)\s+(?:\w+\s+){0,3}?experience\s+(?:\w+\s+){0,2}?(?:in|of|within|on|working (?:in|on))\s+(?:an?\s+|the\s+)?(?:\w+\s+){0,2}?(it|technical|help ?desk|service ?desk|1st[- ]line|first[- ]line|2nd[- ]line|second[- ]line|desktop|end[- ]user|customer[- ]facing it)\b[^.]{0,30}\b(support|role|position|environment|team|desk)\b|\b(proven|previous|prior|demonstrable)\s+(it support|help ?desk|service ?desk|1st[- ]line|first[- ]line|desktop support|technical support)\s+experience\b/i;

  function checkGates(job, profile, ctx) {
    profile = profile || DEFAULT_PROFILE;
    const title = job.title || '', text = String(job.description || '');
    const low = (title + '\n' + text).toLowerCase();
    const sents = sentencesOf(text);
    const blocks = [], asks = [];
    const block = (key, t) => blocks.push({ key, text: t }), ask = (key, t) => asks.push({ key, text: t });
    const intern = ctx.track === 'intern';

    // Language of the ad, and other languages it requires
    if (globalThis.JT_Quality && JT_Quality.foreignShare(text) > 0.25) block('language', 'The ad is not in English');
    const mine = (profile.languages || []).map(l => l.toLowerCase());
    const cap = w => w[0].toUpperCase() + w.slice(1).toLowerCase();
    // 'IT Helpdesk (fluent Japanese)', 'a Japanese speaking IT Helpdesk', 'fluent in German': the language is the job
    const strongLang = new RegExp(`\\b(?:fluent|fluency|native|bilingual)\\s+(?:in\\s+)?(${LANGS})\\b|\\b(${LANGS})[- ]?(?:speaking|speaker)`, 'i');
    [title, ...sents].forEach(s => {
      const m = s.match(strongLang);
      const lang = m && (m[1] || m[2]);
      if (!lang || mine.includes(lang.toLowerCase()) || PREFERRED.test(s)) return;
      if (!blocks.some(b => b.key === 'language')) block('language', `Asks for ${cap(lang)}${s === title ? ' (in the job title)' : ''}`);
    });
    sents.forEach(s => {
      const m = s.match(new RegExp(`\\b(${LANGS})\\b`, 'i'));
      if (!m || mine.includes(m[1].toLowerCase())) return;
      if (!/\b(fluent|fluency|native|proficien|business[- ]level|speak(ing)?|written and (spoken|verbal)|language)\b/i.test(s)) return;
      if (PREFERRED.test(s) || /\b(one or more|any of|other languages)\b/i.test(s)) return;
      if ((/\b(required|essential|must|need|mandatory)\b/i.test(s) || /^(fluent|native)/i.test(s)) && !blocks.some(b => b.key === 'language')) block('language', `Asks for ${cap(m[1])}`);
    });

    // Driving licence: a requirement only when the same sentence says so
    if (!profile.hasDrivingLicence) {
      const lic = sents.filter(s => /driv(ing|er'?s?) licen[cs]e|own (car|transport|vehicle)|access to a (car|vehicle)|do you drive|able to drive|reliable transport|have a car\b/i.test(s));
      if (lic.some(s => /\b(essential|required|must|need|mandatory|important)\b/i.test(s) || /^do you (have a car|hold a (full |valid |clean )*(uk )?driv)/i.test(s) || !PREFERRED.test(s) && ( /^(?:(?:a|must have a|you have a|hold a)\s+)?(?:(?:full|clean|valid|current|uk)[,\s]+(?:and\s+)?)*driving licen[cs]e/i.test(s) || (s.length < 70 && !/\b(desirable|preferred|ideally|advantage|beneficial|plus|bonus)\b/i.test(s) && /driving licen[cs]e/i.test(s))))) block('licence', 'Needs a driving licence or a car');
      else if (lic.length) ask('licence', 'Mentions driving: check whether a licence is needed');
    }
    // Security clearance
    const sc = sents.find(s => /\b(sc|dv|security) clearance\b|\bsc cleared\b|\bnppv\b|\bdv cleared\b|\bdeveloped vetting\b/i.test(s));
    if (sc) ask('clearance', 'Needs security clearance: SC usually needs 5 years of UK residence');

    // Right to work with an end date: some ads rule it out in so many words
    if (profile.timeLimitedRtw && !intern) {
      if (/\btime[- ]limited (work )?(permission|visa|right to work|leave)\b|\b(indefinite leave to remain|\bilr\b|settled status|british citizen(ship)?) (is )?(required|essential|only)\b|\bmust (have|hold) (indefinite leave|settled status|ilr)\b/i.test(low)) block('rtw', 'Rules out a right to work with an end date');
      else if (/\bunrestricted right to work\b|\bpermanent right to work\b/i.test(low)) ask('rtw', 'Asks for an unrestricted right to work: check whether your permission and its extension are accepted');
    }

    // Location
    if (ctx.localOnly && (ctx.outArea || ctx.localPlace)) block('local', ctx.localPlace ? `Only takes candidates based near ${ctx.localPlace}` : 'Local candidates only, and the job is outside your areas');
    else if (ctx.outArea) ask('commute', `${ctx.location}: outside your areas, check the commute`);
    else if (ctx.farAway && !ctx.hybrid) ask('commute', `${ctx.location}: about ${ctx.farAway.km} km from ${ctx.farAway.home}, check the journey time`);

    // A contract paid by the day (a high rate already counts as senior above)
    if (!intern && ctx.salary && ctx.salary.period === 'day' && ctx.level.level !== 'senior') ask('contract', `Contract paid by the day (${ctx.salary.text}): ask how long it runs and whether it is inside IR35`);
    // Not a job at all: a training course, paid surveys, a sign-up page
    const notJob = (low.match(NOT_A_JOB) || []).length;
    if (notJob >= 2 || /\b(training course|bootcamp)\b/i.test(title)) block('not-a-job', 'Not a job: a training course, survey site or advert');
    // Apprenticeships are closed to people who already hold a qualification at that level or above
    if (!intern && /\b(must not|cannot|can'?t|should not) (already )?hold an? (existing |prior )?qualification at (the )?same or (a )?higher level|\bnot (already )?hold(ing)? a (degree|qualification) at level\b|\bno (prior|existing) qualification at (this|the same) level\b/i.test(low))
      ask('eligibility', 'Apprenticeship only for people without a qualification at this level or above: a diploma or a degree course in IT may rule you out, ask before applying');
    else if (!intern && /\bapprentice(ship)?\b/i.test(title)) ask('eligibility', 'Apprenticeship: check you are eligible while studying for a degree, and what it pays');
    // Not an IT job: facilities, reception, admin, trades ('Help Desk Admin' at a facilities firm, 'Water Treatment Engineer')
    const itTitle = IT_TITLE.test(title);
    const office = (ctx.coreTools || 0) < 2; // only Office, Outlook, customer service named
    if (!intern && !blocks.some(b => b.key === 'not-a-job')) {
      if (!itTitle && NON_IT_TITLE.test(title)) block('role', `"${title.slice(0, 50)}" is not an IT role`);
      else if (!itTitle && office && (ctx.cat === 'Other' || FACILITIES_TEXT.test(text))) block('role', `"${title.slice(0, 50)}" does not look like an IT role: only office skills are named`);
      else if (ctx.cat === 'Other' && (ctx.toolCount || 0) < 3 && !itTitle) block('role', `"${title.slice(0, 50)}" does not look like an IT role`);
    }
    // Seniority and experience (internships are judged by the placement rules instead)
    if (ctx.level.level === 'senior') block('level', ctx.level.why);
    else if (!intern && ctx.level.level === 'mid') ask('level', ctx.level.why);
    const myYears = myYearsOf(profile);
    const paid = usesCommercial(profile);
    const yours = paid ? ` (you have ${myYears ? myYears + ' year' + (myYears > 1 ? 's' : '') : 'none'} in a paid IT job; freelance and your lab help at interview, not at the CV screen)` : '';
    const ya = ctx.years;
    if (ya && !intern) {
      if (ya.years >= myYears + 2 && !ya.preferred) block('experience', `Asks for ${ya.years}+ years of experience${yours}`);
      else if (ya.years >= myYears + 1) ask('experience', `${ya.preferred ? 'Prefers' : 'Asks for'} ${ya.years} year${ya.years > 1 ? 's' : ''} of experience${yours}`);
    } else if (!ya && !intern && paid && myYears === 0) {
      const s = sents.find(x => PRIOR_ROLE.test(x) && !PREFERRED.test(x));
      if (s) ask('experience', 'Asks for previous experience in an IT support role: you have none in a paid job yet, so lead with the freelance work and the lab tickets');
    }

    // Hours and degree
    if (!intern && ctx.fullTimeOnly && profile.penalizeSchedule) ask('hours', `Full-time Monday to Friday; you can do ${profile.daysPerWeek} days a week`);
    if (!intern && /\b(minimum (of )?(a )?(2:1|2\.1|bachelor'?s?)|degree (is )?(required|essential)|must (have|hold) a degree)\b/i.test(low) && !/\bor equivalent\b/i.test(low)) ask('degree', 'Asks for a completed degree');

    // Internships: placement rules decide
    if (intern && ctx.placement) {
      ctx.placement.items.forEach(i => {
        const t = /^(Not stated|Part-time|Full-time|Paid)$/.test(i.text) || i.text.length < 25 ? `${i.label.replace(/\s*\(.*\)/, '')}: ${i.text}` : i.text;
        if (i.state === 'fail' && ['dates', 'location', 'relevance', 'weeks'].includes(i.key)) block('placement-' + i.key, t);
        else if (i.state === 'fail' || (i.state === 'unknown' && ['dates', 'weeks', 'hours'].includes(i.key))) ask('placement-' + i.key, t);
      });
    }
    return { blocks, asks };
  }

  // Apply / Tailor / Ask / Skip from the score, the gates and how much the ad says
  const VERDICTS = {
    incomplete: { label: 'Incomplete', hint: 'The job ad was not captured: open the job page again' },
    skip: { label: 'Skip', hint: 'Something here rules you out' },
    ask: { label: 'Check first', hint: 'Worth it if the open questions work out' },
    tailor: { label: 'Tailor CV', hint: 'Apply after adjusting your CV to this ad' },
    apply: { label: 'Apply', hint: 'Good fit' },
  };
  function decide(score, gates, confidence) {
    if (gates.blocks.length) return 'skip';
    if (confidence === 'low') return 'ask';
    if (score < 45) return 'skip';
    if (gates.asks.length) return 'ask';
    return score >= 70 ? 'apply' : 'tailor';
  }

  /**
   * Fit score (0–100) plus the gates and a verdict.
   * ctx: { company, salary, track, placement } (all optional).
   */
  function computeChance(title, text, workTypes, profile, location, ctx = {}) {
    profile = profile || DEFAULT_PROFILE;
    const skills = profile.skills || {};
    const full = (title || '') + '\n' + (text || '');
    const low = full.toLowerCase();
    const reasons = [];
    const add = (cond, delta, t) => { if (cond) reasons.push({ text: t, delta }); return cond ? delta : 0; };
    const intern = ctx.track === 'intern';

    // 1. Skills: up to 50 points, weighted by how important each tool is in the ad
    const tw = toolWeights(title, text, ctx.company);
    const matched = [], basic = [], missing = [], similar = [];
    let got = 0, total = 0;
    tw.forEach(({ name, w }) => {
      const lvl = skills[name] || 'none';
      total += w;
      if (lvl === 'strong') { matched.push(name); got += w; }
      else if (lvl === 'basic') { basic.push(name); got += w * 0.6; }
      else {
        const sim = similarCredit(name, skills);
        if (sim >= 1) { matched.push(name); got += w; }
        else if (sim) { basic.push(name); similar.push(name); got += w * sim; }
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

    // 2. Level: up to 20. Title first, then pay, then what the text says
    const cat = detectCategory(title, text);
    const targets = profile.targetCategories || [];
    const target = !targets.length || targets.includes(cat);
    const itSupport = cat === 'IT Help Desk / Service Desk' || cat === 'IT Technician / Field Support';
    const lv = detectLevel(title, text, ctx.salary, cat);
    let levelPts, levelText;
    if (lv.level === 'senior') { levelPts = 0; levelText = 'Level: ' + lv.why; }
    else if (!target) { levelPts = lv.level === 'entry' ? 8 : 3; levelText = `Area: ${cat} is not one of your target roles`; }
    else if (lv.level === 'entry') { levelPts = 20; levelText = 'Level: entry-level, matches yours'; }
    else if (lv.level === 'mid') { levelPts = itSupport ? 11 : 6; levelText = 'Level: ' + lv.why; }
    else if (itSupport) { levelPts = 15; levelText = 'Level: IT support, line not stated'; }
    else { levelPts = 10; levelText = 'Level: not stated, check the experience asked for'; }
    reasons.push({ text: levelText, delta: levelPts, max: 20 });

    // 3. Experience: up to 15, against the years you have
    const ya = yearsAsked(text);
    const myYears = myYearsOf(profile);
    const noExp = /\bno (previous |prior )?experience (is )?(required|necessary|needed)|full training (is )?(provided|given)|we will train you|training will be provided\b/i.test(low);
    let expPts, expText;
    if (noExp) { expPts = 15; expText = 'Experience: not required, training provided'; }
    else if (!ya) { expPts = 12; expText = 'Experience: years not stated'; }
    else if (ya.years <= myYears) { expPts = 15; expText = `Experience: ${ya.years} year${ya.years > 1 ? 's' : ''}, you have it`; }
    else if (ya.years === myYears + 1) { expPts = ya.preferred ? 11 : 8; expText = `Experience: ${ya.years} years ${ya.preferred ? 'preferred' : 'asked'}, one more than yours`; }
    else { expPts = ya.preferred ? 5 : 0; expText = `Experience: ${ya.years}+ years ${ya.preferred ? 'preferred' : 'asked'}, well above yours`; }
    reasons.push({ text: expText, delta: expPts, max: 15 });

    // 4. Constraints that lower the score (the gates below decide whether they rule the job out)
    let pen = 0, outArea = false;
    pen += add(/\bdegree\b[^.]{0,40}\b(required|essential)\b/i.test(low) && !intern, -4, 'Completed degree required');
    const wt = workTypes && workTypes.length ? workTypes : detectWorkTypes(full);
    const loc = String(location || '').trim();
    const isRemote = wt.includes('Remote') && !wt.includes('Hybrid') && !wt.includes('On-site');
    const localOnly = LOCAL_ONLY.test(low) || /(only|solely) (accepting|considering) (applications|candidates) from (candidates )?(based|living|located)|candidates (must be )?(based|living|located) (within|in|near) (this|the) (area|locality|region)|must (live|reside|be based) (within|in|near|locally)|local candidates only|only accepting applications from candidates based/i.test(low);
    const areas = (profile.areas || []).map(a => a.toLowerCase()).filter(Boolean);
    const vague = !loc || /^(united kingdom|uk|england|great britain|gb|remote)$/i.test(loc);
    const inArea = inAreas(loc, areas);
    // The place in the 'local candidates only' sentence beats the saved location (which can be wrong)
    let localPlace = '';
    if (localOnly) {
      const ls = sentencesOf(text).find(x => LOCAL_ONLY.test(x.toLowerCase())) || '';
      const pm = ls.match(/\b(?:in|at|near|around)\s+((?:[A-Z][a-z]+)(?:[ -](?:[A-Z][a-z]+|upon|on|in|under)){0,3})\b/);
      const place = pm && !/^(This|The|Our|London Area|United|England|UK)$/.test(pm[1]) ? pm[1] : '';
      if (place && areas.length && !areas.some(a => place.toLowerCase().includes(a) || a.includes(place.toLowerCase()))) localPlace = place;
    }
    // Inside your areas but a long way from home (Orpington is London, but two hours from Bishop's Stortford)
    let farAway = null;
    const home = homeOf(profile), there = !isRemote && coordsOf(loc);
    if (home && there) {
      const km = kmBetween(home.at, there), limit = Number(profile.maxCommuteKm) || 50;
      if (km > limit) farAway = { km, home: home.name };
    }
    if (localPlace) { pen += add(true, -12, `Only candidates based near ${localPlace}`); outArea = true; }
    else if (farAway && inArea && !wt.includes('Hybrid')) pen += add(true, -8, `About ${farAway.km} km from ${farAway.home}: a long journey every day`);
    else if (farAway && inArea) add(true, 0, `About ${farAway.km} km from ${farAway.home}, hybrid: fewer journeys`);
    else if (!isRemote && !vague && areas.length && !inArea) { pen += add(true, -12, `Location "${loc}" is outside your areas`); outArea = true; }
    else if (localOnly && !inArea) add(true, 0, 'Local candidates only: check where the office is');

    // 5. Bonuses
    let bonus = 0;
    const partOk = wt.includes('Part-time') || /\bflexible (hours|working)\b|\b4[- ]day\b|\bfour[- ]day\b|\bcompressed hours\b|\bmonday to thursday\b|\bmon(day)?\s*[-–]\s*thu(rs(day)?)?\b/i.test(low);
    bonus += add((profile.daysPerWeek || 5) < 5 && partOk, 5, 'Flexible, part-time or 4-day hours');
    const langs = (profile.languages || []).filter(l => l && !/^english$/i.test(l));
    const askedLang = langs.find(l => new RegExp('\\b' + l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(low));
    bonus += add(!!askedLang, 5, `Asks for ${askedLang}, which you speak`);
    const fullTimeOnly = (profile.daysPerWeek || 5) < 5 && !partOk && (wt.includes('Full-time') || /\bmonday to friday\b|\bmon\s*-\s*fri\b|37\.5 hours|40 hours/i.test(low));
    pen += add(fullTimeOnly && profile.penalizeSchedule, -8, 'Full-time Mon–Fri');
    // Shifts, weekends, nights: often fine around university, so a note with the sentence, not a question
    const shift = !intern && sentencesOf(text).find(x => /\b(weekend|bank holiday)s? (work|working|cover|shifts?)\b|\bshifts? (between|pattern|work|rota)|\brota\b|\bnight shifts?\b|\bon[- ]call\b|\bworking (on )?weekends\b/i.test(x) && !/\bno (weekend|shift|on[- ]call)/i.test(x));
    add(!!shift, 0, shift ? 'Shifts or weekends: ' + shift.replace(/^[^:]{0,25}:\s*/, '').slice(0, 110) : '');
    add(/\btemporary (assignment|role|position|contract)\b|\btemp(orary)?[- ]to[- ]perm\b|\b(fixed[- ]term|ftc)\b|\b\d{1,2}[- ]month contract\b/i.test(low + ' ' + (workTypes || []).join(' ')) && !intern, 0, 'Temporary or fixed-term: ask how long, and whether it can become permanent');
    add(fullTimeOnly && !profile.penalizeSchedule, 0, `Full-time: you can do ${profile.daysPerWeek} days a week, raise it at interview`);
    add(/\bcomptia a\+|\ba\+ (cert|qualif)/i.test(low) && skills['CompTIA A+'] !== 'strong', 0, 'Mentions CompTIA A+: say when you sit the exam');

    const fit = Math.max(3, Math.min(97, Math.round(skillPts + levelPts + expPts + pen + bonus)));

    // 6. Gates and verdict
    const gates = checkGates({ title, description: text }, profile, {
      track: ctx.track, placement: ctx.placement, level: lv, years: ya, outArea, localOnly, localPlace, location: loc, fullTimeOnly,
      farAway, hybrid: wt.includes('Hybrid'), salary: ctx.salary, cat, toolCount: tools.length, coreTools: tools.filter(t => !OFFICE_TOOLS.has(t)).length,
    });
    const lowData = tools.length < 3;
    const confidence = lowData || String(text || '').length < 600 ? 'low' : (String(text || '').length >= 1200 && tools.length >= 5 ? 'high' : 'medium');
    if (lowData) gates.asks.push({ key: 'lowdata', text: 'The ad names few skills: read it yourself, the score is a guess' });
    const verdict = decide(fit, gates, confidence);
    // Ruled-out jobs sort to the bottom; the uncapped number stays in 'fit'
    const score = gates.blocks.length ? Math.min(fit, 25) : fit;
    const label = score >= 70 ? 'High' : score >= 50 ? 'Medium' : score >= 30 ? 'Low' : 'Very low';
    return {
      score, fit, label, tools, matched, basic, missing, similar, keyMissing, reasons, lowData,
      senior: lv.level === 'senior', level: lv.level, outArea, gates, verdict, confidence, v: 3,
    };
  }

  /**
   * Full analysis of one job. opts.approx: the text is a search card, not the ad (no quality check).
   * The description is cleaned of page chrome first; a record that is not a real ad gets
   * verdict 'incomplete' and confidence 'low', and the UI shows '?' instead of a percentage.
   */
  function analyze(job, profile, opts = {}) {
    const Q = globalThis.JT_Quality;
    let description = String(job.description || '');
    if (Q && !opts.approx) description = Q.cleanDescription(description, { title: job.title }).text;
    job = { ...job, description };
    const text = [description, job.extraText || ''].join('\n');
    const full = (job.title || '') + '\n' + text;
    const workTypes = job.workTypes && job.workTypes.length ? job.workTypes : detectWorkTypes(full + ' ' + (job.employmentType || ''));
    const salary = job.salaryText ? parseSalary(job.salaryText) || { text: job.salaryText } : parseSalary(text, true);
    const sections = extractSections(description);
    const track = job.track === 'intern' || job.track === 'job' ? job.track : (detectInternship(job.title, description) ? 'intern' : 'job');
    const category = job.category && job.category !== 'Other' ? job.category : detectCategory(job.title, text);
    const chance = track === 'intern'
      ? computeInternChance({ ...job, category, salaryText: job.salaryText || (salary && salary.text) || '' }, workTypes, profile || DEFAULT_PROFILE)
      : computeChance(job.title, description, workTypes, profile, job.location, { company: job.company, salary, track });
    let quality = null;
    if (Q && !opts.approx) {
      quality = Q.validate(job, { toolsFound: chance.tools.length, hasRequirements: sections.requirements.length > 0 });
      if (!quality.ok) {
        chance.verdict = 'incomplete'; chance.confidence = 'low';
        // Without the ad, 'not stated' questions mean nothing; real blocks (title, location) stay
        if (chance.gates) chance.gates.asks = chance.gates.asks.filter(a => a.key !== 'lowdata' && !/^placement-(dates|weeks|hours)$/.test(a.key));
      }
      else if (rankConf(quality.confidence) < rankConf(chance.confidence)) chance.confidence = quality.confidence;
      if (quality.ok && chance.confidence === 'low' && chance.verdict !== 'skip') chance.verdict = 'ask';
    }
    chance.quality = quality ? { ok: quality.ok, issues: quality.issues } : null;
    return {
      track, placement: chance.placement || null,
      workTypes,
      category,
      salary,
      description,
      details: extractDetails(text),
      sections,
      notes: buildNotes(sections),
      benefits: sections.benefits,
      chance,
    };
  }
  const rankConf = c => ({ low: 0, medium: 1, high: 2 })[c] ?? 1;

  // What to show instead of a bare percentage
  function display(chance) {
    if (!chance) return { text: '—', verdict: null, label: '', sure: false };
    const v = chance.verdict || null;
    const sure = v !== 'incomplete' && chance.confidence !== 'low';
    // A job you are ruled out of shows no percentage: a '62%' next to 'Skip' still looks like a chance
    const ruledOut = v === 'skip' && chance.gates && chance.gates.blocks && chance.gates.blocks.length;
    return { text: v === 'incomplete' ? '?' : ruledOut ? '✕' : sure ? chance.score + '%' : '≈' + chance.score + '%', verdict: v, label: v ? VERDICTS[v].label : chance.label, hint: v ? VERDICTS[v].hint : '', sure };
  }

  // ================= INTERNSHIPS =================
  const INTERN_TITLE = /\b(intern(ship)?s?|placement|industrial placement|year in industry|work experience|spring (week|insight)|summer (analyst|associate)|insight (programme|program|week)|trainee(ship)?|student (developer|engineer|analyst|role)|undergraduate)\b/i;
  function detectInternship(title, text) {
    if (INTERN_TITLE.test(title || '')) return true;
    const head = String(text || '').slice(0, 1200);
    return /\b(this|our|an?) (paid )?(internship|placement)\b|\binternship (programme|program|opportunity|role)\b|\b\d{1,2}[- ]week (internship|placement)\b/i.test(head);
  }

  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const MON_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const monIdx = m => MONTHS[String(m).slice(0, 3).toLowerCase()];
  const isoOf = d => d ? d.toISOString().slice(0, 10) : '';
  const parseIso = s => { if (!s) return null; const [y, m, d] = String(s).split('-').map(Number); return y ? new Date(Date.UTC(y, m - 1, d || 1)) : null; };
  const fmtD = d => d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  const DAY = 864e5;

  // A date written next to a keyword: "start date: 25 January 2027", "starting 01/02/2027", "from February 2027"
  function dateNear(text, keyRe, defYear) {
    const re = new RegExp(`(?:${keyRe})[^.\\n]{0,40}?(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MON_RE})\\.?,?\\s*(20\\d\\d)?|(${MON_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d),?\\s*(20\\d\\d)?|(${MON_RE})\\.?\\s*(20\\d\\d)|(\\d{1,2})[\\/.](\\d{1,2})[\\/.](20\\d\\d|\\d\\d))`, 'i');
    const m = String(text).match(re);
    if (!m) return null;
    let d, mo, y;
    if (m[2]) { d = +m[1]; mo = monIdx(m[2]); y = m[3] ? +m[3] : defYear; }
    else if (m[4]) { mo = monIdx(m[4]); d = +m[5]; y = m[6] ? +m[6] : defYear; }
    else if (m[7]) { mo = monIdx(m[7]); d = 1; y = +m[8]; }
    else { d = +m[9]; mo = +m[10] - 1; y = +m[11]; if (y < 100) y += 2000; }
    if (mo == null || isNaN(mo) || !y) return null;
    return { date: new Date(Date.UTC(y, mo, d || 1)), text: m[0] };
  }

  function weeksFromText(low) {
    const unit = (n, u) => /month/.test(u) ? Math.round(n * 4.33) : n;
    const pats = [
      // "12-week internship", "3 months placement", "6-month fixed term"
      [/(\d{1,2})(?:\s*(?:-|to|–)\s*(\d{1,2}))?[- ]?(weeks?|months?)\b[^.\n]{0,40}?(?:internship|placement|programme|program|contract|fixed[- ]term|duration|role|scheme)/, 1, 2, 3],
      // "duration: 12 weeks", "lasting 3 months", "for 14 weeks"
      [/(?:duration|length|lasting|for)\s*(?:of|:)?\s*(\d{1,2})(?:\s*(?:-|to|–)\s*(\d{1,2}))?\s*(weeks?|months?)/, 1, 2, 3],
      // "(14 weeks)"
      [/\(\s*(\d{1,2})(?:\s*(?:-|to|–)\s*(\d{1,2}))?\s*(weeks?|months?)\s*\)/, 1, 2, 3],
    ];
    for (const [re, a, b, u] of pats) {
      const m = low.match(re);
      if (m) return unit(+(m[b] || m[a]), m[u]);
    }
    return null;
  }

  // "February 2027 to May 2027", "Feb – May 2027", "3 February – 23 May 2027"
  function monthRange(text, defYear) {
    const re = new RegExp(`(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+)?(${MON_RE})\\.?(?:\\s+(20\\d\\d))?\\s*(?:–|—|-|to|until|through)\\s*(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+)?(${MON_RE})\\.?(?:\\s+(20\\d\\d))?`, 'i');
    const m = String(text).match(re);
    if (!m || (!m[3] && !m[6] && !m[1] && !m[4])) return null;
    const m1 = monIdx(m[2]), m2 = monIdx(m[5]);
    if (m1 == null || m2 == null || isNaN(m1) || isNaN(m2)) return null;
    const y2 = m[6] ? +m[6] : m[3] ? +m[3] + (m2 < m1 ? 1 : 0) : defYear;
    const y1 = m[3] ? +m[3] : (m1 > m2 ? y2 - 1 : y2);
    const start = new Date(Date.UTC(y1, m1, m[1] ? +m[1] : 1));
    const end = m[4] ? new Date(Date.UTC(y2, m2, +m[4])) : new Date(Date.UTC(y2, m2 + 1, 0));
    return end > start ? { start, end } : null;
  }

  /**
   * Reads placement rules from pasted text such as a university briefing:
   * "dates: 25 January – 28 May 2027", "at least 12 weeks", "35–40 hrs/week",
   * "4 days per week", "18 November – submit …". Returns only what it finds.
   */
  function parsePlacementRules(text, now) {
    const t = String(text || '').replace(/–|—/g, '–');
    const out = {};
    const range = t.match(new RegExp(`(\\d{1,2})\\s+(${MON_RE})(?:\\s+(20\\d\\d))?\\s*(?:–|-|to)\\s*(\\d{1,2})\\s+(${MON_RE})\\s+(20\\d\\d)`, 'i'));
    if (range) {
      const y2 = +range[6], y1 = range[3] ? +range[3] : (monIdx(range[2]) > monIdx(range[5]) ? y2 - 1 : y2);
      out.start = isoOf(new Date(Date.UTC(y1, monIdx(range[2]), +range[1])));
      out.end = isoOf(new Date(Date.UTC(y2, monIdx(range[5]), +range[4])));
    }
    const wk = t.match(/(?:at least|minimum(?: length| duration)?(?: of| is|:)?|min\.?|no (?:less|fewer) than)\s*(\d{1,2})\s*weeks?/i) || t.match(/(\d{1,2})\s*weeks?\s*(?:minimum|or more)/i);
    if (wk) out.minWeeks = +wk[1];
    const hrs = t.match(/(\d{2})\s*(?:–|-|to)\s*(\d{2})\s*(?:hrs?|hours)\b/i);
    if (hrs) { out.minHours = +hrs[1]; out.maxHours = +hrs[2]; }
    const days = t.match(/\b([1-5]|one|two|three|four|five)\s+days?\s+(?:per|a)\s+week\b/i);
    if (days) out.daysPerWeek = { one: 1, two: 2, three: 3, four: 4, five: 5 }[days[1].toLowerCase()] || +days[1];
    if (/overseas|abroad|outside the uk/i.test(t) && /fully remote|must be remote|remote only/i.test(t)) out.overseasRemoteOnly = true;
    if (/paid (internships?|placements?) (are )?(allowed and )?recommended|should be paid|paid is preferred/i.test(t)) out.paidPreferred = true;
    // Deadlines: lines like "18 November – submit your internship on …"
    const base = now ? new Date(now) : new Date();
    const deadlines = [];
    t.split('\n').forEach(line => {
      const m = line.match(new RegExp(`^\\W*(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MON_RE})(?:\\s+(20\\d\\d))?\\s*(?:–|-|:)\\s*(.{5,})$`, 'i'));
      if (!m) return;
      let y = m[3] ? +m[3] : base.getUTCFullYear();
      let d = new Date(Date.UTC(y, monIdx(m[2]), +m[1]));
      if (!m[3] && d < new Date(base.getTime() - 60 * DAY)) d = new Date(Date.UTC(y + 1, monIdx(m[2]), +m[1]));
      const label = m[4].replace(/\s*\(.*?\)\s*/g, ' ').replace(/[.;]\s*$/, '').trim();
      deadlines.push({ label: label.length > 70 ? label.slice(0, 67).replace(/\s+\S*$/, '') + '…' : label, date: isoOf(d) });
    });
    if (deadlines.length) out.deadlines = deadlines;
    return out;
  }

  const OVERSEAS = /\b(united states|usa|u\.s\.|new york|san francisco|california|texas|canada|toronto|germany|berlin|munich|france|paris|spain|madrid|barcelona|italy|milan|netherlands|amsterdam|poland|warsaw|krak[oó]w|ukraine|kyiv|ireland|dublin|india|bangalore|bengaluru|singapore|dubai|uae|australia|sydney|switzerland|zurich|sweden|stockholm|portugal|lisbon|romania|bucharest|czech|prague|estonia|tallinn|lithuania|vilnius|cyprus|israel|tel aviv|japan|tokyo|china|hong kong)\b/i;
  const UK = /\b(uk|united kingdom|england|scotland|wales|britain|london|manchester|birmingham|leeds|bristol|cambridge|oxford|reading|newcastle|edinburgh|glasgow|hertfordshire|essex|kent|surrey)\b/i;

  /**
   * Checks an internship against the placement rules in profile.intern.placement.
   * Each item has state ok | warn | fail | unknown | info. Returns null when no rules are set.
   */
  function checkPlacement(job, profile) {
    const ip = (profile && profile.intern) || {};
    const pl = ip.placement || {};
    const S0 = parseIso(pl.start), E0 = parseIso(pl.end);
    if (!S0 && !pl.minWeeks && !pl.minHours) return null;
    const title = job.title || '';
    const text = String(job.description || '') + '\n' + String(job.extraText || '');
    const low = (title + '\n' + text).toLowerCase();
    const items = [];
    const it = (key, label, state, msg) => items.push({ key, label, state, text: msg });
    const defYear = S0 ? S0.getUTCFullYear() : new Date().getUTCFullYear() + 1;

    // Dates and length
    if (S0) {
      const label = `Dates (${fmtD(S0)} – ${fmtD(E0)})`;
      const summer = /\bsummer (20\d\d )?(internship|placement|programme|program|analyst|associate|intern)|\b(june|july|august) (20\d\d|start)|\b\d{1,2}[- ]week summer\b|\bsummer 20\d\d\b/i.test(low);
      const longPlacement = /\b(9|10|11|12|13)[- ]?month (industrial )?(placement|internship)|\byear[- ]in[- ]industry\b|\bsandwich (year|placement)\b|\bplacement year\b/i.test(low);
      let start = dateNear(text, 'start(?:ing)?(?: date)?|commenc\\w*|begin(?:ning|s)?|from|joining', defYear);
      let endD = dateNear(text, 'end(?:ing)?(?: date)?|until|finish(?:ing)?|running (?:to|until)|through', defYear);
      if (!start) {
        const r = monthRange(text, defYear);
        if (r) { start = { date: r.start }; endD = endD || { date: r.end }; }
      }
      let weeks = weeksFromText(low);
      if (!weeks && start && endD && endD.date > start.date) weeks = Math.round((endD.date - start.date) / (7 * DAY));
      const sMon = S0.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }).toLowerCase();
      const startsInMonth = new RegExp(`\\b${sMon.slice(0, 3)}[a-z]* ${defYear}\\b|\\bstart(ing)? in ${sMon.slice(0, 3)}`, 'i').test(low);
      const startsInPeriod = summer && S0.getUTCMonth() >= 4 && S0.getUTCMonth() <= 7;
      let d;
      if (summer && !startsInMonth && !startsInPeriod) d = ['fail', 'Summer internship: does not cover your placement period'];
      else if (longPlacement && E0 && (E0 - S0) < 300 * DAY) d = ['fail', '12-month placement: longer than your placement period'];
      else if (start) {
        const diff = Math.round((start.date - S0) / DAY);
        const endGuess = endD && endD.date > start.date ? endD.date : weeks ? new Date(start.date.getTime() + weeks * 7 * DAY) : null;
        if (diff > 21) d = ['fail', `Starts ${fmtD(start.date)}: too late for your placement period`];
        else if (diff < -60) d = ['warn', `Starts ${fmtD(start.date)}: earlier than your period, ask if you can start ${fmtD(S0)}`];
        else if (E0 && endGuess && endGuess < new Date(E0.getTime() - 14 * DAY)) d = ['warn', `Ends around ${fmtD(endGuess)}, before ${fmtD(E0)}`];
        else d = ['ok', `Starts ${fmtD(start.date)}${endGuess ? ', ends around ' + fmtD(endGuess) : ''}`];
      } else if (startsInMonth) d = ['ok', `Starts in ${sMon} ${defYear}`];
      else d = ['unknown', `Dates not stated: ask whether ${fmtD(S0)} – ${fmtD(E0)} works`];
      it('dates', label, d[0], d[1]);
      if (pl.minWeeks) {
        if (weeks) it('weeks', `Length (at least ${pl.minWeeks} weeks)`, weeks >= pl.minWeeks ? 'ok' : 'fail', `${weeks} weeks${weeks >= pl.minWeeks ? '' : ', shorter than required'}`);
        else if (d[0] !== 'fail') it('weeks', `Length (at least ${pl.minWeeks} weeks)`, 'unknown', 'Not stated');
      }
    }

    // Hours
    if (pl.minHours) {
      const label = `Hours (${pl.minHours}–${pl.maxHours || pl.minHours} a week)`;
      const hrs = low.match(/(\d{2}(?:\.\d)?)\s*(?:-|to|–)?\s*(\d{2})?\s*(?:hours|hrs)\s*(?:per|a|\/)\s*week/) || low.match(/(\d{2}(?:\.\d)?)\s*(?:hours|hrs)\b/);
      const partTime = /\bpart[- ]?time\b/.test(low) && !/\bfull[- ]?time\b/.test(low);
      if (hrs) {
        const h = +(hrs[2] || hrs[1]);
        it('hours', label, h >= pl.minHours - 0.5 && (!pl.maxHours || h <= pl.maxHours) ? 'ok' : h < pl.minHours ? 'fail' : 'warn', hrs[0].trim());
      } else if (partTime) it('hours', label, 'fail', 'Part-time');
      else if (/\bfull[- ]?time\b/.test(low)) it('hours', label, 'ok', 'Full-time');
      else it('hours', label, 'unknown', 'Not stated');
    }

    // Days a week
    if (pl.daysPerWeek && pl.daysPerWeek < 5) {
      const flex = /\b(4|four)[- ]day(s)? (a |per )?week\b|\bcompressed hours\b|\bflexible (working|hours|schedule)\b|\bstudy day\b|\bwork around (your )?(studies|university)\b/i.test(low);
      it('days', `${pl.daysPerWeek} days a week`, flex ? 'ok' : 'info', flex ? 'Flexible hours / a 4-day week is mentioned' : `Agree ${pl.daysPerWeek} days a week with the employer`);
    }

    // Location
    const loc = String(job.location || '');
    const remote = /\bfully remote\b|\bremote[- ]first\b|\b100% remote\b|\bwork from anywhere\b/i.test(low) || (/\bremote\b/i.test(loc + ' ' + low.slice(0, 600)) && !/\bhybrid\b|\bon[- ]?site\b|\bin[- ]office\b/i.test(low.slice(0, 1500)));
    const overseas = OVERSEAS.test(loc) || (!UK.test(loc) && OVERSEAS.test(low.slice(0, 800)) && !UK.test(low.slice(0, 800)));
    const areas = ((profile && profile.areas) || []).map(a => a.toLowerCase()).filter(Boolean);
    const inArea = inAreas(loc, areas);
    if (overseas && !remote && pl.overseasRemoteOnly) it('location', 'Location', 'fail', 'Company abroad: only fully remote placements are allowed');
    else if (overseas) it('location', 'Location', remote ? 'ok' : 'warn', remote ? 'Abroad, fully remote' : 'Company abroad: check where you would work');
    else if (remote) it('location', 'Location', 'ok', 'Remote');
    else if (inArea) it('location', 'Location', 'ok', `${loc}: in your areas`);
    else if (loc && areas.length) it('location', 'Location', 'warn', `${loc}: check the commute`);

    // Pay
    if (pl.paidPreferred) {
      const unpaid = /\bunpaid\b|\bexpenses only\b|\bvoluntary (role|position|internship)\b|\bno (salary|pay)\b/i.test(low);
      const paid = !unpaid && (/£\s?\d/.test(low) || /\bpaid (internship|placement)\b|\bcompetitive (salary|pay)\b|\bper hour\b|\bstipend\b|\bliving wage\b/i.test(low) || !!job.salaryText);
      it('pay', 'Paid', unpaid ? 'warn' : paid ? 'ok' : 'unknown', unpaid ? 'Unpaid: allowed, but a paid placement is recommended' : paid ? 'Paid' : 'Not stated');
    }

    // Relevance to the degree
    const cat = job.category && job.category !== 'Other' ? job.category : detectCategory(title, text);
    const targets = ip.targetCategories || [], prio = ip.priorityCategories || [];
    if (prio.includes(cat)) it('relevance', 'Relevant to your degree', 'ok', `${cat}: a priority role`);
    else if (!targets.length || targets.includes(cat)) it('relevance', 'Relevant to your degree', cat === 'Other' ? 'warn' : 'ok', cat === 'Other' ? 'Role type unclear: check the duties are technical' : `${cat}: one of your target roles`);
    else it('relevance', 'Relevant to your degree', 'fail', `${cat} is not one of your target roles`);

    // Graduate-level duties
    const strong = (low.match(/\b(develop\w*|build\w*|design\w*|implement\w*|analy[sz]\w*|model\w*|deploy\w*|automat\w+|research\w*|prototyp\w*|evaluat\w*|architect\w*|integrat\w+|optimi[sz]\w*|data|apis?|algorithms?|pipelines?|machine learning|test(s|ing)?|python|sql|code|coding|software|retrieval)\b/g) || []).length;
    const vague = (low.match(/\b(assist with (various|general|ad hoc) tasks|general (admin|duties)|filing|data entry|making tea|answering phones|ad hoc tasks|social media posting)\b/g) || []).length;
    const short = (job.description || '').length < 500;
    const ls = vague >= 2 && strong < 4 ? 'fail' : strong >= 5 && !vague ? 'ok' : short ? 'unknown' : strong >= 2 ? 'warn' : 'fail';
    it('level', 'Graduate-level duties', ls, { ok: 'Specific technical duties', warn: 'Duties are vague: ask for a detailed job description', unknown: 'Short ad: you will need a detailed job description', fail: 'General or non-technical duties' }[ls]);

    // Who they hire
    if (/\bfinal[- ]year\b|\brecent graduates?\b|\bdegree (required|essential)\b/i.test(low) && !/\bpenultimate\b|\bsecond[- ]year\b|\b2nd[- ]year\b|\bcurrent(ly)? (studying|enrolled)\b|\bundergraduates?\b/i.test(low))
      it('eligibility', 'Who they hire', 'warn', 'Looks aimed at final-year students or graduates');
    else if (/\b(penultimate|second[- ]year|2nd[- ]year|undergraduates?|current(ly)? (studying|enrolled))\b/i.test(low)) it('eligibility', 'Who they hire', 'ok', 'Open to current students');

    // Application closing date vs your first deadline
    const first = (pl.deadlines || []).map(x => parseIso(x.date)).filter(Boolean).sort((a, b) => a - b)[0];
    const closing = dateNear(text, 'closing date|deadline|apply by|applications close', first ? first.getUTCFullYear() : new Date().getUTCFullYear());
    if (closing && first && closing.date > first) it('closing', 'Application deadline', 'warn', `Applications close ${fmtD(closing.date)}, after your ${fmtD(first)} deadline`);

    const fails = items.filter(i => i.state === 'fail').length, warns = items.filter(i => i.state === 'warn').length, unk = items.filter(i => i.state === 'unknown').length;
    const verdict = fails ? 'fail' : warns || unk >= 2 ? 'warn' : 'ok';
    return { verdict, items, category: cat, priority: prio.includes(cat) };
  }

  function computeInternChance(job, workTypes, profile) {
    const ip = (profile && profile.intern) || {};
    const p2 = { ...profile, skills: ip.skills || {}, targetCategories: ip.targetCategories || [], penalizeSchedule: false };
    const placement = checkPlacement(job, profile);
    const salary = job.salaryText ? parseSalary(job.salaryText) || null : null;
    const base = computeChance(job.title, job.description || '', workTypes, p2, job.location, { company: job.company, salary, track: 'intern', placement });
    const cat = (placement && placement.category) || (job.category && job.category !== 'Other' ? job.category : detectCategory(job.title, job.description));
    const reasons = [];
    const skillR = base.reasons.find(r => r.max === 50);
    let score = skillR ? skillR.delta : 25;
    reasons.push(skillR || { text: 'Skills', delta: score, max: 50 });
    base.reasons.filter(r => r.delta === 0 && /^(Partial credit|Required but missing)/.test(r.text)).forEach(r => reasons.push(r));
    // Role type: up to 25
    const targets = ip.targetCategories || [], prio = ip.priorityCategories || [];
    const rel = prio.includes(cat) ? 25 : (!targets.length || targets.includes(cat)) ? (cat === 'Other' ? 10 : 20) : 3;
    reasons.push({ text: `Role: ${cat}${rel === 25 ? ' (priority)' : rel === 3 ? ', not one of your target roles' : ''}`, delta: rel, max: 25 });
    score += rel;
    // Level: up to 20
    const lt = (job.title || '').toLowerCase();
    const lvl = /\b(senior|lead|principal|manager|head of)\b/.test(lt) ? 0 : INTERN_TITLE.test(job.title || '') ? 20 : /\b(junior|graduate|entry)\b/.test(lt) ? 12 : 8;
    reasons.push({ text: lvl === 20 ? 'Level: internship / placement' : lvl === 12 ? 'Level: junior / graduate, not an internship' : lvl === 0 ? 'Level: senior' : 'Level: regular role', delta: lvl, max: 20 });
    score += lvl;
    // Placement rules: missing the dates, location or role type usually means the university says no
    if (placement) {
      const fails = placement.items.filter(i => i.state === 'fail');
      const pen = Math.max(-45, fails.reduce((t, i) => t + (['dates', 'location', 'relevance'].includes(i.key) ? -25 : -8), 0));
      if (pen) { reasons.push({ text: 'Breaks placement rules: ' + fails.map(i => i.label.replace(/\s*\(.*\)/, '')).join(', '), delta: pen }); score += pen; }
    }
    const langR = base.reasons.find(r => /^Asks for /.test(r.text));
    if (langR) { reasons.push(langR); score += langR.delta; }
    const fit = Math.max(3, Math.min(97, Math.round(score)));
    const verdict = decide(fit, base.gates, base.confidence);
    score = base.gates.blocks.length ? Math.min(fit, 25) : fit;
    const label = score >= 70 ? 'High' : score >= 50 ? 'Medium' : score >= 30 ? 'Low' : 'Very low';
    return { ...base, score, fit, label, reasons, placement, intern: true, senior: lvl === 0, verdict };
  }

  const api = {
    inAreas, homeOf, coordsOf, kmBetween, TOOLS, DEFAULT_PROFILE, DEFAULT_SKILLS, VERDICTS, display, checkGates, detectLevel, yearsAsked, relevantText, decide, detectInternship, checkPlacement, computeInternChance, parsePlacementRules, CATEGORY_NAMES, WORK_TYPES, STATUSES,
    RESPONDED, INTERVIEW, OFFER,
    extractTools, myYearsOf, detectWorkTypes, detectCategory, parseSalary, extractDetails, computeChance, analyze, extractSections, buildNotes,
    statusLabel: id => (STATUSES.find(s => s.id === id) || { label: id }).label,
    statusColor: id => (STATUSES.find(s => s.id === id) || { color: '#999' }).color,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_Analyzer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
