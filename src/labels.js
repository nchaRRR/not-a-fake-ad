// Text drawn onto canvases and shown in the 3D world:
// gate panels, soldier counts, barrel and boss health.
import * as THREE from 'three';

const FONT = '"Baloo 2", "Arial Rounded MT Bold", system-ui, sans-serif';

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function strokeText(g, text, x, y, size, fill) {
  g.font = `800 ${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.16;
  g.strokeStyle = '#2b2140';
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

function makeCanvasTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas, g: canvas.getContext('2d'), tex };
}

// Upright translucent gate panel.
export function makeGatePanel(width, height) {
  const { canvas, g, tex } = makeCanvasTexture(256, Math.round((256 * height) / width));
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.renderOrder = 2;
  let last = '';
  mesh.userData.draw = (title, sub, tone) => {
    const key = title + '|' + sub + '|' + tone;
    if (key === last) return;
    last = key;
    const W = canvas.width;
    const H = canvas.height;
    const fills = {
      good: ['rgba(47,124,246,0.55)', '#9cc4ff'],
      bad: ['rgba(232,69,60,0.55)', '#ffb0a8'],
      gun: ['rgba(255,150,40,0.6)', '#ffd08a'],
      mystery: ['rgba(138,92,240,0.62)', '#cbbfff'],
      // Opaque versions for store art, where the sky behind would wash the colour out.
      goodSolid: ['rgba(47,124,246,0.94)', '#9cc4ff'],
      badSolid: ['rgba(232,69,60,0.94)', '#ffb0a8'],
    }[tone];
    g.clearRect(0, 0, W, H);
    roundRect(g, 6, 6, W - 12, H - 12, 22);
    g.fillStyle = fills[0];
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = fills[1];
    g.stroke();
    if (sub) {
      strokeText(g, sub, W / 2, H * 0.3, 34, '#ffffff');
      strokeText(g, title, W / 2, H * 0.6, 84, '#ffffff');
    } else {
      strokeText(g, title, W / 2, H * 0.5, 104, '#ffffff');
    }
    tex.needsUpdate = true;
  };
  return mesh;
}

// Floating count bubble that always faces the camera.
export function makeCountLabel(scale = 1.2, fill = '#ffffff') {
  const { canvas, g, tex } = makeCanvasTexture(256, 128);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale * 2, scale, 1);
  sprite.renderOrder = 5;
  let last = null;
  sprite.userData.set = (text, color = fill) => {
    const key = text + color;
    if (key === last) return;
    last = key;
    g.clearRect(0, 0, 256, 128);
    strokeText(g, String(text), 128, 68, 92, color);
    tex.needsUpdate = true;
  };
  return sprite;
}

// Health bar with number, for barrels and the boss.
export function makeHealthLabel(scale = 1.2) {
  const { canvas, g, tex } = makeCanvasTexture(256, 112);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale * 2.2, scale, 1);
  sprite.renderOrder = 5;
  let last = '';
  sprite.userData.set = (hp, max) => {
    const shown = Math.max(0, Math.ceil(hp));
    const frac = Math.max(0, Math.min(1, hp / max));
    const key = shown + '|' + Math.round(frac * 60);
    if (key === last) return;
    last = key;
    g.clearRect(0, 0, 256, 112);
    strokeText(g, shown.toLocaleString('en-US'), 128, 38, 60, '#ffffff');
    roundRect(g, 20, 78, 216, 24, 12);
    g.fillStyle = '#2b2140';
    g.fill();
    if (frac > 0) {
      roundRect(g, 24, 82, Math.max(16, 208 * frac), 16, 8);
      g.fillStyle = frac > 0.35 ? '#ff6f5e' : '#ffbe2e';
      g.fill();
    }
    tex.needsUpdate = true;
  };
  return sprite;
}

// Flat label lying on the track, used for the multiplier tiles.
export function makeFloorLabel(width, depth, text, color) {
  const W = 512;
  const H = Math.round((W * depth) / width);
  const { g, tex } = makeCanvasTexture(W, H);
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(0, 0, W, H * 0.18);
  g.fillStyle = 'rgba(43,33,64,0.25)';
  g.fillRect(0, H * 0.86, W, H * 0.14);
  strokeText(g, text, W / 2, H * 0.5, Math.min(H * 0.62, 150), '#ffffff');
  tex.needsUpdate = true;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}
