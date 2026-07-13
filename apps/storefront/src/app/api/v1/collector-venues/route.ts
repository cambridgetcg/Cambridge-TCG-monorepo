import { jsonResponse } from "@/lib/data-pantry";
import {
  COLLECTOR_EVENTS_AS_OF,
  COLLECTOR_EVENT_ATTRIBUTIONS,
  COLLECTOR_EVENTS_FRESHNESS_SECONDS,
  COLLECTOR_VENUES,
} from "@/lib/collector-events/registry";
import { evidenceForIds } from "@/lib/collector-events/query";

export function GET(): Response {
  const sourceIds = COLLECTOR_VENUES.flatMap((venue) =>
    Object.values(venue.field_sources).flat(),
  );
  return jsonResponse({
    endpoint: "/api/v1/collector-venues",
    sources: evidenceForIds(sourceIds).map((source) => source.id),
    as_of: COLLECTOR_EVENTS_AS_OF,
    freshness: COLLECTOR_EVENTS_FRESHNESS_SECONDS,
    license: "NOASSERTION",
    does_not_include: [
      "Only established public event venues are present; private and unpublished locations are excluded.",
      "Coordinates are postcode centroids, not entrances or precise building points.",
      "No staff names, direct contacts, or operational profiles are included.",
    ],
    data: {
      "@kind": "collector-venue-list",
      count: COLLECTOR_VENUES.length,
      comprehensive: false,
      venues: COLLECTOR_VENUES,
      attribution: COLLECTOR_EVENT_ATTRIBUTIONS,
      detail_template: "/api/v1/collector-venues/{id}",
      map: "/api/v1/collector-events/map.geojson",
      methodology: "/methodology/collector-events",
    },
  });
}
