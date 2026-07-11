import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createLot, listOwnLots, listPublicLots } from "@/lib/market/lots";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

// GET — browse public lot listings. Default: active lots, newest first.
// `scope=mine` is authenticated and derives the owner from the session. The
// old `seller=<uuid>` shape is accepted only as a temporary owner-view alias;
// its value is ignored and can never select another person's listings.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ownView = url.searchParams.get("scope") === "mine" || url.searchParams.has("seller");
  const rawStatus = url.searchParams.get("status");
  const status: "active" | "sold" | "cancelled" =
    rawStatus === "active" || rawStatus === "sold" || rawStatus === "cancelled"
      ? rawStatus
      : "active";
  const limit = parseInt(url.searchParams.get("limit") || "24", 10) || 24;
  const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;

  const filters = { status, limit, offset };
  if (ownView) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Sign in required." },
        { status: 401, headers: PRIVATE_NO_STORE },
      );
    }
    const { lots, total } = await listOwnLots(session.user.id, filters);
    return NextResponse.json({ lots, total }, { headers: PRIVATE_NO_STORE });
  }

  const { lots, total } = await listPublicLots(filters);
  return NextResponse.json({ lots, total });
}

// POST — create a lot (signed-in account, same gate as all P2P trading).
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to sell a lot." }, { status: 401 });
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
