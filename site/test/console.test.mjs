// Re-derives every call the console can build, with cast, and compares it to the console's own encoder.
// Any drift between the two shows up here rather than as a failed transaction.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SRC = '/home/arch/lantern/site/assets/js/console.js';
const window = { __LANTERN__: null };
globalThis.window = window;
eval(readFileSync(SRC, 'utf8'));
const C = window.LanternConsole;

const SUBJECT = '0xf7ed0c5000d57be8bb1723e1298ee49e6a076692f4ef68d27dd00db178f57210';
const PEER = '0x0bf35ab8318649a0b126cdc6fb6c89b2ebbb1659b37fbd0b3aca12e6eefa71a2';
const BOB = '0x0000000000000000000000000000000000000b0b';

function castCalldata(sig, args) {
  return execSync(`cast calldata ${JSON.stringify(sig)} ${args.join(' ')}`, { encoding: 'utf8' }).trim();
}

const cases = [
  ['registerFeed', ['bytes32', 'bytes32', 'uint8'], [SUBJECT, '0x' + '11'.repeat(32), '18'],
    'registerFeed(bytes32,bytes32,uint8)', [SUBJECT, '0x' + '11'.repeat(32), 18]],
  ['setPeerFeed', ['bytes32', 'bytes32'], [SUBJECT, PEER], 'setPeerFeed(bytes32,bytes32)', [SUBJECT, PEER]],
  ['depositBond', ['bytes32', 'uint256'], [SUBJECT, '1000000000000000000'],
    'depositBond(bytes32,uint256)', [SUBJECT, '1000000000000000000']],
  ['withdrawBond', ['bytes32', 'uint256'], [SUBJECT, '500000000000000000'],
    'withdrawBond(bytes32,uint256)', [SUBJECT, '500000000000000000']],
  ['recordReport', ['bytes32', 'uint256', 'uint64', 'uint64', 'bytes32', 'address'],
    [SUBJECT, '100000000000000000000', '7', '1790933158', '0x' + 'ab'.repeat(32), BOB],
    'recordReport(bytes32,uint256,uint64,uint64,bytes32,address)',
    [SUBJECT, '100000000000000000000', 7, 1790933158, '0x' + 'ab'.repeat(32), BOB]],
  ['openChallenge', ['uint256', 'uint8', 'bytes', 'uint256'], ['10', '4', 'peer disagreed 96.35%', '10000000000000000'],
    'openChallenge(uint256,uint8,bytes,uint256)', [10, 4, '0x' + Buffer.from('peer disagreed 96.35%').toString('hex'), '10000000000000000']],
  ['adjudicate', ['uint256'], ['10'], 'adjudicate(uint256)', [10]],
  ['voidStaleChallenge', ['uint256'], ['9'], 'voidStaleChallenge(uint256)', [9]],
  ['release', ['uint256'], ['1'], 'release(uint256)', [1]],
  ['liquidate', ['uint256', 'bytes32', 'uint64', 'uint256', 'address'],
    ['11', SUBJECT, '8', '1000000000000000000', BOB],
    'liquidate(uint256,bytes32,uint64,uint256,address)', [11, SUBJECT, 8, '1000000000000000000', BOB]],
  ['liquidateWithNotional', ['uint256', 'bytes32', 'uint64', 'uint256', 'uint256', 'address'],
    ['12', SUBJECT, '9', '1000000000000000000', '100000000000000000000', BOB],
    'liquidateWithNotional(uint256,bytes32,uint64,uint256,uint256,address)',
    [12, SUBJECT, 9, '1000000000000000000', '100000000000000000000', BOB]],
  ['approve', ['address', 'uint256'], [BOB, '1000000000000000000'], 'approve(address,uint256)', [BOB, '1000000000000000000']]
];

let pass = 0, fail = 0;
for (const [name, types, values, sig, castArgs] of cases) {
  const mine = C.encode(name, types, values).toLowerCase();
  const theirs = castCalldata(sig, castArgs).toLowerCase();
  const ok = mine === theirs;
  ok ? pass++ : fail++;
  if (!ok) {
    console.log('MISMATCH', name);
    console.log('  console:', mine);
    console.log('  cast   :', theirs);
  }
}

// keccak against cast, which is what feed ids are derived from
const hashCases = ['FEED:ARB-SEPOLIA-DEMO', 'FEED:ETH-USD-PEER', '', 'a longer string with spaces and symbols !@#$%^&*()'];
for (const s of hashCases) {
  const mine = C.keccak256(C.stringToBytes(s)).toLowerCase();
  const theirs = execSync(`cast keccak ${JSON.stringify(s)}`, { encoding: 'utf8' }).trim().toLowerCase();
  const ok = mine === theirs;
  ok ? pass++ : fail++;
  if (!ok) { console.log('KECCAK MISMATCH', JSON.stringify(s), '\n  console:', mine, '\n  cast   :', theirs); }
}

// a readable label where an id is expected must hash, not truncate
const labelled = C.encode('registerFeed', ['bytes32', 'bytes32', 'uint8'], ['FEED:MY-LABEL', '0x' + '11'.repeat(32), 18]);
const labelledCast = castCalldata('registerFeed(bytes32,bytes32,uint8)',
  [execSync('cast keccak "FEED:MY-LABEL"', { encoding: 'utf8' }).trim(), '0x' + '11'.repeat(32), 18]).toLowerCase();
const labelledOk = labelled.toLowerCase() === labelledCast;
labelledOk ? pass++ : fail++;
if (!labelledOk) { console.log('LABEL MISMATCH\n  console:', labelled, '\n  cast   :', labelledCast); }

// error decoding, against reverts the tests actually produce
const errCases = [
  ['0x9aafae02' + '0'.repeat(24) + SUBJECT.slice(2) + '0'.repeat(48) + '00' + '0'.repeat(14) + '00',
    'ReportTooThin'],
  ['0xe01218e4' + '0'.repeat(24) + SUBJECT.slice(2) + BigInt(1e17).toString(16).padStart(64, '0') + BigInt(1e18).toString(16).padStart(64, '0'),
    'UnderBonded'],
  ['0xcb3a13f7', 'EmptyEvidence'],
  ['0x32fdd665' + '0'.repeat(62) + '09', 'BadRuleKind']
];
for (const [data, expect] of errCases) {
  const got = C.decodeError(data) || '';
  const ok = got.startsWith(expect);
  ok ? pass++ : fail++;
  if (!ok) console.log('ERROR DECODE MISMATCH', expect, '->', got);
}

// unit parsing
const unitCases = [['1', '1000000000000000000'], ['0.5', '500000000000000000'], ['2.25', '2250000000000000000'],
  ['1000', '1000000000000000000000'], ['.5', '500000000000000000']];
for (const [text, expect] of unitCases) {
  const got = C.parseUnits(text).toString();
  const ok = got === expect;
  ok ? pass++ : fail++;
  if (!ok) console.log('UNITS MISMATCH', text, got, 'expected', expect);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
