// Captura una vista concreta: MAP=metro P='[x,y,z,yaw,pitch]' OUT=nombre node tools/cam.mjs
import puppeteer from 'puppeteer-core';
const map = process.env.MAP || 'estacion';
const P = JSON.parse(process.env.P || '[-2,0,4,0,0]');
const out = process.env.OUT || 'cam';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 960, height: 540 } });
const page = await browser.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
await page.evaluate((map) => window.__app.startGame({ map, perk: 'assault', difficulty: 'normal', length: 'short' }), map);
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate((P) => { const a = window.__app; a.input.locked = true; a.ui.clear(); const g = a.game; g.local.pos.set(P[0], P[1], P[2]); g.local.yaw = P[3]; g.local.pitch = P[4]; }, P);
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: `tools/gallery/${out}.png` });
await browser.close();
