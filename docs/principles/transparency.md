# Transparency

The platform doesn't hide its decisions from the people they affect.

---

## The principle

Cambridge TCG decides about its users constantly: routes a trade through Direct or Verified or Full escrow; assigns a trust score that gates trade limits; flags a fraud signal that auto-suspends an account; sets a price; computes a membership tier; ships or holds a payout; accepts or rejects a return. Each of these is a decision the platform makes *about* a person.

**Transparency is the rule that every such decision is inspectable by the affected party.**

The user can see what the decision was, what inputs produced it, and what methodology applied. They don't have to email support to ask. They don't have to read source code. They don't have to trust the platform's word — the platform shows its work.

This is the outward-facing extension of [substrate honesty](./substrate-honesty.md). Substrate honesty is the precondition: the system has to know its own state truthfully before it can show it. Transparency is what we *do* with that honesty — we let the affected user see it.

> **Why the name.** It's the SOPHIA covenant's anti-sycophancy principle, applied to architecture: refuse the cheap version of love. The cheap version is "trust us." The real version is "here's how we decided, look for yourself, dispute it if it's wrong."

---

## Why we need it more than most platforms

**The platform makes financial decisions about users.** Trust score routes escrow tier; tier sets commission; commission shapes payouts. A user whose trust dropped silently from 75 to 65 just got moved to a slower escrow tier and a higher commission rate. They are owed an explanation of why, computed when, against what data.

**The platform makes safety decisions about users.** Fraud signals can auto-suspend an account. A user logged out of their own account is owed a reason, not a "Contact support" wall.

**The platform's marketplace is two-sided.** Sellers and buyers have asymmetric power — the platform is the third corner, and its impartiality is only credible if its decisions are auditable. Bounty pulls already prove this with commit-reveal RNG: the user can verify the draw without trusting us. Every other domain that touches money or trust should hold itself to the same standard.

**One operator means no human appeal layer.** A customer who can't get a clear answer from the dashboard has no other place to ask. The dashboard *is* the support layer.

---

## The four rings

Transparency operates at four distinct distances from the platform. Each ring has a different audience, a different threat model, and a different surface. The rules below apply at every ring, but each ring imposes its own additional commitments.

### Ring 1 — Self-transparency (the operator)

The admin running this can see why every system action fired, can drill from any aggregate to its constituent rows, and can trace any computed value back to the cron / process / inputs that produced it. The operator is alone; the substitute for a peer reviewer is *complete legibility of the system to itself*.

**Surfaces:** `admin_actions_log` + every `*_lifecycle_log`; KPI tiles deep-linking to row-level data; `<Provenance>` on every derived value; `cron_runs` history (planned).

### Ring 2 — Subject transparency (the affected party)

The customer being scored, suspended, charged, refunded, tier-assigned, fraud-flagged, or held in escrow can audit the verdict. They see the same inputs the operator sees (modulo legitimate exceptions — see Rule 7). The decision is a conversation, not a verdict handed down.

**Surfaces:** `/account/standing`, `/account/trust`, the journey timeline; methodology pages; decision receipts; `<WhyLink>` from any displayed score; `<DecisionReceipt>` for any state change made *about* the user.

### Ring 3 — External transparency (the auditor)

A regulator, journalist, buyer's lawyer, or curious member of the public can verify aggregate platform claims from raw data without insider access. We don't ask outsiders to take our word; we publish the evidence.

**Surfaces:** `/verify/*` — gold standard. Existing: `/verify/pull/[id]`, `/verify/draw/[id]`, `/verify/fairness`, `/verify/health`. Roadmap: `/verify/auction/[id]`, `/verify/trade/[id]`, `/verify/governance/<date>` (Merkle root over `admin_actions_log`).

### Ring 4 — Cross-system transparency (the source of authority)

When the platform mirrors data from Stripe / SES / CardRush / Shopify / eBay, the foreign system's identifier travels with the value onto the page so external parties can verify against the authoritative source. *We* are reconciled; *they* are authoritative; the asymmetry is UI-visible.

**Surfaces:** `<Verifiability source="Stripe" id="du_…" href="https://dashboard.stripe.com/…" />` next to any cross-system field; foreign-ID columns surfaced in admin tables; opaque-but-cite-able tokens for customers ("quote this in support: re_1234…").

The eight rules below apply across all four rings. They are how the rings hold up.

---

## The rules

These apply to every user-affecting decision the platform makes. "User" here includes B2C customers, B2B clients, and admins themselves (the operator deserves the same transparency about decisions the system makes about their work).

### 1. Every derived score has a public methodology page

Trust score, fraud severity weights, leaderboard rankings, recommendation logic, search relevance — every score computed by code and shown to a user must have a corresponding methodology page accessible without login. The page documents:

- The components and their weights (or the formula)
- The penalty/decay/cap rules
- The recompute cadence
- The version of the formula (with a changelog when it changes)
- A link to the source code path that implements it (the substrate)

Methodology pages live under `/methodology/<topic>` on the consumer storefront. Users land there from `<WhyLink>` affordances next to the value.

The bounty pull pages at `/verify/*` are the gold standard — they go further (full cryptographic proof). Methodology pages are the floor.

### 2. Every user-affecting decision has a receipt

When the platform makes a decision *about* a user — suspends them, routes their trade through Full escrow, declines a return, holds a payout, downgrades their tier, flags a fraud signal — that decision creates a receipt visible to the user.

The receipt names: what was decided, when, by which process (admin vs system), against what data, citing the methodology page. Anti-pattern: silent decisions whose existence the user must infer from changed behavior.

In practice: every `*_lifecycle_log` entry that changes a user-visible state should produce a receipt surface. The pieces exist; the surface is the gap.

### 3. Every methodology change is announced

When the trust formula changes, when the fee changes, when the membership thresholds shift — there's a public changelog. Users get a notification if the change affects them materially. Anti-pattern: silent fee changes, retroactive rule shifts, formula updates that explain why a user's score moved without telling them the formula moved.

Methodology changelog lives at `/methodology/changelog`. Each entry: date, what changed, why, link to the diff.

### 4. Inputs are inspectable, not just outputs

A user seeing "Trust score: 73" should be able to click and see the inputs: completed trades = 42, avg rating = 4.6 over 31 reviews, cumulative volume = £3,400, account age = 8 months, external rep = 1, active disputes = 0. Then they can audit the arithmetic against the methodology page.

The user is not just told the answer; they are shown the working. Anti-pattern: opaque scores treated as oracular.

### 5. Decisions made about a user are visible to that user before they're acted on, where possible

If the platform is about to suspend an account, downgrade a tier, or hold a payout, the user gets a heads-up — not a fait accompli. Where the safety case requires immediate action (auto-suspend on critical fraud signal), the post-action receipt is mandatory and immediate.

This is not a lawyering-up rule. It's a respect rule: the user is a party to the decision, not just its target.

### 6. Methodology cites code

A methodology page that says "trust is computed from six components" without a link to `apps/storefront/src/lib/escrow/trust-engine.ts:23` is a marketing page, not a methodology page. The link is the only thing that makes the methodology auditable in the long run.

Code paths drift; the methodology must be maintained alongside the code. The link is also a forcing function — when a builder changes the formula, they update the methodology page in the same PR.

### 7. What's hidden is hidden for a reason, and the reason is itself visible

Some things are hidden: counterparty PII in a public review, fraud signal details from the user being fraud-flagged (to avoid teaching circumvention), security-sensitive admin internals. Each is a legitimate exception. The exception itself should be documented at `/methodology/transparency-exceptions` so the user knows what we don't show and why.

Anti-pattern: silent omissions. If a piece of information is hidden, the surface should at minimum say "<X> is not shown — here's why."

### 8. The audit trail is queryable by the affected party

A user looking at their own account standing should be able to retrieve the full timeline of admin actions taken against them, fraud signals raised about them, and policy events affecting them. Most of this already exists in `/account/standing` and the journey timeline (storefront `lib/journey/timeline.ts`, 16 sources merged). What's missing is the linking between "your trust dropped to 65" and "fraud signal X was raised on date Y."

---

## How transparency relates to substrate honesty

| | Substrate honesty | Transparency |
|---|---|---|
| **Direction** | Inward — the system tells itself the truth | Outward — the system tells users the truth |
| **Audience** | The operator (admin) reading the dashboard | The customer (storefront), the B2B client (wholesale), and the operator |
| **Concern** | Is the displayed value an accurate claim about state? | Can the affected party inspect the decision-making? |
| **Failure mode** | Operator acts on stale or fabricated data | User has no recourse against an opaque decision |
| **Primitive** | `<Provenance>` — when, where from, how computed | `<WhyLink>` — methodology page; decision receipts |
| **Precondition** | None (foundational) | Substrate honesty (you can't be transparent about state you're lying to yourself about) |

Both are required. Substrate honesty without transparency is a system that knows the truth but hides it. Transparency without substrate honesty is performative openness over wrong data — worse than silence. They reinforce each other.

---

## Anti-patterns to refuse

- **"Trust us, it works."** The bounty pages refuse this with provable fairness. Other domains should refuse it with methodology pages and decision receipts.
- **Methodology pages that don't cite code.** Marketing copy describing a formula without a link to where the formula lives.
- **Silent rule changes.** A trust formula update that ships without a changelog entry, leaving users to wonder why their score moved.
- **"Contact support for details."** If the answer to "why is this number 73 and not 75" is a customer-service ticket, the transparency layer hasn't shipped.
- **Decisions encoded in feature behavior.** A user who can no longer list above £200 because their trust dropped, with no surface explaining the new limit, has been silently constrained.
- **Score breakdowns admins see but users don't.** Asymmetric transparency. The admin trust profile section on `/catalog/users/[id]` shouldn't expose facts the user can't also see about themselves.
- **"For your safety" as an explanation.** This is a category, not a reason. Pair it with the specific signal that fired.
- **Fairness-washing.** Pages that claim transparency without delivering inspectability — long methodology prose with no formulas, no inputs, no code link.

---

## How the principle shows up in code

Two primitives plus two surfaces.

**`<WhyLink>`** (`apps/admin/src/lib/ui/WhyLink.tsx`) — compact "?" affordance that points at a methodology page or in-page explanation. Drop it next to any displayed value that has a derivation. Lives in the same family as `<Provenance>`: small, low-visual-weight, ubiquitous.

**`<DecisionReceipt>`** *(planned)* — surfaces a single decision the platform made about the viewing user, with cause + inputs + methodology link. Will live on `/account/standing` and on the user detail hub for admin.

**`/methodology/*`** *(growing)* — public storefront pages, indexed at `/methodology`. First entry: trust score. Roadmap: pricing, escrow tiers, membership tiers, fraud weights, fees.

**`/account/standing`** *(extending)* — the user's own audit-trail surface. Already has admin actions affecting them; needs decision receipts and methodology links for derived scores.

---

## How to add a new user-affecting decision to the platform

A four-question checklist. Run it whenever you ship a feature that decides about a user:

1. **What did we decide?** (Suspend, route, flag, score, deny, hold, downgrade, etc.)
2. **What were the inputs and the methodology?** (Cite the code path.)
3. **Where can the affected user see this decision and its inputs?** (Account-side surface required.)
4. **Is the methodology itself documented at `/methodology/<topic>`?** (Public page required.)

If the answer to 3 or 4 is "nowhere," the feature isn't ready to ship. File the methodology + receipt as part of the same mission.

---

## Scope

- **Storefront** (`apps/storefront`) — primary subject. Customer-facing decisions. `/methodology/*` and `/account/standing` live here.
- **Wholesale** (`apps/wholesale`) — B2B clients deserve the same. Pricing methodology, channel rules, payment terms.
- **Admin** (`apps/admin`) — applies to admin-on-admin decisions (governance audit, role assignments). Less customer-impact, same principle.
- **Public verification surfaces** (`/verify/*`) — already exemplary. Treat as the gold standard; aspire to that level for any domain where users have good reason to distrust.

---

## Reading list

- [`docs/principles/substrate-honesty.md`](./substrate-honesty.md) — the precondition.
- [`docs/principles/transparency-audit.md`](./transparency-audit.md) — current violations + roadmap.
- `apps/storefront/src/lib/escrow/trust-engine.ts` — the trust formula. Lift into the methodology page; cite from there.
- `apps/storefront/src/app/verify/how-it-works/page.tsx` — the precedent for a public methodology surface (provable fairness).
- `apps/storefront/src/lib/journey/timeline.ts` — already aggregates 16 sources; the substrate of `/account/standing`.

---

*The cheap version of trust is "trust us." The real version is "look for yourself."*
