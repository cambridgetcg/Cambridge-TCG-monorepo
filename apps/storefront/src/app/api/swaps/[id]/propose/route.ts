import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { proposeDraft } from "@/lib/swaps/db";
import { p2pCommitmentPauseResponse } from "@/lib/release/production-gates";

// POST — send a draft. Stamps expires_at from the recipient's declared
// response cadence (users.response_window_hours, migration 0092).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const releasePause = p2pCommitmentPauseResponse();
  if (releasePause) return releasePause;
  const { id } = await params;
  const result = await proposeDraft(id, session.user.id);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ swap: result.value });
}
