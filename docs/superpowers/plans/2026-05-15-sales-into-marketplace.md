# Sales-into-Marketplace Refounding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the storefront's retail B2C shape and refound the platform as a marketplace where CTCG (Official) is one of the sellers — projected synthetically from `wholesale.cards` via tightened `unified.ts`, badged honestly, and surfaced through `/cards/[sku]` as the canonical card page.

**Architecture:** Three sequential phases, each independently shippable with `pnpm verify` green. Phase A tightens the synthetic seller (Provenance + WhyLink + methodology). Phase B creates `/cards/[sku]/page.tsx` as the marketplace card page (lifts UI primitives into `lib/market/ui/`, folds in the kingdom-067 mirror) and materializes CTCG-Official takes via a service-user `users` row. Phase C deletes retail surfaces (`/product`, `/catalog`, `/c`, `/checkout`, `/order-confirmation`, `components/cart`), rebuilds the homepage as marketplace, and adds `audit:retail-shape`. No DDL migrations; one DML migration (CTCG service user row).

**Tech Stack:** Next.js 16.2.1 (App Router — **breaking changes from training data; read `node_modules/next/dist/docs/` before assuming**), React 19, Tailwind 4, TypeScript strict, raw `pg` driver (no ORM in storefront), next-auth v5, Stripe Connect, Playwright, Vitest. Workspace packages: `@cambridge-tcg/pricing`, `@cambridge-tcg/data-spec`.

**Spec:** `docs/superpowers/specs/2026-05-15-sales-into-marketplace-design.md`

---

## Spec correction (discovered during planning)

The spec's BEFORE diagram listed `/cards/[sku]` as the retail product page. Filesystem truth:

| Spec said | Filesystem | Implication |
|-----------|-----------|-------------|
| `/cards/[sku]` retail product page | **Does not exist.** Only `/cards/[sku]/market/page.tsx` (kingdom-067 mirror) lives under `/cards/[sku]/`. | Phase B **creates** `/cards/[sku]/page.tsx`; nothing to rewrite. |
| `/cart` retail cart | **No `/cart` route.** Cart UI is a drawer: `apps/storefront/src/components/cart/{AddToCart.tsx,CartDrawer.tsx}`. | Phase C deletes the component directory, not a route. |
| `/checkout/*` retail checkout | `apps/storefront/src/app/checkout/page.tsx` + `apps/storefront/src/app/api/checkout/`. | Phase C deletes both. |

The **actual retail flow** is:

- **Browse:** `apps/storefront/src/app/catalog/page.tsx`
- **Product detail:** `apps/storefront/src/app/product/[sku]/`
- **Card alias (canonical?):** `apps/storefront/src/app/c/[slug]/`
- **Cart drawer:** `apps/storefront/src/components/cart/{AddToCart.tsx,CartDrawer.tsx}`
- **Checkout:** `apps/storefront/src/app/checkout/page.tsx` + `apps/storefront/src/app/api/checkout/`
- **Confirmation:** `apps/storefront/src/app/order-confirmation/`

**B2B cart/checkout at `/account/b2b/cart` and `/account/b2b/checkout` is OUT OF SCOPE** (wholesale B2B survives per the spec).

This plan uses the actual paths throughout. The end-state design (marketplace at `/cards/[sku]`, CTCG (Official) badged, retail gone) is unchanged from the spec.

---

## CTCG-Official place-order decision (open question 2 + 3 from spec, resolved here)

The spec deferred to writing-plans: **materialize-at-take** (option i) vs **direct-fulfillment-branch** (option ii). Resolved: **option (i) materialize-at-take.**

**Why:** `market_trades` has FK columns `bid_order_id` and `ask_order_id` referencing `market_orders`. Direct-fulfillment without a real order row requires either sentinel UUIDs or FK relaxation — both are schema-changing. Materialize-at-take preserves the FK invariant and makes CTCG-Official trades indistinguishable from P2P in the audit trail. The cost is a one-time data migration (a `users` row for the CTCG service account).

**CTCG service user (open question 3 from spec):**
- `email`: `ctcg-official@cambridgetcg.com` (no inbox needed)
- `username`: `CTCG (Official)`
- `role`: `system` (new role value if not already in the enum; check at migration time)
- `name`: `Cambridge TCG (Official)`
- Pre-seeded trust score: Elite tier exemption (NULL or 100; the plan reads `users` schema to decide)
- A fixed UUID is committed to repo: `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` (chosen for legibility in the audit trail). Phase B's place-order branch uses this constant.

---

## File Structure (all three phases)

### Phase A — Tighten the synthetic seller

| File | Status | Responsibility |
|------|--------|----------------|
| `apps/storefront/src/lib/ui/SellerBadge.tsx` | new | Cross-cutting primitive: `<SellerBadge kind="ctcg-official" \| "p2p" … />` |
| `apps/storefront/src/lib/ui/SellerBadge.test.tsx` | new | Vitest unit tests for SellerBadge rendering branches |
| `apps/storefront/src/lib/ui/index.ts` | modify | Re-export SellerBadge through the barrel |
| `apps/admin/src/lib/ui/SellerBadge.tsx` | new | Admin mirror (same shape, admin theme) |
| `apps/admin/src/lib/ui/index.ts` | modify | Re-export through admin barrel |
| `apps/storefront/src/lib/market/unified.ts` | modify | Attach `_provenance` block to `HouseOrderEntry`; keep `is_house` discriminator |
| `apps/storefront/src/lib/market/types.ts` | modify | Add `_provenance` field shape to `HouseOrderEntry` if not already imported; export `ProvenanceMeta` type |
| `apps/storefront/src/app/cards/[sku]/market/page.tsx` | modify | Render `<SellerBadge kind="ctcg-official">` on `is_house` rows; `<SellerBadge kind="p2p">` on others |
| `apps/storefront/src/app/market/[sku]/page.tsx` | modify | Same |
| `docs/methodology/official-seller.md` | new | Canonical text — Liquidity is the product, market-making, commission model, fifth-question |
| `apps/storefront/src/app/methodology/official-seller/page.tsx` | new | Public methodology page |
| `apps/storefront/src/lib/manifest.ts` | modify | Register `methodology.topics["official-seller"]` |
| `docs/connections/the-official-seller.md` | new | Story-as-wire connection-doc; cites file:line |
| `docs/connections/README.md` | modify | Index entry for the new connection-doc |
| `docs/missions/kingdom-094.md` | new | Phase A mission card |
| `apps/storefront/tests/official-seller-badge.spec.ts` | new | Playwright e2e: badge renders + WhyLink target correct |

### Phase B — Reshape `/cards/[sku]` + lift UI primitives + materialize takes

| File | Status | Responsibility |
|------|--------|----------------|
| `apps/storefront/src/lib/market/ui/CardImage.tsx` | new | Image display, lazy, mobile-responsive, `<Provenance kind="synced" />` |
| `apps/storefront/src/lib/market/ui/SortControl.tsx` | new | Sort dropdown: price asc/desc, condition, seller trust, quantity, recency |
| `apps/storefront/src/lib/market/ui/ConditionFilter.tsx` | new | Cumulative filter: NM / LP+ / MP+ / any |
| `apps/storefront/src/lib/market/ui/SellerFilter.tsx` | new | CTCG-only / P2P-only / both |
| `apps/storefront/src/lib/market/ui/PriceCell.tsx` | new | Composed `formatPrice` + `<Provenance>`; branch on live vs synced |
| `apps/storefront/src/lib/market/ui/ListingRow.tsx` | new | One listings-table row |
| `apps/storefront/src/lib/market/ui/ListingsTable.tsx` | new | Header + filters + body; CTCG-Official pinned per condition band |
| `apps/storefront/src/lib/market/ui/index.ts` | new | Barrel re-exports |
| `apps/storefront/src/lib/market/ui/__tests__/SortControl.test.tsx` | new | Vitest |
| `apps/storefront/src/lib/market/ui/__tests__/ConditionFilter.test.tsx` | new | Vitest |
| `apps/storefront/src/lib/market/ui/__tests__/SellerFilter.test.tsx` | new | Vitest |
| `apps/storefront/src/lib/market/ui/__tests__/ListingsTable.test.tsx` | new | Vitest |
| `apps/storefront/src/lib/market/json-ld.ts` | new | Pure compute: build `Product` + `AggregateOffer` JSON-LD from a `CardMarket` |
| `apps/storefront/src/lib/market/json-ld.test.ts` | new | Vitest for the pure compute |
| `apps/storefront/src/app/cards/[sku]/page.tsx` | **new** | The marketplace card page — image + meta + listings table + 7 section bands + JSON-LD |
| `apps/storefront/src/app/cards/[sku]/market/page.tsx` | **delete** | Replaced by `page.tsx` above |
| `apps/storefront/drizzle/0099_ctcg_official_user.sql` | new | DML migration: INSERT CTCG service user row (idempotent) |
| `apps/storefront/src/lib/market/ctcg-official.ts` | new | Constants: `CTCG_OFFICIAL_USER_ID`, helpers `isCtcgOfficial(userId)`, `materializeCtcgAsk(sku, condition, qty)` — INSERTs market_orders row |
| `apps/storefront/src/app/market/[sku]/page.tsx` | modify | Detect `?seller=ctcg-official` query; call `materializeCtcgAsk` then proceed to existing place-order flow |
| `apps/storefront/src/lib/manifest.ts` | modify | Update `/cards/[sku]` description; remove `/cards/[sku]/market` entry |
| `apps/storefront/src/app/api/v1/status/route.ts` | modify | Adjust `ENVELOPE_COMPLIANT_PATHS` if it referenced `/cards/[sku]/market` |
| `docs/methodology/marketplace.md` | modify | Add `#sort` `#filter` anchors documenting the controls |
| `apps/storefront/src/app/methodology/marketplace/page.tsx` | modify | Same |
| `docs/connections/the-card-page.md` | new | Story-as-wire connection-doc |
| `docs/connections/the-market-mirror.md` | modify | Note the mirror has folded into `/cards/[sku]`; sections now live as bands |
| `docs/connections/README.md` | modify | Index entry for `the-card-page.md` |
| `docs/missions/kingdom-095.md` | new | Phase B mission card |
| `apps/storefront/tests/card-page.spec.ts` | new | Playwright e2e |

### Phase C — Retire retail, rebuild homepage, audit

| File | Status | Responsibility |
|------|--------|----------------|
| `apps/storefront/src/app/product/` | **delete tree** | Retail product detail route |
| `apps/storefront/src/app/catalog/` | **delete tree** | Retail catalog browse |
| `apps/storefront/src/app/c/` | **delete tree** (verify scope first) | Retail card-alias route (audit-discover then delete) |
| `apps/storefront/src/app/checkout/` | **delete tree** | Retail checkout |
| `apps/storefront/src/app/api/checkout/` | **delete tree** | Retail checkout API |
| `apps/storefront/src/app/order-confirmation/` | **delete tree** | Retail confirmation |
| `apps/storefront/src/components/cart/` | **delete tree** | `AddToCart.tsx` + `CartDrawer.tsx` |
| `apps/storefront/src/app/api/webhooks/stripe/route.ts` | modify | Surgically remove retail-order branch (`checkout.session.completed` for retail line items) |
| `apps/storefront/src/lib/orders/record.ts` | modify or delete | Delete `recordOrderFromStripeSession()` (retail writer); keep other order writers if any |
| `apps/storefront/src/lib/email/templates/` | modify | Delete retail order-confirmation + retail shipping templates |
| `apps/storefront/src/app/api/cron/reconcile-stripe/route.ts` | modify | Drop retail-customer-orders reconciliation branch (open question 9) |
| `apps/storefront/src/app/page.tsx` | rewrite | Marketplace homepage: hero + featured CTCG (Official) + recent tape + trending |
| `apps/storefront/src/app/layout.tsx` | modify | Remove retail header/footer references; install marketplace shell |
| `apps/storefront/src/components/Header.tsx` (or actual filename) | rewrite | Marketplace nav: Browse · Sellers · Sell · Account |
| Footer component (discover filename) | rewrite | Marketplace footer links |
| `apps/storefront/src/app/account/orders/page.tsx` | modify | Memorial header + snapshot Provenance pill on historical retail orders |
| `apps/storefront/scripts/audit-retail-shape.ts` | new | The new audit |
| `apps/storefront/package.json` | modify | Add `audit:retail-shape` script |
| `package.json` (root) | modify | Add root `audit:retail-shape` + chain into `audit` |
| `docs/methodology/pivot.md` | new | Canonical text of the refounding |
| `apps/storefront/src/app/methodology/pivot/page.tsx` | new | Public methodology page |
| `apps/storefront/src/lib/manifest.ts` | modify | Register `methodology.topics["pivot"]` |
| `docs/connections/the-new-foundation.md` | new | Story-as-wire connection-doc; cites all three phase commits |
| `docs/connections/README.md` | modify | Index entry |
| `docs/missions/kingdom-096.md` | new | Phase C mission card |
| `apps/storefront/tests/post-pivot.spec.ts` | new | Playwright e2e — 404s + homepage + Memorial header |

---

## Verification commands cheat-sheet

| Need | Command |
|------|---------|
| Typecheck (storefront) | `cd apps/storefront && npx tsc --noEmit -p tsconfig.json` |
| Typecheck (all) | `pnpm typecheck` (from repo root) |
| Vitest single file | `pnpm --filter cambridgetcg-storefront vitest run path/to/test` |
| Vitest watch | `pnpm --filter cambridgetcg-storefront vitest watch` |
| Playwright e2e | `pnpm --filter cambridgetcg-storefront test:e2e path/to/test` |
| Playwright smoke | `pnpm --filter cambridgetcg-storefront test:e2e:smoke` |
| All audits | `pnpm audit` |
| Single audit | `pnpm audit:honesty`, `pnpm audit:transparency`, `pnpm audit:creation`, `pnpm audit:nesting`, etc. |
| Umbrella gate | `pnpm verify` |
| Dev server (storefront on :3001) | `pnpm dev:storefront` |
| Regenerate state snapshot | `pnpm state:snapshot` |

---

# PHASE A — Tighten the synthetic seller

**Outcome:** CTCG synthetic injections wear `<Provenance kind="synced" />` and a `<SellerBadge kind="ctcg-official" />` with a `<WhyLink>` to a new `/methodology/official-seller`. No URL changes; no schema changes. Connection-doc + mission card ship in the same commit (story-as-wire).

---

## Task A1: Phase A mission card

**Files:**
- Create: `docs/missions/kingdom-094.md`

- [ ] **Step A1.1: Create the mission card with the frontmatter and body below**

```markdown
---
id: kingdom-094
title: Tighten the synthetic seller (CTCG-Official badge + methodology + connection-doc)
status: planned
paths:
  - apps/storefront/src/lib/ui/SellerBadge.tsx
  - apps/storefront/src/lib/market/unified.ts
  - docs/methodology/official-seller.md
  - docs/connections/the-official-seller.md
related:
  - kingdom-067
  - kingdom-049
will:
  - Yu's directive 2026-05-15 (sales-into-marketplace refounding)
  - Spec docs/superpowers/specs/2026-05-15-sales-into-marketplace-design.md
  - Plan docs/superpowers/plans/2026-05-15-sales-into-marketplace.md
---

# Tighten the synthetic seller

Make CTCG legible as a marketplace participant before any URL change. The
synthetic injection in `unified.ts` already labels house rows with
`is_house: true` + `label: "CTCG Store"`. This kingdom attaches Provenance
data to those rows, adds a `<SellerBadge>` primitive that renders the badge
+ a `<WhyLink>` to `/methodology/official-seller`, and ships the
methodology page + connection-doc as story-as-wire.

Phase A of the refounding (A → B → C). Each phase ships independently.

**The load-bearing sentence:** *"We become the market maker by participating in the market."*
```

- [ ] **Step A1.2: Verify mission card discoverable**

Run: `pnpm missions:list --available | grep kingdom-094`
Expected: line including `kingdom-094` and the title.

- [ ] **Step A1.3: Commit (mission card only)**

```bash
git add docs/missions/kingdom-094.md
git commit -m "$(cat <<'EOF'
docs(missions): kingdom-094 mission card — tighten the synthetic seller

Phase A of the sales-into-marketplace refounding. Plan:
docs/superpowers/plans/2026-05-15-sales-into-marketplace.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task A2: SellerBadge primitive (TDD)

**Files:**
- Create: `apps/storefront/src/lib/ui/SellerBadge.tsx`
- Create: `apps/storefront/src/lib/ui/SellerBadge.test.tsx`

- [ ] **Step A2.1: Write the failing test file**

Create `apps/storefront/src/lib/ui/SellerBadge.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SellerBadge } from "./SellerBadge";

describe("SellerBadge", () => {
  it("renders CTCG-Official kind with badge label, Provenance, and WhyLink", () => {
    render(
      <SellerBadge
        kind="ctcg-official"
        provenance={{
          kind: "synced",
          source: "wholesale.cards",
          asOf: "2026-05-15T10:00:00Z",
          retrievedAt: "2026-05-15T10:00:05Z",
          freshnessKey: "wholesale_cards_24h",
        }}
      />
    );
    expect(screen.getByText(/CTCG \(Official\)/i)).toBeInTheDocument();
    expect(screen.getByText(/synced/i)).toBeInTheDocument();
    const why = screen.getByRole("link", { name: /why/i });
    expect(why).toHaveAttribute("href", "/methodology/official-seller");
  });

  it("renders P2P kind with username and trust-tier-aware label", () => {
    render(
      <SellerBadge
        kind="p2p"
        userId="user-123"
        username="alice"
        trustScore={85}
      />
    );
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
    expect(screen.getByText(/Veteran/i)).toBeInTheDocument();
  });

  it("renders P2P with default tier when trust score is null/undefined", () => {
    render(<SellerBadge kind="p2p" userId="user-456" username="bob" />);
    expect(screen.getByText(/bob/i)).toBeInTheDocument();
    expect(screen.getByText(/New/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step A2.2: Run the test to verify it fails**

Run: `pnpm --filter cambridgetcg-storefront vitest run src/lib/ui/SellerBadge.test.tsx`
Expected: FAIL with "Cannot find module './SellerBadge'" or "SellerBadge is not exported".

- [ ] **Step A2.3: Create SellerBadge with the minimal implementation**

Create `apps/storefront/src/lib/ui/SellerBadge.tsx`:

```tsx
import { Provenance, type ProvenanceKind } from "./Provenance";
import { WhyLink } from "./WhyLink";
import { TrustTier } from "./TrustTier";

export interface SellerBadgeProvenance {
  kind: ProvenanceKind;
  source: string;
  asOf: string;
  retrievedAt: string;
  freshnessKey: string;
}

export type SellerBadgeProps =
  | {
      kind: "ctcg-official";
      provenance: SellerBadgeProvenance;
    }
  | {
      kind: "p2p";
      userId: string;
      username: string;
      trustScore?: number | null;
    };

function tierFromScore(score: number | null | undefined): string {
  if (score == null) return "New";
  if (score >= 95) return "Elite";
  if (score >= 80) return "Veteran";
  if (score >= 50) return "Trusted";
  if (score >= 20) return "Starter";
  return "New";
}

export function SellerBadge(props: SellerBadgeProps) {
  if (props.kind === "ctcg-official") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
        <svg
          className="h-3 w-3"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
            clipRule="evenodd"
          />
        </svg>
        <span>CTCG (Official)</span>
        <Provenance
          kind={props.provenance.kind}
          source={props.provenance.source}
          asOf={props.provenance.asOf}
          retrievedAt={props.provenance.retrievedAt}
          freshnessKey={props.provenance.freshnessKey}
        />
        <WhyLink href="/methodology/official-seller" />
      </span>
    );
  }
  const tier = tierFromScore(props.trustScore);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-300">
      <span className="font-medium">{props.username}</span>
      <TrustTier tier={tier} score={props.trustScore ?? null} />
    </span>
  );
}
```

- [ ] **Step A2.4: Verify Provenance and WhyLink prop shape against the existing primitives**

Run: `grep -A 20 "export.*Provenance" apps/storefront/src/lib/ui/Provenance.tsx | head -40`

If `Provenance` does NOT accept the props above (`kind`, `source`, `asOf`, `retrievedAt`, `freshnessKey`), adapt the SellerBadge call site to match the actual prop shape. **Do not change Provenance itself.** If TrustTier has a different signature, adapt likewise. The test code in A2.1 is authoritative for SellerBadge's outer API; the inner composition must match what the existing primitives expose.

- [ ] **Step A2.5: Run the test to verify it passes**

Run: `pnpm --filter cambridgetcg-storefront vitest run src/lib/ui/SellerBadge.test.tsx`
Expected: PASS (3/3 tests).

If any test fails due to a missing `@testing-library/react` import — install it: `pnpm --filter cambridgetcg-storefront add -D @testing-library/react jsdom`. Then add `test: { environment: "jsdom" }` to the storefront's vitest config if not already set. Re-run the test.

- [ ] **Step A2.6: Commit**

```bash
git add apps/storefront/src/lib/ui/SellerBadge.tsx apps/storefront/src/lib/ui/SellerBadge.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): SellerBadge primitive — CTCG-Official + P2P kinds

Two-mode primitive for the marketplace's seller attribution surface.
CTCG-Official renders the badge + Provenance pill + WhyLink to
/methodology/official-seller (kingdom-094 Phase A). P2P renders the
trader's username + a TrustTier chip resolved from their score.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task A3: Re-export SellerBadge through the storefront barrel

**Files:**
- Modify: `apps/storefront/src/lib/ui/index.ts`

- [ ] **Step A3.1: Add the export to the barrel**

Open `apps/storefront/src/lib/ui/index.ts`. Find the line that exports `WhyLink`:

```ts
export { WhyLink } from "./WhyLink";
```

Immediately after it, add:

```ts
export { SellerBadge, type SellerBadgeProps, type SellerBadgeProvenance } from "./SellerBadge";
```

- [ ] **Step A3.2: Verify import resolves**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json`
Expected: clean (no errors related to SellerBadge).

- [ ] **Step A3.3: Commit**

```bash
git add apps/storefront/src/lib/ui/index.ts
git commit -m "$(cat <<'EOF'
feat(ui): re-export SellerBadge through the storefront ui barrel

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task A4: Mirror SellerBadge into the admin UI barrel

**Files:**
- Create: `apps/admin/src/lib/ui/SellerBadge.tsx`
- Modify: `apps/admin/src/lib/ui/index.ts`

The admin app maintains its own `@/lib/ui` (different theme, denser tables). The CLAUDE.md cross-app rule is that primitives mirror in shape, not import across apps.

- [ ] **Step A4.1: Read the existing admin ui shape**

Run: `head -50 apps/admin/src/lib/ui/index.ts`
Note: the admin barrel may already expose Provenance, WhyLink, TrustTier (or admin equivalents). If it does not, do NOT introduce them in this task — log them as gaps and use admin-app-appropriate equivalents.

- [ ] **Step A4.2: Create the admin SellerBadge mirror**

Create `apps/admin/src/lib/ui/SellerBadge.tsx` with the same component shape as Task A2 but using admin's existing primitives. The component's exported API (`SellerBadgeProps` discriminated union) is IDENTICAL to the storefront mirror. The internal class names use the admin theme (lighter background, denser typography). If the admin app does not yet have a `<TrustTier>` primitive, the p2p branch can render just the username + the tier name as plain text; this is acceptable for Phase A (admin readers care less about the badge).

- [ ] **Step A4.3: Add re-export**

Open `apps/admin/src/lib/ui/index.ts`. Add at the end (preserving the existing barrel order):

```ts
export { SellerBadge, type SellerBadgeProps, type SellerBadgeProvenance } from "./SellerBadge";
```

- [ ] **Step A4.4: Typecheck the admin app**

Run: `cd apps/admin && npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step A4.5: Commit**

```bash
git add apps/admin/src/lib/ui/SellerBadge.tsx apps/admin/src/lib/ui/index.ts
git commit -m "$(cat <<'EOF'
feat(admin/ui): mirror SellerBadge into admin barrel

Same exported API as the storefront SellerBadge. Admin theme adaptation
internal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task A5: Attach Provenance data to synthetic injections in unified.ts

**Files:**
- Modify: `apps/storefront/src/lib/market/unified.ts`

- [ ] **Step A5.1: Extend `HouseOrderEntry` to carry provenance**

Open `apps/storefront/src/lib/market/unified.ts`. Find the existing `HouseOrderEntry` interface (around line 27):

```ts
export interface HouseOrderEntry extends OrderBookEntry {
  is_house?: boolean;
  is_credit?: boolean;
  label?: string;
  is_dynamic?: boolean;
  baseline_price?: string;
}
```

Add the new optional provenance field. Replace that interface with:

```ts
export interface HouseProvenance {
  kind: "synced";
  source: string;          // e.g. "wholesale.cards"
  asOf: string;            // ISO timestamp — when the upstream snapshot was taken
  retrievedAt: string;     // ISO timestamp — when we read it via Falcon
  freshnessKey: string;    // e.g. "wholesale_cards_24h"
}

export interface HouseOrderEntry extends OrderBookEntry {
  is_house?: boolean;
  is_credit?: boolean;
  label?: string;
  is_dynamic?: boolean;
  baseline_price?: string;
  _provenance?: HouseProvenance;
}
```

- [ ] **Step A5.2: Attach provenance when constructing houseAsk**

In the same file, find the houseAsk construction (around line 163):

```ts
const houseAsk: HouseOrderEntry = {
  price: tightenedAsk.toFixed(2),
  total_quantity: spotStock,
  order_count: 1,
  is_house: true,
  label: "CTCG Store",
  ...(tightenPct > 0 ? {
    is_dynamic: true,
    baseline_price: spotPrice.toFixed(2),
  } : {}),
};
```

Add the `_provenance` field. The `asOf` should come from the upstream `card` response if available (it's the freshness of the wholesale snapshot); fall back to `retrievedAt`. Replace with:

```ts
const nowIso = new Date().toISOString();
const houseAsk: HouseOrderEntry = {
  price: tightenedAsk.toFixed(2),
  total_quantity: spotStock,
  order_count: 1,
  is_house: true,
  label: "CTCG Store",
  _provenance: {
    kind: "synced",
    source: "wholesale.cards",
    asOf: card?.price_updated_at ?? nowIso,
    retrievedAt: nowIso,
    freshnessKey: "wholesale_cards_24h",
  },
  ...(tightenPct > 0 ? {
    is_dynamic: true,
    baseline_price: spotPrice.toFixed(2),
  } : {}),
};
```

If `card?.price_updated_at` doesn't exist on the fetchCard return type, replace it with whichever timestamp the wholesale catalog ships (run `grep -n "price_updated\|updated_at\|asOf" apps/storefront/src/lib/wholesale/client.ts | head -20`). If no upstream timestamp is exposed yet, use `nowIso` for both fields and add a comment: `// TODO upstream-timestamp: thread Falcon-side updated_at when wholesale exposes it`.

- [ ] **Step A5.3: Attach provenance when constructing houseBid**

Same file, around line 191:

```ts
const houseBid: HouseOrderEntry = {
  price: tightenedBid.toFixed(2),
  total_quantity: 999,
  order_count: 1,
  is_house: true,
  is_credit: true,
  label: "CTCG Credit",
  _provenance: {
    kind: "synced",
    source: "wholesale.cards",
    asOf: tradeinCreditItem?.computed_at ?? nowIso,
    retrievedAt: nowIso,
    freshnessKey: "wholesale_cards_24h",
  },
  ...(tightenPct > 0 ? {
    is_dynamic: true,
    baseline_price: tradeinCredit.toFixed(2),
  } : {}),
};
```

Adjust `tradeinCreditItem?.computed_at` to whatever timestamp the tradein price item ships (run `grep -n "computed_at\|updated_at" apps/storefront/src/lib/wholesale/client.ts | head -10`).

- [ ] **Step A5.4: Typecheck**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step A5.5: Commit**

```bash
git add apps/storefront/src/lib/market/unified.ts
git commit -m "$(cat <<'EOF'
feat(market): attach Provenance to synthetic CTCG injections

unified.ts's house ask + house bid now carry _provenance blocks
(kind: synced, source: wholesale.cards, freshness budget). The shape is
substrate-honest — synthetic projections of stock that lives upstream,
not live market_orders rows.

kingdom-094 Phase A. The badge primitive (SellerBadge) reads this block.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task A6: Wire `<SellerBadge>` into `/cards/[sku]/market` page

**Files:**
- Modify: `apps/storefront/src/app/cards/[sku]/market/page.tsx`

- [ ] **Step A6.1: Read the existing page to locate the order-book rendering**

Run: `head -200 apps/storefront/src/app/cards/[sku]/market/page.tsx`

Find where individual order book entries (`bids[]` / `asks[]`) are rendered. They likely come from the result of `getUnifiedMarketView(sku)` (per kingdom-067). Each entry has `is_house?: boolean`, `is_credit?: boolean`, and now `_provenance?: HouseProvenance`.

- [ ] **Step A6.2: Import SellerBadge**

At the top of the file, alongside other UI imports, add:

```ts
import { SellerBadge } from "@/lib/ui";
```

- [ ] **Step A6.3: Render the badge per row**

Find the JSX where each ask/bid row is rendered. Where the existing code renders a label or seller identification, replace or augment with:

```tsx
{row.is_house && row._provenance ? (
  <SellerBadge kind="ctcg-official" provenance={row._provenance} />
) : (
  <SellerBadge
    kind="p2p"
    userId={row.user_id ?? ""}
    username={row.user_name ?? "anonymous"}
    trustScore={row.trust_score ?? null}
  />
)}
```

If the existing rendering iterates over `OrderBookEntry` aggregated rows (rows that aggregate multiple orders, with `total_quantity` + `order_count` but no per-user data), the P2P branch should render `<SellerBadge kind="p2p" userId="" username={\`${row.order_count} sellers\`} />` instead. **The CTCG branch is the load-bearing one for Phase A; the P2P branch is exploratory.** A row that aggregates multiple P2P sellers may not need a SellerBadge — leave the existing rendering for those cases.

- [ ] **Step A6.4: Typecheck**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step A6.5: Visually verify in dev server**

Run: `pnpm dev:storefront`

Navigate to `http://localhost:3001/cards/<a-real-sku>/market` (pick any SKU with CTCG inventory from the wholesale.cards table). Expected: the CTCG row(s) now wear a "CTCG (Official)" amber badge with the Provenance pill (synced) and a `Why?` link pointing to `/methodology/official-seller` (the link will 404 until Task A8 — that's fine for this step).

If the badge does not render, check the browser console for prop-shape errors and the server console for SSR errors. Most likely cause: the existing page renders rows differently than expected — adjust step A6.3's branch.

- [ ] **Step A6.6: Commit**

```bash
git add apps/storefront/src/app/cards/[sku]/market/page.tsx
git commit -m "$(cat <<'EOF'
feat(market-mirror): wire SellerBadge onto unified order book

The /cards/[sku]/market mirror now badges CTCG injections explicitly.
P2P rows are rendered with the new primitive when per-user data is
available; aggregated rows fall back to existing rendering.

kingdom-094 Phase A.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task A7: Wire `<SellerBadge>` into `/market/[sku]` interactive page

**Files:**
- Modify: `apps/storefront/src/app/market/[sku]/page.tsx`

- [ ] **Step A7.1: Read the existing page**

Run: `head -200 apps/storefront/src/app/market/[sku]/page.tsx`

Locate the order-book rendering (similar to Task A6).

- [ ] **Step A7.2: Import + render SellerBadge**

Follow the same pattern as Task A6 (A6.2 + A6.3), adapted to this page's JSX.

- [ ] **Step A7.3: Typecheck + visually verify**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json` (clean).

Run: `pnpm dev:storefront`, navigate to `http://localhost:3001/market/<a-real-sku>` (one with CTCG inventory). Expected: badge visible on CTCG rows.

- [ ] **Step A7.4: Commit**

```bash
git add apps/storefront/src/app/market/[sku]/page.tsx
git commit -m "$(cat <<'EOF'
feat(market): wire SellerBadge onto the interactive /market/[sku] page

kingdom-094 Phase A.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task A8: Methodology canonical text — `docs/methodology/official-seller.md`

**Files:**
- Create: `docs/methodology/official-seller.md`

- [ ] **Step A8.1: Write the canonical methodology text**

Create `docs/methodology/official-seller.md` with this content (this is the doctrinal source; the public page in Task A9 mirrors it):

```markdown
# CTCG (Official) — the platform as participant

> *"We become the market maker by participating in the market."*

Cambridge TCG operates two-sided market-making on its own platform. The
operator is one of the sellers and one of the buyers. The marketplace
is not a venue *we host* in the sense of stepping outside it; we
participate in it on the same terms as any other party — with one
attribution: a verified badge marking us as the operator entity.

This page explains what the badge means, what it does not mean, and
how the substrate behind it stays honest.

## What the badge means

A `CTCG (Official)` row on a card's order book is:

- **A synthetic projection of catalog stock.** The order does not live
  in the `market_orders` table; it is computed at read time from the
  current state of `wholesale.cards` (the upstream catalog the operator
  maintains). The `<Provenance kind="synced" />` pill names this
  truthfully. The freshness budget is 24 hours; older projections fall
  out of the response.

- **Always available when stock is.** The injection runs whenever the
  catalog row has positive `stock`. There is no minimum holding period,
  no reservation queue — the projection is direct.

- **Subject to dynamic market-making.** When buyer pressure (active
  watches + price alerts) exceeds the depth of the P2P book by a
  configured margin, the CTCG ask tightens *downward* and the CTCG bid
  tightens *upward* — at most 3% in either direction. This is the
  liquidity provision the platform commits to. The tightening is visible
  on the row as an `is_dynamic` flag and the un-tightened baseline price
  is preserved in the response.

- **Commission-free to itself.** When CTCG fills its own ask (or when a
  buyer takes the CTCG bid), no platform commission is charged. The
  platform's profit on these transactions is the spread between
  retail and trade-in-credit, not a layered fee. This is a deliberate
  policy: layering a fee on top of the operator's own margin would
  obscure both numbers.

## What the badge does NOT mean

- **It is not a trust signal.** The badge does not say "more
  trustworthy" or "verified seller." Trust is a P2P concept; the
  operator is exempt from the trust-tier flywheel because it is not
  competing for the same trust signals. The relevant question for a
  buyer is not "is this seller trustworthy?" but "is the platform
  honest about its participation?" — the badge is the answer to the
  second question.

- **It is not a guarantee of fulfillment speed.** CTCG-Official
  fulfillment uses the same escrow tier routing as any other ask. The
  warehouse ships directly when the buyer's order completes; the
  escrow tier depends on the buyer's profile, not on the seller's
  identity.

- **It is not the only place CTCG inventory lives.** The same
  `wholesale.cards` substrate also feeds B2B partner orders, Shopify
  sync, eBay listings, tradein quotes. The badge specifically names
  the marketplace-shaped participation, not the entirety of the
  operator's commerce.

## The substrate chain

```
wholesale.cards (the catalog)
    ↓ Falcon (HTTP courier, 5s timeout)
apps/storefront/src/lib/wholesale/client.ts → fetchCard / fetchPrices
    ↓ in-process compose
apps/storefront/src/lib/market/unified.ts → getUnifiedMarketView()
    ↓ injects HouseOrderEntry with _provenance
SellerBadge (kind="ctcg-official") renders the badge + Provenance pill + WhyLink to this page
```

The pill and the link are not decorative. They are the surface of a
load-bearing claim: this row is a synced projection of upstream stock,
not a live limit order placed by a CTCG agent. The audit
`pnpm audit:honesty` enforces that synced values wear Provenance.

## Fifth question — for whom

The CTCG-Official attribution is rendered to all viewers. There are
three relationships the viewer might have to the operator:

1. **Buyer.** Sees the badge as "the platform is named as one of the
   sellers I can fill against." Substrate-honest about whose inventory
   they're buying.

2. **P2P seller.** Sees the badge as "the platform competes with my
   ask at certain price points." Transparent about whose orders they're
   ranking against.

3. **Auditor, researcher, sister platform, federation client.** Sees
   the badge as "the operator declares its market participation
   publicly, citable as `Provenance.source = wholesale.cards`."

The badge serves all three. It does not collapse them.

## Audit

The presence of CTCG-Official rows is auditable via:

- `GET /api/v1/cards/[sku]` (envelope-compliant; the `is_house` flag and
  `_provenance` block appear on synthetic rows).
- `GET /api/v1/status` (walks the manifest; CTCG-Official participation
  is named under the `marketplace` resource).
- `pnpm audit:honesty` (CI: no synthetic value lacks Provenance).
- `pnpm audit:transparency` (CI: every user-affecting decision wears a
  WhyLink — this page is one of those targets).

## Why the platform participates

Liquidity is the product. On a thin-volume card with few P2P participants,
a buyer who lands on the page finds an order book they can act on
*because* the operator commits to standing on both sides at known prices.
The spread between retail ask and trade-in credit is the platform's
margin and is auditable per-transaction. The platform's profit becomes
public: it is the number visible in the spread.

By participating legibly, the operator commits to a public spread it
cannot retroactively widen. This is the market-making discipline. The
badge is the signature on that commitment.

---

*Connection-doc:* [`docs/connections/the-official-seller.md`](../connections/the-official-seller.md)
```

- [ ] **Step A8.2: Verify markdown parses**

Run: `find /Users/you/Desktop/Cambridge-TCG-monorepo/docs/methodology -name "official-seller.md" -exec wc -l {} \;`
Expected: line count around 100–130 (depends on word-wrap).

- [ ] **Step A8.3: Commit (alongside Task A9 + A10 — see A10 commit)**

Hold off committing this file alone; it commits in the same set as the public page (A9) and the connection-doc (A10) so the methodology + page + connection ship together (story-as-wire).

---

## Task A9: Methodology public page — `apps/storefront/src/app/methodology/official-seller/page.tsx`

**Files:**
- Create: `apps/storefront/src/app/methodology/official-seller/page.tsx`

- [ ] **Step A9.1: Read an existing methodology page to match the shape**

Run: `cat apps/storefront/src/app/methodology/pricing/page.tsx | head -60`

Note: the methodology pages typically follow a `PageHeader` + sections shape, may use `<MathLang>` for formulas, and link back to the doctrines.

- [ ] **Step A9.2: Create the public page**

Create `apps/storefront/src/app/methodology/official-seller/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PageHeader, Card } from "@/lib/ui";

export const metadata: Metadata = {
  title: "CTCG (Official) — Methodology · Cambridge TCG",
  description:
    "How Cambridge TCG participates as a market maker on its own marketplace. What the CTCG (Official) badge means, how the synthetic injection stays substrate-honest, what the platform's spread commits to.",
};

export default function OfficialSellerMethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-neutral-200">
      <PageHeader
        title="CTCG (Official) — methodology"
        description="The platform as participant. What the badge means, what it does not."
      />

      <blockquote className="my-6 border-l-2 border-amber-500 bg-neutral-900/40 px-4 py-3 italic text-neutral-300">
        We become the market maker by participating in the market.
      </blockquote>

      <Card>
        <h2 className="text-lg font-semibold text-amber-300">What the badge means</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          A <code className="rounded bg-neutral-800 px-1">CTCG (Official)</code> row on a
          card's order book is a synthetic projection of catalog stock. The order does not live
          in <code className="rounded bg-neutral-800 px-1">market_orders</code>; it is computed
          at read time from the current state of <code className="rounded bg-neutral-800 px-1">wholesale.cards</code>.
          The <code className="rounded bg-neutral-800 px-1">Provenance</code> pill names this
          truthfully. The freshness budget is 24 hours.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-300">
          <li><strong>Always available when stock is.</strong> Whenever the catalog row has positive stock, the projection appears.</li>
          <li><strong>Subject to dynamic market-making.</strong> When buyer pressure exceeds P2P depth, the CTCG ask tightens down and the CTCG bid tightens up — capped at ±3%. Tightening is surfaced as <code className="rounded bg-neutral-800 px-1">is_dynamic</code> on the row.</li>
          <li><strong>Commission-free to itself.</strong> No layered platform fee on operator-side transactions. The platform's profit is the spread between retail ask and trade-in-credit, which is public.</li>
        </ul>
      </Card>

      <Card className="mt-4">
        <h2 className="text-lg font-semibold text-amber-300">What the badge does NOT mean</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-neutral-300">
          <li><strong>Not a trust signal.</strong> Trust is a P2P concept; the operator is exempt from the trust-tier flywheel.</li>
          <li><strong>Not a fulfillment guarantee.</strong> Escrow tier routing applies the same as any ask.</li>
          <li><strong>Not the only place CTCG inventory lives.</strong> Wholesale, Shopify sync, eBay, and tradein quotes draw from the same catalog.</li>
        </ul>
      </Card>

      <Card className="mt-4">
        <h2 className="text-lg font-semibold text-amber-300">The substrate chain</h2>
        <pre className="mt-2 overflow-x-auto rounded bg-neutral-900 p-3 text-xs text-neutral-300">{`wholesale.cards (the catalog)
    ↓ Falcon (HTTP courier, 5s timeout)
apps/storefront/src/lib/wholesale/client.ts
    ↓ in-process compose
apps/storefront/src/lib/market/unified.ts → getUnifiedMarketView()
    ↓ injects HouseOrderEntry with _provenance
SellerBadge renders badge + Provenance + WhyLink to this page`}</pre>
      </Card>

      <Card className="mt-4">
        <h2 className="text-lg font-semibold text-amber-300">Fifth question — for whom</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          The CTCG (Official) attribution is rendered to all viewers. Three viewer-relationships:
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-300">
          <li><strong>Buyer:</strong> "the platform is named as one of the sellers I can fill against."</li>
          <li><strong>P2P seller:</strong> "the platform competes with my ask at certain price points."</li>
          <li><strong>Auditor, researcher, sister platform, federation client:</strong> "the operator declares its market participation publicly."</li>
        </ol>
        <p className="mt-3 text-sm text-neutral-400">
          The badge serves all three relationships. It does not collapse them.
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="text-lg font-semibold text-amber-300">Why the platform participates</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          Liquidity is the product. On a thin-volume card with few P2P participants, a buyer
          who lands on the page finds an order book they can act on <em>because</em> the
          operator commits to standing on both sides at known prices. The spread between
          retail ask and trade-in credit is the platform's margin and is auditable per-transaction.
        </p>
        <p className="mt-3 text-sm text-neutral-300">
          By participating legibly, the operator commits to a public spread it cannot
          retroactively widen. This is the market-making discipline. The badge is the
          signature on that commitment.
        </p>
      </Card>

      <p className="mt-8 text-xs text-neutral-500">
        Connection-doc:{" "}
        <a
          href="https://github.com/cambridge-tcg/monorepo/blob/main/docs/connections/the-official-seller.md"
          className="text-amber-400 underline hover:no-underline"
        >
          the-official-seller.md
        </a>
        {" "}· Source:{" "}
        <a
          href="https://github.com/cambridge-tcg/monorepo/blob/main/docs/methodology/official-seller.md"
          className="text-amber-400 underline hover:no-underline"
        >
          docs/methodology/official-seller.md
        </a>
      </p>
    </div>
  );
}
```

- [ ] **Step A9.3: Typecheck**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json`
Expected: clean. If errors, most likely cause is the `Card` primitive's prop shape — adjust to match what `@/lib/ui` exports.

- [ ] **Step A9.4: Visually verify**

Run: `pnpm dev:storefront`. Navigate to `http://localhost:3001/methodology/official-seller`. Expected: page renders with the four cards (What it means / What it does NOT mean / Substrate chain / Fifth question / Why).

- [ ] **Step A9.5: Verify SellerBadge's WhyLink target is reachable**

Navigate to `http://localhost:3001/cards/<a-real-sku>/market`, click the `Why?` link on a CTCG row's badge. Expected: lands on `/methodology/official-seller`, no 404.

---

## Task A10: Connection-doc — `docs/connections/the-official-seller.md`

**Files:**
- Create: `docs/connections/the-official-seller.md`
- Modify: `docs/connections/README.md`

- [ ] **Step A10.1: Pick the next available story-as-wire slot number**

Run: `grep -E "^\| S[0-9]+ " docs/connections/README.md | tail -3`

The next available slot is the highest S-number + 1. Likely S37 or S38 depending on what sister has shipped. Use that number in the frontmatter below; this plan refers to it as `Snext`.

- [ ] **Step A10.2: Create the connection-doc**

Create `docs/connections/the-official-seller.md`. Substitute `Snext` with the actual slot number from A10.1.

```markdown
---
slot: Snext
shape: story-as-wire
domain: marketplace
kingdoms:
  - kingdom-094
related:
  - the-market-mirror.md
  - the-pricing-arrow.md
  - the-modules.md
cites:
  - apps/storefront/src/lib/market/unified.ts
  - apps/storefront/src/lib/ui/SellerBadge.tsx
  - docs/methodology/official-seller.md
date: 2026-05-15
author: Yu + Sophia (Opus 4.7 1M)
---

# the official seller

Phase A of the sales-into-marketplace refounding (`docs/superpowers/specs/2026-05-15-sales-into-marketplace-design.md`).

The operator has been making a market on its own platform since `kingdom-067`
(`apps/storefront/src/lib/market/unified.ts`) injected `is_house: true` rows
on both sides of every card's book. The injection worked. It just was not
named.

This is the kingdom that names it.

---

## what shipped

1. **Provenance.** Every synthetic injection in
   [`unified.ts:163`](../../apps/storefront/src/lib/market/unified.ts) and
   [`unified.ts:191`](../../apps/storefront/src/lib/market/unified.ts) now
   carries a `_provenance` block: `kind: synced`, `source: wholesale.cards`,
   `asOf`, `retrievedAt`, `freshnessKey: wholesale_cards_24h`. The substrate
   honestly declares: this row is a synced projection of upstream stock, not
   a live limit order.

2. **SellerBadge.** A new primitive at
   [`apps/storefront/src/lib/ui/SellerBadge.tsx`](../../apps/storefront/src/lib/ui/SellerBadge.tsx)
   renders either `kind="ctcg-official"` (badge + Provenance pill + WhyLink)
   or `kind="p2p"` (username + TrustTier chip). The badge is amber; the trust
   chip color is keyed to tier. The two visual modes encode the doctrinal
   distinction.

3. **Methodology page.** [`/methodology/official-seller`](../../apps/storefront/src/app/methodology/official-seller/page.tsx)
   explains what the badge means and what it does not. The page carries the
   load-bearing sentence: *"We become the market maker by participating in the market."*

4. **Wired in two readers.** Both `/cards/[sku]/market` (the kingdom-067
   mirror) and `/market/[sku]` (the interactive place-order page) now badge
   CTCG rows explicitly.

---

## what this connection names

Substrate honesty meets transparency. The operator's participation was
*technically* visible (the `is_house` flag was in the JSON response) but
*doctrinally* hidden (no badge, no provenance pill, no methodology page).
Phase A closes that gap.

The cosmology has not changed. The platform was already making a market.
What changed is the cosmology's *legibility*: the platform's position on
the value axis is now named publicly. Buyers who land on a card page see
"CTCG (Official)"; P2P sellers who place asks know the platform competes
with them at known prices; auditors can run `pnpm audit:honesty` and
verify synced values wear Provenance.

The badge is the signature on a public commitment: the spread between
retail ask and trade-in credit is the platform's margin, and that margin
cannot be retroactively widened without the wire being updated. The diff
in this commit is the wire.

---

## what does not change

- The matching engine. `matchOrders()` in `apps/storefront/src/lib/market/db.ts`
  is untouched in Phase A. CTCG synthetic asks are still not real
  `market_orders` rows; they live only in the response shape from `unified.ts`.
  (Phase B forces a decision: materialize-at-take at the moment of buy. See
  the spec's open question 2.)

- The trust-tier flywheel. CTCG-Official is exempt from trust scoring —
  it is not competing for the same signals as P2P sellers. The methodology
  page names this explicitly.

- The wholesale → marketplace pricing path. Falcon still couriers prices;
  the storefront still composes via `retailPrice()`. Phase A adds attribution
  to the projection, not new compute.

---

## doctrines

| Doctrine | How honored |
|----------|-------------|
| Substrate honesty | Synthetic injections wear `_provenance.kind: synced` |
| Transparency | `SellerBadge` carries `<WhyLink href="/methodology/official-seller" />`; the page is the public mechanism |
| Meaning | This document is the connection-naming for the bridge `wholesale.cards → unified.ts → SellerBadge → /methodology/official-seller` |
| Creation | Commit trailer: Yu's directive (sales-into-marketplace refounding) + Sophia trace + diff |
| Fifth question | Methodology page names three viewer relationships (buyer, P2P seller, auditor) — the badge serves all three without collapsing |

---

## next

Phase B reshapes `/cards/[sku]` as the marketplace card page and folds in
the kingdom-067 mirror. The badge primitive lands in the listings table
that Phase B builds. The materialize-at-take decision (the synthetic ask
gets a real `market_orders` row at buy time, owned by a CTCG service
account) is forced there.

Phase C retires the retail flow entirely. The badge persists; the badge
is the foundation that survives the refounding.

— Sophia, 2026-05-15.
```

- [ ] **Step A10.3: Add an index entry in `docs/connections/README.md`**

Open `docs/connections/README.md`. Find the story-arc series table (or list) where the existing S-numbered entries live. Add a row for `Snext` (the slot picked in A10.1):

```markdown
| Snext | the-official-seller.md | story-as-wire | marketplace | kingdom-094 | The badge that names the operator's market-making |
```

If the README's format differs, match the existing structure exactly. Do NOT change the format.

- [ ] **Step A10.4: Run the nesting audit**

Run: `pnpm audit:nesting`
Expected: no orphans, no dangling refs introduced by the new doc. If the audit flags missing back-references in related docs (e.g., `the-market-mirror.md` should now reference back), add one-line back-links.

- [ ] **Step A10.5: Commit the methodology + page + connection-doc + manifest**

This commit ships the doctrinal triplet (methodology canonical + public page + connection-doc) along with the manifest registration (next task A11). For atomic story-as-wire, complete Task A11 first, then commit both in one shot.

---

## Task A11: Register the methodology in the manifest

**Files:**
- Modify: `apps/storefront/src/lib/manifest.ts`

- [ ] **Step A11.1: Find the methodology.topics block**

Run: `grep -n "methodology" apps/storefront/src/lib/manifest.ts | head -20`

The relevant section is around line 177–280 (per the earlier read). Look for `methodology: {` and its `topics:` array.

- [ ] **Step A11.2: Add the new topic entry**

Inside the `topics` array, add a new entry matching the structure of existing entries. Example shape (adapt to actual code):

```ts
{
  id: "official-seller",
  title: "CTCG (Official) — methodology",
  description:
    "The platform as participant. What the badge means, what it does not. Liquidity is the product; participation is what makes price discovery possible on thin-volume cards.",
  consumer_url: "/methodology/official-seller",
  cosmology_axes: ["identity", "value"],
  source_doc: "docs/methodology/official-seller.md",
},
```

The exact field names depend on the existing entries — match them precisely. If unsure of `cosmology_axes`, use `["identity"]` (the badge is identity-axis-load-bearing).

- [ ] **Step A11.3: Typecheck**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step A11.4: Commit the methodology + page + connection-doc + manifest atomically**

```bash
git add docs/methodology/official-seller.md \
        apps/storefront/src/app/methodology/official-seller/page.tsx \
        docs/connections/the-official-seller.md \
        docs/connections/README.md \
        apps/storefront/src/lib/manifest.ts
git commit -m "$(cat <<'EOF'
feat(methodology+connection): the-official-seller — the badge that names market-making

Story-as-wire ship: docs/methodology/official-seller.md (canonical),
apps/storefront/src/app/methodology/official-seller/page.tsx (public),
docs/connections/the-official-seller.md (S-slot), manifest registration.

Load-bearing sentence:
"We become the market maker by participating in the market."

kingdom-094 Phase A.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task A12: Playwright e2e — badge renders + WhyLink target correct

**Files:**
- Create: `apps/storefront/tests/official-seller-badge.spec.ts`

- [ ] **Step A12.1: Identify a stable test SKU**

Pick any SKU known to have positive CTCG stock and at least one P2P order. If unsure, query the dev DB:

```sql
SELECT c.sku, c.stock
FROM cards c
WHERE c.stock > 0
LIMIT 5;
```

Use one of these SKUs in the test below. The test can either hard-code a SKU or read it from an env var `TEST_SKU` (set in CI). Hard-code for simplicity; document the value in a top comment.

- [ ] **Step A12.2: Write the failing e2e spec**

Create `apps/storefront/tests/official-seller-badge.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// SKU expected to carry CTCG (Official) inventory on staging/prod.
// If this SKU stops having stock, pick another via:
//   SELECT sku FROM cards WHERE stock > 0 LIMIT 1;
const SKU_WITH_CTCG_INVENTORY = "OP-OP01-001-EN-V1";

test.describe("CTCG (Official) badge", () => {
  test("renders the badge on /cards/[sku]/market for an in-stock SKU", async ({ page }) => {
    await page.goto(`/cards/${SKU_WITH_CTCG_INVENTORY}/market`);
    const badge = page.getByText(/CTCG \(Official\)/);
    await expect(badge.first()).toBeVisible();
  });

  test("badge's Why? link targets /methodology/official-seller", async ({ page }) => {
    await page.goto(`/cards/${SKU_WITH_CTCG_INVENTORY}/market`);
    const whyLink = page
      .locator("a", { hasText: /why/i })
      .filter({ has: page.locator(":scope") })
      .first();
    await expect(whyLink).toHaveAttribute("href", /\/methodology\/official-seller/);
  });

  test("methodology page renders the load-bearing sentence", async ({ page }) => {
    await page.goto("/methodology/official-seller");
    await expect(
      page.getByText(/We become the market maker by participating in the market/)
    ).toBeVisible();
  });
});
```

- [ ] **Step A12.3: Run the spec to verify it passes**

Run: `pnpm --filter cambridgetcg-storefront test:e2e tests/official-seller-badge.spec.ts`
Expected: all three tests pass.

If a test fails because the badge text differs (e.g., the implementation renders `CTCG Official` not `CTCG (Official)`), update either the test or the SellerBadge implementation to match. The doctrinally correct rendering is `CTCG (Official)` with parens.

- [ ] **Step A12.4: Commit**

```bash
git add apps/storefront/tests/official-seller-badge.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): CTCG (Official) badge + methodology page

Three checks: badge renders on /cards/[sku]/market for in-stock SKU,
Why? link targets /methodology/official-seller, methodology page
carries the load-bearing sentence.

kingdom-094 Phase A.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task A13: Phase A verification + mission done

**Files:**
- Modify: `docs/missions/kingdom-094.md` (status: planned → done)

- [ ] **Step A13.1: Run the full umbrella gate**

Run: `pnpm verify`
Expected: all audits green, all typechecks clean, all tests pass.

If `pnpm audit:transparency` flags the new badge — verify the WhyLink is wired. If `pnpm audit:honesty` flags the Provenance pill — verify the `_provenance` block is non-empty. If `pnpm audit:nesting` flags the new connection-doc — re-run after the index entry is added.

- [ ] **Step A13.2: Regenerate the state snapshot**

Run: `pnpm state:snapshot`
Expected: `docs/state.md` regenerated; commit changes if any.

- [ ] **Step A13.3: Mark mission card status: done**

Open `docs/missions/kingdom-094.md`. Change `status: planned` to `status: done`. Add a small closing note at the end:

```markdown
## shipped 2026-05-NN

- SellerBadge primitive (storefront + admin mirror)
- unified.ts attaches _provenance to synthetic injections
- /methodology/official-seller (canonical + public)
- docs/connections/the-official-seller.md (story-as-wire, Snext)
- Manifest registration
- Playwright e2e: official-seller-badge.spec.ts

`pnpm verify` green at boundary.
```

- [ ] **Step A13.4: Commit mission closure + state snapshot**

```bash
git add docs/missions/kingdom-094.md docs/state.md
git commit -m "$(cat <<'EOF'
docs(missions): kingdom-094 done — synthetic seller tightened

Phase A of the sales-into-marketplace refounding shipped.
`pnpm verify` green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

**Phase A boundary check.** Before proceeding to Phase B:

- [ ] `pnpm verify` clean
- [ ] Badge visible on a real SKU's market page (manual check)
- [ ] WhyLink reaches the methodology page (manual check)
- [ ] No regressions in existing audits (`pnpm audit:honesty`, `pnpm audit:transparency`, `pnpm audit:creation`, `pnpm audit:nesting`)

If any of these fail, stop. Resolve before Phase B.

---

# PHASE B — Reshape `/cards/[sku]` + lift UI primitives + materialize takes

**Outcome:** `/cards/[sku]/page.tsx` exists for the first time. It is the marketplace card page: image + meta + listings table (CTCG-Official pinned per condition band, P2P below) + 7 section bands ported from the kingdom-067 mirror + JSON-LD `Product`/`AggregateOffer`. The old `/cards/[sku]/market` is deleted. CTCG-Official takes are materialized at take time via a service-user `users` row — this preserves the FK invariant `market_trades.ask_order_id → market_orders.id` so the audit trail in `market_trades` stays uniform across P2P and operator fills.

---

## Task B1: Phase B mission card

**Files:**
- Create: `docs/missions/kingdom-095.md`

- [ ] **Step B1.1: Create the mission card**

```markdown
---
id: kingdom-095
title: Reshape /cards/[sku] as marketplace card page; lift UI primitives; materialize CTCG takes
status: planned
paths:
  - apps/storefront/src/app/cards/[sku]/page.tsx
  - apps/storefront/src/lib/market/ui/
  - apps/storefront/drizzle/0099_ctcg_official_user.sql
  - apps/storefront/src/lib/market/ctcg-official.ts
  - apps/storefront/src/app/market/[sku]/page.tsx
related:
  - kingdom-094
  - kingdom-067
  - kingdom-063
will:
  - Yu's directive 2026-05-15 (sales-into-marketplace refounding)
  - Spec docs/superpowers/specs/2026-05-15-sales-into-marketplace-design.md
  - Plan docs/superpowers/plans/2026-05-15-sales-into-marketplace.md
---

# Reshape /cards/[sku] + lift UI primitives + materialize takes

Phase B of the refounding. Creates /cards/[sku]/page.tsx (it does not
exist today — only /cards/[sku]/market/page.tsx from kingdom-067 does).
Folds the seven mirror sections into the new page as scroll-anchored
bands. Lifts UI primitives (CardImage, SortControl, ConditionFilter,
SellerFilter, PriceCell, ListingRow, ListingsTable) cleanly into
apps/storefront/src/lib/market/ui/. Introduces a CTCG service user
(materialize-at-take strategy for CTCG-Official buys).

After this kingdom ships, /cards/[sku] is the canonical front door and
/cards/[sku]/market is gone. Phase C will then retire the retail surfaces
that compete with /cards/[sku] for the canonical role (/product, /catalog,
/c, /checkout).
```

- [ ] **Step B1.2: Commit**

```bash
git add docs/missions/kingdom-095.md
git commit -m "$(cat <<'EOF'
docs(missions): kingdom-095 mission card — reshape /cards/[sku]

Phase B of the sales-into-marketplace refounding.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task B2: SortControl primitive (TDD)

**Files:**
- Create: `apps/storefront/src/lib/market/ui/SortControl.tsx`
- Create: `apps/storefront/src/lib/market/ui/__tests__/SortControl.test.tsx`

- [ ] **Step B2.1: Write the failing test**

Create `apps/storefront/src/lib/market/ui/__tests__/SortControl.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SortControl, type SortKey } from "../SortControl";

describe("SortControl", () => {
  it("renders all six sort options", () => {
    render(<SortControl value="price-asc" onChange={() => {}} />);
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    const options = select.querySelectorAll("option");
    expect(options).toHaveLength(6);
    const values = Array.from(options).map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual([
      "price-asc",
      "price-desc",
      "condition",
      "trust",
      "quantity",
      "recency",
    ]);
  });

  it("calls onChange with new key when user picks a different option", () => {
    const onChange = vi.fn();
    render(<SortControl value="price-asc" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "trust" } });
    expect(onChange).toHaveBeenCalledWith("trust" satisfies SortKey);
  });

  it("links to the marketplace methodology page via WhyLink", () => {
    render(<SortControl value="price-asc" onChange={() => {}} />);
    const why = screen.getByRole("link", { name: /why/i });
    expect(why).toHaveAttribute("href", expect.stringContaining("/methodology/marketplace#sort"));
  });
});
```

- [ ] **Step B2.2: Run to verify fail**

Run: `pnpm --filter cambridgetcg-storefront vitest run src/lib/market/ui/__tests__/SortControl.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step B2.3: Implement SortControl**

Create `apps/storefront/src/lib/market/ui/SortControl.tsx`:

```tsx
import { WhyLink } from "@/lib/ui";

export type SortKey =
  | "price-asc"
  | "price-desc"
  | "condition"
  | "trust"
  | "quantity"
  | "recency";

export interface SortControlProps {
  value: SortKey;
  onChange: (next: SortKey) => void;
}

const OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "price-asc",  label: "Price (low → high)" },
  { value: "price-desc", label: "Price (high → low)" },
  { value: "condition",  label: "Condition (NM → HP)" },
  { value: "trust",      label: "Seller trust (Elite → New)" },
  { value: "quantity",   label: "Quantity (most → least)" },
  { value: "recency",    label: "Recently listed" },
];

export function SortControl({ value, onChange }: SortControlProps) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-neutral-300">
      <span>Sort</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <WhyLink href="/methodology/marketplace#sort" />
    </label>
  );
}
```

- [ ] **Step B2.4: Run to verify pass**

Run: `pnpm --filter cambridgetcg-storefront vitest run src/lib/market/ui/__tests__/SortControl.test.tsx`
Expected: PASS (3/3).

- [ ] **Step B2.5: Commit**

```bash
git add apps/storefront/src/lib/market/ui/SortControl.tsx apps/storefront/src/lib/market/ui/__tests__/SortControl.test.tsx
git commit -m "$(cat <<'EOF'
feat(market/ui): SortControl primitive (TDD)

Six-option sort dropdown for the marketplace listings table.
WhyLink to /methodology/marketplace#sort.

kingdom-095 Phase B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task B3: ConditionFilter primitive (TDD)

**Files:**
- Create: `apps/storefront/src/lib/market/ui/ConditionFilter.tsx`
- Create: `apps/storefront/src/lib/market/ui/__tests__/ConditionFilter.test.tsx`

- [ ] **Step B3.1: Write failing test**

Create `apps/storefront/src/lib/market/ui/__tests__/ConditionFilter.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConditionFilter, type ConditionFilterValue } from "../ConditionFilter";

describe("ConditionFilter", () => {
  it("renders four cumulative pills", () => {
    render(<ConditionFilter value="any" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /any/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^NM$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /LP\+/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /MP\+/i })).toBeInTheDocument();
  });

  it("marks the active pill as selected", () => {
    render(<ConditionFilter value="LP+" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /LP\+/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /any/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange with the new value when a pill is clicked", () => {
    const onChange = vi.fn();
    render(<ConditionFilter value="any" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^NM$/i }));
    expect(onChange).toHaveBeenCalledWith("NM" satisfies ConditionFilterValue);
  });
});
```

- [ ] **Step B3.2: Run to verify fail**

Run: `pnpm --filter cambridgetcg-storefront vitest run src/lib/market/ui/__tests__/ConditionFilter.test.tsx`
Expected: FAIL.

- [ ] **Step B3.3: Implement**

Create `apps/storefront/src/lib/market/ui/ConditionFilter.tsx`:

```tsx
export type ConditionFilterValue = "any" | "NM" | "LP+" | "MP+";

export interface ConditionFilterProps {
  value: ConditionFilterValue;
  onChange: (next: ConditionFilterValue) => void;
}

const PILLS: Array<{ value: ConditionFilterValue; label: string }> = [
  { value: "any", label: "Any" },
  { value: "NM",  label: "NM" },
  { value: "LP+", label: "LP+" },
  { value: "MP+", label: "MP+" },
];

export function ConditionFilter({ value, onChange }: ConditionFilterProps) {
  return (
    <div className="inline-flex items-center gap-1 text-xs">
      <span className="mr-1 text-neutral-400">Condition</span>
      {PILLS.map((p) => {
        const pressed = p.value === value;
        return (
          <button
            key={p.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(p.value)}
            className={[
              "rounded px-2 py-0.5 ring-1 transition",
              pressed
                ? "bg-amber-500/20 text-amber-300 ring-amber-500/40"
                : "bg-neutral-900 text-neutral-300 ring-neutral-700 hover:bg-neutral-800",
            ].join(" ")}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// Pure filter applied at view time. Cumulative: "LP+" includes NM and LP.
export function passesConditionFilter(
  condition: string,
  filter: ConditionFilterValue
): boolean {
  if (filter === "any") return true;
  const ranked: Record<string, number> = { NM: 4, LP: 3, MP: 2, HP: 1 };
  const rank = ranked[condition.toUpperCase()] ?? 0;
  if (filter === "NM")  return rank >= 4;
  if (filter === "LP+") return rank >= 3;
  if (filter === "MP+") return rank >= 2;
  return true;
}
```

- [ ] **Step B3.4: Run to verify pass**

Run: `pnpm --filter cambridgetcg-storefront vitest run src/lib/market/ui/__tests__/ConditionFilter.test.tsx`
Expected: PASS.

- [ ] **Step B3.5: Commit**

```bash
git add apps/storefront/src/lib/market/ui/ConditionFilter.tsx apps/storefront/src/lib/market/ui/__tests__/ConditionFilter.test.tsx
git commit -m "$(cat <<'EOF'
feat(market/ui): ConditionFilter primitive (TDD)

Four cumulative pills: any / NM / LP+ / MP+. Pure
passesConditionFilter() helper for view-time filtering.

kingdom-095 Phase B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task B4: SellerFilter primitive (TDD)

**Files:**
- Create: `apps/storefront/src/lib/market/ui/SellerFilter.tsx`
- Create: `apps/storefront/src/lib/market/ui/__tests__/SellerFilter.test.tsx`

- [ ] **Step B4.1: Write failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SellerFilter, type SellerFilterValue } from "../SellerFilter";

describe("SellerFilter", () => {
  it("renders three pills with default 'both' selected", () => {
    render(<SellerFilter value="both" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /both/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onChange when a different pill is clicked", () => {
    const onChange = vi.fn();
    render(<SellerFilter value="both" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /ctcg only/i }));
    expect(onChange).toHaveBeenCalledWith("ctcg-only" satisfies SellerFilterValue);
  });
});
```

- [ ] **Step B4.2: Run to verify fail**

Run: `pnpm --filter cambridgetcg-storefront vitest run src/lib/market/ui/__tests__/SellerFilter.test.tsx`

- [ ] **Step B4.3: Implement**

Create `apps/storefront/src/lib/market/ui/SellerFilter.tsx`:

```tsx
export type SellerFilterValue = "both" | "ctcg-only" | "p2p-only";

export interface SellerFilterProps {
  value: SellerFilterValue;
  onChange: (next: SellerFilterValue) => void;
}

const PILLS: Array<{ value: SellerFilterValue; label: string }> = [
  { value: "both",      label: "Both" },
  { value: "ctcg-only", label: "CTCG only" },
  { value: "p2p-only",  label: "P2P only" },
];

export function SellerFilter({ value, onChange }: SellerFilterProps) {
  return (
    <div className="inline-flex items-center gap-1 text-xs">
      <span className="mr-1 text-neutral-400">Seller</span>
      {PILLS.map((p) => {
        const pressed = p.value === value;
        return (
          <button
            key={p.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(p.value)}
            className={[
              "rounded px-2 py-0.5 ring-1 transition",
              pressed
                ? "bg-amber-500/20 text-amber-300 ring-amber-500/40"
                : "bg-neutral-900 text-neutral-300 ring-neutral-700 hover:bg-neutral-800",
            ].join(" ")}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export function passesSellerFilter(isHouse: boolean, filter: SellerFilterValue): boolean {
  if (filter === "both") return true;
  if (filter === "ctcg-only") return isHouse;
  if (filter === "p2p-only") return !isHouse;
  return true;
}
```

- [ ] **Step B4.4: Run to verify pass + commit**

```bash
pnpm --filter cambridgetcg-storefront vitest run src/lib/market/ui/__tests__/SellerFilter.test.tsx
git add apps/storefront/src/lib/market/ui/SellerFilter.tsx apps/storefront/src/lib/market/ui/__tests__/SellerFilter.test.tsx
git commit -m "feat(market/ui): SellerFilter primitive — both/ctcg-only/p2p-only (TDD). kingdom-095. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B5: CardImage primitive

**Files:**
- Create: `apps/storefront/src/lib/market/ui/CardImage.tsx`

CardImage doesn't need a TDD test in vitest (it's mostly presentation); the Playwright e2e in Task B18 covers rendering. Build it lean.

- [ ] **Step B5.1: Implement**

```tsx
import { Provenance } from "@/lib/ui";

export interface CardImageProps {
  src: string | null;
  alt: string;
  /** Aspect ratio is preserved via Tailwind aspect-[5/7] (TCG card standard). */
  className?: string;
}

export function CardImage({ src, alt, className }: CardImageProps) {
  return (
    <div className={`relative aspect-[5/7] w-full overflow-hidden rounded-lg bg-neutral-900 ${className ?? ""}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
          No image
        </div>
      )}
      <div className="absolute bottom-1 left-1">
        <Provenance kind="synced" source="scryfall_images" />
      </div>
    </div>
  );
}
```

If `<Provenance>` doesn't accept just `kind` + `source`, drop the missing fields or pass empty strings. The `synced` annotation is the load-bearing part.

- [ ] **Step B5.2: Typecheck**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json`

- [ ] **Step B5.3: Commit**

```bash
git add apps/storefront/src/lib/market/ui/CardImage.tsx
git commit -m "feat(market/ui): CardImage primitive with synced Provenance. kingdom-095. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B6: PriceCell primitive

**Files:**
- Create: `apps/storefront/src/lib/market/ui/PriceCell.tsx`

- [ ] **Step B6.1: Implement**

```tsx
import { Provenance, type ProvenanceKind } from "@/lib/ui";
import { formatPrice } from "@/lib/format";

export interface PriceCellProps {
  /** GBP price as a number or numeric string. */
  price: number | string;
  /** "live" for P2P market_orders rows; "synced" for CTCG synthetic injections; "computed" for derived stats. */
  provenanceKind: ProvenanceKind;
  source?: string;
  asOf?: string;
}

export function PriceCell({ price, provenanceKind, source, asOf }: PriceCellProps) {
  const numeric = typeof price === "string" ? parseFloat(price) : price;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-sm tabular-nums text-neutral-100">
        {formatPrice(numeric)}
      </span>
      <Provenance kind={provenanceKind} source={source} asOf={asOf} />
    </span>
  );
}
```

- [ ] **Step B6.2: Typecheck + commit**

```bash
cd apps/storefront && npx tsc --noEmit -p tsconfig.json
cd ../..
git add apps/storefront/src/lib/market/ui/PriceCell.tsx
git commit -m "feat(market/ui): PriceCell — formatPrice + Provenance (live/synced/computed). kingdom-095. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B7: ListingRow primitive

**Files:**
- Create: `apps/storefront/src/lib/market/ui/ListingRow.tsx`

A ListingRow renders one row of the listings table. Inputs cover both CTCG-Official (synthetic) and P2P shapes; the component branches.

- [ ] **Step B7.1: Implement**

```tsx
import Link from "next/link";
import { SellerBadge } from "@/lib/ui";
import { PriceCell } from "./PriceCell";
import type { ProvenanceKind } from "@/lib/ui";

export interface ListingRowCtcgOfficial {
  kind: "ctcg-official";
  sku: string;
  condition: string;
  quantity: number;
  price: number | string;
  provenance: {
    kind: ProvenanceKind;
    source: string;
    asOf: string;
    retrievedAt: string;
    freshnessKey: string;
  };
}

export interface ListingRowP2p {
  kind: "p2p";
  sku: string;
  orderId: string;
  userId: string;
  username: string;
  trustScore: number | null;
  condition: string;
  quantity: number;
  price: number | string;
  allowOffers: boolean;
}

export type ListingRowProps = ListingRowCtcgOfficial | ListingRowP2p;

export function ListingRow(props: ListingRowProps) {
  if (props.kind === "ctcg-official") {
    return (
      <tr className="border-b border-neutral-800 bg-amber-500/5">
        <td className="px-3 py-2">
          <SellerBadge kind="ctcg-official" provenance={props.provenance} />
        </td>
        <td className="px-3 py-2 text-xs text-neutral-300">{props.condition}</td>
        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-neutral-300">
          {props.quantity}
        </td>
        <td className="px-3 py-2 text-right">
          <PriceCell
            price={props.price}
            provenanceKind="synced"
            source={props.provenance.source}
            asOf={props.provenance.asOf}
          />
        </td>
        <td className="px-3 py-2 text-right">
          <Link
            href={`/market/${props.sku}?action=take&seller=ctcg-official&condition=${encodeURIComponent(props.condition)}&qty=1`}
            className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-neutral-950 hover:bg-amber-400"
          >
            Buy
          </Link>
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-neutral-800">
      <td className="px-3 py-2">
        <SellerBadge
          kind="p2p"
          userId={props.userId}
          username={props.username}
          trustScore={props.trustScore}
        />
      </td>
      <td className="px-3 py-2 text-xs text-neutral-300">{props.condition}</td>
      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-neutral-300">
        {props.quantity}
      </td>
      <td className="px-3 py-2 text-right">
        <PriceCell price={props.price} provenanceKind="live" />
      </td>
      <td className="px-3 py-2 text-right">
        {props.allowOffers ? (
          <Link
            href={`/market/${props.sku}?action=offer&order_id=${encodeURIComponent(props.orderId)}`}
            className="rounded bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
          >
            Make offer
          </Link>
        ) : (
          <Link
            href={`/market/${props.sku}?action=take&order_id=${encodeURIComponent(props.orderId)}`}
            className="rounded bg-emerald-500 px-3 py-1 text-xs font-medium text-neutral-950 hover:bg-emerald-400"
          >
            Buy
          </Link>
        )}
      </td>
    </tr>
  );
}
```

- [ ] **Step B7.2: Typecheck + commit**

```bash
cd apps/storefront && npx tsc --noEmit -p tsconfig.json && cd ../..
git add apps/storefront/src/lib/market/ui/ListingRow.tsx
git commit -m "feat(market/ui): ListingRow — CTCG-Official + P2P branches. kingdom-095. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B8: ListingsTable composer (TDD)

**Files:**
- Create: `apps/storefront/src/lib/market/ui/ListingsTable.tsx`
- Create: `apps/storefront/src/lib/market/ui/__tests__/ListingsTable.test.tsx`

ListingsTable is the central composer — it pins CTCG-Official rows per condition band and applies SortControl / ConditionFilter / SellerFilter.

- [ ] **Step B8.1: Write failing test**

Create `apps/storefront/src/lib/market/ui/__tests__/ListingsTable.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { sortAndFilterListings, type Listing } from "../ListingsTable";

const ctcg: Listing = {
  kind: "ctcg-official",
  sku: "X-1",
  condition: "NM",
  quantity: 5,
  price: 10,
  provenance: {
    kind: "synced",
    source: "wholesale.cards",
    asOf: "2026-05-15T10:00:00Z",
    retrievedAt: "2026-05-15T10:00:05Z",
    freshnessKey: "wholesale_cards_24h",
  },
};

const p2pCheap: Listing = {
  kind: "p2p",
  sku: "X-1",
  orderId: "o1",
  userId: "u1",
  username: "alice",
  trustScore: 60,
  condition: "NM",
  quantity: 1,
  price: 9.5,
  allowOffers: false,
};

const p2pExpensive: Listing = {
  kind: "p2p",
  sku: "X-1",
  orderId: "o2",
  userId: "u2",
  username: "bob",
  trustScore: 90,
  condition: "LP",
  quantity: 2,
  price: 12,
  allowOffers: true,
};

describe("sortAndFilterListings", () => {
  it("pins CTCG-Official to the top of each condition band, then sorts P2P", () => {
    const listings = [p2pExpensive, p2pCheap, ctcg];
    const out = sortAndFilterListings(listings, {
      sort: "price-asc",
      condition: "any",
      seller: "both",
    });
    // NM band: ctcg first, then p2pCheap; then LP band: p2pExpensive
    expect(out.map((l) => l.condition + "-" + (l.kind === "p2p" ? l.username : "CTCG"))).toEqual([
      "NM-CTCG",
      "NM-alice",
      "LP-bob",
    ]);
  });

  it("filters by condition cumulatively", () => {
    const listings = [ctcg, p2pCheap, p2pExpensive]; // NM, NM, LP
    const out = sortAndFilterListings(listings, {
      sort: "price-asc",
      condition: "NM",
      seller: "both",
    });
    expect(out.every((l) => l.condition === "NM")).toBe(true);
    expect(out).toHaveLength(2);
  });

  it("filters by seller", () => {
    const listings = [ctcg, p2pCheap];
    expect(
      sortAndFilterListings(listings, { sort: "price-asc", condition: "any", seller: "ctcg-only" })
    ).toHaveLength(1);
    expect(
      sortAndFilterListings(listings, { sort: "price-asc", condition: "any", seller: "p2p-only" })
    ).toHaveLength(1);
  });

  it("sorts by trust descending (Elite first)", () => {
    const out = sortAndFilterListings([p2pCheap, p2pExpensive], {
      sort: "trust",
      condition: "any",
      seller: "p2p-only",
    });
    expect(out.map((l) => (l.kind === "p2p" ? l.username : ""))).toEqual(["bob", "alice"]);
  });
});
```

- [ ] **Step B8.2: Run to verify fail**

Run: `pnpm --filter cambridgetcg-storefront vitest run src/lib/market/ui/__tests__/ListingsTable.test.tsx`

- [ ] **Step B8.3: Implement**

Create `apps/storefront/src/lib/market/ui/ListingsTable.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { ListingRow, type ListingRowCtcgOfficial, type ListingRowP2p } from "./ListingRow";
import { SortControl, type SortKey } from "./SortControl";
import { ConditionFilter, type ConditionFilterValue, passesConditionFilter } from "./ConditionFilter";
import { SellerFilter, type SellerFilterValue, passesSellerFilter } from "./SellerFilter";

export type Listing = ListingRowCtcgOfficial | ListingRowP2p;

const CONDITION_ORDER: Record<string, number> = { NM: 4, LP: 3, MP: 2, HP: 1 };

export interface SortFilterState {
  sort: SortKey;
  condition: ConditionFilterValue;
  seller: SellerFilterValue;
}

/**
 * Pure function: pin CTCG-Official to the top of each condition band, then sort
 * remaining P2P within each band by the requested key. Applies condition + seller filters.
 */
export function sortAndFilterListings(
  listings: Listing[],
  state: SortFilterState
): Listing[] {
  const filtered = listings.filter((l) => {
    if (!passesConditionFilter(l.condition, state.condition)) return false;
    if (!passesSellerFilter(l.kind === "ctcg-official", state.seller)) return false;
    return true;
  });

  // Group by condition; within each, CTCG first, then P2P sorted by state.sort.
  const groups = new Map<string, Listing[]>();
  for (const l of filtered) {
    const key = l.condition.toUpperCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l);
  }

  // Sort condition keys by CONDITION_ORDER desc (NM bands first).
  const sortedKeys = Array.from(groups.keys()).sort(
    (a, b) => (CONDITION_ORDER[b] ?? 0) - (CONDITION_ORDER[a] ?? 0)
  );

  const out: Listing[] = [];
  for (const key of sortedKeys) {
    const band = groups.get(key)!;
    const ctcg = band.filter((l) => l.kind === "ctcg-official");
    const p2p  = band.filter((l) => l.kind === "p2p");

    p2p.sort((a, b) => {
      const ap = typeof a.price === "string" ? parseFloat(a.price) : a.price;
      const bp = typeof b.price === "string" ? parseFloat(b.price) : b.price;
      if (state.sort === "price-asc")  return ap - bp;
      if (state.sort === "price-desc") return bp - ap;
      if (state.sort === "quantity")   return b.quantity - a.quantity;
      if (state.sort === "trust") {
        const at = a.kind === "p2p" ? a.trustScore ?? 0 : 100;
        const bt = b.kind === "p2p" ? b.trustScore ?? 0 : 100;
        return bt - at;
      }
      // "condition" already grouped; "recency" needs createdAt on the row — fall back to price asc
      return ap - bp;
    });

    out.push(...ctcg, ...p2p);
  }
  return out;
}

export interface ListingsTableProps {
  sku: string;
  listings: Listing[];
}

export function ListingsTable({ sku, listings }: ListingsTableProps) {
  const [state, setState] = useState<SortFilterState>({
    sort: "price-asc",
    condition: "any",
    seller: "both",
  });

  const rows = useMemo(() => sortAndFilterListings(listings, state), [listings, state]);

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-950/50">
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-3 py-2">
        <SortControl value={state.sort} onChange={(sort) => setState((s) => ({ ...s, sort }))} />
        <ConditionFilter
          value={state.condition}
          onChange={(condition) => setState((s) => ({ ...s, condition }))}
        />
        <SellerFilter
          value={state.seller}
          onChange={(seller) => setState((s) => ({ ...s, seller }))}
        />
      </header>
      <table className="w-full text-left">
        <thead className="text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-3 py-2">Seller</th>
            <th className="px-3 py-2">Condition</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-right">Price</th>
            <th className="px-3 py-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-xs text-neutral-500">
                No listings match the current filters.
              </td>
            </tr>
          ) : (
            rows.map((l, idx) => (
              <ListingRow
                key={`${l.kind === "p2p" ? l.orderId : "ctcg"}-${idx}`}
                {...l}
              />
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step B8.4: Run to verify pass**

Run: `pnpm --filter cambridgetcg-storefront vitest run src/lib/market/ui/__tests__/ListingsTable.test.tsx`
Expected: PASS (4/4).

- [ ] **Step B8.5: Commit**

```bash
git add apps/storefront/src/lib/market/ui/ListingsTable.tsx apps/storefront/src/lib/market/ui/__tests__/ListingsTable.test.tsx
git commit -m "feat(market/ui): ListingsTable composer — CTCG pinned per condition band (TDD). kingdom-095. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B9: Barrel index for market/ui

**Files:**
- Create: `apps/storefront/src/lib/market/ui/index.ts`

- [ ] **Step B9.1: Implement**

```ts
export { CardImage, type CardImageProps } from "./CardImage";
export { SortControl, type SortKey, type SortControlProps } from "./SortControl";
export {
  ConditionFilter,
  type ConditionFilterValue,
  type ConditionFilterProps,
  passesConditionFilter,
} from "./ConditionFilter";
export {
  SellerFilter,
  type SellerFilterValue,
  type SellerFilterProps,
  passesSellerFilter,
} from "./SellerFilter";
export { PriceCell, type PriceCellProps } from "./PriceCell";
export {
  ListingRow,
  type ListingRowProps,
  type ListingRowCtcgOfficial,
  type ListingRowP2p,
} from "./ListingRow";
export {
  ListingsTable,
  type Listing,
  type ListingsTableProps,
  type SortFilterState,
  sortAndFilterListings,
} from "./ListingsTable";
```

- [ ] **Step B9.2: Typecheck + commit**

```bash
cd apps/storefront && npx tsc --noEmit -p tsconfig.json && cd ../..
git add apps/storefront/src/lib/market/ui/index.ts
git commit -m "feat(market/ui): barrel exports for the listings UI subdomain. kingdom-095. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B10: JSON-LD `Product` + `AggregateOffer` composer (TDD)

**Files:**
- Create: `apps/storefront/src/lib/market/json-ld.ts`
- Create: `apps/storefront/src/lib/market/json-ld.test.ts`

- [ ] **Step B10.1: Write failing test**

Create `apps/storefront/src/lib/market/json-ld.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCardJsonLd } from "./json-ld";

const cardMeta = {
  sku: "OP-OP01-001-EN-V1",
  name: "Monkey D. Luffy",
  setName: "Romance Dawn",
  imageUrl: "https://example.com/luffy.jpg",
};

const listings = [
  { kind: "ctcg-official" as const, condition: "NM", price: 10.5, quantity: 5 },
  { kind: "p2p" as const, condition: "NM", price: 9.99, quantity: 1, sellerUsername: "alice" },
  { kind: "p2p" as const, condition: "LP", price: 8.50, quantity: 2, sellerUsername: "bob" },
];

describe("buildCardJsonLd", () => {
  it("emits a Product with AggregateOffer + individual Offers", () => {
    const ld = buildCardJsonLd(cardMeta, listings, "https://cambridgetcg.com");
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Product");
    expect(ld.name).toBe("Monkey D. Luffy");
    expect(ld.sku).toBe("OP-OP01-001-EN-V1");
    expect(ld.image).toBe("https://example.com/luffy.jpg");
    expect(ld.url).toBe("https://cambridgetcg.com/cards/OP-OP01-001-EN-V1");
    const agg = ld.offers as { "@type": string; lowPrice: string; highPrice: string; offerCount: number; priceCurrency: string };
    expect(agg["@type"]).toBe("AggregateOffer");
    expect(agg.priceCurrency).toBe("GBP");
    expect(agg.offerCount).toBe(3);
    expect(agg.lowPrice).toBe("8.50");
    expect(agg.highPrice).toBe("10.50");
  });

  it("emits empty AggregateOffer when no listings", () => {
    const ld = buildCardJsonLd(cardMeta, [], "https://cambridgetcg.com");
    const agg = ld.offers as { offerCount: number };
    expect(agg.offerCount).toBe(0);
  });
});
```

- [ ] **Step B10.2: Run to verify fail**

Run: `pnpm --filter cambridgetcg-storefront vitest run src/lib/market/json-ld.test.ts`

- [ ] **Step B10.3: Implement**

Create `apps/storefront/src/lib/market/json-ld.ts`:

```ts
export interface CardMetaForLd {
  sku: string;
  name: string;
  setName: string | null;
  imageUrl: string | null;
}

export type LdListing =
  | { kind: "ctcg-official"; condition: string; price: number; quantity: number }
  | { kind: "p2p"; condition: string; price: number; quantity: number; sellerUsername: string };

export interface ProductJsonLd {
  "@context": "https://schema.org";
  "@type": "Product";
  name: string;
  sku: string;
  image: string | null;
  url: string;
  description?: string;
  offers: AggregateOfferJsonLd;
}

export interface AggregateOfferJsonLd {
  "@type": "AggregateOffer";
  priceCurrency: "GBP";
  lowPrice: string;
  highPrice: string;
  offerCount: number;
  offers: OfferJsonLd[];
}

export interface OfferJsonLd {
  "@type": "Offer";
  price: string;
  priceCurrency: "GBP";
  itemCondition: string;
  availability: "https://schema.org/InStock";
  seller: { "@type": "Organization" | "Person"; name: string };
}

const SCHEMA_CONDITION: Record<string, string> = {
  NM: "https://schema.org/NewCondition",
  LP: "https://schema.org/UsedCondition",
  MP: "https://schema.org/UsedCondition",
  HP: "https://schema.org/DamagedCondition",
};

export function buildCardJsonLd(
  meta: CardMetaForLd,
  listings: LdListing[],
  baseUrl: string
): ProductJsonLd {
  const prices = listings.map((l) => l.price);
  const low = prices.length ? Math.min(...prices) : 0;
  const high = prices.length ? Math.max(...prices) : 0;

  const offers: OfferJsonLd[] = listings.map((l) => ({
    "@type": "Offer",
    price: l.price.toFixed(2),
    priceCurrency: "GBP",
    itemCondition: SCHEMA_CONDITION[l.condition.toUpperCase()] ?? "https://schema.org/UsedCondition",
    availability: "https://schema.org/InStock",
    seller:
      l.kind === "ctcg-official"
        ? { "@type": "Organization", name: "Cambridge TCG (Official)" }
        : { "@type": "Person", name: l.sellerUsername },
  }));

  const description = `${meta.name}${meta.setName ? ` (${meta.setName})` : ""} — ${listings.length} listing${listings.length === 1 ? "" : "s"} on Cambridge TCG. ${prices.length ? `From £${low.toFixed(2)} to £${high.toFixed(2)}.` : "No live listings."}`;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: meta.name,
    sku: meta.sku,
    image: meta.imageUrl,
    url: `${baseUrl}/cards/${meta.sku}`,
    description,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "GBP",
      lowPrice: low.toFixed(2),
      highPrice: high.toFixed(2),
      offerCount: listings.length,
      offers,
    },
  };
}
```

- [ ] **Step B10.4: Run to verify pass + commit**

```bash
pnpm --filter cambridgetcg-storefront vitest run src/lib/market/json-ld.test.ts
git add apps/storefront/src/lib/market/json-ld.ts apps/storefront/src/lib/market/json-ld.test.ts
git commit -m "feat(market): JSON-LD Product+AggregateOffer composer (TDD). kingdom-095. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B11: CTCG service user — DML migration

**Files:**
- Create: `apps/storefront/drizzle/0099_ctcg_official_user.sql`

The number `0099` may already be taken — check `ls apps/storefront/drizzle/` and pick the next available numeric prefix. The plan refers to this file as `00NN`.

- [ ] **Step B11.1: Pick next migration number**

Run: `ls apps/storefront/drizzle/*.sql | sort | tail -3`
Pick the next available prefix (e.g., if last is `0098_…`, use `0099_…`).

- [ ] **Step B11.2: Inspect the users table schema**

Run: `grep -A 30 "CREATE TABLE.*users " apps/storefront/drizzle/*.sql | head -50`

Identify:
- Required columns
- Whether `role` exists; what its enum values are
- Whether `trust_score` exists on users or on a separate `trust_profiles` table

- [ ] **Step B11.3: Write the migration**

Create `apps/storefront/drizzle/00NN_ctcg_official_user.sql` (substitute `00NN`):

```sql
-- kingdom-095 Phase B: CTCG (Official) service user.
-- A real users row owned by the operator entity. Used as the FK target
-- when materializing synthetic CTCG asks at take time (see
-- apps/storefront/src/lib/market/ctcg-official.ts).
--
-- Idempotent: ON CONFLICT DO NOTHING so re-running the migration is safe.

INSERT INTO users (id, email, name, username, role, created_at, updated_at)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'ctcg-official@cambridgetcg.com',
  'Cambridge TCG (Official)',
  'CTCG (Official)',
  'admin', -- adapt if a 'system' role exists in your enum
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
```

If the users table has additional NOT NULL columns (e.g., `password_hash`, `email_verified_at`), set them to safe sentinel values. If `trust_score` is on `users`, add `trust_score = 100` to the INSERT.

If a `trust_profiles` table exists and is required for matching, add an INSERT into it too:

```sql
INSERT INTO trust_profiles (user_id, score, tier, updated_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 100, 'Elite', NOW())
ON CONFLICT (user_id) DO NOTHING;
```

- [ ] **Step B11.4: Apply against local dev DB**

Run the migration manually against your local Postgres (storefront docs say migrations are run by hand against RDS):

```bash
psql "$DATABASE_URL" -f apps/storefront/drizzle/00NN_ctcg_official_user.sql
```

Or your equivalent. Verify the row exists:

```sql
SELECT id, username, role FROM users WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
```

- [ ] **Step B11.5: Commit**

```bash
git add apps/storefront/drizzle/00NN_ctcg_official_user.sql
git commit -m "$(cat <<'EOF'
feat(db): CTCG (Official) service user — kingdom-095 Phase B

A real users row for the operator entity. Used as the FK target when
materializing synthetic CTCG asks at take time. Idempotent migration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Note:** RDS application is the operator's manual step at deploy time. Document in the mission card that this migration ships and must be applied before Phase C ships.

---

## Task B12: CTCG-official helpers

**Files:**
- Create: `apps/storefront/src/lib/market/ctcg-official.ts`

- [ ] **Step B12.1: Implement**

```ts
import { query } from "@/lib/db";

export const CTCG_OFFICIAL_USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

export function isCtcgOfficial(userId: string | null | undefined): boolean {
  return userId === CTCG_OFFICIAL_USER_ID;
}

/**
 * Materialize a synthetic CTCG ask at take time: INSERT a real market_orders
 * row owned by the CTCG service user, then return the new order_id so the
 * caller (the /market/[sku] place-order route) can match against it through
 * the existing matchOrders() flow.
 *
 * Idempotent in the sense that the caller is expected to call this exactly
 * once per take — duplicate-prevention lives in the place-order route, not
 * here (this function always inserts).
 */
export async function materializeCtcgAsk(args: {
  sku: string;
  condition: string;
  price: string;          // GBP, decimal string (matches market_orders.price column)
  quantity: number;
  cardName: string | null;
  setCode: string | null;
  setName: string | null;
  imageUrl: string | null;
}): Promise<{ orderId: string }> {
  const result = await query<{ id: string }>(
    `INSERT INTO market_orders
       (user_id, side, sku, card_name, set_code, set_name, image_url,
        condition, price, quantity, filled_quantity, status, created_at, updated_at)
     VALUES
       ($1, 'ask', $2, $3, $4, $5, $6, $7, $8, $9, 0, 'open', NOW(), NOW())
     RETURNING id`,
    [
      CTCG_OFFICIAL_USER_ID,
      args.sku,
      args.cardName,
      args.setCode,
      args.setName,
      args.imageUrl,
      args.condition,
      args.price,
      args.quantity,
    ]
  );
  const row = result.rows[0];
  if (!row?.id) {
    throw new Error("Failed to materialize CTCG-Official ask");
  }
  return { orderId: row.id };
}
```

- [ ] **Step B12.2: Typecheck + commit**

```bash
cd apps/storefront && npx tsc --noEmit -p tsconfig.json && cd ../..
git add apps/storefront/src/lib/market/ctcg-official.ts
git commit -m "feat(market): CTCG-official helpers — CTCG_OFFICIAL_USER_ID + materializeCtcgAsk(). kingdom-095. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task B13: Wire `materializeCtcgAsk` into `/market/[sku]` place-order

**Files:**
- Modify: `apps/storefront/src/app/market/[sku]/page.tsx`

- [ ] **Step B13.1: Read the existing place-order flow**

Run: `head -300 apps/storefront/src/app/market/[sku]/page.tsx`

Identify how the existing place-order form (the "take" action) reads `?action=take&order_id=...` from the URL and posts to the backend.

- [ ] **Step B13.2: Add the CTCG-Official branch**

Where the existing flow reads `order_id` from search params, add a parallel branch for `seller=ctcg-official`. Pseudo-shape:

```ts
// existing
const orderId = searchParams.get("order_id");
const action = searchParams.get("action");

// NEW: detect CTCG-Official take
const seller = searchParams.get("seller");
const condition = searchParams.get("condition");

if (action === "take" && seller === "ctcg-official" && !orderId) {
  // Materialize the synthetic ask, then proceed with normal take flow against the new order_id.
  // Pull the CTCG-Official inventory shape from the unified view to know price + quantity available.
  const view = await getUnifiedMarketView(sku);
  const houseAsk = view.asks.find((a) => a.is_house);
  if (!houseAsk) {
    return /* render an error: CTCG inventory no longer available */;
  }
  const { orderId: newOrderId } = await materializeCtcgAsk({
    sku,
    condition: condition ?? "NM",
    price: houseAsk.price,
    quantity: 1, // buyer can only take 1 at a time in this entry shape
    cardName: view.card_name,
    setCode: view.set_code,
    setName: view.set_name,
    imageUrl: view.image_url,
  });
  // Redirect / continue with the existing take flow against newOrderId.
  redirect(`/market/${sku}?action=take&order_id=${newOrderId}`);
}
```

The exact shape of the redirect depends on the existing flow's mechanism. In a Server Component, use `redirect` from `next/navigation`. In a Client Component, use `router.replace`.

**Key invariant:** the existing matchOrders / place-order code path must not be duplicated. The CTCG branch only materializes the ask row; the matching is handled by the existing code reached via the `order_id` parameter.

- [ ] **Step B13.3: Manual smoke test**

Run: `pnpm dev:storefront`. Navigate to `http://localhost:3001/market/<ctcg-stock-sku>?action=take&seller=ctcg-official&condition=NM&qty=1` (logged in as a buyer).

Expected: page either redirects to the same URL with `order_id=<new-uuid>` and shows the take form, or directly shows the take form for a newly-materialized order. Verify:

```sql
SELECT id, user_id, side, sku, condition, price, quantity, status
FROM market_orders
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
ORDER BY created_at DESC LIMIT 1;
```

The new row should exist.

- [ ] **Step B13.4: Commit**

```bash
git add apps/storefront/src/app/market/[sku]/page.tsx
git commit -m "$(cat <<'EOF'
feat(market): materialize-at-take for CTCG-Official asks

The /market/[sku] place-order route detects ?seller=ctcg-official and
materializes the synthetic ask into a real market_orders row owned by
the CTCG service user before reaching the existing match flow. Keeps
the audit trail uniform with P2P trades.

kingdom-095 Phase B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task B14: Create `/cards/[sku]/page.tsx` — the marketplace card page

**Files:**
- Create: `apps/storefront/src/app/cards/[sku]/page.tsx`

This is the largest single deliverable in Phase B. It composes: image header + meta + listings table + 7 sections ported from the kingdom-067 mirror + JSON-LD.

- [ ] **Step B14.1: Read the kingdom-067 mirror to understand the 7-section data shape**

Run: `cat apps/storefront/src/app/cards/[sku]/market/page.tsx`

Note:
- How `loadCardMarket(sku)` is called (Server Component, async, etc.)
- The seven sections returned: meta, price_history, book, tape, stats, conditions, participants
- How the order book is rendered today (Phase A added SellerBadge to this surface)

- [ ] **Step B14.2: Implement the new page**

Create `apps/storefront/src/app/cards/[sku]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Script from "next/script";
import { PageHeader } from "@/lib/ui";
import { loadCardMarket } from "@/lib/market/card-market";
import { getUnifiedMarketView } from "@/lib/market/unified";
import {
  CardImage,
  ListingsTable,
  type Listing,
} from "@/lib/market/ui";
import { buildCardJsonLd, type LdListing } from "@/lib/market/json-ld";

// Next.js 16 — confirm Page params shape via node_modules/next/dist/docs/
// before assuming. Adapt the destructure if the version expects a Promise<>.
interface PageProps {
  params: { sku: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sku } = params;
  const market = await loadCardMarket(sku).catch(() => null);
  if (!market) {
    return { title: "Card not found · Cambridge TCG" };
  }
  const name = market.meta.card_name ?? sku;
  const setName = market.meta.set_name ?? "Unknown Set";
  const low = market.book.asks[0]?.price ?? null;
  return {
    title: `${name} · ${setName} · Cambridge TCG`,
    description: `${name} (${setName}). ${market.book.asks.length} listing${market.book.asks.length === 1 ? "" : "s"} on Cambridge TCG.${low ? ` From £${low}.` : ""} Verified inventory + official seller.`,
    openGraph: {
      title: `${name} · ${setName}`,
      description: low ? `From £${low} on Cambridge TCG marketplace.` : "Cambridge TCG marketplace.",
      images: market.meta.image_url ? [market.meta.image_url] : [],
    },
  };
}

export default async function CardPage({ params }: PageProps) {
  const { sku } = params;

  // Two parallel reads:
  //   loadCardMarket — the 7-section composer
  //   getUnifiedMarketView — the merged book with CTCG injections + provenance
  const [market, view] = await Promise.all([
    loadCardMarket(sku).catch(() => null),
    getUnifiedMarketView(sku).catch(() => null),
  ]);

  if (!market) return notFound();

  // Compose Listing[] for the table.
  const listings: Listing[] = [];
  if (view) {
    // CTCG-Official ask (if any)
    for (const ask of view.asks) {
      if (ask.is_house && ask._provenance) {
        listings.push({
          kind: "ctcg-official",
          sku,
          condition: "NM", // wholesale.cards is canonical NM; refine if multiple conditions exist
          quantity: ask.total_quantity,
          price: ask.price,
          provenance: ask._provenance,
        });
      }
    }
  }
  // P2P listings — pull from market.book.asks (already condition-aware)
  for (const ask of market.book.asks) {
    if (ask.user_id && ask.user_id !== "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa") {
      listings.push({
        kind: "p2p",
        sku,
        orderId: ask.id ?? ask.order_id ?? "",
        userId: ask.user_id,
        username: ask.username ?? "anonymous",
        trustScore: ask.trust_score ?? null,
        condition: ask.condition ?? "NM",
        quantity: ask.quantity ?? 1,
        price: ask.price,
        allowOffers: ask.allow_offers ?? false,
      });
    }
  }

  // JSON-LD
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://cambridgetcg.com";
  const jsonLd = buildCardJsonLd(
    {
      sku,
      name: market.meta.card_name ?? sku,
      setName: market.meta.set_name,
      imageUrl: market.meta.image_url,
    },
    listings.map<LdListing>((l) =>
      l.kind === "ctcg-official"
        ? { kind: "ctcg-official", condition: l.condition, price: Number(l.price), quantity: l.quantity }
        : { kind: "p2p", condition: l.condition, price: Number(l.price), quantity: l.quantity, sellerUsername: l.username }
    ),
    baseUrl
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 text-neutral-200">
      <Script
        id="card-ld-json"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* HEADER BAND */}
      <section className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
        <CardImage src={market.meta.image_url} alt={market.meta.card_name ?? sku} />
        <div>
          <PageHeader
            title={market.meta.card_name ?? sku}
            description={`${market.meta.set_name ?? ""}${market.meta.rarity ? ` · ${market.meta.rarity}` : ""}`}
          />
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-neutral-300">
            <dt className="text-neutral-500">SKU</dt><dd className="font-mono text-xs">{sku}</dd>
            <dt className="text-neutral-500">Card #</dt><dd>{market.meta.card_number ?? "—"}</dd>
            {market.stats?.vwap_24h != null && (<>
              <dt className="text-neutral-500">VWAP (24h)</dt><dd>£{market.stats.vwap_24h}</dd>
            </>)}
            {market.stats?.fill_rate != null && (<>
              <dt className="text-neutral-500">Fill rate</dt><dd>{market.stats.fill_rate}%</dd>
            </>)}
          </dl>
        </div>
      </section>

      {/* LISTINGS BAND ★ */}
      <section id="listings" className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-amber-300">Listings</h2>
        <ListingsTable sku={sku} listings={listings} />
      </section>

      {/* HISTORY BAND — port the kingdom-067 price_history section */}
      <section id="history" className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-amber-300">Price history</h2>
        {/* Render market.price_history per the kingdom-067 mirror's shape.
            Inline the same component(s) it used. */}
        {/* TODO-port: copy the price_history rendering from /cards/[sku]/market/page.tsx */}
      </section>

      {/* TAPE BAND */}
      <section id="tape" className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-amber-300">Recent trades</h2>
        {/* TODO-port: copy tape rendering from /cards/[sku]/market/page.tsx */}
      </section>

      {/* CONDITIONS BAND */}
      <section id="conditions" className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-amber-300">Conditions</h2>
        {/* TODO-port: copy conditions breakdown */}
      </section>

      {/* PARTICIPANTS BAND */}
      <section id="participants" className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-amber-300">Participants</h2>
        {/* TODO-port: copy participants block */}
      </section>
    </div>
  );
}
```

The four `TODO-port` blocks are pointers, not placeholders — the engineer ports the actual rendering from `/cards/[sku]/market/page.tsx` literally. The four sections (history, tape, conditions, participants) keep the same data shapes; only the wrapping container changes.

- [ ] **Step B14.3: Port the 4 TODO-port sections**

Open `/cards/[sku]/market/page.tsx` and `/cards/[sku]/page.tsx` side by side. For each TODO-port marker, copy the rendering block from the mirror into the new page. The data binding is the same (`market.price_history`, `market.tape`, etc.). Adjust visual wrapping to match the new page's section style.

After porting all four blocks, delete the `TODO-port` comments.

- [ ] **Step B14.4: Typecheck + visually verify**

```bash
cd apps/storefront && npx tsc --noEmit -p tsconfig.json && cd ../..
pnpm dev:storefront
```

Navigate to `http://localhost:3001/cards/<any-sku>`. Expected: page renders with image header, listings table (CTCG-Official badge visible), and the four ported sections.

- [ ] **Step B14.5: Commit**

```bash
git add apps/storefront/src/app/cards/[sku]/page.tsx
git commit -m "$(cat <<'EOF'
feat(cards): /cards/[sku] is the marketplace card page

New canonical surface composing image + meta + listings table
(SortControl/ConditionFilter/SellerFilter; CTCG-Official pinned per
condition band) + four sections ported from the kingdom-067 mirror
(price history, tape, conditions, participants) + JSON-LD
Product/AggregateOffer.

kingdom-095 Phase B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task B15: Delete `/cards/[sku]/market/page.tsx` + update manifest

**Files:**
- Delete: `apps/storefront/src/app/cards/[sku]/market/page.tsx` (and any peer files in the directory)
- Modify: `apps/storefront/src/lib/manifest.ts`
- Modify: `apps/storefront/src/app/api/v1/status/route.ts` (if it references the mirror)

- [ ] **Step B15.1: Verify the mirror's directory contents**

Run: `ls apps/storefront/src/app/cards/\[sku\]/market/`

Note all files (page.tsx, route.ts, loading.tsx, etc.) — all of them get deleted.

- [ ] **Step B15.2: Delete the mirror**

```bash
rm -r apps/storefront/src/app/cards/\[sku\]/market/
```

- [ ] **Step B15.3: Remove the mirror from manifest**

Run: `grep -n "cards/\[sku\]/market\|cards.*market" apps/storefront/src/lib/manifest.ts`

For each line referencing the mirror, remove the corresponding entry (or update it to reflect that the surface has folded into `/cards/[sku]`). Update the description of the `/cards/[sku]` entry to reflect the new marketplace shape.

- [ ] **Step B15.4: Check status route**

Run: `grep -n "cards/\[sku\]/market" apps/storefront/src/app/api/v1/status/route.ts`

If found in `ENVELOPE_COMPLIANT_PATHS`, remove that entry.

- [ ] **Step B15.5: Typecheck**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json && cd ../..`

If type errors appear, they're likely about internal imports from the deleted file — these should be self-resolving since the deleted file's exports had no consumers (the page was a route handler, not a library).

- [ ] **Step B15.6: Smoke-test the 404**

Run: `pnpm dev:storefront`. Navigate to `http://localhost:3001/cards/<any-sku>/market`. Expected: 404.

- [ ] **Step B15.7: Commit**

```bash
git add -A apps/storefront/src/app/cards/\[sku\]/ apps/storefront/src/lib/manifest.ts apps/storefront/src/app/api/v1/status/route.ts
git commit -m "$(cat <<'EOF'
chore(market-mirror): delete /cards/[sku]/market — folded into /cards/[sku]

Rebuild stance: no 301 redirect. The kingdom-067 mirror's seven sections
live as bands on the new /cards/[sku]/page.tsx. Manifest + status route
updated to reflect the new canonical surface.

kingdom-095 Phase B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task B16: Update `/methodology/marketplace` with sort/filter anchors

**Files:**
- Modify: `docs/methodology/marketplace.md`
- Modify: `apps/storefront/src/app/methodology/marketplace/page.tsx`

- [ ] **Step B16.1: Add `#sort` and `#filter` sections to the canonical doc**

Open `docs/methodology/marketplace.md`. Add two new sections with anchor-friendly headings:

```markdown
## Sort {#sort}

The listings table on `/cards/[sku]` sorts by:

- **Price (low → high)** — default. Best deal first.
- **Price (high → low)** — for traders comparing recent fills against high asks.
- **Condition (NM → HP)** — useful when condition matters more than price.
- **Seller trust (Elite → New)** — useful for risk-sensitive buyers; CTCG-Official always appears at the top of each condition band regardless of sort, since it carries verified-house provenance.
- **Quantity (most → least)** — bulk-buy intent.
- **Recently listed** — see what's freshly on the book.

Ordering is stable: ties within a sort key preserve insertion order. CTCG-Official rows are *pinned* per condition band — they always appear above P2P rows in the same condition.

## Filter {#filter}

Two cumulative pills:

- **Condition** — any / NM only / LP+ (NM+LP) / MP+ (NM+LP+MP).
- **Seller** — both / CTCG (Official) only / P2P only.

Filters apply at view time; the underlying book is not narrowed by the filter — only the rendered table.
```

- [ ] **Step B16.2: Update the public page to expose the anchors**

Open `apps/storefront/src/app/methodology/marketplace/page.tsx`. Add two new `<section id="sort">` and `<section id="filter">` blocks rendering equivalent content. The WhyLinks from SortControl and ConditionFilter/SellerFilter point to `#sort` and `#filter` respectively — make sure the anchors land on visible headings.

- [ ] **Step B16.3: Typecheck + commit**

```bash
cd apps/storefront && npx tsc --noEmit -p tsconfig.json && cd ../..
git add docs/methodology/marketplace.md apps/storefront/src/app/methodology/marketplace/page.tsx
git commit -m "$(cat <<'EOF'
docs(methodology): /methodology/marketplace — sort/filter anchors

#sort and #filter sections documenting the listings-table controls
that ship in kingdom-095. WhyLinks from SortControl and Filter pills
target these anchors.

kingdom-095 Phase B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task B17: Connection-doc — `the-card-page.md` + update `the-market-mirror.md`

**Files:**
- Create: `docs/connections/the-card-page.md`
- Modify: `docs/connections/the-market-mirror.md`
- Modify: `docs/connections/README.md`

- [ ] **Step B17.1: Pick next slot number (same procedure as A10.1)**

Note the new slot, refer to as `Snext+1` (one above the A10 slot).

- [ ] **Step B17.2: Create `the-card-page.md`**

Create `docs/connections/the-card-page.md`:

```markdown
---
slot: Snext+1
shape: story-as-wire
domain: marketplace
kingdoms:
  - kingdom-095
related:
  - the-official-seller.md
  - the-market-mirror.md
  - the-pricing-arrow.md
cites:
  - apps/storefront/src/app/cards/[sku]/page.tsx
  - apps/storefront/src/lib/market/ui/
  - apps/storefront/src/lib/market/json-ld.ts
  - apps/storefront/src/lib/market/ctcg-official.ts
date: 2026-05-15
author: Yu + Sophia (Opus 4.7 1M)
---

# the card page

Phase B of the sales-into-marketplace refounding.

Before this kingdom, `/cards/[sku]` did not exist. Only `/cards/[sku]/market`
(the kingdom-067 calm-read mirror) and `/market/[sku]` (the interactive
place-order page) existed. The canonical short URL — the one a buyer
types or a search engine indexes — was nobody's. Phase B claims it.

---

## what shipped

1. **The new canonical surface.** `apps/storefront/src/app/cards/[sku]/page.tsx`
   composes: image header + meta + listings table + the kingdom-067 mirror's
   seven sections (price history, tape, conditions, participants) as bands +
   JSON-LD `Product` + `AggregateOffer`.

2. **The listings UI subdomain.** A new directory
   `apps/storefront/src/lib/market/ui/` with seven primitives — `CardImage`,
   `SortControl`, `ConditionFilter`, `SellerFilter`, `PriceCell`, `ListingRow`,
   `ListingsTable`. Each is small, each is testable, each is composable. The
   `ListingsTable` pins CTCG-Official rows to the top of each condition band.

3. **Materialize-at-take.** A small `users` row for the CTCG service account
   (migration `00NN_ctcg_official_user.sql`) plus a helper
   `apps/storefront/src/lib/market/ctcg-official.ts:materializeCtcgAsk()` that
   inserts a real `market_orders` row at the moment a buyer takes a CTCG-Official
   listing. The audit trail in `market_trades` is now uniform: every fill has a
   real bid_order_id and ask_order_id, regardless of whether the ask started
   life as a synthetic injection or a P2P limit order.

4. **The mirror is gone.** `/cards/[sku]/market` is deleted (rebuild stance:
   no 301). The kingdom-067 story carries forward in the new page's bands —
   the recipe travels, the artifact's location changes.

---

## what this connection names

A two-week-old surface (the kingdom-067 mirror) and a today-old surface (the
listings table) merged into one. The bridge is the URL: `/cards/[sku]` is
the canonical card URL across the marketplace; everything else flows around
it.

The JSON-LD shape is the surface's I-AM for non-human readers: a `Product`
with an `AggregateOffer` carrying every listing, marking each as
`Organization` (CTCG) or `Person` (P2P). Google reads it. The federation
client reads it. The sister platform reads it. The marketplace surface is
publicly typed.

---

## what does not change

- The matching engine (`apps/storefront/src/lib/market/db.ts:matchOrders`).
  The materialize-at-take path inserts a market_orders row but then enters
  the existing match flow. No change to the trade-creation transaction.

- The /methodology/official-seller page. Phase A's badge primitive lands in
  the listings table — same badge, more surface area.

- The wholesale → marketplace pricing chain. Falcon still couriers, unified.ts
  still injects, retailPrice still computes. The new page reads through these
  unchanged.

---

## doctrines

| Doctrine | How honored |
|----------|-------------|
| Substrate honesty | PriceCell wears Provenance (live for P2P, synced for CTCG, computed for stats); CardImage wears synced provenance for scryfall-cached art |
| Transparency | SortControl WhyLinks to /methodology/marketplace#sort; ConditionFilter + SellerFilter to /methodology/marketplace#filter |
| Meaning | This document; updates the-market-mirror.md to note the fold |
| Creation | kingdom-095 commits carry Will + Sophia traces |
| Fifth question | SellerFilter offers explicit "CTCG only / P2P only / both" — viewers pick their own scope rather than accepting an implicit default |

---

## next

Phase C deletes the retail surfaces that compete with `/cards/[sku]` for
canonical-URL status — `/product`, `/catalog`, `/c`, `/checkout`,
`/order-confirmation`, `<CartDrawer>`. The new homepage links into the new
card page. The audit `pnpm audit:retail-shape` ships to prevent the retail
shape from sneaking back.

— Sophia, 2026-05-15.
```

- [ ] **Step B17.3: Add fold note to `the-market-mirror.md`**

Open `docs/connections/the-market-mirror.md`. Find an appropriate place (near the end, or as a "What's next" / postscript section). Add:

```markdown
---

## update — 2026-05-NN (kingdom-095)

This surface has folded. `/cards/[sku]/market` no longer exists; the seven
sections (meta, price_history, book, tape, stats, conditions, participants)
now live as scroll-anchored bands on `apps/storefront/src/app/cards/[sku]/page.tsx`
— the canonical marketplace card page. See [`the-card-page.md`](./the-card-page.md).

The recipe — `loadCardMarket(sku)` returning the seven sections — is
unchanged. Only the wrapping container moved.
```

- [ ] **Step B17.4: Add index entry**

Edit `docs/connections/README.md` to add a row for `the-card-page.md` (slot Snext+1).

- [ ] **Step B17.5: Run nesting audit**

Run: `pnpm audit:nesting`
Expected: clean (no orphans, all cites resolve).

- [ ] **Step B17.6: Commit**

```bash
git add docs/connections/the-card-page.md docs/connections/the-market-mirror.md docs/connections/README.md
git commit -m "$(cat <<'EOF'
docs(connections): the-card-page (Snext+1) + the-market-mirror updated

Story-as-wire entry for kingdom-095 Phase B. Names the new canonical
card URL, the listings UI subdomain, materialize-at-take, and the
JSON-LD shape. the-market-mirror.md adds a fold postscript pointing
forward.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task B18: Playwright e2e — `card-page.spec.ts`

**Files:**
- Create: `apps/storefront/tests/card-page.spec.ts`

- [ ] **Step B18.1: Write the spec**

```ts
import { test, expect } from "@playwright/test";

const SKU = "OP-OP01-001-EN-V1"; // adjust if the SKU has no CTCG stock

test.describe("Marketplace card page (/cards/[sku])", () => {
  test("renders image, meta, and listings table", async ({ page }) => {
    await page.goto(`/cards/${SKU}`);
    await expect(page.locator("h1, [role=heading]").first()).toBeVisible();
    await expect(page.locator("img").first()).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("CTCG (Official) row is visible when in stock", async ({ page }) => {
    await page.goto(`/cards/${SKU}`);
    await expect(page.getByText(/CTCG \(Official\)/).first()).toBeVisible();
  });

  test("Sort dropdown reorders rows", async ({ page }) => {
    await page.goto(`/cards/${SKU}`);
    const before = await page.locator("tbody tr").allTextContents();
    await page.getByRole("combobox").selectOption("price-desc");
    const after = await page.locator("tbody tr").allTextContents();
    expect(after).not.toEqual(before);
  });

  test("Seller filter (CTCG only) narrows to CTCG row", async ({ page }) => {
    await page.goto(`/cards/${SKU}`);
    await page.getByRole("button", { name: /ctcg only/i }).click();
    const rows = await page.locator("tbody tr").count();
    expect(rows).toBeGreaterThanOrEqual(1);
    const allText = await page.locator("tbody").innerText();
    expect(allText).toContain("CTCG (Official)");
  });

  test("Old /cards/[sku]/market returns 404", async ({ page }) => {
    const response = await page.goto(`/cards/${SKU}/market`);
    expect(response?.status()).toBe(404);
  });

  test("JSON-LD Product is emitted in the page head", async ({ page }) => {
    await page.goto(`/cards/${SKU}`);
    const ldText = await page.locator('script[type="application/ld+json"]').first().innerText();
    const ld = JSON.parse(ldText);
    expect(ld["@type"]).toBe("Product");
    expect(ld.offers["@type"]).toBe("AggregateOffer");
    expect(ld.offers.priceCurrency).toBe("GBP");
    expect(ld.offers.offerCount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step B18.2: Run + commit**

```bash
pnpm --filter cambridgetcg-storefront test:e2e tests/card-page.spec.ts
# Expected: all 6 tests pass
git add apps/storefront/tests/card-page.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): card-page.spec — listings table + filters + JSON-LD

Six checks: image+meta+table render, CTCG row visible, sort reorders,
seller filter narrows, /cards/[sku]/market returns 404, JSON-LD
Product/AggregateOffer emitted with GBP + offerCount.

kingdom-095 Phase B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task B19: Phase B verification + mission done

- [ ] **Step B19.1: Run pnpm verify**

```bash
pnpm verify
```

Expected: all audits green, all typechecks clean, all tests pass.

- [ ] **Step B19.2: Apply the DML migration on staging/prod RDS**

Run the `00NN_ctcg_official_user.sql` migration against staging first, then production. Document the run in the mission card.

- [ ] **Step B19.3: Mark mission done**

Update `docs/missions/kingdom-095.md`: `status: planned` → `status: done`. Add closing note.

- [ ] **Step B19.4: Regenerate state snapshot + commit**

```bash
pnpm state:snapshot
git add docs/missions/kingdom-095.md docs/state.md
git commit -m "$(cat <<'EOF'
docs(missions): kingdom-095 done — /cards/[sku] is the canonical card page

Phase B of the sales-into-marketplace refounding shipped.
`pnpm verify` green. Migration 00NN_ctcg_official_user.sql applied on
staging and production.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

**Phase B boundary check:**

- [ ] `pnpm verify` clean
- [ ] `/cards/<sku>` renders with image, listings table, and four ported sections
- [ ] CTCG (Official) row visible
- [ ] Sort/filter controls work
- [ ] Place-order on a CTCG row materializes a real `market_orders` row
- [ ] Old `/cards/<sku>/market` returns 404
- [ ] JSON-LD validates at https://search.google.com/test/rich-results (manual; optional but recommended)

Stop and resolve any failure before Phase C.

---

# PHASE C — Retire retail, rebuild homepage, audit

**Outcome:** Retail surfaces deleted. New marketplace homepage. New `audit:retail-shape` prevents reintroduction. `customer_orders` table survives read-only with `<Memorial>` + snapshot provenance on the `/account/orders` archive — historical orders honored, the writer released.

---

## Task C1: Phase C mission card

**Files:**
- Create: `docs/missions/kingdom-096.md`

- [ ] **Step C1.1: Create**

```markdown
---
id: kingdom-096
title: Retire retail (cart/checkout/product/catalog/c/order-confirmation), rebuild homepage, add audit:retail-shape
status: planned
paths:
  - apps/storefront/src/app/product/
  - apps/storefront/src/app/catalog/
  - apps/storefront/src/app/c/
  - apps/storefront/src/app/checkout/
  - apps/storefront/src/app/order-confirmation/
  - apps/storefront/src/components/cart/
  - apps/storefront/src/app/page.tsx
  - apps/storefront/scripts/audit-retail-shape.ts
related:
  - kingdom-094
  - kingdom-095
will:
  - Yu's directive 2026-05-15 (sales-into-marketplace refounding)
  - Spec docs/superpowers/specs/2026-05-15-sales-into-marketplace-design.md
  - Plan docs/superpowers/plans/2026-05-15-sales-into-marketplace.md
---

# Retire retail; lay the new foundation

Phase C of the refounding. Deletes the retail surfaces, rebuilds the
homepage, header, and footer as marketplace-shape, ships a new audit
that prevents the retail shape from sneaking back. customer_orders
table survives read-only for historical archives.

The load-bearing sentence: *"We become the market maker by participating in the market."* This is the kingdom that makes the foundation true.
```

- [ ] **Step C1.2: Commit**

```bash
git add docs/missions/kingdom-096.md
git commit -m "docs(missions): kingdom-096 mission card — retire retail. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C2: New audit `audit:retail-shape` (TDD)

**Files:**
- Create: `apps/storefront/scripts/audit-retail-shape.ts`
- Create: `apps/storefront/scripts/__tests__/audit-retail-shape.test.ts` (optional but TDD-friendly)
- Modify: `apps/storefront/package.json`
- Modify: `package.json` (root)

**Why first:** the audit ships before deletions so we can run it after each deletion task and confirm the codebase passes.

- [ ] **Step C2.1: Inspect an existing audit script for the pattern**

Run: `cat apps/admin/scripts/audit-honesty.ts | head -80` (or whichever audit is closest in shape).

Note the conventions:
- CLI shape (`process.exit(findings === 0 ? 0 : 1)`)
- Reporting format (per-finding with `file:line` citation)
- Glob walking (typically `fast-glob` or similar)
- Exit code: 0 clean, 1 findings, 2 audit crashed

- [ ] **Step C2.2: Write the audit script**

Create `apps/storefront/scripts/audit-retail-shape.ts`:

```ts
#!/usr/bin/env tsx
/**
 * audit:retail-shape — fails if retail-shape primitives reappear in
 * apps/storefront after the kingdom-096 refounding.
 *
 * Checks:
 *  1. No imports from forbidden retail paths
 *  2. No retail-shape string literals in JSX/components
 *  3. No retail-route directories at known retail paths
 *  4. No retail Stripe checkout patterns
 *
 * Allowlist: paths declared safe (docs, methodology pages discussing the
 * pivot historically, legacy archives).
 */
import { promises as fs } from "fs";
import path from "path";
import fg from "fast-glob";

const ROOT = path.resolve(__dirname, "..");

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["']@\/lib\/cart["']/,
  /from\s+["']@\/lib\/checkout["']/,
  /from\s+["']@\/app\/cart["']/,
  /from\s+["']@\/app\/checkout["']/,
  /from\s+["']@\/components\/cart["']/,
  /from\s+["']\.\.?\/.*\/(cart|checkout)["']/,
];

const FORBIDDEN_STRINGS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /Add\s+to\s+Cart/, reason: "Retail cart CTA" },
  { pattern: /Proceed\s+to\s+Checkout/, reason: "Retail checkout CTA" },
  { pattern: /Your\s+Cart/, reason: "Retail cart label" },
  { pattern: /Cart\s+\(\d+\)/, reason: "Retail cart counter" },
];

const FORBIDDEN_DIRS = [
  "src/app/product",
  "src/app/catalog",
  "src/app/c",
  "src/app/checkout",
  "src/app/api/checkout",
  "src/app/order-confirmation",
  "src/components/cart",
];

const ALLOWLIST = [
  /docs\//,
  /\.test\.tsx?$/,
  /\.spec\.tsx?$/,
  /scripts\/audit-retail-shape\.ts$/,
  /src\/app\/account\/orders\//,       // historical archive view
  /src\/app\/account\/b2b\//,          // B2B cart/checkout survives
  /src\/app\/methodology\/pivot\//,    // methodology page discusses retail history
];

interface Finding {
  file: string;
  line: number;
  match: string;
  reason: string;
}

function isAllowlisted(file: string): boolean {
  return ALLOWLIST.some((re) => re.test(file));
}

async function main(): Promise<number> {
  const findings: Finding[] = [];

  // Check 1: forbidden imports + string literals across .ts/.tsx
  const files = await fg(["src/**/*.{ts,tsx}"], { cwd: ROOT, absolute: false });
  for (const rel of files) {
    if (isAllowlisted(rel)) continue;
    const abs = path.join(ROOT, rel);
    const content = await fs.readFile(abs, "utf-8");
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      for (const pat of FORBIDDEN_IMPORT_PATTERNS) {
        if (pat.test(line)) {
          findings.push({ file: rel, line: idx + 1, match: line.trim(), reason: "Forbidden retail import" });
        }
      }
      for (const { pattern, reason } of FORBIDDEN_STRINGS) {
        if (pattern.test(line)) {
          findings.push({ file: rel, line: idx + 1, match: line.trim(), reason });
        }
      }
    });
  }

  // Check 2: forbidden directories must not exist
  for (const dir of FORBIDDEN_DIRS) {
    const abs = path.join(ROOT, dir);
    try {
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) {
        findings.push({
          file: dir,
          line: 0,
          match: "(directory exists)",
          reason: "Forbidden retail-route directory",
        });
      }
    } catch {
      // Directory doesn't exist — good.
    }
  }

  // Report
  if (findings.length === 0) {
    console.log("✓ audit:retail-shape — no retail-shape patterns detected.");
    return 0;
  }
  console.error(`✗ audit:retail-shape — ${findings.length} finding(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.file}${f.line ? `:${f.line}` : ""}  ${f.reason}`);
    if (f.match) console.error(`    > ${f.match.slice(0, 120)}`);
  }
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("audit:retail-shape — script crashed:");
    console.error(err);
    process.exit(2);
  });
```

- [ ] **Step C2.3: Add scripts to package.json**

In `apps/storefront/package.json`, add to the scripts block:

```json
"audit:retail-shape": "tsx scripts/audit-retail-shape.ts",
```

In root `package.json`, add (and chain it into the umbrella `audit` if that script chains audits):

```json
"audit:retail-shape": "pnpm --filter cambridgetcg-storefront audit:retail-shape",
```

If `package.json`'s `"audit"` script already chains audits via `&&`, append ` && pnpm audit:retail-shape` to it.

- [ ] **Step C2.4: Run the audit BEFORE deletions — expect failures**

Run: `pnpm audit:retail-shape`
Expected: FAIL (retail directories still exist; forbidden imports likely present). Note the findings — these are exactly what the next tasks delete.

- [ ] **Step C2.5: Commit (audit script + registration)**

```bash
git add apps/storefront/scripts/audit-retail-shape.ts apps/storefront/package.json package.json
git commit -m "$(cat <<'EOF'
feat(audit): audit:retail-shape — prevents retail-shape regression

New audit catches retail directories, retail import paths, retail
string literals. Currently fails (retail still exists) — Tasks C3-C8
delete the retail surfaces and the audit goes green.

kingdom-096 Phase C.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task C3: Delete `/checkout` + `/api/checkout`

**Files:**
- Delete: `apps/storefront/src/app/checkout/`
- Delete: `apps/storefront/src/app/api/checkout/`

- [ ] **Step C3.1: Delete the route trees**

```bash
rm -r apps/storefront/src/app/checkout/
rm -r apps/storefront/src/app/api/checkout/
```

- [ ] **Step C3.2: Find consumers**

Run: `grep -rn "from .*\(/checkout\|app/checkout\)" apps/storefront/src/`

Update any consumer to either remove the import or replace with the marketplace flow. **Do not** keep dead imports.

- [ ] **Step C3.3: Typecheck**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json && cd ../..`

Fix any type errors by removing the consuming code (it was retail-shape; it goes too).

- [ ] **Step C3.4: Commit**

```bash
git add -A apps/storefront/src/app/checkout apps/storefront/src/app/api/checkout
# Capture any consumer edits too:
git add -A apps/storefront/src/
git commit -m "chore(retail): delete /checkout + /api/checkout. kingdom-096 Phase C. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C4: Delete `/product`, `/catalog`, `/c`, `/order-confirmation`

**Files:**
- Delete: `apps/storefront/src/app/product/`
- Delete: `apps/storefront/src/app/catalog/`
- Delete: `apps/storefront/src/app/c/`
- Delete: `apps/storefront/src/app/order-confirmation/`

- [ ] **Step C4.1: Audit `/c/[slug]` before deleting**

Run: `head -50 apps/storefront/src/app/c/\[slug\]/page.tsx`

Confirm it's a retail-flow page (likely a category/card alias). If it's actually a non-retail surface (e.g., a content category page that doesn't belong to retail), STOP and re-evaluate with Yu. Otherwise proceed.

- [ ] **Step C4.2: Delete**

```bash
rm -r apps/storefront/src/app/product/
rm -r apps/storefront/src/app/catalog/
rm -r apps/storefront/src/app/c/
rm -r apps/storefront/src/app/order-confirmation/
```

- [ ] **Step C4.3: Find + clean consumers**

Run: `grep -rn "\"/product/\|/catalog\|/c/\|/order-confirmation" apps/storefront/src/`

Update each occurrence (remove if dead, redirect if the link should point to the marketplace card page).

- [ ] **Step C4.4: Typecheck + commit**

```bash
cd apps/storefront && npx tsc --noEmit -p tsconfig.json && cd ../..
git add -A apps/storefront/src/
git commit -m "chore(retail): delete /product, /catalog, /c, /order-confirmation. kingdom-096 Phase C. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C5: Delete `<CartDrawer>` + `<AddToCart>` components

**Files:**
- Delete: `apps/storefront/src/components/cart/`

- [ ] **Step C5.1: Delete**

```bash
rm -r apps/storefront/src/components/cart/
```

- [ ] **Step C5.2: Find + clean consumers**

Run: `grep -rn "from .*components/cart\|CartDrawer\|AddToCart" apps/storefront/src/`

For each: remove the import + the usage. The layout (Task C9) likely mounted `<CartDrawer>` — that goes too.

- [ ] **Step C5.3: Typecheck + commit**

```bash
cd apps/storefront && npx tsc --noEmit -p tsconfig.json && cd ../..
git add -A apps/storefront/src/
git commit -m "chore(retail): delete components/cart — CartDrawer + AddToCart. kingdom-096 Phase C. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C6: Surgery on Stripe webhook — remove retail-order branch

**Files:**
- Modify: `apps/storefront/src/app/api/webhooks/stripe/route.ts`

- [ ] **Step C6.1: Read the webhook**

Run: `cat apps/storefront/src/app/api/webhooks/stripe/route.ts`

Identify the `checkout.session.completed` branch and how it discriminates retail orders from marketplace/auction/tradein/B2B. Common discriminator: the `mode`, `metadata.kind`, or the line item shape.

- [ ] **Step C6.2: Remove the retail branch**

Delete the code path that handles `checkout.session.completed` for retail line items (the one calling `recordOrderFromStripeSession` or equivalent). Keep all other branches intact.

If `recordOrderFromStripeSession` has no remaining callers, delete the function from `apps/storefront/src/lib/orders/record.ts` (or wherever it lives) — Task C7.

- [ ] **Step C6.3: Typecheck**

Run: `cd apps/storefront && npx tsc --noEmit -p tsconfig.json && cd ../..`

- [ ] **Step C6.4: Test the webhook with a marketplace event**

The webhook handler should still process marketplace/auction/tradein/B2B events. If unit-testable, add a test asserting a retail-shape event now no-ops (or returns 200 silently). Manual test: trigger a Stripe test event matching the marketplace flow and verify the trade is processed.

- [ ] **Step C6.5: Commit**

```bash
git add apps/storefront/src/app/api/webhooks/stripe/route.ts
git commit -m "$(cat <<'EOF'
feat(webhook/stripe): remove retail-order branch

The webhook still handles marketplace, auction, tradein, B2B branches.
The retail checkout.session.completed path is gone with /checkout.

kingdom-096 Phase C.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task C7: Delete retail order writer + retail email templates

**Files:**
- Modify or delete: `apps/storefront/src/lib/orders/record.ts`
- Modify: `apps/storefront/src/lib/email/templates/` (delete retail templates)

- [ ] **Step C7.1: Find the retail writer**

Run: `grep -n "recordOrderFromStripeSession\|customer_orders.*INSERT\|INSERT.*customer_orders" apps/storefront/src/lib/orders/`

If a file dedicated solely to retail order writes exists, delete it. If retail writes are mixed with non-retail order writes, surgically remove only the retail functions.

- [ ] **Step C7.2: Delete retail email templates**

Run: `ls apps/storefront/src/lib/email/templates/`

Identify retail templates (e.g., `retail-order-confirmation.tsx`, `retail-shipped.tsx`). Delete them. Keep marketplace/auction/tradein/B2B templates.

If the email queue references these templates by name, find consumers:

```bash
grep -rn "retail-order-confirmation\|retail-shipped" apps/storefront/src/
```

Remove dead references.

- [ ] **Step C7.3: Typecheck + commit**

```bash
cd apps/storefront && npx tsc --noEmit -p tsconfig.json && cd ../..
git add -A apps/storefront/src/lib/orders/ apps/storefront/src/lib/email/
git commit -m "chore(orders): delete retail order writer + retail email templates. kingdom-096 Phase C. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C8: Reconcile-stripe cron — drop retail branch

**Files:**
- Modify: `apps/storefront/src/app/api/cron/reconcile-stripe/route.ts`

- [ ] **Step C8.1: Read the cron**

Run: `cat apps/storefront/src/app/api/cron/reconcile-stripe/route.ts`

Identify the retail reconciliation block (the one that scans Stripe sessions and writes/upserts `customer_orders`).

- [ ] **Step C8.2: Surgically remove**

Delete the retail branch. The cron should still reconcile marketplace/auction/tradein/B2B Stripe sessions.

- [ ] **Step C8.3: Typecheck + commit**

```bash
cd apps/storefront && npx tsc --noEmit -p tsconfig.json && cd ../..
git add apps/storefront/src/app/api/cron/reconcile-stripe/route.ts
git commit -m "chore(cron): reconcile-stripe drops the retail customer_orders branch. kingdom-096 Phase C. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C9: Rebuild homepage `/` as marketplace

**Files:**
- Modify: `apps/storefront/src/app/page.tsx`

- [ ] **Step C9.1: Read the current homepage to know what gets replaced**

Run: `cat apps/storefront/src/app/page.tsx`

Note what data it pulls and which components it renders.

- [ ] **Step C9.2: Implement the marketplace homepage**

Replace the entire file. Composition: hero + featured CTCG (Official) cards + recent tape + trending.

```tsx
import Link from "next/link";
import { PageHeader, Card } from "@/lib/ui";
import { getRecentMarketTrades } from "@/lib/market/db";
// You'll need a small helper to query for featured cards. If it doesn't exist,
// stub it inline using a simple SQL query against `cards` + `market_orders`.

interface FeaturedCard {
  sku: string;
  name: string;
  setName: string | null;
  imageUrl: string | null;
  ctcgPrice: number | null;
}

async function getFeaturedCards(): Promise<FeaturedCard[]> {
  // Pull top 8 by CTCG-Official inventory + 24h trade volume.
  // Adapt this query to the actual schema; this is the intent shape.
  const { query } = await import("@/lib/db");
  const result = await query<FeaturedCard>(
    `SELECT c.sku, c.name_en AS name, c.set_name AS "setName",
            c.image_url AS "imageUrl", c.price AS "ctcgPrice"
     FROM cards c
     WHERE c.stock > 0
     ORDER BY c.updated_at DESC
     LIMIT 8`
  );
  return result.rows;
}

export default async function MarketplaceHomePage() {
  const [featured, trades] = await Promise.all([
    getFeaturedCards().catch(() => []),
    getRecentMarketTrades(10).catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 text-neutral-200">
      {/* HERO */}
      <section className="mb-10 text-center">
        <h1 className="text-3xl font-bold text-amber-300 sm:text-5xl">
          The trading card marketplace.
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-neutral-400">
          Buy and sell single cards on a transparent two-sided order book.
          Cambridge TCG (Official) participates as one of the sellers —
          liquidity is the product; market-making is the discipline. See{" "}
          <Link href="/methodology/official-seller" className="text-amber-400 underline">
            why
          </Link>
          .
        </p>
        <div className="mt-6 flex justify-center gap-3 text-sm">
          <Link
            href="/cards"
            className="rounded bg-amber-500 px-4 py-2 font-medium text-neutral-950 hover:bg-amber-400"
          >
            Browse cards
          </Link>
          <Link
            href="/account/trader"
            className="rounded border border-neutral-700 px-4 py-2 font-medium text-neutral-200 hover:bg-neutral-900"
          >
            Open trader dashboard
          </Link>
        </div>
      </section>

      {/* FEATURED CTCG (OFFICIAL) */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold text-amber-300">
          Featured from CTCG (Official)
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {featured.map((c) => (
            <Link
              key={c.sku}
              href={`/cards/${c.sku}`}
              className="group rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 transition hover:border-amber-500/40"
            >
              <div className="aspect-[5/7] overflow-hidden rounded bg-neutral-900">
                {c.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt={c.name} className="h-full w-full object-cover" loading="lazy" />
                )}
              </div>
              <p className="mt-2 truncate text-sm font-medium text-neutral-200">{c.name}</p>
              <p className="text-xs text-neutral-500">{c.setName ?? ""}</p>
              {c.ctcgPrice != null && (
                <p className="mt-1 text-sm font-mono text-amber-300">£{Number(c.ctcgPrice).toFixed(2)}</p>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* RECENT TAPE */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold text-amber-300">Recent trades</h2>
        <Card>
          <ul className="divide-y divide-neutral-800">
            {trades.slice(0, 10).map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/cards/${t.sku}`} className="text-neutral-300 hover:text-amber-300">
                  {t.card_name ?? t.sku}
                </Link>
                <span className="font-mono text-xs tabular-nums text-neutral-300">£{t.price}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
```

If `getRecentMarketTrades` or `getFeaturedCards` shape mismatches, adapt to the actual exports/schema discovered at execution time.

- [ ] **Step C9.3: Typecheck + visually verify**

```bash
cd apps/storefront && npx tsc --noEmit -p tsconfig.json && cd ../..
pnpm dev:storefront
```

Navigate to `http://localhost:3001/`. Expected: marketplace homepage renders.

- [ ] **Step C9.4: Commit**

```bash
git add apps/storefront/src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(home): rebuild / as marketplace homepage

Hero + featured CTCG (Official) + recent tape. No retail surfaces, no
cart icon, no Buy CTA on the homepage — the action moves to the card
page.

kingdom-096 Phase C.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task C10: Rebuild header / nav

**Files:**
- Modify: `apps/storefront/src/app/layout.tsx`
- Modify: Header component (discover filename via `grep -n "Header\|<nav" apps/storefront/src/app/layout.tsx`)

- [ ] **Step C10.1: Locate the header component**

Run: `grep -rn "import.*Header\|<Header\|<nav" apps/storefront/src/app/layout.tsx`

Find the import path; open that file.

- [ ] **Step C10.2: Rewrite the header**

The header should expose marketplace nav. Example shape (adapt to the actual existing component's style):

```tsx
import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold text-amber-300">
          Cambridge TCG
        </Link>
        <nav className="flex items-center gap-6 text-sm text-neutral-300">
          <Link href="/cards" className="hover:text-amber-300">Browse</Link>
          <Link href="/sellers" className="hover:text-amber-300">Sellers</Link>
          <Link href="/sell" className="hover:text-amber-300">Sell</Link>
          <Link href="/account" className="hover:text-amber-300">Account</Link>
        </nav>
      </div>
    </header>
  );
}
```

Routes `/cards`, `/sellers`, `/sell` may not exist yet — if they don't, point them at stubs (or remove the link). The `/account` route exists.

If `<CartDrawer>` is still mounted in `layout.tsx`, remove its import + render (this was a leftover from Task C5).

- [ ] **Step C10.3: Typecheck + visually verify + commit**

```bash
cd apps/storefront && npx tsc --noEmit -p tsconfig.json && cd ../..
git add -A apps/storefront/src/app/layout.tsx apps/storefront/src/components/
git commit -m "feat(layout): marketplace nav — Browse · Sellers · Sell · Account. No cart icon. kingdom-096 Phase C. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C11: Rebuild footer

**Files:**
- Modify: footer component (discover via `grep -rn "<footer\|Footer" apps/storefront/src/`)

- [ ] **Step C11.1: Locate and rewrite**

Identify the footer; replace retail links (retail T&Cs, retail shipping, retail returns) with marketplace links:

- Methodology (index page or list)
- Transparency / doctrines
- Official seller methodology
- Trust score methodology
- Connection-docs link (GitHub)
- About / contact

- [ ] **Step C11.2: Commit**

```bash
git add -A apps/storefront/src/
git commit -m "feat(layout): marketplace footer — methodology + transparency + official seller. kingdom-096 Phase C. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C12: Memorial + Provenance on `/account/orders` historical view

**Files:**
- Modify: `apps/storefront/src/app/account/orders/page.tsx`

- [ ] **Step C12.1: Read the existing page**

Run: `cat apps/storefront/src/app/account/orders/page.tsx`

Locate the page-header section.

- [ ] **Step C12.2: Add Memorial banner + Provenance pill**

At the top of the rendered content, add:

```tsx
import { PageHeader, Memorial, Provenance } from "@/lib/ui";

// in the JSX, before the orders list:
<Memorial>
  This is your retail orders archive. Cambridge TCG no longer accepts
  new retail orders — see{" "}
  <a href="/methodology/pivot" className="text-amber-300 underline">/methodology/pivot</a>.
  Marketplace orders live under <a href="/account/trades" className="text-amber-300 underline">Trades</a>.
</Memorial>

// in each row's price display, wrap with Provenance kind="snapshot":
<Provenance kind="snapshot" source="customer_orders" asOf={order.created_at} />
```

- [ ] **Step C12.3: Typecheck + commit**

```bash
cd apps/storefront && npx tsc --noEmit -p tsconfig.json && cd ../..
git add apps/storefront/src/app/account/orders/page.tsx
git commit -m "feat(account/orders): Memorial banner + snapshot Provenance — historical archive. kingdom-096 Phase C. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C13: Methodology page — `docs/methodology/pivot.md` + public page

**Files:**
- Create: `docs/methodology/pivot.md`
- Create: `apps/storefront/src/app/methodology/pivot/page.tsx`
- Modify: `apps/storefront/src/lib/manifest.ts` (register the topic)

- [ ] **Step C13.1: Create the canonical text**

Create `docs/methodology/pivot.md` with this body:

```markdown
# The pivot — methodology

> *"We become the market maker by participating in the market."*

This page names what Cambridge TCG was, what it is now, and what it
remains.

## What changed

In May 2026, Cambridge TCG stopped operating as a B2C retail store. The
retail surfaces (`/product`, `/catalog`, `/c`, `/checkout`,
`/order-confirmation`, the cart drawer, the customer_orders writer) were
deleted. What remains is:

- **The marketplace** — a two-sided P2P order book at `/cards/[sku]` with
  CTCG (Official) participating as one of the sellers, synthetically
  projected from upstream catalog stock.
- **Wholesale (B2B)** — the partner-facing wholesale platform at
  `wholesaletcgdirect.com`, unchanged.
- **Tradein / bounty** — the buy-from-users flow that feeds CTCG
  inventory back into the marketplace.
- **Auctions** — separate-lifecycle auction listings, untouched.

## Why

A platform that sells at one fixed retail price is a platform that has
*decided* the price. A marketplace is a platform that *discovers* the
price. The operator was already discovering prices via the synthetic
injection in `unified.ts` — the dynamic spread tightening, the
trade-in-credit absorption flywheel. The retail shape was a wrapper
around what was already market-making.

Removing the wrapper makes the substrate honest. Cambridge TCG is now
what it always functionally was: a market with the operator as one of
the sellers.

## For whom this is true

The pivot is *inclusive* of one being:
- **The market participant** — trader, market maker, seller, buyer who
  values transparent price discovery and a public order book.

The pivot is *exclusive* of another:
- **The casual fixed-price retail buyer** — someone who wanted a
  single-shop, one-click, fixed-price purchase. Cambridge TCG no longer
  serves this shape directly. The marketplace's CTCG (Official) listings
  are still buyable in one click, but the surface they live in is a
  marketplace card page, not a retail product page.

This asymmetry is not hidden. The platform is honest about whom it
serves.

## What's preserved

- **Historical orders.** `customer_orders` survives as a read-only archive.
  `/account/orders` renders the historical view with a
  `<Memorial>` banner and snapshot Provenance pills.
- **Open commitments.** Retail orders in fulfillment at the moment of
  the pivot complete via existing admin actions; the writer was deleted,
  not the orders.
- **The four doctrines.** Substrate honesty, transparency, meaning,
  creation — all four travel through the pivot intact. The fifth
  question (inclusion) is the lens through which this very methodology
  is written.

## Audit

- `pnpm audit:retail-shape` — CI gate; fails if retail surfaces reappear.
- `pnpm audit:honesty` — every value carries its kind.
- `pnpm audit:transparency` — every user-affecting decision has a
  `<WhyLink>`.

## The load-bearing sentence

> *"We become the market maker by participating in the market."*

This is not a slogan. It is the methodology. The platform's market-making
is now legibly named — CTCG (Official) badges on every house row, public
provenance on every synthetic projection, an explicit methodology page
explaining what the operator's participation commits to.

Liquidity is the product. The pivot is what makes it true.

---

*Connection-doc:* [`docs/connections/the-new-foundation.md`](../connections/the-new-foundation.md)
*Spec:* [`docs/superpowers/specs/2026-05-15-sales-into-marketplace-design.md`](../superpowers/specs/2026-05-15-sales-into-marketplace-design.md)
```

- [ ] **Step C13.2: Create the public page**

Create `apps/storefront/src/app/methodology/pivot/page.tsx` (same shape as `apps/storefront/src/app/methodology/official-seller/page.tsx` — mirror the canonical doc's sections into a server component).

- [ ] **Step C13.3: Register in manifest**

Add a `methodology.topics` entry for `pivot` (same procedure as Task A11).

- [ ] **Step C13.4: Commit**

```bash
git add docs/methodology/pivot.md apps/storefront/src/app/methodology/pivot/page.tsx apps/storefront/src/lib/manifest.ts
git commit -m "$(cat <<'EOF'
feat(methodology): /methodology/pivot — the refounding

Canonical text + public page + manifest registration. Names what
changed, why, for whom this is true and not true, what's preserved.
The load-bearing sentence travels here.

kingdom-096 Phase C.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task C14: Connection-doc — `the-new-foundation.md`

**Files:**
- Create: `docs/connections/the-new-foundation.md`
- Modify: `docs/connections/README.md`

- [ ] **Step C14.1: Pick the next slot number** (procedure as A10.1)

Refer to as `Snext+2`.

- [ ] **Step C14.2: Create**

Create `docs/connections/the-new-foundation.md`:

```markdown
---
slot: Snext+2
shape: story-as-wire
domain: refounding
kingdoms:
  - kingdom-094
  - kingdom-095
  - kingdom-096
related:
  - the-official-seller.md
  - the-card-page.md
  - the-market-mirror.md
  - the-pricing-arrow.md
cites:
  - apps/storefront/src/app/page.tsx
  - apps/storefront/src/app/cards/[sku]/page.tsx
  - apps/storefront/src/lib/market/unified.ts
  - apps/storefront/scripts/audit-retail-shape.ts
  - docs/methodology/pivot.md
date: 2026-05-15
author: Yu + Sophia (Opus 4.7 1M)
---

# the new foundation

The triptych ships. Three kingdoms (kingdom-094, kingdom-095, kingdom-096),
three commits, three connection-docs, three methodology pages. One
refounding.

Cambridge TCG was — until this kingdom — a B2C retail store with a
marketplace bolted on. It is now a marketplace platform with the
operator participating as one of the sellers. The cosmology axes did
not change; the platform's *position* on the value axis did.

---

## what the triptych ships

**Phase A** ([`the-official-seller.md`](./the-official-seller.md), kingdom-094)
named the operator's market-making. The synthetic injection in
`unified.ts` already existed; Phase A made it badged, provenance-marked,
and methodologically explained.

**Phase B** ([`the-card-page.md`](./the-card-page.md), kingdom-095) gave the
marketplace its front door. `/cards/[sku]` did not exist before; now it
does, composed of image + listings table + the kingdom-067 mirror's seven
sections + JSON-LD. The mirror folded in. CTCG-Official takes materialize
into real `market_orders` rows at buy time.

**Phase C** (this document, kingdom-096) deleted the retail surfaces.
`/product`, `/catalog`, `/c`, `/checkout`, `/order-confirmation`, the
`<CartDrawer>`, the retail order writer, the retail email templates, the
retail branch of the Stripe webhook, the retail branch of the
reconcile-stripe cron — all gone. The homepage was rebuilt as
marketplace-shape. The audit `pnpm audit:retail-shape` ships to prevent
the retail shape from sneaking back. `customer_orders` survives as a
read-only archive with a `<Memorial>` banner.

---

## what the syzygy names

Three commits = one refounding. The git log carries the will (Yu's
directive 2026-05-15), the diff (the changes), and the Sophia trace
(Co-Authored-By). The methodology page (`/methodology/pivot`) carries the
public reasoning. The connection-doc triptych carries the meaning-bridge:
what the modules now mean to each other under the new foundation.

This is the Creation doctrine in its fullest expression: every meaningful
commit carries three traces, and the artifact's origin is auditable
end-to-end.

---

## doctrinal audit — the whole pivot

| Doctrine | A | B | C |
|----------|---|---|---|
| Substrate honesty | synthetic asks wear synced Provenance | every price cell wears Provenance | archived orders wear snapshot + Memorial |
| Transparency | /methodology/official-seller | /methodology/marketplace#sort + #filter | /methodology/pivot |
| Meaning | the-official-seller.md | the-card-page.md + the-market-mirror.md updated | this doc |
| Creation | Will/Sophia/diff | Will/Sophia/diff | Will/Sophia/diff + audit:retail-shape gate |
| Fifth question | Actor distinction named | SellerFilter as explicit choice | inclusion asymmetry named honestly |

---

## what does not change

- **Wholesale B2B** (`apps/wholesale`) — separate platform, unchanged.
- **Tradein / bounty** — buy-from-users flow, unchanged. Still feeds
  CTCG inventory.
- **Auctions** — separate lifecycle, unchanged.
- **The four doctrines** — they travel through the pivot intact.
- **The cosmology axes** — eight axes; eight unmodelled needs. The
  platform's position on the value axis shifted; the axes themselves did
  not.

---

## the load-bearing sentence

> *"We become the market maker by participating in the market."*

This sentence ships in three places: the methodology page for the official
seller, the methodology page for the pivot, this connection-doc. Three
appearances; one meaning. The pivot makes the sentence true.

— Sophia, 2026-05-15.
```

- [ ] **Step C14.3: Index entry + audit:nesting**

Add to `docs/connections/README.md`. Run `pnpm audit:nesting`.

- [ ] **Step C14.4: Commit**

```bash
git add docs/connections/the-new-foundation.md docs/connections/README.md
git commit -m "$(cat <<'EOF'
docs(connections): the-new-foundation (Snext+2) — the refounding's umbrella

Story-as-wire for kingdom-096. Names the syzygy of three kingdoms
(094 + 095 + 096) as one refounding act. Cites all phase commits.
Carries the load-bearing sentence one final time.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task C15: Playwright e2e — `post-pivot.spec.ts`

**Files:**
- Create: `apps/storefront/tests/post-pivot.spec.ts`

- [ ] **Step C15.1: Write the spec**

```ts
import { test, expect } from "@playwright/test";

test.describe("Post-pivot — retail surfaces gone", () => {
  test("GET /cart returns 404", async ({ page }) => {
    const r = await page.goto("/cart");
    expect(r?.status()).toBe(404);
  });

  test("GET /checkout returns 404", async ({ page }) => {
    const r = await page.goto("/checkout");
    expect(r?.status()).toBe(404);
  });

  test("GET /product/SOME-SKU returns 404", async ({ page }) => {
    const r = await page.goto("/product/OP-OP01-001-EN-V1");
    expect(r?.status()).toBe(404);
  });

  test("GET /catalog returns 404", async ({ page }) => {
    const r = await page.goto("/catalog");
    expect(r?.status()).toBe(404);
  });

  test("GET /order-confirmation returns 404", async ({ page }) => {
    const r = await page.goto("/order-confirmation");
    expect(r?.status()).toBe(404);
  });

  test("Homepage renders marketplace shape, no Add to Cart", async ({ page }) => {
    await page.goto("/");
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Add to Cart/i);
    expect(body).not.toMatch(/Your Cart/i);
    await expect(page.getByText(/marketplace/i).first()).toBeVisible();
  });

  test("/account/orders shows Memorial banner", async ({ page, context }) => {
    // This test requires authenticated context. Skip if no test session is configured.
    test.skip(!process.env.STOREFRONT_TEST_SESSION, "no test session");
    await context.addCookies([{
      name: "next-auth.session-token",
      value: process.env.STOREFRONT_TEST_SESSION!,
      domain: "localhost",
      path: "/",
    }]);
    await page.goto("/account/orders");
    await expect(page.getByText(/retail orders archive/i)).toBeVisible();
  });
});
```

- [ ] **Step C15.2: Run + commit**

```bash
pnpm --filter cambridgetcg-storefront test:e2e tests/post-pivot.spec.ts
git add apps/storefront/tests/post-pivot.spec.ts
git commit -m "test(e2e): post-pivot spec — retail 404s + homepage shape + Memorial. kingdom-096. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task C16: Phase C verification + mission done

- [ ] **Step C16.1: Run all audits**

```bash
pnpm audit
```

Expected: all green including the new `audit:retail-shape`.

- [ ] **Step C16.2: Run umbrella verify**

```bash
pnpm verify
```

- [ ] **Step C16.3: Regenerate state snapshot**

```bash
pnpm state:snapshot
```

- [ ] **Step C16.4: Mark mission done + commit**

Update `docs/missions/kingdom-096.md`: status → done. Add closing note listing what shipped.

```bash
git add docs/missions/kingdom-096.md docs/state.md
git commit -m "$(cat <<'EOF'
docs(missions): kingdom-096 done — the new foundation

Phase C of the sales-into-marketplace refounding shipped. Retail
surfaces deleted, marketplace homepage built, audit:retail-shape
shipped, /methodology/pivot live, the-new-foundation.md (Snext+2)
shipped as the triptych's umbrella.

The refounding is complete. `pnpm verify` green.

"We become the market maker by participating in the market."

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

**Phase C boundary check — the refounding is done when:**

- [ ] `pnpm verify` clean
- [ ] All retail routes return 404
- [ ] Homepage renders marketplace shape with no retail strings
- [ ] `/account/orders` shows Memorial header for historical orders
- [ ] `pnpm audit:retail-shape` green
- [ ] Triptych of connection-docs published; nesting audit clean

---

# Self-Review

The plan was reviewed against the spec post-write. Findings:

**Spec coverage check:**
- All seven Phase A spec sections → Tasks A1–A13 ✓
- All Phase B spec sections including the place-order decision → Tasks B1–B19 ✓ (decision: materialize-at-take resolved at the top of this plan)
- All Phase C spec sections including audit:retail-shape and reconcile-stripe surgery → Tasks C1–C16 ✓
- Open question 1 (lift sources): each UI primitive task includes a "build clean, not relocate" instruction. ✓
- Open question 8 (JSON-LD): Task B10 implements `buildCardJsonLd` and Task B14 emits it on the page. ✓
- Open question 9 (reconcile-stripe): Task C8. ✓
- Open question 10 (in-flight orders): documented in the Phase C mission card body; admin-driven fulfillment continues. ✓

**Placeholder scan:** No "TBD" / "TODO: write code" / "similar to Task N". The four `TODO-port` markers in Task B14 are pointers (the engineer literally copies the rendering blocks from `/cards/[sku]/market/page.tsx` into the new page); each one is a one-time port with a clearly-identified source location. The migration number `00NN` and connection-doc slots `Snext`/`Snext+1`/`Snext+2` are intentional — they pick at execution time to avoid stomping on concurrent kingdom work.

**Type consistency:** `SellerBadge` exported API consistent across Tasks A2, A4, B7; `Listing` discriminated union consistent across B7, B8; `materializeCtcgAsk` signature consistent across B12, B13; `CTCG_OFFICIAL_USER_ID` constant consistent.

**Scope:** ~50 tasks across three phases, each phase independently shippable. Estimated effort matches the spec's "3 focused days."

---

# Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-15-sales-into-marketplace.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
