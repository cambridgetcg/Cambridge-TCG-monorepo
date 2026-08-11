# Market payment failure and recovery contract

**Status:** Accepted for the non-money isolation/recovery slice. Executable attempt-ledger rollout remains blocked.

**Will trace:** Yu, 2026-08-01 — “最緊要比大家玩得開心，所以要 build 好啲；smooth and prethink scenarios that mess up the fun for everyone.”

## The five truths must stay separate

| Observation | What it proves | What it does not prove |
|---|---|---|
| Browser returned from Checkout | navigation occurred | authorization, settlement, refund, or even which browser paid |
| Cambridge trade advanced | the host projection accepted an event | independent provider finality or physical fulfilment |
| Provider session is complete | Checkout finished | funds are available unless the payment status is paid |
| Reconciled settlement event | exact provider object matched the reserved trade terms | delivery, card authenticity, or dispute outcome |
| Adjustment succeeded | a named refund/reversal/chargeback operation reached its terminal provider state | that the original settlement never happened |

User copy and account mutation must name the relevant truth. A query parameter, local `refunded` label, or generic receipt may never be promoted into a stronger claim.

## Failure table

| Scenario | Safe result | User recovery |
|---|---|---|
| Double click, two tabs, or lost HTTP response | current UI freezes after an ambiguous response; target is one durable attempt and one provider idempotency key | do not retry an unknown outcome; inspect the same trade/provider reference |
| Return arrives before webhook | remain `checking` or `awaiting`; no new attempt | bounded status polling, then manual refresh/support reference |
| Configuration rejects before provider egress | explicit proof that no provider request was sent; deadline remains visible | refresh later before the shown deadline |
| Network/provider/malformed response after possible egress | outcome unknown; freeze the Pay control | do not retry; inspect the trade and contact support with its reference |
| Paid event races local expiry | listing and trust effect pause until exact reconciliation | “do not pay again”; resolve to settled or provider-backed adjustment |
| Duplicate or out-of-order events | append/deduplicate; terminal facts do not regress | no duplicate notification, shipment, payout, or penalty |
| Wrong session, buyer, trade, amount, currency, mode, or payment intent | `requires_review`; never unlock shipping | provider reference visible to operators, neutral copy to participants |
| Asynchronous payment is incomplete | `pending`, distinct from paid and failed | wait; do not switch rails while outcome is unknown |
| Seller does not ship | payout remains blocked; fulfilment SLA and dispute route stay visible | message, evidence, dispute, then a separately tracked adjustment |
| Refund approved locally | `refund_approved`, not `refunded` | wait for provider submission and success before “funds sent” copy |
| Chargeback arrives after payout | original settlement remains; linked adjustment freezes/reconciles recovery | neutral dispute copy, evidence deadline, no automatic guilt claim |
| Shop/custodian is unavailable before authorization | no attempt, rail remains selectable | retry or jointly choose another declared provider |
| Shop/custodian outcome is unknown after submission | freeze rail choice, never fall through to another provider | reconcile the same provider reference |
| International trade | exact GBP charge/refund denomination and corridor policy | disclose FX, customs, importer, delivery and reverse-logistics terms before authorization |

## Slice shipped by this decision

This slice performs no provider mutation and changes no trade state:

1. Only a Session created no later than the retail till's immutable production retirement boundary (`2026-07-06T14:04:27Z`), carrying valid legacy `skus` evidence and no named/B2B marker, may enter `customer_orders`. Present-but-empty markers fail closed. The webhook, hourly reconciliation, shared writer, and confirmation page share that ownership boundary. The timestamp is the Vercel READY time for production deployment `cambridgetcg-storefront-or8ab5c90` at SHA `555f9592`; `git merge-base --is-ancestor 98468020 555f9592` returned success, proving that deployment contains the shop-close commit.
2. Historical synthetic rows are retained for audit. Account-order views hide only rows whose Session is still referenced by a market trade, lot trade, auction, or B2B order. Subscription projections, overwritten older trade Sessions, and any flow without a retained local Session link remain unresolved. Annual spend and tiers are deliberately unchanged until the affected-user/delta report below is reviewed.
3. Every market Pay caller uses one response parser and surfaces provider, configuration, malformed-response, and network failures. Any result that may follow provider egress is labelled outcome-unknown, tells the buyer not to retry, and disables that Pay control for the current page lifetime.
4. `?paid=<trade>` initially means only `return_seen`. The banner reads a narrow participant-only, private/no-store status projection with a request timeout and finite polling schedule. Its final automatic check becomes a manual state; it never claims to keep polling after it stops or treats the query parameter as payment evidence. The normal participant list and detail projections are separately allowlisted so provider IDs, payout references, admin notes, and unrelated shipping/operator data do not leak through `t.*`.
5. `?paidLot=<lot-trade>` remains explicitly unverified until a participant-scoped lot-trade status endpoint exists.
6. Lazy reads and cron may expire stale unmatched order-book intent, but automatic matched-trade payment expiry is frozen. An overdue `awaiting_payment` trade stays held for reconciliation: no cancellation, relisting, notification of guilt, fraud signal, or trust penalty can be derived from the deadline alone. The attempt ledger below must restore safe automated expiry.
7. A failure in the market-maintenance lane now returns HTTP 503 from the combined cron after the independent lanes finish, making the critical failure visible to platform monitoring.

## Historical account projection audit gate

Before excluding synthetic `customer_orders` rows from annual spend, run a read-only production report over currently attributable rows and review every affected account. The minimum report groups by `co.user_id`, counts rows, and sums `co.total_gbp` where `co.stripe_session_id` still matches `market_trades`, `market_lot_trades`, `auctions`, or `b2b_orders`. Compare that proposed subtraction with the separately counted market/auction spend and the resulting tier, fee, and benefit changes.

That report is a lower bound, not a complete repair set: a single mutable trade Session column cannot recover an overwritten older Session, and membership history does not retain every historical Checkout Session. Do not mutate `annual_spend`, tiers, fees, rewards, or benefits from this heuristic alone. A Stripe-metadata-backed quarantine/backfill needs its own evidence and review.

## Executable attempt ledger gate

The next money-moving slice must land as one coordinated unit, not as scattered guards:

1. Lock the trade and insert/reuse one provider-neutral active attempt before egress. Snapshot buyer, seller, rail, integer minor amount, asset/refund asset, terms hash, local deadline, and provider-expiry policy.
2. Derive the Stripe idempotency key from the durable attempt ID. Provider success followed by process/DB/response loss must recover that same object.
3. Bind Checkout Session and PaymentIntent write-once through compare-and-set.
4. Ingest provider event IDs into an append-only inbox and require exact session, attempt, trade, buyer, amount, currency, mode, paid status, PaymentIntent, and usable fulfilment data before the trade advances.
5. Coordinate the expiry sweep with open/settling attempts. A read-path sweep must never cancel, relist, penalize, or recompute trust while provider settlement is unresolved.
6. Commit the trade transition, lifecycle evidence, and notification outbox atomically. Retry delivery from the outbox rather than replaying money state.
7. Resolve refund, chargeback, and failed-payment ownership through the attempt/trade binding, never email or an accidental retail row.

Stripe documents that POST retries should reuse idempotency keys, webhook delivery can be duplicated and out of order, and Checkout fulfilment must be safe under repeated/concurrent calls: <https://docs.stripe.com/api/idempotent_requests>, <https://docs.stripe.com/webhooks>, and <https://docs.stripe.com/checkout/fulfillment>.

## Release boundary

This isolation/recovery slice is reversible application code and needs no new provider credential or database migration. It changes no provider or account state. It does not make the current market Checkout path safe enough to call a CashLoom adapter or reference implementation. Freezing automatic matched-trade expiry is intentionally conservative and can leave abandoned matches held until the coordinated ledger exists.

Do not broadly release the freeze alongside live matching/payment on its own: an absent or malicious buyer could otherwise hold seller inventory indefinitely. Production requires the coordinated attempt ledger, or a temporary matching/payment shutdown, or an explicit operator reconciliation-and-release queue with an owned SLA. The current PR therefore remains draft and production-blocked.

The executable ledger requires an additive migration, PostgreSQL concurrency proof, legacy-session collision report, dual-read transition window, exact webhook tests, and live migration evidence. The retired-retail cutoff is anchored to production deployment evidence, but a read-only Stripe Session inventory is still required to confirm the post-boundary legacy set is empty. Until those are present, do not merge a partial attempt implementation, enable a second rail, claim decentralized escrow, or deploy new payment mutation semantics.

Third-party shops remain future replaceable service providers: they may publish optional claims and self-certifying keys, and traders may attest/vet them. Cambridge must not award a universal legitimacy badge. Regulated fiat custody can still impose provider identity requirements; that is a property of the selected rail, not CashLoom core identity.
