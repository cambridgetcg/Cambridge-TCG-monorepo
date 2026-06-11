# RP Registry

Typed parse of `rp-shared.css`. The CSS is the canonical source; this
module is the structured derivative every other layer (handoff
validator, scorer, bridge) consumes.

## Why this layer exists

Before this module, three places independently re-parsed the CSS:
- The handoff (`design-system.md`) hand-mirrored the token values in markdown.
- The scorer (`claude-design-bridge/scorer.ts`) regex-matched token name prefixes.
- The bridge's handoff loader embedded the CSS verbatim and trusted the model to read it.

If any one of those drifted, nothing would notice. The registry pins
the parse in one place; everyone else imports the typed result.

## Usage

```ts
import { registry, tokenValue, isKnownToken, isKnownPrimitive } from "./scripts/rp-registry";

registry.tokens                  // every token, typed
registry.byCategory.spacing      // [{ name: "--rp-space-xs", value: "4px", ... }, ...]
registry.tokenNames              // Set<string> for O(1) membership
registry.primitives              // every `.rp-*` class
registry.primitiveNames          // Set<string>

tokenValue("--rp-space-md")              // "12px"
tokenValue("--rp-text-color", "dark")    // "rgba(255, 255, 255, 0.92)"
isKnownToken("--rp-frob")                // false
isKnownPrimitive("rp-btn")               // true
```

## Layer position

```
Foundation:    rp-shared.css        (canonical text)
Registry:      rp-registry          ← this module (typed parse)
Governance:    DESIGN.md            (rules in markdown)
AI handoff:    design-system.md     (rules for AI)
Validation:    test-prompts.md      (how to score AI output)
Bridge:        claude-design-bridge (programmatic generation + scoring)
```

The registry only reaches one level down — it parses the CSS and
nothing else. Consumers above it (handoff loader, scorer, future
validators) import `registry` and treat it as the source of truth.

## Parser entry point

For testing and offline use, the parser is exported separately:

```ts
import { parse } from "./scripts/rp-registry";
const r = parse("...your CSS...");
```

This lets tests pass synthetic CSS without touching the filesystem.
