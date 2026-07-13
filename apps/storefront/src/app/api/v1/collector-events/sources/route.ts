import { jsonResponse } from "@/lib/data-pantry";
import {
  COLLECTOR_EVENTS_AS_OF,
  COLLECTOR_EVENTS_FRESHNESS_SECONDS,
  COLLECTOR_EVENT_SOURCES,
} from "@/lib/collector-events/registry";

export function GET(): Response {
  const counts = Object.fromEntries(
    ["minimal-facts-only", "open-geodata", "link-only"].map((mode) => [
      mode,
      COLLECTOR_EVENT_SOURCES.filter(
        (source) => source.rights_review.publication_mode === mode,
      ).length,
    ]),
  );
  return jsonResponse({
    endpoint: "/api/v1/collector-events/sources",
    sources: COLLECTOR_EVENT_SOURCES.map((source) => source.id),
    as_of: COLLECTOR_EVENTS_AS_OF,
    freshness: COLLECTOR_EVENTS_FRESHNESS_SECONDS,
    license: "NOASSERTION",
    does_not_include: [
      "A rights review is a cautious publication decision, not legal advice or a declaration that an upstream site is openly licensed.",
      "No source prose, images, ticket inventory, personal names, or personal contacts are copied.",
    ],
    data: {
      "@kind": "collector-event-evidence-source-list",
      count: COLLECTOR_EVENT_SOURCES.length,
      counts_by_publication_mode: counts,
      sources: COLLECTOR_EVENT_SOURCES,
      vocabulary: {
        "minimal-facts-only": "A small hand-reviewed set of bare facts; no source prose or media.",
        "open-geodata": "Coordinates used under the source's stated open-data terms with attribution.",
        "link-only": "Discoverable as a URL but not admitted into structured fact records.",
      },
      methodology: "/methodology/collector-events",
    },
  });
}
