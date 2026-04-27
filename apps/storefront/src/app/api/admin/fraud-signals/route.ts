import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";
import { logAdminAction } from "@/lib/admin/governance-log";

// Admin fraud-signals triage endpoint.
//
// GET — open + recently-resolved signals, joined to user identity for
// the queue. Filterable by severity / signal_type via query params.
//
// PATCH — resolve / escalate / dismiss a single signal. Always logs
// to admin_actions_log so the action has a permanent trail.
//
// POST /bulk-resolve — bulk mark a set of signal ids as resolved with
// one shared reason; per-signal log row each.

export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const severity = url.searchParams.get("severity");
  const signalType = url.searchParams.get("signal_type");
  const showResolved = url.searchParams.get("resolved") === "1";

  const params: unknown[] = [];
  const conds: string[] = [];
  if (!showResolved) conds.push("s.resolved = false");
  if (severity) {
    params.push(severity);
    conds.push(`s.severity = $${params.length}`);
  }
  if (signalType) {
    params.push(signalType);
    conds.push(`s.signal_type = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const r = await query(
    `SELECT s.id, s.user_id, s.signal_type, s.severity, s.description,
            s.auto_action, s.resolved, s.resolved_notes, s.notified_at,
            s.created_at,
            u.email AS user_email, u.name AS user_name,
            tp.trust_score, tp.is_suspended
       FROM fraud_signals s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN trust_profiles tp ON tp.user_id = s.user_id
       ${where}
      ORDER BY
        CASE s.severity
          WHEN 'critical' THEN 0
          WHEN 'high'     THEN 1
          WHEN 'medium'   THEN 2
          WHEN 'low'      THEN 3
        END,
        s.created_at DESC
      LIMIT 200`,
    params,
  );

  return NextResponse.json({ signals: r.rows });
}

interface PatchBody {
  signalId?: string;
  action?: "resolve" | "escalate" | "dismiss";
  reason?: string;
  actorLabel?: string;
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const id = body.signalId;
  const action = body.action;
  const reason = (body.reason ?? "").trim() || null;
  const actor = (body.actorLabel ?? "").trim() || "admin";

  if (!id || !action || !["resolve", "escalate", "dismiss"].includes(action)) {
    return NextResponse.json({ error: "signalId + valid action required." }, { status: 400 });
  }

  const beforeRes = await query(
    `SELECT severity, resolved, resolved_notes, user_id FROM fraud_signals WHERE id = $1`,
    [id],
  );
  if (beforeRes.rows.length === 0) {
    return NextResponse.json({ error: "Signal not found." }, { status: 404 });
  }
  const before = beforeRes.rows[0];

  let updateSql: string;
  let updateParams: unknown[];

  if (action === "resolve" || action === "dismiss") {
    updateSql = `UPDATE fraud_signals
                    SET resolved = true,
                        resolved_notes = $2
                  WHERE id = $1
                  RETURNING *`;
    updateParams = [id, reason ?? `${action} by ${actor}`];
  } else {
    // escalate — bump severity one rung if possible
    const next: Record<string, string> = {
      low: "medium", medium: "high", high: "critical", critical: "critical",
    };
    updateSql = `UPDATE fraud_signals
                    SET severity = $2,
                        resolved_notes = COALESCE($3, resolved_notes)
                  WHERE id = $1
                  RETURNING *`;
    updateParams = [id, next[before.severity] ?? "high", reason];
  }

  const updated = await query(updateSql, updateParams);
  const after = updated.rows[0];

  await logAdminAction({
    actorLabel: actor,
    targetUserId: before.user_id,
    targetKind: "fraud_signal",
    targetId: id,
    action: `fraud.${action}`,
    beforeValue: { severity: before.severity, resolved: before.resolved },
    afterValue: { severity: after.severity, resolved: after.resolved },
    reason,
  });

  // If we resolved/dismissed a signal, recompute the user's trust
  // score so the dropped penalty flows through immediately.
  if (action !== "escalate" && before.user_id) {
    try {
      const { calculateTrustScore } = await import("@/lib/escrow/trust-engine");
      void calculateTrustScore(before.user_id).catch((err) =>
        console.error("[fraud/triage] trust recompute failed:", err),
      );
    } catch { /* import failure ignored */ }
  }

  return NextResponse.json({ ok: true, signal: after });
}
