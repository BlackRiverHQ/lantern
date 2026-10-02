# Deployments

## Arbitrum Sepolia, chain id 421614

| Contract | Address |
|---|---|
| Lantern | `0x9420b6B3e5Cc8FC028b34206F9C0388230a6B772` |
| Market | `0x53fFF340f1e6796F905985E43e7a784b0e687066` |
| Asset | `0xfF062343892989373F422F7543F0587581594249` |
| Feed registry (built by Lantern) | `0x2Eb1fcd3c547a600D1b7e99e5D5bFc2132134997` |
| Chainlink source | `0x3Fba7aBB9f393446917c9cAA5BD99b40FC85DF98` |
| Chainlink ETH/USD on this chain | `0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165` |

Feeds: subject `0xf7ed0c50...f57210`, peer (ETH/USD) `0x0bf35ab8...fa71a2`.

Addresses that appeared in earlier versions of this document belong to a superseded revision; this
table and [deployments.json](../deployments.json) are the current record.

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

```
export PRIVATE_KEY=...                       # testnet key, gas only
export RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

forge script script/Deploy.s.sol               --rpc-url $RPC_URL --broadcast -vv
forge script script/DemoRun.s.sol              --rpc-url $RPC_URL --broadcast -vv
forge script script/ReportFromChainlink.s.sol  --rpc-url $RPC_URL --broadcast -vv
forge script script/ChallengeWithChainlink.s.sol --rpc-url $RPC_URL --broadcast -vv
```

The Chainlink scripts read the aggregator live. `ROUND` chooses which round the peer's answer is placed
at, because the comparison is by the subject feed's round; Chainlink's own round id is phase-encoded
above 64 bits and is reported as zero rather than truncated.

## Cost

The whole deployment - token, Lantern, registry and market - measured at roughly 0.0005 ETH of gas on
this chain, and the full caught case across thirteen transactions at roughly 0.0002 ETH.
