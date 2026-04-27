import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sellerShip } from "@/lib/auction/fulfilment";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const result = await sellerShip(id, session.user.id, {
    tracking: body.tracking ?? "",
    carrier: body.carrier ?? null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ ok: true });
}
