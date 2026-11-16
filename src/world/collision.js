// Colisiones del mundo: AABB estáticas + dinámicas (puertas), movimiento de cilindros y raycasts.
// Se usa una rejilla espacial 2D para acelerar las consultas.

export class CollisionWorld {
  constructor(cell = 4) {
    this.boxes = [];
    this.cell = cell;
    this.grid = new Map();
    this.dynamic = []; // cajas que pueden activarse/desactivarse (puertas)
    this._qid = 0;
  }

  add(box) {
    // box: {min:[x,y,z], max:[x,y,z], solid:true, tag, door}
    box._q = 0;
    if (box.dynamic) { this.dynamic.push(box); return box; }
    this.boxes.push(box);
    const c = this.cell;
    const x0 = Math.floor(box.min[0] / c), x1 = Math.floor(box.max[0] / c);
    const z0 = Math.floor(box.min[2] / c), z1 = Math.floor(box.max[2] / c);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = x * 73856093 ^ z * 19349663;
      let arr = this.grid.get(k);
      if (!arr) { arr = []; this.grid.set(k, arr); }
      arr.push(box);
    }
    return box;
  }

  query(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    const q = ++this._qid;
    const c = this.cell;
    const x0 = Math.floor(minX / c), x1 = Math.floor(maxX / c);
    const z0 = Math.floor(minZ / c), z1 = Math.floor(maxZ / c);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const arr = this.grid.get(x * 73856093 ^ z * 19349663);
      if (!arr) continue;
      for (const b of arr) { if (b._q !== q) { b._q = q; out.push(b); } }
    }
    for (const b of this.dynamic) if (b.solid && b.max[0] >= minX && b.min[0] <= maxX && b.max[2] >= minZ && b.min[2] <= maxZ) out.push(b);
    return out;
  }

  // Mueve un cilindro (pos = pies) resolviendo colisiones. Devuelve flags.
  // opts.forEnemy: las puertas no soldadas no bloquean a enemigos (las abren).
  moveCylinder(pos, vel, radius, height, dt, opts = {}) {
    const res = { onGround: false, hitWall: false, hitCeil: false, blockers: null };
    const step = opts.stepHeight ?? 0.45;
    const tmp = this._tmp || (this._tmp = []);
    // Subpasos para evitar atravesar paredes a gran velocidad
    const dist = Math.hypot(vel.x, vel.y, vel.z) * dt;
    const n = Math.max(1, Math.ceil(dist / (radius * 0.8)));
    const sdt = dt / n;
    for (let s = 0; s < n; s++) {
      // Horizontal
      pos.x += vel.x * sdt;
      pos.z += vel.z * sdt;
      this.query(pos.x - radius - 0.1, pos.z - radius - 0.1, pos.x + radius + 0.1, pos.z + radius + 0.1, tmp);
      for (let iter = 0; iter < 2; iter++) {
        for (const b of tmp) {
          if (!b.solid) continue;
          if (opts.forEnemy && b.door && !b.door.blocksEnemies()) continue;
          if (opts.forPlayer && b.enemyOnly) continue;
          if (!opts.forEnemy && b.enemyOnly) continue;
          if (pos.y + height <= b.min[1] + 0.001 || pos.y >= b.max[1] - 0.001) continue;
          // escalón: si la parte superior es baja, subir
          if (b.max[1] - pos.y <= step && b.max[1] - pos.y > 0 && opts.canStep !== false) {
            const cx = Math.max(b.min[0], Math.min(pos.x, b.max[0]));
            const cz = Math.max(b.min[2], Math.min(pos.z, b.max[2]));
            const dx = pos.x - cx, dz = pos.z - cz;
            if (dx * dx + dz * dz < radius * radius && vel.y <= 0.1) { pos.y = b.max[1]; res.onGround = true; continue; }
          }
          const cx = Math.max(b.min[0], Math.min(pos.x, b.max[0]));
          const cz = Math.max(b.min[2], Math.min(pos.z, b.max[2]));
          let dx = pos.x - cx, dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= radius * radius) continue;
          if (d2 < 1e-8) {
            // centro dentro de la caja: expulsar por el eje más cercano
            const pushes = [pos.x - b.min[0] + radius, b.max[0] - pos.x + radius, pos.z - b.min[2] + radius, b.max[2] - pos.z + radius];
            let mi = 0; for (let i = 1; i < 4; i++) if (pushes[i] < pushes[mi]) mi = i;
            if (mi === 0) pos.x -= pushes[0]; else if (mi === 1) pos.x += pushes[1]; else if (mi === 2) pos.z -= pushes[2]; else pos.z += pushes[3];
          } else {
            const d = Math.sqrt(d2);
            const pen = radius - d;
            dx /= d; dz /= d;
            pos.x += dx * pen; pos.z += dz * pen;
            const vn = vel.x * dx + vel.z * dz;
            if (vn < 0) { vel.x -= vn * dx; vel.z -= vn * dz; }
          }
          res.hitWall = true;
          if (b.door) { (res.blockers || (res.blockers = [])).push(b); }
        }
      }
      // Vertical
      pos.y += vel.y * sdt;
      const floor = opts.floorY ?? 0;
      if (pos.y <= floor) { pos.y = floor; if (vel.y < 0) vel.y = 0; res.onGround = true; }
      this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, tmp);
      for (const b of tmp) {
        if (!b.solid) continue;
        if (opts.forEnemy && b.door && !b.door.blocksEnemies()) continue;
        if (!opts.forEnemy && b.enemyOnly) continue;
        const cx = Math.max(b.min[0], Math.min(pos.x, b.max[0]));
        const cz = Math.max(b.min[2], Math.min(pos.z, b.max[2]));
        const dx = pos.x - cx, dz = pos.z - cz;
        if (dx * dx + dz * dz >= (radius * 0.9) * (radius * 0.9)) continue;
        if (pos.y < b.max[1] && pos.y + height > b.min[1]) {
          if (vel.y <= 0 && pos.y > b.max[1] - 0.6) { pos.y = b.max[1]; vel.y = 0; res.onGround = true; }
          else if (vel.y > 0 && pos.y + height < b.min[1] + 0.6) { pos.y = b.min[1] - height; vel.y = 0; res.hitCeil = true; }
        } else if (Math.abs(pos.y - b.max[1]) < 0.05 && vel.y <= 0) {
          res.onGround = true;
        }
      }
    }
    return res;
  }

  // Raycast contra cajas. Devuelve {t, normal, box} o null.
  raycast(ox, oy, oz, dx, dy, dz, maxT, opts = {}) {
    let best = null, bestT = maxT;
    const cand = this._rc || (this._rc = []);
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    // Consulta por tramos para rayos largos
    const segs = Math.max(1, Math.ceil(maxT / 12));
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let s = 0; s < segs; s++) {
      const t0 = (s / segs) * maxT, t1 = ((s + 1) / segs) * maxT;
      if (t0 > bestT) break;
      const ax = ox + dx * t0, az = oz + dz * t0, bx = ox + dx * t1, bz = oz + dz * t1;
      this.query(Math.min(ax, bx) - 0.1, Math.min(az, bz) - 0.1, Math.max(ax, bx) + 0.1, Math.max(az, bz) + 0.1, cand);
      for (const b of cand) {
        if (seen.has(b)) continue; seen.add(b);
        if (!b.solid || b.noBullet) continue;
        if (opts.ignoreDoors && b.door) continue;
        if (b.enemyOnly) continue;
        const r = rayBox(ox, oy, oz, dx, dy, dz, b.min, b.max, bestT);
        if (r && r.t < bestT) { bestT = r.t; best = { t: r.t, normal: r.n, box: b }; }
      }
    }
    void ex; void ez;
    // suelo
    if (dy < -1e-6) {
      const t = -oy / dy;
      if (t > 0 && t < bestT) { bestT = t; best = { t, normal: [0, 1, 0], box: null, floor: true }; }
    }
    return best;
  }

  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-4) return true;
    const h = this.raycast(ax, ay, az, dx / L, dy / L, dz / L, L);
    return !h || h.t >= L - 0.05;
  }
}

export function rayBox(ox, oy, oz, dx, dy, dz, mn, mx, maxT) {
  let tmin = 0, tmax = maxT, nAxis = -1, nSign = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < mn[a] || o[a] > mx[a]) return null;
    } else {
      const inv = 1 / d[a];
      let t1 = (mn[a] - o[a]) * inv, t2 = (mx[a] - o[a]) * inv;
      let s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; nAxis = a; nSign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  if (nAxis < 0) return null; // origen dentro
  const n = [0, 0, 0]; n[nAxis] = nSign;
  return { t: tmin, n };
}

// Intersección rayo-esfera (para hitboxes de enemigos)
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  const thc = Math.sqrt(r * r - d2);
  let t0 = tca - thc;
  if (t0 < 0) t0 = tca + thc;
  return t0 < 0 ? -1 : t0;
}
