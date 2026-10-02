/* run.js — one liquidation case, end to end, against the deployed contracts.

   Who does what. A price feed on Lantern only accepts prints from its operator, so the feed's side
   of the case (the real price, the false price, the market's liquidation) is played by the demo
   feed: a small server that holds the operator key and derives every value from the chain. The
   visitor plays the borrower and the prover, from their own wallet: they fund it, open the loan,
   prove the price was false, ask for the verdict and take their collateral back.

   Every number is read from the chain. Every wallet button is a transaction preflighted with
   eth_call before it is signed. A transaction in flight survives a reload. */
(function () {
  'use strict';
  var C = window.LanternConsole;
  var root = document.getElementById('view-run');
  if (!C || !root) return;
  var CFG = C.CFG, W = C.W;
  var O = window.__LANTERN__ || {};
  var RPCS = O.rpcs || [CFG.rpc, 'https://arbitrum-sepolia-rpc.publicnode.com'];
  var FROM = O.fromBlock != null ? O.fromBlock : 315054532;
  var API = O.api || '/api/print';
  var FAUCET = 'https://www.alchemy.com/faucets/arbitrum-sepolia';

  // every selector from `cast sig`; test/run.test.mjs re-derives them
  var SEL = {
    latestRoundData: '0xfeaf968c', reg: '0x738fdd1a', operatorOf: '0x63ea4ab2', bondOf: '0x0fb585ba',
    requiredBond: '0xcd8f9967', priceable: '0x7ea8464f', feedErrors: '0xc4334ab4', minStake: '0x375b3c0a',
    bountyBps: '0x415307cc', escrowOf: '0x2d2a8d9c', challengeOf: '0x2a4ccee5', lastReport: '0xe6efcd98',
    reportAt: '0x50da588b', accountOf: '0x8086b8ba', healthOf: '0xf17e83b4', seizureOf: '0xee939d20',
    closeFactorBps: '0x4654440b', liquidationBonusBps: '0x19970d8e', balanceOf: '0x70a08231',
    claimedAt: '0x8d64422d', cooldown: '0x787a08a6'
  };
  var TOPIC_LIQ = '0x3dc45dc4282f1b79aa977ca44f3966fd1e704e1d7264c8235464dc0b2a15460b'; // LiquidationRecorded

  var BPS = 10000n;
  var TOLERANCE = 500n;                 // CROSS_SOURCE_TOLERANCE_BPS
  var DRIFT = 2000n;                    // MAX_REPORT_DRIFT_BPS
  var NEED_HOLD = 20000n;               // 0.02 HOLD covers the stake with room
  var NEED_WETH = 20000000000000n;      // 0.00002 WETH of collateral
  var WRAP = 50000000000000n;           // wrapped when the wallet holds less than that
  var GAS_ROOM = 20000000000000n;       // ether kept back for gas when wrapping
  var SERVER_PATIENCE = 120000;         // how long a reload waits on a demo-feed step in flight

  /* ---------------------------------------------------------------- formatting */
  function fx(v, d, dp) {
    v = BigInt(v); var neg = v < 0n; if (neg) v = -v;
    var E = 10n ** BigInt(d), w = v / E;
    var f = (v % E).toString().padStart(d, '0').slice(0, dp).replace(/0+$/, '');
    return (neg ? '\u2212' : '') + w.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
  }
  function hold(v) { return fx(v, 6, 4) + ' HOLD'; }
  function usd(v) { return '$' + fx(v, 6, 2); }
  function weth(v) {
    v = BigInt(v); if (v === 0n) return '0 WETH';
    var m = /^0\.(0*)(\d+)$/.exec(fx(v, 18, 18));
    return (m ? '0.' + m[1] + m[2].slice(0, 3) : fx(v, 18, 5)) + ' WETH';
  }
  function pct(bps) { return (Number(bps) / 100).toFixed(2).replace(/\.00$/, '') + '%'; }
  function absBps(a, b) { if (b === 0n) return 0n; return (a > b ? a - b : b - a) * BPS / b; }
  function short(a) { return a ? a.slice(0, 6) + '\u2026' + a.slice(-4) : '\u2014'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mmss(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  /* ---------------------------------------------------------------- plain-language errors */
  var PLAIN = {
    ClaimTooSoon: 'The HOLD faucet allows one claim a minute. Wait a moment and try again.',
    WouldBeUnhealthy: 'That borrow would go over your limit.',
    InsufficientLiquidity: 'The market does not have enough HOLD to lend right now.',
    InsufficientBalance: 'Not enough HOLD in your wallet for this.',
    InsufficientAllowance: 'The token approval did not go through. Try again.',
    PositionIsHealthy: 'Your loan is still healthy at that price, so it cannot be liquidated.',
    NothingToLiquidate: 'There is no loan to liquidate.',
    WindowClosed: 'The five-minute challenge window has closed.',
    WindowOpen: 'The challenge window is still open.',
    ChallengeAlreadyOpen: 'A challenge is already open for this case.',
    StakeBelowMinimum: 'The stake is below the minimum.',
    UnderBonded: 'The feed\u2019s bond is below what it must hold to price a liquidation.',
    FeedCannotPrice: 'The feed\u2019s bond is below what it must hold to price a liquidation.',
    NotSettled: 'There is no verdict for this case yet.',
    AlreadyClaimed: 'This case is already settled.',
    DriftExceeded: 'That price is too far from the last print for one step (the limit is 20%).',
    RoundNotMonotone: 'Another case printed in the meantime. Start a new case.',
    SlotConflict: 'Another case printed in the meantime. Start a new case.',
    LiquidationAlreadySettled: 'This case already has a verdict.',
    InsufficientCollateral: 'You do not have that much collateral posted.',
    ReportTooThin: 'The feed needs a few more prints before it can price a liquidation.'
  };
  function plain(e) {
    var m = (e && (e.message || e.reason)) || String(e || '');
    if (e && e.server) return m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? '' : '.');
    var code = e && (e.code || (e.info && e.info.error && e.info.error.code));
    if (code === 4001 || code === 'ACTION_REJECTED' || /user (rejected|denied)|rejected the request/i.test(m)) return 'You cancelled the transaction in your wallet.';
    if (/insufficient funds/i.test(m)) return 'Not enough test ETH in your wallet to pay for gas.';
    if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Could not reach the network. Check your connection and try again.';
    if (/timeout/i.test(m)) return 'The transaction is taking longer than usual. It may still land, and the page will pick it up.';
    if (/chain ?id|wrong network|does not match the target chain/i.test(m)) return 'Your wallet is on a different network. Switch it to Arbitrum Sepolia.';
    for (var k in PLAIN) if (m.indexOf(k + '(') >= 0 || m.indexOf(k + ' ') >= 0 || m.slice(-k.length) === k) return PLAIN[k];
    return m.length > 180 ? m.slice(0, 180) + '\u2026' : m;
  }

  /* ---------------------------------------------------------------- reads */
  var ri = 0, rid = 1;
  async function rpc(method, params) {
    var last = null;
    for (var t = 0; t < RPCS.length * 2; t++) {
      var j;
      try {
        var r = await fetch(RPCS[ri], { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: rid++, method: method, params: params }) });
        j = await r.json();
      } catch (e) { last = e; ri = (ri + 1) % RPCS.length; continue; }
      if (j.error) throw new Error(j.error.message || 'rpc error');
      return j.result;
    }
    throw last || new Error('no RPC answered');
  }
  function call(to, data) { return rpc('eth_call', [{ to: to, data: data }, 'latest']); }
  function words(hex) {
    hex = String(hex || '0x').slice(2);
    var out = [];
    for (var i = 0; i + 64 <= hex.length; i += 64) out.push(BigInt('0x' + hex.slice(i, i + 64)));
    return out;
  }
  function w32(v) { return BigInt(v).toString(16).padStart(64, '0'); }
  function id32(h) { return h.slice(2).toLowerCase(); }
  function hexAddr(w) { return '0x' + (w || 0n).toString(16).padStart(40, '0'); }
  function first(hex) { return words(hex)[0] || 0n; }
  // Report: value, prevValue, prevBandLo, prevBandHi, round, timestamp, payloadHash, signer, prevSamples, exists
  function report(hex) { var w = words(hex); return { value: w[0] || 0n, round: Number(w[4] || 0n), ts: Number(w[5] || 0n), exists: w[9] === 1n }; }

  /* ---------------------------------------------------------------- the case */
  var KEY = 'lantern.case.v2.' + CFG.chainId + '.' + CFG.lantern.toLowerCase();
  var K = null;
  try { K = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { K = null; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(K)); } catch (e) { } }

  var S = null, REG = null, loadedWall = 0, busy = null, lastErr = '';

  function honestGuess(n) {
    var a = n.subj.exists ? n.subj.value : 0n, v = n.cl;
    if (!a) return v;
    var lo = a * (BPS - DRIFT + 100n) / BPS, hi = a * (BPS + DRIFT - 100n) / BPS;
    return v < lo ? lo : v > hi ? hi : v;
  }
  function derive(n) {
    n = n || S;
    var pH = n.r1 && n.r1.exists ? n.r1.value : honestGuess(n);
    var L = n.r2 && n.r2.exists ? n.r2.value : pH * (BPS - BigInt(K.gap)) / BPS;
    var peerV = n.p2 && n.p2.exists ? n.p2.value : n.cl;
    return { pH: pH, L: L, peerV: peerV, spread: absBps(L, peerV) };
  }
  function limitAtLie(d) {
    if (S.r2.exists && S.hL) return S.hL.limit;
    if (!S.hP || d.pH === 0n) return null;
    return S.hP.limit * d.L / d.pH;
  }
  function chainNow() { return S ? S.now + Math.floor((Date.now() - loadedWall) / 1000) : 0; }

  // reads overlap (the timer, the wallet, an action finishing); only the newest one may land, or
  // an older read that finishes late would put back a state the chain has already left
  var rseq = 0, newest = null;
  function refresh() {
    var my = ++rseq;
    var pr = readChain(my).then(function (landed) { return landed || newest; });
    newest = pr;
    return pr;
  }
  async function readChain(my) {
    if (!REG) REG = hexAddr(first(await call(CFG.lantern, SEL.reg)));
    var me = W.account;
    var r = await Promise.all([
      rpc('eth_getBlockByNumber', ['latest', false]),
      call(CFG.aggregator, SEL.latestRoundData),
      call(REG, SEL.lastReport + id32(CFG.subject)),
      call(REG, SEL.lastReport + id32(CFG.peer)),
      call(CFG.lantern, SEL.bondOf + id32(CFG.subject)),
      call(CFG.lantern, SEL.requiredBond + id32(CFG.subject)),
      call(CFG.lantern, SEL.priceable + id32(CFG.subject)),
      call(CFG.lantern, SEL.feedErrors + id32(CFG.subject)),
      call(CFG.lantern, SEL.minStake),
      call(CFG.lantern, SEL.bountyBps),
      call(CFG.market, SEL.closeFactorBps),
      call(CFG.market, SEL.liquidationBonusBps),
      call(CFG.asset, SEL.balanceOf + C.encAddress(CFG.market)),
      call(CFG.asset, SEL.cooldown)
    ]);
    var n = {};
    n.block = parseInt(r[0].number, 16); n.now = parseInt(r[0].timestamp, 16);
    n.cl = (words(r[1])[1] || 0n) / 100n;               // eight decimals onto the asset's six
    n.subj = report(r[2]); n.peerLast = report(r[3]);
    n.bond = first(r[4]); n.required = first(r[5]); n.priceable = first(r[6]) === 1n; n.errors = first(r[7]);
    n.minStake = first(r[8]); n.bounty = first(r[9]); n.closeBps = first(r[10]); n.bonusBps = first(r[11]);
    n.idle = first(r[12]); n.cooldown = Number(first(r[13]));
    n.eth = 0n; n.hold = 0n; n.weth = 0n; n.acct = { posted: 0n, debt: 0n, supplied: 0n }; n.claimedAt = 0;
    n.hP = n.hL = n.hNow = null;
    if (me) {
      var m = await Promise.all([
        rpc('eth_getBalance', [me, 'latest']),
        call(CFG.asset, SEL.balanceOf + C.encAddress(me)),
        call(CFG.collateral, SEL.balanceOf + C.encAddress(me)),
        call(CFG.market, SEL.accountOf + C.encAddress(me)),
        call(CFG.asset, SEL.claimedAt + C.encAddress(me))
      ]);
      n.eth = BigInt(m[0]); n.hold = first(m[1]); n.weth = first(m[2]);
      var a = words(m[3]); n.acct = { posted: a[0] || 0n, debt: a[1] || 0n, supplied: a[2] || 0n };
      n.claimedAt = Number(first(m[4]));
      if (n.subj.exists) {
        var hn = words(await call(CFG.market, SEL.healthOf + C.encAddress(me) + w32(n.subj.value)));
        n.hNow = { debt: hn[0], limit: hn[1] };
      }
    }
    if (K) {
      var c = await Promise.all([
        call(REG, SEL.reportAt + id32(CFG.subject) + w32(K.r1)),
        call(REG, SEL.reportAt + id32(CFG.subject) + w32(K.r2)),
        call(REG, SEL.reportAt + id32(CFG.peer) + w32(K.r2)),
        call(CFG.lantern, SEL.escrowOf + w32(K.id)),
        call(CFG.lantern, SEL.challengeOf + w32(K.id)),
        call(CFG.market, SEL.seizureOf + w32(K.id))
      ]);
      n.r1 = report(c[0]); n.r2 = report(c[1]); n.p2 = report(c[2]);
      var e = words(c[3]);    // feedId, round, recordedAt, deadline, bonus, liquidator, borrower, outcome, exists
      n.esc = { deadline: Number(e[3] || 0n), bonus: e[4] || 0n, liquidator: hexAddr(e[5]), borrower: hexAddr(e[6]), outcome: Number(e[7] || 0n), exists: e[8] === 1n };
      var h = words(c[4]);    // prover, stake, rule, evidenceHash, resolved, upheld, openedAt
      n.ch = { prover: hexAddr(h[0]), open: (h[0] || 0n) !== 0n, stake: h[1] || 0n, resolved: h[4] === 1n, upheld: h[5] === 1n };
      var z = words(c[5]);    // borrower, liquidator, collateralAmount, repayAmount, state
      n.sz = { borrower: hexAddr(z[0]), collateral: z[2] || 0n, repay: z[3] || 0n, state: Number(z[4] || 0n) };
      if (me) {
        var d = derive(n);
        var hh = await Promise.all([
          call(CFG.market, SEL.healthOf + C.encAddress(me) + w32(d.pH)),
          call(CFG.market, SEL.healthOf + C.encAddress(me) + w32(d.L))
        ]);
        var p = words(hh[0]), l = words(hh[1]);
        n.hP = { debt: p[0], limit: p[1] }; n.hL = { debt: l[0], limit: l[1] };
      }
    }
    if (my !== rseq) return false;     // a newer read is on its way; the caller waits for that one
    S = n; loadedWall = Date.now();
    settlePending();
    render();
    return true;
  }

  async function freshId() {
    var max = 0;
    try {
      var logs = await rpc('eth_getLogs', [{ address: CFG.lantern, topics: [TOPIC_LIQ], fromBlock: '0x' + FROM.toString(16), toBlock: 'latest' }]);
      logs.forEach(function (l) { var v = Number(BigInt(l.topics[1])); if (v > max) max = v; });
    } catch (e) { /* fall through to the probe below */ }
    // a random offset keeps two visitors starting at once from picking the same number
    var id = Math.max(max, 9) + 1 + Math.floor(Math.random() * 50);
    for (var i = 0; i < 20; i++, id++) {
      var e = words(await call(CFG.lantern, SEL.escrowOf + w32(id)));
      var s = words(await call(CFG.market, SEL.seizureOf + w32(id)));
      if (e[8] !== 1n && (s[4] || 0n) === 0n) return id;
    }
    return id;
  }
  async function newCase() {
    if (busy) return;
    busy = 'new'; lastErr = ''; render();
    try {
      if (!S) await refresh();
      var last = Math.max(S.subj.round, S.peerLast.round);
      var id = await freshId();
      K = { id: id, r1: last + 1, r2: last + 2, gap: K && K.gap ? K.gap : 1500, tx: {},
        start: { required: S.required.toString(), errors: S.errors.toString(), borrower: W.account || null }, pending: null };
      save();
    } catch (e) { lastErr = plain(e); }
    await safeRefresh();
    busy = null;
    render();
  }

  /* ---------------------------------------------------------------- pending work */
  // A step in flight is written down before it is waited on, so a reload shows it as in flight and
  // picks up its receipt instead of offering the step again.
  function setPending(p) { if (K) { K.pending = p; save(); } }
  function stepDone(k) { try { var p = plan().filter(function (x) { return x.s.k === k; })[0]; return p && p.v.st === 'done'; } catch (e) { return false; } }
  function settlePending() {
    if (!K || !K.pending || busy) return;
    var p = K.pending;
    if (stepDone(p.step) || Date.now() - p.at > SERVER_PATIENCE * (p.hash ? 5 : 1)) { setPending(null); }
  }
  async function resumePending() {
    if (!K || !K.pending || !K.pending.hash) return;
    var p = K.pending;
    try {
      for (var i = 0; i < 90; i++) {
        var r = await rpc('eth_getTransactionReceipt', [p.hash]);
        if (r) {
          var list = (K.tx[p.step] = K.tx[p.step] || []);
          if (!list.some(function (t) { return t.h === p.hash; })) list.push({ l: p.label, h: p.hash, s: r.status === '0x1' ? 'ok' : 'reverted' });
          setPending(null); save();
          if (r.status !== '0x1') lastErr = p.label + ' was reverted on chain.';
          return;
        }
        await new Promise(function (res) { setTimeout(res, 2000); });
      }
    } catch (e) { /* the periodic refresh retries */ }
  }

  /* ---------------------------------------------------------------- sending */
  async function tx(step, label, to, data, value) {
    var sim = await C.simulate(to, data, value);
    if (!sim.ok) throw new Error(sim.reason);
    var e = await C.send(label, to, data, value, function (hash) {
      setPending({ step: step, label: label, hash: hash, at: Date.now() });
      render();
    });
    if (K) { (K.tx[step] = K.tx[step] || []).push({ l: label, h: e.hash, s: e.status }); setPending(null); }
    render();
    if (e.status !== 'ok') throw new Error(e.reason || (label + ' ' + e.status));
    return e;
  }
  async function approve(step, token, spender, need, what) {
    if ((await C.allowanceOf(token, spender)) >= need) return;
    await tx(step, 'Approve ' + what, token, C.encode('approve', ['address', 'uint256'], [spender, need]));
  }
  // the demo feed's side of the case
  async function server(step, kind, labels) {
    setPending({ step: step, server: true, at: Date.now() });
    render();
    var r, j;
    try {
      r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: kind, caseId: K.id, r1: K.r1, r2: K.r2, gap: K.gap, borrower: W.account }) });
      j = await r.json().catch(function () { return {}; });
    } finally { setPending(null); }
    if (!r.ok) {
      // the server's words are about the demo feed, not the visitor's wallet: never run them through plain()
      var e = new Error('Demo feed: ' + (j.error || ('answered ' + r.status)));
      e.server = true; throw e;
    }
    var hs = j.hashes || [], list = (K.tx[step] = K.tx[step] || []);
    hs.forEach(function (h, i) {
      var main = labels.length - (hs.length - i);
      list.push({ l: main >= 0 ? labels[main](j) : 'Feed setup', h: h, s: 'ok' });
    });
    save();
    return j;
  }

  function bondTopUpNeeded() { return S.bond < S.required + S.required / 5n; }
  function stakeFor(bonus) { var p = bonus * 100n / BPS; return p > S.minStake ? p : S.minStake; }
  function liquidated() { return S.sz && S.sz.state !== 0; }
  function exposed(d) { var lim = limitAtLie(d); return lim !== null && S.acct.debt > lim; }

  /* ---------------------------------------------------------------- the steps */
  function vFund() {
    var s = S, vals = [['HOLD', fx(s.hold, 6, 4)], ['WETH', weth(s.weth).replace(' WETH', '')], ['ETH', fx(s.eth, 18, 6)]];
    var needHold = s.hold < NEED_HOLD, needWeth = s.weth + s.acct.posted < NEED_WETH;
    if (!needHold && !needWeth) return { st: 'done', vals: vals };
    if (needWeth && s.eth < WRAP + GAS_ROOM) return { st: 'blocked', vals: vals, note: 'Your wallet needs about ' + fx(WRAP + GAS_ROOM, 18, 5) + ' test ETH.', link: [FAUCET, 'Get test ETH'] };
    var wait = needHold && s.claimedAt ? s.claimedAt + s.cooldown - chainNow() : 0;
    if (needHold && wait > 0) return { st: 'wait', vals: vals, note: 'The HOLD faucet opens again in ' + mmss(wait) + '.' };
    return {
      st: 'ready', vals: vals,
      label: [needHold ? 'Claim 1 HOLD' : '', needWeth ? 'Wrap ETH' : ''].filter(Boolean).join(' + '),
      run: async function () {
        if (needWeth) await tx('fund', 'Wrap ' + fx(WRAP, 18, 5) + ' ETH', CFG.collateral, C.encode('wrap', [], []), WRAP);
        if (needHold) await tx('fund', 'Claim 1 HOLD', CFG.asset, C.encode('faucetClaim', [], []));
      }
    };
  }

  function vHonest() {
    var s = S, d = derive();
    if (s.r1.exists) return { st: 'done', vals: [['printed', usd(s.r1.value)], ['Chainlink', usd(s.cl)]] };
    var vals = [['Chainlink now', usd(s.cl)]];
    if (s.subj.round >= K.r1) return { st: 'blocked', vals: vals, note: 'Another case printed first. Start a new case.' };
    return {
      st: 'ready', vals: vals, label: 'Print the real price',
      run: function () {
        return server('honest', 'honest', [function (j) { return 'Feed prints ' + usd(BigInt(j.value)); }]);
      }
    };
  }

  function vBorrow() {
    var s = S, d = derive(), a = s.acct, lim = limitAtLie(d);
    var vals = [['collateral', weth(a.posted)], ['debt', hold(a.debt)]];
    if (s.hP) vals.push(['limit at ' + usd(d.pH), hold(s.hP.limit)]);
    if (liquidated()) return { st: 'done', vals: vals };
    if (!s.r1.exists) return { st: 'todo', vals: vals };
    if (exposed(d)) return { st: 'done', vals: vals };
    if (s.r2.exists) return { st: 'blocked', vals: vals, note: 'The false price landed before the loan. Start a new case.' };
    if (s.subj.round !== K.r1) return { st: 'blocked', vals: vals, note: 'Another case printed since. Start a new case.' };
    return {
      st: 'ready', vals: vals, label: 'Borrow 95% of the limit',
      run: async function () {
        if (S.acct.posted < NEED_WETH) {
          var put = S.weth;
          if (put === 0n) throw new Error('You have no WETH to post. Fund the wallet first.');
          await approve('borrow', CFG.collateral, CFG.market, put, 'WETH');
          await tx('borrow', 'Post ' + weth(put), CFG.market, C.encode('depositCollateral', ['uint256'], [put]));
          await refresh();
        }
        var h = S.hP, target = h.limit * 95n / 100n;
        if (h.debt >= target) return;
        var amt = target - h.debt;
        // every case brings its own liquidity: lend part of the HOLD claimed in step 1, keeping the
        // stake for step 6, so the shared market never runs dry however many cases are run
        if (S.idle < amt * 2n) {
          var lend = S.hold - NEED_HOLD;
          if (lend > amt * 4n) lend = amt * 4n;
          if (lend + S.idle < amt) throw new Error(PLAIN.InsufficientLiquidity);
          await approve('borrow', CFG.asset, CFG.market, lend, 'HOLD');
          await tx('borrow', 'Lend ' + hold(lend), CFG.market, C.encode('supply', ['uint256'], [lend]));
        }
        await tx('borrow', 'Borrow ' + hold(amt), CFG.market, C.encode('borrow', ['uint256'], [amt]));
      }
    };
  }

  function vLie() {
    var s = S, d = derive(), lim = limitAtLie(d);
    var vals = [['false price', usd(d.L)], ['Chainlink', usd(d.peerV)], ['off by', pct(d.spread)]];
    if (lim !== null && !s.r2.exists) vals.push(['your limit at it', hold(lim)]);
    if (s.r2.exists && s.p2.exists) return { st: 'done', vals: vals };
    if (s.subj.round >= K.r2 || s.peerLast.round >= K.r2) return { st: 'blocked', vals: vals, note: 'Another case printed first. Start a new case.' };
    return {
      st: 'ready', vals: vals, label: 'Print the false price',
      run: function () {
        return server('lie', 'lie', [
          function (j) { return 'Feed prints ' + usd(BigInt(j.value)); },
          function (j) { return 'Chainlink feed prints ' + usd(BigInt(j.peer)); }
        ]);
      }
    };
  }

  function vLiq() {
    var s = S, d = derive();
    if (liquidated()) return { st: 'done', vals: [['repaid', hold(s.sz.repay)], ['collateral taken', weth(s.sz.collateral)], ['profit held', hold(s.esc.bonus)]] };
    var repay = s.acct.debt * s.closeBps / BPS, bonus = repay * s.bonusBps / BPS;
    var vals = [['repays', hold(repay)], ['profit', hold(bonus)]];
    if (!s.r2.exists) return { st: 'todo', vals: vals };
    if (!exposed(d)) return { st: 'blocked', vals: vals, note: 'Your loan is still healthy at ' + usd(d.L) + '. Start a new case with a bigger lie.' };
    return {
      st: 'ready', vals: vals, label: 'Liquidate my loan',
      run: function () {
        return server('liquidate', 'liquidate', [function () { return 'Market liquidates case #' + K.id; }]);
      }
    };
  }

  function vChallenge() {
    var s = S, d = derive();
    if (s.ch.open) return { st: 'done', vals: [['rule', 'two sources disagree'], ['stake', hold(s.ch.stake)]] };
    if (s.esc.outcome !== 0) return { st: 'done', vals: [['result', 'window ran out, profit released']] };
    if (!liquidated()) return { st: 'todo', vals: [['rule', 'two sources disagree'], ['stake', 'from ' + hold(s.minStake)]] };
    var left = s.esc.deadline - chainNow(), stake = stakeFor(s.esc.bonus);
    var vals = [['window', left > 0 ? mmss(left) + ' left' : 'closed'], ['stake', hold(stake)], ['off by', pct(d.spread)]];
    if (left <= 0) {
      return {
        st: 'ready', vals: vals, label: 'Release to liquidator',
        note: 'Nobody challenged in time, so the liquidator keeps the profit.',
        run: async function () { await tx('challenge', 'Release case #' + K.id, CFG.lantern, C.encode('release', ['uint256'], [K.id])); }
      };
    }
    return {
      st: 'ready', vals: vals, label: 'Prove the price was false',
      run: async function () {
        await approve('challenge', CFG.asset, CFG.lantern, stake, 'stake');
        await tx('challenge', 'Challenge case #' + K.id, CFG.lantern,
          C.encode('openChallenge', ['uint256', 'uint8', 'bytes', 'uint256'], [K.id, 4, CFG.peer, stake]));
      }
    };
  }

  function vVerdict() {
    var s = S, d = derive();
    if (s.ch.resolved) return { st: 'done', vals: [['verdict', s.ch.upheld ? 'upheld' : 'refused'], ['profit goes to', s.esc.outcome === 2 ? 'you' : 'liquidator']] };
    if (s.esc.outcome !== 0) return { st: 'done', vals: [['profit goes to', 'liquidator']] };
    if (!s.ch.open) return { st: 'todo', vals: [['decided by', 'the contract']] };
    return {
      st: 'ready', vals: [['off by', pct(d.spread)], ['limit', pct(TOLERANCE)], ['expected', d.spread > TOLERANCE ? 'upheld' : 'refused']],
      label: 'Get the verdict',
      run: async function () { await tx('verdict', 'Verdict on case #' + K.id, CFG.lantern, C.encode('adjudicate', ['uint256'], [K.id])); }
    };
  }

  function vClaim() {
    var s = S;
    if (!liquidated() || s.esc.outcome === 0) return { st: 'todo', vals: [['collateral', liquidated() ? weth(s.sz.collateral) : '\u2014']] };
    var to = s.esc.outcome === 2 ? 'you' : 'liquidator';
    if (s.sz.state === 2) return { st: 'done', vals: [['collateral went to', to], ['amount', weth(s.sz.collateral)]] };
    return {
      st: 'ready', vals: [['collateral', weth(s.sz.collateral)], ['goes to', to]], label: to === 'you' ? 'Take my collateral back' : 'Settle',
      run: async function () { await tx('claim', 'Settle case #' + K.id, CFG.market, C.encode('claim', ['uint256'], [K.id])); }
    };
  }

  var PREVIEW = {
    fund: 'Claim 1 test HOLD and wrap a little test ETH.',
    honest: 'The feed prints Chainlink\u2019s real ETH price.',
    borrow: 'Post WETH, lend some HOLD to the market, and borrow close to your limit.',
    lie: 'The feed prints a false, lower price. Chainlink prints the real one for the same round.',
    liquidate: 'At the false price your loan looks underwater, so the market liquidates it. The liquidator\u2019s profit is held for five minutes.',
    challenge: 'Point at the two prints. Stake a little HOLD on it.',
    verdict: 'The contract recomputes the gap from its own records and decides.',
    claim: 'If upheld, your collateral comes back and the held profit is yours.'
  };
  var STEPS = [
    { k: 'fund', t: 'Fund your wallet', who: 'you', v: vFund },
    { k: 'honest', t: 'Feed prints the real price', who: 'demo feed', v: vHonest },
    { k: 'borrow', t: 'Take out a loan', who: 'you', v: vBorrow },
    { k: 'lie', t: 'Feed prints a false price', who: 'demo feed', v: vLie },
    { k: 'liquidate', t: 'Market liquidates you', who: 'liquidator', v: vLiq },
    { k: 'challenge', t: 'Prove the price was false', who: 'you', v: vChallenge },
    { k: 'verdict', t: 'Verdict', who: 'you', v: vVerdict },
    { k: 'claim', t: 'Settle', who: 'you', v: vClaim }
  ];

  // a step is only actionable once every step before it is done
  function plan() {
    var blockedBefore = false;
    return STEPS.map(function (s) {
      var v;
      try { v = s.v(); } catch (e) { v = { st: 'blocked', vals: [], note: plain(e) }; }
      if (blockedBefore && v.st !== 'done') v = { st: 'todo', vals: v.vals };
      if (v.st !== 'done') blockedBefore = true;
      return { s: s, v: v };
    });
  }

  function gate() {
    if (!window.ethereum) return { why: 'You need a browser wallet such as MetaMask to run a case.', link: ['https://metamask.io/download/', 'Get MetaMask'] };
    if (!W.account) return { why: 'Connect your wallet to start.', label: 'Connect wallet', fn: function () { return C.connect(); } };
    if (W.chain !== CFG.chainId) return { why: 'Your wallet is on another network. The case runs on Arbitrum Sepolia.', label: 'Switch network', fn: function () { return C.switchChain(); } };
    if (S && S.eth === 0n) return { why: 'Your wallet has no test ETH on Arbitrum Sepolia for gas. It is free from a faucet.', link: [FAUCET, 'Get test ETH'] };
    if (K && K.start && K.start.borrower && W.account && K.start.borrower.toLowerCase() !== W.account.toLowerCase() && S && S.r1 && S.r1.exists) {
      return { why: 'This case belongs to ' + short(K.start.borrower) + '. Switch back to that wallet or start a new case.' };
    }
    return null;
  }

  async function runStep(k) {
    if (busy) return false;
    if (!S || !K || !S.r1) return false;
    var p = plan().filter(function (x) { return x.s.k === k; })[0];
    if (!p || p.v.st !== 'ready' || gate()) return false;
    if (K.pending) return false;
    if (!K.start.borrower && W.account) { K.start.borrower = W.account; save(); }
    busy = k; lastErr = ''; render();
    var ok = true;
    try { await p.v.run(); } catch (e) { ok = false; lastErr = plain(e); }
    // stay locked until the chain read after the step has landed, so the step just run is never
    // offered again from the state before it
    await safeRefresh();
    busy = null;
    render();
    try { await C.refreshBalances(); } catch (e) { }
    if (window.LanternDash) window.LanternDash.reload();
    return ok;
  }
  async function runNext() {
    var next = plan().filter(function (x) { return x.v.st !== 'done'; })[0];
    if (next && next.v.st === 'ready') await runStep(next.s.k);
  }
  async function safeRefresh() {
    try { await refresh(); } catch (e) { lastErr = 'Could not read the chain: ' + plain(e); render(); }
  }

  /* ---------------------------------------------------------------- render */
  // write only what changed: the list is re-derived every second, and replacing nodes that did not
  // change would swallow a click that lands between mousedown and mouseup
  var lastHTML = {};
  function setHTML(id, html) { if (lastHTML[id] !== html) { lastHTML[id] = html; $(id).innerHTML = html; } }
  var $ = function (id) { return document.getElementById(id); };
  function kv(pairs) { return pairs.map(function (p) { return '<span><i>' + esc(p[0]) + '</i>' + esc(p[1]) + '</span>'; }).join(''); }
  function txA(t) {
    return '<a class="rs-l ' + (t.s === 'ok' ? 'ok' : 'bad') + '" href="' + CFG.explorer + '/tx/' + t.h + '" target="_blank" rel="noopener">' + esc(t.l) + ' \u2197</a>';
  }
  function txLinks(k) { return (K && K.tx[k] || []).map(txA).join(''); }

  function renderPrices() {
    if (!S) return;
    $('pxCl').textContent = usd(S.cl);
    $('pxFeed').textContent = S.subj.exists ? usd(S.subj.value) : '\u2014';
    var gap = S.subj.exists ? absBps(S.subj.value, S.cl) : 0n;
    var bad = gap > TOLERANCE;
    $('pxDiff').className = 'px-diff ' + (bad ? 'bad' : 'ok');
    $('pxDiff').textContent = S.subj.exists ? (bad ? 'Off by ' + pct(gap) + '. That is provable.' : 'Within ' + pct(gap) + ' of Chainlink.') : '';
    $('blockChip').textContent = 'block ' + S.block.toLocaleString('en-US');
  }

  function renderWallet() {
    var g = gate(), btn = $('rwBtn');
    var wrong = W.account && W.chain !== CFG.chainId;
    $('rwLabel').textContent = !W.account ? 'Connect wallet' : wrong ? 'Switch network' : short(W.account);
    $('rwDot').className = 'dot ' + (!W.account ? '' : wrong ? 'bad' : 'ok');
    btn.classList.toggle('on', !!W.account && !wrong);
    if (!S) return;
    $('rwVals').innerHTML = W.account ? kv([['ETH', fx(S.eth, 18, 6)], ['HOLD', fx(S.hold, 6, 4)], ['WETH', weth(S.weth).replace(' WETH', '')]]) : '<span class="muted">Not connected</span>';
    var a = S.acct, h = S.hNow;
    $('rpVals').innerHTML = W.account ? kv([['collateral', weth(a.posted)], ['debt', hold(a.debt)],
      ['limit', h ? hold(h.limit) : '\u2014'], ['lent', hold(a.supplied)]]) : '';
    var ratio = h && h.limit > 0n ? Number(h.debt * 1000n / h.limit) / 10 : 0;
    $('rpBar').style.setProperty('--w', Math.min(100, ratio) + '%');
    $('rpBar').className = 'hbar' + (ratio > 100 ? ' over' : ratio > 85 ? ' near' : '');
    $('rpRatio').textContent = h && h.limit > 0n ? ratio.toFixed(0) + '% of limit' : '';
    var can = !g && !busy && !(K && K.pending);
    $('rpRepay').disabled = !(can && a.debt > 0n && S.hold >= a.debt);
    $('rpWithdraw').disabled = !(can && a.debt === 0n && a.posted > 0n);
    $('rpUnlend').disabled = !(can && a.supplied > 0n && S.idle > 0n);
    $('rpUnlend').style.display = a.supplied > 0n ? '' : 'none';
  }

  function renderOutcome() {
    var box = $('outcome');
    var closed = K && S && S.r2 && liquidated() && S.esc.outcome !== 0 && S.sz.state === 2;
    if (!closed) { box.style.display = 'none'; return; }
    var d = derive(), up = S.esc.outcome === 2;
    var bounty = up && S.ch.upheld ? S.esc.bonus * S.bounty / BPS : 0n;
    var req0 = K.start ? BigInt(K.start.required) : S.required, err0 = K.start ? BigInt(K.start.errors) : S.errors;
    var all = [];
    STEPS.forEach(function (s) { (K.tx[s.k] || []).forEach(function (t) { all.push(t); }); });
    var rows = up ? [
      ['The feed said', usd(d.L)],
      ['Chainlink said', usd(d.peerV)],
      ['Gap', pct(d.spread) + ', limit ' + pct(TOLERANCE)],
      ['Collateral returned', weth(S.sz.collateral)],
      ['Profit you received', hold(S.esc.bonus)],
      ['Bounty from the feed\u2019s bond', hold(bounty)],
      S.required !== req0 ? ['Feed\u2019s required bond', hold(req0) + ' \u2192 ' + hold(S.required)] : ['Feed\u2019s caught lies', String(err0) + ' \u2192 ' + String(S.errors)]
    ] : [
      ['The feed said', usd(d.L)],
      ['Chainlink said', usd(d.peerV)],
      ['Gap', pct(d.spread) + ', limit ' + pct(TOLERANCE)],
      ['Liquidator kept', hold(S.esc.bonus) + ' profit'],
      ['Collateral taken', weth(S.sz.collateral)],
      [S.ch.open ? 'Your stake' : 'Challenge', S.ch.open ? hold(S.ch.stake) + ' went to the liquidator' : 'none in the window'],
      ['Feed\u2019s caught lies', String(err0) + ' \u2192 ' + String(S.errors)]
    ];
    box.style.display = '';
    box.className = 'outcome ' + (up ? 'win' : 'lose');
    var html = '<div class="oc-h"><span class="oc-tag">Case #' + K.id + ' closed</span><h2>' +
      (up ? 'The lie was caught. You were made whole.' : (S.ch.open ? 'The proof did not hold. The liquidation stands.' : 'Nobody challenged. The liquidation stands.')) + '</h2></div>' +
      '<div class="oc-rows">' + rows.map(function (r) { return '<div><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') + '</div>' +
      '<div class="oc-tx"><span>' + all.length + ' transactions</span>' + all.map(txA).join('') + '</div>' +
      '<div class="oc-a"><button class="btn-lime" id="ocNew"><span>Run another case</span></button><a class="ghost" href="#cases">See all cases</a></div>';
    if (lastHTML.outcome !== html) { setHTML('outcome', html); $('ocNew').onclick = newCase; }
  }

  function render() {
    renderWallet();
    if (!S) return;
    renderPrices();
    var g = gate();
    $('runGate').innerHTML = g ? esc(g.why) + (g.fn ? ' <button class="link-btn" id="gateBtn">' + esc(g.label) + '</button>' : '') +
      (g.link ? ' <a class="link-btn" href="' + g.link[0] + '" target="_blank" rel="noopener">' + esc(g.link[1]) + ' \u2197</a>' : '') : '';
    $('runGate').style.display = g ? '' : 'none';
    if ($('gateBtn')) $('gateBtn').onclick = onWalletBtn;
    $('runErr').textContent = lastErr;
    $('runErr').classList.toggle('show', !!lastErr);
    $('newCase').disabled = !!busy || !!(K && K.pending);
    renderOutcome();
    if (!K) {
      $('caseTitle').textContent = 'No case yet';
      $('caseSub').textContent = 'Press New case to begin. It takes about eight minutes, most of it the challenge window.';
      setHTML('runSteps', STEPS.map(function (x, i) {
        return '<li class="rs st-todo"><span class="rs-n">' + (i + 1) + '</span><div class="rs-m"><div class="rs-t">' + esc(x.t) + '<em>' + esc(x.who) + '</em></div>' +
          '<div class="rs-p">' + esc(PREVIEW[x.k]) + '</div></div><div class="rs-a"></div></li>';
      }).join(''));
      $('gapRow').style.display = 'none';
      return;
    }
    if (!S.r1) {
      $('caseTitle').textContent = 'Case #' + K.id;
      $('caseSub').textContent = 'Reading the case from the chain\u2026';
      setHTML('runSteps', '<li class="rs-empty">Reading the case from the chain\u2026</li>');
      return;
    }
    var p = plan(), done = p.filter(function (x) { return x.v.st === 'done'; }).length;
    var pend = K.pending;
    $('caseTitle').textContent = 'Case #' + K.id;
    $('caseSub').textContent = done + ' of ' + p.length + ' steps done';
    $('gapRow').style.display = S.r2.exists ? 'none' : '';
    $('gapIn').disabled = !!busy || !!pend;
    $('gapOut').textContent = (K.gap / 100) + '% low';
    $('gapHint').textContent = BigInt(K.gap) > TOLERANCE ? 'over 5% off, so it is provable' : '5% or less: the proof will fail';
    setHTML('runSteps', p.map(function (x, i) {
      var inflight = busy === x.s.k || (pend && pend.step === x.s.k);
      var st = inflight ? 'busy' : x.v.st;
      var action = st === 'ready'
        ? '<button class="go rs-go" data-step="' + x.s.k + '"' + (g || busy || pend ? ' disabled' : '') + '>' + esc(x.v.label || 'Send') + '</button>'
        : '<span class="rs-st">' + ({ done: 'Done', todo: '', wait: 'Waiting', blocked: 'Blocked', busy: pend && pend.server ? 'Demo feed working\u2026' : 'Confirming\u2026' }[st]) + '</span>';
      var note = x.v.note ? '<div class="rs-x">' + esc(x.v.note) + (x.v.link ? ' <a href="' + x.v.link[0] + '" target="_blank" rel="noopener">' + esc(x.v.link[1]) + ' \u2197</a>' : '') + '</div>' : '';
      var pendLine = inflight && pend && pend.hash ? '<div class="rs-tx"><a class="rs-l" href="' + CFG.explorer + '/tx/' + pend.hash + '" target="_blank" rel="noopener">' + esc(pend.label) + ' (pending) \u2197</a></div>' : '';
      return '<li class="rs st-' + st + '"><span class="rs-n">' + (st === 'done' ? '\u2713' : i + 1) + '</span>' +
        '<div class="rs-m"><div class="rs-t">' + esc(x.s.t) + '<em>' + esc(x.s.who) + '</em></div>' +
        (st === 'todo' ? '<div class="rs-p">' + esc(PREVIEW[x.s.k]) + '</div>' : '<div class="rs-v">' + kv(x.v.vals || []) + '</div>') +
        note + pendLine + '<div class="rs-tx">' + txLinks(x.s.k) + '</div></div>' +
        '<div class="rs-a">' + action + '</div></li>';
    }).join(''));
  }

  /* ---------------------------------------------------------------- wiring */
  $('runSteps').addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-step]');
    if (b) runStep(b.getAttribute('data-step'));
  });
  $('newCase').addEventListener('click', newCase);
  $('gapIn').addEventListener('input', function () {
    if (!K) return;
    K.gap = Number(this.value) * 100; save(); render();
  });
  $('gapIn').addEventListener('change', function () { safeRefresh(); });
  async function onWalletBtn() {
    try {
      if (!window.ethereum) { window.open('https://metamask.io/download/', '_blank'); return; }
      if (!W.account) await C.connect();
      if (W.chain !== CFG.chainId) await C.switchChain();
    } catch (e) { lastErr = plain(e); }
    await safeRefresh();
  }
  $('rwBtn').addEventListener('click', onWalletBtn);
  async function posAct(fn) {
    if (busy) return;
    busy = 'position'; lastErr = ''; render();
    try { await fn(); } catch (e) { lastErr = plain(e); }
    await safeRefresh(); busy = null; render();
  }
  $('rpRepay').addEventListener('click', function () {
    posAct(async function () {
      var debt = S.acct.debt;
      await approve('position', CFG.asset, CFG.market, debt, 'HOLD');
      await tx('position', 'Repay ' + hold(debt), CFG.market, C.encode('repay', ['uint256'], [debt]));
    });
  });
  $('rpWithdraw').addEventListener('click', function () {
    posAct(async function () {
      var p = S.acct.posted;
      await tx('position', 'Withdraw ' + weth(p), CFG.market, C.encode('withdrawCollateral', ['uint256'], [p]));
    });
  });
  $('rpUnlend').addEventListener('click', function () {
    posAct(async function () {
      var amt = S.acct.supplied < S.idle ? S.acct.supplied : S.idle;
      await tx('position', 'Withdraw ' + hold(amt) + ' lent', CFG.market, C.encode('withdraw', ['uint256'], [amt]));
    });
  });

  if (K) $('gapIn').value = String(K.gap / 100);
  C.onChange(function () { if (!busy) renderWallet(); });
  // reconnect silently if the site was already approved
  if (window.ethereum && window.ethereum.request) {
    window.ethereum.request({ method: 'eth_accounts' }).then(function (a) { if (a && a[0]) return C.connect(); }).then(safeRefresh, function () { });
  }
  var lastAcct = null;
  setInterval(function () {
    if (W.account !== lastAcct) { lastAcct = W.account; if (!busy) safeRefresh(); }
    else if (S && !busy && root.classList.contains('active')) render();
  }, 1000);
  setInterval(function () { if (!busy && !document.hidden) safeRefresh(); }, (K && K.pending) ? 5000 : 15000);
  window.LanternRun = { refresh: safeRefresh, runStep: runStep, runNext: runNext, newCase: newCase, plain: plain,
    state: function () { return { S: S, K: K, busy: busy, err: lastErr }; } };
  resumePending().then(safeRefresh);
})();
