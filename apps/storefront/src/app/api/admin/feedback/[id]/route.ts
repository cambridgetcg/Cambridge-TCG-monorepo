import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

const ACTIONS = new Set(["triaged", "patched", "wont-fix"]);

interface UpdateBody {
  status?: string;
  notes?: string;
  commit_sha?: string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  // Accept legacy 12-hex references and the current 16-hex format.
  if (!/^fb_[a-f0-9]{12,16}$/.test(id)) {
    return NextResponse.json({ error: "Invalid feedback id." }, { status: 400 });
  }

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (!body.status || !ACTIONS.has(body.status)) {
    return NextResponse.json({ error: "status must be triaged, patched, or wont-fix." }, { status: 400 });
  }
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2_000) : "";
  const commitSha = typeof body.commit_sha === "string" ? body.commit_sha.trim() : "";
  if (body.status === "patched" && !/^[a-f0-9]{7,40}$/i.test(commitSha)) {
    return NextResponse.json({ error: "A 7–40 character commit SHA is required for patched." }, { status: 400 });
  }
  if (body.status === "wont-fix" && !notes) {
    return NextResponse.json({ error: "A reason is required when closing without a change." }, { status: 400 });
  }

  try {
    const result = await query(
      `UPDATE agent_feedback
       SET status = $2,
           notes = CASE
             WHEN content_redacted_at IS NULL THEN NULLIF($3, '')
             ELSE NULL
           END,
           commit_sha = CASE WHEN $2 = 'patched' THEN $4 ELSE commit_sha END,
           triaged_at = COALESCE(triaged_at, NOW()),
           triaged_by = CASE
             WHEN content_redacted_at IS NULL THEN COALESCE(triaged_by, $5)
             ELSE NULL
           END,
           patched_at = CASE WHEN $2 = 'patched' THEN NOW() ELSE patched_at END,
           closed_at = CASE WHEN $2 IN ('patched', 'wont-fix') THEN NOW() ELSE NULL END
       WHERE feedback_id = $1
       RETURNING feedback_id, status, triaged_at, patched_at, closed_at, notes, commit_sha`,
      [id, body.status, notes, commitSha || null, `admin:${admin.id}`],
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
    }
    return NextResponse.json(
      { feedback: result.rows[0] },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    console.error("[admin/feedback] update failed", {
      feedback_id: id,
      error_name: error instanceof Error ? error.name : "unknown",
      error_code:
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "unknown")
          : "unknown",
    });
    return NextResponse.json({ error: "Feedback could not be updated." }, { status: 503 });
  }
}
