// Deterministic frame renderer: loads a page exposing window.__ready (Promise) and window.seek(t),
// walks time at FPS*SUB, captures each frame, pipes PNG/JPEG into ffmpeg, averages SUB subframes (shutter).
// node tools/render.mjs --page src/index.html --out out/x.mp4 --fps 60 --sub 1 --from 0 --to 5 [--w 1920 --h 1080] [--q 16] [--jpeg]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve, join, extname, relative } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes('--' + k);
const page = resolve(opt('page', 'src/index.html'));
const out = opt('out', 'out/test.mp4');
const FPS = +opt('fps', 60), SUB = +opt('sub', 1), FROM = +opt('from', 0), TO = +opt('to', 5);
const W = +opt('w', 1920), H = +opt('h', 1080), CRF = opt('q', '16');
const query = opt('query', '');
const fmt = has('jpeg') ? 'jpeg' : 'png';

const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--use-gl=angle', process.env.SWGL ? '--use-angle=swiftshader' : '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--font-render-hinting=none',
         '--disable-gpu-vsync', '--force-color-profile=srgb', '--hide-scrollbars'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.type(), m.text()); });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
// serve the film directory over http (ES modules refuse file://)
const root = resolve('.');
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', woff2: 'font/woff2', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', json: 'application/json', webp: 'image/webp' };
const srv = createServer(async (q, s) => {
  try { const f = join(root, decodeURIComponent(q.url.split('?')[0])); const b = await readFile(f);
    s.writeHead(200, { 'content-type': MIME[extname(f).slice(1)] || 'application/octet-stream' }); s.end(b);
  } catch { s.writeHead(404); s.end(); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/`;
await p.goto(base + relative(root, page) + (query ? '?' + query : ''));
await p.waitForFunction(() => window.__ready !== undefined, null, { timeout: 30000 });
await p.evaluate(() => window.__ready);
await p.evaluate(() => document.fonts.ready);
const cdp = await ctx.newCDPSession(p);

const vf = SUB > 1
  ? `tmix=frames=${SUB}:weights='${Array(SUB).fill(1).join(' ')}',select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB`
  : 'null';
const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-',
  '-vf', vf, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', CRF, '-pix_fmt', 'yuv420p',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', out],
  { stdio: ['pipe', 'inherit', 'inherit'] });

const total = Math.round((TO - FROM) * FPS * SUB);
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  // subframes spread across a 180-degree shutter centred on the frame time
  const frame = Math.floor(i / SUB), s = i % SUB;
  const shutter = SUB > 1 ? (s / (SUB - 1) - 0.5) * 0.5 / FPS : 0;
  const t = FROM + frame / FPS + shutter;
  await p.evaluate((tt) => window.seek(tt), Math.max(0, t));
  const { data } = await cdp.send('Page.captureScreenshot', { format: fmt, quality: fmt === 'jpeg' ? 92 : undefined, optimizeForSpeed: true });
  const buf = Buffer.from(data, 'base64');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (frame % FPS === 0 && s === 0) {
    const el = (Date.now() - t0) / 1000;
    process.stdout.write(`\r${(FROM + frame / FPS).toFixed(1)}s  ${(i / Math.max(el, 0.01)).toFixed(1)} cap/s  eta ${((total - i) / Math.max(i / el, 0.01)).toFixed(0)}s   `);
  }
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close(); srv.close();
console.log(`\ndone ${out} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
