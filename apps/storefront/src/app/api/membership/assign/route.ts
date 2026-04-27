import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// POST — admin: manually assign a tier (for OG and special grants)
export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { email, tierName } = body;

  if (!email) return NextResponse.json({ error: "Email required." }, { status: 400 });
  if (!tierName) return NextResponse.json({ error: "Tier name required." }, { status: 400 });

  // Find tier
  const tierResult = await query(`SELECT id, name FROM tiers WHERE LOWER(name) = LOWER($1)`, [tierName]);
  if (tierResult.rows.length === 0) return NextResponse.json({ error: `Tier "${tierName}" not found.` }, { status: 404 });
  const tier = tierResult.rows[0];

  // Find or create user
  let userResult = await query(`SELECT id FROM users WHERE email = LOWER($1)`, [email]);
  let created = false;

  if (userResult.rows.length === 0) {
    userResult = await query(`INSERT INTO users (email) VALUES (LOWER($1)) RETURNING id`, [email]);
    created = true;
  }

  const userId = userResult.rows[0].id;

  // Assign tier with manual source (won't be overridden by recalculation)
  await query(
    `UPDATE users SET tier_id=$2, tier_source='manual', tier_calculated_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [userId, tier.id]
  );

  return NextResponse.json({
    email,
    tier: tier.name,
    userId,
    created,
    message: `${tier.name} tier assigned to ${email}${created ? " (new account created)" : ""}.`,
  });
}

// DELETE — admin: remove manual tier assignment (revert to spending-based)
export async function DELETE(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { email } = body;

  if (!email) return NextResponse.json({ error: "Email required." }, { status: 400 });

  await query(
    `UPDATE users SET tier_source='spending', tier_calculated_at=NULL, updated_at=NOW() WHERE email = LOWER($1)`,
    [email]
  );

  return NextResponse.json({ message: `Manual tier removed for ${email}. Will recalculate on next visit.` });
}
