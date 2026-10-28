// Accounts and the cloud copy of the save.
//
// In the packaged app this talks to Supabase, as in our other games: Sign in with Apple,
// Google, and email with a one-time code (no passwords; the code mails go out through
// Resend from noreply@nimoriq.com), plus one cloud-save row per player.
// In the browser a stand-in keeps accounts in this browser only, so the whole flow
// can be tried without a server. Nothing here ever sees a card number: purchases
// stay with Apple and Google.
//
// Every call resolves to { ok: true, ... } or { ok: false, code } where code is one of
// invalid-email, bad-code, expired, too-many, cancelled, network.
import { platform } from './platform.js';

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
  const native = platform.isNative();
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Apple asks for Sign in with Apple wherever Google sign-in is offered, so iOS shows both.
  // Android shows Google and email; the browser shows everything for testing.
  function providers() {
    if (native && !isIOS) return ['google', 'email'];
    return ['apple', 'google', 'email'];
  }

  // Apple / Google: the phone's own sheet does the work.
  async function signInWith(provider) {
    if (native) {
      const r = await platform.authSignIn(provider);
      return r || { ok: false, code: 'network' };
    }
    await wait(500);
    const db = readDb();
    const uid = `${provider}-standin`;
    const name = provider === 'apple' ? 'Apple ID' : 'Google';
    db.users[uid] = db.users[uid] || { uid, provider, name, email: null };
    writeDb(db);
    return { ok: true, user: { uid, provider, name, email: null } };
  }

  // Email: we mail a 6-digit code; entering it signs in, making the account the first time.
  // The stand-in can't send mail, so it hands the code back for the test build to show.
  const pending = {};
  async function sendCode(email) {
    email = String(email).trim().toLowerCase();
    if (!checkEmail(email)) return { ok: false, code: 'invalid-email' };
    if (native) return (await platform.authEmailCode('send', email)) || { ok: false, code: 'network' };
    await wait(400);
    const code = String(Math.floor(Math.random() * 1e6)).padStart(CODE_LENGTH, '0');
    pending[email] = { code, until: Date.now() + CODE_TTL, tries: 0 };
    return { ok: true, devCode: code };
  }

  async function verifyCode(email, code) {
    email = String(email).trim().toLowerCase();
    code = String(code).replace(/\D/g, '');
    if (native) return (await platform.authEmailCode('verify', email, code)) || { ok: false, code: 'network' };
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
  }

  async function signOut() {
    if (native) await platform.authSignOut();
    return { ok: true };
  }

  // Store rules: an account made in the app must be deletable from the app.
  async function deleteAccount(uid) {
    if (native) return (await platform.authDelete()) || { ok: false, code: 'network' };
    await wait(300);
    const db = readDb();
    delete db.users[uid];
    delete db.saves[uid];
    writeDb(db);
    return { ok: true };
  }

  async function loadCloud(uid) {
    if (native) return platform.cloudLoad(uid);
    return readDb().saves[uid] || null;
  }

  async function saveCloud(uid, data) {
    if (native) return platform.cloudSave(uid, data);
    const db = readDb();
    db.saves[uid] = data;
    writeDb(db);
    return true;
  }

  return { providers, signInWith, sendCode, verifyCode, signOut, deleteAccount, loadCloud, saveCloud, standIn: !native };
}
