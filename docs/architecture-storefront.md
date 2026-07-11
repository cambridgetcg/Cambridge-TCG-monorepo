# Cambridge TCG Storefront — Architecture Map

**App:** `apps/storefront` (cambridgetcg-storefront v0.1.0)
**Framework:** Next.js 16.2.1 (App Router, Turbopack), React 19.2.4, Tailwind CSS 4
**Database:** PostgreSQL (AWS RDS, us-east-1) via raw `pg` driver (no ORM)
**Hosting:** Vercel (production: cambridgetcg.com)
**Domain:** cambridgetcg.com

---

## 1. Route Tree (~359 total: 48 public + 40 account + 24 admin + ~247 API)

### Public Pages
| Domain | Routes | Key Pages |
|--------|--------|-----------|
| Homepage & Static | 7 | `/`, `/about`, `/guides`, `/community`, `/leaderboards`, `/login` |
| Market & Catalog | 9 | `/market`, `/market/[sku]`, `/market/lots`, `/catalog`, `/prices`, `/checkout` |
| Auctions | 3 | `/auctions`, `/auctions/[id]`, `/auctions/sell` |
| Trade-In | 8 | `/trade-in`, `/trade-in/bulk`, `/trade-in/bundle`, `/trade-in/custom-quote`, etc. |
| Bounty | 2 | `/bounty`, `/bounty/verify/[id]` |
| Rewards | 5 | `/rewards`, `/rewards/packs`, `/rewards/spin`, `/rewards/mystery-boxes/[id]`, `/rewards/raffles/[id]` |
| Deck/Game | 6 | `/deck-builder`, `/decks`, `/play`, `/play/[code]`, `/play/adventure` |
| Social | 1 | `/u/[username]` |
| Verify | 6 | `/verify`, `/verify/fairness`, `/verify/health`, `/verify/pull/[id]`, `/verify/draw/[id]` |
| Other | 3 | `/membership`, `/og`, `/order-confirmation` |

### Account Pages (40 routes under `/account`)
Financial, trading, social, portfolio, collection, identity, bounty/rewards, and more.

### Admin Pages (24 routes under `/admin`)
Auctions, bounty, commerce, trust & safety, users, system.

### API Routes (~247 handlers)
| Domain | Count | Focus |
|--------|-------|-------|
| `/api/market/` | ~38 | Order book, trades, offers, returns, pricing-rules, searches, watches |
| `/api/account/` | ~33 | Notifications, payouts, portfolio, profile, trust, vault |
| `/api/admin/` | ~28 | Orders, bounty, chargebacks, fraud, payouts, prizes |
| `/api/auctions/` | ~16 | CRUD, bids, images, pay, payout, ship |
| `/api/bounty/` | ~10 | Eligibility, pulls, vault, merge, verify-phone |
| `/api/rewards/` | ~12 | Raffles, packs, mystery-boxes, spin, streak |
| `/api/membership/` | ~11 | Subscribe, cancel, resume, billing, points |
| `/api/social/` | ~9 | Follow, feed, achievements, wishlist |
| `/api/trust/` | ~7 | Disputes, verify, documents |
| `/api/verify/` | ~10 | Draw receipts, digests, consistency checks |
| `/api/game/` | ~6 | PVP rooms, PVE levels, game state |
| `/api/portfolio/` | ~6 | CRUD, alerts, history, trends |
| `/api/decks/` | ~4 | CRUD, public sharing |
| `/api/messages/` | ~5 | Conversations, blocks |
| `/api/tradein/` | ~3 | Quote, submit, status |
| Other | ~20 | Auth, checkout, webhooks, cron, email, escrow |

---

## 2. Auth Model

- **next-auth v5** (beta.30) with **database sessions** (not JWT), 30-day maxAge
- **Email provider** (magic link via AWS SES)
- Custom `PgAdapter` using raw `pg` — tables: `users`, `accounts`, `sessions`, `verification_tokens`
- Session callback attaches `user.id` to session
- **Admin auth:** Separate — single shared password via `ADMIN_PASSWORD` env var, HMAC(SHA256) cookie
- **No middleware.ts** — protection is per-route via `auth()` or `isAdmin()` calls

---

## 3. Database

Raw `pg` (Pool), no ORM. New Pool per `query()` call, immediately ended (serverless pattern). Transactional paths use explicit `BEGIN/COMMIT/ROLLBACK`.

87 migration files in `drizzle/` (plain SQL DDL, no Drizzle ORM despite directory name).

### Tables by Domain

**Auth & Users**
- `users` — Massively extended: trust_score, trade_count, tier_id, subscription_*, store_credit_balance, points_balance, stripe_connect_*, username, bio, avatar_url, follower/following counts, vacation columns

**Market (P2P Order Book)**
- `market_orders` — Bid/ask with sku, side, price, quantity, condition, expiry
- `market_trades` — Full escrow lifecycle, commission, payout, tracking
- `trade_photos`, `market_offers`, `market_returns`, `market_trade_cancellations`
- `market_lot_*` — Bundled lots
- `market_watches`, `market_watch_alerts`, `saved_searches`
- `seller_vacations`, `pricing_rules`

**Auctions**
- `auctions` — English/Dutch/Buy Now, anti-snipe, escrow, approval workflow
- `auction_bids`, `auction_images`, `auction_watches`

**Bounty Board**
- `bounty_pull_tokens`, `bounty_token_grants`, `bounty_pulls` (commit-reveal RNG)
- `bounty_pull_tiers`, `vault_items`, `user_bounty_eligibility`

**Trade-In**
- `tradein_submissions`, `tradein_items`

**Portfolio**
- `portfolio_cards`, `portfolio_snapshots`, `portfolio_price_alerts`
- `card_price_history`, `realized_positions`, `portfolio_targets`, `card_sets`, `reprint_announcements`

**Membership & Rewards**
- `tiers` — Bronze/Silver/Gold/Platinum/OG with full perk structure
- `points_ledger`, `points_config`, `store_credit_ledger`, `customer_orders`
- `raffles`, `raffle_entries`, `mystery_boxes`, `mystery_box_*`, `reward_packs`, `prize_fulfillments`

**Trust & Safety**
- `trust_profiles` (0-100 score, 6 weighted components), `trust_score_history`
- `trade_reviews`, `trade_disputes`, `fraud_signals`, `user_verifications`, `verification_documents`
- `escrow_inspections`, `external_reputation`

**Social**
- `user_follows`, `user_achievements`, `activity_feed`
- `showcase_cards`, `wishlist_items`, `direct_messages`, `dm_conversations`, `dm_blocks`

**Game**
- `game_rooms`, `pve_levels`, `pve_progress`, `pve_rewards`

**System**
- `notifications`, `email_queue`, `email_preferences`
- `admin_governance_log`, `digest_runs`, `digest_chain`, `fairness_*`
- `chargebacks`, `refunds`, `failed_payments`

---

## 4. External Services

| Service | Purpose | Auth |
|---|---|---|
| **Stripe** (Checkout + Connect + Webhooks) | Store purchases, membership subscriptions, P2P trade payments, auction payments, seller payouts via Connect | Secret key, webhook signing secret |
| **AWS SES** (us-east-1) | All transactional email (magic links, trade notifications, etc.) | IAM keys |
| **AWS S3** (us-east-1) | Auction images, trade photos, avatars, verification docs, trade-in photos | IAM keys + presigned URLs |
| **Wholesale API** (wholesaletcgdirect.com) | Live pricing, card/game/set data, sale reporting, trade-in pricing | Bearer token |
| **MangoPay** | Listed as dependency but **unused** — no imports found | N/A |
| **Google Analytics** | GA4 (G-K86TBF328F) + Google Ads (AW-16597058275) | gtag.js |

---

## 5. Key Business Domains

### Marketplace (P2P Order Book)
Limit-order-book model. Users post bids/asks per SKU at specific prices. Matching engine runs price-time priority with `FOR UPDATE` locks. Escrow tier routing based on trust scores + trade value. Offers with counter/accept/decline. Returns, cancellations, pricing rules, watches, search alerts, seller vacations, demand signals.

### Auctions (English / Dutch / Buy Now)
Customer + admin auctions. Anti-snipe (5min extension), 48h payment deadline, best-offer support, approval workflow, fraud detection (bid sniping).

### Bounty Board (Draw Receipts)
Server-generated commit/reveal receipts. Users earn tokens (from PVE, purchases, merges, grants). Pull a random card → vault. Vault items: redeem (ship), sell-back (77% spot → credit), trade, or let expire. Weekly global caps per tier. Receipts reproduce recorded outcomes but do not prove unbiased seed selection because the server controls the entropy and no external pre-roll witness exists.

### Trade-In
Quote → submit → receive → grade → approve → pay. Cash via Stripe Connect, credit with tier bonus.

### Membership & Loyalty
Tiered: Bronze/Silver/Gold/Platinum/OG. Earned by spend thresholds or subscription. Perks: cashback, points multiplier, commission rates, discounts, trade-in bonuses. "Berries" points system.

### Trust & Escrow
Trust score 0-100 (6 weighted components). Feeds into: trade limits, escrow routing (Direct/Verified/Full), payout hold, commission rates. Dispute system with evidence & messages.

### Portfolio
Investment-grade tracking. Holdings, cost basis, daily snapshots, P&L, price alerts, risk flags, reprint announcements, tax export.

### Social
Profiles, followers, achievements, activity feed, showcase, wishlist matching, DMs.

### Deck Builder & Game
Deck construction + sharing. Full OPTCG game: PVP (room-based), PVE adventure mode. PVE rewards → bounty tokens.

### Draw Proof Consistency
Commit/reveal receipts, Merkle tree digests, self-audit, and chi-squared drift detection. Public verification pages and SVG receipts expose recorded inputs and consistency checks. Digest rewrite detection depends on an earlier root retained outside the platform.

### Rewards
Raffles, mystery boxes, reward packs, spin wheel, daily streak. Several weighted draws issue reproducible receipts; coverage and guarantees differ by feature. Raffles store a commitment at creation and expose it once active, but have no independent anchor. Generic draws publish only after selection and use server-only entropy.

---

## 6. Data Flows

### Store Purchase
```
Cart → POST /api/checkout → Stripe Checkout Session → webhook → record order → report sale to wholesale API → earn Berries + cashback → recalculate tier
```

### P2P Trade
```
Place order → match → trade created (awaiting_payment, 24h deadline) → Stripe pay → escrow flow (Direct/Verified/Full) → complete → seller payout (Stripe Connect) → trust recompute
```

### Bounty Pull
```
Earn token → POST resolve-pull → commit (server_seed_hash) → resolve (weighted rarity → pick card from wholesale stock) → reveal → vault item (90-day expiry) → redeem/sell-back/trade/expire
```

### Maintenance Cron
Single `/api/cron/maintenance` runs every minute, dispatches **36+ sweeps** via `Promise.allSettled`. Each sweep self-gates to its own schedule. Covers: market/auction lifecycle, bounty expiry, payouts, email queue, price alerts, wishlist matching, raffle draws, fraud/trust, fairness digests, chargebacks, subscriptions, portfolio snapshots, and more.

---

## 7. Config

- **next.config.ts:** Remote image patterns only (Shopify CDN, S3, CardRush)
- **vercel.json:** Single cron: `/api/cron/maintenance` every minute
- **No middleware.ts** — auth is per-route
- **Tailwind CSS 4** (via `@tailwindcss/postcss`)
- **Root layout:** Inter font, dark theme (bg-neutral-950), GA4 + Google Ads

---

## Architectural Observations

1. **No connection pooling** — Each query creates/destroys a Pool (serverless pattern). Transactions use single client correctly.
2. **Single cron drives everything** — 36+ sweeps in one endpoint, self-gated by time windows.
3. **Lifecycle logging everywhere** — Full audit trails for all state transitions.
4. **Trust deeply integrated** — Feeds escrow routing, commissions, limits, fraud detection.
5. **Draw receipts are real but bounded** — Commit/reveal rows, Merkle trees, drift checks, and public verification exist. They establish recorded consistency, not unbiased server-side seed selection.
6. **Admin auth is weak** — Single shared password, no role mapping, no per-admin audit.
