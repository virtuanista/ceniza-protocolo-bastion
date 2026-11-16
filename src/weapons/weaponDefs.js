// Arsenal completo de la Brigada Bastión. Cada arma define balística, cargador, recarga,
// retroceso, modelo procedural, sonido sintetizado y su precio/peso para el comerciante.

const W = [];
const def = (o) => { W.push(o); return o; };

// ---------------------------------------------------------------- utilidades / iniciales
def({
  id: 'machete', name: 'Machete de Brigada', perk: null, tier: 0, cat: 'melee', price: 0, weight: 0, unsellable: true,
  fire: { mode: 'melee', dmg: 75, heavyDmg: 160, rpm: 110, range: 2.4, arc: 0.9, dmgType: 'melee', stumble: 1.5 },
  mag: 0, maxAmmo: 0, model: { arch: 'machete' }, slot: 0,
});
def({
  id: 'p9', name: 'P9 «Ladrido»', perk: null, tier: 0, cat: 'pistol', price: 0, weight: 0, unsellable: true,
  fire: { mode: 'hitscan', dmg: 28, rpm: 480, spread: 0.018, adsSpread: 0.004, range: 80, headMult: 1.8, penetration: 0, dmgType: 'ballistic', stumble: 0.3 },
  mag: 15, maxAmmo: 135, ammoPrice: 10, reload: { time: 1.35, kind: 'mag' }, ads: { fov: 60 },
  recoil: { up: 1.1, side: 0.4, kick: 0.06 }, model: { arch: 'pistol', color: 0x2a2a2c, accent: 0x6a6a6a },
  sound: { low: 90, crackLP: 7000, bodyF: 2000, bodyD: 0.05, tail: 0.35, tailD: 0.2, dur: 0.5 }, slot: 1,
});
def({
  id: 'syringe', name: 'Jeringa de Campaña', perk: null, tier: 0, cat: 'tool', price: 0, weight: 0, unsellable: true,
  fire: { mode: 'heal', heal: 22, selfHeal: 22, recharge: 15, range: 3 }, mag: 0, maxAmmo: 0, model: { arch: 'syringe' }, slot: 4,
});
def({
  id: 'welder', name: 'Soldador de Arco', perk: null, tier: 0, cat: 'tool', price: 0, weight: 0, unsellable: true,
  fire: { mode: 'weld', rate: 160, range: 2.6 }, mag: 0, maxAmmo: 0, model: { arch: 'welder' }, slot: 4,
});

// ---------------------------------------------------------------- ASALTO
def({
  id: 'avispa', name: 'SMG «Avispa»', perk: 'assault', tier: 1, cat: 'smg', price: 200, weight: 4,
  fire: { mode: 'hitscan', dmg: 22, rpm: 860, auto: true, spread: 0.03, adsSpread: 0.012, range: 60, headMult: 1.6, dmgType: 'ballistic', stumble: 0.15 },
  mag: 32, maxAmmo: 320, ammoPrice: 18, reload: { time: 1.9, kind: 'mag' }, ads: { fov: 62 },
  recoil: { up: 0.55, side: 0.45, kick: 0.035 }, model: { arch: 'smg', color: 0x2d3230, accent: 0xb08a30 },
  sound: { low: 100, crackLP: 6500, bodyF: 2400, bodyD: 0.04, crackD: 0.008, tail: 0.3, tailD: 0.15, dur: 0.35 }, slot: 2,
});
def({
  id: 'ar7', name: 'AR-7 «Tormenta»', perk: 'assault', tier: 2, cat: 'rifle', price: 650, weight: 6,
  fire: { mode: 'hitscan', dmg: 38, rpm: 640, auto: true, spread: 0.028, adsSpread: 0.004, range: 120, headMult: 1.7, penetration: 1, dmgType: 'ballistic', stumble: 0.3 },
  mag: 30, maxAmmo: 300, ammoPrice: 26, reload: { time: 2.3, kind: 'mag' }, ads: { fov: 50, sight: 'red' },
  recoil: { up: 0.85, side: 0.38, kick: 0.045 }, model: { arch: 'rifle', color: 0x343a2e, accent: 0x1a1a1a },
  sound: { low: 75, crackLP: 6000, bodyF: 1800, bodyD: 0.06, tail: 0.55, tailD: 0.3, dur: 0.7 }, slot: 2,
});
def({
  id: 'rompehielos', name: 'VK-12 «Rompehielos»', perk: 'assault', tier: 3, cat: 'rifle', price: 1100, weight: 7,
  fire: { mode: 'hitscan', dmg: 52, rpm: 600, auto: true, spread: 0.026, adsSpread: 0.0035, range: 130, headMult: 1.75, penetration: 2, dmgType: 'ballistic', stumble: 0.45 },
  mag: 30, maxAmmo: 270, ammoPrice: 34, reload: { time: 2.4, kind: 'mag' }, ads: { fov: 42, sight: 'holo' },
  recoil: { up: 1.05, side: 0.42, kick: 0.05 }, model: { arch: 'bullpup', color: 0x4a4a42, accent: 0x7a5a2a },
  sound: { low: 62, crackLP: 5500, bodyF: 1500, bodyD: 0.07, tail: 0.65, tailD: 0.34, dur: 0.8, drive: 2.6 }, slot: 2,
});
def({
  id: 'centinela', name: 'Centinela HX', perk: 'assault', tier: 4, cat: 'rifle', price: 1500, weight: 8,
  fire: { mode: 'hitscan', dmg: 64, rpm: 720, auto: true, spread: 0.024, adsSpread: 0.003, range: 140, headMult: 1.8, penetration: 2, dmgType: 'ballistic', stumble: 0.55 },
  mag: 40, maxAmmo: 320, ammoPrice: 45, reload: { time: 2.6, kind: 'mag' }, ads: { fov: 36, sight: 'scope2' },
  recoil: { up: 1.1, side: 0.5, kick: 0.055 }, model: { arch: 'rifle', color: 0x222428, accent: 0x40c0ff, glow: 0x40c0ff, long: true },
  sound: { low: 58, crackLP: 5000, bodyF: 1400, bodyD: 0.08, tail: 0.7, tailD: 0.38, dur: 0.85, drive: 2.8 }, slot: 2,
});

// ---------------------------------------------------------------- FRANCOTIRADOR
def({
  id: 'juez', name: 'Revólver «Juez» .44', perk: 'sniper', tier: 1, cat: 'pistol', price: 200, weight: 2,
  fire: { mode: 'hitscan', dmg: 95, rpm: 190, spread: 0.012, adsSpread: 0.002, range: 120, headMult: 2.4, penetration: 1, dmgType: 'ballistic', stumble: 1.2 },
  mag: 6, maxAmmo: 72, ammoPrice: 14, reload: { time: 2.2, kind: 'cylinder' }, ads: { fov: 55 },
  recoil: { up: 4.5, side: 0.8, kick: 0.16 }, model: { arch: 'revolver', color: 0x8a8a90, accent: 0x5a3a20 },
  sound: { low: 60, crackLP: 5000, bodyF: 1300, bodyD: 0.09, tail: 0.8, tailD: 0.45, dur: 1.1, drive: 3 }, slot: 2,
});
def({
  id: 'halcon', name: 'DMR «Halcón»', perk: 'sniper', tier: 2, cat: 'sniper', price: 700, weight: 6,
  fire: { mode: 'hitscan', dmg: 135, rpm: 260, spread: 0.02, adsSpread: 0.0008, range: 200, headMult: 2.6, penetration: 2, dmgType: 'ballistic', stumble: 1.4 },
  mag: 12, maxAmmo: 96, ammoPrice: 32, reload: { time: 2.5, kind: 'mag' }, ads: { fov: 28, sight: 'scope4' },
  recoil: { up: 3.2, side: 0.6, kick: 0.12 }, model: { arch: 'dmr', color: 0x3a3a34, accent: 0x6a5a3a },
  sound: { low: 52, crackLP: 4800, bodyF: 1200, bodyD: 0.1, tail: 0.9, tailD: 0.55, dur: 1.3, drive: 3 }, slot: 2,
});
def({
  id: 'lanza50', name: 'Cerrojo «Lanza» .50', perk: 'sniper', tier: 3, cat: 'sniper', price: 1100, weight: 8,
  fire: { mode: 'hitscan', dmg: 420, rpm: 52, spread: 0.04, adsSpread: 0.0003, range: 260, headMult: 3, penetration: 5, dmgType: 'ballistic', stumble: 4, bolt: true },
  mag: 5, maxAmmo: 40, ammoPrice: 40, reload: { time: 3.1, kind: 'mag' }, ads: { fov: 16, sight: 'scope8' },
  recoil: { up: 8, side: 1.2, kick: 0.25 }, model: { arch: 'sniper', color: 0x2c3328, accent: 0x111111 },
  sound: { low: 42, crackLP: 4200, bodyF: 1000, bodyD: 0.14, tail: 1.2, tailD: 0.8, dur: 1.8, drive: 3.4, lowAmt: 1.8 }, slot: 2,
});
def({
  id: 'aguja', name: 'Riel «Aguja»', perk: 'sniper', tier: 4, cat: 'sniper', price: 1600, weight: 9,
  fire: { mode: 'hitscan', dmg: 700, rpm: 45, spread: 0.05, adsSpread: 0, range: 300, headMult: 3, penetration: 10, dmgType: 'electric', stumble: 6, rail: true, tracer: [0.4, 0.8, 1] },
  mag: 4, maxAmmo: 32, ammoPrice: 60, reload: { time: 2.8, kind: 'cell' }, ads: { fov: 14, sight: 'scope8' },
  recoil: { up: 7, side: 0.6, kick: 0.22 }, model: { arch: 'railgun', color: 0x202630, accent: 0x50a0ff, glow: 0x60b0ff },
  sound: { type: 'zap', f0: 4500, f1: 120, sweep: 5, dur: 1.2, tone: 1.2, noise: 1 }, slot: 2,
});

// ---------------------------------------------------------------- DEMOLICIÓN
def({
  id: 'petardo', name: 'Lanzador «Petardo»', perk: 'demo', tier: 1, cat: 'explosive', price: 250, weight: 3,
  fire: { mode: 'projectile', rpm: 100, spread: 0.01, dmgType: 'explosive', projectile: { kind: 'shrapnel', speed: 55, gravity: 4, radius: 3.2, dmg: 120, impactDmg: 30 } },
  mag: 1, maxAmmo: 32, ammoPrice: 20, reload: { time: 1.1, kind: 'shell' }, ads: { fov: 62 },
  recoil: { up: 3, side: 0.5, kick: 0.14 }, model: { arch: 'launcherPistol', color: 0x4a5a2a, accent: 0xcc8820 },
  sound: { low: 55, crackLP: 2500, bodyF: 900, bodyD: 0.08, tail: 0.3, crack: 0.4, dur: 0.6 }, slot: 2,
});
def({
  id: 'mortero', name: 'Lanzagranadas M-40 «Mortero»', perk: 'demo', tier: 2, cat: 'explosive', price: 700, weight: 6,
  fire: { mode: 'projectile', rpm: 90, spread: 0.008, dmgType: 'explosive', projectile: { kind: 'grenade', speed: 32, gravity: 12, radius: 5.5, dmg: 340, impactDmg: 80, armDist: 4 } },
  mag: 1, maxAmmo: 26, ammoPrice: 30, reload: { time: 1.4, kind: 'break' }, ads: { fov: 60 },
  recoil: { up: 5, side: 0.8, kick: 0.18 }, model: { arch: 'launcher', color: 0x3a4a2a, accent: 0x222222 },
  sound: { low: 48, crackLP: 1800, bodyF: 700, bodyD: 0.1, tail: 0.3, crack: 0.3, dur: 0.6 }, slot: 2,
});
def({
  id: 'fenix', name: 'Lanzacohetes «Fénix»', perk: 'demo', tier: 3, cat: 'explosive', price: 1150, weight: 9,
  fire: { mode: 'projectile', rpm: 50, spread: 0.004, dmgType: 'explosive', projectile: { kind: 'rocket', speed: 40, gravity: 0, radius: 6.5, dmg: 700, impactDmg: 200, armDist: 5 } },
  mag: 1, maxAmmo: 14, ammoPrice: 55, reload: { time: 2.8, kind: 'canister' }, ads: { fov: 50 },
  recoil: { up: 6, side: 1, kick: 0.22 }, model: { arch: 'rocket', color: 0x4a4a3a, accent: 0x9a2a1a },
  sound: { low: 40, crackLP: 1400, bodyF: 600, bodyD: 0.2, tail: 0.9, tailD: 0.5, crack: 0.2, dur: 1.2, drive: 2.5 }, slot: 2,
});
def({
  id: 'sembradora', name: 'Sembradora de Cargas', perk: 'demo', tier: 4, cat: 'explosive', price: 1500, weight: 7,
  fire: { mode: 'projectile', rpm: 180, spread: 0.01, dmgType: 'explosive', altDetonate: true, projectile: { kind: 'sticky', speed: 26, gravity: 9, radius: 5, dmg: 420, impactDmg: 10, maxActive: 8 } },
  mag: 8, maxAmmo: 48, ammoPrice: 60, reload: { time: 2.6, kind: 'mag' }, ads: { fov: 60 },
  recoil: { up: 1.8, side: 0.5, kick: 0.1 }, model: { arch: 'launcher', color: 0x2a3440, accent: 0xff3030, glow: 0xff3030, drum: true },
  sound: { low: 70, crackLP: 2200, bodyF: 1000, bodyD: 0.06, crack: 0.3, tail: 0.2, dur: 0.45 }, slot: 2,
});

// ---------------------------------------------------------------- APOYO
def({
  id: 'bulldog', name: 'Escopeta R-12 «Bulldog»', perk: 'support', tier: 1, cat: 'shotgun', price: 200, weight: 5,
  fire: { mode: 'pellets', dmg: 26, pellets: 8, rpm: 75, spread: 0.07, adsSpread: 0.055, range: 40, headMult: 1.5, penetration: 1, dmgType: 'ballistic', stumble: 0.6, pump: true },
  mag: 6, maxAmmo: 48, ammoPrice: 20, reload: { time: 0.55, kind: 'shell' }, ads: { fov: 66 },
  recoil: { up: 5, side: 1.2, kick: 0.2 }, model: { arch: 'pump', color: 0x2a2620, accent: 0x6a4a28 },
  sound: { low: 50, crackLP: 4000, bodyF: 1100, bodyD: 0.12, tail: 0.75, tailD: 0.4, dur: 1, drive: 3, lowAmt: 1.6 }, slot: 2,
});
def({
  id: 'bocacha', name: 'Recortada «Bocacha»', perk: 'support', tier: 2, cat: 'shotgun', price: 600, weight: 5,
  fire: { mode: 'pellets', dmg: 34, pellets: 12, rpm: 400, spread: 0.12, adsSpread: 0.1, range: 25, headMult: 1.4, penetration: 2, dmgType: 'ballistic', stumble: 2, knockback: 6, doubleFire: true },
  mag: 2, maxAmmo: 44, ammoPrice: 22, reload: { time: 2.0, kind: 'break' }, ads: { fov: 70 },
  recoil: { up: 10, side: 2, kick: 0.3 }, model: { arch: 'double', color: 0x3a2a1a, accent: 0x5a5a5a },
  sound: { low: 40, crackLP: 3500, bodyF: 900, bodyD: 0.16, tail: 0.9, tailD: 0.45, dur: 1.2, drive: 3.6, lowAmt: 2 }, slot: 2,
});
def({
  id: 'matraca', name: 'AA-20 «Matraca»', perk: 'support', tier: 3, cat: 'shotgun', price: 1100, weight: 8,
  fire: { mode: 'pellets', dmg: 28, pellets: 7, rpm: 300, auto: true, spread: 0.08, adsSpread: 0.06, range: 35, headMult: 1.4, penetration: 2, dmgType: 'ballistic', stumble: 0.8 },
  mag: 20, maxAmmo: 140, ammoPrice: 45, reload: { time: 2.6, kind: 'mag' }, ads: { fov: 64 },
  recoil: { up: 3.2, side: 1.4, kick: 0.14 }, model: { arch: 'autoshotgun', color: 0x2a2e30, accent: 0xa07a30, drum: true },
  sound: { low: 52, crackLP: 4200, bodyF: 1200, bodyD: 0.1, tail: 0.6, tailD: 0.3, dur: 0.8, drive: 3 }, slot: 2,
});
def({
  id: 'martillo', name: 'Ametralladora «Martillo»', perk: 'support', tier: 4, cat: 'heavy', price: 1500, weight: 10,
  fire: { mode: 'hitscan', dmg: 48, rpm: 750, auto: true, spread: 0.04, adsSpread: 0.012, range: 120, headMult: 1.5, penetration: 3, dmgType: 'ballistic', stumble: 0.6, spinUp: 0.25 },
  mag: 100, maxAmmo: 400, ammoPrice: 70, reload: { time: 4.2, kind: 'mag' }, ads: { fov: 58 },
  recoil: { up: 0.9, side: 0.7, kick: 0.05 }, model: { arch: 'lmg', color: 0x2a2a26, accent: 0x5a4a30 },
  sound: { low: 55, crackLP: 5200, bodyF: 1500, bodyD: 0.08, tail: 0.6, tailD: 0.3, dur: 0.75, drive: 2.8 }, slot: 2,
});

// ---------------------------------------------------------------- MÉDICO
def({
  id: 'ampolla', name: 'Pistola Médica «Ampolla»', perk: 'medic', tier: 1, cat: 'medic', price: 200, weight: 2,
  fire: { mode: 'hitscan', dmg: 24, rpm: 450, spread: 0.015, adsSpread: 0.004, range: 70, headMult: 1.6, dmgType: 'ballistic', stumble: 0.2, dart: { heal: 20, cost: 50, poison: 25 } },
  mag: 15, maxAmmo: 150, ammoPrice: 12, reload: { time: 1.4, kind: 'mag' }, ads: { fov: 60 },
  recoil: { up: 0.9, side: 0.3, kick: 0.05 }, model: { arch: 'pistol', color: 0xd8dde0, accent: 0x20c060, glow: 0x30ff80 },
  sound: { low: 110, crackLP: 8000, bodyF: 2600, bodyD: 0.04, tail: 0.3, dur: 0.45 }, slot: 2,
});
def({
  id: 'vial', name: 'SMG Médica «Vial»', perk: 'medic', tier: 2, cat: 'medic', price: 650, weight: 4,
  fire: { mode: 'hitscan', dmg: 28, rpm: 800, auto: true, spread: 0.028, adsSpread: 0.01, range: 70, headMult: 1.6, dmgType: 'ballistic', stumble: 0.2, dart: { heal: 25, cost: 40, poison: 30 } },
  mag: 40, maxAmmo: 400, ammoPrice: 22, reload: { time: 2.0, kind: 'mag' }, ads: { fov: 60 },
  recoil: { up: 0.5, side: 0.4, kick: 0.03 }, model: { arch: 'smg', color: 0xd0d6da, accent: 0x20c060, glow: 0x30ff80 },
  sound: { low: 105, crackLP: 7000, bodyF: 2400, bodyD: 0.035, tail: 0.25, tailD: 0.12, dur: 0.35 }, slot: 2,
});
def({
  id: 'suero', name: 'Rifle Médico «Suero»', perk: 'medic', tier: 3, cat: 'medic', price: 1100, weight: 6,
  fire: { mode: 'hitscan', dmg: 50, rpm: 620, auto: true, spread: 0.024, adsSpread: 0.003, range: 120, headMult: 1.7, penetration: 1, dmgType: 'ballistic', stumble: 0.35, dart: { heal: 30, cost: 35, poison: 40 } },
  mag: 30, maxAmmo: 300, ammoPrice: 32, reload: { time: 2.3, kind: 'mag' }, ads: { fov: 44, sight: 'holo' },
  recoil: { up: 0.85, side: 0.35, kick: 0.045 }, model: { arch: 'rifle', color: 0xc8ced2, accent: 0x20c060, glow: 0x30ff80 },
  sound: { low: 75, crackLP: 6000, bodyF: 1800, bodyD: 0.06, tail: 0.5, tailD: 0.3, dur: 0.7 }, slot: 2,
});
def({
  id: 'antidoto', name: 'Escopeta Médica «Antídoto»', perk: 'medic', tier: 4, cat: 'medic', price: 1500, weight: 7,
  fire: { mode: 'pellets', dmg: 30, pellets: 9, rpm: 200, auto: false, spread: 0.07, adsSpread: 0.055, range: 35, headMult: 1.5, penetration: 1, dmgType: 'ballistic', stumble: 0.8, dart: { heal: 40, cost: 50, poison: 60 } },
  mag: 10, maxAmmo: 80, ammoPrice: 40, reload: { time: 2.4, kind: 'mag' }, ads: { fov: 62 },
  recoil: { up: 4, side: 1, kick: 0.16 }, model: { arch: 'autoshotgun', color: 0xd0d6da, accent: 0x20c060, glow: 0x30ff80 },
  sound: { low: 55, crackLP: 4500, bodyF: 1200, bodyD: 0.1, tail: 0.6, tailD: 0.3, dur: 0.8, drive: 2.8 }, slot: 2,
});

// ---------------------------------------------------------------- INCINERADOR
def({
  id: 'chispa', name: 'Bengalera «Chispa»', perk: 'fire', tier: 1, cat: 'fire', price: 200, weight: 2,
  fire: { mode: 'projectile', rpm: 240, spread: 0.01, dmgType: 'fire', projectile: { kind: 'flare', speed: 70, gravity: 2, radius: 0, dmg: 45, impactDmg: 45, burn: 30 } },
  mag: 6, maxAmmo: 72, ammoPrice: 14, reload: { time: 1.6, kind: 'break' }, ads: { fov: 60 },
  recoil: { up: 2, side: 0.4, kick: 0.1 }, model: { arch: 'flarePistol', color: 0xb03018, accent: 0x2a2a2a },
  sound: { low: 80, crackLP: 3000, bodyF: 1300, bodyD: 0.05, crack: 0.5, tail: 0.25, dur: 0.5 }, slot: 2,
});
def({
  id: 'aliento', name: 'Lanzallamas «Aliento»', perk: 'fire', tier: 2, cat: 'fire', price: 750, weight: 7,
  fire: { mode: 'flame', dmg: 11, rpm: 900, auto: true, range: 9, cone: 0.22, dmgType: 'fire', burn: 9, stumble: 0.05 },
  mag: 100, maxAmmo: 500, ammoPrice: 40, reload: { time: 3.0, kind: 'canister' }, ads: { fov: 70 },
  recoil: { up: 0.05, side: 0.05, kick: 0.01 }, model: { arch: 'flamer', color: 0x5a4a2a, accent: 0xb04010, glow: 0xff6020 }, slot: 2,
});
def({
  id: 'dragon', name: 'Escopeta «Aliento de Dragón»', perk: 'fire', tier: 3, cat: 'fire', price: 1100, weight: 6,
  fire: { mode: 'pellets', dmg: 24, pellets: 9, rpm: 85, spread: 0.075, adsSpread: 0.06, range: 30, headMult: 1.4, penetration: 1, dmgType: 'fire', burn: 14, stumble: 0.7, pump: true, tracer: [1, 0.5, 0.1] },
  mag: 8, maxAmmo: 56, ammoPrice: 30, reload: { time: 0.55, kind: 'shell' }, ads: { fov: 64 },
  recoil: { up: 5, side: 1.1, kick: 0.2 }, model: { arch: 'pump', color: 0x2a1a14, accent: 0xb04010, glow: 0xff6020 },
  sound: { low: 50, crackLP: 3500, bodyF: 1000, bodyD: 0.12, tail: 0.8, tailD: 0.4, dur: 1, drive: 3 }, slot: 2,
});
def({
  id: 'solar', name: 'Cañón de Plasma «Solar»', perk: 'fire', tier: 4, cat: 'fire', price: 1550, weight: 9,
  fire: { mode: 'flame', dmg: 22, rpm: 900, auto: true, range: 14, cone: 0.16, dmgType: 'fire', burn: 16, stumble: 0.12, plasma: true },
  mag: 120, maxAmmo: 480, ammoPrice: 60, reload: { time: 3.2, kind: 'canister' }, ads: { fov: 68 },
  recoil: { up: 0.05, side: 0.05, kick: 0.012 }, model: { arch: 'flamer', color: 0x2a2a34, accent: 0xff9020, glow: 0xffc040, big: true }, slot: 2,
});

// ---------------------------------------------------------------- ELECTRICISTA
def({
  id: 'arco', name: 'Pistola de Arco', perk: 'tesla', tier: 1, cat: 'electric', price: 200, weight: 2,
  fire: { mode: 'hitscan', dmg: 30, rpm: 360, spread: 0.014, adsSpread: 0.004, range: 45, headMult: 1.5, dmgType: 'electric', stumble: 0.35, chain: { count: 2, range: 5, mult: 0.6 }, tracer: [0.5, 0.8, 1] },
  mag: 12, maxAmmo: 120, ammoPrice: 14, reload: { time: 1.5, kind: 'cell' }, ads: { fov: 60 },
  recoil: { up: 1.2, side: 0.4, kick: 0.06 }, model: { arch: 'tesla', color: 0x2a3040, accent: 0x60b0ff, glow: 0x80c8ff, small: true },
  sound: { type: 'zap', f0: 2600, f1: 180, sweep: 10, dur: 0.3 }, slot: 2,
});
def({
  id: 'bobina', name: 'Rifle Tesla «Bobina»', perk: 'tesla', tier: 2, cat: 'electric', price: 700, weight: 6,
  fire: { mode: 'hitscan', dmg: 46, rpm: 420, auto: true, spread: 0.02, adsSpread: 0.004, range: 60, headMult: 1.5, dmgType: 'electric', stumble: 0.45, chain: { count: 3, range: 6, mult: 0.65 }, tracer: [0.5, 0.8, 1] },
  mag: 24, maxAmmo: 216, ammoPrice: 30, reload: { time: 2.2, kind: 'cell' }, ads: { fov: 50 },
  recoil: { up: 1.0, side: 0.4, kick: 0.05 }, model: { arch: 'tesla', color: 0x2a3040, accent: 0x60b0ff, glow: 0x80c8ff },
  sound: { type: 'zap', f0: 2200, f1: 150, sweep: 9, dur: 0.35 }, slot: 2,
});
def({
  id: 'tormenta', name: 'Cañón «Bola de Tormenta»', perk: 'tesla', tier: 3, cat: 'electric', price: 1100, weight: 8,
  fire: { mode: 'projectile', rpm: 75, spread: 0.004, dmgType: 'electric', projectile: { kind: 'orb', speed: 14, gravity: 0, radius: 4.5, dmg: 260, zapDmg: 30, zapRange: 5, zapRate: 0.15 } },
  mag: 4, maxAmmo: 36, ammoPrice: 45, reload: { time: 2.6, kind: 'cell' }, ads: { fov: 60 },
  recoil: { up: 3, side: 0.6, kick: 0.16 }, model: { arch: 'tesla', color: 0x202838, accent: 0x9080ff, glow: 0xa090ff, big: true },
  sound: { type: 'zap', f0: 900, f1: 80, sweep: 3, dur: 0.8, tone: 1.2 }, slot: 2,
});
def({
  id: 'lanzarco', name: 'Lanza de Arco Continuo', perk: 'tesla', tier: 4, cat: 'electric', price: 1500, weight: 8,
  fire: { mode: 'beam', dmg: 30, rpm: 600, auto: true, range: 22, dmgType: 'electric', stumble: 0.12, chain: { count: 3, range: 6, mult: 0.5 } },
  mag: 150, maxAmmo: 600, ammoPrice: 55, reload: { time: 2.8, kind: 'cell' }, ads: { fov: 62 },
  recoil: { up: 0.04, side: 0.06, kick: 0.01 }, model: { arch: 'tesla', color: 0x1a2030, accent: 0x40ffff, glow: 0x60ffff, long: true }, slot: 2,
});

export const WEAPONS = Object.fromEntries(W.map((w) => [w.id, w]));
export const WEAPON_LIST = W;

export const GRENADES = {
  frag: { name: 'Granada de fragmentación', dmg: 280, radius: 6, fuse: 2.2, kind: 'frag', color: 0x3a4a2a },
  medic: { name: 'Granada médica', dmg: 25, heal: 12, radius: 5, fuse: 1.4, kind: 'medic', color: 0x30c070, cloud: 6 },
  fire: { name: 'Granada incendiaria', dmg: 60, radius: 5, fuse: 1.6, kind: 'fire', color: 0xb03010, burn: 40, ground: 6 },
  emp: { name: 'Granada EMP', dmg: 80, radius: 7, fuse: 1.8, kind: 'emp', color: 0x3060c0, stun: 3 },
  cluster: { name: 'Granada de racimo', dmg: 260, radius: 6.5, fuse: 2, kind: 'cluster', color: 0x5a3a1a, bomblets: 4 },
  sticky: { name: 'Carga adhesiva', dmg: 320, radius: 5, fuse: 1.6, kind: 'frag', color: 0x8a6a1a, sticky: true },
  nail: { name: 'Granada de clavos', dmg: 200, radius: 7, fuse: 2, kind: 'frag', color: 0x5a5a5a, pierce: true },
};

// Coste de mejora por nivel (tier del arma afecta al coste)
export function upgradeCost(wdef, level) {
  const base = Math.max(150, wdef.price * 0.6);
  return Math.round(base * (1 + level * 0.6) / 10) * 10;
}
export const MAX_UPGRADE = 3;
export function upgradeMult(level) { return 1 + level * 0.15; }
export function upgradeWeight(level) { return level >= 2 ? 1 : 0; }
