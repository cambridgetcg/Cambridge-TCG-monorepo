import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCommunityFeed } from "@/lib/social/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "latest"; // "latest" | "following"
  const limit = parseInt(url.searchParams.get("limit") || "30", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  const session = await auth();

  const feed = await getCommunityFeed({
    followingUserId: tab === "following" && session?.user?.id ? session.user.id : undefined,
    limit,
    offset,
  });

  return NextResponse.json({ feed });
}
