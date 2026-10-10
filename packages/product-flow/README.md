# `@cambridge-tcg/product-flow`

A zero-runtime-dependency contract boundary for reusable digital-product
offers, provider-neutral entitlement events, and web/Telegram delivery.

The package parses plain JSON, rejects unknown fields, returns deeply frozen
copies, and projects entitlements with pure functions. It does not read a
clock or environment variable, perform I/O, call a payment provider or
Telegram, persist state, authenticate a webhook, or accept API tokens.

## Offer contract

Every offer uses `cambridgetcg.product-offer/1` and declares both delivery
channels plus every v1 payment rail. An unavailable rail is explicit `off`,
not missing.

```ts
import {
  PRODUCT_OFFER_NON_CLAIMS,
  parseProductOfferV1,
} from "@cambridge-tcg/product-flow";

const offer = parseProductOfferV1({
  schema: "cambridgetcg.product-offer/1",
  brand: {
    name: "Example Studio",
    product_name: "Example Briefing",
    byline: "Example Briefing by Example Studio",
  },
  id: "example-briefing",
  version: 1,
  status: "preview",
  environment: "test",
  audience: "People evaluating a clearly labelled product preview.",
  delivery: {
    web: { availability: "test", url: "/example-briefing" },
    telegram: {
      availability: "test",
      bot_username: "ExampleBriefingBot",
      start_parameter: "example_preview",
    },
  },
  rails: [
    { rail: "stripe_web", channel: "web", availability: "off" },
    { rail: "telegram_stars", channel: "telegram", availability: "off" },
    { rail: "paypal_web", channel: "web", availability: "off" },
    { rail: "crypto_web", channel: "web", availability: "off" },
  ],
  rights: {
    purpose: "subscriber_derived_briefing",
    decision: "not_evaluated",
  },
  links: {
    terms: "/example-briefing/terms",
    support: "/example-briefing/support",
    methodology: "/methodology/example-briefing",
  },
  non_claims: [...PRODUCT_OFFER_NON_CLAIMS],
});
```

Offer invariants:

- `preview` and `test` offers are test-environment only; `live` offers are
  production-only.
- A preview may expose test delivery, but all of its payment rails remain
  `off`. A test offer may declare `test` rails. Only a live production offer
  may declare `live` delivery or rails.
- An enabled rail requires a matching enabled delivery channel. `off` rails
  must omit `price_ref`; `test` and `live` rails require a bounded opaque one.
- `telegram_stars` belongs only to Telegram. `stripe_web`, `paypal_web`, and
  `crypto_web` belong only to web. The package cannot be configured to route
  one through the other.
- A live offer requires `rights.decision: "granted"`, but this is a
  trusted-host catalogue assertion—not an authenticated rights receipt. The
  package cannot verify authority, evidence binding, issuance, expiry, or a
  signature. Before constructing a live offer, the host must verify its own
  purpose-specific rights attestation. Payment and access never manufacture
  source or redistribution permission; the complete fixed
  `PRODUCT_OFFER_NON_CLAIMS` tuple is mandatory.
- Terms, support, and methodology links must be root-relative or HTTPS URLs
  without embedded credentials.

## Opaque references

All entitlement, subject, event, evidence, payment, subscription, and price
references use the same bounded grammar: `pf_` followed by 16–64 base64url
characters. They are deliberately not email addresses, phone numbers, URLs,
Telegram chat IDs, raw provider object IDs, or secrets. A host should mint a
pseudonymous internal reference and keep any provider mapping on its server.

## Entitlement lifecycle

Create or parse a snapshot, then reduce events in received order:

```ts
import {
  createEmptyEntitlementSnapshotV1,
  reduceEntitlementEventV1,
} from "@cambridge-tcg/product-flow";

const empty = createEmptyEntitlementSnapshotV1({
  environment: "test",
  entitlement_ref: "pf_entitlement00001",
  subject_ref: "pf_subject000000001",
  offer_id: "example-briefing",
  offer_version: 1,
});

const active = reduceEntitlementEventV1(empty, {
  schema: "cambridgetcg.product-entitlement-event/1",
  event_id: "pf_paymentevent0001",
  environment: "test",
  type: "payment_confirmed",
  occurred_at: "2026-09-02T10:00:00.000Z",
  entitlement_ref: "pf_entitlement00001",
  subject_ref: "pf_subject000000001",
  offer_id: "example-briefing",
  offer_version: 1,
  channel: "web",
  rail: "stripe_web",
  price_ref: "pf_testprice0000001",
  active_until: "2026-10-02T10:00:00.000Z",
  evidence: {
    kind: "provider_confirmation",
    source: "provider_webhook",
    environment: "test",
    entitlement_ref: "pf_entitlement00001",
    subject_ref: "pf_subject000000001",
    offer_id: "example-briefing",
    offer_version: 1,
    channel: "web",
    rail: "stripe_web",
    price_ref: "pf_testprice0000001",
    provider_event_ref: "pf_providerevent001",
    payment_ref: "pf_providerpayment01",
    confirmed_at: "2026-09-02T10:00:00.000Z",
    active_until: "2026-10-02T10:00:00.000Z",
  },
});
```

Only `payment_confirmed` can create active access, and only
`renewal_confirmed` can extend it. Both require provider webhook/API evidence
bound to the same entitlement, subject, offer/version, environment, channel,
rail, price reference, and exact `active_until`.

| Event                  | Projection effect                                                      |
| ---------------------- | ---------------------------------------------------------------------- |
| `checkout_started`     | Audit cursor only; never grants access                                 |
| `browser_return`       | Audit cursor only; never grants access                                 |
| `precheckout_approved` | Telegram Stars audit cursor only; never grants access                  |
| `channel_linked`       | Audit cursor only; never grants access                                 |
| `payment_confirmed`    | Activates only with bound provider confirmation                        |
| `renewal_confirmed`    | Extends to a later `active_until`; does not silently undo cancellation |
| `payment_failed`       | Never activates or extends; already-paid access keeps its existing end |
| `cancel_at_period_end` | Bound provider status; keeps access only until existing `active_until` |
| `subscription_resumed` | Bound provider status; clears scheduled cancellation on active access |
| `subscription_ended`   | Bound provider status; ends access                                     |
| `refunded`             | Bound reversal for the latest confirmed payment; ends access           |
| `revoked`              | Internal fail-closed denial; ends access                               |

Test and production events cannot enter the same snapshot. Identity mismatch,
non-increasing timestamps for distinct events, impossible transitions, or
exhausted bounded idempotency history change the snapshot to `blocked`. A
duplicate event ID is a deterministic no-op, including when the replay body
differs. Fresh lifecycle IDs cannot replay a processed provider-event ref or a
previously confirmed payment ref. A refund must bind the latest entry in
`confirmed_payment_refs`; a reversal for an older paid period cannot erase
access bought by a later renewal. Any other payment ref blocks the projection
as an invalid transition and cannot become the refund that ends access. Ended
and blocked snapshots require a fresh entitlement reference or a rebuild from
a trusted strictly ordered event log; later confirmations do not silently
revive them.

A renewal proves a new paid-through boundary, not that the customer withdrew
a scheduled cancellation. The reducer therefore preserves
`cancel_at_period_end` across renewal. Only a separately provider-bound
`subscription_resumed` event clears it, and that event cannot reactivate an
ended, refunded, or revoked entitlement.

## Access evaluation

`evaluateAccessV1(offer, snapshot, context)` requires the caller to inject the
environment, delivery channel, and canonical UTC evaluation timestamp:

```ts
const decision = evaluateAccessV1(offer, active, {
  environment: "test",
  channel: "web",
  evaluated_at: "2026-09-03T12:00:00.000Z",
});
```

The offer and snapshot must come from trusted server-side composition and
persistence (or the snapshot directly from this package's reducer). Parsing
proves contract shape and internal coherence; it does not authenticate
provenance or a rights authority. Never accept either from a browser, Telegram
user, deep link, or unsigned client payload and then use it as authority.

Invalid JSON contracts throw `ProductFlowContractError`. Valid contracts that
do not authorize access return a frozen `{ allowed: false, reason, ... }`
decision. Evaluation denies environment or offer-version mismatch, previews,
paused/retired offers, ungranted rights, unavailable delivery, inactive or
blocked state, pre-start/expired time windows, unavailable rails, and price
references not declared by the current offer. The end timestamp is exclusive.

An entitlement purchased on a valid rail may be delivered through either
declared channel; rail channel controls where payment occurs, while delivery
availability controls where the purchased product can be received.

## Telegram deep links

```ts
import { buildTelegramDeepLinkV1 } from "@cambridge-tcg/product-flow";

buildTelegramDeepLinkV1("ExampleBriefingBot", "example_preview");
// https://t.me/ExampleBriefingBot?start=example_preview
```

The builder accepts a 5–32 character bot username without `@`, requires the
`bot` suffix, and accepts only 1–64 base64url start-parameter characters. It
returns a string and never accepts a bot token or calls Telegram. Those bounds
follow Telegram's official [bot username](https://core.telegram.org/bots/features#botfather)
and [deep-link](https://core.telegram.org/api/links#bot-links) contracts.
Digital goods sold inside Telegram must use Stars; payment confirmation still
comes only after a successful-payment provider event, never pre-checkout
approval. See Telegram's official [digital-goods payment flow](https://core.telegram.org/bots/payments-stars).

## Verification

```sh
pnpm --filter @cambridge-tcg/product-flow typecheck
pnpm --filter @cambridge-tcg/product-flow test
```
