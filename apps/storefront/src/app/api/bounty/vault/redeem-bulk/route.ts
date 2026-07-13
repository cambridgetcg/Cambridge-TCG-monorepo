import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { BOUNTY_PHONE_VERIFICATION_MESSAGE, getEligibility } from "@/lib/bounty/db";
import type { VaultItem } from "@/lib/bounty/db";

// Bulk vault redemption — one customer_order spanning N vault items.
//
// The single-item endpoint (../[id]/request-redeem) creates one order
// per item. That's painful for both the user (multiple shipping forms,
// multiple shipments, multiple shipping fees on our side) and admin
// (N orders to fulfil for one envelope of cards).
//
// This endpoint accepts an array of vault item IDs, validates each one
// against the same gate the single-item endpoint applies, and bundles
// them into a single redemption order. If ANY item fails validation
// the whole request is rejected — partial success would leave the user
// guessing which IDs landed.

interface RequestBody {
  vault_item_ids?: unknown;
  shipping_name?: string;
  shipping_address?: string;
}

const MAX_BULK_ITEMS = 50;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const ids = Array.isArray(body.vault_item_ids)
    ? (body.vault_item_ids as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const shippingName = (body.shipping_name ?? "").trim();
  const shippingAddress = (body.shipping_address ?? "").trim();

  if (ids.length === 0) {
    return NextResponse.json({ error: "Select at least one vault item." }, { status: 400 });
  }
  if (ids.length > MAX_BULK_ITEMS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_BULK_ITEMS} items per shipment.` },
      { status: 400 },
    );
  }
  if (shippingName.length < 2 || shippingAddress.length < 10) {
    return NextResponse.json({ error: "Shipping name and address required." }, { status: 400 });
  }

  const elig = await getEligibility(session.user.id);
  if (!elig.eligible) {
    return NextResponse.json(
      {
        error: elig.reasons.includes("phone_verification_unavailable")
          ? BOUNTY_PHONE_VERIFICATION_MESSAGE
          : "Bounty Board requires a prior paid order.",
        reasons: elig.reasons,
      },
      { status: 403 },
    );
  }

  // Single round-trip: load all candidate items scoped to this user.
  const itemsRes = await query(
    `SELECT * FROM vault_items WHERE id = ANY($1::uuid[]) AND user_id = $2`,
    [ids, session.user.id],
  );
  const items: VaultItem[] = itemsRes.rows;

  // Hard-fail if any requested ID is missing — better than silently
  // shipping a subset.
  if (items.length !== ids.length) {
    const found = new Set(items.map((i) => i.id));
    const missing = ids.filter((id) => !found.has(id));
    return NextResponse.json(
      { error: "Some vault items were not found.", missing },
      { status: 404 },
    );
  }

  const now = Date.now();
  const ineligible: { id: string; reason: string }[] = [];
  for (const it of items) {
    if (it.status !== "reserved") {
      ineligible.push({ id: it.id, reason: `status=${it.status}` });
      continue;
    }
    if (it.redemption_order_id) {
      ineligible.push({ id: it.id, reason: "already_pending" });
      continue;
    }
    if (now < new Date(it.p2p_hold_until).getTime()) {
      ineligible.push({ id: it.id, reason: "in_hold_period" });
    }
  }
  if (ineligible.length > 0) {
    return NextResponse.json(
      { error: "One or more items cannot be redeemed.", ineligible },
      { status: 409 },
    );
  }

  const orderItems = items.map((it) => ({
    type: "vault_redemption",
    vault_item_id: it.id,
    sku: it.sku,
    name: it.card_name,
    card_number: it.card_number,
    rarity: it.rarity,
    image_url: null,
    quantity: 1,
    spot_price_gbp: null,
  }));

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
      JSON.stringify(orderItems),
    ],
  );
  const orderId: number = order.rows[0].id;

  // Atomic-ish: stamp all items in a single UPDATE. If only some land we
  // have orphan vault rows referencing the order — recoverable via admin
  // but the bulk WHERE makes it a single SQL statement so it's effectively
  // all-or-nothing barring DB death.
  await query(
    `UPDATE vault_items SET redemption_order_id = $2
       WHERE id = ANY($1::uuid[]) AND user_id = $3`,
    [items.map((i) => i.id), orderId, session.user.id],
  );

  return NextResponse.json({
    redemption_order_id: orderId,
    vault_item_ids: items.map((i) => i.id),
    item_count: items.length,
    message: `${items.length} item${items.length === 1 ? "" : "s"} bundled into one shipment. You'll receive tracking when it ships.`,
  });
}
