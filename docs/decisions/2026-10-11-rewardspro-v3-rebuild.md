# RewardsPro v3 is a thin-core rebuild under the same Shopify app

**Status:** accepted as the direction on 2026-10-11. The detailed policy
defaults in the spec stay open until Yu answers the questions in
[spec §12](../rewardspro-v3/spec.md#12-open-questions-for-yu-each-has-a-recommended-default).
Nothing has been built, deployed or released.

**Will trace:** Yu, 2026-10-11 — "For the rebuild, lets go for A. DB basically
gone. Was using another aws account which is deleted now. Lets just focus on the
features and rebuild everything. Take the shape. Use the same app for release
since it took quite a while to pass shopify review, and its easy to deploy with
the 殼now😂 Actually all function want, but if you think too redundant we can
remove some. yea refund deducts store credit too. need to sort out the logistics
since credits could be spent before the refund, creating loopholes. I feel like
£200-300 lah, eventually still need to make some money from it for it to be self
sustainable. But maybe a subscription that is not feature limiting, but like AI
credits and we build an API wrapper potentially. With Jev like models as base
for reducing cost and automating certain low level decisions."

Yu, same day — "Jev from typesafe ai. decision models, not LLM. for automation
instead of agentic flow. … have openrouter integration, lets link it up and find
the suitable routes for it".

## Context

A read-only map of the estate (2026-10-11,
[context map](../rewardspro-v3/context-map-2026-10-11.md)) found RewardsPro
retired in place: still installable from the App Store, about 203k LOC, with its
database and the AWS account that held it deleted. Shopify is the only surviving
system of record. Shoppers' store credit that RewardsPro issued lives in
merchants' Shopify accounts and stays valid.

## Decision

1. **Shape A.** Rebuild a thin core on the current Shopify React Router app
   template with plain Postgres, self-contained. Do not port the old code; mine
   it for domain rules ([spec Appendix A](../rewardspro-v3/spec.md)). Assume no
   legacy data.
2. **Same Shopify app.** Ship under client_id
   `026ce3bf073bed0e44ae8eab09d1ae3a` ("Rewards Pro", passed review). Preserve
   the app proxy path and the extension identities, handles and block filenames
   so merchants' theme placements survive. "殼" is read as this
   already-approved app registration.
3. **Features.** All feature areas stay. Genuinely redundant pieces are merged or
   dropped as set out in [spec §4.1](../rewardspro-v3/spec.md#41-calls): one
   prize engine for raffles, boxes and the wheel; automations through Shopify
   Flow; campaigns through segments plus Shopify Messaging or Klaviyo; points
   become one internal currency. Points-to-discount-code, store-credit-to-gift-card
   conversion, bespoke integrations and gambling-style dark patterns are dropped.
4. **Refunds claw back cashback store credit**, and the spend-before-refund
   loophole is closed by the layered policy in
   [spec §5](../rewardspro-v3/spec.md#5-money-ledger-refund-clawback-state-machines):
   a hold before release, a freeze while a return or dispute is open, debit of
   what remains, and debt netted against future earnings.
5. **Cost ceiling:** about GBP 200–300 per month in total. The spec estimates
   about GBP 18–24 at launch and about GBP 191 with every configured cap hit.
6. **AI.** Decisions use Jev, TypeSafe AI's decision model, through the existing
   OpenRouter account (`typesafe/jev-1.13` on `/api/v1/systemone`), with
   alternative decision models and deterministic rules as fallbacks. Generation
   uses pinned OpenRouter chat models. AI never moves money or changes a balance
   or tier, and no free feature depends on it
   ([AI layer design](../rewardspro-v3/ai-layer.md)). This answers spec Q18.
7. **Monetisation, later.** A subscription that never limits features and sells
   AI credits, possibly with an API wrapper, through Shopify billing. It comes
   after the core relaunch and needs its own decision on the billing rail.

## What this changes

- [2026-07-23 runtime v2](2026-07-23-rewardspro-runtime-v2.md) (ECS/Fargate and
  RDS in AWS) is superseded. `apps/rewardspro-api` was never deployed.
- [2026-07-23 free-first pricing](2026-07-23-rewardspro-free-first-pricing.md):
  every feature stays free. Its catalogue of paid capacity plans and the
  2026-09-23 retirement of new paid subscriptions are amended for RewardsPro
  only, in that a future AI-credit subscription is now the intended paid path.
  Until that ships, RewardsPro stays Free-only.
- [2026-07-23 platform](2026-07-23-rewardspro-platform.md): v3 is Shopify-only.
  The multi-platform direction is deferred and needs a fresh decision to resume.

## Consequences

- The live app cannot be updated while its customer-account extension targets
  API 2025-07, so the first release is the extension rewrite
  ([spec §8, V1 "bridge"](../rewardspro-v3/spec.md)).
- Merchants' offline tokens died with the database. Every existing shop stays
  dormant until a staff member reopens the app.
- Until v3 is live, the zombie app is contained ([spec §8, P0](../rewardspro-v3/spec.md)):
  Limited visibility on the listing, no PII from the proxy, crons off, and Git
  deploys off for the old project.
