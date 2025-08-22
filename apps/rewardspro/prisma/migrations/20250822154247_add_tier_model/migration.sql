-- CreateEnum
CREATE TYPE "public"."EvaluationPeriod" AS ENUM ('ANNUAL', 'LIFETIME');

-- CreateTable
CREATE TABLE "public"."Tier" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minSpend" INTEGER NOT NULL,
    "cashbackPercent" INTEGER NOT NULL,
    "evaluationPeriod" "public"."EvaluationPeriod" NOT NULL DEFAULT 'ANNUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tier_shop_idx" ON "public"."Tier"("shop");

-- CreateIndex
CREATE INDEX "Tier_cashbackPercent_idx" ON "public"."Tier"("cashbackPercent");

-- CreateIndex
CREATE UNIQUE INDEX "Tier_shop_name_key" ON "public"."Tier"("shop", "name");
