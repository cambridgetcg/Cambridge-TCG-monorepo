-- RewardsPro's first schema (design section 6.2).
--
-- Generated from prisma/schema.prisma with
--   prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- plus the append-only trigger at the end, written by hand.
--
-- Object names are unqualified: they are created in the schema named by the
-- connection URL (?schema=rewards). The generated
-- CREATE SCHEMA IF NOT EXISTS "public" line is removed because rewards_app
-- has no CREATE on the database and schema rewards is provisioned already.

-- CreateEnum
CREATE TYPE "tier_window" AS ENUM ('rolling_12_months', 'lifetime');

-- CreateEnum
CREATE TYPE "platform" AS ENUM ('shopify');

-- CreateEnum
CREATE TYPE "connection_status" AS ENUM ('active', 'uninstalled');

-- CreateEnum
CREATE TYPE "import_state" AS ENUM ('not_started', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "order_source" AS ENUM ('live', 'import');

-- CreateEnum
CREATE TYPE "no_cashback_reason" AS ENUM ('import', 'before_install', 'test', 'cancelled', 'off', 'no_tier', 'nothing_to_pay_on');

-- CreateEnum
CREATE TYPE "ledger_entry_kind" AS ENUM ('cashback', 'reversal', 'adjustment');

-- CreateEnum
CREATE TYPE "payout_rail" AS ENUM ('shopify_store_credit');

-- CreateEnum
CREATE TYPE "payout_direction" AS ENUM ('credit', 'debit');

-- CreateEnum
CREATE TYPE "payout_state" AS ENUM ('pending', 'held', 'sending', 'sent', 'unconfirmed', 'needs_look', 'closed', 'nothing_to_send');

-- CreateEnum
CREATE TYPE "look_reason" AS ENUM ('refused', 'kept_failing', 'could_not_confirm');

-- CreateEnum
CREATE TYPE "settled_by" AS ENUM ('auto', 'merchant');

-- CreateEnum
CREATE TYPE "privacy_request_status" AS ENUM ('open', 'downloaded', 'expired');

-- CreateTable
CREATE TABLE "merchant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "running" BOOLEAN NOT NULL DEFAULT false,
    "tier_window" "tier_window" NOT NULL DEFAULT 'rolling_12_months',
    "notify_buyers" BOOLEAN NOT NULL DEFAULT false,
    "review_prompt_dismissed_at" TIMESTAMP(3),
    "review_prompt_shown_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "platform" "platform" NOT NULL,
    "external_account_id" TEXT NOT NULL,
    "status" "connection_status" NOT NULL,
    "installed_at" TIMESTAMP(3) NOT NULL,
    "uninstalled_at" TIMESTAMP(3),
    "import_state" "import_state" NOT NULL DEFAULT 'not_started',
    "import_operation_id" TEXT,
    "import_cursor" INTEGER NOT NULL DEFAULT 0,
    "import_horizon_days" INTEGER NOT NULL DEFAULT 365,
    "import_attempts" INTEGER NOT NULL DEFAULT 0,
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "import_error" TEXT,
    "last_tier_pass_at" TIMESTAMP(3),
    "tier_pass_requested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "external_customer_id" TEXT,
    "tier_id" UUID,
    "tier_since" TIMESTAMP(3),
    "locked_tier_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "redacted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tier" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "min_spend" DECIMAL(19,4) NOT NULL,
    "cashback_percent" DECIMAL(5,2) NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "external_order_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "order_source" NOT NULL,
    "currency" TEXT NOT NULL,
    "total_amount" DECIMAL(19,4) NOT NULL,
    "product_amount" DECIMAL(19,4) NOT NULL,
    "shop_product_amount" DECIMAL(19,4) NOT NULL,
    "store_credit_used" DECIMAL(19,4) NOT NULL,
    "shop_store_credit_used" DECIMAL(19,4) NOT NULL,
    "gift_card_used" DECIMAL(19,4) NOT NULL,
    "cashback_base" DECIMAL(19,4) NOT NULL,
    "refunded_product_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "shop_refunded_product_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "ordered_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "test" BOOLEAN NOT NULL,
    "no_cashback_reason" "no_cashback_reason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "external_refund_id" TEXT NOT NULL,
    "product_amount" DECIMAL(19,4) NOT NULL,
    "shop_product_amount" DECIMAL(19,4) NOT NULL,
    "refunded_at" TIMESTAMP(3) NOT NULL,
    "applied_before_cashback" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_id" UUID,
    "refund_id" UUID,
    "kind" "ledger_entry_kind" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "shop_amount" DECIMAL(19,4) NOT NULL,
    "tier_name" TEXT,
    "rate_percent" DECIMAL(5,2),
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "ledger_entry_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "rail" "payout_rail" NOT NULL,
    "direction" "payout_direction" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "state" "payout_state" NOT NULL,
    "look_reason" "look_reason",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL,
    "first_failed_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "unconfirmed_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "external_transaction_id" TEXT,
    "debited_amount" DECIMAL(19,4),
    "shortfall" DECIMAL(19,4),
    "last_error" TEXT,
    "settled_by" "settled_by",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_request" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "external_customer_id" TEXT,
    "shopify_request_id" TEXT,
    "orders_requested" TEXT[],
    "status" "privacy_request_status" NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "downloaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "privacy_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cron_lock" (
    "id" UUID NOT NULL,
    "job_name" TEXT NOT NULL,
    "locked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "instance_id" TEXT,

    CONSTRAINT "cron_lock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cron_run" (
    "id" UUID NOT NULL,
    "job" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "error_message" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cron_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "connection_platform_external_account_id_key" ON "connection"("platform", "external_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "connection_merchant_id_id_key" ON "connection"("merchant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_connection_id_external_customer_id_key" ON "customer"("connection_id", "external_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_merchant_id_id_key" ON "customer"("merchant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tier_merchant_id_id_key" ON "tier"("merchant_id", "id");

-- CreateIndex
CREATE INDEX "orders_customer_id_ordered_at_idx" ON "orders"("customer_id", "ordered_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_connection_id_external_order_id_key" ON "orders"("connection_id", "external_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_merchant_id_id_key" ON "orders"("merchant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "refund_connection_id_external_refund_id_key" ON "refund"("connection_id", "external_refund_id");

-- CreateIndex
CREATE UNIQUE INDEX "refund_merchant_id_id_key" ON "refund"("merchant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entry_merchant_id_idempotency_key_key" ON "ledger_entry"("merchant_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entry_merchant_id_id_key" ON "ledger_entry"("merchant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_ledger_entry_id_key" ON "payout"("ledger_entry_id");

-- CreateIndex
CREATE INDEX "payout_state_next_attempt_at_idx" ON "payout"("state", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "cron_lock_job_name_key" ON "cron_lock"("job_name");

-- CreateIndex
CREATE INDEX "cron_lock_expires_at_idx" ON "cron_lock"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "cron_run_job_outcome_key" ON "cron_run"("job", "outcome");

-- AddForeignKey
ALTER TABLE "connection" ADD CONSTRAINT "connection_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_merchant_id_connection_id_fkey" FOREIGN KEY ("merchant_id", "connection_id") REFERENCES "connection"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_merchant_id_tier_id_fkey" FOREIGN KEY ("merchant_id", "tier_id") REFERENCES "tier"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_merchant_id_locked_tier_id_fkey" FOREIGN KEY ("merchant_id", "locked_tier_id") REFERENCES "tier"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tier" ADD CONSTRAINT "tier_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_connection_id_fkey" FOREIGN KEY ("merchant_id", "connection_id") REFERENCES "connection"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_customer_id_fkey" FOREIGN KEY ("merchant_id", "customer_id") REFERENCES "customer"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_merchant_id_connection_id_fkey" FOREIGN KEY ("merchant_id", "connection_id") REFERENCES "connection"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_merchant_id_order_id_fkey" FOREIGN KEY ("merchant_id", "order_id") REFERENCES "orders"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_merchant_id_connection_id_fkey" FOREIGN KEY ("merchant_id", "connection_id") REFERENCES "connection"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_merchant_id_customer_id_fkey" FOREIGN KEY ("merchant_id", "customer_id") REFERENCES "customer"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_merchant_id_order_id_fkey" FOREIGN KEY ("merchant_id", "order_id") REFERENCES "orders"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_merchant_id_refund_id_fkey" FOREIGN KEY ("merchant_id", "refund_id") REFERENCES "refund"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout" ADD CONSTRAINT "payout_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout" ADD CONSTRAINT "payout_merchant_id_ledger_entry_id_fkey" FOREIGN KEY ("merchant_id", "ledger_entry_id") REFERENCES "ledger_entry"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout" ADD CONSTRAINT "payout_merchant_id_customer_id_fkey" FOREIGN KEY ("merchant_id", "customer_id") REFERENCES "customer"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_request" ADD CONSTRAINT "privacy_request_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_request" ADD CONSTRAINT "privacy_request_merchant_id_connection_id_fkey" FOREIGN KEY ("merchant_id", "connection_id") REFERENCES "connection"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ledger_entry is append-only: what RewardsPro issued and took back is
-- never changed or removed. The one exception is the erasure purge, which
-- runs in a transaction that has SET LOCAL rewards.erasing = 'on'.
-- (Written by hand; prisma migrate diff does not generate triggers.)
CREATE FUNCTION "ledger_entry_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF current_setting('rewards.erasing', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'ledger_entry is append-only';
END;
$$;

CREATE TRIGGER "ledger_entry_append_only"
BEFORE UPDATE OR DELETE ON "ledger_entry"
FOR EACH ROW EXECUTE FUNCTION "ledger_entry_append_only"();
