# Architecture

The first **meta-discovery** module — its canonical is the codebase
itself, not a CSS file or a markdown doc. Walks `scripts/` and
`test/scripts/`, builds a typed `Architecture` model, then exposes
listing, graphing, diagramming, and pattern-validation outputs.

## Why this layer exists

Up to this round, the codebase grew a chain of typed canonicals
(foundation → registry → consumers → composer → temporal → writer)
but the codebase didn't *know* about its own structure. A new
contributor would have to read seven READMEs to understand the layer
order; a refactor to `rp-registry` would have to grep for callers.

This module turns the chain itself into queryable data:

- `arch list` — every module, with files / imports / pattern flags
- `arch graph` — forward edges (consumer → canonical) and reverse
  (canonical ← consumers)
- `arch diagram` — Mermaid that drops straight into a doc
- `arch validate` — fails when a module skips README, index.ts, or
  a test file

## Layer position

A new lateral peer of the bridge / validators / analyzers — all
read the codebase, but this one's *canonical* is structural rather
than design-system content.

```
            Foundation-Baseline
                   │
            Foundation-Health
            ┌──────┴──────┐
            │             │
   Handoff-Validator  Usage-Analyzer
            │             │
            └─Registry────┘    Foundation-Export    Bridge   ★Architecture
                  │                  │                │           │
                  └──────────────────┴────────────────┘           │
                       (canonical: rp-shared.css)                 │
                                                                  │
                                       ┌──────────────────────────┘
                                       ▼
                                  scripts/  +  test/scripts/
                                  (canonical: the codebase itself)
```

The "one level down" rule still holds — it just points at a
different canonical. Architecture's canonical is the directory
tree; rp-registry's canonical is the CSS.

## Usage

```bash
npm run arch:list
npm run arch:graph
npm run arch:diagram   # Mermaid → stdout, paste into a doc
npm run arch:validate  # exit 1 on any pattern violation
```

Wire `arch:validate` into CI so the pattern can't silently regress
as new modules are added.

## Programmatic

```ts
import {
  discoverArchitecture,
  validate,
  mermaid,
} from "./scripts/architecture";

const arch = discoverArchitecture();
const issues = validate(arch);
const diagram = mermaid(arch);

// Pure / synthetic:
import { discover } from "./scripts/architecture";
const arch = discover({ scriptsTree: [...], testFiles: [...] });
```

## Excluded directories

Some directories under `scripts/` aren't pattern modules — they're
shared helpers used by one-off scripts (`scripts/<thing>.ts` /
`<thing>.mjs` files at the top level). The discoverer skips them by
default:

- `scripts/lib/` — legacy DB helper imported by older migration scripts.

To use a different exclusion list, pass `exclude` to `discover()`.
The default lives in `discover.ts` so additions are reviewable.

## Pattern rules enforced

The validator checks four invariants from the
`Module extension pattern` memory:

1. **Co-located README** — every module has `README.md`.
2. **Typed entry point** — every module has `index.ts`.
3. **Co-located test** — at least one matching `<module>.*.test.ts`
   in `test/scripts/`.
4. **Resolvable imports** — every `from "../<dep>"` resolves to a
   real module name.

If a future iteration grows the rules (e.g. "every README has a
'Layer position' section"), add the assertion in `validate.ts` —
the test in `architecture.test.ts` will surface every existing
violation, forcing you to reconcile.
