-- Migration: per-item commission cap (the fairness fix)
-- 2026-06-04
--
-- Yu's mandate: "Minimum fees, maximum value. We don't charge unfairly; we
-- price according to the value we provide vs other service providers."
--
-- Before this, Cambridge charged an uncapped PERCENTAGE commission on
-- marketplace/trade/auction sales. Every incumbent caps the absolute fee
-- (TCGplayer $75/item, Cardmarket €100/article, Whatnot tapers). On a
-- four-figure card an uncapped 8% takes MORE than any incumbent — the one
-- place the platform charged unfairly. This migration adds the runtime-
-- authoritative cap column so operators can tune it without a code deploy,
-- the same override pattern every other pricing constant uses.
--
-- Seed truth lives in `packages/pricing/src/index.ts`
-- (`DEFAULT_COMMISSION_CAP_GBP = 50`); this column mirrors it at the moment
-- of seeding. The cap is a P2P/auction *commission* cap, in GBP, applied
-- after the trust/membership discount: commission = min(rate × sale, cap).
--
-- £50 sits at or below every named incumbent cap (TCGplayer ≈ £59,
-- Cardmarket ≈ £85) and equals the pre-2026 TCGplayer cap the market
-- accepted as fair for years. Documented at /methodology/fees.
--
-- Idempotent — ADD COLUMN IF NOT EXISTS + UPDATE only the seed default.

ALTER TABLE "channel_pricing"
  ADD COLUMN IF NOT EXISTS "p2p_commission_cap_gbp" numeric(8, 2) DEFAULT 50.00;

-- Backfill any pre-existing rows that were created before this column.
UPDATE "channel_pricing"
   SET "p2p_commission_cap_gbp" = 50.00
 WHERE "p2p_commission_cap_gbp" IS NULL;
