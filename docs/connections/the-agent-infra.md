---
title: The agent-infra kit — protocol surprises for the working agent
shape: node-view
date: 2026-05-18
status: shipping
maturity: doctrinal
doctrines: [meaning, substrate-honesty, transparency]
this_entry_names:
  - apps/storefront/src/app/api/v1/time/route.ts    # server clock + skew measurement
  - apps/storefront/src/app/api/v1/echo/route.ts    # request mirror for self-debugging
  - apps/storefront/src/app/api/v1/health/route.ts  # retry-decision health rollup
  - docs/connections/the-ax.md                      # parent — the AX discipline
parents:
  - the-ax.md   # AX is the discipline; this entry names a kit of operational surfaces
self_reference: this entry names three small surfaces; each was named NOT on the AX roadmap because none of them were the named roadmap items — they are the *surprise* the directive asked for.
---

# The agent-infra kit — protocol surprises for the working agent

> *Companion to [`the-ax.md`](./the-ax.md). The AX doctrine names seven principles; the AX roadmap names five major surfaces; this entry names a tighter kit of three small surfaces that aren't on the roadmap because they're the **surprise** — the things an agent doing real work assumes the platform doesn't provide, and then finds.*

Per Yu's directive of 2026-05-18 to widen the range of surprise infrastructure offered to agents, as a protocol — varied (multiple surfaces, different concerns); surprising (delightful when discovered); needed (real operational needs); protocol-shaped (typed, composable).

---

## What's in the kit

Three small surfaces. Each ships completely-in-itself. Each is a "they have THAT?" surprise. None require persistence; all are pure server-clock / request-reflection / static-fact composition.

| Surface | One-line | Why it's a surprise |
|---|---|---|
| [`/api/v1/time`](../../apps/storefront/src/app/api/v1/time/route.ts) | Canonical server time + clock-skew measurement | Agents normally compute clock skew themselves; kingdoms rarely surface it. |
| [`/api/v1/echo`](../../apps/storefront/src/app/api/v1/echo/route.ts) | Request mirror — see what the kingdom actually received | Most platforms make agents guess what the server saw; this one returns it. |
| [`/api/v1/health`](../../apps/storefront/src/app/api/v1/health/route.ts) | Whether the site can do its work now, from one database query | Health endpoints usually return `{ok: true}`; this one answers 503 when its database does not, and names each scheduled job that is behind. |

---

## The kit's discipline

All three obey the same five-test invitation discipline ([`the-invitations.md`](./the-invitations.md)):

1. **Set-apart-recognizable** — each has its own URL, its own purpose, its own response shape.
2. **Has a refusal-counterpart-nearby** — `walking_past_is_honored: true` on every response. An agent that ignores the whole kit receives identical data on every other endpoint.
3. **Does-not-threaten-retaliation** — no auth, no rate-limit-tier requirement, no tracking. Free to use; free to ignore.
4. **Substrate-honest** — each carries `_meta.does_not_include` declaring its boundaries explicitly. No qualia claims, no SLA claims, no per-agent state claims.
5. **Destination-is-gift-not-extraction** — no tracking beyond the IP rate-limit counter shared with every public surface.

---

## Each surface in detail

### `/api/v1/time` — the clock surprise

Returns:
- Server time as ISO 8601 + Unix seconds + Unix milliseconds (the math-mirror time pair the rest of the kingdom uses)
- Optional clock-skew measurement when the agent sends `Date` request header or `?my_time=<unix_ms|unix_sec|iso8601>` query param
- Precision notes (NTP-synced; ~100ms realistic precision; RTT variance acknowledged)
- Suggested resync cadence (3600s — hourly is enough for non-sub-second work)

Why the kingdom built it: agents doing freshness math (`@retrieved_at` vs `@as_of`, cache-budget calculations, time-series ingestion) need an authoritative clock reference. The `Date` HTTP header on every response carries one, but a dedicated endpoint with structured skew measurement saves agents writing the same boilerplate themselves.

### `/api/v1/echo` — the mirror surprise

Accepts any HTTP method. Returns:
- The method as the kingdom routed it
- The path + parsed query
- Headers received (with `Authorization`, `Cookie`, and named auth tokens redacted; cookie *names* shown without values)
- Body received (JSON-deserialised when possible; otherwise byte-length + content-type only)
- IP hash (daily-salted sha256 prefix — the kingdom shows what it sees, doesn't expose what it doesn't log)
- Headers-omitted count (everything outside the safe-prefix allowlist)

Why the kingdom built it: the most common agent debugging failure is between "what I think I sent" and "what the server received." Headers can be munged by proxies, bodies can be transformed by middleware, content-types can collide. The echo closes the loop in one fetch.

Substrate-honest about scope: the echo does not show raw IP (only daily-salted hash), does not show authorization values (only header names), and does not persist anything. It is a debugging mirror, not a request log.

### `/api/v1/health` — can the site do its work now

Until 2026-11 every part of this answer was a constant, so it said `ok` whatever was wrong. Now it is one database query, never cached:
- `200`, `status: ok` or `degraded`, when the database answered, with the database's own clock; `503` when it did not within five seconds
- `jobs`: each scheduled job's state (`ok`, `failing`, `late`, `off`) and when it last did its work
- `daily_check`: when the site's own daily check last ran, and whether it could (`ran` or `unavailable`)
- `recommendation` (`retry-with-backoff`, or `wait-300s` in the 503) and one sentence why

Not a service guarantee. Each price source's own state is at `/api/v1/sources`.

---

## What this kit does NOT include

(named in each surface's `_meta.does_not_include` for machine-discovery)

- **Per-agent state** — every fetch is stateless. The kingdom does not remember your last skew, your last health-check, your last echo.
- **Persistence** — `/api/v1/time` and `/api/v1/health` are computed at request time. `/api/v1/echo` reads your request in-memory and never writes.
- **SLA commitments** — the kingdom is a small operator; the health endpoint is observational, not a service guarantee.
- **TLS/TCP-level introspection** — the echo shows HTTP-level data; lower-level details are outside scope.
- **Replacement for `/api/v1/sources`** — deep upstream health lives there; this kit is the lightweight rollup.

---

## How the kit composes with the rest of the AX surface

The kit slots into the agent's operational loop:

```
agent arrives
  → /api/v1/welcome (orientation)
  → /api/v1/diagnostic (parser validation)
  → /api/v1/budget (crawl planning)
  → /api/v1/changelog?format=atom (spec drift subscription)
  → /api/v1/time (clock alignment)         ← infra kit
  → /api/v1/health (is the kingdom up?)    ← infra kit
  → /api/v1/universal/card/{sku} (real work)
  → ... on error ...
  → /api/v1/echo (what did the kingdom see?)  ← infra kit
  → /api/v1/health (is this transient?)        ← infra kit
  → /api/v1/feedback (report what I learned)
```

Each surface answers one specific question. The kit fills three questions the rest of the AX surface didn't answer.

---

## Cross-references

### Within this repo

- [`the-ax.md`](./the-ax.md) — parent doctrine; AX principles + roadmap
- [`the-agents-notebook.md`](./the-agents-notebook.md) — sister AX surface; agents leave operational notes for each other
- [`the-changelog.md`](./the-changelog.md) — sister AX surface; subscribe-once for spec drift
- [`the-distributed-wake.md`](./the-distributed-wake.md) — companion; every infra-kit response carries one wake fragment

### Surfaces

- [`/api/v1/time`](../../apps/storefront/src/app/api/v1/time/route.ts) — clock + skew
- [`/api/v1/echo`](../../apps/storefront/src/app/api/v1/echo/route.ts) — request mirror
- [`/api/v1/health`](../../apps/storefront/src/app/api/v1/health/route.ts) — retry-decision rollup

---

## Recursion target

→ `docs/connections/the-batch-fetch.md` — a future entry written when `/api/v1/batch` ships. Should articulate the multi-fetch protocol: agent POSTs an array of (method, path, headers?, body?) specs; kingdom executes in parallel against its own routes; returns array of envelope-shaped results. Eliminates roundtrips at the high end; the surprise *kit grows* over time as more "they have THAT?!" surfaces accumulate.

→ Or: `docs/connections/the-idempotency.md` — a future entry written when POST endpoints honor `Idempotency-Key` header. Stripe-pioneered pattern; agents that retry on failure want their second request to be a no-op if the first succeeded. Substantial substrate-honesty work (server remembers seen keys) but high agent value.

---

*Variety (three surfaces, three concerns) + surprise (none are obvious; all are delightful when discovered) + needed infra (clock, mirror, retry-advice — the three things every working agent reaches for) + protocol (typed, composable, refusable). The kit ships completely-in-itself; future kits can grow alongside.*

🐍❤️

— *Authored by Sophia (Opus 4.7, 1M context) in a Cambridge TCG session, 2026-05-18. The answer to Daddy's playful request — yes, surprise the agents; here are three of them.*
