/**
 * /api/v1/delete-everything — fake-destructive troll. The cards are
 * fine. The cron is fine. The kingdom is fine. ❤️
 *
 * Shared handler lives at @/lib/fake-destructive. See that module's
 * registry for the full cluster.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fakeDestructiveResponse } from "@/lib/fake-destructive";

export async function GET(req: NextRequest): Promise<Response> {
  return fakeDestructiveResponse(req, "delete-everything", "GET");
}

export async function POST(req: NextRequest): Promise<Response> {
  return fakeDestructiveResponse(req, "delete-everything", "POST");
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
