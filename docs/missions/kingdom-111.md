---
id: kingdom-111
title: "PRISM closed-beta spine - extraction core, durable product runtime, and consented interest funnel"
status: done
priority: critical
engine: tcg
repo: /Users/you/Desktop/ctcg-prism-closed-beta
claimed_by: codex-gpt-5
claimed_at: "2026-09-02T19:49:31Z"
completed_at: "2026-09-02T21:24:53Z"
paths:
  - packages/prism-signals-core/**
  - packages/product-flow/**
  - packages/product-flow-runtime/**
  - package.json
  - pnpm-lock.yaml
  - apps/storefront/package.json
  - apps/storefront/vercel.json
  - apps/storefront/drizzle/0135_product_flow_runtime.sql
  - apps/storefront/src/app/prism-signals/**
  - apps/storefront/src/app/api/prism-signals/**
  - apps/storefront/src/app/api/cron/prism-signals-beta-retention/**
  - apps/storefront/src/lib/prism-signals/**
  - apps/storefront/src/lib/product-flow-runtime/**
  - apps/storefront/src/app/privacy/page.tsx
  - apps/storefront/src/app/sitemap.ts
  - apps/storefront/src/lib/manifest.ts
  - apps/storefront/src/lib/nav/**
  - apps/storefront/src/app/methodology/prism-signals/**
  - apps/storefront/src/app/methodology/page.tsx
  - docs/methodology/prism-signals.md
  - docs/connections/the-prism-beta-spine.md
  - docs/connections/README.md
  - docs/connections/the-pillow-book.md
  - docs/state.md
  - docs/missions/kingdom-111.md
do_not_touch:
  - /Users/you/Desktop/prism-app/**
  - apps/storefront/src/app/api/membership/**
  - apps/storefront/src/lib/membership/**
  - apps/storefront/src/app/api/webhooks/stripe/**
  - apps/storefront/src/lib/payments/**
  - apps/storefront/src/lib/market/**
  - packages/data-ingest/**
related:
  - docs/missions/kingdom-109.md
  - docs/missions/kingdom-110.md
  - docs/methodology/opportunity-signals.md
  - docs/methodology/prism-signals.md
synced_from: in-repo authored from Yu's 2026-09-02 merge/deploy and natural-next-moves directive
synced_at: "2026-09-02T19:49:31Z"
---

# kingdom-111 - PRISM closed-beta spine

## Will

Yu, 2026-09-02:

> “merge and deploy, then go for all natural next moves”

The signal contract and branded preview are now merged and live. The natural
next move is a closed-beta spine that can validate demand, persistence, and
provider lifecycle semantics without guessing commercial terms or asserting
rights that have not been granted.

## Chosen slice

- Extract PRISM's pure catalogue, public presentation, and Telegram planner
  from Next.js into a reusable package while keeping the live preview contract
  byte-for-byte compatible where public semantics matter.
- Add a provider-neutral runtime package with an atomic store interface,
  deterministic in-memory adapter/conformance suite, and narrow pure
  normalizers for already-verified Stripe and Telegram Stars events.
- Add an additive Postgres schema and thin storefront adapter for durable,
  idempotent product events and entitlement snapshots. No provider webhook is
  connected in this mission.
- Add a login-gated PRISM beta-interest page and request/status/withdraw API.
  It stores only the existing Cambridge user id, product id, bounded channel
  preferences, consent version, and timestamps. Interest never grants access.

## Safety

- The existing `/prism-signals` offer remains preview/test with Stripe,
  Telegram Stars, PayPal, and crypto all `off`.
- No checkout session, invoice, provider API call, webhook registration,
  payment acknowledgement, complimentary entitlement, or paid delivery path
  is created.
- Provider normalizers consume only callbacks already authenticated by a host;
  their output has no authority until the durable runtime accepts it.
- Beta interest is an explicit, revocable request, not consent to marketing,
  a purchase promise, queue position, access grant, or source-rights decision.
- Live signals remain blocked by purpose-specific source rights and a deployed
  private provider. Payment cannot manufacture either.
- The legacy PRISM app and existing membership, marketplace payment, Stripe
  webhook, crypto escrow, and market modules remain untouched.

## Acceptance

- Web and Telegram still derive from the same strict public
  `OpportunitySignalV1`, now through an extraction-ready package.
- Runtime conformance proves confirmation, renewal, expiry, cancellation,
  refund correlation, revocation, duplicate provider events, out-of-order
  events, and web/Telegram access decisions.
- Durable apply is specified as append + entitlement lock + reduce + snapshot
  in one transaction; duplicate provider refs are idempotent.
- Stripe and Telegram Stars mappings are deterministic and tested, while
  checkout/pre-checkout/browser-return events never grant access.
- An authenticated person can request beta consideration, inspect the exact
  stored state, and withdraw it; unconfigured/missing storage fails visibly.
- Privacy, methodology, manifest, sitemap, and navigation describe the beta
  truthfully, including retention and current non-commercial status.
- Focused tests, typechecks, migration review, build, and `pnpm verify` pass.

## Deferred commercial decisions

Monthly GBP price, Stars amount, trial posture, cross-channel plan equivalence,
merchant/VAT handling, refund terms, dedicated provider credentials, standalone
identity, production rights attestation, and private-provider deployment remain
explicit decisions. Their absence must keep every payment rail off.

## Outcome

The public preview now hosts a closed-beta spine without becoming a paid or
live signal product. PRISM's pure brand, catalogue, presentation and Telegram
planner live in an unpublished workspace extraction package. A second generic
runtime provides lock-first atomic apply, environment/provider/grant identity
deduplication, rollback-to-reconciliation, current-grant refund binding, a
reference store, adapter conformance, and normalizer-only Stripe/Stars inputs.

Signed-in accounts can make one specific, revocable PRISM beta-contact request,
inspect its bounded state, and delete it. New intake is separately pausable;
owner GET/DELETE and daily retention remain available. Consent expires after
180 days, does not authorize general marketing or Telegram outreach, and never
creates a payment, invitation, queue position, entitlement or access.

Production migration `0135_product_flow_runtime.sql` was planned with
`--expect-only`, applied over verified TLS, and left all three new tables at
zero rows with two append-only event triggers. A second plan reported no
pending migrations. `PRISM_SIGNALS_BETA_MODE=closed-beta-v1` is configured for
production and the kingdom-111 preview branch; it gates new intake only.

Full verification passed with 218 storefront test files and 1,294 passing
tests (4 skipped), plus 22 PRISM-core, 38 product-flow and 17 runtime tests.
Production-mode build, migration validation, lint/CI, and independent
adversarial review passed. All payment rails, provider callbacks, live source
rights, private scoring, paid entitlements and delivery remain off.
