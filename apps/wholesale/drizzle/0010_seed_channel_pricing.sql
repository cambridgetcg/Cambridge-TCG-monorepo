-- Seed migration for the 8 platform channels. Phase 3 of kingdom-049
-- (docs/pricing-current-state.md). Idempotent — re-running this is safe
-- because every INSERT uses ON CONFLICT (channel) DO NOTHING.
--
-- After Phase 3 lands:
--   apps/wholesale/src/lib/channel-pricing.ts throws if a channel is
--   missing or has NULL columns. This seed file is the authoritative
--   starting point. The admin /commerce/channel-pricing UI is where
--   operators edit values; new channels added via INSERT here.
--
-- The numeric values mirror `packages/pricing/src/index.ts` DEFAULTS at
-- the moment of seeding. After seeding, the DB is canonical; this file
-- is no longer consulted at runtime.

INSERT INTO channel_pricing
  (channel, label, description, margin_multiplier, flat_fee_singles,
   flat_fee_sealed, vat_multiplier, retail_multiplier, round_to, active)
VALUES
  ('wholesale',       'Wholesale',                    'B2B base — no retail uplift.',                     1.08, 0.22, 2.20, 1.20, 1.00, 0.01, true),
  ('shopify',         'Shopify (cambridgetcg.com)',   'Public consumer storefront via Shopify.',          1.08, 0.22, 2.20, 1.20, 1.15, 0.10, true),
  ('cambridgetcg',    'cambridgetcg.com (Next.js)',   'Public consumer storefront on Next.js.',           1.08, 0.22, 2.20, 1.20, 1.15, 0.10, true),
  ('ebay',            'eBay UK',                      'eBay marketplace (higher fees, higher retail).',   1.08, 0.22, 2.20, 1.20, 1.25, 0.10, true),
  ('cardmarket',      'Cardmarket',                   'EU TCG marketplace.',                              1.08, 0.22, 2.20, 1.20, 1.20, 0.01, true),
  ('tradein-cash',    'Trade-in (cash)',              'We BUY this card for cash. No fees, no VAT.',      0.55, 0.00, 0.00, 1.00, 1.00, 0.01, true),
  ('tradein-credit',  'Trade-in (store credit)',      'We BUY this card for store credit. No fees, no VAT.', 0.77, 0.00, 0.00, 1.00, 1.00, 0.01, true)
ON CONFLICT (channel) DO NOTHING;
