---
id: kingdom-113
title: "PRISM Stripe sandbox - Free and All monthly checkout, durable webhook authority, and owner access"
status: claimed
priority: critical
engine: tcg
repo: /Users/you/Desktop/ctcg-prism-stripe-test-mode
claimed_by: codex-gpt-5
claimed_at: "2026-09-03T07:29:42Z"
completed_at: ~
paths:
  - .github/workflows/ci.yml
  - packages/prism-signals-core/**
  - apps/storefront/drizzle/0136_prism_stripe_sandbox.sql
  - apps/storefront/src/lib/product-flow-runtime/postgres.integration.test.ts
  - apps/storefront/src/lib/prism-signals/product.ts
  - apps/storefront/src/lib/prism-signals/runtime.server.ts
  - apps/storefront/src/lib/prism-signals/stripe/**
  - apps/storefront/src/app/api/prism-signals/offers/**
  - apps/storefront/src/app/api/prism-signals/subscription/**
  - apps/storefront/src/app/api/prism-signals/stripe/**
  - apps/storefront/src/app/api/webhooks/stripe/prism-signals/**
  - apps/storefront/src/app/prism-signals/page.tsx
  - apps/storefront/src/app/prism-signals/page.test.tsx
  - apps/storefront/src/app/prism-signals/account/**
  - apps/storefront/src/app/prism-signals/checkout/**
  - apps/storefront/src/app/prism-signals/terms/**
  - apps/storefront/src/app/methodology/prism-signals/**
  - apps/storefront/src/app/privacy/page.tsx
  - apps/storefront/src/app/sitemap.ts
  - apps/storefront/src/lib/manifest.ts
  - docs/methodology/prism-signals.md
  - docs/connections/the-prism-stripe-sandbox.md
  - docs/connections/README.md
  - docs/connections/the-pillow-book.md
  - docs/state.md
  - docs/missions/kingdom-113.md
do_not_touch:
  - apps/storefront/src/app/api/webhooks/stripe/route.ts
  - apps/storefront/src/app/api/membership/**
  - apps/storefront/src/lib/membership/**
  - apps/storefront/src/lib/payments/**
  - apps/storefront/src/lib/market/**
  - apps/storefront/src/lib/stripe.ts
  - apps/storefront/drizzle/0135_product_flow_runtime.sql
  - packages/data-ingest/**
  - /Users/you/Desktop/prism-app/**
related:
  - docs/missions/kingdom-109.md
  - docs/missions/kingdom-110.md
  - docs/missions/kingdom-111.md
  - docs/missions/kingdom-112.md
  - docs/connections/the-prism-beta-spine.md
synced_from: in-repo authored from Yu's 2026-09-03 ShibbySays-style monthly plan and Stripe directive
synced_at: "2026-09-03T07:29:42Z"
---

# kingdom-113 - PRISM Stripe sandbox

## Will

Yu, 2026-09-03:

> “我覺得可以跟Shibbysays😂 個月費plan. Free tier, plus all. 可以先打通stripe”

The bounded interpretation for this first Stripe slice is two levels: the
existing public **Free** synthetic preview and one **All** monthly sandbox
subscription. ShibbySays currently publishes a larger USD Patreon ladder; its
popular $5 rung is only the low-friction reference for a **£5 test amount**, not
a claim that ShibbySays has this exact two-tier tariff or that Cambridge's live
commercial/VAT decision is complete.

## Chosen slice

- Preserve the existing preview offer byte-for-byte and add a distinct
  `prism-signals-all` v1 test offer plus a PRISM-owned Free/All plan catalogue.
- Add a dedicated Stripe test client/configuration. No global Stripe key,
  shared webhook, legacy membership state, marketplace payment state, or live
  key can enter this flow.
- Add durable owner, entitlement-generation, Checkout-attempt, subscription,
  invoice-grant, and signed-event-receipt mappings. Raw Stripe identifiers stay
  server-side and never enter product-flow event payloads.
- Add authenticated, same-origin Checkout and portal routes, a dedicated
  raw-body signed webhook, owner subscription status, a Checkout-return page,
  and an All-labelled synthetic entitlement surface.
- Make `invoice.paid`, after exact local subscription/Price/currency/period
  validation, the first and only positive access authority. Checkout return
  and `checkout.session.completed` remain non-granting observations.

## Safety

- This release accepts only `sk_test_` credentials, `livemode=false` events,
  one exact active GBP monthly test Price, quantity one, and the fixed synthetic
  fixture rights posture. There is no live-key branch.
- New-checkout intake has its own switch. Pausing intake must not disable
  signed webhook processing, owner status, portal cancellation, or an existing
  paid test period.
- Free access creates no fake payment or perpetual entitlement. All access
  unlocks only an explicitly synthetic test surface; source rights for live
  opportunity signals remain `not_evaluated` and cannot be set by Stripe.
- Provider event, customer, subscription, Price, invoice, payment, and refund
  identifiers are mapped locally. Only HMAC-derived/random `pf_` references
  cross the generic runtime boundary.
- A new subscription after a terminal entitlement receives a new entitlement
  generation; ended entitlements are never reactivated.
- Unknown mappings, changed duplicates, out-of-order transitions, partial or
  historical refunds, and storage failures fail closed and remain durably
  reviewable. They do not grant or revoke access by guesswork.

## Acceptance

- Free/All catalogue and All test offer are strict, frozen, and tested; the
  legacy preview offer/API remain compatible.
- Checkout requires an authenticated active beta-interest owner, exact
  same-origin empty JSON, enabled intake posture, and a remotely attested test
  Price. Reservation and Stripe idempotency survive retries; no return URL can
  grant access.
- Webhook signature verification and a bounded raw body precede parsing. Only
  the dedicated test endpoint/account schema is accepted.
- Stripe binding, receipt, invoice grant, canonical event, and entitlement
  projection commit atomically in one storefront database transaction.
- Host projection timestamps are allocated under the entitlement lock while
  provider semantic timestamps remain in evidence, avoiding equal-second
  callback corruption.
- Duplicate delivery is exactly once; invoice renewal extends the same
  entitlement; cancel-at-period-end preserves current access; deletion and a
  full latest-period refund end it; partial/old refunds cannot.
- Owner status exposes Free/All, sandbox posture, expiry, and scheduled cancel
  without raw Stripe ids. Portal configuration allows payment-method/invoice
  management and end-of-period cancellation only; plan switching is absent.
- Missing or drifting credentials/storage/Price/portal configuration fail
  visibly. All prior non-PRISM Stripe surfaces remain byte-identical.
- Focused tests, real PostgreSQL conformance, production-mode build,
  `pnpm verify`, independent adversarial review, preview deployment, and
  fail-closed live smoke pass before merge.

