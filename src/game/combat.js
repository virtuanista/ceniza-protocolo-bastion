// Resolución de combate: trazado de balas con penetración, perdigones, llamas, haz eléctrico,
// cadenas de arco, cuerpo a cuerpo y explosiones. Independiente del renderizado.
import * as THREE from 'three';
import { audio } from '../audio/audio.js';
import { bus } from '../core/events.js';
import { rand } from '../core/utils.js';

const _v = new THREE.Vector3();

export class Combat {
  constructor(game) { this.game = game; }

  get enemies() { return this.game.enemies; }

  hitscan(origin, dir, o) {
    const g = this.game, world = g.world.collision;
    const wh = world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, o.range);
    const maxT = wh ? wh.t : o.range;
    let endT = maxT;
    let hitEnemy = false;
    // dardos médicos: curan al primer compañero en la trayectoria
    if (o.dart) {
      const mate = g.raycastTeammates(origin, dir, maxT);
      if (mate) {
        if (g.weapons.syringe >= 0) g.healTeammate(mate.player, o.dart.heal, true);
        return { end: _v.copy(origin).addScaledVector(dir, mate.t).clone(), hitEnemy: false };
      }
    }
    const hits = this.enemies.raycast(origin, dir, maxT);
    let dmg = o.dmg;
    let pens = o.pen + 1;
    for (const h of hits) {
      if (pens <= 0) break;
      const e = h.enemy;
      const point = _v.copy(origin).addScaledVector(dir, h.t).clone();
      const res = g.damageEnemy(e, dmg, h.zone, o.dmgType, dir, o.shooter, { headMult: o.headMult, stumble: o.stumble, burn: o.burn, knockback: o.knockback, point, weapon: o.weapon, perkMatch: o.perkMatch, poison: o.dart?.poison, headStack: o.headStack });
      hitEnemy = true;
      if (o.chain && o.chain.count > 0) this.chain(e, dmg * o.chain.mult, o.chain.count, o.chain.range, o.shooter, o.weapon);
      void res;
      pens--;
      dmg *= e.def.big ? 0.45 : 0.75; // perder energía al atravesar
      endT = h.t;
      if (e.def.big && !o.rail) { pens = Math.min(pens, 1); }
    }
    const end = _v.copy(origin).addScaledVector(dir, hitEnemy && pens <= 0 ? endT : maxT).clone();
    if (wh && (!hitEnemy || pens > 0)) {
      const surf = wh.box ? (wh.box.door ? 'door' : wh.box.mat) : 'floor';
      g.fx.impact(end, wh.normal, surf);
      if (Math.random() < 0.35) audio.play(surf === 'metal' || surf === 'container' || surf === 'door' || surf === 'vehicle' ? 'hit_metal' : 'hit_concrete', { pos: end, volume: 0.35, cooldown: 0.03 });
      if (o.dmgType === 'fire' && Math.random() < 0.3) g.fx.burn(end, 1);
    }
    return { end, hitEnemy };
  }

  chain(fromEnemy, dmg, count, range, shooter, weapon) {
    const g = this.game;
    let cur = fromEnemy;
    const done = new Set([fromEnemy]);
    for (let i = 0; i < count; i++) {
      let best = null, bd = range * range;
      for (const e of this.enemies.alive) {
        if (done.has(e) || e.dead) continue;
        const d = e.pos.distanceToSquared(cur.pos);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      done.add(best);
      const a = cur.center(), b = best.center();
      g.fx.arc(a, b, [0.55, 0.85, 1], 6, 0.25, 0.14);
      g.damageEnemy(best, dmg, 'body', 'electric', null, shooter, { stumble: 0.5, weapon, perkMatch: true, stun: 0.35 });
      cur = best;
      dmg *= 0.85;
    }
    if (done.size > 1) audio.play('chain_zap', { pos: fromEnemy.pos, volume: 0.5, cooldown: 0.06 });
  }

  flame(origin, dir, range, cone, dmg, burn, shooter, weapon, plasma) {
    const g = this.game;
    const cosC = Math.cos(cone + 0.05);
    for (const e of this.enemies.alive) {
      const c = e.center();
      const dx = c.x - origin.x, dy = c.y - origin.y, dz = c.z - origin.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > range + e.def.radius) continue;
      const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (d || 1);
      const widen = Math.min(0.25, e.def.radius / Math.max(1, d));
      if (dot < cosC - widen) continue;
      if (!g.world.collision.lineOfSight(origin.x, origin.y, origin.z, c.x, c.y, c.z)) continue;
      g.damageEnemy(e, dmg * (1 - d / (range * 1.4)), 'body', 'fire', dir, shooter, { burn, weapon, perkMatch: true, stumble: 0.05, noBlood: true });
    }
    // charcos de fuego (talento) o plasma en el impacto
    const wh = g.world.collision.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
    if (wh && Math.random() < 0.25) {
      const p = _v.copy(origin).addScaledVector(dir, wh.t);
      for (let i = 0; i < 3; i++) g.fx.burn(p, 1);
      if (g.local.mods?.groundFire && Math.random() < 0.15) g.projectiles.spawnGroundFire(p.clone(), 2, dmg * 0.6, 3, shooter);
      if (plasma && Math.random() < 0.2) g.fx.decal('scorch', p.x, p.y, p.z, wh.normal[0], wh.normal[1], wh.normal[2], 0.8);
    }
  }

  beam(origin, dir, range, dmg, chain, shooter, weapon, stumble) {
    const g = this.game;
    const wh = g.world.collision.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
    const maxT = wh ? wh.t : range;
    const hits = this.enemies.raycast(origin, dir, maxT, 0.35);
    if (hits.length) {
      const h = hits[0];
      g.damageEnemy(h.enemy, dmg, h.zone, 'electric', dir, shooter, { stumble, weapon, perkMatch: true, stun: 0.12, noBlood: Math.random() < 0.7 });
      if (chain && Math.random() < 0.35) this.chain(h.enemy, dmg * chain.mult * 2, chain.count, chain.range, shooter, weapon);
      return { end: _v.copy(origin).addScaledVector(dir, h.t).clone() };
    }
    return { end: _v.copy(origin).addScaledVector(dir, maxT).clone() };
  }

  melee(origin, dir, range, arc, dmg, stumble, shooter, bash = false) {
    const g = this.game;
    let hitAny = false;
    const cosA = Math.cos(arc);
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    const cands = [];
    for (const e of this.enemies.alive) {
      const dx = e.pos.x - origin.x, dz = e.pos.z - origin.z;
      const d = Math.hypot(dx, dz) - e.def.radius;
      if (d > range) continue;
      const dot = (dx * flat.x + dz * flat.z) / (Math.hypot(dx, dz) || 1);
      if (dot < cosA && d > 0.5) continue;
      cands.push([d, e]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const maxTargets = bash ? 1 : 3;
    for (let i = 0; i < Math.min(maxTargets, cands.length); i++) {
      const e = cands[i][1];
      // golpe a la cabeza si se apunta alto
      const head = e.headPos();
      const toHead = head.clone().sub(origin).normalize();
      const zone = toHead.dot(dir) > 0.97 ? 'head' : 'body';
      g.damageEnemy(e, dmg * (i === 0 ? 1 : 0.6), zone, 'melee', dir, shooter, { stumble, knockback: bash ? 5 : 2.5, headMult: 1.5, perkMatch: false, weapon: 'machete' });
      hitAny = true;
    }
    if (hitAny) { audio.play('hit_flesh', { volume: 0.7 }); g.local.shake(0.12); }
    else {
      const wh = g.world.collision.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
      if (wh) { const p = origin.clone().addScaledVector(dir, wh.t); g.fx.impact(p, wh.normal, wh.box?.mat); audio.play('hit_metal', { pos: p, volume: 0.4 }); }
    }
    return hitAny;
  }

  // Explosión con daño radial, oclusión y empuje
  explode(pos, radius, dmg, type, owner, opts = {}) {
    const g = this.game;
    const kind = type === 'acid' ? 'acid' : type === 'electric' ? 'electric' : type === 'heal' ? 'heal' : 'fire';
    if (!opts.noFx) {
      g.fx.explosion(pos, radius, kind);
      audio.play(type === 'acid' ? 'explosion_acid' : radius > 5 ? 'explosion' : 'explosion_small', { pos, volume: 1, priority: true, ref: 6, maxDist: 120 });
    }
    // sacudida para todos los jugadores cercanos (local)
    const lp = g.local;
    const ld = lp.pos.distanceTo(pos);
    if (ld < radius * 4) { lp.shake(Math.max(0, 1 - ld / (radius * 4)) * 0.9); if (ld < radius * 1.5) audio.setMuffle(Math.max(0, 1 - ld / (radius * 1.5)) * 0.8); }
    if (type === 'heal') return;
    const enemiesOnly = owner !== 'enemy';
    if (enemiesOnly) {
      for (const e of this.enemies.alive) {
        const c = e.center();
        const d = c.distanceTo(pos) - e.def.radius * 0.7;
        if (d > radius) continue;
        if (!g.world.collision.lineOfSight(pos.x, pos.y + 0.4, pos.z, c.x, c.y, c.z)) continue;
        const f = Math.max(0.15, 1 - Math.max(0, d) / radius);
        const dir = c.clone().sub(pos).normalize();
        g.damageEnemy(e, dmg * f, 'body', type, dir, owner, { stumble: 4 * f, knockback: 9 * f, explosion: true, burn: opts.burn, stun: opts.stun, weapon: opts.weapon, perkMatch: opts.perkMatch ?? true, gib: f > 0.6 });
      }
    }
    // daño a jugadores: solo explosiones enemigas o propias (sin fuego amigo entre jugadores)
    if (lp.alive && !lp.downed && (owner === 'enemy' || owner === lp.id)) {
      const d = lp.pos.distanceTo(pos);
      if (d < radius && g.world.collision.lineOfSight(pos.x, pos.y + 0.4, pos.z, lp.pos.x, lp.pos.y + 1, lp.pos.z)) {
        const f = 1 - d / radius;
        const amount = (owner === 'enemy' ? dmg : dmg * 0.25) * f;
        lp.takeDamage(amount, owner === 'enemy' ? (type === 'acid' ? 'acid' : 'explosive') : 'explosive_self', { x: pos.x, y: pos.y, z: pos.z });
        if (owner === 'enemy' && type === 'acid') lp.acidT = 3;
        if (owner !== 'enemy') lp.vel.addScaledVector(lp.pos.clone().sub(pos).normalize(), 6 * f);
      }
    }
    // las explosiones detonan otras cargas cercanas en cadena
    bus.emit('explosion', { pos, radius });
    void rand;
  }
}
