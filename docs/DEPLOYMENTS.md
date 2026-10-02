# Deployments

## Arbitrum Sepolia, chain id 421614

| Contract | Address |
|---|---|
| Lantern | `0x9420b6B3e5Cc8FC028b34206F9C0388230a6B772` |
| Market | `0x53fFF340f1e6796F905985E43e7a784b0e687066` |
| Asset | `0xfF062343892989373F422F7543F0587581594249` |
| Feed registry (built by Lantern) | `0x2Eb1fcd3c547a600D1b7e99e5D5bFc2132134997` |
| History (built by Lantern) | `0x53d9d6f28175e5d95b852a9056dbda76998be009` |
| Report book (built by Lantern) | `0x43a9470d8bc50feabb83534da2bd1da35969cf99` |
| Chainlink source | `0x3Fba7aBB9f393446917c9cAA5BD99b40FC85DF98` |
| Chainlink ETH/USD on this chain | `0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165` |

Feeds: subject `0xf7ed0c50...f57210`, peer (ETH/USD) `0x0bf35ab8...fa71a2`. The operator on both is
`0xE47A5f83...76bdc4`, which holds no role beyond being the deployer key on this testnet.

Deployed at block `314,935,709` (2026-10-02 09:15 UTC). Addresses that appeared in earlier versions of
this document belong to a superseded revision; this table and [deployments.json](../deployments.json)
are the current record.

## Revision

This deployment predates the current source: it was broadcast before the depth and notional work
landed, and the registry shows it. `band(feed)` on the deployed registry returns a single word where
the current `FeedRegistry.band` returns `(lo, hi)`, and `samplesOf(feed)` reverts on it entirely - so
the pricing floor, which reads depth through `_history.samplesOf` while recording a report, cannot be
enforced by this revision.

A redeploy of the current source was attempted at block `314,943,478` (09:48 UTC) and ran out of gas:
only the asset landed, which is why `broadcast/Deploy.s.sol/421614/run-latest.json` names a Lantern and
a market that have no code. Running the sequence below against the current source replaces this section
with a fresh record.

## What the chain says now

Verbatim `cast` reads - reproduce them yourself:

```
$ cast call $LANTERN 'assetDecimals()(uint8)'        --rpc-url $RPC
18
$ cast call $LANTERN 'minBond()(uint256)'            --rpc-url $RPC
100000000000000000
$ cast call $LANTERN 'feedErrors(bytes32)(uint256)' $SUBJECT --rpc-url $RPC
2
$ cast call $LANTERN 'peerOf(bytes32)(bytes32)'     $SUBJECT --rpc-url $RPC
0x0bf35ab8318649a0b126cdc6fb6c89b2ebbb1659b37fbd0b3aca12e6eefa71a2
$ cast call $LANTERN 'requiredBond(bytes32)(uint256)' $SUBJECT --rpc-url $RPC
1400000000000000000
$ cast call $LANTERN 'bonusOutcome(uint256)(uint8)' 10 --rpc-url $RPC
2
```

Reading those together: two prints were caught on this feed, the second by comparison against a live
Chainlink source declared in advance, the bonus on that liquidation was redirected rather than paid
(2), and the feed's bond requirement has escalated to 1.4 times its exposure.

## Reproduce

Four scripts, in order, each needing the addresses the previous one printed. Export them once:

```
export PRIVATE_KEY=...                       # testnet key, gas only
export RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
export ARBISCAN_API_KEY=...                  # only for verifying the source on the explorer

forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast -vv
# then, from its output:
export LANTERN=0x...   MARKET=0x...
export SUBJECT_FEED_ID=0xf7ed0c50...   PEER_FEED_ID=0x0bf35ab8...

forge script script/DemoRun.s.sol                 --rpc-url $RPC_URL --broadcast -vv
forge script script/ReportFromChainlink.s.sol     --rpc-url $RPC_URL --broadcast -vv
forge script script/ChallengeWithChainlink.s.sol  --rpc-url $RPC_URL --broadcast -vv
```

`make redeploy` runs that sequence in order. Both Chainlink scripts also take `BONUS` and
`LIQUIDATION_ID`; `ReportFromChainlink` takes `AGGREGATOR` to override the ETH/USD aggregator. `ROUND`
chooses which round the peer's answer is placed at, because the comparison is by the subject feed's
round; Chainlink's own round id is phase-encoded above 64 bits and is reported as zero rather than
truncated. `.env.example` lists every variable each script reads.

## Cost

The whole deployment - token, Lantern, registry and market, three transactions - measured 5,881,630
gas, 0.000237 ETH at the 0.0401 gwei it actually paid. The caught case across eleven transactions was
1,585,676 gas, 0.000064 ETH. Per-transaction figures, and the ceilings that guard them, are in
[GAS.md](../GAS.md).
