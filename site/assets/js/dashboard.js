/* Lantern dashboard runtime: live reads from Arbitrum Sepolia, no dependencies. */
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
  var RULES = [
    { id: 'SLOT_UNIQUENESS', name: 'Slot uniqueness', text: 'One feed printed two different values for one round. The conflict is recorded instead of hidden behind a revert, so the record outlives the transaction that made it.' },
    { id: 'ROUND_ORDERING', name: 'Round ordering', text: 'The print was already stale when the liquidation consumed it.' },
    { id: 'SELF_HISTORY', name: 'Self history', text: 'The value falls outside the band that the feed\u2019s own realized moves imply. The band comes from the feed\u2019s history and nothing else.' },
    { id: 'PAYLOAD_PROVENANCE', name: 'Payload provenance', text: 'The signed payload was issued for a different asset or a different slot.' },
    { id: 'CROSS_SOURCE', name: 'Cross source', text: 'A second feed, named in advance and fixed afterwards, disagrees by more than 5% for the same round. The disagreement itself is the evidence.' }
  ];
  var EV_COLOR = { LiquidationRecorded: '#7084ff', ChallengeOpened: '#ff9d29', ChallengeUpheld: '#ff6b5b', ChallengeRefused: '#939598', ChallengeVoided: '#ff9d29', BonusReleased: '#add300', ReportRecorded: '#bcbec0', BondDeposited: '#405bff', FeedRegistered: '#191919', PeerDeclared: '#191919' };
  var VERDICT_COLOR = { upheld: '#ff6b5b', refused: '#939598', voided: '#ff9d29', released: '#add300', held: '#7084ff' };
  var VIEWS = { overview: 'Overview', liquidations: 'Liquidations', bonds: 'Feeds & bonds', rules: 'Rules', events: 'Event log' };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  /* ---------- formatting ---------- */
  var E18 = 10n ** 18n;
  function units(big, dp) {
    dp = dp == null ? 3 : dp;
    var neg = big < 0n; if (neg) big = -big;
    var whole = big / E18, frac = big % E18;
    var f = (frac + E18).toString().slice(1, 1 + dp).replace(/0+$/, '');
    var w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + w + (f ? '.' + f : '');
  }
  function short(h) { return h.slice(0, 6) + '\u2026' + h.slice(-4); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function dur(sec) { sec = Number(sec); if (sec % 86400 === 0) return sec / 86400 + 'd'; if (sec % 3600 === 0) return sec / 3600 + 'h'; if (sec % 60 === 0) return sec / 60 + 'm'; return sec + 's'; }
  function num(n) { return n.toLocaleString('en-US'); }

  /* ---------- JSON-RPC with fallback ---------- */
  var rpcIdx = 0, rid = 1;
  function rpc(method, params) {
    var tries = 0;
    function attempt() {
      var ctl = 'AbortController' in window ? new AbortController() : null;
      var t = ctl && setTimeout(function () { ctl.abort(); }, 12000);
      return fetch(CFG.rpcs[rpcIdx], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: rid++, method: method, params: params }), signal: ctl && ctl.signal })
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
  function call(sel, arg) { return rpc('eth_call', [{ to: CFG.lantern, data: sel + (arg ? arg.replace(/^0x/, '').padStart(64, '0') : '') }, 'latest']); }
  var U = function (hex) { return BigInt(hex && hex !== '0x' ? hex : '0x0'); };

  /* ---------- state reads ---------- */
  var S = {}, loadedAt = 0;
  function setRead(key, html) { $$('[data-read="' + key + '"]').forEach(function (el) { el.innerHTML = html; }); }
  function setNet(ok, text) { $('#netDot').className = 'dot ' + (ok ? 'ok' : 'bad'); $('#netText').textContent = text; }
  function showErr(msg) { var b = $('#errBox'); b.textContent = msg; b.classList.add('show'); }
  function clearErr() { $('#errBox').classList.remove('show'); }

  function loadReads() {
    return Promise.all([
      rpc('eth_chainId', []), rpc('eth_blockNumber', []),
      call(SEL.heldTotal), call(SEL.holdWindow), call(SEL.bountyBps), call(SEL.minBond),
      call(SEL.feedErrors, CFG.subject), call(SEL.bondOf, CFG.subject), call(SEL.requiredBond, CFG.subject),
      call(SEL.exposureOf, CFG.subject), call(SEL.isPriceable, CFG.subject), call(SEL.peerOf, CFG.subject)
    ]).then(function (r) {
      var chain = parseInt(r[0], 16);
      if (chain !== CFG.chainId) throw new Error('RPC answered chain ' + chain + ', expected ' + CFG.chainId);
      S.block = parseInt(r[1], 16);
      S.held = U(r[2]); S.window = U(r[3]); S.bounty = U(r[4]); S.minBond = U(r[5]);
      S.errors = U(r[6]); S.bond = U(r[7]); S.required = U(r[8]); S.exposure = U(r[9]);
      S.priceable = U(r[10]) === 1n; S.peer = '0x' + r[11].slice(2).padStart(64, '0');
      loadedAt = Date.now();
      renderReads();
      setNet(true, 'Live');
      $('#blockChip').textContent = 'block ' + num(S.block);
    });
  }

  function renderReads() {
    var s = S;
    var mult = s.exposure > 0n ? Number(s.required * 1000n / s.exposure) / 1000 : 0;
    setRead('held', units(s.held, 2) + '<small>HOLD</small>');
    setRead('windowShort', dur(s.window));
    setRead('bountyShort', (Number(s.bounty) / 100) + '%');
    setRead('minBondShort', units(s.minBond, 2) + '<small>HOLD</small>');
    setRead('errors', s.errors.toString());
    setRead('requiredShort', units(s.required, 2) + '<small>HOLD</small>');
    setRead('exposureShort', units(s.exposure, 2) + '<small>HOLD</small>');
    setRead('bondShort', units(s.bond, 2) + '<small>HOLD</small>');
    setRead('mult', mult.toFixed(2) + '\u00d7');
    setRead('multS', mult.toFixed(2) + '\u00d7 exposure');
    setRead('coverS', s.bond >= s.required ? 'covers the requirement' : 'short of the requirement');
    setRead('peer', s.peer === CFG.peer ? 'ETH/USD' : /^0x0+$/.test(s.peer) ? 'none' : short(s.peer));
    // bars inside bond rows use the plain unit text
    $$('.bar b').forEach(function (b) { b.innerHTML = b.innerHTML.replace(/<small>HOLD<\/small>/, ''); });

    var pill = $('#priceablePill');
    pill.textContent = s.priceable ? 'can price' : 'cannot price';
    pill.className = 'pill ' + (s.priceable ? 'ok' : 'bad');
    $('#multBarO').style.setProperty('--w', clamp((mult - 1) / 2 * 100, 0, 100) + '%');

    var exp = Number(s.exposure) / 1e18, req = Number(s.required) / 1e18, bond = Number(s.bond) / 1e18;
    var top = Math.max(req, exp) * 1.6;
    var w = function (v) { return clamp(v / top * 100, 0, 100) + '%'; };
    $('#mExp').style.setProperty('--w', w(exp));
    $('#mReq').style.setProperty('--w', w(req));
    $('#mBond').style.setProperty('--w', bond > top ? '100%' : w(bond));
    $('#bondNote').innerHTML = (s.errors === 0n ? 'No caught prints, so the requirement equals exposure.' :
      s.errors + ' caught print' + (s.errors === 1n ? '' : 's') + ' took the requirement from <b>' + units(s.exposure) + '</b> to <b>' + units(s.required) + ' HOLD</b>.') + ' ' +
      (s.bond >= s.required ? 'The posted bond' + (bond > top ? ' (' + units(s.bond, 1) + ' HOLD, bar clipped)' : '') + ' still covers it.' : 'The posted bond no longer covers it, so the feed cannot price until it tops up.');

    // escalation ladder: 1.0x + 0.2x per caught print, stopping at 3.0x after ten
    var steps = Number(s.errors > 10n ? 10n : s.errors);
    $('#escSteps').innerHTML = Array.apply(null, Array(11)).map(function (_, i) {
      return '<div class="' + (i < steps ? 'on' : i === steps ? 'now' : '') + '" style="--h:' + (30 + i * 7) + '%" title="' + (1 + i * 0.2).toFixed(1) + '\u00d7"><span>' + (1 + i * 0.2).toFixed(1) + '</span></div>';
    }).join('');
  }

  /* ---------- events ---------- */
  function decodeLog(l) {
    var spec = EV[l.topics[0]]; if (!spec) return null;
    var o = { name: spec.n, block: parseInt(l.blockNumber, 16), tx: l.transactionHash, logIndex: parseInt(l.logIndex, 16), args: {} };
    function dec(kind, word) {
      if (kind === 'b32') return '0x' + word.slice(-64);
      if (kind === 'addr') return '0x' + word.slice(-40);
      var v = BigInt('0x' + word.slice(-64));
      if (kind === 'amt' || kind === 'raw') return v;
      return Number(v);
    }
    spec.idx.forEach(function (f, i) { var p = f.split(':'); o.args[p[0]] = { k: p[1], v: dec(p[1], l.topics[i + 1]) }; });
    var d = l.data.slice(2);
    spec.data.forEach(function (f, i) { var p = f.split(':'); o.args[p[0]] = { k: p[1], v: dec(p[1], d.slice(i * 64, i * 64 + 64)) }; });
    return o;
  }
  function feedName(b) { return b === CFG.subject ? 'subject feed' : b === CFG.peer ? 'ETH/USD feed' : short(b); }
  function fmtArg(name, a) {
    if (a.k === 'amt') return name + ' ' + units(a.v);
    if (a.k === 'b32') return feedName(a.v);
    if (a.k === 'addr') return name + ' ' + short(a.v);
    if (a.k === 'rule') return RULES[a.v] ? RULES[a.v].id : 'rule ' + a.v;
    if (a.k === 'time') return name + ' ' + new Date(a.v * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    return name + ' ' + a.v.toString();
  }
  function argLine(e) { return Object.keys(e.args).filter(function (n) { return n !== 'liquidationId'; }).map(function (n) { return fmtArg(n, e.args[n]); }).join(' \u00b7 '); }
  function txLink(e) { return '<a class="tx" href="' + CFG.explorer + '/tx/' + e.tx + '" target="_blank" rel="noopener">View tx \u2197</a>'; }

  var EVENTS = [], cases = [], caseIdx = 0, evFilter = 'all';
  function loadEvents() {
    return rpc('eth_getLogs', [{ address: CFG.lantern, fromBlock: '0x' + CFG.fromBlock.toString(16), toBlock: 'latest' }]).then(function (logs) {
      EVENTS = logs.map(decodeLog).filter(Boolean);
      var byId = {};
      EVENTS.forEach(function (e) {
        if (!e.args.liquidationId) return;
        var id = e.args.liquidationId.v;
        (byId[id] = byId[id] || { id: id, events: [] }).events.push(e);
      });
      var reports = EVENTS.filter(function (e) { return e.name === 'ReportRecorded'; });
      cases = Object.keys(byId).map(function (k) { return byId[k]; }).sort(function (a, b) { return a.id - b.id; });
      cases.forEach(function (c, i) {
        var liq = c.events.filter(function (e) { return e.name === 'LiquidationRecorded'; })[0];
        var prevBlock = i ? cases[i - 1].events[0].block : 0;
        c.reports = liq ? reports.filter(function (r) { return r.args.feedId.v === liq.args.feedId.v && r.block <= liq.block && r.block > prevBlock; }) : [];
        var names = c.events.map(function (e) { return e.name; });
        c.verdict = names.indexOf('ChallengeUpheld') >= 0 ? 'upheld' : names.indexOf('ChallengeRefused') >= 0 ? 'refused' : names.indexOf('ChallengeVoided') >= 0 ? 'voided' : names.indexOf('BonusReleased') >= 0 ? 'released' : 'held';
        c.liq = liq;
        c.op = c.events.filter(function (e) { return e.name === 'ChallengeOpened'; })[0];
        c.up = c.events.filter(function (e) { return e.name === 'ChallengeUpheld'; })[0];
      });
      renderVerdicts(); renderRecent(); renderCaseList(); renderRules(); renderEvents();
    });
  }

  function caseStory(c) {
    var up = c.up, rule = c.op && RULES[c.op.args.rule.v] ? RULES[c.op.args.rule.v].id : null;
    if (c.verdict === 'upheld' && up) {
      var r = up.args.rule.v;
      if (r === 0) return 'The feed printed ' + units(up.args.observed.v) + ' after already printing ' + units(up.args.bound.v) + ' for the same round. The contract found both in its own records, upheld the challenge, and redirected the bonus.';
      if (r === 4) return 'The subject feed and its ETH/USD peer disagreed by ' + (Number(up.args.observed.v) / 100).toFixed(2) + '% on the same round, against a tolerance of ' + (Number(up.args.bound.v) / 100) + '%. Upheld; the bonus was redirected.';
      return 'Upheld under ' + RULES[r].id + ': observed ' + up.args.observed.v + ', bound ' + up.args.bound.v + '.';
    }
    if (c.verdict === 'refused') return 'A challenge under ' + rule + ' was opened, but the rule did not hold when the contract recomputed it. The challenger lost the stake and the bonus stays with the liquidator.';
    if (c.verdict === 'voided') return 'The challenge was left unresolved past the grace period and voided. Its stake went to the liquidator whose bonus it had frozen.';
    if (c.verdict === 'released') return 'Nobody proved anything inside the window, so the bonus was released to the liquidator in full.';
    return 'The bonus is held. Once the window passes with no open challenge, anyone can release it to the liquidator.';
  }

  function renderVerdicts() {
    var order = ['upheld', 'refused', 'voided', 'released', 'held'], counts = {};
    order.forEach(function (k) { counts[k] = 0; });
    cases.forEach(function (c) { counts[c.verdict]++; });
    var total = cases.length || 1;
    $('#verdictBar').innerHTML = order.filter(function (k) { return counts[k]; }).map(function (k) { return '<i data-w="' + (counts[k] / total * 100) + '" style="background:' + VERDICT_COLOR[k] + '"></i>'; }).join('');
    requestAnimationFrame(function () { $$('#verdictBar i').forEach(function (i) { i.style.width = i.dataset.w + '%'; }); });
    $('#verdictLegend').innerHTML = order.map(function (k) { return '<span><i style="background:' + VERDICT_COLOR[k] + '"></i>' + k + ' <b>' + counts[k] + '</b></span>'; }).join('') + '<span>total <b>' + cases.length + '</b></span>';
  }

  function caseRow(c, clickable) {
    return '<div class="tr' + (clickable ? ' click' : '') + '" data-case="' + c.id + '"><span class="id">#' + c.id + '</span>' +
      '<span class="muted">' + (c.op ? 'Challenged under ' + (RULES[c.op.args.rule.v] ? RULES[c.op.args.rule.v].name.toLowerCase() : '?') : 'No challenge') + '</span>' +
      '<span class="num">' + (c.liq ? units(c.liq.args.bonus.v) + ' HOLD' : '\u2014') + '</span>' +
      '<span><span class="pill ' + c.verdict + '">' + c.verdict + '</span></span>' +
      (c.liq ? txLink(c.liq) : '<span></span>') + '</div>';
  }
  function renderRecent() {
    var t = $('#recentTable');
    if (!cases.length) { t.innerHTML = '<div class="empty">No liquidations recorded yet.</div>'; return; }
    t.innerHTML = '<div class="tr th"><span>Liquidation</span><span>Challenge</span><span>Bonus</span><span>Verdict</span><span></span></div>' +
      cases.slice().reverse().slice(0, 6).map(function (c) { return caseRow(c, true); }).join('');
    $$('.tr.click', t).forEach(function (r) { r.addEventListener('click', function (ev) { if (ev.target.closest('a')) return; openCase(+r.dataset.case); }); });
  }

  function renderCaseList() {
    var l = $('#caseList');
    if (!cases.length) { l.innerHTML = '<div class="empty">No liquidations recorded yet.</div>'; $('#caseDetail').innerHTML = '<div class="empty">Nothing to show.</div>'; return; }
    l.innerHTML = cases.map(function (c, i) {
      return '<button class="case' + (i === caseIdx ? ' active' : '') + '" data-i="' + i + '"><span class="t">Liquidation #' + c.id + ' <span class="pill ' + c.verdict + '">' + c.verdict + '</span></span>' +
        '<span class="d">' + (c.liq ? 'bonus ' + units(c.liq.args.bonus.v) + ' HOLD \u00b7 block ' + num(c.liq.block) : '') + '</span></button>';
    }).join('');
    $$('.case', l).forEach(function (b) { b.addEventListener('click', function () { selectCase(+b.dataset.i); }); });
    renderCase();
  }
  function selectCase(i) {
    caseIdx = (i + cases.length) % cases.length;
    $$('#caseList .case').forEach(function (b, j) { b.classList.toggle('active', j === caseIdx); });
    renderCase();
  }
  function openCase(id) {
    var i = cases.findIndex(function (c) { return c.id === id; });
    if (i < 0) return;
    caseIdx = i; location.hash = 'liquidations'; selectCase(i);
  }
  function renderCase() {
    var c = cases[caseIdx]; if (!c) return;
    var all = c.reports.concat(c.events);
    var facts = [
      ['Bonus', c.liq ? units(c.liq.args.bonus.v) + ' HOLD' : '\u2014'],
      ['Rule', c.op && RULES[c.op.args.rule.v] ? RULES[c.op.args.rule.v].name : 'none'],
      ['Stake', c.op ? units(c.op.args.stake.v) + ' HOLD' : '\u2014'],
      ['Block', c.liq ? num(c.liq.block) : '\u2014'],
      ['Events', String(all.length)],
      ['Verdict', c.verdict]
    ];
    $('#caseDetail').innerHTML =
      '<div class="card-h"><h2>Liquidation #' + c.id + '</h2><span class="pill ' + c.verdict + '">' + c.verdict + '</span></div>' +
      '<p class="story">' + esc(caseStory(c)) + '</p>' +
      '<div class="facts">' + facts.map(function (f) { return '<div><span>' + f[0] + '</span><b>' + esc(f[1]) + '</b></div>'; }).join('') + '</div>' +
      '<div class="timeline">' + all.map(function (e, k) {
        return '<div class="tl" style="--k:' + k + ';--c:' + (EV_COLOR[e.name] || '#939598') + '"><span class="n">' + esc(e.name) + '</span>' +
          '<span class="m">#' + num(e.block) + '<br><a href="' + CFG.explorer + '/tx/' + e.tx + '" target="_blank" rel="noopener">View tx \u2197</a></span>' +
          '<span class="a">' + esc(argLine(e)) + '</span></div>';
      }).join('') + '</div>';
  }

  function renderRules() {
    var opened = {}, upheld = {};
    cases.forEach(function (c) {
      if (c.op) { var r = c.op.args.rule.v; opened[r] = (opened[r] || 0) + 1; if (c.verdict === 'upheld') upheld[r] = (upheld[r] || 0) + 1; }
    });
    $('#rulesList').innerHTML = RULES.map(function (r, i) {
      return '<div class="rule"><span class="no">' + (i + 1) + '</span><h3>' + r.name + '</h3><code>' + r.id + '</code><p>' + esc(r.text) + '</p>' +
        '<div class="stats"><span class="tag">challenged ' + (opened[i] || 0) + '</span><span class="tag">upheld ' + (upheld[i] || 0) + '</span></div></div>';
    }).join('');
  }

  function renderEvents() {
    var counts = {}; EVENTS.forEach(function (e) { counts[e.name] = (counts[e.name] || 0) + 1; });
    var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    $('#evFilters').innerHTML = '<button data-f="all" class="' + (evFilter === 'all' ? 'active' : '') + '">All<b>' + EVENTS.length + '</b></button>' +
      names.map(function (n) { return '<button data-f="' + n + '" class="' + (evFilter === n ? 'active' : '') + '">' + n + '<b>' + counts[n] + '</b></button>'; }).join('');
    $$('#evFilters button').forEach(function (b) { b.addEventListener('click', function () { evFilter = b.dataset.f; renderEvents(); }); });
    var list = EVENTS.filter(function (e) { return evFilter === 'all' || e.name === evFilter; }).slice().sort(function (a, b) { return b.block - a.block || b.logIndex - a.logIndex; });
    var t = $('#evTable');
    if (!list.length) { t.innerHTML = '<div class="empty" style="padding:22px">No events.</div>'; return; }
    t.innerHTML = '<div class="tr th ev-tr"><span>Event</span><span>Details</span><span>Block</span><span></span></div>' +
      list.map(function (e) {
        var id = e.args.liquidationId ? ' #' + e.args.liquidationId.v : '';
        return '<div class="tr ev-tr"><span class="evname"><i style="background:' + (EV_COLOR[e.name] || '#939598') + '"></i>' + esc(e.name) + id + '</span>' +
          '<span class="muted">' + esc(argLine(e)) + '</span><span class="num">' + num(e.block) + '</span>' + txLink(e) + '</div>';
      }).join('');
  }

  /* ---------- routing (sidebar) ---------- */
  function route() {
    var v = (location.hash || '#overview').slice(1);
    if (!VIEWS[v]) v = 'overview';
    $$('.view').forEach(function (s) { s.classList.toggle('active', s.id === 'view-' + v); });
    $$('.side-nav a[data-view]').forEach(function (a) { a.classList.toggle('active', a.dataset.view === v); });
    $('#crumb').textContent = VIEWS[v];
    $('#side').classList.remove('open');
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  $('#menuBtn').addEventListener('click', function () { $('#side').classList.toggle('open'); });

  /* ---------- boot + refresh ---------- */
  function load() {
    var btn = $('#refreshBtn'); btn.classList.add('busy');
    return Promise.all([
      loadReads().then(clearErr, function (e) {
        setNet(false, 'Offline');
        showErr('Could not read Arbitrum Sepolia (' + e.message + '). Every value here comes from the chain, so the fields stay empty.');
      }),
      loadEvents().catch(function (e) {
        ['#recentTable', '#caseList', '#evTable'].forEach(function (s) { $(s).innerHTML = '<div class="empty">Event read failed: ' + esc(e.message) + '</div>'; });
        showErr('Could not read events (' + e.message + ').');
      })
    ]).then(function () { btn.classList.remove('busy'); });
  }
  $('#refreshBtn').addEventListener('click', load);
  setInterval(function () {
    if (loadedAt) $('#ageChip').textContent = 'updated ' + Math.round((Date.now() - loadedAt) / 1000) + 's ago';
  }, 1000);
  setInterval(function () { if (!document.hidden) loadReads().catch(function () {}); }, 30000);

  route();
  load();
})();
