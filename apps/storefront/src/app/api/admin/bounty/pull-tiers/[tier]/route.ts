import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// PATCH — update enabled / weekly_global_cap for a tier.
// Only these two knobs are exposed via UI; rarity_weights remain
// SQL-console-only until we have a safer JSON editor.
export async function PATCH(request: Request, { params }: { params: Promise<{ tier: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tier } = await params;

  const body = (await request.json().catch(() => ({}))) as {
    enabled?: boolean;
    weekly_global_cap?: number | null;
  };

  const setters: string[] = [];
  const values: unknown[] = [tier];

  if (typeof body.enabled === "boolean") {
    values.push(body.enabled);
    setters.push(`enabled = $${values.length}`);
  }
  if (body.weekly_global_cap === null) {
    setters.push(`weekly_global_cap = NULL`);
  } else if (typeof body.weekly_global_cap === "number") {
    if (body.weekly_global_cap < 0 || !Number.isFinite(body.weekly_global_cap)) {
      return NextResponse.json({ error: "weekly_global_cap must be >= 0" }, { status: 400 });
    }
    values.push(Math.floor(body.weekly_global_cap));
    setters.push(`weekly_global_cap = $${values.length}`);
  }

  if (setters.length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  setters.push(`updated_at = NOW()`);

  try {
    const result = await query(
      `UPDATE bounty_pull_tiers SET ${setters.join(", ")} WHERE tier = $1 RETURNING *`,
      values,
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Tier not found." }, { status: 404 });
    }
    return NextResponse.json({ tier: result.rows[0] });
  } catch (err) {
    console.error(`[admin/bounty/pull-tiers] PATCH ${tier} failed`, err);
    return NextResponse.json({ error: "Database error." }, { status: 500 });
  }
}
