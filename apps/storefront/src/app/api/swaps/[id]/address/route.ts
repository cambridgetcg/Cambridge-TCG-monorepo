import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setSwapAddress } from "@/lib/swaps/db";

// POST — set my side's ship-to address (post-accept). Body: the flat
// address object { name, line1, line2?, city?, state?, postal_code?,
// country? }. Visible only to the swap's participants.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const result = await setSwapAddress(id, session.user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ swap: result.value });
}
