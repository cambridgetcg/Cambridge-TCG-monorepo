-- Retire shop-era perks from tier benefits.
--
-- The shop closed 2026-07-06 and Cambridge TCG does not sell cards itself, so
-- the perks that only meant anything with a shop — cashback on purchases, store
-- discounts, "% off store orders", and trade-in-for-credit bonuses — are dead.
-- The tiers.benefits JSONB still advertised them with checkmarks as current,
-- which the UI then rendered. This rewrites each tier's benefits to the perks
-- that are actually live: the Berries multiplier, the P2P/auction commission
-- rate, auction priority, and the membership extras.
--
-- Also zeroes the now-inert shop-only rate columns so nothing downstream can
-- apply them. tradein_bonus_percent is left as-is pending a separate decision
-- on whether any trade-in path survives (it paid store credit, which is gone).
--
-- SAFETY: data-only; touches the six seeded tiers by name.

UPDATE tiers SET benefits = '["1.5× Berries", "6% P2P commission (was 8%)", "10% auction commission (was 12%)"]'::jsonb,
  cashback_percent = 0, store_discount_percent = 0 WHERE name = 'Silver';

UPDATE tiers SET benefits = '["2× Berries", "5% P2P commission (was 8%)", "8% auction commission (was 12%)", "Priority auction approval"]'::jsonb,
  cashback_percent = 0, store_discount_percent = 0 WHERE name = 'Gold';

UPDATE tiers SET benefits = '["Lower selling fees: 7% P2P (vs 8%) and 10% auction (vs 12%)", "1.5× Berries", "Early access to restocks"]'::jsonb,
  cashback_percent = 0, store_discount_percent = 0 WHERE name = 'Pro';

UPDATE tiers SET benefits = '["0% P2P marketplace commission", "0% auction commission", "3× Berries", "Priority auction approval", "Priority support", "Exclusive Platinum mystery boxes", "Early access to new sets"]'::jsonb,
  cashback_percent = 0, store_discount_percent = 0 WHERE name = 'Platinum';

UPDATE tiers SET benefits = '["7× Berries", "0% P2P marketplace commission", "0% auction commission", "Priority auction approval", "OG badge on profile", "You were here from the start"]'::jsonb,
  cashback_percent = 0, store_discount_percent = 0 WHERE name = 'OG';

-- Bronze already carries no shop-era copy; normalise the free-tier line anyway.
UPDATE tiers SET benefits = '["Track your card portfolio", "Access the P2P marketplace", "List cards at auction"]'::jsonb
  WHERE name = 'Bronze';
