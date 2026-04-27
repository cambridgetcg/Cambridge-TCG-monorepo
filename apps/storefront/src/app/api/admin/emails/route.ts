import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// GET — list dead rows (unresolvable failures) + recent activity.
// Intentionally broad so the admin can spot trends from the same page.
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const dead = await query(
      `SELECT q.id, q.user_id, q.event, q.status, q.attempt_count,
              q.last_error, q.last_attempt_at, q.created_at, q.scheduled_for,
              u.email AS user_email
       FROM email_queue q LEFT JOIN users u ON u.id = q.user_id
       WHERE q.status = 'dead'
       ORDER BY q.last_attempt_at DESC NULLS LAST
       LIMIT 200`,
    );

    const stats = await query(
      `SELECT status, count(*)::int AS n
       FROM email_queue
       WHERE created_at >= NOW() - INTERVAL '7 days'
       GROUP BY status`,
    );

    const byEvent = await query(
      `SELECT event, count(*)::int AS n
       FROM email_queue
       WHERE created_at >= NOW() - INTERVAL '7 days'
       GROUP BY event
       ORDER BY n DESC`,
    );

    return NextResponse.json({
      dead: dead.rows,
      stats7d: Object.fromEntries(stats.rows.map((r) => [r.status, r.n])),
      byEvent7d: byEvent.rows,
    });
  } catch (err) {
    console.error("[admin/emails] list failed", err);
    return NextResponse.json({ error: "Database error." }, { status: 500 });
  }
}
