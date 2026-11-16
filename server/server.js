// Servidor cooperativo de CENIZA: salas de hasta 6 jugadores, lobby, y retransmisión de
// mensajes. El anfitrión de la sala ejecuta la simulación autoritativa de la horda.
// También sirve la versión compilada (dist/) si existe: `npm start`.
import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = +(process.env.PORT || 8787);
const MAX_PLAYERS = 6;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(DIST, url === '/' ? 'index.html' : url);
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Servidor cooperativo de CENIZA activo. Compila el cliente con `npm run build` para servirlo aquí.'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, maxPayload: 1 << 20 });
const rooms = new Map(); // code -> room
let nextId = 1;

function code() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };

function lobbyMsg(room) {
  return { t: 'lobby', code: room.code, host: room.host, cfg: room.cfg, started: room.started, players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, perk: p.perk, level: p.level, outfit: p.outfit, ready: p.ready })) };
}
function broadcast(room, msg, except = null) {
  const s = JSON.stringify(msg);
  for (const p of room.players.values()) if (p.ws !== except) send(p.ws, s);
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  room.players.delete(ws.id);
  ws.room = null;
  if (room.players.size === 0) { rooms.delete(room.code); return; }
  if (room.host === ws.id) {
    if (room.started) { broadcast(room, { t: 'hostLeft' }); room.started = false; }
    room.host = room.players.keys().next().value;
  } else if (room.started) broadcast(room, { t: 'left', id: ws.id });
  for (const p of room.players.values()) p.ready = false;
  broadcast(room, lobbyMsg(room));
}

wss.on('connection', (ws) => {
  ws.id = 'p' + nextId++;
  ws.room = null;
  send(ws, { t: 'welcome', id: ws.id });
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const room = ws.room;
    switch (m.t) {
      case 'list':
        send(ws, { t: 'rooms', list: [...rooms.values()].filter((r) => !r.started && r.players.size < MAX_PLAYERS).map((r) => ({ code: r.code, n: r.players.size, host: r.players.get(r.host)?.name, map: r.cfg.map })) });
        break;
      case 'create': {
        if (room) leave(ws);
        const r = { code: code(), host: ws.id, players: new Map(), cfg: { map: 'estacion', difficulty: 'normal', length: 'short' }, started: false };
        rooms.set(r.code, r);
        r.players.set(ws.id, { id: ws.id, ws, ...sanitize(m.player), ready: false });
        ws.room = r;
        send(ws, lobbyMsg(r));
        break;
      }
      case 'join': {
        const r = rooms.get(String(m.code || '').toUpperCase());
        if (!r) { send(ws, { t: 'error', msg: 'La sala no existe' }); break; }
        if (r.started) { send(ws, { t: 'error', msg: 'La partida ya ha comenzado' }); break; }
        if (r.players.size >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'Sala llena (6/6)' }); break; }
        if (room) leave(ws);
        r.players.set(ws.id, { id: ws.id, ws, ...sanitize(m.player), ready: false });
        ws.room = r;
        broadcast(r, lobbyMsg(r));
        break;
      }
      case 'leave': leave(ws); break;
      case 'lobby': {
        if (!room) break;
        const p = room.players.get(ws.id);
        if (m.ready !== undefined) p.ready = !!m.ready;
        if (m.perk) { p.perk = String(m.perk).slice(0, 16); p.level = +m.level || 0; }
        if (m.cfg && room.host === ws.id) Object.assign(room.cfg, pickCfg(m.cfg));
        broadcast(room, lobbyMsg(room));
        break;
      }
      case 'chat': if (room) broadcast(room, { t: 'chat', n: room.players.get(ws.id)?.name, text: String(m.text || '').slice(0, 120) }); break;
      case 'start': {
        if (!room || room.host !== ws.id) break;
        if (![...room.players.values()].every((p) => p.ready)) { send(ws, { t: 'error', msg: 'No todos están listos' }); break; }
        room.started = true;
        const msg = lobbyMsg(room);
        broadcast(room, { t: 'start', cfg: room.cfg, host: room.host, players: msg.players });
        break;
      }
      case 'end': if (room && room.host === ws.id) { room.started = false; for (const p of room.players.values()) p.ready = false; broadcast(room, { t: 'ended' }); broadcast(room, lobbyMsg(room)); } break;
      // retransmisión en partida
      case 'st': if (room) broadcast(room, { t: 'st', from: ws.id, s: m.s }, ws); break;
      case 'fx': if (room) broadcast(room, { t: 'fx', from: ws.id, m: m.m }, ws); break;
      case 'ev': if (room && room.host === ws.id) broadcast(room, { t: 'ev', evs: m.evs }, ws); break;
      case 'snap': if (room && room.host === ws.id) broadcast(room, { t: 'snap', e: m.e }, ws); break;
      case 'to': {
        if (!room) break;
        const target = m.id === 'host' ? room.players.get(room.host) : room.players.get(m.id);
        if (target) send(target.ws, { t: 'msg', from: ws.id, k: m.k, d: m.d });
        break;
      }
    }
  });
  ws.on('close', () => leave(ws));
});

function sanitize(p = {}) { return { name: String(p.name || 'Limpiador').slice(0, 18), perk: String(p.perk || 'assault').slice(0, 16), level: +p.level || 0, outfit: String(p.outfit || 'brigada').slice(0, 16) }; }
function pickCfg(c) {
  const out = {};
  if (['estacion', 'hospital', 'metro'].includes(c.map)) out.map = c.map;
  if (['normal', 'hard', 'suicidal', 'hell'].includes(c.difficulty)) out.difficulty = c.difficulty;
  if (['short', 'medium', 'long', 'endless'].includes(c.length)) out.length = c.length;
  return out;
}

server.listen(PORT, () => console.log(`[CENIZA] Servidor cooperativo escuchando en ws://localhost:${PORT}`));
