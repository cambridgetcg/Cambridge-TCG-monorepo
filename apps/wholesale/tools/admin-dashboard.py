"""Unified Admin Dashboard — stock, orders, purchases, fulfillment in one Streamlit app."""

import io
import os
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal

import pandas as pd
import psycopg2
import psycopg2.extras
import streamlit as st
from fpdf import FPDF

DATABASE_URL = os.environ["DATABASE_URL"]

ALL_STATUSES = ["submitted", "quoted", "confirmed", "paid", "ordered", "shipped", "delivered", "cancelled"]

VALID_TRANSITIONS = {
    "submitted": ["quoted", "cancelled"],
    "quoted": ["confirmed", "cancelled"],
    "confirmed": ["paid", "cancelled"],
    "paid": ["ordered", "cancelled"],
    "ordered": ["shipped", "cancelled"],
    "shipped": ["delivered", "cancelled"],
    "delivered": [],
    "cancelled": [],
}

PURCHASE_TRANSITIONS = {
    "ordered": ["shipped", "received"],
    "shipped": ["received"],
    "received": [],
}

_JP_FONT = os.path.join(os.path.dirname(__file__), "fonts", "NotoSansJP.ttf")

# ── Helpers ──────────────────────────────────────────────────────────────────


def _conn():
    return psycopg2.connect(DATABASE_URL)


def _dec(v):
    """Convert Decimal/None to float for display."""
    if v is None:
        return 0.0
    return float(v) if isinstance(v, Decimal) else v


# ── Data loaders ─────────────────────────────────────────────────────────────


@st.cache_data(ttl=60)
def load_overview_kpis() -> dict:
    conn = _conn()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM orders WHERE status NOT IN ('delivered','cancelled')")
    open_orders = cur.fetchone()[0]

    cur.execute("""
        WITH purchased AS (
            SELECT pi.card_id, SUM(pi.quantity) AS qty
            FROM purchase_items pi
            JOIN purchases p ON p.id = pi.purchase_id
            WHERE p.status IN ('received','shipped')
            GROUP BY pi.card_id
        ),
        fulfilled AS (
            SELECT oi.card_id, SUM(fe.fulfilled_qty) AS qty
            FROM fulfillment_entries fe
            JOIN order_items oi ON oi.id = fe.order_item_id
            GROUP BY oi.card_id
        )
        SELECT COALESCE(SUM(p.qty - COALESCE(f.qty, 0)), 0)
        FROM purchased p
        LEFT JOIN fulfilled f ON f.card_id = p.card_id
    """)
    stock_on_hand = cur.fetchone()[0] or 0

    cur.execute("SELECT COALESCE(SUM(items_total_jpy + service_fee_jpy + shipping_jpy),0) FROM purchases")
    purchases_value = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM cards")
    catalog_count = cur.fetchone()[0]

    conn.close()
    return {
        "open_orders": open_orders,
        "stock_on_hand": stock_on_hand,
        "purchases_value_jpy": purchases_value,
        "catalog_count": catalog_count,
    }


@st.cache_data(ttl=60)
def load_recent_orders(limit: int = 10) -> list[dict]:
    conn = _conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT o.id, c.name AS client, o.status, o.total, o.created_at,
               COUNT(oi.id) AS item_count
        FROM orders o
        JOIN clients c ON o.client_id = c.id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        GROUP BY o.id, c.name
        ORDER BY o.created_at DESC LIMIT %s
    """, (limit,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@st.cache_data(ttl=60)
def load_recent_purchases(limit: int = 10) -> list[dict]:
    conn = _conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, remambo_order_id, supplier, status, ordered_at,
               items_total_jpy, service_fee_jpy, shipping_jpy
        FROM purchases ORDER BY ordered_at DESC LIMIT %s
    """, (limit,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@st.cache_data(ttl=60)
def load_orders_filtered(statuses: list[str]) -> list[dict]:
    conn = _conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT o.id, c.name AS client, o.status, o.total, o.created_at,
               COUNT(oi.id) AS item_count
        FROM orders o
        JOIN clients c ON o.client_id = c.id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.status = ANY(%s)
        GROUP BY o.id, c.name
        ORDER BY o.created_at DESC
    """, (statuses,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@st.cache_data(ttl=60)
def load_order_items(order_id: int) -> list[dict]:
    conn = _conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT oi.id, oi.quantity, oi.unit_price, oi.line_total,
               oi.stock_status, ca.card_number, ca.name, ca.set_code, ca.image_url
        FROM order_items oi
        JOIN cards ca ON oi.card_id = ca.id
        WHERE oi.order_id = %s
        ORDER BY ca.card_number
    """, (order_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def update_order_status(order_id: int, from_status: str, to_status: str):
    conn = _conn()
    cur = conn.cursor()
    cur.execute("UPDATE orders SET status = %s, updated_at = NOW() WHERE id = %s", (to_status, order_id))
    cur.execute("""
        INSERT INTO order_status_history (order_id, from_status, to_status)
        VALUES (%s, %s, %s)
    """, (order_id, from_status, to_status))
    conn.commit()
    conn.close()


@st.cache_data(ttl=60)
def load_stock() -> pd.DataFrame:
    conn = _conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        WITH purchased AS (
            SELECT pi.card_id, pi.condition, SUM(pi.quantity) AS qty_purchased
            FROM purchase_items pi
            JOIN purchases p ON p.id = pi.purchase_id
            WHERE p.status IN ('received', 'shipped')
            GROUP BY pi.card_id, pi.condition
        ),
        fulfilled AS (
            SELECT oi.card_id, SUM(fe.fulfilled_qty) AS qty_fulfilled
            FROM fulfillment_entries fe
            JOIN order_items oi ON oi.id = fe.order_item_id
            GROUP BY oi.card_id
        )
        SELECT c.card_number, c.name, c.set_code, c.image_url, p.condition,
               p.qty_purchased::int AS qty_purchased,
               COALESCE(f.qty_fulfilled, 0)::int AS qty_fulfilled,
               (p.qty_purchased - COALESCE(f.qty_fulfilled, 0))::int AS qty_on_hand
        FROM purchased p
        JOIN cards c ON c.id = p.card_id
        LEFT JOIN fulfilled f ON f.card_id = c.id
        ORDER BY c.card_number, p.condition
    """)
    rows = cur.fetchall()
    conn.close()
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows)


@st.cache_data(ttl=60)
def load_purchases_all() -> list[dict]:
    conn = _conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, remambo_order_id, supplier, parcel_id, status,
               ordered_at, shipped_at, received_at,
               items_total_jpy, service_fee_jpy, shipping_jpy, notes
        FROM purchases ORDER BY ordered_at DESC
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@st.cache_data(ttl=60)
def load_purchase_items(purchase_id: int) -> list[dict]:
    conn = _conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT pi.id, pi.condition, pi.quantity, pi.unit_price_jpy, pi.cardrush_url,
               c.card_number, c.name, c.set_code, c.image_url
        FROM purchase_items pi
        JOIN cards c ON c.id = pi.card_id
        WHERE pi.purchase_id = %s
        ORDER BY c.card_number
    """, (purchase_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def update_purchase_status(purchase_id: int, new_status: str, shipped_at=None, received_at=None):
    conn = _conn()
    cur = conn.cursor()
    if new_status == "shipped" and shipped_at:
        cur.execute("UPDATE purchases SET status=%s, shipped_at=%s WHERE id=%s",
                     (new_status, shipped_at, purchase_id))
    elif new_status == "received" and received_at:
        cur.execute("UPDATE purchases SET status=%s, received_at=%s WHERE id=%s",
                     (new_status, received_at, purchase_id))
    else:
        cur.execute("UPDATE purchases SET status=%s WHERE id=%s", (new_status, purchase_id))
    conn.commit()
    conn.close()


# ── Fulfillment data loaders (ported from fulfillment.py) ────────────────────


@st.cache_data(ttl=60)
def load_fulfillment_orders() -> list[dict]:
    conn = _conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT o.id, o.status, c.name AS client_name
        FROM orders o JOIN clients c ON o.client_id = c.id
        ORDER BY o.id DESC
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@st.cache_data(ttl=60)
def load_fulfillment_order_items(order_id: int) -> list[dict]:
    conn = _conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT oi.id, oi.quantity, ca.card_number, ca.name, ca.set_code, ca.image_url
        FROM order_items oi
        JOIN cards ca ON oi.card_id = ca.id
        WHERE oi.order_id = %s ORDER BY ca.card_number
    """, (order_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def load_fulfilled_totals(order_id: int) -> dict[int, int]:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT order_item_id, SUM(fulfilled_qty) FROM fulfillment_entries WHERE order_id=%s GROUP BY order_item_id", (order_id,))
    result = {row[0]: int(row[1]) for row in cur.fetchall()}
    conn.close()
    return result


def load_today_fulfillment(order_id: int, fdate: date) -> dict[int, int]:
    conn = _conn()
    cur = conn.cursor()
    cur.execute("SELECT order_item_id, fulfilled_qty FROM fulfillment_entries WHERE order_id=%s AND fulfillment_date=%s", (order_id, fdate))
    result = {row[0]: int(row[1]) for row in cur.fetchall()}
    conn.close()
    return result


def save_fulfillment(order_id: int, fdate: date, entries: list[tuple[int, int]]):
    conn = _conn()
    cur = conn.cursor()
    for order_item_id, qty in entries:
        if qty > 0:
            cur.execute("""
                INSERT INTO fulfillment_entries (order_id, order_item_id, fulfilled_qty, fulfillment_date)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (order_item_id, fulfillment_date)
                DO UPDATE SET fulfilled_qty = EXCLUDED.fulfilled_qty
            """, (order_id, order_item_id, qty, fdate))
        else:
            cur.execute("DELETE FROM fulfillment_entries WHERE order_item_id=%s AND fulfillment_date=%s",
                         (order_item_id, fdate))
    conn.commit()
    conn.close()


def load_fulfillment_history(order_id: int) -> list[dict]:
    conn = _conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT fe.fulfillment_date, fe.fulfilled_qty, ca.sku, ca.set_code
        FROM fulfillment_entries fe
        JOIN order_items oi ON fe.order_item_id = oi.id
        JOIN cards ca ON oi.card_id = ca.id
        WHERE fe.order_id = %s
        ORDER BY fe.fulfillment_date DESC, ca.sku
    """, (order_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def build_history_pdf(order_id: int, client_name: str, items: list[dict], history: list[dict]) -> bytes:
    pdf = FPDF(orientation="L", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.set_margins(10, 10, 10)
    pdf.add_font("jp", "", _JP_FONT)
    pdf.add_font("jp", "B", _JP_FONT)
    pdf.add_page()

    page_w = pdf.w - pdf.l_margin - pdf.r_margin
    pdf.set_font("jp", "B", 18)
    pdf.cell(page_w / 2, 10, f"Fulfillment History — Order #{order_id}")
    pdf.set_font("jp", "", 11)
    total_fulfilled = sum(r["fulfilled_qty"] for r in history)
    total_ordered = sum(item["quantity"] for item in items)
    pdf.cell(page_w / 2, 10, f"Fulfilled: {total_fulfilled} / {total_ordered}", align="R",
             new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Client: {client_name}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    by_date: dict[date, list[dict]] = defaultdict(list)
    for row in history:
        by_date[row["fulfillment_date"]].append(row)

    col_ratios = [0.40, 0.35, 0.25]
    col_w = [page_w * r for r in col_ratios]
    row_h = 7

    def _header(pdf):
        pdf.set_font("jp", "B", 10)
        pdf.set_fill_color(235, 235, 235)
        for w, label in zip(col_w, ["SKU", "Set", "Qty"]):
            pdf.cell(w, row_h, f" {label}", border=1, fill=True)
        pdf.ln()

    for d in sorted(by_date.keys(), reverse=True):
        rows = by_date[d]
        day_total = sum(r["fulfilled_qty"] for r in rows)
        if pdf.get_y() + row_h * 3 + 8 > pdf.h - pdf.b_margin:
            pdf.add_page()
        pdf.set_font("jp", "B", 12)
        pdf.set_fill_color(50, 50, 50)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(0, 8, f"  {d}     {day_total} cards  ({len(rows)} items)",
                 new_x="LMARGIN", new_y="NEXT", fill=True)
        pdf.set_text_color(0, 0, 0)
        _header(pdf)
        pdf.set_font("jp", "", 10)
        for i, r in enumerate(rows):
            if pdf.get_y() + row_h > pdf.h - pdf.b_margin:
                pdf.add_page()
                _header(pdf)
                pdf.set_font("jp", "", 10)
            fill = i % 2 == 1
            if fill:
                pdf.set_fill_color(248, 248, 248)
            pdf.cell(col_w[0], row_h, f" {r['sku'] or '-'}", border="LR", fill=fill)
            pdf.cell(col_w[1], row_h, f" {r['set_code'] or '-'}", border="LR", fill=fill)
            pdf.cell(col_w[2], row_h, f" {r['fulfilled_qty']}", border="LR", fill=fill, align="C")
            pdf.ln()
        pdf.cell(sum(col_w), 0, "", border="T")
        pdf.ln(6)

    pdf.set_font("jp", "", 8)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 5, f"Generated {date.today()}", align="R")
    buf = io.BytesIO()
    pdf.output(buf)
    return buf.getvalue()


@st.cache_data(ttl=60)
def load_to_be_ordered() -> list[dict]:
    """Order items on active orders not yet purchased, minus available stock on hand."""
    conn = _conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # 1. Items without a direct purchase link, with fulfilled qty subtracted
    cur.execute("""
        SELECT oi.id AS order_item_id, oi.order_id, oi.card_id, oi.quantity,
               oi.unit_price, oi.line_total, oi.stock_status,
               (oi.quantity - COALESCE(SUM(fe.fulfilled_qty), 0))::int AS unfulfilled_qty,
               c.card_number, c.name, c.set_code, c.image_url, c.cardrush_url,
               cl.name AS client_name, o.status AS order_status, o.created_at
        FROM order_items oi
        JOIN cards c ON oi.card_id = c.id
        JOIN orders o ON oi.order_id = o.id
        JOIN clients cl ON o.client_id = cl.id
        LEFT JOIN fulfillment_entries fe ON fe.order_item_id = oi.id
        WHERE o.status IN ('confirmed', 'paid', 'ordered')
          AND NOT EXISTS (
              SELECT 1 FROM purchase_items pi WHERE pi.order_item_id = oi.id
          )
        GROUP BY oi.id, c.id, cl.id, o.id
        HAVING oi.quantity - COALESCE(SUM(fe.fulfilled_qty), 0) > 0
        ORDER BY o.created_at, c.card_number
    """)
    items = [dict(r) for r in cur.fetchall()]

    # 2. Stock on hand per card (purchased - fulfilled)
    cur.execute("""
        WITH purchased AS (
            SELECT pi.card_id, SUM(pi.quantity) AS qty
            FROM purchase_items pi
            JOIN purchases p ON p.id = pi.purchase_id
            WHERE p.status IN ('received', 'shipped')
            GROUP BY pi.card_id
        ),
        fulfilled AS (
            SELECT oi.card_id, SUM(fe.fulfilled_qty) AS qty
            FROM fulfillment_entries fe
            JOIN order_items oi ON oi.id = fe.order_item_id
            GROUP BY oi.card_id
        )
        SELECT p.card_id, (p.qty - COALESCE(f.qty, 0))::int AS on_hand
        FROM purchased p
        LEFT JOIN fulfilled f ON f.card_id = p.card_id
        WHERE p.qty - COALESCE(f.qty, 0) > 0
    """)
    stock = {row["card_id"]: row["on_hand"] for row in cur.fetchall()}
    conn.close()

    # 3. Subtract available stock from unfulfilled qty, oldest order first
    remaining_stock: dict[int, int] = dict(stock)
    result = []
    for item in items:
        cid = item["card_id"]
        avail = remaining_stock.get(cid, 0)
        needed = item["unfulfilled_qty"]
        if avail >= needed:
            remaining_stock[cid] = avail - needed
            continue  # fully covered by stock
        qty_to_order = needed - avail
        remaining_stock[cid] = 0
        item["qty_to_order"] = qty_to_order
        result.append(item)

    return result


# ── Page config ──────────────────────────────────────────────────────────────

st.set_page_config(page_title="Admin Dashboard", page_icon="⚙️", layout="wide")

# Alternating row backgrounds for readability
st.markdown("""
<style>
.row-even { background-color: rgba(255,255,255,0.03); padding: 2px 0; border-radius: 4px; }
.row-odd  { background-color: rgba(255,255,255,0.09); padding: 2px 0; border-radius: 4px; }
</style>
""", unsafe_allow_html=True)

st.sidebar.title("Admin Dashboard")
page = st.sidebar.radio("Page", ["Overview", "Orders", "To Be Ordered", "Stock", "Purchases", "Fulfillment", "Fulfillment Status"])


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: OVERVIEW
# ══════════════════════════════════════════════════════════════════════════════

if page == "Overview":
    st.title("Overview")

    kpis = load_overview_kpis()
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Open Orders", kpis["open_orders"])
    c2.metric("Stock On Hand", kpis["stock_on_hand"])
    c3.metric("Purchases Value", f"¥{kpis['purchases_value_jpy']:,}")
    c4.metric("Cards in Catalog", f"{kpis['catalog_count']:,}")

    st.subheader("Recent Orders")
    recent_orders = load_recent_orders()
    if recent_orders:
        df_ro = pd.DataFrame(recent_orders)
        df_ro["total"] = df_ro["total"].apply(_dec)
        st.dataframe(
            df_ro.rename(columns={
                "id": "#", "client": "Client", "status": "Status",
                "total": "Total £", "created_at": "Created", "item_count": "Items",
            }),
            use_container_width=True,
            hide_index=True,
            column_config={"Total £": st.column_config.NumberColumn(format="£%.2f")},
        )
    else:
        st.info("No orders yet.")

    st.subheader("Recent Purchases")
    recent_purchases = load_recent_purchases()
    if recent_purchases:
        df_rp = pd.DataFrame(recent_purchases)
        st.dataframe(
            df_rp.rename(columns={
                "id": "#", "remambo_order_id": "Remambo ID", "supplier": "Supplier",
                "status": "Status", "ordered_at": "Ordered",
                "items_total_jpy": "Items ¥", "service_fee_jpy": "Fee ¥", "shipping_jpy": "Ship ¥",
            }),
            use_container_width=True,
            hide_index=True,
        )
    else:
        st.info("No purchases yet.")


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: ORDERS
# ══════════════════════════════════════════════════════════════════════════════

elif page == "Orders":
    st.title("Orders")

    status_filter = st.multiselect("Filter by status", ALL_STATUSES, default=ALL_STATUSES)
    orders = load_orders_filtered(status_filter) if status_filter else []

    if not orders:
        st.info("No orders match the selected filters.")
    else:
        df_orders = pd.DataFrame(orders)
        df_orders["total"] = df_orders["total"].apply(_dec)
        st.dataframe(
            df_orders.rename(columns={
                "id": "#", "client": "Client", "status": "Status",
                "total": "Total £", "created_at": "Created", "item_count": "Items",
            }),
            use_container_width=True,
            hide_index=True,
            column_config={"Total £": st.column_config.NumberColumn(format="£%.2f")},
        )

        for order in orders:
            oid = order["id"]
            with st.expander(f"Order #{oid} — {order['client']} — {order['status']}"):
                items = load_order_items(oid)
                if items:
                    for item in items:
                        cols = st.columns([0.5, 1, 2.5, 0.8, 0.8, 0.8, 1])
                        img = item.get("image_url") or ""
                        if img:
                            cols[0].image(img, width=40)
                        else:
                            cols[0].text("—")
                        cols[1].text(item["card_number"] or "—")
                        cols[2].text(item["name"] or "—")
                        cols[3].text(str(item["quantity"]))
                        cols[4].text(f"£{_dec(item['unit_price']):.2f}")
                        cols[5].text(f"£{_dec(item['line_total']):.2f}")
                        cols[6].text(item["stock_status"] or "—")
                else:
                    st.caption("No items.")

                # Status transition
                current = order["status"]
                allowed = VALID_TRANSITIONS.get(current, [])
                if allowed:
                    st.divider()
                    tcols = st.columns(len(allowed))
                    for i, next_status in enumerate(allowed):
                        btn_type = "secondary" if next_status == "cancelled" else "primary"
                        if tcols[i].button(
                            f"→ {next_status}",
                            key=f"trans_{oid}_{next_status}",
                            type=btn_type,
                        ):
                            update_order_status(oid, current, next_status)
                            st.success(f"Order #{oid}: {current} → {next_status}")
                            st.cache_data.clear()
                            st.rerun()


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: TO BE ORDERED
# ══════════════════════════════════════════════════════════════════════════════

elif page == "To Be Ordered":
    st.title("To Be Ordered")
    st.caption("Items on confirmed/paid/ordered orders that haven't been purchased yet.")

    tbo_items = load_to_be_ordered()
    if not tbo_items:
        st.success("Nothing to order — all items on active orders are covered by stock or purchases.")
    else:
        df_tbo = pd.DataFrame(tbo_items)
        df_tbo["unit_price"] = df_tbo["unit_price"].apply(_dec)

        # Summary metrics
        m1, m2, m3 = st.columns(3)
        m1.metric("Items to Order", len(df_tbo))
        m2.metric("Total Cards", int(df_tbo["qty_to_order"].sum()))
        total_value = (df_tbo["unit_price"] * df_tbo["qty_to_order"]).sum()
        m3.metric("Total Value", f"£{total_value:.2f}")

        # Group by order
        grouped = df_tbo.groupby("order_id")
        for order_id, group in grouped:
            row0 = group.iloc[0]
            with st.expander(
                f"Order #{order_id} — {row0['client_name']} — {row0['order_status']} — {len(group)} items",
                expanded=True,
            ):
                hdr = st.columns([0.5, 1, 2.5, 1, 0.6, 0.6, 0.8, 1.5])
                for col, label in zip(hdr, ["Img", "Card #", "Name", "Set", "Need", "Ord", "Price", "CardRush"]):
                    col.markdown(f"**{label}**")

                for _, item in group.iterrows():
                    cols = st.columns([0.5, 1, 2.5, 1, 0.6, 0.6, 0.8, 1.5])
                    img = item.get("image_url") or ""
                    if img:
                        cols[0].image(img, width=40)
                    else:
                        cols[0].text("—")
                    cols[1].text(item["card_number"] or "—")
                    cols[2].text(item["name"] or "—")
                    cols[3].text(item["set_code"] or "—")
                    cols[4].text(str(item["qty_to_order"]))
                    cols[5].text(str(item["quantity"]))
                    cols[6].text(f"£{item['unit_price']:.2f}")
                    cr_url = item.get("cardrush_url") or ""
                    if cr_url:
                        cols[7].markdown(f"[Open]({cr_url})")
                    else:
                        cols[7].text("—")


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: STOCK
# ══════════════════════════════════════════════════════════════════════════════

elif page == "Stock":
    st.title("Stock On Hand")

    df_stock = load_stock()
    if df_stock.empty:
        st.info("No stock data — add purchases first.")
    else:
        in_stock_only = st.toggle("In-stock only", value=True)
        if in_stock_only:
            df_stock = df_stock[df_stock["qty_on_hand"] > 0]

        # Summary metrics
        m1, m2, m3 = st.columns(3)
        m1.metric("Unique Cards", len(df_stock))
        m2.metric("Total Purchased", int(df_stock["qty_purchased"].sum()))
        m3.metric("Total On Hand", int(df_stock["qty_on_hand"].sum()))

        st.dataframe(
            df_stock.rename(columns={
                "card_number": "Card #", "name": "Name", "set_code": "Set",
                "condition": "Condition", "qty_purchased": "Purchased",
                "qty_fulfilled": "Fulfilled", "qty_on_hand": "On Hand",
                "image_url": "Image",
            }),
            use_container_width=True,
            hide_index=True,
            column_config={
                "Image": st.column_config.ImageColumn("Image", width="small"),
            },
        )


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: PURCHASES
# ══════════════════════════════════════════════════════════════════════════════

elif page == "Purchases":
    st.title("Purchases")

    purchases = load_purchases_all()
    if not purchases:
        st.info("No purchases recorded yet.")
    else:
        df_p = pd.DataFrame(purchases)
        st.dataframe(
            df_p[["id", "remambo_order_id", "supplier", "parcel_id", "status",
                  "ordered_at", "shipped_at", "received_at",
                  "items_total_jpy", "service_fee_jpy", "shipping_jpy"]].rename(columns={
                "id": "#", "remambo_order_id": "Remambo ID", "supplier": "Supplier",
                "parcel_id": "Parcel", "status": "Status",
                "ordered_at": "Ordered", "shipped_at": "Shipped", "received_at": "Received",
                "items_total_jpy": "Items ¥", "service_fee_jpy": "Fee ¥", "shipping_jpy": "Ship ¥",
            }),
            use_container_width=True,
            hide_index=True,
        )

        for p in purchases:
            pid = p["id"]
            with st.expander(f"Purchase #{pid} — {p['remambo_order_id'] or '—'} — {p['status']}"):
                p_items = load_purchase_items(pid)
                if p_items:
                    for pi in p_items:
                        cols = st.columns([0.5, 1, 2.5, 1, 0.5, 1, 1.5])
                        img = pi.get("image_url") or ""
                        if img:
                            cols[0].image(img, width=40)
                        else:
                            cols[0].text("—")
                        cols[1].text(pi["card_number"] or "—")
                        cols[2].text(pi["name"] or "—")
                        cols[3].text(pi["condition"] or "—")
                        cols[4].text(str(pi["quantity"]))
                        cols[5].text(f"¥{pi['unit_price_jpy']:,}" if pi["unit_price_jpy"] else "—")
                        if pi.get("cardrush_url"):
                            cols[6].markdown(f"[CardRush]({pi['cardrush_url']})")
                        else:
                            cols[6].text("—")
                else:
                    st.caption("No items.")

                # Status update
                current = p["status"]
                allowed = PURCHASE_TRANSITIONS.get(current, [])
                if allowed:
                    st.divider()
                    ucols = st.columns([1, 1, 1])
                    new_status = ucols[0].selectbox("New status", allowed, key=f"pstat_{pid}")

                    ts = None
                    if new_status == "shipped":
                        ts = ucols[1].date_input("Shipped date", value=date.today(), key=f"pship_{pid}")
                    elif new_status == "received":
                        ts = ucols[1].date_input("Received date", value=date.today(), key=f"precv_{pid}")

                    if ucols[2].button("Update", key=f"pupd_{pid}"):
                        kwargs = {}
                        if new_status == "shipped" and ts:
                            kwargs["shipped_at"] = ts
                        elif new_status == "received" and ts:
                            kwargs["received_at"] = ts
                        update_purchase_status(pid, new_status, **kwargs)
                        st.success(f"Purchase #{pid}: {current} → {new_status}")
                        st.cache_data.clear()
                        st.rerun()


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: FULFILLMENT
# ══════════════════════════════════════════════════════════════════════════════

elif page == "Fulfillment":
    st.title("Fulfillment")

    all_orders = load_fulfillment_orders()
    if not all_orders:
        st.warning("No orders found.")
        st.stop()

    order_options = {f"#{o['id']} — {o['client_name']} — {o['status']}": o["id"] for o in all_orders}
    selected_label = st.selectbox("Select Order", list(order_options.keys()))
    selected_order_id = order_options[selected_label]
    selected_order = next(o for o in all_orders if o["id"] == selected_order_id)

    fulfillment_date = st.date_input("Fulfillment Date", value=date.today())

    st.caption(f"Client: **{selected_order['client_name']}** | Status: **{selected_order['status']}**")

    items = load_fulfillment_order_items(selected_order_id)
    if not items:
        st.info("No items in this order.")
        st.stop()

    tab_entry, tab_history = st.tabs(["Enter Fulfillment", "History"])

    # ── Tab 1: Entry ──

    with tab_entry:
        fulfilled_totals = load_fulfilled_totals(selected_order_id)
        today_fulfillment = load_today_fulfillment(selected_order_id, fulfillment_date)

        sorted_items = sorted(items, key=lambda x: x["card_number"] or "")

        with st.form("fulfillment_form", clear_on_submit=False):
            hdr = st.columns([0.5, 1.2, 2.5, 1, 0.7, 1, 1.5])
            for col, label in zip(hdr, ["Img", "Card #", "Name", "Set", "Qty", "Prev", "Today"]):
                col.markdown(f"**{label}**")

            form_values: dict[int, int] = {}
            for idx, item in enumerate(sorted_items):
                item_id = item["id"]
                ordered = item["quantity"]
                prev_fulfilled = fulfilled_totals.get(item_id, 0)
                today_val = today_fulfillment.get(item_id, 0)
                prev_other = prev_fulfilled - today_val
                remaining = max(0, ordered - prev_other)

                row_cls = "row-odd" if idx % 2 else "row-even"
                st.markdown(f'<div class="{row_cls}">', unsafe_allow_html=True)
                cols = st.columns([0.5, 1.2, 2.5, 1, 0.7, 1, 1.5])
                img_url = item.get("image_url") or ""
                if img_url:
                    cols[0].image(img_url, width=40)
                else:
                    cols[0].text("—")
                cols[1].text(item["card_number"] or "—")
                cols[2].text(item["name"] or "—")
                cols[3].text(item["set_code"] or "—")
                cols[4].text(str(ordered))
                cols[5].text(str(prev_other))
                qty = cols[6].number_input(
                    f"qty_{item_id}", min_value=0, max_value=remaining,
                    value=min(today_val, remaining), label_visibility="collapsed",
                    key=f"ff_{item_id}",
                )
                st.markdown('</div>', unsafe_allow_html=True)
                form_values[item_id] = qty

            submitted = st.form_submit_button("Save Fulfillment", type="primary")

        if submitted:
            save_fulfillment(selected_order_id, fulfillment_date, list(form_values.items()))
            st.success(f"Saved fulfillment for {fulfillment_date}!")
            st.cache_data.clear()
            st.rerun()

    # ── Tab 2: History ──

    with tab_history:
        history = load_fulfillment_history(selected_order_id)
        if not history:
            st.info("No fulfillment history for this order yet.")
        else:
            by_date: dict[date, list[dict]] = defaultdict(list)
            for row in history:
                by_date[row["fulfillment_date"]].append(row)

            total_fulfilled = sum(r["fulfilled_qty"] for r in history)
            total_ordered = sum(item["quantity"] for item in items)
            st.metric("Total Fulfilled / Ordered", f"{total_fulfilled} / {total_ordered}")

            pdf_bytes = build_history_pdf(selected_order_id, selected_order["client_name"], items, history)
            st.download_button("Download PDF", data=pdf_bytes,
                               file_name=f"fulfillment_order_{selected_order_id}.pdf",
                               mime="application/pdf")

            dates = sorted(by_date.keys(), reverse=True)
            for d in dates:
                rows = by_date[d]
                day_total = sum(r["fulfilled_qty"] for r in rows)
                with st.expander(f"{d}  —  {day_total} cards  ({len(rows)} items)", expanded=(d == dates[0])):
                    hdr = st.columns([3, 1.5, 1])
                    hdr[0].markdown("**SKU**")
                    hdr[1].markdown("**Set**")
                    hdr[2].markdown("**Qty**")
                    for ri, r in enumerate(rows):
                        row_cls = "row-odd" if ri % 2 else "row-even"
                        st.markdown(f'<div class="{row_cls}">', unsafe_allow_html=True)
                        cols = st.columns([3, 1.5, 1])
                        cols[0].text(r["sku"] or "—")
                        cols[1].text(r["set_code"] or "—")
                        cols[2].text(str(r["fulfilled_qty"]))
                        st.markdown('</div>', unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: FULFILLMENT STATUS
# ══════════════════════════════════════════════════════════════════════════════

elif page == "Fulfillment Status":
    st.title("Fulfillment Status")
    st.caption("All order items on active orders with fulfillment progress.")

    @st.cache_data(ttl=60)
    def load_fulfillment_status():
        conn = _conn()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT
                oi.id AS item_id,
                oi.order_id,
                o.status AS order_status,
                cl.name AS client,
                c.card_number,
                c.name AS card_name,
                c.set_code,
                c.image_url,
                oi.quantity AS ordered_qty,
                COALESCE(SUM(fe.fulfilled_qty), 0)::int AS fulfilled_qty,
                (oi.quantity - COALESCE(SUM(fe.fulfilled_qty), 0))::int AS remaining_qty,
                oi.unit_price,
                oi.line_total
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN clients cl ON cl.id = o.client_id
            JOIN cards c ON c.id = oi.card_id
            LEFT JOIN fulfillment_entries fe ON fe.order_item_id = oi.id
            WHERE o.status IN ('confirmed', 'paid', 'ordered', 'shipped')
              AND oi.removed_at IS NULL
            GROUP BY oi.id, o.id, cl.id, c.id
            ORDER BY o.id, c.card_number
        """)
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows

    all_items = load_fulfillment_status()

    if not all_items:
        st.info("No active order items to show.")
    else:
        fulfilled = [i for i in all_items if i["remaining_qty"] <= 0]
        unfulfilled = [i for i in all_items if i["remaining_qty"] > 0]

        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Total Items", len(all_items))
        m2.metric("Fulfilled", len(fulfilled))
        m3.metric("Unfulfilled", len(unfulfilled))
        total_cards_remaining = sum(i["remaining_qty"] for i in unfulfilled)
        m4.metric("Cards Remaining", total_cards_remaining)

        tab_unf, tab_ful = st.tabs([f"Unfulfilled ({len(unfulfilled)})", f"Fulfilled ({len(fulfilled)})"])

        def _items_table(items_list):
            if not items_list:
                st.info("None.")
                return
            df = pd.DataFrame(items_list)
            df["unit_price"] = df["unit_price"].apply(_dec)
            df["line_total"] = df["line_total"].apply(_dec)
            st.dataframe(
                df[["order_id", "client", "order_status", "card_number", "card_name",
                    "set_code", "ordered_qty", "fulfilled_qty", "remaining_qty",
                    "unit_price", "image_url"]].rename(columns={
                    "order_id": "Order #",
                    "client": "Client",
                    "order_status": "Status",
                    "card_number": "Card #",
                    "card_name": "Name",
                    "set_code": "Set",
                    "ordered_qty": "Ordered",
                    "fulfilled_qty": "Fulfilled",
                    "remaining_qty": "Remaining",
                    "unit_price": "Unit £",
                    "image_url": "Image",
                }),
                use_container_width=True,
                hide_index=True,
                column_config={
                    "Unit £": st.column_config.NumberColumn(format="£%.2f"),
                    "Image": st.column_config.ImageColumn("Image", width="small"),
                },
            )

        with tab_unf:
            order_filter = st.multiselect(
                "Filter by order",
                sorted(set(i["order_id"] for i in unfulfilled)),
                key="unf_order_filter",
            )
            filtered = [i for i in unfulfilled if i["order_id"] in order_filter] if order_filter else unfulfilled
            _items_table(filtered)

        with tab_ful:
            _items_table(fulfilled)


# ── Refresh ──────────────────────────────────────────────────────────────────

st.sidebar.divider()
if st.sidebar.button("Refresh Data"):
    st.cache_data.clear()
    st.rerun()
