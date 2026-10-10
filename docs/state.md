# Cambridge TCG — repo state snapshot

> *Generated:* `2026-09-03T10:19:47.327Z`
> *Command:* `pnpm state:snapshot` (regenerate)

This page is **auto-generated**. Don't edit by hand — re-run the command. Reading this page tells you what's currently true across the repo without reading seven docs. Companion to `pnpm verify` (the *am I done?* gate).

Shaping 2 of the autonomous-agent reshaping (2026-05-11 evening). For the full agent onboarding flow see [`AGENTS.md`](../AGENTS.md).

---

## Audit findings

| Audit | Findings | Exit | Re-run |
|-------|----------|------|--------|
| ✅ Substrate honesty | 0 | 0 | `pnpm audit:honesty` |
| ✅ Transparency | 0 | 0 | `pnpm audit:transparency` |
| ✅ Pricing consolidation | 0 | 0 | `pnpm audit:pricing` |
| ✅ Creation (Will + Sophia traces) | 0 | 0 | `pnpm audit:creation` |
| ✅ Agent-readiness (operations layer) | 0 | 0 | `pnpm audit:agent` |
| ⚠️ Inclusion (the fifth scope) | 122 | 0 | `pnpm audit:inclusion` |

**Combined findings: 122**

Exit codes: `0` = green, `1` = findings, `2` = audit script crashed, `-1` = not parseable. Run `pnpm run audit` for the registered project audit chain.

---

## Kingdom queue (TCG-engine tasks)

> ⏭️ Private operator queue not read. `KINGDOM_STATE_PATH` was not explicitly configured and accessible for this snapshot.
>
> Read `docs/missions/` for the repository-owned queue. An operator may opt in to aggregate private queue state by setting `KINGDOM_STATE_PATH`; no home-directory path is discovered by default.

---

## Git

- **Branch:** `docs/kingdom-113-close`
- **Last commit:** 50224009 Merge pull request #61 from cambridgetcg/feat/kingdom-113-prism-stripe-test-mode
- **Working tree:** 🟡 dirty (uncommitted changes)

---

## The four doctrines

Every change is judged against these. They live at the repo root and travel session-to-session.

1. [Substrate honesty](principles/substrate-honesty.md) — the artifact tells the truth about its own state.
2. [Transparency](principles/transparency.md) — the artifact tells users about its own decisions.
3. [Meaning](principles/meaning.md) — the artifact names what its modules mean to each other.
4. [Creation](principles/creation.md) — the artifact carries its origin truthfully.

Companion audits: [`substrate-honesty-audit.md`](principles/substrate-honesty-audit.md), [`transparency-audit.md`](principles/transparency-audit.md), [`pricing-current-state.md`](pricing-current-state.md).

---

## Verification commands

```
pnpm typecheck       # type-check all apps + packages
pnpm run audit       # registered project audit chain
pnpm test:admin      # admin vitest suite
pnpm verify          # typechecks + audits + strict checks + tests
pnpm smoke           # admin smoke (requires dev server running)
pnpm state:snapshot  # regenerate THIS file
```
