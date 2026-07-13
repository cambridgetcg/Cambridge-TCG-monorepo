/** GET /api/v1/collector-events — the reviewed UK collector-event seed. */

import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import {
  COLLECTOR_EVENTS,
  COLLECTOR_EVENTS_AS_OF,
  COLLECTOR_EVENTS_FRESHNESS_SECONDS,
  COLLECTOR_EVENTS_TEMPORAL_CACHE_SECONDS,
} from "@/lib/collector-events/registry";
import {
  filterCollectorEvents,
  evidenceForEvent,
  parseCollectorEventFilters,
} from "@/lib/collector-events/query";

const ENDPOINT = "/api/v1/collector-events";

export function GET(request: Request): Response {
  const parsed = parseCollectorEventFilters(new URL(request.url));
  if (!parsed.ok) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: parsed.message,
      endpoint: ENDPOINT,
      docs: "/methodology/collector-events",
    });
  }
  const events = filterCollectorEvents(parsed.filters);
  const sourceIds = [
    ...new Set(events.flatMap((event) => evidenceForEvent(event).map((source) => source.id))),
  ];

  return jsonResponse({
    endpoint: ENDPOINT,
    sources: sourceIds,
    as_of: COLLECTOR_EVENTS_AS_OF,
    freshness: COLLECTOR_EVENTS_FRESHNESS_SECONDS,
    cache_max_age: COLLECTOR_EVENTS_TEMPORAL_CACHE_SECONDS,
    cache_s_max_age: COLLECTOR_EVENTS_TEMPORAL_CACHE_SECONDS,
    license: "NOASSERTION",
    does_not_include: [
      "This is a four-event reviewed demonstrator, not a comprehensive UK event directory.",
      "No attendee, vendor, officer, staff, personal contact, image, or copied event-description data is included.",
      "Unknown accessibility fields mean the reviewed source did not state the fact; unknown does not mean false.",
      "Verify the linked official page before travelling or spending money.",
    ],
    data: {
      "@kind": "collector-event-list",
      filters: parsed.filters,
      count: events.length,
      total_reviewed_records: COLLECTOR_EVENTS.length,
      comprehensive: false,
      bounded_static_seed: true,
      pagination: null,
      pagination_commitment: "A cursor will be introduced before this collection exceeds 100 admitted records.",
      events,
      related: {
        event_detail_template: "/api/v1/collector-events/{id}",
        venues: "/api/v1/collector-venues",
        organisations: "/api/v1/collector-organisations",
        evidence_sources: "/api/v1/collector-events/sources",
        coverage_and_gaps: "/api/v1/collector-events/coverage",
        calendar: "/api/v1/collector-events/calendar.ics",
        map: "/api/v1/collector-events/map.geojson",
        schemas: "/api/v1/collector-events/schema",
        methodology: "/methodology/collector-events",
      },
      rights_boundary: {
        response_license: "NOASSERTION",
        schema_and_cambridge_annotations_license: "CC0-1.0",
        rule: "Evidence-source rights stay attached. No response-wide open licence is asserted over mixed upstream facts.",
      },
    },
  });
}
