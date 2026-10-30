// The first 30 levels, designed by hand. Each one has a clear idea; levels 1-10 teach one idea each,
// 11-30 mix them. Distances are filled in by layout(); the boss always closes the track.
//
// Doors:        add(n) sub(n) mul(n)  with extras {key, lock, hostages, chest}
// Lanes:        lanes(leftItems, rightItems, tag)   a wall down the middle: once in, you stay in
// Hazards:      door(w, x)  edges(w)  pit(a, b)  log(side)  bridge({min, max, w})
// Others:       target(min, max)  sw(reward)  squad(n, hp)  shop([...offers])  cage(n)  keyAt(x)
// Goals:        win  min(n)  loss(n)  targets  hostages  boss(s)  chest  time(s)

export const add = (val, x = {}) => ({ op: '+', val, ...x });
export const sub = (val, x = {}) => ({ op: '+', val: -val, ...x });
export const mul = (val, x = {}) => ({ op: 'x', val, ...x });
const gates = (left, right) => ({ type: 'gates', left, right });
// A lane item list: doors (specs), hazards ({wall}), {slow: s}, {hostages: n}, {key: true}
const lanes = (left, right, tags = null) => ({ type: 'fork', left: { tag: tags && tags[0], items: left }, right: { tag: tags && tags[1], items: right } });
const door = (w, x = 0) => ({ type: 'wall', kind: 'door', safe: [[x - w / 2, x + w / 2]] });
const edges = (w) => ({ type: 'wall', kind: 'saws', safe: [[-w / 2, w / 2]] });
const pit = (a, b) => ({ type: 'wall', kind: 'pit', safe: [[-3.5, a], [b, 3.5]] });
const log = (side) => ({ type: 'wall', kind: 'log', safe: side < 0 ? [[0.35, 3.5]] : [[-3.5, -0.35]] });
const bridge = ({ min = 0, max = null, w = 2.6, x = 0 }) => ({ type: 'bridge', min, max, safe: [[x - w / 2, x + w / 2]] });
const target = (min, max = min, hard = false) => ({ type: 'check', min, max, hard });
const atLeast = (min, hard = false) => ({ type: 'check', min, max: null, hard });
const sw = (reward, pad = 2.5) => ({ type: 'switch', pad, reward });
const squad = (n, hp = 2) => ({ type: 'squad', n, hp });
const shop = (offers) => ({ type: 'shop', offers });
// Lane hazards: blades along both sides of a lane, leaving a strip of width w.
const blades = (w) => ({ wall: 'saws', w });
const mud = (s) => ({ slow: s });

const G = {
  win: { g: 'win' },
  min: (n) => ({ g: 'min', n }),
  loss: (n) => ({ g: 'loss', n }),
  targets: { g: 'targets' },
  hostages: { g: 'hostages' },
  boss: (s) => ({ g: 'boss', s }),
  chest: { g: 'chest' },
  time: (s) => ({ g: 'time', s }),
};

// boss kinds: brute (plain), shield (only lasers hurt the body), swarm (keeps sending adds: rockets)
const brute = (hp, x = {}) => ({ kind: 'brute', hp, ...x });
const shielded = (hp, x = {}) => ({ kind: 'shield', hp, weak: true, ...x });
const swarm = (hp, x = {}) => ({ kind: 'swarm', hp, weak: true, ...x });

export const LEVELS = [
  // ---------------------------------------------------------------- world 1: teach one idea each
  { // 1. Doors: pick the better one.
    idea: 'doors', start: 1,
    track: [gates(add(5), add(2)), gates(mul(2), add(3)), squad(5, 1), gates(add(6), mul(2))],
    boss: brute(260), goals: [G.win, G.min(20), G.loss(3)],
  },
  { // 2. Shape: squeeze through a narrow door.
    idea: 'shape', start: 10,
    track: [gates(add(10), add(4)), door(1.5), gates(mul(2), add(8)), edges(2.4), gates(add(6), add(3))],
    boss: brute(420), goals: [G.win, G.loss(2), G.min(40)],
  },
  { // 3. Order: +10 then x2 beats x2 then +10.
    idea: 'order', start: 12,
    track: [lanes([mul(2), add(10)], [add(10), mul(2)]), gates(add(6), add(3)), lanes([add(5), mul(2)], [mul(2), add(5)])],
    boss: brute(700), goals: [G.win, G.min(100), G.loss(4)],
  },
  { // 4. Exact target: arrive with exactly 20.
    idea: 'target', start: 6,
    track: [gates(add(4), mul(2)), gates(add(8), mul(2)), target(20), gates(mul(2), add(10)), squad(8, 2)],
    boss: brute(650), goals: [G.targets, G.win, G.min(36)],
  },
  { // 5. Key: the small door on the side carries the key for the big locked one.
    idea: 'key', start: 8,
    track: [gates(add(6), add(2, { key: true })), gates(add(10), mul(3, { lock: true })), gates(mul(2), add(5)), squad(10, 2)],
    boss: brute(900), goals: [G.win, G.min(55), G.loss(4)],
  },
  { // 6. Fork: a short risky lane or a long safe one.
    idea: 'fork', start: 16,
    track: [gates(add(4), add(2)), lanes([blades(1.4), mul(2)], [mud(5), add(10)], ['risky', 'safe']), gates(add(8), add(4)), squad(10, 2)],
    boss: brute(1000), goals: [G.win, G.loss(3), G.time(40)],
  },
  { // 7. Hostages: rescue them on the side paths, they join you.
    idea: 'hostage', start: 10,
    track: [gates(add(8), add(2, { hostages: 4 })), gates(mul(2), add(4)), gates(add(10), add(3, { hostages: 6 })), squad(10, 2)],
    boss: brute(1000), goals: [G.hostages, G.win, G.min(40)],
  },
  { // 8. Shop: trade soldiers for firepower. The boss wears a shield: only a laser cuts through.
    idea: 'shop', start: 18,
    track: [gates(add(10), add(5)), gates(mul(2), add(12)), shop([{ id: 'laser', cost: 10 }, { id: 'rate', val: 0.4, cost: 8 }]), squad(10, 2)],
    boss: shielded(2600, { weak: false }), goals: [G.win, G.boss(29), G.min(40)],
  },
  { // 9. Bridge: it needs at least 30 on it, and it is narrow.
    idea: 'bridge', start: 8,
    track: [gates(add(6), mul(2)), gates(add(8), add(16)), bridge({ min: 30, w: 2.6 }), gates(mul(2), add(10)), bridge({ min: 40, max: 60, w: 3 }), gates(mul(2), add(10))],
    boss: brute(1500), goals: [G.win, G.loss(2), G.min(70)],
  },
  { // 10. World boss with a weak point: line up, squeeze, fire when it opens.
    idea: 'weak', start: 20, kind: 'boss',
    track: [gates(add(10), add(5)), gates(mul(2), add(15)), gates(add(10), mul(2)), squad(14, 2)],
    boss: brute(5200, { big: true, weak: true, adds: 10, addHp: 4 }), goals: [G.win, G.boss(28), G.loss(8)],
  },

  // ---------------------------------------------------------------- world 2: mix two ideas
  { // 11. Order + target
    idea: 'mix', start: 10,
    track: [lanes([mul(2), add(6)], [add(6), mul(2)]), target(32), gates(add(10), mul(2)), door(1.6), gates(mul(2), add(20))],
    boss: brute(2000), goals: [G.targets, G.win, G.min(100)],
  },
  { // 12. Key behind a squeeze
    idea: 'mix', start: 12,
    track: [gates(add(12), add(3, { key: true })), edges(1.6), gates(add(14), mul(3, { lock: true })), gates(mul(2), add(10)), squad(14, 2)],
    boss: brute(2200), goals: [G.win, G.min(80), G.loss(4)],
  },
  { // 13. Bridge with a cap: too many breaks it
    idea: 'mix', start: 10,
    track: [gates(mul(2), add(6)), gates(mul(2), add(14)), bridge({ min: 30, max: 36, w: 2.8 }), gates(mul(2), add(20)), squad(14, 2)],
    boss: brute(2200), goals: [G.win, G.loss(3), G.min(66)],
  },
  { // 14. Hostages behind blades
    idea: 'mix', start: 14,
    track: [lanes([blades(1.3), { hostages: 8 }, add(4)], [add(10), add(4)], ['risky', 'safe']), gates(mul(2), add(12)), gates(add(4, { hostages: 5 }), add(12)), squad(16, 2)],
    boss: brute(2600), goals: [G.hostages, G.win, G.loss(4)],
  },
  { // 15. Shop: swap soldiers for a rocket against a swarm of adds
    idea: 'mix', start: 20,
    track: [gates(mul(2), add(12)), gates(add(10), add(4)), shop([{ id: 'rocket', cost: 12 }, { id: 'dmg', val: 0.5, cost: 10 }]), gates(mul(2), add(15))],
    boss: swarm(3400, { weak: false }), goals: [G.win, G.boss(34), G.min(55)],
  },
  { // 16. Spread: press both switches to open the x3
    idea: 'mix', start: 14,
    track: [gates(add(10), add(4)), sw(mul(3)), gates(add(8), add(3)), door(2.4), squad(16, 2)],
    boss: brute(2600), goals: [G.win, G.min(70), G.loss(3)],
  },
  { // 17. Exact range with a chest
    idea: 'mix', start: 9,
    track: [gates(add(5, { key: true }), mul(2)), gates(mul(2), add(9)), target(28, 30), gates(add(10), add(0, { lock: true, chest: { coins: 60, n: 20 } })), squad(14, 2)],
    boss: brute(2400), goals: [G.targets, G.chest, G.min(40)],
  },
  { // 18. Fork with a log on the safe side
    idea: 'mix', start: 20,
    track: [lanes([blades(1.3), mul(2), add(6)], [mud(4), add(12), add(4)], ['risky', 'safe']), log(1), gates(mul(2), add(25)), squad(18, 3)],
    boss: brute(3200), goals: [G.win, G.time(44), G.loss(4)],
  },
  { // 19. Pit in the middle, then a target
    idea: 'mix', start: 16,
    track: [gates(mul(2), add(18)), pit(-1.35, 1.35), gates(add(8), add(4)), target(36), gates(mul(2), add(20)), squad(18, 3)],
    boss: brute(3200), goals: [G.targets, G.win, G.loss(3)],
  },
  { // 20. World boss: a shielded giant. Buy the laser.
    idea: 'mix', start: 24, kind: 'boss',
    track: [gates(add(16), mul(2)), gates(mul(2), add(20)), shop([{ id: 'laser', cost: 14 }, { id: 'rate', val: 0.4, cost: 10 }]), squad(18, 3)],
    boss: shielded(6400, { big: true, adds: 12, addHp: 6 }), goals: [G.win, G.boss(44), G.min(55)],
  },

  // ---------------------------------------------------------------- world 3: mix three ideas
  { // 21. Lanes + key + target
    idea: 'mix', start: 10,
    track: [lanes([add(4, { key: true }), mul(2)], [add(10), add(4)]), gates(add(10), mul(2, { lock: true })), target(56, 60), door(2), squad(18, 3)],
    boss: brute(3400), goals: [G.targets, G.win, G.loss(3)],
  },
  { // 22. Bridge window + hostages
    idea: 'mix', start: 12,
    track: [gates(mul(2), add(6, { hostages: 6 })), gates(mul(2), add(12)), bridge({ min: 36, max: 46, w: 2.8 }), gates(add(4, { hostages: 6 }), mul(2)), squad(18, 3)],
    boss: brute(3000), goals: [G.hostages, G.win, G.min(40)],
  },
  { // 23. Shop vs the bridge: sell soldiers to fit under the cap
    idea: 'mix', start: 20,
    track: [gates(mul(2), add(10)), gates(mul(2), add(10)), shop([{ id: 'rate', val: 0.5, cost: 14 }, { id: 'laser', cost: 20 }]), bridge({ min: 50, max: 64, w: 3 }), gates(mul(2), add(20))],
    boss: shielded(5200), goals: [G.win, G.boss(30), G.min(100)],
  },
  { // 24. Switches + narrow door + log
    idea: 'mix', start: 16,
    track: [gates(add(8), add(4)), sw(mul(2)), log(-1), gates(mul(2), add(20)), door(2), squad(20, 3)],
    boss: brute(3400, { weak: true }), goals: [G.win, G.loss(4), G.boss(32)],
  },
  { // 25. Two targets in a row
    idea: 'mix', start: 7,
    track: [gates(add(3), mul(2)), gates(mul(2), add(7)), target(21), gates(add(12), mul(2)), gates(add(10), mul(2)), target(60, 70), squad(20, 3)],
    boss: brute(4200, { weak: true }), goals: [G.targets, G.win, G.loss(6)],
  },
  { // 26. Fork: the risky lane has hostages and a key
    idea: 'mix', start: 18,
    track: [lanes([blades(1.3), { hostages: 10 }, { key: true }], [add(14), add(4)], ['risky', 'safe']), gates(add(20), mul(3, { lock: true })), pit(-1, 1), squad(22, 3)],
    boss: brute(4400, { weak: true }), goals: [G.hostages, G.win, G.min(80)],
  },
  { // 27. Order on lanes, then a bridge cap
    idea: 'mix', start: 14,
    track: [lanes([mul(2), add(12)], [add(12), mul(2)]), lanes([add(8), mul(2)], [mul(2), add(8)]), bridge({ min: 100, max: 120, w: 3.8 }), gates(add(10), add(20)), squad(22, 3)],
    boss: brute(5600, { weak: true }), goals: [G.win, G.min(120), G.loss(4)],
  },
  { // 28. Chest behind switches and a target
    idea: 'mix', start: 12,
    track: [gates(add(6, { key: true }), add(12)), sw(mul(2), 2.2), target(36), gates(add(15), add(0, { lock: true, chest: { coins: 90, n: 30 } })), edges(1.8), squad(22, 3)],
    boss: brute(4600, { weak: true }), goals: [G.targets, G.chest, G.loss(4)],
  },
  { // 29. Everything: lanes, shop, bridge, hostages
    idea: 'mix', start: 16,
    track: [lanes([add(4, { hostages: 6 }), mul(2)], [mul(2), add(4)]), shop([{ id: 'rate', val: 0.5, cost: 10 }, { id: 'rocket', cost: 14 }]), bridge({ min: 30, max: 44, w: 2.8 }), gates(mul(2), add(4, { hostages: 6 })), squad(24, 3)],
    boss: swarm(3600), goals: [G.hostages, G.win, G.boss(36)],
  },
  { // 30. World boss: a swarm queen. Rockets clear the adds.
    idea: 'mix', start: 20, kind: 'boss',
    track: [gates(mul(2), add(20)), lanes([add(10), mul(2)], [mul(2), add(10)]), shop([{ id: 'rocket', cost: 16 }, { id: 'rate', val: 0.5, cost: 14 }]), door(2.2), squad(24, 3)],
    boss: swarm(6000, { big: true }), goals: [G.win, G.boss(46), G.min(60)],
  },
];

// Spacing by event type, in track units.
const GAP = { gates: 20, check: 17, wall: 17, bridge: 24, switch: 20, squad: 25, shop: 20 };
export const LANE_STEP = 14; // distance between items inside a lane
export const BRIDGE_LEN = 9;
export const WALL_LEN = { door: 0.6, saws: 6, pit: 6, log: 1.2 };

// Gives every event a distance from the start; returns { events, length }.
export function layout(track, bossEv) {
  const events = [];
  let d = 22;
  for (const ev0 of track) {
    const ev = { ...ev0, d };
    if (ev.type === 'fork') {
      const n = Math.max(ev.left.items.length, ev.right.items.length);
      ev.len = 8 + n * LANE_STEP;
      events.push(ev);
      d += ev.len + 12;
      continue;
    }
    if (ev.type === 'wall') ev.len = WALL_LEN[ev.kind];
    if (ev.type === 'bridge') ev.len = BRIDGE_LEN;
    events.push(ev);
    d += GAP[ev.type] || 20;
  }
  events.push({ ...bossEv, type: 'boss', d: d + 10 });
  return { events, length: d + 10 };
}

// Scales a level's soldier numbers by an integer factor (used for the levels after 30):
// every addition, target and bridge limit grows with the start, so the arithmetic stays exact.
export function scaleLevel(lv, k) {
  if (k === 1) return lv;
  const s = (spec) => {
    if (!spec || typeof spec !== 'object') return spec;
    const o = { ...spec };
    if (o.op === '+') o.val *= k;
    if (o.hostages) o.hostages *= k;
    if (o.chest) o.chest = { ...o.chest, n: o.chest.n * k };
    return o;
  };
  const item = (it) => (it && it.op ? s(it) : it && it.hostages ? { ...it, hostages: it.hostages * k } : it);
  const track = lv.track.map((ev) => {
    if (ev.type === 'gates') return { ...ev, left: s(ev.left), right: s(ev.right) };
    if (ev.type === 'fork') return { ...ev, left: { ...ev.left, items: ev.left.items.map(item) }, right: { ...ev.right, items: ev.right.items.map(item) } };
    if (ev.type === 'check') return { ...ev, min: ev.min * k, max: ev.max === null ? null : ev.max * k };
    if (ev.type === 'bridge') return { ...ev, min: ev.min * k, max: ev.max === null ? null : ev.max * k };
    if (ev.type === 'switch') return { ...ev, reward: s(ev.reward) };
    if (ev.type === 'squad') return { ...ev, n: ev.n * k };
    if (ev.type === 'shop') return { ...ev, offers: ev.offers.map((o) => ({ ...o, cost: o.cost * k })) };
    return ev;
  });
  const goals = lv.goals.map((g) => (g.g === 'min' || g.g === 'loss' ? { ...g, n: g.n * k } : g));
  return { ...lv, start: lv.start * k, track, goals, boss: { ...lv.boss, hp: lv.boss.hp * k } };
}

export const HAND_LEVELS = LEVELS.length;
