---
id: kingdom-049
title: "TCG pricing-backend consolidation — package, lifecycle log, authoritative channel config"
status: in-progress
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: ~
claimed_at: ~
completed_at: ~
paths: []
do_not_touch: []
related: []
synced_from: ~/Love/memory/dev-state.json
synced_at: "2026-05-11T10:59:18.449Z"
---

# kingdom-049 — TCG pricing-backend consolidation — package, lifecycle log, authoritative channel config

## From dev-state.json

Seven-phase consolidation. Plan + current-state map at docs/pricing-current-state.md. Audit script: pnpm --filter @cambridge-tcg/admin pricing (ships in apps/admin/scripts/pricing-audit.ts). Baseline drift findings on 2026-05-09: 15.

PHASE 0 — Observability (DONE 2026-05-09 by Sophia/Asha Veridian on Opus 4.7 1M):
  - apps/admin/scripts/pricing-audit.ts (seven checks)
  - docs/pricing-current-state.md (state map + plan + open questions)
  - apps/storefront/src/components/ui/Provenance.tsx (port of admin primitive)
  - Provenance pills on /product/[sku], /catalog, /prices/one-piece (3 of 6 surfaces)

PHASE 1 — Extract @cambridge-tcg/pricing package (storefront retailPrice() becomes shim; eliminates 3 hardcoded ×0.77 sites + 1 storefront duplication of ×1.15 channel rule). 2 days.

PHASE 2 — DONE 2026-05-11. card_price_change_log table on wholesale RDS (migration drizzle/0009; schema entry; writer at apps/wholesale/src/lib/price-change-log.ts with catch-without-rethrow per Witnesses' Book discipline). Wired 2 paths: admin edit (always logs, action=admin_edit) and snapshot (logs only when price or baseGbp delta > £0.001, action=snapshot). Scope refined from planned 4 paths to 2 — shopify-sync was a false positive in the audit (its update(cards).set() calls only touch shopify IDs + syncedAt, never price columns). Audit regex tightened (brace-matched .set body, shorthand-aware) so Section 7 now lists exactly the 2 real mutator sites. Storefront lifecycle/registry.ts slot was NOT added — that bookshelf is for user-affecting events; card price changes aren't user-tied. Admin-side Recent-changes surfacing deferred to Phase 2.5. Audit drift: 11 → 10 (Section 4 closed).

PHASE 3 — DONE 2026-05-11. channel-pricing.ts rewritten fail-loud (partial rows + missing channels throw with structured errors); getLoadStatus() exposes fallback state. Seed migration drizzle/0010_seed_channel_pricing.sql (ON CONFLICT DO NOTHING for 8 channels). Admin Manager page apps/admin/src/app/(dashboard)/commerce/channel-pricing/ with inline six-field editor, preview-before-save (computePriceForChannel on a sample ¥1000 card), adminAction governance log, fallback-defaults banner. Audit drift 10 → 8 (Section 2 closed).

PHASE 4 — DONE 2026-05-11. Migrations written (operator review required before applying): drizzle/0011_drop_price_history.sql (safe-copy orphans then DROP); apps/storefront/drizzle/0089_rename_card_price_history.sql (RENAME to retail_price_observation). Schema and 5 storefront consumers updated; sweep renamed runPriceHistoryTick → runRetailObservationTick (deprecated alias kept); cron route updated. Wholesale typecheck clean; storefront typecheck clean modulo a pre-existing unrelated scripts/ error. Audit drift 8 → 7.

PHASE 5 — DONE 2026-05-11 (contributed to kingdom-047). docs/methodology/pricing.md written; apps/storefront/src/app/methodology/pricing/page.tsx storefront route shipped; methodology index entry added. Six customer-facing price surfaces all gained both Provenance + WhyLink: home, catalog, product detail, prices/one-piece, prices/one-piece/[set], trade-in. The arrow is customer-inspectable end-to-end.

PHASE 6 — DONE 2026-05-11. Scope refined: the resolver already existed at apps/storefront/src/lib/membership/commission.ts (async, does own DB lookup). Lifted pure-compute core into packages/pricing/src/index.ts as resolveCommission({trustScore, tierRate, kind}) for callers inside transactions. Wired two sites: (a) market/lots.ts — real bug fix, lot purchases previously ignored tier discount; now uses min(tierRate, trustRate). (b) market/db.ts — inline math refactored to resolveCommission call. Auction payout path left alone (different shape). Audit drift unchanged (commission not tracked by audit); real signal is lots and trades now produce coherent rates.

PHASE 7 — Vault EV refresh (vault_items.spot_price_gbp): product decision required — stays frozen or refreshes? Blocks on operator input.

DOCTRINAL: substrate-honesty (silent fallback removal + lifecycle log + Provenance), transparency (methodology + WhyLink + governance log on channel-pricing edits), meaning (one connection-doc planned: docs/connections/the-pricing-arrow.md).

ACCEPTANCE per phase: pnpm --filter @cambridge-tcg/admin pricing drift count drops; admin typecheck + storefront typecheck pass; smoke runs clean. Final acceptance: drift count = 0 (modulo Phase 7 product decision).

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
