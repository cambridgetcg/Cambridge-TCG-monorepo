# P12 — Status Change Notifications Design

## Summary

Add email notifications on key order status transitions using Resend. Emails are sent inline (awaited) in API handlers with try/catch — failures are logged but never break status changes. A `notifications` table logs all send attempts. If Resend is not configured, emails are logged to console instead.

## Architecture

**Approach:** Direct inline sending (await in API handler, try/catch).

### New files

- `src/lib/email/resend.ts` — Resend client singleton, returns null if no API key
- `src/lib/email/templates.ts` — Pure functions returning `{ subject, html }` per email type
- `src/lib/email/send-order-email.ts` — Main `sendOrderEmail(orderId, type)` function

### Schema addition

```
notifications:
  id          INTEGER PK autoincrement
  orderId     INTEGER FK → orders.id
  type        TEXT enum: "quote_ready" | "confirmed" | "shipped" | "delivered" | "new_order"
  recipient   TEXT (email address)
  status      TEXT enum: "sent" | "failed"
  error       TEXT nullable (failure reason)
  sentAt      TEXT (ISO timestamp)
```

### Trigger points

| Trigger | Location | Email type | Recipient |
|---------|----------|------------|-----------|
| Client submits order | POST /api/orders | new_order | admin |
| Stock check completes | POST /api/orders/[id]/stock-check/complete | quote_ready | client |
| Status → quoted | PATCH /api/orders/[id]/status | quote_ready | client |
| Status → confirmed | PATCH /api/orders/[id]/status | confirmed | client |
| Status → shipped | PATCH /api/orders/[id]/status | shipped | client |
| Status → delivered | PATCH /api/orders/[id]/status | delivered | client |

### Email templates

All emails use dark-themed HTML wrapper (bg #0a0a0f, card #12121a, accent brand-500):

- **Quote Ready**: Items table, totals (subtotal, discount, VAT, total inc VAT), quote expiry, link to /orders/[id]
- **Confirmed**: Confirmation message, "awaiting payment", link
- **Shipped**: Shipped notification, estimated arrival, link
- **Delivered**: Thank you message, link
- **New Order (admin)**: Client name/company, item count, total, link to admin orders

### Admin UI

Notification log section in expanded order row on /admin/orders — compact table showing type, recipient, timestamp, status badge (green sent, red failed).

### Fallback

No RESEND_API_KEY → log to console with `[EMAIL FALLBACK]` prefix, still write to notifications table with status "sent".

### Env vars

```
RESEND_API_KEY=
NOTIFICATION_FROM=orders@cambridgetcg.com
```
