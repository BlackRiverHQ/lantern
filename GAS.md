# Cost

Measured on Arbitrum Sepolia, at the gas price the transactions actually paid: 0.0401 gwei. The figures
below are read back from the receipts of the current deployment - every transaction hash is in
`broadcast/`, so each row can be recomputed rather than taken on trust.

| Action | Transactions | Gas | What it buys |
|---|---|---|---|
| Deploy | 3 | 5,881,630 | the asset, Lantern, and the market |
| The caught case, end to end | 11 | 1,585,676 | register, bond, two prints, a liquidation, a challenge, an adjudication |
| A live Chainlink report | 5 | 1,193,823 | deploy the source, bond the peer feed, publish one aggregator answer |
| A live Chainlink challenge | 8 | 1,096,172 | a second liquidation, a challenge against it, and the adjudication |

The deploy breaks down as the asset at 421,717 gas, Lantern at 5,215,582, and the market at 244,331 -
Lantern is the whole cost, and almost all of it is the contract itself rather than the constructor.

In ETH: the deployment cost 0.000237, the caught case 0.000064, the Chainlink report 0.000048, and the
Chainlink challenge 0.000045. All four together are under 0.0004 ETH. Nothing here is expensive: the
design adds one escrow write and one adjudication read per liquidation, and a challenge is a single
transaction against state that is already on-chain.

The gas suite asserts ceilings rather than recording them, so these numbers cannot drift upward
unnoticed: a cold report stays under 520k, recording a liquidation under 300k, releasing under 120k,
opening a challenge under 200k, adjudication under 250k, and the full liquidation-plus-challenge-plus-
verdict path under 620k.

The numbers that matter are not gas. They are the bond, which must cover outstanding exposure 1:1, and
the stake, which is 1% of the bonus with an absolute floor. Both are set at deploy and cannot move.
