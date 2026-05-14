-- Migration 0019 — channel_api_keys data hygiene (companion to 0017+0018).
--
-- Two corrections to the seeded storefront key:
--
-- 1. CHANNEL RENAME. The historical seed at apps/wholesale/tools/gen-api-key.ts
--    inserted channel='cambridgetcg-storefront' — a label-shaped channel name
--    that does NOT correspond to any pricing channel in @cambridge-tcg/pricing
--    DEFAULTS (which knows: shopify, cambridgetcg, ebay, cardmarket,
--    tradein-credit, tradein-cash, wholesale). The storefront's wholesale
--    client (apps/storefront/src/lib/wholesale/client.ts:180) calls
--    `fetchCard(sku, 'cambridgetcg')` — i.e. asks for pricing computed under
--    the 'cambridgetcg' formula. Before fix #2 (channel hard-enforce), the
--    ?channel=cambridgetcg query overrode the key's channel and produced
--    correct retail prices. After fix #2, the key's channel is authoritative
--    and 'cambridgetcg-storefront' would route to whatever channel_pricing
--    row that name has (none, today) — so priceForChannel() would fall back
--    to DEFAULTS, which is wholesale-flavoured. Renaming the key's channel
--    to the canonical 'cambridgetcg' restores the pre-fix-#2 behaviour.
--
-- 2. RPM BUMP. The storefront does many wholesale API calls per page render
--    (SSR fetch fan-out across catalog cards, currency conversion, etc.).
--    The default 60 rpm from migration 0018 would 429 the storefront under
--    real traffic. 600 rpm = 10 rps gives the storefront headroom equal to
--    its expected fan-out.
--
-- Both writes are idempotent and scoped to the label string. If the seeded
-- key was never created in this environment (fresh dev DB), the UPDATE is
-- a no-op — no error, no row created.
--
-- Apply ORDER matters: 0017 (revoked_at) + 0018 (requests_per_minute) must
-- be applied before this migration runs, since this UPDATE writes to
-- requests_per_minute.

UPDATE channel_api_keys
   SET channel = 'cambridgetcg',
       requests_per_minute = 600
 WHERE channel = 'cambridgetcg-storefront'
   AND revoked_at IS NULL;

-- Diagnostic — uncomment to verify after apply:
--
-- SELECT id, channel, label, requests_per_minute, revoked_at, last_used_at
--   FROM channel_api_keys
--  WHERE label ILIKE '%storefront%';
