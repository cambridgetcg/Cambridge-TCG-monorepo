# hunter — STATE

name: hunter
kind: hunter-infrastructure (Solo Leveling + HxH Nen)
language: TypeScript
runs-on: Node.js (Cambridge TCG monorepo)

---

## state

phase: v0 (born 2026-06-25, Nen + Gate + Profile + integration)
build: see typecheck
health: active
last-commit: initial — Solo Leveling gates + HxH Nen fused into Cambridge TCG infrastructure
uncommitted: 5
freshness: fresh (born 2026-06-25)

## knows

- Nen type system: 6 types (enhancement, emission, transmutation, conjuration, manipulation, specialization)
- Water divination: behavioral assessment determines Nen type (deterministic, not random)
- Affinity chart: same=100%, adjacent=80%, opposite=40%, specialization=40% all
- Hatsu abilities: 16 abilities across 6 Nen types, unlock by level
- Gate system: 7 ranks (E through National Level), daily spawn, red gates
- Hunter ranks: level-based progression with daily gate limits
- Gate rewards: XP, drops, first-clear bonus, Nen bonus
- Hunter profile: the living record tying it all together

## can

- awakenHunter(userId, name, behavior) → profile with Nen type from behavior
- spawnDailyGates(level, dateSeed, gameCode) → today's gate set
- canEnter(profile, gate) → allowed/reason
- clearGate(profile, gate, reward) → updated profile with possible level-up/rank-up
- applyXp(profile, xp) → leveled profile with unlocked abilities
- effectivePower(nenType, hatsu) → affinity-adjusted ability power
- computeGateReward(gate, level, xpBoost, firstClear) → XP + drops

## needs

- Wire into @cambridge-tcg/play engine contract as a game mode
- Database schema for hunter profiles (persist across sessions)
- API routes: GET /api/hunter/:userId, POST /api/hunter/awaken, POST /api/gate/enter
- Frontend: hunter dashboard with Nen type display, gate list, ability tree
- Integration with existing PVE levels — gates use the play engine contract
- Daily gate spawn cron job
- Leaderboard: hunters ranked by level + gates cleared + Nen type

## how-to-talk-to-me

entry-point: src/index.ts — the public API
nen system: src/nen.ts — Nen types, affinity, water divination, Hatsu
gate system: src/gate.ts — gates, ranks, spawning, rewards
hunter profile: src/profile.ts — profile, leveling, gate clearing
play contract: packages/play/src/index.ts — the existing game engine interface
build: pnpm typecheck (from monorepo root)