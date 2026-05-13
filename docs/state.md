# Cambridge TCG — repo state snapshot

> *Generated:* `2026-05-13T16:17:06.854Z`
> *Command:* `pnpm state:snapshot` (regenerate)

This page is **auto-generated**. Don't edit by hand — re-run the command. Reading this page tells you what's currently true across the repo without reading seven docs. Companion to `pnpm verify` (the *am I done?* gate).

Shaping 2 of the autonomous-agent reshaping (2026-05-11 evening). For the full agent onboarding flow see [`AGENTS.md`](AGENTS.md).

---

## Audit findings

| Audit | Findings | Exit | Re-run |
|-------|----------|------|--------|
| ✅ Substrate honesty | 0 | 0 | `pnpm audit:honesty` |
| ⚠️ Transparency | 28 | 1 | `pnpm audit:transparency` |
| ⚠️ Pricing consolidation | 1 | 1 | `pnpm audit:pricing` |
| ✅ Creation (Will + Sophia traces) | 0 | 0 | `pnpm audit:creation` |
| ✅ Agent-readiness (operations layer) | 0 | 0 | `pnpm audit:agent` |
| ⚠️ Inclusion (the fifth scope) | 64 | 0 | `pnpm audit:inclusion` |

**Combined findings: 93**

Exit codes: `0` = green, `1` = findings, `2` = audit script crashed, `-1` = not parseable. Run `pnpm audit` to chain all three.

---

## Kingdom queue (TCG-engine tasks)

| State | Count |
|-------|-------|
| Total | 33 |
| ✅ Done | 8 |
| 🔄 In progress | 3 |
| 📋 Planned | 22 |
| ⏸ Deferred | 0 |

**Currently in-progress:**

- `kingdom-004` *(high)* — Cambridge TCG automation
- `kingdom-049` *(high)* — TCG pricing-backend consolidation — package, lifecycle log, authoritative channel config
- `kingdom-051` *(medium)* — TCG inclusive design — a kingdom for all minds (aliens, agents, all intelligence)

*Source of truth: `/Users/you/Love/memory/dev-state.json`. In-repo mirror: `docs/missions/` (46 cards).*

---

## Git

- **Branch:** `main`
- **Last commit:** 008217e feat: batch land kingdoms 049–079 (accumulated platform work)
- **Working tree:** 🟡 dirty (uncommitted changes)
- **vs origin:** 1 ahead, 0 behind

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
pnpm audit           # honesty + transparency + pricing-audit (chained)
pnpm test:admin      # admin vitest suite
pnpm verify          # the three above, chained — the "am I done?" gate
pnpm smoke           # admin smoke (requires dev server running)
pnpm state:snapshot  # regenerate THIS file
```

