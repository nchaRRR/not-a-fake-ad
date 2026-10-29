// Cross-promotion between Nimoriq games: the store page that fits the player's phone.
// APP_STORE_ID: the number in the App Store link (App Store Connect → App Information → Apple ID).
export const GAMES = {
  notafakead: { playId: 'com.nimoriq.notafakead', appStoreId: null },
  tower: { playId: 'com.nimoriq.nfatower', appStoreId: null },
};
const WEB = 'https://nimoriq.com/';

export function storeLink(game) {
  const g = GAMES[game];
  const ua = navigator.userAgent || '';
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (/android/i.test(ua)) return `https://play.google.com/store/apps/details?id=${g.playId}`;
  if (ios && g.appStoreId) return `https://apps.apple.com/app/id${g.appStoreId}`;
  return WEB;
}

export function openLink(url) {
  try { window.open(url, '_blank', 'noopener'); } catch (e) { /* blocked */ }
}
