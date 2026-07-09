import { sendMail } from "@cambridge-tcg/email";
import type { AuctionShippingAddress } from "./types";

const FROM = (process.env.AUTH_FROM_EMAIL || "noreply@cambridgetcg.com").trim();
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://cambridgetcg.com").trim().replace(/\/+$/, "");

function emailTemplate(title: string, body: string, ctaText?: string, ctaUrl?: string): string {
  const cta = ctaText && ctaUrl
    ? `<a href="${ctaUrl}" style="display:inline-block;padding:12px 32px;background:#f59e0b;color:#000;font-weight:700;text-decoration:none;border-radius:8px;font-size:14px;margin-top:16px;">${ctaText}</a>`
    : "";

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;padding:32px;background:#171717;border-radius:16px;">
    <h1 style="color:#fff;font-size:20px;margin:0 0 8px;">Cambridge <span style="color:#34d399;">TCG</span></h1>
    <h2 style="color:#fff;font-size:16px;margin:0 0 16px;">${title}</h2>
    <div style="color:#a3a3a3;font-size:14px;line-height:1.6;">${body}</div>
    ${cta}
    <p style="color:#525252;font-size:12px;margin:24px 0 0;">Cambridge TCG — Japanese Trading Cards</p>
  </div>
</body></html>`;
}

async function send(to: string, subject: string, html: string, text: string) {
  const result = await sendMail(
    { from: FROM, to, subject, text, html },
    { stream: "noreply" }
  );
  if (!result.ok) {
    throw new Error(`Auction email to ${to} failed: ${result.error}`);
  }
}

export async function sendOutbidEmail(data: {
  email: string;
  auctionTitle: string;
  auctionId: string;
  currentPrice: string;
}) {
  const url = `${SITE}/auctions/${data.auctionId}`;
  const subject = `You've been outbid on ${data.auctionTitle}`;
  const text = `You've been outbid on "${data.auctionTitle}". The current price is ${data.currentPrice}. Bid again: ${url}`;
  const html = emailTemplate(
    "You've been outbid!",
    `<p>Someone placed a higher bid on <strong>${data.auctionTitle}</strong>.</p>
     <p>Current price: <strong style="color:#f59e0b;">${data.currentPrice}</strong></p>`,
    "Bid Again",
    url
  );
  await send(data.email, subject, html, text);
}

export async function sendWinnerEmail(data: {
  email: string;
  auctionTitle: string;
  auctionId: string;
  winningPrice: string;
}) {
  const url = `${SITE}/auctions/${data.auctionId}`;
  const subject = `You won: ${data.auctionTitle}`;
  const text = `Congratulations! You won "${data.auctionTitle}" for ${data.winningPrice}. Pay now: ${url}`;
  const html = emailTemplate(
    "You won the auction!",
    `<p>Congratulations! You won <strong>${data.auctionTitle}</strong>.</p>
     <p>Winning price: <strong style="color:#f59e0b;">${data.winningPrice}</strong></p>
     <p>Please complete your payment within 48 hours.</p>`,
    "Pay Now",
    url
  );
  await send(data.email, subject, html, text);
}

// Seller-facing "you sold — buyer paid, ship it" email, fired from the
// auction 'paid' webhook branch. Mirrors the market's sendSellerPaidEmail:
// renders the payout and — for direct (non-consigned) sales — the winner's
// shipping address that Stripe collected at pay time. Before this, the only
// end-of-auction email went to the store address; the seller was a ghost in
// their own sale.
export async function sendAuctionSellerPaidEmail(data: {
  email: string;
  auctionTitle: string;
  auctionId: string;
  winningPrice: string;
  payout: string;
  shipsTo: "buyer" | "ctcg";
  shippingAddress?: AuctionShippingAddress | null;
  buyerUsername?: string | null;
}) {
  const url = `${SITE}/auctions/${data.auctionId}`;
  const dest = data.shipsTo === "ctcg"
    ? "Cambridge TCG (we'll forward to the buyer)"
    : "the winner directly";
  // Buyer-typed free text passed through Stripe — escape before HTML.
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Render the winner's address only on the direct-ship route — on a
  // consigned sale the ship-to is Cambridge TCG, not the winner's door.
  const addressLines = data.shipsTo === "buyer" && data.shippingAddress
    ? [
        data.shippingAddress.name,
        data.shippingAddress.line1,
        data.shippingAddress.line2,
        [data.shippingAddress.city, data.shippingAddress.state, data.shippingAddress.postal_code].filter(Boolean).join(", "),
        data.shippingAddress.country,
      ].filter((line): line is string => !!line)
    : [];
  const addressHtml = addressLines.length > 0
    ? `<p>Ship to:<br/><strong style="color:#fff;">${addressLines.map(esc).join("<br/>")}</strong></p>`
    : "";
  const messageHtml = data.buyerUsername
    ? `<p>Need to arrange logistics? <a href="${SITE}/account/messages" style="color:#f59e0b;">Message @${esc(data.buyerUsername)}</a> on the platform.</p>`
    : "";
  const subject = `Payment confirmed — please ship ${data.auctionTitle}`;
  const text = `The winner paid ${data.winningPrice} for "${data.auctionTitle}". Ship to ${dest}.`
    + (addressLines.length > 0 ? ` Ship to: ${addressLines.join(", ")}.` : "")
    + (data.buyerUsername ? ` Message @${data.buyerUsername} on the platform: ${SITE}/account/messages.` : "")
    + ` Your payout after commission will be ${data.payout}. Details: ${url}`;
  const html = emailTemplate(
    "Buyer has paid — ship now",
    `<p>The winner has paid <strong style="color:#f59e0b;">${data.winningPrice}</strong> for <strong>${data.auctionTitle}</strong>.</p>
     <p>Ship to: <strong>${dest}</strong>.</p>
     ${addressHtml}${messageHtml}
     <p>Your payout after commission: <strong style="color:#34d399;">${data.payout}</strong>, released after delivery.</p>`,
    "Add Tracking",
    url
  );
  await send(data.email, subject, html, text);
}

export async function sendAuctionEndedAdminEmail(data: {
  auctionTitle: string;
  auctionId: string;
  winnerEmail: string | null;
  winningPrice: string;
  bidCount: number;
}) {
  const storeEmail = (process.env.STORE_NOTIFICATION_EMAIL || "contact@cambridgetcg.com").trim();
  const subject = `Auction ended: ${data.auctionTitle}`;
  const winner = data.winnerEmail ? `Winner: ${data.winnerEmail} at ${data.winningPrice}` : "No bids received.";
  const text = `Auction "${data.auctionTitle}" has ended. ${winner} (${data.bidCount} bids)`;
  const html = emailTemplate(
    "Auction Ended",
    `<p><strong>${data.auctionTitle}</strong> has ended.</p>
     <p>${winner}</p>
     <p>Total bids: ${data.bidCount}</p>`,
    "View in Admin",
    `${SITE}/admin/auctions`
  );
  await send(storeEmail, subject, html, text);
}
