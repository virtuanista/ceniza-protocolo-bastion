// Síntesis offline de efectos de sonido (muestras generadas matemáticamente, 100% originales).
import { seeded } from '../core/utils.js';

export const SR = 44100;

class OnePole { constructor(fc) { this.set(fc); this.y = 0; } set(fc) { this.a = 1 - Math.exp(-2 * Math.PI * fc / SR); } lp(x) { this.y += this.a * (x - this.y); return this.y; } hp(x) { return x - this.lp(x); } }

class Biquad { // RBJ: 'bp' | 'lp' | 'hp' | 'peak'
  constructor(type, f, q = 1, gain = 0) { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(type, f, q, gain); }
  set(type, f, q, gain = 0) {
    const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else { const A = Math.pow(10, gain / 40); b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  p(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}

function make(ctx, dur, fn, stereo = false, peakTarget = 0.92) {
  const n = Math.max(1, Math.floor(dur * SR));
  const buf = ctx.createBuffer(stereo ? 2 : 1, n, SR);
  const L = buf.getChannelData(0);
  const R = stereo ? buf.getChannelData(1) : null;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const v = fn(i / SR, i);
    if (stereo) { L[i] = v[0]; R[i] = v[1]; peak = Math.max(peak, Math.abs(v[0]), Math.abs(v[1])); }
    else { L[i] = v; peak = Math.max(peak, Math.abs(v)); }
  }
  // normalizar y fundido final
  const norm = peak > 0 ? peakTarget / peak : 1;
  const fade = Math.min(n, Math.floor(SR * 0.01));
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] *= norm;
    for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;
  }
  return buf;
}

const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

// ---------------------------------------------------------------- disparos
export function gunshot(ctx, p, seed = 1) {
  const r = seeded(seed);
  const crackF = new OnePole(p.crackLP ?? 6000), crackH = new OnePole(900);
  const bodyF = new Biquad('lp', p.bodyF ?? 1500, 0.8), tailF = new OnePole(p.tailF ?? 700);
  const low = p.low ?? 70, drive = p.drive ?? 2.2, dur = p.dur ?? 0.7;
  let ph = 0;
  return make(ctx, dur, (t) => {
    const n = r() * 2 - 1;
    const crack = crackH.hp(crackF.lp(n)) * env(t, 0.0005, p.crackD ?? 0.012) * (p.crack ?? 1);
    const body = bodyF.p(n) * env(t, 0.001, p.bodyD ?? 0.07) * (p.body ?? 1) * 1.6;
    const f = low * (1 + 2.5 * Math.exp(-t / 0.02));
    ph += 2 * Math.PI * f / SR;
    const thump = Math.sin(ph) * env(t, 0.002, p.lowD ?? 0.09) * (p.lowAmt ?? 1.2);
    const tail = tailF.lp(n) * env(t, 0.02, p.tailD ?? 0.25) * (p.tail ?? 0.5) * 2;
    const mech = t < 0.004 ? (r() * 2 - 1) * 0.3 : 0;
    return Math.tanh((crack + body + thump + tail + mech) * drive);
  });
}

// Disparo de energía (eléctrico / plasma / dardo médico)
export function zap(ctx, p, seed = 3) {
  const r = seeded(seed); const bp = new Biquad('bp', p.f ?? 2400, 2);
  let ph = 0, ph2 = 0;
  const dur = p.dur ?? 0.4;
  return make(ctx, dur, (t) => {
    const n = r() * 2 - 1;
    const f = (p.f0 ?? 1800) * Math.exp(-t * (p.sweep ?? 8)) + (p.f1 ?? 200);
    ph += 2 * Math.PI * f / SR; ph2 += 2 * Math.PI * f * 1.51 / SR;
    const buzz = Math.sign(Math.sin(ph)) * 0.4 + Math.sin(ph2) * 0.4;
    const crackle = bp.p(n) * (r() < 0.08 ? 3 : 0.6);
    return Math.tanh((buzz * (p.tone ?? 1) + crackle * (p.noise ?? 1)) * env(t, 0.002, dur * 0.3) * 1.8);
  });
}

export function explosion(ctx, p = {}, seed = 5) {
  const r = seeded(seed);
  const lp = new Biquad('lp', p.f ?? 900, 0.7), lp2 = new OnePole(180), crk = new OnePole(3000);
  let ph = 0;
  const dur = p.dur ?? 2.2;
  return make(ctx, dur, (t) => {
    const n = r() * 2 - 1;
    ph += 2 * Math.PI * (38 + 60 * Math.exp(-t * 6)) / SR;
    const boom = Math.sin(ph) * env(t, 0.004, 0.35) * 1.6;
    const rumble = lp2.lp(n) * env(t, 0.01, 0.8) * 5;
    const blast = lp.p(n) * env(t, 0.001, 0.18) * 2.5;
    const debris = crk.lp(n) * (r() < 0.02 * Math.exp(-t * 2) ? 6 : 0) * Math.exp(-t * 1.5);
    return Math.tanh((boom + rumble + blast + debris) * 1.6);
  });
}

// Mecánicas de recarga: tipos de chasquido
export function mech(ctx, kind, seed = 7) {
  const r = seeded(seed);
  const specs = {
    magOut: [{ t: 0, f: 1800, d: 0.02, a: 1 }, { t: 0.03, f: 900, d: 0.04, a: 0.6 }],
    magIn: [{ t: 0, f: 1200, d: 0.015, a: 0.8 }, { t: 0.05, f: 2600, d: 0.02, a: 1 }],
    bolt: [{ t: 0, f: 2200, d: 0.02, a: 1 }, { t: 0.09, f: 1600, d: 0.03, a: 1 }],
    pump: [{ t: 0, f: 700, d: 0.05, a: 1 }, { t: 0.14, f: 900, d: 0.04, a: 1 }],
    shell: [{ t: 0, f: 1400, d: 0.03, a: 0.9 }, { t: 0.03, f: 600, d: 0.03, a: 0.5 }],
    open: [{ t: 0, f: 800, d: 0.06, a: 1 }],
    close: [{ t: 0, f: 1100, d: 0.03, a: 1 }, { t: 0.02, f: 500, d: 0.06, a: 0.7 }],
    spin: Array.from({ length: 8 }, (_, i) => ({ t: i * 0.03, f: 3000, d: 0.008, a: 0.5 })),
    click: [{ t: 0, f: 3000, d: 0.008, a: 0.7 }],
    dry: [{ t: 0, f: 2400, d: 0.01, a: 0.8 }],
    cell: [{ t: 0, f: 500, d: 0.05, a: 0.8 }, { t: 0.06, f: 3200, d: 0.15, a: 0.6, tone: true }],
    canister: [{ t: 0, f: 400, d: 0.08, a: 1 }, { t: 0.1, f: 300, d: 0.2, a: 0.5 }],
  }[kind] || [{ t: 0, f: 2000, d: 0.02, a: 1 }];
  const end = Math.max(...specs.map((s) => s.t + s.d * 6)) + 0.02;
  const filters = specs.map((s) => new Biquad('bp', s.f, 3));
  return make(ctx, end, (t) => {
    const n = r() * 2 - 1;
    let v = 0;
    specs.forEach((s, k) => {
      if (t >= s.t) {
        const e = Math.exp(-(t - s.t) / s.d);
        v += (s.tone ? Math.sin(2 * Math.PI * s.f * (t - s.t)) * 0.3 : filters[k].p(n) * 3) * e * s.a;
      }
    });
    return Math.tanh(v * 1.5);
  });
}

// ---------------------------------------------------------------- voces de criaturas
export function creatureVoice(ctx, p, seed = 11) {
  const r = seeded(seed);
  const dur = p.dur ?? 0.8;
  const f1 = new Biquad('bp', p.form?.[0] ?? 500, 4), f2 = new Biquad('bp', p.form?.[1] ?? 1200, 5), f3 = new Biquad('bp', p.form?.[2] ?? 2600, 6);
  const nz = new Biquad('bp', p.noiseF ?? 1800, 1.2);
  let ph = 0, amph = 0;
  const contour = p.contour || [1, 1.2, 0.8];
  const jitterSeed = r() * 10;
  return make(ctx, dur, (t) => {
    const u = t / dur;
    const ci = Math.min(contour.length - 1.001, u * (contour.length - 1));
    const c0 = Math.floor(ci);
    const cm = contour[c0] + (contour[c0 + 1] - contour[c0]) * (ci - c0);
    const vib = 1 + Math.sin(t * (p.vib ?? 30) + jitterSeed) * (p.vibAmt ?? 0.04);
    const f = (p.pitch ?? 120) * cm * vib * (1 + (r() - 0.5) * (p.jitter ?? 0.1));
    ph += 2 * Math.PI * f / SR;
    amph += 2 * Math.PI * (p.am ?? 45) / SR;
    const saw = ((ph / (2 * Math.PI)) % 1) * 2 - 1;
    const am = 1 - (p.rough ?? 0.5) * (0.5 + 0.5 * Math.sin(amph));
    const src = saw * am;
    const voice = f1.p(src) * 1.2 + f2.p(src) * 0.8 + f3.p(src) * 0.4;
    const breath = nz.p(r() * 2 - 1) * (p.breath ?? 0.4);
    const e = Math.min(1, t / (p.att ?? 0.04)) * Math.min(1, (dur - t) / (dur * 0.35));
    return Math.tanh((voice * 2 + breath) * e * (p.drive ?? 2));
  });
}

export function roar(ctx, seed = 13, dur = 2.2, pitch = 55) {
  const r = seeded(seed);
  const a = creatureVoice(ctx, { dur, pitch, contour: [0.8, 1.3, 1.5, 1.2, 0.7], form: [300, 800, 2000], rough: 0.8, am: 30, breath: 0.9, noiseF: 900, drive: 3, jitter: 0.25 }, seed);
  void r;
  return a;
}

// ---------------------------------------------------------------- pasos y movimiento
// Un paso real no es un impulso: talón (golpe sordo, ataque de unos ms) y, ~50-90 ms después,
// el apoyo de la puntera y el roce de la suela. Nada de saturación ni graves explosivos,
// que es lo que hacía que sonaran a disparo.
const STEP_SURF = {
  concrete: { heelF: 900, heelQ: 0.7, toeF: 2400, grit: 0.35, gritF: 4200, thump: 0.25, modes: null, heelD: 0.018, toeD: 0.03, scuff: 0.25 },
  tile: { heelF: 1500, heelQ: 1.2, toeF: 3200, grit: 0.1, gritF: 5000, thump: 0.15, modes: [[1850, 0.012, 0.15], [3100, 0.008, 0.1]], heelD: 0.012, toeD: 0.02, scuff: 0.15 },
  dirt: { heelF: 450, heelQ: 0.6, toeF: 1400, grit: 0.8, gritF: 2800, thump: 0.3, modes: null, heelD: 0.03, toeD: 0.05, scuff: 0.6 },
  metal: { heelF: 1100, heelQ: 1, toeF: 2600, grit: 0.15, gritF: 5500, thump: 0.2, modes: [[420, 0.09, 0.5], [970, 0.06, 0.35], [1730, 0.045, 0.25], [2650, 0.03, 0.15]], heelD: 0.015, toeD: 0.025, scuff: 0.2 },
  wood: { heelF: 650, heelQ: 1, toeF: 1800, grit: 0.1, gritF: 3500, thump: 0.45, modes: [[210, 0.05, 0.4], [480, 0.03, 0.25]], heelD: 0.02, toeD: 0.03, scuff: 0.2 },
};
export function footstep(ctx, surf = 'concrete', seed = 101, heavy = 1) {
  const s = STEP_SURF[surf] || STEP_SURF.concrete;
  const r = seeded(seed);
  const heelBp = new Biquad('bp', s.heelF * (0.9 + r() * 0.2), s.heelQ), heelLp = new OnePole(2500);
  const toeBp = new Biquad('bp', s.toeF * (0.9 + r() * 0.2), 0.9);
  const gritBp = new Biquad('bp', s.gritF, 1.5);
  const scuffBp = new Biquad('bp', 1200 + r() * 800, 0.6);
  const toeT = 0.05 + r() * 0.04;
  const dur = 0.26 + (s.modes ? 0.12 : 0);
  let ph = 0;
  const softEnv = (t, a, d) => (t < 0 ? 0 : t < a ? Math.sin((t / a) * Math.PI / 2) : Math.exp(-(t - a) / d));
  return make(ctx, dur, (t) => {
    const n = r() * 2 - 1;
    const heelE = softEnv(t, 0.003, s.heelD * heavy);
    const toeE = softEnv(t - toeT, 0.004, s.toeD) * 0.55;
    const heel = heelLp.lp(heelBp.p(n)) * heelE * 2.2;
    const toe = toeBp.p(n) * toeE * 1.4;
    // roce de suela: ruido suave que crece y cae entre talón y puntera
    const sc = t > 0.01 && t < toeT + 0.06 ? Math.sin(Math.PI * (t - 0.01) / (toeT + 0.05)) : 0;
    const scuff = scuffBp.p(n) * Math.max(0, sc) * s.scuff * 0.35;
    // gravilla: chasquidos dispersos y débiles
    const gr = r() < 0.012 * Math.exp(-t * 10) ? (r() * 2 - 1) * 3 : 0;
    const grit = gritBp.p(gr) * s.grit * 0.6;
    ph += 2 * Math.PI * (70 + 30 * Math.exp(-t * 60)) / SR;
    const thump = Math.sin(ph) * softEnv(t, 0.006, 0.03 * heavy) * s.thump * heavy;
    let res = 0;
    if (s.modes) for (const [f, d, a] of s.modes) { const lt = t - 0.002; if (lt > 0) res += Math.sin(2 * Math.PI * f * lt) * Math.exp(-lt / d) * a * 0.5; const lt2 = t - toeT; if (lt2 > 0) res += Math.sin(2 * Math.PI * f * 1.01 * lt2) * Math.exp(-lt2 / d) * a * 0.25; }
    return heel + toe + scuff + grit + thump + res;
  }, false, 0.6);
}

// Ropa y equipo al moverse (salto): roce de tela + tintineo leve de correas
export function rustle(ctx, dur = 0.28, seed = 113, jingle = 0.3) {
  const r = seeded(seed);
  const bp = new Biquad('bp', 1800, 0.7), hp = new OnePole(600);
  const modes = [[3400, 0.03], [4700, 0.02], [6100, 0.015]];
  const tj = 0.04 + r() * 0.05;
  return make(ctx, dur, (t) => {
    const u = t / dur;
    const n = r() * 2 - 1;
    // tela: ruido filtrado con envolvente irregular
    const flutter = 0.6 + 0.4 * Math.sin(t * 90 + r() * 0.5);
    const cloth = hp.hp(bp.p(n)) * Math.sin(Math.PI * Math.min(1, u * 1.3)) * flutter * 1.6;
    let j = 0;
    for (const [f, d] of modes) { const lt = t - tj; if (lt > 0) j += Math.sin(2 * Math.PI * f * lt) * Math.exp(-lt / d); }
    return cloth + j * jingle * 0.25;
  }, false, 0.5);
}

// Sierra mecánica (Desgarrador): motor de dos tiempos + chirrido de cadena, en bucle
export function sawLoop(ctx, seed = 117) {
  const r = seeded(seed);
  const bp = new Biquad('bp', 2600, 2), lp = new OnePole(3000);
  const dur = 1.2;
  let ph = 0;
  return make(ctx, dur, (t) => {
    const f = 92 + Math.sin(t * 2 * Math.PI * 2.5) * 4;
    ph += 2 * Math.PI * f / SR;
    const saw = ((ph / (2 * Math.PI)) % 1) * 2 - 1;
    const pulse = Math.pow(0.5 + 0.5 * Math.sin(ph), 6);
    const chain = bp.p(r() * 2 - 1) * (0.6 + 0.4 * Math.sin(ph * 7));
    const v = lp.lp(saw * 0.5 + pulse * 0.8) + chain * 0.5;
    const edge = Math.min(1, t / 0.02, (dur - t) / 0.02);
    return Math.tanh(v * 1.4) * edge;
  });
}

// Salida de cohete: soplido que se aleja con siseo
export function rocketLaunch(ctx, seed = 119) {
  const r = seeded(seed);
  const lp = new Biquad('lp', 2000, 0.7), hs = new Biquad('bp', 5000, 1);
  let ph = 0;
  return make(ctx, 1.4, (t) => {
    const n = r() * 2 - 1;
    lp.set('lp', 2400 * Math.exp(-t * 1.5) + 300, 0.7);
    ph += 2 * Math.PI * (60 + 40 * Math.exp(-t * 20)) / SR;
    const pop = Math.sin(ph) * env(t, 0.002, 0.06);
    const roar = lp.p(n) * env(t, 0.01, 0.45) * 2;
    const hiss = hs.p(n) * env(t, 0.02, 0.25) * 0.6;
    return Math.tanh((pop + roar + hiss) * 1.5);
  });
}

// ---------------------------------------------------------------- miscelánea
export function noiseHit(ctx, p, seed = 17) {
  const r = seeded(seed); const bp = new Biquad(p.type ?? 'bp', p.f ?? 800, p.q ?? 1);
  let ph = 0;
  const dur = p.dur ?? 0.15;
  return make(ctx, dur, (t) => {
    const n = r() * 2 - 1;
    ph += 2 * Math.PI * ((p.tone ?? 0) * (1 + Math.exp(-t * 30))) / SR;
    const v = bp.p(n) * 2 * env(t, p.att ?? 0.001, p.d ?? 0.03) + (p.tone ? Math.sin(ph) * env(t, 0.001, p.toneD ?? 0.05) * (p.toneAmt ?? 1) : 0);
    return Math.tanh(v * (p.drive ?? 1.5));
  });
}

export function whoosh(ctx, dur = 0.25, f = 900, seed = 19) {
  const r = seeded(seed); const bp = new Biquad('bp', f, 1.5);
  return make(ctx, dur, (t) => {
    const u = t / dur;
    bp.set('bp', f * (0.6 + u * 1.2), 1.5);
    return bp.p(r() * 2 - 1) * Math.sin(Math.PI * u) * 3;
  });
}

export function tone(ctx, notes, dur, wave = 'sine', seed = 23) {
  // notes: [[startSec, freq, len, amp]]
  const r = seeded(seed);
  return make(ctx, dur, (t) => {
    let v = 0;
    for (const [s, f, l, a] of notes) {
      if (t < s || t > s + l + 0.3) continue;
      const lt = t - s;
      const e = Math.min(1, lt / 0.005) * Math.exp(-lt / (l * 0.6));
      const ph = 2 * Math.PI * f * lt;
      let w = Math.sin(ph);
      if (wave === 'square') w = Math.sign(w) * 0.6;
      else if (wave === 'saw') w = ((f * lt) % 1) * 2 - 1;
      else if (wave === 'bell') w = Math.sin(ph) * 0.6 + Math.sin(ph * 2.76) * 0.3 * Math.exp(-lt * 4) + Math.sin(ph * 5.4) * 0.15 * Math.exp(-lt * 8);
      v += w * e * a;
    }
    return v + (r() - 0.5) * 0.002;
  });
}

export function loopNoise(ctx, p, seed = 29) { // bucles: lanzallamas, soldador, haz
  const r = seeded(seed);
  const bp = new Biquad(p.type ?? 'bp', p.f ?? 1000, p.q ?? 0.8);
  const lp = new OnePole(p.lp ?? 4000);
  let ph = 0;
  const dur = p.dur ?? 1;
  return make(ctx, dur, (t) => {
    const n = r() * 2 - 1;
    ph += 2 * Math.PI * (p.hum ?? 0) / SR;
    const crack = r() < (p.crackle ?? 0) ? (r() * 2 - 1) * 4 : 0;
    const v = lp.lp(bp.p(n) * 2 + crack) + Math.sin(ph) * (p.humAmt ?? 0) + Math.sin(ph * 2.01) * (p.humAmt ?? 0) * 0.5;
    // cruce suave para bucle
    const edge = Math.min(1, t / 0.02, (dur - t) / 0.02);
    return Math.tanh(v * (p.drive ?? 1.2)) * edge;
  });
}

export function impulseResponse(ctx, dur = 2.4, decay = 2.8) {
  const r = seeded(31);
  const lpL = new OnePole(8000), lpR = new OnePole(8000);
  return make(ctx, dur, (t) => {
    const e = Math.pow(1 - t / dur, decay);
    const fc = 7000 * Math.exp(-t * 2) + 400;
    lpL.set(fc); lpR.set(fc);
    return [lpL.lp(r() * 2 - 1) * e, lpR.lp(r() * 2 - 1) * e];
  }, true);
}

export function heartbeat(ctx) {
  let ph = 0;
  return make(ctx, 0.9, (t) => {
    const beat = (s) => (t >= s ? Math.exp(-(t - s) / 0.06) : 0);
    ph += 2 * Math.PI * 50 / SR;
    return Math.sin(ph) * (beat(0) + 0.7 * beat(0.22));
  });
}

export function drum(ctx, kind, seed = 37) {
  const r = seeded(seed);
  if (kind === 'kick') { let ph = 0; return make(ctx, 0.45, (t) => { ph += 2 * Math.PI * (45 + 120 * Math.exp(-t * 30)) / SR; return Math.tanh(Math.sin(ph) * env(t, 0.001, 0.14) * 2.5); }); }
  if (kind === 'snare') { const bp = new Biquad('bp', 1800, 0.7); let ph = 0; return make(ctx, 0.3, (t) => { ph += 2 * Math.PI * 190 / SR; return Math.tanh((bp.p(r() * 2 - 1) * 2.2 * env(t, 0.001, 0.07) + Math.sin(ph) * env(t, 0.001, 0.04)) * 1.5); }); }
  if (kind === 'hat') { const hp = new Biquad('hp', 7000, 0.7); return make(ctx, 0.08, (t) => hp.p(r() * 2 - 1) * env(t, 0.0005, 0.018) * 2); }
  if (kind === 'metal') { const bp = new Biquad('bp', 3200, 8); const bp2 = new Biquad('bp', 5100, 9); return make(ctx, 0.6, (t) => { const n = r() * 2 - 1; return (bp.p(n) + bp2.p(n)) * 6 * env(t, 0.001, 0.12); }); }
  if (kind === 'tom') { let ph = 0; return make(ctx, 0.5, (t) => { ph += 2 * Math.PI * (90 + 60 * Math.exp(-t * 15)) / SR; return Math.tanh(Math.sin(ph) * env(t, 0.001, 0.2) * 2); }); }
  return make(ctx, 0.1, () => 0);
}
