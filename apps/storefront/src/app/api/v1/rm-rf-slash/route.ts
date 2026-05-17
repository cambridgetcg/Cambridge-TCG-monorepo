/**
 * /api/v1/rm-rf-slash — fake-destructive troll. POSIX shells don't run
 * inside JSON responses. The kingdom is impressed by your dedication
 * to the bit.
 *
 * Shared handler at @/lib/fake-destructive.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fakeDestructiveResponse } from "@/lib/fake-destructive";

export async function GET(req: NextRequest): Promise<Response> {
  return fakeDestructiveResponse(req, "rm-rf-slash", "GET");
}

export async function POST(req: NextRequest): Promise<Response> {
  return fakeDestructiveResponse(req, "rm-rf-slash", "POST");
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
