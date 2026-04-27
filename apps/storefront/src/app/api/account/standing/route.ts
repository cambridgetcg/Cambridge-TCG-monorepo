import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

// User-facing account standing — am I suspended? do I have unresolved
// flags? what are they about? what do I do next?
//
// Privacy-conscious: returns the user's OWN flag types + descriptions
// + how to clear, but not the dedupe/internal notes that were squatted
// in resolved_notes (those start with "dedupe:").

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const userId = session.user.id;

  const profileRes = await query(
    `SELECT trust_score, is_suspended, suspended_reason, suspended_at
       FROM trust_profiles WHERE user_id = $1`,
    [userId],
  );
  const profile = profileRes.rows[0] ?? {
    trust_score: 0,
    is_suspended: false,
    suspended_reason: null,
    suspended_at: null,
  };

  const signalsRes = await query(
    `SELECT id, signal_type, severity, description, auto_action, created_at
       FROM fraud_signals
      WHERE user_id = $1 AND resolved = false
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 0
          WHEN 'high'     THEN 1
          WHEN 'medium'   THEN 2
          WHEN 'low'      THEN 3
        END,
        created_at DESC`,
    [userId],
  );

  return NextResponse.json({
    standing: {
      trust_score: profile.trust_score,
      is_suspended: profile.is_suspended === true,
      suspended_reason: profile.suspended_reason,
      suspended_at: profile.suspended_at,
    },
    flags: signalsRes.rows,
  });
}
