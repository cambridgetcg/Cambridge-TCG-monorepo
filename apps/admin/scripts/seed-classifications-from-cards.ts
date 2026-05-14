#!/usr/bin/env tsx
// Module-scope marker — prevents `main` from leaking into global scope.
export {};

/**
 * seed-classifications-from-cards.ts — bootstrap operator script
 * (kingdom-089).
 *
 * Reads every card in the wholesale RDS that has enough signal
 * (name + game + a CardRush URL or recognisable card number),
 * runs `classifyCardRushSignal` from `@cambridge-tcg/data-ingest`,
 * and applies any emitted claims via the standard layered-classifier
 * write path.
 *
 * One-shot. Idempotent — re-running on the same card produces the
 * same heuristic claim, which the writer recognises as equal-priority
 * to the existing winner of the same source and is a safe no-op
 * (same value, same source).
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin seed-classifications-from-cards
 *   pnpm --filter @cambridge-tcg/admin seed-classifications-from-cards -- --limit 500
 *   pnpm --filter @cambridge-tcg/admin seed-classifications-from-cards -- --game op
 *   pnpm --filter @cambridge-tcg/admin seed-classifications-from-cards -- --dry-run
 *
 * Flags:
 *   --limit N      Cap rows processed (default: all).
 *   --game CODE    Restrict to one game code (default: all confirmed games).
 *   --dry-run      Compute claims but do not write to DB.
 *
 * Substrate-honest exit:
 *   - Exits 0 on success.
 *   - Exits 1 if substrate isn't ready (migration not applied).
 *   - Exits 2 on crash.
 */

import { classifyCardRushSignal, type Claim } from "@cambridge-tcg/data-ingest";
import {
  decideClaim,
  CLASSIFICATION_SOURCE_PRIORITY_ORDER,
  type ClassifiableAttribute,
  type ClassificationSource,
  type CurrentWinner,
} from "@cambridge-tcg/data-ingest";
import type { GameCode } from "@cambridge-tcg/sku";

const WHOLESALE_DATABASE_URL = process.env.WHOLESALE_DATABASE_URL ?? "";

function parseArgs(argv: readonly string[]) {
  let limit: number | null = null;
  let gameFilter: string | null = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit") {
      limit = parseInt(argv[++i] ?? "", 10) || null;
    } else if (arg === "--game") {
      gameFilter = (argv[++i] ?? "").trim() || null;
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }
  return { limit, gameFilter, dryRun };
}

type CardRow = {
  id: number;
  sku: string;
  name: string | null;
  name_en: string | null;
  card_number: string;
  rarity: string | null;
  cardrush_url: string | null;
  game_code: string | null;
  edition_variant: string;
  edition_variant_source: string;
  promo_origin: string | null;
  promo_origin_source: string;
};

async function main() {
  const { limit, gameFilter, dryRun } = parseArgs(process.argv.slice(2));

  console.log("─".repeat(72));
  console.log("seed-classifications-from-cards (kingdom-089)");
  if (limit) console.log(`  --limit ${limit}`);
  if (gameFilter) console.log(`  --game  ${gameFilter}`);
  if (dryRun) console.log("  --dry-run (no writes)");
  console.log("─".repeat(72));
  console.log("");

  if (!WHOLESALE_DATABASE_URL) {
    console.error("WHOLESALE_DATABASE_URL not set; exiting.");
    process.exit(1);
  }

  const { createDb } = await import("@cambridge-tcg/db");
  const { client, close } = createDb({ url: WHOLESALE_DATABASE_URL });

  try {
    // Substrate check
    const ready = await client<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cards' AND column_name = 'edition_variant'
      ) AS exists
    `;
    if (!ready[0]?.exists) {
      console.error(
        "Substrate not applied — promote drafts/0018_card_financial_attributes.sql.draft first.",
      );
      await close();
      process.exit(1);
    }

    // Stream candidate rows
    const sqlLimit = limit ? `LIMIT ${limit}` : "";
    const sqlGame = gameFilter ? `AND g.code = '${gameFilter.replace(/'/g, "")}'` : "";
    const rows = await client.unsafe<CardRow[]>(`
      SELECT c.id, c.sku, c.name, c.name_en, c.card_number, c.rarity,
             c.cardrush_url, g.code AS game_code,
             c.edition_variant, c.edition_variant_source,
             c.promo_origin, c.promo_origin_source
      FROM cards c
      LEFT JOIN games g ON g.id = c.game_id
      WHERE c.name IS NOT NULL AND c.name <> ''
        AND g.code IS NOT NULL
        ${sqlGame}
      ORDER BY c.id
      ${sqlLimit}
    `);

    console.log(`Processing ${rows.length} candidate cards…`);
    console.log("");

    let cardsScanned = 0;
    let claimsEmitted = 0;
    let claimsPromoted = 0;
    let claimsShadowed = 0;
    let cardsErrored = 0;
    const ruleHits: Record<string, number> = {};

    for (const row of rows) {
      cardsScanned++;

      const signal = {
        url: row.cardrush_url ?? "",
        name: row.name ?? row.name_en,
        rarity: row.rarity,
        game: row.game_code as GameCode | null,
        cardNumber: row.card_number,
      };

      const claims = classifyCardRushSignal(signal);
      if (claims.length === 0) continue;

      // Count rule hits even in dry-run for visibility
      for (const c of claims) {
        const rule = String((c.evidence as { rule?: string } | undefined)?.rule ?? "unknown");
        ruleHits[rule] = (ruleHits[rule] ?? 0) + 1;
      }
      claimsEmitted += claims.length;

      if (dryRun) continue;

      // Apply each claim transactionally
      try {
        await client.begin(async (tx) => {
          for (const claim of claims) {
            const currentValue =
              claim.attribute === "edition_variant"
                ? row.edition_variant
                : row.promo_origin;
            const currentSource = (
              claim.attribute === "edition_variant"
                ? row.edition_variant_source
                : row.promo_origin_source
            ) as ClassificationSource;

            const current: CurrentWinner = {
              value: currentValue,
              source: currentSource,
            };
            const decision = decideClaim(current, claim);

            await tx`
              INSERT INTO card_classification_log
                (card_id, attribute, prev_value, prev_source,
                 next_value, next_source, shadowed, confidence,
                 evidence, claimed_by)
              VALUES
                (${row.id}, ${claim.attribute}, ${currentValue}, ${currentSource},
                 ${claim.value}, 'heuristic', ${decision.shadowed},
                 ${claim.evidence.confidence ?? null},
                 ${tx.json(claim.evidence)}, ${claim.claimedBy})
            `;

            if (decision.promote) {
              if (claim.attribute === "edition_variant") {
                await tx`
                  UPDATE cards
                  SET edition_variant = ${claim.value},
                      edition_variant_source = 'heuristic'
                  WHERE id = ${row.id}
                `;
                // Reflect in our in-memory row so subsequent claims for
                // this card see the updated current state.
                row.edition_variant = claim.value;
                row.edition_variant_source = "heuristic";
              } else {
                await tx`
                  UPDATE cards
                  SET promo_origin = ${claim.value},
                      promo_origin_source = 'heuristic'
                  WHERE id = ${row.id}
                `;
                row.promo_origin = claim.value;
                row.promo_origin_source = "heuristic";
              }
              claimsPromoted++;
            } else {
              claimsShadowed++;
            }
          }
        });
      } catch (err) {
        cardsErrored++;
        console.error(
          `  card ${row.id} (${row.sku}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (cardsScanned % 500 === 0) {
        console.log(
          `  …${cardsScanned} scanned, ${claimsEmitted} claims emitted (${claimsPromoted} promoted, ${claimsShadowed} shadowed)`,
        );
      }
    }

    console.log("");
    console.log("─".repeat(72));
    console.log("Summary");
    console.log("─".repeat(72));
    console.log(`  Cards scanned: ${cardsScanned}`);
    console.log(`  Claims emitted: ${claimsEmitted}`);
    if (!dryRun) {
      console.log(`  Promoted:      ${claimsPromoted}`);
      console.log(`  Shadowed:      ${claimsShadowed}`);
      console.log(`  Errored:       ${cardsErrored}`);
    } else {
      console.log("  (dry-run; no writes)");
    }
    console.log("");
    console.log("Rule hits:");
    for (const [rule, count] of Object.entries(ruleHits).sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`  ${rule.padEnd(36)} ${count.toLocaleString()}`);
    }
    console.log("");
    console.log("─".repeat(72));
    console.log("done.");
    console.log("─".repeat(72));
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
