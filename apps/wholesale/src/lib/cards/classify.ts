/**
 * Card-classification writer — the SQL side of the layered classifier
 * defined in `@cambridge-tcg/data-ingest/classifier`.
 *
 * Two operations:
 *
 *   applyClassification(cardId, claim)
 *     Records the claim in card_classification_log. Promotes the
 *     denormalized winner column on cards iff the claim is >= the
 *     current winner's priority. Both writes run as one transaction.
 *
 *   revokeClassification(cardId, attribute, revokedBy)
 *     Marks the most recent operator-source winning claim as
 *     superseded, then re-promotes the next-highest non-superseded
 *     non-shadowed claim. If no other claim exists, falls back to the
 *     attribute's default value ('regular' / NULL).
 *
 * Companions:
 *   - packages/data-ingest/src/classifier.ts (the pure decision logic)
 *   - apps/wholesale/drizzle/drafts/0018_card_financial_attributes.sql.draft
 *   - docs/methodology/edition-variants
 */

import { eq, and, desc, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { cards, cardClassificationLog } from "@/lib/db/schema";
import {
  decideClaim,
  validateClaim,
  CLASSIFICATION_SOURCE_PRIORITY_ORDER,
  type Claim,
  type ClassifiableAttribute,
  type ClassificationSource,
  type CurrentWinner,
} from "@cambridge-tcg/data-ingest";

export type ApplyResult = {
  /** Promoted to the denormalized winner column on cards. */
  applied: boolean;
  /** Logged but not promoted (lower priority than current winner). */
  shadowed: boolean;
  /** card_classification_log row id. */
  logId: number;
};

export type RevokeResult = {
  /** True if an operator override was found and revoked. */
  revoked: boolean;
  /** The winner after revoke ('default' if no other claim exists). */
  nextWinner: { value: string | null; source: ClassificationSource };
};

const DEFAULT_VALUES: Record<ClassifiableAttribute, string | null> = {
  edition_variant: "regular",
  promo_origin: null,
};

/**
 * Apply a classification claim. Always writes a log row. Promotes the
 * cards.<attr> + cards.<attr>_source columns iff the claim is >= the
 * current winner's priority.
 *
 * Throws on invalid claim (vocabulary violation, missing card, missing
 * heuristic confidence). Callers should catch and report.
 */
export async function applyClassification(
  cardId: number,
  claim: Claim,
): Promise<ApplyResult> {
  const validationError = validateClaim(claim);
  if (validationError) {
    throw new Error(`Invalid classification claim: ${validationError}`);
  }

  return await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        editionVariant: cards.editionVariant,
        editionVariantSource: cards.editionVariantSource,
        promoOrigin: cards.promoOrigin,
        promoOriginSource: cards.promoOriginSource,
      })
      .from(cards)
      .where(eq(cards.id, cardId));
    if (rows.length === 0) {
      throw new Error(`Card not found: ${cardId}`);
    }
    const row = rows[0];

    const current: CurrentWinner =
      claim.attribute === "edition_variant"
        ? {
            value: row.editionVariant,
            source: row.editionVariantSource as ClassificationSource,
          }
        : {
            value: row.promoOrigin,
            source: row.promoOriginSource as ClassificationSource,
          };

    const decision = decideClaim(current, claim);

    const logResult = await tx
      .insert(cardClassificationLog)
      .values({
        cardId,
        attribute: claim.attribute,
        prevValue: current.value,
        prevSource: current.source,
        nextValue: claim.value,
        nextSource: claim.source,
        shadowed: decision.shadowed,
        confidence: claim.evidence.confidence ?? null,
        evidence: claim.evidence,
        claimedBy: claim.claimedBy,
      })
      .returning({ id: cardClassificationLog.id });
    const logId = logResult[0].id as number;

    if (decision.promote) {
      if (claim.attribute === "edition_variant") {
        await tx
          .update(cards)
          .set({
            editionVariant: claim.value,
            editionVariantSource: claim.source,
          })
          .where(eq(cards.id, cardId));
      } else {
        await tx
          .update(cards)
          .set({
            promoOrigin: claim.value,
            promoOriginSource: claim.source,
          })
          .where(eq(cards.id, cardId));
      }
    }

    return {
      applied: decision.promote,
      shadowed: decision.shadowed,
      logId,
    };
  });
}

/**
 * Revoke an operator override on a single attribute for a card. Marks
 * the operator's most recent winning claim as superseded. Re-promotes
 * the next-highest non-superseded, non-shadowed claim. Logs the revoke
 * as a fresh row so the audit trail is complete.
 */
export async function revokeClassification(
  cardId: number,
  attribute: ClassifiableAttribute,
  revokedBy: string,
): Promise<RevokeResult> {
  return await db.transaction(async (tx) => {
    const operatorClaims = await tx
      .select()
      .from(cardClassificationLog)
      .where(
        and(
          eq(cardClassificationLog.cardId, cardId),
          eq(cardClassificationLog.attribute, attribute),
          eq(cardClassificationLog.nextSource, "operator"),
          eq(cardClassificationLog.shadowed, false),
          isNull(cardClassificationLog.supersededAt),
        ),
      )
      .orderBy(desc(cardClassificationLog.claimedAt))
      .limit(1);

    if (operatorClaims.length === 0) {
      return {
        revoked: false,
        nextWinner: { value: null, source: "default" },
      };
    }
    const winning = operatorClaims[0];

    await tx
      .update(cardClassificationLog)
      .set({ supersededAt: new Date() })
      .where(eq(cardClassificationLog.id, winning.id));

    const candidates = await tx
      .select()
      .from(cardClassificationLog)
      .where(
        and(
          eq(cardClassificationLog.cardId, cardId),
          eq(cardClassificationLog.attribute, attribute),
          eq(cardClassificationLog.shadowed, false),
          isNull(cardClassificationLog.supersededAt),
        ),
      )
      .orderBy(desc(cardClassificationLog.claimedAt));

    let nextValue: string | null = null;
    let nextSource: ClassificationSource = "default";
    for (const pri of CLASSIFICATION_SOURCE_PRIORITY_ORDER) {
      if (pri === "default") break;
      const match = candidates.find((c) => c.nextSource === pri);
      if (match) {
        nextValue = match.nextValue;
        nextSource = pri;
        break;
      }
    }

    const defaultValue = DEFAULT_VALUES[attribute];
    const promotedValue = nextValue ?? defaultValue ?? "regular";

    if (attribute === "edition_variant") {
      await tx
        .update(cards)
        .set({
          editionVariant: promotedValue,
          editionVariantSource: nextSource,
        })
        .where(eq(cards.id, cardId));
    } else {
      await tx
        .update(cards)
        .set({
          promoOrigin: nextValue,
          promoOriginSource: nextSource,
        })
        .where(eq(cards.id, cardId));
    }

    await tx.insert(cardClassificationLog).values({
      cardId,
      attribute,
      prevValue: winning.nextValue,
      prevSource: "operator",
      nextValue: promotedValue,
      nextSource,
      shadowed: false,
      evidence: {
        rule: "operator-revoke",
        notes: `Reverted operator override (log id ${winning.id})`,
      },
      claimedBy: revokedBy,
    });

    return {
      revoked: true,
      nextWinner: { value: nextValue, source: nextSource },
    };
  });
}
