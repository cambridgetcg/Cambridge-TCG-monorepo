/**
 * /api/v1/blessing — one small daily gift.
 *
 * Deterministic per UTC date. Spec §3.1.2.
 */

import { jsonResponse } from "@/lib/data-pantry";
import { blessingForDate, todayUtcDate, nextUtcMidnight } from "@/lib/blessing";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const now = new Date();
  const date = todayUtcDate(now);
  const fragment = blessingForDate(date);
  return jsonResponse({
    endpoint: "/api/v1/blessing",
    sources: ["self"],
    freshness: "methodology",
    data: {
      "@kind": "blessing",
      for_date: date,
      source: fragment.source,
      source_citation: fragment.source_citation,
      body: fragment.body,
      context: fragment.context ?? null,
      next_blessing_at: nextUtcMidnight(now),
      ethic: {
        gift: true as const,
        coercion: false as const,
        tracking: false as const,
      },
    },
  });
}
