import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";
import { logChargebackTransition } from "@/lib/payments/chargeback-log";
import { logAdminAction } from "@/lib/admin/governance-log";

// Admin chargebacks triage queue.
// GET — open + recently-resolved disputes joined to user identity.
// PATCH — admin override (mark as resolved, add note).

// Terminal statuses inlined in queries below: won | lost |
// warning_closed | charge_refunded.

export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") ?? "open"; // 'open' | 'all'

  const where = tab === "open"
    ? `WHERE c.stripe_status NOT IN ('won', 'lost', 'warning_closed', 'charge_refunded')`
    : "";

  const r = await query(
    `SELECT c.stripe_dispute_id, c.stripe_payment_intent, c.user_id, c.order_id,
            c.amount_gbp, c.currency, c.stripe_status, c.stripe_reason,
            c.evidence_due_at, c.fraud_emitted, c.created_at, c.updated_at,
            u.email AS user_email, u.name AS user_name,
            tp.trust_score, tp.is_suspended,
            co.customer_email AS order_email
       FROM chargebacks c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN trust_profiles tp ON tp.user_id = c.user_id
       LEFT JOIN customer_orders co ON co.id = c.order_id
       ${where}
      ORDER BY
        CASE WHEN c.stripe_status IN ('needs_response', 'warning_needs_response') THEN 0 ELSE 1 END,
        c.evidence_due_at NULLS LAST,
        c.created_at DESC
      LIMIT 200`,
  );
  return NextResponse.json({ chargebacks: r.rows });
}

interface PatchBody {
  stripeDisputeId?: string;
  action?: "annotate" | "force_resolve";
  reason?: string;
  actorLabel?: string;
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const id = body.stripeDisputeId;
  const action = body.action;
  const reason = (body.reason ?? "").trim() || null;
  const actor = (body.actorLabel ?? "").trim() || "admin";

  if (!id || !action || !["annotate", "force_resolve"].includes(action)) {
    return NextResponse.json({ error: "stripeDisputeId + valid action required." }, { status: 400 });
  }

  const beforeRes = await query(
    `SELECT user_id, stripe_status FROM chargebacks WHERE stripe_dispute_id = $1`,
    [id],
  );
  if (beforeRes.rows.length === 0) {
    return NextResponse.json({ error: "Chargeback not found." }, { status: 404 });
  }
  const before = beforeRes.rows[0];

  if (action === "force_resolve") {
    // Admin overrides Stripe state to a terminal value (e.g. an
    // edge-case dispute that needs manual closure in our records).
    // Doesn't push back to Stripe — just our reconciliation truth.
    await query(
      `UPDATE chargebacks SET stripe_status = 'admin_resolved', updated_at = NOW()
        WHERE stripe_dispute_id = $1`,
      [id],
    );
    void logChargebackTransition({
      stripeDisputeId: id,
      action: "admin_override",
      actorLabel: actor,
      reason: reason ?? "Admin marked resolved without Stripe-side state change",
    });
  } else {
    // annotate — pure note for the lifecycle log
    void logChargebackTransition({
      stripeDisputeId: id,
      action: "admin_override",
      actorLabel: actor,
      reason: reason ?? "Annotation",
    });
  }

  // Governance log entry too — admin actions on payment events should
  // be visible from /admin/governance alongside trust + fraud actions.
  void logAdminAction({
    actorLabel: actor,
    targetUserId: before.user_id,
    targetKind: "chargeback",
    targetId: id,
    action: `chargeback.${action}`,
    beforeValue: { stripe_status: before.stripe_status },
    afterValue: action === "force_resolve" ? { stripe_status: "admin_resolved" } : null,
    reason,
  });

  return NextResponse.json({ ok: true });
}
