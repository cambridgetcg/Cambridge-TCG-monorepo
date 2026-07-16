import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCommunityFeed } from "@/lib/social/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "latest"; // "latest" | "following"
  const rawLimit = url.searchParams.get("limit") ?? "30";
  const rawOffset = url.searchParams.get("offset") ?? "0";
  if (!/^\d+$/.test(rawLimit) || !/^\d+$/.test(rawOffset)) {
    return NextResponse.json({ error: "limit and offset must be integers." }, { status: 400 });
  }
  const limit = Math.min(Math.max(Number(rawLimit), 1), 30);
  const offset = Number(rawOffset);
  if (offset !== 0) {
    return NextResponse.json(
      { error: "Historical bulk activity paging is unavailable." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const session = await auth();

  const feed = await getCommunityFeed({
    viewerUserId: session?.user?.id,
    followingOnly: tab === "following",
    limit,
    offset,
  });

  // Live as of activity-publication-v1: the feed carries only the milestones
  // of people who hold a current activity-publication receipt, ranked by
  // activity-rank-v1 (see @/lib/social/publication + /methodology/community).
  return NextResponse.json(
    { feed, status: "live" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
