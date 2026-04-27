// ---------------------------------------------------------------------------
// HTML escaping for user-supplied strings
// ---------------------------------------------------------------------------

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Data interfaces
// ---------------------------------------------------------------------------

export interface OrderData {
  id: number;
  total: number;
  volumeDiscount: number;
  quotedExpiresAt: Date | string | null;
  notes: string | null;
}

export interface OrderItemData {
  cardNumber: string;
  cardName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ClientData {
  name: string;
  email: string;
  company: string | null;
}

interface EmailResult {
  subject: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const BG = "#0a0a0f";
const CARD_BG = "#12121a";
const BORDER = "#1e1e2e";
const ACCENT = "#7c3aed";
const TEXT = "#e2e2e8";
const MUTED = "#a0a0b0";
const GREEN = "#4ade80";

const APP_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return n.toFixed(2);
}

function wrap(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:${BG};color:${TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;">
        <!-- Header -->
        <tr><td style="padding:24px 32px;border-bottom:1px solid ${BORDER};">
          <h1 style="margin:0;font-size:20px;color:${TEXT};">${title}</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:24px 32px;">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid ${BORDER};text-align:center;">
          <p style="margin:0;font-size:12px;color:${MUTED};">Cambridge TCG Wholesale</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function itemsTable(items: OrderItemData[]): string {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid ${BORDER};font-family:monospace;color:${ACCENT};">${escHtml(item.cardNumber)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid ${BORDER};color:${MUTED};">${escHtml(item.cardName ?? "")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid ${BORDER};text-align:right;">${item.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid ${BORDER};text-align:right;color:${MUTED};">&pound;${fmt(item.unitPrice)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid ${BORDER};text-align:right;font-weight:600;">&pound;${fmt(item.lineTotal)}</td>
      </tr>`,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:6px;margin-bottom:16px;">
      <tr style="background:${BG};">
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:${MUTED};font-weight:500;">Card #</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:${MUTED};font-weight:500;">Name</th>
        <th style="padding:8px 12px;text-align:right;font-size:12px;color:${MUTED};font-weight:500;">Qty</th>
        <th style="padding:8px 12px;text-align:right;font-size:12px;color:${MUTED};font-weight:500;">Unit Price</th>
        <th style="padding:8px 12px;text-align:right;font-size:12px;color:${MUTED};font-weight:500;">Line Total</th>
      </tr>
      ${rows}
    </table>`;
}

function totalsBlock(order: OrderData): string {
  const discountPct = order.volumeDiscount;
  const preDiscountSubtotal =
    discountPct > 0
      ? Math.round((order.total / (1 - discountPct)) * 100) / 100
      : order.total;
  const discountAmount =
    Math.round((preDiscountSubtotal - order.total) * 100) / 100;

  const discountRow =
    discountPct > 0
      ? `<tr>
           <td style="padding:4px 0;color:${GREEN};">Volume Discount (${(discountPct * 100).toFixed(0)}%)</td>
           <td style="padding:4px 0;text-align:right;color:${GREEN};">-&pound;${fmt(discountAmount)}</td>
         </tr>`
      : "";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
      <tr>
        <td style="padding:4px 0;color:${MUTED};">Subtotal</td>
        <td style="padding:4px 0;text-align:right;">&pound;${fmt(preDiscountSubtotal)}</td>
      </tr>
      ${discountRow}
      <tr>
        <td style="padding:8px 0 0;border-top:1px solid ${BORDER};font-size:18px;font-weight:700;">Total</td>
        <td style="padding:8px 0 0;border-top:1px solid ${BORDER};text-align:right;font-size:18px;font-weight:700;color:${GREEN};">&pound;${fmt(order.total)}</td>
      </tr>
    </table>`;
}

function orderLink(orderId: number): string {
  const url = `${APP_URL}/orders/${orderId}`;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td style="background:${ACCENT};border-radius:6px;">
        <a href="${url}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">
          View Order #${orderId}
        </a>
      </td></tr>
    </table>`;
}

// ---------------------------------------------------------------------------
// Template functions
// ---------------------------------------------------------------------------

export function quoteReady(
  order: OrderData,
  items: OrderItemData[],
  client: ClientData,
): EmailResult {
  const expiryNote = order.quotedExpiresAt
    ? `<p style="margin:16px 0 0;font-size:13px;color:${MUTED};">This quote is valid until <strong style="color:${TEXT};">${new Date(order.quotedExpiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</strong>. Please confirm before it expires.</p>`
    : "";

  const body = `
    <p style="margin:0 0 16px;">Hi ${escHtml(client.name)},</p>
    <p style="margin:0 0 16px;">Your quote for Order <strong>#${order.id}</strong> is ready. Here's what we've priced up for you:</p>
    ${itemsTable(items)}
    ${totalsBlock(order)}
    ${expiryNote}
    ${orderLink(order.id)}
    <p style="margin:0;font-size:13px;color:${MUTED};">If you have any questions, reply to this email.</p>`;

  return {
    subject: `Your TCG Wholesale Quote #${order.id} is Ready`,
    html: wrap(`Quote #${order.id} is Ready`, body),
  };
}

export function orderConfirmed(
  order: OrderData,
  client: ClientData,
): EmailResult {
  const body = `
    <p style="margin:0 0 16px;">Hi ${escHtml(client.name)},</p>
    <p style="margin:0 0 16px;">Great news — Order <strong>#${order.id}</strong> has been confirmed and is now awaiting payment.</p>
    ${totalsBlock(order)}
    ${orderLink(order.id)}
    <p style="margin:0;font-size:13px;color:${MUTED};">Once payment is received we'll get your order processed right away.</p>`;

  return {
    subject: `Order #${order.id} Confirmed — Awaiting Payment`,
    html: wrap(`Order #${order.id} Confirmed`, body),
  };
}

export function orderShipped(
  order: OrderData,
  client: ClientData,
): EmailResult {
  const body = `
    <p style="margin:0 0 16px;">Hi ${escHtml(client.name)},</p>
    <p style="margin:0 0 16px;">Your Order <strong>#${order.id}</strong> has shipped! Estimated arrival is <strong>3-5 business days</strong>.</p>
    ${totalsBlock(order)}
    ${orderLink(order.id)}
    <p style="margin:0;font-size:13px;color:${MUTED};">We'll let you know once it's been delivered.</p>`;

  return {
    subject: `Order #${order.id} Has Shipped!`,
    html: wrap(`Order #${order.id} Has Shipped`, body),
  };
}

export function orderDelivered(
  order: OrderData,
  client: ClientData,
): EmailResult {
  const body = `
    <p style="margin:0 0 16px;">Hi ${escHtml(client.name)},</p>
    <p style="margin:0 0 16px;">Order <strong>#${order.id}</strong> has been delivered. Thank you for your business!</p>
    ${totalsBlock(order)}
    ${orderLink(order.id)}
    <p style="margin:0;font-size:13px;color:${MUTED};">If anything doesn't look right, please get in touch and we'll sort it out.</p>`;

  return {
    subject: `Order #${order.id} Delivered — Thank You!`,
    html: wrap(`Order #${order.id} Delivered`, body),
  };
}

export function newOrderAdmin(
  order: OrderData,
  client: ClientData,
  itemCount: number,
): EmailResult {
  const adminUrl = `${APP_URL}/admin/orders`;

  const body = `
    <p style="margin:0 0 16px;">A new order has been submitted.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:16px;">
      <tr>
        <td style="padding:4px 0;color:${MUTED};">Order</td>
        <td style="padding:4px 0;text-align:right;font-weight:600;">#${order.id}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${MUTED};">Client</td>
        <td style="padding:4px 0;text-align:right;">${escHtml(client.name)}${client.company ? ` (${escHtml(client.company)})` : ""}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${MUTED};">Email</td>
        <td style="padding:4px 0;text-align:right;">${escHtml(client.email)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:${MUTED};">Items</td>
        <td style="padding:4px 0;text-align:right;">${itemCount}</td>
      </tr>
      <tr>
        <td style="padding:8px 0 0;border-top:1px solid ${BORDER};font-weight:700;font-size:16px;">Total</td>
        <td style="padding:8px 0 0;border-top:1px solid ${BORDER};text-align:right;font-weight:700;font-size:16px;color:${GREEN};">&pound;${fmt(order.total)}</td>
      </tr>
    </table>
    ${order.notes ? `<p style="margin:0 0 16px;padding:12px;background:${BG};border:1px solid ${BORDER};border-radius:6px;font-size:13px;color:${MUTED};"><strong style="color:${TEXT};">Client notes:</strong> ${escHtml(order.notes)}</p>` : ""}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td style="background:${ACCENT};border-radius:6px;">
        <a href="${adminUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">
          View in Admin
        </a>
      </td></tr>
    </table>`;

  return {
    subject: `New Order #${order.id} from ${escHtml(client.name)} — \u00a3${fmt(order.total)}`,
    html: wrap(`New Order #${order.id}`, body),
  };
}
