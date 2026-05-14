#!/usr/bin/env tsx
// Module-scope marker — prevents `main` from leaking into global scope.
export {};

/**
 * seed-rarity-map.ts — populate wholesale.rarity_map from the typed
 * source `packages/sku/src/rarities.ts` (kingdom-089).
 *
 * Idempotent: UPSERTs on (game_id, publisher_rarity). Re-running is
 * safe and updates ordinal / display_name / palette_key if the source
 * changed.
 *
 * Substrate-honest about games it can't seed:
 *   - Game code present in RARITIES but missing from games table → reported
 *   - Game code in games table but absent from RARITIES → reported as gap
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin seed-rarity-map
 *   pnpm --filter @cambridge-tcg/admin seed-rarity-map -- --dry-run
 */

import { RARITIES, type RarityRow } from "@cambridge-tcg/sku";

const WHOLESALE_DATABASE_URL = process.env.WHOLESALE_DATABASE_URL ?? "";

function parseArgs(argv: readonly string[]) {
  return { dryRun: argv.includes("--dry-run") };
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));

  console.log("─".repeat(72));
  console.log("seed-rarity-map (kingdom-089)");
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
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'rarity_map'
      ) AS exists
    `;
    if (!ready[0]?.exists) {
      console.error(
        "Substrate not applied — promote drafts/0018_card_financial_attributes.sql.draft first.",
      );
      await close();
      process.exit(1);
    }

    // Load games to resolve game_id
    const games = await client<{ id: number; code: string }[]>`
      SELECT id, code FROM games
    `;
    const gameIdByCode = new Map<string, number>();
    for (const g of games) gameIdByCode.set(g.code, g.id);

    let totalRows = 0;
    let totalGames = 0;
    let missingGames: string[] = [];
    let unseededGames: string[] = [];

    for (const [gameCode, rows] of Object.entries(RARITIES)) {
      const gameId = gameIdByCode.get(gameCode);
      if (gameId === undefined) {
        missingGames.push(gameCode);
        continue;
      }
      if (!rows || rows.length === 0) {
        unseededGames.push(gameCode);
        continue;
      }
      totalGames++;
      for (const row of rows as RarityRow[]) {
        totalRows++;
        if (dryRun) continue;
        await client`
          INSERT INTO rarity_map
            (game_id, publisher_rarity, ordinal, display_name, palette_key)
          VALUES
            (${gameId}, ${row.publisher_rarity}, ${row.ordinal},
             ${row.display_name}, ${row.palette_key ?? null})
          ON CONFLICT (game_id, publisher_rarity) DO UPDATE
            SET ordinal = EXCLUDED.ordinal,
                display_name = EXCLUDED.display_name,
                palette_key = EXCLUDED.palette_key
        `;
      }
    }

    // Games registered in wholesale that have no RARITIES entry
    const seededCodes = new Set(Object.keys(RARITIES));
    const unmappedGames = games
      .filter((g) => !seededCodes.has(g.code))
      .map((g) => g.code);

    console.log(
      `${totalRows} rarity rows ${dryRun ? "would be" : ""} upserted across ${totalGames} game(s).`,
    );
    console.log("");
    if (missingGames.length > 0) {
      console.log(
        `RARITIES entries with no matching games.code row (skipped): ${missingGames.join(", ")}`,
      );
    }
    if (unseededGames.length > 0) {
      console.log(
        `RARITIES entries explicitly empty (no rows yet): ${unseededGames.join(", ")}`,
      );
    }
    if (unmappedGames.length > 0) {
      console.log(
        `games.code rows with no RARITIES entry (add to rarities.ts when known): ${unmappedGames.join(", ")}`,
      );
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
