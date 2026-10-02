# site/

Lantern's landing page. A static page whose numbers all come from the deployed contracts on Arbitrum
Sepolia, read in the visitor's browser over the public RPC. None of them are typed in by hand.

```
python3 -m http.server 8803 --directory site     # then open http://127.0.0.1:8803/
```

No build step and no dependencies. There is no wallet and nothing is signed: the page only calls
`eth_chainId`, `eth_blockNumber`, `eth_call` and `eth_getLogs`.

## What is live

| On the page | Source |
|---|---|
| held now, hold window, bounty, min bond | `heldTotal()`, `holdWindow()`, `bountyBps()`, `minBond()` |
| subject feed: caught prints, bond, requirement, exposure, priceable | `feedErrors`, `bondOf`, `requiredBond`, `exposureOf`, `isPriceable` on the subject feed id |
| declared second source | `peerOf(subject)` |
| liquidation cases and their timelines | `eth_getLogs` on Lantern from block 314,930,000, decoded in the page |
| verdict per case | derived from the case's own events: `ChallengeUpheld`, `ChallengeRefused`, `ChallengeVoided`, `BonusReleased` |
| block number | `eth_blockNumber`, refreshed every 30 s |

If the RPC answers with a different chain id, or fails on both endpoints, the page says so and leaves
the fields empty. It does not fall back to stored numbers.

## Checked

Headless Chrome at 1364×766 and 390×844:

- every read matches `cast call` against the same contract
- three liquidations (#1 upheld, #9 refused, #10 upheld) with their reports, challenges and verdicts
- 0 console errors, 0 failed requests; the only external host is the RPC
- case prev/next wrap around; copy buttons write to the clipboard; the header collapses on scroll
- no horizontal overflow on mobile
