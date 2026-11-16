// Prueba de rendimiento: 34 engendros activos persiguiendo al jugador; mide coste por fotograma (CPU+GPU con finish()).
import puppeteer from 'puppeteer-core';
const q = process.env.Q || 'medium';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
await page.evaluate((q) => { const s = JSON.parse(localStorage.getItem('ceniza_protocolo_save_v1') || 'null'); window.__app.applySettings(); const sv = window.__app; void s; }, q);
await page.evaluate((q) => { const st = window.__app.settings; st.quality = q; window.__app.startGame({ map: 'estacion', perk: 'assault', difficulty: 'hell', length: 'short' }); }, q);
await new Promise(r=>setTimeout(r,3000));
const res = await page.evaluate(async () => {
  const a = window.__app, g = a.game; a.input.locked = true; a.ui.clear(); g.godMode = true; g.waves.timer = 999;
  for (let i = 0; i < 34; i++) { const s = g.world.def.spawns[i % 9]; g.enemies.spawn(['putrido','rastrero','coloso','vesicula','acechador','desgarrador','escupidor','aullador','putrido_alfa'][i % 9], s.exit[0], s.exit[1]); }
  a.game.update = a.game.update.bind(a.game);
  const times = [], upd = [];
  const gl = a.renderer.gl.getContext();
  for (let i = 0; i < 300; i++) {
    const t0 = performance.now();
    g.input.mouse.left = i % 2 === 0; g.input.mouse.leftPressed = true;
    g.update(1 / 60);
    const t1 = performance.now();
    a.renderer.render(true);
    gl.finish();
    times.push(performance.now() - t0); upd.push(t1 - t0);
    await new Promise((r) => setTimeout(r, 0));
  }
  times.sort((x, y) => x - y); upd.sort((x, y) => x - y);
  const r = a.renderer.stats();
  return { median: times[150].toFixed(2), p95: times[285].toFixed(2), updMedian: upd[150].toFixed(2), updP95: upd[285].toFixed(2), calls: r.calls, tris: r.triangles, alive: g.enemies.alive.length, mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) + 'MB' : '' };
});
console.log(q, res);
await browser.close();
