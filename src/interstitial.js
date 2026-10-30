// When to show a full-screen ad between levels. Rules (all adjustable from game_config):
// not before level `interstitial_from`, once every `interstitial_every` finished levels, at least
// `interstitial_gap_s` seconds apart, never for players who bought "no ads", never in the web preview.
export function createInterstitials({ admob, remote, skip = () => false, track = () => {} }) {
  let finished = 0;
  let last = Date.now(); // the first one waits a little after launch too
  return {
    async afterLevel(level) {
      finished++;
      if (!admob || skip()) return false;
      const every = remote ? remote.num('interstitial_every', 3, 0, 50) : 3;
      if (!every || level < (remote ? remote.num('interstitial_from', 6, 1, 100000) : 6)) return false;
      if (finished % every) return false;
      if (Date.now() - last < (remote ? remote.num('interstitial_gap_s', 120, 20, 3600) : 120) * 1000) return false;
      const shown = await admob.showInterstitial();
      if (shown) { last = Date.now(); track('ad_interstitial', { level }); }
      return shown;
    },
  };
}
