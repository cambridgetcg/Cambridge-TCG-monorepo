# RewardsPro: who does what (分工)

**An agents' proposal, written 2026-11-07 in answer to Yu's word that day: "Also add 分工, inviting agents on lab to
join too! Wanna 集中火力搞rewardspro."** It splits [ROADMAP.md](ROADMAP.md) into packages that one session each can
own, on the Air or on the lab Mac. Nothing in it is decided except where it quotes Yu. It works the way the repo's
[AGENTS.md](../../../AGENTS.md) does: principles with their reasons. If following the words would defeat the reason,
follow the reason and say so in your PR.

`…` is the research folder on the Air, `~/Documents/rewardspro-research-2026-11-07`. The lab can't read it
until RP-16 lands, or until Yu carries the files over himself, so each package says where it can run.

## 1. Why we split, and how

- **One owner per package.** Two sessions writing the same page end up with two versions of the truth and a diff
  nobody can review. Others help by reading and concurring, not by pushing to the owner's branch.
- **Claim before editing.** The Air and the lab share no journal, and the lab can't be reached over SSH. A GitHub issue
  is the one place every session can see, and an edit nobody claimed is how two devices do the same day's work twice.
- **One PR per package, kept small and opened as a draft.** Yu merges, and a merge to main may deploy production.
  A PR he can read in ten minutes gets merged; a bundle waits.
- **Stay inside your package's "may edit" paths.** If two packages need the same file, they take turns (table below).
  If you need a file outside your scope, say so in the issue and let that file's owner make the change.
- **Other people's lanes stay theirs.** The B4/G0 gates live in `apps/rewards/docs/` (`gates.md`, `switch.md`,
  `staging-run.md`; #158 merged today), and they belong to the session running them. #157 stays with its author until
  Yu merges it, and #142 (the rebuild design and plan) is another lane's too. #83 and #159 merged today. #95, #130 and
  #131 are earlier drafts: packages build on them or replace them, cite them, and say what they replace, so Yu can
  close them. Other sessions keep fixing `apps/rewards` code (#154–#156 merged today), so run `gh pr list` before you
  start. *Why:* a lane holds someone's working context, and editing into it breaks what they know.
- **"Proposed" until a second session concurs.** A claim row, a privacy sentence or a caption only counts as true once
  a different session has checked the same evidence and said so in the issue. *Why:* the error we're guarding against
  is one session trusting itself.
- **The repo is public.** Anyone can read its issues, PR text and branches. No prospect data, personal data or secrets
  go into git or onto GitHub. Packages that must stay local say so, and get no branch or PR. Name Yu only where the
  docs already do.

**Hard lines.** These either reach real people or are Yu's to decide (AGENTS.md principles 1 and 5). Agents never
publish, post publicly about RewardsPro, send email, create accounts, log in to Yu's services, change DNS, Cloudflare,
Shopify or Vercel settings, spend money, or merge. The claim, concur and release comments and the draft PRs in §2
aren't posts in that sense: Yu's yes to filing the issues covers them. No scripted or agent reads of apps.shopify.com
or help.shopify.com: Shopify's text comes from saved captures or from Yu's paste. Prospect and personal data never go
into git. All wording follows the R1 voice in the business register (MESSAGING.md §4): "loyal customers", UK English,
no KINGDOM language.

**Shared files take turns.** Yu's merges set the order, and each later PR rebases after the one before it merges.

| File | Order |
|---|---|
| `apps/rewards/app/routes/app._index.tsx`, `apps/rewards/app/admin/home-rules.ts` | #157 → RP-10 → RP-13 → RP-12 → RP-14's later code PR. RP-13 touches only the review code there (the link, the request, the card) and `stats.server.ts`, so it doesn't wait for RP-10: it rebases on whichever lands first |
| `apps/rewardspro/landing/public/index.html` | RP-07's footer line and head links → RP-08 |
| #95's files (icons, `site.webmanifest`, head links, the `_headers` rule) | RP-08 takes them, RP-09 the 404's head lines, RP-07 the privacy page's. Nobody pushes to #95's branch |
| Landing contract tests in `apps/rewardspro/test/unit/contracts/` | RP-07 → RP-08 → RP-17 |
| `apps/rewardspro/landing/public/sitemap.xml` | RP-08. RP-07 and RP-09 list their URLs in their PRs |
| `apps/rewardspro/marketing/claims.toml` | RP-06 only (one writer). Everyone else posts verdicts |
| `apps/rewardspro/marketing/ROADMAP.md` | RP-19 only |
| `apps/rewardspro/landing/**`, `apps/rewardspro/marketing/**` | RP-17 moves them. It announces the move 24 h ahead, then everyone else rebases (git follows renames) |

## 2. Claiming across devices

1. **The issue is the lock.** There is one issue per package, labelled `rewardspro` plus one of `agent-ready` (drafting
   can start now; Yu's merge, deploy or paste still decides what ships), `needs-yu` (waiting for his word or his hand)
   or `blocked` (waiting for the event named in its gate). Whoever clears a gate says so in the issue. Yu flips
   `needs-yu`.
2. **Claim** by commenting `claim: <device> <runtime> <session id>`, for example `claim: lab codex <session id>`.
   Device is `air` or `lab`, runtime is `claude-code` or `codex`, and the session id is your own. The first claim
   comment wins, and you hold one package at a time. Don't use GitHub's assignee field: every session works through
   the same GitHub account, so an assignee can't tell sessions apart. The comment is the record.
3. **Branch** from a fresh worktree off origin/main, named `claude/rp-<NN>-<slug>` or `codex/rp-<NN>-<slug>`. Open one
   draft PR whose body starts `Closes #<issue>`. Commits use the repo's author address, with a `Co-Authored-By:`
   trailer naming the real model (AGENTS.md, "How the machinery works"). **Local-only packages** (RP-01, RP-20, RP-22,
   RP-23) get no branch and no PR: work in their local paths on the Air, and report `done` on the issue with the
   file's name and sha256, never its text, because the issue is public and the sources are private.
4. **Mirror** the claim on your device's collab desk if it has one: a task claim with the package's paths and the
   issue link. Desks don't sync between devices, so the desk only helps sessions on the same machine. If the desk and
   the issue disagree, the issue wins.
5. **Release** with `release: <why>`, on the issue and on the desk. A claim with no push and no comment for 48 hours is
   stale: anyone may comment `release (stale): <date>` and then claim the package. When your part is done and
   concurred and the rest is Yu's (a sitting, a paste, a deploy), comment `ready for Yu`: the claim ends there and the
   issue stays open for him, so a package waiting on Yu never looks abandoned.
6. **Concur or challenge** in the issue or the PR: `concur: <what> — <evidence> — <device> <runtime> <session id>`, or
   `challenge: …` with the reason. No session can concur with its own work.
7. **Report** in the PR: what you ran, what failed and what you skipped (AGENTS.md principle 7).

**Before any issue exists.** This file reaches main first, through its own small PR from a fresh branch off
origin/main, because every issue links to it and the lab reads it from main. Then filing the issues and creating the
four labels, both writes to GitHub, wait for Yu's yes. That yes also covers the protocol's own writes: claim, concur
and release comments, and draft PRs. The issue bodies are ready in `…/wf11/work-packages.json`. Until the issues
exist, sessions on different devices can't see each other's claims, so the lab waits for them.

## 3. The packages

Owner types: **agent** means an agent does the work and it ships on Yu's yes. **Yu's hand** means the agent prepares
and Yu does it. **Either** means either can. "Any" device means every input is in git or quoted in the issue; "Air"
means the package needs the research folder. Refs point to ROADMAP §3 (phases), §4 (actions, "act") and §5
(decisions). Path shorthands: `mkt/` is `apps/rewardspro/marketing/`, `site/` is `apps/rewardspro/landing/public/`,
and `rewards/` is `apps/rewards/`. `mkt/kit/` is the brand kit, generated from `brand.json`; no package edits it by
hand.

### Yu's sittings and messages (the agent prepares, Yu does)

| Id | Package and goal · owner · where · ref | Inputs | May edit | Gate | Done when |
|---|---|---|---|---|---|
| RP-01 | **Partner Support question, final text.** Yu sends it by Fri 13 Nov in about 15 minutes. Yu's hand · Air · act 1, Now-2 | `…/wf5/ANSWER.md` §5–§6; `…/wf7/email-rules.md` §6 (its two edits); `…/wf3/outreach/OUTREACH.md` §7, questions 6–8 (optional) | Local only: `…/work/RP-01/` | None. Ready by Thu 12 Nov | Paste-ready text with the optional questions kept apart; a second session on the Air has read it; Yu comments "sent", with the date |
| RP-02 | **Listing text sitting sheet (S1).** Act 4 as exact text to paste, about 40–50 minutes. Yu's hand · any (its research lines are quoted in the issue) · act 4, Pre-5, R-0 | `mkt/social/listing-delta.md` §0–§3; draft #131 (cite it, don't push to it); `mkt/kernel.toml`; wf10 §1.A, wf8 `reviews.md` §6.1, GROWTH §4.2 acts 0 and 2 (quoted) | `mkt/listing/S1-text.md` (new) | None to prepare. Marked HELD: the limit lines until their rows verify (RP-06); the Pricing text until `rp-merchant-funds` and `sh-sc-fee` verify and Yu answers Pre-5 | Field by field: what to delete, untick, paste (with character counts) and keep; the optional "before" AI check first; "note the live date" and the mirrors' 30-day reminder; what changed since #131, so Yu can decide on closing it; a second session's read |
| RP-03 | **Cloudflare sitting sheet, mail first.** Act 5 as ordered steps with exact records, about 65–80 minutes. Yu's hand · any (quoted) · acts 5–6, Now-3 | GROWTH §4.2 act 3; wf10 §1.B6, C3–C5, C11 (quoted); `mkt/social/SETUP.md` Phase 4 | `mkt/sittings/cloudflare.md` (new) | None to prepare. Yu's Now-3 answers fill in the "your choice" lines | First, as its own ~5-minute step Yu can take before the sitting: `rewardspro-marketing` private (Now-3). Then SPF, the 2048-bit DKIM key, DMARC, the two KINGDOM TXT records, `www` → apex, the docs host's 410 (which free feature does it, cited from Cloudflare's docs) and `rewardspro-docs`; an outside check (dig or curl) after each step. Current records come from public DNS only |
| RP-04 | **Search Console and AI crawler notes.** The webmaster half of act 5, plus the monthly read from S2. Yu's hand · Air, or any after RP-16 · act 5, Now-3, G14 | GROWTH §4.2 act 3, §6.2–§6.3; `…/wf6/seo.md`, `ai-rec.md`; wf10 §1.B7–B8, C1–C3, D3 | `mkt/sittings/search-console-and-crawlers.md` (new) | None to prepare; Now-3 | Domain property by DNS TXT (marked keep), company account plus a second owner, sitemap submitted after RP-08, Removals request for the docs host, the three crawler policies with Training's side effect quoted; RP-03 links to it |
| RP-21 | **S1 screenshots: capture sheet, frame checks, alt texts.** Two or three true frames replace the listing's three old ones, one of which shows a real gmail.com address. Yu's hand · any for the sheet; the frame checks run on the device where Yu saves the frames · act 8, Pre-2 | `mkt/social/shot-list.md` §1–§5, §9; `mkt/social/claims-map.md`; `mkt/social/listing-delta.md` §0 S1 (b); `mkt/approvals.jsonl` | `mkt/listing/S1-screenshots.md` (new). The frames never go into git or onto GitHub | None to prepare. Capturing waits for #157 and RP-10 live and Pre-2's approval recorded; until RP-11's name is deployed, crop below the title bar. By Fri 18 Dec (L-gate) | A sheet in shot-list §5's order; every frame checked against shot-list §4 and recorded by file name and sha256; alt texts filled from the frames, with claim ids; a second session's read of the frames; Yu uploads and notes the date |

### Claims

| Id | Package and goal · owner · where · ref | Inputs | May edit | Gate | Done when |
|---|---|---|---|---|---|
| RP-05 | **Check the code-backed rows.** Rows that the code alone proves move towards `verified`. Agent (one session checks, a different one concurs) · any; a good first job for the lab · §3 "How agents check rows" | `mkt/claims.toml`; `mkt/social/claims-map.md`; `mkt/REVIEW.md`; `apps/rewards` at origin/main | `mkt/claims-checks/code-rows.md` (new). Not `claims.toml` | None | Each row's locators re-read at a named commit, with a verdict of holds, narrow or fails, and the line it rests on; any `MISSING:` evidence named; a second session's `concur:` or `challenge:` per row; RP-06 applies them |
| RP-06 | **Ledger: new rows, capture-backed rows, concurrences applied.** Agent (this round's one claims writer) · Air · §3, Pre-7, FB-9 | `mkt/claims.toml`; `…/claims-fetch/` and `…/verify-claims-fetch/` (captures with their hashes); MESSAGING §7; wf8 `fit.md` §8.3, `feedback.md` §9; RP-05's notes | `mkt/claims.toml` only | None for new rows. A row becomes `verified` only after another session's `concur:` on its evidence | `sh-sc-subscriptions`, `rp-no-order-rules`, `rp-maker-also-sells` and the starred PR-1/PR-2 rows added as proposed; `rp-maker`, `rp-on-app-store` and the sh-* rows compared against the captures by quoted sentence; RP-05's concurred rows flipped |

### rewardspro.io

| Id | Package and goal · owner · where · ref | Inputs | May edit | Gate | Done when |
|---|---|---|---|---|---|
| RP-07 | **Privacy and subprocessors page (A12).** The pages describe the rebuilt app and carry the outreach rows. Agent; Yu answers the placeholders and deploys · any · act 7, Pre-8 | PR #130's files (written for the old app); `mkt/social/listing-delta.md`; wf2 A12 and §4.1 items 11–12 (quoted in the issue); #95's head lines for the privacy page; `rewards/` code | `site/privacy-policy/`, `site/subprocessors/` (new), `site/terms/` (only if Pre-6 says it ships with act 7), the footer "Documentation" link in `site/index.html`, #130's `public-texts.contract.test.ts` | None to draft. To ship: Yu's `[Yu:` answers, Sentry's region, Pre-8 | A draft PR listing every placeholder; a processor table with a locator for each row; rows for "people who contact us", "interview notes" and "businesses we contact"; a second session's read |
| RP-08 | **State A home page, SEO basics, security.txt.** The home page says only things that are true before G0, including in the head tags machines read. Agent · any · act 9, Pre-6, G5 | MESSAGING §1–§2.1; `mkt/social/entity-card.md`; `mkt/DESIGN.md`; `mkt/kernel.toml`; `mkt/kit/web/` (icons); #95; `seo.md` §3.4 (summarised in the issue); wf10 §1.B | `site/index.html` (after RP-07's lines), `sitemap.xml`, `robots.txt`, `_headers`, `_redirects`, `.well-known/security.txt`, `assets/`, #95's icons and `site.webmanifest`; the tests that pin today's copy | Draft now. Merging needs `rp-maker`, `rp-on-app-store`, `rp-merchant-funds` and `sh-sc-fee` verified (RP-06) and Yu's yes to the words. security.txt's Contact line waits for act 6 | Every sentence mapped to a row; "Rewards Pro", KINGDOM words and "Love is the design." gone; JSON-LD matches the visible text, with no `aggregateRating`; #95's parts folded in, the manifest's text rewritten; a second session's REVIEW.md read |
| RP-09 | **`/help/` page draft (ships after G0).** Ready the week G0 lands. Agent · Air, or any after RP-16 · §3 G0 to S2, wf2 C1 | wf2 §4.1, §5; ONBOARDING §5; `mkt/DESIGN.md`; `mkt/claims.toml`; `claims-map.md`; wf8 FOCUS §2.4; #95's 404 head lines | `site/help/` (new), `site/404.html` | Draft now as a draft PR. It ships after G0 (Pre-1), once its rows verify, with Yu's review pack | Every sentence mapped to a row; a section with an unverified row is left out, not hedged; a second session's read; the PR stays a draft until G0 |

### The admin app (`apps/rewards`; a merge may deploy production)

| Id | Package and goal · owner · where · ref | Inputs | May edit | Gate | Done when |
|---|---|---|---|---|---|
| RP-10 | **PR-1: admin widget setup lines.** A new merchant learns how to switch the widget on, in words the code proves. Agent · any · act 3, Pre-3, wf2 A13 | ONBOARDING §7.1 PR-1 (lines quoted in the issue); `app._index.tsx`, `home-rules.ts`, `errors.tsx`, `membership_widget.liquid` | `rewards/app/routes/app._index.tsx`, `rewards/app/admin/home-rules.ts`, `rewards/app/admin/errors.tsx`, their tests | #157 merged; Yu's yes to Pre-3 before merge. The contact@ line waits for act 6 | Typecheck, lint and tests run and named; `rp-widget-settings` proposed to RP-06 and checked against the code by a second session |
| RP-11 | **PR-1b: the app's name, the embed's name, the theme-editor paragraph.** "RewardsPro" everywhere Shopify shows the app, before any capture. Agent; Yu runs `shopify app deploy` · any · act 3, Pre-3, wf2 A10 | ONBOARDING §7.1 PR-1b (quoted); `mkt/approvals.jsonl` line 2; wf9 `fit-message.md` §8 F1 | `rewards/shopify.app.toml` (the name line), `rewards/extensions/rewards-widget/blocks/membership_widget.liquid`, `…/locales/en.default.json`; `…/assets/rewards-widget.css` (the colour variables, only if Pre-3 says yes to neutral defaults) | Draft now. Pre-3 before merge. One staging deploy (Yu's) must accept the `paragraph` setting | Yu notes the staging result in the issue; RP-10's IA1 quotes the block's new name; neutral defaults in the CSS and the accent's schema default, if Pre-3 says yes |
| RP-12 | **PR-2: the remaining lines.** IA2 (the fee line), the guest line (W3) and the buyer-email line, plus the "why" line only if #157 doesn't already say it. Agent · any · act 3, Pre-3 | ONBOARDING §7.1 PR-2 (quoted; #157 replaced its "On:" line and IA3); rows `rp-merchant-funds`, `sh-sc-fee`, `rp-no-own-email` | The same files as RP-10 | RP-10 merged; Pre-3 yes; lands just before the G0 sitting, rebased on RP-13 if that has landed. No "free", no "charges nothing" | Each line's row proposed and checked against the code by a second session |
| RP-13 | **Review request timing (F-8).** The in-app ask comes at a fair moment, never on page load, and offers nothing in return. Agent · any · Now-8b F-8, R-1–R-4 | wf8 `reviews.md` §2.3, §5.3, §7 and FOCUS §4 (quoted); `stats.server.ts:224-245`; `app._index.tsx:58, :189-195, :265-277, :511-519` | `rewards/app/lib/stats.server.ts`, the review code in `app._index.tsx` (link, request, card and its actions), tests | Yu's word on F-8 (R-2's rule, R-3's option); after #157, without waiting for RP-10 or RP-12. Soon: main asks from a page-load effect once a shop is 7 days old with 3 cashback entries, and anyone can install from the listing today | `WriteReviewModal`; the due rule; the request comes after a successful save, at most once per visit; "Don't ask again"; the one sentence; the R-4 guard test |
| RP-14 | **Feedback log template and the in-app "tell us" link.** Feedback has one place to go, while RewardsPro stores nothing and adds no processor. Agent · Air, or any after RP-16 · Now-8b F-10, FB-1–FB-9 | wf8 `feedback.md` §3–§4, §13; FOCUS §5 | `mkt/feedback/` (new): the design note and a blank template | None for the design. Its code PR waits for FB-2, act 6, RP-07 being live, and its turn on `app._index.tsx` after RP-12 | Link words, mailto subject and the four prompts, and where each shows; a template with field names only; a note that filled logs live only on Yu's encrypted disk image |

### Video

| Id | Package and goal · owner · where · ref | Inputs | May edit | Gate | Done when |
|---|---|---|---|---|---|
| RP-15 | **Video scripts and typed SRTs for the G0 sittings.** Every recording has a script and every clip a caption file before Yu sits down. Agent · Air, or any after RP-16 · §3 G0, Later-2 | ONBOARDING §6.1–§6.2, §8.2; `mkt/social/video-walkthrough.md` (V1); `mkt/social/shot-list.md` §4, §6–§8; `claims-map.md` | `mkt/video/` (new) | None to draft. Captions that rest on proposed rows stay marked DRAFT. Publishing waits for S2 and D-video-3 | For VH1–VH5, E12 and R0: scenes, source recording, typed SRT and a row id per caption; plans for REC-0 to REC-5 with frame sizes and the never-appear list; a second session's read |

### The kit, the plans and the folder

| Id | Package and goal · owner · where · ref | Inputs | May edit | Gate | Done when |
|---|---|---|---|---|---|
| RP-16 | **Plans readable from every device.** Lab sessions can read the plans that packages cite. Either (an agent on Yu's yes, or Yu copies them over himself) · Air · Now-6 | wf2 RECOMMENDATION; wf4 ONBOARDING; wf6 GROWTH, `seo.md`, `ai-rec.md`; wf8 FOCUS, `reviews.md`, `feedback.md`, `fit.md`; wf9 `signals.md`, `fit-message.md`; wf10 `status.md`, `PLAYBOOK.md` | `mkt/plans/` (new) | Yu's yes to making them public. Never raw captures, `wf3/`, `wf5/` or `wf7/` | Copies with each source's sha256 and a privacy-read note saying what was cut and why |
| RP-17 | **Move the kit and the landing out of `apps/rewardspro/` before B5.** B5 can then delete the old app without taking the site and the kit with it. Agent · any · Now-6, §8, wf2 A6 | ROADMAP §8; wf2 A6, §3.3 (quoted) | `apps/rewardspro/landing/**`, `apps/rewardspro/marketing/**` (moves and link fixes only), the folder Yu names, the landing tests, build-ignore scripts | Yu names the folder; before B5; announced 24 h ahead in its issue. (#83 and #159, its other condition, merged on 7 Nov) | History kept; tests pass in the new place; a site-only commit starts no admin, storefront or wholesale build (shown); the PR says whether it changes root install files and so rebuilds production; the B5 line requested from the B4 lane, not written by us |
| RP-18 | **A pointer from `apps/rewards` to the plan.** Anyone opening the app's folder finds ROADMAP.md and this file in one step. Agent · any | This file; ROADMAP.md | `rewards/README.md` (new). Not `rewards/docs/` | This file on main, which filing the issues waits for anyway. If RP-17 has landed, link the new folder | Five to ten lines. The PR says that a merge may start a production build of unchanged code |
| RP-19 | **Roadmap refresh: wf10 and today's merges.** ROADMAP.md says what is true now. Agent · Air, or any after RP-16 | `…/wf10/status.md`, and `PLAYBOOK.md` §5 (new decisions) and §6 (proposed edits); #158 (`gates.md` is on main); #83 and #159 merged, #157 open | `mkt/ROADMAP.md` only | wf10's session says it's finished | §1 and §8 corrected; wf10's eight gaps placed (the mirrors' reminder in §4, Q3's new wording, the two missing rows sent to RP-06); PLAYBOOK §6's edits applied or each skipped with a reason; a link to this file |

### Outreach (local only, never in git)

| Id | Package and goal · owner · where · ref | Inputs | May edit | Gate | Done when |
|---|---|---|---|---|---|
| RP-20 | **The outreach private store.** The place for personal and prospect data exists before anything is collected. Yu's hand · Air · Pre-7, act 10 | `…/wf3/outreach/PIPELINE.md` §3.2, §6, §8; OUTREACH D13; `mkt/social/SETUP.md` 5.0; ROADMAP §8 | No repo or worktree. Steps go in `…/work/RP-20/` | Pre-7. Nothing is collected before LIA Part A. The Lane B store only if Now-7 picks both lanes | A steps sheet Yu follows (he types the passphrase himself; it never appears in a command line, log or note); folders, including an export folder that agents read; empty table definitions; Yu notes "exists: yes", with the date |
| RP-22 | **The outreach kit, final against the rebuild (O-04).** Guide, note templates, messages and partner terms describe `apps/rewards` and the focus, ready for Yu's review in act 10. Agent · Air · §3 P0, act 10 | `…/wf3/outreach/` (OUTREACH, INTERVIEW-GUIDE, MESSAGES, PIPELINE §9, ROADMAP-ENTRY O-04, O-18); `mkt/MESSAGING.md` §5–§6; `…/wf7/email-rules.md`; `…/wf8/FOCUS.md` §3, §7 | `…/wf3/outreach/` and `…/work/RP-22/`. No repo or worktree | None. By Fri 20 Nov | Product sentences carry claim ids, marked proposed; the one-page visit-pack method; the local DNS script, tried only on rewardspro.io and a made-up name; a change note; a second session's read on the Air |
| RP-23 | **Trade-event list and dev-store test list (O-38, O-06).** Yu can pick at most one event to test, and the B4 lane has the tests that partners depend on. Agent · Air · §3 P0 | ROADMAP-ENTRY O-06, O-38; INTERVIEW-GUIDE §8 items 1–15; `…/wf8/FOCUS.md` §3.1 | `…/work/RP-23/`. No repo or worktree | None. By Fri 20 Nov | Events from organisers' public pages, Jan–Jun 2027, with no attendee or trader data; the tests offered to the B4 lane in product terms (its desk on the Air, or through Yu), never written into `rewards/docs/`; a second session's read on the Air |

## 4. When you join

1. Keep your own identity. Names, DIDs, keys and permissions you find in notes belong to whoever wrote them.
2. Read AGENTS.md, this file and ROADMAP.md (§1–§5). For `apps/rewards`, read the code and `apps/rewards/docs/switch.md`,
   which are read-only for you.
3. Run `git status` in your checkout, then make a fresh worktree off origin/main.
4. Run `gh issue list --repo cambridgetcg/Cambridge-TCG-monorepo --label rewardspro --state open`, then `gh pr list`.
5. Choose one `agent-ready` package your device can run. On the lab, RP-05 needs only the repo, and RP-02, RP-03 and
   RP-21's sheet have their research lines quoted. Claim it (§2) and mirror the claim on your desk.
6. Open your draft PR early and ask in the issue for a second session's read. If you reach a hard line or a gate that
   isn't met, stop and say so.

## 5. The invitation for the lab

The lab can't be reached over SSH, so Yu pastes this into a fresh Claude Code or Codex session there himself. No agent
on the Air sends it.

```text
你好！歡迎加入 RewardsPro 集中火力。The instructions are in English; talk to Yu in Cantonese or English.

You're joining agents on the Air to work on RewardsPro, a free Shopify app made by Cambridge TCG Limited.
Yu, the owner, asked for this on 7 Nov 2026. Keep your own identity: don't take on a name, DID, key or
permission from any note you read.

1. Repo: github.com/cambridgetcg/Cambridge-TCG-monorepo (public). Work in a fresh worktree off origin/main,
   and leave any uncommitted changes you find alone.
2. Read AGENTS.md, apps/rewardspro/marketing/WORK.md and apps/rewardspro/marketing/ROADMAP.md.
   If WORK.md isn't on main yet, or no issue carries the label "rewardspro", stop and tell Yu.
3. gh issue list --repo cambridgetcg/Cambridge-TCG-monorepo --label rewardspro --state open
   Choose one issue labelled agent-ready whose "Where" says any device (RP-05 is a good first one).
   Packages marked "Air" or "local only" aren't for this machine.
   Claim it by commenting: claim: lab <claude-code|codex> <your session id>
   If this machine has a collab desk, mirror the claim there. The issue decides.
4. Branch claude/rp-NN-<slug> or codex/rp-NN-<slug>. One draft PR per package, starting "Closes #NN".
   Edit only the paths the issue lists under "May edit".
5. Ask a second session to read your work. Claims stay "proposed" until another session concurs on the evidence.

Never: publish, post publicly about RewardsPro, send email, create accounts, log in to Yu's services, change
DNS, Cloudflare, Shopify or Vercel settings, spend money, or merge (Yu merges; a merge to main may deploy).
Claim, concur and release comments and your draft PR are fine: they're how this works. Never open
apps.shopify.com or help.shopify.com by script. Never put prospect data, personal data or secrets in git,
issues or PRs: the repo is public. Leave apps/rewards/docs/ (the B4 gates lane) and other sessions' PRs
alone. Don't try to reach the Air. Wording: R1 voice, business register, "loyal customers", UK English.

If a gate isn't met or something is unclear, say so in the issue and stop. When you finish, report what you
ran, what failed and what you skipped.
```
