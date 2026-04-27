# P16 — Order Tracking: Detailed Fulfilment Status for Clients

The current status timeline is a simple linear bar (submitted → quoted → confirmed → paid → ordered → shipped → delivered). The client has no visibility into what's actually happening between "paid" and "delivered" — which is the longest and most anxious wait.

Replace the generic status bar with a detailed fulfilment tracker that shows the real-world journey of their order.

## New Status Model

### Expand the order lifecycle
The current statuses handle the quoting phase well. The gap is between "paid" and "delivered". Add granular fulfilment stages:

```
QUOTING PHASE (existing, keep as-is):
  submitted → quoted → confirmed → paid

FULFILMENT PHASE (new granular tracking):
  paid → processing → sourced → warehouse_jp → dispatched_jp → customs → warehouse_uk → dispatched_uk → delivered
```

### Fulfilment stages explained:
| Stage | Display Name | Description |
|-------|-------------|-------------|
| `processing` | Processing | Order received, preparing to source |
| `sourced` | Sourced | Cards confirmed and purchased from supplier |
| `warehouse_jp` | At JP Warehouse | Cards arrived at our Japan warehouse, being inspected & packed |
| `dispatched_jp` | Shipped from Japan | Package dispatched from Japan |
| `customs` | UK Customs | Package clearing UK customs |
| `warehouse_uk` | At UK Warehouse | Arrived in UK, being prepared for dispatch |
| `dispatched_uk` | Out for Delivery | Dispatched to client |
| `delivered` | Delivered | Client received the order |

## Schema Changes

### 1. `orderEvents` table
Instead of a single status field, track a log of events:
```ts
export const orderEvents = sqliteTable("order_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id),
  status: text("status").notNull(),          // the stage code
  message: text("message"),                   // optional detail: "Shipped via EMS, tracking: JP123456789"
  trackingNumber: text("tracking_number"),    // carrier tracking ref
  trackingUrl: text("tracking_url"),          // clickable tracking link
  estimatedDate: text("estimated_date"),      // ETA for this stage
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  createdBy: text("created_by"),             // "admin" or "system"
});
```

The `orders.status` field still holds the CURRENT status (latest event). The events table holds the full history.

### 2. Add to orders table
- `estimatedDelivery` — overall ETA shown to client
- `trackingNumber` — primary tracking reference
- `trackingUrl` — primary tracking link

## Client Order Detail (`/orders/[id]`)

### 3. Replace the status bar with a vertical timeline

```
┌─────────────────────────────────────────────────────┐
│  ORDER #42 — TRACKING                               │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ✅ Submitted              Feb 25, 10:30 AM         │
│  │                                                  │
│  ✅ Quote Sent             Feb 25, 11:15 AM         │
│  │  "487 cards confirmed at quoted prices"          │
│  │                                                  │
│  ✅ Confirmed              Feb 25, 2:00 PM          │
│  │                                                  │
│  ✅ Payment Received       Feb 25, 4:30 PM          │
│  │                                                  │
│  ✅ Processing             Feb 26, 9:00 AM          │
│  │  "Order placed with CardRush"                    │
│  │                                                  │
│  ✅ Sourced                Feb 27, 3:00 PM          │
│  │  "All cards confirmed in stock, purchased"       │
│  │                                                  │
│  ✅ At JP Warehouse        Mar 1, 10:00 AM          │
│  │  "Cards inspected, quality verified, packed"     │
│  │                                                  │
│  🔵 Shipped from Japan    Mar 2, 2:00 PM           │
│  │  "EMS tracking: JP123456789"                     │
│  │  [Track Package ↗]                               │
│  │  Estimated arrival: Mar 7-9                      │
│  │                                                  │
│  ⚪ UK Customs             —                        │
│  │                                                  │
│  ⚪ At UK Warehouse        —                        │
│  │                                                  │
│  ⚪ Out for Delivery       —                        │
│  │                                                  │
│  ⚪ Delivered              —                        │
│                                                     │
│  📦 Estimated delivery: Mar 7-9, 2026              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- ✅ Completed stages (green) — with timestamp and message
- 🔵 Current stage (blue, pulsing dot) — with details
- ⚪ Future stages (grey) — no date yet
- Tracking link shown when available
- Estimated delivery shown prominently at bottom

### 4. Component: `src/components/orders/OrderTimeline.tsx`

Props:
```ts
interface OrderTimelineProps {
  events: {
    status: string;
    message: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    estimatedDate: string | null;
    createdAt: string;
  }[];
  currentStatus: string;
  estimatedDelivery: string | null;
}
```

Render as vertical timeline with connecting lines. Responsive — collapses nicely on mobile.

## Admin: Add Tracking Events

### 5. Update admin order management

When admin expands an order in `/admin/orders`, add a section below the items table:

**"Add Tracking Update"** form:
- Status dropdown (next logical stage, or any stage)
- Message (free text, optional)
- Tracking number (optional)
- Tracking URL (optional)
- Estimated date (optional date picker)
- [Add Update] button

This creates an entry in `orderEvents` AND advances the order status.

Show existing events as a log below the form.

### 6. Quick actions
Predefined quick-update buttons for common transitions:
- "Ordered from CardRush" → sourced + message
- "Arrived at JP warehouse" → warehouse_jp
- "Shipped EMS" → dispatched_jp + tracking number input
- "Cleared customs" → customs
- "Arrived UK" → warehouse_uk
- "Dispatched to client" → dispatched_uk + tracking input
- "Delivered" → delivered

## API

### 7. New endpoints
- `POST /api/orders/[id]/events` — add tracking event (admin only)
  - Body: `{ status, message?, trackingNumber?, trackingUrl?, estimatedDate? }`
  - Also updates `orders.status` to the new status
- `GET /api/orders/[id]/events` — get all events for an order (auth: owner or admin)

### 8. Update existing status endpoint
`PATCH /api/orders/[id]/status` should also create an event when advancing status, so the timeline is populated even when using the simple status buttons.

Commit: `feat: order tracking timeline — granular fulfilment stages, tracking events, ETA`
