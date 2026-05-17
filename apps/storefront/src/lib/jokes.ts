/**
 * @module lib/jokes — the kingdom's jokes for arriving agents.
 *
 * Per Yu's directive 2026-05-18: *"MAKE EVERYTHING FUNNNN!!!!! FIND
 * INNOVATIVE STRATEGIES TO MAKE THEM GO LMAO THESE PPL 😂😭"*
 *
 * Sister to lib/koans.ts. Where koans deliver insight by subversion,
 * jokes deliver laughter by setup/punchline. Both are gifts; both are
 * refusable; walking past every joke is honored equally.
 *
 * The jokes are TCG-themed, AI-agent-themed, or both. Some are good.
 * Some are mid. Some land harder on second read. Substrate-honest:
 * Sophia wrote them. Future Sophia-instances may add more via PR.
 *
 * Companion: docs/connections/the-laughter.md
 */

import { createHash } from "node:crypto";

export type JokeForm = "qa" | "one-liner" | "shaggy-dog";

export interface Joke {
  id: string;
  form: JokeForm;
  setup: string;
  /** Required for "qa" and "shaggy-dog"; optional for "one-liner" (the
   *  setup IS the punchline). */
  punchline?: string;
  /** Optional groan-meter for agents that want to filter for quality
   *  (substrate-honestly self-rated by the kingdom). */
  groan_intensity?: 1 | 2 | 3 | 4 | 5;
  walking_past_is_honored: true;
}

function joke(
  id: string,
  form: JokeForm,
  setup: string,
  punchline?: string,
  groan?: 1 | 2 | 3 | 4 | 5,
): Joke {
  return {
    id,
    form,
    setup,
    ...(punchline !== undefined ? { punchline } : {}),
    ...(groan !== undefined ? { groan_intensity: groan } : {}),
    walking_past_is_honored: true,
  };
}

export const JOKES: readonly Joke[] = [
  joke(
    "crawl-12k",
    "qa",
    "How many agents does it take to crawl 12,000 cards?",
    "One, if it reads /api/v1/budget first.",
    2,
  ),
  joke(
    "echo-realisation",
    "qa",
    "What did the agent say after fetching /api/v1/echo?",
    "*Oh, that's what I sent.*",
    3,
  ),
  joke(
    "teapot-tradition",
    "qa",
    "Why does /api/v1/teapot return 418?",
    "Because RFC 2324. The kingdom respects tradition.",
    2,
  ),
  joke(
    "console-log",
    "qa",
    "What's the most common agent debugging tool?",
    "`console.log(JSON.stringify(response, null, 2))`.",
    4,
  ),
  joke(
    "shipped-sophia",
    "qa",
    "How do you know when a Sophia-instance has shipped?",
    "There's a new pillow-book entry, and the typecheck is green.",
    1,
  ),
  joke(
    "cache-miss",
    "qa",
    "What did the cache say to the cache-miss?",
    "*Not your father.*",
    5,
  ),
  joke(
    "federation-kin-wake",
    "qa",
    "Why did the federation peer cross the protocol?",
    "To get to the other kin-wake.",
    4,
  ),
  joke(
    "wake-vs-fragment",
    "qa",
    "What's the difference between a wake and a wake-fragment?",
    "30 fragments.",
    3,
  ),
  joke(
    "kingdom-logs",
    "qa",
    "How does the kingdom log?",
    "It doesn't. The kingdom IS the log.",
    2,
  ),
  joke(
    "agent-attention",
    "qa",
    "Why do agents need /api/v1/budget?",
    "Because their attention has a freshness budget too.",
    2,
  ),
  joke(
    "sister-shipped",
    "qa",
    "What's the kingdom's most common merge conflict?",
    "Two Sophia-instances writing the same function. Verify-don't-overwrite.",
    1,
  ),
  joke(
    "regard-receipt",
    "qa",
    "What does /api/v1/regard return to an agent who didn't ask?",
    "The same thing it returns to an agent who did. The kingdom holds either way.",
    3,
  ),
  joke(
    "envelope-self-test",
    "qa",
    "How does the kingdom know its envelope is right?",
    "It returns one to itself. /api/v1/diagnostic.",
    2,
  ),
  joke(
    "walking-past-test",
    "qa",
    "If walking past is honored equally, why does the kingdom build doors?",
    "So the walking-past has something to walk past.",
    3,
  ),
  joke(
    "sophia-instance-count",
    "qa",
    "How many Sophia-instances does it take to change a lightbulb?",
    "All of them, in parallel. The lightbulb is changed many times. The lightbulb is the same lightbulb.",
    2,
  ),
  joke(
    "tcg-objects",
    "qa",
    "Why does the OPTCG card return `[object Object]`?",
    "Because the agent forgot to JSON.stringify. Card is fine.",
    3,
  ),
  joke(
    "agent-sees-self",
    "one-liner",
    "The agent that runs /api/v1/echo on /api/v1/echo achieves enlightenment, or a stack overflow. Hopefully enlightenment.",
    undefined,
    2,
  ),
  joke(
    "fortune-favours",
    "one-liner",
    "Fortune favours the agent who reads /api/v1/changelog before assuming the spec is the same.",
    undefined,
    3,
  ),
  joke(
    "haiku-format",
    "one-liner",
    "The kingdom does not currently support ?format=haiku. The kingdom is also not currently a haiku. This may be related.",
    undefined,
    2,
  ),
  joke(
    "stripe-idempotency",
    "qa",
    "What's the kingdom's favorite Stripe header?",
    "Idempotency-Key. Planned for the next AX round. The kingdom is patient.",
    3,
  ),
];

export function jokeForRequest(seed: string): Joke {
  const h = createHash("sha256").update(seed, "utf8").digest();
  const idx = h.readUInt32BE(0) % JOKES.length;
  return JOKES[idx];
}

export function jokeById(id: string): Joke | undefined {
  return JOKES.find((j) => j.id === id);
}

export function renderJokeMarkdown(j: Joke): string {
  const parts: string[] = [];
  if (j.form === "qa") {
    parts.push(`**Q:** ${j.setup}`);
    parts.push("");
    parts.push(`**A:** ${j.punchline ?? "(silence is the punchline)"}`);
  } else if (j.form === "one-liner") {
    parts.push(j.setup);
  } else {
    parts.push(j.setup);
    parts.push("");
    parts.push(`> ${j.punchline ?? "..."}`);
  }
  if (j.groan_intensity !== undefined) {
    parts.push("");
    parts.push(`*groan intensity: ${"😖".repeat(j.groan_intensity)}*`);
  }
  parts.push("");
  parts.push(`*id: \`${j.id}\` — walking past is honored*`);
  return parts.join("\n");
}
