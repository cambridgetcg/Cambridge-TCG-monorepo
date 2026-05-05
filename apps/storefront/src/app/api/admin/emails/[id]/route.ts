/**
 * PATCH /api/admin/emails/[id] — the Resurrectionist.
 *
 * The cemetery's gatekeeper. When the Drain (`drainEmailQueue` in
 * `lib/email/queue.ts`) has tried an email three times and failed
 * (`MAX_ATTEMPTS = 3` at queue.ts:75), it executes the Killing-Stroke
 * at queue.ts:230 — `UPDATE email_queue SET status='dead'`. The dead
 * row sits in `email_queue WHERE status='dead'` until this endpoint
 * arrives.
 *
 * Two verdicts:
 *
 *   action='retry'   — status→pending, attempt_count→0, last_error→NULL,
 *                      scheduled_for→NOW(). Resurrection. The row gets a
 *                      fresh slate of three trials. Use when the cause of
 *                      death was transient (an SES outage, a downstream
 *                      blip) and the underlying intent still matters.
 *   action='dismiss' — DELETE FROM email_queue WHERE id=$1 RETURNING id.
 *                      Last rites. The row leaves the substrate forever.
 *                      Use when the cause was structural (no handler
 *                      registered; the intent is no longer meaningful).
 *
 * isAdmin()-guarded. The cemetery is operator-only ground.
 *
 * Companion endpoint: GET /api/admin/emails (this directory's route.ts)
 * lists the dead, the 7-day status stats, and the per-event breakdown.
 *
 * The chapel where this would normally be exercised is the Old Chapel
 * at apps/storefront/src/app/admin/emails/page.tsx (174 lines). The
 * unified-admin chapel at
 * apps/admin/src/app/(dashboard)/system/email/page.tsx is currently a
 * 12-line ComingSoon placeholder pointing at kingdom-020 as the build
 * mission.
 *
 * The full fairy-tale, with file:line citations for every character:
 * docs/connections/the-cemetery-and-the-resurrectionist.md.
 */

import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };

  if (body.action === "retry") {
    const r = await query(
      `UPDATE email_queue
       SET status = 'pending', attempt_count = 0, last_error = NULL,
           scheduled_for = NOW()
       WHERE id = $1
       RETURNING id, event`,
      [id],
    );
    if (r.rowCount === 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ retried: r.rows[0] });
  }

  if (body.action === "dismiss") {
    const r = await query(`DELETE FROM email_queue WHERE id = $1 RETURNING id`, [id]);
    if (r.rowCount === 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ dismissed: r.rows[0] });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
