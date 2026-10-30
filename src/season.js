// Christmas season, 1 December to 6 January on the phone's clock: snow over the track,
// a garland on the home screen, Santa hats on the squad, a coin gift on the first launch
// of each day and one free festive look. Outside the season none of it exists.
// Remote config "season": "xmas" forces it on, "off" forces it off. For tests,
// localStorage "not-a-fake-ad-season" (or window.__game.season()) does the same and wins.
import * as THREE from 'three';
import { t } from './i18n.js';

const FORCE_KEY = 'not-a-fake-ad-season';
const SNOW = 700;

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function inXmasWindow(d = new Date()) {
  const m = d.getMonth();
  const day = d.getDate();
  return m === 11 || (m === 0 && day <= 6);
}

function forced() {
  try { return localStorage.getItem(FORCE_KEY) || ''; } catch (e) { return ''; }
}

export function createSeason(ctx) {
  const { save, writeSave, remote, scene, allyMesh, track, fmt, sfx, buzz, refreshWallet, skinColors } = ctx;
  const $ = (id) => document.getElementById(id);
  let on = false;
  let snow = null;
  let snowShare = 1;

  function active() {
    const f = forced();
    if (f === 'xmas') return true;
    if (f === 'off') return false;
    const r = remote.get('season', '');
    if (r === 'xmas') return true;
    if (r === 'off') return false;
    return inXmasWindow();
  }

  // ---------------------------------------------------------------- snow
  function flakeTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }

  function makeSnow() {
    const pos = new Float32Array(SNOW * 3);
    const drift = new Float32Array(SNOW);
    for (let i = 0; i < SNOW; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 14;
      pos[i * 3 + 1] = Math.random() * 14;
      pos[i * 3 + 2] = 3 - Math.random() * 63; // not too close to the camera, or a flake turns into a big blur
      drift[i] = Math.random() * 6.28;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.22, map: flakeTexture(), transparent: true, depthWrite: false, color: 0xffffff, opacity: 0.95 });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    pts.userData.drift = drift;
    scene.add(pts);
    return pts;
  }

  // Flakes fall, sway, and ride along with the track so they feel like part of the world.
  function update(dt, dz, time) {
    if (!on || !snow) return;
    const p = snow.geometry.attributes.position;
    const a = p.array;
    const drift = snow.userData.drift;
    const n = Math.floor(SNOW * snowShare);
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      a[j + 1] -= (1.2 + (i % 5) * 0.25) * dt;
      a[j] += Math.sin(time * 0.8 + drift[i]) * 0.4 * dt;
      a[j + 2] += dz;
      if (a[j + 1] < 0) a[j + 1] += 14;
      if (a[j + 2] > 3) a[j + 2] -= 63;
    }
    snow.geometry.setDrawRange(0, n);
    p.needsUpdate = true;
  }

  // ---------------------------------------------------------------- on / off
  function refresh() {
    on = active();
    document.body.classList.toggle('xmas', on);
    $('xmas-garland').hidden = !on;
    allyMesh.setHat(on);
    if (on && !snow) snow = makeSnow();
    if (snow) snow.visible = on;
    return on;
  }

  // Light graphics draw fewer flakes.
  function setDetail(share) { snowShare = share; }

  // ---------------------------------------------------------------- daily gift
  function state() {
    if (!save.xmas || typeof save.xmas !== 'object') save.xmas = { day: '', skin: false };
    return save.xmas;
  }
  const giftReady = () => on && state().day !== dayKey();
  // Christmas Eve to Boxing Day pay more.
  const giftCoins = () => {
    const d = new Date();
    return d.getMonth() === 11 && d.getDate() >= 24 && d.getDate() <= 26 ? 750 : 250;
  };
  const skinFree = () => on && !save.owned.skins.includes('festive');

  let after = null;
  function openGiftIfReady(next) {
    if (!giftReady()) return false;
    after = next;
    $('xmas-coins').textContent = fmt(giftCoins());
    const c = skinColors('festive');
    $('xmas-skin').hidden = !skinFree();
    $('xmas-skin-swatch').style.cssText = `--b:${c.body};--h:${c.head}`;
    $('screen-xmas').hidden = false;
    track('xmas_gift_shown', {});
    return true;
  }

  function claimSkin(where) {
    if (!skinFree()) return false;
    save.owned.skins.push('festive');
    state().skin = true;
    track('xmas_skin', { where });
    return true;
  }

  $('btn-xmas-claim').addEventListener('click', () => {
    const st = state();
    if (st.day === dayKey()) return;
    const coins = giftCoins();
    st.day = dayKey();
    save.coins += coins;
    const skin = claimSkin('gift');
    writeSave(save);
    track('xmas_gift', { coins, skin });
    sfx.win();
    buzz([20, 30, 20]);
    refreshWallet();
    $('screen-xmas').hidden = true;
    if (after) setTimeout(after, 300);
    after = null;
  });

  return { refresh, update, active: () => on, openGiftIfReady, claimSkin, skinFree, setDetail, label: () => t('xmas.title') };
}
