// Re-derives every selector and event topic the Run view reads with, using cast. A wrong selector
// does not throw: eth_call returns empty and the page would show zeros, so drift has to be caught here.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const src = readFileSync('/home/arch/lantern/site/assets/js/run.js', 'utf8');
const SIGS = {
  latestRoundData: 'latestRoundData()', reg: 'reg()', operatorOf: 'operatorOf(bytes32)', bondOf: 'bondOf(bytes32)',
  requiredBond: 'requiredBond(bytes32)', priceable: 'priceable(bytes32)', feedErrors: 'feedErrors(bytes32)',
  minStake: 'minStake()', bountyBps: 'bountyBps()', escrowOf: 'escrowOf(uint256)', challengeOf: 'challengeOf(uint256)',
  lastReport: 'lastReport(bytes32)', reportAt: 'reportAt(bytes32,uint64)', accountOf: 'accountOf(address)',
  healthOf: 'healthOf(address,uint256)', seizureOf: 'seizureOf(uint256)', closeFactorBps: 'closeFactorBps()',
  liquidationBonusBps: 'liquidationBonusBps()', balanceOf: 'balanceOf(address)', claimedAt: 'claimedAt(address)',
  cooldown: 'cooldown()'
};

let pass = 0, fail = 0;
const block = src.slice(src.indexOf('var SEL = {'), src.indexOf('};', src.indexOf('var SEL = {')));
const found = Object.fromEntries([...block.matchAll(/(\w+):\s*'(0x[0-9a-f]{8})'/g)].map(m => [m[1], m[2]]));
for (const [k, sig] of Object.entries(SIGS)) {
  const want = execSync(`cast sig ${JSON.stringify(sig)}`, { encoding: 'utf8' }).trim();
  if (found[k] === want) pass++; else { fail++; console.log(`FAIL ${k}: page ${found[k]} cast ${want}`); }
}
const extra = Object.keys(found).filter(k => !SIGS[k]);
if (extra.length) { fail++; console.log('FAIL selectors with no signature to check:', extra.join(', ')); } else pass++;

const topic = (src.match(/TOPIC_LIQ = '(0x[0-9a-f]{64})'/) || [])[1];
const want = execSync(`cast keccak "LiquidationRecorded(uint256,bytes32,uint256,uint64)"`, { encoding: 'utf8' }).trim();
if (topic === want) pass++; else { fail++; console.log(`FAIL LiquidationRecorded topic: page ${topic} cast ${want}`); }

// CROSS_SOURCE is index 4 of Provenance.Rule; the page sends that number
const rule = readFileSync('/home/arch/lantern/src/libraries/Provenance.sol', 'utf8');
const names = rule.slice(rule.indexOf('enum Rule {') + 11, rule.indexOf('}', rule.indexOf('enum Rule {'))).split('\n')
  .map(l => l.replace(/\/\/.*/, '').replace(/[,\s]/g, '')).filter(Boolean);
if (names.indexOf('CROSS_SOURCE') === 4 && /\[K\.id, 4, CFG\.peer, stake\]/.test(src)) pass++;
else { fail++; console.log('FAIL CROSS_SOURCE index', names); }

// the Cases list reads every case from these event topics, and decodes fields at fixed positions
const dash = readFileSync('/home/arch/lantern/site/assets/js/dashboard.js', 'utf8');
const EVENTS = {
  LiquidationRecorded: 'LiquidationRecorded(uint256,bytes32,uint256,uint64)',
  ChallengeOpened: 'ChallengeOpened(uint256,address,uint8,uint256)',
  ChallengeUpheld: 'ChallengeUpheld(uint256,uint8,uint256,uint256)',
  ChallengeRefused: 'ChallengeRefused(uint256,uint256)',
  ChallengeVoided: 'ChallengeVoided(uint256,uint256)',
  BonusReleased: 'BonusReleased(uint256,address,uint256)',
  Liquidated: 'Liquidated(uint256,address,address,uint256,uint256,uint256,uint256,uint64)',
  SeizureClaimed: 'SeizureClaimed(uint256,uint8,address,uint256)'
};
const sol = readFileSync('/home/arch/lantern/src/core/Lantern.sol', 'utf8') + readFileSync('/home/arch/lantern/src/market/LendingMarket.sol', 'utf8');
for (const [name, sig] of Object.entries(EVENTS)) {
  const page = (dash.match(new RegExp(name + ": '(0x[0-9a-f]{64})'")) || [])[1];
  const want = execSync(`cast keccak ${JSON.stringify(sig)}`, { encoding: 'utf8' }).trim();
  // the signature itself must match the source, so a changed event cannot pass with a stale string
  const decl = (sol.match(new RegExp('event ' + name + '\\(([^;]*)\\);')) || [])[1] || '';
  const types = decl.split(',').map(p => p.trim().split(/\s+/)[0]).join(',');
  if (page === want && sig === `${name}(${types})`) pass++;
  else { fail++; console.log(`FAIL ${name}: page ${page} cast ${want} source ${name}(${types})`); }
}

// the demo feed refuses a lie outside the band the page's slider offers
const core = readFileSync('/home/arch/lantern/convex-host/convex/lib/feedCore.js', 'utf8');
const html = readFileSync('/home/arch/lantern/site/dashboard/index.html', 'utf8');
const gmin = +core.match(/GAP_MIN = (\d+)/)[1], gmax = +core.match(/GAP_MAX = (\d+)/)[1];
const slider = html.match(/id="gapIn"[^>]*/)[0];
const smin = +slider.match(/min="(\d+)"/)[1] * 100, smax = +slider.match(/max="(\d+)"/)[1] * 100;
if (smin >= gmin && smax <= gmax) pass++; else { fail++; console.log(`FAIL slider ${smin}-${smax} outside server ${gmin}-${gmax}`); }

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
