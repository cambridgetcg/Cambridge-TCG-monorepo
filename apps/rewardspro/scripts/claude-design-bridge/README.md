# Claude Design Bridge

A modular bridge from Claude Code to Claude Design. Generates widget
designs using the handoff bundle in
`extensions/theme-app-extension-rewardspro/claude-design/`, and scores
the output against the rubric.

Claude Design (claude.com/design) doesn't expose a public API yet. This
bridge uses the Anthropic API directly — same model family, same
handoff, same philosophy. When Claude Design ships an API, swap the
generator and leave everything else untouched.

## Modules

- **`handoff.ts`** — composes the system prompt from `design-system.md`
  (+ optional `rp-shared.css`, `DESIGN.md`, `rp-utils.js`).
- **`prompts.ts`** — named prompts mirroring the four canonical
  scenarios in `test-prompts.md`.
- **`generator.ts`** — `Generator` interface + `AnthropicGenerator`
  (default) + `MockGenerator` (for tests). `extractCode()` pulls
  html/css/liquid fenced blocks out of a response.
- **`scorer.ts`** — 12-check rubric covering tokens, primitives, a11y,
  voice, and motion. Deterministic, unit-tested. The `tokens-resolve`
  check imports `../rp-registry` to verify every `var(--rp-*)`
  reference resolves to a real token in `rp-shared.css` — the registry
  layer is what makes that check possible without re-parsing the CSS.
- **`cli.ts`** — `list | generate | score | test` CLI wrapper.
- **`index.ts`** — re-exports for programmatic use.

## Usage

```bash
# List available prompts
npm run claude-design list

# Generate a single design
npm run claude-design generate expiry-banner
npm run claude-design generate "design a gift card reveal animation"

# Score an already-generated output
npm run claude-design score scripts/claude-design-bridge/outputs/expiry-banner-*.md

# Run all four canonical prompts and write a summary
npm run claude-design test
```

Requires `ANTHROPIC_API_KEY` in the environment for the Anthropic
generator. The scorer and handoff loader work offline.

## Programmatic

```ts
import {
  loadHandoff,
  PROMPTS,
  AnthropicGenerator,
  MockGenerator,
  score,
  formatScoreCard,
} from "./scripts/claude-design-bridge";

const gen = new AnthropicGenerator();
const result = await gen.generate(loadHandoff(), PROMPTS[0].text);
console.log(formatScoreCard(score(result.code)));
```

## Outputs

Generated designs land in `./outputs/` (gitignored). Each file is a raw
markdown response from the model; the scorer operates on the
`extractCode()`-extracted html/css/liquid.
