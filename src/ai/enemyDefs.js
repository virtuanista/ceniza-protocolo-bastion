// Bestiario del Brote: engendros de la Semilla Ceniza. Cada tipo define estadísticas,
// resistencias, comportamiento, silueta (modelo procedural) y voz sintetizada.

export const ENEMIES = {
  putrido: {
    id: 'putrido', name: 'Pútrido', threat: 'Básico', hp: 90, headFrac: 0.5, speed: 2.4, runSpeed: 3.6, radius: 0.38, height: 1.8,
    dmg: 7, attackRange: 1.5, attackTime: 0.9, credits: 10, xp: 8,
    resist: { ballistic: 1, fire: 1.2, explosive: 1, electric: 1, melee: 1 },
    grab: true,
    model: { build: 'humanoid', skin: 0x8a8f7a, cloth: 0x3a3428, scale: 1, hunch: 0.25, eye: 0xffb030, armL: 1, armR: 1, jaw: true },
    voice: { pitch: 115, form: [550, 1100, 2400], rough: 0.6, am: 40, breath: 0.6, drive: 2 },
    desc: 'Restos humanos animados por la Semilla. Lentos pero numerosos; intentan agarrarte.',
  },
  putrido_alfa: {
    id: 'putrido_alfa', name: 'Pútrido Alfa', threat: 'Élite menor', hp: 170, headFrac: 0.5, speed: 2.6, runSpeed: 4.3, radius: 0.42, height: 1.9,
    dmg: 11, attackRange: 1.6, attackTime: 0.85, credits: 18, xp: 14, headArmor: 90,
    resist: { ballistic: 0.9, fire: 1, explosive: 1, electric: 1, melee: 1 }, rally: true,
    model: { build: 'humanoid', skin: 0x7a7a6a, cloth: 0x4a2a20, scale: 1.08, hunch: 0.15, eye: 0xff4020, armL: 1.1, armR: 1.1, helmet: 0x505458, jaw: true },
    voice: { pitch: 95, form: [500, 1000, 2200], rough: 0.7, am: 35, breath: 0.6, drive: 2.4 },
    desc: 'Pútrido con placas óseas en el cráneo. Su rugido acelera a los que le rodean. Rompe su casco primero.',
  },
  rastrero: {
    id: 'rastrero', name: 'Rastrero', threat: 'Rápido', hp: 65, headFrac: 0.45, speed: 5.4, runSpeed: 6.6, radius: 0.35, height: 1.0,
    dmg: 6, attackRange: 1.4, attackTime: 0.55, credits: 12, xp: 9, leap: { min: 3, max: 7, dmg: 9, cd: 3.5 },
    resist: { ballistic: 1, fire: 1.2, explosive: 1.1, electric: 1, melee: 1 },
    model: { build: 'crawler', skin: 0xa07a6a, cloth: 0x2a2020, scale: 1, eye: 0x80ff40 },
    voice: { pitch: 260, form: [900, 2200, 3600], rough: 0.5, am: 60, breath: 0.5, drive: 2.2, jitter: 0.2 },
    desc: 'Corre a cuatro patas y salta a distancia. Ataca en manadas por los flancos.',
  },
  acechador: {
    id: 'acechador', name: 'Acechador', threat: 'Sigiloso', hp: 120, headFrac: 0.45, speed: 4.6, runSpeed: 5.6, radius: 0.36, height: 1.75,
    dmg: 9, attackRange: 1.6, attackTime: 0.45, credits: 16, xp: 12, cloak: true, flanker: true,
    resist: { ballistic: 1, fire: 1.3, explosive: 1, electric: 1.4, melee: 1 },
    model: { build: 'humanoid', skin: 0x5a6a7a, cloth: 0x101418, scale: 0.95, hunch: 0.35, eye: 0xc040ff, blades: true, slim: true },
    voice: { pitch: 340, form: [1200, 2600, 4000], rough: 0.3, am: 80, breath: 0.9, noiseF: 5000, drive: 1.8 },
    desc: 'Casi invisible hasta que está encima. Su siseo delata su posición. Siempre busca tu espalda.',
  },
  vesicula: {
    id: 'vesicula', name: 'Vesícula', threat: 'Explosivo', hp: 260, headFrac: 0.35, speed: 1.8, runSpeed: 2.2, radius: 0.6, height: 1.9,
    dmg: 6, attackRange: 1.6, attackTime: 1.2, credits: 24, xp: 18, vomit: { range: 4.5, dmg: 4, cd: 4 }, burst: { radius: 4.5, dmg: 30 },
    resist: { ballistic: 1, fire: 1.4, explosive: 1.2, electric: 1, melee: 1 },
    model: { build: 'bloated', skin: 0x9aaa6a, cloth: 0x3a3a20, scale: 1.1, eye: 0xd0ff40 },
    voice: { pitch: 75, form: [300, 700, 1600], rough: 0.8, am: 18, breath: 1, noiseF: 600, drive: 2.5 },
    desc: 'Saco de ácido andante. Vomita bilis corrosiva y revienta al morir. Decapítala para evitar la explosión.',
  },
  escupidor: {
    id: 'escupidor', name: 'Escupidor', threat: 'A distancia', hp: 160, headFrac: 0.4, speed: 3.0, runSpeed: 4.0, radius: 0.4, height: 1.85,
    dmg: 6, attackRange: 1.5, attackTime: 0.9, credits: 20, xp: 16, ranged: { min: 7, max: 22, cd: 2.6, dmg: 14, speed: 20 },
    resist: { ballistic: 1, fire: 1, explosive: 1, electric: 1.2, melee: 1 },
    model: { build: 'humanoid', skin: 0x6a8a5a, cloth: 0x2a3a2a, scale: 1, hunch: 0.2, eye: 0x60ff60, sac: true, jaw: true },
    voice: { pitch: 180, form: [700, 1500, 3000], rough: 0.5, am: 50, breath: 0.8, drive: 2 },
    desc: 'Lanza glóbulos de ácido en parábola desde lejos y busca cobertura. Oblígale a acercarse o rodéalo.',
  },
  aullador: {
    id: 'aullador', name: 'Aullador', threat: 'Élite', hp: 240, headFrac: 0.4, speed: 2.7, runSpeed: 3.2, radius: 0.4, height: 1.8,
    dmg: 8, attackRange: 1.5, attackTime: 0.9, credits: 30, xp: 26, scream: { range: 10, dmg: 9, cd: 6, windup: 0.7 },
    resist: { ballistic: 1, fire: 1, explosive: 0.9, electric: 1, melee: 1 },
    model: { build: 'humanoid', skin: 0xb0a0a0, cloth: 0x2a1018, scale: 0.95, hunch: 0.1, eye: 0xff2060, bigMouth: true, slim: true },
    voice: { pitch: 400, form: [1200, 2800, 4200], rough: 0.7, am: 70, breath: 0.7, noiseF: 4000, drive: 3 },
    desc: 'Su alarido destroza soldaduras, detona granadas en el aire y aturde. Prioridad absoluta: a la cabeza.',
  },
  desgarrador: {
    id: 'desgarrador', name: 'Desgarrador', threat: 'Semi-tanque', hp: 950, headFrac: 0.35, speed: 2.6, runSpeed: 6.2, radius: 0.55, height: 2.15,
    dmg: 26, attackRange: 2.0, attackTime: 0.75, credits: 75, xp: 70, rage: { hpFrac: 0.5 }, big: true, stunnable: true,
    resist: { ballistic: 0.95, fire: 0.9, explosive: 0.75, electric: 1, melee: 1 },
    model: { build: 'brute', skin: 0x9a7060, cloth: 0x404040, scale: 1.12, eye: 0xff3010, saw: true, apron: 0x6a6050 },
    voice: { pitch: 85, form: [450, 1000, 2100], rough: 0.85, am: 22, breath: 0.8, drive: 3 },
    desc: 'Brazos convertidos en sierras. Al perder la mitad de su vida entra en furia y corre. Atúrdelo con disparos a la cabeza.',
  },
  coloso: {
    id: 'coloso', name: 'Coloso', threat: 'Tanque', hp: 1700, headFrac: 0.3, speed: 2.3, runSpeed: 7.4, radius: 0.75, height: 2.5,
    dmg: 40, attackRange: 2.3, attackTime: 0.9, credits: 150, xp: 140, rage: { dmgWindow: 2, dmgThreshold: 450, hpFrac: 0.6 }, big: true,
    resist: { ballistic: 0.9, fire: 0.45, explosive: 1.1, electric: 0.75, melee: 0.9 },
    model: { build: 'tank', skin: 0x8a6a6a, cloth: 0x3a2a2a, scale: 1.25, eye: 0xffd020, core: 0xffa020 },
    voice: { pitch: 60, form: [300, 750, 1700], rough: 0.95, am: 18, breath: 1, drive: 3.4 },
    desc: 'Montaña de músculo con un núcleo incandescente. Si recibe demasiado daño de golpe, carga en furia. Concentra el fuego en la cabeza o huye.',
  },
};

export const BOSS = {
  id: 'primogenito', name: 'El Primogénito', threat: 'Jefe', hp: 9000, headFrac: 0, speed: 2.5, runSpeed: 9, radius: 1.2, height: 3.8,
  dmg: 45, attackRange: 3.2, attackTime: 1.1, credits: 1000, xp: 1200, big: true, boss: true,
  resist: { ballistic: 1, fire: 0.6, explosive: 0.9, electric: 0.7, melee: 1 },
  model: { build: 'boss', skin: 0x7a5a5a, cloth: 0x1a1414, scale: 1.6, eye: 0xff5010, core: 0xff3010 },
  voice: { pitch: 50, form: [260, 650, 1500], rough: 0.95, am: 15, breath: 1, drive: 3.6 },
  desc: 'El primer huésped de la Semilla Ceniza. Su corazón expuesto es la única forma de abatirlo.',
};
ENEMIES.primogenito = BOSS;

// Cantidad y composición de oleadas
export const LENGTHS = {
  short: { name: 'Corta', waves: 4, desc: '4 oleadas + jefe' },
  medium: { name: 'Media', waves: 7, desc: '7 oleadas + jefe' },
  long: { name: 'Larga', waves: 10, desc: '10 oleadas + jefe' },
  endless: { name: 'Interminable', waves: Infinity, desc: 'Oleadas infinitas, jefe cada 5 oleadas' },
};

export const DIFFICULTIES = {
  normal: { name: 'Normal', hp: 1, dmg: 0.8, speed: 1, count: 1, maxAlive: 22, credits: 1, xp: 1, startCash: 400, spawnRate: 1, rageMult: 1 },
  hard: { name: 'Difícil', hp: 1.3, dmg: 1.15, speed: 1.06, count: 1.25, maxAlive: 26, credits: 1, xp: 1.4, startCash: 350, spawnRate: 1.2, rageMult: 0.9 },
  suicidal: { name: 'Suicida', hp: 1.6, dmg: 1.5, speed: 1.12, count: 1.45, maxAlive: 30, credits: 0.95, xp: 1.8, startCash: 300, spawnRate: 1.4, rageMult: 0.8 },
  hell: { name: 'Infierno', hp: 2.0, dmg: 1.9, speed: 1.2, count: 1.65, maxAlive: 34, credits: 0.9, xp: 2.4, startCash: 250, spawnRate: 1.6, rageMult: 0.7 },
};

// Pesos de aparición por progreso de partida (0..1)
export function waveComposition(progress, waveIdx) {
  const p = progress;
  const t = [
    ['putrido', 50 - p * 25],
    ['rastrero', 18 + p * 6],
    ['acechador', waveIdx >= 1 ? 8 + p * 8 : 0],
    ['putrido_alfa', waveIdx >= 1 ? 6 + p * 8 : 0],
    ['vesicula', waveIdx >= 1 ? 5 + p * 5 : 2],
    ['escupidor', waveIdx >= 1 ? 5 + p * 7 : 0],
    ['aullador', p > 0.25 ? 3 + p * 6 : 0],
    ['desgarrador', p > 0.3 ? 1 + p * 3 : 0],
    ['coloso', p > 0.55 ? 0.5 + p * 2 : 0],
  ];
  return t.filter((e) => e[1] > 0);
}
