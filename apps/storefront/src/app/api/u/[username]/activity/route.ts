import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getPublicProfileStats } from "@/lib/journey/public-stats";

// Public, no-auth profile activity endpoint. Cached at the edge for
// 5 minutes — public data + frequent reads (every profile view fans
// in here).

export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const cleanUsername = username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,32}$/.test(cleanUsername)) {
    return NextResponse.json({ error: "Invalid username." }, { status: 400 });
  }

  const userRes = await query(
    `SELECT id FROM users WHERE LOWER(username) = $1 LIMIT 1`,
    [cleanUsername],
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
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    },
  );
}
