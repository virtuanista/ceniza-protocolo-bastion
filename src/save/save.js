// Guardado persistente (localStorage): perfil, experiencia por clase, talentos, estadísticas,
// récords, desafíos, desbloqueos de cosméticos y ajustes. Con versión y migración.
import { PERK_LIST, xpForLevel, MAX_LEVEL } from '../game/perks.js';
import { DEFAULT_BINDS } from '../core/input.js';

const KEY = 'ceniza_protocolo_save_v1';

export const COSMETICS = {
  outfits: [
    { id: 'brigada', name: 'Brigada', sleeve: 0x2a3326, glove: 0x1a1a1a, body: 0x3a4a32, unlocked: true },
    { id: 'ceniza', name: 'Ceniza', sleeve: 0x4a4a4c, glove: 0x222222, body: 0x5a5a5e },
    { id: 'desierto', name: 'Desierto', sleeve: 0x8a7a5a, glove: 0x4a3a2a, body: 0x9a8a62 },
    { id: 'artico', name: 'Ártico', sleeve: 0xc8ccd0, glove: 0x6a7078, body: 0xd8dce0 },
    { id: 'sangre', name: 'Sangre', sleeve: 0x6a1a1a, glove: 0x1a0a0a, body: 0x7a2020 },
    { id: 'neon', name: 'Neón', sleeve: 0x1a1a2a, glove: 0x20e0ff, body: 0x2a2a40 },
    { id: 'oro', name: 'Élite Dorada', sleeve: 0x3a3020, glove: 0xc8a030, body: 0xb89030 },
  ],
  finishes: [
    { id: 'estandar', name: 'Estándar', color: null, unlocked: true },
    { id: 'pavonado', name: 'Pavonado', color: 0x1a2030 },
    { id: 'camuflaje', name: 'Camuflaje', color: 0x4a5a32 },
    { id: 'hueso', name: 'Hueso', color: 0xc8c0a8 },
    { id: 'oro', name: 'Oro', color: 0xc8a030 },
  ],
};

export const CHALLENGES = [
  { id: 'kills100', name: 'Primera sangre', desc: 'Mata 100 engendros.', stat: 'kills', goal: 100, reward: { outfit: 'ceniza' } },
  { id: 'kills1000', name: 'Carnicero', desc: 'Mata 1.000 engendros.', stat: 'kills', goal: 1000, reward: { outfit: 'sangre' } },
  { id: 'heads250', name: 'Ojo de halcón', desc: 'Consigue 250 disparos a la cabeza mortales.', stat: 'headshots', goal: 250, reward: { finish: 'pavonado' } },
  { id: 'heal1500', name: 'Cirujano de campaña', desc: 'Cura 1.500 PV en total.', stat: 'healed', goal: 1500, reward: { outfit: 'artico' } },
  { id: 'weld20k', name: 'Herrero', desc: 'Suelda 20.000 puntos de puerta.', stat: 'welded', goal: 20000, reward: { outfit: 'desierto' } },
  { id: 'win1', name: 'Superviviente', desc: 'Completa una partida derrotando al jefe.', stat: 'wins', goal: 1, reward: { finish: 'camuflaje' } },
  { id: 'winhard', name: 'Veterano', desc: 'Gana una partida en Difícil o superior.', stat: 'winsHard', goal: 1, reward: { outfit: 'neon' } },
  { id: 'boss3', name: 'Regicida', desc: 'Derrota al Primogénito 3 veces.', stat: 'bossKills', goal: 3, reward: { finish: 'oro' } },
  { id: 'big50', name: 'Matagigantes', desc: 'Mata 50 Desgarradores o Colosos.', stat: 'bigKills', goal: 50, reward: { finish: 'hueso' } },
  { id: 'lvl10', name: 'Especialista', desc: 'Alcanza el nivel 10 en cualquier clase.', stat: 'maxPerkLevel', goal: 10, reward: { outfit: 'oro' } },
  { id: 'endless15', name: 'Imparable', desc: 'Alcanza la oleada 15 en Interminable.', stat: 'bestEndless', goal: 15, reward: { xp: 5000 } },
  { id: 'obj10', name: 'Cumplidor', desc: 'Completa 10 objetivos opcionales.', stat: 'objectives', goal: 10, reward: { xp: 3000 } },
  { id: 'clean', name: 'Sin un rasguño', desc: 'Termina una oleada (3+) sin recibir daño.', stat: 'cleanWaves', goal: 1, reward: { xp: 2000 } },
  { id: 'zed50', name: 'Señor del tiempo', desc: 'Activa el Tiempo Muerto 50 veces.', stat: 'zedTimes', goal: 50, reward: { xp: 2500 } },
];

function defaultSave() {
  const perks = {};
  for (const p of PERK_LIST) perks[p.id] = { xp: 0, level: 0, talents: {} };
  return {
    version: 1,
    profile: { name: 'Limpiador-' + Math.floor(Math.random() * 900 + 100) },
    perks,
    selected: { perk: 'assault', outfit: 'brigada', finish: 'estandar', map: 'estacion', difficulty: 'normal', length: 'short' },
    stats: { kills: 0, headshots: 0, deaths: 0, games: 0, wins: 0, winsHard: 0, damage: 0, healed: 0, welded: 0, creditsEarned: 0, objectives: 0, bossKills: 0, bigKills: 0, playtime: 0, zedTimes: 0, cleanWaves: 0, wavesSurvived: 0, maxPerkLevel: 0, bestEndless: 0, killsByType: {} },
    records: {},
    unlocks: { outfits: ['brigada'], finishes: ['estandar'] },
    challenges: {},
    settings: {
      sensitivity: 1, invertY: false, fov: 85, quality: 'medium', master: 0.8, sfx: 0.9, music: 0.5, showFps: false,
      binds: { ...DEFAULT_BINDS }, crosshair: true, renderScale: 1,
    },
  };
}

class SaveSystem {
  constructor() { this.data = this.load(); }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultSave();
      const d = JSON.parse(raw);
      const def = defaultSave();
      // fusión defensiva por si se añaden campos nuevos
      const merged = { ...def, ...d, stats: { ...def.stats, ...d.stats }, settings: { ...def.settings, ...d.settings, binds: { ...def.settings.binds, ...(d.settings?.binds || {}) } }, selected: { ...def.selected, ...d.selected }, unlocks: { ...def.unlocks, ...d.unlocks } };
      for (const p of PERK_LIST) if (!merged.perks[p.id]) merged.perks[p.id] = { xp: 0, level: 0, talents: {} };
      return merged;
    } catch (e) {
      console.warn('Guardado corrupto, se reinicia', e);
      return defaultSave();
    }
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { console.warn('No se pudo guardar', e); }
  }
  reset() { this.data = defaultSave(); this.save(); }

  perk(id) { return this.data.perks[id]; }

  // Añade XP a una clase. Devuelve niveles ganados
  addXp(perkId, amount) {
    const p = this.data.perks[perkId];
    if (!p || p.level >= MAX_LEVEL) return 0;
    p.xp += amount;
    let gained = 0;
    while (p.level < MAX_LEVEL && p.xp >= xpForLevel(p.level)) {
      p.xp -= xpForLevel(p.level);
      p.level++;
      gained++;
    }
    if (p.level >= MAX_LEVEL) p.xp = 0;
    this.data.stats.maxPerkLevel = Math.max(this.data.stats.maxPerkLevel, p.level);
    return gained;
  }

  addStat(k, v = 1) { this.data.stats[k] = (this.data.stats[k] || 0) + v; }
  setStatMax(k, v) { this.data.stats[k] = Math.max(this.data.stats[k] || 0, v); }

  // Comprueba desafíos y devuelve los recién completados
  checkChallenges() {
    const done = [];
    for (const c of CHALLENGES) {
      if (this.data.challenges[c.id]) continue;
      if ((this.data.stats[c.stat] || 0) >= c.goal) {
        this.data.challenges[c.id] = Date.now();
        const r = c.reward;
        if (r.outfit && !this.data.unlocks.outfits.includes(r.outfit)) this.data.unlocks.outfits.push(r.outfit);
        if (r.finish && !this.data.unlocks.finishes.includes(r.finish)) this.data.unlocks.finishes.push(r.finish);
        if (r.xp) this.addXp(this.data.selected.perk, r.xp);
        done.push(c);
      }
    }
    return done;
  }

  record(key, value, better = (a, b) => a > b) {
    const cur = this.data.records[key];
    if (cur === undefined || better(value, cur)) { this.data.records[key] = value; return true; }
    return false;
  }
}

export const saveSys = new SaveSystem();
