-- Add email marketing consent and suppression fields to Customer
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "acceptsMarketing" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "emailSuppressed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "suppressedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "suppressionReason" VARCHAR(255);

-- Create PendingAutomation table for delayed automation executions
CREATE TABLE IF NOT EXISTS "PendingAutomation" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "automationName" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "recipientEmail" VARCHAR(255) NOT NULL,
    "recipientFirstName" VARCHAR(255),
    "recipientLastName" VARCHAR(255),
    "triggerType" TEXT NOT NULL,
    "triggerData" JSONB,
    "executeAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "PendingAutomation_pkey" PRIMARY KEY ("id")
);

-- Indexes for PendingAutomation
CREATE INDEX IF NOT EXISTS "PendingAutomation_status_executeAt_idx" ON "PendingAutomation"("status", "executeAt");
CREATE INDEX IF NOT EXISTS "PendingAutomation_shop_idx" ON "PendingAutomation"("shop");
