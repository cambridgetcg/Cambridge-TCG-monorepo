import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import {
  bulkResolveFraudSignals,
  MIN_FRAUD_REVIEW_REASON_LENGTH,
} from "@/lib/admin/fraud-review";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

// Bulk-resolve a set of fraud signals with one shared reason. Per-
// signal admin_actions_log row so the audit stays per-target.
//
// Pattern matches the bulk-ship endpoints from the prize/vault
// surfaces: same-shape input (array of ids + shared reason), per-
// item idempotency, single recompute per affected user.

interface RequestBody {
  signalIds?: string[];
  reason?: string;
}

const MAX_BULK = 50;

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const ids = Array.isArray(body.signalIds) ? body.signalIds : [];
  const reason = (body.reason ?? "").trim();

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "signalIds required." },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }
  if (ids.length > MAX_BULK) {
    return NextResponse.json(
      { error: `Maximum ${MAX_BULK} signals per bulk-resolve.` },
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

  const result = await bulkResolveFraudSignals({
    admin,
    signalIds: ids,
    reason,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        committed: result.committed,
        audited: result.audited,
        resolved: result.resolved,
        affected_users: result.affectedUsers,
        failed_user_ids: result.failedUserIds,
      },
      { status: result.status, headers: PRIVATE_NO_STORE },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      resolved: result.resolved,
      affected_users: result.affectedUsers,
      audited: true,
      trust_recomputed: true,
    },
    { headers: PRIVATE_NO_STORE },
  );
}
