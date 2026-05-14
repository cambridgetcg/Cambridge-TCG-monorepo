/**
 * gen-api-key — issue a partner API key for the wholesale v1 surface.
 *
 * Usage:
 *   pnpm tsx tools/gen-api-key.ts                                  (defaults: cambridgetcg, rpm 600)
 *   CHANNEL=ebay LABEL='eBay reseller' RPM=120 pnpm tsx tools/gen-api-key.ts
 *
 * The plaintext key is printed to stdout. Store it where the consumer
 * will read it (e.g. `WHOLESALE_API_KEY` on the storefront's Vercel env).
 * The DB only stores the SHA-256 hash; the plaintext is irrecoverable
 * after this run. To revoke: UPDATE channel_api_keys SET revoked_at =
 * now() WHERE id = <id>; (since migration 0017).
 *
 * Channel must match one of the @cambridge-tcg/pricing DEFAULTS channels
 * (shopify, cambridgetcg, ebay, cardmarket, tradein-credit, tradein-cash,
 * wholesale) OR a row in the channel_pricing table — otherwise
 * priceForChannel() will fall back to DEFAULTS at runtime, with no
 * guarantee the result matches what the consumer expects.
 */

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

  const channel = process.env.CHANNEL || "cambridgetcg";
  const label = process.env.LABEL || "cambridgetcg.com storefront";
  const rpm = Math.max(1, parseInt(process.env.RPM || "600", 10));

  const rawKey = crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  await sql`
    INSERT INTO channel_api_keys (channel, key_hash, label, requests_per_minute)
    VALUES (${channel}, ${keyHash}, ${label}, ${rpm})
    ON CONFLICT DO NOTHING
  `;

  console.log(`RAW_KEY=${rawKey}`);
  console.log(`channel=${channel} rpm=${rpm} label=${label}`);
  await sql.end();
}
main().catch(console.error);
