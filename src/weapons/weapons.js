// Sistema de armas del jugador local: inventario con peso, estadísticas derivadas de clase y
// mejoras, disparo (hitscan, perdigones, proyectiles, llamas, haz, cuerpo a cuerpo, curación,
// soldadura), recargas por tipo, apuntado con mira, granadas y animación procedural del arma.
import * as THREE from 'three';
import { WEAPONS, GRENADES, upgradeMult, upgradeWeight } from './weaponDefs.js';
import { buildWeaponModel, attachArms } from '../render/weaponModels.js';
import { audio } from '../audio/audio.js';
import { bus } from '../core/events.js';
import { clamp, damp, rand, DEG } from '../core/utils.js';

const BASE_CARRY = 15;
const GROUPS = { melee: 1, pistol: 2, tool: 4 };

export function weaponGroup(def) {
  if (def.cat === 'melee') return 1;
  if (def.cat === 'tool') return 4;
  if (def.cat === 'pistol' || (def.model?.arch || '').includes('Pistol') || def.model?.arch === 'pistol' || def.model?.small) return 2;
  return 3;
}

export class WeaponSystem {
  constructor(game, player) {
    this.game = game;
    this.player = player;
    this.inv = [];
    this.current = null;
    this.prev = null;
    this.pending = null;
    this.state = 'idle';
    this.stateT = 0;
    this.cooldown = 0;
    this.ads = 0;
    this.aiming = false;
    this.grenades = 3;
    this.syringe = 100;
    this.burstQueue = 0;
    this.spin = 0;
    this.headStack = 0;
    this.vm = game.renderer.vmScene;
    this.vmRoot = new THREE.Group();
    this.vm.add(this.vmRoot);
    this.models = new Map();
    this.sway = new THREE.Vector2();
    this.kick = 0; this.kickRot = 0;
    this.reloadPhase = 0;
    this.loopSnd = null;
    this.sticky = [];
    this.skin = { sleeve: 0x2a3326, glove: 0x1a1a1a };
    this.weaponTint = null;
    this.quickAction = null; // 'heal' | 'grenade' | 'melee'
    this._tmpV = new THREE.Vector3();
    this.muzzleWorld = new THREE.Vector3();
  }

  get mods() { return this.player.mods || {}; }
  get perk() { return this.game.perkId; }
  carryCap() { return BASE_CARRY + (this.mods.carry || 0); }
  totalWeight() { return this.inv.reduce((s, w) => s + (w.def.weight || 0) + upgradeWeight(w.upgrade), 0); }
  has(id) { return this.inv.some((w) => w.def.id === id); }
  get(id) { return this.inv.find((w) => w.def.id === id); }
  grenadeMax() { return 5 + (this.mods.grenadeMax || 0); }
  grenadeDef() { return GRENADES[this.game.perkGrenade || 'frag']; }

  computeStats(inst) {
    const d = inst.def, f = d.fire || {}, m = this.mods;
    const perkMatch = d.perk && d.perk === this.perk;
    const pm = (k, base = 1) => (perkMatch ? (m[k] ?? 1) : 1) * base;
    const up = upgradeMult(inst.upgrade || 0);
    let dmg = (f.dmg || 0) * up * pm('perkDmg') * (m.dmgAll || 1);
    if (f.dmgType === 'fire') dmg *= m.fireDmg || 1;
    const s = {
      dmg,
      rpm: (f.rpm || 60) * pm('fireRate'),
      mag: Math.max(1, Math.round((d.mag || 0) * pm('magSize'))),
      maxAmmo: Math.round((d.maxAmmo || 0) * pm('maxAmmo')) + (perkMatch ? (m.flatAmmo || 0) * Math.max(1, d.mag <= 2 ? 1 : 0) : 0),
      reload: (d.reload?.time || 1) / pm('reload'),
      spread: (f.spread || 0) * pm('spread'),
      adsSpread: (f.adsSpread || 0) * pm('spread'),
      recoil: pm('recoil'),
      pen: (f.penetration || 0) + (perkMatch ? (m.penetration || 0) : 0),
      pellets: (f.pellets || 1) + (perkMatch && f.mode === 'pellets' ? (m.pelletsAdd || 0) : 0),
      headMult: (f.headMult || 1.5) * (m.headDmg || 1),
      stumble: (f.stumble || 0) * (perkMatch ? m.stumble || 1 : 1),
      chain: f.chain ? { count: f.chain.count + (perkMatch ? (m.chainAdd || 0) : 0), range: f.chain.range * (perkMatch ? (m.chainRange || 1) : 1), mult: f.chain.mult } : null,
      perkMatch,
      range: (f.range || 50) * (f.mode === 'flame' && perkMatch ? (m.flameRange || 1) : 1),
      burn: (f.burn || 0) * (perkMatch ? m.burnDur || 1 : 1),
      dmgType: f.dmgType,
    };
    if (f.projectile) {
      s.proj = { ...f.projectile };
      s.proj.dmg = (f.projectile.dmg || 0) * up * pm('perkDmg') * (m.explDmg || 1) * (m.dmgAll || 1);
      s.proj.impactDmg = (f.projectile.impactDmg || 0) * up * pm('perkDmg') * (m.impactDmg || 1);
      s.proj.radius = (f.projectile.radius || 0) * (perkMatch ? (m.explRadius || 1) : 1);
      if (f.dmgType === 'fire') { s.proj.dmg *= m.fireDmg || 1; s.proj.impactDmg *= m.fireDmg || 1; s.proj.burn = (f.projectile.burn || 0) * (m.burnDur || 1); }
    }
    if (f.dart) s.dart = { heal: f.dart.heal * (m.healPower || 1), cost: f.dart.cost * (m.dartCost || 1), poison: f.dart.poison };
    inst.stats = s;
    if (inst.mag > s.mag) { inst.reserve += inst.mag - s.mag; inst.mag = s.mag; }
    if (inst.reserve > s.maxAmmo - inst.mag) inst.reserve = Math.max(0, s.maxAmmo - inst.mag);
    return s;
  }

  refreshStats() { for (const w of this.inv) this.computeStats(w); }

  addWeapon(id, opts = {}) {
    const def = WEAPONS[id];
    if (!def) return null;
    if (this.has(id)) return this.get(id);
    const inst = { def, mag: 0, reserve: 0, upgrade: opts.upgrade || 0, spent: opts.spent ?? def.price, stats: null };
    this.computeStats(inst);
    inst.mag = inst.stats.mag;
    inst.reserve = Math.max(0, Math.min(inst.stats.maxAmmo - inst.mag, opts.fullAmmo === false ? inst.stats.mag * 2 : inst.stats.maxAmmo));
    if (def.mag === 0) { inst.mag = 0; inst.reserve = 0; }
    this.inv.push(inst);
    this.inv.sort((a, b) => weaponGroup(a.def) - weaponGroup(b.def) || (a.def.tier - b.def.tier));
    if (opts.equip) this.equip(inst);
    bus.emit('inventory');
    return inst;
  }

  removeWeapon(id) {
    const i = this.inv.findIndex((w) => w.def.id === id);
    if (i < 0) return;
    const inst = this.inv[i];
    this.inv.splice(i, 1);
    if (this.current === inst) { this.current = null; this.equip(this.inv.find((w) => weaponGroup(w.def) === 3) || this.get('p9')); }
    if (this.prev === inst) this.prev = null;
    bus.emit('inventory');
  }

  // ------------------------------------------------------------ modelos
  modelFor(inst) {
    let mdl = this.models.get(inst.def.id);
    if (!mdl) {
      mdl = buildWeaponModel(inst.def);
      attachArms(mdl, this.skin);
      mdl.handLHome = mdl.armParts.slice(2).map((o) => o.position.z);
      // fogonazo en la boca del arma (capa de primera persona)
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), color: inst.def.fire?.dmgType === 'electric' ? 0x80b0ff : inst.def.fire?.dart ? 0x80ffb0 : 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      flash.scale.setScalar(inst.def.fire?.mode === 'pellets' ? 0.22 : 0.15);
      flash.visible = false;
      mdl.muzzle.add(flash);
      mdl.flash = flash;
      mdl.group.visible = false;
      this.vmRoot.add(mdl.group);
      this.models.set(inst.def.id, mdl);
      mdl.magHome = mdl.mag ? mdl.mag.position.clone() : null;
    }
    return mdl;
  }

  rebuildArms() { // al cambiar cosméticos
    for (const mdl of this.models.values()) this.vmRoot.remove(mdl.group);
    this.models.clear();
    if (this.current) { this.curModel = this.modelFor(this.current); this.curModel.group.visible = true; }
  }

  // ------------------------------------------------------------ selección
  equip(inst, instant = false) {
    if (!inst || inst === this.current) return;
    this.stopLoop();
    if (this.current && !instant) {
      this.pending = inst;
      this.state = 'holster';
      this.stateT = 0.18;
      return;
    }
    this._doEquip(inst);
  }

  _doEquip(inst) {
    if (this.curModel) this.curModel.group.visible = false;
    if (this.current && this.current !== inst) this.prev = this.current;
    this.current = inst;
    this.curModel = this.modelFor(inst);
    this.curModel.group.visible = true;
    this.state = 'equip';
    this.stateT = inst.def.cat === 'heavy' ? 0.6 : 0.35;
    this.equipDur = this.stateT;
    this.spin = 0;
    this.aiming = false;
    bus.emit('weaponChanged', inst);
  }

  selectGroup(g) {
    const list = this.inv.filter((w) => weaponGroup(w.def) === g);
    if (!list.length) return;
    const target = this.pending || this.current;
    const idx = list.indexOf(target);
    this.equip(list[(idx + 1) % list.length]);
  }

  cycle(dir) {
    if (!this.inv.length) return;
    const target = this.pending || this.current;
    const i = this.inv.indexOf(target);
    const n = this.inv.length;
    this.equip(this.inv[((i + dir) % n + n) % n]);
  }

  blocksSprint() { return this.firingHeld; }
  moveMult() {
    const w = this.current?.def.weight || 0;
    let m = 1 - Math.max(0, w - 5) * 0.015;
    if (this.current?.def.cat === 'melee') m *= 1.08;
    return m;
  }

  // ------------------------------------------------------------ actualización
  update(dt, input, active, zed) {
    const p = this.player;
    const mods = this.mods;
    const inst = this.current;
    if (!inst) return;
    const def = inst.def, f = def.fire || {}, st = inst.stats;
    // tasa de tiempo: el Tiempo Muerto ralentiza al jugador salvo talentos
    const fireDt = zed ? dt * (mods.zedFire ? 1 : 0.5) : dt;
    const reloadDt = zed ? dt * (mods.zedReload ? 6 : 0.5) : dt;
    this.cooldown -= fireDt;
    if (this.syringe < 100) this.syringe = Math.min(100, this.syringe + dt * (100 / (f.mode === 'heal' ? 15 : 15)) * (mods.healRecharge || 1) * 0.5);
    const canAct = active && p.alive && !p.downed && p.stunT <= 0;
    this.firingHeld = false;

    // estados de transición
    if (this.state === 'holster') {
      this.stateT -= dt;
      if (this.stateT <= 0) { const n = this.pending; this.pending = null; this._doEquip(n); }
      this._animate(dt, input);
      return;
    }
    if (this.state === 'equip') {
      this.stateT -= dt;
      if (this.stateT <= 0) this.state = 'idle';
    }
    if (this.state === 'quick') { this._updateQuick(dt); this._animate(dt, input); return; }

    // entrada de selección
    if (canAct) {
      if (input.hit('slot1')) this.selectGroup(1);
      if (input.hit('slot2')) this.selectGroup(2);
      if (input.hit('slot3')) this.selectGroup(3);
      if (input.hit('slot4')) this.selectGroup(4);
      if (input.hit('slot5')) this.selectGroup(5);
      if (input.hit('lastWeapon') && this.prev && this.inv.includes(this.prev)) this.equip(this.prev);
      if (input.hit('welder')) { const w = this.get('welder'); if (w) this.equip(w === this.current && this.prev ? this.prev : w); }
      const wheel = input.mouse.wheel;
      if (wheel) { this.cycle(wheel > 0 ? 1 : -1); input.mouse.wheel = 0; }
      if (input.hit('heal') && this.syringe >= 50 && p.hp < p.maxHp) this._startQuick('heal');
      if (input.hit('grenade') && this.grenades > 0) this._startQuick('grenade');
      if (input.hit('melee') && def.cat !== 'melee') this._startQuick('melee');
      if (input.hit('reload')) this.tryReload();
    }
    if (this.state !== 'idle' && this.state !== 'reload' && this.state !== 'melee') { this._animate(dt, input); return; }

    // apuntado
    const wantAds = canAct && input.mouse.right && def.ads && this.state !== 'reload' && !p.sprinting;
    this.aiming = !!wantAds;
    this.ads = damp(this.ads, this.aiming ? 1 : 0, 14, dt);

    // recarga en curso
    if (this.state === 'reload') this._updateReload(reloadDt, input, canAct);

    // gatillo
    const trigger = canAct && (f.auto || f.mode === 'heal' || f.mode === 'weld' || f.mode === 'flame' || f.mode === 'beam' ? input.mouse.left : input.mouse.leftPressed);
    const alt = canAct && input.mouse.rightPressed;
    if (f.mode === 'melee') {
      if (this.state === 'melee') this._updateMelee(fireDt);
      else if (canAct && (input.mouse.leftPressed || input.mouse.rightPressed) && this.cooldown <= 0) this._startMelee(input.mouse.rightPressed, inst);
    } else if (f.mode === 'heal') {
      if (canAct && input.mouse.leftPressed) this._syringe(false);
      if (canAct && input.mouse.rightPressed) this._syringe(true);
    } else if (f.mode === 'weld') {
      this._weld(dt, canAct && input.mouse.left, canAct && input.mouse.right);
    } else if (this.state !== 'reload' || (def.reload?.kind === 'shell' && trigger && inst.mag > 0)) {
      if (f.altDetonate && alt) this.game.projectiles.detonateSticky(this.player.id);
      if (trigger) {
        this.firingHeld = true;
        if (this.state === 'reload') { this.state = 'idle'; } // interrumpir recarga de cartuchos
        if (f.spinUp) this.spin = Math.min(1, this.spin + dt / f.spinUp); else this.spin = 1;
        if (this.cooldown <= 0 && this.spin >= 1) {
          if (inst.mag > 0) this._fire(inst, zed);
          else { audio.play('mech_dry', { volume: 0.4, cooldown: 0.25 }); this.cooldown = 0.25; if (inst.reserve > 0) this.tryReload(); }
        }
      } else {
        this.spin = Math.max(0, this.spin - dt * 2);
        if (f.mode === 'flame' || f.mode === 'beam') this.stopLoop();
      }
    }
    this._animate(dt, input);
  }

  tryReload() {
    const inst = this.current;
    if (!inst || this.state !== 'idle' || !inst.def.reload) return;
    if (inst.mag >= inst.stats.mag || inst.reserve <= 0) return;
    this.state = 'reload';
    this.reloadT = 0;
    this.reloadEvents = 0;
    this.stopLoop();
    const kind = inst.def.reload.kind;
    this.reloadDur = kind === 'shell' ? inst.stats.reload * 1 : inst.stats.reload;
    if (kind === 'shell') audio.play('mech_open', { volume: 0.4 });
    bus.emit('reload', inst);
  }

  _updateReload(dt, input, canAct) {
    const inst = this.current, kind = inst.def.reload.kind, dur = this.reloadDur;
    this.reloadT += dt;
    const t = this.reloadT / dur;
    if (kind === 'shell') {
      if (this.reloadT >= dur) {
        this.reloadT = 0;
        inst.mag++; inst.reserve--;
        audio.play('mech_shell', { volume: 0.5, rate: rand(0.95, 1.05) });
        if (inst.mag >= inst.stats.mag || inst.reserve <= 0) {
          this.state = 'idle';
          if (inst.def.fire.pump) { audio.play('mech_pump', { volume: 0.5 }); this.pumpAnim = 1; }
        }
      }
      this.reloadPhase = 0.6;
      return;
    }
    const ev = [0.25, 0.6, 0.85];
    const snd = { mag: ['mech_magOut', 'mech_magIn', 'mech_bolt'], break: ['mech_open', 'mech_shell', 'mech_close'], cylinder: ['mech_open', 'mech_spin', 'mech_close'], cell: ['mech_magOut', 'mech_cell', 'mech_click'], canister: ['mech_magOut', 'mech_canister', 'mech_click'] }[kind] || ['mech_magOut', 'mech_magIn', 'mech_bolt'];
    while (this.reloadEvents < 3 && t >= ev[this.reloadEvents]) { audio.play(snd[this.reloadEvents], { volume: 0.55 }); this.reloadEvents++; }
    this.reloadPhase = t;
    if (this.reloadT >= dur) {
      const need = inst.stats.mag - inst.mag;
      const take = Math.min(need, inst.reserve);
      inst.mag += take; inst.reserve -= take;
      this.state = 'idle';
      this.reloadPhase = 0;
      bus.emit('ammo');
    }
  }

  stopLoop() { if (this.loopSnd) { audio.stop(this.loopSnd); this.loopSnd = null; } }

  _muzzleWorld() {
    // posición aproximada de la boca del cañón en el mundo (para trazadoras y partículas)
    const p = this.player, cam = this.game.renderer.camera;
    const up = this._tmpV.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const a = this.ads;
    const fwdDist = 0.55, side = 0.17 * (1 - a), down = 0.13 * (1 - a) + 0.04;
    this.muzzleWorld.copy(p.camPos).addScaledVector(p.forward, fwdDist).addScaledVector(p.right, side).addScaledVector(up, -down);
    return this.muzzleWorld;
  }

  _spreadDir(spread, out) {
    const p = this.player;
    out.copy(p.forward);
    if (spread <= 0) return out;
    const cam = this.game.renderer.camera;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const r = Math.sqrt(Math.random()) * spread, a = Math.random() * Math.PI * 2;
    out.addScaledVector(p.right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    return out;
  }

  _fire(inst, zed) {
    const p = this.player, g = this.game, def = inst.def, f = def.fire, st = inst.stats;
    const mods = this.mods;
    this.cooldown = 60 / st.rpm;
    inst.mag--;
    p.stats.shots++;
    const moving = Math.hypot(p.vel.x, p.vel.z) > 1;
    let spread = st.spread * (1 - this.ads) + st.adsSpread * this.ads;
    if (moving) spread *= 1.5;
    if (!p.onGround) spread *= 2;
    if (p.crouching) spread *= 0.75 * (mods.crouchSpread || 1);
    const origin = p.camPos;
    const muzzle = this._muzzleWorld();
    const dir = new THREE.Vector3();
    const shooter = p.id;
    const zedHead = zed && mods.zedHead ? mods.zedHead : 1;
    const pen = st.pen + (zed && mods.zedPen ? 20 : 0);
    let anyHit = false;

    if (f.mode === 'hitscan' || f.mode === 'pellets') {
      const n = f.mode === 'pellets' ? st.pellets : 1;
      for (let i = 0; i < n; i++) {
        this._spreadDir(spread + (f.mode === 'pellets' ? 0 : 0), dir);
        const res = g.combat.hitscan(origin, dir, {
          dmg: st.dmg, range: st.range, pen, headMult: st.headMult * zedHead, dmgType: f.dmgType, stumble: st.stumble,
          chain: st.chain && { ...st.chain, count: zed && mods.zedChain ? Math.max(st.chain.count, mods.zedChain) : st.chain.count }, burn: st.burn,
          knockback: f.knockback || (f.mode === 'pellets' ? 1.2 : 0.4), shooter, weapon: def.id, perkMatch: st.perkMatch, dart: st.dart, rail: f.rail,
          headStack: mods.headStack ? this : null,
        });
        if (res.hitEnemy) anyHit = true;
        const tc = f.tracer || (f.dmgType === 'fire' ? [1, 0.5, 0.15] : [1, 0.85, 0.5]);
        if (f.rail) {
          g.fx.arc(muzzle, res.end, tc, 14, 0.12, 0.25);
          g.fx.tracer(muzzle, res.end, [0.6, 0.9, 1], 0.3);
        } else if (f.dmgType === 'electric') {
          g.fx.arc(muzzle, res.end, tc, 7, 0.18, 0.1);
        } else if (Math.random() < (f.mode === 'pellets' ? 0.5 : 0.7)) {
          const tStart = muzzle.clone().lerp(res.end, 0.04);
          g.fx.tracer(tStart, res.end, tc, 0.05);
        }
      }
    } else if (f.mode === 'projectile') {
      this._spreadDir(spread, dir);
      if (st.proj.kind === 'sticky') {
        const mine = g.projectiles.countSticky(shooter);
        if (mine >= (st.proj.maxActive || 8)) g.projectiles.detonateOldestSticky(shooter);
      }
      g.projectiles.spawn(st.proj.kind, muzzle.clone(), dir.clone().multiplyScalar(st.proj.speed), { owner: shooter, stats: st.proj, dmgType: f.dmgType, weapon: def.id, perkMatch: st.perkMatch, zedNuke: zed && mods.zedNuke });
    } else if (f.mode === 'flame') {
      const zf = zed && mods.zedFlame ? mods.zedFlame : 1;
      this._spreadDir(0.02, dir);
      g.combat.flame(origin, dir, st.range * zf, f.cone, st.dmg * (60 / st.rpm) * 15 * zf, st.burn, shooter, def.id, f.plasma);
      for (let k = 0; k < 2; k++) g.fx.fireBurst(muzzle, dir, f.plasma ? 1.4 : 1);
      if (f.plasma) g.fx.glow.spawn(muzzle.x, muzzle.y, muzzle.z, dir.x * 14, dir.y * 14, dir.z * 14, 1, 0.9, 0.5, 0.3, 0.6);
      if (!this.loopSnd) this.loopSnd = audio.loop('flame_loop', { volume: 0.55 });
      g.fx.flash(muzzle.x, muzzle.y, muzzle.z, 0xff7020, 12, 0.05, 6);
      g.net?.sendFx({ k: 'flame', w: def.id, o: v3(muzzle), d: v3(dir) });
    } else if (f.mode === 'beam') {
      this._spreadDir(0, dir);
      const res = g.combat.beam(origin, dir, st.range, st.dmg * (60 / st.rpm) * 10, st.chain, shooter, def.id, st.stumble);
      g.fx.arc(muzzle, res.end, [0.5, 1, 1], 10, 0.15, 0.06);
      g.fx.glow.spawn(res.end.x, res.end.y, res.end.z, rand(-2, 2), rand(-2, 2), rand(-2, 2), 0.5, 1, 1, 0.3, 0.12);
      if (!this.loopSnd) this.loopSnd = audio.loop('beam_loop', { volume: 0.5 });
      g.net?.sendFx({ k: 'beam', w: def.id, o: v3(muzzle), e: v3(res.end) });
    }

    if (f.mode !== 'flame' && f.mode !== 'beam') {
      // sonido, destello y retroceso
      const buf = audio.weaponBuffer(def);
      audio.play(buf, { volume: 0.75, rate: rand(0.96, 1.04), priority: true });
      const col = f.dmgType === 'electric' ? [0.5, 0.8, 1] : f.dart ? [0.4, 1, 0.6] : [1, 0.7, 0.3];
      if (this.curModel?.flash) { const fl = this.curModel.flash; fl.visible = true; fl.material.rotation = Math.random() * 6.28; fl.userData.t = 0.045; void col; }
      const ahead = muzzle.clone().addScaledVector(p.forward, 0.9);
      g.fx.smoke.spawn(ahead.x, ahead.y, ahead.z, p.forward.x, 0.3, p.forward.z, 0.35, 0.33, 0.3, 0.12, 0.5, -0.3, 1.5, 0.6, 0.18);
      g.fx.flash(muzzle.x, muzzle.y, muzzle.z, f.dmgType === 'electric' ? 0x60a0ff : 0xffa050, f.mode === 'pellets' ? 70 : 40, 0.06, 10);
      g.renderer.vmFill.intensity = 3;
      g.renderer.vmFill.color.set(f.dmgType === 'electric' ? 0x60a0ff : 0xffa050);
      g.alertEnemies(p.pos, 30);
      g.net?.sendFx({ k: 'shot', w: def.id, o: v3(muzzle), d: v3(p.forward) });
    }
    const rc = def.recoil || { up: 1, side: 0.3, kick: 0.05 };
    const adsR = this.ads > 0.5 ? 0.6 * (mods.adsRecoil || 1) : 1;
    const crouchR = p.crouching ? 0.8 : 1;
    p.addRecoil(rc.up * DEG * st.recoil * adsR * crouchR * (0.8 + Math.random() * 0.4), (Math.random() - 0.5) * 2 * rc.side * DEG * st.recoil * adsR);
    this.kick = Math.min(0.35, this.kick + rc.kick);
    this.kickRot = Math.min(0.5, this.kickRot + rc.kick * 1.6);
    if (f.pump || f.bolt) { this.pumpAnim = 1; setTimeout(() => audio.play(f.bolt ? 'mech_bolt' : 'mech_pump', { volume: 0.45 }), 60000 / st.rpm * 0.35); }
    if (def.cat === 'pistol' && this.curModel?.slide) this.slideAnim = 1;
    if (this.curModel?.cylinder) this.cylAnim = (this.cylAnim || 0) + Math.PI / 3;
    bus.emit('ammo');
    if (inst.mag === 0 && inst.reserve > 0 && !f.auto) setTimeout(() => { if (this.current === inst && this.state === 'idle') this.tryReload(); }, 250);
    void anyHit;
  }

  // ------------------------------------------------------------ cuerpo a cuerpo
  _startMelee(heavy, inst) {
    const f = inst.def.fire;
    this.state = 'melee';
    this.meleeHeavy = heavy;
    this.meleeT = 0;
    this.meleeHitDone = false;
    this.meleeDur = heavy ? 0.85 : 0.5;
    this.cooldown = this.meleeDur;
    audio.play(heavy ? 'swing_heavy' : 'swing', { volume: 0.5, delay: heavy ? 0.2 : 0.08 });
    void f;
  }
  _updateMelee(dt) {
    this.meleeT += dt;
    const hitAt = this.meleeHeavy ? 0.35 : 0.16;
    if (!this.meleeHitDone && this.meleeT >= hitAt) {
      this.meleeHitDone = true;
      const f = WEAPONS.machete.fire;
      const p = this.player;
      const dmg = (this.meleeHeavy ? f.heavyDmg : f.dmg) * (this.mods.dmgAll || 1);
      this.game.combat.melee(p.camPos, p.forward, f.range, f.arc, dmg, this.meleeHeavy ? 3 : 1.5, p.id);
    }
    if (this.meleeT >= this.meleeDur) {
      if (this.quickAction === 'melee') { this.state = 'idle'; } else this.state = 'idle';
    }
  }

  // ------------------------------------------------------------ acciones rápidas (Q, G, V)
  _startQuick(kind) {
    this.stopLoop();
    this.quickAction = kind;
    this.state = 'quick';
    this.quickT = 0;
    this.quickDone = false;
    this.quickDur = kind === 'heal' ? 0.75 : kind === 'grenade' ? 0.6 : 0.55;
    if (kind === 'grenade') audio.play('grenade_pin', { volume: 0.5 });
    if (kind === 'melee') audio.play('swing', { volume: 0.5, delay: 0.1 });
    if (kind === 'heal') audio.play('heal', { volume: 0.4, delay: 0.2 });
  }
  _updateQuick(dt) {
    this.quickT += dt;
    const p = this.player;
    if (!this.quickDone && this.quickT > this.quickDur * 0.45) {
      this.quickDone = true;
      if (this.quickAction === 'heal') {
        if (this.syringe >= 50) {
          this.syringe -= 50;
          const amt = p.heal(WEAPONS.syringe.fire.selfHeal * (this.mods.healPower || 1) * 1.0);
          if (this.mods.healArmor) p.armor = Math.min(p.maxArmor, p.armor + this.mods.healArmor);
          this.game.fx.healPuff(p.pos);
          audio.play('heal_done', { volume: 0.4 });
          void amt;
        }
      } else if (this.quickAction === 'grenade') {
        if (this.grenades > 0) {
          this.grenades--;
          const gd = this.grenadeDef();
          const dir = p.forward.clone(); dir.y += 0.18; dir.normalize();
          const pos = p.camPos.clone().addScaledVector(p.forward, 0.5);
          const v = dir.multiplyScalar(17).add(new THREE.Vector3(p.vel.x * 0.5, 0, p.vel.z * 0.5));
          const dm = (this.mods.grenadeDmg || 1) * (this.mods.explDmg || 1);
          this.game.projectiles.spawn('handgrenade', pos, v, { owner: p.id, stats: { ...gd, dmg: gd.dmg * dm, radius: gd.radius * (this.mods.explRadius || 1) }, dmgType: gd.kind === 'fire' ? 'fire' : gd.kind === 'emp' ? 'electric' : gd.kind === 'medic' ? 'heal' : 'explosive', grenade: gd });
          bus.emit('ammo');
        }
      } else if (this.quickAction === 'melee') {
        const f = WEAPONS.machete.fire;
        this.game.combat.melee(p.camPos, p.forward, 2.2, 0.8, 45 * (this.mods.dmgAll || 1), 2.5, p.id, true);
        void f;
      }
    }
    if (this.quickT >= this.quickDur) { this.state = 'idle'; this.quickAction = null; }
  }

  _syringe(self) {
    const p = this.player, g = this.game;
    if (this.cooldown > 0) return;
    if (this.syringe < 50) { audio.play('deny', { volume: 0.25, cooldown: 0.5 }); this.cooldown = 0.4; return; }
    this.cooldown = 0.8;
    if (!self) {
      const target = g.findTeammateInFront(3.2);
      if (target) {
        this.syringe -= 50;
        g.healTeammate(target, WEAPONS.syringe.fire.heal * (this.mods.healPower || 1) * 1.4);
        this.syringeAnim = 1;
        audio.play('heal', { volume: 0.4 });
        return;
      }
      audio.play('deny', { volume: 0.2 });
      return;
    }
    if (p.hp >= p.maxHp) return;
    this.syringe -= 50;
    p.heal(WEAPONS.syringe.fire.selfHeal * (this.mods.healPower || 1));
    if (this.mods.healArmor) p.armor = Math.min(p.maxArmor, p.armor + this.mods.healArmor);
    this.syringeAnim = 1;
    g.fx.healPuff(p.pos);
    audio.play('heal_done', { volume: 0.4 });
  }

  _weld(dt, weld, unweld) {
    const g = this.game, p = this.player;
    const door = g.findDoorInFront(WEAPONS.welder.fire.range);
    this.weldTarget = door;
    if (door && (weld || unweld)) {
      const rate = WEAPONS.welder.fire.rate * (this.mods.weldSpeed || 1) * dt;
      const amt = g.weldDoor(door, weld ? rate * (this.mods.weldStrength || 1) : -rate * 1.5);
      if (amt > 0) { p.stats.welded += amt; g.addPerkXp('support', amt * 0.04); }
      if (!this.loopSnd) this.loopSnd = audio.loop('weld_loop', { volume: 0.35 });
      if (Math.random() < 0.6) {
        const hp = g.lastWeldPoint;
        if (hp) for (let i = 0; i < 2; i++) g.fx.sparks.spawn(hp.x, hp.y, hp.z, rand(-3, 3), rand(0, 4), rand(-3, 3), 1, 0.8, 0.5, 0.05, 0.4, 12, 0.5);
        if (hp) g.fx.flash(hp.x, hp.y, hp.z, 0x80c0ff, 8, 0.05, 4);
      }
      this.weldAnim = 1;
    } else this.stopLoop();
  }

  // ------------------------------------------------------------ animación del arma
  _animate(dt, input) {
    const mdl = this.curModel;
    if (!mdl) return;
    const p = this.player, def = this.current.def;
    const g = mdl.group;
    const md = input.mouse;
    // inercia de la mira
    this.sway.x = damp(this.sway.x, clamp(-md.dx * 0.0006, -0.05, 0.05), 10, dt);
    this.sway.y = damp(this.sway.y, clamp(md.dy * 0.0006, -0.05, 0.05), 10, dt);
    this.kick = damp(this.kick, 0, 14, dt);
    this.kickRot = damp(this.kickRot, 0, 12, dt);
    this.pumpAnim = Math.max(0, (this.pumpAnim || 0) - dt * 3);
    this.slideAnim = Math.max(0, (this.slideAnim || 0) - dt * 14);
    this.syringeAnim = Math.max(0, (this.syringeAnim || 0) - dt * 2);
    this.weldAnim = Math.max(0, (this.weldAnim || 0) - dt * 4);
    this.game.renderer.vmFill.intensity = damp(this.game.renderer.vmFill.intensity, 0, 30, dt);
    if (mdl.flash?.visible) { mdl.flash.userData.t -= dt; if (mdl.flash.userData.t <= 0) mdl.flash.visible = false; }
    const a = this.ads;
    const hip = new THREE.Vector3(0.17, -0.175, -0.42);
    const adsPos = new THREE.Vector3(0, -mdl.adsY, -0.36);
    const pos = hip.clone().lerp(adsPos, a);
    const rot = new THREE.Euler(0, 0.09 * (1 - a), -0.04 * (1 - a));
    // balanceo al caminar
    const bob = p.bobAmt * (1 - a * 0.85);
    pos.x += Math.cos(p.bobT * 0.5) * 0.012 * bob;
    pos.y += Math.abs(Math.sin(p.bobT * 0.5)) * 0.014 * bob - p.landKick * 0.4;
    // sprint
    this.sprintT = damp(this.sprintT || 0, p.sprinting && this.state === 'idle' ? 1 : 0, 10, dt);
    pos.x -= this.sprintT * 0.06; pos.y -= this.sprintT * 0.05;
    rot.y += this.sprintT * 0.7; rot.x -= this.sprintT * 0.25; rot.z += this.sprintT * 0.2;
    // retroceso
    pos.z += this.kick * (a > 0.5 ? 0.5 : 1);
    rot.x += this.kickRot * (a > 0.5 ? 0.35 : 1);
    // inercia
    pos.x += this.sway.x * (1 - a * 0.7); pos.y += this.sway.y * (1 - a * 0.7);
    rot.y += this.sway.x * 2; rot.x += this.sway.y * 2;
    // equipar/enfundar
    if (this.state === 'equip') { const t = this.stateT / this.equipDur; pos.y -= t * 0.3; rot.x -= t * 0.8; }
    if (this.state === 'holster') { const t = 1 - this.stateT / 0.18; pos.y -= t * 0.3; rot.x -= t * 0.8; }
    // recarga
    if (this.state === 'reload') {
      const kind = def.reload.kind;
      const t = this.reloadPhase;
      const env = Math.sin(Math.min(1, t) * Math.PI);
      if (kind === 'shell') { rot.z += 0.35; rot.x += 0.12; pos.y -= 0.03; pos.x -= 0.03; const sh = Math.sin((this.reloadT / this.reloadDur) * Math.PI); pos.z += sh * 0.02; }
      else if (kind === 'break' || kind === 'cylinder') { rot.x += env * 0.55; rot.z += env * 0.25; pos.y -= env * 0.04; }
      else { rot.z += env * 0.55; rot.x += env * 0.18; pos.y -= env * 0.05; pos.x -= env * 0.04; }
      if (mdl.mag && mdl.magHome && (kind === 'mag' || kind === 'cell' || kind === 'canister')) {
        const out = t > 0.25 && t < 0.62 ? Math.min(1, (t - 0.25) * 8) * Math.min(1, (0.62 - t) * 8) : 0;
        mdl.mag.position.copy(mdl.magHome); mdl.mag.position.y -= out * 0.18; mdl.mag.position.x -= out * 0.05;
        mdl.mag.visible = !(t > 0.32 && t < 0.55);
      }
    } else if (mdl.mag && mdl.magHome) { mdl.mag.position.copy(mdl.magHome); mdl.mag.visible = true; }
    // melee
    if (this.state === 'melee' || (this.state === 'quick' && this.quickAction === 'melee')) {
      const dur = this.state === 'melee' ? this.meleeDur : this.quickDur;
      const t = (this.state === 'melee' ? this.meleeT : this.quickT) / dur;
      const heavy = this.state === 'melee' && this.meleeHeavy;
      const wind = t < 0.3 ? t / 0.3 : 1;
      const swing = t < 0.3 ? 0 : Math.min(1, (t - 0.3) / 0.25);
      const back = t > 0.6 ? (t - 0.6) / 0.4 : 0;
      if (heavy) { rot.x += wind * 1.2 - swing * 2.2 + back * 1.0; pos.y += wind * 0.08 - swing * 0.15 + back * 0.07; }
      else { rot.y += wind * 0.9 - swing * 1.9 + back * 1.0; pos.x += wind * 0.1 - swing * 0.25 + back * 0.15; rot.z += -wind * 0.4 + swing * 0.6 - back * 0.2; }
    }
    if (this.state === 'quick' && this.quickAction === 'grenade') {
      const t = this.quickT / this.quickDur;
      pos.y -= Math.sin(t * Math.PI) * 0.25; rot.x -= Math.sin(t * Math.PI) * 0.6;
    }
    if (this.state === 'quick' && this.quickAction === 'heal') {
      const t = this.quickT / this.quickDur;
      pos.y -= Math.sin(t * Math.PI) * 0.22; rot.z += Math.sin(t * Math.PI) * 0.5;
    }
    // detalles
    if (mdl.pump) mdl.pump.position.z = (def.model.arch === 'syringe' ? 0 : -0.25) + Math.sin(Math.min(1, this.pumpAnim) * Math.PI) * 0.08 + (this.syringeAnim ? -this.syringeAnim * 0.05 : 0);
    if (mdl.handLFollow === 'pump' && mdl.pump) { const dz = mdl.pump.position.z + 0.25; mdl.armParts.slice(2).forEach((o, i) => { o.position.z = mdl.handLHome[i] + dz; }); }
    if (mdl.slide) mdl.slide.position.z = (def.model.arch === 'sniper' ? 0.05 : -0.045) + this.slideAnim * 0.04 + (def.model.arch === 'sniper' ? Math.sin(Math.min(1, this.pumpAnim) * Math.PI) * 0.06 : 0);
    if (mdl.cylinder) { mdl.cylinder.rotation.z = damp(mdl.cylinder.rotation.z, this.cylAnim || 0, 20, dt); if (this.state === 'reload') mdl.cylinder.position.x = Math.sin(Math.min(1, this.reloadPhase) * Math.PI) * 0.04; else mdl.cylinder.position.x = 0; }
    if (mdl.extra.length && mdl.glowMat) { const pulse = 0.6 + Math.sin(performance.now() * 0.01) * 0.2 + this.kick * 2; for (const c of mdl.extra) c.scale.setScalar(0.9 + pulse * 0.15); }
    if (mdl.pilot) mdl.pilot.scale.setScalar(0.8 + Math.random() * 0.5 + this.weldAnim);
    if (def.model.arch === 'syringe' && mdl.mag) mdl.mag.scale.z = Math.max(0.05, this.syringe / 100);
    if (def.model.arch === 'welder' && this.weldAnim > 0) { pos.x += rand(-0.002, 0.002); pos.y += rand(-0.002, 0.002); }
    if (this.spin > 0 && def.fire.spinUp) rot.z += Math.sin(performance.now() * 0.05) * 0.004 * this.spin;
    g.position.copy(pos);
    g.rotation.copy(rot);
    // con mira telescópica se oculta el arma al apuntar
    const scoped = (def.ads?.sight || '').startsWith('scope') && a > 0.85;
    g.visible = !scoped;
    this.scoped = scoped;
  }

  // FOV objetivo para la cámara
  targetFov(base) {
    const d = this.current?.def;
    if (!d || !d.ads) return base;
    return base + (d.ads.fov - base) * this.ads;
  }
  adsSensMult() {
    const d = this.current?.def;
    if (!d?.ads) return 1;
    return 1 - this.ads * (1 - d.ads.fov / 80) * 0.9;
  }

  // reponer munición (compras/apoyo)
  ammoMissing(inst) { return Math.max(0, inst.stats.maxAmmo - inst.mag - inst.reserve); }
}

function v3(v) { return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]; }
export { GROUPS };

let _flashTex = null;
function flashTexture() {
  if (_flashTex) return _flashTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.25, 'rgba(255,200,120,0.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,220,160,0.8)'; ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4 + 0.3; ctx.beginPath(); ctx.moveTo(32 - Math.cos(a) * 30, 32 - Math.sin(a) * 30); ctx.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); ctx.stroke(); }
  _flashTex = new THREE.CanvasTexture(c);
  return _flashTex;
}
