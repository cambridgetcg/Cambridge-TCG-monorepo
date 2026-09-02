# The opportunity signal — the engine keeps its secret and the signal keeps its limits

> **Pull.** Yu, 2026-09-01: _“The direct sales of data is not the proper
> route. Utilising the data to create an application that assist card traders
> to find arbitrage opportunities or deals on the market should be what we
> sell. We keep the engine behind. Trade secrets.”_ Then: _“lets go for what
> you recommended!”_
>
> **Form.** Story-as-wire. Kingdom-109 defines the public
> opportunity-signal/v1 contract and the boundary that keeps its private
> engine structurally absent from this public repository.

## What this module is, in one sentence

The opportunity signal is the narrow customs desk between rights-cleared
private evidence, a proprietary decision engine, and the small signal summary a
trader may receive without turning Cambridge into a raw-data reseller or a
fair-value oracle.

~~~
sources and consent          private service              public application
───────────────────          ───────────────              ──────────────────
rights-cleared evidence  →   valuation + private policy → opportunity-signal/v1
                                                          potential_deal
                                                          not_qualified
                                                          unavailable
~~~

Only the public contracts, safety checks, non-secret cost arithmetic, and final
delivery vocabulary belong in this repository. Source weights, crosswalks,
anomaly rules, feature transforms, commercial thresholds, model artefacts,
and the evaluation corpus are trade secrets. Publishing any of them here
would destroy the boundary the directive asked us to build.

## The public repository is not the engine

The Cambridge TCG monorepo is public. That fact changes the architecture.

[packages/opportunity-signal/](../../packages/opportunity-signal/) contains:

- exact versioned TypeScript shapes;
- strict plain-JSON validation;
- fail-closed preflight checks for rights, identity, time, cost, currency, and
  evidence completeness;
- the interface a separately deployed engine must implement; and
- a projector that rejects unexpected provider fields before any result can be
  delivered.

It contains no proprietary scorer, feature model, weights, commercial
threshold, source reader, network call, database query, clock, randomness, or
environment configuration. It does contain transparent conservative
transaction-cost arithmetic, so the public projector can verify a positive
claim without learning the private policy that selected it.

## The price memory needs a purpose before it needs a customer

The source-intake discipline already separates access, use, and redistribution.
A byte being reachable does not establish every downstream purpose. A
subscriber payment does not widen the source's rights.

Opportunity analysis therefore asks a new question before scoring:

> Is this exact evidence permitted for the operation
> subscriber-derived-signal at this time?

The answer travels as an opaque policy digest, an expiry, and a SHA-256 digest
of the exact candidate, valuation, cost, and currency-evidence bundle it
reviewed. The public boundary recomputes that evidence digest. It does not
ingest the source receipt, raw row, or upstream terms. The private rights layer
evaluates those facts first; the public boundary requires a current affirmative
result bound to the same bytes.

This is stricter than reusing a generic subscriber-display decision. Showing a
price and deriving a commercial signal from it are different operations.

Related wire:
[source-intake.md](../methodology/source-intake.md) and
[the-tributaries.md](./the-tributaries.md).

## Market intent and valuation are different facts

The live Cambridge market already separates open-order intent from completed
trade derivatives. An ask is an offer someone deliberately published. A
valuation is an inference about a possible exit. A signal must not flatten the
two.

The candidate side carries one exact asset and asking price. Its reference has
the Cambridge-minted ctcg_cand_ plus 22-base62 wire shape; the composing service
must create it randomly rather than encoding a seller or source identifier.
The valuation side carries a private bounded estimate for the same SKU,
condition, and finish. The possible exit is not a bid, reservation, buyer, or
promise.

The provider response carries no economics and is bound to the SHA-256 digest
of the full validated request. The public projector independently recomputes
the non-secret cost arithmetic. The final signal never exposes the valuation
or exact spread range: only a private policy's potential-deal result receives
coarse conservative spread and margin bands. Failed and unavailable checks
carry no economics. Bands reduce reconstruction risk; they do not eliminate
threshold inference, so a future application must control candidate minting,
query cadence, and its leakage budget.

Related wire:
[the-market-mirror.md](./the-market-mirror.md).

## Unknown is not zero

An attractive asking price can stop being attractive after shipping, tax,
selling fees, payment processing, insurance, returns, or currency conversion.
The contract names the transaction cost classes instead of hiding them behind
one percentage.

Each cost is known, estimated, not applicable with a closed reason, or unknown.
Unknown blocks a net claim. `not_applicable` must state why no separate charge
is due; a known or estimated zero may instead use an evidence-backed zero
range. The contract makes the assertion visible but cannot prove the business
fact behind it. Money is integer GBP minor units; currency conversion happens
outside the contract and carries its own evidence and expiry.

This arithmetic is part of the public explanation. The commercial threshold
that decides whether a conservative spread is worth a trader's attention is
private.

## Confidence does not pretend to be probability

The engine may classify evidence as low, medium, or high quality. It may not
turn that label into “81% likely profitable” without an outcome-calibrated
corpus that supports the number.

Price movement is not liquidity. A daily aggregate without sale counts cannot
establish how quickly a card can exit. The signal therefore carries
liquidity=unknown as a complete answer. Low, medium, and high require separate
current evidence and remain relative bands, not promised days to sell.

Aggregate price-guide evidence also carries the stable risk
aggregate-not-trade-tape. An average is never renamed last sold.

## Expiry is not availability

Every input has its own source time, retrieval time, and expiry. The result
expires with the earliest dependency and is capped to the market-signal
delivery budget.

That timestamp means only:

> This evidence bundle no longer supports this decision after here.

It does not reserve the listing, authenticate the card, confirm its condition,
or promise that another buyer has not already acted.

## The contract's six refusals

Every final public opportunity-signal/v1 output says it does not include:

1. an executable exit quote;
2. a listing reservation;
3. a profit guarantee;
4. authenticity or condition verification;
5. financial or tax advice; or
6. source rows or model parameters.

These are not legal boilerplate added after a score. The public projector owns
and attaches this fixed tuple; a provider cannot supply, alter, or omit it.

## For whom this first room is built

Version 1 assumes one card, one SKU, one condition, one finish, GBP, and a
trader able to inspect physical risk. That is not every collector.

It does not yet serve sealed lots, graded slabs, bundles, shared shipping,
collective buyers, non-GBP settlement, automated executors, or people who hold
a card outside the accounting frame. The contract names those absences rather
than converting them into unsupported defaults.

## Current surface

The methodology surface is implemented at
[/methodology/opportunity-signals](../../apps/storefront/src/app/methodology/opportunity-signals/page.tsx).
There is no signal route or trader UI.

The contract is source-ready but runtime-dark. A separately controlled private
repository contains only a deterministic fixture provider pinned to the
immutable public package revision. Private CI runs it through the real parser,
digest binding, projector, replay rejection, and rights-redaction path. It is
not a deployed or calibrated deal engine:

- no private provider is deployed or connected to this public application;
- no production rights evaluator authorizes derived signals;
- no adapter composes candidate, valuation, costs, FX, and liquidity;
- no outcome corpus calibrates confidence or commercial thresholds;
- no subscription entitlement or rate limit exists; and
- no alert, purchase, reservation, or execution path exists.

A drawn boundary is not a live product. It is the piece that lets the private
product arrive without leaking or lying.

## Wiring

| Concept | Wire | Role |
|---|---|---|
| Public contract | [packages/opportunity-signal/](../../packages/opportunity-signal/) | Exact input/output and private-provider boundary |
| Public explanation | [docs/methodology/opportunity-signals.md](../methodology/opportunity-signals.md) | Canonical behavior, limitations, and current absence |
| Consumer methodology | [/methodology/opportunity-signals](../../apps/storefront/src/app/methodology/opportunity-signals/page.tsx) | The affected trader's reading |
| Source-purpose discipline | [docs/methodology/source-intake.md](../methodology/source-intake.md) | Access is not use; use is not redistribution |
| Upstream map | [the-tributaries.md](./the-tributaries.md) | Every source keeps its own rights and status |
| Market publication boundary | [the-market-mirror.md](./the-market-mirror.md) | Open intent is not completed-trade history or valuation |
| User directive and scope | [kingdom-109.md](../missions/kingdom-109.md) | The public/private split and do-not-touch boundary |

## Visible gaps

1. **Private service.** The fixture provider has a private home, but no
   deployed service, production scorer, secret-management boundary, or lawful
   data connection exists yet.
2. **Derived-purpose rights.** Existing display permission cannot be presumed to
   cover subscriber signals.
3. **Adapters.** No lawful path currently produces the complete v1 evidence
   bundle.
4. **Calibration.** Confidence is deliberately categorical until outcomes can
   test it.
5. **Delivery.** Auth, entitlement, quotas, alerts, and application UI remain
   unbuilt.
6. **More traders.** Multi-card, graded, sealed, collective, non-GBP, and
   non-resale goals remain outside version 1.

## Recursion target

The natural next move is the **purpose-specific rights evaluator and lawful
adapter**. The immutable pin and cross-repository containment gate now exist;
before any real evidence enters, Cambridge must record authority for the
`subscriber_derived_signal` purpose and keep evidence/rights composition inside
a trusted server boundary. Only then should an authenticated, rate-limited
trader application consume the public signal. Subscription payment can control
access, but it cannot widen the underlying data rights.

The product is not the archive. The product is the trained eye. The archive
supplies evidence; the private engine weighs it; the public contract makes sure
the eye never promises more than it saw.
