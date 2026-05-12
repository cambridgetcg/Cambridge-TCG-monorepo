/**
 * S3 price feed download for wholesale.
 *
 * Delegates to @cambridge-tcg/aws for the actual S3 client.
 * Wholesale defaults to eu-west-2 (matching the RDS region).
 */

import { getObject } from "@cambridge-tcg/aws/s3";
import { createS3ClientOrThrow } from "@cambridge-tcg/aws/s3";
import ExcelJS from "exceljs";
import { parseSkuGame as parseSkuGameCode, parseSku, canonicalizeSku } from "@/lib/sku";

/**
 * Break a SKU (canonical or legacy) into `{ cardNumber, setCode }`.
 * Returns sensible fallbacks for non-card SKUs (sealed products, etc.).
 */
function decomposeSku(sku: string): { cardNumber: string; setCode: string } {
  const canonical = canonicalizeSku(sku);
  if (canonical) {
    const parts = parseSku(canonical);
    if (parts) {
      return {
        cardNumber: `${parts.set.toUpperCase()}-${parts.number.toUpperCase()}`,
        setCode: parts.set.toUpperCase(),
      };
    }
  }
  // Fallback: non-card SKU (e.g. SEALED-V123-JP). Best-effort split.
  return { cardNumber: sku, setCode: "" };
}

// Lazily initialize the S3 client. Previously called at module load, which
// broke `next build`: collecting page data imports this module without AWS
// credentials in the build environment, and createS3ClientOrThrow throws.
let _s3Initialized = false;
function ensureS3Initialized(): void {
  if (_s3Initialized) return;
  createS3ClientOrThrow({ defaultRegion: "eu-west-2" });
  _s3Initialized = true;
}

export async function fetchPriceFeed(): Promise<CardPriceRow[]> {
  ensureS3Initialized();
  const bucket = process.env.S3_BUCKET || "pricedata-tcg";
  const key = process.env.S3_PRICE_FEED_KEY || "pricefeed/onepiece_pricefeed.xlsx";

  const response = await getObject(bucket, key);
  const bytes = await response.Body!.transformToByteArray();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

  // First sheet contains: sku, latest JPY price, base_cost, total_cost, selling_price, gbp_to_jpy, ebay_item_number
  // Sheet names: ebay_business, ebay_private, cardmarket, cardtrader, shopify
  // Use first sheet (ebay_business) as canonical source
  const sheet = workbook.worksheets[0];
  const rows: CardPriceRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const sku = row.getCell(1).value?.toString() || "";
    const cardrushJpy = Number(row.getCell(2).value) || 0;
    const gbpToJpyRaw = Number(row.getCell(6).value);
    if (!gbpToJpyRaw || gbpToJpyRaw <= 0) {
      throw new Error("GBP/JPY exchange rate missing from price feed");
    }
    const gbpToJpy = gbpToJpyRaw;
    const ebayItemNumber = row.getCell(7).value?.toString() || "";

    if (sku && cardrushJpy > 0) {
      // Decompose via the canonical parser — accepts either form. Falls
      // back to the legacy string-split when the SKU doesn't parse (e.g.
      // sealed-product SKUs that aren't in the card namespace).
      const decomposed = decomposeSku(sku);
      rows.push({
        sku,
        cardNumber: decomposed.cardNumber,
        setCode: decomposed.setCode,
        setName: decomposed.setCode,
        cardrushJpy,
        gbpToJpy,
        ebayItemNumber,
      });
    }
  });

  return rows;
}

/**
 * Extract the game code from a SKU (canonical or legacy form).
 *
 * Delegates to `@/lib/sku.parseSkuGame()` which accepts both forms via
 * `canonicalizeSku()`. Replaces the previous hand-rolled implementation
 * that only recognised the `OP-` prefix. See
 * `docs/connections/the-drift-reconciliation.md` (kingdom-070).
 *
 * Returns the registered `GameCode` (`op` / `pkm` / `mtg` / …) or
 * `"unknown"` when the input doesn't parse as either form. The legacy
 * return-string contract (`"onepiece"` etc.) is preserved by mapping
 * canonical codes to legacy game names — `parseSkuGame` is called by
 * downstream code that switches on `"onepiece"` / `"pokemon"` / …
 */
export function parseSkuGame(sku: string): string {
  const code = parseSkuGameCode(sku);
  switch (code) {
    case "op":
      return "onepiece";
    case "pkm":
      return "pokemon";
    case "dbs":
    case "dbf":
      return "dragonball";
    case "mtg":
      return "mtg";
    case "ygo":
      return "yugioh";
    case "unknown":
      return "unknown";
    default:
      return code;
  }
}

export interface CardPriceRow {
  sku: string;
  cardNumber: string;
  setCode: string;
  setName: string;
  cardrushJpy: number;
  gbpToJpy: number;
  ebayItemNumber: string;
}
