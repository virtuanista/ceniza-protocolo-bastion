// Utilidades para construir mapas a partir de cajas (paredes con huecos, escaleras, coberturas).

const WALL_T = 0.5;

export function B(list, x0, y0, z0, x1, y1, z1, mat, extra = {}) {
  list.push({ min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], mat, ...extra });
}

// Pared alineada a eje con huecos. axis 'x': pared que recorre X en z=fixed.
export function wall(list, axis, fixed, from, to, h, mat, gaps = [], opts = {}) {
  const t = opts.t ?? WALL_T;
  const sorted = gaps.map(([c, w, gh]) => [c - w / 2, c + w / 2, gh]).sort((a, b) => a[0] - b[0]);
  let cur = from;
  const seg = (a, b, y0, y1) => {
    if (b - a < 0.01) return;
    if (axis === 'x') B(list, a, y0, fixed - t / 2, b, y1, fixed + t / 2, mat, opts.extra);
    else B(list, fixed - t / 2, y0, a, fixed + t / 2, y1, b, mat, opts.extra);
  };
  for (const [a, b, gh] of sorted) {
    seg(cur, a, 0, h);
    if (gh && gh < h) seg(a, b, gh, h); // dintel sobre la puerta
    cur = b;
  }
  seg(cur, to, 0, h);
}

export function stairs(list, x0, z0, dirX, dirZ, width, steps, stepH, stepD, mat) {
  // Escalera de bloques; cada peldaño es un bloque sólido apilado
  for (let i = 0; i < steps; i++) {
    const h = (i + 1) * stepH;
    const ax = x0 + dirX * i * stepD, az = z0 + dirZ * i * stepD;
    if (dirX !== 0) B(list, ax, 0, z0 - width / 2, ax + dirX * stepD, h, z0 + width / 2, mat);
    else B(list, x0 - width / 2, 0, az, x0 + width / 2, h, az + dirZ * stepD, mat);
  }
}

export function container(list, x, z, rotX, color, stacked = false) {
  const L = 6, W = 2.4, H = 2.6;
  const [hx, hz] = rotX ? [L / 2, W / 2] : [W / 2, L / 2];
  B(list, x - hx, 0, z - hz, x + hx, H, z + hz, 'container', { tint: color });
  if (stacked) B(list, x - hx, H, z - hz, x + hx, H * 2, z + hz, 'container', { tint: stacked === true ? color : stacked });
}

export function crateStack(list, x, z, n = 1, s = 1.1) {
  B(list, x - s / 2, 0, z - s / 2, x + s / 2, s, z + s / 2, 'crate');
  if (n > 1) B(list, x - s / 2 + 0.05, s, z - s / 2 + 0.05, x + s / 2 - 0.05, s * 2 - 0.1, z + s / 2 - 0.05, 'crate');
}

export function sandbags(list, x0, z0, x1, z1) {
  B(list, x0, 0, z0, x1, 1.05, z1, 'sandbag');
}

