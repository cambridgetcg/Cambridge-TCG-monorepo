import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listAlerts, createAlert } from "@/lib/portfolio/alerts";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const alerts = await listAlerts(session.user.id);
  return NextResponse.json({ alerts });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    sku?: string;
    direction?: string;
    thresholdGbp?: number;
    cardName?: string;
    cardNumber?: string;
    imageUrl?: string;
    note?: string;
  };
  if (!body.sku || typeof body.sku !== "string") {
    return NextResponse.json({ error: "sku required." }, { status: 400 });
  }
  if (body.direction !== "above" && body.direction !== "below") {
    return NextResponse.json({ error: "direction must be 'above' or 'below'." }, { status: 400 });
  }
  if (typeof body.thresholdGbp !== "number" || body.thresholdGbp < 0 || !Number.isFinite(body.thresholdGbp)) {
    return NextResponse.json({ error: "thresholdGbp must be a non-negative number." }, { status: 400 });
  }

  const alert = await createAlert({
    userId: session.user.id,
    sku: body.sku,
    direction: body.direction,
    thresholdGbp: body.thresholdGbp,
    cardName: body.cardName ?? null,
    cardNumber: body.cardNumber ?? null,
    imageUrl: body.imageUrl ?? null,
    note: body.note?.slice(0, 500) ?? null,
  });
  return NextResponse.json({ alert });
}
