CREATE TABLE IF NOT EXISTS "cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"card_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"card_number" text NOT NULL,
	"sku" text NOT NULL,
	"card_name" text DEFAULT '' NOT NULL,
	"set_code" text,
	"set_name" text,
	"price_ex_vat" numeric(10, 2) NOT NULL,
	"added_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "condition_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_number" text NOT NULL,
	"name" text NOT NULL,
	"set_code" text,
	"rarity" text,
	"condition" text NOT NULL,
	"price_jpy" integer NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"cardrush_url" text,
	"image_url" text,
	"snapshot_date" date NOT NULL,
	"discount_pct" real
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fulfillment_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"order_item_id" integer NOT NULL,
	"fulfilled_qty" integer NOT NULL,
	"fulfillment_date" date NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"card_id" integer NOT NULL,
	"order_item_id" integer,
	"condition" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_jpy" integer NOT NULL,
	"cardrush_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"remambo_order_id" text NOT NULL,
	"supplier" text DEFAULT 'cardrush' NOT NULL,
	"parcel_id" text,
	"ordered_at" timestamp NOT NULL,
	"shipped_at" timestamp,
	"received_at" timestamp,
	"status" text DEFAULT 'ordered' NOT NULL,
	"items_total_jpy" integer NOT NULL,
	"service_fee_jpy" integer DEFAULT 0 NOT NULL,
	"shipping_jpy" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "checked_quantity" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "remambo_submitted_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fulfillment_entries" ADD CONSTRAINT "fulfillment_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fulfillment_entries" ADD CONSTRAINT "fulfillment_entries_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cart_items_client_card_idx" ON "cart_items" USING btree ("client_id","card_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "condition_prices_card_cond_date_idx" ON "condition_prices" USING btree ("card_number","name","condition","snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "condition_prices_date_idx" ON "condition_prices" USING btree ("snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fulfillment_entries_item_date_idx" ON "fulfillment_entries" USING btree ("order_item_id","fulfillment_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_items_purchase_idx" ON "purchase_items" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_items_card_idx" ON "purchase_items" USING btree ("card_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchases_remambo_order_idx" ON "purchases" USING btree ("remambo_order_id");