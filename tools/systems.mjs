import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message + ' ' + (e.stack||'').split('\n')[1]));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
const w = (ms) => new Promise(r=>setTimeout(r,ms));
// Flujo real por clics: menú -> solitario -> elegir clase incinerador, mapa hospital, interminable -> desplegar
await page.click('[data-act=solo]'); await w(300);
await page.click('[data-act=pickPerk][data-id=fire]'); await w(200);
await page.click('[data-act=pickMap][data-id=hospital]'); await w(200);
await page.click('[data-act=pickLen][data-id=endless]'); await w(200);
await page.screenshot({ path: 'tools/gallery/solo_setup.png' });
await page.click('[data-act=startSolo]'); await w(3500);
console.log('partida', await page.evaluate(() => { const g=window.__app.game; return { map: g.world.def.id, perk: g.perkId, len: g.waves.lengthId, w: g.weapons.current.def.id }; }));
await page.evaluate(() => { const a=window.__app; a.input.locked=true; a.ui.clear(); const g=a.game; g.godMode=true; g.waves.timer=0.1; });
await w(1500);
// objetivo forzado: defender
for (const kind of ['defend','repair','carry','holdout']) {
  const r = await page.evaluate(async (kind) => {
    const g=window.__app.game; const { Objective } = await import('/src/game/waves.js');
    if (g.waves.objective) g.waves.objective.fail('test');
    const o = g.world.def.objectives;
    const data = kind==='carry'? o.carry[0] : kind==='repair'? o.devices[0] : o.zones[0];
    const obj = new Objective(g, kind, data); g.waves.objective = obj; obj.start();
    const before = g.local.credits;
    if (kind==='defend') { g.local.pos.set(obj.pos.x, 0, obj.pos.z); obj.progress = obj.goal - 0.5; }
    if (kind==='repair') { g.local.pos.set(obj.pos.x, 0, obj.pos.z+0.5); for (let i=0;i<130;i++) obj.interact(g.local, 0.1, true); }
    if (kind==='carry') { g.local.pos.copy(obj.itemPos); obj.interact(g.local, 0.1, false); g.local.pos.set(obj.dest.x, 0, obj.dest.z); }
    if (kind==='holdout') { g.local.pos.set(obj.pos.x, 0, obj.pos.z); for (let i=0;i<obj.goal;i++) obj.onKill(); }
    await new Promise(r=>setTimeout(r,1500));
    return { kind, done: obj.done, failed: obj.failed, carrier: obj.carrier, credits: g.local.credits - before };
  }, kind);
  console.log('objetivo', r);
}
// Tiempo muerto
console.log('zed', await page.evaluate(async () => { const g=window.__app.game; g.startZed(2); const a = g.timeScale; await new Promise(r=>setTimeout(r,300)); const s=g.timeScale; await new Promise(r=>setTimeout(r,2200)); return { during: s, after: g.timeScale, cls: document.getElementById('view').className }; }));
// Interminable: saltar a oleada 5 -> jefe
console.log('interminable', await page.evaluate(async () => {
  const g=window.__app.game; for (const e of [...g.enemies.alive]) g.enemies.kill(e,{shooter:g.local.id,type:'ballistic'}); g.waves.toSpawn=0; g.waves.wave=4;
  await new Promise(r=>setTimeout(r,800)); g.waves.timer=0.1; await new Promise(r=>setTimeout(r,1500));
  const boss = g.enemies.alive.find(e=>e.def.boss);
  if (boss) g.enemies.damage(boss, boss.maxHp*2, 'heart', 'ballistic', null, g.local.id, {});
  await new Promise(r=>setTimeout(r,2500));
  return { wave: g.waves.wave, phase: g.waves.phase, over: g.over, bossHp: boss && Math.round(boss.maxHp) };
}));
// Guardado persistente
const xpBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('ceniza_protocolo_save_v1')).perks.fire);
await page.evaluate(() => window.__app.endGame());
await page.reload({ waitUntil: 'networkidle0' });
const xpAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('ceniza_protocolo_save_v1')).perks.fire);
console.log('guardado', xpBefore, xpAfter);
await page.click('[data-act=perks]'); await w(300);
await page.click('[data-act=perkTab][data-id=fire]'); await w(300);
await page.screenshot({ path: 'tools/gallery/perks.png' });
await page.click('[data-act=stats]').catch(()=>{});
await page.evaluate(() => window.__app.ui.showStats()); await w(300);
await page.screenshot({ path: 'tools/gallery/stats.png' });
console.log('errores', errs);
await browser.close();
