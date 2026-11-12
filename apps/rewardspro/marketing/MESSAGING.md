# RewardsPro messaging

## Core concept (the owner, 12 Nov 2026)

> "我想加個核心concept, instead of paying ads to acquire more customers, give back to those that have shopped and
> will stay. Retention and build a relationship instead of expanding and getting those that never return."

("我想加個核心concept" is "I want to add a core concept"; the gloss is ours.) The idea is the owner's; the wording
below is the agents'. In the same session he said yes to it, chose the opener for posts and video (option b), and
asked for the home page to carry it: "1. yes 2. b 3. yes need an update 4.yes please" (`approvals.jsonl`,
2026-11-12). **This section is current. The rest of this file, from "Proposal for the owner, 2026-11-07" down, is
history.**

- **Headline:** Give back to customers who buy from you.
- **Line:** RewardsPro is for giving back to customers who buy from you.
- **Proof, under either:** No one earns cashback without a paid order.
- **Posts and video only:** Shops pay to find new customers. RewardsPro is for giving back to the ones who buy
  from you.

**Why it is true.** The only code path that creates store credit starts from a recorded paid order with a customer
on it. A first paid order can earn too, at the lowest tier's rate, which the shop sets from 0% to 100%. Past and
imported orders earn nothing, so the line is in the present tense: "who buy from you", never "who have bought"
without "Past orders earn no cashback." beside it.

**Where it stands.** rewardspro.io's home page carries the headline as its h1, the proof as the last sentence of its
lead, and the tier line below in How it works, step 1, once that change is merged on the owner's word and deployed.
The site, the listing and the profiles name no advertising. The 0% base rate setting goes on the help page first,
with its limits (the owner's yes, 12 Nov, item 4), and no post says it before the help page does; that change is
not made yet.

| Sentence | Ledger row | Source (under `apps/rewards/` at 8daf7f09) | Limit |
|---|---|---|---|
| RewardsPro is for giving back to customers who buy from you. (The h1: "Give back to customers who buy from you.") | `rp-give-back` | A purpose: the owner's words above, and of 7 Nov ("give back to customers who are loyal", `approvals.jsonl`). The next row makes it hold | Never a result: not that customers stay, return or spend more. The shop gives and funds; RewardsPro adds the credit. Never "the customers you already have" or "existing customers" |
| No one earns cashback without a paid order. | `rp-no-cashback-without-paid-order` | The only credit payout is created in `app/lib/record-order.server.ts:225-238`; the only other `payout.create` is the refund debit, `app/lib/refunds.server.ts:247`. `recordOrder` records nothing without a customer (`:92`) and gives imported orders no cashback (`:61`). It is reached from `orders/paid` (`app/routes/webhooks.orders.paid.tsx:55`), the hourly sweep of paid, partly refunded or refunded orders (`app/lib/payout-check.server.ts:536`, `app/shopify/order-source.server.ts:755`), and the import (`app/lib/import.server.ts:41`) | One way only. Never "every paid order earns": the help page's list at `/help/#earn-nothing` (`:313-322`) has seven kinds that earn nothing |
| So a customer who has spent more with you can be in a tier with a higher rate, if you set one. | `rp-tier-higher-rate` | A tier is a name, a minimum spend and a rate (`prisma/schema.prisma:261-266`); `saveTier` and `saveLadder` take any whole percent from 0 to 100 and tie no rate to a minimum (`app/lib/tiers.server.ts:526-556, 608-636`); an order's rate is the locked tier's, or else the customer's (`app/lib/record-order.server.ts:149`) | After "Add tiers by spend, each with its own cashback rate.", never alone. "Can" and "if you set one" stay: the rates are the shop's. The order that takes a customer into a higher tier earns the old rate (help page `:263-264`) |
| A customer new to your store, or not yet placed in a tier, earns your lowest tier's rate. | None (a live sentence on the help page, `:265`) | `app/lib/record-order.server.ts:116-149` | The shop sets that rate from 0% to 100% (home page, How it works, step 1); at 0% the order earns nothing (`record-order.server.ts:156-161`). So never "first-time buyers earn" as RewardsPro's rule, and never "first-time buyers don't earn" |

"Help page" is `apps/rewardspro/landing/public/help/index.html` at 8daf7f09.

| His words | Said as | Why |
|---|---|---|
| "give back to those that have shopped" | "giving back to customers who buy from you"; "No one earns cashback without a paid order." | The mechanism, as fact, in the present tense. Never "the customers you already have": first-time buyers can earn too |
| "instead of paying ads to acquire more customers" | "Shops pay to find new customers." before the line, in posts and video only (his choice, option b) | His turn, said fairly: both cost money, and the post then says the shop funds the cashback. Advertising isn't named on the listing, the site or the profiles: RewardsPro's App Store ad is built from the listing, and STRATEGY.md never-say 3 bars comparisons |
| "will stay", "retention", "build a relationship", "those that never return" | Not said. Tiers by spend, "a customer who has spent more with you can be in a tier with a higher rate, if you set one", and "You can lock a customer to a tier." | Results nobody can show; the mechanism is stated instead |

**The 0% base rate setting, when the help page says it.** The closest true form of "those that will stay" is a
setting, not a result: with a base rate of 0%, a customer's orders earn cashback once they are in a tier the shop
has set above 0% (`app/lib/tiers.server.ts:37-41`, `app/lib/record-order.server.ts:149-161`). Its four limits go
with it: the order that takes a customer into that tier still earns 0% (help page `:263-264`); past orders brought
in at install can place a customer in it from the start (`:196`); customers move down when their counted spend falls
below the minimum, with no grace period, unless locked (`:381`); and at 0% the widget shows guests the sign-in
prompt without a rate (`:240`). Never as advice that it works ("so only returning customers earn").

**Rules that travel with it:** "free" only beside "you fund the cashback you give", and with Shopify's fee sentence
in a field of 300 characters or more; never "every paid order earns" (link `/help/#earn-nothing`); never "who have
bought" without "Past orders earn no cashback."; any line about spending carries Shopify's sign-in rule, labelled
and dated; no outcome, no cost comparison with advertising, no "only"; advertising is never cast as the thing to
avoid.

**Don't say**

| Don't say | Why | Say instead |
|---|---|---|
| "Instead of paying for ads, give back to your customers"; "Stop paying for ads"; "Ads don't work" | Tells shops to drop advertising, which RewardsPro's own plan uses (ROADMAP.md §6), and shops need new customers | In posts and video: "Shops pay to find new customers. RewardsPro is for giving back to the ones who buy from you." |
| "Not chase customers with ads"; "instead of chasing new customers" | Casts advertising as the thing to avoid. It was the agents' paraphrase, not the owner's words | The opener and the line |
| "An advert is for people who might buy. Cashback is for people who have."; "Before they buy, an advert. After, cashback."; "Two places a shop's money can go." | Adverts reach past buyers too; the pair implies a saving nobody can show (CAP Code 3.1, 3.7, 3.37); issuing credit moves no money | Nothing about adverts. "No one earns cashback without a paid order." |
| "A shop pays for ads to reach people. In RewardsPro, no one earns cashback without a paid order." | Read together: an advert is paid for whether anyone buys or not, while RewardsPro costs nothing until a sale. That is "you only pay when they buy", an implied saving, with Shopify's fee left out | The opener, then "you fund the cashback you give": both cost money |
| "Cheaper than ads", "costs less than finding a new customer", any ROI or cost-per-customer figure | No data (STRATEGY.md never-say 9) | "You fund the cashback you give." with Shopify's fee sentence |
| "Customers will stay / come back / return / spend more / become loyal"; "keeps your customers"; "retention"; "so they have a reason to come back and buy again" | Results nobody can show | The line, or the listing subtitle "Give loyal customers cashback to spend in your store" |
| "Builds relationships", "builds loyalty", "reward their loyalty", "loyalty program", "community" as fact | Results, or category words the kit avoids (DESIGN.md Voice) | Tiers by spend, the tier line, the tier lock |
| "The customers you already have" (beside "new customers"); "existing customers, not new ones"; "repeat customers" | A first paid order can earn too (help page `:265`) | "the ones who buy from you" (after the opener); "customers who buy from you" |
| "Cashback for customers who have already bought / already paid"; "Give back to customers who have bought" on a card, h1, bio, listing or video without "Past orders earn no cashback." | Reads as the shop's past customers and their old orders, which earn nothing (help page `:318`) | "Give back to customers who buy from you." |
| "No paid order, no cashback." as a headline, card or post | Read both ways ("no pain, no gain"), it says every paid order earns | "No one earns cashback without a paid order." |
| "Customers who never return", "one-off buyers" | Describes other shops' customers, and nothing shows it | Nothing |
| "Only customers who buy earn"; "only paying customers" | "Only" is never-say 3 | The proof line |
| "Every paid order earns"; "every customer who buys gets cashback" | Seven kinds of order earn nothing (help page `:313-322`) | "When an order is paid, RewardsPro adds cashback …" with the earn-nothing link |
| "First-time buyers earn" or "first-time buyers don't earn" as RewardsPro's rule | The shop sets the lowest tier's rate and can make it 0% | The lowest-tier sentence above, with its limit |
| "The more they spend, the more they earn"; "your best customers"; "VIPs get more" | The rates are the shop's; the crossing order earns the old rate; "best" is never-say 3 | The tier line |
| "Customers move up tiers as they spend" | They move down too, and not at all while locked | `rp-vip-tiers` |
| "The money stays in your shop"; "every penny goes to your customers"; "credit never expires" | Promises about time; refunds take credit back; Shopify's fee is the shop's money too | `rp-merchant-funds`; "RewardsPro sets no expiry date on the credit it gives." (help page `:356`) |
| "You only pay when they buy"; "costs nothing until it's spent" | Blocked words (never-say 1 and 3), an accounting reading, and Shopify's fee | The proof line, `rp-merchant-funds`, `sh-sc-fee` |
| "They'll spend it on their next order"; spending without the sign-in rule | Implies a return, and drops Shopify's rule | `sh-sc-signin-legacy` in full, labelled and dated |
| "Free" alone | Never-say 2 | `rp-free` beside `rp-merchant-funds` |
| "Instantly", "real-time" | No timing has been observed (`rp-paid-trigger` scope) | "When an order is paid" |
| "RewardsPro gives your customers cashback" (as if RewardsPro pays) | The shop gives and funds it | "RewardsPro adds cashback … you fund the cashback you give" |
| "We made / built RewardsPro for …" | The old app had points and tier products; the past tense invites that | "RewardsPro is for …" |
| "Our view: … deserve something back" | Judges customers; reads as a lecture | The opener and the line |
| "We advertise RewardsPro too" | The ad may not be running on the day | Leave it out |
| "Acquiring customers is expensive. Keeping them shouldn't be." (a 2025 post on RewardsPro's X account) | An unsourced cost claim, then a promise about keeping customers and about cost | Don't repeat it |
| A 0% base rate "so only returning customers earn" | Advice that implies a result; "only" | The setting with its four limits, above, on the help page first |

**Register:** "give back" is the owner's verb (7 and 12 Nov) and leads. "Reward" stays in the listing subtitle. With
his yes to the wording, the headline is the umbrella line, in place of U1, U1-Y (O1) and UA ("Made for rewarding
loyal customers.", the h1 until this change) in §1 below. "Loyal customers" stays his term (approved 7 Nov) in the
tier sentences.

Placements for posts, video, profiles and the listing are in the team's private notes of 12 Nov 2026; any public
text made from them carries the limits above.

---

**Proposal for the owner, 2026-11-07. Only the owner's own words in §0 are his; every other line here is an agents' proposal
awaiting his yes.** Nothing here is sent, published or decided. Every claim id cited is `proposed` in
[claims.toml](claims.toml) (36 rows, none verified), and G0 hasn't passed, so no text below can go public or into
an email until the rows it carries are `verified` and the gates in §6 hold. Examples use the fictional Example
Cards Ltd (and, in §5.10, Example Roasters Ltd) at example.com; no real shop or person appears. Not legal advice.

Built from three wf7 copy drafts and three judges' reviews (the owner's intent, truth, the reader), plus the compliance
brief, all in `/Users/macair/Documents/rewardspro-research-2026-11-07/wf7/`. Where this file and
[social/entity-card.md](social/entity-card.md) differ on state A or B texts, this file supersedes the card.
Revised later on 2026-11-07 for the owner's "loyal customers" and the business register he asked for (§0 item 3, §4),
then corrected after two reviews of that revision (§9).

Labels: **[V]** checked in this session against a file, commit or saved capture; **[I]** inferred; **[U]** unknown.
Ids marked `*` aren't in `claims.toml` yet (§7). Counts: Python `len()` for characters, `len(text.split())` for
words, on the exact text inside each block; §9 says how they were checked.

---

## 0. The owner's words, 2026-11-07 (verbatim)

> "Emailing business directly is fine. But give it a warmer touch, on what rewardspro is. A credit system to give
> back to customers who are loyal, so that a ecosystem can be built."

Later the same day (`approvals.jsonl` line 7):

> "用loyal customers, take a more business approach on wordings."

("用" is "use": use "loyal customers", and take a more business approach to the wording. The gloss is ours.)

What the words decide:
1. **Cold contact (ROADMAP Now-2): decided.** Direct email to businesses is fine. It no longer waits for
   Shopify's written answer. The law and the binding PPA sentences still apply, and §5–§6 build them in.
   **Superseded on 10 Nov 2026:** after Shopify Partner support's answer there is no cold email to shops
   (ROADMAP §2), so the email texts and gates in this file are history.
2. **What RewardsPro is: the umbrella idea is his word** (`kernel.toml` says positioning and promise changes need
   it). The idea is his; the exact wording below is ours, for his yes. `kernel.toml` is left as it was: its own
   comment keeps `[messaging]` empty until about five interviews, and the approval record is `approvals.jsonl`,
   where his words now stand (lines 3–7, W1). §8 holds the `[messaging]` table proposed for when he okays a kernel
   change.
3. **The customer term and the register: decided** (`approvals.jsonl`, ledger `rp-term-loyal-customers`).
   "Loyal customers" replaces "regulars" in every block, and the copy moves to a business register (§4). His
   earlier "give it a warmer touch" is read through the later words: the care for the reader stays (one email, a
   small ask, no need to reply, the merchant's own controls stated plainly) and the chatty phrasing goes [I: our
   reading of the two together; his to correct].

How this file keeps his meaning:

| His words | Here | Why |
|---|---|---|
| "give back" | "reward" in the business lines (U1, the descriptions, the subjects); "give back" kept in the alternative, U1-Y, which the agents built on his verb and term | "Reward" says what the merchant does, in commercial terms. It describes the act, never "reward their loyalty" (an outcome) |
| "a credit system" | store credit in your own shop, which you fund | `rp-merchant-funds` (its own words: "store credit in your own shop"), `rp-store-credit` |
| "customers who are loyal"; "loyal customers" | "loyal customers", in every block | His term (approved 7 Nov). It says who they are, not how they feel or what the app makes them. Never "makes customers loyal" or "loyalty program". "Regulars" is retired |
| "so that a ecosystem can be built" | "store credit in your own shop" and "redeemable in your shop" (the mechanism, as fact); "the aim is an ecosystem around your shop" (D500-A, D500-B-ECO) | The mechanism is stated as fact; the ecosystem only as the aim, as he put it: "can be built". "Ecosystem" never implies credit across shops: the rebuild spec lists cross-store credit as a non-goal (wf8 G4; `wf8/feedback.md` §5.4 HR6) |
| "take a more business approach on wordings" | the business register (§4) | Short declarative sentences about what the merchant gets and controls, with the limits beside the features. Confident, never hype |

**Never claimed anywhere below:** that customers come back more, spend more or stay longer; that retention or
sales rise; that an ecosystem forms or exists; any number. Those are outcomes, and nothing shows them yet.

---

## 1. Umbrella line (proposal)

**U1** (recommended: business register, "loyal customers"; O1; state B) · 58 characters, 10 words · `rp-purpose`*,
`rp-merchant-funds`, `rp-store-credit`
```text
Reward loyal customers with store credit in your own shop.
```
- What the merchant does, and where the credit is, in 10 words. "Store credit in your own shop" is
  `rp-merchant-funds`' own wording, so the line states a mechanism and no outcome; that mechanism is also
  `rp-store-credit`'s. "Reward loyal customers" says who receives the credit; it isn't "reward their loyalty" (§4).
- "In your own shop" says *where* the credit is, with no reading about *how long*. A refund can still take its
  share back, and RewardsPro sets no expiry [V: `store-credit-rail.server.ts:306-307` @6bd092cb sends
  `creditAmount` and `notify` only]; never "never expires". It replaces U1's earlier "stays in your shop", which
  a reader could take as a promise about time.
- No "spend" in it, so it stands alone on a card or heading without the sign-in limit (entity-card rule 4).
- **State B only (after G0), for now.** "The cashback is store credit in your own shop" states the mechanism
  `rp-store-credit` covers, so no text using it can be verified before that row is
  (`social/content/launch-posts.md` §1.1). `social/claims-map.md` lists `rp-merchant-funds` as needing no dev
  store, and MESSAGES §3 says "G0 for `rp-merchant-funds`". Until the claims maker settles that split (Pre-1), U1,
  U1-Y and U2 carry `rp-store-credit` too and wait for state B; UA is the state A heading [I].

**U1-Y** (the alternative: the agents' line built on the owner's verb and term; O1; state B) · 70 characters, 13 words ·
`rp-purpose`*, `rp-merchant-funds`, `rp-store-credit`
```text
Give back to your loyal customers, with store credit in your own shop.
```
- "Give back" and "loyal customers" are his; the rest is ours, as in U1. Warmer than U1. "With store credit in your
  own shop" replaces the earlier "in credit that stays in your shop", which carried the reading about time that U1
  avoids. He picks (O1).

**U2** (short heading or social card; state B) · 40 characters, 8 words · `rp-merchant-funds`, `rp-store-credit`
```text
Store credit you fund, in your own shop.
```

**UA** (state A, and the fallback while the rows above aren't verified) · 35 characters, 5 words · `rp-purpose`*
```text
Made for rewarding loyal customers.
```

**Term rule (O2, decided 7 Nov):** every block below says "loyal customers"; none says "regulars". "Repeat
customers" is kept for a sentence whose grammar needs it, and none here does (it also sits next to "repeat
purchases", an outcome phrase, §4). Quotes of other files' or other agents' wording stay as written.

---

## 2. Descriptions

### 2.1 State A: before G0 (no sentence that needs the dev store)

Carries only the maker, the compatibility wording, the contact address and the owner's idea as intent. It drops the
entity card's "on the Shopify App Store", which `rp-on-app-store` no longer covers (the row was narrowed to
compatibility only on 2026-11-07). Usable once `rp-maker`, `rp-on-app-store` and `rp-purpose`* are verified;
D500-A also needs `rp-contact-delivers`. The purpose phrase sits next to the app, never after the maker, so it
can't read as the maker rewarding its own customers.

**ONE-A** (one sentence) · 112 characters, 19 words · `rp-maker`, `rp-on-app-store`, `rp-purpose`*
```text
RewardsPro, made by Cambridge TCG Limited in London, UK, is an app for Shopify stores to reward loyal customers.
```

**D100-A** · 98 characters, 16 words · `rp-maker`, `rp-on-app-store`, `rp-purpose`*
```text
RewardsPro, made by Cambridge TCG Limited, is an app for Shopify stores to reward loyal customers.
```

**D160-A** · 138 characters, 24 words · `rp-on-app-store`, `rp-purpose`*, `rp-maker`
```text
RewardsPro is an app for Shopify stores, built for rewarding loyal customers. It is made by Cambridge TCG Limited, a UK company in London.
```

**D500-A** · 225 characters, 37 words · by sentence: (1) `rp-on-app-store`, `rp-maker`; (2) `rp-purpose`*;
(3) the aim, the owner's "ecosystem" (no id; O3); (4) `rp-contact-delivers` (its own sentence)
```text
RewardsPro is an app for Shopify stores, made by Cambridge TCG Limited, a UK company in London. It is built for rewarding loyal customers. The aim is an ecosystem around your shop. Questions reach us at contact@rewardspro.io.
```
Short on purpose: state A can't say how the app works, so it has no store-credit sentence. "The cashback is store
credit in your own shop" states `rp-store-credit`'s mechanism (§1; `social/content/launch-posts.md` §1.1), and
once that row is verified, D500-B or D500-B-ECO replaces D500-A.

### 2.2 State B: from S2 (after G0, once every row named is verified)

**ONE-B** (one sentence) · 196 characters, 36 words · `rp-on-app-store`, `rp-purpose`*, `rp-paid-trigger`,
`rp-store-credit`, `rp-merchant-funds`, `rp-vip-tiers`
```text
RewardsPro is an app for Shopify stores, for rewarding loyal customers: when an order is paid, it adds cashback to the customer's store credit in your shop, at the rate you set for their VIP tier.
```

**D100-B** · 95 characters, 17 words · `rp-purpose`*, `rp-store-credit`, `rp-merchant-funds`, `rp-vip-tiers`. No price,
link or statistic, so it is listing-safe in form (App introduction, limit 100). Whether it replaces the live
intro is the owner's call (`social/listing-delta.md` §2).
```text
Reward loyal customers: cashback as store credit in your shop, with VIP tiers you set by spend.
```

**D160-B** (meta description) · 151 characters, 26 words · `rp-purpose`*, `rp-paid-trigger`, `rp-store-credit`,
`rp-merchant-funds`, `rp-vip-tiers`. Within the card's 155 target for search snippets; no price.
```text
Reward loyal customers: when an order is paid, RewardsPro adds cashback to the customer's store credit in your shop, at their tier's rate. You fund it.
```

**D500-B** (site, press and partner boilerplate, not a listing field; equal weight with D500-B-ECO, O3) ·
491 characters, 88 words · by sentence: (1) `rp-on-app-store`, `rp-maker`, `rp-purpose`*; (2) `rp-paid-trigger`,
`rp-store-credit`, `rp-merchant-funds`; (3) `rp-vip-tiers` (its own first sentence); (4) `rp-merchant-funds`,
`rp-credit-own-shop`*, `sh-sc-signin-legacy`, `sh-sc-full`, `sh-sc-currency`; (5) `rp-refund-takeback`
```text
RewardsPro, made by Cambridge TCG Limited in London, UK, is an app for Shopify stores to reward loyal customers. When an order is paid, it adds cashback to the customer's store credit in your shop. You set VIP tiers by spend, each with its own cashback rate. You fund the credit, and it is redeemable in your shop: customers signed in with Shopify's new customer accounts or Shop Pay use the full balance held in the checkout's currency. A refund takes back its share from credit still held.
```
- Sentence 1 is ONE-A's, so the purpose sits next to the app, not after the maker. "The full balance held in the
  checkout's currency" is `sh-sc-currency`'s rule: Shopify shows and applies only the balance already held in that
  currency, and converts nothing.
- "Redeemable in your shop" says where the credit can be spent, not that customers spend it, so it is a mechanism,
  not an outcome. It leans on the new row `rp-credit-own-shop`, whose "not in other shops" is [I]; the text
  doesn't say "not in other shops". If the verifier narrows that row, sentence 4 becomes "You fund the credit, and
  it is store credit in your own shop: customers…" (`rp-merchant-funds` alone).
- Sentence 3 is `rp-vip-tiers`' own wording, so each tier's rate is the merchant's to set, with no claim that a
  higher tier pays more.

**D500-B-ECO** (equal weight with D500-B: the owner's own words "a credit system", "loyal customers" and "ecosystem",
O3) · 491 characters, 89 words · by sentence: (1) `rp-on-app-store`, `rp-maker`, `rp-purpose`*,
`rp-store-credit` ("a credit system"); (2) `rp-paid-trigger`, `rp-store-credit`, `rp-merchant-funds`,
`rp-vip-tiers`; (3) `rp-merchant-funds`; (4) "the aim is an ecosystem around your shop" is the aim (no id), and the
words after the colon carry `rp-credit-own-shop`*, `sh-sc-signin-legacy`, `sh-sc-full`, `sh-sc-currency`. The
refund sentence drops out to fit, and "Shopify's" before "new customer accounts" goes so that "held" fits.
```text
RewardsPro is an app for Shopify stores, made by Cambridge TCG Limited in London, UK: a credit system for rewarding loyal customers. When an order is paid, it adds cashback to the customer's store credit in your shop, at the rate you set for their VIP tier. You fund the credit. The aim is an ecosystem around your shop: credit issued in your shop is redeemable in your shop, by customers signed in with new customer accounts or Shop Pay, as the full balance held in the checkout's currency.
```
- "Is redeemable in your shop" says where the credit can be spent, not that customers spend it. "Loyal customers"
  is the owner's term; entity-card rule 1 now allows it (amended 7 Nov).

**FREE-ADD** (a separate line beside D500-B on a page with room; only once `rp-free` can be verified, which needs
the two frozen paid charges cancelled or the owner's written acceptance) · 260 characters, 46 words · `rp-free` (its
exact sentence), `rp-merchant-funds`, `sh-sc-fee` (its exact sentence)
```text
RewardsPro is free for every store that installs it, and no paid plans are offered. You fund the cashback you give. For Shopify stores created on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit.
```
None of the descriptions above says "free": the free rule (STRATEGY never-say 2) would pull in both partners.

### 2.3 Where each goes

| Surface | State A | State B | Note |
|---|---|---|---|
| rewardspro.io heading | UA | U1 or U1-Y (O1); U2 as a section heading | U1, U1-Y and U2 carry `rp-store-credit`, so they wait for state B (§1) |
| rewardspro.io meta and og description | D160-A | D160-B | The entity card's og and share-card notes still apply (card §4, §7) |
| Press, partner, "About RewardsPro" | D500-A | D500-B or D500-B-ECO (equal weight, O3), plus FREE-ADD once verifiable | |
| Profile texts (STRATEGY §3.2) | ONE-A or D160-A, by field length; or the profiles' own texts with the optional purpose line PU0 (`social/profiles.md` §2.1) | ONE-B or D160-B; or the same PU0 | `rp-purpose`* needs the social channels in its row |
| First email | §5.4 | §5.3 | |
| App introduction (100) | not used (the live intro stays) | D100-B, optional, or the card's E100-B | The owner's call |
| App details, SEO meta, JSON-LD, `brand.json` | entity card | entity card | Not covered here. The card's texts that say "on" or "listed on the Shopify App Store" need the same cut as state A, or `rp-app-store-listed`* verified, before use |

---

## 3. Three pillars (proposal)

Each pillar is one part of the owner's sentence, stated as what the merchant gets and controls. The lines are for pages
with room (`/help/`, a site section, the try-it reply). Every sentence carries its ids.

**P1 · Store credit in your own shop** (his credit system and his ecosystem, made concrete)
- "The cashback is store credit on the customer's account in your shop, and you fund it." `rp-store-credit`,
  `rp-merchant-funds`
- "Credit issued in your shop is redeemable in your shop." `rp-merchant-funds`, `rp-credit-own-shop`*
- "Customers can spend it when signed in with Shopify's new customer accounts or Shop Pay, not legacy accounts.
  They choose Apply store credit at checkout and use the full balance held in the checkout's currency, not part of
  it." `sh-sc-signin-legacy`, `sh-sc-full`, `sh-sc-currency`
- "Shopify doesn't let store credit pay subscription renewals." `sh-sc-subscriptions`* (wf8 `fit.md` §8.3's row,
  worded shorter here; §7)
- Optional: "RewardsPro sets no expiry date on it." `rp-no-expiry`*

*Proof:* `rp-store-credit`, `rp-merchant-funds`, `rp-credit-own-shop`*, `sh-sc-signin-legacy`, `sh-sc-full`,
`sh-sc-currency`, `sh-sc-subscriptions`*.

**P2 · Cashback when an order is paid** (his "give back", tied to real orders)
- "When an order is paid, RewardsPro adds cashback to the customer's store credit; it doesn't wait for the order
  to be fulfilled." `rp-paid-trigger`, `rp-store-credit`
- "Cashback is paid on the product price after discounts. Shipping, and anything paid with store credit or gift
  cards, earns nothing." `rp-cashback-base` (the ledger's sentence)
- "Each tier has one cashback rate, with no setting to exclude products, collections or sales channels."
  `rp-no-order-rules`*
- "A refund takes back its share of the cashback, from store credit the customer still holds."
  `rp-refund-takeback`

*Proof:* `rp-paid-trigger`, `rp-store-credit`, `rp-cashback-base`, `rp-no-order-rules`*, `rp-refund-takeback`.
Never "every order": orders with no customer attached, test, cancelled and pre-install orders earn nothing
(`rp-store-credit`). Never "every product" or "no exclusions" either: gift-card lines earn nothing [V:
`apps/rewards/app/shopify/order-source.server.ts:238` @6bd092cb counts them as zero; `rp-cashback-base`], and
whether POS orders earn has never been observed (`sh-sc-channels`). The limit says what the merchant can't set,
not that everything earns.

**P3 · VIP tiers you set** (his loyal customers)
- "You set VIP tiers by spend, each with its own cashback rate, and customers move between them as their spend
  changes." `rp-vip-tiers` (moving includes moving down: no grace period)
- "You can lock a customer to a tier, for example to keep a long-standing loyal customer in their tier."
  `rp-tier-lock`
- "While cashback is on, a widget you turn on in your theme editor shows signed-in customers their tier, store
  credit and progress." `rp-widget`
- On a page with a screenshot, the widget's own words show what the customer sees: "{amount} more to reach {tier}",
  for example "£20 more to reach Gold" [V: `extensions/rewards-widget/locales/en.default.json:8` @6bd092cb; the
  money format on screen is [U]]. A top-tier customer sees "You are on the top tier" instead (`:10`).

*Proof:* `rp-vip-tiers`, `rp-tier-lock`, `rp-widget`.

**One line for a page:** "When an order is paid, the customer receives cashback as store credit in your shop, at
the rate you set for their VIP tier." `rp-paid-trigger`, `rp-store-credit`, `rp-merchant-funds`, `rp-vip-tiers`.

---

## 4. The business register inside the R1 voice (proposal)

**What it is** (the owner, 7 Nov: "take a more business approach on wordings"): clear, professional sentences about
what the merchant gets and controls: store credit they fund, in their own shop; VIP tiers and rates they set;
refunds that take back their share. Short declarative sentences in British business English. Confident, never
hype. The limits are stated as plainly as the features, next to them: customers spend credit when signed in with
new customer accounts or Shop Pay; Shopify doesn't let credit pay subscription renewals; there is no setting to
exclude products, collections or sales channels. That holds in emails and on pages with room; a description of
500 characters or fewer carries the sign-in limit wherever it mentions spending, and leaves the other two to the
page it links to. Respect for the reader's time stays: one email, one small ask, no need to reply.

**Use**

| Word or phrase | Note |
|---|---|
| loyal customers | The owner's term (approved 7 Nov, `rp-term-loyal-customers`). Describes who they are; never "makes them loyal" |
| reward loyal customers; for rewarding loyal customers | The lead verb in the business lines (U1, the descriptions, the subjects). Says what the merchant does, not what customers do in return |
| give back | The owner's verb, kept in the alternative line built on it (U1-Y) |
| store credit in your own shop | `rp-merchant-funds`' own words. Where the credit is, never how long |
| redeemable in your shop | Where the credit can be spent, not that it is spent; needs `rp-credit-own-shop`* |
| you fund the credit; you set the rate; you set the tiers by spend; you can lock a customer to a tier | What the merchant controls, said plainly |
| the aim is an ecosystem around your shop | The owner's word, only as the aim he gave it ("can be built"). Never as something that exists or forms (O3) |
| Two limits:; Please note: | Introduces a limit plainly, in the same paragraph as the feature |
| There is nothing to install; declining is fine; there's no need to reply; we won't write again unless you do | Low pressure, kept true by `out-one-message`* |
| Dear [shop] team; Thank you for your reply; Kind regards | Standard British business openings and closes |

**Avoid**

| Word or phrase | Why |
|---|---|
| regulars | Replaced by the owner's "loyal customers" (7 Nov). "Repeat customers" only where grammar needs it, never where it could read as "repeat purchases" |
| chatty asides: "that's kind of you", "we'd love", "happy to", "just a quick chat", "no worries", "look after your regulars" | Not the business register (the owner, 7 Nov) |
| exclamation marks; deadlines; "spots left" | Never-say 12 |
| love, family, blessing, kingdom, citizen, seat; liturgical or cosmology words | R1 commerce voice (`kernel.toml` ring R1) |
| community (as a warm noun) | Reads as a promise that a group forms |
| an ecosystem stated as fact ("your ecosystem", "builds an ecosystem") | An outcome. The owner said "can be built": the aim, not the result |
| loyalty, loyalty program, members, membership; "makes customers loyal"; "reward their loyalty" | Entity-card rule 1; STRATEGY §4: a category word, and an outcome. "Loyal customers" describing them is the owner's term (Use) |
| keep them coming back, bring buyers back, come back more, repeat purchases, retention, increase retention, boost sales, grow, increase | Outcome claims with no evidence |
| VIP experience; exclusive; powerful; game-changing; unlock | Puffery and hype |
| every order; instant; real-time; in minutes; seamless; journey; delight | Never-say 4–5; untrue or unproven |
| only, first, best, most, leading, #1 (even in a plain sense) | Never-say 3 and entity-card rule 1 are checked mechanically, so plain wordings are used instead ("we won't write again unless you do"; "each tier has one cashback rate"; "once installed" for `rp-import-past`'s "when you first open", §7) |
| every product; no exclusions; "every sale earns" | Wider than the code: gift-card lines earn nothing, and POS earning is unobserved (P2). Say what the merchant can't set: "no setting to exclude products, collections or sales channels" |
| free, unless with `rp-merchant-funds` and `sh-sc-fee` beside it, and only once `rp-free` is verified | Never-say 1–2 |
| points, raffles, mystery boxes, missions | Removed features aren't named (Now-1, D9). "It offers no reward types other than cashback and VIP tiers" says what isn't offered without naming them (`rp-scope`) |
| "subscribers can spend it on their next box"; "works with Recharge"; "boosts retention"; "credit never expires"; "free" alone: all of `wf8/fit.md` §8.2 | False by Shopify's rule (credit can't pay renewals), never observed, no evidence, or wider than the fact (RewardsPro sets no expiry); fit.md §8.2 (wf8 G3) |

"Subscription renewals" appears only inside Shopify's limit, never as a RewardsPro feature. STRATEGY never-say 8
lists "subscriptions" among the old features the chance-word rule blocks, so the G4 social checker needs to allow
the phrase "pay subscription renewals" before any block carrying `sh-sc-subscriptions`* is checked. That checker
isn't written yet (`social/STRATEGY.md:488-497`, step 7). This file's own checker, `wf7/tools/verify.py`, has no
"subscription", "regulars", jargon or chatty phrase in its word list (`WORDS`, read 7 Nov) [V], so it neither blocks
nor checks them; the register was checked by reading (§9).

---

## 5. The direct business email set (proposal)

### 5.1 Who may be emailed (from `wf7/email-rules.md` §2)

- **Yes:** a UK private or public limited company or LLP, active at Companies House with a matching name, at a
  role address (`hello@`, `info@`) it publishes somewhere Shopify doesn't serve (see Held), confirmed on Shopify.
  These are PECR corporate subscribers (reg 22 doesn't apply).
- **Never:** sole traders and ordinary partnerships, or any shop that can't be classified (PECR reg 22 needs prior
  consent); webmail; named-person addresses (D7 default); any address received via Shopify (Partner Dashboard,
  installs, API, webhooks, App Store pages, Community, Partner Directory: PPA 2.1.2); any shop that ever reached us
  through Shopify, including the old app's shops, even if found again in public; contact forms; bought, scraped or
  looked-up lists; the online-first singles sellers (S2 segment); anything suppressed or outside the UK.
- **Held:** an address seen only on a Shopify-hosted storefront, until Shopify answers question 3 or RewardsPro's owner decides
  after Fri 18 Dec (D-src). **Shopify-hosted** means any page Shopify serves for the shop: the storefront on the
  shop's own domain when DNS shows Shopify (A record 23.227.38.x, or `www` CNAME to shops.myshopify.com), any
  `*.myshopify.com` page, and a proxied store a person can see is Shopify's even though DNS doesn't show it. If
  unsure, treat it as hosted. So "Yes" needs the address published somewhere Shopify doesn't serve: the company's
  own site or blog on another host, printed material, or a card handed over (`email-rules.md` §2.3).
- **The cost, said plainly [I]:** only shops confirmed on Shopify are written to, so for most candidates the only
  published address is on a Shopify-hosted storefront. Until question 3 is answered or D-src is decided, most
  candidates are held.
- **First audience (wf8 F-1):** of those, UK micro and small companies whose customers reorder consumables through
  a Shopify checkout (brand owners: §5.10). Card shops only in conversations RewardsPro's owner already has, conflict-of-interest
  line first, and no first email while they are a held lane (wf8 F-2; G1).

### 5.2 First email: three subject lines

Each says at first glance that it comes from Cambridge TCG Limited about its app (E-Commerce Regs regs 7–8). No
"Re:", no question hook, no "Shopify" (PPA 2.1.3(iii)).

**S1** (recommended; states A and B) · 59 characters, 9 words · `rp-maker`, `rp-purpose`*
```text
Cambridge TCG Limited: an app for rewarding loyal customers
```

**S2** (states A and B) · 67 characters, 9 words · `rp-maker`, `rp-purpose`*
```text
RewardsPro, from Cambridge TCG Limited: rewards for loyal customers
```

**S3** (state B only: a product fact) · 63 characters, 8 words · `rp-maker`, `rp-store-credit`, `rp-purpose`*
```text
Cambridge TCG Limited: store-credit rewards for loyal customers
```

### 5.3 First email, state B (after G0)

**BODY-B** · 227 words as written; 239 filled with a 16-word observation (fill in §9). Plain text, one
recipient, sent by hand.
```text
Dear [Example Cards] team,

We're Cambridge TCG Limited, makers of RewardsPro, an app for Shopify stores. We're writing because [one true, dated observation about your shop]. We found this address on your [page] page on [date].

RewardsPro is built for rewarding loyal customers with store credit in your own shop. When an order is paid, it adds cashback to the customer's store credit at the rate you set for their VIP tier. You set the tiers by spend, and you fund the credit.

Customers can redeem the credit when signed in with Shopify's new customer accounts (not legacy accounts) or Shop Pay, and the full balance held in the checkout's currency applies. Two limits: Shopify doesn't let store credit pay subscription renewals, and each tier has one cashback rate, with no setting to exclude products, collections or sales channels. The app has no reviews yet, and it offers no reward types other than cashback and VIP tiers.

We're asking for a 20-minute call to learn whether and how you reward loyal customers today. There is nothing to install. At the end we'll ask whether you'd like to hear more about RewardsPro, and declining is fine. If you're not interested, there's no need to reply: we won't write again unless you do.

Reply "stop" at any time and we won't contact you again.

Kind regards,
The RewardsPro team
```
Then the signature and the footer (§5.5), in that order, so the letter ends as a letter before the legal text.
The two limits go to every shop, not only those with a subscribe option (wf8 G2), because the first audience
reorders consumables (§5.1) and both limits bear on what the merchant can offer.

The CARD line below isn't used while card shops are a held lane (wf8 F-2).

**CARD** (card shops: inserted after "…an app for Shopify stores.", before anything else is said; the wording is
the owner's under D14 / Pre-7) · 45 characters, 7 words · `rp-maker-also-sells`* · with it, BODY-B is 234 words
as written, 246 filled
```text
For transparency, we also sell trading cards.
```

**Filling it:**
- `[one true, dated observation about your shop]`: one fact from the shop's own page, read by a person in an
  ordinary browser, under 30 days old, about what it offers loyal customers or how it uses store credit. Nothing
  about the apps it uses, any individual customer or its sales figures [I: our reading of PIPELINE §5 item 6,
  "nothing about its apps or customers"]; no praise standing in for a fact. Fictional example, used for the filled
  counts: "your 'sell to us' page offers more in store credit than in cash (seen 3 November)".
- `[page]`: the page as the shop names it ("Contact us"); the full URL, date and who looked go in the private
  source record. "We found" by default; with a person signing (O4), "I found" only if the signer is the person
  who looked.
- `[Example Cards]`: the shop's trading name, as its site gives it.
- **The company "we" is the default** (STRATEGY §4: "The company 'we', not a founder's 'I'"; `rp-maker`'s scope:
  "the company, never a named person"). **A person instead** (O4): "I'm [first name] at Cambridge TCG Limited. We
  make RewardsPro, an app for Shopify stores. I'm writing because…", "I found…", and the sign-off "[first name]".
  It reads more personally, but it departs from both, so it needs the owner's recorded exception first.
- **The ask is a call only, in both states** (ROADMAP Now-1: "no install ask"; `email-rules.md` §1 part 9). A try
  is offered only when a shop asks, with YES-TRY (§5.6), once the listing's false text is gone. Adding "or would
  you like to try it?" to the first email is O5's alternative and needs the owner's word.

### 5.4 First email, state A (before G0)

What can go out first once the W-gate holds (§6): the maker, the status, and the owner's idea as intent. No product
sentence.

**BODY-A** · 127 words as written; 139 filled (134 with the card line as written, 146 filled)
```text
Dear [Example Cards] team,

We're Cambridge TCG Limited, makers of RewardsPro, an app for Shopify stores. We're writing because [one true, dated observation about your shop]. We found this address on your [page] page on [date].

RewardsPro is built for shops that reward loyal customers. It has no reviews yet, so before we describe it further, we'd like to understand whether and how you reward them today.

We're asking for a 20-minute call. There is nothing to install. At the end we'll ask whether you'd like to hear more about RewardsPro, and declining is fine. If you're not interested, there's no need to reply: we won't write again unless you do.

Reply "stop" at any time and we won't contact you again.

Kind regards,
The RewardsPro team
```
BODY-A has no store-credit sentence: "store credit in your own shop" states `rp-store-credit`'s mechanism (§1), so
once that row and `rp-merchant-funds` are verified, BODY-B replaces BODY-A. The card line, signature and footer go
in exactly as in §5.3 and §5.5.

### 5.5 Signature, then the Art 14 footer (every first email)

**SIG** · 26 words · `co-details`*, `rp-maker`, `rp-contact-delivers`. Add "· rewardspro.io" to the last line
only once the home page no longer carries the retired copy: the banned two-word spelling and the old tagline
(ROADMAP §1; DESIGN.md "Outdated: don't say"). No other personal details. "Registered in England and Wales" is
[I]: the Companies House capture doesn't say it. Confirm it from a primary record (the certificate of
incorporation or the filing history) before W10, or drop those words.
```text
Cambridge TCG Limited, makers of RewardsPro
Registered in England and Wales, company no. 15680297
Registered office: [as Companies House shows it on the send day]
contact@rewardspro.io
```

**NOTICE** (Art 14 first layer, after the signature) · 134 words · `notice-live`*, `retention-numbers`*,
`co-details`*. The basis has to match LIA Part B as the owner signs it; the 30 days and the web-address-and-month
marker are PIPELINE §6.1's proposal, the owner's under D6.
```text
How we handle your details: Cambridge TCG Limited holds your company's name and number, this address, where and when we found it, and what we noted about your shop. We use them to ask for this conversation and to tell you about RewardsPro, on the basis of our legitimate interest in telling shops about it. Our email runs on Google Workspace, which may process it outside the UK. If you don't reply, we delete them 30 days after this email, keeping just your web address and the month we wrote, so we don't write again. You can ask to see, correct or delete what we hold, object at any time, and complain to us (reply here, or write to our registered office) or to the Information Commission (ICO, ico.org.uk). Full notice: [privacy notice link]#businesses-we-contact
```
The company number sits in the signature, not the first sentence: in sentence one it read like a formal notice
(reader review), and email-rules part 2 puts it in the signature. The owner may want it up front (O15).

### 5.6 Replies to a yes

Their reply is solicited, so these rest on what they asked for. Each keeps the stop line and the signature
(PPA 2.1.3(ii)). Subject: "Re: [their subject]" (a real reply, so "Re:" is honest here).

**YES-CHAT** · 152 words, plus the signature
```text
Hello,

Thank you for your reply.

Would [day and time] or [day and time] suit you, for 20 minutes by phone or video? If neither works, please suggest a time that does.

We'd like to understand whether and how you reward loyal customers now: what you offer them, what you've tried, and what has got in the way. You can skip any question, and we won't record the call. At the end we'll ask whether you'd like to hear more about RewardsPro, and declining is fine.

Our notes cover how the shop operates, not anyone's private life. We keep them for up to 12 months, or less if you ask, and you can have a copy. If the call doesn't go ahead, we delete your details 30 days after our last message. Details: [privacy notice link]#interview-notes

Reply "stop" at any time and we won't contact you again.

Kind regards,
The RewardsPro team
```

**YES-TRY** (state B, and only once the listing's false text is gone) · 291 words without the gated slot,
306 with the free sentence, plus the signature. Shopify's fee sentence goes out whatever happens to "free",
because it's a cost.
```text
Hello,

Thank you for your interest. Here is how to start.

You can install RewardsPro from its listing on the Shopify App Store: [listing link]. When you open it, Home has a setup card with three steps: set a base cashback rate, switch cashback on, and turn on the widget in your theme editor. Once installed, it also brings in your recent past orders, so customers start in the right tier. Past orders earn no cashback.

While cashback is on, the widget shows signed-in customers their tier, store credit and progress.

For customers to spend their credit, your store needs store credit turned on, new customer accounts and visible sign-in links, and Home warns you when Shopify shows one of these still needs doing. Shopify's help page also says to activate the Apply store credit option in the checkout's Payments section. Customers then choose Apply store credit at checkout, signed in or with Shop Pay, and use the full balance held in the checkout's currency, not part of it.

Please note: cashback is paid on the product price after discounts. Shipping, and anything paid with store credit or gift cards, earns nothing. A refund takes back its share of the cashback, from store credit the customer still holds. Each tier has one cashback rate, with no setting to exclude products, collections or sales channels, and Shopify doesn't let store credit pay subscription renewals.

[Gate: add once rp-free is verified: RewardsPro is free for every store that installs it, and no paid plans are offered.] You fund the cashback you give. For Shopify stores created on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit.

If anything is unclear, reply to this email and we'll help.

Reply "stop" at any time and we won't contact you again.

Kind regards,
The RewardsPro team
```
Once a shop installs, everything about it reaches us through Shopify and is used only to run the app, never for
outreach (PPA 2.1.2; Part A s.9.14).

### 5.7 Reply to a no, or to "stop"

**NO** · 46 words, then the signature with nothing else: no link, no product line, no "if you change your mind".
After a bare "stop", sending nothing is also fine; either way the shop is suppressed the same day on every route.
```text
Hello,

Thank you for letting us know. We won't contact you again. Within 7 days we'll delete what we hold about your shop, except your web address, which stays on our do-not-contact list so that we don't contact you by mistake.

Kind regards,
The RewardsPro team
```

### 5.8 Claim map: every factual sentence in the email set

Sayable: only `verified` rows from `wf8/fit.md` §8.1. To a shop with a subscribe option, `sh-sc-subscriptions`* and
`rp-no-order-rules`* go with any earning sentence (wf8 G2). BODY-B, YES-TRY and BO-PARA carry both for every shop
(§5.3). Rows marked * need a new row before use (§7).

| Message | Sentence (short) | Claim ids |
|---|---|---|
| Subjects | S1, S2 / S3 | `rp-maker`, `rp-purpose`* / `rp-maker`, `rp-store-credit`, `rp-purpose`* |
| A, B | We're Cambridge TCG Limited, makers of RewardsPro, an app for Shopify stores. | `co-details`*, `rp-maker`, `rp-on-app-store` (the company "we": STRATEGY §4 and `rp-maker`'s scope; a person signing is O4 and needs the owner's exception) |
| Card | For transparency, we also sell trading cards. | `rp-maker-also-sells`* |
| A, B | We're writing because [observation]. | per-send record `obs-shop` (private, never in git) |
| A, B | We found this address on your [page] page on [date]. | per-send record `src-address` (Art 14(2)(f)) |
| B | RewardsPro is built for rewarding loyal customers with store credit in your own shop. | `rp-purpose`* (intent), `rp-merchant-funds` |
| B | When an order is paid, it adds cashback to the customer's store credit at the rate you set for their VIP tier. | `rp-paid-trigger`, `rp-store-credit`, `rp-vip-tiers` |
| B | You set the tiers by spend, and you fund the credit. | `rp-vip-tiers`, `rp-merchant-funds` |
| B | Customers can redeem the credit when signed in with Shopify's new customer accounts (not legacy accounts) or Shop Pay, and the full balance held in the checkout's currency applies. | `sh-sc-signin-legacy`, `sh-sc-full`, `sh-sc-currency` |
| B | Two limits: Shopify doesn't let store credit pay subscription renewals, | `sh-sc-subscriptions`* (wf8 `fit.md` §8.3: "…the first purchase of a subscription, but not its recurring bills") |
| B | and each tier has one cashback rate, with no setting to exclude products, collections or sales channels. | `rp-no-order-rules`* (wf8 `fit.md` §8.3: "…no setting to leave out renewals, products, collections or sales channels"); the no-setting half only (§7) |
| A, B | It has no reviews yet / The app has no reviews yet | `rp-no-reviews`* |
| B | and it offers no reward types other than cashback and VIP tiers. | `rp-scope` |
| A | RewardsPro is built for shops that reward loyal customers. | `rp-purpose`* |
| A, B | There is nothing to install. | the ask (Now-1: no install ask) |
| A, B | At the end we'll ask whether you'd like to hear more about RewardsPro, and declining is fine. | `int-notes`* (the call's closing question, said in the first email: `email-rules.md` §1 part 9) |
| A, B | If you're not interested, there's no need to reply: we won't write again unless you do. | `out-one-message`* |
| All | Reply "stop" at any time and we won't contact you again. | `out-stop-honoured`* |
| SIG | name, registration, number, registered office; contact@rewardspro.io | `co-details`* ("England and Wales" needs a primary record, §5.5), `rp-maker`, `rp-contact-delivers` |
| NOTICE | what we hold, why, basis, Google Workspace, 30 days, rights, complaints, link | `notice-live`*, `retention-numbers`*, `co-details`* |
| YES-CHAT | You can skip any question, and we won't record the call. At the end we'll ask… and declining is fine. | `int-notes`* |
| YES-CHAT | Our notes cover how the shop operates…; up to 12 months…; a copy. | `int-notes`*, `retention-numbers`* |
| YES-CHAT | If the call doesn't go ahead, we delete your details 30 days after our last message. | `retention-numbers`* |
| YES-CHAT | Details: [privacy notice link]#interview-notes | `ppl-notice`* |
| YES-TRY | You can install RewardsPro from its listing on the Shopify App Store: [listing link]. | `rp-app-store-listed`*, `rp-live-release` |
| YES-TRY | When you open it, Home has a setup card with three steps: … | `rp-setup-steps` |
| YES-TRY | Once installed, it also brings in your recent past orders, so customers start in the right tier. Past orders earn no cashback. | `rp-import-past`, without its "up to 12 months", which holds only where Shopify grants `read_all_orders` (STRATEGY never-say 6 holds "12 months of past orders count"); "Once installed" for the row's "When you first open RewardsPro" needs adopting as a variant (§7) |
| YES-TRY | While cashback is on, the widget shows signed-in customers their tier, store credit and progress. | `rp-widget` |
| YES-TRY | For customers to spend their credit, your store needs…, and Home warns you when Shopify shows one of these still needs doing. | `rp-home-spend-check`*, `sh-sc-signin-legacy` |
| YES-TRY | Shopify's help page also says to activate the Apply store credit option in the checkout's Payments section. | `sh-sc-checkout-option`* |
| YES-TRY | Customers then choose Apply store credit at checkout, signed in or with Shop Pay, and use the full balance held in the checkout's currency, not part of it. | `sh-sc-signin-legacy`, `sh-sc-full`, `sh-sc-currency` |
| YES-TRY | Please note: cashback is paid on the product price after discounts. Shipping, and anything paid with store credit or gift cards, earns nothing. | `rp-cashback-base` |
| YES-TRY | A refund takes back its share of the cashback, from store credit the customer still holds. | `rp-refund-takeback` |
| YES-TRY | Each tier has one cashback rate, with no setting to exclude products, collections or sales channels, | `rp-no-order-rules`* |
| YES-TRY | and Shopify doesn't let store credit pay subscription renewals. | `sh-sc-subscriptions`* |
| YES-TRY | [gated] RewardsPro is free for every store that installs it, and no paid plans are offered. | `rp-free` |
| YES-TRY | You fund the cashback you give. | `rp-merchant-funds` |
| YES-TRY | For Shopify stores created on or after 12 May 2025, Shopify charges third-party transaction fees… | `sh-sc-fee` (its exact sentence) |
| YES-TRY | If anything is unclear, reply to this email and we'll help. | `rp-contact-delivers` |
| NO | We won't contact you again. | `out-stop-honoured`* |
| NO | Within 7 days we'll delete…, except your web address, which stays on our do-not-contact list… | `retention-numbers`* |

No id, on purpose: greetings, thanks and sign-offs, the asks ("We're asking for a 20-minute call…", "Would [day
and time]…"), "If neither works…", "We'd like to understand…", "Here is how to start", the labels "Two limits:"
and "Please note:", and the aim "the aim is an ecosystem around your shop". None states a fact.

### 5.9 The eleven mandatory parts (from `wf7/email-rules.md` §1): tick all, or don't send

| # | Part | Where it is met here | Rule |
|---|---|---|---|
| 1 | Commercial from the first glance | S1–S3 open with the sender; the body's first line names Cambridge TCG Limited and its app. No "Re:", no question hook, nothing posing as research: the call's closing product question is said in the first email | E-Commerce Regs regs 7–8; PECR reg 23(c) |
| 2 | Sender identity, not disguised | A `rewardspro.io` mailbox; SIG: name, England and Wales (confirmed from a primary record first, §5.5), 15680297, registered office as Companies House shows it on the send day | PECR reg 23(a); SI 2015/17 regs 24–25 |
| 3 | Why this shop | The dated observation in paragraph 1; nothing about the apps it uses, any individual customer or its sales figures (§5.3) | LIA B4; PIPELINE §2, §5 item 6 |
| 4 | Where the address came from | "We found this address on your [page] page on [date]", paragraph 1; URL, date and who looked kept in the private record | Art 14(2)(f) |
| 5 | Art 14 first layer | NOTICE: who, what, why, basis, Google Workspace, 30 days, rights, object, complain to us and to the Information Commission, link | Art 14(1)–(3); DPA 2018 s.164A |
| 6 | The stop line, its own paragraph | 'Reply "stop" at any time…', honoured the same day on every route | PECR reg 23(b); Art 21(4); **PPA 2.1.3(ii)** |
| 7 | Our contact information | SIG: contact@rewardspro.io and the registered office | **PPA 2.1.3(ii)** |
| 8 | Nothing implies Shopify | Shopify named only in "an app for Shopify stores" and its own rules; no logo, badge, "partner", "official" or "approved"; never in sender, subject or domain. An explicit "not from or on behalf of Shopify" line is optional (O16) | **PPA 2.1.3(iii)**, 2.1.4(v); Part C, C.2 §3 |
| 9 | One small ask, no pressure | One 20-minute call in both states, "There is nothing to install", "declining is fine", "no need to reply"; no deadline, statistic, gift, offer or discount | OUTREACH §4.5; PPA 2.1.4(ii), (vi) |
| 10 | Plain and untracked | Plain text, one recipient, by hand; no pixel, tracked link or attachment | PECR reg 6 |
| 11 | True, verified sentences only | Every id in §5.8 `verified`; "no reviews yet" said plainly, and not "new" (the listing shows a December 2025 launch); `rp-scope`'s limit without naming removed features; the limits beside the features (sign-in or Shop Pay to spend; no renewals; no setting to exclude products or channels); the card line first for card shops | BPMMR 2008 reg 3; PPA 2.1.4(iii) |

Plus, from the same brief: never an address received via Shopify (**PPA 2.1.2**, binding), and LIA Part B signed
before any of this data exists (UK GDPR legitimate interests).

### 5.10 Brand owners whose customers reorder (proposal, from wf9)

From `/Users/macair/Documents/rewardspro-research-2026-11-07/wf9/fit-message.md` §2–§8, an agents' proposal for
the owner's direction of 7 Nov, in his words: "我覺得搵有品牌嘅 最好自己管理quality control and product line" (merchants who
own their brand and, ideally, run their own quality control and product line). The audience is wf8's first segment (§5.1); own
brand is a preference within it until the interviews (wf8 F-3), checked from public pages by the owner (`wf9/signals.md`;
PIPELINE §4.1). The example brand is the fictional Example Roasters Ltd at example.com. **Nothing here can be sent
yet** (the gates at the end).

**Why it may suit them (hypotheses HB1–HB7, wf9 §2.2):** in a single-brand shop, credit that is spent goes on the
brand's own products [I], and owners who set their own prices can choose a rate. But one rate per tier applies to
every product [V, code @6bd092cb, per wf9], so the rate must suit the lowest-margin product. No production spend has
been observed, and nothing here says the credit brings customers back (wf9 §0). Their worries and the honest answers
(margin, brand control, an existing app, subscribe-and-save, guest checkout, make-to-order, stockists, marketplaces)
are wf9 §3; the wrong-fit list is wf9 §4. RewardsPro's owner says them in conversation until their rows are `verified`.

**Every angle (wf9 §5):** "free" never without "you fund the cashback", plus Shopify's fee sentence where the field
allows 300 characters or more; no outcome words (§4); no "only"; "Translate [the owner's] 'ecosystem' into the mechanism
(credit that can be spent back in the shop that gave it), never the word" (wf9 §5; this file differs, in the list
under "Can't send yet"). A opens the first email and B supports it; C is the reply when an owner raises brand
control.

**BO-A** (angle A, credit for your own shop; leads) · 142 characters, 26 words · `rp-scope` or `rp-store-credit`,
`rp-merchant-funds`, `sh-sc-signin-legacy`, `rp-free` (+ `sh-sc-fee`)
```text
Cashback as Shopify store credit in your own shop. Customers can spend it at your checkout when they sign in. Free app; you fund the cashback.
```
- For single-brand shops where every product is their own (HB5). Must carry the sign-in condition. Wrong if owners
  hear it as one more discount (HB4), or their buyers mostly don't sign in.
- Gated: "free" waits for `rp-free` and needs `sh-sc-fee` beside it (§4, stricter than the ledger's 300-character
  scope); how often outreach may name Shopify waits for wf9 F4 (O17). "When they sign in" is shorter than
  `sh-sc-signin-legacy` (new customer accounts or Shop Pay); use the row's words where there is room.

**BO-B** (angle B, tiers on your terms) · 248 characters, 46 words · `rp-vip-tiers` (+ `rp-tier-names`*
for naming), `rp-import-past`, `rp-tier-lock`
```text
Name your tiers and set each one's minimum spend and cashback rate. Once installed, the app brings in orders from up to 12 months before install, so customers start in the right tier. Past orders earn no cashback. You can lock a customer to a tier.
```
- For consumables brands with known reorderers (HB3). Must carry "up to 12 months", never "12 months of past orders
  count" (never-say 6), and the row's own limit, "Past orders earn no cashback." Wrong if they need points,
  referrals or per-product rates.
- Recut on 7 Nov: the import happens once, on the first open after install (`rp-import-past`'s scope). "Once
  installed" says that without "first", which never-say 3 blocks mechanically; an earlier "When you open the app"
  read as every open. "So customers start in the right tier" is the row's own wording, in place of "place your
  regulars". `rp-tier-window` is no longer tagged: no words here use its window.

**BO-C** (angle C, your shop in front; a reply, not yet first contact) · 134 characters, 23 words ·
`rp-widget-look`*, `rp-widget-unbranded`*, `rp-no-own-email`
```text
The widget uses your theme's font and the accent colour you pick, and doesn't show our name. RewardsPro sends your customers no email.
```
- Must not say "matches your theme", "your brand colours", "white-label" or "no theme changes" (never-say 5). Wrong
  if they want the widget inline or fully restyled.
- Out of the box the widget wears RewardsPro's navy `#1A3E5C` and teal `#17BEBB`, and its text colours are fixed
  (wf9 F1). C goes into first contact only once its rows exist and RewardsPro's owner has decided the defaults (ROADMAP Pre-3), with
  `rp-no-own-email` in its narrowed wording after the data-request email decision (ROADMAP Now-5).

**BO-PARA** (the first-email paragraph for a brand owner: wf9 §6, rewritten on 7 Nov in the business register with
this file's rules applied, for MESSAGES M-A steps 2–5; the superscripts number the tag table below) · 1244
characters, 215 words
```text
We're Cambridge TCG Limited, a UK company, and we make RewardsPro, an app for Shopify stores.¹ Your About page says you roast and pack every batch in your own roastery (seen [date, under 30 days before sending]).² RewardsPro pays cashback as Shopify store credit and runs VIP tiers by spend, for rewarding loyal customers; you name each tier and set its minimum spend and cashback rate.³ The cashback is store credit in your own shop; customers can spend it at your checkout when signed in with new customer accounts or Shop Pay.⁴ Each tier has one cashback rate, with no setting to exclude products, collections or sales channels, and Shopify doesn't let store credit pay subscription renewals.⁵ RewardsPro is free for every store that installs it, and no paid plans are offered. You fund the cashback you give. For Shopify stores created on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit.⁶ The widget your customers see uses your theme's font and an accent colour you pick, and doesn't show our name.⁷ The app has no reviews yet.⁸ We're asking for a 20-minute call, at a time that suits you, to learn how you handle reorders and loyal customers. There is nothing to install.⁹
```
wf9 put it at about 150 words; as written it is 215 (Python `split()`), over M-A's 120 because the cost sentence
and the two limits are mandatory. If it must be cut, sentence 7 goes first (wf9's widget sentence). Item 6 is
FREE-ADD word for word: `rp-free`'s and `sh-sc-fee`'s own sentences, as launch-posts §2.1 does for M1 ("no paid plans
are offered" offers no plan rather than denying the two old paid agreements).

| # | Sentence | Claim ids | Ready? |
|---|---|---|---|
| 1 | Maker and compatibility, the company "we" | `rp-maker`, `rp-on-app-store` | Both list `outreach`; `rp-on-app-store` allows only "an app for Shopify stores" |
| 2 | The observation | per-send `obs-shop` (quoted, dated, under 30 days, from the shop's own page; PIPELINE §5) | Fictional here |
| 3 | Store credit and tiers, for rewarding loyal customers; you name and rate them | `rp-scope` (lists `outreach`); `rp-vip-tiers` (channel `outreach` to add); `rp-purpose`*; "you name each tier" needs `rp-tier-names`* or a wider `rp-vip-tiers` | No |
| 4 | Your own shop; can be spent at checkout when signed in | `rp-merchant-funds` (lists `outreach`); `sh-sc-signin-legacy` (channel `outreach` to add; re-fetch within 30 days) | No |
| 5 | Two limits: one rate per tier, no setting to exclude products, collections or sales channels; credit can't pay renewals | `rp-no-order-rules`*, `sh-sc-subscriptions`* (wf8 `fit.md` §8.3; both need a new row) | No |
| 6 | Free, you fund it, Shopify's fee (three sentences, FREE-ADD's) | `rp-free`, `rp-merchant-funds`, `sh-sc-fee` (all list `outreach`; their exact sentences) | No: `rp-free` stays unverified while two frozen paid charges stand |
| 7 | Widget look and no name | `rp-widget-look`*, `rp-widget-unbranded`*; `rp-widget` waits on gate C | No |
| 8 | No reviews yet | `rp-no-reviews`* (replaces wf9's `rp-new-no-reviews`, §7) | No |
| 9 | The ask | none (not a factual claim) | — |

**Can't send yet.** wf9's own gates (§6): the owner's answer to wf9 F4 (O17); G0, a production refund taking back its
share (`rp-shopify-deploy`, `rp-refund-takeback`); contact@ seen to deliver (`rp-contact-delivers`); the new rows
written by the claims maker and verified by a second session (§7); the listing cleaned, since a recipient who looks
the app up sees its tier products and old screenshots; for a brand that sells cards, games or collectibles, the
conflict-of-interest line first (D14). Plus this file's rules, which win where they differ (the 7 Nov rewrite
applies those marked "applied"):
- the company "we", not "I'm [first name]", unless the owner records the exception (O4): sentence 1 opens as BODY-A and BODY-B do
  (applied);
- a subject from §5.2, which names no Shopify (PPA 2.1.3(iii)). wf9's suggestion, "From Cambridge TCG Limited,
  makers of an app for Shopify stores: a question about your regulars", names it, so it isn't used;
- "new" isn't said (§5.9 part 11: the listing shows a December 2025 launch), so sentence 8 reads "The app has no
  reviews yet", `rp-no-reviews`* (applied; §7 replaces `rp-new-no-reviews`);
- "ecosystem": wf9 drops the word; this file allows it as the aim only, never as a fact (O3, D500-A, D500-B-ECO).
  None of §5.10's blocks uses it;
- "free": §4 is stricter than `rp-free`'s scope (the fee sentence only at 300 characters or more), so BO-A's "Free
  app" also needs `sh-sc-fee` beside it;
- the observation: BO-PARA's sentence 2 is about how the brand makes its product, where §5.3's "Filling it" asks for
  one about what the shop offers loyal customers or how it uses store credit. By this list, §5.3's rule holds until the owner
  widens it for brand owners (not applied: the fictional example stays wf9's);
- the two limits, for a shop with a subscribe option (wf8 G2): sentence 5 (applied);
- the eleven parts (§5.9), SIG and NOTICE (§5.5), and every item in §6.

---

## 6. What must be true before the first send

From `wf7/email-rules.md` §4. Agents check each item with evidence; the owner ticks it. Status as at 2026-11-07.

| # | Must hold | Status |
|---|---|---|
| W1 | The owner's decision recorded: his words verbatim, the date, that it covers email (and post, if he says so), in `approvals.jsonl` with a copy in `lia/` | Recorded in `approvals.jsonl`: 7 lines, of which lines 3–7 are his words of 2026-11-07 (cold email, the umbrella idea, the first focus, own brand, the term "loyal customers") [V, read 7 Nov]. The copy in `lia/` wasn't checked; post is O10. `kernel.toml` is unchanged; §8 holds the `[messaging]` table proposed for his okay |
| W2 | LIA Part A and Part B completed and signed (B2 rewritten for his decision: `email-rules.md` §5.4) | Drafts only |
| W3 | Privacy rows live: "businesses we contact" (`notice-live`*), "people who contact us" and "interview notes" (`ppl-notice`*) | Not live; the privacy page describes the old processors |
| W4 | ICO fee registration renewed, address updated | Expires 19 Dec 2026; due by Fri 11 Dec |
| W5 | One SPF, a 2048-bit Google DKIM key, one DMARC record, all passing | Two DMARC records, SPF permerror, no DKIM |
| W6 | contact@ tested from an outside address; replies read on working days, so a "stop" is honoured the same day (`rp-contact-delivers`) | Untested |
| W7 | Suppression list ready, with cross-route markers, checked before every send (`out-stop-honoured`*) | Doesn't exist |
| W8 | The Lane B record and its checks (PIPELINE §3.2, B3) | Not built |
| W9 | Per shop: §5.1's yes and never lists; entity check ≤7 days old; observation ≤30 days old; address source recorded; not a held Shopify-hosted page (§5.1's definition: if unsure, hosted); never-via-Shopify confirmed by RewardsPro's owner | Per send |
| W10 | Every claim id the version used carries is `verified`, with a second session concurring. State A: `rp-maker`, `rp-on-app-store`, `rp-purpose`*, `rp-no-reviews`*, `co-details`* (with "England and Wales" from a primary record), `notice-live`*, `retention-numbers`*, `out-one-message`*, `out-stop-honoured`*, `rp-contact-delivers`. State B adds G0 and every product row in §5.8. Rows used in email gain `outreach` in their channels (§7). `sh-*` rows re-checked within 30 days of each send | 0 of 36 verified; the starred rows don't exist |
| W11 | The ICO pages marked "under review" re-read within 30 days of the first send; the PPA's "Last updated" date re-checked | Due before the first batch |
| W12 | **Recommended, not a precondition:** the Shopify Partner Support question sent, with `email-rules.md` §6's two edits (a notice plus a question, not a request for permission); any answer saved with date and ticket number | Not sent |

**And:**
- **Timing and volume:** no shop contact before Mon 4 Jan 2027; at most 5 first emails a week and 10 in the
  phase; no first email to card shops while they are a held lane (wf8 F-2); one ask per shop across every
  route; no follow-up (D17 default).
- **Reviews:** no review ask in any email (the status line "It has no reviews yet" isn't one); the in-app sentence
  only, unless the owner picks the support-close line under wf8 F-14 (wf8 FOCUS §4; G5). FOCUS §7 words G5 as "No review
  wording in any email"; "ask" replaces "wording" so the status line can stay.
- **Naming Shopify (wf9 F4, O17):** until the owner answers, outreach names Shopify only to say the app works with Shopify
  stores, as BODY-A does. BODY-B and YES-TRY (Shopify's customer accounts, Shop Pay, the fee) and §5.10 wait for his
  answer [I: wf9 F4 asks about outreach in general].
- **Card shops:** the conflict line settled first (D14 / Pre-7, `rp-maker-also-sells`*).
- **Links:** rewardspro.io out of the signature until its home page is fixed; the try-it reply (YES-TRY) only once
  the listing's false text is gone. The first email offers no try (O5).
- **Stop rules, every route:** any complaint; 2 irritated replies in the first 10 emails; 10 emails bringing
  fewer than 1 conversation; a written "no" from Shopify (stops email until the owner decides again); any sign that an
  address came via Shopify (that row stops and is suppressed).

---

## 7. Rows to add (for the claims maker, who alone edits `claims.toml`)

| Proposed id | Proposed sentence | Kind | Locator or source | Limits |
|---|---|---|---|---|
| `rp-purpose` | "RewardsPro is made for rewarding a shop's loyal customers." (with his verb, U1-Y: "…for giving back to a shop's loyal customers.") | intent (a kind the ledger doesn't have yet; the claims maker decides whether intent needs a row) | The agents' wording of the owner's idea of 2026-11-07 (§0), pending his yes on the line (O1); his words are in `approvals.jsonl` lines 4 and 7 (W1). No code locator: a purpose, not a behaviour | Intent only. "Store credit in your own shop" is `rp-merchant-funds`' claim, not this row's. Always worded as what RewardsPro is for, never as a result ("reward loyal customers", never "reward their loyalty"); the ecosystem is named only as "the aim". Channels: landing, social-profile, social-post, outreach |
| `rp-credit-own-shop` | "The store credit RewardsPro gives is on the customer's account in your shop, so it is redeemable in your shop." (the copy's wording since 7 Nov; it was "…so when it's spent, it's spent in your shop.") | product-behaviour | `apps/rewards/app/shopify/store-credit-rail.server.ts:276` (`createStoreCreditRail(admin)`), `:304-307` (credit to `gid://shopify/Customer/<id>` with `creditAmount` and `notify`) @6bd092cb, sha256 `3f47ec43…7c62` [V]; `app/routes/webhooks.orders.paid.tsx:58`; the Help Center capture the `sh-*` rows hold (sha256 `0a002097…f309`): "available as a payment method only on your online store, Point of Sale (POS), and Shop" | "Not in other shops" is [I] from the per-store customer account; no Shopify sentence says it in those words. Fallback: `rp-merchant-funds` alone. Never "never expires", never POS earning. Distinct from MESSAGES §3's `rp-credit-stays` (leaving and data) |
| `rp-no-expiry` (optional) | "RewardsPro sets no expiry date on the credit it gives." | product-behaviour | `store-credit-rail.server.ts:306-307` @6bd092cb: no `expiresAt` [V]; already in `rp-merchant-funds`' uncertainties | A refund still takes its share; the merchant can lower a balance in Shopify admin |
| `rp-no-reviews` (replaces MESSAGES §3's `rp-new-no-reviews`) | "RewardsPro has no reviews yet." | status | Listing capture `claims-fetch/listing.html`, sha256 `126aa3b4…7877` ("(0 Reviews)", "No reviews yet"); ROADMAP §1 | Re-checked every send week from a person's look or the owner's paste, never a script on apps.shopify.com. Contrary evidence against "new", so it isn't said: the same capture shows "Launched December 16, 2025", and the old app had real stores, two still holding paid charges (`rp-free` contrary evidence; `switch.md:267` @6bd092cb). What is new is the rebuild (`switch.md:64-89` @6bd092cb), a separate sentence that would need its own row |
| `co-details` | "Cambridge TCG Limited, registered in England and Wales, company no. 15680297; registered office as Companies House shows it." | status | Companies House capture sha256 `b2526c43…406f` (an `rp-maker` source): the office, "Private limited Company", "Incorporated on 25 April 2024"; no jurisdiction text. MISSING: a primary record for "England and Wales" (the certificate of incorporation or the filing history), needed before W10 | Re-read on the send day. "England and Wales" is [I] (the London office; a number with no SC or NI prefix) until that record is read |
| `rp-maker-also-sells` | "Cambridge TCG Limited also sells trading cards." (replaces `coi-sells-cards`) | status | Partial: the Companies House capture (sha256 `b2526c43…406f`) lists SIC 47650 "Retail sale of games and toys in specialised stores" and 47910 "Retail sale via mail order houses or via Internet"; `social/STRATEGY.md:224`: "Cambridge TCG sells on eBay and Cardmarket only (design README, the owner 2026-10-20)". SIC codes are declared activities, not sales [I]; still MISSING: a record tying actual card sales to the company | Wording and use are the owner's (D14 / D-maker / Pre-7; STRATEGY H4) |
| `notice-live` | The "businesses we contact" privacy row exists and says what NOTICE says | status | MISSING: the live page and its sha256 (W3) | Blocks every send |
| `ppl-notice` | The privacy rows for people who contact us and for interview notes | status | MISSING (L-gate (e)) | |
| `int-notes` | "You can skip any question; calls aren't recorded; notes are about how the shop runs, kept up to 12 months or less on request, with a copy on request." | process | MESSAGES §2.4; INTERVIEW-GUIDE; PIPELINE §6.1 | The interview-notes row live |
| `retention-numbers` | 30 days after a first email with no reply, keeping the web address and month; 7 days after a no, keeping the web address; 30 days after the last message if no chat; 6 months after a chat; notes up to 12 months | process | PIPELINE §6.1 (proposal) | The owner's D6. If he chooses a follow-up, NOTICE changes first |
| `out-one-message` | "We write to a shop once and won't write again unless it replies." (merges `out-one-ask` and PIPELINE `one_ask_only`) | process | PIPELINE §5 item 12; LIA B3, B5; `email-rules.md` §3.2 | True only while no follow-up is chosen (D17) |
| `out-stop-honoured` | "A 'stop' or a no on any route puts the shop on our suppression list the same day, for every route." (merges `prog-stop-honoured`) | process | PIPELINE §5, §6.2; LIA B6 | True only while the list exists and is checked (W7) |
| `rp-home-spend-check` | "RewardsPro's Home warns you when Shopify shows buyers can't spend their store credit yet: store credit is off, the store uses legacy customer accounts, or sign-in links are hidden." (merges `rp-home-spend-warning`, `rp-spend-setup`) | product-behaviour | `apps/rewards/app/admin/home-rules.ts:183-187` (`SPEND_PROBLEMS`), `:206-213` (the banner "Buyers can't spend their store credit yet: …", only when a problem is found) @6bd092cb, sha256 `1b3639ea…577e` [V]; `app/shopify/shop-checks.server.ts:96-103` (the three checks; `unknown` when Shopify's answers are incomplete) and `app/routes/app._index.tsx:537` (the Running check) @6bd092cb [V] | When Shopify doesn't fully answer, Home shows "Store credit: Shopify didn't say" and no banner. It doesn't check the checkout's Apply store credit option (`sh-sc-checkout-option`*). Not yet seen on a dev store |
| `sh-sc-checkout-option` | Shopify's store-credit help page says: "In the Payments section of the Shopify Checkout, activate the Apply store credit option". | status (Shopify's text) | Help Center capture `claims-fetch/sc.html`, sha256 `0a002097…f309`; the same sentence is quoted in `rp-setup-steps`' source (sha256 `83d484a4…8dbb`) | Whether this is a merchant setting or the customer's choice at checkout isn't clear from the page [U] ("The customer can select Apply store credit", same page), so it is attributed to Shopify's page, never told as our step. Re-checked with the other `sh-*` rows |
| `sh-sc-subscriptions` (wf8 `fit.md` §8.3's row, now used in copy) | "Shopify lets store credit pay for the first purchase of a subscription, but not its recurring bills." Copy uses the shorter "Shopify doesn't let store credit pay subscription renewals." | status (Shopify's text) | help.shopify.com store-credit page, wf8 capture (12:06 UTC, 7 Nov): "not towards recurring subscription bills" | Needs a new row, with the copy's wording adopted as a variant or the row's own sentence used. Alternative: widen `sh-sc-channels`, whose uncertainties already hold "not towards recurring subscription bills (the first purchase is fine)" [V, `claims.toml`], so the fact may need no row of its own (the claims maker's call). Re-checked with the other `sh-*` rows. STRATEGY never-say 8's "subscriptions" needs a G4 checker exception for this phrase (§4) |
| `rp-no-order-rules` (wf8 `fit.md` §8.3's row, now used in copy) | "Every paid order with a customer earns at that customer's tier rate; there's no setting to leave out renewals, products, collections or sales channels." Copy uses "each tier has one cashback rate, with no setting to exclude products, collections or sales channels." | product-behaviour (negative) | wf8 `fit.md` §8.3; wf9 §7 (no collection or product-type rule in `tiers.server.ts`, `order-facts.ts`, `record-order.server.ts` @6bd092cb); no `sourceName` read anywhere in `apps/rewards/app` @6bd092cb, so no channel filter [V, `git grep`] | Needs a new row and a guard test. The copy uses only the no-setting half. The first half is wider than the code: gift-card lines earn nothing (`order-source.server.ts:238` @6bd092cb [V]; `rp-cashback-base`), and POS earning has never been observed (`sh-sc-channels`). So the copy never says "every paid order", "every product" or "no exclusions", and nothing about POS earning |
| `rp-import-past` (existing row: wording variant only) | Copy (BO-B, YES-TRY) says "Once installed, …" for the row's "When you first open RewardsPro, …" | variant | The row's scope: "on the first open after install" | Never-say 3 blocks "first" mechanically, and "When you open the app" read as every open. The claims maker adopts "Once installed" as a variant, or the copy goes back to the row's words with the hit accepted. `social/content/replies.md` R-HELD-PAST keeps the row's own sentence until then |
| `rp-app-store-listed` | "RewardsPro is listed on the Shopify App Store." | status | A person's look at the listing, or the owner's paste; `rp-on-app-store`'s second uncertainty (badge guidelines name websites and email) | Email and landing only, never social; only once the listing's false text is gone |

**Not rows:** `src-address` and `obs-shop` are per-send records in the owner's private store (PIPELINE §3). Prospect data
never enters git.

**Existing rows that need `outreach` added to their channels** (the email set uses them) [V, channels read from
`claims.toml`]: `rp-store-credit`, `rp-vip-tiers`, `rp-paid-trigger`, `rp-refund-takeback`, `rp-widget`,
`rp-setup-steps`, `rp-cashback-base`, `rp-live-release`, `sh-sc-signin-legacy`, `sh-sc-full`, `sh-sc-currency`.

**Also proposed, for the same claims maker:** `wf8/fit.md` §8.3's ten rows, the two above first (the copy now
carries them), before any shop is approached (wf8 F-11); and `wf9/fit-message.md` §7's rows for §5.10
(`rp-widget-look`, `rp-widget-unbranded`, `rp-tier-names`, `rp-home-stats`, `rp-credit-stays`, `rp-no-shopper-names`,
`sh-sc-b2b`), with wf8's ids winning where they overlap and `rp-no-reviews` (above) in place of `rp-new-no-reviews`.
If §5.10's angles reach first contact, `outreach` also goes on `rp-tier-window`, `rp-tier-lock`, `rp-no-own-email`
and `sh-sc-channels`. `rp-design-partner-offer` names "a few UK shops" and its D10 note ties it to card and
collectibles shops, so its scope needs rewording before any brand owner hears it (wf9 §7).

---

## 8. Open points for the owner

| # | Point | Proposed default |
|---|---|---|
| O1 | The umbrella line: U1 ("Reward loyal customers with store credit in your own shop.", business register) or U1-Y ("Give back to your loyal customers, with store credit in your own shop.", the agents' line built on your verb and term) | Yours; both carry the same ids and wait for state B, after G0 (§1). Agents recommend U1 for the business register. UA in state A. U1-Y no longer says "stays in your shop", which could be read as a promise about time |
| O2 | "Regulars" or "loyal customers" through the set | **Decided 7 Nov:** "loyal customers", in a business register (`approvals.jsonl`, `rp-term-loyal-customers`). Applied here, in entity-card rule 1, `social/profiles.md` (PU0), `social/content/replies.md`, DESIGN.md (Voice) and ROADMAP §2 |
| O3 | "Ecosystem": your word, as the aim | D500-B-ECO carries it at equal weight with D500-B, and D500-A as its aim sentence; usable wherever "the aim is…" fits, never as a fact |
| O4 | Who signs: the company "we" or a person ("I'm [first name]…") | The company "we" (STRATEGY §4; `rp-maker`'s scope). A person reads more personally but departs from both, so it needs your recorded exception (`rp-maker`'s one exception today is your Community bio) |
| O5 | The first email's ask: a chat only, or a chat or a try (state B) | A chat only, in both states (ROADMAP Now-1: "no install ask"; `email-rules.md` part 9); a try only in YES-TRY, when a shop asks. Adding the try departs from Now-1 and needs your word |
| O6 | The card-shop line, and whether to say it while STRATEGY H4 holds (D14 / D-maker / Pre-7) | Say it first, in his settled words |
| O7 | Record his words in `approvals.jsonl` (W1) | Done 7 Nov: lines 3–7 hold them verbatim [V]; the copy in `lia/` is still to check (W1) |
| O8 | D-src: addresses seen only on a Shopify-hosted storefront | Held until Shopify answers question 3; his word after Fri 18 Dec |
| O9 | D17: one follow-up after 14 days | None |
| O10 | Letters: does his word cover post? | Not assumed |
| O11 | D7: named-person addresses | Never |
| O12 | D6: the retention numbers in NOTICE and the replies | PIPELINE §6.1's |
| O13 | D4 and Now-4: "free" and the two frozen paid charges | "Free" stays out until `rp-free` can be verified |
| O14 | The two edits to the Shopify question, and whether to promise "we will stop" | Both edits; the promise only if he'd honour it |
| O15 | Company number in the first line as well as the signature | Signature only |
| O16 | An explicit "not from or on behalf of Shopify" line in the signature | Left out: PPA 2.1.3(iii) asks only that nothing implies Shopify |
| O17 | wf9 F4: may outreach name Shopify's own features and fees (store credit, Shop Pay, the third-party fee) under PPA Part C, C.2 §3, or name Shopify only to say the app works with Shopify stores, as wf5 reads it? `rp-free`'s scope needs the fee sentence wherever "free" appears in 300 characters or more, so the two pull apart | No default (wf9 leaves it to you). §5.9 part 8 reads Shopify's own rules as sayable, but until you answer, BODY-B, YES-TRY and §5.10, which name Shopify's accounts, Shop Pay or fee [I], aren't used (§6) |

**Proposed `kernel.toml` `[messaging]` table (text only: not applied).** `kernel.toml` stays as it was (sha256
`3ca10d69…3f22`, the hash the 26 image metas record) until the owner okays a kernel change and W1 holds. Then this table
would replace the comment that keeps `[messaging]` empty. `umbrella_line` holds U1 as proposed and goes in only
once he picks a line (O1); if he picks U1-Y, the two lines swap:
```toml
[messaging]
# Approved by the owner on <date> (approvals.jsonl line <n>). Source: marketing/MESSAGING.md.
# owner_words are his, verbatim as typed (his lowercase "rewardspro" and "a ecosystem" included): a record, not copy.
owner_words = "Emailing business directly is fine. But give it a warmer touch, on what rewardspro is. A credit system to give back to customers who are loyal, so that a ecosystem can be built."
owner_words_date = "2026-11-07"
# His later words the same day set the term and the register (approvals.jsonl line 7, rp-term-loyal-customers).
owner_words_register = "用loyal customers, take a more business approach on wordings."
customer_term = "loyal customers"   # never "regulars"
register = "business"
umbrella_line = "Reward loyal customers with store credit in your own shop."
umbrella_line_alt = "Give back to your loyal customers, with store credit in your own shop."
```

---

## 9. Checks run

- **Counts:** every count in this file was recomputed from the blocks in this file by
  `/Users/macair/Documents/rewardspro-research-2026-11-07/wf7/tools/verify.py` (run as `python3 -I …`; it writes
  only next to itself), which reads each block and checks the label above it. After the 7 Nov business-register
  revision and the corrections from its two reviews, it reports ALL OK for all 29 blocks and both card variants. YES-TRY's "with the free sentence" count
  strips only the gate note's own words. Filled counts use this fill: `[Example Cards]` = "Example Cards", `[page]`
  = "Contact us", `[date]` = "3 November 2026", and the observation "your 'sell to us' page offers more in store
  credit than in cash (seen 3 November)" (16 words). Character limits held: D100-A 98 and D100-B 95 (limit 100),
  D160-A 138 and D160-B 151 (limit 160; card target 155), D500-A 225, D500-B 491 and D500-B-ECO 491 (limit 500).
- **Words:** the same script scans every copy block and every quoted line in §3 for the banned spellings, love,
  family, bless, kingdom, citizen, loyal, community, ecosystem, points, raffle, mystery, instant, journey, delight,
  seamless, boost, grow, retention, repeat, "coming back", "come back", only, first, best, most, leading, free,
  "#1" and "!" (whole words, case-insensitive; the banned spellings case-sensitive). Hits after the 7 Nov revision:
  "loyal" in every block that carries the owner's term "loyal customers" (approved, §0 item 3) and in one §3 line;
  "ecosystem" in D500-A and D500-B-ECO (the owner's word, as the aim, O3); "free" in FREE-ADD, YES-TRY's gated slot, BO-A
  and BO-PARA (all gated on `rp-free`). Nothing else: no "first" (BO-B and YES-TRY say "Once installed", §7), no
  "repeat", no "!". The scan doesn't list "regulars"; `/usr/bin/grep -c -i regular` on the copy blocks the script
  extracts (`copy.txt` next to it) gives 0, and `/usr/bin/grep -c -i first` gives 0.
- **Register:** the script's word list has no jargon, chatty phrases, "regulars" or "subscription" (§4), so the
  business register (short declarative sentences, no "we'd love", no asides, the limits beside the features) was
  checked by reading each block, not by the script [I: a reading, not a test].
- **Review corrections (7 Nov):** the no-exclusions limit now says what the merchant can't set (gift-card lines
  earn nothing: `apps/rewards/app/shopify/order-source.server.ts:238` @6bd092cb, sha256 `9d6e130c…213c`, and no
  `sourceName` is read anywhere in `apps/rewards/app`, by `git grep` [V]); U1, U1-Y, U2 and D500-A no longer offer
  the store-credit mechanism in state A; U1-Y is labelled as the agents' line on the owner's verb and term; BO-B and
  YES-TRY state the import as a one-time event; "held" is back in the currency clauses; the purpose phrase sits
  next to the app in ONE-A, D100-A and D500-B; BO-PARA uses the ledger's free and fee sentences.
- **Code locators** re-read with `git show origin/main:…` in `/Users/macair/worktrees/rewardspro-main-ro` at
  6bd092cb: `home-rules.ts` (sha256 `1b3639ea…577e`), `store-credit-rail.server.ts` (sha256 `3f47ec43…7c62`),
  `en.default.json` lines 8 and 10, `shop-checks.server.ts:96-103` (sha256 `d953e673…2eb2`), `app._index.tsx:537`
  (sha256 `cf4faa27…82af`) and `lib/record-order.server.ts:61-69, 77-79, 92` (sha256 `73ec1f54…a192`) [V]. Captures re-hashed:
  `claims-fetch/listing.html` `126aa3b4…7877` ("Launched December 16, 2025", "No reviews yet"), `sc.html`
  `0a002097…f309`, `ch.html` `b2526c43…406f` (no jurisdiction text) [V].
- **Not done:** nothing sent, posted, published or merged; no network call; `claims.toml`, `kernel.toml` and
  `approvals.jsonl` not edited. `kernel.toml` restored to its bytes before this workflow (sha256 `3ca10d69…3f22`).
