// Accounts and the cloud copy of the save.
//
// The phone app talks to Supabase (src/cloud.js), the same project as Kelime Köyü: Sign in with
// Apple, Google, and email with a one-time code (no passwords), plus one cloud-save row per player.
// The web preview cannot reach the server, so it uses a stand-in that keeps accounts in this
// browser only (the build sets __CLOUD__ to choose). Nothing here ever sees a card number: purchases
// stay with Apple and Google.
//
// Every call resolves to { ok: true, ... } or { ok: false, code } where code is one of
// invalid-email, bad-code, expired, too-many, cancelled, network.
import { createCloud, CloudError, isNative } from './cloud.js';

// eslint-disable-next-line no-undef
const USE_CLOUD = typeof __CLOUD__ !== 'undefined' && __CLOUD__;

const STANDIN = 'not-a-fake-ad-standin-accounts';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const CODE_LENGTH = 6;
const CODE_TTL = 10 * 60 * 1000;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));


function readDb() {
  try { return JSON.parse(localStorage.getItem(STANDIN)) || { users: {}, saves: {} }; } catch (e) { return { users: {}, saves: {} }; }
}
function writeDb(db) {
  try { localStorage.setItem(STANDIN, JSON.stringify(db)); } catch (e) { /* stand-in only */ }
}

export function checkEmail(email) {
  return EMAIL_RE.test(String(email).trim());
}

export function createAuth() {
  const native = isNative();
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Apple asks for Sign in with Apple wherever Google sign-in is offered, so iOS shows both.
  // Android shows Google and email; the browser shows everything.
  function providers() {
    if (native && !isIOS) return ['google', 'email'];
    return ['apple', 'google', 'email'];
  }

  return USE_CLOUD ? cloudBackend(providers) : standInBackend(providers);
}

// ---------------------------------------------------------------- real accounts (Supabase)
function cloudBackend(providers) {
  const cloud = createCloud();
  const fail = (err) => {
    const kind = err instanceof CloudError ? err.kind : 'offline';
    if (kind === 'cancel') return { ok: false, code: 'cancelled' };
    if (kind === 'rate') return { ok: false, code: 'too-many' };
    if (kind === 'offline' || kind === 'server') return { ok: false, code: 'network' };
    return { ok: false, code: 'network' };
  };
  const userFrom = (s, provider) => ({
    uid: s.user.id,
    provider,
    email: s.user.email || null,
    name: s.user.email ? s.user.email.split('@')[0] : null,
  });

  return {
    providers,
    standIn: false,
    async signInWith(provider) {
      try { return { ok: true, user: userFrom(await cloud.oauth(provider), provider) }; } catch (err) { return fail(err); }
    },
    async sendCode(email) {
      email = String(email).trim().toLowerCase();
      if (!checkEmail(email)) return { ok: false, code: 'invalid-email' };
      try { await cloud.sendCode(email); return { ok: true }; } catch (err) {
        return err.kind === 'invalid' ? { ok: false, code: 'invalid-email' } : fail(err);
      }
    },
    async verifyCode(email, code) {
      email = String(email).trim().toLowerCase();
      code = String(code).replace(/\D/g, '');
      try { return { ok: true, user: userFrom(await cloud.verifyCode(email, code), 'email') }; } catch (err) {
        // Supabase answers a wrong and an expired code the same way.
        return err.kind === 'invalid' || err.kind === 'auth' ? { ok: false, code: 'bad-code' } : fail(err);
      }
    },
    // Web: finishes a Google / Apple sign-in after the provider sends the page back.
    async resume() {
      try {
        const r = await cloud.resume();
        return r ? { ok: true, user: userFrom(r.session, r.provider) } : null;
      } catch (err) { return fail(err); }
    },
    hasSession: () => !!cloud.session,
    async signOut() { await cloud.signOut(); return { ok: true }; },
    async deleteAccount() {
      try { await cloud.deleteAccount(); return { ok: true }; } catch (err) { return fail(err); }
    },
    async loadCloud() {
      try { return await cloud.loadSave(); } catch (err) { return null; }
    },
    async saveCloud(uid, data) {
      try { return await cloud.writeSave(data); } catch (err) { return false; }
    },
  };
}

// ---------------------------------------------------------------- stand-in (web preview)
function standInBackend(providers) {
  const pending = {};
  return {
    providers,
    standIn: true,
    async signInWith(provider) {
      await wait(500);
      const db = readDb();
      const uid = `${provider}-standin`;
      const name = provider === 'apple' ? 'Apple ID' : 'Google';
      db.users[uid] = db.users[uid] || { uid, provider, name, email: null };
      writeDb(db);
      return { ok: true, user: { uid, provider, name, email: null } };
    },
    // There is no mail server here, so the code comes back for the test build to show.
    async sendCode(email) {
      email = String(email).trim().toLowerCase();
      if (!checkEmail(email)) return { ok: false, code: 'invalid-email' };
      await wait(400);
      const code = String(Math.floor(Math.random() * 1e6)).padStart(CODE_LENGTH, '0');
      pending[email] = { code, until: Date.now() + CODE_TTL, tries: 0 };
      return { ok: true, devCode: code };
    },
    async verifyCode(email, code) {
      email = String(email).trim().toLowerCase();
      code = String(code).replace(/\D/g, '');
      await wait(400);
      const p = pending[email];
      if (!p || Date.now() > p.until) return { ok: false, code: 'expired' };
      if (++p.tries > 5) return { ok: false, code: 'too-many' };
      if (p.code !== code) return { ok: false, code: 'bad-code' };
      delete pending[email];
      const db = readDb();
      const uid = `email-${email}`;
      db.users[uid] = db.users[uid] || { uid, provider: 'email', email, name: email.split('@')[0] };
      writeDb(db);
      return { ok: true, user: { uid, provider: 'email', email, name: email.split('@')[0] } };
    },
    async resume() { return null; },
    hasSession: () => true,
    async signOut() { return { ok: true }; },
    async deleteAccount(uid) {
      await wait(300);
      const db = readDb();
      delete db.users[uid];
      delete db.saves[uid];
      writeDb(db);
      return { ok: true };
    },
    async loadCloud(uid) { return readDb().saves[uid] || null; },
    async saveCloud(uid, data) {
      const db = readDb();
      db.saves[uid] = data;
      writeDb(db);
      return true;
    },
  };
}
