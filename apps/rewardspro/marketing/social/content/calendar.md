# RewardsPro content calendar

Content maker (agent), 2026-11-07, revised the same day after the verifier's review. **PROPOSAL for the owner. Nothing is
scheduled.** Post texts are in [`launch-posts.md`](launch-posts.md), replies in [`replies.md`](replies.md), and the
stages and cadence in [`../STRATEGY.md`](../STRATEGY.md) §2, §8 and §13.

## The rules this calendar follows

1. **No post before S2.** S2 needs all of: G0 and B3 recorded, the listing fixed, rewardspro.io rewritten and
   deployed, the first-real-merchant steps done or accepted by the owner in writing, contact@ shown to deliver, and every
   claim in the post `verified` (STRATEGY §2).
2. **LinkedIn is the only feed: 0–2 posts in any 30 days, milestones only.** A milestone is a merchant-visible change
   that shipped, or a held claim that became verified (STRATEGY §8). This calendar reads "a month" as any rolling
   30 days, the stricter reading.
3. **A slot is a ceiling, not a promise.** If a slot's claims aren't verified, or its sh-* rows are more than 30
   days old on publish day, the slot stays empty. "A missed week means nothing goes out. No backlog, no streaks, no
   catch-up bursts." (STRATEGY §8)
4. **YouTube:** V1 in the S2 week, then at most 2 more videos in 90 days, and only if H2 holds. X and Bluesky never
   post.
5. **The owner's time:** about 45 minutes a week approving every pack (listing, site, outreach, social) in one weekly
   approval sitting of 30–45 minutes (`ref/be-marketing-RESEARCH.md:148`; `ref/be-marketing-README.md:404`; both
   are copies of the business-ecosystem `docs/marketing/` files in the session scratchpad). Social takes at most a
   third, so ≤10–15 minutes a week on average after S2. One batch sitting of about 20 minutes may approve up to 4
   posts, which then go out through LinkedIn's own scheduler, never a third-party tool.
6. **G1 runs again on publish day**, including scheduled posts. If a row expired after approval, the owner unschedules the
   post.
7. **Comments** are answered with `replies.md` inside the same weekly minutes. Anything that needs more than a few
   minutes moves to email.
8. **Corrections** go out within 7 days whatever the cadence (PROPOSAL: outside the ceiling, the owner decides).

---

## Part A: before G0 (now to G0)

**0 posts in this whole period.** Stages S0 and S1 allow accounts, names, avatars, banners and bios that use only
rp-maker and rp-on-app-store (STRATEGY §2, §6.1).

| When | Stage | Posts | The owner's word and hand | The owner's time | Agents (no outward act) |
|---|---|---|---|---|---|
| Week of Mon 9 Nov 2026, the weekly approval sitting | S0 | 0 | **Words** (STRATEGY §13 steps 1–4): who owns Instagram `@rewardspro.io`, TikTok `@rewardspro`, the GitHub org `RewardsPro` and X `@RewardsPro`; yes, no or edits on the channel roles, the handle `rewardsproapp`, Bluesky `@rewardspro.io` and the S0 texts; the PPA question; the DNS TXT and DMARC records named in step 4, the form of G0, and where `marketing/` moves before B5. Optionally D7 (posting before the site is fixed) or the proposed D13 (one claim-light hello before S2, `launch-posts.md` §1.2); default no for both. | about 25 min | Claims rows (step 5); banners, the profile pack, card templates and shot lists (step 6); checker rules and the S0 review pack (step 7); further drafts (step 8) |
| The next one or two weeks, one or two sittings | S0 → S1 | 0 | **Hand:** clean the listing (step 9, about 30 min; **this makes S1**); test contact@ from an outside address (step 10, 2 min); create the accounts with S0 bios, no link and no post (step 11, about 45 min); DNS, after the step-4 word (step 12, about 10 min) | about 1 h 30 m once | Record S1's date in the workflow notes; prepare the #130 rewrite against the rebuild |
| Weekly until G0 | S1 | 0 | Optional: help on Shopify Community's open boards in his own words, naming no app (`community-rules.md` §2.2). This counts in outreach hours, not social. | 0 for social | ME-1 legitimacy check, monthly and read-only |
| The G0 sitting, 60–90 min | G0 | 0 | **Hand** (step 13): approve the admin-name fix; record B2 step 6 and B3, with the release name and date; run B4 into `gates.md`, or a production test order plus refund; capture the G0 shot list and V1 in the same sitting. **This makes G0.** | 60–90 min, product time | Prepare the capture checklist: @example.com buyers, the admin name cropped or fixed, and draft orders marked as paid, never orders Shopify flags as test orders (they earn nothing, `app/lib/record-order.server.ts:66`) |

Texts usable in this period are the profile texts only (R0, T0, A0, YT0 and TK0, plus AI0 if chosen, in `../profiles.json`; the Community bio is the owner's own words, `../profiles.md` §4.3), once rp-maker and
rp-on-app-store are `verified`. H0-LI (`launch-posts.md` §1.3) is used only if the owner waives each unmet S2 condition
(the proposed D13), never on D7 alone, and then not before S1.

---

## Part B: the six weeks after G0

**Week 1 starts on the Monday after G0 is recorded.** Week 1's posts need S2. Between G0 and S2, the owner also has to
replace the listing screenshots (step 15), merge and deploy the site rewrite (step 16) and close the
first-real-merchant steps (step 17). **If S2 doesn't hold by a slot's day, that slot is empty and nothing moves
later to catch up.** The rows below then simply start in the first week S2 holds.

The day numbers count from M1 to show the 30-day rule. Day 1 is the day of the S2 sitting, when the owner posts and pins
M1 by hand; L-C2 is on day 17 and CAR1 on day 36. No 30-day window holds more than 2 posts (windows 1–30 and 17–46
each hold two; the earliest third post is day 31).

| Week | LinkedIn Page | YouTube | X, Bluesky | The owner (slot and time) | Agents |
|---|---|---|---|---|---|
| **1** | **M1**, pinned, day 1, with V1 or the A6 card (`launch-posts.md` §2.1) | **V1** upload (`../video-walkthrough.md` §7) after the channel is verified; the listing's video slot only if the owner wants (D-video-2) | Swap R0 → R1 (profiles.json). No post. | The S2 sitting, about 25 min once (step 19): approve M1; swap T1, L1, R1, **YT0 → YT1** and, if used, CB → CB1, with UTM links; post and pin M1; phone-verify the YouTube channel (so the description link is clickable and a custom thumbnail can be set), then upload V1 | Step 14: the claims maker verifies what G0 supports, with a second session. Step 18: the M1 pack (text, media, alt text, claim ids, gate report, "valid until"). G1 on publish day. Build the batch pack for weeks 3 and 6. |
| **2** | none | none | none | The weekly sitting, ≤20 min: approve the batch (L-C2 and CAR1). Schedule L-C2 natively. Whether LinkedIn's scheduler takes document posts is [U]; if not, the owner posts CAR1 by hand on day 36 (about 2 min). | Re-check the sh-* rows that L-C2 and CAR1 use. Put each post's "valid until" date in its pack. |
| **3** | **L-C2**, Shopify's store-credit limits, day 17 (`launch-posts.md` §2.3) | none | none | about 2–5 min: comments | G1 on publish day, sh-* checked ≤30 days ago |
| **4** | none | none | none | about 3 min: ME-4 (LinkedIn native analytics), plus comments | ME-1, monthly and read-only; a one-page digest of expiring claims and stale surfaces |
| **5** | none (the earliest next day under the 30-day rule is day 31) | none | none | comments only | Re-check the sh-* rows on CAR1 pages 7 and 8 |
| **6** | **CAR1**, "How it works" carousel, day 36 (`launch-posts.md` §2.2) | none | none | comments only, or about 2 min to post CAR1 by hand | G1 on publish day. Prepare the week-8 Community check. |

**Posts in the six weeks: at most 3 on LinkedIn and 1 video**, and fewer if a slot's claims aren't ready.

**The owner's social time in these weeks:** about 25 + 20 + 5 + 8 + 2 + 4 minutes, an average of about 11 minutes a week,
inside the ≤10–15 the strategy allows.

### What a slot falls back to

If a planned post can't run, nothing else is pulled in to fill its slot. The next post is simply whichever
candidate below has its claims verified when a milestone happens, still inside the 30-day rule:

| Candidate | Needs |
|---|---|
| E2, what "free" means | rp-free, rp-merchant-funds, sh-sc-fee, and rp-store-credit's G0 observation, because rp-merchant-funds states the store-credit mechanism (`launch-posts.md` §1.1); the rate clause needs its row |
| E1, cashback maths | rp-cashback-base, and the example row (rp-cashback-example) |
| E6, refunds | rp-refund-takeback, and the example row (rp-refund-example) |
| E9, setup in three steps | rp-setup-steps |
| E4, no email of our own | rp-no-own-email, with its guard test |
| E10, the widget | rp-widget: B3 is recorded; gate C at 390 px, in Light and on a product page, is still open |
| E7, tiers by spend | rp-vip-tiers, rp-tier-window |
| E3, E5, E8, E11 | their rows (see the `launch-posts.md` §3 table); E11 also needs rp-contact-delivers |

### After week 6

- **Weeks 7 to 12:** 0–2 LinkedIn posts in any 30 days, from the candidates above, milestones only. A second video
  (E12) only if H2 holds.
- **Week 8 after the first S2 post:** if the owner's Community time has produced no merchant conversation, that time moves
  to outreach (STRATEGY §10).
- **Week 12:** keep LinkedIn posting if at least 1 conversation or install traces to it, or at least 2 interviewees
  cite LinkedIn or the video as a reason to trust or install, or the owner values it for legitimacy. Otherwise it goes to
  profile-only, with no posts (STRATEGY §10).
- **S3** (design partners) adds M2 and the partner reply (`replies.md` R-PARTNER), and only after the owner answers the PPA
  question and approves the partner terms. It doesn't raise the post ceiling.

---

## The owner's slots at a glance

| Slot | When | Length | What |
|---|---|---|---|
| Decisions | the first weekly sitting | about 25 min | D1–D4, plus D7 or the proposed D13 if he wants (Part A) |
| Set-up | one or two sittings, S0 → S1 | about 1 h 30 m once | listing clean-up, contact test, accounts, DNS |
| G0 | one sitting | 60–90 min | product checks and captures |
| M1 | the S2 week, one sitting | about 25 min once | approve; swap T1, L1, R1, YT1; post and pin M1; verify the YouTube channel; upload V1 |
| Batch | when milestones pile up | ≤20 min, up to 4 posts | approve and schedule natively (document posts by hand if the scheduler can't take them [U]) |
| Monthly | once a month | about 8 min | ME-4 (LinkedIn, about 3 min) and ME-3 (Partner Dashboard, about 5 min) |
| Comments | as they come | inside the weekly minutes | `replies.md` |
