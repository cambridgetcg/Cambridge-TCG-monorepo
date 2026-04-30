"use server";

/**
 * Pricing — server actions.
 *
 * `setCardPrice` is the inline price edit — single-row mutation with the
 * before/after captured for governance audit.
 *
 * Future:
 *   - syncFromS3() — needs S3 fetch logic moved out of apps/wholesale
 *   - uploadCsv() — same
 */

import { adminAction, ActionInputError } from "@/lib/actions";
import { wsQuery } from "@/lib/db";

export interface SetCardPriceInput {
  cardId: number;
  /** New price in GBP. Null clears the override. */
  price: number | null;
  /** Optional reason for the change (audit). */
  reason?: string;
}

export async function setCardPrice(input: SetCardPriceInput) {
  return adminAction({
    action: "card.set_price",
    targetKind: "card",
    targetId: String(input.cardId),
    reason: input.reason ?? null,
    revalidate: "/commerce/pricing",
    run: async () => {
      if (!Number.isFinite(input.cardId) || input.cardId <= 0) {
        throw new ActionInputError("Invalid card id.");
      }
      if (input.price !== null) {
        if (!Number.isFinite(input.price) || input.price < 0 || input.price > 100_000) {
          throw new ActionInputError("Price must be between 0 and 100000.");
        }
      }

      const before = await wsQuery<{ sku: string; price: string | null; base_gbp: string | null }>(
        `SELECT sku, price::text, base_gbp::text FROM cards WHERE id = $1`,
        [input.cardId],
      );
      if (before.rows.length === 0) {
        throw new ActionInputError(`Card ${input.cardId} not found.`);
      }
      const prev = before.rows[0]!;

      const after = await wsQuery<{ price: string | null }>(
        `UPDATE cards
            SET price = $1
          WHERE id = $2
        RETURNING price::text`,
        [input.price, input.cardId],
      );

      return {
        sku: prev.sku,
        before: prev.price ? parseFloat(prev.price) : null,
        after: after.rows[0]!.price ? parseFloat(after.rows[0]!.price) : null,
      };
    },
  });
}
