// The one 3D world used by scenes 3, 4, 8 and 9. Built once; posed from timeline state only.
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../../vendor/jsm/RoundedBoxGeometry.js';
import { RoomEnvironment } from '../../vendor/jsm/RoomEnvironment.js';

// Every value here is written only by the root GSAP timeline.
export const S = {
  tx: 1.8, ty: 0.4, tz: 0, r: 15, az: -0.3, el: 0.73, fov: 28,
  debtX: 0, bonusLift: 0, collX: 0, wafer: 0, ring: 1.0, colScale: 1, vz: 1, vx: 0,
};

export const LANES = { L: -3.6, M: 0, R: 3.6, T: 7.2 };
export const BOND_X = 13.5;
const SEG = 0.4, NSEG = 5;   // bond carried ≈ 1.99× minimum → 5 × 0.4 = 2.0 units; 1.0 unit = the minimum

export async function createWorld(canvas, W, H, VERT = false) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(W, H, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.0;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  const cam = new THREE.PerspectiveCamera(S.fov, W / H, 0.1, 200);

  // product-shoot light: soft key from front-left, cool rim from behind-right, low fill
  const key = new THREE.DirectionalLight(0xfff6ec, 3.1); key.position.set(-6, 10, 8);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -12, right: 22, top: 12, bottom: -12, near: 1, far: 60 });
  key.target.position.set(4, 0, 0); scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 3.0); rim.position.set(9, 6, -11); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.18));
  // product-shot accents: a camera-left key on the bond plinth and a cool edge light behind it
  const bk = new THREE.SpotLight(0xffffff, 70, 30, 0.42, 0.5, 1.6); bk.position.set(BOND_X - 6, 7, 6); bk.target.position.set(BOND_X, 1, 0); scene.add(bk, bk.target);
  const be = new THREE.SpotLight(0xcfe0ff, 90, 30, 0.5, 0.6, 1.6); be.position.set(BOND_X + 5, 5, -6); be.target.position.set(BOND_X, 1, 0); scene.add(be, be.target);

  const rb = (w, h, d, rad = 0.06) => new RoundedBoxGeometry(w, h, d, 4, rad);
  const mat = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, metalness: 0.0, clearcoat: 0.3, clearcoatRoughness: 0.4, ...o });
  const add = (m, parent = scene, cast = true) => { m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; };

  // ground: shadow catcher, a model base board with inlaid lanes and a market tray
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.ShadowMaterial({ opacity: 0.45 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.3; floor.receiveShadow = true; scene.add(floor);
  const baseM = mat(0x2e2e2e, { roughness: 0.8, clearcoat: 0 });
  add(new THREE.Mesh(rb(14.8, 0.3, 5.0, 0.08), baseM)).position.set(1.8, -0.15, 0);
  const laneM = mat(0x252525, { roughness: 0.9, clearcoat: 0 });
  for (const k of ['L', 'M', 'R']) add(new THREE.Mesh(rb(3.4, 0.02, 3.6, 0.008), laneM), scene, false).position.set(LANES[k], 0.01, 0);
  add(new THREE.Mesh(rb(2.4, 0.03, 1.9, 0.012), mat(0x1e1e1e, { roughness: 0.95, clearcoat: 0 })), scene, false).position.set(LANES.T, 0.015, 0);

  // collateral (graphite), bonus (lime, thin, sits on it), repayment (light)
  const coll = add(new THREE.Mesh(rb(3.0, 0.6, 2.2, 0.07), mat(0x47474b, { roughness: 0.38, metalness: 0.25 })));
  const bonus = add(new THREE.Mesh(rb(3.0, 0.16, 2.2, 0.05), mat(0xddff46, { roughness: 0.42, clearcoat: 0.35 })));
  const debt = add(new THREE.Mesh(rb(2.0, 0.42, 1.5, 0.06), mat(0xe9e9e9, { roughness: 0.5 })));

  // the feed's bond on its own plinth: blue segments, a lime ring at the required level
  const bondG = new THREE.Group(); bondG.position.set(BOND_X, 0, 0); scene.add(bondG);
  add(new THREE.Mesh(rb(2.6, 0.3, 2.6, 0.08), baseM), bondG).position.y = -0.15;
  const segM = mat(0x405bff, { roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.15 });
  for (let i = 0; i < NSEG; i++) add(new THREE.Mesh(rb(1.4, SEG - 0.015, 1.4, 0.05), segM), bondG).position.y = SEG / 2 + i * SEG;
  const wafer = add(new THREE.Mesh(rb(1.4, 0.1, 1.4, 0.035), segM), bondG);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.035, 12, 128),
    new THREE.MeshPhysicalMaterial({ color: 0xddff46, roughness: 0.35, emissive: 0x262e06 }));
  ring.rotation.x = Math.PI / 2; bondG.add(ring);

  const A = {}; const v = new THREE.Vector3();
  const project = (x, y, z) => { v.set(x, y, z).project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };

  function pose() {
    // 9:16: same shots, wider lens and a longer throw so the subject keeps its width
    const fov = VERT ? S.fov * 1.5 : S.fov, rr = VERT ? S.r * 1.32 * S.vz : S.r;
    cam.fov = fov; cam.aspect = W / H; cam.updateProjectionMatrix();
    const ce = Math.cos(S.el);
    const tx = (VERT && S.tx < 10 ? S.tx * 0.5 : S.tx) + (VERT ? S.vx : 0);
    cam.position.set(tx + rr * ce * Math.sin(S.az), S.ty + rr * Math.sin(S.el), S.tz + rr * ce * Math.cos(S.az));
    cam.lookAt(tx, S.ty, S.tz); cam.updateMatrixWorld();

    const cx = LANES.M + S.collX;
    coll.position.set(cx, 0.32, 0);
    bonus.position.set(cx, 0.62 + 0.08 + 0.005 + S.bonusLift, 0);
    bonus.rotation.z = -0.03 * Math.sin(Math.min(1, S.bonusLift / 0.9) * Math.PI / 2) * (S.bonusLift > 0.001 ? 1 : 0);
    const dx = LANES.R + (LANES.T - LANES.R) * S.debtX;
    debt.position.set(dx, 0.21 + 0.035 + Math.sin(Math.PI * S.debtX) * 1.3, 0);
    debt.rotation.z = Math.sin(Math.PI * S.debtX) * -0.12;
    const sc = S.colScale; bondG.scale.setScalar(sc);
    wafer.position.set(S.wafer * 2.6, NSEG * SEG + 0.05 + Math.sin(Math.PI * Math.min(1, S.wafer) * 0.5) * 0.9, S.wafer * 0.6);
    wafer.visible = S.wafer < 0.999;
    ring.position.y = S.ring * 1.0;

    const bt = bonus.position, hy = 0.081;
    A.bonusTopQuad = [[-1.42, -1.04], [1.42, -1.04], [1.42, 1.04], [-1.42, 1.04]].map(([ddx, ddz]) => project(bt.x + ddx, bt.y + hy, bt.z + ddz));
    A.bonusSide = project(bt.x + 1.5, bt.y, 1.1);
    A.bonusC = project(bt.x, bt.y + hy, bt.z);
    A.coll = project(cx - 1.5, 0.35, 1.1);
    A.debt = project(debt.position.x + 1.0, debt.position.y + 0.1, 0.75);
    A.laneL = project(LANES.L, 0.02, 2.25); A.laneR = project(LANES.R, 0.02, 2.25); A.laneT = project(LANES.T, 0.02, 2.25);
    A.ringPts = [];
    for (let i = 0; i <= 96; i++) { const a = -Math.PI / 2 + i / 96 * Math.PI * 2; A.ringPts.push(project(bt.x + Math.cos(a) * 2.25, bt.y + hy, bt.z + Math.sin(a) * 1.75)); }
    A.wafer = project(BOND_X + (wafer.position.x + 0.7) * sc, wafer.position.y * sc, wafer.position.z * sc);
    A.ring = project(BOND_X + 1.1 * sc, ring.position.y * sc, 0);
    A.col = project(BOND_X - 0.75 * sc, 1.0 * sc, 0.7 * sc);
    const pts = [];
    for (const x of [-0.7, 0.7]) for (const y of [0, NSEG * SEG]) for (const z of [-0.7, 0.7]) pts.push(project(BOND_X + x * sc, y * sc, z * sc));
    A.colRect = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
    return A;
  }
  function render() { pose(); r.render(scene, cam); return A; }
  pose();
  await r.compileAsync(scene, cam);
  r.render(scene, cam);
  return { render, pose, A, S };
}
