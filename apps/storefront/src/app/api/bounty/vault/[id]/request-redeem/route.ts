import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { getEligibility, getVaultItem } from "@/lib/bounty/db";

// Create a redemption order (customer_orders row with status='redemption_pending')
// and attach the vault item to it. Admin fulfils from there.
//
// NOTE: this is one vault item per order for now. A future iteration should
// batch multiple pending vault items into a single order.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as {
    shipping_name?: string;
    shipping_address?: string;
  };
  const shippingName = (body.shipping_name ?? "").trim();
  const shippingAddress = (body.shipping_address ?? "").trim();
  if (shippingName.length < 2 || shippingAddress.length < 10) {
    return NextResponse.json({ error: "Shipping name and address required." }, { status: 400 });
  }

  const elig = await getEligibility(session.user.id);
  if (!elig.eligible) {
    return NextResponse.json(
      { error: "Bounty Board requires a verified phone and prior paid order.", reasons: elig.reasons },
      { status: 403 },
    );
  }

  const item = await getVaultItem(id, session.user.id);
  if (!item) return NextResponse.json({ error: "Vault item not found." }, { status: 404 });
  if (item.status !== "reserved") {
    return NextResponse.json({ error: "Item cannot be redeemed in its current state." }, { status: 409 });
  }
  if (item.redemption_order_id) {
    return NextResponse.json({ error: "Item already has a pending redemption." }, { status: 409 });
  }
  const hold = new Date(item.p2p_hold_until).getTime();
  if (Date.now() < hold) {
    return NextResponse.json(
      { error: "Item is in its 48-hour hold period. Try again soon." },
      { status: 409 },
    );
  }

  // Create a redemption order. total_gbp = 0 because it's not a paid order.
  const items = [{
    type: "vault_redemption",
    vault_item_id: item.id,
    sku: item.sku,
    name: item.card_name,
    card_number: item.card_number,
    rarity: item.rarity,
    image_url: item.image_url,
    quantity: 1,
    spot_price_gbp: item.spot_price_gbp,
  }];

  const order = await query(
    `INSERT INTO customer_orders
       (user_id, customer_email, customer_name, status, total_gbp, currency,
        shipping_name, shipping_address, items)
     VALUES ($1, $2, $3, 'redemption_pending', 0, 'gbp', $4, $5, $6)
     RETURNING id`,
    [
      session.user.id,
      session.user.email,
      session.user.name || shippingName,
      shippingName,
      shippingAddress,
      JSON.stringify(items),
    ],
  );
  const orderId: number = order.rows[0].id;

  await query(
    `UPDATE vault_items SET redemption_order_id=$2 WHERE id=$1`,
    [item.id, orderId],
  );

  return NextResponse.json({
    redemption_order_id: orderId,
    vault_item_id: item.id,
    message: "Redemption requested. You'll receive a tracking update when it ships.",
  });
}
