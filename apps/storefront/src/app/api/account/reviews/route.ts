import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { appealReview } from "@/lib/reviews/moderation";
import { PERSON_PUBLICATION_NOTICE_VERSION } from "@/lib/social/publication";

// Customer-facing reviews endpoint.
//
// GET — both sides: reviews ABOUT me (received) + reviews I've left
//       about others (given). Hidden + appealed status surfaced so
//       the user can see their own moderation state.
//
// POST — file an appeal on a hidden review I'm the subject of.
//        Body: { reviewId, reason }

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const userId = session.user.id;

  const [received, given] = await Promise.all([
    query(
      `SELECT r.id, r.trade_id, r.role, r.rating, r.comment,
              (r.is_public
               AND r.publication_notice_version=$2
               AND r.published_at IS NOT NULL) AS is_public,
              r.admin_hidden, r.flagged, r.appealed_at, r.appeal_resolved,
              r.effective_weight, r.created_at,
              reviewer.name AS reviewer_name, reviewer.username AS reviewer_username
         FROM trade_reviews r
         LEFT JOIN users reviewer ON reviewer.id = r.reviewer_id
        WHERE r.reviewee_id = $1
        ORDER BY r.created_at DESC
        LIMIT 100`,
      [userId, PERSON_PUBLICATION_NOTICE_VERSION],
    ),
    query(
      `SELECT r.id, r.trade_id, r.role, r.rating, r.comment,
              (r.is_public
               AND r.publication_notice_version=$2
               AND r.published_at IS NOT NULL) AS is_public,
              r.publication_notice_version, r.published_at,
              r.admin_hidden, r.flagged, r.created_at,
              reviewee.name AS reviewee_name, reviewee.username AS reviewee_username
         FROM trade_reviews r
         LEFT JOIN users reviewee ON reviewee.id = r.reviewee_id
        WHERE r.reviewer_id = $1
        ORDER BY r.created_at DESC
        LIMIT 100`,
      [userId, PERSON_PUBLICATION_NOTICE_VERSION],
    ),
  ]);

  return NextResponse.json(
    { received: received.rows, given: given.rows },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    reviewId?: string;
    isPublic?: boolean;
    publicationNoticeVersion?: string;
  };
  if (!body.reviewId || typeof body.isPublic !== "boolean") {
    return NextResponse.json(
      { error: "reviewId and isPublic are required." },
      { status: 400 },
    );
  }
  if (
    body.isPublic &&
    body.publicationNoticeVersion !== PERSON_PUBLICATION_NOTICE_VERSION
  ) {
    return NextResponse.json(
      { error: "Read and accept the current review-publication notice." },
      { status: 400 },
    );
  }

  const updated = await query(
    `UPDATE trade_reviews
        SET is_public=$3,
            publication_notice_version=CASE WHEN $3 THEN $4 ELSE NULL END,
            published_at=CASE
              WHEN $3=FALSE THEN NULL
              WHEN is_public=TRUE
               AND publication_notice_version=$4
               AND published_at IS NOT NULL
                THEN published_at
              ELSE NOW()
            END
      WHERE id=$1 AND reviewer_id=$2
      RETURNING id, is_public, publication_notice_version, published_at`,
    [body.reviewId, session.user.id, body.isPublic, PERSON_PUBLICATION_NOTICE_VERSION],
  );
  if (updated.rows.length === 0) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }
  return NextResponse.json(
    { review: updated.rows[0] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
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
