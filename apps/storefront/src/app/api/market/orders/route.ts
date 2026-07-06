import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  placeOrder, getUserOrders, cancelOrder, TrustGateError,
  resolveCatalogCard, countDuplicateOpenAsks,
} from "@/lib/market/db";
import { transaction } from "@/lib/db";
import { formatPrice } from "@/lib/format";

// The complete set of fields the listing API understands. An unrecognised
// key (a snake_case slip like `accepts_returns`, or a typo) becomes a
// teaching 400 that names these, rather than a silent drop — the walkers
// lost real data to silently-ignored fields. Card identity (name/set/
// image) is resolved server-side from the catalog, so those client keys
// are accepted for backwards-compatibility but never trusted.
const SUPPORTED_ORDER_FIELDS = new Set([
  "side", "sku", "cardName", "setCode", "setName", "imageUrl",
  "condition", "price", "quantity", "notes", "acceptsReturns", "returnWindowDays",
]);

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
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }

    // Unknown-field guard — one 400 that names the supported fields.
    const unknownFields = Object.keys(body).filter((k) => !SUPPORTED_ORDER_FIELDS.has(k));
    if (unknownFields.length > 0) {
      return NextResponse.json({
        error: `Unknown field${unknownFields.length > 1 ? "s" : ""}: ${unknownFields.join(", ")}. Supported fields: ${[...SUPPORTED_ORDER_FIELDS].join(", ")}.`,
        unknown_fields: unknownFields,
        supported_fields: [...SUPPORTED_ORDER_FIELDS],
      }, { status: 400 });
    }

    // Validate the core fields ALL AT ONCE (one round trip, not three) and
    // enumerate allowed values so the caller can fix everything in one go.
    const side = body.side;
    const condition = (typeof body.condition === "string" && body.condition) || "NM";
    const price = body.price;
    const quantity = body.quantity;
    const fieldErrors: string[] = [];
    if (side !== "bid" && side !== "ask") {
      fieldErrors.push("side must be 'bid' or 'ask'.");
    }
    if (typeof body.sku !== "string" || !body.sku.trim()) {
      fieldErrors.push("sku is required — a canonical SKU (OP-OP01-001-JP) or the card number printed on the card (OP01-001).");
    }
    if (typeof price !== "number" || !(price > 0)) {
      fieldErrors.push("price must be a positive number.");
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
      fieldErrors.push("quantity must be a positive whole number.");
    }
    if (!["NM", "LP", "MP", "HP"].includes(condition)) {
      fieldErrors.push("condition must be one of: NM, LP, MP, HP.");
    }
    if (fieldErrors.length > 0) {
      return NextResponse.json({
        error: "Some fields need fixing.",
        errors: fieldErrors,
        allowed: { side: ["bid", "ask"], condition: ["NM", "LP", "MP", "HP"] },
      }, { status: 400 });
    }

    // Resolve the card against the catalog: a canonical SKU or the bare
    // card number both map to one card, and identity (name/set/image)
    // comes from the catalog — never from client-sent strings. An unknown
    // identifier is a 400 carrying the nearest canonical SKUs.
    const resolved = await resolveCatalogCard(body.sku as string);
    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.reason, suggestions: resolved.suggestions },
        { status: 400 },
      );
    }
    const card = resolved.card;

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

    // Duplicate-ask warning (advisory, never blocking): a seller re-listing
    // the same card at the same price + condition almost always meant to
    // add quantity, not spawn a second listing. Bids aren't warned — depth
    // on a price level is normal.
    let duplicateWarning: string | undefined;
    if (side === "ask") {
      const dupes = await countDuplicateOpenAsks(session.user.id, card.sku, condition, price as number);
      if (dupes > 0) {
        duplicateWarning = `You already have ${dupes} open ask${dupes > 1 ? "s" : ""} for ${card.card_name} at ${formatPrice(price as number)} (${condition}). This adds another — cancel it if you meant to raise the quantity instead.`;
      }
    }

    const result = await placeOrder({
      userId: session.user.id,
      side: side as "bid" | "ask",
      // Catalog-owned identity — the client's card strings are ignored so a
      // listing can never disagree with the catalog or be invisible on
      // browse surfaces.
      sku: card.sku,
      cardName: card.card_name,
      setCode: card.set_code,
      setName: card.set_name,
      imageUrl: card.image_url ?? undefined,
      condition,
      price: price as number,
      quantity: quantity as number,
      notes: typeof body.notes === "string" ? body.notes.trim() : undefined,
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

    // Return the POST-UPDATE order: when the seller opted into returns, the
    // freshly-inserted row above predates the accepts_returns UPDATE, so
    // echoing result.order verbatim would report the stale `false` the
    // walkers saw. Merge the persisted values.
    const orderOut = acceptsReturns !== undefined
      ? { ...result.order, accepts_returns: acceptsReturns, return_window_days: returnWindowDays }
      : result.order;

    return NextResponse.json({
      order: orderOut,
      trades: result.trades,
      matched: result.trades.length,
      ...(duplicateWarning ? { warning: duplicateWarning } : {}),
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
