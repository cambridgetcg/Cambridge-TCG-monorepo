/**
 * Batch CardRush classification — wires the layered classifier
 * (`@cambridge-tcg/data-ingest`) into the wholesale catalog-import
 * tool's batch write path (kingdom-089).
 *
 * For each card in a batch that has a `WholesaleCard` shape (name +
 * rarity + isParallel + cardNumber), run `classifyCardRushSignal` and
 * apply any emitted claims via the same priority rules as
 * `apps/wholesale/src/lib/cards/classify.ts` and
 * `apps/admin/src/app/(dashboard)/catalog/cards/classify/_actions.ts`.
 *
 * Uses raw postgres.js (`sql` tagged template) because the tool runs
 * outside Next.js + Drizzle. Same source-of-truth decision function
 * (`decideClaim`); same priority ordering; same witness log shape.
 *
 * Substrate-honest: if `cards.edition_variant` doesn't exist (migration
 * not applied), the caller can short-circuit with `isSubstrateReady()`
 * and skip classification without erroring.
 */

import {
  classifyCardRushSignal,
  decideClaim,
  type Claim,
  type ClassificationSource,
  type CurrentWinner,
} from "@cambridge-tcg/data-ingest";
import type { GameCode } from "@cambridge-tcg/sku";
import type { WholesaleCard } from "./cardrush-mapper";

/**
 * Map the legacy wholesale-tools game code (e.g. "onepiece") to the
 * canonical `@cambridge-tcg/sku` GameCode (e.g. "op"). Returns null
 * for codes we haven't mapped — the classifier handles null game
 * by skipping game-specific rules; R1 (parallel marker) still fires
 * substrate-honestly.
 *
 * The legacy long-form lives in `apps/wholesale/tools/lib/config.ts`
 * (GameConfig.dbGameCode). The canonical short-form lives in
 * `packages/sku/src/games.ts`. They don't agree at the data layer;
 * this helper is the boundary translator.
 */
export function mapLegacyGameCode(legacy: string): GameCode | null {
  switch (legacy) {
    case "onepiece":
      return "op";
    case "dragonball":
      return "dbf"; // Dragon Ball Fusion World per config.ts dbGameName
    case "pokemon":
      return "pkm";
    default:
      return null;
  }
}

// Minimal shape we need from the postgres.js client. Avoids importing
// the full `Sql` type which has many generics.
type SqlClient = {
  <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
} & {
  json: (value: unknown) => unknown;
};

export interface BatchClassificationStats {
  cardsScanned: number;
  claimsEmitted: number;
  claimsPromoted: number;
  claimsShadowed: number;
  cardsErrored: number;
  ruleHits: Record<string, number>;
}

export function emptyStats(): BatchClassificationStats {
  return {
    cardsScanned: 0,
    claimsEmitted: 0,
    claimsPromoted: 0,
    claimsShadowed: 0,
    cardsErrored: 0,
    ruleHits: {},
  };
}

export function mergeStats(
  a: BatchClassificationStats,
  b: BatchClassificationStats,
): BatchClassificationStats {
  const merged = emptyStats();
  merged.cardsScanned = a.cardsScanned + b.cardsScanned;
  merged.claimsEmitted = a.claimsEmitted + b.claimsEmitted;
  merged.claimsPromoted = a.claimsPromoted + b.claimsPromoted;
  merged.claimsShadowed = a.claimsShadowed + b.claimsShadowed;
  merged.cardsErrored = a.cardsErrored + b.cardsErrored;
  for (const [k, v] of Object.entries(a.ruleHits)) merged.ruleHits[k] = v;
  for (const [k, v] of Object.entries(b.ruleHits)) {
    merged.ruleHits[k] = (merged.ruleHits[k] ?? 0) + v;
  }
  return merged;
}

/**
 * Probe whether the classification substrate exists in this database.
 * Callers gate `applyClassificationBatch` on this so the tool runs
 * cleanly against both pre- and post-migration databases.
 */
export async function isSubstrateReady(sql: SqlClient): Promise<boolean> {
  const rows = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'cards' AND column_name = 'edition_variant'
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

type CurrentRow = {
  edition_variant: string;
  edition_variant_source: string;
  promo_origin: string | null;
  promo_origin_source: string;
};

async function readCurrentWinners(
  sql: SqlClient,
  cardIds: readonly number[],
): Promise<Map<number, CurrentRow>> {
  if (cardIds.length === 0) return new Map();
  const rows = await sql<CurrentRow & { id: number }>`
    SELECT id, edition_variant, edition_variant_source,
           promo_origin, promo_origin_source
    FROM cards
    WHERE id = ANY(${cardIds as unknown as number[]})
  `;
  const map = new Map<number, CurrentRow>();
  for (const r of rows) {
    map.set(r.id, {
      edition_variant: r.edition_variant,
      edition_variant_source: r.edition_variant_source,
      promo_origin: r.promo_origin,
      promo_origin_source: r.promo_origin_source,
    });
  }
  return map;
}

async function writeClaim(
  sql: SqlClient,
  cardId: number,
  claim: Claim,
  current: CurrentWinner,
  decision: { promote: boolean; shadowed: boolean },
): Promise<void> {
  await sql`
    INSERT INTO card_classification_log
      (card_id, attribute, prev_value, prev_source,
       next_value, next_source, shadowed, confidence,
       evidence, claimed_by)
    VALUES
      (${cardId}, ${claim.attribute}, ${current.value}, ${current.source},
       ${claim.value}, ${claim.source}, ${decision.shadowed},
       ${claim.evidence.confidence ?? null},
       ${sql.json(claim.evidence as unknown as Record<string, unknown>)},
       ${claim.claimedBy})
  `;
  if (!decision.promote) return;
  if (claim.attribute === "edition_variant") {
    await sql`
      UPDATE cards
      SET edition_variant = ${claim.value},
          edition_variant_source = ${claim.source}
      WHERE id = ${cardId}
    `;
  } else {
    await sql`
      UPDATE cards
      SET promo_origin = ${claim.value},
          promo_origin_source = ${claim.source}
      WHERE id = ${cardId}
    `;
  }
}

/**
 * Apply classification claims for every card in `batch` that has a
 * card id in `skuToId`. Idempotent — re-applying the same heuristic
 * claim is a no-op at the writer (equal-priority same-value).
 *
 * The substrate is assumed ready (caller probed via `isSubstrateReady`).
 * If a card's claim fails its DB write, the failure is counted in
 * `stats.cardsErrored` and other cards in the batch continue.
 */
export async function applyClassificationBatch(
  sql: SqlClient,
  batch: readonly WholesaleCard[],
  skuToId: ReadonlyMap<string, number>,
  gameCode: GameCode,
): Promise<BatchClassificationStats> {
  const stats = emptyStats();

  // Pre-read current winners for every card we're about to touch.
  const cardIds = batch
    .map((c) => skuToId.get(c.sku))
    .filter((id): id is number => typeof id === "number");
  const currentMap = await readCurrentWinners(sql, cardIds);

  for (const card of batch) {
    const cardId = skuToId.get(card.sku);
    if (cardId === undefined) continue;
    const current = currentMap.get(cardId);
    if (!current) continue;

    stats.cardsScanned++;

    const signal = {
      url: card.cardrushUrl ?? "",
      name: card.name,
      rarity: card.rarity,
      game: gameCode,
      cardNumber: card.cardNumber,
    };

    const claims = classifyCardRushSignal(signal);
    if (claims.length === 0) continue;

    for (const claim of claims) {
      const rule = String(
        (claim.evidence as { rule?: string } | undefined)?.rule ?? "unknown",
      );
      stats.ruleHits[rule] = (stats.ruleHits[rule] ?? 0) + 1;
    }
    stats.claimsEmitted += claims.length;

    try {
      // Walk claims sequentially so each later claim sees the post-promotion
      // state of the previous one. Most cards emit a single claim; this
      // matters only when multiple attributes get claims in the same batch.
      let cur: CurrentRow = current;
      for (const claim of claims) {
        const currentForAttr: CurrentWinner =
          claim.attribute === "edition_variant"
            ? {
                value: cur.edition_variant,
                source: cur.edition_variant_source as ClassificationSource,
              }
            : {
                value: cur.promo_origin,
                source: cur.promo_origin_source as ClassificationSource,
              };
        const decision = decideClaim(currentForAttr, claim);
        await writeClaim(sql, cardId, claim, currentForAttr, decision);

        if (decision.promote) {
          // Reflect in our in-memory shadow so subsequent claims for this
          // card see the updated state.
          if (claim.attribute === "edition_variant") {
            cur = {
              ...cur,
              edition_variant: claim.value,
              edition_variant_source: claim.source,
            };
          } else {
            cur = {
              ...cur,
              promo_origin: claim.value,
              promo_origin_source: claim.source,
            };
          }
          stats.claimsPromoted++;
        } else {
          stats.claimsShadowed++;
        }
      }
    } catch (err) {
      stats.cardsErrored++;
      // Best-effort logging; the caller's summary line still includes the count.
      // eslint-disable-next-line no-console
      console.warn(
        `  classify card ${cardId} (${card.sku}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return stats;
}
