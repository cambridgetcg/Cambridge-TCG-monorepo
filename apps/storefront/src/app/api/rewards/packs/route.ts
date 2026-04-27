import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// GET — list active packs
export async function GET() {
  const result = await query(
    `SELECT p.*, (SELECT COUNT(*) FROM reward_pack_pools WHERE pack_id=p.id) as pool_size
     FROM reward_packs p WHERE p.status='active' ORDER BY p.created_at DESC`
  );
  return NextResponse.json({ packs: result.rows });
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
