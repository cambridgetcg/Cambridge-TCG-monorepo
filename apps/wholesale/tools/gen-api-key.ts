import { existsSync, readFileSync } from "fs";
import crypto from "crypto";
import postgres from "postgres";

async function main() {
  for (const f of [".env.local", ".env"]) {
    if (existsSync(f)) {
      for (const line of readFileSync(f, "utf-8").split("\n")) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.*?)["']?\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
      }
    }
  }
  const sql = postgres(process.env.DATABASE_URL!, { ssl: "require" });
  
  // Generate a secure random key
  const rawKey = crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  
  await sql`
    INSERT INTO channel_api_keys (channel, key_hash, label)
    VALUES ('cambridgetcg-storefront', ${keyHash}, 'cambridgetcg.com storefront')
    ON CONFLICT DO NOTHING
  `;
  
  console.log("RAW_KEY=" + rawKey);
  await sql.end();
}
main().catch(console.error);
