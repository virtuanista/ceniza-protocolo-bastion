// Proyectiles y áreas persistentes: granadas, cohetes, cargas adhesivas, bengalas, orbes de
// tormenta, ácido enemigo, púas del jefe, charcos de fuego y nubes médicas. Mallas en pool.
import * as THREE from 'three';
import { audio } from '../audio/audio.js';
import { rand } from '../core/utils.js';

const GRAV = { grenade: 12, shrapnel: 4, rocket: 0, sticky: 9, flare: 2, orb: 0, handgrenade: 16, acid: 14, spike: 2, bomblet: 14, acidOrb: 0 };

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.scene = game.renderer.scene;
    this.list = [];
    this.areas = [];
    this.pool = new Map();
    this.mats = {
      grenade: new THREE.MeshStandardMaterial({ color: 0x4a5a2a, roughness: 0.5, metalness: 0.5 }),
      rocket: new THREE.MeshStandardMaterial({ color: 0x6a6a5a, roughness: 0.4, metalness: 0.7 }),
      glowOrange: new THREE.MeshBasicMaterial({ color: 0xff8030 }),
      glowRed: new THREE.MeshBasicMaterial({ color: 0xff2020 }),
      glowBlue: new THREE.MeshBasicMaterial({ color: 0x9fb0ff }),
      acid: new THREE.MeshBasicMaterial({ color: 0x9aff30 }),
      bone: new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.6, emissive: 0x401000 }),
      area: new THREE.MeshBasicMaterial({ color: 0xff6020, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }),
      areaHeal: new THREE.MeshBasicMaterial({ color: 0x30ff80, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
      areaRad: new THREE.MeshBasicMaterial({ color: 0xa0ff20, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
    };
    this.geos = {
      sphere: new THREE.SphereGeometry(0.06, 8, 6),
      big: new THREE.SphereGeometry(0.3, 12, 8),
      rocket: new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8).rotateX(Math.PI / 2),
      spike: new THREE.ConeGeometry(0.06, 0.6, 5).rotateX(-Math.PI / 2),
      disc: new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2),
    };
    this._v = new THREE.Vector3();
  }

  _mesh(kind, grenade) {
    let mesh;
    const key = kind;
    const p = this.pool.get(key);
    if (p && p.length) mesh = p.pop();
    else {
      if (kind === 'rocket') mesh = new THREE.Mesh(this.geos.rocket, this.mats.rocket);
      else if (kind === 'orb' || kind === 'acidOrb') mesh = new THREE.Mesh(this.geos.big, kind === 'orb' ? this.mats.glowBlue : this.mats.acid);
      else if (kind === 'spike') mesh = new THREE.Mesh(this.geos.spike, this.mats.bone);
      else if (kind === 'acid') mesh = new THREE.Mesh(this.geos.sphere, this.mats.acid);
      else if (kind === 'flare' || kind === 'shrapnel') mesh = new THREE.Mesh(this.geos.sphere, this.mats.glowOrange);
      else if (kind === 'sticky') mesh = new THREE.Mesh(this.geos.sphere, this.mats.glowRed);
      else mesh = new THREE.Mesh(this.geos.sphere, this.mats.grenade);
      mesh.userData.kind = key;
    }
    if (kind === 'handgrenade' || kind === 'grenade' || kind === 'bomblet') { mesh.scale.setScalar(kind === 'bomblet' ? 0.8 : 1.2); if (grenade?.color) { mesh.material = this._tint(grenade.color); } }
    else if (kind === 'acid') mesh.scale.setScalar(2.2);
    else mesh.scale.setScalar(1);
    this.scene.add(mesh);
    return mesh;
  }
  _tint(c) { const k = 't' + c; if (!this.mats[k]) this.mats[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.4 }); return this.mats[k]; }
  _free(p) { this.scene.remove(p.mesh); const k = p.mesh.userData.kind; if (!this.pool.has(k)) this.pool.set(k, []); this.pool.get(k).push(p.mesh); }

  spawn(kind, pos, vel, o = {}) {
    const p = {
      kind, pos: pos.clone(), vel: vel.clone(), owner: o.owner, stats: o.stats || {}, dmgType: o.dmgType, weapon: o.weapon,
      life: kind === 'handgrenade' ? (o.stats?.fuse || 2) : kind === 'sticky' ? 60 : kind === 'orb' ? 4 : 6,
      traveled: 0, stuck: null, stuckOffset: null, mesh: this._mesh(kind, o.grenade), grenade: o.grenade, visual: !!o.visual,
      zapT: 0, trailT: 0, bounces: 0, perkMatch: o.perkMatch, zedNuke: o.zedNuke, id: o.id || Math.floor(Math.random() * 1e9),
    };
    p.mesh.position.copy(p.pos);
    this.list.push(p);
    if (!o.visual && !o.noSync) {
      const msg = { k: 'proj', kind, p: [pos.x, pos.y, pos.z].map((v) => +v.toFixed(2)), v: [vel.x, vel.y, vel.z].map((v) => +v.toFixed(2)), g: o.grenade?.kind };
      if (o.owner === 'enemy') this.game.net?.hostEvent('fx', msg); else this.game.net?.sendFx(msg);
    }
    if (kind === 'rocket') audio.play('rocket_launch', { pos, volume: 0.55 });
    return p;
  }

  countSticky(owner) { return this.list.filter((p) => p.kind === 'sticky' && p.owner === owner).length; }
  detonateSticky(owner) { for (const p of this.list) if (p.kind === 'sticky' && p.owner === owner && !p.dead) { p.detonate = true; } audio.play('mech_click', { volume: 0.4 }); }
  detonateOldestSticky(owner) { const p = this.list.find((q) => q.kind === 'sticky' && q.owner === owner && !q.dead); if (p) p.detonate = true; }
  destroyInRadius(pos, r) {
    for (const p of this.list) if (p.owner !== 'enemy' && !p.dead && p.pos.distanceTo(pos) < r && p.kind !== 'sticky') {
      p.dead = true;
      this.game.fx.sparks.spawn(p.pos.x, p.pos.y, p.pos.z, 0, 2, 0, 1, 0.8, 0.4, 0.1, 0.4, 5);
    }
  }

  spawnGroundFire(pos, radius, dps, dur, owner) { this._area('fire', pos, radius, dps, dur, owner); }

  _area(kind, pos, radius, dps, dur, owner, extra = {}) {
    const mat = kind === 'heal' ? this.mats.areaHeal : kind === 'radiation' ? this.mats.areaRad : this.mats.area;
    const mesh = new THREE.Mesh(this.geos.disc, mat);
    mesh.position.set(pos.x, 0.05, pos.z);
    mesh.scale.setScalar(radius);
    this.scene.add(mesh);
    this.areas.push({ kind, pos: pos.clone(), radius, dps, dur, t: 0, owner, mesh, tick: 0, ...extra });
  }

  update(dt) {
    const g = this.game, coll = g.world.collision;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.dead) { this._free(p); this.list.splice(i, 1); continue; }
      p.life -= dt;
      // adhesivas pegadas a un enemigo
      if (p.stuck) {
        if (p.stuck.enemy) {
          if (p.stuck.enemy.dead) p.stuck = { surface: true };
          else p.pos.copy(p.stuck.enemy.pos).add(p.stuckOffset);
        }
        p.mesh.position.copy(p.pos);
        p.mesh.material = (Math.floor(g.time * 4) % 2) ? this.mats.glowRed : this.mats.grenade;
        if (p.detonate || p.life <= 0) { this._explode(p); p.dead = true; }
        continue;
      }
      if (p.kind === 'sticky' && p.detonate) { this._explode(p); p.dead = true; continue; }
      const grav = GRAV[p.kind] ?? 10;
      p.vel.y -= grav * dt;
      if (p.kind === 'rocket' && p.traveled > 1) p.vel.multiplyScalar(1 + dt * 0.8); // acelera
      if (p.kind === 'acidOrb' && p.target) { // orbes del jefe: teledirigidas suave
        const to = this._v.copy(p.target.pos).setY(p.target.pos.y + 1).sub(p.pos).normalize().multiplyScalar(9);
        p.vel.lerp(to, dt * 1.2);
      }
      const step = p.vel.length() * dt;
      const dir = this._v.copy(p.vel).normalize();
      const dx = dir.x, dy = dir.y, dz = dir.z;
      let hit = null;
      // impactos contra enemigos (proyectiles de jugador)
      if (p.owner !== 'enemy' && !p.visual) {
        const eh = g.enemies.raycast(p.pos, dir, step + 0.1, p.kind === 'orb' ? 0.2 : 0.05);
        if (eh.length) hit = { t: eh[0].t, enemy: eh[0].enemy, zone: eh[0].zone };
      }
      // impactos contra jugadores (proyectiles enemigos)
      if (p.owner === 'enemy') {
        for (const pl of g.getPlayers()) {
          if (!pl.alive || pl.downed) continue;
          const cx = pl.pos.x, cz = pl.pos.z;
          const d = Math.hypot(p.pos.x - cx, p.pos.z - cz);
          if (d < 0.55 && p.pos.y > pl.pos.y && p.pos.y < pl.pos.y + 1.9) { hit = { t: 0, player: pl }; break; }
        }
      }
      const wh = coll.raycast(p.pos.x, p.pos.y, p.pos.z, dx, dy, dz, step + 0.05);
      if (wh && (!hit || wh.t < hit.t)) hit = { t: wh.t, world: wh };
      if (hit) {
        p.pos.addScaledVector(dir, Math.max(0, hit.t - 0.03));
        this._onHit(p, hit, dir);
      } else {
        p.pos.addScaledVector(p.vel, dt);
        p.traveled += step;
      }
      p.mesh.position.copy(p.pos);
      if (p.kind === 'rocket' || p.kind === 'spike') p.mesh.lookAt(this._v.copy(p.pos).add(p.vel));
      // estelas
      p.trailT -= dt;
      if (p.trailT <= 0) {
        p.trailT = 0.016;
        if (p.kind === 'rocket') { g.fx.smoke.spawn(p.pos.x, p.pos.y, p.pos.z, rand(-0.3, 0.3), rand(0, 0.5), rand(-0.3, 0.3), 0.5, 0.48, 0.45, 0.25, 1.2, -0.3, 1, 1.2, 0.6); g.fx.glow.spawn(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 1, 0.6, 0.2, 0.3, 0.08); }
        else if (p.kind === 'flare' || p.kind === 'shrapnel') g.fx.glow.spawn(p.pos.x, p.pos.y, p.pos.z, rand(-0.2, 0.2), rand(-0.2, 0.2), rand(-0.2, 0.2), 1, 0.5, 0.15, 0.18, 0.25);
        else if (p.kind === 'orb') { g.fx.glow.spawn(p.pos.x + rand(-0.2, 0.2), p.pos.y + rand(-0.2, 0.2), p.pos.z + rand(-0.2, 0.2), 0, 0, 0, 0.6, 0.6, 1, 0.5, 0.15); }
        else if (p.kind === 'acid' || p.kind === 'acidOrb') g.fx.blood.spawn(p.pos.x, p.pos.y, p.pos.z, 0, -0.5, 0, 0.4, 0.9, 0.1, p.kind === 'acidOrb' ? 0.3 : 0.12, 0.3, 4);
        else if (p.kind === 'handgrenade' && p.grenade?.kind === 'medic') g.fx.glow.spawn(p.pos.x, p.pos.y, p.pos.z, 0, 0.3, 0, 0.2, 1, 0.5, 0.08, 0.3);
      }
      // orbe de tormenta: electrocuta a los cercanos durante el vuelo
      if (p.kind === 'orb' && !p.visual) {
        p.zapT -= dt;
        if (p.zapT <= 0) {
          p.zapT = p.stats.zapRate || 0.15;
          for (const e of g.enemies.inRadius(p.pos, p.stats.zapRange || 5).slice(0, 3)) {
            g.fx.arc(p.pos, e.center(), [0.6, 0.6, 1], 6, 0.3, 0.12);
            g.damageEnemy(e, p.stats.zapDmg || 20, 'body', 'electric', null, p.owner, { stun: 0.3, weapon: p.weapon, perkMatch: p.perkMatch, noBlood: true });
          }
        }
      }
      if (p.life <= 0 && !p.dead) {
        if (p.kind === 'handgrenade' || p.kind === 'orb' || p.kind === 'bomblet') this._explode(p);
        p.dead = true;
      }
    }
    this._updateAreas(dt);
  }

  _onHit(p, hit, dir) {
    const g = this.game;
    const n = hit.world ? hit.world.normal : [0, 1, 0];
    switch (p.kind) {
      case 'handgrenade': case 'bomblet': {
        if (hit.enemy || hit.player) { p.vel.multiplyScalar(-0.2); break; }
        if (p.grenade?.sticky) { p.stuck = { surface: true }; p.vel.set(0, 0, 0); break; }
        // rebote
        const vn = p.vel.x * n[0] + p.vel.y * n[1] + p.vel.z * n[2];
        p.vel.x -= 1.6 * vn * n[0]; p.vel.y -= 1.6 * vn * n[1]; p.vel.z -= 1.6 * vn * n[2];
        p.vel.multiplyScalar(0.55);
        if (Math.abs(vn) > 2) audio.play('grenade_bounce', { pos: p.pos, volume: Math.min(0.6, Math.abs(vn) * 0.06) });
        if (p.vel.lengthSq() < 0.5) p.vel.set(0, 0, 0);
        p.pos.x += n[0] * 0.04; p.pos.y += n[1] * 0.04; p.pos.z += n[2] * 0.04;
        break;
      }
      case 'grenade': {
        if (p.traveled < (p.stats.armDist || 0)) {
          // sin armar: impacto contundente y rebote
          if (hit.enemy) g.damageEnemy(hit.enemy, p.stats.impactDmg || 50, hit.zone, 'ballistic', dir, p.owner, { stumble: 3, weapon: p.weapon, perkMatch: p.perkMatch, point: p.pos.clone() });
          p.dead = true; g.fx.impact(p.pos, n, 'metal'); audio.play('grenade_bounce', { pos: p.pos, volume: 0.6 });
          break;
        }
        if (hit.enemy) g.damageEnemy(hit.enemy, p.stats.impactDmg || 0, hit.zone, 'ballistic', dir, p.owner, { stumble: 2, weapon: p.weapon, perkMatch: p.perkMatch, point: p.pos.clone() });
        this._explode(p); p.dead = true; break;
      }
      case 'rocket': case 'shrapnel': {
        if (hit.enemy && p.stats.impactDmg) g.damageEnemy(hit.enemy, p.stats.impactDmg, hit.zone, 'ballistic', dir, p.owner, { stumble: 2, weapon: p.weapon, perkMatch: p.perkMatch, point: p.pos.clone() });
        if (p.kind === 'rocket' && p.traveled < (p.stats.armDist || 0)) { p.dead = true; g.fx.impact(p.pos, n, 'metal'); break; }
        this._explode(p); p.dead = true; break;
      }
      case 'sticky': {
        p.vel.set(0, 0, 0);
        if (hit.enemy) { p.stuck = { enemy: hit.enemy }; p.stuckOffset = p.pos.clone().sub(hit.enemy.pos); }
        else p.stuck = { surface: true };
        audio.play('mech_click', { pos: p.pos, volume: 0.5 });
        break;
      }
      case 'flare': {
        if (hit.enemy && !p.visual) g.damageEnemy(hit.enemy, p.stats.impactDmg, hit.zone, 'fire', dir, p.owner, { burn: p.stats.burn || 20, stumble: 0.5, weapon: p.weapon, perkMatch: p.perkMatch, point: p.pos.clone(), headMult: 1.5 });
        else { for (let i = 0; i < 6; i++) g.fx.burn(p.pos, 1); g.fx.decal('scorch', p.pos.x, p.pos.y, p.pos.z, n[0], n[1], n[2], 0.4); }
        p.dead = true; break;
      }
      case 'orb': { this._explode(p); p.dead = true; break; }
      case 'acid': case 'acidOrb': {
        if (!p.visual) {
          if (hit.player) { g.damagePlayer(hit.player.id, p.stats.dmg, 'acid', { x: p.pos.x - dir.x, y: p.pos.y, z: p.pos.z - dir.z }); if (hit.player === g.local) { g.local.acidT = 2; g.hud?.acidFx(); } }
          else for (const pl of g.getPlayers()) if (pl.alive && !pl.downed && pl.pos.distanceTo(p.pos) < (p.stats.radius || 2)) g.damagePlayer(pl.id, p.stats.dmg * 0.5, 'acid', { x: p.pos.x, y: p.pos.y, z: p.pos.z });
        }
        g.fx.bloodBurst(p.pos, 0.3, [0.4, 0.9, 0.1]);
        g.fx.decal('acid', p.pos.x, p.pos.y, p.pos.z, n[0], n[1], n[2], p.kind === 'acidOrb' ? 1.6 : 1);
        audio.play('acid_sizzle', { pos: p.pos, volume: 0.5 });
        if (p.kind === 'acidOrb' && !p.visual) this._area('radiation', p.pos, 2.5, 8, 4, 'enemy');
        p.dead = true; break;
      }
      case 'spike': {
        if (hit.player && !p.visual) g.damagePlayer(hit.player.id, p.stats.dmg, 'melee', { x: p.pos.x - dir.x * 3, y: p.pos.y, z: p.pos.z - dir.z * 3 });
        g.fx.impact(p.pos, n, 'concrete');
        p.dead = true; break;
      }
      default: p.dead = true;
    }
  }

  _explode(p) {
    const g = this.game, s = p.stats, pos = p.pos.clone();
    if (p.visual) {
      const kind = p.grenade?.kind === 'medic' ? 'heal' : p.kind === 'orb' || p.grenade?.kind === 'emp' ? 'electric' : 'fire';
      g.fx.explosion(pos, s.radius || 4, kind);
      audio.play(kind === 'heal' ? 'heal_done' : 'explosion', { pos, volume: 0.9 });
      return;
    }
    const gk = p.grenade?.kind;
    if (gk === 'medic') {
      g.fx.explosion(pos, s.radius, 'heal');
      audio.play('heal_done', { pos, volume: 0.8 });
      this._area('heal', pos, s.radius, s.heal || 10, s.cloud || 6, p.owner, { dmg: s.dmg });
      return;
    }
    if (gk === 'fire') {
      g.combat.explode(pos, s.radius, s.dmg, 'fire', p.owner, { burn: s.burn, perkMatch: true });
      this._area('fire', pos, s.radius * 0.8, s.burn || 30, s.ground || 6, p.owner);
      return;
    }
    if (gk === 'emp') {
      g.combat.explode(pos, s.radius, s.dmg, 'electric', p.owner, { stun: s.stun || 3, perkMatch: true });
      for (const e of g.enemies.inRadius(pos, s.radius)) g.fx.arc(pos, e.center(), [0.5, 0.7, 1], 8, 0.4, 0.3);
      audio.play('stun', { pos, volume: 1 });
      return;
    }
    if (gk === 'cluster') {
      g.combat.explode(pos, s.radius, s.dmg, 'explosive', p.owner, { perkMatch: true });
      for (let i = 0; i < (s.bomblets || 4); i++) {
        const v = new THREE.Vector3(rand(-5, 5), rand(4, 8), rand(-5, 5));
        this.spawn('bomblet', pos.clone().add(new THREE.Vector3(0, 0.3, 0)), v, { owner: p.owner, stats: { dmg: s.dmg * 0.4, radius: s.radius * 0.55, fuse: rand(0.6, 1.1) }, grenade: { kind: 'frag', color: 0x5a3a1a }, noSync: false });
        this.list[this.list.length - 1].life = rand(0.6, 1.1);
      }
      return;
    }
    if (p.kind === 'orb') {
      g.combat.explode(pos, s.radius, s.dmg, 'electric', p.owner, { stun: 1.2, weapon: p.weapon, perkMatch: p.perkMatch });
      return;
    }
    g.combat.explode(pos, s.radius || 4, s.dmg || 100, 'explosive', p.owner, { weapon: p.weapon, perkMatch: p.perkMatch ?? true });
    if (p.zedNuke) this._area('radiation', pos, (s.radius || 4) * 0.9, (s.dmg || 100) * 0.15, 5, p.owner);
  }

  _updateAreas(dt) {
    const g = this.game;
    for (let i = this.areas.length - 1; i >= 0; i--) {
      const a = this.areas[i];
      a.t += dt; a.tick -= dt;
      const life = 1 - a.t / a.dur;
      a.mesh.material.opacity = (a.kind === 'fire' ? 0.25 : 0.18) * Math.min(1, life * 3);
      if (a.kind === 'fire' && Math.random() < 0.8) g.fx.burn(new THREE.Vector3(a.pos.x + rand(-a.radius, a.radius) * 0.7, 0, a.pos.z + rand(-a.radius, a.radius) * 0.7), 1);
      if (a.kind === 'heal' && Math.random() < 0.6) g.fx.glow.spawn(a.pos.x + rand(-a.radius, a.radius) * 0.7, rand(0.1, 1.5), a.pos.z + rand(-a.radius, a.radius) * 0.7, 0, 0.6, 0, 0.2, 1, 0.5, 0.15, 0.8);
      if (a.kind === 'radiation' && Math.random() < 0.5) g.fx.smoke.spawn(a.pos.x + rand(-a.radius, a.radius) * 0.7, 0.2, a.pos.z + rand(-a.radius, a.radius) * 0.7, 0, 0.5, 0, 0.4, 0.8, 0.2, 0.6, 1, -0.2, 0.5, 0.5, 0.35);
      if (a.tick <= 0) {
        a.tick = 0.5;
        if (a.owner === 'enemy') {
          for (const pl of g.getPlayers()) if (pl.alive && !pl.downed && Math.hypot(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z) < a.radius) g.damagePlayer(pl.id, a.dps * 0.5, 'acid', null, true);
        } else if (a.kind === 'heal') {
          for (const pl of g.getPlayers()) if (pl.alive && !pl.downed && Math.hypot(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z) < a.radius) g.healTeammate(pl, a.dps * 0.5, true, true);
          for (const e of g.enemies.inRadius(a.pos, a.radius)) g.damageEnemy(e, (a.dmg || 10) * 0.5, 'body', 'toxic', null, a.owner, { noBlood: true, perkMatch: true, poison: 10 });
        } else {
          for (const e of g.enemies.inRadius(a.pos, a.radius)) g.damageEnemy(e, a.dps * 0.5, 'body', a.kind === 'fire' ? 'fire' : 'toxic', null, a.owner, { burn: a.kind === 'fire' ? a.dps * 0.5 : 0, noBlood: true, perkMatch: true, dot: true });
          if (a.kind === 'fire' && g.local.alive && Math.hypot(g.local.pos.x - a.pos.x, g.local.pos.z - a.pos.z) < a.radius && a.owner === g.local.id) g.local.takeDamage(3 * (1 - (g.local.mods?.fireRes || 0)), 'fire', null, true);
        }
      }
      if (a.t >= a.dur) { this.scene.remove(a.mesh); this.areas.splice(i, 1); }
    }
  }

  clear() {
    for (const p of this.list) this._free(p);
    this.list.length = 0;
    for (const a of this.areas) this.scene.remove(a.mesh);
    this.areas.length = 0;
  }
}
