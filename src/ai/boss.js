// El Primogénito: jefe con 3 fases, ataques telegrafiados, invocaciones, regeneración
// oculta (fase 2) y ventanas de vulnerabilidad con el corazón expuesto.
import * as THREE from 'three';
import { STATE, ballistic } from './enemies.js';
import { audio } from '../audio/audio.js';
import { bus } from '../core/events.js';
import { angleDiff, clamp, damp, rand, pick } from '../core/utils.js';

const _v = new THREE.Vector3();

export class BossController {
  constructor(game, enemy) {
    this.game = game;
    this.e = enemy;
    this.phase = 1;
    this.action = null; // {kind, t, dur, ...}
    this.cd = { spikes: 4, slam: 7, summon: 12, orbs: 9, charge: 6, swipe: 0 };
    this.exposedT = 0;
    this.invulnT = 0;
    this.regen = null;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.ring.position.y = 0.06;
    game.renderer.scene.add(this.ring);
    this.lineMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xff3010, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.lineMesh.position.y = 0.07;
    game.renderer.scene.add(this.lineMesh);
    this.coreWorld = new THREE.Vector3();
    this.introT = 3;
    enemy.state = STATE.SPECIAL;
    this.start('roar', 3);
    audio.play('boss_roar', { pos: enemy.pos, volume: 1, priority: true, ref: 12, maxDist: 200 });
    bus.emit('bossPhase', { phase: 1, name: enemy.def.name, intro: true });
  }

  dispose() { this.game.renderer.scene.remove(this.ring, this.lineMesh); }

  get hpFrac() { return this.e.hp / this.e.maxHp; }

  start(kind, dur, extra = {}) {
    this.action = { kind, t: 0, dur, done: false, ...extra };
    this.e.state = STATE.SPECIAL;
    this.e.special = 'boss_' + kind;
    this.e.specialT = 0;
    this.game.net?.hostEvent('boss', { a: kind, d: dur, x: extra.target ? +extra.target.x.toFixed(1) : undefined, z: extra.target ? +extra.target.z.toFixed(1) : undefined });
  }

  warn(text) { bus.emit('bossWarn', text); this.game.net?.hostEvent('bwarn', { t: text }); }

  modifyDamage(e, dmg, zone) {
    if (this.invulnT > 0) return 0;
    if (zone === 'heart') return dmg * 3;
    if (zone === 'head') return dmg * 1.25;
    if (zone === 'legs') return dmg * 0.6;
    return dmg * (this.exposedT > 0 ? 0.9 : 0.55); // placas óseas
  }

  zoneFor(e, o, d, best, zone) {
    if (this.exposedT <= 0) return null;
    const c = this.coreWorld;
    const r = 0.45 * (e.def.model.scale || 1);
    const lx = c.x - o.x, ly = c.y - o.y, lz = c.z - o.z;
    const tca = lx * d.x + ly * d.y + lz * d.z;
    const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
    if (d2 < r * r && tca > 0 && tca < best + 0.6) return 'heart';
    return zone;
  }

  _target() {
    const players = this.game.getPlayers().filter((p) => p.alive && !p.downed);
    if (!players.length) return null;
    let best = players[0], bd = Infinity;
    for (const p of players) { const d = p.pos.distanceTo(this.e.pos); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  updateAI(e, dt, players) {
    const g = this.game, def = e.def;
    void players;
    for (const k in this.cd) this.cd[k] -= dt;
    if (this.exposedT > 0) this.exposedT -= dt;
    if (this.invulnT > 0) this.invulnT -= dt;
    const T = this._target();
    e.target = T;
    // transiciones de fase
    const hf = this.hpFrac;
    if (this.phase === 1 && hf < 0.66) { this._enterPhase(2); }
    else if (this.phase === 2 && hf < 0.33 && !this.regen) { this._enterPhase(3); }
    e.raging = this.phase === 3;
    // estados alterados mínimos
    if (e.burnT > 0) { e.burnT -= dt; g.fx.burn(e.pos, 3); e._bt = (e._bt || 0) + dt; if (e._bt > 0.33) { e._bt = 0; g.enemies.damage(e, e.burnDps * 0.33, 'body', 'fire', null, e.burnOwner, { dot: true, noBlood: true, perkMatch: true }); } }
    if (e.dead) return;

    let desired = null, speed = 0;
    const toT = T ? _v.set(T.pos.x - e.pos.x, 0, T.pos.z - e.pos.z) : _v.set(0, 0, 0);
    const dist = T ? toT.length() : 99;
    const a = this.action;
    if (a) {
      a.t += dt;
      e.specialT = a.t;
      this._runAction(a, dt, T, dist);
      if (this.action && this.action.kind === 'charge' && this.action.t > this.action.windup) { desired = this.action.dir; speed = 13; }
      else if (this.action && this.action.kind === 'flee') { desired = this.action.dir; speed = 7; }
      else if (T && this.action && this.action.kind !== 'stunned') e.yaw += angleDiff(e.yaw, Math.atan2(toT.x, toT.z)) * Math.min(1, dt * 3);
      if (this.action && a.t >= a.dur) this._endAction(a);
    } else {
      e.state = STATE.CHASE;
      if (T) {
        speed = this.phase === 3 ? 4.6 : this.phase === 2 ? 3.4 : 2.6;
        desired = g.enemies._navDir(e, T, dist, toT.clone()) || toT.clone().normalize();
        this._chooseAttack(T, dist);
      }
    }
    // movimiento
    const tvx = desired ? desired.x * speed : 0, tvz = desired ? desired.z * speed : 0;
    e.vel.x = damp(e.vel.x, tvx, 5, dt); e.vel.z = damp(e.vel.z, tvz, 5, dt); e.vel.y -= 18 * dt;
    const res = g.world.collision.moveCylinder(e.pos, e.vel, def.radius, def.height, dt, { forEnemy: true, stepHeight: 0.6 });
    if (res.blockers) for (const b of res.blockers) if (b.door?.blocksEnemies()) g.damageDoor(b.door, 2000, e);
    // carga contra pared -> aturdido y vulnerable
    if (this.action?.kind === 'charge' && this.action.t > this.action.windup + 0.2 && res.hitWall && Math.hypot(e.vel.x, e.vel.z) < 6) {
      this._stun(3.2, true);
      audio.play('slam', { pos: e.pos, volume: 1, priority: true });
      g.local.shake(0.6);
    }
    const hv = Math.hypot(e.vel.x, e.vel.z);
    if (hv > 0.4 && this.action?.kind !== 'stunned') e.yaw += angleDiff(e.yaw, Math.atan2(e.vel.x, e.vel.z)) * Math.min(1, dt * 4);
    e.moveBlend = damp(e.moveBlend, clamp(hv / 6, 0, 1.4), 6, dt);
    e.model.root.position.copy(e.pos);
    e.model.root.rotation.y = e.yaw;
    // regeneración oculta de la fase 2
    if (this.regen) {
      this.regen.t += dt;
      e.hp = Math.min(e.maxHp * 0.66, e.hp + e.maxHp * 0.022 * dt);
      if (Math.random() < 0.4) g.fx.glow.spawn(e.pos.x + rand(-1, 1), e.pos.y + rand(0.5, 3), e.pos.z + rand(-1, 1), 0, 1.2, 0, 1, 0.3, 0.1, 0.25, 0.6);
      const taken = this.regen.hp0 - e.hp + e.maxHp * 0.022 * this.regen.t;
      if (this.regen.t > 10 || taken > e.maxHp * 0.07) this._endRegen();
    }
    // telegrafía de anillo
    if (this.action?.kind === 'slam') {
      const p = clamp(this.action.t / this.action.windup, 0, 1);
      this.ring.position.set(e.pos.x, 0.06, e.pos.z);
      this.ring.scale.setScalar(Math.max(0.1, p * 9));
      this.ring.material.opacity = 0.35 + Math.sin(this.action.t * 20) * 0.25;
    } else this.ring.material.opacity = damp(this.ring.material.opacity, 0, 8, dt);
    if (this.action?.kind === 'charge' && this.action.t < this.action.windup) {
      this.lineMesh.position.set(e.pos.x, 0.07, e.pos.z);
      this.lineMesh.rotation.y = Math.atan2(this.action.dir.x, this.action.dir.z);
      this.lineMesh.scale.set(1, 1, 26);
      this.lineMesh.material.opacity = 0.3 + Math.sin(this.action.t * 25) * 0.2;
    } else this.lineMesh.material.opacity = damp(this.lineMesh.material.opacity, 0, 8, dt);
  }

  _chooseAttack(T, dist) {
    const p = this.phase;
    if (dist < 3.6 && this.cd.swipe <= 0) { this.start('swipe', 1.1); this.cd.swipe = p === 3 ? 0.9 : 1.6; return; }
    if (this.cd.summon <= 0) { this.start('summon', 1.6); this.cd.summon = p === 3 ? 18 : 26; return; }
    if (dist < 10 && this.cd.slam <= 0) { this.start('slam', p === 3 ? 1.9 : 2.3, { windup: p === 3 ? 1.0 : 1.3 }); this.cd.slam = p === 3 ? 7 : 11; this.warn('¡GOLPE SÍSMICO! ¡SALTA!'); return; }
    if (p === 3 && dist > 6 && dist < 30 && this.cd.charge <= 0) {
      const dir = new THREE.Vector3(T.pos.x - this.e.pos.x, 0, T.pos.z - this.e.pos.z).normalize();
      this.start('charge', 3.2, { windup: 0.9, dir }); this.cd.charge = 7; this.warn('¡EMBESTIDA! ¡APÁRTATE!');
      audio.play('charge_warn', { pos: this.e.pos, volume: 1, priority: true, ref: 8 });
      return;
    }
    if (p >= 2 && dist > 5 && this.cd.orbs <= 0) { this.start('orbs', 1.5); this.cd.orbs = 11; return; }
    if (dist > 4 && dist < 40 && this.cd.spikes <= 0 && this.e.los !== false) { this.start('spikes', 1.6, { windup: 0.95 }); this.cd.spikes = p === 3 ? 3.5 : 5.5; this.warn('¡LLUVIA DE ESPINAS!'); }
  }

  _runAction(a, dt, T, dist) {
    const g = this.game, e = this.e;
    switch (a.kind) {
      case 'roar': if (a.t < 0.1) g.local.shake(0.4); break;
      case 'swipe':
        if (!a.done && a.t > 0.55) {
          a.done = true;
          for (const p of g.getPlayers()) if (p.alive && !p.downed && p.pos.distanceTo(e.pos) < 4) g.damagePlayer(p.id, e.def.dmg * g.enemies.dmgMult * (this.phase === 3 ? 1.3 : 1), 'melee', { x: e.pos.x, y: e.pos.y, z: e.pos.z, enemy: e });
          audio.play('swing_heavy', { pos: e.pos, volume: 1 });
        }
        break;
      case 'spikes':
        if (!a.done && a.t > a.windup && T) {
          a.done = true;
          const from = e.headWorld.clone(); from.y += 0.3;
          const n = this.phase === 3 ? 11 : 7;
          const base = Math.atan2(T.pos.x - from.x, T.pos.z - from.z);
          for (let i = 0; i < n; i++) {
            const ang = base + (i - (n - 1) / 2) * 0.09;
            const tgt = new THREE.Vector3(from.x + Math.sin(ang) * dist, T.pos.y + 1.1, from.z + Math.cos(ang) * dist);
            const v = tgt.sub(from).normalize().multiplyScalar(32);
            g.projectiles.spawn('spike', from.clone(), v, { owner: 'enemy', stats: { dmg: 13 * g.enemies.dmgMult } });
          }
          audio.play('spikes', { pos: e.pos, volume: 1, priority: true });
        } else if (a.t < a.windup && Math.random() < 0.5) g.fx.glow.spawn(e.headWorld.x, e.headWorld.y + 0.5, e.headWorld.z, rand(-1, 1), rand(0, 2), rand(-1, 1), 1, 0.3, 0.1, 0.3, 0.3);
        break;
      case 'slam':
        if (!a.done && a.t > a.windup) {
          a.done = true;
          audio.play('slam', { pos: e.pos, volume: 1, priority: true, ref: 10, maxDist: 150 });
          g.fx.explosion(e.pos.clone(), 7, 'fire');
          for (let i = 0; i < 40; i++) { const ang = Math.random() * Math.PI * 2; g.fx.smoke.spawn(e.pos.x + Math.cos(ang) * 2, 0.3, e.pos.z + Math.sin(ang) * 2, Math.cos(ang) * 12, 0.5, Math.sin(ang) * 12, 0.3, 0.27, 0.24, 0.8, 1.2, 0, 2, 1.5, 0.6); }
          for (const p of g.getPlayers()) {
            if (!p.alive || p.downed) continue;
            const d = p.pos.distanceTo(e.pos);
            const airborne = p.airborne ?? (p === g.local ? !g.local.onGround && g.local.pos.y - 0 > 0.35 : false);
            if (d < 9.5 && !airborne) g.damagePlayer(p.id, 32 * g.enemies.dmgMult * (1 - d / 14), 'explosive', { x: e.pos.x, y: e.pos.y, z: e.pos.z });
          }
          g.local.shake(Math.max(0.2, 1 - g.local.pos.distanceTo(e.pos) / 25));
          // tras el golpe queda expuesto
          this._stun(2.2, true);
        }
        break;
      case 'summon':
        if (!a.done && a.t > 0.8) {
          a.done = true;
          audio.play('boss_roar2', { pos: e.pos, volume: 1, priority: true, ref: 10 });
          const n = this.phase === 3 ? 6 : 4;
          g.waves.spawnMinions(n, this.phase >= 2 ? ['rastrero', 'putrido', 'putrido_alfa', 'acechador'] : ['putrido', 'rastrero']);
        }
        break;
      case 'orbs':
        if (!a.done && a.t > 0.9 && T) {
          a.done = true;
          for (let i = 0; i < 3; i++) {
            const from = e.headWorld.clone().add(new THREE.Vector3(rand(-1, 1), 0.5, rand(-1, 1)));
            const v = ballistic(from, T.pos.clone().add(new THREE.Vector3(rand(-3, 3), 1, rand(-3, 3))), 10, 2).multiplyScalar(0.8);
            const p = g.projectiles.spawn('acidOrb', from, v, { owner: 'enemy', stats: { dmg: 16 * g.enemies.dmgMult, radius: 2.5 } });
            p.target = T; p.life = 7;
          }
          audio.play('acid_spit', { pos: e.pos, volume: 1, rate: 0.6 });
        }
        break;
      case 'charge':
        if (a.t > a.windup) {
          if (!a.started) { a.started = true; audio.play('rage', { pos: e.pos, volume: 1, priority: true, rate: 0.7 }); }
          for (const p of g.getPlayers()) {
            if (!p.alive || p.downed || a.hitSet?.has(p.id)) continue;
            if (p.pos.distanceTo(e.pos) < 2.4) {
              (a.hitSet || (a.hitSet = new Set())).add(p.id);
              g.damagePlayer(p.id, 48 * g.enemies.dmgMult, 'melee', { x: e.pos.x, y: e.pos.y, z: e.pos.z, enemy: e });
              if (p === g.local) { g.local.vel.addScaledVector(a.dir, 12); g.local.vel.y = 5; g.local.shake(0.8); }
            }
          }
          if (Math.random() < 0.6) g.fx.smoke.spawn(e.pos.x, 0.2, e.pos.z, rand(-1, 1), 1, rand(-1, 1), 0.3, 0.27, 0.24, 0.6, 0.8, 0, 1, 1, 0.5);
        }
        break;
      case 'flee':
        if (e.pos.distanceTo(a.dest) < 3 || a.t > 6) { this.action = null; this._beginRegen(); }
        else { a.dir = new THREE.Vector3(a.dest.x - e.pos.x, 0, a.dest.z - e.pos.z).normalize(); }
        break;
      case 'stunned':
        this.exposedT = Math.max(this.exposedT, a.dur - a.t);
        break;
    }
  }

  _endAction(a) {
    this.action = null;
    if (a.kind === 'roar' && this.phase === 2 && !this.fled) {
      this.fled = true;
      // huye a un acceso lejano para regenerarse
      const players = this.game.getPlayers();
      const spawns = this.game.world.def.spawns.filter((s) => !s.vent);
      let best = spawns[0], bd = -1;
      for (const s of spawns) { const d = Math.min(...players.map((p) => Math.hypot(p.pos.x - s.exit[0], p.pos.z - s.exit[1]))); if (d > bd) { bd = d; best = s; } }
      const dest = new THREE.Vector3(best.exit[0], 0, best.exit[1]);
      this.start('flee', 7, { dest, dir: new THREE.Vector3() });
      this.game.enemies._setCloak(this.e, true);
      audio.play('cloak', { pos: this.e.pos, volume: 1 });
      this.warn('¡EL PRIMOGÉNITO SE OCULTA PARA REGENERARSE! ¡ENCUÉNTRALO!');
    }
  }

  _beginRegen() {
    const e = this.e;
    this.regen = { t: 0, hp0: e.hp };
    this.exposedT = 10;
    e.state = STATE.SPECIAL; e.special = 'boss_regen';
    this.game.enemies._setCloak(e, false);
    audio.play('boss_roar2', { pos: e.pos, volume: 1, priority: true, rate: 0.8, ref: 10 });
    this.game.waves.spawnMinions(5, ['rastrero', 'rastrero', 'acechador']);
    this.action = { kind: 'regen', t: 0, dur: 99, done: false };
  }
  _endRegen() {
    this.regen = null;
    this.action = null;
    this.exposedT = 0;
    this.warn('¡Regeneración interrumpida!');
    audio.play('rage', { pos: this.e.pos, volume: 1, priority: true, rate: 0.6 });
  }

  _stun(dur, exposed) {
    this.action = { kind: 'stunned', t: 0, dur, done: false };
    this.e.state = STATE.STUN; this.e.special = 'boss_stunned';
    if (exposed) { this.exposedT = dur; this.warn('¡CORAZÓN EXPUESTO! ¡DISPARA AL PECHO!'); }
    this.game.net?.hostEvent('boss', { a: 'stunned', d: dur });
  }

  _enterPhase(n) {
    this.phase = n;
    this.invulnT = 2.5;
    this.start('roar', 2.5);
    audio.play('boss_roar', { pos: this.e.pos, volume: 1, priority: true, ref: 14, maxDist: 200, rate: n === 3 ? 1.1 : 0.95 });
    this.game.local.shake(0.7);
    bus.emit('bossPhase', { phase: n, name: this.e.def.name });
    this.game.net?.hostEvent('bphase', { p: n });
    if (n === 3) this.e.speedMul *= 1.2;
  }

  // Poses específicas del jefe (se aplican después de la animación genérica)
  animate(e, dt) {
    const j = e.model.j;
    const sp = e.special || '';
    const t = e.specialT || 0;
    if (j.chestL && j.chestR) {
      const open = this.exposedT > 0 || sp === 'boss_regen' || sp === 'boss_stunned' ? 1 : 0;
      j.chestL.rotation.y = damp(j.chestL.rotation.y, -open * 1.3, 6, dt);
      j.chestR.rotation.y = damp(j.chestR.rotation.y, open * 1.3, 6, dt);
    }
    const core = e.model.root.getObjectByName('core');
    if (core) {
      core.scale.setScalar(this.exposedT > 0 ? 1.4 + Math.sin(performance.now() * 0.02) * 0.25 : 0.8);
      core.getWorldPosition(this.coreWorld);
    }
    if (e.state === STATE.CHASE) return;
    if (sp === 'boss_roar') { j.head.rotation.x = -0.7; j.armL.rotation.set(-0.6, 0, -1.2); j.armR.rotation.set(-0.6, 0, 1.2); j.torso.rotation.x = -0.25 + Math.sin(t * 30) * 0.03; }
    else if (sp === 'boss_spikes') { const w = Math.min(1, t / 0.9); j.armR.rotation.x = -2.8 * w + (t > 0.95 ? 2.4 : 0); j.torso.rotation.y = 0.4 * w - (t > 0.95 ? 0.8 : 0); }
    else if (sp === 'boss_slam') { const w = Math.min(1, t / 1.2); const hit = t > 1.25 ? 1 : 0; j.armL.rotation.x = -3 * w + hit * 3.2; j.armR.rotation.x = -3 * w + hit * 3.2; j.torso.rotation.x = -0.3 * w + hit * 0.8; }
    else if (sp === 'boss_swipe') { const w = Math.min(1, t / 0.5); j.armL.rotation.x = -2.2 * w + (t > 0.55 ? 2.6 : 0); j.torso.rotation.y = -0.6 * w + (t > 0.55 ? 1 : 0); }
    else if (sp === 'boss_summon') { j.armL.rotation.set(-2.9, 0, -0.4); j.armR.rotation.set(-2.9, 0, 0.4); j.head.rotation.x = -0.8; }
    else if (sp === 'boss_orbs') { j.torso.rotation.x = -0.4; j.head.rotation.x = -0.5; }
    else if (sp === 'boss_charge') { j.torso.rotation.x = 0.7; j.armL.rotation.x = 0.6; j.armR.rotation.x = 0.6; j.head.rotation.x = 0.3; }
    else if (sp === 'boss_regen' || sp === 'boss_stunned') { j.torso.rotation.x = 0.55 + Math.sin(t * 2) * 0.05; j.armL.rotation.x = 0.3; j.armR.rotation.x = 0.3; j.head.rotation.x = 0.6; }
  }
}

export { pick };
