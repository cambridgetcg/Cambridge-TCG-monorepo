import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

// GET — user's streak info
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const result = await query(
    `SELECT * FROM user_streaks WHERE user_id=$1`,
    [session.user.id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({
      currentStreak: 0, longestStreak: 0, multiplier: 1.0, totalVisits: 0,
    });
  }

  const s = result.rows[0];
  return NextResponse.json({
    currentStreak: s.current_streak,
    longestStreak: s.longest_streak,
    multiplier: parseFloat(s.streak_multiplier),
    totalVisits: s.total_visits,
    lastVisit: s.last_visit_date,
  });
}
