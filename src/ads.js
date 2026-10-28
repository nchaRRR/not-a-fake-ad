// The only place the game talks to an ad network.
// Today it shows a stand-in "ad" so the reward flow can be played and tuned.
// When packaging with Capacitor, replace the body of showRewarded() with the
// network's rewarded-video call (AdMob, AppLovin MAX...) and resolve with
// whether the player earned the reward. Nothing else in the game changes.

import { t } from './i18n.js';

const AD_SECONDS = 4;

// skipAds: when the player bought "no ads", rewards arrive without the video.
export function createAds({ skipAds } = {}) {
  const screen = document.getElementById('screen-ad');
  const count = document.getElementById('ad-count');
  const close = document.getElementById('ad-close');
  const line = document.getElementById('ad-line');
  let busy = false;

  const LINES = ['ad.line1', 'ad.line2', 'ad.line3'];

  function showRewarded(placement) {
    if (busy) return Promise.resolve(false);
    if (skipAds && skipAds()) return Promise.resolve(true);
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
