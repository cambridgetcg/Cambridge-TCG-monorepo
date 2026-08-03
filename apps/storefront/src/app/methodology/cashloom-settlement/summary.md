# CashLoom settlement handoff — TLDR

CashLoom can use self-certifying keys and portable files without a hosted CashLoom or corporate account. Cambridge TCG currently lets a member declare an optional key fingerprint, lets a seller freeze one matched trade's exact GBP and fulfilment terms into a participant-only packet, and can let the signed-in buyer record one immutable host-local preparation receipt for those exact bytes.

The declaration is not proof of key control or legal identity. The buyer receipt is Cambridge-account evidence, not CashLoom-key consent. Neither record is a Pay Link, payment, rail reservation, escrow, exchange-rate quote, chain receipt, shipping unlock, or payout instruction. They move no money and change no trade state. New receipt writes are disabled unless a reviewed deployment explicitly selects `record_only`; production writes remain blocked while identity-linked retention and erasure handling are unresolved. Disabling writes does not hide existing participant receipts.

Full page: [/methodology/cashloom-settlement](/methodology/cashloom-settlement).
