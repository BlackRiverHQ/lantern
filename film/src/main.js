// Lantern launch film. One paused GSAP timeline; window.seek(t) paints any frame.
import { createWorld, S } from './lib/world.js';
import { homography, lerpQuad, rectQuad } from './lib/quad.js';
import { odometer } from './lib/util.js';
import { B } from './lib/tokens.js';
import { layout } from './layout.js';

const Q = new URLSearchParams(location.search);
const V = Q.get('v') === '1';
const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
const P = layout(V, W, H);
document.documentElement.style.setProperty('--W', W + 'px');
document.documentElement.style.setProperty('--H', H + 'px');
const b = (n) => +(n * B).toFixed(4);           // beat → seconds
export const DUR = 30;

const stage = document.getElementById('stage');
const mk = (tag, cls, css, parent, html) => {
  const e = document.createElement(tag); if (cls) e.className = cls;
  if (css) Object.assign(e.style, css); if (html != null) e.innerHTML = html; (parent || stage).appendChild(e); return e;
};
const px = (n) => n + 'px';
const U = [];                                    // per-frame updaters (pure functions of t + world anchors)
const LAY = [];                                  // visibility windows
const layer = (name, a, bEnd, css = {}) => { const e = mk('div', 'layer ' + name, css); LAY.push([e, a, bEnd]); return e; };
const lines = (parent, txt, css, cls = 'disp') => {   // a masked line of words
  const ln = mk('div', cls + ' abs ln', css, parent);
  const ws = txt.split(' ').map((w, i) => { const m = mk('span', 'wm', null, ln); return mk('span', 'w', null, m, w); });
  return { ln, ws };
};

await document.fonts.load('700 100px Disp'); await document.fonts.load('600 100px Disp');
await document.fonts.load('400 30px Mono'); await document.fonts.load('400 30px Body');
await document.fonts.ready;

const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
const PRICE_TRUE = '$2,682.70', PRICE_FALSE = '$2,146.58';

// ───────── layers, bottom → top ─────────
const worldL = layer('world', b(10) - 0.01, b(21) + 0.001);
const worldL2 = { a: b(36), b: b(49) + 0.001 };          // second world window (S8–S9)
const cv = mk('canvas', 'gl', null, worldL);
const world = await createWorld(cv, W, H, V);
const s1 = layer('s1', 0, b(7));
const s2 = layer('s2', b(6), b(11), { background: '#f8f8f8' });
const card = layer('card', b(6), b(21));
const s3o = layer('s3o', b(10), b(21));          // HTML overlays on the 3D (S3–S4)
const s5 = layer('s5', b(20), b(25), { background: '#ddff46' });
const s6 = layer('s6', b(24), b(32), { background: '#191919' });
const s7 = layer('s7', b(30.5), b(37), { background: '#191919' });
const s8o = layer('s8o', b(36), b(49));
const s10 = layer('s10', b(49), b(54) + 0.001, { background: '#405bff' });
const s11 = layer('s11', b(52.5), DUR + 1, { background: '#191919' });
const top = layer('carry', 0, DUR + 1);
s10.style.zIndex = 2; s11.style.zIndex = 1; top.style.zIndex = 3;           // carried objects ride above everything
LAY.push([worldL, 0, 0]);                         // world visibility handled explicitly below
const worldOn = (t) => (t >= b(10) - 0.01 && t < b(21) + 0.001) || (t >= worldL2.a && t < worldL2.b);

// ════════ S1 · 0 → b7 · macro type: the price, then the false price ════════
const s1g = mk('div', 'abs', { left: px(P.s1.x), top: px(P.s1.y) }, s1);
const lab1 = mk('div', 'mono abs', { left: '6px', top: '0px', width: '1400px', height: px(Math.round(P.s1.lab * 1.4)), overflow: 'hidden', fontSize: px(P.s1.lab), color: '#a7a9ac', whiteSpace: 'nowrap', textTransform: 'uppercase' }, s1g);
const labA = mk('div', 'abs', { left: 0, top: 0 }, lab1, 'ETH price · second source · round 16');
const labB = mk('div', 'abs', { left: 0, top: 0, color: '#ff35a2' }, lab1, 'Lantern feed · same round 16');
const capA = lines(s1g, 'Round 16. A second source prints this.', { left: '4px', top: px(P.s1.capY), fontSize: px(P.s1.cap), color: '#f8f8f8', fontWeight: 600 });
const capB = lines(s1g, 'The market’s feed prints this.', { left: '4px', top: px(P.s1.capY), fontSize: px(P.s1.cap), color: '#f8f8f8', fontWeight: 600 });
const strike = mk('div', 'abs', { left: '0px', top: px(P.s1.capY + P.s1.cap * 0.52), height: px(Math.round(P.s1.cap * 0.09)), width: px(capA.ln.offsetWidth + 8), background: '#ff35a2', transformOrigin: '0 50%' }, s1g);
// the carried price (lives in the carry layer from frame 0 until it seats in the S2 slot)
const priceBox = mk('div', 'abs', { left: px(P.s1.x), top: px(P.s1.y + P.s1.lab * 1.9), transformOrigin: '0 0' }, top);
const price = odometer(priceBox, PRICE_TRUE, 'disp');
Object.assign(price.root.style, { fontSize: px(P.s1.price), color: '#f8f8f8', letterSpacing: '-0.04em' });
const ghost = mk('div', 'mono abs', { left: px(P.s1.x + 6), top: px(P.s1.gy), fontSize: px(P.s1.lab), color: '#a7a9ac', whiteSpace: 'nowrap' }, s1,
  'Second source, same round: <span style="color:#f8f8f8">' + PRICE_TRUE + '</span> · 19.98% apart');

gsap.set(labB, { yPercent: 110 }); gsap.set(capB.ws, { yPercent: 110 }); gsap.set(strike, { scaleX: 0 }); gsap.set(ghost, { autoAlpha: 0, y: 20 });
tl.fromTo(s1g, { x: 0 }, { x: -70, duration: b(7), ease: 'sine.inOut' }, 0);
tl.fromTo(priceBox, { x: 0, scale: 1 }, { x: -70, scale: 1.03, duration: b(6), ease: 'sine.inOut' }, 0);
tl.to(strike, { scaleX: 1, duration: 0.34, ease: 'power2.inOut' }, b(2.4));
price.roll(tl, b(3), PRICE_FALSE, { dur: 0.95, stagger: 0.045, dir: -1, ease: 'expo.inOut' });
tl.to(price.root, { color: '#ff35a2', duration: 0.35, ease: 'none' }, b(3) + 0.45);
tl.to(labA, { yPercent: -110, duration: 0.4, ease: 'expo.in' }, b(3) + 0.1);
tl.to(labB, { yPercent: 0, duration: 0.55, ease: 'expo.out' }, b(3) + 0.5);
tl.to(capA.ws, { yPercent: -110, duration: 0.35, ease: 'expo.in', stagger: 0.03 }, b(3.6));
tl.to(strike, { scaleX: 0, transformOrigin: '100% 50%', duration: 0.3, ease: 'expo.in' }, b(3.6));
tl.to(capB.ws, { yPercent: 0, duration: 0.6, ease: 'expo.out', stagger: 0.045 }, b(3.6) + 0.3);
tl.to(ghost, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out' }, b(5));
// exit: everything but the price leaves fast to the left; the price flies to the S2 slot
tl.to([lab1, capB.ln, ghost], { x: -260, autoAlpha: 0, duration: 0.32, ease: 'expo.in', stagger: 0.03 }, b(6) - 0.05);

// ════════ S2 · b7 → b11 · the loan card: the false price closes a loan ════════
const headL = mk('div', 'abs', { left: px(P.s2.hx), top: px(P.s2.hy) }, s2);
const h2 = ['The market', 'liquidates', 'on it.'].map((t, i) => lines(headL, t, { left: 0, top: px(i * P.s2.hs * 1.0), fontSize: px(P.s2.hs), color: '#191919' }));
const C2 = P.s2.card;                              // {x,y,w,h}
const cardEl = mk('div', 'abs', { width: px(C2.w), height: px(C2.h), transformOrigin: '0 0', borderRadius: '28px' }, card);
const cardBg = mk('div', 'abs', { left: 0, top: 0, width: px(C2.w), height: px(C2.h), background: '#ffffff', borderRadius: '28px', boxShadow: '0 0 0 2px #e1e1e1 inset' }, cardEl);
const cardEdge = mk('div', 'abs', { left: 0, top: 0, width: px(C2.w), height: px(C2.h), borderRadius: '28px', boxShadow: '0 0 0 6px #ff35a2 inset', opacity: 0 }, cardEl);
const ci = mk('div', 'abs', { left: 0, top: 0, width: px(C2.w), height: px(C2.h) }, cardEl);   // inner content (fades on warp)
const pad = C2.pad;
mk('div', 'mono abs', { left: px(pad), top: px(pad), fontSize: '26px', color: '#58595b', textTransform: 'uppercase' }, ci, 'Loan · ETH collateral');
const chipBox = mk('div', 'abs', { left: px(C2.w - pad - 300), top: px(pad - 12), height: '50px', width: '300px' }, ci);
const chipOk = mk('div', 'chip abs', { left: 'auto', right: 0, top: 0, fontSize: '26px', background: '#e9f6ee', color: '#18794e' }, chipBox, '● healthy');
const chipBad = mk('div', 'chip abs', { left: 'auto', right: 0, top: 0, fontSize: '26px', background: '#ff35a2', color: '#191919' }, chipBox, '● liquidatable');
mk('div', 'mono abs', { left: px(pad), top: px(C2.slotY - 44), fontSize: '24px', color: '#58595b', textTransform: 'uppercase' }, ci, 'Priced at · Lantern feed · round 16');
// slot: the stamp pill the price lands in (it later rides the 3D bonus slab)
const stamp = mk('div', 'abs', { left: px(pad), top: px(C2.slotY), transformOrigin: '0 0' }, cardEl);
const stampPill = mk('div', 'abs', { left: '-22px', top: '-14px', width: '100%', height: '100%', padding: '14px 22px', boxSizing: 'content-box', background: '#191919', borderRadius: '18px', opacity: 0 }, stamp);
const slot = odometer(stamp, PRICE_FALSE, 'disp');
Object.assign(slot.root.style, { fontSize: px(P.s2.slot), color: '#ff35a2', letterSpacing: '-0.04em', position: 'relative' });
const stampStrike = mk('div', 'abs', { left: '-8px', top: '48%', width: 'calc(100% + 16px)', height: '10px', background: '#ddff46', transformOrigin: '0 50%' }, stamp);
gsap.set(stampStrike, { scaleX: 0 });
// bars
const BX = pad, BW = C2.w - pad * 2, BY = C2.barY, F0 = BW * 0.94, F1 = F0 * (2146.58 / 2682.70), DEBT = F0 * 0.635;
mk('div', 'mono abs', { left: px(BX), top: px(BY - 44), fontSize: '24px', color: '#58595b', textTransform: 'uppercase' }, ci, 'Collateral value');
mk('div', 'abs', { left: px(BX), top: px(BY), width: px(BW), height: '58px', background: '#ececec', borderRadius: '12px' }, ci);
const fill = mk('div', 'abs', { left: px(BX), top: px(BY), width: px(F0), height: '58px', background: '#191919', borderRadius: '12px', transformOrigin: '0 50%' }, ci);
const lim = mk('div', 'abs', { left: px(BX), top: px(BY - 10), width: '4px', height: px(78 + 132), background: '#191919' }, ci);
const limLab = mk('div', 'mono abs', { left: '12px', top: '-34px', fontSize: '22px', color: '#191919', whiteSpace: 'nowrap', textTransform: 'uppercase' }, lim, 'Limit 70%');
mk('div', 'mono abs', { left: px(BX), top: px(BY + 112), fontSize: '24px', color: '#58595b', textTransform: 'uppercase' }, ci, 'Debt');
const debtBar = mk('div', 'abs', { left: px(BX), top: px(BY + 152), width: px(DEBT), height: '58px', background: '#58595b', borderRadius: '12px' }, ci);
const over = mk('div', 'abs', { top: px(BY + 152), height: '58px', background: '#ff35a2', borderRadius: '0 12px 12px 0' }, ci);
const overLab = mk('div', 'mono abs', { left: px(BX + DEBT + 18), top: px(BY + 166), fontSize: '24px', color: '#191919', whiteSpace: 'nowrap', textTransform: 'uppercase' }, ci, 'Debt over limit');
gsap.set(lim, { x: F0 * 0.7 }); gsap.set(over, { left: px(BX + DEBT), width: 0 }); gsap.set([chipBad, overLab], { autoAlpha: 0 });

// the price flight S1 → slot (computed from measured rects, before any transform)
const r1 = price.root.getBoundingClientRect(), r2 = slot.root.getBoundingClientRect();
const sc12 = P.s2.slot / P.s1.price;
const slotX = C2.x + pad, slotY = C2.y + C2.slotY;      // slot's on-screen position before warp
tl.fromTo(priceBox, { x: -70, y: 0, scale: 1.03 }, { x: slotX - r1.left, y: slotY - r1.top + (r2.top - stamp.getBoundingClientRect().top), scale: sc12, duration: b(1.1), ease: 'power3.inOut', immediateRender: false }, b(6));
U.push((t) => { const on = t >= b(7); priceBox.style.opacity = on ? 0 : 1; slot.root.style.opacity = on ? 1 : 0; });
// S2 enters from the bottom while the price is in flight
tl.fromTo(s2, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: b(1), ease: 'expo.inOut', immediateRender: false }, b(6));
tl.fromTo(cardEl, { y: 160 }, { y: 0, duration: b(1), ease: 'expo.out', immediateRender: false }, b(6));
gsap.set(card, { clipPath: 'inset(100% 0% 0% 0%)' });
tl.fromTo(card, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: b(1), ease: 'expo.inOut', immediateRender: false }, b(6));
tl.set(card, { clipPath: 'none' }, b(7.5));
gsap.set(h2.flatMap(l => l.ws), { yPercent: 110 });
tl.fromTo(h2.flatMap(l => l.ws), { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: 'expo.out', stagger: 0.05, immediateRender: false }, b(7.5));
// the result of the price: value falls, the limit slides past the debt, the card flips
tl.to(fill, { scaleX: F1 / F0, duration: 0.6, ease: 'power2.inOut' }, b(7.1));
tl.to(lim, { x: F1 * 0.7, duration: 0.6, ease: 'power2.inOut' }, b(7.1));
tl.to(over, { width: px(DEBT - F1 * 0.7), left: px(BX + F1 * 0.7), duration: 0.6, ease: 'power2.inOut' }, b(7.1));
tl.fromTo(headL, { x: 0 }, { x: 40, duration: b(3), ease: 'none', immediateRender: false }, b(7));
tl.set([over], {}, b(8));
tl.fromTo(chipOk, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -24, duration: 0.18, ease: 'expo.in', immediateRender: false }, b(7.75));
tl.fromTo(chipBad, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'back.out(2)', immediateRender: false }, b(7.75) + 0.12);
tl.to(cardEdge, { opacity: 1, duration: 0.2, ease: 'none' }, b(7.75));
tl.fromTo(overLab, { autoAlpha: 0, x: -14 }, { autoAlpha: 1, x: 0, duration: 0.35, immediateRender: false }, b(8.4));
// exit: headline leaves left, card warps onto the lime slab's top face, background drops away to the 3D
tl.to(h2.flatMap(l => l.ws), { yPercent: -110, duration: 0.3, ease: 'expo.in', stagger: 0.02 }, b(9.6));
tl.to(s2, { backgroundColor: 'rgba(248,248,248,0)', duration: b(1.1), ease: 'power2.in' }, b(9.9));
tl.to([ci, cardBg, cardEdge], { opacity: 0, duration: 0.3, ease: 'power2.in' }, b(10.1));
const warp = { p: 0 };
tl.fromTo(warp, { p: 0 }, { p: 1, duration: b(1.15), ease: 'power3.inOut', immediateRender: false }, b(9.85));
// in card coordinates, the stamp moves to the card centre and grows (it becomes the label on the slab)
const st0 = { x: pad, y: C2.slotY };
const stW = r2.width, stH = r2.height;
tl.fromTo(stamp, { x: 0, y: 0, scale: 1 }, { x: (C2.w - stW * 1.55) / 2 - st0.x, y: (C2.h - stH * 1.55) / 2 - st0.y, scale: 1.55, duration: b(1.1), ease: 'power3.inOut', immediateRender: false }, b(9.85));
tl.to(stampPill, { opacity: 1, duration: 0.3, ease: 'none' }, b(10.1));
const cardQ0 = rectQuad(C2.x, C2.y, C2.w, C2.h);
U.push((t, A) => {
  if (t < b(6) || t >= b(21)) return;
  const q = t < b(9.85) ? cardQ0 : lerpQuad(cardQ0, A.bonusTopQuad, warp.p);
  const push = t < b(9.85) ? Math.max(0, Math.min(1, (t - b(7)) / (b(9.85) - b(7)))) * 0.04 : 0;
  const qq = push ? q.map(([x, y]) => [C2.x + C2.w / 2 + (x - C2.x - C2.w / 2) * (1 + push), C2.y + C2.h / 2 + (y - C2.y - C2.h / 2) * (1 + push)]) : q;
  cardEl.style.transform = homography(C2.w, C2.h, qq) + (t < b(9.85) ? ` translateY(${gsap.getProperty(cardEl, 'y')}px)` : '');
});

// ════════ S3 · b11 → b17 · 3D: the debt settles now, only the profit is held ════════
gsap.set(S, { tx: 2.6, ty: 0.3, tz: 0, r: 14.2, az: -0.42, el: 0.74, fov: 28, debtX: 0, bonusLift: 0, collX: 0, wafer: 0, ring: 1.0, colScale: 1 });
tl.fromTo(S, { az: -0.46, r: 15.6, tx: 2.4 }, { az: -0.32, r: 14.6, tx: 3.6, duration: b(7), ease: 'sine.inOut', immediateRender: false }, b(10));
tl.to(S, { debtX: 1, duration: 0.8, ease: 'power2.inOut' }, b(12));
tl.to(S, { bonusLift: 0.95, duration: 0.85, ease: 'expo.out' }, b(14));
const tag = (parent, html, cls = '') => { const e = mk('div', 'tag ' + cls, null, parent, html); const d = mk('div', 'dot', null, parent); return { e, d }; };
const placeTag = (T, p, dx, dy) => {
  T.d.style.transform = `translate(${p[0]}px,${p[1]}px)`;
  const w = T.w || (T.w = T.e.offsetWidth);
  let x = p[0] + dx; if (x + w > W - 48) x = p[0] - w - Math.abs(dx); x = Math.max(48, Math.min(W - 64 - w, x));
  T.e.style.transform = `translate(${x}px,${p[1] + dy}px)`;
};
const tgT = tag(s3o, 'Debt repaid · <b>settled now ✓</b>');
const tgC = tag(s3o, 'Collateral · held by the market');
const tgB = tag(s3o, 'Bonus · <b>held by Lantern</b>');
const lanes3 = ['Borrower', 'Held', 'Liquidator', 'Market'].map(t => mk('div', 'mono abs', { fontSize: '26px', color: '#d1d3d4', textTransform: 'uppercase', whiteSpace: 'nowrap' }, s3o, t));
const cap3 = mk('div', 'abs', { left: px(P.cap.x), top: px(P.cap.y) }, s3o);
const c3a = lines(cap3, 'The debt is repaid now.', { left: 0, top: 0, fontSize: px(P.cap.s), color: '#f8f8f8', fontWeight: 600 });
const c3b = lines(cap3, 'The profit is held.', { left: 0, top: px(P.cap.s * 1.08), fontSize: px(P.cap.s), color: '#ddff46', fontWeight: 600 });
gsap.set([...c3a.ws, ...c3b.ws], { yPercent: 110 }); gsap.set([tgT.e, tgT.d, tgC.e, tgC.d, tgB.e, tgB.d], { autoAlpha: 0 });
tl.to(c3a.ws, { yPercent: 0, duration: 0.6, ease: 'expo.out', stagger: 0.04 }, b(11.5));
tl.to(c3b.ws, { yPercent: 0, duration: 0.6, ease: 'expo.out', stagger: 0.04 }, b(14.3));
tl.to([tgT.d, tgT.e], { autoAlpha: 1, duration: 0.3, ease: 'expo.out', stagger: 0.06 }, b(13.6));
tl.to([tgB.d, tgB.e], { autoAlpha: 1, duration: 0.3, ease: 'expo.out', stagger: 0.06 }, b(15));
tl.to([tgC.d, tgC.e], { autoAlpha: 1, duration: 0.3, ease: 'expo.out', stagger: 0.06 }, b(15.5));
tl.to([cap3, ...lanes3, tgT.e, tgT.d, tgC.e, tgC.d, tgB.e, tgB.d], { autoAlpha: 0, duration: 0.25, ease: 'power2.in' }, b(16.4));
U.push((t, A) => {
  if (t < b(10) || t >= b(21)) return;
  placeTag(tgT, A.debt, 30, -70); placeTag(tgC, A.coll, -40, 40); placeTag(tgB, A.bonusSide, 36, -80);
  [A.laneL, null, A.laneR, A.laneT].forEach((p, i) => { if (p) lanes3[i].style.transform = `translate(${p[0] - 60}px,${p[1] + 18}px)`; else lanes3[i].style.display = 'none'; });
});

// ════════ S4 · b17 → b21 · macro: five minutes on the clock ════════
tl.to(S, { tx: 0, ty: 2.15, r: 6.6, az: -0.12, el: 0.62, duration: b(1.6), ease: 'power3.inOut' }, b(16.2));
tl.to(S, { r: 5.6, az: 0.02, duration: b(2.4), ease: 'none' }, b(17.8));
const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
svg.setAttribute('width', W); svg.setAttribute('height', H); svg.style.cssText = 'position:absolute;left:0;top:0';
s3o.appendChild(svg);
const ringBg = document.createElementNS(svg.namespaceURI, 'path'); ringBg.setAttribute('fill', 'none'); ringBg.setAttribute('stroke', 'rgba(248,248,248,.18)'); ringBg.setAttribute('stroke-width', '4');
const ringFg = document.createElementNS(svg.namespaceURI, 'path'); ringFg.setAttribute('fill', 'none'); ringFg.setAttribute('stroke', '#f8f8f8'); ringFg.setAttribute('stroke-width', '6'); ringFg.setAttribute('stroke-linecap', 'round');
svg.append(ringBg, ringFg);
const clock = mk('div', 'mono abs', { fontSize: '30px', color: '#f8f8f8', background: 'rgba(25,25,25,.92)', padding: '10px 16px', borderRadius: '10px', whiteSpace: 'nowrap' }, s3o);
const ring = { p: 0, o: 0 };
tl.to(ring, { o: 1, duration: 0.4, ease: 'none' }, b(17));
tl.fromTo(ring, { p: 0 }, { p: 1, duration: b(3), ease: 'power2.inOut', immediateRender: false }, b(17));
tl.to(ring, { o: 0, duration: 0.2, ease: 'none' }, b(20.2));
U.push((t, A) => {
  if (t < b(16) || t >= b(21)) { svg.style.display = 'none'; clock.style.display = 'none'; return; }
  svg.style.display = clock.style.display = '';
  const d = 'M' + A.ringPts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
  ringBg.setAttribute('d', d); ringFg.setAttribute('d', d);
  const len = ringFg.getTotalLength();
  ringFg.setAttribute('stroke-dasharray', `${len} ${len}`); ringFg.setAttribute('stroke-dashoffset', String(len * (1 - ring.p)));
  svg.style.opacity = ring.o; clock.style.opacity = ring.o;
  // the clock counts the real window, compressed: 5:00 → 4:12 across the shot (a visible tick, not a claim)
  clock.innerHTML = `hold window · <span style="color:#ddff46">5:00</span>`;
  const p0 = A.ringPts[48]; clock.style.transform = `translate(${p0[0] - 170}px,${p0[1] + 22}px)`;
});
const five = mk('div', 'disp abs', { left: px(P.s4.fx), top: px(P.s4.fy), fontSize: px(P.s4.fs), color: '#f8f8f8' }, s3o, 'Five');
const mins = mk('div', 'disp abs', { left: px(P.s4.mx), top: px(P.s4.my), fontSize: px(P.s4.fs), color: '#ddff46', transformOrigin: P.s4.mo }, s3o, 'minutes.');
const win = mk('div', 'mono abs', { left: px(P.s4.wx), top: px(P.s4.wy), fontSize: '28px', color: '#f0f0f0', whiteSpace: 'nowrap', textTransform: 'uppercase', background: '#191919', padding: '8px 14px', borderRadius: '8px', zIndex: 2 }, s3o, 'Window open · anyone may challenge');
tl.fromTo(five, { x: -W }, { x: 0, duration: 0.7, ease: 'expo.out', immediateRender: true }, b(17.2));
tl.fromTo(mins, { x: W }, { x: 0, duration: 0.7, ease: 'expo.out', immediateRender: true }, b(17.7));
tl.fromTo(win, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.4, immediateRender: true }, b(18.4));
tl.to([five, win], { x: -W * 0.6, duration: 0.35, ease: 'expo.in' }, b(19.55));
tl.to(mins, { scale: 70, duration: b(1.05), ease: 'expo.in' }, b(19.95));
{ const [ox, oy] = P.s4.mo.split(' ').map(parseFloat);
  const cx = P.s4.mx + mins.offsetWidth * ox / 100, cy = P.s4.my + mins.offsetHeight * oy / 100;
  gsap.set(s5, { clipPath: `circle(0% at ${cx}px ${cy}px)` });
  tl.fromTo(s5, { clipPath: `circle(0% at ${cx}px ${cy}px)` }, { clipPath: `circle(160% at ${cx}px ${cy}px)`, duration: b(1.05), ease: 'expo.in', immediateRender: false }, b(19.95)); }

// ════════ S5 · b21 → b25 · full-frame type on lime ════════
const L5 = P.s5;
const l5 = [lines(s5, 'Anyone can', { left: px(L5.x1), top: px(L5.y[0]), fontSize: px(L5.s), color: '#191919' }),
            lines(s5, 'prove the price', { left: px(L5.x2), top: px(L5.y[1]), fontSize: px(L5.s), color: '#191919' }),
            lines(s5, 'was out of line.', { left: px(L5.x1), top: px(L5.y[2]), fontSize: px(L5.s), color: '#191919' })];
// pink chip after "was false." — the carried price again; flies to the S6 axis
const chip = mk('div', 'abs', { left: px(L5.chipX), top: px(L5.chipY), transformOrigin: '0 0', background: '#191919', borderRadius: '20px', padding: '16px 26px' }, top);
gsap.set(chip, { autoAlpha: 0 });
const chipT = mk('div', 'disp', { fontSize: px(L5.chipS), color: '#ff35a2', letterSpacing: '-0.04em', lineHeight: 1 }, chip, PRICE_FALSE);
gsap.set([l5[0].ln, l5[2].ln], { x: -W }); gsap.set(l5[1].ln, { x: W });
tl.fromTo(l5[0].ln, { x: -W }, { x: 0, duration: 0.75, ease: 'expo.out', immediateRender: false }, b(21) - 0.05);
tl.fromTo(l5[1].ln, { x: W }, { x: 0, duration: 0.75, ease: 'expo.out', immediateRender: false }, b(21.5));
tl.fromTo(l5[2].ln, { x: -W }, { x: 0, duration: 0.75, ease: 'expo.out', immediateRender: false }, b(22));
tl.fromTo(chip, { scale: 0.5, autoAlpha: 0, rotate: -6 }, { scale: 1, autoAlpha: 1, rotate: 0, duration: 0.5, ease: 'back.out(1.8)', immediateRender: false }, b(22.6));
tl.to([l5[0].ln, l5[2].ln], { x: '+=36', duration: b(1.5), ease: 'none' }, b(22.6));
tl.to(l5[1].ln, { x: '-=36', duration: b(1.5), ease: 'none' }, b(22.6)); // keep drifting while it reads
tl.to(l5.map(l => l.ln), { x: -W * 1.3, duration: 0.45, ease: 'expo.in', stagger: 0.04 }, b(24.0));

// ════════ S6 · b25 → b32 · evidence: the gap, measured, against the limit ════════
const A6 = P.s6;     // axis x, top, bottom, label x, bracket x, counter x/y
const yOf = (p) => A6.bot - (p - 2000) / 800 * (A6.bot - A6.top);
const yT = yOf(2682.70), yF = yOf(2146.58), yBand = yOf(2682.70 * 0.95);
const axis = mk('div', 'abs', { left: px(A6.ax), top: px(A6.top), width: '3px', height: px(A6.bot - A6.top), background: '#414042', transformOrigin: '50% 100%' }, s6);
const ticks = [2000, 2200, 2400, 2600, 2800].map(p => {
  const g = mk('div', 'abs', { left: px(A6.ax - 70), top: px(yOf(p) - 14) }, s6);
  mk('div', 'mono', { fontSize: '22px', color: '#a7a9ac', width: '56px', textAlign: 'right' }, g, (p / 1000).toFixed(1) + 'k');
  mk('div', 'abs', { left: '64px', top: '13px', width: '16px', height: '3px', background: '#414042' }, g); return g;
});
const band = mk('div', 'abs', { left: px(A6.ax + 3), top: px(yOf(2682.70 * 1.05) < A6.top ? A6.top : yOf(2682.70 * 1.05)), width: px(A6.bandW), height: px(yBand - Math.max(A6.top, yOf(2682.70 * 1.05))), background: 'rgba(221,255,70,.12)', borderBottom: '3px solid #ddff46', transformOrigin: '0 100%' }, s6);
const bandLab = mk('div', 'mono abs', { right: '16px', bottom: '10px', fontSize: '24px', color: '#ddff46', whiteSpace: 'nowrap', textTransform: 'uppercase' }, band, 'Limit · 5%');
Object.assign(bandLab.style, { left: 'auto', top: 'auto' });
const tickT = mk('div', 'abs', { left: px(A6.ax), top: px(yT - 1.5), width: px(A6.lx - A6.ax - 20), height: '3px', background: '#f8f8f8', transformOrigin: '0 50%' }, s6);
const labT = mk('div', 'abs', { left: px(A6.lx), top: px(yT - A6.ps * 0.62) }, s6);
mk('div', 'disp', { fontSize: px(A6.ps), color: '#f8f8f8', letterSpacing: '-0.04em', lineHeight: 1 }, labT, PRICE_TRUE);
mk('div', 'mono', { fontSize: '24px', color: '#a7a9ac', marginTop: '10px', textTransform: 'uppercase', whiteSpace: 'nowrap' }, labT, 'Second source · round 16');
const tickF = mk('div', 'abs', { left: px(A6.ax), top: px(yF - 1.5), width: px(A6.lx - A6.ax - 20), height: '3px', background: '#ff35a2', transformOrigin: '0 50%' }, s6);
const pillF = mk('div', 'abs', { left: px(A6.lx - 26), top: px(yF - A6.ps * 0.5 - 16), background: '#191919', borderRadius: '20px', padding: '16px 26px', border: '0px' }, s6);
const pillFT = mk('div', 'disp', { fontSize: px(A6.ps), color: '#ff35a2', letterSpacing: '-0.04em', lineHeight: 1 }, pillF, PRICE_FALSE);
const labF = mk('div', 'mono abs', { left: px(A6.lx), top: px(yF + A6.ps * 0.5 + 22), fontSize: '24px', color: '#ff35a2', textTransform: 'uppercase', whiteSpace: 'nowrap' }, s6, 'Lantern feed · round 16');
const brk = mk('div', 'abs', { left: px(A6.bx), top: px(yT), width: '4px', height: px(yF - yT), background: '#f8f8f8', transformOrigin: '50% 0' }, s6);
const brkT = mk('div', 'abs', { left: px(A6.bx - 22), top: px(yT - 2), width: '26px', height: '4px', background: '#f8f8f8' }, s6);
const brkB = mk('div', 'abs', { left: px(A6.bx - 22), top: px(yF - 2), width: '26px', height: '4px', background: '#ff35a2' }, s6);
const cnt = mk('div', 'disp abs', { left: px(A6.cx), top: px(A6.cy), fontSize: px(A6.cs), color: '#f8f8f8', letterSpacing: '-0.05em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', lineHeight: 1 }, s6, '0.00%');
const cntLab = mk('div', 'mono abs', { left: px(A6.cx + 6), top: px(A6.cy + A6.cs * 1.02), fontSize: '26px', color: '#a7a9ac', textTransform: 'uppercase', whiteSpace: 'nowrap' }, s6, 'Apart, same round · limit 5%');
const upheld = mk('div', 'disp abs', { left: px(A6.cx), top: px(A6.uy), fontSize: px(A6.us), color: '#ddff46', transformOrigin: A6.uo, whiteSpace: 'nowrap' }, s6, 'Upheld.');
const upLab = mk('div', 'mono abs', { left: px(A6.cx + 6), top: px(A6.uy + A6.us * 1.0), fontSize: '26px', color: '#f8f8f8', textTransform: 'uppercase', whiteSpace: 'nowrap' }, s6, 'Recomputed by the contract');
const g6 = { p: 0 };
gsap.set(axis, { scaleY: 0 }); gsap.set([ticks, labT, labF, bandLab, cntLab, upheld, upLab], { autoAlpha: 0 }); gsap.set([tickT, tickF, brkT, brkB], { scaleX: 0 }); gsap.set(band, { scaleY: 0 });
tl.fromTo(s6, { clipPath: 'inset(0% 0% 0% 100%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: b(1), ease: 'expo.inOut', immediateRender: false }, b(24));
tl.fromTo(axis, { scaleY: 0 }, { scaleY: 1, duration: 0.6, ease: 'expo.out', immediateRender: false }, b(24.6));
tl.fromTo(ticks, { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0, duration: 0.3, stagger: 0.04, immediateRender: false }, b(24.8));
tl.fromTo(tickT, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'expo.out', immediateRender: false }, b(25));
tl.fromTo(labT, { autoAlpha: 0, x: 30 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: 'expo.out', immediateRender: false }, b(25.2));
tl.fromTo(tickF, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'expo.out', immediateRender: false }, b(25));
tl.fromTo(labF, { autoAlpha: 0, x: 30 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: 'expo.out', immediateRender: false }, b(25.4));
tl.fromTo(band, { scaleY: 0 }, { scaleY: 1, duration: 0.6, ease: 'expo.out', immediateRender: false }, b(26));
tl.fromTo(bandLab, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, immediateRender: false }, b(26.4));
tl.fromTo([brkT], { scaleX: 0 }, { scaleX: 1, duration: 0.25, immediateRender: false }, b(26.5));
tl.fromTo(g6, { p: 0 }, { p: 1, duration: b(2.6), ease: 'power2.inOut', immediateRender: false }, b(26.6));
tl.fromTo(cntLab, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, immediateRender: false }, b(26.6));
tl.fromTo(brkB, { scaleX: 0 }, { scaleX: 1, duration: 0.25, ease: 'back.out(2)', immediateRender: false }, b(29.2));
tl.fromTo(upheld, { scale: 1.5, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.3, ease: 'expo.out', immediateRender: false }, b(30));
tl.fromTo(upLab, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.35, immediateRender: false }, b(30.4));
tl.to(s6.children, { y: '-=14', duration: b(5), ease: 'none' }, b(26));   // the board keeps drifting up while it reads
U.push((t) => {
  if (t < b(24) || t >= b(32)) return;
  const pf = 2682.70 - (2682.70 - 2146.58) * g6.p;
  const pct = Math.floor((2682.70 - pf) / 2682.70 * 10000) / 100;
  cnt.textContent = pct.toFixed(2) + '%';
  const y = yOf(pf); brk.style.height = px(Math.max(0, y - yT) * (g6.p > 0 ? 1 : 0));
  const outside = pct > 5;
  brk.style.background = outside ? '#ff35a2' : '#f8f8f8';
  cnt.style.color = outside ? '#ff35a2' : '#f8f8f8';
});
// the chip from S5 lands on the pink price label
const rc = chip.getBoundingClientRect(), rp = pillF.getBoundingClientRect();
tl.fromTo(chip, { x: 0, y: 0, scale: 1 }, { x: rp.left - rc.left, y: rp.top - rc.top, scale: rp.height / rc.height, duration: b(1.2), ease: 'power3.inOut', immediateRender: false }, b(24) - 0.1);
U.push((t) => { const on = t >= b(25); chip.style.display = (t >= b(20) && !on) ? '' : 'none'; pillF.style.opacity = on ? 1 : 0; });
// exit: "Upheld." comes at the camera; the real dashboard opens from its centre
tl.to(upheld, { scale: 9, autoAlpha: 0, duration: b(1), ease: 'expo.in' }, b(31));
tl.to([cnt, cntLab, upLab], { autoAlpha: 0, duration: 0.2 }, b(31));

// ════════ S7 · b32 → b37 · the real dashboard: the verdict, recorded ════════
const img = mk('img', 'abs', { left: 0, top: 0, width: '3200px', height: '2000px', transformOrigin: '0 0' }, s7);
img.src = '../assets/shots/prove.png';
await img.decode();
const D7 = P.s7;     // {s0,s1, x0,x1, y}
const hl = mk('div', 'abs', { left: 0, top: 0, width: '2560px', height: '128px', borderRadius: '14px', boxShadow: '0 0 0 4px #191919', background: 'rgba(221,255,70,.28)', mixBlendMode: 'multiply', transformOrigin: '0 0' }, s7);
const lc = mk('div', 'abs', { left: 0, top: 0, width: '200px', height: '72px', borderRadius: '14px', boxShadow: '0 0 0 5px #ff35a2', transformOrigin: '0 0' }, s7);
const band7 = mk('div', 'abs', { left: 0, top: px(H - D7.bandH), width: px(W), height: px(D7.bandH), background: '#191919' }, s7);
const c7 = lines(band7, 'Recomputed by the contract. Recorded on chain.', { left: px(P.cap.x), top: px(D7.capY), fontSize: px(D7.capS), color: '#f8f8f8', fontWeight: 600, whiteSpace: V ? 'normal' : 'nowrap', width: px(W - 2 * P.cap.x), lineHeight: 1.08 });
const c7m = mk('div', 'mono abs', { left: px(P.cap.x + 4), top: px(D7.capY + D7.capS * (V ? 2.5 : 1.25)), width: px(W - 2 * P.cap.x), whiteSpace: V ? 'normal' : 'nowrap', lineHeight: 1.4, fontSize: '24px', color: '#a7a9ac', textTransform: 'uppercase', whiteSpace: 'nowrap' }, band7, 'Live dashboard · Prove a price · case #45 · Arbitrum Sepolia testnet');
c7m.style.whiteSpace = V ? 'normal' : 'nowrap';
// only the verdicts table header and case #45 are shown (image px: x 535–3110, y 1050–1320)
const CR = { l: 535, r: 3110, t: 1050, b: 1322 };
img.style.clipPath = `inset(${CR.t}px ${3200 - CR.r}px ${2000 - CR.b}px ${CR.l}px round 18px)`;
const midY = (H - D7.bandH) / 2, cy7 = (CR.t + CR.b) / 2, mg7 = V ? 60 : 50;
D7.x0 = mg7 - CR.l * D7.s0; D7.x1 = W - mg7 - CR.r * D7.s1; D7.y0 = midY - cy7 * D7.s0; D7.y1 = midY - cy7 * D7.s1;
const cam7 = { s: D7.s0, x: D7.x0, y: D7.y0 };
gsap.set(c7.ws, { yPercent: 110 }); gsap.set(c7m, { autoAlpha: 0 });
const ur = upheld.getBoundingClientRect(); P.s6.ucx = Math.round(ur.left + ur.width * 0.3); P.s6.ucy = Math.round(ur.top + ur.height / 2);
gsap.set(s7, { clipPath: 'circle(0% at 50% 50%)' }); gsap.set(s2, { clipPath: 'inset(100% 0% 0% 0%)' }); gsap.set(s6, { clipPath: 'inset(0% 0% 0% 100%)' });
tl.fromTo(cam7, { s: D7.s0, x: D7.x0, y: D7.y0 }, { s: D7.s1, x: D7.x1, y: D7.y1, duration: b(5.6), ease: 'power1.inOut', immediateRender: false }, b(31));
tl.fromTo(s7, { clipPath: `circle(0% at ${P.s6.ucx}px ${P.s6.ucy}px)` }, { clipPath: `circle(150% at ${P.s6.ucx}px ${P.s6.ucy}px)`, duration: b(1), ease: 'expo.in', immediateRender: false }, b(31));
const hlp = { a: 0, b: 0 };
tl.fromTo(hlp, { a: 0 }, { a: 1, duration: 0.5, ease: 'expo.out', immediateRender: false }, b(33));
tl.fromTo(hlp, { b: 0 }, { b: 1, duration: 0.45, ease: 'back.out(2)', immediateRender: false }, b(34.5));
tl.fromTo(c7.ws, { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: 'expo.out', stagger: 0.035, immediateRender: false }, b(32.5));
tl.fromTo(c7m, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, immediateRender: false }, b(33.5));
// exit: wipe up from the bottom, the caption band riding the edge, into the 3D world
const wipe7 = { p: 0 };
tl.fromTo(wipe7, { p: 0 }, { p: 1, duration: b(1), ease: 'expo.in', immediateRender: false }, b(36));
U.push((t) => {
  if (t < b(30.5) || t >= b(37)) return;
  const tr = `translate(${cam7.x}px,${cam7.y}px) scale(${cam7.s})`;
  img.style.transform = tr;
  // row #45 spans image y 1212..1312, x 545..3100; the badge is at (2930,1249)
  const rowX = 548, rowY = 1214, rowW = 2552, rowH = 100;
  hl.style.width = px(rowW * hlp.a); hl.style.height = px(rowH);
  hl.style.transform = `translate(${cam7.x + rowX * cam7.s}px,${cam7.y + rowY * cam7.s}px) scale(${cam7.s})`;
  hl.style.opacity = hlp.a;
  lc.style.width = px(176); lc.style.height = px(76);
  lc.style.transform = `translate(${cam7.x + 2914 * cam7.s}px,${cam7.y + 1233 * cam7.s}px) scale(${cam7.s * (1.5 - 0.5 * hlp.b)})`;
  lc.style.opacity = hlp.b;
  const e = H * wipe7.p;
  s7.style.clipPath = t >= b(36) ? `inset(0px 0px ${e}px 0px)` : s7.style.clipPath;
  band7.style.transform = `translateY(${-e}px)`;
});

// ════════ S8 · b37 → b43 · 3D: the borrower is made whole ════════
tl.set(S, { tx: 0.6, ty: 0.3, r: 14.6, az: 0.26, el: 0.74, fov: 28, debtX: 1, bonusLift: 0.95, collX: 0 }, b(35.9));
tl.to(S, { az: 0.12, r: 13.6, tx: 0.2, duration: b(6), ease: 'sine.inOut' }, b(36));
tl.fromTo(stampStrike, { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: 'power2.inOut', immediateRender: false }, b(37.3));
tl.to(S, { bonusLift: 0.0, collX: -3.6, duration: 1.0, ease: 'power3.inOut' }, b(38));
tl.to(S, { debtX: 0, duration: 0.85, ease: 'power2.inOut' }, b(38.6));
tl.to(S, { vx: -0.9, duration: 1.0, ease: 'power3.inOut' }, b(37.6));
tl.to(S, { vx: 0, duration: b(2), ease: 'power3.inOut' }, b(42));
tl.fromTo(S, { vz: 1 }, { vz: 1.5, duration: 1.0, ease: 'power3.inOut', immediateRender: false }, b(37.6));
tl.to(S, { vz: 1, duration: b(2), ease: 'power3.inOut' }, b(42));
const lanes8 = ['Borrower', 'Held', 'Liquidator', 'Market'].map(t => mk('div', 'mono abs', { fontSize: '26px', color: '#d1d3d4', textTransform: 'uppercase', whiteSpace: 'nowrap' }, s8o, t));
const tg8a = tag(s8o, 'Collateral + bonus → <b>borrower</b>');
const tg8b = tag(s8o, 'Repayment → <b>refunded</b>');
const tg8c = tag(s8o, 'Price contradicted');
const cap8 = mk('div', 'abs', { left: px(P.cap.x), top: px(P.cap.y) }, s8o);
const c8 = lines(cap8, 'The borrower is made whole.', { left: 0, top: 0, fontSize: px(P.cap.s), color: '#f8f8f8', fontWeight: 600 });
const c8b = mk('div', 'mono abs', { left: '4px', top: px(P.cap.s * 1.2), fontSize: '26px', color: '#e6e6e6', textTransform: 'uppercase', whiteSpace: 'nowrap', background: '#191919', padding: '6px 10px', borderRadius: '6px' }, cap8, 'Liquidator’s repayment refunded · it loses only the bonus');
gsap.set([tg8a.e, tg8a.d, tg8b.e, tg8b.d, tg8c.e, tg8c.d, c8b, ...lanes8], { autoAlpha: 0 });
tl.to(lanes8, { autoAlpha: 1, duration: 0.3, stagger: 0.05 }, b(37.2)); gsap.set(c8.ws, { yPercent: 110 });
tl.to([tg8c.d, tg8c.e], { autoAlpha: 1, duration: 0.3, stagger: 0.05 }, b(37.4));
tl.to([tg8c.d, tg8c.e], { autoAlpha: 0, duration: 0.2 }, b(38.2));
tl.to(c8.ws, { yPercent: 0, duration: 0.6, ease: 'expo.out', stagger: 0.04 }, b(38));
tl.to([tg8a.d, tg8a.e], { autoAlpha: 1, duration: 0.3, stagger: 0.05 }, b(40));
tl.to([tg8b.d, tg8b.e], { autoAlpha: 1, duration: 0.3, stagger: 0.05 }, b(40.5));
tl.to(c8b, { autoAlpha: 1, duration: 0.2 }, b(40.6));
tl.to([cap8, tg8a.e, tg8a.d, tg8b.e, tg8b.d, ...lanes8], { autoAlpha: 0, duration: 0.25, ease: 'power2.in' }, b(42.2));
U.push((t, A) => {
  if (t < b(36) || t >= b(43.5)) return;
  placeTag(tg8a, A.coll, -60, 50); placeTag(tg8b, A.debt, 20, -76); placeTag(tg8c, A.bonusSide, 30, -84);
  [A.laneL, null, A.laneR, V ? null : A.laneT].forEach((p, i) => { if (p) { const lw = lanes8[i].offsetWidth; lanes8[i].style.transform = `translate(${Math.max(48, Math.min(W - 48 - lw, p[0] - 60))}px,${p[1] + 18}px)`; } else lanes8[i].style.display = 'none'; });
});
// the stamp keeps riding the bonus slab through S8 until the pan
tl.to(cardEl, { opacity: 0, duration: 0.3 }, b(41.8));
U.push((t, A) => { if (t >= b(36) && t < b(43)) cardEl.style.transform = homography(C2.w, C2.h, A.bonusTopQuad); });

// ════════ S9 · b43 → b49 · 3D: the liar's bond pays the prover ════════
tl.to(S, { tx: 13.9, ty: 1.15, r: 8.6, az: -0.36, el: 0.6, duration: b(2), ease: 'power3.inOut' }, b(42));
tl.to(S, { az: -0.2, r: 7.9, duration: b(5), ease: 'sine.in' }, b(44));
tl.to(S, { wafer: 1, duration: 0.95, ease: 'power3.inOut' }, b(44.3));
const ringSteps = [1.2, 1.4, 1.6];
ringSteps.forEach((v, i) => tl.to(S, { ring: v, duration: 0.32, ease: 'back.out(1.6)' }, b(46 + i * 0.75)));
const cap9 = mk('div', 'abs', { left: px(P.cap.x), top: px(P.cap.y) }, s8o);
const c9a = lines(cap9, 'The feed’s bond pays the prover.', { left: 0, top: 0, fontSize: px(P.cap.s), color: '#f8f8f8', fontWeight: 600 });
const c9b = lines(cap9, 'Each caught print: +20% bond.', { left: 0, top: px(P.cap.s * 1.08), fontSize: px(P.cap.s), color: '#ddff46', fontWeight: 600 });
const tgW = tag(s8o, 'Bounty · <b>20% of the held bonus</b> → prover');
const tgR = tag(s8o, 'Required bond');
const tgC9 = tag(s8o, 'Feed’s bond');
const caught = mk('div', 'mono abs', { fontSize: '30px', color: '#191919', background: '#ff35a2', padding: '10px 16px', borderRadius: '10px', whiteSpace: 'nowrap' }, s8o);
gsap.set([...c9a.ws, ...c9b.ws], { yPercent: 110 }); gsap.set([tgW.e, tgW.d, tgR.e, tgR.d, tgC9.e, tgC9.d, caught], { autoAlpha: 0 });
tl.to(c9a.ws, { yPercent: 0, duration: 0.6, ease: 'expo.out', stagger: 0.04 }, b(43.3));
tl.to([tgC9.d, tgC9.e], { autoAlpha: 1, duration: 0.3, stagger: 0.05 }, b(43.6));
tl.to([tgW.d, tgW.e], { autoAlpha: 1, duration: 0.3, stagger: 0.05 }, b(44.8));
tl.to(c9b.ws, { yPercent: 0, duration: 0.6, ease: 'expo.out', stagger: 0.04 }, b(45.6));
tl.to([tgR.d, tgR.e, caught], { autoAlpha: 1, duration: 0.3, stagger: 0.05 }, b(45.8));
tl.to([cap9, tgW.e, tgW.d, tgR.e, tgR.d, tgC9.e, tgC9.d, caught], { autoAlpha: 0, duration: 0.2, ease: 'power2.in' }, b(48.3));
U.push((t, A) => {
  if (t < b(42) || t >= b(49)) return;
  placeTag(tgW, A.wafer, 24, -70); placeTag(tgC9, A.col, -270, -20); placeTag(tgR, A.ring, 26, -24);
  const k = S.ring < 1.1 ? 0 : S.ring < 1.3 ? 1 : S.ring < 1.5 ? 2 : 3;
  tgR.e.innerHTML = `Required bond · <b>${S.ring.toFixed(1)}× minimum</b>`;
  caught.textContent = `caught ${k}×`;
  caught.style.transform = `translate(${A.ring[0] + 26}px,${A.ring[1] + 34}px)`;
});
// exit: the column becomes the blue field
const blue = mk('div', 'abs', { left: 0, top: 0, background: '#405bff', borderRadius: '24px' }, s8o);
const bf = { p: 0 };
tl.fromTo(bf, { p: 0 }, { p: 1, duration: b(1), ease: 'power3.in', immediateRender: false }, b(48));
U.push((t, A) => {
  if (t < b(48) || t >= b(49.5)) { blue.style.display = 'none'; return; }
  blue.style.display = '';
  const [x0, y0, x1, y1] = A.colRect, p = bf.p;
  const L = x0 * (1 - p), T = y0 * (1 - p), R = x1 + (W - x1) * p, Bt = y1 + (H - y1) * p;
  Object.assign(blue.style, { left: px(L), top: px(T), width: px(R - L), height: px(Bt - T), borderRadius: px(18 * (1 - p)), opacity: Math.min(1, p * 6) });
});

// ════════ S10 · b49 → b54 · trust model on blue ════════
const T10 = P.s10;
const l10 = ['No committee.', 'No admin key.', 'No price set by hand.'].map((t, i) => lines(s10, t, { left: px(T10.x), top: px(T10.y[i]), fontSize: px(T10.s), color: '#f8f8f8' }));
const m10 = mk('div', 'mono abs', { left: px(T10.x + 6), top: px(T10.my), fontSize: px(T10.ms), color: '#f8f8f8', whiteSpace: T10.wrap ? 'normal' : 'nowrap', width: T10.wrap ? px(W - T10.x * 2) : 'auto', textTransform: 'uppercase' }, s10, '648 tests · 15 invariants · 6 contracts, exact source match');
gsap.set(l10.flatMap(l => l.ws), { yPercent: 110 }); gsap.set(m10, { autoAlpha: 0 });
l10.forEach((l, i) => tl.fromTo(l.ws, { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: 'expo.out', stagger: 0.05, immediateRender: false }, b(49 + i * 0.85) + 0.02));
tl.fromTo(m10, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.4, immediateRender: false }, b(51.5));
tl.to(l10.map(l => l.ln), { x: 70, duration: b(4), ease: 'power1.in' }, b(49.5));
tl.fromTo(m10, { x: 0 }, { x: -40, duration: b(2.5), ease: 'power1.in', immediateRender: false }, b(51.5));
tl.to([...l10.map(l => l.ln), m10], { yPercent: -60, autoAlpha: 0, duration: 0.3, ease: 'expo.in', stagger: 0.03 }, b(53.1));
tl.fromTo(s10, { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: T10.clipTo, duration: b(1), ease: 'expo.in', immediateRender: false }, b(53));

// ════════ S11 · b54 → end · the ask ════════
const E = P.s11;
const g11 = mk('div', 'abs', { left: 0, top: 0, width: px(W), height: px(H), transformOrigin: E.origin }, s11);
const wm = mk('div', 'disp abs', { left: px(E.x), top: px(E.wy), fontSize: px(E.ws), color: '#f8f8f8', letterSpacing: '-0.04em' }, g11, 'Lantern');
const t11a = lines(g11, 'Hold the bonus.', { left: px(E.x), top: px(E.ty), fontSize: px(E.ts), color: '#f8f8f8' });
const t11b = lines(g11, 'Prove the price.', { left: px(E.x), top: px(E.ty + E.ts * 1.0), fontSize: px(E.ts), color: '#ddff46' });
const ask = mk('div', 'mono abs', { left: px(E.x + 4), top: px(E.ay), fontSize: '28px', color: '#a7a9ac', textTransform: 'uppercase', whiteSpace: 'nowrap' }, g11, 'Run a case yourself');
const pill = mk('div', 'abs', { left: px(E.x), top: px(E.ay + 50), background: '#ddff46', color: '#191919', borderRadius: '18px', padding: E.pp, fontFamily: 'Disp', fontWeight: 600, fontSize: px(E.us), letterSpacing: '-0.02em', whiteSpace: 'nowrap', transformOrigin: '0 50%' }, g11, 'friendly-fennec-31.convex.site/dashboard');
const foot = mk('div', 'mono abs', { left: px(E.x + 4), top: px(E.fy), fontSize: '24px', color: '#a7a9ac', textTransform: 'uppercase', whiteSpace: 'nowrap' }, g11, 'Live on Arbitrum Sepolia · testnet · no real funds');
// the held bonus, once more: a lime slab outline that settles back into place on the right
const mark = mk('div', 'abs', { left: px(E.mx), top: px(E.my), width: px(E.mw), height: px(E.mh), borderRadius: '28px', background: '#ddff46', transformOrigin: '50% 100%' }, g11);
const markP = mk('div', 'abs', { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', background: '#191919', borderRadius: '16px', padding: '12px 20px', whiteSpace: 'nowrap' }, mark);
mk('div', 'disp', { fontSize: px(E.mps), color: '#ff35a2', letterSpacing: '-0.04em', lineHeight: 1, textDecoration: 'line-through', textDecorationColor: '#ddff46', textDecorationThickness: '6px' }, markP, PRICE_FALSE);
gsap.set([wm, mark, ask, pill, foot], { autoAlpha: 0 }); gsap.set([...t11a.ws, ...t11b.ws], { yPercent: 110 });
tl.fromTo(wm, { autoAlpha: 0, scale: 0.92, transformOrigin: '0 50%' }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'expo.out', immediateRender: false }, b(52.9));
tl.fromTo([...t11a.ws, ...t11b.ws], { yPercent: 110 }, { yPercent: 0, duration: 0.65, ease: 'expo.out', stagger: 0.06, immediateRender: false }, b(53.1));
tl.fromTo(mark, { y: -E.mh * 0.4, rotate: E.mr, autoAlpha: 0 }, { y: 0, rotate: 0, autoAlpha: 1, duration: 0.9, ease: 'expo.out', immediateRender: false }, b(54.2));
tl.fromTo(ask, { autoAlpha: 0, x: -20 }, { autoAlpha: 1, x: 0, duration: 0.4, immediateRender: false }, b(55.6));
tl.fromTo(pill, { scaleX: 0.2, autoAlpha: 0 }, { scaleX: 1, autoAlpha: 1, duration: 0.55, ease: 'expo.out', immediateRender: false }, b(56));
tl.fromTo(foot, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, immediateRender: false }, b(56.6));
tl.fromTo(g11, { scale: 1 }, { scale: 1.035, duration: DUR - b(53.6), ease: 'none', immediateRender: false }, b(53.6));
tl.fromTo(mark, { rotate: 0 }, { rotate: E.mr2, duration: DUR - b(56), ease: 'sine.inOut', immediateRender: false }, b(56));
tl.set({}, {}, DUR);

// ───────── seek ─────────
const ALL = [...LAY.filter(l => l[0] !== worldL && l[0] !== card && l[0] !== s5)];
tl.seek(DUR, false); tl.seek(0, false);            // prime: record every tween's start values in order
window.seek = (t) => {
  tl.seek(t, false);
  for (const [e, a, z] of ALL) e.style.visibility = (t >= a && t < z) ? 'visible' : 'hidden';
  const won = worldOn(t);
  worldL.style.visibility = won ? 'visible' : 'hidden';
  card.style.visibility = ((t >= b(6) && t < b(21)) || (t >= b(36) && t < b(43))) ? 'visible' : 'hidden';
  s5.style.visibility = (t >= b(19.95) && t < b(25)) ? 'visible' : 'hidden';
  const A = won ? world.render() : world.pose();
  for (const f of U) f(t, A);
  return true;
};
window.__dur = DUR;
window.seek(Number(Q.get('t') || 0));
window.__ready = Promise.resolve(true);
