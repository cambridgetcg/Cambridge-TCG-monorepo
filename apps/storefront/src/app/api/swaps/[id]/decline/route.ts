import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { declineSwap } from "@/lib/swaps/db";

// POST — recipient declines. Body: { reason?: string }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const result = await declineSwap(id, session.user.id, body.reason);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ swap: result.value });
}
