# P18 — Card Image Catalog: SKU Reference Table with Images in S3

Build a comprehensive reference table mapping every card to its SKU, CardRush link, image URLs, and store the images in S3 for our own hosting.

## Existing State

### S3 Image Bucket: `jp-op-photos`
Already has images for 26 OP01 cards (the ones in the pricefeed):
```
s3://jp-op-photos/OP01/OP01-001.jpeg  (2.2MB, high-res)
s3://jp-op-photos/OP01/OP01-002.jpeg
...
```
Convention: `{SET_CODE}/{CARD_ID}.jpeg`

### Image Sources Available
1. **CardMarket CDN** (all 120 OP01 cards): `https://product-images.s3.cardmarket.com/1621/OP01-JP/{id}/{id}.png`
   - Available in the card catalog JSON (`image_url` field per card)
   - Medium quality, ~100-300KB per image
2. **CardRush product pages** — higher quality product photos, but need scraping
3. **Existing S3** — 26 high-res CardRush photos (~2.2MB each)

## Task

### Phase 1: Build the Reference Table

Create `tools/build_card_catalog.py` that generates a master reference CSV/JSON:

For every OP01 card (from `op01_cards_catalog.json`):

```
| sku              | card_id  | name           | rarity | card_type | cardrush_url                              | cardmarket_image_url                                          | s3_image_key                  | s3_image_url                                              |
|------------------|----------|----------------|--------|-----------|-------------------------------------------|---------------------------------------------------------------|-------------------------------|----------------------------------------------------------|
| OP-OP01-001-JP   | OP01-001 | Roronoa Zoro   | L      | Leader    | https://www.cardrush-op.jp/product/169    | https://product-images.s3.cardmarket.com/1621/OP01-JP/768236  | OP01/OP01-001.jpeg            | https://jp-op-photos.s3.amazonaws.com/OP01/OP01-001.jpeg |
```

Fields:
- `sku` — our wholesale SKU: `OP-{SET}-{NUMBER}-JP`
- `card_id` — set-number format: `OP01-001`
- `name` — from catalog JSON
- `rarity` — L, SR, SEC, R, UC, C
- `card_type` — Leader, Character, Event, Stage
- `cardrush_url` — CardRush product page URL (scrape from P17, or map from existing pricefeed data)
- `cardmarket_url` — from catalog JSON `url` field
- `cardmarket_image_url` — from catalog JSON `image_url` field
- `s3_image_key` — path in jp-op-photos bucket
- `s3_image_url` — full public URL (or pre-signed)
- `has_s3_image` — boolean, whether we've stored it in S3 yet

### Phase 2: Download Missing Images to S3

Create `tools/sync_card_images.py`:

1. For each card in the catalog, check if `s3://jp-op-photos/{SET}/{CARD_ID}.jpeg` exists
2. If not, download the image from CardMarket CDN (`image_url` in catalog)
3. Convert to JPEG if PNG, resize to a consistent size (800px width, maintain aspect ratio)
4. Upload to S3: `s3://jp-op-photos/{SET}/{CARD_ID}.jpeg`
5. Log: downloaded X new images, Y already existed, Z failed

```python
import boto3
import requests
from PIL import Image
from io import BytesIO

s3 = boto3.client('s3')
BUCKET = 'jp-op-photos'

def download_and_upload(card_id, set_code, image_url):
    key = f"{set_code}/{card_id}.jpeg"
    
    # Check if exists
    try:
        s3.head_object(Bucket=BUCKET, Key=key)
        return "exists"
    except:
        pass
    
    # Download
    resp = requests.get(image_url, timeout=30)
    img = Image.open(BytesIO(resp.content))
    
    # Resize to 800px width
    ratio = 800 / img.width
    img = img.resize((800, int(img.height * ratio)), Image.LANCZOS)
    
    # Convert to JPEG
    buf = BytesIO()
    img.convert('RGB').save(buf, 'JPEG', quality=85)
    buf.seek(0)
    
    # Upload
    s3.put_object(
        Bucket=BUCKET, Key=key, Body=buf,
        ContentType='image/jpeg',
        CacheControl='max-age=31536000'
    )
    return "uploaded"
```

Add a 0.5s delay between downloads to be respectful to CardMarket's CDN.

### Phase 3: CardRush URL Mapping

The tricky part: mapping card IDs to CardRush product URLs. CardRush uses numeric product IDs (`/product/169`) that don't follow a pattern.

**Approach A: Extract from existing pricefeed**
The daily_prices.xlsx or the scraper state in DynamoDB may have the CardRush URL ↔ card ID mapping already. Check:
```bash
# Check DynamoDB scraper state
aws dynamodb scan --table-name tcg-scraper-state-prod --limit 10
```

**Approach B: Scrape the CardRush category page for OP01**
CardRush lists cards by set on category pages. Scrape the OP01 category page to extract all product URLs with card numbers:
```
https://www.cardrush-op.jp/category/select/cid/{OP01_CATEGORY_ID}
```

**Approach C: Build from P17 scrape output**
If P17 has already been run, its output JSON will have the CardRush URLs. Just import them.

For cards where we can't find a CardRush URL, leave it null — these may be cards CardRush doesn't stock.

### Phase 4: Update Database

After building the reference table:
1. Update `cards` table with `image_url` (S3 URL) and `cardrush_url` for all OP01 cards
2. The S3 URL format: `https://jp-op-photos.s3.us-east-1.amazonaws.com/{SET}/{CARD_ID}.jpeg`
   - Or use CloudFront if you have a distribution set up
   - Check if the bucket has public access enabled, otherwise use pre-signed URLs

### Phase 5: Display Images in Catalog

Update the catalog UI to show card images:
- Thumbnail (64x89px, card aspect ratio ~1:1.4) in the table next to card number
- On hover or click: show larger preview (400px width)
- Lazy load images for performance
- Fallback: show a placeholder if no image

### Phase 6: Save Reference Table

Output to:
- `data/catalog/op01_reference.json` — complete reference with all URLs
- `data/catalog/op01_reference.csv` — spreadsheet-friendly version
- Upload to S3: `s3://pricedata-tcg/catalog/op01_reference.json`

## Deliverables

1. `tools/build_card_catalog.py` — generates master reference table
2. `tools/sync_card_images.py` — downloads missing images to S3
3. `data/catalog/op01_reference.json` + `.csv` — complete OP01 catalog
4. All ~120 OP01 card images in `s3://jp-op-photos/OP01/`
5. Database updated with image URLs
6. Catalog UI showing thumbnails

## Make It Reusable

Both scripts should accept a set code argument:
```bash
python tools/build_card_catalog.py OP01
python tools/sync_card_images.py OP01
# Later:
python tools/build_card_catalog.py OP02
python tools/sync_card_images.py --all  # all sets
```

The catalog JSON files exist for all sets: `op01_cards_catalog.json` through `op13_cards_catalog.json`, `st01` through `st21`, `eb01-eb02`, `prb01-prb02`.

Commit: `feat: card image catalog — reference table, S3 image sync, catalog thumbnails`
