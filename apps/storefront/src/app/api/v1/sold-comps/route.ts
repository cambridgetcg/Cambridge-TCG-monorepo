import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { soldCompsPausedData } from "@/lib/sold-comps/query";

export async function GET(): Promise<Response> {
  return jsonResponse({
    endpoint: "/api/v1/sold-comps",
    sources: ["publication-policy"],
    source_license: ["internal-only"],
    license: "NOASSERTION",
    freshness: "methodology",
    no_cache: true,
    does_not_include: [
      "No transaction price, count, timestamp, condition, person, or below-threshold total is published while the dataset is paused.",
    ],
    data: soldCompsPausedData(),
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
