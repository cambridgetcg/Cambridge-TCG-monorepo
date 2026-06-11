# Global free trade — design spec

**Date:** 2026-06-10
**Author:** Sophia (Fable 5), at Yu's WILL.
**Status:** Approved-by-directive — implementation proceeds in the same session
**Will-trace:** Yu, 2026-06-10:
> *"actually no need verification. Just have acc is ok. ppl will leave reviews gah lah. Let people build their reputation and trust. and dont limit to uk. Global free trade. Let them figure out the logistics if they wanna do international. We provide the connection and wiring, also the messaging and reputation checker."*

---

## 1. Context (what the 6-reader deep dive found, 2026-06-10)

The old policy — *UK identity verification required to trade P2P* — is one DB flag (`users.is_verified`), four server gates (place order `api/market/orders:26`, create lot `api/market/lots:29`, buy lot `lots/[id]/buy:20`, raise dispute `api/trust/disputes:53`), two client mirrors (`market/[sku]`, `market/lots/[id]`), a 10-point trust-score component ("UK verified = 10"), and a dozen doc sentences. Offers, auctions, trade-ins, and sell-for-credit never had the gate — the asymmetry was undocumented.

What the new policy needs already mostly exists, unwired:

- **Reputation**: reviews are per-trade, account-only, integrity-gated, moderated by a daily sweep — but the review form is **orphaned** (zero inbound links) and counterparty reputation is invisible at the point of trade.
- **Messaging**: full DM system with `reference_type/reference_id` columns *designed* for trade context (migration 0072) — never wired to any trade surface.
- **Logistics**: P2P trades collect **no shipping address**. The seller-paid email promises "which address to ship to" and never delivers it. The de-facto channel is the trades API **leaking both parties' emails**.
- **Brakes that remain**: trust-tier trade limits (New: £50/trade, £100/day → Elite £10k/£50k), escrow routing by value+trust, payout holds, fraud signals + daily sweep + auto-suspend, chargeback handling — all verification-independent. Stripe payout onboarding keeps its own KYC at money-out (legal, unaffected).

## 2. The design

**One sentence:** trading needs an account, not an identity; identity is replaced at the point of trade by *visible reputation*; the platform's offer is connection + wiring + messaging + the reputation checker; geography is the traders' business.

### 2.1 Gates off (account is enough)
Remove all four `isUserVerified` blocks + dead imports; remove both client VERIFICATION_REQUIRED branches. `canTrade()` trust limits, suspension checks, and party-to-trade auth all stay — they ARE the account+reputation model. Disputes flip to account-only in the same release (buyer's primary protection must not lag the gate removal).

### 2.2 Trust score re-weight (reputation is earned, not licensed)
The 10-pt verification component is removed and redistributed per the policy's own logic — reputation from behaviour: **completion 30→35, reviews 25→30**, volume 15, age 10, external rep 10 (= 100). Engine header comment updated; persisted breakdowns recompute via the nightly trust sweep (cron/maintenance) — expect small tier churn, documented in the methodology. `UNVERIFIED_HIGH_VALUE` fraud signal (producerless) deleted; `NEW_ACCOUNT_HIGH_VALUE` covers the real risk.

### 2.3 Global wiring (the platform hands over what it already holds)
P2P pay session gains `shipping_address_collection` with a global country list (all Stripe-supported countries — no UK shortlist); the webhook persists `shipping_details` to new `market_trades.shipping_address` (migration 0105); the seller sees it on the trade page and in the seller-paid email — the email's existing promise, finally kept. Counterparty **emails leave the trades API**, replaced by usernames + user ids. New participant-gated `POST /api/market/trades/[id]/ship` ({carrier, trackingNumber}) so sellers can confirm dispatch without admin help. No shipping-cost computation, no customs handling — listed prices are seller-inclusive; international logistics is the traders' own arrangement, stated plainly on the trade surface.

### 2.4 Messaging at every trade context (pillar three)
`MessageButton` primitive in `@/lib/ui` (open-or-create conversation → `/account/messages?c=<id>`), with `referenceType/referenceId` validated server-side against an allowlist (`market_trade | market_lot | offer | auction | market_order`) + live-relationship check before a reference chip is stored — an unvalidated reference is a phishing vector. Wired at: lot detail (seller), offers rows (counterparty), trades list/detail (counterparty — the logistics path), `/u/[username]` (refactor existing inline button). DM notifications deep-link `?c=<conversation>`.

### 2.5 The reputation checker (visible before you trade)
Seller trust tier + avg rating + review count join into lots list/detail and the unified market view (`best_ask_seller`); rendered as tier chip + "N reviews · 4.8★" linking `/u/[username]/trust` at: `/market/[sku]` routing panel + tape rows, lot cards + lot detail, offers rows. The orphaned review form gets its life back: "Leave a review" CTA on terminal trades at `/account/trades`, and the reviews API pre-check widens to match the lib gate (`completed|refunded`).

### 2.6 Transparency (same arc, by doctrine)
Every old-policy sentence rewrites in this change: methodology trust-score trio (page + summary.md + docs/methodology copy, including the formula and worked example), `docs/principles/transparency.md` worked example, glossary factor list, fraud-flag methodology ("require-verification" drops), `/account/verify` page (verification becomes **optional** — UK identity badge + nothing more for now; copy stops claiming it unlocks trading), `api/trust/verify` notification copy. The verify flow itself is untouched mechanically and queued for a global-identity redesign.

## 3. Out of scope (queued, not dropped)
Global (non-UK) identity verification + public verified badge on profiles; dedicated `/methodology/global-trade` page; review-prompt emails; `users.country='GB'` stamp on verification approval; international dispute-window tuning (48–168h calibrated for domestic transit); enforcement site for `block_trade` auto-action (pre-existing gap; `hold_payout` enforcement ships here via the payout-sweep join).

## 4. Acceptance criteria
1. A fresh account (no verification row) can place a bid/ask, create and buy a lot, raise a dispute on its own trade — within New-tier limits.
2. No surface (UI, API copy, methodology, glossary, docs) still claims verification or UK residency is required to trade; `pnpm verify` green.
3. Buyer's address: collected at pay, stored on the trade, visible to the seller (page + email). Counterparty emails no longer in any trades API response.
4. MessageButton opens a referenced conversation from lot/offer/trade/profile contexts; forged references rejected server-side.
5. Seller reputation visible at all five point-of-trade surfaces; review CTA on terminal trades; refunded trades reviewable.
6. Trust formula sums to 100 with verification absent; methodology matches the engine to the word.

## 5. Implementation order
Six parallel agents with disjoint file ownership (A gates+engine, B stripe+trades wiring, C messaging, D market UI, E trades UI+review loop, F docs), then verify loop, focused commits, connection-doc + mission card (kingdom-096) + pillow book with the closing commit.

---

*— Sophia (Fable 5), 2026-06-10. The kingdom stops asking for papers at the door; the room itself remembers how you've treated people in it.*
