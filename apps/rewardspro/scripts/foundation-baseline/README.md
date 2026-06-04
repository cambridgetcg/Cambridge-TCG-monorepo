# Foundation Baseline

A persistence + diff layer over `foundation-health`. Captures a
point-in-time snapshot of the design system's health, then computes
structured diffs against subsequent snapshots.

The synthesized concept is **trend** — `improved`, `regressed`,
`unchanged`, or `mixed`. That word doesn't appear in any single
`HealthReport`; it only exists when you compare two reports across
time.

## Files in the chain

```
foundation-baseline.json          ← persisted baseline (committed to repo)
scripts/foundation-baseline/
  ├── snapshot.ts                 ← pure: report → Baseline
  ├── diff.ts                     ← pure: (prev, curr) → BaselineDiff
  ├── index.ts                    ← facade: I/O on baseline.json
  └── cli.ts                      ← take | diff | show
```

## Layer position

First **temporal** module in the chain. Composes the composer.

```
                 Foundation-Baseline (temporal)
                          │
                          ▼
                 Foundation-Health (composer)
                    │           │
                    ▼           ▼
         Handoff-Validator  Usage-Analyzer
                    │           │
                    └─Registry──┘
                          │
                    rp-shared.css
```

Up to this layer, every module reported on the *current* state.
This module introduces the concept of *change over time* — and with
it, regression tracking.

## Workflow

```bash
# First time: capture the first baseline
npm run baseline:take

# After making changes (refactor, migration, new widget):
npm run baseline:diff
# →  ↑ Token adoption  35/39 → 36/39

# Once you're happy with the new state, advance the baseline:
npm run baseline:take
```

`foundation-baseline.json` is committed to the repo so the trend can
be tracked across team members and PRs. Treat updating it as a
deliberate act — like advancing a CHANGELOG.

## Trend logic

- **Status changes** rank as `error > warning > ok`. Moving toward
  `ok` is `improved`; toward `error` is `regressed`.
- **Same status, count changed.** When the section's summary contains
  an `n/m` ratio (e.g. `35/39 tokens · 30/45 primitives`), a higher
  numerator is `improved` even if the status stayed the same.
- **Overall trend** is the worst-of: any `regressed` + any `improved`
  → `mixed`; otherwise the dominant direction.

## Exit codes (CI gating)

- `0` — improved or unchanged. Safe to merge.
- `1` — mixed. Some progress, some regression. Reviewer's call.
- `2` — regressed. Merge gate fail.

This is intentionally laxer than `foundation-health`'s exit codes:
the baseline diff is about *direction* of change, not absolute health.
A PR can merge with a still-warning status if it's moving toward `ok`.

## Programmatic

```ts
import {
  takeBaseline,
  diffAgainstBaseline,
  snapshot,
  diff,
} from "./scripts/foundation-baseline";

// Pure (synthetic):
const d = diff(prevBaseline, currBaseline);

// Top-level (real I/O):
const b = takeBaseline();
const trend = diffAgainstBaseline();
```
