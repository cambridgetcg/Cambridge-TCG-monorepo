import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPortfolioRiskFlags } from "@/lib/portfolio/risk-flags";

// GET /api/account/portfolio/risk
//
// Unified investor risk dashboard — reprints, liquidity, concentration,
// aging, target hits, all collapsed into a sorted flag list.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const report = await getPortfolioRiskFlags(session.user.id);
  return NextResponse.json(report);
}
