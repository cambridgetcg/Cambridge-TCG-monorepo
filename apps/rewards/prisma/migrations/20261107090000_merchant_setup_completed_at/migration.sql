-- Milestone 3 review, part d (Ruling 60; Ruling 23: a new migration). When
-- the merchant first had all three setup steps done on Home: a base rate,
-- cashback switched on and the widget embed on. Spec 4.3 shows the setup
-- card "only until setup is done", so once this is set a later pause or an
-- embed turned off no longer brings the card back: the Running checks and
-- the widget banner say those. Nullable, so older builds simply ignore it
-- and an Instant Rollback stays safe.
ALTER TABLE "merchant" ADD COLUMN "setup_completed_at" TIMESTAMP(3);
