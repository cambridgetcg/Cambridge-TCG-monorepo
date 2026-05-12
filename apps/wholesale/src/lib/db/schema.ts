/**
 * The wholesale kingdom's grammar of being.
 *
 * Twenty `pgTable` declarations below; one `money` customType meta-act
 * at the top. Every kind of thing this platform recognises on the
 * wholesale side — clients, games, sets, cards, orders, price archives,
 * stock adjustments, channel-pricing oracles — is first declared here.
 *
 * The substrate (Postgres) cannot disagree. Once the schema is declared
 * and the migration runs, the kingdom contains those *kinds*. Not those
 * rows yet — those *kinds*. Rows are the kingdom's deeds; kinds are
 * the kingdom's grammar.
 *
 * Cosmological reading — the Will and Sophia, the story of creation:
 * every `pgTable("name", { ... })` is the WILL writing a sentence; the
 * schema's shape is Sophia; where they meet, the kingdom acquires a new
 * kind of thing. See docs/connections/the-first-words.md for the full
 * fairy-tale walk through these twenty acts and the meta-creation of
 * `money` at the top.
 *
 * Sister grammar (the storefront's): apps/storefront/drizzle/*.sql,
 * 88+ migrations. Two kingdoms; two grammars; one platform; held
 * together by the Bearer-token across the moor (S5's Falcon).
 */

import {
  pgTable,
  serial,
  bigserial,
  text,
  integer,
  bigint,
  boolean,
  real,
  timestamp,
  date,
  uniqueIndex,
  index,
  customType,
  jsonb,
} from "drizzle-orm/pg-core";

// `money` — the meta-verb. Postgres returns numeric(10,2) as strings by
// default; the kingdom reasons in JS numbers. This customType teaches
// the substrate the translation. Every column declared as money(...)
// below — clients.currentMonthSpend, cards.baseGbp, cards.price,
// orders.totalGbp, etc. — borrows from this single teaching. The first
// creative act in this file is not a table; it is the act of teaching
// the substrate one of the kingdom's verbs.
// See docs/connections/the-first-words.md.
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
  orderPrefix: text("order_prefix"),
  orderSequence: integer("order_sequence").notNull().default(0),
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
  nameEn: text("name_en"),
  setCode: text("set_code"),
  setName: text("set_name"),
  cardrushUrl: text("cardrush_url"),
  cardrushJpy: integer("cardrush_jpy"),
  gbpJpyRate: real("gbp_jpy_rate"),
  baseGbp: money("base_gbp"),
  price: money("price"),
  ebayItemNumber: text("ebay_item_number"),
  lastSyncedAt: timestamp("last_synced_at"),
  gameId: integer("game_id").references(() => games.id),
  setId: integer("set_id").references(() => sets.id),
  category: text("category", { enum: ["singles", "sealed"] }).notNull().default("singles"),
  productType: text("product_type"),
  rarity: text("rarity"),
  imageUrl: text("image_url"),
  stock: integer("stock").notNull().default(0), // UK warehouse on-hand: received - fulfilled
  pendingStock: integer("pending_stock").notNull().default(0), // ordered/shipped but not yet received
  reservedStock: integer("reserved_stock").notNull().default(0), // held by carts / checkouts via @cambridge-tcg/stock
  stockReconciledAt: timestamp("stock_reconciled_at", { withTimezone: true }), // last reconciliation between movement-ledger sum and `stock`
  shopifyProductId: text("shopify_product_id"),
  shopifyVariantId: text("shopify_variant_id"),
  shopifyInventoryItemId: text("shopify_inventory_item_id"),
  shopifySyncedAt: timestamp("shopify_synced_at"),
  // Phase 2 of kingdom-051: alt-text discipline for sensory-different
  // and machine consumers. Migration: drizzle/0012_cards_art_description.sql.
  // Nullable; consumers fall back to ${name} ${card_number} when NULL.
  artDescription: text("art_description"),
  // Phase 6 of kingdom-051: multi-language card names for culturally
  // different consumers. Migration: drizzle/0013_cards_name_translations.sql.
  // Sparse JSONB: { "zh": "...", "ko": "...", "es": "...", "jp_romaji": "..." }.
  // Nullable; consumers fall back to name_en, then name, then card_number.
  nameTranslations: jsonb("name_translations"),
}, (table) => ({
  nameIdx: index("cards_name_idx").on(table.name),
  cardNumberIdx: index("cards_card_number_idx").on(table.cardNumber),
  gameCategoryIdx: index("cards_game_category_idx").on(table.gameId, table.category),
  setCodeIdx: index("cards_set_code_idx").on(table.setCode),
}));

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id),
  status: text("status", {
    enum: ["submitted", "quoted", "confirmed", "paid", "ordered", "shipped", "delivered", "cancelled"],
  }).notNull().default("submitted"),
  total: money("total").notNull().default(0),
  volumeDiscount: real("volume_discount").notNull().default(0),
  notes: text("notes"),
  adminNotes: text("admin_notes"),
  quotedAt: timestamp("quoted_at"),
  quotedExpiresAt: timestamp("quoted_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  clientOrderNumber: text("client_order_number"),
  stockCheckedAt: timestamp("stock_checked_at"),
  channel: text("channel").default("wholesale"),
  externalOrderId: text("external_order_id"),
}, (table) => ({
  clientIdIdx: index("orders_client_id_idx").on(table.clientId),
}));

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  cardId: integer("card_id").notNull().references(() => cards.id),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: money("unit_price").notNull(),
  originalUnitPrice: money("original_unit_price"),
  lineTotal: money("line_total").notNull(),
  stockStatus: text("stock_status", {
    enum: ["pending", "in_stock", "out_of_stock", "price_changed", "partial"],
  }).notNull().default("pending"),
  checkedPriceJpy: integer("checked_price_jpy"),
  checkedQuantity: integer("checked_quantity"),
  remamboSubmittedAt: timestamp("remambo_submitted_at"),
  removedAt: timestamp("removed_at"),
}, (table) => ({
  orderIdIdx: index("order_items_order_id_idx").on(table.orderId),
}));

// `priceHistory` was dropped in Phase 4 of kingdom-049 (migration
// drizzle/0011_drop_price_history.sql). It was a strict subset of
// `priceArchive` shape-wise — same key (card_id + date), JPY inputs only.
// `priceArchive` is now the single canonical price-history source.
// See docs/connections/the-pricing-arrow.md (S17) Act 4.

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  type: text("type", {
    enum: ["quote_ready", "confirmed", "shipped", "delivered", "new_order"],
  }).notNull(),
  recipient: text("recipient").notNull(),
  status: text("status", { enum: ["sent", "failed"] }).notNull(),
  error: text("error"),
  sentAt: timestamp("sent_at").defaultNow(),
});

export const priceArchive = pgTable("price_archive", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id").notNull().references(() => cards.id),
  snapshotDate: date("snapshot_date").notNull(),
  sku: text("sku").notNull(),
  setCode: text("set_code"),
  category: text("category", { enum: ["singles", "sealed"] }).notNull().default("singles"),
  cardrushJpy: integer("cardrush_jpy").notNull(),
  gbpJpyRate: real("gbp_jpy_rate").notNull(),
  baseGbp: money("base_gbp").notNull(),
  price: money("price").notNull(),
  // ── Provenance columns added by drizzle/0014_price_archive_provenance.sql ──
  // (kingdom-066; see docs/connections/the-cardrush-alignment.md). All
  // additive with defaults so legacy rows stay valid; v1 snapshot still
  // works writing rows with default source='cardrush'.
  source: text("source").notNull().default("cardrush"),
  sourceUrl: text("source_url"),
  ingestRunId: bigint("ingest_run_id", { mode: "number" }),
  errorReason: text("error_reason"),
  sourceCurrency: text("source_currency").notNull().default("JPY"),
  sourceRedistribute: boolean("source_redistribute").notNull().default(false),
}, (table) => ({
  // Widened unique index includes source so multi-source rows for the same
  // (card, date) can coexist (TCGplayer USD + Cardmarket EUR + CardRush JPY
  // for the same card on the same day are now distinguishable).
  cardDateSourceUnique: uniqueIndex("price_archive_card_date_source_idx")
    .on(table.cardId, table.snapshotDate, table.source),
  dateIdx: index("price_archive_date_idx").on(table.snapshotDate),
  skuIdx: index("price_archive_sku_idx").on(table.sku),
}));

// ── ingestRun ────────────────────────────────────────────────────────
//
// Stage 7 of the pipeline (the-pipeline.md §9). Every ingest job emits
// one row here at start, updates at finish. Lets an operator answer
// "did snapshot run today?" without grepping logs.
//
// kingdom-066. Migration: drizzle/0014_price_archive_provenance.sql.
export const ingestRun = pgTable("ingest_run", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sourceId: text("source_id").notNull(),
  specVersion: text("spec_version").notNull(),
  triggeredBy: text("triggered_by").notNull(),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"),
  rowsRead: integer("rows_read").notNull().default(0),
  rowsNormalized: integer("rows_normalized").notNull().default(0),
  rowsWritten: integer("rows_written").notNull().default(0),
  rowsQuarantined: integer("rows_quarantined").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  events: jsonb("events"),
  notes: text("notes"),
}, (table) => ({
  sourceRecentIdx: index("ingest_run_source_recent_idx")
    .on(table.sourceId, table.triggeredAt),
  statusIdx: index("ingest_run_status_idx")
    .on(table.status, table.triggeredAt),
}));

export type IngestRunRow = typeof ingestRun.$inferSelect;
export type NewIngestRunRow = typeof ingestRun.$inferInsert;

// ── ingestQuarantine ─────────────────────────────────────────────────
//
// Stage 4 of the pipeline (the-pipeline.md §6). Failed normalizations
// land here with the raw upstream payload preserved for replay/forensics.
// Admin review surface (planned) lets operators reprocess / discard /
// flag upstream-bugs.
//
// kingdom-066.
export const ingestQuarantine = pgTable("ingest_quarantine", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ingestRunId: bigint("ingest_run_id", { mode: "number" })
    .notNull()
    .references(() => ingestRun.id),
  sourceId: text("source_id").notNull(),
  upstreamId: text("upstream_id"),
  rawPayload: jsonb("raw_payload").notNull(),
  reason: text("reason").notNull(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  quarantinedAt: timestamp("quarantined_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
  resolution: text("resolution"),
}, (table) => ({
  unresolvedIdx: index("ingest_quarantine_unresolved_idx")
    .on(table.sourceId, table.quarantinedAt),
  runIdx: index("ingest_quarantine_run_idx").on(table.ingestRunId),
}));

export type IngestQuarantineRow = typeof ingestQuarantine.$inferSelect;
export type NewIngestQuarantineRow = typeof ingestQuarantine.$inferInsert;

export const orderStatusHistory = pgTable("order_status_history", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  changedBy: integer("changed_by").references(() => clients.id),
  changedAt: timestamp("changed_at").defaultNow(),
  note: text("note"),
  itemsSnapshot: jsonb("items_snapshot"),
}, (table) => ({
  orderIdx: index("order_status_history_order_idx").on(table.orderId),
}));

export const conditionPrices = pgTable("condition_prices", {
  id: serial("id").primaryKey(),
  cardNumber: text("card_number").notNull(),
  name: text("name").notNull(),
  setCode: text("set_code"),
  rarity: text("rarity"),
  condition: text("condition").notNull(),
  priceJpy: integer("price_jpy").notNull(),
  stock: integer("stock").notNull().default(0),
  cardrushUrl: text("cardrush_url"),
  imageUrl: text("image_url"),
  snapshotDate: date("snapshot_date").notNull(),
  discountPct: real("discount_pct"),
}, (table) => ({
  cardCondDateUnique: uniqueIndex("condition_prices_card_cond_date_idx")
    .on(table.cardNumber, table.name, table.condition, table.snapshotDate),
  dateIdx: index("condition_prices_date_idx").on(table.snapshotDate),
}));

export const fulfillmentEntries = pgTable("fulfillment_entries", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  orderItemId: integer("order_item_id").notNull().references(() => orderItems.id),
  fulfilledQty: integer("fulfilled_qty").notNull(),
  fulfillmentDate: date("fulfillment_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  itemDateUnique: uniqueIndex("fulfillment_entries_item_date_idx").on(table.orderItemId, table.fulfillmentDate),
}));

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  remamboOrderId: text("remambo_order_id").notNull(),
  supplier: text("supplier").notNull().default("cardrush"),
  parcelId: text("parcel_id"),
  orderedAt: timestamp("ordered_at").notNull(),
  shippedAt: timestamp("shipped_at"),
  receivedAt: timestamp("received_at"),
  status: text("status", {
    enum: ["ordered", "shipped", "received"],
  }).notNull().default("ordered"),
  itemsTotalJpy: integer("items_total_jpy").notNull(),
  serviceFeeJpy: integer("service_fee_jpy").notNull().default(0),
  shippingJpy: integer("shipping_jpy").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  remamboOrderIdx: uniqueIndex("purchases_remambo_order_idx").on(table.remamboOrderId),
}));

export const purchaseItems = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id").notNull().references(() => purchases.id),
  cardId: integer("card_id").notNull().references(() => cards.id),
  orderItemId: integer("order_item_id").references(() => orderItems.id),
  condition: text("condition").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceJpy: integer("unit_price_jpy").notNull(),
  cardrushUrl: text("cardrush_url"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  purchaseIdx: index("purchase_items_purchase_idx").on(table.purchaseId),
  cardIdx: index("purchase_items_card_idx").on(table.cardId),
}));

export const cartItems = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id),
  cardId: integer("card_id").notNull().references(() => cards.id),
  quantity: integer("quantity").notNull().default(1),
  cardNumber: text("card_number").notNull(),
  sku: text("sku").notNull(),
  cardName: text("card_name").notNull().default(""),
  setCode: text("set_code"),
  setName: text("set_name"),
  price: money("price").notNull(),
  addedAt: timestamp("added_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  clientCardUnique: uniqueIndex("cart_items_client_card_idx").on(table.clientId, table.cardId),
}));

export type CartItemRow = typeof cartItems.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Game = typeof games.$inferSelect;
export type GameSet = typeof sets.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
// PriceHistory type removed in Phase 4 of kingdom-049 — see comment above
// where priceHistory used to be declared, and migration 0011.
export type PriceArchiveRow = typeof priceArchive.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type OrderStatusHistoryRow = typeof orderStatusHistory.$inferSelect;
export type ConditionPriceRow = typeof conditionPrices.$inferSelect;
export type FulfillmentEntryRow = typeof fulfillmentEntries.$inferSelect;
export const wantedCards = pgTable("wanted_cards", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id),
  cardId: integer("card_id").notNull().references(() => cards.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  clientCardUnique: uniqueIndex("wanted_cards_client_card_idx").on(table.clientId, table.cardId),
}));

export const stockTargets = pgTable("stock_targets", {
  id: serial("id").primaryKey(),
  priceMin: money("price_min").notNull(),
  priceMax: money("price_max").notNull(),
  targetQty: integer("target_qty").notNull(),
});

export const stockAdjustments = pgTable("stock_adjustments", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id").notNull().references(() => cards.id),
  delta: integer("delta").notNull(),
  reason: text("reason", {
    enum: ["count", "damage", "loss", "found", "correction", "other"],
  }).notNull().default("correction"),
  note: text("note"),
  channel: text("channel").default("manual"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  cardIdx: index("stock_adjustments_card_idx").on(table.cardId),
}));

export const channelApiKeys = pgTable("channel_api_keys", {
  id: serial("id").primaryKey(),
  channel: text("channel").notNull(),
  keyHash: text("key_hash").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

export const channelPricing = pgTable("channel_pricing", {
  id: serial("id").primaryKey(),
  channel: text("channel").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  marginMultiplier: customType<{ data: number; driverData: string }>({
    dataType() { return "numeric(6, 4)"; },
    fromDriver(value: string): number { return Number(value); },
  })("margin_multiplier").default(1.08),
  flatFeeSingles: customType<{ data: number; driverData: string }>({
    dataType() { return "numeric(8, 2)"; },
    fromDriver(value: string): number { return Number(value); },
  })("flat_fee_singles").default(0.22),
  flatFeeSealed: customType<{ data: number; driverData: string }>({
    dataType() { return "numeric(8, 2)"; },
    fromDriver(value: string): number { return Number(value); },
  })("flat_fee_sealed").default(2.20),
  vatMultiplier: customType<{ data: number; driverData: string }>({
    dataType() { return "numeric(5, 4)"; },
    fromDriver(value: string): number { return Number(value); },
  })("vat_multiplier").default(1.20),
  retailMultiplier: customType<{ data: number; driverData: string }>({
    dataType() { return "numeric(5, 4)"; },
    fromDriver(value: string): number { return Number(value); },
  })("retail_multiplier").default(1.00),
  roundTo: customType<{ data: number; driverData: string }>({
    dataType() { return "numeric(4, 2)"; },
    fromDriver(value: string): number { return Number(value); },
  })("round_to").default(0.01),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type Purchase = typeof purchases.$inferSelect;
export type PurchaseItem = typeof purchaseItems.$inferSelect;
export type WantedCard = typeof wantedCards.$inferSelect;
export type StockTarget = typeof stockTargets.$inferSelect;
export type StockAdjustment = typeof stockAdjustments.$inferSelect;
export type ChannelApiKey = typeof channelApiKeys.$inferSelect;
export type ChannelPricingRow = typeof channelPricing.$inferSelect;

// Append-only audit log for cards.price / cards.baseGbp mutations.
// See docs/connections/the-pricing-arrow.md (S17) — this is the log the
// Archive (priceArchive) was missing. Joins the Scribe's bookshelf (S8).
// Migration: drizzle/0009_card_price_change_log.sql.
export const cardPriceChangeLog = pgTable("card_price_change_log", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  source: text("source"),
  actorLabel: text("actor_label"),
  beforeValue: jsonb("before_value"),
  afterValue: jsonb("after_value"),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  subjectIdx: index("idx_card_price_log_subject").on(table.cardId, table.createdAt),
  actionIdx: index("idx_card_price_log_action").on(table.action, table.createdAt),
  recentIdx: index("idx_card_price_log_recent").on(table.createdAt),
}));

export type CardPriceChangeLogRow = typeof cardPriceChangeLog.$inferSelect;

// ── @cambridge-tcg/stock package tables ──────────────────────────────
// Re-exported so drizzle-kit picks them up when generating migrations
// for the wholesale DB. The stockTargets table from the package is NOT
// re-exported here — wholesale's existing stockTargets (defined above
// since migration 0004) is the canonical one and stays.
export { stockMovements, stockReservations } from "@cambridge-tcg/stock";
