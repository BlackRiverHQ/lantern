// The scale is carried per amount, never assumed: the settlement asset is six decimals and the
// collateral is eighteen, and a formatter with the wrong scale prints real money as 0.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { fx, hold, usd, weth, pct, absBps, num } = require(join(here, "..", ".test-build", "format.js"));

let pass = 0;
let fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log("FAIL", msg); } };

// six-decimal asset
ok(hold(120000n) === "0.12 HOLD", "hold(120000n) -> " + hold(120000n));
ok(hold(100000n) === "0.1 HOLD", "hold(100000n) -> " + hold(100000n));
ok(usd(2675680000n) === "$2,675.68", "usd -> " + usd(2675680000n));
// money keeps its cent whether or not the cent is a zero, so two quotes of one asset read alike
ok(usd(2225300000n) === "$2,225.30", "usd dropped the cent -> " + usd(2225300000n));
ok(usd(2225000000n) === "$2,225.00", "usd on a whole dollar -> " + usd(2225000000n));

// eighteen-decimal collateral, and the trap: rendering it at the asset's scale would print 0
ok(weth(50000000000000n) === "0.00005 WETH", "weth -> " + weth(50000000000000n));
ok(fx(50000000000000n, 6, 4) === "50,000,000", "the six-decimal scale on a wei amount is a different number");
ok(weth(0n) === "0 WETH", "weth(0) -> " + weth(0n));

ok(pct(500n) === "5%", "pct(500) -> " + pct(500n));
ok(pct(1654n) === "16.54%", "pct(1654) -> " + pct(1654n));
ok(absBps(820000000n, 980000000n) === 1632n, "absBps -> " + absBps(820000000n, 980000000n));
ok(absBps(1n, 0n) === 0n, "absBps against zero must not divide");
ok(num(9007199254740993n) === "9,007,199,254,740,993", "num lost precision: " + num(9007199254740993n));
ok(fx(0n, 6, 4) === "0", "fx(0) -> " + fx(0n, 6, 4));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
