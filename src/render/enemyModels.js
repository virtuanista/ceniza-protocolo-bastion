// Modelos procedurales de engendros: jerarquía de articulaciones animada por código.
// Geometrías y materiales compartidos por tipo para ahorrar memoria.
import * as THREE from 'three';
import { getTexture } from './textures.js';

const geoCache = new Map();
function geo(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }
const box = (w, h, d) => geo(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
const caps = (r, l) => geo(`c${r}|${l}`, () => new THREE.CapsuleGeometry(r, l, 3, 8));
const sph = (r, seg = 10) => geo(`s${r}|${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)));
const cone = (r, h) => geo(`k${r}|${h}`, () => new THREE.ConeGeometry(r, h, 6));

const matCache = new Map();
export function enemyMaterials(type, m) {
  if (matCache.has(type)) return matCache.get(type);
  const fleshTex = getTexture('flesh', 1, type.length * 13 + 1, 256);
  const mats = {
    skin: new THREE.MeshStandardMaterial({ map: fleshTex, color: m.skin, roughness: 0.75, metalness: 0.05 }),
    cloth: new THREE.MeshStandardMaterial({ color: m.cloth, roughness: 0.95 }),
    eye: new THREE.MeshBasicMaterial({ color: m.eye }),
    gore: new THREE.MeshStandardMaterial({ color: 0x5a0808, roughness: 0.4, emissive: 0x200000 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ color: m.helmet || 0x606468, roughness: 0.4, metalness: 0.8 }),
    core: new THREE.MeshBasicMaterial({ color: m.core || 0xff8020 }),
    sac: new THREE.MeshStandardMaterial({ color: 0x9adf40, roughness: 0.25, emissive: 0x204000, transparent: true, opacity: 0.85 }),
  };
  matCache.set(type, mats);
  return mats;
}

function part(parent, geometry, material, x, y, z, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (name) mesh.name = name;
  mesh.castShadow = false;
  parent.add(mesh);
  return mesh;
}
function joint(parent, x, y, z, name) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.name = name;
  parent.add(g);
  return g;
}

// Devuelve {root, j: {hips, torso, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR}, hit: {...}, mats}
export function buildEnemyModel(def) {
  const m = def.model;
  const mats = enemyMaterials(def.id, m);
  const root = new THREE.Group();
  const body = new THREE.Group(); // nodo para inclinar/escalar todo el cuerpo
  root.add(body);
  const s = m.scale || 1;
  body.scale.setScalar(s);
  const j = {};
  const build = m.build;

  if (build === 'crawler') {
    j.hips = joint(body, 0, 0.55, 0, 'hips');
    j.torso = joint(j.hips, 0, 0.05, 0.1, 'torso');
    j.torso.rotation.x = 1.25;
    part(j.torso, caps(0.2, 0.55), mats.skin, 0, 0.32, 0);
    part(j.torso, box(0.3, 0.15, 0.2), mats.gore, 0, 0.35, -0.16);
    for (let i = 0; i < 4; i++) part(j.torso, box(0.06, 0.06, 0.1), mats.bone, 0, 0.1 + i * 0.13, -0.2); // vértebras
    j.neck = joint(j.torso, 0, 0.7, 0, 'neck');
    j.head = joint(j.neck, 0, 0.08, 0.05, 'head');
    j.head.rotation.x = -1.1;
    part(j.head, sph(0.15), mats.skin, 0, 0.05, 0.02, 'headMesh');
    part(j.head, box(0.18, 0.06, 0.14), mats.gore, 0, -0.04, 0.12); // boca abierta
    part(j.head, sph(0.03, 6), mats.eye, -0.06, 0.08, 0.13); part(j.head, sph(0.03, 6), mats.eye, 0.06, 0.08, 0.13);
    j.armL = joint(j.torso, -0.22, 0.6, 0, 'armL'); j.armR = joint(j.torso, 0.22, 0.6, 0, 'armR');
    for (const a of [j.armL, j.armR]) {
      a.rotation.x = -1.3;
      part(a, caps(0.06, 0.38), mats.skin, 0, -0.24, 0);
      const f = joint(a, 0, -0.48, 0, 'fore'); part(f, caps(0.05, 0.36), mats.skin, 0, -0.22, 0);
      part(f, cone(0.03, 0.14), mats.bone, 0, -0.46, 0.03).rotation.x = Math.PI; // garras
      a.userData.fore = f;
    }
    j.foreL = j.armL.userData.fore; j.foreR = j.armR.userData.fore;
    j.legL = joint(j.hips, -0.14, 0, 0, 'legL'); j.legR = joint(j.hips, 0.14, 0, 0, 'legR');
    for (const l of [j.legL, j.legR]) {
      l.rotation.x = -0.9;
      part(l, caps(0.07, 0.3), mats.skin, 0, -0.2, 0);
      const sh = joint(l, 0, -0.4, 0, 'shin'); sh.rotation.x = 1.6; part(sh, caps(0.05, 0.3), mats.skin, 0, -0.2, 0);
      l.userData.shin = sh;
    }
    j.shinL = j.legL.userData.shin; j.shinR = j.legR.userData.shin;
    part(j.hips, box(0.32, 0.18, 0.22), mats.cloth, 0, 0, 0);
  } else {
    const brute = build === 'brute' || build === 'tank' || build === 'boss';
    const bloated = build === 'bloated';
    const legLen = build === 'tank' ? 0.9 : build === 'boss' ? 1.0 : 0.85;
    const hipY = legLen + 0.05;
    j.hips = joint(body, 0, hipY, 0, 'hips');
    part(j.hips, box(brute ? 0.55 : 0.36, 0.22, brute ? 0.34 : 0.22), mats.cloth, 0, 0, 0);
    j.torso = joint(j.hips, 0, 0.1, 0, 'torso');
    j.torso.rotation.x = m.hunch || (brute ? 0.25 : 0.15);
    if (bloated) {
      part(j.torso, sph(0.48, 14), mats.skin, 0, 0.42, 0.08, 'belly').scale.set(1.05, 1.1, 1);
      part(j.torso, sph(0.2, 8), mats.sac, 0.15, 0.3, 0.38);
      part(j.torso, sph(0.16, 8), mats.sac, -0.2, 0.52, 0.35);
      part(j.torso, sph(0.12, 8), mats.sac, 0.05, 0.62, 0.42);
    } else if (build === 'tank' || build === 'boss') {
      part(j.torso, box(0.9, 0.8, 0.55), mats.skin, 0, 0.5, 0);
      part(j.torso, box(1.05, 0.35, 0.6), mats.skin, 0, 0.85, -0.02); // hombros masivos
      part(j.torso, sph(0.16, 10), mats.core, 0, 0.5, 0.27, 'core');
      // placas óseas
      part(j.torso, box(0.3, 0.2, 0.1), mats.bone, -0.25, 0.75, 0.3); part(j.torso, box(0.3, 0.2, 0.1), mats.bone, 0.25, 0.75, 0.3);
      if (build === 'boss') {
        for (let i = 0; i < 5; i++) part(j.torso, cone(0.07, 0.45), mats.bone, -0.4 + i * 0.2, 1.05, -0.2).rotation.x = -0.4;
        j.chestL = part(j.torso, box(0.38, 0.5, 0.12), mats.bone, -0.2, 0.5, 0.33, 'plateL');
        j.chestR = part(j.torso, box(0.38, 0.5, 0.12), mats.bone, 0.2, 0.5, 0.33, 'plateR');
      }
    } else if (build === 'brute') {
      part(j.torso, box(0.7, 0.7, 0.45), mats.skin, 0, 0.42, 0);
      part(j.torso, box(0.74, 0.5, 0.48), mats.cloth, 0, 0.22, 0.01); // delantal
      part(j.torso, box(0.3, 0.3, 0.05), mats.gore, 0.1, 0.55, 0.23);
    } else {
      const w = m.slim ? 0.34 : 0.42;
      part(j.torso, box(w, 0.6, 0.26), mats.skin, 0, 0.36, 0);
      part(j.torso, box(w + 0.04, 0.32, 0.29), mats.cloth, 0, 0.18, 0);
      part(j.torso, box(0.16, 0.2, 0.04), mats.gore, -0.08, 0.45, 0.14);
      if (m.sac) part(j.torso, sph(0.2, 8), mats.sac, 0, 0.62, -0.05).scale.set(1, 0.8, 1.2);
    }
    const shoulderY = bloated ? 0.75 : brute ? 0.85 : 0.62;
    const shoulderX = bloated ? 0.5 : brute ? (build === 'tank' || build === 'boss' ? 0.62 : 0.45) : 0.27;
    j.neck = joint(j.torso, 0, shoulderY + 0.05, 0.02, 'neck');
    j.head = joint(j.neck, 0, 0.12, 0, 'head');
    const hr = brute ? 0.2 : bloated ? 0.18 : 0.15;
    const headMesh = part(j.head, sph(hr, 12), mats.skin, 0, hr * 0.6, 0.02, 'headMesh');
    if (m.bigMouth) { headMesh.scale.set(0.9, 1.15, 1); part(j.head, box(0.16, 0.14, 0.1), mats.gore, 0, 0.0, 0.11); }
    if (m.jaw) part(j.head, box(hr * 1.2, 0.05, hr * 0.8), mats.gore, 0, 0.0, hr * 0.5);
    part(j.head, sph(0.028, 6), mats.eye, -hr * 0.4, hr * 0.75, hr * 0.85, 'eye');
    part(j.head, sph(0.028, 6), mats.eye, hr * 0.4, hr * 0.75, hr * 0.85, 'eye');
    if (m.helmet) { part(j.head, box(hr * 2.2, hr * 0.9, hr * 2.1), mats.metal, 0, hr * 1.15, 0, 'helmet'); }
    if (build === 'boss') { for (let i = 0; i < 3; i++) part(j.head, cone(0.06, 0.4), mats.bone, -0.15 + i * 0.15, 0.4, -0.05).rotation.x = -0.5; }
    // brazos
    j.armL = joint(j.torso, -shoulderX, shoulderY, 0, 'armL');
    j.armR = joint(j.torso, shoulderX, shoulderY, 0, 'armR');
    const armR = brute ? (build === 'tank' || build === 'boss' ? 0.17 : 0.13) : bloated ? 0.1 : 0.065;
    const upperL = brute ? 0.42 : 0.3, foreL = brute ? 0.42 : 0.3;
    for (const [a, side] of [[j.armL, -1], [j.armR, 1]]) {
      part(a, caps(armR, upperL), mats.skin, 0, -upperL / 2 - armR * 0.5, 0);
      const f = joint(a, 0, -upperL - armR, 0, 'fore');
      part(f, caps(armR * 0.9, foreL), mats.skin, 0, -foreL / 2 - armR * 0.5, 0);
      if (m.blades) {
        const bl = part(f, box(0.03, 0.55, 0.09), mats.bone, 0, -foreL - 0.3, 0.04);
        bl.rotation.x = 0.2;
      } else if (m.saw && side === 1) {
        const saw = new THREE.Group(); saw.position.set(0, -foreL - 0.25, 0.05); f.add(saw);
        part(saw, box(0.06, 0.75, 0.2), mats.metal, 0, -0.25, 0);
        for (let i = 0; i < 7; i++) part(saw, cone(0.03, 0.08), mats.metal, 0, -0.55 + i * 0.1, 0.12).rotation.x = Math.PI / 2;
        j.saw = saw;
      } else if (m.saw && side === -1) {
        part(f, cone(0.05, 0.4), mats.bone, 0, -foreL - 0.2, 0).rotation.x = Math.PI;
      } else if (build === 'tank' || build === 'boss') {
        part(f, box(armR * 2.6, armR * 2.4, armR * 2.6), mats.skin, 0, -foreL - armR * 1.5, 0); // puños
        if (build === 'boss') for (let i = 0; i < 3; i++) part(f, cone(0.05, 0.35), mats.bone, -0.12 + i * 0.12, -foreL - armR * 2.6, 0.06).rotation.x = Math.PI;
      } else {
        part(f, box(armR * 2.2, armR * 1.6, armR * 2), mats.skin, 0, -foreL - armR * 1.2, 0);
      }
      a.userData.fore = f;
    }
    j.foreL = j.armL.userData.fore; j.foreR = j.armR.userData.fore;
    // piernas
    const legR = brute ? 0.14 : bloated ? 0.12 : 0.075;
    const lx = brute ? 0.22 : bloated ? 0.2 : 0.12;
    j.legL = joint(j.hips, -lx, -0.05, 0, 'legL'); j.legR = joint(j.hips, lx, -0.05, 0, 'legR');
    for (const l of [j.legL, j.legR]) {
      const ul = legLen * 0.5;
      part(l, caps(legR, ul - legR), mats.cloth, 0, -ul / 2, 0);
      const sh = joint(l, 0, -ul, 0, 'shin');
      part(sh, caps(legR * 0.85, ul - legR), mats.skin, 0, -ul / 2, 0);
      part(sh, box(legR * 2, 0.08, legR * 3), mats.skin, 0, -ul + 0.04, 0.05);
      l.userData.shin = sh;
    }
    j.shinL = j.legL.userData.shin; j.shinR = j.legR.userData.shin;
  }
  root.traverse((o) => { if (o.isMesh) { o.userData.baseMat = o.material; } });
  return { root, body, j, mats, scale: s };
}

// Material translúcido compartido para el camuflaje de los Acechadores
export const cloakMaterial = new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.08, depthWrite: false });
export const hitFlashMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
export const burnMaterial = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 1, emissive: 0x401000 });
export const shockMaterial = new THREE.MeshBasicMaterial({ color: 0x9fd0ff });
