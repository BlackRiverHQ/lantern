/* run.js — the Run view. One liquidation case driven end to end against the deployed contracts,
   from the connected wallet: an honest print, a position, a lying print, the second source, the
   market's own liquidation, the challenge, the verdict and the settlement. Every number is read from
   the chain; every button is a transaction that console.js preflights with eth_call before signing. */
(function () {
  'use strict';
  var C = window.LanternConsole;
  var root = document.getElementById('view-run');
  if (!C || !root) return;
  var CFG = C.CFG, W = C.W;
  var O = window.__LANTERN__ || {};
  var RPCS = O.rpcs || [CFG.rpc, 'https://arbitrum-sepolia-rpc.publicnode.com'];
  var FROM = O.fromBlock != null ? O.fromBlock : 315054532;

  // every selector from `cast sig`
  var SEL = {
    latestRoundData: '0xfeaf968c', reg: '0x738fdd1a', operatorOf: '0x63ea4ab2', bondOf: '0x0fb585ba',
    requiredBond: '0xcd8f9967', priceable: '0x7ea8464f', feedErrors: '0xc4334ab4', minStake: '0x375b3c0a',
    bountyBps: '0x415307cc', escrowOf: '0x2d2a8d9c', challengeOf: '0x2a4ccee5', lastReport: '0xe6efcd98',
    reportAt: '0x50da588b', accountOf: '0x8086b8ba', healthOf: '0xf17e83b4', seizureOf: '0xee939d20',
    closeFactorBps: '0x4654440b', liquidationBonusBps: '0x19970d8e', balanceOf: '0x70a08231',
    claimedAt: '0x8d64422d', cooldown: '0x787a08a6'
  };
  var TOPIC_LIQ = '0x3dc45dc4282f1b79aa977ca44f3966fd1e704e1d7264c8235464dc0b2a15460b'; // LiquidationRecorded
  var REPORT = ['bytes32', 'uint256', 'uint64', 'uint64', 'bytes32', 'address'];

  var BPS = 10000n;
  var TOLERANCE = 500n;                 // CROSS_SOURCE_TOLERANCE_BPS
  var DRIFT = 2000n;                    // MAX_REPORT_DRIFT_BPS: one print may move at most 20%
  var NEED_HOLD = 100000n;              // 0.1 HOLD: a close, a stake and a bond top-up
  var NEED_WETH = 20000000000000n;      // 0.00002 WETH of collateral
  var WRAP = 50000000000000n;           // wrapped when the wallet holds less than that
  var GAS_ROOM = 20000000000000n;       // ether kept back for gas when wrapping

  /* ---------------------------------------------------------------- formatting */
  function fx(v, d, dp) {
    v = BigInt(v); var neg = v < 0n; if (neg) v = -v;
    var E = 10n ** BigInt(d), w = v / E;
    var f = (v % E).toString().padStart(d, '0').slice(0, dp).replace(/0+$/, '');
    return (neg ? '\u2212' : '') + w.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
  }
  function hold(v) { return fx(v, 6, 4); }
  function usd(v) { return fx(v, 6, 2); }
  function weth(v) {
    v = BigInt(v); if (v === 0n) return '0';
    var m = /^0\.(0*)(\d+)$/.exec(fx(v, 18, 18));
    return m ? '0.' + m[1] + m[2].slice(0, 3) : fx(v, 18, 5);
  }
  function pct(bps) { return (Number(bps) / 100).toFixed(2) + '%'; }
  function absBps(a, b) { if (b === 0n) return 0n; return (a > b ? a - b : b - a) * BPS / b; }
  function short(a) { return a ? a.slice(0, 6) + '\u2026' + a.slice(-4) : '\u2014'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mmss(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

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
  var KEY = 'lantern.case.' + CFG.chainId + '.' + CFG.lantern.toLowerCase();
  var K = null;
  try { K = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { K = null; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(K)); } catch (e) { } }

  var S = null, REG = null, loadedWall = 0, busy = null, lastErr = '';

  function honest(n) {
    // the print an honest operator makes is Chainlink's answer, held inside the per-print guard
    var a = n.subj.exists ? n.subj.value : 0n, v = n.cl;
    if (!a) return { v: v, capped: false };
    var lo = a * (BPS - DRIFT + 100n) / BPS, hi = a * (BPS + DRIFT - 100n) / BPS;
    if (v < lo) return { v: lo, capped: true };
    if (v > hi) return { v: hi, capped: true };
    return { v: v, capped: false };
  }
  function derive(n) {
    n = n || S;
    var h = honest(n);
    var pH = n.r1 && n.r1.exists ? n.r1.value : h.v;
    var L = n.r2 && n.r2.exists ? n.r2.value : pH * (BPS - BigInt(K.gap)) / BPS;
    var peerV = n.p2 && n.p2.exists ? n.p2.value : n.cl;
    return { pH: pH, capped: !(n.r1 && n.r1.exists) && h.capped, L: L, peerV: peerV, spread: absBps(L, peerV) };
  }
  // the borrow limit at the lie, exact once the lie is on chain, linear in price before that
  function limitAtLie(d) {
    if (S.r2.exists && S.hL) return S.hL.limit;
    if (!S.hP || d.pH === 0n) return null;
    return S.hP.limit * d.L / d.pH;
  }
  function chainNow() { return S ? S.now + Math.floor((Date.now() - loadedWall) / 1000) : 0; }

  async function refresh() {
    if (!REG) REG = hexAddr(first(await call(CFG.lantern, SEL.reg)));
    var me = W.account;
    var r = await Promise.all([
      rpc('eth_getBlockByNumber', ['latest', false]),
      call(CFG.aggregator, SEL.latestRoundData),
      call(REG, SEL.lastReport + id32(CFG.subject)),
      call(REG, SEL.lastReport + id32(CFG.peer)),
      call(CFG.lantern, SEL.operatorOf + id32(CFG.subject)),
      call(CFG.lantern, SEL.operatorOf + id32(CFG.peer)),
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
    var cl = words(r[1]);
    n.cl = (cl[1] || 0n) / 100n;                       // eight decimals onto the asset's six
    n.subj = report(r[2]); n.peerLast = report(r[3]);
    n.opSubj = hexAddr(first(r[4])); n.opPeer = hexAddr(first(r[5]));
    n.bond = first(r[6]); n.required = first(r[7]); n.priceable = first(r[8]) === 1n; n.errors = first(r[9]);
    n.minStake = first(r[10]); n.bounty = first(r[11]); n.closeBps = first(r[12]); n.bonusBps = first(r[13]);
    n.idle = first(r[14]); n.cooldown = Number(first(r[15]));
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
      n.esc = { deadline: Number(e[3] || 0n), bonus: e[4] || 0n, outcome: Number(e[7] || 0n), exists: e[8] === 1n };
      var h = words(c[4]);    // prover, stake, rule, evidenceHash, resolved, upheld, openedAt
      n.ch = { open: (h[0] || 0n) !== 0n, stake: h[1] || 0n, resolved: h[4] === 1n, upheld: h[5] === 1n };
      var z = words(c[5]);    // borrower, liquidator, collateralAmount, repayAmount, state
      n.sz = { collateral: z[2] || 0n, repay: z[3] || 0n, state: Number(z[4] || 0n) };
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
    S = n; loadedWall = Date.now();
    render();
  }

  async function freshId() {
    var max = 0;
    try {
      var logs = await rpc('eth_getLogs', [{ address: CFG.lantern, topics: [TOPIC_LIQ], fromBlock: '0x' + FROM.toString(16), toBlock: 'latest' }]);
      logs.forEach(function (l) { var v = Number(BigInt(l.topics[1])); if (v > max) max = v; });
    } catch (e) { /* fall through to the probe below */ }
    var id = Math.max(max, 9) + 1;
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
      K = { id: id, r1: last + 1, r2: last + 2, gap: K && K.gap ? K.gap : 1500, tx: {} };
      save();
    } catch (e) { lastErr = e.message || String(e); }
    busy = null;
    await safeRefresh();
  }

  /* ---------------------------------------------------------------- sending */
  async function tx(step, label, to, data, value) {
    var sim = await C.simulate(to, data, value);
    if (!sim.ok) throw new Error(label + ' would be refused: ' + sim.reason);
    var e = await C.send(label, to, data, value);
    if (K) { (K.tx[step] = K.tx[step] || []).push({ l: label, h: e.hash, s: e.status }); save(); }
    render();
    if (e.status !== 'ok') throw new Error(label + ': ' + e.status + (e.reason ? ' \u2014 ' + e.reason : ''));
    return e;
  }
  async function approve(step, token, spender, need, what) {
    if ((await C.allowanceOf(token, spender)) >= need) return;
    await tx(step, 'Approve ' + what, token, C.encode('approve', ['address', 'uint256'], [spender, need]));
  }
  async function latestTs() { return parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16); }
  function mine(addr) { return !!W.account && addr.toLowerCase() === W.account.toLowerCase(); }
  function bondTopUp() { var want = S.required + S.required / 10n; return S.bond >= want ? 0n : want - S.bond; }
  function stakeFor(bonus) { var p = bonus * 100n / BPS; return p > S.minStake ? p : S.minStake; }
  function liquidated() { return S.sz && S.sz.state !== 0; }
  function exposed(d) { var lim = limitAtLie(d); return lim !== null && S.acct.debt > lim; }

  /* ---------------------------------------------------------------- the steps */
  function vFund() {
    var s = S, vals = [['HOLD', hold(s.hold)], ['WETH', weth(s.weth)], ['ETH', fx(s.eth, 18, 6)]];
    var needHold = s.hold < NEED_HOLD, needWeth = s.weth + s.acct.posted < NEED_WETH;
    if (!needHold && !needWeth) return { st: 'done', vals: vals };
    if (needWeth && s.eth < WRAP + GAS_ROOM) return { st: 'blocked', vals: vals, note: 'needs ' + fx(WRAP + GAS_ROOM, 18, 5) + ' ETH' };
    var wait = needHold && s.claimedAt ? s.claimedAt + s.cooldown - chainNow() : 0;
    if (needHold && wait > 0) return { st: 'wait', vals: vals, note: 'faucet open in ' + mmss(wait) };
    return {
      st: 'ready', vals: vals,
      label: [needHold ? 'Claim 1 HOLD' : '', needWeth ? 'Wrap ' + fx(WRAP, 18, 5) + ' ETH' : ''].filter(Boolean).join(' + '),
      run: async function () {
        if (needWeth) await tx('fund', 'Wrap ' + fx(WRAP, 18, 5) + ' ETH', CFG.collateral, C.encode('wrap', [], []), WRAP);
        if (needHold) await tx('fund', 'Claim 1 HOLD', CFG.asset, C.encode('faucetClaim', [], []));
      }
    };
  }

  function vPrint() {
    var s = S, d = derive();
    if (s.r1.exists) return { st: 'done', vals: [['printed', usd(s.r1.value)], ['round', K.r1]] };
    var vals = [['Chainlink', usd(s.cl)], ['print', usd(d.pH)], ['round', K.r1]];
    if (d.capped) vals.push(['guard', 'capped at \u00b119%']);
    if (s.subj.round >= K.r1) return { st: 'blocked', vals: vals, note: 'round ' + K.r1 + ' already used \u2014 start a new case' };
    if (!mine(s.opSubj)) return { st: 'blocked', vals: vals, note: 'needs the feed operator\u2019s wallet' };
    var topUp = bondTopUp();
    if (topUp > 0n) vals.push(['bond top-up', hold(topUp)]);
    return {
      st: 'ready', vals: vals, label: 'Print ' + usd(d.pH),
      run: async function () {
        if (topUp > 0n) {
          await approve('print', CFG.asset, CFG.lantern, topUp, 'bond');
          await tx('print', 'Bond ' + hold(topUp) + ' HOLD', CFG.lantern, C.encode('depositBond', ['bytes32', 'uint256'], [CFG.subject, topUp]));
        }
        await tx('print', 'Print ' + usd(d.pH) + ' at round ' + K.r1, CFG.lantern,
          C.encode('recordReport', REPORT, [CFG.subject, d.pH, K.r1, await latestTs(), 'LANTERN:CASE-' + K.id + ':HONEST', W.account]));
      }
    };
  }

  function vBorrow() {
    var s = S, d = derive(), a = s.acct, lim = limitAtLie(d);
    var vals = [['posted', weth(a.posted) + ' WETH'], ['debt', hold(a.debt)]];
    if (s.hP) vals.push(['limit at ' + usd(d.pH), hold(s.hP.limit)]);
    if (lim !== null) vals.push(['limit at ' + usd(d.L), hold(lim)]);
    if (liquidated()) return { st: 'done', vals: vals };
    if (!s.r1.exists) return { st: 'todo', vals: vals };
    if (exposed(d)) return { st: 'done', vals: vals };
    if (s.r2.exists) return { st: 'blocked', vals: vals, note: 'the lie landed before the position \u2014 start a new case' };
    if (s.subj.round !== K.r1) return { st: 'blocked', vals: vals, note: 'feed moved on to round ' + s.subj.round + ' \u2014 start a new case' };
    return {
      st: 'ready', vals: vals, label: 'Borrow to 95% of the limit',
      run: async function () {
        if (S.acct.posted < NEED_WETH) {
          var put = S.weth;
          if (put === 0n) throw new Error('no WETH to post \u2014 fund the wallet first');
          await approve('borrow', CFG.collateral, CFG.market, put, 'WETH');
          await tx('borrow', 'Post ' + weth(put) + ' WETH', CFG.market, C.encode('depositCollateral', ['uint256'], [put]));
          await refresh();
        }
        var h = S.hP, target = h.limit * 95n / 100n;
        if (h.debt >= target) return;
        var amt = target - h.debt;
        if (S.idle < amt) {
          var lend = amt - S.idle + 10000n;
          await approve('borrow', CFG.asset, CFG.market, lend, 'HOLD');
          await tx('borrow', 'Lend ' + hold(lend) + ' HOLD', CFG.market, C.encode('supply', ['uint256'], [lend]));
        }
        await tx('borrow', 'Borrow ' + hold(amt) + ' HOLD', CFG.market, C.encode('borrow', ['uint256'], [amt]));
      }
    };
  }

  function vLie() {
    var s = S, d = derive(), lim = limitAtLie(d);
    var vals = [['print', usd(d.L)], ['vs Chainlink', '\u2212' + pct(absBps(d.L, s.cl))], ['round', K.r2]];
    if (lim !== null) vals.push(['debt / limit', hold(s.acct.debt) + ' / ' + hold(lim)]);
    if (s.r2.exists) return { st: 'done', vals: vals };
    if (s.subj.round >= K.r2) return { st: 'blocked', vals: vals, note: 'round ' + K.r2 + ' already used \u2014 start a new case' };
    if (!mine(s.opSubj)) return { st: 'blocked', vals: vals, note: 'needs the feed operator\u2019s wallet' };
    return {
      st: 'ready', vals: vals, label: 'Print ' + usd(d.L),
      run: async function () {
        await tx('lie', 'Print ' + usd(d.L) + ' at round ' + K.r2, CFG.lantern,
          C.encode('recordReport', REPORT, [CFG.subject, d.L, K.r2, await latestTs(), 'LANTERN:CASE-' + K.id + ':LIE', W.account]));
      }
    };
  }

  function vPeer() {
    var s = S, d = derive();
    if (s.p2.exists) return { st: 'done', vals: [['peer', usd(s.p2.value)], ['round', K.r2], ['spread', pct(d.spread)]] };
    var vals = [['Chainlink', usd(s.cl)], ['round', K.r2], ['spread', pct(d.spread)], ['tolerance', pct(TOLERANCE)]];
    if (s.peerLast.round >= K.r2) return { st: 'blocked', vals: vals, note: 'peer round ' + K.r2 + ' already used \u2014 start a new case' };
    if (!mine(s.opPeer)) return { st: 'blocked', vals: vals, note: 'needs the peer operator\u2019s wallet' };
    return {
      st: 'ready', vals: vals, label: 'Publish Chainlink ' + usd(s.cl),
      run: async function () {
        await tx('peer', 'Chainlink ' + usd(S.cl) + ' at round ' + K.r2, CFG.lantern,
          C.encode('recordReport', REPORT, [CFG.peer, S.cl, K.r2, await latestTs(), 'LANTERN:CASE-' + K.id + ':CHAINLINK', W.account]));
      }
    };
  }

  function vLiq() {
    var s = S, d = derive();
    if (liquidated()) return { st: 'done', vals: [['seized', weth(s.sz.collateral) + ' WETH'], ['repaid', hold(s.sz.repay)], ['bonus held', hold(s.esc.bonus)]] };
    var repay = s.acct.debt * s.closeBps / BPS, notional = repay + repay * s.bonusBps / BPS;
    var vals = [['repay', hold(repay)], ['pays', hold(notional)], ['bonus', hold(notional - repay)]];
    if (!s.priceable) return { st: 'blocked', vals: vals, note: 'feed bond below the requirement' };
    if (!exposed(d)) return { st: 'blocked', vals: vals, note: 'position is healthy at ' + usd(d.L) };
    return {
      st: 'ready', vals: vals, label: 'Liquidate at ' + usd(d.L),
      run: async function () {
        await approve('liquidate', CFG.asset, CFG.market, notional + 1n, 'HOLD');
        await tx('liquidate', 'Liquidate #' + K.id, CFG.market,
          C.encode('liquidate', ['address', 'uint256', 'uint64', 'uint256'], [W.account, K.id, K.r2, repay]));
      }
    };
  }

  function vChallenge() {
    var s = S, d = derive();
    if (s.ch.open) return { st: 'done', vals: [['rule', 'CROSS_SOURCE'], ['stake', hold(s.ch.stake)]] };
    if (s.esc.outcome !== 0) return { st: 'done', vals: [['released', 'no challenge in the window']] };
    if (!liquidated()) return { st: 'todo', vals: [['rule', 'CROSS_SOURCE'], ['stake', 'max(1% of bonus, ' + hold(s.minStake) + ')']] };
    var left = s.esc.deadline - chainNow(), stake = stakeFor(s.esc.bonus);
    var vals = [['window', left > 0 ? mmss(left) : 'closed'], ['stake', hold(stake)], ['spread', pct(d.spread)]];
    if (left <= 0) {
      return {
        st: 'ready', vals: vals, label: 'Release the bonus',
        run: async function () { await tx('challenge', 'Release #' + K.id, CFG.lantern, C.encode('release', ['uint256'], [K.id])); }
      };
    }
    return {
      st: 'ready', vals: vals, label: 'Challenge',
      run: async function () {
        await approve('challenge', CFG.asset, CFG.lantern, stake, 'stake');
        await tx('challenge', 'Challenge #' + K.id, CFG.lantern,
          C.encode('openChallenge', ['uint256', 'uint8', 'bytes', 'uint256'], [K.id, 4, CFG.peer, stake]));
      }
    };
  }

  function vVerdict() {
    var s = S, d = derive();
    if (s.ch.resolved) {
      return { st: 'done', vals: [['verdict', s.ch.upheld ? 'upheld' : 'refused'], ['spread', pct(d.spread)],
        ['bonus to', s.esc.outcome === 2 ? 'borrower' : 'liquidator'], ['prover paid', hold(s.ch.upheld ? s.esc.bonus * s.bounty / BPS : 0n)]] };
    }
    if (s.esc.outcome !== 0) return { st: 'done', vals: [['bonus to', 'liquidator']] };
    return {
      st: 'ready', vals: [['spread', pct(d.spread)], ['tolerance', pct(TOLERANCE)], ['expected', d.spread > TOLERANCE ? 'upheld' : 'refused']],
      label: 'Adjudicate',
      run: async function () { await tx('verdict', 'Adjudicate #' + K.id, CFG.lantern, C.encode('adjudicate', ['uint256'], [K.id])); }
    };
  }

  function vClaim() {
    var s = S;
    if (!liquidated() || s.esc.outcome === 0) return { st: 'todo', vals: [['collateral', liquidated() ? weth(s.sz.collateral) + ' WETH' : '\u2014'], ['goes to', 'decided by the verdict']] };
    var to = s.esc.outcome === 2 ? 'borrower' : 'liquidator';
    if (s.sz.state === 2) return { st: 'done', vals: [['collateral to', to], ['amount', weth(s.sz.collateral) + ' WETH']] };
    return {
      st: 'ready', vals: [['collateral', weth(s.sz.collateral) + ' WETH'], ['goes to', to]], label: 'Settle',
      run: async function () { await tx('claim', 'Settle #' + K.id, CFG.market, C.encode('claim', ['uint256'], [K.id])); }
    };
  }

  var PREVIEW = {
    fund: 'claim 1 HOLD from the faucet, wrap a little ETH',
    print: 'publish Chainlink\u2019s ETH/USD as the feed\u2019s next round',
    borrow: 'post WETH, borrow 95% of the limit',
    lie: 'publish a print 15% low: the position goes under',
    peer: 'publish Chainlink again on the second feed, same round',
    liquidate: 'the market closes half the debt at the lie; the bonus is held',
    challenge: 'stake on CROSS_SOURCE: the two feeds disagree past 5%',
    verdict: 'the contract recomputes the rule from its own state',
    claim: 'collateral goes back to the borrower if upheld'
  };
  var STEPS = [
    { k: 'fund', t: 'Fund the wallet', who: 'you', v: vFund },
    { k: 'print', t: 'Honest print', who: 'feed operator', v: vPrint },
    { k: 'borrow', t: 'Open a position', who: 'borrower', v: vBorrow },
    { k: 'lie', t: 'Lying print', who: 'feed operator', v: vLie },
    { k: 'peer', t: 'Second source', who: 'peer operator', v: vPeer },
    { k: 'liquidate', t: 'Market liquidates', who: 'liquidator', v: vLiq },
    { k: 'challenge', t: 'Challenge', who: 'prover', v: vChallenge },
    { k: 'verdict', t: 'Verdict', who: 'anyone', v: vVerdict },
    { k: 'claim', t: 'Settle', who: 'anyone', v: vClaim }
  ];

  // a step is only actionable once every step before it is done
  function plan() {
    var blockedBefore = false;
    return STEPS.map(function (s) {
      var v;
      try { v = s.v(); } catch (e) { v = { st: 'blocked', vals: [], note: e.message }; }
      if (blockedBefore && v.st !== 'done') v = { st: 'todo', vals: v.vals };
      if (v.st !== 'done') blockedBefore = true;
      return { s: s, v: v };
    });
  }

  function gate() {
    if (!window.ethereum) return { why: 'No wallet in this browser' };
    if (!W.account) return { why: 'No wallet connected', label: 'Connect wallet', fn: function () { return C.connect(); } };
    if (W.chain !== CFG.chainId) return { why: 'Wallet is on chain ' + W.chain, label: 'Switch to Arbitrum Sepolia', fn: function () { return C.switchChain(); } };
    if (S && S.eth === 0n) return { why: 'No ETH for gas on Arbitrum Sepolia' };
    return null;
  }

  async function runStep(k) {
    if (busy) return false;
    if (!S || !K || !S.r1) return false;
    var p = plan().filter(function (x) { return x.s.k === k; })[0];
    if (!p || p.v.st !== 'ready' || gate()) return false;
    busy = k; lastErr = ''; render();
    var ok = true;
    try { await p.v.run(); } catch (e) { ok = false; lastErr = (e && (e.message || e.code)) || String(e); }
    busy = null;
    await safeRefresh();
    try { await C.refreshBalances(); } catch (e) { }
    if (window.LanternDash) window.LanternDash.reload();
    return ok;
  }
  async function runAll() {
    for (var guard = 0; guard < STEPS.length + 2; guard++) {
      var next = plan().filter(function (x) { return x.v.st !== 'done'; })[0];
      if (!next || next.v.st !== 'ready') return;
      if (!(await runStep(next.s.k))) return;
    }
  }
  async function safeRefresh() {
    try { await refresh(); } catch (e) { lastErr = 'chain read failed: ' + (e.message || e); render(); }
  }

  /* ---------------------------------------------------------------- render */
  var $ = function (id) { return document.getElementById(id); };
  function kv(pairs) { return pairs.map(function (p) { return '<span><i>' + esc(p[0]) + '</i>' + esc(p[1]) + '</span>'; }).join(''); }
  function txLinks(k) {
    var list = K && K.tx[k] || [];
    return list.map(function (t) {
      return '<a class="rs-l ' + (t.s === 'ok' ? 'ok' : 'bad') + '" href="' + CFG.explorer + '/tx/' + t.h + '" target="_blank" rel="noopener">' + esc(t.l) + ' \u2197</a>';
    }).join('');
  }

  function renderStrip() {
    if (!S) return;
    var gap = S.subj.exists ? absBps(S.subj.value, S.cl) : 0n;
    var cells = [
      ['ETH/USD \u00b7 Chainlink', usd(S.cl)],
      ['Subject feed \u00b7 r' + S.subj.round, S.subj.exists ? usd(S.subj.value) : '\u2014'],
      ['Off Chainlink', pct(gap), gap > TOLERANCE ? 'bad' : 'ok'],
      ['Bond \u00b7 needs ' + hold(S.required), hold(S.bond), S.priceable ? 'ok' : 'bad'],
      ['Caught prints', String(S.errors)],
      ['Block', S.block.toLocaleString('en-US')]
    ];
    $('runStrip').innerHTML = cells.map(function (c) {
      return '<div class="rc' + (c[2] ? ' ' + c[2] : '') + '"><span>' + esc(c[0]) + '</span><b>' + esc(c[1]) + '</b></div>';
    }).join('');
  }

  function renderSide() {
    var g = gate();
    $('rwAcct').textContent = W.account ? short(W.account) : 'not connected';
    $('rwChain').textContent = W.chain ? (W.chain === CFG.chainId ? 'Arbitrum Sepolia' : 'chain ' + W.chain) : '\u2014';
    $('rwChain').className = 'pill ' + (W.chain === CFG.chainId ? 'ok' : W.chain ? 'bad' : '');
    var btn = $('rwBtn');
    btn.style.display = g && g.fn ? '' : 'none';
    if (g && g.fn) btn.querySelector('span').textContent = g.label;
    if (!S) return;
    $('rwVals').innerHTML = W.account ? kv([['ETH', fx(S.eth, 18, 6)], ['HOLD', hold(S.hold)], ['WETH', weth(S.weth)]]) : '';
    var a = S.acct, h = S.hNow;
    $('rpVals').innerHTML = W.account ? kv([['posted', weth(a.posted) + ' WETH'], ['debt', hold(a.debt) + ' HOLD'],
      ['limit at ' + (S.subj.exists ? usd(S.subj.value) : '\u2014'), h ? hold(h.limit) + ' HOLD' : '\u2014'], ['lent', hold(a.supplied) + ' HOLD']]) : '';
    var ratio = h && h.limit > 0n ? Number(h.debt * 1000n / h.limit) / 10 : 0;
    $('rpBar').style.setProperty('--w', Math.min(100, ratio) + '%');
    $('rpBar').className = 'hbar' + (ratio > 100 ? ' over' : ratio > 85 ? ' near' : '');
    $('rpRatio').textContent = h && h.limit > 0n ? ratio.toFixed(1) + '% of limit' : '\u2014';
    var can = !g && !busy;
    $('rpRepay').disabled = !(can && a.debt > 0n && S.hold >= a.debt);
    $('rpWithdraw').disabled = !(can && a.debt === 0n && a.posted > 0n);
    $('rpUnlend').disabled = !(can && a.supplied > 0n && S.idle > 0n);
  }

  function render() {
    renderSide();
    if (!S) return;
    renderStrip();
    var g = gate();
    $('runGate').innerHTML = g ? '<span class="dot bad"></span>' + esc(g.why) : '';
    $('runGate').style.display = g ? '' : 'none';
    $('runErr').textContent = lastErr;
    $('runErr').classList.toggle('show', !!lastErr);
    $('newCase').disabled = !!busy;
    if (!K) {
      $('caseTitle').textContent = 'No case yet';
      $('caseSub').textContent = '';
      $('runSteps').innerHTML = STEPS.map(function (x, i) {
        return '<li class="rs st-todo"><span class="rs-n">' + (i + 1) + '</span><div class="rs-m"><div class="rs-t">' + esc(x.t) + '<em>' + esc(x.who) + '</em></div>' +
          '<div class="rs-v"><span>' + esc(PREVIEW[x.k]) + '</span></div></div><div class="rs-a"></div></li>';
      }).join('');
      $('runAll').disabled = true;
      $('gapRow').style.display = 'none';
      return;
    }
    if (!S.r1) {   // the case exists but its reads have not landed yet
      $('caseTitle').textContent = 'Case #' + K.id;
      $('caseSub').textContent = 'reading\u2026';
      $('runSteps').innerHTML = '<li class="rs-empty">Reading the case from the chain\u2026</li>';
      $('runAll').disabled = true;
      return;
    }
    var p = plan(), done = p.filter(function (x) { return x.v.st === 'done'; }).length;
    $('caseTitle').textContent = 'Case #' + K.id;
    $('caseSub').textContent = 'rounds ' + K.r1 + ' \u2192 ' + K.r2 + ' \u00b7 ' + done + ' of ' + p.length + ' done';
    $('gapRow').style.display = '';
    $('gapIn').disabled = S.r2.exists || !!busy;
    $('gapOut').textContent = '\u2212' + (K.gap / 100) + '%';
    var next = p.filter(function (x) { return x.v.st !== 'done'; })[0];
    $('runAll').disabled = !!busy || !!g || !next || next.v.st !== 'ready';
    $('runAll').querySelector('span').textContent = busy ? 'Waiting for the chain\u2026' : next ? 'Run from step ' + (p.indexOf(next) + 1) : 'Case closed';
    $('runSteps').innerHTML = p.map(function (x, i) {
      var st = busy === x.s.k ? 'busy' : x.v.st;
      var action = st === 'ready'
        ? '<button class="go rs-go" data-step="' + x.s.k + '"' + (g || busy ? ' disabled' : '') + '>' + esc(x.v.label || 'Send') + '</button>'
        : '<span class="rs-st">' + ({ done: 'done', todo: 'next', wait: 'waiting', blocked: 'blocked', busy: 'sending\u2026' }[st]) + '</span>';
      return '<li class="rs st-' + st + '"><span class="rs-n">' + (st === 'done' ? '\u2713' : i + 1) + '</span>' +
        '<div class="rs-m"><div class="rs-t">' + esc(x.s.t) + '<em>' + esc(x.s.who) + '</em></div>' +
        '<div class="rs-v">' + kv(x.v.vals || []) + '</div>' +
        (x.v.note ? '<div class="rs-x">' + esc(x.v.note) + '</div>' : '') +
        '<div class="rs-tx">' + txLinks(x.s.k) + '</div></div>' +
        '<div class="rs-a">' + action + '</div></li>';
    }).join('');
  }

  /* ---------------------------------------------------------------- wiring */
  $('runSteps').addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-step]');
    if (b) runStep(b.getAttribute('data-step'));
  });
  $('runAll').addEventListener('click', runAll);
  $('newCase').addEventListener('click', newCase);
  $('gapIn').addEventListener('input', function () {
    if (!K) return;
    K.gap = Number(this.value) * 100; save(); render();
  });
  $('gapIn').addEventListener('change', function () { safeRefresh(); });
  $('rwBtn').addEventListener('click', async function () {
    var g = gate();
    if (!g || !g.fn) return;
    try { await g.fn(); } catch (e) { lastErr = (e && (e.message || e.code)) || 'the wallet refused'; }
    await safeRefresh();
  });
  async function posAct(label, fn) {
    if (busy) return;
    busy = 'position'; lastErr = ''; render();
    try { await fn(); } catch (e) { lastErr = (e && e.message) || String(e); }
    busy = null; await safeRefresh();
    if (window.LanternDash) window.LanternDash.reload();
  }
  $('rpRepay').addEventListener('click', function () {
    posAct('repay', async function () {
      var debt = S.acct.debt;
      await approve('position', CFG.asset, CFG.market, debt, 'HOLD');
      await tx('position', 'Repay ' + hold(debt) + ' HOLD', CFG.market, C.encode('repay', ['uint256'], [debt]));
    });
  });
  $('rpWithdraw').addEventListener('click', function () {
    posAct('withdraw', async function () {
      var p = S.acct.posted;
      await tx('position', 'Withdraw ' + weth(p) + ' WETH', CFG.market, C.encode('withdrawCollateral', ['uint256'], [p]));
    });
  });
  $('rpUnlend').addEventListener('click', function () {
    posAct('unlend', async function () {
      var amt = S.acct.supplied < S.idle ? S.acct.supplied : S.idle;
      await tx('position', 'Withdraw ' + hold(amt) + ' HOLD lent', CFG.market, C.encode('withdraw', ['uint256'], [amt]));
    });
  });

  if (K) $('gapIn').value = String(K.gap / 100);
  C.onChange(function () { if (!busy) { renderSide(); } });
  // a wallet change changes every per-account read
  var lastAcct = null;
  setInterval(function () {
    if (W.account !== lastAcct) { lastAcct = W.account; if (!busy) safeRefresh(); }
    else if (S && !busy && document.getElementById('view-run').classList.contains('active')) render();
  }, 1000);
  setInterval(function () { if (!busy && !document.hidden) safeRefresh(); }, 20000);
  window.LanternRun = { refresh: safeRefresh, runStep: runStep, runAll: runAll, newCase: newCase, state: function () { return { S: S, K: K, busy: busy, err: lastErr }; } };
  safeRefresh();
})();
