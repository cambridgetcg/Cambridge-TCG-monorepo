# Crypto wallet + P2P escrow boundary

**Will trace:** Asha, 2026-08-23 — "有無得整 Crypto Wallet Integration? 等 P2P 可以用
crypto trade, particularly for the escrow flow."

**Decision status:** testnet foundation accepted; production value transfer withheld.

## Decision

Cambridge TCG will begin with a **verified, non-custodial wallet link** and a
**provider-neutral settlement contract**. It will not add crypto as another Stripe button,
operate an omnibus wallet, deploy an unaudited escrow contract, or call a transaction hash
"paid."

The first supported proof environment is deliberately singular:

- Cambridge account remains the identity and authorization anchor.
- An external wallet is linked using an EIP-4361 Sign-In with Ethereum message.
- Only Base Sepolia (`eip155:84532`) is accepted.
- Only Circle's Base Sepolia test USDC contract
  (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals) is named.
- Circle states that its testnet tokens have no financial value and are not backed by real
  dollars. The UI and code say that too.
- Wallet linking and the escrow model are separately gated. Neither enables checkout.
- The existing Stripe P2P route remains unchanged in this increment.

Primary protocol and asset references:

- [EIP-4361: Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361)
- [Circle's USDC contract registry](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [Circle's EVM transfer guide (including 6-decimal USDC)](https://developers.circle.com/stablecoins/quickstarts/transfer-usdc-evm)

### No-value operator enablement

After migration `0130_evm_wallet_links.sql` is applied, creating or verifying a wallet link
requires:

```text
EVM_WALLET_LINKING_MODE=testnet
NEXT_PUBLIC_SITE_URL=https://the-exact-canonical-origin.example
```

Smart-contract wallet verification additionally requires:

```text
BASE_SEPOLIA_RPC_URL=https://approved-rpc.example
BASE_SEPOLIA_RPC_PROVIDER_NAME=Public provider name
BASE_SEPOLIA_RPC_PRIVACY_URL=https://approved-rpc.example/privacy
```

`NEXT_PUBLIC_SITE_URL` supplies the exact SIWE domain/origin and must be HTTPS except on
localhost. `BASE_SEPOLIA_RPC_URL` is server-only and required only for smart-contract wallet
verification, and must use HTTPS except on localhost; an EOA proof is checked locally. A remote
RPC fails closed unless its public provider name and HTTPS privacy URL are configured too. Those
two disclosure values—not the private RPC endpoint or credentials—are returned to the account
screen before a signature is requested. Before
contract verification, Cambridge requires the RPC's `eth_chainId` to equal `84532`. After local
EOA failure, only the address is sent for bytecode classification. The exact challenge and
signature are sent only for deployed code or a locally identified ERC-6492 signature. When the
RPC is absent, smart-wallet verification fails with a typed unavailable response rather than
falling back to an unnamed public RPC. No private key belongs in any of these variables. Turning
on wallet linking still does not turn on escrow checkout or token transfer;
`CRYPTO_ESCROW_MODE=testnet` exposes only the pure integration model.
An authenticated, same-origin participant may still revoke an existing link while issuance is
disabled, provided the canonical origin is valid and the registry is available. Feature
disablement is not allowed to trap a participant's link.

## What a linked wallet proves

It proves that the authenticated Cambridge account produced a valid, fresh signature from
the stated address over the exact challenge presented by Cambridge TCG. It does **not** prove:

- legal identity;
- beneficial ownership of every asset in the wallet;
- source of funds;
- sanctions, KYC, KYB, tax, or Travel Rule status;
- continuing control after verification;
- willingness or ability to settle a trade.

The platform never asks for, receives, or stores a seed phrase or private key. A wallet link
can be revoked without changing on-chain history.

Mutation bodies are stream-bounded to 16 KiB before JSON parsing. The wallet-visible SIWE
request ID is the random challenge UUID; the separate session-binding digest remains
server-side and is never embedded as a wallet-visible session pseudonym.

Before message validation, EOA cryptography, or any RPC call, PostgreSQL atomically reserves a
verification attempt under one user lock and the exact challenge row lock, then samples its own
clock. Every failed proof consumes that attempt. A challenge permits five attempts; one account
permits 40 reserved attempts in an exact rolling hour, recorded as proof-free attempt metadata
(challenge, account, chain/address keys and database time). Terminal challenge states and both
limits return typed private errors. Deployment-edge rate
limiting remains a production gate: the database budget bounds authenticated work but is not a
substitute for rejecting abusive traffic before application/database execution.

Testnet v1 revocation marks the current registry link revoked but retains that history. It does
not cancel a challenge that was already issued or whose signature verification is in flight.
That proof can create a fresh link until its signed five-minute expiry. This is explicit
last-writer semantics, not a strong revoke-wins guarantee. Any payment-capable version must use
a shared per-address generation or epoch so a completed revocation makes every older challenge
stale.

## Two state machines, not one overloaded enum

The current `market_trades.escrow_status` primarily describes physical fulfilment:
`awaiting_payment` → `awaiting_shipment` → shipping/inspection → `completed`. It is not a
money ledger and must not become one by adding transaction hashes to Stripe fields.

Future settlement therefore has its own state and event history:

```text
prepared
  → authorization_pending
  → submitted
  → submission_unknown
  → observed_unfinalized
  → reconciling
  → funded_final
  → (optional funding_review)
  → shipped
  → (optional shipping_review)
  → inspection
  → (optional inspection_review)
  → releasable
  → (optional release_review)
  → released

Pre-submission exits: failed · expired
Post-final-funding exit: refunded
```

`submitted` means only that a client reported a transaction submission. It can move directly
to observation when evidence arrives; `submission_unknown` is the recoverable branch for an
ambiguous broadcast, timeout, temporarily missing transaction, or evidence that disappears.
`observed_unfinalized` means an approved observer found an event that may still be removed or
reorganized. Neither `submitted` nor `submission_unknown` can transition to terminal `failed`:
the transaction may still land, so observation and reconciliation must continue. In this model
`failed` is available only before reported submission, when the authorization attempt has
authoritative failure evidence; it is not a timeout label.
`funded_final` requires an independently observed successful receipt, the adapter's explicit
finality determination, and exact reconciliation of:

- chain;
- token contract;
- escrow contract;
- integer atomic amount;
- fixed opaque trade reference;
- positive settlement generation;
- 32-byte terms digest;
- deadline and independently observed block-inclusion time at or before it;
- payer;
- beneficiary;
- non-removed event identity `(chain_id, transaction_hash, log_index)`.

Only the `reconciling → funded_final` transition may unlock the existing fulfilment flow.
Neither wallet connection, signature, balance display, allowance, transaction submission,
receipt appearance, nor an arbitrary explorer link is payment.

Broadcast ambiguity remains in `submission_unknown` or `reconciling`. Post-funding holds use
phase-specific `funding_review`, `shipping_review`, `inspection_review`, or `release_review`
states so a dispute cannot erase fulfilment provenance. Whole-graph reachability requires every
path to `released` to have passed `funded_final`, `shipped`, `inspection`, and `releasable` in
that order. The trade reference must also be a non-empty, unpadded, control-free opaque
identifier of at most 128 UTF-8 bytes; exact agreement on two empty strings is not
reconciliation.

## Authority is split by verb

An adapter must expose separate authorities rather than one `pay()` method:

1. **Prepare** — freeze chain, asset, amount, parties, expiry, terms digest, and idempotency
   generation before any provider or wallet call.
2. **Authorize** — request the collector's narrowly scoped approval/signature.
3. **Submit** — broadcast or ask an approved provider to submit; record, do not celebrate.
4. **Observe** — independently read provider/chain evidence.
5. **Reconcile** — compare the exact final event with the fixed intent atomically.
6. **Adjust** — perform an authorized release/refund correction with its own idempotency key.
7. **Dispute** — freeze normal progress and enter a documented evidence/remedy process.

This shape permits a provider-mediated implementation or an audited conditional-settlement
contract without giving either one authority over Cambridge trade state.

## Threat model and invariants

| Threat                          | Structural response                                                                                                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seed/private-key theft          | External user-controlled wallet only; Cambridge never accepts keys.                                                                                                                                                                                                        |
| Signature replay                | One-use, short-lived SIWE nonce bound to account session, address, chain, domain, origin, issue and expiry times.                                                                                                                                                          |
| Challenge/DB abuse              | Stream-bound mutation bodies to 16 KiB; cap issuance at 20/account/hour; atomically reserve at most 5 attempts/challenge and 40/account/rolling hour before proof work. Deployment-edge limiting remains required.                                                         |
| Account-to-wallet theft         | Re-lock challenge and wallet ownership rows in one transaction; one active Cambridge owner per chain/address.                                                                                                                                                              |
| Wrong-chain/wrong-token payment | One exact CAIP-2 chain and one exact token allowlist; no arbitrary ERC-20s, bridges, swaps, or fallback addresses.                                                                                                                                                         |
| Quote or decimal drift          | Freeze integer atomic amount, positive settlement generation, 32-byte terms digest, expiry and asset decimals before authorization; never reconcile floating-point currency.                                                                                               |
| Fake/failed transaction         | Server-side observation of receipt/event; success status and exact event fields required.                                                                                                                                                                                  |
| Reorg/removed log               | Unfinalized observation cannot fund; removed evidence returns to `submission_unknown` or reconciliation.                                                                                                                                                                   |
| Duplicate webhook/poller        | Unique external event key `(chain, tx_hash, log_index)` plus generation-scoped command idempotency.                                                                                                                                                                        |
| Late payment after cancellation | Require the observed block inclusion time at or before the fixed expiry and exact generation; otherwise enter the late-payment reconciliation/refund policy.                                                                                                               |
| Double release/refund           | Mutually exclusive terminal transitions and provider/contract command idempotency.                                                                                                                                                                                         |
| Operator-key compromise         | No single hot release key; production requires scoped roles, multisig, pause/freeze limits, time-bound emergency powers, and audited recovery.                                                                                                                             |
| Smart-contract defect           | No production deployment before specification review, independent audit, source verification, monitoring, and incident rehearsal.                                                                                                                                          |
| Privacy leakage                 | Keep linkage participant-private, narrowly disclose smart-wallet RPC processing, never scan unrelated history, and state honestly that exact challenges, proof-free attempt metadata and link rows remain until account deletion; a shorter schedule is a production gate. |

## Existing fiat debts block a shared release engine

The current P2P fulfilment system predates a provider-neutral settlement ledger. Before
crypto can share its release path, Cambridge must port/generalise the unmerged settlement
reservation work and close these verified debts:

- reserve exactly one active payment rail before a provider call;
- bind exact GBP pence, trade, session/payment ID and reservation generation;
- reconcile timeout/cancellation races and late Stripe completion;
- make paid cancellation produce an actual refund, not only a status label;
- make dispute/return/admin refund actions move money atomically or state clearly that they
  have not;
- prevent payout while returns, fraud review, provider finality, or an active dispute can
  still block release;
- align the return window with the payout hold;
- append each money and fulfilment transition to an immutable lifecycle/event log.

Crypto must not route around those debts. The common integration seam is a future
transactional `settleTradePayment()` command fed by provider-specific reconciled evidence,
not a second direct update of `market_trades.escrow_status`.

## Regulatory and provider boundary

This is an engineering perimeter record, not legal advice. Labels such as "non-custodial"
or "smart contract" do not decide the UK regulatory analysis.

- The FCA's current registration guidance expressly includes peer-to-peer providers and
  arranging exchanges in activities that may fall within the Money Laundering Regulations.
  It says uncertain firms should seek independent legal/compliance advice.
- FCA payment-services guidance says an e-commerce platform regularly holding funds pending
  fulfilment is an example likely to require authorization or registration absent an
  exclusion or exemption.
- The FCA says the broader UK cryptoasset regime starts on 25 October 2027.

Official references:

- [FCA: who needs to register](https://www.fca.org.uk/firms/cryptoassets/who-needs-register)
- [FCA PERG 15 payment-services perimeter guidance](https://www.handbook.fca.org.uk/handbook/PERG/15.pdf)
- [FCA: overview of the 2027 cryptoasset regime](https://www.fca.org.uk/publications/policy-statements/cryptoasset-regime)
- [FCA: UK Travel Rule expectations](https://www.fca.org.uk/news/statements/fca-sets-out-expectations-uk-cryptoasset-businesses-complying-travel-rule)
- [UK financial sanctions guidance](https://www.gov.uk/government/publications/financial-sanctions-general-guidance/uk-financial-sanctions-general-guidance)

Current provider documentation also prevents a casual UK Stripe extension: Stripe documents
stablecoin acceptance for US businesses and stablecoin Connect payouts for US platforms in
private preview. Coinbase documents marketplace-oriented authorization/capture/refund
capabilities, but Cambridge's UK eligibility, sub-merchant payout model, authorization
duration, custody allocation, onboarding, and compliance responsibilities remain unverified.
No provider has been integrated or contacted in this increment.

- [Stripe stablecoin acceptance](https://docs.stripe.com/payments/accept-stablecoin-payments)
- [Stripe Connect stablecoin payouts](https://docs.stripe.com/connect/stablecoin-payouts)
- [Coinbase Payment Acceptance overview](https://docs.cdp.coinbase.com/payments/payment-acceptance/overview)

## Production gates

No mainnet or real-value pilot may start until every gate has named evidence and an owner:

1. UK perimeter advice covers Cambridge's exact flow, fees, custody, marketing, refunds,
   disputes, Travel Rule, sanctions, KYC/KYB/PEP and geographic scope.
2. The approved provider confirms Cambridge and seller eligibility in writing and exposes a
   sandbox with durable event IDs and the required refund/release semantics.
3. One rail-reservation and settlement ledger is live for Stripe first, with race, replay,
   retry, refund, return and payout tests.
4. The conditional-settlement specification and implementation receive independent security
   review/audit; deployment source and parameters are publicly verifiable.
5. No Cambridge backend or developer-controlled wallet can move a collector's funds.
6. Release/refund/freeze roles are least-privilege, multisig where applicable, observable,
   time-bounded and recoverable; emergency actions cannot become arbitrary withdrawal.
7. Terms state who the payment/custody counterparty is, fees and FX source, gas liability,
   finality/reorg rules, inspection window, refund route, dispute evidence and remedies.
8. Monitoring detects stuck authorizations, late deposits, reorgs, duplicate events, balance
   divergence and failed release/refund; an incident runbook has been rehearsed. Deployment-edge
   controls reject abusive challenge/verification traffic before it reaches Auth.js, PostgreSQL,
   local cryptography, or RPC.
9. A capped, invite-only, geographically bounded test is separately approved before any
   expansion.
10. A reviewed retention/cleanup schedule replaces account-lifetime challenge and attempt
    storage, and the public privacy notice names the final RPC processor and transfer safeguards.
11. The storefront authentication dependency is upgraded past the currently audited Auth.js
    advisories and the production dependency audit has no unresolved critical/high finding in
    the wallet, authentication, settlement, or custody path. The present workspace audit is a
    known baseline failure; the newly added `viem` paths produced no advisory finding.

Until then, `CRYPTO_ESCROW_MODE=testnet` exposes only the no-value model. Checkout remains
hard-disabled by code.
