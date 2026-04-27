import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mergeTokens } from "@/lib/bounty/merge";
import type { PullTier } from "@/lib/bounty/db";

const VALID_TIERS: PullTier[] = ["common", "uncommon", "rare", "super_rare", "legendary"];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { from_tier?: string };
  const fromTier = body.from_tier as PullTier | undefined;
  if (!fromTier || !VALID_TIERS.includes(fromTier)) {
    return NextResponse.json({ error: "Invalid from_tier." }, { status: 400 });
  }

  let result;
  try {
    result = await mergeTokens(session.user.id, fromTier);
  } catch (err) {
    // mergeTokens throws when the grant step fails after a successful
    // decrement. Tokens have already been refunded inside the helper
    // (or logged as a critical inconsistency); surface a 503 so the
    // client offers a retry rather than treating this as a permanent
    // failure.
    console.error(`[bounty/merge] grant failed for ${fromTier}:`, err);
    return NextResponse.json(
      { ok: false, error: "merge_failed", message: "Merge could not be completed. Your tokens have been refunded — please try again." },
      { status: 503 },
    );
  }

  if (!result.ok) {
    const status = result.error === "insufficient_tokens" ? 409
      : result.error === "tier_disabled" ? 423
      : result.error === "not_mergeable" ? 400
      : 500;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
