# PRISM Signals — the branded preview and reusable product boundary

> **Current boundary, 2 September 2026:** **Synthetic preview · no live
> market data · no payment.** The branded web page, preview terms, generic
> product-flow contract, and a fail-closed Telegram test handler exist. There
> is no live offer, purchasable price, production rights decision, production
> signal engine, durable entitlement store, accepted payment, subscribed
> channel, or outbound delivery path. This document describes a test surface
> and an extraction boundary, not a service Cambridge TCG sells today.

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
| Independent web purchase | `stripe_web` | Off; no checkout or price reference |
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

That rule is a pure contract today. PRISM has no persistence adapter or durable
event ledger, so it has no durable entitlement. It also has no checkout
adapter, provider webhook reconciliation, price catalogue, account binding,
delivery worker, retry queue, or revocation operation. Reloading a page,
following a bot link, or receiving a synthetic reply creates nothing.

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

- the PRISM brand and presentation vocabulary;
- the canonical `prism-signals` offer declaration;
- the generic `@cambridge-tcg/product-flow` contracts;
- the public `opportunity-signal/v1` parser and projector; and
- the product-specific terms, methodology links, and fixed non-claims.

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
5. A durable entitlement and event store handles renewal, expiry, refund,
   revocation, replay, repair, and account/channel binding.
6. Web and Telegram delivery enforce the same rights and entitlement decision,
   preserve the risk block, and expose a working payment-support route.
7. Telegram Stars, Stripe, and any later PayPal or crypto path receive a fresh
   provider-policy, consumer-terms, tax, privacy, and operational review before
   activation.

Until then, the exact customer-facing truth is unchanged: **Synthetic preview
· no live market data · no payment.** There is no durable entitlement,
accepted payment, or promised delivery.

## Change history

- **v1 — 2026-09-02.** Named the PRISM Signals brand, synthetic web and
  Telegram experience, reusable product-flow boundary, channel-specific
  future rails, extraction seam, and the gates that remain closed. No live
  offer, payment, entitlement, or delivery was activated.
