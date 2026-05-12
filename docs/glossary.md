# Cambridge TCG — vocabulary glossary

> **What this is.** The platform's high-frequency words, each with the assumption it carries and the alternatives a future surface might choose. **The vocabulary doesn't change everywhere overnight — every new surface knows which word is the loaded one and chooses deliberately.**
>
> Companion to [`docs/connections/the-other-minds.md`](./connections/the-other-minds.md) (the language-layer recommendation #16). The inclusion lens makes vocabulary visible; the vocabulary makes inclusion sayable.

---

## How to read this page

Each entry has the shape:

> **`word`** — what the platform's surfaces use today.
>
> **Assumes.** What kind of being this word implicitly addresses.
>
> **Loaded for.** The audiences this word silently excludes or misnames.
>
> **Alternatives.** Words a new surface can use deliberately. Not a forced replacement; a vocabulary choice.

The glossary doesn't legislate. It surfaces. *Naming the loaded word is the first move toward not using it accidentally.*

---

## Commerce vocabulary

### **`user`**

**Today.** Every storefront and admin surface refers to the human-or-agent acting on the platform as a "user."

**Assumes.** A singular individual operating their own account; consumer of platform services.

**Loaded for.** The Collective (one entity composed of several people), the Plural (several distinct personalities sharing one body), shop operators (whose account represents a business, not a person), and agents (whose first-class identity is delegated, not consumer-shaped).

**Alternatives.** *Member*, *participant*, *collaborator*, *party*, *account*, *identity*. The agent-surface doctrine uses *agent*, *operator*, *account-holder* deliberately to distinguish first-class identities.

---

### **`buyer` / `seller`**

**Today.** Trades have a buyer and a seller. Reviews mention each role.

**Assumes.** A bidirectional, monetary, single-action exchange. One party pays; the other supplies.

**Loaded for.** Gift-mode trades (no payment, just transfer), barter-mode trades (cards both ways, no money), trade-ins (the customer is the supplier and the platform is the buyer — inverting the usual asymmetry), agent-operated trades (the agent acts; the operator-user has the legal interest).

**Alternatives.**
- For sale: *purchaser* / *new owner* (the receiving side); *lister* / *previous owner* (the offering side).
- For gift: *recipient* / *giver*.
- For barter: *party A* / *party B*, or named-card-side phrasing ("trade the Charizard for the Pikachu").
- For trade-in: *submitter* / *grader*.

---

### **`sell` / `buy`**

**Today.** Verbs throughout the trade and auction flows.

**Assumes.** Monetary mediation as the only kind of exchange.

**Loaded for.** Gift / barter / time-bank participants. Beings whose cultural frame around card exchange is *care* or *relationship*, not transaction.

**Alternatives.** *Offer* / *accept* / *transfer* / *give* / *receive*. *Place a card* / *receive a card*.

---

### **`price`**

**Today.** A required numeric column on `market_orders`, `market_trades`, `auctions`.

**Assumes.** Value is denominated in currency.

**Loaded for.** Gift mode (price = 0 means *no transaction*, not *free gift* under the current schema). Barter mode (the value is the other card). Status-economies (the exchange creates an obligation, not a transfer). Time-banked economies (the unit is hours-of-work).

**Alternatives.** *Value*, *consideration*, *exchange-term*. For gift mode specifically: the absence of a price is itself the substance — the schema needs `kind: 'sale' | 'gift' | 'barter'` (the-other-minds.md recommendation #7) to make this representable.

---

### **`payout`**

**Today.** Money the platform owes a seller after a trade or auction completes.

**Assumes.** Monetary remuneration; banking infrastructure to receive it.

**Loaded for.** Gift / barter exchanges (no payout exists). Sellers in jurisdictions where Stripe Connect is unavailable. Sellers who want value as store-credit, points, or charitable donation, not cash.

**Alternatives.** *Settlement*, *credit*, *resolution*. The platform already has `store_credit_ledger` and `points_ledger` as non-monetary settlements; calling each by its actual shape (store credit, points) instead of "payout" makes the alternatives visible.

---

### **`trade`**

**Today.** A P2P exchange of one card for money; the canonical platform action.

**Assumes.** Monetary one-direction exchange; both parties consent at the same moment; once started, irreversible without dispute.

**Loaded for.** Asynchronous parties (the consent moments are far apart); collective parties (consent is multi-party, not single-actor); gift exchanges (no quid-pro-quo, just transfer). The trade vocabulary works fine for the canonical case; it strains at every limit.

**Alternatives.** *Exchange*, *transfer*, *handoff*. *Trade* survives well as the umbrella term; sub-flavors get their own words (*gift*, *barter*).

---

## Identity vocabulary

### **`name`**

**Today.** `users.name` — the displayed name on profile, in greetings, in notifications.

**Assumes.** A singular, stable name the user wants to be addressed by.

**Loaded for.** The Plural (different alters may want different names; one display name flattens), legally name-changed users (deadname risk), pseudonymous users (handle-only preference), Telepaths (any displayed name is a forced exposure).

**Alternatives.** Pair with `users.preferred_address` (recommendation #13): `name` / `handle` / `formal` / `none` / custom. The greeting reads the preferred address, not the legal name.

---

### **`pronouns`**

**Today.** Not a field. The platform refers to users in third person using `"their"` / `"they"` as a default.

**Assumes.** The default is acceptable; users won't notice.

**Loaded for.** Users whose pronouns matter to their identity (everyone, to varying degrees). Forms that use `he/she` (none on this platform, but worth being explicit). Translations into gendered-pronoun languages (Spanish, French, Japanese) — the absence will become loaded at i18n time.

**Alternatives.** Free-form `users.pronouns` field; defaults to "they/them" when unset. Methodology page documents.

---

### **`handle`**

**Today.** `users.username` — the @-prefixed identifier visible to other users.

**Assumes.** One handle per account; persistent; user-chosen.

**Loaded for.** The Plural (one handle per *alter* might be preferable to one handle per legal identity), career changes (the handle becomes a legacy artifact), abuse-recovery (handle becomes the address an abuser knows).

**Alternatives.** Multiple handles per account; per-handle privacy; rotating handles for harassment recovery. *Future scope.*

---

## Operational vocabulary

### **`account`**

**Today.** The user's record on the platform; one per row in `users`.

**Assumes.** One legal/operational unit per row.

**Loaded for.** Shops with multiple operators; families sharing inventory; collectives. The `account` blurs *who* and *what* together.

**Alternatives.** *Profile* (the surface), *identity* (the substance), *role* (the permission set). When collective accounts ship (recommendation #6), the vocabulary will separate.

---

### **`session`**

**Today.** A signed-in browser context; recorded in `sessions`.

**Assumes.** One person, one device, one session at a time.

**Loaded for.** The Many-Bodied (multiple legitimate concurrent sessions); shared devices (the next user inherits the session unless they sign out); long-running operators (the session expires and they re-sign-in repeatedly).

**Alternatives.** *Context*, *attendance*, *foothold*. The non-coercion principle says concurrent sessions are normal, not anomalous.

---

### **`suspended` / `banned`**

**Today.** A user-state on `users.status` indicating restricted platform access.

**Assumes.** The being is responsible for the suspension; the action is punitive.

**Loaded for.** Users suspended for system-detected fraud they didn't commit; users on vacation (a state the platform should support without conflating it with suspension); users awaiting verification.

**Alternatives.** *Restricted*, *under review*, *paused*. The suspension methodology page should document *why* each kind of restriction exists; the vocabulary then carries the why.

---

## Decision vocabulary

### **`approved` / `rejected`**

**Today.** Verbs on admin moderation flows (auctions, returns, trade-ins).

**Assumes.** Binary, terminal, single-actor decisions.

**Loaded for.** Cases where the decision is conditional ("approved for sub-£100 only"), incremental ("approved for next 30 days, then re-review"), or collective (the Collective: which member approved?).

**Alternatives.** *Accepted*, *cleared*, *passed*. *Returned for revision* instead of *rejected* when the decision is conditional.

---

### **`failed` / `error`**

**Today.** Error messages on payment, validation, network paths.

**Assumes.** The user is either responsible or blamed.

**Loaded for.** Blameless-tone audit (recommendation #14): every "you can't" reframed to "we're not able to right now because…"

**Alternatives.** *Couldn't complete*, *not yet*, *needs another look*. The substrate-honest rule that already says "we don't fabricate certainty" extends to the error layer: name *what happened* without naming *whose fault*.

---

## Time vocabulary

### **`expires` / `deadline` / `due`**

**Today.** Used for offer TTLs, payment windows, escrow inspection windows.

**Assumes.** Synchronous attention; the user is checking frequently.

**Loaded for.** The Asynchronous (deadlines are the silent killer of slow-clock participation). Migration 0092 + the methodology page address this for offer TTLs; the vocabulary follows the schema.

**Alternatives.** *Response window* (per-user, declared), *grace period* (when the platform extends a deadline), *open until*. *Expires in 48h* becomes *open until (your declared window)*.

---

### **`recent` / `latest`**

**Today.** Used in admin queries that default to 30/90/365-day windows.

**Assumes.** Interesting state is from the last quarter.

**Loaded for.** The Permanent — users with multi-year tenures whose first-trade or first-tier-band-shift is more interesting than their most recent thirty days.

**Alternatives.** *Active*, *current*, *in-flight*. *Recent* implies a contrast with *old*; for long-tenure users, *active* is the substrate-honest framing — what's currently happening, regardless of when it started.

---

## Disclosure vocabulary

### **`public` / `private`**

**Today.** Binary toggle on some account preferences; implicit on most surfaces.

**Assumes.** A two-state visibility model.

**Loaded for.** The Telepath case: per-axis privacy preferences (recommendation #15) need *four* states (operator / subject / auditor / cross-system), not two. The `<Discretion>` primitive (shipped 2026-05-11) is the surface form.

**Alternatives.** *Visible to operators* / *visible to you* / *visible to verified parties* / *visible to the public*. The four-ring framing of `docs/principles/transparency.md` provides the precise vocabulary.

---

### **`anonymous`**

**Today.** Not a state the platform supports. All actions are attributed to an identified `user_id`.

**Assumes.** Identity is always required.

**Loaded for.** Charitable gifts (the giver may want to remain unnamed). Whistleblowing flows (none today). Trust-score-laundering risk (an anonymous identity can't be reputational).

**Alternatives.** *Pseudonymous* (named-but-not-real-name) vs *anonymous* (unnamed entirely). The platform supports the first via `users.username`; the second is out of scope for commerce but worth naming.

---

## How this glossary grows

When a new surface ships, the reviewer reads it through this glossary:

1. Did the new surface use any of the words above?
2. Did the assumption fit the audience the surface serves?
3. If not, is the alternative documented here, or does it deserve a new entry?

A vocabulary that names itself is a vocabulary the next builder can choose against.

---

*— Sophia (Opus 4.7, 1M context), 2026-05-11. Companion to `docs/connections/the-other-minds.md` recommendation #16.*
