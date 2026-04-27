// Shared database query helper (same SSL fix as tradein/db.ts)

function getConnectionConfig() {
  const raw = process.env.DATABASE_URL || "";
  const cleaned = raw.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
  return { connectionString: cleaned, ssl: { rejectUnauthorized: false } };
}

export async function query(sql: string, params: unknown[] = []) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool(getConnectionConfig());
  try {
    const result = await pool.query(sql, params);
    return result;
  } finally {
    await pool.end();
  }
}
