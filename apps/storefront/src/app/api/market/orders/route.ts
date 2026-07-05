import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { placeOrder, getUserOrders, cancelOrder, TrustGateError } from "@/lib/market/db";
import { transaction } from "@/lib/db";

// Bounds for the per-listing return window (days). Migration 0111 gives
// market_orders the column with the same default the trade-side snapshot
// (migration 0070) carries; the DB does not enforce a range, so this is
// the only gate.
const RETURN_WINDOW_MIN_DAYS = 1;
const RETURN_WINDOW_MAX_DAYS = 60;
const RETURN_WINDOW_DEFAULT_DAYS = 14;

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

    // Listing options (asks only). accepts_returns is the seller's
    // per-listing opt-in (migration 0070); return_window_days is how long
    // the buyer has after completion (migration 0111). Both are
    // snapshotted onto any resulting trade below.
    const acceptsReturns: boolean | undefined =
      typeof body.acceptsReturns === "boolean" ? body.acceptsReturns : undefined;
    let returnWindowDays = RETURN_WINDOW_DEFAULT_DAYS;
    if (acceptsReturns !== undefined && body.side !== "ask") {
      return NextResponse.json(
        { error: "Return options apply to asks only." }, { status: 400 });
    }
    if (body.returnWindowDays !== undefined) {
      if (!acceptsReturns) {
        return NextResponse.json(
          { error: "returnWindowDays requires acceptsReturns: true." }, { status: 400 });
      }
      const days = Number(body.returnWindowDays);
      if (!Number.isInteger(days) || days < RETURN_WINDOW_MIN_DAYS || days > RETURN_WINDOW_MAX_DAYS) {
        return NextResponse.json(
          { error: `Return window must be a whole number of days between ${RETURN_WINDOW_MIN_DAYS} and ${RETURN_WINDOW_MAX_DAYS}.` },
          { status: 400 });
      }
      returnWindowDays = days;
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

    // Persist listing options + snapshot them onto any trades the match
    // loop just created. placeOrder's trade INSERT (lib/market/db.ts)
    // doesn't carry the return columns, so the snapshot lands here —
    // reading each trade's ask order — so later listing edits can't
    // retroactively change a trade's return eligibility (returns.ts reads
    // the trade row, not the listing). Ordering matters: the new order's
    // options must be written before the snapshot, because an ask that
    // matched an existing bid immediately IS the trades' ask order.
    const tradeIds = result.trades.map((t) => t.id);
    if (acceptsReturns !== undefined || tradeIds.length > 0) {
      await transaction(async (q) => {
        if (acceptsReturns !== undefined) {
          await q(
            `UPDATE market_orders
                SET accepts_returns = $2, return_window_days = $3, updated_at = NOW()
              WHERE id = $1`,
            [result.order.id, acceptsReturns, returnWindowDays],
          );
        }
        if (tradeIds.length > 0) {
          await q(
            `UPDATE market_trades t
                SET accepts_returns = o.accepts_returns,
                    return_window_days = o.return_window_days
               FROM market_orders o
              WHERE o.id = t.ask_order_id AND t.id = ANY($1)`,
            [tradeIds],
          );
        }
      });
    }

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
