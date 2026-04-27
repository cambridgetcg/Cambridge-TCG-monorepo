#!/usr/bin/env tsx
/**
 * Batch import multiple Remambo orders.
 * Uses persistent session to avoid re-logging in for each order.
 * Usage: npx tsx tools/batch-import-orders.ts --orders=ID1,ID2,... [--dry-run] [--headed]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { getRemamboSession } from "./lib/remambo-session";
import type { Page } from "playwright";
import postgres from "postgres";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith("--") && !a.includes("=")));
const kvArgs = Object.fromEntries(
  args.filter(a => a.includes("=")).map(a => {
    const [k, ...v] = a.split("=");
    return [k, v.join("=")];
  })
);

const dryRun = flags.has("--dry-run");
const headed = flags.has("--headed");
const orderIds = (kvArgs["--orders"] || "").split(",").filter(Boolean);

if (orderIds.length === 0) {
  console.error("Usage: npx tsx tools/batch-import-orders.ts --orders=ID1,ID2,... [--dry-run] [--headed]");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScrapedItem {
  title: string;
  price_jpy: number;
  quantity: number;
  shop_url: string;
  condition: string;
  card_number: string | null;
  linked_order_id: number | null;
}

interface ScrapedOrder {
  remambo_order_id: string;
  status: string;
  parcel_id: string | null;
  ordered_at: string | null;
  shipped_at: string | null;
  received_at: string | null;
  items_total_jpy: number;
  service_fee_jpy: number;
  shipping_jpy: number;
  items: ScrapedItem[];
}

interface ResolvedItem {
  cardId: number;
  cardNumber: string;
  name: string;
  setCode: string;
  condition: string;
  quantity: number;
  unitPriceJpy: number;
  cardrushUrl: string;
  orderItemId: number | null;
}

// ---------------------------------------------------------------------------
// Scrape order details
// ---------------------------------------------------------------------------

async function scrapeOrder(page: Page, orderId: string): Promise<ScrapedOrder> {
  const url = `https://www.remambo.jp/office/orders/details?orderId=${orderId}`;
  await page.goto(url, { waitUntil: "networkidle" });

  const screenshotDir = path.join(__dirname, "logs");
  mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, `remambo-import-${orderId}.png`), fullPage: true });

  const pageText = await page.evaluate(() => document.body.innerText);
  writeFileSync(path.join(screenshotDir, `remambo-import-${orderId}.txt`), pageText);

  const html = await page.evaluate(() => document.body.innerHTML);
  writeFileSync(path.join(screenshotDir, `remambo-import-${orderId}.html`), html);

  const cardrushLinks: string[] = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="cardrush"]'))
      .map(a => (a as HTMLAnchorElement).href);
  });

  return parseOrderText(pageText, cardrushLinks, orderId);
}

function parseOrderText(text: string, cardrushLinks: string[], orderId: string): ScrapedOrder {
  const orderIdMatch = text.match(/A-\d{5,}/);
  const remamboOrderId = orderIdMatch ? orderIdMatch[0] : `A-${orderId}`;

  let status = "ordered";
  const statusMatch = text.match(/Status:\s*(shipped|received|ordered|delivered|processing|purchase process|Remambo warehouse)/i);
  if (statusMatch) {
    const s = statusMatch[1].toLowerCase();
    if (s === "shipped" || s === "delivered") status = "shipped";
    else if (s === "received") status = "received";
  }

  const parcelMatch = text.match(/Parcel:\s*(Z-\d+)/);
  const parcelId = parcelMatch ? parcelMatch[1] : null;

  const orderDateMatch = text.match(/Date:\s*(\d{2})\.(\d{2})\.(\d{4})/);
  const orderedAt = orderDateMatch ? `${orderDateMatch[3]}-${orderDateMatch[2]}-${orderDateMatch[1]}` : null;

  const shippedDateMatch = text.match(/shipped\s*\((\d{2})\.(\d{2})\.(\d{4})\)/);
  const shippedAt = shippedDateMatch ? `${shippedDateMatch[3]}-${shippedDateMatch[2]}-${shippedDateMatch[1]}` : null;

  const receivedDateMatch = text.match(/received\s*\((\d{2})\.(\d{2})\.(\d{4})\)/);
  const receivedAt = receivedDateMatch ? `${receivedDateMatch[3]}-${receivedDateMatch[2]}-${receivedDateMatch[1]}` : null;

  const itemsTotalMatch = text.match(/Items total price:\s*¥\s*([0-9,]+)/);
  const serviceFeeMatch = text.match(/service fee:\s*¥\s*([0-9,]+)/i);
  const shippingMatch = text.match(/(?:Domestic shipping|shipping) cost:\s*¥\s*([0-9,]+)/i);

  const itemsTotalJpy = itemsTotalMatch ? parseInt(itemsTotalMatch[1].replace(/,/g, "")) : 0;
  const serviceFeeJpy = serviceFeeMatch ? parseInt(serviceFeeMatch[1].replace(/,/g, "")) : 0;
  const shippingJpy = shippingMatch ? parseInt(shippingMatch[1].replace(/,/g, "")) : 0;

  const items: ScrapedItem[] = [];
  const lines = text.split("\n").map(l => l.trim());
  let currentTitle = "";
  let currentCondition = "Mint";
  let currentCardNumber: string | null = null;
  let currentOrderId: number | null = null;
  let linkIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const braceMatch = line.match(/\{([A-Z][A-Z0-9]*(?:-\d+)?)(?:\[([A-Z0-9]+)\])?\}/);
    if (braceMatch) {
      currentTitle = line;
      currentCardNumber = braceMatch[1];
      currentCondition = /〔状態A-〕/.test(line) ? "状態A-" : "Mint";
      currentOrderId = null;
      continue;
    }

    // Surugaya format: "OP01-047[SR]：(パラレル)トラファルガー・ロー"
    // or "〔状態A-〕OP01-047[SR]：(パラレル)トラファルガー・ロー"
    const surugayaMatch = line.match(/^(?:〔状態A-〕)?((?:OP|ST|EB|PRB|P-)\d+-?\d*)\[/);
    if (surugayaMatch) {
      currentTitle = line;
      currentCardNumber = surugayaMatch[1];
      currentCondition = /〔状態A-〕/.test(line) ? "状態A-" : "Mint";
      currentOrderId = null;
      continue;
    }

    const orderLineMatch = line.match(/^Order #(\d+)\s*[—–-]\s*([A-Z][A-Z0-9]*(?:-\d+)?)\s+(.*)?$/);
    const stockBuyMatch = !orderLineMatch ? line.match(/^Stock buy\s*[—–-]\s*([A-Z][A-Z0-9]*(?:-\d+)?)\s+(.*)?$/) : null;
    if (orderLineMatch || stockBuyMatch) {
      if (orderLineMatch) {
        currentOrderId = parseInt(orderLineMatch[1]);
        currentCardNumber = orderLineMatch[2];
      } else if (stockBuyMatch) {
        currentOrderId = null;
        currentCardNumber = stockBuyMatch[1];
      }
      if (!currentTitle) {
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          if (lines[j] && !lines[j].startsWith("Price:") && !lines[j].startsWith("Quantity:") && !lines[j].startsWith("Item subtotal:")) {
            currentTitle = lines[j];
            break;
          }
        }
      }
      currentCondition = /〔状態A-〕/.test(currentTitle) ? "状態A-" : "Mint";
      continue;
    }

    const priceMatch = line.match(/^Price:\s*¥\s*([0-9,]+)/);
    // If we hit a Price line with no current context, look back for a title line
    if (priceMatch && !currentTitle && !currentCardNumber) {
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        if (lines[j] && !lines[j].startsWith("Price:") && !lines[j].startsWith("Quantity:") && !lines[j].startsWith("Item subtotal:") && !lines[j].startsWith("Shopping site:")) {
          currentTitle = lines[j];
          // Try to extract card number from surugaya-style title
          const cn = lines[j].match(/^(?:〔状態A-〕)?((?:OP|ST|EB|PRB|P-)\d+-?\d*)\[/);
          if (cn) {
            currentCardNumber = cn[1];
            currentCondition = /〔状態A-〕/.test(lines[j]) ? "状態A-" : "Mint";
          }
          break;
        }
      }
    }
    if (priceMatch && (currentTitle || currentCardNumber)) {
      const price = parseInt(priceMatch[1].replace(/,/g, ""));
      const qtyLine = (lines[i + 1] || "").trim();
      const qtyMatch = qtyLine.match(/^Quantity:\s*(\d+)/);
      const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;

      const shopUrl = cardrushLinks[linkIndex] || "";
      linkIndex++;

      items.push({
        title: currentTitle,
        price_jpy: price,
        quantity: qty,
        shop_url: shopUrl,
        condition: currentCondition,
        card_number: currentCardNumber,
        linked_order_id: currentOrderId,
      });

      currentTitle = "";
      currentCardNumber = null;
      currentOrderId = null;
      currentCondition = "Mint";
    }
  }

  return {
    remambo_order_id: remamboOrderId,
    status, parcel_id: parcelId,
    ordered_at: orderedAt, shipped_at: shippedAt, received_at: receivedAt,
    items_total_jpy: itemsTotalJpy, service_fee_jpy: serviceFeeJpy, shipping_jpy: shippingJpy,
    items,
  };
}

// ---------------------------------------------------------------------------
// Card resolution
// ---------------------------------------------------------------------------

async function resolveCard(item: ScrapedItem, inferredOrderId: number | null = null): Promise<ResolvedItem | null> {
  const { shop_url: shopUrl, title, price_jpy: priceJpy, quantity, condition, card_number: parsedCardNumber, linked_order_id } = item;
  const cleanUrl = shopUrl.split("?")[0].replace(/\/+$/, "");

  let cardId: number | null = null;
  let cardNumber = parsedCardNumber || "";
  let name = title;
  let setCode = "";

  if (cleanUrl) {
    const directMatch = await sql`SELECT id, card_number, name, set_code FROM cards WHERE cardrush_url = ${cleanUrl} OR cardrush_url = ${shopUrl} LIMIT 1`;
    if (directMatch.length > 0) {
      cardId = directMatch[0].id;
      cardNumber = cardNumber || directMatch[0].card_number;
      name = directMatch[0].name || title;
      setCode = directMatch[0].set_code || "";
    }
  }

  if (!cardId && cleanUrl) {
    const cpMatch = await sql`SELECT card_number, name, condition, cardrush_url FROM condition_prices WHERE cardrush_url = ${cleanUrl} OR cardrush_url = ${shopUrl} ORDER BY snapshot_date DESC LIMIT 1`;
    if (cpMatch.length > 0) {
      cardNumber = cardNumber || cpMatch[0].card_number;
      name = cpMatch[0].name || title;
      if (cpMatch[0].condition !== "Mint") {
        const mintCp = await sql`SELECT cardrush_url FROM condition_prices WHERE card_number = ${cpMatch[0].card_number} AND name = ${cpMatch[0].name} AND condition = 'Mint' ORDER BY snapshot_date DESC LIMIT 1`;
        if (mintCp.length > 0) {
          const cardRow = await sql`SELECT id FROM cards WHERE cardrush_url = ${mintCp[0].cardrush_url} LIMIT 1`;
          if (cardRow.length > 0) cardId = cardRow[0].id;
        }
      }
      if (!cardId) {
        const cardRow = await sql`SELECT id FROM cards WHERE card_number = ${cpMatch[0].card_number} ORDER BY id LIMIT 1`;
        if (cardRow.length > 0) cardId = cardRow[0].id;
      }
    }
  }

  if (!cardId && cardNumber) {
    const cardRow = await sql`SELECT id, name, set_code FROM cards WHERE card_number = ${cardNumber} ORDER BY id LIMIT 1`;
    if (cardRow.length > 0) {
      cardId = cardRow[0].id;
      name = cardRow[0].name || title;
      setCode = cardRow[0].set_code || "";
    }
  }

  if (!cardId) {
    const cardNumMatch = title.match(/\{((?:[A-Z]+\d*-?\d+))(?:\[|})/) || title.match(/((?:OP|ST|EB|PRB|P)-?\d{2,3}(?:-\d{3})?)/);
    if (cardNumMatch) {
      cardNumber = cardNumMatch[1];
      const cardRow = await sql`SELECT id, name, set_code FROM cards WHERE card_number = ${cardNumber} ORDER BY id LIMIT 1`;
      if (cardRow.length > 0) {
        cardId = cardRow[0].id;
        name = cardRow[0].name || title;
        setCode = cardRow[0].set_code || "";
      }
    }
  }

  if (!cardId) return null;

  let orderItemId: number | null = null;
  if (linked_order_id && cardNumber) {
    const oiRows = await sql`SELECT oi.id FROM order_items oi JOIN cards c ON c.id = oi.card_id WHERE oi.order_id = ${linked_order_id} AND c.card_number = ${cardNumber} LIMIT 1`;
    if (oiRows.length > 0) orderItemId = oiRows[0].id;
  }
  if (!orderItemId && cardNumber && inferredOrderId) {
    const oiRows = await sql`SELECT oi.id FROM order_items oi JOIN cards c ON c.id = oi.card_id WHERE oi.order_id = ${inferredOrderId} AND c.card_number = ${cardNumber} LIMIT 1`;
    if (oiRows.length > 0) orderItemId = oiRows[0].id;
  }

  return { cardId, cardNumber, name, setCode, condition, quantity, unitPriceJpy: priceJpy, cardrushUrl: shopUrl, orderItemId };
}

// ---------------------------------------------------------------------------
// Import one order
// ---------------------------------------------------------------------------

async function importOrder(page: Page, orderId: string): Promise<{ success: boolean; items: number; skipped?: string }> {
  // Idempotency check
  const possibleIds = [`A-${orderId}`, orderId];
  for (const pid of possibleIds) {
    const existing = await sql`SELECT id FROM purchases WHERE remambo_order_id = ${pid} LIMIT 1`;
    if (existing.length > 0) {
      return { success: true, items: 0, skipped: `already exists (id=${existing[0].id})` };
    }
  }

  const order = await scrapeOrder(page, orderId);

  if (order.items.length === 0) {
    return { success: false, items: 0, skipped: "no items scraped" };
  }

  // Check if this is a non-OP order (pokemon, etc)
  const hasOpCards = order.items.some(i =>
    i.card_number?.match(/^(OP|ST|EB|PRB|P-)/i) ||
    i.title.match(/\{(OP|ST|EB|PRB|P-)/i) ||
    i.shop_url.includes("cardrush-op")
  );

  if (!hasOpCards) {
    return { success: false, items: 0, skipped: "not One Piece TCG" };
  }

  // Infer order_id
  const orderIdCounts = new Map<number, number>();
  for (const item of order.items) {
    if (item.linked_order_id != null)
      orderIdCounts.set(item.linked_order_id, (orderIdCounts.get(item.linked_order_id) || 0) + 1);
  }
  let inferredOrderId: number | null = null;
  let maxCount = 0;
  orderIdCounts.forEach((count, oid) => { if (count > maxCount) { maxCount = count; inferredOrderId = oid; } });

  // Resolve cards
  const resolved: ResolvedItem[] = [];
  const unresolved: ScrapedItem[] = [];
  for (const item of order.items) {
    const result = await resolveCard(item, inferredOrderId);
    if (result) resolved.push(result);
    else unresolved.push(item);
  }

  if (dryRun) {
    console.log(`    [DRY RUN] Would insert ${resolved.length} items, ${unresolved.length} unresolved`);
    return { success: true, items: resolved.length };
  }

  if (resolved.length === 0) {
    return { success: false, items: 0, skipped: "no items resolved" };
  }

  // Insert purchase
  const dbStatus = (["ordered", "shipped", "received"] as const).includes(order.status as any) ? order.status : "ordered";
  const [purchase] = await sql`
    INSERT INTO purchases (remambo_order_id, supplier, parcel_id, ordered_at, shipped_at, received_at, status, items_total_jpy, service_fee_jpy, shipping_jpy)
    VALUES (${order.remambo_order_id}, 'cardrush', ${order.parcel_id},
      ${order.ordered_at ? new Date(order.ordered_at) : new Date()},
      ${order.shipped_at ? new Date(order.shipped_at) : null},
      ${order.received_at ? new Date(order.received_at) : null},
      ${dbStatus}, ${order.items_total_jpy}, ${order.service_fee_jpy}, ${order.shipping_jpy})
    RETURNING id
  `;

  for (const item of resolved) {
    await sql`INSERT INTO purchase_items (purchase_id, card_id, order_item_id, condition, quantity, unit_price_jpy, cardrush_url)
      VALUES (${purchase.id}, ${item.cardId}, ${item.orderItemId}, ${item.condition}, ${item.quantity}, ${item.unitPriceJpy}, ${item.cardrushUrl})`;
  }

  // Sync stock for Mint cards
  const mintCardIds = resolved.filter(r => !r.condition.startsWith("状態")).map(r => r.cardId);
  if (mintCardIds.length > 0) {
    await sql`
      UPDATE cards c SET stock = COALESCE(uk.qty, 0) FROM (
        SELECT pi.card_id, GREATEST(SUM(pi.quantity) - COALESCE(
          (SELECT SUM(fe.fulfilled_qty) FROM fulfillment_entries fe
           JOIN order_items oi ON oi.id = fe.order_item_id AND oi.removed_at IS NULL
           WHERE oi.card_id = pi.card_id), 0), 0)::int AS qty
        FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchase_id
        WHERE pu.status = 'received' AND pi.condition NOT LIKE '状態%'
        GROUP BY pi.card_id
      ) uk WHERE c.id = uk.card_id AND c.id = ANY(${mintCardIds})`;
    await sql`
      UPDATE cards c SET pending_stock = COALESCE(pk.qty, 0) FROM (
        SELECT pi.card_id, SUM(pi.quantity)::int AS qty
        FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchase_id
        WHERE pu.status IN ('ordered', 'shipped') AND pi.condition NOT LIKE '状態%'
        GROUP BY pi.card_id
      ) pk WHERE c.id = pk.card_id AND c.id = ANY(${mintCardIds})`;
    await sql`
      UPDATE cards SET pending_stock = 0
      WHERE pending_stock != 0 AND id = ANY(${mintCardIds})
      AND id NOT IN (SELECT pi.card_id FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchase_id WHERE pu.status IN ('ordered', 'shipped'))`;
  }

  const mintCount = resolved.filter(r => !r.condition.startsWith("状態")).length;
  const aMinCount = resolved.length - mintCount;
  return {
    success: true,
    items: resolved.length,
    skipped: unresolved.length > 0 ? `${unresolved.length} unresolved` : undefined,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n=== Batch Import: ${orderIds.length} orders ===`);
  if (dryRun) console.log("Mode: DRY RUN\n");

  const session = await getRemamboSession(headed);
  const { page } = session;

  const results: { id: string; success: boolean; items: number; note?: string }[] = [];

  try {
    for (let i = 0; i < orderIds.length; i++) {
      const orderId = orderIds[i];
      process.stdout.write(`[${i + 1}/${orderIds.length}] A-${orderId}: `);

      try {
        const result = await importOrder(page, orderId);
        if (result.skipped) {
          console.log(result.skipped);
          results.push({ id: orderId, success: result.success, items: result.items, note: result.skipped });
        } else {
          console.log(`${result.items} items imported`);
          results.push({ id: orderId, success: true, items: result.items });
        }
      } catch (err: any) {
        console.log(`ERROR: ${err.message}`);
        results.push({ id: orderId, success: false, items: 0, note: err.message });
      }
    }
  } finally {
    await session.close();
    await sql.end();
  }

  // Summary
  console.log("\n=== Summary ===");
  const imported = results.filter(r => r.success && r.items > 0);
  const skipped = results.filter(r => r.note);
  const failed = results.filter(r => !r.success);
  console.log(`Imported: ${imported.length} orders (${imported.reduce((s, r) => s + r.items, 0)} items)`);
  if (skipped.length > 0) {
    console.log(`Skipped: ${skipped.length}`);
    for (const s of skipped) console.log(`  A-${s.id}: ${s.note}`);
  }
  if (failed.length > 0) {
    console.log(`Failed: ${failed.length}`);
    for (const f of failed) console.log(`  A-${f.id}: ${f.note}`);
  }
}

main().catch(err => { console.error("\nFatal:", err); process.exit(1); });
