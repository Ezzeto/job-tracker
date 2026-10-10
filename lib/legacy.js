/* Job Tracker — migration from versions up to 1.7, whose interface was in Russian.
 * Stored applications, settings and the linked Google Sheet used Russian labels.
 * The maps below keep that data readable; this is the only file that still needs them. */
(function (root) {
  'use strict';

  const STATUS = {
    'Подано': 'applied', 'Ответили / скрининг': 'screening', 'Тестовое задание': 'test',
    'Интервью 1': 'interview1', 'Интервью 2': 'interview2', 'Интервью 3': 'interview3',
    'Оффер': 'offer', 'Оффер принят': 'accepted', 'Оффер отклонён мной': 'declined',
    'Отказ': 'rejected', 'Нет ответа': 'noresponse', 'Отозвал заявку': 'withdrawn',
  };
  const VALUE = {
    'Другое': 'Other', 'Сайт компании': 'Company website', 'Рекрутер / агентство': 'Recruiter / agency',
    'Офис': 'Office', 'Гибрид': 'Hybrid', 'Удалённо': 'Remote',
  };
  const NOTE_HEADINGS = [['Что нужно:', 'Requirements:'], ['Будет плюсом:', 'Nice to have:'], ['Чем заниматься:', 'Responsibilities:']];
  const SOURCE = { 'описание': 'description', 'добавлено вручную': 'added manually', 'LinkedIn: команда найма': 'LinkedIn: hiring team' };

  const statusId = label => STATUS[String(label || '').trim()];
  const value = v => (typeof v === 'string' && VALUE[v]) || v;

  /** Updates one application in place. Returns true if anything changed. */
  function migrateApp(a, A, profile) {
    let changed = false;
    const set = (k, v) => { if (a[k] !== v) { a[k] = v; changed = true; } };
    set('category', value(a.category));
    set('platform', value(a.platform));
    if (a.offer && a.offer.mode) { const m = value(a.offer.mode); if (m !== a.offer.mode) { a.offer = { ...a.offer, mode: m }; changed = true; } }
    if (typeof a.notes === 'string') {
      let n = a.notes;
      NOTE_HEADINGS.forEach(([ru, en]) => { n = n.split(ru).join(en); });
      set('notes', n);
    }
    if (Array.isArray(a.contacts)) {
      const c = a.contacts.map(x => (x && SOURCE[x.source] ? { ...x, source: SOURCE[x.source] } : x));
      if (c.some((x, i) => x !== a.contacts[i])) { a.contacts = c; changed = true; }
    }
    // Old fit scores carry Russian reasons: recalculate when the description is available.
    if (A && a.chance && /[А-Яа-яЁё]/.test(JSON.stringify(a.chance.reasons || [])) && (a.description || a.title)) {
      const an = A.analyze({ title: a.title, description: a.description || '', location: a.location, workTypes: a.workTypes, category: a.category }, profile);
      a.chance = an.chance; a.tools = an.chance.tools;
      if (a.description) a.details = an.details;
      changed = true;
    }
    return changed;
  }

  /** Profile fields renamed in 2.0. */
  function migrateProfile(p) {
    if (!p) return false;
    let changed = false;
    if (p.languages === undefined) {
      p.languages = p.speaksUkrainianRussian ? ['Ukrainian', 'Russian'] : [];
      changed = true;
    }
    if ('speaksUkrainianRussian' in p) { delete p.speaksUkrainianRussian; changed = true; }
    return changed;
  }

  const api = { STATUS, VALUE, statusId, value, migrateApp, migrateProfile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_Legacy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
