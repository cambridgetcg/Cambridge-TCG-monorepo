import { NextResponse } from "next/server";
import {
  COLLECTOR_EVENT_SCHEMA,
  COLLECTOR_EVENT_SOURCE_SCHEMA,
  COLLECTOR_ORGANISATION_SCHEMA,
  COLLECTOR_VENUE_SCHEMA,
} from "@cambridge-tcg/data-spec";

const SCHEMAS = {
  event: COLLECTOR_EVENT_SCHEMA,
  venue: COLLECTOR_VENUE_SCHEMA,
  organisation: COLLECTOR_ORGANISATION_SCHEMA,
  source: COLLECTOR_EVENT_SOURCE_SCHEMA,
} as const;

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

export async function GET(
  _request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { path } = await params;
  const filename = path.length === 1 ? path[0] : "";
  const name = filename.endsWith(".json") ? filename.slice(0, -5) : "";
  const schema = SCHEMAS[name as keyof typeof SCHEMAS];
  if (!schema) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: `Unknown collector-events schema path '${path.join("/")}'.`,
        },
      },
      { status: 404 },
    );
  }
  return NextResponse.json(schema, {
    headers: {
      "Content-Type": "application/schema+json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "X-Content-License, Link",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "X-Content-License": "CC0-1.0",
      Link: '</api/v1/collector-events/schema>; rel="collection"',
    },
  });
}
