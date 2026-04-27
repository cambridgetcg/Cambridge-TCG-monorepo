# Cambridge TCG Storefront — Architecture Design

**Decision:** Storefront consumes Wholesale API as single source of truth (Option A).
**Date:** 2026-03-25
**Status:** Design — awaiting implementation

---

## 1. Principle

```
┌──────────────────────────────────────────────────────────┐
│           WHOLESALE (wholesaletcgdirect.com)              │
│                                                          │
│   PostgreSQL DB ← CardRush pipeline ← FX rates          │
│   15+ tables: cards, games, sets, orders, stock,         │
│   purchases, fulfillments, price_history, channels...    │
│                                                          │
│   GET /api/v1/prices  (Bearer auth, per-channel keys)    │
│   POST /api/v1/sales  (report sales back)                │
│                                                          │
└──────────────┬───────────────────────┬───────────────────┘
               │                       │
    ┌──────────▼──────────┐   ┌────────▼────────┐
    │  Cambridge TCG      │   │     eBay        │
    │  (Next.js SSR)      │   │  (Inventory     │
    │  cambridgetcg.com   │   │   API push)     │
    └─────────────────────┘   └─────────────────┘
```

**One DB. One price. One stock count. Every channel reads from wholesale, reports sales back.**

The storefront does NOT own any card/price/stock data. It is a **read-only consumer** with a local cache for performance.

---

## 2. Data Flow

### 2.1 Storefront reads catalog

```
Storefront (SSR page request)
    │
    ▼
Cache layer (Redis / in-memory / ISR)
    │ miss?
    ▼
GET wholesale/api/v1/prices?game=onepiece&limit=48&offset=0
    │
    ▼
Render → HTML to customer
```

### 2.2 Customer purchases

```
Customer adds to cart → local state (no wholesale call)
    │
    ▼
Checkout → Stripe / Shopify checkout
    │
    ▼
Payment confirmed (webhook)
    │
    ▼
POST wholesale/api/v1/sales
  { channel: "cambridge-tcg", items: [{sku, qty, price_gbp}], order_ref: "CTG-1234" }
    │
    ▼
Wholesale decrements stock, logs adjustment (channel="cambridge-tcg")
```

### 2.3 Price/stock stays fresh

```
Option A — ISR revalidation (simplest):
  Every page revalidates every 5-10 minutes via Next.js ISR
  No local DB needed at all

Option B — Periodic sync (more control):
  Cron (every 15 min) calls GET /api/v1/prices?updated_since=<last_sync>
  Writes to local cache (Redis / KV / SQLite)
  Pages read from cache
```

---

## 3. What Changes in the Storefront

### 3.1 REMOVE (local DB eliminated)

| File | Current | Action |
|------|---------|--------|
| `src/lib/db/schema.ts` | Full Drizzle schema (games, sets, cards) | **DELETE** |
| `src/lib/db/index.ts` | Postgres client init | **DELETE** |
| `.env.local` → `DATABASE_URL` | Neon/Postgres connection | **REMOVE** |
| `drizzle.config.ts` (if any) | Migration config | **DELETE** |
| `package.json` → `drizzle-orm`, `postgres` | DB dependencies | **REMOVE** |

### 3.2 ADD (wholesale API client)

```
src/lib/
  wholesale/
    client.ts       ← API client (fetch wrapper, auth, types)
    types.ts        ← Shared types (Card, Game, PriceItem)
    cache.ts        ← ISR / in-memory cache layer
```

#### `client.ts` — Core API Client

```typescript
// Minimal wholesale API client
const WHOLESALE_URL = process.env.WHOLESALE_API_URL!;
const WHOLESALE_KEY = process.env.WHOLESALE_API_KEY!;

export interface PriceItem {
  sku: string;
  card_number: string;
  price_gbp: number;
  stock: number;
  pending_stock: number;
  image_url: string | null;
  name: string | null;
  name_en: string | null;
  updated_at: string | null;
}

export interface PricesResponse {
  count: number;
  channel: string;
  items: PriceItem[];
}

export async function fetchPrices(params?: {
  game?: string;
  updated_since?: string;
}): Promise<PricesResponse> {
  const url = new URL(`${WHOLESALE_URL}/api/v1/prices`);
  if (params?.game) url.searchParams.set("game", params.game);
  if (params?.updated_since) url.searchParams.set("updated_since", params.updated_since);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${WHOLESALE_KEY}` },
    next: { revalidate: 300 }, // ISR: 5 min cache
  });

  if (!res.ok) throw new Error(`Wholesale API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function reportSale(sale: {
  channel: string;
  order_ref: string;
  items: { sku: string; qty: number; price_gbp: number }[];
}): Promise<void> {
  const res = await fetch(`${WHOLESALE_URL}/api/v1/sales`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHOLESALE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sale),
  });

  if (!res.ok) throw new Error(`Sale report failed: ${res.status}`);
}
```

### 3.3 MODIFY (pages consume API instead of DB)

#### `src/app/page.tsx` — Home

```typescript
import { fetchPrices } from "@/lib/wholesale/client";

export default async function Home() {
  const [allPrices] = await Promise.all([
    fetchPrices().catch(() => ({ items: [] })),
  ]);

  // Derive games from price data (unique game prefixes from SKUs)
  // Or: add a GET /api/v1/games endpoint to wholesale
  const featuredCards = allPrices.items
    .filter(c => c.stock > 0)
    .sort((a, b) => b.price_gbp - a.price_gbp)
    .slice(0, 12);

  return (
    <main>
      <HeroSlideshow />
      <GameGrid />           {/* static list for now, later from API */}
      <StorySection />
      <FeaturedCards cards={featuredCards} />
    </main>
  );
}
```

#### `src/app/catalog/page.tsx` — Catalog

```typescript
export default async function CatalogPage({ searchParams }) {
  const params = await searchParams;
  const prices = await fetchPrices({ game: params.game }).catch(() => ({ items: [] }));

  // Client-side: filter by search query, paginate
  let items = prices.items.filter(c => c.stock > 0);
  if (params.q) {
    const q = params.q.toLowerCase();
    items = items.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.card_number.toLowerCase().includes(q)
    );
  }

  const page = Math.max(1, parseInt(params.page || "1"));
  const PER_PAGE = 48;
  const paged = items.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <CatalogFilters games={GAMES} current={params} />
      <CardGrid cards={paged} />
      <Pagination total={items.length} page={page} perPage={PER_PAGE} />
    </div>
  );
}
```

#### `src/app/product/[sku]/page.tsx` — Product Detail

```typescript
export default async function ProductPage({ params }) {
  const { sku } = await params;
  const prices = await fetchPrices();
  const card = prices.items.find(c => c.sku === sku);
  if (!card) notFound();

  return <ProductDetail card={card} />;
}
```

---

## 4. Wholesale API Enhancements Needed

The current `GET /api/v1/prices` returns up to **1000 items** with no pagination. For a consumer-facing catalog, we need:

### 4.1 Pagination + Search (priority: HIGH)

```
GET /api/v1/prices?game=onepiece&offset=0&limit=48&q=luffy&sort=price_desc
```

Add to wholesale route:
- `limit` (default 48, max 500)
- `offset` (default 0)
- `q` — full-text search on card_number + name_en + name
- `sort` — `price_asc`, `price_desc`, `name_asc`, `card_number`
- `in_stock` — boolean, filter stock > 0
- Response: add `total` count for pagination UI

### 4.2 Games Endpoint (priority: MEDIUM)

```
GET /api/v1/games
→ [{ code, name, slug, image_url, card_count }]
```

Storefront needs the list of active games for navigation + GameGrid.

### 4.3 Single Card Endpoint (priority: MEDIUM)

```
GET /api/v1/prices/:sku
→ { sku, card_number, price_gbp, stock, image_url, name, set_code, set_name, rarity, ... }
```

More fields than the list endpoint — for product detail pages.

### 4.4 Sales Endpoint (priority: HIGH)

```
POST /api/v1/sales
{
  "channel": "cambridge-tcg",
  "order_ref": "CTG-1234",
  "items": [{ "sku": "OP-OP01-001-JP", "qty": 1, "price_gbp": 107.57 }]
}
→ 201 Created
```

Already designed in OMNICHANNEL.md Phase 4. Needs implementation.

### 4.5 Sets Endpoint (priority: LOW)

```
GET /api/v1/sets?game=onepiece
→ [{ code, name, card_count }]
```

For "filter by set" in catalog.

---

## 5. Environment Variables

### Storefront `.env.local` (simplified)

```env
# Wholesale API — single source of truth
WHOLESALE_API_URL=https://wholesaletcgdirect.com
WHOLESALE_API_KEY=<channel-api-key-for-cambridge-tcg>

# Site
NEXT_PUBLIC_SITE_URL=https://cambridgetcg.com

# Stripe (checkout)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

**No `DATABASE_URL`. No Drizzle. No Postgres dependency.**

---

## 6. Caching Strategy

### Tier 1 — Next.js ISR (immediate, zero infra)

```typescript
fetch(url, { next: { revalidate: 300 } }) // 5 min stale-while-revalidate
```

- Catalog pages: 5 min revalidate
- Product pages: 5 min revalidate
- Home page featured: 10 min revalidate
- Static pages (about, story): no revalidation needed

**Pros:** Zero infrastructure, built into Next.js, Vercel handles globally.
**Cons:** Up to 5 min stale pricing/stock.

### Tier 2 — On-demand revalidation (future)

Wholesale fires a webhook when prices change → storefront `revalidatePath('/catalog')`.

```
Wholesale price sync runs
  → POST cambridgetcg.com/api/revalidate?secret=xxx&paths=/catalog,/
  → Next.js purges ISR cache instantly
```

---

## 7. Implementation Phases

### Phase 1 — Wire storefront to wholesale API (1 day)
1. Add `src/lib/wholesale/client.ts` with `fetchPrices()`
2. Refactor `page.tsx`, `catalog/page.tsx`, `product/[sku]/page.tsx` to use API client
3. Remove `src/lib/db/` entirely
4. Remove `drizzle-orm`, `postgres` from `package.json`
5. Update `.env.local`
6. Test with live wholesale API

### Phase 2 — Enhance wholesale API (1 day)
1. Add pagination (`limit`, `offset`, `total`) to `/api/v1/prices`
2. Add `q` search parameter
3. Add `GET /api/v1/games` endpoint
4. Add `GET /api/v1/prices/:sku` endpoint with full card detail
5. Add `in_stock` filter
6. Generate API key for cambridge-tcg channel

### Phase 3 — Checkout + sales reporting (2 days)
1. Implement cart (client-side state, localStorage)
2. Stripe checkout integration
3. On payment success: `POST /api/v1/sales` to wholesale
4. Order confirmation page
5. Add `POST /api/v1/sales` to wholesale API

### Phase 4 — Polish (1 day)
1. On-demand revalidation webhook
2. Search UI in nav
3. Mobile hamburger menu
4. SEO meta per page
5. Loading states / skeletons

**Total: ~5 days to a production-ready storefront backed by wholesale SSoT.**

---

## 8. Migration Checklist

- [ ] Generate `channel_api_keys` entry in wholesale DB for `cambridge-tcg`
- [ ] Test `GET /api/v1/prices` with key from storefront server
- [ ] Swap storefront pages from Drizzle to API client
- [ ] Remove all DB files + deps from storefront
- [ ] Verify images serve (wholesale `imageUrl` or CDN?)
- [ ] Add pagination to wholesale API
- [ ] Add games endpoint to wholesale API
- [ ] Wire Stripe checkout
- [ ] Wire sales reporting back to wholesale
- [ ] Update Cambridge TCG Shopify theme to consume wholesale API too
- [ ] Deprecate separate S3 price pipeline for Shopify

---

## 9. What This Unlocks

Once the storefront is a pure API consumer:

1. **Price consistency** — change once in wholesale, propagates everywhere
2. **Stock accuracy** — all channels decrement the same stock counter
3. **Simplified deployment** — storefront is stateless, zero DB ops
4. **Channel visibility** — wholesale admin sees Cambridge sales alongside eBay/wholesale
5. **Faster feature dev** — new game? Add to wholesale, storefront picks it up automatically
6. **Easier scaling** — ISR + CDN handles traffic spikes without touching the DB
7. **CardMarket ready** — same pattern for the next channel

---

*"One DB. One price. One truth. Everything else is a view."*
