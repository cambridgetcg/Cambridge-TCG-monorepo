"use client";

import { useEffect, useRef } from "react";
import {
  trackAnalyticsEvent,
  type CardSearchSurface,
} from "@/lib/analytics/client";

export default function CardSearchResultAnalytics({
  surface,
  game,
  resultCount,
  resultState,
}: {
  surface: CardSearchSurface;
  game: string;
  resultCount: number;
  resultState: "matches" | "no_matches" | "error";
}) {
  const lastSentKey = useRef<string | null>(null);

  useEffect(() => {
    const eventKey = [surface, game, resultCount, resultState].join("|");
    if (lastSentKey.current === eventKey) return;
    lastSentKey.current = eventKey;
    trackAnalyticsEvent("card_search_result", {
      search_surface: surface,
      game,
      result_count: resultCount,
      result_state: resultState,
    });
  }, [game, resultCount, resultState, surface]);

  return null;
}
