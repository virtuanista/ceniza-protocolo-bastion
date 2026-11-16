// Modelos procedurales de armas en primera persona (y en tercera persona para otros jugadores).
// Cada arquetipo devuelve piezas móviles para animar retroceso, recarga, corredera, etc.
// Las piezas fijas se fusionan por material al final (pocas draw calls aunque haya mucho detalle).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seeded } from '../core/utils.js';

// ---------------------------------------------------------------- materiales
let ENV = null;
const mats = new Map();
const allMats = new Set();

// Mapa de entorno propio (para reflejos en metal); lo crea el renderizador al arrancar
export function setWeaponEnv(tex) {
  ENV = tex;
  for (const m of allMats) { if ('envMap' in m) { m.envMap = tex; m.needsUpdate = true; } }
}

let _wear = null, _poly = null;
function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// Metal pavonado gastado: grano fino + arañazos + bordes más claros
function wearTex() {
  if (_wear) return _wear;
  _wear = canvasTex(256, (ctx, s) => {
    const r = seeded(91);
    const img = ctx.createImageData(s, s);
    for (let i = 0; i < s * s; i++) { const v = 200 + (r() - 0.5) * 40; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 70; i++) {
      const x = r() * s, y = r() * s, a = r() * Math.PI, l = 6 + r() * 40;
      ctx.strokeStyle = r() < 0.6 ? '#ffffff' : '#707070'; ctx.lineWidth = 0.5 + r() * 0.8;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    // desgaste en los bordes de cada cara
    const g = ctx.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.06, 'rgba(255,255,255,0)'); g.addColorStop(0.94, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.35)');
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  });
  return _wear;
}
// Polímero con textura punteada (empuñaduras, guardamanos)
function polyTex() {
  if (_poly) return _poly;
  _poly = canvasTex(128, (ctx, s) => {
    const r = seeded(93);
    ctx.fillStyle = '#d0d0d0'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'; ctx.fillRect(r() * s, r() * s, 1 + r(), 1 + r()); }
  });
  return _poly;
}

function std(params) {
  // el entorno aporta también luz difusa: en materiales no metálicos se reduce para no lavarlos
  const m = new THREE.MeshStandardMaterial({ envMap: ENV, envMapIntensity: (params.metalness ?? 0) > 0.3 ? 1 : 0.25, ...params });
  allMats.add(m);
  return m;
}
// kind: 'metal' | 'poly' | 'rubber' | 'cloth'
function M(color, rough = 0.5, metal = 0.6, emissive = 0) {
  const k = `${color}|${rough}|${metal}|${emissive}`;
  if (!mats.has(k)) {
    const isMetal = metal > 0.3;
    mats.set(k, std({
      color, roughness: rough, metalness: isMetal ? Math.min(0.85, metal) : metal, emissive,
      map: isMetal ? wearTex() : polyTex(), roughnessMap: isMetal ? null : polyTex(),
    }));
  }
  return mats.get(k);
}
const glass = () => { const k = 'glass'; if (!mats.has(k)) mats.set(k, std({ color: 0x1a2a30, roughness: 0.05, metalness: 0.9, envMapIntensity: 1.6, emissive: 0x081418 })); return mats.get(k); };

// ---------------------------------------------------------------- geometría
const geoCache = new Map();
// Caja con bordes biselados (los cantos captan la luz: lo que más "vende" una pieza mecanizada)
const G = (w, h, d, rad) => {
  const r = rad ?? Math.min(w, h, d) * 0.22;
  const k = `b${w}|${h}|${d}|${r}`;
  if (!geoCache.has(k)) geoCache.set(k, r < 0.0015 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, r));
  return geoCache.get(k);
};
const C = (r, l, seg = 14, r2) => { const g = new THREE.CylinderGeometry(r2 ?? r, r, l, seg); g.rotateX(Math.PI / 2); return g; }; // eje Z
const CY = (r, l, seg = 12, r2) => new THREE.CylinderGeometry(r2 ?? r, r, l, seg); // eje Y

function add(parent, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------- piezas de detalle
function rail(g, mat, len, y, zc, w = 0.022) { // raíl con ranuras transversales
  add(g, G(w * 0.8, 0.006, len, 0.0015), mat, 0, y, zc);
  const n = Math.min(24, Math.floor(len / 0.011));
  for (let i = 0; i < n; i++) add(g, G(w, 0.005, 0.005, 0.001), mat, 0, y + 0.004, zc - len / 2 + 0.006 + i * (len - 0.012) / Math.max(1, n - 1));
}
function triggerGuard(g, mat, y, z, size = 1) {
  const tg = new THREE.TorusGeometry(0.02 * size, 0.003, 6, 14, Math.PI);
  const m = add(g, tg, mat, 0, y, z);
  m.rotation.set(0, Math.PI / 2, Math.PI);
  const trig = add(g, G(0.006, 0.02 * size, 0.006, 0.0015), mat, 0, y - 0.006 * size, z + 0.002);
  trig.rotation.x = -0.35;
}
function ironSights(g, mat, yTop, zFront, zRear) {
  add(g, G(0.012, 0.006, 0.014, 0.002), mat, 0, yTop + 0.003, zFront);
  add(g, G(0.003, 0.014, 0.004, 0.001), mat, 0, yTop + 0.012, zFront);
  add(g, G(0.026, 0.01, 0.012, 0.002), mat, 0, yTop + 0.005, zRear);
  add(g, G(0.007, 0.014, 0.008, 0.0015), mat, -0.008, yTop + 0.014, zRear);
  add(g, G(0.007, 0.014, 0.008, 0.0015), mat, 0.008, yTop + 0.014, zRear);
}
function muzzleBrake(g, mat, r, y, z) {
  add(g, C(r * 1.45, 0.045, 10), mat, 0, y, z);
  add(g, G(r * 3.1, r * 0.9, 0.008, 0.001), M(0x050505, 0.8, 0.2), 0, y, z - 0.008);
  add(g, G(r * 3.1, r * 0.9, 0.008, 0.001), M(0x050505, 0.8, 0.2), 0, y, z + 0.008);
}
function ejectionPort(g, y, z, w = 0.04) { add(g, G(0.004, 0.014, w, 0.001), M(0x050505, 0.8, 0.2), 0.0285, y, z); }
function pins(g, mat, x, y, zs) { for (const z of zs) { const p = add(g, CY(0.0035, 0.004, 8), mat, x, y, z); p.rotation.z = Math.PI / 2; } }
function scope(g, mat, y, z, power = 4) {
  const len = power >= 8 ? 0.28 : 0.22;
  add(g, C(0.017, len), mat, 0, y, z);
  add(g, C(0.026, 0.06, 16, 0.017), mat, 0, y, z - len / 2 - 0.02); // campana objetivo
  add(g, C(0.022, 0.05, 16, 0.017), mat, 0, y, z + len / 2 + 0.015).rotation.x = Math.PI; // ocular
  add(g, C(0.024, 0.004), glass(), 0, y, z - len / 2 - 0.05);
  add(g, C(0.02, 0.004), glass(), 0, y, z + len / 2 + 0.04);
  add(g, CY(0.009, 0.022), mat, 0, y + 0.024, z); // torreta de elevación
  const wt = add(g, CY(0.009, 0.022), mat, 0.024, y, z); wt.rotation.z = Math.PI / 2; // deriva
  for (const dz of [-len * 0.3, len * 0.3]) { add(g, C(0.021, 0.014), mat, 0, y, z + dz); add(g, G(0.014, 0.026, 0.014, 0.003), mat, 0, y - 0.025, z + dz); }
}
function redDot(g, mat, y, z, holo) {
  if (holo) {
    add(g, G(0.044, 0.008, 0.06, 0.002), mat, 0, y, z);
    add(g, G(0.006, 0.036, 0.06, 0.002), mat, -0.019, y + 0.02, z);
    add(g, G(0.006, 0.036, 0.06, 0.002), mat, 0.019, y + 0.02, z);
    add(g, G(0.044, 0.006, 0.06, 0.002), mat, 0, y + 0.038, z);
    const gl = add(g, G(0.034, 0.03, 0.002, 0.0005), std({ color: 0x80a0a0, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.5 }), 0, y + 0.02, z - 0.02);
    gl.renderOrder = 2;
  } else {
    add(g, G(0.03, 0.012, 0.05, 0.003), mat, 0, y, z);
    add(g, C(0.016, 0.04), mat, 0, y + 0.02, z);
    add(g, C(0.013, 0.003), glass(), 0, y + 0.02, z - 0.021);
  }
  add(g, new THREE.SphereGeometry(0.0018, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0, y + 0.02, z - (holo ? 0.025 : 0.03));
}
function stock(g, body, acc, y, z, kind = 'rifle') {
  if (kind === 'rifle') {
    add(g, C(0.014, 0.16), body, 0, y + 0.012, z + 0.06); // tubo amortiguador
    add(g, G(0.04, 0.07, 0.14, 0.008), acc, 0, y - 0.004, z + 0.14);
    add(g, G(0.042, 0.085, 0.022, 0.006), M(0x111111, 0.95, 0), 0, y - 0.006, z + 0.215); // cantonera de goma
    add(g, G(0.008, 0.02, 0.06, 0.002), acc, 0, y - 0.045, z + 0.12); // carrillera inferior
  } else { // culata de madera / sólida
    const s = add(g, G(0.044, 0.075, 0.24, 0.01), acc, 0, y - 0.02, z + 0.12); s.rotation.x = 0.12;
    add(g, G(0.046, 0.09, 0.02, 0.006), M(0x111111, 0.95, 0), 0, y - 0.036, z + 0.245).rotation.x = 0.12;
  }
}
// Cargador con costillas y base; devuelve un grupo animable
function magazine(g, mat, w, h, d, x, y, z, curve = 0) {
  const m = new THREE.Group(); m.position.set(x, y, z); g.add(m);
  const segs = curve ? 2 : 1;
  for (let i = 0; i < segs; i++) {
    const p = add(m, G(w, h / segs + 0.004, d, 0.004), mat, 0, h / 2 - (i + 0.5) * h / segs, -i * curve * 0.5);
    p.rotation.x = -i * curve * 2.5;
  }
  add(m, G(w + 0.006, 0.008, d + 0.008, 0.002), mat, 0, -h + 0.004 + (segs > 1 ? 0.004 : 0), -(segs - 1) * curve * 1.3);
  for (let i = 0; i < 3; i++) add(m, G(w + 0.003, 0.006, 0.004, 0.001), mat, 0, h * 0.25 - i * h * 0.2, d * 0.2);
  return m;
}

// ---------------------------------------------------------------- manos
// Mano articulada: el origen está en el eje del objeto empuñado (eje Y local). La palma queda en +X
// y los dedos avanzan hacia -Z envolviendo el eje. Se refleja en X para la mano izquierda.
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
function capsule(parent, mat, a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const k = `cap${r.toFixed(4)}|${len.toFixed(4)}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CapsuleGeometry(r, Math.max(0.001, len), 3, 8));
  const m = new THREE.Mesh(geoCache.get(k), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_up, d.normalize());
  parent.add(m);
  return m;
}
function fingerChain(parent, mats, start, dir0, axis, bends, lens, radius) {
  let p = start.clone(); const d = dir0.clone().normalize();
  for (let i = 0; i < lens.length; i++) {
    if (i > 0) d.applyAxisAngle(axis, bends[i - 1]);
    const q = p.clone().addScaledVector(d, lens[i]);
    const rr = radius * (1 - i * 0.08);
    capsule(parent, i === lens.length - 1 ? mats.tip : mats.glove, p, q, rr);
    if (i === 0) { const kn = new THREE.Mesh(geoCache.get('knuckle') || geoCache.set('knuckle', new THREE.SphereGeometry(1, 8, 6)).get('knuckle'), mats.glove); kn.scale.setScalar(radius * 1.12); kn.position.copy(p); parent.add(kn); }
    p = q;
  }
  return p;
}

function handMats(skin) {
  const k = `hand|${skin.sleeve}|${skin.glove}`;
  if (!mats.has(k)) {
    const gc = new THREE.Color(skin.glove);
    mats.set(k, {
      glove: std({ color: skin.glove, roughness: 0.75, metalness: 0.05, map: polyTex() }),
      pad: std({ color: gc.clone().multiplyScalar(0.6).getHex(), roughness: 0.55, metalness: 0.1 }), // protecciones de nudillos
      tip: std({ color: gc.clone().lerp(new THREE.Color(0x303030), 0.25).getHex(), roughness: 0.6, metalness: 0.05, map: polyTex() }), // yemas reforzadas
      sleeve: std({ color: skin.sleeve, roughness: 0.95, metalness: 0, map: polyTex() }),
      cuff: std({ color: new THREE.Color(skin.sleeve).multiplyScalar(0.7).getHex(), roughness: 0.95, metalness: 0 }),
      strap: std({ color: 0x15171a, roughness: 0.6, metalness: 0.2 }),
    });
  }
  return mats.get(k);
}

// opts: { gripRadius, index: 'trigger'|'wrap'|'straight', thumb: 'wrap'|'side' }
function buildHand(mt, opts = {}) {
  const h = new THREE.Group();
  const gr = opts.gripRadius ?? 0.02;
  const R = gr + 0.0095;
  const Y = new THREE.Vector3(0, 1, 0);
  const fingers = [ // y, escala de longitud, radio
    [0.026, 1.0, 0.0088], [0.007, 1.07, 0.0092], [-0.012, 1.0, 0.0086], [-0.029, 0.82, 0.0076],
  ];
  const a0 = -0.42; // ángulo de los nudillos alrededor del eje (0 = +X, -π/2 = delante)
  fingers.forEach(([y, s, rad], i) => {
    const lens = [0.04 * s, 0.026 * s, 0.021 * s];
    const start = new THREE.Vector3(Math.cos(a0) * (R + 0.002), y, Math.sin(a0) * (R + 0.002));
    if (i === 0 && opts.index === 'trigger') {
      // índice extendido sobre el guardamonte y apoyado en el gatillo
      fingerChain(h, mt, start.add(new THREE.Vector3(0, 0.012, 0)), new THREE.Vector3(-0.25, 0.05, -1), Y, [0.55, 0.5], [0.042, 0.026, 0.02], rad);
    } else if (i === 0 && opts.index === 'straight') {
      fingerChain(h, mt, start, new THREE.Vector3(-0.15, 0, -1), Y, [0.12, 0.08], lens, rad);
    } else {
      const dir = new THREE.Vector3(Math.sin(a0), 0, -Math.cos(a0));
      fingerChain(h, mt, start, dir, Y, [lens[0] / R * 1.05, (lens[1] + lens[2]) / (2 * R) * 1.05], lens, rad);
    }
  });
  // palma: pivota en la línea de nudillos y se abre hacia la muñeca
  const palmPivot = new THREE.Group();
  palmPivot.position.set(Math.cos(a0) * R + 0.004, -0.002, Math.sin(a0) * R);
  palmPivot.rotation.y = 0.3;
  h.add(palmPivot);
  add(palmPivot, G(0.026, 0.074, 0.088, 0.011), mt.glove, 0.008, 0, 0.042);
  add(palmPivot, G(0.008, 0.062, 0.034, 0.003), mt.pad, 0.023, 0.002, 0.012); // protección de nudillos
  add(palmPivot, G(0.006, 0.04, 0.03, 0.002), mt.pad, 0.022, 0.0, 0.055); // refuerzo dorsal
  // pulgar: nace en la base de la palma y cruza al otro lado del eje
  const tb = new THREE.Vector3(R * 0.55, 0.03, R + 0.03);
  const tdir = opts.thumb === 'side' ? new THREE.Vector3(-0.35, 0.15, -1) : new THREE.Vector3(-1, 0.12, -0.75);
  capsule(h, mt.glove, new THREE.Vector3(R + 0.006, 0.012, 0.05), tb, 0.0125); // eminencia tenar
  fingerChain(h, mt, tb, tdir, Y, [0.35], [0.034, 0.026], 0.0098);
  h.userData.wrist = new THREE.Vector3(R + 0.016, -0.004, 0.088);
  return h;
}

// Antebrazo: puño del guante, correa de reloj/velcro, manga con dobladillo
function buildForearm(mt, wrist, dir) {
  const f = new THREE.Group();
  f.position.copy(wrist);
  f.quaternion.setFromUnitVectors(_up, dir.clone().normalize());
  add(f, CY(0.03, 0.05, 12, 0.026), mt.glove, 0, 0.018, 0);
  add(f, CY(0.031, 0.014, 12), mt.strap, 0, 0.038, 0);
  add(f, CY(0.039, 0.028, 12, 0.036), mt.cuff, 0, 0.068, 0); // dobladillo de la manga
  add(f, CY(0.046, 0.5, 12, 0.037), mt.sleeve, 0, 0.33, 0);
  return f;
}

// Coloca las dos manos sobre un modelo ya construido. skin: {sleeve, glove}
export function attachArms(mdl, skin = { sleeve: 0x2a3326, glove: 0x1a1a1a }) {
  const mt = handMats(skin);
  const out = [];
  const place = (spec, left) => {
    if (!spec) return;
    const h = buildHand(mt, spec);
    if (left) h.scale.x = -1;
    h.position.copy(spec.pos);
    if (spec.basis) h.quaternion.setFromRotationMatrix(spec.basis); else h.rotation.copy(spec.rot || new THREE.Euler());
    if (spec.roll) h.quaternion.premultiply(_q.setFromAxisAngle(spec.rollAxis || new THREE.Vector3(0, 0, 1), spec.roll));
    h.updateMatrix();
    mdl.group.add(h);
    const wrist = h.userData.wrist.clone().applyMatrix4(h.matrix);
    const fa = buildForearm(mt, wrist, spec.arm);
    mdl.group.add(fa);
    out.push(h, fa);
  };
  place(mdl.handR, false);
  place(mdl.handL, true);
  mdl.armParts = out;
  return out;
}

// Orientaciones típicas de las manos
const RAKE = -0.28; // inclinación de las empuñaduras de pistola
const basisFore = (() => { // eje de la mano a lo largo del cañón, palma debajo
  const m = new THREE.Matrix4();
  m.makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0));
  return m;
})();
const pistolHand = (pos, extra = {}) => ({ pos, rot: new THREE.Euler(RAKE, 0, 0), gripRadius: 0.021, index: 'trigger', arm: new THREE.Vector3(0.38, -0.55, 0.74), ...extra });
const foreHand = (pos, radius = 0.03, extra = {}) => ({ pos, basis: basisFore, roll: -0.75, gripRadius: radius, index: 'wrap', arm: new THREE.Vector3(-0.62, -0.55, 0.55), ...extra });
const vertGripL = (pos, extra = {}) => ({ pos, rot: new THREE.Euler(RAKE * 0.5, 0, 0), gripRadius: 0.02, index: 'wrap', arm: new THREE.Vector3(-0.75, -0.5, 0.45), ...extra });

// ---------------------------------------------------------------- armas
// Devuelve { group, muzzle, mag, slide, pump, cylinder, barrels, handR, handL, adsY, ... }
export function buildWeaponModel(def, opts = {}) {
  const m = def.model || {};
  const g = new THREE.Group();
  const detail = opts.detail !== false;
  const body = M(m.color ?? 0x2a2a2a, 0.38, 0.75);
  const acc = M(new THREE.Color(m.accent ?? 0x555555).multiplyScalar(0.6).getHex(), 0.7, 0.05); // polímero/madera: la textura aclara, se compensa
  const dark = M(0x1c1c1e, 0.32, 0.85);
  const black = M(0x0e0e0f, 0.6, 0.4);
  const glow = m.glow ? new THREE.MeshBasicMaterial({ color: m.glow }) : null;
  const r = { group: g, muzzle: new THREE.Object3D(), mag: null, slide: null, pump: null, cylinder: null, extra: [], adsY: 0.045, glowMat: glow, handR: null, handL: null };
  g.add(r.muzzle);
  const arch = m.arch;
  const L = m.long ? 1.15 : 1;
  const D = detail ? (fn) => fn() : () => {};

  switch (arch) {
    case 'pistol': case 'launcherPistol': case 'flarePistol': {
      add(g, G(0.034, 0.03, 0.19, 0.006), body, 0, 0.022, -0.045); // armazón
      r.slide = new THREE.Group(); r.slide.position.set(0, 0, -0.045); g.add(r.slide);
      add(r.slide, G(0.038, 0.034, 0.205, 0.007), arch === 'pistol' ? body : acc, 0, 0.055, 0);
      D(() => {
        for (let i = 0; i < 6; i++) add(r.slide, G(0.04, 0.026, 0.003, 0.0008), black, 0, 0.055, 0.075 - i * 0.007); // estrías de la corredera
        add(r.slide, G(0.002, 0.012, 0.035, 0.0006), black, 0.0195, 0.062, -0.02); // ventana de expulsión
        ironSights(r.slide, black, 0.072, -0.09, 0.085);
      });
      const grip = add(g, G(0.034, 0.105, 0.048, 0.008), acc, 0, -0.038, 0.048); grip.rotation.x = RAKE;
      D(() => { for (let i = 0; i < 5; i++) { const s = add(g, G(0.036, 0.004, 0.044, 0.001), black, 0, -0.012 - i * 0.017, 0.042 + i * 0.0048); s.rotation.x = RAKE; } });
      triggerGuard(g, body, 0.004, -0.012);
      D(() => { add(g, G(0.01, 0.014, 0.012, 0.002), body, 0, 0.068, 0.062); }); // martillo
      r.mag = new THREE.Group(); r.mag.position.set(0, -0.095, 0.062); r.mag.rotation.x = RAKE; g.add(r.mag);
      add(r.mag, G(0.036, 0.012, 0.05, 0.003), black, 0, 0, 0); // base del cargador
      add(r.mag, G(0.028, 0.08, 0.034, 0.002), dark, 0, 0.04, 0);
      if (arch !== 'pistol') {
        add(g, C(arch === 'launcherPistol' ? 0.03 : 0.02, 0.2, 16), arch === 'launcherPistol' ? acc : body, 0, 0.055, -0.12);
        add(g, C(arch === 'launcherPistol' ? 0.034 : 0.024, 0.02, 16), dark, 0, 0.055, -0.22);
      }
      if (glow) add(g, G(0.04, 0.006, 0.12, 0.002), glow, 0, 0.074, -0.05);
      r.muzzle.position.set(0, 0.055, -0.18 - (arch !== 'pistol' ? 0.06 : 0));
      r.handR = pistolHand(new THREE.Vector3(0, -0.032, 0.05));
      r.adsY = 0.08;
      break;
    }
    case 'revolver': {
      add(g, C(0.015, 0.22, 14), body, 0, 0.055, -0.13);
      add(g, G(0.022, 0.016, 0.22, 0.004), body, 0, 0.072, -0.13); // costilla del cañón
      add(g, C(0.01, 0.15, 10), body, 0, 0.034, -0.11); // varilla extractora
      r.cylinder = new THREE.Group(); r.cylinder.position.set(0, 0.045, -0.01); g.add(r.cylinder);
      add(r.cylinder, C(0.034, 0.062, 12), body, 0, 0, 0);
      D(() => { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(r.cylinder, G(0.004, 0.012, 0.064, 0.001), black, Math.cos(a) * 0.034, Math.sin(a) * 0.034, 0).rotation.z = a; } });
      add(g, G(0.03, 0.055, 0.09, 0.008), body, 0, 0.04, 0.04);
      add(g, G(0.012, 0.018, 0.016, 0.003), body, 0, 0.074, 0.07); // martillo
      const grip = add(g, G(0.036, 0.1, 0.05, 0.012), acc, 0, -0.025, 0.088); grip.rotation.x = RAKE - 0.1;
      triggerGuard(g, body, 0.008, 0.028);
      D(() => ironSights(g, body, 0.08, -0.23, 0.07));
      r.muzzle.position.set(0, 0.055, -0.25); r.adsY = 0.08;
      r.handR = pistolHand(new THREE.Vector3(0, -0.02, 0.09), { rot: new THREE.Euler(RAKE - 0.1, 0, 0) });
      break;
    }
    case 'smg': {
      add(g, G(0.05, 0.065, 0.3, 0.008), body, 0, 0.022, -0.08);
      add(g, G(0.044, 0.02, 0.26, 0.004), acc, 0, -0.015, -0.09); // armazón inferior
      add(g, C(0.014, 0.12), dark, 0, 0.035, -0.29);
      D(() => { add(g, C(0.022, 0.06, 12), black, 0, 0.035, -0.35); rail(g, dark, 0.16, 0.058, -0.06, 0.02); ejectionPort(g, 0.032, -0.02, 0.035); pins(g, dark, 0.026, -0.005, [-0.04, 0.03]); });
      const grip = add(g, G(0.034, 0.095, 0.046, 0.008), acc, 0, -0.055, 0.035); grip.rotation.x = RAKE;
      triggerGuard(g, acc, -0.03, -0.005);
      r.mag = magazine(g, dark, 0.026, 0.15, 0.036, 0, -0.012, -0.1);
      D(() => { add(g, G(0.012, 0.012, 0.18), dark, 0, 0.02, 0.16); add(g, G(0.012, 0.012, 0.18), dark, 0, -0.02, 0.16); }); // culata de alambre
      add(g, G(0.04, 0.07, 0.016, 0.004), acc, 0, 0.0, 0.25);
      add(g, G(0.012, 0.022, 0.03, 0.003), dark, 0, 0.066, 0.0);
      D(() => ironSights(g, dark, 0.055, -0.21, 0.04));
      if (glow) add(g, G(0.052, 0.008, 0.2, 0.002), glow, 0, 0.056, -0.08);
      r.muzzle.position.set(0, 0.035, -0.38); r.adsY = 0.075;
      r.handR = pistolHand(new THREE.Vector3(0, -0.05, 0.038));
      r.handL = foreHand(new THREE.Vector3(0, -0.005, -0.2), 0.026);
      break;
    }
    case 'rifle': case 'bullpup': case 'dmr': case 'sniper': {
      const bp = arch === 'bullpup';
      const len = (arch === 'sniper' ? 0.62 : arch === 'dmr' ? 0.55 : 0.46) * L;
      const z0 = bp ? 0.12 : 0.05; // parte trasera del cajón
      // cajón de mecanismos (superior + inferior)
      add(g, G(0.052, 0.042, len * 0.48, 0.006), body, 0, 0.036, z0 - len * 0.24);
      add(g, G(0.048, 0.034, len * 0.42, 0.006), body, 0, 0.0, z0 - len * 0.2);
      // guardamanos
      const hgLen = len * 0.46, hgZ = z0 - len * 0.48 - hgLen / 2 + 0.01;
      add(g, G(0.058, 0.058, hgLen, 0.012), acc, 0, 0.022, hgZ);
      D(() => {
        for (let i = 0; i < 4; i++) add(g, G(0.06, 0.012, 0.03, 0.003), black, 0, 0.022, hgZ - hgLen / 2 + 0.04 + i * (hgLen - 0.08) / 3); // ranuras de ventilación
        rail(g, dark, len * 0.42 + hgLen, 0.061, z0 - (len * 0.42 + hgLen) / 2 - 0.01);
        ejectionPort(g, 0.04, z0 - len * 0.2);
        add(g, G(0.012, 0.012, 0.03, 0.003), dark, 0.03, 0.045, z0 - len * 0.12); // palanca de carga
        pins(g, dark, 0.025, 0.004, [z0 - len * 0.08, z0 - len * 0.3]);
        add(g, G(0.006, 0.012, 0.02, 0.002), dark, -0.026, 0.005, z0 - len * 0.1); // selector
      });
      // cañón
      const bR = arch === 'sniper' ? 0.017 : 0.0125;
      const bLen = len * 0.62;
      const bZ = hgZ - hgLen / 2 - bLen / 2 + 0.12;
      add(g, C(bR, bLen, 14), dark, 0, 0.03, bZ);
      D(() => {
        add(g, G(0.026, 0.03, 0.025, 0.004), dark, 0, 0.038, hgZ - hgLen / 2 - 0.02); // bloque de gases
        muzzleBrake(g, dark, bR, 0.03, bZ - bLen / 2 - 0.015);
      });
      // empuñadura y gatillo
      const gz = bp ? -0.12 : z0 - len * 0.26;
      const grip = add(g, G(0.034, 0.1, 0.046, 0.008), acc, 0, -0.06, gz + 0.02); grip.rotation.x = RAKE;
      triggerGuard(g, acc, -0.024, gz - 0.035);
      // cargador
      const magZ = bp ? 0.12 : gz - 0.085;
      r.mag = arch === 'sniper' ? magazine(g, dark, 0.034, 0.06, 0.07, 0, -0.016, magZ) : magazine(g, dark, 0.03, 0.14, 0.055, 0, -0.012, magZ, bp ? 0 : 0.02);
      // culata
      if (!bp) stock(g, body, acc, 0.02, z0, arch === 'sniper' || arch === 'dmr' ? 'solid' : 'rifle');
      else { add(g, G(0.05, 0.085, 0.14, 0.01), acc, 0, -0.008, 0.2); add(g, G(0.052, 0.09, 0.02, 0.006), M(0x111111, 0.95, 0), 0, -0.01, 0.28); }
      // óptica
      const sight = def.ads?.sight || '';
      if (arch === 'sniper' || arch === 'dmr' || sight.startsWith('scope')) {
        scope(g, dark, 0.105, z0 - len * 0.28, arch === 'sniper' ? 8 : 4);
        r.adsY = 0.105; r.scope = true;
      } else if (sight === 'holo' || sight === 'red') {
        redDot(g, dark, 0.072, z0 - len * 0.3, sight === 'holo');
        r.adsY = 0.092;
      } else { D(() => ironSights(g, dark, 0.066, hgZ - hgLen / 2 + 0.01, z0 - 0.02)); r.adsY = 0.075; }
      if (arch === 'sniper') {
        r.slide = new THREE.Group(); r.slide.position.set(0, 0, 0.05); g.add(r.slide);
        add(r.slide, CY(0.006, 0.05, 8), body, 0.04, 0.04, -0.01).rotation.z = Math.PI / 2;
        add(r.slide, new THREE.SphereGeometry(0.011, 10, 8), body, 0.066, 0.04, -0.01);
        D(() => { for (const s of [-1, 1]) { const leg = add(g, G(0.008, 0.16, 0.008, 0.002), dark, s * 0.022, -0.04, bZ + 0.02); leg.rotation.set(-0.5, 0, s * 0.18); } }); // bípode plegado
      }
      if (glow) { add(g, G(0.06, 0.008, hgLen * 0.8, 0.002), glow, 0, 0.052, hgZ); }
      r.muzzle.position.set(0, 0.03, bZ - bLen / 2 - 0.04);
      r.handR = pistolHand(new THREE.Vector3(0, -0.052, gz + 0.022));
      r.handL = foreHand(new THREE.Vector3(0, 0.012, hgZ + (bp ? -0.02 : 0.02)), 0.031);
      break;
    }
    case 'pump': case 'double': case 'autoshotgun': {
      const len = arch === 'double' ? 0.42 : 0.55;
      if (arch === 'double') {
        add(g, C(0.018, len, 16), body, -0.019, 0.04, -len / 2 - 0.05);
        add(g, C(0.018, len, 16), body, 0.019, 0.04, -len / 2 - 0.05);
        add(g, G(0.012, 0.008, len, 0.002), body, 0, 0.06, -len / 2 - 0.05); // costilla
        D(() => { add(g, new THREE.SphereGeometry(0.004, 6, 4), M(0xc0b090, 0.3, 0.9), 0, 0.066, -len - 0.06); add(g, C(0.0035, 0.002), black, -0.019, 0.04, -len - 0.051); add(g, C(0.0035, 0.002), black, 0.019, 0.04, -len - 0.051); });
        r.barrels = new THREE.Group(); g.add(r.barrels);
        add(g, G(0.05, 0.06, 0.12, 0.01), body, 0, 0.01, 0.06);
        add(g, G(0.012, 0.02, 0.02, 0.004), body, 0, 0.05, 0.03); // palanca de apertura
        stock(g, body, acc, 0.03, 0.08, 'solid');
        add(g, G(0.05, 0.035, 0.18, 0.01), acc, 0, 0.012, -0.12);
        triggerGuard(g, body, -0.025, 0.07);
      } else {
        add(g, G(0.05, 0.07, 0.2, 0.01), body, 0, 0.022, 0.02);
        add(g, C(0.019, len, 16), dark, 0, 0.055, -len / 2 - 0.05);
        add(g, C(0.015, len * 0.8, 14), dark, 0, 0.018, -len / 2 + 0.02);
        D(() => { add(g, new THREE.SphereGeometry(0.004, 6, 4), M(0xc0b090, 0.3, 0.9), 0, 0.078, -len - 0.04); add(g, C(0.017, 0.02), dark, 0, 0.018, -len * 0.4 - 0.03 - len * 0.4 + 0.02); ejectionPort(g, 0.03, 0.02, 0.06); add(g, G(0.012, 0.004, 0.18, 0.001), dark, 0, 0.06, 0.02); });
        r.pump = new THREE.Group(); r.pump.position.set(0, 0, -0.25); g.add(r.pump);
        add(r.pump, G(0.056, 0.048, 0.14, 0.014), acc, 0, 0.018, 0);
        D(() => { for (let i = 0; i < 7; i++) add(r.pump, G(0.06, 0.04, 0.006, 0.002), acc, 0, 0.018, -0.054 + i * 0.018); });
        triggerGuard(g, body, -0.022, 0.03);
        if (arch === 'autoshotgun') {
          const grip = add(g, G(0.034, 0.1, 0.046, 0.008), acc, 0, -0.04, 0.09); grip.rotation.x = RAKE;
          add(g, G(0.044, 0.075, 0.2, 0.012), acc, 0, -0.005, 0.24);
          if (m.drum) { r.mag = new THREE.Group(); r.mag.position.set(0, -0.07, -0.02); g.add(r.mag); const dm = add(r.mag, C(0.06, 0.07, 18), dark, 0, 0, 0); dm.rotation.y = Math.PI / 2; add(r.mag, C(0.03, 0.074, 12), body, 0, 0, 0).rotation.y = Math.PI / 2; }
          else r.mag = magazine(g, dark, 0.04, 0.13, 0.07, 0, -0.005, -0.02);
        } else {
          const st = add(g, G(0.045, 0.08, 0.26, 0.012), acc, 0, -0.012, 0.23); st.rotation.x = 0.12;
          add(g, G(0.046, 0.09, 0.02, 0.006), M(0x111111, 0.95, 0), 0, -0.03, 0.36).rotation.x = 0.12;
        }
      }
      if (glow) add(g, G(0.058, 0.008, 0.2, 0.002), glow, 0, 0.08, -0.1);
      r.muzzle.position.set(0, 0.04, -len - 0.08);
      if (arch === 'autoshotgun') r.handR = pistolHand(new THREE.Vector3(0, -0.034, 0.092));
      else r.handR = pistolHand(new THREE.Vector3(0, -0.035, 0.1), { rot: new THREE.Euler(-0.75, 0, 0), arm: new THREE.Vector3(0.3, -0.5, 0.8) });
      r.handL = foreHand(new THREE.Vector3(0, 0.018, arch === 'double' ? -0.13 : -0.25), 0.03);
      if (arch === 'pump') r.handLFollow = 'pump';
      r.adsY = 0.08;
      break;
    }
    case 'lmg': {
      add(g, G(0.07, 0.085, 0.42, 0.01), body, 0, 0.022, -0.1);
      add(g, G(0.074, 0.02, 0.2, 0.006), body, 0, 0.074, -0.06); // tapa de alimentación
      add(g, C(0.019, 0.4, 14), dark, 0, 0.04, -0.52);
      D(() => {
        add(g, C(0.03, 0.26, 14), black, 0, 0.04, -0.42); // camisa perforada
        for (let i = 0; i < 6; i++) add(g, G(0.064, 0.016, 0.014, 0.003), dark, 0, 0.04, -0.32 - i * 0.04);
        muzzleBrake(g, dark, 0.019, 0.04, -0.73);
        add(g, G(0.012, 0.05, 0.12, 0.004), dark, 0, 0.1, -0.2); add(g, G(0.012, 0.012, 0.06, 0.003), dark, 0, 0.12, -0.2); // asa
        ejectionPort(g, 0.03, -0.02, 0.06);
        for (let i = 0; i < 4; i++) add(g, C(0.006, 0.03, 6), M(0xb08a40, 0.35, 0.9), -0.04, 0.0, -0.09 + i * 0.016).rotation.y = Math.PI / 2; // cinta de munición
      });
      r.mag = new THREE.Group(); r.mag.position.set(-0.05, -0.06, -0.06); g.add(r.mag);
      add(r.mag, G(0.08, 0.1, 0.13, 0.01), acc, 0, 0, 0);
      add(r.mag, G(0.084, 0.015, 0.1, 0.003), dark, 0, 0.0, 0);
      const grip = add(g, G(0.036, 0.1, 0.048, 0.008), acc, 0, -0.06, 0.07); grip.rotation.x = RAKE;
      triggerGuard(g, acc, -0.03, 0.02);
      stock(g, body, acc, 0.02, 0.1, 'solid');
      for (const s of [-1, 1]) { const leg = add(g, G(0.012, 0.15, 0.012, 0.003), dark, s * 0.03, -0.06, -0.5); leg.rotation.z = s * -0.3; }
      r.muzzle.position.set(0, 0.04, -0.76); r.adsY = 0.1;
      D(() => ironSights(g, dark, 0.064, -0.62, -0.0));
      r.handR = pistolHand(new THREE.Vector3(0, -0.052, 0.072));
      r.handL = foreHand(new THREE.Vector3(0, 0.03, -0.36), 0.032, { roll: -0.5 });
      break;
    }
    case 'launcher': {
      add(g, C(m.drum ? 0.035 : 0.045, 0.45, 18), body, 0, 0.04, -0.15);
      D(() => { add(g, C((m.drum ? 0.035 : 0.045) + 0.006, 0.03, 18), dark, 0, 0.04, -0.37); rail(g, dark, 0.18, 0.09, -0.12); });
      add(g, G(0.055, 0.06, 0.2, 0.01), acc, 0, 0.0, 0.06);
      const grip = add(g, G(0.036, 0.1, 0.048, 0.008), acc, 0, -0.07, 0.07); grip.rotation.x = RAKE;
      triggerGuard(g, acc, -0.03, 0.025);
      add(g, G(0.05, 0.08, 0.2, 0.012), acc, 0, -0.01, 0.24);
      if (m.drum) { r.cylinder = new THREE.Group(); r.cylinder.position.set(0, 0.02, -0.02); g.add(r.cylinder); add(r.cylinder, C(0.075, 0.12, 12), dark, 0, 0, 0); D(() => { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(r.cylinder, C(0.018, 0.122, 10), black, Math.cos(a) * 0.048, Math.sin(a) * 0.048, 0); } }); }
      else { r.barrels = add(g, G(0.07, 0.07, 0.1, 0.012), dark, 0, 0.04, -0.02); }
      add(g, G(0.012, 0.04, 0.012, 0.003), dark, 0, 0.1, -0.15);
      if (glow) add(g, G(0.02, 0.02, 0.02, 0.004), glow, 0, 0.1, -0.15);
      r.muzzle.position.set(0, 0.04, -0.4); r.adsY = 0.11;
      r.handR = pistolHand(new THREE.Vector3(0, -0.06, 0.072));
      r.handL = foreHand(new THREE.Vector3(0, 0.03, -0.22), 0.042);
      break;
    }
    case 'rocket': {
      add(g, C(0.065, 0.95, 20), body, 0.02, 0.08, -0.1);
      add(g, C(0.08, 0.12, 20), acc, 0.02, 0.08, -0.6);
      add(g, C(0.075, 0.1, 20), acc, 0.02, 0.08, 0.36);
      D(() => { for (const z of [-0.35, 0.1]) add(g, C(0.068, 0.02, 20), dark, 0.02, 0.08, z); add(g, G(0.03, 0.05, 0.1, 0.006), dark, -0.06, 0.14, -0.12); add(g, C(0.012, 0.03), glass(), -0.06, 0.15, -0.06); });
      add(g, G(0.036, 0.1, 0.048, 0.008), dark, 0.02, -0.03, 0.05).rotation.x = RAKE;
      add(g, G(0.036, 0.1, 0.048, 0.008), dark, 0.02, -0.03, -0.2).rotation.x = RAKE * 0.5;
      triggerGuard(g, dark, 0.0, 0.0);
      r.mag = add(g, new THREE.ConeGeometry(0.05, 0.14, 12).rotateX(-Math.PI / 2), M(0x6a6a5a, 0.5, 0.6), 0.02, 0.08, -0.7);
      r.muzzle.position.set(0.02, 0.08, -0.65); r.adsY = 0.15;
      r.handR = pistolHand(new THREE.Vector3(0.02, -0.03, 0.05));
      r.handL = vertGripL(new THREE.Vector3(0.02, -0.03, -0.2));
      break;
    }
    case 'flamer': {
      const big = m.big ? 1.2 : 1;
      add(g, C(0.035 * big, 0.5, 16), body, 0, 0.03, -0.2);
      add(g, C(0.045 * big, 0.08, 16), acc, 0, 0.03, -0.48);
      D(() => { for (let i = 0; i < 5; i++) add(g, C(0.039 * big, 0.012, 16), dark, 0, 0.03, -0.38 + i * 0.03); });
      r.mag = new THREE.Group(); r.mag.position.set(0, -0.07, -0.05); g.add(r.mag); // depósito
      add(r.mag, C(0.06 * big, 0.25, 18), acc, 0, 0, 0);
      add(r.mag, new THREE.SphereGeometry(0.06 * big, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), acc, 0, 0, -0.125);
      add(r.mag, C(0.012, 0.02), dark, 0, 0.06 * big, 0.05); // válvula
      D(() => { // manguera
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.07, 0.07), new THREE.Vector3(0.03, -0.1, 0.13), new THREE.Vector3(0.04, -0.03, 0.18), new THREE.Vector3(0, 0.0, 0.2)]);
        add(g, new THREE.TubeGeometry(curve, 16, 0.009, 6), black);
      });
      const grip = add(g, G(0.036, 0.1, 0.048, 0.008), dark, 0, -0.05, 0.12); grip.rotation.x = RAKE;
      triggerGuard(g, dark, -0.012, 0.075);
      add(g, G(0.05, 0.07, 0.2, 0.012), body, 0, 0.0, 0.24);
      r.pilot = add(g, new THREE.SphereGeometry(0.012, 6, 4), glow || new THREE.MeshBasicMaterial({ color: 0x40a0ff }), 0, 0.0, -0.53);
      if (glow) add(g, G(0.01, 0.01, 0.3, 0.002), glow, 0.04, 0.03, -0.2);
      r.muzzle.position.set(0, 0.03, -0.55); r.adsY = 0.09;
      r.handR = pistolHand(new THREE.Vector3(0, -0.045, 0.122));
      r.handL = foreHand(new THREE.Vector3(0, 0.03, -0.3), 0.04);
      break;
    }
    case 'tesla': case 'railgun': {
      const small = m.small, len = small ? 0.22 : (m.long ? 0.6 : 0.48) * (arch === 'railgun' ? 1.25 : 1);
      add(g, G(0.058, 0.068, len, 0.01), body, 0, 0.02, -len / 2 + 0.05);
      const coils = small ? 2 : 5;
      for (let i = 0; i < coils; i++) {
        const c = add(g, C(m.big ? 0.05 : 0.035, 0.025, 18), glow || acc, 0, 0.04, -0.05 - i * (len * 0.75) / coils);
        r.extra.push(c);
      }
      D(() => { for (let i = 0; i < coils - 1; i++) add(g, C(0.022, 0.03, 12), dark, 0, 0.04, -0.05 - (i + 0.5) * (len * 0.75) / coils); add(g, C(0.006, len * 0.8, 6), dark, 0.034, -0.005, -len / 2); add(g, C(0.006, len * 0.8, 6), dark, -0.034, -0.005, -len / 2); });
      if (arch === 'railgun') { add(g, G(0.015, 0.02, len, 0.003), dark, -0.025, 0.07, -len / 2); add(g, G(0.015, 0.02, len, 0.003), dark, 0.025, 0.07, -len / 2); scope(g, dark, 0.12, -0.05, 8); r.scope = true; }
      const grip = add(g, G(0.034, 0.1, 0.046, 0.008), acc, 0, -0.05, 0.04); grip.rotation.x = RAKE;
      triggerGuard(g, dark, -0.02, -0.0);
      r.mag = add(g, G(0.04, 0.05, 0.08, 0.008), glow || acc, 0, -0.03, -0.1);
      if (!small) add(g, G(0.05, 0.08, 0.2, 0.012), body, 0, -0.01, 0.22);
      r.muzzle.position.set(0, 0.04, -len + 0.02);
      r.adsY = arch === 'railgun' ? 0.12 : 0.08;
      r.handR = pistolHand(new THREE.Vector3(0, -0.044, 0.042));
      if (!small) r.handL = foreHand(new THREE.Vector3(0, 0.012, -len * 0.55), 0.034);
      break;
    }
    case 'machete': {
      const steel = M(0xb8bcc0, 0.22, 0.95);
      const blade = add(g, G(0.005, 0.05, 0.45, 0.0015), steel, 0, 0.03, -0.3);
      blade.rotation.x = 0.05;
      D(() => { const edge = add(g, G(0.0025, 0.008, 0.44, 0.0008), M(0xe8ecef, 0.12, 1), 0, 0.006, -0.3); edge.rotation.x = 0.05; });
      add(g, G(0.026, 0.034, 0.13, 0.01), M(0x2a1a10, 0.85, 0), 0, 0, 0.0);
      D(() => { for (const z of [-0.035, 0.035]) add(g, CY(0.004, 0.028, 8), M(0xb09060, 0.3, 0.9), 0, 0, z).rotation.z = Math.PI / 2; });
      add(g, G(0.05, 0.012, 0.02, 0.003), dark, 0, 0.01, -0.07);
      r.muzzle.position.set(0, 0.03, -0.5); r.adsY = 0;
      r.handR = { pos: new THREE.Vector3(0, 0, 0.0), basis: basisFore, roll: 1.4, gripRadius: 0.017, index: 'wrap', arm: new THREE.Vector3(0.3, -0.55, 0.78) };
      break;
    }
    case 'syringe': {
      add(g, C(0.018, 0.14, 16), std({ color: 0xe0f0ff, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.2 }), 0, 0.02, -0.08);
      r.mag = add(g, C(0.014, 0.12), new THREE.MeshBasicMaterial({ color: 0x30ff80 }), 0, 0.02, -0.08);
      add(g, C(0.003, 0.08), M(0xcccccc, 0.2, 1), 0, 0.02, -0.19);
      add(g, G(0.05, 0.008, 0.012, 0.002), M(0xcccccc, 0.4, 0.6), 0, 0.02, -0.005); // aletas
      r.pump = add(g, C(0.02, 0.02), dark, 0, 0.02, 0.0);
      r.muzzle.position.set(0, 0.02, -0.23); r.adsY = 0;
      r.handR = { pos: new THREE.Vector3(0, 0.02, -0.04), basis: basisFore, roll: 1.4, gripRadius: 0.019, index: 'straight', thumb: 'side', arm: new THREE.Vector3(0.3, -0.55, 0.78) };
      break;
    }
    case 'welder': {
      add(g, G(0.07, 0.09, 0.2, 0.014), M(0xc08020, 0.55, 0.05), 0, 0.02, -0.04);
      D(() => { add(g, G(0.074, 0.02, 0.12, 0.004), M(0x1a1a1a, 0.6, 0.3), 0, 0.02, -0.04); add(g, C(0.016, 0.03, 12), dark, 0, 0.04, -0.15); });
      add(g, C(0.012, 0.16), dark, 0, 0.04, -0.2);
      add(g, G(0.036, 0.1, 0.048, 0.008), dark, 0, -0.06, 0.03).rotation.x = RAKE;
      r.pilot = add(g, new THREE.SphereGeometry(0.01, 6, 4), new THREE.MeshBasicMaterial({ color: 0x80c0ff }), 0, 0.04, -0.29);
      r.muzzle.position.set(0, 0.04, -0.3); r.adsY = 0;
      r.handR = pistolHand(new THREE.Vector3(0, -0.055, 0.032), { index: 'wrap' });
      break;
    }
    case 'grenade': {
      add(g, new THREE.SphereGeometry(0.04, 14, 10), M(opts.color || 0x3a4a2a, 0.6, 0.3), 0, 0, 0);
      add(g, G(0.02, 0.03, 0.02, 0.004), dark, 0, 0.045, 0);
      r.handR = pistolHand(new THREE.Vector3(0, -0.01, 0.0), { gripRadius: 0.035, index: 'wrap' });
      r.adsY = 0;
      break;
    }
    default: {
      add(g, G(0.05, 0.07, 0.4), body, 0, 0.02, -0.1);
      r.muzzle.position.set(0, 0.03, -0.32);
    }
  }
  mergeStatic(g, r);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return r;
}

// Fusiona por material todas las mallas fijas hijas directas del grupo
function mergeStatic(g, r) {
  const dyn = new Set([r.mag, r.slide, r.pump, r.cylinder, r.barrels, r.pilot, r.muzzle, ...r.extra].filter(Boolean));
  const byMat = new Map();
  for (const c of [...g.children]) {
    if (!c.isMesh || dyn.has(c) || c.material.transparent) continue;
    c.updateMatrix();
    const geo = c.geometry.index ? c.geometry.clone() : c.geometry.clone();
    geo.applyMatrix4(c.matrix);
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    const list = byMat.get(c.material) || [];
    list.push(geo.index ? geo : geo); byMat.set(c.material, list);
    g.remove(c);
  }
  for (const [mat, list] of byMat) {
    const allIdx = list.every((x) => x.index), noneIdx = list.every((x) => !x.index);
    const src = allIdx || noneIdx ? list : list.map((x) => (x.index ? x.toNonIndexed() : x));
    const merged = mergeGeometries(src, false);
    if (merged) g.add(new THREE.Mesh(merged, mat));
  }
}
