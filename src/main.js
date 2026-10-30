import * as THREE from 'three';
import {
  HALF_W, SPAWN_DIST, DESPAWN_Z, RUN, GUN, ENEMY, BOSS, COLORS, UPGRADES, SKINS, WEAPONS,
  upgradeCost, startSoldiers, damageMult, rateMult, incomeMult,
} from './config.js';
import { loadSave, writeSave } from './save.js';
import { unlockAudio, setMuted, sfx } from './audio.js';
import { startMusic, setMusicIntensity, setMusicEnabled, duckMusic } from './music.js';
import { createWorld } from './world.js';
import { FigureSet, corpseGeo } from './figures.js';
import { makeGatePanel, makeCountLabel, makeHealthLabel, makeFloorLabel } from './labels.js';
import { buildLevel, levelKind } from './level.js';
import { themeFor, worldNumber } from './themes.js';
import { createAds } from './ads.js';
import { createPayments, PRODUCTS } from './payments.js';
import { createMeta } from './meta.js';
import { createSettings } from './settings.js';
import { createAccount } from './account.js';
import { createMissions } from './missions.js';
import { createWheel } from './wheel.js';
import { createAchievements } from './achievements.js';
import { scheduleIfAllowed } from './notify.js';
import { t, getLang, setLang, applyStatic } from './i18n.js';
import { track, getStats, resetStats } from './analytics.js';
import { storeLink, openLink } from './promo.js';
import { runOpening } from './opening.js';
import { nfaArt } from './onboard-art.js';
import promoIcon from '../assets/promo-tower-128.webp';

const ads = createAds({ skipAds: () => Array.isArray(save.iap) && (save.iap.includes('no_ads') || save.iap.includes('starter_pack')) });
const payments = createPayments();
let meta = null; // created once the rest of the game is defined
let missions = null;
let achievements = null;
const ACH_STAT = { kill: 'kills', boss: 'bosses', flip: 'flips' };
const mission = (type, n) => {
  if (missions) missions.count(type, n);
  if (achievements && ACH_STAT[type]) achievements.add(ACH_STAT[type], n || 1);
};
const record = (stat, value) => achievements && achievements.max(stat, value);
const bump = (stat, n = 1) => achievements && achievements.add(stat, n);

// ================================================================ setup
const save = loadSave();
setMuted(save.muted);
setMusicEnabled(save.music !== false);

const canvas = document.getElementById('game');
const { renderer, scene, camera, trackTex, applyTheme } = createWorld(canvas);
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clampX = (x, m = 0.2) => Math.max(-HALF_W + m, Math.min(HALF_W - m, x));

const ui = {
  home: $('screen-home'),
  shop: $('screen-shop'),
  won: $('screen-won'),
  lost: $('screen-lost'),
  pause: $('screen-pause'),
  hud: $('hud'),
  level: $('hud-level'),
  progress: $('hud-progress'),
  runCoins: $('hud-coins'),
  banner: $('banner'),
  popups: $('popups'),
  hint: $('hud-hint'),
  playLabel: $('play-label'),
  wallet: document.querySelectorAll('[data-wallet]'),
  shopList: $('shop-list'),
  wonCoins: $('won-coins'),
  wonLevel: $('won-level'),
  lostLine: $('lost-line'),
  mute: $('btn-mute'),
  music: $('btn-music'),
  flash: $('flash'),
  wonMult: $('won-mult'),
  adTriple: $('btn-ad-triple'),
  adRevive: $('btn-ad-revive'),
};

// ================================================================ shared meshes
const dummy = new THREE.Object3D();
const gunGeos = {};
for (const w of WEAPONS) {
  const thick = w.id === 'shotgun' || w.id === 'minigun' ? 0.085 : 0.055;
  const len = 0.28 * w.len;
  gunGeos[w.id] = new THREE.BoxGeometry(thick, thick, len).translate(0.13, 0.36, -0.06 - len / 2);
}
const weaponById = (id) => WEAPONS.find((w) => w.id === id) || WEAPONS[0];
const skinById = (id) => SKINS.find((k) => k.id === id) || SKINS[0];
const shade = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();

// The army and the enemies: articulated little soldiers, drawn in bulk.
const allyMesh = new FigureSet(scene, RUN.maxVisible, {
  body: COLORS.ally, head: COLORS.allyHead, helmet: shade(COLORS.ally, 0.65),
  pack: shade(COLORS.ally, 0.55), legs: 0x2b2140, gun: 0x2b2140,
}, gunGeos.rifle);
// Enough figures for several big squads at once; the nearest squads were going invisible at 500.
const ENEMY_DRAW_MAX = 1400;
const enemyMesh = new FigureSet(scene, ENEMY_DRAW_MAX, {
  body: COLORS.enemy, head: 0xf0c8a8, helmet: shade(COLORS.enemy, 0.6), pack: shade(COLORS.enemy, 0.5), legs: 0x3a1a1a,
});
const shieldPlates = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.46, 0.5, 0.06).translate(0, 0.32, 0.2),
  new THREE.MeshStandardMaterial({ color: 0x8fa3c4, metalness: 0.6, roughness: 0.3 }),
  600
);
shieldPlates.count = 0;
shieldPlates.frustumCulled = false;
shieldPlates.castShadow = true;
scene.add(shieldPlates);
const HEAD_GIANT = new THREE.Color(0x2b1a1a);
const HEAD_HELMET = new THREE.Color(0x9aa3b5);

const bulletMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.11, 0.11, 0.6),
  new THREE.MeshBasicMaterial({ color: COLORS.bullet }),
  256
);
bulletMesh.count = 0;
bulletMesh.frustumCulled = false;
bulletMesh.renderOrder = 3;
scene.add(bulletMesh);
// a soft glow around every bullet so they read at a glance on a phone
const bulletGlow = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.22, 0.22, 0.8),
  new THREE.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
  256
);
bulletGlow.count = 0;
bulletGlow.frustumCulled = false;
bulletGlow.renderOrder = 4;
scene.add(bulletGlow);

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const decorMats = COLORS.decor.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));

// Repaints the track, sky and scenery for the world a level belongs to.
function applyWorld(level) {
  const theme = themeFor(level);
  applyTheme(theme);
  decorMats.forEach((m, i) => {
    m.color.setHex(theme.decor[i % theme.decor.length]);
    const glow = theme.decorGlow ? theme.decorGlow[i % theme.decorGlow.length] : 0;
    m.emissive.setHex(glow);
    m.emissiveIntensity = glow ? 0.35 : 0;
  });
  return theme;
}

function levelTitle(level) {
  const kind = levelKind(level);
  const base = t('level', { n: level });
  return kind === 'normal' ? base : `${base} · ${t(`tag.${kind}`)}`;
}
const sparkMats = {
  ally: new THREE.MeshBasicMaterial({ color: COLORS.ally }),
  enemy: new THREE.MeshBasicMaterial({ color: COLORS.enemy }),
  fire: COLORS.spark.map((c) => new THREE.MeshBasicMaterial({ color: c })),
  barrel: new THREE.MeshBasicMaterial({ color: COLORS.barrel }),
};
const postMat = new THREE.MeshStandardMaterial({ color: 0xfff7ef, roughness: 0.5 });
const postGeo = new THREE.BoxGeometry(0.16, 2.7, 0.16);
const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.95, 18);
const barrelMat = new THREE.MeshStandardMaterial({ color: COLORS.barrel, roughness: 0.45, metalness: 0.2 });
const bandGeo = new THREE.TorusGeometry(0.43, 0.06, 6, 24);
bandGeo.rotateX(Math.PI / 2);
const bandMat = new THREE.MeshStandardMaterial({ color: COLORS.barrelBand, roughness: 0.4 });
const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
ringGeo.rotateX(-Math.PI / 2);
const ringFillGeo = new THREE.CircleGeometry(1, 40);
ringFillGeo.rotateX(-Math.PI / 2);
const rockGeo = new THREE.DodecahedronGeometry(0.45, 0);
const sawMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd6, metalness: 0.85, roughness: 0.25 });
const sawHubMat = new THREE.MeshStandardMaterial({ color: 0xe8453c, roughness: 0.4 });
const slotMat = new THREE.MeshStandardMaterial({ color: 0x5d5172, roughness: 0.9 });
const sawGeo = (() => {
  // A flat disc with teeth, standing upright and facing the army.
  const shape = new THREE.Shape();
  const teeth = 18;
  for (let i = 0; i <= teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.78 : 0.64;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.12, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }).translate(0, 0, -0.04);
})();
const turretBaseGeo = new THREE.CylinderGeometry(0.5, 0.62, 0.5, 16);
const turretHeadGeo = new THREE.BoxGeometry(0.6, 0.42, 0.6);
const turretBarrelGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.7, 10).rotateX(Math.PI / 2).translate(0, 0, 0.45);
const turretMat = new THREE.MeshStandardMaterial({ color: 0x4a4458, roughness: 0.5, metalness: 0.3 });
const turretLightMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
const shotGeo = new THREE.SphereGeometry(0.17, 12, 8);
const shotMat = new THREE.MeshBasicMaterial({ color: 0xff5a3c });
const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b5b73, roughness: 0.9, flatShading: true });

// ================================================================ simple pool
class Pool {
  constructor(make) {
    this.make = make;
    this.free = [];
    this.active = [];
  }
  get() {
    const o = this.free.pop() || this.make();
    o.visible = true;
    this.active.push(o);
    return o;
  }
  release(o) {
    o.visible = false;
    const i = this.active.indexOf(o);
    if (i >= 0) this.active.splice(i, 1);
    this.free.push(o);
  }
  clear() {
    for (let i = this.active.length - 1; i >= 0; i--) this.release(this.active[i]);
  }
}

const sparks = new Pool(() => {
  const m = new THREE.Mesh(unitBox, sparkMats.fire[0]);
  m.userData = { v: new THREE.Vector3() };
  scene.add(m);
  return m;
});
const decor = new Pool(() => {
  const m = new THREE.Mesh(unitBox, decorMats[0]);
  scene.add(m);
  return m;
});

// Soldiers that get knocked out fly off and tumble instead of vanishing.
const corpseMats = { ally: allyMesh.body.material, enemy: enemyMesh.body.material };
const corpses = new Pool(() => {
  const m = new THREE.Mesh(corpseGeo, corpseMats.ally);
  m.userData = { v: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 };
  scene.add(m);
  return m;
});

function corpse(x, z, kind, power = 1) {
  if (corpses.active.length > 70) return;
  const m = corpses.get();
  m.material = corpseMats[kind];
  m.position.set(x, 0.1, z);
  m.rotation.set(0, 0, 0);
  m.scale.setScalar(1);
  const u = m.userData;
  u.v.set(rand(-1.6, 1.6) * power, rand(3, 5.5) * power, rand(-0.6, 1.8) * power);
  u.spin.set(rand(-12, 12), rand(-6, 6), rand(-12, 12));
  u.life = rand(0.7, 1.0);
}

function flash(kind) {
  const el = ui.flash;
  el.className = '';
  void el.offsetWidth;
  el.className = `go ${kind}`;
}

function burst(x, y, z, count, mats, power = 5, size = [0.06, 0.16]) {
  for (let i = 0; i < count; i++) {
    const s = sparks.get();
    s.material = Array.isArray(mats) ? pick(mats) : mats;
    const sz = rand(size[0], size[1]);
    s.scale.setScalar(sz);
    s.position.set(x, y, z);
    s.userData.v.set(rand(-1, 1) * power, rand(0.4, 1.5) * power, rand(-1, 1) * power);
    s.userData.life = rand(0.35, 0.8);
    s.userData.max = s.userData.life;
    s.userData.size = sz;
  }
}

// ================================================================ looks and loadout
function applyLoadout() {
  const skin = skinById(save.skin);
  allyMesh.setColors({
    body: skin.body, head: skin.head, gun: skin.gun,
    helmet: shade(skin.body, 0.65), pack: shade(skin.body, 0.55), legs: shade(skin.gun, 1),
  });
  sparkMats.ally.color.setHex(skin.body);
  allyMesh.gun.geometry = gunGeos[weaponById(save.weapon).id];
}

// ================================================================ game state
const game = {
  mode: 'home', // home | playing | won | lost | paused
  level: 1,
  plan: null,
  nextEvent: 0,
  traveled: 0,
  speed: RUN.idleSpeed,
  count: 12,
  dmg: 1,
  rate: GUN.baseRate,
  coinsRun: 0,
  emitAcc: 0,
  crushAcc: 0,
  shake: 0,
  endTimer: 0,
  pausedFrom: null,
  nextDecorZ: 0,
  time: 0,
  steps: 1, // simulation steps per frame; raised only by automated tests
  bonus: null,
  slowmo: 0,
};
const crowd = { x: 0, target: 0, units: [] };
const bullets = [];
let gatePairs = [];
let squads = [];
let barrels = [];
let boss = null;
let slams = [];
let saws = [];
const shots = [];

const countLabel = makeCountLabel(1.1);
scene.add(countLabel);

// ================================================================ crowd
function slotOffset(i) {
  const r = RUN.slot * Math.sqrt(i + 0.5) * 1.15;
  const a = i * 2.39996;
  return [Math.cos(a) * r, Math.sin(a) * r * 0.85];
}

function crowdRadius() {
  return RUN.slot * Math.sqrt(Math.min(game.count, RUN.maxVisible)) * 1.15 + 0.15;
}

function syncCrowd() {
  const want = Math.max(0, Math.min(Math.ceil(game.count), RUN.maxVisible));
  const units = crowd.units;
  while (units.length > want) {
    const u = units.pop();
    corpse(clampX(crowd.x + u.ox), u.oz, 'ally');
    burst(crowd.x + u.ox, 0.35, u.oz, 1, sparkMats.ally, 3);
  }
  while (units.length < want) {
    const [tx, tz] = slotOffset(units.length);
    units.push({ ox: 0, oz: 0, tx, tz, phase: Math.random() * 6.28 });
  }
}

function setCount(n) {
  game.count = Math.max(0, n);
  if (game.count > (game.peak || 0)) {
    game.peak = game.count;
    if (game.mode === 'playing' || game.mode === 'bonus') record('bestArmy', Math.round(game.count));
  }
  syncCrowd();
}

// ================================================================ spawning
function spawnGatePair(ev, z) {
  const w = HALF_W - 0.25;
  const pair = { z, passed: false, kind: ev.type, moving: !!ev.moving, freq: ev.freq || 0, gates: [], group: new THREE.Group() };
  const sides = ev.moving ? [[0, ev.left]] : [[-1, ev.left], [1, ev.right]];
  for (const [side, spec] of sides) {
    const x = side * (HALF_W / 2);
    const node = new THREE.Group();
    const panel = makeGatePanel(w, 2.1);
    panel.position.set(0, 1.25, 0);
    const p1 = new THREE.Mesh(postGeo, postMat);
    const p2 = new THREE.Mesh(postGeo, postMat);
    p1.position.set(-w / 2, 1.35, 0);
    p2.position.set(w / 2, 1.35, 0);
    p1.castShadow = p2.castShadow = true;
    node.add(panel, p1, p2);
    node.position.x = x;
    pair.group.add(node);
    const gate = { x, w, spec: { ...spec }, panel, node, value: spec.val };
    pair.gates.push(gate);
    drawGate(gate, ev.type);
  }
  if (pair.moving) {
    // Rails show the door's path.
    const rail = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 0.06, 0.12), slotMat);
    rail.position.y = 0.03;
    pair.group.add(rail);
    seeObstacle('slider', t('new.slider'));
  }
  pair.group.position.z = z;
  scene.add(pair.group);
  gatePairs.push(pair);
}

function seeObstacle(key, text) {
  save.seen = save.seen || {};
  if (save.seen[key]) return;
  save.seen[key] = true;
  writeSave(save);
  setTimeout(() => showBanner(text), 400);
}

function spawnSaws(ev, z) {
  for (let k = 0; k < ev.count; k++) {
    const g = new THREE.Group();
    const slot = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 0.04, 0.18), slotMat);
    slot.position.y = 0.02;
    const blade = new THREE.Mesh(sawGeo, sawMat);
    blade.position.y = 0.42;
    blade.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 12).rotateX(Math.PI / 2), sawHubMat);
    hub.position.y = 0.42;
    g.add(slot, blade, hub);
    const zz = z - k * 4.5;
    g.position.z = zz;
    scene.add(g);
    // Each blade can only take so many soldiers per pass, so one mistake is not the end.
    saws.push({ z: zz, x: 0, amp: ev.amp, freq: ev.freq * 0.85, phase: ev.phase + k * Math.PI, r: 0.72, group: g, blade, hub, acc: 0, taken: 0, cap: 3 + Math.floor(game.level / 2) });
  }
  seeObstacle('saw', t('new.saw'));
}

function spawnTurret(ev, z) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(turretBaseGeo, turretMat);
  base.position.y = 0.25;
  const head = new THREE.Group();
  head.position.y = 0.72;
  const box = new THREE.Mesh(turretHeadGeo, turretMat);
  const barrel = new THREE.Mesh(turretBarrelGeo, turretMat);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), turretLightMat);
  light.position.set(0, 0.24, 0.1);
  head.add(box, barrel, light);
  for (const m of [base, box, barrel]) m.castShadow = true;
  const label = makeHealthLabel(0.75);
  label.position.set(0, 1.7, 0);
  g.add(base, head, label);
  g.position.set(ev.x, 0, z);
  scene.add(g);
  label.userData.set(ev.hp, ev.hp);
  barrels.push({
    kind: 'turret', x: ev.x, z, hp: ev.hp, max: ev.hp, reward: ev.reward, group: g, label, hitFlash: 0,
    head, light, fireIn: 1.2,
  });
  seeObstacle('turret', t('new.turret'));
}

function fireShot(t) {
  const m = new THREE.Mesh(shotGeo, shotMat);
  const tx = crowd.x;
  const dx = tx - t.x;
  const dzz = 0 - t.z;
  const len = Math.hypot(dx, dzz) || 1;
  const speed = 11 + game.level * 0.2;
  m.position.set(t.x, 0.75, t.z);
  scene.add(m);
  shots.push({ x: t.x, z: t.z, vx: (dx / len) * speed, vz: (dzz / len) * speed, mesh: m });
  sfx.tick();
}

function gateLabel(gate, type) {
  const s = gate.spec;
  if (type === 'weapon') return { title: s.label, sub: t(s.kind === 'rate' ? 'gate.rate' : 'gate.dmg'), tone: s.val > 0 ? 'gun' : 'bad' };
  if (s.op === 'x') return { title: `x${s.val}`, sub: '', tone: 'good' };
  if (s.op === '÷') return { title: `÷${s.val}`, sub: '', tone: 'bad' };
  if (s.op === '?') return { title: '?', sub: '', tone: 'mystery' };
  const v = Math.round(gate.value);
  return { title: v >= 0 ? `+${v}` : `${v}`, sub: '', tone: v >= 0 ? 'good' : 'bad' };
}

function drawGate(gate, type) {
  const l = gateLabel(gate, type);
  gate.panel.userData.draw(l.title, l.sub, l.tone);
}

// Firepower of the army right now (damage per second).
const armyDps = () => game.count * game.rate * game.dmg;

function spawnSquad(ev, z) {
  const units = [];
  // Squads keep up with the army you actually have (x2/x3 doors are exact), so late levels stay a fight:
  // a share of your army in size, and enough health to take a few seconds of your fire.
  const L = game.level;
  const pressure = Math.min(0.55, 0.1 + L * 0.005) * (ev.ramp || 1);
  const strength = Math.max(ev.count, Math.round(game.count * pressure));
  const n = Math.min(strength, ENEMY.maxUnits);
  const w = Math.max(1, Math.round(strength / n)); // each figure stands for w enemies
  const ttk = 0.6 + L * 0.026; // seconds of full fire this squad should take
  const unitHp = Math.max(ev.hp * w, Math.ceil((armyDps() * ttk * (ev.ramp || 1)) / n));
  for (let i = 0; i < n; i++) {
    const r = 0.26 * Math.sqrt(i + 0.5) * 1.1;
    const a = i * 2.39996;
    const roll = Math.random();
    const shield = ev.shield && roll < ev.shield;
    const armored = !shield && ev.armored && roll < (ev.shield || 0) + ev.armored;
    units.push({
      ox: Math.cos(a) * r, oz: Math.sin(a) * r * 0.8, hp: armored ? unitHp * 3 : shield ? unitHp * 2 : unitHp, armored, shield, w,
      alive: true, phase: Math.random() * 6.28,
    });
  }
  // Giants walk in front of the squad.
  for (let g = 0; g < (ev.giants || 0); g++) {
    units.push({
      ox: (g - ((ev.giants - 1) / 2)) * 1.4, oz: 1.3, hp: 60 + game.level * 35, giant: true,
      alive: true, phase: Math.random() * 6.28,
    });
  }
  if (ev.armored) seeObstacle('armor', t('new.armor'));
  if (ev.shield) seeObstacle('shield', t('new.shield'));
  if (ev.giants) seeObstacle('giant', t('new.giant'));
  const label = makeCountLabel(0.9, '#ffd2cc');
  scene.add(label);
  squads.push({ x: clampX(ev.x, 1), z, units, alive: units.length, label });
}

function spawnBarrels(ev, z) {
  for (const x of ev.xs) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(barrelGeo, barrelMat);
    body.position.y = 0.475;
    body.castShadow = true;
    const b1 = new THREE.Mesh(bandGeo, bandMat);
    b1.position.y = 0.22;
    const b2 = new THREE.Mesh(bandGeo, bandMat);
    b2.position.y = 0.73;
    g.add(body, b1, b2);
    g.position.set(x, 0, z);
    const label = makeHealthLabel(0.75);
    label.position.set(0, 1.55, 0);
    g.add(label);
    scene.add(g);
    label.userData.set(ev.hp, ev.hp);
    barrels.push({ x, z, hp: ev.hp, max: ev.hp, reward: ev.reward, group: g, label, hitFlash: 0 });
  }
}

function spawnBoss(ev, z) {
  const g = new THREE.Group();
  const theme = themeFor(game.level);
  const mat = new THREE.MeshStandardMaterial({ color: theme.boss, roughness: 0.5, emissive: 0x000000 });
  const dark = new THREE.MeshStandardMaterial({ color: theme.bossDark, roughness: 0.6 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.4 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const black = new THREE.MeshBasicMaterial({ color: 0x1a1020 });
  const parts = [];
  const add = (geo, m, x, y, zz, parent = g) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, zz);
    mesh.castShadow = true;
    parent.add(mesh);
    parts.push(mesh);
    return mesh;
  };
  const legGeo = new THREE.BoxGeometry(0.36, 0.75, 0.36);
  add(legGeo, dark, -0.36, 0.37, 0);
  add(legGeo, dark, 0.36, 0.37, 0);
  add(new THREE.CapsuleGeometry(0.75, 1.0, 6, 14), mat, 0, 1.45, 0);
  const belly = add(new THREE.SphereGeometry(0.58, 16, 12), mat, 0, 1.2, 0.22);
  belly.scale.set(1, 0.85, 0.7);
  const belt = add(new THREE.TorusGeometry(0.77, 0.09, 8, 28), dark, 0, 0.92, 0);
  belt.rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(0.36, 14, 10), mat, -0.86, 2.08, 0);
  add(new THREE.SphereGeometry(0.36, 14, 10), mat, 0.86, 2.08, 0);
  const head = add(new THREE.SphereGeometry(0.5, 18, 14), dark, 0, 2.75, 0);
  const hornGeo = new THREE.ConeGeometry(0.12, 0.5, 10);
  const hornL = add(hornGeo, bone, -0.32, 0.42, 0, head);
  const hornR = add(hornGeo, bone, 0.32, 0.42, 0, head);
  hornL.rotation.z = 0.5;
  hornR.rotation.z = -0.5;
  const eyeGeo = new THREE.SphereGeometry(0.1, 10, 8);
  const pupilGeo = new THREE.SphereGeometry(0.05, 8, 6);
  for (const side of [-1, 1]) {
    add(eyeGeo, white, side * 0.18, 0.08, 0.42, head);
    add(pupilGeo, black, side * 0.18, 0.08, 0.51, head);
  }
  const armGeo = new THREE.BoxGeometry(0.32, 1.1, 0.32);
  armGeo.translate(0, -0.5, 0);
  const armL = add(armGeo, mat, -0.98, 2.05, 0);
  const armR = add(armGeo, mat, 0.98, 2.05, 0);
  const fistGeo = new THREE.SphereGeometry(0.27, 12, 10);
  add(fistGeo, dark, 0, -1.08, 0, armL);
  add(fistGeo, dark, 0, -1.08, 0, armR);
  // A world boss is much bigger.
  g.scale.setScalar(ev.big ? 1.75 : 1.12);
  const label = makeHealthLabel(ev.big ? 1.0 : 1.3);
  label.position.set(0, 3.75, 0);
  g.add(label);
  g.position.set(0, 0, z);
  scene.add(g);
  // A boss should take a while even for a huge army.
  const hp = Math.round(Math.max(ev.hp, armyDps() * (ev.big ? 1.6 : 1) * (4 + Math.min(10, game.level * 0.1))));
  label.userData.set(hp, hp);
  boss = {
    x: 0, z, hp, max: hp, group: g, mat, armL, armR, label,
    contact: false, flash: 0, dead: false, slamIn: 0.5, introduced: false, big: !!ev.big,
  };
}

function spawnSlam(x, z, from) {
  const r = Math.min(2.2, BOSS.slamRadius + game.level * 0.04);
  const group = new THREE.Group();
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xe8453c, transparent: true, depthWrite: false }));
  ring.scale.setScalar(r);
  const fill = new THREE.Mesh(ringFillGeo, new THREE.MeshBasicMaterial({ color: 0xe8453c, transparent: true, opacity: 0.2, depthWrite: false }));
  fill.scale.setScalar(0.01);
  ring.renderOrder = fill.renderOrder = 1;
  group.add(fill, ring);
  scene.add(group);
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.castShadow = true;
  scene.add(rock);
  const dur = Math.max(0.75, BOSS.slamWarn - game.level * 0.02);
  // Lead the target so the circle meets the army even while the track still moves.
  z -= game.speed * dur;
  slams.push({
    x: clampX(x, 0.6), z, r, t: 0, dur,
    group, ring, fill, rock, fromX: from.x, fromZ: from.z,
  });
  sfx.tick();
}

function slamImpact(sl) {
  burst(sl.x, 0.3, sl.z, 22, [rockMat, ...sparkMats.fire], 6, [0.08, 0.22]);
  sfx.boom();
  game.shake = 0.45;
  // Share of the army standing inside the circle.
  const units = crowd.units;
  let inside = 0;
  for (const u of units) {
    const ux = clampX(crowd.x + u.ox);
    if (Math.hypot(ux - sl.x, u.oz - sl.z) < sl.r) inside++;
  }
  if (!units.length || !inside) {
    popup(t('dodged'), 'good');
    bump('dodges');
    return;
  }
  const loss = Math.max(1, Math.round(game.count * (inside / units.length) * BOSS.slamPower));
  setCount(game.count - loss);
  buzz([40, 30, 40]);
  popup(`-${fmt(loss)}`, 'bad');
  if (game.count <= 0) loseLevel('lose.rock');
}

// ---------------------------------------------------------------- boss fists
// Up close the boss raises both arms, a red zone marks where the fists will land,
// then it smashes. Step to the side to dodge.
const punchReach = () => BOSS.punchReach * (boss.big ? 1.3 : 1);
const punchWidth = () => BOSS.punchWidth * (boss.big ? 1.25 : 1);

function startPunch() {
  const reach = punchReach();
  const w = punchWidth();
  const zone = new THREE.Mesh(new THREE.PlaneGeometry(w, reach - 0.4), new THREE.MeshBasicMaterial({ color: 0xe8453c, transparent: true, opacity: 0.2, depthWrite: false }));
  zone.rotation.x = -Math.PI / 2;
  zone.renderOrder = 1;
  scene.add(zone);
  const dur = Math.max(0.55, BOSS.punchWarn - game.level * 0.01);
  boss.punch = { phase: 'up', t: 0, dur, x: boss.x, zone, reach, w };
  sfx.roar();
}

function startLeap() {
  boss.leapt = true;
  startPunch();
  const p = boss.punch;
  p.phase = 'leap';
  p.dur = 1.0;
  p.from = boss.z;
  p.to = Math.max(boss.z, -(p.reach - 1.4));
  p.x = clampX(crowd.x * 0.5, 0.6);
  p.fromX = boss.x;
}

function updatePunch(dt) {
  const p = boss.punch;
  p.t += dt;
  if (p.phase === 'leap') {
    const k = Math.min(1, p.t / p.dur);
    const e = k * k * (3 - 2 * k);
    boss.z = p.from + (p.to - p.from) * e;
    boss.x = p.fromX + (p.x - p.fromX) * e;
    boss.hop = Math.sin(k * Math.PI) * 3.4;
    boss.armL.rotation.x = boss.armR.rotation.x = 2.7 * Math.min(1, k * 2.5);
    p.zone.position.set(p.x, 0.04, p.to + 0.4 + (p.reach - 0.4) / 2);
    p.zone.material.opacity = 0.15 + 0.35 * k + 0.12 * Math.sin(p.t * 22);
    if (k >= 1) { boss.hop = 0; p.phase = 'down'; p.t = 0; }
    return;
  }
  // The zone stays in front of the boss while it is still walking.
  p.zone.position.set(p.x, 0.04, boss.z + 0.4 + (p.reach - 0.4) / 2);
  if (p.phase === 'up') {
    const k = Math.min(1, p.t / p.dur);
    const lift = 2.7 * (1 - Math.pow(1 - k, 3));
    boss.armL.rotation.x = boss.armR.rotation.x = lift;
    p.zone.material.opacity = 0.15 + 0.35 * k + 0.12 * Math.sin(p.t * 22);
    if (k >= 1) { p.phase = 'down'; p.t = 0; }
  } else if (p.phase === 'down') {
    const k = Math.min(1, p.t / 0.12);
    boss.armL.rotation.x = boss.armR.rotation.x = 2.7 - 4.1 * k;
    if (k >= 1) {
      punchImpact(p);
      p.phase = 'rest';
      p.t = 0;
      trash(p.zone);
    }
  } else {
    const k = Math.min(1, p.t / 0.45);
    boss.armL.rotation.x = boss.armR.rotation.x = -1.4 * (1 - k);
    if (k >= 1) {
      boss.punch = null;
      boss.punchIn = Math.max(1.4, BOSS.punchEvery - game.level * 0.04) * (boss.big ? 0.85 : 1);
    }
  }
}

function punchImpact(p) {
  const z0 = boss.z + 0.4;
  const z1 = boss.z + p.reach;
  const fistZ = boss.z + p.reach * 0.55;
  for (const side of [-1, 1]) burst(p.x + side * p.w * 0.25, 0.2, fistZ, 18, [rockMat, ...sparkMats.fire], 6, [0.08, 0.22]);
  sfx.bigBoom();
  game.shake = 0.6;
  if (game.mode !== 'playing') return;
  const units = crowd.units;
  let inside = 0;
  for (const u of units) {
    const ux = clampX(crowd.x + u.ox);
    if (Math.abs(ux - p.x) < p.w / 2 && u.oz > z0 && u.oz < z1) inside++;
  }
  if (!units.length || !inside) {
    popup(t('dodged'), 'good');
    bump('dodges');
    return;
  }
  const loss = Math.max(1, Math.round(game.count * (inside / units.length) * BOSS.punchPower));
  setCount(game.count - loss);
  buzz([60, 30, 60]);
  popup(`-${fmt(loss)}`, 'bad');
  if (game.count <= 0) loseLevel('lose.boss');
}

// ---------------------------------------------------------------- cleanup
// Takes objects off the scene and frees their GPU memory, except for the
// geometries and materials that many objects share.
let sharedRes = null;
function trash(...objs) {
  if (!sharedRes) {
    sharedRes = new Set([
      postGeo, postMat, barrelGeo, barrelMat, bandGeo, bandMat, sawGeo, sawMat, sawHubMat, slotMat,
      turretBaseGeo, turretHeadGeo, turretBarrelGeo, turretMat, turretLightMat, shotGeo, shotMat,
      rockGeo, rockMat, ringGeo, ringFillGeo, iceMat, laneMat, shieldMat, unitBox, corpseGeo,
    ]);
  }
  for (const obj of objs) {
    if (!obj) continue;
    scene.remove(obj);
    obj.traverse((o) => {
      if (o.geometry && !sharedRes.has(o.geometry)) o.geometry.dispose();
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (sharedRes.has(m)) continue;
        if (m.map) m.map.dispose();
        m.dispose();
      }
    });
  }
}

// ---------------------------------------------------------------- boss moves
let iceWalls = [];
const iceMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, emissive: 0x6ac7ff, emissiveIntensity: 0.25 });
const laneMat = new THREE.MeshBasicMaterial({ color: 0xe8453c, transparent: true, opacity: 0.35, depthWrite: false });
const shieldMat = new THREE.MeshStandardMaterial({ color: 0x8f86ff, transparent: true, opacity: 0.3, emissive: 0xff4fd8, emissiveIntensity: 0.6, depthWrite: false });
sparkMats.ice = new THREE.MeshBasicMaterial({ color: 0xbfe8ff });

function bossAttack() {
  const world = themeFor(game.level).id;
  boss.moves = (boss.moves || 0) + 1;
  const special = boss.moves % 2 === 0;
  if (world === 'desert' && special && boss.z > -BOSS.stopDist - 1) return startCharge();
  if (world === 'snow' && special) return spawnIceWall();
  if (world === 'lava' && special) return summonMinions();
  spawnSlam(crowd.x, 0, boss);
}

// Desert: the boss marks its lane, then charges straight down it.
function startCharge() {
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(boss.big ? 3.2 : 2.2, 22).rotateX(-Math.PI / 2), laneMat.clone());
  boss.charge = { phase: 'warn', t: 0, x: boss.x, home: boss.z, lane, hit: false };
  lane.position.set(boss.x, 0.04, boss.z / 2);
  scene.add(lane);
  sfx.roar();
}

function updateCharge(dt, R) {
  const c = boss.charge;
  c.t += dt;
  boss.x = c.x;
  if (c.phase === 'warn') {
    c.lane.material.opacity = 0.2 + 0.3 * Math.abs(Math.sin(c.t * 12));
    if (c.t > 1.1) { c.phase = 'dash'; c.t = 0; }
    return;
  }
  if (c.phase === 'dash') {
    boss.z += 20 * dt;
    if (!c.hit && boss.z > -R * 0.5) {
      c.hit = true;
      const half = boss.big ? 1.6 : 1.1;
      let inside = 0;
      for (const u of crowd.units) if (Math.abs(clampX(crowd.x + u.ox) - c.x) < half) inside++;
      if (inside && crowd.units.length && game.mode === 'playing') {
        const loss = Math.max(1, Math.round(game.count * (inside / crowd.units.length) * 0.5));
        setCount(game.count - loss);
        burst(c.x, 0.6, 0, 16, [sparkMats.ally, sparkMats.fire[0]], 6);
        sfx.boom();
        game.shake = 0.45;
        popup(`-${fmt(loss)}`, 'bad');
        if (game.count <= 0) loseLevel('lose.charge');
      } else if (game.mode === 'playing') {
        popup(t('dodged'), 'good');
    bump('dodges');
      }
    }
    if (boss.z > 3) { c.phase = 'back'; trash(c.lane); }
    return;
  }
  boss.z -= 12 * dt;
  if (boss.z <= c.home) {
    boss.z = c.home;
    boss.charge = null;
  }
}

// Snow: a wall of ice slides at the army; only the gap is safe.
function spawnIceWall() {
  const gapHalf = 1.15;
  const gapX = Math.max(-HALF_W + gapHalf, Math.min(HALF_W - gapHalf, (Math.random() * 2 - 1) * 2.2));
  const group = new THREE.Group();
  const addBlock = (from, to) => {
    if (to - from < 0.1) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(to - from, 1.1, 0.5), iceMat);
    m.position.set((from + to) / 2, 0.55, 0);
    m.castShadow = true;
    group.add(m);
  };
  addBlock(-HALF_W, gapX - gapHalf);
  addBlock(gapX + gapHalf, HALF_W);
  const z = boss.z + 2;
  group.position.z = z;
  scene.add(group);
  iceWalls.push({ z, gapX, gapHalf, group, hit: false });
  sfx.tick();
}

// Lava: the boss calls in a small squad.
function summonMinions() {
  spawnSquad({ count: 5 + Math.floor(game.level / 3), hp: 1 + Math.floor(game.level / 4), x: boss.x, armored: 0 }, boss.z + 2);
  burst(boss.x, 0.5, boss.z + 2, 14, sparkMats.fire, 4);
  sfx.roar();
}

// Neon City: the boss raises a shield now and then; bullets bounce off it.
function updateShield(dt) {
  if (themeFor(game.level).id !== 'night' || game.mode !== 'playing' || boss.z < -BOSS.slamRange) return;
  if (!boss.shieldMesh) {
    boss.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.9, 24, 16), shieldMat);
    boss.shieldMesh.position.y = 1.6;
    boss.group.add(boss.shieldMesh);
    boss.shieldIn = 2.5;
  }
  if (boss.shieldOn) {
    boss.shieldLeft -= dt;
    boss.shieldMesh.material.opacity = 0.25 + 0.1 * Math.sin(game.time * 10);
    if (boss.shieldLeft <= 0) { boss.shieldOn = false; boss.shieldMesh.visible = false; boss.shieldIn = 4.5; }
  } else {
    boss.shieldMesh.visible = false;
    boss.shieldIn -= dt;
    if (boss.shieldIn <= 0) {
      boss.shieldOn = true;
      boss.shieldLeft = 2.2;
      boss.shieldMesh.visible = true;
      popup(t('shieldUp'), 'bad');
      sfx.tick();
    }
  }
}

function spawnDecor(z) {
  const side = Math.random() < 0.5 ? -1 : 1;
  const m = decor.get();
  const w = rand(1.2, 3.2);
  const h = rand(4, 10);
  m.material = pick(decorMats);
  m.scale.set(w, h, w);
  m.position.set(side * rand(HALF_W + 2.5, HALF_W + 14), -9 + h / 2 + rand(-1, 3), z);
  m.userData.spin = rand(-0.2, 0.2);
}

function clearLevel() {
  for (const p of gatePairs) trash(p.group);
  for (const s of squads) trash(s.label);
  for (const b of barrels) trash(b.group);
  if (boss) trash(boss.group);
  for (const sl of slams) trash(sl.group, sl.rock);
  slams = [];
  for (const sw of saws) trash(sw.group);
  saws = [];
  for (const w of iceWalls) trash(w.group);
  iceWalls = [];
  if (boss && boss.charge) trash(boss.charge.lane);
  if (boss && boss.punch) trash(boss.punch.zone);
  for (const sh of shots) trash(sh.mesh);
  shots.length = 0;
  gatePairs = [];
  squads = [];
  barrels = [];
  boss = null;
  bullets.length = 0;
  sparks.clear();
  corpses.clear();
  if (game.bonus) for (const t of game.bonus.tiles) trash(t.group);
  game.bonus = null;
  game.slowmo = 0;
}

// ================================================================ flow
function show(screen) {
  for (const s of [ui.home, ui.shop, ui.won, ui.lost, ui.pause]) s.hidden = s !== screen;
  ui.hud.hidden = !['playing', 'bonus', 'paused', 'won', 'lost'].includes(game.mode) || screen === ui.won || screen === ui.lost;
}

function refreshWallet() {
  for (const el of ui.wallet) el.textContent = fmt(save.coins);
  ui.playLabel.textContent = t('play', { n: save.level });
  $('home-world').textContent = t('world.label', { n: worldNumber(save.level), name: t(`world.${themeFor(save.level).id}`) });
  const kindTag = levelKind(save.level);
  $('home-kind').hidden = kindTag === 'normal';
  $('home-kind').textContent = kindTag === 'normal' ? '' : t(`tag.${kindTag}`);
  ui.mute.setAttribute('aria-pressed', String(save.muted));
  ui.mute.textContent = t(save.muted ? 'sound.off' : 'sound.on');
  ui.music.setAttribute('aria-pressed', String(save.music === false));
  ui.music.textContent = t(save.music === false ? 'music.off' : 'music.on');
}

function startLevel() {
  unlockAudio();
  sfx.tap();
  clearLevel();
  game.level = save.level;
  game.plan = buildLevel(game.level);
  Object.assign(game, {
    mode: 'playing', nextEvent: 0, traveled: 0, speed: RUN.speed, coinsRun: 0, emitAcc: 0,
    crushAcc: 0, shake: 0, endTimer: 0, time: 0, peak: 0, revived: false, lastEarned: 0,
    dmg: GUN.baseDamage * damageMult(save.up.dmg),
    rate: GUN.baseRate * rateMult(save.up.rate),
  });
  game.weapon = weaponById(save.weapon);
  game.dmg *= game.weapon.dmg;
  game.rate *= game.weapon.rate;
  applyLoadout();
  crowd.units.length = 0;
  crowd.x = crowd.target = 0;
  setCount(startSoldiers(save.up.army));
  ui.level.textContent = levelTitle(game.level);
  const theme = applyWorld(game.level);
  game.finishAt = 0;
  ui.runCoins.textContent = '0';
  game.dragged = 0;
  game.tutTimer = 0;
  // Returning players on the first levels get the short reminder; new players get the full guide.
  $('hint-text').textContent = t('hint');
  ui.hint.hidden = game.level > 2 || !seen().tutDrag;
  ui.hint.classList.remove('fade');
  if (!ui.hint.hidden) setTimeout(() => ui.hint.classList.add('fade'), 2600);
  const kind = game.plan.kind;
  if (game.level > 1 && game.level % 10 === 1) showBanner(t('world.new', { name: t(`world.${theme.id}`) }));
  else if (kind !== 'normal') showBanner(t(`special.${kind}`));
  else if (seen().tutDrag) showBanner(pick(t('taunts')).replace('{n}', game.level)); // not on a brand-new player's first look
  startMusic();
  setMusicIntensity(1);
  track('level_start', {
    level: game.level, weapon: save.weapon, skin: save.skin,
    army: save.up.army, dmg: save.up.dmg, rate: save.up.rate, income: save.up.income,
  });
  show(null);
  requestWakeLock();
}

function showBanner(text) {
  ui.banner.textContent = text;
  ui.banner.hidden = false;
  ui.banner.classList.remove('go');
  void ui.banner.offsetWidth;
  ui.banner.classList.add('go');
}

function winLevel(mult = 1) {
  game.mode = 'won';
  setMusicIntensity(0);
  game.endTimer = 0;
  sfx.win();
  buzz([20, 40, 20]);
  const base = 20 + game.level * 6 + game.coinsRun;
  const earned = Math.round(base * incomeMult(save.up.income) * mult);
  save.coins += earned;
  save.level += 1;
  game.lastEarned = earned;
  if (save.level === 4) setTimeout(maybeOffer, 1800);
  afterRun();
  mission('win');
  record('bestLevel', save.level);
  if (mult >= 5) bump('x5');
  mission('coins', earned);
  if (mult >= 3) mission('bonus');
  const xp = meta.onLevelEnd(true, mult);
  record('passTier', meta.currentTier());
  $('won-xp').textContent = t('pass.xp', { n: xp.gain });
  if (xp.tierUp) setTimeout(() => popup(t('pass.tierUp'), 'gun'), 1300);
  track('level_complete', { level: game.level, mult, coins: earned, seconds: Math.round(game.time), peak: Math.round(game.peak || 0) });
  ui.adTriple.hidden = false;
  ui.adTriple.disabled = false;
  ui.wonMult.hidden = mult <= 1;
  ui.wonMult.textContent = t('bonusMult', { n: mult });
  writeSave(save);
  ui.wonLevel.textContent = t('won.title', { n: game.level });
  ui.wonCoins.textContent = `+${fmt(earned)}`;
  refreshWallet();
  releaseWakeLock();
}

function loseLevel(reason) {
  if (game.mode !== 'playing') return;
  game.mode = 'lost';
  game.endTimer = 0;
  game.shake = 0.5;
  setMusicIntensity(0);
  sfx.lose();
  buzz([60, 40, 60]);
  ui.lostLine.textContent = t(reason);
  track('level_fail', {
    level: game.level, reason, seconds: Math.round(game.time),
    progress: game.plan ? Math.min(1, game.traveled / game.plan.length) : 0, peak: Math.round(game.peak || 0),
  });
  // A small consolation so failing still moves you forward.
  const earned = Math.round((5 + game.coinsRun) * incomeMult(save.up.income));
  save.coins += earned;
  writeSave(save);
  $('lost-coins').textContent = `+${fmt(earned)}`;
  afterRun();
  mission('coins', earned);
  $('lost-xp').textContent = t('pass.xp', { n: meta.onLevelEnd(false).gain });
  ui.adRevive.hidden = game.revived;
  ui.adRevive.disabled = false;
  refreshWallet();
  releaseWakeLock();
}

// After the third run (and twice more later), offer to save progress to an account.
function afterRun() {
  account.onRunEnd();
  setTimeout(() => { if (game.mode === 'won' || game.mode === 'lost') account.maybeAsk(); }, 2600);
}

// ---------------------------------------------------------------- rewarded ads
async function tripleReward() {
  ui.adTriple.disabled = true;
  const ok = await ads.showRewarded('triple');
  track('ad_reward', { placement: 'triple', granted: ok, level: game.level });
  if (!ok) {
    ui.adTriple.disabled = false;
    return;
  }
  const extra = game.lastEarned * 2;
  save.coins += extra;
  mission('coins', extra);
  writeSave(save);
  ui.wonCoins.textContent = `+${fmt(game.lastEarned * 3)}`;
  ui.adTriple.hidden = true;
  sfx.win();
  refreshWallet();
}

async function revive() {
  ui.adRevive.disabled = true;
  const ok = await ads.showRewarded('revive');
  track('ad_reward', { placement: 'revive', granted: ok, level: game.level });
  if (!ok) {
    ui.adRevive.disabled = false;
    return;
  }
  game.revived = true;
  game.mode = 'playing';
  game.endTimer = 0;
  // Clear whatever just beat you so the second chance is real.
  squads = squads.filter((sq) => {
    if (sq.z > -12) {
      trash(sq.label);
      return false;
    }
    return true;
  });
  for (const sl of slams) trash(sl.group, sl.rock);
  slams = [];
  for (const sh of shots) trash(sh.mesh);
  shots.length = 0;
  if (boss && !boss.dead) {
    boss.z = Math.min(boss.z, -BOSS.stopDist);
    boss.contact = false;
    boss.slamIn = 2;
    if (boss.punch) { trash(boss.punch.zone); boss.punch = null; }
    boss.punchIn = 1.5;
  }
  setCount(Math.max(8, Math.round(game.peak * 0.4)));
  game.peak = game.count;
  popup(t('secondChance'), 'good');
  setMusicIntensity(boss && !boss.dead && boss.introduced ? 2 : 1);
  sfx.gateGood();
  show(null);
  requestWakeLock();
}

$('btn-ad-triple').addEventListener('click', tripleReward);
$('btn-ad-revive').addEventListener('click', revive);

// ---------------------------------------------------------------- bonus run
// After the boss: tiles x1.5 ... x5. Each tile costs soldiers; the last one
// you can pay for multiplies the level's coins.
const BONUS_MULTS = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const BONUS_COLORS = ['#ffc93d', '#ffad3d', '#ff913d', '#ff7448', '#f85a64', '#e04f8c', '#b157d1', '#7a5cf0'];

function startBonus() {
  game.mode = 'bonus';
  // Tile costs follow the biggest army of the run, so x5 is earned, not automatic.
  const base = Math.max(2 + game.level, (game.peak || 0) * 0.04) * (game.plan && game.plan.kind === 'gold' ? 0.6 : 1);
  const tiles = BONUS_MULTS.map((mult, i) => {
    const group = new THREE.Group();
    const label = makeFloorLabel(HALF_W * 2 - 0.04, 2.3, `x${mult}`, BONUS_COLORS[i]);
    label.position.y = 0.02;
    group.add(label);
    const z = -9 - i * 2.5;
    group.position.z = z;
    scene.add(group);
    return { z, mult, cost: Math.ceil(base * Math.pow(1.3, i)), group, label, reached: false, pop: 0 };
  });
  game.bonus = { tiles, mult: 1, done: false, doneT: 0 };
}

function updateBonus(dt, dz) {
  const b = game.bonus;
  for (const t of b.tiles) {
    t.z += dz;
    t.group.position.z = t.z;
    if (t.pop > 0) {
      t.pop -= dt;
      t.label.position.y = 0.02 + Math.max(0, t.pop) * 0.8;
    }
    if (b.done || t.reached || t.z < -0.4) continue;
    if (game.count > t.cost) {
      t.reached = true;
      t.pop = 0.25;
      b.mult = t.mult;
      setCount(game.count - t.cost);
      burst(crowd.x, 0.5, 0, 14, [sparkMats.fire[0], sparkMats.fire[2], sparkMats.ally], 5);
      popup(`x${t.mult}`, 'gun');
      sfx.tile(b.tiles.indexOf(t));
      buzz(15);
      if (t === b.tiles[b.tiles.length - 1]) b.done = true;
    } else {
      b.done = true;
      popup(b.mult > 1 ? `x${b.mult}!` : t('soClose'), b.mult > 1 ? 'good' : 'bad');
    }
  }
  if (b.done) {
    b.doneT += dt;
    if (b.doneT > 1.1 && game.mode === 'bonus') winLevel(b.mult);
  }
}

function goHome() {
  game.mode = 'home';
  applyWorld(save.level);
  if (meta) meta.refreshBadges();
  if (missions) missions.refreshBadge();
  if (typeof wheel !== 'undefined') wheel.refresh();
  setTimeout(homeTip, 900);
  if (achievements) achievements.refreshBadge();
  setTimeout(maybeOffer, 400);
  setMusicIntensity(0);
  game.speed = RUN.idleSpeed;
  clearLevel();
  crowd.units.length = 0;
  setCount(12);
  ui.banner.hidden = true;
  refreshWallet();
  show(ui.home);
}

function pauseGame() {
  if (game.mode !== 'playing' && game.mode !== 'bonus') return;
  game.pausedFrom = game.mode;
  game.mode = 'paused';
  drag.active = false;
  duckMusic(true);
  show(ui.pause);
}

function resumeGame() {
  if (game.mode !== 'paused') return;
  game.mode = game.pausedFrom || 'playing';
  duckMusic(false);
  show(null);
}

// ================================================================ shop
let shopTab = 'upgrades';

function shopRow(title, lines, swatch) {
  const li = document.createElement('li');
  li.className = 'upgrade';
  li.innerHTML = `${swatch || ''}<div class="upgrade-text"><h3>${title}</h3>${lines}</div>`;
  return li;
}

function buyButton(id, cost, label, onBuy) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-buy';
  btn.id = id;
  btn.type = 'button';
  btn.innerHTML = `<span class="coin-icon" aria-hidden="true"></span>${fmt(cost)}`;
  btn.disabled = save.coins < cost;
  btn.setAttribute('aria-label', t('buyFor', { name: label, cost }));
  btn.addEventListener('click', () => {
    if (save.coins < cost) return;
    save.coins -= cost;
    onBuy();
    const [kind, ...rest] = id.split('-');
    track('purchase', { kind, id: rest.join('-'), cost });
    record('weapons', save.owned.weapons.length);
    record('skins', save.owned.skins.length);
    writeSave(save);
    unlockAudio();
    sfx.buy();
    buzz(15);
    refreshWallet();
    renderShop();
  });
  return btn;
}

function stateButton(id, text, disabled, onClick) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-buy btn-plain';
  btn.id = id;
  btn.type = 'button';
  btn.textContent = text;
  btn.disabled = disabled;
  if (onClick) {
    btn.addEventListener('click', () => {
      onClick();
      writeSave(save);
      unlockAudio();
      sfx.tap();
      applyLoadout();
      renderShop();
    });
  }
  return btn;
}

function renderShop() {
  ui.shopList.innerHTML = '';
  for (const t of document.querySelectorAll('[data-tab]')) t.setAttribute('aria-selected', String(t.dataset.tab === shopTab));

  if (shopTab === 'upgrades') {
    for (const [key, up] of Object.entries(UPGRADES)) {
      const lvl = save.up[key];
      const maxed = lvl >= up.max;
      const li = shopRow(
        `${up.name} <span class="lvl-tag">${t('lv', { n: lvl })}</span>`,
        `<p>${up.describe(lvl)}</p>${maxed ? '' : `<p class="next">${t('next', { text: up.describe(lvl + 1) })}</p>`}`
      );
      li.appendChild(maxed
        ? stateButton(`buy-${key}`, t('max'), true)
        : buyButton(`buy-${key}`, upgradeCost(key, lvl), up.name, () => { save.up[key] += 1; }));
      ui.shopList.appendChild(li);
    }
  } else if (shopTab === 'squad') {
    for (const k of SKINS) {
      const hex = (n) => '#' + n.toString(16).padStart(6, '0');
      const swatch = `<span class="swatch" aria-hidden="true" style="--b:${hex(k.body)};--h:${hex(k.head)}"></span>`;
      const owned = save.owned.skins.includes(k.id);
      const name = t(`skin.${k.id}`);
      const li = shopRow(name, `<p>${owned ? t(save.skin === k.id ? 'wearing' : 'owned') : t('squadLook')}</p>`, swatch);
      if (save.skin === k.id) li.appendChild(stateButton(`skin-${k.id}`, t('on'), true));
      else if (owned) li.appendChild(stateButton(`skin-${k.id}`, t('wear'), false, () => { save.skin = k.id; }));
      else if (k.pass) {
        li.querySelector('p').textContent = t('pass.from');
        li.appendChild(stateButton(`skin-${k.id}`, t('pass.button'), true));
      }
      else li.appendChild(buyButton(`skin-${k.id}`, k.cost, name, () => { save.owned.skins.push(k.id); save.skin = k.id; applyLoadout(); }));
      ui.shopList.appendChild(li);
    }
  } else if (shopTab === 'packs') {
    const owned = (id) => Array.isArray(save.iap) && (save.iap.includes(id) || (id === 'no_ads' && save.iap.includes('starter_pack')));
    for (const id of ['starter_pack', 'no_ads', 'coins_s', 'coins_m', 'coins_l']) {
      const p = PRODUCTS[id];
      if (id === 'starter_pack' && owned(id)) continue;
      const lines = `<p>${t(`iap.${id}.desc`)}</p>`;
      const li = shopRow(t(`iap.${id}`), lines, p.coins ? '<span class="coin-icon pack-coin" aria-hidden="true"></span>' : '<span class="weapon-icon w-noads" aria-hidden="true"></span>');
      if (p.kind === 'forever' && owned(id)) li.appendChild(stateButton(`iap-${id}`, t('owned'), true));
      else {
        const btn = document.createElement('button');
        btn.className = 'btn btn-buy btn-ad';
        btn.id = `iap-${id}`;
        btn.type = 'button';
        btn.innerHTML = `<span class="pack-price">${p.price}</span>`;
        btn.addEventListener('click', () => buyProduct(id));
        li.appendChild(btn);
      }
      ui.shopList.appendChild(li);
    }
  } else {
    for (const w of WEAPONS) {
      const owned = save.owned.weapons.includes(w.id);
      const locked = !owned && save.level < w.minLevel;
      const li = shopRow(t(`gun.${w.id}`), `<p>${t(`gun.${w.id}.desc`)}</p>${locked ? `<p class="next">${t('unlocksAt', { n: w.minLevel })}</p>` : ''}`,
        `<span class="weapon-icon w-${w.id}" aria-hidden="true"></span>`);
      if (save.weapon === w.id) li.appendChild(stateButton(`gun-${w.id}`, t('on'), true));
      else if (owned) li.appendChild(stateButton(`gun-${w.id}`, t('equip'), false, () => { save.weapon = w.id; }));
      else if (locked) li.appendChild(stateButton(`gun-${w.id}`, t('lv', { n: w.minLevel }), true));
      else li.appendChild(buyButton(`gun-${w.id}`, w.cost, t(`gun.${w.id}`), () => { save.owned.weapons.push(w.id); save.weapon = w.id; applyLoadout(); }));
      ui.shopList.appendChild(li);
    }
  }
}

for (const t of document.querySelectorAll('[data-tab]')) {
  t.addEventListener('click', () => {
    shopTab = t.dataset.tab;
    sfx.tap();
    renderShop();
  });
}

// Real-money products. Coins and items are granted only after the store confirms.
async function buyProduct(id) {
  const ok = await payments.buy(id);
  track('purchase', { kind: 'iap', id, granted: ok });
  if (!ok) return;
  const p = PRODUCTS[id];
  if (p.coins) save.coins += p.coins;
  if (p.skin && !save.owned.skins.includes(p.skin)) save.owned.skins.push(p.skin);
  record('skins', save.owned.skins.length);
  if (p.kind === 'forever') {
    save.iap = Array.isArray(save.iap) ? save.iap : [];
    if (!save.iap.includes(id)) save.iap.push(id);
  }
  writeSave(save);
  sfx.win();
  buzz([20, 30, 20]);
  popup(t('iap.thanks'), 'good');
  refreshWallet();
  if (!ui.shop.hidden) renderShop();
}

// Starter pack: offered once, after the third level is cleared.
// True while any popup card is on screen, so popups never stack on top of each other.
function anyModalOpen() {
  return [...document.querySelectorAll('.screen-dim, .screen-ad')].some((el) => !el.hidden);
}

function maybeOffer() {
  if (anyModalOpen() || performance.now() < 4000) return false;
  if (save.offerSeen || save.level < 4 || (Array.isArray(save.iap) && save.iap.includes('starter_pack'))) return false;
  save.offerSeen = true;
  writeSave(save);
  $('screen-offer').hidden = false;
  track('offer_shown', { id: 'starter_pack' });
  return true;
}
$('btn-offer-buy').addEventListener('click', async () => {
  $('screen-offer').hidden = true;
  await buyProduct('starter_pack');
});
$('btn-offer-no').addEventListener('click', () => { $('screen-offer').hidden = true; });

// ================================================================ feedback
function popup(text, kind = '') {
  const el = document.createElement('div');
  el.className = `popup ${kind}`;
  el.textContent = text;
  ui.popups.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
  setTimeout(() => el.remove(), 1600);
}

function buzz(pattern) {
  if (save.haptics === false) return;
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) { /* no haptics */ }
}

let wakeLock = null;
async function requestWakeLock() {
  try {
    if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {
    wakeLock = null;
  }
}
function releaseWakeLock() {
  try { wakeLock?.release(); } catch (e) { /* ignore */ }
  wakeLock = null;
}

// ================================================================ input
const drag = { active: false, id: null, startX: 0, startTarget: 0 };
const keys = { left: false, right: false };

canvas.addEventListener('pointerdown', (e) => {
  if (game.mode !== 'playing') return;
  drag.active = true;
  drag.id = e.pointerId;
  drag.startX = e.clientX;
  drag.startTarget = crowd.target;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag.active || e.pointerId !== drag.id) return;
  const dx = (e.clientX - drag.startX) / Math.max(320, window.innerWidth);
  const next = clampX(drag.startTarget + dx * RUN.steer, 0.5);
  game.dragged = (game.dragged || 0) + Math.abs(next - crowd.target);
  crowd.target = next;
});
const endDrag = (e) => {
  if (e.pointerId === drag.id) drag.active = false;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
  if ((e.key === ' ' || e.key === 'Enter') && game.mode === 'home') startLevel();
  if (e.key === 'Escape') game.mode === 'paused' ? resumeGame() : pauseGame();
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) scheduleIfAllowed(save);
  if (document.hidden) pauseGame();
});

$('btn-play').addEventListener('click', startLevel);
$('btn-next').addEventListener('click', startLevel);
$('btn-retry').addEventListener('click', startLevel);
$('btn-resume').addEventListener('click', resumeGame);
$('btn-pause').addEventListener('click', pauseGame);
$('btn-quit').addEventListener('click', () => {
  releaseWakeLock();
  goHome();
});
for (const id of ['btn-shop', 'btn-won-shop', 'btn-lost-shop']) {
  $(id).addEventListener('click', () => {
    unlockAudio();
    sfx.tap();
    renderShop();
    refreshWallet();
    game.mode = 'home';
    clearLevel();
    crowd.units.length = 0;
    setCount(12);
    show(ui.shop);
  });
}
$('btn-shop-back').addEventListener('click', goHome);
for (const id of ['btn-won-home', 'btn-lost-home']) {
  $(id).addEventListener('click', () => {
    sfx.tap();
    releaseWakeLock();
    goHome();
  });
}
ui.mute.addEventListener('click', () => {
  save.muted = !save.muted;
  setMuted(save.muted);
  writeSave(save);
  refreshWallet();
  if (!save.muted) {
    unlockAudio();
    sfx.tap();
  }
});

// ================================================================ graphics quality
// Low: no shadows and 1x resolution. Auto starts high and drops to low by itself
// if the phone cannot hold a smooth frame rate.
let shadowsOn = true;
function applyQuality(q) {
  const low = q === 'low';
  renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  if (shadowsOn === low) {
    shadowsOn = !low;
    renderer.shadowMap.enabled = shadowsOn;
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
  }
  resize();
}
const fpsWatch = { frames: 0, time: 0, decided: false };
function watchFps(dt) {
  if (fpsWatch.decided || (save.quality || 'auto') !== 'auto' || game.mode !== 'playing') return;
  fpsWatch.frames++;
  fpsWatch.time += dt;
  if (fpsWatch.time >= 5) {
    fpsWatch.decided = true;
    if (fpsWatch.frames / fpsWatch.time < 40) applyQuality('low');
  }
}

// ================================================================ resize
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 0.7 ? 62 : camera.aspect < 1 ? 56 : 48;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ================================================================ update
const lookAt = new THREE.Vector3();

// ---------------------------------------------------------------- first-time tips
const tutVec = new THREE.Vector3();
function placeTip(text, x, y, z) {
  tutVec.set(x, y, z).project(camera);
  const el = $('tut');
  $('tut-text').textContent = text;
  el.style.left = `${((tutVec.x + 1) / 2) * window.innerWidth}px`;
  el.style.top = `${((1 - tutVec.y) / 2) * window.innerHeight}px`;
  el.hidden = false;
}

// First-time guidance. Each step shows once, the first time the thing it
// explains appears, and slows the game down while the player takes it in.
const seen = () => (save.seen = save.seen || {});
function markSeen(key) {
  seen()[key] = true;
  writeSave(save);
}

function placeTipScreen(text, x, y) {
  const el = $('tut');
  $('tut-text').textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.hidden = false;
}

function updateTutorial(dt) {
  game.tutScale = 1;
  const el = $('tut');
  const active = game.mode === 'playing' || game.mode === 'bonus';
  if (!active) {
    el.hidden = true;
    return;
  }
  const s = seen();

  // 1. Drag to steer: the very first thing a new player does.
  if (!s.tutDrag && game.mode === 'playing') {
    ui.hint.hidden = false;
    ui.hint.classList.remove('fade');
    ui.hint.classList.add('teach');
    $('hint-text').textContent = t('tut.drag');
    el.hidden = true;
    game.tutScale = 0.2;
    if ((game.dragged || 0) > 1.6) {
      markSeen('tutDrag');
      ui.hint.classList.add('fade');
      setTimeout(() => ui.hint.classList.remove('teach'), 700);
      popup(t('tut.great'), 'good');
    }
    return;
  }

  // 2. Pick the better door (level 1).
  if (!s.tutDoor && game.mode === 'playing') {
    const p = gatePairs.find((q) => !q.passed && q.kind === 'gates' && !q.moving && q.z > -18);
    if (p) {
      const score = (g) => (g.spec.op === 'x' ? game.count * g.spec.val : g.spec.op === '÷' ? game.count / g.spec.val : game.count + g.value);
      const best = score(p.gates[0]) >= score(p.gates[1]) ? p.gates[0] : p.gates[1];
      placeTip(t('tut.door'), best.x, 2.7, p.z);
      if (p.z > -12) game.tutScale = 0.45;
      return;
    }
    if (gatePairs.some((q) => q.passed)) markSeen('tutDoor');
  }

  // 3. Shoot a red door to flip it.
  if (!s.tutShoot && game.mode === 'playing') {
    const p = gatePairs.find((q) => !q.passed && q.kind === 'gates' && !q.moving && q.z > -20 && q.z < -6
      && q.gates.some((g) => g.spec.op === '+' && g.value < 0));
    if (p) {
      const g = p.gates.find((x) => x.spec.op === '+' && x.value < 0);
      placeTip(t('tut.shoot'), g.x, 2.7, p.z);
      game.tutScale = 0.5;
      game.tutTimer = (game.tutTimer || 0) + dt;
      if (game.tutTimer > 1.4) { markSeen('tutShoot'); game.tutTimer = 0; }
      return;
    }
  }

  // 4. Enemies: the army shoots by itself; line up with them.
  if (!s.tutEnemy && game.mode === 'playing') {
    const sq = squads.find((q) => q.z > -20 && q.z < -6 && q.alive > 0);
    if (sq) {
      placeTip(t('tut.enemy'), sq.x, 1.9, sq.z);
      game.tutScale = 0.4;
      game.tutTimer = (game.tutTimer || 0) + dt;
      if (game.tutTimer > 0.9) { markSeen('tutEnemy'); game.tutTimer = 0; }
      return;
    }
  }

  // 5. Boss attacks: step out of the red circle.
  if (!s.tutBoss && game.mode === 'playing' && slams.length) {
    const sl = slams[0];
    placeTip(t('tut.boss'), sl.x, 0.6, sl.z);
    game.tutScale = 0.35;
    if (sl.t > sl.dur * 0.9) markSeen('tutBoss');
    return;
  }

  // 5b. Boss fists: step out of the red zone.
  if (!s.tutPunch && game.mode === 'playing' && boss && boss.punch && (boss.punch.phase === 'up' || boss.punch.phase === 'leap')) {
    const p = boss.punch;
    placeTip(t('tut.punch'), p.x, 0.6, (p.phase === 'leap' ? p.to : boss.z) + p.reach * 0.6);
    game.tutScale = 0.35;
    if (p.t > p.dur * 0.9) markSeen('tutPunch');
    return;
  }

  // 6. Bonus tiles: a bigger army climbs higher.
  if (!s.tutBonus && game.mode === 'bonus') {
    placeTipScreen(t('tut.bonus'), window.innerWidth / 2, window.innerHeight * 0.32);
    game.tutTimer = (game.tutTimer || 0) + dt;
    if (game.tutTimer > 2.6) { markSeen('tutBonus'); game.tutTimer = 0; }
    return;
  }

  el.hidden = true;
}

// After the first win, point at the shop once.
function homeTip() {
  if (seen().tutShop || save.level < 2 || anyModalOpen()) return;
  const btn = $('btn-shop');
  const r = btn.getBoundingClientRect();
  if (!r.width) return;
  placeTipScreen(t('tut.shop'), r.left + r.width / 2, r.top - 6);
  const done = () => {
    $('tut').hidden = true;
    markSeen('tutShop');
    window.removeEventListener('pointerdown', done, true);
  };
  window.addEventListener('pointerdown', done, true);
}

function applyGate(pair) {
  if (pair.moving) {
    const g = pair.gates[0];
    if (Math.abs(crowd.x - g.x) > g.w / 2 + 0.15) {
      popup(t('missed'), 'bad');
      sfx.gateBad();
      return;
    }
  }
  const gate = pair.moving ? pair.gates[0] : crowd.x < 0 ? pair.gates[0] : pair.gates[1];
  const other = pair.moving ? pair.gates[0] : crowd.x < 0 ? pair.gates[1] : pair.gates[0];
  other.panel.visible = false;
  gate.panel.visible = false;
  const tone = gateLabel(gate, pair.kind).tone;
  const confetti = tone === 'good' ? [sparkMats.ally, sparkMats.fire[2]] : tone === 'gun' ? sparkMats.fire : [sparkMats.enemy, sparkMats.barrel];
  burst(gate.x, 1.3, pair.z, 26, confetti, 5, [0.08, 0.18]);
  flash(tone === 'bad' ? 'bad' : 'good');
  const s = gate.spec;
  const wasMystery = s.op === '?';
  let good = true;
  if (pair.kind === 'weapon') {
    if (s.kind === 'rate') game.rate *= 1 + s.val;
    else game.dmg *= 1 + s.val;
    good = s.val > 0;
    popup(`${t(s.kind === 'rate' ? 'gate.rate' : 'gate.dmg').toLocaleLowerCase(getLang())} ${s.label}`, good ? 'gun' : 'bad');
  } else {
    const before = game.count;
    if (s.op === '?') {
      // Mystery door: could be great, could be awful. Very on brand.
      const r = Math.random();
      const big = 8 + game.level * 3;
      const outcome = r < 0.4 ? { op: '+', v: big * 2 } : r < 0.65 ? { op: 'x', v: 2 } : r < 0.85 ? { op: '+', v: -big } : { op: '÷', v: 2 };
      s.op = outcome.op;
      s.val = outcome.v;
      gate.value = outcome.v;
      seeObstacle('mystery', t('new.mystery'));
      bump('mysteries');
    }
    // Not a fake ad: x2 means exactly twice the army.
    if (s.op === 'x') setCount(game.count * s.val);
    else if (s.op === '÷') setCount(Math.ceil(game.count / s.val));
    else setCount(game.count + Math.round(gate.value));
    good = game.count >= before;
    const diff = Math.round(game.count - before);
    popup(`${wasMystery ? '? ' : ''}${diff >= 0 ? `+${fmt(diff)}` : fmt(diff)}`, good ? 'good' : 'bad');
  }
  if (good && pair.kind === 'gates') mission('doors');
  if (good) {
    sfx.gateGood();
    buzz(15);
  } else {
    sfx.gateBad();
    buzz(50);
    game.shake = 0.25;
  }
  if (game.count <= 0) loseLevel('lose.door');
}

function update(dt) {
  if (game.mode === 'paused') return;
  game.time += dt;
  const playing = game.mode === 'playing';

  // ---- forward motion
  let target = RUN.idleSpeed;
  if (playing) target = boss && boss.z > -BOSS.stopDist ? 0 : RUN.speed;
  if (game.mode === 'won' || game.mode === 'lost') target = 0;
  if (game.mode === 'bonus') target = game.bonus.done ? 0 : RUN.speed * 0.85;
  game.speed += (target - game.speed) * Math.min(1, dt * 3);
  const dz = game.speed * dt;
  if (playing) game.traveled += dz;

  // ---- steering
  if (playing || game.mode === 'bonus') {
    const k = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (k) crowd.target = clampX(crowd.target + k * 8 * dt, 0.5);
  } else if (game.mode === 'home') {
    crowd.target = Math.sin(game.time / 1.6) * 1.2;
  }
  crowd.x += (crowd.target - crowd.x) * (1 - Math.exp(-14 * dt));

  // ---- events from the level plan
  if (playing && game.plan) {
    const evs = game.plan.events;
    while (game.nextEvent < evs.length && evs[game.nextEvent].d - game.traveled <= SPAWN_DIST) {
      const ev = evs[game.nextEvent++];
      const z = -(ev.d - game.traveled);
      if (ev.type === 'gates' || ev.type === 'weapon') spawnGatePair(ev, z);
      else if (ev.type === 'squad') spawnSquad(ev, z);
      else if (ev.type === 'barrels') spawnBarrels(ev, z);
      else if (ev.type === 'boss') spawnBoss(ev, z);
      else if (ev.type === 'saw') spawnSaws(ev, z);
      else if (ev.type === 'turret') spawnTurret(ev, z);
      else if (ev.type === 'finish') game.finishAt = ev.d;
    }
    ui.progress.style.transform = `scaleX(${Math.min(1, game.traveled / game.plan.length)})`;
  }

  // Gold rush ends without a boss: straight onto the multiplier tiles.
  if (playing && game.finishAt && game.traveled >= game.finishAt) {
    game.finishAt = 0;
    startBonus();
  }

  // ---- scenery
  trackTex.offset.y += dz / 4;
  game.nextDecorZ += dz;
  while (game.nextDecorZ > -SPAWN_DIST - 20) {
    spawnDecor(game.nextDecorZ);
    game.nextDecorZ -= rand(3, 7);
  }
  for (let i = decor.active.length - 1; i >= 0; i--) {
    const m = decor.active[i];
    m.position.z += dz * 0.9;
    m.rotation.y += m.userData.spin * dt;
    if (m.position.z > DESPAWN_Z + 6) decor.release(m);
  }

  const R = crowdRadius();

  updateTutorial(dt);

  // ---- gates
  for (let i = gatePairs.length - 1; i >= 0; i--) {
    const p = gatePairs[i];
    p.z += dz;
    p.group.position.z = p.z;
    if (p.moving && !p.passed) {
      const g = p.gates[0];
      g.x = Math.sin(game.time * p.freq * 1.6) * (HALF_W / 2);
      g.node.position.x = g.x;
    }
    if (playing && !p.passed && p.z >= 0) {
      p.passed = true;
      applyGate(p);
    }
    if (p.z > DESPAWN_Z) {
      trash(p.group);
      gatePairs.splice(i, 1);
    }
  }

  // ---- barrels
  for (let i = barrels.length - 1; i >= 0; i--) {
    const b = barrels[i];
    b.z += dz;
    b.group.position.z = b.z;
    if (b.hitFlash > 0) {
      b.hitFlash -= dt;
      b.group.scale.setScalar(1 + b.hitFlash * 0.6);
    }
    if (b.kind === 'turret' && b.hp > 0) {
      b.head.rotation.y = Math.atan2(crowd.x - b.x, -b.z);
      b.light.visible = Math.sin(game.time * 12) > 0 || b.fireIn > 0.4;
      if (playing && b.z > -28 && b.z < -2) {
        b.fireIn -= dt;
        if (b.fireIn <= 0) {
          b.fireIn = Math.max(0.8, 1.6 - game.level * 0.04);
          fireShot(b);
        }
      }
    }
    let gone = false;
    if (b.hp <= 0) {
      if (b.kind !== 'turret') mission('barrels');
      burst(b.x, 0.6, b.z, 16, sparkMats.fire, 6);
      sfx.boom();
      sfx.coin();
      game.coinsRun += b.reward;
      ui.runCoins.textContent = fmt(game.coinsRun);
      popup(t('coinsPlus', { n: b.reward }), 'gun');
      gone = true;
    } else if (playing && b.z > -R - 0.35 && b.z < R + 0.4 && Math.abs(b.x - crowd.x) < R + 0.45) {
      const loss = Math.min(game.count, 4 + game.level);
      setCount(game.count - loss);
      burst(b.x, 0.6, b.z, 16, sparkMats.fire, 6);
      sfx.boom();
      game.shake = 0.35;
      buzz(60);
      popup(`-${loss}`, 'bad');
      gone = true;
      if (game.count <= 0) loseLevel(b.kind === 'turret' ? 'lose.turret' : 'lose.barrel');
    } else if (b.z > DESPAWN_Z) {
      gone = true;
    }
    if (gone) {
      trash(b.group);
      barrels.splice(i, 1);
    }
  }

  // ---- enemy squads
  let enemyDrawn = 0;
  let shieldsDrawn = 0;
  enemyMesh.begin();
  const enemyStride = playing ? 1 : 0.3;
  for (let i = squads.length - 1; i >= 0; i--) {
    const s = squads[i];
    const close = s.z > -ENEMY.aggroDist;
    s.z += dz + (close && playing ? ENEMY.walk * dt : 0);
    if (close && playing) s.x += Math.sign(crowd.x - s.x) * Math.min(Math.abs(crowd.x - s.x), 0.7 * dt);
    let alive = 0;
    let power = 0;
    let sx = 0;
    for (const u of s.units) {
      if (!u.alive) continue;
      const ux = clampX(s.x + u.ox);
      const uz = s.z + u.oz;
      const reach = u.giant ? 0.75 : 0.3;
      if (playing && uz > -R * 0.75 - 0.15 - (u.giant ? 0.5 : 0) && uz < R && Math.abs(ux - crowd.x) < R + reach) {
        u.alive = false;
        setCount(game.count - (u.giant ? 6 + Math.floor(game.level / 5) : (u.armored ? 2 : 1) * (u.w || 1)));
        if (u.giant) { game.shake = 0.35; burst(ux, 0.8, uz, 14, [sparkMats.enemy, sparkMats.ally], 5); }
        corpse(ux, uz, 'enemy', 0.9);
        mission('kill');
        burst(ux, 0.4, uz, 3, [sparkMats.enemy, sparkMats.ally], 3);
        sfx.hit();
        game.shake = Math.max(game.shake, 0.12);
        if (game.count <= 0) {
          loseLevel('lose.squad');
        }
        continue;
      }
      if (uz > DESPAWN_Z) {
        u.alive = false;
        continue;
      }
      alive++;
      power += u.w || 1;
      sx += ux;
      if (enemyDrawn < ENEMY_DRAW_MAX) {
        const sc = u.giant ? 2.3 : u.armored ? 1.18 : 1;
        enemyMesh.add(ux, uz, Math.PI, sc, game.time * (u.giant ? 7 : 11) + u.phase, enemyStride,
          u.giant ? HEAD_GIANT : u.armored ? HEAD_HELMET : null);
        enemyDrawn++;
        if (u.shield && shieldsDrawn < 600) {
          dummy.position.set(ux, 0, uz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          shieldPlates.setMatrixAt(shieldsDrawn++, dummy.matrix);
        }
      }
    }
    s.alive = alive;
    if (alive === 0) {
      trash(s.label);
      squads.splice(i, 1);
      continue;
    }
    s.label.position.set(sx / alive, 1.35, s.z - 0.2);
    s.label.userData.set(power, '#ffd2cc');
  }
  shieldPlates.count = shieldsDrawn;
  shieldPlates.instanceMatrix.needsUpdate = true;
  enemyMesh.end();

  // ---- saw blades
  for (let i = saws.length - 1; i >= 0; i--) {
    const sw = saws[i];
    sw.z += dz;
    sw.x = Math.max(-HALF_W + sw.r, Math.min(HALF_W - sw.r, Math.sin(game.time * sw.freq + sw.phase) * sw.amp));
    sw.group.position.z = sw.z;
    sw.blade.position.x = sw.hub.position.x = sw.x;
    sw.blade.rotation.z -= dt * 14;
    if (playing && Math.abs(sw.z) < R + 0.5) {
      let inside = 0;
      for (const u of crowd.units) {
        const ux = clampX(crowd.x + u.ox);
        if (Math.abs(ux - sw.x) < sw.r * 0.85 && Math.abs(u.oz - sw.z) < 0.35) inside++;
      }
      if (inside && sw.taken < sw.cap) {
        sw.acc += Math.min(inside, 6) * 5 * dt;
        if (sw.acc >= 1) {
          const n = Math.min(Math.floor(sw.acc), sw.cap - sw.taken);
          sw.acc -= Math.floor(sw.acc);
          sw.taken += n;
          setCount(game.count - n);
          burst(sw.x, 0.4, sw.z, 4, sparkMats.fire, 4);
          sfx.hit();
          game.shake = Math.max(game.shake, 0.15);
          if (game.count <= 0) loseLevel('lose.saw');
        }
      }
    }
    if (sw.z > DESPAWN_Z) {
      trash(sw.group);
      saws.splice(i, 1);
    }
  }

  // ---- turret shots
  for (let i = shots.length - 1; i >= 0; i--) {
    const sh = shots[i];
    sh.x += sh.vx * dt;
    sh.z += sh.vz * dt + dz;
    sh.mesh.position.set(sh.x, 0.75, sh.z);
    let gone = sh.z > DESPAWN_Z || Math.abs(sh.x) > HALF_W + 1;
    if (!gone && playing && Math.abs(sh.z) < R * 0.8 + 0.2 && Math.abs(sh.x - crowd.x) < R + 0.15) {
      const loss = Math.min(game.count, 1 + Math.floor(game.level / 4));
      setCount(game.count - loss);
      burst(sh.x, 0.6, sh.z, 12, sparkMats.fire, 5);
      sfx.boom();
      game.shake = Math.max(game.shake, 0.25);
      popup(`-${loss}`, 'bad');
      gone = true;
      if (game.count <= 0) loseLevel('lose.turretShot');
    }
    if (gone) {
      trash(sh.mesh);
      shots.splice(i, 1);
    }
  }

  // ---- boss
  if (boss) {
    if (!boss.dead) {
      if (boss.punch && boss.punch.phase === 'leap') {
        // handled in updatePunch: the boss is in the air
      } else if (boss.charge) {
        updateCharge(dt, R);
      } else if (boss.z > -BOSS.stopDist && playing) {
        if (!boss.contact) boss.z += BOSS.walk * dt;
      } else {
        boss.z += dz;
      }
      if (!boss.charge && !boss.punch) boss.x += (crowd.x * 0.5 - boss.x) * Math.min(1, dt * 0.8);
      updateShield(dt);
      const stomp = game.time * (boss.contact ? 9 : 4);
      if (boss.punch) {
        updatePunch(dt);
      } else {
        boss.armL.rotation.x = Math.sin(stomp) * 0.7;
        boss.armR.rotation.x = -Math.sin(stomp) * 0.7;
      }
      boss.group.position.set(boss.x, Math.abs(Math.sin(stomp)) * 0.12 + (boss.hop || 0), boss.z);
      if (boss.flash > 0) {
        boss.flash -= dt;
        boss.mat.emissive.setRGB(boss.flash * 2, boss.flash * 2, boss.flash * 2);
      }
      boss.label.userData.set(boss.hp, boss.max);
      if (!boss.introduced && playing && boss.z > -BOSS.stopDist - 3) {
        boss.introduced = true;
        showBanner(t(boss.big ? 'special.boss' : 'bossFight'));
        setMusicIntensity(2);
        sfx.roar();
        game.shake = 0.4;
        buzz(80);
      }
      if (playing && !boss.charge && boss.z > -R - (boss.big ? 1.9 : 1.1)) {
        boss.contact = true;
        game.crushAcc += BOSS.crushRate * (1 + game.level * 0.15) * dt;
        if (game.crushAcc >= 1) {
          const n = Math.floor(game.crushAcc);
          game.crushAcc -= n;
          setCount(game.count - n);
          sfx.hit();
          game.shake = Math.max(game.shake, 0.18);
          if (game.count <= 0) loseLevel('lose.boss');
        }
      }
      // Each world's boss has its own move, mixed with the rock throw.
      const inReach = boss.z > -punchReach() + 0.6;
      // The fight opens with a leap: the boss jumps at the army with its fists raised
      // and smashes down where it lands. The red zone shows the landing spot.
      if (playing && !boss.charge && !boss.leapt && !boss.punch && boss.z > -24) startLeap();
      if (playing && !boss.charge && inReach) {
        if (!boss.punch) {
          boss.punchIn = (boss.punchIn ?? 0.3) - dt;
          if (boss.punchIn <= 0) startPunch();
        }
      } else if (playing && !boss.charge && !boss.punch && boss.z > -BOSS.slamRange) {
        boss.slamIn -= dt;
        if (boss.slamIn <= 0) {
          boss.slamIn = Math.max(BOSS.slamMin, BOSS.slamEvery - game.level * 0.08) * (boss.big ? 0.75 : 1);
          bossAttack();
        }
      }
      if (boss.hp <= 0 && playing) {
        boss.dead = true;
        for (const sl of slams) trash(sl.group, sl.rock);
        slams = [];
        if (boss.punch) { trash(boss.punch.zone); boss.punch = null; }
        for (const w of iceWalls) trash(w.group);
        iceWalls = [];
        if (boss.shieldMesh) boss.shieldMesh.visible = false;
        burst(boss.x, 1.5, boss.z, 50, [...sparkMats.fire, sparkMats.enemy], 8, [0.1, 0.3]);
        sfx.boom();
        game.shake = 0.6;
        boss.group.visible = false;
        game.slowmo = 1.3;
        sfx.bigBoom();
        mission('boss');
        if (boss.big) bump('worldBosses');
        flash('good');
        startBonus();
      }
    }
  }

  if (game.mode === 'bonus' && game.bonus) updateBonus(dt, dz);

  // ---- ice walls
  for (let i = iceWalls.length - 1; i >= 0; i--) {
    const w = iceWalls[i];
    w.z += dz + 8 * dt;
    w.group.position.z = w.z;
    if (!w.hit && playing && w.z > -0.3) {
      w.hit = true;
      const units = crowd.units;
      let inside = 0;
      for (const u of units) if (Math.abs(clampX(crowd.x + u.ox) - w.gapX) > w.gapHalf) inside++;
      if (inside && units.length) {
        const loss = Math.max(1, Math.round(game.count * (inside / units.length) * 0.5));
        setCount(game.count - loss);
        burst(crowd.x, 0.6, 0, 18, sparkMats.ice, 5);
        sfx.boom();
        game.shake = 0.35;
        popup(`-${fmt(loss)}`, 'bad');
        if (game.count <= 0) loseLevel('lose.ice');
      } else {
        popup(t('dodged'), 'good');
    bump('dodges');
      }
    }
    if (w.z > DESPAWN_Z) {
      trash(w.group);
      iceWalls.splice(i, 1);
    }
  }

  // ---- boss slams
  for (let i = slams.length - 1; i >= 0; i--) {
    const sl = slams[i];
    sl.t += dt;
    sl.z += dz;
    const k = Math.min(1, sl.t / sl.dur);
    sl.group.position.set(sl.x, 0.03, sl.z);
    sl.fill.scale.setScalar(sl.r * k);
    sl.fill.material.opacity = 0.18 + 0.25 * k;
    sl.ring.material.opacity = 0.55 + 0.45 * Math.abs(Math.sin(sl.t * 14));
    // The rock arcs from the boss's hands to the target.
    sl.rock.position.set(
      sl.fromX + (sl.x - sl.fromX) * k,
      2.6 + Math.sin(k * Math.PI) * 4 - 2.4 * k,
      sl.fromZ + (sl.z - sl.fromZ) * k
    );
    sl.rock.rotation.x += dt * 6;
    sl.rock.rotation.z += dt * 4;
    if (k >= 1) {
      if (game.mode === 'playing') slamImpact(sl);
      trash(sl.group);
      trash(sl.rock);
      slams.splice(i, 1);
    }
  }

  // ---- shooting
  const shooting = (playing || game.mode === 'home') && game.count > 0;
  if (shooting) {
    const w = game.weapon || WEAPONS[0];
    const volleysMax = GUN.maxEmit / w.pellets;
    const emitRate = Math.min(volleysMax, game.count * game.rate);
    const dps = game.count * game.rate * game.dmg;
    const perPellet = dps / emitRate / w.pellets;
    game.emitAcc += emitRate * dt;
    while (game.emitAcc >= 1 && bullets.length < 250) {
      game.emitAcc -= 1;
      const units = crowd.units;
      // any soldier may fire, so the whole front (edges included) shoots
      const u = units.length ? units[Math.floor(Math.random() * units.length)] : { ox: 0, oz: 0 };
      for (let k = 0; k < w.pellets; k++) {
        const spread = w.pellets > 1 ? ((k / (w.pellets - 1)) * 2 - 1) * w.spread : rand(-1, 1) * w.spread;
        bullets.push({ x: clampX(crowd.x + u.ox) + 0.12, z: u.oz - 0.3, dmg: perPellet, vx: spread * GUN.bulletSpeed * 0.25, range: w.range });
      }
      if (playing) sfx.shoot();
    }
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const prevZ = b.z;
    b.z += dz - GUN.bulletSpeed * dt;
    b.x += (b.vx || 0) * dt;
    let dead = b.z < -(b.range || GUN.range) || Math.abs(b.x) > HALF_W + 0.5;
    if (!dead && playing) dead = bulletHits(b, prevZ);
    if (dead) bullets.splice(i, 1);
  }

  // ---- draw crowd
  const units = crowd.units;
  allyMesh.begin();
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const k = 1 - Math.exp(-8 * dt);
    u.ox += (u.tx - u.ox) * k;
    u.oz += (u.tz - u.oz) * k;
    const x = clampX(crowd.x + u.ox);
    allyMesh.add(x, u.oz, 0, 1, game.time * 12 + u.phase, Math.min(1, game.speed / 4));
  }
  allyMesh.end();

  countLabel.visible = game.mode !== 'home' && game.mode !== 'won' && game.count > 0;
  countLabel.position.set(crowd.x, 1.0 + R * 0.35, -R * 0.2);
  countLabel.userData.set(fmt(game.count));

  // ---- draw bullets
  bulletMesh.count = Math.min(bullets.length, 256);
  for (let i = 0; i < bulletMesh.count; i++) {
    dummy.position.set(bullets[i].x, 0.6, bullets[i].z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, game.weapon ? game.weapon.len : 1);
    dummy.updateMatrix();
    bulletMesh.setMatrixAt(i, dummy.matrix);
    bulletGlow.setMatrixAt(i, dummy.matrix);
  }
  bulletMesh.instanceMatrix.needsUpdate = true;
  bulletGlow.count = bulletMesh.count;
  bulletGlow.instanceMatrix.needsUpdate = true;

  // ---- flying bodies
  for (let i = corpses.active.length - 1; i >= 0; i--) {
    const m = corpses.active[i];
    const u = m.userData;
    u.life -= dt;
    if (u.life <= 0) {
      corpses.release(m);
      continue;
    }
    u.v.y -= 18 * dt;
    m.position.addScaledVector(u.v, dt);
    m.position.z += dz;
    if (m.position.y < 0) {
      m.position.y = 0;
      u.v.y *= -0.3;
      u.v.x *= 0.6;
      u.spin.multiplyScalar(0.6);
    }
    m.rotation.x += u.spin.x * dt;
    m.rotation.y += u.spin.y * dt;
    m.rotation.z += u.spin.z * dt;
    m.scale.setScalar(Math.min(1, u.life / 0.3));
  }

  // ---- sparks
  for (let i = sparks.active.length - 1; i >= 0; i--) {
    const s = sparks.active[i];
    const u = s.userData;
    u.life -= dt;
    if (u.life <= 0) {
      sparks.release(s);
      continue;
    }
    u.v.y -= 20 * dt;
    s.position.addScaledVector(u.v, dt);
    s.position.z += dz;
    if (s.position.y < 0.04) {
      s.position.y = 0.04;
      u.v.y *= -0.3;
      u.v.x *= 0.7;
    }
    s.rotation.x += dt * 8;
    s.rotation.y += dt * 6;
    s.scale.setScalar(u.size * (u.life / u.max));
  }

  // ---- end screens after a short beat
  if (game.mode === 'won' || game.mode === 'lost') {
    game.endTimer += dt;
    if (game.endTimer > 1.1 && ui.won.hidden && ui.lost.hidden) show(game.mode === 'won' ? ui.won : ui.lost);
  }

  // ---- camera
  game.shake = Math.max(0, game.shake - dt * 1.5);
  const sh = game.shake * game.shake;
  const pull = Math.min(R, 3) * 0.9;
  camera.position.set(crowd.x * 0.35 + rand(-1, 1) * sh, 6.6 + pull + rand(-1, 1) * sh, 7.4 + pull);
  lookAt.set(crowd.x * 0.35, 0, -7.5);
  camera.lookAt(lookAt);
}

// Swept bullet test against everything shootable. Returns true when the bullet is used up.
function bulletHits(b, prevZ) {
  const zMin = b.z;
  const zMax = prevZ;
  const within = (z, r) => z + r >= zMin && z - r <= zMax;

  if (boss && !boss.dead && Math.abs(b.x - boss.x) < (boss.big ? 2 : 1.25) && within(boss.z, boss.big ? 1.2 : 0.8)) {
    if (boss.shieldOn) {
      burst(b.x, 1.2, boss.z + 1.4, 1, sparkMats.fire[2], 3);
      return true;
    }
    boss.hp -= b.dmg;
    boss.flash = 0.12;
    return true;
  }

  for (const s of squads) {
    if (!within(s.z, 3)) continue;
    for (const u of s.units) {
      if (!u.alive) continue;
      const ux = clampX(s.x + u.ox);
      const uz = s.z + u.oz;
      const hw = u.giant ? 0.65 : 0.3;
      if (Math.abs(ux - b.x) < hw && within(uz, u.giant ? 0.5 : 0.3)) {
        if (u.shield) {
          // The plate blocks the bullet; only a quarter of it gets through.
          u.hp -= b.dmg * 0.25;
          if (u.hp <= 0) {
            u.alive = false;
            corpse(ux, uz, 'enemy', 0.8);
            mission('kill');
          } else if (Math.random() < 0.3) burst(ux, 0.5, uz + 0.25, 1, sparkMats.fire[2], 2);
          return true;
        }
        const used = Math.min(u.hp, b.dmg);
        u.hp -= used;
        b.dmg -= used;
        if (u.hp <= 0) {
          u.alive = false;
          corpse(ux, uz, 'enemy', 0.8);
          mission('kill');
        }
        if (b.dmg <= 0.001) return true;
      }
    }
  }

  for (const br of barrels) {
    if (Math.abs(br.x - b.x) < 0.5 && within(br.z, 0.45)) {
      br.hp -= b.dmg;
      br.hitFlash = 0.08;
      br.label.userData.set(br.hp, br.max);
      return true;
    }
  }

  for (const p of gatePairs) {
    if (p.passed || !within(p.z, 0.15)) continue;
    for (const g of p.gates) {
      if (Math.abs(b.x - g.x) > g.w / 2) continue;
      if (p.kind === 'gates' && g.spec.op === '+') {
        // The classic: shoot a door to raise its number.
        const gain = 0.32 / Math.sqrt(Math.max(1, game.count));
        const before = Math.round(g.value);
        // Shooting can raise a door only so far, so huge armies don't snowball.
        const cap = Math.max(g.spec.val, 0) + 15 + game.level * 5;
        g.value = Math.min(cap, g.value + b.dmg * gain);
        if (Math.round(g.value) !== before) {
          drawGate(g, p.kind);
          if (before < 0 && Math.round(g.value) >= 0) {
            sfx.gateGood();
            mission('flip');
          }
          else sfx.tick();
        }
      }
      return true;
    }
  }
  return false;
}

// ================================================================ loop
let last = performance.now();
function frame(now) {
  const realDt = (now - last) / 1000;
  const dt = Math.min(1 / 30, realDt);
  last = now;
  watchFps(realDt);
  // Slow motion runs on real time so it always lasts the same.
  const scale = game.slowmo > 0 ? 0.3 : (game.tutScale || 1);
  game.slowmo = Math.max(0, game.slowmo - dt);
  for (let i = 0; i < game.steps; i++) update(dt * scale);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

for (let z = 6; z > -SPAWN_DIST - 20; z -= rand(3, 7)) spawnDecor(z);
game.nextDecorZ = -SPAWN_DIST - 20;
ui.music.addEventListener('click', () => {
  save.music = save.music === false;
  setMusicEnabled(save.music);
  writeSave(save);
  unlockAudio();
  startMusic();
  refreshWallet();
});

// Browsers only allow sound after a tap; start the menu music on the first one.
window.addEventListener('pointerdown', () => {
  unlockAudio();
  startMusic();
}, { once: true });

$('btn-lang').addEventListener('click', () => {
  setLang(getLang() === 'tr' ? 'en' : 'tr');
  sfx.tap();
  refreshWallet();
});

// ---------------------------------------------------------------- playtest stats
function renderStats() {
  const st = getStats();
  const rows = Object.keys(st.levels).map(Number).sort((a, b) => a - b).map((lv) => {
    const r = st.levels[lv];
    const top = Object.entries(r.reasons).sort((a, b) => b[1] - a[1])[0];
    return `<tr><td>${lv}</td><td>${r.starts}</td><td>${r.wins}</td><td>${r.fails}</td><td>${top ? t(top[0]) : '—'}</td></tr>`;
  }).join('');
  $('stats-body').innerHTML = rows || `<tr><td colspan="5">${t('stats.empty')}</td></tr>`;
  $('stats-sessions').textContent = t('stats.sessions', { n: st.sessions });
}
let logoTaps = [];
$('logo').addEventListener('click', () => {
  const now = performance.now();
  logoTaps = logoTaps.filter((x) => now - x < 2500);
  logoTaps.push(now);
  if (logoTaps.length >= 5) {
    logoTaps = [];
    renderStats();
    $('screen-stats').hidden = false;
  }
});
$('btn-stats-close').addEventListener('click', () => { $('screen-stats').hidden = true; });
$('btn-stats-reset').addEventListener('click', () => { resetStats(); renderStats(); });

payments.attachSave(save);
const settings = createSettings({
  save, writeSave, sfx, payments, applyQuality, popup, track,
});

const account = createAccount({
  save, writeSave, sfx, track, popup, refreshWallet, fmt, anyModalOpen,
  backToSettings: () => { settings.render(); $('account-state').textContent = account.label(); $('screen-settings').hidden = false; },
});
$('btn-settings').addEventListener('click', () => { $('account-state').textContent = account.label(); });
$('btn-account').addEventListener('click', () => {
  sfx.tap();
  $('screen-settings').hidden = true;
  account.open('settings');
});

meta = createMeta({
  save, writeSave, sfx, buzz, refreshWallet, ads, payments, track, fmt,
  skinName: (id) => t(`skin.${id}`),
  skinColors: (id) => {
    const k = skinById(id);
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    return { body: hex(k.body), head: hex(k.head) };
  },
});

missions = createMissions({
  save, writeSave, fmt, sfx, buzz, refreshWallet, track, popup,
  addPassXp: (n) => { meta.addXp(n); record('passTier', meta.currentTier()); },
});

achievements = createAchievements({ save, writeSave, sfx, track, fmt });
const wheel = createWheel({
  save, writeSave, ads, sfx, buzz, refreshWallet, track, fmt,
  addPassXp: (n) => { meta.addXp(n); record('passTier', meta.currentTier()); },
  onPrize: (p) => { if (p.jackpot) bump('jackpots'); },
});
// Catch up records that existed before achievements did.
record('weapons', save.owned.weapons.length);
record('skins', save.owned.skins.length);
record('bestLevel', save.level);
record('passTier', meta.currentTier());

// the other game of the series
$('promo-img').src = promoIcon;
$('btn-promo').addEventListener('click', () => { unlockAudio(); sfx.tap(); track('promo_click', { game: 'tower' }); openLink(storeLink('tower')); });
track('session_start', { lang: getLang() });
applyStatic();
applyLoadout();
goHome();
applyQuality(save.quality || 'auto');
// First launch asks about ads once; the daily reward waits until that is answered.
// Launch order: ad consent (first time only), daily reward, then the free spin.
const openWelcome = () => { if (!meta.openDailyIfReady()) wheel.openIfFree(); };
// Opening screen first (and the how-it-works pages on the very first launch), then the rest.
const firstLaunch = save.level <= 1;
const obArt = nfaArt();
runOpening({
  key: 'nfa',
  logo: '<h1 class="logo">Not a<br><span class="strike">Fake</span> Ad</h1>',
  pages: [1, 2, 3, 4].map((i) => ({ art: obArt[i - 1], title: t(`ob.${i}.t`), body: t(`ob.${i}.b`) })),
  str: { presents: t('ob.presents'), notFake: t('ob.notfake'), skip: t('ob.skip'), next: t('ob.next'), start: t('ob.start') },
  onboard: firstLaunch,
  onTap: () => unlockAudio(),
}).then(({ onboarded }) => {
  track('opening_done', { onboarded });
  setTimeout(() => {
    if (!settings.askConsentIfNeeded()) openWelcome();
  }, 300);
});
for (const id of ['btn-daily-claim', 'btn-daily-double']) {
  $(id).addEventListener('click', () => setTimeout(() => {
    if (save.daily) record('bestStreak', save.daily.streak || 0);
    if ($('screen-daily').hidden) wheel.openIfFree();
  }, 500));
}
for (const id of ['btn-consent-yes', 'btn-consent-later']) {
  $(id).addEventListener('click', () => setTimeout(() => {
    if ($('screen-settings').hidden) openWelcome();
  }, 300));
}
requestAnimationFrame(frame);

// Test hook for automated balance runs; harmless in production.
window.__game = { game, crowd, setCount: (n) => setCount(n), bullets: () => bullets, get boss() { return boss; }, gatePairs: () => gatePairs, squads: () => squads, barrels: () => barrels, slams: () => slams, bonus: () => game.bonus, saws: () => saws, shots: () => shots, lose: (r) => loseLevel(r), save, mem: () => ({ ...renderer.info.memory }),
  account: () => account,
  lang: (l) => { setLang(l); ui.level.textContent = levelTitle(game.level); refreshWallet(); },
};
