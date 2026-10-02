/* console-ui.js — binds the Operate view. Reads the inputs, asks console.js for the calldata,
   sends it through the wallet, and renders what came back. */
(function () {
  'use strict';
  var C = window.LanternConsole;
  if (!C) return;
  var CFG = C.CFG, W = C.W;

  var $ = function (id) { return document.getElementById(id); };

  // what each button does: where it goes, what it calls, how the inputs map onto the arguments
  var ACT = {
    registerFeed: { to: 'lantern', sig: 'registerFeed', types: ['bytes32', 'bytes32', 'uint8'],
      args: function (f) { return [f('feedId'), f('signerSet'), f('decimals')]; } },
    setPeerFeed: { to: 'lantern', sig: 'setPeerFeed', types: ['bytes32', 'bytes32'],
      args: function (f) { return [f('feedId'), f('peer')]; } },
    depositBond: { to: 'lantern', sig: 'depositBond', types: ['bytes32', 'uint256'],
      approve: function (f) { return C.parseUnits(f('amount')); },
      args: function (f) { return [f('feedId'), C.parseUnits(f('amount'))]; } },
    withdrawBond: { to: 'lantern', sig: 'withdrawBond', types: ['bytes32', 'uint256'],
      args: function (f) { return [f('feedId'), C.parseUnits(f('amount'))]; } },
    recordReport: { to: 'lantern', sig: 'recordReport', types: ['bytes32', 'uint256', 'uint64', 'uint64', 'bytes32', 'address'],
      args: function (f) { return [f('feedId'), C.parseUnits(f('value')), f('round'), f('timestamp') || now(), f('payloadHash'), f('signer') || W.account]; } },
    liquidate: { to: 'market', sig: 'liquidateWithNotional',
      types: ['uint256', 'bytes32', 'uint64', 'uint256', 'uint256', 'address'],
      args: function (f) { return [f('liquidationId'), f('feedId'), f('round'), C.parseUnits(f('bonus')), C.parseUnits(f('notional')), f('borrower') || W.account]; } },
    openChallenge: { to: 'lantern', sig: 'openChallenge', types: ['uint256', 'uint8', 'bytes', 'uint256'],
      approve: function (f) { return C.parseUnits(f('stake')); },
      args: function (f) { return [f('liquidationId'), f('rule'), f('evidence'), C.parseUnits(f('stake'))]; } },
    adjudicate: { to: 'lantern', sig: 'adjudicate', types: ['uint256'], args: function (f) { return [f('liquidationId')]; } },
    release: { to: 'lantern', sig: 'release', types: ['uint256'], args: function (f) { return [f('liquidationId')]; } },
    voidStaleChallenge: { to: 'lantern', sig: 'voidStaleChallenge', types: ['uint256'], args: function (f) { return [f('liquidationId')]; } }
  };

  function now() { return String(Math.floor(Date.now() / 1000)); }
  function short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : '—'; }
  function fail(msg) { var e = $('wErr'); e.textContent = msg || ''; e.style.display = msg ? 'block' : 'none'; }

  /* ---------------------------------------------------------------- wallet bar */
  function renderWallet() {
    var dot = $('wDot'), acct = $('wAccount'), sub = $('wSub'), btn = $('wConnect');
    var onRightChain = W.chain === CFG.chainId;
    dot.className = 'dot' + (W.account ? (onRightChain ? ' live' : ' warn') : '');
    if (!W.account) {
      acct.textContent = 'No wallet connected';
      sub.textContent = 'Connect a wallet on Arbitrum Sepolia to send transactions.';
      btn.querySelector('span').textContent = 'Connect wallet';
    } else {
      acct.textContent = short(W.account);
      sub.textContent = onRightChain
        ? 'Ready. Each send is signed in your wallet.'
        : 'This wallet is on another chain. Switch it to Arbitrum Sepolia.';
      btn.querySelector('span').textContent = onRightChain ? 'Refresh' : 'Switch chain';
    }
    $('wChain').textContent = W.chain ? (onRightChain ? 'Arbitrum Sepolia' : 'chain ' + W.chain) : 'no chain';
    $('wToken').textContent = W.account ? C.formatUnits(W.balance) + ' HOLD' : '—';
    $('wEth').textContent = W.account ? (Number(W.eth) / 1e18).toFixed(5) + ' ETH' : '—';
    document.querySelectorAll('.act .go').forEach(function (b) { b.classList.toggle('idle', !W.account); });
    renderLog();
  }

  /* ---------------------------------------------------------------- tx log */
  function renderLog() {
    var box = $('txLog');
    var list = C.log;
    if (!list.length) { box.innerHTML = '<div class="empty">Nothing sent from this page yet.</div>'; $('txCount').textContent = 'none yet'; return; }
    $('txCount').textContent = list.length + (list.length === 1 ? ' transaction' : ' transactions');
    box.innerHTML = list.map(function (e) {
      var link = CFG.explorer + '/tx/' + e.hash;
      var cls = e.status === 'ok' ? 'ok' : e.status === 'pending' ? 'pend' : 'bad';
      var detail = e.status === 'ok'
        ? 'block ' + e.block + ' · ' + e.gas.toLocaleString() + ' gas'
        : e.status === 'pending' ? 'waiting for the receipt'
        : e.reason || e.status;
      return '<div class="tx">' +
        '<div class="tx-m"><b>' + e.label + '</b><small>' + detail + '</small></div>' +
        '<span class="pill ' + cls + '">' + e.status + '</span>' +
        (e.hash ? '<a class="tx-h" href="' + link + '" target="_blank" rel="noopener">' + short(e.hash) + '</a>' : '') +
        '</div>';
    }).join('');
  }

  /* ---------------------------------------------------------------- sending */
  async function run(card, name) {
    var spec = ACT[name];
    fail('');
    if (!W.account) { fail('Connect a wallet first — the transaction has to be signed by an account that holds gas.'); return; }
    if (W.chain !== CFG.chainId) { fail('Your wallet is on chain ' + W.chain + '. Switch it to Arbitrum Sepolia and try again.'); try { await C.switchChain(); } catch (e) { } return; }

    var get = function (f) {
      var el = card.querySelector('[data-f="' + f + '"]');
      return el ? String(el.value).trim() : '';
    };
    var values;
    try { values = spec.args(get); } catch (e) { fail(e.message); return; }

    var btn = card.querySelector('.go');
    btn.disabled = true;
    var label = card.querySelector('h3').textContent;
    try {
      // read the allowance now rather than trusting an older read: a bond spends it
      try { await C.refreshBalances(); } catch (e) { }
      var need = spec.approve ? spec.approve(get) : 0n;
      var data = C.encode(spec.sig, spec.types, values);

      // preflight: a call the chain would refuse never gets signed, so it costs nothing
      var sim = await C.simulate(CFG[spec.to], data);
      if (!sim.ok) {
        var aboutApproval = /TransferFromFailed|InsufficientAllowance/.test(sim.reason || '');
        if (need && W.allowance < need && aboutApproval) {
          await C.send(label + ' — approve', CFG.asset, C.encode('approve', ['address', 'uint256'], [CFG[spec.to], need]));
          await C.refreshBalances();
          sim = await C.simulate(CFG[spec.to], data);
        }
        if (!sim.ok) {
          fail('This call would be refused, so nothing was sent: ' + sim.reason);
          return;
        }
      }
      var entry = await C.send(label.replace(/\.$/, ''), CFG[spec.to], data);
      if (entry.status === 'reverted') fail(entry.reason || 'The transaction was reverted.');
    } catch (e) {
      fail((e && (e.message || e.code)) || 'the wallet refused the transaction');
    } finally {
      btn.disabled = false;
      try { await C.refreshBalances(); } catch (e) { }
      renderLog();
      renderWallet();
    }
  }

  /* ---------------------------------------------------------------- wiring */
  document.querySelectorAll('.act').forEach(function (card) {
    var name = card.querySelector('.go').getAttribute('data-act');
    var spec = ACT[name];
    card.querySelector('.go').addEventListener('click', function () { run(card, name); });
    card.querySelector('[data-preview]').addEventListener('click', function () {
      var box = card.querySelector('.preview');
      var get = function (f) { var el = card.querySelector('[data-f="' + f + '"]'); return el ? String(el.value).trim() : ''; };
      try {
        var data = C.encode(spec.sig, spec.types, spec.args(get));
        box.innerHTML = '<code>' + spec.sig + '(' + spec.types.join(',') + ')</code><br><code class="hex">' + data.slice(0, 74) + '…</code>' +
          '<button class="copy" data-copy="' + data + '">copy calldata</button>';
      } catch (e) { box.innerHTML = '<code class="err">' + e.message + '</code>'; }
    });
    var ts = card.querySelector('[data-f="timestamp"]');
    if (ts && !ts.value) ts.value = now();
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-copy]');
    if (!b) return;
    navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function () {
      b.textContent = 'copied';
      setTimeout(function () { b.textContent = 'copy calldata'; }, 1500);
    });
  });

  $('wConnect').addEventListener('click', async function () {
    fail('');
    try {
      if (W.account && W.chain !== CFG.chainId) { await C.switchChain(); }
      else { await C.connect(); }
    } catch (e) {
      fail((e && (e.message || e.code)) || 'the wallet refused to connect');
    }
    renderWallet();
  });

  C.onChange(renderWallet);
  renderWallet();

  // if a wallet is already authorised, pick it up without a click
  if (window.ethereum && window.ethereum.request) {
    window.ethereum.request({ method: 'eth_accounts' }).then(function (a) {
      if (a && a.length) return C.connect();
    }).catch(function () { }).then(renderWallet);
  }
})();
