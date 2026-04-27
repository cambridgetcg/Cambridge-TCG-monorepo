import { SendEmailCommand } from "@aws-sdk/client-ses";
import { sesClient as ses } from "@/lib/email/client";
import { formatPrice } from "@/lib/format";

const FROM = (process.env.AUTH_FROM_EMAIL || "noreply@cambridgetcg.com").trim();
const STORE_EMAIL = (process.env.STORE_NOTIFICATION_EMAIL || "contact@cambridgetcg.com").trim();
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://cambridgetcg.com").trim().replace(/\/+$/, "");

function template(title: string, body: string, ctaText?: string, ctaUrl?: string): string {
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
    Message: { Subject: { Data: subject }, Body: { Text: { Data: text }, Html: { Data: html } } },
  }));
}

export async function sendQuoteReceivedEmail(data: {
  reference: string;
  customerName: string;
  customerEmail: string;
  itemCount: number;
}) {
  const subject = `Quote request received — ${data.reference}`;
  const text = `Hi ${data.customerName}, we received your quote request (${data.reference}) for ${data.itemCount} card(s). We'll review and get back to you within 1-2 business days.`;
  const html = template(
    "Quote Request Received",
    `<p>Hi ${data.customerName},</p>
     <p>We received your quote request <strong>${data.reference}</strong> for <strong>${data.itemCount} card(s)</strong>.</p>
     <p>We'll review your cards and send you an offer within <strong>1-2 business days</strong>.</p>`,
    "View Status",
    `${SITE}/trade-in/quote/${data.reference}`
  );
  await send(data.customerEmail, subject, html, text);
}

export async function sendQuoteOfferEmail(data: {
  reference: string;
  customerName: string;
  customerEmail: string;
  total: number;
  paymentMethod: string;
  expiresAt: string;
}) {
  const subject = `Your quote is ready — ${formatPrice(data.total)} (${data.reference})`;
  const expires = new Date(data.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const text = `Hi ${data.customerName}, we've reviewed your cards and can offer ${formatPrice(data.total)} (${data.paymentMethod}). This offer is valid until ${expires}. View and accept: ${SITE}/trade-in/quote/${data.reference}`;
  const html = template(
    "Your Quote is Ready",
    `<p>Hi ${data.customerName},</p>
     <p>We've reviewed your cards and can offer:</p>
     <p style="font-size:24px;font-weight:700;color:#f59e0b;margin:16px 0;">${formatPrice(data.total)}</p>
     <p>Payment method: <strong>${data.paymentMethod === "cash" ? "Cash (bank transfer)" : "Store Credit"}</strong></p>
     <p>This offer is valid until <strong>${expires}</strong>.</p>`,
    "View & Accept",
    `${SITE}/trade-in/quote/${data.reference}`
  );
  await send(data.customerEmail, subject, html, text);
}

export async function sendQuoteAdminNotification(data: {
  reference: string;
  customerName: string;
  customerEmail: string;
  itemCount: number;
}) {
  const subject = `New quote request: ${data.reference} (${data.itemCount} cards)`;
  const text = `New custom quote from ${data.customerName} (${data.customerEmail}) — ${data.itemCount} cards. Reference: ${data.reference}`;
  const html = template(
    "New Quote Request",
    `<p><strong>${data.customerName}</strong> (${data.customerEmail}) submitted a custom quote request.</p>
     <p>Reference: <strong>${data.reference}</strong><br>Cards: <strong>${data.itemCount}</strong></p>`,
    "Review in Admin",
    `${SITE}/admin/quotes`
  );
  await send(STORE_EMAIL, subject, html, text);
}

export async function sendQuoteAcceptedAdminNotification(data: {
  reference: string;
  customerName: string;
  total: number;
}) {
  const subject = `Quote accepted: ${data.reference} — ${formatPrice(data.total)}`;
  const text = `${data.customerName} accepted quote ${data.reference} for ${formatPrice(data.total)}.`;
  const html = template(
    "Quote Accepted",
    `<p><strong>${data.customerName}</strong> accepted the offer for <strong>${data.reference}</strong>.</p>
     <p>Amount: <strong style="color:#f59e0b;">${formatPrice(data.total)}</strong></p>`,
    "View in Admin",
    `${SITE}/admin/quotes`
  );
  await send(STORE_EMAIL, subject, html, text);
}

// ── Lifecycle emails for the fulfilment chain ──
//
// Customer-visible milestones after they accept. Internal-only status
// flips (cancellations, admin notes) don't get emails; those would add
// noise. Kept in the same SES direct-send style as the other quote
// templates so we don't have to migrate them to the queue right now.

const STATUS_COPY: Record<string, { subject: (ref: string) => string; heading: string; body: (ref: string) => string }> = {
  received: {
    subject: (ref) => `Received: quote ${ref}`,
    heading: "We've received your cards",
    body: (ref) => `Your quote <strong>${ref}</strong> arrived at Cambridge TCG. Our team will process payment shortly.`,
  },
  paid: {
    subject: (ref) => `Paid: quote ${ref}`,
    heading: "Payment sent",
    body: (ref) => `Your quote <strong>${ref}</strong> has been paid out. Store credit lands instantly; cash payouts arrive in your bank within 1&ndash;3 business days.`,
  },
  expired: {
    subject: (ref) => `Quote expired: ${ref}`,
    heading: "Your offer expired",
    body: (ref) => `The offer on quote <strong>${ref}</strong> wasn't accepted within the 24-hour window and has expired. Submit a new request if you'd still like to sell those cards.`,
  },
  cancelled: {
    subject: (ref) => `Quote cancelled: ${ref}`,
    heading: "Quote cancelled",
    body: (ref) => `Quote <strong>${ref}</strong> has been cancelled.`,
  },
};

export async function sendQuoteStatusEmail(d: {
  email: string;
  reference: string;
  status: string;
}): Promise<void> {
  const copy = STATUS_COPY[d.status];
  if (!copy) return;
  const url = `${SITE}/trade-in/quote/${d.reference}`;
  const subject = copy.subject(d.reference);
  const text = `${copy.heading} — quote ${d.reference}. View: ${url}`;
  const html = template(copy.heading, copy.body(d.reference), "View quote", url);
  try {
    await send(d.email, subject, html, text);
  } catch (err) {
    console.error(`[quote] status email (${d.status}) to ${d.email} failed:`, err);
  }
}
