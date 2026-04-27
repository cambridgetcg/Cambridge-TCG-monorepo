import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isUserVerified } from "@/lib/trust/db";
import { createLot, listLots } from "@/lib/market/lots";

// GET — browse public lot listings. Default: active lots, newest first.
// Query params: seller=<userId> (own/user-specific), status, limit, offset.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sellerId = url.searchParams.get("seller") || undefined;
  const rawStatus = url.searchParams.get("status");
  const status =
    rawStatus === "active" || rawStatus === "sold" || rawStatus === "cancelled"
      ? rawStatus
      : "active";
  const limit = parseInt(url.searchParams.get("limit") || "24", 10) || 24;
  const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;

  const { lots, total } = await listLots({ sellerId, status, limit, offset });
  return NextResponse.json({ lots, total });
}

// POST — create a lot (auth + UK verified, same gate as P2P trading).
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to sell a lot." }, { status: 401 });
  }
  if (!(await isUserVerified(session.user.id))) {
    return NextResponse.json(
      { error: "UK verification required to sell lots.", code: "VERIFICATION_REQUIRED" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const title = (body.title as string | undefined)?.trim();
  const price = typeof body.price === "number" ? body.price : null;
  const items: Array<{ sku: string; cardName?: string; quantity: number }> =
    Array.isArray(body.items) ? body.items : [];

  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });
  if (!price || price <= 0) return NextResponse.json({ error: "Price must be positive" }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ error: "At least one item required" }, { status: 400 });
  for (const item of items) {
    if (!item.sku) return NextResponse.json({ error: "Each item needs a sku" }, { status: 400 });
  }

  try {
    const lot = await createLot({
      sellerId: session.user.id,
      title,
      description: (body.description as string | undefined)?.trim(),
      price,
      imageUrl: (body.imageUrl as string | undefined)?.trim(),
      items,
    });
    return NextResponse.json({ lot }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create lot";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
