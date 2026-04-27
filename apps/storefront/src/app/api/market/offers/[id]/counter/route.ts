import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { counterOffer } from "@/lib/market/offers";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    counterPrice?: number;
    counterMessage?: string;
  };
  if (typeof body.counterPrice !== "number") {
    return NextResponse.json({ error: "counterPrice required." }, { status: 400 });
  }
  const result = await counterOffer({
    offerId: id,
    sellerId: session.user.id,
    counterPrice: body.counterPrice,
    counterMessage: body.counterMessage,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ offer: result.value });
}
