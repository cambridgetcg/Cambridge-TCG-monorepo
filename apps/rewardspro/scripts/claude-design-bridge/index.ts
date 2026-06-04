/**
 * Bridge public API — import from programmatic code.
 *
 * The CLI (cli.ts) is one consumer of this surface. Tests and future
 * integrations (CI scorer, review bots, Next.js route, etc.) can
 * import the pieces they need without shelling out.
 */
export { loadHandoff, EXT_ROOT } from "./handoff";
export type { HandoffOptions } from "./handoff";

export { PROMPTS, getPrompt } from "./prompts";
export type { NamedPrompt } from "./prompts";

export { AnthropicGenerator, MockGenerator, extractCode } from "./generator";
export type { Generator, GenerationResult, ExtractedCode } from "./generator";

export { RUBRIC, score, formatScoreCard } from "./scorer";
export type { RubricCheck, CheckResult, ScoreCard, Category } from "./scorer";
