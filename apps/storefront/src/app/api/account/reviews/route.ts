import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { appealReview } from "@/lib/reviews/moderation";

// Customer-facing reviews endpoint.
//
// GET — both sides: reviews ABOUT me (received) + reviews I've left
//       about others (given). Hidden + appealed status surfaced so
//       the user can see their own moderation state.
//
// POST — file an appeal on a hidden review I'm the subject of.
//        Body: { reviewId, reason }
//
// PATCH — withdraw publication for a review I wrote. This route deliberately
//         exposes no inverse action: it can only change true to false.
//         Body: { reviewId, action: "unpublish" }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const userId = session.user.id;

  const [received, given] = await Promise.all([
    query(
      `SELECT r.id, r.trade_id, r.role, r.rating, r.comment,
              r.is_public, r.admin_hidden, r.flagged, r.appealed_at, r.appeal_resolved,
              r.effective_weight, r.created_at,
              reviewer.name AS reviewer_name, reviewer.username AS reviewer_username
         FROM trade_reviews r
         LEFT JOIN users reviewer ON reviewer.id = r.reviewer_id
        WHERE r.reviewee_id = $1
        ORDER BY r.created_at DESC
        LIMIT 100`,
      [userId],
    ),
    query(
      `SELECT r.id, r.trade_id, r.role, r.rating, r.comment,
              r.is_public, r.admin_hidden, r.flagged, r.created_at,
              reviewee.name AS reviewee_name, reviewee.username AS reviewee_username
         FROM trade_reviews r
         LEFT JOIN users reviewee ON reviewee.id = r.reviewee_id
        WHERE r.reviewer_id = $1
        ORDER BY r.created_at DESC
        LIMIT 100`,
      [userId],
    ),
  ]);

  return NextResponse.json({
    received: received.rows,
    given: given.rows,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { reviewId?: string; reason?: string };
  const reviewId = body.reviewId;
  const reason = (body.reason ?? "").trim();
  if (!reviewId || reason.length < 10) {
    return NextResponse.json(
      { error: "reviewId + reason (min 10 chars) required." },
      { status: 400 },
    );
  }
  try {
    await appealReview(reviewId, session.user.id, reason);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Appeal failed" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    reviewId?: string;
    action?: string;
  };
  if (!body.reviewId || !UUID_RE.test(body.reviewId) || body.action !== "unpublish") {
    return NextResponse.json(
      { error: 'A valid reviewId and action "unpublish" are required.' },
      { status: 400 },
    );
  }

  const result = await query(
    `UPDATE trade_reviews
        SET is_public = FALSE
      WHERE id = $1
        AND reviewer_id = $2
        AND is_public = TRUE
      RETURNING id, is_public`,
    [body.reviewId, session.user.id],
  );

  if (result.rows.length === 0) {
    return NextResponse.json(
      { error: "Review not found, not yours, or already private." },
      { status: 404 },
    );
  }

  const { logReviewTransition } = await import("@/lib/reviews/lifecycle-log");
  await logReviewTransition({
    reviewId: body.reviewId,
    action: "unpublished",
    actorId: session.user.id,
    reason: "Reviewer withdrew public display",
    metadata: { is_public: false },
  });

  return NextResponse.json({ ok: true, reviewId: body.reviewId, is_public: false });
}
