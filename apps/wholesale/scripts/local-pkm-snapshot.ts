#!/usr/bin/env tsx
/**
 * local-pkm-snapshot — the residential Pokémon price lane (kingdom-039).
 *
 * The CardRush WAF blocks datacenter egress (which is why the Vercel cron
 * needs the paid Bright Data unlocker for cardrush-pokemon.jp) but passes
 * residential connections. This script runs the SAME chunked snapshot
 * pipeline as the cron, pinned to Pokémon, from the operator's machine —
 * free, direct, provenance-honest (via_proxy: null).
 *
 * Self-balancing with the paid lane: this run advances
 * cards.last_scrape_attempt_at, so the Vercel cron's PROXY_COOLDOWN_HOURS
 * clause finds those cards ineligible — Bright Data only spends on cards
 * this lane has missed for >24h (laptop closed, away, etc.).
 *
 * Secrets: DATABASE_URL comes from the macOS keychain (never a plaintext
 * file at rest):
 *
 *   security add-generic-password -U -s cambridgetcg-wholesale-db-url \
 *     -a wholesale -w '<postgres url>'
 *
 * Scheduling: installed as a launchd agent — see
 * scripts/com.cambridgetcg.pkm-snapshot.plist (daily 02:30 local; if the
 * machine is asleep it fires on next wake). Logs to
 * ~/Library/Logs/cambridgetcg-pkm-snapshot.log.
 *
 * Manual run:
 *   cd apps/wholesale && ./scripts/local-pkm-snapshot.sh
 *   (or: DATABASE_URL=... CARDRUSH_EGRESS=residential npx tsx scripts/local-pkm-snapshot.ts)
 */

import { execFileSync } from "node:child_process";

const KEYCHAIN_SERVICE = "cambridgetcg-wholesale-db-url";

if (!process.env.DATABASE_URL) {
  try {
    process.env.DATABASE_URL = execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8" },
    ).trim();
  } catch {
    console.error(
      `DATABASE_URL not set and keychain item '${KEYCHAIN_SERVICE}' not found.\n` +
        `Add it: security add-generic-password -U -s ${KEYCHAIN_SERVICE} -a wholesale -w '<url>'`,
    );
    process.exit(1);
  }
}

// Declare the egress kind BEFORE importing the pipeline — the registry
// routing and the chunk-selection clauses both read it from the env.
process.env.CARDRUSH_EGRESS = "residential";

async function main() {
  // Dynamic imports so DATABASE_URL/CARDRUSH_EGRESS are set before the
  // db module captures its connection config.
  const { db } = await import("../src/lib/db");
  const { games } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { runDailySnapshotV2 } = await import("../src/lib/price-snapshot-v2");

  const [pkm] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.code, "pkm"))
    .limit(1);
  if (!pkm) {
    console.error("games.code='pkm' not found — has migration 0022 been applied?");
    process.exit(1);
  }

  console.log(
    `[${new Date().toISOString()}] local pkm snapshot starting (residential egress, game_id=${pkm.id})`,
  );

  // --chunk=N caps the run (smoke tests); default is the full watch-list.
  const chunkFlag = process.argv.find((a) => a.startsWith("--chunk="));
  const chunk = chunkFlag ? parseInt(chunkFlag.split("=")[1], 10) : 8000;

  const summary = await runDailySnapshotV2({
    gameIds: [pkm.id],
    triggeredBy: "admin",
    // The full pkm watch-list in one pass; no platform ceiling locally.
    chunk,
    // ~6,370 cards at ~1.3 rps ≈ 80 min; give it 3h of headroom.
    scrapeBudgetMs: 3 * 60 * 60_000,
  });

  console.log(`[${new Date().toISOString()}] done:`, JSON.stringify(summary));
  // postgres.js keeps the pool open; exit explicitly.
  process.exit(summary.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] crashed:`, err);
  process.exit(1);
});
