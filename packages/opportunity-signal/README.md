# `@cambridge-tcg/opportunity-signal`

The public, source-independent boundary for `opportunity-signal/v1`.

This zero-runtime-dependency package validates one explicitly timed candidate,
checks source-release binding, applies transparent conservative economics,
invokes an injected private classifier, and projects a short-lived
decision-support signal. It performs no file, database, environment, or
network I/O and never reads a clock. SHA-256 uses Web Crypto, with an explicit
digest-provider seam for runtimes that do not expose `globalThis.crypto.subtle`.

The package deliberately contains no source adapter, scorer, model, weight,
private threshold, live endpoint, automated purchase path, or exact fair-value
delivery. A trade-secret engine must live separately and implement only
`OpportunitySignalProviderV1`; no deployment is claimed here.

## Exact v1 documents

- Input: `cambridgetcg.opportunity-signal-input/1`
- Private-provider result:
  `cambridgetcg.opportunity-signal-provider-result/1`
- Public output: `cambridgetcg.opportunity-signal/1`

All money inputs are already-normalized integer GBP minor units. Integers must
be safe, non-negative, not negative zero, and at most `100_000_000_000`.
Candidate asking price is positive, quantity is exactly one, and every range
satisfies `low <= midpoint <= high`.

Timestamps are canonical UTC with millisecond precision. Callers inject
`evaluated_at`; the package never uses `Date.now()`. Evidence cannot be
retrieved in the future and must expire after retrieval. Evidence that is stale
at `evaluated_at` blocks the private provider.

Candidate and valuation carry matching lowercase Cambridge-shaped SKU,
condition, and finish labels. The validator proves safe syntax and equality,
not canonical catalog membership or real-world comparability; those remain
upstream responsibilities. `candidate_ref` must have the shape `ctcg_cand_`
followed by exactly 22 base62 characters. The validator proves only that shape.
The composing service is responsible for cryptographically random minting and
for ensuring the value contains no identity or personal information.

## Explicit cost and FX assertions

All seven cost decisions are required:

- buyer fee;
- inbound shipping;
- acquisition tax and duty;
- seller fee;
- payment processing;
- outbound shipping;
- disposal tax and duty.

A cost is `known`, `estimated`, `unknown`, or:

```json
{
  "state": "not_applicable",
  "reason": "included_elsewhere"
}
```

The other allowed reasons are `not_charged` and `not_due`. These values are
explicit caller assertions, not facts independently proven by this package.
Unknown required costs block evaluation.

Native GBP normalization is also explicit:

```json
{
  "currency": "GBP",
  "state": "not_required",
  "reason": "all_inputs_native_gbp"
}
```

Quoted FX requires current evidence. Estimated or unknown FX cannot support an
actionable signal.

## Cryptographic binding

The rights decision binds to this bootstrap-safe evidence envelope:

```ts
type OpportunitySignalEvidenceEnvelopeV1 = {
  schema: "cambridgetcg.opportunity-signal-evidence/1";
  evaluated_at: string;
  candidate: OpportunitySignalCandidateV1;
  valuation: OpportunitySignalValuationV1;
  costs: OpportunitySignalCostsV1;
  currency_normalization: OpportunitySignalCurrencyNormalizationV1;
};
```

The versioned `schema` is the hash-domain separator and is included in the
canonical digest payload. `evaluated_at` is present so the strict parser can
validate nested timing, but is not hashed. The remaining digest payload is
`candidate`, `valuation`, `costs`, and `currency_normalization`. It can
therefore be computed before a rights receipt exists:

```ts
const digest = await opportunitySignalEvidenceBundleDigestV1(envelope);
```

`release_eligibility.evidence_bundle_digest` must equal the recomputed digest
before the provider is invoked. The release receipt also names the exact
`subscriber_derived_signal` operation, eligibility, expiry, and a policy
digest.

A second SHA-256 digest covers the complete validated input, including rights:

```ts
const requestDigest = await opportunitySignalRequestDigestV1(input);
```

The provider receives a frozen `{ request_digest }` context and must echo that
digest in its result. Projection recomputes both hashes. Changing candidate,
valuation, costs, FX, timing, or rights invalidates a stale provider response.
Canonical JSON sorts object keys lexically and preserves validated array order.

An injected `digestProvider` is a trusted internal capability. A dishonest
provider can forge bindings, so never accept one from a subscriber, request
payload, plugin, or other untrusted code. Raw evidence envelopes, full inputs,
and rights-receipt composition likewise belong inside the trusted service
boundary; the public signal—not its source material—is the subscriber-facing
artifact.

Authentication, payment, public reachability, transformation, and secrecy do
not create source permission. The contract verifies a rights assertion and its
binding; it does not grant a licence.

## Transparent economics, private classification

The public package uses `BigInt` to compute a conservative floor:

```text
acquisition HIGH = asking price
                 + buyer fee HIGH
                 + inbound shipping HIGH
                 + acquisition tax/duty HIGH

spread LOW = gross exit LOW
           - acquisition HIGH
           - seller fee HIGH
           - payment processing HIGH
           - outbound shipping HIGH
           - disposal tax/duty HIGH

margin LOW bps = floor(spread LOW × 10,000 / acquisition HIGH)
```

This arithmetic is public. The policy deciding whether a positive opportunity
meets the product's private threshold is absent. A provider cannot claim
`potential_deal` unless the public conservative spread and margin are both
positive.

The provider returns classification, canonical reasons, expiry, and binding
only. It cannot return an estimate, exact spread, fair value, features, scores,
weights, source rows, URLs, identity, or debug fields.

Potential-deal output exposes only two projector-derived bands:

- spread: `positive_under_500_minor`, `500_to_1499_minor`,
  `1500_to_4999_minor`, or `5000_plus_minor`;
- margin: `positive_under_1000_bps`, `1000_to_2499_bps`,
  `2500_to_4999_bps`, or `5000_plus_bps`.

Nearby exact values therefore produce the same public result. `not_qualified`
and `unavailable` always carry `estimate: null`. The contract exposes no
classification that asserts certain arbitrage or guaranteed profit.

## Orchestration and redaction

```ts
const signal = await evaluateOpportunitySignalV1(privateProvider, rawInput);
```

The evaluator:

1. strictly parses and freezes plain JSON;
2. applies public rights, timing, identity, cost, FX, and evidence blockers;
3. recomputes the evidence-bundle digest;
4. skips the provider if any blocker exists;
5. computes the full request digest and invokes the provider once;
6. rejects unknown or replayed provider results;
7. recomputes conservative economics and projects only coarse bands; and
8. validates the final public output.

Structurally invalid caller input throws a safe
`OpportunitySignalContractError`. Preflight blockers return `unavailable`.
Provider exceptions and contract drift fail closed without retaining raw values
or private exception text.

Every public output carries the inherent `availability_not_reserved`,
`condition_unverified`, and `authenticity_unverified` risks. Non-rights output
may also carry canonical valuation-derived risks. Rights-denied output keeps
only safe candidate identity, the exact inherent-risk tuple, and the fixed
non-claims. It exposes no `valuation_as_of`, confidence, liquidity,
valuation-derived flags, or estimate. This also applies when a digest mismatch
or the provider itself reports rights denial.

Public expiry is no later than every used evidence expiry, rights expiry,
provider expiry, and `evaluated_at + 60 seconds`. The exact `claim_scope` and
`does_not_include` tuple prevent downstream code from upgrading the signal
into an executable quote, reservation, guarantee, verification, advice, or
data/model export.

## Focused verification

```sh
pnpm --filter @cambridge-tcg/opportunity-signal typecheck
pnpm --filter @cambridge-tcg/opportunity-signal test
```
