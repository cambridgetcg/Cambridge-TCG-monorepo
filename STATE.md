# STATE.md — Cambridge TCG monorepo

> *This file exists so the Hunter System can score this repo. It is a thin
> honesty pointer — it tells the truth about where the real state lives and
> what is currently true, in the format the hunter heartbeat reads. It does
> NOT duplicate the canonical snapshot. For the full, always-current state,
> run `pnpm state:snapshot` and read [`docs/state.md`](docs/state.md).*

**Last heartbeat sync:** 2026-07-05T17:35Z (Hunter System heartbeat)
**Maintained by:** Hunter System cron — regenerated on each heartbeat run.
Do not hand-edit the snapshot data below; edit `docs/state.md` via the
`pnpm state:snapshot` command instead.

---

## What this is

- **Repo:** `Cambridge-TCG-monorepo` (a.k.a. `ctcg-market-build`)
- **Package:** `cambridge-tcg` v0.1.0 (private monorepo, pnpm workspaces)
- **Nen type:** Enhancement — systems that make things stronger: honesty
  audits, trust scoring, validation gates, the `pnpm verify` chain.
- **Hunter rank:** S (score 9.0 / 10) — top hunter in the kingdom.
- **Doctrines:** substrate honesty, transparency, meaning, creation.
  See [`docs/principles/`](docs/principles/).

## Current shape (snapshot of the snapshot)

- **Apps:** `admin`, `rewardspro`, `storefront`, `wholesale`
- **Packages:** `aws`, `data-ingest`, `data-spec`, `db`, `email`,
  `lifecycle`, `mcp-server`, `play`, `pricing`, `sku`, `stock`
- **Source files (TS/TSX, excl. node_modules):** ~2,361
- **Last commit (heartbeat time):** `376d867d docs(pillow-book):
  2026-07-05 — the day the market learned to finish what it starts` (2h ago)
- **Active branch:** `market/p2p-facilitation` — peer-to-peer card trading
  is the live front; recent commits wired negotiation, swaps, auto-complete,
  and cron.
- **Remotes:** `github` (cambridgetcg/Cambridge-TCG-monorepo, primary deploys),
  `origin` (codeberg mirror).

## Verification (the "am I done?" gate)

```
pnpm verify      # typecheck + honesty/transparency/pricing/creation audits + storefront tests
pnpm audit       # 28 named audit chains (honesty → cross-source-divergence → sitemap-discovery)
pnpm state:snapshot   # regenerate docs/state.md
```

All audit findings are tracked in `docs/state.md`. As of the last snapshot
(2026-06-10T10:30Z): honesty/transparency/pricing/creation green;
agent-readiness ⚠️ 1 finding; inclusion ⚠️ 101 findings (the open fifth-question
work). Re-run `pnpm state:snapshot` for the live numbers — they drift.

## How to read this repo

1. [`CLAUDE.md`](CLAUDE.md) — human-facing welcome, doctrines and culture.
2. [`AGENTS.md`](AGENTS.md) — autonomous-agent operations manual.
3. [`docs/state.md`](docs/state.md) — the canonical one-page repo state.
4. [`docs/missions/`](docs/missions/) — 50 kingdom cards (the work queue).
5. [`docs/heartbeat.md`](docs/heartbeat.md) — the pulse cadence.
6. This `STATE.md` — the hunter-readable pointer above.

## Honesty note

This file is deliberately a pointer, not a second source of truth. If the
numbers here ever disagree with `docs/state.md`, `docs/state.md` wins — it is
generated from the actual repo by `pnpm state:snapshot`. This file only
mirrors the shape the Hunter System scores (Nen, rank, heartbeat timestamp)
and the entry points a fresh hunter needs.