// Modelo en tercera persona de los compañeros (cooperativo) con interpolación y arma visible.
import * as THREE from 'three';
import { buildWeaponModel } from './weaponModels.js';
import { WEAPONS } from '../weapons/weaponDefs.js';
import { damp, angleDiff } from '../core/utils.js';

export class RemotePlayer {
  constructor(scene, info) {
    this.id = info.id; this.name = info.name; this.perk = info.perk;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.netPos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.netYaw = 0;
    this.alive = true; this.downed = false; this.hp = 100; this.maxHp = 100; this.armor = 0;
    this.crouching = false; this.weaponId = ''; this.credits = 0;
    this.isRemote = true;
    this.scene = scene;
    this.outfit = info.outfit || { body: 0x3a4a32 };
    this._build();
    this.animT = 0;
    this.lastUpdate = performance.now();
    this.airborne = false;
  }
  _build() {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: this.outfit.body ?? 0x3a4a32, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.7 });
    const visor = new THREE.MeshBasicMaterial({ color: 0x40c0ff });
    const hips = new THREE.Group(); hips.position.y = 0.95; g.add(hips);
    const torso = new THREE.Group(); torso.position.y = 0.1; hips.add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.28), body); chest.position.y = 0.32; torso.add(chest);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.32), dark); vest.position.y = 0.36; torso.add(vest);
    const head = new THREE.Group(); head.position.y = 0.75; torso.add(head);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin));
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), body); helm.position.y = 0.02; head.add(helm);
    const vz = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), visor); vz.position.set(0, 0.02, 0.13); head.add(vz);
    const mkLimb = (parent, x, y, len, r, mat) => { const j = new THREE.Group(); j.position.set(x, y, 0); parent.add(j); const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 6), mat); m.position.y = -len / 2 - r; j.add(m); return j; };
    this.legL = mkLimb(hips, -0.12, -0.02, 0.75, 0.08, dark); this.legR = mkLimb(hips, 0.12, -0.02, 0.75, 0.08, dark);
    this.armL = mkLimb(torso, -0.29, 0.58, 0.48, 0.06, body); this.armR = mkLimb(torso, 0.29, 0.58, 0.48, 0.06, body);
    this.group = g; this.hips = hips; this.torso = torso; this.head = head;
    this.weaponHolder = new THREE.Group(); this.weaponHolder.position.set(0.15, 0.45, 0.3); torso.add(this.weaponHolder);
    this.scene.add(g);
  }
  setWeapon(id) {
    if (id === this.weaponId) return;
    this.weaponId = id;
    this.weaponHolder.clear();
    const def = WEAPONS[id];
    if (!def) return;
    const m = buildWeaponModel(def, { detail: false });
    m.group.scale.setScalar(1.1);
    m.group.rotation.y = Math.PI;
    this.weaponHolder.add(m.group);
    this.muzzle = m.muzzle;
  }
  applyState(s) {
    this.netPos.set(s.x, s.y, s.z);
    this.netYaw = s.yaw; this.pitch = s.pitch; this.crouching = !!s.cr;
    this.hp = s.hp; this.maxHp = s.mhp; this.armor = s.ar; this.downed = !!s.dn; this.alive = !!s.al; this.credits = s.cr$ ?? this.credits; this.kills = s.k; this.headshots = s.hs; this.damage = s.dm; this.healed = s.he;
    this.setWeapon(s.w);
    const now = performance.now();
    const dtn = Math.max(0.016, (now - this.lastUpdate) / 1000);
    this.vel.set((s.x - this.pos.x) / dtn, 0, (s.z - this.pos.z) / dtn);
    this.lastUpdate = now;
    this.airborne = s.y > 0.4;
  }
  update(dt) {
    const prev = this.pos.clone();
    this.pos.lerp(this.netPos, Math.min(1, dt * 14));
    this.yaw += angleDiff(this.yaw, this.netYaw) * Math.min(1, dt * 14);
    const sp = prev.distanceTo(this.pos) / Math.max(dt, 1e-3);
    this.animT += dt * sp * 2.2;
    const a = Math.min(1, sp / 4) * 0.6;
    this.legL.rotation.x = Math.sin(this.animT) * a; this.legR.rotation.x = -Math.sin(this.animT) * a;
    this.armL.rotation.x = -1.2; this.armR.rotation.x = -1.3;
    this.armL.rotation.z = 0.4;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw + Math.PI;
    this.hips.position.y = this.crouching ? 0.6 : 0.95;
    this.torso.rotation.x = damp(this.torso.rotation.x, -this.pitch * 0.5, 10, dt);
    if (this.downed || !this.alive) { this.group.rotation.z = damp(this.group.rotation.z, 1.4, 6, dt); this.group.position.y += 0.2; }
    else this.group.rotation.z = damp(this.group.rotation.z, 0, 6, dt);
    this.group.visible = this.alive || this.downed;
  }
  dispose() { this.scene.remove(this.group); }
}
