// Puzzle props on the track: target doors, walls with a gap, saw strips, pits, rolling logs,
// weight bridges, twin switches, lane walls, mud, hostage cages, keys and the mid-run shop stand.
// Also builds the overhead preview of a whole level. main.js owns the squad; props ask it to
// remove soldiers (ctx.killUnits) or add them (ctx.gain), so the squad logic stays in one place.
import * as THREE from 'three';
import { HALF_W, targetHit, targetText, bridgeHolds, opText, LANE, laneCentre } from './rules.js';
import { makeGatePanel, makeFloorLabel, makeCountLabel } from './labels.js';

const INK = 0x2b2140;
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
const M = {
  ink: std(INK, { roughness: 0.8 }),
  paper: std(0xfff7ef, { roughness: 0.5 }),
  wall: std(0x8a78f0, { roughness: 0.55 }),
  wallTop: std(0xffbe2e, { roughness: 0.5 }),
  pit: new THREE.MeshBasicMaterial({ color: 0x1a1226 }),
  pitRim: std(0x5d5172),
  plank: std(0xc98a4a, { roughness: 0.85 }),
  rope: std(0x8a5a2b, { roughness: 0.9 }),
  mud: std(0x8a5a2b, { roughness: 1, transparent: true, opacity: 0.85 }),
  pad: std(0xffd34d, { emissive: 0x000000 }),
  padOn: std(0x2bd47a, { emissive: 0x2bd47a, emissiveIntensity: 0.5 }),
  gold: std(0xffbe2e, { metalness: 0.5, roughness: 0.3, emissive: 0x6a4400, emissiveIntensity: 0.5 }),
  log: std(0xa0642f, { roughness: 0.9 }),
  logEnd: std(0xf2c48a, { roughness: 0.8 }),
  divider: std(0xff8a7a, { roughness: 0.5, emissive: 0x401010 }),
  stripe: std(0xfff7ef, { roughness: 0.5 }),
  awning: std(0x8a78f0, { roughness: 0.6 }),
  awning2: std(0xfff7ef, { roughness: 0.6 }),
  gap: new THREE.MeshBasicMaterial({ color: 0x2bd47a, transparent: true, opacity: 0.22, depthWrite: false }),
  target: new THREE.MeshBasicMaterial({ color: 0xffbe2e, transparent: true, opacity: 0.32, depthWrite: false }),
};
const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const PAD = new THREE.CylinderGeometry(1, 1, 0.08, 24);
const LOG = new THREE.CylinderGeometry(0.42, 0.42, 1, 16).rotateZ(Math.PI / 2);
const LOG_END = new THREE.CylinderGeometry(0.3, 0.3, 1, 12).rotateZ(Math.PI / 2);
const RING = new THREE.TorusGeometry(0.2, 0.06, 8, 18);
// Everything above is shared by many props: never disposed when a prop is cleared.
export const SHARED = new Set([...Object.values(M), BOX, PLANE, PAD, LOG, LOG_END, RING]);

const box = (mat, w, h, d, x, y, z) => {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};
const flat = (mat, w, d, x, y, z) => {
  const m = new THREE.Mesh(PLANE, mat);
  m.scale.set(w, 1, d);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
};

// The parts of [-HALF_W, HALF_W] not covered by the safe intervals.
export function unsafe(safe) {
  const s = safe.map(([a, b]) => [Math.max(-HALF_W, a), Math.min(HALF_W, b)]).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  const out = [];
  let x = -HALF_W;
  for (const [a, b] of s) {
    if (a > x + 0.01) out.push([x, a]);
    x = Math.max(x, b);
  }
  if (x < HALF_W - 0.01) out.push([x, HALF_W]);
  return out;
}
const inSafe = (x, safe) => safe.some(([a, b]) => x >= a && x <= b);

export function makeKeyMesh() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(RING, M.gold);
  ring.position.y = 0.22;
  const shaft = box(M.gold, 0.08, 0.42, 0.08, 0, -0.1, 0);
  const t1 = box(M.gold, 0.16, 0.06, 0.08, 0.06, -0.24, 0);
  const t2 = box(M.gold, 0.12, 0.06, 0.08, 0.05, -0.12, 0);
  g.add(ring, shaft, t1, t2);
  return g;
}

export function createProps(ctx) {
  const { scene, game, crowd, t } = ctx;
  let list = [];
  const hostageDraw = [];

  function add(p) {
    p.group.position.z = p.z;
    scene.add(p.group);
    list.push(p);
    return p;
  }

  // ---------------------------------------------------------------- spawning
  function spawn(ev, z) {
    const group = new THREE.Group();
    const p = { ev, type: ev.type, z, len: ev.len || 0, group, done: false };
    switch (ev.type) {
      case 'check': {
        const w = HALF_W * 2;
        for (const s of [-1, 1]) group.add(box(M.ink, 0.22, 3.1, 0.22, s * (HALF_W - 0.05), 1.55, 0));
        group.add(box(M.ink, w + 0.2, 0.22, 0.26, 0, 3.05, 0));
        p.panel = makeGatePanel(3.4, 1.6);
        p.panel.position.set(0, 2.15, 0.05);
        group.add(p.panel, flat(M.target, w, 0.9, 0, 0.012, 0));
        ctx.seeObstacle('target', t('new.target'));
        break;
      }
      case 'wall': {
        p.kind = ev.kind;
        p.safe = ev.safe;
        const bad = unsafe(ev.safe);
        if (ev.kind === 'door') {
          for (const [a, b] of bad) {
            group.add(box(M.wall, b - a, 1.7, 0.5, (a + b) / 2, 0.85, 0));
            group.add(box(M.wallTop, b - a + 0.04, 0.18, 0.56, (a + b) / 2, 1.75, 0));
          }
          for (const [a, b] of ev.safe) group.add(flat(M.gap, Math.min(b, HALF_W) - Math.max(a, -HALF_W), 2.4, (Math.max(a, -HALF_W) + Math.min(b, HALF_W)) / 2, 0.013, 1.2));
        } else if (ev.kind === 'saws') {
          p.blades = [];
          for (const [a, b] of bad) {
            const w = b - a;
            group.add(flat(ctx.slotMat, w, ev.len, (a + b) / 2, 0.012, -ev.len / 2));
            for (let k = 0; k < 3; k++) {
              const bl = new THREE.Mesh(ctx.sawGeo, ctx.sawMat);
              const sc = Math.min(1.25, Math.max(0.55, w / 1.4));
              bl.scale.setScalar(sc);
              bl.rotation.y = Math.PI / 2;
              bl.position.set((a + b) / 2, 0.42 * sc, -0.6 - k * (ev.len - 1.2) / 2);
              bl.castShadow = true;
              group.add(bl);
              p.blades.push(bl);
            }
          }
        } else if (ev.kind === 'pit') {
          for (const [a, b] of bad) {
            group.add(flat(M.pit, b - a, ev.len, (a + b) / 2, 0.014, -ev.len / 2));
            for (const e of [a, b]) if (Math.abs(e) < HALF_W - 0.05) group.add(box(M.pitRim, 0.1, 0.06, ev.len, e, 0.03, -ev.len / 2));
            group.add(box(M.pitRim, b - a, 0.06, 0.1, (a + b) / 2, 0.03, 0), box(M.pitRim, b - a, 0.06, 0.1, (a + b) / 2, 0.03, -ev.len));
          }
        } else if (ev.kind === 'log') {
          p.logs = [];
          for (const [a, b] of bad) {
            const lg = new THREE.Mesh(LOG, M.log);
            lg.scale.set(b - a, 1, 1);
            lg.position.set((a + b) / 2, 0.42, 0);
            lg.castShadow = true;
            const end = new THREE.Mesh(LOG_END, M.logEnd);
            end.scale.set(b - a + 0.02, 1, 1);
            end.position.copy(lg.position);
            group.add(lg, end);
            p.logs.push(lg, end);
          }
        }
        ctx.seeObstacle(ev.kind === 'door' ? 'door' : ev.kind, t(`new.${ev.kind === 'door' ? 'door' : ev.kind}`));
        break;
      }
      case 'bridge': {
        p.safe = ev.safe;
        const [[a, b]] = ev.safe;
        for (const [ua, ub] of unsafe(ev.safe)) group.add(flat(M.pit, ub - ua, ev.len, (ua + ub) / 2, 0.014, -ev.len / 2));
        p.deck = new THREE.Group();
        const planks = Math.round(ev.len / 0.55);
        for (let k = 0; k < planks; k++) p.deck.add(box(M.plank, b - a, 0.08, 0.45, (a + b) / 2, 0.04, -0.28 - k * 0.55));
        for (const e of [a, b]) {
          p.deck.add(box(M.rope, 0.07, 0.07, ev.len, e, 0.62, -ev.len / 2));
          for (const zz of [0, -ev.len]) p.deck.add(box(M.ink, 0.14, 0.8, 0.14, e, 0.4, zz));
        }
        group.add(p.deck);
        const label = ev.max ? `${ev.min}–${ev.max}` : `≥${ev.min}`;
        p.sign = makeFloorLabel(Math.min(b - a, 3), 1.3, label, ev.max ? '#c98a00' : '#2f7cf6');
        p.sign.position.set((a + b) / 2, 0.016, 1.4);
        group.add(p.sign);
        p.count = makeCountLabel(0.7, '#fff2b8');
        p.count.position.set(b + 0.7 > HALF_W ? a - 0.9 : b + 0.9, 1.2, 0.8);
        p.count.userData.set(label);
        group.add(p.count);
        ctx.seeObstacle(ev.max ? 'bridgeMax' : 'bridge', t(ev.max ? 'new.bridgeMax' : 'new.bridge', { min: ev.min, max: ev.max }));
        break;
      }
      case 'switch': {
        p.pads = [];
        for (const s of [-1, 1]) {
          const pad = new THREE.Mesh(PAD, M.pad);
          pad.scale.set(0.5, 1, 0.5);
          pad.position.set(s * ev.pad, 0.04, 0);
          group.add(pad);
          p.pads.push({ mesh: pad, x: s * ev.pad, on: false });
        }
        p.panel = makeGatePanel(2.2, 1.5);
        p.panel.position.set(0, 1.15, -1.2);
        p.panel.userData.draw(opText(ev.reward), t('sw.both'), 'lock');
        group.add(p.panel);
        ctx.seeObstacle('switch', t('new.switch'));
        break;
      }
      case 'fork': {
        p.len = ev.len;
        const wall = box(M.divider, 0.3, 1.0, ev.len, 0, 0.5, -ev.len / 2);
        group.add(wall);
        for (let k = 0; k < ev.len; k += 2) group.add(box(M.stripe, 0.32, 0.24, 0.8, 0, 0.62, -k - 0.6));
        group.add(box(M.ink, 0.34, 0.12, ev.len, 0, 1.02, -ev.len / 2));
        if (ev.tags && ev.tags[0]) {
          ev.tags.forEach((tag, i) => {
            const lbl = makeFloorLabel(2.8, 1.1, t(`lane.${tag}`), tag === 'risky' ? '#e8453c' : '#2bb06a');
            lbl.position.set(laneCentre(i ? 'R' : 'L'), 0.016, 2.4);
            group.add(lbl);
          });
        }
        ctx.seeObstacle('fork', t('new.fork'));
        break;
      }
      case 'mud': {
        const [a, b] = LANE[ev.side];
        group.add(flat(M.mud, b - a - 0.3, ev.len, (a + b) / 2, 0.013, -ev.len / 2));
        const lbl = makeFloorLabel(Math.min(2.6, b - a - 0.4), 1.0, t('lane.slow'), '#8a5a2b');
        lbl.position.set((a + b) / 2, 0.02, -1.2);
        group.add(lbl);
        p.len = ev.len;
        break;
      }
      case 'cage': {
        p.x = ev.x;
        for (const sx of [-0.55, 0.55]) for (const sz of [-0.45, 0.45]) group.add(box(M.ink, 0.07, 1.25, 0.07, ev.x + sx, 0.62, sz));
        for (let k = -2; k <= 2; k++) group.add(box(M.ink, 0.035, 1.2, 0.035, ev.x + k * 0.22, 0.6, 0.45));
        group.add(box(M.wallTop, 1.25, 0.1, 1.05, ev.x, 1.27, 0));
        p.label = makeCountLabel(0.7, '#b8ffd9');
        p.label.position.set(ev.x, 1.85, 0);
        p.label.userData.set(`+${ev.n}`);
        group.add(p.label);
        p.people = Array.from({ length: Math.min(ev.n, 8) }, (_, i) => ({ ox: ((i % 4) - 1.5) * 0.24, oz: (Math.floor(i / 4) - 0.5) * 0.3, phase: Math.random() * 6 }));
        ctx.seeObstacle('hostage', t('new.hostage'));
        break;
      }
      case 'key': {
        p.x = ev.x;
        p.mesh = makeKeyMesh();
        p.mesh.position.set(ev.x, 1.0, 0);
        p.mesh.scale.setScalar(1.5);
        group.add(p.mesh, flat(M.target, 1.2, 1.2, ev.x, 0.013, 0));
        ctx.seeObstacle('key', t('new.key'));
        break;
      }
      case 'shop': {
        for (const s of [-1, 1]) group.add(box(M.ink, 0.16, 2.8, 0.16, s * 2.6, 1.4, 0));
        for (let k = 0; k < 8; k++) group.add(box(k % 2 ? M.awning : M.awning2, 0.68, 0.26, 0.9, -2.38 + k * 0.68, 2.8, 0.1));
        p.panel = makeGatePanel(3.2, 1.3);
        p.panel.position.set(0, 2.05, 0.2);
        p.panel.userData.draw(t('shop.stand'), t('shop.trade'), 'sign');
        group.add(p.panel);
        break;
      }
      default: return null;
    }
    return add(p);
  }

  // ---------------------------------------------------------------- per frame
  function update(dt, dz, playing) {
    const R = ctx.radius();
    hostageDraw.length = 0;
    game.mud = 1;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      const ev = p.ev;
      p.z += dz;
      if (p.type === 'wall' && p.kind === 'log' && p.z > -32) {
        // The log rolls at the squad, faster than the track.
        const v = 6 * dt;
        p.z += v;
        for (const lg of p.logs) lg.rotation.x += (dz + v) / 0.42;
      }
      p.group.position.z = p.z;
      switch (p.type) {
        case 'check': {
          if (!p.passed) {
            const n = Math.round(game.count);
            const tone = targetHit(n, ev) ? 'hit' : n < ev.min ? 'target' : 'off';
            p.panel.userData.draw(targetText(ev), t('tgt.you', { n }), tone);
            if (playing && p.z >= 0) {
              p.passed = true;
              game.targets++;
              if (targetHit(n, ev)) ctx.onTarget(true, p);
              else {
                game.targetsMissed++;
                ctx.onTarget(false, p);
                if (ev.hard) ctx.loseLevel('lose.target');
              }
            }
          }
          break;
        }
        case 'wall': {
          if (p.blades) for (const bl of p.blades) bl.rotation.z -= dt * 14;
          if (playing && p.z > -R - 0.6 && p.z - p.len < R + 0.6) {
            const z0 = p.z - p.len - 0.25;
            const z1 = p.z + 0.25;
            ctx.killUnits((x, oz) => oz >= z0 && oz <= z1 && !inSafe(x, p.safe), p.kind === 'pit' ? 'fall' : 'hit', p.kind === 'door' ? 'lose.wall' : `lose.${p.kind}`);
          }
          break;
        }
        case 'bridge': {
          if (p.falling) {
            p.falling += dt;
            p.deck.position.y -= dt * dt * 60 + p.falling * 3 * dt;
            p.deck.rotation.z += dt * 0.6;
            break;
          }
          if (playing && !p.checked && p.z >= -0.2) {
            p.checked = true;
            const n = Math.round(game.count);
            if (!bridgeHolds(n, ev)) {
              p.falling = 0.001;
              ctx.bridgeFail(n < ev.min ? 'lose.bridgeLight' : 'lose.bridgeHeavy');
              break;
            }
            ctx.bridgeOk(p);
          }
          if (playing && p.checked && p.z > -R && p.z - p.len < R + 0.4) {
            const z0 = p.z - p.len;
            ctx.killUnits((x, oz) => oz >= z0 && oz <= p.z && !inSafe(x, p.safe), 'fall', 'lose.pit');
          }
          break;
        }
        case 'switch': {
          if (playing && !p.done && Math.abs(p.z) < 1.0) {
            for (const pad of p.pads) {
              if (pad.on) continue;
              for (const u of crowd.units) {
                if (Math.abs(ctx.unitX(u) - pad.x) < 0.55 && Math.abs(u.oz - p.z) < 0.7) {
                  pad.on = true;
                  pad.mesh.material = M.padOn;
                  ctx.sfx.tick();
                  break;
                }
              }
            }
          }
          if (playing && !p.done && p.z >= 1.0) {
            p.done = true;
            p.panel.visible = false;
            ctx.onSwitch(p.pads.every((q) => q.on), ev.reward, p);
          }
          break;
        }
        case 'fork': {
          if (!p.lane && playing && p.z >= -0.6) {
            p.lane = crowd.x < 0 ? 'L' : 'R';
            ctx.setLane(p.lane);
          }
          if (p.lane && !p.done && p.z - p.len > 1.2) {
            p.done = true;
            ctx.setLane(null);
          }
          break;
        }
        case 'mud': {
          const side = crowd.x < 0 ? 'L' : 'R';
          if (side === ev.side && p.z > -0.5 && p.z - p.len < 0.5) game.mud = 0.45;
          break;
        }
        case 'cage': {
          if (!p.done) {
            for (const h of p.people) hostageDraw.push({ x: p.x + h.ox, z: p.z + h.oz, phase: h.phase });
            if (playing && p.z >= -0.3) {
              if (Math.abs(crowd.x - p.x) < Math.max(1.2, R * 0.6)) {
                p.done = true;
                ctx.onRescue(ev.n, p);
                for (const c of p.group.children) if (c !== p.label) c.visible = false;
                p.label.visible = false;
              } else if (p.z > 1.2) {
                p.done = true;
                game.hostagesMissed += ev.n;
                ctx.popAt(t('hostage.missed'), p.x, 1.2, p.z, 'bad');
              }
            }
          }
          break;
        }
        case 'key': {
          if (!p.done) {
            p.mesh.rotation.y += dt * 3;
            p.mesh.position.y = 1.0 + Math.sin(game.time * 4) * 0.12;
            if (playing && p.z >= -0.4 && p.z < 1.2 && Math.abs(crowd.x - p.x) < Math.max(1.2, R * 0.6)) {
              p.done = true;
              p.mesh.visible = false;
              ctx.onKey(p);
            }
          }
          break;
        }
        case 'shop': {
          if (playing && !p.done && p.z >= -6) {
            p.done = true;
            ctx.openShop(ev);
          }
          break;
        }
        default: break;
      }
      if (p.z - p.len > 9) {
        if (p.type === 'fork' && p.lane && !p.done) ctx.setLane(null);
        ctx.trash(p.group);
        list.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const p of list) ctx.trash(p.group);
    list = [];
    hostageDraw.length = 0;
  }

  // ---------------------------------------------------------------- overhead preview
  // A flat map of the whole level laid on the track, flown over by a high camera before the run.
  function buildPreview(events) {
    const root = new THREE.Group();
    const tile = (w, d, text, color, x, z, y = 0.02) => {
      const m = makeFloorLabel(w, d, text, color);
      m.position.set(x, y, z);
      root.add(m);
      return m;
    };
    const doorColor = (s) => (!s ? null : s.lock ? '#5d5172' : s.op === 'x' ? '#2f7cf6' : s.val < 0 || s.op === '÷' ? '#e8453c' : '#4f95ff');
    const doorText = (s) => (s.chest ? t('pv.chest') : s.lock ? t('pv.lock', { v: opText(s) }) : opText(s));
    for (const ev of events) {
      const z = -ev.d;
      switch (ev.type) {
        case 'gates': case 'weapon': {
          [[-1, ev.left], [1, ev.right]].forEach(([s, spec]) => {
            if (!spec) return;
            const text = ev.type === 'weapon' ? spec.label : doorText(spec);
            tile(3.2, 3.2, text, ev.type === 'weapon' ? '#ff9628' : doorColor(spec), s * HALF_W / 2, z);
            if (spec.key) tile(2.4, 1.6, t('pv.key'), '#c98a00', s * HALF_W / 2, z + 3);
            if (spec.hostages) tile(2.4, 1.6, `+${spec.hostages}`, '#2bb06a', s * HALF_W / 2, z + 3);
          });
          break;
        }
        case 'check': tile(HALF_W * 2, 3.4, targetText(ev), '#ffbe2e', 0, z); break;
        case 'wall': {
          const word = { door: '', saws: t('pv.saw'), pit: t('pv.pit'), log: t('pv.log') }[ev.kind];
          for (const [a, b] of unsafe(ev.safe)) if (b - a > 0.2) tile(b - a, Math.max(1.2, ev.len), b - a > 1 ? word : '', ev.kind === 'door' ? '#8a78f0' : '#2b2140', (a + b) / 2, z - Math.max(1.2, ev.len) / 2);
          break;
        }
        case 'bridge': {
          for (const [a, b] of unsafe(ev.safe)) tile(b - a, ev.len, '', '#1a1226', (a + b) / 2, z - ev.len / 2);
          const [[a, b]] = ev.safe;
          tile(b - a, ev.len, ev.max ? `${ev.min}–${ev.max}` : `≥${ev.min}`, '#c98a4a', (a + b) / 2, z - ev.len / 2);
          break;
        }
        case 'switch': {
          for (const s of [-1, 1]) tile(1.2, 1.2, '', '#ffd34d', s * ev.pad, z);
          tile(2.6, 2.4, opText(ev.reward), '#5d5172', 0, z - 1.6);
          break;
        }
        case 'fork': {
          const wall = box(M.divider, 0.3, 0.6, ev.len, 0, 0.3, z - ev.len / 2);
          root.add(wall);
          if (ev.tags && ev.tags[0]) ev.tags.forEach((tag, i) => tile(3.1, 2, t(`lane.${tag}`), tag === 'risky' ? '#e8453c' : '#2bb06a', laneCentre(i ? 'R' : 'L'), z + 2));
          break;
        }
        case 'mud': tile(3, Math.min(ev.len, 20), t('lane.slow'), '#8a5a2b', laneCentre(ev.side), z - Math.min(ev.len, 20) / 2, 0.015); break;
        case 'cage': tile(3, 2.4, `+${ev.n}`, '#2bb06a', ev.x, z); break;
        case 'key': tile(3, 2.4, t('pv.key'), '#c98a00', ev.x, z); break;
        case 'shop': tile(HALF_W * 2, 3, t('shop.stand'), '#8a78f0', 0, z); break;
        case 'squad': tile(4.4, 2.6, t('pv.enemy', { n: ev.count }), '#e8453c', 0, z); break;
        case 'boss': tile(HALF_W * 2, 4, t(`pv.boss.${ev.kind || 'brute'}`), '#b3261e', 0, z - 2); break;
        default: break;
      }
    }
    return root;
  }

  return {
    spawn, update, clear, buildPreview,
    hostages: () => hostageDraw,
    list: () => list,
  };
}
