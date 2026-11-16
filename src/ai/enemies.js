// Gestor de enemigos: IA (persecución por campos de flujo, flanqueo, rodeo), ataques
// especiales por tipo, daño por zonas, estados alterados, animación procedural, gore y pooling.
// En cooperativo el anfitrión ejecuta la IA y los clientes reciben "marionetas" interpoladas.
import * as THREE from 'three';
import { ENEMIES } from './enemyDefs.js';
import { buildEnemyModel, cloakMaterial } from '../render/enemyModels.js';
import { raySphere } from '../world/collision.js';
import { audio } from '../audio/audio.js';
import { bus } from '../core/events.js';
import { angleDiff, clamp, damp, rand, chance, uid, pick } from '../core/utils.js';

const STATE = { SPAWN: 0, CHASE: 1, ATTACK: 2, FLINCH: 3, STUN: 4, LEAP: 5, SPECIAL: 6, DOOR: 7, RETREAT: 8, DEAD: 9, CHARGE: 10, PANIC: 11 };
export { STATE };

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class Enemy {
  constructor(def, model, mgr) {
    this.def = def; this.type = def.id; this.model = model; this.mgr = mgr;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.headWorld = new THREE.Vector3();
    this.bodyWorld = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._c = new THREE.Vector3();
    this.reset();
  }
  reset() {
    this.id = 0; this.dead = false; this.removed = false;
    this.state = STATE.SPAWN; this.stateT = 0;
    this.yaw = 0; this.animT = Math.random() * 10; this.moveBlend = 0;
    this.attackCd = rand(0.2, 0.8); this.attackT = 0; this.attackHit = false;
    this.specialCd = rand(1.5, 4); this.leapCd = rand(1, 3);
    this.stumbleAcc = 0; this.flinchT = 0; this.stunT = 0;
    this.burnT = 0; this.burnDps = 0; this.burnOwner = null; this.poisonT = 0;
    this.slowT = 0; this.rallyT = 0; this.panicT = 0;
    this.raging = false; this.recentDmg = []; this.rageHits = 0;
    this.cloaked = !!this.def.cloak; this.revealT = 0;
    this.decapitated = false;
    this.target = null; this.targetT = 0;
    this.role = this.def.flanker ? 'flank' : (Math.random() < 0.35 ? 'flank' : 'direct');
    this.slot = Math.random() * Math.PI * 2;
    this.stuckT = 0; this.lastPos = new THREE.Vector3();
    this.doorTarget = null;
    this.vocalT = rand(2, 7);
    this.netPos = null; this.netYaw = 0;
    this.lastHitBy = null; this.damagers = new Map();
    this.headArmor = this.def.headArmor || 0;
    this.corpseT = 0;
    this.falling = 0;
    this.grabT = 0;
    this.objectiveBias = 0;
    this.shockT = 0;
    this.visualState = 0;
  }
  center() { return this._c.set(this.pos.x, this.pos.y + this.def.height * (this.def.model.build === 'crawler' ? 0.45 : 0.55) * (this.def.model.scale || 1), this.pos.z); }
  headPos() { return this.headWorld; }
  get alive() { return !this.dead; }
}

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.scene = game.renderer.scene;
    this.alive = [];
    this.corpses = [];
    this.byId = new Map();
    this.pools = new Map();
    this.fields = new Map(); // playerId -> {direct, flank, t}
    this.fieldTimer = 0;
    this.fieldQueue = [];
    this.totalKilled = 0;
    this.authority = true;
    this.hpMult = 1; this.dmgMult = 1; this.speedMult = 1;
    this.playerScale = 1;
    this.frame = 0;
  }

  // ------------------------------------------------------------ creación / pooling
  _getModel(type) {
    const pool = this.pools.get(type) || [];
    this.pools.set(type, pool);
    if (pool.length) return pool.pop();
    return buildEnemyModel(ENEMIES[type]);
  }
  _releaseModel(e) {
    const m = e.model;
    this.scene.remove(m.root);
    // restaurar visibilidad/materiales
    m.root.traverse((o) => { o.visible = true; if (o.isMesh && o.userData.baseMat) o.material = o.userData.baseMat; });
    m.root.rotation.set(0, 0, 0); m.body.rotation.set(0, 0, 0); m.body.position.set(0, 0, 0);
    m.root.scale.setScalar(1);
    this.pools.get(e.type).push(m);
  }

  spawn(type, x, z, opts = {}) {
    const def = ENEMIES[type];
    if (!def) return null;
    const model = this._getModel(type);
    const e = new Enemy(def, model, this);
    e.id = opts.id || uid();
    e.pos.set(x, opts.y || 0, z);
    e.lastPos.copy(e.pos);
    const diff = this.game.diff;
    const hpScale = def.big ? 1 + (this.playerScale - 1) * 0.75 : 1 + (this.playerScale - 1) * 0.45;
    e.maxHp = def.hp * (diff?.hp || 1) * hpScale * (opts.hpMult || 1);
    e.hp = e.maxHp;
    e.headHp = def.headFrac > 0 ? e.maxHp * def.headFrac : Infinity;
    e.speedMul = (diff?.speed || 1) * rand(0.92, 1.08);
    e.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    e.state = opts.vent ? STATE.SPAWN : STATE.CHASE;
    e.stateT = opts.vent ? 0.9 : 0;
    e.spawnFrom = opts.exit ? new THREE.Vector3(opts.exit[0], 0, opts.exit[1]) : null;
    e.puppet = !this.authority;
    e.elite = !!opts.elite;
    if (opts.objectiveBias) e.objectiveBias = opts.objectiveBias;
    model.root.position.copy(e.pos);
    model.root.rotation.y = e.yaw;
    if (opts.vent) model.root.position.y = -1.5;
    this.scene.add(model.root);
    if (e.cloaked) this._setCloak(e, true);
    this.alive.push(e);
    this.byId.set(e.id, e);
    if (opts.vent) audio.play('vent', { pos: e.pos, volume: 0.7 });
    if (this.authority) this.game.net?.hostEvent('espawn', { id: e.id, t: type, x: +x.toFixed(2), z: +z.toFixed(2), y: e.yaw, v: opts.vent ? 1 : 0, hp: Math.round(e.maxHp) });
    return e;
  }

  clear() {
    for (const e of this.alive) this._releaseModel(e);
    for (const e of this.corpses) this._releaseModel(e);
    this.alive.length = 0; this.corpses.length = 0; this.byId.clear();
  }

  // ------------------------------------------------------------ campos de flujo
  _updateFields(dt, players) {
    this.fieldTimer -= dt;
    if (this.fieldTimer > 0) return;
    this.fieldTimer = 0.08;
    const nav = this.game.world.nav;
    // cola de trabajos: un campo (directo o de flanqueo) por tick para repartir el coste
    if (!this.fieldQueue.length) for (const p of players) if (p.alive && !p.downed) this.fieldQueue.push([p.id, 'direct'], [p.id, 'flank']);
    const job = this.fieldQueue.shift();
    if (!job) return;
    const [pid, kind] = job;
    const p = players.find((q) => q.id === pid);
    if (!p) return;
    let f = this.fields.get(pid);
    if (!f) { f = { direct: new Float32Array(nav.N), flank: new Float32Array(nav.N), t: 0 }; this.fields.set(pid, f); }
    const seeds = [];
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const sx = p.pos.x + dx * 0.75, sz = p.pos.z + dz * 0.75;
      seeds.push([sx, sz, Math.hypot(dx, dz) * 0.75]);
    }
    if (kind === 'direct') { nav.computeField(seeds, f.direct); f.ready = true; if (!f.flankReady) f.flank.set(f.direct); return; }
    // campo de flanqueo: penaliza la zona frontal del jugador para rodearle
    if (!this.mulArr || this.mulArr.length !== nav.N) { this.mulArr = new Float32Array(nav.N).fill(1); this.mulDirty = []; }
    const mul = this.mulArr;
    for (const i of this.mulDirty) mul[i] = 1;
    this.mulDirty.length = 0;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const R = 22, c = nav.cell;
    const cx0 = Math.max(0, Math.floor((p.pos.x - R - nav.x0) / c)), cx1 = Math.min(nav.w - 1, Math.floor((p.pos.x + R - nav.x0) / c));
    const cz0 = Math.max(0, Math.floor((p.pos.z - R - nav.z0) / c)), cz1 = Math.min(nav.h - 1, Math.floor((p.pos.z + R - nav.z0) / c));
    for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) {
      const dx = nav.x0 + (x + 0.5) * c - p.pos.x, dz = nav.z0 + (z + 0.5) * c - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.5 || d > R) continue;
      if ((dx * fx + dz * fz) / d > 0.45) { const i = z * nav.w + x; mul[i] = 7; this.mulDirty.push(i); }
    }
    nav.computeField(seeds, f.flank, mul);
    f.flankReady = true;
  }

  // Coste de puertas soldadas en la navegación
  updateDoorCosts() {
    const nav = this.game.world.nav;
    const doors = this.game.world.doors;
    for (let i = 0; i < nav.N; i++) {
      const di = nav.doorAt[i];
      if (di < 0) continue;
      const d = doors[di];
      nav.extra[i] = d.blocksEnemies() ? 18 + d.weldPct * 30 : 0;
    }
  }

  // ------------------------------------------------------------ bucle
  update(dt, players) {
    this.frame++;
    if (this.authority) {
      this._updateFields(dt, players);
      if (this.frame % 30 === 0) this.updateDoorCosts();
    }
    const cam = this.game.renderer.camera.position;
    for (let i = this.alive.length - 1; i >= 0; i--) {
      const e = this.alive[i];
      if (e.puppet) this._updatePuppet(e, dt);
      else this._updateAI(e, dt, players);
      const far = e.pos.distanceToSquared(cam) > 45 * 45;
      if (!far || (this.frame + e.id) % 3 === 0) this._animate(e, far ? dt * 3 : dt);
      this._updateHitboxes(e);
    }
    if (this.authority) this._separate(dt);
    // cadáveres
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const e = this.corpses[i];
      this._updateCorpse(e, dt);
      if (e.corpseT > 14 || this.corpses.length > 26 && i === 0) {
        this._releaseModel(e);
        this.corpses.splice(i, 1);
      }
    }
  }

  _pickTarget(e, players) {
    let best = null, bd = Infinity;
    const camo = (p) => p.crouching && p.mods?.camo && p.pos.distanceTo(e.pos) > 20;
    for (const p of players) {
      if (!p.alive || p.downed || camo(p)) continue;
      const f = this.fields.get(p.id);
      let d;
      if (f?.ready) { const i = this.game.world.nav.idx(e.pos.x, e.pos.z); d = i >= 0 ? f.direct[i] : Infinity; if (!isFinite(d)) d = e.pos.distanceTo(p.pos) * 3; }
      else d = e.pos.distanceTo(p.pos);
      if (p === e.target) d *= 0.8; // histéresis
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  _updateAI(e, dt, players) {
    const def = e.def, g = this.game;
    if (def.boss && g.boss) { g.boss.updateAI(e, dt, players); return; }
    e.stateT -= dt;
    e.attackCd -= dt; e.specialCd -= dt; e.leapCd -= dt; e.vocalT -= dt;
    if (e.revealT > 0) e.revealT -= dt;
    if (e.rallyT > 0) e.rallyT -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.shockT > 0) e.shockT -= dt;
    // estados alterados
    this._statusEffects(e, dt);
    if (e.dead) return;
    // objetivo
    e.targetT -= dt;
    if (e.targetT <= 0 || !e.target || !e.target.alive || e.target.downed) { e.target = this._pickTarget(e, players); e.targetT = rand(0.8, 1.4); }
    const T = e.target;
    // camuflaje
    if (def.cloak) {
      const near = T && e.pos.distanceTo(T.pos) < Math.max(4.5, g.local.mods?.seeCloaked && T === g.local ? g.local.mods.seeCloaked : 0);
      const seen = g.local.mods?.seeCloaked && e.pos.distanceTo(g.local.pos) < g.local.mods.seeCloaked;
      const want = !(near || seen || e.revealT > 0 || e.state === STATE.ATTACK || e.burnT > 0 || e.stunT > 0);
      if (want !== e.cloaked) { this._setCloak(e, want); if (!want) audio.play('cloak', { pos: e.pos, volume: 0.5 }); }
    }
    // vocalizaciones
    if (e.vocalT <= 0) {
      e.vocalT = rand(3, 8);
      this._vocal(e, def.cloak ? 'idle' : (e.state === STATE.CHASE && e.raging ? 'attack' : 'idle'), 0.55);
    }
    let desired = null; let speed = def.speed;
    const toT = T ? _a.set(T.pos.x - e.pos.x, 0, T.pos.z - e.pos.z) : _a.set(0, 0, 0);
    const distT = T ? toT.length() : Infinity;
    const dy = T ? T.pos.y - e.pos.y : 0;
    const losCheck = (this.frame + e.id) % 6 === 0;
    if (losCheck && T) e.los = g.world.collision.lineOfSight(e.pos.x, e.pos.y + def.height * 0.8, e.pos.z, T.pos.x, T.pos.y + 1.4, T.pos.z);

    switch (e.state) {
      case STATE.SPAWN: {
        // emergiendo de un conducto o acceso
        if (e.stateT <= 0) e.state = STATE.CHASE;
        if (e.spawnFrom) { desired = _b.set(e.spawnFrom.x - e.pos.x, 0, e.spawnFrom.z - e.pos.z); if (desired.lengthSq() < 1) e.spawnFrom = null; else desired.normalize(); }
        break;
      }
      case STATE.FLINCH: case STATE.STUN: {
        if (e.stateT <= 0) e.state = STATE.CHASE;
        speed = 0;
        break;
      }
      case STATE.PANIC: {
        if (e.stateT <= 0) e.state = STATE.CHASE;
        if (T) desired = _b.copy(toT).normalize().multiplyScalar(-1);
        speed = def.runSpeed;
        break;
      }
      case STATE.ATTACK: {
        speed = def.speed * 0.25;
        if (T) desired = _b.copy(toT).normalize();
        e.attackT += dt;
        const at = def.attackTime * (e.raging ? 0.7 : 1);
        if (!e.attackHit && e.attackT >= at * 0.55) {
          e.attackHit = true;
          if (e.attackKind === 'door') {
            if (e.doorTarget) {
              const d = e.doorTarget;
              const dmg = def.dmg * (def.big ? 3 : 1.5) * (e.raging ? 1.6 : 1) * 4;
              const broke = g.damageDoor(d, dmg, e);
              audio.play('door_bang', { pos: d.center, volume: 0.8, rate: rand(0.9, 1.1), cooldown: 0.1 });
              if (broke) e.doorTarget = null;
            }
          } else if (T && distT < def.attackRange + 0.7 && Math.abs(dy) < 2.2) {
            const dmg = def.dmg * this.dmgMult * (e.raging ? 1.5 : 1) * (e.elite ? 1.3 : 1);
            g.damagePlayer(T.id, dmg, 'melee', { x: e.pos.x, y: e.pos.y, z: e.pos.z, enemy: e });
            if (def.grab && chance(0.22) && T === g.local) { g.local.grabbedBy = e; e.grabT = 1.1; }
            if (e.raging && def.rage) { e.rageHits++; if (e.type === 'coloso' && e.rageHits >= 2) { e.raging = false; e.rageHits = 0; } }
            audio.play('hit_flesh2', { pos: T.pos, volume: 0.6 });
          } else audio.play('swing', { pos: e.pos, volume: 0.35 });
        }
        if (e.attackT >= at) { e.state = STATE.CHASE; e.attackCd = def.attackTime * (e.raging ? 0.15 : 0.35); }
        break;
      }
      case STATE.DOOR: {
        speed = 0;
        const d = e.doorTarget;
        if (!d || !d.blocksEnemies()) { e.state = STATE.CHASE; e.doorTarget = null; break; }
        desired = _b.set(d.center.x - e.pos.x, 0, d.center.z - e.pos.z).normalize();
        if (e.attackCd <= 0) { e.state = STATE.ATTACK; e.attackKind = 'door'; e.attackT = 0; e.attackHit = false; this._vocal(e, 'attack', 0.5); }
        break;
      }
      case STATE.LEAP: {
        // salto balístico del Rastrero
        e.vel.y -= 16 * dt;
        e.pos.addScaledVector(e.vel, dt);
        g.world.collision.moveCylinder(e.pos, _b.set(0, 0, 0), def.radius, def.height, dt, { forEnemy: true });
        if (T && !e.attackHit && e.pos.distanceTo(T.pos) < 1.6) {
          e.attackHit = true;
          g.damagePlayer(T.id, def.leap.dmg * this.dmgMult, 'melee', { x: e.pos.x, y: e.pos.y, z: e.pos.z, enemy: e });
          if (T === g.local) g.local.shake(0.3);
        }
        if (e.pos.y <= 0.001 && e.vel.y < 0 || e.stateT <= 0) { e.pos.y = Math.max(0, e.pos.y); e.vel.set(0, 0, 0); e.state = STATE.CHASE; e.leapCd = def.leap.cd; }
        e.model.root.position.copy(e.pos);
        return;
      }
      case STATE.CHARGE: {
        speed = def.runSpeed * 1.05;
        if (T) desired = this._navDir(e, T, distT, toT) || _b.copy(toT).normalize();
        if (e.stateT <= 0 && !e.raging) e.state = STATE.CHASE;
        if (T && distT < def.attackRange && e.attackCd <= 0 && Math.abs(dy) < 2.2) this._startAttack(e);
        break;
      }
      case STATE.SPECIAL: {
        speed = 0;
        this._updateSpecial(e, dt, T, distT, toT);
        if (e.state !== STATE.SPECIAL) break;
        if (T) desired = _b.copy(toT).normalize();
        break;
      }
      case STATE.RETREAT: {
        speed = def.speed;
        if (T) desired = _b.copy(toT).normalize().multiplyScalar(-1);
        if (e.stateT <= 0 || distT > def.ranged.min + 4) e.state = STATE.CHASE;
        break;
      }
      default: { // CHASE
        if (!T) { speed = 0; break; }
        speed = (e.raging ? def.runSpeed : def.speed);
        if (distT > 14 && !def.ranged) speed = Math.max(speed, def.runSpeed * 0.85); // acelerar si está lejos
        if (def.ranged) {
          if (distT < def.ranged.min && e.los) { e.state = STATE.RETREAT; e.stateT = 1.5; break; }
          if (distT < def.ranged.max && e.los && e.specialCd <= 0) { this._beginSpecial(e, 'spit'); break; }
          if (distT < def.ranged.max * 0.7 && e.los) speed *= 0.3; // mantener distancia
        }
        if (def.leap && e.leapCd <= 0 && e.los && distT > def.leap.min && distT < def.leap.max && Math.abs(dy) < 1) {
          e.state = STATE.LEAP; e.stateT = 1.2; e.attackHit = false;
          const tt = 0.55;
          e.vel.set(toT.x / tt, 16 * tt / 2 + 1, toT.z / tt);
          this._vocal(e, 'attack', 0.7);
          break;
        }
        if (def.vomit && distT < def.vomit.range && e.los && e.specialCd <= 0) { this._beginSpecial(e, 'vomit'); break; }
        if (def.scream && distT < def.scream.range && e.los && e.specialCd <= 0) { this._beginSpecial(e, 'scream'); break; }
        if (def.rally && e.specialCd <= 0 && distT < 18) { this._beginSpecial(e, 'rally'); break; }
        if (distT < def.attackRange && e.attackCd <= 0 && Math.abs(dy) < 2.2) { this._startAttack(e); break; }
        desired = this._navDir(e, T, distT, toT);
      }
    }
    // furia
    if (def.rage && !e.raging && e.state !== STATE.STUN) {
      const now = g.time;
      e.recentDmg = e.recentDmg.filter((r) => now - r[0] < (def.rage.dmgWindow || 2));
      const sum = e.recentDmg.reduce((s, r) => s + r[1], 0);
      if (e.hp < e.maxHp * def.rage.hpFrac * (g.diff?.rageMult || 1) || (def.rage.dmgThreshold && sum > def.rage.dmgThreshold * (g.diff?.hp || 1) * (g.diff?.rageMult || 1))) this._enrage(e);
    }
    // movimiento
    let sp = speed * e.speedMul * this.speedMult;
    if (e.rallyT > 0) sp *= 1.25;
    if (e.slowT > 0) sp *= 0.6;
    if (e.burnT > 0 && !def.big) sp *= 0.85;
    const tvx = desired ? desired.x * sp : 0, tvz = desired ? desired.z * sp : 0;
    const acc = def.big ? 6 : 10;
    e.vel.x = damp(e.vel.x, tvx, acc, dt); e.vel.z = damp(e.vel.z, tvz, acc, dt);
    e.vel.y -= 18 * dt;
    // empuje por impacto
    e.vel.x += e.knock.x; e.vel.z += e.knock.z;
    e.knock.multiplyScalar(0);
    const res = g.world.collision.moveCylinder(e.pos, e.vel, def.radius, def.height * (def.model.scale || 1), dt, { forEnemy: true, stepHeight: 0.5 });
    // puertas soldadas que bloquean
    if (res.blockers && e.state === STATE.CHASE || res.blockers && e.state === STATE.CHARGE) {
      const d = res.blockers.find((b) => b.door && b.door.blocksEnemies());
      if (d) { e.doorTarget = d.door; e.state = STATE.DOOR; if (e.type === 'coloso' && e.raging) { g.damageDoor(d.door, 800, e); } }
    }
    // puertas cerradas sin soldar: las abren
    if (this.frame % 10 === e.id % 10) {
      for (const d of g.world.doors) if (d.closed && !d.destroyed && d.weld <= 0 && Math.abs(d.center.x - e.pos.x) < 1.8 && Math.abs(d.center.z - e.pos.z) < 1.8) { d.setClosed(false); audio.play('door_slide', { pos: d.center, volume: 0.5 }); g.net?.hostEvent('door', g.doorState(d)); }
    }
    // giro
    const hv = Math.hypot(e.vel.x, e.vel.z);
    if (e.state === STATE.ATTACK || e.state === STATE.SPECIAL || e.state === STATE.DOOR) {
      if (desired) e.yaw += angleDiff(e.yaw, Math.atan2(desired.x, desired.z)) * Math.min(1, dt * 8);
    } else if (hv > 0.3) e.yaw += angleDiff(e.yaw, Math.atan2(e.vel.x, e.vel.z)) * Math.min(1, dt * (def.big ? 4 : 8));
    e.moveBlend = damp(e.moveBlend, clamp(hv / Math.max(1, def.runSpeed), 0, 1.4), 8, dt);
    // atascos: si no avanza, cambia de rol/ruta
    e.stuckT += dt;
    if (e.stuckT > 2.5) {
      if (e.pos.distanceToSquared(e.lastPos) < 0.6 && e.state === STATE.CHASE && distT > 3) { e.role = e.role === 'flank' ? 'direct' : 'flank'; e.knock.set(rand(-2, 2), 0, rand(-2, 2)); }
      e.stuckT = 0; e.lastPos.copy(e.pos);
    }
    e.model.root.position.copy(e.pos);
    e.model.root.rotation.y = e.yaw;
  }

  _navDir(e, T, distT, toT) {
    const nav = this.game.world.nav;
    // persecución directa con rodeo cuando hay línea de visión y está cerca
    if (e.los && distT < 9 && Math.abs(T.pos.y - e.pos.y) < 1.2) {
      const near = clamp((distT - 1.2) / 6, 0, 1);
      const ox = Math.cos(e.slot) * near * 2.2, oz = Math.sin(e.slot) * near * 2.2;
      const d = _b.set(T.pos.x + ox - e.pos.x, 0, T.pos.z + oz - e.pos.z);
      if (d.lengthSq() < 0.01) d.copy(toT);
      return d.normalize();
    }
    const f = this.fields.get(T.id);
    if (!f?.ready) return _b.copy(toT).normalize();
    const field = e.role === 'flank' && distT > 6 ? f.flank : f.direct;
    const r = nav.descend(field, e.pos.x, e.pos.z, e.pos.y);
    if (!r) return _b.copy(toT).normalize();
    // anticipar un paso más para suavizar
    const r2 = nav.descend(field, e.pos.x + r[0] * 0.75, e.pos.z + r[1] * 0.75, e.pos.y);
    const dx = r2 ? r[0] + r2[0] : r[0], dz = r2 ? r[1] + r2[1] : r[1];
    return _b.set(dx, 0, dz).normalize();
  }

  _startAttack(e) {
    e.state = STATE.ATTACK; e.attackT = 0; e.attackHit = false; e.attackKind = 'melee';
    e.attackSide = Math.random() < 0.5 ? -1 : 1;
    this._vocal(e, 'attack', 0.6);
    if (e.def.model.saw) audio.play('saw_loop', { pos: e.pos, volume: 0.35, rate: 0.95 + Math.random() * 0.15, cooldown: 0.5 });
  }

  _enrage(e) {
    e.raging = true;
    e.rageHits = 0;
    audio.play('rage', { pos: e.pos, volume: 1, priority: true, ref: 6, rate: e.type === 'coloso' ? 0.85 : 1 });
    if (e.type === 'coloso') { e.state = STATE.STUN; e.stateT = 0.7; e.afterStun = 'charge'; }
    bus.emit('enemyRage', e);
    this.game.net?.hostEvent('erage', { id: e.id });
  }

  _beginSpecial(e, kind) {
    e.state = STATE.SPECIAL; e.special = kind; e.specialT = 0; e.specialDone = false;
    const def = e.def;
    if (kind === 'scream') { audio.play('scream', { pos: e.pos, volume: 1, priority: true, ref: 6, hrtf: true }); e.specialDur = def.scream.windup + 0.6; }
    else if (kind === 'vomit') { this._vocal(e, 'attack', 0.7); e.specialDur = 1.3; }
    else if (kind === 'spit') { this._vocal(e, 'attack', 0.6); e.specialDur = 0.9; }
    else if (kind === 'rally') { audio.play('rage', { pos: e.pos, volume: 0.6, rate: 1.3 }); e.specialDur = 0.9; }
    this.game.net?.hostEvent('espec', { id: e.id, k: kind });
  }

  _updateSpecial(e, dt, T, distT, toT) {
    const g = this.game, def = e.def;
    e.specialT += dt;
    if (e.special === 'scream') {
      if (!e.specialDone && e.specialT >= def.scream.windup) {
        e.specialDone = true;
        // daño sónico, aturdimiento, rompe soldaduras y anula proyectiles
        for (const p of g.getPlayers()) {
          if (!p.alive || p.downed) continue;
          const d = p.pos.distanceTo(e.pos);
          if (d < def.scream.range) g.damagePlayer(p.id, def.scream.dmg * this.dmgMult * (1 - d / def.scream.range * 0.5), 'sonic', { x: e.pos.x, y: e.pos.y, z: e.pos.z });
          if (p === g.local && d < def.scream.range) { g.local.shake(0.6); audio.setMuffle(0.7); g.hud?.screamFx(); }
        }
        for (const d of g.world.doors) if (d.blocksEnemies() && d.center.distanceTo(e.pos) < def.scream.range) g.damageDoor(d, 220, e);
        g.projectiles.destroyInRadius(e.pos, def.scream.range * 0.8);
        for (let i = 0; i < 30; i++) g.fx.smoke.spawn(e.pos.x, e.pos.y + 1.6, e.pos.z, rand(-6, 6), rand(-1, 2), rand(-6, 6), 0.6, 0.55, 0.6, 0.5, 0.5, 0, 3, 4, 0.25);
      }
    } else if (e.special === 'vomit') {
      if (e.specialT > 0.35 && e.specialT < 1.1) {
        const head = e.headWorld;
        const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
        for (let i = 0; i < 3; i++) g.fx.blood.spawn(head.x + fx * 0.3, head.y - 0.1, head.z + fz * 0.3, fx * rand(4, 7) + rand(-1, 1), rand(-0.5, 1.5), fz * rand(4, 7) + rand(-1, 1), 0.45, 0.8, 0.1, rand(0.1, 0.18), 0.8, 9, 0.3);
        if (!e._vomitTick || g.time - e._vomitTick > 0.25) {
          e._vomitTick = g.time;
          for (const p of g.getPlayers()) {
            if (!p.alive || p.downed) continue;
            const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z, d = Math.hypot(dx, dz);
            if (d < def.vomit.range && (dx * fx + dz * fz) / d > 0.6) {
              g.damagePlayer(p.id, def.vomit.dmg * this.dmgMult, 'acid', { x: e.pos.x, y: e.pos.y, z: e.pos.z });
              if (p === g.local) { g.local.acidT = 2.5; g.hud?.acidFx(); }
            }
          }
          if (Math.random() < 0.5) g.fx.decal('acid', e.pos.x + fx * 2.5, 0.01, e.pos.z + fz * 2.5, 0, 1, 0, rand(0.8, 1.4));
        }
        if (!e._vomSnd) { e._vomSnd = true; audio.play('acid_spit', { pos: e.pos, volume: 0.8 }); }
      }
    } else if (e.special === 'spit') {
      if (!e.specialDone && e.specialT >= 0.5 && T) {
        e.specialDone = true;
        const from = e.headWorld.clone(); from.y += 0.1;
        const aim = T.pos.clone(); aim.y += 1.1;
        // anticipación del movimiento
        if (T.vel) aim.addScaledVector(T.vel, Math.min(0.8, distT / def.ranged.speed) * 0.6);
        const vel = ballistic(from, aim, def.ranged.speed, 14);
        g.projectiles.spawn('acid', from, vel, { owner: 'enemy', stats: { dmg: def.ranged.dmg * this.dmgMult, radius: 2.2 }, dmgType: 'acid' });
        audio.play('acid_spit', { pos: e.pos, volume: 0.8 });
      }
    } else if (e.special === 'rally') {
      if (!e.specialDone && e.specialT > 0.4) {
        e.specialDone = true;
        for (const o of this.alive) if (o !== e && o.pos.distanceTo(e.pos) < 10) o.rallyT = 4;
        e.rallyT = 4;
      }
    }
    if (e.specialT >= e.specialDur) {
      e.state = STATE.CHASE; e._vomSnd = false;
      e.specialCd = e.special === 'scream' ? def.scream.cd : e.special === 'vomit' ? def.vomit.cd : e.special === 'spit' ? def.ranged.cd * rand(0.8, 1.3) : 9;
    }
  }

  _statusEffects(e, dt) {
    const g = this.game;
    if (e.burnT > 0) {
      e.burnT -= dt;
      e._burnTick = (e._burnTick || 0) + dt;
      if (e._burnTick > 0.33) {
        e._burnTick = 0;
        this.damage(e, e.burnDps * 0.33, 'body', 'fire', null, e.burnOwner, { dot: true, noBlood: true, perkMatch: true });
        if (e.dead) return;
        // propagación (talento Napalm)
        if (e.spreadFire) for (const o of this.alive) if (o !== e && o.burnT <= 0 && o.pos.distanceToSquared(e.pos) < 2.2) { o.burnT = 2; o.burnDps = e.burnDps * 0.6; o.burnOwner = e.burnOwner; }
      }
      g.fx.burn(e.pos, e.def.big ? 2 : 1);
    }
    if (e.poisonT > 0) {
      e.poisonT -= dt;
      e._poisonTick = (e._poisonTick || 0) + dt;
      if (e._poisonTick > 0.5) { e._poisonTick = 0; this.damage(e, e.poisonDps * 0.5, 'body', 'toxic', null, e.poisonOwner, { dot: true, noBlood: true, perkMatch: true }); if (e.dead) return; }
      if (Math.random() < 0.2) g.fx.glow.spawn(e.pos.x + rand(-0.3, 0.3), e.pos.y + rand(0.5, 1.6), e.pos.z + rand(-0.3, 0.3), 0, 0.5, 0, 0.3, 1, 0.3, 0.1, 0.5);
    }
    if (e.state === STATE.STUN && e.stateT <= 0 && e.afterStun === 'charge') { e.afterStun = null; e.state = STATE.CHARGE; e.stateT = 12; }
    if (e.shockT > 0 && Math.random() < 0.4) { const c = e.center(); g.fx.arc(c, _b.set(c.x + rand(-0.6, 0.6), c.y + rand(-0.8, 0.8), c.z + rand(-0.6, 0.6)), [0.6, 0.85, 1], 3, 0.15, 0.06); }
    if (e.grabT > 0) { e.grabT -= dt; if (e.grabT <= 0 && g.local.grabbedBy === e) g.local.grabbedBy = null; }
  }

  _separate(dt) {
    const A = this.alive;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.state === STATE.LEAP) continue;
      for (let j = i + 1; j < A.length; j++) {
        const b = A[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const r = a.def.radius + b.def.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = (r - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        const wa = b.def.big && !a.def.big ? 0.85 : a.def.big && !b.def.big ? 0.15 : 0.5;
        a.pos.x -= nx * push * wa * 2 * Math.min(1, dt * 20); a.pos.z -= nz * push * wa * 2 * Math.min(1, dt * 20);
        b.pos.x += nx * push * (1 - wa) * 2 * Math.min(1, dt * 20); b.pos.z += nz * push * (1 - wa) * 2 * Math.min(1, dt * 20);
      }
    }
    // no atravesar a los jugadores
    for (const p of this.game.getPlayers()) {
      if (!p.alive) continue;
      for (const a of A) {
        const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z;
        const r = a.def.radius + 0.34;
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r || d2 < 1e-6 || Math.abs(a.pos.y - p.pos.y) > 1.5) continue;
        const d = Math.sqrt(d2);
        a.pos.x += dx / d * (r - d); a.pos.z += dz / d * (r - d);
      }
    }
  }

  _setCloak(e, on) {
    e.cloaked = on;
    e.model.root.traverse((o) => { if (o.isMesh) o.material = on ? cloakMaterial : o.userData.baseMat; });
  }

  _vocal(e, kind, vol) {
    const variant = Math.floor(Math.random() * 3);
    const buf = audio.voiceBuffer(e.type, kind, variant, voiceParams(e.def, kind, variant));
    audio.play(buf, { pos: e.headWorld.lengthSq() ? e.headWorld : e.pos, volume: vol, rate: rand(0.92, 1.08) * (e.raging ? 1.1 : 1), hrtf: e.def.cloak, maxDist: 55 });
  }

  // ------------------------------------------------------------ marionetas (cliente)
  _updatePuppet(e, dt) {
    if (e.netPos) {
      e.pos.lerp(e.netPos, Math.min(1, dt * 12));
      e.yaw += angleDiff(e.yaw, e.netYaw) * Math.min(1, dt * 10);
      const v = e.netPos.clone().sub(e.pos);
      e.moveBlend = damp(e.moveBlend, clamp((e.netSpeed || 0) / Math.max(1, e.def.runSpeed), 0, 1.4), 8, dt);
      void v;
    }
    if (e.def.cloak) {
      const g = this.game;
      const want = e.netCloak && !(e.pos.distanceTo(g.local.pos) < Math.max(4.5, g.local.mods?.seeCloaked || 0)) && e.revealT <= 0;
      if (want !== e.cloaked) this._setCloak(e, want);
      if (e.revealT > 0) e.revealT -= dt;
    }
    if (e.burnT > 0) { e.burnT -= dt; this.game.fx.burn(e.pos, 1); }
    e.state = e.netState ?? e.state;
    if (e.state === STATE.ATTACK) e.attackT += dt;
    if (e.state === STATE.SPECIAL) e.specialT = (e.specialT || 0) + dt;
    e.model.root.position.copy(e.pos);
    e.model.root.rotation.y = e.yaw;
  }

  applySnapshot(list) {
    // list: [id, x, z, y(pos y), yaw, state, hpFrac, flags, speed]
    for (const s of list) {
      const e = this.byId.get(s[0]);
      if (!e || e.dead) continue;
      if (!e.netPos) e.netPos = new THREE.Vector3(s[1], s[3], s[2]);
      else e.netPos.set(s[1], s[3], s[2]);
      e.netYaw = s[4];
      if (e.netState !== s[5]) { e.netState = s[5]; if (s[5] === STATE.ATTACK) e.attackT = 0; if (s[5] === STATE.SPECIAL) e.specialT = 0; }
      e.hp = s[6] * e.maxHp;
      e.raging = !!(s[7] & 1); e.netCloak = !!(s[7] & 2); if (s[7] & 4) e.burnT = 0.5;
      e.netSpeed = s[8];
    }
  }

  snapshot() {
    return this.alive.map((e) => [e.id, +e.pos.x.toFixed(2), +e.pos.z.toFixed(2), +e.pos.y.toFixed(2), +e.yaw.toFixed(2), e.state, +(e.hp / e.maxHp).toFixed(3), (e.raging ? 1 : 0) | (e.cloaked ? 2 : 0) | (e.burnT > 0 ? 4 : 0), +Math.hypot(e.vel.x, e.vel.z).toFixed(1)]);
  }

  // ------------------------------------------------------------ animación
  _animate(e, dt) {
    const { j, body } = e.model;
    const def = e.def;
    const mb = e.moveBlend;
    e.animT += dt * (1.5 + mb * 6.5) * (def.big ? 0.75 : 1);
    const t = e.animT;
    const s = Math.sin(t), c = Math.cos(t);
    // pisadas pesadas de los grandes (Desgarrador, Coloso, Primogénito)
    if (def.big && mb > 0.3) {
      const half = Math.floor(t / Math.PI);
      if (half !== e._stepHalf) { e._stepHalf = half; audio.play('step_heavy', { pos: e.pos, volume: 0.35 + mb * 0.3, rate: (def.boss ? 0.7 : 0.85) + Math.random() * 0.1, maxDist: 40, reverbAmt: 0.5 }); }
    }
    const crawler = def.model.build === 'crawler';
    if (crawler) {
      const amp = 0.4 + mb * 0.6;
      j.armL.rotation.x = -1.3 + s * amp; j.armR.rotation.x = -1.3 - s * amp;
      j.legL.rotation.x = -0.9 - s * amp; j.legR.rotation.x = -0.9 + s * amp;
      j.hips.position.y = 0.55 + Math.abs(c) * 0.06 * mb;
      j.torso.rotation.z = s * 0.08;
      j.head.rotation.y = Math.sin(t * 0.7) * 0.3;
    } else {
      const amp = 0.25 + mb * 0.55;
      j.legL.rotation.x = s * amp; j.legR.rotation.x = -s * amp;
      j.shinL.rotation.x = Math.max(0, -c) * amp * 1.2; j.shinR.rotation.x = Math.max(0, c) * amp * 1.2;
      j.hips.position.y = (def.model.build === 'tank' ? 0.95 : def.model.build === 'boss' ? 1.05 : 0.9) + Math.abs(c) * 0.04 * (0.5 + mb);
      j.hips.rotation.y = s * 0.12 * mb;
      const zombieReach = def.id.startsWith('putrido') ? 1.2 : 0;
      j.armL.rotation.x = -zombieReach + -s * amp * 0.7; j.armR.rotation.x = -zombieReach + s * amp * 0.7;
      j.armL.rotation.z = -0.1; j.armR.rotation.z = 0.1;
      j.foreL.rotation.x = -0.3 - mb * 0.4; j.foreR.rotation.x = -0.3 - mb * 0.4;
      j.torso.rotation.y = -s * 0.1 * mb;
      j.head.rotation.set(Math.sin(t * 0.5) * 0.1, Math.sin(t * 0.37) * 0.2, Math.sin(t * 0.81) * 0.12);
      if (e.raging) { j.torso.rotation.x = (def.model.hunch || 0.25) + 0.35; j.armL.rotation.x = -0.5 - s * 0.9; j.armR.rotation.x = -0.5 + s * 0.9; }
      else j.torso.rotation.x = (def.model.hunch || (def.model.build === 'brute' || def.model.build === 'tank' ? 0.25 : 0.15)) + mb * 0.15;
    }
    // ataque
    if (e.state === STATE.ATTACK) {
      const at = def.attackTime * (e.raging ? 0.7 : 1);
      const p = clamp(e.attackT / at, 0, 1);
      const wind = p < 0.5 ? p / 0.5 : 1, strike = p < 0.5 ? 0 : Math.min(1, (p - 0.5) / 0.15), rec = p > 0.7 ? (p - 0.7) / 0.3 : 0;
      const arm = (e.attackSide || 1) > 0 ? j.armR : j.armL;
      if (crawler) { j.torso.rotation.x = 1.25 - wind * 0.4 + strike * 0.6; arm.rotation.x = -1.3 - wind * 1.2 + strike * 1.8; }
      else if (def.model.saw) { j.armR.rotation.x = -1.2 - Math.sin(e.attackT * 30) * 0.3; j.armR.rotation.z = 0.3; j.torso.rotation.y = -wind * 0.5 + strike * 0.8; }
      else {
        arm.rotation.x = -wind * 2.6 + strike * 2.2 - rec * 0.2;
        arm.rotation.z = (arm === j.armR ? 1 : -1) * (0.2 + wind * 0.3);
        j.torso.rotation.y = (arm === j.armR ? 1 : -1) * (wind * 0.4 - strike * 0.8);
        j.torso.rotation.x += strike * 0.25;
      }
    }
    if (e.state === STATE.SPECIAL) {
      const k = e.special;
      const p = e.specialT || 0;
      if (k === 'scream') { j.head.rotation.x = -0.6 * Math.min(1, p * 2); j.torso.rotation.x = -0.2; j.armL.rotation.x = -0.4; j.armR.rotation.x = -0.4; j.armL.rotation.z = -0.9; j.armR.rotation.z = 0.9; }
      else if (k === 'vomit') { j.torso.rotation.x = 0.5; j.head.rotation.x = 0.4; }
      else if (k === 'spit') { j.torso.rotation.x = -0.25 + (p > 0.5 ? 0.6 : 0); j.head.rotation.x = -0.4 + (p > 0.5 ? 0.7 : 0); }
      else if (k === 'rally') { j.armL.rotation.x = -2.6; j.armR.rotation.x = -2.6; j.head.rotation.x = -0.5; }
    }
    if (e.state === STATE.FLINCH) { j.torso.rotation.x -= 0.5 * Math.min(1, e.stateT * 3); j.head.rotation.x -= 0.4; }
    if (e.state === STATE.STUN) { j.torso.rotation.z = Math.sin(t * 3) * 0.25; j.head.rotation.x = 0.5; j.armL.rotation.x = 0.2; j.armR.rotation.x = 0.2; }
    if (e.state === STATE.DOOR && !crawler) { j.armL.rotation.x = -1.6; j.armR.rotation.x = -1.6; }
    if (e.state === STATE.LEAP) { j.armL.rotation.x = -2.8; j.armR.rotation.x = -2.8; j.legL.rotation.x = 0.4; j.legR.rotation.x = 0.4; }
    if (j.saw) j.saw.rotation.y += dt * (e.state === STATE.ATTACK ? 40 : 6);
    // emergiendo de un conducto
    if (e.state === STATE.SPAWN && e.model.root.position.y < 0) e.model.root.position.y = Math.min(0, -1.5 * (e.stateT / 0.9));
    // élite: brillo
    if (e.raging && Math.random() < 0.3) this.game.fx.glow.spawn(e.headWorld.x, e.headWorld.y, e.headWorld.z, 0, 0.5, 0, 1, 0.2, 0.05, 0.12, 0.3);
    body.position.y = 0;
    if (def.boss && this.game.boss) this.game.boss.animate(e, dt);
  }

  _updateHitboxes(e) {
    const j = e.model.j;
    e.model.root.updateMatrixWorld(true);
    if (!e.decapitated) j.head.getWorldPosition(e.headWorld);
    const s = e.def.model.scale || 1;
    e.headR = (e.def.model.build === 'brute' || e.def.model.build === 'tank' || e.def.model.build === 'boss' ? 0.26 : e.def.model.build === 'bloated' ? 0.22 : 0.19) * s;
    e.headWorld.y += e.headR * 0.5;
    j.torso.getWorldPosition(e.bodyWorld[0]);
    j.hips.getWorldPosition(e.bodyWorld[1]);
    e.bodyWorld[2].lerpVectors(e.bodyWorld[0], e.headWorld, 0.5);
    if (e.def.model.build === 'crawler') { e.bodyWorld[0].lerpVectors(e.bodyWorld[1], e.headWorld, 0.33); e.bodyWorld[2].lerpVectors(e.bodyWorld[1], e.headWorld, 0.66); }
    else { e.bodyWorld[0].y += 0.3 * s; }
    const build = e.def.model.build;
    e.bodyR = (build === 'tank' || build === 'boss' ? 0.6 : build === 'brute' ? 0.45 : build === 'bloated' ? 0.55 : build === 'crawler' ? 0.25 : 0.3) * s;
  }

  // Rayo contra hitboxes. Devuelve [{enemy, t, zone}] ordenado por distancia
  raycast(o, d, maxT, extra = 0) {
    const out = [];
    for (const e of this.alive) {
      if (e.dead) continue;
      const c = e.center();
      const R = e.def.height * (e.def.model.scale || 1) * 0.8 + 0.5;
      const tc = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, c.x, c.y, c.z, R);
      if (tc < 0 || tc > maxT + R) continue;
      let best = Infinity, zone = null;
      if (!e.decapitated && e.def.headFrac > 0 || e.def.boss) {
        const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, e.headWorld.x, e.headWorld.y, e.headWorld.z, e.headR + extra);
        if (th >= 0 && th < best) { best = th; zone = 'head'; }
      }
      for (const b of e.bodyWorld) {
        const tb = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, b.x, b.y, b.z, e.bodyR + extra);
        if (tb >= 0 && tb < best - 0.02) { best = tb; zone = 'body'; }
      }
      // piernas (esfera baja)
      const legs = _b.set(e.pos.x, e.pos.y + 0.45 * (e.def.model.scale || 1), e.pos.z);
      const tl = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, legs.x, legs.y, legs.z, e.bodyR * 0.85 + extra);
      if (tl >= 0 && tl < best - 0.02) { best = tl; zone = 'legs'; }
      if (e.def.boss && this.game.boss) { const z2 = this.game.boss.zoneFor(e, o, d, best, zone); if (z2) zone = z2; }
      if (zone && best <= maxT) out.push({ enemy: e, t: best, zone });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  // ------------------------------------------------------------ daño
  // Devuelve {dealt, killed, headshot}
  damage(e, amount, zone, type, dir, shooter, opts = {}) {
    if (e.dead) return { dealt: 0 };
    const g = this.game, def = e.def;
    let dmg = amount * (def.resist[type] ?? 1);
    let headshot = false;
    if (e.def.boss && g.boss) dmg = g.boss.modifyDamage(e, dmg, zone, type);
    if (zone === 'head' && !e.def.boss) {
      if (type === 'fire' && !opts.fireHead) dmg *= 1; else dmg *= opts.headMult || 1.5;
      if (e.headArmor > 0) {
        const absorbed = Math.min(e.headArmor, dmg * 0.8);
        e.headArmor -= absorbed; dmg -= absorbed;
        audio.play('hit_armor', { pos: e.headWorld, volume: 0.6, cooldown: 0.05 });
        if (e.headArmor <= 0) { const h = e.model.root.getObjectByName('helmet'); if (h) h.visible = false; audio.play('hit_metal', { pos: e.headWorld, volume: 0.8 }); g.fx.impact(e.headWorld, [0, 1, 0], 'metal'); }
      }
      headshot = true;
      e.headHp -= dmg;
    } else if (zone === 'legs') dmg *= 0.75;
    if (opts.eliteMult && (def.id === 'putrido_alfa' || def.id === 'aullador' || def.id === 'desgarrador' || def.id === 'acechador')) dmg *= opts.eliteMult;
    if (opts.bigMult && (def.big)) dmg *= opts.bigMult;
    e.hp -= dmg;
    e.revealT = 1.5;
    e.lastHitBy = shooter;
    e.damagers.set(shooter, (e.damagers.get(shooter) || 0) + dmg);
    if (def.rage) e.recentDmg.push([g.time, dmg]);
    // efectos de impacto
    if (!opts.noBlood && dir && opts.point) {
      g.fx.bloodHit(opts.point, dir, headshot ? 1.6 : clamp(dmg / 40, 0.4, 2), def.id === 'vesicula' || def.id === 'escupidor' ? [0.35, 0.6, 0.08] : [0.5, 0.02, 0.02]);
      if (Math.random() < 0.3) {
        // salpicadura en pared o suelo cercano
        const wh = g.world.collision.raycast(opts.point.x, opts.point.y, opts.point.z, dir.x, dir.y - 0.3, dir.z, 3);
        if (wh) { const hp = opts.point.clone().addScaledVector(_b.set(dir.x, dir.y - 0.3, dir.z), wh.t); g.fx.decal(Math.random() < 0.5 ? 'blood' : 'blood2', hp.x, hp.y, hp.z, wh.normal[0], wh.normal[1], wh.normal[2], rand(0.4, 1)); }
      }
    }
    if (!opts.dot && headshot) audio.play('headshot', { pos: e.headWorld, volume: 0.5, cooldown: 0.03 });
    else if (!opts.dot && Math.random() < 0.5) audio.play('hit_flesh', { pos: e.pos, volume: 0.4, cooldown: 0.04 });
    // fuego, veneno, aturdimiento
    if (opts.burn && type === 'fire') {
      const wasBurning = e.burnT > 0;
      e.burnT = Math.max(e.burnT, 3.5); e.burnDps = Math.max(e.burnDps, opts.burn * (def.resist.fire || 1)); e.burnOwner = shooter;
      if (!wasBurning) audio.play('fire_ignite', { pos: e.pos, volume: 0.5, cooldown: 0.1 });
      if (shooter === g.local.id && g.local.mods?.spreadFire) e.spreadFire = true;
      if (shooter === g.local.id && g.local.mods?.firePanic && !def.big && !wasBurning && Math.random() < 0.5 && this.authority) { e.state = STATE.PANIC; e.stateT = 1.4; }
    }
    if (opts.poison) { e.poisonT = 4; e.poisonDps = opts.poison; e.poisonOwner = shooter; if (g.local.mods?.poisonSlow) e.slowT = 3; }
    if (type === 'electric') e.shockT = 0.4;
    const stunPower = (shooter === g.local.id ? (g.local.mods?.stunPower || 1) : 1);
    if (opts.stun && this.authority && !def.boss) {
      const resist = def.big ? 0.35 : 1;
      if (Math.random() < resist && e.state !== STATE.LEAP) { e.state = STATE.STUN; e.stateT = Math.max(e.stateT, opts.stun * stunPower * (def.big ? 0.6 : 1)); if (shooter === g.local.id) g.addPerkXp('tesla', 2); }
    }
    // tambaleo
    if (this.authority && !e.def.boss) {
      e.stumbleAcc += (opts.stumble || 0) * (headshot ? 1.5 : 1);
      const thr = def.big ? (e.raging ? 14 : 8) : def.id === 'vesicula' ? 3 : 1.2;
      if (e.stumbleAcc >= thr && e.state !== STATE.LEAP && e.state !== STATE.STUN) {
        e.stumbleAcc = 0;
        e.state = STATE.FLINCH; e.stateT = def.big ? 0.5 : 0.35;
        if (dir && opts.knockback) e.knock.set(dir.x * opts.knockback * (def.big ? 0.2 : 1), 0, dir.z * opts.knockback * (def.big ? 0.2 : 1));
        if (Math.random() < 0.5) this._vocal(e, 'pain', 0.5);
      }
      e.stumbleAcc = Math.max(0, e.stumbleAcc - 0.02);
      // aturdimiento por disparos a la cabeza en semi-tanques
      if (headshot && (def.stunnable || (g.local.mods?.headStun && shooter === g.local.id)) && dmg > e.maxHp * 0.12 && e.state !== STATE.STUN) {
        e.state = STATE.STUN; e.stateT = 1.4; audio.play('stun', { pos: e.pos, volume: 0.6 });
      }
      if (opts.explosion && g.local.mods?.explStun && shooter === g.local.id) { e.state = STATE.STUN; e.stateT = g.local.mods.explStun * (def.big ? 0.5 : 1); }
    }
    bus.emit('enemyDamaged', { enemy: e, dmg, zone, headshot, shooter, type, weapon: opts.weapon, perkMatch: opts.perkMatch });
    // muerte
    const decap = e.headHp <= 0 && !e.decapitated && def.headFrac > 0;
    if (decap) { e.decapitated = true; this._decapitate(e, dir); }
    if (e.hp <= 0 || decap) {
      this.kill(e, { shooter, headshot: decap || headshot, type, dir, explosion: opts.explosion, gib: opts.gib || (opts.explosion && dmg > e.maxHp * 0.9 && !def.big), weapon: opts.weapon, perkMatch: opts.perkMatch });
      return { dealt: dmg, killed: true, headshot };
    }
    return { dealt: dmg, killed: false, headshot };
  }

  _decapitate(e, dir) {
    const g = this.game;
    const head = e.model.j.head;
    head.visible = false;
    const hm = new THREE.Mesh(new THREE.SphereGeometry(e.headR * 0.85, 8, 6), e.model.mats.skin);
    const v = new THREE.Vector3(dir ? dir.x * 4 : rand(-2, 2), rand(3, 6), dir ? dir.z * 4 : rand(-2, 2));
    g.fx.debris.spawn(hm, e.headWorld, v, new THREE.Vector3(rand(-10, 10), rand(-10, 10), rand(-10, 10)), 8, true, g.world.collision);
    g.fx.bloodBurst(e.headWorld, 0.7);
    audio.play('gib', { pos: e.headWorld, volume: 0.8 });
    e.neckBleed = 1.2;
  }

  kill(e, info) {
    if (e.dead) return;
    const g = this.game;
    e.dead = true;
    e.state = STATE.DEAD;
    e.deathInfo = info;
    this.alive.splice(this.alive.indexOf(e), 1);
    this.byId.delete(e.id);
    this.totalKilled++;
    if (e.cloaked) this._setCloak(e, false);
    if (g.local.grabbedBy === e) g.local.grabbedBy = null;
    // explosión de la Vesícula si no fue decapitada
    if (e.def.burst && !e.decapitated && this.authority) {
      setTimeout(() => g.combat.explode(e.center().clone(), e.def.burst.radius, e.def.burst.dmg * this.dmgMult, 'acid', 'enemy'), 120);
      for (let i = 0; i < 3; i++) g.fx.decal('acid', e.pos.x + rand(-1.5, 1.5), 0.01, e.pos.z + rand(-1.5, 1.5), 0, 1, 0, rand(1, 2));
    }
    this._vocal(e, 'death', 0.7);
    if (info.gib) {
      // despedazado
      g.fx.bloodBurst(e.center(), e.def.big ? 2 : 1.4);
      audio.play('gib', { pos: e.pos, volume: 1 });
      const c = e.center();
      for (let i = 0; i < 6; i++) {
        const sz = rand(0.1, 0.22) * (e.def.model.scale || 1);
        const m = new THREE.Mesh(new THREE.BoxGeometry(sz, sz * rand(0.8, 2), sz), Math.random() < 0.6 ? e.model.mats.skin : e.model.mats.gore);
        const v = new THREE.Vector3(rand(-7, 7), rand(3, 10), rand(-7, 7));
        if (info.dir) v.addScaledVector(info.dir, 5);
        g.fx.debris.spawn(m, c.clone().add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.4, 0.4), rand(-0.3, 0.3))), v, new THREE.Vector3(rand(-15, 15), rand(-15, 15), rand(-15, 15)), 7, true, g.world.collision);
      }
      this._releaseModel(e);
    } else {
      e.corpseT = 0;
      e.fallDir = info.dir ? Math.atan2(info.dir.x, info.dir.z) : e.yaw + Math.PI;
      e.fallVel = new THREE.Vector3(info.dir ? info.dir.x * (info.explosion ? 6 : 2) : 0, info.explosion ? 5 : 0, info.dir ? info.dir.z * (info.explosion ? 6 : 2) : 0);
      e.fallSide = Math.random() < 0.5 ? -1 : 1;
      this.corpses.push(e);
    }
    g.onEnemyKilled(e, info);
  }

  // Cadáver con caída física simple ("ragdoll" ligero)
  _updateCorpse(e, dt) {
    e.corpseT += dt;
    const { root, body, j } = e.model;
    const t = clamp(e.corpseT / 0.55, 0, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    // girar la raíz hacia la dirección de caída
    root.rotation.y = e.fallDir + Math.PI;
    body.rotation.x = -ease * Math.PI / 2 * (e.def.model.build === 'crawler' ? 0.2 : 0.96);
    body.rotation.z = ease * 0.25 * e.fallSide;
    body.position.y = ease * 0.12 + (e.def.model.build === 'crawler' ? 0 : ease * (e.def.radius * 0.6));
    if (e.fallVel) {
      e.fallVel.y -= 18 * dt;
      e.pos.addScaledVector(e.fallVel, dt);
      if (e.pos.y < 0) { e.pos.y = 0; e.fallVel.y = 0; e.fallVel.x *= 0.85; e.fallVel.z *= 0.85; }
      e.fallVel.x *= Math.max(0, 1 - dt * 3); e.fallVel.z *= Math.max(0, 1 - dt * 3);
      this.game.world.collision.moveCylinder(e.pos, _b.set(0, 0, 0), e.def.radius * 0.5, 0.5, dt, { forEnemy: true });
    }
    // extremidades flácidas
    j.armL.rotation.x = damp(j.armL.rotation.x, -2.2 + (e.id % 3) * 0.4, 5, dt); j.armR.rotation.x = damp(j.armR.rotation.x, -1.6 - (e.id % 2) * 0.6, 5, dt);
    j.legL.rotation.x = damp(j.legL.rotation.x, 0.2, 5, dt); j.legR.rotation.x = damp(j.legR.rotation.x, -0.15, 5, dt);
    if (e.neckBleed > 0) {
      e.neckBleed -= dt;
      const n = _b.copy(e.pos); n.y += 0.4;
      const hx = -Math.sin(root.rotation.y) * e.def.height * 0.8, hz = -Math.cos(root.rotation.y) * e.def.height * 0.8;
      this.game.fx.blood.spawn(n.x + hx * ease, n.y + (1 - ease) * e.def.height, n.z + hz * ease, rand(-1, 1) + hx, rand(1, 3), rand(-1, 1) + hz, 0.5, 0.02, 0.02, 0.08, 0.6, 9.8, 0.3);
    }
    if (e.corpseT > 0.6 && !e.bloodPool) { e.bloodPool = true; this.game.fx.decal('blood', e.pos.x, 0.01, e.pos.z, 0, 1, 0, rand(1, 1.8) * (e.def.model.scale || 1)); }
    if (e.corpseT > 11) root.position.y = -(e.corpseT - 11) * 0.3; else root.position.copy(e.pos);
  }

  inRadius(pos, r) { return this.alive.filter((e) => e.pos.distanceToSquared(pos) < r * r); }
  countByType() { const m = {}; for (const e of this.alive) m[e.type] = (m[e.type] || 0) + 1; return m; }
  pickSpecial() { return pick(this.alive); }
}

export function ballistic(from, to, speed, gravity) {
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
  const dh = Math.hypot(dx, dz);
  const v2 = speed * speed;
  const disc = v2 * v2 - gravity * (gravity * dh * dh + 2 * dy * v2);
  let ang;
  if (disc < 0) ang = Math.PI / 4;
  else ang = Math.atan((v2 - Math.sqrt(disc)) / (gravity * dh));
  const vh = Math.cos(ang) * speed;
  return new THREE.Vector3(dx / dh * vh, Math.sin(ang) * speed, dz / dh * vh);
}

export function voiceParams(def, kind, variant) {
  const v = def.voice;
  return { ...v, dur: kind === 'attack' ? 0.55 : kind === 'pain' ? 0.35 : kind === 'death' ? 1.0 : 0.9, contour: kind === 'attack' ? [1, 1.5, 1.3] : kind === 'pain' ? [1.4, 1.1] : kind === 'death' ? [1.2, 1, 0.6, 0.4] : [0.9, 1.1, 0.85, 1], pitch: v.pitch * (1 + variant * 0.06) };
}

// Trabajos de precalentamiento de audio para todas las voces del bestiario
export function voiceWarmJobs() {
  const jobs = [];
  for (const def of Object.values(ENEMIES)) for (const kind of ['idle', 'attack', 'pain', 'death']) for (let v = 0; v < 3; v++) jobs.push(() => audio.voiceBuffer(def.id, kind, v, voiceParams(def, kind, v)));
  return jobs;
}
