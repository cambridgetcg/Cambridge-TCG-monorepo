import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({
  region: (process.env.AWS_REGION || "us-east-1").trim(),
  credentials: {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
  },
});

const FROM = (process.env.AUTH_FROM_EMAIL || "noreply@cambridgetcg.com").trim();
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://cambridgetcg.com").trim().replace(/\/+$/, "");

function tpl(title: string, body: string, ctaText?: string, ctaUrl?: string): string {
  const cta = ctaText && ctaUrl
    ? `<a href="${ctaUrl}" style="display:inline-block;padding:12px 32px;background:#f59e0b;color:#000;font-weight:700;text-decoration:none;border-radius:8px;font-size:14px;margin-top:16px;">${ctaText}</a>`
    : "";
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;padding:32px;background:#171717;border-radius:16px;">
    <h1 style="color:#fff;font-size:20px;margin:0 0 8px;">Cambridge <span style="color:#34d399;">TCG</span></h1>
    <h2 style="color:#fff;font-size:16px;margin:0 0 16px;">${title}</h2>
    <div style="color:#a3a3a3;font-size:14px;line-height:1.6;">${body}</div>
    ${cta}
    <p style="color:#525252;font-size:12px;margin:24px 0 0;">Cambridge TCG &mdash; Japanese Trading Cards</p>
  </div>
</body></html>`;
}

async function send(to: string, subject: string, html: string, text: string) {
  await ses.send(new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [to] },
    Message: { Subject: { Data: subject }, Body: { Text: { Data: text }, Html: { Data: html } } },
  }));
}

const tradesUrl = `${SITE}/account/trades`;

// ── Match notifications ──

export async function sendBuyerMatchEmail(d: {
  email: string; cardName: string; price: string; expiresAt: string;
}) {
  const subject = `Action required: pay for ${d.cardName}`;
  const text = `Your bid matched on "${d.cardName}" at ${d.price}. Pay within 24 hours or the trade will be cancelled. ${tradesUrl}`;
  const html = tpl(
    "Your bid matched &mdash; please pay",
    `<p>Your bid for <strong>${d.cardName}</strong> matched a seller at <strong style="color:#f59e0b;">${d.price}</strong>.</p>
     <p>Please complete payment within <strong>24 hours</strong> (by ${new Date(d.expiresAt).toUTCString()}). If you do not pay, the trade will be cancelled and the seller's listing returned to the market.</p>`,
    "Pay Now", tradesUrl
  );
  await send(d.email, subject, html, text);
}

export async function sendSellerMatchEmail(d: {
  email: string; cardName: string; price: string;
}) {
  const subject = `You sold ${d.cardName} &mdash; awaiting buyer payment`;
  const text = `Your ask for "${d.cardName}" filled at ${d.price}. We're waiting for the buyer to pay; we'll email shipping instructions next. ${tradesUrl}`;
  const html = tpl(
    "Your listing filled",
    `<p>Your ask for <strong>${d.cardName}</strong> matched at <strong style="color:#f59e0b;">${d.price}</strong>.</p>
     <p>The buyer has 24 hours to pay. As soon as we receive payment we'll send you shipping instructions, including which address to ship to and what packaging is required for this trade's escrow tier.</p>`,
    "View Trade", tradesUrl
  );
  await send(d.email, subject, html, text);
}

// ── Payment received ──

export async function sendBuyerPaidEmail(d: {
  email: string; cardName: string; price: string; tier: string;
}) {
  const subject = `Payment received: ${d.cardName}`;
  const text = `We received your payment of ${d.price} for "${d.cardName}". Tier: ${d.tier}. Track progress at ${tradesUrl}`;
  const html = tpl(
    "Payment received",
    `<p>We've received your payment for <strong>${d.cardName}</strong>.</p>
     <p>Amount: <strong>${d.price}</strong><br/>Escrow tier: <strong>${d.tier}</strong></p>
     <p>The seller will ship next. You'll get a tracking email when the card is on its way to you.</p>`,
    "View Trade", tradesUrl
  );
  await send(d.email, subject, html, text);
}

export async function sendSellerPaidEmail(d: {
  email: string; cardName: string; price: string; tier: string; shipsTo: "buyer" | "ctcg"; payout: string;
}) {
  const dest = d.shipsTo === "ctcg" ? "Cambridge TCG (we'll forward to the buyer)" : "the buyer directly";
  const subject = `Payment confirmed &mdash; please ship ${d.cardName}`;
  const text = `Buyer paid ${d.price} for "${d.cardName}". Ship to ${dest}. Your payout will be ${d.payout}. Details: ${tradesUrl}`;
  const html = tpl(
    "Buyer has paid &mdash; ship now",
    `<p>The buyer has paid <strong>${d.price}</strong> for <strong>${d.cardName}</strong>.</p>
     <p>Escrow tier: <strong>${d.tier}</strong>. Ship to: <strong>${dest}</strong>.</p>
     <p>Your payout after commission: <strong style="color:#34d399;">${d.payout}</strong>, released after delivery and any tier-specific verification.</p>`,
    "Get Shipping Details", tradesUrl
  );
  await send(d.email, subject, html, text);
}

// ── Status transitions (admin-driven) ──

export async function sendStatusEmail(d: {
  email: string; cardName: string; subject: string; heading: string; body: string;
}) {
  const text = `${d.heading} &mdash; ${d.cardName}. ${tradesUrl}`;
  const html = tpl(d.heading, `<p>${d.body}</p>`, "View Trade", tradesUrl);
  await send(d.email, d.subject, html, text);
}

// ── Connect onboarding complete ──

export async function sendPayoutReadyEmail(d: { email: string; name?: string | null }) {
  const payoutsUrl = `${SITE}/account/payouts`;
  const subject = "You're ready to receive payouts";
  const text = `Your Stripe account is verified. Future payouts will go straight to your bank. Manage at ${payoutsUrl}`;
  const html = tpl(
    "You're set up for payouts",
    `<p>${d.name ? `Hi ${d.name}, ` : ""}your Stripe account is verified and ready.</p>
     <p>Any payouts we process for you — from completed trades or won auctions — will arrive
        directly in the bank account you connected. Payout timing depends on Stripe's schedule
        (usually 1&ndash;2 business days after we send the transfer).</p>`,
    "Manage Payouts", payoutsUrl
  );
  await send(d.email, subject, html, text);
}

// ── Payout sent ──

export async function sendPayoutEmail(d: {
  email: string; cardName: string; amount: string; method: string; reference?: string | null;
}) {
  const subject = `Payout sent: ${d.cardName} (${d.amount})`;
  const refLine = d.reference ? `Reference: ${d.reference}\n` : "";
  const text = `Your payout of ${d.amount} for "${d.cardName}" has been sent via ${d.method}.\n${refLine}${tradesUrl}`;
  const html = tpl(
    "Payout sent",
    `<p>Your payout for <strong>${d.cardName}</strong> has been sent.</p>
     <p>Amount: <strong style="color:#34d399;">${d.amount}</strong><br/>
        Method: ${d.method}${d.reference ? `<br/>Reference: <code>${d.reference}</code>` : ""}</p>
     <p>Allow a few business days for the payment to land in your account.</p>`,
    "View Trade", tradesUrl
  );
  await send(d.email, subject, html, text);
}

// ── Follower notification — someone you follow listed an auction ──

export async function sendFollowerAuctionListedEmail(d: {
  email: string;
  followerName: string | null;
  sellerName: string;
  sellerUsername: string;
  auctionTitle: string;
  auctionId: string;
  imageUrl: string | null;
  startingPrice: number;
  buyNowPrice: number | null;
  endsAt: string;
}) {
  const fmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
  const url = `${SITE}/auctions/${d.auctionId}`;
  const subject = `${d.sellerName} just listed: ${d.auctionTitle}`;
  const text = `${d.sellerName} (@${d.sellerUsername}) listed "${d.auctionTitle}" at ${fmt.format(d.startingPrice)}${d.buyNowPrice ? ` (BIN ${fmt.format(d.buyNowPrice)})` : ""}. ${url}`;
  const html = tpl(
    `${d.sellerName} listed a new auction`,
    `<p>${d.followerName ? `Hi ${d.followerName}, ` : ""}a seller you follow just posted:</p>
     <p><strong style="color:#fff;font-size:16px;">${d.auctionTitle}</strong></p>
     <p>Starting: <strong style="color:#f59e0b;">${fmt.format(d.startingPrice)}</strong>${d.buyNowPrice ? ` &middot; Buy Now: <strong>${fmt.format(d.buyNowPrice)}</strong>` : ""}</p>
     <p style="color:#737373;font-size:12px;">Ends ${new Date(d.endsAt).toUTCString()}</p>
     <p style="color:#737373;font-size:12px;">By <a href="${SITE}/u/${d.sellerUsername}" style="color:#f59e0b;">@${d.sellerUsername}</a> &middot; <a href="${SITE}/account/profile" style="color:#737373;">Manage follows</a></p>`,
    "View auction", url
  );
  await send(d.email, subject, html, text);
}

// ── Weekly digests ──

export async function sendSellerRestockDigest(d: {
  email: string;
  name: string | null;
  opportunities: Array<{
    cardName: string; sku: string; bestAsk: number | null;
    watchCount: number; alertCount: number; opportunityScore: number;
  }>;
}) {
  if (d.opportunities.length === 0) return;
  const rows = d.opportunities.map((o) => {
    const priceHint = o.bestAsk !== null ? `market ${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(o.bestAsk)}` : "no current ask";
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #262626;"><strong style="color:#fff;">${o.cardName}</strong><br/><span style="color:#737373;font-size:11px;font-family:monospace;">${o.sku}</span></td>
      <td style="padding:8px 12px;border-bottom:1px solid #262626;text-align:right;"><span style="color:#f59e0b;">${o.watchCount} watchers</span><br/><span style="color:#737373;font-size:11px;">${priceHint}</span></td>
    </tr>`;
  }).join("");
  const subject = `${d.opportunities.length} restock opportunit${d.opportunities.length === 1 ? "y" : "ies"} — Cambridge TCG`;
  const text = `We spotted ${d.opportunities.length} cards with strong buyer demand and thin supply. Top card: ${d.opportunities[0].cardName} (${d.opportunities[0].watchCount} watchers). Details: ${SITE}/account/demand`;
  const html = tpl(
    "Restock opportunities this week",
    `<p>${d.name ? `Hi ${d.name}, ` : ""}here are the cards buyers are watching most that currently have thin supply.</p>
     <table style="width:100%;border-collapse:collapse;margin:16px 0;">${rows}</table>
     <p style="color:#737373;font-size:12px;">Ranked by buyer demand (watchers + active price alerts) against current ask depth.</p>`,
    "See full demand list", `${SITE}/account/demand`
  );
  await send(d.email, subject, html, text);
}

export async function sendBuyerWatchlistDigest(d: {
  email: string;
  name: string | null;
  moves: Array<{
    cardName: string; sku: string;
    before: number | null; after: number | null;
    note: string; // "new ask", "price drop", "trade hit low", etc.
  }>;
}) {
  if (d.moves.length === 0) return;
  const fmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
  const rows = d.moves.map((m) => {
    const priceLine =
      m.before !== null && m.after !== null
        ? `${fmt.format(m.before)} &rarr; <strong>${fmt.format(m.after)}</strong>`
        : m.after !== null ? `<strong>${fmt.format(m.after)}</strong>` : "—";
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #262626;"><strong style="color:#fff;">${m.cardName}</strong><br/><span style="color:#737373;font-size:11px;font-family:monospace;">${m.sku}</span></td>
      <td style="padding:8px 12px;border-bottom:1px solid #262626;text-align:right;"><span style="color:#34d399;">${m.note}</span><br/><span style="color:#d4d4d4;font-size:12px;">${priceLine}</span></td>
    </tr>`;
  }).join("");
  const subject = `Your watchlist moved: ${d.moves.length} update${d.moves.length === 1 ? "" : "s"}`;
  const text = `${d.moves.length} of your watched cards moved this week. View: ${SITE}/account/watchlist`;
  const html = tpl(
    "Your watchlist this week",
    `<p>${d.name ? `Hi ${d.name}, ` : ""}here&rsquo;s what happened on the cards you&rsquo;re watching.</p>
     <table style="width:100%;border-collapse:collapse;margin:16px 0;">${rows}</table>`,
    "Open watchlist", `${SITE}/account/watchlist`
  );
  await send(d.email, subject, html, text);
}

// ── Price alert ──

export async function sendPriceAlertEmail(d: {
  email: string; cardName: string; sku: string;
  currentPrice: string; threshold: string; direction: "below" | "above";
}) {
  const cardUrl = `${SITE}/market/${d.sku}`;
  const verb = d.direction === "below" ? "dropped to" : "reached";
  const subject = `Price alert: ${d.cardName} ${verb} ${d.currentPrice}`;
  const text = `${d.cardName} is now ${d.currentPrice} (your alert was ${d.direction} ${d.threshold}). View: ${cardUrl}`;
  const html = tpl(
    "Price alert",
    `<p><strong>${d.cardName}</strong> just ${verb} <strong style="color:#f59e0b;">${d.currentPrice}</strong>.</p>
     <p>Your alert was set for <strong>${d.direction}</strong> <strong>${d.threshold}</strong>.</p>
     <p style="color:#737373;font-size:12px;">Alerts have a 24-hour cooldown to prevent spam.</p>`,
    "View Card", cardUrl
  );
  await send(d.email, subject, html, text);
}

// ── Cancel (timeout) ──

export async function sendCancelEmail(d: {
  email: string; cardName: string; reason: string;
}) {
  const subject = `Trade cancelled: ${d.cardName}`;
  const text = `Trade for "${d.cardName}" was cancelled. Reason: ${d.reason}. ${tradesUrl}`;
  const html = tpl(
    "Trade cancelled",
    `<p>The trade for <strong>${d.cardName}</strong> was cancelled.</p>
     <p>Reason: ${d.reason}</p>`,
    "View Trades", tradesUrl
  );
  await send(d.email, subject, html, text);
}
