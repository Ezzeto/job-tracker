/**
 * Job Tracker — синхронизация с Google Таблицей.
 * Вставь этот код в «Расширения → Apps Script» внутри своей таблицы.
 * Токен создаётся при первом запуске setup() и хранится в свойствах скрипта.
 */
// The sync token is generated on first setup() and kept in Script Properties, never in the code.
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

const SCRIPT_VERSION = 7;
const SHEET = 'Заявки';
const SUMMARY = 'Сводка';
const COLS = [
  ['id', 'ID'], ['ticket', 'Тикет'], ['title', 'Вакансия'], ['company', 'Компания'], ['location', 'Локация'],
  ['category', 'Направление'], ['workTypes', 'Тип работы'], ['salary', 'Зарплата'], ['platform', 'Платформа'],
  ['appliedAt', 'Дата подачи'], ['status', 'Статус'], ['chance', 'Шансы %'], ['nextDate', 'Следующий шаг'],
  ['notes', 'Заметки'], ['missing', 'Не хватает'], ['tools', 'Инструменты'], ['details', 'Важное из описания'],
  ['url', 'Ссылка'], ['updated', '_updated'], ['benefits', 'Бонусы'], ['contacts', 'Контакты'], ['followup', 'Follow-up'],
];
const C = {}; COLS.forEach(([k], i) => { C[k] = i + 1; });
// [статус, фон ячейки статуса, цвет текста, лёгкий оттенок всей строки]
const STATUSES = [
  ['Подано', '#e3eaf2', '#3b4b5c', ''],
  ['Ответили / скрининг', '#bfe1f6', '#0b5d8a', '#f1f8fd'],
  ['Тестовое задание', '#c9d8fb', '#2a4fa0', '#f2f5fe'],
  ['Интервью 1', '#e1d4f7', '#4b2a8a', '#f7f3fd'],
  ['Интервью 2', '#d0baf1', '#4b2a8a', '#f5effc'],
  ['Интервью 3', '#bb9ee9', '#3a1d73', '#f2eafb'],
  ['Оффер', '#a8dfbd', '#0f5c32', '#ecf8f0'],
  ['Оффер принят', '#1e8e3e', '#ffffff', '#e1f3e7'],
  ['Оффер отклонён мной', '#e6ebc8', '#5f6b2e', ''],
  ['Отказ', '#f4c2bd', '#a52714', '#fdf0ef'],
  ['Нет ответа', '#e8e8e8', '#757575', ''],
  ['Отозвал заявку', '#ede4d3', '#7a6a4a', ''],
];
const MUTED = ['Нет ответа', 'Отозвал заявку', 'Оффер отклонён мной'];

/** Меню «Job Tracker» в таблице — чтобы навести порядок одной кнопкой. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Job Tracker')
    .addItem('Навести порядок в таблице', 'setup')
    .addItem('Развернуть все колонки', 'expandAll')
    .addItem('Свернуть подробности', 'collapseAll')
    .addToUi();
}

/** Запусти один раз вручную (или через меню Job Tracker): оформит таблицу и сводку. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET, 0);
  formatSheet_(sh);
  buildSummary_(ss);
  // Пустой лист по умолчанию только мешает
  ss.getSheets().forEach(x => { if (/^(Лист|Sheet)\s?1$/.test(x.getName()) && x.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(x); });
  return 'Готово';
}

const ROW_H = 30;
// Колонки, которые свёрнуты по умолчанию и раскрываются кнопкой «+» над таблицей.
// Весь длинный текст спрятан, а коротко он виден во всплывающей заметке на названии вакансии.
const GROUPS = [['location', 'workTypes'], ['notes', 'details'], ['benefits', 'contacts']];

function formatSheet_(sh) {
  const n = COLS.length;
  const maxRows = Math.max(sh.getMaxRows(), 1000);
  if (sh.getMaxRows() < maxRows) sh.insertRowsAfter(sh.getMaxRows(), maxRows - sh.getMaxRows());
  const body = sh.getRange(2, 1, maxRows - 1, n);

  // Заголовок
  sh.getRange(1, 1, 1, n).setValues([COLS.map(c => c[1])])
    .setFontWeight('bold').setBackground('#17324a').setFontColor('#ffffff')
    .setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(1, 36);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(C.title);
  sh.hideColumns(C.id); sh.hideColumns(C.updated);

  // Тексты не растягивают строки: длинное обрезается, полностью видно при нажатии на ячейку
  body.setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP).setVerticalAlignment('middle').setFontSize(10);
  const last = sh.getLastRow();
  if (last >= 2) sh.setRowHeightsForced(2, last - 1, ROW_H);

  const widths = { ticket: 82, title: 230, company: 150, location: 120, category: 150, workTypes: 140, salary: 120,
    platform: 95, appliedAt: 92, status: 165, chance: 64, nextDate: 100, notes: 260, missing: 170, tools: 200, details: 260, url: 80, benefits: 260, contacts: 260, followup: 110 };
  Object.keys(widths).forEach(k => sh.setColumnWidth(C[k], widths[k]));
  ['ticket', 'appliedAt', 'chance', 'nextDate', 'url'].forEach(k => sh.getRange(2, C[k], maxRows - 1, 1).setHorizontalAlignment('center'));
  sh.getRange(2, C.appliedAt, maxRows - 1, 1).setNumberFormat('dd.mm.yyyy');
  sh.getRange(2, C.nextDate, maxRows - 1, 1).setNumberFormat('dd.mm.yyyy')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build());
  sh.getRange(2, C.chance, maxRows - 1, 1).setNumberFormat('0');
  sh.getRange(2, C.title, maxRows - 1, 1).setFontWeight('bold');

  // Статус — выпадающий список
  const statusRange = sh.getRange(2, C.status, maxRows - 1, 1);
  statusRange.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUSES.map(s => s[0]), true).setAllowInvalid(false).build());
  statusRange.setFontWeight('bold').setHorizontalAlignment('center');
  sh.setConditionalFormatRules(colorRules_(sh, maxRows));
  // Чередование строк и фильтр для поиска/сортировки
  sh.getBandings().forEach(b => b.remove());
  sh.getRange(1, 1, maxRows, n).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor('#17324a');
  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, maxRows, n).createFilter();

  // Свёрнутые группы колонок (старые группы убираем, чтобы собрать заново)
  for (let c = 1; c <= n; c++) {
    const d = sh.getColumnGroupDepth(c);
    if (d > 0) { try { sh.getColumnGroup(c, d).expand(); } catch (e) { /* уже раскрыта */ } }
  }
  for (let c = 1; c <= n; c++) { while (sh.getColumnGroupDepth(c) > 0) sh.getRange(1, c).shiftColumnGroupDepth(-1); }
  sh.showColumns(C.ticket, n - C.ticket + 1);
  sh.hideColumns(C.id); sh.hideColumns(C.updated);
  GROUPS.forEach(([a, b]) => {
    if (sh.getColumnGroupDepth(C[a]) === 0) sh.getRange(1, C[a], 1, C[b] - C[a] + 1).shiftColumnGroupDepth(1);
    const g = sh.getColumnGroup(C[a], 1);
    if (g) g.collapse();
  });

  // Короткие ссылки и подсказки для уже существующих строк
  if (last >= 2) decorateRows_(sh, 2, last - 1);
}

/** Цвета: порядок важен — правила выше в списке главнее. */
function colorRules_(sh, maxRows) {
  const sep = detectSep_(sh);
  const col = k => sh.getRange(1, C[k]).getA1Notation().replace(/\d+/g, '');
  const K = '$' + col('status'), J = '$' + col('appliedAt'), M = '$' + col('nextDate');
  const range = k => sh.getRange(2, C[k], maxRows - 1, 1);
  const rows = sh.getRange(2, 2, maxRows - 1, COLS.length - 1);
  const R = [];
  const rule = () => SpreadsheetApp.newConditionalFormatRule();

  // 1. Ячейка статуса — яркий цвет стадии
  STATUSES.forEach(([label, bg, fg]) => R.push(rule().whenTextEqualTo(label).setBackground(bg).setFontColor(fg).setRanges([range('status')]).build()));

  // 2. Шансы — плавная шкала: красный → жёлтый → зелёный
  R.push(rule().setGradientMinpointWithValue('#f28b82', SpreadsheetApp.InterpolationType.NUMBER, '30')
    .setGradientMidpointWithValue('#fde68a', SpreadsheetApp.InterpolationType.NUMBER, '55')
    .setGradientMaxpointWithValue('#5bb974', SpreadsheetApp.InterpolationType.NUMBER, '80')
    .setRanges([range('chance')]).build());

  // 3. Следующий шаг: просрочен — красный, сегодня-через 2 дня — оранжевый
  R.push(rule().whenFormulaSatisfied(`=AND(${M}2<>""${sep}${M}2<TODAY())`).setBackground('#f4c2bd').setFontColor('#a52714').setBold(true).setRanges([range('nextDate')]).build());
  R.push(rule().whenFormulaSatisfied(`=AND(${M}2<>""${sep}${M}2<=TODAY()+2)`).setBackground('#fcd9a8').setFontColor('#8a4b00').setBold(true).setRanges([range('nextDate')]).build());

  // 4. «Подано» больше 14 дней назад — пора follow-up
  R.push(rule().whenFormulaSatisfied(`=AND(${K}2="Подано"${sep}${J}2<>""${sep}${J}2<TODAY()-14)`).setBackground('#fde68a').setFontColor('#7a5510').setRanges([range('appliedAt')]).build());

  // 5. Вся строка — лёгкий оттенок стадии; закрытые заявки — серым текстом
  STATUSES.forEach(([label, , , tint]) => {
    if (tint) R.push(rule().whenFormulaSatisfied(`=${K}2="${label}"`).setBackground(tint).setRanges([rows]).build());
  });
  MUTED.forEach(label => R.push(rule().whenFormulaSatisfied(`=${K}2="${label}"`).setFontColor('#9aa0a6').setRanges([rows]).build()));
  return R;
}

/** «Открыть» вместо длинной ссылки и всплывающая заметка с полным текстом «Важного». */
function decorateRows_(sh, start, count) {
  const urls = sh.getRange(start, C.url, count, 1);
  const uv = urls.getValues(), rt = urls.getRichTextValues();
  const newRt = uv.map((r, i) => {
    const link = (rt[i][0] && rt[i][0].getLinkUrl()) || (/^https?:/.test(String(r[0])) ? String(r[0]) : '');
    return [link ? SpreadsheetApp.newRichTextValue().setText('Открыть').setLinkUrl(link).build()
      : SpreadsheetApp.newRichTextValue().setText(String(r[0] || '')).build()];
  });
  urls.setRichTextValues(newRt);
  const det = sh.getRange(start, C.details, count, 1);
  det.setNotes(det.getValues().map(r => [r[0] ? '• ' + String(r[0]).split(' • ').join('\n• ') : '']));
  // Всплывающая сводка на названии вакансии: не хватает, заметки, бонусы
  const rows = sh.getRange(start, 1, count, COLS.length).getValues();
  sh.getRange(start, C.title, count, 1).setNotes(rows.map(r => {
    const miss = String(r[C.missing - 1] || ''), notes = String(r[C.notes - 1] || ''), ben = String(r[C.benefits - 1] || '');
    const parts = [];
    if (miss) parts.push('Не хватает: ' + miss);
    if (notes) parts.push(notes.length > 1500 ? notes.slice(0, 1500) + '…' : notes);
    if (ben) parts.push('Что даёт компания:\n• ' + ben.split(' • ').join('\n• '));
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

// В русской и других локалях аргументы формул разделяются «;», а не «,». Определяем автоматически.
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
  const responded = ['Ответили / скрининг', 'Тестовое задание', 'Интервью 1', 'Интервью 2', 'Интервью 3', 'Оффер', 'Оффер принят', 'Оффер отклонён мной', 'Отказ'];
  const interviews = ['Тестовое задание', 'Интервью 1', 'Интервью 2', 'Интервью 3', 'Оффер', 'Оффер принят', 'Оффер отклонён мной'];
  const offers = ['Оффер', 'Оффер принят', 'Оффер отклонён мной'];
  const rows = [
    ['Сводка по заявкам', ''],
    ['Всего подано', `=COUNTA(${R}A2:A)`],
    ['За последние 7 дней', `=COUNTIF(${R}J2:J${s}">="&(TODAY()-7))`],
    ['Ответили', `=${inList(responded)}`],
    ['Интервью', `=${inList(interviews)}`],
    ['Офферы', `=${inList(offers)}`],
    ['Средние шансы, %', `=IFERROR(ROUND(AVERAGE(${R}L2:L))${s}"—")`],
    ['', ''],
    ['По статусам', ''],
  ].concat(STATUSES.map(([l]) => [l, `=${cnt(l)}`]));
  sm.getRange(1, 1, rows.length, 2).setValues(rows.map(r => [r[0], '']));
  rows.forEach((r, i) => { if (r[1]) sm.getRange(i + 2 - 1, 2).setFormula(r[1]); });
  sm.getRange('A1').setFontSize(14).setFontWeight('bold');
  sm.getRange('A9').setFontWeight('bold');
  sm.getRange('A2:A7').setFontWeight('bold');
  sm.getRange('D1').setValue('По платформам').setFontWeight('bold');
  sm.getRange('D2').setFormula(`=IFERROR(QUERY(${R}I2:I${s}"select I, count(I) where I is not null group by I order by count(I) desc label count(I) ''"${s}0)${s}"")`);
  sm.setColumnWidth(1, 200); sm.setColumnWidth(4, 160);
  sm.getRange(1, 1, 1, 5).setBorder(false, false, true, false, false, false);
  STATUSES.forEach(([, bg, fg], i) => sm.getRange(10 + i, 1).setBackground(bg).setFontColor(fg).setFontWeight('bold'));
  const legend = [
    ['Как читать цвета', ''],
    ['Статус', 'Цвет ячейки показывает стадию: синий — ответили, фиолетовый — интервью, зелёный — оффер, красный — отказ, серый — закрыто'],
    ['Строка', 'Лёгкий оттенок той же стадии; серый текст — заявка закрыта'],
    ['Шансы %', 'Красный < 40, жёлтый ≈ 55, зелёный > 70'],
    ['Следующий шаг', 'Оранжевый — сегодня или в ближайшие 2 дня, красный — просрочен'],
    ['Дата подачи', 'Жёлтая — подано больше 14 дней назад без ответа, пора написать follow-up'],
  ];
  sm.getRange(24, 1, legend.length, 2).setValues(legend);
  sm.getRange(24, 1).setFontWeight('bold');
  sm.getRange(25, 1, legend.length - 1, 1).setFontWeight('bold');
  sm.getRange(25, 2, legend.length - 1, 1).setFontColor('#5a6b7d');
  sm.getRange('A31').setValue('Считается по текущему статусу. Статусы меняй в листе «Заявки» — расширение подхватит изменения.').setFontColor('#5a6b7d');
}

/** Когда меняешь что-то в таблице (например, с телефона), отмечаем время изменения строки. */
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
  if (!ss.getSheetByName(SHEET)) setup();
  return ss.getSheetByName(SHEET);
}

function toIsoDate_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  if (!v) return '';
  const m = String(v).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${('0' + m[2]).slice(-2)}-${('0' + m[1]).slice(-2)}` : String(v);
}

/** GET: отдаёт строки таблицы расширению. */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!checkToken_(p.token)) return json_({ ok: false, error: 'Неверный токен' });
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
      if (!row[C.id - 1]) { // строку добавили вручную в таблице
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

/** POST: расширение присылает новые/изменённые заявки и удалённые ID. */
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Плохой JSON' }); }
  if (!checkToken_(body.token)) return json_({ ok: false, error: 'Неверный токен' });
  const sh = ensureSheet_();
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const last = sh.getLastRow();
    const ids = last >= 2 ? sh.getRange(2, C.id, last - 1, 1).getValues().map(r => String(r[0])) : [];
    const rowOf = {}; ids.forEach((id, i) => { if (id) rowOf[id] = i + 2; });

    const toRow = a => COLS.map(([k]) => {
      const v = a[k];
      if (k === 'appliedAt') return v ? new Date(v) : '';
      if (k === 'nextDate') { if (!v) return ''; const [y, m, d] = String(v).split('-').map(Number); return new Date(y, m - 1, d); }
      if (k === 'chance') return v === '' || v == null ? '' : Number(v);
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
