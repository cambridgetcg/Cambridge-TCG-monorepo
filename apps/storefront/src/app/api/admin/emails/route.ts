/**
 * GET /api/admin/emails — the Cemetery's roll.
 *
 * Three sections in one response:
 *
 *   `dead`       — up to 200 rows where status='dead', most-recent first
 *                  (ordered by last_attempt_at DESC NULLS LAST). Each
 *                  carries its `last_error` headstone.
 *   `stats7d`    — status histogram across the last 7 days (sent,
 *                  cancelled, dead, failed, pending). The shape of the
 *                  symphony, not just the cemetery.
 *   `byEvent7d`  — per-event volume across 7 days. Lets the operator
 *                  spot whether one Mourner is grieving louder than
 *                  the others — e.g., a sudden spike in
 *                  `streak_at_risk` may mean the underlying SES weather,
 *                  not the streak module itself.
 *
 * The breadth of this single response is intentional: the operator
 * does not page through three screens. They open the Cemetery and see
 * trends + corpses + roll-up at once. From here, sister endpoint
 * PATCH /api/admin/emails/[id] (the Resurrectionist) handles each
 * decision case-by-case.
 *
 * The full fairy-tale: docs/connections/the-cemetery-and-the-resurrectionist.md.
 */

import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

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
