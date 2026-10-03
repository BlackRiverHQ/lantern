/* config.ts — every constant the dashboard reads from. Every selector and event topic here is
   produced by `cast sig` / `cast keccak` against the compiled source, never typed by hand;
   test/selectors.test.mjs re-derives them all and compares. */

export const CHAIN_ID = 421614;

export type Config = {
  chainId: number;
  lantern: string;
  market: string;
  asset: string;
  collateral: string;
  aggregator: string;
  subject: string;
  peer: string;
  decimals: number;
  explorer: string;
  rpcs: string[];
  fromBlock: number;
  api: string;
  faucet: string;
};

const DEFAULTS: Config = {
  chainId: CHAIN_ID,
  lantern: "0xcdce3a1b3ebf7fe1e340ab670e25fe768195ac54",
  market: "0x290714d09f6d1ab50f7c31698eda92993ab01f95",
  asset: "0x185690fb4d3c765bac544423a34953b2b8b03a22",
  collateral: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
  // the market's second source, read directly: Chainlink ETH/USD on this chain, eight decimals
  aggregator: "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165",
  subject: "0xf7ed0c5000d57be8bb1723e1298ee49e6a076692f4ef68d27dd00db178f57210",
  peer: "0x0bf35ab8318649a0b126cdc6fb6c89b2ebbb1659b37fbd0b3aca12e6eefa71a2",
  decimals: 6,
  // Blockscout shows the verified source for every contract here; Arbiscan does not
  explorer: "https://arbitrum-sepolia.blockscout.com",
  rpcs: ["https://sepolia-rollup.arbitrum.io/rpc", "https://arbitrum-sepolia-rpc.publicnode.com"],
  fromBlock: 315054532,
  api: "/api/print",
  faucet: "https://www.alchemy.com/faucets/arbitrum-sepolia",
};

/* A test harness or a fork run may supply its own, so the same page can run against a local chain
   without editing two configs. */
export function config(): Config {
  const o = (globalThis as any).__LANTERN__ as Partial<Config> | undefined;
  if (!o) return DEFAULTS;
  const merged: any = { ...DEFAULTS };
  for (const k of Object.keys(o)) merged[k] = (o as any)[k];
  if ((o as any).rpc && !o.rpcs) merged.rpcs = [(o as any).rpc, ...DEFAULTS.rpcs.slice(1)];
  return merged as Config;
}

export const CROSS_SOURCE = 4; // Provenance.Rule index; test re-derives it from the Solidity enum
export const RULE_NAMES = [
  "one feed, two words for one round",
  "stale when it was consumed",
  "outside the feed's own history",
  "issued for another asset or slot",
  "two sources disagree",
];
export const TOLERANCE_BPS = 500n; // CROSS_SOURCE_TOLERANCE_BPS
export const DRIFT_BPS = 2000n; // MAX_REPORT_DRIFT_BPS

/* Every function selector the page uses, grouped by the contract it belongs to. `cast sig` for
   each signature is in test/selectors.test.mjs. */
export const SEL = {
  // Lantern
  reg: "0x738fdd1a", // reg()
  operatorOf: "0x63ea4ab2", // operatorOf(bytes32)
  bondOf: "0x0fb585ba", // bondOf(bytes32)
  exposureOf: "0x5e40b77b", // exposureOf(bytes32)
  peerOf: "0x9730d3e5", // peerOf(bytes32)
  requiredBond: "0xcd8f9967", // requiredBond(bytes32)
  priceable: "0x7ea8464f", // priceable(bytes32)
  feedErrors: "0xc4334ab4", // feedErrors(bytes32)
  minStake: "0x375b3c0a", // minStake()
  bountyBps: "0x415307cc", // bountyBps()
  escrowOf: "0x2d2a8d9c", // escrowOf(uint256)
  challengeOf: "0x2a4ccee5", // challengeOf(uint256)
  lastReport: "0xe6efcd98", // lastReport(bytes32)
  reportAt: "0x50da588b", // reportAt(bytes32,uint64)
  recordReport: "0x65e9adac", // recordReport(bytes32,uint256,uint64,uint64,bytes32,address)
  registerFeed: "0x612fd484", // registerFeed(bytes32,bytes32,uint8)
  setPeerFeed: "0x0475b1c2", // setPeerFeed(bytes32,bytes32)
  depositBond: "0x09e08644", // depositBond(bytes32,uint256)
  withdrawBond: "0x450706d3", // withdrawBond(bytes32,uint256)
  openChallenge: "0x09917500", // openChallenge(uint256,uint8,bytes,uint256)
  adjudicate: "0xcf8d0657", // adjudicate(uint256)
  voidStaleChallenge: "0x6b3f5fe2", // voidStaleChallenge(uint256)
  release: "0x37bdc99b", // release(uint256)
  // the market: it prices from the feed itself and decides what to close
  accountOf: "0x8086b8ba", // accountOf(address)
  healthOf: "0xf17e83b4", // healthOf(address,uint256)
  seizureOf: "0xee939d20", // seizureOf(uint256)
  closeFactorBps: "0x4654440b", // closeFactorBps()
  liquidationBonusBps: "0x19970d8e", // liquidationBonusBps()
  collateralValueOf: "0x7f242e24", // collateralValueOf(address,uint256)
  supply: "0x35403023", // supply(uint256)
  depositCollateral: "0xbad4a01f", // depositCollateral(uint256)
  withdrawCollateral: "0x6112fe2e", // withdrawCollateral(uint256)
  borrow: "0xc5ebeaec", // borrow(uint256)
  repay: "0x371fd8e6", // repay(uint256)
  withdraw: "0x2e1a7d4d", // withdraw(uint256)
  liquidate: "0x36eb326d", // liquidate(address,uint256,uint64,uint256)
  claim: "0x379607f5", // claim(uint256)
  // tokens
  balanceOf: "0x70a08231", // balanceOf(address)
  allowance: "0xdd62ed3e", // allowance(address,address)
  approve: "0x095ea7b3", // approve(address,uint256)
  faucetClaim: "0x4e71d92d", // claim() on the asset: rate-limited, no open mint
  claimedAt: "0x8d64422d", // claimedAt(address)
  cooldown: "0x787a08a6", // cooldown()
  wrap: "0xd0e30db0", // deposit() on wrapped ether, payable
  // oracle
  latestRoundData: "0xfeaf968c", // latestRoundData()
} as const;

export type SelectorName = keyof typeof SEL;

/* Event topics, `cast keccak` of each signature. */
export const TOPICS = {
  LiquidationRecorded: "0x3dc45dc4282f1b79aa977ca44f3966fd1e704e1d7264c8235464dc0b2a15460b",
  Liquidated: "0x3aee02da1bacc0c74340c75630e203d96410d71752a82e5c217d9776121c0128",
  ChallengeOpened: "0x26e5b086c073f25dd812ce01efd7524233489555f5b0591253c4f236bb79762d",
  ChallengeUpheld: "0x55b829cef7cad8bef1a62cf7e471ae3491efb3576757129e5be9e03ec1284077",
  ChallengeRefused: "0x18e16cc42c00099c04eeb2326ae0f0e407a334a3a3703e1fcf304fc37e1291b6",
  ChallengeVoided: "0x44fd6fd4050e131e47fdf9e3b4a731eb20fb723105dc1d48852fc5864dccba26",
  BonusReleased: "0x3334a79f183e2e8b5df01c85de8e210f33d28b3342852eb454ea5d5d975a3ff3",
  SeizureClaimed: "0x55e2834809ea7fc030129769f879fda1d5a1612c8aec06845620813bfb9231d8",
} as const;

export type EventName = keyof typeof TOPICS;
export const EVENT_BY_TOPIC: Record<string, EventName> = Object.fromEntries(
  Object.entries(TOPICS).map(([n, t]) => [t, n as EventName])
);

/* ILanternErrors plus the asset's and the market's own refusals, every selector from `cast sig`.
   A bond or a stake pulls the token, so the token's errors surface on protocol buttons too. */
export const ERRORS: Record<string, string> = {
  "0xbfae38b3": "NotMarket(address)",
  "0x08a47fe2": "UnknownFeed(bytes32)",
  "0xd09bc9e1": "FeedAlreadyRegistered(bytes32)",
  "0xe01218e4": "UnderBonded(bytes32,uint256,uint256)",
  "0x1f96851f": "ReportTooOld(bytes32,uint64,uint64)",
  "0xd41b1623": "RoundNotMonotone(bytes32,uint64,uint64)",
  "0xcf452d27": "SlotConflict(bytes32,uint64)",
  "0xc30ad91a": "PayloadReused(bytes32)",
  "0x0f8109a5": "ValueOutsideBand(bytes32,uint256,uint256,uint256)",
  "0x91d2bfcf": "DriftExceeded(uint256,uint256,uint256)",
  "0x5827df0f": "UnknownLiquidation(uint256)",
  "0xf2edb43d": "LiquidationAlreadySettled(uint256)",
  "0x184663dd": "WindowClosed(uint256,uint256)",
  "0xe5168562": "WindowOpen(uint256,uint256)",
  "0x1ea62985": "ChallengeAlreadyOpen(uint256)",
  "0x46bb1c0f": "UnknownChallenge(uint256)",
  "0x327caf12": "ChallengeAlreadyResolved(uint256)",
  "0x78e030db": "StakeBelowMinimum(uint256,uint256)",
  "0xcb3a13f7": "EmptyEvidence()",
  "0x32fdd665": "BadRuleKind(uint8)",
  "0xc389ece3": "NothingToPay(uint256)",
  "0x1f2a2005": "ZeroAmount()",
  "0xd92e233d": "ZeroAddress()",
  "0x1a30f243": "ImmutableParameter()",
  "0x8e9ad41c": "BadDecimals(uint256)",
  "0x3c868ec6": "DecimalsMismatch(uint8,uint8)",
  "0xab143c06": "Reentrancy()",
  "0xc55e5473": "ChallengeStillFresh(uint256)",
  "0x273e0fd2": "PeerAlreadyDeclared(bytes32)",
  "0xf52a3023": "BadPeer(bytes32,bytes32)",
  "0x9aafae02": "ReportTooThin(bytes32,uint64,uint64)",
  // the asset's own refusals
  "0x7939f424": "TransferFromFailed()",
  "0xf4d678b8": "InsufficientBalance()",
  "0x13be252b": "InsufficientAllowance()",
  "0x90b8ec18": "TransferFailed()",
  "0x2e847cbc": "TransferShort(uint256,uint256)",
  "0x329766e9": "TransferFromShort(uint256,uint256)",
  "0xdad10ce9": "ClaimTooSoon(address,uint64)",
  // the market's own refusals
  "0xb07e3bc4": "InsufficientCollateral(uint256,uint256)",
  "0x4eb7b713": "InsufficientSupplied(uint256,uint256)",
  "0xa17e11d5": "InsufficientLiquidity(uint256,uint256)",
  "0xcf479181": "InsufficientBalance(uint256,uint256)",
  "0xe52acc06": "WouldBeUnhealthy(uint256,uint256)",
  "0x2ff435d3": "PositionIsHealthy(address,uint256,uint256)",
  "0x09d6d0bf": "NothingToLiquidate(address)",
  "0x74f938ce": "RepayOutOfRange(uint256,uint256)",
  "0x93782367": "SeizeExceedsCollateral(uint256,uint256)",
  "0xc5b68975": "FeedCannotPrice(bytes32)",
  "0x4b52109d": "UnknownRound(uint64)",
  "0xb3167bfa": "AlreadyClaimed(uint256)",
  "0x38aa087c": "NotSettled(uint256)",
  "0x4bf8e32a": "BadOutcome(uint8)",
};
