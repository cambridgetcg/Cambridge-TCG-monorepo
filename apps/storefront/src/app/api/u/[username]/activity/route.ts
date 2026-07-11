import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getPublicProfileStats } from "@/lib/journey/public-stats";
import { PERSON_PUBLICATION_NOTICE_VERSION } from "@/lib/social/publication";

// Public, no-auth profile activity endpoint. Person data is deliberately not
// edge-cached: withdrawing profile publication must take effect on the next
// request rather than after a shared-cache window.

export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const cleanUsername = username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,32}$/.test(cleanUsername)) {
    return NextResponse.json({ error: "Invalid username." }, { status: 400 });
  }

  const userRes = await query(
    `SELECT u.id
       FROM users u
       LEFT JOIN trust_profiles tp ON tp.user_id = u.id
      WHERE LOWER(u.username) = $1
        AND u.is_public = TRUE
        AND u.profile_publication_notice_version = $2
        AND u.profile_published_at IS NOT NULL
        AND COALESCE(tp.is_suspended, FALSE) = FALSE
      LIMIT 1`,
    [cleanUsername, PERSON_PUBLICATION_NOTICE_VERSION],
  );
  if (userRes.rows.length === 0) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  const userId: string = userRes.rows[0].id;

  const stats = await getPublicProfileStats(userId);
  return NextResponse.json(
    { stats },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
