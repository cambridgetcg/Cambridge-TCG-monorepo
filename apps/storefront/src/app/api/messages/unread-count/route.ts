import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unreadConversationCount } from "@/lib/messages/db";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

// GET — unread-conversation count only. The nav polls this every 60s;
// it must stay cheaper than the full conversation list.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const count = await unreadConversationCount(session.user.id);
  return NextResponse.json({ count }, { headers: PRIVATE_HEADERS });
}
