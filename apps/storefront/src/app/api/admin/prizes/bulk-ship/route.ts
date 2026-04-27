import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";
import {
  logPrizeTransition,
  type PrizeKind,
} from "@/lib/rewards/prize-fulfilment-log";

// Bulk-ship endpoint — stamps tracking + carrier + shipped_at on N
// prizes bound to the same user + address in a single request, and
// sends ONE bundled email instead of N per-prize emails.
//
// Parallels the vault bulk-fulfil endpoint. The client is trusted to
// pre-group prizes that go in one envelope; we validate the group is
// coherent (same user_id) before shipping.

interface PrizeRef {
  kind: PrizeKind;
  id: string;
}

interface RequestBody {
  prizes?: PrizeRef[];
  tracking?: string;
  carrier?: string;
}

const MAX_BULK_PRIZES = 20;
const VALID_KINDS: PrizeKind[] = ["raffle", "mystery_box", "pack"];

function tableFor(kind: PrizeKind): string {
  return kind === "raffle" ? "raffles"
    : kind === "mystery_box" ? "mystery_box_opens"
    : "pack_opens";
}

// labelSelectFor inlines the owner column in its SELECT (raffles use
// winner_user_id; mystery_box and pack use user_id), so no separate
// helper is needed.

function labelSelectFor(kind: PrizeKind): string {
  if (kind === "raffle") {
    return `SELECT r.title AS label, u.id::text AS user_id, u.email, u.name
              FROM raffles r JOIN users u ON u.id = r.winner_user_id
             WHERE r.id = $1`;
  }
  if (kind === "mystery_box") {
    return `SELECT mb.title AS label, u.id::text AS user_id, u.email, u.name
              FROM mystery_box_opens mbo JOIN users u ON u.id = mbo.user_id
              JOIN mystery_boxes mb ON mb.id = mbo.box_id WHERE mbo.id = $1`;
  }
  return `SELECT p.title AS label, u.id::text AS user_id, u.email, u.name
            FROM pack_opens po JOIN users u ON u.id = po.user_id
            JOIN reward_packs p ON p.id = po.pack_id WHERE po.id = $1`;
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const prizes = Array.isArray(body.prizes) ? body.prizes : [];
  const tracking = (body.tracking ?? "").trim().slice(0, 100) || null;
  const carrier = (body.carrier ?? "").trim().slice(0, 50) || null;

  if (prizes.length === 0) {
    return NextResponse.json({ error: "No prizes selected." }, { status: 400 });
  }
  if (prizes.length > MAX_BULK_PRIZES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_BULK_PRIZES} prizes per shipment.` },
      { status: 400 },
    );
  }
  for (const p of prizes) {
    if (!p?.id || !VALID_KINDS.includes(p.kind)) {
      return NextResponse.json({ error: "Invalid prize reference in request." }, { status: 400 });
    }
  }

  // Fetch each prize's owner + label so we can validate the group
  // shares a user_id and enrich the audit log + email.
  const enriched: Array<{ kind: PrizeKind; id: string; label: string; user_id: string; email: string | null; name: string | null }> = [];
  for (const p of prizes) {
    const r = await query(labelSelectFor(p.kind), [p.id]);
    if (r.rows.length === 0) {
      return NextResponse.json(
        { error: `Prize not found: ${p.kind} ${p.id}` },
        { status: 404 },
      );
    }
    enriched.push({
      kind: p.kind,
      id: p.id,
      label: r.rows[0].label,
      user_id: r.rows[0].user_id,
      email: r.rows[0].email ?? null,
      name: r.rows[0].name ?? null,
    });
  }

  const firstUser = enriched[0].user_id;
  const mismatched = enriched.find((e) => e.user_id !== firstUser);
  if (mismatched) {
    return NextResponse.json(
      { error: "All prizes in a bulk ship must belong to the same user." },
      { status: 409 },
    );
  }

  // Stamp ship on each prize. One UPDATE per kind for brevity; we only
  // have three kinds so the cost is bounded.
  const stamped: string[] = [];
  for (const kind of VALID_KINDS) {
    const ids = enriched.filter((e) => e.kind === kind).map((e) => e.id);
    if (ids.length === 0) continue;
    const table = tableFor(kind);
    const updatedAtClause = kind === "raffle" || kind === "mystery_box" ? ", updated_at = NOW()" : "";
    await query(
      `UPDATE ${table}
          SET tracking_number = COALESCE($2, tracking_number),
              carrier         = COALESCE($3, carrier),
              shipped_at      = NOW()
              ${updatedAtClause}
        WHERE id::text = ANY($1::text[])`,
      [ids, tracking, carrier],
    );
    for (const id of ids) stamped.push(`${kind}:${id}`);
  }

  // Append a log row per prize so undo-eligibility stays per-prize.
  for (const p of enriched) {
    void logPrizeTransition({
      prizeKind: p.kind,
      prizeId: p.id,
      userId: p.user_id,
      action: "shipped",
      notes: `bulk tracking=${tracking ?? ""} carrier=${carrier ?? ""}`,
      metadata: { bulk_group_size: enriched.length, tracking, carrier },
    });
  }

  // Single bundled email — mirrors the vault bundled-shipment email.
  const firstEmail = enriched[0].email;
  const firstName = enriched[0].name;
  if (firstEmail) {
    try {
      const { sendPrizeBundleShippedEmail } = await import("@/lib/rewards/email");
      void sendPrizeBundleShippedEmail({
        email: firstEmail,
        name: firstName,
        prizeLabels: enriched.map((e) => e.label),
        trackingNumber: tracking,
        carrier,
      }).catch((err) => console.error("[prize-bulk-ship] email failed:", err));
    } catch (err) {
      console.error("[prize-bulk-ship] email import failed:", err);
    }
  }

  return NextResponse.json({
    shipped: true,
    count: stamped.length,
    tracking,
    carrier,
    stamped,
  });
}
