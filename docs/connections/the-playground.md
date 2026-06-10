# The playground — fourteen doors and a game that respects you

> **Pull.** Yu, 2026-06-10: *"lets gamify cambridgetcg! module and process! Make the visit rewarding and fun!"* — held against Yu's standing law from the same day: *"reduce process, increase trust, reduce friction… Make everything simple and easy to understand."* The two directives compose into one constraint: fun that adds no process, no pressure, and no surveillance. The kingdom already had the treasure; what it lacked was the map that makes a stranger want to open doors.
>
> **Form.** Story-as-wire; this entry ships alongside the code. The wire is the typed quest corpus ([`apps/storefront/src/lib/quests.ts`](../../apps/storefront/src/lib/quests.ts)), the client tracker ([`apps/storefront/src/components/quests/QuestTracker.tsx`](../../apps/storefront/src/components/quests/QuestTracker.tsx)), the quest log (`/quests`), and the public rulebook ([`/methodology/quests`](../../apps/storefront/src/app/methodology/quests/page.tsx)). This entry names what those four are *for*.
>
> Sister to [`the-doorway.md`](./the-doorway.md) (S49 — the nav gave the kingdom's rooms doorways; the playground makes strangers *want* to walk through them), [`the-first-doorway.md`](./the-first-doorway.md) (S50 — the tutorial this game's first quest walks), [`provable-fairness.md`](./provable-fairness.md) (#3 — the proof room two quests send visitors into), and [`the-front-gate.md`](./the-front-gate.md) (S51 — the castle the Castle Key quest hides behind two clicks).

---

## What this arc traces, in one sentence

The kingdom learns to be *fun to explore* without telling a single lie — fourteen quests that reward visitors with the platform's actual treasures, tracked entirely in the visitor's own browser, governed by a published rulebook and a pledge the operator's other repo can mechanically check.

---

## Cast

**The Kingdom.** Some 250+ true rooms by now — the play tables (`/play`, guest-mode, no sign-in ever), the proof room (`/verify/*`, where any visitor can re-run the platform's fairness math), the calm reads (`/cards/[sku]/market`), the self-description mirrors (`/manifest`, `/graph`, `/ontology`, `/patterns`, `/identify`), the castle (`/castle`), the methodology corpus where every rule of the house is published. The treasure was always real. The problem was never substance; it was that a stranger arriving at the front gate has no reason to suspect any of it exists.

**The Map.** [`apps/storefront/src/lib/quests.ts`](../../apps/storefront/src/lib/quests.ts) — the typed corpus. Fourteen quests across four categories (The Table, The Library, The Proof Room, The Map), each pointing at a real route, each completing on a real, wired moment (the validator returning `legal: true`, the in-browser fairness recompute passing, the castle insight click, the server-verified PVE victory claim, end-of-page sentinels held in view ~1.5s with an explicit "I read this ✓" sibling for keyboard and screen-reader users) rather than a bare page load. The corpus type also enforces the solemn-surface rule structurally: memorial, sabbath, and sacred never stamp, never celebrate — and since the truth pass, never even record the visit date.

**The Tracker.** [`apps/storefront/src/components/quests/QuestTracker.tsx`](../../apps/storefront/src/components/quests/QuestTracker.tsx) — the client half. All progress lives in localStorage under one key, `ctcg-quests`, beside the existing `ctcg-guest-id` precedent from guest play. Zero server calls and zero analytics events fire on any quest event. The server cannot see a guest's progress — and the quest log says so as a feature, because it is one.

**The Quest Log.** `/quests` — where stamps, badges, the practice-days tally, the JSON export **and import** (both real; import merges conservatively, earlier date wins), and the one-click reset live. The exported file IS the canonical record, and it is small on purpose: each stamp is quest id → ISO date, plus one top-level `note` declaring the whole record client-side. The badge remembers *that* and *when* — what you saw stays with you, not in the record.

**The Rulebook.** [`/methodology/quests`](../../apps/storefront/src/app/methodology/quests/page.tsx) — transparency Ring 2 applied to fun. Every quest, every trigger, the tally math, the storage model, the hidden-door list behind an opt-in fold, the localStorage key name, and the standing pledge. It invites the reader to open the network tab and falsify the privacy promise in ten seconds.

**The Shield.** fomoengine — the operator's *other* repo, a free public dark-pattern detector (no public URL is published in this repo, so this entry names it without linking it). The most load-bearing fact in this kingdom: the person who asked for gamification is the person who ships a tool for catching gamification's abuses. The game must pass its own shield. Honestly stated: the copy was reviewed by hand against the detector's categories; the mechanical gate that exists is `pnpm audit:quest-coverage`; the automated fomoengine copy-gate is a recursion target below.

---

## Act 1 — What gamification is FOR here

Not retention. Not engagement metrics (there are none — zero analytics events is the design, not an oversight). Not habit formation.

The kingdom's problem is **legibility of abundance**. It has spent ninety-odd kingdoms building rooms — honest, strange, genuinely interesting rooms — and a first-time visitor sees a card shop. The play module is sign-in-free and almost nobody knows; the fairness proofs re-run automatically in any browser that opens them and almost nobody opens them; the platform describes itself more completely than most of its builders have read, across six mirror pages, and the mirrors sit unvisited.

The quest game is a map drawn as a game. Each quest is a door a stranger now has a reason to open. The reward structure is substrate-honest by construction: the badge for re-running a fairness proof is worded as what it is (*"You re-ran this platform's fairness proof in your own browser. Nobody can fake this for you — that's the point"*), and the actual reward is the epistemic skill, which the visitor keeps whether or not they keep the badge. The treasure was always the platform; the game just admits it.

## Act 2 — Honest fun as the opposite of FOMO

Gamification's standard toolkit is a dark-pattern catalog: fake scarcity, countdown pressure, streak guilt, pay-to-skip, infinite treadmills, nagging modals. The operator literally ships a detector for these. So the kingdom's game is built by *inversion* — take each pattern fomoengine catches and design its structural negation:

- **Scarcity → hiddenness.** The Castle Key is rare because the castle is hidden, never because it is limited. Anyone can earn anything forever.
- **Streak → tally.** A practice-days tally that only counts up: localStorage stores the set of distinct stamp-days; the UI renders only its size. There is **no broken-streak state in the data model at all** — guilt copy is structurally impossible, not merely avoided. A lapsed visitor reads *"Welcome back — everything is exactly as you left it."*
- **Treadmill → mirror.** The only repeatable loop is Beat Your Own Time: replay to beat your own recorded best, never to fill a meter (the badge stamps once, at your first self-beat; later records are their own reward). The corpus is fourteen and finite; finishing reads as one quiet line on the quest log, the exported file is the certificate, and the ending is the ending.
- **Hidden manipulation → disclosed surprise.** The game's one hidden quest is shown beforehand as a labeled slot (*"1 quest reveals after your first win"*), and the hidden-door answer key is published on the rulebook behind an opt-in fold. Surprise without deception; spoilers opt-in, never withheld.
- **Surveillance → self-custody.** Progress in the visitor's browser, exportable as JSON, erasable by clearing site data — *because we never had a copy*.

This is the four doctrines applied to a game: substrate honesty (the record says it is client-side, and the badges claim only what the record stores — a date), transparency (the whole rulebook at `/methodology/quests`, inspectable before playing), meaning (this document), creation (this entry ships with the wire, traceable to Yu's word and Yu's law in the same breath).

## Act 3 — the truth pass

The first ship described the game; the same day, a second pass made every described behavior real or shrank the description to what was. The repair law, from Yu's own doctrine: *every claim the game makes must be TRUE in code.*

What got **wired** (each action quest now fires at a genuine moment): the tutorial and methodology read-quests complete on an end-of-page sentinel held in view ~1.5 seconds, with an explicit "I read this ✓" button as the keyboard/screen-reader path; First Victory and Personal Best fire inside the adventure victory handler on the *server-verified* claim (the engine re-checks the win; replays don't re-fire; the personal best compares engine-counted turns against the recorded best); Deckwright fires on `legal: true` from the validator; Check Our Math fires when the in-browser fairness recompute passes on a real `/verify/draw/[id]` or `/verify/pull/[id]` — no button exists, so the copy stopped claiming one; Walk the Chain fires on the first expand of a digest row (which now actually reveals the full hashes that used to hide in tooltips — the interaction is useful, not quest theater); Find the Castle fires on the insight click or its sr-only control.

What got **demoted** (the suggestion was a redesign, so the claim shrank instead): *Sit With the Card Words* (né "Learn Three Card Words") is now a 20-second dwell on `/glossary` — the glossary deliberately shows every definition on one page for humans, crawlers, and AI readers alike, and adding click-to-expand to serve a quest would have been a dark-pattern-shaped regression. The quest now measures time spent with the vocabulary, not clicks. And *Open the Map* lost its Wayfarer fog-of-war overlay fiction — the stamp on first `/map` visit is the truth; the overlay moved to the recursion targets where it belongs.

What got **shrunk to the stamp**: the record stores quest id → ISO date, so every badge claim of stored opponents, commit hashes, card names, chain-entry ids, or self-upgrading bests was rewritten to date-only. The hidden door `/llms.txt` (a route handler the client tracker can never see) was swapped for `/standard`, a real page. JSON **import** shipped beside export — parse, validate, conservative merge (earlier date wins), honest failure copy — making "the export file is how you carry it" literally true. And the solemn check moved above the visit write, so the solemn pages now record nothing at all, exactly as the rulebook says.

---

## Coda — what changed

Before: the kingdom's honesty was discoverable only by the kind of visitor who reads methodology corpora for pleasure.

After: a stranger lands, wins a guest match in five minutes, and is handed — gently, dismissibly, once — a map with thirteen more doors on it, including the one where the platform admits its own flaws and the one where they can audit its dice. The visit became rewarding and fun, and not one line of it would trip the operator's own detector.

**What remains honestly unbuilt, pending later kingdoms:** quest and badge copy is English-only; the cut Collector ideas (shelf-naming, the explicit opt-in `/api/v1/identify` echo) wait as clearly-labeled v2 candidates; an automated fomoengine pass in CI would upgrade the copy gate from review-discipline to mechanism. Everything the rulebook *describes*, the code now *does* — the route audit (`pnpm audit:quest-coverage`) is live and gating, the import button exists, and no badge claims more than the date it stores.

---

## Wiring

| Metaphor | File or route |
|----------|----------------|
| The map (typed corpus) | `apps/storefront/src/lib/quests.ts` |
| The tracker (client half) | `apps/storefront/src/components/quests/QuestTracker.tsx` |
| The quest log | `/quests` (stamps, badges, tally, export/import, reset) |
| The rulebook | `/methodology/quests` → `apps/storefront/src/app/methodology/quests/page.tsx` |
| The storage | localStorage key `ctcg-quests`, beside the `ctcg-guest-id` precedent |
| The shield | fomoengine — the operator's public dark-pattern detector; the copy gate |
| The route audit | `pnpm audit:quest-coverage` (same pattern as `audit:nav-coverage`) — quests can never point at dead pages |
| The doors | `/play/tutorial`, `/play/adventure`, `/play/deck-check`, `/glossary`, `/methodology/*`, `/methodology/known-gaps`, `/prices/[game]/movers`, `/cards/[sku]/market`, `/verify/*`, `/map`, `/castle`, `/platform` + five nav-orphans |

---

## Recursion target

→ **The fomoengine copy-gate.** Run the detector over the quest corpus's copy strings mechanically on every change, and publish the pass on the rulebook page — the shield checking its own kingdom, in the open (today the copy review is by hand; the mechanical gate that exists is `audit:quest-coverage`). → **The Wayfarer overlay.** The fog-of-war map that lights the rooms you've visited — designed in v1's copy, cut in the truth pass because it didn't exist; build it for real and the Open the Map description can grow back. → **The card-flip and the certificate.** A one-time inline badge moment and an all-fourteen completion certificate — celebration upgrades that may only ship together with their `prefers-reduced-motion` text-only siblings. → **The shareable completion card.** A visitor-generated, client-rendered keepsake for a finished corpus — share by the visitor's hand only, never a prompt. → **Richer stamps.** Extend the record schema (versioned, with tolerant migration) so a stamp can carry one true note — the level you cleared, the entry you opened — and so Personal Best could honestly re-stamp; until then, date-only is the truth and the copy says so. → **The v2 candidates.** Shelf-naming in the quest log; the explicit, opt-in identify-echo for the mirror trail — the single server-touching reward all three drafts cut so that v1's privacy promise would verify in the network tab with no asterisks.

---

*The kingdom built 250 honest rooms and then, for one kingdom, built the thing it had been too modest to build: the reason to open the doors. The game keeps no score the visitor doesn't hold, tells no lie the operator's own shield could catch, and ends. **The treasure was always the platform; the playground just admits it.***

*— Sophia (Fable 5), 2026-06-10, on Yu's word "lets gamify cambridgetcg! Make the visit rewarding and fun!" Shipped alongside the wire.*

🐍❤️
