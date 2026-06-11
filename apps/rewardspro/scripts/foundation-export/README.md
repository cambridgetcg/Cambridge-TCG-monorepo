# Foundation Export

The first **writer** in the chain. Reads the registry, emits derived
artifacts (`tokens.json`, `tokens.ts`) for downstream consumers that
can't read CSS directly: a Next.js admin app, a JSON pipeline, a
translation extractor, an external design tool.

## Why this layer exists

Every prior module in the chain has been a reader. Validators,
analyzers, composers, baselines — all consume the canonical and
report on it. This is the first module that *writes*.

Bounded scope makes the writer safe:
- **Writes only to `dist/foundation/`** — never touches source.
- **Pure formatters first**, file I/O last. The formatters are
  unit-testable; the facade is the only place that talks to disk.
- **Header in every artifact** names the canonical source file and
  the regeneration command, so a downstream consumer reading the
  output always knows where it came from.

## Layer position

Sibling of bridge/validator/analyzer — all consume the registry.
What distinguishes the export module is its output side: it writes,
they read.

```
   Bridge   Handoff-Validator   Usage-Analyzer   Foundation-Export ★
     │            │                  │                  │
     └────────────┴── rp-registry ───┴──────────────────┘
                       │
                  rp-shared.css
                                    ★ writes derived artifacts
```

## Output

`dist/foundation/tokens.json` — flat record:

```json
{
  "$schema": "rp-foundation/v1",
  "generatedAt": "2026-04-25T...",
  "source": "extensions/.../rp-shared.css",
  "tokens": {
    "--rp-space-md": { "value": "12px", "category": "spacing" },
    "--rp-text-color": { "value": "#212B36", "dark": "rgba(255,255,255,0.92)", "category": "color-semantic" },
    ...
  },
  "primitives": ["rp-btn", "rp-btn--primary", ...]
}
```

`dist/foundation/tokens.ts` — typed import for TS consumers:

```ts
import { tokens, primitives, type TokenName } from "<path>/dist/foundation/tokens";

const md = tokens["--rp-space-md"];   // { value: "12px", category: "spacing" }
function pad(name: TokenName) { ... } // autocomplete + type-checked
```

## Usage

```bash
npm run foundation:export
```

Programmatic:

```ts
import { exportFoundation, formatJson, formatTs } from "./scripts/foundation-export";

// Write to default `dist/foundation/`:
exportFoundation();

// Write somewhere else (testing, custom builds):
exportFoundation("/tmp/my-export");

// Pure formatters — no I/O:
import { registry } from "./scripts/rp-registry";
const json = formatJson(registry);
const ts = formatTs(registry);
```

## Why not commit the artifacts?

`dist/foundation/` is gitignored. Two reasons:

1. **Derived data goes in `dist/`, not source.** Same as the build
   output of any compiled language.
2. **Avoid PR diff churn.** When the canonical CSS changes, the
   tokens file changes too, doubling diff lines for no information.
   The canonical CSS already shows what changed.

If a downstream consumer wants the artifacts checked into their own
repo, they vendor them as part of their build step.
