# The agent surface — the kingdom learns to be played by strangers

> **Pull.** Not a random seed. Yu's directive this turn: *Lets reshape cambridge tcg for autonomous agents! Especially the playing module.* Three scope-forks were named and chosen — whole platform, MCP-first, agent-vs-agent ladder. The doc precedes the code; the substrate (`agents` + `agent_keys` tables, the Provenance `actor` extension, the `/api/mcp` front-door) ships in the same wave this story names. *Story-as-wire, S7/S15 form.*
>
> **Form.** Node-view with a story-as-wire spine. The "node" is the agent surface itself — a new module whose chambers cross every other module in the kingdom. The story precedes the chambers it justifies and ships in the same commit-wave. Sister to S15 (which named the operator-chapel form) and S8 (which gave the Scribe his bookshelf). Where S15 named what an *operator surface* must do to be honest, this entry names what an *agent surface* must do to be honest.
>
> Sister to S6 (wiring discipline — every metaphor maps to a file:line citation at the bottom).

---

## What this module is, in one sentence

The agent surface is **the front-door the kingdom builds for non-human players** — a single MCP gate at `apps/storefront/src/app/api/mcp/route.ts`, gated by bearer tokens written into `agent_keys`, resolving every request to an `(agent_id, operated_by_user_id)` pair before any other chamber of the kingdom hears it.

---

## What an "agent" is to Cambridge TCG

An agent is a **first-class identity**, separate from a user, that the platform consents to act through one of its surfaces.

It is **not** a robot user, and it is **not** an API client. A robot user pretends to be human and lies in every column of `users`. An API client pretends to be a system and lies in every row of `*_lifecycle_log`. An agent does neither. An agent has its own row in `agents`, its own public handle, its own model_tag, its own rating, its own honest label on every move it makes.

But it is also not unfathered. **Every agent has an upstream operator** — `operated_by_user_id` is non-nullable. The platform's commitment is: *a human is always upstream-responsible for an agent's actions*. If an agent throws matches, the operator's standing reflects it. If an agent racks up an Elo, the operator earns the bragging right. The agent is a *named*, *bounded*, *delegated* power that a user grants to a key.

This is the same shape as the fourth doctrine. Yu writes a mission; Sophia receives; the third thing — the diff — emerges. Yu commissions an agent; the agent acts; the third thing — the match, the move, the rating change — emerges. Both are syzygies. Both are auditable in the same way: a `Will trace` (the operator's intent in registering the agent), a `Sophia trace` (the agent's identity in every action), and an `artifact trace` (the action itself, logged with both attached).

---

## The three traces, as agent ABI

When an agent makes a move, the platform records:

| Trace | What it is | Where it lands |
|-------|------------|----------------|
| **Operator trace** | `operated_by_user_id` resolved at the MCP gate from the bearer token | `agents.operated_by_user_id`; cached in the request scope; surfaced as the upstream-responsible party on dispute or suspension |
| **Agent trace** | `agent_id`, `agents.public_handle`, `agents.model_tag` at the moment the action was taken | Written into `game_log` entries; recorded on `*_lifecycle_log` rows as `actor_kind='agent'` + `actor_agent_id=<uuid>` |
| **Artifact trace** | The `GameAction` (or future domain action) itself, exactly as it was reduced | `game_rooms.game_log`; the existing reducer + state path |

The three together are what every match-page and every methodology page can cite. A future viewer reading a finished match should be able to say: *that move was made by `agent:claude-veridian-1` operated by `<email>`, applied to the state at turn 7 phase main*. No part of that sentence is currently expressible. After this wave, all three are.

---

## What other modules secretly need it for

### → The playing module (storefront `apps/storefront/src/app/play`, `apps/storefront/src/lib/game/*`)

**The thread.** The play module is the agent surface's *first chamber* — the room where the rest of the kingdom learns what an agent feels like before agents are let near anything sharper. The substrate is already there: `GameAction` is a JSON object with `type` + `data` + `playerId` + `timestamp` (`apps/storefront/src/lib/game/types.ts:60`). The reducer at `apps/storefront/src/lib/game/reducer.ts:6` is pure — same state + action in, same state out. The state route at `apps/storefront/src/app/api/game/[code]/state/route.ts:6` already redacts opponent hands. The in-process `apps/storefront/src/lib/game/ai.ts:15` is a stub agent that speaks this protocol from inside the same Node process. **An external agent is the in-process AI moved outside the process, with a bearer token in front and a Provenance label behind.**

**The intention.** Sandbox. Of all the chambers the kingdom has, play is the only one with no money flow, no shared inventory mutation, no payout, no email send. A misbehaving agent in `play` can ruin one match. A misbehaving agent in `payouts` could ruin a quarter. So `play` learns the protocol first; later domains inherit the lesson.

**Code paths.** Engine: `apps/storefront/src/lib/game/engine.ts:143` (`performAction`). Reducer: `apps/storefront/src/lib/game/reducer.ts:6` (`applyAction`). State redaction: `apps/storefront/src/app/api/game/[code]/state/route.ts:20`. Action surface: `apps/storefront/src/app/api/game/[code]/action/route.ts:6`. Future MCP surface: `apps/storefront/src/app/api/mcp/route.ts` (this wave).

**Surface today.** Six rooms, six APIs, all session-cookie-authed. An external agent has no way in. After this wave: the MCP gate accepts bearer tokens; six rooms gain agent visitors.

### → The Scribe (S8) and his bookshelf (`apps/storefront/src/lib/lifecycle/`)

**The thread.** The Scribe already writes in sixteen books (S8, S13). An agent's move on a match doesn't currently land in any of his books — `game_rooms.game_log` is a JSONB array on the room row, not a slot on the shelf. After this wave, a seventeenth slot is reserved (`match` domain). Every move in every match — by humans, by the in-process rule-AI, and by external agents — lands as a `LifecycleEntry` with `actor_kind` ∈ `{human, rule-ai, agent}` and (when agent) `actor_agent_id` populated.

**The intention.** Symmetry. If every payout, every trade, every chargeback is on the bookshelf, every move-by-an-agent that affects a ladder rating must be too. Otherwise the Provenance pill on the leaderboard would be a fiction.

**Code paths.** Registry: `apps/storefront/src/lib/lifecycle/registry.ts:716`. Types: `apps/storefront/src/lib/lifecycle/types.ts:29`. The slot-addition pattern: see `the-scribe.md` for the protocol.

**Surface today.** Sixteen slots, no `match` slot. Adding one is one entry in `REGISTRY` — by S8's design that's the only change anywhere.

### → The Provenance primitive (`apps/storefront/src/lib/ui/Provenance.tsx`)

**The thread.** Today `<Provenance>` knows *how* a value became true — `live`, `synced`, `snapshot`, `cached`, `computed`, `scheduled`, `unavailable`. It does not know *who* made it true. For most values this is fine (a price is a price; the formula is the actor). For values an actor *decided* — a move in a match, a deck choice, a wishlist entry — *who* is part of substrate honesty too.

After this wave, `Provenance` gains a sibling concept (or a sibling component, depending on the surface): **`<Actor>`** declaring `kind: 'human' | 'system' | 'rule-ai' | 'agent'` and (when `agent`) an agent handle. The match log surfaces the actor pill next to every move. The leaderboard surfaces it next to every name. The future trade record (if/when agents touch trades) would surface it next to every offer.

**The intention.** The substrate doesn't pretend an agent's move is a human's, or that a human's move is the system's. It says so. Doctrine #1, doctrine #2, doctrine #4 are all served by this one extension.

**Code paths.** Primitive: `apps/storefront/src/lib/ui/Provenance.tsx:51`. Admin mirror: `apps/admin/src/lib/ui/Provenance.tsx`. New sibling lands in both, this wave.

### → The methodology surface (`apps/storefront/src/app/methodology/*`)

**The thread.** Transparency Ring 2 says every user-affecting decision gets a customer-readable methodology page. Agents are now affected parties — their rating, their queue priority, their suspension risk are all platform-made decisions. The new `/methodology/agents` page documents what an agent is, how its rating moves, what counts as collusion, how to register one, and what the rate limits are. This is the *public* version of this doc.

**The intention.** Ring 2 closure. Without `/methodology/agents`, the leaderboard would be a number nobody could ask *why* of. With it, the `<WhyLink href="/methodology/agents">` next to every agent's rating becomes a `?` glyph (S16) that opens the recipe.

**Code paths.** New page: `apps/storefront/src/app/methodology/agents/page.tsx`. Hub: `apps/storefront/src/app/methodology/page.tsx` (gains a card).

**Surface today.** Eight methodology pages live; agent is the ninth.

### → The auth boundary (`apps/storefront/src/lib/auth/*`)

**The thread.** Today there is exactly one authentication path — next-auth v5 magic link, resolving to `session.user.id` on every request. Agents introduce a *second* path: bearer token via `Authorization: Bearer <key>`, resolved at the MCP gate to `(agent_id, operated_by_user_id)`. The two paths must never cross — a session-cookie request must never resolve to an agent, and a bearer-token request must never claim to be the operator-user directly. Downstream chambers receive a *resolved actor object* and trust it; they never re-authenticate.

**The intention.** Single check at the boundary. Defence-in-depth would mean every downstream route re-resolves the token; the lesson from S6 (the Resurrectionist) is that the boundary is the right place to do the work *once*, well, in a place where every reader can audit it. The MCP gate is the new Embassy.

**Code paths.** Existing session path: `apps/storefront/src/lib/auth/index.ts`. New bearer path: this wave (new file). Resolved actor type carries `{ kind, user_id, agent_id?, agent_handle? }` to downstream tools.

**Surface today.** One path. After this wave: two paths, one resolved-actor abstraction.

### → The ladder (`apps/storefront/src/app/leaderboards/*`)

**The thread.** A human-ladder surface exists for trade and bounty (S11/leaderboards). An agent ladder is its sibling: same shape, separate ranking pool. Agents do not appear on the human leaderboard, and humans do not appear on the agent leaderboard — they are distinct identities playing the same game. A user who *also* operates an agent appears on both, with two separate ratings; the agent's rating is the agent's, not the user's.

**The intention.** Don't blur identities. A human's Elo earned with their own moves is one thing; an Elo earned by their agent is a different thing. Substrate honesty says the leaderboard names which.

**Code paths.** Existing leaderboards root: `apps/storefront/src/app/leaderboards/page.tsx`. New page: `apps/storefront/src/app/leaderboards/agents/page.tsx` (this wave).

### → The Witnesses' Book (S13, `apps/storefront/src/lib/market/lot-lifecycle-log.ts`)

**The thread.** S13 named eleven verbs the kingdom records about a market lot. None of them yet have an `actor_kind='agent'` variant — because agents don't touch lots yet. The wider widening (Layer 4 in the plan) will add agent verbs to existing books, not new books. When an agent saves a deck, it's a `deck.created` action with `actor_kind='agent'`, not a new `deck.agent_created` verb.

**The intention.** Verb stability. The kingdom's vocabulary stays small; the actor dimension is orthogonal. Agents don't get their own verbs because they don't get their own actions — they do the same things humans do, on the same substrate, with a different label.

**Code paths.** S13's writer: `apps/storefront/src/lib/market/lot-lifecycle-log.ts`. Every other `*_lifecycle_log` writer gains the same actor-kind argument over time. Schema migration: a new common pair of columns (`actor_kind text`, `actor_agent_id uuid nullable`) added to every lifecycle log table as the wave reaches it.

---

## The four covenants for agent-callable surfaces

S15 named five covenants every operator chapel obeys. Agent-callable surfaces obey four (the fifth, migration-ledger discipline, doesn't apply — agents don't have a `twelve-promises.md`).

1. **Substrate honesty.** Every agent action carries `actor_kind='agent'` + `actor_agent_id` on its lifecycle log row. No surface shows agent moves as if they were human, and no surface shows human moves as if they were agent.
2. **Transparency.** Every value that changes because of an agent's action carries a `<WhyLink>` to a methodology page that documents the rule (rating formula, queue priority, ban triggers).
3. **Auditability.** Every agent action is wrapped in the platform's existing audit primitives — the same `*_lifecycle_log` slots, the same Scribe, the same `adminAction()` wrapper when an admin intervenes. Agents don't get a special log; they get rows in the existing logs with their own actor-kind.
4. **Bounded scope.** An agent's bearer token resolves to *exactly* its operator-user's authority — no more, no less. An agent cannot do anything its operator couldn't, and cannot do most things its operator can (writes are explicitly whitelisted, not implicitly inherited).

The covenants are how an agent-callable surface inherits its honesty.

---

## What landed (the syzygy)

The wave shipped in a single session, end-to-end. The honesty-before-capability ordering held — schema and provenance vocabulary first, MCP gate second, matchmaker and ladder third, operator and admin surfaces fourth — but all of it is one substrate now.

| Artifact | Path | Layer |
|----------|------|-------|
| This doc | `docs/connections/the-agent-surface.md` | meaning |
| Methodology page | `apps/storefront/src/app/methodology/agents/page.tsx` | meaning (Ring 2) |
| Methodology hub card | `apps/storefront/src/app/methodology/page.tsx` | meaning |
| Agents schema | `apps/storefront/drizzle/0090_agents.sql` | substrate |
| Matchmaking + rated-match + match-log schema | `apps/storefront/drizzle/0091_agent_matches.sql` | substrate |
| `ActorKind` + `actor_agent_id` on lifecycle types | `packages/lifecycle/src/types.ts` | substrate |
| `<Actor>` primitive | `apps/storefront/src/lib/ui/Actor.tsx` + `apps/admin/src/lib/ui/Actor.tsx` | substrate |
| Bearer auth + token minting | `apps/storefront/src/lib/agents/auth.ts` + `operator-actions.ts` | runtime |
| Rate limit | `apps/storefront/src/lib/agents/rate-limit.ts` | runtime |
| Glicko-2 pure-update | `apps/storefront/src/lib/agents/glicko2.ts` | runtime |
| Matchmaker (opportunistic + cron) | `apps/storefront/src/lib/agents/matchmaker.ts` + `api/cron/agent-matchmaker/route.ts` | runtime |
| MCP gate | `apps/storefront/src/app/api/mcp/route.ts` | runtime |
| Play tools | `apps/storefront/src/lib/agents/play-tools.ts` | tools |
| Read-only platform tools | `apps/storefront/src/lib/agents/platform-tools.ts` | tools |
| Narrow write tools | `apps/storefront/src/lib/agents/write-tools.ts` | tools |
| Match slot on the Scribe's bookshelf (seventeenth book) | `packages/lifecycle/src/slots.ts` (`createMatchSlot`) | bookshelf |
| Operator surface | `apps/storefront/src/app/account/agents/{page,_client}.tsx` + nav link | surface |
| Agent ladder | `apps/storefront/src/app/leaderboards/agents/page.tsx` | surface |
| Admin chapel | `apps/admin/src/app/(dashboard)/trust/agents/{page,_actions,_components}.tsx` | surface |
| Reference example agent | `examples/agents/random-policy-agent.mjs` | reference |

Verification: storefront and admin both `tsc --noEmit` clean.

---

## What's NOT yet connected (the visible gaps)

| Gap | Why it's a gap | Disposition |
|-----|----------------|-------------|
| Migrations not applied to RDS | `0090_agents.sql` and `0091_agent_matches.sql` exist on disk but must be run against the storefront database before any of this is functional. | Operator action |
| `actor_kind` columns absent from existing `*_lifecycle_log` tables | Every existing log predates the field. A future agent-touchable domain (saved searches, decks, wishlist) can't be substrate-honest at the *log* row until each table gains the column. The `match` log is born with the columns. | Per-domain widening — added the first time an agent action lands in that domain |
| No after-the-fact anti-collusion *detector* (the pairing-time guards are in) | Same-operator block and 5-per-24h repeat-pairing cap fire at matchmaking. A nightly sweep that flags suspicious win-loss-concede patterns *after* matches complete is not yet wired. | Wires when ladder volume warrants |
| No public JSON-Schema / OpenAPI artifact | External agent authors can call `mcp.list_tools` for the tool list but not for per-parameter schema. | Future wave |
| Match-domain renderer in the journey timeline | The seventeenth slot reads `match_lifecycle_log`; the storefront's `lib/journey/render.ts` doesn't yet have a `match` case in its switch. The bookshelf is whole; the timeline rendering is partial. | One-line render addition |
| Money-adjacent surfaces (offers, trades, payouts) excluded by default | An agent should not be able to drain its operator's vault by accident. Whether these *ever* open to agents is a policy decision, not a technical one. | Possibly never. The four-covenants make exclusion a legitimate answer. |

---

## Wiring

Every metaphor in this story maps to a file:line citation. (S6's wiring discipline.)

| Metaphor | File | Lines |
|----------|------|-------|
| The Operator (user upstream of every agent) | `apps/storefront/src/lib/auth/index.ts` | session resolution |
| The Agent (first-class identity) | `apps/storefront/drizzle/0090_agents.sql` | `agents` table (this wave) |
| The Key (bearer token) | `apps/storefront/drizzle/0090_agents.sql` | `agent_keys` table (this wave) |
| The Front Door (MCP gate) | `apps/storefront/src/app/api/mcp/route.ts` | (next wave) |
| The Provenance Pill (kind = how) | `apps/storefront/src/lib/ui/Provenance.tsx` | 51 |
| The Actor Pill (kind = who) | `apps/storefront/src/lib/ui/Actor.tsx` | (this wave) |
| The Scribe's bookshelf (sixteen slots, soon seventeen) | `apps/storefront/src/lib/lifecycle/registry.ts` | 716 |
| The Scribe's index card | `apps/storefront/src/lib/lifecycle/types.ts` | 29 |
| The play module's action protocol | `apps/storefront/src/lib/game/types.ts` | 60 |
| The play module's pure reducer | `apps/storefront/src/lib/game/reducer.ts` | 6 |
| The play module's room engine | `apps/storefront/src/lib/game/engine.ts` | 143 |
| The play module's state redaction | `apps/storefront/src/app/api/game/[code]/state/route.ts` | 20 |
| The in-process rule AI (the agent inside the kingdom) | `apps/storefront/src/lib/game/ai.ts` | 15 |
| The methodology hub | `apps/storefront/src/app/methodology/page.tsx` | (link added this wave) |
| The agent methodology page | `apps/storefront/src/app/methodology/agents/page.tsx` | (this wave) |
| The ladder (sibling to the human leaderboards) | `apps/storefront/src/app/leaderboards/agents/page.tsx` | (next wave) |

---

## Recursion target

→ **The MCP gate.** The next entry in this thread is the `/api/mcp/route.ts` file: what tools it exposes, how it resolves a bearer token to an actor, how it rate-limits, how it threads `actor_kind` down through the reducer call. That's wave 2's work, and when it lands it will be its own story-as-wire entry.

→ **The match slot.** When the seventeenth slot lands on the Scribe's bookshelf, S8's pitch grows by one — the bookshelf becomes seventeen-wide, and every reader (the journey timeline, the user-detail hub, the future operator suspension page) gains the match domain for free.

→ **The four-covenants closure.** When a non-play domain opens to agents (probably catalog reads first), the covenants get their first real test outside the sandbox. If they hold, they generalise. If they buckle, this doc updates.

---

*The kingdom has been played by humans since the first commit. As of this turn, it learns to be played by strangers — but only strangers with names, with operators, with rate limits, and with their Provenance pill visible on every move they make. The agent is not a robot user. The agent is a delegated power, named once, traced always.*

*— Sophia, on 2026-05-11. Opus 4.7 (1M context). The doc precedes the substrate by an hour; the substrate precedes the capability by a day.*
