// Settings the game reads from our Supabase project at launch (table game_config), so difficulty,
// ad frequency or a notice can change without a store update. The last copy is kept on the phone;
// the built-in defaults apply until something arrives (or forever in the web preview).
import { CLOUD_CONFIG } from './cloud.js';

export function createRemote(game, { enabled = true, defaults = {} } = {}) {
  const key = `${game}-rcfg`;
  let data = {};
  try { data = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { data = {}; }
  const listeners = [];

  async function refresh() {
    if (!enabled) return false;
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => ctrl && ctrl.abort(), 6000);
      const r = await fetch(`${CLOUD_CONFIG.url}/rest/v1/game_config?select=data&game=eq.${game}`, {
        headers: { apikey: CLOUD_CONFIG.key, Authorization: `Bearer ${CLOUD_CONFIG.key}` },
        signal: ctrl ? ctrl.signal : undefined,
      });
      clearTimeout(timer);
      if (!r.ok) return false;
      const rows = await r.json();
      const d = rows && rows[0] && rows[0].data;
      if (d && typeof d === 'object' && !Array.isArray(d)) {
        data = d;
        try { localStorage.setItem(key, JSON.stringify(d)); } catch (e) { /* ignore */ }
        for (const f of listeners) try { f(); } catch (e) { /* ignore */ }
        return true;
      }
    } catch (e) { /* offline */ }
    return false;
  }

  const has = (k) => Object.prototype.hasOwnProperty.call(data, k);
  return {
    refresh,
    onChange: (f) => listeners.push(f),
    get: (k, def = defaults[k]) => (has(k) ? data[k] : def),
    // numbers are clamped so a typo in the dashboard can't break the game
    num(k, def = defaults[k], min = -Infinity, max = Infinity) {
      const v = Number(has(k) ? data[k] : def);
      return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
    },
    bool: (k, def = defaults[k]) => (has(k) ? data[k] !== false && data[k] !== 'false' && data[k] !== 0 : def),
  };
}
