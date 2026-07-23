import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// GET — list active packs
export async function GET() {
  const result = await query(
    `SELECT p.*, (SELECT COUNT(*) FROM reward_pack_pools WHERE pack_id=p.id) as pool_size
     FROM reward_packs p WHERE p.status='active' ORDER BY p.created_at DESC`
  );
  const packs = result.rows as ({ id: string; pull_rates?: { rarity: string; odds: number }[] })[];

  // Pull rates are disclosed, not hidden. Aggregate each pack's pool by rarity
  // and normalize to a fraction of the whole so the shown odds match the real
  // weighted draw (the open route normalizes by the same per-pack total).
  if (packs.length > 0) {
    const oddsResult = await query(
      `SELECT pack_id, rarity, SUM(probability) AS weight
         FROM reward_pack_pools
        WHERE pack_id = ANY($1)
        GROUP BY pack_id, rarity`,
      [packs.map((p) => p.id)]
    );
    const byPack = new Map<string, { rarity: string; weight: number }[]>();
    for (const row of oddsResult.rows as { pack_id: string; rarity: string; weight: string }[]) {
      const list = byPack.get(row.pack_id) ?? [];
      list.push({ rarity: row.rarity, weight: parseFloat(row.weight) });
      byPack.set(row.pack_id, list);
    }
    for (const pack of packs) {
      const list = byPack.get(pack.id) ?? [];
      const total = list.reduce((s, r) => s + r.weight, 0) || 1;
      pack.pull_rates = list
        .map((r) => ({ rarity: r.rarity, odds: r.weight / total }))
        .sort((a, b) => b.odds - a.odds);
    }
  }

  return NextResponse.json({ packs });
}

// POST — admin: create pack
export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const result = await query(
    `INSERT INTO reward_packs (title, description, set_code, image_url, cost_points)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [body.title, body.description, body.set_code, body.image_url, body.cost_points || 1500]
  );
  return NextResponse.json({ pack: result.rows[0] });
}
