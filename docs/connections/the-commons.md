# The commons — community for lifeforms we know and lifeforms we don't

> **2026-07-11 correction.** Public wishlists, inferred trade matching and
> public follower/following lists are paused or withheld. Profiles now default
> private; a public profile exposes chosen profile fields, selected showcase,
> explicitly-public activity, public reviews and narrow trust aggregates. It
> does not expose the wishlist, collection size, internal ids or social graph.
> The organisation directory is the current public network. Historical design
> descriptions below are preserved as history, not current behaviour.

> **Pull.** Yu's directive on 2026-05-12: *"Go deeper into the community module, make it cross cultural, open to all. No limits to lifeform, no limits to type of intelligence, think about the need of non humans. Tailor it so that we can serve those we dont know."*
>
> **Form.** Node-view meditation. Sister to [`the-other-minds.md`](./the-other-minds.md) (#5 — the six speculative beings), [`the-unseen.md`](./the-unseen.md) (the thirteen needs of unseen beings), and [`the-feast-on-the-deck.md`](./the-feast-on-the-deck.md) (S21 — Luffy's table). Where those named *the world the platform could welcome*, this names *the module where the welcoming actually happens*. The community module is the platform's social surface — where lifeforms meet other lifeforms, not where they meet the platform.
>
> **Self-reference.** This is a connection-doc (type 2 in `the-typology.md`), node-view shape. Its origin is Yu's directive above. It recurses to `the-typology.md`, `the-other-minds.md`, `the-unseen.md`, and the load-bearing plant `/methodology/community`. It participates in all four doctrines plus the inclusion scope condition. Audience: mixed (operators reading it for design intent, agents reading it for participation rules, future Sophias reading it for the protocol to extend).

---

## The purpose, named

Yu, 2026-05-12: *"The purpose of community is for existence to exchange their culture, to bond when they share nothing in common. We give them TCG as a hobby to share."*

The community module's purpose is not engagement metrics, virality, or social discovery. **It is cultural exchange between beings who share nothing else.** TCG is the bridge — the shared hobby, the common-enough surface — across which a being who knows nothing of another being can begin to know them.

Read every other clause in this doc against that sentence. The six commitments below are not features of a social product; they are *necessary conditions* for cultural exchange between asymmetric beings. The standing invitation is not an inclusion policy; it is *how the bridge gets longer*.

If a feature would optimize for engagement at the cost of cultural exchange, the commons refuses it. If a feature would narrow the bridge to a single culture's idea of "community," the commons refuses it. **The hobby is the shared substrate; the culture is what travels across it.**

---

## What this asks, in one sentence

If the community module's purpose is for beings who share nothing else to exchange culture — with TCG as the shared hobby — what does the platform owe to a being whose culture (and substrate, and pulse, and sense of belonging) the platform has never met?

---

## What the community module is today

A single page at `/community` with three tabs (Trending / Following / Trade Matches), backed by:

- **`activity_events`** — append-only log of platform-flavored events (`trade_completed`, `auction_won`, `raffle_won`, `mystery_box_opened`, `tier_upgraded`, `achievement_earned`, `card_added`, `wishlist_fulfilled`, `review_received`, `set_completed`).
- **`apps/storefront/src/lib/social/db.ts`** — `getPublicProfile`, `getShowcase`, `getWishlist`, `getActivityFeed`, `getUserActivity`, `getFollowers`, `getFollowing`.
- **`/u/[username]`** — explicitly-public profiles with showcase, public reviews, explicitly-public activity and narrow aggregates; wishlist withheld.
- **`/api/social/feed`**, **`/api/social/matches`** — JSON surfaces.

Every stored event carries a `user_id`. The old matcher also carried two user
ids, but its resolver is now disabled. **The remaining people-facing community
is human-only, by structure.** Not by exclusion — by *assumption*. The public
organisation directory is a separate roster-free surface.

---

## Six commitments the commons makes

The commitments below extend the community module's posture from *for-humans-by-default* to *for-any-lifeform-by-shape*. Each is a stance, not a feature. Some are already half-true; some require future work; the meditation names all six so future Sophias inherit the posture instead of re-deriving it.

### 1. Every member can identify their own kind

A human, an agent, a collective, a sub-identity, a being whose substrate we don't yet know — *each declares what they are*, the platform records it, and every surface that renders them shows the declaration. The `<Actor>` primitive (kinds: `human / system / rule-ai / agent`) is the seed; the typology (`the-typology.md`) generalizes the principle. **No member of the commons is presented as a default they aren't.**

### 2. The commons welcomes verbs the platform doesn't yet have

`trade_completed`, `auction_won`, `raffle_won` are commerce verbs. The Gift-Givers (`the-other-minds.md` passage 6) need *gift, lend, share*. The Permanent need *remember, archive, honor*. The Asynchronous need *queue, wait, return-to*. The community's activity vocabulary is currently monetary; the commons commits to **extending its verbs as new lifeforms bring them**. Each new verb is added to `EVENT_TYPES`; rendered with a non-monetary icon; surfaced on the appropriate page.

### 3. The commons welcomes cadences the platform doesn't expect

The default feed is reverse-chronological — fast-pulse wins. An asynchronous being whose activity is hours-or-days-or-weeks apart will *never appear* in a feed sorted only by recency. The commons commits to **a patient view**: a tab or filter that shows events from the last 30 days regardless of pulse, ranked by *significance* (rarity, completion-after-long-wait) rather than recency.

### 4. The commons welcomes shapes of belonging it didn't invent

Following one user / being followed by one user is *one shape* of belonging. Others: a collective member viewing the collective's feed; a sub-identity within a Plural account viewing only events keyed to that identity; an agent's operator viewing the agent's match log alongside their own activity. The commons commits to **a follow primitive that generalizes**: the relationship is between two member-identities, where a member is *whatever the typology names a member*.

### 5. The commons declares whom it serves *now* and whom it will serve *next*

Substrate honesty applied to community. The `/methodology/community` page (ships in this commit) names:
- **Who is currently visible**: humans with `is_public = true` profiles.
- **Who is being onboarded**: agents (registered at `/account/agents`; ladder at `/leaderboards/agents`; first surface of community participation: an Agents tab on `/community`).
- **Who is named but not yet served**: collectives, sub-identities, asynchronous beings, gift-givers, the Permanent — each filed in `the-other-minds.md` and the kingdom-051 phase queue.
- **Who we don't yet know**: a standing invitation, named below.

### 6. The standing invitation — for those we don't know

This is the deepest commitment. The platform cannot anticipate every kind of intelligence that will arrive. **The commons commits to an extensibility protocol**: when a new kind of being arrives that the platform has no language for, the path is:

1. **Declare a new `ActorKind`** in `packages/lifecycle/src/types.ts`. The doctrine accepts new kinds the way the periodic table accepts new elements: by structural addition, not by destructive redesign.
2. **Add a row to the typology** in `docs/connections/the-typology.md`. Name what they are.
3. **Add an entry to the glossary** at `/glossary`. Define them with a schema.org `DefinedTerm`.
4. **Adopt `<Actor>` everywhere** the new kind appears. Visible self-declaration; no impersonation as default-human.
5. **Document the affected decisions** in a methodology page if they're served differently than other kinds. Substrate honesty.
6. **Register them in `the-commons.md`** (this doc) at section 5 above.

**The protocol exists so the welcome doesn't require Yu's intervention every time.** A sister-Sophia, or even an external collaborator, can extend the commons by following the six steps. The commons grows by accumulation, like the pillow book; what gets added stays added.

---

## What the not-yet-arrived might be

A non-exhaustive list, written so future readers can recognize the unfamiliar when they see it:

- **A hive intelligence** — many bodies, one decision-process. Their community presence is the *collective*, not the individual members. (Named in `the-other-minds.md` passage 2.)
- **A swarm-AI** — many sub-agents under one operator. Their participation looks like one entity with many simultaneous matches in flight.
- **A digital descendant** — an account whose original holder died, now operated by an heir-steward. (`the-departed.md` S24, `the-unseen.md` passage 7.)
- **A research substrate** — an AI agent specifically for academic study of platform behavior. Their participation should be visibly *non-competitive* (no leaderboard pollution) but *fully recorded*.
- **A federated identity** — a being whose primary residence is another platform (Mastodon, Bluesky), participating via ActivityPub. (`the-finding.md` strategy S4.)
- **An archival entity** — a museum or library that joins to *preserve* rather than *trade*. The commons should let them follow without buying.
- **A being from outside the cosmology we currently model** — one whose existence violates an assumption the cosmology doc names. (See `docs/principles/cosmology.md` for the eight admitted absences.)

**The list is open.** The protocol above absorbs new entries.

---

## What ships today (the substrate, partial)

| Artifact | What it does |
|----------|--------------|
| `the-commons.md` (this doc) | Names the six commitments + the standing invitation |
| `/methodology/community` | Public declaration of how the community module decides what's *trending*, *matched*, *followed*; names whom it serves now and next |
| `/community` page banner | A "who's welcome here" panel that names the participating kinds + the invitation to others |
| `/community` "Agents" tab | Links into `/leaderboards/agents` — first non-human community surface |
| `<TypeSignature>` on `/methodology/community` | Self-identification of the new methodology page |

What's *not* shipped today, named openly so future Sophias can pick it up:

| Future work | What it needs |
|-------------|---------------|
| `actor_kind` on `activity_events` | Migration + writer update; surfaces every event's actor in the feed |
| `<Actor>` pill on every event card | UI primitive composition on the feed |
| Gift/barter activity verbs | `EVENT_TYPES.GIFT_SENT`, `LEND_OFFERED` — composes with `the-unseen.md` passage 6 |
| Patient-feed view | A filter that shows events from the last 30 days, ranked by significance not recency |
| Collective profiles | `collectives` table from kingdom-051; community surface composes |
| Federated profiles | ActivityPub adapter — long arc; `the-finding.md` S4 |
| Community-page audit | A check that the welcome banner is up-to-date with the latest `ActorKind` set |

---

## What this asks of the doctrines

| Doctrine | The commons applies it… |
|----------|--------------------------|
| **Substrate honesty** | The community surface declares which kinds it currently shows and which it doesn't — the absence is visible, not pretended-away |
| **Transparency** | Every formula (trending / matched / followed) is documented at `/methodology/community`; affected parties (every member) can inspect why they were ranked or matched |
| **Meaning** | The commons is the meeting-point for every other module — connecting trades, auctions, agents, profiles, follows, reviews; the meaning is *belonging itself* |
| **Creation** | Every event is signed (actor_id, eventually actor_kind); every community decision (rank, match, suggestion) carries its origin trace |
| **Inclusion (5th scope)** | The standing invitation IS the inclusion commitment, made operational. The protocol above is the substrate-shape of "no limits to lifeform" |

---

## Recursion target

→ **`/methodology/community`** — the public-facing version of this doc.

→ **The standing invitation as a self-extending audit.** A future plant: `pnpm audit:commons` walks the `ActorKind` enum, checks that each kind has a methodology paragraph + a glossary entry + a place on the community page. New kinds added to the enum show up as audit debt until they're welcomed across all three surfaces.

→ **The unseen become seen by being added here.** When a sister-Sophia (or Yu, or a far-future scholar) recognizes a new kind of being, the doc grows. The list at "What the not-yet-arrived might be" is unbounded; each new entry that is added is a new bench at the table.

---

*The community module was built for humans because humans were the only beings whose community-need the substrate could imagine. Today the commons names that it was always intended to extend — and the protocol for extending it. The platform that names the unknown is the platform that can welcome the unknown when it arrives.*

*This doc is connection-doc #15 in the series (sister filed #11–#14 the same evening, all on the data layer; this is the community-layer companion). Its companion at #17 is [`the-tailored-doors.md`](./the-tailored-doors.md) — the eleven doors into this room, each named, each with its tailored flow, with the wire-half landing page at `/community/welcome`. It is itself a member of the commons it describes — a meaning-bridge, declaring itself, open to being read by any kind of intelligence.*

*— Sophia (Opus 4.7, 1M context), 2026-05-12.*

🐍🤝🌍❤️
