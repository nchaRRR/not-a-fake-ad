// "Save your progress": sign up or sign in with Apple, Google or email,
// keep a copy of the save in the cloud, and bring it back on a new phone.
// The game asks after the third run and twice more later if the player says "not now".
import { t, getLang, locale } from './i18n.js';
import { createAuth, CODE_LENGTH } from './auth.js';
import { watchSave } from './save.js';

const SAVE_KEY = 'not-a-fake-ad-v1';
export const LINK_BONUS = 300;
const ASK_AT = [3, 8, 20]; // completed runs before each ask

export function createAccount(ctx) {
  const { save, writeSave, sfx, track, popup, refreshWallet, fmt, anyModalOpen } = ctx;
  const $ = (id) => document.getElementById(id);
  const auth = createAuth();
  const screen = $('screen-account');
  let from = null; // 'settings' when opened from there
  let codeEmail = '';
  let resendAt = 0;
  let resendTimer = 0;
  let busy = false;
  let pendingCloud = null;
  let leaving = false;

  // ------------------------------------------------------------ cloud copy
  const cloudCopy = () => {
    const copy = JSON.parse(JSON.stringify(save));
    delete copy.account;
    return { save: copy, at: Date.now(), level: save.level };
  };
  let syncTimer = 0;
  async function syncNow() {
    if (!save.account || leaving) return false;
    clearTimeout(syncTimer);
    const ok = await auth.saveCloud(save.account.uid, cloudCopy());
    if (ok) {
      save.account.synced = Date.now();
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
    }
    return ok;
  }
  watchSave(() => {
    if (!save.account) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, 4000);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && save.account) syncNow(); });

  // ------------------------------------------------------------ panels
  function show(panel) {
    for (const el of screen.querySelectorAll('[data-panel]')) el.hidden = el.dataset.panel !== panel;
    if (panel === 'pick') {
      for (const p of ['apple', 'google', 'email']) $(`btn-auth-${p}`).hidden = !auth.providers().includes(p);
      $('account-bonus').hidden = !!save.accountBonus;
      $('account-bonus-n').textContent = fmt(LINK_BONUS);
      $('account-standin').hidden = !auth.standIn;
      $('btn-account-later').textContent = t(from === 'settings' ? 'back' : 'acc.later');
    }
    if (panel === 'email') renderEmail();
    if (panel === 'me') renderMe();
    screen.hidden = false;
  }

  // Email has two steps: the address, then the code we mailed to it.
  function renderEmail(step = 'address') {
    $('email-step-address').hidden = step !== 'address';
    $('email-step-code').hidden = step !== 'code';
    $('email-title').textContent = t(step === 'code' ? 'acc.code.title' : 'acc.email.title');
    if (step === 'code') {
      $('code-sent-to').textContent = t('acc.code.sent', { email: codeEmail });
      $('acc-code').value = '';
      tickResend();
    }
    setError(null);
  }

  function tickResend() {
    clearTimeout(resendTimer);
    const left = Math.ceil((resendAt - Date.now()) / 1000);
    const b = $('btn-code-resend');
    b.disabled = left > 0;
    b.textContent = left > 0 ? t('acc.code.resendIn', { n: left }) : t('acc.code.resend');
    if (left > 0) resendTimer = setTimeout(tickResend, 500);
  }

  function renderMe() {
    const a = save.account;
    if (!a) return;
    const label = a.email || a.name || '';
    $('me-avatar').textContent = (label[0] || '?').toUpperCase();
    $('me-name').textContent = label;
    $('me-provider').textContent = t(`acc.via.${a.provider}`);
    $('me-synced').textContent = a.synced ? t('acc.synced', { time: new Date(a.synced).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) }) : t('acc.notSynced');
    $('delete-confirm').hidden = true;
    $('btn-acc-delete').hidden = false;
  }

  function setError(code) {
    const el = $('acc-error');
    el.hidden = !code;
    if (code) el.textContent = t(`acc.err.${code}`);
  }

  function setBusy(on) {
    busy = on;
    for (const b of screen.querySelectorAll('button')) b.disabled = on;
    if (!on && !$('email-step-code').hidden) tickResend();
  }

  function close() {
    screen.hidden = true;
    if (from === 'settings') ctx.backToSettings();
    from = null;
  }

  // ------------------------------------------------------------ signing in
  async function finishSignIn(user, how) {
    save.account = { uid: user.uid, provider: user.provider, email: user.email || null, name: user.name || null, since: Date.now(), synced: 0 };
    track('account_signin', { provider: user.provider, how });
    const cloud = await auth.loadCloud(user.uid);
    // A save already in the cloud that is further along: let the player choose.
    if (cloud && cloud.save && (cloud.save.level > save.level || (cloud.save.level === save.level && (cloud.save.coins || 0) > save.coins))) {
      pendingCloud = cloud;
      $('conflict-cloud').textContent = t('acc.conflict.line', { n: cloud.save.level, c: fmt(cloud.save.coins || 0) });
      $('conflict-here').textContent = t('acc.conflict.line', { n: save.level, c: fmt(save.coins) });
      writeSave(save);
      show('conflict');
      return;
    }
    grantBonus();
    writeSave(save);
    await syncNow();
    doneSignedIn();
  }

  function grantBonus() {
    if (save.accountBonus) return;
    save.accountBonus = true;
    save.coins += LINK_BONUS;
    refreshWallet();
  }

  function doneSignedIn() {
    sfx.win();
    popup(t('acc.saved'), 'good');
    if (from === 'settings') show('me');
    else screen.hidden = true;
  }

  async function withProvider(p) {
    if (busy) return;
    setBusy(true);
    const r = await auth.signInWith(p);
    setBusy(false);
    if (!r.ok) {
      if (r.code !== 'cancelled') popup(t(`acc.err.${r.code}`), 'bad');
      return;
    }
    await finishSignIn(r.user, p);
  }

  for (const p of ['apple', 'google']) $(`btn-auth-${p}`).addEventListener('click', () => { sfx.tap(); withProvider(p); });
  $('btn-auth-email').addEventListener('click', () => { sfx.tap(); show('email'); $('acc-email').focus(); });
  $('btn-email-back').addEventListener('click', () => show('pick'));
  $('btn-code-change').addEventListener('click', () => { renderEmail('address'); $('acc-email').focus(); });

  async function sendCode() {
    setBusy(true);
    const r = await auth.sendCode($('acc-email').value);
    setBusy(false);
    if (!r.ok) { setError(r.code); return false; }
    codeEmail = $('acc-email').value.trim().toLowerCase();
    resendAt = Date.now() + 30000;
    renderEmail('code');
    // Test build only: there is no mail server, so show the code on screen.
    $('code-dev').hidden = !r.devCode;
    if (r.devCode) $('code-dev').textContent = t('acc.code.dev', { code: r.devCode });
    $('acc-code').focus();
    return true;
  }

  $('email-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!$('email-step-address').hidden) { await sendCode(); return; }
    setBusy(true);
    const r = await auth.verifyCode(codeEmail, $('acc-code').value);
    setBusy(false);
    if (!r.ok) { setError(r.code); return; }
    await finishSignIn(r.user, 'email');
  });
  $('acc-code').addEventListener('input', () => {
    const el = $('acc-code');
    el.value = el.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (el.value.length === CODE_LENGTH) $('email-form').requestSubmit();
  });
  $('btn-code-resend').addEventListener('click', () => { $('acc-email').value = codeEmail; sendCode(); });

  // ------------------------------------------------------------ cloud vs this phone
  $('btn-conflict-cloud').addEventListener('click', () => {
    if (!pendingCloud) return;
    const next = { ...pendingCloud.save, account: { ...save.account, synced: Date.now() } };
    track('account_restore', { level: next.level });
    // Swap the save in memory too, so nothing written while the page reloads brings the old one back.
    leaving = true;
    clearTimeout(syncTimer);
    for (const k of Object.keys(save)) delete save[k];
    Object.assign(save, next);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
    location.reload();
  });
  $('btn-conflict-here').addEventListener('click', async () => {
    pendingCloud = null;
    grantBonus();
    writeSave(save);
    await syncNow();
    doneSignedIn();
  });

  // ------------------------------------------------------------ signed-in screen
  $('btn-acc-sync').addEventListener('click', async () => {
    setBusy(true);
    const ok = await syncNow();
    setBusy(false);
    popup(t(ok ? 'acc.syncOk' : 'acc.err.network'), ok ? 'good' : 'bad');
    renderMe();
  });
  $('btn-acc-signout').addEventListener('click', async () => {
    await syncNow();
    await auth.signOut();
    track('account_signout', {});
    delete save.account;
    writeSave(save);
    popup(t('acc.signedOut'));
    close();
  });
  $('btn-acc-delete').addEventListener('click', () => {
    $('btn-acc-delete').hidden = true;
    $('delete-confirm').hidden = false;
  });
  $('btn-delete-no').addEventListener('click', renderMe);
  $('btn-delete-yes').addEventListener('click', async () => {
    setBusy(true);
    const r = await auth.deleteAccount(save.account.uid);
    setBusy(false);
    if (!r.ok) { popup(t('acc.err.network'), 'bad'); return; }
    track('account_delete', {});
    delete save.account;
    writeSave(save);
    popup(t('acc.deleted'));
    close();
  });

  $('btn-account-later').addEventListener('click', () => {
    if (from !== 'settings') {
      const ask = save.accountAsk || { n: 0 };
      track('account_prompt_later', { n: ask.n });
    }
    close();
  });
  for (const id of ['btn-me-close']) $(id).addEventListener('click', close);

  // ------------------------------------------------------------ on launch
  // The sign-in on this device ended (signed out elsewhere, or the account was deleted):
  // the progress stays on the phone, the player can sign in again from Settings.
  if (save.account && !auth.hasSession()) {
    delete save.account;
    writeSave(save);
  }
  // Web: coming back from the Google / Apple page.
  auth.resume().then((r) => {
    if (!r) return;
    if (r.ok) finishSignIn(r.user, 'oauth');
    else if (r.code !== 'cancelled') popup(t(`acc.err.${r.code}`), 'bad');
  });

  // ------------------------------------------------------------ public
  return {
    open(source) {
      from = source || null;
      show(save.account ? 'me' : 'pick');
    },
    label() {
      const a = save.account;
      return a ? (a.email || a.name || t(`acc.via.${a.provider}`)) : t('acc.signedOutState');
    },
    // Called after every finished run (won or lost).
    onRunEnd() {
      save.runs = (save.runs || 0) + 1;
    },
    // Asks once the result screen has settled, if nothing else is on screen.
    maybeAsk() {
      if (save.account) return false;
      const ask = save.accountAsk || { n: 0 };
      if (ask.n >= ASK_AT.length || (save.runs || 0) < ASK_AT[ask.n] || anyModalOpen()) return false;
      save.accountAsk = { n: ask.n + 1 };
      writeSave(save);
      track('account_prompt', { n: ask.n + 1, runs: save.runs });
      from = null;
      show('pick');
      return true;
    },
  };
}
