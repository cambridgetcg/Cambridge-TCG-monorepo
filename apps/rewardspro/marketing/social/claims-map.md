# RewardsPro claims map

The agents' working map for the social kit, made 2026-11-07 by the Clerk (the claims maker) and revised the same day
by the claims fix maker after the verifier's findings. The ledger itself is [`../claims.toml`](../claims.toml). This
page says, for each row, what would verify it and which bios, posts and assets use it.

**Every row is `proposed`. None may appear on a live surface yet.** A row becomes `verified` only after its
evidence check and a second session's concurrence. Where the "What verifies it" column names a dev-store or
production check, that check must be recorded first.

**How to read the columns**

- **Evidence:** code paths are relative to `apps/rewards/` unless marked. They were read at origin/main 6f3a57b6 and
  hold unchanged at 6bd092cb (checked file by file). The exception is `docs/switch.md`, cited at 6bd092cb, whose
  switch record (`:64-90`) PR #153 added on 2026-11-07. Full locators, file hashes and fetch hashes are in the ledger.
- **What verifies it:**
  - Staging letters (A–O) are checks in `docs/staging-run.md`. They ran on the staging app with a local database
    on 2026-11-05, so they count as evidence but not as G0.
  - "B2 6.x" are steps of the production switch in `docs/switch.md`; their results are in the switch record.
  - "B3 4" is the release check, including gate C (390 px, signed in and guest, Light and Dark, cart drawer open,
    product page). The switch record has gate C only in part (`switch.md:88`).
  - "B4 A–P" are the spec 9.1 checks on rewardsprotesting, recorded in `docs/gates.md`. That file doesn't exist yet
    (absent at 6bd092cb).
  - "2nd session" means a different agent session repeats the check.
- **Used in:** the ids come from `STRATEGY.md`, `profiles.md` and `content/replies.md`:
  - S0 bios: R0, T0, A0 (A0c with the contact line), YT0 and CB. S2 bios: R1, T1 and L1. (profiles.md has since
    dropped CB, leaving the Community bio to the owner's own words, and added TK0, AI0, T1F, MK1 and YT1.)
  - Posts: M1, C1–C4 and M2. Reply templates: R-SUP-2, R-LEAVE, R-HELD-PAST, R-PTS-1.
  - Assets: A1–A14. V1 is the A11 recording.
  - "Listing" and "landing" are the S1/S2 rewrites, which are not social, and the "community" entries are the owner's own words.

## The map

| Claim id | Sentence | Status | Evidence | What verifies it | Used in |
|---|---|---|---|---|---|
| rp-maker | RewardsPro is made by Cambridge TCG Limited, London, UK. | proposed | Listing developer block, "London, GB" (GET 2026-11-07); Companies House 15680297, Active, registered office in London (GET 2026-11-07). The app names no maker. | 2nd session re-reads both pages. No dev store needed. CB's first-person "I make RewardsPro" also needs the owner's yes: the scope allows it only as his own disclosure in his own bio. | R0, T0, A0, YT0, CB (S0); R1, L1; H4 pillar; Ask & Offer replies. Not M2: its text names no maker. |
| rp-on-app-store | RewardsPro is an app for Shopify stores. | proposed | Listing HTTP 200 (2026-11-07); PPA Part C, C.2 §3 (compatibility only) and Part A §5.3 (no Shopify marks in names, social media or URLs without written permission), raw body re-read 12:33 UTC | 2nd session re-reads the listing and the two PPA sections. No dev store needed. | R0, T0, A0, YT0, CB (S0); R1, L1. **A0's "listed on the Shopify App Store" is not covered** (below). |
| rp-contact-delivers | Questions reach us at contact@rewardspro.io. | proposed | `app/routes/app.settings._index.tsx:16, 65-69`; the listing's support email attribute | The owner sends a test message from an outside address and sees it arrive (STRATEGY §13 step 10). | "Questions: contact@…" added to A0, YT0 and CB only after the test; L1; M2; landing; reply templates |
| rp-help-in-settings | In the app, Settings has a Help section with our address, contact@rewardspro.io. | proposed | `app/routes/app.settings._index.tsx:16, 65-69` | 2nd session reads the code; an A10 Settings frame. Travels with rp-contact-delivers. | R-SUP-2 |
| rp-live-release | The current version of RewardsPro is live for every store that installs it from the Shopify App Store. | proposed | B3 recorded: `rewardspromembership-217`, released by the owner on 2026-11-07, the embed updated in place (`docs/switch.md:83-89`). The listing's Data access equals `shopify.app.toml:46-49`. | 2nd session reads the switch record. Rests on rp-production-rebuild. On social, "from the Shopify App Store" falls under PPA §5.3 (rp-on-app-store). | M1 (first line, which leaves the App Store out); landing `/changes` |
| rp-production-rebuild | (Internal) Production serves the rebuilt app in apps/rewards. | proposed | The switch record, `docs/switch.md:64-82` (deploy commit 3eac13e5 built apps/rewards; Root Directory read back; test order #1010). PRs #150 and #152, quoted separately in the ledger. | 2nd session reads the record. Before each S2 post: the record and `GET /api/health` only, never the old app's routes (`switch.md:90`). | None public. Underpins M1, rp-live-release and every negative row |
| rp-shopify-deploy | (Internal, G0) A production test order earned store credit and a refund took back its share, on \<date\>. | proposed | Half recorded: test order #1010 credited £11.10 (`docs/switch.md:77`). **Missing:** a production refund; `docs/gates.md`. Staging B, E and F passed (staging only). | The owner's choice of G0 (D6): B4 A–P in gates.md, or the test order plus a refund on production | None public. G0 for S2 |
| rp-store-credit | RewardsPro pays cashback as Shopify store credit. | proposed | `app/shopify/store-credit-rail.server.ts:287-307`; `app/lib/record-order.server.ts:207-240`; staging B; **production B2 6.3: "Rewards Pro credited this customer £11.10 GBP"** (`docs/switch.md:77`). The old apps/rewardspro path is kept as superseded history. | 2nd session reads the record. If D6 makes B4 A–P the form of G0, B4 B too. | T1, L1, M1, C2; A5 (og.jpg subtitle), A6, A13; V1 captions; listing; landing |
| rp-paid-trigger | Cashback is added when an order is paid; it doesn't wait for the order to be fulfilled. | proposed | `app/routes/webhooks.orders.paid.tsx:1-13, 55-64`; `app/lib/record-order.server.ts:225-236`; `shopify.app.toml:21-44` (no orders/fulfilled; its route was deleted by #153); staging B; **production: orders/paid answered in 822 ms, credit within the same second** (`docs/switch.md:77, 298`) | 2nd session reads the record; B4 B if D6 picks B4. One order is not a timing promise: still no timing words. | L1, M1; A6 (M1 card); A12 thumbnail ("One paid order…"); V1 captions; listing |
| rp-vip-tiers | Set tiers by spend, each with its own cashback rate. Customers move between tiers as their spend changes. | proposed | `app/lib/tiers.server.ts:118-131, 221-260, 366-382, 508-515`; `app/routes/app.tiers.tsx:361-409`; `vercel.json:9` (02:00 UTC pass, ran on production, `switch.md:78`); staging A, G. Old paths kept as history. | B4 A and G. A downgrade has never been observed; add one to B4. **Needs G0.** | T1, L1, M1; A5 (og.jpg subtitle), A13; A10 Tiers frame; listing |
| rp-tier-window | Tiers count each customer's spend over the last 12 months, or over all time since RewardsPro started counting, which reaches back up to 12 months before install. | proposed | `app/admin/words.ts:34`; `prisma/schema.prisma:31-36, 147`; `app/lib/tiers.server.ts:62-109`; `app/shopify/bulk-import.server.ts:1-4, 36-39`; production import at 365 days (`docs/switch.md:75`) | A window change on rewardsprotesting (not among A–P; add it), plus B4 P for placement by past orders. **Needs G0.** | L1, M1; listing. Every file still carrying "the last 12 months or all time" needs the new wording (below). |
| rp-cashback-base | Cashback is paid on the product price after discounts. Shipping, and anything paid with store credit or gift cards, earns nothing. | proposed | `app/routes/app.tiers.tsx:354-357` (the app's own sentence); `app/lib/order-facts.ts:50-60, 80-97`; staging B, D | B4 B and D. The tax-exclusive order (`switch.md:262`) comes before any tax wording; tipped and edited orders (`switch.md:263`) before examples that use them. **Needs G0** (the verifier decides whether C1's staging example also needs production B). | L1, C1; A7 rule card; listing |
| rp-refund-takeback | A refund takes back its share of the cashback, from store credit the customer still holds. | proposed | `app/lib/refunds.server.ts:1-34`; `app/lib/order-facts.ts:99-120`; `app/lib/payouts.server.ts:122-154`; staging E, F and Step 5 | A production refund (G0), plus B4 E and F. **Needs G0.** | L1, M1; V1 captions; listing (Feature 3 candidate) |
| rp-tier-lock | You can lock a customer to a tier. | proposed | `app/lib/tiers.server.ts:262-285`; `app/routes/app.customers.$id.tsx:158-184` (strategy cited :165-170); only a recorded customer, on a store with tiers | A lock seen on rewardsprotesting. It's in neither staging nor A–P, so add it to the B4 run. **Needs a dev store.** | A10 customer panel frame ("Lock to a tier"); listing; landing |
| rp-setup-steps | RewardsPro's setup card has three steps: set a base cashback rate, switch cashback on, and turn on the widget in your theme editor. | proposed | `app/routes/app._index.tsx:362-411`; `app/admin/home-rules.ts:15-23, 183-187`; `docs/switch.md:204`; Shopify's store-credit settings page | A capture of the Home setup card for the A10 Home frame. Production did steps 1 and 2 by inference (test order earned 5%, `switch.md:77`). **Needs a dev store.** | A10 Home frame; H2 posts; listing; landing |
| rp-switch-off | You can switch cashback off in RewardsPro; orders still count towards tiers while it's off. | proposed | `app/admin/home-rules.ts:48-50`; `app/lib/record-order.server.ts:10-12, 68`; `app/routes/webhooks.orders.paid.tsx:55-64`; staging H | B4 H on rewardsprotesting. **Needs a dev store** (G0 in its B4 form covers it). | R-LEAVE (optional line) |
| rp-import-past | When you first open RewardsPro, it brings in your past orders, from up to 12 months before install, so customers start in the right tier. Past orders earn no cashback. | proposed | `app/shopify/bulk-import.server.ts:1-4, 36-39`; `app/routes/app._index.tsx:414`; `app/lib/import.server.ts:41`; `app/lib/record-order.server.ts:61`; `docs/switch.md:75, 188` | B4 P. Staging imported 0 orders, so placement from past orders has never been seen. **Needs a dev store.** | R-HELD-PAST (its "permission … we don't quote a number yet" can now say "up to 12 months") |
| rp-widget | While cashback is on, a widget you turn on in your theme editor shows signed-in customers their tier, cashback rate, store credit and progress, and shows guests your base rate and a sign-in prompt. | proposed | `extensions/rewards-widget/locales/en.default.json:2-15`; `extensions/rewards-widget/assets/rewards-widget.js:131-157, 163-177`; staging C (laptop only); B3 released it (`switch.md:85, 87`); gate C in part (`switch.md:88`) | The rest of gate C (390 px, Light, a product page), and a decision by the verifier or the owner that it counts; B4 C. **Needs gate C** (more than G0). | Widget posts, screenshots and video (S2); A10 widget frames; the L1 widget paragraph (added only once verified); listing |
| rp-review-ask | RewardsPro asks for a review only after your store's third cashback entry and at least seven days with the app, and stops once you dismiss it or Shopify has shown the request. Nothing is offered for a review. | proposed | `app/lib/stats.server.ts:224-245`; `app/routes/app._index.tsx:265-277, 189-197, 511-525`; `app/admin/home-rules.ts:42-45`; incentive grep = 0 | 2nd session reads the code. A guard test for "nothing offered" (agent PR; the owner merges). No dev store needed. | C3 (use this wording, not the strategy's "once"); landing |
| rp-merchant-funds | The cashback is store credit in your own shop, so you fund the cashback you give. | proposed | `app/shopify/store-credit-rail.server.ts:304-307`; help.shopify.com store-credit page (GET 2026-11-07) | 2nd session. No dev store needed. | Every "free": T1, L1, M1, M2; **A5: og.jpg's headline "Cashback your customers spend in your store"** (with sh-sc-signin-legacy and sh-sc-channels) and its subtitle after the kit rebuild; Ask & Offer replies; listing |
| rp-free | RewardsPro is free for every store that installs it, and no paid plans are offered. | proposed | Billing grep = 0 in apps/rewards; no plan, order-count, monthly or tier-count limit, but very large orders (more than 2,500 lines, 200 or more transactions, or 20 or more refunds) can't be read and earn nothing; listing Pricing "Free" (GET 2026-11-07); `docs/decisions/2026-10-20-rewardspro-free-only-relaunch.md` (reversible) | 2nd session re-runs the grep and re-reads the listing; the owner's D4; **and the two frozen paid charges cancelled, or the owner's written acceptance** (decision record :22-24; STRATEGY.md:506). No dev store needed. | T1, L1, M1, M2; A5 (og.jpg subtitle; fails the free-pair rule today); Ask & Offer replies; listing |
| rp-no-own-email | RewardsPro sends no email. One setting, off by default, asks Shopify to send its own store-credit email. | proposed | `app/routes/app.settings._index.tsx:48-57`; `prisma/schema.prisma:148`; `app/lib/payouts.server.ts:229-241`; mail-library grep = 0. Contrary: `switch.md:62, 269` plan an email to the shop owner when a real merchant arrives. | **RewardsPro's owner's data-request email decision first** (an S2 step), then a reword if he picks an email, then the guard test (agent PR; the owner merges), then a 2nd session. No dev store needed. | C4; A10 Settings frame; landing (privacy, subprocessors) |
| rp-no-chance | RewardsPro has no raffles, mystery boxes or instant wins. | proposed | Grep for raffle, mystery, instant win and chance = 0 in apps/rewards; spec non-goals. The old app had them **paused** (`apps/rewardspro/app/constants/chance-mechanics.ts:14`); since B3 a return to it is a new plan (`switch.md:216`). | A guard test, rp-production-rebuild, and the owner's D9 plus an amended G4 chance-word rule before any public use | Internal only: A9 corrections and ME-6 checks of AI answers, if the owner allows (D9) |
| rp-no-points | RewardsPro has no points or missions; it rewards with store credit only. | proposed | Points and missions grep = 0; spec non-goals. Contrary: `marketing/brand.json` description and rewardspro.io still say "points". | A guard test; D9 for public use | Internal; the brand-lane fix of brand.json and og.jpg (§7); A9 if D9 allows |
| rp-no-tier-products | RewardsPro doesn't sell tiers as products, memberships or subscriptions. | proposed | Product, selling-plan and purchase-option grep = 0; `shopify.app.toml:46-49` has no product scope; spec non-goal :51; the old tier products on rewardsprotesting deleted at B3 step 1 (`switch.md:84`). Contrary: the live listing still sells tiers as products. | A guard test; D9 for public use | Internal: the reason for the S1 listing cleanup (deleting false text needs no public claim) |
| rp-scope | RewardsPro pays cashback as Shopify store credit and runs VIP tiers by spend; it offers no other reward types. | proposed | `git grep` at 6bd092cb = 0 for every other reward type; `p1-truth.md` §5; spec non-goals | A guard test (agent PR; the owner merges); its positive half waits on rp-store-credit and rp-vip-tiers (G0). Names no removed feature, so no D9. | R-PTS-1 |
| sh-sc-signin-legacy | Customers can spend store credit at checkout when signed in with Shopify's new customer accounts or with Shop Pay; it isn't available for legacy customer accounts. | proposed | help.shopify.com store-credit page, GET 2026-11-07 (paraphrase; Shopify says both "customer accounts" and "the new customer accounts") | 2nd session re-fetches and compares the quote ≤30 days before use (review_after 2026-12-07) | L1, C2; A8; **A5 (og.jpg headline)**; listing |
| sh-sc-channels | Store credit can be spent on the online store, POS and Shop, but not on draft or edited orders. | proposed | same page (paraphrase; it also excludes B2B stores and recurring subscription bills) | As above. POS **earning** is never observed: C2 and A8 leave POS out. | C2; A8 ("Not on draft or edited orders"); **A5 (og.jpg headline)** |
| sh-sc-full | Shopify applies the full store-credit balance at checkout; customers can't choose part of it. | proposed | same page (close paraphrase of a verbatim sentence) | As above | L1, C2; A8 |
| sh-sc-currency | At checkout, Shopify shows only the store-credit balance in the checkout's currency. | proposed | same page (paraphrase) | As above. Never used as "works with multiple currencies" (B4 N is open). | No planned social use; reserve for landing and FAQ |
| sh-sc-cap | Shopify lets a store issue less than US$15,000 of store credit on a single customer account. | proposed | same page (close paraphrase of a verbatim sentence) | As above | No planned social use; landing and FAQ; one reason rp-free never says "unlimited" |
| sh-sc-fee | For Shopify stores created on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit. | proposed | store-credit page and the third-party transaction fees page, both GET 2026-11-07 (paraphrase; rate varies by plan; that page says fees don't apply to POS orders) | As above, both pages | L1, M1, M2 (any "free" field of 300+ characters); listing; replies' "the rate depends on your Shopify plan" |
| rp-ai-drafted | Posts here are drafted with AI help and checked by a person before we post them. | proposed | **Missing:** a review pack and approval record per post (none yet); `marketing/approvals.jsonl` | Holds per post: the pack plus the owner's recorded approval. Placement is the owner's D5. | L1 (About); YouTube and LinkedIn video descriptions (proposed) |
| rp-post-on-change | We post here when the app changes, and not otherwise. | proposed | STRATEGY.md §8 (milestones only; nothing posted to fill a slot). **Contrary:** §8 also counts "a held claim becoming verified" as a milestone, and C1–C4 aren't app changes. | Holds per post, like rp-ai-drafted. First the makers and the owner agree one sentence for profiles and posts (this, rp-post-cadence, or launch-posts' H0-LI); the others are withdrawn. | STRATEGY.md A0 and L1 (old wording). profiles.md has dropped it from A0 and uses rp-post-cadence in L1. |
| rp-post-cadence | We post here rarely: when the app changes or when we can show how it works. | proposed | STRATEGY.md §8 (milestones: "a merchant-visible change shipping, or a held claim becoming verified") | Holds per post, like rp-ai-drafted; the same one-sentence agreement as rp-post-on-change. | profiles.md L1 |
| rp-design-partner-offer | We set RewardsPro up with a few UK shops on a call, free as for everyone, with two feedback calls in the first six weeks. Our help never depends on a review. | proposed | **Missing:** the partner-terms page and the owner's answer on the PPA's marketing and email clauses (Part A §2 and §2.1) | The owner approves the terms and answers D8 (S3) | M2; partners page on rewardspro.io (S3) |

## What is safe before G0, and what waits

**These can be verified now, with no dev store.** A second session needs to agree for each:

- rp-maker and rp-on-app-store. These are the only rows the S0 bios (R0, T0, A0, YT0, CB) use, once A0 has no
  posting promise. The S0 texts can go on the reserved profiles, with the avatars and name-only banners A1–A4 (which make no claim), once
  both rows are `verified` **and** the owner has said yes to the handle plan and the S0 texts (STRATEGY.md §2, S0). Before
  that, three text fixes, which are the profile maker's and the owner's:
  - A0 drops "listed on the Shopify App Store", or Shopify gives written permission (PPA Part A §5.3).
  - STRATEGY.md's A0 still ends "We post here when the app changes, and not otherwise." (rp-post-on-change).
    profiles.md's A0 has already dropped it (profiles.md:60); STRATEGY.md is the strategy maker's to follow.
  - CB's "I make" needs the owner's own yes (rp-maker's scope).
- rp-merchant-funds and the six sh-* rows. The sh-* rows go stale after 30 days.
- rp-review-ask, with its guard test.
- rp-help-in-settings, which travels with rp-contact-delivers.
- rp-contact-delivers, after the owner's test message.
- rp-live-release and rp-production-rebuild: a second session reads the switch record (`switch.md:64-90`).
- rp-ai-drafted, and one of rp-post-on-change and rp-post-cadence: process rows that hold post by post.

**These have their evidence, but wait on a decision of the owner's:**

- rp-free: the two frozen paid charges cancelled, or the owner's written acceptance; and D4.
- rp-no-own-email: the data-request email decision. If he picks an email to the shop owner, the sentence changes
  before its guard test is written. Until then, C4 waits.

None of these opens posting. Under STRATEGY.md every post waits for S2: G0 recorded, the listing fixed, rewardspro.io
rewritten, the first-real-merchant steps done or accepted, and contact@ delivering. Verifying a claim early only
shortens the S2 sitting.

**Observed on production; the form of G0 decides the rest** (the owner's D6):

- rp-store-credit and rp-paid-trigger: one production test order credited 5% within the same second
  (`switch.md:77`). A second session reads the record. If D6 makes B4 A–P the form of G0, B4 B as well.

**These wait on G0** (a production refund, or B4 A–P, as the owner defines it in D6):

- rp-shopify-deploy itself (its refund half), rp-refund-takeback, rp-vip-tiers, rp-tier-window and rp-cashback-base.
- rp-tier-lock, rp-setup-steps, rp-switch-off and rp-import-past need an observation too: lock isn't among the B4
  checks, so it has to be added; setup needs the Home card captured; switch-off is B4 H; the import is B4 P.
- rp-scope's positive half, through rp-store-credit and rp-vip-tiers, plus its guard test.
- This covers T1, L1, M1, C1, V1, A5–A7, A10–A13, R-LEAVE, R-HELD-PAST, R-PTS-1 and the listing feature lines.

**These wait on more than G0:**

- rp-widget needs the rest of gate C (390 px, Light, a product page) and a call that it counts.
- rp-design-partner-offer needs S3: the partner terms and the PPA answer.
- rp-no-chance, rp-no-points and rp-no-tier-products need a guard test, plus the owner's D9 before any public use.

## Sentences changed on 2026-11-07 (second pass)

Character counts are code points, counted by script. Other makers' files still carry the old wording where noted;
they change their own files.

| Claim id | Old sentence (chars) | New sentence (chars) | Why | Still old in |
|---|---|---|---|---|
| rp-free | RewardsPro is free. There are no paid plans. (44) | RewardsPro is free for every store that installs it, and no paid plans are offered. (83) | Two old paid agreements still exist; the sentence offers no plan rather than denying them | STRATEGY.md §6.3; posts quote it loosely ("Free app, no paid plans"), which a verifier checks against the new row |
| rp-on-app-store | RewardsPro is an app for Shopify stores, on the Shopify App Store. (66) | RewardsPro is an app for Shopify stores. (40) | "On the Shopify App Store" isn't compatibility wording (PPA Part C, C.2 §3), and §5.3 bars Shopify marks in social media | STRATEGY.md:114 and profiles.md:56, 67 (A0, A0c: "listed on the Shopify App Store") |
| rp-tier-window | Tiers count each customer's spend over the last 12 months or all time. (70) | Tiers count each customer's spend over the last 12 months, or over all time since RewardsPro started counting, which reaches back up to 12 months before install. (161) | "All time" reaches back only to the import horizon | STRATEGY.md:130, 235, 259; profiles.md:88 and profiles.json (L1); content/launch-posts.md:116, 152, 343; entity-card.md:133, 142, 151; listing-delta.md:103 |
| rp-setup-steps | Setup is three steps: set a base cashback rate, switch cashback on, and turn on the widget in your theme editor. (112) | RewardsPro's setup card has three steps: set a base cashback rate, switch cashback on, and turn on the widget in your theme editor. (131) | The card has three steps; the whole setup can need more in Shopify admin | wherever H2 posts or the listing copy it |
| rp-widget | A widget you turn on in your theme editor shows signed-in customers their tier, cashback rate, store credit and progress; guests see your base rate and a sign-in prompt. (169) | While cashback is on, a widget you turn on in your theme editor shows signed-in customers their tier, cashback rate, store credit and progress, and shows guests your base rate and a sign-in prompt. (197) | The rate lines and the guest panel show only while cashback is on | the L1 widget paragraph, if drafted |

New rows (all `proposed`): rp-post-on-change (53), rp-post-cadence (75), rp-help-in-settings (80), rp-switch-off
(91, "towards"), rp-import-past (167) and rp-scope (110). The reply templates' suggested sentences were reworded to what the code supports; check
R-SUP-2 and R-HELD-PAST against the rows.

## Where the ledger differs from STRATEGY.md §6.3

- **rp-review-ask is reworded.** The code doesn't ask "once". While the request is due, every Home visit asks
  Shopify to show its review request and shows a card. This continues until the merchant dismisses it or Shopify
  answers `success` or `already-reviewed` (`app/routes/app._index.tsx:265-277`, `app/admin/home-rules.ts:43-44`).
  The seven days count from the store's first app open. C3 must use the ledger's sentence.
- **rp-free's open question is settled.** The rebuild has no plan, order-count, monthly or tier-count limit. Its
  other limits are job sizes per run, the widget's rate limit of 30 requests a minute per shopper, and per-order read
  limits: an order of more than 2,500 lines, 200 or more transactions or 20 or more refunds can't be read, so it
  earns nothing (`app/shopify/order-source.server.ts:44, 54, 56`). Never "unlimited".
- **rp-tier-lock's locator** is `app/routes/app.customers.$id.tsx:158-184`, not :165-170.
- **review_after.** The sh-\* rows have `review_after = "2026-12-07"` (30 days, as §6.3 asks). Every other row uses
  2027-02-07. The first three rows were written on 2026-10-20 with 2027-01-20; the Clerk moved them to 2027-02-07
  because every source was re-read on 2026-11-07. The ledger keeps the old date in a comment on each row.
- **Eleven rows are not in §6.3:** rp-contact-delivers, rp-production-rebuild, rp-no-chance, rp-no-points and
  rp-no-tier-products (the Clerk); rp-post-on-change, rp-post-cadence, rp-help-in-settings, rp-switch-off,
  rp-import-past and rp-scope (the second pass).
- **rp-paid-trigger notes an app-copy slip.** Home's sentence "On: every paid order earns cashback as store
  credit." (`app/admin/home-rules.ts:49`) overstates: test orders, cancelled orders, orders from before install,
  orders with no customer attached and orders paid fully with store credit (staging check D) earn nothing
  (`app/lib/record-order.server.ts:62-69, 92`). Never copy it into marketing. An agent PR could fix it in the app.

## Doubts not resolved

- **Guest checkouts.** Do Shopify guest checkouts carry a customer? The code records only orders with one
  (`app/lib/record-order.server.ts:12, 92`), and calls the others "guest orders". Shopify says every new buyer is
  added to the customer list (help.shopify.com/en/manual/customers, GET 2026-11-07), so an online guest checkout may
  well earn. Until a dev store shows it, no row says "guests don't earn" or "guests earn".
- **The import horizon for other stores.** Production's import on rewardsprotesting ran at 365 days
  (`docs/switch.md:75`). That every new install gets the same follows if Shopify's `read_all_orders` grant is per app
  [I]. The rows say "up to 12 months".
- **Production timing.** One test order: orders/paid in 822 ms and the credit in the same second. A delivery that
  renews the token first is still open (spec 9.2 row 7b). No row allows "instant" or "within seconds".
- **Tax-exclusive stores, POS earning, tipped and edited orders.** None has been observed. rp-cashback-base,
  rp-tier-window and sh-sc-channels are limited to match.
- **Raw fetches.** The raw copies of the 2026-11-07 fetches stayed in the session scratchpad. A verifier
  re-fetches and compares the quoted sentence. Shopify's help pages change markup between fetches, so their hashes
  won't match; the Partner Program Agreement's raw body hashed the same at 11:15, 12:04 and 12:33 UTC.
- **Whether production runs the rebuild** is now recorded (`docs/switch.md:64-82`). Since B3, going back to the old app
  is a new plan, not the rollback steps (`switch.md:216`); such a plan would make rp-no-own-email, rp-no-chance and
  rp-no-points false.
- **The 10:43 caller.** The switch record logs unsigned requests to the old app's routes at about 10:43 on 2026-11-07
  as "Seen, not ours" (`switch.md:90`). This workflow's phase-1 status probe made the same requests at 10:41 UTC
  [I, strong]. The owner can tell the switch session; agents don't probe those routes again.

## Requested rows not yet in the ledger (completeness check, 2026-11-07)

Other makers' files tag sentences with ids that `../claims.toml` doesn't have (36 rows at 12:58 UTC, none of these).
G1 fails every text carrying one until the claims maker adds a row or names an existing row that covers it. The
ids are the makers' suggestions; the claims maker alone edits the ledger.

| Requested id | Sentence or use | Asked for in | Note |
|---|---|---|---|
| rp-ai-drafted-video | "Video titles, descriptions and captions here are drafted with AI help and checked by a person before we post them." (YT1) | `profiles.md` §2.2, `profiles.json` | a variant or scope note on rp-ai-drafted; placement is the owner's D5 |
| rp-ai-drafted-profile | "The text on this page is drafted with AI help and checked by a person." (AI0, optional at S0) | `profiles.md` §2.1, `SETUP.md` 0.6 | only if the owner picks AI0 under D5 |
| rp-maker-also-sells | "Cambridge TCG Limited also sells trading cards." (MK1; entity-card E500-A-maker) | `profiles.md` §2.2, `entity-card.md` §2 and §8, `listing-delta.md` §4 | entity-card first called it rp-maker-other-sales; one id now. Waits on the owner's D-maker |
| rp-no-ai-data | the privacy page's narrowed AI sentence | `listing-delta.md` §4 (§6 row) | landing and privacy only |
| rp-cashback-example | the £600 / £60 / £10 / £540 / £27.00 example | `content/launch-posts.md` E1, CAR1 p3; `content/calendar.md`; `content/replies.md` §8 | **The A7 rule card draws these figures too**, but its gate (`assets/render.mjs`, claims rp-cashback-base and rp-store-credit) would drop the draft bands without this row |
| rp-refund-example | "refunding one of two items took back £13.50 of the £27.00 cashback" | `content/launch-posts.md` E6; `content/replies.md` §8 | from the planned G0 capture SH-6 |
| yu-relationship | The owner's own relationship to Cambridge TCG Limited, for his Community disclosure line | `content/community-rules.md` §3; `content/replies.md` §8 | internal, channel community; a personal-detail choice for the owner |
| (variant of rp-merchant-funds) | "You fund the cashback you give." / "You fund the cashback your customers earn" | H0-LI, M1, L1, T1/T1F, R-PARTNER | short forms; the full sentence states rp-store-credit's mechanism (`content/launch-posts.md` §1.1) |
| (extension of sh-sc-fee) | "The rate depends on your Shopify plan." | E2, R-FREE-1, CAR1 p8 | true on the fees page today; add it, or the clause goes |
| (channel of rp-post-cadence or rp-post-on-change) | H0-LI's posting line | `content/launch-posts.md` §1.3 | both rows are `social-profile` only, so neither covers a post yet; one sentence for profiles and posts is still to agree |
| (wording of sh-sc-signin-legacy) | "using Shop Pay" for the ledger's "with Shop Pay" | L-C2, CAR1 p7, the A8 card | Shopify's own word |
