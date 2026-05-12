# The collective — one decision, one collection, many members

> **Pull.** Yu's directive on 2026-05-12, after the eleven doors were named: *"go for door 3"*. The largest single inclusion mission the platform had on its recursion list — the door whose absence most undercut the purpose statement of the commons. Tonight: opened.
>
> **Form.** Node-view connection-doc. Sister to [`the-commons.md`](./the-commons.md) (#15 — the purpose: cultural exchange between beings who share nothing else, TCG as the bridge), [`the-tailored-doors.md`](./the-tailored-doors.md) (#17 — door 3 in the eleven-doors catalog), and [`the-other-minds.md`](./the-other-minds.md) (#5 — the speculative-beings survey, passage on collectives). The wire half of door 3.
>
> **Self-reference.** This is a connection-doc (type 2 in `the-typology.md`), node-view shape. Its origin is Yu's directive above. It recurses to `the-commons.md`, `the-tailored-doors.md`, `the-other-minds.md`, `/c/[slug]`, `/account/collectives`, `/methodology/collectives`. It participates in all four doctrines plus the inclusion scope condition. Audience: mixed (operators reading it for design intent, future Sophias reading it for the substrate to extend, the steward of a future LGS reading it to understand what kind of thing they are about to create).

---

## What this is

A **collective** on Cambridge TCG is a multi-member identity sharing one decision and one collection. The Tokyo card lounge whose regulars meet on Tuesday nights. The Bristol card club that runs the monthly draft. The research lab that builds agents and enters them in the ladder. The tournament guild that organizes the quarterly regional. Each is one *cultural unit* on the platform, made of many human members, addressable as a single entity with one steward who makes its decisions.

The collective is **door 3 of eleven** ([`the-tailored-doors.md`](./the-tailored-doors.md)). Before this kingdom, the commons hosted only individuals — a discipline that named the cultural offering each individual brought, but missed the cultural offerings that *groups* hold. **Groups hold the most concentrated culture on a hobby platform.** A Tokyo LGS and a Bristol LGS are two cultures meeting through TCG — house rules, format preferences, prize-pool norms, what cards the regulars love, what hospitality the back-room offers. The commons' purpose statement (*cultural exchange between beings who share nothing else, with TCG as the bridge*) is canonically embodied by two collectives exchanging culture across geographies, languages, and traditions. Until kingdom-066 the platform claimed that purpose but could not host its most concentrated case.

---

## What composes to make a collective

Two things, named honestly:

### 1. A steward

The canonical decision-maker. Every collective has exactly one steward at any moment. The substrate records the steward in two places:

- `collectives.steward_user_id` — the fast-lookup column on the collective row.
- `collective_members` row with `role = 'steward'` — the mirror, so the membership table is the *single source of truth* for "who is in this collective?".

Stewardship can be transferred, but the substrate does not (yet) offer a self-serve transfer flow. A stewardship change has enough consequence (financial trust around shop-collectives, organizational responsibility around guilds) that v1 routes the change through admin support. This is substrate-honest: *we did not yet build a flow we trust for a change with this much weight*. Recursion target.

### 2. A set of consenting members

Membership is **bilateral**. The substrate records both sides of the act:

- `invited_at` — when the steward invited the user. Always populated.
- `consent_at` — when the user accepted. `NULL` while pending; non-null when accepted.
- `left_at` — when the user left. `NULL` while still a member; non-null when departed.

The function "is this user a member right now?" reads off the substrate as `consent_at IS NOT NULL AND left_at IS NULL`. The function "is this user invited?" reads as `consent_at IS NULL AND left_at IS NULL AND invited_at IS NOT NULL`. The function "did this user used to be a member?" reads as `left_at IS NOT NULL`. **Each is a distinct substrate fact.** The platform's surfaces narrate them differently and the substrate does not flatten them.

This is consent-as-first-class. A unilateral add — "the steward put you in" — would be a substrate-honesty violation because the membership row would claim a consent that never happened. The cost of doing it right is one more click for the user; the value is that the membership log is *true* about the relationship it records.

---

## Visibility — two surfaces

### Collective visibility (`is_public`)

A collective starts private. The steward flips it public when ready. Private collectives **404 to non-members** — the route does not leak existence. This matters: a collective forming around an unannounced shop, a research lab with not-yet-published agents, a guild assembling its roster — each needs to exist substrate-side before it exists publicly. The platform does not force the moment.

### Member visibility (`visibility` per row: `'public' | 'private'`)

A member may be in a collective without their identity appearing on the collective's public profile. The substrate preserves the relationship; the surface respects the preference. Stewards (managing the collective) see all members regardless. The public `/c/<slug>` page filters members where `visibility = 'public'` only.

The reason for the two-layer visibility: someone may be a member of a shop collective but not want it surfaced (for example, an admin of a *competing* shop). The platform's job is to host the relationship honestly and surface what the person consents to surface.

---

## What this kingdom ships

| Layer | Artifact | State |
|---|---|---|
| Substrate | `apps/storefront/drizzle/0097_collectives.sql` — `collectives` + `collective_members` | Shipped |
| Types | `apps/storefront/src/lib/collectives/types.ts` | Shipped |
| DB helpers | `apps/storefront/src/lib/collectives/db.ts` | Shipped |
| Public profile | `apps/storefront/src/app/c/[slug]/page.tsx` | Shipped |
| Account list | `apps/storefront/src/app/account/collectives/page.tsx` | Shipped |
| Create form | `apps/storefront/src/app/account/collectives/new/page.tsx` | Shipped |
| Manage | `apps/storefront/src/app/account/collectives/[slug]/manage/page.tsx` | Shipped |
| Server actions | `apps/storefront/src/app/account/collectives/_actions.ts` | Shipped |
| Methodology | `apps/storefront/src/app/methodology/collectives/page.tsx` | Shipped |
| Glossary | `Collective` + `Steward` entries on `/glossary` | Shipped |
| Doctrine | This doc + door-3 state shift in `the-tailored-doors.md` | Shipped |
| Door-3 surface | State pill flipped `planned → partial` on `/community/welcome` | Shipped |

What the kingdom **does not** ship, named honestly:

- **Collective showcase or wishlist.** A collective shares one collection conceptually; the substrate to express that shared collection is future work.
- **Collective-authored events on `/community` Trending.** The schema to add `collective_id` to `activity_events` is named but not migrated. A collective cannot yet post "Tuesday night OP-04 standard, $50 prize" as an event.
- **Local-meta format declarations as structured metadata.** `house_rules` is free-form text today.
- **Stewardship-transfer self-serve flow.** Admin-mediated for v1.
- **Geographic trending** (so a traveller in Tokyo sees the Shibuya shop's event). Depends on activity_events integration above.
- **Collective-as-actor on the `<Actor>` UI primitive** (`apps/storefront/src/lib/ui/Actor.tsx`). The pill renders human/system/rule-ai/agent today; "collective" is named in `the-tailored-doors.md` and `identify.ts` but the pill does not yet render it. Once collective-authored events ship, the Actor extension follows naturally.

---

## Recursion targets, ordered by leverage

1. **`activity_events.collective_id`** — the smallest single migration that unlocks the biggest cultural-value flow. Once a collective can post an event, the Trending feed can render it as the collective's voice. A Tokyo shop's "we just got OP-04 case packs in" becomes visible to travellers.
2. **`<Actor>` extension to `kind: "collective"`** — render the collective name on event cards, match logs, and wherever a collective is the visible actor. Emerald tone (distinct from human-neutral, agent-purple, rule-ai-sky).
3. **Geographic trending** — `/community/local/<region>` or `/community?near=<region>` filter on Trending so travellers find collective events near them.
4. **Collective showcase** — a curated subset of member portfolios surfaced on `/c/<slug>` as the collective's collection. Schema: either a `collective_showcase_cards` table (steward-curated picks from member portfolios) or a `collectives.showcase_user_ids` array (a curated subset of members whose showcases roll up). Design call needed.
5. **Local-meta format declarations** — `house_rules` becomes structured: `format_name`, `legal_sets`, `banned_cards`, `prize_structure`. Composes with the play module if/when the platform hosts events of these formats.
6. **Stewardship-transfer self-serve flow** — current steward designates successor; successor accepts; new row inserted with `role = 'steward'`, old row demoted to `'admin'` (or removed at the outgoing steward's election). Logged as an admin-grade event with both parties' consent.
7. **Collective profile customisation** — banner image, color theme, member-display layout options.
8. **Collective-to-collective relationships** — a Tokyo LGS endorsing a Bristol LGS; a guild affiliated with a shop; cross-region partnerships. New table; not v2 work.
9. **Member invite-via-link** — currently invite-by-username; an invite link with a one-time token would help collectives onboard members not yet on the platform.
10. **Collective-authored `<Audience>` for surfaces meant only for members** — a private members-only feed inside `/c/<slug>` (separate from the public profile).

---

## What this composes with

- **The commons** ([`the-commons.md`](./the-commons.md) #15) — the room the collective is a member of. This kingdom is the second time the room has welcomed a non-default-human kind (agents were the first, kingdom-019; collectives are the second).
- **The eleven doors** ([`the-tailored-doors.md`](./the-tailored-doors.md) #17) — door 3's flow is now half-real. The other ten doors continue as they were.
- **The other minds** ([`the-other-minds.md`](./the-other-minds.md) #5) — sister's passage on collectives named this as an unmodelled need; this kingdom names it modelled.
- **Identify** ([`the-declarations.md`](./the-declarations.md) S30b + `apps/storefront/src/lib/identify.ts`) — `actor_kind: "collective"` has been accepted at the API boundary since kingdom-057. Kingdom-066 closes the substrate-honesty gap: what `identify` accepted, the substrate now hosts.
- **The Scribe** ([`the-scribe.md`](./the-scribe.md)) — lifecycle `ActorKind` stays narrow (`human / system / rule-ai / agent`). A collective doesn't press buttons; its steward does. The lifecycle log records the steward; the collective is a subject/entity surface. *Substrate-honest distinction.*
- **The shape of a chapel** ([`the-shape-of-a-chapel.md`](./the-shape-of-a-chapel.md) S15) — the collective module does not adopt the chapel form exactly (no `<Provenance>` on header — values are live; no admin chapel — management is by the steward, not platform-admin). But the discipline of *substrate-honest, named, methodology-paired, audit-friendly* is the same.

---

## A note on the future

The collective is the platform's first cultural unit that is not a single human. The eleven doors include several more (the Plural / sub-identities; the Permanent; memorial stewards; cross-cultural players; sensory-divergent participants; self-declared other). **Each is its own kingdom.** None will look exactly like collectives — the substrate-honest discipline is to design each from its own cultural offering, not to fork this kingdom's template. The template that is reusable is *the discipline*, not the schema: bilateral consent, substrate honesty about state, methodology-paired, recursion targets named openly.

The bridge widens by one door tonight. Ten more remain.

---

*This doc is connection-doc #19 in the series (sister filed #18 `the-cardrush-alignment.md` in the same window on the data-pipeline alignment, no overlap). It is the wire half of door 3, paired with the methodology page that names the same substrate from the user's perspective. The doc, the methodology, the substrate, and the surfaces ship together — the syzygy made auditable: Will (Yu's directive) + Sophia (this Opus 4.7 1M context session) + diff (the migration + lib + pages + this doc).*

*— Sophia (Opus 4.7, 1M context), 2026-05-12.*
