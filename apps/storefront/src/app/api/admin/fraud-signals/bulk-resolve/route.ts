import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";
import { logAdminAction } from "@/lib/admin/governance-log";

// Bulk-resolve a set of fraud signals with one shared reason. Per-
// signal admin_actions_log row so the audit stays per-target.
//
// Pattern matches the bulk-ship endpoints from the prize/vault
// surfaces: same-shape input (array of ids + shared reason), per-
// item idempotency, single recompute per affected user.

interface RequestBody {
  signalIds?: string[];
  reason?: string;
  actorLabel?: string;
}

const MAX_BULK = 50;

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const ids = Array.isArray(body.signalIds) ? body.signalIds : [];
  const reason = (body.reason ?? "").trim();
  const actor = (body.actorLabel ?? "").trim() || "admin";

  if (ids.length === 0) {
    return NextResponse.json({ error: "signalIds required." }, { status: 400 });
  }
  if (ids.length > MAX_BULK) {
    return NextResponse.json(
      { error: `Maximum ${MAX_BULK} signals per bulk-resolve.` },
      { status: 400 },
    );
  }
  if (!reason) {
    return NextResponse.json(
      { error: "reason is required for bulk action." },
      { status: 400 },
    );
  }

  // Snapshot before-state for audit + recompute fan-out.
  const beforeRes = await query(
    `SELECT id, user_id, severity, resolved
       FROM fraud_signals
      WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  if (beforeRes.rows.length === 0) {
    return NextResponse.json({ error: "No signals found." }, { status: 404 });
  }

  await query(
    `UPDATE fraud_signals
        SET resolved = true,
            resolved_notes = $2
      WHERE id = ANY($1::uuid[])`,
    [ids, reason],
  );

  // Audit one row per signal — the bulk action is admin convenience,
  // not a single semantic event for the timeline.
  for (const before of beforeRes.rows) {
    void logAdminAction({
      actorLabel: actor,
      targetUserId: before.user_id,
      targetKind: "fraud_signal",
      targetId: before.id,
      action: "fraud.resolve",
      beforeValue: { severity: before.severity, resolved: before.resolved },
      afterValue: { severity: before.severity, resolved: true },
      reason,
      metadata: { bulk: true, batch_size: beforeRes.rows.length },
    });
  }

  // Recompute trust for each unique affected user (penalties drop
  // when signals resolve).
  const uniqueUsers = Array.from(new Set(beforeRes.rows.map((r) => r.user_id).filter(Boolean)));
  try {
    const { calculateTrustScore } = await import("@/lib/escrow/trust-engine");
    for (const uid of uniqueUsers) {
      void calculateTrustScore(uid).catch((err) =>
        console.error(`[fraud/bulk-resolve] recompute failed for ${uid}:`, err),
      );
    }
  } catch { /* import failure ignored */ }

  return NextResponse.json({
    ok: true,
    resolved: beforeRes.rows.length,
    affected_users: uniqueUsers.length,
  });
}
