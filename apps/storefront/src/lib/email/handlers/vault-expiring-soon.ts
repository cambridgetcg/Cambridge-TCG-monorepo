// Handler for the scheduled "vault expiring in 7 days" email.
//
// Queued when a vault item is created (7 days before expires_at).
// At drain time we re-fetch the vault item — if it's no longer 'reserved'
// (sold back, redeemed, or already expired) the email is cancelled instead
// of sent, so stale promises can't go out.

import { query } from "@/lib/db";
import { registerQueueHandler, type QueueHandlerResult, type QueueRow } from "../queue";
import { renderLayout, escapeHtml } from "../layout";
import { sendEmail } from "../send";

interface Data {
  vaultItemId: string;
}

async function handle(row: QueueRow): Promise<QueueHandlerResult> {
  const data = row.data as unknown as Data;
  if (!data.vaultItemId) return { kind: "failed", error: "missing vaultItemId" };

  const result = await query(
    `SELECT v.id, v.user_id, v.status, v.sku, v.card_name, v.card_number, v.rarity,
            v.image_url, v.spot_price_gbp, v.expires_at, u.email, u.name
     FROM vault_items v JOIN users u ON u.id = v.user_id
     WHERE v.id = $1`,
    [data.vaultItemId],
  );
  if (result.rows.length === 0) {
    return { kind: "cancelled", reason: "vault item not found" };
  }
  const v = result.rows[0];
  if (v.status !== "reserved") {
    return { kind: "cancelled", reason: `vault item status is ${v.status}` };
  }

  const daysLeft = Math.max(
    0,
    Math.floor((new Date(v.expires_at).getTime() - Date.now()) / 86400000),
  );
  const spot = parseFloat(v.spot_price_gbp);
  const sellBack = Number((spot * 0.77).toFixed(2));
  const greeting = v.name ? escapeHtml(v.name) : "there";
  const expiresDate = new Date(v.expires_at).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  const imageBlock = v.image_url
    ? `<div style="text-align:center;margin:16px 0;">
         <img src="${escapeHtml(v.image_url)}" alt="${escapeHtml(v.card_name)}"
              width="120" style="border-radius:10px;border:1px solid #404040;max-width:120px;height:auto;" />
       </div>`
    : "";

  const html = renderLayout({
    preheader: `${daysLeft} day${daysLeft === 1 ? "" : "s"} until ${v.card_name} auto-expires.`,
    heading: `${daysLeft} day${daysLeft === 1 ? "" : "s"} until your vault item expires`,
    bodyHtml: `
      <p style="margin:0 0 12px;">Hi ${greeting},</p>
      <p style="margin:0 0 16px;">
        Your Bounty Vault has a card approaching its 180-day expiry. Unless you
        redeem or sell it back by <strong style="color:#fff;">${escapeHtml(expiresDate)}</strong>,
        we'll auto-convert it to store credit at 77% of spot.
      </p>
      ${imageBlock}
      <div style="background:#262626;border-radius:8px;padding:14px 16px;margin:16px 0;">
        <p style="margin:0 0 6px;color:#fff;font-weight:600;">
          ${escapeHtml(v.card_name)}${v.card_number ? ` <span style="color:#737373;">(${escapeHtml(v.card_number)})</span>` : ""}${v.rarity ? ` <span style="color:#737373;">· ${escapeHtml(v.rarity)}</span>` : ""}
        </p>
        <p style="margin:0;font-size:13px;color:#a3a3a3;">
          Spot: £${spot.toFixed(2)} · Sell-back if expired: <span style="color:#34d399;">£${sellBack.toFixed(2)}</span>
        </p>
      </div>
      <p style="margin:0;font-size:13px;color:#a3a3a3;">
        Two paths — redeem for a physical shipment (still worth the full spot),
        or sell back now for immediate credit.
      </p>
    `,
    cta: { label: "Open Vault", url: "https://cambridgetcg.com/bounty" },
    footer: `You're getting this because the vault item above is approaching expiry.`,
  });

  const sendResult = await sendEmail({
    to: v.email,
    from: "bounty",
    subject: `Vault reminder: ${v.card_name} expires in ${daysLeft} days`,
    html,
    unsubscribe: { userId: v.user_id, category: "vault_expiring_soon" },
  });

  if (sendResult.ok) return { kind: "sent", messageId: sendResult.messageId };
  if (sendResult.error === "suppressed_by_preference") {
    return { kind: "cancelled", reason: "suppressed by preference" };
  }
  return { kind: "failed", error: sendResult.error };
}

registerQueueHandler("vault_expiring_soon", handle);
