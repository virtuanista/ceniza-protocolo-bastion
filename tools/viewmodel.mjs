// Depuración visual del arma en primera persona: vistas fijas (frontal, lateral, superior, inferior)
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const out = 'tools/gallery/vm';
fs.mkdirSync(out, { recursive: true });
const ids = (process.env.ONLY || 'ar7').split(',');
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 800, height: 500 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.evaluate(() => window.__app.startGame({ map: 'estacion', perk: 'assault', difficulty: 'normal', length: 'short' }));
await wait(2500);
await page.addStyleTag({ content: '#hud,#toast-layer,#ui{display:none!important}' });
await page.evaluate(() => { const a = window.__app; a.input.locked = true; a.ui.clear(); const g = a.game; g.godMode = true; g.waves.timer = 9999; g.local.pitch = 1.4; g.weapons._animate = () => {}; });
const views = { side: [0, Math.PI / 2, 0], top: [Math.PI / 2, 0, 0], bottom: [-Math.PI / 2, 0, 0], front: [0, Math.PI, 0], back: [0.3, -0.5, 0] };
for (const id of ids) {
  await page.evaluate((id) => { const w = window.__app.game.weapons; let i = w.get(id); if (!i) i = w.addWeapon(id); w.equip(i, true); w.state = 'idle'; }, id);
  await wait(300);
  for (const [name, r] of Object.entries(views)) {
    for (const focus of (process.env.FOCUS || 'all').split(',')) {
      await page.evaluate((r, focus) => {
        const m = window.__app.game.weapons.curModel; m.group.visible = true;
        m.group.rotation.set(r[0], r[1], r[2], 'YXZ'); m.group.updateMatrix();
        const part = focus === 'L' ? m.armParts[2] : focus === 'R' ? m.armParts[0] : null;
        if (!part) { m.group.position.set(0, 0, -0.85); return; }
        const p = part.position.clone().applyEuler(m.group.rotation);
        m.group.position.set(-p.x, -p.y, -0.28 - p.z);
      }, r, focus);
      await wait(150);
      await page.screenshot({ path: `${out}/${id}_${name}_${focus}.png` });
    }
  }
}
console.log('errores', errors);
await browser.close();
