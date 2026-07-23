# Rewards Pro becomes the loyalty engine; Shopify becomes a connector

**Will trace:** Yu, 2026-07-23 — “Can we expand beyond the Shopify platform?
Like make Shopify an integration as part of it.”

**Decision:** yes. Rewards Pro will evolve from a Shopify-contained application
into a commerce-independent loyalty platform. Shopify remains the only
production, self-serve commerce connector today and becomes the reference
connector for the platform seam.

This is an architectural direction, not a claim that non-Shopify connectors
already exist.

## Product boundary

Rewards Pro owns:

- merchant workspaces and loyalty programme configuration;
- canonical customer identities and external identity links;
- points, cashback, tier, mission, raffle, mystery-box, and reward ledgers;
- normalized commerce events and idempotent processing;
- analytics, automation, and outbound loyalty events;
- connector capabilities and their visible limitations.

A commerce connector owns:

- installation and authorization for its platform;
- mapping platform customers, orders, refunds, products, and currencies into
  the canonical model;
- subscribing to platform events and reconciling missed events;
- applying or issuing a redemption through the platform’s supported mechanism;
- platform-native customer and merchant surfaces where they are useful;
- platform billing only when that connector uses platform billing.

Shopify-specific behavior such as Admin authentication, Shopify Billing, theme
extensions, customer-account extensions, and native store credit stays in the
Shopify connector. It must not define the platform core.

## Truthful status vocabulary

The public site uses four statuses:

| Status | Meaning |
|---|---|
| **Available** | Production-supported, self-serve, and end-to-end. |
| **Planned** | Chosen as a next connector, but not available to merchants. |
| **Design phase** | Its public contract is being defined; no production API is promised. |
| **Exploring** | Demand and feasibility are being assessed; there is no delivery commitment. |

As of this decision:

| Surface | Status | Honest scope |
|---|---|---|
| Shopify | **Available** | Full current Rewards Pro application. |
| WooCommerce | **Planned** | First full non-Shopify commerce connector. |
| Headless API | **Design phase** | Canonical event, identity, balance, and redemption contracts. |
| Stripe | **Exploring** | Payment/subscription earning connector first; not a complete commerce platform. |
| POS providers | **Exploring** | Later omnichannel work after identity and redemption are proven. |

“API access” is not treated as available merely because an entitlement flag or
internal route exists. A public API becomes **Available** only when it has
merchant authentication, versioned documentation, idempotency semantics, a
sandbox or test path, signed webhooks, and a working reference integration.

## Migration shape

The existing schema is intentionally not renamed in one destructive migration.
`shop`, `shopifyCustomerId`, and `shopifyOrderId` are widespread and currently
carry real production behavior. The seam is introduced alongside them.

### Phase 0 — name the boundary

1. Add a `Workspace` (or `MerchantAccount`) as the platform tenant.
2. Add `CommerceConnection` with `provider`, external account ID, status,
   credentials reference, capabilities, and sync cursors.
3. Backfill one workspace and one Shopify connection for every existing shop.
4. Keep existing `shop` fields as compatibility keys during the migration.

### Phase 1 — normalize identity, then events

1. Add external identity records for customers, orders, products, and rewards:
   `(connectionId, entityType, externalId)`.
2. Begin with a normalized `UpsertCustomer` command and a Shopify payload
   mapper; dual-write the external identity and existing Shopify ID.
3. Then define versioned commerce events such as `order.paid`,
   `order.refunded`, and `redemption.updated`.
4. Require connector-scoped idempotency keys and persist raw event provenance.
5. Route the existing Shopify webhooks through the normalized handlers without
   changing merchant-visible behavior.

### Phase 2 — capability-based redemption

Connectors declare capabilities instead of pretending to be equivalent:

- `native_store_credit`
- `coupon_redemption`
- `gift_card_redemption`
- `checkout_redemption`
- `customer_portal_embed`
- `historical_order_sync`
- `subscription_events`

The core asks for a capability and exposes the consequence when a connector
cannot provide parity. “Cashback” may mean Shopify store credit on Shopify and
a single-use coupon on an early WooCommerce connector; the UI must name that
difference.

### Phase 3 — second connector

WooCommerce is the first full proof that the seam is real:

- a small WordPress connector plugin handles authorization, webhook
  registration, wallet/widget surfaces, and checkout redemption;
- the hosted Rewards Pro dashboard remains the programme control plane;
- webhooks are backed by reconciliation polling;
- the MVP supports registered customers, one base currency, order/refund
  earning, tiers and points, missions, and restricted single-use coupons;
- Shopify-equivalent store credit is not claimed until its refund, expiry, and
  checkout behavior is proven.

### Phase 4 — headless private beta

Only after Shopify and WooCommerce exercise the same contracts:

- customer upsert and identity linking;
- paid-order and refund ingestion;
- balance, tier, and mission reads;
- redemption reserve / commit / release;
- signed outbound webhooks and reconciliation;
- a working reference wallet and checkout implementation.

## First implementation slice

The smallest useful backend slice is deliberately narrow:

1. introduce `Workspace`, `CommerceConnection`, `CommerceProvider`, and
   `CustomerExternalIdentity`;
2. backfill current shops as Shopify connections;
3. define a provider-neutral `UpsertCustomer` command;
4. map Shopify customer create/update payloads into that command;
5. dual-write the new external identity and the existing
   `shopifyCustomerId`;
6. prove mapper correctness, connection-scoped idempotency,
   cross-workspace isolation, and unchanged webhook behavior.

No WooCommerce code is needed to prove this slice. The first test of the
architecture is whether Shopify customer ingress can pass through the new seam
without losing behavior. Paid-order and refund normalization follows as the
second slice, after the tenant and identity boundary has held.

## Public positioning

The headline can be broader than Shopify because it describes the direction:

> One loyalty engine. Every place you sell.

The supporting copy must immediately ground the claim:

> Rewards Pro is growing into a commerce-independent loyalty platform.
> Shopify is available today. WooCommerce and a headless API are next.

This keeps the ambition visible without presenting a roadmap as shipped
software.
