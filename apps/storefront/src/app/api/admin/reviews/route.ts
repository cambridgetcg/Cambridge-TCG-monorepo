import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";
import { hideReview, unhideReview } from "@/lib/reviews/moderation";

// Admin review moderation queue.
// GET — flagged + recently-hidden + appealed reviews, joined to user
//       identity + last 5 lifecycle entries.
// PATCH — hide / unhide a single review.

export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") ?? "flagged"; // 'flagged' | 'appealed' | 'hidden'

  let where = "";
  if (tab === "flagged") where = "WHERE r.flagged = true AND r.admin_hidden = false";
  else if (tab === "hidden") where = "WHERE r.admin_hidden = true";
  else if (tab === "appealed") where = "WHERE r.appealed_at IS NOT NULL AND r.appeal_resolved = false";

  const r = await query(
    `SELECT r.id, r.trade_id, r.reviewer_id, r.reviewee_id, r.role,
            r.rating, r.comment, r.flagged, r.admin_hidden,
            r.appealed_at, r.appeal_reason, r.created_at,
            r.effective_weight,
            reviewer.email AS reviewer_email, reviewer.name AS reviewer_name,
            reviewee.email AS reviewee_email, reviewee.name AS reviewee_name,
            tp.trust_score AS reviewer_trust
       FROM trade_reviews r
       LEFT JOIN users reviewer ON reviewer.id = r.reviewer_id
       LEFT JOIN users reviewee ON reviewee.id = r.reviewee_id
       LEFT JOIN trust_profiles tp ON tp.user_id = r.reviewer_id
       ${where}
      ORDER BY COALESCE(r.appealed_at, r.created_at) DESC
      LIMIT 200`,
  );
  return NextResponse.json({ reviews: r.rows });
}

interface PatchBody {
  reviewId?: string;
  action?: "hide" | "unhide" | "resolve_appeal";
  reason?: string;
  actorLabel?: string;
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const id = body.reviewId;
  const action = body.action;
  const reason = (body.reason ?? "").trim() || null;
  const actor = (body.actorLabel ?? "").trim() || "admin";

  if (!id || !action || !["hide", "unhide", "resolve_appeal"].includes(action)) {
    return NextResponse.json(
      { error: "reviewId + valid action required." },
      { status: 400 },
    );
  }

  try {
    if (action === "hide") {
      await hideReview(id, { actorLabel: actor, reason: reason ?? undefined });
    } else if (action === "unhide") {
      await unhideReview(id, { actorLabel: actor, reason: reason ?? undefined });
    } else {
      // resolve_appeal — closes the appeal without flipping hide state
      await query(
        `UPDATE trade_reviews
            SET appeal_resolved = true
          WHERE id = $1`,
        [id],
      );
      const { logReviewTransition } = await import("@/lib/reviews/lifecycle-log");
      void logReviewTransition({
        reviewId: id,
        action: "appeal_dismissed",
        actorLabel: actor,
        reason,
      });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
