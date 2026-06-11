import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchCard, fetchPrices } from "@/lib/wholesale/client";
import { gameFromSku } from "@/lib/tradein/games";
import { query } from "@/lib/db";

// POST — submit trade-in for credit (single card or batch)
// Credit is NOT issued instantly — submission goes through review workflow
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json();

  // Support both single card { sku, quantity } and batch { items: [{ sku, quantity }] }
  const items: { sku: string; quantity: number }[] = body.items
    ? body.items
    : [{ sku: body.sku, quantity: body.quantity || 1 }];

  if (!items.length || !items[0].sku) {
    return NextResponse.json({ error: "At least one card required." }, { status: 400 });
  }

  // Resolve credit prices for all items
  const resolvedItems: {
    sku: string;
    quantity: number;
    creditPerCard: number;
    cardName: string;
    cardNumber: string;
    setCode: string | null;
  }[] = [];

  // Cache batch lookups by set
  const setCache = new Map<string, Map<string, { price: number; name: string }>>();

  for (const item of items) {
    const qty = Math.min(Math.max(item.quantity || 1, 1), 99);
    const skuParts = item.sku.split("-");
    const setCode = skuParts.length >= 2 ? skuParts[1] : undefined;

    let creditPerCard = 0;
    let cardName = item.sku;

    // Try individual lookup
    const directCard = await fetchCard(item.sku, "tradein-credit").catch(() => null);
    if (directCard?.channel_price && directCard.channel_price > 0) {
      creditPerCard = directCard.channel_price;
      cardName = directCard.name_en || directCard.name || directCard.card_number;
    } else if (setCode && gameFromSku(item.sku)) {
      // Batch lookup (cached per set). Game derived from the SKU prefix —
      // unprefixed SKUs (SEALED-) rely on the direct lookup above.
      if (!setCache.has(setCode)) {
        const batchRes = await fetchPrices({ game: gameFromSku(item.sku)!, set: setCode, channel: "tradein-credit", limit: 500 }).catch(() => ({ items: [] }));
        const map = new Map<string, { price: number; name: string }>();
        for (const b of batchRes.items) {
          if (b.channel_price && b.channel_price > 0) {
            map.set(b.sku, { price: b.channel_price, name: b.name_en || b.name || b.card_number });
          }
        }
        setCache.set(setCode, map);
      }
      const cached = setCache.get(setCode)?.get(item.sku);
      if (cached) {
        creditPerCard = cached.price;
        cardName = cached.name;
      }
    }

    // Get card name from main channel if we don't have it
    if (cardName === item.sku) {
      const mainCard = await fetchCard(item.sku).catch(() => null);
      if (mainCard) cardName = mainCard.name_en || mainCard.name || mainCard.card_number;
    }

    if (creditPerCard <= 0) continue; // Skip cards not on buy list

    resolvedItems.push({
      sku: item.sku,
      quantity: qty,
      creditPerCard,
      cardName,
      cardNumber: skuParts.slice(1, 3).join("-"),
      setCode: setCode || null,
    });
  }

  if (resolvedItems.length === 0) {
    return NextResponse.json({ error: "None of the submitted cards are on our buy list." }, { status: 400 });
  }

  const totalCredit = resolvedItems.reduce((sum, i) => sum + i.creditPerCard * i.quantity, 0);

  // Generate reference
  const today = new Date();
  const dateStr = today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const prefix = `CS-${dateStr}-`;

  const refResult = await query(
    `SELECT reference FROM tradein_submissions WHERE reference LIKE $1 ORDER BY reference DESC LIMIT 1`,
    [prefix + "%"]
  );
  let seq = 1;
  if (refResult.rows.length > 0) {
    seq = parseInt(refResult.rows[0].reference.slice(-4), 10) + 1;
  }
  const reference = prefix + String(seq).padStart(4, "0");

  // Create submission (status: submitted — credit NOT issued yet).
  // Link to the authenticated user so admin's later "paid" transition can
  // automatically credit the right account.
  await query(
    `INSERT INTO tradein_submissions
       (reference, status, customer_name, customer_email, payment_method,
        delivery_method, is_over_18, quoted_cash_total, quoted_credit_total, user_id)
     VALUES ($1, 'submitted', $2, $3, 'credit', 'mail', true, '0', $4, $5)`,
    [reference, session.user.name || "Customer", session.user.email,
     totalCredit.toFixed(2), session.user.id]
  );

  const subResult = await query(`SELECT id FROM tradein_submissions WHERE reference=$1`, [reference]);
  const submissionId = subResult.rows[0].id;

  // Record all items
  for (const item of resolvedItems) {
    await query(
      `INSERT INTO tradein_items (submission_id, sku, game, card_number, name, set_code, quantity, quoted_cash_price, quoted_credit_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '0', $8)`,
      [submissionId, item.sku, gameFromSku(item.sku) ?? "one-piece", item.cardNumber, item.cardName, item.setCode, item.quantity, item.creditPerCard.toFixed(2)]
    );
  }

  return NextResponse.json({
    reference,
    items: resolvedItems.map(i => ({ name: i.cardName, quantity: i.quantity, creditPerCard: i.creditPerCard })),
    totalCredit,
    itemCount: resolvedItems.length,
    message: `Trade-in submitted with ${resolvedItems.length} card(s) for £${totalCredit.toFixed(2)} credit. We'll review and send you a quotation.`,
  });
}
