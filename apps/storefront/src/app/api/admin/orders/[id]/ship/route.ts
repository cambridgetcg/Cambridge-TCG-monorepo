import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { markShipped } from "@/lib/shop/fulfilment";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }
  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (Number.isNaN(orderId)) {
    return NextResponse.json({ error: "Invalid order id." }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    carrier?: string;
    trackingNumber?: string;
    notes?: string;
    adminLabel?: string;
  };
  if (!body.carrier || !body.trackingNumber) {
    return NextResponse.json(
      { error: "carrier and trackingNumber required." },
      { status: 400 },
    );
  }
  const result = await markShipped({
    orderId,
    carrier: body.carrier,
    trackingNumber: body.trackingNumber,
    notes: body.notes,
    adminLabel: body.adminLabel || "admin",
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ order: result.value });
}
