# P3 — Pricing Engine & S3 Sync

## src/lib/pricing.ts

```ts
export const SHIPPING_RATE = 0.05;    // 5% shipping & handling
export const MARGIN_RATE = 0.20;      // 20% net margin
export const VAT_RATE = 0.20;         // 20% UK VAT

export interface PriceBreakdown {
  cardrushJpy: number;
  gbpJpyRate: number;
  baseGbp: number;
  shipping: number;
  landedCost: number;
  margin: number;
  priceExVat: number;
  vat: number;
  priceIncVat: number;
}

export function calculatePrice(cardrushJpy: number, gbpJpyRate: number): PriceBreakdown {
  const baseGbp = cardrushJpy / gbpJpyRate;
  const shipping = baseGbp * SHIPPING_RATE;
  const landedCost = baseGbp + shipping;
  const margin = landedCost * MARGIN_RATE;
  const priceExVat = landedCost + margin;
  const vat = priceExVat * VAT_RATE;
  const priceIncVat = priceExVat + vat;

  return {
    cardrushJpy, gbpJpyRate,
    baseGbp: round2(baseGbp),
    shipping: round2(shipping),
    landedCost: round2(landedCost),
    margin: round2(margin),
    priceExVat: round2(priceExVat),
    vat: round2(vat),
    priceIncVat: round2(priceIncVat),
  };
}

// Volume discount: 2% per £10k bracket, max 10% at £50k+
export function getVolumeDiscount(priorMonthSpend: number): number {
  const bracket = Math.floor(priorMonthSpend / 10_000);
  return Math.min(bracket * 0.02, 0.10);
}

export function applyVolumeDiscount(priceExVat: number, discountPct: number): number {
  return round2(priceExVat * (1 - discountPct));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
```

## src/lib/s3.ts

```ts
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import ExcelJS from "exceljs";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function fetchPriceFeed(): Promise<CardPriceRow[]> {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET || "pricedata-tcg",
    Key: process.env.S3_PRICE_FEED_KEY || "pricefeed/onepiece_pricefeed.xlsx",
  });

  const response = await s3.send(command);
  const buffer = Buffer.from(await response.Body!.transformToByteArray());

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  // First sheet contains: sku, latest JPY price, base_cost, total_cost, selling_price, gbp_to_jpy, ebay_item_number
  // Sheet names: ebay_business, ebay_private, cardmarket, cardtrader, shopify
  // Use first sheet (ebay_business) as canonical source
  const sheet = workbook.worksheets[0];
  const rows: CardPriceRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const sku = row.getCell(1).value?.toString() || "";
    const cardrushJpy = Number(row.getCell(2).value) || 0;
    const gbpToJpy = Number(row.getCell(6).value) || 208.53;
    const ebayItemNumber = row.getCell(7).value?.toString() || "";

    if (sku && cardrushJpy > 0) {
      // Extract card number and set code from SKU: OP-OP01-001-JP → card: OP01-001, set: OP01
      const parts = sku.replace("OP-", "").replace("-JP", "").split("-");
      const setCode = parts[0] || "";
      const cardNumber = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : sku;

      rows.push({ sku, cardNumber, setCode, cardrushJpy, gbpToJpy, ebayItemNumber });
    }
  });

  return rows;
}

export interface CardPriceRow {
  sku: string;
  cardNumber: string;
  setCode: string;
  cardrushJpy: number;
  gbpToJpy: number;
  ebayItemNumber: string;
}
```

## src/app/api/sync/route.ts

POST handler that:
1. Calls `fetchPriceFeed()`
2. For each row, calls `calculatePrice(row.cardrushJpy, row.gbpToJpy)`
3. Upserts into `cards` table (match on `sku`)
4. Inserts into `priceHistory` table with today's date
5. Returns JSON: `{ synced: count, timestamp: now }`

Protect this endpoint — admin only or use a secret API key.

Commit: `feat: pricing engine + S3 sync`
