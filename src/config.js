// All tuning in one place.
import { t } from './i18n.js';

export const HALF_W = 3.5; // track half-width
export const SPAWN_DIST = 70; // how far ahead things appear
export const DESPAWN_Z = 8;

export const RUN = {
  speed: 7.5, // forward speed while running
  idleSpeed: 4,
  steer: 10, // track units per full-screen drag
  maxVisible: 160, // soldiers drawn; the counter shows the real number
  slot: 0.24, // formation spacing
};

export const GUN = {
  baseDamage: 1,
  baseRate: 2.5, // shots per soldier per second
  maxEmit: 40, // visible bullets per second (damage per bullet scales so DPS is unchanged)
  bulletSpeed: 36,
  range: 30,
};

export const ENEMY = {
  walk: 1.6, // own walking speed once close
  aggroDist: 26,
};

export const BOSS = {
  walk: 3,
  stopDist: 14, // world stops when the boss is this far ahead
  crushRate: 9, // soldiers lost per second while the boss is on you
  slamRange: 30, // starts throwing rocks once this close
  slamEvery: 3, // seconds between rocks
  slamMin: 1.5,
  slamWarn: 1.1, // seconds the target circle shows before impact
  slamRadius: 1.5,
  slamPower: 0.45, // share of the soldiers inside the circle that are lost
  punchReach: 6.5, // fists reach this far in front of the boss (world boss x1.3)
  punchWidth: 3.4, // width of the smash zone; the track is 7 wide, so you can step aside
  punchWarn: 0.8, // seconds the arms are raised before the smash
  punchEvery: 2.3, // seconds between smashes while you are in reach
  punchPower: 0.5, // share of the soldiers inside the zone that are lost
};

export const COLORS = {
  ally: 0x2f7cf6,
  allyHead: 0xffd6b0,
  enemy: 0xe8453c,
  enemyHead: 0x5a1f1f,
  bullet: 0xffd34d,
  barrel: 0x3c3a48,
  barrelBand: 0xffbe2e,
  boss: 0xb3261e,
  rail: 0xff8a7a,
  decor: [0xffd2c2, 0xc9e4ff, 0xffe9b0, 0xd9d0ff, 0xbdeee6],
  spark: [0xffd34d, 0xff8a3d, 0xffffff],
};

export const UPGRADES = {
  army: {
    get name() { return t('up.army'); },
    max: 25,
    base: 30,
    growth: 1.45,
    describe: (lvl) => (startSoldiers(lvl) > 1 ? t('up.army.desc', { n: startSoldiers(lvl) }) : t('up.army.desc1')),
  },
  dmg: {
    get name() { return t('up.dmg'); },
    max: 25,
    base: 40,
    growth: 1.5,
    describe: (lvl) => t('up.dmg.desc', { n: Math.round(damageMult(lvl) * 100) }),
  },
  rate: {
    get name() { return t('up.rate'); },
    max: 20,
    base: 40,
    growth: 1.5,
    describe: (lvl) => t('up.rate.desc', { n: (GUN.baseRate * rateMult(lvl)).toFixed(1) }),
  },
  income: {
    get name() { return t('up.income'); },
    max: 15,
    base: 60,
    growth: 1.6,
    describe: (lvl) => t('up.income.desc', { n: Math.round(incomeMult(lvl) * 100) }),
  },
};

export const startSoldiers = (lvl) => 1 + lvl * 2;
export const damageMult = (lvl) => 1 + lvl * 0.25;
export const rateMult = (lvl) => 1 + lvl * 0.1;
export const incomeMult = (lvl) => 1 + lvl * 0.15;

export function upgradeCost(key, lvl) {
  const u = UPGRADES[key];
  return Math.round(u.base * Math.pow(u.growth, lvl));
}


// ---------------------------------------------------------------- collection
// Squad looks: cosmetic only.
export const SKINS = [
  { id: 'blue', name: 'Blue Squad', body: 0x2f7cf6, head: 0xffd6b0, gun: 0x2b2140, cost: 0 },
  { id: 'jungle', name: 'Jungle', body: 0x3f8f4a, head: 0xe9c39b, gun: 0x2f2a1e, cost: 250 },
  { id: 'arctic', name: 'Arctic', body: 0xeef3fb, head: 0xffd6b0, gun: 0x5d6b82, cost: 400 },
  { id: 'night', name: 'Night Ops', body: 0x2b2140, head: 0x3c3450, gun: 0x8a78f0, cost: 700 },
  { id: 'candy', name: 'Candy', body: 0xff7ab8, head: 0xfff1f7, gun: 0x7a3a8a, cost: 1000 },
  { id: 'gold', name: 'Gold Plated', body: 0xffbe2e, head: 0xfff2b8, gun: 0x8a5a00, cost: 2500 },
  // Season pass only: not for sale in the shop.
  { id: 'camo', name: 'Camo', body: 0x6b7f3a, head: 0xd9b48f, gun: 0x3a3a22, cost: 0, pass: true },
  { id: 'neon', name: 'Neon', body: 0x19e3c3, head: 0x2b2140, gun: 0xff3df2, cost: 0, pass: true },
  { id: 'royal', name: 'Royal Guard', body: 0xc8102e, head: 0x1b1b2e, gun: 0xffd34d, cost: 0, pass: true },
];

// Weapons change how the squad fights.
export const WEAPONS = [
  { id: 'rifle', name: 'Rifle', desc: 'Reliable all-rounder.', cost: 0, minLevel: 1, rate: 1, dmg: 1, pellets: 1, spread: 0, range: 30, len: 1 },
  { id: 'shotgun', name: 'Shotgun', desc: 'Wide spray. Shreds crowds up close.', cost: 300, minLevel: 4, rate: 0.7, dmg: 1.6, pellets: 4, spread: 0.32, range: 17, len: 0.8 },
  { id: 'sniper', name: 'Sniper', desc: 'Slow, huge damage. Melts bosses.', cost: 700, minLevel: 6, rate: 0.4, dmg: 2.9, pellets: 1, spread: 0, range: 42, len: 2.2 },
  { id: 'minigun', name: 'Minigun', desc: 'Bullet hose. Raises doors fast.', cost: 1500, minLevel: 9, rate: 2.4, dmg: 0.55, pellets: 1, spread: 0.05, range: 26, len: 0.9 },
];
