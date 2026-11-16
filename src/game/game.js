// Sesión de juego: orquesta mundo, jugador, armas, IA, oleadas, economía, Tiempo Muerto,
// progresión, red cooperativa (anfitrión autoritativo) y HUD. Un objeto por partida.
import * as THREE from 'three';
import { World } from '../world/world.js';
import { FX } from '../render/fx.js';
import { EnemyManager, STATE, voiceWarmJobs } from '../ai/enemies.js';
import { BossController } from '../ai/boss.js';
import { cloakMaterial as cloakMat, burnMaterial as burnMat } from '../render/enemyModels.js';
import { DIFFICULTIES, ENEMIES } from '../ai/enemyDefs.js';
import { Projectiles } from '../weapons/projectiles.js';
import { WeaponSystem } from '../weapons/weapons.js';
import { WEAPONS } from '../weapons/weaponDefs.js';
import { Combat } from './combat.js';
import { LocalPlayer } from './player.js';
import { WaveDirector, PHASE, Objective } from './waves.js';
import { Trader } from './trader.js';
import { PERKS, buildMods } from './perks.js';
import { RemotePlayer } from '../render/playerModel.js';
import { audio } from '../audio/audio.js';
import { bus } from '../core/events.js';
import { saveSys, COSMETICS } from '../save/save.js';
import { rand, clamp, uid } from '../core/utils.js';

export class Game {
  constructor(app, cfg) {
    this.app = app;
    this.cfg = cfg;
    this.renderer = app.renderer;
    this.input = app.input;
    this.net = cfg.net || null;
    this.authority = !this.net || this.net.isHost;
    this.diff = DIFFICULTIES[cfg.difficulty];
    this.perkId = cfg.perk;
    this.perkGrenade = PERKS[cfg.perk].grenade;
    this.time = 0;
    this.paused = false;
    this.over = false;
    this.zed = { active: false, t: 0, cd: 0, ext: 0 };
    this.timeScale = 1;
    this.remote = new Map();
    this.cashDrops = new Map();
    this.sessionXp = {};
    this.levelUps = [];
    this.recentKills = [];
    this.kills = 0;
    this.startTime = performance.now();
    this.interactHoldT = 0;

    const settings = saveSys.data.settings;
    this.renderer.scene.clear();
    this.renderer.scene.add(this.renderer.camera);
    this.world = new World(this.renderer.scene, cfg.map, settings);
    this.fx = new FX(this.renderer.scene, settings);
    this.fx.setPixelScale(window.innerHeight);
    this.combat = new Combat(this);
    this.enemies = new EnemyManager(this);
    this.enemies.authority = this.authority;
    this.enemies.dmgMult = this.diff.dmg;
    this.projectiles = new Projectiles(this);
    this.trader = new Trader(this);

    // jugador local
    const id = this.net ? this.net.id : 'solo';
    this.local = new LocalPlayer(this, id, saveSys.data.profile.name);
    this.local.perk = cfg.perk;
    const perkSave = saveSys.perk(cfg.perk);
    this.perkLevel = perkSave.level;
    this.local.applyMods(buildMods(cfg.perk, perkSave.level, perkSave.talents));
    this.weapons = new WeaponSystem(this, this.local);
    const outfit = COSMETICS.outfits.find((o) => o.id === saveSys.data.selected.outfit) || COSMETICS.outfits[0];
    this.weapons.skin = { sleeve: outfit.sleeve, glove: outfit.glove };
    const finish = COSMETICS.finishes.find((f) => f.id === saveSys.data.selected.finish);
    this._applyFinish(finish);
    this._giveStartingLoadout();
    this.enemies.playerScale = Math.max(1, cfg.players?.length || 1);
    for (const inst of this.weapons.inv) this.weapons.modelFor(inst);
    this._precompile();

    // jugadores remotos
    if (cfg.players) for (const p of cfg.players) if (p.id !== id) {
      const o = COSMETICS.outfits.find((x) => x.id === p.outfit) || COSMETICS.outfits[0];
      this.remote.set(p.id, new RemotePlayer(this.renderer.scene, { ...p, outfit: o }));
    }
    // posición inicial
    const starts = this.world.def.playerStarts;
    const myIndex = cfg.players ? Math.max(0, cfg.players.findIndex((p) => p.id === id)) : 0;
    const st = starts[myIndex % starts.length];
    this.local.spawnAt(st[0], st[1], Math.PI);
    this.local.credits = this.diff.startCash;

    this.waves = new WaveDirector(this, cfg.length);
    this.boss = null;

    // linterna
    this.flashlight = new THREE.SpotLight(0xfff4e0, 0, 28, 0.42, 0.45, 1.4);
    this.flashlight.position.set(0, 0, 0);
    this.renderer.camera.add(this.flashlight);
    this.flashlight.target.position.set(0, 0, -1);
    this.renderer.camera.add(this.flashlight.target);

    this._busOff = [
      bus.on('enemyDamaged', (d) => this._onEnemyDamaged(d)),
    ];
    if (this.net) this.net.attachGame(this);
    audio.music?.start(this.world.def.music, 0);
    // precalentar sonidos: armas en posesión y de clase primero, luego voces y el resto
    const wjobs = [...new Set([...this.weapons.inv.map((i) => i.def), ...PERKS[this.perkId].weapons.map((id) => WEAPONS[id]), ...Object.values(WEAPONS)])].filter((d) => d.fire && d.fire.mode !== 'melee').map((d) => () => audio.weaponBuffer(d));
    audio.warm([...wjobs.slice(0, 8), ...voiceWarmJobs(), ...wjobs.slice(8)]);
    this.hud = app.hud;
    this.hud.attach(this);
    this.renderer.vmScene.visible = true;
  }

  // Precompila shaders y crea modelos de todos los tipos de engendro para evitar tirones
  _precompile() {
    const scene = this.renderer.scene;
    const tmp = [];
    for (const t of Object.keys(ENEMIES)) {
      const m = this.enemies._getModel(t);
      m.root.position.set(0, -50, 0);
      scene.add(m.root);
      tmp.push([t, m]);
    }
    // materiales de proyectiles y objetos ocultos (calcomanías, etc.)
    const dummies = Object.values(this.projectiles.mats).map((mat) => { const d = new THREE.Mesh(this.projectiles.geos.sphere, mat); d.position.y = -50; scene.add(d); return d; });
    for (const mat of [cloakMat, burnMat]) { const d = new THREE.Mesh(this.projectiles.geos.sphere, mat); d.position.y = -50; scene.add(d); dummies.push(d); }
    const hidden = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { this.renderer.gl.compile(scene, this.renderer.camera); this.renderer.gl.compile(this.renderer.vmScene, this.renderer.vmCamera); } catch (e) { console.warn(e); }
    for (const o of hidden) o.visible = false;
    for (const d of dummies) scene.remove(d);
    for (const [t, m] of tmp) { scene.remove(m.root); this.enemies.pools.get(t).push(m); }
  }

  _applyFinish(finish) {
    // acabado cosmético: se aplica tiñendo el color principal de cada arma al construir su modelo
    this._finishColor = finish?.color ?? null;
    if (this._finishColor !== null) {
      const orig = this.weapons.modelFor.bind(this.weapons);
      this.weapons.modelFor = (inst) => {
        const had = this.weapons.models.has(inst.def.id);
        if (!had && inst.def.model && inst.def.cat !== 'tool' && inst.def.cat !== 'melee') {
          const saved = inst.def.model.color;
          inst.def.model.color = this._finishColor;
          const m = orig(inst);
          inst.def.model.color = saved;
          return m;
        }
        return orig(inst);
      };
    }
  }

  _giveStartingLoadout() {
    const w = this.weapons;
    w.addWeapon('machete');
    w.addWeapon('p9');
    w.addWeapon('syringe');
    w.addWeapon('welder');
    const start = PERKS[this.perkId].start;
    if (start) w.addWeapon(start, { spent: Math.round(WEAPONS[start].price) });
    w.grenades = Math.min(w.grenadeMax(), 2 + Math.floor((this.perkLevel || 0) / 10));
    w.equip(w.get(start) || w.get('p9'), true);
    this.local.armor = 0;
  }

  // ------------------------------------------------------------ jugadores
  getPlayers() {
    const list = [this.local];
    for (const r of this.remote.values()) list.push(r);
    return list;
  }

  // ------------------------------------------------------------ bucle principal
  update(dtReal) {
    if (this.over && !this.overLinger) return;
    const input = this.input;
    const active = input.locked && !this.paused && !this.app.ui.blocking;
    // Tiempo Muerto
    if (this.zed.active) {
      this.zed.t -= dtReal;
      if (this.zed.t <= 0) this._endZed();
    } else if (this.zed.cd > 0) this.zed.cd -= dtReal;
    this.timeScale = this.zed.active ? 0.22 : 1;
    const dt = this.paused && !this.net ? 0 : dtReal * this.timeScale;
    const dtPlayer = this.paused && !this.net ? 0 : dtReal * (this.zed.active ? 0.55 : 1);
    this.local.zedSpeed = 1;
    this.time += dt;

    if (!this.paused || this.net) {
      // ratón
      const md = input.consumeMouse();
      input.mouse.wheel = md.wheel;
      if (active && this.local.alive && !this.local.downed) this.local.look(md.dx, md.dy, saveSys.data.settings.sensitivity, saveSys.data.settings.invertY, this.weapons.adsSensMult());
      input.mouse.dx = md.dx; input.mouse.dy = md.dy;
      this._handleInput(active, dtPlayer);
      this.local.update(dtPlayer, input, active);
      this.weapons.update(dtPlayer, input, active, this.zed.active);
      input.mouse.dx = 0; input.mouse.dy = 0;
      this.enemies.update(dt, this.getPlayers());
      this.projectiles.update(dt);
      this.fx.update(dt);
      this.world.update(dt, this.renderer.camera.position);
      if (this.waves) this.waves.update(dt);
      for (const r of this.remote.values()) r.update(dtReal);
      this._updateCash(dt);
      this._updateDowned(dtReal);
      this.recentKills = this.recentKills.filter((t) => this.time - t < 1.2);
    }
    // cámara y audio
    const cam = this.renderer.camera;
    const baseFov = saveSys.data.settings.fov || 85;
    let fov = this.weapons.targetFov(baseFov) + (this.local.sprinting ? 4 : 0) + this.local.fovKick;
    if (this.zed.active) fov -= 6;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = THREE.MathUtils.lerp(cam.fov, fov, Math.min(1, dtReal * 14)); cam.updateProjectionMatrix(); }
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    audio.updateListener(cam.position, this.local.forward, up);
    if ((this._indoorT = (this._indoorT || 0) - dtReal) <= 0) { this._indoorT = 0.5; audio.setIndoor(this.world.isIndoor(this.local.pos.x, this.local.pos.z)); }
    this.flashlight.intensity = this.local.flashlight ? 40 : 0;
    this.renderer.vmScene.visible = this.local.alive && !this.local.downed;
    // red
    if (this.net) this.net.tick(dtReal);
    this.hud.update(dtReal);
    // estadísticas de tiempo
    saveSys.data.stats.playtime += dtReal;
    input.endFrame();
  }

  _handleInput(active, dt) {
    const input = this.input, p = this.local;
    if (!active) return;
    if (input.hit('flashlight')) { p.flashlight = !p.flashlight; audio.play('flashlight', { volume: 0.4 }); }
    if (input.hit('dropCash') && this.net) this.dropCash(50);
    if (input.hit('chat') && this.net) { this.hud.openChat(this.net, input); return; }
    if (input.codeHit('KeyL') || input.codeHit('F1')) this.voteReady();
    // interacción (E)
    const holding = input.down('interact');
    const pressed = input.hit('interact');
    if (!p.alive || p.downed) return;
    if (pressed) {
      // comerciante
      const pod = this.waves.activePod;
      if (pod && (this.waves.phase === PHASE.TRADER || this.waves.phase === PHASE.PREP) && p.pos.distanceTo(pod.pos) < 3.2) { this.app.ui.openTrader(this); return; }
      // objetivo: recoger
      if (this.objective()?.interact(p, dt, false)) return;
      // reabastecer compañero (Apoyo)
      const mate = this.findTeammateInFront(2.5);
      if (mate && !mate.downed && p.mods?.resupply) { this.resupply(mate); return; }
      // puertas
      const door = this.findDoorInFront(2.6);
      if (door && door.weld <= 0 && !door.destroyed) this.toggleDoor(door);
    }
    if (holding) {
      // reanimar compañero
      const downed = [...this.remote.values()].find((r) => r.downed && r.pos.distanceTo(p.pos) < 2);
      if (downed) {
        this.interactHoldT += dt * (p.mods?.reviveSpeed || 1);
        this.hud.setHoldProgress(this.interactHoldT / 3, `Reanimando a ${downed.name}`);
        if (this.interactHoldT >= 3) { this.interactHoldT = 0; this.net?.sendTo(downed.id, 'revive', { hp: p.mods?.reviveSpeed > 1 ? 60 : 40 }); audio.play('revive', { volume: 0.6 }); this.addPerkXp('medic', 60); }
        return;
      }
      if (this.objective()?.interact(p, dt, true)) { this.hud.setHoldProgress(this.objective()?.progress / this.objective()?.goal, 'Reparando'); return; }
    }
    if (!holding) { this.interactHoldT = 0; this.hud.setHoldProgress(0); }
  }

  objective() { return this.waves?.objective; }

  // ------------------------------------------------------------ utilidades de búsqueda
  findDoorInFront(range) {
    const p = this.local, o = p.camPos, d = p.forward;
    let best = null, bt = range;
    for (const door of this.world.doors) {
      const b = door.box;
      // las puertas abiertas siguen siendo interactuables (su hueco)
      const mn = b.min, mx = b.max;
      const t = rayAABB(o, d, mn, mx);
      if (t >= 0 && t < bt) { bt = t; best = door; }
      else if (door.center.distanceTo(o) < 1.6 && !best) best = door;
    }
    if (best) this.lastWeldPoint = o.clone().addScaledVector(d, bt);
    return best;
  }

  findTeammateInFront(range) {
    const p = this.local;
    let best = null, bd = range;
    for (const r of this.remote.values()) {
      if (!r.alive) continue;
      const to = r.pos.clone().setY(r.pos.y + 1).sub(p.camPos);
      const d = to.length();
      if (d > bd) continue;
      if (to.normalize().dot(p.forward) < 0.8) continue;
      bd = d; best = r;
    }
    return best;
  }

  raycastTeammates(o, d, maxT) {
    let best = null;
    for (const r of this.remote.values()) {
      if (!r.alive || r.downed) continue;
      const c = r.pos.clone(); c.y += 1;
      const lx = c.x - o.x, ly = c.y - o.y, lz = c.z - o.z;
      const tca = lx * d.x + ly * d.y + lz * d.z;
      if (tca < 0 || tca > maxT) continue;
      const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
      if (d2 < 0.45 * 0.45 && (!best || tca < best.t)) best = { player: r, t: tca };
    }
    return best;
  }

  // ------------------------------------------------------------ puertas
  doorState(d) { return { i: d.index, c: d.closed ? 1 : 0, w: Math.round(d.weld), x: d.destroyed ? 1 : 0, r: Math.round(d.repair) }; }
  applyDoorState(s) {
    const d = this.world.doors[s.i];
    if (!d) return;
    const wasDestroyed = d.destroyed;
    d.closed = !!s.c; d.weld = s.w; d.destroyed = !!s.x; d.repair = s.r; d.box.solid = d.closed && !d.destroyed;
    if (!wasDestroyed && d.destroyed) { audio.play('door_break', { pos: d.center, volume: 1 }); this.fx.explosion(d.center, 2, 'fire'); }
  }
  toggleDoor(door) {
    if (this.authority) {
      if (door.setClosed(!door.closed)) { audio.play('door_slide', { pos: door.center, volume: 0.6 }); this.net?.hostEvent('door', this.doorState(door)); }
    } else { door.setClosed(!door.closed); audio.play('door_slide', { pos: door.center, volume: 0.6 }); this.net.sendToHost('doorReq', { i: door.index, a: 'toggle' }); }
  }
  weldDoor(door, amount) {
    let applied = door.applyWeld(amount);
    if (!this.authority) { this.net.sendToHost('doorReq', { i: door.index, a: 'weld', v: amount }); }
    else if (this.net) { this._doorDirty = this._doorDirty || new Set(); this._doorDirty.add(door); }
    if (door.repair >= 100 && door._wasRepairing) { door._wasRepairing = false; audio.play('repair_done', { volume: 0.5 }); }
    if (door.destroyed) door._wasRepairing = true;
    if (amount > 0 && door.weld > 0) door.weldOwner = this.local.id;
    return Math.max(0, applied);
  }
  damageDoor(door, amount, enemy) {
    const broke = door.damage(amount);
    // trampas de talento en puertas soldadas
    if (door.weldOwner === this.local.id) {
      if (this.local.mods?.shockDoor && enemy) { this.damageEnemy(enemy, 25, 'body', 'electric', null, this.local.id, { stun: 0.6, perkMatch: true }); this.fx.arc(door.center, enemy.center(), [0.5, 0.8, 1], 6, 0.3, 0.12); }
      if (broke && this.local.mods?.doorTrap) this.combat.explode(door.center.clone(), 5, 400, 'explosive', this.local.id, { perkMatch: true });
    }
    if (broke) { audio.play('door_break', { pos: door.center, volume: 1, priority: true }); this.fx.explosion(door.center.clone(), 2.2, 'fire'); bus.emit('toast', { text: `¡Han derribado la puerta: ${door.name}!`, kind: 'bad' }); }
    this.net?.hostEvent('door', this.doorState(door));
    return broke;
  }

  // ------------------------------------------------------------ daño
  damageEnemy(e, amount, zone, type, dir, shooter, opts = {}) {
    if (!e || e.dead) return null;
    const mods = shooter === this.local.id ? this.local.mods : null;
    if (mods) {
      if (mods.eliteDmg !== 1) opts.eliteMult = mods.eliteDmg;
      if (mods.bigDmg !== 1) opts.bigMult = mods.bigDmg;
      if (mods.fireHead) opts.fireHead = true;
      if (opts.headStack && zone === 'head') { const ws = opts.headStack; ws.headStack = Math.min(5, ws.headStack + 1); amount *= 1 + ws.headStack * mods.headStack; }
      else if (opts.headStack) opts.headStack.headStack = 0;
    }
    if (this.authority) {
      const res = this.enemies.damage(e, amount, zone, type, dir, shooter, opts);
      if (shooter === this.local.id) this._localHitFeedback(e, res, zone, opts);
      return res;
    }
    // cliente: efectos inmediatos y envío al anfitrión
    if (!opts.noBlood && dir && opts.point) this.fx.bloodHit(opts.point, dir, zone === 'head' ? 1.4 : 0.8);
    e.revealT = 1.5;
    if (opts.burn && type === 'fire') e.burnT = 3;
    const pkt = { id: e.id, a: +amount.toFixed(1), z: zone, t: type, o: {} };
    if (dir) pkt.d = [+dir.x.toFixed(2), +dir.y.toFixed(2), +dir.z.toFixed(2)];
    for (const k of ['headMult', 'stumble', 'burn', 'knockback', 'stun', 'poison', 'explosion', 'gib', 'perkMatch', 'eliteMult', 'bigMult', 'fireHead', 'dot', 'noBlood']) if (opts[k] !== undefined) pkt.o[k] = opts[k];
    pkt.o.weapon = opts.weapon;
    this.net.sendToHost('hit', pkt);
    // retroalimentación predictiva
    const resist = e.def.resist[type] ?? 1;
    const est = amount * resist * (zone === 'head' ? (opts.headMult || 1.5) : 1);
    this._localHitFeedback(e, { dealt: est, killed: false, headshot: zone === 'head' }, zone, opts);
    this.local.stats.damage += est;
    this._xpFromDamage(e, est, type, opts, zone === 'head');
    return null;
  }

  _localHitFeedback(e, res, zone, opts) {
    if (!res) return;
    if (!opts.dot) bus.emit('hitmarker', { head: zone === 'head', kill: res.killed, big: e.def.big });
    this.local.stats.hits++;
  }

  _onEnemyDamaged(d) {
    if (d.shooter !== this.local.id) return;
    this.local.stats.damage += d.dmg;
    this._xpFromDamage(d.enemy, d.dmg, d.type, { perkMatch: d.perkMatch, weapon: d.weapon }, d.headshot);
  }

  _xpFromDamage(e, dmg, type, opts, headshot) {
    const perk = this.perkId;
    const w = WEAPONS[opts.weapon];
    const perkWeapon = w && w.perk === perk;
    let xp = 0;
    if (perk === 'demo' && (type === 'explosive' || type === 'ballistic' && perkWeapon)) xp = dmg * 0.035;
    else if (perk === 'fire' && type === 'fire') xp = dmg * 0.045;
    else if (perk === 'tesla' && type === 'electric') xp = dmg * 0.04;
    else if (perk === 'sniper' && perkWeapon) xp = dmg * 0.015 + (headshot ? 6 : 0);
    else if (perkWeapon) xp = dmg * 0.035;
    if (xp > 0) this.addPerkXp(perk, xp * (this.diff.xp || 1));
  }

  damagePlayer(id, amount, type, sourcePos, silent = false) {
    if (id === this.local.id) { this.local.takeDamage(amount, type === 'sonic' ? 'melee' : type, sourcePos, silent); return; }
    if (this.authority && this.net) this.net.sendTo(id, 'dmg', { a: +amount.toFixed(1), t: type, s: sourcePos ? [+sourcePos.x.toFixed(1), +sourcePos.z.toFixed(1)] : null, q: silent ? 1 : 0 });
  }

  alertEnemies() { /* los engendros siempre conocen tu posición: el ruido acelera la reorientación */ for (const e of this.enemies.alive) if (e.targetT > 0.4) e.targetT = 0.4; }

  // ------------------------------------------------------------ bajas y recompensas
  onEnemyKilled(e, info) {
    if (this.waves && this.authority) this.waves.onKill();
    const local = info.shooter === this.local.id;
    this.kills++;
    if (local) {
      const p = this.local;
      p.stats.kills++;
      if (info.headshot) p.stats.headshots++;
      if (e.def.big) p.stats.largeKills++;
      const credits = Math.round(e.def.credits * (this.diff.credits || 1) * (e.elite ? 1.5 : 1));
      this.addCredits(credits);
      bus.emit('killfeed', { enemy: e.def.name, headshot: info.headshot, credits, weapon: info.weapon });
      saveSys.data.stats.killsByType[e.type] = (saveSys.data.stats.killsByType[e.type] || 0) + 1;
      const w = WEAPONS[info.weapon];
      const perkKill = w && w.perk === this.perkId;
      this.addPerkXp(this.perkId, e.def.xp * (perkKill ? 1 : 0.35) * (this.diff.xp || 1));
      const mods = p.mods || {};
      if (perkKill && mods.killRefill && this.weapons.current?.def.id === info.weapon) { const inst = this.weapons.current; const add = Math.min(mods.killRefill, inst.stats.mag - inst.mag, inst.reserve); inst.mag += add; inst.reserve -= add; }
      if (mods.killArmor && info.type === 'electric') p.armor = Math.min(p.maxArmor, p.armor + mods.killArmor);
      // extender Tiempo Muerto (Asalto)
      if (this.zed.active && perkKill && mods.zedExtend > 0 && this.zed.ext < 3) { this.zed.t += mods.zedExtend; this.zed.ext++; }
    }
    // Tiempo Muerto: solo lo decide la autoridad
    if (this.authority) {
      this.recentKills.push(this.time);
      let chance = 0.035;
      if (info.headshot) chance += 0.04;
      if (e.def.big) chance += 0.3;
      if (this.recentKills.length >= 3) chance += 0.15;
      if (e.def.boss) chance = 1;
      if (!this.zed.active && this.zed.cd <= 0 && Math.random() < chance) this.startZed(e.def.boss ? 4 : 3);
    }
    if (this.authority && this.net) this.net.hostEvent('ekill', { id: e.id, s: info.shooter, h: info.headshot ? 1 : 0, g: info.gib ? 1 : 0, w: info.weapon, d: info.dir ? [+info.dir.x.toFixed(2), +info.dir.y.toFixed(2), +info.dir.z.toFixed(2)] : null, ex: info.explosion ? 1 : 0 });
    if (e.def.boss) this.onBossKilled(e);
  }

  addCredits(n) {
    this.local.credits += n;
    this.local.stats.creditsEarned += n;
    bus.emit('credits', n);
  }

  rewardAll(amount, reason, xp = 0) {
    if (!this.authority) return;
    this._receiveReward(amount, reason, xp);
    this.net?.hostEvent('reward', { a: amount, r: reason, x: xp });
  }
  _receiveReward(amount, reason, xp) {
    if (this.local.alive || this.local.downed) this.addCredits(amount);
    else this.addCredits(Math.round(amount * 0.5));
    if (xp) this.addPerkXp(this.perkId, xp * (this.diff.xp || 1));
    bus.emit('toast', { text: `${reason}: +${amount} ₵`, kind: 'good' });
  }

  addPerkXp(perk, amount) {
    if (amount <= 0 || perk !== this.perkId) return; // solo la clase activa gana experiencia
    this.sessionXp[perk] = (this.sessionXp[perk] || 0) + amount;
    const gained = saveSys.addXp(perk, amount);
    if (gained > 0) {
      this.perkLevel = saveSys.perk(perk).level;
      this.levelUps.push({ perk, level: this.perkLevel });
      audio.play('levelup', { volume: 0.7, bus: 'ui' });
      bus.emit('toast', { text: `¡${PERKS[perk].name} sube a nivel ${this.perkLevel}!`, kind: 'level' });
      // las mejoras de nivel se aplican en el siguiente descanso para no alterar el combate
      this._pendingMods = true;
    }
  }

  refreshMods() {
    const ps = saveSys.perk(this.perkId);
    this.local.applyMods(buildMods(this.perkId, ps.level, ps.talents), true);
    this.weapons.refreshStats();
    this._pendingMods = false;
  }

  healTeammate(target, amount, viaDart = false, silent = false) {
    const p = this.local;
    const mods = p.mods || {};
    if (target === p) { const h = p.heal(amount); p.stats.healed += h; return; }
    if (target.isRemote) {
      this.net?.sendTo(target.id, 'heal', { a: +amount.toFixed(1), armor: mods.healArmor || 0, shield: mods.healShield ? 5 : 0, haste: mods.healHaste ? 4 : 0, from: p.name });
      const est = Math.min(amount, target.maxHp - target.hp);
      p.stats.healed += est;
      saveSys.addStat('healed', est);
      this.addPerkXp('medic', est * 1.2 * (this.diff.xp || 1));
      if (!silent) { this.fx.healPuff(target.pos); bus.emit('toast', { text: `Has curado a ${target.name} (+${Math.round(est)})`, kind: 'good' }); }
      if (mods.healHaste) p.hasteT = 4;
      if (viaDart) bus.emit('hitmarker', { head: false, heal: true });
    }
  }

  resupply(mate) {
    this._resupplied = this._resupplied || new Set();
    const key = mate.id + ':' + this.waves.wave;
    if (this._resupplied.has(key)) { bus.emit('toast', { text: 'Ya has reabastecido a este compañero en esta oleada', kind: 'bad' }); return; }
    this._resupplied.add(key);
    this.net?.sendTo(mate.id, 'resupply', { from: this.local.name });
    this.addPerkXp('support', 80);
    audio.play('pickup', { volume: 0.6 });
    bus.emit('toast', { text: `Munición entregada a ${mate.name}`, kind: 'good' });
  }

  receiveResupply(from) {
    for (const inst of this.weapons.inv) if (inst.def.mag) inst.reserve = Math.min(inst.stats.maxAmmo - inst.mag, inst.reserve + Math.ceil(inst.stats.maxAmmo * 0.25));
    this.weapons.grenades = Math.min(this.weapons.grenadeMax(), this.weapons.grenades + 1);
    bus.emit('toast', { text: `${from} te ha dado munición`, kind: 'good' });
    bus.emit('ammo');
    audio.play('pickup', { volume: 0.6 });
  }

  // ------------------------------------------------------------ dinero compartido
  dropCash(amount) {
    if (this.local.credits < amount) return;
    this.local.credits -= amount;
    const id = uid() + '_' + this.local.id;
    const pos = this.local.pos.clone().addScaledVector(this.local.forward.clone().setY(0).normalize(), 1.5);
    this._spawnCash(id, pos, amount, this.local.id);
    this.net?.sendFx({ k: 'cash', id, p: [pos.x, pos.z], a: amount, by: this.local.id });
    audio.play('cash_drop', { volume: 0.6 });
    bus.emit('credits');
  }
  _spawnCash(id, pos, amount, by) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.18), new THREE.MeshStandardMaterial({ color: 0x40c060, emissive: 0x104010 }));
    m.position.set(pos.x, 0.3, pos.z);
    this.renderer.scene.add(m);
    this.cashDrops.set(id, { id, mesh: m, amount, by, t: 0 });
  }
  _updateCash(dt) {
    for (const c of this.cashDrops.values()) {
      c.t += dt; c.mesh.rotation.y += dt * 2; c.mesh.position.y = 0.3 + Math.sin(c.t * 3) * 0.08;
      if (c.t > 1 && !c.claimed && c.mesh.position.distanceTo(this.local.pos.clone().setY(0.3)) < 1.2) {
        c.claimed = true;
        if (this.authority) this.claimCash(c.id, this.local.id); else this.net.sendToHost('cashPick', { id: c.id });
      }
    }
  }
  claimCash(id, by) {
    const c = this.cashDrops.get(id);
    if (!c || c.taken) return;
    c.taken = true;
    this._removeCash(id, by);
    this.net?.hostEvent('cashTaken', { id, by });
  }
  _removeCash(id, by) {
    const c = this.cashDrops.get(id);
    if (!c) return;
    this.renderer.scene.remove(c.mesh);
    this.cashDrops.delete(id);
    if (by === this.local.id) { this.addCredits(c.amount); audio.play('cash_drop', { volume: 0.6 }); }
  }

  // ------------------------------------------------------------ Tiempo Muerto
  startZed(dur = 3) {
    if (this.zed.active) return;
    this.zed.active = true; this.zed.t = dur; this.zed.ext = 0;
    audio.play('zed_in', { volume: 0.9, bus: 'ui', noTimeScale: true });
    audio.setSlowmo(true);
    bus.emit('zed', true);
    saveSys.addStat('zedTimes');
    if (this.local.mods?.zedHeal) {
      this.local.heal(this.local.mods.zedHeal);
      for (const r of this.remote.values()) if (r.pos.distanceTo(this.local.pos) < 12) this.healTeammate(r, this.local.mods.zedHeal, false, true);
    }
    if (this.authority) this.net?.hostEvent('zed', { d: dur });
  }
  _endZed() {
    this.zed.active = false; this.zed.cd = 7;
    audio.play('zed_out', { volume: 0.8, bus: 'ui' });
    audio.setSlowmo(false);
    bus.emit('zed', false);
  }

  // ------------------------------------------------------------ jefe
  spawnBoss() {
    if (!this.authority) return;
    const spawns = this.world.def.spawns.filter((s) => !s.vent);
    let best = spawns[0], bd = -1;
    for (const s of spawns) { const d = this.local.pos.distanceTo(new THREE.Vector3(s.exit[0], 0, s.exit[1])); if (d > bd && d < 70) { bd = d; best = s; } }
    const e = this.enemies.spawn('primogenito', best.exit[0], best.exit[1], { hpMult: this.waves.endless ? 1 + Math.floor(this.waves.wave / 5 - 1) * 0.35 : 1 });
    this.boss = new BossController(this, e);
    bus.emit('bossSpawn', e);
  }
  onBossKilled(e) {
    if (this.boss) { this.boss.dispose(); this.boss = null; }
    bus.emit('bossDead', e);
    if (this.local.stats) this.local.stats.bossKill = true;
    saveSys.addStat('bossKills');
    // los esbirros restantes se desmoronan
    if (this.authority) setTimeout(() => {
      for (const m of [...this.enemies.alive]) this.enemies.kill(m, { shooter: null, headshot: false, type: 'ballistic' });
      if (!this.over && this.waves.phase === PHASE.BOSS) this.waves.endWave();
    }, 1500);
  }

  // ------------------------------------------------------------ jugador abatido / muerte
  onLocalPlayerDown() {
    const p = this.local;
    p.grabbedBy = null;
    if (p.carry) p.carry = null;
    if (!this.net || this.remote.size === 0) {
      p.alive = false;
      p.stats.deaths++;
      audio.play('downed', { volume: 0.8, bus: 'ui' });
      this.defeat();
      return;
    }
    p.downed = true; p.downedTimer = 30; p.hp = 0;
    audio.play('downed', { volume: 0.8, bus: 'ui' });
    bus.emit('toast', { text: '¡Estás abatido! Un compañero puede reanimarte', kind: 'bad' });
    this.weapons.stopLoop();
  }
  _updateDowned(dt) {
    const p = this.local;
    if (p.downed) {
      p.downedTimer -= dt;
      if (p.downedTimer <= 0) { p.downed = false; p.alive = false; p.stats.deaths++; bus.emit('toast', { text: 'Has muerto. Reaparecerás al terminar la oleada.', kind: 'bad' }); }
    }
    if (this.authority && this.net && !this.over && this.waves.phase !== PHASE.TRADER && this.waves.phase !== PHASE.PREP) {
      const all = this.getPlayers();
      if (all.every((q) => !q.alive || q.downed)) { this.defeat(); this.net.hostEvent('gameover', { win: 0 }); }
    }
  }
  receiveRevive(hp) {
    const p = this.local;
    if (!p.downed) return;
    p.downed = false; p.hp = hp; p.alive = true;
    audio.play('revive', { volume: 0.7, bus: 'ui' });
    bus.emit('toast', { text: '¡Te han reanimado!', kind: 'good' });
  }
  respawnDeadPlayers() {
    const p = this.local;
    if (!p.alive || p.downed) this.respawnLocal();
    this.net?.hostEvent('respawn', {});
  }
  respawnLocal() {
    const p = this.local;
    if (p.alive && !p.downed) return;
    const pod = this.waves.activePod;
    const sp = pod ? this.world.nav.nearestWalkable(pod.pos.x + 2, pod.pos.z + 2) : this.world.def.playerStarts[0];
    p.spawnAt(sp[0], sp[1], 0);
    // reaparece solo con el equipo básico
    for (const inst of [...this.weapons.inv]) if (!inst.def.unsellable) this.weapons.removeWeapon(inst.def.id);
    this.weapons.equip(this.weapons.get('p9'), true);
    bus.emit('toast', { text: 'Has reaparecido con el equipo básico', kind: 'info' });
  }

  onWaveSurvived(wave) {
    saveSys.addStat('wavesSurvived');
    if (this.local.waveDamage === 0 && wave >= 3 && this.local.alive) saveSys.addStat('cleanWaves');
    if (this._pendingMods) this.refreshMods();
    if (this.waves.endless) saveSys.setStatMax('bestEndless', wave);
    this.addPerkXp(this.perkId, (80 + wave * 30) * (this.diff.xp || 1));
    saveSys.save();
  }
  onObjectiveComplete() {
    this.local.stats.objectives++;
    saveSys.addStat('objectives');
  }

  voteReady() {
    if (this.waves.phase !== PHASE.TRADER && this.waves.phase !== PHASE.PREP) return;
    if (this.authority) this.waves.setReady(this.local.id);
    else this.net.sendToHost('ready', {});
    bus.emit('toast', { text: 'Listo para la siguiente oleada', kind: 'info' });
  }

  reportObjectiveWork(pid, dt) { if (this.authority) this.objective()?.addWork(dt); else this.net.sendToHost('objWork', { dt: +dt.toFixed(3) }); }
  reportObjectivePickup(pid) { if (this.authority) this.objective()?.pickup(pid); else this.net.sendToHost('objPick', {}); }
  applyObjectiveState(s) {
    const o = this.world.def.objectives;
    let obj = this.waves.objective;
    if (!obj || obj.kind !== s.k || obj.indexInMap() !== s.i) {
      if (obj) obj.cleanup();
      if (s.d || s.f) return;
      const list = s.k === 'carry' ? o.carry : s.k === 'repair' ? o.devices : o.zones;
      obj = new Objective(this, s.k, list[s.i]);
      this.waves.objective = obj;
      obj.start();
    }
    obj.progress = s.p; obj.time = s.t;
    if (s.c !== obj.carrier) { obj.carrier = s.c; this.local.carry = s.c === this.local.id ? obj : null; }
    if (s.d && !obj.done) { obj.done = true; audio.play('objective', { volume: 0.8, bus: 'ui' }); bus.emit('objectiveEnd', { ok: true, obj }); this.onObjectiveComplete(); obj.cleanup(); }
    if (s.f && !obj.failed) { obj.failed = true; audio.play('objective_fail', { volume: 0.7, bus: 'ui' }); bus.emit('objectiveEnd', { ok: false, reason: 'Fallido', obj }); obj.cleanup(); }
  }

  // ------------------------------------------------------------ final de partida
  victory() {
    if (this.over) return;
    this.over = true; this.won = true;
    this.overLinger = true;
    this.net?.hostEvent('gameover', { win: 1 });
    this._finish(true);
  }
  defeat() {
    if (this.over) return;
    this.over = true; this.won = false;
    this.overLinger = true;
    this._finish(false);
  }
  _finish(win) {
    const st = saveSys.data.stats, p = this.local;
    st.games++;
    if (win) { st.wins++; if (this.cfg.difficulty !== 'normal') st.winsHard++; }
    for (const k of ['kills', 'headshots', 'deaths', 'damage', 'healed', 'welded', 'creditsEarned']) if (k !== 'healed') st[k] += p.stats[k] || 0;
    st.healed += p.stats.healed || 0;
    st.bigKills += p.stats.largeKills || 0;
    const key = `${this.cfg.map}|${this.cfg.difficulty}|${this.cfg.length}`;
    saveSys.record('bestWave|' + key, this.waves.wave);
    if (win) saveSys.record('win|' + key, Math.round((performance.now() - this.startTime) / 1000), (a, b) => a < b);
    saveSys.record('mostKills', p.stats.kills);
    const challenges = saveSys.checkChallenges();
    saveSys.save();
    setTimeout(() => {
      this.overLinger = false;
      this.app.ui.showResults(this, win, challenges);
    }, win ? 3500 : 2500);
    audio.music?.setIntensity(0);
    if (win) bus.emit('toast', { text: '¡VICTORIA! La Estación resiste.', kind: 'level' });
  }

  dispose() {
    this._busOff.forEach((f) => f());
    this.weapons.stopLoop();
    this.enemies.clear();
    this.projectiles.clear();
    this.fx.clear();
    if (this.boss) this.boss.dispose();
    for (const r of this.remote.values()) r.dispose();
    this.world.dispose();
    this.renderer.vmScene.remove(this.weapons.vmRoot);
    this.renderer.camera.remove(this.flashlight, this.flashlight.target);
    this.renderer.scene.clear();
    this.renderer.scene.add(this.renderer.camera);
    audio.setSlowmo(false);
    if (this.net) this.net.detachGame();
  }
}

function rayAABB(o, d, mn, mx) {
  let tmin = 0, tmax = 1e9;
  const O = [o.x, o.y, o.z], D = [d.x, d.y, d.z];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(D[a]) < 1e-9) { if (O[a] < mn[a] - 0.15 || O[a] > mx[a] + 0.15) return -1; continue; }
    let t1 = (mn[a] - 0.15 - O[a]) / D[a], t2 = (mx[a] + 0.15 - O[a]) / D[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

export { STATE, ENEMIES, clamp, rand };
