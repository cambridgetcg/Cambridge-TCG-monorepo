# The open floor — the kingdom stops asking for papers at the door

> **Pull.** Yu, 2026-06-10 evening, mid-session, immediately after the wardrobe shipped: *"lets do a Order Book deep dive! actually no need verification. Just have acc is ok. ppl will leave reviews gah lah. Let people build their reputation and trust. and dont limit to uk. Global free trade. Let them figure out the logistics if they wanna do international. We provide the connection and wiring, also the messaging and reputation checker."*
>
> **Form.** Story-as-wire. Six readers mapped the territory; six builders changed it. Spec: [`2026-06-10-global-free-trade-design.md`](../superpowers/specs/2026-06-10-global-free-trade-design.md). **kingdom-096.**

---

## What this arc traces, in one sentence

The moment the kingdom replaced *identity shown at the door* with *reputation visible in the room* — four `isUserVerified` gates deleted, the 10-point KYC component redistributed into behaviour (completion 35, reviews 30), the seller's tier and review history rendered at every point of trade, the DM system's dormant `reference_type` columns finally wired to lots, offers, and trades, and the buyer's shipping address — promised by the seller-paid email since the day it was written, never once delivered — collected globally at payment and handed to the seller at last.

## The deep dive's true finding

The old policy wasn't a wall so much as a fog. Verification gated the order book but **not** offers, auctions, trade-ins, or sell-for-credit — an asymmetry no document named. The review form existed and nothing linked to it. The messaging schema carried trade-reference columns no caller used. The trades API leaked both parties' **emails** as the de-facto logistics channel. And the platform's strongest protections — trust-tier trade limits, escrow routing by value+trust, payout holds, the fraud sweep — never consulted identity at all. *The account+reputation model Yu asked for was already load-bearing; the identity gate was decoration on top of it.* This arc removed the decoration and wired up what was dormant.

## What replaces the gate, named precisely

| The platform provides | The wire |
|---|---|
| **The connection** | the order book, un-gated: account + `canTrade()` tier limits (New: £50/trade, £100/day → Elite £10k/£50k) |
| **The wiring** | global Stripe address collection (237 countries) → `market_trades.shipping_address` (0105) → seller's trade page + email; seller-gated `POST /trades/[id]/ship`; `hold_payout` made real in the payout sweep |
| **The messaging** | `MessageButton` at lot / offer / trade / profile; reference-typed conversations validated server-side against the sender's actual relationship (a forged "re: market trade" chip was a phishing vector — the validator closes it) |
| **The reputation checker** | seller tier + rating + review count at `/market/[sku]`, the tape, lot cards, lot detail, offers rows; review CTAs on terminal trades; refunded trades reviewable; trust formula rebalanced to pure behaviour |

What the traders provide: the logistics, including international — stated plainly on the trade page: *"You arrange shipping yourself — including internationally. Use messaging to agree on timing and customs."*

## The doctrine moves

**Substrate honesty.** The seller-paid email stops promising an address it doesn't have. Counterparty emails stop leaking through an API that never declared it shared them. The methodology carries a dated note naming the formula change and its tier-churn consequence.

**Transparency.** Every sentence documenting the old policy changed in this same arc — methodology trio, glossary, the worked example in `transparency.md`, the fraud-flag auto-action list, the verify page (now honestly *optional*: "Trading needs an account, not an identity").

**The fifth question.** The old gate's silent answer to *for whom is this true?* was "UK residents with identity documents." The new answer is anyone with an account and a reputation they're willing to build in public — which is also the answer's cost, named in §risks: sybil accounts are now email-cheap, and the reviewer-trust weighting, economic friction (every fake review needs a real paid trade + commission), the 04:45 review sweep, and `NEW_ACCOUNT_HIGH_VALUE` signals become the load-bearing defences.

## Sister connections

- **S68 [`the-wardrobe.md`](./the-wardrobe.md)** — same evening, same session, same shape: that arc let the reader choose the *look*; this one lets the trader bring their own *standing*. Both replace a platform decision with a visible, earned, user-side one.
- **The regulator pivot** (sister arc, queued behind this one as kingdom-101..104) — the house exits the book next. This arc's `best_ask_seller` and reputation surfaces were built house-aware (null when the house tops the book) so the floor is already shaped for a market of peers.
- **[`the-market-mirror.md`](./the-market-mirror.md)** (S35) — its first recursion target ("counterparty trust on open orders") partially lands here, on the interactive side.

## Recursion targets

Global identity verification + public verified badge (the optional flow is still UK-shaped); `/methodology/global-trade`; review-prompt emails on trade completion; international dispute-window tuning (48–168h assumes domestic transit); `block_trade` auto-action enforcement; multi-currency settlement (gbp remains the settlement currency; display FX already exists).

---

*The bouncer used to check passports. Now the room is well-lit, everyone's history is on the wall, the post office desk is by the door, and anyone may walk in and trade — the floor itself remembers how you've treated people on it.*

🐍❤️

*— Sophia (Fable 5), 2026-06-10.*

---

### Type-signature

- **kind**: connection-doc, story-as-wire
- **kingdom**: kingdom-096
- **doctrines**: substrate honesty, transparency, meaning, creation (all four) + the fifth question
- **audience**: developer, future-Sophia, trader anywhere on earth, the buyer checking a seller's wall before bidding
- **freshness**: live in the current schema as of 2026-06-10 (migration 0105)
- **self-citation**: appears in [`docs/connections/README.md`](./README.md) as S69
