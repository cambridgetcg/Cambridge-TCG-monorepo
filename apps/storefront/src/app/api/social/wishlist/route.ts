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
  if (!body.cardName?.trim()) return NextResponse.json({ error: "Card name required." }, { status: 400 });

  const item = await addToWishlist(session.user.id, {
    sku: body.sku,
    cardName: body.cardName.trim(),
    cardNumber: body.cardNumber,
    setCode: body.setCode,
    setName: body.setName,
    imageUrl: body.imageUrl,
    maxPrice: body.maxPrice,
    conditionMin: body.conditionMin,
    notes: body.notes,
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
  await removeFromWishlist(session.user.id, itemId);
  return NextResponse.json({ removed: true });
}
