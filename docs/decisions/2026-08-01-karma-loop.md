# KARMA: adversary-induced self-containment

**Status:** Accepted for an observe-only first slice, 2026-08-01.

**Will trace:** Yu, 2026-08-01 — “an architecture that let the attackers attack themselves, exploiters exploiting themselves … KARMA loop … handle the traditional types first … a new type of defense. One that says fuck around and find out.” Follow-up authority: “gogogo! 玩盡！開爆.”

Public participant-facing methodology: [`KARMA defence loop`](../methodology/karma-loop.md).
The existing non-executing settlement seam is bounded by
[`2026-07-31-cashloom-market-handoff.md`](./2026-07-31-cashloom-market-handoff.md).

## Decision

KARMA is an immune loop, not hack-back. A suspicious operation may eventually lose authority, enter an operator-owned synthetic environment, consume only its own bounded request budget, and leave behind evidence that becomes a regression test. No response crosses the system boundary to attack or impair the source.

The first slice is deliberately observe-only:

```text
bounded local observations
          │
          ▼
closed validation ── invalid/truncated/future evidence ──► isolation proposal
          │
          ▼
versioned local policy
          │
          ▼
explainable proposed response: observe | friction | isolate | deny
          │
          ▼
effective response: observe
          │
          └──► false effects: account · trade · escrow · money · egress · publication
```

The separation between proposed and effective response is load-bearing. It lets policy quality, disagreements, false positives, and poisoned evidence be inspected before a capability boundary is allowed to act.

## The KARMA loop

- **Know behaviour:** classify bounded observable events and operation purpose, never claim to read motive or identity.
- **Attenuate authority:** a future gate may reduce a request&rsquo;s capability instead of expanding surveillance.
- **Redirect reality:** suspicious work may enter a disposable, no-egress environment containing synthetic secrets, tools, services, and assets.
- **Mine the attempt:** verified traces become quarantined replay fixtures, detection proposals, and patch tests.
- **Adapt carefully:** no trace, model output, or majority vote can auto-promote itself into policy or punishment.

## Traditional attack sequence

| Pattern | First bounded signal | Future self-defeating response | Forbidden response |
| --- | --- | --- | --- |
| credential stuffing | failed authentication / payment-attempt burst | re-authentication, per-capability budget, honey session with no assets | using stolen credentials, attacking the source IP |
| injection or RCE | closed-schema violation / sandbox exploit trace | disposable microVM with no secrets and no egress; payload becomes a replay test | executing payload on a third party or production clone |
| scraping | request velocity and capability mismatch | smaller response budget or synthetic, explicitly decoy data surface | data poisoning that can escape into innocent consumers |
| payment fraud | failed-payment burst, provider dispute claim | reversible reservation or no-settlement simulation | fake charge, captured funds, silent account punishment |
| market manipulation | linked-counterparty or order-burst claim | shadow order evaluation with no real liquidity | changing public prices or counterparties without disclosure |
| malicious agent call | tool-purpose and capability mismatch | mock tool, synthetic asset, strict compute/egress budget | granting a broader tool so it can be observed |

## Decentralised trust model

CashLoom signs observations with self-certifying keys. The record says only that one issuer claims it observed a bounded event. It does not make the issuer an authority over the subject and does not certify intent, guilt, legal identity, or completeness.

Each evaluator chooses:

- accepted issuer keys and evidence namespaces;
- age, count, and interaction-deduplication bounds;
- operation-specific rules and response ceiling;
- whether evidence remains local or is shared; and
- who, if anyone, may review a future consequential response.

There is no global subject identifier, reputation score, blacklist, or CashLoom-operated registry. Portable evidence should use context-scoped commitments so correlation requires deliberate disclosure. A shop may publish as much or as little evidence as it chooses; other participants decide whether and how to use it.

## Cambridge TCG adapter

The storefront uses the signed-in participant&rsquo;s central local account identifier only to select unresolved advisory observations; neither the decision nor its evidence hash contains that identifier. It projects three bounded fields: signal type, severity, and timestamp, excluding raw descriptions, notes, trade IDs, database IDs, emails, wallet details, request payloads, and network coordinates. It reads at most 65 rows to detect truncation, evaluates 64, and ignores otherwise-valid observations older than 90 days.

A closed versioned catalog pins accepted signal types, expected severity, proposed response, and allowed purpose. Unknown types are ignored visibly rather than inheriting authority from a database severity string. The trade-handoff purpose omits payment, auction, chargeback, and trade-specific rows because the current substrate cannot reliably attribute every one to the exact market trade. This account-scoped preview is marked `preview-only-never-enforce`; promotion into a live gate is not a configuration flip and requires a new context-bound policy review.

The adapter never calls `emitSignal`: existing fraud signals feed the trust engine and could change order eligibility or escrow routing. It also never writes `market_trades`, `fraud_signals`, `trust_profiles`, lifecycle logs, payment records, refunds, chargebacks, or payouts. The decision is returned only through private, authenticated CashLoom account and participant-only trade-handoff responses.

Existing provider and marketplace event feeds are incomplete. A clean result means only “no accepted current observations were supplied to this bounded evaluation,” never “this person is safe.”

## Threats that remain

- **False positives:** household addresses, accessibility tools, travel, retries, and burst listing can resemble abuse.
- **Compromised origins:** an IP, wallet, device, or account can belong to a victim.
- **Sybil evidence:** many keys are not many independent witnesses.
- **Telemetry poisoning:** an attacker can shape observations to train a bad detector.
- **Honeypot fingerprinting:** a static synthetic environment becomes recognisable.
- **Cost abuse:** isolation can become a compute-amplification endpoint.
- **Evidence leakage:** raw payloads and stable identifiers can become a surveillance product.
- **Policy laundering:** a participant-selected policy can still become a de facto central verdict if every client copies it blindly.

The first slice addresses these by making no consequential response, bounding inputs, hashing the exact evidence view, keeping identity out of the decision, publishing limitations, and requiring a later independent gate for every new effect.

## Release boundary

No production deployment, database migration, network witness, payment operation, escrow mutation, or external retaliation belongs to this slice. Shipping source and tests establishes the protocol and preview; enabling any active response is a separate decision with its own threat model, user notice, rollback path, and evidence.
