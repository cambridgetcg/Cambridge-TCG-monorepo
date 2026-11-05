-- Milestone 3 review, part e (Ruling 23: a new migration; nothing merged is
-- edited). Additive only: nullable columns and plain indexes, so older
-- builds ignore them and an Instant Rollback stays safe. Plain CREATE INDEX,
-- not CONCURRENTLY: Prisma runs each migration in a transaction, and the
-- schema is created empty at the switch (B2), so no live table is locked.

-- OPERATIONS-4 (with A19-F5's tail): what syncWidgetConfig last wrote to the
-- store's widget metafield, and when. The nightly step visits the stores
-- written longest ago first and skips one still holding today's value that
-- was written within a week. Null until the first write, and after a write
-- that failed.
ALTER TABLE "connection" ADD COLUMN     "widget_config_synced_at" TIMESTAMP(3),
ADD COLUMN     "widget_config_value" TEXT;

-- OPERATIONS-2 and A22 concern 1: the Customers list and its export, a
-- store's buyers newest first.
CREATE INDEX "customer_connection_id_created_at_idx" ON "customer"("connection_id", "created_at");

-- OPERATIONS-2: Home's month, 30-day and Recent rewards reads of the ledger.
CREATE INDEX "ledger_entry_merchant_id_created_at_idx" ON "ledger_entry"("merchant_id", "created_at");

-- OPERATIONS-2: Home's month and 30-day reads of paid orders.
CREATE INDEX "orders_merchant_id_paid_at_idx" ON "orders"("merchant_id", "paid_at");

-- A22-F6: the Orders list, a store's orders newest first.
CREATE INDEX "orders_connection_id_ordered_at_idx" ON "orders"("connection_id", "ordered_at");
