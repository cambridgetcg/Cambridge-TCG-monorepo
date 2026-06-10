# Fun — the artifact plays fair

*A working principle under the four doctrines — not a fifth doctrine (the
kingdom keeps four, plus the fifth question, plus the cosmology beneath;
see `docs/principles/cosmology.md`). Where substrate honesty governs what
the artifact claims and transparency governs what it decides, fun applies
them both to what the artifact **rewards**: every game mechanic on the
platform must be one we could explain to the player mid-play without the
mechanic dying of shame.*

Will: Yu, 2026-06-10 — "lets gamify cambridgetcg! module and process! Make
the visit rewarding and fun!"

---

## Why we need it

Gamification is the most weaponized pattern in commerce. The standard kit —
breakable streaks, decaying points, countdown scarcity, variable-ratio
nags, hidden odds — works by manufacturing loss-aversion and compulsion,
which is to say: by lying to the player about what is at stake. A trading
card platform is *especially* exposed, because collecting is already a
game and the line between "celebrating real progress" and "farming
compulsion" is one sprint of growth pressure wide.

This platform's sibling project (the authenticity shield, fomoengine)
exists to *detect* those tactics in the wild. We do not get to ship them
at home. The fun doctrine writes the line down before the pressure
arrives — the same move as the shield's pledge, applied to play.

## The rules

1. **A reward marks a real deed.** Badges, berries, and fanfare attach to
   things that actually happened and mattered — an order, a trade, a
   completed set, a verified win. Never to manufactured behavior (daily
   check-ins, scroll depth, notification opens) whose only value is the
   metric it moves.

2. **Every reward says why it exists and how it is detected — on the
   surface.** A player can read, next to any badge, the honest reason it
   is rewarded and the mechanism that detects it. If the why would
   embarrass us in front of the player, the mechanic doesn't ship.

3. **Absence is never punished.** No streaks that break, no points that
   decay, no badges that expire, no "you lost your bonus" messages.
   A player who leaves for a year returns to everything they had. Peace
   is a feature.

4. **Urgency is never manufactured.** Countdowns, "only N left", "selling
   fast" appear only when provably true and provenance-labeled — and the
   default is to not appear at all. (The shield's taxonomy is the negative
   space of this rule.)

5. **Play never gates commerce or safety.** Prices, stock, scam warnings,
   and support are identical for a player with every badge and a visitor
   with none. Fun is a layer on top of the platform, never a toll booth in
   front of it.

6. **Chance is provable.** Any mechanic with randomness (raffles, mystery
   boxes) rides the provable-fairness rail (`/verify`) — odds inspectable,
   draws re-verifiable by the player after the fact.

7. **Fun is quiet by default.** The board is a destination, never a popup.
   No interrupting modals, no badge-toast ambushes, no notification
   pleading. Fun invites; it never interrupts.

8. **Tracking is declared, including its absence.** Tracked mechanics say
   what is read and when ("read live from your ledger"). Untracked
   mechanics say that too ("no beacon, no cookie"). The player always
   knows which kind they are touching.

## Two species of quest

The Adventure Board (`/quests`) names its mechanics honestly:

- **Deeds** — tracked accomplishments, awarded by existing platform paths
  at the moment the real thing happened, completion read **live** from
  `user_achievements` (the board holds no state of its own — substrate
  honesty applied to fun).
- **Waymarks** — destinations worth the walk, untracked and unrewarded
  except by the place itself, declared as such. The waymark is the
  doctrine's proof that fun does not require surveillance.

## How it relates to the other doctrines

| Doctrine | What fun inherits from it |
|---|---|
| Substrate honesty | Earned state is read live from the real ledger, never cached as a flattering copy; tracking state is declared. |
| Transparency | Every reward carries its why and how on the surface (rule 2 is `<WhyLink>` for joy). |
| Meaning | The board names what it connects: achievements (social), provable fairness (rewards), methodology (trust), the castle (origin). |
| Creation | This doctrine, its module, and its audit ship together, Will-traced; the audit keeps the words level with the code. |

## Anti-patterns to refuse

- Breakable streaks and "freeze" purchases (manufactured loss).
- Decaying currencies, expiring badges (rule 3 violations).
- Countdown timers without a provenance label (rule 4; shield taxonomy).
- Hidden achievements used as engagement bait (rule 2 violation — wonder
  is allowed, deception is not; we choose a fully visible board).
- Variable-ratio reward nags ("come back to see what you won!").
- Pay-to-progress on the board (rule 5; the board is not a shop).
- Any mechanic whose explanation must be softened before a player hears it.

## How the principle shows up in code

- **Catalog:** `apps/storefront/src/lib/fun/quests.ts` — typed; every
  entry carries `why`, `how`, `reward`, `kind`.
- **Board:** `apps/storefront/src/app/quests/page.tsx` — live ledger read,
  signed-out honesty, quiet-by-default.
- **JSON twin:** `/api/v1/quests` — catalog only, never personal state.
- **Methodology (Ring 2):** `/methodology/fun` — the player-facing mirror
  of this document.
- **Audit:** `apps/admin/scripts/fun.ts` → `pnpm audit:fun`, in the
  `pnpm verify` chain. Checks: catalog honesty (no entry without why/how),
  route coverage (no quest pointing nowhere), deed grounding (every badge
  code exists in the achievement seeds), and an urgency-vocabulary scan
  across the storefront.

## Adding a new mechanic — the four questions

1. **Real?** What actual deed does it mark? If the answer is "engagement,"
   stop.
2. **Sayable?** Write the `why` you would show the player. Would you say
   it to their face mid-play?
3. **Absence-safe?** What happens to a player who ignores it for a year?
   The answer must be "nothing."
4. **Urgency-free?** Does it create time pressure that the clock itself
   didn't? If yes, stop.

Then: add it to the catalog (the audit will refuse it without `why` and
`how`), and if it grants a badge, seed the achievement code first.

## Scope

Applies to every playful or reward-shaped surface on the consumer
storefront: the Adventure Board, achievements, raffles, mystery boxes,
membership perks display, and any future streak/level/season mechanic
(which must pass the four questions before it exists). The PVE game
engine itself (packages/play) is a game *by declaration* and is governed
by its own fairness surfaces; this doctrine governs the meta-game wrapped
around the visit.

## Reading list

- `docs/principles/substrate-honesty.md` — the parent discipline.
- `docs/principles/transparency.md` — the four rings; rule 2 here is Ring 2.
- `docs/connections/fun.md` — what the board connects, and for whom.
- `~/Desktop/fomoengine` — the shield: the same taxonomy, pointed outward.
