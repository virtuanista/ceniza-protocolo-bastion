// Rejilla de navegación con alturas y campos de flujo (Dijkstra multi-origen).
// Los campos de flujo permiten guiar cientos de agentes hacia cada jugador con coste O(1) por agente.

const SQ2 = Math.SQRT2;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

class MinHeap {
  constructor(cap) { this.k = new Float32Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  push(key, val) {
    if (this.n >= this.k.length) { const k2 = new Float32Array(this.k.length * 2); k2.set(this.k); this.k = k2; const v2 = new Int32Array(this.v.length * 2); v2.set(this.v); this.v = v2; }
    let i = this.n++;
    const k = this.k, v = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k[--this.n], lv = v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && k[c + 1] < k[c]) c++;
      if (k[c] >= lk) break;
      k[i] = k[c]; v[i] = v[c]; i = c;
    }
    k[i] = lk; v[i] = lv;
    return top;
  }
  topKey() { return this.k[0]; }
}

export class NavGrid {
  constructor(bounds, cell, boxes) {
    this.cell = cell;
    this.x0 = bounds[0] - 7; this.z0 = bounds[1] - 7;
    this.w = Math.ceil((bounds[2] - bounds[0] + 14) / cell);
    this.h = Math.ceil((bounds[3] - bounds[1] + 14) / cell);
    const N = this.w * this.h;
    this.N = N;
    this.floor = new Float32Array(N);
    this.blocked = new Uint8Array(N).fill(0);
    this.extra = new Float32Array(N); // coste adicional dinámico (puertas soldadas, fuego...)
    this.doorAt = new Int16Array(N).fill(-1);
    this.heap = new MinHeap(N);
    this._build(boxes);
  }

  idx(x, z) {
    const cx = Math.floor((x - this.x0) / this.cell), cz = Math.floor((z - this.z0) / this.cell);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return -1;
    return cz * this.w + cx;
  }
  cx(i) { return this.x0 + ((i % this.w) + 0.5) * this.cell; }
  cz(i) { return this.z0 + (Math.floor(i / this.w) + 0.5) * this.cell; }

  _build(boxes) {
    const c = this.cell, CL = 0.38; // holgura para el radio de los agentes
    for (let i = 0; i < this.N; i++) { this.floor[i] = 0; }
    // 1) alturas transitables
    for (const b of boxes) {
      if (b.max[1] > 2.65 || b.min[1] > 0.05 && b.min[1] > 2.65) continue;
      if (b.min[1] > 0.6) {
        // superficie apilada: solo cuenta si está sobre otra (escalera/plataforma)
      }
      this._forBox(b, 0, (i) => { if (b.max[1] > this.floor[i]) this.floor[i] = b.max[1]; });
    }
    // 2) bloqueos (con holgura)
    for (const b of boxes) {
      this._forBox(b, CL, (i) => {
        const f = this.floor[i];
        if (b.min[1] < f + 1.75 && b.max[1] > f + 0.46) this.blocked[i] = 1;
      });
    }
    // bordes del mundo
    for (let x = 0; x < this.w; x++) { this.blocked[x] = 1; this.blocked[(this.h - 1) * this.w + x] = 1; }
    for (let z = 0; z < this.h; z++) { this.blocked[z * this.w] = 1; this.blocked[z * this.w + this.w - 1] = 1; }
    void c;
  }

  _forBox(b, pad, fn) {
    const c = this.cell;
    const x0 = Math.max(0, Math.floor((b.min[0] - pad - this.x0) / c)), x1 = Math.min(this.w - 1, Math.floor((b.max[0] + pad - this.x0) / c - 1e-6));
    const z0 = Math.max(0, Math.floor((b.min[2] - pad - this.z0) / c)), z1 = Math.min(this.h - 1, Math.floor((b.max[2] + pad - this.z0) / c - 1e-6));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      // centro de la celda debe estar dentro (más la holgura)
      const px = this.x0 + (x + 0.5) * c, pz = this.z0 + (z + 0.5) * c;
      if (px < b.min[0] - pad || px > b.max[0] + pad || pz < b.min[2] - pad || pz > b.max[2] + pad) continue;
      fn(z * this.w + x);
    }
  }

  markDoor(door, index) {
    const b = door.box;
    this._forBox(b, 0.6, (i) => { if (!this.blocked[i]) this.doorAt[i] = index; });
  }

  walkable(i) { return i >= 0 && !this.blocked[i]; }

  // Dijkstra inverso: dist[i] = coste de ir de i a algún origen.
  // seeds: [[x,z,coste0], ...]; costFn: Float32Array opcional de multiplicadores por celda.
  computeField(seeds, out, costFn = null) {
    const N = this.N, dist = out || new Float32Array(N);
    dist.fill(Infinity);
    const heap = this.heap; heap.n = 0;
    for (const [x, z, c0] of seeds) {
      const i = this.idx(x, z);
      if (i < 0) continue;
      if (c0 < dist[i]) { dist[i] = c0; heap.push(c0, i); }
    }
    const w = this.w, floor = this.floor, blocked = this.blocked, extra = this.extra;
    while (heap.n > 0) {
      const d = heap.topKey();
      const i = heap.pop();
      if (d > dist[i]) continue;
      const x = i % w, z = (i / w) | 0;
      const fi = floor[i];
      for (let k = 0; k < 8; k++) {
        const D = DIRS[k];
        const nx = x + D[0], nz = z + D[1];
        if (nx < 0 || nz < 0 || nx >= w || nz >= this.h) continue;
        const j = nz * w + nx;
        if (blocked[j]) continue;
        // el agente va de j a i: subir como máximo 0.5 m
        if (fi - floor[j] > 0.5) continue;
        if (k >= 4) { // diagonales: no cortar esquinas
          if (blocked[z * w + nx] || blocked[nz * w + x]) continue;
        }
        let cost = D[2];
        if (costFn) cost *= costFn[j];
        cost += extra[j];
        const nd = d + cost;
        if (nd < dist[j]) { dist[j] = nd; heap.push(nd, j); }
      }
    }
    return dist;
  }

  // Dirección de descenso por el campo desde (x,z). Devuelve [dx,dz] o null.
  descend(dist, x, z, floorY = 0) {
    const i = this.idx(x, z);
    if (i < 0) return null;
    const w = this.w;
    const cx = i % w, cz = (i / w) | 0;
    let best = dist[i], bj = -1;
    if (this.blocked[i] || !isFinite(best)) best = Infinity;
    for (let k = 0; k < 8; k++) {
      const D = DIRS[k];
      const nx = cx + D[0], nz = cz + D[1];
      if (nx < 0 || nz < 0 || nx >= w || nz >= this.h) continue;
      const j = nz * w + nx;
      if (this.blocked[j]) continue;
      if (this.floor[j] - floorY > 0.55) continue;
      if (k >= 4 && (this.blocked[cz * w + nx] || this.blocked[nz * w + cx])) continue;
      if (dist[j] < best) { best = dist[j]; bj = j; }
    }
    if (bj < 0) return null;
    const tx = this.cx(bj) - x, tz = this.cz(bj) - z;
    const L = Math.hypot(tx, tz) || 1;
    return [tx / L, tz / L, best];
  }

  // Celda transitable más cercana (para colocar objetos y apariciones)
  nearestWalkable(x, z, maxR = 6) {
    let i = this.idx(x, z);
    if (i >= 0 && !this.blocked[i]) return [x, z];
    const c = this.cell;
    for (let r = 1; r < maxR / c; r++) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const px = x + Math.cos(ang) * r * c, pz = z + Math.sin(ang) * r * c;
        i = this.idx(px, pz);
        if (i >= 0 && !this.blocked[i]) return [this.cx(i), this.cz(i)];
      }
    }
    return [x, z];
  }
}
