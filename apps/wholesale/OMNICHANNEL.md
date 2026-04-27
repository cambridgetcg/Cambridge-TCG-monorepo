# TCG Wholesale — Omnichannel Architecture
**Objective:** Wholesale site as single source of truth. Real-time price push to all channels. Sales from all channels registered back. Shared SKU and images across everything.

_Created: 2026-03-22 | Priority: TOP_

---

## The Goal

```
                    ┌─────────────────────────────────┐
                    │   WHOLESALE SITE (SSoT)         │
                    │   wholesaletcgdirect.com        │
                    │                                 │
                    │  Cards ─── SKU ─── Images       │
                    │  Prices ─── Stock ─── Orders    │
                    └──────────┬──────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
     ┌─────────┐         ┌──────────┐        ┌──────────────┐
     │  eBay   │         │Cambridge │        │  CardMarket  │
     │(already │         │  TCG     │        │  (future)    │
     │ partial)│         │(Shopify) │        │              │
     └────┬────┘         └────┬─────┘        └──────┬───────┘
          │                   │                     │
          └────────────────────┼─────────────────────┘
                               │
                    SALES REGISTER BACK
```

---

## Current State (2026-03-22)

| Channel | Price Push | Stock Push | Sales Import | SKU | Images |
|---------|-----------|-----------|--------------|-----|--------|
| eBay | ✅ Inventory API (real-time) | ✅ Inventory API | ✅ Fulfillment API | ✅ same SKU | ❌ no |
| Cambridge TCG (Shopify) | Separate S3 pipeline | Separate | ❌ | ✅ | ✅ |
| Wholesale B2B clients | ✅ live catalog | ✅ live | ✅ order system | ✅ | ✅ |
| CardMarket | ❌ | ❌ | ❌ | ❌ | ❌ |

**Phase 1 DONE (2026-03-22):** eBay real-time Inventory + Fulfillment API client
**Phase 2 DONE (2026-03-22):** GET /api/v1/prices endpoint with Bearer auth
**Phase 4 DONE (2026-03-22):** channel field on orders/stock_adjustments, channel_api_keys table

**Remaining:**
1. Cambridge TCG: update buylist to consume /api/v1/prices instead of local files
2. Phase 3: image URL in price API, eBay listings use DB image URLs
3. Phase 5: CardMarket (Q3 2026)
4. Wire eBay order import → stock decrements (sales→stock_adjustments with channel="ebay")

---

## Implementation Plan

### Phase 1 — eBay Real-Time Sync (Tier: [C])
**Target:** Automated eBay price + stock updates via eBay Trading API (or Inventory API)

**Tasks:**
- [ ] Add `EBAY_APP_ID`, `EBAY_CERT_ID`, `EBAY_DEV_ID`, `EBAY_USER_TOKEN` to env
- [ ] Implement `src/lib/channels/ebay.ts` — eBay Inventory API client
  - `pushPrice(sku, price, stock)` — update single listing
  - `bulkPush(items[])` — batch update (max 25/call)
  - `pullOrders(since)` — fetch recent eBay orders
- [ ] Add `POST /api/admin/channels/ebay/sync` — trigger price+stock push
- [ ] Add `POST /api/admin/channels/ebay/import-orders` — pull eBay sales → register as orders
- [ ] Add cron: `0 */2 * * *` (every 2h) — auto-push price+stock changes
- [ ] Wire eBay order import to decrease stock (via `stock_adjustments` with reason="sold")

**eBay APIs needed:**
- [Inventory API](https://developer.ebay.com/api-docs/sell/inventory/overview.html) — bulk price/stock updates
- [Fulfillment API](https://developer.ebay.com/api-docs/sell/fulfillment/overview.html) — pull orders
- Auth: OAuth 2.0 with `sell.inventory` + `sell.fulfillment` scopes

---

### Phase 2 — Cambridge TCG Alignment (Tier: [S])
**Target:** Cambridge TCG uses wholesale DB as price source instead of separate S3 pipeline

**Tasks:**
- [ ] Add `GET /api/v1/prices` to wholesale site — returns `{sku, price_gbp, stock}[]`
  - Auth: API key per consumer
  - Filters: `?game=onepiece&updated_since=ISO_TIMESTAMP`
- [ ] Update Cambridge TCG price sync to call wholesale API instead of S3
  - Replace `S3_PRICE_FEED_URL` with `WHOLESALE_API_URL` + `WHOLESALE_API_KEY`
- [ ] Ensure Cambridge TCG reports Shopify sales back to wholesale
  - Shopify webhook: `orders/paid` → `POST /api/v1/sales` on wholesale
  - Wholesale decrements stock + logs adjustment (reason="sold", channel="shopify-cambridge")

---

### Phase 3 — Centralised Image Pipeline (Tier: [S])
**Target:** All channels use same images, hosted on wholesale site or CDN

**Tasks:**
- [ ] Add `imageUrl` column already exists — verify it's populated from S3 sync
- [ ] Ensure eBay listings use `imageUrl` from DB (not manually uploaded)
- [ ] Add image URL to the price API so Cambridge TCG can consume it
- [ ] Optional: Cloudflare Images for resize/optimise (£5/mo, 100k images)

---

### Phase 4 — Sales Unification (Tier: [C])
**Target:** All channel sales visible in one place, stock is truth

**Tasks:**
- [ ] Add `channel` field to `orders` table (values: `wholesale`, `ebay`, `shopify-cambridge`, `cardmarket`)
- [ ] Add `POST /api/v1/sales` endpoint — external channels register sales
  - Authenticates via API key
  - Creates order record + decrements stock via `stock_adjustments`
- [ ] Admin: `/admin/sales` — unified view across all channels
  - Filter by channel, date, game
  - Shows stock impact per sale
- [ ] Dashboard widget: "Today's sales by channel"

---

### Phase 5 — CardMarket (Tier: [X] — future)
- Requires CardMarket API access (application process)
- Same pattern as eBay: push prices, pull orders
- Track for Q3 2026

---

## Schema Changes Needed

```sql
-- Add channel tracking to orders
ALTER TABLE orders ADD COLUMN channel text DEFAULT 'wholesale';
ALTER TABLE orders ADD COLUMN external_order_id text; -- eBay order ID, Shopify order ID

-- Add API keys table for channel consumers
CREATE TABLE channel_api_keys (
  id serial PRIMARY KEY,
  channel text NOT NULL, -- 'cambridge-tcg', 'ebay', 'cardmarket'
  key_hash text NOT NULL,
  created_at timestamp DEFAULT now(),
  last_used_at timestamp
);

-- Add to stock_adjustments: channel field
ALTER TABLE stock_adjustments ADD COLUMN channel text DEFAULT 'manual';
-- Channels: 'manual', 'ebay-sale', 'shopify-cambridge', 'cardmarket-sale', 'sync'
```

---

## Priority Order

1. **Phase 1 — eBay real-time** (highest impact, most manual work eliminated)
2. **Phase 2 — Cambridge TCG alignment** (eliminates price divergence)
3. **Phase 4 — Sales unification** (completes the loop)
4. **Phase 3 — Images** (polish)
5. **Phase 5 — CardMarket** (new channel)

---

## Success Criteria

- [ ] Change a price in wholesale → eBay listing updates within 2 hours automatically
- [ ] eBay sale → wholesale stock decrements, order recorded
- [ ] Cambridge TCG prices always match wholesale (no divergence)
- [ ] Shopify (Cambridge) sale → wholesale stock decrements
- [ ] Single SKU used across all channels — no mapping tables needed
- [ ] Single image URL per card — all channels show same image

---

_This is the blueprint. Build Phase 1 first._
