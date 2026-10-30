// Builds a level as a list of events placed by distance from the start.
// Levels 1-30 are hand-designed (levels.js). After that the designs of 11-30 come round again
// with stronger enemies, and their soldier numbers scaled up so every puzzle still adds up.
// Boss Week stays a seeded generator: a short run full of good doors, then a mega boss.
import { LEVELS, layout, scaleLevel, LANE_STEP } from './levels.js';
import { laneBlades, laneCentre, LANE } from './rules.js';

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

const GUN_GOOD = [
  { kind: 'rate', val: 0.25, label: '+25%' },
  { kind: 'rate', val: 0.4, label: '+40%' },
  { kind: 'dmg', val: 0.5, label: '+50%' },
  { kind: 'dmg', val: 1, label: 'x2' },
];

function goodArmyGate(rng, L) {
  if (rng() < 0.35) return { op: 'x', val: rng() < 0.8 ? 2 : 3 };
  return { op: '+', val: 4 + Math.floor(rng() * (5 + L * 2)) };
}

function goodPair(rng, L, first) {
  const a = first ? { op: '+', val: 4 + Math.floor(rng() * (4 + L)) } : goodArmyGate(rng, L);
  const b = goodArmyGate(rng, L);
  return rng() < 0.5 ? [a, b] : [b, a];
}

function bossHpFor(L) {
  return Math.round((200 * Math.pow(L, 1.35) + 120) * (L === 1 ? 1 : L === 2 ? 0.75 : 1.35));
}

// ---------------------------------------------------------------- hand-designed levels
// The design a level number plays: 1-30 as written, then 11-30 again (40, 50... stay world bosses).
export function levelDef(L) {
  if (L <= LEVELS.length) return LEVELS[L - 1];
  const idx = 10 + ((L - LEVELS.length - 1) % 20);
  const k = 1 + Math.floor((L - LEVELS.length - 1) / 40);
  const base = scaleLevel(LEVELS[idx], k);
  const tough = 1 + (L - LEVELS.length) * 0.035;
  return {
    ...base,
    replayOf: idx + 1,
    track: base.track.map((ev) => (ev.type === 'squad' ? { ...ev, hp: Math.round(ev.hp * tough) } : ev)),
    boss: { ...base.boss, hp: Math.round(base.boss.hp * tough) },
  };
}

export function levelKind(L) {
  return levelDef(L).kind || 'normal';
}

// Turns a lane split into the wall plus the things in each lane, as ordinary events.
function expandFork(ev) {
  const out = [{ type: 'fork', d: ev.d, len: ev.len, tags: [ev.left.tag, ev.right.tag] }];
  const n = Math.max(ev.left.items.length, ev.right.items.length);
  for (let k = 0; k < n; k++) {
    const d = ev.d + 8 + k * LANE_STEP;
    const li = ev.left.items[k];
    const ri = ev.right.items[k];
    const isDoor = (it) => it && it.op !== undefined;
    if (isDoor(li) || isDoor(ri)) out.push({ type: 'gates', d, left: isDoor(li) ? li : null, right: isDoor(ri) ? ri : null, lane: true });
    for (const [side, it] of [['L', li], ['R', ri]]) {
      if (!it || isDoor(it)) continue;
      const other = side === 'L' ? LANE.R : LANE.L;
      if (it.wall) out.push({ type: 'wall', kind: 'saws', d, len: 6, safe: [...laneBlades(side, it.w), other], lane: side });
      else if (it.slow) out.push({ type: 'mud', d: d - 2, side, secs: it.slow, len: Math.min(ev.len - (d - ev.d) - 2, 30) });
      else if (it.hostages) out.push({ type: 'cage', d, x: laneCentre(side), n: it.hostages });
      else if (it.key) out.push({ type: 'key', d, x: laneCentre(side) });
    }
  }
  return out;
}

export function buildLevel(L) {
  const def = levelDef(L);
  const { events, length } = layout(def.track, { ...def.boss, hand: true, big: !!def.boss.big });
  const flat = [];
  for (const ev of events) {
    if (ev.type === 'fork') flat.push(...expandFork(ev));
    else if (ev.type === 'squad') flat.push({ ...ev, count: ev.n, fixed: true, x: 0 });
    else flat.push(ev);
  }
  flat.sort((a, b) => a.d - b.d);
  return { events: flat, length, kind: def.kind || 'normal', goals: def.goals, start: def.start, idea: def.idea, hand: true };
}

// Boss Week: a short run full of good doors, then a mega boss scaled to the player's level.
export function buildBossWeekLevel(L) {
  const rng = mulberry32(L * 6151 + 77);
  const events = [];
  let d = 22;
  for (let i = 0; i < 6; i++) {
    if (i === 2 || i === 4) {
      const a = GUN_GOOD[Math.floor(rng() * GUN_GOOD.length)];
      const b = GUN_GOOD[Math.floor(rng() * GUN_GOOD.length)];
      events.push({ d, type: 'weapon', left: a, right: b });
    } else {
      const [l, r] = goodPair(rng, L, i === 0);
      events.push({ d, type: 'gates', left: l, right: r });
    }
    d += 21;
  }
  // The mega boss has a weak point too; its health is scaled down by the average armor, so it lasts as long as before.
  events.push({ d: d + 8, type: 'boss', hp: Math.round(bossHpFor(L) * 2.4 * 0.8), big: true, week: true, weak: true, kind: 'brute' });
  return { events, length: d + 8, kind: 'bossweek', goals: [{ g: 'win' }, { g: 'boss', s: 45 }, { g: 'boss', s: 30 }] };
}
