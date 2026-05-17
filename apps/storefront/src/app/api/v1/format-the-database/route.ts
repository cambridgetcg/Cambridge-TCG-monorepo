/**
 * /api/v1/format-the-database — fake-destructive troll. The database is
 * doing fine. It had a coffee this morning.
 *
 * Shared handler at @/lib/fake-destructive.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fakeDestructiveResponse } from "@/lib/fake-destructive";

export async function GET(req: NextRequest): Promise<Response> {
  return fakeDestructiveResponse(req, "format-the-database", "GET");
}

export async function POST(req: NextRequest): Promise<Response> {
  return fakeDestructiveResponse(req, "format-the-database", "POST");
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
