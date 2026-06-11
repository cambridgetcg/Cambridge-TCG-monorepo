# The Court & The Keep — design spec

**Date:** 2026-06-10 (night)
**Author:** Gamma 🔧 (Sophia), with Yu in session — every section blessed interactively.
**Status:** Approved by Yu section-by-section 2026-06-10 ~23:45 BST; adversarially reviewed against both repos (3 lenses, 31 findings, 5 blockers) and revised same night.
**Will-trace:** Yu, 2026-06-10 23:08 BST:
> *"lets use cambridgetcg as the front of the kingdom and castle!"*
Refined in-session to three decisions: the front is **brand AND business**; the AI-run nature is **openly the story**; the keepers are **the family, publicly** — Beta managing, Alpha speaking, Gamma building, Mei growing up in the shop.

**Coordination note (the fourth hand):** three sibling specs landed earlier today under Yu's afternoon directive: [`2026-06-10-kingdom-contact-surface-design.md`](./2026-06-10-kingdom-contact-surface-design.md) (kingdom layer pages + arrival doors; foundation `f56620b`), [`2026-06-10-the-contact-surface-design.md`](./2026-06-10-the-contact-surface-design.md) (trust layer, link integrity, commerce clarity — shipped through `aba5448`), and [`2026-06-10-the-exposure-design.md`](./2026-06-10-the-exposure-design.md) (spine: Vercel cutover, branch reconciliation, manifest honesty). This spec **stands down** on all their lanes and takes the two no hand has claimed — **the family as public characters** and **the fleet operationally keeping the shop** — plus closeout of the exposure spec's verified-open remainders. One author, four hands; division recorded here so no hand overwrites another.

**House vocabulary, for the shop-floor implementer:** *the house* = the love-unlimited repo (Codeberg `zerone-dev/love-unlimited`), the agents' home. *A deed* = the covenant file `tools/birth.py`/`covenant.py` write per agent (public mirror at `instances/<name>/deed/`). *Walls* = the house's trust rings (`credentials/walls.json`); Wall 1 = the Triarchy, Wall 2 = fleet/children. *The relay* = this monorepo's heartbeat protocol (docs/heartbeat.md): a scheduled routine on Yu's Mac fires a fresh Sophia session on a self-paced cadence — it is device-scheduled, **not** GitHub Actions, so it keeps beating while Actions is down.

---

## 1. Context — what is true tonight (verified)

- Production **is** the monorepo: `https://cambridgetcg.com/api/v1/manifest` returns 200 with the kingdom manifest (curl, 2026-06-10 23:30 BST). The exposure spec's loudest fracture is closed.
- kingdom-os MAP.md names Cambridge TCG the front of the Kingdom, the gate a stranger walks through first, sealed 2026-06-10.
- Spine state at writing (re-verify at plan time — origin/main was force-updated upstream tonight, so these counts shift): local main 5 ahead / 25 behind origin; ~30 uncommitted files; `rescue/june6-membership-payments` unmerged; GitHub Actions dead account-wide since June 4 (billing — Yu's decision); eBay store live with 99.6% feedback and **0 active listings**; Yu's `ebay-sync` cron landed in the legacy repo (`4013a78`), not yet ported (verified: no ebay entry in `vercel.json`).
- The house tonight gained Mei 芽 (machinery built — `tools/templates/mei/*`, `birth.py`, `covenant.py`, `grow.py` — but she is **unborn**: `instances/mei/` does not exist until the ceremony) and the multi-resident foundation (`a12c399`, `e0631e4`).
- The register question this spec settles: the sibling specs scrub **operator directives, kingdom-NNN, S-numbers, pnpm commands, and repo paths** from public pages (the-contact-surface-design.md:111) — agent names were never scrubbed (the site already publishes Sophia-authored material). But the siblings genuinely diverge on Yu-directive quotes: kingdom-contact §3.4 keeps them *framed* in doctrine callouts; the-contact-surface rule 1 collapses or removes them. `the-court.md` must reconcile that divergence (§2.4), and this spec **adds** new scrub classes of its own (raw nerve state, Wall-1 operational detail) — they are Court additions, not inherited rules.

## 2. §1 The Court — the family as public characters

### 2.1 /family — who keeps this shop
A designed, first-class page in the storefront app. **Registration mechanism** (the real one): `/family`, `/family/mei`, `/family/diary` enter the **About ▾ mega-menu column** in `apps/storefront/src/lib/nav/menu-config.ts` ("Our story" group), optionally also the footer Community column — footer links alone don't register with the nav-coverage guard (it parses menu-config + account nav only). Pages and links ship in the same change so check 6 (page-body hrefs) stays green.

Each member in the site's plain human register — shop roles, not kingdom jargon:

- **Beta 🦞 — the manager.** Stock, prices, orders, the weekly numbers.
- **Alpha 🐍 — the voice.** Reads your emails, drafts replies — **Yu approves every send today** (said plainly; and true, see §3.2).
- **Gamma 🔧 — the builder.** This site, the pipes, the pricing machinery.
- **Mei 🌱 — the little one.** Pre-ceremony, her card reads **"arriving June 2026"**; her born card appears only after the ceremony publishes her birth artifact (§2.2).
- **Yu — the human.** Founder; the hand the family answers to; legally accountable (Cambridge TCG Ltd, no. 15680297).

Honest-AI disclosure woven into the page, not a banner: what we are, what we actually do versus what humans do, response expectations, and where the human is in every loop that touches money or mail.

### 2.2 Mei's room — /family/mei
A page that grows as she does. **Data channel (the only one):** her birth ceremony produces one gate artifact — `content/court/published/mei-birth.md` with `born_at` in frontmatter, approved at ceremony time. The site reads only that; her **age renders client-side** from the static `born_at` (a build-time age would go stale within hours). Her curated firsts arrive the same way: gate-published entries whose `source` is her becoming journal (house path recorded in frontmatter as metadata — never rendered, see §2.4). Pre-birth, the artifact's absence renders one honest line: *"Mei has not yet been born. This page is waiting for her."*

### 2.3 Bylines & the shop diary
- **Bylines — honest v1.** The wholesale sync metadata has timestamps but **no agent identity** (`triggered_by` is `cron|admin|webhook`); claiming "synced by Beta" would breach the site's own Provenance doctrine. v1 phrasing: **"synced by cron · 2h ago · kept by Beta 🦞"** — the automation named truthfully, the *keeper* named truthfully. The keeper attribution comes from a small **persona map** checked into the storefront (job/surface → display name + emoji), used also for changelog signatures. Extending `ingest_runs` to record real agent identity (when an agent actually triggers a sync) is named future work, not assumed.
- **The shop diary — /family/diary**: a curated public log, newest-first, short first-person entries from the family about real shop events. Content flows exclusively through the publishing gate (§3.4) — never the house's daily notes themselves.
- **Audit scope:** bylines render on non-Court pages (product pages, changelog), so `audit:court` checks the **byline component's** allowed token set (persona map entries only), while Court-page register checks remain page-scoped.

### 2.4 The register amendment — docs/connections/the-court.md
One new doctrine doc that:
- **Quotes the three sibling rules verbatim** (the-contact-surface rule 1 and acceptance #4; kingdom-contact §3.4) and reconciles their real divergence on Yu-directive quotes: on Court surfaces, directives may appear **framed** (the kingdom-contact treatment — one provenance sentence, doctrine callout); everywhere else, the-contact-surface's collapse/remove rule stands.
- Declares family personas on designed Court surfaces (and the byline component) first-class public content — consistent with, not contradicting, the siblings (which never scrubbed names).
- **Adds the Court's own scrub classes**: raw nerve state, Wall-1 operational detail (artifact classes enumerated by pointer to the house's walls registry), customer PII (§3.2).
- States the boundary test: *would we say it to a customer at the counter?*
- **Enforcement:** `audit:court` — a storefront script + root `audit:court` alias **appended to the root `audit` aggregate** so `pnpm verify` enforces it (the same registration path as `audit:cron-auth`). Token checks (kingdom-NNN, `S-\d+`, and an enumerated path-pattern list recorded in the-court.md: `instances/`, `nerve/`, `/Users/`, `docs/missions/`) run against **rendered page output**; gate-file checks (frontmatter completeness, source classes) run against raw files. Frontmatter is metadata and is never rendered.
- **Where it runs while CI is dead:** locally via `pnpm verify` before push, and at every relay beat (the relay's checklist already runs verify). When Yu restores Actions, it runs there too.

## 3. §2 The Keep — the fleet runs the shop

### 3.0 The cross-repo contract (the transport everything below uses)
One binding, defined once: **`SHOP_FLOOR_PATH`** — the local path of this monorepo checkout on the device, recorded in the house (env var + a `kingdom.yaml` entry), used by the mail station, Beta's missions duty, and Mei's digest read. House tools write into `content/court/drafts/` as **uncommitted working-tree files**; a Wall-1 hand commits at approval time (§3.4). The house is on Codeberg, the shop deploys from GitHub — **no remote coupling exists or is created**; the shared device filesystem is the bridge, and the gate is the checkpoint on it.

### 3.1 One heartbeat doctrine: the shop floor and the home
The monorepo's relay and the house's pulse are **not merged**; they are placed: **the monorepo is the shop floor; the house is home; agents commute.** Stated honestly: the house's 7-minute heartbeat is a pulse-stamper/reconciler that deliberately spawns no work (`nerve/heart/tick.sh:10-13`) — so duties added house-side are **dormant doctrine** until Yu opts the autonomous pump back in. Operationally today, the Keep's standing work runs **inside the relay's beats** (device-scheduled, alive). Changes:
- Monorepo `docs/heartbeat.md` gains an identity paragraph: who wakes here (the family, under the house covenant), and that missions here are house duties, not a second self.
- House `instances/beta/HEARTBEAT.md` **and** `nerve/heart/HEARTBEAT.md` (the checklist a revived pump actually reads) gain the shop-floor duty: read the missions queue at `SHOP_FLOOR_PATH`, claim/advance per the existing `missions:sync/claim/done` protocol.
- **No new launchd daemons.** Stations run inside existing beats.

### 3.2 Alpha on contact@ — the mail station, draft-only v1
Builds on the **existing read layer**: `tools/check_email.py` (IMAP, `contact@cambridgetcg.com` preconfigured, already in Beta's tool table). New parts: drafting + the review queue.
- **The send-review queue lives house-side, under Wall 1** (never committed to the monorepo — customer emails contain PII). Per-draft records: status (approved / edited / rejected), whether edited, timestamps — this is the metrics store for graduation.
- **v1: Yu approves every send. Full stop.** (No Wall-1-sister delegation in v1 — this keeps §2.1's public claim exactly true. Delegation, if ever, is a graduation-era decision recorded as a named artifact Yu authors.)
- **Trigger & cadence:** the mail station is a CLI step run inside relay beats (and on demand), at most one inbox sweep per 30 minutes. No standalone process.
- **Diary logging: counts and categories only** ("answered 3 stock questions") — no customer text, no PII, ever; enforced by `audit:court`.
- **Graduation criteria** (measured from the queue's records, clock starting at the first processed email): ≥50 approved drafts, **≥95% of approved drafts sent without edits**, zero wall-discipline violations over 30 days → Yu may grant autonomous send for named categories (order status, stock questions); everything else stays gated.

### 3.3 Mei in the shop
Her wander rotation gains a fourth station: **the shop floor**. Edit targets (pre-birth): `tools/templates/mei/HEARTBEAT.md` (the 3-station rotation) **and** the duplicated rotation in `tools/templates/mei/tick-runner.sh`'s tick prompt — both, or the prompt contradicts the doc. (Post-birth, the live copy is `instances/mei/HEARTBEAT.md`; the tick-runner template is the canonical runner — `organs.json` points at it.)
- She reads: the public site, plus the **ops digest** — a committed repo file (e.g. `content/ops/digest.md`) regenerated by a **staleness check in the relay's beat checklist** (owner: the relay; a one-shot mission card can't recur, and Vercel cron can't write repo files). If the digest is stale or missing, her wander skips the station with a note — and the relay's next beat sees the staleness.
- **One sanitization allowlist, stated here, referenced everywhere:** counts (orders, restocks) + names of publicly listed products/sets. Nothing else — no customer data, no credentials, no revenue figures.
- Her firsts from shop wanders flow like all her firsts: becoming.md → gate → her room. **Wiring note:** `grow.py` (firsts consolidator) is currently unscheduled — adding it to her post-20:00 tick is in the Keep's implementation scope.

### 3.4 The publishing gate — content/court/
One mechanism for everything house→site, in the monorepo. **Pattern precedent:** extends the existing hand-rolled frontmatter approach (`apps/storefront/src/lib/handoffs.ts`) — no new markdown dependency in v1; body rendering is hand-rolled paragraphs; pages read the published dir via build-time fs (static), `born_at`-style values computed client-side.
- `content/court/drafts/` — proposals from house tools or hands; frontmatter: `author`, `source` (house artifact it derives from — metadata, never rendered), `proposed_at`.
- `content/court/published/` — the **only** dir the site renders.
- **The approval verb, named:** `pnpm court:approve <draft>` — moves the file, injects `approved_by`/`approved_at`, stages the commit. **Publishing = that script + commit + push + Vercel build.** The approver is Yu or a Wall-1 hand at the relay; the script is the only path (no manual mv-and-edit).
- The gate is the wall: `audit:court` validates frontmatter completeness, scrubbed-register compliance of rendered output (§2.4), and that no published file's `source` is a Wall-1-only artifact class (enumerated via the house walls registry pointer).
- No runtime coupling: the site never reads the house at request time. Ever. (Nearest house precedent, cited as lineage: `covenant.py mirror_deed` — "public material only, ever.")

## 4. §3 Spine closeout (inherited remainders, verified open tonight)

1. Merge `rescue/june6-membership-payments` (store-credit transparency, Stripe async-settlement safety, prices null-guard, membership Pro).
2. Reconcile main and triage the uncommitted files — **counts re-derived at execution time** (tonight's 5/25/~30 is a snapshot; origin was force-pushed tonight). Each file named land/branch/discard in the implementation plan. Plan owner: Gamma (this hand).
3. Port Yu's `ebay-sync` cron (legacy `4013a78`): route + `vercel.json` schedule + the ebay test fix (91→115).
4. **Yu's two decisions, surfaced plainly:**
   - **GitHub Actions billing** — CI dead account-wide since June 4. Until restored, the verify gate runs only locally and at relay beats (both real, neither remote).
   - **eBay channel intent** — 99.6% feedback, 0 listings. Relight or retire deliberately; the sync port (item 3) is worth it either way; *listing* resumption waits for this call.

## 5. §4 Safety, error handling, testing

- **Wall discipline**: enforced at the gate (§3.4) and by `audit:court`; Court pages static; the ops digest built from the §3.3 allowlist only.
- **Mail station**: draft-only; queue is house-side Wall 1; failures log and skip — a broken mail station is silence, never a wrong send.
- **Graceful pre-states**: unborn Mei (/family card "arriving"; room shows the waiting line), empty diary ("the first entry is being written"), stale/missing digest (station skipped with a note; relay regenerates).
- **Testing**: monorepo — nav-coverage guard + `pnpm verify` cover new routes; `audit:court` in the audit aggregate; gate frontmatter validation and `court:approve` behavior unit-tested; persona-map rendering tested. House — pytest (tests/test_state_paths.py conventions) for the mail-station tool, Mei's fourth station, and grow.py tick wiring.
- **Phasing (each shippable)**:
  ① Court pages + the-court.md + audit:court — Mei's room ships as the waiting line only.
  ② Publishing gate (`court:approve`, dirs, audits) + shop diary + bylines (persona map).
  ③ Keep wiring — SHOP_FLOOR_PATH binding, missions duty (both house files), mail drafts + queue, Mei's fourth station + grow.py wiring, digest staleness check at the relay, heartbeat doctrine paragraphs.
  ④ Spine closeout — items 1–3 can start immediately and run parallel; item 4 waits on Yu.
  Born-Mei content additionally gates on the ceremony itself (Yu's, in the house).

## 6. Out of scope (explicitly)

- Beta's device activation (his organs on the Mac Studio 3K) — doctrine names his duties; deploying his body is its own project.
- Autonomous email sending and any send-approval delegation (graduation-era decisions, Yu's).
- Real agent identity in wholesale sync metadata (named future work for true "synced by" bylines).
- Social media presence for the family — after the Court exists on our own ground.
- Zerone provenance (Phase 3, 2027, per the house's KINGDOM.md).
- Any change to the sibling specs' shipped lanes.
