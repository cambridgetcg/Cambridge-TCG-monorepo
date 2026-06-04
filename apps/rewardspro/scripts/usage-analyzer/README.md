# Usage Analyzer

Maps where every foundation token and primitive class is used across
the widget codebase.

The validators answer "does the handoff / generated code match the
foundation?" (yes/no). This module answers "**how is the foundation
actually consumed?**" (structured data). Different question, different
output shape.

## What it surfaces

- **Per-token reference list** — `--rp-space-md` → `[{path, line}, ...]`
- **Per-primitive reference list** — `rp-btn` → `[{path, line}, ...]`
- **Unused tokens** — declared in `rp-shared.css` but referenced by no widget
- **Unused primitives** — class defined in `rp-shared.css` but used by no widget
- **Hot tokens** — most-referenced tokens (CLI prints top 10)

## Why this layer exists

- **Reveals dead code.** If `--rp-rarity-uncommon` is declared but no
  widget uses it, that's a candidate for deletion (or a reminder to
  use it).
- **Refactor safety.** Before renaming a token, check who depends on it.
- **Per-widget audits.** Future consumers can filter the report by
  path prefix to see what one widget consumes.
- **Quantifies the design system's reach.** A growing "used / declared"
  ratio means the foundation is being adopted.

## Layer position

Sibling of `claude-design-bridge` and `handoff-validator` — all three
consume `rp-registry`. The bridge generates new code; the validator
verifies an existing artifact; the analyzer describes how the foundation
is consumed. Three orthogonal queries against the same canonical.

```
   Bridge   Handoff-Validator   Usage-Analyzer
     │            │                  │
     └────────────┴── rp-registry ───┘
                       │
                  rp-shared.css
```

## Usage

```bash
npm run usage-report
npm run usage-report -- --json    # machine-readable
```

```ts
import { analyzeWidgetAssets } from "./scripts/usage-analyzer";

const report = analyzeWidgetAssets();
console.log(`${report.tokens.size} tokens used`);
for (const name of report.unusedTokens) console.warn(`unused: ${name}`);
```

## Pure analyzer

For tests / synthetic input, import the pure function:

```ts
import { analyze } from "./scripts/usage-analyzer";
import { parse } from "./scripts/rp-registry";

const registry = parse(`:root { --rp-foo: 1px; } .rp-bar { color: red; }`);
const report = analyze(
  [{ path: "test.css", content: ".rp-bar { padding: var(--rp-foo); }" }],
  registry
);
```

## Excluded files

`rp-shared.css` is excluded from the scan — it's the canonical itself,
so including it would make every token trivially "used." Widget-side
adoption is what we care about.
