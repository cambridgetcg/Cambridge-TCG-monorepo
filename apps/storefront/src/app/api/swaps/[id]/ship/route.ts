import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markSwapShipped } from "@/lib/swaps/db";

// POST — mark my side shipped. Body: { carrier: string, tracking: string }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { carrier?: string; tracking?: string };
  if (!body.carrier || !body.tracking) {
    return NextResponse.json({ error: "carrier and tracking required." }, { status: 400 });
  }
  const result = await markSwapShipped(id, session.user.id, body.carrier, body.tracking);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ swap: result.value });
}
