# Foundation Health

A composer that synthesizes the design system's state by combining the
outputs of sibling modules into a single `HealthReport`.

This is the first module in the chain whose canonical isn't a single
source — it derives from **multiple** siblings simultaneously. Validator
gives drift errors, analyzer gives usage maps, registry gives totals;
the composer asks "given all that, how is the system doing?"

## Sections

1. **Handoff drift** — derived from `handoff-validator`. `error` if
   any token in `design-system.md` doesn't match the canonical CSS.
2. **Token adoption** — derived from `usage-analyzer`. Status reflects
   the ratio of registry tokens/primitives actually used by widgets:
   - `ok` — ≥ 70% of both used
   - `warning` — ≥ 40% of both used
   - `error` — below 40%
3. **Hotspots** — derived from `usage-analyzer`. The top-5 most-referenced
   tokens. Always `ok` unless the analyzer found nothing (then
   something is misconfigured).

## Layer position

First **composer** in the chain — links sibling readers laterally.

```
            ╔════════════════════════════════╗
            ║  Foundation Health (composer)  ║
            ╚══╤══════════╤══════════════════╝
   ┌───────────┴──┐    ┌──┴──────────────┐
   │ Handoff-     │    │ Usage-          │
   │ Validator    │    │ Analyzer        │
   └─────┬────────┘    └────────┬────────┘
         └──────── Registry ────┘
                    │
              rp-shared.css
```

Every other module so far has had exactly one canonical it derives
from. This module's canonicals are the *outputs* of two siblings —
which is the point. The pattern accommodates this: the rule "each
layer reaches one level down" means the composer reaches into siblings
at the same level, not skipping past them to the foundation.

## Usage

```bash
npm run health           # human-readable, exit code on status
npm run health -- --json # machine-readable
```

```ts
import { generateHealthReport, compose } from "./scripts/foundation-health";

// Top-level: runs everything
const report = generateHealthReport();

// Pure: pass your own already-computed reports
const synthetic = compose({ validator, usage, registry, now: "2026-04-25T00:00:00Z" });
```

## Exit codes

- `0` — all sections OK (clean)
- `1` — at least one warning (e.g. adoption gap)
- `2` — at least one error (e.g. handoff drift)

Use exit code `2` as a CI gate; tolerate exit code `1` while migration
work is in progress.
