# Cost

Measured on Arbitrum Sepolia, at the gas price the transactions actually paid: 0.0420 gwei. The figures
below are read back from the receipts of the current deployment - every transaction hash is in
`broadcast/`, so each row can be recomputed rather than taken on trust.

| Action | Transactions | Gas | What it buys |
|---|---|---|---|
| Deploy | 3 | 5,936,603 | the asset, Lantern, and the market |
| The caught case, end to end | 15 | 3,315,025 | register, bond, five prints, a liquidation, a challenge, an adjudication |
| A live Chainlink report | 7 | 1,370,654 | deploy the source, bond the peer feed, publish one aggregator answer |
| A live Chainlink challenge | 8 | 1,142,069 | a second liquidation, a challenge against it, and the adjudication |

Thirty-three transactions, 11,764,351 gas, 0.0004947 ETH as measured by the balance before and after.

The deploy breaks down as the asset at 406,564 gas, Lantern at 5,246,522, and the market at 283,517 -
Lantern is the whole cost, and almost all of it is the contract itself rather than the constructor.

The caught case is four transactions heavier than it was before the pricing floor existed: the demo now
warms four rounds at one value and prints the conflict on the fifth, because a round cannot be priced
with fewer than four prints behind it. Those four prints are the difference, and they are the reason the
sequence is coherent rather than the reason it is expensive.

In ETH: the deployment cost 0.000249, the caught case 0.000139, the Chainlink report 0.000058, and the
Chainlink challenge 0.000048. All four together are under 0.0005 ETH. Nothing here is expensive: the
design adds one escrow write and one adjudication read per liquidation, and a challenge is a single
transaction against state that is already on-chain.

The gas suite asserts ceilings rather than recording them, so these numbers cannot drift upward
unnoticed: a cold report stays under 520k, recording a liquidation under 300k, releasing under 120k,
opening a challenge under 200k, adjudication under 250k, and the full liquidation-plus-challenge-plus-
verdict path under 620k.

The numbers that matter are not gas. They are the bond, which must cover outstanding exposure 1:1, and
the stake, which is 1% of the bonus with an absolute floor. Both are set at deploy and cannot move.
