-- Migration: stock_adjustments table + nameEn column
-- 2026-03-22

ALTER TABLE "cards" ADD COLUMN "name_en" text;

CREATE TABLE "stock_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL REFERENCES "cards"("id"),
	"delta" integer NOT NULL,
	"reason" text DEFAULT 'correction' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now()
);

CREATE INDEX "stock_adjustments_card_idx" ON "stock_adjustments" ("card_id");
