# Opportunity signals — decision support, not data resale

> **Current boundary, 2026-09-01:** Kingdom-109 implements the public
> `opportunity-signal/v1` contract and the fail-closed interface a private
> engine must implement. A separate private repository contains a fixture-only
> provider pinned to an immutable public contract revision; private CI exercises
> it through the real parser and projector. No production scorer, source adapter,
> database reader,
> signal API, trader application, alert delivery, subscription, or automated
> purchase path is active. This page documents the contract foundation, not a
> live claim that Cambridge can find deals today.

Cambridge TCG will not sell a historic source database as its product. The
intended product is decision support: a private engine may examine
rights-cleared evidence, estimate the economics of one candidate card, and
emit a short-lived signal that helps a trader decide what to inspect next.

The signal is deliberately named **potential deal**, never arbitrage. A real
arbitrage requires simultaneously executable entry and exit prices plus the
ability to complete both legs. A valuation estimate, a daily aggregate, or an
open listing does not establish any of those facts.

> **Where this lives in code.**
>
> - Public wire contract and strict validator:
>   `packages/opportunity-signal/`.
> - Public methodology page:
>   `apps/storefront/src/app/methodology/opportunity-signals/page.tsx`.
> - Meaning bridge:
>   [`docs/connections/the-opportunity-signal.md`](../connections/the-opportunity-signal.md).
> - Mission boundary:
>   [`docs/missions/kingdom-109.md`](../missions/kingdom-109.md).
>
> The proprietary engine is intentionally absent from this public repository.

---

## The boundary

```text
rights-cleared private evidence
  → private valuation and policy engine
  → strict opportunity-signal/v1 projection
  → trader-facing application (not built)
```

The public contract describes what may cross the final arrow. It does not
describe how Cambridge weighs sources, maps products, filters anomalies,
estimates fair value, calibrates thresholds, or evaluates outcomes. Those are
the trade-secret layer and must live in a separate private service.

Secrecy does not create source rights. Before any evidence reaches the private
engine, a purpose-specific policy decision must permit **derived subscriber
signals**. Permission for public price display, subscriber price display, or
private storage is not silently widened into permission for analytics.
The decision carries a SHA-256 digest of the exact candidate, valuation, cost,
and currency-evidence bundle it reviewed; the public boundary recomputes that
digest before the private provider can run.

## One candidate, one exact asset

Version 1 evaluates one physical copy at a time. The candidate and valuation
must carry matching labels for:

- Cambridge-shaped SKU;
- condition;
- normal or foil finish; and
- quantity, fixed to one.

The contract verifies safe SKU syntax and label equality only. The upstream
mapper and private provider remain responsible for canonical catalog identity
and real condition comparability. They must make the result unavailable rather
than let an all-conditions aggregate silently stand in for a near-mint listing.

The candidate reference has a Cambridge-minted wire shape: **ctcg_cand_** plus
22 base62 characters. The validator can enforce that shape, not the semantic
origin of the bytes. The composing service must generate it with
cryptographic randomness and must never derive it from a seller handle, order
id, marketplace listing id, URL, or other personal/source identifier. When the
composing service honours that requirement, neither source rows nor participant
identities have a field in the public signal.

## Money and costs

All version-1 amounts enter the contract as safe integer **GBP minor units**.
`4250` means £42.50. Floating-point money, negative costs, unsafe integers,
implicit currency conversion, and a zero asking price are invalid.

The candidate asking price is only the first acquisition cost. The contract
also names seven cost classes:

1. buyer fee;
2. inbound shipping;
3. acquisition tax and duty;
4. seller fee on the possible exit;
5. payment processing;
6. outbound shipping; and
7. disposal tax and duty.

Each class is either:

- **known** — supported by a current quote;
- **estimated** — a bounded low/mid/high range;
- **not applicable** — explicitly zero with a closed reason such as
  not-charged, not-due, or included-elsewhere; or
- **unknown** — not zero, and therefore unable to support a net-spread claim.

“Net” means net only of the enumerated transaction costs. It does not include
the trader's time, financing cost, storage, grading, authentication, insurance,
returns, fraud loss, income tax, or an opportunity cost unless a later contract
names and measures those inputs.

When an adapter converts currency, it must round acquisition costs
conservatively upward and possible exit proceeds downward before the values
enter this contract. A quoted or estimated conversion carries its own expiry.
There is no silent 1:1 fallback and no inferred inverse or chained rate.

## Valuation is a range

A possible exit is represented as a low, midpoint, and high estimate. The
range is not an executable quote and is never delivered to a trader through
the public signal contract.

The private engine may draw on permitted first-party trades, consented seller
evidence, licensed partner data, aggregate references, or a mixture. The public
contract records only a broad evidence basis and evidence-quality band. It
does not export observations, feature values, source weights, thresholds, or
model parameters.

The provider does not return economics. It returns only a classification bound
to the SHA-256 digest of the full validated request. The public projector
independently recomputes the non-secret transaction-cost arithmetic. For
privacy and trade-secret protection, only a **potential deal** carries coarse
bands for the conservative net spread and margin; exact ranges remain private.
A not-qualified or unavailable result carries no valuation amount, spread, or
margin estimate. Valuation time, confidence, and liquidity may remain unless
rights are denied; a rights denial nulls all three. Coarse bands reduce
reconstruction risk but do not eliminate inference from repeated queries, so
any future delivery layer must also use Cambridge-minted candidates, rate
controls, and an explicit leakage budget.

## Confidence is not probability

Confidence is one of `low`, `medium`, or `high`. It describes the quality and
comparability of the evidence admitted by the private engine. It is not an
estimated chance of profit.

Version 1 does not emit `0.81`, “81% likely,” or a similar probability. Such a
claim would require a calibrated outcome corpus showing that signals assigned
to a band succeed at the advertised rate after all costs. No such corpus is
claimed today.

Low-confidence evidence cannot produce a potential-deal signal. Aggregate
price-guide data is explicitly labelled `aggregate_not_trade_tape`; an
aggregate is not “last sold.” Interpolation and short or sparse history remain
named risks rather than being disguised as observations.

## Liquidity can be unknown

Liquidity is separate from price. A non-zero average, changing price, or one
low listing does not prove sale velocity.

The contract therefore supports `unknown` as a real liquidity band. Low,
medium, or high requires a separate current evidence receipt, but the wire
validator cannot prove its real-world comparability. The upstream provider owns
that assertion. The bands are intended to be relative to a comparable
game/market/condition population; they do not promise a number of days to sell.

Cardmarket Price Guide aggregates alone cannot establish known liquidity
because they do not carry a completed-sale count or volume for the series.

## Freshness and expiry

Every evidence item distinguishes:

- when the source says its claim was true;
- when Cambridge retrieved it; and
- when that claim expires for this decision.

Source time cannot be replaced with retrieval time to make evidence appear
fresh. A signal expires at the earliest expiry of every required input and is
additionally capped to the platform's 60-second `market_signal` delivery
budget. That cap limits how long the decision may be reused; it does not turn a
daily valuation into live evidence.

`expires_at` says when the evidence bundle stops supporting the signal. It does
not reserve the listing or prove that the card remains available.

## The three classifications

| Classification | Meaning | Exact economics delivered? |
|---|---|---|
| `potential_deal` | A private policy accepted the conservative evidence bundle for further human inspection. | Coarse conservative spread and margin bands only. |
| `not_qualified` | The bundle was computable but did not satisfy the private policy. | No. |
| `unavailable` | Rights, identity assertions, costs, evidence, timing, currency, numeric safety, provider failure, or provider-contract validation prevented a qualified result. | No. |

There is no `arbitrage` classification in version 1.

Stable reason codes name fail-closed boundaries such as ineligible rights,
expired evidence, unknown costs, missing FX, mismatched assets, insufficient
evidence, or numeric overflow. Stable risk codes name limitations such as
aggregate-not-tape evidence, short or sparse history, estimates, unknown or low
liquidity, unreserved availability, and unverified condition or authenticity.

The proprietary threshold and exact feature contributions do not travel with
the signal. If signals become user-facing, Cambridge must still explain the
major factor classes and every named limitation; trade-secret protection is
not permission to make an unexplained decision.

## What a signal does not claim

Every signal carries the same explicit exclusions:

- no executable exit quote;
- no listing reservation;
- no profit guarantee;
- no authenticity or condition verification;
- no financial or tax advice; and
- no source rows or model parameters.

The application must not describe a potential deal as a purchase instruction.
Availability, buyer demand, authenticity, physical condition, tax treatment,
fees, shipping, returns, fraud, and time to sell can differ from the evidence
available at evaluation time. Historical relationships may not persist.

## For whom version 1 is true

The first contract assumes a GBP comparison, one card, one matching
Cambridge-shaped SKU label, one condition, one finish, and a trader able to
inspect the physical and commercial risks themselves. It does not yet model
sealed lots, graded slabs, bundles,
multi-card shipping allocation, collective purchasing, non-GBP settlement,
accessibility-specific explanations, automatic execution, or a trader whose
goal is cultural preservation rather than resale value.

Those absences are scope, not evidence that other traders do not exist.

## Current implementation status

Implemented in kingdom-109:

- public TypeScript contract;
- strict plain-JSON validation;
- SHA-256 binding from the rights decision to the exact evidence bundle and
  from the provider response to the exact full request;
- fail-closed rights/cost/freshness preflight;
- private-engine provider interface;
- public BigInt verification of conservative cost arithmetic;
- coarse-band delivery projection that rejects unknown/debug fields; and
- deterministic contract tests.

A separate private fixture provider is pinned to the immutable public package
revision and passes an end-to-end parser, digest, provider, projector, replay,
and rights-redaction conformance gate. That is a compatibility foundation, not
a production model or service.

Not shipped:

- a deployed private engine or production scoring policy;
- calibrated production valuation or opportunity policy;
- source adapters or database reads;
- outcome calibration;
- signal persistence, API, UI, alerts, billing, or access entitlements;
- automated buying, selling, reservation, or execution.

## Change history

- **v1 — 2026-09-01.** Established the source-independent wire contract and
  the public/private boundary. No executable signal service was activated.
