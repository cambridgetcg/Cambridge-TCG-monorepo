# CashLoom payment preparation and account-mutation boundary

**Status:** Accepted for a default-disabled, record-only slice, 2026-08-01.

**Will trace:** Yu, 2026-08-01 — “let’s dive deeper into payment flow and account mutation.” This follows the standing requirement that CashLoom infrastructure must not require a corporate account or a centrally issued CashLoom identity.

## Decision

Cambridge TCG may record one buyer-only, Cambridge-local preparation receipt for one exact existing CashLoom trade handoff. The only transition is:

```text
absent -- authenticated current buyer + exact packet + open window --> prepared
```

`prepared` is terminal and insert-only. It means the host account prepared the packet. It is not a CashLoom v2 record, payer-key signature, consent artifact, payment attempt, settlement-rail choice, processor reservation, escrow event, shipping right, or payout event.

The application derives content-addressed request and preparation IDs, hashes the client retry key, locks and rechecks the trade, and inserts with conflict-safe semantics. The database independently enforces the exact trade/handoff/terms relationship, current buyer, non-self-trade, awaiting-payment state, open payment window, one row per trade and handoff, one operation per actor/retry-key digest, and rejection of updates and ordinary deletes.

The receipt authority is explicitly `cambridge_database_session`. Direct database operators remain part of that host authority; this is tamper-resistant application evidence, not a cryptographic statement beyond Cambridge. Only the buyer and seller may read it. Raw retry keys are not retained.

## Why this account mutation is separate

Four authorities must not be blurred:

| Authority | May honestly assert | Must not be treated as |
|---|---|---|
| Cambridge authenticated session | a host account requested a bounded local mutation | CashLoom-key control, legal identity, or funds ownership |
| CashLoom payer key | signed protocol consent to exact terms | independent settlement observation |
| Wallet/node | submission and local wallet observations | merchant receipt, finality, or fiat safeguarding |
| Processor or chain observer | provider/chain facts within a named confirmation policy | card authenticity, shipping, or dispute truth |

The current slice uses only the first authority. It deliberately makes no wallet, CashLoom node, Stripe, Fly, chain, or other external request and never updates `market_trades`.

## Idempotency and race contract

The body is closed to seven exact fields: action, handoff ID, terms hash, expected trade state, expected preparation state, the exact version of the participant-visibility/retention notice shown before action, and a lowercase UUID-v4 retry key. Actor identity always comes from the server session.

The request hash excludes the retry key and binds the semantic operation. The retry-key digest binds safe transport replay. A retry with the same actor, key, and exact operation returns the stored receipt even if the trade later advances. Reusing the key for changed bytes is an explicit conflict. A second key cannot create a second semantic receipt. Transactional trade locking plus database uniqueness serializes competing attempts.

## Target executable payment flow

No processor or wallet should be called from the preparation mutation. A later executable adapter must follow this order:

1. Lock the trade and compare-and-set one immutable settlement reservation from `unselected` to `reserving`, binding rail, exact asset ID, integer amount, payer, merchant, terms hash, expiry, and refund denomination.
2. Commit that reservation before creating a provider Checkout Session or handing bytes to a wallet. Derive the provider idempotency key from the durable reservation, not from a browser click.
3. Bind the returned provider/session or CashLoom commitment ID to the reservation through a guarded transition. An interrupted request remains reconcilable and cannot mint another payable object.
4. Ingest provider or observer events into a deduplicated, append-only inbox. Verify signature and bind exact provider object, rail, amount, currency/asset, payer/customer, merchant destination, metadata, and payment status.
5. Advance settlement by compare-and-set and emit an outbox event. Shipping and payout consume only the reconciled event; a success redirect, generic receipt, or payer-local broadcast claim cannot advance them.
6. Represent refund, reversal, and chargeback as linked adjustment records with their own amounts, asset, evidence, deadlines, and states. Never rewrite the original payment or silently map a local `refunded` label to a provider refund.

Stripe documents stable idempotency keys for safe POST retries and warns that webhook endpoints must handle retries, duplicates, and event ordering: <https://docs.stripe.com/api/idempotent_requests> and <https://docs.stripe.com/webhooks>. Those requirements apply to the existing Stripe path before it can share a rail-selection state machine with CashLoom.

## Processor and decentralized paths

- **Stripe or another regulated provider:** the provider is the named centralized authority for card authorization, refund, chargeback, and supported payouts. CashLoom can bind portable consent/evidence references around it but does not decentralize that rail.
- **Direct CashLoom settlement:** buyer and seller use self-certifying keys and self-operated or chosen wallet/node infrastructure. Cambridge can coordinate terms and evidence but cannot reverse money or call this escrow.
- **Cryptographic conditional settlement:** a future audited threshold/timeout construction may distribute spending authority. Physical authenticity and delivery remain off-chain facts and require a named evidence/arbitration policy.
- **Third-party shop/provider custody:** the selected provider publishes its own terms, keys, supported corridors, proof and dispute policy. Traders vet it; Cambridge supplies registration, attestations, receipts, and replaceable adapter interfaces without awarding a universal “trusted” badge.

Every adapter must implement distinct `prepare`, `authorize`, `submit`, `observe`, `reconcile`, `adjust`, and `dispute` stages. Unsupported stages fail closed. Asset values use explicit AgentTool/CashLoom asset identifiers and integer base units; no generic decimal “balance” or implicit GBP-to-BTC conversion is allowed.

## Existing Stripe safety debt

The legacy market Checkout/webhook flow predates this contract. It must not be presented as the reference implementation until it has a durable pre-provider reservation, stable provider idempotency, exact webhook binding, duplicate/out-of-order handling, market-trade refund and dispute ownership, real provider refund execution, guarded state transitions, and truthful failure acknowledgement. This slice does not modify or bless that flow.

## Rollout and rollback

`CASHLOOM_PAYMENT_PREPARATION_MODE` defaults to `disabled`; only the exact value `record_only` accepts writes. Reads remain available while writes are disabled.

Release order is: apply migrations 0127 and 0128 transactionally; verify schema and participant reads; deploy with writes disabled; exercise authenticated preview reads; opt one reviewed environment into `record_only`; then verify first-write, exact replay, competing-key conflict, seller read, and unchanged trade state. Production enablement requires a documented operator, monitoring, an approved retention/legal basis and erasure design, matching public privacy text, and live-database verification. The current retention review is unresolved, so production `record_only` is blocked.

Rollback sets the mode to disabled and removes or reverts the writer/UI. It retains the inert evidence table and existing participant reads. The no-delete rule is intentional for evidence integrity but creates retention and erasure-policy debt that must be resolved before broad production enablement; no automated destructive rollback is permitted.

## Acceptance boundary

- buyer-only host authority, exact closed request, server-derived actor;
- one immutable receipt bound to one existing immutable packet;
- transaction lock, exact replay, conflict-safe insert, database-side authority/state guards;
- participant-only private/no-store reads;
- default-disabled writes and truthful UI before mutation;
- no external call, rail choice, payment, escrow, settlement observation, trade mutation, shipping unlock, payout change, or CashLoom-core schema claim.
