#!/usr/bin/env tsx
/**
 * tcgplayer-seed-set — operator-driven mapping bootstrap for TCGplayer.
 *
 * Walks TCGplayer's catalog for the given category (and optionally specific
 * groups), discovering productIds and attaching them to Cambridge `cards`
 * rows via the (set_code, card_number) match. The mapping is the precondition
 * for the pricing cron — without `cards.tcgplayer_product_id` populated, the
 * pricing-mode watchlist is empty.
 *
 * ── Usage ───────────────────────────────────────────────────────────────
 *
 *   pnpm wholesale tcgplayer:seed-set --category 68              # All One Piece groups
 *   pnpm wholesale tcgplayer:seed-set --category 68 --group 23745  # One specific group
 *   pnpm wholesale tcgplayer:seed-set --game op                    # Resolve game → category
 *   pnpm wholesale tcgplayer:seed-set --category 68 --dry-run      # Cap to 20 products
 *
 * ── Preconditions ───────────────────────────────────────────────────────
 *
 *   - Migration 0015 applied (cards.tcgplayer_product_id column exists)
 *   - TCGPLAYER_CLIENT_ID + TCGPLAYER_CLIENT_SECRET in env
 *
 * ── Output ──────────────────────────────────────────────────────────────
 *
 * Substrate-honest summary: products fetched, mappings written, ambiguous
 * (in ingest_quarantine), no-card-match (in ingest_quarantine). The audit
 * `pnpm audit:tcgplayer-mapping` consumes the same data.
 *
 * Designed in `docs/connections/the-tcgplayer-alignment.md` (kingdom-NNN) §8.
 */

// Imports of `@/lib/ingest/tcgplayer` are deferred inside main() so --help
// works without DATABASE_URL configured (the db module throws on import).
import { categoryForGame, TCGPLAYER_CATEGORIES } from "@cambridge-tcg/data-ingest";
import type { GameCode } from "@cambridge-tcg/sku";

function parseArgs(argv: string[]): {
  categories?: number[];
  groups?: number[];
  game?: GameCode;
  dryRun: boolean;
  maxProducts?: number;
} {
  const args: ReturnType<typeof parseArgs> = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--category" || a === "-c") {
      const v = argv[++i];
      if (!v) throw new Error("--category requires a value");
      args.categories = (args.categories ?? []).concat(parseInt(v, 10));
    } else if (a === "--group" || a === "-g") {
      const v = argv[++i];
      if (!v) throw new Error("--group requires a value");
      args.groups = (args.groups ?? []).concat(parseInt(v, 10));
    } else if (a === "--game") {
      args.game = argv[++i] as GameCode;
    } else if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "--max-products") {
      args.maxProducts = parseInt(argv[++i] ?? "0", 10);
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`
tcgplayer-seed-set — operator-driven mapping bootstrap for TCGplayer.

USAGE
  pnpm wholesale tcgplayer:seed-set [options]

OPTIONS
  --category <id>     TCGplayer categoryId (e.g. 68 for One Piece, 3 for Pokémon)
  --group <id>        Restrict to one or more groupIds (set abbreviation)
  --game <code>       Cambridge GameCode (resolves to categoryId)
  --dry-run           Cap to 20 products (default unbounded)
  --max-products <n>  Cap to N products
  --help, -h          Show this help

EXAMPLES
  pnpm wholesale tcgplayer:seed-set --game op
  pnpm wholesale tcgplayer:seed-set --category 68 --group 23745
  pnpm wholesale tcgplayer:seed-set --category 3 --dry-run

REGISTERED CATEGORIES
  See packages/data-ingest/src/tcgplayer/categories.ts (TCGPLAYER_CATEGORIES).
`);
  for (const [id, entry] of Object.entries(TCGPLAYER_CATEGORIES)) {
    const flag = entry.confirmed ? "✓" : "?";
    console.log(`  ${flag} ${id.padStart(4)} ${entry.game.padEnd(5)} ${entry.name}`);
  }
  console.log("");
}

async function main(): Promise<void> {
  console.log("");
  console.log("◆ tcgplayer-seed-set — TCGplayer mapping bootstrap");
  console.log("");

  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    console.error("");
    printHelp();
    process.exit(1);
  }

  // Resolve --game to a categoryId if --category not provided
  if (args.game && !args.categories) {
    const id = categoryForGame(args.game);
    if (!id) {
      console.error(
        `Error: GameCode '${args.game}' not in TCGPLAYER_CATEGORIES; extend packages/data-ingest/src/tcgplayer/categories.ts`,
      );
      process.exit(1);
    }
    args.categories = [id];
  }

  if (!args.categories || args.categories.length === 0) {
    console.error("Error: --category or --game required");
    console.error("");
    printHelp();
    process.exit(1);
  }

  console.log(
    `  Categories: ${args.categories.map((c) => `${c} (${TCGPLAYER_CATEGORIES[c]?.name ?? "unknown"})`).join(", ")}`,
  );
  if (args.groups) console.log(`  Groups:     ${args.groups.join(", ")}`);
  if (args.dryRun) console.log(`  DRY RUN — capped to 20 products`);
  if (args.maxProducts) console.log(`  Max products: ${args.maxProducts}`);
  console.log("");

  try {
    // Deferred import — `@/lib/ingest/tcgplayer` triggers DATABASE_URL check
    // on load. With --help we don't need it; with a real run we do.
    const { runTcgplayerCatalog } = await import("@/lib/ingest/tcgplayer");
    const result = await runTcgplayerCatalog({
      categories: args.categories,
      groups: args.groups,
      triggeredBy: "admin",
      maxProducts: args.dryRun ? 20 : args.maxProducts,
    });

    console.log("◇ Summary");
    console.log("");
    console.log(`  ingest_run_id:     ${result.ingestRunId}`);
    console.log(`  Products read:     ${result.productsRead}`);
    console.log(`  Mappings written:  ${result.mappingsWritten}`);
    console.log(`  SkuIds written:    ${result.skuIdsWritten}`);
    console.log(`  Quarantined rows:  ${result.rowsQuarantined}`);
    console.log(`  Errors:            ${result.errors}`);
    console.log(`  Duration:          ${(result.durationMs / 1000).toFixed(1)}s`);
    console.log("");

    if (result.rowsQuarantined > 0) {
      console.log("◇ Quarantine details");
      console.log("");
      console.log(`  ${result.rowsQuarantined} rows landed in ingest_quarantine.`);
      console.log(`  Inspect: SELECT kind, reason, upstream_id FROM ingest_quarantine`);
      console.log(`           WHERE ingest_run_id = ${result.ingestRunId} ORDER BY kind, quarantined_at;`);
      console.log("");
    }

    if (result.mappingsWritten > 0) {
      console.log("◇ Next steps");
      console.log("");
      console.log(`  - Run 'pnpm audit:tcgplayer-mapping' to verify coverage.`);
      console.log(`  - Run the pricing cron (mode=live-pricing) to populate price_archive:`);
      console.log(`      curl -X POST 'http://localhost:3001/api/cron/ingest/tcgplayer?mode=live-pricing&secret=...'`);
      console.log(`  - Or run 'tcgplayer:seed-set --game <next>' to seed another game.`);
      console.log("");
    }

    process.exit(result.errors > 0 ? 1 : 0);
  } catch (err) {
    console.error(`\nseed-set FAILED: ${err instanceof Error ? err.message : String(err)}`);
    console.error("");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(2);
});
