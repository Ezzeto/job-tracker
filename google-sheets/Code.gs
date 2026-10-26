/**
 * Job Tracker — Google Sheets sync.
 * Paste this file into Extensions → Apps Script inside your own sheet, run setup() once,
 * then deploy it as a web app. The extension talks to it with a token that setup()
 * generates and keeps in Script Properties (Job Tracker menu → Show sync token).
 */

const SCRIPT_VERSION = 12; // 12 = how you applied, ad age, applicants, why rejected; 11 = Verdict column, bad 'Next step' dates ignored; 10 = merges a leftover pre-2.0 sheet; 9 = Type and Placement rules columns
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
  ['rejDays', 'Days to rejection'], ['outcome', 'Why rejected'], ['reqs', 'Ad demands'],
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
  sh.hideColumns(C.id); sh.hideColumns(C.updated);

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
  sh.hideColumns(C.id); sh.hideColumns(C.updated);
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
      if (k === 'chance' || k === 'adAge' || k === 'applicants' || k === 'rejDays') return v === '' || v == null ? '' : Number(v);
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

    const del = (body.deletes || []).map(id => rowOf[id]).filter(Boolean).sort((x, y) => y - x);
    del.forEach(r => sh.deleteRow(r));
    return json_({ ok: true, version: SCRIPT_VERSION, updated, added: appendRows.length, deleted: del.length });
  } finally { lock.releaseLock(); }
}
