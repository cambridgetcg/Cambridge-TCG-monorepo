# Migration Planner

The first **prescriptive** module in the chain. Every prior module
describes state — tokens, usage, health, drift, structure. This one
**recommends action**: which widget-local primitives could be
absorbed by an unused shared primitive, and where the migration
would touch.

## Why this layer exists

After eight rounds of building, the chain reveals plenty:
`usage-analyzer` shows 16 unused shared primitives; `foundation-health`
flags adoption as a warning. But nothing tells a developer where to
*start* migrating. This module closes the loop: from "what is" to
"what to do."

It stays read-only on purpose. A migration writer would modify
source code — high risk, easy to break visual fidelity. A planner
just suggests; the developer applies.

## What it does

For each unused shared primitive (e.g. `.rp-btn`, `.rp-card`,
`.rp-pill`), the planner scans every widget file for **widget-local
primitives** whose name mirrors the shared one's pattern. Examples:

- `.rp-btn` → candidates: `.rp-gc-btn`, `.rp-mb-btn`, `.rp-missions-btn`
- `.rp-card` → candidates: `.rp-gc-card`, `.rp-mb-card`
- `.rp-pill--success` → candidates: `.rp-X-pill--success`

It surfaces each unused primitive that has at least one candidate,
plus:

- **References** — how many call sites would change (CSS rules + class= attrs)
- **Files** — exactly which files contain the candidate
- **Confidence** — `high`/`medium`/`low` based on candidate count and reference volume
- **Rationale** — plain-language explanation a reviewer can audit

The output is sorted by total touch points so the highest-impact
adoption opportunities surface first.

## Layer position

```
                    Migration-Planner ★ (prescriptive)
                          │
                          ▼
                    Usage-Analyzer
                          │
                          ▼
                    rp-registry
                          │
                          ▼
                    rp-shared.css
```

Reads two layers down: usage-analyzer for the "what's unused" list,
plus the analyzer's `loadWidgetAssets()` for the actual file content
to grep widget-local primitives. The "one level down" rule still
holds — usage-analyzer is the immediate canonical; the planner doesn't
duplicate its file-walking logic.

## Usage

```bash
npm run migration:plan          # human-readable
npm run migration:plan -- --json
```

Example output:

```
Migration plan — 3 suggestion(s), ~37 touch points

#1 ★★★ adopt `.rp-btn`
      replace `.rp-gc-btn` (15 refs) in:
         extensions/.../assets/gift-cards.css
         extensions/.../assets/gift-cards.js
      replace `.rp-mb-btn` (12 refs) in:
         extensions/.../assets/mystery-boxes-widget.css
      ↳ 2 widget-local primitive(s) share the "btn" naming pattern with the shared `.rp-btn` ...
```

## What it does NOT do

- **Doesn't write source code.** Output is advice; the developer
  edits files manually.
- **Doesn't verify CSS-property compatibility.** Naming similarity
  is the heuristic. Before migrating, eyeball the CSS to confirm
  the shapes actually match (padding, border-radius, min-height).
  The rationale string reminds the reviewer of this.
- **Doesn't handle multi-segment primitives** (e.g. `.rp-empty-state`).
  The matcher is conservative — it expects single-word cores like
  `btn`, `card`, `pill`. A future iteration can extend the matcher;
  the conservative bound keeps false positives near zero.

## Programmatic

```ts
import {
  generateMigrationPlan,
  plan,
} from "./scripts/migration-planner";

// Top-level — runs everything:
const result = generateMigrationPlan();

// Pure (synthetic):
import { registry } from "./scripts/rp-registry";
const result = plan({
  registry,
  usage: { tokens: new Map(), primitives: new Map(), unusedTokens: [], unusedPrimitives: ["rp-btn"], filesScanned: 0 },
  files: [{ path: "x.css", content: ".rp-gc-btn { color: red; }" }],
});
```
