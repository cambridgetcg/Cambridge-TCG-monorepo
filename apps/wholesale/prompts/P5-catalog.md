# P5 — Catalog Page

Build `/catalog` — the main client-facing price list.

## src/app/catalog/page.tsx (Server Component)

- Query `cards` table, support search params: `?q=OP01&set=OP01&sort=price&order=asc&page=1`
- 50 cards per page
- Display as a clean data table:

| Card # | SKU | Set | Price (ex-VAT) | |
|--------|-----|-----|----------------|---|
| OP01-001 | OP-OP01-001-JP | OP01 | £107.57 | [Add to Order] |

- Search bar at top: filter by card number or SKU (debounced, updates URL params)
- Set filter dropdown (populated from distinct setCode values)
- Sort by: card number, price (asc/desc)
- Pagination at bottom
- "Add to Order" button stores selection in client-side cart (React context or zustand)
- Show "Last synced: {timestamp}" at top
- Prices formatted as `£XX.XX ex-VAT`
- If client has volume discount > 0, show discounted price with strikethrough on original

## src/components/catalog/CardTable.tsx
Table component with sortable column headers.

## src/components/catalog/SearchBar.tsx
Search input + set filter dropdown. Updates URL search params.

## src/components/catalog/Pagination.tsx
Page navigation.

## Cart State
Use React context (`src/lib/cart-context.tsx`):
- items: Map<cardId, { card, quantity }>
- addItem(card, qty)
- removeItem(cardId)
- updateQuantity(cardId, qty)
- clear()
- totalExVat (computed, with volume discount applied)
- itemCount

Show floating cart indicator in header: "🛒 3 items — £1,234.56"

## Layout
- Wrap authenticated pages in a layout with:
  - Header: "Cambridge TCG Wholesale" logo area + cart indicator + user menu (name + sign out)
  - Sidebar or top nav: Catalog | Orders | (Admin if admin role)

Dark theme throughout. Professional, minimal.

Commit: `feat: catalog page with search, sort, pagination, cart`
