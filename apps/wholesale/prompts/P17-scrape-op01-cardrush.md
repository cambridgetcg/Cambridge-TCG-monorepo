# P17 — Scrape OP01 Cards from CardRush (¥280+) and Insert into Wholesale DB

## Context

The existing AWS pipeline scrapes CardRush One Piece prices daily via Bright Data Web Unlocker (Lambda `tcg-FetchJsonData-prod`). The S3 pricefeed currently has 26 OP01 cards, but there are 120 cards in the set. We want ALL OP01 cards priced ≥¥280 on CardRush added to our wholesale database.

## Existing Infrastructure Reference

### Card Catalog (already exists)
The Lambda has pre-built card catalogs as JSON. Located at:
```
/tmp/fetch_json/op01_cards_catalog.json
```
Or download from the Lambda package:
```bash
aws lambda get-function --function-name tcg-FetchJsonData-prod --query 'Code.Location' --output text
# Unzip → op01_cards_catalog.json
```

**Catalog format:**
```json
{
  "set_code": "OP01",
  "total_cards": 116,
  "cards": [
    {
      "card_number": "001",
      "card_id": "OP01-001",
      "name": "Roronoa Zoro",
      "rarity": "L",
      "image_url": "https://product-images.s3.cardmarket.com/...",
      "trend_price": 0.7,
      "variants": [
        { "variant_type": "standard", "language": "EN" },
        { "variant_type": "parallel", "language": "EN" }
      ],
      "card_type": "Leader"
    }
  ]
}
```

### Scraping Method (from existing Lambda)
The pipeline uses **Bright Data Web Unlocker** to bypass CloudFlare:
```python
# From scraper.py — uses bright_data.py
from .bright_data import BrightDataClient
client = BrightDataClient()
html = client.fetch(url)
```

CardRush One Piece product URLs follow this pattern:
```
https://www.cardrush-op.jp/product/{product_id}
```

The S3 pricefeed maps SKUs to CardRush URLs (stored in the daily_prices.xlsx history).

### SKU Naming Convention
```
OP-{SET_CODE}-{CARD_NUMBER}-JP
```
Examples:
- `OP-OP01-001-JP` (Roronoa Zoro, Leader)
- `OP-OP01-120-JP` (Shanks, SEC)

For **parallel/alternate art variants**, append the variant:
- `OP-OP01-001-JP-P` (parallel)
- `OP-OP01-120-JP-V2` (variant 2)
- `OP-OP01-120-JP-V3` (variant 3)

### Current Pricefeed Coverage (OP01)
The S3 pricefeed currently tracks 26 OP01 cards (only those that were previously listed). Many cards priced ¥280-¥580 are missing.

## Task

### Phase 1: Build the CardRush Scraper Script

Create `tools/scrape_cardrush.py` — a standalone Python script that:

1. Takes a set code as argument: `python tools/scrape_cardrush.py OP01`
2. Loads the card catalog from `op01_cards_catalog.json` (include as data file, or download from S3)
3. For each card in the catalog, fetches the CardRush price page
4. Extracts:
   - JPY price (the main price, and any variant prices)
   - Stock status (in stock / sold out)
   - Product ID (from the URL)
5. Filters: only include cards priced ≥ ¥280
6. Generates SKU aligned with our naming: `OP-{SET}-{NUMBER}-JP`
7. Outputs JSON with all scraped data

**Scraping approach — try in this order:**

**Option A: CardRush Search/Catalog API**
CardRush may expose product data via their website's internal JSON API. Before scraping HTML, check if:
```
https://www.cardrush-op.jp/api/products?set=OP01
https://www.cardrush-op.jp/search?q=OP01
```
returns structured data. Inspect the network requests in browser devtools on the CardRush OP site.

**Option B: CardRush Category Pages**
CardRush lists cards by set. Scrape the set category page to get all product URLs + prices at once (more efficient than individual pages):
```
https://www.cardrush-op.jp/category/select/cid/315  (example: OP01 category)
```
Each category page shows card name, card number, price, and stock status in a grid.

**Option C: Individual Product Pages (fallback)**
If bulk scraping isn't possible, hit each product page individually with delays.

**Important:**
- Use `requests` with appropriate headers (User-Agent, Accept-Language: ja)
- Add 1-2 second delay between requests to be respectful
- Handle CloudFlare protection — if blocked, document it and we'll route through the existing Bright Data proxy
- If CardRush is in order-stop mode (they do this periodically), document which cards have no price and flag them as "unavailable"

### Phase 2: Map to Wholesale SKU and Calculate Prices

For each card scraped:
```python
{
    "sku": "OP-OP01-001-JP",
    "card_number": "OP01-001",
    "name": "Roronoa Zoro",
    "set_code": "OP01",
    "set_name": "Romance Dawn",
    "rarity": "L",
    "card_type": "Leader",
    "cardrush_jpy": 17800,
    "cardrush_url": "https://www.cardrush-op.jp/product/169",
    "cardrush_product_id": 169,
    "in_stock": true,
    "gbp_jpy_rate": <current rate>,
    "base_gbp": <jpy / rate>,
    "price_ex_vat": <base + 5% shipping + 20% margin>,
    "image_url": "<from catalog>",
    "scraped_at": "2026-02-25T22:00:00Z"
}
```

Use the pricing formula from `src/lib/pricing.ts`:
```
base_gbp = jpy / rate
shipping = base_gbp * 0.05
landed = base_gbp + shipping
margin = landed * 0.20
price_ex_vat = landed + margin
```

Get the current GBP/JPY rate — either from the `get_GBP-JPY` Lambda or from a free FX API:
```bash
aws lambda invoke --function-name get_GBP-JPY /tmp/fx.json && cat /tmp/fx.json
```

### Phase 3: Insert into Wholesale Database

Create `tools/insert_cards.py` — reads the scraped JSON and inserts into the RDS wholesale database:

```python
# Connection details from Secrets Manager:
# aws secretsmanager get-secret-value --secret-id '/tcg-wholesale/database/credentials'
# Or from env: DATABASE_URL

# For each card:
# 1. Find or create the game (One Piece) and set (OP01)
# 2. Upsert into cards table:
#    - Match on sku (unique)
#    - Update price if changed
#    - Set game_id, set_id from games/sets tables
#    - Set category = 'singles'
# 3. Insert price_history row with today's date
```

Use `psycopg2` or `postgres` (the postgres.js equivalent for Python, or just raw SQL).

### Phase 4: Verify

After insertion:
1. Query the DB: `SELECT count(*) FROM cards WHERE set_code = 'OP01';`
2. Should be 50-80 cards (the OP01 cards priced ≥ ¥280 on CardRush)
3. Spot-check 3 cards: verify SKU format, price calculation, CardRush URL
4. Restart the Next.js dev server and verify the catalog shows the new cards
5. Filter by One Piece → OP01 — should see the full list

### Phase 5: Output

Save the scraped data to:
- `data/cardrush/op01_prices.json` — raw scrape results
- `data/cardrush/op01_wholesale.json` — with GBP prices calculated
- Console output: summary table of all cards, prices, stock status

## Quality Checklist

- [ ] All OP01 cards priced ≥ ¥280 on CardRush are captured
- [ ] SKU format: `OP-OP01-{NUMBER}-JP` (consistent with existing pipeline)
- [ ] Card names populated from catalog JSON
- [ ] Rarity populated (L, SR, SEC, R, UC, C)
- [ ] Prices correctly calculated through the landing cost formula
- [ ] Cards inserted into RDS with correct game_id (One Piece) and set_id (OP01)
- [ ] Cards visible in the catalog at localhost after restart
- [ ] Script is reusable for other sets: `python tools/scrape_cardrush.py OP02`

## Future

This script will be extended to:
- Scrape all sets (OP01-OP13, ST01-ST21, EB01-EB02, PRB01-PRB02)
- Run as a daily cron job (or Lambda)
- Handle promotional/exclusive cards
- Track price changes over time
- Alert on significant price movements

Commit: `feat: CardRush OP01 scraper + wholesale DB insertion`
