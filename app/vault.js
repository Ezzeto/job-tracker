/* Job Tracker phone app — PIN lock.
 * The sync token, cached applications and unsent changes are kept encrypted (AES-GCM) with a key
 * derived from the PIN (PBKDF2-SHA-256, 310 000 rounds, random salt). Without the PIN the stored
 * data is unreadable, also from the browser's developer tools. The PIN itself is never stored. */
(function (root) {
  'use strict';
  const ROUNDS = 310000;
  const subtle = () => (root.crypto && root.crypto.subtle) || null;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = buf => { let s = ''; new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); }); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function deriveKey(pin, salt) {
    const base = await subtle().importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', salt, iterations: ROUNDS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  /** A new key for a new PIN: { key, salt } */
  async function newKey(pin) {
    const salt = root.crypto.getRandomValues(new Uint8Array(16));
    return { key: await deriveKey(pin, salt), salt };
  }
  /** Encrypts obj with an existing key. */
  async function seal(k, obj) {
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, k.key, enc.encode(JSON.stringify(obj)));
    return { v: 1, salt: b64(k.salt), iv: b64(iv), ct: b64(ct) };
  }
  /** Opens a sealed box with the PIN. Returns { data, k } or throws on a wrong PIN. */
  async function open(pin, box) {
    const salt = unb64(box.salt);
    const key = await deriveKey(pin, salt);
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
    return { data: JSON.parse(dec.decode(pt)), k: { key, salt } };
  }
  const validPin = p => /^\d{4,8}$/.test(String(p || ''));
  root.JT_Vault = { newKey, seal, open, validPin, supported: () => !!subtle(), ROUNDS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
