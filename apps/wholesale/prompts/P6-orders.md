# P6 — Order Flow (Client Side)

## /orders/new — Order Builder

### src/app/orders/new/page.tsx
- Display cart contents from cart context as an editable table:

| Card # | Price ex-VAT | Qty | Line Total | |
|--------|-------------|-----|------------|---|
| OP01-001 | £107.57 | [2] | £215.14 | [Remove] |
| OP01-003 | £286.80 | [1] | £286.80 | [Remove] |

- Quantity inputs (min 1, editable)
- Running total sidebar:
  ```
  Subtotal:           £501.94
  Volume Discount:    -£0.00 (0%)
  ──────────────────────────
  Total ex-VAT:       £501.94
  VAT (20%):          £100.39
  Total inc VAT:      £602.33
  ```
- Show volume discount tier: "Your discount: 0% (spend £10,000+ this month to unlock 2%)"
- Optional notes field (special requests, delivery instructions)
- "Submit Order Request" button → POST /api/orders
- On success: clear cart, redirect to /orders/[id] with confirmation message
- This is a QUOTE REQUEST, not a purchase. Make that clear in the UI: "Submit for Quote" button text, explanatory note.

### POST /api/orders (src/app/api/orders/route.ts)
- Authenticated client only
- Creates order with status "submitted"
- Creates orderItems from cart data
- Calculates totalExVat with volume discount applied
- Returns order ID

## /orders — Order History

### src/app/orders/page.tsx
- List all orders for current client, newest first
- Table: Order #, Date, Items, Total ex-VAT, Status, [View]
- Status badges with colours:
  - draft: grey
  - submitted: blue
  - quoted: yellow
  - confirmed: orange
  - paid: green
  - ordered: purple
  - shipped: indigo
  - delivered: emerald

## /orders/[id] — Order Detail

### src/app/orders/[id]/page.tsx
- Order header: #, date, status badge
- Status timeline (visual steps showing progression)
- Items table (card #, qty, unit price, line total)
- Totals breakdown (subtotal, discount, ex-VAT, VAT, inc-VAT)
- Notes
- If status is "quoted": show "This quote is valid for 48 hours. Contact us to confirm."

Commit: `feat: order flow — cart, submission, history, detail`
