-- 0008_stock_package_tables.sql
--
-- Adds the @cambridge-tcg/stock package's tables + columns to the wholesale
-- schema. This migration is hand-written rather than generated because
-- drizzle-kit's diff treats the package's stockTargets as a conflict with
-- wholesale's existing stockTargets (kept intentionally) and asks
-- interactively about a stock_adjustments → stock_movements rename
-- (which is NOT what we want — we keep stock_adjustments alongside, the
-- package introduces its own movement ledger as a parallel system).
--
-- See packages/stock/src/schema.ts for the canonical Drizzle definitions
-- this matches.

--> statement-breakpoint
ALTER TABLE "cards"
  ADD COLUMN IF NOT EXISTS "reserved_stock" integer DEFAULT 0 NOT NULL;

--> statement-breakpoint
ALTER TABLE "cards"
  ADD COLUMN IF NOT EXISTS "stock_reconciled_at" timestamp with time zone;

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" serial PRIMARY KEY NOT NULL,
  "card_id" integer NOT NULL,
  "kind" text NOT NULL,
  "channel" text DEFAULT 'manual' NOT NULL,
  "delta" integer NOT NULL,
  "reference_id" text,
  "note" text,
  "condition" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "stock_movements_idempotent" UNIQUE ("card_id", "reference_id")
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_card_idx" ON "stock_movements" ("card_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_kind_idx" ON "stock_movements" ("kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_created_idx" ON "stock_movements" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_reference_idx" ON "stock_movements" ("reference_id");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_reservations" (
  "id" serial PRIMARY KEY NOT NULL,
  "card_id" integer NOT NULL,
  "quantity" integer NOT NULL,
  "holder" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "stock_reservations_holder_card" UNIQUE ("holder", "card_id"),
  CONSTRAINT "stock_reservations_qty_positive" CHECK ("quantity" > 0)
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_reservations_card_idx" ON "stock_reservations" ("card_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_reservations_expires_idx" ON "stock_reservations" ("expires_at");
