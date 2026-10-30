// Headless model of a hand-designed level: the counting layer of the game (doors, lanes, targets,
// keys, hazards, bridges, switches, shop, hostages, squads, boss), driven by a plan of choices.
// solve() searches every route for the best stars; naive() takes the bigger-looking door every time.
// Uses the same rules as the game (rules.js); fights are estimated with the formulas in rules.js.
import {
  applyOp, hazardLoss, bestCentre, coversBoth, bridgeHolds, targetHit, squadLoss, bossFight,
  starsFor, SHAPE_ORDER, BASE_RATE, laneBlades,
} from './rules.js';
import { layout } from './levels.js';

const RUN_SPEED = 7.5;
const DEFAULT_LIMIT = 55; // seconds before a boss loses patience and crushes the squad

// edge: how much stronger upgrades make the squad than the enemies (the game grows fixed enemies
// with the square root of the upgrade bonus, so damage x4 from upgrades is an edge of 2).
function fresh(level, weapons, edge = 1) {
  return {
    count: level.start, keys: 0, hostages: 0, hostagesTotal: 0, lost: 0, targets: 0, targetsMissed: 0,
    chests: 0, time: 0, weapon: weapons.rifle, rate: BASE_RATE, dmg: edge, won: false, dead: null, choices: [],
  };
}

const clone = (s) => ({ ...s, choices: s.choices.slice() });

function lose(s, n) {
  const k = Math.min(s.count, Math.max(0, Math.round(n)));
  s.count -= k;
  s.lost += k;
  if (s.count <= 0) s.dead = s.dead || 'wiped';
}

// Applies one door spec (with its extras) to a state.
function passDoor(s, spec) {
  if (!spec) return;
  if (spec.key) s.keys++;
  if (spec.hostages) { s.count += spec.hostages; s.hostages += spec.hostages; }
  if (spec.lock) {
    if (s.keys <= 0) return; // bounced off: nothing happens
    s.keys--;
    if (spec.chest) { s.chests++; s.count += spec.chest.n; return; }
  }
  const before = s.count;
  s.count = applyOp(s.count, spec);
  if (s.count < before) s.lost += before - s.count;
  if (s.count <= 0) s.dead = 'door';
}

// Total hostages placed in a level (all of them must be reachable on one route for the goal).
export function countHostages(level) {
  let n = 0;
  for (const ev of level.track) {
    if (ev.type === 'gates') n += ((ev.left && ev.left.hostages) || 0) + ((ev.right && ev.right.hostages) || 0);
    if (ev.type === 'fork') for (const side of ['left', 'right']) for (const it of ev[side].items) n += it.hostages || 0;
  }
  return n;
}

// The options a plan can pick at an event. Each option is applied by step().
function options(ev) {
  switch (ev.type) {
    case 'gates': return ['L', 'R'];
    case 'fork': {
      const shapes = ev.left.items.concat(ev.right.items).some((it) => it.wall) ? SHAPE_ORDER : ['normal'];
      return ['L', 'R'].flatMap((side) => shapes.map((sh) => `${side}:${sh}`));
    }
    case 'wall': case 'bridge': case 'switch': return SHAPE_ORDER;
    case 'shop': return ['skip', ...ev.offers.map((o, i) => `buy${i}`)];
    case 'boss': return SHAPE_ORDER;
    default: return [null];
  }
}

function step(s, ev, opt, ctx) {
  const { weapons } = ctx;
  // Each choice is kept with where it happens, so a bot can replay the plan in the real game.
  const rec = opt !== null ? { d: ev.d, len: ev.len || 0, type: ev.type, opt } : null;
  if (rec) s.choices.push(rec);
  switch (ev.type) {
    case 'gates':
      passDoor(s, opt === 'L' ? ev.left : ev.right);
      s.time += 20 / RUN_SPEED;
      break;
    case 'fork': {
      const [side, shape] = opt.split(':');
      const lane = ev[side === 'L' ? 'left' : 'right'];
      for (const it of lane.items) {
        if (s.dead) break;
        if (it.op) passDoor(s, it);
        else if (it.wall) lose(s, hazardLoss(s.count, shape, bestCentre(s.count, shape, laneBlades(side, it.w)).cx, laneBlades(side, it.w)));
        else if (it.slow) s.time += it.slow;
        else if (it.hostages) { s.count += it.hostages; s.hostages += it.hostages; }
        else if (it.key) s.keys++;
      }
      s.time += (ev.len + 12) / RUN_SPEED;
      break;
    }
    case 'wall': {
      const bc = bestCentre(s.count, opt, ev.safe);
      rec.cx = bc.cx;
      lose(s, bc.loss);
      s.time += 17 / RUN_SPEED;
      break;
    }
    case 'bridge': {
      if (!bridgeHolds(s.count, ev)) { s.dead = 'bridge'; break; }
      const bc = bestCentre(s.count, opt, ev.safe);
      rec.cx = bc.cx;
      lose(s, bc.loss);
      s.time += 24 / RUN_SPEED;
      break;
    }
    case 'switch':
      if (coversBoth(s.count, opt, ev.pad)) passDoor(s, ev.reward);
      s.time += 20 / RUN_SPEED;
      break;
    case 'check':
      s.targets++;
      if (!targetHit(s.count, ev)) {
        s.targetsMissed++;
        if (ev.hard) s.dead = 'target';
      }
      s.time += 17 / RUN_SPEED;
      break;
    case 'squad':
      lose(s, squadLoss(s.count, s.count * s.rate * s.dmg * 0.8, ev));
      s.time += 25 / RUN_SPEED;
      break;
    case 'shop':
      if (opt !== 'skip') {
        const o = ev.offers[Number(opt.slice(3))];
        if (s.count <= o.cost) { s.dead = 'shop'; break; } // not offered: plans that try this are dropped
        s.count -= o.cost;
        if (o.id === 'rate') s.rate *= 1 + o.val;
        else if (o.id === 'dmg') s.dmg *= 1 + o.val;
        else s.weapon = weapons[o.id];
      }
      s.time += 20 / RUN_SPEED;
      break;
    case 'boss': {
      const w = s.weapon;
      const f = bossFight(s.count, opt, ev, w, s.rate * w.rate, s.dmg * w.dmg);
      s.bossSecs = f.secs;
      lose(s, f.lost);
      if (f.secs > (ev.limit || DEFAULT_LIMIT)) s.dead = s.dead || 'boss';
      s.time += 10 / RUN_SPEED + Math.min(f.secs, 99);
      if (!s.dead) s.won = true;
      break;
    }
    default: break;
  }
  return s;
}

function result(level, s) {
  const r = { ...s, final: s.count, hostagesTotal: countHostages(level) };
  r.goals = starsFor(level.goals, r);
  r.stars = r.won ? r.goals.filter(Boolean).length : 0;
  return r;
}

// Exhaustive search over every plan; keeps the best (most stars, then a win, then the most soldiers).
export function solve(level, weapons, edge = 1) {
  const { events } = layout(level.track, level.boss);
  const ctx = { weapons };
  let best = null;
  const better = (a, b) => !b || a.stars > b.stars || (a.stars === b.stars && (a.won && !b.won || (a.won === b.won && a.final > b.final)));
  const seen = new Set();
  const walk = (i, s) => {
    if (s.dead && s.dead !== 'boss') { const r = result(level, s); if (better(r, best)) best = r; return; }
    if (i >= events.length) { const r = result(level, s); if (better(r, best)) best = r; return; }
    const key = `${i}|${s.count}|${s.keys}|${s.hostages}|${s.lost}|${s.targetsMissed}|${s.chests}|${Math.round(s.time)}|${s.weapon.id}|${s.rate}|${s.dmg}`;
    if (seen.has(key)) return;
    seen.add(key);
    for (const opt of options(events[i])) walk(i + 1, step(clone(s), events[i], opt, ctx));
  };
  walk(0, fresh(level, weapons, edge));
  return best;
}

// The naive player: always the door that shows the bigger number right now (a locked door with no key
// counts as nothing), never changes shape, never shops, picks the lane whose first door looks bigger.
export function naive(level, weapons) {
  const { events } = layout(level.track, level.boss);
  const ctx = { weapons };
  let s = fresh(level, weapons);
  const look = (spec) => {
    if (!spec) return s.count;
    if (spec.lock && s.keys <= 0) return s.count;
    if (spec.op === undefined) return s.count;
    return applyOp(s.count, spec);
  };
  const laneLook = (lane) => {
    const first = lane.items.find((it) => it.op);
    return first ? look(first) : s.count;
  };
  for (const ev of events) {
    if (s.dead) break;
    let opt = null;
    if (ev.type === 'gates') opt = look(ev.left) >= look(ev.right) ? 'L' : 'R';
    else if (ev.type === 'fork') opt = `${laneLook(ev.left) >= laneLook(ev.right) ? 'L' : 'R'}:normal`;
    else if (['wall', 'bridge', 'switch', 'boss'].includes(ev.type)) opt = 'normal';
    else if (ev.type === 'shop') opt = 'skip';
    s = step(s, ev, opt, ctx);
  }
  return result(level, s);
}
