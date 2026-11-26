/**
 * Job Tracker — Google Sheets sync.
 * Paste this file into Extensions → Apps Script inside your own sheet, run setup() once,
 * then deploy it as a web app. The extension talks to it with a token that setup()
 * generates and keeps in Script Properties (Job Tracker menu → Show sync token).
 */

const SCRIPT_VERSION = 19; // 19 = home lab tasks finished on the phone (learned skills); 18 = Precise Fit, Interview chance, CV type and Minutes columns; 17 = phone app: follow-ups recorded from the phone, status hints from Gmail (action=inbox); 16 = job links: other addresses and a pause when a site answers 429, 6-hour cache; 15 = weekly summary email on Sundays; 14 = a compact copy in Drive (JobTracker/job-tracker-latest.json) for the weekly summary; 13 = phone app: reads job ads by link, keeps your profile, quick status changes, Job ad column; 12 = 12 = how you applied, ad age, applicants, why rejected; 11 = Verdict column, bad 'Next step' dates ignored; 10 = merges a leftover pre-2.0 sheet; 9 = Type and Placement rules columns
const SHEET = 'Applications';
const SUMMARY = 'Summary';
const COLS = [
  ['id', 'ID'], ['ticket', 'Ticket'], ['title', 'Job title'], ['company', 'Company'], ['location', 'Location'],
  ['category', 'Role type'], ['workTypes', 'Work type'], ['salary', 'Salary'], ['platform', 'Source'],
  ['appliedAt', 'Applied on'], ['status', 'Status'], ['chance', 'Fit %'], ['nextDate', 'Next step'],
  ['notes', 'Notes'], ['missing', 'Missing skills'], ['tools', 'Tools'], ['details', 'Key details'],
  ['url', 'Link'], ['updated', '_updated'], ['benefits', 'Benefits'], ['contacts', 'Contacts'], ['followup', 'Follow-up'],
  ['track', 'Type'], ['placement', 'Placement rules'], ['verdict', 'Verdict'],
  ['method', 'Applied via'], ['cover', 'Cover letter'], ['cv', 'CV sent'], ['adAge', 'Ad age (days)'], ['applicants', 'Applicants'],
  ['rejDays', 'Days to rejection'], ['outcome', 'Why rejected'], ['reqs', 'Ad demands'], ['description', 'Job ad'],
  ['fit2', 'Precise Fit %'], ['predicted', 'Interview chance %'], ['cvKind', 'CV type'], ['minutes', 'Minutes spent'],
];
const C = {}; COLS.forEach(([k], i) => { C[k] = i + 1; });
// [status, status cell background, text colour, light tint for the whole row]
const STATUSES = [
  ['Applied', '#e3eaf2', '#3b4b5c', ''],
  ['Screening', '#bfe1f6', '#0b5d8a', '#f1f8fd'],
  ['Test task', '#c9d8fb', '#2a4fa0', '#f2f5fe'],
  ['Interview 1', '#e1d4f7', '#4b2a8a', '#f7f3fd'],
  ['Interview 2', '#d0baf1', '#4b2a8a', '#f5effc'],
  ['Interview 3', '#bb9ee9', '#3a1d73', '#f2eafb'],
  ['Offer', '#a8dfbd', '#0f5c32', '#ecf8f0'],
  ['Offer accepted', '#1e8e3e', '#ffffff', '#e1f3e7'],
  ['Offer declined', '#e6ebc8', '#5f6b2e', ''],
  ['Rejected', '#f4c2bd', '#a52714', '#fdf0ef'],
  ['No response', '#e8e8e8', '#757575', ''],
  ['Withdrawn', '#ede4d3', '#7a6a4a', ''],
];
const MUTED = ['No response', 'Withdrawn', 'Offer declined'];

// Sheets created by versions before 2.0 used Russian names and labels. setup() migrates them.
const LEGACY_SHEET = 'Заявки', LEGACY_SUMMARY = 'Сводка';
const LEGACY_STATUS = {
  'Подано': 'Applied', 'Ответили / скрининг': 'Screening', 'Тестовое задание': 'Test task',
  'Интервью 1': 'Interview 1', 'Интервью 2': 'Interview 2', 'Интервью 3': 'Interview 3',
  'Оффер': 'Offer', 'Оффер принят': 'Offer accepted', 'Оффер отклонён мной': 'Offer declined',
  'Отказ': 'Rejected', 'Нет ответа': 'No response', 'Отозвал заявку': 'Withdrawn',
};
const LEGACY_VALUE = { 'Другое': 'Other', 'Сайт компании': 'Company website', 'Рекрутер / агентство': 'Recruiter / agency' };

// ---------- Token ----------
function getToken_() {
  const props = PropertiesService.getScriptProperties();
  let t = props.getProperty('SYNC_TOKEN');
  if (!t) { t = Utilities.getUuid().replace(/-/g, ''); props.setProperty('SYNC_TOKEN', t); }
  return t;
}
function checkToken_(t) {
  const saved = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
  return !!saved && t === saved;
}
/** Menu: shows the token to paste into the extension settings. */
function showToken() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('Job Tracker sync token', getToken_() + '\n\nPaste it into Job Tracker → Skills & settings → Google Sheet. Treat it like a password.', ui.ButtonSet.OK);
}
/** Menu: creates a new token. The old one stops working at once. */
function resetToken() {
  PropertiesService.getScriptProperties().deleteProperty('SYNC_TOKEN');
  showToken();
}

/** The Job Tracker menu in the sheet. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Job Tracker')
    .addItem('Tidy up the sheet', 'setup')
    .addItem('Show sync token', 'showToken')
    .addItem('Save a copy to Drive now', 'snapshotNow')
    .addItem('Weekly email: turn on / change', 'setupWeeklyEmail')
    .addItem('Weekly email: send now', 'weeklyEmail')
    .addItem('Weekly email: turn off', 'stopWeeklyEmail')
    .addItem('Check job emails now (phone app hints)', 'scanInbox')
    .addItem('Create a new sync token', 'resetToken')
    .addSeparator()
    .addItem('Expand all columns', 'expandAll')
    .addItem('Collapse details', 'collapseAll')
    .addToUi();
}

/** Run once by hand (or from the Job Tracker menu): formats the sheet and builds the summary. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  migrateLegacy_(ss);
  const sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET, 0);
  formatSheet_(sh);
  fillType_(sh);
  buildSummary_(ss);
  // The empty default sheet only gets in the way
  ss.getSheets().forEach(x => { if (/^(Лист|Sheet)\s?1$/.test(x.getName()) && x.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(x); });
  getToken_();
  Logger.log('Setup done. Get the sync token from the Job Tracker menu → Show sync token.');
  return 'Done';
}

/**
 * Pre-2.0 sheets ("Заявки", "Сводка") used Russian labels.
 * Only the old sheet: it is renamed and its values translated.
 * Both old and new sheets: rows missing from the new sheet are copied over
 * (translated), then the old sheets are removed so there is one set of tabs.
 */
function migrateLegacy_(ss) {
  const old = ss.getSheetByName(LEGACY_SHEET);
  const cur = ss.getSheetByName(SHEET);
  if (old && !cur) {
    old.setName(SHEET);
    const last = old.getLastRow();
    if (last >= 2) {
      [[C.status, LEGACY_STATUS], [C.category, LEGACY_VALUE], [C.platform, LEGACY_VALUE]].forEach(([col, map]) => {
        const r = old.getRange(2, col, last - 1, 1);
        r.clearDataValidations();
        r.setValues(r.getValues().map(([v]) => [map[String(v).trim()] || v]));
      });
    }
  } else if (old && cur) {
    mergeLegacyRows_(old, cur);
    ss.deleteSheet(old);
  }
  const sm = ss.getSheetByName(LEGACY_SUMMARY);
  if (sm) ss.deleteSheet(sm);
}

function mergeLegacyRows_(old, cur) {
  const oLast = old.getLastRow();
  if (oLast < 2) return 0;
  const n = Math.min(old.getLastColumn(), COLS.length);
  const cLast = cur.getLastRow();
  const have = new Set(cLast >= 2 ? cur.getRange(2, C.id, cLast - 1, 1).getValues().map(r => String(r[0])) : []);
  const haveTicket = new Set(cLast >= 2 ? cur.getRange(2, C.ticket, cLast - 1, 1).getValues().map(r => String(r[0])) : []);
  const vals = old.getRange(2, 1, oLast - 1, n).getValues();
  const links = old.getRange(2, C.url, oLast - 1, 1).getRichTextValues();
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const add = [];
  vals.forEach((row, i) => {
    const id = String(row[C.id - 1] || ''), ticket = String(row[C.ticket - 1] || '');
    if (!id && !row[C.title - 1] && !row[C.company - 1]) return;
    if ((id && have.has(id)) || (!id && ticket && haveTicket.has(ticket))) return;
    const out = COLS.map((_, j) => j < n ? row[j] : '');
    out[C.status - 1] = LEGACY_STATUS[String(out[C.status - 1]).trim()] || out[C.status - 1];
    out[C.category - 1] = LEGACY_VALUE[String(out[C.category - 1]).trim()] || out[C.category - 1];
    out[C.platform - 1] = LEGACY_VALUE[String(out[C.platform - 1]).trim()] || out[C.platform - 1];
    ['appliedAt', 'nextDate'].forEach(k => {
      const v = out[C[k] - 1];
      if (v && !(v instanceof Date)) { const iso = toIsoDate_(v, tz); const [y, m, d] = iso.split('-').map(Number); if (y && m && d) out[C[k] - 1] = new Date(y, m - 1, d); }
    });
    const l = links[i][0] && links[i][0].getLinkUrl();
    if (l) out[C.url - 1] = l;
    if (!out[C.track - 1]) out[C.track - 1] = 'Job';
    add.push(out);
  });
  if (add.length) {
    const first = cur.getLastRow() + 1;
    cur.getRange(first, 1, add.length, COLS.length).setValues(add);
    decorateRows_(cur, first, add.length);
  }
  Logger.log(`Old sheet merged: ${add.length} rows copied, ${vals.length - add.length} were already there.`);
  return add.length;
}

/** Rows from before 2.1 have no Type: they are jobs. Does not touch _updated. */
function fillType_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return;
  const r = sh.getRange(2, C.track, last - 1, 1);
  const ids = sh.getRange(2, C.id, last - 1, 1).getValues();
  const v = r.getValues();
  let changed = false;
  v.forEach((x, i) => { if (!x[0] && ids[i][0]) { x[0] = 'Job'; changed = true; } });
  if (changed) r.setValues(v);
}

const ROW_H = 30;
// Column groups collapsed by default; the "+" above the sheet expands them.
// Long text stays hidden; a short version shows in the note on the job title.
const GROUPS = [['location', 'workTypes'], ['notes', 'details'], ['benefits', 'contacts'], ['cover', 'cv']];

function formatSheet_(sh) {
  const n = COLS.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  const maxRows = Math.max(sh.getMaxRows(), 1000);
  if (sh.getMaxRows() < maxRows) sh.insertRowsAfter(sh.getMaxRows(), maxRows - sh.getMaxRows());
  const body = sh.getRange(2, 1, maxRows - 1, n);

  // Header
  sh.getRange(1, 1, 1, n).setValues([COLS.map(c => c[1])])
    .setFontWeight('bold').setBackground('#17324a').setFontColor('#ffffff')
    .setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(1, 36);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(C.title);
  sh.hideColumns(C.id); sh.hideColumns(C.updated); sh.hideColumns(C.description);

  // Text never stretches a row: long values are clipped and show in full when you click the cell
  body.setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP).setVerticalAlignment('middle').setFontSize(10);
  const last = sh.getLastRow();
  if (last >= 2) sh.setRowHeightsForced(2, last - 1, ROW_H);

  const widths = { ticket: 82, title: 230, company: 150, location: 120, category: 150, workTypes: 140, salary: 120,
    platform: 95, appliedAt: 92, status: 165, chance: 64, nextDate: 100, notes: 260, missing: 170, tools: 200, details: 260, url: 80, benefits: 260, contacts: 260, followup: 110, track: 95, placement: 110, verdict: 100,
    method: 150, cover: 120, cv: 160, adAge: 80, applicants: 85, rejDays: 90, outcome: 200, reqs: 240 };
  Object.keys(widths).forEach(k => sh.setColumnWidth(C[k], widths[k]));
  ['ticket', 'appliedAt', 'chance', 'nextDate', 'url', 'adAge', 'applicants', 'rejDays'].forEach(k => sh.getRange(2, C[k], maxRows - 1, 1).setHorizontalAlignment('center'));
  sh.getRange(2, C.appliedAt, maxRows - 1, 1).setNumberFormat('dd/mm/yyyy');
  sh.getRange(2, C.nextDate, maxRows - 1, 1).setNumberFormat('dd/mm/yyyy')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build());
  sh.getRange(2, C.chance, maxRows - 1, 1).setNumberFormat('0');
  sh.getRange(2, C.title, maxRows - 1, 1).setFontWeight('bold');

  // Status: drop-down list
  const statusRange = sh.getRange(2, C.status, maxRows - 1, 1);
  statusRange.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUSES.map(s => s[0]), true).setAllowInvalid(false).build());
  statusRange.setFontWeight('bold').setHorizontalAlignment('center');
  sh.setConditionalFormatRules(colorRules_(sh, maxRows));
  // Banded rows and a filter for searching and sorting
  sh.getBandings().forEach(b => b.remove());
  sh.getRange(1, 1, maxRows, n).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor('#17324a');
  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, maxRows, n).createFilter();

  // Collapsed column groups (old groups are removed and rebuilt)
  for (let c = 1; c <= n; c++) {
    const d = sh.getColumnGroupDepth(c);
    if (d > 0) { try { sh.getColumnGroup(c, d).expand(); } catch (e) { /* already expanded */ } }
  }
  for (let c = 1; c <= n; c++) { while (sh.getColumnGroupDepth(c) > 0) sh.getRange(1, c).shiftColumnGroupDepth(-1); }
  sh.showColumns(C.ticket, n - C.ticket + 1);
  sh.hideColumns(C.id); sh.hideColumns(C.updated); sh.hideColumns(C.description);
  GROUPS.forEach(([a, b]) => {
    if (sh.getColumnGroupDepth(C[a]) === 0) sh.getRange(1, C[a], 1, C[b] - C[a] + 1).shiftColumnGroupDepth(1);
    const g = sh.getColumnGroup(C[a], 1);
    if (g) g.collapse();
  });

  // Short links and notes for existing rows
  if (last >= 2) decorateRows_(sh, 2, last - 1);
}

/** Colours. Order matters: rules higher in the list win. */
function colorRules_(sh, maxRows) {
  const sep = detectSep_(sh);
  const col = k => sh.getRange(1, C[k]).getA1Notation().replace(/\d+/g, '');
  const K = '$' + col('status'), J = '$' + col('appliedAt'), M = '$' + col('nextDate');
  const range = k => sh.getRange(2, C[k], maxRows - 1, 1);
  const rows = sh.getRange(2, 2, maxRows - 1, COLS.length - 1);
  const R = [];
  const rule = () => SpreadsheetApp.newConditionalFormatRule();

  // 1. Status cell: a strong colour per stage
  STATUSES.forEach(([label, bg, fg]) => R.push(rule().whenTextEqualTo(label).setBackground(bg).setFontColor(fg).setRanges([range('status')]).build()));

  // 2. Fit: red → amber → green scale
  R.push(rule().setGradientMinpointWithValue('#f28b82', SpreadsheetApp.InterpolationType.NUMBER, '30')
    .setGradientMidpointWithValue('#fde68a', SpreadsheetApp.InterpolationType.NUMBER, '55')
    .setGradientMaxpointWithValue('#5bb974', SpreadsheetApp.InterpolationType.NUMBER, '80')
    .setRanges([range('chance')]).build());

  // 3. Next step: overdue in red, today to two days ahead in orange
  R.push(rule().whenFormulaSatisfied(`=AND(${M}2<>""${sep}${M}2<TODAY())`).setBackground('#f4c2bd').setFontColor('#a52714').setBold(true).setRanges([range('nextDate')]).build());
  R.push(rule().whenFormulaSatisfied(`=AND(${M}2<>""${sep}${M}2<=TODAY()+2)`).setBackground('#fcd9a8').setFontColor('#8a4b00').setBold(true).setRanges([range('nextDate')]).build());

  // 4. Applied more than 14 days ago: time to follow up
  R.push(rule().whenFormulaSatisfied(`=AND(${K}2="Applied"${sep}${J}2<>""${sep}${J}2<TODAY()-14)`).setBackground('#fde68a').setFontColor('#7a5510').setRanges([range('appliedAt')]).build());

  // 4b. Application type and placement rules
  R.push(rule().whenTextEqualTo('Internship').setBackground('#efe6fb').setFontColor('#4b2a8a').setBold(true).setRanges([range('track')]).build());
  R.push(rule().whenTextEqualTo('Fits').setBackground('#d3eedf').setFontColor('#0f5c32').setRanges([range('placement')]).build());
  R.push(rule().whenTextEqualTo('Check').setBackground('#fbeccc').setFontColor('#7a5510').setRanges([range('placement')]).build());
  R.push(rule().whenTextEqualTo('Breaks rules').setBackground('#f6d9d6').setFontColor('#8f2f26').setRanges([range('placement')]).build());

  // 5. Whole row: a light tint of the stage; closed applications in grey text
  STATUSES.forEach(([label, , , tint]) => {
    if (tint) R.push(rule().whenFormulaSatisfied(`=${K}2="${label}"`).setBackground(tint).setRanges([rows]).build());
  });
  MUTED.forEach(label => R.push(rule().whenFormulaSatisfied(`=${K}2="${label}"`).setFontColor('#9aa0a6').setRanges([rows]).build()));
  return R;
}

/** "Open" instead of a long URL, plus notes with the full key details. */
function decorateRows_(sh, start, count) {
  const urls = sh.getRange(start, C.url, count, 1);
  const uv = urls.getValues(), rt = urls.getRichTextValues();
  const newRt = uv.map((r, i) => {
    const link = (rt[i][0] && rt[i][0].getLinkUrl()) || (/^https?:/.test(String(r[0])) ? String(r[0]) : '');
    return [link ? SpreadsheetApp.newRichTextValue().setText('Open').setLinkUrl(link).build()
      : SpreadsheetApp.newRichTextValue().setText(String(r[0] || '')).build()];
  });
  urls.setRichTextValues(newRt);
  const det = sh.getRange(start, C.details, count, 1);
  det.setNotes(det.getValues().map(r => [r[0] ? '• ' + String(r[0]).split(' • ').join('\n• ') : '']));
  // Note on the job title: missing skills, notes, benefits
  const rows = sh.getRange(start, 1, count, COLS.length).getValues();
  sh.getRange(start, C.title, count, 1).setNotes(rows.map(r => {
    const miss = String(r[C.missing - 1] || ''), notes = String(r[C.notes - 1] || ''), ben = String(r[C.benefits - 1] || '');
    const parts = [];
    if (miss) parts.push('Missing: ' + miss);
    if (notes) parts.push(notes.length > 1500 ? notes.slice(0, 1500) + '…' : notes);
    if (ben) parts.push('Benefits:\n• ' + ben.split(' • ').join('\n• '));
    return [parts.join('\n\n')];
  }));
  const ben = sh.getRange(start, C.benefits, count, 1);
  ben.setNotes(ben.getValues().map(r => [r[0] ? '• ' + String(r[0]).split(' • ').join('\n• ') : '']));
  const notes = sh.getRange(start, C.notes, count, 1);
  notes.setNotes(notes.getValues().map(r => [String(r[0] || '').length > 40 ? String(r[0]) : '']));
}

function expandAll() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
  GROUPS.forEach(([a]) => { const g = sh.getColumnGroup(C[a], 1); if (g) g.expand(); });
}
function collapseAll() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
  GROUPS.forEach(([a]) => { const g = sh.getColumnGroup(C[a], 1); if (g) g.collapse(); });
}

// Some locales separate formula arguments with ";" instead of ",". Detect which one this sheet uses.
function detectSep_(sh) {
  const cell = sh.getRange('Z1');
  cell.setFormula('=SUM(1,2)');
  SpreadsheetApp.flush();
  const ok = cell.getDisplayValue() === '3';
  cell.clearContent();
  return ok ? ',' : ';';
}

function buildSummary_(ss) {
  const sm = ss.getSheetByName(SUMMARY) || ss.insertSheet(SUMMARY, 1);
  sm.clear();
  const s = detectSep_(sm);
  const R = `'${SHEET}'!`;
  const cnt = label => `COUNTIF(${R}K2:K${s}"${label}")`;
  const inList = labels => labels.map(cnt).join('+');
  const responded = ['Screening', 'Test task', 'Interview 1', 'Interview 2', 'Interview 3', 'Offer', 'Offer accepted', 'Offer declined', 'Rejected'];
  const interviews = ['Test task', 'Interview 1', 'Interview 2', 'Interview 3', 'Offer', 'Offer accepted', 'Offer declined'];
  const offers = ['Offer', 'Offer accepted', 'Offer declined'];
  const rows = [
    ['Applications summary', ''],
    ['Total applied', `=COUNTA(${R}A2:A)`],
    ['Last 7 days', `=COUNTIF(${R}J2:J${s}">="&(TODAY()-7))`],
    ['Responses', `=${inList(responded)}`],
    ['Interviews', `=${inList(interviews)}`],
    ['Offers', `=${inList(offers)}`],
    ['Average fit, %', `=IFERROR(ROUND(AVERAGE(${R}L2:L))${s}"—")`],
    ['', ''],
    ['By status', ''],
  ].concat(STATUSES.map(([l]) => [l, `=${cnt(l)}`]));
  sm.getRange(1, 1, rows.length, 2).setValues(rows.map(r => [r[0], '']));
  rows.forEach((r, i) => { if (r[1]) sm.getRange(i + 1, 2).setFormula(r[1]); });
  sm.getRange('A1').setFontSize(14).setFontWeight('bold');
  sm.getRange('A9').setFontWeight('bold');
  sm.getRange('A2:A7').setFontWeight('bold');
  sm.getRange('D1').setValue('By source').setFontWeight('bold');
  sm.getRange('D2').setFormula(`=IFERROR(QUERY(${R}I2:I${s}"select I, count(I) where I is not null group by I order by count(I) desc label count(I) ''"${s}0)${s}"")`);
  sm.setColumnWidth(1, 200); sm.setColumnWidth(4, 160);
  sm.getRange(1, 1, 1, 5).setBorder(false, false, true, false, false, false);
  STATUSES.forEach(([, bg, fg], i) => sm.getRange(10 + i, 1).setBackground(bg).setFontColor(fg).setFontWeight('bold'));
  const legend = [
    ['How to read the colours', ''],
    ['Status', 'The cell colour shows the stage: blue response, purple interview, green offer, red rejected, grey closed'],
    ['Row', 'A light tint of the same stage; grey text means the application is closed'],
    ['Fit %', 'Red below 40, amber around 55, green above 70'],
    ['Next step', 'Orange today or within two days, red overdue'],
    ['Applied on', 'Amber when applied more than 14 days ago with no reply: time to follow up'],
  ];
  sm.getRange(24, 1, legend.length, 2).setValues(legend);
  sm.getRange(24, 1).setFontWeight('bold');
  sm.getRange(25, 1, legend.length - 1, 1).setFontWeight('bold');
  sm.getRange(25, 2, legend.length - 1, 1).setFontColor('#5a6b7d');
  sm.getRange('A31').setValue(`Counts use the current status. Change statuses on the "${SHEET}" sheet and the extension picks them up.`).setFontColor('#5a6b7d');
}

/** When you edit the sheet (on your phone, say), record when the row changed. */
function onEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== SHEET) return;
  const r0 = e.range.getRow(), n = e.range.getNumRows();
  if (r0 + n - 1 < 2) return;
  const start = Math.max(2, r0), count = r0 + n - start;
  const now = Date.now();
  sh.getRange(start, C.updated, count, 1).setValues(Array.from({ length: count }, () => [now]));
  if (count <= 20) { sh.setRowHeightsForced(start, count, ROW_H); decorateRows_(sh, start, count); }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function ensureSheet_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET);
  // First call after an update: old Russian tabs left over, or new columns without a header
  if (!sh || ss.getSheetByName(LEGACY_SHEET) || ss.getSheetByName(LEGACY_SUMMARY) || sh.getMaxColumns() < COLS.length || sh.getRange(1, COLS.length).getValue() !== COLS[COLS.length - 1][1]) setup();
  return ss.getSheetByName(SHEET);
}

function toIsoDate_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  if (!v) return '';
  const m = String(v).match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  return m ? `${m[3]}-${('0' + m[2]).slice(-2)}-${('0' + m[1]).slice(-2)}` : String(v);
}

/** GET: returns the sheet rows to the extension. */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!checkToken_(p.token)) return json_({ ok: false, error: 'Wrong token' });
  const ss = SpreadsheetApp.getActive();
  const sh = ensureSheet_();
  if (p.action === 'ping') return json_({ ok: true, version: SCRIPT_VERSION, name: ss.getName(), rows: Math.max(0, sh.getLastRow() - 1) });
  if (p.action === 'fetchJob') return json_(fetchJob_(p.url));
  if (p.action === 'profile') return json_({ ok: true, profile: readProfile_(), learned: readLearned_() });
  if (p.action === 'inbox') return json_(inbox_(p.force === '1'));

  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const tz = ss.getSpreadsheetTimeZone();
    const last = sh.getLastRow();
    if (last < 2) return json_({ ok: true, rows: [] });
    const values = sh.getRange(2, 1, last - 1, COLS.length).getValues();
    const links = sh.getRange(2, C.url, last - 1, 1).getRichTextValues();
    values.forEach((row, i) => { const l = links[i][0] && links[i][0].getLinkUrl(); if (l) row[C.url - 1] = l; });
    const out = [];
    values.forEach((row, i) => {
      if (!row[C.title - 1] && !row[C.company - 1] && !row[C.id - 1]) return;
      if (!row[C.id - 1]) { // a row added by hand in the sheet
        row[C.id - 1] = 's' + Date.now().toString(36) + i;
        row[C.updated - 1] = Date.now();
        sh.getRange(i + 2, C.id).setValue(row[C.id - 1]);
        sh.getRange(i + 2, C.updated).setValue(row[C.updated - 1]);
      }
      const o = {};
      COLS.forEach(([k], j) => { o[k] = row[j]; });
      o.appliedAt = toIsoDate_(o.appliedAt, tz);
      o.nextDate = toIsoDate_(o.nextDate, tz);
      o.updated = Number(o.updated) || 0;
      out.push(o);
    });
    return json_({ ok: true, rows: out });
  } finally { lock.releaseLock(); }
}

// ---------- Phone app (3.7) ----------
// Job boards the phone app may ask this script to read. The request comes from Google's servers,
// not from your browser, so a site's bot protection cannot block your own browser for it.
const JOB_HOSTS = /(^|\.)(linkedin\.com|indeed\.(com|co\.uk)|reed\.co\.uk|totaljobs\.com|cwjobs\.co\.uk|cv-library\.co\.uk|it-jobs\.co\.uk|jobs\.ac\.uk|adzuna\.co\.uk|glassdoor\.(com|co\.uk)|monster\.co\.uk|ziprecruiter\.co\.uk|brightnetwork\.co\.uk|gradcracker\.com|prospects\.ac\.uk|targetjobs\.co\.uk|findajob\.dwp\.gov\.uk|tes\.com|nhsjobs\.com|jobs\.nhs\.uk|myworkdayjobs\.com|greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com|teamtailor\.com|bamboohr\.com|recruitee\.com|eteach\.com|jobsgopublic\.com)$/i;
function fetchJob_(url) {
  let u;
  try { u = String(url || '').trim(); if (!/^https:\/\//i.test(u)) throw new Error(); } catch (e) { return { ok: false, error: 'Not a link' }; }
  const host = u.replace(/^https:\/\/([^/?#]+).*/i, '$1').toLowerCase();
  if (!JOB_HOSTS.test(host)) return { ok: false, error: 'This site is not on the list of job boards the script reads. Paste the ad text instead.' };
  // LinkedIn shows a logged-out copy of each job at several addresses; when one answers 429
  // (too many requests from Google's servers) the next one often still works
  const li = u.match(/linkedin\.com\/.*?(?:currentJobId=|\/jobs\/view\/(?:[^/?#]*-)?)(\d{6,})/i);
  const canon = li ? 'https://www.linkedin.com/jobs/view/' + li[1] + '/' : u;
  const tries = li ? ['https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/' + li[1], 'https://uk.linkedin.com/jobs/view/' + li[1], 'https://www.linkedin.com/jobs/view/' + li[1] + '/'] : [u, u];
  // The same ad asked again within 6 hours comes from the cache, without asking the site
  const cache = CacheService.getScriptCache(), key = 'job:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, canon));
  const hit = cache.get(key);
  if (hit) return { ok: true, status: 200, url: canon, html: hit, cached: true };
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36', 'Accept-Language': 'en-GB,en;q=0.9', 'Accept': 'text/html,application/xhtml+xml' };
  let last = 0;
  for (let i = 0; i < tries.length; i++) {
    if (i) Utilities.sleep(1500 * i);
    try {
      const res = UrlFetchApp.fetch(tries[i], { muteHttpExceptions: true, followRedirects: true, headers });
      last = res.getResponseCode();
      if (last < 400) {
        const html = res.getContentText();
        // A sign-in wall is not the ad: try the next address
        if (/authwall|sign in to view|join linkedin/i.test(html.slice(0, 20000)) && !/description|show-more-less-html/i.test(html)) { last = 401; continue; }
        try { cache.put(key, html.slice(0, 95000), 6 * 3600); } catch (e) { /* too big to cache */ }
        return { ok: true, status: last, url: canon, html: html.slice(0, 900000) };
      }
      if (last !== 429 && last !== 999 && last !== 403 && last < 500) break;
    } catch (e) { last = -1; }
  }
  return { ok: false, status: last, error: last === 429 || last === 999 ? 'busy' : 'The site answered ' + last + '. Paste the ad text instead.' };
}
// Your skills and settings, sent by the extension, so the phone scores jobs the same way
const PROFILE_SHEET = '_profile';
function readProfile_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(PROFILE_SHEET);
  if (!sh) return null;
  try { return JSON.parse(sh.getRange(1, 1).getValue() || 'null'); } catch (e) { return null; }
}
function saveProfile_(profile) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(PROFILE_SHEET);
  if (!sh) { sh = ss.insertSheet(PROFILE_SHEET); sh.hideSheet(); }
  sh.getRange(1, 1).setValue(JSON.stringify(profile).slice(0, 49000));
}

// Skills practised in the home lab, marked on the phone: { tool: 'yyyy-mm-dd' }. The extension adds them
// to your skills as Basic, from a home lab, on its next sync.
const LEARNED_SHEET = '_learned';
function readLearned_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(LEARNED_SHEET);
  if (!sh) return {};
  try { return JSON.parse(sh.getRange(1, 1).getValue() || '{}'); } catch (e) { return {}; }
}
function saveLearned_(add) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(LEARNED_SHEET);
  if (!sh) { sh = ss.insertSheet(LEARNED_SHEET); sh.hideSheet(); }
  const cur = readLearned_();
  Object.keys(add).slice(0, 200).forEach(k => { const v = add[k]; if (v === null) delete cur[k]; else if (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) && k.length <= 60) cur[k] = String(v); });
  sh.getRange(1, 1).setValue(JSON.stringify(cur));
}

// ---------- Copy for the weekly summary (14) ----------
// JobTracker/job-tracker-latest.json in your Drive: the applications without ad texts, contacts or
// notes, so a scheduled Claude task can read the week without access to the sync token.
const SNAPSHOT_FOLDER = 'JobTracker', SNAPSHOT_FILE = 'job-tracker-latest.json';
const SNAPSHOT_KEYS = ['ticket', 'title', 'company', 'location', 'category', 'workTypes', 'salary', 'platform', 'appliedAt', 'status', 'chance', 'verdict', 'nextDate', 'followup', 'track', 'method', 'cover', 'cv', 'adAge', 'applicants', 'rejDays', 'outcome', 'reqs', 'missing', 'updated'];
function writeSnapshot_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET);
  if (!sh || sh.getLastRow() < 2) return 0;
  const tz = ss.getSpreadsheetTimeZone();
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, COLS.length).getValues();
  const apps = vals.filter(r => r[C.id - 1]).map(r => {
    const o = {};
    SNAPSHOT_KEYS.forEach(k => { let v = r[C[k] - 1]; if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd'); o[k] = v === '' ? null : v; });
    return o;
  });
  const json = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), timeZone: tz, apps });
  const it = DriveApp.getFoldersByName(SNAPSHOT_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(SNAPSHOT_FOLDER);
  const files = folder.getFilesByName(SNAPSHOT_FILE);
  if (files.hasNext()) files.next().setContent(json);
  else folder.createFile(SNAPSHOT_FILE, json, MimeType.PLAIN_TEXT);
  PropertiesService.getScriptProperties().setProperty('SNAPSHOT_AT', String(Date.now()));
  return apps.length;
}
/** Menu, or run once in the editor: asks Google for Drive access and writes the copy. */
function snapshotNow() {
  const n = writeSnapshot_();
  Logger.log('Saved ' + n + ' applications to ' + SNAPSHOT_FOLDER + '/' + SNAPSHOT_FILE);
  try { SpreadsheetApp.getUi().alert('Saved ' + n + ' applications to Drive: ' + SNAPSHOT_FOLDER + '/' + SNAPSHOT_FILE); } catch (e) { /* run from the editor */ }
}
// After a sync, at most every 10 minutes; a missing Drive permission never breaks the sync
function maybeSnapshot_() {
  try {
    const last = Number(PropertiesService.getScriptProperties().getProperty('SNAPSHOT_AT') || 0);
    if (Date.now() - last > 10 * 60e3) writeSnapshot_();
  } catch (e) { /* run snapshotNow once in the editor to allow Drive */ }
}

// ---------- Weekly summary email (15) ----------
// Every Sunday afternoon: the week's applications, replies and status changes, follow-ups due,
// next steps, job emails from your inbox and interviews in your calendar, sent to one address
// you choose (Script Properties, never in the code). Turn it on from the Job Tracker menu.
const WEEKLY_TO = 'WEEKLY_TO', WEEKLY_LINK = 'WEEKLY_LINK';
const RU_STATUS = { 'Applied': 'Отклик', 'Screening': 'Скрининг', 'Test task': 'Тестовое', 'Interview 1': 'Интервью 1', 'Interview 2': 'Интервью 2', 'Interview 3': 'Интервью 3', 'Offer': 'Оффер', 'Offer accepted': 'Принял оффер', 'Offer declined': 'Отказался', 'Rejected': 'Отказ', 'No response': 'Нет ответа', 'Withdrawn': 'Отозвал' };
const REPLIED_ST = ['Screening', 'Test task', 'Interview 1', 'Interview 2', 'Interview 3', 'Offer', 'Offer accepted', 'Offer declined', 'Rejected'];
const INTERVIEW_ST = ['Screening', 'Test task', 'Interview 1', 'Interview 2', 'Interview 3', 'Offer', 'Offer accepted'];
const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const RU_DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** Menu: asks for the address and the summary page link, schedules Sundays at 14:00, sends one now. */
function setupWeeklyEmail() {
  const ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties();
  const cur = props.getProperty(WEEKLY_TO) || Session.getEffectiveUser().getEmail();
  const a = ui.prompt('Weekly email', 'Send the weekly summary to (email address):\n' + (cur ? 'Now: ' + cur : ''), ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const to = (a.getResponseText().trim() || cur);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { ui.alert('That is not an email address.'); return; }
  const l = ui.prompt('Weekly email', 'Optional: link to your summary page (https://claude.ai/artifact/…). Leave empty to skip.', ui.ButtonSet.OK_CANCEL);
  const link = l.getSelectedButton() === ui.Button.OK ? l.getResponseText().trim() : '';
  props.setProperty(WEEKLY_TO, to);
  if (/^https:\/\//.test(link)) props.setProperty(WEEKLY_LINK, link); else if (link === '') props.deleteProperty(WEEKLY_LINK);
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'weeklyEmail').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('weeklyEmail').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(14).inTimezone(SpreadsheetApp.getActive().getSpreadsheetTimeZone()).create();
  weeklyEmail();
  ui.alert('Done. A summary was just sent to ' + to + ', and it will come every Sunday around 14:00.');
}
function stopWeeklyEmail() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'weeklyEmail').forEach(t => ScriptApp.deleteTrigger(t));
  try { SpreadsheetApp.getUi().alert('Weekly email turned off.'); } catch (e) { /* from the editor */ }
}

// Last week's status of every application, so the email lists real changes and not every row
// the extension re-sent. Kept in a hidden sheet: Script Properties are too small for it.
const WEEKLY_SHEET = '_weekly';
function readBaseline_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(WEEKLY_SHEET);
  if (!sh) return null;
  try { return JSON.parse(sh.getRange(1, 1).getValue() || 'null'); } catch (e) { return null; }
}
function saveBaseline_(rows) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(WEEKLY_SHEET);
  if (!sh) { sh = ss.insertSheet(WEEKLY_SHEET); sh.hideSheet(); }
  const map = {}; rows.forEach(r => { map[r.id] = String(r.status); });
  sh.getRange(1, 1).setValue(JSON.stringify(map).slice(0, 49000));
}

/** Pure part: the week's numbers from the sheet rows (objects keyed by COLS). */
function weeklyStats_(rows, now, baseline) {
  const DAY = 864e5;
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const start = new Date(end.getTime() - 7 * DAY + 1);
  const t = v => { if (v instanceof Date) return v.getTime(); const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() : NaN; };
  const inWeek = x => x >= start.getTime() && x <= end.getTime();
  const isB = r => /part[- ]?time|term[- ]?time|weekend|temporary|shift|graduate \/ placement/i.test(String(r.workTypes || '') + ' ' + String(r.title || '')) || /part[- ]?time|weekend|saturday|term[- ]?time/i.test(String(r.title || ''));
  const applied = rows.filter(r => inWeek(t(r.appliedAt)));
  const real = r => String(r.title || '').trim() && String(r.company || '').trim();
  // With last week's statuses: every status that changed. The first time: replies to this week's applications only
  const changed = rows.filter(r => real(r) && String(r.status) !== 'Applied' && (baseline ? baseline[r.id] !== undefined ? baseline[r.id] !== String(r.status) : String(r.status) !== 'Applied' && inWeek(t(r.appliedAt)) : inWeek(t(r.appliedAt)) && REPLIED_ST.indexOf(String(r.status)) >= 0));
  const due = rows.filter(r => real(r) && String(r.status) === 'Applied' && !r.followup && now.getTime() - t(r.appliedAt) >= 7 * DAY);
  const soon = rows.filter(r => { const x = t(r.nextDate); return x >= now.getTime() - DAY && x <= now.getTime() + 8 * DAY; });
  const count = st => rows.filter(r => String(r.status) === st).length;
  const reached = rows.filter(r => INTERVIEW_ST.indexOf(String(r.status)) >= 0).length;
  const missing = {};
  applied.forEach(r => String(r.missing || '').split(',').map(s => s.trim()).filter(Boolean).forEach(s => { missing[s] = (missing[s] || 0) + 1; }));
  return {
    start, end, applied, changed, due, soon,
    B: applied.filter(isB).length, A: applied.filter(r => !isB(r)).length,
    replies: changed.filter(r => REPLIED_ST.indexOf(String(r.status)) >= 0).length, firstRun: !baseline,
    answered: rows.filter(r => REPLIED_ST.indexOf(String(r.status)) >= 0).length, interviews: changed.filter(r => INTERVIEW_ST.indexOf(String(r.status)) >= 0).length,
    total: rows.length, waiting: count('Applied'), rejected: count('Rejected'), noresponse: count('No response'), reached,
    missing: Object.keys(missing).sort((a, b) => missing[b] - missing[a]).slice(0, 4).map(k => k + (missing[k] > 1 ? ' ×' + missing[k] : '')),
  };
}

function weeklyEmail() {
  const props = PropertiesService.getScriptProperties();
  const to = props.getProperty(WEEKLY_TO);
  if (!to) return;
  const ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(SHEET);
  const now = new Date();
  const vals = sh && sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, COLS.length).getValues() : [];
  const rows = vals.filter(r => r[C.id - 1]).map(r => { const o = {}; COLS.forEach(([k], j) => { o[k] = r[j]; }); return o; });
  const s = weeklyStats_(rows, now, readBaseline_());
  // Job emails and interviews: optional, a missing permission only leaves the section out
  let mails = [], events = [];
  try {
    mails = GmailApp.search('newer_than:7d -in:sent -category:promotions (application OR applying OR interview OR unfortunately OR "next steps" OR assessment OR shortlisted OR candidate)', 0, 12)
      .map(th => ({ subject: th.getFirstMessageSubject(), from: String(th.getMessages()[0].getFrom()).replace(/<.*>/, '').trim(), date: th.getLastMessageDate() }));
  } catch (e) { mails = null; }
  try {
    events = CalendarApp.getDefaultCalendar().getEvents(now, new Date(now.getTime() + 8 * 864e5))
      .filter(ev => /interview|call|screen|assessment|meeting with|собеседован/i.test(ev.getTitle())).slice(0, 8)
      .map(ev => ({ title: ev.getTitle(), at: ev.getStartTime() }));
  } catch (e) { events = null; }

  const h = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const d = x => x.getDate() + ' ' + RU_MONTHS[x.getMonth()];
  const dd = x => { const v = x instanceof Date ? x : new Date(x); return isNaN(v) ? '' : RU_DAYS[v.getDay()] + ', ' + v.getDate() + ' ' + RU_MONTHS[v.getMonth()].slice(0, 3) + '.'; };
  const range = (s.start.getMonth() === s.end.getMonth() ? s.start.getDate() : d(s.start)) + '–' + d(s.end) + ' ' + s.end.getFullYear();
  const link = props.getProperty(WEEKLY_LINK);
  const pct = (a, b) => Math.min(100, b ? Math.round(a / b * 100) : 0);
  const bar = (a, b, c) => `<div style="height:7px;background:#eef0f6;border-radius:9px;overflow:hidden;margin:4px 0 10px"><div style="height:7px;width:${pct(a, b)}%;background:${c}"></div></div>`;
  const tile = (n, l) => `<td style="background:#f4f5f9;border-radius:12px;padding:10px;text-align:center"><div style="font-size:24px;font-weight:bold">${n}</div><div style="font-size:12px;color:#646b85">${l}</div></td>`;
  const li = arr => arr.length ? '<ul style="margin:0 0 14px;padding-left:18px">' + arr.join('') + '</ul>' : '<p style="margin:0 0 14px;color:#646b85">Нет.</p>';
  const rate = s.total ? (Math.round(s.answered / s.total * 1000) / 10).toString().replace('.', ',') : '0';
  const advice = s.due.length >= 5 ? `Начни неделю с follow-up: ${s.due.length} заявок ждут ответа больше 7 дней.`
    : s.B < 6 ? `Добери отклики на рынке Б: ${s.B} из 6–8 за неделю, плюс 2–3 холодных письма местным компаниям.`
    : s.replies === 0 ? 'Ответов не было: попробуй прямые отклики в первые 48 часов и письмо hiring manager.'
    : 'Хороший темп — держи его и готовься к ответам работодателей.';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f1222;line-height:1.5">
<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#2b45e8;font-weight:bold;margin:0 0 4px">Еженедельная сводка</p>
<h1 style="font-size:22px;margin:0 0 12px">${h(range)}</h1>
<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:6px 0;margin:0 0 14px"><tr>${tile(s.applied.length, 'откликов')}${tile(s.replies, 'ответов')}${tile(s.interviews, 'скринингов и интервью')}${tile(s.due.length, 'ждут follow-up')}</tr></table>
<p style="margin:0 0 6px;font-size:12px;color:#646b85">Рынок определён по типу работы в вакансии, примерно.</p><p style="margin:0"><b style="color:#0b958c">Рынок Б (с учёбой):</b> ${s.B} из 8 откликов</p>${bar(s.B, 8, '#0b958c')}
<p style="margin:0"><b style="color:#7c4dff">Рынок А (full-time):</b> ${s.A} из 10 откликов</p>${bar(s.A, 10, '#7c4dff')}
<p style="margin:0 0 14px;font-size:13px;color:#646b85">Всего заявок ${s.total} · ждут ответа ${s.waiting} · отказов ${s.rejected} · без ответа ${s.noresponse} · ответили ${rate}% · сейчас на интервью ${s.reached}</p>
<h2 style="font-size:16px;margin:0 0 6px">Отклики недели</h2>${li(s.applied.slice(0, 15).map(r => `<li>${h(r.title)} — ${h(r.company)}${r.platform ? ' <span style="color:#646b85">· ' + h(r.platform) + '</span>' : ''}</li>`))}
<h2 style="font-size:16px;margin:0 0 6px">Ответы и смены статуса</h2>${s.firstRun ? '<p style="margin:0 0 6px;font-size:12px;color:#646b85">Первое письмо: здесь только ответы на отклики этой недели. Со следующего — все смены статуса за неделю.</p>' : ''}${li(s.changed.slice(0, 12).map(r => `<li><b>${h(RU_STATUS[r.status] || r.status)}</b>: ${h(r.title)} — ${h(r.company)}</li>`))}
${mails ? `<h2 style="font-size:16px;margin:0 0 6px">Письма о вакансиях за неделю</h2>${li(mails.map(m => `<li>${h(m.subject)} <span style="color:#646b85">· ${h(m.from)} · ${h(dd(m.date))}</span></li>`))}` : ''}
<h2 style="font-size:16px;margin:0 0 6px">На этой неделе</h2>${li([].concat(
    (events || []).map(e => `<li>📅 ${h(dd(e.at))}: ${h(e.title)}</li>`),
    s.soon.map(r => `<li>Следующий шаг ${h(dd(r.nextDate instanceof Date ? r.nextDate : new Date(String(r.nextDate) + 'T12:00:00')))}: ${h(r.title)} — ${h(r.company)}</li>`),
    s.due.slice(0, 6).map(r => `<li>Follow-up: ${h(r.title)} — ${h(r.company)}</li>`),
    s.due.length > 6 ? [`<li style="color:#646b85">и ещё ${s.due.length - 6} follow-up во вкладке Follow-ups</li>`] : []))}
${s.missing.length ? `<p style="margin:0 0 14px;font-size:13px"><b>Чаще всего просили, а у тебя нет:</b> ${h(s.missing.join(', '))}</p>` : ''}
<div style="background:#e6eaff;border-radius:14px;padding:14px;margin:0 0 16px"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#2b45e8;font-weight:bold">Совет недели</div><div style="font-weight:bold;margin-top:4px">${h(advice)}</div></div>
${link ? `<p style="text-align:center;margin:0 0 16px"><a href="${h(link)}" style="display:inline-block;background:#2b45e8;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:12px">Открыть сводку и отметить, что сделал</a></p>` : ''}
<p style="font-size:12px;color:#646b85;margin:0">Письмо собрано скриптом твоей Google Таблицы «${h(ss.getName())}». Выключить: меню Job Tracker → Weekly email: turn off.</p></div>`;
  const text = [`Неделя поиска · ${range}`, `Откликов ${s.applied.length} · ответов ${s.replies} · интервью ${s.interviews} · ждут follow-up ${s.due.length}`,
    `Рынок Б: ${s.B} из 8 · Рынок А: ${s.A} из 10`, '', 'Отклики недели:'].concat(s.applied.slice(0, 15).map(r => `- ${r.title} — ${r.company}`), ['', 'Совет: ' + advice], link ? ['', link] : []).join('\n');
  const pl = (n, one, few, many) => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
  saveBaseline_(rows);
  MailApp.sendEmail({ to, subject: `Неделя поиска · ${range} — ${pl(s.applied.length, 'отклик', 'отклика', 'откликов')}, ${pl(s.replies, 'ответ', 'ответа', 'ответов')}`, htmlBody: html, body: text, name: 'Job Tracker' });
}

/** POST: the extension sends new or changed applications and the IDs it deleted. */
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Invalid JSON' }); }
  if (!checkToken_(body.token)) return json_({ ok: false, error: 'Wrong token' });
  const sh = ensureSheet_();
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const last = sh.getLastRow();
    const ids = last >= 2 ? sh.getRange(2, C.id, last - 1, 1).getValues().map(r => String(r[0])) : [];
    const rowOf = {}; ids.forEach((id, i) => { if (id) rowOf[id] = i + 2; });

    const toRow = a => COLS.map(([k]) => {
      const v = a[k];
      if (k === 'appliedAt') return v ? new Date(v) : '';
      // Only a real yyyy-mm-dd date: ',' or '1970-01-01' used to land in the sheet as 1970 or a broken cell
      if (k === 'nextDate') { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m || +m[1] < 2000) return ''; return new Date(+m[1], +m[2] - 1, +m[3]); }
      if (k === 'description') return String(v || '').slice(0, 40000);
      if (k === 'chance' || k === 'adAge' || k === 'applicants' || k === 'rejDays' || k === 'fit2' || k === 'predicted' || k === 'minutes') return v === '' || v == null ? '' : Number(v);
      return v == null ? '' : v;
    });
    const appendRows = [];
    const touched = [];
    let updated = 0;
    (body.apps || []).forEach(a => {
      const r = rowOf[a.id];
      if (r) { sh.getRange(r, 1, 1, COLS.length).setValues([toRow(a)]); touched.push(r); updated++; }
      else appendRows.push(toRow(a));
    });
    if (appendRows.length) {
      const first = sh.getLastRow() + 1;
      sh.getRange(first, 1, appendRows.length, COLS.length).setValues(appendRows);
      sh.setRowHeightsForced(first, appendRows.length, ROW_H);
      decorateRows_(sh, first, appendRows.length);
    }
    touched.forEach(r => { sh.setRowHeightsForced(r, 1, ROW_H); decorateRows_(sh, r, 1); });

    // Quick changes from the phone: only the given cells change, and the row is marked as edited now
    let patched = 0;
    (body.patches || []).forEach(pt => {
      const r = rowOf[pt.id];
      if (!r) return;
      ['status', 'notes', 'nextDate', 'followup'].forEach(k => {
        if (pt[k] === undefined) return;
        let v = pt[k];
        if (k === 'nextDate') { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); v = m && +m[1] >= 2000 ? new Date(+m[1], +m[2] - 1, +m[3]) : ''; }
        sh.getRange(r, C[k]).setValue(v);
      });
      sh.getRange(r, C.updated).setValue(Date.now());
      decorateRows_(sh, r, 1);
      patched++;
    });
    if (body.profile && typeof body.profile === 'object') saveProfile_(body.profile);
    if (Array.isArray(body.inboxDismiss) && body.inboxDismiss.length) dismissInbox_(body.inboxDismiss);
    if (body.learned && typeof body.learned === 'object') saveLearned_(body.learned);

    const del = (body.deletes || []).map(id => rowOf[id]).filter(Boolean).sort((x, y) => y - x);
    del.forEach(r => sh.deleteRow(r));
    if (updated || patched || appendRows.length || del.length) maybeSnapshot_();
    return json_({ ok: true, version: SCRIPT_VERSION, updated, patched, added: appendRows.length, deleted: del.length });
  } finally { lock.releaseLock(); }
}


// ---------- Status hints from Gmail (17) ----------
// The phone app asks for action=inbox. Job emails of the last 10 days are read (read-only: nothing is
// sent, labelled or archived), sorted into rejection / interview / assessment / offer and matched to a
// row by company name. Nothing changes in the sheet by itself: the phone shows each hint and you
// confirm it with one tap. Kept in a hidden _inbox sheet; a scan runs at most every 30 minutes.
const INBOX_SHEET = '_inbox';
const INBOX_QUERY = 'newer_than:10d -in:sent -in:chats -category:promotions -category:social (unfortunately OR unsuccessful OR "other candidates" OR "not to progress" OR "decided not to" OR "not be progressing" OR "not been successful" OR "move forward with" OR interview OR invitation OR "next steps" OR assessment OR "phone screen" OR shortlisted OR offer)';
const INBOX_KIND = [
  ['rejected', /unfortunately|unsuccessful|other candidates|not to progress|decided not to|not be progressing|not been successful|will not be (moving|taking)|regret to inform|no longer (being )?considered|position has been filled|move forward with (other|another)/i],
  ['offer', /\boffer of employment\b|\bpleased to offer\b|\bjob offer\b|\boffer letter\b/i],
  ['interview', /\binterview\b|\bphone screen\b|\bscreening call\b|\bvideo call\b|\bshortlisted\b|\bmeet (with )?the team\b|\bavailability for a (call|chat)\b/i],
  ['assessment', /\bassessment\b|\bonline test\b|\btechnical test\b|\bcoding challenge\b|\bhirevue\b|\bpre-recorded\b/i],
];
const GENERIC_CO = /^(it|ltd|limited|group|the|uk|plc|services|solutions|support|recruitment|careers|jobs|talent|people|hr)$/i;

function readInbox_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(INBOX_SHEET);
  if (!sh) return { at: 0, items: [], dismissed: [] };
  try { return Object.assign({ at: 0, items: [], dismissed: [] }, JSON.parse(sh.getRange(1, 1).getValue() || '{}')); } catch (e) { return { at: 0, items: [], dismissed: [] }; }
}
function writeInbox_(o) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(INBOX_SHEET);
  if (!sh) { sh = ss.insertSheet(INBOX_SHEET); sh.hideSheet(); }
  o.dismissed = (o.dismissed || []).slice(-400);
  sh.getRange(1, 1).setValue(JSON.stringify(o).slice(0, 49000));
}
function dismissInbox_(ids) {
  const o = readInbox_();
  o.dismissed = [...new Set((o.dismissed || []).concat(ids.map(String)))];
  o.items = (o.items || []).filter(it => !o.dismissed.includes(it.id));
  writeInbox_(o);
}
/** Menu item and the phone's 'check now': reads job emails and refreshes the hints. */
function scanInbox() { return inbox_(true); }
function inbox_(force) {
  const o = readInbox_();
  if (!force && Date.now() - (o.at || 0) < 30 * 60e3) return { ok: true, at: o.at, items: o.items };
  const sh = ensureSheet_();
  const last = sh.getLastRow();
  const rows = last >= 2 ? sh.getRange(2, 1, last - 1, COLS.length).getValues().map(r => { const x = {}; COLS.forEach(([k], j) => { x[k] = r[j]; }); return x; }).filter(x => x.id && x.company) : [];
  const norm = v => String(v || '').toLowerCase().replace(/\b(ltd|limited|plc|llp|group|uk|inc)\b/g, ' ').replace(/[^a-z0-9&]+/g, ' ').trim();
  const companies = rows.map(r => ({ r, c: norm(r.company) })).filter(x => x.c.length >= 3 && !GENERIC_CO.test(x.c));
  let threads = [];
  try { threads = GmailApp.search(INBOX_QUERY, 0, 40); }
  catch (e) { return { ok: false, error: 'Gmail is not allowed yet: in Apps Script run scanInbox once and approve the access, then deploy a new version.' }; }
  const items = [];
  threads.forEach(th => {
    const id = th.getId();
    if ((o.dismissed || []).includes(id)) return;
    const msgs = th.getMessages();
    const m = msgs[msgs.length - 1];
    const subject = th.getFirstMessageSubject() || '';
    const from = String(m.getFrom() || '');
    const body = String(m.getPlainBody() || '').slice(0, 4000);
    const text = subject + '\n' + body;
    const kind = (INBOX_KIND.find(([, re]) => re.test(text)) || [null])[0];
    if (!kind) return;
    const hay = ' ' + norm(from + ' ' + subject + ' ' + body.slice(0, 1500)) + ' ';
    const hits = companies.filter(x => hay.includes(' ' + x.c + ' '));
    // The most recent application to that company that is still open
    const open = ['Applied', 'Screening', 'Test task', 'Interview 1', 'Interview 2', 'Interview 3', 'No response'];
    hits.sort((a, b) => (open.includes(String(b.r.status)) - open.includes(String(a.r.status))) || (new Date(b.r.appliedAt) - new Date(a.r.appliedAt)));
    const row = hits[0] && hits[0].r;
    const human = !/no-?reply|donotreply|notifications?@|jobs-noreply|talent@|careers@|recruit(ment|ing)@|workday|greenhouse|lever|smartrecruiters|ashby|teamtailor|indeed|linkedin|reed\.co\.uk|totaljobs/i.test(from);
    items.push({
      id, kind, subject: subject.slice(0, 200), from: from.replace(/<.*>/, '').replace(/"/g, '').trim().slice(0, 80),
      date: th.getLastMessageDate().toISOString(), snippet: body.replace(/\s+/g, ' ').slice(0, 280),
      rowId: row ? String(row.id) : '', company: row ? String(row.company) : '', title: row ? String(row.title) : '', status: row ? String(row.status) : '',
      human, link: 'https://mail.google.com/mail/#all/' + id,
    });
  });
  o.at = Date.now(); o.items = items;
  writeInbox_(o);
  return { ok: true, at: o.at, items };
}
