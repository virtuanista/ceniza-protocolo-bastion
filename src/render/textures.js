// Texturas procedurales generadas en canvas: todo el arte de superficies es original.
import * as THREE from 'three';
import { seeded } from '../core/utils.js';

const cache = new Map();
let maxAniso = 4;
export function setMaxAnisotropy(a) { maxAniso = a; }

function makeNoise(size, seed) {
  const rnd = seeded(seed);
  const grid = 16;
  const g = new Float32Array((grid + 1) * (grid + 1));
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  // periódico
  for (let i = 0; i <= grid; i++) { g[i * (grid + 1) + grid] = g[i * (grid + 1)]; g[grid * (grid + 1) + i] = g[i]; }
  return (x, y, freq = 1) => {
    const fx = ((x / size) * grid * freq) % grid, fy = ((y / size) * grid * freq) % grid;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const i = (yy, xx) => g[(yy % grid) * (grid + 1) + (xx % grid)];
    const a = i(y0, x0), b = i(y0, x0 + 1), c = i(y0 + 1, x0), d = i(y0 + 1, x0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function fbm(noise, x, y, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { v += noise(x, y, f) * amp; amp *= 0.5; f *= 2; }
  return v;
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function pixelPass(c, fn) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const r = fn(x, y, d[i], d[i + 1], d[i + 2]);
      d[i] = r[0]; d[i + 1] = r[1]; d[i + 2] = r[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

const generators = {
  concrete(size, seed) {
    const c = canvas(size); const n = makeNoise(size, seed);
    pixelPass(c, (x, y) => {
      const v = fbm(n, x, y, 5);
      const spots = n(x, y, 6) > 0.78 ? -25 : 0;
      const b = 105 + v * 70 + spots;
      return [b * 0.98, b * 0.97, b * 0.94];
    });
    const ctx = c.getContext('2d');
    const r = seeded(seed + 9);
    ctx.strokeStyle = 'rgba(20,20,20,0.35)'; ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) { // grietas
      ctx.beginPath(); let px = r() * size, py = r() * size; ctx.moveTo(px, py);
      for (let s = 0; s < 12; s++) { px += (r() - 0.5) * 30; py += (r() - 0.5) * 30; ctx.lineTo(px, py); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, size, size); // juntas de losa
    return c;
  },
  asphalt(size, seed) {
    const c = canvas(size); const n = makeNoise(size, seed); const r = seeded(seed);
    pixelPass(c, (x, y) => {
      const v = fbm(n, x, y, 4); const g = r() * 30;
      const b = 38 + v * 40 + g;
      return [b, b, b * 1.02];
    });
    return c;
  },
  metal(size, seed) {
    const c = canvas(size); const n = makeNoise(size, seed);
    pixelPass(c, (x, y) => {
      const v = fbm(n, x, y, 4);
      const brushed = Math.sin(y * 0.9 + v * 6) * 4;
      const rust = n(x, y, 3) > 0.68 ? (n(x, y, 3) - 0.68) * 400 : 0;
      const b = 85 + v * 50 + brushed;
      return [b + rust * 0.9, b + rust * 0.35, b - rust * 0.1];
    });
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
    const step = size / 2;
    for (let i = 0; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke(); }
    ctx.fillStyle = 'rgba(30,30,30,0.8)';
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (const [ox, oy] of [[8, 8], [step - 8, 8], [8, step - 8], [step - 8, step - 8]]) {
      ctx.beginPath(); ctx.arc(i * step + ox, j * step + oy, 3, 0, 7); ctx.fill();
    }
    return c;
  },
  rust(size, seed) {
    const c = canvas(size); const n = makeNoise(size, seed);
    pixelPass(c, (x, y) => {
      const v = fbm(n, x, y, 5);
      const r = 90 + v * 90, g = 45 + v * 40, b = 25 + v * 20;
      return [r, g, b];
    });
    return c;
  },
  brick(size, seed) {
    const c = canvas(size); const n = makeNoise(size, seed); const r = seeded(seed);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3a3532'; ctx.fillRect(0, 0, size, size);
    const bh = size / 8, bw = size / 4;
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < 5; col++) {
        const t = r();
        ctx.fillStyle = `rgb(${95 + t * 40},${48 + t * 20},${38 + t * 15})`;
        ctx.fillRect(col * bw + off + 2, row * bh + 2, bw - 4, bh - 4);
      }
    }
    pixelPass(c, (x, y, R, G, B) => { const v = (fbm(n, x, y, 3) - 0.5) * 50; return [R + v, G + v, B + v]; });
    return c;
  },
  tiles(size, seed) {
    const c = canvas(size); const n = makeNoise(size, seed); const r = seeded(seed);
    const ctx = c.getContext('2d');
    const t = size / 4;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const k = 150 + r() * 30;
      ctx.fillStyle = `rgb(${k * 0.85},${k * 0.92},${k * 0.95})`;
      ctx.fillRect(i * t, j * t, t, t);
    }
    ctx.strokeStyle = '#4a4f50'; ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * t, 0); ctx.lineTo(i * t, size); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * t); ctx.lineTo(size, i * t); ctx.stroke(); }
    pixelPass(c, (x, y, R, G, B) => {
      const v = fbm(n, x, y, 4); const dirt = v > 0.55 ? (v - 0.55) * 260 : 0;
      return [R - dirt, G - dirt * 1.05, B - dirt * 1.1];
    });
    return c;
  },
  crate(size, seed) {
    const c = canvas(size); const n = makeNoise(size, seed);
    pixelPass(c, (x, y) => {
      const v = fbm(n, x * 0.3, y * 4, 4);
      const b = 70 + v * 60;
      return [b * 1.1, b * 0.8, b * 0.5];
    });
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(30,18,8,0.9)'; ctx.lineWidth = size * 0.06;
    ctx.strokeRect(size * 0.03, size * 0.03, size * 0.94, size * 0.94);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size, size); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(30,18,8,0.5)';
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, i * size / 6); ctx.lineTo(size, i * size / 6); ctx.stroke(); }
    return c;
  },
  hazard(size) {
    const c = canvas(size); const ctx = c.getContext('2d');
    ctx.fillStyle = '#d6a419'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#151515';
    for (let i = -size; i < size * 2; i += size / 4) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size / 8, 0); ctx.lineTo(i + size / 8 - size, size); ctx.lineTo(i - size, size); ctx.fill();
    }
    const n = makeNoise(size, 3);
    pixelPass(c, (x, y, R, G, B) => { const v = fbm(n, x, y, 4); const d = v > 0.5 ? (v - 0.5) * 200 : 0; return [R - d, G - d, B - d * 0.5]; });
    return c;
  },
  grate(size, seed) {
    const c = canvas(size); const ctx = c.getContext('2d');
    ctx.fillStyle = '#1b1c1d'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#5c5f62'; ctx.lineWidth = size / 24;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * size / 8, 0); ctx.lineTo(i * size / 8, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * size / 8); ctx.lineTo(size, i * size / 8); ctx.stroke();
    }
    const n = makeNoise(size, seed);
    pixelPass(c, (x, y, R, G, B) => { const v = fbm(n, x, y, 3); return [R + v * 40, G + v * 25, B + v * 15]; });
    return c;
  },
  dirt(size, seed) {
    const c = canvas(size); const n = makeNoise(size, seed); const r = seeded(seed);
    pixelPass(c, (x, y) => {
      const v = fbm(n, x, y, 5); const g = r() * 18;
      return [55 + v * 50 + g, 45 + v * 40 + g, 32 + v * 25 + g];
    });
    return c;
  },
  panel(size, seed) { // paneles de laboratorio
    const c = canvas(size); const n = makeNoise(size, seed);
    pixelPass(c, (x, y) => { const v = fbm(n, x, y, 4); const b = 120 + v * 40; return [b * 0.82, b * 0.9, b * 0.92]; });
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(20,30,35,0.7)'; ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, size - 8, size / 2 - 6); ctx.strokeRect(4, size / 2 + 2, size - 8, size / 2 - 6);
    ctx.fillStyle = 'rgba(30,140,160,0.5)'; ctx.fillRect(size * 0.1, size * 0.47, size * 0.8, size * 0.03);
    return c;
  },
  blood(size, seed) { // salpicadura para calcomanías (con alfa)
    const c = canvas(size); const ctx = c.getContext('2d'); const r = seeded(seed);
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = r() * size * 0.32, rad = size * (0.03 + r() * 0.12) * (1 - d / size);
      ctx.fillStyle = `rgba(${90 + r() * 50},${r() * 8},${r() * 6},${0.75 + r() * 0.25})`;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rad, 0, 7); ctx.fill();
    }
    for (let i = 0; i < 14; i++) { // gotas alargadas
      const a = r() * Math.PI * 2, d = size * (0.25 + r() * 0.2);
      ctx.fillStyle = 'rgba(110,4,4,0.85)';
      ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, size * 0.012, size * 0.04, a + Math.PI / 2, 0, 7); ctx.fill();
    }
    return c;
  },
  acid(size, seed) {
    const c = canvas(size); const ctx = c.getContext('2d'); const r = seeded(seed);
    for (let i = 0; i < 20; i++) {
      const a = r() * Math.PI * 2, d = r() * size * 0.3, rad = size * (0.05 + r() * 0.12);
      ctx.fillStyle = `rgba(${90 + r() * 40},${200 + r() * 55},${30},${0.5 + r() * 0.4})`;
      ctx.beginPath(); ctx.arc(size / 2 + Math.cos(a) * d, size / 2 + Math.sin(a) * d, rad, 0, 7); ctx.fill();
    }
    return c;
  },
  scorch(size, seed) {
    const c = canvas(size); const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.5, 'rgba(10,8,6,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    return c;
  },
  bullethole(size) {
    const c = canvas(size); const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.25, 'rgba(15,12,10,0.95)'); g.addColorStop(0.45, 'rgba(60,55,50,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    return c;
  },
  flesh(size, seed) { // piel de engendro
    const c = canvas(size); const n = makeNoise(size, seed);
    pixelPass(c, (x, y) => {
      const v = fbm(n, x, y, 5); const veins = Math.abs(Math.sin((x + n(x, y, 2) * 80) * 0.08)) < 0.06 ? -40 : 0;
      const b = 140 + v * 80;
      return [b + veins * 0.3, b * 0.82 + veins, b * 0.75 + veins];
    });
    return c;
  },
  sky(size) {
    const c = canvas(size); const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#05070b'); g.addColorStop(0.55, '#141a22'); g.addColorStop(0.75, '#3a2a22'); g.addColorStop(1, '#120d0b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    const r = seeded(77);
    void r;
    return c;
  },
};

export function getTexture(name, repeat = 1, seed = 1, size = 256) {
  const key = `${name}|${seed}|${size}`;
  let base = cache.get(key);
  if (!base) {
    const c = generators[name](size, seed);
    base = toTex(c, 1);
    cache.set(key, base);
  }
  if (repeat === 1) return base;
  const t = base.clone();
  t.repeat.set(repeat, repeat);
  t.needsUpdate = true;
  return t;
}

export function getRawCanvas(name, seed = 1, size = 128) {
  return generators[name](size, seed);
}
