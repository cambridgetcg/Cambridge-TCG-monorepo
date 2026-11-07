# The two gates (plan task B4), 2026-11-07

Spec 9.1's hands-on checks A to P and the items [switch.md](switch.md) carried into B4, run on production after the switch. This is the record: what ran, what it showed, and what is still open. Times are UTC.

## Setup

- **App:** the released Rewards Pro (client id `026ce3bf…`), version `rewardspromembership-217`, served by `rewardspro-production` from `apps/rewards` at main.
- **Store:** rewardsprotesting (GBP, prices include tax), Dawn with a cart page, the embed on. Payments: Shopify's "Test payment gateway", turned on by Yu for check D. No card details were typed at any checkout.
- **Tiers:** "Everyone" at 5% (the lowest), and "Gold" from £300 at 10%, added by Yu at the start of B4.
- **Buyers:** the test shopper Yu signed in as on the storefront (B, D, E, F, H and the order edits), a second test buyer (G), and the imported buyer "Rewards Pro" (P and I).
- **CI:** the `rewards` job and `CI status` green on main at 809e3a8a (#153) and 74184b23 (#156).
- **Accepted by Yu in chat ("accept from staging and tests"):** M, O and table paging, for the reasons in their rows.

## Results

| Check | Result |
|---|---|
| A. New shopper | Pass. The widget showed tier "Everyone", £0.00 (B2 step 6, 2026-11-06), and on Yu's iPhone the open panel read Everyone, 5%, £0.00 (B3). |
| B. First paid order | Pass. #1011: 2 × £222.00, a £44.40 discount, £10.00 shipping, marked paid (£409.60). The shopper got £19.98 in store credit within 3 s: 5% of £399.60, the product price after the discount, with shipping earning nothing. |
| C. Widget | Pass. On Yu's iPhone (B3): signed in, as a guest and in Dark; the panel fits and Check out stays clear of the launcher. After D the launcher showed the live balance, "Rewards £8.99". Laptop width and the progress line ("£50 to Gold") were checked on staging; here every test buyer ended in the top tier. |
| D. Spend with store credit | Pass. #1013, a £1.00 product: "Total due £0.00", no card fields, the checkout covered fully by store credit (Shopify's `ORDER_PAYMENT` of −£1.00 on #1013). It earned nothing. Home's "Store credit spent at checkout" showed £1.00. |
| E. Partial refund | Pass. Refunding 1 of #1011's 2 items took back £9.99, half of the £19.98. |
| F. Refund after the credit was spent | Pass (Decision 19). Refunding the last item asked for £9.99 and took the £8.99 left. The order panel says "Took back £8.99 of £9.99; the buyer had spent the rest", as information with no banner. |
| G. Cross a tier | Pass. The second buyer had £272 of spend. #1012 (£222.00) earned £11.10 at 5% and took them past £300; #1015 (£222.00) earned £22.20 at Gold's 10%. Home lists Gold with 3 members. |
| H. Switch off and on | Pass. With cashback off, #1014 (£222.00) earned nothing. Cashback went back on before 11:58; the payout runs at 13:30, 14:30, 15:30 and 16:30 each logged "Cron payouts succeeded", and at 16:44 the shopper's store-credit history still had no entry for #1014, so nothing was owed. |
| I. Compliance | Partly. Yu sent "Request customer data" and "Erase personal data" for "Rewards Pro" at about 11:22. The data request was refused twice and fixed: #154 logged the reason, and #155 recognised Shopify's real body, which has `orders_requested` but no `data_request` field. Shopify's retry opened the request at 12:22:30. Home's banner reads "A customer asked for their data. Download it by December 7, 2026", and Settings → Customer data requests lists Rewards Pro: received 7 Nov, due 7 Dec, expires 22 Dec, with Download. **Open:** the Download click (Yu; the Chrome tool can't click inside the app's frame), and the erasure: Shopify sends customers/redact about 10 days after the request, so around 17 Nov. |
| J. Uninstall and reinstall | **Open.** Yu, last. |
| K. Admin widths | Pass in Chrome. At laptop width the Running aside sits beside the numbers. With the app's frame set to 768 px, it folds into one line, "Cashback is on. All checks pass.", with its switch. At 390 px the numbers sit two per row, the chart is left out, and Recent rewards and Tiers follow. (The window couldn't be resized, so the frame was narrowed; the app lays out by its frame's width.) The Shopify phone-app pass is staging's (Yu's iPhone), on the same pages. |
| L. Crons | Pass. From the switch: payouts hourly from 14:30 on 2026-11-06, tiers at 02:00 (137 ms) and housekeeping at 03:00 (346 ms) on 2026-11-07, all 200; the payouts runs above all succeeded. |
| M. Needs a look | Accepted from staging and tests. A refused payout can't be produced on a real store without editing the production database. Staging ran both answers through their dialogs (staging-run.md); the Postgres suites cover the refusal paths. |
| N. Multi-currency | **Open.** different-currency-test has `enabledPresentmentCurrencies ["GBP"]` only, so there's no second currency to pay in. The app is installed there (8 scopes). Yu chooses: add a market in another currency, or accept from the tests (Ruling 66). |
| O. Missed orders/paid | Accepted from staging and tests. Staging's sweep re-recorded an order whose row was removed; the Postgres suites cover the sweep. |
| P. Past orders | Pass. The import ran with a 365-day horizon (`read_all_orders` granted). Home: "Done: 2 buyers placed in tiers". "Rewards Pro" (5 orders, £1,322.00, 19 to 24 Nov 2025, all older than 60 days) was in Gold as soon as Gold was added. Their store-credit history has nothing after 27 Nov 2025, so no credit was issued for imported orders. |

## Carried from the switch and staging

| Item | Result |
|---|---|
| `orders/paid` that renews the token first (row 7b) | Pass. #1015 was paid in the minutes before the token's hourly renewal was due. The delivery logged "Creating new session" for the store and answered 200 in 1,275 ms (Dev Dashboard). |
| Order edited before payment (Ruling 25) | Pass. #1016: placed for 2 items unpaid, edited to 1, then marked paid. Shopify's £0 removal refund arrived before the order; the app answered 503 "not recorded yet" until `orders/paid` landed, then recorded it. Credit £11.10, 5% of the £222.00 paid. |
| Order edited after payment (Ruling 25) | Pass after #156. Before it, #1017 took back £22.20 twice: once for Shopify's £0 removal refund, and again for the £222.00 money refund. On 74184b23, #1018: 2 × £222.00 paid, £44.40 credited at 10%; the edit to 1 item took back £22.20 (16:47:27); the £222.00 money refund (16:48:03, answered 200) took back nothing more. The shopper keeps £22.20 for the item kept. #1017's extra £22.20 is test money, left as is. |
| Tipped order (Ruling 26) | **Open.** A tip needs a checkout paid by card or a gateway, and a store-credit checkout earns nothing, so it can't show the tip left out of the base. The unit tests cover tips (#156 also takes them out of the money held). Yu chooses: accept from the tests, or a tipped checkout he pays on the test gateway. |
| Tax-exclusive order (rule 1, Rulings 11 and 12) | **Open**, with N: both stores show prices including tax. |
| Table paging | Accepted from tests: it needs more than one page of buyers. |
| A burst against the pool of 3 (row 3) | Pass, as far as one can be produced from outside. 15 signed deliveries were triggered at once (Shopify's samples, naming no store, so nothing is written). Shopify's queue spread them over 37 s, with 7 within about 3 s. 14 arrived, every one answered 200, and none logged a pool error; the 15th never reached the app. A sharper burst needs real traffic. |
| Export at a few thousand buyers, a large tier delete, the nightly widget step at many stores | **Open: not timed.** `max-duration.test.ts` budgets the export's name lookups inside the function's limit; nothing has timed these at scale. |
| Sentry `shop` tag | **Open, waiting on an event.** Tracing is off, so the tag shows only on an error, and production has raised no store-scoped error. Sentry's issues for the last 7 days: three from the old app (3 to 5 Nov), and three from the switch on 6 Nov, each since fixed (the B2 value fix, #150, #152 with B3 step 5). Nothing since 2026-11-06 15:15. Sentry did catch B2's cron failure, tagged `cron.job: payouts`. A unit test pins the `shop` tag. |
| Theme editor: preview after a settings change | **Open.** The Chrome tool can't click inside the editor's frame. Yu. |
| Lighthouse with the embed off and on (spec 5) | **Open.** Needs a store without a storefront password. Yu. |

## Seen on the way

- Every request logs `Pool release event triggered outside of request scope.` at info: `attachDatabasePool` reporting a connection released after the response. No error accompanies it.
- Sentry still lists those six issues as unresolved. Resolving them would let a new one stand out (Yu, in Sentry).
