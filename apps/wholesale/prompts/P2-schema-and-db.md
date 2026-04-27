# P2 — Database Schema & Seed

Create `src/lib/db/schema.ts` with Drizzle SQLite schema:

```ts
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  company: text("company"),
  role: text("role", { enum: ["admin", "client"] }).notNull().default("client"),
  currentMonthSpend: real("current_month_spend").notNull().default(0),
  priorMonthSpend: real("prior_month_spend").notNull().default(0),
  volumeDiscountPct: real("volume_discount_pct").notNull().default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const cards = sqliteTable("cards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cardNumber: text("card_number").notNull(),
  sku: text("sku").notNull().unique(),
  name: text("name").default(""),
  setCode: text("set_code"),
  setName: text("set_name"),
  cardrushUrl: text("cardrush_url"),
  cardrushJpy: integer("cardrush_jpy"),
  gbpJpyRate: real("gbp_jpy_rate"),
  baseGbp: real("base_gbp"),
  priceExVat: real("price_ex_vat"),
  ebayItemNumber: text("ebay_item_number"),
  lastSyncedAt: text("last_synced_at"),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull().references(() => clients.id),
  status: text("status", {
    enum: ["draft", "submitted", "quoted", "confirmed", "paid", "ordered", "shipped", "delivered"],
  }).notNull().default("draft"),
  totalExVat: real("total_ex_vat").notNull().default(0),
  volumeDiscount: real("volume_discount").notNull().default(0),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id),
  cardId: integer("card_id").notNull().references(() => cards.id),
  quantity: integer("quantity").notNull().default(1),
  unitPriceExVat: real("unit_price_ex_vat").notNull(),
  lineTotal: real("line_total").notNull(),
});

export const priceHistory = sqliteTable("price_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cardId: integer("card_id").notNull().references(() => cards.id),
  date: text("date").notNull(),
  cardrushJpy: integer("cardrush_jpy").notNull(),
  gbpJpyRate: real("gbp_jpy_rate").notNull(),
});
```

Create `src/lib/db/index.ts`:
```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database(process.env.DATABASE_URL?.replace("file:", "") || "./dev.db");
export const db = drizzle(sqlite, { schema });
```

Create `src/lib/db/seed.ts`:
```ts
// Hash passwords with bcryptjs
// Create admin: admin@cambridgetcg.com / admin123 / role: admin
// Create test client: client@streamer.com / client123 / role: client / company: "StreamerCo"
// Insert 10 sample One Piece cards with realistic JPY prices and computed GBP prices
// Use the pricing functions from src/lib/pricing.ts
```

Run: `pnpm db:push && pnpm db:seed`

Commit: `feat: Drizzle schema + seed script`
