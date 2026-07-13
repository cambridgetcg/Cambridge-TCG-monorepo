import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  drawOutcomeReplayReason,
  projectDrawProof,
} from "@/lib/privacy/draw-proof";
import { projectClientSeed } from "@/lib/privacy/proof-seed";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

// Public verification endpoint for any verifiable_draws row. Same
// shape/contract as /api/verify/pull/[id] — returns the public-safe
// slice of the commit-reveal data. Exact generic-draw replay also requires the
// ordered-weight array written by newer receipts; jsonb object order is never
// treated as evidence.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json(
      { error: "Invalid draw id." },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  const r = await query(
    `SELECT id, kind, user_id,
            commitment, server_seed, client_seed, nonce,
            weights, num_slots, outcome,
            committed_at, revealed_at,
            merkle_digest_id, merkle_leaf_index
       FROM verifiable_draws
      WHERE id = $1`,
    [id],
  );

  if (r.rows.length === 0) {
    return NextResponse.json(
      { error: "Draw not found." },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }

  const row = r.rows[0];

  const session = await auth();
  const clientSeed = projectClientSeed(
    row.client_seed,
    !!session?.user?.id && session.user.id === row.user_id,
  );
  const proof = projectDrawProof(row.weights, row.outcome);
  const hasExpectedOutcome = proof.outcome !== null && (
    "slots" in proof.outcome
      ? proof.outcome.slots.length === Number(row.num_slots)
      : Number(row.num_slots) === 1
  );
  const outcomeReplayReason = drawOutcomeReplayReason({
    revealed: !!row.revealed_at,
    hasServerSeed: !!row.server_seed,
    weightOrderStatus: proof.weightOrderStatus,
    clientSeedAvailable: clientSeed.outcomeReplayAvailable,
    hasExpectedOutcome,
  });

  return NextResponse.json({
    draw_id: row.id,
    kind: row.kind,
    commitment: row.commitment,
    server_seed: row.revealed_at ? row.server_seed : null,
    client_seed: clientSeed.clientSeed,
    client_seed_display: clientSeed.display,
    outcome_replay_available: outcomeReplayReason === null,
    outcome_replay_reason: outcomeReplayReason,
    client_seed_withheld: clientSeed.withheld,
    nonce: row.nonce != null ? Number(row.nonce) : null,
    weights: proof.weights,
    weight_order: proof.weightOrder,
    weight_order_status: proof.weightOrderStatus,
    num_slots: row.num_slots,
    outcome: proof.outcome,
    committed_at: row.committed_at,
    revealed_at: row.revealed_at,
    merkle_digest_id: row.merkle_digest_id,
    merkle_leaf_index: row.merkle_leaf_index,
  }, { headers: PRIVATE_NO_STORE });
}
