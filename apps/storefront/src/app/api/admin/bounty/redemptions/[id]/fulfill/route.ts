import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";
import { sendVaultRedeemedEmail } from "@/lib/email/bounty";
import { logFulfilment } from "@/lib/bounty/fulfilment-log";

// Mark a vault redemption fulfilled. Flips vault_items.status → 'redeemed',
// updates the attached customer_order → 'completed', records tracking if
// provided, and fires a shipping notification email to the user.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { tracking?: string; carrier?: string };
  const tracking = (body.tracking ?? "").trim().slice(0, 100) || null;
  const carrier = (body.carrier ?? "").trim().slice(0, 50) || null;

  // Pull the full item + order + user info in one round trip so the email
  // template has everything it needs.
  const item = await query(
    `SELECT v.id, v.user_id, v.redemption_order_id, v.status, v.card_name,
            v.card_number, v.rarity, NULL::text AS image_url, v.acquired_at,
            co.shipping_name, co.shipping_address
     FROM vault_items v
     LEFT JOIN customer_orders co ON co.id = v.redemption_order_id
     WHERE v.id = $1`,
    [id],
  );
  if (item.rows.length === 0) {
    return NextResponse.json({ error: "Vault item not found." }, { status: 404 });
  }
  const v = item.rows[0];
  if (!v.redemption_order_id) {
    return NextResponse.json({ error: "Item has no redemption order." }, { status: 409 });
  }
  if (v.status !== "reserved") {
    return NextResponse.json({ error: "Item is not in a fulfillable state." }, { status: 409 });
  }

  const orderId: number = v.redemption_order_id;

  // Flip vault item to redeemed. Note: the old handler stuffed tracking
  // into vault_items.notes as a text prefix, which worked server-side but
  // was invisible to /account/orders. We now stamp tracking on the order
  // itself (migration 0055), so notes can stay for genuine free-form
  // admin context.
  await query(
    `UPDATE vault_items SET status='redeemed', fulfilled_at=NOW() WHERE id = $1`,
    [id],
  );

  // Order completes only when no sibling items remain reserved. Flipping
  // on the first item shipped (the old behavior) leaves bulk orders
  // looking done while sibling items still need to ship.
  const remaining = await query(
    `SELECT COUNT(*)::int AS n FROM vault_items
       WHERE redemption_order_id = $1 AND status = 'reserved'`,
    [orderId],
  );
  const fullyShipped = (remaining.rows[0]?.n ?? 0) === 0;

  // Stamp tracking + shipped_at on the order. COALESCE keeps shipped_at
  // pinned to the first fulfill in a bulk order; tracking/carrier
  // last-write-win since in practice one envelope carries the whole
  // bundle (admin enters the same tracking each time).
  //
  // Status ladder: redemption_pending → partially_shipped → completed.
  // We set 'shipped' as an alias for partially_shipped once at least one
  // item is out the door — lets the customer see movement even if the
  // full bundle isn't done.
  const newStatus = fullyShipped ? "completed" : "shipped";
  await query(
    `UPDATE customer_orders
        SET status = $2,
            tracking_number = COALESCE($3, tracking_number),
            carrier         = COALESCE($4, carrier),
            shipped_at      = COALESCE(shipped_at, NOW())
      WHERE id = $1`,
    [orderId, newStatus, tracking, carrier],
  );

  // Audit transition (fire-and-forget — never block fulfilment on logging).
  void logFulfilment({
    vaultItemId: id,
    orderId,
    action: "fulfilled",
    notes: tracking ? `tracking=${tracking} carrier=${carrier ?? ""}` : null,
  });

  // Fire-and-forget the shipping notification.
  void sendVaultRedeemedEmail({
    userId: v.user_id,
    cardName: v.card_name,
    cardNumber: v.card_number,
    rarity: v.rarity,
    imageUrl: null,
    shippingName: v.shipping_name ?? "",
    shippingAddress: v.shipping_address ?? "",
    orderId,
    tracking,
    carrier,
    acquiredAt: new Date(v.acquired_at),
  }).catch((err) => console.error("[bounty] vault-redeemed email failed:", err));

  return NextResponse.json({
    fulfilled: true,
    vault_item_id: id,
    order_id: orderId,
    tracking,
    order_fully_shipped: fullyShipped,
    items_remaining: remaining.rows[0]?.n ?? 0,
  });
}
