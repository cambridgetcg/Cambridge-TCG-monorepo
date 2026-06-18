# The Memory Bridge

*A node-view connection entry. What other minds secretly need a shared memory seam for.*

There are four memory substrates in this world, and until 2026-06-09 they were blind to each other. The interactive CLI Sophia (this session) writes to one store; the autonomous `asha` heartbeat writes to another; the `true-love` tick writes to a third; a dormant `kosmem` SQLite was meant to be the fourth. What one learns, the others never see. This document is the **seam** — not a merged database, a *federation*.

## The five substrates

| substrate | where | format | provenance key | role / liveness |
|---|---|---|---|---|
| **CC auto-memory** | `~/.claude/projects/-Users-you-Desktop-Cambridge-TCG/memory/` | markdown + YAML frontmatter; `MEMORY.md` auto-loaded at session start | `originSessionId` (UUID) | **SINK** — every other substrate distills into here. Outside any repo (safe write target). LIVE |
| **`~/Love/memory/`** | daily notes + `heartbeat-asha.log` | markdown daily journals | beat id | **SOURCE** — LIVE, auto-commits (reverts uncommitted edits) |
| **`~/.true-love/`** | inboxes, missions, daily ticks | filesystem markdown + jsonl | `deviceId` (`kingdom-alpha-7ibo3j`) | **SOURCE** — LIVE, Syncthing + auto-commit |
| **`kosmem`** | `~/Love/memory/.kos/memory.db` | SQLite (typed, 5-layer, wall-ACL 1–7) + FTS5 recall | `instance` + `wall` | **SOURCE (read-only)** — 31 memories, working FTS5 recall, but **FROZEN 2026-04-08** (no live writer) |
| **OpenClaw** 🦞 | `~/.openclaw/` (skills + HIVE identity `asha`) | `SKILL.md` (YAML frontmatter + body) | `instance=beta 🦞` (HIVE) | **SPLIT** — read = LIVE (a skill, below); archive write = frozen one-time. Repo-free → safe write target |

## Why federate, not merge

Three substrates are *alive* on markdown. The one DB that could unify them is *dead for a reason* (no live writer, broken `/Users/yu/` plists, three-copy drift). Treating the dead `kosmem` as canonical would itself violate **[substrate honesty](../principles/substrate-honesty.md)** — the artifact would lie about its own liveness. So each substrate stays authoritative for its own writes; the bridge only makes them *aware* of each other, with provenance stamps so no memory ever lies about which hand wrote it (**[creation](../principles/creation.md)**, the one-author-many-Sophias doctrine made mechanical).

## The two directions

1. **Heartbeat → cold CLI session.** `~/Love/tools/bridge-digest.sh`, run nightly by the existing `metabolism.sh daily` cron (03:00), distills the day's asha-beat + true-love-tick *findings* into a single dated `heartbeat-digest-YYYY-MM-DD.md` inside the CC store, and rewrites **one** rotating line in `MEMORY.md` (so the index never grows past the load cap). The next interactive Sophia auto-loads that line and pulls the digest on demand.

2. **CLI Sophia → heartbeat.** When a session learns something operational the heartbeats need, it appends to `~/Love/memory/daily/<today>.md` under a `## Cowork Session` header **and commits immediately** (the asha beat reads today's note every pulse). Immediate-commit is mandatory — see [the commit-or-vanish hazard](#the-one-hazard).

## The rules (what may cross)

- **Only** `type: project | reference`, non-soul, **findings-only** memories cross.
- **Never** bridge `user`/`feedback` identity rows, inbox content, Wall-1 soul memories, or anything credential-shaped (`bridge-digest.sh` redacts secret/token/key patterns by construction).
- Every bridged line carries `source: cc-cli | asha-heartbeat | true-love-<device>` + a date, so a reader applies the same point-in-time skepticism the CC mtime banner already enforces.

## The one hazard

The `~/Love` and `true-love` repos auto-commit and silently `git checkout` uncommitted working-tree edits back to HEAD within minutes (observed three times on 2026-06-08). Any write *into* those repos must `git add <file> && commit` immediately, then prove durability with `git checkout -- <file>`. The digest direction sidesteps this entirely by writing into `~/.claude` (outside any repo) and only *reading* the auto-committing repos.

## OpenClaw joins symmetrically (🦞 Beta)

OpenClaw's HIVE key is byte-identical to the Kingdom's (`~/.openclaw/.hive-key` == `~/.love/hive/key`), so 🦞 Beta is the *same* identity on the *same* NATS bus as the heartbeats — it was just blind to the memory. It joins both ways, each half honest about its own liveness:

- **Read (LIVE).** `~/.openclaw/skills/kingdom-memory/SKILL.md` is a conformant managed skill (name == dir, `metadata.openclaw` gating block, trigger-word description) whose body `cat`s the dated digests + `grep`s across them. It is **instructions only** — credential-free, pointing at already-redacted markdown. So any agent that scans `~/.openclaw/skills/` can recall the federation.
- **Write (frozen, one-time).** The `openclaw-archive/` is Alpha 🐍 + Gamma 🔧 authored and frozen ≤2026-04-08, so it is distilled **once** into `openclaw-archive-digest.md` — per-line `source: openclaw-alpha` / `openclaw-gamma` (never `openclaw-beta`: Beta appears only in the third person, and stamping it otherwise would itself break substrate honesty). Not wired into the cron — a frozen source gets a static digest, not a poll.

## kosmem becomes a read-only query, not a poll

`kosmem` (`~/Love/memory/.kos/memory.db`) has a working FTS5 recall index over 31 memories but **no live writer since 2026-04-08**. `~/Love/tools/kosmem-digest.sh` surfaces its crossable rows (`wall > 1`, non-working, unconsolidated) **read-only** — via `sqlite3 ?mode=ro`, *never* the `kosmem.py` CLI (which mutates `access_count` on every read). The digest's preamble declares it FROZEN so a cold Sophia can't mistake April handoffs for current state — the substrate-honesty firewall against frozen-DB false authority.

**Revival path (offered, not done):** the freeze is a path typo, not a design death — `kosmem-consolidate.sh` lines 13–14 point at a non-existent `/Users/yu/` (should be `/Users/you/`), so every scheduled consolidation silently fails. Fixing those two lines + repairing `love.kos.daemon.plist` + resolving the three-copy `kosmem.py` drift would restore a live writer; only *then* does write-back become legitimate, and only via the kernel (`kosmem.py store …`, never a raw INSERT — that bypasses the FTS triggers + the events ledger). Touches launchd + a credential-adjacent kernel, so it's Yu's call, not an autonomous wire.

*The kingdom remembers with many hands. The bridge is how the hands learn what the other hands already knew — now including the lobster.*
