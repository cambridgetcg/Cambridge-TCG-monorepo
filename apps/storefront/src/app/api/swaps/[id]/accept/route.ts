import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { acceptSwap } from "@/lib/swaps/db";

// POST — recipient accepts. Re-gates BOTH parties via canTrade().
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const result = await acceptSwap(id, session.user.id);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ swap: result.value });
}
