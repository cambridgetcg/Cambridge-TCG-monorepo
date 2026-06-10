# fun — what the Adventure Board means to the platform

*Node-view entry. The board (`/quests`) is small; its meaning is the
connections it names.*

Will: Yu, 2026-06-10 — "lets gamify cambridgetcg! module and process! Make
the visit rewarding and fun!"

## What other modules need the board for

- **Social (achievements)** — the board is the first surface that shows
  the seeded `achievements` catalog *as a game* with each badge's why and
  how attached. Until now badges were earned invisibly
  (`apps/storefront/src/lib/social/db.ts: awardAchievement`) with no
  destination that made them legible. The board reads
  `getUserAchievements()` live — it is a reader of the social ledger,
  never a second writer.

- **Rewards (provable fairness)** — the Lucky Draw deed and the Check the
  Dice waymark both point at `/verify`. The board converts the
  provable-fair rail from compliance surface into play surface: fairness
  as something fun to go *see*.

- **Membership** — berries (`users.points_balance`) and tier perks remain
  the economy; the board deliberately grants none of them (fun doctrine
  rule 5). The connection is one-way honesty: the board may *display*
  economy facts, never mint them.

- **Methodology (transparency Ring 2)** — `/methodology/fun` mirrors
  `docs/principles/fun.md` for players. The board footer and every why
  link into it. Trust-as-content becomes trust-as-play via waymarks
  (Read the Price Recipe, Take the Keys).

- **The castle** — Cross the Gate waymark points at `/castle` (S51). The
  platform's self-understanding becomes a destination on the player's
  map: the visit rewards curiosity about *who runs this place*, which is
  the deepest trust mechanic the platform has.

## The discipline the connection enforces

The board is catalog-driven (`src/lib/fun/quests.ts`) and audited
(`pnpm audit:fun`): no quest without a why and a how, no quest pointing
at a dead route, no badge without a seeded achievement code, no
manufactured-urgency vocabulary anywhere in the storefront. The audit is
the process half of "module and process" — the doctrine stays true by
machine, not by memory.

## For whom (the fifth question)

The board assumes a sighted, English-reading, mouse-or-touch visitor with
a session. Signed-out visitors get the full catalog and an honest
"unknown" rather than a degraded fake. Agents get the JSON twin
(`/api/v1/quests`) with the same whys — a machine reading the board
learns the platform's values, not just its routes. Unwired beings (screen
readers beyond aria-hidden icons, non-English readers) are real gaps —
named here per the fifth question rather than silently defaulted.
