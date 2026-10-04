import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROME });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await p.goto('https://friendly-fennec-31.convex.site/dashboard/prove', { waitUntil: 'networkidle' });
await p.waitForTimeout(4000);
await p.screenshot({ path: 'assets/shots/prove.png' });
const r = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('tr')].filter(tr => /#45/.test(tr.innerText));
  const box = (e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(v => +(v * 2).toFixed(1)); };
  const out = {};
  rows.forEach((tr, i) => { out['row' + i] = box(tr); out['cells' + i] = [...tr.children].map(td => ({ t: td.innerText.replace(/\n/g, ' / '), b: box(td) })); });
  const h = [...document.querySelectorAll('h2,h3,div,span')].find(e => e.innerText && e.innerText.trim() === 'Verdicts this deployment has reached');
  if (h) out.heading = box(h);
  const t = h && h.closest('section,div'); if (t) out.panel = box(t.parentElement);
  const badge = rows[0] && [...rows[0].querySelectorAll('*')].filter(e => e.innerText && e.innerText.trim() === 'Lie caught').pop(); if (badge) out.badge = box(badge);
  const up = rows[0] && [...rows[0].querySelectorAll('*')].filter(e => e.innerText && e.innerText.trim() === 'upheld').pop(); if (up) { out.upheld = box(up); out.upheldFont = getComputedStyle(up).font; }
  const ap = rows[0] && [...rows[0].querySelectorAll('*')].filter(e => e.innerText && e.innerText.trim() === '19.98%').pop(); if (ap) out.apart = box(ap);
  return out;
});
console.log(JSON.stringify(r, null, 1));
await b.close();
