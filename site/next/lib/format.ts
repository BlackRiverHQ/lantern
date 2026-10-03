/* format.ts — every number on the surface is rendered through one of these. The scale is always
   carried in, never assumed: the settlement asset is six decimals and the collateral is eighteen,
   and a formatter with the wrong scale prints real money as 0. */

export function fx(v: bigint | number | string, d: number, dp: number): string {
  let b = BigInt(v);
  const neg = b < 0n;
  if (neg) b = -b;
  const E = 10n ** BigInt(d);
  const whole = b / E;
  const frac = (b % E).toString().padStart(d, "0").slice(0, dp).replace(/0+$/, "");
  return (neg ? "\u2212" : "") + whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? "." + frac : "");
}

/** The settlement asset, six decimals. */
export const hold = (v: bigint) => fx(v, 6, 4) + " HOLD";

/** Money is shown to the cent whether or not the cent is a zero: two prices of the same asset quoted
 *  as $2,225.3 and $2,681.27 look like different precisions rather than the same unit. */
export const usd = (v: bigint) => {
  const s = fx(v, 6, 2);
  const [whole, frac = ""] = s.split(".");
  return "$" + whole + "." + frac.padEnd(2, "0");
};

/** The collateral, eighteen decimals — only the leading zeros and three significant digits, which
 *  is what a wrapped-ether position actually looks like. */
export function weth(v: bigint): string {
  const b = BigInt(v);
  if (b === 0n) return "0 WETH";
  const m = /^0\.(0*)(\d+)$/.exec(fx(b, 18, 18));
  return (m ? "0." + m[1] + m[2].slice(0, 3) : fx(b, 18, 5)) + " WETH";
}

export const pct = (bps: bigint | number) => (Number(bps) / 100).toFixed(2).replace(/\.00$/, "") + "%";
export const absBps = (a: bigint, b: bigint) => (b === 0n ? 0n : ((a > b ? a - b : b - a) * 10000n) / b);
export const short = (a: string | null | undefined) => (a ? a.slice(0, 6) + "\u2026" + a.slice(-4) : "\u2014");
export const mmss = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
};

export function ago(sec: number): string {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - sec);
  if (d < 90) return d + "s ago";
  if (d < 5400) return Math.round(d / 60) + "m ago";
  if (d < 129600) return Math.round(d / 3600) + "h ago";
  return Math.round(d / 86400) + "d ago";
}

export const num = (v: bigint | number | string) => {
  try { return BigInt(v).toLocaleString("en-US"); } catch { return String(v); }
};
