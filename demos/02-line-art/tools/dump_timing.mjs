// Dumps path-derived timing (tip speed, corner times, piece times) → out/timing.json for audio.py.
// Run from $ROOT: node demos/02-line-art/tools/dump_timing.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(DEMO, '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };
const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage(); await page.setViewport({ width: 1920, height: 1080 });
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/demos/02-line-art/index.html`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
const data = await page.evaluate(() => window.__timing());
fs.mkdirSync(path.join(DEMO, 'out'), { recursive: true });
fs.writeFileSync(path.join(DEMO, 'out/timing.json'), JSON.stringify(data));
console.log('pieces', JSON.stringify(data.pieces));
console.log('corners', data.corners.length, data.corners.map((c) => c.t.toFixed(2) + ':' + c.piece).join(' '));
const sp = data.speed; console.log('speed px/s max', Math.max(...sp).toFixed(0), 'at', (sp.indexOf(Math.max(...sp)) / 120).toFixed(2));
await browser.close(); srv.close();
