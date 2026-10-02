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

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
