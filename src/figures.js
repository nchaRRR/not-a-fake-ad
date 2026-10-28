// Little low-poly soldiers drawn in bulk. Each part (torso, head, helmet,
// backpack, two legs, gun) is one InstancedMesh, so hundreds of soldiers cost
// a handful of draw calls. Legs swing for a running cycle.
import * as THREE from 'three';

const torsoGeo = new THREE.CapsuleGeometry(0.12, 0.14, 4, 10).translate(0, 0.37, 0);
export const headGeo = new THREE.SphereGeometry(0.1, 12, 10).translate(0, 0.6, 0);
const helmetGeo = new THREE.SphereGeometry(0.118, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.615, 0);
const packGeo = new THREE.BoxGeometry(0.17, 0.18, 0.08).translate(0, 0.39, 0.13);
const legGeo = new THREE.BoxGeometry(0.075, 0.22, 0.085).translate(0, -0.11, 0);
// For flying bodies when a soldier is knocked out.
export const corpseGeo = torsoGeo;

const HIP_L = new THREE.Matrix4().makeTranslation(-0.055, 0.25, 0);
const HIP_R = new THREE.Matrix4().makeTranslation(0.055, 0.25, 0);

function part(scene, geo, color, max) {
  const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.55 }), max);
  m.count = 0;
  m.castShadow = true;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}

export class FigureSet {
  constructor(scene, max, colors, gunGeo = null) {
    this.max = max;
    this.body = part(scene, torsoGeo, colors.body, max);
    this.head = part(scene, headGeo, colors.head, max);
    this.helmet = part(scene, helmetGeo, 0xffffff, max);
    this.pack = part(scene, packGeo, colors.pack, max);
    this.legL = part(scene, legGeo, colors.legs, max);
    this.legR = part(scene, legGeo, colors.legs, max);
    this.gun = gunGeo ? part(scene, gunGeo, colors.gun, max) : null;
    this.helmetDefault = new THREE.Color(colors.helmet);
    for (let i = 0; i < max; i++) this.helmet.setColorAt(i, this.helmetDefault);
    this.n = 0;
    this._m = new THREE.Matrix4();
    this._leg = new THREE.Matrix4();
    this._rot = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  get parts() {
    return [this.body, this.head, this.helmet, this.pack, this.legL, this.legR, this.gun].filter(Boolean);
  }

  begin() {
    this.n = 0;
  }

  // x, z: ground position. facing: rotation around y. stride: 0 still, 1 full run.
  add(x, z, facing, scale, phase, stride, helmetColor = null) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const swing = Math.sin(phase) * 0.75 * stride;
    const bob = Math.abs(Math.cos(phase)) * 0.05 * stride;
    this._p.set(x, bob, z);
    this._q.setFromAxisAngle(this._up, facing);
    this._s.setScalar(scale);
    this._m.compose(this._p, this._q, this._s);
    this.body.setMatrixAt(i, this._m);
    this.head.setMatrixAt(i, this._m);
    this.helmet.setMatrixAt(i, this._m);
    this.pack.setMatrixAt(i, this._m);
    if (this.gun) this.gun.setMatrixAt(i, this._m);
    this.helmet.setColorAt(i, helmetColor || this.helmetDefault);
    this._rot.makeRotationX(swing);
    this._leg.multiplyMatrices(this._m, HIP_L).multiply(this._rot);
    this.legL.setMatrixAt(i, this._leg);
    this._rot.makeRotationX(-swing);
    this._leg.multiplyMatrices(this._m, HIP_R).multiply(this._rot);
    this.legR.setMatrixAt(i, this._leg);
  }

  end() {
    for (const p of this.parts) {
      p.count = this.n;
      p.instanceMatrix.needsUpdate = true;
    }
    if (this.helmet.instanceColor) this.helmet.instanceColor.needsUpdate = true;
  }

  setColors({ body, head, helmet, pack, legs, gun }) {
    if (body !== undefined) this.body.material.color.setHex(body);
    if (head !== undefined) this.head.material.color.setHex(head);
    if (pack !== undefined) this.pack.material.color.setHex(pack);
    if (legs !== undefined) {
      this.legL.material.color.setHex(legs);
      this.legR.material.color.setHex(legs);
    }
    if (gun !== undefined && this.gun) this.gun.material.color.setHex(gun);
    if (helmet !== undefined) this.helmetDefault.setHex(helmet);
  }
}
