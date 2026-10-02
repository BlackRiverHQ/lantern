/* dashboard.js — routing, the network light, and the Cases list: every liquidation on chain, how it
   ended, and the transactions that decided it. No dependencies. */
(function () {
  'use strict';

  var CFG = {
    rpcs: ['https://sepolia-rollup.arbitrum.io/rpc', 'https://arbitrum-sepolia-rpc.publicnode.com'],
    chainId: 421614,
    lantern: '0xcdce3a1b3ebf7fe1e340ab670e25fe768195ac54',
    market: '0x290714d09f6d1ab50f7c31698eda92993ab01f95',
    decimals: 6,
    fromBlock: 315054532,
    explorer: 'https://arbitrum-sepolia.blockscout.com'
  };
  if (window.__LANTERN__) for (var k in window.__LANTERN__) CFG[k] = window.__LANTERN__[k];

  // every topic from `cast keccak` of the event signature; test/run.test.mjs re-derives them
  var T = {
    LiquidationRecorded: '0x3dc45dc4282f1b79aa977ca44f3966fd1e704e1d7264c8235464dc0b2a15460b',
    ChallengeOpened: '0x26e5b086c073f25dd812ce01efd7524233489555f5b0591253c4f236bb79762d',
    ChallengeUpheld: '0x55b829cef7cad8bef1a62cf7e471ae3491efb3576757129e5be9e03ec1284077',
    ChallengeRefused: '0x18e16cc42c00099c04eeb2326ae0f0e407a334a3a3703e1fcf304fc37e1291b6',
    ChallengeVoided: '0x44fd6fd4050e131e47fdf9e3b4a731eb20fb723105dc1d48852fc5864dccba26',
    BonusReleased: '0x3334a79f183e2e8b5df01c85de8e210f33d28b3342852eb454ea5d5d975a3ff3',
    Liquidated: '0x3aee02da1bacc0c74340c75630e203d96410d71752a82e5c217d9776121c0128',
    SeizureClaimed: '0x55e2834809ea7fc030129769f879fda1d5a1612c8aec06845620813bfb9231d8'
  };
  var NAME = {}; Object.keys(T).forEach(function (n) { NAME[T[n]] = n; });
  var RULE = ['one feed, two values', 'stale price', 'outside its own history', 'wrong payload', 'two sources disagree'];
  var LABEL = {
    LiquidationRecorded: 'Liquidated, profit held', Liquidated: 'Collateral taken', ChallengeOpened: 'Challenged',
    ChallengeUpheld: 'Proof upheld', ChallengeRefused: 'Proof refused', ChallengeVoided: 'Challenge voided',
    BonusReleased: 'Profit released', SeizureClaimed: 'Settled'
  };
  var VIEWS = { run: 'Run a case', cases: 'Cases' };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var E = 10n ** BigInt(CFG.decimals);
  function hold(v) {
    var w = v / E, f = (v % E + E).toString().slice(1, 5).replace(/0+$/, '');
    return w.toString() + (f ? '.' + f : '') + ' HOLD';
  }
  function short(a) { return a.slice(0, 6) + '\u2026' + a.slice(-4); }
  function ago(sec) {
    var d = Math.max(0, Math.floor(Date.now() / 1000) - sec);
    if (d < 90) return d + 's ago'; if (d < 5400) return Math.round(d / 60) + 'm ago';
    if (d < 129600) return Math.round(d / 3600) + 'h ago'; return Math.round(d / 86400) + 'd ago';
  }

  var ri = 0, rid = 1;
  async function rpc(method, params) {
    var last;
    for (var t = 0; t < CFG.rpcs.length * 2; t++) {
      try {
        var r = await fetch(CFG.rpcs[ri], { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: rid++, method: method, params: params }) });
        var j = await r.json();
        if (j.error) throw new Error(j.error.message || 'rpc error');
        return j.result;
      } catch (e) { last = e; ri = (ri + 1) % CFG.rpcs.length; }
    }
    throw last;
  }
  function word(hex, i) { return BigInt('0x' + (hex.slice(2 + i * 64, 2 + i * 64 + 64) || '0')); }

  function setNet(ok, text) { $('#netDot').className = 'dot ' + (ok ? 'ok' : 'bad'); $('#netText').textContent = text; }

  /* ---------- cases ---------- */
  var cases = [], open = null, blockTs = {};
  async function loadCases() {
    var from = '0x' + CFG.fromBlock.toString(16);
    var logs = await Promise.all([
      rpc('eth_getLogs', [{ address: CFG.lantern, fromBlock: from, toBlock: 'latest' }]),
      rpc('eth_getLogs', [{ address: CFG.market, fromBlock: from, toBlock: 'latest' }])
    ]);
    var by = {};
    logs[0].concat(logs[1]).forEach(function (l) {
      var n = NAME[l.topics[0]]; if (!n) return;
      var id = Number(BigInt(l.topics[1]));
      var c = by[id] = by[id] || { id: id, ev: [] };
      c.ev.push({ n: n, block: parseInt(l.blockNumber, 16), li: parseInt(l.logIndex, 16), tx: l.transactionHash, l: l });
    });
    cases = Object.keys(by).map(function (k) { return by[k]; }).filter(function (c) { return c.ev.some(function (e) { return e.n === 'LiquidationRecorded'; }); });
    cases.forEach(function (c) {
      c.ev.sort(function (a, b) { return a.block - b.block || a.li - b.li; });
      var has = function (n) { return c.ev.filter(function (e) { return e.n === n; })[0]; };
      var liq = has('LiquidationRecorded'), m = has('Liquidated'), op = has('ChallengeOpened'), up = has('ChallengeUpheld');
      c.bonus = word(liq.l.data, 0);
      c.block = liq.block;
      c.borrower = m ? '0x' + m.l.topics[2].slice(-40) : null;
      c.rule = op ? Number(word(op.l.data, 0)) : null;
      c.gap = up && Number(word(up.l.data, 0)) === 4 ? Number(word(up.l.data, 1)) : null;
      c.result = up ? 'upheld' : has('ChallengeRefused') ? 'refused' : has('ChallengeVoided') ? 'voided' : has('BonusReleased') ? 'released' : 'open';
      c.settled = !!has('SeizureClaimed');
    });
    cases.sort(function (a, b) { return b.block - a.block; });
    // timestamps for the blocks the list shows
    var need = cases.slice(0, 30).map(function (c) { return c.block; }).filter(function (b) { return !blockTs[b]; });
    await Promise.all(need.map(function (b) {
      return rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false]).then(function (x) { blockTs[b] = parseInt(x.timestamp, 16); });
    }));
    renderCases();
  }

  var RESULT = {
    upheld: ['Lie caught', 'Borrower made whole'], refused: ['Proof refused', 'Liquidation stood'],
    voided: ['Challenge voided', 'Liquidation stood'], released: ['No challenge', 'Liquidation stood'],
    open: ['In progress', 'Decision pending']
  };
  function renderCases() {
    var t = $('#caseTable');
    if (!cases.length) { t.innerHTML = '<div class="empty">No cases yet. Run the first one.</div>'; return; }
    var mine = window.LanternConsole && window.LanternConsole.W.account;
    t.innerHTML = '<div class="tr th"><span>Case</span><span>Result</span><span>Profit held</span><span>Rule</span><span>When</span></div>' +
      cases.map(function (c) {
        var r = RESULT[c.result];
        var you = mine && c.borrower && c.borrower.toLowerCase() === mine.toLowerCase();
        return '<div class="tr click' + (open === c.id ? ' sel' : '') + '" data-id="' + c.id + '"><span class="id">#' + c.id + (you ? ' <em class="you">you</em>' : '') + '</span>' +
          '<span><span class="pill ' + c.result + '">' + r[0] + '</span><small class="muted"> ' + r[1] + '</small></span>' +
          '<span class="num">' + hold(c.bonus) + '</span>' +
          '<span class="muted">' + (c.rule === null ? '\u2014' : RULE[c.rule] + (c.gap !== null ? ', ' + (c.gap / 100).toFixed(2) + '% apart' : '')) + '</span>' +
          '<span class="muted">' + (blockTs[c.block] ? ago(blockTs[c.block]) : 'block ' + c.block.toLocaleString('en-US')) + '</span></div>';
      }).join('');
    $$('.tr.click', t).forEach(function (row) { row.addEventListener('click', function () { open = +row.dataset.id; renderCases(); renderDetail(); }); });
    renderDetail();
  }
  function renderDetail() {
    var box = $('#caseDetail'), c = cases.filter(function (x) { return x.id === open; })[0];
    if (!c) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="card"><div class="card-h"><h3>Case #' + c.id + '</h3><span class="pill ' + c.result + '">' + RESULT[c.result][0] + '</span></div>' +
      (c.borrower ? '<p class="muted small">Borrower ' + esc(short(c.borrower)) + '</p>' : '') +
      '<ol class="ctl">' + c.ev.map(function (e) {
        return '<li><b>' + esc(LABEL[e.n] || e.n) + '</b><span class="muted">block ' + e.block.toLocaleString('en-US') + '</span>' +
          '<a href="' + CFG.explorer + '/tx/' + e.tx + '" target="_blank" rel="noopener">View transaction \u2197</a></li>';
      }).join('') + '</ol></div>';
  }

  /* ---------- routing ---------- */
  function route() {
    var v = (location.hash || '#run').slice(1);
    if (!VIEWS[v]) v = 'run';
    $$('.view').forEach(function (s) { s.classList.toggle('active', s.id === 'view-' + v); });
    $$('.side-nav a[data-view]').forEach(function (a) { a.classList.toggle('active', a.dataset.view === v); });
    $('#crumb').textContent = VIEWS[v];
    $('#side').classList.remove('open');
    if (v === 'cases') load();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  $('#menuBtn').addEventListener('click', function () { $('#side').classList.toggle('open'); });

  var loading = null;
  function load() {
    if (loading) return loading;
    loading = rpc('eth_chainId', []).then(function (id) {
      if (parseInt(id, 16) !== CFG.chainId) throw new Error('the RPC answered for another chain');
      setNet(true, 'Live');
      return loadCases();
    }).then(function () { $('#casesErr').classList.remove('show'); }, function (e) {
      setNet(false, 'Offline');
      $('#casesErr').textContent = 'Could not read the chain (' + (e && e.message || e) + '). Retrying shortly.';
      $('#casesErr').classList.add('show');
    }).then(function () { loading = null; });
    return loading;
  }
  setInterval(function () { if (!document.hidden) load(); }, 30000);

  window.LanternDash = { reload: load };
  route();
  load();
})();
