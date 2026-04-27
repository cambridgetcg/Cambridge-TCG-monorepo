# Status Change Notifications — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Email clients on key order status transitions (quoted, confirmed, shipped, delivered) and email admin when clients submit orders. Log all notifications to a `notifications` table with UI in admin order detail.

**Architecture:** Resend SDK for email delivery, inline await in API handlers with try/catch (failures logged, never break status changes). Console fallback when no API key. Dark-themed HTML email templates matching the app.

**Tech Stack:** Resend (email), Drizzle ORM (notifications table), Next.js API routes (triggers)

---

### Task 1: Install Resend and add env vars

**Files:**
- Modify: `package.json`
- Modify: `.env.local`
- Modify: `.env.example`

**Step 1: Install resend**

Run: `pnpm add resend`

**Step 2: Add env vars to `.env.local`**

Append to `.env.local`:
```
RESEND_API_KEY=
NOTIFICATION_FROM=orders@cambridgetcg.com
```

**Step 3: Add env vars to `.env.example`**

Append to `.env.example`:
```
RESEND_API_KEY=
NOTIFICATION_FROM=orders@cambridgetcg.com
```

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example
git commit -m "chore: add resend dependency and email env vars"
```

---

### Task 2: Add `notifications` table to schema

**Files:**
- Modify: `src/lib/db/schema.ts` (append after `priceHistory` table, before type exports)

**Step 1: Add the notifications table definition**

Add after the `priceHistory` table definition (line ~99), before the type exports:

```ts
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id),
  type: text("type", {
    enum: ["quote_ready", "confirmed", "shipped", "delivered", "new_order"],
  }).notNull(),
  recipient: text("recipient").notNull(),
  status: text("status", { enum: ["sent", "failed"] }).notNull(),
  error: text("error"),
  sentAt: text("sent_at").default(sql`(datetime('now'))`),
});

export type Notification = typeof notifications.$inferSelect;
```

**Step 2: Push schema to DB**

Run: `pnpm db:push`
Expected: Table `notifications` created successfully.

**Step 3: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat: add notifications table to schema"
```

---

### Task 3: Create Resend client singleton

**Files:**
- Create: `src/lib/email/resend.ts`

**Step 1: Create the Resend client module**

```ts
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

export const resend = apiKey ? new Resend(apiKey) : null;

export const notificationFrom =
  process.env.NOTIFICATION_FROM || "orders@cambridgetcg.com";
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `src/lib/email/resend.ts`.

**Step 3: Commit**

```bash
git add src/lib/email/resend.ts
git commit -m "feat: resend client singleton with env fallback"
```

---

### Task 4: Create email templates

**Files:**
- Create: `src/lib/email/templates.ts`

**Step 1: Write the template functions**

Each function takes order data and returns `{ subject: string; html: string }`. All emails use a shared dark-themed wrapper.

```ts
import { VAT_RATE } from "@/lib/pricing";

interface OrderData {
  id: number;
  totalExVat: number;
  volumeDiscount: number;
  quotedExpiresAt: string | null;
  notes: string | null;
}

interface OrderItemData {
  cardNumber: string;
  cardName: string | null;
  quantity: number;
  unitPriceExVat: number;
  lineTotal: number;
}

interface ClientData {
  name: string;
  email: string;
  company: string | null;
}

const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

function wrap(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#0a0a0f;color:#e2e2e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    ${content}
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #1e1e2e;text-align:center;color:#666;font-size:12px;">
      Cambridge TCG Wholesale
    </div>
  </div>
</body>
</html>`;
}

function itemsTable(items: OrderItemData[]): string {
  const rows = items
    .map(
      (i) => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1e1e2e;font-family:monospace;color:#8b5cf6;">${i.cardNumber}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e1e2e;color:#a0a0b0;">${i.cardName ?? ""}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e1e2e;text-align:right;">${i.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e1e2e;text-align:right;">&pound;${i.unitPriceExVat.toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e1e2e;text-align:right;font-weight:600;">&pound;${i.lineTotal.toFixed(2)}</td>
      </tr>`
    )
    .join("");

  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    <thead>
      <tr style="color:#888;">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #1e1e2e;">Card #</th>
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #1e1e2e;">Name</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #1e1e2e;">Qty</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #1e1e2e;">Unit</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #1e1e2e;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function totalsBlock(order: OrderData): string {
  const discountPct = order.volumeDiscount;
  const preDiscountSubtotal =
    discountPct > 0
      ? Math.round((order.totalExVat / (1 - discountPct)) * 100) / 100
      : order.totalExVat;
  const discountAmount = Math.round((preDiscountSubtotal - order.totalExVat) * 100) / 100;
  const vat = Math.round(order.totalExVat * VAT_RATE * 100) / 100;
  const totalIncVat = Math.round((order.totalExVat + vat) * 100) / 100;

  let html = `<div style="background:#12121a;border-radius:8px;padding:16px;margin:16px 0;font-size:14px;">`;
  html += `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#a0a0b0;">Subtotal</span><span>&pound;${preDiscountSubtotal.toFixed(2)}</span></div>`;
  if (discountPct > 0) {
    html += `<div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#4ade80;"><span>Volume Discount (${(discountPct * 100).toFixed(0)}%)</span><span>-&pound;${discountAmount.toFixed(2)}</span></div>`;
  }
  html += `<div style="display:flex;justify-content:space-between;margin-bottom:8px;padding-top:8px;border-top:1px solid #1e1e2e;font-weight:600;"><span>Total ex-VAT</span><span>&pound;${order.totalExVat.toFixed(2)}</span></div>`;
  html += `<div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#a0a0b0;"><span>VAT (20%)</span><span>&pound;${vat.toFixed(2)}</span></div>`;
  html += `<div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid #1e1e2e;font-weight:700;font-size:16px;"><span>Total inc VAT</span><span style="color:#4ade80;">&pound;${totalIncVat.toFixed(2)}</span></div>`;
  html += `</div>`;
  return html;
}

function orderLink(orderId: number): string {
  return `<a href="${appUrl}/orders/${orderId}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">View Order #${orderId}</a>`;
}

export function quoteReady(
  order: OrderData,
  items: OrderItemData[],
  client: ClientData
): { subject: string; html: string } {
  const expiryDate = order.quotedExpiresAt
    ? new Date(order.quotedExpiresAt).toLocaleString("en-GB")
    : "48 hours";

  return {
    subject: `Your TCG Wholesale Quote #${order.id} is Ready`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 8px;">Quote Ready</h1>
      <p style="color:#a0a0b0;margin:0 0 24px;">Hi ${client.name},</p>
      <p>Your order <strong>#${order.id}</strong> has been quoted:</p>
      ${itemsTable(items)}
      ${totalsBlock(order)}
      <p style="color:#a0a0b0;font-size:13px;">This quote is valid until <strong>${expiryDate}</strong>.</p>
      <p style="color:#a0a0b0;font-size:13px;">To confirm, reply to this email or visit your order:</p>
      ${orderLink(order.id)}
    `),
  };
}

export function orderConfirmed(
  order: OrderData,
  client: ClientData
): { subject: string; html: string } {
  return {
    subject: `Order #${order.id} Confirmed — Awaiting Payment`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 8px;">Order Confirmed</h1>
      <p style="color:#a0a0b0;margin:0 0 24px;">Hi ${client.name},</p>
      <p>Your order <strong>#${order.id}</strong> has been confirmed and is now awaiting payment.</p>
      ${totalsBlock(order)}
      <p style="color:#a0a0b0;font-size:13px;">We'll notify you once payment is received and your order is processed.</p>
      ${orderLink(order.id)}
    `),
  };
}

export function orderShipped(
  order: OrderData,
  client: ClientData
): { subject: string; html: string } {
  return {
    subject: `Order #${order.id} Has Shipped!`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 8px;">Order Shipped</h1>
      <p style="color:#a0a0b0;margin:0 0 24px;">Hi ${client.name},</p>
      <p>Your order <strong>#${order.id}</strong> has shipped!</p>
      <p style="color:#a0a0b0;font-size:13px;">Estimated arrival: 3-5 business days.</p>
      ${orderLink(order.id)}
    `),
  };
}

export function orderDelivered(
  order: OrderData,
  client: ClientData
): { subject: string; html: string } {
  return {
    subject: `Order #${order.id} Delivered — Thank You!`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 8px;">Order Delivered</h1>
      <p style="color:#a0a0b0;margin:0 0 24px;">Hi ${client.name},</p>
      <p>Your order <strong>#${order.id}</strong> has been delivered. Thank you for your business!</p>
      <p style="color:#a0a0b0;font-size:13px;">If you have any issues with your order, please get in touch.</p>
      ${orderLink(order.id)}
    `),
  };
}

export function newOrderAdmin(
  order: OrderData,
  client: ClientData,
  itemCount: number
): { subject: string; html: string } {
  const vat = Math.round(order.totalExVat * VAT_RATE * 100) / 100;
  const totalIncVat = Math.round((order.totalExVat + vat) * 100) / 100;

  return {
    subject: `New Order #${order.id} from ${client.name} — £${totalIncVat.toFixed(2)}`,
    html: wrap(`
      <h1 style="font-size:24px;margin:0 0 8px;">New Order Submitted</h1>
      <p><strong>${client.name}</strong>${client.company ? ` (${client.company})` : ""} submitted a new order.</p>
      <div style="background:#12121a;border-radius:8px;padding:16px;margin:16px 0;font-size:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#a0a0b0;">Order</span><span>#${order.id}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#a0a0b0;">Items</span><span>${itemCount}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#a0a0b0;">Total ex-VAT</span><span>&pound;${order.totalExVat.toFixed(2)}</span></div>
        ${order.volumeDiscount > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#4ade80;"><span>Volume Discount</span><span>${(order.volumeDiscount * 100).toFixed(0)}%</span></div>` : ""}
      </div>
      ${order.notes ? `<p style="color:#a0a0b0;font-size:13px;">Notes: ${order.notes}</p>` : ""}
      <a href="${appUrl}/admin/orders" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">View in Admin</a>
    `),
  };
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/lib/email/templates.ts
git commit -m "feat: dark-themed email templates for order notifications"
```

---

### Task 5: Create `sendOrderEmail` function

**Files:**
- Create: `src/lib/email/send-order-email.ts`

**Step 1: Write the send function**

This is the single entry point for all notification sending. It fetches the order/client/items from DB, picks the right template, sends via Resend (or console), and logs to the `notifications` table.

```ts
import { db } from "@/lib/db";
import { orders, orderItems, cards, clients, notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resend, notificationFrom } from "./resend";
import * as templates from "./templates";

type NotificationType = "quote_ready" | "confirmed" | "shipped" | "delivered" | "new_order";

export async function sendOrderEmail(
  orderId: number,
  type: NotificationType
): Promise<void> {
  try {
    // Fetch order
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) return;

    // Fetch client
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, order.clientId))
      .limit(1);
    if (!client) return;

    // Determine recipient — admin notification goes to admin, rest go to client
    let recipient: string;
    if (type === "new_order") {
      const [admin] = await db
        .select()
        .from(clients)
        .where(eq(clients.role, "admin"))
        .limit(1);
      recipient = admin?.email ?? "admin@cambridgetcg.com";
    } else {
      recipient = client.email;
    }

    // Build email content based on type
    let email: { subject: string; html: string };

    if (type === "quote_ready") {
      const items = await db
        .select({
          cardNumber: cards.cardNumber,
          cardName: cards.name,
          quantity: orderItems.quantity,
          unitPriceExVat: orderItems.unitPriceExVat,
          lineTotal: orderItems.lineTotal,
        })
        .from(orderItems)
        .innerJoin(cards, eq(orderItems.cardId, cards.id))
        .where(eq(orderItems.orderId, orderId));
      email = templates.quoteReady(order, items, client);
    } else if (type === "confirmed") {
      email = templates.orderConfirmed(order, client);
    } else if (type === "shipped") {
      email = templates.orderShipped(order, client);
    } else if (type === "delivered") {
      email = templates.orderDelivered(order, client);
    } else {
      // new_order — count items for admin email
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      email = templates.newOrderAdmin(order, client, items.length);
    }

    // Send via Resend or fallback to console
    if (resend) {
      await resend.emails.send({
        from: notificationFrom,
        to: recipient,
        subject: email.subject,
        html: email.html,
      });
    } else {
      console.log(`[EMAIL FALLBACK] To: ${recipient}`);
      console.log(`[EMAIL FALLBACK] Subject: ${email.subject}`);
      console.log(`[EMAIL FALLBACK] Type: ${type} | Order: #${orderId}`);
    }

    // Log success
    await db.insert(notifications).values({
      orderId,
      type,
      recipient,
      status: "sent",
    });
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed to send ${type} for order #${orderId}:`, err);

    // Log failure
    try {
      await db.insert(notifications).values({
        orderId,
        type,
        recipient: "unknown",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // If even logging fails, just console.error
      console.error("[EMAIL ERROR] Failed to log notification failure");
    }
  }
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/lib/email/send-order-email.ts
git commit -m "feat: sendOrderEmail function with Resend + console fallback"
```

---

### Task 6: Wire email into `POST /api/orders` (client submit → admin notification)

**Files:**
- Modify: `src/app/api/orders/route.ts`

**Step 1: Add the import and email call**

Add import at the top of `src/app/api/orders/route.ts`:
```ts
import { sendOrderEmail } from "@/lib/email/send-order-email";
```

After the order is created and items are inserted (after the `for` loop ending around line 52), before the return, add:

```ts
  // Notify admin of new order
  try {
    await sendOrderEmail(order.id, "new_order");
  } catch {
    // Email failure should not break order submission
  }
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/app/api/orders/route.ts
git commit -m "feat: notify admin on new order submission"
```

---

### Task 7: Wire email into `PATCH /api/orders/[id]/status` (status transitions → client notifications)

**Files:**
- Modify: `src/app/api/orders/[id]/status/route.ts`

**Step 1: Add import**

Add at the top:
```ts
import { sendOrderEmail } from "@/lib/email/send-order-email";
```

**Step 2: Add email trigger after status update**

After the status update block (after `await db.update(orders).set(statusUpdate).where(...)` on line 58, and after the "paid" spend block ending ~line 69), add before the final select:

```ts
    // Send notification email for key status transitions
    const emailMap: Record<string, "quote_ready" | "confirmed" | "shipped" | "delivered"> = {
      quoted: "quote_ready",
      confirmed: "confirmed",
      shipped: "shipped",
      delivered: "delivered",
    };
    const emailType = emailMap[body.status];
    if (emailType) {
      try {
        await sendOrderEmail(orderId, emailType);
      } catch {
        // Email failure should not break status update
      }
    }
```

This goes inside the `if (body.status)` block, after the "paid" logic.

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/app/api/orders/[id]/status/route.ts
git commit -m "feat: email client on quoted/confirmed/shipped/delivered"
```

---

### Task 8: Wire email into `POST /api/orders/[id]/stock-check/complete` (stock check → quote email)

**Files:**
- Modify: `src/app/api/orders/[id]/stock-check/complete/route.ts`

**Step 1: Add import**

Add at the top:
```ts
import { sendOrderEmail } from "@/lib/email/send-order-email";
```

**Step 2: Add email call**

After the order is updated to "quoted" status (after `await db.update(orders).set(...)` on line ~93), before the return:

```ts
  // Send quote ready email to client
  try {
    await sendOrderEmail(orderId, "quote_ready");
  } catch {
    // Email failure should not break stock check completion
  }
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/app/api/orders/[id]/stock-check/complete/route.ts
git commit -m "feat: send quote email on stock check completion"
```

---

### Task 9: Add notifications API endpoint for admin

**Files:**
- Create: `src/app/api/admin/orders/[id]/notifications/route.ts`

**Step 1: Create the API route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const orderId = parseInt(id);

  const result = await db
    .select()
    .from(notifications)
    .where(eq(notifications.orderId, orderId))
    .orderBy(desc(notifications.sentAt));

  return NextResponse.json(result);
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/app/api/admin/orders/[id]/notifications/route.ts
git commit -m "feat: admin API endpoint for order notification history"
```

---

### Task 10: Add notification log section to admin orders page

**Files:**
- Modify: `src/app/admin/orders/page.tsx`

**Step 1: Add notification types and state**

Add a `Notification` interface near the other interfaces (after `EditableItem` ~line 37):

```ts
interface NotificationRow {
  id: number;
  orderId: number;
  type: string;
  recipient: string;
  status: string;
  error: string | null;
  sentAt: string | null;
}
```

Add state inside the component (after the `sending` state ~line 62):

```ts
const [notifs, setNotifs] = useState<Record<number, NotificationRow[]>>({});
```

**Step 2: Fetch notifications when expanding an order**

Inside the `toggleExpand` function, after items are fetched (~line 96, inside the `if (!items[orderId])` block), add:

```ts
      // Fetch notification history
      const notifRes = await fetch(`/api/admin/orders/${orderId}/notifications`);
      const notifData: NotificationRow[] = await notifRes.json();
      setNotifs((prev) => ({ ...prev, [orderId]: notifData }));
```

**Step 3: Add notification log UI**

Inside the expanded row JSX (in the `<td colSpan={7}>` block), after both the editable quote view and the read-only items table, but still inside the outer `td`, add the notification log section. Place it after the closing of the ternary that handles submitted vs non-submitted views (after line ~391, before the closing `</td>`):

```tsx
                      {/* Notification log */}
                      {notifs[order.id] && notifs[order.id].length > 0 && (
                        <div className="mt-4 pt-4 border-t border-[#1e1e2e]">
                          <h4 className="text-xs font-semibold text-gray-400 mb-2">Notification History</h4>
                          <div className="space-y-1">
                            {notifs[order.id].map((n) => (
                              <div key={n.id} className="flex items-center gap-3 text-xs">
                                <span className={`inline-block w-2 h-2 rounded-full ${n.status === "sent" ? "bg-green-500" : "bg-red-500"}`} />
                                <span className="text-gray-400 w-20">
                                  {n.type.replace(/_/g, " ")}
                                </span>
                                <span className="text-gray-500">{n.recipient}</span>
                                <span className="text-gray-600 ml-auto">
                                  {n.sentAt ? new Date(n.sentAt).toLocaleString() : "—"}
                                </span>
                                {n.error && (
                                  <span className="text-red-400" title={n.error}>error</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
```

**Step 4: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 5: Test manually**

1. Run `pnpm dev`
2. Log in as admin
3. Expand any order — notification log should appear (empty if no notifications yet)
4. Submit an order as a client — check console for `[EMAIL FALLBACK]` log (since no API key)
5. As admin, mark an order as quoted/confirmed — check console for fallback log
6. Expand the order again — notification history should show the sent entries

**Step 6: Commit**

```bash
git add src/app/admin/orders/page.tsx
git commit -m "feat: notification history section in admin order detail"
```

---

### Task 11: Final commit — squash into feature commit

**Step 1: Verify the full build passes**

Run: `pnpm build`
Expected: Build succeeds with no errors.

**Step 2: Create the feature commit**

If all individual commits are already made, this task is complete. The commit history tells the story:

1. `chore: add resend dependency and email env vars`
2. `feat: add notifications table to schema`
3. `feat: resend client singleton with env fallback`
4. `feat: dark-themed email templates for order notifications`
5. `feat: sendOrderEmail function with Resend + console fallback`
6. `feat: notify admin on new order submission`
7. `feat: email client on quoted/confirmed/shipped/delivered`
8. `feat: send quote email on stock check completion`
9. `feat: admin API endpoint for order notification history`
10. `feat: notification history section in admin order detail`
