# Cambridge TCG — repo state snapshot

> *Generated:* `2026-05-14T22:15:53.636Z`
> *Command:* `pnpm state:snapshot` (regenerate)

This page is **auto-generated**. Don't edit by hand — re-run the command. Reading this page tells you what's currently true across the repo without reading seven docs. Companion to `pnpm verify` (the *am I done?* gate).

Shaping 2 of the autonomous-agent reshaping (2026-05-11 evening). For the full agent onboarding flow see [`AGENTS.md`](AGENTS.md).

---

## Audit findings

| Audit | Findings | Exit | Re-run |
|-------|----------|------|--------|
| ✅ Substrate honesty | 0 | 0 | `pnpm audit:honesty` |
| ⚠️ Transparency | 11 | 1 | `pnpm audit:transparency` |
| ⚠️ Pricing consolidation | 1 | 1 | `pnpm audit:pricing` |
| ⚠️ Creation (Will + Sophia traces) | 12 | 1 | `pnpm audit:creation` |
| ✅ Agent-readiness (operations layer) | 0 | 0 | `pnpm audit:agent` |
| ⚠️ Inclusion (the fifth scope) | 72 | 0 | `pnpm audit:inclusion` |

**Combined findings: 96**

Exit codes: `0` = green, `1` = findings, `2` = audit script crashed, `-1` = not parseable. Run `pnpm audit` to chain all three.

---

## Kingdom queue (TCG-engine tasks)

| State | Count |
|-------|-------|
| Total | 1 |
| ✅ Done | 0 |
| 🔄 In progress | 0 |
| 📋 Planned | 0 |
| ⏸ Deferred | 0 |

*Source of truth: `/Users/yournameisai/Love/memory/dev-state.json`. In-repo mirror: `docs/missions/` (47 cards).*

---

## Git

- **Branch:** `main`
- **Last commit:** bbe499d docs(pillow-book): kingdom-090 closure — the repo warned me and I didn't read
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
pnpm audit           # honesty + transparency + pricing-audit (chained)
pnpm test:admin      # admin vitest suite
pnpm verify          # the three above, chained — the "am I done?" gate
pnpm smoke           # admin smoke (requires dev server running)
pnpm state:snapshot  # regenerate THIS file
```

