#!/usr/bin/env node
/* wallet-e2e — drive the live dashboard with a real injected wallet.

   Reading the DOM proves the surface; only a signature proves the product. A headless browser cannot
   drive a wallet extension, so window.ethereum is injected as an init script - it has to exist before
   the app's first render or the page draws its no-wallet state - and every request is bridged to this
   process. The injected script holds nothing secret: the key is read from the account file here, at
   run time, and is never printed, logged or written anywhere.

   The bridge preflights eth_sendTransaction the way a wallet's gas estimation does, so a call that is
   certain to revert reaches the page as an error instead of being broadcast.

   Playwright is not a dependency of the site. Point PLAYWRIGHT_DIR at a folder that contains it:

     PLAYWRIGHT_DIR=~/.npm/_npx/<hash>/node_modules node scripts/wallet-e2e.cjs --page prove --dry
     node scripts/wallet-e2e.cjs --page prove --case 42
     node scripts/wallet-e2e.cjs --page feeds --feed "a name of my own"

   --dry connects and reports what the page offers without sending anything. SITE and ACCOUNT_FILE
   default to the live deployment and ~/.lantern-deployer.json.
*/

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");

const DEV = { rpc: "https://sepolia-rollup.arbitrum.io/rpc", chainId: 421614 };

function playwright() {
  const roots = [process.env.PLAYWRIGHT_DIR, join(__dirname, "..", "node_modules")].filter(Boolean);
  for (const r of roots) {
    try {
      return require(require("node:path").join(r, "playwright"));
    } catch {}
  }
  try {
    return require("playwright");
  } catch {}
  throw new Error("playwright not found - set PLAYWRIGHT_DIR to the node_modules folder that holds it");
}

const SITE = process.env.SITE || "https://friendly-fennec-31.convex.site";
const ACCOUNT_FILE = process.env.ACCOUNT_FILE || join(process.env.HOME, ".lantern-deployer.json");

const account = (() => {
  const raw = JSON.parse(readFileSync(ACCOUNT_FILE, "utf8"));
  const a = Array.isArray(raw) ? raw[0] : raw;
  return {
    pk: a.private_key.startsWith("0x") ? a.private_key : "0x" + a.private_key,
    addr: a.address.toLowerCase(),
  };
})();

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf("--" + name); return i >= 0 ? argv[i + 1] : dflt; };
const PAGE = opt("page", "prove");
const CASE_ID = opt("case", "");
const FEED_NAME = opt("feed", "my feed");
const DRY = argv.includes("--dry");

const sent = [];

async function raw(method, params) {
  const res = await fetch(DEV.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json();
}

async function bridge(method, params) {
  params = params || [];
  if (method === "eth_accounts" || method === "eth_requestAccounts") return [account.addr];
  if (method === "eth_chainId") return "0x" + DEV.chainId.toString(16);
  if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;

  if (method === "eth_sendTransaction") {
    const t = params[0];
    const pre = await raw("eth_call", [
      { from: t.from || account.addr, to: t.to, data: t.data, value: t.value || "0x0" },
      "latest",
    ]);
    if (pre.error) {
      console.log("  preflight reverted: " + String(pre.error.message || "").slice(0, 160));
      throw new Error(pre.error.message || "reverted");
    }
    if (DRY) {
      console.log("  dry: would send " + String(t.data || "").slice(0, 10) + " to " + t.to);
      sent.push("dry");
      return "0x" + "0".repeat(64);
    }
    const args = ["send", "--rpc-url", DEV.rpc, "--private-key", account.pk, "--async", t.to, "--data", t.data];
    if (t.value && t.value !== "0x0") args.push("--value", t.value);
    const out = execFileSync("cast", args, { encoding: "utf8" });
    const hash = (out.match(/0x[0-9a-f]{64}/i) || [""])[0];
    sent.push(hash);
    console.log("  sent " + hash + "  " + String(t.data || "").slice(0, 10));
    return hash;
  }

  const j = await raw(method, params);
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return j.result;
}

/* Exists before any page code runs, so the app's first render sees a wallet. */
const SHIM = `(function () {
  if (window.ethereum) return;
  var listeners = {};
  var provider = {
    isMetaMask: true,
    on: function (ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); },
    removeListener: function () {},
    request: function (a) { return window.__rpcBridge(a.method, a.params || []); },
    send: function (m, p) { if (typeof m === "string") return window.__rpcBridge(m, p || []); },
    enable: function () { return window.__rpcBridge("eth_requestAccounts", []); }
  };
  window.ethereum = provider;
  window.web3 = { currentProvider: provider };
})();`;

async function connect(page) {
  const btn = page.getByRole("button", { name: /connect wallet/i }).first();
  await btn.waitFor({ state: "visible", timeout: 30000 });
  await btn.click();
  await page.waitForFunction(
    () => ![...document.querySelectorAll("button")].some((b) => /connect wallet/i.test(b.textContent || "")),
    null,
    { timeout: 30000 },
  );
  console.log("  connected");
}

async function clickAndReport(page, re, label) {
  const btn = page.getByRole("button", { name: re }).first();
  try {
    await btn.waitFor({ state: "visible", timeout: DRY ? 15000 : 60000 });
  } catch {
    console.log("  " + label + ": not offered on this page/state");
    if (DRY) return;
    throw new Error(label + " was never offered");
  }
  const disabled = await btn.isDisabled();
  console.log("  " + label + ": visible, disabled=" + disabled);
  if (DRY) { console.log("  dry run: not clicking"); return; }
  if (disabled) throw new Error(label + " is disabled; the page would not send it");
  await btn.click();
  const before = sent.length;
  for (let i = 0; i < 120 && sent.length === before; i++) await page.waitForTimeout(1000);
  if (sent.length === before) throw new Error(label + " produced no transaction");
}

(async () => {
  const browser = await playwright().chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.exposeFunction("__rpcBridge", bridge);
  await ctx.addInitScript(SHIM);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror: " + String(e.message).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") console.log("  console.error: " + m.text().slice(0, 200)); });
  page.on("response", (r) => { if (r.status() >= 400) console.log("  HTTP " + r.status() + " " + r.url()); });

  const url = SITE + (PAGE === "feeds" ? "/dashboard/feeds/" : "/dashboard/prove/");
  console.log("page " + url + (DRY ? "  (dry)" : ""));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  console.log("  injected provider present at load: " + (await page.evaluate(() => typeof window.ethereum !== "undefined")));

  await connect(page);

  if (PAGE === "prove") {
    if (CASE_ID) {
      await page.waitForFunction((id) => document.body.innerText.includes("#" + id), CASE_ID, { timeout: 90000 });
      console.log("  row #" + CASE_ID + " is on the page");
    }
    await clickAndReport(page, /^Stake /, "Stake");
  } else {
    await page.getByPlaceholder(/a short name for your feed/i).fill(FEED_NAME);
    await clickAndReport(page, /^Register the feed$/i, "Register the feed");
    await page.waitForTimeout(6000);
    await clickAndReport(page, /^Deposit /i, "Deposit the shortfall");
    await page.waitForTimeout(6000);
    await clickAndReport(page, /^Declare 0x/i, "Declare the second source");
  }

  console.log("hashes sent: " + (sent.length ? sent.join(" ") : "none"));
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.log("FAILED: " + (e.message || e));
  process.exit(1);
});
