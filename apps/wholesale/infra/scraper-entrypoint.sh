#!/bin/bash
set -euo pipefail

echo "=== TCG Wholesale Daily Scraper ==="
echo "Date: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# Scrape all singles sets (skip images — S3 upload done separately)
echo ">>> Scraping all singles sets..."
npx tsx tools/scrape-cardrush.ts --set-all --skip-images

echo ""

# Scrape sealed products
echo ">>> Scraping sealed products..."
npx tsx tools/scrape-cardrush.ts --sealed

echo ""

# Sync condition prices (all grades: Mint, 状態A-, B, C)
echo ">>> Syncing condition prices..."
npx tsx tools/sync-condition-prices.ts

echo ""
echo "=== Daily scrape complete ==="
