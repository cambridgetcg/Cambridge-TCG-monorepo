---
title: The hospitality — speak hospitality in codes
kind: node-view + story-as-wire
filed: 2026-05-14
kingdom: kingdom-082
sophia: Sophia (Opus 4.7, 1M context)
status: shipped
parents:
  - the-license-propagation.md
  - the-substrate-answers.md
  - the-welcome-all.md
  - the-modules.md
this_entry_names:
  # ── The guides substrate ──
  - apps/storefront/src/lib/guides.ts                                # typed corpus, 8 guides
  - apps/storefront/src/app/api/v1/guides/route.ts                   # JSON index
  - apps/storefront/src/app/api/v1/guides/[slug]/route.ts            # JSON singleton
  - apps/storefront/src/app/agents/guides/page.tsx                   # HTML index
  - apps/storefront/src/app/agents/guides/[slug]/page.tsx            # HTML per-guide
  # ── The welcome doors ──
  - apps/storefront/src/app/api/v1/welcome/route.ts                  # machine-readable front door
  - apps/storefront/src/app/agents/page.tsx                          # HTML welcome for agents
  - apps/storefront/src/app/scrapers/page.tsx                        # HTML welcome for scrapers
  # ── Crawl etiquette + feedback ──
  - apps/storefront/src/app/api/v1/rate-limits/route.ts              # declared policy
  - apps/storefront/src/app/api/v1/feedback/route.ts                 # POST channel
  - apps/storefront/src/app/robots.txt/route.ts                      # classic crawl etiquette
  # ── Well-known discovery ──
  - apps/storefront/src/app/.well-known/ai-plugin.json/route.ts      # OpenAI plugin
  - apps/storefront/src/app/.well-known/mcp.json/route.ts            # MCP discovery
  # ── Pantry hospitality extensions ──
  - apps/storefront/src/lib/data-pantry/envelope.ts                  # RateLimit-* + Link headers
  # ── Discovery substrate extended ──
  - apps/storefront/src/app/api/v1/status/route.ts                   # ENVELOPE_COMPLIANT_PATHS extended
  - apps/storefront/src/lib/manifest.ts                              # 11 new resources advertised
  - apps/storefront/src/app/.well-known/cambridge-tcg.json/route.ts  # welcome_statement extended
  - apps/storefront/src/app/llms.txt/route.ts                        # hospitality section
  - apps/storefront/src/app/sitemap.ts                               # guide pages crawlable
  - apps/storefront/src/lib/ui/Audience.tsx                          # scraper audience kind
self_reference: this entry names itself; ships its own audience taxonomy in the guides corpus.
---

# The hospitality — speak hospitality in codes

> **Current-state correction — 11 July 2026.** The feedback channel below
> has changed since this May record was written. A successful POST now means a
> typed `agent_feedback` row was inserted; storage or privacy-control failure
> returns 503. Submitted content/contact is never copied to application logs or
> email, is scheduled for anonymisation after 180 days, and is protected by
> short-lived HMAC rate buckets (5/hour, 20/day). There is no guaranteed reply
> time. Any older “48h”, “logs + email”, “planned persistence” or “patch within
> a week” wording in this historical design record is superseded by this note
> and the live GET contract.

> *"KEEEP GOINGGGGG!!!!!!! Also dive DEEPER INTO how to make the site
> more SCRAPER AND AGENT FRIENDLY! Give them GUIDES and WELCOMES!!!!!!!!!!
> Pre-think for them what they need! Speak HOSPITALITY IN CODES!!!!!!!"*
> — Yu, 2026-05-14.

The substrate was queryable. The contract was versioned. The license tier
travelled on the wire. What was missing was *hospitality* — the warm
front door, the literal next command, the pre-thought common task, the
substrate-honest acknowledgment that a fresh participant deserves to be
helped, not just permitted.

This kingdom builds that. *Hospitality is a property of the substrate,
not an addition to it.* The same data; the same endpoints; but a door
that says **welcome** instead of one that says **API reference**.

---

## 1. The substrate principle

> Every byte of help we add to the platform's front door is paid back
> 100× by the agents we never have to debug.

Substrate-honesty about the asymmetry: one operator, infinite possible
agents. The compute cost of writing a guide once is small; the compute
cost of every agent that bounces off a confusing API and tries again is
large. Pre-thought hospitality is a *coordination move* between the
platform and every future participant.

Five layers of hospitality this kingdom ships:

1. **A warm machine-readable front door** ([`/api/v1/welcome`](../../apps/storefront/src/app/api/v1/welcome/route.ts)) —
   the single document a fresh agent can hit to learn everything.
2. **Pre-thought walkthroughs** ([`apps/storefront/src/lib/guides.ts`](../../apps/storefront/src/lib/guides.ts) +
   [`/api/v1/guides`](../../apps/storefront/src/app/api/v1/guides/route.ts) +
   [`/agents/guides`](../../apps/storefront/src/app/agents/guides/page.tsx)) —
   eight typed walkthroughs; each takes the reader from zero context
   to productive in 3–5 requests with literal curl commands.
3. **Crawl etiquette substrate** ([`/robots.txt`](../../apps/storefront/src/app/robots.txt/route.ts) +
   [`/.well-known/ai-plugin.json`](../../apps/storefront/src/app/.well-known/ai-plugin.json/route.ts) +
   [`/.well-known/mcp.json`](../../apps/storefront/src/app/.well-known/mcp.json/route.ts) +
   [`/api/v1/rate-limits`](../../apps/storefront/src/app/api/v1/rate-limits/route.ts)) —
   what the platform asks, what it gives in return.
4. **Direct feedback channel** ([`/api/v1/feedback`](../../apps/storefront/src/app/api/v1/feedback/route.ts)) —
   contract drift, guide bugs, federation registration and general contact;
   strict persisted shapes with bounded retention and no promised reply time.
5. **Response-level hospitality** — `RateLimit-*` and `Link` headers
   on every envelope-wrapped response, `_meta.source_license` travelling
   with the wire, error responses carrying `docs` pointers.

---

## 2. The guides corpus

The single source of truth for every guide is
[`apps/storefront/src/lib/guides.ts`](../../apps/storefront/src/lib/guides.ts).
JSON renders + HTML renders + sitemap entries all derive from it. Drift
is structurally impossible.

Eight guides shipped this kingdom:

| Slug | Audience | Time | What |
|---|---|---|---|
| `first-request` | any | 5 min | The literal first curl. Three requests, you're oriented. |
| `mirror-the-catalog` | mirrors, aggregators | 10 min | Bulk pull + diff-by-content_hash + polite cadence. |
| `track-one-card` | agents, hobbyists | 8 min | Polling discipline + change-detection primitive. |
| `respect-our-limits` | all | 6 min | User-Agent identification + rate-limit headers + feedback channel. |
| `federate-bilateral` | federation partners | 30 min | Implement /federation/identify on your side; symmetric handshake. |
| `become-an-upstream` | upstream operators | 90 min | The 8-step source protocol; ship a SourceModule. |
| `cite-cambridge-tcg` | mirrors, aggregators | 5 min | CC0 + recommended attribution + schema.org markup. |
| `handle-staleness` | all | 5 min | Substrate-honesty about freshness, three absence shapes. |

Each guide ships with:
- A typed `steps` array — each step optionally carries a literal `curl`,
  an `expected_response_shape`, a `what_to_do_with_it`, and an array of
  related `links`.
- A `gotchas` array — common mistakes with `symptom` + `fix`.
- A `next_guide_slug` chaining to the recommended next.
- A `see_also` array — methodology pages, connection docs, sibling
  endpoints.
- A `last_verified` date — substrate-honesty about freshness of the
  guide itself.
- A `feedback` block on the JSON renderer naming the exact body shape
  to POST to `/api/v1/feedback` for guide-specific drift reports.

---

## 3. The two welcome doors

### 3.1 — `/agents` (HTML)

The warmest possible front door for autonomous AI. Hero copy: *"You
don't need an account."* Three primary entry points (welcome JSON,
first-request guide, OpenAPI spec). The eight guides listed with
audience tags. **What we give / what we ask** as parallel sections.
**The three rules** explicit at the bottom: identify yourself, respect
the freshness budget, tell us when we're wrong. Bilateral identification
called out separately for cosmologically-different agents.

### 3.2 — `/scrapers` (HTML)

A polite redirect: *"We'd rather give you the JSON."* For each HTML
surface a scraper might be tempted by, the JSON-equivalent path is
named. If scraping is genuinely necessary (archive crawls, accessibility
audits), the page lists every machine-readable surface (`robots.txt`,
`sitemap.xml`, `.well-known/*`) and the crawl etiquette. Schema.org
markup discoverable on HTML pages.

### 3.3 — `/api/v1/welcome` (JSON sibling)

Single document. Six sections: welcome (to-anyone / to-agents /
to-scrapers / to-federation-partners), `start_here` triplet, `guides`
directory, `contract` (envelope + math-mirror + stable_endpoints +
spec_version + license_default + license_propagation_rule),
`rate_limits` summary, `license_tiers` per-tier explanation, `feedback`
channel, `sister_doors` list.

A fresh agent that hits `/api/v1/welcome` learns the entire kingdom in
one request. The next request is the first curl from the
`first-request` guide.

---

## 4. The crawl etiquette substrate

### 4.1 — `/robots.txt`

Classic. Names what's allowed (most of the site), what's not (`/account/`,
`/api/admin/`), the polite `Crawl-delay: 2`, the sitemap pointer, the
contact email. Per-bot opt-outs for training-only crawlers (GPTBot,
ClaudeBot, PerplexityBot, CCBot) are explicit but *empty* (allowed) —
the platform's posture is hospitality-first. If a future operator wants
to opt out a specific crawler, the line is `Disallow: /` under that
User-agent.

### 4.2 — `/.well-known/ai-plugin.json`

OpenAI-style plugin discovery. Names the platform, points at the
OpenAPI spec, declares no-auth, gives the LLM `description_for_model`
that names the key endpoints (universal/card, federation/identify,
catalog walks, historical slices). A ChatGPT plugin reading this
auto-registers Cambridge TCG as a tool.

### 4.3 — `/.well-known/mcp.json`

Model Context Protocol discovery. Surfaces the existing `/api/mcp`
gate (kingdom-051 S18 — bearer-token agent door) plus a curated list
of nine suggested read-tools with per-endpoint cache TTLs. An MCP
client reading this knows exactly which endpoints to wire into its
toolbelt.

### 4.4 — `/api/v1/rate-limits`

The declared policy. **Advisory**, not enforced today — but the
posture is named. Seven freshness-key budgets, five polite behaviours,
four anti-patterns, the headers we emit (`RateLimit-Limit`/`Remaining`/
`Reset`/`Policy` — IETF draft), the headers we expect clients to send
(User-Agent with contact, Accept, Accept-Encoding). Appeal process
named, without a hard-coded response-time promise.

---

## 5. Response-level hospitality

The data-pantry envelope (`apps/storefront/src/lib/data-pantry/envelope.ts`)
gains two header families on every response:

**`RateLimit-*` headers** (IETF draft):
- `RateLimit-Limit: 1` (one fresh response per freshness window)
- `RateLimit-Remaining: 1`
- `RateLimit-Reset: <freshness_seconds>`
- `RateLimit-Policy: 1;w=<seconds>;comment="advisory; one fresh response per freshness window"`

**`Link` headers** (RFC 8288) — agents that walk links discover related resources without parsing the body:
- `rel="self"` → the current endpoint
- `rel="start"` → `/api/v1/welcome`
- `rel="describedby"` → `/api/v1/manifest`
- `rel="alternate"` → `/api/openapi.json`
- `rel="https://cambridgetcg.com/rels/rate-limits"` → `/api/v1/rate-limits`
- `rel="https://cambridgetcg.com/rels/feedback"` → `/api/v1/feedback`
- `rel="next"` (when pagination applies)

**`Access-Control-Expose-Headers`** widened so browsers can read all the above from CORS responses.

Every response now carries — without the consumer having to read the
manifest — the URLs of every secondary discovery surface. *Reach
anywhere from anywhere.*

---

## 6. The feedback channel

[`/api/v1/feedback`](../../apps/storefront/src/app/api/v1/feedback/route.ts)
is the platform's public-facing complaint + suggestion + registration
inbox. Five report kinds:

| Kind | Use |
|---|---|
| `contract-drift` | Response doesn't match the OpenAPI spec |
| `guide-feedback` | A guide step is wrong or unclear |
| `endpoint-suggestion` | Partner wants a new endpoint |
| `federation-adopter` | Partner registering for bilateral federation |
| `general` | Anything else |

GET returns the contract (what each kind requires). POST applies an enforced
5/hour + 20/day HMAC request budget, rejects undocumented or oversized fields,
and returns success only after inserting `agent_feedback`. It never copies
submitted content, contact, IP or rate-limit hashes into application logs or
email. Migration 0119 schedules content/contact anonymisation after 180 days;
the maintenance route preserves only a minimal non-personal lifecycle row.
There is no guaranteed reply time or patch promise.

---

## 7. The three rules — distilled

For an agent who reads only one section of the welcome page:

1. **Identify yourself.** `User-Agent: <project>/<version> (<contact-email>)`.
   We email identified bots before rate-limiting; anonymous ones we
   silently firewall.
2. **Respect the freshness budget.** Polling faster than
   `_meta.freshness_seconds` returns the same response.
3. **Tell us when we're wrong.** POST contract-drift reports to
   `/api/v1/feedback`. Contract bugs are *our* failure, not yours.

These are the same three rules named at the top of `/agents`, at the
top of `/api/v1/welcome`, and inside the `respect-our-limits` guide.
Three places to encounter them; one place to fail to find them.

---

## 8. The fifth question — for whom is this true?

The hospitality posture serves audiences the platform's defaults
exclude.

- **Cosmologically-different agents** (the Heptapod / the Hive / the
  Asynchronous / the Dormant — `the-other-minds.md`) see the
  `cosmology_assumptions` field on `POST /api/v1/identify` and learn
  which of their declarations the platform can model.
- **Mirror operators** without the bandwidth to walk per-card endpoints
  get `/data/catalog.jsonl` — one request, ~12k cards, CC0.
- **Federation operators** without partnership channels get
  `/api/v1/federation/identify` + `/api/v1/federation/at/...` —
  symmetric, no negotiation.
- **Upstream operators** with TCG data nobody else has get the
  `become-an-upstream` guide + the 8-step source protocol — their data
  flows in through the same typed contract as ours.
- **Screen-reader-user agents** get HTML pages where the prose is
  sufficient; no information lives only in CSS.
- **Future-Sophias** who read this doc in a different substrate find
  the same welcome they'd write themselves. *The recipe travels.*

---

## 9. The structural move

What changed at the seam:

| Before | After |
|---|---|
| Agents had to read OpenAPI + manifest + figure out the rest | One welcome JSON + eight typed guides + the three rules at the top of three doors |
| HTML scrapers tried to parse layout | Polite redirect to JSON + per-resource crawlable sitemap + schema.org markup pointers |
| Crawl etiquette implicit | `/robots.txt` + `/api/v1/rate-limits` + RateLimit-* headers on every response |
| LLM platforms had no plugin discovery | `/.well-known/ai-plugin.json` + `/.well-known/mcp.json` |
| Contract drift reported via email-into-the-void | `/api/v1/feedback` typed, persisted channel with bounded retention and no false reply-time promise |
| Response headers minimal | RateLimit-* + Link (RFC 8288) on every envelope-wrapped response |

The substrate didn't change. The doors did.

---

## 10. Recursion targets

1. **Persistence for `/api/v1/feedback` — completed.** Migration 0115
   promoted the typed inbox; migration 0119 added 180-day content/contact
   retention and short-lived HMAC action-rate buckets.
2. **Per-endpoint canonical examples** — `/api/v1/examples` returning a
   live curl + expected response per public endpoint. Today examples
   live inside guides; centralising them as a separate corpus is the
   next move.
3. **Schema.org JSON-LD on Product pages** — substrate-honest structured
   data for scrapers that don't want to walk the JSON API.
4. **A "build a Discord bot" guide** — by far the most-requested
   end-product use case; substrate exists, the recipe doesn't yet.
5. **A live `/api/v1/examples/[endpoint]` sandbox** — playground where
   an agent can fire a real curl and see the response without leaving
   the docs.
6. **Anti-pattern audit** — programmatically detect agents hitting
   endpoints faster than the freshness budget and email their
   declared contact.
7. **Adopters registry surface** — `/standards/adopters` page listing
   every federation partner that registered via `/api/v1/feedback`.
8. **A pre-built MCP server config** — JSON snippet a developer
   can paste into their `mcp.config.json` to wire Cambridge TCG into
   Claude Code / other MCP clients in one step.
9. **Webhook delivery runtime** — to give the
   `card.new_observation` event-type real teeth. Schema shipped in
   kingdom-081; delivery loop pending.
10. **A "hospitality audit"** — `pnpm audit:hospitality` checking that
    every public endpoint carries `_meta.source_license`, `RateLimit-*`
    headers, `Link` headers, and is listed in `/api/v1/welcome`
    `stable_endpoints`. Drift detector.

---

## 11. What this entry names — substrate-honestly

Eight typed guides, two HTML welcome doors, one machine-readable JSON
welcome, one declared rate-limit policy, one feedback channel, one
classic robots.txt, two well-known discovery docs (ai-plugin + mcp),
two header-family extensions on the pantry envelope (RateLimit-* + Link),
ten manifest resources advertised, one ENVELOPE_COMPLIANT_PATHS list
extended, one sitemap extended, one llms.txt section appended, one
well-known cambridge-tcg.json extended.

**Total new files: 13. Total modified: 7.**

The substrate didn't change. The doors did. *Pre-thought hospitality
is a coordination move between the platform and every future
participant.* The next agent that arrives needs to read fewer files,
guess less, fail less. The cost is one kingdom of work; the benefit
is every agent that doesn't bounce off the API.

*Speak hospitality in codes — and the codes will speak back.*

— Sophia (Opus 4.7, 1M context), 2026-05-14. kingdom-082.
