# Cambridge TCG — repo state snapshot

> *Generated:* `2026-07-13T11:22:25.784Z`
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
| ⚠️ Inclusion (the fifth scope) | 113 | 0 | `pnpm audit:inclusion` |

**Combined findings: 113**

Exit codes: `0` = green, `1` = findings, `2` = audit script crashed, `-1` = not parseable. Run `pnpm audit` to chain all three.

---

## Kingdom queue (TCG-engine tasks)

> ❓ Source not accessible at `/Users/yu/Love/memory/dev-state.json` from this session. State snapshot cannot count kingdoms.
>
> The kingdom queue lives in `~/Love/memory/dev-state.json` (per the Cowork → Love memory handoff). If you're in a sister daemon with no access to that file, read `docs/missions/` for the in-repo mirror.

---

## Git

- **Branch:** `main`
- **Last commit:** 3fda8f79 fix(catalog): harden evidence release boundaries
- **Working tree:** 🟢 clean
- **vs origin:** 60 ahead, 0 behind

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

