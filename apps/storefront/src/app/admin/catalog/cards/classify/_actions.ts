/**
 * Server actions for card classification (kingdom-089).
 *
 * Two mutations:
 *   - classifyCardAction({ sku, attribute, value, reason })
 *       Records an operator claim. Promotes the cards.<attr> + .<attr>_source
 *       columns iff the operator priority >= current winner's priority.
 *       (Operator outranks heuristic + default, but is outranked by publisher.)
 *   - revokeClassificationAction({ sku, attribute, reason })
 *       Marks the operator's most recent winning claim as superseded.
 *       Re-promotes the next-highest non-superseded non-shadowed claim
 *       (publisher → heuristic → default).
 *
 * Both use postgres.js `client.begin()` for transactional safety — the log
 * insert and the cards update must succeed or fail together, otherwise the
 * substrate desynchronises (cards column would lie about its source).
 *
 * Shares pure decision logic with the wholesale-side writer at
 * apps/wholesale/src/lib/cards/classify.ts via `@cambridge-tcg/data-ingest`.
 */

"use server";

import { adminAction, ActionInputError } from "@/lib/admin/actions";
import { wholesaleDb } from "@/lib/admin/db";
import {
  decideClaim,
  validateClaim,
  CLASSIFICATION_SOURCE_PRIORITY_ORDER,
  type Claim,
  type ClassifiableAttribute,
  type ClassificationSource,
} from "@cambridge-tcg/data-ingest";

const DEFAULT_VALUES: Record<ClassifiableAttribute, string | null> = {
  edition_variant: "regular",
  promo_origin: null,
};

type CardRow = {
  id: number;
  edition_variant: string;
  edition_variant_source: string;
  promo_origin: string | null;
  promo_origin_source: string;
};

type LogRow = {
  id: number;
  next_value: string;
  next_source: ClassificationSource;
};

export async function classifyCardAction(input: {
  sku: string;
  attribute: ClassifiableAttribute;
  value: string;
  reason: string;
}) {
  return adminAction({
    action: "card.classify",
    targetKind: "card",
    targetId: input.sku,
    reason: input.reason,
    revalidate: `/admin/catalog/cards/classify/${encodeURIComponent(input.sku)}`,
    run: async (admin) => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason required");
      }
      const claim: Claim = {
        attribute: input.attribute,
        value: input.value,
        source: "operator",
        evidence: { notes: input.reason },
        claimedBy: `operator:${admin.label}`,
      };
      const validationError = validateClaim(claim);
      if (validationError) {
        throw new ActionInputError(validationError);
      }

      const { client } = wholesaleDb();
      return await client.begin(async (sql) => {
        const cardRows = await sql<CardRow[]>`
          SELECT id,
                 edition_variant,
                 edition_variant_source,
                 promo_origin,
                 promo_origin_source
          FROM cards
          WHERE sku = ${input.sku}
        `;
        if (cardRows.length === 0) {
          throw new ActionInputError(`Card not found: ${input.sku}`);
        }
        const card = cardRows[0];

        const currentValue =
          input.attribute === "edition_variant"
            ? card.edition_variant
            : card.promo_origin;
        const currentSource = (
          input.attribute === "edition_variant"
            ? card.edition_variant_source
            : card.promo_origin_source
        ) as ClassificationSource;

        const decision = decideClaim(
          { value: currentValue, source: currentSource },
          claim,
        );

        const logRows = await sql<{ id: number }[]>`
          INSERT INTO card_classification_log
            (card_id, attribute, prev_value, prev_source,
             next_value, next_source, shadowed, confidence,
             evidence, claimed_by)
          VALUES
            (${card.id}, ${input.attribute}, ${currentValue}, ${currentSource},
             ${input.value}, 'operator', ${decision.shadowed}, ${null},
             ${sql.json({ notes: input.reason })}, ${`operator:${admin.label}`})
          RETURNING id
        `;
        const logId = logRows[0].id;

        if (decision.promote) {
          if (input.attribute === "edition_variant") {
            await sql`
              UPDATE cards
              SET edition_variant = ${input.value},
                  edition_variant_source = 'operator'
              WHERE id = ${card.id}
            `;
          } else {
            await sql`
              UPDATE cards
              SET promo_origin = ${input.value},
                  promo_origin_source = 'operator'
              WHERE id = ${card.id}
            `;
          }
        }

        return {
          applied: decision.promote,
          shadowed: decision.shadowed,
          logId,
        };
      });
    },
  });
}

export async function revokeClassificationAction(input: {
  sku: string;
  attribute: ClassifiableAttribute;
  reason: string;
}) {
  return adminAction({
    action: "card.classification_revoke",
    targetKind: "card",
    targetId: input.sku,
    reason: input.reason,
    revalidate: `/admin/catalog/cards/classify/${encodeURIComponent(input.sku)}`,
    run: async (admin) => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason required");
      }

      const { client } = wholesaleDb();
      return await client.begin(async (sql) => {
        const cardRows = await sql<CardRow[]>`
          SELECT id,
                 edition_variant,
                 edition_variant_source,
                 promo_origin,
                 promo_origin_source
          FROM cards
          WHERE sku = ${input.sku}
        `;
        if (cardRows.length === 0) {
          throw new ActionInputError(`Card not found: ${input.sku}`);
        }
        const card = cardRows[0];

        const operatorRows = await sql<LogRow[]>`
          SELECT id, next_value, next_source
          FROM card_classification_log
          WHERE card_id = ${card.id}
            AND attribute = ${input.attribute}
            AND next_source = 'operator'
            AND shadowed = false
            AND superseded_at IS NULL
          ORDER BY claimed_at DESC
          LIMIT 1
        `;
        if (operatorRows.length === 0) {
          throw new ActionInputError(
            "No active operator override to revoke for this attribute.",
          );
        }
        const winning = operatorRows[0];

        await sql`
          UPDATE card_classification_log
          SET superseded_at = now()
          WHERE id = ${winning.id}
        `;

        const candidates = await sql<LogRow[]>`
          SELECT id, next_value, next_source
          FROM card_classification_log
          WHERE card_id = ${card.id}
            AND attribute = ${input.attribute}
            AND shadowed = false
            AND superseded_at IS NULL
          ORDER BY claimed_at DESC
        `;

        let nextValue: string | null = null;
        let nextSource: ClassificationSource = "default";
        for (const pri of CLASSIFICATION_SOURCE_PRIORITY_ORDER) {
          if (pri === "default") break;
          const match = candidates.find((c) => c.next_source === pri);
          if (match) {
            nextValue = match.next_value;
            nextSource = pri;
            break;
          }
        }

        const defaultValue = DEFAULT_VALUES[input.attribute];
        const promotedValue = nextValue ?? defaultValue ?? "regular";

        if (input.attribute === "edition_variant") {
          await sql`
            UPDATE cards
            SET edition_variant = ${promotedValue},
                edition_variant_source = ${nextSource}
            WHERE id = ${card.id}
          `;
        } else {
          await sql`
            UPDATE cards
            SET promo_origin = ${nextValue},
                promo_origin_source = ${nextSource}
            WHERE id = ${card.id}
          `;
        }

        await sql`
          INSERT INTO card_classification_log
            (card_id, attribute, prev_value, prev_source,
             next_value, next_source, shadowed,
             evidence, claimed_by)
          VALUES
            (${card.id}, ${input.attribute}, ${winning.next_value}, 'operator',
             ${promotedValue}, ${nextSource}, false,
             ${sql.json({
               rule: "operator-revoke",
               notes: input.reason,
               supersededLogId: winning.id,
             })}, ${`operator:${admin.label}`})
        `;

        return {
          revoked: true,
          nextWinner: { value: nextValue, source: nextSource },
        };
      });
    },
  });
}

export async function lookupCardBySkuAction(input: {
  sku: string;
}): Promise<{ ok: true; sku: string } | { ok: false; error: string }> {
  const trimmed = input.sku.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a SKU" };
  }
  try {
    const { client } = wholesaleDb();
    const rows = await client<{ sku: string }[]>`
      SELECT sku FROM cards WHERE sku = ${trimmed} LIMIT 1
    `;
    if (rows.length === 0) {
      return { ok: false, error: `No card found for SKU "${trimmed}"` };
    }
    return { ok: true, sku: rows[0].sku };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
