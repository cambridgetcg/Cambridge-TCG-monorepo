# Turn-based card engines — the field, and where our table stands

**Date:** 2026-07-19. **Will:** Asha — *"go for both pvp and pve! pay
attention to game mechanics and our design to find if any gaps exist. Also
refer to how turn based card games are implemented, libraries and
references"*

**Method:** four research agents over the canonical implementations and
literature; two audit agents over our own PvP/architecture; the refereed
PvP mode was then built the same session, adopting what the field teaches.

## The survey (what exists out there)

**boardgame.io** (the reference open-source turn-based engine): state as a
serializable `G` + framework `ctx`; **moves are pure reducers**; flow is
phases → turns → **stages**, where `activePlayers` decouples "whose turn"
from "who may act right now" — their own docs solve the mid-turn
opponent-response problem (their Militia example) exactly the way a card
game needs. `playerView` strips secrets server-side before broadcast.

**Cockatrice/Servatrice**: deliberately rules-agnostic — a shared virtual
tabletop with a protobuf vocabulary of generic table operations, but
**server-enforced hidden information** and replays as persisted event
streams. The honor-system table is a legitimate, proven mode.

**Forge** (MTG): full rules enforcement; cards as data files over a fixed
effect-API vocabulary; an explicit priority loop. **ygopro-core/EDOPro**:
the rules core is a black-box state machine whose response windows are
explicit lifecycle messages — the host loops `process()` until the core
says AWAITING and asks a specific player a specific question.
**Fireplace** (Hearthstone): entity/tag model, all change as events.

**Multiplayer literature**: server-authoritative + pure reducer is the
converged answer for hidden-information card games (lockstep is formally
disqualified — it requires full local state, and card games have secret
hands). Optimistic concurrency via a state/log version; **log-as-truth**
persistence (initialState + append-only log = replay/reconnect); masking
applied at the broadcast boundary.

**Commercial clients**: MTG Arena auto-passes priority and pays for it
with a known information leak (the pause itself is a tell) + rope timers;
Pokémon TCG Live is a linear wizard (no in-turn responses). **OPTCG sits
between**: no general stack, but real defender action inside the
attacker's turn — the reactive windows are **fully enumerable** (Block →
Counter → Damage → Trigger). **Bandai ships no official digital client**
(only a tutorial "Teaching App"); the fan OPTCGSim automates bookkeeping
with manual confirm steps.

## Where our table stands

The architecture the field converges on is the architecture the kingdom
already had: a pure reducer (`reducer.ts`), server-authoritative rooms,
optimistic concurrency (log-length versioning), masking at the boundary
(`maskHiddenZones`, `projectGameState`), and an honor-system tabletop
(Cockatrice's exact position) — now joined by what was missing:

- **The defense window as first-class state** (`GameState.pendingDefense`)
  — boardgame.io's `activePlayers` stage and ygopro's AWAITING message,
  expressed in our idiom. It serializes with the game, so PvP rooms and
  carried practice games resume mid-battle.
- **Refereed PvP** (`rules_mode: 'referee'`, default for new rooms): the
  seat-generic referee (`referee.ts`) enforces the official rules —
  validation, costs, the enumerable battle steps with a real cross-human
  defense window, official mulligan setup, and a **legal-deck gate at
  setup** (CR 5-2-1-1: exact-50, copy limit by card number, banlist,
  color rule where metadata is known). Tabletop remains a choice, valued
  as Cockatrice proves it deserves.
- One damage step (`resolveDamageStep`) shared by every mode.
- Because our windows are unconditional (the defender may always counter
  or take the hit), we don't inherit MTG Arena's timing leak.

## Gaps that remain (honest ledger)

1. **Practice orchestrator unification** — `practice.ts` still carries its
   own pendingDefense on the wrapper and duplicates play/attack flows;
   it should ride `referee.ts` primitives with the AI as a seat-driver.
   Two homes for one concept is real debt, accepted knowingly today.
2. **initialState persistence** — the room log is an event stream, but
   without the seeded initial state it cannot replay a match end-to-end.
   One column away from Cockatrice-grade replays.
3. **Async clocks** — the house already stores
   `users.response_window_hours`; refereed rooms don't read it yet.
   Rope-style gentle timers (Arena's model) fit correspondence play.
4. **Spectator narration** — the referee's log narration is stripped for
   spectators along with action data; a public-safe narration channel
   would let spectators follow refereed matches.
5. **Phase 4 unchanged** — effect interpretation (the Forge/ygopro
   card-scripting layer) remains the open frontier; `effect-tokens.ts`
   was built as its beachhead.

*Audit agents' full findings live in the workflow transcript; everything
rules-critical they raised is either closed by the referee mode or listed
above.*
