// node tools/shoot.mjs <url> <out.png> [w] [h] [scrollY]
import { chromium } from 'playwright';
const [url, out, w = 1920, h = 1080, sy = 0] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(url, { waitUntil: 'networkidle' });
await p.evaluate((y) => window.scrollTo(0, +y), sy);
await p.waitForTimeout(1200);
await p.screenshot({ path: out });
await b.close();
