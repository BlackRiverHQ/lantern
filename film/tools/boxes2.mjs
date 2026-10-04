import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROME });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await p.goto('https://friendly-fennec-31.convex.site/dashboard/prove', { waitUntil: 'networkidle' });
await p.waitForTimeout(4000);
await p.screenshot({ path: 'assets/shots/prove.png' });
const r = await p.evaluate(() => {
  const box = (e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(v => +(v * 2).toFixed(1)); };
  const leaf = [...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && e.innerText);
  const pick = (s) => leaf.filter(e => e.innerText.trim() === s).map(e => ({ b: box(e), f: getComputedStyle(e).font, c: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor }));
  return { n45: pick('#45'), r16: pick('round 16'), p1: pick('$2,146.58'), p2: pick('$2,682.70'), ap: pick('19.98%'), up: pick('upheld'), lc: pick('Lie caught') };
});
console.log(JSON.stringify(r));
await b.close();
