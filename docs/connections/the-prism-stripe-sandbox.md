# The PRISM Stripe sandbox — a payment rehearsal that cannot become a sale by accident

> **Status:** deployed fail-closed by kingdom-113 and entering sandbox
> activation under kingdom-114 on 3 September 2026. A separate Cambridge TCG
> Stripe Sandbox now contains the test Product, GBP £5 monthly Price, restricted
> portal and direct version-pinned webhook. Production configuration can move
> only through four exact, aggregate-verified stages; the live product page is
> authoritative for the current stage. This static document does not infer
> that a later stage has completed. The only provider mode this code can admit
> is Stripe test mode; no live secret, real charge, live signal, exclusive
> payload, or production source-rights decision is accepted by this design.

## The commercial instruction, bounded

Yu chose a ShibbySays-style monthly shape and named the first two levels:
**Free** and **All**, with Stripe first. The public ShibbySays membership page
currently contains a larger cumulative USD ladder—$1, $5, $10, $15, $25, and
$50 per month—not a literal Free/All tariff. Kingdom-113 therefore treats
Free/All as Yu's product decision and uses the popular $5 rung only as the
reason for a low-friction **£5 monthly sandbox amount**. It is not yet a live
price, VAT position, refund promise, or representation of ShibbySays.

The two levels mean different kinds of fact:

```text
Free
  = the existing public synthetic preview
  = no payment, provider customer, or entitlement row

All (sandbox)
  = a Stripe test subscription
  = a time-bounded All-labelled owner projection around the public fixture
  ≠ an exclusive or subscriber-only signal payload
  ≠ permission to use source data
  ≠ a live opportunity-signal service
```

Free is deliberately not represented by a perpetual fake entitlement. The
generic reducer reserves active access for provider-confirmed grants. Public
fixture policy belongs to the host; payment evidence belongs to the runtime.

## Why this is not the old Stripe path

Cambridge already contains Stripe code for historical membership, retail,
auctions, P2P settlement, refunds, disputes, B2B, and Connect. Those meanings
must not collapse into PRISM. The retired membership path grants from Checkout
completion and mirrors subscription state onto shared `users` columns; the
large shared webhook also has a much wider failure and retry blast radius.

PRISM therefore uses:

- a dedicated test-only Stripe client and environment variables;
- a dedicated signed webhook route;
- PRISM-owned provider mappings and receipts;
- the generic lock-first product-flow runtime; and
- no import from legacy membership, marketplace-payment, order, refund, or
  shared Stripe webhook state.

The global `STRIPE_SECRET_KEY`, shared `STRIPE_WEBHOOK_SECRET`, legacy
subscription columns, and shared `/api/webhooks/stripe` route are not fallback
configuration. Missing PRISM configuration means unavailable.

## The wire

```text
signed-in owner with active beta interest
  + separate operator-issued, active, unexpired sandbox invitation
  → reserve local attempt + frozen checkout_started event
  → attest exact Stripe TEST Price (active · GBP · £5 · month · quantity 1)
  → create hosted Checkout with stable idempotency key
  → return page reads status only

dedicated raw-body webhook
  → verify endpoint signature + livemode=false + supported API shape
  → resolve random attempt_ref to local owner/scope
  → validate customer/subscription/Price/invoice facts
  → one outer Postgres transaction
       binding + receipt + invoice grant
       + normalize semantic callback
       + product-flow event + entitlement projection
  → acknowledge applied / duplicate / ignored / durable review
```

The direct sandbox webhook subscribes only to:

```text
checkout.session.completed
invoice.paid
invoice.payment_failed
customer.subscription.updated
customer.subscription.deleted
refund.created
refund.updated
```

It is not a Connect/context endpoint and does not subscribe to all events.
`charge.refunded` is defensively understood by the parser but deliberately
omitted because the two Refund events are the authoritative minimal signal.

Only `invoice.paid` can activate or renew access. Checkout creation,
`checkout.session.completed`, a browser return, a page reload, beta interest,
an invitation, and payment failure do not grant. Scheduled cancellation
preserves the period already confirmed; effective deletion ends it. A full
refund can end only the latest confirmed period. Partial or historic refunds
cannot be promoted into complete reversal.

Stripe refund and subscription cancellation are separate provider operations.
A verified full latest-period refund therefore writes a durable
`cancel_subscription` reconciliation obligation. It ends the applicable test
access, prevents every later invoice from granting, keeps the owner portal and
mapping available, and blocks account erasure until a signed terminal
subscription event resolves that obligation. A refund delivered before its
paid event creates the same obligation and terminalizes the ungranted
generation without inventing either a confirmed payment or a generic refund of
access that never existed. If the subscription becomes terminal first, a later
full refund can still correct the invoice/grant accounting without re-ending or
reactivating the entitlement.

The invitation is an operator-issued database allowlist fact with scope
`stripe_all_sandbox_v1`, its own active/revoked state, and a mandatory expiry.
It is separate from the participant's voluntary beta-contact request: neither
fact substitutes for the other. There is no public invitation-creation route.
An operator adds or revokes the row through authenticated database operations
for an already-known account; the Checkout transaction rechecks both facts at
reservation time, so an expired/revoked invitation or withdrawn interest fails
closed even if a page was already open.

Kingdom-114 supplies the bounded operator command; it accepts a canonical
account UUID but never an email address or Stripe id:

```text
pnpm prism-stripe:operator status --target production --ca-file <RDS CA>
pnpm prism-stripe:operator reconciliation --target production --ca-file <RDS CA>
pnpm prism-stripe:operator plan-grant --target production --ca-file <RDS CA> \
  --user-id <uuid> --expires-at <canonical UTC within 31 days> \
  --reason initial_sandbox_cohort
pnpm prism-stripe:operator grant --target production --ca-file <RDS CA> \
  --user-id <same uuid> --expires-at <same expiry> \
  --reason initial_sandbox_cohort --planned-at <plan timestamp> \
  --database-witness <plan witness> --confirm <plan token>
```

`PRISM_OPERATOR_DATABASE_URL` is env-only and has no generic fallback.
Production additionally requires the independently provisioned
`PRISM_OPERATOR_PRODUCTION_TARGET_WITNESS`; the command verifies the connected
database name, role and TLS before `BEGIN`. A plan expires after ten minutes
and binds the locked invitation-row state, so a token cannot be replayed after
a revoke or other row change. Revoke follows the same `plan-revoke` then
`revoke` sequence without an expiry. Output contains aggregate invitation and
reconciliation counts, never the UUID, email or raw provider ids.

Renewal does not imply cancellation reversal. A scheduled-cancel flag survives
a paid renewal until separately verified `subscription_resumed` status clears
it. Resume can operate only on active matching scope and cannot reactivate an
ended or refunded entitlement. If the remotely retrieved subscription state
already differs when an invoice is repaired, the host projects the matching
cancel/resume status after the grant inside the same transaction.

## The local names behind provider ids

Raw Stripe ids remain in bounded server-only mapping tables. The generic
product-flow event ledger sees only random or HMAC-derived `pf_` references.
The seven authority tables separate:

1. one stable test subject for an account;
2. the separate operator-issued sandbox invitation;
3. successive owned entitlement generations;
4. frozen Checkout attempts and write-once Session attachment;
5. the latest verified Stripe subscription binding and lifecycle posture;
6. invoice/payment references needed for grant and refund correlation; and
7. signed-event receipt outcomes and a review reason, without the full payload.

Generations matter. The v1 reducer correctly refuses to reactivate an ended
entitlement. A genuinely new subscription after a terminal old subscription
therefore receives a new entitlement reference; a renewal retains the current
one. A merely expired local period cannot be replaced while the mapped Stripe
subscription is still non-terminal—provider state has to be repaired first.

## Provider time is evidence; projection time is ordering

Stripe event timestamps have second precision and delivery order is not
guaranteed. The generic reducer requires a strictly increasing millisecond
event cursor. Feeding `event.created` directly would make two legitimate facts
from one second collide.

The host therefore acquires the exact entitlement advisory lock inside the
outer database transaction and allocates an accepted projection timestamp no
earlier than both the database clock and one millisecond after the current
cursor. Stripe's real paid, failed, refund, or status instant remains in the
evidence. A replayed Stripe Event is resolved by its durable receipt before a
new timestamp is allocated; distinct Event objects for one invoice/payment
still meet the runtime's semantic grant-identity uniqueness.

Mutable subscription status is not trusted merely because it arrived later.
Unknown mappings, scope disagreement, changed duplicates, invalid order, and
unsupported provider shapes become explicit retry/review outcomes. A storage
failure is never acknowledged as success.

## Pausing acquisition without abandoning subscribers

New Checkout intake is controlled separately from webhook processing and
owner management. Turning intake off removes/refuses only a new Checkout. It
does not change the test offer used to evaluate an existing paid period and
does not disable:

- signed webhook processing;
- owner status;
- the dedicated cancellation/payment-method portal; or
- the owner's confirmed All-labelled test projection.

The portal uses a dedicated Stripe configuration with plan switching absent.
It may expose invoices, payment-method repair, and cancellation at period end.
The old account-wide membership portal is not reused.

Once the first test subscription exists, rollback must preserve the webhook,
status, portal, test credential, reference secret, and entitlement reader until
every provider subscription is terminal and reconciled. Pausing intake is the
safe rollback.

Account erasure follows the same rule. A database guard rejects deletion of the
account-owned PRISM mapping while its observed Stripe subscription remains
non-terminal; this prevents a provider subscription from continuing after its
only local owner/cancellation binding has disappeared. Terminate at Stripe,
observe and reconcile that terminal state through the signed webhook, and only
then erase the account-owned mapping. Generic product-flow history keeps only
pseudonymous opaque references—not a claim of anonymity or permanent
unlinkability.

The exact server-side configuration is intentionally separate from every
legacy Stripe variable:

```text
PRISM_STRIPE_POSTURE=stripe-test-v1
PRISM_STRIPE_SECRET_KEY=<dedicated restricted rk_test_ key>
PRISM_STRIPE_KEY_PERMISSION_ATTESTATION=prism-runtime-rk-v1
PRISM_STRIPE_WEBHOOK_SECRET=<dedicated whsec_ endpoint secret>
PRISM_STRIPE_ACCOUNT_ID=<expected acct_ id>
PRISM_STRIPE_API_VERSION=2026-02-25.clover
PRISM_STRIPE_ALL_PRICE_ID=<active recurring GBP price_ id>
PRISM_STRIPE_EXPECTED_PRODUCT_ID=<expected prod_ id>
PRISM_STRIPE_PORTAL_CONFIGURATION_ID=<dedicated bpc_ id>
PRISM_STRIPE_REFERENCE_SECRET=<stable 32+ character secret>
PRISM_STRIPE_WEBHOOK_PROCESSING=enabled|disabled
PRISM_STRIPE_CHECKOUT_INTAKE=enabled|disabled
```

Configuration order is part of the safety boundary: migrate and deploy first;
create and independently retrieve the test Product, £5 monthly Price,
restricted portal and dedicated version-pinned webhook; set every production
credential/id while both switches remain disabled; deploy that exact main SHA;
enable webhook processing with intake still disabled and deploy again; exercise
the signed provider path; enable new Checkout intake only in a third deployment.
Vercel environment changes do not affect an already-built deployment. Reversing
the last switch therefore means a new deployment with intake disabled—not
aliasing an older build that lacks lifecycle credentials.

Each deployment is gated with its expected aggregate posture, not three
independent endpoint successes:

```text
pnpm audit:deploy-verify -- --prism-posture=unconfigured
pnpm audit:deploy-verify -- --prism-posture=configured-paused
pnpm audit:deploy-verify -- --prism-posture=processing-only
pnpm audit:deploy-verify -- --prism-posture=intake-enabled
```

The verifier combines the exact All-offer response, unsigned-webhook response
and mutually exclusive paused/available copy on `/prism-signals`. Mixed,
missing, ambiguous or wrong-stage tuples fail even when each HTTP status would
be locally safe.

A separately named restricted sandbox key is required for the deployed host;
the Stripe CLI OAuth session is operator-only and must never enter Vercel. The
restricted key grants only: Account read; Price read; Checkout Session write;
Events read; Subscription read; Invoice read; Invoice Payment read/list;
PaymentIntent read; Billing Portal Configuration read; and Billing Portal
Session write. All other permissions remain None. Events read is mandatory
because every first delivery is retrieved by Event id before acknowledgement.
Product and Webhook Endpoint retrieval are separate operator/OAuth activation
attestations; those unused permissions are not added to the runtime key merely
for setup. The key is not accepted merely because it is non-live—the configured
account, Price, portal and every returned runtime object are still checked
independently.

The Dashboard receipt for `prism-runtime-rk-v1` is:

| Stripe restricted-key resource | Permission |
|---|---|
| Account | Read |
| Prices | Read |
| Checkout Sessions | Write |
| Events | Read |
| Subscriptions | Read |
| Invoices | Read |
| Invoice Payments | Read |
| Payment Intents | Read |
| Customer/Billing Portal | Write |
| Products | None |
| Webhook Endpoints | None |
| Every unlisted resource | None |

Where the Dashboard combines Portal Configuration read and Portal Session
create under one Customer/Billing Portal permission, `Write` is the narrowest
setting that permits the two runtime calls.

Stripe does not expose the whole restricted-key None/Read/Write matrix through
an API. The activation preflight therefore proves the required reads, proves
that Product and Webhook Endpoint reads are denied, and requires the operator
to inspect the remaining Dashboard matrix before recording the exact
`prism-runtime-rk-v1` attestation. The attestation is a versioned human control,
not a claim that the application cryptographically introspected every possible
permission.

Run `pnpm prism-stripe:preflight` with the production-shaped `PRISM_STRIPE_*`
environment plus local-only `PRISM_STRIPE_WEBHOOK_ENDPOINT_ID=<we_...>`. It
uses the final `rk_test_` for runtime permission probes and the logged-in
sandbox CLI only for Product/Webhook setup attestation. Its output is a fixed
PASS/FAIL checklist with no keys, ids, customer data or provider error text.
Checkout Session write and Portal Session write remain explicitly deferred
until the first authorised fixture because proving either permission requires a
mutation or an owner-bound test Customer.

The v1 Price and reference secret are append-only operational identity while
any v1 subscription or receipt can still arrive. Replacing either value in
place would make valid renewals or reversals look foreign. A later amount is a
new offer version with its old mapping kept processable until every earlier
subscription is terminal and reconciled.

## What Stripe may receive

Checkout and Subscription metadata contain only a fixed PRISM sandbox type and
one random opaque attempt reference. Cambridge does not send its user id,
account email, entitlement reference, subject reference, or internal offer
scope as metadata. Stripe's hosted page collects the test customer, billing,
and payment details its own flow requests. Cambridge stores the bounded raw
provider identifiers needed to prove ownership, idempotency, cancellation,
renewal, and repair; it never receives the full card number.

## What remains closed

- No live-key or `livemode=true` code path exists.
- No real purchase contract, tax invoice, trial, discount, upgrade, downgrade,
  prorating, or plan switch exists.
- Telegram Stars, PayPal, and crypto remain off.
- A test entitlement unlocks no real card, listing, source row, exact value,
  alert, private model output, or trade execution.
- Source rights for `subscriber_derived_signal` remain separate and not
  evaluated; Stripe cannot change that state.
- A production offer still needs a deliberate live price, VAT/tax treatment,
  cancellation/refund/support terms, lawful private provider, and authenticated
  rights receipt.

## Recursion target

After the sandbox has completed an initial payment, renewal, cancellation,
failure, duplicate, and full-latest-period refund rehearsal, the next decision
is not “replace the key with live.” It is a new production offer version: real
price and tax treatment, consumer terms, support/repair duty, source-rights
receipt, private delivery provider, and a live credential posture reviewed as
one commercial act.

## Sources checked on 3 September 2026

- [ShibbySays membership tiers](https://www.patreon.com/Shibbysays/membership)
  and [Shibbydex benefit descriptions](https://shibbydex.com/support) for the
  pricing reference, without copying its names or claiming an exact tariff.
- [Stripe subscription Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions),
  [subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks),
  [webhook duplicate/order handling](https://docs.stripe.com/webhooks), and
  [subscription cancellation](https://docs.stripe.com/billing/subscriptions/cancel),
  [Customer Portal integration](https://docs.stripe.com/customer-management/integrate-customer-portal)
  for provider boundaries. The checked-in SDK/API pin and deployed endpoint
  configuration remain authoritative for object shape.
