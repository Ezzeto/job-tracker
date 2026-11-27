/* Job Tracker — chance of an interview invitation (spec §3).
 * Starts from your own base rate and shifts it by factors known when you apply (channel, level,
 * freshness, competition, Fit, region, market, tailoring). Naive Bayes in odds form, smoothed towards
 * the base with k = 10, so "1 of 3" never becomes 33%. The result is capped at 0.2–30%.
 * Success = screening or later; failure = rejected or 21+ days of silence; still waiting and
 * withdrawn before an answer are left out. Pure functions. */
(function (root) {
  'use strict';
  const POS = ['screening', 'test', 'interview1', 'interview2', 'interview3', 'offer', 'accepted', 'declined'];
  const DAY = 864e5;
  const K = 10;

  /**
   * One application as plain facts. Accepts the extension's record or the web app's row-object:
   * { status, history?, appliedAt, title, company, location, agency, method, adAge, applicants, fit, market, tailored, cover }
   */
  function features(x) {
    const f = [];
    const method = String(x.method || '').toLowerCase();
    f.push('channel:' + (/referr/.test(method) ? 'referral' : x.agency || /agency|recruit/.test(method) ? 'agency' : /inbound|recruiter (approached|contacted)/.test(method) ? 'inbound' : 'direct'));
    const t = String(x.title || '').toLowerCase();
    f.push('level:' + (/\b(senior|lead|principal|manager|3rd line)\b/.test(t) ? 'senior' : /\b(2nd line|second line|engineer|administrator)\b/.test(t) ? 'mid' : 'junior'));
    const age = num(x.adAge);
    if (age != null) f.push('fresh:' + (age <= 2 ? '0-2' : age <= 7 ? '3-7' : '8+'));
    const ap = num(x.applicants);
    if (ap != null) f.push('comp:' + (ap < 50 ? '<50' : ap <= 200 ? '50-200' : '200+'));
    const fit = num(x.fit);
    if (fit != null) f.push('fit:' + (fit >= 80 ? '80+' : fit >= 60 ? '60-79' : '<60'));
    const loc = String(x.location || '').toLowerCase();
    if (loc) f.push('region:' + (/remote/.test(loc) ? 'remote' : /london/.test(loc) ? 'london' : /herts|hertford|essex|cambridge|harlow|stortford|stansted|chelmsford|ware|stevenage|saffron/.test(loc) ? 'local' : 'other'));
    if (x.market) f.push('market:' + x.market);
    if (x.tailored != null) f.push('cv:' + (x.tailored ? 'tailored' : 'standard'));
    if (x.cover != null) f.push('cover:' + (x.cover ? 'yes' : 'no'));
    return f;
  }
  const num = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

  /** 'pos' | 'neg' | null (still open or withdrawn) */
  function outcome(x, now) {
    const reached = POS.includes(x.status) || (x.history || []).some(h => !h.undone && POS.includes(h.status));
    if (reached) return 'pos';
    if (x.status === 'rejected' || x.status === 'noresponse') return 'neg';
    if (x.status === 'applied' && x.appliedAt && ((now || Date.now()) - Date.parse(x.appliedAt)) / DAY >= 21) return 'neg';
    return null;
  }

  /** Counts per factor over closed applications. */
  function stats(list, now) {
    const s = { pos: {}, n: {}, totalPos: 0, totalN: 0 };
    (list || []).forEach(x => {
      const o = outcome(x, now);
      if (!o) return;
      s.totalN++; if (o === 'pos') s.totalPos++;
      features(x).forEach(f => { s.n[f] = (s.n[f] || 0) + 1; if (o === 'pos') s.pos[f] = (s.pos[f] || 0) + 1; });
    });
    s.p0 = s.totalN ? Math.max(0.002, s.totalPos / s.totalN) : 0.014;
    return s;
  }

  const toOdds = p => p / (1 - p);
  const NAMES = {
    'channel:direct': 'прямой работодатель', 'channel:agency': 'агентство', 'channel:referral': 'рекомендация', 'channel:inbound': 'рекрутер сам написал',
    'level:junior': 'junior-роль', 'level:mid': 'роль уровня 2nd line', 'level:senior': 'senior-роль',
    'fresh:0-2': 'вакансии 0–2 дня', 'fresh:3-7': 'вакансии 3–7 дней', 'fresh:8+': 'вакансии больше недели',
    'comp:<50': 'меньше 50 откликов', 'comp:50-200': '50–200 откликов', 'comp:200+': 'больше 200 откликов',
    'fit:80+': 'Fit 80+', 'fit:60-79': 'Fit 60–79', 'fit:<60': 'Fit ниже 60',
    'region:london': 'Лондон', 'region:local': 'рядом с домом', 'region:remote': 'удалённо', 'region:other': 'далеко',
    'market:A': 'рынок А', 'market:B': 'рынок Б', 'cv:tailored': 'подогнанное CV', 'cv:standard': 'обычное CV', 'cover:yes': 'с письмом', 'cover:no': 'без письма',
  };

  /** { p, lo, hi, relative, reasons: [{ f, name, lr, n }], lowData, p0 } */
  function predict(x, s) {
    const p0 = s.p0;
    let odds = toOdds(p0);
    const reasons = [];
    features(x).forEach(f => {
      const pos = s.pos[f] || 0, n = s.n[f] || 0;
      const r = (pos + K * p0) / (n + K);
      const lr = toOdds(r) / toOdds(p0);
      odds *= lr;
      if (Math.abs(Math.log(lr)) > 0.2) reasons.push({ f, name: NAMES[f] || f, lr, n, pos });
    });
    const p = Math.min(0.30, Math.max(0.002, odds / (1 + odds)));
    reasons.sort((a, b) => Math.abs(Math.log(b.lr)) - Math.abs(Math.log(a.lr)));
    return { p, lo: Math.max(0.001, p / 2.5), hi: Math.min(0.5, p * 2.5), relative: p / p0, reasons: reasons.slice(0, 3), lowData: s.totalPos < 15, p0, successes: s.totalPos };
  }

  /** Text for a card: "Шанс ≈ 3% (1–7%), в 2× выше среднего: прямой работодатель, junior-роль". */
  function describe(pr) {
    const pc = v => (v * 100 < 1 ? (Math.round(v * 1000) / 10) : Math.round(v * 100)).toString().replace('.', ',') + '%';
    const rel = pr.relative >= 1.15 ? `в ${(Math.round(pr.relative * 10) / 10).toString().replace('.', ',')}× выше твоей средней` : pr.relative <= 0.87 ? `в ${(Math.round(10 / pr.relative) / 10).toString().replace('.', ',')}× ниже твоей средней` : 'как твоя средняя';
    const why = pr.reasons.map(r => r.name).join(', ');
    return { main: pr.lowData ? rel : `≈ ${pc(pr.p)}`, sub: pr.lowData ? `≈ ${pc(pr.p)} (${pc(pr.lo)}–${pc(pr.hi)})` : rel, why, note: pr.lowData ? `мало данных: ${pr.successes} ${pr.successes === 1 ? 'приглашение' : pr.successes >= 2 && pr.successes <= 4 ? 'приглашения' : 'приглашений'} — модель уточнится после 15` : '' };
  }

  /** Calibration (spec §3): predicted at apply time vs what happened. Brier score against "always the base". */
  function calibration(list, now) {
    const rows = (list || []).map(x => ({ p: num(x.predicted), o: outcome(x, now) })).filter(r => r.p != null && r.o);
    if (!rows.length) return null;
    const base = rows.filter(r => r.o === 'pos').length / rows.length;
    const brier = rows.reduce((t, r) => t + Math.pow(r.p / 100 - (r.o === 'pos' ? 1 : 0), 2), 0) / rows.length;
    const brier0 = rows.reduce((t, r) => t + Math.pow(base - (r.o === 'pos' ? 1 : 0), 2), 0) / rows.length;
    const bins = [[0, 2], [2, 5], [5, 101]].map(([lo, hi]) => { const b = rows.filter(r => r.p >= lo && r.p < hi); return { lo, hi, n: b.length, actual: b.length ? b.filter(r => r.o === 'pos').length / b.length : null }; });
    return { n: rows.length, brier, brier0, better: brier < brier0, bins };
  }

  const api = { features, outcome, stats, predict, describe, calibration, POS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_Chance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
