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
  await ses.send(new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject },
      Body: { Text: { Data: text }, Html: { Data: html } },
    },
  }));
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
