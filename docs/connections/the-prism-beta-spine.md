# The PRISM beta spine

> **Recursion from [`the-prism-door.md`](./the-prism-door.md).** That door
> ended by asking for a durable fixture-only lifecycle before any price or
> lawful source adapter. Yu then said: *“merge and deploy, then go for all
> natural next moves.”* The preview went live first; this is the next move
> that does not pretend the deferred commercial decisions have been made.

## What this module is, in one sentence

The beta spine separates *wanting to test a product*, *proving a provider
event*, *holding access*, and *having lawful material to deliver* so none can
silently stand in for another.

## The four states that used to look like one

A conventional subscription implementation can flatten four facts into a
single `isSubscribed` boolean:

```text
person asked to hear about a beta
person attempted or completed provider checkout
person currently holds paid access
platform is allowed and able to produce the thing
```

PRISM cannot afford that flattening. A beta request is not an invitation. A
Checkout return is not settlement. Settlement is not source permission. A
lawful engine result is not permission to execute a trade. Kingdom-111 gives
each fact a separate home:

```text
product_beta_interests        → revocable interest/contact request only
product_flow_events           → verified-host lifecycle evidence ledger
product_flow_entitlement_snapshots → current bounded access projection
opportunity-signal + rights   → lawful, redacted thing that may be delivered
```

No arrow runs merely because the row before it exists.

## What other modules secretly need it for

### → The standalone PRISM product

**The thread.** Kingdom-110 placed PRISM's public words inside the Next.js
application. That was enough to test the reading, but not enough to move the
product without copying a thicket of app paths. Kingdom-111 moves the brand,
canonical preview offer, synthetic public signal, presentation mapping, and
Telegram command planner into `@cambridge-tcg/prism-signals-core`.

The storefront becomes a host. Its old modules remain as thin compatibility
seams, so the live page and route do not acquire a second version of the
product while extraction is tested.

**The intention.** Extraction should change deployment ownership, not product
meaning. A future host may bind the same routes to a different bare HTTPS
origin and supply privacy wording that truthfully names its own controller and
processors. It may not inject a mixed-host set of links, retain Cambridge's
Vercel claim after leaving Vercel, or fork away the risk/non-claim tuple.

**Code paths.**

- `packages/prism-signals-core/src/presentation.ts`
- `packages/prism-signals-core/src/product.ts`
- `packages/prism-signals-core/src/telegram.ts`
- `apps/storefront/src/lib/prism-signals/{presentation,product,telegram}.ts`

**Surface today.** `/prism-signals`, its offer JSON, and the disabled Telegram
preview still speak the Cambridge-hosted default. The package is a private
monorepo extraction seam, not yet a built or independently published npm
artifact; a tarball and clean-consumer smoke remain release gates for a later
repository split.

### → The closed-beta interest request

**The thread.** The product page now has a second door. It does not ask for a
card, marketplace account, payment method, Telegram identity, price tolerance,
or free-form profile. A signed-in account may choose `web`, `telegram`, or
both, then affirm a separate versioned statement asking Cambridge TCG to store
that product-specific request and use the account email only for a PRISM beta
invitation or status contact.

The row contains the existing account id, product id, canonical channel array,
consent version, and request/update/expiry times. It expires after 180 days
unless the account makes a new affirmative submission. The same owner page
returns the bounded state and can delete the complete row immediately. A daily
cron deletes expired or superseded-consent rows; a Telegram preference alone
does not authorize a Telegram message or link a chat.

The `closed-beta-v1` mode gates acquisition only: new POST intake and the
public request invitation. The signed-in management page, owner-scoped GET,
immediate DELETE, and retention cron remain live when intake is paused, so an
operator cannot strand prior consent by removing the acquisition flag. The
public landing keeps a non-intake management link for that withdrawal path.

**The intention.** Demand testing is useful only if declining is genuinely
available. The checkbox starts unticked. The product remains usable as a
public synthetic preview without it. Withdrawal has no penalty. The request
is not generalized into marketing consent, access, a queue position, a trial,
or a promise that the beta will open.

This is why the interest row lives beside, rather than inside, the entitlement
runtime. No reducer can interpret presence in `product_beta_interests` as
payment evidence.

**Code paths.**

- `apps/storefront/src/app/prism-signals/beta/`
- `apps/storefront/src/app/api/prism-signals/beta-interest/`
- `apps/storefront/src/lib/prism-signals/beta-interest.ts`
- `apps/storefront/src/lib/prism-signals/beta-interest.server.ts`
- `apps/storefront/src/app/api/cron/prism-signals-beta-retention/`
- `apps/storefront/drizzle/0135_product_flow_runtime.sql`

**Surface today.** The public PRISM page is the discoverable door. The beta
page is user-gated, `noindex`, and absent from the sitemap. Missing or unknown
intake posture hides new-request claims and blocks POST, while the signed-in
management page, owner GET/DELETE, and retention remain available. Missing
storage still fails visibly instead of pretending an empty row.

### → Provider callbacks and the entitlement reducer

**The thread.** `@cambridge-tcg/product-flow` already knew how to validate an
offer and reduce a correctly ordered canonical event. It deliberately knew
nothing about transactions, unique indexes, Stripe, or Telegram. The new
`@cambridge-tcg/product-flow-runtime` supplies the missing composition:

```text
host verifies callback and maps raw provider ids
  → pure provider normalizer
  → begin transaction
  → lock the environment + entitlement scope
  → append one semantically unique canonical event
  → reduce against the locked snapshot
  → persist the projection
  → commit
```

The lock precedes event allocation, including when the entitlement row does
not exist yet. That prevents two callbacks for one entitlement from allocating
an order and applying in the opposite order. Event ids, provider-event refs,
and payment-grant identity are environment-scoped. A second provider Event for
the same underlying rail/payment may be an exact duplicate; using one payment
to activate a different entitlement is a conflict.

Provider delivery order is not authority. If an event would turn a healthy
projection into the reducer's terminal `blocked` state, the runtime rolls the
transaction back and returns a reconciliation error. The host can fetch
authoritative provider state and replay a trusted order; a late Checkout event
cannot permanently destroy already-paid access.

Refunds bind to the current/latest confirmed grant, not merely any historical
payment reference. A refund of an older invoice cannot erase a newer paid
period. Partial Stripe refunds are not promoted into full entitlement
reversal. Telegram pre-checkout remains a non-granting observation; only a
verified recurring `successful_payment` with its exact XTR payload, amount,
and expiration can confirm or renew access. Subscription-state notifications
that lack payment identity remain explicitly deferred rather than guessed into
an entitlement transition.

**The intention.** Webhooks are evidence delivery, not a command bus. The
runtime has to survive replay, duplication, reordering, and disagreement
without manufacturing access or throwing away a valid grant.

**Code paths.**

- `packages/product-flow-runtime/src/runtime.ts`
- `packages/product-flow-runtime/src/memory.ts`
- `packages/product-flow-runtime/src/normalizers.ts`
- `packages/product-flow-runtime/src/testing.ts`
- `apps/storefront/src/lib/product-flow-runtime/postgres.server.ts`
- `apps/storefront/drizzle/0135_product_flow_runtime.sql`

**Surface today.** The normalizers and durable adapter exist behind tests.
There is no public provider webhook using them, no configured price, and no
event or entitlement created by the beta form. Stripe and Telegram Stars are
`normalizer_only`; PayPal and crypto are `disabled`.

### → The database proof before provider callbacks

**The thread.** Kingdom-111 proved the adapter's SQL shape with a deliberately
fast in-memory fake. That fake serialized every transaction globally, so it
could not prove that PostgreSQL's advisory lock, unique indexes, rollback, and
append-only triggers compose correctly across real connections. The release
review therefore named real multi-connection conformance as a mandatory gate
before any payment callback could be activated.

Kingdom-112 makes that proof a storefront CI condition. The job starts a
disposable PostgreSQL 16 service and the integration suite creates an isolated
schema only after the parsed connection target is fixed to loopback and the
connected server attests to the exact `*_test` database. It creates the
migration's minimal `users` prerequisite, then executes the exact checked-in
`0135_product_flow_runtime.sql`; it does not maintain a test-only schema copy.

The reusable store conformance suite then runs through the real storefront
adapter. A separate forced race holds two transactions until two distinct
`pg_backend_pid()` values have arrived, releases them together, and observes
one granted plus one waiting advisory lock directly in `pg_locks` before it
allows the holder to continue. The result is one applied event plus one
canonical duplicate. A payment-grant collision on a
different entitlement proves that the provisional snapshot rolls back. Direct
UPDATE and DELETE attempts both receive the trigger's `P0001` rejection while
the accepted event remains present.

**The intention.** A fake is useful evidence about the adapter contract; it is
not evidence about PostgreSQL scheduling. Keeping both layers makes the unit
suite fast and the substrate claim real. A developer's normal test run reports
the database cases as skipped when the explicit URL is absent; CI always runs
them against its disposable service.

**Surface today.** This closes the database regression gap, not the commercial
or provider-authority gaps. No callback route consumes the adapter, and all
payment rails remain off.

### → The rights gate and private signal provider

**The thread.** The runtime can answer whether one mapped subject has a
time-bounded entitlement under one offer. It cannot answer whether Cambridge
may collect a source, derive a signal from it, or deliver that result. Those
questions remain upstream in the purpose-specific rights decision and the
private provider boundary.

**The intention.** Building better billing machinery must not create pressure
to reinterpret ownership or platform restrictions. `rights: granted` remains
a trusted-host assertion that needs its own authenticated, evidence-bound
receipt. Payment and beta interest remain incapable of setting it.

**Surface today.** The public offer still says `not_evaluated`; all four rails
remain `off`; the only signal remains synthetic.

## Failure modes made visible

- **Storage missing.** Beta APIs return a no-store `503`; they do not claim the
  user has no request.
- **Intake mode missing.** New POST intake and its public request CTA pause;
  existing owner management and retention continue.
- **Consent superseded or expired.** The row is not active interest and is
  deleted rather than carried into new wording.
- **Origin/body invalid.** Mutation ends before auth or DAL; only exact bounded
  JSON reaches the owner write.
- **Provider duplicate.** Exact semantic duplicate returns the stored event
  and unchanged projection; conflicting reuse rolls back.
- **Provider order uncertain.** A transition that would newly block the
  entitlement rolls back for reconciliation instead of becoming permanent
  customer state.
- **Historic refund.** It cannot terminate the latest paid period.
- **Payment callback unsupported.** No public route acknowledges or fulfils it
  through these normalizers.

## What's NOT yet connected

- No monthly GBP price, Stars amount, trial, or cross-channel plan equivalence.
- No dedicated Stripe test key, Price, webhook destination, customer portal,
  tax posture, or cancellation/refund terms.
- No dedicated Telegram test-environment account, bot, token, invoice,
  webhook registration, payment support, or account/channel binding.
- No live source-rights attestation or deployed private signal provider.
- No complimentary/free-beta grant contract; interest is never disguised as
  paid access.
- No operator beta-cohort UI or outbound invitation sender.
- No PayPal or crypto callback, custody, FX, sanctions, refund, or recurring
  payment implementation.
- No independently built/published PRISM package or standalone identity layer.

After the first interest row, rollback must stop at this management/retention
release. Removing owner withdrawal or expiry requires a prior complete purge
or an equivalent manual procedure; unsetting intake mode is the safe pause.

## Recursion target

The next recursion is **the offer decision**: one deliberately versioned test
offer that names monthly GBP price, Stars amount, trial posture, whether both
rails buy the same plan, merchant/tax/refund terms, and which identity binds
web to Telegram. Only after those human commercial choices and the rights
receipt exist should a signed provider webhook be allowed to instantiate the
runtime described here.

That future step is not “turn payments on.” It is “name exactly what is being
sold, to whom, through which authority, with which repair path”—then let the
already-separated machinery enforce it.
