# Wholesale App — Architecture Map

**App:** `apps/wholesale` (tcg-wholesale v0.1.0)
**Framework:** Next.js 15.1+ (App Router), React 19, Tailwind 3.4
**Database:** PostgreSQL (AWS RDS, us-east-1) via Drizzle ORM + `postgres` driver
**Hosting:** Vercel (serverless, 1 DB connection per invocation, SSL required)
**Domain:** `wholesaletcgdirect.com` (storefront) / `admin.wholesaletcgdirect.com` (admin)

---

## 1. Route Tree

### Public Pages (no auth)
| Route | Purpose |
|---|---|
| `/login` | Credentials login form (server action) |

### Client Pages (auth required, role: client or admin)
| Route | Purpose |
|---|---|
| `/` | Redirect: admin host → `/admin`, else → `/catalog`, unauth → `/login` |
| `/catalog` | Product catalog browser |
| `/orders` | Client order list |
| `/orders/new` | Create new order (from cart) |
| `/orders/[id]` | Single order detail |
| `/margin` | Margin calculator tool |
| `/fulfillment` | Fulfillment tracking |

### Admin Pages (auth required, role: admin only)
| Route | Purpose |
|---|---|
| `/admin` | Dashboard |
| `/admin/orders` | All orders management |
| `/admin/orders/[id]/stock-check` | Stock-check workflow for a specific order |
| `/admin/prices` | Price management |
| `/admin/games` | Game catalog management |
| `/admin/clients` | Client management |
| `/admin/stock` | Stock overview |
| `/admin/stock-levels` | Detailed stock levels (filterable, paginated, game tabs) |
| `/admin/stock-adjustments` | Manual stock adjustment history |
| `/admin/stock-targets` | Price-tier stock targets configuration |
| `/admin/to-order` | Cards that need ordering (below target) |
| `/admin/refill` | Refill/reorder workflow |
| `/admin/purchases` | Purchase orders (from Remambo/CardRush) |
| `/admin/wanted` | Client wanted-cards list |
| `/admin/channel-pricing` | Per-channel pricing config |

### API Routes — Admin
| Route | Purpose |
|---|---|
| `/api/admin/orders` | List/manage orders |
| `/api/admin/orders/[id]/notifications` | Send email notifications |
| `/api/admin/clients` | CRUD clients |
| `/api/admin/clients/[id]/orders` | Client order history |
| `/api/admin/games` | CRUD games |
| `/api/admin/games/[id]` | Single game |
| `/api/admin/sets` | CRUD sets |
| `/api/admin/sets/[id]` | Single set |
| `/api/admin/stock` | Stock operations |
| `/api/admin/stock/levels` | Stock level queries |
| `/api/admin/stock/adjust` | Manual stock adjustments |
| `/api/admin/stock-check/live` | Live stock-check during quoting |
| `/api/admin/stock-targets` | CRUD stock targets |
| `/api/admin/stock-targets/preview` | Preview target calculations |
| `/api/admin/purchases` | CRUD purchase orders |
| `/api/admin/purchases/[id]` | Single purchase |
| `/api/admin/purchases/review` | Review pending purchases |
| `/api/admin/refill` | Refill workflow |
| `/api/admin/refill/history` | Refill history |
| `/api/admin/to-order` | To-order list |
| `/api/admin/wanted` | Wanted cards |
| `/api/admin/channel-pricing` | Channel pricing CRUD |
| `/api/admin/carts/clear` | Clear all client carts |
| `/api/admin/snapshot` | Manual price snapshot trigger |
| `/api/admin/rebuild-buylist` | Manual buylist rebuild trigger |
| `/api/admin/shopify-sync` | Manual Shopify sync |
| `/api/admin/shopify-backfill` | Backfill Shopify product IDs |
| `/api/admin/channels/ebay/sync` | eBay inventory sync |
| `/api/admin/channels/ebay/import-orders` | Import eBay orders |

### API Routes — Client
| Route | Purpose |
|---|---|
| `/api/cards` | Card search/list |
| `/api/cards/[id]` | Single card |
| `/api/cart` | Cart CRUD |
| `/api/cart/refresh` | Refresh cart prices |
| `/api/clients` | Client self-service |
| `/api/clients/[id]` | Client profile |
| `/api/orders` | Create/list orders |
| `/api/orders/[id]/items` | Order items |
| `/api/orders/[id]/items/[itemId]/stock` | Stock status per item |
| `/api/orders/[id]/status` | Order status transitions |
| `/api/orders/[id]/stock-check/complete` | Complete stock check |
| `/api/wanted` | Wanted cards (client) |
| `/api/sync` | Sync endpoint |
| `/api/prices/upload` | Upload price feed |

### API Routes — v1 (external, Bearer token auth)
| Route | Method | Purpose |
|---|---|---|
| `/api/v1/prices` | GET | Paginated price list with channel pricing |
| `/api/v1/prices/[sku]` | GET | Single SKU price |
| `/api/v1/games` | GET | Games list |
| `/api/v1/sets` | GET | Sets list |
| `/api/v1/sales` | POST | Record a sale (decrements stock) |

### Cron Jobs
| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/monthly-rollover` | Daily midnight | Recalculate 30-day rolling spend for volume discounts |
| `/api/cron/price-snapshot` | Daily 2am | Scrape CardRush prices, update price_archive + price_history + cards |
| `/api/cron/rebuild-buylist` | Daily 3am | Build trade-in buylist JSON, write to Cloudflare KV |
| `/api/cron/shopify-sync` | Daily 4am | Full Shopify sync (prices + stock) |
| `/api/cron/shopify-orders` | Every 30 min | Pull paid Shopify orders, create wholesale orders, decrement stock |
| `/api/cron/stock-correct` | Manual | Stock correction endpoint |

### Webhook
| Route | Purpose |
|---|---|
| `/api/webhooks/shopify/orders-paid` | Real-time stock decrement on Shopify order payment |

---

## 2. Auth Model

- **NextAuth v5** (beta 25) with **JWT strategy**, 30-day maxAge
- **Credentials provider** — email + password verified against `clients.password_hash` (bcryptjs)
- **Roles:** `admin` | `client` (from `clients.role` column, carried in JWT)
- **Brute-force protection:** In-memory rate limiter (5 attempts per email per 15 minutes)
- **Cookie config:** Production uses `__Secure-`/`__Host-` prefixed cookies on `.wholesaletcgdirect.com`
- **Middleware:**
  - Public: `/login`, `/api/auth/*`, `/api/v1/*`, `/api/cron/*`, `/api/webhooks/*`
  - Domain gating between admin/storefront subdomains
  - `/admin/*` requires `role === "admin"`, else redirect to `/catalog`
  - `/api/admin/*` requires `role === "admin"`, else 403
- **V1 API auth:** Separate system — Bearer token hashed with SHA-256, looked up in `channel_api_keys` table

---

## 3. Database Schema (17 tables)

| Table | Purpose | Key Columns |
|---|---|---|
| `clients` | Users (admin + client roles) | email (unique), password_hash, role, volume_discount_pct, order_prefix, order_sequence |
| `games` | Game catalog (e.g. One Piece) | code (unique), name, slug, active |
| `sets` | Card sets per game | game_id FK, code, name, release_date |
| `cards` | Central card table | sku (unique), cardrush_jpy, gbp_jpy_rate, base_gbp, price, stock, pending_stock, shopify IDs |
| `orders` | Customer orders | client_id FK, status (state machine), total, channel, external_order_id |
| `order_items` | Line items per order | order_id FK, card_id FK, quantity, unit_price, stock_status |
| `order_status_history` | Audit trail for order transitions | order_id, from/to_status, items_snapshot (JSONB) |
| `price_history` | Daily price snapshots | card_id + date (unique), cardrush_jpy, gbp_jpy_rate |
| `price_archive` | Richer daily snapshots | card_id + snapshot_date (unique), full price breakdown |
| `condition_prices` | Per-condition prices from CardRush | card_number, name, condition, snapshot_date |
| `notifications` | Email notification log | order_id, type, recipient, status |
| `purchases` | Real-world purchases (CardRush/Remambo) | status (ordered/shipped/received), JPY costs |
| `purchase_items` | Items per purchase | purchase_id, card_id, condition, jpy_unit_price |
| `fulfillment_entries` | Per-item fulfillment records | order_item_id + fulfillment_date (unique) |
| `cart_items` | Persistent server-side carts | client_id + card_id (unique) |
| `wanted_cards` | Client wishlists | client_id + card_id (unique) |
| `stock_targets` | Price-tier reorder targets | price_min, price_max, target_qty |
| `stock_adjustments` | Audit log for stock changes | card_id, delta, reason, channel |
| `channel_api_keys` | V1 API key storage | channel, key_hash (SHA-256) |
| `channel_pricing` | Per-channel pricing config | channel (unique), margin_multiplier, flat_fee, vat_multiplier, etc. |

---

## 4. External Services

| Service | Purpose | Auth |
|---|---|---|
| **AWS S3** (eu-west-2) | Price feed Excel download (`pricedata-tcg` bucket) | IAM keys |
| **AWS S3** (us-east-1) | Card images (`jp-op-photos` bucket) | Public URLs |
| **CardRush** (cardrush-op.jp) | Price scraping — A- condition JPY prices | No auth, browser UA |
| **Cloudflare KV** | Trade-in buylist JSON storage | Global API Key |
| **Resend** | Order lifecycle emails | API key |
| **Shopify** (6e824e-a9.myshopify.com) | Product sync, inventory, order ingestion | OAuth client_credentials / access token |
| **eBay** (api.ebay.com) | Inventory sync, order import | OAuth refresh_token |
| **FX Rate APIs** | GBP/JPY rate | Public (open.er-api.com, exchangerate.host fallback) |

---

## 5. Pricing Engine

```
price = round((baseGbp × marginMultiplier + flatFee) × retailMultiplier × vatMultiplier, roundTo)
baseGbp = cardrushJpy / gbpJpyRate
```

| Channel | Margin | Flat Fee (singles/sealed) | VAT | Retail × | Round |
|---|---|---|---|---|---|
| wholesale | 1.08 | +0.22 / +2.20 | 1.20 | 1.0 | 0.01 |
| shopify | 1.08 | +0.22 / +2.20 | 1.20 | 1.15 | 0.10 |
| ebay | 1.08 | +0.22 / +2.20 | 1.20 | 1.25 | 0.10 |
| cardmarket | 1.08 | +0.22 / +2.20 | 1.20 | 1.20 | 0.01 |
| tradein-cash | 1.0 | 0 | 1.0 | 0.55 | 0.01 |
| tradein-credit | 1.0 | 0 | 1.0 | 0.77 | 0.01 |

Channel configs overridable from DB (`channel_pricing` table) with 5-min in-memory cache.

---

## 6. Data Flow

### Price Pipeline (daily)
```
02:00  price-snapshot → scrape CardRush → update price_archive, price_history, cards
03:00  rebuild-buylist → read price_archive → compute cash/credit → write Cloudflare KV
04:00  shopify-sync → compute shopify prices → update Shopify products + inventory
```

### Order Flow
```
Client: /catalog → cart → /orders/new → POST /api/orders (status: submitted)
Admin:  stock-check → quoted → confirmed → paid → ordered → shipped → delivered
Emails sent at each transition via Resend
```

### Stock Derivation
```
stock = SUM(received purchases) - SUM(fulfillment entries) + SUM(stock adjustments)
pending_stock = SUM(ordered + shipped purchases)
```

### Multi-Channel Sales
- **Shopify:** Cron (every 30 min) + webhook (real-time) → create orders + decrement stock
- **eBay:** Import orders endpoint + inventory sync
- **External:** V1 sales API → decrement stock
- **Wholesale:** Web app order flow

---

## 7. Config

- **next.config.ts:** Empty (defaults)
- **drizzle.config.ts:** Schema at `src/lib/db/schema.ts`, output `./drizzle`
- **tailwind.config.ts:** Dark mode: class, custom brand colors (blue/indigo)
- **vercel.json:** 5 cron job definitions
- **middleware.ts:** Auth + domain gating + role enforcement
