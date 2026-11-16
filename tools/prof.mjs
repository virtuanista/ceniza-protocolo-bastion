import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
await page.evaluate(() => window.__app.startGame({ map: 'estacion', perk: 'assault', difficulty: 'hell', length: 'short' }));
await new Promise(r=>setTimeout(r,8000));
console.log(await page.evaluate(async () => {
  const a = window.__app, g = a.game; a.input.locked = true; a.ui.clear(); g.godMode = true; g.waves.timer = 999;
  for (let i = 0; i < 34; i++) { const s = g.world.def.spawns[i % 9]; g.enemies.spawn(['putrido','rastrero','coloso','vesicula','acechador','desgarrador','escupidor','aullador','putrido_alfa'][i % 9], s.exit[0], s.exit[1]); }
  const acc = {};
  const wrap = (obj, name, label) => { const f = obj[name].bind(obj); obj[name] = (...args) => { const t = performance.now(); const r = f(...args); const d = performance.now() - t; const k = acc[label] || (acc[label] = { tot: 0, max: 0, n: 0 }); k.tot += d; k.max = Math.max(k.max, d); k.n++; return r; }; };
  wrap(g.world.nav, 'computeField', 'field');
  wrap(g.enemies, 'update', 'enemies');
  wrap(g.projectiles, 'update', 'proj');
  wrap(g.fx, 'update', 'fx');
  wrap(g.weapons, 'update', 'weapons');
  wrap(g.hud, 'update', 'hud');
  wrap(g.world, 'update', 'world');
  wrap(g.local, 'update', 'player');
  const gl = a.renderer.gl.getContext();
  for (let i = 0; i < 300; i++) {
    g.input.mouse.left = i % 2 === 0; g.input.mouse.leftPressed = true;
    g.update(1 / 60);
    const t = performance.now(); a.renderer.render(true); gl.finish(); const d = performance.now() - t;
    const k = acc.render || (acc.render = { tot: 0, max: 0, n: 0 }); k.tot += d; k.max = Math.max(k.max, d); k.n++;
    await new Promise((r) => setTimeout(r, 0));
  }
  return JSON.stringify(Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, { avg: +(v.tot / v.n).toFixed(2), max: +v.max.toFixed(2), n: v.n }])));
}));
await browser.close();
