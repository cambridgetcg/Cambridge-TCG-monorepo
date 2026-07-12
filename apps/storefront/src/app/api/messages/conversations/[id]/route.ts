import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getConversation } from "@/lib/messages/db";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

// GET — one conversation + its NEWEST page of messages (ascending).
// ?before=<ISO timestamp> pages backwards ("load earlier");
// ?limit=<n> trims the page (the thread poll asks for a small one).
// Response: { conversation, messages, hasEarlier }.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const url = new URL(request.url);
  const before = url.searchParams.get("before") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
    return NextResponse.json({ error: "Invalid limit." }, { status: 400 });
  }
  const result = await getConversation(id, session.user.id, { before, limit });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json(result.value, { headers: PRIVATE_HEADERS });
}
