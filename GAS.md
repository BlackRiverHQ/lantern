# Cost

Measured on Arbitrum Sepolia, gas price 0.079 gwei at the time of writing.

| Action | Gas | What it buys |
|---|---|---|
| Deploy all three contracts | 6,730,761 | asset, Lantern, the market |
| The caught case, end to end | 2,110,024 | register, bond, two prints, a liquidation, a challenge, an adjudication |

The deployment cost 0.00053 ETH and the demo 0.00017 ETH. Nothing here is expensive: the design adds
one escrow write and one adjudication read per liquidation, and a challenge is a single transaction
against state that is already on-chain.

The numbers that matter are not gas. They are the bond, which must cover outstanding exposure 1:1, and
the stake, which is 1% of the bonus with an absolute floor. Both are set at deploy and cannot move.
