#!/usr/bin/env tsx
// Import a Remambo order into purchases/purchase_items via Playwright scraping.
// Usage: npx tsx tools/import-remambo-order.ts --order=5999602 [--dry-run] [--headed]
//
// Logs into Remambo, scrapes the order details page, resolves card IDs,
// and inserts into purchases + purchase_items.
// Idempotent: skips if remambo_order_id already exists.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { chromium, type Page } from "playwright";
import postgres from "postgres";

// Load .env.local
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--") && !a.includes("=")));
const kvArgs = Object.fromEntries(
  args.filter((a) => a.includes("=")).map((a) => {
    const [k, ...v] = a.split("=");
    return [k, v.join("=")];
  })
);

const dryRun = flags.has("--dry-run");
const headed = flags.has("--headed");
const force = flags.has("--force");
const orderIdArg = kvArgs["--order"];

if (!orderIdArg) {
  console.error("Usage: npx tsx tools/import-remambo-order.ts --order=<remambo-order-id> [--dry-run] [--headed]");
  process.exit(1);
}

const REMAMBO_EMAIL = process.env.REMAMBO_EMAIL || "";
const REMAMBO_PASS = process.env.REMAMBO_PASSWORD || process.env.REMAMBO_PASS || "";
if (!REMAMBO_EMAIL || !REMAMBO_PASS) {
  console.error("REMAMBO_EMAIL and REMAMBO_PASSWORD must be set in .env.local");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required. Set it in .env.local.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { ssl: "require", max: 1 });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScrapedItem {
  title: string;
  price_jpy: number;
  quantity: number;
  shop_url: string;
  condition: string; // "Mint" or "状態A-"
  card_number: string | null; // extracted from title or "Order #XX" line
  linked_order_id: number | null; // from "Order #XX — ..." comment line
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

// ---------------------------------------------------------------------------
// Playwright: Login (same as remambo-order.ts)
// ---------------------------------------------------------------------------

async function login(page: Page): Promise<void> {
  await page.goto("https://www.remambo.jp/login", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="Email"]', REMAMBO_EMAIL);
  await page.fill('input[placeholder="Password"]', REMAMBO_PASS);
  await page.click('text="Sign in to your account"');
  await page.waitForLoadState("networkidle");

  if (page.url().includes("/login")) {
    throw new Error("Login failed — still on login page. Check REMAMBO_EMAIL / REMAMBO_PASSWORD.");
  }
}

// ---------------------------------------------------------------------------
// Playwright: Scrape order details page
// ---------------------------------------------------------------------------

async function scrapeOrder(page: Page, orderId: string): Promise<ScrapedOrder> {
  const url = `https://www.remambo.jp/office/orders/details?orderId=${orderId}`;
  console.log(`  Navigating to ${url}`);
  await page.goto(url, { waitUntil: "networkidle" });

  // Save screenshot + text dump for debugging
  const screenshotDir = path.join(__dirname, "logs");
  mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, `remambo-import-${orderId}.png`), fullPage: true });

  const pageText = await page.evaluate(() => document.body.innerText);
  writeFileSync(path.join(screenshotDir, `remambo-import-${orderId}.txt`), pageText);

  const html = await page.evaluate(() => document.body.innerHTML);
  writeFileSync(path.join(screenshotDir, `remambo-import-${orderId}.html`), html);
  console.log(`  Screenshot + text + HTML saved to tools/logs/`);

  // Extract CardRush URLs from the page (one per item, in order)
  const cardrushLinks: string[] = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="cardrush"]'))
      .map(a => (a as HTMLAnchorElement).href);
  });

  console.log(`  Page has ${cardrushLinks.length} CardRush links`);

  return parseOrderText(pageText, cardrushLinks, orderId);
}

// ---------------------------------------------------------------------------
// Parse order page text into structured data
// ---------------------------------------------------------------------------
//
// Remambo order details text format per item:
//   〔状態A-〕カード名(details)【rarity】{CARD_NUMBER[SET_CODE]}
//   Price: ¥ XXXX
//   Quantity: X
//   Item subtotal: ¥ XXXX
//
// Mint items have no 〔状態A-〕 prefix.
//
// Order totals at bottom:
//   Date:	26.02.2026
//   Status:	shipped (02.03.2026)
//   Parcel:	Z-770762
//   Items total price:	¥ 406640
//   Remambo service fee:	¥ 500
//   Domestic shipping cost:	¥ 700

function parseOrderText(text: string, cardrushLinks: string[], orderId: string): ScrapedOrder {
  // Order ID (A-XXXXXXX)
  const orderIdMatch = text.match(/A-\d{5,}/);
  const remamboOrderId = orderIdMatch ? orderIdMatch[0] : `A-${orderId}`;

  // Status — "Status:\tshipped (DD.MM.YYYY)"
  let status = "ordered";
  const statusMatch = text.match(/Status:\s*(shipped|received|ordered|delivered|processing|purchase process|Remambo warehouse)/i);
  if (statusMatch) {
    const s = statusMatch[1].toLowerCase();
    if (s === "shipped" || s === "delivered") status = "shipped";
    else if (s === "received") status = "received";
    // "purchase process", "processing", "remambo warehouse" all map to "ordered"
  }

  // Parcel ID — "Parcel:\tZ-XXXXXX"
  const parcelMatch = text.match(/Parcel:\s*(Z-\d+)/);
  const parcelId = parcelMatch ? parcelMatch[1] : null;

  // Dates — "Date:\t26.02.2026" and "shipped (02.03.2026)"
  const orderDateMatch = text.match(/Date:\s*(\d{2})\.(\d{2})\.(\d{4})/);
  const orderedAt = orderDateMatch
    ? `${orderDateMatch[3]}-${orderDateMatch[2]}-${orderDateMatch[1]}`
    : null;

  const shippedDateMatch = text.match(/shipped\s*\((\d{2})\.(\d{2})\.(\d{4})\)/);
  const shippedAt = shippedDateMatch
    ? `${shippedDateMatch[3]}-${shippedDateMatch[2]}-${shippedDateMatch[1]}`
    : null;

  const receivedDateMatch = text.match(/received\s*\((\d{2})\.(\d{2})\.(\d{4})\)/);
  const receivedAt = receivedDateMatch
    ? `${receivedDateMatch[3]}-${receivedDateMatch[2]}-${receivedDateMatch[1]}`
    : null;

  // Fees — "Items total price:\t¥ 406640"
  const itemsTotalMatch = text.match(/Items total price:\s*¥\s*([0-9,]+)/);
  const serviceFeeMatch = text.match(/service fee:\s*¥\s*([0-9,]+)/i);
  const shippingMatch = text.match(/(?:Domestic shipping|shipping) cost:\s*¥\s*([0-9,]+)/i);

  const itemsTotalJpy = itemsTotalMatch ? parseInt(itemsTotalMatch[1].replace(/,/g, "")) : 0;
  const serviceFeeJpy = serviceFeeMatch ? parseInt(serviceFeeMatch[1].replace(/,/g, "")) : 0;
  const shippingJpy = shippingMatch ? parseInt(shippingMatch[1].replace(/,/g, "")) : 0;

  // Parse items from text — two formats:
  //
  // Format A (automated tool): title line, then "Order #NN — CARD_NUMBER SET" comment line
  //   CardName(details)
  //   Order #31 — EB01-003 PROMO
  //   Price: ¥ 480
  //   Quantity: 4
  //
  // Format B (manually added): title with {CARD_NUMBER[SET]}
  //   〔状態A-〕CardName【rarity】{EB02-061}
  //   Price: ¥ 1780
  //   Quantity: 6
  //
  const items: ScrapedItem[] = [];
  const lines = text.split("\n").map((l) => l.trim());
  let currentTitle = "";
  let currentCondition = "Mint";
  let currentCardNumber: string | null = null;
  let currentOrderId: number | null = null;
  let linkIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Format B: title with {CARD_NUMBER} or {CARD_NUMBER[SET]}
    const braceMatch = line.match(/\{([A-Z][A-Z0-9]*(?:-\d+)?)(?:\[([A-Z0-9]+)\])?\}/);
    if (braceMatch) {
      currentTitle = line;
      currentCardNumber = braceMatch[1];
      currentCondition = /〔状態A-〕/.test(line) ? "状態A-" : "Mint";
      currentOrderId = null;
      continue;
    }

    // Format A: "Order #31 — EB01-003 PROMO" or "Stock buy — P-003 PROMO" comment line
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
      // Title is the previous non-empty line (the card name line before this)
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

    // Detect price line — "Price: ¥ XXXX"
    const priceMatch = line.match(/^Price:\s*¥\s*([0-9,]+)/);
    if (priceMatch && (currentTitle || currentCardNumber)) {
      const price = parseInt(priceMatch[1].replace(/,/g, ""));

      // Next line should be "Quantity: X"
      const qtyLine = (lines[i + 1] || "").trim();
      const qtyMatch = qtyLine.match(/^Quantity:\s*(\d+)/);
      const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;

      // Match to CardRush URL by order of appearance
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

      // Reset
      currentTitle = "";
      currentCardNumber = null;
      currentOrderId = null;
      currentCondition = "Mint";
    }
  }

  return {
    remambo_order_id: remamboOrderId,
    status,
    parcel_id: parcelId,
    ordered_at: orderedAt,
    shipped_at: shippedAt,
    received_at: receivedAt,
    items_total_jpy: itemsTotalJpy,
    service_fee_jpy: serviceFeeJpy,
    shipping_jpy: shippingJpy,
    items,
  };
}

// ---------------------------------------------------------------------------
// Card resolution (same logic as seed-purchase.ts)
// ---------------------------------------------------------------------------

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

async function resolveCardFromUrl(item: ScrapedItem, inferredOrderId: number | null = null): Promise<ResolvedItem | null> {
  const { shop_url: shopUrl, title, price_jpy: priceJpy, quantity, condition, card_number: parsedCardNumber, linked_order_id } = item;
  const cleanUrl = shopUrl.split("?")[0].replace(/\/+$/, "");

  let cardId: number | null = null;
  let cardNumber = parsedCardNumber || "";
  let name = title;
  let setCode = "";

  // 1. Direct match on cards.cardrush_url (Mint items)
  if (cleanUrl) {
    const directMatch = await sql`
      SELECT id, card_number, name, set_code FROM cards
      WHERE cardrush_url = ${cleanUrl} OR cardrush_url = ${shopUrl}
      LIMIT 1
    `;
    if (directMatch.length > 0) {
      const card = directMatch[0];
      cardId = card.id;
      cardNumber = cardNumber || card.card_number;
      name = card.name || title;
      setCode = card.set_code || "";
    }
  }

  // 2. Check condition_prices for the URL (A- or other variant)
  if (!cardId && cleanUrl) {
    const cpMatch = await sql`
      SELECT card_number, name, condition, cardrush_url
      FROM condition_prices
      WHERE cardrush_url = ${cleanUrl} OR cardrush_url = ${shopUrl}
      ORDER BY snapshot_date DESC LIMIT 1
    `;

    if (cpMatch.length > 0) {
      const cp = cpMatch[0];
      cardNumber = cardNumber || cp.card_number;
      name = cp.name || title;

      // Find the Mint variant URL → match to cards table
      if (cp.condition !== "Mint") {
        const mintCp = await sql`
          SELECT cardrush_url FROM condition_prices
          WHERE card_number = ${cp.card_number} AND name = ${cp.name} AND condition = 'Mint'
          ORDER BY snapshot_date DESC LIMIT 1
        `;
        if (mintCp.length > 0) {
          const cardRow = await sql`SELECT id FROM cards WHERE cardrush_url = ${mintCp[0].cardrush_url} LIMIT 1`;
          if (cardRow.length > 0) cardId = cardRow[0].id;
        }
      }

      if (!cardId) {
        const cardRow = await sql`SELECT id FROM cards WHERE card_number = ${cp.card_number} ORDER BY id LIMIT 1`;
        if (cardRow.length > 0) cardId = cardRow[0].id;
      }
    }
  }

  // 3. Use pre-parsed card_number (from "Order #XX" line or {CARD_NUMBER} in title)
  if (!cardId && cardNumber) {
    const cardRow = await sql`SELECT id, name, set_code FROM cards WHERE card_number = ${cardNumber} ORDER BY id LIMIT 1`;
    if (cardRow.length > 0) {
      cardId = cardRow[0].id;
      name = cardRow[0].name || title;
      setCode = cardRow[0].set_code || "";
    }
  }

  // 4. Extract card number from title as last resort — {OP01-016[OP05]} or {P-043}
  if (!cardId) {
    const cardNumMatch = title.match(/\{((?:[A-Z]+\d*-?\d+))(?:\[|})/)
      || title.match(/((?:OP|ST|EB|PRB|P)-?\d{2,3}(?:-\d{3})?)/);
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

  if (!cardId) {
    console.warn(`  Could not resolve card for: ${title} (${shopUrl})`);
    return null;
  }

  // Resolve order_item_id from linked_order_id + card_number
  let orderItemId: number | null = null;
  if (linked_order_id && cardNumber) {
    const oiRows = await sql`
      SELECT oi.id FROM order_items oi
      JOIN cards c ON c.id = oi.card_id
      WHERE oi.order_id = ${linked_order_id} AND c.card_number = ${cardNumber}
      LIMIT 1
    `;
    if (oiRows.length > 0) orderItemId = oiRows[0].id;
  }

  // Fallback: use inferred order_id for Format B items (no linked_order_id)
  if (!orderItemId && cardNumber && inferredOrderId) {
    const oiRows = await sql`
      SELECT oi.id FROM order_items oi
      JOIN cards c ON c.id = oi.card_id
      WHERE oi.order_id = ${inferredOrderId} AND c.card_number = ${cardNumber}
      LIMIT 1
    `;
    if (oiRows.length > 0) orderItemId = oiRows[0].id;
  }

  return {
    cardId,
    cardNumber,
    name,
    setCode,
    condition,
    quantity,
    unitPriceJpy: priceJpy,
    cardrushUrl: shopUrl,
    orderItemId,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n=== Import Remambo Order ${orderIdArg} ===`);
  if (dryRun) console.log("  Mode: DRY RUN");
  if (headed) console.log("  Browser: headed");

  // Idempotency check
  const possibleIds = [`A-${orderIdArg}`, orderIdArg];
  let existingPurchaseId: number | null = null;
  for (const pid of possibleIds) {
    const existing = await sql`SELECT id FROM purchases WHERE remambo_order_id = ${pid} LIMIT 1`;
    if (existing.length > 0) {
      if (force) {
        existingPurchaseId = existing[0].id;
        console.log(`  Purchase ${pid} exists (id=${existing[0].id}). --force: will delete and re-import.`);
      } else {
        console.log(`  Purchase ${pid} already exists (id=${existing[0].id}). Use --force to re-import.`);
        await sql.end();
        return;
      }
      break;
    }
  }

  // Launch browser and scrape
  console.log("\n[1/3] Logging in to Remambo...");
  const browser = await chromium.launch({ headless: !headed });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  try {
    await login(page);
    console.log(`  Logged in as ${REMAMBO_EMAIL}`);

    console.log("\n[2/3] Scraping order details...");
    const order = await scrapeOrder(page, orderIdArg);

    console.log(`\n  Order ID: ${order.remambo_order_id}`);
    console.log(`  Status: ${order.status}`);
    console.log(`  Parcel: ${order.parcel_id || "—"}`);
    console.log(`  Ordered: ${order.ordered_at || "—"}`);
    console.log(`  Shipped: ${order.shipped_at || "—"}`);
    console.log(`  Items found: ${order.items.length}`);
    console.log(`  Items total: ¥${order.items_total_jpy.toLocaleString()}`);
    console.log(`  Service fee: ¥${order.service_fee_jpy.toLocaleString()}`);
    console.log(`  Shipping: ¥${order.shipping_jpy.toLocaleString()}`);

    if (order.items.length === 0) {
      console.log("\n  No items scraped! Check tools/logs/ for the screenshot and text dump.");
      await browser.close();
      await sql.end();
      return;
    }

    console.log("\n  Items:");
    for (const item of order.items) {
      const tag = item.condition === "Mint" ? "" : ` [${item.condition}]`;
      console.log(`    ${item.title.slice(0, 60)} x${item.quantity} @ ¥${item.price_jpy.toLocaleString()}${tag}`);
    }

    // Resolve card IDs
    console.log("\n[3/3] Resolving card IDs...");

    // Infer order_id from mode of linked_order_id values (for Format B fallback)
    const orderIdCounts = new Map<number, number>();
    for (const item of order.items) {
      if (item.linked_order_id != null) {
        orderIdCounts.set(item.linked_order_id, (orderIdCounts.get(item.linked_order_id) || 0) + 1);
      }
    }
    let inferredOrderId: number | null = null;
    let maxCount = 0;
    orderIdCounts.forEach((count, oid) => {
      if (count > maxCount) { maxCount = count; inferredOrderId = oid; }
    });
    if (inferredOrderId) console.log(`  Inferred order_id=${inferredOrderId} from ${maxCount} Format A items`);

    const resolved: ResolvedItem[] = [];
    const unresolved: ScrapedItem[] = [];

    for (const item of order.items) {
      const result = await resolveCardFromUrl(item, inferredOrderId);
      if (result) {
        const oiTag = result.orderItemId ? ` oi=${result.orderItemId}` : "";
        console.log(`  ${result.cardNumber} ${result.name.slice(0, 35)} → card_id=${result.cardId} (${result.condition})${oiTag}`);
        resolved.push(result);
      } else {
        unresolved.push(item);
      }
    }

    if (unresolved.length > 0) {
      console.log(`\n  ${unresolved.length} item(s) could not be resolved:`);
      for (const u of unresolved) {
        console.log(`    ${u.title || "(no title)"} — ${u.shop_url}`);
      }
    }

    // Save manifest
    const manifestPath = path.join(__dirname, "logs", `remambo-import-${orderIdArg}.json`);
    writeFileSync(manifestPath, JSON.stringify({
      remambo_order_id: order.remambo_order_id,
      scraped_at: new Date().toISOString(),
      dry_run: dryRun,
      order,
      resolved: resolved.map(r => ({
        card_id: r.cardId,
        card_number: r.cardNumber,
        name: r.name,
        condition: r.condition,
        qty: r.quantity,
        price_jpy: r.unitPriceJpy,
        url: r.cardrushUrl,
        order_item_id: r.orderItemId,
      })),
      unresolved,
    }, null, 2));
    console.log(`\n  Manifest → ${path.relative(process.cwd(), manifestPath)}`);

    if (dryRun) {
      console.log("\n  [DRY RUN] Would insert:");
      console.log(`    1 purchase: ${order.remambo_order_id}`);
      console.log(`    ${resolved.length} purchase_items`);
      await browser.close();
      await sql.end();
      return;
    }

    if (resolved.length === 0) {
      console.log("\n  No items resolved — nothing to insert.");
      await browser.close();
      await sql.end();
      return;
    }

    // Delete old record if --force
    if (existingPurchaseId) {
      const [deleted] = await sql`
        SELECT count(*)::int AS cnt FROM purchase_items WHERE purchase_id = ${existingPurchaseId}
      `;
      await sql`DELETE FROM purchase_items WHERE purchase_id = ${existingPurchaseId}`;
      await sql`DELETE FROM purchases WHERE id = ${existingPurchaseId}`;
      console.log(`\n  Deleted old purchase id=${existingPurchaseId} (${deleted.cnt} items)`);
    }

    // Insert purchase
    const dbStatus = (["ordered", "shipped", "received"] as const).includes(order.status as any)
      ? order.status
      : "ordered";

    const [purchase] = await sql`
      INSERT INTO purchases (
        remambo_order_id, supplier, parcel_id, ordered_at, shipped_at, received_at,
        status, items_total_jpy, service_fee_jpy, shipping_jpy
      ) VALUES (
        ${order.remambo_order_id}, 'cardrush', ${order.parcel_id},
        ${order.ordered_at ? new Date(order.ordered_at) : new Date()},
        ${order.shipped_at ? new Date(order.shipped_at) : null},
        ${order.received_at ? new Date(order.received_at) : null},
        ${dbStatus}, ${order.items_total_jpy}, ${order.service_fee_jpy}, ${order.shipping_jpy}
      ) RETURNING id
    `;

    console.log(`\n  Inserted purchase id=${purchase.id}`);

    // All items count toward stock (A- treated same as Mint)
    const mintItems = resolved;
    const reviewItems: ResolvedItem[] = [];

    // Insert all purchase items (both Mint and A-)
    for (const item of resolved) {
      await sql`
        INSERT INTO purchase_items (purchase_id, card_id, order_item_id, condition, quantity, unit_price_jpy, cardrush_url)
        VALUES (${purchase.id}, ${item.cardId}, ${item.orderItemId}, ${item.condition}, ${item.quantity},
                ${item.unitPriceJpy}, ${item.cardrushUrl})
      `;
      const oiTag = item.orderItemId ? ` → oi=${item.orderItemId}` : "";
      const reviewTag = "";
      console.log(`    ${item.cardNumber} x${item.quantity} (${item.condition}) → card_id=${item.cardId}${oiTag}${reviewTag}`);
    }

    if (reviewItems.length > 0) {
      console.log(`\n  ⚠ ${reviewItems.length} A- condition items need review (not counted in stock):`);
      for (const item of reviewItems) {
        console.log(`    ${item.cardNumber} ${item.name.slice(0, 40)} x${item.quantity} (${item.condition}) ¥${item.unitPriceJpy}`);
      }
    }

    // Sync UK stock + pending stock — only Mint items affect stock counts
    const cardIds = mintItems.map((r) => r.cardId);
    if (cardIds.length > 0) {
      // On-hand: received purchases minus fulfilled (all conditions counted)
      await sql`
        UPDATE cards c
        SET stock = COALESCE(uk.qty, 0)
        FROM (
          SELECT pi.card_id,
            GREATEST(SUM(pi.quantity) - COALESCE(
              (SELECT SUM(fe.fulfilled_qty) FROM fulfillment_entries fe
               JOIN order_items oi ON oi.id = fe.order_item_id AND oi.removed_at IS NULL
               WHERE oi.card_id = pi.card_id), 0
            ), 0)::int AS qty
          FROM purchase_items pi
          JOIN purchases pu ON pu.id = pi.purchase_id
          WHERE pu.status = 'received'
          GROUP BY pi.card_id
        ) uk
        WHERE c.id = uk.card_id AND c.id = ANY(${cardIds})
      `;
      // Pending: ordered/shipped but not received (all conditions counted)
      await sql`
        UPDATE cards c
        SET pending_stock = COALESCE(pk.qty, 0)
        FROM (
          SELECT pi.card_id, SUM(pi.quantity)::int AS qty
          FROM purchase_items pi
          JOIN purchases pu ON pu.id = pi.purchase_id
          WHERE pu.status IN ('ordered', 'shipped')
          GROUP BY pi.card_id
        ) pk
        WHERE c.id = pk.card_id AND c.id = ANY(${cardIds})
      `;
      // Zero out pending for cards no longer in ordered/shipped
      await sql`
        UPDATE cards SET pending_stock = 0
        WHERE pending_stock != 0 AND id = ANY(${cardIds})
        AND id NOT IN (
          SELECT pi.card_id FROM purchase_items pi
          JOIN purchases pu ON pu.id = pi.purchase_id
          WHERE pu.status IN ('ordered', 'shipped')
        )
      `;
      console.log(`\n  Synced UK stock for ${cardIds.length} cards.`);
    }

    console.log(`\n  Done! Purchase ${order.remambo_order_id}: ${resolved.length} items imported.`);

  } finally {
    await browser.close();
    await sql.end();
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
