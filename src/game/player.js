// Jugador local: movimiento FPS (aceleración, salto, agacharse, sprint), cámara con
// retroceso/sacudida/balanceo, salud, blindaje, estados alterados y señales de daño.
import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/utils.js';
import { audio } from '../audio/audio.js';
import { bus } from '../core/events.js';

const STAND_H = 1.8, CROUCH_H = 1.15, EYE_STAND = 1.65, EYE_CROUCH = 1.0;
const RADIUS = 0.34;

export class LocalPlayer {
  constructor(game, id, name) {
    this.game = game;
    this.id = id;
    this.name = name;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.height = STAND_H;
    this.eye = EYE_STAND;
    this.radius = RADIUS;
    this.onGround = true;
    this.crouching = false;
    this.sprinting = false;
    this.maxHp = 100; this.hp = 100;
    this.maxArmor = 100; this.armor = 0;
    this.alive = true; this.downed = false; this.downedTimer = 0; this.reviveProgress = 0;
    this.credits = 0;
    this.recoilP = 0; this.recoilY = 0; // desplazamiento acumulado (rad)
    this.trauma = 0;
    this.bobT = 0; this.bobAmt = 0;
    this.landKick = 0;
    this.tilt = 0;
    this.stepT = 0;
    this.fovKick = 0;
    this.slowT = 0; this.slowAmt = 0;
    this.grabbedBy = null;
    this.stunT = 0;
    this.acidT = 0;
    this.burnT = 0;
    this.hasteT = 0;
    this.shieldT = 0;
    this.carry = null; // objeto de objetivo transportado
    this.lastDamageT = 99;
    this.healTick = 0;
    this.camPos = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.stats = { kills: 0, headshots: 0, damage: 0, healed: 0, welded: 0, deaths: 0, shots: 0, hits: 0, creditsEarned: 0, objectives: 0, largeKills: 0, assists: 0 };
    this.mods = null;
    this.flashlight = false;
    this.lastFallVel = 0;
    this.zedSpeed = 1;
    this.airTime = 0;
  }

  applyMods(mods, keepHealth = false) {
    this.mods = mods;
    const oldMax = this.maxHp;
    this.maxHp = 100 + (mods.maxHp || 0);
    this.maxArmor = 100 + (mods.maxArmor || 0);
    if (!keepHealth) this.hp = this.maxHp;
    else this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - oldMax));
  }

  spawnAt(x, z, yaw = 0) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.alive = true; this.downed = false;
    this.hp = this.maxHp;
    this.grabbedBy = null;
  }

  get moveSpeedMult() {
    const w = this.game.weapons;
    const m = this.mods || {};
    let s = (m.moveSpeed || 1) * (w ? w.moveMult() : 1);
    if (this.slowT > 0) s *= 1 - this.slowAmt;
    if (this.grabbedBy) s *= 0.35;
    if (this.carry) s *= 0.75;
    if (this.hasteT > 0) s *= 1.2;
    return s;
  }

  look(dx, dy, sens, invertY, adsMult = 1) {
    const k = 0.0022 * sens * adsMult;
    this.yaw -= dx * k;
    this.pitch -= dy * k * (invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.5, 1.5);
  }

  update(dt, input, active) {
    const g = this.game;
    const coll = g.world.collision;
    const m = this.mods || {};
    this.lastDamageT += dt;
    for (const k of ['slowT', 'stunT', 'acidT', 'burnT', 'hasteT', 'shieldT']) if (this[k] > 0) this[k] -= dt;

    if (!this.alive || this.downed) {
      this.vel.x = 0; this.vel.z = 0;
      this.vel.y -= 20 * dt;
      coll.moveCylinder(this.pos, this.vel, this.radius, this.height, dt, { forPlayer: true });
      this.eye = damp(this.eye, 0.4, 6, dt);
      this._updateCamera(dt);
      return;
    }

    // Movimiento
    const fwd = (active && input.down('forward') ? 1 : 0) - (active && input.down('back') ? 1 : 0);
    const str = (active && input.down('right') ? 1 : 0) - (active && input.down('left') ? 1 : 0);
    const wantCrouch = active && input.down('crouch');
    if (wantCrouch !== this.crouching) {
      if (wantCrouch) this.crouching = true;
      else {
        // comprobar techo antes de levantarse
        const tmp = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
        const blocked = coll.raycast(tmp.x, tmp.y + CROUCH_H, tmp.z, 0, 1, 0, STAND_H - CROUCH_H + 0.05);
        if (!blocked) this.crouching = false;
      }
    }
    this.height = this.crouching ? CROUCH_H : STAND_H;
    const weaponBlocksSprint = g.weapons && g.weapons.blocksSprint();
    this.sprinting = active && input.down('sprint') && fwd > 0 && !this.crouching && !weaponBlocksSprint && !this.carry;
    let speed = 4.6 * this.moveSpeedMult;
    if (this.sprinting) speed *= 1.42;
    if (this.crouching) speed *= 0.5;
    if (g.weapons?.aiming) speed *= 0.62;
    speed *= this.zedSpeed;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * fwd + cy * str, wz = -cy * fwd - sy * str;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const accel = this.onGround ? 60 : 12;
    const tx = wx * speed, tz = wz * speed;
    const dvx = tx - this.vel.x, dvz = tz - this.vel.z;
    const dl = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    if (dl > maxDv) { this.vel.x += dvx / dl * maxDv; this.vel.z += dvz / dl * maxDv; } else { this.vel.x = tx; this.vel.z = tz; }

    if (active && input.hit('jump') && this.onGround && !this.crouching && this.stunT <= 0) {
      this.vel.y = 5.6;
      this.onGround = false;
      audio.play('jump', { volume: 0.35, rate: 0.9 + Math.random() * 0.2, reverbAmt: 0.2 });
    }
    this.vel.y -= 18 * dt;
    const preVy = this.vel.y;
    const res = coll.moveCylinder(this.pos, this.vel, this.radius, this.height, dt, { forPlayer: true, stepHeight: 0.5 });
    const wasGround = this.onGround;
    this.onGround = res.onGround;
    if (!this.onGround) this.airTime += dt; else {
      if (!wasGround && this.airTime > 0.15) {
        this.landKick = Math.min(0.12, -preVy * 0.012);
        const ls = this._surface();
        audio.play(ls === 'metal' ? 'land_metal' : 'land_concrete', { volume: Math.min(0.75, 0.2 + -preVy * 0.05), rate: 0.92 + Math.random() * 0.1, reverbAmt: 0.35 });
        if (-preVy > 6) audio.play('rustle', { volume: 0.25, delay: 0.03, reverbAmt: 0 });
        if (preVy < -13) this.takeDamage((-preVy - 13) * 6, 'fall', null);
      }
      this.airTime = 0;
    }
    // mantener dentro de los límites del mapa
    const b = g.world.def.bounds;
    this.pos.x = clamp(this.pos.x, b[0] - 6, b[2] + 6); this.pos.z = clamp(this.pos.z, b[1] - 6, b[3] + 6);

    const hs = Math.hypot(this.vel.x, this.vel.z);
    // pasos
    if (this.onGround && hs > 1) {
      this.stepT -= dt * hs * (this.sprinting ? 0.5 : 0.55);
      if (this.stepT <= 0) {
        this.stepT = 1;
        const surf = this._surface();
        // variante aleatoria sin repetir la anterior; agachado = pasos muy suaves
        let v = Math.floor(Math.random() * 3); if (v >= this._lastStep) v++; this._lastStep = v;
        const vol = this.crouching ? 0.12 : this.sprinting ? 0.5 : 0.36;
        audio.play(`step_${surf}_${v}`, { volume: vol * (0.85 + Math.random() * 0.3), rate: 0.94 + Math.random() * 0.12, reverbAmt: 0.25 });
        if (this.sprinting && Math.random() < 0.35) audio.play('rustle', { volume: 0.12, rate: 0.9 + Math.random() * 0.3, reverbAmt: 0 });
      }
    }
    this.bobAmt = damp(this.bobAmt, this.onGround ? Math.min(1, hs / 5) : 0, 10, dt);
    this.bobT += dt * hs * 1.9;
    this.tilt = damp(this.tilt, -str * 0.012, 8, dt);
    this.eye = damp(this.eye, this.crouching ? EYE_CROUCH : EYE_STAND, 12, dt);

    // regeneración (talento)
    if (m.regen && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + m.regen * dt);
    // ácido / fuego en el jugador
    if (this.acidT > 0) { this.healTick += dt; if (this.healTick > 0.5) { this.healTick = 0; this.takeDamage(3, 'acid', null, true); } }
    if (this.burnT > 0) { this._burnTick = (this._burnTick || 0) + dt; if (this._burnTick > 0.5) { this._burnTick = 0; this.takeDamage(4 * (1 - (m.fireRes || 0)), 'fire', null, true); } }

    // corazón con poca vida
    if (this.hp < this.maxHp * 0.3) {
      this._hb = (this._hb || 0) - dt;
      if (this._hb <= 0) { this._hb = 0.9; audio.play('heartbeat', { volume: 0.5, bus: 'ui' }); }
    }
    this._updateCamera(dt);
  }

  _surface() {
    const tmp = this._st || (this._st = []);
    this.game.world.collision.query(this.pos.x - 0.1, this.pos.z - 0.1, this.pos.x + 0.1, this.pos.z + 0.1, tmp);
    for (const b of tmp) {
      if (Math.abs(b.max[1] - this.pos.y) >= 0.05) continue;
      if (b.mat === 'metal' || b.mat === 'container' || b.mat === 'vehicle') return 'metal';
      if (b.mat === 'crate') return 'wood';
      if (b.mat === 'tiles') return 'tile';
      if (b.mat === 'sandbag') return 'dirt';
      return 'concrete';
    }
    // suelo base: zonas del mapa (la última que contiene el punto manda)
    const def = this.game.world.def;
    let mat = def.floor;
    for (const fa of def.floorAreas || []) { const [x0, z0, x1, z1] = fa.rect; if (this.pos.x >= x0 && this.pos.x <= x1 && this.pos.z >= z0 && this.pos.z <= z1) mat = fa.mat; }
    return mat === 'dirt' ? 'dirt' : mat === 'tiles' ? 'tile' : 'concrete';
  }

  _updateCamera(dt) {
    // recuperar retroceso
    const rec = 9;
    this.recoilP = damp(this.recoilP, 0, rec, dt);
    this.recoilY = damp(this.recoilY, 0, rec, dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.landKick = damp(this.landKick, 0, 8, dt);
    this.fovKick = damp(this.fovKick, 0, 6, dt);
    const t = performance.now() / 1000;
    const sh = this.trauma * this.trauma;
    const shx = (Math.sin(t * 47) + Math.sin(t * 31.3) * 0.5) * sh * 0.04;
    const shy = (Math.sin(t * 53.1) + Math.sin(t * 29.7) * 0.5) * sh * 0.04;
    const bob = Math.sin(this.bobT) * 0.035 * this.bobAmt;
    const bobx = Math.cos(this.bobT * 0.5) * 0.025 * this.bobAmt;
    const cam = this.game.renderer.camera;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    this.camPos.set(this.pos.x + cy * bobx, this.pos.y + this.eye + bob - this.landKick, this.pos.z - sy * bobx);
    cam.position.copy(this.camPos);
    cam.rotation.set(this.pitch + this.recoilP + shy, this.yaw + this.recoilY + shx, this.tilt + shx * 0.5);
    this.forward.set(-Math.sin(cam.rotation.y) * Math.cos(cam.rotation.x), Math.sin(cam.rotation.x), -Math.cos(cam.rotation.y) * Math.cos(cam.rotation.x));
    this.right.set(Math.cos(cam.rotation.y), 0, -Math.sin(cam.rotation.y));
  }

  addRecoil(up, side) {
    this.recoilP += up;
    this.recoilY += side;
    // parte del retroceso se queda en la mira (hay que compensarlo con el ratón)
    this.pitch = clamp(this.pitch + up * 0.35, -1.5, 1.5);
    this.yaw += side * 0.35;
  }

  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }

  // Daño recibido. silent: sin indicador direccional (DoT)
  takeDamage(amount, type, sourcePos, silent = false) {
    if (!this.alive || this.downed || amount <= 0) return 0;
    const g = this.game;
    const m = this.mods || {};
    let dmg = amount * (m.dmgTaken || 1);
    if (type === 'melee') dmg *= m.meleeRes || 1;
    if (type === 'fire') dmg *= 1 - (m.fireRes || 0);
    if (type === 'explosive_self') dmg *= 1 - (m.selfExplRes || 0);
    if (this.shieldT > 0) dmg *= 0.8;
    if (g.godMode) dmg = 0;
    // blindaje: absorbe el 75% (el ácido lo ignora parcialmente)
    let absorbed = 0;
    if (this.armor > 0 && type !== 'fall') {
      const frac = type === 'acid' ? 0.35 : 0.75;
      absorbed = Math.min(this.armor, dmg * frac);
      this.armor -= absorbed;
      dmg -= absorbed;
      if (!silent) audio.play('armor_hit', { volume: 0.5, cooldown: 0.08 });
    }
    this.hp -= dmg;
    this.lastDamageT = 0;
    this.waveDamage = (this.waveDamage || 0) + dmg + absorbed;
    this.stats.damageTaken = (this.stats.damageTaken || 0) + dmg + absorbed;
    if (!silent) {
      this.shake(Math.min(0.5, (dmg + absorbed) / 40));
      audio.play(Math.random() < 0.5 ? 'player_hurt' : 'player_hurt2', { volume: 0.55, cooldown: 0.35 });
      bus.emit('playerHurt', { amount: dmg + absorbed, sourcePos, type });
    }
    if (m.thorns && type === 'melee' && sourcePos && sourcePos.enemy) g.enemies?.damage(sourcePos.enemy, m.thorns, 'body', 'electric', null, this.id);
    if (this.hp <= 0) {
      this.hp = 0;
      g.onLocalPlayerDown();
    }
    return dmg;
  }

  heal(amount, fromOther = false) {
    if (!this.alive || this.downed) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    if (fromOther) audio.play('heal_done', { volume: 0.4 });
    return this.hp - before;
  }

  // estado compacto para la red
  netState() {
    return {
      x: +this.pos.x.toFixed(2), y: +this.pos.y.toFixed(2), z: +this.pos.z.toFixed(2),
      yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3), cr: this.crouching ? 1 : 0,
      hp: Math.round(this.hp), mhp: this.maxHp, ar: Math.round(this.armor), w: this.game.weapons?.current?.def.id || '',
      dn: this.downed ? 1 : 0, al: this.alive ? 1 : 0, fl: this.flashlight ? 1 : 0, cr$: this.credits, k: this.stats.kills, hs: this.stats.headshots, dm: Math.round(this.stats.damage), he: Math.round(this.stats.healed),
    };
  }
}

export { lerp };
