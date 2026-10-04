// Re-letters the off-topic product widgets on the landing page with Lantern content.
// Each output keeps the original artwork (frame, stickers, gradients, charts) and only
// repaints the panel text, in the site's own fonts and colours, at the image's native size.
// Usage: CHROME=... node site/tools/retouch/retouch.mjs   (writes into site/assets/img)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '../..');
const IMG = join(SITE, 'assets/img');
const ORIG = join(HERE, 'originals');
const FONTS = resolve(SITE, '../film/assets/fonts');
const f64 = (n) => readFileSync(join(FONTS, n)).toString('base64');

const css = `
@font-face{font-family:Body;src:url(data:font/woff2;base64,${f64('c314d5394508c5c7-s.p.woff2')}) format('woff2');font-weight:400}
@font-face{font-family:Body;src:url(data:font/woff2;base64,${f64('f5e01691c8be1cce-s.p.woff2')}) format('woff2');font-weight:500}
@font-face{font-family:Mono;src:url(data:font/woff2;base64,${f64('06a57141b3ff4399-s.p.woff2')}) format('woff2');font-weight:400}
html,body{margin:0;background:transparent}
#c{position:relative;overflow:hidden}
#c>img{position:absolute;left:0;top:0;display:block}
.a{position:absolute;white-space:pre;line-height:1}
.sans{font-family:Body,sans-serif}.mono{font-family:Mono,monospace}`;

// colours sampled from the originals
const BG = '#191919', BOX = '#2c2c2c', TXT = '#a7a9ac', HI = '#d1d6d9', LINE = '#414042', LIME = '#ddff46';
const rect = (x0, y0, x1, y1, bg = BG, r = 0) => `<div class="a" style="left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px;background:${bg};border-radius:${r}px"></div>`;
const txt = (x, y, s, size, o = {}) => `<div class="a ${o.mono ? 'mono' : 'sans'}" style="left:${x}px;top:${y}px;font-size:${size}px;color:${o.c || TXT};font-weight:${o.w || 400};letter-spacing:${o.ls ?? 0}px;${o.ta ? `width:${o.wd}px;text-align:${o.ta};` : ''}">${s}</div>`;
const caret = (x, y, s, c = TXT) => `<svg class="a" style="left:${x}px;top:${y}px" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const JOBS = {
  // ── card: "Hold the bonus, not the debt."  (was: Rollout duration)
  'img-053.png': () => {
    const row = (y, a, mid, n, unit) =>
      rect(166, y, 350, y + 118, BOX, 22) + txt(208, y + 40, a, 38) + txt(378, y + 44, mid, 34) +
      rect(458, y, 610, y + 118, BOX, 22) + txt(498, y + 40, n, 38) +
      rect(632, y, 860, y + 118, BOX, 22) + txt(664, y + 40, unit, 38) + caret(812, y + 46, 30);
    return rect(150, 140, 610, 230) + txt(168, 158, 'Hold window', 52) +
      rect(116, 285, 838, 582) + row(307, 'Bonus', 'held', '5', 'minutes') + row(447, 'Debt', 'held', '0', 'minutes');
  },
  // ── card: "Let anyone prove a bad price."  (was: Add judge / AI evaluators)
  'img-055.png': () => {
    const item = (y, on, name, desc) =>
      (on ? rect(122, y - 22, 838, y + 120, BOX, 16) : '') +
      `<div class="a" style="left:156px;top:${y + 4}px;width:30px;height:30px;border-radius:7px;box-sizing:border-box;border:2.5px solid ${on ? '#6b7cff' : '#bdbdbd'};background:${on ? '#405bff' : 'transparent'}"></div>` +
      (on ? `<div class="a" style="left:165px;top:${y + 13}px;width:12px;height:12px;border-radius:50%;background:#fff"></div>` : '') +
      txt(230, y + 2, name, 34, { mono: true, c: '#ffffff' }) + txt(230, y + 60, desc, 29);
    return rect(140, 160, 520, 232) + txt(146, 172, 'Name a rule', 44, { c: '#ffffff' }) +
      rect(112, 240, 838, 582) +
      item(290, true, 'CROSS_SOURCE', 'A second source is more than 5% apart') +
      item(436, false, 'SLOT_UNIQUENESS', 'Two values printed for one round') +
      item(560, false, 'ROUND_ORDERING', '');
  },
  // ── card: "Make the bond answer for the position."  (was: Cost $3,319)
  'img-057.png': () =>
    rect(262, 150, 838, 330) + txt(274, 162, 'Bond carried', 40, { mono: true }) +
    txt(276, 222, '0.1992', 96, { c: HI, ls: -3 }) +
    rect(600, 236, 742, 296, BOX, 12) + txt(618, 248, 'HOLD', 34, { mono: true }) +
    // the original chart carried invented dates; replace it with the two on-chain bond figures
    rect(262, 330, 838, 582) +
    txt(276, 372, 'Required', 28, { mono: true }) + txt(560, 372, '0.16', 28, { mono: true, c: HI, ta: 'right', wd: 230 }) +
    rect(276, 416, 790, 432, '#1d1d1d', 8) + rect(276, 416, 276 + 514 * 0.16 / 0.1992, 432, LINE, 8) +
    txt(276, 474, 'Carried', 28, { mono: true }) + txt(560, 474, '0.1992', 28, { mono: true, c: HI, ta: 'right', wd: 230 }) +
    rect(276, 518, 790, 534, '#1d1d1d', 8) + rect(276, 518, 790, 534, '#6b7cff', 8),
  // ── card: "Escalate feeds that get caught."  (was: Auto rollback)
  'img-059.png': () => rect(232, 168, 700, 300) + txt(240, 182, 'Required bond', 56),
  // ── card: "Price only on history."  (was: Model Distribution / LLM names)
  'img-061.png': () => {
    const row = (y, l, r, p) => txt(158, y, l, 30, { mono: true }) + txt(458, y, r, 30, { mono: true, ta: 'right', wd: 260 }) +
      rect(158, y + 44, 718, y + 60, '#1d1d1d', 8) + (p ? rect(158, y + 44, 158 + 560 * p, y + 60, LINE, 8) : '');
    return rect(122, 138, 748, 230) + txt(160, 160, 'Print history', 44) +
      rect(612, 158, 724, 208, BOX, 10) + txt(624, 170, 'min 4', 26, { mono: true }) +
      rect(122, 262, 748, 582) +
      row(288, 'Feed A · 4 prints', 'prices', 1) + row(396, 'Feed B · 2 prints', 'prints only', 0.5) + row(503, 'Feed C · 0 prints', 'prints only', 0);
  },
  // ── hero widget  (was: Satisfaction 86.8%)
  'img-040.png': () =>
    rect(30, 60, 1004, 786) + txt(78, 84, 'Bounty to prover', 50, { mono: true }) +
    txt(84, 168, '20%', 92, { c: TXT, ls: -2 }) + rect(300, 184, 610, 252, BOX, 14) + txt(322, 199, 'of the bonus', 38, { mono: true }) +
    rect(78, 340, 940, 342, LINE) +
    txt(84, 400, 'Paid from the feed’s bond.', 40, { mono: true }) +
    txt(84, 480, 'The prover’s stake is returned.', 40, { mono: true }) +
    txt(84, 560, 'The feed carries 20% more bond', 40, { mono: true }) +
    txt(84, 620, 'before it prints again.', 40, { mono: true }),
  // ── hero widget  (was: Month-to-date Spend $5.2k)
  'img-043.png': () => rect(12, 14, 246, 190) + txt(20, 22, 'Hold window', 14, { mono: true }) + txt(20, 112, '5 min', 62, { ls: -2 }),
  // ── hero widget  (was: Accuracy 0.8)
  'img-044.png': () => rect(10, 14, 248, 192) + txt(20, 22, 'Tolerance', 14, { mono: true }) +
    txt(20, 64, '5%', 54, { ls: -2 }) + rect(122, 82, 236, 108, BOX, 6) + txt(130, 88, 'cross-source', 12, { mono: true }) +
    txt(20, 150, 'same round, second feed', 12, { mono: true }),
  // ── hero widget  (was: Active Experiments 29)
  'img-050.png': () => rect(12, 14, 228, 150) + txt(20, 22, 'Challenges opened', 14, { mono: true }) + txt(22, 84, '5', 54),
  // ── hero widget  (was: Rollout duration)
  'img-046.png': () => {
    const row = (y, v, label) => rect(170, y, 440, y + 160, BOX, 26) + txt(214, y + 54, v, 56) + txt(500, y + 56, label, 52, { mono: true });
    return rect(100, 110, 1300, 222) + txt(112, 126, 'Market terms', 80) +
      rect(150, 380, 1376, 1128) + row(420, '70%', 'collateral factor') + row(634, '5%', 'liquidation bonus') + row(848, '50%', 'close factor');
  },
  // ── hero widget  (was: third-party SDK code + vendor logo)
  'img-047.png': () => {
    const code = [
      '// inside the five-minute hold window',
      'lantern.openChallenge(',
      '    liquidationId,',
      '    IChallenge.Rule.CROSS_SOURCE,',
      '    evidence,',
      '    stake',
      ');',
      '',
      '// anyone can settle it; the contract',
      '// recomputes the verdict from state',
      'bool upheld =',
      '    lantern.adjudicate(liquidationId);',
    ];
    const diamond = `<div class="a" style="left:104px;top:86px;width:40px;height:40px;background:${LIME};transform:rotate(45deg);border-radius:5px"></div>`;
    return rect(24, 24, 262, 262) + diamond +
      rect(300, 90, 1704, 180) + txt(340, 112, 'LANTERN · SOLIDITY', 46, { c: LIME }) +
      rect(300, 300, 1704, 405) + txt(340, 322, 'Solidity', 46, { mono: true, c: '#e6e6e6' }) +
      rect(338, 404, 528, 410, '#e6e6e6', 3) + txt(626, 322, 'cast', 46, { mono: true, c: '#5c5c5c' }) +
      rect(300, 420, 1704, 1836) + code.map((l, i) => txt(340, 512 + i * 73.6, l.replace(/</g, '&lt;'), 44, { mono: true })).join('');
  },
  // ── hero widget  (was: Prompt panel with a vendor model picker)
  'img-051.png': () =>
    rect(186, 92, 600, 205) + txt(200, 104, 'Challenge', 84) +
    rect(1080, 64, 1800, 222) + rect(1092, 76, 1768, 210, '#232323', 16) + txt(1140, 118, 'Arbitrum Sepolia', 44) + caret(1650, 118, 48) +
    rect(96, 432, 690, 545, '#1d1d1d') + txt(122, 462, 'CROSS_SOURCE', 50, { mono: true }) +
    rect(60, 640, 1940, 1030) +
    ['Round 16. The feed printed $2,146.58.', 'The second source printed $2,682.70', 'for the same round: 19.98% apart.', 'The limit is 5%.']
      .map((l, i) => txt(77, 666 + i * 88, l, 52, { mono: true })).join('') +
    rect(96, 1416, 690, 1528, '#1d1d1d') + txt(122, 1446, 'Stake', 50, { mono: true }) +
    rect(60, 1620, 1940, 1800) + ['Returned to you if the proof holds.'].map((l, i) => txt(77, 1640 + i * 88, l, 52, { mono: true, c: '#41403f' })).join(''),
};

mkdirSync(ORIG, { recursive: true });
const br = await chromium.launch({ executablePath: process.env.CHROME });
const pg = await br.newPage({ deviceScaleFactor: 1 });
for (const [name, ops] of Object.entries(JOBS)) {
  const keep = join(ORIG, name);
  if (!existsSync(keep)) copyFileSync(join(IMG, name), keep);         // retouch always starts from the untouched file
  const b64 = readFileSync(keep).toString('base64');
  const [w, h] = await pg.evaluate(async (src) => { const i = new Image(); i.src = src; await i.decode(); return [i.naturalWidth, i.naturalHeight]; }, `data:image/png;base64,${b64}`);
  await pg.setViewportSize({ width: w, height: h });
  await pg.setContent(`<style>${css}</style><div id="c" style="width:${w}px;height:${h}px"><img src="data:image/png;base64,${b64}" width="${w}" height="${h}">${ops()}</div>`);
  await pg.evaluate(() => document.fonts.ready);
  // paint only inside the original's opaque area so the rounded corners stay transparent
  await pg.evaluate(() => { const c = document.getElementById('c'); c.style.webkitMaskImage = c.style.maskImage = `url(${c.querySelector('img').src})`; c.style.maskSize = '100% 100%'; });
  writeFileSync(join(IMG, name), await pg.locator('#c').screenshot({ omitBackground: true }));
  console.log('wrote', name, w + 'x' + h);
}
await br.close();
