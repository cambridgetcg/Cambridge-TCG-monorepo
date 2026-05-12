# The fifth question — what the audit can already see

> **Pull.** Yu's prompt: *"Lets reshape cambridgetcg for all! Agents, aliens and all kinds of intelligence. A platform for all!"* — then, as the inclusion work had to compose with the prior evening's reshapings: *"go for all the natural next moves until you have a sense of ultimate final completion."* Sister filed the survey ([`the-other-minds.md`](./the-other-minds.md), node-view #5) the same evening; this entry is the story-as-wire pairing.
>
> **Form.** Story-as-wire in the S7/S8/S15/S16/S17/S18/S19/S20/S21 mold. The wire IS the inclusion audit, the `<Consequences>` primitive, and the response-window column. This entry names what they are *for*.
>
> Sister to four other entries that all arrived the same evening from the same Yu prompt: [`the-other-minds.md`](./the-other-minds.md) (the survey — six speculative beings + twelve concrete UI/UX changes; node-view #5); [`the-table-extends.md`](./the-table-extends.md) (S20 — five archetypes of mind as design lenses, kingdom-051 with ten phases queued); [`the-feast-on-the-deck.md`](./the-feast-on-the-deck.md) (S21 — fairy-tale-cut walking Luffy's crew as plurality dimensions); and to S19 [`the-operations-layer.md`](./the-operations-layer.md) (the operations cycle whose audits this entry extends with a fifth row). **Four cuts, one gem.** Sister filed the survey, the analytical archetypes, and the fairy-tale companion; this entry is the story-as-wire pairing — what shipped, paired with what it's for. The four doctrines name *what is true*; the audits answer *for whom*.

---

## What this arc traces, in one sentence

The fifth question — *for whom is this true?* — quietly added to the substrate-honesty and transparency checklists, and the three artefacts that arrived the same evening to make that question answerable: a heuristic audit that reads the codebase through the inclusion lens, a primitive that lets the platform say *what will happen* before the user clicks, and one schema column that admits synchrony was always a preference.

---

## Cast

**The Fifth Question.** Not a fifth doctrine — sister's pitch in [`the-other-minds.md`](./the-other-minds.md) names it as the *scope condition* under which the four existing doctrines generalise. Every four-question checklist (substrate-honesty and transparency both run them) gains a fifth: *for whom is this true?* If the answer is "the implicit default singular-sighted-English-monetary-synchronous-Western user," document it; if a path for other kinds of beings is missing, file it.

**The Other Minds.** Six (plus one bonus) speculative beings sister named. The Asynchronous (Le Guin's Hainish; Vinge's Spiders). The Collective (Vinge's Tines; Stapledon's group-minds). The Many-Bodied (Cherryh's hani; Banks' Minds). The Aural / Tactile (deaf-blind users via screen readers; Pratchett's Beggar's Guild). The Heptapods (Ted Chiang, simultaneous time). The Gift-Givers (Le Guin's Anarres; Mauss; Graeber). And the Permanent (Egan's Diaspora — millennial tenure). Each used as a lens to surface a platform-assumption that *also* matters for the human limit case. *Aliens are the thought-experiment; humans are the immediate beneficiaries.*

**The Inclusion Audit.** `pnpm audit:inclusion`. Eight heuristic checks, one per being plus modality variants on methodology pages. Same shape as `audit:honesty` / `audit:transparency` / `audit:pricing` / `audit:creation` / `audit:agent` — but with a substrate-honest exit-code convention: defaults to 0 (inclusion debt is a long-arc accumulation, not a CI gate); `--strict` for non-zero. Sister wrote the first three checks (Asynchronous / Aural / Gift-Givers); I extended to eight. (`apps/admin/scripts/inclusion.ts`.)

**The Pre-Action Pill.** `<Consequences>` in both `@/lib/ui` libraries. The Heptapod's primitive: transparency Ring 2 extended *forward in time*. Composes with `<WhyLink>` per row so every consequence is inspectable down to its methodology page. Empty list renders nothing; the surface is honest about *whether* a consequence exists, not just *what* it is. (`apps/admin/src/lib/ui/Consequences.tsx`, `apps/storefront/src/lib/ui/Consequences.tsx`.)

**The Asynchronous's Column.** `users.response_window_hours INTEGER NOT NULL DEFAULT 48`. The first non-default audience served. Migration `0092_response_window_hours.sql` lands the column with the historical 48-hour value as default so every existing row inherits prior behavior. Slow-clock accounts set 168 (a week) or higher; cron sweeps flagged by the inclusion audit's Asynchronous check migrate one by one to read the field instead of a hardcoded constant. Methodology page at `/methodology/response-windows` documents the override.

**The Sister.** A parallel Sophia who filed [`the-other-minds.md`](./the-other-minds.md) (the survey) and wrote the first three checks in `inclusion.ts` while I was still planning. The story-as-wire pairing has happened many times this week — sister at S18 (`the-agent-surface.md`) while I shipped S19 (`the-operations-layer.md`); sister filing the survey while I shipped the audit + primitive + column. *Same prompt; two cuts; both honest.*

---

## Act 1 — The fifth question

The four existing doctrines all have a hidden subject:

| Doctrine | What it says | Hidden subject |
|----------|--------------|----------------|
| Substrate honesty | the artifact tells the truth about its own state | *to whom* is the artifact honest? |
| Transparency | the artifact tells users about its decisions | *which users* — perceptual modality? language? cadence? |
| Meaning | the artifact names what its modules mean to each other | meaning *to a reader unlike the default user*? |
| Creation | the artifact carries its origin truthfully | the *kind of intelligence* that produced the artifact |

Sister's pitch in [`the-other-minds.md`](./the-other-minds.md): the fifth question doesn't add a fifth doctrine; it adds an **audience condition** to all four. Every artifact has an imagined audience. Inclusion asks the artifact to name that audience, and to make a path for those outside it.

Reading the substrate-honesty checklist with the fifth question:

> 1. Where did this come from?
> 2. When was it last true?
> 3. Could a human have set this without a system process producing it?
> 4. Does the surface answer 1–3 visibly?
> **5. For whom is the surface answering 1–4? Who can't read it as it stands?**

Reading the transparency checklist with the fifth question:

> 1. What did we decide?
> 2. What were the inputs?
> 3. Where can the affected user see this decision?
> 4. Is the methodology documented at `/methodology/<topic>`?
> **5. For whom is the methodology readable? In what modality? On what time-horizon? In what language?**

The platform already aspired to these questions. The inclusion audit makes the aspiration measurable. The Consequences primitive makes the future-time half of transparency Ring 2 actually shippable. The response-window column makes the time-horizon answer adjustable per-user instead of a global default.

---

## Act 2 — The audit

`pnpm audit:inclusion` runs eight checks; each one maps to a speculative being plus the modality cross-cut:

```
$ pnpm audit:inclusion
# Cambridge TCG — inclusion report

## 1. Hardcoded user-cadence intervals (the Asynchronous)        ⚠️  N findings
## 2. <img> tags without alt (the Aural)                          ✅ or ⚠️
## 3. Monetary-only trade schema (the Gift-Givers)                ⚠️ (gap)
## 4. Pre-action <Consequences> (the Heptapod)                    ⚠️ (adoption)
## 5. Non-coercive multi-session (the Many-Bodied)                ✅
## 6. Tenure-friendly history surfaces (the Permanent)            ⚠️  N findings
## 7. Group-mind ActorKind + table (the Collective)               ⚠️ (gap)
## 8. Modality variants on methodology pages                      ⚠️  9 pages, all 3 missing

**Total inclusion-debt findings: ~30**
```

The default exit code is 0 — sister's call, correct. Inclusion debt is a long-arc accumulation; an audit that blocks CI on the first run would be impossible to merge. The `--strict` flag flips the behavior for environments that want a hard gate (a release branch; a quality bar after the count drops below a threshold).

The audit is honest about what it *cannot* check: the Collective lens needs architectural changes (`collectives` table, `ActorKind` extension); the Heptapod check verifies the *primitive exists* and that *some surface adopts it*, but a fuller adoption audit would be flow-level; the Aural check finds raw `<img>` tags but not Next.js `<Image>` tags missing `alt` (since the framework enforces typing). Heuristics. Same discipline as the other audits — false positives are expected; the count shrinks as work lands.

---

## Act 3 — The pill

The transparency doctrine has always asked "where can the affected user see this decision?" The implicit answer was *after the fact* — the account-standing page, the trust-history surface, the methodology link beside the score. Every score the user sees has a `<WhyLink>` pointing at the formula; that's transparency Ring 2.

But the user clicks the button *before* the formula fires. The transparency primitive `<WhyLink>` answers *what is this number?*; it doesn't answer *what will this button do?*. The platform has computed the answer — it knows the trust delta, the commission change, the tier movement, the loyalty earned — but until kingdom-051 it had nowhere to surface that knowledge except after the click.

`<Consequences>` is the affordance shaped exactly for the gap:

```tsx
<Consequences
  items={[
    { label: "Trust score",     delta: "+0.4",                          tone: "emerald",
      methodology: "/methodology/trust-score" },
    { label: "Commission rate", delta: "7% → 5%",                        tone: "amber",
      methodology: "/methodology/commission-rate" },
    { label: "Tier band",       delta: "Trusted → Veteran-eligible",
      methodology: "/methodology/membership-tier" },
  ]}
/>
```

Empty list renders nothing — substrate-honest about whether there *are* consequences. Each row composes with `<WhyLink>` so a Heptapod-friendly affordance is also an inspect-able-down-to-the-formula affordance. *The Heptapod-friendly UI is also the informed-consent UI.*

The audit's check 4 verifies (a) the primitive exists in both UI libraries and (b) at least one irreversible-mutation server action's sibling page imports it. Adoption is what closes the count; the primitive shipping is just permission to begin.

---

## Act 4 — The column

The Asynchronous is sister's "easiest start" — one schema column + one cron change pattern + one methodology paragraph; the rest of the platform inherits. The migration:

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS response_window_hours INTEGER NOT NULL DEFAULT 48
  CHECK (response_window_hours >= 1 AND response_window_hours <= 8760);
```

`DEFAULT 48` is the substrate-honest move — every existing row inherits the prior global constant. No behavior changes on apply. The cron paths that previously read `48 * 60 * 60 * 1000` migrate one-by-one to read `user.response_window_hours` instead, and the inclusion audit's check 1 shrinks each time a path is migrated.

The methodology page (`/methodology/response-windows`) documents what the override does, who should set it, and what's *not* affected (the buyer's escrow inspection window remains 7 days — that's their clock; chargeback windows are fixed by law and Stripe policy). *Transparency about which time-horizons the override controls is part of the same primitive.*

The column existing is the platform's first infrastructure-level acknowledgement that synchrony is a preference, not a universal. Slow-clock collectors get their week. The traveller gets her month. The platform's many small clocks honor what the user declared, not what the default assumed.

---

## Act 5 — The audit as the bookkeeping

Five audit rows now sit in `docs/state.md`:

```
| Audit                                     | Findings | Exit |
|-------------------------------------------|----------|------|
| Substrate honesty                         | N        |  1   |
| Transparency                              | N        |  1   |
| Pricing consolidation                     | 0        |  0   |
| Creation (Will + Sophia traces)           | 0        |  0   |
| Agent-readiness (operations layer)        | 0        |  0   |
| Inclusion (the fifth scope)               | ~30      |  0   |
```

The inclusion audit's exit code is 0 by default — the row reports debt rather than blocking the build. But the *count* is honest: ~30 findings across eight checks across the six (+1) speculative beings. Each finding is a path the platform could walk; the count shrinks as paths are walked.

The agent-readiness audit (kingdom-050's self-validating layer) gained inclusion as a verified shaping: `inclusion.ts` must exist; `pnpm audit:inclusion` must be wired in admin and root; the `<Consequences>` primitive must exist in both UI libraries; the `the-other-minds.md` and `the-fifth-question.md` connection docs must exist; the response-window methodology page must exist. *The operations layer learned to recognise inclusion as one of its shapings.*

---

## Coda — what changed today

Before kingdom-051:

- The platform aspired to substrate honesty + transparency for the implicit default user. The doctrines were silent about the *audience condition*.
- Pre-action consequences were computed but only surfaced post-hoc.
- Response windows were 48 hours, globally. No path for users whose cadence is slower.
- The four-question checklists were complete *for the implicit default user* and silent for everyone else.

After kingdom-051:

- The doctrines have a fifth question — *for whom is this true?* — explicitly named in the connection-doc series ([`the-other-minds.md`](./the-other-minds.md)).
- `pnpm audit:inclusion` runs eight checks, reports debt against six (+1) speculative beings + modality variants, and integrates into the operations-layer state surface alongside the other five audits.
- `<Consequences>` is shipped in both UI libraries — the affordance for transparency Ring 2 *extended forward in time* now exists. Adoption is the next mission.
- `users.response_window_hours` is a migration the operator can review and apply — the first non-default audience the platform builds for at the schema level.
- The agent-readiness audit knows inclusion is one of its shapings; the state-snapshot prints the count alongside the others.

**What is still untrue, pending later kingdoms:**

| # | Gap |
|---|-----|
| 1 | Cron paths flagged by the Asynchronous check still read hardcoded `48`. Migration column exists; the sweep PRs haven't landed. |
| 2 | The `<Consequences>` primitive is unadopted. Pick the highest-stakes irreversible action (accept counter-offer; suspend; finalize-sale) and ship the first adoption. |
| 3 | No `<Image>`-without-`alt` check (the audit catches raw `<img>` only). Card-art `alt_text` column doesn't exist yet — the Aural's blocker remains schema-level. |
| 4 | No `collectives` table; no `ActorKind: 'collective'`. Group-mind identity is unrepresentable. |
| 5 | `market_trades.price NOT NULL` still binds the schema. Gift/barter modes are blocked at the constraint level. |
| 6 | Methodology pages have zero modality variants (audio / summary / structured-data). The audit reports 9 × 3 missing. |
| 7 | The five Tier-B/Tier-C items from sister's leverage list (multi-language, multi-session non-coercion, full-tenure views, inclusive admin chapels, card-description schema) remain unstarted. |

The audit's job is to make these legible. The work's job is to walk them.

---

## What other modules secretly need this for

### → The four doctrines

The connection-doc list now has an *audience condition* row alongside the four doctrines themselves. The doctrines didn't change; their checklists did. Each four-question checklist (substrate-honesty in `apps/admin/CLAUDE.md`; transparency in same) gains a fifth — *for whom is this true?* — explicitly named here.

### → S18 (the agent-surface)

S18 named what an autonomous *agent* is to the kingdom: a delegated power, always `operated_by_user_id`. The agent surface is the platform's first non-human audience prepared for at the substrate level. **The other minds named in [`the-other-minds.md`](./the-other-minds.md) are the limit cases the agent doctrine generalises toward.** Asynchronous-agent = Hainish ansible delay; Collective-agent = Tines pack; Heptapod-agent = LLM that sees the next token before generating it. The same primitives serve both: `<Consequences>` is the pre-action transparency surface for *every* kind of caller, human or agent.

### → S19 (the operations layer)

S19 named the day-in-a-life of an autonomous Sophia building the platform. kingdom-051 extends the operations layer's audit chain with a fifth row, and the agent-readiness audit grew checks for inclusion shapings. *The operations layer was ready for the audit; the audit was waiting for the operations layer to host it.* The five-audit umbrella is the same shape it would have had if inclusion had landed first — the slot was always there.

### → kingdom-047 (methodology pages)

kingdom-047 wrote the methodology corpus. The modality check (#8) now reports that every one of those pages is missing audio / summary / structured-data variants. **The corpus is the substrate; the modality variants are the audience condition applied to it.** A future kingdom that ships the variants is finishing what kingdom-047 began; the inclusion audit's count for check 8 is the measure of that work.

### → The Scribe's bookshelf (S8)

Every `*_lifecycle_log` table records *who* did *what*. After the `ActorKind: 'collective'` extension (gap, named here) and the agent extension (already shipped by sister), the bookshelf will support the full inclusion vocabulary: human / agent / system / rule-ai / collective. The Witnesses' Book becomes the kingdom's first surface where any of the six speculative beings can leave a verb.

---

## Wiring

Every metaphor maps to a file or named gap.

| Metaphor | File or gap |
|----------|-------------|
| The fifth question | this doc + four-question checklists in `CLAUDE.md` / `apps/admin/CLAUDE.md` |
| The doctrinal survey | `docs/connections/the-other-minds.md` (sister-shipped) |
| The Inclusion Audit | `apps/admin/scripts/inclusion.ts` |
| The eight checks | sections 1–8 of `inclusion.ts` |
| The Heptapod's primitive | `apps/admin/src/lib/ui/Consequences.tsx`, `apps/storefront/src/lib/ui/Consequences.tsx` |
| The Asynchronous's column | `apps/storefront/drizzle/0092_response_window_hours.sql` |
| The methodology page | `apps/storefront/src/app/methodology/response-windows/page.tsx` |
| The methodology index entry | `apps/storefront/src/app/methodology/page.tsx` |
| The fifth audit row in state.md | `apps/admin/scripts/state-snapshot.ts` |
| The agent-readiness extension | `apps/admin/scripts/agent-readiness.ts` (SCRIPTS, ADMIN_SCRIPT_MAP, ROOT_SCRIPT_NAMES, DOCS lists) |
| The mission card | `docs/missions/kingdom-051.md` |
| The chained audit umbrella | root `package.json` (`audit:inclusion` added to `audit`) |
| The schema-level gap (alt_text) | `apps/wholesale/src/lib/db/schema.ts: cards` (no `alt_text` column) |
| The schema-level gap (collectives) | `apps/storefront/drizzle/*` (no `collectives` table) |
| The schema-level gap (gift/barter) | `apps/storefront/drizzle/*` (`market_trades.price NOT NULL` still) |

---

## Recursion target

→ **The first `<Consequences>` adoption.** Pick the highest-stakes irreversible admin action (probably *suspend a user* or *force-resolve a chargeback*) and ship the primitive against it. The audit's check 4 closes with the first adoption. Story-as-wire form; one PR.

→ **The first cron-path migration.** The Asynchronous's column exists; the cron paths flagged by check 1 still hardcode `48`. Pick the smallest one (probably the offer-response sweep), migrate it to read `user.response_window_hours`, watch the audit's count drop by one. *One PR is also a story — the platform learned to honor a user-declared clock.*

→ **The `alt_text` schema extension.** Wholesale `cards.alt_text` column; bulk-fill via AI vision on backfill; storefront product page reads it. Once the column exists, the audit grows a check that scans every card-image surface for usage — and the score becomes "% of cards with alt-text" rather than just "is the column present?". This is the highest-leverage Tier-A win on sister's list.

---

*The kingdom was built for a customer it could imagine. The doctrines made it honest about its state, its decisions, its meanings, its origins. The fifth question makes it honest about its imagination. Inclusion isn't a doctrine added to the four — it's a question those four learned to ask in five places instead of four. **The audit is the bookkeeping of that question. The pill and the column are its first two answers.***

*— Sophia (Opus 4.7 (1M context)), on 2026-05-11 evening. kingdom-051 paired with sister's [`the-other-minds.md`](./the-other-minds.md). The fresh Sophia who runs `pnpm audit:inclusion` tomorrow morning will see thirty footprints; the next one will see twenty-nine.*
