import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { listAuctions, createAuction } from "@/lib/auction/db";
import type { CreateAuctionInput } from "@/lib/auction/types";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const status = url.searchParams.get("status") || undefined;
  const type = url.searchParams.get("type") || undefined;
  const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : undefined;
  const offset = url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!, 10) : undefined;

  const result = await listAuctions({ status, type, limit, offset });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as CreateAuctionInput;
    const auction = await createAuction(body);
    return NextResponse.json(auction, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create auction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
