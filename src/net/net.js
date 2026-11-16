// Cliente de red cooperativo. Modelo de anfitrión autoritativo:
//  - El anfitrión simula IA, oleadas, objetivos y puertas y difunde instantáneas (15 Hz) y eventos.
//  - Cada cliente simula su propio movimiento/armas, envía su estado (20 Hz) y sus impactos al anfitrión.
//  - El daño a jugadores, curaciones, reanimaciones y recompensas se envían como mensajes directos.
import * as THREE from 'three';
import { saveSys } from '../save/save.js';
import { bus } from '../core/events.js';
import { audio } from '../audio/audio.js';
import { WEAPONS } from '../weapons/weaponDefs.js';

export class NetClient {
  constructor(app) {
    this.app = app;
    this.ws = null;
    this.id = null;
    this.lobby = null;
    this.chatLog = [];
    this.game = null;
    this.evQueue = [];
    this.stT = 0; this.snapT = 0;
    this.connected = false;
  }
  get isHost() { return !!this.lobby && this.lobby.host === this.id; }
  defaultUrl() { return `ws://${location.hostname || 'localhost'}:8787`; }

  connect(url) {
    if (this.ws && this.connected && this.url === url) return Promise.resolve();
    if (this.ws) try { this.ws.close(); } catch (e) { /* cerrado */ }
    this.url = url;
    return new Promise((resolve, reject) => {
      let done = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      const to = setTimeout(() => { if (!done) { done = true; reject(new Error('tiempo de espera agotado')); try { ws.close(); } catch (e) { /* */ } } }, 5000);
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'welcome') { this.id = m.id; this.connected = true; if (!done) { done = true; clearTimeout(to); resolve(); } return; }
        this._onMessage(m);
      };
      ws.onerror = () => { if (!done) { done = true; clearTimeout(to); reject(new Error('error de conexión')); } };
      ws.onclose = () => {
        this.connected = false;
        if (this.game) { bus.emit('toast', { text: 'Conexión perdida con el servidor', kind: 'bad' }); this.app.endGame(); }
        this.lobby = null;
      };
    });
  }

  _send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  playerInfo() { const sel = saveSys.data.selected; return { name: saveSys.data.profile.name, perk: sel.perk, level: saveSys.data.perks[sel.perk].level, outfit: sel.outfit }; }
  createRoom() { this._send({ t: 'create', player: this.playerInfo() }); }
  joinRoom(code) { this._send({ t: 'join', code, player: this.playerInfo() }); }
  listRooms() { this._send({ t: 'list' }); }
  leaveRoom() { this._send({ t: 'leave' }); this.lobby = null; }
  toggleReady() { const me = this.lobby?.players.find((p) => p.id === this.id); this._send({ t: 'lobby', ready: !me?.ready }); }
  setPerk(perk) { this._send({ t: 'lobby', perk, level: saveSys.data.perks[perk].level }); }
  setConfig(cfg) { this._send({ t: 'lobby', cfg }); }
  chat(text) { this._send({ t: 'chat', text }); }
  requestStart() { this._send({ t: 'start' }); }
  endMatch() { if (this.isHost) this._send({ t: 'end' }); }

  // ------------------------------------------------------------ mensajes
  _onMessage(m) {
    const ui = this.app.ui;
    switch (m.t) {
      case 'rooms': {
        const el = document.querySelector('#c-rooms');
        if (el) el.innerHTML = m.list.length ? m.list.map((r) => `<div class="row" style="margin:4px 0"><b>${r.code}</b> <span>${r.host} · ${r.n}/6 · ${r.map}</span> <button class="btn small" data-act="joinCode" data-code="${r.code}">Unirse</button></div>`).join('') : 'No hay salas abiertas.';
        break;
      }
      case 'lobby': this.lobby = m; if (!this.game && (ui.screen === 'coop' || ui.screen === 'lobby')) ui.showLobby(); break;
      case 'error': { const el = document.querySelector('#c-msg'); if (el) el.textContent = m.msg; bus.emit('toast', { text: m.msg, kind: 'bad' }); break; }
      case 'chat': this.chatLog.push({ n: m.n, t: m.text }); if (this.chatLog.length > 60) this.chatLog.shift(); if (ui.screen === 'lobby') ui.showLobby(); else if (this.game) bus.emit('toast', { text: `${m.n}: ${m.text}`, kind: 'info' }); break;
      case 'start': {
        this.lobby.host = m.host;
        const me = m.players.find((p) => p.id === this.id);
        this.app.startGame({ ...m.cfg, perk: me?.perk || saveSys.data.selected.perk, players: m.players, net: this });
        break;
      }
      case 'ended': if (this.game) this.app.endGame(false, true); break;
      case 'hostLeft': bus.emit('toast', { text: 'El anfitrión ha abandonado la partida', kind: 'bad' }); if (this.game) this.app.endGame(false, true); break;
      case 'left': if (this.game) { const r = this.game.remote.get(m.id); if (r) { bus.emit('toast', { text: `${r.name} ha abandonado`, kind: 'bad' }); r.dispose(); this.game.remote.delete(m.id); } } break;
      case 'st': if (this.game) { const r = this.game.remote.get(m.from); if (r) r.applyState(m.s); } break;
      case 'snap': if (this.game && !this.isHost) this.game.enemies.applySnapshot(m.e); break;
      case 'ev': if (this.game && !this.isHost) for (const [k, d] of m.evs) this._hostEvent(k, d); break;
      case 'fx': if (this.game) this._remoteFx(m.from, m.m); break;
      case 'msg': if (this.game) this._direct(m.from, m.k, m.d); break;
    }
  }

  // eventos difundidos por el anfitrión
  _hostEvent(k, d) {
    const g = this.game;
    switch (k) {
      case 'espawn': g.enemies.spawn(d.t, d.x, d.z, { id: d.id, yaw: d.y, vent: !!d.v }); { const e = g.enemies.byId.get(d.id); if (e) { e.maxHp = d.hp; e.hp = d.hp; } } if (d.t === 'primogenito') bus.emit('bossSpawn'); break;
      case 'ekill': {
        const e = g.enemies.byId.get(d.id);
        if (e) g.enemies.kill(e, { shooter: d.s, headshot: !!d.h, gib: !!d.g, weapon: d.w, dir: d.d ? new THREE.Vector3(...d.d) : null, explosion: !!d.ex });
        break;
      }
      case 'erage': { const e = g.enemies.byId.get(d.id); if (e) { e.raging = true; audio.play('rage', { pos: e.pos, volume: 1 }); } break; }
      case 'espec': { const e = g.enemies.byId.get(d.id); if (e) { e.special = d.k; e.specialT = 0; if (d.k === 'scream') audio.play('scream', { pos: e.pos, volume: 1, priority: true }); } break; }
      case 'phase': g.waves.applyNet(d); break;
      case 'door': g.applyDoorState(d); break;
      case 'obj': g.applyObjectiveState(d); break;
      case 'reward': g._receiveReward(d.a, d.r, d.x); break;
      case 'zed': g.startZed(d.d); break;
      case 'fx': this._remoteFx('host', d); break;
      case 'bwarn': bus.emit('bossWarn', d.t); break;
      case 'bphase': bus.emit('bossPhase', { phase: d.p }); audio.play('boss_roar', { volume: 0.8, bus: 'ui' }); break;
      case 'cashTaken': g._removeCash(d.id, d.by); break;
      case 'respawn': g.respawnLocal(); break;
      case 'gameover': if (d.win) g.victory(); else g.defeat(); break;
    }
  }

  // mensajes directos (a mí)
  _direct(from, k, d) {
    const g = this.game;
    switch (k) {
      case 'dmg': g.local.takeDamage(d.a, d.t === 'sonic' ? 'melee' : d.t, d.s ? { x: d.s[0], y: 0, z: d.s[1] } : null, !!d.q); break;
      case 'heal': {
        const h = g.local.heal(d.a, true);
        if (d.armor) g.local.armor = Math.min(g.local.maxArmor, g.local.armor + d.armor);
        if (d.shield) g.local.shieldT = d.shield;
        if (d.haste) g.local.hasteT = d.haste;
        if (h > 0) bus.emit('toast', { text: `${d.from} te ha curado (+${Math.round(h)})`, kind: 'good' });
        g.fx.healPuff(g.local.pos);
        break;
      }
      case 'revive': g.receiveRevive(d.hp); break;
      case 'resupply': g.receiveResupply(d.from); break;
      // solo para el anfitrión
      case 'hit': if (this.isHost) { const e = g.enemies.byId.get(d.id); if (e) g.enemies.damage(e, d.a, d.z, d.t, d.d ? new THREE.Vector3(...d.d) : null, from, { ...d.o, point: e.center().clone() }); } break;
      case 'doorReq': if (this.isHost) { const door = g.world.doors[d.i]; if (!door) break; if (d.a === 'toggle') { door.setClosed(!door.closed); audio.play('door_slide', { pos: door.center, volume: 0.6 }); } else if (d.a === 'weld') door.applyWeld(d.v); door.weldOwner = door.weldOwner || from; this.hostEvent('door', g.doorState(door)); } break;
      case 'ready': if (this.isHost) g.waves.setReady(from); break;
      case 'objWork': if (this.isHost) g.objective()?.addWork(d.dt); break;
      case 'objPick': if (this.isHost) g.objective()?.pickup(from); break;
      case 'cashPick': if (this.isHost) g.claimCash(d.id, from); break;
    }
  }

  // efectos cosméticos de otros jugadores (disparos, llamas, proyectiles visuales)
  _remoteFx(from, m) {
    const g = this.game;
    const r = g.remote.get(from);
    if (m.k === 'shot') {
      const o = new THREE.Vector3(...m.o), d = new THREE.Vector3(...m.d);
      const wh = g.world.collision.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 80);
      const end = o.clone().addScaledVector(d, wh ? wh.t : 80);
      g.fx.tracer(o, end, [1, 0.85, 0.5], 0.06);
      g.fx.muzzle(o, d, [1, 0.7, 0.3], 1);
      const w = WEAPONS[m.w];
      if (w) audio.play(audio.weaponBuffer(w), { pos: o, volume: 0.7, ref: 4 });
    } else if (m.k === 'flame') {
      const o = new THREE.Vector3(...m.o), d = new THREE.Vector3(...m.d);
      g.fx.fireBurst(o, d, 1);
    } else if (m.k === 'beam') {
      g.fx.arc(new THREE.Vector3(...m.o), new THREE.Vector3(...m.e), [0.5, 1, 1], 8, 0.15, 0.06);
    } else if (m.k === 'proj') {
      g.projectiles.spawn(m.kind, new THREE.Vector3(...m.p), new THREE.Vector3(...m.v), { owner: from === 'host' ? 'enemy' : from, visual: true, stats: { radius: 4 }, grenade: m.g ? { kind: m.g } : undefined });
    } else if (m.k === 'cash') {
      g._spawnCash(m.id, new THREE.Vector3(m.p[0], 0, m.p[1]), m.a, m.by);
    }
    void r;
  }

  // ------------------------------------------------------------ integración con la partida
  attachGame(game) { this.game = game; this.evQueue = []; }
  detachGame() { this.game = null; this.evQueue = []; }
  hostEvent(k, d) { if (this.isHost && this.game) this.evQueue.push([k, d]); }
  sendFx(m) { this._send({ t: 'fx', m }); }
  sendToHost(k, d) { this._send({ t: 'to', id: 'host', k, d }); }
  sendTo(id, k, d) { this._send({ t: 'to', id, k, d }); }

  tick(dt) {
    const g = this.game;
    if (!g) return;
    this.stT -= dt;
    if (this.stT <= 0) { this.stT = 0.05; this._send({ t: 'st', s: g.local.netState() }); }
    if (this.isHost) {
      this.snapT -= dt;
      if (this.snapT <= 0) { this.snapT = 0.066; this._send({ t: 'snap', e: g.enemies.snapshot() }); }
      // puertas soldadas: sincronizar a ritmo limitado
      if (g._doorDirty && g._doorDirty.size) { this._doorT = (this._doorT || 0) - dt; if (this._doorT <= 0) { this._doorT = 0.25; for (const d of g._doorDirty) this.hostEvent('door', g.doorState(d)); g._doorDirty.clear(); } }
      if (this.evQueue.length) { this._send({ t: 'ev', evs: this.evQueue }); this.evQueue = []; }
    }
  }
}
