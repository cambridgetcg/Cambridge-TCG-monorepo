"""Migrate standard One Piece card SKUs to V-encoded format.

Standard SKUs (OP-OP05-001-JP) gain an encoded product ID suffix
(OP-OP05-001-JP-V13KF) so every SKU can be traced back to its exact
CardRush listing — consistent with parallels and sealed products.

  encode: productId XOR 48879 → base36 uppercase → prefix "V"
  decode: strip "V" → base36 → XOR 48879 → productId

Conflict handling:
  If the target V-encoded SKU already exists (e.g. same product was
  also captured as a parallel), the bare-SKU card is a duplicate.
  Cards with no order/purchase/cart references are deleted.
  Cards with references are reported for manual review.

Updates: cards, cart_items, price_archive
"""

import re
import sys
import psycopg2

DATABASE_URL = "postgresql://postgres:Rzqku6Og7qqogZkzb1gPSVvn@tcg-wholesale.cn4c2su0o42n.us-east-1.rds.amazonaws.com:5432/wholesale?sslmode=require&connect_timeout=10"

SKU_XOR_KEY = 48879


def encode_product_id(pid: int) -> str:
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
    return int(encoded, 36) ^ SKU_XOR_KEY


def main():
    dry_run = "--dry-run" in sys.argv

    # --game=<code> or --game=all (default: op for safety; kingdom GameCodes post-migration-0022)
    game_flag = next((a for a in sys.argv if a.startswith("--game=")), None)
    game_code = game_flag.split("=")[1] if game_flag else "op"

    if dry_run:
        print(f"DRY RUN — no changes will be committed  (game={game_code})\n")
    else:
        print(f"game={game_code}\n")

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # ── 1. Find standard cards with bare base SKUs for given game ─────────
    if game_code == "all":
        game_filter = ""
        game_params = ()
    else:
        game_filter = "AND g.code = %s"
        game_params = (game_code,)

    cur.execute(f"""
        SELECT c.id, c.sku, c.cardrush_url
        FROM cards c
        JOIN games g ON c.game_id = g.id
        WHERE c.cardrush_url IS NOT NULL
          AND c.sku NOT LIKE '%%-V%%'
          AND c.sku LIKE '%%-JP'
          {game_filter}
        ORDER BY g.code, c.sku
    """, game_params)
    rows = cur.fetchall()
    print(f"Found {len(rows)} standard One Piece card SKUs to migrate")

    if not rows:
        print("Nothing to do.")
        conn.close()
        return

    updates = []        # (new_sku, card_id, old_sku)  — clean migrations
    skipped_no_url = [] # no product ID in URL
    conflicts = []      # (card_id, old_sku, new_sku)   — new SKU already exists

    # Load existing V-encoded SKUs for conflict detection
    cur.execute("SELECT sku FROM cards WHERE sku LIKE '%-V%'")
    existing_v = {row[0] for row in cur.fetchall()}

    for card_id, old_sku, cardrush_url in rows:
        m = re.search(r"/product/(\d+)", cardrush_url)
        if not m:
            skipped_no_url.append((card_id, old_sku, cardrush_url))
            continue

        product_id = int(m.group(1))
        encoded = encode_product_id(product_id)
        new_sku = f"{old_sku}-V{encoded}"

        # Verify round-trip
        assert decode_product_id(encoded) == product_id, (
            f"Round-trip failed: {product_id} → {encoded} → {decode_product_id(encoded)}"
        )

        if new_sku in existing_v:
            conflicts.append((card_id, old_sku, new_sku))
        else:
            updates.append((new_sku, card_id, old_sku))

    # ── 2. Resolve conflicts ──────────────────────────────────────────────
    # Conflict = bare-SKU card shares a product URL with an existing V-encoded card.
    # The V-encoded card is the canonical record. The bare-SKU card is a duplicate.
    # Delete if unreferenced; report if it has orders/purchases/cart items.

    duplicates_to_delete = []  # (card_id, old_sku)
    needs_manual = []          # (card_id, old_sku, new_sku, refs)

    for card_id, old_sku, new_sku in conflicts:
        cur.execute("""
            SELECT
              (SELECT count(*) FROM order_items    WHERE card_id = %s) as orders,
              (SELECT count(*) FROM purchase_items WHERE card_id = %s) as purchases,
              (SELECT count(*) FROM cart_items     WHERE card_id = %s) as carts
        """, (card_id, card_id, card_id))
        row = cur.fetchone()
        orders, purchases, carts = row
        total_refs = orders + purchases + carts

        if total_refs == 0:
            duplicates_to_delete.append((card_id, old_sku, new_sku))
        else:
            needs_manual.append((card_id, old_sku, new_sku, {
                "orders": orders, "purchases": purchases, "carts": carts
            }))

    # ── 3. Report plan ────────────────────────────────────────────────────
    print(f"\nPlan:")
    print(f"  Migrate (bare → V-encoded):  {len(updates)}")
    print(f"  Delete (unreferenced dupes): {len(duplicates_to_delete)}")
    print(f"  Skip (no product URL):       {len(skipped_no_url)}")
    print(f"  Manual review needed:        {len(needs_manual)}")

    if updates:
        print(f"\nSample migrations:")
        for new_sku, _, old_sku in updates[:6]:
            print(f"  {old_sku} → {new_sku}")
        if len(updates) > 6:
            print(f"  ... and {len(updates) - 6} more")

    if duplicates_to_delete:
        print(f"\nUnreferenced duplicates to delete (V-encoded card takes precedence):")
        for card_id, old_sku, new_sku in duplicates_to_delete[:10]:
            print(f"  id={card_id}  {old_sku}  (canonical: {new_sku})")
        if len(duplicates_to_delete) > 10:
            print(f"  ... and {len(duplicates_to_delete) - 10} more")

    if needs_manual:
        print(f"\n⚠  Manual review required (duplicate cards WITH references):")
        for card_id, old_sku, new_sku, refs in needs_manual:
            print(f"  id={card_id}  {old_sku} → {new_sku}")
            print(f"    refs: {refs}")

    if skipped_no_url:
        print(f"\n⚠  Skipped (no product ID in URL):")
        for card_id, old_sku, url in skipped_no_url[:10]:
            print(f"  id={card_id}  {old_sku}  url={url}")

    if dry_run:
        print("\nDry run complete — no changes applied.")
        conn.close()
        return

    # ── 4. Duplicate check for clean updates ──────────────────────────────
    new_skus = [new_sku for new_sku, _, _ in updates]
    self_dupes = [s for s in set(new_skus) if new_skus.count(s) > 1]
    if self_dupes:
        print(f"\nABORT: {len(self_dupes)} duplicate new SKUs in migration set: {self_dupes[:10]}")
        conn.close()
        return

    # ── 5. Apply migrations ───────────────────────────────────────────────
    print("\nApplying migrations...")

    for new_sku, card_id, _ in updates:
        cur.execute("UPDATE cards SET sku = %s WHERE id = %s", (new_sku, card_id))

    old_to_new = {old_sku: new_sku for new_sku, _, old_sku in updates}
    old_skus_list = list(old_to_new.keys())

    # cart_items (denormalized sku)
    cur.execute("SELECT id, sku FROM cart_items WHERE sku = ANY(%s)", (old_skus_list,))
    cart_rows = cur.fetchall()
    for item_id, old_sku in cart_rows:
        cur.execute("UPDATE cart_items SET sku = %s WHERE id = %s", (old_to_new[old_sku], item_id))

    # price_archive (denormalized sku)
    cur.execute("SELECT id, sku FROM price_archive WHERE sku = ANY(%s)", (old_skus_list,))
    archive_rows = cur.fetchall()
    for item_id, old_sku in archive_rows:
        cur.execute("UPDATE price_archive SET sku = %s WHERE id = %s", (old_to_new[old_sku], item_id))

    # ── 6. Delete unreferenced duplicates ─────────────────────────────────
    deleted_count = 0
    for card_id, old_sku, _ in duplicates_to_delete:
        cur.execute("DELETE FROM price_history WHERE card_id = %s", (card_id,))
        cur.execute("DELETE FROM price_archive  WHERE card_id = %s", (card_id,))
        cur.execute("DELETE FROM cards WHERE id = %s", (card_id,))
        deleted_count += 1

    # ── 7. Reassign referenced duplicates then delete ─────────────────────
    # For the 7 bare-SKU duplicates with order references: the bare-SKU card
    # and the canonical V-encoded card represent the same physical product
    # (same CarRush URL). Reassign order_items.card_id to the canonical card,
    # then delete the duplicate.
    reassigned_count = 0
    for card_id, old_sku, new_sku, _refs in needs_manual:
        cur.execute("SELECT id FROM cards WHERE sku = %s", (new_sku,))
        row = cur.fetchone()
        if not row:
            print(f"  ⚠ Cannot find canonical card for {new_sku} — skipping id={card_id}")
            continue
        canonical_id = row[0]

        cur.execute(
            "UPDATE order_items SET card_id = %s WHERE card_id = %s",
            (canonical_id, card_id)
        )
        cur.execute(
            "UPDATE purchase_items SET card_id = %s WHERE card_id = %s",
            (canonical_id, card_id)
        )
        cur.execute(
            "UPDATE cart_items SET card_id = %s, sku = %s WHERE card_id = %s",
            (canonical_id, new_sku, card_id)
        )
        cur.execute("DELETE FROM price_history WHERE card_id = %s", (card_id,))
        cur.execute("DELETE FROM price_archive  WHERE card_id = %s", (card_id,))
        cur.execute("DELETE FROM cards WHERE id = %s", (card_id,))
        reassigned_count += 1

    conn.commit()

    # ── 7. Verify ─────────────────────────────────────────────────────────
    cur.execute(f"""
        SELECT count(*) FROM cards c
        JOIN games g ON c.game_id = g.id
        WHERE c.sku NOT LIKE '%%-V%%'
          AND c.sku LIKE '%%-JP'
          AND c.cardrush_url IS NOT NULL
          {game_filter}
    """, game_params)
    remaining = cur.fetchone()[0]

    print(f"\n── Results ───────────────────────────────────────")
    print(f"  Cards migrated:           {len(updates)}")
    print(f"  Unreferenced dupes deleted:{deleted_count}")
    print(f"  Referenced dupes reassigned+deleted: {reassigned_count}")
    print(f"  Cart items updated:       {len(cart_rows)}")
    print(f"  Price archive updated:    {len(archive_rows)}")
    print(f"  Cards skipped (no URL):   {len(skipped_no_url)}")
    print(f"  Remaining bare SKUs:      {remaining}")

    # Spot-check
    cur.execute(f"""
        SELECT c.sku, c.cardrush_url
        FROM cards c
        JOIN games g ON c.game_id = g.id
        WHERE c.sku LIKE '%%-V%%'
          AND c.cardrush_url IS NOT NULL
          {game_filter}
        LIMIT 6
    """, game_params)
    print("\nSpot-check (decoded ID vs URL product ID):")
    for sku, url in cur.fetchall():
        v_match = re.search(r"-V([A-Z0-9]+)$", sku)
        url_match = re.search(r"/product/(\d+)", url)
        if v_match and url_match:
            decoded = decode_product_id(v_match.group(1))
            url_id = int(url_match.group(1))
            status = "✓" if decoded == url_id else "✗"
            print(f"  {status}  {sku}  →  decoded={decoded}, url_id={url_id}")

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
