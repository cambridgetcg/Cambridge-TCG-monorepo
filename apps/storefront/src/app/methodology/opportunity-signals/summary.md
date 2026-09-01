# Opportunity signals — TLDR

Cambridge TCG's public opportunity-signal/v1 contract can carry a short-lived **potential deal** result from a separate private engine, with only coarse conservative spread and margin bands. It never calls a valuation guaranteed arbitrage, never treats unknown costs as zero, and never infers liquidity from price alone. The schema has no seller-identity or source-row field and requires a randomly minted, non-identifying candidate reference, but its validator enforces wire shape rather than semantic origin. A private fixture provider mirrors the seam; no production scorer, API, app, alert, subscription, or execution path is active today.

Full page: [/methodology/opportunity-signals](/methodology/opportunity-signals).
