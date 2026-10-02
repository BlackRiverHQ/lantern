/* Lantern site runtime: live chain reads + scroll motion. No dependencies. */
(function () {
  'use strict';

  var CFG = {
    rpcs: ['https://sepolia-rollup.arbitrum.io/rpc', 'https://arbitrum-sepolia-rpc.publicnode.com'],
    chainId: 421614,
    lantern: '0x9420b6B3e5Cc8FC028b34206F9C0388230a6B772',
    subject: '0xf7ed0c5000d57be8bb1723e1298ee49e6a076692f4ef68d27dd00db178f57210',
    peer: '0x0bf35ab8318649a0b126cdc6fb6c89b2ebbb1659b37fbd0b3aca12e6eefa71a2',
    fromBlock: 314930000,
    explorer: 'https://sepolia.arbiscan.io'
  };

  var SEL = {
    heldTotal: '0xb3097a08', holdWindow: '0x3f9006f6', bountyBps: '0x415307cc', minBond: '0x831518b7',
    feedErrors: '0xc4334ab4', bondOf: '0x0fb585ba', requiredBond: '0xcd8f9967', exposureOf: '0x5e40b77b',
    isPriceable: '0x0ac912c7', peerOf: '0x9730d3e5'
  };

  var EV = {
    '0x895b8e5422c82f2848ee2a4b893b1fdd1c8bc5deaee9d81046c9fdb1b5f1e8b9': { n: 'FeedRegistered', idx: ['feedId:b32', 'operator:addr'], data: [] },
    '0x623348ed91259d84faa22f6db90fa32cf5bd3408089ad24d2c892a7abfd4cfd2': { n: 'BondDeposited', idx: ['feedId:b32'], data: ['amount:amt', 'bond:amt'] },
    '0x08bd7b6c89c5f6445a5b76b7bc803f84701e6fc9135fc00d56e4501767c4999b': { n: 'ReportRecorded', idx: ['feedId:b32'], data: ['round:int', 'value:amt'] },
    '0x3dc45dc4282f1b79aa977ca44f3966fd1e704e1d7264c8235464dc0b2a15460b': { n: 'LiquidationRecorded', idx: ['liquidationId:int', 'feedId:b32'], data: ['bonus:amt', 'deadline:time'] },
    '0x26e5b086c073f25dd812ce01efd7524233489555f5b0591253c4f236bb79762d': { n: 'ChallengeOpened', idx: ['liquidationId:int', 'prover:addr'], data: ['rule:rule', 'stake:amt'] },
    '0x55b829cef7cad8bef1a62cf7e471ae3491efb3576757129e5be9e03ec1284077': { n: 'ChallengeUpheld', idx: ['liquidationId:int'], data: ['rule:rule', 'observed:raw', 'bound:raw'] },
    '0x18e16cc42c00099c04eeb2326ae0f0e407a334a3a3703e1fcf304fc37e1291b6': { n: 'ChallengeRefused', idx: ['liquidationId:int'], data: ['stakeForfeited:amt'] },
    '0x44fd6fd4050e131e47fdf9e3b4a731eb20fb723105dc1d48852fc5864dccba26': { n: 'ChallengeVoided', idx: ['liquidationId:int'], data: ['stakeForfeited:amt'] },
    '0xae4e6fb9c28e46d4c55c221ab6ec27e334a1bc8cfd593aa8d87061885e2f252e': { n: 'PeerDeclared', idx: ['feedId:b32', 'peer:b32'], data: [] },
    '0x3334a79f183e2e8b5df01c85de8e210f33d28b3342852eb454ea5d5d975a3ff3': { n: 'BonusReleased', idx: ['liquidationId:int', 'liquidator:addr'], data: ['amount:amt'] }
  };
  var RULES = ['SLOT_UNIQUENESS', 'ROUND_ORDERING', 'SELF_HISTORY', 'PAYLOAD_PROVENANCE', 'CROSS_SOURCE'];
  var EV_COLOR = { LiquidationRecorded: '#7084ff', ChallengeOpened: '#ffb547', ChallengeUpheld: '#ff6b5b', ChallengeRefused: '#8a8d90', ChallengeVoided: '#ffb547', BonusReleased: '#ddff46', ReportRecorded: '#5e6266' };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var map = function (v, a, b, c, d) { return c + (d - c) * clamp((v - a) / (b - a), 0, 1); };

  /* ------------------------------------------------------------------ */
  /* formatting                                                          */
  /* ------------------------------------------------------------------ */
  var E18 = 10n ** 18n;
  function units(big, dp) {
    dp = dp == null ? 3 : dp;
    var neg = big < 0n; if (neg) big = -big;
    var whole = big / E18, frac = big % E18;
    var f = (frac + E18).toString().slice(1, 1 + dp).replace(/0+$/, '');
    var w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + w + (f ? '.' + f : '');
  }
  function short(h) { return h.slice(0, 6) + '…' + h.slice(-4); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ------------------------------------------------------------------ */
  /* JSON-RPC with fallback                                              */
  /* ------------------------------------------------------------------ */
  var rpcIdx = 0, rid = 1;
  function rpc(method, params) {
    var tries = 0;
    function attempt() {
      var url = CFG.rpcs[rpcIdx];
      var ctl = 'AbortController' in window ? new AbortController() : null;
      var t = ctl && setTimeout(function () { ctl.abort(); }, 12000);
      return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: rid++, method: method, params: params }), signal: ctl && ctl.signal })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { if (t) clearTimeout(t); if (j.error) throw new Error(j.error.message || 'rpc error'); return j.result; })
        .catch(function (e) {
          if (t) clearTimeout(t);
          if (++tries < CFG.rpcs.length * 2) { rpcIdx = (rpcIdx + 1) % CFG.rpcs.length; return attempt(); }
          throw e;
        });
    }
    return attempt();
  }
  function call(sel, arg) {
    var data = sel + (arg ? arg.replace(/^0x/, '').padStart(64, '0') : '');
    return rpc('eth_call', [{ to: CFG.lantern, data: data }, 'latest']);
  }
  var U = function (hex) { return BigInt(hex && hex !== '0x' ? hex : '0x0'); };

  /* ------------------------------------------------------------------ */
  /* live reads                                                          */
  /* ------------------------------------------------------------------ */
  var state = {};
  function setRead(key, html) { $$('[data-read="' + key + '"]').forEach(function (el) { el.innerHTML = html; }); }
  function setNet(ok, text) {
    ['#netDot', '#netDot2'].forEach(function (s) { var d = $(s); if (d) { d.className = 'dot ' + (ok ? 'ok' : 'bad'); } });
    $('#netText').textContent = text;
  }
  function showErr(msg) { var b = $('#errBox'); b.textContent = msg; b.classList.add('show'); }

  function loadReads() {
    return Promise.all([
      rpc('eth_chainId', []), rpc('eth_blockNumber', []),
      call(SEL.heldTotal), call(SEL.holdWindow), call(SEL.bountyBps), call(SEL.minBond),
      call(SEL.feedErrors, CFG.subject), call(SEL.bondOf, CFG.subject), call(SEL.requiredBond, CFG.subject),
      call(SEL.exposureOf, CFG.subject), call(SEL.isPriceable, CFG.subject),
      call(SEL.peerOf, CFG.subject)
    ]).then(function (r) {
      var chain = parseInt(r[0], 16);
      if (chain !== CFG.chainId) throw new Error('RPC answered chain ' + chain + ', expected ' + CFG.chainId);
      var s = state;
      s.block = parseInt(r[1], 16);
      s.held = U(r[2]); s.window = U(r[3]); s.bounty = U(r[4]); s.minBond = U(r[5]);
      s.errors = U(r[6]); s.bond = U(r[7]); s.required = U(r[8]); s.exposure = U(r[9]);
      s.priceable = U(r[10]) === 1n; s.peer = '0x' + r[11].slice(2).padStart(64, '0');
      render();
      setNet(true, 'Live · Arbitrum Sepolia · block ' + s.block.toLocaleString('en-US'));
      $('#blockText').textContent = 'block ' + s.block.toLocaleString('en-US');
      $('#rpcText').textContent = new URL(CFG.rpcs[rpcIdx]).host;
    });
  }
  function render() {
    var s = state;
    var mult = s.exposure > 0n ? Number(s.required * 1000n / s.exposure) / 1000 : 0;
    setRead('held', units(s.held) + '<small>HOLD</small>');
    setRead('heldPlain', units(s.held) + ' HOLD');
    setRead('heldShort', units(s.held, 2) + '<small>HOLD</small>');
    setRead('window', s.window.toString() + ' s');
    setRead('bounty', s.bounty.toString() + ' bps (' + (Number(s.bounty) / 100) + '%)');
    setRead('minBond', units(s.minBond) + ' HOLD');
    setRead('errors', s.errors.toString());
    setRead('errorsPlain', s.errors.toString());
    setRead('bond', units(s.bond) + ' HOLD');
    setRead('required', units(s.required) + ' HOLD');
    setRead('requiredShort', units(s.required, 2) + '<small>HOLD</small>');
    setRead('exposure', units(s.exposure) + ' HOLD');
    setRead('exposureShort', units(s.exposure, 2));
    setRead('priceable', s.priceable ? 'yes' : 'no');
    setRead('mult', mult.toFixed(2) + '×');
    setRead('peer', s.peer === CFG.peer ? 'ETH/USD feed' : short(s.peer));
    var mb = $('#multBar'); if (mb) mb.style.setProperty('--w', clamp(mult / 3 * 100, 0, 100) + '%');

    // bond meters, scaled to the largest of the three (posted can dwarf the others)
    var exp = Number(s.exposure) / 1e18, req = Number(s.required) / 1e18, bond = Number(s.bond) / 1e18;
    var top = Math.max(req * 1.6, exp * 1.6);
    var w = function (v) { return clamp(v / top * 100, 0, 100) + '%'; };
    $('#mExp').style.setProperty('--w', w(exp));
    $('#mReq').style.setProperty('--w', w(req));
    $('#mBond').style.setProperty('--w', bond > top ? '100%' : w(bond));
    $('#bondNote').innerHTML = (s.errors === 0n ? 'No caught prints: the requirement equals exposure, from' : s.errors + ' caught print' + (s.errors === 1n ? '' : 's') + ' took the requirement from') + ' <b style="color:#f8f8f8">' + units(s.exposure) + '</b> to <b style="color:#ff6b5b">' + units(s.required) + ' HOLD</b> (' + mult.toFixed(2) + '× exposure). ' +
      (s.bond >= s.required ? 'The posted bond still covers it' + (bond > top ? ' (bar clipped: ' + units(s.bond, 1) + ' posted)' : '') + ', so the feed ' + (s.priceable ? '<span style="color:#ddff46">can price</span>.' : 'is <span style="color:#ff6b5b">not priceable</span> for another reason.') : 'The posted bond no longer covers it, so the feed cannot price until it tops up.');
  }

  /* ------------------------------------------------------------------ */
  /* events → liquidation cases                                          */
  /* ------------------------------------------------------------------ */
  function decodeLog(l) {
    var spec = EV[l.topics[0]]; if (!spec) return null;
    var o = { name: spec.n, block: parseInt(l.blockNumber, 16), tx: l.transactionHash, args: {} };
    function dec(kind, word) {
      if (kind === 'b32') return '0x' + word.slice(-64);
      if (kind === 'addr') return '0x' + word.slice(-40);
      var v = BigInt('0x' + word.slice(-64));
      if (kind === 'amt') return v;
      if (kind === 'rule') return Number(v);
      if (kind === 'time') return Number(v);
      if (kind === 'raw') return v;
      return Number(v);
    }
    spec.idx.forEach(function (f, i) { var p = f.split(':'); o.args[p[0]] = { k: p[1], v: dec(p[1], l.topics[i + 1]) }; });
    var d = l.data.slice(2);
    spec.data.forEach(function (f, i) { var p = f.split(':'); o.args[p[0]] = { k: p[1], v: dec(p[1], d.slice(i * 64, i * 64 + 64)) }; });
    return o;
  }
  function feedName(b) { return b === CFG.subject ? 'subject' : b === CFG.peer ? 'peer ETH/USD' : short(b); }
  function fmtArg(name, a) {
    if (a.k === 'amt') return name + ' ' + units(a.v);
    if (a.k === 'b32') return name + ' ' + feedName(a.v);
    if (a.k === 'addr') return name + ' ' + short(a.v);
    if (a.k === 'rule') return 'rule ' + RULES[a.v];
    if (a.k === 'time') return name + ' ' + new Date(a.v * 1000).toISOString().slice(0, 19).replace('T', ' ') + 'Z';
    if (a.k === 'raw') return name + ' ' + a.v.toString();
    return name + ' ' + a.v;
  }

  var cases = [], caseIdx = 0;
  function loadEvents() {
    return rpc('eth_getLogs', [{ address: CFG.lantern, fromBlock: '0x' + CFG.fromBlock.toString(16), toBlock: 'latest' }]).then(function (logs) {
      var evs = logs.map(decodeLog).filter(Boolean);
      var byId = {};
      evs.forEach(function (e) {
        if (!e.args.liquidationId) return;
        var id = e.args.liquidationId.v;
        (byId[id] = byId[id] || { id: id, events: [] }).events.push(e);
      });
      // attach the reports that sat behind each liquidation: same feed, before it, after the previous one
      var reports = evs.filter(function (e) { return e.name === 'ReportRecorded'; });
      cases = Object.keys(byId).map(function (k) { return byId[k]; }).sort(function (a, b) { return a.id - b.id; });
      cases.forEach(function (c, i) {
        var liq = c.events.filter(function (e) { return e.name === 'LiquidationRecorded'; })[0];
        var prevBlock = i ? cases[i - 1].events[0].block : 0;
        if (liq) c.reports = reports.filter(function (r) { return r.args.feedId.v === liq.args.feedId.v && r.block <= liq.block && r.block > prevBlock; });
        var names = c.events.map(function (e) { return e.name; });
        c.verdict = names.indexOf('ChallengeUpheld') >= 0 ? 'upheld' : names.indexOf('ChallengeRefused') >= 0 ? 'refused' : names.indexOf('ChallengeVoided') >= 0 ? 'voided' : names.indexOf('BonusReleased') >= 0 ? 'released' : 'held';
        c.liq = liq;
      });
      renderCases();
      renderHeroVerdicts();
      return evs.length;
    });
  }

  function caseStory(c) {
    var up = c.events.filter(function (e) { return e.name === 'ChallengeUpheld'; })[0];
    var op = c.events.filter(function (e) { return e.name === 'ChallengeOpened'; })[0];
    var rule = op ? RULES[op.args.rule.v] : null;
    if (c.verdict === 'upheld' && up) {
      var r = up.args.rule.v;
      if (r === 0) return 'The feed printed ' + units(up.args.observed.v) + ' after already printing ' + units(up.args.bound.v) + ' for the same round. The contract found both in its own records, upheld the challenge, and redirected the bonus.';
      if (r === 4) return 'The subject feed and its declared ETH/USD peer disagreed by ' + (Number(up.args.observed.v) / 100).toFixed(2) + '% on the same round, against a tolerance of ' + (Number(up.args.bound.v) / 100) + '%. Upheld; the bonus was redirected.';
      return 'Upheld under ' + RULES[r] + ': observed ' + up.args.observed.v + ', bound ' + up.args.bound.v + '.';
    }
    if (c.verdict === 'refused') return 'A challenge under ' + rule + ' was opened, but the predicate did not hold when the contract recomputed it. The challenger lost the stake. The bonus stays with the liquidator.';
    if (c.verdict === 'voided') return 'The challenge was abandoned past the grace period and voided; its stake went to the liquidator whose bonus it had frozen.';
    if (c.verdict === 'released') return 'Nobody proved anything inside the window. The bonus was released to the liquidator in full.';
    return 'The bonus is held. Once the window has passed with no open challenge, anyone can release it to the liquidator.';
  }

  function renderCases() {
    var tabs = $('#caseTabs');
    if (!cases.length) { tabs.innerHTML = '<div class="case-empty" style="color:#55585c">No liquidations recorded yet.</div>'; return; }
    tabs.innerHTML = cases.map(function (c, i) {
      return '<button class="case-tab' + (i === caseIdx ? ' active' : '') + '" role="tab" aria-selected="' + (i === caseIdx) + '" data-case="' + i + '">' +
        '<span class="t">Liquidation #' + c.id + ' <span class="verdict-pill ' + c.verdict + '">' + c.verdict + '</span></span>' +
        '<span class="d">' + (c.liq ? 'bonus ' + units(c.liq.args.bonus.v) + ' HOLD · block ' + c.liq.block.toLocaleString('en-US') : '') + '</span></button>';
    }).join('');
    $$('.case-tab', tabs).forEach(function (b) { b.addEventListener('click', function () { selectCase(+b.dataset.case); }); });
    renderCase();
  }
  function selectCase(i) {
    caseIdx = (i + cases.length) % cases.length;
    $$('.case-tab').forEach(function (b, j) { b.classList.toggle('active', j === caseIdx); b.setAttribute('aria-selected', j === caseIdx); });
    renderCase();
  }
  function renderCase() {
    var c = cases[caseIdx]; if (!c) return;
    var view = $('#caseView'); var nav = $('.nav-btns', view);
    var all = (c.reports || []).concat(c.events);
    var rows = all.map(function (e, k) {
      var args = Object.keys(e.args).filter(function (n) { return n !== 'liquidationId'; }).map(function (n) { return fmtArg(n, e.args[n]); }).join(' · ');
      return '<div class="ev" style="--k:' + k + ';--c:' + (EV_COLOR[e.name] || '#8a8d90') + '"><span class="pin"></span><div><div class="name">' + esc(e.name) + '</div><div class="args">' + esc(args) + '</div></div>' +
        '<div class="meta">#' + e.block.toLocaleString('en-US') + '<br><a href="' + CFG.explorer + '/tx/' + e.tx + '" target="_blank" rel="noopener">' + short(e.tx) + ' ↗</a></div></div>';
    }).join('');
    view.innerHTML = '<div class="case-title"><div><h3>Liquidation #' + c.id + '</h3><p>' + esc(caseStory(c)) + '</p></div><span class="verdict-pill ' + c.verdict + '">' + c.verdict + '</span></div>' +
      '<div class="timeline">' + rows + '</div>';
    view.appendChild(nav);
  }
  function renderHeroVerdicts() {
    var el = $('#heroVerdicts'); if (!el) return;
    if (!cases.length) { el.innerHTML = '<div><span class="k">no liquidations yet</span></div>'; return; }
    el.innerHTML = cases.slice().reverse().map(function (c) {
      return '<div><span>#' + c.id + ' · ' + (c.liq ? units(c.liq.args.bonus.v, 2) : '?') + ' HOLD</span><span class="verdict-pill ' + c.verdict + '">' + c.verdict + '</span></div>';
    }).join('') + '<div><span class="k">source</span><span class="k">eth_getLogs</span></div>';
  }

  function boot() {
    loadReads().catch(function (e) {
      setNet(false, 'Chain read failed: ' + e.message);
      showErr('Could not read Arbitrum Sepolia (' + e.message + '). Every value on this page comes from the chain; nothing is filled in by hand, so the fields stay empty.');
    });
    loadEvents().catch(function (e) {
      $('#caseView').querySelector('.case-empty') && ($('#caseView').querySelector('.case-empty').textContent = 'Event read failed: ' + e.message);
      showErr('Could not read events (' + e.message + ').');
    });
    setInterval(function () { if (!document.hidden) loadReads().catch(function () {}); }, 30000);
  }

  /* ------------------------------------------------------------------ */
  /* interaction                                                         */
  /* ------------------------------------------------------------------ */
  function copyText(t, btn, label) {
    var done = function () { var o = btn.textContent; btn.textContent = 'Copied!'; btn.classList.add('done'); setTimeout(function () { btn.textContent = label || o; btn.classList.remove('done'); }, 2000); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
    function fallback() { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); }
  }
  $$('[data-copy]').forEach(function (b) { b.addEventListener('click', function () { copyText(b.dataset.copy, b, 'Copy'); }); });

  var TERM = [
    '<span class="c"># every value on this page, reproduced with foundry</span>\n<span class="p">$</span> export RPC=https://sepolia-rollup.arbitrum.io/rpc\n<span class="p">$</span> export L=0x9420b6B3e5Cc8FC028b34206F9C0388230a6B772\n<span class="p">$</span> export S=0xf7ed0c5000d57be8bb1723e1298ee49e6a076692f4ef68d27dd00db178f57210\n\n<span class="p">$</span> cast call $L \'feedErrors(bytes32)(uint256)\' $S --rpc-url $RPC\n<span class="p">$</span> cast call $L \'requiredBond(bytes32)(uint256)\' $S --rpc-url $RPC\n<span class="p">$</span> cast call $L \'heldTotal()(uint256)\' --rpc-url $RPC\n<span class="p">$</span> cast call $L \'bonusOutcome(uint256)(uint8)\' 10 --rpc-url $RPC',
    '<span class="c"># the whole suite: unit, fuzz, integration, invariants, gas ceilings</span>\n<span class="p">$</span> forge build\n<span class="p">$</span> forge test\n\n<span class="c"># stateful invariants over random action sequences</span>\n<span class="p">$</span> forge test --match-path "test/invariants/*"\n\n<span class="c"># gas ceilings are asserted, not tabulated</span>\n<span class="p">$</span> forge test --match-path "test/gas/*" --gas-report',
    '<span class="c"># liquidation #10: a cross-source verdict, recomputed on chain</span>\n<span class="p">$</span> cast logs --address $L --from-block 314939250 --to-block 314939300 --rpc-url $RPC\n\n<span class="c"># ChallengeOpened(10, prover, rule=4 CROSS_SOURCE, stake)</span>\n<span class="c"># ChallengeUpheld(10, rule=4, observed=9635 bps, bound=500 bps)</span>\n<span class="p">$</span> cast call $L \'bonusOutcome(uint256)(uint8)\' 10 --rpc-url $RPC\n2   <span class="c"># redirected to the borrower</span>'
  ];
  var termIdx = 0;
  function setTerm(i) { termIdx = i; $('#termBody').innerHTML = TERM[i]; $$('.term-tab').forEach(function (t, j) { t.classList.toggle('active', j === i); t.setAttribute('aria-selected', j === i); }); }
  $$('.term-tab').forEach(function (t) { t.addEventListener('click', function () { setTerm(+t.dataset.term); }); });
  $('#termCopy').addEventListener('click', function () { copyText($('#termBody').textContent.split('\n').filter(function (l) { return /^\$ /.test(l); }).map(function (l) { return l.slice(2); }).join('\n'), $('#termCopy'), 'Copy'); });
  setTerm(0);

  $('#casePrev').addEventListener('click', function () { selectCase(caseIdx - 1); });
  $('#caseNext').addEventListener('click', function () { selectCase(caseIdx + 1); });

  // flow tabs scroll to their card; active tab follows the stuck card
  var flowTabs = $$('.flow-tab'), flowCards = $$('.flow-card');
  flowTabs.forEach(function (t) {
    t.addEventListener('click', function () {
      var c = flowCards[+t.dataset.step];
      // a sticky card's rect is its stuck position; measure its natural offset instead
      c.style.position = 'relative'; var natural = c.getBoundingClientRect().top + scrollY; c.style.position = '';
      window.scrollTo({ top: natural - (110 + (+t.dataset.step) * 18), behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  /* ------------------------------------------------------------------ */
  /* scroll motion                                                       */
  /* ------------------------------------------------------------------ */
  var header = $('.header');
  var heroC = $('#heroContent'), canvas = $('#heroCanvas'), grid = $('#widgetGrid');
  var sub = $('#heroSub'), actions = $('#heroActions');
  var cL = $('#cornerL'), cR = $('#cornerR');

  // springs (stiffness, damping, mass)
  function Spring(k, d, m, v0) { this.k = k; this.d = d; this.m = m; this.x = v0; this.v = 0; this.t = v0; }
  Spring.prototype.step = function (dt) {
    var f = -this.k * (this.x - this.t) - this.d * this.v; this.v += f / this.m * dt; this.x += this.v * dt;
    if (Math.abs(this.v) < 1e-3 && Math.abs(this.x - this.t) < 1e-3) { this.x = this.t; this.v = 0; return false; } return true;
  };
  var sSub = new Spring(120, 26, 0.8, 1), sAct = new Spring(480, 52, 0.8, 1), sGrid = new Spring(120, 26, 0.8, 0);
  var intro = reduce ? 1 : 0, introStart = performance.now();
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };

  function heroFrame(dt, now) {
    var y = scrollY;
    if (intro < 1) intro = clamp((now - introStart) / 1200, 0, 1);
    var ea = ease(intro);
    sSub.t = y > 120 ? 0 : 1; sAct.t = y > 260 ? 0 : 1; sGrid.t = y > 120 ? -104 : 0;
    var busy = sSub.step(dt) | sAct.step(dt) | sGrid.step(dt);
    heroC.style.setProperty('--hero-content-y', (map(y, 0, 600, 0, 120) + (1 - ea) * 40).toFixed(2) + 'px');
    heroC.style.opacity = map(y, 400, 600, 1, 0.3).toFixed(3);
    sub.style.opacity = sSub.x.toFixed(3); actions.style.opacity = sAct.x.toFixed(3);
    canvas.style.setProperty('--hero-widget-y', ((1 - ea) * 100 - y * 0.28).toFixed(2) + 'px');
    canvas.style.opacity = (0.0 + ea).toFixed(3);
    grid.style.setProperty('--grid-y', sGrid.x.toFixed(2) + 'px');
    if (cL) cL.style.transform = 'translateX(' + (-480 * (1 - ea)).toFixed(1) + 'px) translateY(' + (50 + y * 0.3 * 1.3 - 160 * ea + 160).toFixed(1) + 'px)';
    if (cR) cR.style.transform = 'translateX(' + (480 * (1 - ea)).toFixed(1) + 'px) translateY(' + (y * 0.3 * 1.3 - 160 * ea + 160 + map(y, 100, 400, 0, -100)).toFixed(1) + 'px)';
    return busy || intro < 1;
  }

  // tag rows: 500·(1 − clamp((r−o)/(r−.8vh))), smoothed by .12 per frame
  var rows = $$('.tag-row'), rowS = rows.map(function () { return 500; });
  function tagFrame() {
    var vh = innerHeight, busy = false;
    rows.forEach(function (r, i) {
      var o = r.getBoundingClientRect().top;
      var a = 500 * (1 - clamp((vh - o) / (vh * 0.6), 0, 1));
      rowS[i] += (a - rowS[i]) * 0.12; if (Math.abs(a - rowS[i]) > 0.1) busy = true; else rowS[i] = a;
      r.style.setProperty('--row-offset', rowS[i].toFixed(2) + 'px');
    });
    return busy;
  }

  // lantern layers: 100·i·k with per-layer k, smoothed by .08 per frame
  var mascot = $('#mascot'), layers = $$('.layer'), layS = layers.map(function () { return 0; });
  function layerFrame() {
    if (!mascot) return false;
    var r = mascot.getBoundingClientRect(), vh = innerHeight;
    var i = clamp((vh - r.top) / (vh + r.height), 0, 1) * 2 - 1, busy = false;
    layers.forEach(function (l, j) {
      var k = parseFloat(l.dataset.depth), a = 100 * i * k;
      layS[j] += (a - layS[j]) * 0.08; if (Math.abs(a - layS[j]) > 0.05) busy = true; else layS[j] = a;
      l.setAttribute('transform', 'translate(0 ' + layS[j].toFixed(2) + ')');
    });
    return busy;
  }

  // marquees: time-based px/s, seamless loop (track content duplicated)
  var marquees = $$('[data-marquee]').map(function (t) {
    var speed = reduce ? 0 : parseFloat(t.dataset.marquee); var kids = Array.prototype.slice.call(t.children);
    kids.forEach(function (k) { var c = k.cloneNode(true); c.setAttribute('aria-hidden', 'true'); t.appendChild(c); });
    var x = 0, half = 0;
    return { step: function (dt) { if (!half) half = t.scrollWidth / 2; x += speed * dt; if (x <= -half) x += half; t.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)'; } };
  });

  // flow tab follows the card that is stuck at the top
  function flowFrame() {
    var active = 0;
    flowCards.forEach(function (c, i) { if (c.getBoundingClientRect().top <= 110 + i * 18 + 4) active = i; });
    flowTabs.forEach(function (t, i) { var on = i === active; if (t.classList.contains('active') !== on) { t.classList.toggle('active', on); t.setAttribute('aria-selected', on); } });
  }

  // pricing-floor prints: grow one by one as the section scrolls through
  var prints = $$('.print'), cap = $('#floorCaption'), lastN = -1;
  function printFrame() {
    var box = $('#prints'); if (!box) return;
    var r = box.getBoundingClientRect(), vh = innerHeight;
    var p = clamp((vh * 0.9 - r.top) / (vh * 0.6), 0, 1), n = Math.round(p * prints.length);
    if (n === lastN) return; lastN = n;
    prints.forEach(function (el, i) {
      el.style.setProperty('--s', i < n ? 1 : 0);
      el.classList.toggle('counted', i < n && i >= 1 && i < 4);
      el.classList.toggle('priced', i < n && i >= 4);
    });
    cap.textContent = n === 0 ? 'Scroll to print.' : n <= 4 ? n + ' print' + (n > 1 ? 's' : '') + ' recorded. The feed can print, but cannot price a liquidation yet.' : 'Print ' + n + ' has ' + (n - 1) + ' behind it: this one may price a liquidation.';
  }

  var lastT = performance.now(), ticking = false;
  function frame(now) {
    var raw = Math.max(0, (now - lastT) / 1000), dt = Math.min(0.05, raw); lastT = now;
    header.classList.toggle('scrolled', scrollY > 1);
    var busy = heroFrame(dt, now);
    if (tagFrame()) busy = true;
    if (layerFrame()) busy = true;
    flowFrame(); printFrame();
    marquees.forEach(function (m) { m.step(Math.min(0.5, raw)); });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // reveal on enter
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -10% 0px' });
    $$('.reveal').forEach(function (el) { io.observe(el); });
  } else $$('.reveal').forEach(function (el) { el.classList.add('in'); });

  boot();
})();
