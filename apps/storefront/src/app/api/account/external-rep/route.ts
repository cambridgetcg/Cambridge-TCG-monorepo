import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { issueVerificationCode, runVerificationCheck } from "@/lib/external-rep/verify";
import { ExternalRepGateError, PLATFORM_DEFS } from "@/lib/external-rep/gates";

// GET — list user's external rep entries (verified + pending) with
//       decay countdowns and platform metadata.
// POST — body { action: 'issue' | 'verify', ... }
//        action='issue': { platform, profileUrl, username } → returns
//          verification_code for the user to paste.
//        action='verify': { repId } → fetches the URL, scans for code,
//          marks verified or returns failure guidance.
// DELETE — { repId } removes an entry the user owns.

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const r = await query(
    `SELECT id, platform, username, profile_url, verified, verified_at,
            verification_code, last_check_at, decay_at, failed_check_count,
            rating, total_sales, positive_percent, member_since,
            created_at
       FROM external_reputation
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [session.user.id],
  );
  return NextResponse.json({
    entries: r.rows,
    platforms: Object.values(PLATFORM_DEFS).map((p) => ({
      key: p.key,
      label: p.label,
      hosts: p.hosts,
    })),
  });
}

interface PostBody {
  action?: "issue" | "verify";
  platform?: string;
  profileUrl?: string;
  username?: string;
  repId?: string;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as PostBody;

  try {
    if (body.action === "issue") {
      if (!body.platform || !body.profileUrl || !body.username) {
        return NextResponse.json(
          { error: "platform + profileUrl + username required." },
          { status: 400 },
        );
      }
      const result = await issueVerificationCode({
        userId: session.user.id,
        platform: body.platform,
        profileUrl: body.profileUrl.trim(),
        username: body.username.trim(),
      });
      return NextResponse.json(result);
    }

    if (body.action === "verify") {
      if (!body.repId) {
        return NextResponse.json({ error: "repId required." }, { status: 400 });
      }
      // Confirm ownership before running the check
      const ownerRes = await query(
        `SELECT user_id FROM external_reputation WHERE id = $1`,
        [body.repId],
      );
      if (ownerRes.rows[0]?.user_id !== session.user.id) {
        return NextResponse.json({ error: "Not your rep entry." }, { status: 403 });
      }
      const result = await runVerificationCheck(body.repId);
      return NextResponse.json(result, { status: result.ok ? 200 : 422 });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (err) {
    if (err instanceof ExternalRepGateError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.code === "rate_limit" ? 429 : 403 },
      );
    }
    throw err;
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { repId } = (await request.json().catch(() => ({}))) as { repId?: string };
  if (!repId) return NextResponse.json({ error: "repId required." }, { status: 400 });

  const r = await query(
    `DELETE FROM external_reputation
      WHERE id = $1 AND user_id = $2
      RETURNING id, user_id, verified`,
    [repId, session.user.id],
  );
  if (r.rows.length === 0) {
    return NextResponse.json({ error: "Not found or not yours." }, { status: 404 });
  }
  // Recompute trust if the deletion drops a verified rep contribution.
  if (r.rows[0].verified) {
    try {
      const { calculateTrustScore } = await import("@/lib/escrow/trust-engine");
      void calculateTrustScore(session.user.id).catch(() => { /* ignore */ });
    } catch { /* ignore */ }
  }
  return NextResponse.json({ ok: true });
}
