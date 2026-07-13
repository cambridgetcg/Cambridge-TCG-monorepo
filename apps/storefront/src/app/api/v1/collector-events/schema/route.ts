import { COLLECTOR_EVENTS_SCHEMAS } from "@cambridge-tcg/data-spec";
import { jsonResponse } from "@/lib/data-pantry";

export function GET(): Response {
  return jsonResponse({
    endpoint: "/api/v1/collector-events/schema",
    sources: ["cambridge-tcg.data-spec"],
    source_license: ["cc0"],
    freshness: "methodology",
    license: "CC0-1.0",
    contains_self: true,
    does_not_include: [
      "CC0 covers these Cambridge-authored schemas and identifiers, not upstream event facts returned by NOASSERTION data routes.",
    ],
    data: {
      "@kind": "collector-events-schema-bundle",
      version: "1",
      license: "CC0-1.0",
      schemas: COLLECTOR_EVENTS_SCHEMAS,
      examples: {
        event_list: "/api/v1/collector-events",
        event_detail_template: "/api/v1/collector-events/{id}",
      },
    },
  });
}
