// Settings, privacy and store-required screens: restore purchases, ad consent,
// credits and licenses, graphics quality, vibration, progress reset.
import { t } from './i18n.js';
import { platform } from './platform.js';

export const VERSION = '0.9.0';

export function createSettings(ctx) {
  const { save, writeSave, sfx, payments, applyQuality, popup, track } = ctx;
  const $ = (id) => document.getElementById(id);
  const screens = ['screen-settings', 'screen-privacy', 'screen-credits', 'screen-consent', 'screen-transfer'];
  const showOnly = (id) => { for (const s of screens) $(s).hidden = s !== id; };

  function render() {
    $('btn-notify').textContent = t(save.notify === false ? 'set.notify.off' : 'set.notify.on');
    $('btn-notify').setAttribute('aria-pressed', String(save.notify === false));
    $('btn-haptics').textContent = t(save.haptics === false ? 'set.haptics.off' : 'set.haptics.on');
    $('btn-haptics').setAttribute('aria-pressed', String(save.haptics === false));
    for (const b of document.querySelectorAll('[data-quality]')) {
      b.setAttribute('aria-pressed', String((save.quality || 'auto') === b.dataset.quality));
    }
    $('consent-state').textContent = t(save.adConsent === 'personalized' ? 'consent.state.yes' : 'consent.state.no');
    $('settings-version').textContent = `Not a Fake Ad v${VERSION} · Nimoriq`;
    $('reset-confirm').hidden = true;
    $('btn-reset').hidden = false;
  }

  $('btn-settings').addEventListener('click', () => { sfx.tap(); render(); showOnly('screen-settings'); });
  $('btn-settings-close').addEventListener('click', () => showOnly(null));

  $('btn-notify').addEventListener('click', async () => {
    save.notify = save.notify === false;
    if (save.notify) await platform.requestNotificationPermission();
    writeSave(save);
    render();
  });

  // ---- move progress between phones with a code (no server needed)
  const fnv = (str) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  };
  function encode() {
    const json = JSON.stringify({ v: 1, save });
    let bin = '';
    for (const b of new TextEncoder().encode(json)) bin += String.fromCharCode(b);
    return `NFA1-${btoa(bin)}-${fnv(json)}`;
  }
  function decode(code) {
    const m = /^NFA1-([A-Za-z0-9+/=]+)-([0-9a-f]{8})$/.exec(String(code).replace(/\s+/g, ''));
    if (!m) return null;
    try {
      const bin = atob(m[1]);
      const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
      if (fnv(json) !== m[2]) return null;
      const data = JSON.parse(json);
      return data && data.v === 1 && data.save && typeof data.save.level === 'number' ? data.save : null;
    } catch (e) {
      return null;
    }
  }
  $('btn-transfer').addEventListener('click', () => {
    $('transfer-code').value = encode();
    $('transfer-input').value = '';
    $('transfer-error').hidden = true;
    $('transfer-confirm').hidden = true;
    $('btn-transfer-load').hidden = false;
    showOnly('screen-transfer');
  });
  $('btn-transfer-back').addEventListener('click', () => { render(); showOnly('screen-settings'); });
  $('btn-transfer-copy').addEventListener('click', () => {
    const box = $('transfer-code');
    const done = () => { $('btn-transfer-copy').textContent = t('transfer.copied'); };
    try {
      navigator.clipboard.writeText(box.value).then(done, () => { box.select(); });
    } catch (e) {
      box.select();
    }
  });
  let pending = null;
  $('btn-transfer-load').addEventListener('click', () => {
    pending = decode($('transfer-input').value);
    $('transfer-error').hidden = !!pending;
    if (!pending) return;
    $('btn-transfer-load').hidden = true;
    $('transfer-confirm').hidden = false;
  });
  $('btn-transfer-no').addEventListener('click', () => {
    pending = null;
    $('transfer-confirm').hidden = true;
    $('btn-transfer-load').hidden = false;
  });
  $('btn-transfer-yes').addEventListener('click', () => {
    if (!pending) return;
    try { localStorage.setItem('not-a-fake-ad-v1', JSON.stringify(pending)); } catch (e) { /* storage full or blocked */ }
    track('transfer_in', { level: pending.level });
    location.reload();
  });

  $('btn-haptics').addEventListener('click', () => {
    save.haptics = save.haptics === false;
    writeSave(save);
    render();
  });

  for (const b of document.querySelectorAll('[data-quality]')) {
    b.addEventListener('click', () => {
      save.quality = b.dataset.quality;
      writeSave(save);
      applyQuality(save.quality);
      render();
    });
  }

  // Required by Apple whenever the app sells anything that lasts.
  $('btn-restore').addEventListener('click', async () => {
    const restored = await payments.restore();
    track('restore', { count: restored.length });
    popup(t(restored.length ? 'set.restored' : 'set.nothing'), restored.length ? 'good' : '');
  });

  $('btn-privacy').addEventListener('click', () => showOnly('screen-privacy'));
  $('btn-privacy-back').addEventListener('click', () => { render(); showOnly('screen-settings'); });
  $('btn-credits').addEventListener('click', () => showOnly('screen-credits'));
  $('btn-credits-back').addEventListener('click', () => { render(); showOnly('screen-settings'); });

  // Ad consent. In the packaged app this is replaced by the ad network's own
  // consent form (Google UMP), which also handles where it is legally required.
  function askConsent(fromSettings) {
    $('btn-consent-later').dataset.back = fromSettings ? '1' : '';
    showOnly('screen-consent');
  }
  const decide = (choice) => {
    save.adConsent = choice;
    writeSave(save);
    track('ad_consent', { choice });
    if ($('btn-consent-later').dataset.back) { render(); showOnly('screen-settings'); } else showOnly(null);
  };
  $('btn-consent').addEventListener('click', () => askConsent(true));
  $('btn-consent-yes').addEventListener('click', () => decide('personalized'));
  $('btn-consent-later').addEventListener('click', () => decide('npa'));

  // Reset asks twice, on the page itself.
  $('btn-reset').addEventListener('click', () => {
    $('btn-reset').hidden = true;
    $('reset-confirm').hidden = false;
  });
  $('btn-reset-no').addEventListener('click', render);
  $('btn-reset-yes').addEventListener('click', () => {
    try {
      for (const k of ['not-a-fake-ad-v1', 'not-a-fake-ad-stats-v1']) localStorage.removeItem(k);
    } catch (e) { /* nothing stored */ }
    location.reload();
  });

  return {
    // First launch: ask about ads once.
    askConsentIfNeeded() {
      if (save.adConsent) return false;
      askConsent(false);
      return true;
    },
    render,
  };
}
