# Deployments

## Arbitrum Sepolia, chain id 421614

| Contract | Address |
|---|---|
| Lantern | `0x83b4E869a471638c374De4Bcf4Ab6Ba2396f9040` |
| Market | `0x4b41D14D0aD565E1135676af0aD270227Bf879dF` |
| Asset | `0xf00Ffe2F1e3f49F225124107b7f8218255F722eE` |
| Feed registry (built by Lantern) | `0x8a57442AC47d2ceC7D3B9cE6E1323603012EF57B` |
| History (built by Lantern) | `0x60bAC9cAE4551e4E1900898b29BECe48B6CaC9e4` |
| Report book (built by Lantern) | `0xCC12b22e7ce416EEc9F5f5B1D68c02cc8252dA5a` |
| Chainlink source | `0xf7Bb2294b01D5ADb2470cad3F856A4C4C49Cf4d9` |
| Chainlink ETH/USD on this chain | `0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165` |

Feeds: subject `0xf7ed0c50...f57210`, peer (ETH/USD) `0x0bf35ab8...fa71a2`. The operator on both is
`0x574D7E88...5F7913`, which holds no role beyond being the deployer key on this testnet.

Deployed at block `315,044,920` (2026-10-02 16:50 UTC). Addresses that appeared in earlier versions of
this document belong to a superseded revision; this table and [deployments.json](../deployments.json)
are the current record.

## This deployment is the current source

Two checks, both reproducible:

```
$ cast code $LANTERN --rpc-url $RPC | wc -c
27127                       # 13,562 bytes, the same as forge inspect on this source

$ cast call $REGISTRY 'samplesOf(bytes32)(uint256)' $SUBJECT --rpc-url $RPC
6
```

The second one is the point. `FeedRegistry.samplesOf` is the depth accessor the pricing floor reads
through while recording a report, and it did not exist on the previous deployment: calling it there
returned no data at all, which is what a selector a contract does not implement produces. Here it
answers, so a round can only be priced with four prints behind it, and a bond must cover a share of the
notional it is exposing. Both are enforced by this revision.

A third check says more than the byte count, because deployed code is never byte-identical to the
artifact - the constructor substitutes the immutables into it. `script/verify-source.sh` compares the
two and requires that they be the same length, that the metadata trailer be identical, which pins
compiler, sources and settings, and that every differing byte be a slot the artifact leaves zero:

```
$ ./script/verify-source.sh all
  VERDICT: Lantern on chain is this source, with its 30 immutable values filled in
  VERDICT: FeedRegistry on chain is this source, with its 22 immutable values filled in
```

All six contracts are verified on Sourcify with an exact match on both the creation and the runtime
bytecode - no API key involved, which is why Sourcify rather than Arbiscan:

```
$ curl -s https://sourcify.dev/server/v2/contract/421614/$LANTERN | jq .match
"exact_match"
```

The same source is readable on the public explorer without a key, at
`https://arbitrum-sepolia.blockscout.com/address/<address>`, which is where a reviewer who does not
want to install anything will look. Arbiscan would need an API key; its anonymous submission quota is
shared and was exhausted, so the Arbiscan page will not show source until one is supplied and
`forge verify-contract` is re-run with it.

## Superseded, kept as the record

The previous deployment was broadcast at block `314,935,709` (09:15 UTC), nineteen minutes before the
depth work landed, and could not enforce either rule. Its Lantern was
`0x9420b6B3e5Cc8FC028b34206F9C0388230a6B772`, its registry `0x2Eb1fcd3c547a600D1b7e99e5D5bFc2132134997`.
An earlier attempt at block `314,943,478` (09:48 UTC) ran out of gas: only the asset landed
(`0x556488fc...`), which is why that broadcast names a Lantern (`0x00c9382e...`) and a market
(`0xdae213fd...`) with no code on chain. An even earlier deploy at 09:07 UTC
(Lantern `0xf3e59109...`) is superseded too.

`make redeploy` refuses to continue when a reported address has no code, and
`script/rehearse-fork.sh` runs the whole sequence against a fork of the live chain first, which is how
the three mismatches that made the previous attempts unrunnable were found.

## What the chain says now

Verbatim `cast` reads - reproduce them yourself:

```
$ cast call $LANTERN 'assetDecimals()(uint8)'           --rpc-url $RPC
18
$ cast call $LANTERN 'minBond()(uint256)'               --rpc-url $RPC
100000000000000000
$ cast call $LANTERN 'holdWindow()(uint64)'             --rpc-url $RPC
300
$ cast call $LANTERN 'bountyBps()(uint16)'              --rpc-url $RPC
2000
$ cast call $LANTERN 'feedErrors(bytes32)(uint256)' $SUBJECT --rpc-url $RPC
2
$ cast call $LANTERN 'bondOf(bytes32)(uint256)'     $SUBJECT --rpc-url $RPC
997800000000000000000
$ cast call $LANTERN 'requiredBond(bytes32)(uint256)' $SUBJECT --rpc-url $RPC
140000000000000000
$ cast call $LANTERN 'exposureOf(bytes32)(uint256)'  $SUBJECT --rpc-url $RPC
0
$ cast call $LANTERN 'peerOf(bytes32)(bytes32)'      $SUBJECT --rpc-url $RPC
0x0bf35ab8318649a0b126cdc6fb6c89b2ebbb1659b37fbd0b3aca12e6eefa71a2
$ cast call $LANTERN 'priceable(bytes32)(bool)'      $SUBJECT --rpc-url $RPC
true
$ cast call $LANTERN 'bonusOutcome(uint256)(uint8)' 1 --rpc-url $RPC
2
$ cast call $REGISTRY 'samplesOf(bytes32)(uint256)'  $SUBJECT --rpc-url $RPC
6
$ cast call $REGISTRY 'band(bytes32)(uint256,uint256)' $SUBJECT --rpc-url $RPC
59110000000000000000 [5.911e19]
140890000000000000000 [1.408e20]
```

Reading those together: two prints were caught on this feed - one by a slot conflict, the second by
comparison against a live Chainlink source declared in advance - the bonus on the first liquidation was
redirected rather than paid (2), the requirement has escalated to 1.4 times the floor (two caught
prints, 20% each), and nothing is exposed at the moment, which is the state a feed sits in once its
escrow has settled. The bond still covers the requirement with room to spare.

## Reproduce

The whole sequence, in order, against the addresses this run makes. The key is read from a file outside
the repository so it never has to be exported by hand:

```
cast wallet new --json > ~/.lantern-deployer.json && chmod 600 ~/.lantern-deployer.json
make redeploy-account
```

`make redeploy` does the same with `PRIVATE_KEY` already in the environment, and
`make rehearse` runs the sequence against a fork of the live chain, for free, before paying for it.
Both Chainlink scripts take `BONUS` and `LIQUIDATION_ID`; `ReportFromChainlink` takes `AGGREGATOR` to
override the ETH/USD aggregator. `ROUND` chooses which round the peer's answer is placed at, because
the comparison is by the subject feed's round; Chainlink's own round id is phase-encoded above 64 bits
and is reported as zero rather than truncated. `.env.example` lists every variable each script reads.

## Cost

The deploy - token, Lantern, market, with the registry, history store and report book built inside
Lantern's constructor - measured 5,936,603 gas across three transactions: asset 406,564, Lantern
5,246,522, market 283,517. The demo, the live Chainlink read and the challenge that followed were
15, 7 and 8 transactions: 3,315,025, 1,370,654 and 1,142,069 gas.

Thirty-three transactions in total, 11,764,351 gas, which at the 0.042 gwei the run paid is
0.0004947 ETH. Per-transaction figures, and the ceilings that guard them, are in [GAS.md](../GAS.md).
