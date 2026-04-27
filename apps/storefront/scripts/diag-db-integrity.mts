// Database integrity audit. Verifies:
// 1. Migration count matches the drizzle/ folder
// 2. Tables this session's modules need exist
// 3. Critical indexes exist (the partial indexes the cron sweeps depend on)
// 4. No orphan rows in cross-module FK joins
// 5. The order_status enum has all the values modules write to

import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let pass = 0, fail = 0;
function check(cond: unknown, msg: string): void {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.log(`  ✗ ${msg}`); }
}

try {
  console.log("\n— Migration count");
  const driziDir = path.resolve(import.meta.dirname ?? ".", "..", "drizzle");
  const sqlFiles = fs.readdirSync(driziDir).filter((f) => f.endsWith(".sql")).length;
  const applied = await pool.query(`SELECT COUNT(*)::int AS n FROM schema_migrations`);
  console.log(`  drizzle/ has ${sqlFiles} .sql files; _migrations has ${applied.rows[0].n} rows`);
  check(applied.rows[0].n === sqlFiles, "all migrations applied");

  console.log("\n— Tables that this session's modules require");
  const requiredTables = [
    "notifications",
    "follows",
    "trade_reviews",
    "market_offers",
    "market_returns",
    "market_trade_cancellations",
    "saved_searches",
    "saved_search_matches",
    "dm_conversations",
    "dm_messages",
    "user_blocks",
    "seller_vacations",
    "pricing_rules",
  ];
  for (const t of requiredTables) {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
      [t],
    );
    check(r.rows.length === 1, `table ${t} exists`);
  }

  console.log("\n— Partial indexes the cron sweeps depend on");
  const requiredIndexes = [
    "idx_market_offers_expiring",
    "idx_market_returns_expiring",
    "idx_trade_cancellations_expiring",
    "idx_saved_searches_expiring",
    "idx_seller_vacations_starting",
    "idx_seller_vacations_ending",
    "idx_pricing_rules_active",
  ];
  for (const i of requiredIndexes) {
    const r = await pool.query(`SELECT 1 FROM pg_indexes WHERE indexname = $1`, [i]);
    check(r.rows.length === 1, `index ${i} exists`);
  }

  console.log("\n— order_status enum values");
  const enumVals = await pool.query(
    `SELECT unnest(enum_range(NULL::order_status))::text AS v`,
  );
  const vals = enumVals.rows.map((r) => r.v).sort();
  console.log(`  values: ${vals.join(", ")}`);
  for (const v of ["open", "filled", "partially_filled", "cancelled", "expired", "paused"]) {
    check(vals.includes(v), `order_status has '${v}'`);
  }

  console.log("\n— Cross-module FK consistency");
  const orphanQueries: Array<[string, string]> = [
    [
      "market_offers without ask",
      `SELECT COUNT(*)::int AS n FROM market_offers o
        LEFT JOIN market_orders mo ON mo.id = o.ask_order_id
        WHERE mo.id IS NULL`,
    ],
    [
      "market_returns without trade",
      `SELECT COUNT(*)::int AS n FROM market_returns r
        LEFT JOIN market_trades t ON t.id = r.trade_id
        WHERE t.id IS NULL`,
    ],
    [
      "trade_cancellations without trade",
      `SELECT COUNT(*)::int AS n FROM market_trade_cancellations c
        LEFT JOIN market_trades t ON t.id = c.trade_id
        WHERE t.id IS NULL`,
    ],
    [
      "dm_messages without conversation",
      `SELECT COUNT(*)::int AS n FROM dm_messages m
        LEFT JOIN dm_conversations c ON c.id = m.conversation_id
        WHERE c.id IS NULL`,
    ],
    [
      "saved_search_matches without search",
      `SELECT COUNT(*)::int AS n FROM saved_search_matches m
        LEFT JOIN saved_searches s ON s.id = m.search_id
        WHERE s.id IS NULL`,
    ],
    [
      "notifications without user (FK ON DELETE CASCADE means 0 orphans)",
      `SELECT COUNT(*)::int AS n FROM notifications n
        LEFT JOIN users u ON u.id = n.user_id
        WHERE u.id IS NULL`,
    ],
  ];
  for (const [name, sql] of orphanQueries) {
    const r = await pool.query(sql);
    check(r.rows[0].n === 0, `${name} (got ${r.rows[0].n})`);
  }

  console.log("\n— Notification reference uniqueness (no accidental dup-firing)");
  const dupNotifs = await pool.query(
    `SELECT user_id, kind, reference_type, reference_id, COUNT(*)::int AS n
       FROM notifications
      WHERE reference_id IS NOT NULL AND reference_type IS NOT NULL
      GROUP BY user_id, kind, reference_type, reference_id
      HAVING COUNT(*) > 1
      LIMIT 5`,
  );
  check(dupNotifs.rows.length === 0,
    `no duplicate notifications by (user, kind, ref_type, ref_id) (found ${dupNotifs.rows.length})`);
  if (dupNotifs.rows.length > 0) {
    for (const r of dupNotifs.rows) console.log(`    DUP: ${JSON.stringify(r)}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
} finally {
  await pool.end();
}
