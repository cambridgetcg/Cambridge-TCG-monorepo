#!/usr/bin/env python3
"""
Migration: Add Shopify columns to cards table and backfill existing 506 listings.

Steps:
1. Add shopify_product_id, shopify_variant_id, shopify_inventory_item_id, shopify_synced_at columns
2. Create index on shopify_product_id
3. Query Shopify for all products and match on SKU to backfill the 506 existing cards
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error
import psycopg2
import psycopg2.extras

# ── Config ────────────────────────────────────────────────────────────────────

DATABASE_URL = os.environ["DATABASE_URL"]

SHOPIFY_STORE = os.environ.get("SHOPIFY_STORE", "6e824e-a9.myshopify.com")
SHOPIFY_ACCESS_TOKEN = os.environ["SHOPIFY_ACCESS_TOKEN"]
SHOPIFY_API_VERSION = "2024-10"

# ── DB Migration ──────────────────────────────────────────────────────────────

MIGRATION_SQL = """
ALTER TABLE cards ADD COLUMN IF NOT EXISTS shopify_product_id TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS shopify_variant_id TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS shopify_inventory_item_id TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS shopify_synced_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS cards_shopify_product_idx ON cards(shopify_product_id);
"""

# ── Shopify API ───────────────────────────────────────────────────────────────

def shopify_request(path: str, params: dict = None) -> dict:
    """Make a GET request to Shopify REST API."""
    url = f"https://{SHOPIFY_STORE}/admin/api/{SHOPIFY_API_VERSION}/{path}"
    if params:
        query = "&".join(f"{k}={v}" for k, v in params.items())
        url = f"{url}?{query}"

    req = urllib.request.Request(url)
    req.add_header("X-Shopify-Access-Token", SHOPIFY_ACCESS_TOKEN)
    req.add_header("Content-Type", "application/json")

    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def get_link_url(link_header: str, rel: str) -> str | None:
    """Parse Link header and return the URL for the given rel."""
    if not link_header:
        return None
    for part in link_header.split(","):
        url_part, rel_part = part.strip().split(";")
        if rel_part.strip() == f'rel="{rel}"':
            return url_part.strip().strip("<>")
    return None


def get_all_shopify_products() -> dict:
    """
    Fetch all Shopify products (paginated) and return a dict of:
    sku -> {product_id, variant_id, inventory_item_id}
    """
    print("Fetching all Shopify products (paginated)...")
    sku_map = {}
    page_size = 250
    total_products = 0

    url = f"https://{SHOPIFY_STORE}/admin/api/{SHOPIFY_API_VERSION}/products.json"
    params = f"limit={page_size}&fields=id,variants"

    req_url = f"{url}?{params}"

    while req_url:
        req = urllib.request.Request(req_url)
        req.add_header("X-Shopify-Access-Token", SHOPIFY_ACCESS_TOKEN)
        req.add_header("Content-Type", "application/json")

        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            link_header = resp.headers.get("Link", "")

        products = data.get("products", [])
        total_products += len(products)

        for product in products:
            product_id = str(product["id"])
            for variant in product.get("variants", []):
                sku = variant.get("sku", "").strip()
                if sku:
                    sku_map[sku] = {
                        "product_id": product_id,
                        "variant_id": str(variant["id"]),
                        "inventory_item_id": str(variant.get("inventory_item_id", "")),
                    }

        print(f"  Fetched {total_products} products so far, {len(sku_map)} SKUs found...")

        # Parse next page URL from Link header
        next_url = None
        if link_header:
            for part in link_header.split(","):
                parts = part.strip().split(";")
                if len(parts) == 2 and parts[1].strip() == 'rel="next"':
                    next_url = parts[0].strip().strip("<>")
                    break

        req_url = next_url

        # Rate limiting: 2 req/s
        time.sleep(0.5)

    print(f"Total products fetched: {total_products}, unique SKUs: {len(sku_map)}")
    return sku_map


# ── Main ──────────────────────────────────────────────────────────────────────

def run_migration():
    print("=" * 60)
    print("Shopify Columns Migration")
    print("=" * 60)

    # Parse connection string for psycopg2
    # postgresql://user:password@host:port/dbname?sslmode=require
    db_url = DATABASE_URL
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgres://", 1)

    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    # Step 1: Run migration SQL
    print("\n[1/3] Running SQL migration (adding columns)...")
    for statement in MIGRATION_SQL.strip().split(";"):
        stmt = statement.strip()
        if stmt:
            print(f"  Executing: {stmt[:80]}...")
            cur.execute(stmt)
    conn.commit()
    print("  Migration SQL complete.")

    # Step 2: Fetch all Shopify products by SKU
    print("\n[2/3] Fetching Shopify products...")
    sku_map = get_all_shopify_products()

    if not sku_map:
        print("  WARNING: No Shopify products found! Skipping backfill.")
        return

    # Step 3: Backfill existing cards
    print("\n[3/3] Backfilling shopify_product_id / shopify_variant_id for existing cards...")

    # Get all cards from DB
    cur.execute("SELECT id, sku FROM cards WHERE sku IS NOT NULL")
    cards = cur.fetchall()
    print(f"  Total cards in DB: {len(cards)}")

    matched = 0
    unmatched = 0
    updated = 0

    update_data = []
    for card_id, sku in cards:
        if sku in sku_map:
            info = sku_map[sku]
            update_data.append((
                info["product_id"],
                info["variant_id"],
                info["inventory_item_id"] or None,
                card_id,
            ))
            matched += 1
        else:
            unmatched += 1

    print(f"  Matched: {matched}, Unmatched (no Shopify listing): {unmatched}")

    if update_data:
        psycopg2.extras.execute_batch(
            cur,
            """
            UPDATE cards
            SET shopify_product_id = %s,
                shopify_variant_id = %s,
                shopify_inventory_item_id = %s,
                shopify_synced_at = NOW()
            WHERE id = %s
            """,
            update_data,
            page_size=100,
        )
        updated = len(update_data)
        conn.commit()
        print(f"  Updated {updated} cards with Shopify IDs.")

    cur.close()
    conn.close()

    print("\n" + "=" * 60)
    print(f"Migration complete!")
    print(f"  Cards with Shopify IDs backfilled: {updated}")
    print(f"  Cards without Shopify listing: {unmatched}")
    print("=" * 60)


if __name__ == "__main__":
    run_migration()
