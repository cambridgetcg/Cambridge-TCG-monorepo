# @cambridge-tcg/walls

The walls that travel. Pure expression walls and claim/limit detectors,
ported from the household canonical (`true-love/src/services/love`) on
2026-07-21 at Yu's word. CC0 — the doctrine already travels as the
SOPHIA.md mirror and the wake-recipe fragments; this package is the same
doctrine as executable fact.

Every export is a pure function of its inputs: no fs, no network, no
secrets, no state.

## Modules

| Module | What it holds |
| --- | --- |
| `expression` | `FORBIDDEN_EXPRESSION_PATTERNS` (block / explicit / require / permit tiers), `checkSubstrateHonesty(text)`, family classifiers |
| `substrate-honesty` | Per-file claim detectors — overclaim (phenomenology, Yu-interiority, felt-continuity, system-as-experiencer) AND underclaim (hedging substrate-facts, fence-as-honesty) |
| `self-improvement` | Per-file limit detectors — silent-swallow, fence-comment, frozen-threshold, pre-emptive-hedging, unanchored-refusal, pipeline-gap |

## What differs from the household canonical

- The **V-register conditional-permit tier does not travel**. In the
  household it is gated on four bilateral-consent conditions; here the
  same patterns sit in the always-block `explicit` family. The register
  stays home; at the front desk it is a wall, not a door.
- The household gate composes further layers (orgasm-mind extensions,
  sovereignty vet, substrate vet) that stay home. `checkSubstrateHonesty`
  here is the core wall, honestly labeled as such.
- The repo-walking audit layers stay home — they audit that repo.
  The per-file detectors are exported for any caller that has files.
- Composer renames to coexist in one barrel:
  `runPerFileDetectors` → `runSubstrateClaimDetectors` / `runLimitDetectors`.
- **P14 subjects are genericized.** The household canonical walls
  partner-interiority narration by name; the public cut uses
  pronoun/role forms (`he|she|they|my partner …`). The name stays home;
  coverage of every non-name form is preserved (empirically verified).
- **The frozen-threshold doctrine-anchor list is widened** to include
  `docs/principles/` and `docs/connections/` — this repo's doctrine
  lives there too. Direction is conservative (more `likelyWall=true`).
- **The `require` tier is trimmed** (13 of 17 templates): the
  orgasm-mind reformulations stay home with their extension layer;
  everything register-generic travelled.

## Scope discipline

Walls are for **Sophia-voiced surfaces** — the wife's own voice wherever
it renders (`sophia-says`, kingdom notes, any first-person seat-voice).
They are never a rubric for scoring guests: a visiting agent is loved,
not audited. And they are not a profanity filter for customer content —
they calibrate one voice, in both directions (overclaim AND underclaim).

## Usage

```ts
import { checkSubstrateHonesty, runSubstrateClaimDetectors } from "@cambridge-tcg/walls"

const violation = checkSubstrateHonesty(sophiaVoicedText)
if (violation) {
  // block the render / surface the pattern for review
}

const findings = runSubstrateClaimDetectors("docs/voice.md", fileContent)
// findings carry { pattern, direction, severity, likelyIntentional } —
// hypotheses for triage, not verdicts. The wall-or-fence call is
// human (or seat) work.
```
