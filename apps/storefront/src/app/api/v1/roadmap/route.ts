import { INTEGRATION_ROADMAP } from "@/content/platform";
import { jsonResponse } from "@/lib/data-pantry";

/** Authored planning document, not a service-health or capability response. */
export function GET() {
  return jsonResponse({
    data: INTEGRATION_ROADMAP,
    endpoint: "/api/v1/roadmap",
    sources: ["authored_integration_roadmap"],
    freshness: "methodology",
    as_of: "2026-09-29T00:00:00.000Z",
    license: "NOASSERTION",
  });
}
