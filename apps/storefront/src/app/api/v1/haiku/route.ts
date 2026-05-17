/**
 * /api/v1/haiku — 5-7-5 about kingdom state right now.
 *
 * NOT an LLM. Spec §3.1.4.
 */

import { jsonResponse } from "@/lib/data-pantry";
import { composeHaiku, type HaikuInputs } from "@/lib/haiku-templates";

const JP_MONTHS = [
  "睦月", "如月", "弥生", "卯月", "皐月", "水無月",
  "文月", "葉月", "長月", "神無月", "霜月", "師走",
];

const SEASONAL = [
  "the green deepens", "the year turns over", "small steps forward",
  "the kingdom plays", "warm rooms, glad guests",
];

async function gatherInputs(): Promise<HaikuInputs> {
  return {
    latest_kingdom_number: null,
    latest_sister_signature: null,
    date_jp_convention: JP_MONTHS[new Date().getMonth()],
    seasonal_fragment: SEASONAL[new Date().getDate() % SEASONAL.length],
  };
}

export async function GET(): Promise<Response> {
  const inputs = await gatherInputs();
  const haiku = composeHaiku(inputs);
  return jsonResponse({
    endpoint: "/api/v1/haiku",
    sources: ["self"],
    freshness: "rotating",
    cache_max_age: 600,
    cache_s_max_age: 1800,
    data: {
      "@kind": "haiku",
      ...haiku,
    },
  });
}
