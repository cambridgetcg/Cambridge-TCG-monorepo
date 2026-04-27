import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// Admin support view of pull-token grant history. Filters by user
// (email substring) and/or source. Used to answer "where did this token
// come from?" tickets and to spot abnormal grant patterns.

export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const emailFilter = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const sourceFilter = (url.searchParams.get("source") ?? "").trim();
  const limit = Math.min(500, Math.max(20, parseInt(url.searchParams.get("limit") ?? "200", 10)));

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (emailFilter) {
    params.push(`%${emailFilter}%`);
    conditions.push(`LOWER(u.email) LIKE $${params.length}`);
  }
  if (sourceFilter) {
    params.push(sourceFilter);
    conditions.push(`g.source = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await query(
      `SELECT g.id, g.user_id, g.tier, g.count, g.source, g.source_reference_id,
              g.description, g.granted_at,
              u.email AS user_email, u.name AS user_name
         FROM bounty_token_grants g
         LEFT JOIN users u ON u.id = g.user_id
         ${where}
        ORDER BY g.granted_at DESC
        LIMIT ${limit}`,
      params,
    );

    // Headline counts grouped by source — useful for the operator
    // glancing at the page to see what's normal vs. spiking.
    const summary = await query(
      `SELECT source, COUNT(*)::int AS grants, SUM(count)::int AS tokens
         FROM bounty_token_grants
        WHERE granted_at >= NOW() - INTERVAL '7 days'
        GROUP BY source
        ORDER BY tokens DESC`,
    );

    return NextResponse.json({ grants: result.rows, summary: summary.rows });
  } catch (err) {
    console.error("[admin/bounty/grants] list failed", err);
    return NextResponse.json({ error: "Database error." }, { status: 500 });
  }
}
