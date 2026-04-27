# P14: SQLite → PostgreSQL Migration & Vercel Deployment

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate from SQLite/libsql to Neon PostgreSQL and prepare for Vercel deployment.

**Architecture:** Full PostgreSQL switch — no dual DB support. Uses `postgres` (postgres.js) driver via `drizzle-orm/postgres-js`. Custom `money` column type wraps `numeric(10,2)` with auto-parse to `number` so all existing arithmetic code works unchanged. Timestamp columns replace text date fields (returns `Date` objects).

**Tech Stack:** Drizzle ORM, postgres.js, Neon PostgreSQL, Vercel

---

### Task 1: Swap dependencies

**Files:**
- Modify: `package.json`

**Step 1: Remove libsql, add postgres.js**

Run:
```bash
pnpm remove @libsql/client @auth/drizzle-adapter
pnpm add postgres
```

Note: `@auth/drizzle-adapter` is installed but unused (auth is JWT-based with direct queries). Remove it to avoid confusion.

**Step 2: Verify install**

Run: `pnpm ls postgres`
Expected: `postgres` listed

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: swap @libsql/client for postgres (postgres.js)"
```

---

### Task 2: Rewrite schema.ts

**Files:**
- Modify: `src/lib/db/schema.ts`

This is the biggest change. Every table switches from `sqliteTable` to `pgTable`.

**Step 1: Write the new schema**

Replace the entire file with:

```ts
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  real,
  timestamp,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

// Custom numeric(10,2) that auto-parses to JS number (Postgres numeric returns strings)
const money = customType<{ data: number; driverData: string }>({
  dataType() {
    return "numeric(10, 2)";
  },
  fromDriver(value: string): number {
    return Number(value);
  },
});

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  company: text("company"),
  role: text("role", { enum: ["admin", "client"] }).notNull().default("client"),
  currentMonthSpend: money("current_month_spend").notNull().default(0),
  priorMonthSpend: money("prior_month_spend").notNull().default(0),
  volumeDiscountPct: real("volume_discount_pct").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").default(true),
});

export const sets = pgTable("sets", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => games.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  releaseDate: text("release_date"),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").default(true),
}, (table) => ({
  gameCodeUnique: uniqueIndex("sets_game_code_idx").on(table.gameId, table.code),
}));

export const cards = pgTable("cards", {
  id: serial("id").primaryKey(),
  cardNumber: text("card_number").notNull(),
  sku: text("sku").notNull().unique(),
  name: text("name").default(""),
  setCode: text("set_code"),
  setName: text("set_name"),
  cardrushUrl: text("cardrush_url"),
  cardrushJpy: integer("cardrush_jpy"),
  gbpJpyRate: real("gbp_jpy_rate"),
  baseGbp: money("base_gbp"),
  priceExVat: money("price_ex_vat"),
  ebayItemNumber: text("ebay_item_number"),
  lastSyncedAt: timestamp("last_synced_at"),
  gameId: integer("game_id").references(() => games.id),
  setId: integer("set_id").references(() => sets.id),
  category: text("category", { enum: ["singles", "sealed"] }).notNull().default("singles"),
  productType: text("product_type"),
  imageUrl: text("image_url"),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id),
  status: text("status", {
    enum: ["draft", "submitted", "quoted", "confirmed", "paid", "ordered", "shipped", "delivered", "cancelled"],
  }).notNull().default("draft"),
  totalExVat: money("total_ex_vat").notNull().default(0),
  volumeDiscount: real("volume_discount").notNull().default(0),
  notes: text("notes"),
  adminNotes: text("admin_notes"),
  quotedAt: timestamp("quoted_at"),
  quotedExpiresAt: timestamp("quoted_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  stockCheckedAt: timestamp("stock_checked_at"),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  cardId: integer("card_id").notNull().references(() => cards.id),
  quantity: integer("quantity").notNull().default(1),
  unitPriceExVat: money("unit_price_ex_vat").notNull(),
  originalUnitPrice: money("original_unit_price"),
  lineTotal: money("line_total").notNull(),
  stockStatus: text("stock_status", {
    enum: ["pending", "in_stock", "out_of_stock", "price_changed"],
  }).notNull().default("pending"),
  checkedPriceJpy: integer("checked_price_jpy"),
});

export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id").notNull().references(() => cards.id),
  date: text("date").notNull(),
  cardrushJpy: integer("cardrush_jpy").notNull(),
  gbpJpyRate: real("gbp_jpy_rate").notNull(),
}, (table) => ({
  cardDateUnique: uniqueIndex("price_history_card_date_idx").on(table.cardId, table.date),
}));

export type Client = typeof clients.$inferSelect;
export type Game = typeof games.$inferSelect;
export type GameSet = typeof sets.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type PriceHistory = typeof priceHistory.$inferSelect;
```

Key changes:
- `sqliteTable` → `pgTable` on all 7 tables
- `integer("id").primaryKey({ autoIncrement: true })` → `serial("id").primaryKey()`
- `integer("active", { mode: "boolean" })` → `boolean("active")`
- `text("created_at").default(sql\`(datetime('now'))\`)` → `timestamp("created_at").defaultNow()`
- All date/time text columns → `timestamp` (nullable where needed)
- Money columns (`real`) → custom `money` type (`numeric(10,2)` with auto-parse)
- `volumeDiscount` (percentage 0-1) → `real` (not money — it's a rate, not an amount)
- `volumeDiscountPct` → `real` (same — percentage)
- `gbpJpyRate` → `real` (exchange rate, floating point fine)
- `release_date` and `date` → stay as `text` (display string / composite key)

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: Type errors in files that use `.get()` or `.run()` (these will be fixed in later tasks). Schema itself should have no errors.

**Step 3: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat: rewrite schema for PostgreSQL (pgTable, timestamps, numeric money)"
```

---

### Task 3: Rewrite db/index.ts

**Files:**
- Modify: `src/lib/db/index.ts`

**Step 1: Replace the connection setup**

Replace entire file with:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString, {
  max: 1, // Vercel serverless: 1 connection per function invocation
});

export const db = drizzle(client, { schema });
```

Notes:
- `max: 1` is important for Vercel serverless — each function invocation gets its own connection, prevents connection exhaustion on Neon free tier
- No more file path logic — DATABASE_URL is a postgres connection string

**Step 2: Commit**

```bash
git add src/lib/db/index.ts
git commit -m "feat: switch DB connection from libsql to postgres.js"
```

---

### Task 4: Update drizzle.config.ts

**Files:**
- Modify: `drizzle.config.ts`

**Step 1: Update dialect and credentials**

Replace entire file with:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**Step 2: Commit**

```bash
git add drizzle.config.ts
git commit -m "chore: update drizzle config for PostgreSQL dialect"
```

---

### Task 5: Rewrite seed.ts

**Files:**
- Modify: `src/lib/db/seed.ts`

The current seed uses `executeMultiple()` for raw DDL (SQLite syntax) and `.get()` for single-row selects. Rewrite to use pure Drizzle ORM operations — `db:push` handles DDL.

**Step 1: Rewrite the seed script**

Replace entire file with:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hashSync } from "bcryptjs";
import { clients, games, sets, cards } from "./schema";
import { eq } from "drizzle-orm";
import { calculatePrice } from "../pricing";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function seed() {
  // Seed admin
  await db.insert(clients).values({
    name: "Admin",
    email: "admin@cambridgetcg.com",
    passwordHash: hashSync("admin123", 10),
    company: "Cambridge TCG",
    role: "admin",
    currentMonthSpend: 0,
    priorMonthSpend: 0,
    volumeDiscountPct: 0,
  }).onConflictDoNothing();

  // Seed test client
  await db.insert(clients).values({
    name: "Test Client",
    email: "client@streamer.com",
    passwordHash: hashSync("client123", 10),
    company: "StreamerCo",
    role: "client",
    currentMonthSpend: 0,
    priorMonthSpend: 25000,
    volumeDiscountPct: 0.04,
  }).onConflictDoNothing();

  // Seed games
  const gameData = [
    { code: "onepiece", name: "One Piece", slug: "one-piece", sortOrder: 0, active: true },
    { code: "pokemon", name: "Pokémon", slug: "pokemon", sortOrder: 1, active: false },
    { code: "yugioh", name: "Yu-Gi-Oh!", slug: "yu-gi-oh", sortOrder: 2, active: false },
    { code: "dragonball", name: "Dragon Ball", slug: "dragon-ball", sortOrder: 3, active: false },
  ];

  for (const g of gameData) {
    await db.insert(games).values(g).onConflictDoNothing();
  }

  // Get One Piece game ID
  const [onepieceGame] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.code, "onepiece"))
    .limit(1);
  const onepieceId = onepieceGame!.id;

  // Seed One Piece sets
  const setData = [
    { code: "OP01", name: "Romance Dawn", releaseDate: "2022-07-22", sortOrder: 0 },
    { code: "OP02", name: "Paramount War", releaseDate: "2022-11-04", sortOrder: 1 },
    { code: "OP03", name: "Pillars of Strength", releaseDate: "2023-01-27", sortOrder: 2 },
    { code: "OP04", name: "Kingdoms of Intrigue", releaseDate: "2023-05-27", sortOrder: 3 },
    { code: "OP05", name: "Awakening of the New Era", releaseDate: "2023-08-25", sortOrder: 4 },
    { code: "OP06", name: "Wings of the Captain", releaseDate: "2023-11-25", sortOrder: 5 },
    { code: "OP07", name: "500 Years in the Future", releaseDate: "2024-02-24", sortOrder: 6 },
    { code: "OP08", name: "Two Legends", releaseDate: "2024-05-25", sortOrder: 7 },
    { code: "OP09", name: "The Four Emperors", releaseDate: "2024-08-24", sortOrder: 8 },
    { code: "OP10", name: "Royal Blood", releaseDate: "2024-11-23", sortOrder: 9 },
    { code: "ST01", name: "Starter Deck: Straw Hat Crew", sortOrder: 100 },
    { code: "ST02", name: "Starter Deck: Worst Generation", sortOrder: 101 },
    { code: "ST03", name: "Starter Deck: The Seven Warlords", sortOrder: 102 },
    { code: "ST04", name: "Starter Deck: Animal Kingdom Pirates", sortOrder: 103 },
    { code: "ST05", name: "Starter Deck: Film Edition", sortOrder: 104 },
    { code: "ST06", name: "Starter Deck: Navy", sortOrder: 105 },
    { code: "ST07", name: "Starter Deck: Big Mom Pirates", sortOrder: 106 },
    { code: "ST08", name: "Starter Deck: Monkey D. Luffy", sortOrder: 107 },
    { code: "ST09", name: "Starter Deck: Yamato", sortOrder: 108 },
    { code: "ST10", name: "Starter Deck: Ultimate Deck", sortOrder: 109 },
    { code: "ST11", name: "Starter Deck: Uta", sortOrder: 110 },
    { code: "ST12", name: "Starter Deck: Zoro & Sanji", sortOrder: 111 },
    { code: "ST13", name: "Starter Deck: The Three Captains", sortOrder: 112 },
    { code: "ST14", name: "Starter Deck: 3D2Y", sortOrder: 113 },
    { code: "ST15", name: "Starter Deck: RED Edward Newgate", sortOrder: 114 },
    { code: "ST16", name: "Starter Deck: GREEN Uta", sortOrder: 115 },
    { code: "EB01", name: "Memorial Collection", releaseDate: "2024-01-27", sortOrder: 50 },
    { code: "PRB01", name: "Premium Booster", releaseDate: "2023-10-28", sortOrder: 51 },
  ];

  for (const s of setData) {
    await db.insert(sets).values({ ...s, gameId: onepieceId }).onConflictDoNothing();
  }

  // Build set ID lookup map
  const allSets = await db.select({ id: sets.id, code: sets.code }).from(sets).where(eq(sets.gameId, onepieceId));
  const setIdMap = Object.fromEntries(allSets.map(s => [s.code, s.id]));

  // Seed 10 sample One Piece cards
  const rate = 208.53;
  const sampleCards = [
    { cardNumber: "OP01-001", sku: "OP-OP01-001-JP", name: "Roronoa Zoro (Leader)", setCode: "OP01", setName: "Romance Dawn", jpy: 17800 },
    { cardNumber: "OP01-002", sku: "OP-OP01-002-JP", name: "Nami", setCode: "OP01", setName: "Romance Dawn", jpy: 2500 },
    { cardNumber: "OP01-003", sku: "OP-OP01-003-JP", name: "Usopp", setCode: "OP01", setName: "Romance Dawn", jpy: 1200 },
    { cardNumber: "OP01-060", sku: "OP-OP01-060-JP", name: "Shanks", setCode: "OP01", setName: "Romance Dawn", jpy: 9800 },
    { cardNumber: "OP02-001", sku: "OP-OP02-001-JP", name: "Monkey D. Luffy (Leader)", setCode: "OP02", setName: "Paramount War", jpy: 22000 },
    { cardNumber: "OP02-002", sku: "OP-OP02-002-JP", name: "Portgas D. Ace", setCode: "OP02", setName: "Paramount War", jpy: 8500 },
    { cardNumber: "OP03-001", sku: "OP-OP03-001-JP", name: "Boa Hancock (Leader)", setCode: "OP03", setName: "Pillars of Strength", jpy: 15000 },
    { cardNumber: "OP03-002", sku: "OP-OP03-002-JP", name: "Crocodile", setCode: "OP03", setName: "Pillars of Strength", jpy: 6200 },
    { cardNumber: "OP04-001", sku: "OP-OP04-001-JP", name: "Kaido (Leader)", setCode: "OP04", setName: "Kingdoms of Intrigue", jpy: 19500 },
    { cardNumber: "OP04-044", sku: "OP-OP04-044-JP", name: "Yamato", setCode: "OP04", setName: "Kingdoms of Intrigue", jpy: 12500 },
  ];

  for (const c of sampleCards) {
    const price = calculatePrice(c.jpy, rate);

    await db.insert(cards).values({
      cardNumber: c.cardNumber,
      sku: c.sku,
      name: c.name,
      setCode: c.setCode,
      setName: c.setName,
      cardrushUrl: `https://www.cardrush-op.jp/product/${c.cardNumber}`,
      cardrushJpy: c.jpy,
      gbpJpyRate: rate,
      baseGbp: price.baseGbp,
      priceExVat: price.priceExVat,
      lastSyncedAt: new Date(),
      gameId: onepieceId,
      setId: setIdMap[c.setCode],
      category: "singles" as const,
    }).onConflictDoNothing();
  }

  console.log("Seeded database with admin, test client, games, sets, and 10 sample cards");
  await client.end();
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Key changes from original:
- `@libsql/client` → `postgres` driver
- Removed `executeMultiple()` raw DDL — `db:push` handles table creation
- Removed `mkdirSync("data")` — no local file DB
- `.get()` → `.limit(1)` with array destructuring
- `lastSyncedAt: new Date().toISOString()` → `lastSyncedAt: new Date()`
- Added `await client.end()` for clean shutdown

**Step 2: Commit**

```bash
git add src/lib/db/seed.ts
git commit -m "feat: rewrite seed script for postgres.js"
```

---

### Task 6: Fix sync/route.ts — replace .get() and .run()

**Files:**
- Modify: `src/app/api/sync/route.ts`

The file uses `.get()` (6 times) and `.run()` (4 times). In postgres.js driver:
- `.get()` doesn't exist → use `.limit(1)` with array destructuring `const [row] = await ...`
- `.run()` doesn't exist → just remove `.run()` (Drizzle executes immediately with `.values()`)

**Step 1: Apply fixes**

Changes needed (line references from current file):

Line 17: `const now = new Date().toISOString()` → `const now = new Date()` (for timestamp columns)

Line 23: `.get()` → `.limit(1)` + destructure
```ts
// Before: let game = await db.select().from(games).where(eq(games.code, gameCode)).get();
// After:
let [game] = await db.select().from(games).where(eq(games.code, gameCode)).limit(1);
```

Line 27: `.run()` → remove
```ts
// Before: ...values({...}).run();
// After: ...values({...});
```

Line 28: Same as line 23 — `.get()` → `.limit(1)` + destructure

Line 38: Same `.get()` pattern for sets

Line 42: Same `.run()` removal for sets insert

Line 43: Same `.get()` pattern for sets

Line 79: `.run()` → remove (cards insert/upsert)

Line 86: `.get()` → `.limit(1)` + destructure (card ID lookup)

Line 103: `.run()` → remove (price history upsert)

Also update timestamp assignment on line 60: `lastSyncedAt: now` — `now` is already a Date after the change on line 17.

**Step 2: Verify no .get() or .run() calls remain**

Run: `grep -n '\.get()\|\.run()' src/app/api/sync/route.ts`
Expected: No matches

**Step 3: Commit**

```bash
git add src/app/api/sync/route.ts
git commit -m "fix: replace libsql .get()/.run() with postgres-compatible queries in sync route"
```

---

### Task 7: Fix prices/upload/route.ts — replace .run()

**Files:**
- Modify: `src/app/api/prices/upload/route.ts`

Two `.run()` calls on lines 73 and 87.

**Step 1: Apply fixes**

Line 33: `const now = new Date().toISOString()` → `const now = new Date()`

Line 73: Remove `.run()` from cards upsert with rate
```ts
// Before: ...onConflictDoUpdate({...}).run();
// After:  ...onConflictDoUpdate({...});
```

Line 87: Same removal for cards upsert without rate

Also update `lastSyncedAt: now` references — `now` is already a Date.

**Step 2: Verify no .run() calls remain**

Run: `grep -n '\.run()' src/app/api/prices/upload/route.ts`
Expected: No matches

**Step 3: Commit**

```bash
git add src/app/api/prices/upload/route.ts
git commit -m "fix: replace libsql .run() with postgres-compatible queries in price upload"
```

---

### Task 8: Fix timestamp handling in routes

**Files:**
- Modify: `src/app/api/orders/route.ts` — lines 37, 46-47
- Modify: `src/app/api/orders/[id]/status/route.ts` — lines 45, 53-54
- Modify: `src/app/api/orders/[id]/items/route.ts` — lines 91-92, 99-101
- Modify: `src/app/api/orders/[id]/stock-check/complete/route.ts` — lines 82-83, 89-93
- Modify: `src/app/api/cards/[id]/route.ts` — line 18

All these files create ISO strings with `new Date().toISOString()` and assign them to timestamp columns. Postgres.js accepts both Date objects and ISO strings for timestamp columns, but using Date objects is cleaner.

**Step 1: Update orders/route.ts**

```ts
// Line 37: const now = new Date().toISOString();
// Change to:
const now = new Date();
```

The `createdAt: now` and `updatedAt: now` on lines 46-47 will then pass Date objects. ✓

**Step 2: Update orders/[id]/status/route.ts**

```ts
// Line 45: const now = new Date().toISOString();
// Change to:
const now = new Date();

// Line 54: statusUpdate.quotedExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
// Change to:
statusUpdate.quotedExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
```

**Step 3: Update orders/[id]/items/route.ts**

```ts
// Line 91-92:
// const quotedAt = new Date().toISOString();
// const quotedExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
// Change to:
const quotedAt = new Date();
const quotedExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
```

**Step 4: Update orders/[id]/stock-check/complete/route.ts**

```ts
// Line 82-83:
// const now = new Date().toISOString();
// const quotedExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
// Change to:
const now = new Date();
const quotedExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
```

**Step 5: Update cards/[id]/route.ts**

```ts
// Line 18: .set({ priceExVat, lastSyncedAt: new Date().toISOString() })
// Change to:
.set({ priceExVat, lastSyncedAt: new Date() })
```

**Step 6: Commit**

```bash
git add src/app/api/orders/route.ts \
  src/app/api/orders/\[id\]/status/route.ts \
  src/app/api/orders/\[id\]/items/route.ts \
  src/app/api/orders/\[id\]/stock-check/complete/route.ts \
  src/app/api/cards/\[id\]/route.ts
git commit -m "fix: pass Date objects to timestamp columns instead of ISO strings"
```

---

### Task 9: Fix admin dashboard date comparison

**Files:**
- Modify: `src/app/admin/page.tsx` — lines 18-23

The current code does a string comparison `(o.createdAt ?? "") >= monthStart` where `monthStart` is a string like `"2026-02-01 00:00:00"`. With timestamp columns, `createdAt` is `Date | null`, so this needs to compare Date objects.

**Step 1: Fix the date comparison**

```ts
// Lines 7-10 (current):
// const now = new Date();
// const y = now.getFullYear();
// const m = String(now.getMonth() + 1).padStart(2, "0");
// const monthStart = `${y}-${m}-01 00:00:00`;

// Change to:
const now = new Date();
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

// Lines 18-23 (current):
// const monthRevenue = allOrders
//   .filter((o) =>
//     ["paid", "ordered", "shipped", "delivered"].includes(o.status) &&
//     (o.createdAt ?? "") >= monthStart
//   )

// Change to:
const monthRevenue = allOrders
  .filter((o) =>
    ["paid", "ordered", "shipped", "delivered"].includes(o.status) &&
    o.createdAt != null && o.createdAt >= monthStart
  )
  .reduce((sum, o) => sum + o.totalExVat, 0);
```

**Step 2: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "fix: use Date comparison for month revenue filter on admin dashboard"
```

---

### Task 10: Fix unique constraint error detection

**Files:**
- Modify: `src/app/api/clients/route.ts` — line 40

SQLite unique violations contain "UNIQUE" in the error message. PostgreSQL uses error code `23505` and the message says "duplicate key".

**Step 1: Fix the error check**

```ts
// Line 40 (current):
// if (String(error).includes("UNIQUE")) {

// Change to:
if (String(error).includes("duplicate key") || String(error).includes("UNIQUE")) {
```

**Step 2: Commit**

```bash
git add src/app/api/clients/route.ts
git commit -m "fix: detect postgres duplicate key errors for client creation"
```

---

### Task 11: Update environment config

**Files:**
- Modify: `.env.example`

**Step 1: Update .env.example**

```
# Database (Neon PostgreSQL)
DATABASE_URL=postgres://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require

# NextAuth
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000

# AWS S3 (for price feed sync)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=eu-west-2
S3_BUCKET=pricedata-tcg
S3_PRICE_FEED_KEY=pricefeed/onepiece_pricefeed.xlsx
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: update .env.example with postgres connection string format"
```

---

### Task 12: TypeScript check and build

**Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors. If errors appear, fix them — likely from timestamp type changes (places doing `new Date(stringValue)` where the value is now a `Date`).

**Step 2: Run build**

Run: `pnpm build`
Expected: Successful build. This verifies all imports resolve, types align, and pages compile.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors from postgres migration"
```

---

### Task 13: Set up Neon and push schema

**Prerequisites:** User must have Neon project created and DATABASE_URL ready.

**Step 1: Update .env.local with Neon connection string**

User sets `DATABASE_URL=postgres://...` in `.env.local`

**Step 2: Push schema to Neon**

Run: `pnpm db:push`
Expected: Tables created successfully on Neon

**Step 3: Seed the database**

Run: `pnpm db:seed`
Expected: "Seeded database with admin, test client, games, sets, and 10 sample cards"

**Step 4: Verify locally**

Run: `pnpm dev`

Check:
- [ ] Login works (admin@cambridgetcg.com / admin123)
- [ ] Catalog loads with 10 sample cards and prices
- [ ] Cart works (add items, review order page)
- [ ] Admin dashboard shows stats
- [ ] Admin clients page loads

---

### Task 14: Deploy to Vercel

**Step 1: Set environment variables on Vercel**

Via dashboard or CLI:
```
DATABASE_URL=postgres://...
NEXTAUTH_SECRET=<output of: openssl rand -base64 32>
NEXTAUTH_URL=https://your-domain.vercel.app
AWS_ACCESS_KEY_ID=<from ~/.aws/credentials>
AWS_SECRET_ACCESS_KEY=<from ~/.aws/credentials>
AWS_REGION=eu-west-2
S3_BUCKET=pricedata-tcg
S3_PRICE_FEED_KEY=pricefeed/onepiece_pricefeed.xlsx
```

**Step 2: Deploy**

Run:
```bash
vercel link
vercel deploy --prod
```

**Step 3: Post-deploy checks**

- [ ] Login works (admin + client)
- [ ] Catalog loads with prices
- [ ] S3 sync works from admin panel
- [ ] Order submission works
- [ ] Admin order management works
- [ ] HTTPS working

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Vercel deployment with Neon PostgreSQL"
```
