// The only place the game asks for real money.
// Today a stand-in sheet confirms the purchase so the flow can be tested; nothing
// is charged. When packaging, replace buy() with the store purchase call
// (Google Play Billing / StoreKit, e.g. through RevenueCat) and resolve with
// whether the purchase went through.
import { t } from './i18n.js';

// Prices are placeholders; the stores set the real local prices.
export const PRODUCTS = {
  premium_pass: { price: '$4.99', kind: 'season' },
  no_ads: { price: '$2.99', kind: 'forever' },
  starter_pack: { price: '$1.99', kind: 'forever', coins: 2000, skin: 'night' },
  coins_s: { price: '$0.99', kind: 'consumable', coins: 1000 },
  coins_m: { price: '$4.99', kind: 'consumable', coins: 6000 },
  coins_l: { price: '$9.99', kind: 'consumable', coins: 15000 },
};

export function createPayments() {
  const screen = document.getElementById('screen-pay');
  const ok = document.getElementById('pay-confirm');
  const cancel = document.getElementById('pay-cancel');
  const price = document.getElementById('pay-price');

  function buy(productId) {
    return new Promise((resolve) => {
      price.textContent = PRODUCTS[productId]?.price || '';
      document.getElementById('pay-title').textContent = t(`iap.${productId}`);
      ok.textContent = t('pay.confirm');
      screen.hidden = false;
      const done = (result) => {
        screen.hidden = true;
        ok.onclick = cancel.onclick = null;
        resolve(result);
      };
      ok.onclick = () => done(true);
      cancel.onclick = () => done(false);
    });
  }

  // Gives back anything that was bought once and lasts (e.g. "remove ads").
  // The stand-in reads what this device remembers; the store does the real check.
  function restore() {
    return Promise.resolve(Array.isArray(ctxSave?.iap) ? ctxSave.iap.slice() : []);
  }

  let ctxSave = null;
  return { buy, restore, attachSave: (s) => { ctxSave = s; } };
}
