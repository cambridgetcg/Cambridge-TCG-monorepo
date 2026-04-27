# P8 — Fix Volume Discount Pricing

## Problems

There are two separate volume discount systems that don't talk to each other:

### 1. Static `volumeDiscountPct` on the clients table
- Set manually by admin in `/admin/clients` 
- `get-volume-discount.ts` just reads this static field from the DB
- It's never automatically calculated from actual spend

### 2. `getVolumeDiscount()` in pricing.ts (the formula)
- `getVolumeDiscount(priorMonthSpend)` calculates 2% per £10k bracket
- This function is NEVER CALLED anywhere in the app
- The formula exists but nothing uses it

### Result
- Volume discount is always 0% for new clients (the DB default)
- Only way to change it is admin manually editing it
- `priorMonthSpend` on the clients table is always 0 — nothing updates it
- `currentMonthSpend` is always 0 — nothing tracks it

## What Needs Fixing

### A. Auto-calculate spend tracking
When an order status changes to "paid", add its `totalExVat` to the client's `currentMonthSpend`. 
Update `PATCH /api/orders/[id]` (or wherever status transitions happen) to:
```ts
if (newStatus === "paid") {
  // Add order total to client's currentMonthSpend
  await db.update(clients)
    .set({ currentMonthSpend: sql`current_month_spend + ${order.totalExVat}` })
    .where(eq(clients.id, order.clientId));
}
```

### B. Monthly rollover
Create an API route or script `POST /api/admin/rollover` that:
1. For each client, copies `currentMonthSpend` → `priorMonthSpend`
2. Recalculates `volumeDiscountPct` using the pricing.ts formula: `getVolumeDiscount(priorMonthSpend)`
3. Resets `currentMonthSpend` to 0
4. This should run on the 1st of each month (can be triggered manually or via cron)

### C. Wire up automatic discount calculation
Change `get-volume-discount.ts` to use the formula, not just the static field:
```ts
export const getVolumeDiscount = cache(async (): Promise<number> => {
  const session = await auth();
  if (!session?.user?.id) return 0;
  const [client] = await db
    .select({ 
      volumeDiscountPct: clients.volumeDiscountPct,
      priorMonthSpend: clients.priorMonthSpend 
    })
    .from(clients)
    .where(eq(clients.id, Number(session.user.id)))
    .limit(1);
  if (!client) return 0;
  // Use the higher of: manual override OR calculated from prior month spend
  const calculated = getVolumeDiscountFromSpend(client.priorMonthSpend);
  return Math.max(client.volumeDiscountPct, calculated);
});
```
Import `getVolumeDiscount as getVolumeDiscountFromSpend` from pricing.ts (rename to avoid collision).

### D. Display spend progress to client
On `/orders/new` and `/catalog`, show the client:
- "This month's spend: £X,XXX"
- "Your discount tier: X% (based on last month's £X,XXX)"
- "Spend £X,XXX more this month to unlock X% next month"

Query `currentMonthSpend` and `priorMonthSpend` from the server component and pass down.

### E. Admin visibility
On `/admin/clients`, show:
- Current month spend (live)
- Prior month spend
- Auto-calculated discount %
- Manual override (if different)
- "Run Rollover" button for month-end

## Files to modify
- `src/lib/pricing.ts` — rename `getVolumeDiscount` to `calcVolumeDiscount` to avoid naming conflict
- `src/lib/get-volume-discount.ts` — use formula, not just static field
- `src/app/api/orders/[id]/status/route.ts` (or wherever status updates happen) — track spend on "paid"
- `src/app/api/admin/rollover/route.ts` — NEW: monthly rollover endpoint
- `src/app/orders/new/page.tsx` — show spend progress
- `src/app/catalog/page.tsx` — show spend progress
- `src/app/admin/clients/page.tsx` — show auto-calc vs override

Commit: `fix: wire up volume discount auto-calculation from actual spend`
