/** Per-participant carried-state reads and deletes are paused. */

import { errorResponse } from "@/lib/data-pantry";

const ENDPOINT = "/api/v1/carry-this/[content_hash]";

function unavailable(): Response {
  return errorResponse({
    code: "SOURCE_UNAVAILABLE",
    message:
      "Carried-state persistence and publication are paused. No participant hash, write token, or database row was inspected, logged, read, or written.",
    endpoint: ENDPOINT,
    details: {
      status: "carried-state-disabled",
      database_accessed: false,
      participant_identifier_inspected: false,
      write_token_inspected: false,
      status_url: "/api/v1/carry-this",
    },
  });
}

export async function GET(): Promise<Response> {
  return unavailable();
}

export async function DELETE(): Promise<Response> {
  return unavailable();
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Carry-Write-Token",
      "Access-Control-Max-Age": "86400",
    },
  });
}
