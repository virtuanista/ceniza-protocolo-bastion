// Prueba automática de humo: abre el juego en Chrome sin interfaz, inicia una partida,
// simula combate y fases, recoge errores de consola, rendimiento y capturas.
// Uso: node tools/smoke.mjs [url] [outDir]
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || 'tools/shots';
fs.mkdirSync(out, { recursive: true });
const scenario = process.env.SCENARIO || 'basic';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${t}`); if (t.startsWith('[T]')) console.log(t); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.goto(url, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: path.join(out, '01_menu.png') });

const shot = async (n) => page.screenshot({ path: path.join(out, n + '.png') });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// iniciar partida
await page.evaluate((sc) => {
  const app = window.__app;
  const cfg = { map: sc === 'hospital' ? 'hospital' : 'estacion', perk: window.__perk || 'assault', difficulty: 'normal', length: 'short' };
  app.startGame(cfg);
}, scenario);
await wait(2500);
await page.evaluate(() => { const a = window.__app; a.input.locked = true; a.ui.clear(); });
await shot('02_spawn');

// estadísticas
const stat = () => page.evaluate(() => {
  const g = window.__app.game; if (!g) return null;
  const r = g.renderer.stats();
  return { phase: g.waves.phase, wave: g.waves.wave, timer: +g.waves.timer.toFixed(1), alive: g.enemies.alive.length, toSpawn: g.waves.toSpawn, hp: Math.round(g.local.hp), credits: g.local.credits, calls: r.calls, tris: r.triangles, fps: g.app.hud.fps, kills: g.local.stats.kills, pos: [g.local.pos.x.toFixed(1), g.local.pos.z.toFixed(1)] };
});
console.log('inicio', await stat());

// abrir comerciante por código
await page.evaluate(() => { const g = window.__app.game; const pod = g.waves.activePod; g.local.pos.set(pod.pos.x + 1.8, 0, pod.pos.z + 1.8); g.app.ui.openTrader(g); });
await wait(600);
await shot('03_trader');
await page.evaluate(() => { const g = window.__app.game; g.trader.buy('ar7'); g.trader.buyArmor(); g.trader.buyGrenade(); g.app.ui.renderTrader(); });
await wait(300);
await shot('03b_trader_bought');
await page.evaluate(() => { const g = window.__app.game; g.app.ui.closeOverlay(g); g.app.input.locked = true; g.waves.timer = 0.5; g.godMode = true; });
await wait(4000);
console.log('oleada', await stat());

// combate automático: apuntar al enemigo más cercano y disparar
await page.evaluate(() => {
  const g = window.__app.game;
  window.__bot = setInterval(() => {
    const p = g.local;
    let best = null, bd = 1e9;
    for (const e of g.enemies.alive) { const d = e.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = e; } }
    if (!best) { g.input.mouse.left = false; return; }
    const h = best.headWorld.lengthSq() ? best.headWorld : best.center();
    const dx = h.x - p.camPos.x, dy = h.y - p.camPos.y - 0.05, dz = h.z - p.camPos.z;
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    g.input.mouse.left = bd < 45;
    g.input.mouse.leftPressed = bd < 45;
    const w = g.weapons.current;
    if (w && w.mag === 0 && w.reserve === 0) { for (const i of g.weapons.inv) if (i.mag + i.reserve > 0 && i.def.mag) { g.weapons.equip(i); break; } }
    if (w && w.reserve < 30 && w.def.mag) w.reserve += 60; // munición infinita para la prueba
  }, 50);
});
for (let i = 0; i < 6; i++) { await wait(5000); console.log('t' + i, await stat()); if (i === 1) await shot('04_combat'); if (i === 3) await shot('05_combat2'); }

// saltar a la oleada del jefe
await page.evaluate(() => {
  const g = window.__app.game;
  for (const e of [...g.enemies.alive]) g.enemies.kill(e, { shooter: g.local.id, headshot: false, type: 'ballistic' });
  g.waves.toSpawn = 0;
  g.waves.wave = g.waves.length.waves;
});
await wait(1500);
console.log('fin oleada', await stat());
await page.evaluate(() => { const g = window.__app.game; g.waves.timer = 0.3; });
await wait(3000);
console.log('jefe', await stat());
await shot('06_boss');
for (let i = 0; i < 6; i++) {
  await wait(5000);
  const s = await page.evaluate(() => { const g = window.__app.game; if (!g) return 'sin partida'; const b = g.enemies.alive.find((e) => e.def.boss); return { boss: b ? Math.round(b.hp) + '/' + Math.round(b.maxHp) : 'muerto', phase: g.boss?.phase, act: g.boss?.action?.kind, alive: g.enemies.alive.length, over: g.over, won: g.won }; });
  console.log('jefe t' + i, s);
  if (i === 2) await shot('07_boss2');
  // acelerar: daño directo al jefe
  await page.evaluate(() => { const g = window.__app.game; const b = g?.enemies.alive.find((e) => e.def.boss); if (b) g.enemies.damage(b, b.maxHp * 0.2, 'heart', 'ballistic', null, g.local.id, {}); });
}
await wait(5000);
await shot('08_end');
console.log('ui', await page.evaluate(() => window.__app.ui.screen));
console.log('ERRORES (' + errors.length + '):\n' + [...new Set(errors)].slice(0, 30).join('\n'));
await browser.close();
