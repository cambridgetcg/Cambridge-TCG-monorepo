> **Type:** connection-doc · **Doctrines:** substrate-honesty, transparency, meaning · **Audience:** any builder touching B2B or auth · **Recursion target:** [`the-pricing-arrow.md`](./the-pricing-arrow.md) · **Self-citation:** named in the [README](./README.md) row 31. Companion to [`the-four-auth-realms.md`](./the-four-auth-realms.md) (S30).

# The B2B mini-app

For nine months Cambridge TCG ran two browser surfaces. `cambridgetcg.com` served retail customers. `wholesaletcgdirect.com` served B2B buyers. Two domains. Two cookie trees. Two `users` tables (one called `users`, one called `clients`). Two cart systems. Two checkout flows. Two order schemas. Two carefully co-evolving codebases held together by [the Falcon](./two-letters-and-a-falcon.md) — a Bearer-token courier between two kingdoms.

In one session on 2026-05-14 → 2026-05-15, the second kingdom became a **mini-app inside the first**. Six commits did it. This entry names what the mini-app *means* — what it connects, what it sets free, what it leaves load-bearing in the old shape until the migration that follows.

## The mini-app, located

Live at `cambridgetcg.com/account/b2b/*`. Six routes:

```
/account/b2b              ← landing
/account/b2b/catalog      ← browse at wholesale prices
/account/b2b/cards/[sku]  ← per-card detail
/account/b2b/cart         ← DB-backed cart
/account/b2b/checkout     ← final review
/account/b2b/checkout/success
/account/b2b/orders       ← history (list)
/account/b2b/orders/[id]  ← history (detail)
```

The whole subtree is gated by one helper in [`apps/storefront/src/lib/auth/realms.ts`](../../apps/storefront/src/lib/auth/realms.ts) — `requireWholesalePage()` — called once in the layout. Cookie presence is verified at the edge in [`proxy.ts`](../../apps/storefront/src/proxy.ts) (sub-millisecond, no DB hit); the role check happens in the Data Access Layer (one DB roundtrip per request, deduped via React `cache()`). This is the Option B pattern from the Next.js 16 authentication guide; the realm-topology doc [`the-four-auth-realms.md`](./the-four-auth-realms.md) (S30) named it as the foundation, and this kingdom is the first surface to live entirely under it.

## What it connects — and how

### Connection 1 — to the **single identity**

A B2B buyer is a row in the storefront's `users` table with `role='wholesale'`. Not a separate identity, not a federated session, not a parallel cookie — *the same person* as a retail customer would be, but with one column flipped. The login flow is the same magic-link as retail. The cookie is the same `__Secure-authjs.session-token` on `.cambridgetcg.com` as retail.

Three roles now share one identity model: `'user'` (the default retail consumer), `'wholesale'` (the B2B buyer inside `/account/b2b/*`), `'admin'` (the operator at `admin.cambridgetcg.com`). The schema enforces nothing — `users.role` is `VARCHAR(20)` with no CHECK — but [migration 0099](../../apps/storefront/drizzle/0099_wholesale_role.sql) writes a `COMMENT ON COLUMN` that names the valid vocabulary so a schema reader can find when each role was introduced. The convention is the gate.

This is what S30 named as **realm 1+2 sharing identity**, now extended to **1+2+wholesale**.

### Connection 2 — to the **wholesale RDS** (via the dual-key Falcon)

The mini-app's prices are wholesale-channel prices. Catalog, card detail, cart, checkout, order history — every numeric value flows from the wholesale RDS through the Falcon ([`apps/storefront/src/lib/wholesale/client.ts`](../../apps/storefront/src/lib/wholesale/client.ts)). After fix #2 of the 2026-05-14 auth-models pass ([`444edb2`](https://github.com/cambridge-tcg/cambridge-tcg-monorepo/commit/444edb2)), the wholesale `/api/v1/prices/*` endpoints hard-enforce `apiKey.channel` — the `?channel=` query param is logged-and-ignored. So fetching wholesale-channel prices requires a *second* API key registered with `channel='wholesale'`.

The Falcon learned to be dual-keyed in [`ced1b08`](https://github.com/cambridge-tcg/cambridge-tcg-monorepo/commit/ced1b08). `keyForChannel(channel)` swaps the Bearer based on the requested channel. `WHOLESALE_API_KEY` carries retail authority; `WHOLESALE_B2B_API_KEY` carries B2B authority. The same Falcon, the same flight pattern, two seals at the keeper's gate — one per kingdom-of-prices.

**This is what the consolidation costs at the substrate layer:** the wholesale RDS still exists, the Falcon still flies, two API keys are still needed. Phase 6 of the consolidation (deferred) would merge the wholesale tables into the storefront RDS; until then, the connection is live but mediated.

### Connection 3 — to **Stripe** (with B2B metadata routing)

The retail checkout at [`/api/checkout`](../../apps/storefront/src/app/api/checkout/route.ts) creates Stripe sessions with `metadata.skus` (a JSON array of retail-priced line items) plus `metadata.platinum_discount`, `metadata.credit_applied_gbp`, etc. The webhook at [`/api/webhooks/stripe`](../../apps/storefront/src/app/api/webhooks/stripe/route.ts) reads those keys to commit retail orders to `customer_orders` and apply retail-only side-effects (membership perks, store credit ledger).

The B2B checkout at [`startCheckout()`](../../apps/storefront/src/lib/b2b/checkout.ts) creates Stripe sessions with `metadata.b2b_channel = 'wholesale'`, `metadata.b2b_user_id`, `metadata.b2b_skus` (line items priced in pence at the moment of checkout). The webhook reads those keys via an **early branch**:

```ts
if (session.metadata?.b2b_channel === "wholesale") {
  await recordOrder(session);           // → b2b_orders
  await commitCartToSale(...);          // → wholesale stock ledger
  await clearCart(userId);              // → empty b2b_cart_items
  return;
}
// retail branch unchanged below
```

**Tagging-by-metadata-key is the connection's shape.** One Stripe account, one webhook handler, two flows that never touch each other's tables. Adding a third (auctions, trade-ins) would just add another early-branch.

### Connection 4 — to the **stock package** (single ledger, two checkout flows)

`@cambridge-tcg/stock` already knew nothing about retail vs wholesale — it took `(cardId, quantity, holder)` triples and reserved or committed. The B2B flow reuses [`reserveCartItems()`](../../apps/storefront/src/lib/stock/reservations.ts) verbatim. One stock ledger; two reservation holders distinguished by the Stripe session id prefix.

This is meaning-7 material: **the Cartographer doesn't need to learn about channels because the holder string is opaque to it.** A future fourth-channel checkout (auctions, marketplace consignment) would slot in for free.

## What it *doesn't* connect — yet

- **The wholesale `clients` table** (B2B legacy logins) is still there, still authenticating against `wholesaletcgdirect.com`. Phase 3 of the consolidation migrates those buyers into storefront `users` with `role='wholesale'`; their bcrypt passwords don't port (storefront is magic-link only) so they re-onboard via a welcome email.
- **The wholesale browser surfaces** (`/catalog`, `/orders`, `/admin/*` on wholesaletcgdirect.com) are still serving traffic. Phase 4 retires them by 301-redirecting the public pages to `cambridgetcg.com` and keeping only `/api/cron/*`, `/api/webhooks/*`, and `/api/v1/*` alive on the wholesale domain.
- **The admin operator view** of B2B orders is missing. Today the operator sees them at Stripe dashboard and in `b2b_orders` via psql. Phase 5 builds the admin surface at `admin.cambridgetcg.com/commerce/b2b-orders` reading `wsQuery` and `sfQuery` together.

## What it sets free

Three things, structurally:

1. **One cookie tree.** A buyer who logs into `cambridgetcg.com` once is logged in for retail AND B2B. The cookie domain is `.cambridgetcg.com` and only that. No more remembering which domain you were last on.
2. **One identity audit trail.** A buyer's B2B activity (carts, orders, returns) and retail activity (membership, store credit, reviews) share `user_id`. Admin views can join. Cross-cutting analytics become trivial.
3. **One deploy.** B2B changes ship in the storefront's Vercel build. No more "deploy storefront then deploy wholesale and hope they don't drift."

## The mini-app pattern, named

This is a reusable shape. Three properties define a Cambridge TCG mini-app:

- **A URL prefix** that lives inside the main app's domain (here: `/account/b2b/*`).
- **A layout-level role gate** that uses the DAL helper from `lib/auth/realms.ts`.
- **Channel routing logic** that scopes the mini-app's data fetches and writes to a separate column or table from the main app (here: `b2b_cart_items`, `b2b_orders`, `apiKey.channel='wholesale'`).

A future mini-app for *consignors* (sellers who consign cards to Cambridge TCG and need a portal for status + payouts) would follow the same shape: `/account/consign/*`, `requireConsignorPage()`, `consign_*` tables. A future mini-app for *judges* (tournament staff with read-access to event admin) would similarly: `/account/judge/*`, `requireJudgePage()`, scoped reads of tournament substrate.

**The pattern is: one app, many shells.** The platform stays whole; the audience shapes become local.

## Recursion targets

- [`the-pricing-arrow.md`](./the-pricing-arrow.md) (S17) — the canonical place to update once Phase 6 merges the wholesale RDS into storefront RDS. The Falcon would retire.
- [`the-four-auth-realms.md`](./the-four-auth-realms.md) (S30) — its companion. S30 named the topology; this doc names the first surface to live entirely under it.
- A future entry — `the-account-migration.md` — naming Phase 3 (bcrypt → magic-link transition for legacy B2B buyers) when that ships.

## Self-reference

This doc connects six commits + four substrate-honesty stances + three previously-unnamed mini-app properties into one shape. The commits are: [`122ed36`](https://github.com/cambridge-tcg/cambridge-tcg-monorepo/commit/122ed36) (Phase 1 shell skeleton), [`ced1b08`](https://github.com/cambridge-tcg/cambridge-tcg-monorepo/commit/ced1b08) (Phase 2.1 catalog + cards + auth refactor), [`0416250`](https://github.com/cambridge-tcg/cambridge-tcg-monorepo/commit/0416250) (Phase 2.2a cart), [`2e4153f`](https://github.com/cambridge-tcg/cambridge-tcg-monorepo/commit/2e4153f) (Phase 2.2b Stripe checkout), [`7be45a7`](https://github.com/cambridge-tcg/cambridge-tcg-monorepo/commit/7be45a7) (Phase 2.2c webhook + orders). The substrate-honesty stances are: prices recompute every render; the dual-key Falcon is named via a "setup pending" banner when `WHOLESALE_B2B_API_KEY` is unset; the orders page is honest about Phase 2.2c being the moment the loop closed; the mini-app pattern is named here so the next mini-app inherits it.

*One app. Many shells. The kingdom stays whole; each audience finds its door.*
