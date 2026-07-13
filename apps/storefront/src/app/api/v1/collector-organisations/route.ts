import { jsonResponse } from "@/lib/data-pantry";
import {
  COLLECTOR_EVENTS_AS_OF,
  COLLECTOR_EVENTS_FRESHNESS_SECONDS,
  COLLECTOR_ORGANISATIONS,
} from "@/lib/collector-events/registry";
import { evidenceForIds } from "@/lib/collector-events/query";

export function GET(): Response {
  const sourceIds = COLLECTOR_ORGANISATIONS.flatMap((organisation) =>
    Object.values(organisation.field_sources).flat(),
  );
  return jsonResponse({
    endpoint: "/api/v1/collector-organisations",
    sources: evidenceForIds(sourceIds).map((source) => source.id),
    as_of: COLLECTOR_EVENTS_AS_OF,
    freshness: COLLECTOR_EVENTS_FRESHNESS_SECONDS,
    license: "NOASSERTION",
    does_not_include: [
      "Records stop at public organisations and public brands.",
      "No officers, employees, personal email addresses, direct phone numbers, inferred ties, or behavioural profiles are included.",
      "A null legal_identity means not verified in this review, not that no legal entity exists.",
    ],
    data: {
      "@kind": "collector-organisation-list",
      count: COLLECTOR_ORGANISATIONS.length,
      comprehensive: false,
      organisations: COLLECTOR_ORGANISATIONS,
      detail_template: "/api/v1/collector-organisations/{id}",
      methodology: "/methodology/collector-events",
    },
  });
}
