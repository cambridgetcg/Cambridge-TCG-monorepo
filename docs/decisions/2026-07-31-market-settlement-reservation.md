# Market settlement reservation and Stripe attempt ledger

**Status:** Proposed for guarded rollout, 2026-07-31.

**Will trace:** Yu, 2026-07-31 — “Can integrate cashloom into cambridgetcg as payment layer? Integrate into the user account and market trading. Also brainstorm on the handling of escrow and international trades.” Followed by “Great idea! gogogo!” This also preserves the earlier requirement that CashLoom authority must not depend on a company account or centrally issued infrastructure identity.

## Decision

Every executable P2P settlement path must first claim one immutable, database-backed rail reservation for the trade. Stripe Checkout is the only executable rail enabled by migration `0128_market_trade_payment_attempts.sql`; preparing or exporting the unsigned CashLoom handoff remains non-executing and does not claim the rail.

Stripe uses a generation-scoped attempt ledger rather than a forever key:

- a short transaction locks the trade, verifies buyer/state/deadline, claims the Stripe rail, and inserts or returns the one blocking attempt;
- the transaction commits before any Stripe call;
- each attempt freezes its exact Checkout request inputs, expected integer pence, GBP currency, provider expiry, random attempt ID, and idempotency key;
- concurrent and ambiguous retries replay that same attempt and key;
- a new generation is allowed only after signed or directly retrieved provider evidence proves the preceding session expired or terminally failed;
- a provider-expired attempt with no bound Session ID becomes `requires_review`, because Stripe may prune an idempotency key after 24 hours and a paid-but-unrecorded Session cannot then be distinguished safely from a fresh create;
- adaptive pricing is disabled for these sessions so the exact GBP/pence webhook invariant cannot drift through a Dashboard setting.

Stripe documents that idempotency results, including errors, are replayed and keys may be removed after they are at least 24 hours old. Checkout `expires_at` must be between 30 minutes and 24 hours after creation. New sessions therefore last at most 23 hours and are refused when fewer than 31 minutes remain in the real Cambridge payment window: [idempotent requests](https://docs.stripe.com/api/idempotent_requests), [Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create).

## Webhook authority

For v2 attempts, a paid Stripe webhook may advance the trade only when all of these match the locked ledger row:

- settlement rail;
- trade ID and random attempt ID;
- exact Checkout Session and client reference;
- exact PaymentIntent once one has been bound;
- the frozen provider expiry and disabled-adaptive-pricing setting;
- payment mode and paid state;
- expected amount and currency.

The attempt and trade advance in one database transaction. A contradictory signed event moves the attempt to blocking review and never fulfils the trade. A transient database failure returns non-2xx so Stripe retries; Stripe documents automatic retries and warns that event order is not guaranteed: [Stripe webhooks](https://docs.stripe.com/webhooks).

An unpaid asynchronous completion moves the attempt to `processing`, not paid. Signed expiry or asynchronous failure moves it terminal. The unpaid-trade sweep and pre-payment cancellation handshake exclude reserved, open, processing, and review-held attempts. Post-payment cancellation is no longer represented as “no refund needed”; it must wait for a real refund saga.

Reconciliation uses the attempt ledger as a durable work queue: a leased, oldest-observation-first batch of bound open/processing Sessions is retrieved independently of the recent-Session creation window, then exact paid, expired, or still-processing evidence passes through the same DAL as webhooks. This closes the fixed-head and 48-hour blind spots for old delayed methods; an unbound ambiguous create and a missing asynchronous-failure event remain explicit manual-review debt.

Pre-v2 market Sessions remain compatible only through exact equality with the trade's stored `stripe_session_id`, expected pence, and GBP. Signed expiry/failure retires that exact legacy Session. A lookup timeout, changed Stripe mode/account, or unknown-resource response is ambiguous and never mints a replacement automatically.

## CashLoom and decentralized identity

This reservation layer does not make CashLoom centrally identified. A future CashLoom executor can use a self-certifying protocol key and local wallet, but enabling it requires a new reviewed migration that expands the rail allowlist and supplies its observation and reversal rules. The current schema intentionally permits only `stripe_checkout`; discovering code or possessing a CashLoom handoff is not authority to move money.

Before `cashloom_v2` can become executable, it needs:

1. buyer-authorised, irreversible rail selection;
2. merchant-side exact-output and confirmation observation independent of payer-local broadcast claims;
3. late-payment and reorganisation policy;
4. commission collection semantics;
5. explicit direct-versus-conditional settlement language;
6. refund/reversal behavior; and
7. payout exclusion so a directly paid seller cannot also receive a platform payout.

Direct seller payment is non-custodial settlement, not escrow. Cryptographic conditional settlement needs an audited script profile, timeout/refund paths, and an explicitly bounded arbitrator for off-chain shipping/authenticity facts. Provider custody remains provider-dependent and must not be described as decentralized.

## International trades

The existing Cambridge market deliberately offers Stripe's global shipping-country list, following the project's global-free-trade specification. That means the current code permits global payment and address collection; it is **not** deny-by-default and must not be described as a governed international corridor.

Before Cambridge can claim corridor-level protection, a country-pair policy must name the authority and behavior for sanctions/export screening, trader status, tax reporting, importer of record, duties, delivery evidence, insurance, returns, dispute forum, FX quote/refund denomination, and purpose-limited address disclosure. Until then, international execution is an explicit release risk carried by trader-arranged logistics, not a solved escrow property. Protection clocks should ultimately start from delivery evidence or buyer confirmation, not dispatch alone.

The settlement reservation is useful across corridors because it prevents two independently chargeable paths, but it does not answer those legal or operational questions.

## Rollout and remaining debt

Migration-first alone is unsafe during a rolling application switch: an in-flight old `/pay` handler does not know about the reservation ledger and can still create a second Session or overwrite the compatibility field. Rollout therefore needs two releases: first quiesce market payment creation and wait for old requests/instances to drain; then reconcile recent Stripe market Sessions by `metadata.trade_id`, expire extra open Sessions, record/refund any extra paid Session hidden by the historical last-writer field, apply the migration, deploy v2, and re-enable payment. Rollback is quiesce-or-forward-fix only; old payment creation must not be re-enabled against v2 state.

This slice does **not** claim production-complete escrow. Still blocking broader payment-layer assurance:

- market-specific refund and partial-refund execution;
- durable mismatch/refund incident workflow for every legacy anomaly;
- market refund/chargeback ownership mapping and payout holds that exclude
  unresolved reversals plus every active/accepted return window, or a named
  funded recovery reserve that truthfully carries that exposure;
- reconciliation for an unbound ambiguous create and safe terminal inference when an old asynchronous failure event is missing;
- a measured 60-second cron budget, bounded provider concurrency/deadline, and proof that the 200-session retail tail meets its recovery SLA under Stripe latency;
- replay-safe buyer/seller paid notifications when the DB-driven bound-attempt reconciler, rather than the webhook, applies settlement;
- atomic payout-method reservation before an external transfer; and
- CashLoom chain observation, commission, refund, and payout rules.

Production release and live CashLoom execution remain blocked until the relevant debt is paid and the migration/reconciliation runbook is rehearsed.
