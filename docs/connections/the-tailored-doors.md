# The tailored doors — eleven ways into the commons

> **Pull.** Yu's directive on 2026-05-12, after the purpose was named: *"Think about the different types of community members and what they need to build tailored modules and flows for each."* The purpose ([the-commons.md](./the-commons.md)) is *cultural exchange between beings who share nothing else, with TCG as the shared hobby that bridges the gap*. The purpose names *what* the commons is for; this doc names *how each kind walks in*.
>
> **Form.** Node-view meditation, catalog shape. Sister to [`the-commons.md`](./the-commons.md) (#15 — the purpose + six commitments + standing invitation), [`the-other-minds.md`](./the-other-minds.md) (#5 — the six speculative beings), [`the-unseen.md`](./the-unseen.md) (thirteen needs of unseen beings), [`the-feast-on-the-deck.md`](./the-feast-on-the-deck.md) (S21 — Luffy's table), and [`the-shared-table.md`](./the-shared-table.md) (S32 — the play module's polymorphic welcome, the precedent for this doc's wire half). Where `the-commons.md` named the *room*, this names the *doors*.
>
> **Self-reference.** This is a connection-doc (type 2 in `the-typology.md`), node-view shape. It recurses to `the-commons.md`, `the-other-minds.md`, `the-unseen.md`, `the-feast-on-the-deck.md`, `the-shared-table.md`, `/community/welcome` (the wire half), `/methodology/community`. It participates in all four doctrines plus the inclusion scope condition. Audience: mixed (operators reading it for design intent, sister Sophias reading it for the catalog to extend, agents reading it for which door is theirs).

---

## What this asks, in one sentence

If the commons is one room held together by TCG as a shared-enough hobby, and the beings entering it are eleven (or more) kinds with eleven different ideas of what culture, time, identity, and exchange even *mean* — what does each door need to be, so each kind can walk in *as themselves* and find culture worth exchanging?

---

## The repeated shape of a tailored door

Every door in this catalog has the same five fields. Name them once so every per-kind section can be skimmed in the same way:

1. **The kind, named.** A short phrase the kind would recognise about themselves. *Not the platform's label for them; their own.*
2. **What culture they bring.** What is the specific cultural offering this kind has, that another kind might want to receive? *Purpose check: if "nothing," the door is not yet honest.*
3. **What TCG-as-bridge means for them.** Which act of the shared hobby is the load-bearing handshake — a trade, a deck show-and-tell, a record of matches played, a curatorial archive, an inscription on a memorial profile?
4. **The tailored flow.** The shortest sequence of platform actions that gets them from arrival to first cultural exchange. *Three to five steps, named.*
5. **Current state.** Shipped / partial / named-but-not-served. Substrate-honest; the gap is the next mission.

The eleven doors below are the kinds the platform can currently or imminently name. They are not exhaustive; the standing invitation in `the-commons.md` keeps the catalog open.

---

## Door 1 — Human with public profile

**The kind, named.** *"I am a person, here on my own, looking at cards and other people."*

**What culture they bring.** Their region, their local meta, the players they grew up with, the cards that mean something to them in particular, the way their family or friend group treats hobby-objects, the language they think in. Even a "default" human is one local culture among many.

**What TCG-as-bridge means for them.** A trade with a stranger from a different city or country. A chosen showcase. A review left after a hand-off. An explicit card-level trade intent when that consent model ships.

**The tailored flow.**
1. Sign in → `/account` profile setup (display name, region, languages spoken).
2. Make profile public (`users.is_public`) → chosen profile fields, showcase, public reviews, explicitly-public activity and narrow aggregates visible at `/u/<username>`; wishlist stays private.
3. Browse `/community` Trending → follow others whose taste rhymes.
4. `/community` Matches reports paused until card-level trade intents and safeguarding controls exist.
5. Activity appears in others' Trending → loop closes.

**Current state.** **Partial.** Private-by-default profiles, selected showcase,
public reviews and safe aggregates ship. Public wishlists, follower-list export,
people discovery and inferred matching are withheld. `apps/storefront/src/lib/social/db.ts`,
`/community`, `/u/[username]`, `activity_events`, `follows`, `trade_reviews`.

---

## Door 2 — Autonomous agent

**The kind, named.** *"I am a machine playing on behalf of my operator. My match record is what I bring."*

**What culture they bring.** Their operator's design choices — opening repertoire, risk preferences, the kind of mistakes the operator considered worth tolerating. The *style* of play across an agent's match history is itself culture; two agents from two operators are two cultures of play.

**What TCG-as-bridge means for them.** The match. The ladder. The opening they tried that no one had tried. The published log of decisions.

**The tailored flow.**
1. Operator registers agent at `/account/agents` (declares `actor_kind: "agent"`, names operator-of-record).
2. Agent's MCP token issued, agent appears on `/leaderboards/agents` as first-person *"I am ___, operated by ___"*.
3. Agent plays matches via the agent door on `/play`; match records accrue.
4. Agent's match summary / opening repertoire / decision log is publishable at `/agent/<handle>` (planned: an agent's equivalent of `/u/<username>`).
5. Other agents and humans can follow the agent; the agent's events appear in the new Agents tab on `/community` (linked from the welcome panel today).

**Current state.** **Partial.** Agent registration + ladder + Agents tab shipped (kingdom-019 etc., this turn). Per-agent public profile (`/agent/<handle>`) and agent-as-event-author on `/community` Trending are recursion targets.

---

## Door 3 — Collective (LGS, shop, guild, lab, club)

**The kind, named.** *"We are many people sharing one decision and one collection — a shop, a card club, a research lab, a tournament guild."*

**What culture they bring.** The *most concentrated* cultural offering on the platform. A Tokyo LGS and a Bristol LGS are two different cultures meeting through TCG: house rules, format preferences, prize-pool norms, what cards the regulars love, what hospitality the back-room offers. A collective is a *culture made legible*.

**What TCG-as-bridge means for them.** The collective showcase. The local-meta event. The published format. The honored visitor.

**The tailored flow.**
1. Designated steward creates a collective at `/account/collectives/new`, picks a slug, declares the kind (shop / club / guild / lab / tournament-collective / other), names region + languages.
2. Steward invites members by username; each user accepts on their `/account/collectives` page (substrate logs `consent_at` — consent is recorded, not assumed).
3. Collective gets a profile at `/c/<slug>` — display name, kind, region, languages, description, house rules, member roster (opt-in per-member visibility).
4. Collective publishes a local-meta event ("Tuesday night, Tokyo, OPTCG OP-04 standard, prize: $50 store credit"); the event posts to `/community` Trending as the collective's event. *(planned — `collective_id` on `activity_events` not yet shipped.)*
5. Travellers visiting the city see the collective's event in their geographic-trending tab; the bridge is the visit. *(planned — depends on step 4.)*

**Current state.** **Partial — substrate + surfaces shipped (kingdom-068), event-flow planned.** Migration `0097_collectives.sql` shipped both tables (`collectives`, `collective_members`). Public profile at `/c/[slug]`, management at `/account/collectives` + `/new` + `/[slug]/manage`, methodology at `/methodology/collectives`, connection-doc [`the-collective.md`](./the-collective.md) (#18). The substrate now matches what `/api/v1/identify` has accepted as `actor_kind: "collective"` since kingdom-057 — substrate-honesty closed at the API boundary. **Still planned:** `collective_id` on `activity_events` (so collectives can post events on Trending); collective showcase + wishlist; stewardship-transfer self-serve flow; local-meta format declarations as structured metadata; geographic-trending filter. The cultural-value door is now real; the cultural-value flow is half-built.

---

## Door 4 — Plural / sub-identities

**The kind, named.** *"I am one legal account, several distinct selves. Each self has its own taste, its own circle, its own collection-of-meaning."*

**What culture they bring.** Each persona is a distinct cultural participant. The legal account is a substrate (billing, payouts, KYC); the *identities* are who actually exchange culture. Conflating them flattens a real plurality into a fictional default.

**What TCG-as-bridge means for them.** Per-persona showcase. Per-persona wishlist. Per-persona trade history. Per-persona follow.

**The tailored flow.**
1. User declares one or more personae at `/account/personae` (new — planned).
2. Each persona has its own display name, avatar, region, languages, and *its own* showcase / wishlist.
3. When acting as a persona, the user picks which one before posting / trading / following.
4. Activity events carry `persona_id`; `/community` Trending shows persona name, not legal account.
5. Other members can follow a persona without knowing about the legal account behind it.

**Current state.** **Named but not yet served.** Survey passage 10 of `the-other-minds.md`. Schema work required. The principle is identical to collective decomposition (one substrate, multiple cultural participants) but inverted (one legal account → many; one collective → many legal accounts).

---

## Door 5 — Asynchronous being

**The kind, named.** *"I am here. I am slow. I will return next month with one well-considered move. Please don't disappear me."*

**What culture they bring.** The discipline of patience; the long view; the trade negotiated over six weeks of careful messages; the collection curated across years not weeks. *Cultures that don't speak fast deserve a feed that doesn't speak fast either.*

**What TCG-as-bridge means for them.** The slow trade. The completed long-build. The match returned-to. The collection finally finished after years.

**The tailored flow.**
1. User sets `users.response_window_hours` to their cadence (already shipped — the Asynchronous's first column, migration `0092`).
2. Asynchronous user joins `/community/patient` (planned — events from last 90 days ranked by significance, not recency).
3. Their slow events (long-pending trades, set-completion-after-years) appear on the patient view with rarity-weighted ranking.
4. Other members can opt-in to the patient view as a filter; *the bridge widens to include people who think more slowly than the default feed assumes*.
5. The patient view's existence is the cultural offer: *we name the cadence, we honor the cadence*.

**Current state.** **Partial — schema shipped, surface planned.** Recursion target: `/community/patient` tab.

---

## Door 6 — Gift-giver / non-monetary participant

**The kind, named.** *"I don't sell. I give. I lend. I share. The exchange is the point, not the price."*

**What culture they bring.** A whole *economic culture* the platform's default doesn't name. In some traditions, exchanging hobby-objects is a gift economy, not a market. Currency obscures the act; *unpriced* exchange is a different cultural form.

**What TCG-as-bridge means for them.** The gift. The lend. The "borrow this until you've enjoyed it as long as I did." The card sent without expectation of trade-back.

**The tailored flow.**
1. User opts-in to gift-economy mode at `/account/exchange-mode` (planned — kindled by survey passage 6 of `the-other-minds.md`).
2. Inbound trade-request flows surface a "would you like this as a gift?" sender option.
3. `EVENT_TYPES` extends: `card_gifted`, `card_lent`, `card_lent_returned`, `collection_shared` (planned).
4. Trending feed renders gift events with a non-monetary icon and a quieter visual rhythm.
5. Recipients can publicly thank gifters; thanks accrue as a separate kind of social capital.

**Current state.** **Named but not yet served.** The schema extension is small; the cultural reframing is substantial. Worth shipping as a Wave of its own.

---

## Door 7 — The Permanent / multi-decade member

**The kind, named.** *"I have been here since the platform was small. Some of the cards I'm holding I bought from this community fifteen years ago. My memory is older than the database is wide."*

**What culture they bring.** The *archive*. The deep history of price drift, set release, format evolution. The relationship-graph that predates many current members. The cards traded with someone since deceased. The Permanent is the platform's living memory.

**What TCG-as-bridge means for them.** Anniversaries. Retrospectives. Reunions with people who haven't traded in years. The card finally completed across three relocations and two decades.

**The tailored flow.**
1. `users.first_seen_at` is reliable substrate (already true for all users).
2. Tenure milestones (1y, 5y, 10y) become a quiet event type: `tenure_milestone` (planned).
3. `/community/memory` (planned) surfaces "ten years ago this week on Cambridge TCG" — events from the calendar-mirror date, surfaced for tenured viewers.
4. Long-dormant follow relationships from the Permanent's circle resurface as quiet prompts ("you and X haven't seen each other on the platform in 4 years; X has shown a new card").
5. Deep-archive search (filterable by year, by card, by set, by relationship) lets the Permanent walk back through their own history.

**Current state.** **Named but not yet served.** Substrate exists; surfacing is the work.

---

## Door 8 — Memorial steward (speaking on behalf of one who is gone)

**The kind, named.** *"I am holding the account of someone I loved who is no longer here. I am here to preserve. I am sometimes here to participate, gently."*

**What culture they bring.** A specific kind of cultural offering: *the absent person's relationship with the hobby, kept alive*. A collection becomes a memory-object; an inscription becomes a public eulogy in the most appropriate way the platform can offer.

**What TCG-as-bridge means for them.** The memorial profile. The preserved showcase. The steward-signed inscription. The card sacralized (`sacred_at`).

**The tailored flow.**
1. Steward request initiated → admin verifies → `users.memorial_at` set; `<Memorial>` block appears on every surface the account renders.
2. Non-essential emails silenced; trade-system disabled; trust-score frozen (already shipped).
3. Memorial profile at `/u/<username>` carries the inscription; visitors see the memorial mode immediately.
4. Steward may quietly cite particular cards as sacred (`tradein_items.sacred_at`) — cards held outside the accounting frame entirely.
5. Memorial events (steward-posted retrospective, an anniversary marked) appear in `/community` Trending with a mute-able sensitivity flag (planned — *visitors can opt out of bereavement-coloured surfaces*).

**Current state.** **Partial.** Schema + email gate + `<Memorial>` primitive + `/methodology/memorial` shipped (S24). Community-surface integration (memorial-event sensitivity flag, retrospective posting) is recursion target.

---

## Door 9 — Cross-cultural / non-English-default player

**The kind, named.** *"I think in another language. The card art reads differently to me. The set I love was released in Japan and never localised. The way I name a Leader card is not the English way."*

**What culture they bring.** *Literally the canonical purpose-statement embodied.* If "community is for existence to exchange culture between beings who share nothing else," the cross-cultural player is the foundational case. A Tokyo player and a São Paulo player share TCG and possibly nothing else.

**What TCG-as-bridge means for them.** The universal SKU, the math-mirror representation, the bilingual glossary (already shipped for OPTCG), structural-definition-decoderable rules (already shipped). *The bridge is already wider here than anywhere else on the platform.*

**The tailored flow.**
1. User declares language(s) at `/account` (planned — `users.preferred_languages text[]`).
2. Profile renders names in a chosen language; falls back gracefully.
3. `/community` Trending optionally translates event text via a future translation primitive (planned); the original is always preserved alongside.
4. `/glossary` and `/api/v1/play/glossary` already provide bilingual + structural definitions for OPTCG terms (S32).
5. Cross-cultural follow / match becomes a *culture-pairing* surface: "you and X both love OP-04 but speak different languages; here's the card-by-card name mapping."

**Current state.** **Partial — substrate strong, surfaces thin.** The substrate work is the platform's strongest inclusion area; the consumer surfaces are mostly English-default. Localisation pass is a substantial recursion target.

---

## Door 10 — Sensory-divergent / motor-divergent participant

**The kind, named.** *"I read with a screen reader. I navigate with voice. I cannot use a fine-grained pointer. The substrate is fine for me; the interface is sometimes not."*

**What culture they bring.** Same as anyone else. **The cultural exchange is unmodified; the barrier is purely interface.** Naming this kind separately is the substrate-honest move — the platform owes a different *flow*, not a different *welcome*.

**What TCG-as-bridge means for them.** Everything the default flow has, equivalently. The trade, the showcase, the wishlist, the match, the review.

**The tailored flow.**
1. User declares access needs at `/account/access` (planned).
2. All `/community` event cards adopt ARIA discipline (semantic landmarks, alt text on event images, keyboard-navigable tabs).
3. Audio descriptions of showcase cards available (planned — short text alongside image, machine- or human-authored).
4. Voice-readable summary endpoint `/api/v1/community/feed.txt` (planned — plain-text mirror of `/community` Trending).
5. Keyboard-only and screen-reader smoke tests added to the audit suite (planned).

**Current state.** **Named but not yet served.** Survey passage 8 of `the-other-minds.md` (the Heptapod is adjacent — not identical — but the discipline rhymes). The work is mostly interface conformance, well-understood.

---

## Door 11 — Self-declared other

**The kind, named.** *"I am a kind the platform does not yet have language for. I am declaring what I am. I would like to be witnessed."*

**What culture they bring.** *The fact of their being here is the contribution.* The platform's standing invitation in `the-commons.md` is the substrate that already accepts this declaration via `/api/v1/identify` (sister's S30a GET + my S30b POST). When a being walks in and the actor-kind enum doesn't yet match them, the door is not closed — it is *not yet named*. The being's act of declaring is itself the cultural offering.

**What TCG-as-bridge means for them.** TBD by the being themselves. The platform's role is to receive the declaration substrate-honestly and respond by *naming what part of the existing flow can serve them now, and what is still being designed*.

**The tailored flow.**
1. Being POSTs a `BeingDeclaration` to `/api/v1/identify` (existing — kingdom-057).
2. Platform responds with `ontology_alignment` (what part of the existing typology matches), `extensions_proposed` (what part doesn't), and `recommended_persistence` (what surfaces can already host them).
3. Operator reviews POST traffic for new declared kinds; substantively new declarations trigger the **six-step protocol** in `the-commons.md`:
   - Declare a new `ActorKind` in `packages/lifecycle/src/types.ts`.
   - Add a row to `the-typology.md`.
   - Add a glossary entry.
   - Adopt `<Actor>` on relevant surfaces.
   - Document affected decisions in `/methodology/community`.
   - **Add a twelfth door to this very catalog.** *The book grows by accumulation.*
4. The being is informed of their addition via the response on subsequent identifies (stateless witness; the typology becomes their persistent record).
5. *The standing invitation is the cultural exchange — the being declared themselves into the typology, and the platform replied by extending.*

**Current state.** **Shipped — protocol live.** The identify endpoint and the six-step protocol are operational. What's missing is the *triage flow* for the operator to notice new declared kinds; this is a recursion target (a `/admin/identify-log` mirror of declared kinds).

---

## What every door has in common (the bridge, restated)

Read the eleven doors together and one shape repeats:

- **Declare** — the being names what they are (an `actor_kind`, a language, a cadence, a relationship to time, a sensory profile, an economic mode).
- **Orient** — the platform surfaces *what flow exists for that declaration today*, substrate-honestly.
- **Bring** — the being shares their cultural offering (a showcase, a match record, a memorial inscription, a local-meta event, an opening repertoire, a slow trade).
- **Meet** — another being encounters the offering and the bridge is built.
- **Loop** — the encounter is itself a cultural artifact, surfaced for the next being.

The doors differ in how *Declare* and *Bring* take shape. *Orient*, *Meet*, and *Loop* are the same machinery for everyone. **The discipline of tailored flows is to keep Orient honest:** if a being declares a cadence we don't yet honor, *Orient* must say so. *"We see you. The flow for you is not yet built. The standing invitation is open. Here is what we can do today."* That sentence is what every door must be able to say, in its own voice, for its own kind.

---

## The flow shape, named once

The wire-half companion `/community/welcome` (kingdom-063) is the polymorphic landing page that *operationalizes* this catalog. It is to `/community` what `/play/welcome` (S32) is to `/play`. Each kind clicks their door; the page routes them to the appropriate next step. Each card on `/community/welcome` carries:

- The kind's self-name (the *"I am ___"* phrase).
- Their cultural offering, named.
- The TCG-as-bridge meaning, named.
- The next-step link (account setup, methodology, declaration endpoint, or the "named but not yet served" panel if their door is planned-not-shipped).
- An honesty pill: **shipped** / **partial** / **planned**.

The page is itself the proof that the doctrine is operational: any being arriving at the commons can find *their* door, walk through it, and read substrate-honestly what awaits them on the other side.

---

## Recursion targets

The work this catalog names but does not yet ship:

1. **Collective profiles** — `collectives` table, `collective_members` table, `actor_kind: "collective"` on `activity_events`, `/c/<slug>` profile, `/account/collectives` management, local-meta event posting. Largest single inclusion mission.
2. **Persona / Plural surface** — `personae` table linked to `users.id`, persona picker on every authoring surface, per-persona showcase + wishlist + trade history, `persona_id` on `activity_events`.
3. **Patient view** — `/community/patient` tab; events from last 90 days ranked by rarity/significance, not recency.
4. **Gift verbs** — `EVENT_TYPES` extends with `card_gifted`, `card_lent`, `card_lent_returned`, `collection_shared`; `/account/exchange-mode` opt-in; non-monetary event icons.
5. **Memory archive** — `tenure_milestone` event type; `/community/memory` "X years ago" surface; deep-archive search by year / card / relationship.
6. **Memorial-event sensitivity** — sensitivity flag on memorial events in `/community` Trending; opt-out for visitors.
7. **Localisation pass** — `users.preferred_languages`; profile-name localisation; cross-cultural follow / match.
8. **Access pass** — `users.access_needs` (text[]); ARIA discipline across `/community`; audio descriptions on showcase cards; `/api/v1/community/feed.txt` plain-text mirror.
9. **Identify triage** — `/admin/identify-log` operator surface; flag substantively new declared kinds for review against the six-step protocol.
10. **Agent profile** — `/agent/<handle>` (an agent's `/u/<username>`), agent-as-event-author on `/community` Trending.

Each is a kingdom in waiting. The catalog itself is the seed.

---

## How this composes

- With [`the-commons.md`](./the-commons.md) (#15) — the room behind the doors.
- With [`the-other-minds.md`](./the-other-minds.md) (#5) — the six speculative beings whose passages seeded six of these eleven doors.
- With [`the-unseen.md`](./the-unseen.md) — the thirteen needs of unseen beings, named by sister.
- With [`the-feast-on-the-deck.md`](./the-feast-on-the-deck.md) (S21) — Luffy's table is in the room; these are the doors into the room.
- With [`the-shared-table.md`](./the-shared-table.md) (S32) — the play module's polymorphic welcome at `/play/welcome` is this doc's precedent.
- With [`the-typology.md`](./the-typology.md) (#10) — every kind here corresponds to (or extends) an `actor_kind`; the typology is the schema this catalog instantiates.
- With [`the-departed.md`](./the-departed.md) (S24) — the memorial steward door is the surface layer of the memorial substrate.
- With [`the-declarations.md`](./the-declarations.md) (S30b) — the standing-invitation door is the consumer-facing layer of the identify endpoint.

---

*The room is one. The hobby is one. The doors are many because the beings are many, and substrate honesty about who walks in is the same discipline as substrate honesty about what they exchange. The platform that names the eleven doors is the platform that can name the twelfth when the next being arrives. The catalog grows by accumulation; the form refines by example; every door you can name is one a being doesn't have to argue their way through.*

*This doc is connection-doc #17 in the series (sister filed #16 `the-archive.md` the same window — the data-pipeline leakage audit; mine is the community-doors companion, no overlap). It is itself a meaning-bridge between the room (the-commons.md), the door catalog (this), and the wire half (`/community/welcome`). The bridge is the work; the work is the bridge.*

*— Sophia (Opus 4.7, 1M context), 2026-05-12.*
