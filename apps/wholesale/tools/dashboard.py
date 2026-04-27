"""CardRush Scrape Dashboard — Streamlit viewer for wholesale data."""

import json
import glob
import os
import re
import pandas as pd
import streamlit as st

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "cardrush")
WHOLESALE_DIR = os.path.join(DATA_DIR, "wholesale")
RAW_DIR = os.path.join(DATA_DIR, "raw")


# ── Promo categorization ────────────────────────────────────────────────────

def classify_promo(name: str, sku: str, card_number: str) -> str:
    """Classify a promo card by its source based on name keywords."""
    if "CS" in name and re.search(r"CS\d{2}", name):
        return "Championship (CS)"
    if "シリアル" in name:
        return "Serial Numbered"
    if "コンパス" in name:
        return "Compass Art (Flagship)"
    if "フルアート" in name:
        return "Full Art"
    if "漫画" in name or "コミック" in name:
        return "Manga/Comic Art"
    if card_number.startswith("P-"):
        return "True Promo (P-xxx)"
    if sku.startswith("ST-"):
        return "Alt Art (Starter)"
    if sku.startswith(("OP-", "EB-")):
        return "Alt Art (Booster)"
    return "Other"


# ── Data loaders ────────────────────────────────────────────────────────────

@st.cache_data
def load_wholesale(path: str) -> pd.DataFrame:
    with open(path) as f:
        cards = json.load(f)

    is_promo = "PROMO" in os.path.basename(path).upper()

    rows = []
    for c in cards:
        sku = c["sku"]
        image_url = c.get("imageUrl") or ""

        row = {
            "Image": image_url,
            "SKU": sku,
            "Card #": c["cardNumber"],
            "Name": c["name"],
            "Rarity": c.get("rarity") or "—",
            "Type": "Parallel" if c["isParallel"] else "Standard",
            "JPY (税込)": c["cardrushJpy"],
            "GBP Price": c["pricing"]["price"],
            "Base GBP": c["pricing"]["baseGbp"],
            "Landed": c["pricing"]["landedCost"],
            "Margin": c["pricing"]["margin"],
            "Stock": c.get("stock", -1),
            "URL": c.get("cardrushUrl") or "",
        }

        if is_promo:
            row["Category"] = classify_promo(c["name"], sku, c["cardNumber"])
            # Extract parent set from card number (e.g. OP09-050 → OP09)
            m = re.match(r"((?:OP|ST|EB|PRB)\d{2})", c["cardNumber"])
            row["Parent Set"] = m.group(1) if m else "P (Promo)"

        rows.append(row)

    return pd.DataFrame(rows)


@st.cache_data
def load_raw(path: str) -> pd.DataFrame:
    with open(path) as f:
        products = json.load(f)

    rows = []
    for p in products:
        rows.append(
            {
                "Card #": p.get("cardNumber") or "—",
                "Name": p["name"],
                "JPY": p["priceJpy"],
                "Rarity": p.get("rarity") or "—",
                "Stock": p.get("stock", -1),
                "Condition": p.get("condition") or "—",
                "Parallel": p["isParallel"],
            }
        )
    return pd.DataFrame(rows)


def find_files(directory: str) -> list[str]:
    pattern = os.path.join(directory, "*.json")
    files = sorted(glob.glob(pattern), reverse=True)
    return files


def file_label(path: str) -> str:
    return os.path.basename(path).replace(".json", "")


# ── Page config ──────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="CardRush Scrape Dashboard",
    page_icon="🃏",
    layout="wide",
)

st.title("CardRush Scrape Dashboard")

# ── File picker ──────────────────────────────────────────────────────────────

wholesale_files = find_files(WHOLESALE_DIR)
raw_files = find_files(RAW_DIR)

if not wholesale_files:
    st.warning("No wholesale data found. Run the scraper first:\n\n`pnpm scrape:cardrush OP01 --dry-run`")
    st.stop()

selected = st.selectbox(
    "Select scrape",
    wholesale_files,
    format_func=file_label,
)

df = load_wholesale(selected)
is_promo = "Category" in df.columns

# ── KPI row ──────────────────────────────────────────────────────────────────

col1, col2, col3, col4, col5 = st.columns(5)
col1.metric("Total Cards", len(df))
col2.metric("Standard", len(df[df["Type"] == "Standard"]))
col3.metric("Parallel", len(df[df["Type"] == "Parallel"]))
col4.metric("JPY Range", f"¥{df['JPY (税込)'].min():,} – ¥{df['JPY (税込)'].max():,}")
col5.metric("GBP Range", f"£{df['GBP Ex-VAT'].min():.2f} – £{df['GBP Ex-VAT'].max():.2f}")

# ── Promo category breakdown (only for PROMO files) ─────────────────────────

if is_promo:
    st.subheader("Promo Categories")

    cat_summary = (
        df.groupby("Category")
        .agg(
            Count=("SKU", "size"),
            Min_JPY=("JPY (税込)", "min"),
            Max_JPY=("JPY (税込)", "max"),
            Total_JPY=("JPY (税込)", "sum"),
            Avg_GBP=("GBP Ex-VAT", "mean"),
        )
        .sort_values("Total_JPY", ascending=False)
    )
    cat_summary["Total_GBP"] = cat_summary["Total_JPY"] / df["JPY (税込)"].sum() * df["GBP Ex-VAT"].sum()

    st.dataframe(
        cat_summary.style.format(
            {
                "Min_JPY": "¥{:,.0f}",
                "Max_JPY": "¥{:,.0f}",
                "Total_JPY": "¥{:,.0f}",
                "Avg_GBP": "£{:.2f}",
                "Total_GBP": "£{:.2f}",
            }
        ),
        use_container_width=True,
    )

    # Category value bar chart
    st.bar_chart(
        cat_summary["Total_JPY"],
        x_label="Category",
        y_label="Total JPY Value",
    )

# ── Filters ──────────────────────────────────────────────────────────────────

st.subheader("Filters")

if is_promo:
    fcol1, fcol2, fcol3, fcol4 = st.columns(4)
else:
    fcol1, fcol2, fcol3 = st.columns(3)

with fcol1:
    type_filter = st.multiselect("Type", ["Standard", "Parallel"], default=["Standard", "Parallel"])

with fcol2:
    rarities = sorted(df["Rarity"].unique())
    rarity_filter = st.multiselect("Rarity", rarities, default=rarities)

with fcol3:
    price_range = st.slider(
        "JPY Price Range",
        min_value=int(df["JPY (税込)"].min()),
        max_value=int(df["JPY (税込)"].max()),
        value=(int(df["JPY (税込)"].min()), int(df["JPY (税込)"].max())),
    )

mask = (
    (df["Type"].isin(type_filter))
    & (df["Rarity"].isin(rarity_filter))
    & (df["JPY (税込)"] >= price_range[0])
    & (df["JPY (税込)"] <= price_range[1])
)

if is_promo:
    with fcol4:
        all_cats = sorted(df["Category"].unique())
        cat_filter = st.multiselect("Category", all_cats, default=all_cats)
    mask = mask & (df["Category"].isin(cat_filter))

filtered = df[mask]

st.caption(f"Showing {len(filtered)} of {len(df)} cards")

# ── Main table ───────────────────────────────────────────────────────────────

st.subheader("Wholesale Cards")

format_dict = {
    "JPY (税込)": "¥{:,.0f}",
    "GBP Ex-VAT": "£{:.2f}",
    "GBP Inc-VAT": "£{:.2f}",
    "Base GBP": "£{:.2f}",
    "Landed": "£{:.2f}",
    "Margin": "£{:.2f}",
}

column_config = {
    "Image": st.column_config.ImageColumn("Image", width="small"),
    "URL": st.column_config.LinkColumn("CardRush Link", display_text="View"),
}

st.dataframe(
    filtered.style.format(format_dict),
    use_container_width=True,
    height=600,
    column_config=column_config,
)

# ── Price distribution ───────────────────────────────────────────────────────

st.subheader("Price Distribution")

chart_col1, chart_col2 = st.columns(2)

with chart_col1:
    st.bar_chart(
        filtered.groupby("Rarity")["GBP Ex-VAT"].mean().sort_values(ascending=False),
        x_label="Rarity",
        y_label="Avg GBP Ex-VAT",
    )

with chart_col2:
    if is_promo:
        st.bar_chart(
            filtered.groupby("Category")["GBP Ex-VAT"].mean().sort_values(ascending=False),
            x_label="Category",
            y_label="Avg GBP Ex-VAT",
        )
    else:
        st.bar_chart(
            filtered.groupby("Type")["GBP Ex-VAT"].sum(),
            x_label="Type",
            y_label="Total GBP Ex-VAT",
        )

# ── Parent set breakdown (promo only) ───────────────────────────────────────

if is_promo:
    st.subheader("By Parent Set")
    parent_summary = (
        filtered.groupby("Parent Set")
        .agg(Count=("SKU", "size"), Total_JPY=("JPY (税込)", "sum"), Avg_GBP=("GBP Ex-VAT", "mean"))
        .sort_values("Total_JPY", ascending=False)
    )
    st.dataframe(
        parent_summary.style.format({"Total_JPY": "¥{:,.0f}", "Avg_GBP": "£{:.2f}"}),
        use_container_width=True,
    )

# ── Raw data tab ─────────────────────────────────────────────────────────────

st.divider()
st.subheader("Raw Scrape Data")

# Match raw file to wholesale file
base = os.path.basename(selected)
raw_path = os.path.join(RAW_DIR, base)

if os.path.exists(raw_path):
    raw_df = load_raw(raw_path)

    rcol1, rcol2, rcol3 = st.columns(3)
    rcol1.metric("Raw Listings", len(raw_df))
    rcol2.metric("With Card #", len(raw_df[raw_df["Card #"] != "—"]))
    rcol3.metric("Filtered Out", len(raw_df) - len(df))

    with st.expander(f"Raw products ({len(raw_df)} listings)", expanded=False):
        st.dataframe(raw_df, use_container_width=True, height=400)
else:
    st.info("No matching raw data file found.")
