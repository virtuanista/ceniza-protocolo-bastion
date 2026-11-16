// Construye el mundo jugable a partir de los datos del mapa: mallas fusionadas por material,
// colisiones, navegación, puertas soldables, luces dinámicas (pool) y atrezo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CollisionWorld } from './collision.js';
import { NavGrid } from './nav.js';
import { getTexture } from '../render/textures.js';
import { MAPS } from './maps.js';
import { rand } from '../core/utils.js';

const MATS = {
  concrete: { tex: 'concrete', scale: 3, rough: 0.95, color: 0xb0aca5 },
  brick: { tex: 'brick', scale: 3, rough: 0.9, color: 0xc8b8b0 },
  metal: { tex: 'metal', scale: 2, rough: 0.6, metal: 0.5, color: 0xa8a8a8 },
  rust: { tex: 'rust', scale: 2, rough: 0.85, color: 0xffffff },
  crate: { tex: 'crate', scale: 1.1, rough: 0.85, color: 0xffffff, fit: true },
  container: { tex: 'metal', scale: 1.5, rough: 0.7, metal: 0.4, color: 0xffffff, tinted: true },
  vehicle: { tex: 'rust', scale: 2, rough: 0.6, metal: 0.4, color: 0xffffff, tinted: true },
  sandbag: { tex: 'dirt', scale: 0.8, rough: 1, color: 0xb8a888 },
  shelf: { tex: 'metal', scale: 1.4, rough: 0.6, metal: 0.4, color: 0x707a88 },
  panel: { tex: 'panel', scale: 2.5, rough: 0.55, color: 0xe0e8ea },
  tiles: { tex: 'tiles', scale: 2, rough: 0.4, color: 0xffffff },
  vat: { tex: 'metal', scale: 2, rough: 0.3, metal: 0.6, color: 0x6a8a7a, emissive: 0x0a3a1a },
  server: { tex: 'grate', scale: 1, rough: 0.5, metal: 0.5, color: 0x8090a0, emissive: 0x001830 },
  bed: { tex: 'panel', scale: 1, rough: 0.8, color: 0xd8d8d0 },
};
const FLOOR_SCALE = { asphalt: 4, concrete: 4, tiles: 2, dirt: 4, grate: 2 };

export class Door {
  constructor(def, index, world) {
    this.def = def; this.id = def.id; this.index = index; this.world = world;
    this.name = def.name;
    this.maxWeld = 1600;
    this.weld = 0;
    this.closed = false;
    this.destroyed = false;
    this.repair = 100;
    this.openT = 1; // 1 = abierta
    this.autoCloseTimer = 0;
    const t = 0.18, hw = def.w / 2;
    const min = def.axis === 'x' ? [def.x - hw, 0, def.z - t] : [def.x - t, 0, def.z - hw];
    const max = def.axis === 'x' ? [def.x + hw, def.h, def.z + t] : [def.x + t, def.h, def.z + hw];
    this.box = { min, max, solid: false, dynamic: true, door: this };
    this.center = new THREE.Vector3(def.x, def.h / 2, def.z);
  }
  blocksEnemies() { return this.closed && !this.destroyed && this.weld > 0; }
  isSolid() { return this.closed && !this.destroyed; }
  setClosed(c) {
    if (this.destroyed) return false;
    if (!c && this.weld > 0) return false;
    this.closed = c;
    this.box.solid = c;
    return true;
  }
  damage(amount) {
    if (!this.blocksEnemies()) return false;
    this.weld = Math.max(0, this.weld - amount);
    if (this.weld <= 0) { this.destroy(); return true; }
    return false;
  }
  destroy() {
    this.destroyed = true; this.closed = false; this.box.solid = false; this.weld = 0; this.repair = 0;
  }
  // amount positivo suelda, negativo desuelda. Devuelve puntos aplicados
  applyWeld(amount) {
    if (this.destroyed) {
      this.repair = Math.min(100, this.repair + amount * 0.05);
      if (this.repair >= 100) { this.destroyed = false; this.closed = false; this.box.solid = false; this.weld = 0; }
      return amount;
    }
    if (!this.closed) { if (amount > 0) this.setClosed(true); else return 0; }
    const before = this.weld;
    this.weld = Math.max(0, Math.min(this.maxWeld, this.weld + amount));
    return this.weld - before;
  }
  get weldPct() { return this.weld / this.maxWeld; }
}

export class World {
  constructor(scene, mapId, settings) {
    this.scene = scene;
    this.settings = settings;
    this.def = MAPS[mapId]();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.collision = new CollisionWorld(4);
    for (const b of this.def.boxes) { b.solid = true; this.collision.add(b); }
    this.doors = this.def.doors.map((d, i) => new Door(d, i, this));
    for (const d of this.doors) this.collision.add(d.box);
    this.nav = new NavGrid(this.def.bounds, 0.75, this.def.boxes);
    this.doors.forEach((d, i) => this.nav.markDoor(d, i));
    this.animated = [];
    this.lightDefs = this.def.lights;
    this._buildGeometry();
    this._buildEnvironment();
    this._buildDoors();
    this._buildProps();
    this._buildLights();
    this._buildSpawnMarkers();
    this.time = 0;
  }

  _material(key) {
    const m = MATS[key] || MATS.concrete;
    const mat = new THREE.MeshStandardMaterial({
      map: getTexture(m.tex, 1, key.length * 7 + 3),
      roughness: m.rough, metalness: m.metal || 0, color: m.color,
      vertexColors: !!m.tinted,
    });
    if (m.emissive) mat.emissive = new THREE.Color(m.emissive);
    return mat;
  }

  _boxGeometry(b, scale, fit, tint) {
    const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    // UVs en espacio mundo para que la textura no se estire
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
      let u, v;
      if (fit) {
        const lu = nx > 0.5 ? (z - b.min[2]) / sz : ny > 0.5 ? (x - b.min[0]) / sx : (x - b.min[0]) / sx;
        const lv = ny > 0.5 ? (z - b.min[2]) / sz : (y - b.min[1]) / sy;
        u = lu; v = lv;
      } else if (nx > 0.5) { u = z / scale; v = y / scale; }
      else if (ny > 0.5) { u = x / scale; v = z / scale; }
      else { u = x / scale; v = y / scale; }
      uv.setXY(i, u, v);
    }
    if (tint !== undefined) {
      const col = new THREE.Color(tint);
      const arr = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const shade = 0.85 + 0.15 * Math.sin(pos.getX(i) * 7 + pos.getZ(i) * 7); // ondulado del contenedor
        arr[i * 3] = col.r * shade; arr[i * 3 + 1] = col.g * shade; arr[i * 3 + 2] = col.b * shade;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    return g;
  }

  _buildGeometry() {
    const groups = new Map();
    const shadows = this.settings.quality === 'high';
    for (const b of this.def.boxes) {
      const key = b.mat;
      const m = MATS[key] || MATS.concrete;
      if (b.partialRoof) {
        // techo con hueco (atrio)
        const [hx0, hz0, hx1, hz1] = b.partialRoof;
        const parts = [
          { min: [b.min[0], b.min[1], b.min[2]], max: [b.max[0], b.max[1], hz0] },
          { min: [b.min[0], b.min[1], hz1], max: [b.max[0], b.max[1], b.max[2]] },
          { min: [b.min[0], b.min[1], hz0], max: [hx0, b.max[1], hz1] },
          { min: [hx1, b.min[1], hz0], max: [b.max[0], b.max[1], hz1] },
        ];
        for (const p of parts) {
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(this._boxGeometry(p, m.scale, false));
        }
        b.solid = true;
        continue;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(this._boxGeometry(b, m.scale, m.fit, m.tinted ? (b.tint ?? 0x888888) : undefined));
    }
    for (const [key, geos] of groups) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, this._material(key));
      mesh.castShadow = shadows; mesh.receiveShadow = shadows;
      this.group.add(mesh);
    }
    // Suelo base
    const [bx0, bz0, bx1, bz1] = this.def.bounds;
    const fw = bx1 - bx0 + 20, fd = bz1 - bz0 + 20;
    const fg = new THREE.PlaneGeometry(fw, fd);
    fg.rotateX(-Math.PI / 2);
    fg.translate((bx0 + bx1) / 2, 0, (bz0 + bz1) / 2);
    this._worldUV(fg, FLOOR_SCALE[this.def.floor] || 4);
    const fm = new THREE.MeshStandardMaterial({ map: getTexture(this.def.floor, 1, 11), roughness: 0.92, color: 0xa09890 });
    const floor = new THREE.Mesh(fg, fm);
    floor.receiveShadow = shadows;
    this.group.add(floor);
    for (const fa of this.def.floorAreas || []) {
      const [x0, z0, x1, z1] = fa.rect;
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0.01, (z0 + z1) / 2);
      this._worldUV(g, FLOOR_SCALE[fa.mat] || 4);
      const m = new THREE.MeshStandardMaterial({ map: getTexture(fa.mat, 1, 21), roughness: fa.mat === 'tiles' ? 0.35 : 0.9, color: fa.mat === 'tiles' ? 0xc0c4c4 : 0x9a9690 });
      const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = shadows;
      this.group.add(mesh);
    }
  }

  _worldUV(g, scale) {
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / scale, pos.getZ(i) / scale);
  }

  _buildEnvironment() {
    const d = this.def;
    this.scene.fog = new THREE.FogExp2(d.fog.color, d.fog.density);
    this.scene.background = new THREE.Color(d.fog.color);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 24, 12), new THREE.MeshBasicMaterial({ map: getTexture('sky', 1, 1, 512), side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10;
    this.group.add(sky);
    this.hemi = new THREE.HemisphereLight(d.ambient.sky, d.ambient.ground, d.ambient.intensity * 2);
    this.group.add(this.hemi);
    const moon = new THREE.DirectionalLight(d.moon.color, d.moon.intensity * 2.2);
    const md = new THREE.Vector3(...d.moon.dir).normalize();
    moon.position.copy(md).multiplyScalar(-60);
    moon.target.position.set(0, 0, 0);
    if (this.settings.quality === 'high') {
      moon.castShadow = true;
      moon.shadow.mapSize.set(2048, 2048);
      const s = 50;
      Object.assign(moon.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 140 });
      moon.shadow.bias = -0.0008;
      moon.shadow.normalBias = 0.04;
    }
    this.moon = moon;
    this.group.add(moon, moon.target);
  }

  _buildDoors() {
    const doorTex = getTexture('metal', 1, 404);
    const hazard = getTexture('hazard', 1, 1);
    for (const door of this.doors) {
      const d = door.def;
      const g = new THREE.Group();
      const w = d.w, h = d.h;
      const panelMat = new THREE.MeshStandardMaterial({ map: doorTex, color: 0x8a8f96, roughness: 0.55, metalness: 0.6 });
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.22), panelMat);
      panel.position.y = h / 2;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, 0.24), new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.7 }));
      stripe.position.y = 0.3;
      panel.add(stripe); stripe.position.y = -h / 2 + 0.3;
      // cordones de soldadura (se iluminan según integridad)
      const weldMat = new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0 });
      const weldL = new THREE.Mesh(new THREE.BoxGeometry(0.08, h * 0.9, 0.26), weldMat);
      weldL.position.set(-w / 2 + 0.06, 0, 0);
      const weldR = weldL.clone(); weldR.position.x = w / 2 - 0.06;
      const weldM = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.08, 0.26), weldMat);
      panel.add(weldL, weldR, weldM);
      const pivot = new THREE.Group();
      pivot.add(panel);
      g.add(pivot);
      g.position.set(d.x, 0, d.z);
      if (d.axis === 'z') g.rotation.y = Math.PI / 2;
      this.group.add(g);
      door.mesh = g; door.panel = panel; door.pivot = pivot; door.weldMat = weldMat;
      door.panelMat = panelMat;
    }
  }

  _buildProps() {
    const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14);
    const barrelMat = new THREE.MeshStandardMaterial({ map: getTexture('rust', 1, 33), color: 0x9a4a2a, roughness: 0.7, metalness: 0.3 });
    const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 5.5, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6, metalness: 0.7 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd8a0 });
    this.fires = [];
    for (const p of this.def.props) {
      const [x, z] = p.pos;
      if (p.type === 'barrel' || p.type === 'fire') {
        const m = new THREE.Mesh(barrelGeo, barrelMat);
        m.position.set(x, 0.55, z);
        m.castShadow = this.settings.quality === 'high';
        this.group.add(m);
        this.collision.add({ min: [x - 0.42, 0, z - 0.42], max: [x + 0.42, 1.1, z + 0.42], solid: true, mat: 'barrel' });
        if (p.type === 'fire') this.fires.push({ pos: new THREE.Vector3(x, 1.15, z), t: rand(0, 1) });
      } else if (p.type === 'lamp') {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(x, 2.75, z);
        this.group.add(post);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.3), lampMat);
        head.position.set(x, 5.5, z);
        this.group.add(head);
        this.collision.add({ min: [x - 0.12, 0, z - 0.12], max: [x + 0.12, 5.5, z + 0.12], solid: true, mat: 'lamp' });
      } else if (p.type === 'corpse') {
        this.decorCorpses = this.decorCorpses || [];
        this.decorCorpses.push(p.pos);
      }
    }
  }

  _buildLights() {
    // Pool fijo de luces puntuales: se asignan a las fuentes más cercanas a la cámara.
    const count = this.settings.quality === 'low' ? 3 : this.settings.quality === 'medium' ? 5 : 7;
    this.lightPool = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.2);
      this.group.add(l);
      this.lightPool.push(l);
    }
    // Halo visible en cada fuente (barato)
    const haloTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const ctx = c.getContext('2d');
      const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); return t;
    })();
    this.haloTex = haloTex;
    this.halos = [];
    for (const ld of this.lightDefs) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: ld.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }));
      s.position.set(...ld.pos);
      s.scale.setScalar(2.2);
      this.group.add(s);
      ld.halo = s;
      ld.cur = ld.intensity;
      this.halos.push(s);
    }
    for (const f of this.fires) {
      const ld = { pos: [f.pos.x, f.pos.y + 0.6, f.pos.z], color: 0xff7020, intensity: 9, dist: 10, flicker: 0.6, fire: true };
      this.lightDefs.push(ld); ld.cur = 9;
    }
    this._lightTimer = 0;
  }

  _buildSpawnMarkers() {
    // Marcas visuales en los accesos de la horda (puertas rotas, rejillas)
    const mat = new THREE.MeshStandardMaterial({ map: getTexture('grate', 1, 5), color: 0x666666, roughness: 0.6, metalness: 0.5 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x501008 });
    for (const s of this.def.spawns) {
      if (s.vent) {
        const g = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.6), mat);
        g.position.set(s.pos[0], 0.03, s.pos[1]);
        this.group.add(g);
      } else {
        const g = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), glow);
        g.position.set(s.pos[0], 3, s.pos[1] + (s.pos[1] > 0 ? 2.5 : -2.5));
        g.rotation.y = s.pos[1] > 0 ? Math.PI : 0;
        this.group.add(g);
      }
    }
  }

  // Actualiza animaciones de puertas y asignación de luces
  update(dt, camPos) {
    this.time += dt;
    for (const door of this.doors) {
      const target = door.destroyed ? 2 : door.closed ? 0 : 1;
      door.openT += (target - door.openT) * Math.min(1, dt * 8);
      const w = door.def.w;
      if (door.destroyed) {
        door.pivot.position.set(0, 0, 0);
        door.panel.rotation.x = -Math.min(1, door.openT - 1) * 1.45;
        door.panel.position.set(0, door.def.h / 2 * Math.cos(door.panel.rotation.x) + 0.1, Math.sin(-door.panel.rotation.x) * door.def.h / 2);
      } else {
        door.panel.rotation.x = 0;
        door.panel.position.set(0, door.def.h / 2, 0);
        door.pivot.position.x = Math.min(1, door.openT) * w * 0.95; // se desliza dentro de la pared
      }
      const wp = door.weldPct;
      door.weldMat.opacity = wp > 0 ? 0.35 + wp * 0.65 : 0;
      door.weldMat.color.setHSL(0.07 - wp * 0.04, 1, 0.45 + 0.1 * Math.sin(this.time * 6));
      door.panelMat.emissive?.setRGB(wp * 0.15, wp * 0.05, 0);
    }
    this._lightTimer -= dt;
    if (this._lightTimer <= 0) {
      this._lightTimer = 0.25;
      const sorted = this.lightDefs.slice().sort((a, b) => dist2(a.pos, camPos) - dist2(b.pos, camPos));
      for (let i = 0; i < this.lightPool.length; i++) {
        const l = this.lightPool[i]; const ld = sorted[i];
        if (!ld) { l.intensity = 0; continue; }
        l.position.set(...ld.pos); l.color.set(ld.color); l.distance = ld.dist; l.userData.def = ld;
      }
    }
    for (const ld of this.lightDefs) {
      let k = 1;
      if (ld.flicker) {
        const n = Math.sin(this.time * 17 + ld.pos[0]) * Math.sin(this.time * 7.3 + ld.pos[2]);
        k = n > 1 - ld.flicker * 1.6 ? 0.25 : 1;
        if (ld.fire) k = 0.75 + Math.sin(this.time * 23 + ld.pos[0]) * 0.15 + Math.sin(this.time * 31) * 0.1;
      }
      ld.cur = ld.intensity * k;
      if (ld.halo) ld.halo.material.opacity = 0.5 * k;
    }
    for (const l of this.lightPool) if (l.userData.def) l.intensity = l.userData.def.cur;
  }

  isIndoor(x, z) {
    for (const r of this.def.indoor || []) if (x > r[0] && x < r[2] && z > r[1] && z < r[3]) return true;
    return false;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); } });
  }
}

function dist2(p, v) { const dx = p[0] - v.x, dy = p[1] - v.y, dz = p[2] - v.z; return dx * dx + dy * dy + dz * dz; }
