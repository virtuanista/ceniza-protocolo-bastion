// Motor de audio: buses, reverberación por convolución, audio posicional 3D, bucles,
// limitación de voces y efectos globales (tiempo bala, aturdimiento).
import * as S from './synth.js';
import { Music } from './music.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.voices = 0;
    this.maxVoices = 56;
    this.lastPlay = new Map();
    this.settings = { master: 0.8, sfx: 0.9, music: 0.55 };
    this.listenerPos = { x: 0, y: 0, z: 0 };
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive', sampleRate: S.SR });
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 5; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
    this.globalFilter = c.createBiquadFilter(); this.globalFilter.type = 'lowpass'; this.globalFilter.frequency.value = 20000;
    this.master.connect(this.globalFilter); this.globalFilter.connect(this.comp); this.comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.uiBus = c.createGain(); this.uiBus.connect(this.master);
    this.reverb = c.createConvolver();
    this.reverb.buffer = S.impulseResponse(c);
    this.reverbSend = c.createGain(); this.reverbSend.gain.value = 0.22;
    this.reverbSend.connect(this.reverb); this.reverb.connect(this.sfx);
    this.applyVolumes();
    this._buildLibrary();
    this.music = new Music(this);
    this.warmQueue = [];
  }

  // Pregenera sonidos costosos en segundo plano (un búfer por tramo) para evitar tirones en combate
  warm(jobs) {
    this.warmQueue.push(...jobs);
    if (this._warming) return;
    this._warming = true;
    const step = () => {
      const t0 = performance.now();
      while (this.warmQueue.length && performance.now() - t0 < 4) this.warmQueue.shift()();
      if (this.warmQueue.length) setTimeout(step, 16); else this._warming = false;
    };
    setTimeout(step, 50);
  }

  applyVolumes(s) {
    if (s) Object.assign(this.settings, s);
    if (!this.ctx) return;
    this.master.gain.value = this.settings.master;
    this.sfx.gain.value = this.settings.sfx;
    this.musicBus.gain.value = this.settings.music;
    this.uiBus.gain.value = this.settings.sfx;
  }

  setIndoor(indoor) { // más reverberación en interiores
    if (!this.ctx) return;
    this.reverbSend.gain.setTargetAtTime(indoor ? 0.38 : 0.18, this.ctx.currentTime, 0.4);
  }

  _buildLibrary() {
    const c = this.ctx, B = this.buffers;
    const add = (k, b) => B.set(k, b);
    add('explosion', S.explosion(c, {}, 5));
    add('explosion_small', S.explosion(c, { dur: 1.2, f: 1400 }, 6));
    add('explosion_acid', S.explosion(c, { dur: 1.4, f: 600 }, 8));
    for (const k of ['magOut', 'magIn', 'bolt', 'pump', 'shell', 'open', 'close', 'spin', 'click', 'dry', 'cell', 'canister']) add('mech_' + k, S.mech(c, k, k.length * 3));
    add('hit_flesh', S.noiseHit(c, { f: 400, q: 0.8, d: 0.06, tone: 90, toneD: 0.04, toneAmt: 0.6 }, 41));
    add('hit_flesh2', S.noiseHit(c, { f: 700, q: 0.8, d: 0.05, tone: 70, toneD: 0.05 }, 42));
    add('headshot', S.noiseHit(c, { f: 1500, q: 0.6, d: 0.09, tone: 140, toneD: 0.07, toneAmt: 1, drive: 2.5 }, 43));
    add('hit_armor', S.noiseHit(c, { f: 3200, q: 6, d: 0.08, drive: 2 }, 44));
    add('hit_concrete', S.noiseHit(c, { f: 2200, q: 1, d: 0.02 }, 45));
    add('hit_metal', S.noiseHit(c, { f: 4200, q: 12, d: 0.12, drive: 2 }, 46));
    add('hitmarker', S.tone(c, [[0, 2600, 0.03, 0.4]], 0.08, 'square'));
    add('killmarker', S.tone(c, [[0, 1900, 0.05, 0.4], [0.03, 2800, 0.06, 0.35]], 0.15, 'square'));
    add('swing', S.whoosh(c, 0.22, 1200, 47));
    add('swing_heavy', S.whoosh(c, 0.4, 500, 48));
    // pasos: 4 variantes por superficie para evitar el efecto ametralladora
    for (const surf of ['concrete', 'tile', 'dirt', 'metal', 'wood']) for (let i = 0; i < 4; i++) add(`step_${surf}_${i}`, S.footstep(c, surf, 200 + surf.length * 17 + i * 31));
    for (const surf of ['concrete', 'metal']) add(`land_${surf}`, S.footstep(c, surf, 260 + surf.length, 2.2));
    add('step_heavy', S.footstep(c, 'dirt', 271, 3.2));
    add('jump', S.rustle(c, 0.3, 52, 0.4));
    add('rustle', S.rustle(c, 0.22, 53, 0.15));
    add('saw_loop', S.sawLoop(c));
    add('rocket_launch', S.rocketLaunch(c));
    add('heal', S.loopNoise(c, { f: 5000, q: 2, dur: 0.6, drive: 1 }, 53));
    add('heal_done', S.tone(c, [[0, 880, 0.1, 0.4], [0.08, 1320, 0.2, 0.4]], 0.4, 'bell'));
    add('weld_loop', S.loopNoise(c, { f: 3500, q: 0.6, crackle: 0.02, dur: 1.2, hum: 120, humAmt: 0.15 }, 54));
    add('flame_loop', S.loopNoise(c, { type: 'lp', f: 900, q: 0.5, lp: 1500, crackle: 0.008, dur: 1.5, drive: 1.6 }, 55));
    add('beam_loop', S.loopNoise(c, { f: 2500, q: 3, crackle: 0.05, dur: 1, hum: 180, humAmt: 0.5 }, 56));
    add('door_bang', S.noiseHit(c, { f: 300, q: 1.2, d: 0.2, tone: 60, toneD: 0.3, toneAmt: 1.5, drive: 2.5 }, 57));
    add('door_slide', S.whoosh(c, 0.45, 400, 58));
    add('door_break', S.explosion(c, { dur: 1, f: 1800 }, 59));
    add('trader_open', S.tone(c, [[0, 523, 0.2, 0.5], [0.12, 659, 0.2, 0.5], [0.24, 784, 0.4, 0.5]], 1, 'bell'));
    add('buy', S.tone(c, [[0, 1318, 0.08, 0.4], [0.06, 1760, 0.18, 0.4]], 0.35, 'bell'));
    add('sell', S.tone(c, [[0, 1760, 0.08, 0.4], [0.06, 1318, 0.18, 0.4]], 0.35, 'bell'));
    add('deny', S.tone(c, [[0, 160, 0.18, 0.5], [0.0, 170, 0.18, 0.4]], 0.3, 'square'));
    add('ui_click', S.noiseHit(c, { f: 3000, q: 4, d: 0.01 }, 60));
    add('ui_hover', S.noiseHit(c, { f: 5000, q: 6, d: 0.006 }, 61));
    add('wave_start', S.tone(c, [[0, 110, 1.2, 0.6], [0, 165, 1.2, 0.4], [0.6, 104, 1.6, 0.6], [0.6, 155, 1.6, 0.4]], 2.6, 'saw'));
    add('wave_end', S.tone(c, [[0, 392, 0.3, 0.4], [0.2, 523, 0.3, 0.4], [0.4, 659, 0.6, 0.5]], 1.4, 'bell'));
    add('countdown', S.tone(c, [[0, 1000, 0.08, 0.5]], 0.15, 'square'));
    add('levelup', S.tone(c, [[0, 523, 0.15, 0.4], [0.1, 659, 0.15, 0.4], [0.2, 784, 0.15, 0.4], [0.3, 1046, 0.5, 0.5]], 1.2, 'bell'));
    add('zed_in', S.whoosh(c, 0.9, 300, 62));
    add('zed_out', S.whoosh(c, 0.6, 700, 63));
    add('heartbeat', S.heartbeat(c));
    add('player_hurt', S.creatureVoice(c, { dur: 0.3, pitch: 150, contour: [1.2, 0.9], form: [600, 1100, 2400], rough: 0.2, breath: 0.6, drive: 1.5 }, 64));
    add('player_hurt2', S.creatureVoice(c, { dur: 0.35, pitch: 135, contour: [1.1, 1.3, 0.8], form: [550, 1000, 2500], rough: 0.25, breath: 0.6, drive: 1.5 }, 65));
    add('armor_hit', S.noiseHit(c, { f: 1800, q: 4, d: 0.05, tone: 300, toneD: 0.03, toneAmt: 0.3 }, 66));
    add('pickup', S.tone(c, [[0, 1200, 0.06, 0.4], [0.05, 1600, 0.1, 0.4]], 0.25, 'bell'));
    add('grenade_pin', S.mech(c, 'click', 67));
    add('grenade_bounce', S.noiseHit(c, { f: 2500, q: 5, d: 0.04 }, 68));
    add('acid_spit', S.noiseHit(c, { f: 900, q: 0.8, d: 0.12, att: 0.01, drive: 1.2 }, 69));
    add('acid_sizzle', S.loopNoise(c, { f: 6000, q: 1, crackle: 0.03, dur: 0.8 }, 70));
    add('scream', S.creatureVoice(c, { dur: 1.6, pitch: 420, contour: [0.9, 1.4, 1.6, 1.5, 1.2], form: [1200, 2800, 4200], rough: 0.7, am: 70, breath: 0.7, noiseF: 4000, drive: 3.5, jitter: 0.15 }, 71));
    add('boss_roar', S.roar(c, 72, 2.6, 48));
    add('boss_roar2', S.roar(c, 73, 1.8, 62));
    add('slam', S.explosion(c, { dur: 1.6, f: 400 }, 74));
    add('charge_warn', S.creatureVoice(c, { dur: 0.9, pitch: 70, contour: [0.8, 1.6, 2], form: [400, 900, 1800], rough: 0.9, breath: 1, drive: 3 }, 75));
    add('spikes', S.noiseHit(c, { f: 1500, q: 1.2, d: 0.15, tone: 200, toneD: 0.1, drive: 2 }, 76));
    add('cloak', S.whoosh(c, 0.7, 2000, 77));
    add('chain_zap', S.zap(c, { f0: 3000, f1: 300, sweep: 12, dur: 0.25 }, 78));
    add('stun', S.zap(c, { f0: 800, f1: 120, sweep: 4, dur: 0.5, tone: 0.6 }, 79));
    add('fire_ignite', S.noiseHit(c, { type: 'lp', f: 1200, q: 0.6, d: 0.25, att: 0.02 }, 80));
    add('objective', S.tone(c, [[0, 660, 0.15, 0.4], [0.15, 880, 0.15, 0.4], [0.3, 660, 0.15, 0.4], [0.45, 990, 0.4, 0.5]], 1.2, 'bell'));
    add('objective_fail', S.tone(c, [[0, 330, 0.3, 0.5], [0.25, 247, 0.6, 0.5]], 1.1, 'saw'));
    add('revive', S.tone(c, [[0, 440, 0.2, 0.4], [0.15, 660, 0.2, 0.4], [0.3, 880, 0.5, 0.5]], 1, 'bell'));
    add('downed', S.tone(c, [[0, 220, 0.5, 0.5], [0.3, 185, 0.8, 0.5]], 1.4, 'saw'));
    add('gib', S.noiseHit(c, { f: 300, q: 0.6, d: 0.18, tone: 50, toneD: 0.12, toneAmt: 1.2, drive: 2.5 }, 81));
    add('rage', S.creatureVoice(c, { dur: 1.3, pitch: 85, contour: [0.9, 1.5, 1.8, 1.4], form: [500, 1100, 2400], rough: 0.95, am: 25, breath: 1, drive: 3.5, jitter: 0.3 }, 82));
    add('vent', S.noiseHit(c, { f: 1500, q: 2, d: 0.2, tone: 180, toneD: 0.1, toneAmt: 0.6, drive: 2 }, 83));
    add('cash_drop', S.tone(c, [[0, 2200, 0.05, 0.3], [0.04, 2600, 0.05, 0.3], [0.08, 3000, 0.08, 0.3]], 0.3, 'bell'));
    add('flashlight', S.mech(c, 'click', 84));
    add('repair_done', S.tone(c, [[0, 500, 0.1, 0.4], [0.1, 750, 0.3, 0.4]], 0.5, 'bell'));
  }

  // Sonidos generados bajo demanda (armas y voces) con caché
  getOrMake(key, maker) {
    let b = this.buffers.get(key);
    if (!b && this.ctx) { b = maker(this.ctx); this.buffers.set(key, b); }
    return b;
  }

  weaponBuffer(def) {
    const s = def.sound || {};
    return this.getOrMake('w_' + def.id, (c) => (s.type === 'zap' ? S.zap(c, s, def.id.length * 13) : S.gunshot(c, s, def.id.length * 7 + 1)));
  }

  voiceBuffer(type, kind, variant, params) {
    return this.getOrMake(`v_${type}_${kind}_${variant}`, (c) => S.creatureVoice(c, params, type.length * 31 + kind.length * 7 + variant * 101));
  }

  updateListener(cam, fwd, up) {
    if (!this.ctx) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    this.listenerPos.x = cam.x; this.listenerPos.y = cam.y; this.listenerPos.z = cam.z;
    if (L.positionX) {
      L.positionX.setValueAtTime(cam.x, t); L.positionY.setValueAtTime(cam.y, t); L.positionZ.setValueAtTime(cam.z, t);
      L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t);
    } else {
      L.setPosition(cam.x, cam.y, cam.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  // opts: {pos:{x,y,z}, volume, rate, detune, bus:'sfx'|'ui', reverb, reverbAmt, cooldown, maxDist, hrtf}
  play(nameOrBuf, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return null;
    const buf = typeof nameOrBuf === 'string' ? this.buffers.get(nameOrBuf) : nameOrBuf;
    if (!buf) return null;
    const now = this.ctx.currentTime;
    if (opts.cooldown) {
      const key = typeof nameOrBuf === 'string' ? nameOrBuf : buf;
      const lp = this.lastPlay.get(key) || 0;
      if (now - lp < opts.cooldown) return null;
      this.lastPlay.set(key, now);
    }
    if (opts.pos) {
      const dx = opts.pos.x - this.listenerPos.x, dy = opts.pos.y - this.listenerPos.y, dz = opts.pos.z - this.listenerPos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > (opts.maxDist ?? 70)) return null;
    }
    if (this.voices >= this.maxVoices && !opts.priority) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (this.timeRate ?? 1) * (opts.noTimeScale ? 1 / (this.timeRate ?? 1) : 1);
    if (opts.detune) src.detune.value = opts.detune;
    if (opts.loop) src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g);
    let out = g;
    if (opts.pos) {
      const p = this.ctx.createPanner();
      p.panningModel = opts.hrtf ? 'HRTF' : 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = opts.ref ?? 2.5;
      p.maxDistance = 100;
      p.rolloffFactor = opts.rolloff ?? 1.1;
      p.positionX.value = opts.pos.x; p.positionY.value = opts.pos.y; p.positionZ.value = opts.pos.z;
      g.connect(p);
      out = p;
      src._panner = p;
    }
    const bus = opts.bus === 'ui' ? this.uiBus : this.sfx;
    out.connect(bus);
    if (opts.reverb !== false && opts.bus !== 'ui') {
      if (opts.reverbAmt != null) { const rs = this.ctx.createGain(); rs.gain.value = opts.reverbAmt; out.connect(rs); rs.connect(this.reverbSend); src._rs = rs; }
      else out.connect(this.reverbSend);
    }
    this.voices++;
    src.onended = () => { this.voices--; try { out.disconnect(); g.disconnect(); src._rs?.disconnect(); } catch (e) { /* ya desconectado */ } };
    src.start(now + (opts.delay ?? 0));
    src._gain = g;
    return src;
  }

  loop(name, opts = {}) { return this.play(name, { ...opts, loop: true, priority: true }); }
  stop(src, fade = 0.08) {
    if (!src || !this.ctx) return;
    try {
      src._gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
      src.stop(this.ctx.currentTime + fade);
    } catch (e) { /* ya detenido */ }
  }
  movePanner(src, pos) { if (src && src._panner) { const t = this.ctx.currentTime; src._panner.positionX.setValueAtTime(pos.x, t); src._panner.positionY.setValueAtTime(pos.y, t); src._panner.positionZ.setValueAtTime(pos.z, t); } }

  // Efecto global de tiempo bala: filtro y desafinado
  setSlowmo(active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.globalFilter.frequency.setTargetAtTime(active ? 1400 : 20000, t, 0.12);
    this.timeRate = active ? 0.6 : 1;
    this.music?.setSlowmo(active);
  }
  setMuffle(amount) { // aturdimiento por explosión / gritos
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 20000 - amount * 19000;
    this.globalFilter.frequency.cancelScheduledValues(t);
    this.globalFilter.frequency.setValueAtTime(Math.max(600, f), t);
    this.globalFilter.frequency.setTargetAtTime(this.timeRate < 1 ? 1400 : 20000, t + 0.2, 0.6);
  }
}

export const audio = new AudioEngine();
