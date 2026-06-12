"""Migrate CardRush SKUs from -CR{id} to -V{encoded} and SEALED-{id}-JP to SEALED-V{encoded}-JP.

Uses XOR + base36 encoding to obfuscate the product ID so clients can't
derive the supplier URL from a client-visible SKU.

  encode: productId XOR 48879 → base36 uppercase → prefix "V"
  decode: strip "V" → base36 → XOR 48879 → productId
"""

import os
import re
import psycopg2

DATABASE_URL = os.environ["DATABASE_URL"]

SKU_XOR_KEY = 48879


def encode_product_id(pid: int) -> str:
    """XOR with key, convert to base36 uppercase."""
    encoded = pid ^ SKU_XOR_KEY
    if encoded == 0:
        return "0"
    digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    result = []
    while encoded:
        result.append(digits[encoded % 36])
        encoded //= 36
    return "".join(reversed(result))


def decode_product_id(encoded: str) -> int:
    """Reverse: base36 → XOR → original product ID."""
    return int(encoded, 36) ^ SKU_XOR_KEY


def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # ── 1. Parallel cards: -CR{id} → -V{encoded} ──────────────────────────

    cur.execute("SELECT id, sku FROM cards WHERE sku LIKE '%-CR%'")
    parallel_rows = cur.fetchall()
    print(f"Found {len(parallel_rows)} parallel card SKUs to migrate")

    parallel_updates = []
    for card_id, old_sku in parallel_rows:
        match = re.search(r"-CR(\d+)$", old_sku)
        if not match:
            continue
        product_id = int(match.group(1))
        encoded = encode_product_id(product_id)
        new_sku = re.sub(r"-CR\d+$", f"-V{encoded}", old_sku)

        # Verify round-trip
        assert decode_product_id(encoded) == product_id, (
            f"Round-trip failed: {product_id} → {encoded} → {decode_product_id(encoded)}"
        )
        parallel_updates.append((new_sku, card_id))

    # ── 2. Sealed products: SEALED-{id}-JP → SEALED-V{encoded}-JP ─────────
    #    Also update card_number from SEALED-{id} → SEALED-V{encoded}

    cur.execute(
        "SELECT id, sku, card_number FROM cards "
        "WHERE sku LIKE 'SEALED-%-JP' AND sku NOT LIKE 'SEALED-V%'"
    )
    sealed_rows = cur.fetchall()
    print(f"Found {len(sealed_rows)} sealed product SKUs to migrate")

    sealed_updates = []
    for card_id, old_sku, old_card_number in sealed_rows:
        match = re.search(r"^SEALED-(\d+)-JP$", old_sku)
        if not match:
            continue
        product_id = int(match.group(1))
        encoded = encode_product_id(product_id)
        new_sku = f"SEALED-V{encoded}-JP"
        new_card_number = f"SEALED-V{encoded}"

        assert decode_product_id(encoded) == product_id
        sealed_updates.append((new_sku, new_card_number, card_id))

    # ── 3. Check for duplicates before applying ───────────────────────────

    all_new_skus = [sku for sku, _ in parallel_updates] + [sku for sku, _, _ in sealed_updates]
    if len(all_new_skus) != len(set(all_new_skus)):
        dupes = [s for s in set(all_new_skus) if all_new_skus.count(s) > 1]
        print(f"ABORT: {len(dupes)} duplicate new SKUs would be created: {dupes[:10]}")
        conn.close()
        return

    # Also check against existing SKUs that won't be migrated
    cur.execute(
        "SELECT sku FROM cards "
        "WHERE sku NOT LIKE '%-CR%' "
        "AND NOT (sku LIKE 'SEALED-%-JP' AND sku NOT LIKE 'SEALED-V%')"
    )
    existing_skus = {row[0] for row in cur.fetchall()}
    conflicts = set(all_new_skus) & existing_skus
    if conflicts:
        print(f"ABORT: {len(conflicts)} new SKUs conflict with existing: {list(conflicts)[:10]}")
        conn.close()
        return

    print("No duplicates or conflicts detected")

    # ── 4. Apply updates ──────────────────────────────────────────────────

    for new_sku, card_id in parallel_updates:
        cur.execute("UPDATE cards SET sku = %s WHERE id = %s", (new_sku, card_id))

    for new_sku, new_card_number, card_id in sealed_updates:
        cur.execute(
            "UPDATE cards SET sku = %s, card_number = %s WHERE id = %s",
            (new_sku, new_card_number, card_id),
        )

    # ── 5. Also update order_items that reference old SKUs ────────────────

    cur.execute("SELECT id, sku FROM order_items WHERE sku LIKE '%-CR%'")
    order_parallel = cur.fetchall()
    print(f"Found {len(order_parallel)} order_items with parallel -CR SKUs")

    for item_id, old_sku in order_parallel:
        match = re.search(r"-CR(\d+)$", old_sku)
        if not match:
            continue
        product_id = int(match.group(1))
        encoded = encode_product_id(product_id)
        new_sku = re.sub(r"-CR\d+$", f"-V{encoded}", old_sku)
        cur.execute("UPDATE order_items SET sku = %s WHERE id = %s", (new_sku, item_id))

    cur.execute(
        "SELECT id, sku FROM order_items "
        "WHERE sku LIKE 'SEALED-%-JP' AND sku NOT LIKE 'SEALED-V%'"
    )
    order_sealed = cur.fetchall()
    print(f"Found {len(order_sealed)} order_items with sealed SKUs")

    for item_id, old_sku in order_sealed:
        match = re.search(r"^SEALED-(\d+)-JP$", old_sku)
        if not match:
            continue
        product_id = int(match.group(1))
        encoded = encode_product_id(product_id)
        new_sku = f"SEALED-V{encoded}-JP"
        cur.execute("UPDATE order_items SET sku = %s WHERE id = %s", (new_sku, item_id))

    conn.commit()

    # ── 6. Verify ─────────────────────────────────────────────────────────

    cur.execute("SELECT count(*) FROM cards WHERE sku LIKE '%-CR%'")
    remaining_cr = cur.fetchone()[0]

    cur.execute("SELECT count(*) FROM cards WHERE sku LIKE 'SEALED-%-JP' AND sku NOT LIKE 'SEALED-V%'")
    remaining_sealed = cur.fetchone()[0]

    cur.execute("SELECT count(*) FROM order_items WHERE sku LIKE '%-CR%'")
    remaining_oi_cr = cur.fetchone()[0]

    cur.execute("SELECT count(*) FROM order_items WHERE sku LIKE 'SEALED-%-JP' AND sku NOT LIKE 'SEALED-V%'")
    remaining_oi_sealed = cur.fetchone()[0]

    print(f"\n── Results ──")
    print(f"Parallel cards migrated:  {len(parallel_updates)}")
    print(f"Sealed products migrated: {len(sealed_updates)}")
    print(f"Order items (parallel):   {len(order_parallel)}")
    print(f"Order items (sealed):     {len(order_sealed)}")
    print(f"Remaining old -CR SKUs:   {remaining_cr}")
    print(f"Remaining old SEALED-#:   {remaining_sealed}")
    print(f"Remaining OI -CR SKUs:    {remaining_oi_cr}")
    print(f"Remaining OI SEALED-#:    {remaining_oi_sealed}")

    # Spot-check: decode a sample
    cur.execute(
        "SELECT sku, cardrush_url FROM cards "
        "WHERE sku LIKE '%-V%' AND cardrush_url IS NOT NULL "
        "LIMIT 3"
    )
    for sku, url in cur.fetchall():
        match = re.search(r"-V([A-Z0-9]+)(?:-JP)?$", sku)
        if match and url:
            decoded = decode_product_id(match.group(1))
            url_match = re.search(r"/product/(\d+)", url)
            url_id = int(url_match.group(1)) if url_match else None
            status = "✓" if decoded == url_id else "✗"
            print(f"  {status} SKU {sku} → decoded {decoded}, URL product/{url_id}")

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
