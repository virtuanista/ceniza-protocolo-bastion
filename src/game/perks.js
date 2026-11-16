// Clases (perks) de la Brigada Bastión: pasivas por nivel, talentos elegibles y fuentes de XP.
// Los modificadores se combinan en un objeto plano consumido por armas, jugador y economía.

export const MAX_LEVEL = 25;
export const TALENT_LEVELS = [5, 10, 15, 20, 25];

export function xpForLevel(lvl) { // XP necesaria para pasar del nivel lvl al lvl+1
  return Math.round(600 * Math.pow(1.17, lvl));
}

export const PERKS = {
  assault: {
    id: 'assault', name: 'Asalto', color: '#e0a030', icon: '▲',
    role: 'Daño sostenido y control de amenazas medianas.',
    desc: 'Especialista en fusiles de asalto y subfusiles. Ve la salud de los enemigos, detecta Acechadores y prolonga el Tiempo Muerto.',
    weapons: ['avispa', 'ar7', 'rompehielos', 'centinela'], grenade: 'frag', start: 'avispa',
    xpSource: 'Daño con armas de Asalto',
    passive: (l) => ({ perkDmg: 1 + l * 0.01, reload: 1 + l * 0.012, recoil: 1 - l * 0.012, seeCloaked: 10 + l * 0.4, zedExtend: Math.floor(l / 5) * 0.5, showHp: true }),
    talents: [
      [{ id: 'as_tactical', name: 'Recarga táctica', desc: 'Recargas un 25% más rápido.', mods: { reload: 1.25 } }, { id: 'as_mags', name: 'Cargadores ampliados', desc: '+30% de capacidad de cargador.', mods: { magSize: 1.3 } }],
      [{ id: 'as_hollow', name: 'Punta hueca', desc: '+20% de daño a enemigos de tamaño medio y élites.', mods: { eliteDmg: 1.2 } }, { id: 'as_prey', name: 'Ojo de cazador', desc: '+25% de daño en la cabeza.', mods: { headDmg: 1.25 } }],
      [{ id: 'as_eat', name: 'Comer plomo', desc: 'Cada baja con arma de clase rellena 3 balas del cargador.', mods: { killRefill: 3 } }, { id: 'as_steady', name: 'Pulso firme', desc: '-35% de retroceso al apuntar.', mods: { adsRecoil: 0.65 } }],
      [{ id: 'as_bulwark', name: 'Baluarte', desc: '+25 de blindaje máximo y -15% de daño recibido.', mods: { maxArmor: 25, dmgTaken: 0.85 } }, { id: 'as_rush', name: 'Avance', desc: '+12% de velocidad de movimiento.', mods: { moveSpeed: 1.12 } }],
      [{ id: 'as_zedrage', name: 'Furia temporal', desc: 'Durante el Tiempo Muerto disparas a cadencia completa.', mods: { zedFire: 1 } }, { id: 'as_zedreload', name: 'Recarga relámpago', desc: 'Durante el Tiempo Muerto recargas instantáneamente.', mods: { zedReload: 1 } }],
    ],
  },
  sniper: {
    id: 'sniper', name: 'Francotirador', color: '#4fb0e0', icon: '◎',
    role: 'Elimina amenazas grandes con disparos de precisión.',
    desc: 'Domina revólveres y rifles de precisión. Bonificación enorme a la cabeza y control de los tanques.',
    weapons: ['juez', 'halcon', 'lanza50', 'aguja'], grenade: 'sticky', start: 'juez',
    xpSource: 'Disparos a la cabeza con armas de Francotirador',
    passive: (l) => ({ perkDmg: 1 + l * 0.01, headDmg: 1 + l * 0.02, recoil: 1 - l * 0.01, spread: 1 - l * 0.015, reload: 1 + l * 0.008 }),
    talents: [
      [{ id: 'sn_breath', name: 'Contener la respiración', desc: '-50% de dispersión al apuntar agachado.', mods: { crouchSpread: 0.5 } }, { id: 'sn_quick', name: 'Recámara ágil', desc: '+20% de cadencia con armas de clase.', mods: { fireRate: 1.2 } }],
      [{ id: 'sn_stun', name: 'Impacto contundente', desc: 'Los disparos a la cabeza aturden a casi cualquier enemigo.', mods: { headStun: 1 } }, { id: 'sn_rack', name: 'Ritmo', desc: 'Cada disparo a la cabeza consecutivo +10% de daño (máx. 5).', mods: { headStack: 0.1 } }],
      [{ id: 'sn_pen', name: 'Perforante', desc: '+2 de penetración de enemigos.', mods: { penetration: 2 } }, { id: 'sn_ammo', name: 'Reserva', desc: '+40% de munición máxima.', mods: { maxAmmo: 1.4 } }],
      [{ id: 'sn_tank', name: 'Matagigantes', desc: '+30% de daño a Colosos, Desgarradores y jefes.', mods: { bigDmg: 1.3 } }, { id: 'sn_cam', name: 'Camuflaje', desc: 'Los enemigos a más de 20 m te ignoran si estás agachado.', mods: { camo: 1 } }],
      [{ id: 'sn_zedhead', name: 'Ejecución', desc: 'Durante el Tiempo Muerto, +60% de daño a la cabeza.', mods: { zedHead: 1.6 } }, { id: 'sn_zedfast', name: 'Tirador frío', desc: 'Durante el Tiempo Muerto disparas y recargas a velocidad completa.', mods: { zedFire: 1, zedReload: 1 } }],
    ],
  },
  demo: {
    id: 'demo', name: 'Demolición', color: '#e05030', icon: '✸',
    role: 'Dispersa hordas y derriba élites con explosivos.',
    desc: 'Lanzadores y cargas. Más radio, granadas extra y resistencia a explosiones propias.',
    weapons: ['petardo', 'mortero', 'fenix', 'sembradora'], grenade: 'cluster', start: 'petardo',
    xpSource: 'Daño explosivo',
    passive: (l) => ({ perkDmg: 1 + l * 0.01, explRadius: 1 + l * 0.008, grenadeMax: Math.floor(l / 5), selfExplRes: 0.5 + l * 0.02, reload: 1 + l * 0.006 }),
    talents: [
      [{ id: 'de_shock', name: 'Onda de choque', desc: 'Las explosiones derriban a enemigos pequeños y medianos.', mods: { explKnock: 1 } }, { id: 'de_ammo', name: 'Polvorín', desc: '+3 de munición máxima por arma de clase.', mods: { flatAmmo: 3 } }],
      [{ id: 'de_door', name: 'Puertas trampa', desc: 'Las puertas que soldaste explotan al ser derribadas.', mods: { doorTrap: 1 } }, { id: 'de_impact', name: 'Impacto directo', desc: '+75% de daño de impacto directo.', mods: { impactDmg: 1.75 } }],
      [{ id: 'de_radius', name: 'Carga ampliada', desc: '+25% de radio de explosión.', mods: { explRadius: 1.25 } }, { id: 'de_concuss', name: 'Concusión', desc: 'Las explosiones aturden 1,5 s.', mods: { explStun: 1.5 } }],
      [{ id: 'de_vest', name: 'Chaleco antiexplosivos', desc: 'Inmune a tus propias explosiones y +20 de blindaje.', mods: { selfExplRes: 1, maxArmor: 20 } }, { id: 'de_nuke', name: 'Cabeza nuclear', desc: '+25% de daño explosivo.', mods: { explDmg: 1.25 } }],
      [{ id: 'de_zednuke', name: 'Apocalipsis', desc: 'En el Tiempo Muerto tus explosiones dejan nubes de radiación.', mods: { zedNuke: 1 } }, { id: 'de_zedreload', name: 'Cadena de montaje', desc: 'Recarga instantánea en Tiempo Muerto.', mods: { zedReload: 1 } }],
    ],
  },
  support: {
    id: 'support', name: 'Apoyo', color: '#a0c040', icon: '■',
    role: 'Mantiene la línea: escopetas, soldadura y munición para el equipo.',
    desc: 'Escopetas y ametralladoras. Suelda más rápido, carga más peso y puede reabastecer de munición a sus compañeros.',
    weapons: ['bulldog', 'bocacha', 'matraca', 'martillo'], grenade: 'nail', start: 'bulldog',
    xpSource: 'Daño con armas de Apoyo y soldadura',
    passive: (l) => ({ perkDmg: 1 + l * 0.01, weldSpeed: 1 + l * 0.04, penetration: Math.floor(l / 8), carry: Math.floor(l / 5), reload: 1 + l * 0.01, resupply: true }),
    talents: [
      [{ id: 'su_fortify', name: 'Fortificar', desc: 'Las soldaduras tienen +50% de resistencia.', mods: { weldStrength: 1.5 } }, { id: 'su_salvo', name: 'Salva', desc: '+1 perdigón en escopetas.', mods: { pelletsAdd: 1 } }],
      [{ id: 'su_tight', name: 'Choke ajustado', desc: '-30% de dispersión de perdigones.', mods: { spread: 0.7 } }, { id: 'su_mule', name: 'Mula de carga', desc: '+4 de capacidad de peso.', mods: { carry: 4 } }],
      [{ id: 'su_stumble', name: 'Contundencia', desc: '+60% de capacidad de tambaleo.', mods: { stumble: 1.6 } }, { id: 'su_belt', name: 'Cinta de munición', desc: '+30% de munición máxima.', mods: { maxAmmo: 1.3 } }],
      [{ id: 'su_tank', name: 'Tanque', desc: '+30 de salud máxima.', mods: { maxHp: 30 } }, { id: 'su_grenade', name: 'Artillero', desc: '+2 granadas y +20% de daño de granada.', mods: { grenadeMax: 2, grenadeDmg: 1.2 } }],
      [{ id: 'su_zedpen', name: 'Trituradora', desc: 'En el Tiempo Muerto, penetración ilimitada.', mods: { zedPen: 1 } }, { id: 'su_zedfast', name: 'Tormenta de plomo', desc: 'En el Tiempo Muerto disparas a cadencia completa.', mods: { zedFire: 1 } }],
    ],
  },
  medic: {
    id: 'medic', name: 'Médico', color: '#40e090', icon: '✚',
    role: 'Mantiene al equipo con vida y debilita a la horda con toxinas.',
    desc: 'Armas médicas que curan a distancia. Curación potenciada, recarga rápida de jeringa y más blindaje.',
    weapons: ['ampolla', 'vial', 'suero', 'antidoto'], grenade: 'medic', start: 'ampolla',
    xpSource: 'Curar a compañeros y daño con armas médicas',
    passive: (l) => ({ perkDmg: 1 + l * 0.008, healPower: 1 + l * 0.02, healRecharge: 1 + l * 0.03, moveSpeed: 1 + l * 0.004, maxArmor: Math.floor(l / 5) * 10 }),
    talents: [
      [{ id: 'me_adren', name: 'Adrenalina', desc: 'Curar otorga +20% de velocidad durante 4 s.', mods: { healHaste: 1 } }, { id: 'me_armor', name: 'Nanoblindaje', desc: 'Las curaciones también reparan 10 de blindaje.', mods: { healArmor: 10 } }],
      [{ id: 'me_toxin', name: 'Toxina', desc: 'Los dardos envenenan y frenan a los enemigos.', mods: { poisonSlow: 1 } }, { id: 'me_focus', name: 'Enfoque', desc: '+25% de daño con armas médicas.', mods: { perkDmg: 1.25 } }],
      [{ id: 'me_regen', name: 'Regeneración', desc: 'Regeneras 2 PV por segundo.', mods: { regen: 2 } }, { id: 'me_dart', name: 'Dardo rápido', desc: 'Los dardos curativos cuestan un 40% menos.', mods: { dartCost: 0.6 } }],
      [{ id: 'me_shield', name: 'Escudo vital', desc: 'Los aliados curados reciben -20% de daño durante 5 s.', mods: { healShield: 1 } }, { id: 'me_reviver', name: 'Reanimador', desc: 'Reanimas 2× más rápido y el aliado vuelve con 60 PV.', mods: { reviveSpeed: 2 } }],
      [{ id: 'me_zedheal', name: 'Pulso vital', desc: 'Al entrar en Tiempo Muerto curas 30 PV a todo el equipo cercano.', mods: { zedHeal: 30 } }, { id: 'me_zedfire', name: 'Bisturí', desc: 'En el Tiempo Muerto disparas a cadencia completa.', mods: { zedFire: 1 } }],
    ],
  },
  fire: {
    id: 'fire', name: 'Incinerador', color: '#ff7020', icon: '♨',
    role: 'Controla el terreno y frena a la horda con fuego.',
    desc: 'Lanzallamas y munición incendiaria. Las llamas duran más, el fuego no te daña y los enemigos en llamas entran en pánico.',
    weapons: ['chispa', 'aliento', 'dragon', 'solar'], grenade: 'fire', start: 'chispa',
    xpSource: 'Daño por fuego',
    passive: (l) => ({ perkDmg: 1 + l * 0.01, burnDur: 1 + l * 0.02, fireRes: Math.min(1, 0.3 + l * 0.03), maxAmmo: 1 + l * 0.01, reload: 1 + l * 0.01 }),
    talents: [
      [{ id: 'fi_napalm', name: 'Napalm', desc: 'Los enemigos ardiendo propagan el fuego.', mods: { spreadFire: 1 } }, { id: 'fi_range', name: 'Boquilla larga', desc: '+30% de alcance de lanzallamas.', mods: { flameRange: 1.3 } }],
      [{ id: 'fi_panic', name: 'Pánico', desc: 'Los enemigos ardiendo huyen brevemente.', mods: { firePanic: 1 } }, { id: 'fi_heat', name: 'Calor blanco', desc: '+20% de daño por fuego.', mods: { fireDmg: 1.2 } }],
      [{ id: 'fi_ground', name: 'Tierra quemada', desc: 'Tus llamas dejan charcos de fuego.', mods: { groundFire: 1 } }, { id: 'fi_tank', name: 'Traje ignífugo', desc: '+20 de blindaje máximo y -20% de daño cuerpo a cuerpo.', mods: { maxArmor: 20, meleeRes: 0.8 } }],
      [{ id: 'fi_ammo', name: 'Depósito extra', desc: '+40% de combustible.', mods: { maxAmmo: 1.4 } }, { id: 'fi_heads', name: 'Cabezas fundidas', desc: 'Las armas de fuego hacen daño de cabeza completo.', mods: { fireHead: 1 } }],
      [{ id: 'fi_zedinferno', name: 'Infierno', desc: 'En el Tiempo Muerto tus llamas tienen +50% de alcance y daño.', mods: { zedFlame: 1.5 } }, { id: 'fi_zedfast', name: 'Combustión', desc: 'En el Tiempo Muerto disparas a cadencia completa.', mods: { zedFire: 1 } }],
    ],
  },
  tesla: {
    id: 'tesla', name: 'Electricista', color: '#70a0ff', icon: 'ϟ',
    role: 'Aturde grupos y protege al equipo encadenando arcos eléctricos.',
    desc: 'Armas de arco que saltan entre enemigos y los paralizan. Ideal para cuellos de botella.',
    weapons: ['arco', 'bobina', 'tormenta', 'lanzarco'], grenade: 'emp', start: 'arco',
    xpSource: 'Daño eléctrico y enemigos aturdidos',
    passive: (l) => ({ perkDmg: 1 + l * 0.01, chainAdd: Math.floor(l / 8), stunPower: 1 + l * 0.03, reload: 1 + l * 0.01, maxAmmo: 1 + l * 0.008 }),
    talents: [
      [{ id: 'te_overload', name: 'Sobrecarga', desc: '+1 salto de cadena.', mods: { chainAdd: 1 } }, { id: 'te_range', name: 'Conductor', desc: '+40% de alcance de salto.', mods: { chainRange: 1.4 } }],
      [{ id: 'te_paralyze', name: 'Parálisis', desc: '+50% de duración de aturdimiento.', mods: { stunPower: 1.5 } }, { id: 'te_amp', name: 'Amplificador', desc: '+20% de daño eléctrico.', mods: { perkDmg: 1.2 } }],
      [{ id: 'te_shieldsap', name: 'Drenaje', desc: 'Matar con electricidad repara 3 de blindaje.', mods: { killArmor: 3 } }, { id: 'te_cells', name: 'Celdas densas', desc: '+30% de munición máxima.', mods: { maxAmmo: 1.3 } }],
      [{ id: 'te_fence', name: 'Valla eléctrica', desc: 'Las puertas que sueldas electrocutan a quien las golpea.', mods: { shockDoor: 1 } }, { id: 'te_arcarmor', name: 'Bobina dérmica', desc: 'Electrocutas a quien te golpee cuerpo a cuerpo.', mods: { thorns: 40 } }],
      [{ id: 'te_zedstorm', name: 'Tempestad', desc: 'En el Tiempo Muerto las cadenas no tienen límite de saltos (hasta 8).', mods: { zedChain: 8 } }, { id: 'te_zedfast', name: 'Alto voltaje', desc: 'En el Tiempo Muerto disparas a cadencia completa.', mods: { zedFire: 1 } }],
    ],
  },
};

export const PERK_LIST = Object.values(PERKS);

// Combina pasivas + talentos en un objeto de modificadores
export function buildMods(perkId, level, talentChoices = {}) {
  const p = PERKS[perkId];
  const m = {
    perkDmg: 1, dmgAll: 1, reload: 1, recoil: 1, spread: 1, headDmg: 1, moveSpeed: 1, maxHp: 0, maxArmor: 0,
    healPower: 1, healRecharge: 1, weldSpeed: 1, weldStrength: 1, carry: 0, grenadeMax: 0, explRadius: 1, explDmg: 1,
    fireDmg: 1, burnDur: 1, fireRes: 0, stunPower: 1, chainAdd: 0, chainRange: 1, zedExtend: 0, penetration: 0, magSize: 1,
    maxAmmo: 1, fireRate: 1, dmgTaken: 1, meleeRes: 1, stumble: 1, selfExplRes: 0, adsRecoil: 1, eliteDmg: 1, bigDmg: 1,
    impactDmg: 1, grenadeDmg: 1, pelletsAdd: 0, flameRange: 1, dartCost: 1, reviveSpeed: 1, regen: 0, flatAmmo: 0,
    killRefill: 0, killArmor: 0, thorns: 0, crouchSpread: 1, seeCloaked: 0, showHp: false, resupply: false,
  };
  const mul = new Set(['perkDmg', 'dmgAll', 'reload', 'recoil', 'spread', 'headDmg', 'moveSpeed', 'healPower', 'healRecharge', 'weldSpeed', 'weldStrength', 'explRadius', 'explDmg', 'fireDmg', 'burnDur', 'stunPower', 'chainRange', 'magSize', 'maxAmmo', 'fireRate', 'dmgTaken', 'meleeRes', 'stumble', 'adsRecoil', 'eliteDmg', 'bigDmg', 'impactDmg', 'grenadeDmg', 'flameRange', 'dartCost', 'reviveSpeed', 'crouchSpread', 'zedHead', 'zedFlame']);
  const apply = (mods) => {
    for (const [k, v] of Object.entries(mods)) {
      if (k === 'fireRes' || k === 'selfExplRes' || k === 'seeCloaked') m[k] = Math.max(m[k] || 0, v);
      else if (typeof v === 'boolean') m[k] = v;
      else if (mul.has(k)) m[k] = (m[k] ?? 1) * v;
      else m[k] = (m[k] || 0) + v;
    }
  };
  apply(p.passive(level));
  TALENT_LEVELS.forEach((lv, tier) => {
    if (level < lv) return;
    const choice = talentChoices[tier] ?? 0;
    const t = p.talents[tier][choice];
    if (t) apply(t.mods);
  });
  return m;
}

export function perkWeaponIds(perkId) { return PERKS[perkId]?.weapons || []; }
