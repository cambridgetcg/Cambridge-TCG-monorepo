import { NextResponse } from "next/server";
import { COMPLETED_TRADE_PUBLICATION } from "@/lib/market/publication";

const PEOPLE_RANKING_PUBLICATION = {
  status: "paused" as const,
  reason:
    "A public profile is not permission to publish ranked financial activity. A separate leaderboard publication choice does not exist yet.",
};

export async function GET() {
  return NextResponse.json({
    period: null,
    peopleRankings: PEOPLE_RANKING_PUBLICATION,
    cardActivity: COMPLETED_TRADE_PUBLICATION,
    topSellers: [],
    topBuyers: [],
    busiestSkus: [],
  });
}
