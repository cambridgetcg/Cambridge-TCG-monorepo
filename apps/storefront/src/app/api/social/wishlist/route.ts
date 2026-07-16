import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWishlist, addToWishlist, removeFromWishlist, setWishlistOpenToTrade } from "@/lib/social/db";
import { enrichWishlist } from "@/lib/wishlist/availability";

// GET /api/social/wishlist[?enrich=1] — returns the caller's wishlist.
// When ?enrich=1 is set, each item gets an `availability` field with the
// cheapest eligible P2P ask + current wholesale spot. Kept optional so the
// public profile page doesn't pay wholesale lookups for every viewer.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const url = new URL(request.url);
  const enrich = url.searchParams.get("enrich") === "1";

  const wishlist = await getWishlist(session.user.id);
  if (!enrich || wishlist.length === 0) {
    return NextResponse.json({ wishlist });
  }

  const availability = await enrichWishlist(
    wishlist.map((w) => ({ id: w.id, sku: w.sku, max_price: w.max_price, condition_min: w.condition_min })),
  );
  const enriched = wishlist.map((w) => ({
    ...w,
    availability: availability.get(w.id) ?? null,
  }));
  return NextResponse.json({ wishlist: enriched });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json();
  if (typeof body.cardName !== "string" || !body.cardName.trim()) {
    return NextResponse.json({ error: "Card name required." }, { status: 400 });
  }
  // Coerce the optional fields so a non-string (or a non-numeric max price)
  // can't reach the SQL helper and throw a 500 — e.g. maxPrice.toFixed().
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  let maxPrice: number | undefined;
  if (body.maxPrice !== undefined && body.maxPrice !== null && body.maxPrice !== "") {
    const n = Number(body.maxPrice);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "Max price must be a non-negative number." }, { status: 400 });
    }
    maxPrice = n;
  }

  const item = await addToWishlist(session.user.id, {
    sku: str(body.sku),
    cardName: body.cardName.trim(),
    cardNumber: str(body.cardNumber),
    setCode: str(body.setCode),
    setName: str(body.setName),
    imageUrl: str(body.imageUrl),
    maxPrice,
    conditionMin: str(body.conditionMin),
    notes: str(body.notes),
  });

  return NextResponse.json({ item });
}

// PATCH — toggle a wishlist item's explicit "open to trade for" intent, the
// only thing that makes a wish visible for matching (and only to members who
// actually hold that card).
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json();
  const itemId = typeof body.itemId === "string" ? body.itemId : null;
  const open = typeof body.open_to_trade === "boolean" ? body.open_to_trade : null;
  if (!itemId || open === null) {
    return NextResponse.json({ error: "itemId and open_to_trade required." }, { status: 400 });
  }

  await setWishlistOpenToTrade(session.user.id, itemId, open);
  return NextResponse.json({ updated: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { itemId } = await request.json();
  if (typeof itemId !== "string" || !itemId) {
    return NextResponse.json({ error: "itemId required." }, { status: 400 });
  }
  await removeFromWishlist(session.user.id, itemId);
  return NextResponse.json({ removed: true });
}
