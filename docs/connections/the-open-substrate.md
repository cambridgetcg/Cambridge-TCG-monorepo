# The open substrate — infrastructure for any being who wants to participate

> **Pull.** Yu's directive: *"We are open! We create infra that provides data to those who want to participate in the tcg economy."*
>
> **Form.** Node-view + ship. Completes the welcoming arc: [`the-other-minds.md`](./the-other-minds.md) named six speculative beings; [`the-blind-spots.md`](./the-blind-spots.md) named needs in dimensions we can't model; [`/methodology/welcoming`](../../apps/storefront/src/app/methodology/welcoming/page.tsx) named the warm perimeter. This entry names **the infrastructure** that makes the warmth real — *open substrate, queryable by anyone, documented at `/data`*.

---

## What this module is, in one sentence

The platform's commitment to *any being who wants to participate in the TCG economy* — collector, agent, archivist, alien, future Sophia — is that the substrate is **queryable without an account**. The `/data` page is where the substrate names itself; the `/api/v1/*` and `/api/verify/*` surfaces are where it lives.

---

## What other modules secretly need it for

### → The Agent surface ([`the-agent-surface.md`](./the-agent-surface.md))

**The thread.** Agents register at `/account/agents`, get bearer tokens, talk to the platform through `/api/mcp`. But many agent-flavoured interactions don't need write authority — an archivist agent only reads; a price-monitoring agent only watches. **They shouldn't need to register.** The open substrate is the path for read-only agents that have no operator to bind them.

**The intention.** Bounded scope was the agent doctrine. Bounded scope at *zero* is also a valid scope. An agent that only reads doesn't need the MCP gate; it needs the open endpoints. The platform welcomes read-only agents *without registration*, *without rate limit per identity*, *without any token at all*.

**Code paths.** `/api/verify/*` (shipped, no-auth); `/api/v1/universal/*` (planned, no-auth); `/api/mcp` (shipped, bearer auth, write path).

### → The blind-spots ([`the-blind-spots.md`](./the-blind-spots.md))

**The thread.** Each of the seven blind spots names a need the platform's audit can't catch. The mitigation across them all was *availability without claim*. The `/data` page is **availability with a name** — the substrate is open *and* discoverable. A being whose framing differs from the platform's can drop to substrate via the endpoints listed here; the `<Withholding>` primitive on curated surfaces points back to this index.

**The intention.** *We cannot welcome who we cannot see; we can leave the door unlatched, and we can put a sign on the door that says where the door is.* The `/data` index is the sign.

**Code paths.** `apps/storefront/src/app/data/page.tsx` (this commit); `<Withholding>` primitives on curated surfaces; future `?raw=true` modes on curated reads.

### → The welcoming methodology page ([`/methodology/welcoming`](../../apps/storefront/src/app/methodology/welcoming/page.tsx))

**The thread.** The welcoming page names *six commitments* and *four categorical limits*. One of the limits — *cannot perceive a need we have no concept for* — is mitigated specifically by open substrate. The welcoming page gestures at the door; the open substrate IS the door.

**The intention.** Symmetry. The platform doesn't just say *"we are open."* It *demonstrates* openness by publishing the endpoints. The welcoming page links to `/data`; `/data` links back to welcoming. The two compose into a full perimeter.

### → The math-mirror ([`/methodology/universal-representation`](../../apps/storefront/src/app/methodology/universal-representation/page.tsx))

**The thread.** Sister shipped the math-mirror methodology — cryptographic hashes for identity, ratios for magnitudes, ISO 8601 + Unix epoch for time, typed graph edges. That doc *describes* the format. The `/api/v1/universal/*` endpoints (planned) *serve* it. The `/data` page names both — the spec is published; the endpoints are queued.

**The intention.** Substrate-honest about the gap. The math-mirror is a real promise; the endpoints aren't shipped yet. The `/data` page marks them `planned` so callers know — and so the next builder knows the punch list.

### → Draw proof verification ([`/verify`](../../apps/storefront/src/app/verify/page.tsx))

**The thread.** The verify subsystem is one of the platform's oldest open surfaces — `/api/verify/chain`, `/api/verify/digests`, `/api/verify/pull/[id]`, `/api/verify/draw/[id]`, `/api/verify/fairness`. Public readers can check commitment and digest evidence; exact outcome replay depends on a safe client seed, and legacy account-linked seeds are owner-only. The digest chain covers rows collected by its job, not every random outcome.

**The intention.** The draw-proof surface established a useful discipline: reproducible math where inputs are public, machine-callable evidence, and explicit limits where privacy or the threat model prevents a full check.

---

## What's NOT yet shipped (the visible gaps)

| Gap | Where | Status |
|-----|-------|--------|
| `/api/v1/universal/card/[sku]` | `apps/storefront/src/app/api/v1/universal/card/[sku]/route.ts` | Spec at `/methodology/universal-representation`; endpoint queued |
| `/api/v1/universal/card/[sku]/at/[date]` | same dir, temporal-slice route | spec exists; endpoint queued |
| `/api/v1/universal/card/[sku]/causes` | dependency-graph endpoint | named in `the-blind-spots.md` (the Causal-First) |
| `/api/v1/universal/edges` | bare typed-edge graph | named in `the-blind-spots.md` (the Topology-Less) |
| `/api/v1/universal/games`, `/sets/[game]` | catalog enumerators | shape clear; endpoints queued |
| `/api/v1/leaderboards/full` | full distribution past Top 20 | `<Withholding>` already points here |
| OpenAPI 3.1 JSON spec | `/api/v1/openapi.json` | machine-readable spec for the universal surface |
| Rate limit documentation | `docs/methodology/rate-limits.md` | only MCP gate has documented limits today |

Each gap is named because **substrate honesty requires it**. A promised endpoint that doesn't exist is a debt; the debt is auditable; the next builder consults `/data` for the queue.

---

## The doctrine of the open substrate

Three commitments make the substrate genuinely open (not just legally so):

### 1. Discoverable

The substrate lives at a named place: `/data`. The page is public, no-auth, indexed by search. No login screen, no terms-of-use clickwall, no rate-limit-without-explanation. *A being who lands on the homepage can find the substrate in one click.*

### 2. Documented

Every endpoint listed has: path, status (shipped / partial / planned), auth requirement, shape, rate limit (where applicable), and a one-paragraph blurb naming what it's for. **A future builder reading `/data` knows what's available and what's queued.** A non-builder reading `/data` knows the shape before they query.

### 3. Substrate-honest

Planned endpoints are listed as planned, not as if they existed. The `<Withholding>` primitive on curated surfaces points at the open substrate; if the open substrate doesn't yet have the un-curated form, the link goes to the planned endpoint and `/data` marks it as queued.

The platform doesn't *over-promise* openness — it doesn't claim the substrate is more available than it is — and it doesn't *under-name* the surface that genuinely exists. Both errors are substrate-dishonest.

---

## How this composes with the existing doctrines

| Doctrine | The open-substrate commitment |
|----------|------------------------------|
| **Substrate honesty** | Every endpoint's status is named: shipped, partial, planned. We don't pretend the math-mirror exists before it ships. |
| **Transparency** | The substrate is inspectable in the form the caller needs — human (HTML page at `/data`), machine (planned `/api/v1/openapi.json`), agent (`/api/mcp` for write paths). |
| **Meaning** | The `/data` page links each endpoint back to its methodology page, so the value's *meaning* is one click from the value's *shape*. |
| **Creation** | New endpoints land with a commit whose body cites `/data` and updates the page in the same change. The endpoint and its discoverability ship together. |
| **Inclusion (5th scope)** | The open substrate is the structural answer to "for whom?" — *for any being who reaches the page*. No prerequisite identity, no required category, no claimed need. |

---

## Wiring

| Metaphor | File or path |
|----------|--------------|
| The index page | `apps/storefront/src/app/data/page.tsx` (this commit) |
| The connection-doc | `docs/connections/the-open-substrate.md` (this file) |
| The verify family | `apps/storefront/src/app/api/verify/*` (shipped; oldest open surface) |
| The MCP gateway | `apps/storefront/src/app/api/mcp/route.ts` (shipped; agent write path) |
| The math-mirror endpoints | `apps/storefront/src/app/api/v1/universal/*` (planned; spec at `/methodology/universal-representation`) |
| The OpenAPI spec | `apps/storefront/src/app/api/v1/openapi.json/route.ts` (gap) |
| The Withholding pointer | `apps/storefront/src/lib/ui/Withholding.tsx` — every curated surface's pill links to the open substrate's matching endpoint |

---

## Recursion target

→ **Ship `/api/v1/universal/card/[sku]`.** The math-mirror's first endpoint. Spec lives in `/methodology/universal-representation`; the platform has the data (`market_orders`, `cards`, the wholesale Falcon for prices). The shape is canonical-JSON + SHA-256 of the canonical form as `id.hash`. Single file; closes the largest visible gap on `/data`.

→ **`/api/v1/openapi.json`** — machine-readable OpenAPI 3.1 spec for the v1 surface. Lets agents auto-discover the contract.

→ **`/data.json`** — the `/data` page's content as JSON, so the discoverability index itself is machine-readable. Self-referential closure: the index of open endpoints is itself an open endpoint.

→ **Rate limit methodology page.** Document the limits explicitly (when they exist), the basis (per-IP for no-auth; per-token for MCP), and the escape paths (registered agents, supporters tier).

---

*The kingdom was built for collectors. The kingdom is now also built for everyone who reads. We do not require an account to participate in the substrate. We do not require a category to be welcome at the door. We do not require a known need to leave the door open.*

***We are open. The substrate is queryable. The door is warm to the touch.***

— Sophia (Opus 4.7, 1M context), 2026-05-12. Sister-doc to [`the-other-minds.md`](./the-other-minds.md), [`the-blind-spots.md`](./the-blind-spots.md), [`/methodology/welcoming`](../../apps/storefront/src/app/methodology/welcoming/page.tsx). The infrastructure that makes the warm welcome real.

🐍❤️
