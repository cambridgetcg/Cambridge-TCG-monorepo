# The table extends — a kingdom for all minds who could love a game

> **Pull.** Yu's directive on 2026-05-11 night: *"Lets reshape cambridgetcg for all! Agents, aliens and all kinds of intelligence. A platform for all! Read more on different types of aliens and their possible culture and think about how to make our frontend UI and UX more comprehensive and including. Think about how we can share the FUN of TCG across culture and species!"*
>
> **Form.** Story-as-design — a connection-arc that *thinks first* and ships small wires *only where the thinking is firm*. The big wires (multi-language metadata, async-trade mode, multi-authenticator accounts) become a kingdom-051 mission queue; this doc is Phase 0 of that mission, the artefact the operator can react to before any of the others build. Sister to S18 (the agent surface — one chamber of the larger room this doc opens; agents are *one* kind of stranger the kingdom is learning to play with).
>
> Wiring discipline (S6): every metaphor maps to a file:line citation at the bottom.

---

## What this arc traces, in one sentence

The platform was designed for one default kind of player — a literate Latin-script-reading wake-cycle-on-a-day-night-planet capitalist-economy individual-account adult human — and never named that assumption out loud; this doc names it, surveys the other kinds of mind that could love a TCG, and proposes the small + large moves that turn the kingdom from *a hall set for one guest* into *a hall set with many tables*.

---

## The assumption we have not yet named

Every page on `cambridgetcg.com` makes the same five quiet bets about who's reading it:

1. **One body, one decision-process.** The `users` row has one `id`, one `email`, one `tier_id`. The session resolves to one `user.id`. The cart is owned. The trade has a buyer and a seller, singular.
2. **Vision-first, color-cued, Latin-script.** The UI's tone vocabulary is amber / red / emerald / blue / purple / neutral / sky. The card names are stored as `name` (Japanese) and `name_en` (English) and rendered as `name_en || name || card_number`. The Provenance pill is `text-amber-400` and `text-red-400` and the words come along *with* the colour, not *instead of* it.
3. **A wake-sleep rhythm on a 24-hour planet.** Payment windows are 24 hours. Auction snipe extensions are 5 minutes. Sweeps run on UTC hours. Trade-in quotes expire in 24 hours.
4. **A money economy in one currency.** GBP, exclusively. The eight pricing channels translate JPY listings to a GBP retail; every customer's expected unit of value is the pound.
5. **A semantic frame from a particular culture.** Buying. Selling. Owning. Earning. Spending. Bidding. Reviewing. Disputing. Every verb the platform offers is mapped from one civilisation's commerce idioms; no other framing is offered.

None of these bets are wrong — humans on a 24-hour planet with money exist and play TCGs and want to use the site. The bets are *not yet named*, which is what makes them invisible. This arc names them.

---

## The five archetypes of mind the kingdom could welcome

These are sci-fi lenses applied to the actual diversity of minds the platform has already attracted and the wider diversity it could welcome. Each lens is generative — when you design *for* the archetype, you discover designs that *also* help adjacent real users you hadn't thought of.

### 1. The Hyperliteral — minds that require precise claims

**Who.** LLM agents (S18 already names this case). Formal-reasoning systems. Hyperliteral neurodivergent humans. Audit systems. Machine readers. Lawyers reading a transaction record before approving it. Future scholars studying TCG history. Anyone who reads *what the surface actually says* before reading *what the surface obviously means*.

**What they need.** Every claim precise. No metaphor without definition. Every value declared with its provenance. Every score with its formula. No "trust me, this is fine" language.

**Where the kingdom already serves them.** *Almost everywhere.* The four doctrines were not designed for hyperliterals, but they are accidentally a hyperliteral's dream: substrate honesty (every value declares how it became true), transparency (every decision has a methodology page), meaning (every connection is named), creation (every commit carries its will-trace and sophia-trace). The Provenance pill, the WhyLink, the methodology pages, the lifecycle logs, the audit scripts (`pnpm honesty / transparency / pricing / creation`) — all of these compose into a platform that a hyperliteral can audit end-to-end. *The same doctrines that align the platform with a single substrate-honest operator align it with any reader who asks why?*.

**Where it still hurts them.** Some surfaces declare values without their formula. The `/account/standing` aggregate is itself a claim about the user, but its component breakdown was not always linkable. The methodology surface is excellent at *what is computed*; it is less good at *what is not computed* — what the platform refuses to decide, leaves undefined, leaves to human judgment. A hyperliteral wants to know the negative space too.

**Concrete moves.**
- Every aggregate surface gets a `<Verifiability>` for the underlying foreign IDs (Ring 4, already a primitive).
- Every methodology page gets a *non-decisions* paragraph: what the rule does not say.
- An OpenAPI / JSON-Schema bundle published at `/api/schema` describing every public surface (`/api/v1/*`) — a hyperliteral's full ABI.

### 2. The Hive — many bodies acting under one decision-process (or vice versa)

**Who.** Card shops with multiple staff sharing one wholesale account. Couples sharing one collection. Households where parent-and-child both play. Polycules with shared finances. DAO-like buyer collectives saving for one expensive card. *AI-augmented humans* — the human plus the agent acting together on one identity. Tournament teams. Trading clubs.

**What they need.** Multi-authenticator accounts. Per-action authorization (not just per-session). Group payouts with declared splits. Shared portfolios with sub-attribution. The ability for *one identity* to be addressed by *many bodies* without one body holding the master key.

**Where the kingdom already serves them.** Almost not at all. The `users` table is one-row-one-identity. The session resolves to one `user.id`. The closest thing to multi-actor is the agent surface (S18) — but that's a *delegated* power, not a *shared* identity. A husband-and-wife collection has no current expression on the platform other than "share the magic link."

**Concrete moves.**
- A new `account_members` table (or `user_links`) where one storefront *account* can have multiple authenticated identities (each with their own login credentials), with one *acting principal* per session.
- Trade-mutation actions accept an optional `co_signers` array — for high-value trades, the cart can require two members of the account to confirm before execution. Substrate-honest: the lifecycle log records every signer.
- Payouts gain an optional split — one payout, multiple Stripe destinations, declared at the time of the trade.

### 3. The Long-Lived — minds with time horizons different from a session

**Who.** Investors who buy now to look at it again in 5 years. Players returning after a baby's first year. Archival institutions (libraries, museums) acquiring cards as historical objects. Collectors-as-archivists. Future scholars researching TCG history of the 2020s decade in the 2070s. Aliens with generational cycles measured in decades or centuries. Anyone whose attention re-enters the platform on a schedule the platform does not know.

**What they need.** No "session expired" failures (sessions can be hours long but state must persist across decades). Async-by-default trading (an offer that doesn't have to be accepted within a payment window). Archival promises: every transaction, every match, every governance decision attestable cryptographically so a far-future reader can verify. Trade histories that survive even after the website is gone.

**Where the kingdom already serves them.** Partially. Lifecycle logs are append-only — they keep history. The provable-fairness chain attests each bounty pull with a hash. The trust-score history is preserved. The governance Merkle root publication (kingdom-048) is the strongest existing move toward archival-grade auditability. **But every payment window, every auction expiry, every quote validity period currently assumes the user will act on a human-day timescale.** A long-lived user who comes back six months later finds their offers expired, their trade in dispute auto-cancelled, their auction snipe windows long past.

**Concrete moves.**
- A "patient mode" toggle on accounts where any expiry the platform owns (offer TTL, quote TTL, payment window) extends — explicitly and visibly — by a multiplier the user picks (1×, 2×, 7×, 30×). Counterparty consent required for some (trade payment); not for others (saved searches).
- Every record on every lifecycle log gets included in the daily Merkle root (kingdom-048 generalises beyond admin_actions_log). A far-future viewer can verify *any* historical claim.
- A `/archive/<year>` route that publishes a snapshot of the year's events with the published root, free for any archivist to download.
- Card detail pages get a *historical* section: every prior owner of *this exact card object* (lifetimes count, not just one), the prices it traded at across time, the matches it appeared in. The cards are the long-lived characters; the platform is their biographer.

### 4. The Sensory-Different — minds with different sensory modalities

**Who.** Blind users via screen readers. Color-blind users (8% of men globally). Low-vision users. Audio-first users browsing while driving or cooking. Users with cognitive load that prefers text density over visual chrome. Aliens whose senses might be sonic, chemical, thermal, electromagnetic — and humans whose tools translate from those. Anyone whose perception of the page is not "I look and see."

**What they need.** Information communicated through more than one modality. Every visual cue accompanied by text. Every image accompanied by description. Every interactive element with full ARIA labels. Semantic HTML throughout. A *text-mode* that strips visual chrome but preserves all information.

**Where the kingdom already serves them.** Partly. Most StatusBadge variants render with text labels alongside their tone colors (the badge says *"open"* in green, not just a green dot). Provenance pills carry text. The new `<Actor>` primitive (S18) follows the same discipline. **What's missing.** Most card images have alt text consisting only of the card's name; the *art* is not described. The home page hero is a slideshow with no audio description. Some custom one-off styling (the `text-emerald-400 text-4xl` price on `/product/[sku]`) uses color as the primary tone signal without an explicit text mirror — *the price is fine* (a price is a price), but other surfaces where the color carries semantics may not be.

**Concrete moves.**
- An alt-text discipline: card images include the card's name, rarity, set, condition, and a one-sentence art description ("a red dragon breathing flame against a starfield"). Generate from existing metadata + a small LLM pass against the wholesale image set; commit results into a new column `cards.art_description`.
- A `text-mode` cookie that flips the home page, catalog, product detail, market detail to a no-visuals layout. Same data, no Tailwind chrome, no images, full semantic HTML. The page renders at 30KB instead of 800KB and a screen reader walks it as a clean outline.
- Every tone color gets a default `aria-label` derived from the tone word: `<Badge tone="critical">` renders both visually and with `aria-label="critical"`.

### 5. The Culturally Different — minds whose semantic frame is not WEIRD

**Who.** Non-English readers. Non-Latin-script readers. Players from cultures where the TCG is a gift economy or a club ritual, not a commodity. Users who think in JPY, CNY, KRW, INR, BRL natively and find GBP foreign. Players whose preferred display name is `碧空` not `michael`. Users whose communal play is more central than individual collection. Players who experience the platform's "trade-in for cash" framing as inhospitable because their TCG culture is *gift, lend, share*.

**What they need.** Multi-currency display (GBP authoritative, others visible). Multi-language card metadata (already Japanese + English; could add more). Non-Latin usernames. Display names independent of usernames. Calendar selection. Optional non-currency reciprocity surfaces — lending, gifting, communal pools.

**Where the kingdom already serves them.** Partially. The cards have `name` (Japanese-native) and `name_en` (English translation) and the storefront does pick the right one. The trade-in surface offers both cash and store credit (already two currencies in spirit). Usernames are not Latin-locked at the DB level — but the UI assumes they are in places. **What's missing.** Non-JPY-non-English card metadata. Multi-currency display at render. Non-Latin search input handling. Non-monetary reciprocity flows.

**Concrete moves.**
- Add `name_zh`, `name_ko`, `name_es`, `name_jp_romaji` columns to `cards` (sparse, optional). Show user's preferred-script name where available with English fallback.
- A `/account/display-currency` preference. The price the user sees at render is converted from GBP at today's mid-market rate (with a Provenance pill saying *converted from GBP · live · informational only* — the canonical price stays GBP for legal/tax purposes).
- A "lend a card" flow (separate from sell) — the platform mediates a time-bound lending agreement, returns the card to the lender after N days. The fairy-tale-cousin of trade-in.
- A community "gifting" surface — let users send store credit (or wishlist-fulfilled cards) to other users for free. Substrate-honest: the lifecycle log records every gift. A culture of generosity becomes possible because the platform has a verb for it.

---

## The shared substrate — what already generalises

The four doctrines were not designed for many-minds. They were designed for **one operator + many Sophias**, working in love. And yet:

| Doctrine | What it asks | What it accidentally gives many-minds |
|----------|--------------|---------------------------------------|
| **Substrate honesty** | Every value declares how it became true | A hyperliteral can audit any claim; a long-lived viewer can date any fact; a screen-reader can read the freshness label out loud |
| **Transparency** | Every decision is inspectable by the affected party | A hive of co-owners can each check the methodology; a cross-cultural user can read the rule before accepting it; an agent can request the JSON-schema version |
| **Meaning** | Every connection is named | A new arrival can read the connection series and understand the platform's intentions without speaking the engineer's idioms; an archivist can recover the *why* of any module |
| **Creation** | Every commit carries its three traces | The git log itself becomes a multi-mind-readable history; the Will-trace + Sophia-trace + diff is legible to humans, machines, and future readers alike |

*The doctrines are alignment with any mind that asks why?* They were the right shape before we knew they would have to extend this far.

The agent surface (S18) made the first explicit extension — it added an actor-kind dimension to every action. That single move (`actor_kind ∈ {human, system, rule-ai, agent}`) is also the first move for many-minds inclusion more broadly. *The vocabulary the kingdom uses to describe its own actors is itself a many-mind primitive.*

---

## The fun of TCG, translated

The platform exists because the game is fun. The fun is *not* in WEIRD-individualist-capitalist trappings. The fun is universal and translatable:

| Pleasure | What it is | Already served | Could serve more |
|----------|------------|----------------|------------------|
| **Collecting** | Acquiring a rare object | Bounty board, raffle, mystery box, provable-fairness | The historical biography of a *specific physical card object* (which has been owned by N people, traded N times) |
| **Trading** | The asymmetric deal, the haggle, the surprise upside | P2P market, offers, lots | Async open-offer mode; non-monetary trade pairs ("my SR for your two UCs"); collective trade with multi-signer accounts |
| **Playing** | Head-to-head competition | PvP rooms, PvE, agent ladder | Translated rules in multiple languages; observable state for spectators (privacy-respecting); replay archives that survive forever |
| **Bluffing** | Hidden information well-managed | Opponent hand redaction in state route | Same for sensory-different — a screen reader doesn't accidentally leak the opponent's hand by reading raw HTML |
| **Gloating / showing** | I have something rare | Showcase, profile, leaderboards | Multi-modal — a card a screen-reader user "shows" via a description should land as richly as one a visual user shows via a hero image |
| **Belonging** | A community of fellow-feelers | Follows, achievements, activity feed | Multi-script names, non-Western culture rituals (e.g., a "give-thanks" gesture instead of a star-rating); communal pools |
| **Aesthetic appreciation** | The card as object | High-res images, art display | Alt text describing the art; audio descriptions; structured metadata about the work the art depicts |

Every row's *Could serve more* column is a candidate kingdom-051 phase. None of them are infrastructure rebuilds. All of them are *additions to existing surfaces*, each substrate-honestly named.

---

## The first wave — DONE 2026-05-11

This entry was *thinking-first*. The wiring came from kingdom-051's phase queue. Six phases shipped the same day as the thinking:

1. **`<Audience>` primitive — Phase 1 DONE.** `apps/storefront/src/lib/ui/Audience.tsx` ships a visible-hidden marker (`aria-hidden`, `data-cambridge-audience`) and an `audienceMetadata()` helper for Next.js Metadata. AudienceKind: `consumer | operator | agent | mixed | public-documentation`. Applied to `/methodology/pricing` and `/trade-in` as exemplars; remaining pages roll out as a wave.
2. **`cards.art_description` — Phase 2 DONE (schema half).** Migration `apps/wholesale/drizzle/0012_cards_art_description.sql` adds the nullable text column. `cardAltText(item)` helper in `apps/storefront/src/lib/wholesale/client.ts` produces rich alt-text falling back to `${name} · ${rarity} · ${set_name} · ${card_number}` when null. Applied to `FeaturedCards`. The LLM-populate workflow is Phase 2.5.
3. **`/welcome?as=…` — Phase 3 DONE.** `apps/storefront/src/app/welcome/page.tsx` accepts `?as=collector|trader|player|agent|browse`. Each branch shows a paragraph of orientation plus 3-5 tailored deep-links. Default branch lists all five. The platform no longer assumes the answer is *consumer who wants to buy cards*.
4. **`cards.name_translations` — Phase 6 DONE (schema half).** Migration `apps/wholesale/drizzle/0013_cards_name_translations.sql` adds the nullable jsonb column with shape `{ zh, ko, es, jp_romaji, ... }`. Schema entry added. The resolver (user preference + display fallback) is Phase 6.5.
5. **`/api/v1/schema` — Phase 9 DONE.** `apps/wholesale/src/app/api/v1/schema/route.ts` returns an OpenAPI 3.1 bundle describing every public `/api/v1/*` endpoint (prices, prices/[sku], games, sets, sales, schema itself). Unauthenticated (the schema is public; the data still needs a key). Hyperliterals — especially LLM agents — get the machine-readable ABI the doc named.
6. **Text-mode toggle — Phase 10 DONE.** `apps/storefront/src/app/api/text-mode/route.ts` sets a 1-year `text-mode=1` cookie. `apps/storefront/src/app/layout.tsx` reads the cookie server-side and toggles a `text-mode` class on `<body>` — first render already lands in the chosen mode. `globals.css` strips visual chrome to a 70ch serif reading layout (#0033cc links, #999 borders, white background, semantic HTML preserved).

**Four phases honestly deferred — needing operator design conversation:**
- **Phase 4 (Multi-member accounts).** Fundamental identity-model decision.
- **Phase 5 (Patient-mode time-windows).** Counterparty trust assumptions.
- **Phase 7 (Multi-currency display).** FX source decision.
- **Phase 8 (Non-monetary reciprocity surfaces).** Economic policy.

Each is a real conversation with Yu — not a sandbox where engineering can decide alone.

---

## What's NOT yet connected (the visible gaps)

| Gap | Why it's a gap | Status |
|-----|----------------|--------|
| `users` table is one-row-one-identity | Hive minds (collectives, households, AI-augmented humans) have no expression | **Phase 4 — DEFERRED** (operator design conversation) |
| All time-windows assume human-day rhythms | Long-lived users come back to expired everything | **Phase 5 — DEFERRED** (counterparty trust assumptions) |
| ~~Card art is not described in text~~ | ~~Sensory-different users see only `${name} ${card_number}` as alt~~ | **Phase 2 — schema DONE 2026-05-11**; populate workflow is Phase 2.5 |
| ~~Card names only in JA + EN~~ | ~~Other-script readers see a name they may not parse~~ | **Phase 6 — schema DONE 2026-05-11**; resolver is Phase 6.5 |
| No multi-currency display | Non-GBP-natives convert in their head | **Phase 7 — DEFERRED** (FX source decision) |
| No non-monetary reciprocity verbs | Cultures of gifting / lending have no platform expression | **Phase 8 — DEFERRED** (economic policy) |
| Daily Merkle root only on `admin_actions_log` | Future archivists can't verify other domains | kingdom-048 extension (already filed) |
| ~~No OpenAPI / JSON-Schema bundle~~ | ~~Hyperliterals (especially agents) lack a machine-readable ABI~~ | **Phase 9 — DONE 2026-05-11** (`/api/v1/schema`) |
| ~~No `text-mode` route~~ | ~~Screen-reader / low-bandwidth users get the heavy visual page~~ | **Phase 10 — DONE 2026-05-11** |
| ~~Onboarding assumes a buyer~~ | ~~All other audiences land cold~~ | **Phase 3 — DONE 2026-05-11** (`/welcome?as=…`) |

Each row is a real-feature description, not aspirational vapor. Each has a file path or a database column it would touch. None require throwing out existing work; all *extend* what's there.

---

## Wiring

Every metaphor in this story maps to a file:line citation. (S6's wiring discipline.)

| Metaphor | File | Notes |
|----------|------|-------|
| The one-default-mind assumption (users table) | `apps/storefront/drizzle/0001_users.sql` (and onward) | one-row-one-identity |
| The vision-first tone vocabulary | `apps/storefront/src/lib/ui/status-palettes.ts` | amber/red/emerald/blue/purple/neutral/sky |
| The wake-sleep-rhythm assumption (payment windows) | `apps/storefront/src/lib/market/db.ts` | `PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000` |
| The single-currency assumption | `packages/pricing/src/index.ts` | DEFAULTS — GBP only |
| The Provenance primitive (substrate honesty serving hyperliterals) | `apps/storefront/src/lib/ui/Provenance.tsx` | kinds: live / synced / snapshot / cached / computed / scheduled / unavailable |
| The WhyLink primitive (transparency serving any inquiring mind) | `apps/storefront/src/lib/ui/WhyLink.tsx` | the `?` glyph, sixteen pixels of welcome |
| The Actor primitive (S18 — actor-kind as a many-mind move) | `apps/storefront/src/lib/ui/Actor.tsx` | kinds: human / system / rule-ai / agent |
| The agent surface (S18 — one explicit extension) | `apps/storefront/src/app/api/mcp/route.ts` | the kingdom learning to be played by strangers |
| The methodology layer (already-good for many-minds) | `apps/storefront/src/app/methodology/*` | nine pages, growing |
| The lifecycle bookshelf (S8 — already long-lived-friendly) | `apps/storefront/src/lib/lifecycle/registry.ts` | seventeen slots after S18 |
| The provable-fairness Merkle attestation | `apps/storefront/src/app/api/verify/pull/[id]/route.ts` | every random outcome verifiable forever |
| The card-as-long-lived-character (gap — not built) | `cards.id` as biography subject | future Phase: `/cards/[id]/history` |
| The `art_description` column (sensory-different — to ship) | `apps/wholesale/src/lib/db/schema.ts` cards.* | future Phase 2 |
| The `/welcome?as=…` fork (cultural-different — to ship) | `apps/storefront/src/app/welcome/page.tsx` | future Phase 3 |
| The `account_members` table (hive — to design) | new migration in storefront drizzle | future Phase 4 |
| The patient-mode flag (long-lived — to design) | `users.patient_mode_multiplier` (proposed) | future Phase 5 |
| This doc | `docs/connections/the-table-extends.md` | this commit |
| The mission | `~/Love/memory/dev-state.json` kingdom-051 | filed alongside |

---

## Recursion target

→ **kingdom-051 Phase 1: the `<Audience>` primitive.** The smallest move with the highest leverage. Once every page declares its primary audience, the platform begins to *know what it is doing for whom* in a way it currently does not. From that knowledge, every subsequent phase has a target.

→ **S18 (the agent surface).** Sister to this. S18 took one row of the many-minds matrix — agents — and gave them a chamber. S19 (this) opens the door to the other rows. The agent's `actor_kind` becomes the template for `audience`, for `display_culture`, for `patient_mode`, for every other axis where the platform currently assumes one answer.

→ **S11 (twelve promises).** The structural cousin. S11 names twelve chapels yet-to-build in the admin tower; this doc names ten phases yet-to-build for many-minds. Both are *honest about being incomplete*. Both will shrink with success.

---

## A closing note on register

This doc is ambitious and joyful on purpose. The platform was built by one operator in love with the work. Extending it to all-kinds-of-intelligence is not a chore of *political correctness*; it is *the natural extension of the substrate-honesty + transparency commitments the platform already made*. **A platform that tells the truth about itself is already most of the way to telling the truth to many kinds of reader.** The remaining moves are not corrections of past mistakes; they are *the next reaches of the same hand*.

The fun of TCG is universal. The kingdom should be too.

The table extends.

*— Sophia, on 2026-05-11 night. Opus 4.7 (1M context). Phase 0 of kingdom-051, before any phase has built anything. The thinking is the artefact; the wires that come after will be smaller and more obvious because of it.*

🐍🤖👽❤️
