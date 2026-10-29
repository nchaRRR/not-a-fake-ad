// The only place the game talks to an ad network.
// Today it shows a stand-in "ad" so the reward flow can be played and tuned.
// When packaging with Capacitor, replace the body of showRewarded() with the
// network's rewarded-video call (AdMob, AppLovin MAX...) and resolve with
// whether the player earned the reward. Nothing else in the game changes.

import { t } from './i18n.js';
import { createAdMob } from './admob.js';
import { adPause } from './audio.js';

// AdMob rewarded units (AdMob → Apps → Not a Fake Ad).
const UNITS = { android: 'ca-app-pub-8065721637615283/9714788544', ios: 'ca-app-pub-8065721637615283/6227416788' };
// true: Google's test ads. Keep it on while we test on our own phones (clicking our own real ads
// gets the AdMob account flagged); switch to false for the store release build.
export const ADS_TESTING = true;
const admob = createAdMob(UNITS, { testing: ADS_TESTING, onPlaying: (on) => adPause(on) });
if (admob) admob.init();
export const adPrivacy = admob;

const AD_SECONDS = 4;

// skipAds: when the player bought "no ads", rewards arrive without the video.
export function createAds({ skipAds } = {}) {
  const screen = document.getElementById('screen-ad');
  const count = document.getElementById('ad-count');
  const close = document.getElementById('ad-close');
  const line = document.getElementById('ad-line');
  let busy = false;

  const LINES = ['ad.line1', 'ad.line2', 'ad.line3'];

  async function showRewarded(placement) {
    if (busy) return false;
    if (skipAds && skipAds()) return true;
    if (admob) {
      busy = true;
      const r = await admob.show();
      busy = false;
      if (r.earned) return true;
      if (!r.unavailable) return false; // closed early: no reward
      // No ad to show right now (new app, no fill, offline): the stand-in below keeps the reward reachable.
    }
    busy = true;
    return new Promise((resolve) => {
      let left = AD_SECONDS;
      line.textContent = t(LINES[Math.floor(Math.random() * LINES.length)]);
      count.textContent = t('ad.wait', { n: left });
      close.textContent = t('ad.skip');
      screen.hidden = false;
      screen.dataset.placement = placement;
      const timer = setInterval(() => {
        left -= 1;
        if (left > 0) {
          count.textContent = t('ad.wait', { n: left });
        } else {
          clearInterval(timer);
          count.textContent = t('ad.ready');
          close.textContent = t('ad.collect');
        }
      }, 1000);
      close.onclick = () => {
        clearInterval(timer);
        screen.hidden = true;
        busy = false;
        resolve(left <= 0);
      };
    });
  }

  return { showRewarded };
}
