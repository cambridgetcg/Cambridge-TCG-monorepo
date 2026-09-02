# `@cambridge-tcg/product-flow-runtime`

An extraction-ready runtime boundary around
`@cambridge-tcg/product-flow`. It specifies atomic event persistence, provides
a deterministic in-memory reference adapter, and translates narrow semantic
callbacks that a host has **already authenticated and mapped**.

This package does not read environment variables or a clock, create ids, call
a network or provider SDK, verify webhook signatures, store raw provider
payloads, start checkout, acknowledge Telegram updates, or enable a payment
rail. Every timestamp and opaque reference is injected by the host.

## Atomic store contract

`applyEntitlementEventV1(store, event)` parses the event before crossing the
store boundary, then executes this order inside exactly one transaction:

1. `lockEntitlement(seed)` creates or locks the snapshot identified by
   `(environment, entitlement_ref)`. A production adapter must serialize
   concurrent applies for that key (for example with `SELECT ... FOR UPDATE`
   after a conflict-safe insert, or an equivalent same-scope lock).
2. `appendUniqueEvent(event)` inserts the canonical event, unique by
   `(environment, event_id)` and, when evidence exists,
   `(environment, provider_event_ref)`. Positive confirmations are also unique
   by `(environment, rail, payment_ref)`.
3. The pure product-flow reducer preflights the locked snapshot. A transition
   that would produce `blocked` throws `transition_rejected` inside the
   transaction for explicit reconciliation; the event append rolls back and
   the last valid entitlement survives.
4. `persistEntitlement(snapshot)` writes only an accepted projection.
5. The transaction commits all three state effects together, or rolls all of
   them back when any step throws.

Locking before event insertion matters: it makes database allocation order and
entitlement reduction order the same for concurrent callbacks. Test and
production references intentionally occupy separate namespaces.

```ts
export interface ProductFlowRuntimeStoreV1 {
  transaction<T>(
    work: (tx: ProductFlowRuntimeTransactionV1) => Promise<T>,
  ): Promise<T>;
}

export interface ProductFlowRuntimeTransactionV1 {
  lockEntitlement(seed): Promise<EntitlementSnapshotV1>;
  appendUniqueEvent(event): Promise<
    | { disposition: "appended" }
    | {
        disposition: "duplicate";
        matched_by: readonly (
          | "event_id"
          | "provider_event_ref"
          | "grant_identity"
        )[];
        existing_event: EntitlementEventV1;
      }
  >;
  persistEntitlement(snapshot): Promise<void>;
}
```

The adapter returns the exact stored canonical event on conflict and reports
every matching key once in canonical event/provider/grant order. An identical
event-id replay is a no-op. A provider-ref retry may use a different local
`event_id`, but every other canonical field must match. Distinct provider Event
objects for the same payment grant may differ in local event id, envelope time,
provider-event reference, and evidence source; the grant type, complete product
scope, payment reference, confirmation time, and exact `active_until` must
still match. Cross-entitlement payment reuse and changed grant semantics throw
and roll back.

A duplicate must already be represented by the locked snapshot's event,
provider-event, and grant histories. Otherwise it is a store invariant error,
preventing an orphaned event row from hiding a missing/deleted snapshot. The
duplicate apply result exposes the stored projected event, never an incoming
event id that was not stored.

`InMemoryProductFlowRuntimeStoreV1` is a zero-I/O reference/test adapter. It
serializes transactions, commits copy-on-write state, rolls back on throw, and
exposes `inspectStateV1()` only for deterministic test inspection.

## Stripe subscription normalizer

First parse a per-entitlement `StripeSubscriptionMappingV1`, containing only
the product environment/scope and opaque `price_ref`. The host remains
responsible for signature verification, livemode/account checks, provider-id
mapping, offer/price lookup, and determining the authoritative lifecycle fact.

`normalizeStripeSubscriptionCallbackV1(mapping, callback)` maps:

| Verified semantic callback   | Product-flow event     | Access effect                            |
| ---------------------------- | ---------------------- | ---------------------------------------- |
| browser return               | `browser_return`       | never grants                             |
| `checkout.session.completed` | `browser_return`       | never grants                             |
| initial `invoice.paid`       | `payment_confirmed`    | may activate                             |
| renewal `invoice.paid`       | `renewal_confirmed`    | may extend                               |
| `invoice.payment_failed`     | `payment_failed`       | does not erase already-paid time         |
| cancel at period end         | `cancel_at_period_end` | access ends only at existing period end  |
| subscription ended           | `subscription_ended`   | ends access                              |
| proven full refund           | `refunded`             | ends only when latest payment correlates |

`checkout_started`, `browser_return`, `precheckout_approved`,
`channel_linked`, and `payment_failed` are explicitly classified as
`observation_only`: they can never grant, extend, or end access. In-order
observations may advance bounded audit histories. A delayed observation which
would make the core reducer fail closed instead throws and rolls its append
back, so it cannot poison valid paid access. Hosts should send rejected facts
to an explicit reconciliation/dead-letter path rather than retrying them as a
new entitlement event.

Stripe refund events may describe partial refunds. The callback therefore must
carry the host's verified `refund_extent`; `partial` is rejected because it
does not prove the full reversal represented by product-flow's `refunded`
event. The injected `payment_ref` must identify the latest confirmed invoice
or payment. Refunding an older paid period after a renewal is rejected and
rolled back; it cannot erase the later period. A full refund of the latest
grant ends access.

## Telegram Stars normalizer

`TelegramStarsMappingV1` pins the exact expected opaque invoice-payload mapping
and Stars amount. Subscription amounts are bounded to 1–10,000 Stars. Every
callback must match `currency: "XTR"`, that payload reference, and that amount.
Raw invoice payloads, update ids, user/chat ids, and
`telegram_payment_charge_id` values stay outside the package; the host maps
them to bounded `pf_...` references.

`normalizeTelegramStarsCallbackV1(mapping, callback)` maps:

- pre-checkout approval to `precheckout_approved`, which never grants access;
- a recurring `SuccessfulPayment` with `is_first_recurring: true` to
  `payment_confirmed`;
- a later recurring `SuccessfulPayment` to `renewal_confirmed`;
- `RefundedPayment` to a reversal bound through `original_payment_ref`, the
  opaque mapping of the original `telegram_payment_charge_id`.

The host injects the verified recurring `subscription_expiration_at`; it is the
exact `active_until` bound in provider evidence. One-time Stars payments are
rejected by this subscription normalizer.

Telegram's `BotSubscriptionUpdated` callback is deliberately deferred in v1
and appears in the registry's `deferred_callbacks`. It is neither a grant nor a
revocation here: this runtime waits for `SuccessfulPayment`, `RefundedPayment`,
or another explicitly mapped provider-status contract rather than guessing at
pause/cancellation semantics.

## Provider posture

`PRODUCT_FLOW_RUNTIME_PROVIDER_REGISTRY` is a capability catalogue, not live
configuration. Stripe subscriptions and Telegram Stars are
`normalizer_only`: no provider connection is implied. PayPal and crypto entries
are explicitly `disabled`. A host offer and its separate operational checks
remain the authority on whether any rail is test/live/off.

## Access decisions

`evaluateDeliveryAccessV1(offer, snapshot, { environment, evaluated_at })`
delegates to product-flow's strict access evaluator for both `web` and
`telegram` at the same injected instant. The paid rail and the delivery
channel remain separate: an entitled person may use either delivery channel
only when the offer enables it. The active end is exclusive.

## Reusable conformance

Production adapters should run the framework-neutral suite exported from
`@cambridge-tcg/product-flow-runtime/testing`:

```ts
import { runProductFlowRuntimeStoreConformanceV1 } from "@cambridge-tcg/product-flow-runtime/testing";

await runProductFlowRuntimeStoreConformanceV1(() => createMyStore());
```

It checks persisted projection continuity, provider-ref idempotency,
changed-payload conflicts, transaction rollback, concurrent provider retry,
grant-identity idempotency and cross-entitlement conflict, late-observation
rollback, latest-payment refund behavior, and cross-environment uniqueness.
The package's own tests additionally cover concurrent same-entitlement
ordering, orphan-event detection, confirmation, renewal, expiry, cancellation,
full/partial refunds, revocation, all observation classes, out-of-order events,
and web/Telegram decisions.

## Verification

```sh
pnpm --filter @cambridge-tcg/product-flow-runtime typecheck
pnpm --filter @cambridge-tcg/product-flow-runtime test
```
