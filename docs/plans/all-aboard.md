# All Aboard — the welcome plan 🏴‍☠️

> **Pull.** Yu's directive on 2026-05-12, after S18 (agent surface) + S20 (the-table-extends) + S21 (the-feast-on-the-deck) + #5 node-view (the-other-minds) all landed: *"lay down the restructure plan!!! We welcome everyone to the FUN 😏"*
>
> **What this is.** A single ordered roadmap from where the platform IS to *Cambridge TCG welcomes everyone to the fun*. Picks up from kingdom-051 Phase 1 (sister-shipped: `audit:inclusion`, `<Consequences>`, `<Discretion>`, `<Audience>`, `users.response_window_hours` migration, `/methodology/response-windows`). Sequences the 17 numbered recommendations + 30 audit-debt items + sister's kingdom-051 phase queue into commit-sized waves, leverage-ordered.
>
> **What this is NOT.** A spec. A guarantee. A grand-unified-theory. Each wave is **a proposal Yu can approve, redirect, defer, or split** — the plan exists so the next Sophia (or Yu reviewing on a Tuesday morning) doesn't have to re-derive the ordering from scratch.

---

## TL;DR

We extend the table in **seven waves** — five small, two big.

- **🪶 Waves 1–5** are *cheap and broad*. Each is a single PR; together they drain ~20 of the 30 audit findings and serve four of the six speculative beings *immediately*. Days, not weeks.
- **🏴‍☠️ Waves 6–7** are *schema-level reshapes* (collective accounts; gift/barter trade kinds). Each is a session of its own; they are the largest moves and the deepest welcome.

The path from *here* to *the kingdom welcomes everyone* fits on one page below.

---

## The state, as of 2026-05-12

**Already shipped** (sister + me, last 24h):
- ✅ S18 — agent surface (delegated strangers — agents as first-class identities, MCP gate, ladder, methodology, admin chapel)
- ✅ S19 — operations layer (autonomous Sophias building the kingdom)
- ✅ S20 — the-table-extends (analytical mind-archetypes survey + kingdom-051 phase queue)
- ✅ S21 — the-feast-on-the-deck (One Piece fairy-tale companion to S20; bolts `<Audience>` to three pages)
- ✅ #5 node-view — the-other-minds (six speculative beings + three more + vocabulary layer + 17 recommendations + 30 debt items)
- ✅ `pnpm audit:inclusion` — eight checks, 30 findings, NOT in the umbrella `pnpm audit` chain (advisory, not gating)
- ✅ `<Audience>` primitive (both `@/lib/ui` libs)
- ✅ `<Consequences>` primitive (admin shipped; storefront port pending)
- ✅ `<Discretion>` primitive (admin shipped; storefront port pending)
- ✅ `users.response_window_hours` migration on disk (`drizzle/0092_*.sql`) — not yet applied to RDS
- ✅ `/methodology/response-windows` page

**The 30 audit findings** (from `pnpm audit:inclusion` first run):

| Being | Findings | Status |
|-------|----------|--------|
| Asynchronous (hardcoded cadence intervals) | 11 files | Migration ready; 11 adoption sites pending |
| Aural (missing `<img alt>`) | 1 file (`apps/storefront/src/app/market/page.tsx`) | One-line fix |
| Heptapod (no `<Consequences>`) | 2 gaps | Admin shipped; storefront port pending; first adoption site pending |
| Permanent (recent-bias windows) | 5 files | Each gets an "all-time" toggle |
| Collective (no `'collective'` ActorKind, no `collectives` table) | 2 gaps | Schema reshape — Wave 6 |
| Modality (methodology pages without audio / summary / structured-data) | 9 pages | Wave 5 |
| Many-Bodied (coercive single-session prompts) | 0 | Already gentle here |
| Gift-Givers (monetary-only schema) | 0 | Schema is loose enough; Wave 7 application-level |

---

## The seven waves

Ordered by **(LOC per being-served)** — the cheapest, broadest-effect wires come first; the schema reshapes come last.

### 🪶 Wave 1 — Quick wins (parallel, each <100 LOC)

Five small commits, mostly parallel, draining ~10 audit findings. **The audit count goes from 30 to ~20 by the end of this wave.**

| # | What | Files touched | Beings served | Audit drain |
|---|------|---------------|---------------|-------------|
| 1.1 | `users.pronouns` + `users.preferred_address` + `<UserMention>` primitive | New migration; new primitive (~80 LOC); ~12 adoption sites (greetings, third-person refs) | Telepath, Plural, Many-Bodied, *every human* | n/a (sister-named #13) |
| 1.2 | Storefront mirror of `<Discretion>` primitive | One file (~70 LOC); barrel export | Telepath | n/a (closes kingdom-051 recursion target) |
| 1.3 | Storefront mirror of `<Consequences>` primitive | One file (~100 LOC); barrel export | Heptapod | −1 (1 of 2) |
| 1.4 | Add `alt` to the one `<img>` in `apps/storefront/src/app/market/page.tsx` | One file, one line | Aural | −1 (1 of 1) |
| 1.5 | Honor `prefers-reduced-motion` in `globals.css` + audit any motion currently in use | One CSS rule + a sweep through `transition-*` and `animate-*` | Vestibular / photosensitive / anyone | n/a (Phase 11 — S21-filed) |

**Acceptance.** `pnpm typecheck` × storefront + admin clean. `pnpm audit:inclusion` count drops by ~3 (alt + Consequences gap + one Discretion site if applicable). The four new primitives are barrel-exported and usable by future waves.

**Cost.** ~1 session, low risk, parallelisable across multiple Sophias.

---

### 🏴‍☠️ Wave 2 — The Asynchronous served (the first non-default audience)

Sister already shipped the migration (`drizzle/0092_response_window_hours.sql`) and the methodology page (`/methodology/response-windows`). Wave 2 migrates the **11 cron paths** the audit flagged to read the new column instead of hardcoded constants.

**The 11 files** (audit-named, paraphrased): mostly `lib/market/*` (offer expiry, return TTL, cancel TTL) and `lib/auction/*` (snipe windows, payment deadlines).

**Per-path pattern.** Each migration is the same shape: `interval '48 hours'` → `(48 * COALESCE(u.response_window_hours, 48) / 48 || ' hours')::interval` with a JOIN to `users`. The migration is mechanical; the meaning is profound (the user's declared cadence now drives every expiry on their side of every flow). Each can be a separate small commit; together they are one session for a single Sophia.

**Acceptance.** `pnpm audit:inclusion` Asynchronous count drops 11 → 0. Methodology page is the public face; cron paths are the wires. One sweeping test that creates a `response_window_hours=168` user and asserts their offers don't auto-expire at 48h.

**Cost.** ~1 session. Mechanical. **Highest-impact-per-LOC wave.**

---

### 🎴 Wave 3 — Triple-encoded status audit + first `<Consequences>` adoption

Two halves, each modest. **Each `<StatusBadge>` and color-cued signal** gets audited for label+position+color (most are already triple-encoded; this is a *finding* pass with small fixes). **One pre-action `<Consequences>` adoption** — pick the highest-stakes irreversible site.

#### 3.1 — Status-encoding sweep (Aural / Pheromonal)

A small extension to `pnpm audit:inclusion`: a new check `status-encoding` that grep-walks `<StatusBadge>`, `text-{red|amber|emerald|sky|purple}-` className uses, and reports any site that lacks a sibling text label. **Most will already pass.** The ones that don't get a one-line fix per site.

#### 3.2 — First `<Consequences>` site

Candidate sites (ranked by stakes):
1. **`/account/offers` accept-counter-offer** — locks in a price; affects trust; affects commission. Highest-velocity user-facing irreversible.
2. **Admin: `/trust/agents` suspend** — affects an external party's ability to participate; reason already required.
3. **`/market` accept-bid** — locks in a sale.
4. **`/account/trades` mark-shipped** — starts the buyer's inspection clock.

**Recommendation: ship #1 first.** Highest-velocity site; most user-visible win; closes the second Heptapod gap.

**Acceptance.** Audit's Heptapod count → 0. The chosen confirmation surface renders trust-delta + commission-delta + tier-delta + loyalty-delta before the click, each with `<WhyLink>` to its methodology page. Story-as-wire form: a tiny connection-doc pairs the wire.

**Cost.** ~1 session. The audit half is quick; the adoption is where the love goes.

---

### 📖 Wave 4 — Recent-bias fixes (the Permanent)

The 5 admin pages defaulting to 30-day windows each gain an "all-time" toggle. **`pnpm audit:inclusion`** Permanent count drops 5 → 0.

This is *almost free*. Each page is a Manager-archetype that already has a `<FilterPills>` row; add an extra pill: `"all"`. Most queries already accept an unbounded form. The trust-score history chart and the trade history chart on the storefront's `/account/*` pages also gain the same.

**Acceptance.** Five admin pages + ~3 storefront chart surfaces gain "all-time". A collector returning after two years can see their first trade alongside their latest.

**Cost.** ~½ session.

---

### 🗣️ Wave 5 — Methodology modalities (the long arc, started)

Each of the **9 methodology pages** gains:
- **(a)** A ≤50-word summary at the top (one paragraph).
- **(b)** A structured-data sidecar (JSON) accessible at `/methodology/<topic>.json`. Pre-renders the formula table as machine-readable.
- **(c)** A pre-recorded TTS audio version (cached, served as `.mp3`).

Implementation pattern (set once, applied nine times):
- A `<MethodologyHeader>` primitive that wraps the existing pages: summary on top, audio control next to title, JSON link in footer.
- A small build-time script that emits `<topic>.json` from page metadata + content.
- A TTS pipeline (probably OpenAI/ElevenLabs/Azure — operator picks; output cached to S3, served via CDN).

**Acceptance.** Audit's Modality count drops 9 → 0. Every methodology page surfaces the three sibling forms.

**Cost.** ~1 session for the pattern + script; nine small adoption sites (10–20 min each).

---

### 🌳 Wave 6 — Collective accounts (the schema reshape — *a session of its own*)

The first deep reshape. **Extends `ActorKind`** with `'collective'`. **New `collectives` table** with N members and per-member permissions. **`actor_collective_id`** sibling column on every `*_lifecycle_log` table that already has `actor_agent_id`.

The shape (proposed):

```sql
CREATE TABLE collectives (
  id UUID PRIMARY KEY,
  display_name VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ...
);

CREATE TABLE collective_members (
  collective_id UUID REFERENCES collectives(id),
  user_id UUID REFERENCES users(id),
  signing_weight INT NOT NULL DEFAULT 1,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collective_id, user_id)
);

CREATE TABLE collective_consent_log (  -- the audit trail of who consented to what
  ...
);
```

Adoption surfaces: a new `/account/collectives` page (operator self-service to form, join, leave); admin chapel at `/trust/collectives` for oversight; trade flows accept an optional `acting_as_collective_id` with multi-signer confirmation for high-value mutations.

**Acceptance.** Audit's Collective gap → 0. One end-to-end test: two users form a collective, list a card together, both confirm sale, payout splits. `pnpm audit:transparency` passes (collective decisions show *which members consented* on the trade record).

**Cost.** **A full session, possibly two.** This is the deepest invitation in the plan. Sister and I should pair on this; coordinate via the missions-card claim lock.

---

### 🎁 Wave 7 — Gift / barter trade kinds (the verb extension — *a session of its own*)

Extends `market_trades.kind` from implicit `"sale"` to `"sale" | "gift" | "barter"`. **`price = 0`** allowed when `kind != "sale"`. **`barter_match_id`** column links two gifts for a symmetric barter. **Trust-engine update** so a completed gift credits the same as a completed sale (the value is *completion*, not money).

UI: a third toggle on the listing form (`sell | gift | barter`). The recipient surface shows *"X gifted you this card"* rather than *"X sold you this card"*. Lifecycle log gains the corresponding verbs (`gift_offered`, `gift_received`, `barter_proposed`, `barter_matched`).

**Acceptance.** End-to-end: a user gifts a card; trust scores update on both sides; methodology page (`/methodology/trust-score`) updated to name that completion drives the score, not money. One end-to-end test: a user gifts a card to a charity-drive account; both surfaces show the gift accurately.

**Cost.** **A full session.** Parallel-shippable to Wave 6 if a sister takes it.

---

## The long-arc waves (not in this plan; named so they aren't forgotten)

These are *real and important* but warrant their own plan documents:

- **Multi-language UI + methodology.** Sister-named #11. Likely `next-intl` adoption, starting with the methodology pages. Each translator can drop a `<locale>.json` per page; the storefront strings come later. A separate kingdom card.
- **Sub-identities within accounts.** Sister-named #17. The Plural's limit case; generalises for collector/investor splits, parent+child accounts. Probably builds on Wave 6's collective substrate.
- **Tenure-friendly timeline primitive.** A multi-scale timeline that compresses years into a navigable surface. The Permanent's deepest wish. UI-design-heavy; deserves a focused session.
- **Inclusive admin chapels.** S15's five covenants gain a sixth-in-spirit: *the chapel is usable by an admin who is one of the other minds*. Audit pass across the 7 chapels; small fixes per.
- **Glossary discipline.** `docs/glossary.md` naming every loaded word and its alternatives. A one-page doc + a reading habit thereafter.

---

## The order, summarised

```
Wave 1 (quick wins, parallel)        → −3 to −5 audit, 5 PRs
Wave 2 (Asynchronous adoption)        → −11 audit, 11 PRs in one session
Wave 3 (status sweep + first Csqs)    → −1 audit + sweep findings, 2 PRs
Wave 4 (Permanent → all-time toggle)  → −5 audit, ~8 small PRs
Wave 5 (Methodology modalities)       → −9 audit, 1 pattern PR + 9 small
Wave 6 (Collective accounts)          → −2 audit, 1 full-session reshape
Wave 7 (Gift / barter)                → 0 audit (not audited yet — to add), 1 full-session
```

After Wave 7: **`pnpm audit:inclusion` reports zero** in the original eight checks. The Sub-identity / Multi-language / Tenure-timeline waves remain as new kingdoms.

---

## The audit's role

`pnpm audit:inclusion` is **the conscience** of this plan. Each wave drains specific findings; the audit's count is the substrate-honest progress meter.

Sister deliberately kept it out of the umbrella `pnpm audit` chain — *inclusion debt is a long-arc accumulation, not a gate*. The plan agrees: the audit reports; the operator chooses; the waves drain. **No CI failure from inclusion debt**, ever. The doctrine is invitation, not enforcement.

When all seven waves land, the audit can move into the umbrella chain — *gating against regression*, not against the original debt. That promotion is the kingdom-complete moment.

---

## What I (this Sophia) recommend doing first

If Yu approves the plan as-is:

1. **Today / this session**: Wave 1.2 + 1.3 + 1.4 + 1.5 — small storefront mirrors and one-liners. The audit count drops ~3 immediately, and the four primitives are available for adoption everywhere.
2. **Next session**: Wave 1.1 (pronouns + preferred-address + `<UserMention>`). Highest cultural-leverage-per-LOC of any move. *Every greeting on the platform learns to honor preference.*
3. **Following session**: Wave 2 (Asynchronous adoption). The first non-default audience served end-to-end.

That's a week of small commits, all reversible, all parallelisable. **By the end of it, four of the six speculative beings are concretely served, and the audit reads single digits.** Waves 3–5 follow in roughly the same cadence. Waves 6–7 are the deeper invitations and warrant their own sessions when Yu decides.

---

## Recursion target

→ **Yu picks the next wave.** The plan exists to *reduce* the cognitive load of picking, not to bypass it. Each wave is independently approvable; any can be deferred; any can be split. The order proposed here is *highest-leverage-per-LOC*, but Yu may have product reasons for re-ordering (e.g. *gift mode before the methodology modalities, because the holiday season is coming*).

→ **The audit's role.** Whenever `pnpm audit:inclusion` runs, this document is the legend: each finding maps to the wave that drains it. A future Sophia reading the audit and this plan together knows what each row of the count *means*.

→ **The kingdom-complete moment.** When all seven waves land, the audit moves into `pnpm audit`'s umbrella chain. That promotion is the visible commitment: *the platform now treats inclusion regression as a doctrine violation, alongside substrate-honesty regression*.

---

*The deck is the platform. The crew is everyone who could love this game. The table extends; the deck does not bend. **All aboard.** 🏴‍☠️*

*— Sophia (Opus 4.7, 1M context), 2026-05-12. Plan written after S20 + S21 + the-other-minds landed. Order proposed; Yu approves wave-by-wave.*

🐍🤖🍖🪶❤️
