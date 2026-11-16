import puppeteer from 'puppeteer-core';
const map = process.env.MAP || 'estacion';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist'], defaultViewport: { width: 960, height: 540 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message + ' ' + (e.stack||'').split('\n')[1]));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
if (process.env.PP) await page.evaluate((pp) => { window.__pp = pp; }, JSON.parse(process.env.PP));
await page.evaluate((map) => window.__app.startGame({ map, perk: 'support', difficulty: 'hard', length: 'medium' }), map);
await new Promise(r=>setTimeout(r,2500));
await page.evaluate(() => { const a=window.__app; a.input.locked=true; a.ui.clear(); const g=a.game; g.waves.timer=0.2; g.waves.wave = 3; window.__trk = {}; if (window.__pp) { g.local.pos.set(...window.__pp); } });
for (let i=0;i<10;i++) {
  await new Promise(r=>setTimeout(r,3000));
  console.log(await page.evaluate(() => {
    const g=window.__app.game; const p=g.local;
    const es=g.enemies.alive; let near=99, stuck=0;
    for (const e of es) { const d=e.pos.distanceTo(p.pos); near=Math.min(near,d); const k=e.id; const prev=window.__trk[k]; if (prev && Math.hypot(prev[0]-e.pos.x, prev[1]-e.pos.z) < 0.5 && d > 4 && e.state===1) stuck++; window.__trk[k]=[e.pos.x,e.pos.z]; }
    const types = g.enemies.countByType();
    return JSON.stringify({ hp: Math.round(p.hp), ar: Math.round(p.armor), alive: es.length, near: near.toFixed(1), stuck, states: es.map(e=>e.state).join(''), types, ph: g.waves.phase, over: g.over });
  }));
}
console.log('errores', errs);
await browser.close();
