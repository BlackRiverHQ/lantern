/* console.js — the operator console. Connects an injected wallet, encodes the protocol's own calls,
   sends them as real transactions, and reads the receipt back. No dependencies.

   Every function selector and error selector here was produced by `cast sig` against the compiled
   source, not typed by hand; test/console.test.mjs re-derives the calldata and compares. */
(function () {
  'use strict';

  var CHAIN = 421614;
  var CFG = {
    chainId: CHAIN,
    lantern: '0x9420b6B3e5Cc8FC028b34206F9C0388230a6B772',
    market: '0x53fFF340f1e6796F905985E43e7a784b0e687066',
    asset: '0xfF062343892989373F422F7543F0587581594249',
    decimals: 18,
    explorer: 'https://sepolia.arbiscan.io',
    rpc: 'https://sepolia-rollup.arbitrum.io/rpc'
  };
  // a test harness may supply its own, so the same page can run against a local chain
  if (window.__LANTERN__) for (var k in window.__LANTERN__) CFG[k] = window.__LANTERN__[k];

  var SIGS = {
    approve: '0x095ea7b3',              // approve(address,uint256)
    registerFeed: '0x612fd484',         // registerFeed(bytes32,bytes32,uint8)
    setPeerFeed: '0x0475b1c2',          // setPeerFeed(bytes32,bytes32)
    depositBond: '0x09e08644',          // depositBond(bytes32,uint256)
    withdrawBond: '0x450706d3',         // withdrawBond(bytes32,uint256)
    recordReport: '0x65e9adac',         // recordReport(bytes32,uint256,uint64,uint64,bytes32,address)
    openChallenge: '0x09917500',        // openChallenge(uint256,uint8,bytes,uint256)
    adjudicate: '0xcf8d0657',           // adjudicate(uint256)
    voidStaleChallenge: '0x6b3f5fe2',   // voidStaleChallenge(uint256)
    release: '0x37bdc99b',              // release(uint256)
    liquidate: '0xb9ebf0f0',            // liquidate(uint256,bytes32,uint64,uint256,address)
    liquidateWithNotional: '0xdfa60838', // liquidateWithNotional(uint256,bytes32,uint64,uint256,uint256,address)
    balanceOf: '0x70a08231',            // balanceOf(address)
    allowance: '0xdd62ed3e'             // allowance(address,address)
  };

  // ILanternErrors, every selector from `cast sig`
  var ERRORS = {
    '0xbfae38b3': 'NotMarket(address)',
    '0x08a47fe2': 'UnknownFeed(bytes32)',
    '0xd09bc9e1': 'FeedAlreadyRegistered(bytes32)',
    '0xe01218e4': 'UnderBonded(bytes32,uint256,uint256)',
    '0x1f96851f': 'ReportTooOld(bytes32,uint64,uint64)',
    '0xd41b1623': 'RoundNotMonotone(bytes32,uint64,uint64)',
    '0xcf452d27': 'SlotConflict(bytes32,uint64)',
    '0xc30ad91a': 'PayloadReused(bytes32)',
    '0x0f8109a5': 'ValueOutsideBand(bytes32,uint256,uint256,uint256)',
    '0x91d2bfcf': 'DriftExceeded(uint256,uint256,uint256)',
    '0x5827df0f': 'UnknownLiquidation(uint256)',
    '0xf2edb43d': 'LiquidationAlreadySettled(uint256)',
    '0x184663dd': 'WindowClosed(uint256,uint256)',
    '0xe5168562': 'WindowOpen(uint256,uint256)',
    '0x1ea62985': 'ChallengeAlreadyOpen(uint256)',
    '0x46bb1c0f': 'UnknownChallenge(uint256)',
    '0x327caf12': 'ChallengeAlreadyResolved(uint256)',
    '0x78e030db': 'StakeBelowMinimum(uint256,uint256)',
    '0xcb3a13f7': 'EmptyEvidence()',
    '0x32fdd665': 'BadRuleKind(uint8)',
    '0xc389ece3': 'NothingToPay(uint256)',
    '0x1f2a2005': 'ZeroAmount()',
    '0xd92e233d': 'ZeroAddress()',
    '0x1a30f243': 'ImmutableParameter()',
    '0x8e9ad41c': 'BadDecimals(uint256)',
    '0x3c868ec6': 'DecimalsMismatch(uint8,uint8)',
    '0xab143c06': 'Reentrancy()',
    '0xc55e5473': 'ChallengeStillFresh(uint256)',
    '0x273e0fd2': 'PeerAlreadyDeclared(bytes32)',
    '0xf52a3023': 'BadPeer(bytes32,bytes32)',
    '0x9aafae02': 'ReportTooThin(bytes32,uint64,uint64)',
    // the asset's own refusals, which a bond or a stake can also run into
    '0x7939f424': 'TransferFromFailed()',
    '0xf4d678b8': 'InsufficientBalance()',
    '0x13be252b': 'InsufficientAllowance()'
  };

  var RULES = ['SLOT_UNIQUENESS', 'ROUND_ORDERING', 'SELF_HISTORY', 'PAYLOAD_PROVENANCE', 'CROSS_SOURCE'];

  /* ---------------------------------------------------------------- encoding */
  var H = function (n) { return n.toString(16); };
  function word(hexNo0x) { return hexNo0x.padStart(64, '0'); }
  function encUint(v) {
    var b = BigInt(v);
    if (b < 0n) throw new Error('negative value');
    return word(b.toString(16));
  }
  function encAddress(a) {
    a = String(a).trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error('not an address: ' + a);
    return word(a.slice(2).toLowerCase());
  }
  function encBytes32(v) {
    v = String(v).trim();
    if (/^0x[0-9a-fA-F]{64}$/.test(v)) return word(v.slice(2).toLowerCase());
    if (/^[0-9a-fA-F]{64}$/.test(v)) return word(v.toLowerCase());
    // anything else is hashed, so a readable label can be passed where an id is expected
    return word(bytes32FromKeccak(keccak256(stringToBytes(v))).slice(2));
  }
  function stringToBytes(s) {
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 128) out.push(c);
      else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63));
      else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
    }
    return out;
  }
  function bytesToHex(bytes) { return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
  function hexToBytes(hex) {
    hex = String(hex).replace(/^0x/, '');
    var out = [], i;
    for (i = 0; i < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
    return out;
  }

  // keccak-256, enough for hashing ids and not for anything else
  var RC = [1n, 32898n, 9223372036854808714n, 9223372039002292224n, 32907n, 2147483649n, 9223372039002292353n,
    9223372036854808585n, 138n, 136n, 2147516425n, 2147483658n, 2147516555n, 9223372036854775947n,
    9223372036854808713n, 9223372036854808579n, 9223372036854808578n, 9223372036854775936n, 32778n, 9223372039002259466n,
    9223372039002292353n, 9223372036854808704n, 2147483649n, 9223372039002292232n];
  var R = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]];
  var M = (1n << 64n) - 1n;
  function rol(x, n) { n = BigInt(n); return ((x << n) | (x >> (64n - n))) & M; }
  function keccakF(st) {
    var round, i, j, c = [], d = [], b = [];
    for (i = 0; i < 5; i++) { b[i] = []; for (j = 0; j < 5; j++) b[i][j] = 0n; }
    for (round = 0; round < 24; round++) {
      for (i = 0; i < 5; i++) c[i] = st[i][0] ^ st[i][1] ^ st[i][2] ^ st[i][3] ^ st[i][4];
      for (i = 0; i < 5; i++) d[i] = c[(i + 4) % 5] ^ rol(c[(i + 1) % 5], 1);
      for (i = 0; i < 5; i++) for (j = 0; j < 5; j++) st[i][j] ^= d[i];
      for (i = 0; i < 5; i++) for (j = 0; j < 5; j++) b[j][(2 * i + 3 * j) % 5] = rol(st[i][j], R[i][j]);
      for (i = 0; i < 5; i++) for (j = 0; j < 5; j++) st[i][j] = b[i][j] ^ ((~b[(i + 1) % 5][j]) & b[(i + 2) % 5][j]);
      st[0][0] ^= RC[round];
    }
    return st;
  }
  function keccak256(bytes) {
    var rate = 136, st = [], i, j;
    for (i = 0; i < 5; i++) { st[i] = []; for (j = 0; j < 5; j++) st[i][j] = 0n; }
    var input = bytes.slice();
    input.push(1);
    while (input.length % rate !== 0) input.push(0);
    input[input.length - 1] |= 0x80;
    for (var off = 0; off < input.length; off += rate) {
      for (i = 0; i < rate / 8; i++) {
        var lane = 0n;
        for (j = 7; j >= 0; j--) lane = (lane << 8n) | BigInt(input[off + i * 8 + j]);
        st[i % 5][Math.floor(i / 5)] ^= lane;
      }
      keccakF(st);
    }
    var out = [];
    for (i = 0; i < 4; i++) {
      var word = st[i % 5][Math.floor(i / 5)];
      for (j = 0; j < 8; j++) out.push(Number((word >> BigInt(8 * j)) & 255n));
    }
    return '0x' + bytesToHex(out);
  }
  function bytes32FromKeccak(hex) { return '0x' + hex.replace(/^0x/, '').slice(0, 64); }

  // calldata: selector + head words (+ tails for dynamic bytes)
  function encode(sig, types, values) {
    var head = '', tail = '', i;
    for (i = 0; i < types.length; i++) {
      var t = types[i], v = values[i];
      if (t === 'bytes') {
        var hex = typeof v === 'string' && /^0x[0-9a-fA-F]*$/.test(v) ? v.replace(/^0x/, '') : bytesToHex(stringToBytes(String(v)));
        if (hex.length % 2) hex += '0';
        var len = hex.length / 2;
        var padded = hex;
        while (padded.length % 64) padded += '0';
        head += word(H(32 * (types.length + tail.length / 32))); // offset, in bytes, from the start of the args
        tail += word(H(len)) + padded;
      } else if (t === 'address') head += encAddress(v);
      else if (t === 'bytes32') head += encBytes32(v);
      else head += encUint(v);
    }
    return SIGS[sig] + head + (tail || '');
  }

  function decodeError(data) {
    if (!data || data.length < 10) return null;
    var sel = data.slice(0, 10).toLowerCase();
    var name = ERRORS[sel];
    if (!name) return null;
    var types = name.slice(name.indexOf('(') + 1, -1).split(',').filter(Boolean);
    var args = [], i;
    for (i = 0; i < types.length; i++) {
      var w = data.slice(10 + i * 64, 10 + (i + 1) * 64);
      if (!w || !/^[0-9a-fA-F]{64}$/.test(w)) break;
      args.push(types[i] === 'address' ? '0x' + w.slice(24).toLowerCase() : BigInt('0x' + w).toString());
    }
    return name.slice(0, name.indexOf('(')) + '(' + args.join(', ') + ')';
  }

  /* ---------------------------------------------------------------- amounts */
  function parseUnits(text) {
    text = String(text).trim();
    if (!text) throw new Error('empty amount');
    var m = /^(\d*)(?:\.(\d*))?$/.exec(text);
    if (!m) throw new Error('not a number: ' + text);
    var whole = m[1] || '0', frac = (m[2] || '').slice(0, CFG.decimals);
    while (frac.length < CFG.decimals) frac += '0';
    return BigInt(whole) * 10n ** BigInt(CFG.decimals) + BigInt(frac || '0');
  }
  function formatUnits(v) {
    v = BigInt(v);
    var whole = v / 10n ** BigInt(CFG.decimals), frac = v % 10n ** BigInt(CFG.decimals);
    var f = frac.toString().padStart(CFG.decimals, '0').slice(0, 4).replace(/0+$/, '');
    return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
  }

  /* ---------------------------------------------------------------- wallet */
  var W = { provider: null, account: null, chain: null, balance: 0n, eth: 0n };
  var listeners = [];

  function provider() {
    var p = window.ethereum;
    if (!p) throw new Error('no wallet in this browser');
    return p;
  }
  function request(method, params) { return provider().request({ method: method, params: params || [] }); }

  async function connect() {
    var p = provider();
    var accounts = await p.request({ method: 'eth_requestAccounts' });
    W.provider = p;
    W.account = accounts && accounts[0];
    W.chain = parseInt(await p.request({ method: 'eth_chainId' }), 16);
    if (p.on) p.on('accountsChanged', function (a) { W.account = a && a[0]; refreshBalances(); notify(); });
    if (p.on) p.on('chainChanged', function (c) { W.chain = parseInt(c, 16); refreshBalances(); notify(); });
    await refreshBalances();
    notify();
    return W;
  }
  async function switchChain() {
    var p = provider();
    try {
      await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + CHAIN.toString(16) }] });
    } catch (e) {
      if (e && (e.code === 4902 || /Unrecognized chain/i.test(e.message || ''))) {
        await p.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x' + CHAIN.toString(16),
            chainName: 'Arbitrum Sepolia',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: [CFG.rpc],
            blockExplorerUrls: [CFG.explorer]
          }]
        });
      } else throw e;
    }
    W.chain = parseInt(await p.request({ method: 'eth_chainId' }), 16);
    notify();
  }
  async function refreshBalances() {
    if (!W.account) return;
    W.balance = await request('eth_call', [{ to: CFG.asset, data: SIGS.balanceOf + encAddress(W.account) }, 'latest']).then(BigInt);
    W.allowance = await request('eth_call', [{ to: CFG.asset, data: SIGS.allowance + encAddress(W.account) + encAddress(CFG.lantern) }, 'latest']).then(BigInt);
    W.eth = BigInt(await request('eth_getBalance', [W.account, 'latest']));
    notify();
  }

  /* ---------------------------------------------------------------- sending */
  var log = [];

  // ask the chain what a call would do before anything is signed: a refusal costs no gas
  async function simulate(to, calldata) {
    try {
      await request('eth_call', [{ from: W.account, to: to, data: calldata }, 'latest']);
      return { ok: true };
    } catch (e) {
      var d = e && (e.data || (e.info && e.info.error && e.info.error.data));
      if (d && typeof d === 'object') d = d.data || null;
      var reason = null;
      try { reason = decodeError(typeof d === 'string' ? d : null); } catch (x) { reason = null; }
      return { ok: false, reason: reason || (e && e.message) || 'the chain refused it' };
    }
  }
  async function send(label, to, calldata) {
    var hash = await request('eth_sendTransaction', [{ from: W.account, to: to, data: calldata }]);
    var entry = { label: label, hash: hash, status: 'pending', to: to };
    log.unshift(entry);
    notify();
    return wait(hash, entry);
  }
  async function wait(hash, entry) {
    for (var i = 0; i < 120; i++) {
      var r = await request('eth_getTransactionReceipt', [hash]);
      if (r) {
        entry.status = r.status === '0x1' ? 'ok' : 'reverted';
        entry.block = parseInt(r.blockNumber, 16);
        entry.gas = parseInt(r.gasUsed, 16);
        if (entry.status === 'reverted') {
          entry.reason = await reasonFor(hash);
        }
        notify();
        return entry;
      }
      await new Promise(function (res) { setTimeout(res, 1000); });
    }
    entry.status = 'timeout';
    notify();
    return entry;
  }
  async function reasonFor(hash) {
    // replay the call against the block it landed in to recover the revert data
    var data = null, msg = null;
    try {
      var tx = await request('eth_getTransactionByHash', [hash]);
      var rec = await request('eth_getTransactionReceipt', [hash]);
      var tag = rec && rec.blockNumber ? rec.blockNumber : 'latest';
      await request('eth_call', [{ from: tx.from, to: tx.to, data: tx.input }, tag]);
    } catch (e) {
      msg = e && e.message;
      var d = e && (e.data || (e.info && e.info.error && e.info.error.data));
      if (d && typeof d === 'object') d = d.data || null;
      data = typeof d === 'string' ? d : null;
    }
    try { return decodeError(data) || msg || 'the call was refused'; }
    catch (e) { return msg || 'the call was refused'; }
  }
  function notify() { listeners.forEach(function (f) { f(); }); }

  window.LanternConsole = {
    CFG: CFG, SIGS: SIGS, RULES: RULES, W: W,
    connect: connect, switchChain: switchChain, refreshBalances: refreshBalances,
    encode: encode, decodeError: decodeError, keccak256: keccak256,
    parseUnits: parseUnits, formatUnits: formatUnits, stringToBytes: stringToBytes, bytesToHex: bytesToHex,
    send: send, simulate: simulate, log: log, onChange: function (f) { listeners.push(f); }
  };
})();
