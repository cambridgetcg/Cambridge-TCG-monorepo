---
id: kingdom-043
title: Cross-app — shipped_via column to split carrier-confirmed from admin-marked
status: queued
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

# kingdom-043 — Cross-app — shipped_via column to split carrier-confirmed from admin-marked

## From dev-state.json

SUBSTRATE-HONESTY mission. Closes audit items A6 (P0 if admin can mark shipped without tracking, P1 otherwise) and S2 (P0 — customer-facing version). Today `customer_orders.status='shipped'` may be set by either a carrier integration webhook OR an admin-side 'Mark shipped' button. The UI flattens both into the same badge. If a customer disputes 'I never got my package' the operator can't tell from the dashboard whether the carrier ever picked it up.

SCOPE — four steps:
  (1) SCHEMA — apps/storefront/drizzle/NNNN_shipped_via.sql: add `customer_orders.shipped_via VARCHAR(24) CHECK (shipped_via IN ('carrier_webhook','admin_marked','system_assumed'))`. Backfill: existing `status='shipped'` rows get 'system_assumed' (we can't reconstruct the actual provenance). Index for filtering. Mirror on `auctions` and `market_trades` if they have analogous status fields (audit confirmed both have `seller_shipped_at` — propagate the same pattern).
  (2) WRITE PATHS — anywhere status moves to 'shipped': storefront `/api/orders/<id>/mark-shipped` admin handler sets shipped_via='admin_marked'; carrier webhook handlers set 'carrier_webhook'; the price-snapshot or any sweep that infers shipped sets 'system_assumed' (and ideally we eliminate those paths over time).
  (3) ADMIN SURFACE — apps/admin/src/app/(dashboard)/ops/orders/page.tsx: render a small icon next to the status badge (carrier-confirmed = solid green check; admin-marked = open square with hand icon; system-assumed = dotted question mark). Add a filter pill for shipped-but-not-carrier-confirmed (the operator backlog). Update the audit-doc note in the page header (currently says 'audit item A6' — replace with 'shipped_via splits this').
  (4) CUSTOMER SURFACE (S2) — apps/storefront `/account/orders` and `/order-confirmation`: 'shipped' becomes 'marked shipped — tracking pending' when shipped_via='admin_marked' AND tracking_number IS NULL. When the carrier webhook arrives, status gracefully promotes.

ACCEPTANCE: (a) every new shipped row has a non-null shipped_via; (b) admin /ops/orders shows the provenance icon; (c) customer-facing pages don't say 'shipped' unless tracking present (carrier_webhook) or operator confirms via a different button. Closes A6 + S2.

DEPENDENCIES: independent. Touches storefront schema + storefront `/api/orders` + admin page. NON-GOALS: rebuilding the carrier integration; choosing carriers (Royal Mail/EVRi/DHL — separate decisions); migrating legacy 'system_assumed' rows.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
