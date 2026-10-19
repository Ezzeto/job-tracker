// Loads the extension's lib/ files into a Node process with a fake chrome.storage,
// so the same code that runs in the browser can be unit-tested without a browser.
'use strict';
const path = require('node:path');

function fakeStorage() {
  let data = {};
  const pick = keys => {
    if (keys == null) return { ...data };
    const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    const out = {};
    list.forEach(k => { if (k in data) out[k] = structuredClone(data[k]); });
    return out;
  };
  return {
    local: {
      get: (keys, cb) => cb(pick(keys)),
      set: (obj, cb) => { data = { ...data, ...structuredClone(obj) }; if (cb) cb(); },
    },
    reset: () => { data = {}; },
  };
}

const storage = fakeStorage();
globalThis.chrome = { storage: { local: storage.local } };

const lib = f => require(path.join(__dirname, '..', '..', 'lib', f));
lib('quality.js');
lib('analyzer.js');
lib('store.js');
lib('legacy.js');
lib('extract.js');
lib('followup.js');
lib('sync.js');
lib('cv.js');
lib('recheck.js');

module.exports = {
  A: globalThis.JT_Analyzer,
  Q: globalThis.JT_Quality,
  S: globalThis.JT_Store,
  L: globalThis.JT_Legacy,
  E: globalThis.JT_Extract,
  F: globalThis.JT_Follow,
  Sync: globalThis.JT_Sync,
  CV: globalThis.JT_CV,
  R: globalThis.JT_Recheck,
  resetStorage: storage.reset,
};
