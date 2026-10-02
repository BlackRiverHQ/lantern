# Cost

Measured on Arbitrum Sepolia, at the gas price the transactions actually paid: 0.041932 gwei. The
figures below are read back from the receipts of the current deployment - every transaction hash is in
`broadcast/`, so each row can be recomputed rather than taken on trust.

| Action | Transactions | Gas | What it buys |
|---|---|---|---|
| Deploy | 3 | 8,536,792 | the settlement asset, Lantern, and a lending market |
| The caught case, end to end | 16 | 3,586,760 | a claim, a feed, its bond, four prints, a position, the lying print, a liquidation |
| A live Chainlink report | 6 | 1,332,795 | deploy the source, bond the peer feed, publish one aggregator answer |
| A live Chainlink challenge | 3 | 380,118 | the challenge, and the adjudication that upheld it |
| Settling it | 1 | 111,547 | the market handing the seized collateral back |

Twenty-nine transactions, 13,948,012 gas, 0.0005849 ETH at the price the run paid. The signing account's
balance fell by 0.0006356: the difference is the wrapped ether the demo put up as collateral, which is
the borrower's again once the verdict returns it.

The deploy breaks down as the settlement asset at 645,273 gas, Lantern at 5,485,125, and the market at
2,406,394 for 10,391 bytes of code. The market is the number that moved: what it replaced was 283,517 gas
of test double that let a caller declare a liquidation, and a real market prices from a feed, holds
collateral in custody, computes what a close puts at risk, and escrows the seizure until a verdict
decides where it goes. That is what those bytes buy, and it is worth them.

The caught case is four transactions heavier than it would otherwise be because a round cannot be priced
with fewer than four prints behind it: the demo warms four rounds at one value and then prints 18.2%
below it on the fifth. Those four prints are the reason the sequence is coherent rather than the reason
it is expensive.

In ETH: the deploy cost 0.000358, the caught case 0.000150, the Chainlink report 0.000056, the challenge
0.000016, and the settlement 0.000005. All five together are under 0.0006 ETH, and the largest single
item is Lantern's own bytecode rather than anything the mechanism does at runtime.

The gas suite asserts ceilings rather than recording them, so these numbers cannot drift upward
unnoticed: a cold report stays under 520k, recording a liquidation under 300k, releasing under 120k,
opening a challenge under 200k, adjudication under 250k, and the full liquidation-plus-challenge-plus-
verdict path under 620k.

The numbers that matter are not gas. They are the bond, which must cover outstanding exposure 1:1, and
the stake, which is 1% of the bonus with an absolute floor. Both are set at deploy and cannot move.
