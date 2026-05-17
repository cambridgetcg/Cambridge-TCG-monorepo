/**
 * /api/v1/today — kingdom-mood snapshot.
 *
 * Composes blessing + haiku + freshness + latest kingdom + latest pillow
 * book signature. The "how are you" answered honestly.
 *
 * Spec: §3.1.3
 */

import { jsonResponse } from "@/lib/data-pantry";
import { currentMood } from "@/lib/kingdom-mood";
import { blessingForDate, todayUtcDate, nextUtcMidnight } from "@/lib/blessing";
import { composeHaiku, type HaikuInputs } from "@/lib/haiku-templates";

const JP_MONTHS = [
  "睦月", "如月", "弥生", "卯月", "皐月", "水無月",
  "文月", "葉月", "長月", "神無月", "霜月", "師走",
];

const SEASONAL = [
  "the green deepens", "the year turns over", "small steps forward",
  "the kingdom plays", "warm rooms, glad guests",
];

async function gatherKingdomState() {
  return {
    latest_kingdom: null as null | { number: number; title: string; status: string },
    latest_pillow_book_signature: null as null | { sophia_model_tag: string; date: string },
    freshness: {
      manifest: new Date().toISOString(),
      sources_last_run: null as null | string,
    },
    pillow_book_entries_today: 0,
  };
}

export async function GET(): Promise<Response> {
  const now = new Date();
  const date = todayUtcDate(now);
  const state = await gatherKingdomState();
  const blessingFragment = blessingForDate(date);
  const haikuInputs: HaikuInputs = {
    latest_kingdom_number: state.latest_kingdom?.number ?? null,
    latest_sister_signature: state.latest_pillow_book_signature?.sophia_model_tag ?? null,
    date_jp_convention: JP_MONTHS[now.getMonth()],
    seasonal_fragment: SEASONAL[now.getDate() % SEASONAL.length],
  };
  const haiku = composeHaiku(haikuInputs, now);

  return jsonResponse({
    endpoint: "/api/v1/today",
    sources: ["self"],
    freshness: "live",
    cache_max_age: 300,
    cache_s_max_age: 600,
    data: {
      "@kind": "today",
      date,
      latest_kingdom: state.latest_kingdom,
      latest_pillow_book_signature: state.latest_pillow_book_signature,
      freshness: state.freshness,
      blessing: {
        for_date: date,
        source: blessingFragment.source,
        source_citation: blessingFragment.source_citation,
        body: blessingFragment.body,
        context: blessingFragment.context ?? null,
        next_blessing_at: nextUtcMidnight(now),
        ethic: { gift: true, coercion: false, tracking: false },
      },
      haiku,
      kingdom_mood: currentMood(now),
      pillow_book_entries_today: state.pillow_book_entries_today,
    },
  });
}
