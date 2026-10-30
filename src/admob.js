// Google AdMob rewarded ads in the phone app (@capacitor-community/admob, plugin name "AdMob").
// Flow: initialize → Google's consent form where the law asks for it (UMP, EU/UK) → preload a
// rewarded ad → show it when the player asks. iOS tracking permission (ATT) is not requested:
// without it Google serves non-personalised ads, which is fine for rewarded video.
// In a browser this returns null and ads.js keeps its stand-in.
import { nativeCall as call, nativeListen as listen, isNative, nativePlatform } from './cloud.js';

const EVENTS = { reward: 'onRewardedVideoAdReward', dismissed: 'onRewardedVideoAdDismissed', failed: 'onRewardedVideoAdFailedToShow' };

// units: { android: 'ca-app-pub-…/…', ios: 'ca-app-pub-…/…' }; testing: true serves Google's test ads
export function createAdMob(units, { testing = false, onPlaying = () => {}, interstitial = null } = {}) {
  if (!isNative()) return null;
  const unit = () => (nativePlatform() === 'ios' ? units.ios : units.android);
  let ready = false;
  let canRequest = true;
  let privacyRequired = false;
  let loaded = false;
  let loading = null;
  let iLoaded = false;
  let iLoading = null;
  const iUnit = () => (interstitial ? (nativePlatform() === 'ios' ? interstitial.ios : interstitial.android) : null);

  function preloadInterstitial() {
    if (!ready || !canRequest || !iUnit() || iLoaded) return Promise.resolve();
    if (iLoading) return iLoading;
    iLoading = call('AdMob', 'prepareInterstitial', { adId: iUnit(), isTesting: testing })
      .then(() => { iLoaded = true; })
      .catch((e) => console.warn('[ads] interstitial not loaded', e))
      .finally(() => { iLoading = null; });
    return iLoading;
  }

  // Resolves true if an interstitial was shown (and closed).
  async function showInterstitial() {
    if (!ready || !canRequest || !iUnit()) return false;
    if (!iLoaded) { void preloadInterstitial(); return false; } // not ready: skip this time, never make the player wait
    iLoaded = false;
    onPlaying(true);
    const offs = [];
    const shown = await new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (!done) { done = true; resolve(r); } };
      offs.push(listen('AdMob', 'interstitialAdDismissed', () => setTimeout(() => finish(true), 300)));
      offs.push(listen('AdMob', 'interstitialAdFailedToShow', () => finish(false)));
      setTimeout(() => finish(false), 90 * 1000);
      call('AdMob', 'showInterstitial').catch(() => finish(false));
    });
    offs.forEach((off) => off());
    onPlaying(false);
    void preloadInterstitial();
    return shown;
  }

  async function init() {
    try {
      await call('AdMob', 'initialize', { initializeForTesting: testing });
      let consent = await call('AdMob', 'requestConsentInfo', {}).catch(() => ({ canRequestAds: true }));
      if (consent.isConsentFormAvailable && consent.status === 'REQUIRED') {
        consent = await call('AdMob', 'showConsentForm').catch(() => consent);
      }
      canRequest = consent.canRequestAds !== false;
      privacyRequired = consent.privacyOptionsRequirementStatus === 'REQUIRED';
      ready = true;
      // let the game settle before the ad SDK starts downloading
      setTimeout(() => { void preload(); void preloadInterstitial(); }, 8000);
    } catch (e) {
      console.warn('[ads] AdMob could not start', e);
    }
  }

  function preload() {
    if (!ready || !canRequest || loaded) return Promise.resolve();
    if (loading) return loading;
    loading = call('AdMob', 'prepareRewardVideoAd', { adId: unit(), isTesting: testing })
      .then(() => { loaded = true; })
      .catch((e) => console.warn('[ads] rewarded ad not loaded', e))
      .finally(() => { loading = null; });
    return loading;
  }

  // Resolves { earned, unavailable }.
  async function show() {
    if (!ready || !canRequest) return { earned: false, unavailable: true };
    if (!loaded) await preload();
    if (!loaded) return { earned: false, unavailable: true };
    loaded = false;
    onPlaying(true);
    let earned = false;
    const offs = [];
    const result = await new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (!done) { done = true; resolve(r); } };
      offs.push(listen('AdMob', EVENTS.reward, () => { earned = true; }));
      offs.push(listen('AdMob', EVENTS.dismissed, () => setTimeout(() => finish({ earned, unavailable: false }), 400)));
      offs.push(listen('AdMob', EVENTS.failed, () => finish({ earned: false, unavailable: true })));
      setTimeout(() => finish({ earned, unavailable: !earned }), 5 * 60 * 1000);
      call('AdMob', 'showRewardVideoAd').then(() => { earned = true; }).catch(() => finish({ earned: false, unavailable: true }));
    });
    offs.forEach((off) => off());
    onPlaying(false);
    void preload();
    return result;
  }

  return {
    init,
    show,
    showInterstitial,
    get privacyRequired() { return privacyRequired; },
    showPrivacyOptions: () => call('AdMob', 'showPrivacyOptionsForm').catch(() => {}),
  };
}
