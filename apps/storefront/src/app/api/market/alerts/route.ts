import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createAlert,
  listUserAlerts,
  deleteAlert,
} from "@/lib/market/watches";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const alerts = await listUserAlerts(session.user.id);
  return NextResponse.json({ alerts });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const sku = body.sku as string | undefined;
  const threshold = typeof body.thresholdPrice === "number" ? body.thresholdPrice : null;
  const direction = body.direction as string | undefined;

  if (!sku) return NextResponse.json({ error: "sku required" }, { status: 400 });
  if (!threshold || threshold <= 0) {
    return NextResponse.json({ error: "thresholdPrice must be positive" }, { status: 400 });
  }
  if (direction !== "below" && direction !== "above") {
    return NextResponse.json({ error: "direction must be 'below' or 'above'" }, { status: 400 });
  }

  const alert = await createAlert({
    userId: session.user.id,
    sku,
    thresholdPrice: threshold,
    direction,
  });
  return NextResponse.json({ alert }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ok = await deleteAlert(session.user.id, id);
  if (!ok) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
