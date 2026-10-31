// Puzzle rules shared by the game (main.js) and the headless solver (sim.js, tests/puzzle-bot.mjs).
// Pure functions only: no DOM, no Three.js, no randomness. If a rule changes here, the game
// and the solver change together, so the bot test keeps telling the truth about the levels.

export const HALF_W = 3.5;
export const SLOT = 0.24;
export const MAX_UNITS = 160; // soldiers drawn; above this each figure stands for several
export const CROWD_X_MAX = HALF_W - 0.5; // how far the squad's centre can steer

// Squad shapes. Squeeze packs the squad into a narrow column, spread lays it out in a wide line.
export const SHAPES = {
  squeeze: { x: 0.45, z: 1.7 },
  normal: { x: 1, z: 1 },
  spread: { x: 1.75, z: 0.62 },
};
export const SHAPE_ORDER = ['squeeze', 'normal', 'spread'];

// Formation slot i (sunflower pattern), in track units relative to the squad's centre.
export function slot(i, shape = 'normal') {
  const s = SHAPES[shape] || SHAPES.normal;
  const r = SLOT * Math.sqrt(i + 0.5) * 1.15;
  const a = i * 2.39996;
  return [Math.cos(a) * r * s.x, Math.sin(a) * r * 0.85 * s.z];
}

export const clampTrack = (x, m = 0.2) => Math.max(-HALF_W + m, Math.min(HALF_W - m, x));
export const unitsFor = (count) => Math.max(0, Math.min(Math.ceil(count), MAX_UNITS));

// Half-width of the squad for a shape (the outermost soldier, settled).
export function halfWidth(count, shape = 'normal') {
  const n = unitsFor(count);
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(slot(i, shape)[0]));
  return m + 0.12;
}

// Lanes: a wall down the middle of the track splits it in two; once in, you stay in.
export const LANE = { L: [-HALF_W, -0.18], R: [0.18, HALF_W] };
export const laneCentre = (side) => (LANE[side][0] + LANE[side][1]) / 2;
// Safe strip of width w in the middle of a lane (blades line both sides of the lane).
export function laneBlades(side, w) {
  const c = laneCentre(side);
  return [[c - w / 2, c + w / 2]];
}

// ---------------------------------------------------------------- doors
// Applies a door to a count. "Not a fake ad": x2 means exactly twice.
export function applyOp(count, spec) {
  if (!spec) return count;
  if (spec.op === 'x') return count * spec.val;
  if (spec.op === '÷') return Math.ceil(count / spec.val);
  return Math.max(0, count + spec.val);
}

export function opText(spec) {
  if (!spec) return '';
  if (spec.op === 'x') return `x${spec.val}`;
  if (spec.op === '÷') return `÷${spec.val}`;
  if (spec.op === '?') return '?';
  return spec.val >= 0 ? `+${spec.val}` : `${spec.val}`;
}

// ---------------------------------------------------------------- walls, saws, pits, bridges
// A hazard leaves one or more safe intervals [a, b] across the track; soldiers outside them are lost.
const inside = (x, safe) => safe.some(([a, b]) => x >= a && x <= b);

// Soldiers lost when the squad (centre cx, shape) passes a hazard, once the formation has settled.
export function hazardLoss(count, shape, cx, safe) {
  const n = unitsFor(count);
  if (!n) return 0;
  let out = 0;
  for (let i = 0; i < n; i++) {
    const x = clampTrack(cx + slot(i, shape)[0]);
    if (!inside(x, safe)) out++;
  }
  return n === count ? out : Math.round(count * (out / n));
}

// Best centre for a shape: the middle of the safe interval that loses the fewest soldiers.
export function bestCentre(count, shape, safe) {
  let best = { cx: 0, loss: Infinity };
  for (const [a, b] of safe) {
    const mid = Math.max(-CROWD_X_MAX, Math.min(CROWD_X_MAX, (a + b) / 2));
    const loss = hazardLoss(count, shape, mid, safe);
    if (loss < best.loss) best = { cx: mid, loss };
  }
  return best;
}

// Twin switches: both pads (at ±x) must have a soldier on them at the same time.
export function coversBoth(count, shape, padX, padR = 0.45) {
  return halfWidth(count, shape) - 0.12 >= padX - padR;
}

// Weight bridge: in range or it gives way.
export function bridgeHolds(count, b) {
  return count >= (b.min || 0) && count <= (b.max || Infinity);
}

// Target door: exactly N, or a range.
export function targetHit(count, c) {
  return count >= c.min && count <= (c.max ?? Infinity);
}
export function targetText(c) {
  if (c.max === undefined || c.max === null || c.max === Infinity) return `≥${c.min}`;
  if (c.min === c.max) return `=${c.min}`;
  return `${c.min}–${c.max}`;
}

// ---------------------------------------------------------------- fighting
export const BASE_RATE = 2.5; // shots per soldier per second (GUN.baseRate)
export const FIRE_WINDOW = 2.1; // seconds a squad is under fire before it reaches you

// Share of the squad's shots that land inside a strip of half-width hw around its centre.
export function focusShare(count, shape, hw) {
  const n = unitsFor(count);
  if (!n) return 0;
  let k = 0;
  for (let i = 0; i < n; i++) if (Math.abs(slot(i, shape)[0] + 0.12) < hw) k++;
  return k / n;
}

// Enemy squad of fixed size: whoever is not shot down in time takes one soldier each.
export function squadLoss(count, dps, sq) {
  const killed = Math.floor((dps * FIRE_WINDOW * 0.85) / sq.hp);
  return Math.min(count, Math.max(0, sq.n - killed));
}

// ---------------------------------------------------------------- bosses
// Body hits do ARMOR of their damage; shots on an open weak point do WEAK times.
// A shield blocks every hit (body and weak point); only the laser goes straight through it.
// A swarm boss keeps sending adds that soak up shots unless they are blown up in groups.
export const BOSS_RULES = {
  armor: 0.5,
  weak: 2.6,
  weakHalf: 0.75, // half-width of the weak point's hit strip
  bodyHalf: 1.25,
  bigBodyHalf: 2,
  openShare: 0.45, // share of the fight the weak point is open
  shieldBody: 0.25, // body hits through a shield without a laser
  swarmSoak: 1.7, // fight takes this much longer without splash damage
  swarmSoakSplash: 1.45, // ... and with it, on a boss with a weak point (measured in the browser bot runs)
  swarmWave: 8, // soldiers lost per add wave without splash damage
  swarmWaveSplash: 3, // ... and with it (measured in the browser bot runs)
  swarmPace: 1.25, // swarm fights run longer still: shots spent on the adds
  pace: 1.22, // real fights run longer than the damage sums: dodging, lining up, the boss stepping in (measured in the browser bot runs)
};

// Damage multiplier on the boss for a weapon, a squad shape and a boss kind, averaged over the fight.
export function bossMult(count, shape, boss, weapon) {
  const R = BOSS_RULES;
  const bodyShare = focusShare(count, shape, boss.big ? R.bigBodyHalf : R.bodyHalf);
  const weakShare = boss.weak ? focusShare(count, shape, R.weakHalf) : 0;
  const shield = boss.kind === 'shield' ? (weapon.shield ?? R.shieldBody) : 1;
  const body = R.armor;
  const closed = bodyShare * body;
  const open = weakShare * R.weak + Math.max(0, bodyShare - weakShare) * body;
  const m = (boss.weak ? (1 - R.openShare) * closed + R.openShare * open : bodyShare) * shield;
  // Adds crowd in front of an open weak point, so even rockets lose the weak-point bonus there.
  return boss.kind === 'swarm' ? m / (!weapon.splash ? R.swarmSoak : boss.weak ? R.swarmSoakSplash : 1) : m;
}

// Seconds to beat a boss, and soldiers lost to its adds, for a plan's squad at the boss.
export function bossFight(count, shape, boss, weapon, rate, dmg) {
  const dps = count * rate * dmg * bossMult(count, shape, boss, weapon);
  const pace = BOSS_RULES.pace * (boss.kind === 'swarm' ? BOSS_RULES.swarmPace : 1) * (boss.big ? 1.12 : 1);
  const secs = dps > 0 ? (boss.hp / dps) * pace : Infinity;
  const waves = boss.kind === 'swarm' ? Math.max(1, Math.floor(secs / 5)) : (boss.adds ? 2 : 0);
  const per = boss.kind === 'swarm' ? (weapon.splash ? BOSS_RULES.swarmWaveSplash : BOSS_RULES.swarmWave) : (boss.adds ? Math.max(0, boss.adds - Math.floor((count * rate * dmg * 1.4) / Math.max(1, boss.addHp || 4))) : 0);
  return { secs, lost: Math.min(count, waves * per) };
}

// ---------------------------------------------------------------- goals and stars
// Each level has three goals; each goal met (on a cleared level) is one star.
export function goalMet(goal, r) {
  if (!r.won) return false;
  switch (goal.g) {
    case 'win': return true;
    case 'min': return r.final >= goal.n;
    case 'loss': return r.lost <= goal.n;
    case 'targets': return r.targetsMissed === 0 && r.targets > 0;
    case 'hostages': return r.hostagesTotal > 0 && r.hostages >= r.hostagesTotal;
    case 'boss': return r.bossSecs <= goal.s;
    case 'chest': return r.chests > 0;
    case 'time': return r.time <= goal.s;
    default: return false;
  }
}

export function starsFor(goals, r) {
  return goals.map((g) => goalMet(g, r));
}
