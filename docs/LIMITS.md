# Limits

Written down before they are found.

1. **Scope.** Lantern detects prices that cannot be true, not prices that are merely wrong. A
   misconfiguration producing a plausible value, an internally consistent consumer, and agreeing
   sources passes every rule. Widening this needs cross-source disagreement and configuration
   self-consistency as evidence rules; both are future work and neither is claimed here.

2. **Recovery size.** The ceiling is the held bonus plus the charged bond. Sizing the bond to
   notional exposure raises the ceiling but makes being a feed signer expensive — a real adoption
   cost. Lantern restores a borrower up to the held bonus, not up to the loss.

3. **Slow drift.** A signer who walks its own history gently can move the band. Per-report and
   cumulative drift caps bound the damage per window; they do not eliminate the class.

4. **Window length.** A long hold window thins liquidator participation. The window must stay short
   relative to the feed's heartbeat. A parameter to measure, not to defend.

5. **Dependency.** In production Lantern consumes a feed from a market that already trusts it. It
   reduces what that trust must cover; it does not remove the feed.

