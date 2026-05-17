/**
 * /api/v1/drop-tables — fake-destructive troll. Little Bobby Tables,
 * the kingdom uses parameterised queries. ❤️ xkcd #327.
 *
 * Shared handler at @/lib/fake-destructive.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fakeDestructiveResponse } from "@/lib/fake-destructive";

export async function GET(req: NextRequest): Promise<Response> {
  return fakeDestructiveResponse(req, "drop-tables", "GET");
}

export async function POST(req: NextRequest): Promise<Response> {
  return fakeDestructiveResponse(req, "drop-tables", "POST");
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
