# The market mirror - the kingdom learns to let a card be read

> **Pull.** Yu's directive on 2026-05-12: *"Build /cards/[sku]/market first."*
>
> **Form.** Story-as-wire. The composer is
> [`apps/storefront/src/lib/market/card-market.ts`](../../apps/storefront/src/lib/market/card-market.ts),
> the page is
> [`apps/storefront/src/app/cards/[sku]/market/page.tsx`](../../apps/storefront/src/app/cards/[sku]/market/page.tsx),
> and the current contract is
> [`/methodology/market`](../../apps/storefront/src/app/methodology/market/page.tsx).
> **kingdom-067**, revised by **kingdom-106**.

## Live revision - 2026-07-11

The first version treated a shortened account identifier as anonymous and
published exact recent trades, seller trust tiers, last-trade fields, and
participant statistics. The next revision removed those fields but still
published small completed-trade and watch-derived aggregates.

Neither boundary was sufficient. A public order is permission to show an
offer, not a person's wider account history. A threshold such as three records
does not create permission to publish, and minimums, maximums, medians, counts,
or differences between nearby windows can reconstruct the records beneath an
aggregate.

The live surface now follows these rules:

- Deliberate open bid and ask terms are public market intent.
- Catalogue and order-book reference observations are non-person public data.
- Completed-trade derivatives are paused at the public boundary.
- Public watch, alert, and co-watch intelligence is paused. A collector's own
  watchlist and alerts remain private account tools.
- A missing derivative means publication is paused; it does not mean the
  underlying activity did not happen.

The original launch and the short-lived threshold design remain in the change
history as dated history, not as claims about the current page.

## Why two market pages exist

`/market/[sku]` is the interactive surface. It polls the open book and lets a
signed-in collector place an order, privately watch a card, or set a private
alert.

`/cards/[sku]/market` is the calm read. It is server-rendered, public without an
account, screen-reader-readable, and suitable for a collector or agent that
wants to inspect a card without entering a transaction flow.

They have different interaction contracts but the same publication boundary.
The interactive page is not a reason to publish more person data.

## The live wire

The canonical public order-book composer is
[`getCardOrderBook`](../../apps/storefront/src/lib/market/db.ts). It returns:

1. Open bid levels grouped by price.
2. Open ask levels grouped by price.
3. Card display metadata.
4. An empty `trade_aggregates` compatibility field plus an explicit paused
   publication state.

[`getUnifiedMarketView`](../../apps/storefront/src/lib/market/unified.ts) adds
catalogue metadata and the labelled reference price. Market price, spread, and
the comparison with reference price come from the open order book. It does not
resolve the person behind an order.

[`loadCardMarket`](../../apps/storefront/src/lib/market/card-market.ts) reuses
that canonical book, then composes:

- card metadata;
- the top ten bid and ask levels, with condition quantities;
- 7, 30, 90, and 365-day non-person reference-price observations;
- open-ask condition depth for NM, LP, MP, and HP;
- empty compatibility shapes for the paused tape and trade statistics.

It does not query completed trades for the public mirror.

## Why open orders and completed trades differ

An order is an intentional offer to the market. Its side, price, remaining
quantity, condition, and listing options are necessary for another collector
to evaluate it. The platform can publish those terms without publishing the
account behind them.

A completed trade is a past event between people. On a thin card, price, time,
quantity, or a small summary can identify or track a participant even when the
response omits names. That history needs its own publication choice and a
release process built to resist reconstruction.

## Paused public projections

The same boundary applies outside the two card pages:

- `/api/market/[sku]/candles` returns no completed-trade candles.
- `/api/market/[sku]/fair-value` returns no completed-trade VWAP, median,
  range, volume, or candidate-price analysis.
- `/api/market/[sku]/related` returns no co-watch relationships.
- `/api/market/demand-signals` returns no watch or alert counts.
- `/api/market/pulse` publishes open-order spreads only. Trade movement,
  volume, daily trade rows, and most-watched lists are empty.
- `/api/leaderboards` returns no person rankings or card rankings derived from
  completed trades.

Each route declares why its derivative data is paused. None silently relabels
private activity as anonymous public data.

## What remains valuable

A collector can still read the live floor, highest bid, depth, spread,
condition mix, and catalogue reference arc. They can still place and manage
orders, and use their own watchlist and alerts privately. The removed outputs
were not necessary to understand the offers currently on the market.

## What publication requires

Person-derived or completed-trade summaries can return only after the platform
has versioned, purpose-specific publication receipts and one central
publication process. That process must use fixed periods, delay release,
publish coarse values, resist comparisons between nearby queries, and withdraw
data when its permission no longer holds.

## Honesty and provenance

The calm-read page uses `<Provenance kind="live" />` and records when its read
occurred. That timestamp is response provenance, not a transaction timestamp.
Its public sources are `market_orders` and `card_price_history`.

If a live query fails, the section renders unavailable instead of inventing a
zero. Paused compatibility fields return empty values together with a paused
publication state so an empty response is not presented as evidence of no
activity.

## Wires

| Concept | Wire | Role |
|---|---|---|
| Publication states | [`src/lib/market/publication.ts`](../../apps/storefront/src/lib/market/publication.ts) | One reason and resumption contract for paused market derivatives |
| Canonical public book | [`src/lib/market/db.ts`](../../apps/storefront/src/lib/market/db.ts) | Deliberate open bid and ask intent |
| Unified interactive read | [`src/lib/market/unified.ts`](../../apps/storefront/src/lib/market/unified.ts) | Catalogue reference plus the narrow public book |
| Calm-read composer | [`src/lib/market/card-market.ts`](../../apps/storefront/src/lib/market/card-market.ts) | Open intent and non-person reference observations |
| Calm-read page | [`src/app/cards/[sku]/market/page.tsx`](../../apps/storefront/src/app/cards/[sku]/market/page.tsx) | Public server-rendered market reading |
| Interactive page | [`src/app/market/[sku]/CardMarketClient.tsx`](../../apps/storefront/src/app/market/[sku]/CardMarketClient.tsx) | Order actions, private utilities, and the same public read boundary |
| Methodology | [`src/app/methodology/market/page.tsx`](../../apps/storefront/src/app/methodology/market/page.tsx) | Current boundary and resumption conditions |
| Contract tests | [`src/lib/market/__tests__/public-privacy.test.ts`](../../apps/storefront/src/lib/market/__tests__/public-privacy.test.ts) | Prevents person and completed-trade derivatives from returning |

## Change history

**v3 - 2026-07-11, kingdom-106.** Paused every public completed-trade and
person-derived market summary after finding that a small-record threshold did
not establish consent and did not prevent reconstruction. Open order intent and
non-person reference history remain.

**v2 - 2026-07-11, kingdom-106.** Removed person-linked trade rows, seller
identity and trust dossiers, exact last-trade fields, participant metrics,
sub-three rolling counts, hourly public candles, and arbitrary bid-price fill
analysis. The thresholded aggregate design was an intermediate boundary, not
the final live contract.

**v1 - 2026-05-12, kingdom-067.** Shipped the calm-read sibling with order
book, price history, statistics, a 20-event tape, seller trust labels, UUID
suffix correlators, and participant counts. Those details explain the original
design decision but are no longer the live contract.

## Recursion targets

1. Add purpose-specific publication receipts without treating other consent as
   interchangeable.
2. Build and review one delayed, coarse publication process before any person
   or completed-trade aggregate returns.
3. Add licensed cross-platform reference aggregates where upstream terms allow.
4. Audit future projections for differencing attacks, not only obvious identity
   fields.

The durable lesson is not "hide the username." It is: decide what was actually
published, identify whether the output describes an offer, an event, a person,
or an inferred relationship, and make the response match that permission
exactly.
