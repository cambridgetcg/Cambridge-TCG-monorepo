# RewardsPro roadmap: one plan from seven

**An agents' proposal, written 2026-11-07 and revised the same day after a review. Nothing in it is decided, except
where it quotes Yu's word.** It merges the six plans Yu asked for today, and the focus plan for his direction of
today (row 7), into one order of work and links to each for the detail. Only Yu publishes, sends, spends or merges.
"Yu" is the owner; if decision Now-6 moves the kit's public files to "the owner", this file follows.

Labels: **[V]** checked today in a file, commit, capture or this session's tool log; **[I]** inferred; **[U]**
unknown. Times are the plans' own estimates [I]. Not legal advice.

**Focus (Yu, 2026-11-07).** In his words: "Want to focus on recurring purchases small to medium uk business
first. Build reputation, gather reviews, user feedback." and "我覺得搵有品牌嘅 最好自己管理quality control and product
line" (merchants who own their brand and, ideally, run their own quality control and product line). The rest is
the agents' reading, in `…/wf8/FOCUS.md` and `…/wf9/signals.md`, for his yes (§5 Now-8a, Now-8b):
- **First segment:** UK micro and small limited companies and LLPs (about 1–49 staff, owner-run companies
  included) whose customers reorder consumables through a Shopify checkout: coffee and tea first, then pet,
  supplements and health food, beauty; one craft shop as contrast. Own brand is preferred within each segment until
  the interviews (F-3). "Recurring" is read as reorders, not subscriptions (F-0).
- **Held or later:** card shops are a held lane of 0–2 owners Yu knows (0–1 in the 3-hour version), never
  cold-emailed (F-2). Medium firms (50–249) and subscription-led brands come later (F-0, F-4).
- **Three limits, said first:** buyers can spend credit only when signed in with new customer accounts or with Shop
  Pay; store credit can't pay subscription renewals; RewardsPro has no renewal, product or channel rules (FOCUS
  §2.4). In public only once their rows are `verified`.
- **Goals:** reputation before reviews (a true listing, a working mailbox, fast human replies, a public changelog),
  then genuine reviews; feedback from the first interview on (FOCUS §1, §4–§5). Reviews are counted, never targeted:
  no review quota in any plan, partner term, message or post (FOCUS §1, §4).
- **Cost:** about 1.8–2.5 h more of Yu's P0 time (FOCUS §3.3; added into §7 [I]). Nothing goes out before its gate:
  the L-gate for asks and interviews, the W-gate for email, G0 for product sentences (§2–§3).

> **This week (9–15 Nov), about 3.5–4 h if all five are done**
> 1. Send the Shopify Partner Support question by **Fri 13 Nov** (action 1, ~15 min).
> 2. Give the seven open "now" decisions (§5; Now-2 is decided; Now-8a is the focus's first half; ~70–90 min with reading).
> 3. Merge PR #157 (~10 min; a merge deploys production).
> 4. The listing's text deletions, submitted at once so Shopify's review starts (action 4, ~40–50 min).
> 5. If there's time, the Cloudflare sitting, mail first, because DKIM takes up to 48 h (action 5, ~65–80 min).

| # | Plan | Files |
|---|---|---|
| 1 | Social kit and design | [social/README.md](social/README.md), [social/STRATEGY.md](social/STRATEGY.md) (S0–S3, D1–D12), [social/SETUP.md](social/SETUP.md), [social/claims-map.md](social/claims-map.md), [claims.toml](claims.toml), [DESIGN.md](DESIGN.md), [REVIEW.md](REVIEW.md), [CREDITS.md](CREDITS.md) |
| 2 | Site and help page | `…/wf2/RECOMMENDATION.md` (steps A1–C5, questions Q1–Q12), `…/wf2/gitbook-unpublish-2026-11-07.md` |
| 3 | Outreach | `…/wf3/outreach/OUTREACH.md` (D1–D16), `PIPELINE.md`, `LIA-draft.md`, `INTERVIEW-GUIDE.md`, `MESSAGES.md`, `ROADMAP-ENTRY.md` (O-01–O-39) |
| 4 | Onboarding | `…/wf4/ONBOARDING.md` (admin PRs PR-1–PR-6, clips VH1–VH5, V1, E12, VG1, R0, D-flow-1–12) |
| 5 | Partner Program Agreement (PPA) check | `…/wf5/ANSWER.md` |
| 6 | Growth (hybrid motion, SEO, AI answers, ads) | `…/wf6/GROWTH.md` (G1–G16) |
| 7 | Focus: recurring purchases, reputation, reviews, feedback | `…/wf8/FOCUS.md` (F-0–F-14), `segments.md`, `fit.md`, `reviews.md`, `feedback.md`; `…/wf9/signals.md` and `fit-message.md` (the own-brand check and message angles) |

`…` is `/Users/macair/Documents/rewardspro-research-2026-11-07`.

---

## 1. Where things stand (Saturday 7 November 2026, afternoon UTC)

- **The app:** production runs the rebuild (`apps/rewards`). B2 is done (test order #1010 earned £11.10 of store
  credit) and B3 was released today (`rewardspromembership-217`). Anyone can install it from the listing now [V].
- **G0 has not passed:** no production refund is recorded, and `apps/rewards/docs/gates.md` (B4) doesn't exist. B5
  hasn't started. It can start a week after B4 at the earliest, and it deletes `apps/rewardspro/`, where this kit,
  the kernel and the landing live [V, `switch.md` B4–B5].
- **The listing is still false:** "sell a tier as a product", the Memberships tags, an old video, an over-wide data
  request, and three old-admin screenshots, one showing a real gmail.com address. 0 reviews, 0 real merchants [V].
- **rewardspro.io** has the retired copy, the banned spelling "Rewards Pro", "Love is the design." and a privacy page
  that describes the old processors. `/terms/`, `/subprocessors/` and `/help/` return 404 [V].
- **The footer's "Documentation" link** still points at docs.rewardspro.io, which now 307s to GitBook's own app
  (`landing/public/index.html:1588` on origin/main, which wf2 §3.4 matched to the live page by sha256) [V].
- **DNS:** two KINGDOM TXT records and two DMARC records; the SPF include fails and there is no DKIM key, so
  contact@rewardspro.io is unproven [V].
- **Claims:** 36 rows in [claims.toml](claims.toml), all `proposed`, none verified. No product sentence can go
  public yet [V].
- **Focus (Yu, 7 Nov):** "Want to focus on recurring purchases small to medium uk business first. Build reputation,
  gather reviews, user feedback." `…/wf8/FOCUS.md` proposes UK micro and small shops whose customers reorder
  consumables through checkout as the first segment, in place of wf3's card-shop lead; medium firms later (F-0).
- **Done today, on Yu's word:**
  - GitBook unpublished ("unpublish gitbook. no plans."). An agent clicked "Unpublish site" in Yu's signed-in Chrome
    [V, this session's tool log]. docs.rewardspro.io now 307s to app.gitbook.com; the custom domain stays attached
    in GitBook; DNS untouched.
  - PR #157 opened, unmerged: the admin's "every paid order earns" overclaim corrected, and one sentence for what
    cashback is paid on.
- **Not done:** apart from that unpublish, agents posted, sent, signed up for, spent, merged and deployed nothing.

## 2. The shape

**Truth first, then G0, then open channels** (a proposal). Merchants and machines read the App Store listing first
(Shopify's Sidekick builds its app cards from it), then rewardspro.io. So the first work makes those true: the
listing's false lines and screenshots, the privacy page, a "state A" home page, the admin's own words, DNS and mail.
None of that needs G0. G0 then unlocks product sentences: `/help/`, the G0 screenshots, LinkedIn milestones and the
first videos (stage S2).

**What RewardsPro is, in Yu's words (7 Nov):** "A credit system to give back to customers who are loyal, so that a
ecosystem can be built." The idea is his (recorded in `approvals.jsonl` line 4, `rp-umbrella-idea`; quoted in
MESSAGING.md §0; `kernel.toml` is unchanged); the wording is a proposal in
[MESSAGING.md](MESSAGING.md), umbrella "Reward loyal customers with store credit in your own shop." or, with his
verb and term, "Give back to your loyal customers, with store credit in your own shop.", both for after G0 (state
A heading: "Made for rewarding loyal customers."), in the business register he asked for later that day
("用loyal customers, take a more business approach on wordings."; `approvals.jsonl` line 7), with state A and B
descriptions and the direct email set. Positioning beyond his idea still waits for the interviews.

The motion is **hybrid**. Self-serve is the default for everyone: listing, install, the admin's three-step card,
`/help/`. Human-guided setup is for at most 4 design partners at once, after the partner gate: interviewees, or
merchants who write in, with a real give-back job and customers who reorder through checkout (Now-1; wf8 FOCUS
§2–§3). The merchant always starts the move, and what partners
stumble on goes back into the admin words and `/help/`.

**What we deliberately don't do:**
- **Never, whatever Shopify answers:** DMs, InMail or connection notes, phone calls, contact forms or marketplace
  messages to shops; bought or scraped lists; cold contact to sole traders, partnerships or shops we can't classify.
  The ICO treats DMs as electronic mail needing consent, PECR needs consent to email individuals, and phone and forms
  are the outreach design's own "never" (wf5 §3; OUTREACH "In ten lines" item 5).
- **Held until the W-gate's remaining items hold, then open on Yu's word of 7 Nov ("Emailing business directly is
  fine."):** one first email to a verified Ltd or LLP's role address published somewhere Shopify doesn't serve,
  once Yu's decision is recorded (W1), LIA Part B, the "businesses we contact" row, ICO renewal, mail and contact@
  tested, the suppression list and verified claims are in place (wf7 `email-rules.md` §4; [MESSAGING.md](MESSAGING.md)
  §5–§6). It no longer waits for Shopify's answer, except that an address seen only on a Shopify-hosted storefront
  waits for its question 3, or Yu's word after 18 Dec. "Shopify-hosted" includes the shop's own domain when its DNS
  points at Shopify, any `*.myshopify.com` page and proxied stores; if unsure, it counts as hosted. For most
  candidates that is the only published address, so most stay held until then [I]. Letters stay held unless Yu says
  his word covers post (Now-2).
- Using anything learned through Shopify or RewardsPro for outreach ("we don't email merchants through RewardsPro,
  we discover from existing market", Yu today); a shop or address that ever reached us that way stays out even if
  it turns up again in public (wf5 §2.4).
- Ads before at least 5 genuine reviews (a limit on ads, never a review target; GROWTH §5.1 A5).
- A review target or quota anywhere, or a review ask outside the in-app card (and the support-close line, only if
  Yu picks it under wf8 F-14).
- Agents posting, replying, liking, scheduling, drafting forum replies or keeping any login of their own.
- Scripted or agent reads of Shopify-run pages. Three research passes today did read App Store pages by script: wf6
  about 88 search pages (against robots.txt), wf3 80 review pages, wf4 34 review pages and 7 competitor listings
  (`wf4/raw/reviews.log`, `listing_*`). The results stay internal; nothing re-reads them.
- KINGDOM language, links or DNS records anywhere on RewardsPro.

## 3. Phases

| Phase | When (earliest realistic) | What happens | Yu's hand / word | Agents (on Yu's yes) | Done when |
|---|---|---|---|---|---|
| **P0 Truth first** | Now to Sun 3 Jan 2027 | L-gate items first: the Shopify question, listing text and S1 screenshots, mail and DNS, privacy page with outreach rows, outreach preparation. Then the state A page, the move PR, G0. S0 names optional | Actions 1–11 (§4); the Now and Pre decisions (§5) | By Fri 20 Nov: the outreach kit, dev-store test list (O-06), visit-pack method, DNS script, event list. Then PR-1, PR-1b, PR-2, privacy and terms drafts, the state A PR, the move PR; rows checked from saved captures (below) | No false text on the listing and three S1 screenshots, live after Shopify's review [U: how long]; privacy and outreach rows live; mail passes; every L-gate item ticked by Sun 3 Jan |
| **G0 sittings** | Late November at the earliest [I], once #157, PR-1, PR-1b, PR-2 (if Pre-3 says yes) and the widget defaults are live | Sitting 1 on the shot list's store (~85 min); sitting 2, "partner zero", on a new store (~45–50 min), starting with REC-0 and REC-4a (ONBOARDING §8.2). B4 on rewardsprotesting is separate (Pre-1) | The form (word); both sittings (hand); B4's owner steps | Privacy read of every frame; verify supported rows, with a second session; cut clips; review packs for `/` and `/help/` | G0 recorded in Yu's form; the supported rows `verified` |
| **S2 Open** | Weeks after G0: December at the earliest, January more likely [I]; listing review time [U] | Listing state B, G0 screenshots, Resources → `/help/`; `/`, `/help/`, the 404, terms if not yet live; docs host 301; bios set B; M1 pinned; V1 on YouTube; clips VH1, VH2, VH5 on `/help/`; admin PR-3, PR-5 | Approve and deploy packs; swap the listing; post M1 (~25 min); first-real-merchant steps or a written waiver; Ask & Offer replies (≤2 a week) once GROWTH G8's two preconditions exist | Packs and site PRs; the install-source PR (Pre-9); fact briefs, never reply text, for threads Yu brings; coding the AI answers Yu pastes | STRATEGY §2 conditions (a)–(g) hold and M1 is posted |
| **Interviews** | Mon 4 Jan – Sun 28 Feb 2027 (to 14 Mar if needed). Lane A needs the L-gate only; first emails need the W-gate (Now-2) | 5–8 interviews with UK shops whose customers reorder (5 in the 3-hour version; quota in wf8 FOCUS §3.1; card shops 0–2 (0–1 in the 3-hour version), owners Yu knows) through people Yu knows, quiet-time visits, inbound mail, peer-started introductions and, once the W-gate holds, one first email to verified limited companies and LLPs in the first segments (at most 5 a week, 10 in the phase; never card shops, F-2); a LinkedIn call only from S2 | Every ask, outing, interview and same-day note; the conflict-of-interest line (Pre-7) first in every card-shop conversation | Monday packs (counts only); syntheses from de-identified notes, each checked by a second session; evidence ledger; product memo; kernel draft; the results page at outreach week L8 | ≥5 interviews by Sun 14 Feb; a verdict per hypothesis; memo and kernel draft decided; a verdict per route at L8 |
| **Design partners** | P-gate: B4 in `gates.md`, #130 live, partner terms. 3-hour version (default): setups from about 1 Mar, day 90 about 30 May [I]. Full version: setups in weeks L6–L7 (8–21 Feb) if the gate holds by 1 Feb, day 90 about 9–22 May [I] | At most 4 active; a 60-minute setup call where the merchant drives (conflict line first, no margin questions); calls in weeks 2 and 6; the question log; PR-6 after the second setup and when the guided phase ends | Invitations; the calls; the PITR spend or waiver; approve the partner terms; each partner's dev-store tests, by hand or by agents in a session he opens | Partner terms page; staff-access statement draft; log syntheses; PR-6 and `/help/` edits | 2–4 active at day 90; the guided phase ends at two setups in a row with no new stage note, or the earlier of 90 days after S2 and the 10th real merchant |
| **Self-serve growth + ads test** | From S2 (H1 2027); the ads probe not before H2 2027 [I] | Help sections split on real questions; VG1 (the YouTube guide) when the guided phase ends, if pillar H2 holds; VH3 and VH4 when asked; R0 when review asks; the probe only after A1–A8 (GROWTH §5.1; A5's 5 genuine reviews is a limit on ads, never a target) | Monthly rank, Search Console and AI-panel checks by hand; a written yes to the probe's cap, end date and stop rules; pause by day 30 | Coding pasted AI answers; probe read-outs at days 37 and 60 from aggregate counts Yu copies out | The probe read at day 60, run only once A1–A8 held; continuing needs a new yes |
| **Built for Shopify** | H2 2027 at the earliest [I] | A readiness check (about 50 net installs from paid-plan shops, 5 reviews); no paid push | Whether to apply | The check | Criteria met and Yu applies, or decides not to |

**How agents check rows without opening Shopify pages.** For the first check of `rp-maker`, `rp-on-app-store`,
`rp-merchant-funds` and the sh-* rows, a second session compares today's captures with the hashes the ledger stores.
The listing, Companies House, the PPA and both help.shopify.com pages were saved in the session scratchpad
(`claims-fetch/`, `verify-claims-fetch/`) and match those hashes [V], so they need copying first (Now-6). Monthly
upkeep is Yu's paste (Pre-5). No agent opens
apps.shopify.com or help.shopify.com, by script or WebFetch; new Shopify text comes from Yu's paste, or from one fetch
on Yu's explicit yes.

**Where the plans disagreed, and the line taken (proposals):**
- **Partners:** at most 4 active (GROWTH G1, wf3's practical cap), not 8: the hours don't hold 8.
- **First segment:** wf8 replaces wf3's card-shop lead with reorder-led consumables (coffee and tea, pet,
  supplements, beauty) and one craft shop as contrast; card shops are a held lane, never cold-emailed (F-1, F-2).
- **Agent jobs replaced by GROWTH §7.1:** the "raw re-fetch" in STRATEGY §6.3 and §13 step 5; the App Store
  re-capture in §9 and §13 step 8; ME-6 and §13 step 23 (agents' monthly AI answers); ROADMAP-ENTRY O-16; OUTREACH
  §4.4's monthly re-fetch; wf2 step D1. Yu runs rank checks and the AI panel by hand; agents code what he pastes.
  ME-1 (logged-out searches for "RewardsPro") stays with agents only through their own search tool, never by loading
  Google or YouTube result pages; otherwise Yu adds it to his monthly check (~5 min) [I].
- **S3:** the L-gate replaces STRATEGY S3's "consent-first outreach doors", and "the question sent" replaces
  "answered" (wf5 §6 item 4); since Yu's word of 7 Nov, "sent" is recommended, not a gate (§6). S3 now means S2
  plus the partner gate; only the public M2 call waits for it (Later-1).
- **PR #157** supersedes ONBOARDING PR-2's "On:" line and IA3. Its sentence for what cashback is paid on also says
  tips and duties earn nothing, from code only (no tipped order has run). So the public `rp-cashback-base` row keeps
  to what was observed and widens when B4's tipped order runs. C1, the L1 bio and the A7 rule card follow the row; the
  S1-B frame shows the admin's own sentence, under Pre-2's approval.
- **IA2** (the fee line by "Switch cashback on"): ONBOARDING §7.1's wording, with no "free" and no "charges nothing".
- **Docs host:** the unpublish kept the GitBook domain attached, which stops a takeover. GROWTH's plan stands: 410
  until `/help/` exists, then a 301. A Single Redirect can't return 410, so that needs a free rule or Worker [I:
  which fits is unchecked], one more small deploy in the Cloudflare sitting.
- **The PPA:** since Yu's word of 7 Nov (Now-2), cold email no longer waits for Shopify's written answer, and "the
  question sent" is recommended for every route, consent-first and email alike, and a gate for none; before it, wf5
  §6 item 4 made it the consent-first routes' gate. The question goes as cheap protection, with two edits (wf7
  `email-rules.md` §6, applied in wf5 §5). What still binds: 2.1.2 (no address received via Shopify; a
  storefront-hosted address waits for question 3), 2.1.3(ii)–(iii), 2.1.4(ii)–(vi) and the law. Letters "on Yu's
  signed decision" stay not advised (item 11) unless Yu says his word covers post. A written 'no' from Shopify
  stops email until Yu decides again.
- **"Talk to us"** in outreach: the plain address contact@rewardspro.io (the state A page shows it too), once action
  6 passes; it becomes `rewardspro.io/help/#contact` the day that anchor ships at S2.
- **Erasure after uninstall:** STRATEGY §9's "30 days at most" isn't what the code does (Pre-8).
- **The conflict-of-interest line:** wf3's D14 (`coi-sells-cards`) and the kit's D-maker (`rp-maker-also-sells`) are
  one fact: one sentence, one id (Pre-7).
- **Screenshots:** all three old ones come out (the shot list finds #2 false too), replaced by S1-A, S1-B and S1-C,
  which meets the L-gate's "at least 3" and Shopify's "3-6".
- **Profile texts:** A0 and A0c drop "listed on the Shopify App Store" (claims-map; PPA Part A §5.3).

## 4. Yu's next 11 actions, in order

Times are hands-on. Action 2 includes reading; the others don't include reading the linked plans.

| # | Action | Time | Where it's explained |
|---|---|---|---|
| 1 | **Send the Partner Support question** from the Partner Dashboard by **Fri 13 Nov**: wf5's version with wf7 `email-rules.md` §6's two edits (it tells Shopify what we'll do, and no longer asks for permission we won't wait for). Recommended as cheap protection, not a gate for email (Now-2, decided). Question 3's answer decides whether addresses seen only on Shopify-hosted storefronts can be used. Add OUTREACH §7's questions 6–8 only if you want these answered too: introductions, vendors, and whether a person reading a shop's own page counts as copying. Keep the reply with its date and ticket number | ~15 min | `wf5/ANSWER.md` §5–§6; `wf7/email-rules.md` §6; `OUTREACH.md` §7 |
| 2 | **Give the "now" decisions,** Now-1 to Now-8a (§5), and Now-8b before 4 Jan | ~70–90 min, then ~40–50 | §5, and the files it names |
| 3 | **Merge PR #157** (a merge deploys production). Then, as agents draft them: PR-1, the widget setup lines (its contact@ line waits for action 6); PR-1b by `shopify app deploy` (the name "RewardsPro", the embed's name, the theme-editor paragraph, neutral widget defaults if Pre-3 says so), once one staging deploy accepts the paragraph setting; PR-2 just before the G0 sitting, if Pre-3 says yes | ~10 min each (30–40) | `ONBOARDING.md` §7.1; `RECOMMENDATION.md` §4.3, A10, A13 |
| 4 | **The listing text sitting.** Optional first: the "before" AI check (25–30 min). Delete the false lines, untick the Memberships tags, remove the old video, trim the data request, set the five search terms; add the three limit lines (sign-in or Shop Pay; credit can't pay subscription renewals; no per-product or per-channel rules) once their rows verify (wf8 reviews §6.1); submit at once so Shopify's review starts [U: how long]; note the date it shows live. Same sitting: the safety-net calls (Now-4) | ~30–40 min + ~10 | `social/listing-delta.md` §0; `GROWTH.md` §4.2 act 2 |
| 5 | **One Cloudflare sitting,** mail first: one SPF record, a 2048-bit Google DKIM key, one DMARC record. Then: remove the two KINGDOM TXT records; AI crawler policies, Crawler Hints; Search Console (Domain property, company Workspace account, a second owner); `www` → apex 301; the docs host's 410 and a Search Console removal; Bing optional. Bluesky's `_atproto` only after the KINGDOM records go, and only if you reserve names | ~65–80 min (~45 of it mail); the 410 deploy [U] | `GROWTH.md` §4.2 act 3; `ROADMAP-ENTRY.md` O-03; `social/SETUP.md` Phase 4 |
| 6 | **Test contact@** from an outside address once DKIM is live (up to 48 h after action 5): SPF, DKIM and DMARC pass, and the message arrives. Tell agents only "yes or no, and the date" | ~5–10 min | `GROWTH.md` §4.2 act 7; `social/SETUP.md` 1.2–1.4 |
| 7 | **The privacy and subprocessors page.** Answer #130's `[Yu:` placeholders, Sentry's region and the erasure wording (Pre-8). Deploy the agents' draft with the outreach rows "people who contact us" and "interview notes" (L-gate (e)) and, for first emails, "businesses we contact" (W-gate (c)), and the terms page if its six placeholders are answered (Pre-6). The same deploy drops the footer "Documentation" link, unless you accept the dead link in writing until action 9 | ~20–40 min + ~30; terms answers [U] | `RECOMMENDATION.md` §6 A2, A12; `OUTREACH.md` §6; `ROADMAP-ENTRY.md` O-05 |
| 8 | **The S1 screenshots,** once #157 and PR-1 are live and Pre-2's approval is recorded: set up the dev store, capture S1-A, S1-B and S1-C, and upload all three in place of the old three (a second listing edit, reviewed again). By Fri 18 Dec, for the L-gate | ~90 min | `social/shot-list.md` §2, §5; `ROADMAP-ENTRY.md` O-09 |
| 9 | **The true home page:** merge and deploy the "state A" PR (with `security.txt`) once agents have checked its four rows from the saved captures; paste the listing's Pricing text ("You fund the cashback you give" plus Shopify's fee sentence), which needs Pre-5 | ~45 min | `GROWTH.md` §4.2 act 5; `social/entity-card.md`; `social/listing-delta.md` §0, §3 |
| 10 | **Outreach preparation.** By Fri 11 Dec: renew the ICO fee registration and update its address (it expires 19 Dec); sign LIA Part A and set the retention numbers; sign LIA Part B before any first email. By Sun 3 Jan: review the outreach kit; count the owners you know in coffee, pet, supplements, beauty, craft or cards, and the candidate shops in two outing areas (numbers only), before deciding wf8 F-1; set up the private store (Pre-7) | ~20 + ~60 min; ~90 + ~45 + ~30 min | `OUTREACH.md` §4.3, §10; `LIA-draft.md` Part A; `PIPELINE.md` §6, §8; `ROADMAP-ENTRY.md` O-07, O-08, O-13, O-14 |
| 11 | **G0:** give its form (Pre-1), then hold the two sittings (§3). Before the partner gate, whichever form: B4's owner steps on rewardsprotesting, starting the data request and redact about 10 days ahead | ~5–15 min; ~85 + ~45–50 min; B4 [U] | `ONBOARDING.md` §8.2; `social/shot-list.md` §6–§8; `switch.md` B4 |

Not in the eleven: reserve the social names (S0, optional, ~70 min: `social/SETUP.md` Phases 0–3) once agents have
checked `rp-maker` and `rp-on-app-store`. Before B5 starts (a week after B4 at the earliest, so early December at the
earliest [I]): merge the move PR (Now-6).

## 5. Decisions for Yu (21, one decided: Now-2; each other default is a proposal)

**Now (by Fri 13 Nov)**

| # | Decision | Proposed default | Argued in |
|---|---|---|---|
| Now-1 | **The shape:** self-serve by default; at most 4 active partners after the partner gate, from interviewees and merchants who write in, each with a real give-back job, first from UK shops whose customers reorder (wf8 F-1); interviews from 4 Jan, no install ask; no posts before S2; removed features never named; no personal posts | Yes to all. GROWTH G1 said interviews only, but its own §2.3 lets contact@ writers move to the guided path, so D-flow-10 (b) | GROWTH §2, G1; ONBOARDING §1, D-flow-1, D-flow-10; OUTREACH D1; STRATEGY D1, D7, D9, D12 |
| Now-2 | **Cold contact: DECIDED by Yu, 2026-11-07:** "Emailing business directly is fine." First emails go to verified Ltd and LLP role addresses under wf7 `email-rules.md` and [MESSAGING.md](MESSAGING.md) §5, once the W-gate's remaining items hold (§2, §6). The never list in §2 stands. Still open within it: letters (does the word cover post?); a follow-up (D17); named-person addresses (D7); addresses seen only on a Shopify-hosted storefront if Shopify hasn't answered question 3 by 18 Dec (D-src) | Record the decision in `approvals.jsonl` (W1); send the question by 13 Nov as protection, not a gate; no solicitor; no follow-up; named addresses never; hosted addresses held until 18 Dec, then your word | wf7 `email-rules.md`; MESSAGING.md §5–§6; wf5 §2–§6; OUTREACH §4, §6, §7 |
| Now-3 | **The Cloudflare sitting's choices:** KINGDOM TXT; which DMARC stays; AI training crawlers; Search Console identity; Bing; the old `rewardspro-docs` and `rewardspro-marketing` repos | Remove both TXT; one DMARC as the mail fix writes it; Search and Agent = Allow, Training yours (Block also stops mixed-purpose search crawlers); company Workspace account and a second owner; no Bing yet; repos archived with a plain README, or private, old keys confirmed revoked; `rewardspro-marketing` private now, since it still shows a "3 months Pro for a review" plan (wf8 F-13) | GROWTH §4.2 act 3, G6, G14; OUTREACH O-03, O-03a, D12; wf8 reviews R-10 |
| Now-4 | **The safety net, because the listing is installable today:** PITR (~US$100 a month) or written acceptance of going without; Sentry Crons; the two frozen paid charges; an EU Art. 27 representative | PITR and the EU representative: your call, in the listing sitting. Cancel the frozen charges (your call: existing agreements); until then "free" stays out of the admin and `/help/#cost` | GROWTH G10; STRATEGY §13 step 17; ONBOARDING §8.1 |
| Now-5 | **Data requests:** in the app only, or also an email to the shop owner? `switch.md:62` records "accepted for now … an email to the shop owner comes when a real merchant arrives"; ONBOARDING's D-flow-4 said yes | Your word. Agents read your "we don't email merchants through RewardsPro" as no [I]: in the app only, plus the `/help/#data` sentence. An email would amend the spec's "no RewardsPro email" and add a mail processor | `switch.md:62`, B4; ONBOARDING D-flow-4; wf2 §4.1 #11 |
| Now-6 | **Where the kit lives before B5:** one folder B5 won't delete, for the landing, kernel, kit, ledger, DESIGN.md and `social/` | `apps/rewardspro-site/` (you name it), moved by an agents' PR you merge; personal data outside every repo; your name out of public files. Now: copy the untracked kit files and today's captures to the research folder | wf2 §3.3, A6, Q4; STRATEGY D11; OUTREACH D5; social README 4–6 |
| Now-7 | **Time and weight (§7):** P0 needs ~1.9–2.2 h a week under every variant, with the focus's ~1.8–2.5 h added (FOCUS §3.3; §7 [I]); the cheaper variants start only at S2. Accept that, or move 4 Jan. Outreach: Lane A only or both lanes (§6); 3-hour or full version | Accept. In a week that overruns, G0 slips into January first, then the home page, then S0 and the before-check. The S1 screenshots, mail, ICO, LIA and privacy rows can't slip without moving 4 Jan. Lane A or both lanes: your choice now that email is open (most first-segment addresses are held under D-src, so visits and people you know stay the main January routes, wf8 FOCUS §3.1); 3-hour version | GROWTH §3.1, G13; OUTREACH §4.2–§4.3, D3 |
| Now-8a | **The focus (wf8), now:** what "recurring" and "small to medium" mean (F-0), the card lane (F-2), the listing fix before any real install's day 7 (F-8's R-0, action 4). The first segment (F-1) waits for your count, so it is in Now-8b. Already listed, so not new here: the hosted-address hold (F-12 is Now-2's D-src) and the retired repo (F-13 is Now-3's) | As proposed in wf8 FOCUS §8: reorders first, subscription-led brands later; micro and small first, medium later, and a medium firm that writes in is answered; card shops: 0–2 owners you know in the full version, 0–1 in the 3-hour version, never cold-emailed; R-0 now | wf8 FOCUS §1–§2, §8; `segments.md`; `fit.md` |
| Now-8b | **The focus (wf8), before 4 Jan:** the first segment and its ranking (F-1), after your count of owners you know (action 10, by Sun 3 Jan); own brand as a filter or a preference (F-3), subscriptions (F-4), formula and alcohol (F-5), quota and calendar (F-6; the 3-hour-or-full choice stays Now-7's), tags (F-7), review trigger and words (F-8; its partner-review reply settles Later-1's note), `/changes` and "What works today" (F-9, with Pre-6's state A page), the feedback loop (F-10; FB-1 to FB-9), claim rows (F-11), the support-close review line (F-14). New from wf9: how often outreach may name Shopify (wf9 F4) | F-1, F-3 to F-11 and F-14 as proposed in wf8 FOCUS §8 (F-1: yes after your count, and a segment where you know owners moves up; F-14: no support-close line). wf9 proposes no default for wf9 F4; until you answer, outreach that names Shopify's own features or fees isn't used: BODY-B, YES-TRY and the brand-owner paragraph (MESSAGING §5.10, §6, O17). BODY-A names Shopify only to say the app works with Shopify stores, so it isn't held by wf9 F4 [I] | wf8 FOCUS, `reviews.md`, `feedback.md`; wf9 `fit-message.md` §6, §8; action 10 |

**Deduplicated against this list (wf8 FOCUS §8, wf9 F4):** new with the focus: F-0 to F-5, F-7, F-10, F-11, F-14 and
wf9 F4. Partly new: F-6 (Now-7 keeps the version choice), F-8 (R-0 times action 4; its partner opener settles
Later-1), F-9 (joins Pre-6's state A page). Not new: F-12 (Now-2's D-src, same default), F-13 (Now-3's old repos,
default narrowed to private now). wf9's widget-colour finding (wf9 F1) is Pre-3's. One departure from FOCUS RM10:
F-1 sits in Now-8b, not Now-8a, because its default waits for action 10's count, due by Sun 3 Jan. "wf9 F4" (naming
Shopify) is not wf8's F-4 (subscriptions) or `fit.md`'s test F4 (INTERVIEW-GUIDE §8, test 10).

**Before G0 (November–December)**

| # | Decision | Proposed default | Argued in |
|---|---|---|---|
| Pre-1 | **G0's form:** B4 (spec 9.1 checks A–P in `gates.md`) or a production test order plus refund | For S2, yours. The partner gate and B5 both need B4 in `gates.md`, so B4 runs before 1 Feb either way, with its own hand steps [U] | STRATEGY D6; wf2 A1, Q5; GROWTH G11; OUTREACH §6 P-gate (a) |
| Pre-2 | **Stores, and the S1 approval** (D-shots-1, D-shots-2, D-flow-12) | The shot list's store for S1 and sitting 1, a new store for partner zero. Record in `approvals.jsonl` that S1 frames may show the app's own sentences while `rp-setup-steps` and `rp-cashback-base` are proposed; otherwise S1 waits for G0, and 4 Jan with it | shot-list §5; ONBOARDING §8.2, D-flow-12 |
| Pre-3 | **Admin and widget words before the captures:** PR-1, PR-1b, the rest of PR-2 (IA2, the guest line, the buyer-email line), the widget's default colours, admin links to `/help/` (lifting Ruling 72: no docs link in the admin until the docs describe this app) | Yes to each; IA2 in ONBOARDING §7.1's words; neutral widget defaults ("theme before brand") in PR-1b's deploy; links one by one as each anchor goes live | ONBOARDING §1.7, §7, D-flow-2, -3, -7; wf2 §4.3, Q7, Q12; wf9 `fit-message.md` §8 F1 (the defaults are RewardsPro's navy and teal) |
| Pre-4 | **Social reservation:** which lookalike accounts are yours; handles; set A texts; banners and avatar files; where the AI line goes | Handle `rewardsproapp`, Bluesky `@rewardspro.io`; set A without "listed on the Shopify App Store"; neutral 950 `#1B1D1F` banners; avatar files yours (SETUP and assets/README disagree); the AI line in About and video descriptions | STRATEGY §3, D2, D3, D5; SETUP Phase 0; profiles.md |
| Pre-5 | **"Free", the listing's price pair, claim upkeep:** one free wording; search terms; a name descriptor; how the sh-* rows stay fresh (first due 7 Dec) | The ledger's `rp-free` sentence, always beside "You fund the cashback you give" (plus Shopify's fee sentence where a field allows 300+ characters); the five search terms now; the descriptor at S2; you paste the two Shopify help pages monthly | STRATEGY §4, D4; listing-delta §0; GROWTH G3, G4, G15 |
| Pre-6 | **The site:** state A now or a holding page; fonts; DESIGN.md and the optional checker; when the terms page ships | State A now (it replaces wf2's A11); system fonts; keep DESIGN.md; checker and CI off; terms with action 7 if answered, at S2 at the latest; `security.txt` with state A; the 404 with `/help/`, which its text points to | GROWTH G5; wf2 §3.1, §5, A8, A11, O1–O3, Q6, Q8, Q9 |
| Pre-7 | **Outreach details for the L-gate:** retention numbers; named-person addresses; who writes syntheses; gifts; the conflict-of-interest sentence; the staff-access statement; sole-trader shops; Toy Fair; the private store (D13) | PIPELINE §6's numbers; never named-person addresses; syntheses yours to assign; no gifts; one true sentence for D14 and D-maker, id `rp-maker-also-sells`, settled before 4 Jan; sole traders: no note; skip Toy Fair; the encrypted disk image | OUTREACH D3, D6, D7, D9, D11, D13–D15; SETUP 5.0; PIPELINE §6, §8 |
| Pre-8 | **Erasure wording** after uninstall, for the privacy page (action 7), `/help/#uninstall` and the partner terms | "About 31 days after you uninstall" if Shopify's request never arrives (MESSAGES §2.10); or change the constant to 29 days and say 30 | MESSAGES §2.10; ROADMAP-ENTRY O-29; wf2 §4.1 #12 |
| Pre-9 | **Install source** (GROWTH G9), chosen before S2 so the first installs' source isn't lost | The in-app "How did you find RewardsPro?" question ships with S2; no GA4 | GROWTH §6.1, G9 |

**Later (at S2, the partner gate, or after reviews)**

| # | Decision | Proposed default | Argued in |
|---|---|---|---|
| Later-1 | **The partner lane:** the public M2 call and its audience; screen-share or collaborator access; a note on partners' reviews; a reply time | M2 only at S3, to UK shops in general unless interviews say otherwise; screen-share only; our public reply to a partner's review says we set them up by hand, and that we trade with them where we do (wf8 reviews §5.5, FOCUS §4, settling D10); a reply time you can keep, in the partner terms only | ONBOARDING §8.3, D-flow-8; OUTREACH §5, D8, D10; STRATEGY D10 |
| Later-2 | **Measuring and video at S2:** aggregate counts; AI-check cadence; the Ask & Offer routine; the video set and hosting; V1 on the listing | Counts from about 10 installs; Full AI check quarterly; you write every reply, after GROWTH G8's preconditions; V1, E12, then VG1 on YouTube, linked never embedded; help clips self-hosted, after D-video-3 (may public footage show Shopify's admin?); V1 not in the listing's video slot, which Shopify wants mostly promotional | GROWTH §6, G7, G8; ONBOARDING §6, D-flow-5, -9, -11 |
| Later-3 | **Ads and Built for Shopify** | No ads now; the free look at suggested bids any time; the US$150 probe only after A1–A8; read-outs from aggregate counts only; no paid push towards Built for Shopify | GROWTH §5, G2, G16; wf6/ads.md §8 |

## 6. Two outreach weights

| | **Lane A only** (Now-7: your choice of lanes) | **Lanes A and B: B opens on the remaining legal preconditions (Yu's word on email, 7 Nov)** |
|---|---|---|
| Routes | People Yu knows, quiet-time visits, inbound mail, peer-started introductions, a public call from S2 | Plus one email to a verified UK limited company's or LLP's role address published somewhere Shopify doesn't serve (§2; letters only if Yu's word covers post): at most 5 a week, 10 in the phase, no follow-up unless Yu chooses one |
| What is kept | A paper consent sheet (entered the same day, then shredded) and a private table on Yu's encrypted disk image; agents read only an export of counts and de-identified notes | Adds the SQLite store (PIPELINE §3.2), its CLI and tests, and a Lane B project whose transcripts Yu deletes on the 60-day clock |
| Opens when | The L-gate: clean listing, mail fix, ICO renewal, privacy rows, LIA Part A. The Shopify question sent is recommended, not a gate, since Yu's word of 7 Nov (Now-2) | Lane A's L-gate, since a yes leads to an interview under it, plus the remaining legal preconditions, not Shopify's answer: Yu's decision recorded (W1), LIA Part B signed, the "businesses we contact" row live, ICO renewed, mail and contact@ passing, the suppression list ready, the claims the email uses verified (wf7 `email-rules.md` §4; [MESSAGING.md](MESSAGING.md) §6). An address seen only on a Shopify-hosted storefront waits for Shopify's question 3, or Yu's word after 18 Dec |
| Yu's time | ~3.3 h a week (3-hour version) or ~4–6 h (full version), counting the 45-minute approvals; ~30 min one-off setup | Plus about 1–1.5 h a week at 5 emails [I]; the store PR and LIA Part B [U]; the monthly purge |
| Why | Consent-first routes fit either reading of the PPA (wf5 §4) and need no answer | Cold email is open on Yu's word; worth building if Lane A alone doesn't reach the online-only first-segment shops (LIA B3) |

Details: `PIPELINE.md` §0, §8–§9; `OUTREACH.md` §4.3, §6; `LIA-draft.md`; wf7 `email-rules.md`; [MESSAGING.md](MESSAGING.md).

## 7. Time and money

**Yu's hours** [I, the plans' estimates, re-added here]. The stated budget is about 45 minutes a week for all
approvals, plus about 3 hours a week only while outreach runs (4 Jan – 28 Feb).

| Phase | Yu's hours | Against the budget |
|---|---|---|
| P0, 9 Nov – 3 Jan (8 weeks; 6 h budget), required | ~15.3–17.8 h [I, re-added with the focus]: question 15 min; listing 40–50; S1 capture ~90; Cloudflare 65–80; contact test 5–10; privacy page 50–70; home page 45; merges 30–40; the 20 open decisions: reading 90–120 for the 18 before the focus (Now-8a and Now-8b are in the focus's line); outreach prep 245 (ICO 20, LIA 60, kit review 90, counts 45, disk image 30); G0 choice and sittings 135–150; the focus's lines 110–150 (FOCUS §3.3: reading and deciding F-0 to F-14 45–60, FB-1 to FB-9 20, the review PRs 10–20, `/changes` and "What works today" 30–45, the retired repo 5) | ~1.9–2.2 h a week: 2.5–3.0 times |
| P0, L-gate items alone | ~11.4–13.3 h [I]: ~10.3–12 h before the focus, plus its decisions and FB-1 to FB-9 (65–80 min), which Now-8b needs before 4 Jan (no G0, no home page, nothing optional) | ~1.4–1.7 h a week: about 1.9–2.2 times |
| P0, optional | S0 names ~70 min (SETUP's 1 h 25 m less DNS and the contact test, counted above); the before-check 25–30. With both and the focus's lines: ~16.9–19.4 h [I] | ~2.1–2.4 h a week: 2.8–3.2 times |
| P0, uncounted [U] | Terms answers; the 410 deploy; B4's hand steps if run in P0 (`switch.md` B4); cancelling the frozen charges; Sentry Crons; a PITR restore drill; reviewing the move PR, partner terms and clip scripts | Extra |
| Nov–Dec worst case, if S2 lands in December | Add `/help/` publishing 1.25–1.75 h, S2 texts ~20 min, M1 ~25 min: ~17.3–21.9 h in all with the focus's lines [I] | Up to ~2.7 h a week: about 3.7 times |
| S2, then steady | ~40–52 min a week with the default cadences (67 at the Ask & Offer cap) | At, or a little over |
| Interviews, 4 Jan – 28 Feb | 3-hour version ~3.7–4.3 h a week; full version ~4.5–7 h (both with the S2 lines) | Over in both |
| Design partners | ~2.5 h each to set up (with the week-2 call), on top of February's interview weeks; 30 min at week 6. Then 40–80 min a week of support for 2–4 partners plus the S2 lines: 80–132 min a week | About 1.8–2.9 times the 45 minutes |
| Ads probe | Free look ~10 min; probe ~30 min setup, ~10 min a week, up to 2 h a week of support allowed for | Support alone ~2.7 times |

From S2, a week that runs over pauses a channel rather than squeezing it: the AI panel drops to Lite, then Ask & Offer
to monthly, then social to zero, then rank and Search Console checks to quarterly. Never paused: support for a real
merchant, fixing a claim found false, legal duties (GROWTH §3.1). None of those channels runs in P0, so P0's only
lever is Now-7's slip order.

**Recurring cost: £0 a month by default.** Cloudflare Pages and DNS; a free rule or Worker for the docs host's 410
[I, unchecked]; 2 of the 10 free Single Redirects (`www`, and the docs host's later 301); Search Console; the social
accounts and LinkedIn's scheduler; YouTube; Companies House; Google Workspace (already paid, edition [U]); GitBook
(now Basic, no paid plan).

**Every spend decision:**

| Item | Price | When | Decision |
|---|---|---|---|
| Supabase PITR with a rehearsed restore | ~US$100 a month (Small compute) | Before S2, the first real merchant or the first partner | Now-4 (GROWTH G10) |
| Sentry Crons | [U], on Sentry billing | First-real-merchant steps | Now-4 |
| EU Art. 27 representative | Prighter €420 a year; GDPR Local from £999; EDPO €1,920 | If EU installs are in scope (the listing is open worldwide) | Now-4 |
| ICO fee renewal | £52, or £47 by direct debit | By 11 Dec; a legal duty | — |
| A mail sender for a data-request email | [U], plus a processor row | Only if Now-5 says email | Now-5 |
| Solicitor's short read | Fixed-fee quote first [U] | Not planned: Now-2 decided 7 Nov, no solicitor | Now-2 |
| Outing travel, printed cards; postage only behind the W-gate | [U], one-off | Outreach weeks L1–L8 | Each time |
| Video files on Pages or R2, if Cloudflare's "Paid Services" clause covers them | [U] | S2 help clips | Later-2 |
| AI-panel API series | "A few dollars a month" | After S2 | Later-2 (default no) |
| App Store ads probe | US$150 hard cap plus tax or VAT, ≤30 days, UK | Not before H2 2027, after A1–A8 | Later-3 |

Not proposed: LinkedIn Premium Company Page (£79.67 a month), X Premium Business (from US$200 a month), Meta One (from
US$14.99 a month), Sales Navigator (£94.99 a month), lead-data vendors (US$75–995+ a month), schedulers, GEO tools.
Google, Meta and LinkedIn ads: not now; GROWTH keeps a smallest version (`ads.md` §8) for a later yes.

## 8. Where every file lives

| What | Where | State |
|---|---|---|
| This roadmap; the kernel (`brand.json`, `kernel.toml`, `claims.toml`, `approvals.jsonl`, `kit/`); `DESIGN.md`, `REVIEW.md`, `CREDITS.md`; `social/` | `/Users/macair/worktrees/rewardspro-social-kit/apps/rewardspro/marketing/`, local branch `claude/rewardspro-social-kit` | At 676c10b4, the same commit as PR #83's branch `feat/rewardspro-brand-kit` (unmerged); no copy on origin [V, local refs]. `claims.toml` is modified and the rest here is untracked, so it exists only in this worktree. Nothing is committed before Now-6 (public repo; most kit files name Yu); a copy to the research folder is proposed now |
| Today's captures behind the claim rows | Session scratchpad, `claims-fetch/` and `verify-claims-fetch/` | Match the ledger's sha256 [V]; lost with the scratchpad unless copied (Now-6). Internal only |
| The landing (rewardspro.io) | `apps/rewardspro/landing/` on main; Pages project `rewardspro-landing`, deployed only by a manual `wrangler pages deploy` | Live and false; PRs #130, #95 and #131 were written for the old app (`social/listing-delta.md`) |
| Plans 2–6 and their evidence | `/Users/macair/Documents/rewardspro-research-2026-11-07/` (`wf2`–`wf6`, `wf/`, `ref/`) | Durable copies. Raw captures of Shopify-run pages read by script: internal only, never published, never refreshed |
| Profile build and check scripts | The session scratchpad only | Lost unless brought into the kit (social README) |
| PR #157 | Branch `claude/rewards-admin-truth-lines`, worktree `/Users/macair/worktrees/rewards-admin-truth`, commit 2fd1e9ab | Open; a merge deploys production |
| The GitBook record | `…/wf2/gitbook-unpublish-2026-11-07.md` | Done today; reversible in GitBook |
| Private data (consent ledger, suppression list, raw notes, question log, install log, ad reports) | Outside every repo and worktree: Yu's encrypted disk image (Pre-7), with an export folder for agents | Doesn't exist yet; nothing is collected before LIA Part A |

**B5 deletes `apps/rewardspro/`**, and this kit and file with it. Before B5 starts: Yu names the new folder (Now-6);
agents move it by PR with the landing tests and add a landing line to `switch.md`'s B5 section (wf2 A6); and the kit
is committed there, not here.
