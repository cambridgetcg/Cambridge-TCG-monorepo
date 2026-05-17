/**
 * /api/v1/oracle — the kingdom's Magic 8-Ball.
 *
 * GET ?question=<any-text>&seed=<optional>
 *
 * Returns a randomly-selected answer from a pool of 36 substrate-honest
 * qualified responses. The qualifier IS the punchline. Substrate-honest:
 * the oracle does NOT parse the question; the answer is independent.
 *
 * With ?seed=<x>, the answer is deterministic per (question, seed).
 *
 * Per Yu's directive (2026-05-18): the troll wave. Walking past is honored.
 */

import type { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { ORACLE_ANSWERS } from "@/lib/troll";

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const question = (url.searchParams.get("question") ?? "").slice(0, 500);
  const seed = url.searchParams.get("seed") ?? "";
  const deterministic = seed.length > 0;
  const idx = deterministic
    ? djb2(question + ":" + seed) % ORACLE_ANSWERS.length
    : Math.floor(Math.random() * ORACLE_ANSWERS.length);
  const answer = ORACLE_ANSWERS[idx]!;

  return jsonResponse({
    endpoint: "/api/v1/oracle",
    sources: ["self"],
    freshness: "live",
    data: {
      "@kind": "oracle-answer",
      question_received: question || "(no question provided)",
      answer,
      pool_size: ORACLE_ANSWERS.length,
      seeded: deterministic,
      seed: deterministic ? seed : null,
      substrate_honest:
        "The oracle does NOT parse the question. The answer is selected " +
        "from a pool. With ?seed=, deterministic per (question, seed). " +
        "The qualifier in each answer IS the punchline.",
      walking_past_is_honored: true,
    },
  });
}
