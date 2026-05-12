---
id: kingdom-025
title: TCG admin /trust/kyc + /trust/reviews
status: queued
priority: medium
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

# kingdom-025 — TCG admin /trust/kyc + /trust/reviews

## From dev-state.json

PARTIALLY SHIPPED 2026-05-10 — /trust/reviews is done; /trust/kyc remains blocked on schema decision. (a) /trust/reviews (DONE 2026-05-10): trade_reviews table exists; built three-tab Manager (flagged/appealed/hidden) via ?tab= search param. Three Server Actions (hideReview, unhideReview, resolveAppeal) wrapped in adminAction. Reviewer + reviewee deep-link to /catalog/users/[id]. Trust-score recompute happens asynchronously on next maintenance cron sweep — admin's mutation is the trigger, not the recompute itself (substrate-honest). Spec at apps/admin/tests/trust-reviews.spec.ts. (b) /trust/kyc (STILL PENDING): user_verifications exists but the document-review state (per-doc accept/reject + reason) may need new tables. Pre-build, settle the schema question — either expose what exists today or define new tables (kyc_documents + kyc_decisions?) before building the chapel. Until then, /trust/kyc stays a ComingSoon stub. ACCEPTANCE for what's left: schema decision documented + KYC chapel built or stub explicitly noted as gated.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
