// An in-memory stand-in for the Apps Script web app (google-sheets/Code.gs):
// GET returns rows, POST upserts rows and deletes IDs, both checked against a token.
'use strict';

function createFakeSheet({ token = 'secret', version = 8 } = {}) {
  const rows = new Map();
  const calls = [];
  const reply = (obj, status = 200) => ({ status, text: async () => JSON.stringify(obj) });

  async function fetch(url, opts = {}) {
    const u = new URL(url);
    if (opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      calls.push({ method: 'POST', body });
      if (body.token !== token) return reply({ ok: false, error: 'Wrong token' });
      (body.apps || []).forEach(a => rows.set(String(a.id), { ...a }));
      (body.deletes || []).forEach(id => rows.delete(String(id)));
      return reply({ ok: true, version });
    }
    calls.push({ method: 'GET', params: Object.fromEntries(u.searchParams) });
    if (u.searchParams.get('token') !== token) return reply({ ok: false, error: 'Wrong token' });
    if (u.searchParams.get('action') === 'ping') return reply({ ok: true, version, name: 'Test sheet', rows: rows.size });
    return reply({ ok: true, rows: [...rows.values()] });
  }

  return {
    fetch, rows, calls,
    /** Simulates an edit made in the sheet (e.g. on a phone): bumps the row's _updated time. */
    edit(id, patch, at = Date.now() + 60000) { rows.set(id, { ...rows.get(id), ...patch, updated: at }); },
    url: 'https://script.google.com/macros/s/TEST/exec',
    token,
  };
}

module.exports = { createFakeSheet };
