import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import {
  COLLECTOR_EVENTS,
  COLLECTOR_EVENTS_AS_OF,
  COLLECTOR_EVENT_ATTRIBUTIONS,
  COLLECTOR_EVENTS_FRESHNESS_SECONDS,
  COLLECTOR_EVENTS_TEMPORAL_CACHE_SECONDS,
  COLLECTOR_VENUE_BY_ID,
} from "@/lib/collector-events/registry";
import { evidenceForEvent, evidenceForIds, projectCollectorEvent } from "@/lib/collector-events/query";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  { params }: RouteParams,
): Promise<Response> {
  const { id } = await params;
  const venue = COLLECTOR_VENUE_BY_ID.get(id as `ven_${string}`);
  if (!venue) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `Collector venue '${id}' was not found.`,
      endpoint: "/api/v1/collector-venues/[id]",
      docs: "/api/v1/collector-venues",
    });
  }
  const events = COLLECTOR_EVENTS.filter((event) => event.venue_id === venue.id).map(
    (event) => projectCollectorEvent(event),
  );
  const sourceIds = [
    ...Object.values(venue.field_sources).flat(),
    ...events.flatMap((event) => evidenceForEvent(event).map((source) => source.id)),
  ];
  const evidence = evidenceForIds(sourceIds);

  return jsonResponse({
    endpoint: "/api/v1/collector-venues/[id]",
    sources: evidence.map((source) => source.id),
    as_of: COLLECTOR_EVENTS_AS_OF,
    freshness: COLLECTOR_EVENTS_FRESHNESS_SECONDS,
    cache_max_age: COLLECTOR_EVENTS_TEMPORAL_CACHE_SECONDS,
    cache_s_max_age: COLLECTOR_EVENTS_TEMPORAL_CACHE_SECONDS,
    license: "NOASSERTION",
    does_not_include: [
      "Coordinates are postcode centroids, not venue entrances.",
      "No venue staff names, direct contacts, or operational profiles are included.",
    ],
    data: {
      "@kind": "collector-venue-detail",
      venue,
      related_events: events,
      evidence_sources: evidence,
      attribution: venue.geometry ? COLLECTOR_EVENT_ATTRIBUTIONS : [],
      collection: "/api/v1/collector-venues",
      methodology: "/methodology/collector-events",
    },
  });
}
