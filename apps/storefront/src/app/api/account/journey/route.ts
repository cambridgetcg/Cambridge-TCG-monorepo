import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserJourney, type JourneyEvent } from "@/lib/journey/timeline";

// Customer-facing journey feed. Always passes hideAdminOnly=true so
// internal moderation events (e.g. fraud abuse_checked, dedupe-key
// log entries) don't leak.

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const url = new URL(request.url);
  const group = url.searchParams.get("group");
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;

  const events = await getUserJourney(session.user.id, {
    hideAdminOnly: true,
    group: (group as JourneyEvent["group"] | null) ?? undefined,
    since,
  });

  return NextResponse.json({ events });
}
