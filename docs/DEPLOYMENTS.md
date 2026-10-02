# Deployments

## Arbitrum Sepolia, chain id 421614

| Contract | Address |
|---|---|
| Lantern | `0xcdce3a1b3ebf7fe1e340ab670e25fe768195ac54` |
| Market | `0x290714d09f6d1ab50f7c31698eda92993ab01f95` |
| Asset | `0x185690fb4d3c765bac544423a34953b2b8b03a22` |
| Feed registry (built by Lantern) | `0xc0e5c6b3176e2B05f5D5dd37A81Da623D600c155` |
| History (built by Lantern) | `0xf23D59aE3e8a6C1b02F34bDFC4B356a39056e6Ba` |
| Report book (built by Lantern) | `0xCb7795c5EaFA9770c60227bd0b0F43d78A5b9760` |
| Chainlink source | `0xe682D11a014E82D62eb0fAaCb1bc60E12ce2De6c` |
| Chainlink ETH/USD on this chain | `0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165` |

Feeds: subject `0xf7ed0c50...f57210`, peer (ETH/USD) `0x0bf35ab8...fa71a2`. The operator on both is
`0x574D7E88...5F7913`, which holds no role beyond being the deployer key on this testnet.

Deployed at block `315,054,532` (2026-10-02 17:30 UTC). Addresses that appeared in earlier versions of
this document belong to a superseded revision; this table and [deployments.json](../deployments.json)
are the current record.

## This deployment is the current source

Two checks, both reproducible:

```
$ cast code $LANTERN --rpc-url $RPC | wc -c
27127                       # 13,562 bytes, the same as forge inspect on this source

$ cast call $REGISTRY 'samplesOf(bytes32)(uint256)' $SUBJECT --rpc-url $RPC
5
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
  VERDICT: Lantern on chain is this source, with its 38 immutable values filled in
  VERDICT: LendingMarket on chain is this source, with its 66 immutable values filled in
  VERDICT: FaucetToken on chain is this source, with its 7 immutable values filled in
  VERDICT: FeedRegistry on chain is this source, with its 15 immutable values filled in
  VERDICT: History on chain is this source, with its 6 immutable values filled in
  VERDICT: ReportBook on chain is this source, with its 6 immutable values filled in
```

Those addresses are read from `deployments.json` rather than typed into the script, so a redeploy
cannot leave this proving an instance nobody is using.

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

The revision before this one was broadcast at block `315,044,920` (16:50 UTC): Lantern
`0x83b4E869a471638c374De4Bcf4Ab6Ba2396f9040`, market `0x4b41D14D0aD565E1135676af0aD270227Bf879dF`,
asset `0xf00Ffe2F1e3f49F225124107b7f8218255F722eE`. It was this source at that time and its market
was a test double that let a caller declare a liquidation rather than compute one; the market here is a
real one, so it supersedes it. Everything below is older still.

The deployment before that was broadcast at block `314,935,709` (09:15 UTC), nineteen minutes before the
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
6
$ cast call $LANTERN 'minBond()(uint256)'               --rpc-url $RPC
100000
$ cast call $LANTERN 'minStake()(uint256)'              --rpc-url $RPC
1000
$ cast call $LANTERN 'holdWindow()(uint64)'             --rpc-url $RPC
300
$ cast call $LANTERN 'feedErrors(bytes32)(uint256)' $SUBJECT --rpc-url $RPC
1
$ cast call $LANTERN 'bondOf(bytes32)(uint256)'     $SUBJECT --rpc-url $RPC
199700
$ cast call $LANTERN 'requiredBond(bytes32)(uint256)' $SUBJECT --rpc-url $RPC
120000
$ cast call $LANTERN 'exposureOf(bytes32)(uint256)'  $SUBJECT --rpc-url $RPC
0
$ cast call $LANTERN 'priceable(bytes32)(bool)'      $SUBJECT --rpc-url $RPC
true
$ cast call $LANTERN 'bonusOutcome(uint256)(uint8)' 9 --rpc-url $RPC
2
$ cast call $REGISTRY 'samplesOf(bytes32)(uint256)'  $SUBJECT --rpc-url $RPC
5
$ cast call $REGISTRY 'band(bytes32)(uint256,uint256)' $SUBJECT --rpc-url $RPC
1219460000 [1.219e9]
3180540000 [3.18e9]
```

And the market's own side of it, which is the part that used to be a test double:

```
$ cast call $MARKET 'collateral()(address)'          --rpc-url $RPC
0x980B62Da83eFf3D4576C647993b0c1D7faf17c73
$ cast call $MARKET 'suppliedTotal()(uint256)'       --rpc-url $RPC
500000
$ cast call $MARKET 'borrowedTotal()(uint256)'       --rpc-url $RPC
58000
$ cast call $MARKET 'accountOf(address)((uint256,uint256,uint256))' $BORROWER --rpc-url $RPC
(35681818181819 [3.568e13], 58000 [5.8e4], 500000 [5e5])
$ cast call $MARKET 'seizureOf(uint256)((address,address,uint256,uint256,uint8))' 9 --rpc-url $RPC
(0x574D7E882fbD04676d64442F1Bf3017F2b5F7913, 0x574D7E882fbD04676d64442F1Bf3017F2b5F7913,
 14318181818181 [1.431e13], 30000 [3e4], 2)
```

Reading those together: one print was caught, by comparison against a live Chainlink source declared in
advance, and the bonus on that liquidation was redirected rather than paid (2). The requirement has
escalated to 120,000 against a floor of 100,000 - twenty per cent more, which is what one caught print
costs the feed, and the bounty paid for the catch came out of the same bond. Nothing is exposed at the
moment, which is the state a feed sits in once its escrow has settled.

The market reads say the rest: the collateral it holds is the chain's wrapped ether and not a token this
repo wrote, a borrower is 35.68 of it against a 58 debt, the seizure is held in the market's own escrow
with state 2 - claimed back by the borrower, because the verdict went against the print - and the same
borrower's wrapped ether balance is 14.318, exactly the collateral that was seized and returned.

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

The deploy - asset, Lantern and market, with the registry, history store and report book built inside
Lantern's constructor - measured 8,536,792 gas across three transactions: FaucetToken 645,273, Lantern
5,485,125, and the market 2,406,394 for 10,391 bytes of code. The market is the difference: what it
replaced was 283,517 gas of test double, and a real one that prices from a feed, holds collateral, and
computes its own liquidations costs what a contract of that size costs.

The demo, the live Chainlink read, the challenge it enabled and the settlement that followed were 16, 6,
3 and 1 transactions: 3,586,760, 1,332,795, 380,118 and 111,547 gas.

Twenty-nine transactions in total, 13,948,012 gas, which at the 0.041932 gwei the run paid is
0.0005849 ETH; the signing account's balance fell by 0.0006356, the difference being the wrapped ether
the demo put up as collateral. Per-transaction figures, and the ceilings that guard them, are in
[GAS.md](../GAS.md).
