// Música dinámica procedural: secuenciador con capas que reaccionan a la intensidad del combate.
import * as S from './synth.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

const STYLES = {
  industrial: { root: 38, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 5, 3, 6], tempo: [92, 128, 140, 118] },
  clinical: { root: 40, scale: [0, 2, 3, 5, 7, 8, 11], prog: [0, 3, 5, 4], tempo: [84, 122, 136, 112] },
  menu: { root: 36, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 6, 4], tempo: [70, 70, 70, 70] },
};

export class Music {
  constructor(engine) {
    this.e = engine;
    const c = engine.ctx;
    this.c = c;
    this.out = c.createGain(); this.out.gain.value = 0.8;
    this.filter = c.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 18000;
    this.out.connect(this.filter); this.filter.connect(engine.musicBus);
    this.drums = { kick: S.drum(c, 'kick'), snare: S.drum(c, 'snare'), hat: S.drum(c, 'hat'), metal: S.drum(c, 'metal'), tom: S.drum(c, 'tom') };
    this.distortion = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 4); }
    this.distortion.curve = curve;
    this.distGain = c.createGain(); this.distGain.gain.value = 0.25;
    this.distortion.connect(this.distGain); this.distGain.connect(this.out);
    this.padBus = c.createGain(); this.padBus.gain.value = 0.18;
    const padLP = c.createBiquadFilter(); padLP.type = 'lowpass'; padLP.frequency.value = 1400;
    this.padBus.connect(padLP); padLP.connect(this.out);
    padLP.connect(engine.reverbSend);
    this.style = STYLES.industrial;
    this.intensity = 0; this.target = 0;
    this.playing = false;
    this.step = 0; this.bar = 0;
    this.nextTime = 0;
    this.timer = null;
    this.layerGain = [1, 0, 0, 0];
  }

  start(styleName = 'industrial', intensity = 0) {
    this.style = STYLES[styleName] || STYLES.industrial;
    this.intensity = this.target = intensity;
    if (this.playing) return;
    this.playing = true;
    this.nextTime = this.c.currentTime + 0.1;
    this.step = 0; this.bar = 0;
    this.out.gain.setTargetAtTime(0.8, this.c.currentTime, 0.5);
    this.timer = setInterval(() => this._schedule(), 25);
  }
  stop() {
    this.playing = false;
    clearInterval(this.timer);
    this.out.gain.setTargetAtTime(0, this.c.currentTime, 0.4);
  }
  setIntensity(level) { this.target = level; }
  setSlowmo(on) { this.filter.frequency.setTargetAtTime(on ? 600 : 18000, this.c.currentTime, 0.15); }

  _schedule() {
    const c = this.c;
    if (c.state !== 'running') return;
    if (this.nextTime < c.currentTime - 0.5) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.12) {
      const bpm = this.style.tempo[Math.round(this.intensity)] || 100;
      const stepDur = 60 / bpm / 4;
      this._playStep(this.nextTime, this.step, stepDur);
      this.nextTime += stepDur;
      this.step++;
      if (this.step >= 16) {
        this.step = 0; this.bar++;
        // los cambios de intensidad ocurren en compás para que suene musical
        if (this.intensity !== this.target) this.intensity = this.target;
      }
    }
  }

  _hit(buf, t, vol, rate = 1) {
    const s = this.c.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = this.c.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.out); s.start(t);
    s.onended = () => g.disconnect();
  }

  _tone(t, freq, dur, type, vol, dest, attack = 0.005, detune = 0) {
    const o = this.c.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
    const g = this.c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    o.onended = () => g.disconnect();
  }

  _chordRoot() {
    const st = this.style;
    const deg = st.prog[this.bar % st.prog.length];
    return { deg, root: st.root + st.scale[deg % 7] };
  }

  _degreeNote(deg, octave = 0) {
    const sc = this.style.scale;
    return this.style.root + sc[((deg % 7) + 7) % 7] + 12 * (Math.floor(deg / 7) + octave);
  }

  _playStep(t, s, sd) {
    const lvl = Math.round(this.intensity);
    const { deg, root } = this._chordRoot();
    const D = this.drums;
    // PAD (siempre): acorde al inicio de cada compás
    if (s === 0) {
      const notes = [deg, deg + 2, deg + 4].map((d) => this._degreeNote(d, 1));
      for (const n of notes) {
        this._tone(t, NOTE(n), sd * 16 * 1.1, 'sawtooth', 0.12, this.padBus, sd * 4, -8);
        this._tone(t, NOTE(n), sd * 16 * 1.1, 'sawtooth', 0.12, this.padBus, sd * 4, 9);
      }
    }
    if (lvl === 0) {
      // ambiente tranquilo: arpegio de campanas disperso
      if (s % 4 === 0 && Math.random() < 0.55) {
        const d = deg + [0, 2, 4, 7][Math.floor(Math.random() * 4)];
        this._tone(t, NOTE(this._degreeNote(d, 2)), 1.2, 'sine', 0.05, this.out, 0.005);
        this._tone(t, NOTE(this._degreeNote(d, 2)) * 2.76, 0.5, 'sine', 0.012, this.out, 0.005);
      }
      if (s === 8 && this.bar % 2 === 1) this._hit(D.tom, t, 0.25, 0.6);
      return;
    }
    if (lvl === 3) { // jefe: pesado y disonante
      if (s % 4 === 0) this._hit(D.kick, t, 0.9);
      if (s === 6 || s === 14) this._hit(D.tom, t, 0.6, 0.8);
      if (s === 4 || s === 12) this._hit(D.snare, t, 0.7);
      if (s % 2 === 0) this._hit(D.hat, t, 0.18);
      if (s === 0 || s === 3 || s === 6) {
        this._tone(t, NOTE(root - 12), sd * 2.5, 'sawtooth', 0.35, this.distortion);
        this._tone(t, NOTE(root - 11), sd * 2.5, 'sawtooth', 0.2, this.distortion); // segunda menor
      }
      if (s === 10 && this.bar % 2 === 0) this._hit(D.metal, t, 0.35, 0.7);
      return;
    }
    // lvl 1 y 2: combate
    if (s % 8 === 0 || (lvl === 2 && (s === 10 || s === 3))) this._hit(D.kick, t, 0.85);
    if (s === 4 || s === 12) this._hit(D.snare, t, 0.6);
    if (s % 2 === 0) this._hit(D.hat, t, lvl === 2 ? 0.2 : 0.13);
    else if (lvl === 2) this._hit(D.hat, t, 0.08, 1.3);
    // bajo pulsante distorsionado
    const pattern = lvl === 2 ? [1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1] : [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0];
    if (pattern[s]) {
      const n = s === 14 && this.bar % 2 ? root - 12 + 3 : root - 12;
      this._tone(t, NOTE(n), sd * 0.9, 'sawtooth', 0.3, this.distortion);
    }
    if (lvl === 2) {
      if (s === 0 && this.bar % 4 === 2) this._hit(D.metal, t, 0.3);
      // riff de guía
      const riff = [0, -1, -1, 2, -1, 3, -1, 4, -1, -1, 3, -1, 2, -1, 1, -1];
      if (riff[s] >= 0 && this.bar % 2 === 1) this._tone(t, NOTE(this._degreeNote(deg + riff[s], 1)), sd * 1.5, 'square', 0.07, this.out);
    }
  }
}
