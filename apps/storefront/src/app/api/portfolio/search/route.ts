import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchPrices } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";

// GET — search catalog to add cards to portfolio
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const game = url.searchParams.get("game") || "one-piece";

  if (!q.trim() || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const data = await fetchPrices({ game, q: q.trim(), limit: 20 });
    const results = data.items.map((item) => ({
      sku: item.sku,
      card_name: item.name_en || item.name || item.card_number,
      card_number: item.card_number,
      set_code: item.set_code,
      set_name: item.set_name,
      image_url: item.image_url,
      rarity: item.rarity,
      price: retailPrice(item.price_gbp, item.channel_price),
      stock: item.stock,
    }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
