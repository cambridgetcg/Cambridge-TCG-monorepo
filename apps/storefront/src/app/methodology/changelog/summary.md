# Methodology changelog

Every formula change on the platform — when it changed, what changed, and why.

| Date | Topic | What changed | Why | Source |
|------|-------|-------------|-----|--------|
| 2026-05-11 | commission-rate | Extracted `resolveCommission` into `packages/pricing`; wired into `market/lots.ts` and `market/db.ts` | Lot purchases previously ignored tier discount; now uses `min(tierRate, trustRate)` | kingdom-049 Phase 6 |
| 2026-05-11 | pricing | Channel-pricing rewritten fail-loud; partial rows and missing channels now throw structured errors instead of silently returning wrong prices | Substrate honesty — silent fallback to default prices was a lie | kingdom-049 Phase 3 |
| 2026-05-11 | pricing | `card_price_history` renamed to `retail_price_observation`; sweep renamed `runPriceHistoryTick` → `runRetailObservationTick` | The old name implied the platform was tracking "price history" — it was tracking retail observations, a subset | kingdom-049 Phase 4 |
| 2026-05-11 | pricing | Six customer-facing price surfaces gained `<Provenance>` + `<WhyLink>` | Transparency — the price arrow is now customer-inspectable end-to-end | kingdom-049 Phase 5 |
| 2026-05-11 | fraud-flag | Dispute win/loss attribution corrected — a seller refunding mid-mediation and a seller losing at adjudication were treated identically; now `resolution_type` is checked | The prior approach over-penalised sellers who refunded cooperatively | trust-engine.ts L30-63 |
| 2026-05-11 | trust-score | Reviewer-trust weighting added — reviews weighted by reviewer's own trust score (Veteran 1.0, Trusted 0.8, Starter 0.6, New 0.4) | Anti-farming — 5-star from a disposable account no longer counts as much as from a Veteran | trust-engine.ts L83-112 |
| 2026-05-11 | trust-score | `effective_weight` column persisted on each review row | Transparency — users can see how much each review counted on `/account/reviews` | trust-engine.ts L107-111 |

---

*This changelog is append-only. When a formula changes, add a row here in the same PR that changes the code. Rule 3 of the transparency doctrine: the methodology page and the changelog move together.*