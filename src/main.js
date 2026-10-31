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
import { buildLevel, levelKind, buildBossWeekLevel, levelDef } from './level.js';
import { slot as formationSlot, LANE, BOSS_RULES, opText, goalMet } from './rules.js';
import { createProps, SHARED as PROP_SHARED, makeKeyMesh } from './props.js';
import { HAND_LEVELS } from './levels.js';
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
import { t, getLang, setLang, applyStatic, nextLang } from './i18n.js';
import { track, getStats, resetStats } from './analytics.js';
import { startTelemetry } from './telemetry.js';
import { storeLink, openLink } from './promo.js';
import { runOpening } from './opening.js';
import { nfaArt } from './onboard-art.js';
import promoIcon from '../assets/promo-tower-128.webp';
import promoIcon2 from '../assets/promo-choices-128.webp';
import { createRemote } from './remote.js';
import { createReview } from './review.js';
import { makeCard, shareCanvas } from './share.js';
import { createLeaderboard } from './leaderboard.js';
import { createCrossRewards } from './crossreward.js';
import { createInterstitials } from './interstitial.js';
import { adPrivacy as admobApi } from './ads.js';
import { createAutoQuality, TIERS as QUALITY_TIERS } from './perf.js';
import { createCards } from './cards.js';
import { createSeason } from './season.js';
import { createBossWeek } from './bossweek.js';
const CLOUD = typeof __CLOUD__ !== 'undefined' && __CLOUD__;
const remote = createRemote('nfa', { enabled: CLOUD, defaults: { coin_mult: 1, enemy_mult: 1 } });
remote.refresh();
const enemyMult = () => remote.num('enemy_mult', 1, 0.4, 2.5);

// anonymous play statistics (phone app only)
startTelemetry({ game: 'nfa', version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev', enabled: typeof __CLOUD__ !== 'undefined' && __CLOUD__, lang: () => document.documentElement.lang });

const ads = createAds({ skipAds: () => Array.isArray(save.iap) && (save.iap.includes('no_ads') || save.iap.includes('starter_pack')) });
const payments = createPayments();
let meta = null; // created once the rest of the game is defined
let missions = null;
let achievements = null;
let cards = null; // card album, Boss Week and the Christmas season: created with the rest of the menus
let bossWeek = null;
let season = null;
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
  const thick = ['shotgun', 'minigun', 'rocket', 'flamer'].includes(w.id) ? 0.085 : 0.055;
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
// Runners, splitters and medics: one more set of figures whose bodies are colored per enemy,
// plus small flat marks (headbands, the split seam, the medic's cross) drawn in one batch.
const ELITE_DRAW_MAX = 500;
const eliteMesh = new FigureSet(scene, ELITE_DRAW_MAX, {
  body: 0xff8c1a, head: 0xf0c8a8, helmet: 0x5a2a0a, pack: 0x3a1a1a, legs: 0x3a1a1a,
}, null, { tint: true });
const KIND_LOOK = {
  runner: { body: new THREE.Color(0xff8c1a), helmet: new THREE.Color(0x5a2a0a), scale: 0.9, run: 19 },
  splitter: { body: new THREE.Color(0x8e44d8), helmet: new THREE.Color(0x4a1f78), scale: 1.32, run: 9 },
  mini: { body: new THREE.Color(0xb07ae8), helmet: new THREE.Color(0x4a1f78), scale: 0.72, run: 15 },
  medic: { body: new THREE.Color(0xf4f1ea), helmet: new THREE.Color(0x1fae6a), scale: 1.08, run: 10 },
};
const HOSTAGE_LOOK = { body: new THREE.Color(0x2bd47a), helmet: new THREE.Color(0xfff7ef) };
const MARK_MAX = 1200;
const marks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MARK_MAX);
marks.count = 0;
marks.frustumCulled = false;
for (let i = 0; i < MARK_MAX; i++) marks.setColorAt(i, new THREE.Color(0xffffff));
scene.add(marks);
const MARK_COLORS = { band: new THREE.Color(0xffe14d), seam: new THREE.Color(0x2b2140), cross: new THREE.Color(0x2bd47a) };
let marksDrawn = 0;
function mark(x, y, z, sx, sy, sz, color) {
  if (marksDrawn >= MARK_MAX) return;
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  marks.setMatrixAt(marksDrawn, dummy.matrix);
  marks.setColorAt(marksDrawn++, color);
}

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

// What the current graphics tier allows (see perf.js).
let fx = QUALITY_TIERS[0];

function corpse(x, z, kind, power = 1, how = 'hit') {
  if (corpses.active.length > fx.corpses) return;
  const m = corpses.get();
  m.material = corpseMats[kind];
  m.position.set(x, 0.1, z);
  m.rotation.set(0, 0, 0);
  m.scale.setScalar(1);
  const u = m.userData;
  u.fall = how === 'fall';
  // Lost soldiers fly off away from the middle of the track; fallen ones drop into the pit.
  if (u.fall) u.v.set(rand(-0.6, 0.6), rand(0.5, 1.5), rand(-0.3, 0.6));
  else u.v.set((rand(-1.6, 1.6) + Math.sign(x || 1) * (power > 1 ? 1.8 : 0)) * power, rand(3, 5.5) * power, rand(-0.6, 1.8) * power);
  u.spin.set(rand(-12, 12), rand(-6, 6), rand(-12, 12));
  u.life = u.fall ? 1.1 : rand(0.7, 1.0);
}

function flash(kind) {
  const el = ui.flash;
  el.className = '';
  void el.offsetWidth;
  el.className = `go ${kind}`;
}

function burst(x, y, z, count, mats, power = 5, size = [0.06, 0.16]) {
  count = Math.max(1, Math.round(count * fx.particles));
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
function applyLoadout(runWeapon = null) {
  const skin = skinById(save.skin);
  allyMesh.setColors({
    body: skin.body, head: skin.head, gun: skin.gun,
    helmet: shade(skin.body, 0.65), pack: shade(skin.body, 0.55), legs: shade(skin.gun, 1),
  });
  sparkMats.ally.color.setHex(skin.body);
  const w = runWeapon || weaponById(save.weapon);
  allyMesh.gun.geometry = gunGeos[w.id];
  // Newer weapons fire bullets of their own color and size.
  bulletMesh.material.color.setHex(w.look ? w.look.color : COLORS.bullet);
  bulletGlow.material.color.setHex(w.look ? w.look.glow : 0xff9a2e);
  bulletGlow.material.opacity = w.look ? 0.32 : 0.22;
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
const crowd = { x: 0, target: 0, units: [], lane: null };
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
// Formation slots follow the squad's shape (see rules.js): squeeze, normal or spread.
function slotOffset(i) {
  return formationSlot(i, game.shape || 'normal');
}

// A soldier's x on the track: inside the track, and inside its lane while the track is split.
function unitX(u) {
  const x = crowd.x + u.ox;
  if (crowd.lane) return Math.max(crowd.lane[0] + 0.12, Math.min(crowd.lane[1] - 0.12, x));
  return clampX(x);
}

function setShape(shape, quiet = false) {
  if (!['squeeze', 'normal', 'spread'].includes(shape)) shape = 'normal';
  if (game.shape === shape && !quiet) shape = 'normal';
  game.shape = shape;
  crowd.units.forEach((u, i) => { [u.tx, u.tz] = slotOffset(i); });
  for (const b of document.querySelectorAll('[data-shape]')) b.setAttribute('aria-pressed', String(b.dataset.shape === shape));
  if (!quiet) {
    sfx.shape(shape === 'squeeze');
    buzz(8);
    game.shapeUsed = true;
  }
}

// Lane walls: while the track is split, the squad stays on its side.
function setLane(side) {
  crowd.lane = side ? LANE[side] : null;
  game.inFork = !!side;
  if (side) {
    const [a, b] = LANE[side];
    crowd.target = Math.max(a + 0.55, Math.min(b - 0.55, crowd.target));
  }
}

// Soldiers removed by a hazard: test(x, z) says which ones. They fly off (or fall) where they stood.
function killUnits(test, how = 'hit', reason = 'lose.wall') {
  if (game.mode !== 'playing') return 0;
  const units = crowd.units;
  if (!units.length) return 0;
  const dead = [];
  for (let i = 0; i < units.length; i++) if (test(unitX(units[i]), units[i].oz)) dead.push(i);
  if (!dead.length) return 0;
  const loss = units.length >= game.count ? dead.length : Math.max(1, Math.round((game.count * dead.length) / units.length));
  let sx = 0;
  for (let k = dead.length - 1; k >= 0; k--) {
    const u = units[dead[k]];
    const x = unitX(u);
    sx += x;
    corpse(x, u.oz, 'ally', how === 'fall' ? 0.5 : 1.3, how);
    units.splice(dead[k], 1);
  }
  units.forEach((u, i) => { [u.tx, u.tz] = slotOffset(i); });
  game.count = Math.max(0, game.count - loss);
  game.lost += loss;
  if (game.lossLog) game.lossLog.push([Math.round(game.traveled), loss, `${reason} cx=${crowd.x.toFixed(2)} ${game.shape} n=${units.length + dead.length}`]);
  syncCrowd();
  const cx = sx / dead.length;
  burst(cx, 0.4, 0, Math.min(10, 2 + dead.length), [sparkMats.ally, sparkMats.fire[0]], 4);
  game.lossAcc = (game.lossAcc || 0) + loss;
  if (!game.lossPopT) game.lossPopT = 0.18;
  game.lossPopX = cx;
  sfx.hit();
  game.shake = Math.max(game.shake, Math.min(0.4, 0.12 + loss * 0.02));
  if (loss >= 6) hitStop(0.06);
  buzz(loss >= 6 ? [30, 20, 30] : 20);
  if (game.count <= 0) loseLevel(reason);
  return loss;
}

function crowdRadius() {
  return RUN.slot * Math.sqrt(Math.min(game.count, RUN.maxVisible)) * 1.15 + 0.15;
}

function syncCrowd() {
  const want = Math.max(0, Math.min(Math.ceil(game.count), RUN.maxVisible));
  const units = crowd.units;
  while (units.length > want) {
    const u = units.pop();
    corpse(unitX(u), u.oz, 'ally');
    burst(crowd.x + u.ox, 0.35, u.oz, 1, sparkMats.ally, 3);
  }
  while (units.length < want) {
    const [tx, tz] = slotOffset(units.length);
    units.push({ ox: 0, oz: 0, tx, tz, phase: Math.random() * 6.28 });
  }
}

function setCount(n, trade = false) {
  n = Math.max(0, n);
  if (n < game.count && !trade && game.mode === 'playing') {
    game.lost += game.count - n;
    if (game.lossLog) game.lossLog.push([Math.round(game.traveled), Math.round(game.count - n), (new Error().stack || '').split('\n')[2]]);
  }
  game.count = n;
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
    // An empty side of a door row (or of a lane): walk through, nothing changes.
    if (!spec) { pair.gates.push({ x, w, spec: null, empty: true }); continue; }
    // A key or a cage just in front of the door on that side: taking this door means taking them too.
    if (spec.key) props.spawn({ type: 'key', x }, z + 3.2);
    if (spec.hostages) props.spawn({ type: 'cage', x, n: spec.hostages }, z + 4);
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
  if (!s) return { title: '', sub: '', tone: 'good' };
  if (s.lock) return { title: s.chest ? t('chest') : opText(s), sub: '#lock', tone: 'lock' };
  if (type === 'weapon') return { title: s.label, sub: t(s.kind === 'rate' ? 'gate.rate' : 'gate.dmg'), tone: s.val > 0 ? 'gun' : 'bad' };
  if (s.op === 'x') return { title: `x${s.val}`, sub: '', tone: 'good' };
  if (s.op === '÷') return { title: `÷${s.val}`, sub: '', tone: 'bad' };
  if (s.op === '?') return { title: '?', sub: '', tone: 'mystery' };
  const v = Math.round(gate.value);
  return { title: v >= 0 ? `+${v}` : `${v}`, sub: '', tone: v >= 0 ? 'good' : 'bad' };
}

function drawGate(gate, type) {
  if (!gate.panel) return;
  const l = gateLabel(gate, type);
  gate.panel.userData.draw(l.title, l.sub, l.tone);
}

// Firepower of the army right now (damage per second).
const armyDps = () => game.count * game.rate * game.dmg;
// Upgrades still help on hand-designed levels, but fixed enemies grow a little with them,
// so the goals (beat the boss in 20 s...) stay worth planning for.
const upgradeScale = () => Math.sqrt(damageMult(save.up.dmg) * rateMult(save.up.rate));

function spawnSquad(ev, z) {
  const units = [];
  // Squads keep up with the army you actually have (x2/x3 doors are exact), so late levels stay a fight:
  // a share of your army in size, and enough health to take a few seconds of your fire.
  const L = game.level;
  // A runner pack is a share of a normal squad, faster and frailer.
  const share = ev.share || 1;
  const pressure = Math.min(0.55, 0.1 + L * 0.005) * (ev.ramp || 1) * share;
  // Hand-designed levels use squads of a fixed size, so the plan you make in the preview holds.
  const strength = ev.fixed ? Math.max(1, Math.round(ev.count)) : Math.max(Math.round(ev.count * share), Math.round(game.count * pressure), 1);
  const n = Math.min(strength, ENEMY.maxUnits);
  const w = Math.max(1, Math.round(strength / n)); // each figure stands for w enemies
  const ttk = (0.6 + L * 0.026) * (ev.fast ? 0.6 : 1); // seconds of full fire this squad should take
  const unitHp = ev.fixed ? Math.max(1, Math.round(ev.hp * w * upgradeScale() * enemyMult()))
    : Math.max(1, Math.round(Math.max(ev.hp * w, Math.ceil((armyDps() * ttk * (ev.ramp || 1) * share) / n)) * enemyMult()));
  const medics = Math.min(ev.medics || 0, Math.floor(n / 6));
  const kinds = {};
  for (let i = 0; i < n; i++) {
    const r = 0.26 * Math.sqrt(i + 0.5) * 1.1;
    const a = i * 2.39996;
    const roll = Math.random();
    // Medics stand in the middle, where the squad protects them.
    const kind = ev.fast ? 'runner' : i < medics ? 'medic' : ev.splitters && Math.random() < ev.splitters ? 'splitter' : null;
    const shield = !kind && ev.shield && roll < ev.shield;
    const armored = !kind && !shield && ev.armored && roll < (ev.shield || 0) + ev.armored;
    const hp = armored ? unitHp * 3 : shield ? unitHp * 2 : kind === 'splitter' ? unitHp * 1.6 : kind === 'medic' ? unitHp * 1.5 : unitHp;
    if (kind) kinds[kind] = (kinds[kind] || 0) + 1;
    units.push({
      ox: Math.cos(a) * r * (kind === 'splitter' ? 1.15 : 1), oz: Math.sin(a) * r * 0.8, hp, max: hp, armored, shield, w, kind,
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
  const tone = ev.fast ? '#ffd9a8' : '#ffd2cc';
  const label = makeCountLabel(ev.fast ? 0.75 : 0.9, tone);
  scene.add(label);
  squads.push({ x: clampX(ev.x, 1), z, units, alive: units.length, label, fast: !!ev.fast, kinds, tone, healIn: 1 });
  // A runner pack starts a little behind its squad and overtakes it.
  if (ev.runners) {
    spawnSquad({ count: ev.count, hp: ev.hp, ramp: ev.ramp, x: -ev.x * 0.8, fast: true, share: 0.35, fixed: ev.fixed }, z - 6);
  }
}

// A shot splitter breaks into two smaller enemies with a share of its health each.
function splitUnit(s, u) {
  for (const side of [-1, 1]) {
    const hp = Math.max(1, u.max * 0.3);
    s.units.push({
      ox: u.ox + side * 0.24, oz: u.oz + 0.05, hp, max: hp, w: u.w, kind: 'mini',
      alive: true, phase: Math.random() * 6.28, pop: 0.25,
    });
  }
  burst(clampX(s.x + u.ox), 0.5, s.z + u.oz, 8, [sparkMats.split, sparkMats.enemy], 4);
}

function killUnit(s, u, ux, uz) {
  u.alive = false;
  corpse(ux, uz, 'enemy', 0.8);
  mission('kill');
  if (u.kind === 'splitter') splitUnit(s, u);
}

// Medics heal the squad around them once a second, so they are worth shooting first.
function healSquad(s, dt) {
  if (!s.kinds.medic) return;
  s.healIn -= dt;
  if (s.healIn > 0) return;
  s.healIn = 1;
  for (const m of s.units) {
    if (!m.alive || m.kind !== 'medic') continue;
    let healed = false;
    for (const u of s.units) {
      if (!u.alive || u.giant || u.hp >= u.max || Math.hypot(u.ox - m.ox, u.oz - m.oz) > 1.6) continue;
      u.hp = Math.min(u.max, u.hp + u.max * 0.18);
      healed = true;
    }
    if (healed) burst(clampX(s.x + m.ox), 1.1, s.z + m.oz, 3, sparkMats.heal, 2, [0.05, 0.1]);
  }
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
  // The Boss Week boss: gunmetal and gold instead of the world's colors.
  const mat = new THREE.MeshStandardMaterial({ color: ev.week ? 0x5a5680 : theme.boss, roughness: 0.45, emissive: 0x000000 });
  const dark = new THREE.MeshStandardMaterial({ color: ev.week ? 0x2e2b45 : theme.bossDark, roughness: 0.6 });
  const bone = new THREE.MeshStandardMaterial({ color: ev.week ? 0xffbe2e : 0xfff1d6, roughness: 0.4 });
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
  if (ev.week) addMegaParts(add, head, bone);
  // A world boss is much bigger; the Boss Week boss bigger still.
  g.scale.setScalar(ev.week ? 2.05 : ev.big ? 1.75 : 1.12);
  const label = makeHealthLabel(ev.week ? 0.85 : ev.big ? 1.0 : 1.3);
  label.position.set(0, 3.75, 0);
  g.add(label);
  g.position.set(0, 0, z);
  scene.add(g);
  // A boss should take a while even for a huge army. Hand-designed bosses have the health their level says.
  const hp = ev.hand ? Math.round(ev.hp * upgradeScale() * enemyMult())
    : Math.round(Math.max(ev.hp, armyDps() * (ev.week ? 2.4 * 0.8 : ev.big ? 1.6 : 1) * (4 + Math.min(10, game.level * 0.1))) * enemyMult());
  label.userData.set(hp, hp);
  boss = {
    x: 0, z, hp, max: hp, group: g, mat, armL, armR, label,
    contact: false, flash: 0, dead: false, slamIn: 0.5, introduced: false, big: !!ev.big, week: !!ev.week, enraged: false,
    kind: ev.kind || 'brute', weak: !!ev.weak, hand: !!ev.hand, adds: ev.adds || 0, addHp: ev.addHp || 3,
    limit: ev.limit || 55, fightT: 0, phase: 0, weakOpen: false, weakT: 2.2, swarmIn: 3,
    scale: g.scale.x, hold: ev.weak || ev.hand ? -5.6 : null,
  };
  if (boss.weak) addWeakPoint(g);
  if (boss.kind === 'shield') {
    boss.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.9, 24, 16), shieldMat);
    boss.shieldMesh.position.y = 1.6;
    g.add(boss.shieldMesh);
    boss.shieldOn = true;
  }
}

// ---------------------------------------------------------------- weak points
// The weak point sits behind a plate. It opens for a moment, then closes; each health phase moves it
// (chest, left shoulder, right shoulder) and calls in adds. A ring on the floor shows where to stand.
const WEAK_SPOTS = [[0, 1.45, 0.8], [-0.86, 2.1, 0.42], [0.86, 2.1, 0.42]];
const weakOrbMat = new THREE.MeshStandardMaterial({ color: 0xffe14d, emissive: 0xffb000, emissiveIntensity: 0.2, roughness: 0.3 });
const weakPlateMat = new THREE.MeshStandardMaterial({ color: 0x8fa3c4, metalness: 0.7, roughness: 0.3 });
const markerMat = new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.6, depthWrite: false });
function addWeakPoint(g) {
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), weakOrbMat);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.66, 0.12), weakPlateMat);
  g.add(orb, plate);
  const marker = new THREE.Group();
  const ring = new THREE.Mesh(ringGeo, markerMat);
  ring.renderOrder = 1;
  marker.add(ring);
  marker.scale.setScalar(0.8);
  scene.add(marker);
  Object.assign(boss, { orb, plate, marker });
  placeWeak();
}
function placeWeak() {
  const [x, y, z] = WEAK_SPOTS[boss.phase % WEAK_SPOTS.length];
  boss.orb.position.set(x, y, z);
  boss.plate.position.set(x, y, z + 0.18);
}
function updateWeak(dt, active) {
  if (!boss.weak || boss.dead) return;
  const ph = boss.hp > boss.max * 0.66 ? 0 : boss.hp > boss.max * 0.33 ? 1 : 2;
  if (ph > boss.phase) {
    boss.phase = ph;
    placeWeak();
    boss.weakOpen = false;
    boss.weakT = 1.4;
    if (active) {
      showBanner(t('boss.phase', { n: ph + 1 }));
      sfx.roar();
      game.shake = Math.max(game.shake, 0.45);
      hitStop(0.08);
      buzz([40, 30, 40]);
      if (boss.adds) spawnSquad({ count: boss.adds, hp: boss.addHp, x: crowd.x, fixed: true }, boss.z + 2.5);
    }
  }
  if (active) {
    boss.weakT -= dt;
    if (boss.weakT <= 0) {
      boss.weakOpen = !boss.weakOpen;
      boss.weakT = boss.weakOpen ? 2.6 : 3.2;
      if (boss.weakOpen) {
        sfx.key();
        buzz(10);
        if (!seen().tutWeak) placeTipSoon = 'weak';
      }
    }
  }
  const open = boss.weakOpen;
  weakOrbMat.emissiveIntensity = open ? 1.1 + Math.sin(game.time * 14) * 0.4 : 0.15;
  boss.plate.visible = !open;
  boss.orb.scale.setScalar(open ? 1.15 + Math.sin(game.time * 14) * 0.08 : 0.9);
  boss.weakX = boss.x + boss.orb.position.x * boss.scale;
  boss.marker.visible = open && game.mode === 'playing';
  boss.marker.position.set(boss.weakX, 0.04, -2.6); // just ahead of the squad, where it can be seen
  markerMat.opacity = 0.45 + Math.abs(Math.sin(game.time * 8)) * 0.4;
}
let placeTipSoon = null;

// Mega boss extras: a gold crown, shoulder spikes and a glowing visor.
const visorMat = new THREE.MeshBasicMaterial({ color: 0xff3df2 });
function addMegaParts(add, head, gold) {
  visorMat.color.setHex(0xff3df2);
  const spike = new THREE.ConeGeometry(0.09, 0.32, 8);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    add(spike, gold, Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3, head);
  }
  add(new THREE.TorusGeometry(0.33, 0.06, 6, 20).rotateX(Math.PI / 2), gold, 0, 0.36, 0, head);
  add(new THREE.BoxGeometry(0.62, 0.11, 0.1), visorMat, 0, 0.08, 0.44, head);
  const shoulder = new THREE.ConeGeometry(0.16, 0.5, 8);
  for (const side of [-1, 1]) {
    const m = add(shoulder, gold, side * 0.92, 2.42, 0);
    m.rotation.z = -side * 0.5;
  }
}

// delay: seconds before the target circle shows, so a barrage lands one rock after another.
function spawnSlam(x, z, from, delay = 0) {
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
  group.visible = rock.visible = delay <= 0;
  slams.push({
    x: clampX(x, 0.6), z, r, t: -delay, dur,
    group, ring, fill, rock, fromX: from.x, fromZ: from.z,
  });
  if (delay <= 0) sfx.tick();
}

function slamImpact(sl) {
  burst(sl.x, 0.3, sl.z, 22, [rockMat, ...sparkMats.fire], 6, [0.08, 0.22]);
  sfx.boom();
  game.shake = 0.45;
  // Share of the army standing inside the circle.
  const units = crowd.units;
  let inside = 0;
  for (const u of units) {
    const ux = unitX(u);
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
// Bosses with a weak point keep the narrow zone even when big: every telegraphed attack must be dodgeable.
const punchWidth = () => BOSS.punchWidth * (boss.big && !boss.weak ? 1.25 : 1);

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
    const ux = unitX(u);
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
      rockGeo, rockMat, ringGeo, ringFillGeo, iceMat, laneMat, shieldMat, unitBox, corpseGeo, energyMat, visorMat,
      weakOrbMat, weakPlateMat, markerMat, ...PROP_SHARED,
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
sparkMats.heal = new THREE.MeshBasicMaterial({ color: 0x2bd47a });
sparkMats.split = new THREE.MeshBasicMaterial({ color: 0xb07ae8 });
sparkMats.energy = new THREE.MeshBasicMaterial({ color: 0xff4fd8 });

function bossAttack() {
  const world = themeFor(game.level).id;
  boss.moves = (boss.moves || 0) + 1;
  if (boss.week) return megaAttack();
  const special = boss.moves % 2 === 0;
  if (world === 'desert' && special && boss.z > -BOSS.stopDist - 1) return startCharge();
  if (world === 'snow' && special) return spawnIceWall();
  if (world === 'lava' && special) return summonMinions();
  spawnSlam(crowd.x, 0, boss);
}

// Boss Week: a rock barrage across the track, then a wall of energy with one gap.
// Below half health it gets angry: faster, and it calls in a runner pack once.
function megaAttack() {
  if (boss.moves % 2 === 0) return spawnIceWall(true);
  const n = boss.enraged ? 4 : 3;
  const dir = Math.random() < 0.5 ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const x = crowd.x + dir * (i - (n - 1) / 2) * 1.9;
    spawnSlam(x, 0, boss, i * 0.28);
  }
}

function enrage() {
  boss.enraged = true;
  visorMat.color.setHex(0xff3b30);
  showBanner(t('bw.enraged'));
  sfx.roar();
  game.shake = 0.5;
  spawnSquad({ count: 6 + Math.floor(game.level / 3), hp: 1 + Math.floor(game.level / 4), x: crowd.x, fast: true, share: 0.25 }, boss.z + 2);
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
      for (const u of crowd.units) if (Math.abs(unitX(u) - c.x) < half) inside++;
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

// Snow: a wall of ice slides at the army; only the gap is safe. The mega boss sends one made of energy.
const energyMat = new THREE.MeshStandardMaterial({ color: 0xff4fd8, roughness: 0.3, transparent: true, opacity: 0.75, emissive: 0xff4fd8, emissiveIntensity: 0.6 });
function spawnIceWall(energy = false) {
  const gapHalf = 1.15;
  const gapX = Math.max(-HALF_W + gapHalf, Math.min(HALF_W - gapHalf, (Math.random() * 2 - 1) * 2.2));
  const group = new THREE.Group();
  const addBlock = (from, to) => {
    if (to - from < 0.1) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(to - from, 1.1, 0.5), energy ? energyMat : iceMat);
    m.position.set((from + to) / 2, 0.55, 0);
    m.castShadow = true;
    group.add(m);
  };
  addBlock(-HALF_W, gapX - gapHalf);
  addBlock(gapX + gapHalf, HALF_W);
  const z = boss.z + 2;
  group.position.z = z;
  scene.add(group);
  iceWalls.push({ z, gapX, gapHalf, group, hit: false, energy });
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
  if (boss.week || boss.kind === 'shield' || themeFor(game.level).id !== 'night' || game.mode !== 'playing' || boss.z < -BOSS.slamRange) return;
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
  if (boss) trash(boss.group, boss.marker);
  props.clear();
  setLane(null);
  if (game.preview) {
    trash(game.preview.root);
    game.preview = null;
    $('preview').hidden = true;
    scene.fog.far = 80;
    scene.fog.near = 34;
  }
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
  ui.hud.hidden = !['playing', 'bonus', 'paused', 'won', 'lost', 'shop'].includes(game.mode) || screen === ui.won || screen === ui.lost;
}

function refreshWallet() {
  for (const el of ui.wallet) el.textContent = fmt(save.coins);
  ui.playLabel.textContent = t('play', { n: save.level });
  $('levels-label').textContent = `★ ${totalStars()}`;
  $('home-world').textContent = t('world.label', { n: worldNumber(save.level), name: t(`world.${themeFor(save.level).id}`) });
  if (bossWeek) bossWeek.render();
  const kindTag = levelKind(save.level);
  $('home-kind').hidden = kindTag === 'normal';
  $('home-kind').textContent = kindTag === 'normal' ? '' : t(`tag.${kindTag}`);
  ui.mute.setAttribute('aria-pressed', String(save.muted));
  ui.mute.textContent = t(save.muted ? 'sound.off' : 'sound.on');
  ui.music.setAttribute('aria-pressed', String(save.music === false));
  ui.music.textContent = t(save.music === false ? 'music.off' : 'music.on');
}

// event: null for the next level, 'bossweek' for the weekly mega boss (it does not move you a level on).
// replay: a level number below the current one, played again for stars (does not move you on).
function startLevel(event = null, replay = null) {
  if (typeof event !== 'string') event = null; // also used directly as a click handler
  if (typeof replay !== 'number' || replay >= save.level || replay < 1) replay = null;
  unlockAudio();
  sfx.tap();
  $('screen-runshop').hidden = true;
  clearLevel();
  game.event = event;
  game.level = event ? save.level : replay || save.level;
  game.replay = !!replay;
  game.plan = event === 'bossweek' ? buildBossWeekLevel(game.level) : buildLevel(game.level);
  Object.assign(game, {
    mode: 'playing', nextEvent: 0, tipKind: null, traveled: 0, speed: RUN.speed, coinsRun: 0, emitAcc: 0,
    crushAcc: 0, shake: 0, endTimer: 0, time: 0, peak: 0, revived: false, lastEarned: 0,
    buffRate: 1, buffDmg: 1, keys: 0, hostages: 0, hostagesMissed: 0, lost: 0, targets: 0, targetsMissed: 0,
    chests: 0, chestMissed: false, bossSecs: 0, runTime: 0, cine: null, inFork: false, mud: 1, result: null,
    shopPick: null, shapeUsed: false, cheer: 0, hitstop: 0, lossAcc: 0, lossPopT: 0,
  });
  game.weapon = weaponById(save.weapon);
  recalcGun();
  applyLoadout();
  crowd.units.length = 0;
  crowd.x = crowd.target = 0;
  setShape('normal', true);
  // Hand-designed levels start with the squad their puzzle needs; the army upgrade joins as
  // reinforcements when the boss shows up, so the door arithmetic stays the same for everyone.
  const hand = !!game.plan.hand;
  const army = startSoldiers(save.up.army);
  setCount(hand ? game.plan.start : army, true);
  game.reinforce = hand ? army - 1 : 0;
  game.hostagesTotal = game.plan.events.reduce((n, e) => n + (e.type === 'cage' ? e.n : 0)
    + (e.type === 'gates' ? ((e.left && e.left.hostages) || 0) + ((e.right && e.right.hostages) || 0) : 0), 0);
  ui.level.textContent = event ? t('bw.title') : levelTitle(game.level);
  applyWorld(game.level);
  game.finishAt = 0;
  ui.runCoins.textContent = '0';
  game.dragged = 0;
  game.tutTimer = 0;
  track('level_start', {
    level: game.level, weapon: save.weapon, skin: save.skin, replay: game.replay ? 1 : 0,
    army: save.up.army, dmg: save.up.dmg, rate: save.up.rate, income: save.up.income, event: event || '',
  });
  requestWakeLock();
  startPreview();
}

// After the preview: the run itself starts.
function beginRun() {
  const event = game.event;
  const theme = themeFor(game.level);
  // Returning players on the first levels get the short reminder; new players get the full guide.
  $('hint-text').textContent = t(game.plan.hand ? 'hint.plan' : 'hint');
  ui.hint.hidden = game.level > 2 || !seen().tutDrag;
  ui.hint.classList.remove('fade');
  if (!ui.hint.hidden) setTimeout(() => ui.hint.classList.add('fade'), 2600);
  const kind = game.plan.kind;
  if (event) showBanner(t('bw.banner'));
  else if (game.level > 1 && game.level % 10 === 1) showBanner(t('world.new', { name: t(`world.${theme.id}`) }));
  else if (kind !== 'normal') showBanner(t(`special.${kind}`));
  else if (seen().tutDrag) showBanner(pick(t('taunts')).replace('{n}', game.level)); // not on a brand-new player's first look
  startMusic();
  setMusicIntensity(1);
  show(null);
  refreshPuzzleHud();
  if (shapeUnlocked() && !seen().tutShape && game.plan.events.some((e) => e.type === 'wall' || e.type === 'bridge')) $('shape-ctl').classList.add('teach');
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
  const r = finishRun(true);
  // Stars add a little to the pay-out; a replay pays half.
  const earned = Math.round(base * (1 + r.stars * 0.15) * (game.replay ? 0.5 : 1) * incomeMult(save.up.income) * mult * remote.num('coin_mult', 1, 0.2, 5));
  const ev = game.event;
  save.coins += earned;
  if (!ev) {
    save.stars = save.stars || {};
    const before = save.stars[game.level] || 0;
    save.stars[game.level] = Math.max(before, r.stars);
    game.newBest = r.stars > before;
  }
  if (!ev && !game.replay) {
    save.level += 1;
    leaderboard.submit('level', save.level - 1);
  }
  renderGoals($('won-goals'), game.plan.goals, r);
  $('won-stars').setAttribute('aria-label', t('stars.n', { n: r.stars }));
  lastShare = { title: ev ? t('bw.won') : t('sh.win', { n: game.level }), line: t('sh.dare') };
  lastWinBig = mult >= 3;
  game.lastEarned = earned;
  game.shownBonus = 0;
  game.tripled = false;
  if (!ev && !game.replay && save.level === 4) setTimeout(maybeOffer, 1800);
  wonExtras(ev);
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
  track('level_complete', { level: game.level, mult, coins: earned, seconds: Math.round(game.time), peak: Math.round(game.peak || 0), event: ev || '', stars: r.stars, goals: r.goals.map((g) => (g ? 1 : 0)).join(''), lost: r.lost, replay: game.replay ? 1 : 0, shop: game.shopPick || '', shape: game.shapeUsed ? 1 : 0 });
  ui.adTriple.hidden = false;
  ui.adTriple.disabled = false;
  ui.wonMult.hidden = mult <= 1;
  ui.wonMult.textContent = t('bonusMult', { n: mult });
  writeSave(save);
  ui.wonLevel.textContent = ev ? t('bw.won') : t('won.title', { n: game.level });
  refreshWonCoins();
  refreshWallet();
  releaseWakeLock();
}

// Boss Week pay-out and the card drop, shown on the win screen.
function wonExtras(ev) {
  const line = $('won-event');
  line.hidden = ev !== 'bossweek';
  if (ev === 'bossweek') {
    const r = bossWeek.onWin();
    game.shownBonus += r.coins;
    line.textContent = !r.coins ? t('bw.practice')
      : r.skin ? `${t('bw.reward', { n: fmt(r.coins) })} ${t('bw.skin', { skin: t(`skin.${r.skin}`) })}` : t('bw.reward', { n: fmt(r.coins) });
    record('skins', save.owned.skins.length);
  }
  const drop = cards.onWin({ boss: ev === 'bossweek' || game.plan.kind === 'boss', source: ev || game.plan.kind, level: game.level });
  cards.showDrop(drop);
  if (drop && drop.set) record('skins', save.owned.skins.length);
}

// Coins shown on the win screen: the level's coins (x3 after the ad) plus event and card coins.
function refreshWonCoins(tripled = false) {
  ui.wonCoins.textContent = `+${fmt(game.lastEarned * (tripled ? 3 : 1) + (game.shownBonus || 0))}`;
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
  $('screen-runshop').hidden = true;
  if (game.cine) { game.cine = null; $('cine').hidden = true; }
  const r = finishRun(false);
  renderGoals($('lost-goals'), game.plan ? game.plan.goals : [], r);
  track(game.event === 'bossweek' ? 'boss_week_fail' : 'level_fail', {
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
  const won = game.mode === 'won';
  setTimeout(() => {
    if (game.mode !== 'won' && game.mode !== 'lost') return;
    if (!account.maybeAsk() && won && game.mode === 'won') review.onWin(lastWinBig ? 'big' : 'win');
  }, 2600);
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
  game.tripled = true;
  refreshWonCoins(true);
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
  game.result = null;
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
  game.event = null;
  if (bossWeek) bossWeek.render();
  if (cards) cards.refreshBadge();
  if (season) season.refresh();
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
      // The festive look only shows during Christmas, unless it is already yours.
      if (k.season && !owned && !season.skinFree()) continue;
      const name = t(`skin.${k.id}`);
      const li = shopRow(name, `<p>${owned ? t(save.skin === k.id ? 'wearing' : 'owned') : t('squadLook')}</p>`, swatch);
      if (save.skin === k.id) li.appendChild(stateButton(`skin-${k.id}`, t('on'), true));
      else if (owned) li.appendChild(stateButton(`skin-${k.id}`, t('wear'), false, () => { save.skin = k.id; }));
      else if (k.pass) {
        li.querySelector('p').textContent = t('pass.from');
        li.appendChild(stateButton(`skin-${k.id}`, t('pass.button'), true));
      } else if (k.season) {
        li.querySelector('p').textContent = t('xmas.free');
        li.appendChild(stateButton(`skin-${k.id}`, t('xmas.claim'), false, () => {
          if (season.claimSkin('shop')) save.skin = k.id;
          record('skins', save.owned.skins.length);
        }));
      } else if (k.event || k.album) {
        li.querySelector('p').textContent = t(k.event ? 'bw.from' : 'album.from');
        li.appendChild(stateButton(`skin-${k.id}`, t(k.event ? 'bw.button' : 'album.button'), true));
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
  else if ((e.key === ' ' || e.key === 'Enter') && game.mode === 'preview') endPreview();
  if (game.mode === 'playing' && shapeUnlocked()) {
    if (e.key === 'ArrowUp' || e.key === 'w') setShape('squeeze');
    if (e.key === 'ArrowDown' || e.key === 's') setShape('spread');
  }
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
$('btn-next').addEventListener('click', async () => { await inter.afterLevel(save.level - 1); startLevel(); });
$('btn-retry').addEventListener('click', () => startLevel(game.event));
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
// Tiers are in perf.js: high is tier 0, low is tier 2, auto uses what this phone has shown it can run.
let shadowsOn = true;
let sunLight = null;
scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) sunLight = o; });
function applyQuality(q) {
  applyTier(q === 'low' ? 2 : q === 'high' ? 0 : autoQ.tier());
}

function applyTier(tier) {
  fx = QUALITY_TIERS[tier];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, fx.ratio));
  let recompile = false;
  if (shadowsOn !== fx.shadows) {
    shadowsOn = fx.shadows;
    renderer.shadowMap.enabled = shadowsOn;
    recompile = true;
  }
  if (sunLight && sunLight.shadow.mapSize.x !== fx.shadowMap) {
    sunLight.shadow.mapSize.set(fx.shadowMap, fx.shadowMap);
    if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
  }
  if (recompile) {
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
  }
  allyMesh.drawCap = fx.allyDraw;
  enemyMesh.drawCap = fx.enemyDraw;
  eliteMesh.drawCap = Math.min(ELITE_DRAW_MAX, fx.enemyDraw);
  for (const f of [allyMesh, enemyMesh, eliteMesh]) f.setCheap(fx.cheap);
  corpseMats.ally = allyMesh.body.material;
  corpseMats.enemy = enemyMesh.body.material;
  if (season) season.setDetail(fx.snow);
  resize();
}

const autoQ = createAutoQuality({
  mode: () => save.quality || 'auto',
  apply: applyTier,
  onStep: (tier, fps) => {
    toast(t(tier >= 2 ? 'q.light' : 'q.lighter'));
    track('quality_auto', { tier, fps, level: game.level });
  },
});

// A small note at the bottom of the screen that never blocks play.
let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  el.classList.remove('go');
  void el.offsetWidth;
  el.classList.add('go');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3400);
}

// ================================================================ puzzle layer
// Props on the track (props.js) report back here; the squad and the score live in main.js.
const props = createProps({
  scene, game, crowd, t, trash, sfx, slotMat, sawGeo, sawMat,
  radius: () => crowdRadius(), unitX, killUnits, seeObstacle, popAt, setLane, loseLevel: (r) => loseLevel(r),
  onTarget(ok, p) {
    if (ok) {
      popAt(t('tgt.hit'), 0, 3, p.z, 'good', 1.3);
      sfx.target();
      burst(0, 2.2, p.z, 30, [sparkMats.fire[0], sparkMats.fire[2], sparkMats.heal], 6, [0.08, 0.2]);
      ringWave(crowd.x, p.z, 0x2bd47a, 2.4);
      hitStop(0.05);
      buzz([15, 25, 15]);
    } else {
      popAt(t('tgt.miss'), 0, 3, p.z, 'bad', 1.2);
      sfx.miss();
      buzz(60);
      game.shake = Math.max(game.shake, 0.25);
    }
    track('target', { level: game.level, ok, count: Math.round(game.count) });
  },
  onSwitch(ok, reward, p) {
    if (!ok) {
      popAt(t('sw.miss'), 0, 2, p.z, 'bad');
      sfx.gateBad();
      return;
    }
    const before = game.count;
    setCount(Math.round(applyOpCount(game.count, reward)));
    popAt(`+${fmt(game.count - before)}`, 0, 2.4, p.z, 'good', 1.3);
    ringWave(0, p.z, 0x2bd47a, 2.2);
    burst(0, 1.2, p.z, 26, [sparkMats.ally, sparkMats.fire[2], sparkMats.heal], 5);
    sfx.gateMul(reward.val || 2);
    hitStop(0.05);
    buzz([12, 20, 12]);
  },
  onRescue(n, p) {
    setCount(game.count + n);
    game.hostages += n;
    popAt(t('hostage.saved', { n }), p.x, 2, p.z, 'good', 1.15);
    burst(p.x, 1, p.z, 18, [sparkMats.heal, sparkMats.fire[2]], 4);
    ringWave(p.x, p.z, 0x2bd47a);
    sfx.rescue();
    buzz([15, 20, 15]);
  },
  onKey(p) {
    game.keys++;
    popAt(t('key.got'), p.x, 2, p.z, 'gun');
    burst(p.x, 1, p.z, 16, [sparkMats.fire[0], sparkMats.fire[2]], 4);
    sfx.key();
    buzz(20);
    refreshPuzzleHud();
  },
  openShop: (ev) => openRunShop(ev),
  bridgeFail(reason) {
    sfx.creak();
    sfx.bigBoom();
    game.shake = 0.6;
    hitStop(0.12);
    buzz([80, 40, 80]);
    killUnits(() => true, 'fall', reason);
  },
  bridgeOk(p) {
    sfx.creak();
    popAt(t('bridge.ok'), 0, 1.8, p.z, 'good');
  },
});
const applyOpCount = (n, spec) => (spec.op === 'x' ? n * spec.val : spec.op === '÷' ? Math.ceil(n / spec.val) : n + spec.val);

// Numbers that pop up where things happen in the world, then rise and fade.
const popVec = new THREE.Vector3();
function popAt(text, x, y, z, kind = '', size = 1) {
  popVec.set(x, y, z).project(camera);
  if (popVec.z > 1) return;
  const el = document.createElement('div');
  el.className = `popat ${kind}`;
  el.textContent = text;
  el.style.left = `${((popVec.x + 1) / 2) * window.innerWidth}px`;
  el.style.top = `${((1 - popVec.y) / 2) * window.innerHeight}px`;
  if (size !== 1) el.style.fontSize = `${Math.round(30 * size)}px`;
  const host = $('popats');
  while (host.childElementCount > 7) host.firstElementChild.remove();
  host.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

// A ring that spreads over the floor when a door is passed.
const waves = [];
function ringWave(x, z, color, size = 1.6) {
  if (waves.length > 6) return;
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
  m.position.set(x, 0.05, z);
  m.renderOrder = 1;
  scene.add(m);
  waves.push({ m, t: 0, size });
}
// The door's sign does not just vanish: it pops up and fades.
const fading = [];
function shatterPanel(gate) {
  if (!gate.panel) return;
  gate.panel.visible = true;
  gate.panel.material.opacity = 1;
  fading.push({ mesh: gate.panel, t: 0 });
}
function updateFx(dt, dz) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i];
    w.t += dt;
    w.m.position.z += dz;
    w.m.scale.setScalar(0.4 + w.t * 5 * w.size);
    w.m.material.opacity = Math.max(0, 0.8 - w.t * 1.6);
    if (w.t > 0.5) { trash(w.m); waves.splice(i, 1); }
  }
  for (let i = fading.length - 1; i >= 0; i--) {
    const f = fading[i];
    f.t += dt;
    f.mesh.scale.setScalar(1 + f.t * 2.2);
    f.mesh.position.y = 1.25 + f.t * 3;
    f.mesh.material.opacity = Math.max(0, 1 - f.t / 0.28);
    if (f.t > 0.28) { f.mesh.visible = false; fading.splice(i, 1); }
  }
}
function hitStop(s) {
  game.hitstop = Math.max(game.hitstop || 0, s);
}

// Win: confetti over the screen and the squad jumps for joy.
function celebrate() {
  game.cheer = 2.2;
  const host = $('confetti');
  host.innerHTML = '';
  const colors = ['#2f7cf6', '#ffbe2e', '#e8453c', '#2bd47a', '#8a78f0', '#ff9628'];
  const n = fx.cheap ? 24 : 44;
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = `${Math.random() * 0.5}s`;
    c.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
    c.style.setProperty('--dx', `${(Math.random() * 2 - 1) * 80}px`);
    c.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    host.appendChild(c);
  }
  host.hidden = false;
  setTimeout(() => { host.hidden = true; host.innerHTML = ''; }, 3200);
  buzz([20, 40, 20, 40, 60]);
}

// ---------------------------------------------------------------- boss intro
function startCine() {
  if (!boss) return;
  game.cine = { t: 0, dur: 2.5 };
  const kind = boss.week ? 'week' : boss.kind;
  $('cine-name').textContent = t(`boss.name.${kind}`);
  $('cine-kicker').textContent = boss.big || boss.week ? t('boss.kicker.world') : t('boss.kicker');
  const hints = [];
  if (boss.weak) hints.push(t('boss.hint.weak'));
  if (boss.kind === 'shield') hints.push(t('boss.hint.shield'));
  if (boss.kind === 'swarm') hints.push(t('boss.hint.swarm'));
  if (!hints.length) hints.push(t('boss.hint.brute'));
  $('cine-hint').textContent = hints.join(' ');
  $('cine').hidden = false;
  $('cine').classList.remove('go');
  void $('cine').offsetWidth;
  $('cine').classList.add('go');
  ui.banner.hidden = true;
  track('boss_intro', { level: game.level, kind });
}
function updateCine(dt) {
  game.cine.t += dt;
  if (game.cine.t >= game.cine.dur) endCine();
}
function endCine() {
  if (!game.cine) return;
  game.cine = null;
  $('cine').hidden = true;
  if (game.reinforce > 0 && game.mode === 'playing') {
    setCount(game.count + game.reinforce);
    popup(t('reinforce', { n: game.reinforce }), 'good');
    game.reinforce = 0;
  }
}
$('cine').addEventListener('pointerdown', () => { if (game.cine && game.cine.t > 0.4) game.cine.t = Math.max(game.cine.t, game.cine.dur - 0.45); });

// ---------------------------------------------------------------- overhead preview
// Before the run the camera flies high over the whole track, laid out as a map,
// with the level's goals on screen. Tap to skip.
function startPreview() {
  game.mode = 'preview';
  const root = props.buildPreview(game.plan.events);
  scene.add(root);
  const len = game.plan.length;
  game.preview = { root, t: 0, dur: Math.max(2.6, Math.min(5.2, len / 75)), len, travel: 0 };
  renderGoals($('pv-goals'), game.plan.goals, null);
  $('pv-title').textContent = ui.level.textContent;
  const idea = game.plan.idea && game.plan.idea !== 'mix' && !game.event ? t(`idea.${game.plan.idea}`) : '';
  $('pv-idea').textContent = idea;
  $('pv-idea').hidden = !idea;
  $('preview').hidden = false;
  show(null);
  ui.hud.hidden = true;
  scene.fog.far = 170;
  scene.fog.near = 60;
}
function updatePreview(dt) {
  const p = game.preview;
  if (!p) return;
  p.t += dt;
  const k = Math.min(1, p.t / p.dur);
  const e = k * k * (3 - 2 * k);
  const travel = e * Math.max(0, p.len - 22);
  const dz = travel - p.travel;
  p.travel = travel;
  p.root.position.z = travel;
  trackTex.offset.y += dz / 4;
  for (const m of decor.active) m.position.z += dz * 0.9;
  drawCrowd(dt);
  // High and steep, so the doors read like a map; tall screens see further down the track.
  const sway = Math.sin(p.t * 0.8) * 0.5;
  const tall = Math.min(1.3, Math.max(0.8, 1 / camera.aspect / 1.7));
  camera.position.set(sway, 25 * tall, 4);
  lookAt.set(0, 0, -20 * tall);
  camera.lookAt(lookAt);
  if (p.t > p.dur + 1.6) endPreview();
}
function endPreview() {
  if (!game.preview) return;
  trash(game.preview.root);
  game.preview = null;
  $('preview').hidden = true;
  scene.fog.far = 80;
  scene.fog.near = 34;
  game.mode = 'playing';
  show(null);
  beginRun();
}
$('preview').addEventListener('pointerdown', () => {
  if (!game.preview) return;
  sfx.tap();
  track('preview_skip', { level: game.level, at: Math.round(game.preview.t * 10) / 10 });
  endPreview();
});

// ---------------------------------------------------------------- mid-run shop
// Trade soldiers for a weapon (this run only) or an upgrade. The world waits while you choose.
function bossOfPlan() {
  return game.plan.events.find((e) => e.type === 'boss') || {};
}
function openRunShop(ev) {
  game.mode = 'shop';
  drag.active = false;
  const list = $('rs-list');
  list.innerHTML = '';
  const b = bossOfPlan();
  $('rs-boss').textContent = t(`rs.boss.${b.kind || 'brute'}`);
  ev.offers.forEach((o, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rs-offer';
    btn.id = `rs-offer-${i}`;
    const weapon = !['rate', 'dmg'].includes(o.id);
    const name = weapon ? t(`gun.${o.id}`) : t(`rs.${o.id}`, { n: Math.round(o.val * 100) });
    const desc = weapon ? `${t(`gun.${o.id}.desc`)} ${t('rs.thisRun')}` : t(`rs.${o.id}.desc`);
    const icon = weapon ? `<span class="weapon-icon w-${o.id}" aria-hidden="true"></span>` : `<span class="rs-up" aria-hidden="true">${o.id === 'rate' ? '»' : '✦'}</span>`;
    btn.innerHTML = `${icon}<span class="rs-text"><b>${name}</b><small>${desc}</small></span><span class="rs-cost">${t('rs.cost', { n: o.cost })}</span>`;
    btn.disabled = game.count <= o.cost || (weapon && game.weapon.id === o.id);
    btn.addEventListener('click', () => buyRunOffer(o));
    list.appendChild(btn);
  });
  $('rs-have').textContent = t('rs.have', { n: fmt(game.count) });
  $('screen-runshop').hidden = false;
  sfx.buy();
  buzz(15);
  track('run_shop_open', { level: game.level });
}
function closeRunShop() {
  $('screen-runshop').hidden = true;
  if (game.mode === 'shop') game.mode = 'playing';
}
function buyRunOffer(o) {
  if (game.count <= o.cost) return;
  setCount(game.count - o.cost, true);
  if (o.id === 'rate') game.buffRate *= 1 + o.val;
  else if (o.id === 'dmg') game.buffDmg *= 1 + o.val;
  else game.weapon = weaponById(o.id);
  recalcGun();
  applyLoadout(game.weapon);
  sfx.buy();
  buzz([15, 20, 15]);
  popup(t('rs.bought', { n: o.cost }), 'gun');
  game.shopPick = o.id;
  track('run_shop_buy', { level: game.level, id: o.id, cost: o.cost });
  closeRunShop();
}
$('btn-rs-skip').addEventListener('click', () => { sfx.tap(); game.shopPick = 'skip'; track('run_shop_buy', { level: game.level, id: 'skip', cost: 0 }); closeRunShop(); });

function recalcGun() {
  const w = game.weapon || WEAPONS[0];
  game.rate = GUN.baseRate * rateMult(save.up.rate) * w.rate * (game.buffRate || 1);
  game.dmg = GUN.baseDamage * damageMult(save.up.dmg) * w.dmg * (game.buffDmg || 1);
}

// ---------------------------------------------------------------- goals and stars
function goalText(g) {
  return t(`goal.${g.g}`, { n: g.n, s: g.s });
}
function runResult(won) {
  return {
    won, final: Math.round(game.count), lost: Math.round(game.lost), targets: game.targets, targetsMissed: game.targetsMissed,
    hostages: game.hostages, hostagesTotal: game.hostagesTotal, chests: game.chests, bossSecs: game.bossSecs || Infinity, time: game.runTime,
  };
}
// Called once per run: when the boss falls (won) or when the squad is gone (lost).
function finishRun(won) {
  if (game.result) return game.result;
  const r = runResult(won);
  r.goals = (game.plan.goals || []).map((g) => goalMet(g, r));
  r.stars = won ? r.goals.filter(Boolean).length : 0;
  game.result = r;
  return r;
}
// Is a goal still possible right now? (for the stars in the HUD)
function goalAlive(g) {
  switch (g.g) {
    case 'loss': return game.lost <= g.n;
    case 'targets': return game.targetsMissed === 0;
    case 'hostages': return game.hostagesMissed === 0;
    case 'boss': return !(boss && boss.introduced && boss.fightT > g.s);
    case 'time': return game.runTime <= g.s;
    case 'chest': return !game.chestMissed;
    default: return true;
  }
}
function renderGoals(el, goals, result) {
  el.innerHTML = '';
  (goals || []).forEach((g, i) => {
    const li = document.createElement('li');
    const state = !result ? 'todo' : result.goals[i] ? 'ok' : 'no';
    li.className = `goal ${state}`;
    li.innerHTML = `<span class="goal-star" aria-hidden="true"></span><span class="goal-text"></span><span class="goal-mark" aria-hidden="true">${state === 'ok' ? '✓' : state === 'no' ? '✕' : ''}</span>`;
    li.querySelector('.goal-text').textContent = goalText(g);
    if (result) li.setAttribute('aria-label', `${goalText(g)}: ${t(state === 'ok' ? 'goal.done' : 'goal.missed')}`);
    el.appendChild(li);
  });
}
function revealStars(n) {
  const stars = [...document.querySelectorAll('#won-stars .star')];
  stars.forEach((st) => st.classList.remove('on'));
  stars.forEach((st, i) => {
    if (i >= n) return;
    setTimeout(() => { st.classList.add('on'); sfx.star(i); buzz(18); }, 350 + i * 330);
  });
}

// HUD: keys in hand, the next target, the boss clock and the three goal stars.
function refreshPuzzleHud() {
  const plan = game.plan;
  const active = (game.mode === 'playing' || game.mode === 'shop') && plan;
  $('hud-keys').hidden = !active || game.keys <= 0;
  $('hud-keys-n').textContent = `×${game.keys}`;
  const next = active && props.list().find((p) => p.type === 'check' && !p.passed);
  const tg = $('hud-target');
  tg.hidden = !next || next.z < -60;
  if (next) {
    const n = Math.round(game.count);
    const ok = n >= next.ev.min && n <= (next.ev.max ?? Infinity);
    tg.className = `chip chip-target ${ok ? 'ok' : n < next.ev.min ? 'low' : 'high'}`;
    $('hud-target-text').textContent = t('tgt.chip', { t: next.ev.max === null ? `≥${next.ev.min}` : next.ev.min === next.ev.max ? `=${next.ev.min}` : `${next.ev.min}–${next.ev.max}`, n });
  }
  const bg = plan && plan.goals && plan.goals.find((g) => g.g === 'boss');
  const clock = $('hud-clock');
  clock.hidden = !active || !bg || !boss || !boss.introduced || boss.dead;
  if (!clock.hidden) {
    clock.textContent = t('boss.clock', { s: boss.fightT.toFixed(1), max: bg.s });
    clock.classList.toggle('late', boss.fightT > bg.s);
  }
  const stars = $('hud-goals');
  stars.hidden = !active || !plan.goals;
  if (!stars.hidden) {
    const html = plan.goals.map((g) => `<i class="${goalAlive(g) ? '' : 'off'}"></i>`).join('');
    if (stars.dataset.html !== html) { stars.innerHTML = html; stars.dataset.html = html; }
  }
  $('shape-ctl').hidden = !(game.mode === 'playing' && shapeUnlocked()) || game.cine;
}
const shapeUnlocked = () => game.level >= 2 || save.level > 2 || !!game.event;

// ---------------------------------------------------------------- level map
// Every level played so far, with its stars. Old saves: cleared levels show a tick until replayed.
function starsOf(n) {
  return (save.stars && save.stars[n]) || 0;
}
function totalStars() {
  return Object.values(save.stars || {}).reduce((a, b) => a + b, 0);
}
function openLevels() {
  const grid = $('levels-grid');
  grid.innerHTML = '';
  const last = Math.max(save.level + 2, Math.min(HAND_LEVELS, 10));
  for (let n = 1; n <= last; n++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lv-cell';
    const open = n <= save.level;
    const st = starsOf(n);
    const legacy = open && n < save.level && !(save.stars && n in save.stars);
    b.disabled = !open;
    if (n === save.level) b.classList.add('next');
    if (levelKind(n) === 'boss') b.classList.add('boss');
    b.innerHTML = `<b>${n}</b><span class="lv-stars">${open && n < save.level ? (legacy ? '<em>✓</em>' : [0, 1, 2].map((i) => `<i class="${i < st ? 'on' : ''}"></i>`).join('')) : ''}</span>`;
    b.setAttribute('aria-label', t('lv.cell', { n, s: st }));
    b.addEventListener('click', () => {
      sfx.tap();
      $('screen-levels').hidden = true;
      startLevel(null, n);
    });
    grid.appendChild(b);
  }
  $('levels-total').textContent = t('lv.total', { n: totalStars(), max: Math.min(save.level - 1, 9999) * 3 });
  $('screen-levels').hidden = false;
}
$('btn-levels').addEventListener('click', () => { unlockAudio(); sfx.tap(); openLevels(); });
$('btn-levels-close').addEventListener('click', () => { sfx.tap(); $('screen-levels').hidden = true; });

// ---------------------------------------------------------------- shape control
for (const b of document.querySelectorAll('[data-shape]')) {
  b.addEventListener('click', () => { unlockAudio(); setShape(b.dataset.shape); markSeen('tutShape'); $('shape-ctl').classList.remove('teach'); });
}

// ================================================================ resize
let camAim = 0;
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Landscape (tablets on their side): a little wider and aimed a little higher, so the far end
  // of the track and a tall boss stay clear of the HUD. Phones are portrait-only and keep their framing.
  camera.fov = camera.aspect < 0.7 ? 62 : camera.aspect < 1 ? 56 : camera.aspect < 1.5 ? 62 : 58;
  camAim = camera.aspect >= 1 ? 0.7 : 0;
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
      const score = (g) => (!g.spec ? game.count : g.spec.op === 'x' ? game.count * g.spec.val : g.spec.op === '÷' ? game.count / g.spec.val : game.count + g.value);
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
      && !(game.plan && game.plan.hand) && q.gates.some((g) => g.spec && g.spec.op === '+' && g.value < 0));
    if (p) {
      const g = p.gates.find((x) => x.spec && x.spec.op === '+' && x.value < 0);
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

  // 4b. Newer enemies, the first time each one shows up (runners from 9, splitters 11, medics 14).
  if (game.mode === 'playing') {
    // Marked as seen as soon as it shows (runners can be gone within a second), then kept up for its time.
    for (const kind of ['runner', 'splitter', 'medic']) {
      const key = `tut_${kind}`;
      if (s[key] && game.tipKind !== kind) continue;
      const sq = squads.find((q) => q.z > -24 && q.z < 2 && q.alive > 0 && q.kinds[kind]);
      if (!sq) { if (game.tipKind === kind) game.tipKind = null; continue; }
      if (!s[key]) {
        markSeen(key);
        game.tipKind = kind;
        game.tutTimer = 0;
        track('enemy_seen', { kind, level: game.level });
      }
      const u = sq.units.find((x) => x.alive && x.kind === kind) || sq.units.find((x) => x.alive) || sq.units[0];
      placeTip(t(`tut.${kind}`), clampX(sq.x + u.ox), 1.9, sq.z + u.oz);
      game.tutScale = 0.4;
      game.tutTimer = (game.tutTimer || 0) + dt;
      if (game.tutTimer > 1.4) { game.tipKind = null; game.tutTimer = 0; }
      return;
    }
  }

  // 4c. Puzzle pieces, the first time each one comes up: a tip next to it, with the game slowed down.
  if (game.mode === 'playing' && game.plan && game.plan.hand) {
    for (const p of props.list()) {
      const kind = p.type === 'wall' ? p.kind : p.type;
      const tip = PUZZLE_TIPS[kind];
      if (!tip || p.z < -21 || p.z > -6) continue;
      const key = `tip_${kind}`;
      if (s[key] && game.tipKind !== key) continue;
      if (!s[key]) { markSeen(key); game.tipKind = key; game.tutTimer = 0; }
      const x = p.type === 'cage' || p.type === 'key' ? p.x : p.type === 'bridge' ? 0 : 0;
      placeTip(t(tip), x, p.type === 'check' ? 3.6 : 2.2, p.z);
      if (tip === 'tut.squeeze' || tip === 'tut.bridge') $('shape-ctl').classList.add('teach');
      game.tutScale = 0.4;
      game.tutTimer = (game.tutTimer || 0) + dt;
      if (game.tutTimer > 1.7) { game.tipKind = null; game.tutTimer = 0; }
      return;
    }
    const lockPair = gatePairs.find((q) => !q.passed && q.z > -20 && q.z < -7 && q.gates.some((g) => g.spec && g.spec.lock));
    if (lockPair && (!s.tip_lock || game.tipKind === 'tip_lock')) {
      if (!s.tip_lock) { markSeen('tip_lock'); game.tipKind = 'tip_lock'; game.tutTimer = 0; }
      const g = lockPair.gates.find((q) => q.spec && q.spec.lock);
      placeTip(t('tut.lock'), g.x, 2.8, lockPair.z);
      game.tutScale = 0.4;
      game.tutTimer = (game.tutTimer || 0) + dt;
      if (game.tutTimer > 1.7) { game.tipKind = null; game.tutTimer = 0; }
      return;
    }
  }
  // 4d. The first time a weak point opens.
  if (placeTipSoon === 'weak' && boss && boss.weakOpen && game.mode === 'playing') {
    placeTip(t('tut.weak'), boss.weakX, 0.4, -0.6);
    game.tutScale = 0.45;
    game.tutTimer = (game.tutTimer || 0) + dt;
    if (game.tutTimer > 1.6) { markSeen('tutWeak'); placeTipSoon = null; game.tutTimer = 0; }
    return;
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

const PUZZLE_TIPS = {
  door: 'tut.squeeze', saws: 'tut.saws', pit: 'tut.pit', log: 'tut.log', bridge: 'tut.bridge', check: 'tut.target',
  key: 'tut.key', fork: 'tut.fork', cage: 'tut.hostage', switch: 'tut.switch', mud: 'tut.mud',
};

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
  if (other.panel) other.panel.visible = false;
  if (other !== gate && other.spec && other.spec.chest) game.chestMissed = true;
  if (!gate.spec) return; // the empty side
  const s = gate.spec;
  if (s.lock) {
    // Locked: a key opens it (and is used up); without one the squad bounces off and nothing happens.
    if (game.keys <= 0) {
      if (s.chest) game.chestMissed = true;
      popAt(t('gate.locked'), gate.x, 2, pair.z, 'bad');
      sfx.locked();
      buzz(40);
      game.shake = Math.max(game.shake, 0.2);
      burst(gate.x, 1.3, pair.z, 10, [sparkMats.barrel, sparkMats.fire[2]], 3);
      return;
    }
    game.keys--;
    refreshPuzzleHud();
    sfx.unlock();
    if (s.chest) {
      gate.panel.visible = false;
      game.chests++;
      setCount(game.count + s.chest.n);
      game.coinsRun += s.chest.coins;
      ui.runCoins.textContent = fmt(game.coinsRun);
      burst(gate.x, 1.3, pair.z, 34, [sparkMats.fire[0], sparkMats.fire[2], sparkMats.heal], 6, [0.08, 0.2]);
      popAt(t('chest.open', { n: s.chest.n, c: s.chest.coins }), gate.x, 2.2, pair.z, 'gun');
      ringWave(gate.x, pair.z, 0xffbe2e);
      hitStop(0.06);
      buzz([20, 30, 20]);
      track('chest', { level: game.level });
      return;
    }
  }
  gate.panel.visible = false;
  const tone = gateLabel(gate, pair.kind).tone;
  const confetti = tone === 'good' || tone === 'lock' ? [sparkMats.ally, sparkMats.fire[2]] : tone === 'gun' ? sparkMats.fire : [sparkMats.enemy, sparkMats.barrel];
  burst(gate.x, 1.3, pair.z, 26, confetti, 5, [0.08, 0.18]);
  ringWave(gate.x, pair.z, tone === 'bad' ? 0xe8453c : tone === 'gun' ? 0xff9628 : 0x4f95ff);
  shatterPanel(gate, pair.z, tone);
  flash(tone === 'bad' ? 'bad' : 'good');
  const wasMystery = s.op === '?';
  let good = true;
  if (pair.kind === 'weapon') {
    if (s.kind === 'rate') game.buffRate *= 1 + s.val;
    else game.buffDmg *= 1 + s.val;
    recalcGun();
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
    popAt(`${wasMystery ? '? ' : ''}${diff >= 0 ? `+${fmt(diff)}` : fmt(diff)}`, gate.x, 2.4, pair.z, good ? 'good' : 'bad', s.op === 'x' ? 1.35 : 1);
    if (game.plan && game.plan.hand) popup(fmt(game.count), good ? 'good' : 'bad');
  }
  if (good && pair.kind === 'gates') mission('doors');
  if (good) {
    if (s.op === 'x') {
      sfx.gateMul(s.val);
      hitStop(0.05);
      game.shake = Math.max(game.shake, 0.14);
      buzz([12, 20, 12]);
    } else sfx.gateGood();
    buzz(15);
  } else {
    sfx.gateBad();
    buzz(50);
    game.shake = 0.25;
  }
  if (game.count <= 0) loseLevel('lose.door');
}

function update(dt) {
  if (game.mode === 'paused' || game.mode === 'shop') return;
  if (game.mode === 'preview') { updatePreview(dt); return; }
  game.time += dt;
  if (game.cine) updateCine(dt);
  const playing = game.mode === 'playing' && !game.cine;
  if (game.pilot && playing) game.pilot(dt); // test hook: the bot steers from inside the loop
  if (playing) game.runTime += dt;

  // ---- forward motion
  let target = RUN.idleSpeed;
  if (playing) target = boss && boss.z > -BOSS.stopDist ? 0 : RUN.speed * (game.mud || 1);
  if (game.cine) target = 0;
  if (game.mode === 'won' || game.mode === 'lost') target = 0;
  if (game.mode === 'bonus') target = game.bonus.done ? 0 : RUN.speed * 0.85;
  game.speed += (target - game.speed) * Math.min(1, dt * 3);
  const dz = game.speed * dt;
  if (playing) game.traveled += dz;

  // ---- steering
  if (playing || game.mode === 'bonus') {
    const k = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (k) crowd.target = clampX(crowd.target + k * 8 * dt, 0.5);
    if (crowd.lane) crowd.target = Math.max(crowd.lane[0] + 0.55, Math.min(crowd.lane[1] - 0.55, crowd.target));
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
      else props.spawn(ev, z);
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
  props.update(dt, dz, playing);
  if (game.lossPopT) {
    game.lossPopT -= dt;
    if (game.lossPopT <= 0) {
      popAt(`-${fmt(game.lossAcc)}`, game.lossPopX, 1.6, -0.5, 'bad');
      game.lossAcc = 0;
      game.lossPopT = 0;
    }
  }
  if (playing && (game.hudT = (game.hudT || 0) - dt) <= 0) { game.hudT = 0.2; refreshPuzzleHud(); }

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
  eliteMesh.begin();
  marksDrawn = 0;
  const enemyStride = playing ? 1 : 0.3;
  for (let i = squads.length - 1; i >= 0; i--) {
    const s = squads[i];
    // Runners notice the army from further away and close in much faster.
    const close = s.z > -(s.fast ? 40 : ENEMY.aggroDist);
    s.z += dz + (close && playing ? ENEMY.walk * (s.fast ? 3.2 : 1) * dt : 0);
    if (close && playing) s.x += Math.sign(crowd.x - s.x) * Math.min(Math.abs(crowd.x - s.x), (s.fast ? 2.2 : 0.7) * dt);
    if (playing) healSquad(s, dt);
    let alive = 0;
    let power = 0;
    let sx = 0;
    for (const u of s.units) {
      if (!u.alive) continue;
      const ux = clampX(s.x + u.ox);
      const uz = s.z + u.oz;
      const reach = u.giant ? 0.75 : u.kind === 'splitter' ? 0.4 : 0.3;
      if (playing && uz > -R * 0.75 - 0.15 - (u.giant ? 0.5 : 0) && uz < R && Math.abs(ux - crowd.x) < R + reach) {
        u.alive = false;
        setCount(game.count - (u.giant ? 6 + Math.floor(game.level / 5) : (u.armored || u.kind === 'splitter' ? 2 : 1) * (u.w || 1)));
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
      if (u.kind) {
        drawKind(u, ux, uz, enemyStride, dt);
      } else if (enemyDrawn < enemyMesh.drawCap) {
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
    s.label.position.set(sx / alive, s.fast ? 1.15 : 1.35, s.z - 0.2);
    s.label.userData.set(power, s.tone);
  }
  for (const h of props.hostages()) {
    eliteMesh.add(h.x, h.z, 0, 0.95, game.time * 9 + h.phase, 0.35, HOSTAGE_LOOK.helmet, HOSTAGE_LOOK.body);
  }
  shieldPlates.count = shieldsDrawn;
  shieldPlates.instanceMatrix.needsUpdate = true;
  enemyMesh.end();
  eliteMesh.end();
  marks.count = marksDrawn;
  marks.instanceMatrix.needsUpdate = true;
  if (marks.instanceColor) marks.instanceColor.needsUpdate = true;

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
        const ux = unitX(u);
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
        // Bosses with mechanics hold their ground and fight; they only walk in once they run out of patience.
        const holding = boss.hold !== null && boss.z >= boss.hold;
        if (!boss.contact && !holding) boss.z += BOSS.walk * dt;
      } else {
        boss.z += dz;
      }
      // A boss with a weak point stays in the middle, so lining up under it is the squad's job.
      const aimX = boss.weak ? 0 : crowd.x * 0.5;
      if (!boss.charge && !boss.punch) boss.x += (aimX - boss.x) * Math.min(1, dt * 0.8);
      updateShield(dt);
      if (boss.kind === 'shield' && boss.shieldMesh) boss.shieldMesh.material.opacity = 0.25 + 0.1 * Math.sin(game.time * 10);
      const fighting = playing && boss.introduced && !game.cine;
      updateWeak(dt, fighting);
      if (fighting) {
        boss.fightT += dt;
        // Out of patience: it stops holding back and walks in.
        if (!boss.angry && boss.fightT > boss.limit) {
          boss.angry = true;
          boss.hold = null;
          showBanner(t('boss.angry'));
          sfx.roar();
          game.shake = 0.5;
        }
        // A swarm boss keeps sending small fast packs; rockets clear them in one go.
        if (boss.kind === 'swarm') {
          boss.swarmIn -= dt;
          if (boss.swarmIn <= 0) {
            boss.swarmIn = 5;
            const n = 5 + Math.floor(game.level / 6);
            spawnSquad({ count: n, hp: 2 + Math.floor(game.level / 15), x: (Math.random() * 2 - 1) * 1.6, fixed: true }, boss.z + 2);
            popAt(t('boss.swarmWave'), boss.x, 3, boss.z + 2, 'bad');
          }
        }
        if (boss.crit && (game.critT = (game.critT || 0) - dt) <= 0) {
          popAt(`-${fmt(boss.crit)}`, boss.weakX, 2.6 * boss.scale, boss.z + 1, 'crit');
          if (boss.crit > boss.max * 0.02) sfx.crit();
          boss.crit = 0;
          game.critT = 0.3;
        }
      }
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
      if (boss.week && !boss.enraged && boss.hp < boss.max * 0.5 && playing) enrage();
      if (boss.enraged) boss.mat.emissive.setRGB(0.35 + Math.sin(game.time * 8) * 0.15 + Math.max(0, boss.flash) * 2, 0.02, 0.05);
      if (!boss.introduced && playing && boss.z > -BOSS.stopDist - 3) {
        boss.introduced = true;
        setMusicIntensity(2);
        sfx.roar();
        game.shake = 0.4;
        buzz(80);
        startCine();
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
      const canAttack = playing && boss.introduced && !game.cine;
      if (canAttack && !boss.charge && !boss.leapt && !boss.punch && boss.z > -24) startLeap();
      if (canAttack && !boss.charge && inReach) {
        if (!boss.punch) {
          boss.punchIn = (boss.punchIn ?? 0.3) - dt;
          if (boss.punchIn <= 0) startPunch();
        }
      } else if (canAttack && !boss.charge && !boss.punch && boss.z > -BOSS.slamRange) {
        boss.slamIn -= dt;
        if (boss.slamIn <= 0) {
          boss.slamIn = Math.max(BOSS.slamMin, BOSS.slamEvery - game.level * 0.08) * (boss.big ? 0.75 : 1) * (boss.enraged ? 0.75 : 1);
          bossAttack();
        }
      }
      if (boss.hp <= 0 && playing) {
        boss.dead = true;
        game.bossSecs = boss.fightT;
        finishRun(true);
        if (boss.marker) boss.marker.visible = false;
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
        hitStop(0.16);
        game.slowmo = 1.3;
        sfx.bigBoom();
        celebrate();
        mission('boss');
        if (boss.big && !boss.week) bump('worldBosses');
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
      for (const u of units) if (Math.abs(unitX(u) - w.gapX) > w.gapHalf) inside++;
      if (inside && units.length) {
        const loss = Math.max(1, Math.round(game.count * (inside / units.length) * 0.5));
        setCount(game.count - loss);
        burst(crowd.x, 0.6, 0, 18, w.energy ? sparkMats.energy : sparkMats.ice, 5);
        sfx.boom();
        game.shake = 0.35;
        popup(`-${fmt(loss)}`, 'bad');
        if (game.count <= 0) loseLevel(w.energy ? 'lose.mega' : 'lose.ice');
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
    if (sl.t < 0) continue;
    if (!sl.group.visible) { sl.group.visible = sl.rock.visible = true; sfx.tick(); }
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
        bullets.push({
          x: unitX(u) + 0.12, z: u.oz - 0.3, dmg: perPellet, vx: spread * GUN.bulletSpeed * 0.25, range: w.range,
          speed: w.speed || 1, shield: w.shield, splash: w.splash,
        });
      }
      if (playing) sfx.shoot();
    }
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const prevZ = b.z;
    b.z += dz - GUN.bulletSpeed * b.speed * dt;
    b.x += (b.vx || 0) * dt;
    let dead = b.z < -(b.range || GUN.range) || Math.abs(b.x) > HALF_W + 0.5;
    if (!dead && playing) dead = bulletHits(b, prevZ);
    if (dead) bullets.splice(i, 1);
  }

  drawCrowd(dt);
  updateFx(dt, dz);

  countLabel.visible = game.mode !== 'home' && game.mode !== 'won' && game.count > 0;
  countLabel.position.set(crowd.x, 1.0 + R * 0.35, -R * 0.2);
  countLabel.userData.set(fmt(game.count));

  // ---- draw bullets
  bulletMesh.count = Math.min(bullets.length, 256);
  const look = game.weapon && game.weapon.look;
  for (let i = 0; i < bulletMesh.count; i++) {
    const b = bullets[i];
    dummy.position.set(b.x, 0.6, b.z);
    dummy.rotation.set(0, 0, 0);
    if (!look) dummy.scale.set(1, 1, game.weapon ? game.weapon.len : 1);
    else if (game.weapon.flame) {
      // Flames swell and spin as they fly, then die out at the end of their short range.
      const k = Math.min(1, Math.max(0, -b.z / b.range));
      const sz = look.w * (0.5 + k * 1.3);
      dummy.scale.set(sz, sz, look.l * (1 + k));
      dummy.rotation.z = b.x * 3 + b.z;
    } else dummy.scale.set(look.w, look.w, look.l);
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
    if (m.position.y < 0 && !u.fall) {
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
    if (game.endTimer > 1.1 && ui.won.hidden && ui.lost.hidden) {
      show(game.mode === 'won' ? ui.won : ui.lost);
      if (game.mode === 'won') {
        cards.onWonShown((n) => { game.shownBonus += n; refreshWonCoins(game.tripled); });
        revealStars(game.result ? game.result.stars : 0);
        $('won-best').hidden = !game.newBest || !game.replay;
      }
    }
  }

  if (season) season.update(dt, dz, game.time);

  // ---- camera
  game.shake = Math.max(0, game.shake - dt * 1.5);
  const sh = game.shake * game.shake;
  const pull = Math.min(R, 3) * 0.9;
  // In a lane split the camera follows the squad further to its side and rises a little,
  // so both lanes stay in view; during the boss intro it swings round to the boss.
  const fork = game.inFork ? 1 : 0;
  game.camFork = (game.camFork || 0) + (fork - (game.camFork || 0)) * Math.min(1, dt * 3);
  const f = game.camFork;
  if (game.cine && boss) {
    const k = Math.min(1, game.cine.t / 0.6) * Math.min(1, (game.cine.dur - game.cine.t) / 0.5);
    const e = k * k * (3 - 2 * k);
    camPos.set(crowd.x * 0.35, 6.6 + pull, 7.4 + pull).lerp(tmpV.set(boss.x + 2.6 * boss.scale, 2.2 * boss.scale, boss.z + 6.5 * boss.scale), e);
    camLook.set(crowd.x * 0.35, camAim, -7.5).lerp(tmpV.set(boss.x, 2.1 * boss.scale, boss.z), e);
  } else {
    camPos.set(crowd.x * (0.35 + 0.25 * f), 6.6 + pull + 1.1 * f, 7.4 + pull + 0.6 * f);
    camLook.set(crowd.x * (0.35 + 0.15 * f), camAim, -7.5 - 1.5 * f);
  }
  camera.position.set(camPos.x + rand(-1, 1) * sh, camPos.y + rand(-1, 1) * sh, camPos.z);
  camera.lookAt(camLook);
}
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const tmpV = new THREE.Vector3();

// The squad. After a win they jump for joy for a moment.
function drawCrowd(dt) {
  const units = crowd.units;
  if (game.cheer > 0) game.cheer -= dt;
  const cheer = Math.max(0, game.cheer || 0);
  allyMesh.begin();
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const k = 1 - Math.exp(-8 * dt);
    u.ox += (u.tx - u.ox) * k;
    u.oz += (u.tz - u.oz) * k;
    const x = unitX(u);
    const lift = cheer ? Math.abs(Math.sin(game.time * 9 + u.phase)) * 0.45 * Math.min(1, cheer) : 0;
    allyMesh.add(x, u.oz, cheer ? Math.sin(game.time * 6 + u.phase) * 0.6 : 0, 1, game.time * 12 + u.phase, Math.min(1, game.speed / 4), null, null, lift);
  }
  allyMesh.end();
}

// Runners, splitters and medics: their own body color and size, plus a mark that says what they do.
function drawKind(u, x, z, stride, dt) {
  const look = KIND_LOOK[u.kind];
  let sc = look.scale;
  if (u.pop > 0) { u.pop -= dt; sc *= 1 - u.pop * 1.6; } // a fresh half grows in
  eliteMesh.add(x, z, Math.PI, sc, game.time * look.run + u.phase, stride, look.helmet, look.body);
  if (u.kind === 'runner') {
    mark(x, 0.62 * sc, z, 0.25 * sc, 0.05 * sc, 0.25 * sc, MARK_COLORS.band);
  } else if (u.kind === 'splitter' || u.kind === 'mini') {
    // The ÷ sign of the bad doors, on the chest: one bar and two dots.
    const fz = z + 0.13 * sc;
    mark(x, 0.37 * sc, fz, 0.15 * sc, 0.035 * sc, 0.03, MARK_COLORS.seam);
    mark(x, 0.44 * sc, fz, 0.045 * sc, 0.045 * sc, 0.03, MARK_COLORS.seam);
    mark(x, 0.3 * sc, fz, 0.045 * sc, 0.045 * sc, 0.03, MARK_COLORS.seam);
  } else if (u.kind === 'medic') {
    const p = 1 + Math.sin(game.time * 6 + u.phase) * 0.12;
    const y = 1.0 * sc;
    mark(x, y, z, 0.3 * p, 0.1 * p, 0.06, MARK_COLORS.cross);
    mark(x, y, z, 0.1 * p, 0.3 * p, 0.06, MARK_COLORS.cross);
  }
}

// Swept bullet test against everything shootable. Returns true when the bullet is used up.
function bulletHits(b, prevZ) {
  const zMin = b.z;
  const zMax = prevZ;
  const within = (z, r) => z + r >= zMin && z - r <= zMax;

  if (boss && !boss.dead && Math.abs(b.x - boss.x) < (boss.big ? BOSS_RULES.bigBodyHalf : BOSS_RULES.bodyHalf) && within(boss.z, boss.big ? 1.2 : 0.8)) {
    let dmg = b.dmg;
    if (boss.kind === 'shield') {
      // Only a share of each shot gets through the shield; the laser cuts straight through.
      const share = b.shield ?? BOSS_RULES.shieldBody;
      dmg *= share;
      if (share < 1 && Math.random() < 0.25) burst(b.x, 1.2, boss.z + 1.4, 1, sparkMats.fire[2], 3);
    } else if (boss.shieldOn) {
      burst(b.x, 1.2, boss.z + 1.4, 1, sparkMats.fire[2], 3);
      return true;
    }
    if (boss.weak) {
      if (boss.weakOpen && Math.abs(b.x - boss.weakX) < BOSS_RULES.weakHalf) {
        dmg *= BOSS_RULES.weak;
        boss.crit = (boss.crit || 0) + dmg;
        if (Math.random() < 0.3) burst(boss.weakX, 1.6 * boss.scale, boss.z + 0.9, 2, [sparkMats.fire[0], sparkMats.fire[2]], 4);
      } else dmg *= BOSS_RULES.armor;
    }
    boss.hp -= dmg;
    boss.flash = 0.12;
    return true;
  }

  for (const s of squads) {
    if (!within(s.z, 3)) continue;
    for (const u of s.units) {
      if (!u.alive) continue;
      const ux = clampX(s.x + u.ox);
      const uz = s.z + u.oz;
      const hw = u.giant ? 0.65 : u.kind === 'splitter' ? 0.4 : u.kind === 'mini' ? 0.22 : 0.3;
      if (Math.abs(ux - b.x) < hw && within(uz, u.giant ? 0.5 : 0.3)) {
        if (u.shield) {
          // The plate blocks the bullet; only a share of it gets through (a quarter, unless the gun says otherwise).
          u.hp -= b.dmg * (b.shield ?? 0.25);
          if (u.hp <= 0) killUnit(s, u, ux, uz);
          else if (Math.random() < 0.3) burst(ux, 0.5, uz + 0.25, 1, sparkMats.fire[2], 2);
          if (b.splash) explode(s, b, ux, uz, u);
          return true;
        }
        if (b.splash) {
          // Rockets spend the whole hit on impact and blow up around it.
          u.hp -= b.dmg;
          if (u.hp <= 0) killUnit(s, u, ux, uz);
          explode(s, b, ux, uz, u);
          return true;
        }
        const used = Math.min(u.hp, b.dmg);
        u.hp -= used;
        b.dmg -= used;
        if (u.hp <= 0) killUnit(s, u, ux, uz);
        if (b.dmg <= 0.001) return true;
      }
    }
  }

  for (const br of barrels) {
    if (Math.abs(br.x - b.x) < 0.5 && within(br.z, 0.45)) {
      if (b.splash) burst(b.x, 0.6, br.z, 5, sparkMats.fire, 4);
      br.hp -= b.dmg;
      br.hitFlash = 0.08;
      br.label.userData.set(br.hp, br.max);
      return true;
    }
  }

  for (const p of gatePairs) {
    if (p.passed || !within(p.z, 0.15)) continue;
    // Hand-designed doors are exact: shots fly through them.
    if (game.plan && game.plan.hand && p.kind === 'gates') continue;
    for (const g of p.gates) {
      if (!g.spec || Math.abs(b.x - g.x) > g.w / 2) continue;
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

// Rocket blast: a share of the hit lands on a few more enemies close to the impact.
function explode(s, b, x, z, hit) {
  const { r, share, max } = b.splash;
  burst(x, 0.5, z, 7, sparkMats.fire, 5, [0.08, 0.2]);
  let n = 0;
  for (const u of s.units) {
    if (n >= max) break;
    if (u === hit || !u.alive) continue;
    const ux = clampX(s.x + u.ox);
    const uz = s.z + u.oz;
    if (Math.hypot(ux - x, uz - z) > r) continue;
    u.hp -= b.dmg * share;
    n++;
    if (u.hp <= 0) killUnit(s, u, ux, uz);
  }
  if (Math.random() < 0.35) sfx.hit();
}

// ================================================================ loop
let last = performance.now();
function frame(now) {
  const realDt = (now - last) / 1000;
  const dt = Math.min(1 / 30, realDt);
  last = now;
  autoQ.sample(realDt, game.mode === 'playing' || game.mode === 'bonus');
  // Slow motion runs on real time so it always lasts the same.
  // Hit-stop: a few frames of near-freeze on big hits, on real time.
  const stop = game.hitstop > 0;
  game.hitstop = Math.max(0, (game.hitstop || 0) - realDt);
  const scale = stop ? 0.04 : game.slowmo > 0 ? 0.3 : (game.tutScale || 1);
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
  setLang(nextLang());
  $('btn-lang').textContent = getLang().toUpperCase();
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

// ---------------------------------------------------------------- leaderboard, review, gifts, share, ads between levels
const leaderboard = createLeaderboard({ game: 'nfa', enabled: CLOUD, t, sfx, track, boards: [{ id: 'level', label: () => t('lb.board.level') }] });
const review = createReview({ game: 'nfa', save, writeSave: () => writeSave(save), t, track, remote, gameName: 'Not a Fake Ad', canShow: () => game.mode === 'won' && $('screen-account').hidden });
const inter = createInterstitials({ admob: admobApi, remote, skip: () => Array.isArray(save.iap) && (save.iap.includes('no_ads') || save.iap.includes('starter_pack')), track });
const giftCoins = (n) => () => { save.coins += n; refreshWallet(); };
const cross = createCrossRewards({
  save, writeSave: () => writeSave(save), t, sfx, track,
  levels: () => account.otherLevels(),
  icons: { tower: promoIcon, choices: promoIcon2 },
  names: { tower: 'Not a Fake Ad: Tower', choices: 'Not a Fake Ad: Choices' },
  onSignIn: () => account.open('settings'),
  rewards: [
    { id: 'tower10', from: 'tower', level: 10, gift: () => t('cr.coins', { n: fmt(2000) }), grant: giftCoins(2000) },
    { id: 'choices10', from: 'choices', level: 10, gift: () => t('cr.coins', { n: fmt(2000) }), grant: giftCoins(2000) },
    { id: 'tower30', from: 'tower', level: 30, gift: () => t('cr.coins', { n: fmt(6000) }), grant: giftCoins(6000) },
    { id: 'choices30', from: 'choices', level: 30, gift: () => t('cr.coins', { n: fmt(6000) }), grant: giftCoins(6000) },
  ],
});
setTimeout(async () => { await cross.refresh(); if (cross.count() && game.mode === 'home') popup(t('cr.new'), 'good'); }, 6000);
let lastShare = null;
let lastWinBig = false;
async function shareMoment() {
  if (!lastShare) return;
  unlockAudio(); sfx.tap();
  renderer.render(scene, camera);
  const shot = document.createElement('canvas');
  shot.width = renderer.domElement.width; shot.height = renderer.domElement.height;
  shot.getContext('2d').drawImage(renderer.domElement, 0, 0);
  const card = makeCard({ shot, title: lastShare.title, line: lastShare.line, logo: 'Not a Fake Ad', sub: t('sh.cta'), colors: { top: '#7db6ef', bottom: '#ffc3a6' } });
  const how = await shareCanvas(card, { title: 'Not a Fake Ad', text: `${t('sh.text', { game: 'Not a Fake Ad' })} ${storeLink('notafakead')}`, file: 'not-a-fake-ad.png' });
  track('share', { kind: 'win', how });
}
function showNotice() {
  const id = remote.get('notice_id', '');
  const n = remote.get('notice', null);
  if (!id || !n || save.noticeSeen === id) return;
  const text = typeof n === 'string' ? n : n[getLang()] || n.en;
  if (!text) return;
  save.noticeSeen = id; writeSave(save);
  setTimeout(() => popup(String(text).slice(0, 160), 'good'), 800);
}
remote.onChange(showNotice);
setTimeout(showNotice, 1500);
$('btn-share-won').addEventListener('click', () => shareMoment());
$('btn-lb').addEventListener('click', () => { unlockAudio(); sfx.tap(); leaderboard.open('level'); });
$('btn-gifts').addEventListener('click', () => { sfx.tap(); $('screen-settings').hidden = true; cross.open(); });

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
$('promo-img2').src = promoIcon2;
$('btn-promo2').addEventListener('click', () => { unlockAudio(); sfx.tap(); track('promo_click', { game: 'choices' }); openLink(storeLink('choices')); });
$('btn-promo').addEventListener('click', () => { unlockAudio(); sfx.tap(); track('promo_click', { game: 'tower' }); openLink(storeLink('tower')); });
const skinHex = (id) => {
  const k = skinById(id);
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  return { body: hex(k.body), head: hex(k.head) };
};
cards = createCards({
  save, writeSave, track, fmt, sfx, buzz, remote, refreshWallet,
  skinColors: skinHex, skinName: (id) => t(`skin.${id}`),
});
bossWeek = createBossWeek({
  save, writeSave, remote, track, fmt, sfx, skinColors: skinHex,
  onPlay: () => startLevel('bossweek'),
});
season = createSeason({
  save, writeSave, remote, scene, allyMesh, track, fmt, sfx, buzz, refreshWallet, skinColors: skinHex,
});
season.refresh();
remote.onChange(() => { season.refresh(); bossWeek.render(); });
track('session_start', { lang: getLang() });
applyStatic();
$('btn-lang').textContent = getLang().toUpperCase();
applyLoadout();
goHome();
applyQuality(save.quality || 'auto');
// First launch asks about ads once; the daily reward waits until that is answered.
// Launch order: ad consent (first time only), daily reward, then the free spin.
// At Christmas the season's gift comes first.
const openDailyAndWheel = () => { if (!meta.openDailyIfReady()) wheel.openIfFree(); };
const openWelcome = () => { if (!season.openGiftIfReady(openDailyAndWheel)) openDailyAndWheel(); };
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
window.__game = { review: () => review.show(), share: () => shareMoment(), cross: () => cross.open(), lb: (b) => leaderboard.open(b), win: (m) => winLevel(m), game, crowd, setCount: (n) => setCount(n), bullets: () => bullets, get boss() { return boss; }, gatePairs: () => gatePairs, squads: () => squads, barrels: () => barrels, slams: () => slams, bonus: () => game.bonus, saws: () => saws, shots: () => shots, lose: (r) => loseLevel(r), save, mem: () => ({ ...renderer.info.memory }),
  account: () => account,
  // Christmas on/off for testing: 'xmas', 'off', or null for the real calendar.
  season: (v) => {
    try { if (v) localStorage.setItem('not-a-fake-ad-season', v); else localStorage.removeItem('not-a-fake-ad-season'); } catch (e) { /* ignore */ }
    season.refresh();
    if (!ui.shop.hidden) renderShop();
    return season.active();
  },
  xmasGift: () => season.openGiftIfReady(null),
  bossWeek: () => startLevel('bossweek'),
  // Puzzle layer, for the bot and screenshot runs.
  props: () => props.list(), shape: (v) => (v ? setShape(v, true) : game.shape), skipPreview: () => endPreview(),
  play: (n) => startLevel(null, n), result: () => game.result, plan: () => game.plan, levels: () => openLevels(),
  shop: () => openRunShop, buy: (i) => { const ev = game.plan.events.find((e) => e.type === 'shop'); if (ev) buyRunOffer(ev.offers[i]); else closeRunShop(); },
  skipShop: () => closeRunShop(), endCine: () => endCine(), levelDef,
  cards: () => cards,
  album: () => cards.openAlbum(),
  quality: () => ({ tier: autoQ.tier(), fx }),
  forgetQuality: () => { autoQ.forget(); applyQuality(save.quality || 'auto'); },
  tier: (n) => applyTier(n),
  toast: (s) => toast(s),
  lang: (l) => { setLang(l); ui.level.textContent = levelTitle(game.level); refreshWallet(); },
};
