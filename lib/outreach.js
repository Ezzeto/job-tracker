/* Job Tracker — cold outreach to employers nearby (market B).
 * Employers come from a starting list and from OpenStreetMap (schools, colleges, universities, hospitals,
 * councils, IT companies and computer shops within a radius of home). This file is pure: it builds the
 * Overpass query, turns its answer into employers, ranks them, and says who to write to today and who
 * is due a second email. The web app draws the map and sends nothing by itself. */
(function (root) {
  'use strict';
  const DAY = 864e5;

  // How promising an employer type is for part-time IT support, and its label
  const TYPES = {
    college: ['Колледж', 3], university: ['Университет', 3], school: ['Школа', 2.4], it: ['IT-компания', 2.6],
    computer: ['Ремонт и продажа ПК', 1.8], hospital: ['Больница', 1.6], council: ['Совет', 1.6], retail: ['Ритейл', 1.2], other: ['Другое', 1],
  };
  const PRIMARY = /\b(primary|infant|junior school|nursery|pre-?school|first school|kindergarten|montessori|playgroup)\b/i;

  function overpassQuery(lat, lon, km) {
    const r = Math.round(Math.max(5, Math.min(60, km || 30)) * 1000);
    const a = `(around:${r},${lat},${lon})`;
    return `[out:json][timeout:90];(nwr["amenity"~"^(school|college|university)$"]["name"]${a};nwr["amenity"="hospital"]["name"]${a};nwr["office"~"^(it|telecommunication)$"]["name"]${a};nwr["shop"="computer"]["name"]${a};nwr["office"="government"]["name"~"Council"]${a};nwr["shop"="electronics"]["name"~"Currys|Apple"]${a};);out center tags 3000;`;
  }

  /** Overpass elements → employers. Primary schools are left out unless asked for. */
  function fromOsm(elements, home, opts = {}) {
    const out = [], seen = new Set();
    (elements || []).forEach(el => {
      const t = el.tags || {};
      const name = String(t.name || '').trim();
      const lat = el.lat != null ? el.lat : el.center && el.center.lat, lon = el.lon != null ? el.lon : el.center && el.center.lon;
      if (!name || lat == null) return;
      let type = t.amenity === 'university' ? 'university' : t.amenity === 'college' ? 'college' : t.amenity === 'school' ? 'school'
        : t.amenity === 'hospital' ? 'hospital' : /^(it|telecommunication)$/.test(t.office || '') ? 'it' : t.shop === 'computer' ? 'computer'
        : t.office === 'government' ? 'council' : t.shop === 'electronics' ? 'retail' : 'other';
      if (type === 'school' && !opts.primary && (PRIMARY.test(name) || t['isced:level'] === '1' || t['school:level'] === 'primary')) return;
      if (type === 'school' && /\b(college)\b/i.test(name) && /sixth form|further education/i.test(name)) type = 'college';
      const town = t['addr:city'] || t['addr:town'] || t['addr:village'] || t['addr:suburb'] || '';
      const key = (name + '|' + town).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const site = t.website || t['contact:website'] || t.url || '';
      out.push({
        id: 'o' + el.type[0] + el.id, name, type, town, lat: +lat, lon: +lon, km: home ? Math.round(km(home, [lat, lon]) * 10) / 10 : null,
        website: /^https?:\/\//.test(site) ? site : site ? 'https://' + site : '', email: t.email || t['contact:email'] || '', phone: t.phone || t['contact:phone'] || '',
        status: 'todo', src: 'osm',
      });
    });
    return out;
  }
  // Straight-line distance in km
  function km(a, b) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** Higher is better: the type's promise divided by the distance, so a college 8 km away beats a shop 3 km away. */
  function priority(e) {
    const w = (TYPES[e.type] || TYPES.other)[1];
    const d = e.km == null ? 20 : Math.max(2, e.km);
    return (w * w) / Math.sqrt(d) + (e.email ? 0.15 : 0) + (e.website ? 0.05 : 0);
  }

  /** Who to write to today: not contacted yet, best first. */
  function queue(list, n) {
    return (list || []).filter(e => e.status === 'todo' && !e.skip).sort((a, b) => priority(b) - priority(a)).slice(0, n || 5);
  }

  /** Sent 7+ days ago with no reply and no second email yet. */
  function followUpsDue(list, now) {
    const t = now || Date.now();
    return (list || []).filter(e => e.status === 'sent' && e.contactedAt && !e.followedAt && (t - Date.parse(e.contactedAt + 'T12:00:00')) / DAY >= 7);
  }

  /** Merges employers from two places (device and sheet): the later change wins per employer. */
  function merge(a, b) {
    const map = new Map();
    (a || []).concat(b || []).forEach(e => { const cur = map.get(e.id); if (!cur || (e.upd || 0) > (cur.upd || 0)) map.set(e.id, e); });
    return [...map.values()];
  }
  /** Only what you touched goes to the sheet: the OpenStreetMap list stays on the device. */
  const touched = list => (list || []).filter(e => e.status !== 'todo' || e.contact || e.email && e.src === 'user' || e.watchUrl || e.note || e.src === 'user' || e.skip);

  /** The domain of an email address or a website, for matching replies. */
  function domainOf(x) {
    const s = String(x || '').trim().toLowerCase();
    const m = s.match(/@([a-z0-9.-]+\.[a-z]{2,})$/) || s.match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/);
    if (!m) return '';
    const d = m[1].replace(/^www\./, '');
    return /^(gmail|googlemail|outlook|hotmail|yahoo|icloud|live|aol)\./.test(d) ? '' : d;
  }

  const api = { TYPES, overpassQuery, fromOsm, km, priority, queue, followUpsDue, merge, touched, domainOf, PRIMARY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JT_Outreach = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
