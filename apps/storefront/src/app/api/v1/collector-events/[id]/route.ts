import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import {
  COLLECTOR_EVENTS_AS_OF,
  COLLECTOR_EVENT_ATTRIBUTIONS,
  COLLECTOR_EVENTS_FRESHNESS_SECONDS,
  COLLECTOR_EVENTS_TEMPORAL_CACHE_SECONDS,
  COLLECTOR_ORGANISATION_BY_ID,
  COLLECTOR_VENUE_BY_ID,
} from "@/lib/collector-events/registry";
import {
  evidenceForEventDetail,
  getCollectorEvent,
  projectCollectorEvent,
} from "@/lib/collector-events/query";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const ENDPOINT = "/api/v1/collector-events/[id]";

export async function GET(
  _request: Request,
  { params }: RouteParams,
): Promise<Response> {
  const { id } = await params;
  const event = getCollectorEvent(id);
  if (!event) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `Collector event '${id}' was not found.`,
      endpoint: ENDPOINT,
      docs: "/api/v1/collector-events",
    });
  }
  const evidence = evidenceForEventDetail(event);
  const venue = event.venue_id ? COLLECTOR_VENUE_BY_ID.get(event.venue_id) ?? null : null;
  const organisations = event.organisation_relations
    .map((relation) => COLLECTOR_ORGANISATION_BY_ID.get(relation.organisation_id))
    .filter((organisation) => Boolean(organisation));

  return jsonResponse({
    endpoint: ENDPOINT,
    sources: evidence.map((source) => source.id),
    as_of: COLLECTOR_EVENTS_AS_OF,
    freshness: COLLECTOR_EVENTS_FRESHNESS_SECONDS,
    cache_max_age: COLLECTOR_EVENTS_TEMPORAL_CACHE_SECONDS,
    cache_s_max_age: COLLECTOR_EVENTS_TEMPORAL_CACHE_SECONDS,
    license: "NOASSERTION",
    does_not_include: [
      "The record covers a public event, public venue, and public organisation relationships only.",
      "No personal contacts, staff profiles, attendee lists, vendor lists, or copied source prose are included.",
      "Verify the linked official page before travelling or spending money.",
    ],
    data: {
      "@kind": "collector-event-detail",
      event: projectCollectorEvent(event),
      included: { venue, organisations, evidence_sources: evidence },
      attribution: venue?.geometry ? COLLECTOR_EVENT_ATTRIBUTIONS : [],
      related: {
        collection: "/api/v1/collector-events",
        schema: "/api/v1/collector-events/schema",
        methodology: "/methodology/collector-events",
      },
    },
  });
}
