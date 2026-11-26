/* Job Tracker — one AI module for the extension and the web app (spec §4, decision "Groq free first").
 * Rules: AI extracts and drafts, code computes numbers. No name, phone, email or address in any prompt.
 * Every JSON answer is checked by code. Answers are cached by a hash of the input, so one ad is read once.
 * The key lives only on the device (chrome.storage.local in the extension, the PIN vault in the web app),
 * never in exports, the sheet, Drive or git. */
(function (root) {
  'use strict';
  // Providers with the same (OpenAI-style) chat API. The key's prefix tells which one it is.
  const PROVIDERS = {
    groq: { name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b', keys: 'https://console.groq.com/keys' },
    gemini: { name: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.5-flash', keys: 'https://aistudio.google.com/apikey' },
    openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-oss-120b:free', keys: 'https://openrouter.ai/keys' },
  };
  const providerOf = key => (/^AIza/.test(key || '') ? 'gemini' : /^sk-or-/.test(key || '') ? 'openrouter' : 'groq');
  const DEFAULT_MODEL = PROVIDERS.groq.model;
  // A model name that belongs to another provider is replaced by that provider's default
  const modelFor = (key, model) => { const pv = providerOf(key); if (!model) return PROVIDERS[pv].model; if (pv === 'gemini' && !/^gemini/.test(model)) return PROVIDERS.gemini.model; if (pv !== 'gemini' && /^gemini/.test(model)) return PROVIDERS[pv].model; return model; };

  // FNV-1a, enough for a cache key
  function hash(s) { let h = 0x811c9dc5; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }

  // Strips contact details a user might have typed into facts or notes before anything leaves the device
  function scrub(text) {
    return String(text || '')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
      .replace(/(\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}/g, '[phone]')
      .replace(/linkedin\.com\/in\/[\w-]+/gi, '[linkedin]');
  }

  /**
   * cfg: { key, model, fetch?, cache?: { get(k): any, set(k, v) } }
   * opts: { json: true for a JSON object answer, maxTokens, temperature, cacheKey }
   */
  async function chat(cfg, messages, opts = {}) {
    if (!cfg || !cfg.key) throw new Error('Добавь ключ AI в настройках.');
    const pv = PROVIDERS[providerOf(cfg.key)], model = modelFor(cfg.key, cfg.model);
    const ck = opts.cacheKey !== false && cfg.cache ? 'llm:' + hash(JSON.stringify([model, messages, !!opts.json])) : null;
    if (ck) { const hit = await cfg.cache.get(ck); if (hit != null) return hit; }
    const f = cfg.fetch || root.fetch.bind(root);
    const body = { model, messages: messages.map(m => ({ role: m.role, content: scrub(m.content) })), temperature: opts.temperature == null ? 0.3 : opts.temperature, max_tokens: opts.maxTokens || 1400 };
    if (opts.json) body.response_format = { type: 'json_object' };
    let res;
    try { res = await f(pv.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key }, body: JSON.stringify(body) }); }
    catch (e) { throw new Error(pv.name + ' не отвечает. Проверь интернет и попробуй ещё раз.'); }
    if (res.status === 401 || res.status === 403) throw new Error(pv.name + ' не принял ключ. Проверь его в настройках.');
    if (res.status === 429) throw new Error('Лимит ' + pv.name + ' на сейчас исчерпан. Подожди минуту.');
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(pv.name + ': ' + (/model/i.test(t) ? 'модель не найдена, поменяй её в настройках' : (t.slice(0, 160) || 'ошибка ' + res.status))); }
    const d = await res.json();
    let text = String((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    let out = text;
    if (opts.json) {
      const m = text.match(/\{[\s\S]*\}/);
      try { out = JSON.parse(m ? m[0] : text); } catch (e) { throw new Error('AI ответил не JSON. Попробуй ещё раз.'); }
    }
    if (ck) await cfg.cache.set(ck, out);
    return out;
  }

  // ---------- Tasks ----------
  const F = () => root.JT_Fit;

  /** Requirements, office days, salary, agency and the real employer from an ad. Checked against the ad. */
  async function extract(cfg, job) {
    const raw = await chat(cfg, F().prompt(job), { json: true, temperature: 0 });
    return F().validate(raw, job.description || '');
  }

  const NO_INVENT = 'Use ONLY the facts in FACTS and SKILLS. Never invent employers, dates, numbers, certificates, tools or achievements. If something is not in the facts, do not claim it. British English, plain concrete sentences, no buzzwords.';

  /** Answer to one application form question, from the facts and the ad. */
  async function answer(cfg, { question, job, facts, skills, limit }) {
    return chat(cfg, [
      { role: 'system', content: `You help an entry-level IT support candidate answer application form questions. ${NO_INVENT} Answer in first person, ${limit || 120} words or fewer. For "Describe a time…" questions use a short STAR answer (situation, task, action, result) from one fact. For salary questions give a range consistent with the ad. Return only the answer.` },
      { role: 'user', content: `QUESTION: ${question}\n\nJOB: ${job.title || ''} at ${job.company || ''}\nAD:\n"""\n${String(job.description || '').slice(0, 5000)}\n"""\nFACTS:\n"""\n${facts}\n"""\nSKILLS: ${skills || ''}` },
    ], { temperature: 0.4 });
  }

  /** Parses a spoken note after a call into tracker actions. Code applies them. */
  async function voiceNote(cfg, { text, companies, today }) {
    const raw = await chat(cfg, [
      { role: 'system', content: 'You turn a short spoken note about a job application into JSON. Answer with one JSON object only.' },
      { role: 'user', content: `Today is ${today}. Known companies: ${companies.slice(0, 300).join(' | ')}.
Return JSON: {"company": the company from the list it is about (exact spelling) or null, "status": one of "screening","test","interview1","interview2","interview3","offer","rejected","withdrawn" or null,
"event": {"title": short title, "date": "YYYY-MM-DD", "time": "HH:MM" or null, "minutes": duration or null} or null, "nextDate": "YYYY-MM-DD" or null, "note": the note cleaned up in one or two sentences, "todo": [short things to do]}.
NOTE: """${text}"""` },
    ], { json: true, temperature: 0, cacheKey: false });
    const ok = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const STAT = ['screening', 'test', 'interview1', 'interview2', 'interview3', 'offer', 'rejected', 'withdrawn'];
    return {
      company: typeof raw.company === 'string' && companies.includes(raw.company) ? raw.company : null,
      status: STAT.includes(raw.status) ? raw.status : null,
      event: raw.event && ok(raw.event.date) ? { title: String(raw.event.title || 'Interview').slice(0, 100), date: raw.event.date, time: /^\d{2}:\d{2}$/.test(raw.event.time || '') ? raw.event.time : null, minutes: Number(raw.event.minutes) > 0 && Number(raw.event.minutes) < 600 ? Number(raw.event.minutes) : 60 } : null,
      nextDate: ok(raw.nextDate) ? raw.nextDate : null,
      note: String(raw.note || text).slice(0, 500),
      todo: (Array.isArray(raw.todo) ? raw.todo : []).map(String).filter(Boolean).slice(0, 5),
    };
  }

  /** Free text with the no-invention rules: letters, LinkedIn, portfolio, outreach, interview replies. */
  async function draft(cfg, { task, facts, skills, context, words }) {
    return chat(cfg, [
      { role: 'system', content: `You write for an entry-level IT support candidate in the UK. ${NO_INVENT} ${words ? `About ${words} words.` : ''} Return only the text.` },
      { role: 'user', content: `TASK: ${task}\n${context ? `CONTEXT:\n"""\n${String(context).slice(0, 6000)}\n"""\n` : ''}FACTS:\n"""\n${facts}\n"""\nSKILLS: ${skills || ''}` },
    ], { temperature: 0.5 });
  }

  /** Tools a draft names that are neither in the facts nor in the skills profile (to flag, never to keep silently). */
  function unknownTools(text, facts, profile) {
    const A = root.JT_Analyzer;
    if (!A) return [];
    const sk = (profile && profile.skills) || {};
    const known = new Set([...Object.keys(sk).filter(k => sk[k] && sk[k] !== 'none'), ...A.extractTools(facts || '')]);
    return A.extractTools(text).filter(t => !known.has(t));
  }

  /** Speech to text with Whisper on Groq (free tier). blob: audio from MediaRecorder. */
  async function transcribe(cfg, blob) {
    if (!cfg || !cfg.key) throw new Error('Добавь ключ AI в настройках.');
    if (providerOf(cfg.key) !== 'groq') throw new Error('Распознавание речи работает с ключом Groq. Без него используй кнопку микрофона на клавиатуре телефона.');
    const fd = new FormData();
    fd.append('file', blob, 'note.webm'); fd.append('model', 'whisper-large-v3-turbo'); fd.append('response_format', 'json');
    const f = cfg.fetch || root.fetch.bind(root);
    const res = await f('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + cfg.key }, body: fd });
    if (!res.ok) throw new Error(res.status === 401 ? 'Groq не принял ключ.' : 'Не удалось распознать речь (' + res.status + ')');
    const d = await res.json();
    return String(d.text || '').trim();
  }

  const api = { PROVIDERS, providerOf, modelFor, chat, extract, answer, voiceNote, draft, transcribe, unknownTools, scrub, hash, DEFAULT_MODEL, NO_INVENT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_LLM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
