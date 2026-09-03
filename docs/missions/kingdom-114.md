---
id: kingdom-114
title: "PRISM Stripe sandbox activation - posture-aware deploys, least-privilege key, operator controls, and real provider rehearsal"
status: claimed
priority: critical
engine: tcg
repo: /Users/you/Desktop/ctcg-prism-stripe-test-mode
claimed_by: codex-gpt-5
claimed_at: "2026-09-03T20:43:24Z"
completed_at: ~
paths:
  - .github/workflows/ci.yml
  - package.json
  - apps/storefront/package.json
  - apps/storefront/scripts/deploy-verify-contract.ts
  - apps/storefront/scripts/deploy-verify.ts
  - apps/storefront/scripts/prism-stripe-operator.ts
  - apps/storefront/scripts/prism-stripe-provider-preflight.ts
  - apps/storefront/src/lib/deploy-verify-contract.test.ts
  - apps/storefront/src/lib/prism-signals/stripe/operator.test.ts
  - apps/storefront/src/lib/prism-signals/stripe/provider-preflight.test.ts
  - apps/storefront/src/lib/prism-signals/stripe/config.server.ts
  - apps/storefront/src/lib/prism-signals/stripe/config.server.test.ts
  - apps/storefront/src/app/methodology/prism-signals/**
  - apps/storefront/src/app/prism-signals/page.tsx
  - apps/storefront/src/app/prism-signals/page.test.tsx
  - apps/storefront/src/lib/manifest.ts
  - docs/methodology/prism-signals.md
  - docs/connections/the-prism-stripe-sandbox.md
  - docs/connections/README.md
  - docs/connections/the-pillow-book.md
  - docs/state.md
  - docs/missions/kingdom-114.md
do_not_touch:
  - apps/storefront/src/app/api/webhooks/stripe/route.ts
  - apps/storefront/src/app/api/webhooks/stripe/prism-signals/**
  - apps/storefront/src/app/api/prism-signals/stripe/**
  - apps/storefront/src/lib/prism-signals/stripe/webhook.server.ts
  - apps/storefront/drizzle/0136_prism_stripe_sandbox.sql
  - apps/storefront/src/lib/membership/**
  - apps/storefront/src/lib/payments/**
  - apps/storefront/src/lib/stripe.ts
  - packages/data-ingest/**
  - /Users/you/Desktop/prism-app/**
related:
  - docs/missions/kingdom-113.md
  - docs/connections/the-prism-stripe-sandbox.md
synced_from: in-repo authored from Yu's 2026-09-03 Stripe sandbox login and correction to use the sandbox rather than live account
synced_at: "2026-09-03T20:43:24Z"
---

# kingdom-114 - PRISM Stripe sandbox activation

## Will

Yu, 2026-09-03:

> “Stripe logged in”

Then, when the CLI showed a live-only context:

> “oh sorry I thought you need the live acc, should I log into sandbox?”

Yes: this activation is sandbox-only. A live Stripe account, key, object or
event is outside the mission.

## Chosen slice

- Keep the Product, GBP £5 monthly Price, restricted portal and direct webhook
  already provisioned in the separately authorized Cambridge TCG sandbox.
- Make the canonical deploy verifier accept only the exact unconfigured,
  configured-paused and processing-enabled PRISM response contracts without
  relaxing any global status rule.
- Add a bounded operator command for invitation status/grant/revoke and refund
  reconciliation visibility, with production-target and confirmation guards.
- Add a provider preflight that exercises every permission the final dedicated
  restricted test key needs, including Events Read, without creating a charge.
- Stage all production variables with both switches disabled, deploy and
  attest; then enable webhook processing in a fresh deployment and rehearse
  signed provider events before enabling Checkout intake in a final deployment.

## Safety

- Never add `--live`, deploy a CLI OAuth credential, reuse a legacy
  `STRIPE_*` key/webhook, or expose a secret in logs, chat, git, process output
  or a public response.
- The runtime credential must be a separately named sandbox `rk_test_` with the
  minimum read/write permissions actually used by the host.
- Every Vercel environment transition requires a fresh deployment of one
  reviewed main SHA. Rollback means a newer deployment with intake disabled;
  never alias an older deployment that lacks lifecycle credentials.
- Invitation and refund-reconciliation operations default to read-only. Writes
  require an exact account target, explicit action, bounded expiry/reason and a
  confirmation token; no email copy enters the Stripe mapping tables.
- Product/Price/portal/webhook retrieval must independently prove
  `livemode=false`, exact account, API version, event list and feature contract
  before any switch is enabled.

## Acceptance

- `pnpm audit:deploy-verify` passes against all three intentional PRISM
  postures and still rejects a generic 200/400/503 or wrong body/cache policy.
- The checked-in restricted-key list includes Account read, Price read,
  Checkout Session write, Events read, Subscription read, Invoice Payment
  read/list, PaymentIntent read, Invoice read, Portal Configuration read and
  Portal Session write. Product and Webhook Endpoint retrieval remain
  operator/OAuth attestations rather than unused runtime permissions. The final
  `rk_test_` passes each non-mutating preflight possible before Checkout.
- Operator tooling can show invitation/reconciliation state without PII;
  grant/revoke is transactionally bounded and covered by real PostgreSQL tests.
- Documentation truth changes alongside operations: provisioned sandbox
  resources, configured production variables, switch stage and remaining
  no-live/no-exclusive-payload limits are explicit.
- Both-disabled, processing-only and intake-enabled deployments each reach
  READY on the expected SHA and pass their exact live smoke contract.
- One invited account completes initial Checkout, duplicate delivery, renewal
  or test-clock equivalent, failed-payment observation, cancel/resume, latest
  full refund and terminal cancellation reconciliation before this mission can
  call the sandbox operational.
