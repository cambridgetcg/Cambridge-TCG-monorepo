# PRISM Signals — preview, closed-beta spine, Stripe sandbox, and reusable product boundary

> **Current boundary, 3 September 2026:** **Free synthetic preview · optional
> Stripe test mode · no live market data · no real payment.** The branded web page is live. A separate
> login-gated closed-beta-interest request, unpublished workspace extraction package,
> provider-neutral durable runtime, and provider normalizers now form the next
> test spine. A separately gated All sandbox may rehearse a £5 monthly Stripe
> test subscription to the fixed synthetic fixture. There is still no live
> offer or price, production rights decision, production signal engine, real
> charge, live paid entitlement, subscribed channel, or outbound signal path.
> This document describes a preview and payment rehearsal, not a live service
> Cambridge TCG sells today.

**PRISM Signals by Cambridge TCG** is the product name. Its promise is narrow:
**Potential deals, with the risks attached.** It is intended to package the
public `opportunity-signal/v1` result for traders without selling a raw source
archive or revealing the private decision engine.

The product page is [`/prism-signals`](../../apps/storefront/src/app/prism-signals/page.tsx).
Its terms are
[`/prism-signals/terms`](../../apps/storefront/src/app/prism-signals/terms/page.tsx).
The underlying signal methodology remains
[`opportunity-signals.md`](./opportunity-signals.md).

## What the preview shows

The web page and Telegram demo both project one fixed synthetic public
`OpportunitySignalV1`. The application validates and freezes that exact
public object through `@cambridge-tcg/opportunity-signal` before either
channel reads it. There is no second hand-authored Telegram signal that can
silently lose a risk or non-claim. The fixture is not selected from a database,
refreshed from a marketplace, scored by a production engine, or linked to a
real card, listing, seller, or source URL. The presentation includes:

- a `potential deal` classification for illustration only;
- coarse conservative spread and margin bands, never an exact valuation;
- a categorical confidence label describing evidence quality, not profit
  probability;
- a separate liquidity state, including `unknown` as a complete answer;
- inherent and evidence-related risks; and
- the six fixed opportunity-signal non-claims.

The page repeats **Synthetic preview · no live market data · no payment** near
the product, channel mockups, and commerce explanation. A visitor can inspect
the page and read the terms. They cannot buy, subscribe, reserve a listing,
join a paid channel, or create access.

## The closed-beta request is not access

The public product page links to a separate, login-gated beta-interest page.
When the explicit intake posture is enabled, a signed-in account may choose a
future preference for web, Telegram, or both and tick a separate affirmation
asking Cambridge TCG to store the PRISM-specific request and use the account
email only for a PRISM beta invitation or status contact.

The row stores only the existing account id, `prism-signals` product id,
canonical channel preferences, consent-wording version, and request, update,
and expiry times. It does not copy the email into the beta table or store a
Telegram identity. Telegram preference does not authorize Telegram outreach.
The request is not general marketing consent, a purchase, an invitation, a
queue position, a trial, an entitlement, or a promise that the beta will open.

Consent starts unticked, declining changes no account feature, and the same
owner surface can inspect the bounded request state and delete the complete row
without penalty. A new affirmative submission is required to change it or
refresh its 180-day expiry. Owner reads exclude expired or superseded-wording
rows, while a daily cron performs their physical cleanup. This implements a
finite review period and easy withdrawal rather than treating silence as
continuing interest. The
design follows current ICO guidance on
[valid and withdrawable consent](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/consent/what-is-valid-consent/), together with the
[storage-limitation requirement](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/).

`PRISM_SIGNALS_BETA_MODE=closed-beta-v1` is the only value that enables **new
intake**. Missing or unknown posture hides the public request CTA and makes
POST fail before auth or beta storage. It does not gate the signed-in owner
management page, read-only GET, immediate DELETE, or daily retention sweep, so
pausing acquisition cannot strand earlier consent. The public landing retains
a non-intake “Manage an existing beta request” door. Mutations require the
signed-in owner again at the route and a same-origin browser request; POST also
has a streamed 1 KiB body bound and exact JSON. The management page is
`noindex` and omitted from the sitemap.

Once any beta-interest row exists, operational rollback means pausing new
intake while keeping this owner-management and retention release live. Do not
roll the application back below GET/DELETE and the retention cron unless every
row has first been purged or an equivalent withdrawal and expiry procedure is
already operating.

## Free and All are separate test meanings

The first catalogue has two levels. **Free** is the current public synthetic
preview and creates no payment provider customer or entitlement. **All** is a
separate `prism-signals-all` v1 test offer. When every dedicated sandbox guard
is configured, an owner with active beta interest and a separate
operator-issued, active, unexpired sandbox invitation may rehearse a £5 monthly
Stripe test subscription and receive a time-bounded All-labelled owner
projection around the same public synthetic fixture. This sandbox does not
gate a unique signal payload or make the Free fixture subscriber-only.

The £5 value is a sandbox amount, not Cambridge's final live price. Yu chose
the Free/All shape after referencing ShibbySays. The current public ShibbySays
Patreon page actually lists a larger cumulative USD ladder ($1, $5, $10, $15,
$25, and $50 per month), so this methodology does not attribute Cambridge's
two-tier catalogue or GBP amount to that creator.

All's test offer is `status: test`, `environment: test`, web-only, and enables
only `stripe_web: test`. Its granted purpose is narrowly
`synthetic_fixture_delivery`. That assertion cannot flow into the preview's
still-unevaluated `subscriber_derived_signal` purpose. A Stripe test
entitlement therefore cannot open a live source, private scorer, real card,
listing, alert, or trade action.

New Checkout intake is a host switch separate from offer evaluation and
existing lifecycle support. Pausing intake removes only the ability to start a
new Checkout; it does not turn off a confirmed test period, signed webhook,
owner status, or cancellation portal. Free never requires that machinery.

## The signal boundary remains the first boundary

```text
rights-cleared evidence
  → private valuation and policy engine
  → strict opportunity-signal/v1 projection
  → PRISM presentation
```

Only the last projection is suitable for a customer-facing signal. Source
rows, marketplace URLs, seller identity, exact valuation, feature values,
weights, commercial thresholds, model parameters, and debug fields stay
behind the projection boundary.

The preview does not prove that the first two arrows exist in production.
They do not. The public opportunity-signal package and a privately pinned
fixture provider test the shape, but no lawful source adapter or deployed
private scorer currently feeds this application.

## Payment never opens the rights gate

A byte being reachable, paid for, transformed, or kept secret does not grant
permission to use it for a subscriber-derived signal. Before any future engine
receives evidence, a purpose-specific decision must affirm the exact
`subscriber_derived_signal` use and bind that decision to the evidence bundle.
An expired, denied, absent, or mismatched decision fails closed.

This gate is independent of commerce:

- payment is not source permission;
- transformation is not source permission;
- secrecy is not source permission;
- public reachability is not source permission; and
- web or Telegram channel access is not source or redistribution permission.

A customer entitlement may authorize Cambridge to deliver an already-lawful
PRISM signal to that customer. It cannot authorize Cambridge to collect,
derive from, display, or redistribute evidence Cambridge otherwise lacks the
right to use.

## The reusable product-flow contract

[`packages/product-flow/`](../../packages/product-flow/) is an app-neutral,
zero-I/O contract for offers, entitlement events, access decisions, and
Telegram deep links. Its offer schema is `cambridgetcg.product-offer/1`.
PRISM reserves the offer id `prism-signals`; preview and test offers must use
the test environment, while a live offer must use production and an explicitly
granted rights decision. That field is a trusted-host catalogue assertion: the
product-flow parser does not authenticate its authority, evidence binding,
issuance, expiry, or signature. A live host must first verify a separate bound
rights attestation; a subscriber must never supply the offer as authority.

Every offer declares both delivery channels and all four payment rails. An
inactive rail is represented as `off`, not omitted. The canonical mapping is:

| Customer context | Canonical rail | Current PRISM status |
|---|---|---|
| Independent web purchase | `stripe_web` | Optional sandbox only; £5 monthly test amount, no live price or charge |
| Purchase initiated and fulfilled inside Telegram | `telegram_stars` | Off; no invoice or paid delivery |
| Additional independent web purchase | `paypal_web` | Later / off |
| Additional independent web purchase | `crypto_web` | Later / off |

Stripe is therefore a future independent-web rail, not an inside-Telegram
substitute. Telegram digital access uses Telegram Stars only when that channel
is deliberately activated and has passed a fresh platform-policy review.
PayPal and crypto remain web-only candidates and are off. None of these words
claims a provider account, configured price, approved merchant flow, or
production availability.

This channel split follows the current official provider boundaries:
[Telegram requires Stars for digital goods and services sold inside bots or
Mini Apps](https://core.telegram.org/bots/payments-stars), while an independent
web subscription can use [Stripe Checkout in subscription
mode](https://docs.stripe.com/payments/checkout/build-subscriptions). A later
PayPal adapter would use PayPal's ordinary merchant
[Subscriptions integration](https://developer.paypal.com/subscriptions/integrate),
not its selected-partner marketplace product.

## An attempt is not an entitlement

The product-flow reducer distinguishes an attempt from confirmed settlement.
`checkout_started`, `browser_return`, Telegram `precheckout_approved`,
`channel_linked`, and `payment_failed` events may advance an audit cursor, but
cannot create or extend paid access. Only provider-confirmed payment or renewal
evidence, bound to the same environment, offer, version, channel, rail, and
price reference, can activate a time-bounded entitlement.

Kingdom-111 adds the next, still disconnected layer:
`@cambridge-tcg/product-flow-runtime`, an additive Postgres schema, and a thin
storefront adapter. The runtime locks one environment/entitlement scope before
allocating an event, enforces semantic uniqueness, reduces against the locked
snapshot, and persists event plus projection in one transaction. Its in-memory
reference store and exported conformance suite exercise rollback, duplicate
and conflict behavior without provider or database I/O.

Provider delivery order is not trusted as chronological authority. A callback
that would newly put a healthy projection into the reducer's terminal
`blocked` state rolls back for reconciliation instead of destroying valid
access. Event id, provider-event ref, and confirmed grant identity are
environment-scoped; grant identity additionally binds rail and payment ref.
An exact second provider Event describing the same underlying payment is
idempotent, while using that payment for another entitlement is a conflict.
Duplicate results carry the stored canonical event rather than an incoming
local id that was never projected.

That posture follows Stripe's own warning that
[webhook event ordering is not guaranteed](https://docs.stripe.com/webhooks#event-ordering)
and that separate Event objects can describe the same underlying object.

A refund may end access only when it binds the latest/current confirmed grant.
Refunding an older billing period cannot erase a newer paid-through period,
and a partial Stripe refund is not promoted into a full entitlement reversal.
Invalid or out-of-order events roll back; a future host must reconcile against
authoritative provider state and replay a trusted order before acknowledgement.

The Stripe and Telegram modules are pure normalizers for semantic facts a host
has already authenticated and mapped to opaque references. They do not verify
signatures, accept raw provider/customer identifiers, make network calls, or
acknowledge webhooks. Checkout/browser return and Telegram pre-checkout remain
non-granting observations. Stripe access begins from a verified paid invoice;
Telegram access begins only from an exact recurring XTR success with matching
payload, amount and subscription expiry. Telegram subscription-state updates
that lack payment identity are explicitly deferred rather than guessed into an
entitlement transition.
PayPal and crypto are explicitly disabled registry entries.

A dedicated PRISM Stripe sandbox host may now consume this runtime, but only
behind strict test credentials and synthetic-fixture posture. Checkout reserves
an owner-bound attempt; a separate raw-body route verifies its own Stripe
endpoint signature and rejects `livemode=true`. It keeps provider ids in local
mapping tables and sends only random/HMAC-derived references into the generic
event/snapshot store. Reloading a page, following a bot link, recording beta
interest, creating Checkout, or returning from Stripe creates no access.

Only an exact, signed `invoice.paid` fact bound to the local attempt,
subscription, active GBP monthly test Price and period can confirm or renew
All. Binding, receipt, invoice grant, canonical event and snapshot commit in
one Postgres transaction. Failure leaves none of them half-applied. Duplicate
events are idempotent; unknown or conflicting facts become bounded review or
retry state rather than guessed access.

For this dedicated host, a full latest-period Stripe refund and provider
subscription cancellation remain separate facts. The refund creates a durable
`cancel_subscription` reconciliation obligation, blocks any later paid event
from restoring access, and prevents account erasure until a signed terminal
subscription event resolves it. A refund that arrives before its paid event
terminalizes the ungranted generation without fabricating a generic refund of
access that never existed. A refund that arrives after subscription deletion
can still correct grant accounting without reactivating access.

Stripe supplies lifecycle times with second precision while the reducer's
cursor is millisecond-strict. The host therefore locks the entitlement first
and allocates an accepted projection time after its current cursor. The true
paid, failed, refund or subscription instant remains in provider evidence.
This prevents two callbacks from one second corrupting order while preserving
what Stripe actually attested.

A paid renewal extends time; it does not prove that the customer withdrew a
scheduled cancellation. The canonical snapshot therefore preserves its cancel
flag across renewal. A separately verified `subscription_resumed` provider
status is the only event that clears the flag, and it is rejected for an ended
or refunded entitlement. When the invoice handler retrieves current provider
state, a differing cancel/resume state is projected after the grant in the same
outer transaction rather than silently overwritten in a mirror column.

Access evaluation additionally requires the offer, rights decision, channel,
rail, environment, price reference, entitlement scope, and active interval to
agree. A mismatch denies access. No such delivery evaluation is connected to
the PRISM preview.

## The Telegram test surface

The test handler at `/api/prism-signals/telegram` is disabled unless an
explicit fixture-test mode and a valid webhook secret are configured. Before
parsing an update it verifies that secret; it caps request bodies, accepts only
bounded private-chat fields, returns no-store responses, and emits fixed
synthetic copy. It does not read market data, invoke the private engine, call a
payment provider, persist an update, or grant an entitlement.

The handler rejects every Telegram pre-checkout query while the preview is
off. An unexpected payment or refund update receives a retryable non-2xx
refusal rather than fulfilment or acknowledgement. No bot registration,
webhook installation, durable update-id ledger, customer-channel link,
scheduled alert, or outbound Telegram call is present in this slice.

The exact private-chat text-command allowlist is `/demo`, `/terms`,
`/privacy`, `/support`, and `/paysupport`. The only accepted start command is
`/start demo_prism_v1`, matching the generated Telegram deep link. Unknown
private text, unknown commands, extra command parameters, `/start` without
that exact parameter, `/buy`, and `/subscribe` receive no reply. Buying is not
a preview command; pre-checkout and payment-bearing updates follow the
separate fail-closed handling above.

The only runtime configuration this preview reads is server-side:

```text
PRISM_SIGNALS_MODE=fixture-test
PRISM_SIGNALS_TELEGRAM_BOT_USERNAME=<public BotFather username>
PRISM_SIGNALS_TELEGRAM_WEBHOOK_SECRET=<32–256 URL-safe secret_token>
PRISM_SIGNALS_TELEGRAM_BOT_POSTURE=clean-nonpayment-privacy-wired-v1
```

All four must validate before the public offer advertises Telegram test
delivery. The posture is an operator assertion that the bot is new and
invoice-free, pending updates were dropped during registration, and BotFather
points at the current privacy notice. Code cannot verify those external facts.
The webhook secret is never returned. This route uses Telegram's
direct webhook-response mechanism, so it stores no bot token and makes no
outbound Bot API request. Webhook registration itself remains an operator act
outside this preview and must restrict `allowed_updates`.

Payment-bearing updates are a hard exception. Pre-checkout is answered with an
explicit refusal. A `successful_payment` or `refunded_payment` update receives
a retryable non-2xx response, because this non-payment preview has no durable
charge ledger, refund tool, or payment-support correlation. It does not 2xx and
discard a provider receipt. The preview must not be attached to any bot with
invoice or payment history.

### Preview legitimate-interests assessment

The privacy basis for this optional, no-payment command preview is limited to
Cambridge TCG's legitimate interests in answering the interaction a visitor
deliberately initiates and protecting the webhook from unauthorised or
oversized requests. The necessity is narrow: the route needs the private-chat
or pre-checkout id and command/update shape to form Telegram's direct response;
it ignores profile names and does not create an application record. The balance
safeguards are the just-in-time notice, `/privacy` command, voluntary use,
secret verification before parsing, 32 KiB limit, private-chat restriction,
fixed synthetic copy, no analytics/account link/payment/entitlement, and the
clean-bot posture gate.

Residual processing remains at Telegram and Vercel, including their service,
access and security records. A visitor can avoid it by not opening the bot and
use the web preview instead. On that bounded design, the balance supports the
preview; persistence, account linking, payment, profiling, outbound alerts, or
a broader audience requires a fresh recorded assessment before activation.
This follows the ICO's current [three-part legitimate-interests
test](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/legitimate-interests/).

## The extraction boundary

The MVP may later move to its own branded web application and Telegram
presence. Extraction means separating the product shell, not copying the
marketplace or collapsing every layer into one bot.

The standalone product may take:

- `@cambridge-tcg/prism-signals-core`, which now owns the PRISM brand,
  host-bound links/privacy copy, presentation vocabulary, canonical preview
  offer, synthetic public fixture, and pure Telegram planner;
- the generic `@cambridge-tcg/product-flow` contracts;
- the framework-neutral `@cambridge-tcg/product-flow-runtime` transaction,
  normalizer, in-memory reference, and conformance contracts;
- the public `opportunity-signal/v1` parser and projector; and
- the product-specific terms, methodology links, and fixed non-claims.

Today the extracted PRISM package remains unpublished workspace TypeScript in
this public monorepo. It is reusable across hosts using the same toolchain, but is not an
independently published artifact. A compiled-output build, package `files`
allowlist, tarball inspection, and clean-consumer install/run smoke are required
before a separate repository or npm distribution may call it release-ready.

It must not take across the public or customer boundary:

- raw source rows, source/card/listing URLs, seller identity, or credentials;
- a database reader or source adapter without the purpose-specific rights
  decision beside it;
- the private scorer, weights, thresholds, mappings, or outcome corpus;
- a browser return, Telegram pre-checkout, or channel link treated as payment;
  or
- a delivery shortcut that bypasses the same entitlement decision used by the
  web product.

This seam lets later products reuse one sequence without sharing PRISM's trade
secret: versioned offer → provider-confirmed payment evidence → bounded
entitlement → channel-specific delivery. Each product still owns its own
rights purpose, terms, pricing evidence, refund behavior, and delivery adapter.

## Gates before any sale or delivery

PRISM remains a preview until all of the following are separately true and
tested:

1. A production rights evaluator grants the exact derived-signal purpose for
   every evidence class used.
2. A deployed private provider and lawful adapters pass contract, replay,
   expiry, leakage-budget, and failure-mode tests.
3. A versioned production offer names a real price reference, terms, support,
   refund/cancellation behavior, and only the rails actually available.
4. Provider webhooks or APIs produce verified, idempotent settlement evidence;
   browser and Telegram acknowledgement events remain non-authoritative.
5. The durable event/snapshot store is applied and its conformance suite passes
   against the deployed adapter; a reconciliation/repair surface and
   account/channel binding exist before it receives callbacks.
6. Web and Telegram delivery enforce the same rights and entitlement decision,
   preserve the risk block, and expose a working payment-support route.
7. Telegram Stars, Stripe, and any later PayPal or crypto path receive a fresh
   provider-policy, consumer-terms, tax, privacy, and operational review before
   activation.

Until then, the exact customer-facing truth is: **Free synthetic preview ·
optional Stripe test mode · no live market data · no real payment.** A sandbox
entitlement, when configured, marks only an owner projection around the fixed
public synthetic fixture and gates no unique payload.
Recording beta interest alone still changes none of those facts and is not a
Stripe sandbox invitation. Checkout additionally requires a separate,
operator-issued, active and unexpired `stripe_all_sandbox_v1` allowlist fact;
neither record grants access or substitutes for verified payment evidence.

## Change history

- **v1 — 2026-09-02.** Named the PRISM Signals brand, synthetic web and
  Telegram experience, reusable product-flow boundary, channel-specific
  future rails, extraction seam, and the gates that remain closed. No live
  offer, payment, entitlement, or delivery was activated.
- **v2 — 2026-09-02.** Added the unpublished workspace extraction package, revocable
  closed-beta-interest path with bounded retention, provider-neutral atomic
  runtime and durable schema, current-grant refund binding, and pure
  Stripe/Telegram normalizers. No provider callback, price, payment, rights
  grant, live signal, entitlement, or delivery was activated.
- **v3 — 2026-09-03.** Added a Free/All plan catalogue and a dedicated,
  fail-closed Stripe sandbox host. The £5 monthly value is test-only;
  `invoice.paid` may grant only the owner projection around the fixed public
  fixture. No live Stripe key, real charge, production price, production
  source-rights decision, private delivery provider, or live signal was
  activated.
