#!/usr/bin/env tsx
/**
 * CLI — thin shell around the bridge modules.
 *
 *   npx tsx scripts/claude-design-bridge/cli.ts list
 *   npx tsx scripts/claude-design-bridge/cli.ts generate expiry-banner
 *   npx tsx scripts/claude-design-bridge/cli.ts generate "design a gift card reveal"
 *   npx tsx scripts/claude-design-bridge/cli.ts score <file>
 *   npx tsx scripts/claude-design-bridge/cli.ts test
 */
import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { loadHandoff } from "./handoff";
import { PROMPTS, getPrompt } from "./prompts";
import { AnthropicGenerator, extractCode } from "./generator";
import { score, formatScoreCard } from "./scorer";

// dotenv/config is imported first so the Anthropic SDK can read
// ANTHROPIC_API_KEY when the generator constructs its client.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUTS = path.resolve(__dirname, "outputs");

const USAGE = `\nClaude Design bridge\n
Usage:
  list                         list available prompt IDs
  generate <id | "text">       generate a design (named prompt or raw text)
  score <file>                 score an existing output file
  test                         run all canonical prompts, score each
`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(USAGE);
    return;
  }

  if (cmd === "list") {
    for (const p of PROMPTS) console.log(`  ${p.id.padEnd(18)} ${p.title}`);
    return;
  }

  if (cmd === "score") {
    const file = args[0];
    if (!file) throw new Error("score: missing <file> argument");
    const text = fs.readFileSync(file, "utf-8");
    console.log(formatScoreCard(score(extractCode(text))));
    return;
  }

  if (cmd === "generate") {
    const idOrText = args[0];
    if (!idOrText) throw new Error("generate: missing <id | text> argument");
    const named = getPrompt(idOrText);
    const userPrompt = named?.text ?? idOrText;
    const id = named?.id ?? "custom";
    const title = named?.title ?? "custom prompt";

    console.log(`→ generating: ${title}`);
    const gen = new AnthropicGenerator();
    const result = await gen.generate(loadHandoff(), userPrompt);

    fs.mkdirSync(OUTPUTS, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(OUTPUTS, `${id}-${stamp}.md`);
    fs.writeFileSync(file, result.text);
    console.log(`  wrote ${path.relative(process.cwd(), file)}`);
    console.log(`  model=${result.model} in=${result.usage.inputTokens} out=${result.usage.outputTokens}`);
    console.log(formatScoreCard(score(result.code)));
    return;
  }

  if (cmd === "test") {
    const gen = new AnthropicGenerator();
    const handoff = loadHandoff();
    fs.mkdirSync(OUTPUTS, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const summary: string[] = [`# Bridge test run — ${stamp}\n`];

    for (const p of PROMPTS) {
      console.log(`\n→ ${p.title}`);
      const result = await gen.generate(handoff, p.text);
      fs.writeFileSync(path.join(OUTPUTS, `${p.id}-${stamp}.md`), result.text);
      const card = score(result.code);
      console.log(`  ${card.passed}/${card.total} rubric items passed`);
      summary.push(`- **${p.title}** — ${card.passed}/${card.total}`);
    }
    fs.writeFileSync(path.join(OUTPUTS, `summary-${stamp}.md`), summary.join("\n") + "\n");
    return;
  }

  console.error(`unknown command: ${cmd}`);
  console.error(USAGE);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
