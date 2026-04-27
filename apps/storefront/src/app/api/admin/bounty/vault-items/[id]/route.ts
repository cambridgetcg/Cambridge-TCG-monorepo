import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";
import { getVaultLifecycle } from "@/lib/bounty/fulfilment-log";

// Admin-side single vault-item view. Returns the item snapshot, the
// owning user, the parent redemption order (if any), and the full
// lifecycle log so support can reconstruct what happened from
// acquisition through whatever terminal state the item is in.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const itemRes = await query(
    `SELECT v.*, u.email AS user_email, u.name AS user_name,
            co.id AS order_id, co.status AS order_status,
            co.tracking_number, co.carrier, co.shipped_at, co.shipping_name,
            co.shipping_address
       FROM vault_items v
       LEFT JOIN users u ON u.id = v.user_id
       LEFT JOIN customer_orders co ON co.id = v.redemption_order_id
      WHERE v.id = $1`,
    [id],
  );
  if (itemRes.rows.length === 0) {
    return NextResponse.json({ error: "Vault item not found." }, { status: 404 });
  }

  const lifecycle = await getVaultLifecycle(id);

  return NextResponse.json({
    item: itemRes.rows[0],
    lifecycle: lifecycle.map((e) => ({
      id: e.id,
      action: e.action,
      priorStatus: e.priorStatus,
      notes: e.notes,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
      orderId: e.orderId,
    })),
  });
}
