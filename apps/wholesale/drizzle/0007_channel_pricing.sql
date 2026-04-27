-- Migration: channel_pricing table + price_archive channel column
-- 2026-03-26

CREATE TABLE IF NOT EXISTS "channel_pricing" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text UNIQUE NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"margin_multiplier" numeric(6, 4) DEFAULT 1.08,
	"flat_fee_singles" numeric(8, 2) DEFAULT 0.22,
	"flat_fee_sealed" numeric(8, 2) DEFAULT 2.20,
	"vat_multiplier" numeric(5, 4) DEFAULT 1.20,
	"retail_multiplier" numeric(5, 4) DEFAULT 1.00,
	"round_to" numeric(4, 2) DEFAULT 0.01,
	"active" boolean DEFAULT true,
	"created_at" timestamptz DEFAULT now(),
	"updated_at" timestamptz DEFAULT now()
);

-- Seed channel configs
INSERT INTO "channel_pricing" ("channel", "label", "description", "margin_multiplier", "flat_fee_singles", "flat_fee_sealed", "vat_multiplier", "retail_multiplier", "round_to")
VALUES
	('wholesale', 'Wholesale', 'B2B wholesale pricing for trade clients', 1.08, 0.22, 2.20, 1.20, 1.00, 0.01),
	('shopify', 'Shopify', 'cambridgetcg.myshopify.com storefront', 1.08, 0.22, 2.20, 1.20, 1.15, 0.10),
	('cambridgetcg', 'CambridgeTCG.com', 'cambridgetcg.com retail website', 1.08, 0.22, 2.20, 1.20, 1.15, 0.10),
	('tradein-cash', 'Trade-in (Cash)', 'Cash buy price offered for trade-ins', 0.55, 0.00, 0.00, 1.00, 1.00, 0.01),
	('tradein-credit', 'Trade-in (Credit)', 'Store credit buy price for trade-ins', 0.77, 0.00, 0.00, 1.00, 1.00, 0.01),
	('ebay', 'eBay', 'eBay marketplace listings', 1.08, 0.22, 2.20, 1.20, 1.25, 0.10),
	('cardmarket', 'Cardmarket', 'Cardmarket EU marketplace', 1.08, 0.22, 2.20, 1.20, 1.20, 0.01)
ON CONFLICT ("channel") DO NOTHING;

-- Add channel column to price_archive
ALTER TABLE "price_archive" ADD COLUMN IF NOT EXISTS "channel" text NOT NULL DEFAULT 'wholesale';
