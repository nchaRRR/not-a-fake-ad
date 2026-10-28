// One door for every analytics event.
// Today events are summarized on the device, so a playtest can be read from the
// hidden stats screen (tap the logo five times). When packaging, add a provider
// that forwards to Firebase Analytics (or similar) in addProvider(); the game's
// calls to track() stay the same.

const KEY = 'not-a-fake-ad-stats-v1';
const providers = [];

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { levels: {}, purchases: {}, ads: {}, sessions: 0 };
  } catch (e) {
    return { levels: {}, purchases: {}, ads: {}, sessions: 0 };
  }
}

let stats = load();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch (e) { /* not saved */ }
}

function levelRow(level) {
  if (!stats.levels[level]) stats.levels[level] = { starts: 0, wins: 0, fails: 0, reasons: {}, bestMult: 0, secs: 0 };
  return stats.levels[level];
}

// Built-in provider: rolls events up into per-level numbers on the device.
function summarize(name, p) {
  if (name === 'session_start') stats.sessions += 1;
  if (name === 'level_start') levelRow(p.level).starts += 1;
  if (name === 'level_complete') {
    const r = levelRow(p.level);
    r.wins += 1;
    r.bestMult = Math.max(r.bestMult, p.mult || 1);
    r.secs += p.seconds || 0;
  }
  if (name === 'level_fail') {
    const r = levelRow(p.level);
    r.fails += 1;
    r.reasons[p.reason] = (r.reasons[p.reason] || 0) + 1;
    r.secs += p.seconds || 0;
  }
  if (name === 'purchase') stats.purchases[`${p.kind}:${p.id}`] = (stats.purchases[`${p.kind}:${p.id}`] || 0) + 1;
  if (name === 'ad_reward') {
    const k = `${p.placement}:${p.granted ? 'watched' : 'skipped'}`;
    stats.ads[k] = (stats.ads[k] || 0) + 1;
  }
  persist();
}

export function addProvider(fn) {
  providers.push(fn);
}

export function track(name, params = {}) {
  try {
    summarize(name, params);
  } catch (e) { /* never let analytics break the game */ }
  for (const fn of providers) {
    try { fn(name, params); } catch (e) { /* ignore a failing provider */ }
  }
}

export function getStats() {
  return stats;
}

export function resetStats() {
  stats = { levels: {}, purchases: {}, ads: {}, sessions: 0 };
  persist();
}
