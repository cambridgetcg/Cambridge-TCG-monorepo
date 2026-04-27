#!/usr/bin/env tsx
/**
 * Fix purchase A-6061096: delete incorrect purchase_items (created from cart
 * manifest, not from actual order) and re-import from the Remambo page text dump.
 *
 * The text dump at tools/logs/remambo-import-6061096.txt has two item formats:
 *
 * Format A (automated tool items — "Order #NN" comment line):
 *   CardName(details)
 *   Order #31 — CARD_NUMBER SET_CODE
 *   Price: ¥ XXXX
 *   Quantity: X
 *   Item subtotal: ¥ XXXX
 *
 * Format B (manually added items — {CARD_NUMBER} in title):
 *   〔状態A-〕CardName【rarity】{CARD_NUMBER[SET]}
 *   Price: ¥ XXXX
 *   Quantity: X
 *   Item subtotal: ¥ XXXX
 *
 * Usage: npx tsx tools/fix-purchase-6061096.ts [--dry-run]
 */

import { readFileSync, existsSync } from "fs";
import postgres from "postgres";

// Load .env.local
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const dryRun = process.argv.includes("--dry-run");
const sql = postgres(process.env.DATABASE_URL || "", { ssl: "require", max: 1 });

// ---------------------------------------------------------------------------
// Parse the text dump
// ---------------------------------------------------------------------------

interface ParsedItem {
  card_number: string;
  condition: string; // "Mint" or "状態A-"
  price_jpy: number;
  quantity: number;
  order_id: number | null; // from "Order #XX" line
  set_code: string | null;
}

function parseTextDump(text: string): ParsedItem[] {
  const lines = text.split("\n").map((l) => l.trim());
  const items: ParsedItem[] = [];

  let pendingCardNumber: string | null = null;
  let pendingCondition = "Mint";
  let pendingOrderId: number | null = null;
  let pendingSetCode: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Format B: title with {CARD_NUMBER} or {CARD_NUMBER[SET]}
    const braceMatch = line.match(/\{([A-Z0-9]+-?\d+)(?:\[([A-Z0-9]+)\])?\}/);
    if (braceMatch) {
      pendingCardNumber = braceMatch[1];
      pendingSetCode = braceMatch[2] || null;
      pendingCondition = /〔状態A-〕/.test(line) ? "状態A-" : "Mint";
      continue;
    }

    // Format A: "Order #31 — EB01-003 PROMO" line
    const orderMatch = line.match(/^Order #(\d+)\s*[—–-]\s*([A-Z0-9]+-?\d+)\s*(.*)?$/);
    if (orderMatch) {
      pendingOrderId = parseInt(orderMatch[1]);
      pendingCardNumber = orderMatch[2];
      pendingSetCode = orderMatch[3]?.trim() || null;
      // Condition comes from previous title line
      const prevLine = lines[i - 1] || "";
      pendingCondition = /〔状態A-〕/.test(prevLine) ? "状態A-" : "Mint";
      continue;
    }

    // Price line: "Price: ¥ XXXX"
    const priceMatch = line.match(/^Price:\s*¥\s*([0-9,]+)/);
    if (priceMatch && pendingCardNumber) {
      const price = parseInt(priceMatch[1].replace(/,/g, ""));

      // Next line: "Quantity: X"
      const qtyLine = (lines[i + 1] || "").trim();
      const qtyMatch = qtyLine.match(/^Quantity:\s*(\d+)/);
      const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;

      items.push({
        card_number: pendingCardNumber,
        condition: pendingCondition,
        price_jpy: price,
        quantity: qty,
        order_id: pendingOrderId,
        set_code: pendingSetCode,
      });

      // Reset
      pendingCardNumber = null;
      pendingOrderId = null;
      pendingSetCode = null;
      pendingCondition = "Mint";
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Resolve card ID from card_number
// ---------------------------------------------------------------------------

async function resolveCardId(cardNumber: string, condition: string): Promise<number | null> {
  // Direct match by card_number — for cards with multiple parallels, take first
  const rows = await sql`
    SELECT id FROM cards WHERE card_number = ${cardNumber} ORDER BY id LIMIT 1
  `;
  if (rows.length > 0) return rows[0].id;

  console.warn(`  Could not resolve card: ${cardNumber}`);
  return null;
}

// ---------------------------------------------------------------------------
// Match to order_items
// ---------------------------------------------------------------------------

async function findOrderItemId(
  cardNumber: string,
  orderId: number | null,
): Promise<number | null> {
  if (orderId === null) return null;

  // Match by card_number + order_id
  const rows = await sql`
    SELECT oi.id
    FROM order_items oi
    JOIN cards c ON c.id = oi.card_id
    WHERE oi.order_id = ${orderId} AND c.card_number = ${cardNumber}
    LIMIT 1
  `;
  if (rows.length > 0) return rows[0].id;
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Fix Purchase A-6061096 ===\n");
  if (dryRun) console.log("  Mode: DRY RUN\n");

  // Read text dump
  const textPath = "tools/logs/remambo-import-6061096.txt";
  const text = readFileSync(textPath, "utf8");
  const items = parseTextDump(text);

  console.log(`Parsed ${items.length} items from text dump`);
  const totalJpy = items.reduce((s, i) => s + i.price_jpy * i.quantity, 0);
  console.log(`Total value: ¥${totalJpy.toLocaleString()}`);
  console.log(`Expected:    ¥281,140`);
  console.log("");

  // Show parsed items
  for (const item of items) {
    const tag = item.condition === "Mint" ? "" : ` [${item.condition}]`;
    const ord = item.order_id ? ` (Order #${item.order_id})` : "";
    console.log(
      `  ${item.card_number.padEnd(12)} x${item.quantity} @ ¥${item.price_jpy.toLocaleString().padEnd(7)}${tag}${ord}`
    );
  }

  if (totalJpy !== 281140) {
    console.log("\n  WARNING: Total doesn't match Remambo page (¥281,140). Check parsing.");
  }

  // Get current purchase record
  const [purchase] = await sql`
    SELECT id FROM purchases WHERE remambo_order_id = 'A-6061096' LIMIT 1
  `;
  if (!purchase) {
    console.error("\n  Purchase A-6061096 not found in DB!");
    await sql.end();
    return;
  }
  const purchaseId = purchase.id;
  console.log(`\nPurchase DB id: ${purchaseId}`);

  // Count current purchase_items
  const [current] = await sql`
    SELECT count(*)::int AS cnt, sum(quantity)::int AS qty
    FROM purchase_items WHERE purchase_id = ${purchaseId}
  `;
  console.log(`Current purchase_items: ${current.cnt} rows, ${current.qty} qty`);

  // Resolve card IDs and order_item IDs for parsed items
  console.log("\nResolving card IDs...");
  const resolved: {
    cardId: number;
    orderItemId: number | null;
    condition: string;
    quantity: number;
    unitPriceJpy: number;
    cardNumber: string;
  }[] = [];

  for (const item of items) {
    const cardId = await resolveCardId(item.card_number, item.condition);
    if (!cardId) continue;

    const orderItemId = await findOrderItemId(item.card_number, item.order_id);
    resolved.push({
      cardId,
      orderItemId,
      condition: item.condition,
      quantity: item.quantity,
      unitPriceJpy: item.price_jpy,
      cardNumber: item.card_number,
    });
  }

  console.log(`\nResolved: ${resolved.length}/${items.length} items`);

  if (dryRun) {
    console.log("\n[DRY RUN] Would:");
    console.log(`  1. Delete ${current.cnt} existing purchase_items for purchase ${purchaseId}`);
    console.log(`  2. Insert ${resolved.length} corrected purchase_items`);
    console.log(`  3. Update purchases.items_total_jpy to ¥${totalJpy}`);
    await sql.end();
    return;
  }

  // Delete old purchase_items
  console.log(`\nDeleting ${current.cnt} old purchase_items...`);
  await sql`DELETE FROM purchase_items WHERE purchase_id = ${purchaseId}`;

  // Insert corrected purchase_items
  console.log(`Inserting ${resolved.length} corrected purchase_items...`);
  for (const r of resolved) {
    await sql`
      INSERT INTO purchase_items (purchase_id, card_id, order_item_id, condition, quantity, unit_price_jpy)
      VALUES (${purchaseId}, ${r.cardId}, ${r.orderItemId}, ${r.condition}, ${r.quantity}, ${r.unitPriceJpy})
    `;
  }

  // Update purchase totals
  await sql`
    UPDATE purchases SET items_total_jpy = ${totalJpy} WHERE id = ${purchaseId}
  `;

  console.log("\nDone! Purchase A-6061096 corrected.");

  // Verify
  const [verify] = await sql`
    SELECT count(*)::int AS cnt, sum(quantity)::int AS qty,
           sum(quantity * unit_price_jpy)::int AS total
    FROM purchase_items WHERE purchase_id = ${purchaseId}
  `;
  console.log(`\nVerification: ${verify.cnt} items, ${verify.qty} qty, ¥${verify.total.toLocaleString()} total`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
