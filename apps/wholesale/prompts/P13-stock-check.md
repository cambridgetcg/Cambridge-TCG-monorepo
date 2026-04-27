# P13 — Stock Check Workflow

When an order comes in, admin needs to verify stock availability on CardRush before quoting. Currently this is a manual process (open CardRush links in browser). Make it faster.

## Task

### 1. CardRush link integration
Each card already has a `cardrushUrl` field (e.g. `https://www.cardrush-op.jp/product/169`). In the admin order detail (expanded view), show a clickable link next to each card: "Check Stock ↗" that opens the CardRush page in a new tab.

### 2. Bulk stock check view
New admin page or modal: `/admin/orders/[id]/stock-check`

Shows all items in the order as a checklist:
```
☐ OP01-001  ¥17,800  Qty: 2  [Check Stock ↗]  [In Stock] [Out of Stock] [Price Changed: ¥___]
☐ OP01-003  ¥34,800  Qty: 1  [Check Stock ↗]  [In Stock] [Out of Stock] [Price Changed: ¥___]
```

Admin clicks through each CardRush link, then marks:
- **In Stock** — no change needed
- **Out of Stock** — flags item, will be removed from quote
- **Price Changed** — enter new JPY price, auto-recalculates GBP

### 3. "All Checked" → auto-advance
Once all items are marked, enable a "Send Quote" button that:
1. Removes out-of-stock items from the order
2. Updates prices for changed items
3. Recalculates total
4. Sets status to "quoted"

### 4. Stock check timestamp
Add `stockCheckedAt` to orders table. Show "Stock verified: [date]" on the quote.

### 5. Price discrepancy alert
If any CardRush JPY price in the order differs from the latest sync price by >5%, highlight it in yellow: "⚠ Price may have changed since last sync"

Compare `orderItems.unitPriceExVat` recalculated from the card's current `cardrushJpy` vs when the order was placed.

## Future (not this prompt)
- Automated stock checking via CardRush scraper (check if product page shows "SOLD OUT" or "在庫切れ")
- Real-time price monitoring for ordered items

Commit: `feat: stock check workflow — checklist, price verification, bulk actions`
