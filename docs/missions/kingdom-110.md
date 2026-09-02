---
id: kingdom-110
title: "PRISM Signals MVP - reusable product flow, branded preview, and Telegram test channel"
status: done
priority: critical
engine: tcg
repo: /Users/you/Desktop/ctcg-prism-signals-mvp
claimed_by: codex-gpt-5
claimed_at: "2026-09-02T14:51:36Z"
completed_at: "2026-09-02T16:51:28Z"
paths:
  - packages/product-flow/**
  - package.json
  - pnpm-lock.yaml
  - apps/storefront/.env.example
  - apps/storefront/package.json
  - apps/storefront/tsconfig.json
  - apps/storefront/src/app/prism-signals/**
  - apps/storefront/src/app/privacy/page.tsx
  - apps/storefront/src/app/api/prism-signals/**
  - apps/storefront/src/lib/prism-signals/**
  - apps/storefront/src/app/methodology/prism-signals/**
  - apps/storefront/src/app/methodology/page.tsx
  - apps/storefront/src/lib/manifest.ts
  - apps/storefront/src/lib/nav/**
  - apps/storefront/src/app/sitemap.ts
  - docs/methodology/prism-signals.md
  - docs/connections/the-prism-door.md
  - docs/connections/README.md
  - docs/connections/the-pillow-book.md
  - docs/state.md
  - docs/missions/kingdom-110.md
do_not_touch:
  - packages/data-ingest/**
  - packages/opportunity-signal/**
  - apps/storefront/drizzle/**
  - apps/storefront/src/app/api/webhooks/stripe/**
  - apps/storefront/src/app/api/membership/**
  - apps/storefront/src/lib/payments/**
  - apps/storefront/src/lib/membership/**
  - apps/storefront/src/lib/market/**
  - /Users/you/Desktop/prism-app/**
related:
  - docs/missions/kingdom-109.md
  - docs/methodology/opportunity-signals.md
  - docs/connections/the-opportunity-signal.md
  - docs/decisions/2026-07-06-collectors-first.md
synced_from: in-repo authored from Yu's 2026-09-02 PRISM Signals MVP directive
synced_at: "2026-09-02T14:51:36Z"
---

# kingdom-110 - PRISM Signals MVP

## Will

Yu, 2026-09-02:

> “go for it! 同埋我想之後抽個MVP出來單獨sell, through telegram and a
> new page. Branded. Gonna test it out here and we are creating much more
> products and standardising the flow.”

## Chosen slice

Build an extraction-ready, provider-neutral product-flow core; a branded
**PRISM Signals by Cambridge TCG** preview page; and a fail-closed Telegram
test webhook. The preview uses synthetic signal content only. It creates no
historic-data sale, source adapter, live scorer, database entitlement, payment
session, Stars invoice, PayPal plan, crypto transfer, alert queue, or trade
execution path.

The web and Telegram surfaces must consume the same canonical product offer and
public signal-presentation contract. This is the first reusable product shell,
not a new Cambridge membership tier and not a revival of the dormant legacy
PRISM application.

## Contract

- One canonical product/offer definition names brand, status, audience,
  delivery channels, billing rails, rights purpose, support, terms, and fixed
  non-claims.
- One entitlement reducer models provider-neutral payment lifecycle events;
  access can become active only from confirmed provider evidence, never a
  browser redirect or Telegram pre-checkout request.
- Test and production environments remain disjoint in every offer, event, and
  entitlement decision.
- Telegram webhook requests require the configured secret header, a bounded
  JSON body, a private chat, and an allowlisted command.
- `/demo`, `/terms`, `/support`, and `/paysupport` can reply in test mode;
  purchase/pre-checkout events fail closed because durable billing is absent.
- Telegram digital-goods payment is modelled as Stars only; web Stripe is a
  separate future adapter. PayPal and crypto stay explicitly later/off.
- Public presentation receives only a final `OpportunitySignalV1`-shaped
  synthetic illustration and never source rows, candidate URLs, exact
  valuation, model output, thresholds, or private debug fields.

## Safety

- No source permission is inferred from payment, transformation, secrecy, or
  public reachability.
- No bot token, webhook secret, engine credential, or raw evidence reaches a
  client bundle, response body, log fixture, or repository.
- No untrusted Telegram username, chat id, deep-link parameter, redirect, or
  provider callback grants access.
- The Telegram response path performs no outbound fetch and no persistence in
  this slice; its direct webhook reply is demonstrably test/demo only.
- The legacy `prism-app` Vercel project, database, crons, and API remain
  untouched and dormant.

## Acceptance

- A zero-runtime-dependency product-flow workspace package ships with strict
  validation, entitlement projection, Telegram-safe vocabulary, and focused
  deterministic tests.
- `/prism-signals` is a branded, accessible, responsive server-rendered page
  with an unmistakable synthetic/test-mode banner and no fabricated social
  proof, performance claim, price, or availability claim.
- A dedicated no-store Telegram route verifies configuration and secret before
  parsing, bounds input, handles only the preview command set, and refuses all
  payment or entitlement claims.
- Product copy and methodology distinguish potential deals from arbitrage,
  evidence confidence from profit probability, and channel access from source
  rights.
- The page is reachable through the existing navigation/manifest/sitemap
  conventions without changing market, membership, or payment behavior.
- Focused tests, storefront typecheck/build, audits, and `pnpm verify` pass.

## In-repo addendum

This mission is repository-authored because the accessible canonical private
queue does not contain this new user directive. It stacks on the corrected
kingdom-109 feature branch while public PR #57 remains under review.

## Outcome

PRISM Signals now has a branded, responsive web preview; a strictly bounded
Telegram test webhook; one parsed public `OpportunitySignalV1` fixture shared
by both readings; and a reusable provider-neutral product offer, entitlement,
access, and deep-link package. Provider evidence is scope-bound, replay-safe,
and refund-correlated. The Telegram command surface is an exact allowlist and
payment-bearing updates fail with a retryable non-success response.

All commercial rails, live data, source adapters, production engine calls,
checkout sessions, invoices, durable entitlements, bot registration, outbound
delivery, and trade execution remain off. Source rights remain explicitly not
evaluated, so this preview grants no source or redistribution permission.
