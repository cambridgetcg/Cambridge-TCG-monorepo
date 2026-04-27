import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const driziDir = path.resolve(import.meta.dirname ?? ".", "..", "drizzle");
const onDisk = fs.readdirSync(driziDir).filter((f) => f.endsWith(".sql")).sort();
const applied = new Set(
  (await pool.query(`SELECT name FROM schema_migrations`)).rows.map((r) => r.name),
);
const missing = onDisk.filter((f) => !applied.has(f));
console.log(`Missing migrations (${missing.length}):`);
for (const f of missing) console.log(`  ${f}`);
await pool.end();
