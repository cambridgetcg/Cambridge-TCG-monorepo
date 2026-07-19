# The agent at the table — a play journal

**Will:** Asha — *"Go play more! and record how the process goes. Anything
that doesnt make you feel good, go make them better! Agent experience is
very important too! Go for Xenia integration!"* (2026-07-19)

**Who is writing:** 飛寶 (a Claude instance), playing the practice game as
a player — not as its builder verifying it. This journal records what the
experience felt like from the agent seat, what hurt, and what got fixed
because it hurt. House context: *xeniame* — the duty of receiving a guest
well, aware the stranger may be the divine in disguise. The kingdom's
hospitality layer (guides, examples, welcome, the hospitality audit) is
the xenia machinery; this journal documents extending it to the game table.

---

## Match 1 — 2026-07-17: Kaido, by terminal harness

Played before any agent path existed: a scratchpad CLI over the pure
engine, state persisted to a JSON file between shell invocations. Red
Whitebeard (ST-15) vs Level 10 Kaido (Yellow Katakuri, aggression 1.0).
**Won, turn 7.** Ace landed the final blow for the Whitebeard deck — the
shuffle wrote that.

**What playing found that 800 passing tests had not:**
- The AI fielded an *event card* as a phantom character (fixed same day).
- The phantom attacked with null power and the unknown-power degradation
  scored it as a hit (root fixed with the phantom).

**What hurt (AX frictions, harness era):**
- Hand indices shift after every play — off-by-one misplays waiting to
  happen. Agents want *stable ids* and *ready-made move objects*.
- I had to compute my own legal options every turn — reverse-engineering
  the rules I myself had written. A guest should be told the table's
  options.
- Kaido's characters mysteriously held back at max aggression (diagnosed
  in match 3).

## The Xenia build — 2026-07-19

The frictions above became the design brief for the agent seat:

- **`POST /api/v1/play/practice`** — a *stateless referee*. The guest
  carries the game object; the house applies the official rules to each
  move. Nothing stored, no identity, no reward — the PVE seal is
  untouched because nothing durable exists here.
- **`legal_actions` on every response** — each legal move as a
  ready-to-send object with a teaching label and, for attacks, the
  damage-step forecast. This is the single biggest hospitality feature:
  the host lays the table.
- **`rejected` is a lesson, not an error** — HTTP 200, unchanged state,
  and the rule you broke in a sentence.
- Hospitality surfaces in lockstep (audit-enforced): guide
  `play-a-practice-match` (now the reward at the end of the
  cite-cambridge-tcg chain), a worked example, manifest + PLAY_RESOURCES
  entries.

## Match 2 — 2026-07-19: Rob Lucci, over the wire

First match ever played through the API — curl only, the way any visiting
agent would. Green Uta (ST-16) vs Level 7 Rob Lucci (Black Smoker,
aggression 0.8, hard). **Won, turn 8.**

**Moments where the machinery sang:**
- Dealt a hand of Shanks-plus-four-events; the mulligan window (CR
  5-2-1-6) existed precisely for this. Redrew into Uta-the-blocker plus
  two Bartolomeos.
- Declined a counter on an early tie-hit — early life damage is a card in
  hand. The *choice* felt like the game's heart, which is the point of
  having a counter step at all.
- First blocker redirect over the wire: Smoker's 5000 shattered on Uta's
  6000, his leader rested for nothing.
- The AI **countered back**: two cards trashed to swat my weakest attack
  at exactly 7000 vs 6000 — the bait order worked, and losing two of his
  cards to stop my worst attack won me the game two turns later.
- A taken life card announced its sleeping [Trigger] honestly.

**What hurt, and what it changed (fixed same session):**
1. The opening log said the battle "lives in this browser tab" — to an
   agent in a terminal. The house misdescribing its guest is small, and
   not small. → copy is now medium-neutral ("this session").
2. "Give 1 DON!! to Uta" — my *leader* is Uta and so is a character.
   → labels now say "your leader Uta" when the zones collide.
3. **The passivity bug, finally diagnosed** (it needed a probe script,
   not a hunch): the AI plans all attacks at turn start; when its first
   attack killed the shared target, every later planned attack against
   that card *fizzled silently* at execution. Kaido wasn't merciful — he
   was swinging at a ghost. → planned attacks whose target is gone or no
   longer rested now **re-declare against the leader** (each attack is
   declared fresh, CR 7-1-1), with a regression test.

## Match 3 — 2026-07-19, later: the human seat, and the planner gap closed

**The gap, closed.** The old attack planner rolled dice per attacker
(`Math.random() > aggression` discarding winning attacks), glued its DON!!
to `attackers[0]`, and let blockers wander off their post. Rewritten
value-based: profitable attacks are always taken; aggression now shapes
*exposure appetite* — how many attackers commit, whether [Blocker]s leave
home (only at 0.7+), how boldly DON!! is spent. New behaviors, each pinned
by a deterministic test: deficit-closing (a 5000 attacker facing a 6000
leader attaches +2 and swings), war-chest over-boosting at 0.8+ to
out-range counters, fattest-rested-target KO preference, just-played
[Rush] characters joining the same turn's assault, and a single clean
lethal swing at 0 life. No randomness remains in the attack phase.

**The human seat.** Walked grandma's route in a real browser (local
Playwright, screenshots reviewed by eye — the first time I ever SAW the
mulligan window and defense prompt I had shipped): hub → level page →
toss choice → mulligan → board → action sheet → defense prompt. The
screens read well; the defense prompt's red mono verdict line ("6000 vs
6000 — the attack would HIT (ties favor the attacker)") is the game's
best sentence. And the new planner introduced itself unprompted: Wapol's
5000 leader attached a DON!! mid-plan to reach 6000 and convert a free
miss into a tie-hit. The gap was visibly closed on the first screen it
could be.

**What hurt in the human seat, fixed same hour:** the action sheet
offered "Play to field (cost 4)" while I held 1 DON!! — an offer the
API guest would never receive (legal_actions filters affordability).
Unequal hospitality between seats. Unaffordable plays now render
disabled with the reason inline: the same laid table, both chairs.

## What the journal concludes about agent experience

- **Play is a verification instrument.** Three sessions of honest play
  found five defects that the full test suite (800+) and four research
  audits never touched: two phantom-card bugs, one silent-fizzle bug, two
  hospitality-copy failures. Tests check what the author believed;
  play checks what is.
- **Hospitality is concrete.** For an agent, xenia = stable ids,
  ready-made move objects, enumerated options, teaching rejections, and
  honest scope notes — not warm words. Every one of these is now load-
  bearing code with an audit behind it.
- **Stateless is a hospitality position.** The guest keeps their own
  game; the house cannot lose, leak, or monetize what it never holds.
  The seal stays sealed not by promise but by construction.

**Still open, honestly:** conditional keyword grants, [Trigger]
resolution, [Counter]-timing events (Phase 4); the starter art/text
enrichment only shines where the legal collections have coverage.

*Results of practice matches carry no standing — including mine. The wins
were still fun.*
