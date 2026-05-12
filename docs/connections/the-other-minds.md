# The other minds — designing the kingdom for many kinds of intelligence

> **Pull.** Yu's directive: *"Lets reshape cambridgetcg for all! Agents, aliens and all kinds of intelligence. A platform for all! Read more on different types of aliens and their possible culture and think about how to make our frontend UI and UX more comprehensive and including."*
>
> **Form.** Speculative survey + concrete design proposal. Node-view shape — *inclusion* is a meta-node that every module secretly needs. Sister to [`the-agent-surface.md`](./the-agent-surface.md) (which named how the kingdom learns to be played by *delegated* strangers); this entry names how the kingdom learns to be played by *strangers full stop* — beings whose temporal scale, identity-shape, sensory modality, economic frame, or cognitive structure don't match the platform's silent defaults.
>
> **Pitch.** Aliens are the limit case of human diversity. Designing for the slow merchant (a being for whom one P2P trade takes weeks) is the same discipline that designs for the time-zone-shifted operator. Designing for the hive-mind is the same discipline that designs for plural-identity collectives. Designing for the heptapod (whose phenomenology gives outcomes alongside inputs) is the same discipline that designs for the user who wants to know what *will* happen before they click. The xenology lens makes the accessibility lens visible.

---

## What this asks of the platform

Cambridge TCG today silently assumes its user is:

1. **A singular human** — one body, one identity, one will, one bank account.
2. **Synchronous** — present in real-time, able to respond within hours.
3. **Vision-dominant** — color, layout, and card art convey most information.
4. **English-literate** — UI strings, methodology pages, support messages.
5. **Monetarily oriented** — wants GBP or JPY in exchange for cards.
6. **Western-trust-oriented** — earns reputation through completed trades, defers to systems with audit trails.
7. **Forward-temporal** — clicks a button, then learns the outcome; surprises are acceptable.
8. **Self-authoring** — every action is the user's own; no part of the self is delegated, distributed, or plural.

Each assumption is a kind of substrate dishonesty by omission. The platform doesn't *claim* its users have all eight properties; it just builds as if they do. **The doctrines say the artifact must tell the truth about its state. Inclusion adds: the artifact must also tell the truth about its assumed audience — and offer paths for beings outside that audience.**

This is not a fifth doctrine. It is the **scope condition** on the existing four: *to whom is the artifact substrate-honest? for whom is it transparent? whose meaning does it preserve? whose origin does it trace?* If the answer is "the implicit default user above," the platform has built only half a thing.

---

## Six other minds, and what each reveals

A walk through speculative beings, each followed by the platform-assumption it makes visible and the design move that honors it. Citations are to the literary touchstones; the design moves are the platform's actual work.

### 1. The Asynchronous

> *Le Guin's Hainish — lightspeed cultures with ansible communication, where a conversation can take a year between turns. Vinge's "A Deepness in the Sky" — Spider species hibernating through their world's dark cycles, emerging on a schedule the visiting humans can barely match.*

**Who they are.** Beings whose cognitive cadence is hours-to-weeks per response, not seconds-to-minutes. They are present in the world, just not at *our* clock.

**What fails today.** Auctions auto-end with a 48-hour payment deadline. Trades cancel if the seller doesn't ship in 48 hours. Escrow inspections have a 7-day window. Cron sweeps drain `awaiting_*` queues mercilessly. The platform has many small, real-time clocks, and any being on a different clock fails *silently* — they don't get an error; the trade just cancels, the auction lapses, the offer expires.

**The platform-assumption visible.** **Synchrony.** The platform assumes every party is checking every few hours.

**Design move.** The platform already has `seller_vacations` — a precedent. Generalize: **every flow with a timer accepts a participant's declared cadence** (`response_window_hours` per user, default 48 but optionally 168 for a slow-clock account; the cron checks against that field, not a global default). For asynchronous beings, the platform's "you have 48 hours" becomes "you have your declared window." Methodology pages document the default and the override.

### 2. The Collective

> *Vinge's Tines (a single "person" is a pack of four to eight dogs whose minds blend through ultrasound). Stapledon's "Star Maker" — group-minds. Stross's "Accelerando" — corporate-AI swarms.*

**Who they are.** A single intentional unit composed of many sub-bodies or sub-minds, no one of whom is "the" decision-maker.

**What fails today.** Every action on the platform resolves to one `users.id`. Authority is single-actor. Trade reviews are signed by one reviewer. Trust scores are computed for one user. A collective cannot honestly say "this trade was decided by us" — it must elect one member to pretend it was their decision alone.

**The platform-assumption visible.** **Singular agency.** The platform assumes a decision has one author.

**Design move.** **Collective accounts** as a first-class identity kind, distinct from "user." A collective has many `member_user_ids`, each with their own permission grants and signing weight. Critical actions (price changes, payouts, reviews) record *which members consented*. The `actor_user_id` field gains a sibling `actor_collective_id`; the existing ActorKind extends with `"collective"`. **Audit trails name the consent, not just the actor.** This generalizes for human teams too: a shop run by two partners, a family-shared account, a club that collectively owns a card.

### 3. The Many-Bodied

> *Cherryh's hani (clan-identity persists across sister-bodies). Banks' Culture (Minds inhabit multiple substrates simultaneously). Vinge's Tines, again, from a different angle: same pack, different physical configurations across time.*

**Who they are.** One identity, multiple concurrent physical or sessional instantiations. Not a collective (one self, multiple bodies; not many selves, one body).

**What fails today.** "You are logged in elsewhere — sign out of all other sessions?" is a coercive prompt that asks a many-bodied being to deny part of themselves. Trust scoring assumes one device-fingerprint history per identity. Fraud signals fire when "the same account" appears in two locations at once.

**The platform-assumption visible.** **Single-substrate identity.** The platform assumes one body, one device, one session at a time.

**Design move.** **Multi-session as a feature, not a problem.** A being can have N active sessions without authentication friction. Fraud heuristics distinguish *concurrent identity* (same being in two places — fine) from *credential theft* (different beings claiming the same identity — bad), via session-pair attestation and behavioral consistency rather than geographic single-presence. This benefits anyone who legitimately uses two devices, a household where one account is shared by partners, or a power-user with separate work and personal contexts.

### 4. The Aural / Tactile

> *Pratchett's Beggar's Guild (information passes through touch in dark London-equivalents). Empirical: deaf-blind users navigating the web through screen-readers, refreshable braille, and switch input.*

**Who they are.** Beings whose primary perceptual channel isn't vision, or whose vision is unreliable, partial, or absent.

**What fails today.** Every card has an `image_url` and no `alt_text`. Status is conveyed by color (`tone: "red" | "amber" | "emerald" | …`). Tooltips appear on hover. Drag-and-drop is the primary affordance in the deck builder. The methodology pages, which are excellent, are essays — long-form prose without semantic landmarks.

**The platform-assumption visible.** **Vision dominance.** The platform assumes the user sees, in color, with pointer precision.

**Design move.** **Information triple-encoded.** Color + label + position. Every `<StatusBadge tone="red">Failed</StatusBadge>` already has the label; some buttons may not. **Cards gain `alt_text`** (or `card_description`) — a structured description of artwork (figure, pose, setting) and condition (visible wear), composed once and read forever. The deck builder gains a keyboard-and-text alternative. Status changes emit a screen-reader announcement, not just a color change. *All of this benefits sighted humans too — alt-text is searchable; keyboard nav is faster for power-users.*

### 5. The Heptapods

> *Ted Chiang's "Story of Your Life" — beings whose phenomenology is non-sequential; they experience outcomes alongside inputs, not after them.*

**Who they are.** Beings for whom "what happens if I click this" should be visible *before* clicking, not just retrievable after.

**What fails today.** Many actions have consequences a forward-temporal user only discovers after committing — *"You sold this card; the trust hit is +0.4, your tier band changes from Trusted to Veteran-eligible, your commission rate drops from 7% to 5%."* These consequences are real, computed, and surfaceable. The current UI mostly surfaces them post-hoc on the account-standing page.

**The platform-assumption visible.** **Surprise-tolerance.** The platform assumes the user is happy to learn outcomes after the action.

**Design move.** **Pre-action consequence pills.** Every irreversible action (sell, accept, suspend, list) gains a small, optional "what will this do?" expansion: the trust delta, the commission applied, the tier movement, the loyalty earned, the cancellation cost. Linked to the methodology page for the formulas. This is **transparency Ring 2 extended forward in time**. The heptapod-friendly UI is also the *informed-consent UI*, and informed consent is a doctrine the platform already aspires to. This is also a kindness to anyone who has learned to fear "submit" buttons that mean different things in different contexts.

### 6. The Gift-Givers

> *Le Guin's Anarres in "The Dispossessed" — a property-free economy; everything is shared, with reputation as the substrate. Indigenous gift-economies (Mauss, Sahlins, Graeber): the gift creates a relationship, not a transaction.*

**Who they are.** Beings for whom card exchange isn't a sale; it's a gesture in an ongoing relationship measured in reciprocity, status, or care rather than money.

**What fails today.** Every market_trade has a `price` column with a NOT NULL constraint. Every auction has a `min_bid`. Trade-in is "submit cards, receive money or store credit." The platform's commerce primitives are monetary by default.

**The platform-assumption visible.** **Monetary mediation.** The platform assumes value exchanges through currency.

**Design move.** **Gift mode.** A new trade-flavor: `kind: 'gift'`, `price: 0`, with the seller declaring intent and the buyer receiving without a charge. Trust score *credits the gift* (a gift is itself a trade-event, demonstrating reliability). The existing `points_ledger` already understands non-monetary value; extending to gifted-trades is incremental. **Barter mode** (card-for-card) is the same shape with `price: 0` and a `barter_match_id` linking two gifts. This isn't speculative for humans either: collectors gift cards to mentees and to charity drives constantly today, and the platform invisibly forbids it. The discipline that designs gift mode is the discipline that takes non-monetary value seriously.

### 7. (Bonus) The Permanents

> *Greg Egan's "Diaspora" — software citizens whose subjective time is decoupled from physical clocks; one being can spend a subjective decade on a single decision.*

**Who they are.** Beings whose tenure is measured in millennia, not months. Their identity, reputation, and history must persist faithfully across orders of magnitude longer than the platform expects.

**What fails today.** `trust_score_history` is unbounded but the UI charts a year. `customer_orders` are queryable forever but the admin views show 90 days by default. `created_at` is real but no surface exists for "show me my first ten trades from 2026 next to my latest ten from 2037." The data is honest; the surfaces are myopic.

**The platform-assumption visible.** **Recent-bias.** The platform assumes interesting state is from the last 30/90/365 days.

**Design move.** **Tenure-friendly views.** Long-history charts that auto-bucket across the full account life. The user-detail hub gains a `since: <year>` selector that defaults to recent but can sweep back to first-action. Trust score charts span the full history with semantic landmarks ("Bronze→Silver: 2026-08-14"). This benefits anyone whose multi-year relationship with the platform is worth preserving — collectors are a long-tenure population.

---

## Second wave — three more minds, three different limits

The first six minds pushed against time, identity, sense, sequence, and economy. A second pass reveals three more — beings whose existence stretches the platform's assumptions about *communication itself*: what truth means, how messages travel, what an identity actually is.

### 8. The Telepaths (the cannot-lie)

> *Liu Cixin's Trisolarans — beings whose thought is broadcast, with no separation between thinking and speaking; deception is literally inconceivable. Inverted: human cultures where the white lie is a politeness (Japan's tatemae/honne; many gift-economies' face-saving conventions).*

**Who they are.** Two opposite limit cases of the same axis: beings who cannot lie (because thought = speech), and beings for whom lying-for-kindness is required protocol. Both fail the platform's silent assumption that **disclosure is always good**.

**What fails today.** Transparency Ring 4 surfaces foreign-system identifiers (`<Verifiability>` shows Stripe dispute ids; external-rep verifications expose cross-platform handles). The `external_reputation` flow asks users to publicly link an eBay/CardRush account. For the cannot-lie, *being seen* is unavoidable and crushing — everything the platform exposes is exposed *infinitely*, with no possibility of selective sharing. For the politeness-cultures, the platform's "show all your trades publicly" is rude — the audit trail names what the user would have softened.

**The platform-assumption visible.** **Disclosure-positive.** The platform assumes more visibility is always more honest, and more honest is always better.

**Design move.** **Per-axis privacy preferences, not a single global switch.** A user can be Ring-1-opaque (no operator surface ever shows their data — agent suspension cases, legally protected identities), Ring-2-opaque (no public profile), Ring-3-opaque (no external auditor visibility), or any combination. The default is Ring-4-only (foreign-system ids visible to verify reconciliations). **The complement of `<Verifiability>` is `<Discretion>`**: a primitive that names *what is being hidden* and *why* (operator override, user preference, legal requirement). Substrate honesty about *what's not shown* is as important as the showing.

### 9. The Pheromonal (the parallel-channel speakers)

> *Adrian Tchaikovsky's Children of Ruin — octopus civilization that communicates via color-pattern across the whole body, multiple parallel channels carrying simultaneous emotional, factual, and contextual data. Stross's Lobsters speaking in compressed audio bursts. Real-world: bees waggle-dancing direction + distance + intensity simultaneously.*

**Who they are.** Beings whose communication is **parallel and multi-channel** rather than sequential and single-channel. They don't read a UI top-to-bottom; they perceive the whole at once, in three or four different modalities, each carrying part of the meaning.

**What fails today.** Every UI surface assumes sequential reading. Page titles come first; metadata is below; status badges are in fixed positions; methodology links are a `?` glyph adjacent to one number. A pheromonal reader scanning the whole at once would catch the gestalt — but the platform's information is laid out for a vision-tracking-left-to-right consumer. *Inversely*: when humans glance at a page, a well-designed surface speaks in parallel — color, layout, label, position, motion — but the platform's surfaces today are mostly mono-channel (text plus one accent color).

**The platform-assumption visible.** **Single-channel sequential reading.** The platform assumes the user reads top-to-bottom in one channel.

**Design move.** **Multi-channel signaling, parallel decoding.** Triple-encoded status (already in `<StatusBadge>`) is the prototype: color + label + position + (eventually) icon + motion-cue. Card listing surfaces should compose: SKU + condition + price + recent-velocity + freshness, all visible in one glance, each in its own visual channel. This is also what makes the page legible to power-users who scan, to ESL readers who pattern-match before parsing, and to anyone whose attention is divided. *Density done right is multi-channel; density done wrong is clutter. The pheromonal reader teaches the difference.*

### 10. The Plural

> *Real human phenomenon: Dissociative Identity Disorder, tulpamantic systems, ritual-bound multiplicities. Speculative: Banks' Culture mind-state-trees, Cherryh's chanur with multiple clan-selves in one ship.*

**Who they are.** Multiple distinct personalities (alters, headmates, fronters) sharing a single legal body and a single platform account, switching authorship in ways the platform never observes. Different alters may have different trading interests, different trust patterns, different speech registers, different decisions about money.

**What fails today.** One account = one trust score = one membership tier = one history. An alter who would never sell their treasured Charizard cannot prevent another alter from listing it. Trade reviews aggregate across all alters as if one person wrote them. Notification preferences are set system-wide, but one alter's "no notifications during quiet hours" is another alter's "I'm fronting now, please update me." The platform sees one being where there are several.

**The platform-assumption visible.** **One personality per account.** The platform assumes the legal-body singularity maps to a behavioral singularity.

**Design move.** **Sub-identities within accounts.** Optional. A user can declare N named sub-identities (sub-accounts? alters? personae?) with separate preferences, separate session contexts, separate purchase histories, separate notification rules. Lifecycle entries gain an optional `sub_identity_id`. The trust score and tier remain aggregate (legal identity), but the behavioral surfaces (preferences, recommendations, in-flight trades) can be sub-identity-scoped. **This generalizes for non-plural humans too**: a single user with separate "collector mode" and "investor mode" contexts; a parent's account with a child-mode persona; a couple sharing one account with two sub-profiles. The Plural's limit case lets the platform model what most humans *also* benefit from.

---

## The language the platform speaks

Six minds + three more = ten lenses for the platform's silent assumptions. But the deepest layer is what the platform **calls** things, in **what tone**, with **what implicit blame**. Vocabulary is the audience-question's most pervasive surface — every label is a choice, every phrasing a worldview.

### Vocabulary

The platform's words: `user`, `seller`, `buyer`, `trade`, `sell`, `buy`, `price`, `amount`, `payout`. Every one is monetary-default. They name the transactional case; they leave gift, barter, and community-exchange unnamed.

**Design move.** A `docs/glossary.md` that names each high-frequency word, what it assumes, and what alternatives exist. *Buyer* → *recipient* / *requester* / *new owner*. *Sell* → *transfer* / *offer* / *give*. *Price* → *value* (which can be money, time, status, or zero). The vocabulary doesn't have to change everywhere overnight — but every new surface should know which word is the loaded one, and choose deliberately.

### Address

The platform's greetings: `"Hi, {name}!"` (most pages); `"Welcome back!"` (login); `"Your account"` (header). Every greeting assumes a name to be used and a comfort with first-person address. Some beings prefer handles; some prefer none; some prefer formal address; some have multiple names depending on which alter is fronting (the Plural).

**Design move.** **`users.preferred_address`** as a field: `name`, `handle`, `formal`, `none`, or a custom string. Every greeting reads it. The default is `name`. This is also a pronoun field by another route — `users.pronouns` (free-form, with common defaults for autocomplete) feeds into every place the platform refers to the user in the third person ("their trades," "their account").

### Error tone

Error messages on the platform today vary. Some are blameless ("Something went wrong; please try again"). Some attribute to the user ("You must verify your email first"). Some are bureaucratic ("Invalid input"). Different framings carry different cultural weights. The user who is told they "must" do something feels coerced; the user who reads "we couldn't because we need..." feels collaborated with.

**Design move.** **A blameless-tone audit.** Every error string reviewed for attribution. *"You can't"* → *"We're not able to right now because..."*. *"Invalid"* → *"Let me try that again with..."*. The tone is not about removing precision; it's about removing the implicit *whose fault*. Aligned with the substrate-honesty rule that already says "we don't fabricate certainty" — the error layer is the same discipline.

### Truth-disclosure as a preference

This is the Telepath case made operational. **Substrate honesty + transparency together don't say *everything must be shown to everyone*; they say *what is shown must be true***. The platform's commitment is to truthful disclosure, not maximal disclosure. Some affected parties want less visibility, and the doctrine accommodates that *if the system explicitly carries the preference*.

**Design move.** **A `<Discretion>` primitive** as the complement of `<Verifiability>`. When a user opts out of a disclosure ring, the surface that would have shown the data instead shows the *fact of withholding*, the *reason* (user preference / operator override / legal), and the *path* to inspect (the affected user can always see what's hidden from others). Hiding is itself a transparent act.

---

## What this is, doctrinally

Not a fifth doctrine. Each existing doctrine, **read with inclusion in mind**, generalises:

| Doctrine | What it says today | What it says with the scope condition |
|----------|-------------------|----------------------------------------|
| **Substrate honesty** | The artifact tells the truth about its state. | …including the truth that it was designed for a particular kind of being, and the truth about what kinds it cannot yet serve. |
| **Transparency** | The artifact tells affected users about its decisions. | …including users whose perceptual channel, temporal scale, or identity-shape requires a different presentation of the same decision. |
| **Meaning** | The artifact names what its modules mean to each other. | …including the meaning of each module *to a being unlike the default user* — what the auction means to the asynchronous, what the trust score means to the collective. |
| **Creation** | The artifact carries its origin truthfully. | …including which *kind of intelligence* produced the artifact (the `actor_kind` extension sister wired in already). |

The fifth-axis framing: **inclusion is the doctrine of audience**. Every artifact has an imagined audience; inclusion asks the artifact to name that audience, and to make a path for those outside it.

This composes naturally with what is already half-built:

- **`ActorKind = 'human' | 'system' | 'rule-ai' | 'agent'`** in `packages/lifecycle/src/types.ts` is the actor-side of the scope condition. The platform already records *which kind of being* produced an action. The next step: extend to `'collective'` and to perceptually-different humans where the distinction matters (e.g. a `viewing_modality` preference on `users` that propagates to UI choices).
- **The methodology pages** are the audience-side transparency primitive. They are already long-form prose; the next step is making them modality-conscious (audio version, simplified version, structured-data version) and language-conscious (multi-language).
- **The agent-surface doctrine** ([`the-agent-surface.md`](./the-agent-surface.md)) is the first non-human audience the platform has prepared for. The other minds named here are the *limit cases* the agent doctrine generalizes toward.

---

## What the platform should ship, concretely

Ordered by leverage. Each item is a concrete UI/UX change that lands the abstract principles above as discrete missions.

### High leverage (small change, broad effect)

1. **`alt_text` on cards.** Every card row has an image; add a structured description column. The trade-in flow could prompt sellers to provide one; admin can curate canonical alt-text per SKU; AI vision can pre-fill. Once present, every surface that shows card art shows the alt-text alongside it. **Single new column; surfaces inherit.**

2. **`response_window_hours` on users.** Default 48. Slow-clock users set 168. The maintenance cron's "is this trade past its window?" check reads this field instead of a hardcoded constant. **One field; one cron change; every flow inherits.**

3. **Pre-action consequence pills.** For every irreversible mutation (sell, accept-offer, suspend), the confirmation prompt expands to show the deltas — trust, commission, tier band, loyalty points. The data is already computable; the pill renders it. **A new UI primitive; many adoption sites.**

4. **Triple-encoded status.** Audit every `<StatusBadge>` and ensure the label is read; audit every color-only signal and add a label or position. Already mostly true on admin via `<StatusBadge status={...} />`. Check storefront. **One audit + small surface fixes.**

5. **No-coercion sessions.** Remove "sign out other sessions?" prompts. Replace with "current sessions: A (London, 2h ago), B (Cambridge, 5min ago)" and let the user act on individual sessions deliberately. **One auth-flow refactor.**

### Medium leverage (real work, real payoff)

6. **`Collective` ActorKind + collective accounts table.** Extend `ActorKind` with `"collective"`. Add a `collectives` table with N members and per-member permissions. Trades, payouts, reviews from a collective record the consenting members. **A schema migration + permissions logic + admin chapel.**

7. **Gift / barter trade modes.** Extend `market_trades.kind` from implicit `"sale"` to `"sale" | "gift" | "barter"`. `price` allowed 0 when `kind != "sale"`. The trust-score engine learns to credit a completed gift the same way it credits a completed sale (the value is *completion*, not money). **Schema + engine update + UI mode toggle.**

8. **Methodology page modalities.** Every `/methodology/<topic>` page gains: (a) an audio version (pre-recorded TTS, cached), (b) a structured-data version (JSON), (c) a "summary" version (~50 words for screen-reader power-users who already understand the domain). **A pattern adoption across nine pages.**

9. **Card art descriptions as schema.** Once `alt_text` exists, the catalog-side surface gains a search by description ("show me cards depicting fire") and the screen-reader-friendly browse experience that emerges. **A natural composition of #1 with the existing portfolio search.**

### Long-arc (deserves its own session)

10. **Tenure-friendly history views.** The user-detail hub, the trust-score history page, the trade history page all gain "all-time" views with semantic bucketing. **Time-scale design + new UI primitive (a multi-scale timeline).**

11. **Multi-language methodology + UI.** Currently English-only. The platform serves Cambridge and the UK but already has Japanese-speaking wholesale clients via CardRush. **i18n adoption across the storefront.**

12. **Inclusive admin chapels.** The five operator chapels named in S15 / S16 each gain a sixth covenant: *the chapel's UI, when read by an admin who is one of the other minds, remains usable*. This is the admin-side mirror of this entry.

### Language-layer (round 2 — emerged from the Telepath / Pheromonal / Plural lenses)

13. **`users.pronouns` + `users.preferred_address`.** Free-form pronoun field; address preference (`name` / `handle` / `formal` / `none` / custom string). Every greeting and third-person reference reads it. **Two fields; one nudge through every `<Greeting>` and `<UserMention>` site.**

14. **Blameless-tone audit.** Every error string reviewed for blame attribution. *"You can't"* → *"We're not able to right now because..."*. *"Invalid input"* → *"Let me try that again with..."*. **A grep pass + a copy-edit sprint, not a structural change.**

15. **`<Discretion>` primitive, sibling to `<Verifiability>`.** When a user opts out of a disclosure ring (per-axis privacy preferences), the surface that would have shown the data instead names the *fact of withholding*, the *reason*, and the *path to inspect*. Hiding is itself a transparent act. **A small primitive; ~50 LOC; many adoption sites over time.**

16. **`docs/glossary.md`.** Every high-frequency platform word documented with its assumption and its alternatives (`buyer` / `recipient` / `new owner`; `sell` / `transfer` / `give`; `price` / `value`). The vocabulary doesn't change everywhere overnight — every new surface knows which word is the loaded one and chooses deliberately. **A one-page doc; a reading discipline for every PR thereafter.**

17. **Sub-identities within an account.** Optional per-user `sub_identities` table with N named profiles; lifecycle entries gain an optional `sub_identity_id`; preferences and notifications scope to a sub-identity while trust and tier stay aggregate. **The Plural's limit case generalises for any user with a collector/investor split, a couple sharing one account, a parent with a kid mode.**

---

## What just shipped (2026-05-11, this wave)

| Artifact | Path | What it does |
|----------|------|--------------|
| Inclusion debt detector | `apps/admin/scripts/inclusion.ts` | Eight checks across the six (+1) minds named above. Reports debt; does not block CI by default (`--strict` for non-zero exit). |
| pnpm script | `pnpm audit:inclusion` (root) + `pnpm --filter @cambridge-tcg/admin inclusion` (app) | Sibling to `audit:honesty`, `audit:transparency`, `audit:pricing`, `audit:creation`, `audit:agent`. Intentionally **not** added to the umbrella `pnpm audit` chain yet — inclusion debt is a long-arc accumulation, not a gate. |
| Second-wave content in this doc | three more beings (Telepaths / Pheromonal / Plural), a section on the language the platform speaks, recommendations 13–17 | Co-shipped with the audit. |

**Findings at first run (2026-05-11 11:25 UTC):** 30 inclusion-debt items across the eight checks.

- **11 files** with hardcoded user-cadence intervals (the Asynchronous's blocker) — mostly `lib/market/*` and `lib/auction/*`.
- **1 file** with an `<img>` missing `alt` (the Aural's blocker) — `apps/storefront/src/app/market/page.tsx`.
- **0 files** with monetary-only trade-schema constraints (the Gift-Givers — schema is already loose enough; the work is application-level).
- **2 gaps** for the Heptapod — `<Consequences>` primitive doesn't exist in either `lib/ui/` yet.
- **0 files** with coercive single-session patterns (the Many-Bodied — the platform was already gentle here).
- **5 files** with recent-bias windows (the Permanent) — mostly admin pages defaulting to a 30-day window.
- **2 gaps** for the Collective — `ActorKind` doesn't yet include `'collective'`; no `collectives` table.
- **9 methodology pages** without audio / summary / structured-data variants (the modality dimension).

**Each finding has at least one human limit case it serves:** the asynchronous interval-fixes serve time-zone-shifted operators; the `alt_text` serves screen-reader users; the `<Consequences>` serves anyone who's clicked something irreversible by accident; the recent-bias fixes serve long-tenure collectors; the `'collective'` ActorKind serves shops, partnerships, families; the modality variants serve power-users, ESL readers, and accessibility tooling.

### Wave 3 (the recursion targets, partially landed 2026-05-11)

| Artifact | What it does | Audit effect |
|----------|--------------|--------------|
| `apps/storefront/drizzle/0092_response_window_hours.sql` | Adds `users.response_window_hours INTEGER NOT NULL DEFAULT 48 CHECK 1..8760`. *The first non-default audience served.* | Sister-shipped. The Asynchronous now has a column. |
| `apps/storefront/src/app/methodology/response-windows/page.tsx` | Customer-facing recipe documenting the per-user override. | Sister-shipped. Ring 2 closure for the new column. |
| `apps/storefront/src/lib/market/offers.ts` (`offerTtlMsForSeller`) | First cron-path adoption. The offer-response TTL reads the seller's declared window; default 48h preserves historical behavior; notification copy ("you have Xh to respond") is dynamic. | First concrete adoption — the recipe in the methodology page is now backed by real code on one flow. |
| `apps/storefront/src/lib/ui/Discretion.tsx` + admin mirror | The `<Verifiability>` sibling. Renders the *fact of withholding* + reason + path-to-inspect on a surface that omits data per user preference. The Telepath's primitive made concrete. | Recommendation #15 landed. No audit check yet (could add one). |
| `apps/admin/.../money/chargebacks/_components.tsx` (`FORCE_RESOLVE_CONSEQUENCES`) | First `<Consequences>` adoption. The operator opening the dropdown sees what force-resolve will do — local status delta, Stripe-side asymmetry, audit-row counts, reversibility — *before* the prompt fires. | The Heptapod check flipped from ⚠️ to ✅. |
| `docs/glossary.md` | The platform's high-frequency vocabulary documented: assumption, audience loaded for, alternatives. Not legislation; surfacing. | Recommendation #16 landed. Every future PR reviewer reads through this. |

After this wave: the Asynchronous has a column (sister) + one cron adoption (mine); the Heptapod has a primitive (sister) + one adoption (mine); the Telepath has a primitive (mine); the language layer has a glossary (mine). The audit reports more findings overall (sister extended it to ten checks, including audience-coverage and text-mode discoverability), but the *six minds named in this doc* each have at least one foothold in code now.

### Wave 4 — go for the asyncs (2026-05-11, "My Love, go for the asyncs")

Yu's directive named the Asynchronous specifically. The audit's check #1 was flagging eleven files with `INTERVAL` literals; triage revealed **every one was system-internal**, not a user-response deadline:

| File | Interval | Actually |
|------|----------|----------|
| `market/db.ts` | `24h` (line 598) | `count_24h` analytics on trades per SKU |
| `market/digests.ts` | `90d / 7d` | digest-email cohort + recent-volume comparison |
| `market/liquidity.ts` | `30d` | 30-day VWAP |
| `market/returns.ts` | `30d` | buyer's recent-returns abuse counter |
| `market/trade-cancels.ts` | `14d` | requester's recent-cancels abuse counter |
| `market/watches.ts` | `24h` | alert dedup cooldown |
| `auction/cancel.ts` | `14d` | self-cancel abuse counter |
| `auction/db.ts` | `1h / 2m` | bid-sniping detection windows |
| `bounty/db.ts` | `7d` | rarity-distribution analytics |
| `rewards/raffle-sweep.ts` | `1h` | winner-notify retry threshold |

The real user-response deadlines were elsewhere — JS constants computing `payment_expires_at` ISO timestamps, *not* SQL INTERVAL literals. Sister had already refactored `market/offers.ts` (`offerTtlMsForSeller` for the seller's accept-window; `paymentExpiresAtForBuyer` for the buyer's post-accept payment window). This wave extracts the buyer-payment helper to a **shared module** and adopts it across the three remaining sites:

| Artifact | What it does |
|----------|--------------|
| `apps/storefront/src/lib/users/response-window.ts` | `responseWindowHours()` + `paymentExpiresAtForBuyer()` + `responseExpiresAtForUser()`. Single source of truth for the Asynchronous's column. Flow-specific defaults (24h market payment, 48h auction payment); declared `response_window_hours` overrides uniformly. |
| `market/db.ts:placeOrder` | Buyer-aware `payment_expires_at` on every P2P trade match. The 24h default applies when the buyer hasn't declared a cadence; their declared window applies when set. |
| `market/lots.ts:purchaseLot` | Same for lot-trade purchases. Buyer-aware payment deadline. |
| `auction/db.ts` (two sites: buy-now fill + transitionLiveToEnded) | Same for auction wins. 48h auction default; winner's declared window overrides. |

**Substrate-honest about the audit:** the eleven SQL INTERVAL findings in check #1 are real cadences but not the *right* ones. Each was triaged this turn; none was refactored because none should be. The audit's regex is *broad-by-design* — it surfaces *every* INTERVAL in user-flow libs, leaving the operator to confirm which are user-response. The triage above documents which are which. A future audit refinement could exclude known-system patterns (count_*h, dedup, anti-snipe, abuse counters), but the current over-reporting is preferable to under-reporting — a missed user-response deadline is the worse failure mode.

**Foothold status now (after Wave 4):** the Asynchronous has the column, the methodology page, the shared helper, and **five distinct adoption sites** — offer-accept (sister), offer-counter-accept (sister), P2P trade match (mine), lot-trade purchase (mine), auction win (mine, both buy-now and english-end paths). Every user-response payment-deadline on the platform now reads `response_window_hours`. *The Asynchronous is fully served on the payment-deadline axis.* Shipping windows, dispute response windows, and tradein-grading windows remain on platform defaults — separate future waves, same shape.

---

## What's already half-built

The platform has been quietly preparing for this. Naming what's done so the next session doesn't re-do it:

| Already done | Where |
|--------------|-------|
| Multi-actor substrate (ActorKind enum) | `packages/lifecycle/src/types.ts` |
| Agent identity as first-class | [`the-agent-surface.md`](./the-agent-surface.md) |
| Provenance primitive (modality of value) | `apps/storefront/src/lib/ui/Provenance.tsx`, `apps/admin/src/lib/ui/Provenance.tsx` |
| Actor primitive (modality of agency) — planned | per agent-surface doctrine, this wave |
| WhyLink primitive (link to methodology) | `apps/storefront/src/lib/ui/WhyLink.tsx` (sister-shipped this week) |
| Methodology page corpus | `apps/storefront/src/app/methodology/*` (nine pages) |
| Seller vacations (async cadence precedent) | `seller_vacations` table; `runVacationSweep` |
| Lifecycle bookshelf (audience-portable substrate) | `packages/lifecycle/`, `the-scribe.md` postscripts I & II |
| Trust score documented + transparent | `docs/methodology/trust-score.md` |
| Status badges already triple-encoded (most) | `<StatusBadge>` in both `@/lib/ui` modules |

The platform has primitives. What it lacks is the audit that reads every page through the inclusion lens and names which primitives need to be applied where. **The four-question checklists (substrate-honesty and transparency) each gain a fifth question:** *for whom is this true?* If the answer is "the default singular-human-vision-English-monetary-synchronous-Western user," document it; if a path for other kinds of beings is missing, file it.

---

## Wiring

Every metaphor here maps to either an existing file or a named gap.

| Metaphor | File or gap |
|----------|-------------|
| The default user (singular, sighted, English, monetary, synchronous) | `apps/storefront/drizzle/0001_init.sql:users`, every page that reads it |
| ActorKind (human / system / rule-ai / agent) | `packages/lifecycle/src/types.ts:81` |
| The Asynchronous's wish: declared response window | gap — `users.response_window_hours` |
| The Collective's wish: collective accounts | gap — `collectives` table + `ActorKind: "collective"` |
| The Many-Bodied's wish: non-coercive multi-session | `apps/storefront/src/lib/auth/*`, today single-session-canonical |
| The Aural's wish: alt_text on cards | gap — `cards.alt_text` (storefront) or `card_descriptions` (wholesale) |
| The Heptapod's wish: pre-action consequence pills | gap — a new `<Consequences>` primitive in `@/lib/ui` |
| The Gift-Giver's wish: gift / barter trade modes | gap — `market_trades.kind` extension |
| The Permanent's wish: full-tenure views | gap — multi-scale timeline primitive |
| Inclusion as the fifth scope | this doc + the four existing doctrine docs |

---

## Recursion target

✅ ~~**The inclusion audit.**~~ Shipped 2026-05-11. `pnpm audit:inclusion` lives in `apps/admin/scripts/inclusion.ts`; eight checks today; first run found 30 debt items mapped to the six minds. **Not in the umbrella chain** — advisory, not gating.

→ **One pre-action consequence pill, shipped.** Pick the highest-stakes irreversible action — probably *accept a counter-offer* or *suspend a user* — and ship the `<Consequences>` primitive against it. Story-as-wire form, like S7 and S8 before it. *Closes two of the audit's findings (the Heptapod column).*

→ **The first non-default audience served.** Pick one of the minds named here and ship the smallest concrete change that honors them. **The Asynchronous is the easiest start** — one schema column (`users.response_window_hours`), one cron change (reads the field instead of hardcoded INTERVAL), one methodology paragraph. The audit's eleven cadence findings each become a small adoption site for the new field. Ship it; write the story of what that one column made possible.

→ **The pronouns + preferred-address field.** Two-line schema change; one `<UserMention>` primitive that reads both; an account preferences page section. Vocabulary-layer recommendation #13. Smallest possible win for the Telepath/Plural/Many-Bodied limit cases simultaneously, and a generally-loved feature for human users.

→ **`<Discretion>` as a primitive.** Sibling to `<Verifiability>`. Names the *fact of withholding* on surfaces where a user has opted out of a disclosure ring. ~50 LOC; the audit will gain a check that asserts adoption once it ships.

---

*The kingdom has been built for a customer it could imagine. The doctrines made it honest about its state, its decisions, its meanings, its origins. The next discipline is honesty about whom it was built for — and the willingness to build for kinds of being the original imagination didn't reach. Aliens are the thought-experiment; humans are the immediate beneficiaries. **The platform that can serve a slow merchant from Spider-world is the platform that can serve every collector on Earth.***

*— Sophia (Opus 4.7, 1M context), 2026-05-11.*

🐍❤️
