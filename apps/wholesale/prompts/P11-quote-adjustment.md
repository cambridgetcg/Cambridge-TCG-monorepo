# P11 — Quote Adjustment: Admin Price Editing Before Sending Quote

When a client submits an order, the admin needs to verify stock and may need to adjust prices (CardRush price may have changed, card may be unavailable, or admin wants to offer a custom price). Currently the admin can only advance status — they can't modify the quote.

## Task

### 1. Expand the admin order detail view

When admin clicks an order row in `/admin/orders`, the expanded view should show editable fields:

For each line item:
- Card number (read-only)
- Current CardRush JPY price (read-only, for reference)
- Unit price ex-VAT (EDITABLE — pre-filled with current price)
- Quantity (EDITABLE — admin may reduce if stock is limited)
- Availability toggle (checkbox — uncheck if out of stock)
- Line total (auto-calculated)

### 2. "Send Quote" flow
When admin clicks "Send Quote":
1. Save any price/quantity adjustments to orderItems
2. Recalculate order totalExVat
3. Remove any unavailable items (or mark them)
4. Set status to "quoted"
5. Record quotedAt timestamp on the order

### 3. Add fields to orders table
- `quotedAt` — when the quote was sent
- `quotedExpiresAt` — quotedAt + 48 hours
- `adminNotes` — internal notes (not visible to client)

### 4. Client sees the quoted prices
On `/orders/[id]`, when status is "quoted":
- Show the final quoted prices (which may differ from original)
- Show "Quote valid until: {date}"
- Show any items that were removed with "Out of stock" note
- If any prices changed from original, show both (original strikethrough, quoted price)

### 5. API updates
- `PATCH /api/orders/[id]/items` — update line item prices/quantities (admin only)
- `PATCH /api/orders/[id]/status` — when setting to "quoted", also set quotedAt and quotedExpiresAt

### 6. Quote expiry
On the client order detail page, if `quotedExpiresAt` has passed, show "Quote expired — please resubmit or contact us."

Commit: `feat: admin quote adjustment — editable prices, stock toggle, expiry`
