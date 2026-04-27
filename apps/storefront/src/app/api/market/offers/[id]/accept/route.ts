import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { acceptOffer } from "@/lib/market/offers";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const result = await acceptOffer(id, session.user.id);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ offer: result.value.offer, trade: result.value.trade });
}
