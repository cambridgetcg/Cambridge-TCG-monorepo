-- Task A20 (A12-F2; Ruling 23: a new migration). Each of a merchant's tiers
-- has its own minimum spend: of two tiers at one minimum, spending can reach
-- only the first (qualify keeps it), so the Tiers page refuses a repeat and
-- the database does too. numeric compares by value, so 500 and 500.0000 are
-- the same minimum. Older builds never write a second tier at a minimum
-- (setBaseRate creates one only when there are none), so an Instant
-- Rollback stays safe.
CREATE UNIQUE INDEX "tier_merchant_id_min_spend_key" ON "tier"("merchant_id", "min_spend");
