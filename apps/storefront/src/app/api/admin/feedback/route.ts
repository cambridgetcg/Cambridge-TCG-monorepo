import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

const STATUSES = new Set(["received", "triaged", "patched", "wont-fix", "duplicate"]);
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status") ?? "open";
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 50, 1), 100);
  const offset = Math.max(Number(req.nextUrl.searchParams.get("offset")) || 0, 0);

  let where = "status IN ('received', 'triaged')";
  const params: unknown[] = [];
  if (status === "all") {
    where = "TRUE";
  } else if (STATUSES.has(status)) {
    params.push(status);
    where = `status = $${params.length}`;
  } else if (status !== "open") {
    return NextResponse.json({ error: "Unknown status filter." }, { status: 400 });
  }

  params.push(limit, offset);
  try {
    const [rows, counts] = await Promise.all([
      query(
        `SELECT id, feedback_id, kind, reporter_contact, raw_body, status,
                received_at, triaged_at, patched_at, closed_at, triaged_by,
                notes, commit_sha, reply_sent_at, duplicate_of_id,
                content_expires_at, content_redacted_at, lifecycle_expires_at
         FROM agent_feedback
         WHERE ${where}
         ORDER BY received_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      query(
        `SELECT status, count(*)::int AS n
         FROM agent_feedback
         GROUP BY status`,
      ),
    ]);

    return NextResponse.json(
      {
        feedback: rows.rows,
        counts: Object.fromEntries(counts.rows.map((row) => [row.status, row.n])),
        page: { limit, offset, returned: rows.rows.length },
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    console.error("[admin/feedback] list failed", {
      error_name: error instanceof Error ? error.name : "unknown",
      error_code:
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "unknown")
          : "unknown",
    });
    return NextResponse.json({ error: "Feedback inbox is unavailable." }, { status: 503 });
  }
}
