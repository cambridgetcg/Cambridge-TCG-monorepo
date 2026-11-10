# RewardsPro roadmap: one plan from eight

**An agents' proposal, written 2026-11-07 and refreshed on 2026-11-10 (RP-19, #179; its second read is to come).
Nothing in it is decided, except where it quotes the owner's word.** It merges the six plans the owner asked for on
7 Nov, the focus plan for his direction that day (row 7) and the playbook for his question that evening (row 8) into
one order of work, and links to each for the detail. Nothing is published, sent, spent or merged without his word.
Since 10 Nov ("Use the owner instead of Yu.") this file calls him the owner. Who does which part: [WORK.md](WORK.md).

Labels: **[V]** checked on 10 Nov unless dated (a file, commit, command or one request to our own hosts); **[O]**
observed once, by an earlier pass or a single run; **[I]** inferred; **[U]** unknown. Times are the plans' own
estimates [I]. Not legal advice.

**Focus (the owner, 2026-11-07).** In his words: "Want to focus on recurring purchases small to medium uk business
first. Build reputation, gather reviews, user feedback." and "我覺得搵有品牌嘅 最好自己管理quality control and product
line." (merchants who own their brand and, ideally, run their own quality control and product line). The rest is
the agents' reading, in `…/wf8/FOCUS.md` and `…/wf9/signals.md`, for his yes (§5 Now-8a, Now-8b):
- **First segment:** UK micro and small limited companies and LLPs (about 1–49 staff, owner-run companies
  included) whose customers reorder consumables through a Shopify checkout: coffee and tea first, then pet,
  supplements and health food, beauty; one craft shop as contrast. Own brand is preferred within each segment until
  the interviews (F-3). "Recurring" is read as reorders, not subscriptions (F-0).
- **Held or later:** card shops are a held lane of 0–2 owners he knows (0–1 in the 3-hour version), never
  cold-emailed (F-2). Medium firms (50–249) and subscription-led brands come later (F-0, F-4).
- **Three limits, said first:** buyers can spend credit only when signed in with new customer accounts or with Shop
  Pay; store credit can't pay subscription renewals; RewardsPro has no renewal, product or channel rules (FOCUS
  §2.4). In public only once their rows are `verified`.
- **Goals:** reputation before reviews (a true listing, a working mailbox, fast human replies, a public changelog),
  then genuine reviews; feedback from the first interview on (FOCUS §1, §4–§5). Reviews are counted, never targeted:
  no review quota in any plan, partner term, message or post (FOCUS §1, §4).
- **Cost:** about 1.8–2.5 h more of the owner's P0 time (FOCUS §3.3; added into §7 [I]). Nothing goes out before its
  gate: the L-gate for asks and interviews, the W-gate for email, G0 for product sentences (§2–§3).

> **This week (10–15 Nov), about 2.8–3.2 h if all four are done [I].** Done on 9 Nov: #157 merged, the old repos
> private or archived, the stale DNS records deleted (his go for these isn't on record yet, §5), and rewardspro.io's
> false features gone (#191).
> 1. The Partner Support question (action 1): on 10 Nov the owner asked Shopify support which team reads the agreement;
>    the full notice waits for that answer and his word.
> 2. The decisions in §5's first table (~60–80 min), Pre-1 and Now-6 first: B4's erasure is due about 17 Nov, and B5
>    can start from about 14 Nov [I].
> 3. The listing sitting with #208's sheet, once its author answers the second read, before Sun 22 Nov (action 4,
>    ~45–50 min).
> 4. If there's time, the mail part of action 5 (SPF and DKIM, ~45 min), because DKIM takes up to 48 h.

| # | Plan | Files |
|---|---|---|
| 1 | Social kit and design | [social/README.md](social/README.md), [social/STRATEGY.md](social/STRATEGY.md) (S0–S3, D1–D12), [social/SETUP.md](social/SETUP.md), [social/claims-map.md](social/claims-map.md), [claims.toml](claims.toml), [DESIGN.md](DESIGN.md), [REVIEW.md](REVIEW.md), [CREDITS.md](CREDITS.md) |
| 2 | Site and help page | `…/wf2/RECOMMENDATION.md` (steps A1–C5, questions Q1–Q12), `…/wf2/gitbook-unpublish-2026-11-07.md` |
| 3 | Outreach | `…/wf3/outreach/OUTREACH.md` (D1–D16), `PIPELINE.md`, `LIA-draft.md`, `INTERVIEW-GUIDE.md`, `MESSAGES.md`, `ROADMAP-ENTRY.md` (O-01–O-39) |
| 4 | Onboarding | `…/wf4/ONBOARDING.md` (admin PRs PR-1–PR-6, clips VH1–VH5, V1, E12, VG1, R0, D-flow-1–12) |
| 5 | Partner Program Agreement (PPA) check | `…/wf5/ANSWER.md` |
| 6 | Growth (hybrid motion, SEO, AI answers, ads) | `…/wf6/GROWTH.md` (G1–G16) |
| 7 | Focus: recurring purchases, reputation, reviews, feedback | `…/wf8/FOCUS.md` (F-0–F-14), `segments.md`, `fit.md`, `reviews.md`, `feedback.md`; `…/wf9/signals.md` and `fit-message.md` (the own-brand check and message angles) |
| 8 | Playbook: how new apps break in, Shopify's own levers, partner channels, SEO and agent status | `…/wf10/PLAYBOOK.md`, `official.md`, `cases.md`, `partners.md`, `status.md` |

`…` is `/Users/macair/Documents/rewardspro-research-2026-11-07`, on the Air only (§8).

---

## 1. Where things stand (Tuesday 10 November 2026)

- **The app** [V]: production runs `apps/rewards`; anyone can install it. #157 (which orders earn) and #188 (the setup
  guide's data) merged on 9 Nov; the guide's page is draft #192. Its own name is still "Rewards Pro"
  (`apps/rewards/shopify.app.toml:10`) until PR-1b (RP-11).
- **The review request** [V]: Home still asks from a page-load effect 7 days after the store first opened the app,
  with 3 cashback entries (`apps/rewards/app/routes/app._index.tsx:265-277`,
  `apps/rewards/app/lib/stats.server.ts:240-245`). RP-13 (#173) waits for F-8.
- **G0 is not recorded; B4 is** [V]: `apps/rewards/docs/gates.md` (#158) records checks A–P on production. Open: I's
  erasure, due with Shopify's customers/redact about 17 Nov (`gates.md:27`); some items were accepted from tests on
  the owner's word (`:12`). The narrow form's evidence, order #1011 and its partial refund, is at `:20` and `:23`.
- **B5** can start from about 14 Nov, or about 24 Nov if it waits for I's erasure, and drops the old schema within
  about 30 days of the 6 Nov switch (`switch.md:231`), so by about 6 Dec [I]. Its PR deletes `apps/rewardspro/`,
  where this kit and the landing live (the rebuild plan's B5, on #142's branch).
- **The listing is still false** [O, the 7 Nov capture; #162 records no edit]: tier products, the Memberships tags, an
  old video, an over-wide data request, three old-admin screenshots (one shows a real gmail.com address); 0 reviews.
- **rewardspro.io** [V]: #191 ("yes strip", live 9 Nov) removed the false features, the old spelling, the docs link
  and "Love is the design."; live equals main. Unverified lines wait for state A (#210); the privacy page describes
  the old stack [V, 9 Nov audit, #167]; `/help/`, `/terms/`, `/subprocessors/` 404; the docs host 307s to GitBook.
- **DNS** [V, DNS over HTTPS]: only SPF at the apex, one DMARC (`p=none`). SPF fails (its include has no record) and
  there is no Google DKIM key, so contact@ is unproven. `rewardspro-marketing` is private, `rewardspro-docs` archived.
- **Claims** [V]: 36 rows on main, all `proposed`. Draft #207 adds 7, with `sh-sc-subscriptions` and
  `rp-no-order-rules` for the listing's limit lines; three of #187's rows await a concur on #165.
- **AI answers** [U: a 9 Nov run of one search tool, its answers not saved]: 5 of 8 questions named RewardsPro, all
  five with the old $39/$149 prices; 0 of 8 linked rewardspro.io; 0 of 3 "which app" questions named it.
- **Direction (the owner, 9 Nov)** [O: #162's claim paraphrases it; his words aren't on record]: RewardsPro's
  marketing, SEO and being recommended by AI assistants first (the patent later, an Air session reports). Drafts
  #207–#211 carry it. Each has had a second session's read (10 Nov): #210 and #211 carry block challenges and
  #207–#209 fixes, which their author answers next; #207's rows that the reader wrote still need another concur [V].
- **The rewards lane** [V]: ten issues from code reading (nine labelled bug), none run (#190, #193–#201); drafts
  #205, #206 and #202.

## 2. The shape

**Truth first, then G0, then open channels** (a proposal). Merchants and machines read the App Store listing first
(Shopify's Sidekick builds its app cards from it), then rewardspro.io. So the first work makes those true: the
listing's false lines and screenshots, the privacy page, a "state A" home page, the admin's own words, DNS and mail.
None of that needs G0. G0 then unlocks product sentences: `/help/`, the G0 screenshots, LinkedIn milestones and the
first videos (stage S2).

**What RewardsPro is, in the owner's words (7 Nov):** "A credit system to give back to customers who are loyal, so
that a ecosystem can be built." The idea is his (recorded in `approvals.jsonl` line 4, `rp-umbrella-idea`; quoted in
MESSAGING.md §0; `kernel.toml` is unchanged); the wording is a proposal in
[MESSAGING.md](MESSAGING.md), umbrella "Reward loyal customers with store credit in your own shop." or, with his
verb and term, "Give back to your loyal customers, with store credit in your own shop.", both for after G0 (state
A heading: "Made for rewarding loyal customers."), in the business register he asked for later that day
("用loyal customers, take a more business approach on wordings."; `approvals.jsonl` line 7), with state A and B
descriptions and the direct email set. Positioning beyond his idea still waits for the interviews.

The motion is **hybrid**. Self-serve is the default for everyone: listing, install, the admin's setup guide,
`/help/`. Human-guided setup is for at most 4 design partners at once, after the partner gate: interviewees, or
merchants who write in, with a real give-back job and customers who reorder through checkout (Now-1; wf8 FOCUS
§2–§3). The merchant always starts the move, and what partners stumble on goes back into the admin words and `/help/`.

**What we deliberately don't do:**
- **Never, whatever Shopify answers:** DMs, InMail or connection notes, phone calls, contact forms or marketplace
  messages to shops; bought or scraped lists; cold contact to sole traders, partnerships or shops we can't classify.
  The ICO treats DMs as electronic mail needing consent, PECR needs consent to email individuals, and phone and forms
  are the outreach design's own "never" (wf5 §3; OUTREACH "In ten lines" item 5).
- **Held until the W-gate's remaining items hold, then open on the owner's word of 7 Nov ("Emailing business directly
  is fine."):** one first email to a verified Ltd or LLP's role address published somewhere Shopify doesn't serve,
  once LIA Part B, the "businesses we contact" row, ICO renewal, mail and contact@ tested, the suppression list and
  verified claims are in place (W1 is recorded, `approvals.jsonl` line 3; wf7 `email-rules.md` §4;
  [MESSAGING.md](MESSAGING.md) §5–§6). It doesn't wait for Shopify's answer, except that an address seen only on a
  Shopify-hosted storefront waits for its question 3, or the owner's word after 18 Dec. "Shopify-hosted" includes the
  shop's own domain on Shopify's DNS, any `*.myshopify.com` page and proxied stores; if unsure, it counts as hosted.
  For most candidates that is the only published address, so most stay held until then [I]. Letters stay held
  unless he says his word covers post (Now-2).
- Using anything learned through Shopify or RewardsPro for outreach ("we don't email merchants through RewardsPro,
  we discover from existing market", the owner, 7 Nov); a shop or address that ever reached us that way stays out
  even if it turns up again in public (wf5 §2.4).
- Ads before at least 5 genuine reviews (a limit on ads, never a review target; GROWTH §5.1 A5).
- A review target or quota anywhere, or a review ask outside the in-app card (and the support-close line, only if
  the owner picks it under wf8 F-14).
- Store credit for reviews, referral payments, undisclosed reciprocal promotion, paid podcast slots, a page per
  competitor (Pre-10; GROWTH §7.2).
- Agents posting, replying, liking, scheduling, drafting forum replies or keeping any login of their own.
- Bulk scripted reads of App Store search pages or of shops' Shopify-hosted sites. This was an agents' rule that
  covered every Shopify page; on 10 Nov the owner said "you can use scripts ah, since when did we say we cannot?",
  so scripts and agent browsing are fine. What is left is the reason, for the bulk cases only: apps.shopify.com's
  robots.txt bars search pages for bots, Shopify's API terms bar scraping "any Merchant Store", and Shopify can end
  the partner agreement without cause. The 7 Nov bulk reads stay internal.
- KINGDOM language, links or DNS records anywhere on RewardsPro.

## 3. Phases

| Phase | When (earliest realistic) | What happens | The owner's hand / word | Agents (on his yes) | Done when |
|---|---|---|---|---|---|
| **P0 Truth first** | Now to Sun 3 Jan 2027 | L-gate items first: the Shopify question, listing text and S1 screenshots, mail and DNS, privacy page with outreach rows, outreach preparation. Then the state A page, the move PR, G0. S0 names optional | Actions 1–12 (§4); the open decisions (§5) | By Fri 20 Nov: the outreach kit, dev-store test list (O-06), visit-pack method, DNS script, event list. Then PR-1, PR-1b, PR-2, privacy and terms drafts, the state A PR, the move PR; rows checked from saved captures (below) | No false text on the listing and three S1 screenshots, live after Shopify's review [U: how long]; privacy and outreach rows live; mail passes; every L-gate item ticked by Sun 3 Jan |
| **G0 sittings** | Late November at the earliest [I], once PR-1, the setup guide, PR-1b (neutral widget defaults) and PR-2 (if Pre-3 says yes) are live | Sitting 1 on the shot list's store (~85 min); sitting 2, "partner zero", on a new store (~45–50 min), starting with REC-0 and REC-4a (ONBOARDING §8.2). B4 is recorded (#158); which form counts is Pre-1 | The form (word); both sittings (hand) | Privacy read of every frame; verify supported rows, with a second session; cut clips; review packs for `/` and `/help/` | G0 recorded in the owner's form; the supported rows `verified` |
| **S2 Open** | Weeks after G0: December at the earliest, January more likely [I]; listing review time [U] | Listing state B, G0 screenshots, Resources → `/help/`; `/`, `/help/`, the 404, terms if not yet live; docs host 301; bios set B; M1 pinned; V1 on YouTube; clips VH1, VH2, VH5 on `/help/`; admin PR-3, PR-5; the demo-store link and structured features as their rows verify (Now-9); "In the spotlight" takes no application | Approve and deploy packs; swap the listing; post M1 (~25 min); first-real-merchant steps or a written waiver; Ask & Offer replies (≤2 a week) once GROWTH G8's two preconditions exist | Packs and site PRs; the install-source PR (Pre-9); fact briefs, never reply text, for threads he brings; coding the AI answers he pastes | STRATEGY §2 conditions (a)–(g) hold and M1 is posted |
| **Interviews** | Mon 4 Jan – Sun 28 Feb 2027 (to 14 Mar if needed). Lane A needs the L-gate only; first emails need the W-gate (Now-2) | 5–8 interviews with UK shops whose customers reorder (5 in the 3-hour version; quota in wf8 FOCUS §3.1; card shops 0–2 (0–1 in the 3-hour version), owners he knows) through people he knows, quiet-time visits, inbound mail, peer-started introductions and, once the W-gate holds, one first email to verified limited companies and LLPs in the first segments (at most 5 a week, 10 in the phase; never card shops, F-2); a LinkedIn call only from S2; Pre-11's two questions if he says yes | Every ask, outing, interview and same-day note; the conflict-of-interest line (Pre-7) first in every card-shop conversation | Monday packs (counts only); syntheses from de-identified notes, each checked by a second session; evidence ledger; product memo; kernel draft; the results page at outreach week L8 | ≥5 interviews by Sun 14 Feb; a verdict per hypothesis; memo and kernel draft decided; a verdict per route at L8 |
| **Design partners** | P-gate: B4 in `gates.md` (recorded), the privacy page live (RP-07), partner terms. 3-hour version (default): setups from about 1 Mar, day 90 about 30 May [I]. Full version: setups in weeks L6–L7 (8–21 Feb) if the gate holds by 1 Feb, day 90 about 9–22 May [I] | At most 4 active; a 60-minute setup call where the merchant drives (conflict line first, no margin questions); calls in weeks 2 and 6; the question log; PR-6 after the second setup and when the guided phase ends | Invitations; the calls; the PITR spend or waiver; approve the partner terms; each partner's dev-store tests, by hand or by agents in a session he opens | Partner terms page; staff-access statement draft; log syntheses; PR-6 and `/help/` edits | 2–4 active at day 90; the guided phase ends at two setups in a row with no new stage note, or the earlier of 90 days after S2 and the 10th real merchant |
| **Self-serve growth + ads test** | From S2 (H1 2027); the ads probe not before H2 2027 [I] | Help sections split on real questions; VG1 (the YouTube guide) when the guided phase ends, if pillar H2 holds; VH3 and VH4 when asked; R0 when review asks; Later-4 and Later-5 once their gates hold; 2027 trade shows as learning visits; the probe only after A1–A8 (GROWTH §5.1; A5's 5 genuine reviews is a limit on ads, never a target) | Monthly rank, Search Console and AI-panel checks by hand; a written yes to the probe's cap, end date and stop rules; pause by day 30 | Coding pasted AI answers; probe read-outs at days 37 and 60 from aggregate counts he copies out | The probe read at day 60, run only once A1–A8 held; continuing needs a new yes |
| **Built for Shopify** | H2 2027 at the earliest [I] | A readiness check: 50 net installs from paid-plan shops, 5 reviews and a minimum recent rating Shopify doesn't publish (BFS 1.2.1–1.2.3); the same kinds of minimum gate "Increased visibility", Sidekick's recommendations included; no paid push | Whether to apply | The check | Criteria met and the owner applies, or decides not to |

**How agents check rows without opening Shopify pages.** For the first check of `rp-maker`, `rp-on-app-store`,
`rp-merchant-funds` and the sh-* rows, a second session compares the 7 Nov captures (the listing, Companies House, the
PPA and both help.shopify.com pages) with the hashes the ledger stores; the copies are in `…/claims-fetch/` and
`…/verify-claims-fetch/` [V]. Monthly upkeep is the owner's paste (Pre-5); which Shopify pages agents read is in §2.

**Where the plans disagreed, and the line taken (proposals):**
- **Partners:** at most 4 active (GROWTH G1, wf3's practical cap), not 8: the hours don't hold 8.
- **Agent jobs replaced by GROWTH §7.1:** the "raw re-fetch" in STRATEGY §6.3 and §13 step 5; the App Store
  re-capture in §9 and §13 step 8; ME-6 and §13 step 23 (agents' monthly AI answers); ROADMAP-ENTRY O-16; OUTREACH
  §4.4's monthly re-fetch; wf2 step D1. The owner runs rank checks and the AI panel by hand; agents code what he
  pastes. ME-1 stays with agents only through their own search tool, never by loading result pages.
- **S3:** the L-gate replaces STRATEGY S3's "consent-first outreach doors", and "the question sent" replaces
  "answered" (wf5 §6 item 4); since the owner's word of 7 Nov, "sent" is recommended, not a gate (§6). S3 now means
  S2 plus the partner gate; only the public M2 call waits for it (Later-1).
- **PR #157** (merged 9 Nov) superseded ONBOARDING PR-2's "On:" line and IA3. It says tips and duties earn nothing,
  from code only, so the public `rp-cashback-base` row keeps to what was observed: B4 accepted the tipped order from
  tests (`gates.md:43`), and #190 narrows it further. C1, the L1 bio and the A7 rule card follow the row.
- **Docs host:** the unpublish kept the GitBook domain attached, which stops a takeover. GROWTH's plan stands: 410
  until `/help/` exists, then a 301; a Single Redirect can't return 410, so that needs a free rule or Worker [I:
  which fits is unchecked], one more small deploy in the Cloudflare sitting.
- **The PPA:** since Now-2, cold email doesn't wait for Shopify's written answer; "the question sent" is recommended
  for every route, a gate for none (wf7 `email-rules.md` §6; wf5 §5). Still binding: 2.1.2 (a storefront-hosted
  address waits for question 3), 2.1.3(ii)–(iii), 2.1.4(ii)–(vi) and the law. Letters stay not advised (item 11)
  unless his word covers post; a written 'no' from Shopify stops email until he decides again.
- **"Talk to us"** in outreach: the plain address contact@rewardspro.io (the state A page shows it too), once action
  6 passes; it becomes `rewardspro.io/help/#contact` the day that anchor ships at S2.
- **Screenshots:** all three old ones come out (the shot list finds #2 false too), replaced by S1-A, S1-B and S1-C,
  which meets the L-gate's "at least 3" and Shopify's "3-6".
- **Profile texts:** A0 and A0c drop "listed on the Shopify App Store" (claims-map; PPA Part A §5.3).
- **Built for Shopify and comparison pages:** GROWTH §4.1's "about 20" installs is wrong; Shopify's figure is 50 (BFS
  1.2.1). GROWTH §7.2 and STRATEGY §14 rule out comparison pages; wf10 proposes one honest fit page after S2
  (Later-5). The ban stands until the owner says yes.

## 4. The owner's next 12 actions, in today's order

The numbers are ids kept from 7 Nov, because WORK.md, the issues and the draft PRs cite them; the rows run in today's
order. Times are hands-on; action 2 includes reading.

| # | Action | Time | Package and sheet |
|---|---|---|---|
| 1 | **The Partner Support question.** On 10 Nov the owner judged that first-line support can't read the agreement ("They would need a lawyer team.") and asked it, in chat, which team can give a written view on section 2.1; the advisor is finding out. The full notice goes to that team only on his word. It is protection, not a gate (Now-2): outreach doesn't wait for it | done 10 Nov; the rest [U] | RP-01 (#161, claimed by be982085): the notice text is in `…/work/RP-01/`, checked by three readers, with no sentence that limits how shops are found; `wf5/ANSWER.md` §5–§6 |
| 2 | **Give the decisions** in §5's first table this week, the rest before 4 Jan | ~60–80 min, then ~40–50 [I] | §5 |
| 4 | **The listing text sitting.** Optional first, before the edit shows live: the "before" AI check (25–30 min). Then #208's steps, the five search terms and step 7 (Now-11) and the Now-9 fields among them; the three limit lines once their rows verify. Submit at once, before Sun 22 Nov (Now-9), and note the live date, which starts action 12's 30 days. Same sitting: the safety-net calls (Now-4) | ~45–50 min, the safety-net calls included (70–80 with the check) | RP-02 (#162): draft #208, second read done (no block; three fixes, one at step 7) [V]; `social/listing-delta.md` §0 |
| 5 | **One Cloudflare sitting, mail first:** an SPF record that passes, a 2048-bit Google DKIM key, DMARC as the mail fix writes it. Then crawler policies and Crawler Hints; Search Console (Domain property, company account, a second owner); `www` → apex 301; the docs host's 410 and a removal request; Bing optional. ~~Stale TXT records, the second DMARC, the old repos~~: done 9 Nov | ~60–75 min (~45 of it mail) [I]; the 410 deploy [U] | RP-03 (#163, unclaimed, no sheet yet); RP-04 (#164): draft #209, second read done (no block, seven fixes) [V]; `GROWTH.md` §4.2 act 3 |
| 6 | **Test contact@** from an outside address once DKIM is live (up to 48 h after action 5): SPF, DKIM and DMARC pass, and the message arrives. Tell agents only "yes or no, and the date" | ~5–10 min | RP-03; `social/SETUP.md` 1.2–1.4 |
| 3 | **Admin merges in WORK.md's order** (each deploys production): ~~#157~~ merged 9 Nov (1c49ed0a); PR-1 (RP-10, #170, unclaimed; its contact@ line waits for action 6); the guide's page (#192) and its Home guard; PR-1b by `shopify app deploy` (RP-11, #171) once a staging deploy accepts the paragraph setting; RP-13 once F-8 is answered; PR-2 (RP-12, #172) just before the G0 sitting | ~10 min each [I] | `ONBOARDING.md` §7.1; `RECOMMENDATION.md` A10, A13; WORK.md §1; PR-1 and RP-11 need Pre-3's rest first |
| 11 | **G0:** give its form (Pre-1), then hold the two sittings (§3). B4 is recorded (#158); its open item is I's erasure, due about 17 Nov | ~5–15 min; ~85 + ~45–50 min | RP-09 (#169): draft #211, held as a draft until G0 (second read: one block, at help:485, waiting for #205) [V]; RP-15 (#175); `social/shot-list.md` §6–§8 |
| 7 | **The privacy and subprocessors page.** Answer #130's placeholders, Sentry's region and the erasure wording (Pre-8); deploy the draft with the outreach rows "people who contact us" and "interview notes" (L-gate (e)) and "businesses we contact" (W-gate (c)), and the terms page if answered (Pre-6). The footer's docs link is gone already (#191) | ~20–40 min + ~30; terms answers [U] | RP-07 (#167, unclaimed); `RECOMMENDATION.md` §6 A2, A12; `OUTREACH.md` §6 |
| 9 | **The true home page:** merge and deploy RP-08's state A PR (with `security.txt`) once its rows verify and you have answered its questions (Pre-6); paste the listing's Pricing text, which needs Pre-5 | ~45 min | RP-08 (#168): draft #210; its second read blocks on the claims gate and on two rows that don't exist (`rp-purpose`, the agreements sentence) [V]; `social/entity-card.md` |
| 10 | **Outreach preparation.** By Fri 11 Dec: renew the ICO fee registration and update its address (it expires 19 Dec); sign LIA Part A and set the retention numbers; LIA Part B before any first email. By Sun 3 Jan: review the outreach kit; count the owners you know in coffee, pet, supplements, beauty, craft or cards, and the candidate shops in two outing areas (numbers only), before F-1; set up the private store (Pre-7) | ~20 + ~60 min; ~90 + ~45 + ~30 min | RP-20 (#180), RP-22 (#182), RP-23 (#183), local only; `OUTREACH.md` §4.3, §10 |
| 8 | **The S1 screenshots,** once RP-10 and the setup guide are live and Pre-2's approval is recorded: capture S1-A, S1-B and S1-C and upload them in place of the old three (a second listing edit, reviewed again). By Fri 18 Dec, for the L-gate | ~90 min | RP-21 (#181); `social/shot-list.md` §2, §5 |
| 12 | **The mirror correction,** 30 days after action 4's edit shows live: look once at the LetsMetrix and PickYourApp pages; if either still shows the old plans or features, send each one factual correction request from contact@ (once action 6 passes), naming only what is wrong | ~15 min | #208 §4 sets the reminder; `GROWTH.md` §7.1; wf10 `status.md` C7 |

Not in the twelve: the London Shopify Partner Meetup on Thu 3 Dec (Pre-12; optional, ~2.5–3 h, listen only). Reserve
the social names (S0, optional, ~70 min: `social/SETUP.md` Phases 0–3) once agents have checked `rp-maker` and
`rp-on-app-store`. Before B5 starts (a week after B4 at the earliest; B4 was recorded on 7 Nov, so mid to late November
at the earliest [I]): name the folder (Now-6) and merge RP-17's move PR (#177).

## 5. Decisions for the owner, as they stand on 10 Nov

**Decided** (his words, the date, where recorded; nothing from 8 Nov on is in `approvals.jsonl` on main yet: #215
adds line 8, and #171 and #189 carry lines ready to append [V]):
- **Identity A and the spelling (20 Oct):** "lets go with what you recommended :) looking good!" and "yes rewardspro
  as the one spelling" (`approvals.jsonl` lines 1–2).
- **Now-2 (7 Nov):** "Emailing business directly is fine." (`approvals.jsonl` line 3); its sub-parts stay open.
- **The idea, the focus, own brand and "loyal customers" (7 Nov):** `approvals.jsonl` lines 4–7.
- **GitBook (7 Nov):** "unpublish gitbook. no plans." (this file at 5c953f5c, §1;
  `…/wf2/gitbook-unpublish-2026-11-07.md`).
- **Lab concurs (8 Nov):** "yes go ahead", for one lab session (74cb7025) posting its concurs (#165).
- **Now-10, shopify.dev (8 Nov):** "yes of course" (#166); nothing was asked about the other Shopify hosts.
- **The order-edit case is a product bug (8 Nov):** "Yes file the issue" (#190); the fix is the rewards lane's call.
- **The setup guide, RP-24 (8 Nov):** "Lets go for what you recommended on all" (#185's body); he applied its
  migration on 9 Nov (#192).
- **Pre-3, widget colours (9 Nov):** "Neutral defaults", a selected option (#171), carried by RP-11.
- **rewardspro.io's stopgap (9 Nov):** "yes strip", then "merge and deploy" (#191); state A (Pre-6) stays open.
- **The rewards lane (9 Nov):** "Make it a package", a selected option (RP-25, #189); "go for the three must-fixes,
  plus the two membership checks and the widget line, as one reviewed fix round" (#204); "Lets just go with what
  yuou think is sensible and the best choice." (#202), so its calls are agents' calls under his delegation.
- **Now-6, naming (10 Nov):** "Use the owner instead of Yu." (#215's body, and `approvals.jsonl` line 8 on its
  branch, unmerged); the other kit files change in #215 (open).
- **Scripts and agent browsing (10 Nov):** "you can use scripts ah, since when did we say we cannot?" (this file's
  PR body); the old "no scripted reads" line was an agents' rule (§2).
- **Rules (10 Nov):** "Too many rules😂 Lets just make things work." A review of every rule in these plans (who made
  it, what it protects, what it costs) is under way; its result goes to him as a proposal (this file's PR body).

**Reported, not yet on record [O]** (a session's paraphrase or local note; decided once his words are recorded):
**9 Nov:** a go for what was recommended (Now-3 in part), as an Air session reports it: #157 merged (1c49ed0a),
`rewardspro-marketing` private, the stale DNS records deleted; `rewardspro-docs` archived earlier that day on an
unquoted yes (its PR #2); the priority (§1, #162's claim); the guide's words (#192). **8 Nov:** lab sessions in general
may claim, concur, release and open draft PRs (#165's claim); RP-24 ships before the S1 captures (#181); YouTube
guides from the real screens (#175).

**Open: this week, or before about 17 Nov** (most urgent first; every default is a proposal)

| # | Decision | Since 7 Nov | Proposed default | Argued in |
|---|---|---|---|---|
| Pre-1 | **G0's form (D6):** B4 in `gates.md`, or a production test order plus refund; and whether `gates.md:21` counts for `rp-widget` | **Changed:** B4 is recorded, its erasure open to about 17 Nov; the narrow form's evidence is on record (§1). #207's rows and #211's blocks wait on it | Yours. The partner gate and B5 need B4 either way | STRATEGY D6; wf2 A1, Q5; GROWTH G11 |
| Now-6 | **The kit's folder** before B5, for the landing and kit | **Changed:** the kit is on public main (#159), the naming is decided (#215 carries it), B5 can start from about 14 Nov [I] | `apps/rewardspro-site/` (you name it), moved by RP-17 (#177) before B5; personal data outside every repo | wf2 §3.3, A6, Q4; STRATEGY D11 |
| Now-9 | **The listing form's unset fields, and visibility:** "Works with", primary tag, structured features, geography, demo-store link, "Limit visibility" | **New** (wf10); #208 covers the fields | Stay visible; if action 4 isn't submitted by Sun 22 Nov, limit visibility until it shows live. "Works with" empty; primary tag Loyalty and rewards; features only for verified rows; geography unset [U]; demo store at S2 | wf10 PLAYBOOK §5; `official.md` §1–§2 |
| Now-11 | **The listing sitting's choices** (#208's questions 1–9, the search terms included), above all step 7: which line, if the form insists on three features | **New**; #208's second read (10 Nov) finds step 7's rule now keeps the false Feature 3, and adds a line | As #208 recommends: delete the widget sentence, trim Feature 2, keep Email, the five search terms. Step 7: "You can lock a customer to a tier" (33 characters, `rp-tier-lock`: concurred on #165, no open challenge), then the refund line, the old Feature 3 last; either new line needs your written exception to the claims gate | #208; #162 |
| Now-4 | **The safety net:** PITR (~US$100 a month) or written acceptance; Sentry Crons; the two frozen paid charges; an EU Art. 27 representative | **Changed:** #198 infers from code that a restore would pay credits again, so PITR needs a pause and a runbook (#202); #211 asks again: cancel the frozen charges, or accept `rp-free` in writing (its question 5) | PITR and the representative: your call, in the listing sitting; cancel the frozen charges, and until then no "free" in the admin or `/help/#cost` | GROWTH G10; ONBOARDING §8.1; #198 |
| F-8 | **Review request timing** (from Now-8b): R-1 to R-4 | **Moved up:** #157 merged on 9 Nov, so RP-13 (#173) waits only for this; the page-load ask was already live on 7 Nov | R-1, R-2, R-3 (d) and R-4 as small PRs before any real merchant's day 7 | wf8 `reviews.md` §7; FOCUS §8 |
| Now-8a | **The focus, now:** F-0 (what "recurring" and "small to medium" mean), F-2 (the card lane), R-0 (the listing fix) | Unchanged; R-0 is action 4 | As FOCUS §8: reorders first; micro and small first; card shops 0–2 owners you know (0–1 in the 3-hour version), never cold-emailed | wf8 FOCUS §1–§2, §8 |
| Now-3 | **Cloudflare, the rest:** AI training crawlers; the Search Console account and second owner; Bing; #209's Bot Fight Mode, zone plan and agents' checks during the sitting; the old keys | **Partly done** (the repos and DNS, reported above); #209 proposes Training Allow and Bot Fight Mode off if it challenges crawlers; old keys [U] | Search and Agent Allow, Training yours (#209: Allow; Block also stops some search crawlers); company Workspace account plus a second owner; no Bing yet; agents' read-only checks yes; you say the zone plan; confirm the old keys are revoked (F-13) | GROWTH G6, G14; wf8 reviews R-10; #209 |
| Now-5 | **Data requests:** in the app only, or also an email to the shop owner (`switch.md:62`)? | Unchanged; #207 and #211 ask again | In the app only, plus `/help/#data` [I, from "we don't email merchants through RewardsPro"] | `switch.md:271`; ONBOARDING D-flow-4 |
| Now-1 | **The shape:** self-serve by default; at most 4 partners after the partner gate; interviews from 4 Jan, no install ask; no posts before S2; removed features never named; no personal posts | Unchanged | Yes to all (D-flow-10 (b): contact@ writers may join the guided path) | GROWTH §2, G1; ONBOARDING D-flow-10; STRATEGY D1, D7, D9, D12 |
| Now-7 | **Time (§7):** P0 needs ~2.0–2.4 h a week; accept, or move 4 Jan. Lane A or both (§6); 3-hour or full version | Hours re-added with wf10 (E31: ~1.9–2.2 h became ~2.0–2.4 h); the 9 Nov priority [O] sets the order, not the hours | Accept; G0 slips first, then the home page, then S0; the L-gate items can't slip without moving 4 Jan; 3-hour version | GROWTH §3.1, G13; OUTREACH D3 |
| Now-10 | **The rest of the Shopify pages agents may read:** the developer forum, shopify.com/partners and /news | **Partly decided** (shopify.dev) | The forum by your paste or one thread on your yes; Partner and news pages one at a time, research only | wf10 PLAYBOOK §5 |

**Open: before 4 Jan, then the Later ones (at S2, the partner gate, or after reviews)**

| # | Decision | Since 7 Nov | Proposed default | Argued in |
|---|---|---|---|---|
| Pre-3 | **Admin words, the rest:** PR-1, PR-1b's words, PR-2 (IA2, the guest and buyer-email lines), admin links to `/help/` (Ruling 72) | **Partly decided** (colours); needed before PR-1 and RP-11 merge (action 3), so this month | Yes to each; IA2 (the fee line) in ONBOARDING §7.1's words, no "free", no "charges nothing"; links as each anchor goes live | ONBOARDING §7, D-flow-2, -3, -7; wf2 §4.3, Q7, Q12 |
| Pre-2 | **Stores, and the S1 approval** (D-shots-1, D-shots-2, D-flow-12) | **Changed:** the guide is to ship first, so S1-A shows it (#181, reported [O]) | The shot list's store for S1, a new store for partner zero; S1 frames may show the app's own sentences while their rows are proposed | shot-list §5; ONBOARDING §8.2 |
| Pre-6 | **The site:** state A's words (#210's questions 1–7); fonts; DESIGN.md; the terms page; #211's questions 6–8 (the three limits, Look A, an early 404) | **Changed:** #191's stopgap is live; #210 drafts state A, and its read blocks on `rp-purpose` and the agreements sentence having no row | State A as #210 drafts it, once its rows verify; system fonts; terms with action 7, or at S2; #211's 6–8 yours | GROWTH G5; wf2 §3.1, §5, A8, A11, O1–O3, Q6, Q8, Q9; #210; #211 |
| Pre-5 | **"Free", the price pair, claim upkeep** (first due 7 Dec); the search terms are in Now-11, by 22 Nov | Unchanged; #208 lays out pair A or B | `rp-free` always beside "You fund the cashback you give"; the descriptor at S2; your monthly paste | STRATEGY D4; GROWTH G3, G4, G15 |
| Pre-13 | **Refund limits on `/help/`:** publish them as limits, or fix the code first (#211's question 2) | **New** | No default yet: the rewards lane's fixes (#190, #206) decide what is left to say | #211; #190; #195 |
| Pre-8 | **Erasure wording** after uninstall (STRATEGY §9's "30 days at most" isn't what the code does) | Unchanged; #211 asks again | "About 31 days after you uninstall"; or a 29-day constant and "30" | MESSAGES §2.10; O-29 |
| Pre-7 | **Outreach details:** retention, named-person addresses, gifts, the conflict-of-interest sentence, Toy Fair, the private store and the rest of D3–D15 | Unchanged; #207 asks whether Cambridge TCG Limited sells trading cards today | PIPELINE §6's numbers; never named-person addresses; no gifts; one sentence, `rp-maker-also-sells`, before 4 Jan; skip Toy Fair; the disk image (RP-20) | OUTREACH D3, D6, D7, D9, D11, D13, D14 (and D-maker), D15; PIPELINE §6, §8 |
| Now-2 | **What Now-2 leaves open:** letters; a follow-up (D17); named-person addresses (D7); hosted addresses after 18 Dec (D-src) | Unchanged | No solicitor (proposed); no follow-up; named addresses never; hosted ones held until 18 Dec, then your word; letters only if your word covers post | wf7 `email-rules.md`; OUTREACH §4, §6 |
| Now-8b | **The focus, before 4 Jan:** F-1 (after your count), F-3, F-4, F-5, F-6, F-7, F-9, F-10, F-11, F-14; wf9 F4 (how often outreach names Shopify) | Unchanged; F-11's two rows are in #207; #211 asks wf9 F4's question for `/help/` | As FOCUS §8 (F-14: no support-close line); wf9 F4 has none, so BODY-B, YES-TRY and the brand-owner paragraph wait (MESSAGING §5.10, §6, O17) | wf8 FOCUS §8; wf9 `fit-message.md` §8 |
| Pre-11 | **Two interview questions:** who set up the store and suggests apps; whether they use Flow, Klaviyo segments or customer tags for loyal customers | **New** (wf10) | Yes, in INTERVIEW-GUIDE before 4 Jan; answers counted only | wf10 `partners.md` §10 |
| Pre-12 | **The London Shopify Partner Meetup,** Thu 3 Dec | **New** (wf10) | Go only if actions 4 and 5 are done by Mon 30 Nov; listen, no pitch | wf10 `partners.md` §6 |
| Pre-10 | **Partner-lane lines:** referral payments; "store credit for reviews" | **New** (wf10) | No referral payments; no undisclosed reciprocal promotion; never store credit for shoppers' reviews (DMCCA Sch 20 para 13) | wf10 `partners.md` §3 |
| Pre-14 | **Guard tests** for the negative claim rows (#207's question 3) | **New** | Yours to choose (AGENTS.md principle 8) | #207 |
| Pre-4 | **Social reservation** | Unchanged | Handle `rewardsproapp`, Bluesky `@rewardspro.io`; set A without "listed on the Shopify App Store" | STRATEGY §3, D2–D5 |
| Pre-9 | **Install source,** before S2 | Unchanged | The in-app "How did you find RewardsPro?" question at S2; no GA4 | GROWTH §6.1, G9 |
| Later-2 | **Measuring and video at S2** | Unchanged; YouTube guides reported, not on record (above) | Counts from about 10 installs; the Full AI check quarterly, with Q3 reworded first for shops whose customers reorder (FOCUS §3.2); V1, E12, then VG1 on YouTube, linked; help clips self-hosted after D-video-3 | GROWTH §6, G7, G8; ONBOARDING §6, D-flow-5, -9, -11 |
| Later-1 | **The partner lane:** M2, access, reviews, a reply time | Unchanged | M2 only at S3; screen-share only (collaborator access only after Shopify's business-detail checks); our reply to a partner's review says we set them up by hand, and that we trade with them where we do; a reply time you can keep, in the partner terms only | ONBOARDING §8.3, D-flow-8; OUTREACH D8, D10 |
| Later-3 | **Ads and Built for Shopify** | Unchanged | No ads now; the US$150 probe only after A1–A8; no paid push | GROWTH §5, G2, G16 |
| Later-4 | **Integrations:** Flow, Klaviyo, Sidekick | **New** (wf10) | Each only when 2 of 5 interviewees use the tool (Sidekick after 5 active merchants); free plans only; no marketplace listings | wf10 `official.md` §3; `partners.md` §4 |
| Later-5 | **Outside voices** | **New** (wf10) | After the proof gate: agencies only through a partner, unpaid podcasts; after S2, one "Is RewardsPro right for your shop?" page, on your yes | wf10 `partners.md` §3–§8 |

F-12 is Now-2's D-src; F-13: the repos are done, key revocation is open (Now-3); wf9 F1 was Pre-3's colours; wf9 F4
is not wf8's F-4. A row shorter than its 7 Nov text keeps the rest of its decision and default as written in its
source (or this file at 5c953f5c, §5), unless its Since column says so; wf10's full rows: `…/wf10/PLAYBOOK.md` §5.

## 6. Two outreach weights

| | **Lane A only** (Now-7: your choice of lanes) | **Lanes A and B: B opens on the remaining legal preconditions (the owner's word on email, 7 Nov)** |
|---|---|---|
| Routes | People the owner knows, quiet-time visits, inbound mail, peer-started introductions, a public call from S2 | Plus one email to a verified UK limited company's or LLP's role address published somewhere Shopify doesn't serve (§2; letters only if his word covers post): at most 5 a week, 10 in the phase, no follow-up unless he chooses one |
| What is kept | A paper consent sheet (entered the same day, then shredded) and a private table on the owner's encrypted disk image; agents read only an export of counts and de-identified notes | Adds the SQLite store (PIPELINE §3.2), its CLI and tests, and a Lane B project whose transcripts he deletes on the 60-day clock |
| Opens when | The L-gate: clean listing, mail fix, ICO renewal, privacy rows, LIA Part A. The Shopify question is recommended, not a gate (Now-2) | Lane A's L-gate, since a yes leads to an interview under it, plus the remaining legal preconditions, not Shopify's answer: LIA Part B signed, the "businesses we contact" row live, ICO renewed, mail and contact@ passing, the suppression list ready, the claims the email uses verified (W1 is recorded; wf7 `email-rules.md` §4; [MESSAGING.md](MESSAGING.md) §6). An address seen only on a Shopify-hosted storefront waits for Shopify's question 3, or his word after 18 Dec |
| The owner's time | ~3.3 h a week (3-hour version) or ~4–6 h (full version), counting the 45-minute approvals; ~30 min one-off setup | Plus about 1–1.5 h a week at 5 emails [I]; the store PR and LIA Part B [U]; the monthly purge |
| Why | Consent-first routes fit either reading of the PPA (wf5 §4) and need no answer | Cold email is open on his word; worth building if Lane A alone doesn't reach the online-only first-segment shops (LIA B3) |

Details: `PIPELINE.md` §0, §8–§9; `OUTREACH.md` §4.3, §6; `LIA-draft.md`; wf7 `email-rules.md`; [MESSAGING.md](MESSAGING.md).

## 7. Time and money

**The owner's hours** [I, the plans' estimates of 7 Nov, re-added here]. The stated budget is about 45 minutes a week
for all approvals, plus about 3 hours a week only while outreach runs (4 Jan – 28 Feb).

| Phase | The owner's hours | Against the budget |
|---|---|---|
| P0, 9 Nov – 3 Jan (8 weeks; 6 h budget), required | ~16.2–18.9 h [I, re-added with the focus and wf10's ~55–65 min: its decisions 30–40, Now-9's fields 10, action 12 15]: question 15 min; listing 40–50; S1 capture ~90; Cloudflare 65–80; contact test 5–10; privacy page 50–70; home page 45; merges 30–40; the 20 open decisions: reading 90–120 for the 18 before the focus (Now-8a and Now-8b are in the focus's line); outreach prep 245 (ICO 20, LIA 60, kit review 90, counts 45, disk image 30); G0 choice and sittings 135–150; the focus's lines 110–150 (FOCUS §3.3: reading and deciding F-0 to F-14 45–60, FB-1 to FB-9 20, the review PRs 10–20, `/changes` and "What works today" 30–45, the retired repo 5) | ~2.0–2.4 h a week: 2.7–3.2 times |
| P0, L-gate items alone | ~11.9–14.0 h [I]: ~10.3–12 h before the focus, wf10's ~30–40 min, plus the focus's decisions and FB-1 to FB-9 (65–80 min), which Now-8b needs before 4 Jan (no G0, no home page, nothing optional) | ~1.5–1.8 h a week: about 2.0–2.3 times |
| P0, optional | S0 names ~70 min (SETUP's 1 h 25 m less DNS and the contact test, counted above); the before-check 25–30; the London meetup ~2.5–3 h (Pre-12), outside these sums. With both and the focus's lines: ~17.8–20.5 h [I], wf10's additions included | ~2.2–2.6 h a week: 3.0–3.4 times |
| P0, uncounted [U] | Terms answers; the 410 deploy; cancelling the frozen charges; Sentry Crons; a PITR restore drill; reviewing the move PR, partner terms and clip scripts | Extra |
| Nov–Dec worst case, if S2 lands in December | Add `/help/` publishing 1.25–1.75 h, S2 texts ~20 min, M1 ~25 min: ~17.3–21.9 h in all with the focus's lines [I] | Up to ~2.7 h a week: about 3.7 times |
| S2, then steady | ~40–52 min a week with the default cadences (67 at the Ask & Offer cap) | At, or a little over |
| Interviews, 4 Jan – 28 Feb | 3-hour version ~3.7–4.3 h a week; full version ~4.5–7 h (both with the S2 lines) | Over in both |
| Design partners | ~2.5 h each to set up (with the week-2 call), on top of February's interview weeks; 30 min at week 6. Then 40–80 min a week of support for 2–4 partners plus the S2 lines: 80–132 min a week | About 1.8–2.9 times the 45 minutes |
| Ads probe | Free look ~10 min; probe ~30 min setup, ~10 min a week, up to 2 h a week of support allowed for | Support alone ~2.7 times |

From S2, a week that runs over pauses a channel rather than squeezing it: the AI panel drops to Lite, then Ask & Offer
to monthly, then social to zero, then rank and Search Console checks to quarterly. Never paused: support for a real
merchant, fixing a claim found false, legal duties (GROWTH §3.1). None of those channels runs in P0, so P0's only
lever is Now-7's slip order. wf10's additions follow it: action 12 slips with S0 and the before-check, Now-9's checks
ride in action 4, and the meetup (Pre-12) goes first.

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
| Solicitor's short read | Fixed-fee quote first [U] | Not planned (agents' proposal under Now-2; the owner hasn't said) | Now-2 |
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
| This roadmap, [WORK.md](WORK.md), the kernel (`brand.json`, `kernel.toml`, `claims.toml`, `approvals.jsonl`, `kit/`), `DESIGN.md`, `REVIEW.md`, `CREDITS.md`, `MESSAGING.md`, `social/` | `apps/rewardspro/marketing/` on main (#83 and #159, 7 Nov; WORK.md by #160) | Public [V]; git history keeps the earlier text that named the owner. This file writes "the owner" from RP-19 on; the other kit files follow in #215 (open). B5 deletes the folder, so the move (Now-6) comes first |
| The work packages | Issues #161–#183, #185 and #189 (label `rewardspro`) | Claims, concurs and the owner's answers are recorded there (WORK.md §2) |
| The captures behind the claim rows | `…/claims-fetch/`, `…/verify-claims-fetch/` | Match the ledger's sha256 [V, re-matched 10 Nov on #166]. Internal only |
| The landing (rewardspro.io) | `apps/rewardspro/landing/` on main; Pages project `rewardspro-landing`, deployed only by a manual `wrangler pages deploy` | The live home page equals main since #191's deploy [V, sha256]; the privacy page stays at its older live version. #95, #130 and #131 were written for the old app; RP-07 and RP-08 replace them |
| Plans 2–8, their evidence, the profile scripts, local package work | `…/` (`wf`–`wf11`, `ref/`, `profiles-build/`, `work/` and others) | On the Air only; RP-16 (#176, label `needs-yu`, to be renamed `needs-owner` when #215 merges) would copy some plans into `marketing/plans/` on your yes. Raw captures of Shopify pages stay internal, never refreshed |
| The GitBook record | `…/wf2/gitbook-unpublish-2026-11-07.md` | Done 7 Nov; reversible in GitBook |
| Private data (consent ledger, suppression list, raw notes, question log, install log, ad reports) | Outside every repo and worktree: the owner's encrypted disk image (Pre-7, RP-20), with an export folder for agents | Doesn't exist yet; nothing is collected before LIA Part A |

**B5 deletes `apps/rewardspro/`**, and this kit and file with it. Before B5 starts: the owner names the new folder
(Now-6); RP-17 (#177) moves it by PR with the landing tests and asks the B4 lane for a landing line in `switch.md`'s B5
section (wf2 A6).
