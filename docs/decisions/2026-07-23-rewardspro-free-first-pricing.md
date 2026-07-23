# RewardsPro uses a free-first, fixed-price catalogue

**Status:** accepted in the application contract; production billing and public
distribution changes remain gated.

**Will trace:** Yu, 2026-07-23 — “Wanna make it cheap and have a generous free
tier for everyone to use! Only for larger corporates should we charge more.
Small business should have enough from free plan.”

## Context

RewardsPro had several competing pricing tables, old trial and overage language,
and plan names that did not consistently match Shopify subscription names.
That made it possible for the storefront, billing routes, entitlements, and
usage enforcement to tell merchants different stories.

The product should be usable by a normal small business without a payment
decision. Paid plans buy substantially more capacity and support, not access to
the basic loyalty system. Large corporate requirements are where pricing rises
materially.

The canonical application contract is
`apps/rewardspro/app/constants/pricing-contract.ts`. Public copy, billing
configuration, entitlement defaults, and tests must derive from that contract
rather than reproduce its values.

## Decision

RewardsPro has four public plans and one private plan. Prices are USD before
tax. Annual prices are the total annual charge and equal ten monthly payments.
There is no trial: Free Forever is the evaluation path.

| Public name | Monthly | Annual | Availability |
| --- | ---: | ---: | --- |
| Free Forever | $0 | — | Public |
| Grow | $29 | $290 | Public |
| Scale | $79 | $790 | Public |
| Corporate | $499 | $4,990 | Public |
| Enterprise | From $999 | Custom | Private agreement only |

Paid subscriptions are fixed recurring charges. They have no usage-priced line
item, overage rate, GMV percentage, or customer-count billing meter. The order,
email, and other limits below are capacity and upgrade signals, not inputs to a
variable invoice.

This makes a merchant's bill predictable and keeps RewardsPro aligned with the
value it is trying to create. GMV-based pricing taxes merchant success,
customer-count pricing makes imported or inactive records unexpectedly
expensive, and overages turn ordinary traffic spikes into surprise bills.

## Capacity contract

Order and email allowances are tracked monthly. The other values are active or
retained capacity. “Unlimited” is represented in application and database
boundaries by the shared `999,999` sentinel; user-facing copy must render it as
“Unlimited”, not expose that implementation value.

| Capacity | Free Forever | Grow | Scale | Corporate | Enterprise |
| --- | ---: | ---: | ---: | ---: | ---: |
| Reward-eligible orders / month | 1,000 | 10,000 | 25,000 | 100,000 | Unlimited |
| Loyalty tiers | 5 | 20 | 50 | Unlimited | Unlimited |
| Automations | 5 | 25 | 100 | Unlimited | Unlimited |
| Customers synced | 10,000 | 100,000 | 500,000 | Unlimited | Unlimited |
| Historical data | 365 days | Unlimited | Unlimited | Unlimited | Unlimited |
| Products per tier | 5 | 20 | 50 | Unlimited | Unlimited |
| Emails / month | 1,000 | 10,000 | 25,000 | 100,000 | Unlimited |
| Member export rows | 10,000 | 100,000 | 500,000 | Unlimited | Unlimited |
| Active raffles | 3 | 10 | 25 | Unlimited | Unlimited |
| Active mystery boxes | 3 | 10 | 25 | Unlimited | Unlimited |
| Active challenges | 5 | 25 | 100 | Unlimited | Unlimited |
| Campaigns | 5 | 25 | 100 | Unlimited | Unlimited |
| Automation flows | 3 | 15 | 50 | Unlimited | Unlimited |
| Email notifications | Included | Included | Included | Included | Included |
| Advanced analytics | Included | Included | Included | Included | Included |
| API access | Included | Included | Included | Included | Included |

Free Forever therefore contains a complete small-business loyalty programme.
Core earning, redemption, notifications, analytics, and API access are not paid
feature gates.

## Corporate claims

The current Corporate contract supports claims about:

- its published high-volume capacities;
- the white-label entitlement;
- corporate support classification; and
- the same complete loyalty feature set available on lower plans.

The following are not part of this decision and must not appear in sales,
pricing, App Store, or in-product copy until they are separately built,
verified, and staffed:

- multi-store organisation management;
- organisation roles or enterprise RBAC;
- SAML, SSO, or SCIM;
- a contractual uptime or response-time SLA;
- a named account manager or managed onboarding;
- bespoke integrations, data warehousing, or migration services.

Enterprise is a private commercial boundary for genuinely complex
organisations. Its exact support and implementation commitments belong in the
signed agreement; the application must not imply them from the plan name.

## Stable Shopify names and legacy recognition

Merchant-facing display names change without renaming established Shopify
billing identities:

| Internal key | Display name | Shopify monthly name | Shopify annual name |
| --- | --- | --- | --- |
| `free` | Free Forever | `RewardsPro Free` | — |
| `pro` | Grow | `RewardsPro Pro` | `RewardsPro Pro Annual` |
| `max` | Scale | `RewardsPro Max` | `RewardsPro Max Annual` |
| `ultra` | Corporate | `RewardsPro Ultra` | `RewardsPro Ultra Annual` |
| `enterprise` | Enterprise | `RewardsPro Enterprise` | — |

Legacy aliases are recognition-only. In particular, Starter, RewardsPro
Monthly, RewardsPro Annual, and RewardsPro Usage resolve to `pro`; Growth
resolves to `max`; and Unlimited resolves to `ultra`. Old annual spellings also
resolve to their matching internal key. New checkout and public UI must use the
current catalogue rather than create an old SKU.

Runtime display fallback may be forgiving, but migrations must be strict:
an unknown live plan name aborts the migration instead of silently assigning
Free Forever.

## Enforcement and data preservation

Capacity enforcement is advisory during this rollout:

- approaching and exceeding a capacity produces observable usage, an in-app
  warning, and an upgrade path;
- it does not create a Shopify usage charge or variable invoice;
- it does not lock the admin, disable access to history, or remove API access;
- it does not stop a merchant from viewing or exporting data;
- it does not stop customers from redeeming already-earned value; and
- it never deletes, expires, rewrites, or reduces points, cashback, store
  credit, tier progress, or other loyalty balances.

Existing over-limit shops remain operational while reconciliation and merchant
communication happen. Any future hard capacity policy needs a separate
decision covering grace periods, idempotent reconciliation, notification, and
the same balance-preservation invariants.

The system may continue to read legacy usage line items for subscription
recognition and audit. All paths that create new usage records or usage-priced
subscriptions must remain disabled.

## Entitlement backfill

The checked-in Prisma history is not sufficient evidence of the live
`ShopEntitlements` and `MonthlyOrderUsage` schema: those objects have previously
been created outside ordinary migration history. The existing entitlement
migration script must not be run blindly.

Before any production write:

1. Read the live schema, migration ledger, row counts, distinct plan names,
   active Shopify subscription names, current-period usage rows, and both
   entitlement cache keyspaces.
2. Take a restorable database snapshot and export the affected entitlement and
   current-period usage rows.
3. Run a default-dry-run backfill against the live shape. Require an explicit
   apply flag and expected shop count. Abort on schema mismatch, duplicate
   shops, unknown plans, or an unexpected affected-row count.
4. For each shop, resolve the plan through the canonical strict alias map.
   Create missing entitlements, but preserve explicit merchant or operator
   overrides. Never decrease an existing numeric capacity or change a
   capability from enabled to disabled.
5. Align current-period limit snapshots with the resolved plan without
   rewriting historical usage periods. The backfill must not touch customer
   balances, ledger entries, rewards, cashback, or store credit.
6. Invalidate both entitlement cache keyspaces for changed shops.
7. Verify shop counts, per-plan counts, before/after deltas, monotonic
   entitlements, current-period usage, and a sample of legacy subscription
   mappings. Run the backfill again and require a zero-change idempotency result.

Rollback restores the exported entitlement and current-period usage rows,
invalidates both caches, and rolls application code back to the last compatible
catalogue. It does not cancel or replace Shopify subscriptions. If any balance
or ledger table appears in the write set, stop rather than continue or roll
forward.

## Shopify App Pricing cutover

Shopify App Pricing is a later distribution change, not part of accepting this
application contract. Shopify's official references are:

- [Shopify App Pricing overview](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing)
- [Create and manage pricing plans](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing/plans)
- [Migrate to Shopify App Pricing](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing/migrating-to-shopify-app-pricing)

The cutover checklist is:

1. Inventory active manual Billing API subscriptions, their fixed and usage
   line items, billing intervals, currencies, and legacy names. Reconcile that
   inventory to shops and entitlements.
2. In the Partner Dashboard, create draft fixed-price plans matching this
   decision. Do not add usage components. Keep the draft unpublished.
3. Store Partner plan handles as configuration and map each handle to one
   canonical internal key. Continue to recognise legacy Shopify names.
4. Make the return path accept App Pricing's plan handle while retaining the
   legacy `charge_id` path during migration.
5. During coexistence, resolve an authoritative App Pricing subscription first
   and fall back to the Admin Billing API for grandfathered subscriptions.
   Transient lookup failures preserve the last known paid entitlement; they do
   not downgrade a shop to free.
6. In development and a controlled test shop, verify first install, Free
   Forever, monthly and annual purchase, upgrade, downgrade, cancellation,
   uninstall/reinstall, failed return, and retry behaviour. Confirm no flow can
   create a usage line item.
7. Complete the entitlement dry run and reconciliation above. Record explicit
   go/no-go approval, owner, support coverage, monitoring, and rollback window.
8. Publish the pricing configuration and switch new purchases only in the
   approved window. Grandfather or migrate existing subscriptions according to
   Shopify's documented migration flow; do not cancel them opportunistically.
9. Monitor subscription resolution, checkout returns, entitlement changes,
   usage-charge attempts, and support contacts. Keep the legacy resolver until
   every grandfathered subscription is accounted for.

## Public copy and release boundary

No Partner Dashboard plan, Shopify App Pricing configuration, live
subscription, App Store listing, external website, production database, or
deployment is changed by this decision.

After the application contract and migration tooling pass review, a separately
approved release must update `rewardspro.io`, the Shopify App Store listing,
screenshots, pricing FAQ, support material, and terms together. Public copy
must use the exact prices and capacities here, remove trial and overage
language, and avoid the unbuilt Corporate claims above.

## Consequences

- Small businesses can run the complete product on Free Forever with meaningful
  capacity.
- Paid revenue comes from predictable expansion and corporate needs rather than
  surprise usage charges.
- Stable Shopify billing names reduce migration risk, at the cost of internal
  keys and invoices not always matching the newer display vocabulary.
- Advisory enforcement delays monetisation at the margin, but protects merchant
  trust and financially meaningful customer data while usage measurement is
  made reliable.
- App Pricing, entitlement backfill, external copy, and production rollout each
  retain an explicit approval and verification gate.
