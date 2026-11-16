// HUD en DOM: vitales, munición, créditos, oleada/cuenta atrás, flecha al comerciante,
// objetivo, jefe, avisos, indicadores de daño, marcadores 3D, compañeros y marcador (Tab).
import * as THREE from 'three';
import { bus } from '../core/events.js';
import { PERKS } from '../game/perks.js';
import { PHASE } from '../game/waves.js';
import { fmtTime, fmtNum, clamp } from '../core/utils.js';
import { saveSys } from '../save/save.js';
import { audio } from '../audio/audio.js';

const $ = (sel, root = document) => root.querySelector(sel);

export class HUD {
  constructor(root) {
    this.root = root;
    this.game = null;
    this.toasts = [];
    this.killfeed = [];
    this.dmgDirs = [];
    this.hitT = 0;
    this.fps = 0; this._fpsAcc = 0; this._fpsN = 0;
    this._v = new THREE.Vector3();
    this.creditDelta = 0; this.creditDeltaT = 0;
    this.warnT = 0;
    this.centerT = 0;
    bus.on('hitmarker', (d) => this._hit(d));
    bus.on('playerHurt', (d) => this._hurt(d));
    bus.on('toast', (d) => this.toast(d.text, d.kind));
    bus.on('killfeed', (d) => this._kill(d));
    bus.on('credits', (n) => { if (typeof n === 'number' && n > 0) { this.creditDelta += n; this.creditDeltaT = 2; } });
    bus.on('waveStart', (d) => this.center(d.boss ? 'EL PRIMOGÉNITO' : `OLEADA ${d.wave}`, d.boss ? 'Oleada final: derrota al jefe' : `${d.total} engendros en camino`, 3.5));
    bus.on('waveEnd', (d) => this.center('OLEADA SUPERADA', `Bonificación +${d.bonus} ₵ · El comerciante está abierto`, 3.5));
    bus.on('traderOpen', () => {});
    bus.on('zed', (on) => this._zed(on));
    bus.on('bossWarn', (t) => { this.warnText = t; this.warnT = 2.4; });
    bus.on('bossPhase', (d) => { if (!d.intro) this.center(`FASE ${d.phase}`, d.phase === 2 ? 'El Primogénito muda la piel' : 'El Primogénito enloquece', 2.5); });
    bus.on('objectiveStart', (o) => this.center('OBJETIVO OPCIONAL', o.title + ' — ' + o.desc, 3));
    bus.on('objectiveEnd', (d) => this.toast(d.ok ? `Objetivo completado: ${d.obj.title}` : `Objetivo fallido: ${d.reason}`, d.ok ? 'good' : 'bad'));
    bus.on('enemyRage', (e) => { if (this.game && e.pos.distanceTo(this.game.local.pos) < 30) this.toast(`¡${e.def.name} enfurecido!`, 'bad'); });
  }

  attach(game) {
    this.game = game;
    this.root.classList.remove('hidden');
    this.root.innerHTML = `
      <div class="vignette" id="h-vig"></div>
      <div class="zedfx" id="h-zedfx"></div>
      <div class="acidfx" id="h-acid"></div>
      <div class="screamfx" id="h-scream"></div>
      <div class="zedtext" id="h-zedtext">TIEMPO MUERTO</div>
      <div class="scope hidden" id="h-scope"><div class="dot"></div></div>
      <div id="crosshair"></div>
      <div id="hitmarker"><i style="transform:rotate(45deg) translateX(-12px)"></i><i style="transform:rotate(135deg) translateX(-12px)"></i><i style="transform:rotate(225deg) translateX(-12px)"></i><i style="transform:rotate(315deg) translateX(-12px)"></i></div>
      <div class="damage-dir" id="h-dmg"></div>
      <div id="h-markers"></div>
      <div id="h-tags"></div>
      <div class="hud-box wave" id="h-wave"><div class="t" id="h-wt"></div><div class="n" id="h-wn"></div><div class="s" id="h-ws"></div></div>
      <div class="trader-arrow hud-box hidden" id="h-tr"><div class="arr" id="h-tra">▲</div><div id="h-trd"></div></div>
      <div class="hud-box boss hidden" id="h-boss"><div class="nm" id="h-bn">EL PRIMOGÉNITO</div><div class="b"><i id="h-bb"></i><u style="left:66%"></u><u style="left:33%"></u></div><div class="muted" id="h-bp"></div></div>
      <div class="boss-warn" id="h-warn"></div>
      <div class="hud-box objective hidden" id="h-obj"><b>OBJETIVO OPCIONAL</b><div class="d" id="h-od"></div><div class="bar"><i id="h-ob"></i></div><div class="muted" id="h-ot"></div></div>
      <div class="hud-box killfeed" id="h-kf"></div>
      <div class="hud-box team" id="h-team"></div>
      <div class="hud-box vitals">
        <div class="perk"><div class="ic" id="h-pi"></div><div><div id="h-pn"></div><div class="muted" style="font-size:14px" id="h-pl"></div></div></div>
        <div class="vbar"><span class="ic">✚</span><div class="b"><i id="h-hp" style="background:var(--hp)"></i></div><span class="v" id="h-hpv"></span></div>
        <div class="vbar"><span class="ic">⛨</span><div class="b"><i id="h-ar" style="background:var(--armor)"></i></div><span class="v" id="h-arv"></span></div>
        <div class="vbar"><span class="ic">⚕</span><div class="b" style="height:6px"><i id="h-sy" style="background:var(--good)"></i></div><span class="v" style="font-size:14px" id="h-syv"></span></div>
      </div>
      <div class="hud-box cash" id="h-cash"></div>
      <div class="hud-box ammo"><div class="wn" id="h-wname"></div><div><span class="mag" id="h-mag"></span> <span class="res" id="h-res"></span></div><div class="eq"><span id="h-gr"></span><span id="h-wt2"></span></div></div>
      <div class="center-msg" id="h-center"><div class="big" id="h-cb"></div><div class="small" id="h-cs"></div></div>
      <div class="prompt hidden" id="h-prompt"></div>
      <div class="hold hidden" id="h-hold"><div id="h-holdt"></div><div class="bar"><i id="h-holdb"></i></div></div>
      <div class="toasts" id="h-toasts"></div>
      <div class="hud-box scoreboard hidden" id="h-score"></div>
      <div class="fps hidden" id="h-fps"></div>
      <div class="click-to-play hidden" id="h-click">HAZ CLIC PARA CONTINUAR</div>
    `;
    this.el = {};
    for (const n of this.root.querySelectorAll('[id]')) this.el[n.id.replace('h-', '')] = n;
    this.el.click.addEventListener('click', () => { if (!this.game.app.ui.blocking) this.game.app.input.lock(); });
    const perk = PERKS[game.perkId];
    this.el.pi.textContent = perk.icon; this.el.pi.style.borderColor = perk.color; this.el.pi.style.color = perk.color;
    this.el.pn.textContent = perk.name;
    this._buildCrosshair();
    // consejos para las primeras partidas
    if ((saveSys.data.stats.games || 0) < 3) {
      const tips = [
        'Sigue la flecha verde hasta la cápsula LONJA y pulsa [E] para comprar equipo',
        'Las armas de tu clase reciben sus bonificaciones: cómpralas primero',
        'Con el soldador [T] puedes sellar puertas y crear cuellos de botella',
        'Pulsa [L] cuando estés listo para empezar la oleada antes de tiempo',
        'Apunta a la cabeza: decapitar mata al instante y evita que la Vesícula reviente',
      ];
      tips.forEach((t, i) => setTimeout(() => { if (this.game === game) this.toast(t, 'info'); }, 2500 + i * 3600));
    }
  }

  openChat(net, input) {
    if (this._chatEl) return;
    const box = document.createElement('input');
    box.className = 'input';
    box.maxLength = 120;
    box.placeholder = 'Mensaje al equipo (Enter envía, Esc cancela)';
    Object.assign(box.style, { position: 'absolute', left: '24px', bottom: '170px', width: '360px', pointerEvents: 'auto' });
    this.root.appendChild(box);
    this._chatEl = box;
    input.textFocus = true;
    input.keys.clear();
    const close = () => { input.textFocus = false; box.remove(); this._chatEl = null; };
    box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { if (box.value.trim()) net.chat(box.value.trim()); close(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    box.addEventListener('blur', close);
    setTimeout(() => box.focus(), 0);
  }

  detach() { this.game = null; this.root.classList.add('hidden'); this.root.innerHTML = ''; }

  _buildCrosshair() {
    const c = this.root.querySelector('#crosshair');
    c.innerHTML = '<i class="dot"></i><i id="ch-t" style="width:2px;height:8px;left:-1px"></i><i id="ch-b" style="width:2px;height:8px;left:-1px"></i><i id="ch-l" style="height:2px;width:8px;top:-1px"></i><i id="ch-r" style="height:2px;width:8px;top:-1px"></i>';
    this.ch = { t: c.querySelector('#ch-t'), b: c.querySelector('#ch-b'), l: c.querySelector('#ch-l'), r: c.querySelector('#ch-r'), root: c };
  }

  toast(text, kind = 'info') {
    if (!this.el) return;
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    this.toasts.push({ el: d, t: kind === 'level' ? 4 : 3 });
    while (this.toasts.length > 5) { const o = this.toasts.shift(); o.el.remove(); }
  }
  center(big, small, t = 3) { if (!this.el) return; this.el.cb.textContent = big; this.el.cs.textContent = small; this.centerT = t; }
  setHoldProgress(p, text = '') { if (!this.el) return; this.el.hold.classList.toggle('hidden', !p); if (p) { this.el.holdt.textContent = text; this.el.holdb.style.width = clamp(p, 0, 1) * 100 + '%'; } }
  acidFx() { if (this.el) { this.el.acid.style.opacity = 1; this._acidT = 1.2; } }
  screamFx() { if (this.el) { this.el.scream.style.opacity = 1; this._screamT = 0.6; } }

  _hit(d) {
    if (!this.el) return;
    const h = this.el.hitmarker;
    h.className = d.heal ? 'heal' : d.kill ? 'kill' : d.head ? 'head' : '';
    this.hitT = d.kill ? 0.3 : 0.15;
    h.style.opacity = 1;
    if (!d.heal) audio.play(d.kill ? 'killmarker' : 'hitmarker', { volume: d.kill ? 0.35 : 0.18, bus: 'ui', cooldown: 0.03 });
  }
  _kill(d) {
    if (!this.el) return;
    const div = document.createElement('div');
    if (d.headshot) div.className = 'hs';
    div.textContent = `${d.headshot ? '✖ ' : ''}${d.enemy}  +${d.credits}₵`;
    this.el.kf.prepend(div);
    this.killfeed.push({ el: div, t: 4 });
    while (this.el.kf.children.length > 5) this.el.kf.lastChild.remove();
  }
  _hurt(d) {
    if (!this.el || !this.game) return;
    if (d.sourcePos && d.sourcePos.x !== undefined) {
      const p = this.game.local;
      const ang = Math.atan2(d.sourcePos.x - p.pos.x, d.sourcePos.z - p.pos.z);
      const i = document.createElement('i');
      this.el.dmg.appendChild(i);
      this.dmgDirs.push({ el: i, ang, t: 1.2 });
    }
    this._hurtFlash = Math.min(1, (this._hurtFlash || 0) + d.amount / 30);
  }
  _zed(on) {
    if (!this.el) return;
    this.el.zedfx.style.opacity = on ? 1 : 0;
    this.el.zedtext.style.opacity = on ? 1 : 0;
    document.getElementById('view').classList.toggle('zed', on);
  }

  update(dt) {
    const g = this.game;
    if (!g || !this.el) return;
    const el = this.el, p = g.local, w = g.weapons, waves = g.waves;
    // FPS
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc > 0.5) { this.fps = Math.round(this._fpsN / this._fpsAcc); this._fpsAcc = 0; this._fpsN = 0; if (saveSys.data.settings.showFps) { const r = g.renderer.stats(); el.fps.textContent = `${this.fps} FPS · ${r.calls} draw · ${g.enemies.alive.length} engendros`; } }
    el.fps.classList.toggle('hidden', !saveSys.data.settings.showFps);
    el.click.classList.toggle('hidden', g.app.input.locked || g.app.ui.blocking || g.over);
    // vitales
    el.hp.style.transform = `scaleX(${clamp(p.hp / p.maxHp, 0, 1)})`;
    el.hpv.textContent = Math.ceil(p.hp);
    el.ar.style.transform = `scaleX(${clamp(p.armor / p.maxArmor, 0, 1)})`;
    el.arv.textContent = Math.ceil(p.armor);
    el.sy.style.transform = `scaleX(${w.syringe / 100})`;
    el.syv.textContent = w.syringe >= 50 ? '[Q]' : '';
    el.pl.textContent = `Nivel ${g.perkLevel}`;
    // munición
    const inst = w.current;
    if (inst) {
      el.wname.textContent = inst.def.name + (inst.upgrade ? ` +${inst.upgrade}` : '');
      if (inst.def.mag) { el.mag.textContent = inst.mag; el.res.textContent = '/ ' + inst.reserve; el.mag.style.color = inst.mag <= Math.ceil(inst.stats.mag * 0.2) ? 'var(--bad)' : ''; }
      else if (inst.def.id === 'syringe') { el.mag.textContent = Math.floor(w.syringe) + '%'; el.res.textContent = ''; el.mag.style.color = ''; }
      else if (inst.def.id === 'welder') { const d = w.weldTarget; el.mag.textContent = d ? Math.round(d.weldPct * 100) + '%' : '—'; el.res.textContent = d ? (d.destroyed ? 'reparando ' + Math.round(d.repair) + '%' : d.name) : ''; el.mag.style.color = ''; }
      else { el.mag.textContent = '∞'; el.res.textContent = ''; el.mag.style.color = ''; }
    }
    el.gr.textContent = `● ${w.grenades} [G]`;
    el.wt2.textContent = `Peso ${w.totalWeight()}/${w.carryCap()}`;
    // créditos
    if (this.creditDeltaT > 0) { this.creditDeltaT -= dt; if (this.creditDeltaT <= 0) this.creditDelta = 0; }
    el.cash.innerHTML = `₵ ${fmtNum(p.credits)}${this.creditDelta ? `<span class="delta">+${this.creditDelta}</span>` : ''}`;
    // oleada
    const total = waves.endless ? '∞' : waves.length.waves + 1;
    const trading = waves.phase === PHASE.TRADER || waves.phase === PHASE.PREP;
    if (trading) {
      el.wt.textContent = waves.phase === PHASE.PREP ? 'Preparación' : 'Comerciante abierto';
      el.wn.textContent = fmtTime(waves.timer);
      el.ws.textContent = `Siguiente: oleada ${waves.wave + 1} / ${total}${waves.isBossWave(waves.wave + 1) ? ' — JEFE' : ''} · [L] Listo${waves.ready.size ? ` (${waves.ready.size}/${g.getPlayers().filter((q) => q.alive).length})` : ''}`;
    } else {
      el.wt.textContent = waves.phase === PHASE.BOSS ? 'Oleada del jefe' : `Oleada ${waves.wave} / ${total}`;
      const rem = g.authority ? waves.remaining : (waves.netRemaining ?? 0);
      el.wn.textContent = waves.phase === PHASE.BOSS ? '☠' : rem;
      el.ws.textContent = waves.phase === PHASE.BOSS ? '' : 'engendros restantes';
    }
    // flecha al comerciante
    const pod = waves.activePod;
    const showArrow = trading && pod;
    el.tr.classList.toggle('hidden', !showArrow);
    if (showArrow) {
      const dx = pod.pos.x - p.pos.x, dz = pod.pos.z - p.pos.z;
      const ang = Math.atan2(dx, dz) - (p.yaw + Math.PI);
      el.tra.style.transform = `rotate(${-ang}rad)`;
      el.trd.textContent = `Comerciante: ${pod.def.name} · ${Math.round(Math.hypot(dx, dz))} m`;
    }
    // jefe
    const bossE = g.enemies.alive.find((e) => e.def.boss);
    el.boss.classList.toggle('hidden', !bossE);
    if (bossE) { el.bb.style.width = clamp(bossE.hp / bossE.maxHp, 0, 1) * 100 + '%'; el.bp.textContent = g.boss ? `Fase ${g.boss.phase}${g.boss.exposedT > 0 ? ' · ¡CORAZÓN EXPUESTO!' : ''}${g.boss.regen ? ' · regenerándose' : ''}` : ''; }
    if (this.warnT > 0) { this.warnT -= dt; el.warn.textContent = this.warnText; el.warn.style.opacity = Math.min(1, this.warnT * 2); } else el.warn.style.opacity = 0;
    // objetivo
    const obj = g.objective();
    el.obj.classList.toggle('hidden', !obj || obj.done || obj.failed);
    if (obj && !obj.done && !obj.failed) { el.od.textContent = `${obj.title}: ${obj.desc}`; el.ob.style.width = clamp(obj.progress / obj.goal, 0, 1) * 100 + '%'; el.ot.textContent = `Tiempo: ${fmtTime(obj.time)} · Recompensa ${obj.reward} ₵`; }
    // mensajes centrales
    if (this.centerT > 0) { this.centerT -= dt; el.center.style.opacity = Math.min(1, this.centerT); } else el.center.style.opacity = 0;
    // toasts
    for (let i = this.toasts.length - 1; i >= 0; i--) { const t = this.toasts[i]; t.t -= dt; if (t.t < 0.4) t.el.style.opacity = t.t / 0.4; if (t.t <= 0) { t.el.remove(); this.toasts.splice(i, 1); } }
    // impacto
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) el.hitmarker.style.opacity = 0; }
    // daño direccional
    for (let i = this.dmgDirs.length - 1; i >= 0; i--) {
      const d = this.dmgDirs[i]; d.t -= dt;
      const rel = d.ang - (p.yaw + Math.PI);
      d.el.style.transform = `rotate(${-rel}rad)`; d.el.style.opacity = Math.min(1, d.t);
      if (d.t <= 0) { d.el.remove(); this.dmgDirs.splice(i, 1); }
    }
    this._hurtFlash = Math.max(0, (this._hurtFlash || 0) - dt * 1.5);
    const low = p.hp < p.maxHp * 0.35 ? (1 - p.hp / (p.maxHp * 0.35)) * 0.7 : 0;
    el.vig.style.opacity = Math.max(low, this._hurtFlash || 0, p.downed ? 0.9 : 0);
    if (this._acidT > 0) { this._acidT -= dt; if (this._acidT <= 0) el.acid.style.opacity = 0; }
    if (this._screamT > 0) { this._screamT -= dt; if (this._screamT <= 0) el.scream.style.opacity = 0; }
    // mira
    el.scope.classList.toggle('hidden', !w.scoped);
    const showCh = saveSys.data.settings.crosshair && !w.scoped && w.ads < 0.6 && inst && inst.def.cat !== 'melee';
    this.ch.root.style.display = showCh ? '' : 'none';
    if (showCh && inst?.stats) {
      const moving = Math.hypot(p.vel.x, p.vel.z) > 1;
      let sp = (inst.stats.spread || 0.01) * (moving ? 1.5 : 1) * (p.onGround ? 1 : 2) * (p.crouching ? 0.75 : 1);
      if (inst.def.fire?.mode === 'flame' || inst.def.fire?.mode === 'beam') sp = 0.03;
      const px = 6 + sp * window.innerHeight / (2 * Math.tan(g.renderer.camera.fov * Math.PI / 360)) + w.kick * 40;
      this.ch.t.style.top = (-px - 8) + 'px'; this.ch.b.style.top = px + 'px'; this.ch.l.style.left = (-px - 8) + 'px'; this.ch.r.style.left = px + 'px';
    }
    // aviso de interacción
    this._prompt(g, p);
    this._markers(g);
    this._team(g);
    // marcador
    const tab = g.app.input.down('scoreboard');
    el.score.classList.toggle('hidden', !tab);
    if (tab) this._scoreboard(g);
  }

  _prompt(g, p) {
    let txt = '';
    if (p.downed) txt = `ABATIDO — esperando reanimación (${Math.ceil(p.downedTimer)} s)`;
    else if (!p.alive) txt = 'MUERTO — reaparecerás al final de la oleada';
    else {
      const waves = g.waves;
      const pod = waves.activePod;
      if (pod && (waves.phase === PHASE.TRADER || waves.phase === PHASE.PREP) && p.pos.distanceTo(pod.pos) < 3.2) txt = '[E] Abrir comerciante «LONJA»';
      else {
        const obj = g.objective();
        if (obj && obj.kind === 'repair' && p.pos.distanceTo(obj.pos) < 2) txt = '[Mantén E] Reparar dispositivo';
        else if (obj && obj.kind === 'carry' && !obj.carrier && p.pos.distanceTo(obj.itemPos) < 2) txt = '[E] Recoger ' + obj.data.name;
        else {
          const downed = [...g.remote.values()].find((r) => r.downed && r.pos.distanceTo(p.pos) < 2);
          if (downed) txt = `[Mantén E] Reanimar a ${downed.name}`;
          else {
            const door = g.findDoorInFront(2.6);
            if (door) {
              if (g.weapons.current?.def.id === 'welder') txt = door.destroyed ? `[Clic] Reparar puerta (${Math.round(door.repair)}%)` : `[Clic] Soldar · [Clic der.] Desoldar · ${Math.round(door.weldPct * 100)}%`;
              else if (door.destroyed) txt = 'Puerta destruida — repárala con el soldador [T]';
              else if (door.weld > 0) txt = `Puerta soldada ${Math.round(door.weldPct * 100)}%`;
              else txt = door.closed ? '[E] Abrir puerta · [T] Soldador' : '[E] Cerrar puerta';
            } else if (g.weapons.current?.def.id === 'syringe') txt = '[Clic] Curar compañero · [Clic der.] Curarte';
          }
        }
      }
    }
    this.el.prompt.classList.toggle('hidden', !txt);
    if (txt) this.el.prompt.textContent = txt;
  }

  _project(pos, yOff = 0) {
    const g = this.game;
    const v = this._v.set(pos.x, pos.y + yOff, pos.z).project(g.renderer.camera);
    if (v.z > 1) return null;
    return [(v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight];
  }

  _markers(g) {
    let html = '';
    const obj = g.objective();
    if (obj && !obj.done && !obj.failed) {
      const target = obj.kind === 'carry' ? (obj.carrier ? obj.dest : obj.itemPos) : obj.pos;
      const s = this._project(target, 1.5);
      if (s) html += `<div class="marker" style="left:${s[0]}px;top:${s[1]}px"><div class="ic">◆</div>${Math.round(g.local.pos.distanceTo(target))} m</div>`;
    }
    const waves = g.waves, pod = waves.activePod;
    if (pod && (waves.phase === PHASE.TRADER || waves.phase === PHASE.PREP)) {
      const s = this._project(pod.pos, 3.2);
      if (s) html += `<div class="marker trader" style="left:${s[0]}px;top:${s[1]}px"><div class="ic">₵</div>LONJA</div>`;
    }
    // barras de vida enemigas (Asalto)
    if (g.local.mods?.showHp) {
      const fwd = g.local.forward;
      let best = null, bd = 0.995;
      for (const e of g.enemies.alive) {
        const to = e.center().clone().sub(g.local.camPos);
        const d = to.length(); if (d > 40) continue;
        const dot = to.normalize().dot(fwd);
        if (dot > bd) { bd = dot; best = e; }
      }
      if (best && !best.cloaked) {
        const s = this._project(best.pos, best.def.height * (best.def.model.scale || 1) + 0.35);
        if (s) html += `<div class="ehp" style="left:${s[0]}px;top:${s[1]}px"><div class="muted" style="font-size:12px;text-align:center">${best.def.name}</div><div class="bar"><i style="width:${clamp(best.hp / best.maxHp, 0, 1) * 100}%"></i></div></div>`;
      }
    }
    this.el.markers.innerHTML = html;
  }

  _team(g) {
    if (!g.remote.size) { this.el.team.innerHTML = ''; this.el.tags.innerHTML = ''; return; }
    let html = '', tags = '';
    for (const r of g.remote.values()) {
      const perk = PERKS[r.perk];
      html += `<div class="m ${r.downed ? 'down' : ''}"><span style="color:${perk?.color}">${perk?.icon || ''}</span> ${r.name} ${r.downed ? '— ABATIDO' : !r.alive ? '— muerto' : ''}<div class="bar"><i style="width:${clamp(r.hp / r.maxHp, 0, 1) * 100}%"></i></div></div>`;
      if (r.alive || r.downed) {
        const s = this._project(r.pos, 2.15);
        if (s) tags += `<div class="tag" style="left:${s[0]}px;top:${s[1]}px;color:${r.downed ? 'var(--bad)' : perk?.color}">${r.downed ? '✚ ' : ''}${r.name}<div class="bar"><i style="width:${clamp(r.hp / r.maxHp, 0, 1) * 100}%"></i></div></div>`;
      }
    }
    this.el.team.innerHTML = html;
    this.el.tags.innerHTML = tags;
  }

  _scoreboard(g) {
    const rows = [];
    const s = g.local.stats;
    rows.push(`<tr><td><b style="color:${PERKS[g.perkId].color}">${PERKS[g.perkId].icon}</b> ${g.local.name} (tú)</td><td>${PERKS[g.perkId].name} ${g.perkLevel}</td><td>${s.kills}</td><td>${s.headshots}</td><td>${fmtNum(s.damage)}</td><td>${Math.round(s.healed)}</td><td>${fmtNum(g.local.credits)} ₵</td></tr>`);
    for (const r of g.remote.values()) rows.push(`<tr><td><b style="color:${PERKS[r.perk]?.color}">${PERKS[r.perk]?.icon}</b> ${r.name}</td><td>${PERKS[r.perk]?.name}</td><td>${r.kills ?? 0}</td><td>${r.headshots ?? 0}</td><td>${fmtNum(r.damage || 0)}</td><td>${Math.round(r.healed || 0)}</td><td>${fmtNum(r.credits || 0)} ₵</td></tr>`);
    const w = g.waves;
    this.el.score.innerHTML = `<div class="row"><b style="font-size:20px">${g.world.def.name}</b><span class="spacer"></span><span class="muted">${g.diff.name} · ${w.length.name} · Oleada ${w.wave}</span></div>
      <table><tr><th>JUGADOR</th><th>CLASE</th><th>BAJAS</th><th>CABEZAS</th><th>DAÑO</th><th>CURADO</th><th>CRÉDITOS</th></tr>${rows.join('')}</table>
      <div class="muted" style="margin-top:8px;font-size:14px">Precisión: ${s.shots ? Math.round(s.hits / s.shots * 100) : 0}% · Objetivos: ${s.objectives} · Soldado: ${fmtNum(s.welded)}</div>`;
  }
}
