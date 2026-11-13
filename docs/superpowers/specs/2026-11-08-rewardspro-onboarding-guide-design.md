# RewardsPro: the first-time setup guide

Design for a guided first run in the RewardsPro admin (`apps/rewards`). Brainstormed with Yu on 2026-11-08; mockups in the brainstorm companion (`artifacts-data/rewardspro-redesign/.superpowers/brainstorm/`, screens `onboarding-shape`, `tiers-step`, `go-live`). Package RP-24 of the work split. Status: **for Yu's approval.**

Marks used below: **(Yu)** is something Yu said or chose. **(call)** is a choice made while writing this, for Yu to check. Everything else is a fact about the code at `origin/main` 9efc2f34, with its file. Where the brainstorm mockups and this document differ, this document governs; the mockups hold only placeholder numbers and live on the Air, so nothing depends on them **(call)**.

## 1. Why

A merchant who installs RewardsPro may have never used store credit or tiers. Today the first open shows a three-step card on Home (type a base rate, switch cashback on, turn on the widget) that never says what store credit or a tier is (`app/routes/app._index.tsx:362-432`). Yu, picturing himself as that merchant: *"I have no idea of how credits and tiers work, so I want to be able to grasp the basic concepts and a guide to set up my first tier."* **(Yu)**

Success: by the end of the guide the merchant can say, in their own words, what store credit is and why it isn't a discount; has a ladder of three tiers they chose with their own store's numbers in front of them; and has cashback switched on. **(Yu)**

## 2. Goals, non-goals, anti-goals

**Goals**
- Teach two ideas before asking for anything **(Yu)**:
  1. Store credit is Shopify's own: a balance in the buyer's Shopify account, used at checkout. RewardsPro adds cashback to it.
  2. It is earned on this order and spent on a later one. It is not a discount: today's price stays the same.
- Help the merchant build three tiers, with their own past orders shown, and what those tiers would have given in store credit **(Yu)**.
- Get cashback switched on and the widget on, then let the merchant watch one order earn and give back credit **(Yu)**.

**Non-goals**
- No new settings, no new tier features (no fractional rates, no tier perks).
- The guide doesn't create, pay or refund orders itself (the app has no draft-order or order write scope, `shopify.app.toml:49`).
- No public help page or docs link (RP-09 owns `/help/`; Ruling 72 keeps docs links out of the admin until the docs describe this app).

**Anti-goals** (failures even if it works)
- A guide that traps the merchant: Shopify's guidance and Built for Shopify 4.2.2 say onboarding must not block the merchant's work and must go away once done.
- Any sentence the code doesn't make true (the marketing lane's claims rule, `apps/rewardspro/marketing/WORK.md` §1).
- A page that looks different from its neighbours (rebuild spec §4.1): Polaris only, brand colours only on tier and money visuals.

## 3. The flow

### 3.1 Shape **(Yu: option A)**
A page of its own in the embedded admin with three steps, one at a time, and a progress indicator: **How it works → Your tiers → Go live.** Nothing else competes for attention while it's open. "Finish later" is always visible and goes to Home **(call: required by Shopify's guidance; Yu's mockup had Back/Next only)**.

### 3.2 When it shows
- **First open:** a merchant with **no tiers yet** who opens the app lands on the guide instead of Home **(Yu, as amended by call below)**.
- **After "Finish later":** Home as it is today, and the guide **stays away from then on** **(Yu, 2026-11-08: "Lets go for what you recommended")**. "Finish later" is a server action that stamps a new `merchant.guide_dismissed_at` column; the gate reads it. This is the guide's one migration, which Yu applies from his own shell the way B2 applied the first ones (`apps/rewards/docs/switch.md`, B2 step 1). Home's existing setup card still offers the remaining steps, and Settings' "How RewardsPro works" reopens step 1, so nobody is stranded.
- **Done:** once the guide's "Switch cashback on" succeeds, the guide marks setup complete and never sends the merchant to it again, even if they pause cashback later **(call)**.
- **Reopen:** "How RewardsPro works" in Settings → Help opens step 1 for reading at any time, without sending anyone anywhere **(Yu: a link to reopen step 1; call: Settings, because Home's files are queued and the menu is fixed at five pages)**.

**(call)** on "when it shows": the approved outline said "until tiers are saved and cashback is on". Gating on *running* would resend a merchant to the guide every time they pause cashback, because nothing records that a store was ever switched on (`app/lib/merchant.server.ts:159-172`). So the gate is "no tiers yet", which is permanent once crossed (the lowest tier can't be deleted, `app/lib/tiers.server.ts:595`), and a merchant who saved tiers but left before switching on finishes from Home's card.

**Stores that already have tiers (call).** Steps 2 and 3 are for a store with no tiers, or with only the single first tier Home's old card makes ("Everyone", nothing above it) and cashback off. Any other store, including everyone reopening from Settings, sees step 1 only, with "Edit your tiers on the Tiers page" in place of Next. The guide never rewrites a live ladder.

**Three tiers (call; Yu said three).** The guide always saves exactly three. Fewer or more is the Tiers page's job, after the guide.

### 3.3 Step 1: How it works **(Yu)**
Two tiles side by side (stacked on a phone):
- **Store credit is Shopify's own.** A balance in the buyer's Shopify account, which they spend at checkout on a later order when signed in to their account. RewardsPro adds cashback to it when an order is paid. You can see a buyer's balance on their page in Shopify.
- **Earned now, spent next time.** Not a discount: the price of today's order stays the same. The credit gives the buyer a reason to come back.

A small worked example under the second tile: *Order £100 → £3 in store credit → spent on the next order* (in the store's currency, at the suggested base rate).

Final wording follows §5's rules; the lines above are the content, not the copy.

### 3.4 Step 2: Your tiers **(Yu: option B, plus A's cost line)**
- **A picture of where the store's buyers sit**: a bar chart of buyers by what they spent over the tier window (shop currency), from the orders the app brought in at install. Two vertical lines mark where tier 2 and tier 3 begin. Dragging a line moves that tier's start, and the three tiers update their buyer counts as it moves.
- **Three tiers beneath the picture**, each with a name, a rate and a starting spend, editable in place:
  - Tier 1, everyone starts here, **3%** **(Yu)**
  - Tier 2 from about **200**, **5%** **(Yu)**
  - Tier 3 from about **500**, **8%** **(Yu)**
  - Names: Bronze, Silver, Gold **(call: the mockups' placeholders; the app's own default today is "Everyone")**.
  - Starting spends are suggested from this store's data, not fixed at 200 and 500 **(Yu: "spending depends"; yes to tuning)**. See §4.4.
- **What it would have cost**, one line under the tiers: *at these rates, the orders you brought in would have earned buyers about £X in store credit*, with the period taken from the import (12 months, or 60 days if Shopify didn't grant older orders) **(Yu)**. Recomputed as the lines and rates change.
- **"Save tiers"** saves all three at once.
- **A store with no past orders** sees the three tiers without the picture or the cost line, with the suggested 200 and 500, and one plain sentence saying there are no past orders yet **(Yu: approved guess)**.
- **While past orders are still coming in** (the import usually runs during the first open), the tiers are usable straight away; the picture shows progress ("still bringing in your past orders") and appears when the import is done **(call)**. The fields start at the fallback starts, marked as suggestions; when the import finishes, any field the merchant hasn't touched moves to the store's own suggestion, and typed values are never overwritten by a refresh **(call)**.
- **Other import outcomes (call):** a failed import shows no picture and Home's own wording for it; a partial one shows the picture labelled with what it covers; with fewer than 20 buyers who spent anything, the picture shows but the starts fall back to the defaults, because percentiles of a handful of buyers are noise. If the import covered less than the tier window (60 days without Shopify's older-orders access; production has that access), the picture is labelled with its real period and the starts fall back to the defaults, since spend over 60 days would suggest starts far too low for a 12-month window.
- **Amounts in other currencies (call):** the worked example uses the store's own typical order when there is data; the fallback starts are 200 and 500 in currencies close to the pound, and are left blank for the merchant to fill in elsewhere (the app holds no exchange rates, `app/lib/money.ts:67-76`). Where the store sells in more than one currency, step 1 adds that credit is spent in the currency it was earned in (sh-sc-currency), and the cost line converts each order's base at that order's own rate and says it's an estimate.

### 3.5 Step 3: Go live **(Yu: option C)**
1. **Checks**, in Home's own words and states:
   - Store credit can be spent / can't be spent yet (with the reasons and Shopify's settings link) / Shopify didn't say.
   - Widget is on / off / checking, with **"Turn on the widget in your theme"** opening Shopify's theme editor with the RewardsPro embed ready to save. In the guide it opens in a **new tab**, so the guide stays where it was and re-checks when the merchant comes back **(call: Home opens it in the same frame, which would drop the merchant out of the guide)**.
2. **"Switch cashback on".** Enabled once tiers are saved; the widget is recommended, not required, because earning doesn't depend on it **(call)**. If buyers from past orders are still being placed in their tiers, say so plainly beside the button: until they're placed, they earn the first tier's rate **(call)**.
3. The page becomes **"Cashback is on"**, with an optional **"See it work with one order"** **(Yu: the try-it; call: renamed from "in 2 minutes", see §5)**:
   1. Make a draft order with yourself as the customer (not a guest), using a **custom item** so nothing ships or leaves stock, worth enough to earn something at the first tier's rate (the guide shows the smallest amount, worked out from the rate and the currency's decimals), and mark it as paid without sending a receipt **(call)**.
   2. Watch the cashback appear here and on your own page in Shopify.
   3. Refund the item (not only shipping) and watch the credit come back off.
   **Which order is the test (call):** the guide lists the orders recorded since cashback was switched on, newest first, and the merchant picks theirs; with exactly one, it follows that one. No new data is stored. It then shows what happened: the cashback and its state, or, if it earned nothing, the reason in the Orders page's words (test order, from before install, cashback was off, the rate gave nothing). Links: the order in RewardsPro, the buyer in Shopify. Shopify emails a buyer about store credit only if buyer emails are switched on in Settings.
4. **"Go to Home"** is always there. The try-it is optional.

## 4. How it fits the app

### 4.1 Where it lives
- A new route, `app/routes/app.welcome.tsx`, served at `/app/welcome` inside the admin layout (flat routes, `app/routes.ts`), not in the menu (`app/routes/app.tsx:27-37`, pinned by `test/unit/admin/nav.dom.test.tsx`). The step comes from `?step=1|2|3` **(call)**.
- Its words in a new `app/admin/guide-words.ts`, importing Home's and Tiers' existing words (`words.ts`, `home-rules.ts`) rather than retyping them.
- `privatePageHeaders` on the route, as step 2 shows buyer counts.

### 4.2 Sending a first-time merchant there
- The first open is a document load of `/app` (the app URL redirects `?shop=` requests to `/app`, `app/routes/_index.tsx:5-13`).
- **(call)** The check is a guard at the top of Home's loader (`app._index.tsx`), before its stats and Shopify calls: if the gate in §3.2 holds, redirect to `/app/welcome`, keeping every search parameter (shop, host, id_token). Putting it in the `app.tsx` layout loader instead doesn't work well: React Router runs the layout's and Home's loaders in parallel, so Home's full load (including a Shopify call and up to 8 s of import polling) would still run before the redirect. The guard is a few lines in a queued file, so it lands in its turn (§6), as the last of the guide's PRs.
- The builder confirms on a dev store that a plain redirect keeps the embedded session (shopify-app-react-router 4.0's helpers weren't readable offline), and updates the Home Postgres tests that load Home for stores with no tiers.

### 4.3 "Done"
- Reuse `setupCompletedAt`: the guide's switch-on calls `setRunning(on)` then `markSetupCompleted` (`app/lib/merchant.server.ts:159-172, 197-208`) **(call)**. The only new column is the dismissal in §3.2.
- Effect on Home: its setup card hides once setup is completed (`app/admin/home-rules.ts:90-103`). Today Home also waits for the widget before marking setup complete (Ruling 60, `home-rules.ts:109-111`); a guide-finished store skips that wait. Home's widget banner and its "Widget is on/off" check stay, so the widget is still flagged until it's on, and Built for Shopify 4.2.3 (embed status on the homepage) still holds.

### 4.4 The data behind step 2
All amounts in **shop currency**, measured exactly as tier placement measures them, so the picture can't disagree with where buyers land:
- **Tier spend** per buyer = product value after discounts less refunded product value, over the merchant's tier window (rolling 12 months by default), counting non-test, non-cancelled orders, imported ones included (`tierSpend`/`spendCounted`, `app/lib/tiers.server.ts:84-109`). Buyers with no counted spend sit in tier 1. Erased buyers are left out.
- **One read per store** in a new `app/lib/ladder.server.ts` (not `stats.server.ts`, which RP-13 owns): buyers bucketed by tier spend into fine bins, sent to the page as counts per bin. Counts per tier are sums over bins, so dragging needs no request.
- **Cost line**: a replay of how cashback is actually earned. Each order earns at the tier the buyer held *before* that order counted (`app/lib/record-order.server.ts:120-150`), on the cashback base (product after discounts, less store credit and gift cards used; shipping, duties and tips earn nothing, `app/lib/order-facts.ts:80-97`), reduced for refunds. Computed as a second set of bins (base earned by the buyer's spend before each order), so it too updates on the client. Not "final tier rate × total spend", which overstates **(call)**.
- **Suggested starting spends**: about the 80th and 95th percentiles of buyers who spent anything, rounded to a round number and kept distinct; 200 and 500 when there's no data **(call; the exact rounding is the builder's)**. Zero-decimal currencies need sensible fallbacks (200 yen is trivial).
- Whole numbers only, as everywhere in the app: rates 0-100%, starting spends up to 12 digits, names 1-40 characters, no two tiers starting at the same spend, tier 1 starting at 0 (`tiers.server.ts:431-449, 517-567`). The guide also requires each tier to start above the one before.

### 4.5 Saving the ladder
- A new `saveLadder` in `tiers.server.ts` saves all three tiers in one transaction under the existing tier lock, reusing an existing tier 1 if Home's old card already made "Everyone", then asks for one tier pass and one widget-config write **(call: three separate `saveTier` calls could leave half a ladder)**.
- Buyers are then placed by the existing tier pass (25 s after the save, the rest nightly, `tiers.server.ts:360-428`). Step 3 shows how many are still waiting, as the Tiers page does.

### 4.6 Keeping the import moving
The import of past orders only moves forward when Home's loader polls it, or on the hourly job (`app._index.tsx:76-104`). The guide's loader polls it the same way (`pollImport`, same time budget) and the page refreshes while it runs, so a first open spent on the guide doesn't stall it.

### 4.7 Step 3's checks and switch
- Store credit: `storeCreditSpendProblems` (`app/shopify/shop-checks.server.ts:88`), three states, never a pass for a check that wasn't made (Ruling 59).
- Widget: `shopify.app.extensions()` in the browser via `widgetEmbedOn` (`home-rules.ts:31-40`), checked again when the merchant comes back from the theme editor (focus/visibility), with a "Check again" button. The status covers the published theme only, and the embed is on only after the merchant saves in the editor. The guide shows the widget's status on every step, not only step 3, since for a new merchant the guide is the first page they see (Built for Shopify 4.2.3) **(call)**.
- Theme-editor link: `themeEditorUrl` (`home-rules.ts:19-23`), opened in a new tab (§3.5). It depends on the block file staying `blocks/membership_widget.liquid`.
- Switch: the guide's own action calls `setRunning` and then writes the widget config as Home's does (best effort, logged), rather than posting to Home's action.

### 4.8 Watching the try-it
After switching on, the page polls (as the Tiers page does) for this store's newest recorded order and its cashback ledger entry and payout state, for a few minutes, and shows the result or the no-cashback reason (`app/lib/order-status.ts`). From the B4 run on production: a draft order marked as paid fires `orders/paid`, isn't a test order, and its credit appeared within seconds; a refund took it back (`apps/rewards/docs/gates.md`, B and E). The copy still makes no timing promise (§5).

## 5. Rules the guide's words and looks follow

**Words** (the marketing lane's rules, `apps/rewardspro/marketing/MESSAGING.md` §4, `DESIGN.md`, `claims.toml`):
- R1 voice, business register, UK English. Short, plain, no exclamation marks, no hype.
- Say "buyers", as the admin does (`words.ts`), not "members" or "customers" **(call)**.
- No timing claims ("in 2 minutes", "instant", "in minutes"). That's why the try-it is "See it work with one order" **(call)**.
- No "free", "costs nothing" or "no fees" (ROADMAP Now-4). When RP-12's fee line (Shopify's transaction fee on store-credit spend, for stores created on or after 12 May 2025) lands, it goes beside the guide's switch too.
- Wherever spending is mentioned, its limit goes with it: buyers spend credit when signed in to their account.
- Never a hard-coded "12 months": use the import's real horizon, as Home does (`app._index.tsx:304`). Past orders earn no cashback.
- Reuse #157's sentences once it merges (which orders earn, the cashback base) by importing them.
- Every sentence gets a proposed row from the claims writer (RP-06) and a second session's check against the code before it ships or appears in a listing screenshot. Rows that exist: rp-store-credit, rp-paid-trigger, rp-merchant-funds, sh-sc-signin-legacy, sh-sc-full, sh-sc-currency, rp-vip-tiers, rp-tier-window, rp-import-past, rp-cashback-base, rp-setup-steps, rp-widget, rp-switch-off, rp-refund-takeback. Rows still needed: Shopify's customer-page balance, "not a discount on this order", the cost estimate.

**Looks** (rebuild spec §4.1; `app/admin/admin.module.css`):
- Polaris web components only: `s-page`, `s-section`, `s-stack`, `s-box`, `s-progress` for the steps, `s-money-field` and `s-number-field` for the tiers, `s-button` (primary once per step). No emoji, Polaris icons only.
- Navy #1A3E5C and teal #17BEBB only on the chart, its lines and the tier chips. Never teal text, never white on teal, a navy edge on every teal mark, no brand colour on buttons.
- The chart is plain SVG like `app/admin/Chart.tsx`: no text inside it, labels as Polaris text, `role="img"` with a summary label, tiers told apart by more than colour.
- **The fields are the real control**; the draggable lines mirror them. Keyboard and screen-reader users set every value through the fields; counts and the cost line are announced (aria-live). Works by touch, no hover-only behaviour, no sideways scrolling on a phone, WCAG 2.1 AA contrast (Built for Shopify 4.1).
- At most five steps, a progress indicator, "Finish later" (Shopify's app-home guidance).

## 6. Fitting in with the other sessions (分工)

`apps/rewardspro/marketing/WORK.md` splits RewardsPro work into packages RP-01 to RP-23 (issues #161-#183). The guide isn't one of them. It touches:
- **New files, plus shared ones not in any queue:** `app.welcome.tsx`, `guide-words.ts`, `ladder.server.ts`, a chart component, a shared widget-check hook, `saveLadder` in `tiers.server.ts`, the `guide_dismissed_at` column (`prisma/schema.prisma` and one migration), the Help link in `app.settings._index.tsx` (RP-14's later PR adds a link there too), and their tests (`nav.dom.test` unchanged; `settings.dom.test` gains one link).
- **One queued file, in its turn:** the few-line guard at the top of Home's loader in `app._index.tsx` (§4.2), as the guide's last PR, in the order #157 → RP-10 → … that Yu's merges set.
- **Not:** `home-rules.ts`, `words.ts`, `app.tiers.tsx` (queued: #157 → RP-10 → RP-13 → RP-12 → RP-14), `stats.server.ts` (RP-13), `claims.toml` (RP-06), `ROADMAP.md` (RP-19), `apps/rewards/docs/` (the B4 lane). It imports from Home's files without editing them.
- **Package and PRs (Yu, 2026-11-08):** the guide is package **RP-24**, with its own issue (the lock) claimed by the session that wrote this, built as three draft PRs: (1) the data read, `saveLadder` and the migration; (2) the guide page; (3) the guard on Home's loader, in its turn. This design is its own docs PR, ahead of them.
- **Order (Yu, 2026-11-08):** build now; ship after #157 and RP-10 have landed, so the guide reuses their sentences; ship before RP-21 captures the listing screenshots (by Fri 18 Dec), so the App Store shows the guide's first open rather than Home's old card. RP-21 (the S1-A frame), RP-06 (the `rp-setup-steps` row, whose sentence describes the old card) and RP-15 (video scripts, where Yu's YouTube guides belong) are told in their issues. Until RP-12's fee line lands, the guide's switch goes without it, as Home's does today; it adds the line when RP-12 does.

## 7. Left to the builder
- Bin width and range for the picture, rounding of the suggested spends, and how the cost replay is computed (SQL window function or server code), within §4.4's definitions. No real merchant store exists yet to measure, so benchmark on synthetic data of at least 10,000 buyers and 50,000 orders; if the live read can't stay around a second, precompute it after the import (a migration Yu applies, so say so early) **(call)**.
- How the chart lines and fields bind together, and the mobile layout.
- The exact copy, within §3 and §5, for Yu's yes before it ships (Pre-3).
- Whether the redirect needs the Shopify library's helper (§4.2), confirmed on a dev store.
- How long the try-it watcher polls, and its empty and slow states.
- Test plan: unit tests for the gate, `saveLadder`, the bins and the cost replay (a replay test with known orders), DOM tests for each step and the "no past orders" and "import running" states, and a Postgres test for the read.

## 8. Later, not in this design
- **YouTube guides of these screens (Yu)**, after the guide ships, through RP-15's video scripts.
- **A tier buyers can buy, as a paid service (Yu, roadmap):** a buyer pays a recurring fee to join a tier; the merchant keeps that revenue; RewardsPro takes a percentage of those fees, no upfront cost. Needs Shopify usage-based app billing and Shopify's subscription access, which this app lost in December 2025, so re-applying comes first. Its own brainstorm. ROADMAP.md is RP-19's file, so it's recorded here until then.
