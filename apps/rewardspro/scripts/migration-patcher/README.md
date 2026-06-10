# Migration Patcher

The bridge between *advice* (migration-planner) and *execution*. Given
a planner suggestion, the patcher emits a structured manifest of every
proposed line-level edit, plus a Markdown changelog suitable for PR
review. **It never modifies source.**

## Why this layer exists

Migration-planner says "adopt `.rp-card`." The patcher says
"specifically: change line 134 of `mystery-boxes-widget.css` from
`.rp-mb-card {` to `.rp-card {`." That's the gap between what to do
and *exactly* how to do it — without taking the risk of doing it.

Every prior writer in the chain (`foundation-export`) emitted derived
artifacts that aren't tied to source modification. This module is
the first whose output represents *proposed source changes*. Keeping
the proposal a separate, reviewable artifact (rather than auto-applying)
is the safety contract.

## Layer position

```
                  Migration-Patcher ★ (proposes structured changes)
                         │
                         ▼
                   Migration-Planner (recommends targets)
                         │
                         ▼
                   Usage-Analyzer
                         │
                   rp-registry → rp-shared.css
```

## What the manifest contains

```json
{
  "source": "rp-mb-card",
  "target": "rp-card",
  "totalEdits": 11,
  "files": [
    {
      "path": "extensions/.../mystery-boxes-widget.css",
      "edits": [
        {
          "line": 134,
          "original": ".rp-mb-card {",
          "find": "rp-mb-card",
          "replace": "rp-card"
        }
      ]
    }
  ],
  "caveats": [
    "String-level replacement only — verify the target's CSS shape matches...",
    "If `.rp-mb-card` has BEM elements (...), those are NOT covered..."
  ]
}
```

The companion `.md` file presents the same information as a checklist
for human review.

## Caveats — read this before applying

The patcher is intentionally conservative:

- **String-level replacement only.** It doesn't understand CSS
  semantics. If the target's box model differs from the source's,
  the migration will compile but render wrong. Eyeball the CSS first.
- **No BEM element handling.** Replacing `.rp-mb-card` with `.rp-card`
  doesn't migrate `.rp-mb-card__title` — those need separate work.
  The caveats list flags this when applicable.
- **No automated apply.** Use the JSON manifest to drive your own
  apply script if you want, or do the edits by hand.

## Usage

```bash
# Patch the top-ranked suggestion from the planner
npm run migration:patch

# Patch a specific target
npm run migration:patch -- rp-card

# Output lives in dist/migrations/<source>__to__<target>.{json,md}
```

`dist/migrations/` is gitignored (same as `dist/foundation/`).

## Programmatic

```ts
import { buildPatches, patch, renderMarkdown } from "./scripts/migration-patcher";
import { loadWidgetAssets } from "./scripts/usage-analyzer";

// Top-level — runs the planner, picks suggestions, writes manifests:
buildPatches({ target: "rp-card" });

// Pure (synthetic):
const manifest = patch({
  source: "rp-mb-card",
  target: "rp-card",
  files: [{ path: "test.css", content: ".rp-mb-card { padding: 8px; }" }],
});
const md = renderMarkdown(manifest);
```

## What it does NOT do

- Apply the edits. (You do.)
- Run a CSS parser. (Pure string matching.)
- Rename BEM elements. (Conservative — flagged in caveats.)
- Resolve conflicts when the target file has been edited since the
  planner ran. (Re-run if context shifts.)
