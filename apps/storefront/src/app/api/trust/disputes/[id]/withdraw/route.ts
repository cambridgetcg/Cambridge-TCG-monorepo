import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withdrawDispute } from "@/lib/trust/db";

// POST — dispute raiser withdraws an unresolved dispute. Flips the
// dispute to status='closed', stamps withdrawn_at, and returns the
// underlying trade to 'awaiting_shipment' so the normal escrow chain
// continues. Only the user who originally raised the dispute can
// withdraw it; admins resolve instead of withdraw.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const result = await withdrawDispute(id, session.user.id);
  if (!result.ok) {
    const status = result.reason === "not found" ? 404
      : result.reason === "only the raiser can withdraw" ? 403
      : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ ok: true });
}
