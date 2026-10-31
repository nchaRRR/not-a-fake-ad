// Local progress. Storage can throw in private windows and previews;
// the game keeps running and simply does not remember.
const KEY = 'not-a-fake-ad-v1';

const DEFAULTS = {
  coins: 0,
  level: 1,
  muted: false,
  music: true,
  up: { army: 0, dmg: 0, rate: 0, income: 0 },
  skin: 'blue',
  weapon: 'rifle',
  owned: { skins: ['blue'], weapons: ['rifle'] },
  seen: {},
  stars: {}, // level -> best stars (0-3); levels cleared before stars existed have no entry
};

const fresh = () => JSON.parse(JSON.stringify(DEFAULTS));

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw);
    const base = fresh();
    return {
      ...base,
      ...data,
      up: { ...base.up, ...(data.up || {}) },
      owned: { ...base.owned, ...(data.owned || {}) },
    };
  } catch (e) {
    return fresh();
  }
}

let onWrite = null;
// Lets the account module copy every save to the cloud.
export function watchSave(fn) { onWrite = fn; }

export function writeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    /* progress lasts for this session only */
  }
  if (onWrite) onWrite(state);
}
