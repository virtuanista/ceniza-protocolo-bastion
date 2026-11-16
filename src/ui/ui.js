// Interfaz de menús: inicio, partida individual, cooperativo y lobby, clases y talentos,
// apariencia, estadísticas/desafíos, opciones (con reasignación de teclas), bestiario,
// comerciante, pausa y resultados. Delegación de eventos mediante data-act.
import { PERKS, PERK_LIST, TALENT_LEVELS, xpForLevel, MAX_LEVEL } from '../game/perks.js';
import { MAP_LIST } from '../world/maps.js';
import { DIFFICULTIES, LENGTHS, ENEMIES } from '../ai/enemyDefs.js';
import { WEAPONS, WEAPON_LIST, GRENADES, upgradeMult, MAX_UPGRADE } from '../weapons/weaponDefs.js';
import { saveSys, COSMETICS, CHALLENGES } from '../save/save.js';
import { audio } from '../audio/audio.js';
import { bus } from '../core/events.js';
import { fmtNum, fmtTime } from '../core/utils.js';
import { PHASE } from '../game/waves.js';
import { DEFAULT_BINDS } from '../core/input.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BIND_NAMES = {
  forward: 'Avanzar', back: 'Retroceder', left: 'Izquierda', right: 'Derecha', jump: 'Saltar', sprint: 'Esprintar', crouch: 'Agacharse', crouchAlt: 'Agacharse (alt.)',
  reload: 'Recargar', interact: 'Interactuar', heal: 'Curación rápida', grenade: 'Granada', melee: 'Golpe rápido', flashlight: 'Linterna', welder: 'Soldador',
  dropCash: 'Soltar créditos', scoreboard: 'Marcador', slot1: 'Cuerpo a cuerpo', slot2: 'Pistolas', slot3: 'Armas principales', slot4: 'Equipo', slot5: 'Ranura 5', lastWeapon: 'Arma anterior', pause: 'Pausa', chat: 'Chat',
};
const keyName = (c) => (c || '').replace('Key', '').replace('Digit', '').replace('Left', ' izq.').replace('Right', ' der.').replace('Space', 'Espacio').replace('Escape', 'Esc').replace('Control', 'Ctrl');

export class UI {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.screen = null;
    this.blocking = false;
    this.traderTab = 'perk';
    this.perkTab = saveSys.data.selected.perk;
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      audio.play('ui_click', { volume: 0.4, bus: 'ui' });
      this.handle(t.dataset.act, t.dataset, t);
    });
    root.addEventListener('mouseover', (e) => { if (e.target.closest('.btn,.card,.talent,.tab')) audio.play('ui_hover', { volume: 0.15, bus: 'ui', cooldown: 0.04 }); });
    bus.on('credits', () => { if (this.screen === 'trader') this.renderTrader(); });
    bus.on('inventory', () => { if (this.screen === 'trader') this.renderTrader(); });
  }

  set(html, cls = '') {
    this.root.innerHTML = `<div class="screen ${cls}">${html}</div>`;
  }
  clear() { this.root.innerHTML = ''; this.screen = null; this.blocking = false; }

  // ------------------------------------------------------------------ inicio
  showMain() {
    this.screen = 'main'; this.blocking = true;
    const s = saveSys.data;
    const perk = PERKS[s.selected.perk];
    this.set(`<div class="menu-main">
      <div>
        <h1 class="logo">CENIZA<br><span>PROTOCOLO</span><br>BASTIÓN</h1>
        <div class="sublogo">Supervivencia cooperativa</div>
        <div class="menu-list">
          <button class="btn primary" data-act="solo">Jugar en solitario</button>
          <button class="btn" data-act="coop">Cooperativo en línea</button>
          <button class="btn" data-act="perks">Clases y talentos</button>
          <button class="btn" data-act="cosmetics">Apariencia</button>
          <button class="btn" data-act="stats">Estadísticas y desafíos</button>
          <button class="btn" data-act="codex">Bestiario y arsenal</button>
          <button class="btn" data-act="settings">Opciones</button>
          <button class="btn ghost" data-act="howto">Cómo se juega</button>
        </div>
      </div>
      <div style="align-self:end">
        <div class="section" style="max-width:640px;margin-left:auto">
          <h4>Expediente</h4>
          <p class="lore">Año 2061. El Consorcio Aurel liberó la <b>Semilla Ceniza</b> en sus laboratorios de la costa. En 72 horas los muertos se levantaron convertidos en <b>engendros</b>. Tú eres un Limpiador de la <b>Brigada Bastión</b>: resiste oleada tras oleada, suelda las puertas, compra equipo a la unidad de suministro <b>LONJA</b> entre asaltos y abate al <b>Primogénito</b>, el primer huésped de la plaga.</p>
          <div class="row" style="margin-top:10px"><span class="pill on" style="color:${perk.color}">${perk.icon} ${perk.name} · Nivel ${s.perks[perk.id].level}</span><span class="pill">${esc(s.profile.name)}</span><span class="pill">${s.stats.kills} bajas</span><span class="pill">${s.stats.wins} victorias</span></div>
        </div>
        <div class="footer-note" style="text-align:right">Todo el arte, sonido y música se genera proceduralmente en tu navegador. Three.js · WebAudio · WebSocket.</div>
      </div>
    </div>`);
  }

  // ------------------------------------------------------------------ selección
  perkCards(selected, act = 'pickPerk') {
    return PERK_LIST.map((p) => {
      const ps = saveSys.data.perks[p.id];
      return `<div class="card ${selected === p.id ? 'sel' : ''}" data-act="${act}" data-id="${p.id}">
        <div class="icon" style="color:${p.color}">${p.icon}</div><div class="lvl">Nv ${ps.level}</div>
        <h3>${p.name}</h3><p>${p.role}</p></div>`;
    }).join('');
  }

  showSolo() {
    this.screen = 'solo'; this.blocking = true;
    const sel = saveSys.data.selected;
    const opt = (obj, cur, act) => Object.entries(obj).map(([id, d]) => `<div class="card ${cur === id ? 'sel' : ''}" data-act="${act}" data-id="${id}"><h3>${d.name}</h3><p>${d.desc || ''}</p></div>`).join('');
    const diffs = Object.fromEntries(Object.entries(DIFFICULTIES).map(([k, d]) => [k, { name: d.name, desc: `Vida ×${d.hp} · Daño ×${d.dmg} · XP ×${d.xp}` }]));
    this.set(`<div class="wrap">
      <div class="hdr"><h2>Partida en solitario</h2><div class="row"><button class="btn ghost small" data-act="main">Volver</button><button class="btn primary" data-act="startSolo">Desplegar ▶</button></div></div>
      <div class="section"><h4>Clase</h4><div class="grid g7">${this.perkCards(sel.perk)}</div><p class="muted" style="margin:10px 0 0">${PERKS[sel.perk].desc}</p></div>
      <div class="section"><h4>Mapa</h4><div class="grid g2">${MAP_LIST.map((m) => `<div class="card ${sel.map === m.id ? 'sel' : ''}" data-act="pickMap" data-id="${m.id}"><h3>${m.name}</h3><p>${m.desc}</p></div>`).join('')}</div></div>
      <div class="grid g2">
        <div class="section"><h4>Dificultad</h4><div class="grid g2">${opt(diffs, sel.difficulty, 'pickDiff')}</div></div>
        <div class="section"><h4>Duración</h4><div class="grid g2">${opt(LENGTHS, sel.length, 'pickLen')}</div></div>
      </div>
    </div>`);
  }

  // ------------------------------------------------------------------ cooperativo
  showCoop(msg = '') {
    this.screen = 'coop'; this.blocking = true;
    const def = this.app.net.defaultUrl();
    this.set(`<div class="wrap" style="max-width:820px">
      <div class="hdr"><h2>Cooperativo <small>hasta 6 jugadores</small></h2><button class="btn ghost small" data-act="main">Volver</button></div>
      <div class="section"><h4>Identidad</h4><div class="row"><span>Nombre</span><input class="input" id="c-name" maxlength="18" value="${esc(saveSys.data.profile.name)}"></div></div>
      <div class="section"><h4>Servidor</h4>
        <div class="row"><input class="input" id="c-url" style="flex:1" value="${esc(localStorage.getItem('ceniza_server') || def)}"></div>
        <p class="muted">Ejecuta <span class="kbd">npm run server</span> en el equipo anfitrión (puerto 8787). Los demás usan <b>ws://IP-del-anfitrión:8787</b>.</p>
        ${location.protocol === 'https:' ? '<p class="muted" style="color:#ffb35c">Estás jugando la versión web (HTTPS). El navegador no permite conectar desde aquí con un servidor <b>ws://</b>: para el cooperativo, descarga el proyecto y ejecuta <span class="kbd">npm start</span>.</p>' : ''}
      </div>
      <div class="grid g2">
        <div class="section"><h4>Crear sala</h4><p class="muted">Serás el anfitrión: la simulación de la horda se ejecuta en tu equipo.</p><button class="btn primary" data-act="createRoom">Crear sala</button></div>
        <div class="section"><h4>Unirse</h4><div class="row"><input class="input" id="c-code" maxlength="5" placeholder="CÓDIGO" style="width:140px;text-transform:uppercase"><button class="btn" data-act="joinRoom">Unirse</button></div><div id="c-rooms" class="muted" style="margin-top:10px"></div><button class="btn small ghost" data-act="listRooms" style="margin-top:6px">Ver salas abiertas</button></div>
      </div>
      <div class="muted" id="c-msg">${esc(msg)}</div>
    </div>`);
  }

  showLobby() {
    this.screen = 'lobby'; this.blocking = true;
    const net = this.app.net;
    const L = net.lobby;
    if (!L) return this.showCoop();
    const me = L.players.find((p) => p.id === net.id);
    const isHost = net.isHost;
    const cfg = L.cfg;
    const players = L.players.map((p) => {
      const perk = PERKS[p.perk];
      return `<tr><td>${p.id === L.host ? '★ ' : ''}${esc(p.name)}${p.id === net.id ? ' (tú)' : ''}</td><td style="color:${perk?.color}">${perk?.icon} ${perk?.name} ${p.level ?? ''}</td><td>${p.ready ? '<span style="color:var(--good)">LISTO</span>' : '<span class="muted">esperando</span>'}</td></tr>`;
    }).join('');
    const sel = (obj, cur, key) => `<select ${isHost ? '' : 'disabled'} data-cfg="${key}">${Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v.name}</option>`).join('')}</select>`;
    const maps = Object.fromEntries(MAP_LIST.map((m) => [m.id, m]));
    this.set(`<div class="wrap">
      <div class="hdr"><h2>Sala <span style="color:var(--accent)">${L.code}</span> <small>${L.players.length}/6 jugadores</small></h2><div class="row"><button class="btn ghost small" data-act="leaveRoom">Salir</button>${isHost ? `<button class="btn primary" data-act="lobbyStart" ${L.players.every((p) => p.ready) ? '' : 'disabled'}>Iniciar partida ▶</button>` : ''}</div></div>
      <div class="grid g2">
        <div>
          <div class="section"><h4>Jugadores</h4><table class="stats">${players}</table>
            <div class="row" style="margin-top:12px"><button class="btn ${me?.ready ? 'ghost' : 'primary'}" data-act="lobbyReady">${me?.ready ? 'Cancelar listo' : 'Estoy listo'}</button></div></div>
          <div class="section"><h4>Configuración ${isHost ? '' : '<span class="muted">(la elige el anfitrión)</span>'}</h4>
            <div class="grid g3">${sel(maps, cfg.map, 'map')}${sel(DIFFICULTIES, cfg.difficulty, 'difficulty')}${sel(LENGTHS, cfg.length, 'length')}</div>
            <p class="muted">La vida y el número de engendros escalan con el número de jugadores. Roles complementarios: cura, suelda, reabastece, controla.</p></div>
        </div>
        <div>
          <div class="section"><h4>Tu clase</h4><div class="grid g3">${this.perkCards(me?.perk, 'lobbyPerk')}</div></div>
          <div class="section"><h4>Chat</h4><div class="chat" id="l-chat">${(net.chatLog || []).map((m) => `<div><b>${esc(m.n)}:</b> ${esc(m.t)}</div>`).join('')}</div><div class="row" style="margin-top:6px"><input class="input" id="l-msg" style="flex:1" maxlength="120" placeholder="Escribe y pulsa Enter"></div></div>
        </div>
      </div>
    </div>`);
    const chat = this.root.querySelector('#l-chat'); if (chat) chat.scrollTop = chat.scrollHeight;
    for (const s of this.root.querySelectorAll('select[data-cfg]')) s.addEventListener('change', () => net.setConfig({ [s.dataset.cfg]: s.value }));
    const msg = this.root.querySelector('#l-msg');
    if (msg) {
      msg.addEventListener('focus', () => (this.app.input.textFocus = true));
      msg.addEventListener('blur', () => (this.app.input.textFocus = false));
      msg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && msg.value.trim()) { net.chat(msg.value.trim()); msg.value = ''; } });
    }
  }

  // ------------------------------------------------------------------ clases y talentos
  showPerks() {
    this.screen = 'perks'; this.blocking = true;
    const id = this.perkTab;
    const p = PERKS[id];
    const ps = saveSys.data.perks[id];
    const need = ps.level >= MAX_LEVEL ? 1 : xpForLevel(ps.level);
    const passive = p.passive(ps.level);
    const passTxt = Object.entries(passive).filter(([, v]) => v !== 1 && v !== 0 && v !== false).map(([k, v]) => `<span class="pill">${modLabel(k, v)}</span>`).join(' ');
    const tiers = TALENT_LEVELS.map((lv, tier) => {
      const unlocked = ps.level >= lv;
      const choice = ps.talents[tier] ?? 0;
      return `<div class="talent-tier"><div class="lv">${lv}</div>${p.talents[tier].map((t, i) => `<div class="talent ${unlocked ? '' : 'lock'} ${unlocked && choice === i ? 'sel' : ''}" data-act="talent" data-tier="${tier}" data-i="${i}"><b>${t.name}</b><span>${t.desc}</span></div>`).join('')}</div>`;
    }).join('');
    this.set(`<div class="wrap">
      <div class="hdr"><h2>Clases y talentos</h2><button class="btn ghost small" data-act="main">Volver</button></div>
      <div class="tabs">${PERK_LIST.map((q) => `<div class="tab ${q.id === id ? 'on' : ''}" data-act="perkTab" data-id="${q.id}" style="${q.id === id ? `color:${q.color}` : ''}">${q.icon} ${q.name} ${saveSys.data.perks[q.id].level}</div>`).join('')}</div>
      <div class="grid g2">
        <div>
          <div class="section"><h4 style="color:${p.color}">${p.icon} ${p.name} — Nivel ${ps.level}/${MAX_LEVEL}</h4>
            <p>${p.desc}</p>
            <div class="bar" style="margin:10px 0 4px"><i style="width:${ps.level >= MAX_LEVEL ? 100 : ps.xp / need * 100}%"></i></div>
            <div class="muted">${ps.level >= MAX_LEVEL ? 'Nivel máximo' : `${fmtNum(ps.xp)} / ${fmtNum(need)} XP`} · Se gana XP con: <b>${p.xpSource}</b></div>
            <h4 style="margin-top:14px">Pasivas actuales</h4><div class="row">${passTxt || '<span class="muted">Sube de nivel para potenciar tus pasivas.</span>'}</div>
            <h4 style="margin-top:14px">Granada</h4><div>${GRENADES[p.grenade].name}</div>
          </div>
          <div class="section"><h4>Arsenal de clase</h4>${p.weapons.map((w) => weaponRow(WEAPONS[w])).join('')}</div>
          <button class="btn" data-act="selectPerk" data-id="${id}">${saveSys.data.selected.perk === id ? '✔ Clase seleccionada' : 'Seleccionar como clase activa'}</button>
        </div>
        <div class="section"><h4>Talentos (uno por nivel)</h4>${tiers}<p class="muted">Puedes cambiar los talentos en cualquier momento fuera de partida.</p></div>
      </div>
    </div>`);
  }

  showCosmetics() {
    this.screen = 'cosmetics'; this.blocking = true;
    const u = saveSys.data.unlocks, sel = saveSys.data.selected;
    const reqFor = (kind, id) => { const c = CHALLENGES.find((x) => x.reward[kind] === id); return c ? `Desafío: ${c.name}` : ''; };
    this.set(`<div class="wrap">
      <div class="hdr"><h2>Apariencia <small>puramente cosmética</small></h2><button class="btn ghost small" data-act="main">Volver</button></div>
      <div class="section"><h4>Uniforme</h4><div class="grid g4">${COSMETICS.outfits.map((o) => { const un = u.outfits.includes(o.id); return `<div class="card ${sel.outfit === o.id ? 'sel' : ''} ${un ? '' : 'locked'}" data-act="${un ? 'outfit' : ''}" data-id="${o.id}"><h3><span class="swatch" style="background:#${o.body.toString(16).padStart(6, '0')}"></span>${o.name}</h3><p>${un ? 'Desbloqueado' : '🔒 ' + reqFor('outfit', o.id)}</p></div>`; }).join('')}</div></div>
      <div class="section"><h4>Acabado de armas</h4><div class="grid g4">${COSMETICS.finishes.map((f) => { const un = u.finishes.includes(f.id); return `<div class="card ${sel.finish === f.id ? 'sel' : ''} ${un ? '' : 'locked'}" data-act="${un ? 'finish' : ''}" data-id="${f.id}"><h3><span class="swatch" style="background:${f.color ? '#' + f.color.toString(16).padStart(6, '0') : 'linear-gradient(45deg,#333,#777)'}"></span>${f.name}</h3><p>${un ? 'Desbloqueado' : '🔒 ' + reqFor('finish', f.id)}</p></div>`; }).join('')}</div></div>
      <div class="section"><h4>Nombre de perfil</h4><div class="row"><input class="input" id="p-name" maxlength="18" value="${esc(saveSys.data.profile.name)}"><button class="btn small" data-act="saveName">Guardar</button></div></div>
    </div>`);
  }

  showStats() {
    this.screen = 'stats'; this.blocking = true;
    const st = saveSys.data.stats;
    const rows = [['Partidas', st.games], ['Victorias', st.wins], ['Bajas', st.kills], ['Disparos a la cabeza mortales', st.headshots], ['Muertes', st.deaths], ['Daño infligido', fmtNum(st.damage)], ['Vida curada', fmtNum(st.healed)], ['Puntos soldados', fmtNum(st.welded)], ['Créditos ganados', fmtNum(st.creditsEarned)], ['Objetivos completados', st.objectives], ['Jefes derrotados', st.bossKills], ['Tanques abatidos', st.bigKills], ['Oleadas superadas', st.wavesSurvived], ['Mejor oleada interminable', st.bestEndless], ['Tiempo Muerto activado', st.zedTimes], ['Tiempo jugado', fmtTime(st.playtime)]];
    const byType = Object.entries(st.killsByType || {}).map(([k, v]) => [ENEMIES[k]?.name || k, v]);
    const recs = Object.entries(saveSys.data.records).map(([k, v]) => {
      const [kind, map, diff, len] = k.split('|');
      const mn = MAP_LIST.find((m) => m.id === map)?.name || map;
      if (kind === 'bestWave') return [`Mejor oleada · ${mn} · ${DIFFICULTIES[diff]?.name} · ${LENGTHS[len]?.name}`, v];
      if (kind === 'win') return [`Victoria más rápida · ${mn} · ${DIFFICULTIES[diff]?.name} · ${LENGTHS[len]?.name}`, fmtTime(v)];
      if (kind === 'mostKills') return ['Más bajas en una partida', v];
      return [k, v];
    });
    this.set(`<div class="wrap">
      <div class="hdr"><h2>Estadísticas y desafíos</h2><button class="btn ghost small" data-act="main">Volver</button></div>
      <div class="grid g3">
        <div class="section"><h4>Carrera</h4><table class="stats">${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table></div>
        <div>
          <div class="section"><h4>Bajas por tipo</h4><table class="stats">${byType.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('') || '<tr><td class="muted">Sin datos todavía</td><td></td></tr>'}</table></div>
          <div class="section"><h4>Récords</h4><table class="stats">${recs.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('') || '<tr><td class="muted">Juega para establecer récords</td><td></td></tr>'}</table></div>
        </div>
        <div class="section"><h4>Desafíos</h4>${CHALLENGES.map((c) => { const v = Math.min(c.goal, st[c.stat] || 0); const done = !!saveSys.data.challenges[c.id]; const rw = c.reward.outfit ? 'Uniforme ' + COSMETICS.outfits.find((o) => o.id === c.reward.outfit)?.name : c.reward.finish ? 'Acabado ' + COSMETICS.finishes.find((o) => o.id === c.reward.finish)?.name : `${c.reward.xp} XP`; return `<div style="margin-bottom:10px"><div class="row"><b style="${done ? 'color:var(--good)' : ''}">${done ? '✔ ' : ''}${c.name}</b><span class="spacer"></span><span class="muted">${rw}</span></div><div class="muted" style="font-size:14px">${c.desc}</div><div class="bar" style="margin-top:4px"><i style="width:${v / c.goal * 100}%"></i></div></div>`; }).join('')}</div>
      </div>
      <button class="btn danger small" data-act="resetSave">Borrar progreso</button>
    </div>`);
  }

  showCodex() {
    this.screen = 'codex'; this.blocking = true;
    const enemies = Object.values(ENEMIES).map((e) => `<div class="card" style="cursor:default"><h3>${e.name} <span class="pill">${e.threat}</span></h3><p>${e.desc}</p><p>PV base ${e.hp} · Daño ${e.dmg} · ${e.credits} ₵</p></div>`).join('');
    this.set(`<div class="wrap">
      <div class="hdr"><h2>Bestiario y arsenal</h2><button class="btn ghost small" data-act="main">Volver</button></div>
      <div class="section"><h4>Bestiario del Brote</h4><div class="grid g3">${enemies}</div></div>
      <div class="section"><h4>Arsenal</h4><div class="grid g2">${WEAPON_LIST.filter((w) => w.price > 0 || w.id === 'p9').map((w) => weaponRow(w)).join('')}</div></div>
    </div>`);
  }

  showHowto() {
    this.screen = 'howto'; this.blocking = true;
    const b = saveSys.data.settings.binds;
    const k = (a) => `<span class="kbd">${keyName(b[a])}</span>`;
    this.set(`<div class="wrap" style="max-width:1000px">
      <div class="hdr"><h2>Cómo se juega</h2><button class="btn ghost small" data-act="main">Volver</button></div>
      <div class="grid g2">
        <div class="section"><h4>Controles</h4><table class="stats">
          <tr><td>Moverse</td><td>${k('forward')}${k('left')}${k('back')}${k('right')}</td></tr>
          <tr><td>Disparar / Apuntar</td><td><span class="kbd">Clic izq.</span> <span class="kbd">Clic der.</span></td></tr>
          <tr><td>Recargar</td><td>${k('reload')}</td></tr><tr><td>Esprintar / Saltar / Agacharse</td><td>${k('sprint')} ${k('jump')} ${k('crouch')}</td></tr>
          <tr><td>Interactuar (puertas, comerciante, reanimar)</td><td>${k('interact')}</td></tr><tr><td>Curación rápida</td><td>${k('heal')}</td></tr>
          <tr><td>Granada / Golpe rápido</td><td>${k('grenade')} ${k('melee')}</td></tr><tr><td>Soldador</td><td>${k('welder')}</td></tr>
          <tr><td>Armas</td><td>${k('slot1')}–${k('slot4')} · Rueda · ${k('lastWeapon')}</td></tr><tr><td>Linterna</td><td>${k('flashlight')}</td></tr>
          <tr><td>Listo (saltar la espera)</td><td><span class="kbd">L</span></td></tr><tr><td>Marcador</td><td>${k('scoreboard')}</td></tr>
          <tr><td>Soltar créditos (coop)</td><td>${k('dropCash')}</td></tr><tr><td>Pausa</td><td><span class="kbd">Esc</span></td></tr>
        </table></div>
        <div class="section"><h4>Claves tácticas</h4><ul class="lore">
          <li><b>Cabezas</b>: decapitar mata al instante a casi todo y es la forma de evitar que la <b>Vesícula</b> reviente.</li>
          <li><b>Suelda</b> puertas para canalizar a la horda por cuellos de botella. Los <b>Aulladores</b> destrozan soldaduras con su grito.</li>
          <li>El <b>Coloso</b> entra en furia si le haces mucho daño de golpe: dale a la cabeza con potencia o aléjate.</li>
          <li>Entre oleadas, la flecha verde lleva a la cápsula <b>LONJA</b>. Compra armas de tu clase: reciben sus bonificaciones.</li>
          <li>Controla el <b>peso</b>: cada arma ocupa capacidad. Las mejoras aumentan el daño y a veces el peso.</li>
          <li>El <b>Tiempo Muerto</b> ralentiza el mundo tras bajas espectaculares. Algunas clases disparan a velocidad completa durante él.</li>
          <li>Los <b>objetivos opcionales</b> (defender, reparar, transportar, resistir) dan muchos créditos y XP.</li>
          <li>El jefe telegrafía cada ataque: <b>salta</b> el golpe sísmico, <b>apártate</b> de la embestida y dispara al <b>corazón expuesto</b>.</li>
        </ul></div>
      </div>
    </div>`);
  }

  // ------------------------------------------------------------------ opciones
  showSettings(back = 'main') {
    this.screen = 'settings'; this.blocking = true;
    this.settingsBack = back;
    const s = saveSys.data.settings;
    const range = (key, label, min, max, step, fmt = (v) => v) => `<label class="set"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}" data-set="${key}"><span id="sv-${key}">${fmt(s[key])}</span></label>`;
    const check = (key, label) => `<label class="set"><span>${label}</span><input type="checkbox" ${s[key] ? 'checked' : ''} data-set="${key}"><span></span></label>`;
    this.set(`<div class="wrap" style="max-width:1000px">
      <div class="hdr"><h2>Opciones</h2><button class="btn ghost small" data-act="settingsBack">Volver</button></div>
      <div class="grid g2">
        <div>
          <div class="section"><h4>Control</h4>${range('sensitivity', 'Sensibilidad', 0.1, 3, 0.05, (v) => (+v).toFixed(2))}${check('invertY', 'Invertir eje Y')}${range('fov', 'Campo de visión', 65, 110, 1)}${check('crosshair', 'Mostrar retícula')}</div>
          <div class="section"><h4>Audio</h4>${range('master', 'Volumen general', 0, 1, 0.01, (v) => Math.round(v * 100) + '%')}${range('sfx', 'Efectos', 0, 1, 0.01, (v) => Math.round(v * 100) + '%')}${range('music', 'Música', 0, 1, 0.01, (v) => Math.round(v * 100) + '%')}</div>
          <div class="section"><h4>Gráficos</h4>
            <label class="set"><span>Calidad</span><select data-set="quality"><option value="low" ${s.quality === 'low' ? 'selected' : ''}>Baja</option><option value="medium" ${s.quality === 'medium' ? 'selected' : ''}>Media</option><option value="high" ${s.quality === 'high' ? 'selected' : ''}>Alta (sombras)</option></select><span></span></label>
            ${range('renderScale', 'Escala de resolución', 0.5, 1, 0.05, (v) => Math.round(v * 100) + '%')}${check('showFps', 'Mostrar FPS')}
            <p class="muted">La calidad se aplica al iniciar la siguiente partida.</p></div>
        </div>
        <div class="section"><h4>Teclas <span class="muted">(clic para reasignar)</span></h4>
          <table class="stats">${Object.keys(DEFAULT_BINDS).map((a) => `<tr><td>${BIND_NAMES[a] || a}</td><td><button class="btn small ghost" data-act="rebind" data-a="${a}">${keyName(s.binds[a])}</button></td></tr>`).join('')}</table>
          <button class="btn small" data-act="resetBinds" style="margin-top:8px">Restablecer teclas</button></div>
      </div>
    </div>`);
    for (const el of this.root.querySelectorAll('[data-set]')) {
      el.addEventListener('input', () => {
        const k = el.dataset.set;
        const v = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : parseFloat(el.value);
        s[k] = v;
        const lab = this.root.querySelector('#sv-' + k);
        if (lab) lab.textContent = k === 'sensitivity' ? v.toFixed(2) : ['master', 'sfx', 'music', 'renderScale'].includes(k) ? Math.round(v * 100) + '%' : v;
        this.app.applySettings();
      });
    }
  }

  // ------------------------------------------------------------------ partida: pausa, comerciante, resultados
  showPause(game) {
    this.screen = 'pause'; this.blocking = true;
    game.paused = !game.net;
    this.set(`<div class="wrap" style="max-width:520px;margin-top:12vh">
      <h2 class="logo" style="font-size:54px">PAUSA</h2>
      <p class="muted">${game.world.def.name} · ${game.diff.name} · Oleada ${game.waves.wave}${game.net ? ' · El juego sigue en marcha (cooperativo)' : ''}</p>
      <div class="menu-list">
        <button class="btn primary" data-act="resume">Continuar</button>
        <button class="btn" data-act="pauseSettings">Opciones</button>
        <button class="btn" data-act="pauseHowto">Controles</button>
        <button class="btn danger" data-act="abandon">Abandonar partida</button>
      </div></div>`, 'overlay');
  }

  openTrader(game) {
    this.game = game;
    this.screen = 'trader'; this.blocking = true;
    this.app.input.unlock();
    audio.play('trader_open', { volume: 0.5, bus: 'ui' });
    this.renderTrader();
    this._traderTimer = setInterval(() => {
      if (this.screen !== 'trader') { clearInterval(this._traderTimer); return; }
      const ph = game.waves.phase;
      if (ph !== PHASE.TRADER && ph !== PHASE.PREP) { this.closeOverlay(game); bus.emit('toast', { text: '¡La oleada ha comenzado!', kind: 'bad' }); return; }
      const t = this.root.querySelector('#t-timer'); if (t) t.textContent = fmtTime(game.waves.timer);
    }, 250);
  }

  renderTrader() {
    const g = this.game; if (!g) return;
    const w = g.weapons, tr = g.trader, p = g.local;
    const tab = this.traderTab;
    const perk = PERKS[g.perkId];
    let items;
    if (tab === 'perk') items = perk.weapons.map((id) => WEAPONS[id]);
    else if (tab === 'all') items = tr.catalog();
    else items = tr.catalog().filter((d) => d.perk === tab);
    const owned = w.inv;
    const list = items.map((d) => {
      const has = w.has(d.id);
      const overweight = w.totalWeight() + d.weight > w.carryCap();
      const cant = p.credits < d.price;
      return `<div class="witem ${d.perk === g.perkId ? 'perk' : ''} ${has ? 'owned' : ''}">
        <div><div class="nm">${d.name}</div><div class="meta">${PERKS[d.perk]?.icon || ''} ${PERKS[d.perk]?.name || 'General'} · Nivel ${d.tier} · Peso ${d.weight} · ${statSummary(d)}</div></div>
        <div style="text-align:right"><div class="price">${d.price} ₵</div>${has ? '<span class="muted">En posesión</span>' : `<button class="btn small ${cant || overweight ? 'ghost' : 'primary'}" data-act="buy" data-id="${d.id}" ${cant || overweight ? 'disabled' : ''}>${overweight ? 'Sobrepeso' : cant ? 'Sin fondos' : 'Comprar'}</button>`}</div>
      </div>`;
    }).join('');
    const inv = owned.map((inst) => {
      const d = inst.def;
      const ammo = d.mag ? tr.ammoCost(inst, true) : null;
      const magC = d.mag ? tr.ammoCost(inst, false) : null;
      const up = tr.upgradeInfo(inst);
      return `<div class="witem ${d.perk === g.perkId ? 'perk' : ''}">
        <div><div class="nm">${d.name}${inst.upgrade ? ` <span style="color:var(--accent2)">+${inst.upgrade}</span>` : ''}</div>
          <div class="meta">${d.mag ? `Munición ${inst.mag + inst.reserve}/${inst.stats.maxAmmo}` : 'Equipo'} · Daño ${Math.round(inst.stats.dmg || inst.stats.proj?.dmg || 0)}${d.weight ? ' · Peso ' + d.weight : ''}</div></div>
        <div class="row" style="justify-content:flex-end">
          ${d.mag ? `<button class="btn small" data-act="ammo1" data-id="${d.id}" ${magC.amount ? '' : 'disabled'}>Cargador ${magC.cost}₵</button><button class="btn small" data-act="ammoFull" data-id="${d.id}" ${ammo.amount ? '' : 'disabled'}>Llenar ${ammo.cost}₵</button>` : ''}
          ${!d.unsellable && up ? `<button class="btn small" data-act="upgrade" data-id="${d.id}" ${p.credits >= up.cost ? '' : 'disabled'}>Mejorar +${up.next} ${up.cost}₵</button>` : ''}
          ${!d.unsellable ? `<button class="btn small ghost" data-act="sell" data-id="${d.id}">Vender ${tr.sellValue(inst)}₵</button>` : ''}
        </div></div>`;
    }).join('');
    const wt = w.totalWeight(), cap = w.carryCap();
    const ready = g.waves.ready.has(p.id);
    this.set(`<div class="wrap">
      <div class="hdr"><h2>LONJA <small>Unidad de suministro · cierra en <b id="t-timer">${fmtTime(g.waves.timer)}</b></small></h2>
        <div class="row"><span class="credits-big">₵ ${fmtNum(p.credits)}</span><button class="btn ${ready ? 'ghost' : ''}" data-act="ready">${ready ? '✔ Listo' : 'Estoy listo'}</button><button class="btn primary" data-act="closeTrader">Cerrar [Esc]</button></div></div>
      <div class="trader">
        <div>
          <div class="tabs"><div class="tab ${tab === 'perk' ? 'on' : ''}" data-act="ttab" data-id="perk">${perk.icon} Mi clase</div>${PERK_LIST.filter((q) => q.id !== g.perkId).map((q) => `<div class="tab ${tab === q.id ? 'on' : ''}" data-act="ttab" data-id="${q.id}">${q.icon} ${q.name}</div>`).join('')}<div class="tab ${tab === 'all' ? 'on' : ''}" data-act="ttab" data-id="all">Todo</div></div>
          <div class="list">${list}</div>
        </div>
        <div>
          <div class="section"><h4>Supervivencia</h4>
            <div class="witem"><div><div class="nm">Blindaje</div><div class="meta">${Math.round(p.armor)}/${p.maxArmor} · absorbe el 75% del daño</div></div><button class="btn small" data-act="armor" ${p.armor >= p.maxArmor ? 'disabled' : ''}>Reponer ${tr.armorCost()}₵</button></div>
            <div class="witem"><div><div class="nm">${w.grenadeDef().name}</div><div class="meta">${w.grenades}/${w.grenadeMax()}</div></div><button class="btn small" data-act="grenade" ${w.grenades >= w.grenadeMax() ? 'disabled' : ''}>Comprar 40₵</button></div>
            <button class="btn" style="width:100%;margin-top:6px" data-act="fillAll">Reponer toda la munición</button>
          </div>
          <div class="section"><h4>Mi equipo · Peso ${wt}/${cap}</h4><div class="bar" style="margin-bottom:10px"><i style="width:${wt / cap * 100}%"></i></div><div class="list" style="max-height:calc(100vh - 470px)">${inv}</div></div>
        </div>
      </div></div>`, 'overlay');
  }

  closeOverlay(game) {
    if (this._traderTimer) clearInterval(this._traderTimer);
    this.clear();
    if (game) { game.paused = false; this.app.input.lock(); }
  }

  showResults(game, win, challenges) {
    this.screen = 'results'; this.blocking = true;
    this.app.input.unlock();
    const s = game.local.stats;
    const xp = Object.entries(game.sessionXp).map(([k, v]) => `<span class="pill on" style="color:${PERKS[k].color}">${PERKS[k].icon} ${PERKS[k].name} +${fmtNum(v)} XP</span>`).join(' ');
    const lv = game.levelUps.map((l) => `<span class="pill on">${PERKS[l.perk].name} → nivel ${l.level}</span>`).join(' ');
    const ch = challenges.map((c) => `<span class="pill on">✔ ${c.name}</span>`).join(' ');
    const dur = (performance.now() - game.startTime) / 1000;
    this.set(`<div class="wrap" style="max-width:1000px;margin-top:6vh">
      <h1 class="logo" style="font-size:72px;color:${win ? 'var(--good)' : 'var(--bad)'}">${win ? 'VICTORIA' : 'DERROTA'}</h1>
      <p class="sublogo">${game.world.def.name} · ${game.diff.name} · ${game.waves.length.name} · Oleada ${game.waves.wave}</p>
      <div class="resgrid" style="margin:22px 0">
        ${[['Bajas', s.kills], ['Disparos a la cabeza', s.headshots], ['Daño', fmtNum(s.damage)], ['Precisión', (s.shots ? Math.round(s.hits / s.shots * 100) : 0) + '%'], ['Curado', fmtNum(s.healed)], ['Soldado', fmtNum(s.welded)], ['Créditos ganados', fmtNum(s.creditsEarned)], ['Objetivos', s.objectives], ['Tanques', s.largeKills], ['Duración', fmtTime(dur)]].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('')}
      </div>
      <div class="section"><h4>Progresión</h4><div class="row">${xp || '<span class="muted">Sin experiencia</span>'}</div>${lv ? `<div class="row" style="margin-top:8px">${lv}</div>` : ''}${ch ? `<h4 style="margin-top:12px">Desafíos completados</h4><div class="row">${ch}</div>` : ''}</div>
      <div class="row">${!game.net ? '<button class="btn primary" data-act="again">Jugar otra vez</button>' : ''}<button class="btn" data-act="toMenu">Menú principal</button><button class="btn ghost" data-act="perksFromResults">Talentos</button></div>
    </div>`);
  }

  showLoading(text = 'Desplegando...') { this.screen = 'loading'; this.blocking = true; this.set(`<div class="loading"><div class="logo" style="font-size:48px">CENIZA</div><div style="margin-top:14px" class="muted">${esc(text)}</div></div>`); }

  // ------------------------------------------------------------------ acciones
  handle(act, d, el) {
    const s = saveSys.data, sel = s.selected, app = this.app, g = app.game;
    switch (act) {
      case 'main': this.showMain(); break;
      case 'solo': this.showSolo(); break;
      case 'coop': this.showCoop(); break;
      case 'perks': this.showPerks(); break;
      case 'cosmetics': this.showCosmetics(); break;
      case 'stats': this.showStats(); break;
      case 'codex': this.showCodex(); break;
      case 'howto': this.showHowto(); break;
      case 'settings': this.showSettings('main'); break;
      case 'settingsBack': saveSys.save(); if (this.settingsBack === 'pause' && g) this.showPause(g); else this.showMain(); break;
      case 'pickPerk': sel.perk = d.id; saveSys.save(); this.showSolo(); break;
      case 'pickMap': sel.map = d.id; saveSys.save(); this.showSolo(); break;
      case 'pickDiff': sel.difficulty = d.id; saveSys.save(); this.showSolo(); break;
      case 'pickLen': sel.length = d.id; saveSys.save(); this.showSolo(); break;
      case 'startSolo': app.startGame({ map: sel.map, perk: sel.perk, difficulty: sel.difficulty, length: sel.length }); break;
      case 'perkTab': this.perkTab = d.id; this.showPerks(); break;
      case 'selectPerk': sel.perk = d.id; saveSys.save(); this.showPerks(); break;
      case 'talent': {
        const ps = s.perks[this.perkTab];
        if (ps.level < TALENT_LEVELS[+d.tier]) { audio.play('deny', { volume: 0.4, bus: 'ui' }); break; }
        ps.talents[+d.tier] = +d.i; saveSys.save(); this.showPerks(); break;
      }
      case 'outfit': sel.outfit = d.id; saveSys.save(); this.showCosmetics(); break;
      case 'finish': sel.finish = d.id; saveSys.save(); this.showCosmetics(); break;
      case 'saveName': { const v = this.root.querySelector('#p-name').value.trim(); if (v) { s.profile.name = v.slice(0, 18); saveSys.save(); } this.showCosmetics(); break; }
      case 'resetSave': if (el.dataset.confirm) { saveSys.reset(); this.showMain(); } else { el.dataset.confirm = '1'; el.textContent = 'Pulsa otra vez para confirmar'; } break;
      case 'rebind': {
        el.textContent = 'Pulsa una tecla...';
        const handler = (e) => { e.preventDefault(); window.removeEventListener('keydown', handler, true); s.settings.binds[d.a] = e.code; saveSys.save(); app.applySettings(); this.showSettings(this.settingsBack); };
        window.addEventListener('keydown', handler, true);
        break;
      }
      case 'resetBinds': s.settings.binds = { ...DEFAULT_BINDS }; saveSys.save(); app.applySettings(); this.showSettings(this.settingsBack); break;
      // cooperativo
      case 'createRoom': case 'joinRoom': case 'listRooms': {
        const name = this.root.querySelector('#c-name')?.value.trim();
        if (name) { s.profile.name = name.slice(0, 18); saveSys.save(); }
        const url = this.root.querySelector('#c-url').value.trim();
        localStorage.setItem('ceniza_server', url);
        const code = this.root.querySelector('#c-code')?.value.trim().toUpperCase();
        const msg = this.root.querySelector('#c-msg');
        msg.textContent = 'Conectando...';
        app.net.connect(url).then(() => {
          if (act === 'createRoom') app.net.createRoom();
          else if (act === 'joinRoom') { if (!code) { msg.textContent = 'Introduce un código'; return; } app.net.joinRoom(code); }
          else app.net.listRooms();
        }).catch((e) => { msg.textContent = 'No se pudo conectar: ' + e.message; });
        break;
      }
      case 'joinCode': app.net.joinRoom(d.code); break;
      case 'leaveRoom': app.net.leaveRoom(); this.showCoop(); break;
      case 'lobbyReady': app.net.toggleReady(); break;
      case 'lobbyPerk': app.net.setPerk(d.id); sel.perk = d.id; saveSys.save(); break;
      case 'lobbyStart': app.net.requestStart(); break;
      // partida
      case 'resume': this.closeOverlay(g); break;
      case 'pauseSettings': this.showSettings('pause'); break;
      case 'pauseHowto': this.showHowto(); this.root.querySelector('[data-act="main"]').dataset.act = 'backToPause'; break;
      case 'backToPause': this.showPause(g); break;
      case 'abandon': if (el.dataset.confirm) { app.endGame(); } else { el.dataset.confirm = '1'; el.textContent = '¿Seguro? Pulsa otra vez'; } break;
      case 'closeTrader': this.closeOverlay(g); break;
      case 'ttab': this.traderTab = d.id; this.renderTrader(); break;
      case 'buy': g.trader.buy(d.id); this.renderTrader(); break;
      case 'sell': g.trader.sell(d.id); this.renderTrader(); break;
      case 'ammo1': g.trader.buyAmmo(d.id, false); this.renderTrader(); break;
      case 'ammoFull': g.trader.buyAmmo(d.id, true); this.renderTrader(); break;
      case 'upgrade': g.trader.upgrade(d.id); this.renderTrader(); break;
      case 'armor': g.trader.buyArmor(); this.renderTrader(); break;
      case 'grenade': g.trader.buyGrenade(); this.renderTrader(); break;
      case 'fillAll': g.trader.fillAllAmmo(); this.renderTrader(); break;
      case 'ready': g.voteReady(); setTimeout(() => this.screen === 'trader' && this.renderTrader(), 100); break;
      case 'again': { const c = g.cfg; app.endGame(true); app.startGame({ map: c.map, perk: sel.perk, difficulty: c.difficulty, length: c.length }); break; }
      case 'toMenu': app.endGame(); break;
      case 'perksFromResults': app.endGame(); this.showPerks(); break;
    }
  }
}

function modLabel(k, v) {
  const pct = (x) => `${x > 1 ? '+' : ''}${Math.round((x - 1) * 100)}%`;
  const map = {
    perkDmg: ['Daño de clase', pct], reload: ['Recarga', pct], recoil: ['Retroceso', pct], headDmg: ['Daño a la cabeza', pct], spread: ['Dispersión', pct],
    explRadius: ['Radio explosivo', pct], grenadeMax: ['Granadas', (x) => '+' + x], selfExplRes: ['Resist. autoexplosión', (x) => Math.round(x * 100) + '%'],
    weldSpeed: ['Soldadura', pct], penetration: ['Penetración', (x) => '+' + x], carry: ['Peso', (x) => '+' + x], healPower: ['Curación', pct], healRecharge: ['Recarga de jeringa', pct],
    moveSpeed: ['Velocidad', pct], maxArmor: ['Blindaje máx.', (x) => '+' + x], burnDur: ['Duración de fuego', pct], fireRes: ['Resist. fuego', (x) => Math.round(x * 100) + '%'], maxAmmo: ['Munición máx.', pct],
    chainAdd: ['Saltos de arco', (x) => '+' + x], stunPower: ['Aturdimiento', pct], seeCloaked: ['Detecta sigilo', (x) => Math.round(x) + ' m'], zedExtend: ['Extensión T. Muerto', (x) => '+' + x + ' s'],
    showHp: ['Ve la vida enemiga', () => '✔'], resupply: ['Reabastece aliados', () => '✔'],
  };
  const m = map[k];
  return m ? `${m[0]} ${m[1](v)}` : `${k}`;
}

function statSummary(d) {
  const f = d.fire || {};
  if (f.mode === 'projectile' && !f.projectile.radius) return `Impacto ${f.projectile.impactDmg} + fuego ${f.projectile.burn || 0}/s · Carg. ${d.mag}`;
  if (f.mode === 'projectile') return `Explosión ${f.projectile.dmg} · R ${f.projectile.radius} m · Carg. ${d.mag}`;
  if (f.mode === 'flame') return `Llamas ${f.range} m · Depósito ${d.mag}`;
  if (f.mode === 'beam') return `Haz ${f.range} m · Celda ${d.mag}`;
  return `Daño ${f.dmg}${f.pellets ? '×' + f.pellets : ''} · ${f.rpm} dpm · Carg. ${d.mag}`;
}

function weaponRow(d) {
  if (!d) return '';
  return `<div class="witem ${d.perk ? 'perk' : ''}"><div><div class="nm">${d.name}</div><div class="meta">${PERKS[d.perk]?.name || 'General'} · ${statSummary(d)} · Peso ${d.weight}</div></div><div class="price">${d.price ? d.price + ' ₵' : 'Inicial'}</div></div>`;
}

export { upgradeMult, MAX_UPGRADE };
