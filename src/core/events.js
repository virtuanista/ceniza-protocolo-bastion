// Bus de eventos minimalista para desacoplar sistemas (audio, HUD, progresión...).
export class Emitter {
  constructor() { this.map = new Map(); }
  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) { this.map.get(evt)?.delete(fn); }
  emit(evt, data) {
    const s = this.map.get(evt);
    if (s) for (const fn of s) fn(data);
  }
  clear() { this.map.clear(); }
}

export const bus = new Emitter();
