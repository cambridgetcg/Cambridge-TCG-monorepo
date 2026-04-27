import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// PATCH — retry or dismiss a single row.
// Body: { action: "retry" | "dismiss" }
// retry: dead → pending, reset attempt_count, scheduled_for = NOW()
// dismiss: hard delete
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
