# Handoff Validator

Verifies that the AI handoff (`claude-design/design-system.md`) accurately
describes the canonical foundation (`rp-shared.css`).

The handoff makes claims like "`--rp-text-color` is `#212B36`" and
"`--rp-shadow-md` is `0 4px 6px rgba(0,0,0,0.10)`". If the CSS changes,
those claims silently rot — and Claude Design generates code against
out-of-date facts. This validator catches that drift.

## What it checks

1. **Token references resolve.** Every `--rp-*` mentioned anywhere in
   the handoff exists in the registry (or is on the theme-inherited
   allowlist, e.g. `--rp-primary-color`).
2. **Token table values match.** Color and shadow table rows of the
   form `` | `--rp-x` | `<value>` | `` are compared against the
   registry's recorded value (light or dark mode). Mismatch → stale.

Numeric scale tables (spacing/font/radius) don't backtick their values,
so they're skipped here intentionally — they rarely drift, and including
them would add false positives. If they ever start drifting, extend the
parser.

## Layer position

```
Bridge   (claude-design-bridge)        — generator + scorer
Handoff  (claude-design/design-system.md)
   ▲
   │ this module
   ▼
Registry (scripts/rp-registry)         — typed parse of foundation
Foundation (rp-shared.css)
```

The validator is a sibling of the bridge; both consume the registry.
The bridge generates *new* code from the handoff. The validator verifies
the *existing* handoff against the source of truth. They're orthogonal
concerns at the same level.

## Usage

```bash
npm run validate-handoff
```

Exit code is 0 on success, non-zero on drift. Wire into CI to block
merges that change `rp-shared.css` without updating `design-system.md`.

```ts
import { validateCanonicalHandoff } from "./scripts/handoff-validator";

const report = validateCanonicalHandoff();
if (!report.ok) {
  for (const issue of report.issues) console.error(issue);
}
```

## Pure validator

For programmatic use with synthetic input:

```ts
import { validate } from "./scripts/handoff-validator";
import { registry } from "./scripts/rp-registry";

const report = validate("...handoff text...", registry);
```
