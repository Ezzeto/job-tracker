/* Job Tracker — fills application forms (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Teamtailor,
 * Workable, school and NHS sites, or any page when you ask). It never presses Submit.
 *   Simple fields (name, email, phone, address, LinkedIn) and Yes/No questions are filled by code from
 *   your profile; free-text questions take answers prepared for this job (AI, from your facts); the CV
 *   file is attached. Every field touched is outlined: green = sure, amber = check it, red = left for you.
 * Works in any document: the content script calls detect() and fill(). */
(function (root) {
  'use strict';
  const RULES = [
    ['firstName', /\b(first|given|fore)\s*name\b|^name\s*\(first\)/i],
    ['lastName', /\b(last|family|sur)\s*name\b|\bsurname\b/i],
    ['fullName', /^(\*\s*)?(full\s*|your\s*|legal\s*)?name\s*\*?$|\bfull name\b|\byour name\b/i],
    ['email', /e-?mail/i],
    ['phone', /\b(phone|mobile|telephone|tel\.?|contact number)\b/i],
    ['address1', /\baddress( line)?\s*1?\b|\bstreet\b/i],
    ['town', /\b(city|town)\b/i],
    ['postcode', /\b(post\s*code|postal code|zip)\b/i],
    ['country', /\bcountry\b/i],
    ['linkedin', /linked\s*in/i],
    ['website', /\b(github|portfolio|personal (web)?site|website|blog)\b/i],
    ['sponsor', /\bsponsor|\bvisa\b|\bwork permit\b/i],
    ['rtw', /right to work|eligib\w* to work|legally (entitled|authori[sz]ed|able) to work|authori[sz]ed to work|work in the (uk|united kingdom)/i],
    ['licence', /driv\w* licen[cs]e|full uk licen/i],
    ['notice', /notice period|when (can|could|would) you start|start date|earliest start|availability to start|available to start/i],
    ['salary', /salary|pay expectation|expected (pay|compensation)|desired (pay|compensation)|remuneration/i],
    ['source', /how did you (hear|find)|where did you (hear|find|see)|referral source|^source$/i],
    ['letter', /cover(ing)? letter|supporting statement|letter of application|motivation/i],
    ['diversity', /\b(gender|sex\b|ethnic|race\b|disabilit|sexual orientation|religio|belief|veteran|pronoun|age( band| range)?\b|marital|caring responsib|trans\b|nationalit)/i],
    ['consent', /\b(consent|agree|terms|privacy|policy|accept|acknowledge|confirm that)\b/i],
    ['cv', /\b(resume|résumé|cv|curriculum vitae)\b/i],
  ];
  const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/[*:]+\s*$/, '').trim();

  /** The question a field asks: its label, aria label, placeholder, legend or the text just before it. */
  function labelOf(el) {
    const doc = el.ownerDocument;
    const by = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => id && doc.getElementById(id)).filter(Boolean).map(x => x.textContent).join(' ');
    if (by.trim()) return clean(by);
    if (el.id) { const l = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l && l.textContent.trim()) return clean(l.textContent); }
    const wrap = el.closest('label'); if (wrap && clean(wrap.textContent).length > 1) return clean(wrap.textContent.replace(el.value || '', ''));
    if (el.getAttribute('aria-label')) return clean(el.getAttribute('aria-label'));
    const fs = el.closest('fieldset'); if (fs && (el.type === 'radio' || el.type === 'checkbox')) { const lg = fs.querySelector('legend'); if (lg) return clean(lg.textContent); }
    // Workday and many custom forms: the question sits in a nearby element
    let n = el, hops = 0;
    while (n && hops++ < 4) {
      const prev = n.previousElementSibling;
      if (prev && clean(prev.textContent) && clean(prev.textContent).length < 300 && !prev.querySelector('input,select,textarea')) return clean(prev.textContent);
      n = n.parentElement;
      if (n && n.querySelector('label') && !n.querySelector('label').control) { const t = clean(n.querySelector('label').textContent); if (t) return t; }
    }
    return clean(el.getAttribute('placeholder') || el.getAttribute('name') || el.getAttribute('data-automation-id') || '');
  }
  const visible = el => { if (el.type === 'hidden' || el.disabled) return false; const r = el.getBoundingClientRect(); const cs = el.ownerDocument.defaultView.getComputedStyle(el); return el.type === 'file' || el.type === 'radio' || el.type === 'checkbox' || (r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'); };

  /** Fields on the page: [{ el, els (radio group), key|null, label, kind }] */
  function detect(doc) {
    const out = [], radios = {};
    doc.querySelectorAll('input, select, textarea').forEach(el => {
      if (!visible(el) || /^(submit|button|image|reset|search)$/i.test(el.type) || el.closest('[data-jt-panel]')) return;
      const kind = el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : el.type === 'file' ? 'file' : el.type === 'radio' ? 'radio' : el.type === 'checkbox' ? 'checkbox' : 'text';
      if (kind === 'radio') { const k = el.name || labelOf(el); if (radios[k]) { radios[k].els.push(el); return; } }
      let label = labelOf(el);
      if (kind === 'radio') { const fs = el.closest('fieldset,[role="radiogroup"],[role="group"]'); const q = fs && (fs.querySelector('legend,[id$="label"],.label,label:not([for])') || {}).textContent; if (q && clean(q).length > 3) label = clean(q); }
      const rule = RULES.find(([k, re]) => re.test(label) && !(k === 'email' && /confirm/i.test(label) && false));
      let key = rule ? rule[0] : null;
      if (key === 'cv' && kind !== 'file') key = kind === 'textarea' ? null : key;
      if (kind === 'file' && !key) key = /cover/i.test(label) ? 'letterFile' : 'cv';
      if (key === 'letter' && kind === 'file') key = 'letterFile';
      if (key === 'fullName' && kind !== 'text') key = null;
      const f = { el, els: [el], key, label, kind };
      if (kind === 'radio') radios[el.name || label] = f;
      out.push(f);
    });
    return out;
  }

  // ---------- Setting values so React, Vue and Angular forms notice ----------
  function setNative(el, v) {
    const proto = el.tagName === 'TEXTAREA' ? root.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? root.HTMLSelectElement.prototype : root.HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9£ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  /** Picks a select option or radio by meaning: yes/no, prefer-not-to-say, or the closest text. */
  function matches(text, want) {
    const t = norm(text), w = norm(want);
    if (!t) return 0;
    if (w === 'yes') return /^(yes|y|true)\b/.test(t) ? 3 : 0;
    if (w === 'no') return /^(no|n|false)\b/.test(t) && !/^no(t)? (prefer|wish)/.test(t) ? 3 : 0;
    if (w === 'prefer not to say') return /prefer not|rather not|not to (say|disclose|answer)|decline|don t wish|do not wish/.test(t) ? 3 : 0;
    if (t === w) return 3;
    if (t.includes(w) || (w.includes(t) && t.length > 3)) return 2;
    return 0;
  }
  function choose(f, want) {
    if (f.kind === 'select') {
      const opts = Array.from(f.el.options).filter(o => o.value !== '' || o.text.trim());
      let best = null, bs = 0;
      opts.forEach(o => { const s = matches(o.text, want); if (s > bs) { bs = s; best = o; } });
      if (!best) return false;
      setNative(f.el, best.value); return true;
    }
    if (f.kind === 'radio') {
      let best = null, bs = 0;
      f.els.forEach(r => { const s = matches(labelOf(r) || r.value, want) || matches(r.value, want); if (s > bs) { bs = s; best = r; } });
      if (!best) return false;
      best.click(); if (!best.checked) { best.checked = true; best.dispatchEvent(new Event('change', { bubbles: true })); }
      return true;
    }
    return false;
  }
  function attach(el, file) {
    try {
      const dt = new root.DataTransfer();
      dt.items.add(new root.File([file.bytes], file.name, { type: file.type }));
      el.files = dt.files;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (e) { return false; }
  }

  /** The value for a field: { v, sure } or null. data: { me, answers: [{ q, a }], letter, salary, notice, source } */
  function valueFor(f, data) {
    const me = data.me || {};
    const full = [me.firstName, me.lastName].filter(Boolean).join(' ');
    switch (f.key) {
      case 'firstName': return me.firstName ? { v: me.firstName, sure: true } : null;
      case 'lastName': return me.lastName ? { v: me.lastName, sure: true } : null;
      case 'fullName': return full ? { v: full, sure: true } : null;
      case 'email': return me.email ? { v: me.email, sure: true } : null;
      case 'phone': return me.phone ? { v: me.phone, sure: true } : null;
      case 'address1': return me.address1 ? { v: me.address1, sure: true } : null;
      case 'town': return me.town ? { v: me.town, sure: true } : null;
      case 'postcode': return me.postcode ? { v: me.postcode, sure: true } : null;
      case 'country': return { v: 'United Kingdom', sure: true };
      case 'linkedin': return me.linkedin ? { v: me.linkedin, sure: true } : null;
      case 'website': return me.website ? { v: me.website, sure: true } : null;
      case 'rtw': return { v: 'yes', sure: true, choice: true };
      case 'sponsor': return { v: me.needsSponsor ? 'yes' : 'no', sure: true, choice: true };
      case 'licence': return { v: me.licence ? 'yes' : 'no', sure: true, choice: true };
      case 'notice': return { v: data.notice || 'Immediately', sure: f.kind !== 'text' || !/date/i.test(f.label) ? true : false };
      case 'salary': return data.salary ? { v: data.salary, sure: false } : null;
      case 'source': return data.source ? { v: data.source, sure: false } : null;
      case 'letter': return data.letter ? { v: data.letter, sure: false } : null;
      case 'diversity': return f.kind === 'select' || f.kind === 'radio' ? { v: 'prefer not to say', sure: true, choice: true } : null;
      default: break;
    }
    if (f.kind === 'textarea' || (f.kind === 'text' && f.label.length > 25 && /\?|describe|tell us|why|explain|example/i.test(f.label))) {
      const a = bestAnswer(f.label, data.answers || []);
      if (a) return { v: a, sure: false };
    }
    return null;
  }
  /** The prepared answer whose question shares most words with this field's question. */
  function bestAnswer(label, answers) {
    const w = new Set(norm(label).split(' ').filter(x => x.length > 3));
    if (!w.size) return null;
    let best = null, bs = 0;
    answers.forEach(x => { const q = norm(x.q).split(' ').filter(y => y.length > 3); const s = q.filter(y => w.has(y)).length / Math.max(3, Math.min(w.size, q.length)); if (s > bs) { bs = s; best = x; } });
    return bs >= 0.5 ? best.a : null;
  }

  const MARK = { sure: '#1d6b4f', check: '#a85f00', left: '#c23b22' };
  function mark(el, level, note) {
    el.style.outline = `2.5px solid ${MARK[level]}`; el.style.outlineOffset = '2px';
    el.dataset.jtFilled = level;
    if (note) el.title = note;
  }

  /**
   * Fills what it can. files: { cv: { name, bytes, type }, letterFile? }
   * Returns { filled: [label], check: [label], left: [label], questions: [field] } — questions are
   * free-text fields with no prepared answer, for the panel to offer an AI answer.
   */
  function fill(doc, data, files) {
    const rep = { filled: [], check: [], left: [], questions: [] };
    detect(doc).forEach(f => {
      const el = f.el;
      if (f.kind === 'file') {
        const file = f.key === 'letterFile' ? files && files.letterFile : files && files.cv;
        if (file && !el.files.length && attach(el, file)) { mark(el.closest('label,div') || el, 'check', 'Файл прикреплён — проверь'); rep.check.push(f.label || 'CV'); }
        else if (!el.files.length) rep.left.push(f.label || 'файл');
        return;
      }
      if (f.key === 'consent') { mark(el, 'left', 'Согласие отметь сам'); rep.left.push(f.label); return; }
      if (f.kind === 'checkbox') return;
      const cur = f.kind === 'radio' ? f.els.some(r => r.checked) : String(el.value || '').trim();
      if (cur && f.kind !== 'select') return; // never overwrite what is there
      if (f.kind === 'select' && el.selectedIndex > 0) return;
      const val = valueFor(f, data);
      if (!val) {
        if (f.kind === 'textarea' || (f.kind === 'text' && f.label.length > 25)) { rep.questions.push(f); mark(el, 'left', 'Нужен ответ'); rep.left.push(f.label); }
        return;
      }
      let ok;
      if (f.kind === 'select' || f.kind === 'radio') ok = choose(f, val.v);
      else { setNative(el, val.v); ok = true; }
      if (!ok) { if (f.key && f.key !== 'diversity') { mark(f.els[0], 'left', 'Не нашёл подходящий вариант'); rep.left.push(f.label); } return; }
      f.els.forEach(x => mark(x, val.sure ? 'sure' : 'check', val.sure ? '' : 'Проверь'));
      (val.sure ? rep.filled : rep.check).push(f.label);
    });
    return rep;
  }
  /** Puts an answer into one field (after the panel asked the AI). */
  function put(f, text) { setNative(f.el, text); mark(f.el, 'check', 'Ответ от AI — проверь'); }

  /** Does the page say the application went through? */
  const SUCCESS = /thank you for (your )?appl|application (has been |was )?(received|submitted|sent|complete)|successfully (applied|submitted)|we('| ha)ve received your application|thanks for applying/i;

  const api = { RULES, labelOf, detect, fill, put, valueFor, bestAnswer, matches, SUCCESS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_Autofill = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
