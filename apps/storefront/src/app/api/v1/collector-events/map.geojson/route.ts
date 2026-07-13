import { errorResponse } from "@/lib/data-pantry";
import { buildCollectorEventsGeoJson } from "@/lib/collector-events/formats";
import {
  filterCollectorEvents,
  parseCollectorEventFilters,
} from "@/lib/collector-events/query";

const ENDPOINT = "/api/v1/collector-events/map.geojson";

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
  const body = buildCollectorEventsGeoJson(filterCollectorEvents(parsed.filters));
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/geo+json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers":
        "X-Content-License, X-Coordinate-Precision, Link",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Content-License": "NOASSERTION",
      "X-Coordinate-Precision": "postcode-centroid-not-venue-entrance",
      Link: '</methodology/collector-events>; rel="describedby", </api/v1/collector-events>; rel="alternate"; type="application/json"',
    },
  });
}
