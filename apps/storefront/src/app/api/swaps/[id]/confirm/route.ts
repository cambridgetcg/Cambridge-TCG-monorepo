import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { confirmSwapReceipt } from "@/lib/swaps/db";

// POST — confirm the counterparty's cards arrived. When both sides have
// confirmed, the swap completes (system-derived, logged as such).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const result = await confirmSwapReceipt(id, session.user.id);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ swap: result.value });
}
