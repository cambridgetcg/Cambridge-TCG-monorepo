import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { getVaultLifecycle } from "@/lib/bounty/fulfilment-log";

// Per-item lifecycle for the customer-facing vault history page. Auth
// is scoped to user_id so users can only ever see items they own.
//
// We expose a slimmer slice than the admin endpoint — no internal
// metadata like prior_status (the user-facing view orders events
// chronologically and the action text is enough for them to follow).

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  const itemRes = await query(
    `SELECT v.*,
            co.tracking_number, co.carrier, co.shipped_at, co.status AS order_status
       FROM vault_items v
       LEFT JOIN customer_orders co ON co.id = v.redemption_order_id
      WHERE v.id = $1 AND v.user_id = $2`,
    [id, session.user.id],
  );
  if (itemRes.rows.length === 0) {
    return NextResponse.json({ error: "Vault item not found." }, { status: 404 });
  }

  const lifecycle = await getVaultLifecycle(id);
  return NextResponse.json({
    item: itemRes.rows[0],
    lifecycle: lifecycle.map((e) => ({
      action: e.action,
      notes: e.notes,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}
