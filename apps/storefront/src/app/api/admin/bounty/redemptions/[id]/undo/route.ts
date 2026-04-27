import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";
import { checkUndoEligibility, logFulfilment } from "@/lib/bounty/fulfilment-log";

// Undo a recent vault redemption fulfilment.
//
// Misclick recovery: admin marks an item shipped that wasn't actually
// in the envelope. Within 30 minutes of the fulfilled-event we let
// them flip the item back to 'reserved' and roll the order's status
// to whatever it should be given remaining sibling state.
//
// Past the 30-min window we refuse — the customer's email already
// landed and we shouldn't pretend otherwise. Past that point support
// has to handle it manually with a note to the user.

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const itemRes = await query(
    `SELECT id, status, redemption_order_id FROM vault_items WHERE id = $1`,
    [id],
  );
  if (itemRes.rows.length === 0) {
    return NextResponse.json({ error: "Vault item not found." }, { status: 404 });
  }
  const item = itemRes.rows[0];
  if (item.status !== "redeemed") {
    return NextResponse.json(
      { error: `Item is not in 'redeemed' state (currently '${item.status}'); nothing to undo.` },
      { status: 409 },
    );
  }

  const eligibility = await checkUndoEligibility(id);
  if (!eligibility.eligible) {
    return NextResponse.json(
      { error: eligibility.reason ?? "Undo not available." },
      { status: 410 },
    );
  }

  const orderId: number | null = item.redemption_order_id ?? null;

  // Roll the item back. Clear fulfilled_at — the timeline of events lives
  // in vault_fulfilment_log, not in this column.
  await query(
    `UPDATE vault_items SET status = 'reserved', fulfilled_at = NULL WHERE id = $1`,
    [id],
  );

  // Roll the order back. If sibling items still remain redeemed → the
  // order is mid-fulfilment again ('shipped'/'partially_shipped'). If
  // none remain → order returns to redemption_pending and we clear
  // shipped_at so a future fulfil starts fresh.
  if (orderId !== null) {
    const sibs = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'redeemed')::int AS shipped,
         COUNT(*) FILTER (WHERE status = 'reserved')::int AS reserved
       FROM vault_items WHERE redemption_order_id = $1`,
      [orderId],
    );
    const { shipped, reserved } = sibs.rows[0] ?? { shipped: 0, reserved: 0 };
    if (shipped === 0) {
      // Whole order reverts to pending; nuke shipped_at + tracking so the
      // next fulfilment starts clean.
      await query(
        `UPDATE customer_orders
            SET status = 'redemption_pending',
                shipped_at = NULL,
                tracking_number = NULL,
                carrier = NULL
          WHERE id = $1`,
        [orderId],
      );
    } else if (reserved > 0) {
      // Mid-fulfilment again.
      await query(
        `UPDATE customer_orders SET status = 'partially_shipped' WHERE id = $1`,
        [orderId],
      );
    }
    // If shipped>0 && reserved=0 the order is fully shipped and stays
    // 'completed' — undoing one item out of an already-completed bulk
    // would have been blocked by the eligibility window in practice.
  }

  void logFulfilment({
    vaultItemId: id,
    orderId,
    action: "undone",
    notes: `undone within ${eligibility.ageSeconds}s of fulfilment`,
  });

  return NextResponse.json({
    undone: true,
    vault_item_id: id,
    order_id: orderId,
    age_seconds: eligibility.ageSeconds,
  });
}
