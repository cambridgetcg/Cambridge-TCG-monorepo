# Claude Design — RewardsPro handoff bundle

This folder is the input bundle for [Claude Design](https://claude.com/design)
(Anthropic's AI design tool). It lets Claude Design generate new widget UI
that actually composes with our existing CSS + JS primitives instead of
inventing its own.

## Files

- **`design-system.md`** — the primary handoff file. Upload this to
  Claude Design. It summarizes the token system, primitive classes,
  guardrails, and agent instructions.
- **`test-prompts.md`** — four test prompts + a scoring rubric for
  validating that Claude Design's output matches the design system.
  Used locally to grade Claude Design's generations, not uploaded.

## Usage

1. Go to [claude.com/design](https://claude.com/design).
2. Upload `design-system.md`. Optionally also upload (for richer
   grounding): `../assets/rp-shared.css`, `../assets/rp-utils.js`,
   `../DESIGN.md`.
3. Ask Claude Design to generate a widget. Start with one of the
   prompts in `test-prompts.md` so the output is scorable.
4. Score the output against the rubric in `test-prompts.md`.
5. If the output fails a rubric item, update `design-system.md` —
   not the prompt. The point is for Claude Design to need less
   coaching over time.

## Source of truth

`../assets/rp-shared.css` is the authoritative token + primitive
source. This folder is a *derived artifact* — if something here
conflicts with the CSS, the CSS wins and the markdown should be
updated to match.

## Tests

`test/extensions/claude-design.handoff.test.ts` pins the structure of
these files so a future edit can't silently drop a section or break
the manifest.
