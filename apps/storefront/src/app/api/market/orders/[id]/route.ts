import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cancelOrder, getUserOrders } from "@/lib/market/db";

// Per-order endpoint. The collection route also accepts
// `DELETE /api/market/orders` with a `{ orderId }` body (kept for the
// existing UI), but a RESTful `DELETE /api/market/orders/:id` used to fall
// through to Next's HTML 404 — undiscoverable for integrators and agents.
// This serves the same cancel, addressed by path, as JSON.

// GET — a single one of the caller's orders (JSON, not an HTML 404).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;
  const orders = await getUserOrders(session.user.id);
  const order = orders.find((o) => o.id === id);
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  return NextResponse.json({ order });
}

// DELETE — cancel the caller's open order, addressed by path.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;
  const cancelled = await cancelOrder(id, session.user.id);
  if (!cancelled) {
    return NextResponse.json(
      { error: "Order not found, not yours, or already filled/cancelled." },
      { status: 404 },
    );
  }
  return NextResponse.json({ cancelled: true, orderId: id });
}
