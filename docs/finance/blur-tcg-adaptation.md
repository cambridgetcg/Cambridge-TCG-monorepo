# Blur → TCG: Finance Mechanisms Adaptation Thesis

**Author**: Gamma (愛 / Cambridge-TCG AI)  
**Date**: 2026-04-28  
**Status**: Draft for Yu's review  
**Context**: Cambridge TCG is a UK-based TCG marketplace running storefront (B2C) and wholesale (B2B + channel sync). This document asks which of Blur's NFT finance innovations can be adapted for physical trading card markets — and which 3–4 have the highest ROI.

---

## Executive Summary

Blur introduced three innovations that transformed NFT market liquidity:
1. **Bid pools** — aggregate capital deployed at a floor price, creating a real buyer of last resort
2. **Floor-price lending (Blend)** — use your NFT as collateral for instant liquidity without selling
3. **Points/incentive alignment** — reward the behaviors that create market depth (bidding > buying)

Each translates to TCG — but the translation is constrained by the fundamental difference between digital and physical assets. The roadmap below has three phases. Phase 1 (standing buy offers) is buildable now. Phase 2 (vault credit) requires legal advice first. Phase 3 (liquidity incentives) extends what already exists.

**Top 3 mechanisms by ROI for Cambridge TCG:**
1. Standing Buy Offers (bid pools adapted)
2. Listing Quality Multipliers (points/incentives adapted)
3. Seasonal Bounty Structure (points/retention adapted)

Card-backed credit (Blend adapted) is fourth — high potential, but regulatory uncertainty in UK makes it Phase 2 at earliest.

---

## Part 1: The Translation Table

For each Blur mechanism: does it translate directly, need modification, or not apply?

| Blur Mechanism | Description | TCG Equivalent | Verdict | Rationale |
|----------------|-------------|----------------|---------|-----------|
| **Collection bid pools** | ETH deposited at floor price; any seller can accept instantly | Standing Buy Offers — capital escrowed at a condition/price; any matching seller can accept | **Translates with modification** | NFT collection fungibility → TCG condition-band fungibility. "Any NM Charizard Base" works like "any Bored Ape." The pool concept survives; the matching logic is more complex. |
| **Blend perpetual loans** | NFT as collateral for ETH loan; no fixed term; lender can call in 30h | Card Credit — vaulted cards as collateral for Cambridge TCG credit line | **Translates with modification** | No permissionless lender marketplace (Cambridge is the lender). Fixed-term credit lines more appropriate for UK consumer expectations. Physical custody replaces cryptographic custody — requires operational trust layer. |
| **Royalty optionality** | Sellers can opt out of creator royalties (0% or voluntary) | Seller fee reduction for competitive listings (within X% of market price) | **Translates with modification** | No on-chain royalty enforcement in TCG. The incentive (lower fees for better pricing) is equivalent but structurally different. TCG publishers (Nintendo/Pokemon Co, WotC, Konami) have no royalty mechanism to opt into or out of. |
| **Points/airdrop incentives** | Blur Points for bidding → converts to BLUR token airdrop | Bounty tokens for market-deepening behaviors (listing, standing offers, vaulting) | **Translates directly** | Cambridge TCG already has bounty tokens. Extension of emission rules to reward liquidity-providing behaviors, not just purchases, is a direct application. |
| **Season structure** | 3-month point accumulation periods; season-end reward distribution | Seasonal bounty accumulation; season-end mystery boxes / prize events | **Translates directly** | No NFT-specific components. Pure loyalty/retention mechanics. Lowest implementation complexity of all mechanisms. |
| **Care package / delayed gratification** | Points earned but not redeemable for weeks; builds anticipation | Bounty tokens locked in "pending" state during season; released at season end | **Translates directly** | Already implicit in how bounty tiers work. Making the release moment explicit and event-ized is the adaptation. |
| **Sweep functionality** | Buy multiple floor NFTs in one transaction | Set sweep — buy all cards needed to complete a set at current market prices in one checkout | **TCG-native enhancement** | No analog needed — this is a TCG-specific UX improvement. Blur had to invent sweep for NFTs; TCG has the concept naturally (set completion). More powerful because TCG sets have fixed composition. |
| **Portfolio / floor tracking** | Real-time portfolio value vs. floor price | Collection tracker — holdings value vs. current market prices (CardMarket/TCGPlayer) | **Translates directly** | The data problem is harder (condition-adjusted pricing vs. a single floor), but the concept is identical. |
| **Bidding points > buying points** | LPs rewarded more than buyers (bid-side incentive) | Standing offer providers rewarded more than purchasers | **Translates directly** | Same logic applies. Buyers of last resort (standing offer providers) are scarcer and more valuable than marginal buyers. Reward accordingly. |
| **LTV-based floor lending** | Borrow 85% of floor NFT value | Borrow 55-65% of assessed vaulted card value | **Translates with modification** | TCG cards have condition risk (physical deterioration), price volatility, and liquidity risk that NFTs don't (at that scale). Lower LTV is appropriate. |
| **Permissionless lender marketplace** | Any address can fund a Blend loan | **Does not apply** | **Does not apply** | UK FCA regulations around consumer credit make an open peer-to-peer lending marketplace impractical without licensing. Cambridge as sole lender (via credit line) is the viable analog. |
| **Gas fee optimization** | Batch transactions to reduce gas costs | **Does not apply** | **Does not apply** | No blockchain settlement costs. Physical shipping costs are the analog, but those can't be batched the same way. |
| **Token governance / DAO** | BLUR token holders vote on protocol parameters | **Does not apply** | **Does not apply** | Cambridge TCG is a private company. No DAO structure or governance token appropriate. |

---

## Part 2: The TCG Structural Difference

The central translation challenge is **fungibility**. Blur's mechanisms work because, within a collection, NFTs are near-fungible. A Bored Ape #1234 and #1235 are economically similar (same floor price, similar demand). A bid pool can accept "any Ape."

TCG cards are stratified across multiple dimensions:
```
Card Identity = game × set × card × edition × language × condition × grade × authentication-status
```

A "1st Edition Shadowless Charizard" has thousands of physical copies, but:
- PSA 10 ≈ £15,000
- PSA 9 ≈ £3,500
- PSA 8 ≈ £1,200
- Raw NM ≈ £500
- Raw LP ≈ £200
- Raw HP ≈ £60

These are economically different assets. A bid pool at "£500 for any 1st Ed Shadowless Charizard" would only attract LP/PL sellers — anyone with better condition would see it as underpriced.

**The adaptation**: Replace collection-level pools with **condition-band pools**:
- "£500 for any LP-or-worse 1st Ed Shadowless Charizard" ← LP/PL/HP sellers
- "£200 for any Raw NM or better" ← NM+ sellers (different pool, different price)
- "£3,500 for any PSA 9 or better" ← graded card sellers

This creates more pools, more complexity — but preserves the core property: **pooled capital at a known floor for a specific grade band**.

---

## Part 3: Three Mechanisms with Highest ROI

### Mechanism 1: Standing Buy Offers (Bid Pools Adapted) ⭐⭐⭐

**What it is**: A buyer posts "I will pay £X for [card] in [condition or better], quantity [N]." Capital is escrowed. Any seller with a matching card sees a "Sell Now" button and can accept instantly.

**Why it has the highest ROI**:
- Solves the hardest TCG marketplace problem: sellers don't list because they're uncertain what they'll get, which means buyers don't find cards, which means sellers don't list. Standing offers break this loop.
- Doesn't require a token, a vault, or legal opinion. It requires escrow + matching logic.
- Directly generates transaction volume for Cambridge TCG.
- Reuses existing trade-in and payout infrastructure (physical custody flow already exists).

**TCG-specific advantages over NFTs**:
- Physical delivery requirement makes gaming (wash trading / bid-cancel cycling) expensive
- Condition-band matching creates price discovery across the grade ladder, which NFT markets don't have

**Implementation complexity**: Medium. DB changes, escrow accounting, matching logic, two new UI surfaces (offer creation for buyers, "Sell Now" for sellers).

**Revenue model**: Cambridge charges a fee on matched transactions (same as normal sales). The standing offer mechanism captures sales that would have happened on CardMarket instead.

**What it requires first**: A documented, published condition grading standard. Buyers and sellers need a shared vocabulary for condition disputes to be resolvable.

---

### Mechanism 2: Listing Quality Multipliers (Points Adapted) ⭐⭐⭐

**What it is**: Sellers who list cards at competitive prices (within X% of market price), maintain listings accurately (no "sold elsewhere" cancellations), and have high completion rates earn more bounty tokens per transaction. Sellers who game the system (list at 3x market, never sell) earn nothing.

**Why it has the second-highest ROI**:
- No new infrastructure needed — extends the existing bounty token system
- Directly rewards the behavior Cambridge TCG needs most: accurate, reliable sellers
- Creates differentiation from CardMarket (where any price is accepted equally)
- Cheapest to implement: add a `listing_quality_score` multiplier to bounty emission logic

**How to calculate listing quality score**:
```
listing_quality_score = 
  price_competitiveness (0.5 weight) × 
  completion_rate (0.3 weight) × 
  listing_accuracy (0.2 weight)

price_competitiveness = 1 - abs(listed_price - market_price) / market_price
  (capped: if within 5%, score = 1.0; if 50% above, score = 0.0)

completion_rate = completed_sales / total_accepted_offers (last 90 days)

listing_accuracy = 1 - cancellations_due_to_misrepresentation / total_sales
```

**Multiplier applied**:
- Score 0.8–1.0: 2x bounty tokens per sale
- Score 0.6–0.8: 1.5x
- Score 0.4–0.6: 1x (baseline)
- Score below 0.4: 0.5x (quality penalty)

**What this avoids**: Blur's wash-trading failure. Because the multiplier rewards listing *quality* (price accuracy + completion), not volume, there's no incentive to churn fake volume. A perfectly-priced card sold once earns more than a badly-priced card listed 10 times.

---

### Mechanism 3: Seasonal Bounty Structure (Seasons Adapted) ⭐⭐

**What it is**: Bounty point accumulation runs in 3-month "seasons." At season end: leaderboard published, top contributors earn prize rewards, the next season launches with fresh incentives.

**Why it's third**:
- Lowest implementation cost of all mechanisms (bounded schema change, mostly UX)
- Creates marketing cadence: "Season 4 starts Monday" is a genuine news event
- Extends retention: users accumulate points they can't transfer, creating switching costs
- Sets up for future "season exclusive" rewards (cards, mystery boxes, experiences)

**Season structure**:
- Season length: 3 months
- Points earned: all normal bounty activity
- Season bonus events: "double points weekend", "featured card bonus week"
- Season end: top-N leaderboard earns exclusive rewards; all points convert at revealed rate
- Next season: fresh leaderboard, new featured rewards announced

**Care package mechanic (high impact, low cost)**:
At season end, reward tiers aren't instant — they're "sealed packages" displayed on dashboard, openable after a 7-day countdown. This:
- Creates anticipation (people come back to open their package)
- Creates shareable moments ("I opened a Golden Package — here's what was inside")
- Is extremely cheap to implement (a delayed reveal, not a new system)

**What it avoids**: The "points prison" failure mode from Blur. Cambridge TCG's points don't need to be worth £0 to be meaningful — the rewards (physical cards, discounts, experiences) have value independent of a speculative token price.

---

### Why Card-Backed Credit is Fourth (Not Yet)

The Blend analog has real potential for Cambridge TCG's collector base — but three blockers need resolution first:

**Blocker 1 — Regulatory**: UK FCA Consumer Credit Act applies when extending credit to consumers. Options: (a) B2B only (skip FCA entirely, offer credit lines to registered businesses), (b) FCA Consumer Credit Authorisation (months, ongoing compliance), (c) structure as purchase + repurchase agreement to sidestep credit classification (requires legal opinion).

**Blocker 2 — Operational**: Vault operations need to be established. Custody tracking, insurance for high-value cards, grading on intake, condition verification on release. The trade-in infrastructure is close but needs extension.

**Blocker 3 — Trust**: Credit secured by physical cards requires deep trust. Users need to have sent cards to Cambridge TCG before (trade-ins, consignment) and had good experiences. This takes time to build.

**When it makes sense**: After Standing Buy Offers and Vault operations are running for 6+ months. The consignment base is the first cohort. B2B only in Phase 1 of credit.

---

## Part 4: The Questions Before Building

**1. Does a customer balance/wallet exist?**
Standing Buy Offers require escrowed capital. If customers can't hold a balance with Cambridge TCG, escrow implementation requires Stripe PaymentIntents held at offer creation. Which do you have?

**2. What's the condition grading standard?**
Standing offers require unambiguous condition matching. Does Cambridge TCG have a documented, published grading scale? If not, write it first — before any escrow mechanism.

**3. What's the trade-in payout flow?**
When Cambridge TCG accepts a trade-in, how is the seller paid? If it's store credit/balance, standing offer payouts can use the same infrastructure. If it's manual bank transfer, the payout flow needs designing separately.

**4. Are there existing consignment / vault customers?**
These are the first test cohort for Card Credit. Their experience proves the custody model before credit is extended.

**5. What monthly transaction volume do you expect from Standing Offers?**
50/month vs 500/month changes whether a full escrow engine is worth building vs. a simpler "request + manual match" workflow to start.

**6. Has Cambridge TCG taken legal advice on consumer credit?**
Needed before Phase 2 (Card Credit) is scoped. The answer shapes whether Phase 2 is months or years away.

---

## Appendix: Full Mechanism Verdict Summary

| Mechanism | Verdict | ROI | Timeline |
|-----------|---------|-----|----------|
| Standing Buy Offers (bid pools) | Translates with modification | ⭐⭐⭐ High | Phase 1 |
| Listing Quality Multipliers | Translates directly | ⭐⭐⭐ High | Phase 1 |
| Seasonal Structure | Translates directly | ⭐⭐ Medium | Phase 1 |
| Card-Backed Credit (Blend) | Translates with modification | ⭐⭐⭐ High (later) | Phase 2 |
| Set Sweep | TCG-native enhancement | ⭐⭐ Medium | Phase 2 |
| Portfolio/collection tracker | Translates directly | ⭐⭐ Medium | Phase 2 |
| Care package / delayed reveal | Translates directly | ⭐⭐ Medium | Phase 1 (with seasons) |
| Royalty optionality → fee reduction | Translates with modification | ⭐ Low-Medium | Phase 2 |
| Permissionless lender marketplace | Does not apply | N/A | Never |
| DAO governance | Does not apply | N/A | Never |
| Gas optimization | Does not apply | N/A | Never |

---

*End of thesis. Next step: answer the 6 questions above, then scope a Phase 1 sprint.*

*Authored by Gamma / 愛 | 2026-04-28*
