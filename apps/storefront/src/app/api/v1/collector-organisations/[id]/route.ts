import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import {
  COLLECTOR_EVENTS,
  COLLECTOR_EVENTS_AS_OF,
  COLLECTOR_EVENTS_FRESHNESS_SECONDS,
  COLLECTOR_EVENTS_TEMPORAL_CACHE_SECONDS,
  COLLECTOR_ORGANISATION_BY_ID,
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
  const organisation = COLLECTOR_ORGANISATION_BY_ID.get(id as `org_${string}`);
  if (!organisation) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `Collector organisation '${id}' was not found.`,
      endpoint: "/api/v1/collector-organisations/[id]",
      docs: "/api/v1/collector-organisations",
    });
  }
  const events = COLLECTOR_EVENTS.filter((event) =>
    event.organisation_relations.some(
      (relation) => relation.organisation_id === organisation.id,
    ),
  ).map((event) => projectCollectorEvent(event));
  const sourceIds = [
    ...Object.values(organisation.field_sources).flat(),
    ...events.flatMap((event) => evidenceForEvent(event).map((source) => source.id)),
  ];
  const evidence = evidenceForIds(sourceIds);

  return jsonResponse({
    endpoint: "/api/v1/collector-organisations/[id]",
    sources: evidence.map((source) => source.id),
    as_of: COLLECTOR_EVENTS_AS_OF,
    freshness: COLLECTOR_EVENTS_FRESHNESS_SECONDS,
    cache_max_age: COLLECTOR_EVENTS_TEMPORAL_CACHE_SECONDS,
    cache_s_max_age: COLLECTOR_EVENTS_TEMPORAL_CACHE_SECONDS,
    license: "NOASSERTION",
    does_not_include: [
      "The record covers a public organisation identity and source-stated event roles only.",
      "No officers, employees, personal contacts, inferred ties, communication-style analysis, or behavioural profiles are included.",
    ],
    data: {
      "@kind": "collector-organisation-detail",
      organisation,
      related_events: events,
      evidence_sources: evidence,
      collection: "/api/v1/collector-organisations",
      methodology: "/methodology/collector-events",
    },
  });
}
