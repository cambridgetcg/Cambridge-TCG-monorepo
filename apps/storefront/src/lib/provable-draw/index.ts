// Unified draw-receipt primitive (legacy directory name retained).
//
// Every weighted-draw surface can run through this library and land a
// verifiable row in `verifiable_draws`. The consumer calls:
//
//   const draw = await commitDraw({ kind, userId, weights, numSlots: 1 });
//   // ...do any work you want — the seed is already locked in...
//   const outcome = await revealDraw(draw, { picked: ... });
//
// For single-slot surfaces use `rollSingleSlot` which handles the math
// in one call. For multi-slot (packs), call `rollSlot` per slot and
// batch the results into one reveal.
//
// The rng helpers are re-used from @/lib/bounty/rng so the math is the
// same for every surface — that's the whole point of the unified
// primitive: one verifier, one certificate format, one aggregate.

import { query } from "@/lib/db";
import {
  sha256,
  generateServerSeed,
  generateClientSeedSuffix,
  generateNonce,
  rollFloat,
} from "@/lib/bounty/rng";
import {
  captureOrderedWeights,
  pickWeightedInOrder,
  withWeightOrder,
} from "./ordered-weights";

export type DrawKind =
  | "pack_open"
  | "spin_wheel"
  | "mystery_box"
  | "raffle_draw"
  | "custom";

export interface CommittedDraw {
  id: string;
  kind: DrawKind;
  serverSeed: string;
  commitment: string;
  clientSeed: string;
  nonce: number;
  weights: Record<string, number>;
  weightOrder: string[];
  numSlots: number;
}

export interface CommitArgs {
  kind: DrawKind;
  userId: string | null;
  subjectId?: string | null;
  weights: Record<string, number>;
  numSlots?: number;
}

/**
 * Phase 1: insert a verifiable_draws row with seed + hash + nonce +
 * weights BEFORE rolling. committed_at is set server-side. The caller
 * uses the returned seed to roll, then calls revealDraw to stamp the
 * outcome.
 */
export async function commitDraw(args: CommitArgs): Promise<CommittedDraw> {
  const serverSeed = generateServerSeed();
  const commitment = sha256(serverSeed);
  // This value is revealed with the proof, so it must not contain an account
  // identifier. userId remains an internal ownership column only.
  const clientSeed = `draw:${generateClientSeedSuffix()}`;
  const nonce = generateNonce();
  const numSlots = args.numSlots ?? 1;
  const orderedWeights = captureOrderedWeights(args.weights);

  const r = await query(
    `INSERT INTO verifiable_draws
       (kind, subject_id, user_id,
        commitment, server_seed, client_seed, nonce,
        weights, num_slots)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     RETURNING id`,
    [
      args.kind,
      args.subjectId ?? null,
      args.userId,
      commitment,
      serverSeed,
      clientSeed,
      nonce,
      JSON.stringify(orderedWeights.weights),
      numSlots,
    ],
  );

  return {
    id: r.rows[0].id,
    kind: args.kind,
    serverSeed,
    commitment,
    clientSeed,
    nonce,
    weights: orderedWeights.weights,
    weightOrder: orderedWeights.weightOrder,
    numSlots,
  };
}

/**
 * Deterministic roll for a specific slot index of a committed draw.
 * Slot N uses `nonce + N` so each slot in a pack produces an
 * independent draw that still verifies from the same seed + nonce.
 */
export function rollSlot<T extends string>(draw: CommittedDraw, slotIndex: number = 0): {
  roll: number;
  picked: T;
} {
  const roll = rollFloat(draw.serverSeed, draw.clientSeed, draw.nonce + slotIndex);
  const picked = pickWeightedInOrder(
    draw.weights,
    draw.weightOrder,
    roll,
  ) as T;
  return { roll, picked };
}

/**
 * Shortcut for single-slot surfaces: commit, roll slot 0, reveal,
 * return the picked key. Returns both the picked value and the full
 * draw record so callers can link to /verify/draw/[id].
 */
export async function rollSingleSlot<T extends string>(args: CommitArgs): Promise<{
  draw: CommittedDraw;
  roll: number;
  picked: T;
}> {
  const draw = await commitDraw(args);
  const { roll, picked } = rollSlot<T>(draw, 0);
  await revealDraw(draw, { picked, roll });
  return { draw, roll, picked };
}

export type SingleOutcome = { picked: string; roll: number };
export type MultiOutcome = { slots: Array<{ picked: string; roll: number; extra?: unknown }> };
export type DrawOutcome = SingleOutcome | MultiOutcome;

/**
 * Phase 2: stamp the draw's outcome + revealed_at. The ordered key array is
 * added here automatically. JSON arrays survive a jsonb round trip in order,
 * unlike object keys, so later verifiers can reproduce the same weighted pick.
 */
export async function revealDraw(draw: CommittedDraw, outcome: DrawOutcome): Promise<void> {
  const storedOutcome = withWeightOrder(outcome, draw.weightOrder);
  await query(
    `UPDATE verifiable_draws
        SET outcome = $2::jsonb, revealed_at = NOW()
      WHERE id = $1 AND revealed_at IS NULL`,
    [draw.id, JSON.stringify(storedOutcome)],
  );
}
