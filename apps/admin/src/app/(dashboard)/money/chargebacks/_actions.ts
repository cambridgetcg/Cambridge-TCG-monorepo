"use server";

/**
 * Chargebacks — server actions.
 *
 * Two mutations, both via adminAction (which handles auth, governance,
 * revalidate). Each also writes to chargeback_lifecycle_log so the
 * payment-integrity domain keeps its own narrative trail (mirrors what
 * the storefront route /api/admin/chargebacks PATCH did pre-migration).
 *
 *   annotate       — note appended to lifecycle log; no state change
 *   force_resolve  — overrides Stripe state to admin_resolved (terminal).
 *                    Doesn't push back to Stripe — local truth only.
 */

import { adminAction, ActionInputError } from "@/lib/actions";
import { sfQuery } from "@/lib/db";

const TERMINAL = ["won", "lost", "warning_closed", "charge_refunded", "admin_resolved"];

export interface AnnotateInput {
  id: string;
  reason: string;
}

export async function annotateChargeback(input: AnnotateInput) {
  return adminAction({
    action: "chargeback.annotate",
    targetKind: "chargeback",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/money/chargebacks",
    run: async (admin) => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason is required to annotate a chargeback.");
      }
      const before = await sfQuery<{ user_id: string | null; stripe_status: string }>(
        `SELECT user_id::text AS user_id, stripe_status
           FROM chargebacks WHERE stripe_dispute_id = $1`,
        [input.id],
      );
      if (before.rows.length === 0) {
        throw new ActionInputError(`Chargeback ${input.id} not found.`);
      }
      await sfQuery(
        `INSERT INTO chargeback_lifecycle_log
           (stripe_dispute_id, action, actor_label, reason)
         VALUES ($1, 'admin_override', $2, $3)`,
        [input.id, admin.label, input.reason],
      );
      return { id: input.id, status: before.rows[0]!.stripe_status };
    },
  });
}

export interface ForceResolveInput {
  id: string;
  reason: string;
}

export async function forceResolveChargeback(input: ForceResolveInput) {
  return adminAction({
    action: "chargeback.force_resolve",
    targetKind: "chargeback",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/money/chargebacks",
    run: async (admin) => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason is required to force-resolve a chargeback.");
      }
      const before = await sfQuery<{ user_id: string | null; stripe_status: string }>(
        `SELECT user_id::text AS user_id, stripe_status
           FROM chargebacks WHERE stripe_dispute_id = $1`,
        [input.id],
      );
      if (before.rows.length === 0) {
        throw new ActionInputError(`Chargeback ${input.id} not found.`);
      }
      const fromStatus = before.rows[0]!.stripe_status;
      if (TERMINAL.includes(fromStatus)) {
        throw new ActionInputError(
          `Chargeback ${input.id} is already terminal (${fromStatus}); nothing to resolve.`,
        );
      }
      await sfQuery(
        `UPDATE chargebacks
            SET stripe_status = 'admin_resolved', updated_at = NOW()
          WHERE stripe_dispute_id = $1`,
        [input.id],
      );
      await sfQuery(
        `INSERT INTO chargeback_lifecycle_log
           (stripe_dispute_id, action, actor_label, reason)
         VALUES ($1, 'admin_override', $2, $3)`,
        [
          input.id,
          admin.label,
          input.reason || "Admin marked resolved without Stripe-side state change",
        ],
      );
      return { id: input.id, from: fromStatus, to: "admin_resolved" };
    },
  });
}
