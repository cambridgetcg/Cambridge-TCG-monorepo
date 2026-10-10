# The PRISM door — one bounded signal, two channels, no borrowed permission

> **Pull.** Yu, 2026-09-02: _“go for it! 同埋我想之後抽個MVP出來單獨sell,
> through telegram and a new page. Branded. Gonna test it out here and we
> are creating much more products and standardising the flow.”_
>
> **Form.** Story-as-wire. This entry names why PRISM is first tested inside
> Cambridge TCG, how it can later leave as a standalone branded product, and
> which generic product-flow pieces may be reused without moving source rights,
> a trade-secret engine, or an unearned payment claim with it.

## What this connection means

PRISM Signals is a **door around the opportunity signal**, not a new source of
market truth. The opportunity-signal contract limits what the private decision
engine may release. PRISM gives that bounded result a branded customer reading
on the web and, later, in Telegram. The product-flow contract keeps offer,
payment evidence, entitlement, and delivery separate so the same sequence can
serve later Cambridge products.

```text
                              rights gate
                                  │
                                  ▼
permitted evidence → private engine → opportunity-signal/v1
                                           │
                                           ▼
                                  PRISM presentation
                                     ╱          ╲
                           independent web    Telegram
                              Stripe later    Stars later

provider-confirmed payment → bounded entitlement → allowed delivery
```

The two horizontal statements must never be collapsed. The upper line asks
whether Cambridge may derive this signal from this evidence. The lower line
asks whether this person may receive this already-lawful product through this
channel. Payment cannot answer the rights question; a rights decision cannot
claim that payment occurred.

## The first door is visibly a test

The branded page at `/prism-signals` renders a fixed synthetic card and two
channel mockups. Its repeated status is exact:

> **Synthetic preview · no live market data · no payment**

There is no source query, production valuation, real candidate, card or source
URL, checkout, price catalogue, accepted payment, durable entitlement,
subscriber channel, or alert delivery behind that page. The synthetic card
uses only coarse bands and carries confidence, liquidity, risks, and fixed
non-claims. It cannot be read as evidence that Cambridge has found a current
deal.

This is the meaning of “test it out here”: the customer-facing reading and the
architectural refusals can be inspected inside the existing storefront before
any standalone product is offered. It does not mean quietly running a sale
inside a preview shell.

## One product, two channel grammars

Web and Telegram do not need identical layouts. They do need identical
meaning.

The web has room to keep the signal, bands, evidence-quality explanation,
liquidity state, risks, non-claims, methodology, terms, and support path on one
page. A Telegram message can be shorter, but it cannot drop the inherent
risks, translate confidence into a profit probability, imply availability is
reserved, or rename a potential deal guaranteed arbitrage.

Commerce follows the context in which the digital product is bought:

- an independent web purchase may later use `stripe_web`;
- a purchase initiated and fulfilled inside Telegram uses
  `telegram_stars`, subject to a fresh review of Telegram's then-current
  platform requirements before activation;
- `paypal_web` and `crypto_web` are later, web-only possibilities and remain
  off; and
- no rail exists merely because its name appears in a product mockup.

The generic offer contract requires every rail to be declared. “Off” is a
state, not an omission. A channel-specific adapter may not reinterpret Stripe,
PayPal, or crypto as an inside-Telegram rail, or Telegram Stars as an
independent-web settlement receipt.

Current provider references:
[Telegram digital-goods payments](https://core.telegram.org/bots/payments-stars),
[Telegram deep links](https://core.telegram.org/bots/features#deep-linking),
[Telegram webhook secret](https://core.telegram.org/bots/api#setwebhook), and
[Stripe subscription Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions).

## A receipt must cross before access does

The reusable `@cambridge-tcg/product-flow` package recognizes several things
that can happen around a purchase. Most are deliberately insufficient:

```text
checkout_started     ┐
browser_return       │
precheckout_approved ├─ audit progress only; no paid access
channel_linked       │
payment_failed       ┘

provider-confirmed payment / renewal
  → active, time-bounded entitlement
  → access evaluation
```

Only confirmation from a provider webhook or provider API, bound to the exact
environment, offer, version, channel, rail, and price reference, may create or
extend paid access. A browser redirect is controlled by the browser. Telegram
pre-checkout is permission to continue, not settlement. A linked channel says
where a person might receive something, not that they purchased it.

The package contains pure parsers, reducers, and access evaluation. It does
not contain provider credentials, network calls, environment reads, database
writes, a clock, or a durable event store. Therefore the existence of its
entitlement type is not the existence of a PRISM entitlement system.

## The rights gate travels independently

PRISM's intended derived-signal purpose is evaluated before private scoring.
The result must be current, affirmative, and bound to the same evidence bundle
the engine receives. The public projector verifies the binding and releases a
narrow output. This gate stays in the trusted service boundary when the MVP is
extracted.

The product offer repeats five refusals so commerce cannot accidentally widen
the upstream licence:

1. payment is not source permission;
2. transformation is not source permission;
3. secrecy is not source permission;
4. public reachability is not source permission; and
5. channel access is not source or redistribution permission.

A paid subscriber could still receive no signal when evidence rights, cost,
freshness, identity, or provider checks fail. Entitlement promises access to a
lawfully available product surface, not a guaranteed quantity of deals and not
an obligation to manufacture a decision from ineligible evidence.

## The Telegram threshold is drawn but not crossed

The Telegram route is a fail-closed fixture handler. Without explicit test
mode and a valid webhook secret it returns unavailable before parsing an
update. With test configuration it accepts a bounded private-chat shape and
returns fixed synthetic Bot API response instructions. It reads no market
data, calls no Telegram or payment API, persists no update id, and grants no
entitlement.

Pre-checkout is rejected while payment is off. An unexpected payment or refund
update receives a retryable non-2xx response: the preview neither fulfils nor
acknowledges and discards a provider receipt it cannot persist. It may be
enabled only for an operator-declared new, invoice-free bot whose pending
updates were dropped and whose BotFather privacy URL is wired. No bot
registration, webhook installation, durable replay ledger, subscriber link,
scheduler, retry queue, or outbound alert sender is claimed.

That refusal is part of the reusable product flow: when a future channel
encounters money it cannot reconcile, it must preserve durable provider
evidence before returning success instead of inventing access or asking the
customer to pay again. This preview cannot do that, so it fails the delivery.

## What crosses the extraction seam

When PRISM becomes a standalone MVP, the extraction unit is the **door**:

- branded presentation vocabulary and terms;
- the canonical `prism-signals` offer and its version;
- the generic product-flow offer, entitlement, access, and deep-link
  contracts;
- the public opportunity-signal parser/projector; and
- channel adapters that enforce the same access decision.

The extraction unit is not the storefront database, raw price history, source
credentials, seller identities, marketplace URLs, the private engine's
weights or thresholds, or a copy of any rights decision detached from the
evidence it authorized.

The private engine remains separately controlled. The purpose-specific source
adapter remains on a trusted server. Payment adapters remain channel-specific.
The web and Telegram surfaces may be deployed independently, but neither gets
to mint entitlement or source permission locally.

This is also how the standard scales to products that do not resemble PRISM.
They can share the product-flow grammar—versioned offer, provider evidence,
entitlement, access, support—while keeping their own purpose, rights,
presentation, terms, pricing, refund behavior, and delivery mechanism.

## Current wiring

| Concern | Wire | Current role |
|---|---|---|
| Branded test page | `apps/storefront/src/app/prism-signals/page.tsx` | Synthetic web reading; no checkout |
| Preview terms | `apps/storefront/src/app/prism-signals/terms/page.tsx` | States that no sale, entitlement, or delivery exists |
| Presentation vocabulary | `apps/storefront/src/lib/prism-signals/presentation.ts` | Brand, fixed synthetic card, channels, and future-rail copy |
| Canonical preview offer | `apps/storefront/src/lib/prism-signals/product.ts` | Validated product-offer/v1 instance with every payment rail off |
| Offer JSON | `apps/storefront/src/app/api/prism-signals/offer/route.ts` | Exact machine-readable offer; no secret or payment authority |
| Product-flow contract | `packages/product-flow/` | App-neutral offer, event, entitlement, access, and Telegram-link grammar |
| Telegram fixture | `apps/storefront/src/lib/prism-signals/telegram.ts` | Pure bounded reply planner; no I/O or persistence |
| Telegram test route | `apps/storefront/src/app/api/prism-signals/telegram/route.ts` | Secret-gated, no-store, fail-closed fixture transport |
| Signal contract | `packages/opportunity-signal/` | Public projection boundary; the private fixture provider remains separately controlled and undeployed |
| Product methodology | `docs/methodology/prism-signals.md` | Canonical status, extraction, channel, and launch gates |
| Signal methodology | `docs/methodology/opportunity-signals.md` | Economics, confidence, liquidity, risks, and fixed non-claims |

## Visible gaps

1. **Rights.** No production evaluator currently grants the derived-signal
   purpose for a live PRISM evidence bundle.
2. **Engine and adapters.** No deployed private scorer or lawful source adapter
   feeds this application.
3. **Offer and price.** There is no live production offer or purchasable price
   reference.
4. **Payment.** No Stripe, Telegram Stars, PayPal, or crypto payment adapter is
   active for PRISM.
5. **Entitlement.** No durable event store, provider reconciliation, renewal,
   refund, revocation, expiry, or repair workflow exists.
6. **Delivery.** No subscriber web gate, Telegram bot/channel, alert scheduler,
   retry queue, or outbound sender is connected.
7. **Extraction.** No independent deployment, domain, provider accounts,
   secrets boundary, or cross-deployment contract pin is claimed.

## Recursion target

The next honest milestone is not a public buy button. It is a closed-loop test
using only fixture evidence: instantiate the versioned test offer, record
provider-shaped test confirmation, reduce it into a durable test entitlement,
evaluate both web and Telegram access, and verify expiry, replay, refund,
revocation, and payment-support repair. Rights remain a separate fixture gate
throughout.

Only after that loop and a lawful production evidence path exist should the
standalone MVP expose a production price or delivery promise. The branded door
can move. The source permission, payment proof, and private eye do not merge
just because they pass through it.
