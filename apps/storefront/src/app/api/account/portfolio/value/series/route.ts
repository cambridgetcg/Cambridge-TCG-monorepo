import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getValueOverTime } from "@/lib/portfolio/valuation";

// GET /api/account/portfolio/value/series?days=90
// Time series from portfolio_snapshots — drives the chart.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "90", 10);
  const series = await getValueOverTime(session.user.id, { days });
  return NextResponse.json({ series });
}
