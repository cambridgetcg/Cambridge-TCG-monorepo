# RewardsPro rebuild: design

Date: 2026-11-04. Status: draft for Yu's approval, with Yu's three answers folded in (section 11). Nothing here gets built until Yu approves this document.

Evidence behind this document (read-only passes over main at 5c5e1411, each answer challenged by a skeptic):
- Feature map of the current app, with a keep / simplify / fold / remove verdict for every page: `~/.claude/projects/-Users-yuai/artifacts-data/rewardspro-redesign/simplify-map-20261104.json`
- Rebuild research (Shopify stack, money core, data model and cutover, backend baseline): `~/.claude/projects/-Users-yuai/artifacts-data/rewardspro-redesign/rebuild-research-20261104.json`
- Home mockups Yu chose from: `~/.claude/projects/-Users-yuai/artifacts-data/rewardspro-redesign/.superpowers/brainstorm/` (`home-directions.html`, `home-b-responsive.html`)
- Dev-store test runbook: `~/.claude/projects/-Users-yuai/artifacts-data/rewardspro-audit-20261103/shopper-test-runbook.md`

## 1. Intent

RewardsPro is a Shopify app that brings buyers back with cashback they spend in the same store.

Yu, on the current app: "the dashboard feels cluttered and generic, things are out of proportion. Want to make things sensible, comfortable for the eyes and visual cortex of the user. Lack of design language in the current one. Looks like its put together by different ppl." And: "reducing complexity and let things be simple and natural. Things may be over engineered since me and the older models dont have a clear idea of focus, and the capability is not as now. If you identify friction or things that just seems stupid feel free to remove them."

The current app proves him right. It is about 142,000 lines, 157 route files, 111 database models and 24 cron routes, for a product whose working heart is one loop. Most of the rest is dead, fake or broken: a Loyalty program section that dead-ends on "Points aren't available yet", a marketing suite that has never sent an email in production, an analytics health score that docks every shop for points that can't exist, a Home page whose biggest numbers describe the usage of a free plan. 466 one-off inline styles and 92 hard-coded colours explain why it looks assembled by different people.

Yu agreed (2026-11-04) to rebuild rather than prune: a new app around the one loop, carrying over the money logic and tests that were hardened in waves 1 to 3 (PRs #123 to #141).

### The loop (confirmed by Yu: "yes! you got it")

1. A merchant installs RewardsPro and switches it on.
2. Every paid order gives the buyer cashback as real Shopify store credit, which they spend at checkout next time.
3. Tiers give a higher rate to people who spend more.
4. A small widget on the store shows each buyer their tier and credit.
5. Refunds take the cashback back.

That loop is the whole product.

### What done means (Yu's words)

"Once we test that the business logic is working through internal testing and reviewed the backend setup, we are good to go." Section 9 spells out both gates. Releasing a Shopify version still needs Yu's yes on the exact breakdown, as always.

### After this project

In this order, each with its own brainstorm: the App Store listing, then rewardspro.io, then social posts. Further out (Yu, 2026-11-04): RewardsPro as its own data platform that merchants opt in to, serving customers across stores, maybe with credit across stores, merchant collaborations and crypto. This rebuild builds nothing for that, but keeps the door open (section 6.4).

## 2. Goals, non-goals, anti-goals

Goals
- The loop works end to end, with money that is never paid twice, never lost silently, and always explainable from the ledger.
- An admin that feels native to Shopify, calm and in proportion: five pages, one design language (Shopify's own components), plain and true words.
- A storefront widget that is small, fast and clear on phones.
- Existing buyers start in the right tier on day one: the last 12 months of orders count toward tiers at install, never toward cashback (section 6.5).
- A shop-neutral engine, so WooCommerce can plug in next without reshaping the data.
- A small codebase. Aim: well under 20,000 lines of app code, against today's 142,000.

Non-goals (not in this project)
- Points, missions, challenges, raffles, mystery boxes, gift cards.
- Selling tiers as Shopify products, subscriptions, any billing or paid plan.
- Marketing email, campaigns, automations, templates, Klaviyo, SendGrid, an AI email writer.
- An analytics suite, benchmarks, health scores, insights.
- WooCommerce or any second platform (the engine is ready for it; the adapter comes later).
- Cross-store credit or any ecosystem feature.
- The App Store listing, rewardspro.io and social posts (next projects).

Anti-goals (a failure even if everything technically works)
- Complexity creeping back: settings nobody needs, toggles that switch nothing, pages for features that don't exist.
- Anything fake: numbers that are made up, buttons that do nothing, claims the code doesn't back.
- Money paid twice, paid in the wrong currency, or lost without a trace.
- A page that looks different from its neighbours. If it isn't a Polaris component, it needs a reason.
- Breaking the live listing, the dev store's install, or the merchant's widget placement during the switch.

## 3. Constraints

Shopify and dates
- Same Shopify app: client_id `026ce3bf073bed0e44ae8eab09d1ae3a`, app handle `RewardsproMembership`, the same listing, the same `application_url` (`https://rewardspro-production.vercel.app`), auth redirect and app proxy.
- Same theme app extension identity, so the merchant's widget embed survives: handle `rewardspro-theme-extension`, uid `de76c331-60b3-32cf-27d1-40ec03d229db8af03050` written inside `[[extensions]]` (delete the dead top-level `a58b9b10…` line), block file name `membership_widget.liquid`, `target: body`. Setting ids can be added or removed (section 5); embed survival depends on the app handle, extension uid and handle, and block file name. The CLI does not stop a remove-and-create of an extension (`--no-release` allows deletes without asking), so a person must read the deploy output and the version diff in the Dev Dashboard before any release.
- 2027-01-01: Shopify delists public apps that still use non-expiring offline tokens and blocks new installs; 2027-01-15 merchants see a warning; 2027-04-01 Admin API calls with those tokens are refused. The current app uses non-expiring tokens. The switch (section 8) must land before 2027-01-01.
- 2027-01-16: webhook API version 2026-01 (what the live version uses) stops being accessible and Shopify falls forward to a newer version, so payloads change shape without warning. The new app pins 2026-10 (supported to 2027-10-16) in both the toml and `ApiVersion.October26` in code.
- Webhooks: Shopify gives 5 seconds per delivery and retries up to 8 times over about 4 hours. The old code's "48 hours" assumption is out of date and must not be carried.
- `storeCreditAccountCredit` / `storeCreditAccountDebit` have no idempotency key on 2026-10. The claim / unconfirmed / reconcile state machine is therefore required, not optional.
- Store credit can be spent only by buyers signed in with new customer accounts (or Shop Pay), and the whole balance applies at checkout. Stores created on or after 2025-05-12 pay third-party transaction fees on the part paid with credit.
- The Shopify-hosted App Home extension (`admin.app.home.render`) is not allowed for App Store apps and has no backend, so the app stays a hosted, embedded (iframe) app.
- Built for Shopify can't be earned yet (it needs 50 installs and reviews); treat its requirements as design targets, not a launch gate.

Hosting and data
- Same Vercel project `rewardspro-production` (team cambridgetcgs-projects, region lhr1), same Supabase project (rewardspro-prod, eu-west-2, Postgres 17).
- The old app keeps serving the dev store, unchanged, until the switch.
- Only one shop has the app installed: Yu's dev store `rewardsprotesting`. There is no real merchant data to migrate.

Owner-only steps (Ai never does these without Yu's explicit yes at the time)
- Creating the database schema and role (the app role cannot create schemas) and running production migrations (only Yu holds the owner password / `DIRECT_URL`).
- Vercel settings and environment variable writes (Root Directory, framework, region default, env vars, secret types).
- `shopify app deploy` / `shopify app release` of the production app, Partner Dashboard changes, creating a second Shopify app. (Agreed 2026-11-04: Ai may reuse the leftover draft app as the staging app and change that app only, section 7.)
- Repository settings (required checks), deleting secrets, dropping the old schema.
- Typing passwords or sign-in codes (Yu signs in; Ai reuses the session).

Standing rules: never modify the `~/Projects/Cambridge-TCG-monorepo` working tree (fetch and worktree only); secrets by name only; no personal data sent to third-party services; read-only against the production database outside the switch steps.

## 4. What the merchant sees

### 4.1 Design language (decided)

- Shopify Polaris web components 2.0 only (`polaris-2.js`, `@shopify/polaris-types` ^2). No Polaris React, no custom design system, no fonts of our own (Polaris 2 loads its own). `s-app-nav` for navigation, `s-page` for every page.
- Sizes, spacing, colours and type come from Polaris. Custom CSS is allowed only for the small chart and the tier chip, and must use Polaris tokens.
- Brand colours appear only on tier and money visuals. Navy `#1A3E5C` and teal `#17BEBB`. Never teal text, never white text on teal (2.3:1); navy text on teal is fine (4.8:1). A teal mark against white or the admin grey needs a navy edge or label next to it. No brand colour on buttons.
- No emoji as icons. Polaris icons only.
- Words: plain, short and true. No benchmarks, no upsells, no claims the code doesn't back. Every number on screen comes from the ledger or from Shopify.

### 4.2 Navigation (decided)

Home · Customers · Tiers · Orders · Settings. No sub-tabs.

### 4.3 Home (decided with Yu: layout B, "main + side")

`s-page inlineSize="base"`.

- Banner slot (`slot="supplemental-start"`), shown only when the merchant has to act, most urgent first:
  - a customer data request waiting to be downloaded (legal duty, 30 days);
  - buyers can't spend their credit (store not on new customer accounts, or store credit off);
  - cashback that needs a look (a payout Shopify refused, or one RewardsPro couldn't confirm);
  - the widget embed is off.
- Setup card, top of the main column, only until setup is done: (1) "Your base cashback rate: [ ]%" creates the lowest tier with minimum spend 0; (2) switch cashback on; (3) open the theme editor with the widget embed. Detect the embed live with `shopify.app.extensions()`. While the past-orders import runs (section 6.5) the card shows one line, "Bringing in your last 12 months of orders so buyers start in the right tier", then "Done: N buyers placed in tiers".
- Main column:
  - **This month**: Cashback given (ledger, net of take-backs) · Store credit spent at checkout (measured on orders; label says it counts credit from any source) · Came back (buyers with a paid order this month who had an earlier order that earned cashback).
  - A small chart: cashback given against store credit spent, by day. Custom SVG; Polaris has no chart.
  - **Recent rewards**: the last few ledger events (order, buyer, tier, amount, status) with a link to Orders.
- Side column (`slot="aside"`):
  - **Running**: the cashback On/Off switch with one plain sentence on what On does, and three checks: store credit can be spent, widget is on, tiers are set.
  - **Tiers**: each tier with its rate and member count, link to Tiers.
- On phones (approved by Yu): banner first; Running shrinks to one line above the numbers; numbers two per row; chart hidden; recent rewards two rows, amount only; tiers last. Use `s-query-container` and responsive grid values. Where Shopify puts the aside on a phone is not documented, so this order must be checked on a real phone (section 9).
- One review request, only after 3 orders earned cashback and 7 days have passed; one click to leave a review, one to dismiss; never incentivised.

### 4.4 Customers

- Search, a tier filter, a table: buyer, tier, orders, cashback given. Plain pagination. Export CSV (buyer, tier, spend in window, cashback given).
- Buyer panel: tier, "in this tier since", progress (computed from the same spend that decides the tier), live Shopify store credit balance, cashback history (each entry shows the tier and rate it earned at) and orders. No separate tier-history log.
- "Lock to a tier" and "Return to automatic" (manual tier override; small, kept).
- Adjusting a buyer's store credit by hand is not rebuilt: a link opens the buyer in Shopify admin, which already does it natively.
- Buyer names and emails are read live from Shopify for display, not stored (section 6.2).

### 4.5 Tiers

- Table: name, minimum spend, cashback %, members. Whole-number percents in the UI.
- The lowest tier's minimum is fixed at 0 and labelled "Everyone starts here". There is no separate "base tier" setting or hidden fallback.
- Add, edit, delete. Deleting a tier re-places its members. Saving re-places affected buyers.
- One shop-wide choice: "Spend counted over: last 12 months / all time" (default last 12 months). A fixed nightly pass handles spend ageing out of the window; there is no frequency setting and no "recalculate now" button.
- One plain line saying what cashback is paid on (section 6.3, rule 1), for example: "Cashback is paid on the product price after discounts. Shipping, and anything paid with store credit or gift cards, earns nothing."

### 4.6 Orders

- Table: order, buyer, tier, total, cashback and rate, status: Issued · Waiting · Taken back · Needs a look · No cashback.
- Order panel: its ledger entries, payouts and refunds.
- The only actions are where a person is needed (rules in section 6.3, rule 12):
  - a payout that needs a look because Shopify refused it or it kept failing: **Retry** or **Close without sending**;
  - a payout RewardsPro couldn't confirm: the merchant checks the buyer's store credit in Shopify, then picks **It arrived** or **It didn't arrive, send it**.
- A take-back that fell short (the buyer had already spent the credit) is shown on the order as information ("Took back £0.40 of £1.00; the buyer had spent the rest"), with no action and no banner.
- No hand-issued cashback, no editable amounts.

### 4.7 Settings

One short page:
- Cashback emails: one switch, "Email buyers when they earn store credit", sent by Shopify itself through `StoreCreditAccountCreditInput.notify` (exists on 2026-10, default false), default off. RewardsPro sends no email of its own.
- Privacy requests: link to the list of customer data reports with downloads, retention date and the 30-day reminder (sub-page, not in nav).
- Help and contact: docs link and contact@rewardspro.io.
- Widget look lives in the theme block's own settings (Light / Dark / accent colour), not in the app, so it applies to guests too.

## 5. What the buyer sees: the widget

- One app embed block (identity in section 3). Small: aim for under 30 KB of JS and CSS together, against today's ~155 KB; storefront Lighthouse must not drop by more than 10 points.
- Signed-in buyer: tier name and rate, live store credit balance (Shopify's live balance with a 2.5 s timeout, as PR #134), progress to the next tier from the same spend that decides the tier, and how to spend: sign in and choose Apply store credit at checkout. RewardsPro keeps no copy of the balance, so if Shopify doesn't answer in time the widget says "Your store credit shows at checkout" instead of a number.
- Guest: "Sign in to see your rewards", plus the base rate ("Earn 5% back as store credit"). The block's existing `guest_message`, `guest_cta_text` and `guest_cta_url` settings stay and override the default guest copy when the merchant has filled them.
- Block settings: keep the three guest settings; add Light / Dark / accent colour; remove `enable_api_calls` and `cache_duration`, which do nothing useful. The current app-side widget look is not carried; the dev store returns to the default look at phase 3.
- A buyer RewardsPro hasn't seen yet shows the lowest tier and no credit, computed on read; nothing is written for a widget view.
- Works at phone width first.
- Until the new widget ships (section 8, phase 3), the proxy answers with the JSON shape the released widget reads (`success`, `membership`, `balance`, `tierProgress`, `theme`). The builder checks the released extension code for every proxy path it calls.

## 6. The engine

### 6.1 Layers (decided)

1. **Engine** (shop-neutral): the ledger and payout state machine, refund take-back maths, stuck-payout verdicts, tier rules, eligible-amount maths, numeric guards. Carried from the current app with its logic unchanged except the cashback base (6.3 rule 1) and the refund share (rule 7), rewritten only where it touched Prisma models or `admin` directly.
2. **Platform adapter** (Shopify now, WooCommerce later), behind two small interfaces:
   - order facts: is this order still due to be recorded, who owns it, product value after discounts, store credit and gift cards used, currency, test flag;
   - payout rail: credit, debit, live balance, credit history.
   Shopify's side carries the store credit service with its "may have been applied" rules, the transaction analyzer, the store-credit history read, the live balance and customer-accounts checks, the proxy signature and identity check, and the encrypted session storage.
3. **Thin routes** on Shopify's React Router template: webhooks, the proxy, crons, admin pages.

### 6.2 Data (decided)

A new Postgres schema `rewards`, owned by a new role `rewards_app`, in the same Supabase project. The old schema `rewardspro` stays untouched until it is retired, so the old app keeps working and a rollback lands on intact data.

Tables (snake_case via Prisma `@@map`; ids are UUIDs; platform ids are attributes, never keys; money is `numeric(19,4)` with an ISO currency code; child rows carry composite foreign keys so they can't point at another merchant's store):

1. `merchant`: name, currency (ISO, from Shopify), running (the on switch, default off), tier_window (`rolling_12_months` or `lifetime`), timestamps. These are the whole of the settings, plus the email switch if built.
2. `connection`: one installed store: platform (`shopify`), external_account_id (canonical myshopify domain, unique per platform), status, installed_at, uninstalled_at.
3. `customer`: external_customer_id (unique per connection), tier_id, tier_since, manual tier lock, redacted_at. No name or email.
4. `tier`: name, min_spend, cashback_percent `numeric(5,2)`, position.
5. `orders`: external_order_id (unique per connection), name (#1001), source (`live` or `import`), currency, total_amount (for display), product_amount (rule 1's measure), cashback_base, store_credit_used, refunded_product_amount, ordered_at, paid_at, test flag. Amounts are in the buyer's currency, with shop-currency equivalents for tier spend and totals. Index (customer_id, ordered_at). (`order` is a reserved word.)
6. `ledger_entry`: the source of truth, append-only (a trigger refuses UPDATE and DELETE except the erasure purge): kind (cashback / reversal / adjustment), signed amount, currency, the shop-currency amount (for Home totals), tier and rate at the time, idempotency_key unique per merchant (`cashback:<order id>`, `reversal:<connection>:<refund id>`), created_at.
7. `payout`: moving money on the store's own credit system: ledger_entry_id (unique), rail (`shopify_store_credit`), direction, amount, currency, state (pending / held / sending / sent / unconfirmed / refused / nothing_to_send), claimed_at, sent_at, external_transaction_id, shortfall, last_error, attempts. Today's `metadata.syncStatus`, `claimedAt` and `unconfirmedAt` become these columns.
8. `Session`: the template's table (it already has `refreshToken` and `refreshTokenExpires`), stored through the carried `EncryptedPrismaSessionStorage`, extended to encrypt the refresh token too.
9. `privacy_request`: customers/data_request bookkeeping; reports are built live from the ledger.

"Source of truth" means what RewardsPro issued and took back. The buyer's whole balance is Shopify's; RewardsPro shows it live and never mirrors it. Spending is observed on the order (`store_credit_used`), not written to the ledger.

Connection and migrations
- Pool: small (more than 1), about 5 s idle timeout, `attachDatabasePool`, as Vercel advises for Fluid compute. Pinned-CA TLS to Supabase carried as is.
- Migrations: an explicit `migrate:deploy` through the carried `prisma-tls` bridge before a deploy, never in the build, with a drift check. CI runs the Postgres suites on postgres:17 against migrations.
- The `rewards` schema is not exposed through Supabase's Data API and grants nothing to `anon` or `authenticated`. Don't run `setup-database.sql` verbatim on production (its `REVOKE CREATE ON SCHEMA public FROM PUBLIC` changes the whole database).
- New env names `REWARDS_DATABASE_URL` (and `REWARDS_DIRECT_URL` for migrations, held by Yu), so both apps' settings coexist in one Vercel project and neither the switch nor a rollback edits values. Shared: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES`, `ENCRYPTION_SECRET`, `ENCRYPTION_SALT`, `CRON_SECRET`, `SENTRY_DSN`. Keeping both `ENCRYPTION_*` values is what keeps stored sessions readable.

### 6.3 Money rules (carried from today's app unless marked as changed; stated so nobody changes them by accident)

1. Cashback base (changed, Yu 2026-11-04): the product price after discounts. That is the order's line items after line and order discounts, without shipping, duties or tips, and without gift-card lines. Tax is in it only where the shop's prices include tax (UK and EU shops); where prices exclude tax it is not added. Whatever the buyer paid with store credit or gift cards is then subtracted, never below zero, so credit never earns credit. Example: £50 of products after a discount, £5 shipping, £10 paid with store credit: the base is £40. Derive the base from the line items rather than trusting one order-total field (Shopify's docs describe the subtotal fields' tax handling inconsistently), and check it against one tax-inclusive and one tax-exclusive dev-store order. Today's base (everything paid by card, shipping and tax included) is not carried.
2. Rate: the buyer's tier rate. An order earns at the tier held before its own spend counts; a buyer with no tier yet is placed in the lowest tier first.
3. Arithmetic: exact decimal, rounded half-up to the currency's smallest unit. (Today's code multiplies floats first, which can be a cent off; fixing that is a correctness fix, not a rule change.) Refund shares round down; the refund that completes the order takes the rest.
4. Currency: a Shopify store credit account is held in one currency. Cashback is issued in the currency the buyer paid in, so a buyer paying in euros gets euro credit they can spend at a euro checkout; the builder confirms on help.shopify.com that credit only applies at a checkout in its own currency, and if Shopify does convert, issues in the shop currency instead. Tier spend and Home totals are always in the shop's currency (orders carry both amounts). Real ISO codes from Shopify, never a fallback to USD; rounding follows the currency's decimals. A refund debit uses the same currency as its credit.
5. Test orders (`order.test`) earn nothing.
6. Off means no new cashback: while the switch is off, paid orders are recorded for tier spend but earn nothing, and nothing is owed later; there is no backlog to pay when it's turned on. Cashback already earned while it was on is still paid, and refunds of those orders still take it back.
7. Refund share (changed with rule 1): a refund takes back cashback in proportion to the product value it returns, measured the same way as rule 1 (refunded items at their discounted price; for a refund of money with no items, that money minus any shipping it refunds), divided by the order's product value. A shipping-only refund takes nothing back. Refund before payout: the pending payout is reduced, or becomes nothing_to_send. Refund after payout: a reversal entry is debited, capped at what the buyer still holds, and any shortfall is recorded. A refund while its credit is unconfirmed waits as held until the hourly check settles it.
8. A refund for an order not recorded yet answers 503 so Shopify redelivers, but only while the order may still be recorded (inside Shopify's ~4 h retry window).
9. Paying out: the webhook writes the ledger entry and payout row and answers 200 within the 5 s budget; the credit is sent after the response under `waitUntil`; the hourly job is the backstop. A payout is claimed before Shopify is called; an unclear answer leaves it unconfirmed and it is never re-sent blind. The hourly job reads the buyer's Shopify credit history to settle it: landed → sent (release held reversals); not landed → back to pending; can't tell (including a history read only in part) → needs a look. There is no 7-day stop: a pending payout keeps being retried hourly with backoff, and after 24 hours of failures, or at once on a refusal Shopify says won't change (customer gone, currency not supported, account limit reached), it becomes "needs a look" (rule 12). Known limit: a same-amount credit from elsewhere inside the send window would be taken as RewardsPro's.
10. Tier spend (changed with rule 1, so spend means one thing everywhere): the product value after discounts (rule 1's measure before store credit and gift cards are subtracted, so spending credit still counts as spending), minus the product value refunded, in the shop's currency, counted by order created date, over the shop's window. The tier is stored once, written only by the resolver; progress uses the same spend. If the resolver can't read what it needs, it throws and writes nothing (PR #137).
11. Imported past orders (section 6.5) count toward tier spend and never earn cashback; a refund of an imported order lowers spend and takes nothing back.
12. Needs a look, and the merchant's answers (no other path out):
    - Refused or kept failing: **Retry** sends again (back to pending); **Close without sending** writes an adjustment entry that cancels the cashback, so the ledger stays true, and nothing is sent or taken back for it again.
    - Couldn't confirm: **It arrived** marks it sent and releases its held take-backs; **It didn't arrive, send it** puts it back to pending. If the merchant has already added the credit by hand in Shopify, the right answer is "It arrived", and the screen says so.
    - A take-back shortfall is recorded on the reversal and shown on the order; it needs no answer.
    - Uninstall then reinstall before shop/redact: pending payouts and held take-backs carry on.
13. Missed orders: an `orders/paid` that fails through all of Shopify's retries must not be lost. The hourly job also sweeps paid orders from the last 3 days that RewardsPro hasn't recorded and records them through the same path as the webhook. A refund for an order that wasn't recorded yet then finds it on a later delivery or the next sweep.

### 6.4 Keeping the door open (decided; build nothing more)

- The ledger is RewardsPro's own and keyed by neutral ids, so WooCommerce needs only additive changes (platform value, an encrypted credentials column, a coupon or wallet rail with its capability).
- Cross-store credit later would add a person link above `customer` and let a payout land on another merchant's connection; the ledger never needs rekeying. The legal questions (money moving between merchants, RewardsPro becoming a data controller, crypto registration) stay with Yu for that future brainstorm.

### 6.5 Past orders at install (Yu, 2026-11-04: yes)

- Once per connection, started when the merchant first opens the app (token exchange creates the merchant and connection). After a reinstall it runs again only if shop/redact erased the data.
- Reads the paid orders created in the 12 months before install with a Shopify bulk operation. Orders older than 60 days need `read_all_orders`, which is already in the app's scopes. The builder checks Shopify has approved it; if not, the import covers 60 days and requesting the approval is Yu's step in the Partner Dashboard. Test and cancelled orders are skipped.
- Writes `orders` rows with `source = import` and the same columns as live orders (customer ids only, no names or emails). Nothing is credited and nothing goes to the ledger. Buyers are placed in tiers once the import finishes; until then the widget shows the lowest tier.
- One row per order (external_order_id is unique). An order paid before install never earns cashback, whichever path saw it first (cashback is off at install anyway, rule 6).
- With "all time" chosen, history starts at the 12-month import horizon.
- Runs in resumable, idempotent chunks within Vercel's function limits; the builder picks the trigger (the `bulk_operations/finish` webhook or the hourly job).
- The privacy policy says RewardsPro reads 12 months of order history at install (updated with the listing project).

## 7. Shopify integration (decided)

- Stack: Shopify's React Router template via CLI 5.0.x (not the local global 3.89), `@shopify/shopify-app-react-router` 4.x, React Router pinned at 7.18.2 (7.18.3 broke actions; don't use 8), React 19 (needed for controlled Polaris fields), Prisma 6.19.x (not the 8 release candidate), `@shopify/shopify-app-session-storage-prisma` 11, `polarisUrl` set to `polaris-2.js` in both `AppProvider` and `shopifyApp()`, `@vercel/react-router` preset. Check the scaffold's version pins by hand; the CLI's branches disagree.
- Expiring offline tokens on (`future.expiringOfflineAccessTokens`). Offline tokens must stay usable for a shop that only receives webhooks for months (the refresh token lasts 90 days). The builder picks the documented way: a scheduled refresh in the nightly job, or Shopify's app-only access tokens; not both for the same store. Never delete offline sessions in cleanup (today's session-cleanup would).
- Webhooks (2026-10): `orders/paid`, `refunds/create`, `orders/cancelled`, `app/uninstalled`, `app/scopes_update`, and the three compliance topics on one URI, plus `bulk_operations/finish` if the import uses it. Not rebuilt: `orders/create`, `orders/fulfilled`, `customers/create`, `customers/update`, `products/update`.
- Webhooks for a shop with no merchant row yet (for example a closed store that reopens) answer 200, are logged, and do nothing.
- Old paid charges: the 11-03 Partner Dashboard read showed frozen, not cancelled, charges on two closed stores (Hananja, Ultra $499; Cambridge TCG store, Max $149). On first open, the new app cancels any active recurring charge it finds, since RewardsPro is free. If Shopify doesn't let a managed-pricing app call the Billing API, the builder flags it and Yu asks Partner Support instead.
- Protected customer data: approved 2025-12-16 for name, email, phone and address, so names and emails can be read live. Dropping phone and address from the approval is a later Partner Dashboard step for Yu.
- `app/uninstalled`: delete sessions and stop work. `shop/redact` (48 h later) does the full erasure, derived from the data model as today. `customers/redact` blanks one customer row. `customers/data_request` opens a report and the Home banner.
- Scopes after the trim: orders and customers read, store credit read and write, app proxy, `read_all_orders` (for the import, section 6.5), plus whatever else the builder proves the loop needs. Scope trimming waits for the trimmed release (section 8, phase 3), never the switch itself.
- App proxy: signature checked, buyer identity only from the signed `logged_in_customer_id`, shop only from the verified session. Rate limits keyed on the verified shop and buyer, after authentication, not on IP (all proxy traffic comes from Shopify's IPs).
- Two tomls: `shopify.app.toml` (production, `automatically_update_urls_on_dev = false`) and `shopify.app.staging.toml` (the staging app: the leftover draft public app "rewardspro-production" in Partners, reused on Yu's yes 2026-11-04. Ai first checks its client_id is not production's, then renames it "RewardsPro Staging" so nobody confuses the two. Its dev store is cashbackpro). Never run `shopify app dev` against production. At the switch, guard the old directory's toml and deploy script so it can't push the old config back.
- Crons (3): hourly payout check (section 6.3 rule 9), nightly tier pass, nightly housekeeping (prune webhook records, expire data-request reports, token refresh if chosen). Carry the monitored-cron reporting from PR #140.
- Monitoring: Sentry with PII scrubbing as today (SDK for React Router), cron failures and stops reported; `/api/health`.

## 8. Building and switching over

Phase 1, build (normal PRs to main, old app untouched)
- New directory `apps/rewards` with its own `vercel.json` (`regions: ["lhr1"]`, React Router framework, the 3 crons), ignore-build script, CI job and both tomls. The production Vercel project doesn't build it yet.
- Carry the Postgres scenario suites first, against the new tables, and make them pass: orders-paid, refunds, refund-before-cashback, cashback-reconciliation, store-credit-answers, app-proxy, compliance, tier-recalculation, session-storage, plus the helpers and the postgres:17 CI job. Then unit tests for the pure rules. Leave behind the stand-in financial tests, the scenario tests that mock the resolver, and the mock-Prisma webhook tests.
- Develop with `shopify app dev` against the staging app on dev store cashbackpro, with a local or throwaway Postgres.

Phase 2, switch (one sitting, each step on Yu's yes; zero Shopify changes)
1. Yu creates schema `rewards` and role `rewards_app` and runs `migrate:deploy` with the drift check.
2. Add the `REWARDS_*` variables in Production.
3. Optionally copy the dev store's encrypted offline session row into the new schema, so webhooks arriving before Yu reopens the app can still price cashback. (On the dev store a short gap is acceptable.)
4. Change the Vercel project's Root Directory to `apps/rewards` with the React Router preset; set the project's default region to lhr1 and Node to 24.
5. Deploy main with a commit that touches `apps/rewards` (so the ignore script doesn't skip it). Same URL, same region.
6. The new code answers every path the released version uses: all 11 webhook URIs (200 for topics it ignores, `refunds/create` at `/webhooks/orders/refunded`, the single compliance URI), the auth paths, and `/api/proxy/membership` with the released JSON shape.
7. Yu opens the app on rewardsprotesting once. Token exchange stores an expiring offline token, creates the merchant and connection, and starts the past-orders import. From here the old app's non-expiring token on that store is dead.

Rollback: Vercel Instant Rollback to the last old-app deployment and Root Directory back. Because the old token died in step 7, the old app on the dev store then needs a reinstall. Credit the new app issued stays in Shopify; on the dev store that is test money.

Phase 3, trimmed Shopify version (Yu's yes on the exact breakdown): the new widget, trimmed scopes and topics, webhooks on 2026-10, `automatically_update_urls_on_dev = false`. Read the deploy output and the version diff: the theme extension must show as updated, never created plus removed. This comes before the gates so they test the widget buyers will actually get; with only the dev store installed, a harder rollback is acceptable.

Phase 4, prove it: the two gates in section 9.

Phase 5, retire (after at least a week): delete `apps/rewardspro`, its env vars and cron routes; delete the dormant `apps/rewardspro-api` and its CI workflow (git keeps the design); dump, then drop, schema `rewardspro` and its role (irreversible: Yu's yes). Update DEPLOY.md, DATABASE.md and the privacy policy's retention lines in the same change.

If a real merchant installs the old app before the switch, carry their customers, tiers and ledger across at the switch with a one-off script, and say so in the switch plan.

## 9. The two gates

### 9.1 Internal testing (on rewardsprotesting, after the switch)

Automated, all green in CI: the carried Postgres suites and the unit tests, plus new tests for what changed (test orders earn nothing; Off means off; decimal rounding; ISO currency; uninstall versus redact; progress equals tier spend; token refresh). The new cashback base: shipping-only refund, a refund of money with no items, an order part-paid with store credit, a gift-card line, tax-inclusive and tax-exclusive prices. The import: an imported order earns nothing, a refund of one lowers spend only, an order seen by both the import and the webhook counts once, an interrupted import resumes.

Hands-on, extending the shopper runbook (Ai drives Chrome; Yu signs the test shopper in once; no card details ever):
- A. New shopper: the widget shows the lowest tier and no credit.
- B. First paid order (draft order, mark as paid, with shipping): cashback arrives as Shopify store credit at the right rate on the product price after discounts, shipping earning nothing; Home and Orders show it.
- C. Widget: tier, live credit, progress and the spend line, at laptop and phone widths; guest state.
- D. Spend: a checkout fully covered by store credit; Home's "spent at checkout" counts it; the widget shows the new balance.
- E. Partial refund: proportional take-back. F. Refund after the credit was spent: shortfall recorded, needs-a-look shown.
- G. Cross a tier threshold: the tier changes; the next order earns the new rate.
- H. Switch off: an order earns nothing; switch on again: nothing owed.
- I. Compliance: trigger data_request and redact (`shopify app webhook trigger`): banner, download, erasure.
- J. Uninstall and reinstall: sessions gone at uninstall, data erased at shop/redact.
- K. The admin at laptop, tablet and phone widths in Chrome; Yu does one pass in the Shopify phone app (confirms where the aside lands).
- L. Each cron runs once on production and reports as expected.
- M. Needs a look: a refused payout (e.g. a deleted test customer) shows on Home and Orders; Retry and Close without sending each do what rule 12 says.
- N. Multi-currency on the `different-currency-test` dev store: a buyer paying in another currency gets credit they can apply at checkout.
- O. A missed `orders/paid` (simulated by rejecting deliveries) is recorded by the next sweep.
- P. Past orders: after the switch, rewardsprotesting's buyers are placed by their last 12 months of orders and no credit is issued for those orders; an order older than 60 days counts, if the store has one (proves `read_all_orders`).

### 9.2 Backend review (each item ok, or accepted by Yu in chat)

- Region lhr1 in vercel.json and as the project default; Node 24 in both places.
- Database: schema and role isolated, not exposed via the Data API; pool settings; migrations and drift check; previews do not get the production database or the production Shopify secret (today `SHOPIFY_API_SECRET` is one entry for all environments: needs Yu's yes to split).
- Secrets: only the names the app reads; production secrets typed sensitive; the 15+ orphaned names (AWS_*, AURORA_*, DD_*, REWARDSPRO_OPERATOR_READINESS_SECRET, …) deleted on Yu's yes.
- Webhooks: HMAC on every route; answers within 5 s measured; idempotent by natural keys.
- App proxy: signature and identity checks; rate limit keyed on verified shop and buyer.
- Tokens: expiring offline tokens, encrypted at rest including refresh tokens, refresh proven.
- Monitoring: Sentry alerts on cron failures and stops; `/api/health` added to the hourly deploy-health check.
- Logs: Shopify's app proxy puts the signed buyer id, shop and signature in every forwarded request's query string, so Vercel's 1-day request logs hold pseudonymous buyer ids whatever the method. Yu accepts that, or the builder finds a log-redaction setting.
- Merge gate: the "CI status" check required on main (a repo setting: Yu's yes).
- Before the first real merchant (not a launch blocker for the dev-store test): Supabase point-in-time recovery (needs Small compute plus about $100 a month: Yu's call) and one rehearsed restore.

## 10. What's left to the builder

Component and file structure; the chart's exact drawing; copy wording within section 4's rules; the token-refresh mechanism (section 7); whether to copy the session row at the switch; how the proxy serves the old JSON shape until the new widget ships; how Customers search works without stored emails (Shopify customer search mapped to known ids is fine); CSV export mechanics; test structure beyond the named suites; the review-request timing details; the import's trigger, chunking and resume (6.5); the exact Shopify fields behind rules 1 and 7, as long as the 9.1 fixtures pass; small fixes found while carrying code, as long as no money rule in section 6.3 changes.

## 11. Yu's answers (2026-11-04: "1. yes 2. yes 3. yes")

1. Cashback is paid on the product price after discounts, without shipping (6.3 rules 1, 7 and 10).
2. Past orders are imported at install for tiers only (6.5).
3. The leftover draft app becomes the staging app (7).

## 12. Calls Ai made (for Yu to check while reading)

New with Yu's answers:
- Spend means one thing everywhere: tier spend uses the same product-price measure as cashback, but counts the part paid with store credit (6.3 rule 10).
- Everything paid with store credit or gift cards is subtracted from the cashback base, never below zero (6.3 rule 1).
- A refund takes cashback back by the product value it returns; a shipping-only refund takes nothing (6.3 rule 7).
- The import covers 12 months even when the window is "all time"; if `read_all_orders` isn't approved, it covers 60 days (6.5).
- The reused staging app is renamed "RewardsPro Staging" (7).

From the builder check:

- Off means no new cashback; money already earned is still paid and still taken back on refunds; no backlog, no hand-issued cashback (6.3 rule 6, 4.6).
- Payouts that need a person get exactly two answers each, and the 7-day auto-send stop goes (6.3 rules 9 and 12).
- An hourly sweep records paid orders whose webhook was lost (6.3 rule 13).
- Cashback in the currency the buyer paid in, if Shopify only applies credit in its own currency (6.3 rule 4).
- The widget shows no balance rather than a stored copy when Shopify is slow (5).
- Widget block settings: guest copy kept, look added, two dead settings removed; the dev store's look resets (5).
- No tier-history log; cashback entries carry the tier they earned at (4.4).
- On first open, cancel any leftover paid charge (7).
- The trimmed Shopify release (new widget) comes before the gates (8).
- No RewardsPro email at all; only Shopify's own store-credit notice behind one switch, default off (4.7).
- Hand adjustments of store credit stay in Shopify admin, not rebuilt (4.4).
- Manual tier lock kept (4.4).
- No buyer names or emails stored; read live (6.2).
- Test orders earn nothing (6.3 rule 5).
- Uninstall stops work; erasure waits for shop/redact (7).
- Ledger = what RewardsPro issued and took back; balance is Shopify's (6.2).
- Production with the dev store is the final test bed after the switch; no staging Vercel project (8).
- New schema in the same Supabase project, not a new project (6.2).
- Root Directory switch at cutover, not replacing `apps/rewardspro` in place (8).
- Keep the listing open during the rebuild; carry any real merchant across by script if one arrives (8).
- The dormant `apps/rewardspro-api` is deleted at retirement (8).
- Review request after 3 cashback orders and 7 days (4.3).
