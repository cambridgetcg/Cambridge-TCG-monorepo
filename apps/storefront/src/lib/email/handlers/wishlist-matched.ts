// Handler for wishlist_matched emails — fires when the wishlist sweep
// finds a card you want at or below your max price.
//
// Re-verifies at send time in case the source (P2P ask or wholesale stock)
// has evaporated since the sweep queued the email. If the listing is gone,
// cancel the send rather than mislead the user.

import { query } from "@/lib/db";
import { fetchCard } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { registerQueueHandler, type QueueHandlerResult, type QueueRow } from "../queue";
import { renderLayout, escapeHtml } from "../layout";
import { sendEmail } from "../send";

interface Data {
  wishlistId: string;
  sku: string;
  cardName: string;
  cardNumber: string | null;
  imageUrl: string | null;
  maxPrice: number;
  conditionMin: string;
  source: "wholesale" | "p2p";
  priceGbp: number;
  condition: string;
  quantityAvailable: number;
  marketOrderId: string | null;
}

async function verifyStillAvailable(d: Data): Promise<{ ok: true; price: number; qty: number } | { ok: false }> {
  if (d.source === "p2p" && d.marketOrderId) {
    const r = await query(
      `SELECT price, (quantity - filled_quantity) AS remaining, status
       FROM market_orders WHERE id = $1`,
      [d.marketOrderId],
    );
    const row = r.rows[0];
    if (!row) return { ok: false };
    if (row.status !== "open" && row.status !== "partially_filled") return { ok: false };
    const price = parseFloat(row.price);
    const qty = parseInt(row.remaining, 10);
    if (qty <= 0) return { ok: false };
    if (price > d.maxPrice) return { ok: false };
    return { ok: true, price, qty };
  }
  // wholesale path — live lookup
  const card = await fetchCard(d.sku);
  if (!card || card.stock <= 0) return { ok: false };
  const price = retailPrice(card.price_gbp, card.channel_price);
  if (price > d.maxPrice) return { ok: false };
  return { ok: true, price, qty: card.stock };
}

async function handle(row: QueueRow): Promise<QueueHandlerResult> {
  const d = row.data as unknown as Data;
  if (!d.wishlistId || !d.sku) return { kind: "failed", error: "missing wishlistId/sku" };

  // Confirm the wishlist item still exists + isn't fulfilled.
  const wishRow = await query(
    `SELECT w.id, w.fulfilled, u.email, u.name
     FROM wishlists w JOIN users u ON u.id = w.user_id
     WHERE w.id = $1`,
    [d.wishlistId],
  );
  if (wishRow.rows.length === 0) return { kind: "cancelled", reason: "wishlist item deleted" };
  if (wishRow.rows[0].fulfilled) return { kind: "cancelled", reason: "wishlist item fulfilled" };
  if (!wishRow.rows[0].email) return { kind: "failed", error: "user has no email" };

  const verified = await verifyStillAvailable(d);
  if (!verified.ok) return { kind: "cancelled", reason: "listing no longer available" };

  const user = wishRow.rows[0];
  const greeting = user.name ? escapeHtml(String(user.name)) : "there";
  const sourceLabel = d.source === "p2p"
    ? "another collector on the P2P market"
    : "the Cambridge TCG storefront";
  const destHref = d.source === "p2p"
    ? `https://cambridgetcg.com/market/${encodeURIComponent(d.sku)}`
    : `https://cambridgetcg.com/product/${encodeURIComponent(d.sku)}`;

  const imageBlock = d.imageUrl
    ? `<div style="text-align:center;margin:16px 0;">
         <img src="${escapeHtml(d.imageUrl)}" alt="${escapeHtml(d.cardName)}"
              width="140" style="border-radius:10px;border:2px solid #34d399;max-width:140px;height:auto;" />
       </div>`
    : "";

  const subject = `Match: ${d.cardName} for £${verified.price.toFixed(2)}`;

  const html = renderLayout({
    preheader: `A wishlist match appeared at £${verified.price.toFixed(2)} — under your £${d.maxPrice.toFixed(2)} target.`,
    heading: "A wishlist match",
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi ${greeting},</p>
      <p style="margin:0 0 16px;">
        <strong style="color:#fff;">${escapeHtml(d.cardName)}</strong>
        ${d.cardNumber ? `<span style="color:#737373;"> (${escapeHtml(d.cardNumber)})</span>` : ""}
        just became available from ${sourceLabel}
        ${d.condition && d.condition !== "NM" ? `<span style="color:#a3a3a3;"> · ${escapeHtml(d.condition)}</span>` : ""}
        at a price under your target.
      </p>
      ${imageBlock}
      <div style="background:#262626;border-radius:8px;padding:14px 16px;margin:16px 0;">
        <p style="margin:0 0 4px;font-size:13px;color:#a3a3a3;">Listed at</p>
        <p style="margin:0;font-size:22px;color:#34d399;font-weight:700;">
          £${verified.price.toFixed(2)}
        </p>
        <p style="margin:6px 0 0;font-size:12px;color:#737373;">
          Your max: £${d.maxPrice.toFixed(2)}
          · ${verified.qty} available
          · source: ${d.source}
        </p>
      </div>
      <p style="margin:0;font-size:13px;color:#a3a3a3;">
        P2P listings and wholesale stock move fast. If the match is gone by
        the time you click, it was claimed since we sent this — check your
        wishlist for the next notification.
      </p>
      <p style="margin:8px 0 0;font-size:12px;color:#737373;">
        We won&apos;t re-send this wish for 7 days. Remove it from your wishlist
        if you&apos;ve bought elsewhere.
      </p>
    `,
    cta: { label: d.source === "p2p" ? "View on P2P market" : "View in store", url: destHref },
    footer: `You're getting this because you have this card on your wishlist at
             £${d.maxPrice.toFixed(2)} or less. Manage your wishlist at
             /account/wishlist or toggle nudge emails under Email Preferences.`,
  });

  const result = await sendEmail({
    to: user.email,
    from: "bounty",
    fromName: "Cambridge TCG Wishlist",
    subject,
    html,
    // Uses the vault_expiring_soon preference category — both are
    // opportunity-preservation nudges. A dedicated "wishlist_matched"
    // category could be added later.
    unsubscribe: { userId: row.user_id, category: "vault_expiring_soon" },
  });

  if (result.ok) return { kind: "sent", messageId: result.messageId };
  if (result.error === "suppressed_by_preference") {
    return { kind: "cancelled", reason: "suppressed by preference" };
  }
  return { kind: "failed", error: result.error };
}

registerQueueHandler("wishlist_matched", handle);
