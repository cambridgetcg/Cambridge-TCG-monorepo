"""Order Fulfillment Tool — Enter fulfilled quantities, persist to DB, print clean forms."""

import io
import os
import unicodedata
from collections import defaultdict
from datetime import date

import psycopg2
import psycopg2.extras
import streamlit as st
from fpdf import FPDF


def _trunc(text: str, max_width: int) -> str:
    """Truncate text to max_width display columns (CJK chars count as 2)."""
    w = 0
    for i, ch in enumerate(text):
        w += 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
        if w > max_width:
            return text[:i] + "…"
    return text

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required.")


# ── Ensure table exists ────────────────────────────────────────────────────

def ensure_table():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fulfillment_entries (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL REFERENCES orders(id),
            order_item_id INTEGER NOT NULL REFERENCES order_items(id),
            fulfilled_qty INTEGER NOT NULL,
            fulfillment_date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(order_item_id, fulfillment_date)
        )
    """)
    conn.commit()
    conn.close()


# ── Data loaders (cached to avoid re-querying on every rerun) ─────────────

@st.cache_data(ttl=60)
def load_orders() -> list[dict]:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT o.id, o.status, c.name AS client_name
        FROM orders o
        JOIN clients c ON o.client_id = c.id
        ORDER BY o.id DESC
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@st.cache_data(ttl=60)
def load_order_items(order_id: int) -> list[dict]:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT oi.id, oi.quantity, ca.card_number, ca.name, ca.set_code, ca.image_url
        FROM order_items oi
        JOIN cards ca ON oi.card_id = ca.id
        WHERE oi.order_id = %s
        ORDER BY ca.card_number
    """, (order_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@st.cache_data(ttl=60)
def load_condition_urls_all() -> dict:
    """Load all Mint and A- CardRush URLs, keyed by (card_number, name)."""
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT DISTINCT ON (cp.card_number, cp.name, cp.condition)
            cp.card_number, cp.name, cp.condition, cp.cardrush_url
        FROM condition_prices cp
        WHERE cp.condition IN ('Mint', '状態A-')
        ORDER BY cp.card_number, cp.name, cp.condition, cp.snapshot_date DESC
    """)
    result: dict = {}
    for row in cur.fetchall():
        key = f"{row['card_number']}||{row['name']}"
        if key not in result:
            result[key] = {}
        label = "mint" if row["condition"] == "Mint" else "a_minus"
        result[key][label] = row["cardrush_url"]
    conn.close()
    return result


def load_fulfillment_history(order_id: int) -> list[dict]:
    """Load all fulfillment entries for an order, joined with card info."""
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT fe.fulfillment_date, fe.fulfilled_qty, fe.created_at,
               ca.card_number, ca.sku, ca.set_code
        FROM fulfillment_entries fe
        JOIN order_items oi ON fe.order_item_id = oi.id
        JOIN cards ca ON oi.card_id = ca.id
        WHERE fe.order_id = %s
        ORDER BY fe.fulfillment_date DESC, ca.card_number
    """, (order_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def load_fulfilled_totals(order_id: int) -> dict[int, int]:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("""
        SELECT order_item_id, SUM(fulfilled_qty)
        FROM fulfillment_entries
        WHERE order_id = %s
        GROUP BY order_item_id
    """, (order_id,))
    result = {row[0]: int(row[1]) for row in cur.fetchall()}
    conn.close()
    return result


def load_today_fulfillment(order_id: int, fulfillment_date: date) -> dict[int, int]:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("""
        SELECT order_item_id, fulfilled_qty
        FROM fulfillment_entries
        WHERE order_id = %s AND fulfillment_date = %s
    """, (order_id, fulfillment_date))
    result = {row[0]: int(row[1]) for row in cur.fetchall()}
    conn.close()
    return result


def save_fulfillment(order_id: int, fulfillment_date: date, entries: list[tuple[int, int]]):
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    for order_item_id, qty in entries:
        if qty > 0:
            cur.execute("""
                INSERT INTO fulfillment_entries (order_id, order_item_id, fulfilled_qty, fulfillment_date)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (order_item_id, fulfillment_date)
                DO UPDATE SET fulfilled_qty = EXCLUDED.fulfilled_qty
            """, (order_id, order_item_id, qty, fulfillment_date))
        else:
            cur.execute("""
                DELETE FROM fulfillment_entries
                WHERE order_item_id = %s AND fulfillment_date = %s
            """, (order_item_id, fulfillment_date))
    conn.commit()
    conn.close()


# Japanese font (Noto Sans JP — standalone TTF, reliable across pages)
import os as _os
_JP_FONT = _os.path.join(_os.path.dirname(__file__), "fonts", "NotoSansJP.ttf")


def build_history_pdf(
    order_id: int,
    client_name: str,
    items: list[dict],
    history: list[dict],
) -> bytes:
    """Generate a print-optimised A4 landscape PDF of fulfillment history."""
    pdf = FPDF(orientation="L", format="A4")  # Landscape for wide tables
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.set_margins(10, 10, 10)

    # Register Japanese font (same file for regular + bold; fpdf2 simulates bold)
    pdf.add_font("jp", "", _JP_FONT)
    pdf.add_font("jp", "B", _JP_FONT)

    pdf.add_page()

    # ── Header ──
    page_w = pdf.w - pdf.l_margin - pdf.r_margin  # usable width

    pdf.set_font("jp", "B", 18)
    pdf.cell(page_w / 2, 10, f"Fulfillment History — Order #{order_id}")
    pdf.set_font("jp", "", 11)
    total_fulfilled = sum(r["fulfilled_qty"] for r in history)
    total_ordered = sum(item["quantity"] for item in items)
    pdf.cell(page_w / 2, 10, f"Fulfilled: {total_fulfilled} / {total_ordered}", align="R", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("jp", "", 11)
    pdf.cell(0, 6, f"Client: {client_name}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # ── Group by date ──
    by_date: dict[date, list[dict]] = defaultdict(list)
    for row in history:
        by_date[row["fulfillment_date"]].append(row)

    # Column widths — scale to full page width
    # Card # | SKU | Set | Qty
    col_ratios = [0.14, 0.62, 0.12, 0.12]
    col_w = [page_w * r for r in col_ratios]
    row_h = 7

    def _draw_table_header(pdf, col_w, row_h):
        """Draw the column header row."""
        pdf.set_font("jp", "B", 10)
        pdf.set_fill_color(235, 235, 235)
        for w, label in zip(col_w, ["Card #", "SKU", "Set", "Qty"]):
            pdf.cell(w, row_h, f" {label}", border=1, fill=True)
        pdf.ln()

    for d in sorted(by_date.keys(), reverse=True):
        rows = by_date[d]
        day_total = sum(r["fulfilled_qty"] for r in rows)

        # Ensure at least the date bar + header + 1 row fit; otherwise new page
        min_needed = row_h * 3 + 8
        if pdf.get_y() + min_needed > pdf.h - pdf.b_margin:
            pdf.add_page()

        # Date header bar
        pdf.set_font("jp", "B", 12)
        pdf.set_fill_color(50, 50, 50)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(0, 8, f"  {d}     {day_total} cards  ({len(rows)} items)", new_x="LMARGIN", new_y="NEXT", fill=True)
        pdf.set_text_color(0, 0, 0)

        _draw_table_header(pdf, col_w, row_h)

        # Table rows — flow across pages naturally
        pdf.set_font("jp", "", 10)
        for i, r in enumerate(rows):
            # Page break if this row won't fit — re-draw header on new page
            if pdf.get_y() + row_h > pdf.h - pdf.b_margin:
                pdf.add_page()
                _draw_table_header(pdf, col_w, row_h)
                pdf.set_font("jp", "", 10)

            card_num = r["card_number"] or "-"
            sku = r["sku"] or "-"
            set_code = r["set_code"] or "-"
            qty = str(r["fulfilled_qty"])

            # Truncate long SKU
            max_name_w = col_w[1] - 4
            if pdf.get_string_width(sku) > max_name_w:
                while pdf.get_string_width(sku + "...") > max_name_w and len(sku) > 0:
                    sku = sku[:-1]
                sku += "..."

            # Alternate row colour
            if i % 2 == 1:
                pdf.set_fill_color(248, 248, 248)
                fill = True
            else:
                fill = False

            pdf.cell(col_w[0], row_h, f" {card_num}", border="LR", fill=fill)
            pdf.cell(col_w[1], row_h, f" {sku}", border="LR", fill=fill)
            pdf.cell(col_w[2], row_h, f" {set_code}", border="LR", fill=fill)
            pdf.cell(col_w[3], row_h, f" {qty}", border="LR", fill=fill, align="C")
            pdf.ln()

        # Bottom border for last row
        pdf.cell(sum(col_w), 0, "", border="T")
        pdf.ln(6)

    # ── Footer with generation timestamp ──
    pdf.set_font("jp", "", 8)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 5, f"Generated {date.today()}", align="R")

    buf = io.BytesIO()
    pdf.output(buf)
    return buf.getvalue()


# ── Page config ────────────────────────────────────────────────────────────

st.set_page_config(page_title="Order Fulfillment", page_icon="📦", layout="wide")

ensure_table()

# ── CSS ────────────────────────────────────────────────────────────────────

st.markdown("""
<style>
@media print {
    /* Hide everything by default */
    .main .block-container > * { display: none !important; }
    header, footer, [data-testid="stSidebar"], [data-testid="stToolbar"],
    [data-testid="stDecoration"], [data-testid="stStatusWidget"],
    [data-testid="stHeader"] {
        display: none !important;
    }
    /* Show only the print-form container and its parents */
    .main .block-container { padding: 0 !important; max-width: 100% !important; }
    .main .block-container .print-form,
    .main .block-container .print-form * {
        display: revert !important;
    }
    /* Walk up: ensure parent stMarkdown containers are visible */
    .main .block-container [data-testid="stMarkdownContainer"]:has(.print-form),
    .main .block-container [data-testid="stVerticalBlock"]:has(.print-form),
    .main .block-container div:has(> .print-form),
    .main .block-container div:has(.print-form) {
        display: block !important;
    }
    .print-form { font-family: monospace; font-size: 14px; }
    .print-form table { width: 100%; border-collapse: collapse; }
    .print-form th, .print-form td { border: 1px solid #000; padding: 4px 8px; text-align: left; }
}
.print-form { margin-top: 1rem; }
.print-form table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
.print-form th, .print-form td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
.print-form th { background: #f0f0f0; }

/* Clickable image lightbox */
.thumb-link img { cursor: zoom-in; border-radius: 3px; transition: opacity 0.15s; }
.thumb-link img:hover { opacity: 0.75; }
.lightbox-overlay {
    display: none; position: fixed; z-index: 9999;
    top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0,0,0,0.7); justify-content: center; align-items: center; cursor: zoom-out;
}
.lightbox-overlay img { width: 400px; border-radius: 8px; box-shadow: 0 4px 30px rgba(0,0,0,0.5); }
.lightbox-overlay:target { display: flex; }

/* Zebra-stripe rows in form and history expanders */
[data-testid="stForm"] [data-testid="stVerticalBlock"] > [data-testid="stLayoutWrapper"]:nth-child(even),
[data-testid="stForm"] [data-testid="stVerticalBlock"] > [data-testid="stLayoutWrapper"]:nth-child(even) *:not(input):not(button) {
    background-color: #e2e8f0 !important;
}
[data-testid="stExpanderDetails"] [data-testid="stVerticalBlock"] > [data-testid="stLayoutWrapper"]:nth-child(even),
[data-testid="stExpanderDetails"] [data-testid="stVerticalBlock"] > [data-testid="stLayoutWrapper"]:nth-child(even) *:not(input):not(button) {
    background-color: #e2e8f0 !important;
}
</style>
""", unsafe_allow_html=True)


# ── Sidebar ────────────────────────────────────────────────────────────────

st.sidebar.header("Order Fulfillment")

ALL_STATUSES = ["submitted", "quoted", "confirmed", "paid", "ordered", "shipped", "delivered", "cancelled"]
status_filter = st.sidebar.multiselect("Status filter", ALL_STATUSES, default=ALL_STATUSES)

all_orders = load_orders()
orders = [o for o in all_orders if o["status"] in status_filter] if status_filter else all_orders

if not orders:
    st.warning("No orders found.")
    st.stop()

order_options = {f"#{o['id']} — {o['client_name']} — {o['status']}": o["id"] for o in orders}
selected_label = st.sidebar.selectbox("Select Order", list(order_options.keys()))
selected_order_id = order_options[selected_label]

fulfillment_date = st.sidebar.date_input("Fulfillment Date", value=date.today())

sort_by = st.sidebar.radio("Sort by", ["Card #", "Set"], horizontal=True)

# Find the selected order info
selected_order = next(o for o in orders if o["id"] == selected_order_id)


# ── Main area ──────────────────────────────────────────────────────────────

st.title(f"Fulfillment — Order #{selected_order_id}")
st.caption(f"Client: **{selected_order['client_name']}** | Status: **{selected_order['status']}**")

items = load_order_items(selected_order_id)

if not items:
    st.info("No items in this order.")
    st.stop()

tab_entry, tab_history = st.tabs(["Enter Fulfillment", "History"])

# ── Tab 1: Enter Fulfillment ──────────────────────────────────────────────

with tab_entry:
    fulfilled_totals = load_fulfilled_totals(selected_order_id)
    today_fulfillment = load_today_fulfillment(selected_order_id, fulfillment_date)

    condition_urls = load_condition_urls_all()

    # Sort items
    if sort_by == "Set":
        sorted_items = sorted(items, key=lambda x: (x["set_code"] or "", x["card_number"] or ""))
    else:
        sorted_items = sorted(items, key=lambda x: x["card_number"] or "")

    st.subheader("Order Items")

    with st.form("fulfillment_form", clear_on_submit=False):
        hdr = st.columns([0.5, 1.2, 2.5, 1, 0.7, 1, 0.6, 0.6, 1.5])
        for col, label in zip(hdr, ["Img", "Card #", "Card Name", "Set", "Qty", "Prev", "Mint", "A-", "Today"]):
            col.markdown(f"**{label}**")

        form_values: dict[int, int] = {}

        for item in sorted_items:
            item_id = item["id"]
            ordered = item["quantity"]
            prev_fulfilled = fulfilled_totals.get(item_id, 0)
            today_val = today_fulfillment.get(item_id, 0)
            prev_other = prev_fulfilled - today_val
            remaining = max(0, ordered - prev_other)

            cond_key = f"{item['card_number']}||{item['name']}"
            urls = condition_urls.get(cond_key, {})

            cols = st.columns([0.5, 1.2, 2.5, 1, 0.7, 1, 0.6, 0.6, 1.5])

            # Image thumbnail with click-to-expand lightbox
            img_url = item.get("image_url") or ""
            if img_url:
                lid = f"lb-{item_id}"
                cols[0].markdown(
                    f'<a class="thumb-link" href="#{lid}"><img src="{img_url}" width="40"></a>'
                    f'<a href="#" id="{lid}" class="lightbox-overlay"><img src="{img_url}"></a>',
                    unsafe_allow_html=True,
                )
            else:
                cols[0].text("—")

            cols[1].text(item["card_number"] or "—")
            cols[2].text(_trunc(item["name"] or "—", 26))
            cols[3].text(item["set_code"] or "—")
            cols[4].text(str(ordered))
            cols[5].text(str(prev_other))

            mint_url = urls.get("mint")
            cols[6].markdown(f"[Mint]({mint_url})" if mint_url else "—")

            am_url = urls.get("a_minus")
            cols[7].markdown(f"[A-]({am_url})" if am_url else "—")

            qty = cols[8].number_input(
                f"qty_{item_id}",
                min_value=0,
                max_value=remaining,
                value=min(today_val, remaining),
                label_visibility="collapsed",
                key=f"fulfill_{item_id}",
            )
            form_values[item_id] = qty

        submitted = st.form_submit_button("Save Fulfillment", type="primary")

    if submitted:
        entries = list(form_values.items())
        save_fulfillment(selected_order_id, fulfillment_date, entries)
        st.success(f"Saved fulfillment for {fulfillment_date}!")
        st.rerun()

    # ── Print view ─────────────────────────────────────────────────────────

    st.divider()

    print_rows = [
        (item["card_number"] or "—", form_values[item["id"]])
        for item in sorted_items
        if form_values.get(item["id"], 0) > 0
    ]

    if print_rows:
        st.subheader("Print Fulfillment Form")

        table_rows = "".join(f"<tr><td>{card}</td><td>{qty}</td></tr>" for card, qty in print_rows)
        st.markdown(f"""
        <div class="print-form">
            <h3>Fulfillment Form</h3>
            <p><strong>Order:</strong> #{selected_order_id} &nbsp; | &nbsp;
               <strong>Client:</strong> {selected_order['client_name']} &nbsp; | &nbsp;
               <strong>Date:</strong> {fulfillment_date}</p>
            <table>
                <thead><tr><th>Card #</th><th>Qty</th></tr></thead>
                <tbody>{table_rows}</tbody>
            </table>
        </div>
        """, unsafe_allow_html=True)

        st.components.v1.html(
            '<button onclick="window.top.print()" style="'
            'padding:8px 24px; font-size:16px; cursor:pointer; '
            'background:#ff4b4b; color:white; border:none; border-radius:8px;'
            '">Print Fulfillment Form</button>',
            height=50,
        )
    else:
        st.caption("No items to print — save fulfillment quantities first.")

# ── Tab 2: History ────────────────────────────────────────────────────────

with tab_history:
    history = load_fulfillment_history(selected_order_id)

    if not history:
        st.info("No fulfillment history for this order yet.")
    else:
        # Summary by date
        by_date: dict[date, list[dict]] = defaultdict(list)
        for row in history:
            by_date[row["fulfillment_date"]].append(row)

        dates = sorted(by_date.keys(), reverse=True)
        total_fulfilled = sum(r["fulfilled_qty"] for r in history)
        total_ordered = sum(item["quantity"] for item in items)

        st.metric("Total Fulfilled / Ordered", f"{total_fulfilled} / {total_ordered}")

        # PDF download
        pdf_bytes = build_history_pdf(selected_order_id, selected_order["client_name"], items, history)
        st.download_button(
            "Download PDF",
            data=pdf_bytes,
            file_name=f"fulfillment_order_{selected_order_id}.pdf",
            mime="application/pdf",
        )

        for d in dates:
            rows = by_date[d]
            day_total = sum(r["fulfilled_qty"] for r in rows)
            with st.expander(f"{d}  —  {day_total} cards  ({len(rows)} items)", expanded=(d == dates[0])):
                hdr = st.columns([1.5, 3, 1.5, 1])
                hdr[0].markdown("**Card #**")
                hdr[1].markdown("**SKU**")
                hdr[2].markdown("**Set**")
                hdr[3].markdown("**Qty**")

                for r in rows:
                    cols = st.columns([1.5, 3, 1.5, 1])
                    cols[0].text(r["card_number"] or "—")
                    cols[1].text(r["sku"] or "—")
                    cols[2].text(r["set_code"] or "—")
                    cols[3].text(str(r["fulfilled_qty"]))
