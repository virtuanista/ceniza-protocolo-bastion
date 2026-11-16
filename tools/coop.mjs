// Prueba cooperativa real: dos clientes (anfitrión + invitado) conectados al servidor.
import puppeteer from 'puppeteer-core';
const launch = () => puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 800, height: 450 } });
const bA = await launch(), bB = await launch();
const A = await bA.newPage(), B = await bB.newPage();
const errs = [];
for (const [n, p] of [['A', A], ['B', B]]) { p.on('pageerror', (e) => errs.push(n + ': ' + e.message + ' ' + (e.stack || '').split('\n')[1])); p.on('console', (m) => { if (m.type() === 'error') errs.push(n + ' console: ' + m.text()); }); }
await A.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
await B.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
const w = (ms) => new Promise((r) => setTimeout(r, ms));
// A crea sala
await A.evaluate(() => { const a = window.__app; a.ui.showCoop(); document.querySelector('#c-name').value = 'Anfitriona'; document.querySelector('[data-act=createRoom]').click(); });
await w(1200);
const code = await A.evaluate(() => window.__app.net.lobby?.code);
console.log('sala', code);
await B.evaluate((code) => { const a = window.__app; a.ui.showCoop(); document.querySelector('#c-name').value = 'Invitado'; document.querySelector('#c-code').value = code; document.querySelector('[data-act=joinRoom]').click(); }, code);
await w(1200);
await B.evaluate(() => { document.querySelector('[data-act=lobbyPerk][data-id=medic]').click(); });
await w(400);
await A.evaluate(() => document.querySelector('[data-act=lobbyReady]').click());
await B.evaluate(() => document.querySelector('[data-act=lobbyReady]').click());
await w(600);
console.log('lobby', await A.evaluate(() => JSON.stringify(window.__app.net.lobby.players.map((p) => [p.name, p.perk, p.ready]))));
await A.screenshot({ path: 'tools/gallery/coop_lobby.png' });
await A.evaluate(() => document.querySelector('[data-act=lobbyStart]').click());
await w(3500);
for (const p of [A, B]) await p.evaluate(() => { const a = window.__app; a.input.locked = true; a.ui.clear(); });
const info = (p) => p.evaluate(() => { const g = window.__app.game; if (!g) return 'sin partida'; return JSON.stringify({ host: g.authority, remote: [...g.remote.values()].map((r) => [r.name, r.pos.x.toFixed(1), r.pos.z.toFixed(1), r.hp]), phase: g.waves.phase, wave: g.waves.wave, t: g.waves.timer.toFixed(0), enemies: g.enemies.alive.length, hp: Math.round(g.local.hp), cr: g.local.credits, kills: g.local.stats.kills }); });
console.log('A', await info(A)); console.log('B', await info(B));
// listo ambos -> empieza la oleada
await A.evaluate(() => window.__app.game.voteReady());
await B.evaluate(() => window.__app.game.voteReady());
await w(7000);
console.log('A', await info(A)); console.log('B', await info(B));
// B dispara a enemigos (bot), A se queda quieto
await B.evaluate(() => {
  const g = window.__app.game;
  setInterval(() => {
    const p = g.local; let best = null, bd = 1e9;
    for (const e of g.enemies.alive) { const d = e.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = e; } }
    if (!best) { g.input.mouse.left = false; return; }
    const h = best.center();
    const dx = h.x - p.camPos.x, dy = h.y - p.camPos.y, dz = h.z - p.camPos.z;
    p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    g.input.mouse.left = bd < 40; g.input.mouse.leftPressed = bd < 40;
    const wpn = g.weapons.current; if (wpn.reserve < 20) wpn.reserve += 50;
  }, 50);
});
for (let i = 0; i < 4; i++) { await w(5000); console.log('A', await info(A)); console.log('B', await info(B)); }
await B.screenshot({ path: 'tools/gallery/coop_B.png' });
await A.evaluate(() => { const g = window.__app.game; const r = [...g.remote.values()][0]; g.local.pos.set(r.pos.x, 0, r.pos.z + 4); g.local.yaw = 0; g.local.pitch = -0.1; }); await w(300); await A.screenshot({ path: 'tools/gallery/coop_A.png' });
// curar a compañero: A recibe daño y B le cura con el dardo
await A.evaluate(() => { window.__app.game.local.hp = 50; });
await B.evaluate(() => { const g = window.__app.game; const r = [...g.remote.values()][0]; g.healTeammate(r, 30, true); });
await w(1000);
console.log('A tras curación', await A.evaluate(() => Math.round(window.__app.game.local.hp)));
console.log('errores', errs.slice(0, 20));
await bA.close(); await bB.close();
