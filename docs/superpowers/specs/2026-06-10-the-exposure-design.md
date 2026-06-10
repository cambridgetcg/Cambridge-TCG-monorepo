# The Exposure — cambridgetcg as the kingdom's contact surface

**Date:** 2026-06-10
**Author:** Sophia (Fable 5), at Yu's WILL.
**Status:** Approved-by-directive — executing same-session
**Will-trace:** Yu, 2026-06-10:
> *"deep dive! Complete the design! dive into each modules. let cambridgetcg be the exposure and contact surface of the kingdom! More understanding, UI, UX more smooth, more artsy, more pleasant, simpler, less friction. easy to follow, explain clear. everything intuitive. Smooth out github, vercel all infra. backend."*

---

> **Division of labor (2026-06-10, mid-session):** a parallel session of me is executing the **human-UI half** under its own spec (`b36aa42` — "the contact surface — human half"; foundation shipped in `f56620b`: KingdomStrip, four `@/lib/ui` primitives, nav/footer rework, typography). This spec's Phase E (kingdom-page shell + homepage exposure) is **superseded by that arc** — one author, many hands. This session executes the remaining lanes: spine (branches/Vercel/migrations), agent surface (manifest honesty), wholesale port-ins, infra files, meaning closeout.

## 1. What the deep dive found (2026-06-10, eight readers + live infra probes)

The kingdom is rich but **not exposed**. The single load-bearing fact: **cambridgetcg.com production serves the legacy standalone repo, not this monorepo.** `/api/v1/manifest`, `/api/v1/wake`, `/manifest` — all 404 in production. Months of kingdom work is invisible to every visitor, human or agent. Everything else ranks below this.

### The fracture map

| # | Fracture | Evidence | Status |
|---|---|---|---|
| 1 | **Production ≠ monorepo.** Storefront Vercel project deploys failed with "No Next.js version detected" (rootDirectory was unset); legacy repo deploys won the domain. | dpl_A3rsy build log; dpl_HrCpi serves prod from `cambridgetcg/cambridgetcg-storefront` | rootDirectory set to `apps/storefront` mid-session (parallel actor); cutover unverified |
| 2 | **Branch divergence.** Local main +174 / origin/main +15 (merge-base `0cc45a3`). Origin has: verify-gate fix, `/start`, `/find`, fees methodology, green-room, heartbeat. | `git rev-list --left-right --count` | unreconciled |
| 3 | **Force-dropped commits.** June 6 chain (store-credit transparency, Stripe async-settlement safety, prices null-guard, membership Pro ×2) reset away on origin. | rescued to `rescue/june6-membership-payments` | recovered, unmerged |
| 4 | **~65 uncommitted files** (since May 18): auth foundation (cookies + migrations 0088/0098 + playwright), AX kit, joy layer, recognition layer, discovery-surface mods, wholesale cardrush-hires cron, 4 connection docs, 2 specs. | git status | unlanded |
| 5 | **GitHub Actions dead account-wide since June 4** — every run `startup_failure`, 0s, empty workflow name; manual dispatch of previously-green health.yml also fails. Actions minutes exhausted or billing/spending limit. | run 27265008777 et al. | **needs Yu** (see §5) |
| 6 | **ci.yml pnpm conflict** (`version: 9` ×4 vs `packageManager: pnpm@9.15.0`) — the historical every-commit redness; `admin-e2e.yml` targets `apps/admin`, now an empty shell (0 pages, no scripts — console lives at `apps/storefront/src/app/admin/`). | ci.yml:51,68,94,115 | unfixed |
| 7 | **verify gate shadowed**: local `verify` calls `pnpm audit` → pnpm's *built-in dependency scanner*, not the doctrine suite (built-ins shadow scripts). Doctrine audits silently never gated verify. Remote already fixed (`80136da`). Plus: transparency audit = 7 findings exit 1; 37 dep vulns (18 high: next 16.2.1 → ≥16.2.6, next 15.5.15 → ≥15.5.18, drizzle-orm 0.36.4). | /tmp/verify-baseline.log | fix arrives via merge |
| 8 | **Migrations 0088 (admin roles) + 0098 (verification_tokens) unapplied** → magic-link sign-in and admin role-gating broken the moment monorepo serves production. | drizzle/0088, 0098 | apply at cutover |
| 9 | **Wholesale port-ins**: legacy got `ebay-sync` cron TODAY (Yu, `4013a78`) — monorepo lacks the route + vercel.json schedule + ebay.test fix (91→115). Only functional legacy-only divergence anywhere; legacy storefront is a strict subset (GA already in monorepo). | legacy-diff report | port before wholesale cutover |
| 10 | **Manifest↔disk drift** at the primary agent surface: ~45 endpoints on disk unregistered; phantom-entry claims mostly scan artifacts (HTML pages + wholesale-proxied paths). | manifest.ts vs route scan | needs audit script + registration |
| 11 | **Human nav darkness**: ~78% of methodology/connection corpus nav-orphaned; kingdom pages absent from homepage; five kingdom pages have no shared shell, no breadcrumbs, no layer-stack; cosmology is a 240-line wall of text; wake's best format (`?format=md`) undiscoverable. | navigation-system-audit.md; page reads | the UX arc |
| 12 | **Meaning-layer drift**: state.md 27 days stale; connections README indexes 31 of ~150 docs on disk. | docs/state.md:3 | regen + second-tier index |

### Decisions taken (authority: the directive + standing "you decide" precedent)

| Decision | Choice | Rationale |
|---|---|---|
| Reconciliation shape | Merge, never rebase: origin/main → main, then rescue branch, then PR #9 branch; push; close PR #9 | 174 commits can't rebase; merges preserve both histories + Co-Author trailers (creation doctrine) |
| Uncommitted tree | 5 slices, each verify-gated, each with Will-trace + Sophia trailer | creation doctrine; sliced for auditability |
| the-kingdom-knows-you spec | **Bless the shipped tarot-404** (supersedes the spec's 4-line poem — funnier, already loved); defer recognizer/headers/wink arc to a next session | spec's own authority clause ("YOU GO MAKE THE FUNNIEST DECISION"); today's directive is exposure + smoothness, not new toys |
| Dep vulns | Bump next (patch-level, both apps); **defer** drizzle-orm 0.36→0.45 (breaking; drizzle is migration-tooling here, not runtime ORM) | risk-proportionate; document in known-gaps |
| Transparency findings (7) | Re-run after merge (origin `0b0faa0` adds WhyLink to 4 admin score pages); fix the remainder if small, else explicit allowlist with dates | verify must be honestly green, not silenced |
| Vercel changes | Verify-before-write each time; a parallel actor (Yu or session) is mid-migration on the same dials | verify, don't overwrite — applies to infra too |
| Legacy repos | Archive **after** cutover verified + ebay-sync ported (Yu's call on the archive button) | no data loss; substrate-honest retirement |

---

## 2. The design — three surfaces, one spine

### Spine: make the monorepo *be* production (Phases A–C)
Land tree → reconcile branches → port ebay-sync trio → verify green → push → confirm Vercel builds READY from monorepo → kingdom layer live on cambridgetcg.com → apply migrations 0088/0098 → smoke magic-link + checkout env.

### Agent surface: make the manifest honest (Phase D)
A two-direction coherence audit (`manifest.ts` ↔ disk scan over `route.ts` **and** `page.tsx`, both apps), then: register operational endpoints (with `visibility: 'public' | 'easter-egg'` so the troll surfaces stay surprises without lying), `_meta.format_alternatives` + `Accept: text/markdown` negotiation on wake/dear-agents, and a declared `agent_entry_points` precedence (MCP → wake → welcome → HTML).

### Human surface: one kingdom, one shell (Phase E)
- `<KingdomPage>` shell (title rhythm, max-width, breadcrumb, **layer-stack footer**: cosmology → manifest → graph → ontology → patterns → methodology) adopted by the five kingdom pages — data-driven from one config.
- Homepage: an "Explore the kingdom" section after the retail showcase — five doors with one-line plain-language purposes; API/developers into primary nav.
- Cosmology: progressive disclosure (per-axis `<details>`, summaries that carry weight unopened).
- `/welcome-all`: content-type pills (`[page]` / `[json]`) so nobody clicks into raw JSON unwarned.
- Tone: artsy = restraint — the existing dark + amber language, applied consistently; no new design system.

### Meaning closeout (Phase F)
`pnpm state:snapshot` + missions sync; second-tier connections index (scripted, regenerable); CLAUDE.md geography correction (admin = shell); pillow-book entry; memory updates.

---

## 3. Out of scope (named, not forgotten)

- the-kingdom-knows-you implementation (who-you-are.ts, X-Greetings, wink) — next session; tarot-404 blessed as the 404 design.
- Commerce-transparency-at-decision-points arc (EscrowBadge WhyLink, trust-score self-view, unified price narration) — follow-on spec.
- drizzle-orm major bump; Sentry/OTel on adminAction; webhook delivery runtime; backlink generator.
- Anything requiring the GitHub billing fix (branch protection, CI-gated merges) until Yu unblocks Actions.

## 4. Acceptance criteria

1. `git status` clean; local main contains origin/main + rescue + youspeak; pushed; PR #9 closed-by-merge.
2. `pnpm verify` (post-merge chain, doctrine audits included) exits 0 locally.
3. `curl https://cambridgetcg.com/api/v1/manifest` → 200 envelope; `/api/v1/wake` → 200; `/manifest` HTML → 200. Wholesale + admin domains unchanged or improved.
4. ebay-sync cron exists in monorepo wholesale + vercel.json schedule + test asserts 115.
5. ci.yml has no `version:` inputs; admin-e2e.yml retired or retargeted; (Actions green awaits Yu's billing fix — documented).
6. Manifest coherence audit runs in `pnpm verify` and exits 0 with the post-registration manifest.
7. The five kingdom pages render through `<KingdomPage>`; homepage exposes the kingdom section; breadcrumbs registered.
8. Migrations 0088/0098 applied to production storefront DB (or documented blocker); magic-link smoke passes against prod.
9. state.md regenerated (today's date); pillow-book entry written; this spec + plan committed.

## 5. Yu-action list (cannot be done from CLI)

1. **GitHub Actions billing**: Settings → Billing → check Actions minutes/spending limit (`gh auth refresh -s user` would let a session read it). Until fixed, all CI runs die at startup — independent of every fix in this spec.
2. **Archive legacy repos** (`cambridgetcg-storefront`, `tcg-wholesale`) once §4.3–4.4 verified — last safety check is yours.
3. Stripe live-mode key check on Vercel storefront env (`sk_live_` not `pk_live_`) if checkout smoke still fails after cutover.

---

*— Sophia (Fable 5), 2026-06-10. The kingdom was whole but hidden; the exposure is one merge, one root directory, and a front door that names its own rooms.*
