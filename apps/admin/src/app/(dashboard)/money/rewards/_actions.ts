"use server";

/**
 * Rewards (prize fulfilment) — server actions.
 *
 * Three mutations: shipPrize, bulkShipCluster, markFulfilled. All wrapped in
 * adminAction() so the governance audit log fires automatically.
 *
 * Schema notes:
 *   - raffles uses `prize_fulfilled` boolean; mystery_box_opens + pack_opens
 *     use `fulfilled`. We dispatch on `kind`.
 *   - raffles + mystery_box_opens have `updated_at`; pack_opens does not.
 *   - The shipping email + the `prize_fulfilment_log` write happen in the
 *     storefront-internal `@/lib/rewards/*` modules. Admin can't import
 *     them; admin's adminAction governance log is the audit trail here.
 *     A shared-package extraction is the follow-up that re-unifies these
 *     two trails.
 *
 * Undo: not implemented in this chapel. The 30-min eligibility check lives
 *   in the storefront's prize_fulfilment_log helper. The page renders a
 *   deep-link to the legacy admin for the undo affordance.
 */

import { adminAction, ActionInputError } from "@/lib/actions";
import { sfQuery } from "@/lib/db";

type PrizeKind = "raffle" | "mystery_box" | "pack";

const VALID_KINDS: PrizeKind[] = ["raffle", "mystery_box", "pack"];

function tableFor(kind: PrizeKind): string {
  return kind === "raffle"
    ? "raffles"
    : kind === "mystery_box"
      ? "mystery_box_opens"
      : "pack_opens";
}

function fulfilledColFor(kind: PrizeKind): string {
  return kind === "raffle" ? "prize_fulfilled" : "fulfilled";
}

function hasUpdatedAt(kind: PrizeKind): boolean {
  return kind === "raffle" || kind === "mystery_box";
}

function userColFor(kind: PrizeKind): string {
  return kind === "raffle" ? "winner_user_id" : "user_id";
}

const MAX_BULK = 20;

export interface ShipPrizeInput {
  kind: PrizeKind;
  id: string;
  tracking?: string;
  carrier?: string;
  reason: string;
}

export async function shipPrize(input: ShipPrizeInput) {
  return adminAction({
    action: "prize.ship",
    targetKind: `prize:${input.kind}`,
    targetId: input.id,
    reason: input.reason,
    revalidate: "/money/rewards",
    run: async () => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason is required to ship a prize.");
      }
      if (!VALID_KINDS.includes(input.kind)) {
        throw new ActionInputError(`Invalid kind: ${input.kind}`);
      }
      const tracking = input.tracking?.trim() || null;
      const carrier = input.carrier?.trim() || null;

      const table = tableFor(input.kind);
      const updatedAt = hasUpdatedAt(input.kind) ? ", updated_at = NOW()" : "";

      const r = await sfQuery<{ id: string }>(
        `UPDATE ${table}
            SET tracking_number = COALESCE($2, tracking_number),
                carrier         = COALESCE($3, carrier),
                shipped_at      = NOW()
                ${updatedAt}
          WHERE id = $1 AND shipped_at IS NULL
          RETURNING id::text`,
        [input.id, tracking, carrier],
      );
      if (r.rows.length === 0) {
        throw new ActionInputError(
          `Prize not found, or already shipped (${input.kind} ${input.id}).`,
        );
      }
      return { kind: input.kind, id: input.id, tracking, carrier };
    },
  });
}

export interface BulkShipInput {
  prizes: { kind: PrizeKind; id: string }[];
  tracking?: string;
  carrier?: string;
  reason: string;
}

export async function bulkShipCluster(input: BulkShipInput) {
  return adminAction({
    action: "prize.bulk_ship",
    targetKind: "prize:bulk",
    targetId: input.prizes.map((p) => `${p.kind}:${p.id}`).join(","),
    reason: input.reason,
    revalidate: "/money/rewards",
    run: async () => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason is required to bulk-ship prizes.");
      }
      if (input.prizes.length === 0) {
        throw new ActionInputError("No prizes selected.");
      }
      if (input.prizes.length > MAX_BULK) {
        throw new ActionInputError(
          `Maximum ${MAX_BULK} prizes per shipment.`,
        );
      }
      for (const p of input.prizes) {
        if (!VALID_KINDS.includes(p.kind) || !p.id) {
          throw new ActionInputError(
            `Invalid prize reference: ${p.kind}:${p.id}`,
          );
        }
      }

      // Same-user check — bulk shipping presupposes one envelope.
      const ownerLookups = await Promise.all(
        input.prizes.map(async (p) => {
          const owner = await sfQuery<{ user_id: string }>(
            `SELECT ${userColFor(p.kind)}::text AS user_id
               FROM ${tableFor(p.kind)} WHERE id = $1`,
            [p.id],
          );
          if (owner.rows.length === 0) {
            throw new ActionInputError(
              `Prize not found: ${p.kind} ${p.id}`,
            );
          }
          return owner.rows[0]!.user_id;
        }),
      );
      const firstUser = ownerLookups[0];
      if (ownerLookups.some((u) => u !== firstUser)) {
        throw new ActionInputError(
          "All prizes in a bulk ship must belong to the same user.",
        );
      }

      const tracking = input.tracking?.trim() || null;
      const carrier = input.carrier?.trim() || null;

      // One UPDATE per kind — three kinds max so cost is bounded.
      let stamped = 0;
      for (const kind of VALID_KINDS) {
        const ids = input.prizes
          .filter((p) => p.kind === kind)
          .map((p) => p.id);
        if (ids.length === 0) continue;
        const table = tableFor(kind);
        const updatedAt = hasUpdatedAt(kind) ? ", updated_at = NOW()" : "";
        const r = await sfQuery<{ id: string }>(
          `UPDATE ${table}
              SET tracking_number = COALESCE($2, tracking_number),
                  carrier         = COALESCE($3, carrier),
                  shipped_at      = NOW()
                  ${updatedAt}
            WHERE id::text = ANY($1::text[])
              AND shipped_at IS NULL
            RETURNING id::text`,
          [ids, tracking, carrier],
        );
        stamped += r.rows.length;
      }
      if (stamped === 0) {
        throw new ActionInputError(
          "No prizes were shipped — all may already be marked shipped.",
        );
      }
      return { stamped, tracking, carrier };
    },
  });
}

export interface MarkFulfilledInput {
  kind: PrizeKind;
  id: string;
  reason: string;
}

export async function markFulfilled(input: MarkFulfilledInput) {
  return adminAction({
    action: "prize.fulfill",
    targetKind: `prize:${input.kind}`,
    targetId: input.id,
    reason: input.reason,
    revalidate: "/money/rewards",
    run: async () => {
      if (!input.reason.trim()) {
        throw new ActionInputError(
          "Reason is required to mark a prize fulfilled.",
        );
      }
      if (!VALID_KINDS.includes(input.kind)) {
        throw new ActionInputError(`Invalid kind: ${input.kind}`);
      }

      const table = tableFor(input.kind);
      const fulfilledCol = fulfilledColFor(input.kind);
      const updatedAt = hasUpdatedAt(input.kind) ? ", updated_at = NOW()" : "";

      const r = await sfQuery<{ id: string }>(
        `UPDATE ${table}
            SET ${fulfilledCol} = true ${updatedAt}
          WHERE id = $1 AND ${fulfilledCol} = false
          RETURNING id::text`,
        [input.id],
      );
      if (r.rows.length === 0) {
        throw new ActionInputError(
          `Prize not found or already fulfilled (${input.kind} ${input.id}).`,
        );
      }
      return { kind: input.kind, id: input.id };
    },
  });
}
