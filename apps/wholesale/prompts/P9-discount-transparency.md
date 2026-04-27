# P9 — Discount Tier Transparency Page

Create a visible discount tier breakdown so clients understand exactly how the volume discount works and where they stand.

## New Component: `src/components/discount-tier-card.tsx`

A reusable card component that shows:

### Tier Table
Display all brackets with the client's current tier highlighted:

```
┌─────────────────────────────────────────────────┐
│  YOUR VOLUME DISCOUNT                           │
├─────────────────────────────────────────────────┤
│                                                 │
│  Monthly Spend        Discount                  │
│  ─────────────        ────────                  │
│  Under £10,000          0%                      │
│  £10,000 – £19,999      2%                      │
│  £20,000 – £29,999      4%     ◄ YOU ARE HERE   │
│  £30,000 – £39,999      6%                      │
│  £40,000 – £49,999      8%                      │
│  £50,000+              10%                      │
│                                                 │
│  Based on last month's spend: £24,312           │
│  Your discount this month: 4%                   │
│                                                 │
│  This month so far: £8,450                      │
│  Spend £1,550 more to unlock 2% next month      │
│  (or £11,550 more for 4% next month)            │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Props
```ts
interface DiscountTierCardProps {
  priorMonthSpend: number;     // last month's total → determines current discount
  currentMonthSpend: number;   // this month so far → shows progress toward next month's tier
  currentDiscountPct: number;  // active discount (may be manual override)
}
```

### Logic
- Highlight the active tier row (green bg or left border accent)
- Show "YOU ARE HERE" marker next to active tier
- Calculate distance to next tier for current month: `nextTierThreshold - currentMonthSpend`
- If already at max (10%), show "Maximum discount unlocked 🎉"
- If current discount is a manual override (higher than calculated), show "Custom rate applied"

## Where to Display

### 1. `/catalog` page — compact version
Small banner below the search bar:
"Your discount: **4%** off all prices ([View tiers](/discount))"

### 2. `/orders/new` — in the totals sidebar
Show discount tier card above the totals breakdown.

### 3. NEW: `/discount` page
Full page with the tier card + explanation:

```markdown
## How Volume Discounts Work

Your discount tier is based on your **previous month's** total spend (ex-VAT).

- Tiers are calculated automatically on the 1st of each month
- The discount applies to all card prices for the entire month
- Displayed prices on the catalog already reflect your discount
- VAT is calculated after the discount is applied

## Your Account
[DiscountTierCard component here]

## Discount History (future)
[Placeholder for monthly spend history chart]
```

### 4. `/admin/clients` — in client detail
Show each client's tier card so admin can see their standing.

## Server Data
The catalog and orders/new pages already fetch via `getVolumeDiscount()`. Extend to also return `currentMonthSpend` and `priorMonthSpend`:

```ts
// src/lib/get-volume-discount.ts — extend return type
interface VolumeDiscountInfo {
  discountPct: number;
  priorMonthSpend: number;
  currentMonthSpend: number;
}
```

Update `getVolumeDiscount()` to return this object. Update all consumers (catalog/page.tsx, layout.tsx, orders/new) to destructure.

## Styling
- Dark card with subtle border (`bg-[#12121a] border border-[#1e1e2e]`)
- Active tier row: left green border + slightly lighter bg
- Progress bar showing current month spend toward next tier threshold
- Use green for active/unlocked tiers, gray for locked ones

Commit: `feat: discount tier transparency — breakdown, progress, /discount page`
