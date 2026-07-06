import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { listAuctions, createAuction } from "@/lib/auction/db";
import { resolveCatalogCard } from "@/lib/market/db";
import { isAuctionCondition, AUCTION_CONDITIONS, type CreateAuctionInput } from "@/lib/auction/types";

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

    // Card identity — resolve any provided SKU (or bare card number) to a
    // canonical catalog SKU (server-owned, never client-trusted), and
    // require a valid condition alongside it, so the auction carries real
    // identity. Optional on this admin path for backwards-compatibility;
    // the seller path (/api/auctions/my) requires it.
    if (typeof body.sku === "string" && body.sku.trim() !== "") {
      const resolved = await resolveCatalogCard(body.sku);
      if (!resolved.ok) {
        return NextResponse.json(
          { error: resolved.reason, suggestions: resolved.suggestions },
          { status: 400 },
        );
      }
      if (!isAuctionCondition(body.condition)) {
        return NextResponse.json(
          { error: `condition is required with a sku and must be one of: ${AUCTION_CONDITIONS.join(", ")}.`, allowed: AUCTION_CONDITIONS },
          { status: 400 },
        );
      }
      body.sku = resolved.card.sku;
    } else {
      body.sku = undefined;
      body.condition = undefined;
    }

    const auction = await createAuction(body);
    return NextResponse.json(auction, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create auction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
