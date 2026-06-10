-- CreateEnum
CREATE TYPE "MarketingHubMode" AS ENUM ('UNCONFIGURED', 'INHOUSE', 'KLAVIYO');

-- AlterTable
ALTER TABLE "EmailSettings" ADD COLUMN "marketingHubMode" "MarketingHubMode" NOT NULL DEFAULT 'UNCONFIGURED';
ALTER TABLE "EmailSettings" ADD COLUMN "marketingModeSetAt" TIMESTAMP(3);
ALTER TABLE "EmailSettings" ADD COLUMN "hasSeenMarketingChoice" BOOLEAN NOT NULL DEFAULT false;
