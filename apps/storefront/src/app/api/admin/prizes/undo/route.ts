import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";
import {
  checkPrizeUndoEligibility,
  logPrizeTransition,
  type PrizeKind,
} from "@/lib/rewards/prize-fulfilment-log";

// Undo a recent prize ship action — clears tracking + shipped_at +
// carrier so admin can re-enter. Gated to 30 minutes after the ship
// event via the log table. Parallels the vault-item undo endpoint.
//
// Not destructive: address + fulfilled flag are preserved. Only the
// shipping stamp is rolled back so a mis-typed tracking number or
// wrong address fix becomes a one-click recovery instead of an RFC.

interface UndoBody {
  kind?: PrizeKind;
  id?: string;
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as UndoBody;
  const kind = body.kind;
  const id = body.id;

  if (!kind || !["raffle", "mystery_box", "pack"].includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const eligibility = await checkPrizeUndoEligibility(kind, id);
  if (!eligibility.eligible) {
    return NextResponse.json(
      { error: eligibility.reason ?? "Undo not available." },
      { status: 410 },
    );
  }

  const table =
    kind === "raffle" ? "raffles"
    : kind === "mystery_box" ? "mystery_box_opens"
    : "pack_opens";
  const fulfilledCol = kind === "raffle" ? "prize_fulfilled" : "fulfilled";
  const updatedAtClause = kind === "raffle" || kind === "mystery_box" ? ", updated_at = NOW()" : "";

  // Refuse undo once the prize has been marked final-fulfilled — the
  // customer has already received the completion signal and further
  // movement requires a support-managed correction.
  const check = await query(
    `SELECT ${fulfilledCol} AS fulfilled, shipped_at
       FROM ${table} WHERE id = $1`,
    [id],
  );
  if (check.rows.length === 0) {
    return NextResponse.json({ error: "Prize not found" }, { status: 404 });
  }
  if (check.rows[0].fulfilled) {
    return NextResponse.json(
      { error: "Prize is already marked fulfilled — support correction required." },
      { status: 409 },
    );
  }
  if (!check.rows[0].shipped_at) {
    return NextResponse.json(
      { error: "Prize is not in a shipped state." },
      { status: 409 },
    );
  }

  // Roll shipping stamps back. Address is preserved (the customer
  // typed it; they shouldn't have to re-enter just because admin
  // mistyped a tracking number).
  await query(
    `UPDATE ${table}
        SET tracking_number = NULL,
            carrier         = NULL,
            shipped_at      = NULL
            ${updatedAtClause}
      WHERE id = $1`,
    [id],
  );

  void logPrizeTransition({
    prizeKind: kind,
    prizeId: id,
    action: "undone",
    notes: `undone within ${eligibility.ageSeconds}s of ship`,
  });

  return NextResponse.json({
    undone: true,
    prize_kind: kind,
    prize_id: id,
    age_seconds: eligibility.ageSeconds,
  });
}
