// Scene, camera, lights and the static floating track. applyTheme() repaints
// all of it for a world (plains, desert, snow, night city, lava).
import * as THREE from 'three';
import { HALF_W } from './config.js';
import { THEMES } from './themes.js';

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffdccb, 34, 80);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xffc3a6, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0de, 1.6);
  sun.position.set(-6, 14, 6);
  sun.target.position.set(0, 0, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 24, bottom: -24, near: 1, far: 70 });
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  // The track texture is a canvas we repaint per world and scroll every frame.
  const trackCanvas = document.createElement('canvas');
  trackCanvas.width = 256;
  trackCanvas.height = 256;
  const trackTex = new THREE.CanvasTexture(trackCanvas);
  trackTex.colorSpace = THREE.SRGBColorSpace;
  trackTex.wrapS = THREE.RepeatWrapping;
  trackTex.wrapT = THREE.RepeatWrapping;
  trackTex.repeat.set(1, 50);
  trackTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const trackMat = new THREE.MeshStandardMaterial({ map: trackTex, roughness: 0.9 });
  const track = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, 200), trackMat);
  track.rotation.x = -Math.PI / 2;
  track.position.z = -90;
  track.receiveShadow = true;
  scene.add(track);

  const slabMat = new THREE.MeshStandardMaterial({ color: 0xf7c9b4, roughness: 0.8 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 + 0.3, 0.6, 200), slabMat);
  slab.position.set(0, -0.31, -90);
  scene.add(slab);

  const railMat = new THREE.MeshStandardMaterial({ color: 0xff8a7a, roughness: 0.5, emissive: 0x401010 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 200), railMat);
    rail.position.set(side * (HALF_W + 0.09), 0.13, -90);
    rail.castShadow = true;
    scene.add(rail);
  }

  const underMat = new THREE.MeshStandardMaterial({ color: 0xf3c2b0, roughness: 1 });
  const under = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), underMat);
  under.rotation.x = -Math.PI / 2;
  under.position.set(0, -9, -100);
  scene.add(under);

  let skyTex = null;
  let current = null;

  function applyTheme(theme) {
    if (current === theme.id) return;
    current = theme.id;
    if (skyTex) skyTex.dispose();
    skyTex = skyTexture(theme.sky);
    scene.background = skyTex;
    scene.fog.color.setHex(theme.fog);
    paintTrack(trackCanvas, theme.track);
    trackTex.needsUpdate = true;
    slabMat.color.setHex(theme.slab);
    underMat.color.setHex(theme.under);
    // Lava glows from below; everything else is a plain far ground.
    underMat.emissive.setHex(theme.id === 'lava' ? 0xff3a00 : 0x000000);
    underMat.emissiveIntensity = theme.id === 'lava' ? 0.9 : 0;
    railMat.color.setHex(theme.rail);
    railMat.emissive.setHex(theme.id === 'night' ? theme.rail : 0x401010);
    railMat.emissiveIntensity = theme.id === 'night' ? 0.8 : 1;
    hemi.color.setHex(theme.hemi[0]);
    hemi.groundColor.setHex(theme.hemi[1]);
    hemi.intensity = theme.hemi[2];
    sun.color.setHex(theme.sun[0]);
    sun.intensity = theme.sun[1];
    renderer.toneMappingExposure = theme.exposure;
    document.body.style.background = theme.body;
  }

  applyTheme(THEMES[0]);
  return { renderer, scene, camera, trackTex, applyTheme };
}

function skyTexture(stops) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, stops[0]);
  gr.addColorStop(0.5, stops[1]);
  gr.addColorStop(0.78, stops[2]);
  gr.addColorStop(1, stops[3]);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function paintTrack(c, [a, b, mark]) {
  const s = c.width;
  const g = c.getContext('2d');
  g.fillStyle = a;
  g.fillRect(0, 0, s, s);
  g.fillStyle = b;
  g.fillRect(0, 0, s, s / 2);
  g.fillStyle = mark;
  g.fillRect(s / 2 - 3, s * 0.55, 6, s * 0.35);
}
