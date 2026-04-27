# P10 — Live S3 Sync: Replace Seed Data with Real Prices

The app has 8 seed cards. The S3 bucket has ~487 real One Piece cards with live JPY prices from CardRush. Time to connect them.

## Task

### 1. Test the sync endpoint
Hit `POST /api/sync` from the admin prices page (/admin/prices → "Sync Now" button). Check if it works end-to-end:
- Reads `s3://pricedata-tcg/pricefeed/onepiece_pricefeed.xlsx`
- Parses the Excel (first sheet: ebay_business)
- Columns: sku (col 1), latest JPY price (col 2), base_cost (3), total_cost (4), selling_price (5), gbp_to_jpy (6), ebay_item_number (7)
- Upserts cards table with recalculated GBP prices

### 2. Fix SKU parsing
The Excel SKUs look like `OP-OP01-001-JP`. Extract:
- cardNumber: `OP01-001` (strip `OP-` prefix and `-JP` suffix)
- setCode: `OP01` (first segment after stripping)
- setName: map from setCode (OP01 = "Romance Dawn", OP02 = "Paramount War", etc. — or leave blank for now)

### 3. Handle "Not Available" prices
Some cards in the daily_prices history show "Not Available" when CardRush is out of stock. The pricefeed Excel should only contain available cards, but if any JPY price is 0 or non-numeric, flag the card as unavailable (add an `available` boolean column to cards, or set priceExVat to null).

### 4. Card name enrichment
The price feed doesn't include card names — just SKU and price. For now, set name to the cardNumber. Later we can enrich from a card database.

### 5. Verify pricing formula
After sync, spot-check 3 cards against manual calculation:
```
base_gbp = jpy / gbp_jpy_rate
+ 5% shipping
+ 20% margin
= price_ex_vat
```

### 6. Price history
On each sync, insert a row into priceHistory for every card with today's date + JPY price + FX rate. This builds the historical trend data.

### Deliverable
After running sync: ~487 One Piece cards in the catalog with real GBP prices. The catalog page should be populated and searchable.

Commit: `feat: live S3 sync — 487 One Piece cards with real prices`
