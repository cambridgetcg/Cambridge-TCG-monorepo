import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { importSetMaster } from "@/lib/portfolio/sets";

// POST /api/admin/card-sets/import
//
// Idempotent. Body shape:
//   { setCode, setName, game, releasedAt?, coverImageUrl?,
//     cards: [{ card_number, sku, card_name, rarity?, image_url?, variant? }, ...] }
//
// In production this is called by a cron job that pulls from the
// wholesale catalogue. The endpoint exists so admins can also seed
// sets manually (e.g., promo cards not in the wholesale feed) and
// so seeding scripts have a single canonical entry point.
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const result = await importSetMaster(body);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json(result.value);
}
