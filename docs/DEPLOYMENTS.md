# Deployments

## Arbitrum Sepolia (chain 421614)

| Contract | Address |
|---|---|
| Asset (mock unit of account) | `0x25939dB67A1bA238001444fad8D879f787A374e4` |
| Lantern | `0xF3e59109d72D052888B1Df97D82d8E920067b1C9` |
| Market (reports liquidations) | `0x504945EC11AD3CA5Bf4920496b3C613eb83a7A17` |
| Registry (built by Lantern) | `0x6d28AaBe14f73A36d5a6f058926AF7c40897a225` |

Deployment: `0xf03c3d81b380dd8894b6e51446f5b0e6cd2baa1fc621c7ef2ee4685b9c4db69a`
Demo run (caught case): `0x1dc013896bfe45786f7ebc9dccb69367f3eef2d5d6dfa61df38948e0f5e72017`

### What the chain says after the demo

Read with:

```
cast call 0xF3e59109d72D052888B1Df97D82d8E920067b1C9 'feedErrors(bytes32)(uint256)' \
  0xf7ed0c5000d57be8bb1723e1298ee49e6a076692f4ef68d27dd00db178f57210 \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

| Read | Value | Meaning |
|---|---|---|
| `feedErrors` | 1 | one print was proven to contradict the record |
| `bonusOutcome(1)` | 2 | the held bonus was redirected, not paid to the liquidator |
| `bondOf` | 998e18 | 2e18 of the signer's bond was charged as the prover's bounty |
| `heldTotal` | 0 | nothing is still held |
| `exposureOf` | 0 | the feed carries no outstanding exposure |
| `isPriceable` | true | the feed can keep pricing; the bond still covers it |
| `recorded` | 1 | one liquidation was ever recorded |
| `challengesOpened` | 1 | one challenge was opened |

Reproduce it yourself:

```
export PRIVATE_KEY=...                       # testnet key, gas only
forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast -vv
export TOKEN=0x25939dB67A1bA238001444fad8D879f787A374e4
export LANTERN=0xF3e59109d72D052888B1Df97D82d8E920067b1C9
export MARKET=0x504945EC11AD3CA5Bf4920496b3C613eb83a7A17
forge script script/DemoRun.s.sol --rpc-url arbitrum_sepolia --broadcast -vv
```

No private key, no funded account and no network access are needed for the test suite; the
deployment above is a convenience, not a dependency.
