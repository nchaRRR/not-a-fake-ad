// Builds a level as a list of events placed by distance from the start.
// Seeded, so level N is always the same layout.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function goodArmyGate(rng, L) {
  if (rng() < 0.35) return { op: 'x', val: rng() < 0.8 ? 2 : 3 };
  return { op: '+', val: 4 + Math.floor(rng() * (5 + L * 2)) };
}

function badArmyGate(rng, L) {
  if (rng() < 0.3) return { op: '÷', val: 2 };
  return { op: '+', val: -(3 + Math.floor(rng() * (4 + L * 2))) };
}

const GUN_GOOD = [
  { kind: 'rate', val: 0.25, label: '+25%' },
  { kind: 'rate', val: 0.4, label: '+40%' },
  { kind: 'dmg', val: 0.5, label: '+50%' },
  { kind: 'dmg', val: 1, label: 'x2' },
];
const GUN_BAD = [
  { kind: 'rate', val: -0.3, label: '-30%' },
  { kind: 'dmg', val: -0.3, label: '-30%' },
];

// The level where each obstacle first shows up, guaranteed early in that level.
const FIRST_SEEN = { 3: 'saw', 4: 'gates', 5: 'turret', 6: 'squad', 8: 'squad', 12: 'squad' };

function weighted(rng, items) {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [name, w] of items) {
    r -= w;
    if (r <= 0) return name;
  }
  return items[0][0];
}

// Special levels inside every world of ten: 5 = horde, 7 = gold rush, 10 = world boss.
export function levelKind(L) {
  if (L >= 10 && L % 10 === 0) return 'boss';
  if (L >= 5 && L % 10 === 5) return 'horde';
  if (L >= 7 && L % 10 === 7) return 'gold';
  return 'normal';
}

function bossHpFor(L) {
  return Math.round((200 * Math.pow(L, 1.35) + 120) * (L === 1 ? 1 : L === 2 ? 0.75 : 1.35));
}

function goodPair(rng, L, first) {
  const a = first ? { op: '+', val: 4 + Math.floor(rng() * (4 + L)) } : goodArmyGate(rng, L);
  const b = goodArmyGate(rng, L);
  return rng() < 0.5 ? [a, b] : [b, a];
}

// World boss: a short, generous run, then a giant.
function buildBossLevel(L, rng) {
  const events = [];
  let d = 22;
  for (let i = 0; i < 5; i++) {
    if (i === 2) {
      const a = GUN_GOOD[Math.floor(rng() * GUN_GOOD.length)];
      const b = GUN_GOOD[Math.floor(rng() * GUN_GOOD.length)];
      events.push({ d, type: 'weapon', left: a, right: b });
    } else {
      const [l, r] = goodPair(rng, L, i === 0);
      events.push({ d, type: 'gates', left: l, right: r });
    }
    d += 21;
  }
  events.push({ d: d + 8, type: 'boss', hp: Math.round(bossHpFor(L) * 1.8), big: true });
  return { events, length: d + 8, kind: 'boss' };
}

// Gold rush: no enemies, barrels full of coins, straight into the multiplier tiles.
function buildGoldLevel(L, rng) {
  const events = [];
  let d = 22;
  for (let i = 0; i < 8; i++) {
    if (i % 2 === 0) {
      const [l, r] = goodPair(rng, L, i === 0);
      events.push({ d, type: 'gates', left: l, right: r });
    } else {
      const hp = Math.round((12 + L * 7) * 0.7);
      events.push({ d, type: 'barrels', xs: [-2.3, 0, 2.3], hp, reward: (4 + L * 2) * 3 });
    }
    d += 21;
  }
  events.push({ d: d + 4, type: 'finish' });
  return { events, length: d + 4, kind: 'gold' };
}

export function buildLevel(L) {
  const rng = mulberry32(L * 7919 + 13);
  const kind = levelKind(L);
  if (kind === 'boss') return buildBossLevel(L, rng);
  if (kind === 'gold') return buildGoldLevel(L, rng);
  const events = [];
  const sections = 6 + Math.min(6, Math.floor(L / 2));
  let d = 22;

  for (let i = 0; i < sections; i++) {
    let type;
    if (i === 0 || i === 1) type = 'gates';
    else if (i === sections - 1) type = 'squad';
    else if (i === 2 && FIRST_SEEN[L]) type = FIRST_SEEN[L]; // debut a new obstacle early
    else if (kind === 'horde') type = weighted(rng, [['squad', 45], ['gates', 30], ['weapon', 25]]);
    else if (L < 3) {
      const r = rng();
      type = r < 0.36 ? 'gates' : r < 0.58 ? 'squad' : r < 0.78 ? 'barrels' : 'weapon';
    } else {
      type = weighted(rng, [
        ['gates', 30], ['squad', 22], ['barrels', 13], ['weapon', 12],
        ['saw', 12], ...(L >= 5 ? [['turret', 12]] : []),
      ]);
    }

    // Some door rows become a single sliding door: worth more, but you have to catch it.
    if (type === 'gates' && i > 1 && L >= 4 && (rng() < 0.3 || (L === 4 && i === 2))) {
      const g = goodArmyGate(rng, L);
      if (g.op === '+') g.val = Math.round(g.val * 1.8);
      else g.val += 1;
      events.push({ d, type, moving: true, left: g, right: g, freq: 1 + rng() * 0.5 + L * 0.02 });
      d += 21;
      continue;
    }
    if (type === 'saw') {
      events.push({
        d, type, amp: 1.3 + rng() * 1.2, freq: 1 + rng() * 0.6 + L * 0.03,
        phase: rng() * 6.28, count: L >= 8 && rng() < 0.4 ? 2 : 1,
      });
      d += 21;
      continue;
    }
    if (type === 'turret') {
      const side = rng() < 0.5 ? -1 : 1;
      events.push({ d, type, x: side * (1.3 + rng() * 1.3), hp: 24 + L * 10, reward: 8 + L * 2 });
      d += 23;
      continue;
    }

    if (type === 'gates') {
      // The opening door always adds, so a squad of one can get going.
      const a = i === 0 ? { op: '+', val: 4 + Math.floor(rng() * (4 + L)) } : goodArmyGate(rng, L);
      // Early on both doors are usually good; the choice is "which is better".
      const bothGood = i <= 1 || rng() < (L <= 2 ? 0.6 : 0.42);
      let b = bothGood ? goodArmyGate(rng, L) : badArmyGate(rng, L);
      if (L >= 3 && i > 1 && rng() < 0.2) b = { op: '?', val: 0 };
      const pair = rng() < 0.5 ? [a, b] : [b, a];
      events.push({ d, type, left: pair[0], right: pair[1] });
    } else if (type === 'weapon') {
      const a = GUN_GOOD[Math.floor(rng() * GUN_GOOD.length)];
      const b = rng() < 0.6
        ? GUN_GOOD[Math.floor(rng() * GUN_GOOD.length)]
        : GUN_BAD[Math.floor(rng() * GUN_BAD.length)];
      const pair = rng() < 0.5 ? [a, b] : [b, a];
      events.push({ d, type, left: pair[0], right: pair[1] });
    } else if (type === 'squad') {
      // Squads grow along the level, in step with the army you are expected to have.
      const ramp = 0.45 + 0.75 * (i / (sections - 1));
      const horde = kind === 'horde' ? 1.3 : 1;
      const count = Math.max(3, Math.round((5 + L * 3.3) * ramp * (0.85 + rng() * 0.4) * horde));
      const hp = 1 + Math.floor(L / 4);
      const x = (rng() * 2 - 1) * 1.6;
      // From level 6 some enemies wear helmets: three times the health.
      const armored = L >= 6 ? Math.min(0.5, 0.15 + (L - 6) * 0.06) : 0;
      // Shield bearers from level 8, giants leading the last squads from level 12.
      const shield = L >= 8 ? Math.min(0.35, 0.12 + (L - 8) * 0.03) : 0;
      const giants = L >= 12 && (i >= sections - 3 || (L === 12 && i === 2)) ? (L >= 20 ? 2 : 1) : 0;
      events.push({ d, type, count, hp, x, armored, shield, giants, ramp: ramp * horde });
    } else {
      const n = rng() < 0.5 ? 2 : 3;
      const hp = 12 + L * 7 + Math.floor(rng() * 8);
      const xs = n === 2 ? [-1.75, 1.75] : [-2.3, 0, 2.3];
      events.push({ d, type, xs, hp, reward: 4 + L * 2 });
    }
    d += type === 'squad' ? 25 : 21;
  }

  // Levels 1-2 stay gentle; after that the boss is built to survive long enough to fight back.
  const bossHp = Math.round(bossHpFor(L) * (kind === 'horde' ? 0.6 : 1));
  events.push({ d: d + 8, type: 'boss', hp: bossHp });
  return { events, length: d + 8, kind };
}
