import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getActiveVacation } from "@/lib/market/vacation";
import { PERSON_PUBLICATION_NOTICE_VERSION } from "@/lib/social/publication";

// GET — public commerce stats for a user profile.
// Returns only current seller availability for an explicitly public profile.
// Exact trade directions, auction counts, money, disputes and free-form
// vacation messages remain private; a public profile is not permission to
// publish a financial dossier.
//
// Used by the public profile page and (via the username) by market order
// book entries that link trades to their buyer/seller profiles.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  // Resolve username → user row
  const userRes = await query(
    `SELECT u.id
       FROM users u
       LEFT JOIN trust_profiles tp ON tp.user_id = u.id
      WHERE u.username = $1
        AND u.is_public = TRUE
        AND u.profile_publication_notice_version = $2
        AND u.profile_published_at IS NOT NULL
        AND COALESCE(tp.is_suspended, FALSE) = FALSE`,
    [username, PERSON_PUBLICATION_NOTICE_VERSION]
  );
  if (userRes.rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const user = userRes.rows[0];

  // Surface the active vacation so the public profile + listing pages
  // can render an "On vacation until X" banner. Null when the seller
  // is reachable normally.
  const vacation = await getActiveVacation(user.id);

  return NextResponse.json({
    vacation: vacation
      ? {
          ends_at: vacation.ends_at,
        }
      : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
