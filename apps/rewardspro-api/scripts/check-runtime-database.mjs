import pg from "pg";

import { checkDatabase } from "../dist/db.js";

const runtime = process.env.DATABASE_RUNTIME;
const databaseUrl = process.env.DATABASE_URL;

if (!["api", "worker"].includes(runtime) || !databaseUrl) {
  throw new Error("DATABASE_RUNTIME and DATABASE_URL are required");
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5_000,
  max: 1,
  query_timeout: 10_000,
});

try {
  await checkDatabase(pool, runtime);
} finally {
  await pool.end();
}
