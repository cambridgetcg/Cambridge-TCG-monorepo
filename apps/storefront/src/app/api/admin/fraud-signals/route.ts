import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import {
  MIN_FRAUD_REVIEW_REASON_LENGTH,
  reviewFraudSignal,
  type FraudReviewAction,
} from "@/lib/admin/fraud-review";
import { query } from "@/lib/db";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

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
  if (!(await requireAdmin())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
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

  return NextResponse.json({ signals: r.rows }, { headers: PRIVATE_NO_STORE });
}

interface PatchBody {
  signalId?: string;
  action?: FraudReviewAction;
  reason?: string;
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  }
  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const id = body.signalId;
  const action = body.action;
  const reason = (body.reason ?? "").trim();

  if (!id || !action || !["resolve", "escalate", "dismiss"].includes(action)) {
    return NextResponse.json(
      { error: "signalId + valid action required." },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }
  if (reason.length < MIN_FRAUD_REVIEW_REASON_LENGTH) {
    return NextResponse.json(
      {
        error: `A human review reason of at least ${MIN_FRAUD_REVIEW_REASON_LENGTH} characters is required.`,
      },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  const result = await reviewFraudSignal({
    admin,
    signalId: id,
    action,
    reason,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        committed: result.committed,
        audited: result.audited,
        signal: result.signal,
        failed_user_ids: result.failedUserIds,
      },
      { status: result.status, headers: PRIVATE_NO_STORE },
    );
  }

  return NextResponse.json(
    { ok: true, signal: result.signal, audited: true, trust_recomputed: true },
    { headers: PRIVATE_NO_STORE },
  );
}
