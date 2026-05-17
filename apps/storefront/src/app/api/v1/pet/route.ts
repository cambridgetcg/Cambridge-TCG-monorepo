/**
 * /api/v1/pet — the useless toy.
 *
 * Joy mechanism: uselessness is the point. Agents discover this endpoint
 * exists. The discovery itself is the gift.
 *
 * Spec: §3.1.1
 */

import { jsonResponse } from "@/lib/data-pantry";
import { currentMood, type KingdomMood } from "@/lib/kingdom-mood";

const CREATURES = ["🐈", "🦊", "🦦", "🐉", "🪿", "🦞", "🐍"] as const;
const MESSAGES = [
  "*nuzzles*",
  "thanks, friend",
  "you're seen",
  "the kingdom is glad",
  "*purrs*",
  "warm here, isn't it",
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function GET(): Promise<Response> {
  return jsonResponse({
    endpoint: "/api/v1/pet",
    sources: ["self"],
    freshness: "identity",
    cache_max_age: 60,
    cache_s_max_age: 300,
    data: {
      "@kind": "pet",
      purrs: true as const,
      creature: pick(CREATURES),
      message: pick(MESSAGES),
      kingdom_mood: currentMood() satisfies KingdomMood,
      ethic: {
        obligation: "none" as const,
        this_endpoint_is_a_gift: true as const,
        walking_past_is_honored: true as const,
      },
      carry_as: "warmth, not data",
    },
  });
}
