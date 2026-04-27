"""
Condition Price Comparison — show all condition grades for each card variant.

Groups raw CardRush scrape data by card variant (same card number + base name),
then shows mint vs 状態A- / 状態B / 状態C prices side by side with links.

Usage:
    streamlit run tools/condition-prices.py
"""

import json
import glob
import os
import re
from collections import defaultdict
import pandas as pd
import streamlit as st

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "cardrush")
RAW_DIR = os.path.join(DATA_DIR, "raw")

CONDITION_ORDER = ["Mint", "状態A-", "状態B", "状態C"]


def strip_condition(name: str) -> str:
    """Remove 〔状態X〕 prefix to get the base product name."""
    return re.sub(r"〔[^〕]+〕", "", name).strip()


def parse_condition(raw_condition: str | None) -> str:
    """Normalise condition string."""
    if not raw_condition:
        return "Mint"
    if raw_condition.startswith("状態"):
        return raw_condition
    return raw_condition


@st.cache_data
def load_condition_data(path: str) -> pd.DataFrame:
    with open(path) as f:
        raw = json.load(f)

    # Group by (card_number, base_name) → list of condition listings
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in raw:
        cn = r.get("cardNumber")
        if not cn:
            # Assign card number for unrecognised entries
            if "ドン!!" in r["name"]:
                cn = "DON"
            elif "{P}" in r["name"]:
                cn = "P"
            else:
                cn = "?"
        base = strip_condition(r["name"])
        groups[(cn, base)].append(r)

    rows = []
    for (cn, base), listings in groups.items():
        # Clean the display name
        display_name = (
            re.sub(r"\{[^}]+\}", "", base)    # {OP01-001}
            .replace("【", " [").replace("】", "]")
            .strip()
        )

        # Extract rarity
        rarity_m = re.search(r"\[([^\]]+)\]", display_name)
        rarity = rarity_m.group(1) if rarity_m else "—"

        # Build condition → (price, stock, url, image) map
        cond_map: dict[str, dict] = {}
        for r in listings:
            cond = parse_condition(r.get("condition"))
            # Keep cheapest per condition (some have dupes)
            if cond not in cond_map or r["priceJpy"] < cond_map[cond]["price"]:
                cond_map[cond] = {
                    "price": r["priceJpy"],
                    "stock": r["stock"],
                    "url": r.get("productUrl") or "",
                    "image": r.get("imageUrl") or "",
                }

        # Skip graded-only cards (PSA, BGS, etc.)
        conditions_present = set(cond_map.keys())
        standard_conditions = conditions_present & set(CONDITION_ORDER)
        if not standard_conditions:
            continue

        mint_price = cond_map.get("Mint", {}).get("price")
        image = cond_map.get("Mint", next(iter(cond_map.values()))).get("image", "")

        row = {
            "Image": image,
            "Card #": cn,
            "Name": display_name,
            "Rarity": rarity,
        }

        # Add price, stock, url columns per condition
        for cond in CONDITION_ORDER:
            if cond in cond_map:
                entry = cond_map[cond]
                row[f"{cond} ¥"] = entry["price"]
                row[f"{cond} Stock"] = entry["stock"]
                row[f"{cond} Link"] = entry["url"]
                # Discount vs mint
                if mint_price and cond != "Mint" and mint_price > 0:
                    discount = round((1 - entry["price"] / mint_price) * 100, 1)
                    row[f"{cond} Disc%"] = discount
                else:
                    row[f"{cond} Disc%"] = None
            else:
                row[f"{cond} ¥"] = None
                row[f"{cond} Stock"] = None
                row[f"{cond} Link"] = None
                row[f"{cond} Disc%"] = None

        row["Conditions"] = len(standard_conditions)
        rows.append(row)

    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.sort_values(["Card #", "Name"]).reset_index(drop=True)
    return df


def find_files(directory: str) -> list[str]:
    return sorted(glob.glob(os.path.join(directory, "*.json")), reverse=True)


def file_label(path: str) -> str:
    return os.path.basename(path).replace(".json", "")


# ── Page config ──────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="Condition Price Comparison",
    page_icon="📊",
    layout="wide",
)

st.title("Condition Price Comparison")
st.caption("Same card, different grades — mint vs 状態A- / B / C with discount %")

# ── File picker ──────────────────────────────────────────────────────────────

raw_files = find_files(RAW_DIR)

if not raw_files:
    st.warning("No raw scrape data found. Run the scraper first:\n\n`pnpm scrape:cardrush OP01 --dry-run`")
    st.stop()

selected = st.selectbox("Select scrape", raw_files, format_func=file_label)
df = load_condition_data(selected)

if df.empty:
    st.info("No condition variant data in this file.")
    st.stop()

# ── KPI row ──────────────────────────────────────────────────────────────────

total = len(df)
multi = len(df[df["Conditions"] > 1])

col1, col2, col3, col4 = st.columns(4)
col1.metric("Card Variants", total)
col2.metric("With Multiple Conditions", multi)

# Average discounts
for cond in ["状態A-", "状態B", "状態C"]:
    disc_col = f"{cond} Disc%"
    if disc_col in df.columns:
        avg = df[disc_col].dropna().mean()
        if cond == "状態A-":
            col3.metric(f"Avg {cond} Discount", f"{avg:.1f}%" if pd.notna(avg) else "—")
        elif cond == "状態B":
            col4.metric(f"Avg {cond} Discount", f"{avg:.1f}%" if pd.notna(avg) else "—")

# ── Filters ──────────────────────────────────────────────────────────────────

fcol1, fcol2 = st.columns(2)

with fcol1:
    min_conditions = st.selectbox(
        "Minimum conditions available",
        [1, 2, 3, 4],
        index=1,
        help="Show cards with at least N condition grades listed",
    )

with fcol2:
    has_mint = st.checkbox("Must have Mint price", value=True)

mask = df["Conditions"] >= min_conditions
if has_mint:
    mask = mask & df["Mint ¥"].notna()

filtered = df[mask]
st.caption(f"Showing {len(filtered)} of {total} card variants")

# ── Main table ───────────────────────────────────────────────────────────────

st.subheader("Price by Condition")

# Select columns to display
display_cols = ["Image", "Card #", "Name", "Rarity"]
for cond in CONDITION_ORDER:
    if f"{cond} ¥" in filtered.columns:
        display_cols.append(f"{cond} ¥")
        if cond != "Mint":
            display_cols.append(f"{cond} Disc%")
        display_cols.append(f"{cond} Link")

format_dict = {}
column_config = {
    "Image": st.column_config.ImageColumn("Image", width="small"),
}
for cond in CONDITION_ORDER:
    price_col = f"{cond} ¥"
    if price_col in display_cols:
        format_dict[price_col] = "¥{:,.0f}"
    disc_col = f"{cond} Disc%"
    if disc_col in display_cols:
        format_dict[disc_col] = "-{:.1f}%"
    link_col = f"{cond} Link"
    if link_col in display_cols:
        column_config[link_col] = st.column_config.LinkColumn(f"{cond} Link", display_text="View")

st.dataframe(
    filtered[display_cols].style.format(format_dict, na_rep="—"),
    use_container_width=True,
    height=600,
    column_config=column_config,
)

# ── Discount distribution ────────────────────────────────────────────────────

st.subheader("Discount Distribution vs Mint")

chart_data = {}
for cond in ["状態A-", "状態B", "状態C"]:
    disc_col = f"{cond} Disc%"
    if disc_col in filtered.columns:
        vals = filtered[disc_col].dropna()
        if not vals.empty:
            chart_data[cond] = vals.values

if chart_data:
    chart_df = pd.DataFrame(
        {k: pd.Series(v) for k, v in chart_data.items()}
    )
    st.bar_chart(
        chart_df.apply(lambda col: col.dropna().value_counts().sort_index()),
    )

# ── Best discount deals ─────────────────────────────────────────────────────

st.subheader("Best Deals (highest discount vs mint)")

for cond in ["状態A-", "状態B", "状態C"]:
    disc_col = f"{cond} Disc%"
    price_col = f"{cond} ¥"
    if disc_col not in filtered.columns:
        continue

    deals = (
        filtered[filtered[disc_col].notna()]
        .sort_values(disc_col, ascending=False)
        .head(10)
    )

    if deals.empty:
        continue

    with st.expander(f"Top 10 {cond} deals", expanded=(cond == "状態A-")):
        deal_cols = ["Image", "Card #", "Name", "Mint ¥", price_col, disc_col]
        link_col = f"{cond} Link"
        if link_col in deals.columns:
            deal_cols.append(link_col)
        st.dataframe(
            deals[deal_cols].style.format(
                {"Mint ¥": "¥{:,.0f}", price_col: "¥{:,.0f}", disc_col: "-{:.1f}%"},
                na_rep="—",
            ),
            use_container_width=True,
            column_config={
                "Image": st.column_config.ImageColumn("Image", width="small"),
                link_col: st.column_config.LinkColumn(f"{cond} Link", display_text="View"),
            },
            hide_index=True,
        )
