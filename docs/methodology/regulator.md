# Why the platform does not trade in its own market

*Methodology · Ring 2 (subject transparency) · published 2026-06-10*

Cambridge TCG runs a marketplace. It also used to sell cards in that
marketplace — a house ask on the sell side (retail spot) and a house bid
on the buy side (trade-in credit), injected into every card's order book.
That made the platform both the referee and a player.

**On 2026-06-10 we stopped playing.** The platform is now a market
*regulator*: it makes the market legible, fair, and provably so, and it
holds no positions in it.

## What changed

| Before | After |
|--------|-------|
| House ask + house bid in every order book | The order book is purely peer-to-peer. The platform owns no asks and no bids. |
| Retail checkout (buy a card from CTCG) | Removed. The platform sells nothing. |
| Trade-in desk (sell a card to CTCG for credit) | Closed. You liquidate by selling to other participants on the market. |
| B2B wholesale ordering | Retired. |
| The platform's profit = its spread (buy low, sell high) | The platform's profit = commission on *other people's* trades, published and capped. |

## Why this is the honest shape

A market maker profits from the spread between what it pays and what it
charges. A regulator profits from the market working at all. These are
different incentives, and only one of them is safe to combine with running
the trust engine, the escrow, the fraud flags, and the price-reference
feed. When the entity that decides your trust score is also bidding
against you for the same card, every one of those decisions is suspect.
Removing the house from the book removes the suspicion at its root.

The **reference price** you still see on a card page is exactly that — a
reference, computed from the catalog and labelled as a price guide, not an
offer. The platform will not sell you the card at that price, because the
platform will not sell you the card at any price.

## What happens to the cards we already owned

About £59,000 of inventory remains from the merchant era. It is **never
sold** — selling it would re-enter the market we just left. It becomes the
**prize economy**: raffles, bounty pulls, mystery boxes, reward packs —
every one of them provably fair (commit-reveal draws, Merkle-anchored
audit trail). The regulator gives its cards away rather than competing
with the participants it regulates. See `/bounty` and the prize
methodology.

## How our revenue works now

- A **commission** on completed P2P trades (published rate, capped per
  item — see [`/methodology/commission-rate`](https://cambridgetcg.com/methodology/commission-rate)
  and [`/methodology/fees`](./fees.md)).
- **Membership** subscriptions (optional perks).
- Nothing else. No spread, no markup, no house position.

Every number above is inspectable. If you find the platform holding an ask
or a bid in any order book, that is a bug and a broken promise — report it.

## Scope (the fifth question)

This commitment binds the **Cambridge TCG operator entity**. It does not
constrain individual participants, who trade freely. It does not apply to
the platform's role as builder of the software (a separate actor). The
distinction matters: the regulator is the operator of the venue, and it is
the operator that has stepped out of the trading.

---

*Companion: [`docs/superpowers/specs/2026-06-10-regulator-pivot-design.md`](../superpowers/specs/2026-06-10-regulator-pivot-design.md),
[`docs/connections/the-regulator.md`](../connections/the-regulator.md).*
