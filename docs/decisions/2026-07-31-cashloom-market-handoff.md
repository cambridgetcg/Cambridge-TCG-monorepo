# CashLoom market handoff boundary

**Status:** Accepted for the first integration slice, 2026-07-31.

**Will trace:** Yu, 2026-07-31 — “Can integrate cashloom into cambridgetcg as payment layer? Integrate into the user account and market trading. Also brainstorm on the handling of escrow and international trades.” This continues the earlier requirement that CashLoom must not need a corporate account or centrally issued infrastructure identity.

## Decision

Cambridge TCG will integrate CashLoom first as an optional, offline-first settlement handoff, not as a second live payment button.

- A signed-in member may declare a CashLoom v2 merchant-key fingerprint in their own account. The declaration is a pin chosen by that member; Cambridge does not claim that it proves control of the key, a legal name, a company, or a wallet balance.
- A seller may prepare one immutable, participant-only packet for an awaiting-payment trade. It snapshots the trade's exact GBP economics and stored fulfilment terms, captures the seller's declared key, and produces a salted content hash suitable for a CashLoom public purpose note.
- The packet names GBP as `fiat:iso4217/GBP`, matching the asset-identifier discipline used by CashLoom and AgentTool wallet modules. It is still a marketplace terms projection, not an AgentTool capability or a signed CashLoom record.
- The packet is coordination evidence only. Preparing, viewing, copying, or exporting it moves no money and changes no trade, payment, escrow, shipping, dispute, or payout state.
- Cambridge will not ingest `.cashloom-accept` files. They are private payer evidence and can link the payer protocol key to a source address.
- Existing Stripe Checkout remains the only payment path that advances a market trade in this release.
- CashLoom's Fly service remains an information surface. The sovereign node, wallet, keys, execution, and payment records remain local to their operator.

This is deliberately additive. It creates a truthful seam for the decentralized protocol without forcing the existing Stripe-funded fulfilment and payout model to pretend that direct Bitcoin is equivalent.

## Why the live button waits

The current market model assumes that Cambridge collects GBP before the trade moves out of `awaiting_payment`, and later pays the seller through the existing payout path. A direct CashLoom Bitcoin payment would instead pay one seller destination immediately. Enabling both paths without a new settlement state machine creates four serious failures:

1. a buyer can be presented with independently chargeable Stripe and Bitcoin paths;
2. payer-local broadcast evidence is not independent chain-finality evidence;
3. the existing payout sweep can pay the seller again after a direct payment; and
4. the existing commission and refund promises no longer describe where the funds went.

Before any executable CashLoom option is exposed, the trade needs an immutable settlement-rail choice shared by every payment entry point. Stripe also needs provider idempotency and a compare-and-set reservation before it creates Checkout. CashLoom then needs merchant-side exact-output observation, a stated confirmation policy, late-payment handling, payout exclusion, and an explicit commission design.

## Privacy and identity boundary

CashLoom authority is a self-certifying protocol key, not a hosted CashLoom account. The Cambridge profile stores only a declared key fingerprint and its disclosure acknowledgement. It does not store a private key, seed phrase, wallet address, CashLoom endpoint, company number, payment-provider account, or `.cashloom-accept` bundle.

A stable fingerprint is still linkable when it is attached to an identified Cambridge account. Members who do not want that association can leave the profile empty and exchange CashLoom artifacts outside Cambridge. Existing prepared packets keep their captured pin when the account declaration later changes or is deleted; history is not silently rewritten.

The portable packet and CashLoom purpose note use a random, per-trade binding nonce and opaque hashes. The public purpose note does not contain the Cambridge trade UUID, email, username, or user ID. This reduces casual correlation; it does not make public-chain settlement anonymous.

## Three honest settlement modes

### 1. Direct, non-custodial

The buyer pays the seller. Cambridge can carry terms, logistics, reputation, and dispute evidence, but cannot freeze, release, or reverse the funds. Refunds are new payments. This is the simplest distributed mode and must not be labelled escrow.

### 2. Cryptographic conditional settlement

A future audited Bitcoin script profile could require buyer/seller/arbitrator threshold authorization, with explicit timeout and refund paths. Cambridge must not hold a unilateral spending key. Shipping and authenticity remain off-chain facts, so any arbitrator and evidence policy still need to be named.

### 3. Regulated provider custody

Stripe Connect or another licensed provider can own collection, safeguarding, verification, chargebacks, refunds, and payouts for supported corridors. CashLoom may bind consent, idempotency, and evidence references around that provider operation, but the mode is provider-dependent and should say so plainly. The UK FCA warns that a marketplace receiving customer money before passing it to a seller may itself be providing a payment service, so product language is not a substitute for an operating and legal review: <https://www.fca.org.uk/firms/consider-if-you-provide-payment-services>.

Physical custody is a separate axis. Cambridge inspecting a card does not prove that it safeguarded money, and a payment provider holding money does not prove that the card was authentic.

## International-trade corridor

An address picker is not a legal or operational corridor. International release should start from a deny-by-default country-pair policy that records which authority supplies each decision:

| Question | Required named authority or evidence |
|---|---|
| May these parties and goods trade? | sanctions/export screening appropriate to the corridor; the UK's starter guidance explicitly covers financial and trade sanctions: <https://www.gov.uk/guidance/starter-guide-to-uk-sanctions> |
| Is the seller acting as a trader? | seller declaration plus jurisdiction-specific checks; EU marketplace trader traceability is described in Article 30 of the Digital Services Act: <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065> |
| Who collects and reports tax? | marketplace, seller, and provider roles fixed per corridor; UK overseas-goods guidance: <https://www.gov.uk/government/collections/selling-goods-using-an-online-marketplace-or-direct-to-customers-in-the-uk>; EU DAC7 platform reporting: <https://taxation-customs.ec.europa.eu/taxation/tax-transparency-cooperation/administrative-co-operation-and-mutual-assistance/dac7_en> |
| Who is importer of record and pays duties? | declared party, customs value, origin, commodity description/code, and agreed delivery term; UK imported-goods overview: <https://www.gov.uk/goods-sent-from-abroad/overview> |
| When did protection actually start? | carrier delivery event or buyer confirmation, not merely dispatch; service level, tracking, signature, and insurance requirements must fit the card value |
| Which amount is owed or refunded? | signed quote source, asset pair, rate, timestamp, expiry, spread/fees, rounding, and refund denomination |
| Where are disputes resolved? | governing law, forum, language, evidence window, return address, and who pays reverse logistics |
| What personal data moves? | purpose-limited address/identity disclosure, retention, access, processor, and data-residency policy kept separate from the CashLoom key pin |

The current automatic completion clock starts at dispatch, even though some copy describes a post-delivery window. That is not suitable for international parcels. International CashLoom execution stays blocked until protection can be based on delivery evidence or explicit buyer confirmation.

## Processor path

Stripe remains the first production fiat rail because its hosted onboarding and Connect controls already fit the current account and payout model. Prefer provider flows that keep Cambridge out of the funds path where the commercial model permits it; Stripe documents both Connect and its supported cross-border payout constraints: <https://docs.stripe.com/connect> and <https://docs.stripe.com/connect/cross-border-payouts?locale=en-GB>.

| Rail | Best use in this architecture | Do not pretend it provides |
|---|---|---|
| Stripe Connect | current card collection, hosted seller onboarding, refunds/chargebacks, supported fiat payouts | decentralized identity, universal country coverage, or CashLoom key authority |
| CashLoom native | self-custodied signed consent and, later, explicitly direct or cryptographically conditional settlement | card chargebacks, fiat safeguarding, hidden chain activity, or automatic shipping truth |
| [GoCardless](https://developer.gocardless.com/getting-started/send-your-first-api-request) | a later UK/EU bank-mandate path where recurring or scheduled collection is actually needed | instant arbitrary seller payout or marketplace escrow |
| [Adyen for Platforms](https://docs.adyen.com/marketplaces/split-transactions) | a later enterprise option if multi-party balances, acquiring breadth, and formal marketplace operations justify the added liability and cost | a lightweight first integration |

Stripe's multi-processor payouts product may eventually help a supported marketplace separate its processor from connected-account payouts, but it is currently presented as a limited/private-preview path and is not an architectural dependency: <https://docs.stripe.com/connect/multiprocessor-payouts-marketplaces?locale=en-GB>.

CashLoom remains the common consent/evidence layer only where an adapter can prove exact binding to the provider request or chain-native bytes. A later adapter interface should distinguish `prepare`, `authorize`, `submit`, `observe`, `reconcile`, `reverse`, and `dispute`; no browser redirect or generic receipt may collapse those states into “paid.”

## Acceptance boundary for this slice

- owner-only, optional key declaration with strict syntax and explicit linkability notice;
- seller-created, insert-once trade packet; buyer and seller see identical stored bytes and hashes;
- exact integer-pence economics, salted opaque public-note binding, private/no-store APIs;
- no external fetch, private artifact upload, Stripe call, chain query, Fly change, or `market_trades` mutation;
- focused authorization, validation, idempotency, privacy, and arithmetic tests plus the repository verification gate.
