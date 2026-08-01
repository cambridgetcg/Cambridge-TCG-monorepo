# KARMA defence loop

**Status:** observe-only preview, version 1, 2026-08-01.

**Will trace:** Yu proposed “an architecture that let the attackers attack themselves, exploiters exploiting themselves” and named the KARMA loop: a defence where abusive behaviour creates its own containment and helps harden the system.

The architectural decision and threat boundary are recorded in
[`2026-08-01-karma-loop.md`](../decisions/2026-08-01-karma-loop.md). The payment
handoff it currently observes is documented separately in
[`2026-07-31-cashloom-market-handoff.md`](../decisions/2026-07-31-cashloom-market-handoff.md).

## What is evaluated

Cambridge TCG currently uses the signed-in local account identifier only to select that account&rsquo;s unresolved advisory observations. The decision and its evidence hash receive a bounded projection containing accepted signal type, catalog-pinned severity, and observation time; they never contain that account identifier. They also exclude descriptions, internal notes, trade identifiers, email, wallet information, IP addresses, payloads, and any portable or global subject identifier.

Only signal types in a closed, versioned local catalog can become findings, and the catalog pins each type&rsquo;s expected severity and allowed purpose. Unknown types are ignored visibly. Payment, auction, chargeback, and trade-specific rows are excluded from the market-handoff purpose because the current table cannot reliably bind every such row to that exact trade. This preview is explicitly ineligible for enforcement; a future active gate would require a separately reviewed policy and better context-bound evidence.

The evaluator accepts at most 64 observations and considers at most the previous 90 days. A future-dated, malformed, sparse, or truncated evidence set is not treated as clean evidence. It produces an `evidence-invalid` result and a conservative isolation proposal.

## What the result means

The policy maps each observation severity to a proposed response:

| Severity | Proposed response | Meaning in a future bounded release |
| --- | --- | --- |
| low | observe | retain an explainable local observation |
| medium | friction | require a reversible extra step before a consequential operation |
| high | isolate | move the operation into an operator-owned environment with no real assets or external egress |
| critical | deny | refuse the consequential operation until independent evidence review |

There is no numerical person score. Repeating one observation cannot promote it beyond the response for its declared severity. The strongest current proposal is shown so policy can be reviewed without quietly changing behaviour.

## What happens today

Nothing beyond the private evaluation response. The effective response is hard-coded to `observe` even when the policy proposes friction, isolation, or denial.

This preview remains separate from Cambridge&rsquo;s consequence-bearing
[`trust score`](./trust-score.md); it neither writes that score nor feeds its
fraud-signal penalties.

This release cannot:

- suspend or downgrade an account;
- change a trust score or escrow tier;
- create, mutate, cancel, pay, refund, or settle a trade;
- hold or move money;
- publish an identity, reputation, or blacklist entry;
- contact, scan, exploit, delay, or attack an external machine; or
- promote observations into policy automatically.

An attack source may be an innocent compromised device. “Self-defeating” therefore means the request can eventually be given less authority or an isolated synthetic environment entirely inside infrastructure controlled by the operator. It never means retaliation against the source.

## Why it is decentralised

CashLoom&rsquo;s portable form uses self-certifying issuers and signed observation records. An observation is an issuer&rsquo;s bounded claim, not a platform verdict. Consumers select their own accepted issuer keys and policy; different participants may reach different recommendations from the same supplied bundle. No CashLoom account, corporate identity, central registry, open global count, or universal legitimacy badge is required.

Cambridge&rsquo;s current adapter is deliberately narrower: private, local, unsigned, and participant-specific. It publishes nothing to other nodes. A later portable path must use context-scoped subject commitments and explicit disclosure; stable account or wallet identifiers must never become ambient reputation keys.

## Poisoning and false positives

Attacker-supplied evidence and lifecycle logs are claims, not truth. Future policies must pin accepted issuers, deduplicate signed record IDs and interaction commitments, bound age and bundle size, and refuse automatic learning. A learned detector can propose a test or policy change, but cannot promote itself into enforcement.

Every affected participant must be able to inspect the observation class, time, policy version, proposed response, effective response, and limits. Challenge and correction remain necessary before any consequential mode exists.

## Next gates

1. Replay the observe-only policy against production-shaped fixtures without deploying enforcement.
2. Add reversible friction for one narrow operation with an explicit bypass and expiry.
3. Build disposable no-egress simulation cells containing only synthetic assets.
4. Require independent review before any deny path can affect real accounts or trades.
5. Convert each observed exploit into a quarantined regression test; never execute it against the source.

The source implementation is `apps/storefront/src/lib/cashloom/karma.ts`; the participant-only adapter is `apps/storefront/src/lib/cashloom/karma-db.ts`.
