CREATE TABLE IF NOT EXISTS "cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_number" text NOT NULL,
	"sku" text NOT NULL,
	"name" text DEFAULT '',
	"set_code" text,
	"set_name" text,
	"cardrush_url" text,
	"cardrush_jpy" integer,
	"gbp_jpy_rate" real,
	"base_gbp" numeric(10, 2),
	"price_ex_vat" numeric(10, 2),
	"ebay_item_number" text,
	"last_synced_at" timestamp,
	"game_id" integer,
	"set_id" integer,
	"category" text DEFAULT 'singles' NOT NULL,
	"product_type" text,
	"rarity" text,
	"image_url" text,
	CONSTRAINT "cards_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"company" text,
	"role" text DEFAULT 'client' NOT NULL,
	"current_month_spend" numeric(10, 2) DEFAULT 0 NOT NULL,
	"prior_month_spend" numeric(10, 2) DEFAULT 0 NOT NULL,
	"volume_discount_pct" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "clients_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"image_url" text,
	"sort_order" integer DEFAULT 0,
	"active" boolean DEFAULT true,
	CONSTRAINT "games_code_unique" UNIQUE("code"),
	CONSTRAINT "games_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"type" text NOT NULL,
	"recipient" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"sent_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"card_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_ex_vat" numeric(10, 2) NOT NULL,
	"original_unit_price" numeric(10, 2),
	"line_total" numeric(10, 2) NOT NULL,
	"stock_status" text DEFAULT 'pending' NOT NULL,
	"checked_price_jpy" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"changed_by" integer,
	"changed_at" timestamp DEFAULT now(),
	"note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"total_ex_vat" numeric(10, 2) DEFAULT 0 NOT NULL,
	"volume_discount" real DEFAULT 0 NOT NULL,
	"notes" text,
	"admin_notes" text,
	"quoted_at" timestamp,
	"quoted_expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"stock_checked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_archive" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"snapshot_date" date NOT NULL,
	"sku" text NOT NULL,
	"set_code" text,
	"category" text DEFAULT 'singles' NOT NULL,
	"cardrush_jpy" integer NOT NULL,
	"gbp_jpy_rate" real NOT NULL,
	"base_gbp" numeric(10, 2) NOT NULL,
	"price_ex_vat" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"date" text NOT NULL,
	"cardrush_jpy" integer NOT NULL,
	"gbp_jpy_rate" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"release_date" text,
	"sort_order" integer DEFAULT 0,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cards" ADD CONSTRAINT "cards_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cards" ADD CONSTRAINT "cards_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_clients_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_archive" ADD CONSTRAINT "price_archive_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_history" ADD CONSTRAINT "price_history_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sets" ADD CONSTRAINT "sets_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_name_idx" ON "cards" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_card_number_idx" ON "cards" USING btree ("card_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_game_category_idx" ON "cards" USING btree ("game_id","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_set_code_idx" ON "cards" USING btree ("set_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_archive_card_date_idx" ON "price_archive" USING btree ("card_id","snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_archive_date_idx" ON "price_archive" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_archive_sku_idx" ON "price_archive" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_history_card_date_idx" ON "price_history" USING btree ("card_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sets_game_code_idx" ON "sets" USING btree ("game_id","code");