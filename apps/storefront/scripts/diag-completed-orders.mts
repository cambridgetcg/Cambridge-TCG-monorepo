import pg from "pg";
const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const r = await pool.query(
  `SELECT COUNT(*)::int AS n FROM customer_orders WHERE status = 'completed'`,
);
console.log(`Total customer_orders with status='completed': ${r.rows[0].n}`);

const top = await pool.query(
  `SELECT id, customer_email, total_gbp, created_at, delivered_at
     FROM customer_orders WHERE status = 'completed'
     ORDER BY created_at DESC LIMIT 5`,
);
console.log("\nNewest 5 completed orders:");
for (const row of top.rows) {
  console.log(`  id=${row.id}  ${row.created_at}  ${row.customer_email}  £${row.total_gbp}  delivered_at=${row.delivered_at}`);
}
await pool.end();
