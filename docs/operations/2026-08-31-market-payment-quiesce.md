# P2P payment-creation quiesce

**Status:** release interlock; enabled state not yet authorized.

This release temporarily refuses creation of new P2P provider checkout
sessions while Cambridge drains the legacy Stripe path and installs the shared
settlement reservation ledger. It does not cancel a trade, change a payment
deadline, mark a payment successful, restore a listing, move money, or block
shipping, receipt, evidence, dispute, refund or payout work for obligations
that have already moved beyond payment.

The gate fails closed unless the exact environment value is present:

```text
MARKET_PAYMENT_CREATION_MODE=ledger-v2-enabled
```

Do not set that value until all of these are true:

1. the previous production deployment and every skew-protected instance that
   can create an unreserved Stripe Checkout Session have drained;
2. recent Stripe marketplace Sessions are reconciled by trade, with duplicate
   open Sessions expired and extra paid Sessions quarantined/refunded;
3. migration `0133_market_trade_payment_attempts.sql` is applied and probed
   in production; migration `0134_paypal_multiparty_settlement.sql` remains
   isolated to a sandbox database until the PayPal runbook's partner, legal,
   refund/release and canary gates separately authorize production use;
4. the ledger-backed Stripe route and webhook are deployed and healthy; and
5. retry, cancellation, expiry and reconciliation probes pass in production.

PayPal remains independently disabled unless its own reviewed sandbox/live
configuration is complete. Enabling the Stripe ledger does not enable PayPal.
