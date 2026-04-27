import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";
import { logExternalRepTransition } from "@/lib/external-rep/lifecycle-log";

// Admin triage for external-rep entries that the cron's re-check flagged
// as failed (failed_check_count > 0) OR are still verified but suspicious.
// PATCH lets admin override (force re-verify, drop to unverified, mark
// as legitimate failure).

export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") ?? "failing";

  let where: string;
  if (tab === "failing") {
    where = "WHERE er.failed_check_count > 0 AND er.verified = true";
  } else if (tab === "downgraded") {
    where = "WHERE er.failed_check_count >= 3 AND er.verified = false";
  } else if (tab === "all_verified") {
    where = "WHERE er.verified = true";
  } else {
    where = "WHERE er.verified = false AND er.verification_code IS NOT NULL";
  }

  const r = await query(
    `SELECT er.id, er.user_id, er.platform, er.username, er.profile_url,
            er.verified, er.verified_at, er.last_check_at, er.decay_at,
            er.failed_check_count, er.created_at,
            u.email AS user_email, u.name AS user_name,
            tp.trust_score
       FROM external_reputation er
       LEFT JOIN users u ON u.id = er.user_id
       LEFT JOIN trust_profiles tp ON tp.user_id = er.user_id
       ${where}
      ORDER BY
        er.failed_check_count DESC,
        er.last_check_at DESC NULLS LAST
      LIMIT 200`,
  );
  return NextResponse.json({ entries: r.rows });
}

interface PatchBody {
  repId?: string;
  action?: "force_recheck" | "drop_verified" | "mark_legitimate";
  reason?: string;
  actorLabel?: string;
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const id = body.repId;
  const action = body.action;
  const reason = (body.reason ?? "").trim() || null;
  const actor = (body.actorLabel ?? "").trim() || "admin";

  if (!id || !action || !["force_recheck", "drop_verified", "mark_legitimate"].includes(action)) {
    return NextResponse.json(
      { error: "repId + valid action required." },
      { status: 400 },
    );
  }

  const repRes = await query(
    `SELECT user_id, verified FROM external_reputation WHERE id = $1`,
    [id],
  );
  if (repRes.rows.length === 0) {
    return NextResponse.json({ error: "Rep entry not found." }, { status: 404 });
  }
  const userId: string = repRes.rows[0].user_id;

  if (action === "force_recheck") {
    const { runVerificationCheck } = await import("@/lib/external-rep/verify");
    const result = await runVerificationCheck(id, { isReverify: true, actorLabel: actor });
    void logExternalRepTransition({
      repId: id,
      action: "admin_override",
      actorLabel: actor,
      reason: `Admin force-recheck: ${result.ok ? "succeeded" : `failed — ${result.message}`}`,
    });
    return NextResponse.json({ ok: true, result });
  }

  if (action === "drop_verified") {
    await query(
      `UPDATE external_reputation
          SET verified = false, decay_at = NULL, failed_check_count = 0
        WHERE id = $1`,
      [id],
    );
    void logExternalRepTransition({
      repId: id,
      action: "admin_override",
      actorLabel: actor,
      reason: reason ?? "Admin dropped verified flag",
    });
    try {
      const { calculateTrustScore } = await import("@/lib/escrow/trust-engine");
      void calculateTrustScore(userId).catch(() => { /* ignore */ });
    } catch { /* ignore */ }
    return NextResponse.json({ ok: true });
  }

  // mark_legitimate — admin asserts the failed checks are a false positive
  // (e.g. eBay rate-limited us); reset the count so cron stops alerting.
  await query(
    `UPDATE external_reputation SET failed_check_count = 0 WHERE id = $1`,
    [id],
  );
  void logExternalRepTransition({
    repId: id,
    action: "admin_override",
    actorLabel: actor,
    reason: reason ?? "Admin marked failed checks as legitimate (false positives)",
  });
  return NextResponse.json({ ok: true });
}
