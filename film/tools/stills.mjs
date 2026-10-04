// Stills at given times: node tools/stills.mjs <outPrefix> <t1,t2,...> [--v]
import { chromium } from 'playwright';
import { resolve, join, extname } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const [pre, ts] = process.argv.slice(2); const V = process.argv.includes('--v');
const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
const root = resolve('.');
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', woff2: 'font/woff2', png: 'image/png' };
const srv = createServer(async (q, s) => { try { const f = join(root, decodeURIComponent(q.url.split('?')[0])); const b = await readFile(f); s.writeHead(200, { 'content-type': MIME[extname(f).slice(1)] || 'application/octet-stream' }); s.end(b); } catch { s.writeHead(404); s.end(); } });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const br = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', process.env.SWGL ? '--use-angle=swiftshader' : '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--font-render-hinting=none', '--force-color-profile=srgb'] });
const p = await br.newPage({ viewport: { width: W, height: H } });
p.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/src/index.html${V ? '?v=1' : ''}`);
await p.waitForFunction(() => window.__ready !== undefined, null, { timeout: 60000 });
await p.evaluate(() => window.__ready);
for (const t of ts.split(',').map(Number)) {
  await p.evaluate((tt) => window.seek(tt), t);
  await p.screenshot({ path: `${pre}-${t.toFixed(2)}.png` });
}
console.log('ok'); await br.close(); srv.close();
