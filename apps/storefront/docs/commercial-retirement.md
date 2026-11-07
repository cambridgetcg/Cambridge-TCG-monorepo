# New paid commerce is retired

The September 2026 understanding audit removes acquisition and revenue as requirements. There is no replacement KPI. Exploring, changing direction, or leaving a project unfinished needs no commercial justification.

`src/lib/release/commercial-retirement.ts` is the explicit source policy. New paid marketplace orders, listings, offers/counteroffers, auction bids/listings, lot purchases and automatic-pricing commitments return 410 at their existing HTTP admission boundaries and reject at the data-layer backstops. An environment flag cannot reopen them. Nonmonetary swaps retain their previous release controls. B2B checkout remains disabled.

PRISM new sandbox subscription checkout also returns 410, retaining its authentication, same-origin and body-validation boundaries. Its portal, signed webhook processing and existing receipt stores remain intact. Existing account records, paying an already-created trade/auction obligation, cancellation, refund, shipping and payout are unchanged. Existing provider sessions and agreements are not revoked or rewritten. No database migration or free-entitlement conversion is part of this change.

Public subscription sales, marketplace order forms and auction bid/listing forms are retired. Financial information used to understand an existing record remains factual information, not a growth target.

Verification: targeted paid-admission and existing-obligation tests; baseline typecheck comparison; RewardsPro safe bundle build. Full storefront local build is not claimed: reused installed dependencies cannot satisfy the isolated Turbopack workspace root and lack viem. The same nine storefront typecheck errors occur on clean main. Full repository verification includes database-capable audits and was not run against ambient credentials.

## Source admission inventory

- Ordinary retail `POST /api/checkout` and membership `POST /api/membership/subscribe` already return the pantry DEPRECATED/410 response; the retail signpost now describes the broader retirement.
- B2B `startB2BCheckout` → `startCheckout` stops at immutable `checkout_enabled: false` before reading a cart or creating Stripe checkout. New cart additions remain disabled; existing rows can be removed.
- Fresh marketplace orders, offers/counters/acceptances, lots/buy, pricing-rule creation/resumption and auction listings/bids/acceptances use the paid commitment gate. Their source route list is exercised by `commitment-boundaries.test.ts`.
- PRISM `POST /api/prism-signals/stripe/checkout` returns 410 before provider or reservation calls.
- No Shopify cart/checkout creation, external myshopify cart or Stripe payment-link entrypoint was found in storefront `src`.
- `POST /api/market/trades/[id]/pay` and `POST /api/auctions/[id]/pay` may still create Stripe sessions to settle already-created, owner-checked trade/auction obligations. They do not admit new orders. Their reconciliation, signed webhooks, shipping, refunds, cancellations and payouts are preserved.
- Bounty vault redemption endpoints create fulfilment records against existing reserved holdings; these are preserved obligations, not new sales. Membership cancel/resume/portal work on an existing provider subscription; fresh subscribe remains retired.

This inventory covers storefront source, not external provider dashboards or separate applications. No production order was created to verify retirement. Vercel subsequently built and promoted both affected applications successfully; live retirement copy was verified on their public routes.

## Data-API plans (2026-10-28)

[Yu's decision of 2026-10-28](../../../docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md) starts paid plans for the data API, which sell derived market data only. They get their own admission, separate from this retirement, and nothing above changes: `NEW_PAID_COMMERCE_RETIRED` stays `true`, the new paid admissions in the inventory above stay closed, and the preserved obligations listed there stay open.

That admission follows [the paid data API plan, §6](../../../docs/plans/tcg-data-platform/paid-data-api.md#6-billing-test-mode-only). The test-mode billing code exists and is inert:

- `src/lib/release/commercial-retirement.ts` holds a separate `DATA_API_PAID_PLANS` record (Yu, 2026-10-28; data-API subscriptions only; test-only). `src/lib/release/data-api-admission.test.ts` shows that with it present, and every data-API and PRISM switch on, marketplace, lot, auction, membership, retail and PRISM checkout still answer 410 and B2B checkout still stops at `purchases_paused`.
- `src/lib/data-api/billing/config.server.ts` refuses any Stripe key that does not start `rk_test_` or `sk_test_`; billing is then unavailable, never live. The data-API webhook (`POST /api/webhooks/stripe/data-api`) refuses `livemode` events, and 0142's tables accept only `environment = 'test'`.
- `DATA_API_CHECKOUT_INTAKE` defaults to `closed` (`src/lib/data-api/posture.ts`); `POST /api/data-api/checkout` returns 410 while it is, after validating the request and the session and before any billing configuration, billing table or Stripe call. `POST /api/data-api/portal` stays available to an account that has a data-API customer, so cancelling never depends on intake.
- Set to `test`, checkout admits operators only: accounts whose `users.role` is `admin`, testing the round trip. Every other account gets the same 410, at the same point, before any Stripe call. The reason: test mode charges nothing, so on production a member who paid with a Stripe test card would hold a paid plan's entitlement for free. Opening checkout to members waits for live keys and Yu's word. So the plan catalogue (`GET /api/v1/plans`, served only while `DATA_API_PLANS_PUBLISHED` is `on`) says `on_sale: false` in both states, with `sale_status` `closed` or `test-mode-operators-only` (`dataApiSaleStatus` in `src/lib/data-api/posture.ts`).
- `src/lib/payments/checkout-session-kind.ts` names `data_api_subscription`: the retail reconcile cron and retail fulfilment skip those sessions, and the main webhook's Platinum subscription and renewal handlers ignore subscriptions and invoices that carry the type. Charges, refunds, disputes and payment intents carry no copy of the type, so the main webhook cannot tell them apart; it records them unattributed with no side effects, and only if the data-API account also delivers to it.
- `scripts/data-api-stripe-setup.ts` creates the test products and prices from `plans.ts`; it has not been run.
- Account deletion waits while a data-API subscription has not ended, as PRISM's does; the adapter's `deleteUser` reports that hold (`src/lib/auth/erasure.ts`) instead of a bare foreign-key error.

Live keys, final prices, VAT treatment, the data-API terms and the public copy wait for Yu. No data-API plan is on sale: checkout stays closed unless `DATA_API_CHECKOUT_INTAKE` is set to `test`, which this work does not do, and even then it opens to operators only; no Stripe key comes with it, and the plan catalogue in `src/lib/data-api/plans.ts` is data only.
