// Browser side of scripts/icons.mjs: stages one icon shot with the game's own
// track, doors and soldiers, renders it once, and sets window.__done.
// Settings arrive in window.ICON = { concept, px, transparent }.
import * as THREE from 'three';
import { createWorld } from '../src/world.js';
import { FigureSet } from '../src/figures.js';
import { makeGatePanel, makeCountLabel } from '../src/labels.js';
import { COLORS, HALF_W } from '../src/config.js';

const P = window.ICON;
const canvas = document.getElementById('c');
const W = P.w || P.px;
const H = P.h || P.px;
canvas.width = W;
canvas.height = H;
// Transparent layers need an alpha canvas; the game's world asks for an opaque one.
const getCtx = canvas.getContext.bind(canvas);
canvas.getContext = (type, attrs) => getCtx(type, { ...attrs, alpha: !!P.transparent });
const { renderer, scene, camera } = createWorld(canvas);
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
camera.aspect = W / H;

const shade = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();
const gunGeo = new THREE.BoxGeometry(0.055, 0.055, 0.28).translate(0.13, 0.36, -0.2);
const allies = new FigureSet(scene, 400, {
  body: COLORS.ally, head: COLORS.allyHead, helmet: shade(COLORS.ally, 0.65),
  pack: shade(COLORS.ally, 0.55), legs: 0x2b2140, gun: 0x2b2140,
}, gunGeo);
const enemies = new FigureSet(scene, 200, {
  body: COLORS.enemy, head: 0xf0c8a8, helmet: shade(COLORS.enemy, 0.6), pack: shade(COLORS.enemy, 0.5), legs: 0x3a1a1a,
});

const postMat = new THREE.MeshStandardMaterial({ color: 0xfff7ef, roughness: 0.5 });
function gate(x, z, w, h, title, tone, sub = '') {
  const node = new THREE.Group();
  const panel = makeGatePanel(w, h);
  panel.position.set(0, h / 2 + 0.2, 0);
  panel.userData.draw(title, sub, tone);
  const postGeo = new THREE.BoxGeometry(0.16, h + 0.6, 0.16);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, postMat);
    p.position.set((s * w) / 2, (h + 0.6) / 2, 0);
    p.castShadow = true;
    node.add(p);
  }
  node.add(panel);
  node.position.set(x, 0, z);
  scene.add(node);
  return node;
}

// Sunflower-packed crowd around (cx, cz).
function crowd(set, cx, cz, n, spread, facing, opts = {}) {
  set.begin();
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(i + 0.5) * spread;
    const a = i * 2.39996;
    const x = cx + Math.cos(a) * r * (opts.wide || 1);
    const z = cz + Math.sin(a) * r * (opts.deep || 1);
    set.add(x, z, facing + Math.sin(i * 7.1) * 0.12, opts.scale || 1, i * 1.7, 1);
  }
  set.end();
}

function look(pos, target, fov) {
  // zoomOut > 1 widens the view so the usual frame sits in the middle (Android adaptive bleed).
  const z = P.zoomOut || 1;
  camera.fov = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * z) * 180) / Math.PI;
  camera.position.set(...pos);
  camera.lookAt(...target);
  camera.updateProjectionMatrix();
}

const C = P.concept;
if (C === 'feature') {
  // Wide Play banner: the door choice on the right, room for the logo on the left.
  gate(-HALF_W / 2, -4, HALF_W - 0.25, 2.1, 'x2', 'goodSolid');
  gate(HALF_W / 2, -4, HALF_W - 0.25, 2.1, '-10', 'badSolid');
  crowd(allies, -1.2, 0.4, 60, 0.2, 0, { deep: 0.7 });
  const n = makeCountLabel(1.2);
  n.userData.set(60);
  n.position.set(-1.2, 1.6, 0.2);
  scene.add(n);
  look([-4.2, 4.4, 8.5], [-4.2, 0.9, -3.0], 40);
} else if (C === 'splash') {
  // Splash: the run seen from behind, the logo goes in the open sky above the doors.
  gate(-HALF_W / 2, -9, HALF_W - 0.25, 2.1, 'x2', 'goodSolid');
  gate(HALF_W / 2, -9, HALF_W - 0.25, 2.1, '-10', 'badSolid');
  crowd(allies, 0, 0.8, 70, 0.2, 0, { deep: 0.7 });
  look([0, 3.2, 6.5], [0, 2.4, -6], 60);
} else if (C === 'doors') {
  // The classic ad frame: army runs at a good door and a bad door.
  gate(-HALF_W / 2, -4, HALF_W - 0.25, 2.1, 'x2', 'goodSolid');
  gate(HALF_W / 2, -4, HALF_W - 0.25, 2.1, '-10', 'badSolid');
  crowd(allies, -1.2, 0.4, 46, 0.2, 0, { deep: 0.7 });
  const n = makeCountLabel(1.2);
  n.userData.set(46);
  n.position.set(-1.2, 1.6, 0.2);
  scene.add(n);
  look([0, 4.0, 4.6], [0, 0.9, -3.0], 50);
} else if (C === 'pour') {
  // One huge x2 door, the army pouring out of it toward you.
  gate(0, -1.5, 5.2, 3.2, 'x2', 'goodSolid');
  allies.begin();
  let i = 0;
  for (let row = 0; row < 14; row++) {
    for (let k = 0; k < 9; k++) {
      const z = -6 + row * 0.62 + (k % 2) * 0.3;
      const x = (k - 4) * 0.62 + Math.sin(row * 3.1 + k) * 0.12;
      if (Math.abs(x) > 2.9) continue;
      allies.add(x, z, Math.PI + Math.sin(i * 5.3) * 0.15, 1, i++ * 1.3, 1);
    }
  }
  allies.end();
  look([0, 1.15, 5.8], [0, 1.55, -1.5], 50);
} else if (C === 'hero') {
  // One soldier up close, the door and the army behind him.
  gate(0, -4, 5.2, 3.0, 'x2', 'good');
  allies.begin();
  allies.add(0.15, 1.5, -0.35, 2.1, 0.6, 0.55);
  let i = 0;
  for (let row = 0; row < 6; row++) {
    for (let k = 0; k < 8; k++) {
      const x = (k - 3.5) * 0.7 + (row % 2) * 0.35;
      const z = -2.7 + row * 0.55;
      if (Math.abs(x) < 0.7 && z > -1) continue;
      allies.add(x, z, Math.PI + Math.sin(i * 3.7) * 0.2, 1, i++ * 1.9, 1);
    }
  }
  allies.end();
  look([0.25, 1.35, 4.4], [0.1, 1.35, -1], 46);
} else if (C === 'versus') {
  // Blue army against a red squad, door overhead.
  gate(0, -6.5, 5.2, 2.6, 'x2', 'goodSolid');
  crowd(allies, -0.1, 1.2, 70, 0.21, 0, { wide: 1.15, deep: 0.6 });
  crowd(enemies, 0, -2.6, 14, 0.24, Math.PI, { wide: 1.3, deep: 0.5 });
  look([0, 3.6, 5.4], [0, 0.6, -2.6], 52);
}

if (P.transparent) {
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  scene.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && o.geometry && o.geometry.parameters && (o.geometry.parameters.width >= 6 || o.geometry.parameters.depth >= 100)) o.visible = false;
  });
  scene.fog = null;
}

// Fonts first, so the canvas labels use Baloo.
document.fonts.ready.then(() => {
  scene.traverse((o) => { if (o.material && o.material.map) o.material.map.needsUpdate = true; });
  setTimeout(() => {
    renderer.render(scene, camera);
    window.__done = true;
  }, 50);
});
