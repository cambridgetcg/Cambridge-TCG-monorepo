"""Migrate P-suffix parallel SKUs to V-encoded format.

Old format: OP-OP05-001-JP-P1, DON-JP-P3, etc.
New format: OP-OP05-001-JP-V{encoded}

Three cases handled:
  1. Clean rename  — P-suffix card, no V-encoded card exists yet → rename
  2. Same-URL dupe — multiple P-suffix cards share a URL → merge into one V-encoded
  3. Conflict      — P-suffix card's URL already has a V-encoded card → delete dup,
                     reassign any references to the canonical V-encoded card

Updates: cards, cart_items, price_archive, order_items (card_id), purchase_items (card_id)
"""

import os
import re
import sys
import psycopg2

DATABASE_URL = os.environ["DATABASE_URL"]
SKU_XOR_KEY = 48879


def encode_product_id(pid: int) -> str:
    n = pid ^ SKU_XOR_KEY
    if n == 0:
        return "0"
    digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    result = []
    while n:
        result.append(digits[n % 36])
        n //= 36
    return "".join(reversed(result))


def decode_product_id(encoded: str) -> int:
    return int(encoded, 36) ^ SKU_XOR_KEY


def get_refs(cur, card_id):
    cur.execute("""
        SELECT
          (SELECT count(*) FROM order_items    WHERE card_id = %s),
          (SELECT count(*) FROM purchase_items WHERE card_id = %s),
          (SELECT count(*) FROM cart_items     WHERE card_id = %s)
    """, (card_id, card_id, card_id))
    orders, purchases, carts = cur.fetchone()
    return {"orders": orders, "purchases": purchases, "carts": carts}


def reassign_and_delete(cur, old_id, canonical_id, canonical_sku):
    """Reassign all references from old_id to canonical_id, then delete old card."""
    cur.execute("UPDATE order_items    SET card_id = %s WHERE card_id = %s", (canonical_id, old_id))
    cur.execute("UPDATE purchase_items SET card_id = %s WHERE card_id = %s", (canonical_id, old_id))
    cur.execute("UPDATE cart_items SET card_id = %s, sku = %s WHERE card_id = %s",
                (canonical_id, canonical_sku, old_id))
    cur.execute("DELETE FROM price_history WHERE card_id = %s", (old_id,))
    cur.execute("DELETE FROM price_archive  WHERE card_id = %s", (old_id,))
    cur.execute("DELETE FROM cards WHERE id = %s", (old_id,))


def main():
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("DRY RUN — no changes will be committed\n")

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # ── 1. Load all P-suffix cards ────────────────────────────────────────
    cur.execute("""
        SELECT id, sku, cardrush_url
        FROM cards
        WHERE sku ~ '-P[0-9]+$'
        ORDER BY id
    """)
    rows = cur.fetchall()
    print(f"Found {len(rows)} P-suffix card SKUs to process")

    # ── 2. Load existing V-encoded SKUs (lookup by sku and by cardrush_url) ─
    cur.execute("SELECT id, sku, cardrush_url FROM cards WHERE sku LIKE '%-V%'")
    v_rows = cur.fetchall()
    v_by_sku = {r[1]: r[0] for r in v_rows}           # sku → id
    v_by_url = {r[2]: (r[0], r[1]) for r in v_rows if r[2]}  # url → (id, sku)

    # ── 3. Classify each P-suffix card ───────────────────────────────────
    clean_renames  = []   # (card_id, old_sku, new_sku)              — no conflict
    url_dupes      = {}   # new_sku → [(card_id, old_sku)]           — same URL, no existing V
    conflicts      = []   # (card_id, old_sku, canonical_id, canonical_sku) — existing V found

    for card_id, sku, url in rows:
        m = re.search(r"/product/(\d+)", url or "")
        if not m:
            print(f"  ⚠ No product ID in URL — skipping id={card_id} {sku} {url}")
            continue
        pid = int(m.group(1))
        encoded = encode_product_id(pid)
        assert decode_product_id(encoded) == pid
        base = re.sub(r"-P\d+$", "", sku)
        new_sku = f"{base}-V{encoded}"

        if url in v_by_url:
            canonical_id, canonical_sku = v_by_url[url]
            conflicts.append((card_id, sku, canonical_id, canonical_sku))
        elif new_sku in v_by_sku:
            canonical_id = v_by_sku[new_sku]
            conflicts.append((card_id, sku, canonical_id, new_sku))
        else:
            url_dupes.setdefault(new_sku, []).append((card_id, sku))

    # Separate clean renames from same-URL dupes
    for new_sku, cards in url_dupes.items():
        if len(cards) == 1:
            clean_renames.append((cards[0][0], cards[0][1], new_sku))

    merge_groups = {k: v for k, v in url_dupes.items() if len(v) > 1}

    # ── 4. Report plan ────────────────────────────────────────────────────
    merge_total = sum(len(v) for v in merge_groups.values())
    print(f"\nPlan:")
    print(f"  Clean renames:           {len(clean_renames)}")
    print(f"  Same-URL merges:         {merge_total} cards → {len(merge_groups)} V-encoded SKUs")
    print(f"  Conflicts (dupe of V):   {len(conflicts)} — will reassign refs + delete")
    total_ops = len(clean_renames) + merge_total + len(conflicts)
    print(f"  Total cards processed:   {total_ops}")

    if clean_renames:
        print(f"\nSample clean renames:")
        for _, old, new in clean_renames[:5]:
            print(f"  {old} → {new}")

    if merge_groups:
        print(f"\nSample same-URL merges:")
        for new_sku, cards in list(merge_groups.items())[:4]:
            print(f"  → {new_sku}")
            for cid, old in cards:
                print(f"      id={cid}  {old}")

    if dry_run:
        print("\nDry run complete — no changes applied.")
        conn.close()
        return

    # ── 5. Apply clean renames ────────────────────────────────────────────
    print("\nApplying clean renames...")
    renamed = 0
    for card_id, old_sku, new_sku in clean_renames:
        cur.execute("UPDATE cards SET sku = %s WHERE id = %s", (new_sku, card_id))
        cur.execute("UPDATE cart_items SET sku = %s WHERE sku = %s", (new_sku, old_sku))
        cur.execute("UPDATE price_archive SET sku = %s WHERE sku = %s", (new_sku, old_sku))
        renamed += 1

    # ── 6. Apply same-URL merges ──────────────────────────────────────────
    # Keep the lowest-id card, rename it to the V-encoded SKU, delete the rest.
    print("Applying same-URL merges...")
    merge_survivors = 0
    merge_deleted   = 0
    for new_sku, cards in merge_groups.items():
        cards_sorted = sorted(cards, key=lambda x: x[0])
        survivor_id, survivor_old_sku = cards_sorted[0]
        duplicates = cards_sorted[1:]

        # Rename survivor
        cur.execute("UPDATE cards SET sku = %s WHERE id = %s", (new_sku, survivor_id))
        cur.execute("UPDATE cart_items SET sku = %s WHERE sku = %s", (new_sku, survivor_old_sku))
        cur.execute("UPDATE price_archive SET sku = %s WHERE sku = %s", (new_sku, survivor_old_sku))
        merge_survivors += 1

        # Reassign refs from duplicates to survivor, then delete
        for dup_id, _ in duplicates:
            reassign_and_delete(cur, dup_id, survivor_id, new_sku)
            merge_deleted += 1

    # ── 7. Apply conflict resolutions ─────────────────────────────────────
    # P-suffix card is a duplicate of existing V-encoded card.
    # Reassign refs to canonical, delete P-suffix record.
    print("Resolving conflicts (reassigning refs + deleting dupes)...")
    resolved = 0
    for card_id, old_sku, canonical_id, canonical_sku in conflicts:
        reassign_and_delete(cur, card_id, canonical_id, canonical_sku)
        resolved += 1

    conn.commit()

    # ── 8. Verify ─────────────────────────────────────────────────────────
    cur.execute("SELECT count(*) FROM cards WHERE sku ~ '-P[0-9]+$'")
    remaining = cur.fetchone()[0]

    print(f"\n── Results ─────────────────────────────────────")
    print(f"  Clean renames:           {renamed}")
    print(f"  Merge survivors renamed: {merge_survivors}")
    print(f"  Merge dupes deleted:     {merge_deleted}")
    print(f"  Conflict dupes deleted:  {resolved}")
    print(f"  Remaining P-suffix SKUs: {remaining}")

    # Spot-check
    cur.execute("""
        SELECT sku, cardrush_url FROM cards
        WHERE sku LIKE '%-V%' AND cardrush_url IS NOT NULL
        ORDER BY random() LIMIT 6
    """)
    print("\nSpot-check (random V-encoded cards):")
    for sku, url in cur.fetchall():
        v_m = re.search(r"-V([A-Z0-9]+)$", sku)
        u_m = re.search(r"/product/(\d+)", url)
        if v_m and u_m:
            decoded = decode_product_id(v_m.group(1))
            url_id = int(u_m.group(1))
            status = "✓" if decoded == url_id else "✗"
            print(f"  {status}  {sku}  decoded={decoded}  url_id={url_id}")

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
