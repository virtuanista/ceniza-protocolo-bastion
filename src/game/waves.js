// Director de oleadas: escalado por oleada/dificultad/jugadores, ritmo de aparición por grupos
// desde accesos no visibles, fase de comerciante con cuenta atrás, oleada del jefe y modo
// interminable. Incluye los objetivos opcionales y las cápsulas del comerciante.
import * as THREE from 'three';
import { ENEMIES, waveComposition, LENGTHS } from '../ai/enemyDefs.js';
import { audio } from '../audio/audio.js';
import { bus } from '../core/events.js';
import { pick, rand, weightedPick, shuffle, clamp } from '../core/utils.js';

export const PHASE = { PREP: 'prep', WAVE: 'wave', TRADER: 'trader', BOSS: 'boss', VICTORY: 'victory', DEFEAT: 'defeat' };

export class WaveDirector {
  constructor(game, lengthId) {
    this.game = game;
    this.length = LENGTHS[lengthId];
    this.lengthId = lengthId;
    this.endless = lengthId === 'endless';
    this.wave = 0; // índice de la oleada actual (1-based al mostrar)
    this.phase = PHASE.PREP;
    this.timer = 45;
    this.toSpawn = 0; this.totalThisWave = 0;
    this.spawnTimer = 3;
    this.killedThisWave = 0;
    this.traderIdx = -1;
    this.waveDamageTaken = 0;
    this.objective = null;
    this.objectiveCooldown = 0;
    this.pods = [];
    this.ready = new Set();
    this.bossWaveIdx = this.endless ? 5 : this.length.waves + 1;
    this._buildPods();
    this.openTrader();
  }

  get totalWaves() { return this.endless ? Infinity : this.length.waves + 1; }
  isBossWave(n) { return this.endless ? n % 5 === 0 : n === this.length.waves + 1; }
  get remaining() { return this.toSpawn + this.game.enemies.alive.length; }

  // ------------------------------------------------------------ cápsulas del comerciante
  _buildPods() {
    const g = this.game;
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.4, metalness: 0.8 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.5, metalness: 0.4 });
    for (const t of g.world.def.traders) {
      const grp = new THREE.Group();
      grp.position.set(t.pos[0], 0, t.pos[1]);
      grp.rotation.y = t.yaw;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.3, 12), metal); base.position.y = 0.15; grp.add(base);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 2.1, 12), metal); body.position.y = 1.35; grp.add(body);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.67, 0.67, 0.12, 12), accent); band.position.y = 0.6; grp.add(band);
      const screenMat = new THREE.MeshBasicMaterial({ color: 0x103018 });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), screenMat); screen.position.set(0, 1.55, 0.6); grp.add(screen);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial({ color: 0x402010 })); eye.position.set(0, 2.25, 0.4); grp.add(eye);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.4, 12), accent); top.position.y = 2.6; grp.add(top);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0x40ff80, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.9, 30, 12, 1, true), beamMat); beam.position.y = 16; grp.add(beam);
      g.renderer.scene.add(grp);
      g.world.collision.add({ min: [t.pos[0] - 0.6, 0, t.pos[1] - 0.6], max: [t.pos[0] + 0.6, 2.8, t.pos[1] + 0.6], solid: true, mat: 'metal' });
      this.pods.push({ def: t, grp, screenMat, eye, beamMat, pos: new THREE.Vector3(t.pos[0], 0, t.pos[1]) });
    }
  }

  get activePod() { return this.traderIdx >= 0 ? this.pods[this.traderIdx] : null; }

  openTrader() {
    // elige una cápsula distinta a la anterior
    let idx = Math.floor(Math.random() * this.pods.length);
    if (this.pods.length > 1 && idx === this.traderIdx) idx = (idx + 1) % this.pods.length;
    this.traderIdx = idx;
    this.phase = this.wave === 0 ? PHASE.PREP : PHASE.TRADER;
    this.timer = this.wave === 0 ? 50 : 60;
    this.ready.clear();
    for (const p of this.pods) { p.screenMat.color.set(0x103018); p.eye.material.color.set(0x402010); }
    const pod = this.activePod;
    pod.screenMat.color.set(0x40ff90); pod.eye.material.color.set(0xffe040);
    audio.play('trader_open', { volume: 0.7, bus: 'ui' });
    audio.music?.setIntensity(0);
    bus.emit('traderOpen', { pod: pod.def, time: this.timer });
    this.game.net?.hostEvent('phase', this.netState());
  }

  closeTrader() {
    for (const p of this.pods) { p.screenMat.color.set(0x103018); p.eye.material.color.set(0x402010); p.beamMat.opacity = 0; }
    bus.emit('traderClose');
  }

  setReady(playerId) {
    this.ready.add(playerId);
    const n = this.game.getPlayers().filter((p) => p.alive).length;
    if (this.ready.size >= n && (this.phase === PHASE.TRADER || this.phase === PHASE.PREP)) this.timer = Math.min(this.timer, 5);
    this.game.net?.hostEvent('phase', this.netState());
  }

  startWave() {
    this.closeTrader();
    this.wave++;
    this.killedThisWave = 0;
    this.waveDamageTaken = 0;
    this.game.local.waveDamage = 0;
    const g = this.game;
    const boss = this.isBossWave(this.wave);
    const players = g.getPlayers().length;
    const pmult = 1 + (players - 1) * 0.55;
    const progress = this.endless ? clamp((this.wave - 1) / 12, 0, 1) : clamp((this.wave - 1) / Math.max(1, this.length.waves - 1), 0, 1);
    this.progress = progress;
    if (boss) {
      this.phase = PHASE.BOSS;
      this.toSpawn = 0;
      this.totalThisWave = 1;
      g.spawnBoss();
      audio.music?.setIntensity(3);
      bus.emit('waveStart', { wave: this.wave, boss: true, total: 1 });
    } else {
      this.phase = PHASE.WAVE;
      const lenF = this.lengthId === 'short' ? 1.15 : this.lengthId === 'medium' ? 1 : 0.92;
      const base = 16 + this.wave * (this.endless ? 6 : 8) * lenF + progress * 18;
      this.totalThisWave = Math.round(base * (g.diff.count || 1) * pmult);
      this.toSpawn = this.totalThisWave;
      this.spawnTimer = 2;
      audio.play('wave_start', { volume: 0.8, bus: 'ui' });
      audio.music?.setIntensity(1);
      bus.emit('waveStart', { wave: this.wave, boss: false, total: this.totalThisWave });
      this.objectiveCooldown = rand(18, 35);
      this.objectiveOffered = this.wave >= 2 && Math.random() < 0.7;
    }
    g.net?.hostEvent('phase', this.netState());
  }

  endWave() {
    const g = this.game;
    if (this.objective) this.objective.fail('La oleada ha terminado');
    const bonus = Math.round((120 + this.wave * 25) * (g.diff.credits || 1));
    g.rewardAll(bonus, 'Oleada superada');
    audio.play('wave_end', { volume: 0.8, bus: 'ui' });
    bus.emit('waveEnd', { wave: this.wave, bonus });
    g.onWaveSurvived(this.wave);
    if (!this.endless && this.wave >= this.length.waves + 1) { g.victory(); return; }
    this.openTrader();
    g.respawnDeadPlayers();
  }

  netState() {
    return { ph: this.phase, w: this.wave, t: +this.timer.toFixed(1), rem: this.remaining, tot: this.totalThisWave, tr: this.traderIdx, rd: [...this.ready] };
  }
  applyNet(s) {
    const prevPhase = this.phase;
    this.phase = s.ph; this.wave = s.w; this.timer = s.t; this.netRemaining = s.rem; this.totalThisWave = s.tot;
    this.ready = new Set(s.rd || []);
    if (s.tr !== this.traderIdx || prevPhase !== s.ph) {
      this.traderIdx = s.tr;
      if (s.ph === PHASE.TRADER || s.ph === PHASE.PREP) {
        for (const p of this.pods) { p.screenMat.color.set(0x103018); p.eye.material.color.set(0x402010); }
        const pod = this.activePod; if (pod) { pod.screenMat.color.set(0x40ff90); pod.eye.material.color.set(0xffe040); }
        if (prevPhase !== s.ph) { audio.play('trader_open', { volume: 0.7, bus: 'ui' }); audio.music?.setIntensity(0); bus.emit('traderOpen', { pod: pod?.def, time: s.t }); }
      } else if (prevPhase === PHASE.TRADER || prevPhase === PHASE.PREP) {
        this.closeTrader();
        audio.play('wave_start', { volume: 0.8, bus: 'ui' });
        audio.music?.setIntensity(s.ph === PHASE.BOSS ? 3 : 1);
        bus.emit('waveStart', { wave: s.w, boss: s.ph === PHASE.BOSS, total: s.tot });
      }
    }
  }

  // ------------------------------------------------------------ actualización (anfitrión)
  update(dt) {
    const g = this.game;
    const pod = this.activePod;
    if (pod && (this.phase === PHASE.TRADER || this.phase === PHASE.PREP)) {
      pod.beamMat.opacity = 0.25 + Math.sin(g.time * 3) * 0.08;
      pod.eye.rotation.y = Math.sin(g.time * 0.8) * 0.6;
    }
    if (!g.authority) { if (this.phase === PHASE.TRADER || this.phase === PHASE.PREP) this.timer = Math.max(0, this.timer - dt); return; }
    if (this.phase === PHASE.TRADER || this.phase === PHASE.PREP) {
      const prev = Math.ceil(this.timer);
      this.timer -= dt;
      if (Math.ceil(this.timer) !== prev && this.timer <= 5 && this.timer > 0) audio.play('countdown', { volume: 0.6, bus: 'ui' });
      if (this.timer <= 0) this.startWave();
      if (Math.floor(this.timer * 2) !== Math.floor((this.timer + dt) * 2)) g.net?.hostEvent('phase', this.netState());
      return;
    }
    if (this.phase === PHASE.WAVE) {
      this._spawnTick(dt);
      // intensidad musical según presión
      const alive = g.enemies.alive.length;
      audio.music?.setIntensity(alive > 14 || g.enemies.alive.some((e) => e.def.big) ? 2 : 1);
      // objetivo opcional
      if (this.objectiveOffered && !this.objective) {
        this.objectiveCooldown -= dt;
        if (this.objectiveCooldown <= 0) { this.objectiveOffered = false; this.objective = Objective.random(g); if (this.objective) { this.objective.start(); } }
      }
      if (this.toSpawn <= 0 && alive === 0) this.endWave();
    }
    if (this.phase === PHASE.BOSS) {
      // goteo de enemigos menores durante el jefe
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && g.boss && g.enemies.alive.length < 8) { this.spawnTimer = rand(7, 12); this.spawnMinions(2, ['putrido', 'rastrero', 'putrido_alfa']); }
    }
    if (this.objective) this.objective.update(dt);
    this._netT = (this._netT || 0) - dt;
    if (this._netT <= 0) { this._netT = 1; g.net?.hostEvent('phase', this.netState()); }
  }

  _spawnTick(dt) {
    const g = this.game;
    if (this.toSpawn <= 0) return;
    this.spawnTimer -= dt;
    const maxAlive = Math.round((g.diff.maxAlive || 24) * (1 + (g.getPlayers().length - 1) * 0.35));
    if (this.spawnTimer > 0 || g.enemies.alive.length >= maxAlive) return;
    const rate = g.diff.spawnRate || 1;
    this.spawnTimer = rand(2.2, 4.2) / rate * (this.progress > 0.6 ? 0.8 : 1);
    // grupo
    const groupSize = Math.min(this.toSpawn, maxAlive - g.enemies.alive.length, Math.floor(rand(2, 4 + this.progress * 4)));
    if (groupSize <= 0) return;
    const comp = waveComposition(this.progress, this.wave - 1);
    const types = [];
    for (let i = 0; i < groupSize; i++) {
      let t = weightedPick(comp);
      // limitar tanques simultáneos
      const counts = g.enemies.countByType();
      if ((t === 'coloso' && (counts.coloso || 0) >= 1 + Math.floor(this.progress * 2)) || (t === 'desgarrador' && (counts.desgarrador || 0) >= 2 + Math.floor(this.progress * 2))) t = 'putrido';
      types.push(t);
    }
    // a veces una manada temática
    if (Math.random() < 0.15 && this.wave > 1) types.fill('rastrero');
    const spawnsUsed = this._chooseSpawns(types.length > 3 ? 2 : 1);
    types.forEach((t, i) => {
      const sp = spawnsUsed[i % spawnsUsed.length];
      this._spawnAt(t, sp, i);
    });
    this.toSpawn -= types.length;
  }

  _chooseSpawns(n) {
    const g = this.game;
    const players = g.getPlayers().filter((p) => p.alive);
    const nav = g.world.nav;
    const scored = g.world.def.spawns.map((s) => {
      let minD = Infinity, visible = false;
      for (const p of players) {
        const d = Math.hypot(p.pos.x - s.exit[0], p.pos.z - s.exit[1]);
        minD = Math.min(minD, d);
        if (d < 30 && g.world.collision.lineOfSight(p.pos.x, p.pos.y + 1.6, p.pos.z, s.pos[0], 1.5, s.pos[1])) visible = true;
      }
      let score = Math.random() * 10;
      if (minD < 10) score -= 60; else if (minD < 40) score += 25 - Math.abs(minD - 24) * 0.6; else score += 5;
      if (visible) score -= 20;
      if (this.objective?.attractPos) score += 15 - Math.min(15, Math.hypot(this.objective.attractPos.x - s.exit[0], this.objective.attractPos.z - s.exit[1]) * 0.3);
      void nav;
      return [s, score];
    });
    scored.sort((a, b) => b[1] - a[1]);
    return scored.slice(0, Math.max(1, n)).map((x) => x[0]);
  }

  _spawnAt(type, sp, i) {
    const g = this.game;
    const ang = (i / 6) * Math.PI * 2;
    const r = sp.vent ? 0.4 : 1.2;
    let x = sp.pos[0] + Math.cos(ang) * r, z = sp.pos[1] + Math.sin(ang) * r;
    const elite = this.progress > 0.5 && Math.random() < 0.08 && ENEMIES[type] && !ENEMIES[type].big;
    return g.enemies.spawn(type, x, z, { vent: sp.vent, exit: sp.exit, yaw: Math.atan2(sp.exit[0] - sp.pos[0], sp.exit[1] - sp.pos[1]), elite, hpMult: elite ? 1.5 : 1 });
  }

  spawnMinions(n, types) {
    const sps = this._chooseSpawns(2);
    for (let i = 0; i < n; i++) this._spawnAt(pick(types), sps[i % sps.length], i);
  }

  onKill() { this.killedThisWave++; if (this.objective) this.objective.onKill(); }
}

// ===================================================================== objetivos opcionales
export class Objective {
  static random(game) {
    const o = game.world.def.objectives;
    const kinds = shuffle(['defend', 'repair', 'carry', 'holdout']);
    for (const k of kinds) {
      if ((k === 'defend' || k === 'holdout') && o.zones.length) return new Objective(game, k, pick(o.zones));
      if (k === 'repair' && o.devices.length) return new Objective(game, k, pick(o.devices));
      if (k === 'carry' && o.carry.length) return new Objective(game, k, pick(o.carry));
    }
    return null;
  }

  constructor(game, kind, data) {
    this.game = game; this.kind = kind; this.data = data;
    this.progress = 0; this.done = false; this.failed = false;
    const names = { defend: 'Defender zona', repair: 'Reparar dispositivo', carry: 'Transportar objeto', holdout: 'Resistir en el punto' };
    this.title = names[kind];
    this.timeLimit = kind === 'carry' ? 120 : 100;
    this.time = this.timeLimit;
    this.goal = kind === 'defend' ? 35 : kind === 'repair' ? 12 : kind === 'holdout' ? 14 : 1;
    this.markers = [];
    const pos = kind === 'carry' ? data.from : data.pos;
    this.pos = new THREE.Vector3(pos[0], 0, pos[1]);
    this.dest = kind === 'carry' ? new THREE.Vector3(data.to[0], 0, data.to[1]) : null;
    this.radius = data.r || 2.2;
    this.carrier = null; // id del jugador que lo porta
    this.itemPos = this.pos.clone();
    this.attractPos = this.pos;
    this.reward = Math.round(250 * (game.diff.credits || 1) + game.waves.wave * 20);
  }

  get desc() {
    const d = this.data;
    if (this.kind === 'defend') return `Permanece en «${d.name}» ${this.goal} s`;
    if (this.kind === 'holdout') return `Mata ${this.goal} engendros dentro de «${d.name}»`;
    if (this.kind === 'repair') return `Repara «${d.name}» manteniendo [E]`;
    return this.carrier ? `Lleva «${d.name}» al punto de entrega` : `Recoge «${d.name}» [E]`;
  }

  start() {
    const g = this.game;
    const s = g.renderer.scene;
    const mk = (pos, color, r) => {
      const grp = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
      ring.position.y = 0.05; grp.add(ring);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 14, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
      pillar.position.y = 7; grp.add(pillar);
      grp.position.copy(pos);
      s.add(grp);
      this.markers.push(grp);
      return grp;
    };
    if (this.kind === 'defend' || this.kind === 'holdout') mk(this.pos, 0x40c0ff, this.radius);
    else if (this.kind === 'repair') {
      mk(this.pos, 0xffc040, 1.6);
      const dev = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.6), new THREE.MeshStandardMaterial({ color: 0x505860, metalness: 0.7, roughness: 0.4, emissive: 0x401000 }));
      dev.position.set(this.pos.x, 0.65, this.pos.z); s.add(dev); this.markers.push(dev); this.device = dev;
    } else {
      mk(this.dest, 0x40ff80, 2.2);
      const item = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x30a0ff, emissive: 0x1040a0, metalness: 0.5, roughness: 0.3 }));
      item.position.set(this.pos.x, 0.4, this.pos.z); s.add(item); this.markers.push(item); this.item = item;
    }
    audio.play('objective', { volume: 0.7, bus: 'ui' });
    bus.emit('objectiveStart', this);
    g.net?.hostEvent('obj', this.netState());
  }

  netState() { return { k: this.kind, i: this.indexInMap(), p: +this.progress.toFixed(2), t: +this.time.toFixed(1), c: this.carrier, d: this.done ? 1 : 0, f: this.failed ? 1 : 0 }; }
  indexInMap() {
    const o = this.game.world.def.objectives;
    const list = this.kind === 'carry' ? o.carry : this.kind === 'repair' ? o.devices : o.zones;
    return list.indexOf(this.data);
  }

  playersInZone() {
    return this.game.getPlayers().filter((p) => p.alive && !p.downed && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < this.radius);
  }

  onKill() {
    if (this.kind !== 'holdout' || this.done) return;
    if (this.playersInZone().length) { this.progress++; if (this.progress >= this.goal) this.complete(); }
  }

  // interacción local (E): reparar / recoger / soltar
  interact(player, dt, holding) {
    if (this.done || this.failed) return false;
    if (this.kind === 'repair' && holding && player.pos.distanceTo(this.pos) < 2) {
      this.game.reportObjectiveWork(player.id, dt);
      return true;
    }
    if (this.kind === 'carry' && !holding) {
      if (!this.carrier && player.pos.distanceTo(this.itemPos) < 2) { this.game.reportObjectivePickup(player.id); return true; }
    }
    return false;
  }

  addWork(dt) { if (this.kind === 'repair') { this.progress = Math.min(this.goal, this.progress + dt); if (this.progress >= this.goal) this.complete(); } }
  pickup(pid) { if (!this.carrier) { this.carrier = pid; audio.play('pickup', { volume: 0.6 }); const p = this.game.getPlayers().find((q) => q.id === pid); if (p === this.game.local) this.game.local.carry = this; } }

  update(dt) {
    if (this.done || this.failed) return;
    const g = this.game;
    this.time -= dt;
    for (const m of this.markers) if (m.children?.[1]) m.children[1].material.opacity = 0.2 + Math.sin(g.time * 4) * 0.08;
    if (this.kind === 'defend') {
      if (this.playersInZone().length) this.progress += dt;
      if (this.progress >= this.goal) this.complete();
    } else if (this.kind === 'repair') {
      this.progress = Math.max(0, this.progress - dt * 0.15);
      if (this.device) this.device.material.emissive.setRGB(0.25 * (1 - this.progress / this.goal), 0.25 * this.progress / this.goal, 0.02);
    } else if (this.kind === 'carry') {
      const carrier = this.carrier && g.getPlayers().find((p) => p.id === this.carrier);
      if (carrier && (!carrier.alive || carrier.downed)) { this.itemPos.copy(carrier.pos); this.carrier = null; if (carrier === g.local) g.local.carry = null; }
      if (carrier && carrier.alive) {
        this.itemPos.copy(carrier.pos);
        this.attractPos = carrier.pos;
        if (Math.hypot(carrier.pos.x - this.dest.x, carrier.pos.z - this.dest.z) < 2.2) { this.progress = 1; if (carrier === g.local) g.local.carry = null; this.complete(); }
      }
      if (this.item) { this.item.visible = !carrier || carrier !== g.local; this.item.position.set(this.itemPos.x, carrier ? this.itemPos.y + 1.2 : 0.4, this.itemPos.z); this.item.rotation.y += dt; }
    }
    if (this.time <= 0) this.fail('Tiempo agotado');
    this._sync = (this._sync || 0) - dt;
    if (this._sync <= 0) { this._sync = 0.5; g.net?.hostEvent('obj', this.netState()); }
  }

  complete() {
    if (this.done) return;
    this.done = true;
    const g = this.game;
    audio.play('objective', { volume: 0.8, bus: 'ui' });
    g.rewardAll(this.reward, 'Objetivo completado', 350);
    g.onObjectiveComplete(this);
    bus.emit('objectiveEnd', { ok: true, obj: this });
    g.net?.hostEvent('obj', this.netState());
    this.cleanup();
  }
  fail(reason) {
    if (this.done || this.failed) return;
    this.failed = true;
    audio.play('objective_fail', { volume: 0.7, bus: 'ui' });
    bus.emit('objectiveEnd', { ok: false, reason, obj: this });
    this.game.net?.hostEvent('obj', this.netState());
    this.cleanup();
  }
  cleanup() {
    for (const m of this.markers) this.game.renderer.scene.remove(m);
    this.markers = [];
    if (this.game.local.carry === this) this.game.local.carry = null;
    if (this.game.waves.objective === this) this.game.waves.objective = null;
  }
}
