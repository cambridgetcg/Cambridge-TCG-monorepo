-- Migration: channel fields on orders + stock_adjustments, channel_api_keys table
-- 2026-03-22

ALTER TABLE "orders" ADD COLUMN "channel" text DEFAULT 'wholesale';
ALTER TABLE "orders" ADD COLUMN "external_order_id" text;

ALTER TABLE "stock_adjustments" ADD COLUMN "channel" text DEFAULT 'manual';

CREATE TABLE "channel_api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"key_hash" text NOT NULL,
	"label" text,
	"created_at" timestamp DEFAULT now(),
	"last_used_at" timestamp
);
