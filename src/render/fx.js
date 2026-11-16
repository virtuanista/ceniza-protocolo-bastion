// Efectos visuales: partículas (GPU points), trazadoras, arcos eléctricos, calcomanías,
// destellos de luz y restos físicos (gore). Todo con pools para no generar basura.
import * as THREE from 'three';
import { getTexture } from './textures.js';
import { rand } from '../core/utils.js';

const VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vAlpha; varying vec3 vColor;
uniform float uScale;
void main(){
  vAlpha = aAlpha; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying float vAlpha; varying vec3 vColor; uniform float uSoft;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  if(d>0.5) discard;
  float a = mix(1.0 - smoothstep(0.35,0.5,d), 1.0 - smoothstep(0.0,0.5,d), uSoft);
  gl_FragColor = vec4(vColor, a * vAlpha);
}`;

class ParticleSystem {
  constructor(scene, max, additive, soft) {
    this.max = max;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uScale: { value: 600 }, uSoft: { value: soft ? 1 : 0.3 } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
    // estado CPU
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.count = 0;
  }
  spawn(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 0, drag = 0, grow = 0, alpha = 1) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow; this.a0[i] = alpha; this.alpha[i] = alpha;
  }
  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._swap(i, --this.count); continue; }
      const i3 = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02) { this.pos[i3 + 1] = 0.02; this.vel[i3 + 1] *= -0.2; this.vel[i3] *= 0.5; this.vel[i3 + 2] *= 0.5; }
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.a0[i] * Math.min(1, t * 2.5);
      i++;
    }
    const n = this.count;
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) { const a = this.geo.attributes[k]; a.needsUpdate = true; a.clearUpdateRanges?.(); }
  }
  _swap(a, b) {
    if (a === b) return;
    const a3 = a * 3, b3 = b * 3;
    for (let k = 0; k < 3; k++) { this.pos[a3 + k] = this.pos[b3 + k]; this.vel[a3 + k] = this.vel[b3 + k]; this.col[a3 + k] = this.col[b3 + k]; }
    this.size[a] = this.size[b]; this.life[a] = this.life[b]; this.maxLife[a] = this.maxLife[b];
    this.grav[a] = this.grav[b]; this.drag[a] = this.drag[b]; this.grow[a] = this.grow[b]; this.a0[a] = this.a0[b]; this.alpha[a] = this.alpha[b];
  }
}

class LineBatch { // trazadoras y arcos: segmentos con color y desvanecimiento
  constructor(scene, max) {
    this.max = max;
    this.pos = new Float32Array(max * 6);
    this.col = new Float32Array(max * 6);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.rgb = new Float32Array(max * 3);
    this.count = 0;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }
  add(ax, ay, az, bx, by, bz, r, g, b, life) {
    if (this.count >= this.max) return;
    const i = this.count++, i6 = i * 6;
    this.pos[i6] = ax; this.pos[i6 + 1] = ay; this.pos[i6 + 2] = az; this.pos[i6 + 3] = bx; this.pos[i6 + 4] = by; this.pos[i6 + 5] = bz;
    this.rgb[i * 3] = r; this.rgb[i * 3 + 1] = g; this.rgb[i * 3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life;
  }
  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const j = --this.count;
        if (i !== j) {
          for (let k = 0; k < 6; k++) this.pos[i * 6 + k] = this.pos[j * 6 + k];
          for (let k = 0; k < 3; k++) this.rgb[i * 3 + k] = this.rgb[j * 3 + k];
          this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j];
        }
        continue;
      }
      const t = this.life[i] / this.maxLife[i];
      for (let v = 0; v < 2; v++) {
        const f = v === 0 ? t * 0.5 : t;
        this.col[i * 6 + v * 3] = this.rgb[i * 3] * f; this.col[i * 6 + v * 3 + 1] = this.rgb[i * 3 + 1] * f; this.col[i * 6 + v * 3 + 2] = this.rgb[i * 3 + 2] * f;
      }
      i++;
    }
    this.geo.setDrawRange(0, this.count * 2);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

class DecalPool {
  constructor(scene, max) {
    this.items = [];
    this.next = 0;
    this.mats = {};
    for (const [k, seed] of [['blood', 1], ['blood2', 2], ['bullethole', 1], ['scorch', 1], ['acid', 1]]) {
      const tex = getTexture(k === 'blood2' ? 'blood' : k, 1, seed, 128);
      this.mats[k] = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, opacity: 1, color: k === 'acid' ? 0xaaffaa : 0xffffff });
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(geo, this.mats.blood);
      m.visible = false; m.renderOrder = 1;
      scene.add(m);
      this.items.push(m);
    }
    this._n = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._z = new THREE.Vector3(0, 0, 1);
  }
  add(kind, x, y, z, nx, ny, nz, size) {
    const m = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    m.material = this.mats[kind] || this.mats.blood;
    this._n.set(nx, ny, nz).normalize();
    m.quaternion.setFromUnitVectors(this._z, this._n);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.position.set(x + nx * 0.015, y + ny * 0.015, z + nz * 0.015);
    m.scale.set(size, size, 1);
    m.visible = true;
  }
  clear() { for (const m of this.items) m.visible = false; }
}

// Restos físicos (gibs, cabezas, casquillos): cuerpos rígidos simples con rebote
class DebrisPool {
  constructor(scene, max) {
    this.scene = scene;
    this.items = [];
    this.active = [];
    this.max = max;
  }
  spawn(mesh, pos, vel, angVel, life = 8, bleed = false, collision = null) {
    if (this.active.length >= this.max) {
      const old = this.active.shift();
      this.scene.remove(old.mesh);
    }
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.active.push({ mesh, vel: vel.clone(), ang: angVel.clone(), life, bleed, coll: collision, rest: false, r: 0.12, bleedT: 0 });
  }
  update(dt, fx) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const d = this.active[i];
      d.life -= dt;
      if (d.life <= 0) { this.scene.remove(d.mesh); this.active.splice(i, 1); continue; }
      if (d.life < 1) d.mesh.position.y -= dt * 0.25; // se hunde
      if (d.rest) continue;
      d.vel.y -= 18 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.ang.x * dt; d.mesh.rotation.y += d.ang.y * dt; d.mesh.rotation.z += d.ang.z * dt;
      const p = d.mesh.position;
      if (p.y < d.r) {
        p.y = d.r;
        if (d.bleed && d.vel.y < -2) fx.decal('blood', p.x, 0.01, p.z, 0, 1, 0, rand(0.4, 0.9));
        d.vel.y *= -0.35; d.vel.x *= 0.6; d.vel.z *= 0.6; d.ang.multiplyScalar(0.6);
        if (Math.abs(d.vel.y) < 0.6 && d.vel.lengthSq() < 0.5) d.rest = true;
      }
      if (d.coll) {
        const tmp = d._tmp || (d._tmp = []);
        d.coll.query(p.x - 0.2, p.z - 0.2, p.x + 0.2, p.z + 0.2, tmp);
        for (const b of tmp) {
          if (!b.solid) continue;
          if (p.x > b.min[0] - 0.1 && p.x < b.max[0] + 0.1 && p.z > b.min[2] - 0.1 && p.z < b.max[2] + 0.1 && p.y > b.min[1] && p.y < b.max[1] + 0.1) {
            if (p.y > b.max[1] - 0.25 && d.vel.y < 0) { p.y = b.max[1] + 0.1; d.vel.y *= -0.3; d.vel.x *= 0.6; d.vel.z *= 0.6; }
            else { d.vel.x *= -0.4; d.vel.z *= -0.4; p.x += d.vel.x * dt * 2; p.z += d.vel.z * dt * 2; }
          }
        }
      }
      if (d.bleed) {
        d.bleedT -= dt;
        if (d.bleedT <= 0) { d.bleedT = 0.04; fx.blood.spawn(p.x, p.y, p.z, rand(-0.5, 0.5), rand(0, 1), rand(-0.5, 0.5), 0.45, 0.02, 0.02, rand(0.05, 0.1), 0.6, 9.8, 0.5); }
      }
    }
  }
  clear() { for (const d of this.active) this.scene.remove(d.mesh); this.active.length = 0; }
}

export class FX {
  constructor(scene, settings) {
    this.scene = scene;
    const q = settings.quality;
    this.scale = q === 'low' ? 0.5 : q === 'medium' ? 0.8 : 1;
    this.glow = new ParticleSystem(scene, Math.floor(4000 * this.scale), true, true);
    this.sparks = new ParticleSystem(scene, Math.floor(2000 * this.scale), true, false);
    this.blood = new ParticleSystem(scene, Math.floor(3000 * this.scale), false, false);
    this.smoke = new ParticleSystem(scene, Math.floor(1500 * this.scale), false, true);
    this.lines = new LineBatch(scene, 400);
    this.decals = new DecalPool(scene, q === 'low' ? 60 : 160);
    this.debris = new DebrisPool(scene, q === 'low' ? 30 : 70);
    this.flashes = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 12, 1.5);
      scene.add(l);
      this.flashes.push({ light: l, t: 0, dur: 0.1, peak: 0 });
    }
    this._fi = 0;
    this._v = new THREE.Vector3();
  }

  setPixelScale(h) { const s = h * 0.9; for (const ps of [this.glow, this.sparks, this.blood, this.smoke]) ps.mat.uniforms.uScale.value = s; }

  flash(x, y, z, color = 0xffaa55, intensity = 40, dur = 0.08, dist = 12) {
    const f = this.flashes[this._fi]; this._fi = (this._fi + 1) % this.flashes.length;
    f.light.position.set(x, y, z); f.light.color.set(color); f.light.distance = dist;
    f.t = dur; f.dur = dur; f.peak = intensity; f.light.intensity = intensity;
  }

  decal(kind, x, y, z, nx, ny, nz, size) { this.decals.add(kind, x, y, z, nx, ny, nz, size); }

  muzzle(pos, dir, color = [1, 0.7, 0.3], big = 1) {
    const n = Math.floor(6 * big);
    for (let i = 0; i < n; i++) {
      const s = rand(1, 6) * big;
      this.glow.spawn(pos.x + dir.x * 0.05, pos.y + dir.y * 0.05, pos.z + dir.z * 0.05, dir.x * s + rand(-1, 1), dir.y * s + rand(-1, 1), dir.z * s + rand(-1, 1), color[0], color[1], color[2], rand(0.12, 0.25) * big, rand(0.03, 0.07));
    }
    this.smoke.spawn(pos.x, pos.y, pos.z, dir.x * 1.5, 0.4, dir.z * 1.5, 0.35, 0.33, 0.3, 0.2 * big, 0.6, -0.3, 1.5, 0.8, 0.25);
  }

  tracer(a, b, color = [1, 0.85, 0.5], life = 0.06) {
    this.lines.add(a.x, a.y, a.z, b.x, b.y, b.z, color[0], color[1], color[2], life);
  }

  arc(a, b, color = [0.5, 0.8, 1], segs = 8, jitter = 0.35, life = 0.12) {
    let px = a.x, py = a.y, pz = a.z;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const j = i === segs ? 0 : jitter;
      const nx = a.x + (b.x - a.x) * t + rand(-j, j), ny = a.y + (b.y - a.y) * t + rand(-j, j), nz = a.z + (b.z - a.z) * t + rand(-j, j);
      this.lines.add(px, py, pz, nx, ny, nz, color[0], color[1], color[2], life);
      if (Math.random() < 0.3) this.glow.spawn(nx, ny, nz, rand(-1, 1), rand(-1, 1), rand(-1, 1), color[0], color[1], color[2], 0.15, 0.1);
      px = nx; py = ny; pz = nz;
    }
  }

  impact(p, n, surface = 'concrete') {
    // chispas + polvo + agujero de bala
    const metal = surface === 'metal' || surface === 'container' || surface === 'vehicle' || surface === 'shelf' || surface === 'door';
    const cnt = metal ? 8 : 4;
    for (let i = 0; i < cnt; i++) {
      this.sparks.spawn(p.x, p.y, p.z, n[0] * rand(2, 6) + rand(-2, 2), n[1] * rand(2, 6) + rand(0, 3), n[2] * rand(2, 6) + rand(-2, 2), 1, rand(0.6, 0.9), 0.4, rand(0.04, 0.07), rand(0.15, 0.4), 12, 1);
    }
    const dc = metal ? 0.5 : 0.42;
    for (let i = 0; i < 3; i++) this.smoke.spawn(p.x, p.y, p.z, n[0] * rand(0.5, 1.5) + rand(-0.3, 0.3), n[1] * rand(0.5, 1.5) + rand(0, 0.4), n[2] * rand(0.5, 1.5) + rand(-0.3, 0.3), dc, dc * 0.95, dc * 0.9, rand(0.15, 0.3), rand(0.4, 0.9), -0.2, 2, 0.5, 0.5);
    this.decal('bullethole', p.x, p.y, p.z, n[0], n[1], n[2], rand(0.08, 0.13));
  }

  bloodHit(p, dir, amount = 1, color = [0.5, 0.02, 0.02]) {
    const n = Math.floor(10 * amount * this.scale) + 2;
    for (let i = 0; i < n; i++) {
      const s = rand(1, 4.5);
      this.blood.spawn(p.x, p.y, p.z, dir.x * s + rand(-1.5, 1.5), dir.y * s + rand(-0.5, 2.5), dir.z * s + rand(-1.5, 1.5), color[0] * rand(0.7, 1.2), color[1], color[2], rand(0.05, 0.13) * Math.sqrt(amount), rand(0.4, 0.9), 9.8, 0.6);
    }
    for (let i = 0; i < 2; i++) this.blood.spawn(p.x, p.y, p.z, rand(-0.3, 0.3), rand(0, 0.4), rand(-0.3, 0.3), color[0] * 0.8, color[1], color[2], rand(0.2, 0.35) * amount, 0.35, 0, 3, 1.2, 0.6);
  }

  bloodBurst(p, amount = 1, color = [0.5, 0.02, 0.02]) {
    const n = Math.floor(50 * amount * this.scale);
    for (let i = 0; i < n; i++) {
      const s = rand(2, 9) * Math.sqrt(amount);
      const th = rand(0, Math.PI * 2), ph = rand(-0.2, 1.2);
      this.blood.spawn(p.x, p.y, p.z, Math.cos(th) * Math.cos(ph) * s, Math.sin(ph) * s, Math.sin(th) * Math.cos(ph) * s, color[0] * rand(0.6, 1.2), color[1], color[2], rand(0.06, 0.2), rand(0.6, 1.3), 12, 0.4);
    }
    for (let i = 0; i < 3; i++) this.decal(Math.random() < 0.5 ? 'blood' : 'blood2', p.x + rand(-1.2, 1.2), 0.01, p.z + rand(-1.2, 1.2), 0, 1, 0, rand(0.8, 1.8) * amount);
  }

  explosion(p, radius = 5, kind = 'fire') {
    const k = this.scale;
    const col = kind === 'acid' ? [0.5, 1, 0.2] : kind === 'electric' ? [0.4, 0.7, 1] : kind === 'heal' ? [0.3, 1, 0.5] : [1, 0.55, 0.15];
    for (let i = 0; i < 70 * k; i++) {
      const s = rand(2, 12) * radius / 5;
      const th = rand(0, Math.PI * 2), ph = rand(-0.3, 1.3);
      this.glow.spawn(p.x, p.y + 0.3, p.z, Math.cos(th) * Math.cos(ph) * s, Math.sin(ph) * s, Math.sin(th) * Math.cos(ph) * s, col[0], col[1] * rand(0.6, 1), col[2], rand(0.4, 1.0) * radius / 5, rand(0.15, 0.45), -1, 3, 2);
    }
    for (let i = 0; i < 40 * k; i++) {
      this.sparks.spawn(p.x, p.y + 0.3, p.z, rand(-14, 14), rand(2, 16), rand(-14, 14), 1, 0.8, 0.4, rand(0.05, 0.1), rand(0.4, 1.2), 14, 0.3);
    }
    if (kind !== 'heal') for (let i = 0; i < 25 * k; i++) {
      const g = kind === 'acid' ? [0.25, 0.4, 0.15] : [0.18, 0.16, 0.15];
      this.smoke.spawn(p.x + rand(-1, 1), p.y + rand(0, 1), p.z + rand(-1, 1), rand(-2.5, 2.5), rand(0.5, 3.5), rand(-2.5, 2.5), g[0], g[1], g[2], rand(1, 2) * radius / 5, rand(1.2, 2.8), -0.4, 1.2, 1.4, 0.7);
    }
    this.flash(p.x, p.y + 1, p.z, kind === 'acid' ? 0x88ff44 : kind === 'electric' ? 0x66aaff : kind === 'heal' ? 0x44ff88 : 0xff8833, 160, 0.35, radius * 3.5);
    if (kind !== 'heal') this.decal(kind === 'acid' ? 'acid' : 'scorch', p.x, 0.01, p.z, 0, 1, 0, radius * 0.9);
  }

  fireBurst(p, dir, strength = 1) {
    for (let i = 0; i < 4; i++) {
      const s = rand(6, 11) * strength;
      this.glow.spawn(p.x, p.y, p.z, dir.x * s + rand(-1, 1), dir.y * s + rand(-0.5, 1.5), dir.z * s + rand(-1, 1), 1, rand(0.35, 0.65), 0.1, rand(0.2, 0.4), rand(0.35, 0.6), -2.5, 2.4, 1.6);
    }
    if (Math.random() < 0.3) this.smoke.spawn(p.x + dir.x * 4, p.y + 0.5, p.z + dir.z * 4, rand(-0.5, 0.5), 1.5, rand(-0.5, 0.5), 0.15, 0.13, 0.12, 0.5, 1.2, -0.5, 1, 1, 0.4);
  }

  burn(p, intensity = 1) {
    if (Math.random() > 0.6 * intensity) return;
    this.glow.spawn(p.x + rand(-0.25, 0.25), p.y + rand(0, 1.2), p.z + rand(-0.25, 0.25), rand(-0.3, 0.3), rand(1, 2.5), rand(-0.3, 0.3), 1, rand(0.35, 0.6), 0.1, rand(0.2, 0.4), rand(0.3, 0.6), -1, 1, 0.4);
  }

  healPuff(p) {
    for (let i = 0; i < 18; i++) this.glow.spawn(p.x + rand(-0.4, 0.4), p.y + rand(0, 1.6), p.z + rand(-0.4, 0.4), rand(-0.3, 0.3), rand(0.5, 1.5), rand(-0.3, 0.3), 0.2, 1, 0.5, rand(0.08, 0.16), rand(0.5, 1));
  }

  shell(pos, right, color = [0.85, 0.65, 0.25]) { // casquillo eyectado (partícula brillante breve)
    this.sparks.spawn(pos.x, pos.y, pos.z, right.x * rand(1.5, 3) + rand(-0.3, 0.3), rand(1.5, 3), right.z * rand(1.5, 3) + rand(-0.3, 0.3), color[0] * 0.5, color[1] * 0.5, color[2] * 0.5, 0.035, 0.6, 9.8, 0.1);
  }

  update(dt) {
    this.glow.update(dt); this.sparks.update(dt); this.blood.update(dt); this.smoke.update(dt);
    this.lines.update(dt);
    this.debris.update(dt, this);
    for (const f of this.flashes) {
      if (f.t > 0) { f.t -= dt; f.light.intensity = Math.max(0, f.peak * (f.t / f.dur)); } else f.light.intensity = 0;
    }
  }

  clear() {
    for (const ps of [this.glow, this.sparks, this.blood, this.smoke]) ps.count = 0;
    this.lines.count = 0;
    this.decals.clear();
    this.debris.clear();
  }
}
