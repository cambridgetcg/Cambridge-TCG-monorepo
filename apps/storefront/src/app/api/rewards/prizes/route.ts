import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

// GET — list the user's outstanding physical prizes (raffle wins,
// mystery-box physical pulls, pack physical pulls). Each row carries the
// fulfillment state so the UI can prompt for shipping address when needed.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const userId = session.user.id;

  // Raffle wins
  const raffles = await query(
    `SELECT 'raffle'::text AS kind, id::text AS id, title AS label,
            prize_description, prize_image_url AS image_url,
            shipping_address, shipping_collected_at,
            tracking_number, carrier, shipped_at, prize_fulfilled AS fulfilled,
            winner_drawn_at AS won_at
       FROM raffles
      WHERE winner_user_id = $1
      ORDER BY winner_drawn_at DESC NULLS LAST`,
    [userId]
  );

  // Mystery box opens — physical reward type only
  const boxes = await query(
    `SELECT 'mystery_box'::text AS kind, mbo.id::text AS id, mb.title AS label,
            mr.description AS prize_description, mr.image_url,
            mbo.shipping_address, mbo.shipping_collected_at,
            mbo.tracking_number, mbo.carrier, mbo.shipped_at, mbo.fulfilled,
            mbo.created_at AS won_at
       FROM mystery_box_opens mbo
       JOIN mystery_box_rewards mr ON mr.id = mbo.reward_id
       JOIN mystery_boxes mb ON mb.id = mbo.box_id
      WHERE mbo.user_id = $1
        AND mr.reward_type = 'physical'
      ORDER BY mbo.created_at DESC`,
    [userId]
  );

  // Pack opens — at least one physical card pulled
  const packs = await query(
    `SELECT 'pack'::text AS kind, po.id::text AS id, p.title AS label,
            'Pack pull (see contents)'::text AS prize_description,
            NULL::text AS image_url,
            po.shipping_address, po.shipping_collected_at,
            po.tracking_number, po.carrier, po.shipped_at, po.fulfilled,
            po.created_at AS won_at
       FROM pack_opens po
       JOIN reward_packs p ON p.id = po.pack_id
      WHERE po.user_id = $1
        AND po.cards::text ILIKE '%"reward_type":"physical"%'
      ORDER BY po.created_at DESC`,
    [userId]
  );

  const prizes = [...raffles.rows, ...boxes.rows, ...packs.rows].sort(
    (a, b) => new Date(b.won_at).getTime() - new Date(a.won_at).getTime()
  );
  return NextResponse.json({ prizes });
}

// POST — customer submits a shipping address for a prize.
// Body: { kind: 'raffle' | 'mystery_box' | 'pack', id, address }
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const userId = session.user.id;
  const body = await request.json().catch(() => ({}));
  const kind = body.kind;
  const id = body.id;
  const address = (body.address as string | undefined)?.trim();

  if (!address || address.length < 10) {
    return NextResponse.json({ error: "Shipping address is required (10+ chars)" }, { status: 400 });
  }
  if (!["raffle", "mystery_box", "pack"].includes(kind)) {
    return NextResponse.json({ error: "Invalid prize kind" }, { status: 400 });
  }

  // Per-kind ownership-checked update
  let updated;
  if (kind === "raffle") {
    updated = await query(
      `UPDATE raffles
          SET shipping_address = $2, shipping_collected_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND winner_user_id = $3 RETURNING id`,
      [id, address, userId]
    );
  } else if (kind === "mystery_box") {
    updated = await query(
      `UPDATE mystery_box_opens
          SET shipping_address = $2, shipping_collected_at = NOW()
        WHERE id = $1 AND user_id = $3 RETURNING id`,
      [id, address, userId]
    );
  } else {
    updated = await query(
      `UPDATE pack_opens
          SET shipping_address = $2, shipping_collected_at = NOW()
        WHERE id = $1 AND user_id = $3 RETURNING id`,
      [id, address, userId]
    );
  }

  if (updated.rows.length === 0) {
    return NextResponse.json({ error: "Prize not found or not yours" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
