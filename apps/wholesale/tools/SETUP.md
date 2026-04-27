# CardRush Scraper & Streamlit Dashboard Setup

## Prerequisites

- Node.js 18+ and pnpm
- Python 3.9+ with pip
- AWS credentials configured (`~/.aws/credentials` or env vars) for S3 image uploads
- (Optional) `DATABASE_URL` env var for DB upserts (Neon PostgreSQL)

## 1. Install Node dependencies

```bash
pnpm install
```

## 2. Install Python dependencies (for Streamlit dashboard)

```bash
pip3 install streamlit pandas
```

## 3. Run the scraper

The scraper fetches card listings from CardRush Japan, calculates wholesale GBP pricing, and saves JSON to `data/cardrush/`.

```bash
# Scrape a single set (dry run — no DB writes, skips images)
pnpm scrape:cardrush OP01 --dry-run --skip-images

# Scrape a single set (full — writes to DB + uploads images to S3)
pnpm scrape:cardrush OP01

# Scrape all 25 sets
pnpm scrape:cardrush --set-all --dry-run --skip-images

# Discover available product groups from CardRush
pnpm scrape:cardrush --discover
```

### Scraper flags

| Flag | Description |
|------|-------------|
| `--dry-run` | Skip database upsert (still saves JSON files) |
| `--skip-images` | Skip downloading/uploading card images to S3 |
| `--set-all` | Scrape all configured sets sequentially |
| `--discover` | List all product groups on CardRush homepage |

### Output files

Scraped data is saved to `data/cardrush/` (gitignored):

```
data/cardrush/
  raw/              # Raw scraped HTML product data as JSON
    OP01-2026-02-26.json
    OP02-2026-02-26.json
    ...
  wholesale/        # Processed wholesale cards with GBP pricing
    OP01-2026-02-26.json
    OP02-2026-02-26.json
    ...
```

### S3 buckets

| Bucket | Region | Purpose |
|--------|--------|---------|
| `jp-op-photos` | `us-east-1` | Card images (uploaded during scrape) |
| `pricedata-tcg` | `eu-west-2` | Price feed XLSX (used by `/api/sync`) |

Image S3 key format: `{SET_CODE}/{SKU}.jpeg` (e.g. `OP01/OP-OP01-001-JP.jpeg`)

## 4. Launch the Streamlit dashboard

```bash
streamlit run tools/dashboard.py --server.headless true
```

Opens at **http://localhost:8501**.

### Dashboard features

- **File picker**: select any scraped set/date from `data/cardrush/wholesale/`
- **KPI row**: total cards, standard/parallel counts, JPY and GBP price ranges
- **Filters**: type (standard/parallel), rarity, JPY price range slider
- **Wholesale table**: sortable with card images, SKU, pricing (JPY/GBP), stock, CardRush links
- **Price distribution**: bar charts by rarity (avg GBP) and type (total GBP)
- **Raw data**: expandable section showing unprocessed scrape listings

### Requirements for dashboard

The dashboard reads JSON files from `data/cardrush/wholesale/`. You must run the scraper at least once before launching the dashboard. If no data is found, it will display a warning with instructions.

## Quick start (new machine)

```bash
git clone https://github.com/cambridgetcg/tcg-wholesale.git
cd tcg-wholesale
pnpm install
pip3 install streamlit pandas

# Scrape one set to generate data
pnpm scrape:cardrush OP01 --dry-run --skip-images

# Launch dashboard
streamlit run tools/dashboard.py --server.headless true
```
