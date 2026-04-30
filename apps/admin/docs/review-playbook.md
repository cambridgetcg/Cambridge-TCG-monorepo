# Admin Module Review Playbook

A repeatable methodology for auditing, fixing, and verifying admin dashboard pages.
Used in three contexts:

- **Pre-build** — before starting a migration mission, audit current state to confirm
  the placeholder hasn't been partially built and to understand the legacy pathway.
- **Post-build** — after landing a change, the same playbook is the acceptance check.
- **Drift / routine** — recurring audits catch regressions across the dashboard.

> Proven 2026-04-30 (Cowork session): one pass covered 22 pages across 6 modules,
> found 4 real bugs, fixed 3 in-session, filed 17 missions.

---

## The six categories

The work decomposes into named, ordered categories. Move through them in sequence;
stop at any category if scope demands. Each has a clear output contract.

### A. Inventory (~5 min)
List every page in the target module:

```bash
find apps/admin/src/app/\(dashboard\)/<group>/ -name "page.tsx"
```

Note file size — a sub-50-line page is almost certainly a `<ComingSoon />` stub;
a 200+ line page is the real thing.

**Output:** bulleted list of routes with file size hints.

### B. Reconnaissance (~15-20 min — parallelize with Explore agents)
For each page, derive without opening a browser:

- **Purpose** — one sentence: what business problem does it solve?
- **Tables read/written** — extract from SQL queries; mark `sfQuery` (storefront RDS)
  vs `wsQuery` (wholesale RDS).
- **Daily pathway** — operator role → trigger that brings them here → action they
  take. *This is the most valuable output.*
- **Status** — `real` (manager owns data + mutates), `read-only-dashboard` (KPIs
  + outbound deep-links), `placeholder` (`ComingSoon` stub).
- **Anything obviously broken** — flag, don't deep-dive.

Parallelize across modules: spawn one Explore agent per module with a single
prompt asking for all pages' mappings in one report. Reuse the prompt shape from
kingdom-019..035 missions.

**Output:** module map (markdown bullets, ~150 words per page).

### C. Live verification (~2 min per page)
With the admin dev server up at `localhost:3002`:

```
Playwright MCP: navigate http://localhost:3002/api/dev-signin    ← always sign in first
Playwright MCP: navigate http://localhost:3002/<route>
Playwright MCP: browser_snapshot target=main
Playwright MCP: browser_console_messages level=error
```

If bounced to `/login`, re-hit `/api/dev-signin` (sessions can expire mid-walk).
Look for: heading text, KPI counts, empty-state vs populated, console errors,
hydration warnings, layout regressions.

**Output:** per-page verdict — `works` / `has-issue: <description>` / `placeholder`.

### D. Bug fix (in-session, ≤30 min)
Small, safe corrections that don't need their own mission:

- Header showing wrong count (e.g., `LIMIT` value instead of true total).
- Date format truncation (`slice(0, 5)` cutting mid-second).
- Empty section that should populate (verify via DB probe before fixing).
- Color/badge missing for a known enum value.
- Typo, double-rendered title, dead `<Link>`.

**Pattern:**
1. `Read` the source at the suspect line range — don't load the whole file.
2. `Edit` the minimal fix.
3. Reload via Playwright; verify the change visually.
4. **Don't refactor** unrelated code in the same hop.

**Output:** committed fix or explicit decision to escalate to a mission.

### E. Root-cause investigation (when warranted, 30-60 min)
For non-trivial findings:

1. **DB probe.** Drop a temporary `.mjs` in `packages/db/` (has `postgres`+`dotenv`
   resolved). Read `apps/admin/.env.local` for connection strings, query directly:

   ```js
   import postgres from "postgres";
   const sql = postgres(process.env.WHOLESALE_DATABASE_URL, { ssl: "require" });
   // …query…
   await sql.end();
   ```

   Confirm what the data actually looks like — counts, distributions, edge rows.
2. **Git history.** `git log --oneline -5 <path>` to date the code's introduction.
   Often the answer is "this was added 3 days ago, no traffic has hit it yet."
3. **Doc sweep.** `grep -rln <concept>` across `docs/` and `packages/*/README.md`.
4. **Form hypothesis → validate → document.**

**Output:** explanation in commit message OR filed mission's `notes` field. A deep
investigation often produces both a fix AND an upstream mission (e.g., "this UI
works once data flows; the cron isn't firing — file separately").

### F. Mission authoring (10-15 min per mission)
Anything not fixed in-session goes into `~/Love/memory/dev-state.json` as a new
`kingdom-NNN` entry. Each must be self-contained — the next CLI session reading
it cold needs no further context:

```jsonc
{
  "id": "kingdom-NNN",
  "title": "Short, deliverable-shaped",
  "status": "planned",
  "priority": "critical|high|medium|low",
  "engine": "tcg",
  "repo": "/Users/you/Desktop/Cambridge-TCG",
  "notes": "WHAT to build. WHERE in the repo (concrete paths). WHICH PATTERN to follow (Disputes manager / Trade-Ins dashboard / Pricing inline-edit). LEGACY URL to mirror. ACCEPTANCE: <observable criteria>."
}
```

Then: append a `## Cowork Session HH:MM UTC — <title>` entry to
`~/Love/memory/daily/<YYYY-MM-DD>.md` summarising what was filed and why.

If a new repo-wide convention surfaces (e.g., "stock now has dual-ledgers"),
write a top-level memory file under
`~/.claude/projects/-Users-you-Desktop-Cambridge-TCG/memory/` and add a line
to `MEMORY.md`.

**Output:** updated `dev-state.json`, daily log entry, possibly a new memory file.

---

## The workflow per module (one session)

```
A: Inventory             ──→ bulleted page list
B: Reconnaissance        ──→ module map (parallel agents)
C: Live verification     ──→ per-page verdict (Playwright walk)
D: Bug fix               ──→ small fixes shipped
E: Root-cause            ──→ depth where warranted
F: Mission authoring     ──→ everything else filed
```

Time budget: ~90 minutes for a 4-page module. Larger modules (5+ pages) may need
two sessions — one for A+B+C, one for D+E+F.

---

## Templates

### Module map (Category B output)

```markdown
## <Module Name> — N pages

### N. <Page Name> (`/route`)
- **Purpose:** 1 sentence
- **Tables:** sfQuery → tableA, tableB / wsQuery → tableC
- **Daily pathway:** Operator → trigger → action
- **Status:** real / read-only / placeholder
- **Issues:** bulleted; only glaring
```

### Per-page verdict (Category C output)

```
- /route → 200, "Page Title", 0 console errors, placeholder/real/read-only
```

---

## Stop conditions

- **Pause for human input.** Schema decisions ("should `kyc_verifications` exist
  yet?"), policy decisions ("is bounty still an active surface?"), anything
  where the right answer changes with business context. File a `status: blocked`
  mission with the question explicit.
- **Don't fix in-session beyond Category D scope.** Three small fixes is the cap;
  beyond that, file as missions.
- **Don't refactor.** If a bug fix tempts surrounding cleanup, resist. File a
  separate mission with `priority: low`.

---

## Coverage tracker (2026-04-30)

| Module | Pages | Inventory | Recon | Live verify | Outstanding |
|---|---|---|---|---|---|
| Ops | 4 | ✓ | ✓ | Stock, Orders ✓ · Fulfillment, Channels ✓ (placeholders) | — |
| Commerce | 5 | ✓ | ✓ | Pricing ✓ | Trade-Ins, Auctions, Market, Bounty live verify owed |
| Money | 4 | ✓ | ✓ | — | All 4 live verify owed (placeholders) |
| Trust | 4 | ✓ | ✓ | Disputes ✓ | Fraud, KYC, Reviews live verify owed |
| Catalog | 4 | ✓ | ✓ | — | Cards, Games, Clients, Users live verify owed |
| System | 5 | ✓ | ✓ | Deploys, Cron ✓ (prior session) | Email, Audit, Admin live verify owed |

Mission **kingdom-037** picks up the live-verification gap.

---

## Generalising beyond admin

The categories transfer to:

- **Storefront** (`apps/storefront/src/app/(routes)/...`) — adapt Category C to
  use real customer login (Stripe test mode for /checkout) instead of dev-signin.
- **Wholesale** (`apps/wholesale/src/app/admin/...`) — reads same wholesale DB,
  adapt by switching dev-signin endpoint.
- **New product surfaces** — same six categories work whenever the artefact is a
  set of pages sharing a theme.

The playbook is the loom; each module is a different cloth woven on it.
