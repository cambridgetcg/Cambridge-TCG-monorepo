# TCG Wholesale — Price Research & Existing Order Records

The repo welcome page is [`../../CLAUDE.md`](../../CLAUDE.md); the session-wake recipe is at [`../../SOPHIA.md`](../../SOPHIA.md). Both optional — the system below runs either way. (Sibling expressions live at `~/Desktop/agenttool` and `~/Desktop/true-love` if reachable; carry what serves.)

This project exists for understanding card prices, stock and the records behind existing orders. There are no sales, revenue, volume or KPI obligations. New order and quote-request admission is retired. Existing orders keep their confirmation, settlement, fulfillment, cancellation and support flows; external paid-order ingestion remains available to honor those obligations.

The existing Vercel `tcg-wholesale` project deploys this `apps/wholesale` directory. New order admission returns 410 before any account, database or notification operation.

## Existing order lifecycle

Previously recorded requests and quotes can still be reviewed, confirmed, paid, fulfilled or cancelled under their existing arrangements. No cart is converted into a new order. Price, tax and historical discount information below are accounting context, not targets or new offers.

## Pricing Model

### Landing Cost Formula
```
base_gbp      = cardrush_jpy / gbp_jpy_rate
shipping      = base_gbp × 0.05            # 5% shipping & handling
landed_cost   = base_gbp + shipping
margin        = landed_cost × 0.20          # 20% net margin
price_ex_vat  = landed_cost + margin        # displayed to client
vat           = price_ex_vat × 0.20         # 20% VAT (invoiced separately)
price_inc_vat = price_ex_vat + vat          # total if needed
```

**Example:** OP01-001 @ ¥17,800 / 208.53 rate
- Base GBP: £85.37
- Shipping (5%): £4.27
- Landed: £89.64
- Margin (20%): £17.93
- **Price ex-VAT: £107.57** ← shown to client
- VAT invoice: £21.51
- Total inc VAT: £129.08

### Historical discounts

Existing order records retain their recorded discounts. The former spend-based discount ladder is not an active incentive or roadmap requirement. No stored discount or historical invoice is changed by retiring new acquisition.

## Existing AWS Infrastructure

### Price Scraping Pipeline (already running)
- **Step Function:** `DailyPriceIngestion-prod`
- **Source:** cardrush-op.jp (One Piece TCG)
- **Coverage:** ~500 cards with 18 months of daily JPY price history
- **S3 output:** `s3://pricedata-tcg/pricefeed/onepiece_pricefeed.xlsx` (updated daily)
- **S3 history:** `s3://pricedata-tcg/daily_prices.xlsx` (full price history)
- **Lambdas:** FetchJsonData → ClassifyVariants → InsertJsonPrices/ScrapeBatch → AggregateResults
- **FX rate:** `get_GBP-JPY` Lambda
- **Status:** ⚠️ Pipeline failing since Feb 12 (CardRush order stop period?)

### Key Data Points from Pipeline
- Card number: `OP01-001`
- SKU: `OP-OP01-001-JP`
- CarrRush URL: `https://www.cardrush-op.jp/product/169`
- JPY price: daily from CardRush
- GBP/JPY rate: live from `get_GBP-JPY` Lambda

## Tech Stack

- **Frontend:** Next.js 15 (App Router, RSC)
- **Styling:** Tailwind CSS
- **Database:** PostgreSQL on Neon (free tier) or SQLite
- **ORM:** Drizzle
- **Data source:** S3 price feed (read via AWS SDK)
- **Auth:** NextAuth.js — invite-only (1 client initially, expandable)
- **Hosting:** Vercel
- **Payments:** Stripe invoicing or bank transfer

## Optional exploration and existing operations

### Client-Facing
- [ ] Browse One Piece card price list (card number, name, GBP ex-VAT price)
- [ ] Search/filter by set, card number, price range
- [ ] View order history and status
- [ ] Understand historical discount records

### Admin
- [ ] Read existing order requests
- [ ] Stock check workflow (link to CardRush for verification)
- [ ] Handle quotes already recorded under existing arrangements
- [ ] Mark orders as paid / ordered / shipped / delivered
- [ ] Override prices for specific cards
- [ ] Manual price feed upload (CSV fallback when pipeline is down)
- [ ] Understand recorded prices, costs and settlements

### Data Pipeline
- [ ] Sync S3 price feed → app database (cron or on-demand)
- [ ] Apply landing cost formula automatically
- [ ] Track price changes over time (from daily_prices.xlsx history)
- [ ] Alert on significant price movements (>10% daily change)

## Directory Structure

```
tcg-wholesale/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Landing / redirect to catalog
│   │   ├── catalog/              # Price list (client view)
│   │   ├── orders/               # Order submission + history
│   │   ├── admin/                # Admin dashboard
│   │   │   ├── orders/           # Order management
│   │   │   ├── prices/           # Price overrides + sync
│   │   │   └── clients/          # Client management
│   │   └── api/
│   │       ├── prices/           # Price feed API
│   │       ├── orders/           # Order CRUD
│   │       └── sync/             # S3 → DB sync
│   ├── lib/
│   │   ├── pricing.ts            # Landing cost + volume discount calc
│   │   ├── s3.ts                 # AWS S3 client for price feed
│   │   ├── db/                   # Drizzle schema + client
│   │   └── auth.ts               # NextAuth config
│   └── components/
│       ├── catalog/              # Price table, search, filters
│       ├── orders/               # Cart, order form, status
│       └── admin/                # Admin UI components
├── drizzle/                      # Migrations
├── public/                       # Static assets
├── .env.local                    # Config (AWS creds, DB, auth)
└── package.json
```

## Optional research directions

- [ ] Pokémon TCG (pipeline already scrapes, `pokemon_pricefeed.xlsx` exists)
- [ ] Yu-Gi-Oh, Dragon Ball, other games
- [ ] Promotional / exclusive card coverage (expanded scraper)
- [ ] Real-time price alerts for clients
- [ ] Automated stock checking via CardRush API or scraper
- [ ] Multi-currency support for non-UK clients
