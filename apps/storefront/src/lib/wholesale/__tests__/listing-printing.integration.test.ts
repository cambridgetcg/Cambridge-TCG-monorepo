import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { isPlainListing, mayStandForSku, mayStandSql, plainListingSql } from "../listing-printing";
import { rows } from "./listing-titles";

// Same explicit opt-in as the other integration tests: one disposable
// loopback database, never DATABASE_URL. Reads no table.
const localUrl = process.env.MEMBER_PRICE_TEST_DATABASE_URL;
const pool = localUrl ? new Pool({ connectionString: localUrl, max: 1 }) : null;
afterAll(() => pool?.end());

describe.skipIf(!localUrl)("the listing rule in Postgres (explicit loopback DB only)", () => {
  it("reads every title as JavaScript does", async () => {
    for (const [sku, name, rarity] of rows) {
      const { rows: [read] } = await pool!.query(
        `SELECT ${mayStandSql("c.")} AS stands, ${plainListingSql("c.")} AS plain FROM (SELECT $1::text AS sku, $2::text AS name, $3::text AS rarity) c`,
        [sku, name, rarity],
      );
      expect([sku, name, rarity, read]).toEqual([sku, name, rarity, { stands: mayStandForSku({ sku, name, rarity }), plain: isPlainListing({ sku, name, rarity }) }]);
    }
  }, 30_000);
});
