// Projective helpers: map an element's flat rect onto any screen quad (CSS matrix3d).
// quad = [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] clockwise from top-left.
function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let m = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
    for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
  return x;
}
export function homography(w, h, quad) {
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = quad[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const [a, bb, c, d, e, f, g, hh] = solve(A, b);
  // column-major matrix3d
  return `matrix3d(${a},${d},0,${g},${bb},${e},0,${hh},0,0,1,0,${c},${f},0,1)`;
}
export const lerpQuad = (q0, q1, t) => q0.map((p, i) => [p[0] + (q1[i][0] - p[0]) * t, p[1] + (q1[i][1] - p[1]) * t]);
export const rectQuad = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
