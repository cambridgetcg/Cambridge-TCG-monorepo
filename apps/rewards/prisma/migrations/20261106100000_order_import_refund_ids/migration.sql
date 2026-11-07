-- Milestone 2 review, part d (Ruling 54; Ruling 23: a new migration). The
-- ids of the refunds an import order's bulk file listed: the file's
-- quantities already count them, so recording one later (its webhook or the
-- hourly sweep) adds its row and no spend. Defaulted, so older builds simply
-- ignore it and an Instant Rollback stays safe.
ALTER TABLE "orders" ADD COLUMN "import_refund_ids" TEXT[] NOT NULL DEFAULT '{}';
