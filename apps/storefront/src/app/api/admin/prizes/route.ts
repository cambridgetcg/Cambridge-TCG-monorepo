import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// GET — admin queue: physical prizes awaiting fulfillment, unified across
// raffle wins + mystery box opens + pack opens. Ordered oldest-first so
// admin works the longest-waiting customer first.
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raffles = await query(
    `SELECT 'raffle'::text AS kind, r.id::text AS id, r.title AS label,
            r.prize_description, u.id::text AS user_id, u.email AS user_email, u.name AS user_name,
            r.shipping_address, r.shipping_collected_at,
            r.tracking_number, r.carrier, r.shipped_at, r.prize_fulfilled AS fulfilled,
            r.winner_drawn_at AS won_at
       FROM raffles r
       JOIN users u ON u.id = r.winner_user_id
      WHERE r.winner_user_id IS NOT NULL AND r.prize_fulfilled = false
      ORDER BY r.winner_drawn_at ASC`
  );

  const boxes = await query(
    `SELECT 'mystery_box'::text AS kind, mbo.id::text AS id, mb.title AS label,
            mr.description AS prize_description, u.id::text AS user_id, u.email AS user_email, u.name AS user_name,
            mbo.shipping_address, mbo.shipping_collected_at,
            mbo.tracking_number, mbo.carrier, mbo.shipped_at, mbo.fulfilled,
            mbo.created_at AS won_at
       FROM mystery_box_opens mbo
       JOIN mystery_box_rewards mr ON mr.id = mbo.reward_id
       JOIN mystery_boxes mb ON mb.id = mbo.box_id
       JOIN users u ON u.id = mbo.user_id
      WHERE mr.reward_type = 'physical' AND mbo.fulfilled = false
      ORDER BY mbo.created_at ASC`
  );

  const packs = await query(
    `SELECT 'pack'::text AS kind, po.id::text AS id, p.title AS label,
            'Physical card pulls'::text AS prize_description,
            u.id::text AS user_id, u.email AS user_email, u.name AS user_name,
            po.shipping_address, po.shipping_collected_at,
            po.tracking_number, po.carrier, po.shipped_at, po.fulfilled,
            po.created_at AS won_at
       FROM pack_opens po
       JOIN reward_packs p ON p.id = po.pack_id
       JOIN users u ON u.id = po.user_id
      WHERE po.fulfilled = false
        AND po.cards::text ILIKE '%"reward_type":"physical"%'
      ORDER BY po.created_at ASC`
  );

  const prizes = [...raffles.rows, ...boxes.rows, ...packs.rows].sort(
    (a, b) => new Date(a.won_at).getTime() - new Date(b.won_at).getTime()
  );

  return NextResponse.json({ prizes });
}

// PATCH — admin marks shipped + tracking number, OR marks fulfilled.
// Body: { kind, id, action: 'ship' | 'fulfill', trackingNumber? }
export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const kind = body.kind;
  const id = body.id;
  const action = body.action;
  const tracking = (body.trackingNumber as string | undefined)?.trim() || null;
  const carrier = (body.carrier as string | undefined)?.trim() || null;

  if (!["raffle", "mystery_box", "pack"].includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (!["ship", "fulfill"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const isShip = action === "ship";
  const fulfilledCol = kind === "raffle" ? "prize_fulfilled" : "fulfilled";

  // Build SET clause depending on action. Ship also stamps carrier so
  // the email can render a clickable tracking link.
  const setClause = isShip
    ? `tracking_number = COALESCE($2, tracking_number),
       carrier         = COALESCE($3, carrier),
       shipped_at      = NOW()`
    : `${fulfilledCol} = true`;

  const table = kind === "raffle" ? "raffles"
              : kind === "mystery_box" ? "mystery_box_opens"
              : "pack_opens";
  const updatedAtClause = kind === "raffle" || kind === "mystery_box" ? ", updated_at = NOW()" : "";

  const r = await query(
    `UPDATE ${table} SET ${setClause}${updatedAtClause}
      WHERE id = $1 RETURNING id`,
    isShip ? [id, tracking, carrier] : [id]
  );
  if (r.rows.length === 0) {
    return NextResponse.json({ error: "Prize not found" }, { status: 404 });
  }

  // Notify customer on shipment (fire-and-forget). For 'fulfill' (final)
  // we keep it silent — the customer already saw the shipped notification.
  if (isShip) {
    try {
      // Look up email + label + user_id (for the audit log)
      const lookup = await query(
        kind === "raffle"
          ? `SELECT u.id AS user_id, u.email, u.name, r.title AS label
               FROM raffles r JOIN users u ON u.id = r.winner_user_id WHERE r.id = $1`
          : kind === "mystery_box"
          ? `SELECT u.id AS user_id, u.email, u.name, mb.title AS label
               FROM mystery_box_opens mbo JOIN users u ON u.id = mbo.user_id
               JOIN mystery_boxes mb ON mb.id = mbo.box_id WHERE mbo.id = $1`
          : `SELECT u.id AS user_id, u.email, u.name, p.title AS label
               FROM pack_opens po JOIN users u ON u.id = po.user_id
               JOIN reward_packs p ON p.id = po.pack_id WHERE po.id = $1`,
        [id]
      );
      const row = lookup.rows[0];
      if (row?.email) {
        const { sendPrizeShippedEmail } = await import("@/lib/rewards/email");
        sendPrizeShippedEmail({
          email: row.email,
          name: row.name,
          prizeLabel: row.label,
          trackingNumber: tracking,
          carrier,
        }).catch((err) => console.error("[prize-fulfill] ship email failed:", err));
      }

      // Append to the prize lifecycle log (fire-and-forget).
      const { logPrizeTransition } = await import("@/lib/rewards/prize-fulfilment-log");
      void logPrizeTransition({
        prizeKind: kind,
        prizeId: String(id),
        userId: row?.user_id ?? null,
        action: "shipped",
        notes: tracking ? `tracking=${tracking} carrier=${carrier ?? ""}` : "no tracking",
        metadata: tracking || carrier ? { tracking, carrier } : null,
      });
    } catch {
      // ignore — admin op succeeded; email + log are best-effort
    }
  }

  return NextResponse.json({ ok: true });
}
