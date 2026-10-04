// Every pixel position used by the film, per format. Handoffs are computed from these at runtime.
export function layout(V, W, H) {
  if (!V) return {
    s1: { x: 150, y: 230, lab: 30, price: 300, capY: 470, cap: 70, capW: 900, gy: 860 },
    s2: { hx: 150, hy: 300, hs: 104, slot: 130,
          card: { x: 800, y: 140, w: 970, h: 800, pad: 64, slotY: 210, barY: 490 } },
    cap: { x: 120, y: 92, s: 64 },
    s4: { fx: 120, fy: 96, fs: 230, mx: 690, my: 96, mo: '41% 58%', wx: 128, wy: 350 },
    s5: { x1: 150, x2: 290, y: [150, 360, 570], s: 176, chipX: 1240, chipY: 815, chipS: 104 },
    s6: { ax: 260, top: 140, bot: 940, lx: 400, ps: 96, bandW: 800, bx: 1090, cx: 1180, cy: 290, cs: 180, uy: 640, us: 190, uo: '30% 50%' },
    s7: { s0: 0.6, s1: 0.71, bandH: 250, capY: 58, capS: 60 },
    s10: { x: 150, y: [200, 380, 560], s: 150, my: 830, ms: 30, wrap: false, clipTo: 'inset(0% 0% 100% 0%)' },
    s11: { x: 150, wy: 150, ws: 64, ty: 330, ts: 150, ay: 700, us: 54, pp: '18px 30px', fy: 910,
           mx: 1300, my: 300, mw: 470, mh: 380, mps: 66, mr: -8, mr2: -2, origin: '30% 50%' },
  };
  // 9:16 — reflowed, not cropped
  return {
    s1: { x: 70, y: 620, lab: 24, price: 172, capY: 300, cap: 50, capW: 800, gy: 1030 },
    s2: { hx: 80, hy: 150, hs: 104, slot: 120,
          card: { x: 60, y: 560, w: 960, h: 980, pad: 60, slotY: 210, barY: 520 } },
    cap: { x: 80, y: 150, s: 60 },
    s4: { fx: 80, fy: 180, fs: 200, mx: 80, my: 380, mo: '20% 58%', wx: 86, wy: 620 },
    s5: { x1: 64, x2: 64, y: [440, 590, 740], s: 100, chipX: 80, chipY: 990, chipS: 110 },
    s6: { ax: 160, top: 240, bot: 1240, lx: 290, ps: 84, bandW: 560, bx: 900, cx: 80, cy: 1400, cs: 150, uy: 1580, us: 150, uo: '30% 50%' },
    s7: { s0: 0.88, s1: 1.05, bandH: 560, capY: 70, capS: 58 },
    s10: { x: 70, y: [560, 700, 840], s: 96, my: 1260, ms: 28, wrap: true, clipTo: 'inset(0% 0% 100% 0%)' },
    s11: { x: 80, wy: 200, ws: 60, ty: 380, ts: 116, ay: 1150, us: 40, pp: '18px 24px', fy: 1700,
           mx: 80, my: 720, mw: 520, mh: 330, mps: 60, mr: -8, mr2: -2, origin: '30% 50%' },
  };
}
