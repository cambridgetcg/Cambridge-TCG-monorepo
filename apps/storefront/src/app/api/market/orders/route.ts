import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { placeOrder, getUserOrders, cancelOrder, TrustGateError } from "@/lib/market/db";

// GET — user's orders
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const orders = await getUserOrders(session.user.id, status);
  return NextResponse.json({ orders });
}

// POST — place a new order
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to trade." }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!["bid", "ask"].includes(body.side)) {
      return NextResponse.json({ error: "Side must be bid or ask." }, { status: 400 });
    }
    if (!body.sku?.trim()) {
      return NextResponse.json({ error: "Card SKU required." }, { status: 400 });
    }
    if (!body.price || body.price <= 0) {
      return NextResponse.json({ error: "Price must be positive." }, { status: 400 });
    }
    if (!body.quantity || body.quantity <= 0) {
      return NextResponse.json({ error: "Quantity must be at least 1." }, { status: 400 });
    }
    if (!["NM", "LP", "MP", "HP"].includes(body.condition || "NM")) {
      return NextResponse.json({ error: "Invalid condition." }, { status: 400 });
    }

    const result = await placeOrder({
      userId: session.user.id,
      side: body.side,
      sku: body.sku.trim(),
      cardName: body.cardName?.trim(),
      setCode: body.setCode?.trim(),
      setName: body.setName?.trim(),
      imageUrl: body.imageUrl,
      condition: body.condition || "NM",
      price: body.price,
      quantity: body.quantity,
      notes: body.notes?.trim(),
    });

    return NextResponse.json({
      order: result.order,
      trades: result.trades,
      matched: result.trades.length,
    });
  } catch (err) {
    if (err instanceof TrustGateError) {
      // Surface the trust-gate reason directly to the UI (suspended /
      // over per-trade limit / over daily limit). Warnings array
      // included so the client can flag near-limit cases too.
      return NextResponse.json(
        { error: err.message, code: "TRUST_GATE", warnings: err.warnings },
        { status: 403 },
      );
    }
    console.error("[market] Order error:", err);
    return NextResponse.json({ error: "Failed to place order." }, { status: 500 });
  }
}

// DELETE — cancel an order
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { orderId } = await request.json();
  const cancelled = await cancelOrder(orderId, session.user.id);

  if (!cancelled) {
    return NextResponse.json({ error: "Order not found or already filled." }, { status: 404 });
  }

  return NextResponse.json({ cancelled: true });
}
