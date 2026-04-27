import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import ExcelJS from "exceljs";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "eu-west-2",
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
      // Extract card number and set code from SKU: OP-OP01-001-JP → card: OP01-001, set: OP01
      const parts = sku.replace("OP-", "").replace("-JP", "").split("-");
      const setCode = parts[0] || "";
      const cardNumber = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : sku;

      rows.push({ sku, cardNumber, setCode, setName: setCode, cardrushJpy, gbpToJpy, ebayItemNumber });
    }
  });

  return rows;
}

export function parseSkuGame(sku: string): string {
  if (sku.startsWith("OP-")) return "onepiece";
  // Future: PKM-, YGO-, DBS- patterns
  return "unknown";
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
