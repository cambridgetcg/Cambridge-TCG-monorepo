import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";
import { sendVaultRedeemedBulkEmail } from "@/lib/email/bounty";
import { logFulfilment } from "@/lib/bounty/fulfilment-log";

// Bulk-fulfil every reserved vault item in one redemption order.
//
// The per-item endpoint requires N clicks to ship a 5-item bulk
// redemption — and N tracking-number entries even though the cards go
// in one envelope. This collapses that to a single POST: one carrier +
// tracking number applied to every reserved item under the order, then
// the order itself flips straight to 'completed' (no intermediate
// 'shipped' state needed since we're shipping the whole bundle).

interface RequestBody {
  order_id?: number;
  tracking?: string;
  carrier?: string;
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const orderId = typeof body.order_id === "number" ? body.order_id : NaN;
  const tracking = (body.tracking ?? "").trim().slice(0, 100) || null;
  const carrier = (body.carrier ?? "").trim().slice(0, 50) || null;
  if (!Number.isFinite(orderId)) {
    return NextResponse.json({ error: "order_id required." }, { status: 400 });
  }

  // Pull all reserved siblings + order+user context in one round trip so
  // the email summary has everything it needs.
  const rowsRes = await query(
    `SELECT v.id, v.user_id, v.card_name, v.card_number, v.rarity, v.image_url,
            v.acquired_at, v.spot_price_gbp,
            co.shipping_name, co.shipping_address, co.customer_email
       FROM vault_items v
       JOIN customer_orders co ON co.id = v.redemption_order_id
      WHERE v.redemption_order_id = $1 AND v.status = 'reserved'`,
    [orderId],
  );
  const items = rowsRes.rows;
  if (items.length === 0) {
    return NextResponse.json(
      { error: "No reserved items in this order — already shipped or invalid." },
      { status: 409 },
    );
  }

  // Single UPDATE for all items.
  await query(
    `UPDATE vault_items
        SET status = 'redeemed', fulfilled_at = NOW()
      WHERE redemption_order_id = $1 AND status = 'reserved'`,
    [orderId],
  );

  // No siblings remain by definition — flip to completed in one shot.
  // Stamp tracking on the order itself (migration 0055) rather than
  // squeezing it into vault_items.notes.
  await query(
    `UPDATE customer_orders
        SET status = 'completed',
            tracking_number = COALESCE($2, tracking_number),
            carrier         = COALESCE($3, carrier),
            shipped_at      = COALESCE(shipped_at, NOW())
      WHERE id = $1`,
    [orderId, tracking, carrier],
  );

  // Audit one log row per item (fire-and-forget).
  for (const it of items) {
    void logFulfilment({
      vaultItemId: it.id,
      orderId,
      action: "fulfilled",
      notes: tracking ? `bulk tracking=${tracking} carrier=${carrier ?? ""}` : `bulk fulfil`,
    });
  }

  // One bundled email summarising the whole shipment, not N per-card.
  const userId = items[0].user_id;
  const shippingName = items[0].shipping_name ?? "";
  const shippingAddress = items[0].shipping_address ?? "";
  void sendVaultRedeemedBulkEmail({
    userId,
    items: items.map((it) => ({
      cardName: it.card_name,
      cardNumber: it.card_number,
      rarity: it.rarity,
      imageUrl: it.image_url,
      spotPriceGbp: String(it.spot_price_gbp ?? "0"),
    })),
    shippingName,
    shippingAddress,
    orderId,
    tracking,
    carrier,
  }).catch((err) => console.error("[bounty/bulk-fulfill] email failed:", err));

  return NextResponse.json({
    fulfilled: true,
    order_id: orderId,
    items_shipped: items.length,
    tracking,
    carrier,
  });
}
