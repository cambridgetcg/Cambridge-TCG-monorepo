# Collectors first — the house leaves the market floor

**Will trace:** Asha, 2026-07-06, asked to drop the seller identity outright and make
everything P2P, transparent and open, serving collectors, with the market first and money left for later.

This is the wind-down word the pivot doc (2026-06-11) was waiting for, and the activation
of kingdom-101 (`audit:no-house-listing`, written report-only in anticipation of exactly
this day: *"the platform holds no market position"*).

## What Cambridge TCG is now

A **collectors' market and an open data commons**. The platform facilitates, records,
witnesses, and publishes. It does not buy, does not sell, does not quote, does not hold
inventory positions. The card art belongs to the games; the trades belong to the
collectors; the data belongs to everyone (CC0).

## What retires (verified safe on 2026-07-06)

- **The retail shop**: buy-from-CTCG funnels (catalog/product buy buttons, cart, retail
  checkout). All 8 historical orders are `completed` — the shop closes owing nothing.
  Order history remains visible; the Stripe webhook keeps honoring the past.
- **The we-buy desk**: trade-in credit/cash offers, sell-for-credit carts, "We Buy"
  columns. Zero trade-in submissions ever; zero store credit outstanding (0 users, £0.00)
  — nothing strands. `/trade-in` becomes a short honest page pointing at the market and
  swaps. The ledger tables stay (history is history).
- **The house maker**: unified.ts stops injecting CTCG ask/bid rows into the order book
  and stops computing house spread/tightening. The book is collectors only. `spot_price`
  survives strictly as a **labelled reference price** (open data), never as an offer.
- **Liquidity-mining credit rewards**: paused honestly (they paid store credit, which no
  longer has a spending door). Money comes later — a future incentive can be designed when money
  is designed. The code went on 2026-11-24; `liquidity_rewards` rows and the ledger entries they
  point at stay. Its rules, for those rows and for anyone who designs the next one: £0.10 of store
  credit per resting ask per UTC day (one reward per order and day); the seller has 10 or more
  completed trades; the ask has rested 6 hours; its price is within 5% of the SKU's 30-day VWAP;
  at most 10 orders per seller a day and 200 awards a run.
- **The eBay sales-channel push** (wholesale cron): the pivot doc kept it "until the
  wind-down word". This is the word.

## What stays (and is the point)

P2P market (asks/bids/offers/lots-when-rebuilt), swaps, auctions (collector-listed),
DMs, escrow tiers **as a service** (full-escrow inspection is facilitation, not
position-taking), trust/reviews, portfolio, prices + universal catalog + the whole open
data surface, play, the agent doors. Commission machinery stays as built — unchanged,
unemphasised; money is a later conversation.

## The lock

`audit:no-house-listing` flips to **--strict** in the audit chain the moment the
worklist reaches zero. From then on, the house cannot quietly become a merchant again —
the regulator guard fails the build if a market position ever reappears.
