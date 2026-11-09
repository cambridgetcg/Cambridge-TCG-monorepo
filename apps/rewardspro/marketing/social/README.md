# RewardsPro social and marketing kit

The agents' proposal for the owner, 2026-11-07. **Nothing here is published.** No account was created, nothing
was posted, uploaded, scheduled, sent, signed up for, logged in to, deployed, committed or paid for. Every text and
image is a draft until the owner approves it, and only the owner publishes, sends or spends. "The owner" is that one
person; this file names nobody.

Labels: **[V]** verified (evidence given), **[I]** inferred, **[U]** unknown.

## Where things stand (2026-11-07, about 13:05 UTC)

- **The app.** Production runs the rebuild (`apps/rewards`). `/api/health` answered 200 `ok/ready` at 13:06 UTC
  [V]. The switch record (`apps/rewards/docs/switch.md:64-90` at main 6bd092cb) has the production test order
  #1010 (store credit of £11.10 within the same second) and the B3 release `rewardspromembership-217`, with gate C
  done only in part. B3 step 5 merged as #153 [V].
- **G0 has not passed.** No production refund is recorded, and `apps/rewards/docs/gates.md` (B4) doesn't exist
  [V, `git ls-tree` at 6bd092cb]. B5 hasn't started.
- **Claims.** `../claims.toml` has 36 rows, all `proposed`. None is verified, so **no text in this kit can be pasted
  yet**, not even the reserve bios [V].
- **The App Store listing is still false.** It still says "sell a tier as a product" and shows the three old-app
  screenshots. It has no reviews [V, fetched 13:06 UTC].
- **rewardspro.io** still has the retired copy. Its title uses the banned spelling ("Rewards Pro — Explore loyalty
  systems"), and its footer says "Love is the design." [V, fetched 13:06 UTC].
- **Open PRs nobody has merged:** #83 (brand kit), #95, #130 and #131 (drafts written for the old app), #142 and
  #148 [V, `gh pr list`].

The order still holds: **the listing first, then rewardspro.io, then social posts.**

## The stages

| Stage | Holds when | Allows |
|---|---|---|
| **S0 Reserve** | The owner says yes to the handles and texts, and `rp-maker` and `rp-on-app-store` are verified | Create accounts with the name, avatar, a name-only banner and a reserve bio. No links, no posts. |
| **S1 Listing clean** | The false text, screenshots and video are gone from the listing, and the data request is trimmed | Optional Shopify Community help, in the owner's own words |
| **S2 Open** | G0 and B3 are recorded, the listing and rewardspro.io are true, the first-real-merchant steps are done or waived in writing, contact@ delivers, and every claim used is verified | Bios with links, LinkedIn milestone posts, the first video |

The full rules are in [STRATEGY.md](STRATEGY.md) §2.

## Files

| File | What it is | Usable when |
|---|---|---|
| [STRATEGY.md](STRATEGY.md) | The plan: progress, stages, channels, voice, cadence, costs, outreach and decisions D1–D12. Its top block lists the parts that later files replace. | Reading now |
| [SETUP.md](SETUP.md) | The owner's checklist: decisions, mailbox and Keychain, each account step by step, the Bluesky DNS record, S2, what not to enable. Phase 8 indexes every owner action in the other files. | Phase 0 now; accounts at S0 |
| [profiles.md](profiles.md) / [profiles.json](profiles.json) | Handles, probe results, bios (set A before G0, set B after), alt texts, which image goes where | Set A at S0; set B at S2 |
| [claims-map.md](claims-map.md) | For each row in `../claims.toml`: what would verify it, and which texts and images use it. It also lists the 11 rows asked for but not yet in the ledger. | Reading now |
| [entity-card.md](entity-card.md) | Plain "what it is, who makes it" text for state A (now) and state B (S2), JSON-LD, and a proposed `kernel.toml [entity]` and `brand.json` change (neither applied) | After the owner approves it |
| [listing-delta.md](listing-delta.md) | What #131 (listing text) and #130 (landing, privacy, terms, subprocessors) get wrong about the rebuilt app, field by field, with replacements | Deletions now (S1); new text after its claims |
| [shot-list.md](shot-list.md) | The screenshots: S1 frames for the listing, the G0 set of 8, recordings, what must never be in frame | S1 frames after their preconditions; the rest at G0 |
| [video-walkthrough.md](video-walkthrough.md) | V1, an 86-second silent recording of one paid order and refund: scenes, captions (SRT), YouTube fields | After G0 |
| [content/launch-posts.md](content/launch-posts.md) | Held hello texts, launch post M1, 12 evergreen drafts, the correction rule | From S2 |
| [content/calendar.md](content/calendar.md) | The weeks before G0 and the six weeks after. LinkedIn only, 0–2 posts in any 30 days | From S2 |
| [content/replies.md](content/replies.md) | Reply templates for LinkedIn, YouTube, contact@ and listing reviews. **Never for forums.** | From S2 |
| [content/community-rules.md](content/community-rules.md) | Rules for Shopify Community and other forums, quoted from their own pages; the disclosure line | From S1, owner only |
| [assets/README.md](assets/README.md) | The images: what each is, the draft gate, contrast and logo sizes, the doubts | See below |
| `assets/png/` | 26 PNGs, each with a `.meta.json` sidecar (inputs and hashes, claim ids, alt text) | See below |
| `assets/masters/`, `assets/src/` | Outlined SVG masters (upload sources) and editable sources with live text (never upload) | Build inputs |
| `assets/render.mjs` | The build script | Any time |
| [../DESIGN.md](../DESIGN.md) | Look A as facts and reasons, in Google's DESIGN.md format, for people and coding agents; includes the "Outdated: don't say" list | Reading now |
| [../REVIEW.md](../REVIEW.md) | The five questions a second session asks of every review pack (material inventory, truth, busy-page marks, edges, voice) | Every pack |
| [../CREDITS.md](../CREDITS.md) | Which ideas came from which of the 14 design repos (pinned commits, licences), and why none was installed | Reading now |

**Images: what is safe before G0** (full table in [assets/README.md](assets/README.md)):
- **Safe** (no product claim): the avatars, and the banners and covers on neutral 950 `#1B1D1F` or dark
  `#09110F`. Navy versions are the owner's call: the mark misses the kit's contrast bar there.
- **Safe as artwork, but no use before S2:** the blank post templates. The story template has no planned use.
- **Not safe:** cards A6 (milestone), A7 (rule), A8 (limits) and A9 (correction). They print "DRAFT" or "TEMPLATE"
  bands until every claim they carry is verified.
- **Never upload:** any `*-guides*.png`. They are review sheets.

## What can happen now, and what waits

**Now, no claim needed:**
- The owner's decisions in SETUP Phase 0, and the sign-up mailbox (SETUP 1.1).
- The contact@ delivery test (SETUP 1.2).
- Deleting false lines from the listing (listing-delta.md §0). Removing a false claim needs no new evidence.
  The S1 replacement screenshots have their own preconditions (shot-list.md §5).

**At S0, once `rp-maker` and `rp-on-app-store` are verified:** create the accounts with set A bios and the safe
images. LinkedIn may have to wait for S2, because its form probably requires a website [I]. **A0 and A0c still say
"listed on the Shopify App Store", which the narrowed `rp-on-app-store` row no longer covers.** Cut the phrase, or
get Shopify's written permission, before S0.

**After G0, at S2:** everything else. That means set B bios and links, M1 and the other posts, cards A6–A8, V1,
the G0 screenshots, entity-card state B, and the links from rewardspro.io.

## Who does what

- **The owner, by word:** every decision. SETUP Phase 0 and Phase 8, and STRATEGY §15, list them.
- **The owner, by hand:** accounts, settings, passwords and recovery codes (in the Keychain, never in a file), DNS,
  the Partner Dashboard, captures, merges, deploys, posting and any money.
- **Agents, on the owner's yes:** local or read-only work, or PRs the owner merges. Agents never hold a login, a
  Page role or an app password. They never post, follow, like, schedule or message, and they never draft forum
  replies.
- **Makers:** each maker edits only its own files. `../claims.toml` is edited only by the claims maker. A row
  becomes `verified` only with evidence and a second session's agreement. No file in `../kit/`, `../kernel.toml`,
  `../brand.json` or `../approvals.jsonl` was touched.

## Rebuilding the images

```sh
cd apps/rewardspro/marketing/social/assets
node render.mjs                # full build: src/, masters/, png/ and sidecars from the spec in render.mjs
node render.mjs --raster-only  # png/ and sidecars from the committed masters (node + sharp only)
```

- **Tools.** The build needs sharp 0.34.5 (libvips 8.17.3, librsvg 2.61.2). A full build also needs vectorcraft-cli
  0.21.0. Both are pinned. `SHARP`, `VECTORCRAFT_CLI` and `RP_ALLOW_TOOL_DRIFT=1` override them.
- **Safety.** Each build runs in `.stage/` and replaces the files only if every check passes. Builds are
  byte-reproducible [V, 2026-11-07].
- **Editing.** To change wording, edit the spec in `render.mjs`, never a PNG. Bump `VERSION` and `DATE` for a new
  release.
- **Claims.** The build reads `../../claims.toml`. A card drops its draft bands only when each of its claims is
  verified, unexpired and allowed on `social-post`.

**Profiles:** `profiles.json` and `profiles.md` must agree word for word. Their build and check scripts
(`build.mjs`, `check.mjs`) are only in this session's scratchpad, not in git. `check.mjs` passed at 13:06 UTC
today. `build.mjs` doesn't carry the completeness check's hand edits, so rerunning it as it is would undo them.
Bring both scripts into the kit, or edit the files by hand.

## Open decisions (the main ones)

1. **A0 and A0c:** cut "listed on the Shopify App Store", or get permission (above).
2. **D4:** choose one "free" wording. Four are in use; the ledger's is "RewardsPro is free for every store that
   installs it, and no paid plans are offered."
3. **Banner ground:** `#1B1D1F` (the agents suggest this one), `#09110F` or navy. **Avatar files:** the kit's own,
   or the copies with the generator-naming text chunks stripped. SETUP 0.3 and assets/README.md disagree on the
   default, so the owner picks.
4. **The owner's name in a public repo:** most kit files name the owner. Decide whether they move to the git-ignored
   `../private/` or switch to "the owner" (with D11).
5. **D11, where `marketing/` lives:** this folder is under `apps/rewardspro/`, which switch step B5 deletes.
6. **Evidence outside git:** many citations point to this session's scratchpad (`wf/p1-*.md`, `ref/`, fetch
   captures). Keep copies, or accept that they will be lost.
7. **The rest:** D1–D13, D-maker, D-video-1 to D-video-4 and D-shots-1 to D-shots-5. SETUP.md Phase 8 indexes them.

Known loose ends that the makers haven't closed yet are listed at the end of the completeness check. Among them:
L1 and `entity-card.md:193` still say "12 months or all time", and the A7 card's £ figures have no claim row.
STRATEGY's body is still the first draft, under its "Superseded in places" block.
