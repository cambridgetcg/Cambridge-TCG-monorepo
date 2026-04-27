import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markShipped } from "@/lib/market/returns";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    carrier?: string;
    trackingNumber?: string;
  };
  if (!body.carrier || !body.trackingNumber) {
    return NextResponse.json({ error: "carrier and trackingNumber required." }, { status: 400 });
  }
  const result = await markShipped({
    returnId: id,
    buyerId: session.user.id,
    carrier: body.carrier,
    trackingNumber: body.trackingNumber,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ return: result.value });
}
