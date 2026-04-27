# P12 — Status Change Notifications

Clients currently have to manually check `/orders` to see if anything changed. Add email notifications on key status transitions.

## Task

### 1. Email provider setup
Use Resend (free tier: 100 emails/day, no credit card). Add to .env:
```
RESEND_API_KEY=
NOTIFICATION_FROM=orders@cambridgetcg.com
```

Install: `pnpm add resend`

### 2. Create email templates (src/lib/email/)

Simple, clean HTML emails (dark theme matching the app):

**Quote Ready** (submitted → quoted):
```
Subject: Your TCG Wholesale Quote #[ID] is Ready

Hi [name],

Your order #[ID] has been quoted:

[items table with quantities and prices]

Total ex-VAT: £[amount]
Volume Discount: [X]%
VAT (20%): £[amount]
Total inc VAT: £[amount]

This quote is valid until [expiry date].

To confirm, reply to this email or visit:
[link to /orders/ID]

Cambridge TCG Wholesale
```

**Order Confirmed** (confirmed):
```
Subject: Order #[ID] Confirmed — Awaiting Payment
```

**Order Shipped** (shipped):
```
Subject: Order #[ID] Has Shipped!
Estimated arrival: [X] business days
```

**Order Delivered** (delivered):
```
Subject: Order #[ID] Delivered — Thank You!
```

### 3. Trigger on status change
In `PATCH /api/orders/[id]/status`, after updating status:
```ts
if (["quoted", "confirmed", "shipped", "delivered"].includes(newStatus)) {
  await sendOrderEmail(order, newStatus);
}
```

### 4. Admin notification
When a client SUBMITS an order, email the admin:
```
Subject: New Order #[ID] from [client name] — £[amount]
```

### 5. Notification log
Add a `notifications` table:
- id, orderId, type (quote_ready/confirmed/shipped/delivered/new_order), sentAt, recipient, status (sent/failed)

Show notification history in admin order detail.

### 6. Fallback
If Resend is not configured (no API key), log the notification to console instead of crashing. The app should work without email.

Commit: `feat: email notifications on order status changes`
