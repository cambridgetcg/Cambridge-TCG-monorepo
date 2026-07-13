import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  BOUNTY_PHONE_VERIFICATION_MESSAGE,
  getEligibility,
  sellBackVaultItem,
} from "@/lib/bounty/db";

// Sell back a vault item for store credit. The grant + status flip + audit
// happen inside sellBackVaultItem with a compensating revert: if the credit
// grant fails after the status flip succeeded, the item is rolled back to
// 'reserved' so the user can retry.

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  const eligibility = await getEligibility(session.user.id);
  if (!eligibility.eligible) {
    return NextResponse.json(
      {
        error: eligibility.reasons.includes("phone_verification_unavailable")
          ? BOUNTY_PHONE_VERIFICATION_MESSAGE
          : "Bounty Board requires a prior paid order.",
        reasons: eligibility.reasons,
      },
      { status: 403 },
    );
  }

  const result = await sellBackVaultItem(id, session.user.id);
  if ("error" in result) {
    return NextResponse.json(result, { status: 409 });
  }

  return NextResponse.json({
    item: result.item,
    creditAwarded: result.creditAwarded,
  });
}
