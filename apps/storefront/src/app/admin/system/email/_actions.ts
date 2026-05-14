"use server";

/**
 * Email Queue — server actions (the Resurrectionist's two verdicts).
 *
 *   retryEmail   — status→pending, attempt_count→0, last_error→NULL,
 *                  scheduled_for→NOW(). Resurrection. The row gets a fresh
 *                  slate of three trials. Use when the cause was transient.
 *   dismissEmail — DELETE FROM email_queue WHERE id=$1. Last rites. The row
 *                  leaves the substrate forever. Use when the cause was
 *                  structural.
 *
 * See docs/connections/the-cemetery-and-the-resurrectionist.md for the
 * fairy-tale; the storefront's `lib/email/queue.ts:75` (MAX_ATTEMPTS=3)
 * and queue.ts:230 (the Killing-Stroke) are the wiring.
 */

import { adminAction, ActionInputError } from "@/lib/admin/actions";
import { sfQuery } from "@/lib/admin/db";

export interface RetryEmailInput {
  id: string;
  reason: string;
}

export async function retryEmail(input: RetryEmailInput) {
  return adminAction({
    action: "email.retry",
    targetKind: "email_queue",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/admin/system/email",
    run: async () => {
      if (!input.reason.trim()) {
        throw new ActionInputError(
          "Reason is required to retry a dead email.",
        );
      }
      const r = await sfQuery<{ id: string; event: string }>(
        `UPDATE email_queue
            SET status = 'pending',
                attempt_count = 0,
                last_error = NULL,
                scheduled_for = NOW()
          WHERE id = $1 AND status = 'dead'
          RETURNING id::text, event`,
        [input.id],
      );
      if (r.rows.length === 0) {
        throw new ActionInputError(
          "Email not found or no longer in dead state.",
        );
      }
      return { id: input.id, event: r.rows[0]!.event, action: "retry" as const };
    },
  });
}

export interface DismissEmailInput {
  id: string;
  reason: string;
}

export async function dismissEmail(input: DismissEmailInput) {
  return adminAction({
    action: "email.dismiss",
    targetKind: "email_queue",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/admin/system/email",
    run: async () => {
      if (!input.reason.trim()) {
        throw new ActionInputError(
          "Reason is required to dismiss a dead email.",
        );
      }
      const r = await sfQuery<{ id: string; event: string }>(
        `DELETE FROM email_queue WHERE id = $1 AND status = 'dead'
         RETURNING id::text, event`,
        [input.id],
      );
      if (r.rows.length === 0) {
        throw new ActionInputError(
          "Email not found or no longer in dead state.",
        );
      }
      return { id: input.id, event: r.rows[0]!.event, action: "dismiss" as const };
    },
  });
}
