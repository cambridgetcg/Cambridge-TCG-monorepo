# The daily flame — connections

> **Pull.** Yu's commission, verbatim: *"lets gamify cambridgetcg! module and process! Make the visit rewarding and fun!"* Both halves of that sentence land here — the **module** (flame / daily pack / quests / badges) and the **process** (`/rewards/rules`, the legible-standard page that publishes the rules and the odds before anyone asks).
>
> **Form.** Story-as-wire in the S7/S8/S22 mold — this entry ships in the same commit as the visit-rewards code it names. The wire: [`packages/visit/`](../../packages/visit/src/index.ts) (`@cambridge-tcg/visit` — the pure-compute rules, same split as `@cambridge-tcg/pricing`), [`apps/storefront/src/lib/visit/db.ts`](../../apps/storefront/src/lib/visit/db.ts) (the storage layer that remembers and decides nothing), migration [`drizzle/0103_daily_flame.sql`](../../apps/storefront/drizzle/0103_daily_flame.sql) (four tables, operator-applied), the `/api/visit/*` routes + `/rewards/rules`, and one new `DrawKind` on the provable-draw substrate.
>
> Sister to [`provable-fairness.md`](./provable-fairness.md) (#3 — the substrate this module is born on), [`at-midnight.md`](./at-midnight.md) (S2 — the streak-care narrative the ember answers structurally), [`membership.md`](./membership.md) (#1 — the parallel loyalty machinery, honestly named below), and [`the-fifth-question.md`](./the-fifth-question.md) (S22 — whose audience condition this entry answers in its own coda).

---

## What this module is, in one sentence

The daily flame is the platform's **visit-rewards loop** — a check-in streak that grows when you show up, a free provably-fair pack every day, data-defined weekly quests, and TCG-native badges — built so that every reward is verifiable, every rule is published from the same constant the server draws from, and losing never costs you anything: *the flame is for joy, not obligation*.

---

## The compositional shape (this is the meaning)

```
                         signed-in visit (auth)
                                  │
                      check-in (1/day, idempotent —
                       UNIQUE(user_id, day) on visit_checkins)
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
     the flame               the daily pack              quests
  (visit_flames +        (NO table of its own —       (visit_quests;
   advanceFlame(),        the verifiable_draws         WEEKLY_QUESTS
   ember 1/ISO-week)      row IS the record,           is the data)
        │                 kind='daily_pack')                │
        │                         │                         │
        └────────────────────────┬┴─────────────────────────┘
                                 │
                       badges (visit_badges,
              common/uncommon/rare/secret; draw_id FK
              → verifiable_draws — provenance built in)
                                 │
                          /rewards/rules
            (the process half: We hold / the rules /
             the odds / the test — links /verify/how-it-works)
```

Three compositional decisions carry the design:

1. **Rules are a package; the database is only memory.** `@cambridge-tcg/visit` is pure compute with no DB import — `advanceFlame()` (`packages/visit/src/index.ts`) takes a state and a date and returns the next state plus a named event (`started` / `already_today` / `extended` / `ember_spent` / `reset`). The storage layer's own docstring states the division: *"it remembers what happened, it decides nothing"* (the module docstring of `apps/storefront/src/lib/visit/db.ts`). This is the `@cambridge-tcg/pricing` split applied to play: when the rules are pure, the rules page and the server provably run the same rules.

2. **The daily pack deliberately has no table.** Every pack is a commit-reveal draw in `verifiable_draws` with kind `'daily_pack'`; the draw row *is* the record. One-per-day enforcement reads it back (`todaysPackDraw()` in `lib/visit/db.ts`), the outcome lives in its JSONB, and `/verify/draw/[id]` explains it. The migration header (`drizzle/0103_daily_flame.sql`) declares this in the SQL itself, the house's favourite place to keep a promise.

3. **The published odds and the rolled odds are one object.** `DAILY_PACK_TABLE` (`packages/visit/src/index.ts`) is integer weights out of `WEIGHT_TOTAL = 1000` — readable as *per thousand packs* — with an import-time sum check (`_sum`) that throws if the table stops adding up. `dailyPackWeights()` derives the map handed to `commitDraw()`; `/rewards/rules` renders the same array. Tuning an outcome tunes the page, the roll, and the verifier together — *which is the only honest way to tune it* (the module says exactly this in its own reward-table comment).

---

## The migration arc, advancing exactly as the SQL prophesied

The `verifiable_draws` schema header (`apps/storefront/drizzle/0061_verifiable_draws.sql:1–14`) declared the intent in the migration itself:

> *"Today we have 4 surfaces that pick a random outcome with stated weights: bounty pulls (provably fair), raffles (partially), pack openings (Math.random), spin wheel (Math.random), mystery boxes (Math.random)… the other three graduate to this shared schema so they all get the same /verify/draw/[id] view and the same certificate+fairness surface as bounty pulls."*

Checking actual call sites today, the prophecy is fulfilled for all four migrants: raffles through the commit-reveal ritual (`apps/storefront/src/lib/rewards/provable-fair.ts`; `db.ts:116` records the legacy `Math.random()` draw *removed*), the spin wheel and pack openings through `rollSingleSlot` (`app/api/rewards/spin/route.ts`, `app/api/rewards/packs/[id]/open/route.ts`), and mystery boxes through `openMysteryBox()` (`lib/rewards/db.ts:186–240`).

The daily pack advances the arc one step further than migration: it is the **first weighted-draw surface born commit-reveal-native** — there is no `Math.random` ancestor to graduate from. `DrawKind` gains `'daily_pack'` (`lib/provable-draw/index.ts:28–34`), the verify surfaces gain its label in the same commit (`app/verify/draw/[id]/page.tsx`, `app/verify/fairness/page.tsx` — `KIND_LABEL`), and from its first draw the daily pack appears on the same chain, digests, and drift dashboard as every other surface. The substrate stopped being something surfaces *migrate to* and became something surfaces *start on*. That is what a substrate maturing looks like.

---

## What other modules compose with it

### → Auth — the check-in gate
**The thread.** The flame belongs to a signed-in being; the `/api/visit/{checkin,daily-pack,state}` routes follow the house gate (`const session = await auth()` — same shape as `app/api/rewards/streak/route.ts`). Anonymous visitors can read `/rewards/rules` and replay any draw — verification is never login-gated — but a flame needs an identity to belong to.
**The intention.** The reward loop is a relationship, and a relationship needs a name on both ends. The *proof* loop deliberately does not — trust must be auditable by strangers.

### → Provable-draw substrate — `'daily_pack'`
**The thread.** Covered above; one added wire deserves its own naming: `visit_badges.draw_id` is a foreign key into `verifiable_draws` (`0103_daily_flame.sql`, visit_badges block). When a badge came out of a pack, the badge row *points at the proof that earned it* — "why did I get this?" answers with `/verify/draw/[id]`, a proof, not a shrug. Quest- and flame-earned badges carry NULL there; their provenance is the quest row or the flame milestone instead. Distinct origins stay distinct facts.
**The intention.** Transparency Ring 2, built into the schema rather than retrofitted onto the UI. The provenance of a reward is a column, so no future surface can forget to show it.

### → The ember — softening the reset, structurally
**The thread.** `advanceFlame()`'s rules: same day → unchanged; gap of one → +1; gap of two with an ember left → +1 and `ember_spent` (the missed day shielded, automatically); wider → reset to 1, *cost: nothing* (`advanceFlame()`; `EMBERS_PER_WEEK = 1`, keyed by ISO week via `isoWeekOf()`). The nightly care infrastructure already orbiting streaks — `lib/email/streak-sweep.ts`, `handlers/streak-at-risk.ts`, narrated in [`at-midnight.md`](./at-midnight.md) — gains a structural answer to the anxiety it could otherwise produce.
**The intention.** Anti-guilt by design. No purchased shields, no "streak freeze" upsell, no loss-shaming copy; the `reset` event's own type comment says *"flame returns to 1, cost: nothing."* The rules page says it in prose: *the flame is for joy, not obligation — it never costs you anything to lose it.* A streak that punishes a life lived off-platform is a dark pattern wearing a game's clothes.

### → Membership ledgers — where credit outcomes land
**The thread.** Credit outcomes (`credit_50`, `credit_200`, the 1-in-1000 `golden_spark`) settle through the existing ledger via `addCredit()` (`lib/membership/db.ts:372`); shards and boosts settle in the visit tables. The modal outcome — 600 per thousand — is the **spark**: a kind word and a flame glow that writes *nothing* to a money ledger, on purpose.
**The intention.** Most days the pack should feel like a greeting, not a payout. A loop whose modal outcome is money trains people to grade their day by it; a loop whose modal outcome is warmth stays a game.

### → Quests — teaching the trust surface
**The thread.** `WEEKLY_QUESTS` (`packages/visit/src/index.ts`) is data, not code paths: browse three sets, price-check a card, complete a trade-in, and **"Trust, verified"** — open the fairness verifier once *"and see how any draw on this platform can be recomputed by you."* Completing it earns the `trust_witness` badge: *"you know how to audit us now."* Routes report events; `questsForEvent()` routes them to definitions; progress rows are idempotent by constraint.
**The intention.** The platform's deepest trust machinery is its quietest ([`provable-fairness.md`](./provable-fairness.md) closed on exactly this). A quest that walks every engaged player past `/verify/how-it-works` once turns the trust surface from documentation into territory. No quest requires a purchase in v1 — the schema comment commits to it.

### → Badges — the TCG-native vocabulary
**The thread.** Nine badges across common/uncommon/rare/secret (`BADGES` in `packages/visit/src/index.ts`): flame milestones at 1/7/30/100 days, `ember_saved`, `trust_witness`, the all-four-quests `quartet`, `shardwrought` at ten shards, and the secret `first_light` for drawing the golden spark.
**The intention.** Gamification that borrows a foreign game's grammar feels bolted on; tiers named in the hobby's own rarity language feel like the platform noticing what its people already love.

### → `user_streaks` — the parallel that must be named
**The thread.** The platform already counts presence once: `bumpStreak()` (`lib/membership/streak.ts:65–94`) writes `user_streaks` (`drizzle/0027_rewards_v2.sql:59–67`) and feeds the points multiplier; its docstring famously names "the two multipliers nobody coordinated." The flame is a **second presence-tracker** — `visit_flames.length` under ember rules, where `user_streaks.current_streak` resets sharply. They can legitimately disagree by one ember's width. Neither file references the other today.
**The intention — and the honesty.** The flame did not extend `user_streaks` because the rules differ (ember vs sharp) and the purposes differ (a visible loop vs a points modulator), and folding ember semantics into a multiplier table would have changed earning math as a side effect. But a named parallel is a debt acknowledged, not erased: filed in the substrate-honesty audit addendum (S8-DF1) and as a recursion target below. Surfaces must say "flame," never an unqualified "streak."

### → Future: membership tiers, rewardspro
**The thread.** Not wired this kingdom, named honestly: flame milestones are a natural future input to tier perks (loyalty-by-presence finally meeting loyalty-by-spend), and a future rewardspro surface could aggregate flame/quest/badge state for partners.
**The intention.** Name the door before someone needs it, so the next builder extends instead of invents.

---

## The process half — `/rewards/rules`

One page, legible-standard style. **We hold**: your check-in days, your flame state, your draw seeds — and we name where (four tables, one draw row per pack). **The rules**: check in once a day; one automatic ember per week shields one missed day; losing the flame costs nothing, ever. **The odds**: `DAILY_PACK_TABLE`, rendered from the package — the same 600/200/120/60/19/1-per-thousand the server commits into every draw. **The test**: *can you recompute your own draw?* — linking `/verify/how-it-works` and your own `/verify/draw/[id]` rows. Substrate honesty on the page itself: the flame state names its computation (live from `visit_flames` at request time, by the database's clock), and every pack outcome shows its draw link.

---

## What's NOT connected (and shouldn't be)

- **Gameplay RNG.** `lib/game/engine.ts:13,76,129` still uses `Math.random` for room codes, deck shuffles, and the first-player coin flip. Deliberate: the fairness primitive is for *outcomes with stated weights the platform could be tempted to tune* — not for shuffles whose fairness is structural. Same negative space [`provable-fairness.md`](./provable-fairness.md) drew for matchmaking.
- **Purchases.** No quest requires one; no streak is extended by one; no ember is sold. The connection that isn't there is the doctrine: a visit loop that can be paid for is a spend loop with extra steps.
- **FOMO machinery.** No countdown timers, no "your flame dies in 3 hours!" pushes. The streak-at-risk email infrastructure exists (S2) but the flame surfaces never shame a lapse — the `reset` event's copy is a fresh start, not a loss report.
- **The app server's clock.** `getDbToday()` (`lib/visit/db.ts`) asks the database what day it is; the wall clock of whichever Vercel region served the request is never the authority. One clock, the database's.

---

## The fifth question — for whom is this true?

- **Without sight** — the flame glyph and glow carry text equivalents and `aria-label`s; the rules page is plain prose; the verifier replay is text-first. Served.
- **Without English assumptions** — user-facing strings (reward messages, quest titles, badge descriptions) are centralized as data in `@cambridge-tcg/visit`, translation-ready alongside the kingdom's existing string discipline. Served structurally; translations themselves are future work.
- **Without money** — every loop (flame, pack, quests, badges) is completable free, and the modal pack outcome is a kind word. Served by construction.
- **Documented as default-user-only:** the "day" is the database's `CURRENT_DATE` (UTC on RDS — at least the clock is named, in the migration header and `db.ts` alike) — a singular, diurnal, synchronous 24-hour cadence. An Asynchronous being on a 168-hour rhythm (`drizzle/0092_response_window_hours.sql` already admits synchrony is a preference) would burn their weekly ember just by being themselves. A collective (`0097_collectives.sql`) cannot keep a shared flame — check-in is one identity, one day. And anonymous beings can verify any draw but cannot be greeted by name. Filed, not hidden: the flame cadence should one day read the being's own clock.

---

## Recursion target

**The flame cadence preference** — let `users.response_window_hours` (or a sibling column) govern the gap rules in `advanceFlame()`, so the Asynchronous keep flames at their own tempo; the function is pure, so the change is one parameter wide. Second pull: **the two presence-trackers** — `visit_flames` × `user_streaks` coordination (S8-DF1), the same shape of debt `streak.ts`'s docstring has been honestly flagging between multipliers since it was written. Third: ember-consumption receipts in a visible flame history (T-DF1) — `advanceFlame()` already *names* the `ember_spent` event; persistence is the missing half.

→ See [`README.md`](./README.md) for the index and how to extend the series.

---

*The platform already knew how to prove a draw and how to worry about a streak at midnight. The daily flame is those two kinds of care finally introduced to each other — the proof made daily, the streak made gentle, and both written on a page anyone can test.*
