# Staging run on cashbackpro (plan task A25), 2026-11-05

The rebuilt app ran end to end on a development store before any real merchant sees it. This is the record: what ran, what it showed, and what is left for the switch-over (Part B).

## Setup

- **Staging app:** the leftover draft app "rewardspro-production" (client id `f04b5854fb022d67ba9dd097767b465a`, not the released app's `026ce3bf…`), reused with Yu's agreement and configured by `shopify.app.staging.toml` (name "RewardsPro Staging", 2026-10 webhooks, the trimmed scopes). Its public distribution was never reviewed, so it can only be installed on development stores.
- **Store:** cashbackpro (GBP, prices include tax), with the theme "test-data".
- **Database:** staging's own local Postgres (`scripts/test-db.sh staging`, Ruling 75), never touched by a test suite. It is thrown away after the run.
- **Running it:** `shopify app dev --config shopify.app.staging.toml --store cashbackpro.myshopify.com` (Shopify CLI 5.0.0) with test secrets in a scratch env file. Yu ran it in his own terminal, because the CLI asks for the storefront password.
- **Hurdles on the way:**
  - The Mullvad VPN blocked the Cloudflare tunnel's port 7844; Yu paused it.
  - The released Rewards Pro was also installed on cashbackpro and held the `/apps/rewardspro` proxy address. Yu uninstalled it from that store, and the staging app's proxy URL was set back to `apps/rewardspro`. At the real switch the same app updates in place, so this cannot happen there.
  - The Chrome tool cannot click inside the embedded app's cross-origin frame, so Yu did the in-app clicks. Reading the pages, Shopify's own admin pages, the storefront and the database checks were automated.

## Results

| Check | Result |
|---|---|
| Install and import (Step 3) | Pass. The merchant and connection were created on the first open. The import finished with 0 orders, correctly: every order on the store is older than 12 months. `read_all_orders` was granted, so the horizon was 365 days. The widget metafield was written on open. |
| Proxy (Step 4, Review Focus 1) | Pass. The widget sends only `?currency=`. Answers are `private, no-store` and carry no email or name. An appended `shop`, an appended or forged `logged_in_customer_id`, or a foreign shop all still answer for the signed-in shopper: identity comes from Shopify's signed value. |
| A. New shopper | Pass. Lowest tier at 5%, £0.00, £50 to Gold. |
| B. First paid order | Pass. Order: £600 product, −£60 discount, £10 shipping. Recorded within 2 s. Base £540, so shipping earned nothing. Cashback £27.00 at 5%, sent within a second, and Shopify's live balance was £27. Home and Orders showed it. |
| C. Widget | Pass (laptop). Signed in, the panel showed tier, rate, live credit, progress and the spend line. As a guest it showed "Sign in to see your rewards" and "Earn 5% back as store credit", read from the app metafield, with no proxy call. Phone width was checked as part of K. |
| D. Spend with store credit | Pass. The checkout total of £30.94 was covered fully by credit ("Total due £0.00", no card). The order was recorded with £30.94 store credit used and earned nothing. Home's "Store credit spent at checkout" showed £30.94. |
| E. Partial refund | Pass. Refunding 1 of 2 items took back exactly half of the £20.00 (£10.00), with no shortfall. |
| F. Refund after the credit was spent | Pass (Decision 19 / spec 4.6). The take-back asked for £27.00 and took the £16.06 left, recording a £10.94 shortfall adjustment. The order panel says "Took back £16.06 of £27.00; the buyer had spent the rest", as information with no banner and no action. |
| G. Cross a tier | Pass. The next order earned at Gold's 10%. |
| H. Switch off and on | Pass. Off: the order is recorded for tier spend, with no ledger entry, and the widget metafield read `running: false`. On: nothing was owed later. |
| I. Compliance | Partly. Shopify's signed sample webhooks (data request, customer redact, shop redact) changed nothing on this store, which is correct: a shop/redact for another shop does not touch this one. A real "Request customer data" from the admin did not reach the dev tunnel within 20 minutes, most likely because it goes to the draft app's released configuration. **Open:** the banner → download → erasure path with real data moves to B2 on the production deployment. |
| K. Admin on a phone (Yu's iPhone, Shopify app) | Pass. Order: past-orders line, the Running line with the only switch, numbers two per row, no chart, two recent rewards with amounts only, then tiers. The Running card is not repeated (Ruling 70). The Running line claims nothing about the widget check, which the iOS app cannot answer (Ruling 59). The CSV opens in Quick Look with Share. |
| M. Needs a look | Pass (answers and dialogs). A true refusal can't be produced on this store: Shopify won't delete a customer with orders, and store credit switched off gives an unclassified error. So two payouts were set to needs a look in the staging database. Home's banner read "2 orders need a look". "It arrived" kept the original send date (TRUTH-8). "Close without sending" wrote the `close:` adjustment, netting the order to £0 (rule 12). Both answers went through their confirm dialogs (Ruling 68). The engine's refusal paths are covered by the Postgres suites. |
| O. Missed orders/paid | Pass. With the order's row removed, the hourly job's sweep re-recorded it. It was judged at recording time (Ruling 24 as amended), with the switch now on. |
| Tiers, Customers, Settings in the real admin | Pass. Yu added a tier and deleted it through the delete dialog. A name search worked. The CSV quotes every cell and puts the currency in its money headers, with spend per rule 10. The email switch went on and off. |

### Refund and order shapes (Step 5)

- **Discount and shipping:** order B.
- **Store-credit tender:** order D.
- **Refund with items:** order E.
- **Shipping-only refund:** product value £0 and no take-back (Ruling 11).
- **Money-only refund of £5:** product value £5 (rule 7), taking back 5% of the order's cashback, with a shortfall because the buyer's balance was £0.
- **Fixtures:** every A7 fixture path appears in Shopify's real `RewardsOrderFacts` and `RewardsRefundFacts` answers. No fixture changed.
- **Tax-exclusive order:** not run, because it needs a store or market whose prices exclude tax. **Open:** for B2 or a second dev store.

### Query costs (Admin API 2026-10, measured with `shopify app execute`)

| Document | Requested cost | Actual cost | Hand count |
|---|---|---|---|
| RewardsShopDetails | 1 | 1 | 1 |
| RewardsTokenPing | 1 | 1 | 1 |
| RewardsAccessScopes | 2 | 2 | about 1 plus one per scope |
| RewardsAppInstallation | 1 | 1 | 1 |
| RewardsCustomerAccounts | 2 | 2 | 2 |
| RewardsStoreCreditConfig | 1 | 1 | 1 |
| RewardsBalance | 27 | 8 | 24 |
| RewardsCreditHistory | 39 | 7 | 544 |
| RewardsOrderFacts | 25 | 7 | 912 |
| RewardsOrderTransactions | 2 | 2 | 801 |
| RewardsRefundFacts | 36 | 14 | 429 |
| RewardsUpdatedOrders | 23 | 5 | 853 |
| RewardsCustomerNames (250 distinct ids) | 1 | 1 | 250 |
| RewardsCustomerSearch | 13 | 2 | 253 |

All are far under 1,000, and the hand counts are safe upper bounds (Ruling 78). The mutations ran in the flow above without throttling.

### Tokens and jobs

- **Overlapping renewals:** at 19:44 two token renewals overlapped. The lease's 1.5 s wait was shorter than a slow exchange through the tunnel.
- **The refresh token survived:** with the access token marked expired, the payouts job refreshed it. The new refresh token's expiry moved forward to 2027-02-03, and the sweep then reached Shopify (A15, Decision 12, Ruling 39).
- **Housekeeping:** answered 200 and skipped an unchanged widget value (OPERATIONS-4).
- **Payouts job:** answered in 0.2–0.7 s.

## Open, for B2 or later

- **Compliance with real data:** a real customers/data_request and customers/redact → banner, download, erasure, on the production deployment.
- **Tax-exclusive order:** the shape check and base check.
- **Vercel-specific checks (OPERATIONS-10):** waitUntil on the real deployment, cron registration, the 300 s ceiling, the timing checks (an export at a few thousand buyers, a large tier delete, the nightly widget step), and a Sentry event carrying the right `shop` tag.
- **Lighthouse with the embed off and on:** the storefront is password-protected. The widget is 10.8 KB of JS and CSS against the 30 KB budget.
- **The extension version diff:** checked when the production app's version is created (`rewardspro-theme-extension` updated, not created plus removed).
- **Not exercised here:** a tipped order, orders edited before or after payment, uninstall and reinstall (J), and table paging with more than one page of buyers.
- **Renewal lease timing:** see whether 1.5 s is enough on Vercel lhr1.
- **Design (minor):** on the phone, the side column's "Tiers" heading renders lighter than the main column's headings.
