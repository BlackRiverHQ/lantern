// Small deterministic helpers. Everything here is a pure function of its inputs.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoother = (x) => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };

export function el(tag, cls, html, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

// Odometer: each character becomes a clipped column. Digits roll through 0-9 to the target.
// Returns { root, roll(tl, at, toString, {dur, stagger, dir}) }.
export function odometer(parent, text, cls = '') {
  const root = el('div', 'odo ' + cls, null, parent);
  const cols = [];
  for (const ch of text) {
    const c = el('span', 'odo-c', null, root);
    if (/\d/.test(ch)) {
      const strip = el('span', 'odo-s', null, c);
      // two full cycles so a roll can travel either way without wrapping visibly
      for (let k = 0; k < 30; k++) el('span', 'odo-d', String(k % 10), strip);
      cols.push({ c, strip, digit: +ch, pos: 10 + +ch });
      gsap.set(strip, { yPercent: -(10 + +ch) * 100 / 30 });
    } else {
      el('span', 'odo-g', ch, c);
      cols.push({ c, glyph: ch });
    }
  }
  function roll(tl, at, to, { dur = 0.9, stagger = 0.05, dir = -1, ease = 'power3.inOut' } = {}) {
    let i = 0, k = 0;
    for (const ch of to) {
      const col = cols[i++];
      if (!col || col.glyph) continue;
      const d = +ch;
      if (d === col.pos % 10) { k++; continue; }   // unchanged digit holds still
      // travel at least one full turn downward (dir -1) for a visible "fall"
      let target = 10 + d;
      if (dir < 0) { if (target >= col.pos) target -= 10; }
      else { if (target <= col.pos) target += 10; }
      tl.fromTo(col.strip, { yPercent: -col.pos * 100 / 30 },
        { yPercent: -target * 100 / 30, duration: dur, ease, immediateRender: false }, at + (k++) * stagger);
      col.pos = target;
    }
  }
  return { root, roll };
}

// Split a string into word spans wrapped in overflow masks (for line reveals).
export function words(parent, text, cls = '') {
  const line = el('div', 'ln ' + cls, null, parent);
  const ws = text.split(' ').map((w) => {
    const m = el('span', 'wm', null, line);
    const s = el('span', 'w', w, m);
    return s;
  });
  return { line, ws };
}
