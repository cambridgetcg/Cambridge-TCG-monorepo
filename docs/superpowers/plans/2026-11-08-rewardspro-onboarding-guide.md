# RewardsPro first-time setup guide (RP-24) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page of its own in the RewardsPro admin that teaches a new merchant what store credit is, helps them build three tiers over a picture of their own buyers with what those tiers would have cost, and switches cashback on, followed by an optional one-order try-it.

**Architecture:** A new route `/app/welcome` with three steps, fed by two new engine modules: `app/lib/ladder.ts` (pure, used in the browser and on the server) and `app/lib/ladder.server.ts` (one read per store), plus `app/lib/guide.server.ts` for the gate, the dismissal and the try-it list. Tiers are saved by a new `saveLadder` in `tiers.server.ts`, in one transaction. One nullable column, `merchant.guide_dismissed_at`, remembers "Finish later". Home's loader gets a few-line guard last, in its turn in the shared-file queue.

**Tech Stack:** React Router 7.18.2, `@shopify/shopify-app-react-router` 4.0.0, Polaris web components 2.0 (`s-*`), Prisma 6.19.3 on Postgres (schema `rewards`), decimal.js through `~/lib/money`, Vitest (node, jsdom for `*.dom.test.tsx`), Testing Library, plain SVG for the chart.

**Spec:** `docs/superpowers/specs/2026-11-08-rewardspro-onboarding-guide-design.md` (approved by Yu on 2026-11-08: "lgtm"). Package RP-24, issue #185, design PR #186. Code map with file:line evidence for every name below: the RP-24 plan map in the designing session's scratchpad (`onboarding/plan-map/*.md`), not in git.

## Global Constraints

- All paths are under `apps/rewards/` unless written from the repo root.
- Work from a fresh worktree off `origin/main`, branch `claude/rp-24-onboarding-guide` for the docs PR and `claude/rp-24-<part>` for each code PR (`data`, `page`, `home-guard`). Each PR is a draft whose body starts `Part of #185` (the last: `Closes #185`). Yu merges; a merge to main deploys production.
- Commit trailers on every commit, both lines: `Co-Authored-By: The Fable of the Eternal Universe <Yu@Ai-love.cc>` and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never edit: `app/routes/app._index.tsx` (except Task 10, in its turn), `app/admin/home-rules.ts`, `app/admin/words.ts`, `app/routes/app.tiers.tsx`, `app/lib/stats.server.ts`, `apps/rewardspro/marketing/**`, `apps/rewards/docs/**`. Importing from them is fine.
- Engine boundary (`test/unit/lib/engine-boundary.test.ts`): files in `app/lib/` import only `~/db.server`, `@prisma/client`, `decimal.js` and `./*`; never `~/admin`, `~/shopify`, `~/routes`, `react-router`, `@shopify/*` or `../`.
- Money: every database value goes through `fromDb` or `new Money(text)` before arithmetic (Ruling 28). Amounts reach the page as strings (`.toFixed()`), never as numbers, except whole-unit tier starts and bin widths.
- Polaris web components only; no emoji; Polaris icons only. Custom CSS only in `app/admin/admin.module.css` through its `--rp-*` tokens. Navy `#1A3E5C` and teal `#17BEBB` only on the chart, its lines and tier chips; never teal text, never white on teal, a navy edge on every teal mark, no brand colour on buttons.
- Copy: R1 voice, business register, UK English, no exclamation marks, "buyers" (not "members" or "customers"), no "free", "costs nothing", "no fees", no timing words ("instant", "in minutes", "in 2 minutes"). The sign-in limit goes with every mention of spending. Use the import's real period, never a hard-coded "12 months". All guide sentences live in `app/admin/guide-words.ts`; Yu's yes to them (Pre-3) comes before the page PR merges.
- Rates are whole percents 0-100; tier starts are whole amounts in shop currency, at most 12 digits; names 1-40 characters; tier 1 starts at 0; each tier starts above the one before.
- Production migration: **before PR 1 merges**, Yu applies it from a clean checkout of **PR 1's head commit** (not main: main has no migration yet, so a run from main applies nothing and its drift check proves nothing): `git fetch origin && git worktree add /tmp/rp24-migrate <PR 1 head SHA> && cd /tmp/rp24-migrate && pnpm install --frozen-lockfile && pnpm --filter rewards migrate:deploy && pnpm --filter rewards migrate:drift`, with `REWARDS_DIRECT_URL` set in his shell as at B2. Expected: one migration applied (`…_merchant_guide_dismissed_at`), then "No difference detected". `findConnection` loads the whole merchant row, so a deploy whose client knows `guide_dismissed_at` breaks every admin page until the column exists.
- Checks before each commit (from `apps/rewards`, after `pnpm install --frozen-lockfile` at the root and `pnpm exec prisma generate`): `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, and with the local database `eval "$(scripts/test-db.sh start)" && pnpm test:postgres` (suites skip silently without `REWARDS_TEST_DATABASE_URL`: confirm tests ran). After adding a migration: `scripts/test-db.sh stop`, start again, then `REWARDS_DIRECT_URL="$REWARDS_TEST_DATABASE_URL" pnpm migrate:drift`.
- DOM tests start with `// @vitest-environment jsdom`, mock `~/db.server` as `({ default: {}, databaseSchema: "rewards" })` and `~/shopify.server` as `({ authenticate: {}, unauthenticated: {} })`, then `await import(...)` the route. Postgres route tests mock `~/admin/require-merchant.server` and use a `fakeAdmin` that answers by operation name.

## Review Focus

1. **A store whose ladder wasn't made by this guide opens it** (from Settings, or a stale tab): step 2 is refused (step 1 with the Tiers link), and a save from a stale tab is refused without writing; yet the guide's own store, once it has saved, reaches step 3 and the try-it. Pinned in Task 2 ("refuses a store whose ladder isn't fresh, writing nothing") and Task 8 ("serves each step only to the stores it is for").
2. **The import is still running when step 2 opens, then finishes:** the fields start at the fallbacks, untouched fields move to the store's suggestions when the import lands, and typed values survive the page's refreshes. Pinned in Task 9 ("keeps typed starts across a refresh and moves only untouched ones to the suggestions").
3. **A currency far from the pound, or with no decimals** (JPY, KWD): no 200/500 fallbacks, the smallest earning amount is right for the decimals, and the cost line formats in that currency. Pinned in Task 3 (`fallbackStarts`, `minEarningBase`).
4. **App Bridge can't tell whether the widget is on** (`null`): the step shows "Widget: checking", the switch stays enabled, and "Check again" re-asks. Pinned in Task 6 and Task 9 ("enables the switch when the widget check is unknown").
5. **Spend that tier placement ignores or measures differently** (test, cancelled and over-refunded orders, erased buyers, orders outside the window, refunds): the picture must count exactly what `tierSpend` counts. Pinned in Task 4 ("bins buyers by the same spend tierSpend measures").

---

## PR 1: data, saving and the migration (branch `claude/rp-24-data`)

### Task 1: `guide_dismissed_at`, the gate and the dismissal

**Files:**
- Modify: `prisma/schema.prisma` (Merchant, after `setupCompletedAt` at :152)
- Create: `prisma/migrations/20261109090000_merchant_guide_dismissed_at/migration.sql`
- Create: `app/lib/guide.server.ts`
- Test: `test/postgres/guide.postgres.test.ts`

**Interfaces:**
- Produces: `guideDue(merchantId: string): Promise<boolean>`; `dismissGuide(merchantId: string, now?: Date): Promise<void>`; Prisma field `Merchant.guideDismissedAt: Date | null`.

- [ ] **Step 1: Write the failing tests** in `test/postgres/guide.postgres.test.ts` (header and `seedShop`/`seedTier` copied from `merchant.postgres.test.ts` and `home.postgres.test.ts`):

```ts
it("is due for a store with no tiers that hasn't finished later", async () => {
  const conn = await seedShop();
  expect(await guideDue(conn.merchantId)).toBe(true);
});
it("is not due once the store has a tier, or once Finish later was pressed", async () => {
  const a = await seedShop("a.myshopify.com");
  await seedTier(a, "Everyone", "0", "3", 0);
  expect(await guideDue(a.merchantId)).toBe(false);
  const b = await seedShop("b.myshopify.com");
  await dismissGuide(b.merchantId, new Date("2026-11-09T10:00:00Z"));
  expect(await guideDue(b.merchantId)).toBe(false);
});
it("keeps the first Finish later", async () => {
  const conn = await seedShop();
  await dismissGuide(conn.merchantId, new Date("2026-11-09T10:00:00Z"));
  await dismissGuide(conn.merchantId, new Date("2026-11-10T10:00:00Z"));
  expect((await merchantOf(conn)).guideDismissedAt).toEqual(new Date("2026-11-09T10:00:00Z"));
});
it("is not due for an unknown merchant", async () => {
  expect(await guideDue(crypto.randomUUID())).toBe(false);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm test:postgres test/postgres/guide.postgres.test.ts`
Expected: FAIL (module `~/lib/guide.server` not found).

- [ ] **Step 3: Add the column.** In `schema.prisma`, after line 152:

```prisma
  /// When the merchant pressed Finish later in the setup guide (RP-24); the guide stays away after.
  guideDismissedAt        DateTime?  @map("guide_dismissed_at")
```

Migration file, in the house style:

```sql
-- RP-24 (the first-time setup guide; Ruling 23: a new migration). When the
-- merchant pressed "Finish later" in the guide: the first open no longer
-- sends them to it. Nullable, so older builds simply ignore it and an
-- Instant Rollback stays safe.
ALTER TABLE "merchant" ADD COLUMN "guide_dismissed_at" TIMESTAMP(3);
```

- [ ] **Step 4: Implement `guideDue` and `dismissGuide`** in `app/lib/guide.server.ts` (imports `~/db.server` only). `guideDue` is one count: `prisma.merchant.count({ where: { id: merchantId, guideDismissedAt: null, tiers: { none: {} } } }) === 1`, returning false for a non-UUID id (`UUID` from `./uuid`). `dismissGuide` follows `recordReviewPrompt`: `updateMany({ where: { id, guideDismissedAt: null }, data: { guideDismissedAt: now } })`.

- [ ] **Step 5: Restart the test database and run the tests and drift**

Run: `scripts/test-db.sh stop; eval "$(scripts/test-db.sh start)" && pnpm test:postgres test/postgres/guide.postgres.test.ts test/postgres/baseline.postgres.test.ts && REWARDS_DIRECT_URL="$REWARDS_TEST_DATABASE_URL" pnpm migrate:drift`
Expected: PASS; drift prints "No difference detected".

- [ ] **Step 6: Commit** `feat(rewards): remember Finish later and tell when the guide is due (RP-24)`.

### Task 2: `saveLadder`

**Files:**
- Modify: `app/lib/tiers.server.ts` (new exports after `saveTier`; new keys in `TIER_ERRORS`)
- Test: `test/postgres/ladder-save.postgres.test.ts`

**Interfaces:**
- Consumes: private `lockMerchantTiers`, `readTiers`, `byMinimum`, `WHOLE_AMOUNT`, `TIER_CHANGE_TRANSACTION`; `parseBaseRate`, `TIER_NAME_MAX`, `BASE_TIER_NAME`.
- Produces:

```ts
export type LadderRowInput = { name: unknown; minSpend: unknown; percent: unknown };
export type LadderErrors = { rows: [TierErrors, TierErrors, TierErrors]; form?: string };
export function isFreshLadder(tiers: TierRow[], running: boolean): boolean;
export async function saveLadder(
  merchantId: string,
  rows: LadderRowInput[],
  db: PrismaClient = prisma,
): Promise<{ ok: true; tierIds: [string, string, string] } | { ok: false; errors: LadderErrors }>;
// TIER_ERRORS gains:
//   ladderOrder: "Start each tier above the one before.",
//   ladderStale: "Your tiers changed since you opened this page. Edit them on the Tiers page.",
//   ladderShape: "Set up exactly three tiers.",
```

- [ ] **Step 1: Write the failing tests** (setup copied from `tiers-page.postgres.test.ts`: `ensureMerchant`, `addTier`, `tierValues`):

```ts
it("saves three tiers for a store with none, the first at 0", async () => {
  const saved = await saveLadder(conn.merchantId, [
    { name: "Bronze", minSpend: "", percent: "3" },
    { name: "Silver", minSpend: "200", percent: "5" },
    { name: "Gold", minSpend: "500", percent: "8" },
  ]);
  expect(saved.ok).toBe(true);
  expect(await tierValues()).toEqual([
    { name: "Bronze", minSpend: "0", percent: "3" },
    { name: "Silver", minSpend: "200", percent: "5" },
    { name: "Gold", minSpend: "500", percent: "8" },
  ]);
});
it("keeps Home's lone Everyone tier by id, renaming it and adding two above", async () => { /* addTier Everyone 0 5 pos 0; save; tierIds[0] === everyone.id; positions [0,1,2] */ });
it("reports every row's problems at once and writes nothing", async () => {
  const saved = await saveLadder(conn.merchantId, [
    { name: "", minSpend: "", percent: "101" },
    { name: "Silver", minSpend: "abc", percent: "5" },
    { name: "x".repeat(41), minSpend: "500", percent: "8" },
  ]);
  expect(saved).toEqual({ ok: false, errors: { rows: [
    { name: "Enter a name.", percent: "Enter a whole number from 0 to 100." },
    { minSpend: "Enter a whole number of 0 or more." },
    { name: "Use 40 characters or fewer." },
  ] } });
  expect(await tierValues()).toEqual([]);
});
it("refuses starts that don't rise", async () => { /* 0,500,500 and 0,500,200 → rows[2].minSpend === "Start each tier above the one before."; and 0,0,500 → rows[1] */ });
it("refuses anything but three rows", async () => { /* 2 rows → errors.form === "Set up exactly three tiers." */ });
it("refuses a store whose ladder isn't fresh, writing nothing", async () => {
  // a) two tiers already; b) one tier not named Everyone; c) Everyone with cashback running
  // each → { ok: false, errors: { rows: [{}, {}, {}], form: TIER_ERRORS.ladderStale } } and tiers unchanged
});
it("is decided under the merchant lock, so a tier added meanwhile wins", async () => {
  // The adder holds the lock and saveLadder waits (not the other way round, which tiers-page's deleteRacing does):
  // adder = createPrismaClient(url); in one adder.$transaction: lock the merchant row FOR UPDATE, then start
  // saveLadder(conn.merchantId, rows) on the default client; waitForLockWaitOr(watcher, saving) until it blocks;
  // insert a tier "Raced" at 300 inside the held transaction and commit.
  // saveLadder then reports { ok: false, errors: { rows: [{}, {}, {}], form: TIER_ERRORS.ladderStale } } and the store has only "Raced".
});
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm test:postgres test/postgres/ladder-save.postgres.test.ts`
Expected: FAIL (`saveLadder` is not exported).

- [ ] **Step 3: Implement.** `isFreshLadder` is true for `[]`, or for exactly one tier named `BASE_TIER_NAME` with `minSpend` zero while `running` is false. `saveLadder` validates every row first with saveTier's rules (name trim and length, `WHOLE_AMOUNT` for rows 2 and 3, `parseBaseRate` for all; row 1's `minSpend` is ignored), then the rise (row 2 > 0, row 3 > row 2), returning all errors together. Then one transaction with `TIER_CHANGE_TRANSACTION`: `lockMerchantTiers(tx, merchantId, "FOR UPDATE")`, read tiers and `running` (`tx.merchant.findUniqueOrThrow({ select: { running: true } })`), refuse unless `isFreshLadder`; update the lone tier's name and rate (never its `minSpend`) or create tier 1 at 0, position 0; create tiers 2 and 3 at positions 1 and 2, in that order (rising starts never collide with the unique `(merchant_id, min_spend)` index).

- [ ] **Step 4: Run the tests**

Run: `pnpm test:postgres test/postgres/ladder-save.postgres.test.ts test/postgres/tiers-page.postgres.test.ts`
Expected: PASS (the Tiers page suite proves nothing else moved).

- [ ] **Step 5: Commit** `feat(rewards): save the guide's three tiers in one go (RP-24)`.

### Task 3: the ladder's pure helpers

**Files:**
- Create: `app/lib/ladder.ts` (no `.server`: the page imports it)
- Test: `test/unit/lib/ladder.test.ts`

**Interfaces:**
- Produces:

```ts
export const MAX_BINS = 200;
export const MIN_SPENDERS = 20;
/** Currencies whose amounts sit close enough to the pound for 200 and 500 to mean the same. */
export const POUND_LIKE: ReadonlySet<string>; // GBP, EUR, USD, CAD, AUD, NZD, CHF, SGD
export type Starts = [number, number, number]; // tier 1 is always 0
export function niceStep(n: number): number;               // smallest of 1, 2, 5 × 10^k ≥ n, at least 1
export function binWidthFor(p99: Decimal | null): number;  // niceStep(ceil(p99 / 100)), 10 when null
export function binOf(spend: Decimal, binWidth: number): number; // min(floor(spend / w), MAX_BINS - 1)
export function countsFor(buyers: number[], binWidth: number, starts: Starts): [number, number, number];
export function costFor(earnBase: string[], binWidth: number, starts: Starts, rates: [number, number, number], currency: string): Decimal;
export function fallbackStarts(currency: string): [number, number] | null; // [200, 500] for POUND_LIKE, else null
export function suggestStarts(o: { p80: Decimal | null; p95: Decimal | null; spenders: number; binWidth: number; horizonDays: number; tierWindow: "rolling_12_months" | "lifetime"; importState: string; currency: string }): { starts: [number, number] | null; fromData: boolean };
export function minEarningBase(percent: number, currency: string): Decimal | null; // smallest base whose cashback rounds to ≥ 1 minor unit; null at 0%
export function validStarts(start2: string, start3: string): [number, number] | null; // both whole (≤ 12 digits) and 0 < start2 < start3, as saveLadder checks
export function snap(value: number, binWidth: number): number; // nearest multiple of binWidth, at least binWidth
export function exampleOrder(medianOrder: Decimal | null, currency: string): Decimal | null; // niceStep(median) when known, else 100 for POUND_LIKE, else null
```

- [ ] **Step 1: Write the failing tests** (`vi.mock("~/db.server", () => ({ default: {} }))` is not needed: the module imports only `./money`):

```ts
it("picks round bin widths", () => {
  expect([0.4, 1, 3, 7, 12, 260].map(niceStep)).toEqual([1, 1, 5, 10, 20, 500]);
  expect(binWidthFor(new Money("1840"))).toBe(20);
  expect(binWidthFor(null)).toBe(10);
});
it("counts buyers per tier by each bin's start", () => {
  // w = 10; bins: 0-9: 5, 10-19: 2, 200-209: 3, 500-509: 1
  const buyers = Array(MAX_BINS).fill(0); buyers[0] = 5; buyers[1] = 2; buyers[20] = 3; buyers[50] = 1;
  expect(countsFor(buyers, 10, [0, 200, 500])).toEqual([7, 3, 1]);
});
it("works out what the tiers would have given, rounded once in the shop's currency", () => {
  const base = Array(MAX_BINS).fill("0"); base[0] = "1000"; base[25] = "400.50";
  expect(costFor(base, 10, [0, 200, 500], [3, 5, 8], "GBP").toFixed()).toBe("50.03"); // 30 + 20.025 → 50.03
});
it("falls back to 200 and 500 only near the pound", () => {
  expect(fallbackStarts("GBP")).toEqual([200, 500]);
  expect(fallbackStarts("JPY")).toBeNull();
  expect(fallbackStarts("KWD")).toBeNull();
});
it("suggests starts from the store only with a finished 12-month import and enough buyers", () => {
  const base = { p80: new Money("230"), p95: new Money("610"), spenders: 40, binWidth: 10, horizonDays: 365, tierWindow: "rolling_12_months" as const, importState: "done", currency: "GBP" };
  expect(suggestStarts(base)).toEqual({ starts: [230, 610], fromData: true });
  expect(suggestStarts({ ...base, spenders: 19 })).toEqual({ starts: [200, 500], fromData: false });
  expect(suggestStarts({ ...base, horizonDays: 60 })).toEqual({ starts: [200, 500], fromData: false });
  expect(suggestStarts({ ...base, importState: "running" })).toEqual({ starts: [200, 500], fromData: false });
  expect(suggestStarts({ ...base, currency: "JPY", importState: "failed" })).toEqual({ starts: null, fromData: false });
  expect(suggestStarts({ ...base, p80: new Money("610"), p95: new Money("610") }).starts).toEqual([610, 620]); // kept apart by one bin
});
it("knows the smallest base that earns something", () => {
  expect(minEarningBase(3, "GBP").toFixed()).toBe("0.17");
  expect(minEarningBase(3, "JPY").toFixed()).toBe("17");
  expect(minEarningBase(5, "KWD").toFixed()).toBe("0.01");
  expect(minEarningBase(0, "GBP")).toBeNull();
});
it("reads two typed starts only when they make a ladder", () => {
  expect(validStarts("200", "500")).toEqual([200, 500]);
  expect(["", "abc", "0"].map((s) => validStarts(s, "500"))).toEqual([null, null, null]);
  expect(validStarts("500", "200")).toBeNull();
  expect(validStarts("500", "500")).toBeNull();
});
it("rounds the cost in currencies with other decimals", () => {
  const base = Array(MAX_BINS).fill("0"); base[0] = "1015";
  expect(costFor(base, 10, [0, 200, 500], [3, 5, 8], "JPY").toFixed()).toBe("30"); // 30.45 → 30
  expect(costFor(base, 10, [0, 200, 500], [3, 5, 8], "KWD").toFixed()).toBe("30.45");
});
it("snaps a dragged start to the bin grid", () => {
  expect([3, 14, 15, 205].map((v) => snap(v, 10))).toEqual([10, 10, 20, 210]);
});
it("picks a round example order", () => {
  expect(exampleOrder(new Money("87.40"), "GBP")?.toFixed()).toBe("100");
  expect(exampleOrder(null, "GBP")?.toFixed()).toBe("100");
  expect(exampleOrder(new Money("4300"), "JPY")?.toFixed()).toBe("5000");
  expect(exampleOrder(null, "JPY")).toBeNull();
});
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm test:unit test/unit/lib/ladder.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** in `app/lib/ladder.ts`, importing only `Money`, `fromDb`, `roundMoney`, `currencyDecimals` from `./money` and `type { Decimal }` from `decimal.js`. `costFor` sums `base_i × rate(tier of bin i's start) / 100` in `Money`, then `roundMoney` once. `suggestStarts`: data only when `importState === "done"`, `horizonDays >= 365` (or `tierWindow === "lifetime"`), `spenders >= MIN_SPENDERS` and both percentiles present; each start rounded up to the bin grid, the second at least one bin above the first; otherwise `fallbackStarts`. `minEarningBase`: `ceil((0.5 × 10^-d) / (percent / 100))` to `d` decimals, where `d = currencyDecimals(currency)`; a rate of 0 or less gives null. `exampleOrder`: `niceStep` of the median when known, else 100 in `POUND_LIKE` currencies, else null.

- [ ] **Step 4: Run the tests**

Run: `pnpm test:unit test/unit/lib/ladder.test.ts test/unit/lib/engine-boundary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** `feat(rewards): the ladder's bins, counts, cost and suggestions (RP-24)`.

### Task 4: one read per store, and the try-it list

**Files:**
- Create: `app/lib/ladder.server.ts`
- Modify: `app/lib/guide.server.ts` (add `tryItOrders`)
- Test: `test/postgres/ladder.postgres.test.ts`, `test/postgres/guide.postgres.test.ts`

**Interfaces:**
- Consumes: Task 3's `binWidthFor`, `binOf`, `MAX_BINS`; `windowStart` from `./tiers.server`; `orderStatus` from `./order-status`.
- Produces:

```ts
export interface LadderData {
  binWidth: number;
  /** buyers[i]: buyers whose tier spend is in [i·w, (i+1)·w); the last bin holds everyone above */
  buyers: number[];
  /** earnBase[i]: imported orders' cashback base in shop currency (decimal text), by the buyer's spend before each order; always MAX_BINS long, the last bin holding everything above */
  earnBase: string[];
  /** Some base was converted from another currency at the order's own rate */
  estimate: boolean;
  spenders: number;
  p80: string | null;
  p95: string | null;
  /** The median counted order's product value in shop currency, for step 1's example */
  medianOrder: string | null;
}
export async function readLadder(conn: Pick<ConnectionContext, "merchantId" | "connectionId" | "currency" | "tierWindow">, now: Date): Promise<LadderData>;
/** Step 1's light read: the median counted order and whether any counted order was in another currency (same filters as readLadder). */
export async function readGuideBasics(conn: Pick<ConnectionContext, "merchantId" | "connectionId" | "currency" | "tierWindow">, now: Date): Promise<{ medianOrder: string | null; multiCurrency: boolean }>;

export interface TryItOrder {
  orderId: string;
  name: string;
  externalCustomerId: string | null;
  status: { key: StatusKey; label: string; detail: string | null };
  cashback: { amount: string; currency: string } | null;
}
export async function tryItOrders(conn: Pick<ConnectionContext, "connectionId" | "merchantId">, since: Date, limit?: number): Promise<TryItOrder[]>; // live orders, ordered_at ≥ since − 15 min, newest first, limit 5
```

- [ ] **Step 1: Write the failing tests** in `test/postgres/ladder.postgres.test.ts`, with `addOrder(customerId, shopAmount, orderedAt, { refunded?, test?, cancelledAt?, source?, currency?, productAmount?, cashbackBase? })` modelled on `tiers.postgres.test.ts:50-85`:

```ts
it("bins buyers by the same spend tierSpend measures", async () => {
  // A: 150 counted + a test order + a cancelled order + an order 13 months old → 150
  // B: 260 with 60 refunded → 200
  // C: 120 counted + an order of 50 refunded 80 (over-refunded: excluded, not subtracted) → 120 (a plain sum would give 90)
  // E: only a test order and one 13 months old → 0; D: erased → left out
  const ladder = await readLadder(conn, NOW);
  for (const [buyer, spend] of [[a, "150"], [b, "200"], [c, "120"], [e, "0"]] as const) {
    expect(await tierSpend(buyer.id, "rolling_12_months", NOW)).toEqual(new Money(spend));
    expect(ladder.buyers[binOf(new Money(spend), ladder.binWidth)]).toBeGreaterThan(0);
  }
  expect(ladder.buyers.reduce((sum, n) => sum + n, 0)).toBe(4);
  expect(ladder.spenders).toBe(3);
});
it("replays each imported order at the spend its buyer had before it", async () => {
  // one buyer, imported orders of 300 then 300 (GBP): earnBase[bin(0)] = "300", earnBase[bin(300)] = "300"; live orders add spend but no base
});
it("converts another currency's base at the order's own rate, and says so", async () => {
  // EUR order: productAmount 117, shopProductAmount 100, cashbackBase 117 → earnBase holds "100", estimate true
});
it("answers an empty store with empty bins and no percentiles", async () => {
  const ladder = await readLadder(conn, NOW);
  expect(ladder).toMatchObject({ binWidth: 10, spenders: 0, p80: null, p95: null, medianOrder: null, estimate: false });
  expect(ladder.earnBase).toHaveLength(MAX_BINS);
});
it("caps the replay's bins like the buyers' bins", async () => {
  // one buyer far above 2×p99 before a later imported order → that order's base lands in the last bin, and earnBase stays MAX_BINS long
});
it("gives step 1 the median order and whether another currency was used", async () => {
  expect(await readGuideBasics(conn, NOW)).toEqual({ medianOrder: "50", multiCurrency: false }); // after seeding orders of 40, 50, 60 in GBP
});
```

and in `guide.postgres.test.ts`:

```ts
it("lists the live orders since switch-on, newest first, with what they earned", async () => {
  // seed a cashback entry with a sent payout on one order and noCashbackReason "test" on another; an import order is left out
  const list = await tryItOrders(conn, SWITCHED_ON);
  expect(list.map((o) => [o.name, o.status.label, o.status.detail])).toEqual([
    ["#1003", "No cashback", "Test order"],
    ["#1002", "Issued", null],
  ]);
});
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm test:postgres test/postgres/ladder.postgres.test.ts test/postgres/guide.postgres.test.ts`
Expected: FAIL (`readLadder`, `tryItOrders` not exported).

- [ ] **Step 3: Implement `readLadder`** as two raw queries with a local `table()` helper (copy `stats.server.ts:79`), both filtered to the connection, non-erased customers, `test = false`, `cancelled_at IS NULL` and, for a rolling window, `ordered_at >= ${start.toISOString()}::timestamptz AT TIME ZONE 'UTC'`:
  1. Per-buyer spend (`GREATEST(0, sum(shop_product_amount) - sum(shop_refunded_product_amount))`, counting only orders with `shop_refunded_product_amount <= shop_product_amount`, LEFT JOIN so buyers with nothing counted sit at 0), returning `percentile_disc` 0.8, 0.95 and 0.99 over spenders as text, then the bins via `binWidthFor(p99)` and `floor(spend / w)` capped at `MAX_BINS - 1`; `medianOrder` is `percentile_disc(0.5)` of the counted orders' `shop_product_amount`.
  2. The replay, as a subquery and an outer group: per counted order (same filters, over-refunded orders contributing 0) `adds = CASE WHEN shop_refunded_product_amount <= shop_product_amount THEN shop_product_amount - shop_refunded_product_amount ELSE 0 END` and `net_base` = (`cashback_base` when `currency` is the shop's, else `cashback_base × shop_product_amount / NULLIF(product_amount, 0)`) × `adds / NULLIF(shop_product_amount, 0)`, coalesced to 0; `spend_before = COALESCE(sum(adds) OVER (PARTITION BY customer_id ORDER BY ordered_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)` (a window over an empty frame is NULL); outside, for `source = 'import'` only, group by `LEAST(floor(spend_before / ${w}::numeric), ${MAX_BINS - 1})::int`, returning `sum(net_base)::text` and `bool_or(currency <> ${shopCurrency})`. Fill a dense `Array.from({ length: MAX_BINS }, () => "0")` by bin.
  3. `readGuideBasics`: one aggregate over the same counted orders, `percentile_disc(0.5) WITHIN GROUP (ORDER BY shop_product_amount)::text` and `bool_or(currency <> shop currency)`.

  **Implement `tryItOrders`** with Prisma: `order.findMany({ where: { connectionId, source: "live", orderedAt: { gte: since − 15 min } }, orderBy: [{ orderedAt: "desc" }, { id: "desc" }], take: limit, select: … ledgerEntries cashback/reversal with payout state … })`, mapping each through `orderStatus` exactly as the Orders page does (copy the select and mapping from `stats.server.ts:612-715`; that file is RP-13's, so don't import its private helpers).

- [ ] **Step 4: Run the tests**

Run: `pnpm test:postgres test/postgres/ladder.postgres.test.ts test/postgres/guide.postgres.test.ts && pnpm test:unit test/unit/lib/engine-boundary.test.ts`
Expected: PASS.

- [ ] **Step 5: Measure the read.** Seed 10,000 buyers and 50,000 orders in the local database (a throwaway script under the scratchpad, not committed) and time `readLadder`. Record the number in the PR. If it's over about a second, stop and raise it in #185 before going on (a precomputed table would be a second migration for Yu).

- [ ] **Step 6: Commit** `feat(rewards): read a store's ladder and its try-it orders (RP-24)`.

- [ ] **PR 1 gate:** open the draft PR (`Part of #185`), list what ran, and ask Yu to run the migration on production (Global Constraints). It merges only after he confirms `migrate:drift` shows no difference.

---

## PR 2: the guide page (branch `claude/rp-24-page`; built now as a draft, merged after PR 1, #157 and RP-10 have merged)

### Task 5: the guide's words

**Files:**
- Create: `app/admin/guide-words.ts`
- Test: `test/unit/admin/guide-words.test.ts`

**Interfaces:**
- Consumes: `TIER_WINDOW_LABEL`, `BUYER_IN_SHOPIFY`, and (once #157 has merged) `CASHBACK_BASE` from `~/admin/words`; `formatMoney` from `~/admin/format`.
- Produces: `GUIDE` (below) and `periodLabel(horizonDays: number): string` ("12 months" for 365, else "N days", as Home's line 304 does).

```ts
export const GUIDE = {
  heading: "Set up RewardsPro",
  steps: ["How it works", "Your tiers", "Go live"] as const,
  progress: (step: number) => `Step ${step} of 3`,
  finishLater: "Finish later",
  next: "Next",
  back: "Back",
  editTiers: "Edit your tiers on the Tiers page",
  creditTitle: "Store credit is Shopify's own",
  creditBody: "It's a balance in the buyer's Shopify account. RewardsPro adds cashback to it when an order is paid, and buyers spend it at checkout on a later order when they're signed in to their account. You can see a buyer's balance on their page in Shopify.",
  creditCurrency: "Credit is spent in the currency it was earned in.",
  nextTimeTitle: "Earned now, spent next time",
  nextTimeBody: "It isn't a discount: the price of today's order stays the same. The credit gives the buyer a reason to come back.",
  example: (order: string, credit: string) => `Order ${order}, then ${credit} in store credit, spent on the next order`,
  tiersIntro: (period: string) => `Buyers move up a tier as their spend grows. Where each tier starts is suggested from your orders over the last ${period}.`,
  tiersFallback: "These are starting suggestions. Change any of them.",
  tiersFewBuyers: "There are too few past buyers to suggest from yet, so these are starting suggestions.",
  tiersNoOrders: "There are no past orders yet, so these are starting suggestions.",
  tiersBlank: "Enter where tiers 2 and 3 start, in your store's currency.",
  importRunning: (n: number) => `Still bringing in your past orders: ${n} so far. The picture appears when they're all in.`,
  chartLabel: (period: string) => `Buyers by what they spent over the last ${period}`,
  // The picture's spoken summary; `buyers` is the local counter below, so it can be used inside the object
  chartSummary: (label: string, counts: [number, number, number], start2: string, start3: string) =>
    `${label}: ${buyers(counts[0])} below ${start2}, ${buyers(counts[1])} from ${start2}, ${buyers(counts[2])} from ${start3}`,
  firstTier: "Everyone starts here",
  starts: "Starts at",
  cashback: "Cashback",
  name: "Name",
  buyers, // const buyers = (n: number) => (n === 1 ? "1 buyer" : `${new Intl.NumberFormat("en").format(n)} buyers`), defined above GUIDE
  cost: (amount: string, period: string) => `At these rates, the orders you brought in from the last ${period} would have earned buyers about ${amount} in store credit. This is an estimate: past orders earn no cashback.`,
  saveTiers: "Save tiers",
  defaultNames: ["Bronze", "Silver", "Gold"] as const,
  checksHeading: "Before you switch on",
  storeCreditYes: "Store credit can be spent",
  storeCreditNo: "Store credit can't be spent yet",
  storeCreditUnknown: "Store credit: Shopify didn't say",
  widgetYes: "Widget is on",
  widgetNo: "Widget is off",
  widgetUnknown: "Widget: checking",
  turnOnWidget: "Turn on the widget in your theme",
  checkAgain: "Check again",
  switchOn: "Switch cashback on",
  placing: "Some buyers are still being placed in their tiers. Until they are, they earn the first tier's rate.",
  liveHeading: "Cashback is on",
  tryItHeading: "See it work with one order",
  tryItSteps: (min: string) => [
    `Make a draft order with yourself as the customer, using a custom item worth at least ${min} so nothing ships or leaves stock, and mark it as paid without sending a receipt.`,
    "Watch the cashback appear below and on your page in Shopify.",
    "Refund the item, not only the shipping, and watch the credit come back off.",
  ],
  draftOrder: "Make a draft order",
  tryItNoRate: "Your first tier gives no cashback, so a test order from a new buyer earns nothing. Raise the first tier's rate on the Tiers page to try it.",
  tryItPick: "Which order is your test?",
  tryItNone: "No orders since you switched on yet.",
  openOrder: "Open the order",
  goHome: "Go to Home",
  emails: "Shopify emails a buyer about store credit only if buyer emails are switched on in Settings.",
} as const;
```

- [ ] **Step 0: Before marking PR 2 ready,** rebase on main after #157 and RP-10 have merged, import `CASHBACK_BASE` and show it on step 2 under the tiers (in place of any retyped base rule), and reuse RP-10's widget setup line beside `GUIDE.turnOnWidget` if it lands as an export; otherwise ask in #170 for it to be exported, and keep `GUIDE.turnOnWidget`.
- [ ] **Step 1: Write the failing test** `test/unit/admin/guide-words.test.ts`:

```ts
it("keeps the house rules", () => {
  const all = JSON.stringify(GUIDE) + GUIDE.tryItSteps("£0.17").join(" ") + GUIDE.cost("£1", "12 months") + GUIDE.importRunning(3);
  for (const banned of ["free", "costs nothing", "no fees", "instant", "in minutes", "members", "customers", "!", "points", "loyalty program"]) {
    expect(all.toLowerCase()).not.toContain(banned);
  }
});
it("says the import's own period", () => {
  expect([365, 60].map(periodLabel)).toEqual(["12 months", "60 days"]);
});
it("counts buyers", () => {
  expect([1, 2, 1200].map(GUIDE.buyers)).toEqual(["1 buyer", "2 buyers", "1,200 buyers"]);
});
it("sums up the picture for a screen reader", () => {
  expect(GUIDE.chartSummary("Buyers by what they spent over the last 12 months", [7, 3, 1], "£200", "£500")).toBe(
    "Buyers by what they spent over the last 12 months: 7 buyers below £200, 3 buyers from £200, 1 buyer from £500",
  );
});
```

- [ ] **Step 2: Run and see it fail.** Run: `pnpm test:unit test/unit/admin/guide-words.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write `guide-words.ts`** with the object above (the copy is the spec's content in its final words, pending Yu's Pre-3 yes) and `periodLabel`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(rewards): the setup guide's words (RP-24)`.

### Task 6: a widget check that asks again

**Files:**
- Create: `app/admin/widget-embed.ts`
- Test: `test/unit/admin/widget-embed.dom.test.tsx`

**Interfaces:**
- Consumes: `widgetEmbedOn` from `~/admin/home-rules`.
- Produces: `useWidgetEmbed(): { on: boolean | null; recheck: () => void; returns: number }`. Asks `shopify.app.extensions()` on mount, on window `focus` and on `visibilitychange` to visible (returns less than 10 s apart are ignored), and on `recheck()`; `null` until App Bridge answers or when it can't. `returns` counts the merchant's returns to the tab, so the page can restart its polling with it (Task 9).

- [ ] **Step 1: Write the failing tests** (render a tiny component that prints `String(on)` and `returns`; this file has its own stub, since Home's helper takes `(embed, review)` and makes a new mock each call):

```tsx
const list = (status: "active" | "available") => [{ handle: "rewardspro-theme-extension", type: "theme_app_extension", activations: [{ handle: "membership_widget", name: "Rewards widget", target: "body", status, activations: [] }] }];
let status: "active" | "available" = "available";
const extensions = vi.fn(async () => list(status));
const stubAppBridge = (s: typeof status) => { status = s; vi.stubGlobal("shopify", { app: { extensions } }); };
```

```tsx
it("says on once App Bridge reports the embed active", async () => { /* stub "active" → "true" */ });
it("stays unknown without App Bridge", async () => { /* no stub → "null" */ });
it("asks again when the merchant comes back to the tab", async () => {
  stubAppBridge("available");
  render(<Probe />);
  await screen.findByText("false");
  status = "active";
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await screen.findByText("true");
  expect(extensions).toHaveBeenCalledTimes(2); // and the returns counter went from 0 to 1
});
it("asks again on recheck", async () => { /* click a button wired to recheck → second call */ });
```

- [ ] **Step 2: Run and see them fail.** Run: `pnpm test:unit test/unit/admin/widget-embed.dom.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** with the `live` flag pattern of Home's `useWidgetEmbed` (`app._index.tsx:203-218`), listeners removed on unmount.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(rewards): a widget check that asks again when the merchant returns (RP-24)`.

### Task 7: the buyer picture

**Files:**
- Create: `app/admin/LadderChart.tsx`
- Modify: `app/admin/admin.module.css` (add `.ladder` to the token selector list; new classes `.ladder`, `.bar`, `.barMid`, `.barTop`, `.threshold`, `.thresholdGrip`)
- Test: `test/unit/admin/ladder-chart.dom.test.tsx`

**Interfaces:**
- Consumes: Task 3's `snap`, `countsFor`, `MAX_BINS`.
- Produces:

```tsx
export function LadderChart(props: {
  ariaLabel: string;             // GUIDE.chartSummary(...), worked out by the page
  buyers: number[];
  binWidth: number;
  starts: [number, number] | null;  // tier 2 and 3 starts from validStarts; null draws the bars only, with no lines or tier shading
  formatAmount: (whole: number) => string;
  onStartsChange: (next: [number, number]) => void; // tier 2 and 3 starts, snapped
}): JSX.Element;
```

Plain SVG on `Chart.tsx`'s pattern: `role="img"` with `aria-label={ariaLabel}`; no text inside the SVG (the page shows `GUIDE.chartLabel` above it as Polaris text); bars below tier 2 in a light teal fill with a navy edge, tier 2 bars teal with a navy edge, tier 3 bars navy (told apart by fill and edge, not colour alone); two vertical navy lines with a grip, draggable by pointer (pointer events with capture), each move snapped to the bin grid and kept apart by one bin, reported through `onStartsChange`. The lines are `aria-hidden`: keyboard and screen-reader users set the starts through the fields (Task 9).

- [ ] **Step 1: Write the failing tests:**

```tsx
it("draws one bar per bin under the label it's given", () => {
  render(<LadderChart ariaLabel="Buyers by what they spent over the last 12 months: 7 buyers below £200" buyers={bins} binWidth={10} starts={[200, 500]} formatAmount={(n) => `£${n}`} onStartsChange={vi.fn()} />);
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Buyers by what they spent over the last 12 months: 7 buyers below £200");
  expect(document.querySelectorAll("rect")).toHaveLength(MAX_BINS);
});
it("marks the three tiers by more than colour", () => {
  // import styles from "~/admin/admin.module.css"; read each rect's getAttribute("class") (SVG className isn't a string)
  // and check it contains styles.bar / styles.barMid / styles.barTop by bin; no word-boundary regex (CSS-module names are _bar_<hash>)
});
it("draws no lines or tier shading without valid starts", () => { /* starts null → no line groups; every rect has styles.bar only */ });
it("reports a dragged line snapped to the grid, kept above the other", () => {
  // pointerdown on the tier-2 grip, pointermove to the x of 233 → onStartsChange([230, 500]);
  // dragging tier 2 past tier 3 stops one bin below it → [490, 500]
});
it("keeps its lines out of the accessibility tree", () => { /* each line group has aria-hidden="true" */ });
```

- [ ] **Step 2: Run and see them fail.** Run: `pnpm test:unit test/unit/admin/ladder-chart.dom.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** (jsdom has no layout or pointer capture: in the test, stub `Element.prototype.setPointerCapture`, `releasePointerCapture` and `hasPointerCapture` as `tiers.dom.test.tsx:29-31` stubs `scrollIntoView`, and stub the SVG's `getBoundingClientRect` to a known width; the chart maps `clientX` to an amount from that rect and its `viewBox`).
- [ ] **Step 4: Run, plus the existing visuals test.** Run: `pnpm test:unit test/unit/admin/ladder-chart.dom.test.tsx test/unit/admin/visuals.dom.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(rewards): the picture of a store's buyers with draggable tier lines (RP-24)`.

### Task 8: the guide's loader and action

**Files:**
- Create: `app/routes/app.welcome.tsx` (loader, action, `headers`, and a placeholder default export replaced in Task 9)
- Modify: `app/lib/guide.server.ts` (add `guideSwitchedOnAt(merchantId: string): Promise<Date | null>`: `running && setupCompletedAt ? max(setupCompletedAt, newest tier's createdAt) : null`, tested in `guide.postgres.test.ts`)
- Test: `test/postgres/welcome-page.postgres.test.ts`; modify `test/unit/admin/headers.test.ts` (add `["the setup guide", () => import("~/routes/app.welcome")]`)

**Interfaces:**
- Consumes: Tasks 1-4; `requireMerchant`; `homeState` (import only); `storeCreditSpendProblems`; `pollImport`; `syncWidgetConfig`; `setRunning`, `markSetupCompleted`; `tiersOf`, `tierPassPending`, `requestTierPass`, `saveLadder`, `isFreshLadder`; `homeBanners`, `importOutcomeLines`, `themeEditorUrl` (import only); `suggestStarts`, `periodLabel`.
- Produces: the loader's data, used by Task 9:

```ts
type WelcomeData = {
  step: 1 | 2 | 3;
  editable: boolean;                 // isFreshLadder(tiers, running), and not reading (?read=1): step 2 and step 1's Next are offered
  canGoLive: boolean;                // the store has tiers: step 3 is offered (it writes no tiers)
  running: boolean;
  currency: string;
  period: string;                    // periodLabel(importHorizonDays)
  importState: "not_started" | "running" | "done" | "failed";
  importedOrders: number;
  /** Home's one outcome sentence, only for a failed import or a done one with unreadable orders:
   *  importOutcomeLines({...}).slice(0, 1) when importState is "failed" or (done and importError !== null); otherwise [] */
  importLines: string[];
  medianOrder: string | null;        // steps 1 and 2, from readGuideBasics
  multiCurrency: boolean;            // steps 1 and 2, from readGuideBasics
  /** Step 2 only. suggested/fromData are exactly suggestStarts({...})'s starts/fromData: fallbacks included
   *  ([200, 500] with fromData false while the import runs, in a pound-like store), null where fallbackStarts is null */
  ladder: (LadderData & { suggested: [number, number] | null; fromData: boolean }) | null;
  /** The lone "Everyone" tier's rate when the store has exactly that tier, so row 1 starts at the merchant's own rate */
  everyonePercent: number | null;
  firstPercent: number | null;       // tier 1's rate once saved
  storeCredit: boolean | null;       // ok / problems / unknown, as Home maps it
  storeCreditBanner: string | null;  // the store-credit text from homeBanners(...) when there are problems
  themeEditorUrl: string;
  draftOrderUrl: string;             // `https://${conn.shop}/admin/draft_orders/new`, opened in a new tab
  placing: boolean;                  // tierPassPending
  /** When the guide's switch-on happened: running && setupCompletedAt ? max(setupCompletedAt, newest tier's createdAt) : null,
   *  so a store that completed setup on Home long ago still lists only orders since this guide's switch-on */
  switchedOnAt: string | null;
  tryIt: TryItOrder[];               // step 3, once switchedOnAt is set
};
type ActionResult = { ok: true } | { ok: false; error: string } | { ok: false; errors: LadderErrors };
```

**Step rule** (in the loader): read `?step=` (default 1) and `?read=1`. `?step=2` → 2 if `editable`, else 1. `?step=3` → 3 if `canGoLive`, else 2 if `editable`, else 1. Anything else → 1. Read `readGuideBasics` on steps 1 and 2, `readLadder` on step 2 only, `tryItOrders` on step 3 once `switchedOnAt` is set. Follow the import like Home (`pollImport` with an 8 s budget, logged on failure) on every step.

**Action intents:**
- `save-ladder` (fields `name0..2`, `minSpend1..2`, `percent0..2`) → `saveLadder`; on success `requestTierPass(conn.connectionId)` once and the widget write in Tiers' `afterChange` shape (rethrow a `Response`, log the rest), then `throw redirect(`/app/welcome?step=3${rest}`)` where `rest` keeps the request's other search parameters. On failure, `{ ok: false, errors }`.
- `running` (only `on`) → `setRunning(…, true)`; on `no_tiers` the error `"Save your tiers first."`; then `markSetupCompleted`, then the widget write; `{ ok: true }`.
- `finish-later` → `dismissGuide`; `{ ok: true }`.
- Anything else: `data({ ok: false, error: "Unknown action." }, { status: 400 })`.

- [ ] **Step 1: Write the failing tests.** Setup: copy from `home.postgres.test.ts` the `vi.mock` of require-merchant, `fakeAdmin` (it answers the store-credit questions), `signIn`, `seedShop`, `seedTier`, and an `act` and `load(url)` pointed at `/app/welcome`; copy from `tiers-page.postgres.test.ts` `widgetValues` and `passRequestedAt`; spy on `pollImport` with `vi.mock("~/shopify/bulk-import.server", …)` keeping the real module. A thrown redirect is caught as `test/unit/routes/index.test.ts` does.

```ts
it("serves each step only to the stores it is for", async () => {
  expect(await load("/app/welcome?step=2")).toMatchObject({ step: 2, editable: true, canGoLive: false }); // no tiers
  expect(await load("/app/welcome?step=3")).toMatchObject({ step: 2 });                                // no tiers yet
  expect(await load("/app/welcome?step=2&read=1")).toMatchObject({ step: 1, editable: false });       // reading from Settings
  await seedTier(conn, "Bronze", "0", "3", 0); await seedTier(conn, "Gold", "500", "8", 1);            // a ladder made on the Tiers page
  expect(await load("/app/welcome?step=2")).toMatchObject({ step: 1, editable: false, ladder: null });
  expect(await load("/app/welcome?step=3")).toMatchObject({ step: 3, canGoLive: true });
});
it("gives steps 1 and 2 the store's median order and currency mix", async () => { /* imported orders 40, 50, 60 GBP → step 1: medianOrder "50", multiCurrency false */ });
it("moves the running import on while the guide is open", async () => { /* importState running → pollImport called once with a deadline about 8 s ahead */ });
it("hands the page the suggestions with the fallbacks in", async () => { /* import running, GBP → ladder.suggested [200, 500], fromData false */ });
it("passes on only a failed or partial import's sentence", async () => { /* done, no error → importLines []; failed with 0 orders → [Home's NONE sentence] */ });
it("starts row 1 at the lone Everyone tier's rate", async () => { /* seedTier Everyone 0 6 → everyonePercent 6 */ });
it("saves the ladder, places buyers once, tells the widget and goes to step 3", async () => {
  const admin = fakeAdmin();
  const redirect = await actExpectingRedirect({ intent: "save-ladder", name0: "Bronze", percent0: "3", name1: "Silver", minSpend1: "200", percent1: "5", name2: "Gold", minSpend2: "500", percent2: "8" }, admin, "https://test.example.com/app/welcome?step=2&shop=s&host=h");
  expect(redirect.headers.get("Location")).toBe("/app/welcome?step=3&shop=s&host=h");
  expect(await passRequestedAt()).toBeInstanceOf(Date);
  expect(widgetValues(admin)).toEqual([{ running: false, basePercent: 3 }]);
  expect(await load("/app/welcome?step=3")).toMatchObject({ step: 3, canGoLive: true, running: false });
});
it("switches on, records setup done, tells the widget, and stays on step 3 with the try-it", async () => {
  // after a save: act running on → { ok: true }; merchant.running true; setupCompletedAt set; widget [{ running: true, basePercent: 3 }];
  // then a live order after switch-on → load(?step=3) has step 3, switchedOnAt set, tryIt [that order]
});
it("lists only orders since this guide's switch-on, even after an old Home setup", async () => {
  // setupCompletedAt a month ago (lone Everyone, paused), an old live order; save ladder now; switch on → tryIt excludes the old order
});
it("refuses switching on with no tiers", async () => { expect(await act({ intent: "running", running: "on" })).toEqual({ ok: false, error: "Save your tiers first." }); });
it("remembers Finish later", async () => { /* act finish-later → { ok: true }; guideDismissedAt set; guideDue false */ });
it("answers an unknown post with 400", async () => { expect(await act({ intent: "nope" })).toMatchObject({ ok: false, status: 400 }); });
```

- [ ] **Step 2: Run and see them fail.** Run: `pnpm test:postgres test/postgres/welcome-page.postgres.test.ts && pnpm test:unit test/unit/admin/headers.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the loader and action (copy Home's `followImport` and Tiers' `afterChange` into this file; they are private to queued files). `export const headers = privatePageHeaders;`. No nav entry.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(rewards): the setup guide's loader and actions (RP-24)`.

### Task 9: the guide's page

**Files:**
- Modify: `app/routes/app.welcome.tsx` (default export `Welcome`)
- Modify: `app/routes/app.settings._index.tsx` (Help section: `<s-link href="/app/welcome?step=1&read=1">How RewardsPro works</s-link>` before the email line)
- Test: `test/unit/routes/welcome.dom.test.tsx`; modify `test/unit/routes/settings.dom.test.tsx:94` (the href list gains `"/app/welcome?step=1&read=1"` in page order)

**Interfaces:**
- Consumes: Task 5's `GUIDE` and `periodLabel`, Task 6's `useWidgetEmbed`, Task 7's `LadderChart`, Task 3's `countsFor`, `costFor`, `validStarts`, `snap`, `minEarningBase`, `exampleOrder`, Task 8's `WelcomeData`, `ActionResult` and intents; `usePolling`, `PASS_FOLLOW_MS`; `cashbackFor`, `formatMoney`; `BUYER_IN_SHOPIFY`.

**Page shape** (`<s-page heading={GUIDE.heading} inlineSize="base">`):
- **Every step:** `s-progress value={step} max={3} accessibilityLabel={GUIDE.progress(step)}` with the step names; a widget status line (a local `Check`: `widgetYes/No/Unknown`); "Finish later" (secondary `s-button` on its own fetcher) posts `{ intent: "finish-later" }` and navigates to `/app` only once that fetcher's `data` is `{ ok: true }`, in an effect on its data (never in the click handler, so Home's guard can't see the store before the stamp commits).
- **One page-level poll**, as Home does (`app._index.tsx:323`): `usePolling(importRunning || d.placing || tryItWaiting, 10_000, { forMs: importRunning ? undefined : PASS_FOLLOW_MS, restartKey: `${d.importState}:${d.switchedOnAt ?? ""}:${returns}` })`, where `importRunning = d.importState === "running"`, `tryItWaiting` is step 3, switched on, and no chosen order with a settled status, and `returns` comes from `useWidgetEmbed` (so coming back from the draft-order tab restarts the watch).
- **Step 1:** the two tiles in an `s-grid` (stacked on narrow screens via `s-query-container`); the example `GUIDE.example(formatMoney(order), formatMoney(cashbackFor(order, firstPercent ?? 3, currency)))` with `order = exampleOrder(medianOrder, currency)`, left out when that is null; `GUIDE.creditCurrency` when `multiCurrency`; "Next" (to `?step=2`) when `editable`, else an `s-link` to `/app/tiers` with `GUIDE.editTiers`.
- **Step 2:** `GUIDE.tiersIntro(period)` when `ladder.fromData`; otherwise the matching fallback sentence (`tiersNoOrders` with no imported orders, `tiersFewBuyers` when the import is done with fewer than `MIN_SPENDERS` spenders, `tiersBlank` when `suggested` is null, else `tiersFallback`); `importLines` when there are any; `GUIDE.importRunning(importedOrders)` while it runs; `LadderChart` when the import is done with `importedOrders > 0`, under `GUIDE.chartLabel(period)` as Polaris text, with `ariaLabel = GUIDE.chartSummary(...)` when the starts are valid and `GUIDE.chartLabel(period)` otherwise. Three rows: `s-text-field` (name, from `GUIDE.defaultNames`), `s-money-field` (start; row 1 shows `GUIDE.firstTier` instead), `s-number-field` (cashback %, starting 3/5/8, or `everyonePercent` for row 1 when set), each with its error from `LadderErrors`. The three row counts (`countsFor`) and the cost line (`GUIDE.cost(formatMoney(costFor(...), currency), period)`, hidden with no imported orders) sit inside one polite live region (`role="status"`) from step 2's first render, and show only while `validStarts(start2, start3)` is non-null. `CASHBACK_BASE` under the rows once #157 has merged. "Save tiers" posts `save-ladder`; the action's redirect takes the page to step 3.
  - **Field state:** start fields are seeded only from `ladder.suggested` (blank when null; the page never hard-codes 200 or 500). A field the merchant has touched is never overwritten by a refresh; when `suggested` changes, untouched start fields take the new value. Dragging a line sets both start fields and marks them touched.
- **Step 3:** the checks (store credit with `storeCreditBanner` and Home's settings link when there are problems; widget with `GUIDE.turnOnWidget` as `s-link target="_blank"` to `themeEditorUrl`, and `GUIDE.checkAgain` calling `recheck`); `GUIDE.placing` when `placing`; "Switch cashback on" (primary; enabled whenever tiers are saved, whatever the widget says; disabled while its fetcher is busy). After switching on: `GUIDE.liveHeading`; `GUIDE.draftOrder` as `s-link target="_blank"` to `draftOrderUrl`; the try-it steps with `formatMoney(minEarningBase(firstPercent, currency), currency)`, or `GUIDE.tryItNoRate` when that is null; the try-it list (an `s-choice-list` when more than one, then the chosen order's status label and detail, `GUIDE.openOrder` to `/app/orders/:id`, `BUYER_IN_SHOPIFY` to `shopify://admin/customers/:externalCustomerId`), `GUIDE.tryItNone` when empty; `GUIDE.emails`; `GUIDE.goHome`.

- [ ] **Step 1: Write the failing tests** (`welcome.dom.test.tsx`, setup as `tiers.dom.test.tsx`, hydration data from a `welcomeData(o)` factory; the stub's loader answers revalidations with `o.next`):

```tsx
it("teaches the two basics on step 1 and offers Next", async () => { /* GUIDE.creditTitle, GUIDE.nextTimeTitle visible; Next links to ?step=2 */ });
it("uses the store's own example order and says the currency limit when it sells in several", async () => { /* JPY, medianOrder "4300", multiCurrency true → "¥5,000" in the example; GUIDE.creditCurrency shown */ });
it("offers the Tiers page instead when the ladder isn't editable", async () => { /* editable false → no Next; link /app/tiers with GUIDE.editTiers */ });
it("shows the widget's status on every step", async () => { /* steps 1-3 each show "Widget is off" with the stub "available" */ });
it("posts Finish later and goes Home only once it's recorded", async () => {
  // answer stays in flight → still on the guide; answer { ok: true } → the stub's /app route renders
});
it("posts the three tiers as typed, under the names the action reads", async () => {
  // type into name1, minSpend1, percent2 …; click Save tiers →
  // posted [{ intent: "save-ladder", name0: "Bronze", percent0: "3", name1: "Silver", minSpend1: "250", percent1: "5", name2: "Gold", minSpend2: "500", percent2: "8" }]
});
it("updates the buyer counts and the cost as a start changes, in a live region", async () => { /* minSpend1 200 → 300: counts and cost text change inside [role=status] */ });
it("keeps typed starts across a refresh and moves only untouched ones to the suggestions", async () => {
  // import running, GBP: suggested [200, 500], fromData false → fields 200/500; type 260 into minSpend1;
  // revalidate with import done, suggested [230, 610], fromData true → minSpend1 still 260, minSpend2 now 610
});
it("leaves the starts blank without suggestions, and shows no counts until both are valid", async () => {
  // JPY, suggested null → minSpend1/2 empty, GUIDE.tiersBlank shown, no [role=status] text; type 20000 and 50000 → counts appear
});
it("starts row 1 at the merchant's own Everyone rate", async () => { /* everyonePercent 6 → percent0 field value "6" */ });
it("shows each row's error from a refused save", async () => { /* answer { ok:false, errors:{ rows:[{},{ minSpend: TIER_ERRORS.ladderOrder },{}] } } → error attribute on minSpend1 */ });
it("hides the picture and the cost with no past orders, and says so", async () => { /* importedOrders 0 → GUIDE.tiersNoOrders; no role img */ });
it("enables the switch when the widget check is unknown", async () => { /* no App Bridge → "Widget: checking"; Switch cashback on not disabled */ });
it("opens the theme editor and the draft order page in new tabs", async () => { /* both s-links target _blank, hrefs from the data */ });
it("shows the smallest earning amount and the chosen order's result after switch-on", async () => { /* running, firstPercent 3, GBP → "at least £0.17"; tryIt two orders → choice; pick #1002 → "Issued" */ });
it("explains a first tier at 0% instead of failing", async () => { /* firstPercent 0 → GUIDE.tryItNoRate, no error boundary */ });
it("polls once for the page, and restarts when the merchant returns", async () => { /* last usePolling call args; a focus event changes restartKey */ });
```

and in `settings.dom.test.tsx`, the href list gains `"/app/welcome?step=1&read=1"` in page order; the page still has no "docs".

- [ ] **Step 2: Run and see them fail.** Run: `pnpm test:unit test/unit/routes/welcome.dom.test.tsx test/unit/routes/settings.dom.test.tsx test/unit/admin/nav.dom.test.tsx`. Expected: FAIL (nav stays PASS: the menu is unchanged).
- [ ] **Step 3: Implement** the page and the Settings link, one fetcher per control (CONCURRENCY-2), optimistic state from `fetcher.formData`.
- [ ] **Step 4: Run the whole unit suite and typecheck.** Run: `pnpm typecheck && pnpm lint && pnpm test:unit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(rewards): the setup guide's three steps (RP-24)`.
- [ ] **Step 6: After merge, walk it on rewardsprotesting with Yu.** Before Task 10 the guide is reachable only from Settings → "How RewardsPro works" (read mode, step 1) and by typing `/app/welcome?step=2` in the admin URL. Check: step 1 reads, the widget line, Finish later returns Home; on a dev store with no tiers (different-currency-test after Yu deletes its tiers, or a fresh dev store Yu creates), steps 2 and 3, the picture, Save tiers, Switch cashback on and the one-order try-it. Record what was seen in #185.

- [ ] **PR 2 gate:** draft PR (`Part of #185`); Yu's yes to the words in `guide-words.ts` (Pre-3); the claims rows proposed to RP-06 in #166 (Task 11); #157 and RP-10 merged and this branch rebased on them.

---

## PR 3: sending first-timers to the guide (branch `claude/rp-24-home-guard`, after PR 2, #157 and RP-10 merge)

### Task 10: the guard on Home's loader

**Files:**
- Modify: `app/routes/app._index.tsx` (line 3 import; one line after `const { admin, conn } = await requireMerchant(request);`; one import of `guideDue`)
- Test: `test/postgres/home.postgres.test.ts` (seed default and three new tests)

**Interfaces:**
- Consumes: Task 1's `guideDue`.

- [ ] **Step 1: Rebase on main** after PR 2, #157 and RP-10 have merged; re-find the loader's first lines.
- [ ] **Step 2: Write the failing tests** in `home.postgres.test.ts`, catching the thrown `Response` as `test/unit/routes/index.test.ts` does:

```ts
it("sends a store with no tiers to the guide, keeping every parameter, before asking Shopify anything", async () => {
  await seedShop(SHOP, { guideDismissed: false });
  const admin = fakeAdmin();
  const response = await loadExpectingRedirect("https://test.example.com/app?shop=home-test.myshopify.com&host=abc&embedded=1&id_token=t", admin);
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe("/app/welcome?shop=home-test.myshopify.com&host=abc&embedded=1&id_token=t");
  expect(admin.calls).toEqual([]);
});
it("loads Home after Finish later, with no tiers", async () => { /* seedShop dismissed (default) → load() returns data */ });
it("loads Home once the store has a tier, Finish later or not", async () => { /* not dismissed + seedTier → load() returns data */ });
```

Change `seedShop(shop = SHOP, o: { guideDismissed?: boolean } = {})` to stamp `guideDismissedAt` unless `guideDismissed === false`, so the 15 existing tests that load Home with no tiers keep their meaning (Home after Finish later).

- [ ] **Step 3: Run and see the new test fail.** Run: `pnpm test:postgres test/postgres/home.postgres.test.ts`. Expected: the redirect test FAILS; everything else PASSES.
- [ ] **Step 4: Add the guard:**

```ts
  if (await guideDue(conn.merchantId)) throw redirect(`/app/welcome${new URL(request.url).search}`);
```

- [ ] **Step 5: Run everything.** Run: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:postgres`. Expected: PASS (`home.dom.test.tsx`, `index.test.ts`, `headers.test.ts` need no change).
- [ ] **Step 6: Commit** `feat(rewards): send a first-time store to the setup guide (RP-24)`.
- [ ] **Step 7: Before merge, prove the redirect in the real embedded admin on staging**, the way A25 ran: a fresh staging database (`scripts/test-db.sh staging stop`, then `eval "$(scripts/test-db.sh staging start)"`), Yu runs `shopify app dev --config shopify.app.staging.toml --store cashbackpro.myshopify.com` on this branch in his own terminal, and opens the app: the first open must land on the guide inside the admin frame with no bounce or re-auth, Finish later must return to Home, and a reload must stay on Home. Record it in the PR.
- [ ] **Step 8: After merge,** comment on #181 that the guide is live, so RP-21 can capture S1-A.

- [ ] **PR 3 gate:** draft PR (`Closes #185`); Step 7 recorded; merge in its turn in the shared-file order (WORK.md), on Yu's word.

---

## Task 11: claims rows and coordination (no code; alongside PR 2)

- [ ] Post in #166 (RP-06) one proposed row per guide sentence that needs one, each with its locator (`app/admin/guide-words.ts:<line>` and the code that makes it true): Shopify's customer-page balance (an `sh-*` row from Yu's paste or a capture, never an agent read of help.shopify.com), "not a discount on this order", the cost estimate, the smallest earning amount, and the existing rows the guide reuses (`rp-store-credit`, `rp-paid-trigger`, `sh-sc-signin-legacy`, `sh-sc-currency`, `rp-tier-window`, `rp-import-past`, `rp-cashback-base`, `rp-widget`, `rp-refund-takeback`).
- [ ] Ask in #185 for a second session's `concur:` on each guide sentence against the code.
- [ ] Update #185's "May edit" list to add `app/admin/admin.module.css`, `test/unit/admin/headers.test.ts` and `test/unit/routes/settings.dom.test.tsx` (used by Tasks 7-9).
