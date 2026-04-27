"""Wholesale Database Dashboard — Streamlit viewer for RDS card data."""

import os
import psycopg2
import psycopg2.extras
import pandas as pd
import streamlit as st

DATABASE_URL = "postgresql://postgres:Rzqku6Og7qqogZkzb1gPSVvn@tcg-wholesale.cn4c2su0o42n.us-east-1.rds.amazonaws.com:5432/wholesale?sslmode=require"


# ── Data loaders ────────────────────────────────────────────────────────────

@st.cache_data(ttl=30)
def load_cards() -> pd.DataFrame:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT
            c.id, c.sku, c.card_number, c.name, c.set_code, c.set_name,
            c.cardrush_jpy, c.gbp_jpy_rate, c.base_gbp, c.price,
            c.image_url, c.cardrush_url, c.last_synced_at,
            c.category, c.product_type
        FROM cards c
        ORDER BY c.set_code, c.card_number, c.sku
    """)
    rows = cur.fetchall()
    conn.close()
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows)


@st.cache_data(ttl=30)
def load_sets() -> pd.DataFrame:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, code, name FROM sets ORDER BY code")
    rows = cur.fetchall()
    conn.close()
    return pd.DataFrame(rows)


@st.cache_data(ttl=30)
def load_price_history() -> pd.DataFrame:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT ph.card_id, ph.date, ph.cardrush_jpy, ph.gbp_jpy_rate,
               c.sku, c.name, c.set_code
        FROM price_history ph
        JOIN cards c ON c.id = ph.card_id
        ORDER BY ph.date DESC, c.sku
    """)
    rows = cur.fetchall()
    conn.close()
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows)


@st.cache_data(ttl=30)
def load_db_stats() -> dict:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    stats = {}
    for table in ["cards", "sets", "games", "price_history"]:
        cur.execute(f"SELECT count(*) FROM {table}")
        stats[table] = cur.fetchone()[0]
    cur.execute("SELECT min(last_synced_at), max(last_synced_at) FROM cards WHERE last_synced_at IS NOT NULL")
    row = cur.fetchone()
    stats["first_sync"] = row[0]
    stats["last_sync"] = row[1]
    conn.close()
    return stats


# ── Page config ─────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="Wholesale Database",
    page_icon="🗄️",
    layout="wide",
)

st.title("Wholesale Database")

# ── DB stats ────────────────────────────────────────────────────────────────

stats = load_db_stats()

col1, col2, col3, col4 = st.columns(4)
col1.metric("Cards", f"{stats['cards']:,}")
col2.metric("Sets", stats["sets"])
col3.metric("Price History", f"{stats['price_history']:,}")
col4.metric("Last Sync", str(stats["last_sync"])[:19] if stats["last_sync"] else "Never")

if stats["cards"] == 0:
    st.warning("No cards in database yet. The scraper may still be running.")
    st.stop()

# ── Load data ───────────────────────────────────────────────────────────────

df = load_cards()

# Cast Decimal columns to float
for col in ["base_gbp", "price"]:
    if col in df.columns:
        df[col] = df[col].apply(lambda x: float(x) if x is not None else None)

# Price already includes VAT
df["price_inc_vat"] = df["price"]

# Detect parallel from SKU suffix (-P1, -P2, etc.)
df["is_parallel"] = df["sku"].str.contains(r"-P\d+$", regex=True)
df["type"] = df["is_parallel"].map({True: "Parallel", False: "Standard"})

# ── Sidebar filters ─────────────────────────────────────────────────────────

st.sidebar.header("Filters")

# Set filter
all_sets = sorted(df["set_code"].dropna().unique())
selected_sets = st.sidebar.multiselect("Set", all_sets, default=all_sets)

# Type filter
type_filter = st.sidebar.multiselect("Type", ["Standard", "Parallel"], default=["Standard", "Parallel"])

# Price range
min_jpy = int(df["cardrush_jpy"].min()) if df["cardrush_jpy"].notna().any() else 0
max_jpy = int(df["cardrush_jpy"].max()) if df["cardrush_jpy"].notna().any() else 10000
price_range = st.sidebar.slider(
    "JPY Price Range",
    min_value=min_jpy,
    max_value=max_jpy,
    value=(min_jpy, max_jpy),
)

# Search
search = st.sidebar.text_input("Search (name/SKU/card #)")

# Apply filters
mask = (
    df["set_code"].isin(selected_sets)
    & df["type"].isin(type_filter)
    & df["cardrush_jpy"].between(price_range[0], price_range[1])
)
if search:
    search_lower = search.lower()
    mask = mask & (
        df["name"].str.lower().str.contains(search_lower, na=False)
        | df["sku"].str.lower().str.contains(search_lower, na=False)
        | df["card_number"].str.lower().str.contains(search_lower, na=False)
    )

filtered = df[mask]

st.caption(f"Showing {len(filtered):,} of {len(df):,} cards")

# ── Set summary ─────────────────────────────────────────────────────────────

st.subheader("Cards by Set")

set_summary = (
    filtered.groupby("set_code")
    .agg(
        Cards=("sku", "size"),
        Standard=("is_parallel", lambda x: (~x).sum()),
        Parallel=("is_parallel", "sum"),
        Min_JPY=("cardrush_jpy", "min"),
        Max_JPY=("cardrush_jpy", "max"),
        Avg_GBP=("price", "mean"),
        Total_GBP=("price", "sum"),
    )
    .sort_index()
)

st.dataframe(
    set_summary.style.format({
        "Min_JPY": "¥{:,.0f}",
        "Max_JPY": "¥{:,.0f}",
        "Avg_GBP": "£{:.2f}",
        "Total_GBP": "£{:.2f}",
        "Parallel": "{:.0f}",
    }),
    use_container_width=True,
)

# ── Card table ──────────────────────────────────────────────────────────────

st.subheader("Card Catalog")

display = filtered[[
    "image_url", "sku", "card_number", "name", "set_code", "type",
    "cardrush_jpy", "price", "price_inc_vat", "cardrush_url",
]].copy()

display.columns = [
    "Image", "SKU", "Card #", "Name", "Set", "Type",
    "JPY (tax-inc)", "GBP Ex-VAT", "GBP Inc-VAT", "CardRush",
]

st.dataframe(
    display.style.format({
        "JPY (tax-inc)": "¥{:,.0f}",
        "GBP Ex-VAT": "£{:.2f}",
        "GBP Inc-VAT": "£{:.2f}",
    }),
    use_container_width=True,
    height=600,
    column_config={
        "Image": st.column_config.ImageColumn("Image", width="small"),
        "CardRush": st.column_config.LinkColumn("CardRush", display_text="View"),
    },
)

# ── Price distribution ──────────────────────────────────────────────────────

st.subheader("Price Distribution")

chart_col1, chart_col2 = st.columns(2)

with chart_col1:
    st.caption("Avg GBP by Set")
    set_avg = filtered.groupby("set_code")["price"].mean().sort_values(ascending=False)
    st.bar_chart(set_avg, x_label="Set", y_label="Avg GBP Ex-VAT")

with chart_col2:
    st.caption("Card Count by Set")
    set_count = filtered.groupby("set_code")["sku"].count().sort_index()
    st.bar_chart(set_count, x_label="Set", y_label="Cards")

# ── Price history ───────────────────────────────────────────────────────────

st.subheader("Price History")

ph = load_price_history()

if ph.empty:
    st.info("No price history yet. History builds up over daily scrapes.")
else:
    st.metric("Total Records", f"{len(ph):,}")

    # Date range
    dates = sorted(ph["date"].unique())
    st.caption(f"Dates: {dates[0]} to {dates[-1]} ({len(dates)} day(s))")

    # Pick a card to see history
    ph_sets = sorted(ph["set_code"].dropna().unique())
    ph_set = st.selectbox("Set (price history)", ph_sets)
    ph_filtered = ph[ph["set_code"] == ph_set]

    cards_in_set = sorted(ph_filtered["sku"].unique())
    ph_card = st.selectbox("Card", cards_in_set)

    card_history = ph_filtered[ph_filtered["sku"] == ph_card].sort_values("date")
    if len(card_history) > 1:
        st.line_chart(card_history.set_index("date")["cardrush_jpy"], x_label="Date", y_label="JPY")
    else:
        st.dataframe(card_history[["date", "cardrush_jpy", "gbp_jpy_rate"]], use_container_width=True)

# ── Refresh ─────────────────────────────────────────────────────────────────

st.divider()
if st.button("Refresh Data"):
    st.cache_data.clear()
    st.rerun()
