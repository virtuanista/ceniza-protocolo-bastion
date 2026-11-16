// Galería visual: captura cada arma en primera persona y cada tipo de enemigo frente a la cámara.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const out = 'tools/gallery';
fs.mkdirSync(out, { recursive: true });
const which = (process.env.ONLY || '').split(',').filter(Boolean);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=960,540'], defaultViewport: { width: 960, height: 540, deviceScaleFactor: process.env.CLOSE ? 2 : 1 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.evaluate(() => window.__app.startGame({ map: 'estacion', perk: 'assault', difficulty: 'normal', length: 'short' }));
await wait(2500);
if (process.env.NOHUD) await page.addStyleTag({ content: '#hud,#toast-layer{display:none!important}' });
await page.evaluate(() => { const a = window.__app; a.input.locked = true; a.ui.clear(); const g = a.game; g.godMode = true; g.waves.timer = 9999; g.local.pos.set(-2, 0, 4); g.local.yaw = 0; g.local.pitch = -0.05; });
const weapons = await page.evaluate(() => Object.keys(window.__app.game.constructor && window.__WEAPONS || {}));
void weapons;
const ids = which.length ? which : ['p9', 'avispa', 'ar7', 'bulldog', 'lanza50', 'aliento', 'fenix', 'bobina', 'machete', 'welder'];
const AIM = !!process.env.AIM;
for (const id of ids) {
  await page.evaluate((id) => { const g = window.__app.game; const w = g.weapons; let i = w.get(id); if (!i) i = w.addWeapon(id); w.equip(i, true); }, id);
  await wait(700);
  await page.screenshot({ path: `${out}/w_${id}.png` });
  if (process.env.CLOSE) await page.screenshot({ path: `${out}/w_${id}_close.png`, clip: { x: 380, y: 200, width: 580, height: 340 } });
  if (AIM) { await page.evaluate(() => { window.__app.game.weapons.aiming = true; window.__app.game.weapons.ads = 1; }); await wait(400); await page.screenshot({ path: `${out}/w_${id}_ads.png` }); await page.evaluate(() => { window.__app.game.weapons.aiming = false; window.__app.game.weapons.ads = 0; }); }
}
// enemigos
if (process.env.NOENEMIES) { console.log('errores', errors); await browser.close(); process.exit(0); }
const types = ['putrido', 'putrido_alfa', 'rastrero', 'acechador', 'vesicula', 'escupidor', 'aullador', 'desgarrador', 'coloso', 'primogenito'];
for (const t of (process.env.ENEMIES || types.join(',')).split(',')) {
  await page.evaluate((t) => {
    const g = window.__app.game;
    for (const e of [...g.enemies.alive]) { g.enemies._releaseModel(e); }
    g.enemies.alive.length = 0;
    const big = t === 'coloso' || t === 'primogenito' || t === 'desgarrador';
    const e = g.enemies.spawn(t, -2, big ? -3 : -0.5, { yaw: 0 });
    e.state = 9; // congelado para la foto (no se actualiza IA)
    e.puppet = true; e.netPos = e.pos.clone(); e.netYaw = 0;
    if (t === 'acechador') g.enemies._setCloak(e, false);
    g.local.pitch = big ? 0.12 : -0.05;
  }, t);
  await wait(500);
  await page.screenshot({ path: `${out}/e_${t}.png` });
}
console.log('errores', errors);
await browser.close();
