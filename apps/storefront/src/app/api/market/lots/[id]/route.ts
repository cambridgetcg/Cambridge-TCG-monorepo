import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLot, cancelLot } from "@/lib/market/lots";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lot = await getLot(id);
  if (!lot) return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  return NextResponse.json({ lot });
}

// DELETE — seller cancels their own active lot. Refuses if already sold
// or if a trade has moved past awaiting_payment.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await cancelLot(id, session.user.id);
  if (!ok) {
    return NextResponse.json({ error: "Lot not cancellable (sold, not yours, or has an in-flight trade)" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
