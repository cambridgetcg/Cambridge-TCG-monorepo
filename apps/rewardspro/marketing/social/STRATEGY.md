# RewardsPro social and marketing kit: the strategy

Agents' proposal for the owner, 2026-11-07. **Nothing is decided.** Nothing was posted, signed up for, logged in to,
deployed or committed. The owner's word today ("review and set up social media and marketing kit") lifts the
2026-10-20 "no social accounts yet" line. Every other rule from that design still holds: the claims ledger,
gates G0–G6, "only the owner publishes, sends or spends", the honest-by-design promise and the R1 commerce voice.

Labels: **[V]** verified (file:line or URL plus date). **[I]** inferred. **[U]** unknown. **HYPOTHESIS**
means something to test in the ~5 merchant interviews. **PROPOSAL** means wording or a choice for the owner. Code
paths are in the read-only checkout of origin/main 6f3a57b6, relative to `apps/rewards/` unless marked.

**Superseded in places (completeness check, 2026-11-07).** The makers revised parts of this proposal later the
same day, in their own files. Where they differ from this file, theirs are current:
- **§3.2 profile texts:** [profiles.md](profiles.md) and `profiles.json`. R0 no longer says "Reserved name"; A0 ends
  "Nothing is posted here yet."; CB is dropped (the Community bio is the owner's own words); T1 drops "Free app" (T1F keeps
  it for D4); L1 is reworded; TK0, AI0, T1F, MK1 and YT1 are added.
- **§6.3 claim sentences:** `../claims.toml` and [claims-map.md](claims-map.md) (36 rows, all `proposed`). rp-free,
  rp-on-app-store (no "on the Shopify App Store", so that phrase is no longer a §4 "word to use" in social),
  rp-tier-window, rp-setup-steps and rp-widget are narrowed; rp-review-ask no longer says "once", so C3 changes;
  rp-tier-lock's locator is `app.customers.$id.tsx:158-184`.
- **§6.2 held drafts (M1, C1–C4):** [content/launch-posts.md](content/launch-posts.md).
- **§7 A2–A9:** [assets/README.md](assets/README.md). There are three banner grounds now (neutral 950 `#1B1D1F`,
  `#09110F`, navy), and the A6–A8 card wording changed.
- **§13 step 9:** [shot-list.md](shot-list.md) §5 finds listing screenshot #2 false too and replaces all three.
- **§1.1:** the switch record (`docs/switch.md:64-90` at 6bd092cb) now records B2 step 6 (test order #1010) and B3
  (release rewardspromembership-217); G0 still lacks a production refund. On the 2027-01-16 date, see
  [listing-delta.md](listing-delta.md): the B3 release with the 2026-10 webhook subscriptions must land before it,
  and removing the routes follows.
- **§15:** further decisions are named elsewhere: D13 (content/launch-posts.md §1.2), D-maker (entity-card.md §8),
  D-video-1 to D-video-4 (video-walkthrough.md §11) and D-shots-1 to D-shots-5 (shot-list.md). SETUP.md Phase 8
  indexes them.

---

## Summary

1. **Social is the third ring.** Merchants decide on the App Store listing, then check rewardspro.io, and both say false things today. The owner's own order (approved 2026-11-04) is "the App Store listing, then rewardspro.io, then social posts". This plan keeps that order.
2. **Now we only reserve names.** The owner creates four accounts (a LinkedIn Page, YouTube, X and Bluesky). Each gets the mark, a banner with only the name, and a "reserved" bio that makes no product claim. No links and no posts.
3. **Also now, the owner cleans the listing.** He deletes the tier-product lines and the Memberships tags, swaps out the gmail and tier-product screenshots, removes the old video and trims the data request. Removing a false claim needs no new evidence.
4. **Posting starts only at stage S2.** That needs all of: G0 and B3 recorded; the listing fixed; rewardspro.io rewritten with true privacy, terms and subprocessors pages; the first-real-merchant steps done or accepted by the owner in writing; and every claim in the post verified. Every post counts as an invitation to install.
5. **One feed is active: LinkedIn, and it posts only milestones (0–2 a month).** YouTube holds 1–3 real recordings. X and Bluesky (`@rewardspro.io`) have a bio that points elsewhere and never post.
6. **The handle is `rewardsproapp`** everywhere, with the domain handle on Bluesky. The display name is exactly "RewardsPro". "Shopify" never appears in a name, handle, URL slug or hashtag.
7. **The owner's time:** about 2 hours once, then ≤10–15 minutes a week on average after S2. That leaves most of the 45-minute weekly approval budget for the listing, the site and outreach.
8. **Outreach from social stays consent-first.** The Partner Program Agreement says "Do not email a Merchant without their prior consent." For email, the owner decided on 2026-11-07 ("Emailing business directly is fine."): the prospect list is now the outreach design's Lane B, built only at its W-gate (§9, last paragraph).
9. **Recurring cost is £0.** No paid badges, schedulers or ads. Posting does bring forward one product cost: point-in-time recovery (about $100 a month), or the owner's written acceptance of going without it.
10. **Positioning stays empty.** The pillars, the bios and the "free" wording are hypotheses or proposals until about five merchant interviews have happened.

---

## 1. Progress on 2026-11-07, and what blocks promotion

### 1.1 The app

- **Production runs the rebuild (`apps/rewards`)** [I, strong]. The switch (B2) ran on 2026-11-06: #147 (B1) merged at 14:21 UTC, and the current production deploy is 74a0be5a (#152). Today `/api/health` answers 200 `ok/ready` from lhr1, and two routes that exist only in the old app answer 404 (status notes §1). One phase-1 note (live, G26) still says production is the old app. The other notes give stronger evidence, and the claims maker records the answer before any S2 post.
- **B2 step 6 isn't recorded.** There is no production test order with credit seen in Shopify, and no cron or timing check results.
- **B3 (the trimmed Shopify release) is probably out but unrecorded.** The listing's data access shows exactly the rebuild's six scopes. Its release name, its date and its step-4 checks (gate C at 390 px, light and dark, Lighthouse) are unknown. B3 step 5 (removing the ignored webhook routes) is due before 2027-01-16.
- **B4 has no record** (`docs/gates.md` doesn't exist). B5 hasn't started.
- **G0 (`rp-shopify-deploy` passed) does not hold.** The 2026-11-05 staging run passed most checks, but on the staging app with a local database (`docs/staging-run.md:16-31`).
- **There are 0 reviews and 0 real merchants.** The 11 installs are 4 of our own dev stores and 7 frozen or closed stores (`docs/switch.md:79-84`).

### 1.2 The public surfaces

- **App Store listing:** the new free copy and the right spelling are live, but it still says "you can sell a tier as a product" (details, Feature 3, meta description, Memberships tags). The rebuild has no tier products. All three screenshots show the old admin: #1 shows a gmail.com test address, and #3 shows tier products "as recurring subscriptions". The video (on @CambridgeTCG) says "INSTANT CASHBACK" with $ coins and hearts. The listing also asks for phone, address and device data the app doesn't read.
- **rewardspro.io:** it still has the retired copy. It spells the name "Rewards Pro" 10 times, has the footer "Love is the design.", has no install path and no og:image, and offers raffles, points and WooCommerce. Its privacy page describes AWS Sweden, Bedrock and SendGrid; the database has been on Supabase London since 13 October. `/terms/` and `/subprocessors/` return 404.
- **docs.rewardspro.io:** the old paid app, a `support@` address, "within seconds" and "instantly".
- **DNS:** two apex TXT records carry KINGDOM wording, and there are two DMARC records.
- **Claims ledger:** 3 rows, all `proposed`, citing old-app paths. So G1 blocks every factual sentence.
- **Accounts that already use the name, owners unknown:** Instagram `@rewardspro.io` (bio "…Predictable MRR – Rewards Pro…"), TikTok `@rewardspro` (empty, created 2026-10-28), the GitHub org `RewardsPro` (empty) and X `@RewardsPro` ("Pro Rewards"). YouTube `@RewardsPro` is an unrelated Portuguese game-cheat channel.
- **Open PRs:** #83 (the kit) is CONFLICTING on a script that no longer matters. #130 and #131 were written against the old app. #142 (the design) is waiting only for a merge.

### 1.3 What blocks public promotion, hardest first

1. G0 isn't recorded: no production test order plus refund, and no `gates.md`.
2. B3 isn't recorded, so we can't say which widget buyers see.
3. The listing has false text and false images. Any traffic we send amplifies them.
4. The privacy policy the listing links to describes the old stack, and there are no merchant terms.
5. rewardspro.io carries retired copy, the banned spelling and KINGDOM wording.
6. The claims ledger has no verified row.
7. The steps needed before the first real merchant are open: PITR plus a rehearsed restore, the Sentry Crons decision, the data-request email decision and cancelling the 2 frozen charges.
8. The kernel, and with it this kit, sits in `apps/rewardspro/`, which B5 deletes. The owner picks its new home before B5.

---

## 2. The stages

These sit on top of G0–G6. Each condition is a single fact someone can check.

| Stage | Holds when (all of these) | Allows |
|---|---|---|
| **S0 Reserve** (now) | The owner says yes to the handle plan and the S0 texts. `rp-maker` and `rp-on-app-store` are `verified`. | Accounts, display name, avatar, a banner with only the name, the S0 bios. **No link, no posts**, and no contact address until the contact check passes. |
| **S1 Listing clean** | The listing has no false text or image: the tier-product lines, the Memberships and Membership perks tags, screenshots #1 and #3, and the old video are gone, and the protected-data request is trimmed. | The owner's optional Shopify Community help on the open boards, in his own words, naming no app. Still no profile links and no posts. |
| **S2 Open** | (a) G0 as the owner defines it (B4 `gates.md`, or a production test order plus refund, recorded). (b) B3 recorded (`rp-live-release`). (c) The listing is fully fixed: real 1600×900 screenshots with @example.com buyers, and the video replaced or removed. (d) rewardspro.io is rewritten and deployed, with privacy, terms and subprocessors true for the rebuild, no banned spelling and no KINGDOM wording. (e) The first-real-merchant steps are done, or the owner accepts their absence in writing. (f) contact@rewardspro.io is shown to deliver. (g) Every claim the post or bio uses is `verified` and unexpired. | The S2 bios with a link to rewardspro.io, milestone posts, the first YouTube recording, and disclosed Ask & Offer replies. |
| **S3 Partners** | S2 holds, the owner has answered the Partner Program Agreement email question (§9), the partner terms (`rp-design-partner-offer`) are approved, and one DMARC record is left. | The design-partner call (M2) and the consent-first outreach doors. |

If the owner ever wants posts before rewardspro.io is fixed, that needs his explicit word. By default it doesn't happen.

---

## 3. Channels

| Platform | Role | Handle (fallbacks) | Why | The owner's setup steps |
|---|---|---|---|---|
| **App Store listing** | Primary surface (not social) | apps.shopify.com/rewards-pro | Merchants decide here. Outside traffic lifts its ranking. Merchants try an unknown free app when the listing "shows the app working" (Community thread /t/675500, 2026-09-02, one merchant). It is false today. | Partner Dashboard: delete the false text, swap screenshots #1 and #3, remove the video, trim protected data (S1). Full screenshot set after G0 (S2). |
| **rewardspro.io** | Primary surface (owned) | rewardspro.io, with a `/changes` page in the rewrite | It's the second place anyone checks. It holds the dated record of what changed, and corrections. It's updated only inside deploys the owner is already doing for the listing or landing. | Read, merge and deploy the #130 rewrite (agents redo it against the rebuild). |
| **LinkedIn Page** | **Primary social: the only active feed** | "RewardsPro", `linkedin.com/company/rewardsproapp` (`rewardspro` if the form offers it and the owner prefers; `rewardspro-io`) | It ties the app to a real UK company and a website, and offers verification with no stated fee. Smile (12,154 followers) and Joy (593, changelog-style, about 3 posts a week) post there. It has native scheduling. Whether merchants check LinkedIn is unknown: a HYPOTHESIS, tested by ME-2. | From the owner's personal account, on desktop: Create a Page → Company. Name "RewardsPro". Leave the website empty (if the form insists on one, wait until S2). Pick the true company size. Logo `kit/social/avatar-400.png`, cover 1512×256, tagline T0, About A0. 2FA. Decide whether his personal profile lists RewardsPro. |
| **YouTube** | Secondary: hosts 1–3 videos, with no feed | `@rewardsproapp` (`@rewardspro_io`, `@getrewardspro`) | The listing's video slot is a YouTube embed. Merchants want to see the app working. `@RewardsPro` is a cheat channel, and the current video sits on @CambridgeTCG. | Create the channel as a Brand Account named "RewardsPro" with handle `@rewardsproapp`. Avatar 1024, banner 2560×1440, description YT0. No uploads until S2. |
| **Shopify Community** | Secondary, optional, the owner's own words | The owner's own username (no brand account) | It's the one place merchants are seen asking for loyalty apps (threads with 327 and 246 views). App talk is allowed only on Ask & Offer, with disclosure. AI-written or templated posts are removed, and contact details go in the bio only. | From S1: profile bio CB. On the open boards, help without naming any app. From S2: disclosed Ask & Offer replies when a request fits. Agents never write anything shaped like a reply. |
| **Bluesky** | Reserve only (pointer bio) | `@rewardspro.io`, created first as `rewardsproapp.bsky.social` | A domain handle proves we control the domain, for free. There's no evidence of merchants there. | Sign up, display name "RewardsPro", avatar, 1500×500 banner (≤1 MB), bio R0. After removing the KINGDOM TXT records: Settings → Account → Handle → "I have my own domain" → `rewardspro.io`; add a TXT record `_atproto` = `did=did:plc:…` in Cloudflare; press Verify. |
| **X** | Reserve only (pointer bio) | `@rewardsproapp` (`@rewardspro_io`, `@getrewardspro`) | `@RewardsPro` is someone else's, and X doesn't release inactive names. No merchant evidence. Reserving stops a lookalike. | Sign up with a non-public alias. Name "RewardsPro", avatar 400, header 1500×500, bio R0. DMs off, no website. The birth date X asks for is the operator's: set it to "only you". |
| **Instagram** (Threads follows it) | Reserve only if `@rewardspro.io` is the owner's; otherwise skip | `@rewardspro.io` if his (optionally `@rewardsproapp` to hold the name) | A consumer platform; collector content belongs to Cambridge TCG. The existing account shows banned spellings and retired MRR copy. | If it's his: change the name to "RewardsPro" and the bio to R0, and archive the 2 old posts, or deactivate it. If not: note it as a lookalike. |
| **TikTok** | Skip, unless `@rewardspro` is the owner's | `@rewardspro` only if his | No evidence of B2B app discovery there. | If it's his: bio R0 and leave it dormant. |
| **Facebook** | Skip | — | Needs a personal profile as admin. One founder reports merchant groups were "mostly silence" plus offers of paid reviews. | — |
| **Reddit** | Skip | — | r/shopify Rule 8 bans app-developer posts; r/ecommerce and r/smallbusiness are similar. | — |
| **Mastodon** | Skip | — | Most instances ban promotion. No merchant evidence. | — |
| **Product Hunt** | Skip (revisit after ≥5 genuine reviews) | — | Its audience is makers, and it needs a personal account. | — |
| **GitHub** | Skip, and **never linked** | — | The monorepo is public and holds KINGDOM and personal material (SOPHIA.md at the root, 308 Markdown files mentioning "kingdom", switch.md naming the owner on 80 lines). | Say whether the `RewardsPro` org is his. |
| **Newsletter / email** | Skip | — | The email gate applies, DMARC is duplicated, and the PPA email clause applies. | — |
| **Podcasts** (The Shopify App Show, Shopifreaks) | Later, the owner's act | — | Plausible earned media, but a pitch is outreach. Not before S3 and some genuine use. | — |

### 3.1 Naming rules

- **Display name** is exactly `RewardsPro`, with no suffix. A name is branding, and PPA 5.3 bans Shopify marks in "business name, logo, branding, advertising, social media or domain name (including … page URLs)" [V, shopify.com/partners/terms, read 2026-11-07, ppa.txt:453]. "Shopify" appears only to say what the app works with (Part C s.3, ppa.txt:718).
- **Never put these in a handle, name, URL slug (`/changes/…`, UTM values) or hashtag:** "shopify", "shopi", "official", "app store", "hq". Default: no hashtags at all.
- **Account hygiene (the owner's hand):** 2FA everywhere, with recovery codes in the Keychain. Sign up with a non-public alias. DMs closed where the platform allows. Agents never hold or use these logins.
- **Lookalikes** (the cheat channel, Somfy Rewards Pro, a gift-card cash-out app, prorewards.io): we answer with consistency, not reports. No trade-mark search has been done [U].

### 3.2 Profile texts (PROPOSAL; characters counted; brackets are claim ids and don't get pasted)

**S0, usable now.** These make no product claim beyond who makes it and that it's an app for Shopify stores.

| Id | Text | Chars | Where | Claims |
|---|---|---|---|---|
| R0 | Reserved name for RewardsPro, an app for Shopify stores made by Cambridge TCG Limited, London. Nothing is posted here. | 118 | X, Bluesky, YouTube About, Instagram/TikTok if the owner's | rp-maker, rp-on-app-store |
| T0 | An app for Shopify stores, made by Cambridge TCG Limited, London. | 65 | LinkedIn tagline | rp-maker, rp-on-app-store |
| A0 | RewardsPro is an app for Shopify stores, listed on the Shopify App Store. It is made by Cambridge TCG Limited, a UK company in London. We post here when the app changes, and not otherwise. | 188 | LinkedIn About | rp-maker, rp-on-app-store |
| YT0 | RewardsPro's channel, run by Cambridge TCG Limited, London. RewardsPro is an app for Shopify stores. Nothing is posted here yet. | 128 | YouTube description | rp-maker, rp-on-app-store |
| CB | I make RewardsPro, an app for Shopify stores (Cambridge TCG Limited, UK). | 73 | The owner's Community bio, from S1 | rp-maker |

Add "Questions: contact@rewardspro.io" to A0, YT0 and CB only after the owner has sent a test message from an outside address and seen it arrive. MX being Google Workspace doesn't prove the mailbox delivers.

**S2, after the named claims are verified.**

| Id | Text | Chars | Where |
|---|---|---|---|
| R1 | RewardsPro, an app for Shopify stores, made by Cambridge TCG Limited, London. We don't post here. Updates and contact: rewardspro.io | 132 | X, Bluesky (reserve accounts stay claim-light for good) |
| T1 | Cashback as Shopify store credit, with VIP tiers. Free app; you fund the cashback. | 82 | LinkedIn tagline [rp-store-credit, rp-vip-tiers, rp-free, rp-merchant-funds] |
| L1 | Text below | 1,082 | LinkedIn About |

L1:

> RewardsPro is an app for Shopify stores. When an order is paid, it adds cashback to the customer's Shopify store credit, at the rate of their tier [rp-paid-trigger, rp-store-credit]. You set tiers by spend, counted over the last 12 months or all time, and customers move between tiers as their spend changes [rp-vip-tiers, rp-tier-window]. A refund takes back its share of the cashback [rp-refund-takeback].
>
> Cashback is paid on the product price after discounts. Shipping, and anything paid with store credit or gift cards, earns nothing [rp-cashback-base].
>
> Customers spend store credit at checkout when signed in with Shopify's new customer accounts or with Shop Pay. Store credit isn't available for legacy customer accounts, and Shopify applies the full balance [sh-sc-signin-legacy, sh-sc-full].
>
> RewardsPro is free, with no paid plans. You fund the cashback you give. For stores created on or after 12 May 2025, Shopify charges its own third-party transaction fee on the part of an order paid with store credit [rp-free, rp-merchant-funds, sh-sc-fee].
>
> We post here when the app changes, and not otherwise. Posts are drafted with AI help and checked by a person before we post them [rp-ai-drafted].
>
> Made by Cambridge TCG Limited, London. Questions: contact@rewardspro.io [rp-maker]

Add a widget paragraph only once `rp-widget` is verified (B3 plus gate C). Don't soften it to fit earlier. Outcome words ("bring buyers back", "retention") stay out: they're hypotheses.

---

## 4. Voice guide (PROPOSAL; R1 commerce voice, UK English)

**Traits, each as "X but not Y":**
- **Plain, but not curt.** Short, whole sentences.
- **Specific, but not technical.** "When an order is paid", not "on the orders/paid webhook".
- **Dated, but not breathless.** "Checked on 7 November 2026."
- **The limit beside the feature, not in a footnote.** "…not legacy customer accounts."
- **Mindful of the merchant's money, but not salesy.** It's their store credit, so we never imply cashback costs nothing.
- **Modest, but not apologetic.** We're new, we say so when it matters, and we don't plead.
- **Shows, but doesn't claim.** We show the screen, the sentence and the date. We never call ourselves honest or transparent.
- **The company "we", not a founder's "I".** The owner's own Community account is the one exception.
- **Calm, but not cold.** No exclamation marks, no emoji in bios, and at most one emoji in a post.
- **Corrects openly, without performing an apology.** "Correction, 9 December 2026: we said X. Y is true."

**Words to use:** cashback; store credit; Shopify store credit; tier(s), and "VIP tiers" in bios (the category word); spend; paid order; refund; takes back; widget; theme editor; signed-in customers; guests; base rate; new customer accounts; Shop Pay; free app; no paid plans; you fund the cashback; Cambridge TCG Limited; for Shopify stores; on the Shopify App Store; test store; checked on <date>. Name UI with the app's own labels: Home, Customers, Tiers, Orders, Settings, "needs a look", "Lock to a tier".

**Words to avoid:** points; members, membership(s); loyalty platform or engine; "loyalty program"; instant, instantly, real-time; seamless, effortless, set and forget, in minutes; boost, skyrocket, unlock, supercharge, game-changer, journey, delight; grow revenue, ROI, retention lift, uplift, MRR; unlimited; the internal words retired, relaunch, B3, gates, rulings, staging, PR numbers and schema names; love, kingdom, citizen, seat, or anything liturgical.

**Never say** (G1 or G4 blocks these; the checker runs them mechanically where it can):
1. "Free forever", "always free", "free trial", "no fees", "no transaction fees", "costs nothing". Shopify's fee and the merchant-funded credit make these false or unproven (CAP 3.23–3.26). Being free-only was an agents' reversible call.
2. "Free" in any field that doesn't also contain "you fund the cashback". Where the field allows 300 characters or more, it also carries Shopify's fee sentence.
3. "Only", "first", "best", "#1", "leading", "most". No named competitors and no comparisons (CAP 3.32–3.43, BPR 2008 reg 4). Koin and Casa are free too.
4. "Instant", "within seconds", "real-time". Production timing hasn't been observed.
5. "Set up in minutes", "no theme changes", "doesn't slow your store", "lightweight" as a speed claim, "never pays twice".
6. The held claims: "works with POS", multi-currency, "your data stays in the UK", "data in London", "GDPR compliant", "12 months of past orders count", "guests don't earn" (§6.4).
7. "Works with legacy accounts", "spend anywhere", other platforms (WooCommerce, Stripe, a headless API), "multilingual".
8. Points, raffles, mystery boxes, missions, memberships, tier products, subscriptions, email campaigns, Klaviyo, "AI-powered". These are old features, and the chance-word rule blocks them.
9. Numbers that aren't in the ledger: counts of stores, reviews or credit issued, ratings, uplift, ROI.
10. Testimonials, quotes, merchant names or logos without a consent record. Never pose as a merchant ("has anyone tried RewardsPro?", CAP 2.3).
11. "Official", "Shopify-approved", "Built for Shopify" (not earned), any Shopify Partner tier. No Shopify logo except the unaltered App Store badge.
12. Urgency: deadlines, "spots left", "limited places", countdowns.
13. "Honest", "transparent", "trustworthy" as self-description, or any seal or tick (CAP 3.52).
14. Personal details about the owner or his relationships. No link to KINGDOM sites, github.com/cambridgetcg/* or docs.rewardspro.io.
15. Service promises with no evidence behind them: "24/7", "replies within 24 hours".
16. That Shopify can't do something, unless a Shopify help page says so. No tax, VAT, accounting or legal advice.
17. The banned spellings "Rewards Pro", "Rewardspro", "Rewards-Pro", "RewardPro" (the domain and slug stay lowercase).

**On the owner's personal profiles** (only if he chooses to post about RewardsPro): the first words make the interest plain, for example "Ad · I make RewardsPro, an app for Shopify stores." (ASA ruling on TALA; CAP 2.1). By default he doesn't post about it.

---

## 5. Content pillars (all HYPOTHESES)

There is room for few posts, so the pillars filter what may be posted. They aren't a calendar.

| Pillar | What a post looks like | Claims | Interview test | Kill signal |
|---|---|---|---|---|
| **H1 What changed** | Changelog form: what was missing or wrong, what changed, where to see it. Fires only when a merchant-visible change ships or a claim becomes verified. | The claim that changed | "When you look at an app's company page, do you read its updates? What would make one useful?" | Interviewees never read vendor updates. |
| **H2 Shown working** | A 60–90 s real screen recording, or 1–4 real screenshots of one step: a paid order, credit in Shopify, the widget, a refund taking back its share. | rp-paid-trigger, rp-store-credit, rp-refund-takeback, rp-widget, rp-setup-steps | "Before installing an app from a developer you didn't know, what did you need to see?" | The listing alone settles it, so the video lives on the listing only. |
| **H3 The rules, exactly** | One rule with a worked £ example, or one Shopify store-credit limit with its link and the date checked. Only facts that bear on how RewardsPro's cashback behaves. | rp-cashback-base, sh-* rows | "Did you know the store-credit fee and the customer-accounts rule before today? Would you want an app maker to tell you?" | Merchants already know, or find it off-putting. |
| **H4 Who makes it** | The maker line, the company, London, one contact address. | rp-maker | "Does it matter who's behind an app? Would you install a loyalty app made by another card shop? What would you want to know about the data it holds?" | No one cares, or a card-shop maker reads as a conflict (then never say it). |

Add these questions to the interview guide too:
- "Before you replied or installed, did you look us up? Where? What did you see?"
- "Where do you find tools for your shop?"
- "Does 'free app; you fund the cashback' read clearly?"

Until the interviews: no card-shop or TCG framing, no outcome lines, and nothing implying we run a Shopify card shop. Cambridge TCG sells on eBay and Cardmarket only (design README, the owner 2026-10-20).

**Corrections are a rule, not a pillar.** If a published sentence proves wrong, a new dated "Correction:" post goes on the same channel within 7 days, the note is appended on `/changes` and in the ledger's `correction_url`, and nothing is silently edited (typos excepted).

---

## 6. What is postable when, tied to claim ids

### 6.1 The table

| Item | S0 now | S1 | S2 | S3 | Claim ids |
|---|---|---|---|---|---|
| Accounts, name, avatar, banner with name only | ✓ | ✓ | ✓ | ✓ | none |
| Bios R0, T0, A0, YT0 | ✓ once both rows are verified | ✓ | replaced | — | rp-maker, rp-on-app-store |
| Contact address in a profile | after the contact check | same | ✓ | ✓ | — |
| The owner's Community help on open boards (no app named) | ✗ | ✓ optional | ✓ | ✓ | rp-maker (bio CB) |
| Profile website link | ✗ | ✗ (the listing still links a false privacy page) | ✓ rewardspro.io, with UTM tags | ✓ | — |
| T1, L1, R1 | ✗ | ✗ | ✓ | ✓ | as tagged in §3.2 |
| M1 "the current version is live" | ✗ | ✗ | ✓ | ✓ | rp-live-release, rp-paid-trigger, rp-store-credit, rp-vip-tiers, rp-tier-window, rp-refund-takeback, rp-free, rp-merchant-funds, sh-sc-fee |
| C1 cashback maths card | ✗ | ✗ | ✓ | ✓ | rp-cashback-base |
| C2 where store credit can be spent | ✗ | ✗ | ✓ if the sh-* rows were checked ≤30 days ago | ✓ | sh-sc-signin-legacy, sh-sc-channels, sh-sc-full |
| C3 how we ask for a review | ✗ | ✗ | ✓ | ✓ | rp-review-ask |
| C4 no email of our own | ✗ | ✗ | ✓ with its guard test | ✓ | rp-no-own-email |
| Widget posts, screenshots or video | ✗ | ✗ | ✓ after B3 plus gate C | ✓ | rp-widget |
| Video V1 on YouTube, LinkedIn and the listing | ✗ | ✗ | ✓ | ✓ | rp-paid-trigger, rp-store-credit, rp-refund-takeback |
| Disclosed Ask & Offer replies | ✗ | ✗ | ✓ | ✓ | rp-maker, rp-free, rp-merchant-funds |
| M2 design-partner call, outreach doors | ✗ | ✗ | ✗ | ✓ | rp-design-partner-offer, rp-free, rp-merchant-funds |
| `kit/web/og.jpg` as a link card | ✗ | ✗ | only after a kit rebuild (§7, A5) | — | rp-store-credit, rp-vip-tiers, rp-free, rp-merchant-funds |

### 6.2 The first held drafts (PROPOSALS; none can be published today)

- **M1** (S2; LinkedIn; 430 characters). Add one real screenshot or V1, and the link with UTM tags, then pin it:
  > The current version of RewardsPro is live. When an order is paid, it adds cashback to the customer's Shopify store credit at their tier's rate. Tiers count spend over the last 12 months or all time. A refund takes back its share. Free app, no paid plans; you fund the cashback you give. For stores created on or after 12 May 2025, Shopify charges its own third-party transaction fee on the part of an order paid with store credit.
- **C1** (S2): "Cashback in RewardsPro is paid on the product price after discounts. Shipping, and anything paid with store credit or gift cards, earns nothing. Example from our test store, prices including VAT: £600 of products, £60 off, £10 shipping. Cashback is worked out on £540; at 5%, that is £27.00." The example is staging check B (`docs/staging-run.md:23`). The claims maker decides whether a production observation is also needed. Tax-exclusive prices haven't been tested, so don't mention them.
- **C2** (S2): "RewardsPro pays cashback as Shopify store credit, so Shopify's rules decide where customers can spend it: signed in with new customer accounts or Shop Pay, not legacy accounts; not on draft or edited orders; and the full balance applies." POS is left out on purpose: whether POS orders earn hasn't been observed.
- **C3** (S2): "How RewardsPro asks for a review: once, after your store's third cashback entry and at least seven days with the app. You can dismiss it. Nothing is offered for a review."
- **C4** (S2): "RewardsPro sends no email. One setting, off by default, asks Shopify to send its own email when a customer earns store credit."
- **M2** (S3; ~450 characters): "We're looking for a few UK Shopify shops to set up RewardsPro with us on a call. It's free, as it is for everyone, and we'd ask for two short feedback calls in the first six weeks. Our help never depends on a review. You fund the cashback your customers earn. For stores created on or after 12 May 2025, Shopify charges its own third-party transaction fee on the part of an order paid with store credit. If that suits you, email contact@rewardspro.io." No deadline and no place count. Narrowing it to card and collectibles shops is a targeting HYPOTHESIS and the owner's call.

### 6.3 Claim ids (for the claims maker, who alone edits `claims.toml`)

All rows start as `proposed`. A row becomes `verified` only after its evidence check and a second session's concurrence. Each row carries `commercial_interest = "We make RewardsPro."`, the channels `social-profile` and/or `social-post`, and a `review_after` date. The **sh-*** rows each need:
- a raw re-fetch of the help page, with its sha256 stored;
- a verbatim-or-paraphrase flag;
- a 30-day `review_after`;
- a second session's agreement;
- a re-check before each use.

| id | Sentence | Evidence | Needs a dev-store or production observation |
|---|---|---|---|
| rp-maker | RewardsPro is made by Cambridge TCG Limited, London, UK. | Listing developer block, https://apps.shopify.com/rewards-pro (2026-11-07). The rebuild has no maker string (`/usr/bin/grep` "Cambridge TCG" in apps/rewards = 0). | no |
| rp-on-app-store | RewardsPro is an app for Shopify stores, on the Shopify App Store. | https://apps.shopify.com/rewards-pro HTTP 200 (2026-11-07). Wording kept to PPA Part C s.3 (compatibility). | no |
| rp-live-release | The current version of RewardsPro is live for every store that installs it from the Shopify App Store. | **Missing:** a B3 release record in `docs/switch.md` (steps at :203-215, no result) or `docs/gates.md` | yes |
| rp-store-credit | RewardsPro pays cashback as Shopify store credit. | `app/shopify/store-credit-rail.server.ts:300-307`; `app/lib/record-order.server.ts:225-236`; `docs/staging-run.md:23` (check B) | yes |
| rp-paid-trigger | Cashback is added when an order is paid; it doesn't wait for the order to be fulfilled. | `app/routes/webhooks.orders.paid.tsx:1-13`; `app/lib/record-order.server.ts:235` (`nextAttemptAt: now`); `app/routes/webhooks.orders.fulfilled.tsx:1-6` | yes |
| rp-vip-tiers | Set tiers by spend, each with its own cashback rate. Customers move between tiers as their spend changes. | `app/lib/tiers.server.ts:118-131, 221-261`; `app/routes/app.tiers.tsx`; `docs/staging-run.md` checks A and G | yes |
| rp-tier-window | Tiers count each customer's spend over the last 12 months or all time. | `app/admin/words.ts:34`; `prisma/schema.prisma:147` | yes |
| rp-cashback-base | Cashback is paid on the product price after discounts. Shipping, and anything paid with store credit or gift cards, earns nothing. | `app/routes/app.tiers.tsx:355-356` (the app's own sentence); `app/lib/order-facts.ts:50-60, 80-97`; `docs/staging-run.md` checks B and D | yes |
| rp-refund-takeback | A refund takes back its share of the cashback, from store credit the customer still holds. | `app/lib/refunds.server.ts:1-34`; `app/lib/payouts.server.ts:120-154`; `docs/staging-run.md` checks E and F | yes |
| rp-tier-lock | You can lock a customer to a tier. | `app/lib/tiers.server.ts:275`; `app/routes/app.customers.$id.tsx:165-170` | yes |
| rp-setup-steps | Setup is three steps: set a base cashback rate, switch cashback on, and turn on the widget in your theme editor. | `app/routes/app._index.tsx:363-432`; `app/admin/home-rules.ts:19-23` | yes |
| rp-widget | A widget you turn on in your theme editor shows signed-in customers their tier, cashback rate, store credit and progress; guests see your base rate and a sign-in prompt. | `extensions/rewards-widget/locales/en.default.json:2-15`; `extensions/rewards-widget/assets/rewards-widget.js:131` (member), `:163` (guest); `docs/staging-run.md` check C (laptop only) | yes (B3 plus gate C at 390 px, light and dark) |
| rp-no-own-email | RewardsPro sends no email. One setting, off by default, asks Shopify to send its own store-credit email. | `app/routes/app.settings._index.tsx:48-51`; `prisma/schema.prisma:148`; `app/shopify/store-credit-rail.server.ts:307` (`notify`). Needs a guard test that fails if a mail library appears. | no |
| rp-review-ask | RewardsPro asks for a review once, after three cashback entries and seven days, and you can dismiss it. Nothing is offered for a review. | `app/lib/stats.server.ts:224-245`; `app/routes/app._index.tsx:511-525`; "incentiv" grep = 0 | no |
| rp-free | RewardsPro is free. There are no paid plans. | No billing code: `/usr/bin/grep -rniE 'appSubscription\|billing\.\|recurringApplicationCharge\|appUsageRecord' app` = 0 (2026-11-07). Listing Pricing "Free" (2026-11-07). `docs/decisions/2026-10-20-rewardspro-free-only-relaunch.md` (repo root; an agents' reversible call). | no |
| rp-merchant-funds | The cashback is store credit in your own shop, so you fund the cashback you give. | `app/shopify/store-credit-rail.server.ts:306-307` (credit on the shop's own customer); https://help.shopify.com/en/manual/customers/store-credit | no |
| sh-sc-signin-legacy | Customers can spend store credit at checkout when signed in with Shopify's new customer accounts or with Shop Pay; it isn't available for legacy customer accounts. | https://help.shopify.com/en/manual/customers/store-credit (2026-11-07) | no |
| sh-sc-channels | Store credit can be spent on the online store, POS and Shop, but not on draft or edited orders. | same page | no |
| sh-sc-full | Shopify applies the full store-credit balance at checkout; customers can't choose part of it. | same page ("Only the full store credit amount can be applied … Customers can't select a partial amount.") | no |
| sh-sc-currency | At checkout, Shopify shows only the store-credit balance in the checkout's currency. | same page | no |
| sh-sc-cap | Shopify lets a store issue less than US$15,000 of store credit on a single customer account. | same page | no |
| sh-sc-fee | For Shopify stores created on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit. | same page, plus https://help.shopify.com/en/manual/your-account/manage-billing/billing-charges/types-of-charges/third-party-charges/third-party-transaction-fees (2026-11-07) | no |
| rp-ai-drafted | Posts here are drafted with AI help and checked by a person before we post them. | The review pack and approval record for each post, under `marketing/social/` (a process claim, true only while the workflow holds) | no |
| rp-design-partner-offer | We set RewardsPro up with a few UK shops on a call, free as for everyone, with two feedback calls in the first six weeks. Our help never depends on a review. | The partner-terms page the owner approves (not written yet) | no (the owner's word) |
| rp-shopify-deploy | (Internal, G0.) A production test order earned store credit and a refund took back its share, on <date>. | **Missing:** `docs/gates.md`, or the switch.md step 6.3 result | yes; never public |

### 6.4 Held, never in social until resolved

- **The 12-month import:** whether production has the `read_all_orders` grant is unknown (`app/shopify/bulk-import.server.ts:3-4, 36-39` falls back to 60 days).
- **Currency the buyer paid in** (`app/lib/money.ts:26`): gate N is open.
- **POS:** never observed.
- **"Data in London":** the Sentry region is unknown.
- **Erasure timing:** needs gate J and a real shop/redact.
- **"No shopper names stored":** landing and privacy pages only, not social, because it's too easy to overread.
- **The widget's 12 KB size:** never as a speed claim. Lighthouse hasn't been run.
- **"Guests don't earn":** the code skips orders with no customer attached (`app/lib/record-order.server.ts:92`). Whether a Shopify guest checkout carries a customer is **[U]** until a dev store shows it.
- **Naming the removed features** (points, raffles and so on): the owner's word. Repeating them would also need the chance-word rule amended. Default: don't.

---

## 7. Visual assets

**Rules:**
- Files go under `marketing/social/` only; `kit/` is never edited.
- Names follow `rewardspro_<campaign>_<asset>_<variant>_<WxH>_<yyyymmdd>_v<NN>.<ext>`, each with a `.meta.json` sidecar (ASSETS D3, `ai_involvement: none` for visuals).
- Colours come from `kit/colour`: white on navy `#1A3E5C` (11.13:1), or navy or `#1B1D1F` on white. Teal `#17BEBB` is for shapes only, never text on white (2.3:1); teal text is `#007C7A` (5.04:1).
- Type is Inter Regular and SemiBold (vectorcraft-cli bundles them).
- Text is composited, never generated. No AI imagery, no Shopify logo inside our art, no hearts or coins.
- Every image gets alt text of ≤1,000 characters. Screenshots and video come from a dev store with @example.com buyers, and the admin name reads "RewardsPro" or is cropped out (`shopify.app.toml:10` still says "Rewards Pro").

| # | Asset | Exact size and limits | Platforms | Exact text on the image | Safe before G0 |
|---|---|---|---|---|---|
| A1 | Avatar (exists: `kit/social/avatar-1024.png`, `avatar-400.png`) | 1024×1024 and 400×400, opaque, circle-safe | LinkedIn logo (400), X, Bluesky (≤1 MB), YouTube (shown at 98×98), Instagram/TikTok if kept | none (the R mark on the white tile) | **yes** |
| A2 | Header | 1500×500 PNG, ≤1 MB (Bluesky's cap; X allows 2 MB). Nothing in the top and bottom 60 px; the lower-left avatar zone kept clear. | X, Bluesky | "RewardsPro" (the reversed horizontal lockup on navy) | **yes** |
| A3 | LinkedIn cover | 1512×256 PNG (keep ≤3 MB [I]); key content centred, away from the edges and the lower right | LinkedIn | "RewardsPro" (lockup) | **yes** |
| A4 | YouTube banner | 2560×1440 PNG, ≤6 MB; everything inside the centred 1546×423 band (1235×338 at 2048×1152, scaled) | YouTube | "RewardsPro" (lockup) | **yes** |
| A5 | Site link card (exists: `kit/web/og.jpg`) | 1200×630 JPEG, 49 KB; X crops to the centred 1200×600 band | link previews of rewardspro.io | "Cashback your customers spend in your store" / "Paid as Shopify store credit, with VIP tiers. Free." / "RewardsPro · rewardspro.io" | **no**. It makes 3 unverified claims and **fails the free rule** (no "you fund the cashback"). It needs a kit rebuild through brand.json and the owner's approval (brand lane, not `social/`). Proposed subtitle: "Paid as Shopify store credit, with VIP tiers. Free app; you fund the cashback." |
| A6 | Milestone card | 1080×1350 PNG (4:5), ≤2 MB. Top ~60% a real screenshot crop; below, one verified sentence, the date and a small lockup. | LinkedIn | M1 instance: "When an order is paid, RewardsPro adds cashback to the customer's Shopify store credit." / "<D Month YYYY>" / "RewardsPro" | **no** |
| A7 | Rule card | 1080×1350 PNG, ≤2 MB; footnote text ≥4.5:1 | LinkedIn | "How cashback is worked out" / "Cashback is paid on the product price after discounts. Shipping, and anything paid with store credit or gift cards, earns nothing." / "Test store, prices including VAT: £600 of products, £60 off, £10 shipping. Cashback on £540. At 5%: £27.00." / "Checked on a Shopify development store, <D Month YYYY>." / "RewardsPro" | **no** |
| A8 | Store-credit limits card | 1080×1350 PNG, ≤2 MB | LinkedIn | "Where customers can spend store credit" / "Signed in with Shopify's new customer accounts or Shop Pay" / "Not with legacy customer accounts" / "Not on draft or edited orders" / "The full balance applies at checkout" / "Source: Shopify Help Center, checked <D Month YYYY>." / "RewardsPro" | **no** (no post goes out before S2) |
| A9 | Correction card (template) | 1080×1350 PNG, ≤2 MB | LinkedIn | "Correction, <D Month YYYY>" / "We said: <old sentence>" / "What is true: <new sentence>" / "Source: <source>, checked <date>" / "RewardsPro" | **no** (only exists after a public claim) |
| A10 | Screenshots (shared with the listing, ASSETS B2) | 1600×900 PNG or JPEG, 5–6 frames; a 1080×1350 crop for posts | listing, LinkedIn, rewardspro.io | Only the real UI text (Home "Set up cashback", Tiers, Orders, a customer panel with "Lock to a tier", Settings, and the widget signed in and as a guest). No added captions on social. | **no** for social. The two swaps for S1 are captured now on rewardsprotesting for the listing only. |
| A11 | Screen recording V1 | 1920×1080 H.264 MP4, 60–90 s, burned-in captions plus an SRT from a typed transcript; LinkedIn Page video ≤10 min | YouTube, LinkedIn, the listing video slot | Captions (PROPOSAL, adjusted to what's on screen): "A test store with test customers." / "A customer pays for an order." / "RewardsPro records the order and its cashback." / "The cashback shows as store credit on the customer in Shopify." / "A refund takes back its share." | **no** |
| A12 | YouTube thumbnail | 3840×2160 JPG or PNG (ASSETS B4, read 2026-10-20; the file-size cap wasn't re-checked [U]) | YouTube | "One paid order, start to finish" / "RewardsPro" over a real frame | **no** |
| A13 | Listing feature image (optional, replaces the video; listing pack) | 1600×900, one focal point, ≥4.5:1, no Shopify logos | listing | "RewardsPro" / "Cashback as store credit, with VIP tiers" over a real screenshot | **no** |
| A14 | App Store badge | Shopify's official file, unaltered, ≥30 px tall, clear space of half its height | rewardspro.io, LinkedIn images only if the owner wants | Shopify's own badge artwork, unchanged | **no** (no use before S2) |

**Not made:** vertical 1080×1920 or Shorts cuts, Instagram feed sets, TikTok clips, a Facebook cover, a Product Hunt gallery, receipt cards, any AI image, any "verified" or "honest" seal.

**Brand-lane fixes for #83 (not `social/`; the owner approves a kit rebuild):**
- brand.json's description still says "points": proposed "Cashback as Shopify store credit, with VIP tiers. Free app; you fund the cashback."
- og.jpg's subtitle needs the same free fix.
- og:locale should be en_GB.

---

## 8. Cadence and the owner's weekly time

| Period | LinkedIn | YouTube | Reserves | The owner's social time |
|---|---|---|---|---|
| Now to S1 | 0 posts | reserved, empty | R0 | about 2 hours once (§13, steps 1–9), split over two weeks if he likes; then 0 a week |
| S1 to S2 | 0 posts | — | — | 0; optional Community help is counted in outreach hours, not here |
| The S2 week | M1, pinned | V1 | swap to R1 | about 25 minutes, once |
| After S2 | **0–2 posts a month, milestones only** | ≤2 more videos in 90 days, only if H2 holds | none; mentions checked monthly | **≤10–15 minutes a week on average** |

- **Milestones** are a merchant-visible change shipping, or a held claim becoming verified. Agents can see both. Nothing is posted to fill a slot.
- **Batches:** when milestones pile up (G0 verifies many claims at once), the owner approves up to 4 posts in one sitting of about 20 minutes and spreads them with LinkedIn's native scheduler. A batch stays inside the 30-day window of any sh-* row it uses, and G1 re-runs on publish day.
- **"A missed week means nothing goes out. No backlog, no streaks, no catch-up bursts."** The floor is zero posts.
- **Profiles explain silence before it happens:** "We post here when the app changes, and not otherwise" and "We don't post here."
- **Where the owner's time goes:** about 45 minutes a week for approving all packs (listing, site, outreach, social) and about 3 hours a week during outreach (design README:404-405). Social takes at most a third of the 45 minutes.
- The owner posts by hand or with LinkedIn's scheduler. No third-party tools, because they cost money and need shared access.

---

## 9. Outreach, consent-first

Social isn't the acquisition lever. The listing and conversations with merchants who agreed to talk are. The evidence changes *how* outreach works:

- **The Partner Program Agreement** [V, shopify.com/partners/terms, "Last updated February 27, 2026", read 2026-11-07]:
  - its summary of §2 says "Do not email a Merchant without their prior consent." (ppa.txt:330);
  - §2.1 says partners will "not send any email regarding Shopify … to any individual or entity that has not requested such information" (ppa.txt:336), and will not email any merchant "whose email address they have received via Shopify" without consent (ppa.txt:335);
  - §2.1 also bars "marketing methods with respect to Shopify … including … telemarketing … social media or video platforms" (ppa.txt:337). The summary reads this as marketing "on behalf of Shopify" (ppa.txt:330). Our reading is that promoting our own app, naming Shopify only for compatibility, is allowed [I]. A legal read would confirm both points; since the owner's word of 7 Nov it is optional for email (OUTREACH D16), not a precondition (last paragraph of this section).
- **PECR** counts social DMs as electronic mail, and sole traders are individual subscribers, so there are no cold DMs. Shopify Community forbids unsolicited private messages.

**The doors (PROPOSAL):**
1. The M2 call at S3, on LinkedIn and on a rewardspro.io partners page.
2. One disclosed Ask & Offer post in the owner's own words, plus replies where a request fits.
3. People who agreed to hear about it, in person or by introduction.
4. Merchants who write to contact@ from the listing.

**If replies are few by week 6 after S3** (agreed now, used only then):
- The owner asks people he already knows in the trade for introductions.
- He considers one podcast pitch (The Shopify App Show).
- Agents check whether a true compatibility sentence exists for TCG trade-in apps (TCG Importer, Synq, Hobby TCG Trade-In, Furloop). One question is whether their credit and RewardsPro's cashback share one Shopify balance: Home counts "store credit from any source" (`app/lib/stats.server.ts:5-14`). That is a HYPOTHESIS, and contact would go through their public support only.
- In-person shop visits follow the outreach plan's consent-first routes (`OUTREACH.md` §4); phone stays on its never
  list. (Before 2026-11-07 this line sent both to a legal read; the outreach plan now covers visits.)

**Agents prepare now, with no outward act:**
- the one-page partner terms against the rebuild (free; set up on a call; feedback calls in weeks 2 and 6; help never depends on a review; uninstall any time, erasure about 48 h after uninstall and 30 days at most; credit already given stays with customers);
- a reply for merchants who wrote in;
- the interview guide additions (§5);
- listing search wording in plain sentences, no keyword lists. In the 2026-10-18 capture, "store credit" and "vip tiers" didn't rank and "cashback" was #43. That predates the listing change, so agents re-capture it read-only.

The owner has answered for email (2026-11-07: "Emailing business directly is fine."). The step-9 prospect list is now Lane B of the outreach pipeline (`wf3/outreach/PIPELINE.md`): built only when the W-gate holds, company-level only, first-segment companies only (never card shops while that lane is held, wf8 F-2), and kept on the owner's encrypted disk image (PIPELINE §8), not in `private/`. The email rules are `wf7/email-rules.md`; the outreach design, not social, carries them.

The design's targets (week 6: 30 contacted, 6 conversations, 3 installs; day 90: 5–10 partners) count from S3, not from today.

---

## 10. Measurement at tiny volume

There are no follower, impression or engagement targets. Each number is read by hand and kept as one private row in `marketing/social/private/`, never in git.

| # | Measure | How | Who, how often |
|---|---|---|---|
| ME-1 | **The legitimacy check** (social's real job) | Logged-out searches for "RewardsPro", "RewardsPro Shopify" and "RewardsPro app", plus a YouTube search. The top 10 are sorted into *ours and current*, *ours but stale* (old landing, docs, the Instagram account, mirrors) and *other* (the cheat channel, Somfy…). | agents, monthly, read-only |
| ME-2 | **Did they look us up, where, and what did they see?** | Asked in every interview and partner call | The owner, every conversation |
| ME-3 | Listing views and installs by week | Partner Dashboard, with post dates marked; correlation only. Whether it shows `utm_source` is [U]. No GA or Meta Pixel unless the owner decides that separately. | The owner, monthly, ~5 min |
| ME-4 | LinkedIn Page views, followers and post impressions | Native analytics only, no scraping | The owner, monthly, ~3 min |
| ME-5 | Inbound mail naming LinkedIn, YouTube, Community or M2 | The owner tags it | as it comes |
| ME-6 | AI answers to "What is RewardsPro?" (are raffles, points or paid plans still mentioned?) | The design's five fixed questions, logged out | agents, monthly, once S2 holds |

**Decision rules, fixed now (PROPOSAL):**
- **Week 8 after the first S2 post:** if the owner's Community time has produced no merchant conversation, it moves into outreach.
- **Week 12:** keep LinkedIn posting if (a) at least 1 conversation or install traces to it, or (b) at least 2 interviewees cite LinkedIn or the video as a reason to trust or install, or (c) the owner values it for legitimacy. Otherwise it goes to profile-only, with no posts.
- **ME-1 fails** while a stale result of ours ranks in the top 5. Then we fix the surface (the owner's hand), not the feed.
- Time a channel frees goes to outreach, never to a new platform. We never escalate to daily posting, paid boosts or new platforms on reach numbers alone.

---

## 11. Risks

| Kind | Risk | Mitigation |
|---|---|---|
| Truth | Profiles or posts send traffic to the false listing or the false privacy page | No link before S2; S1 cleans the listing first; S2 needs the rewritten site |
| Truth | A post shows a widget buyers don't see yet | `rp-widget` waits for B3 plus gate C |
| Truth | "Free" read as costing nothing | The mechanical free rule; the fee sentence in L1, M1 and M2 |
| Truth | Claims expire, or Shopify changes its rules | sh-* rows have a 30-day `review_after` and a re-check before use; G1 fails expired rows; corrections within 7 days |
| Truth | Negative claims (no email, nothing stored) quietly become false | Guard tests (agent PR under apps/rewards; the owner merges, because a merge deploys production) |
| Truth | Screenshots leak personal or test data (it has happened on the listing) | @example.com only; the checker zooms every capture; G6 |
| Legal | CAP "free" (3.23–3.26), comparisons (3.32–3.43), reviews (3.44+), identifiable ads (2.1, 2.3, TALA) | The never-say list; "Ad ·" on any personal post; no comparisons |
| Legal | PPA email and marketing clauses (§9) | Consent-first doors for social; email only through the outreach design's W-gate, on the owner's word of 7 Nov (§9, last paragraph) |
| Legal | PPA 5.3 Shopify marks in names, URLs or hashtags | The no-shopify-in-identity rule, extended to slugs, UTM values and hashtags; the badge unaltered only |
| Legal | UK GDPR for inbound contacts | Personal data only in git-ignored `private/` |
| Platform | X, LinkedIn and Community ban automation and AI replies | Agents never post, reply, like or schedule; the owner writes Community answers himself |
| Platform | The LinkedIn form may refuse a product-name Page, or need a website [U] | Create the Page at S2 if needed; failing that, Bluesky becomes the active feed (claim-light) |
| Platform | Bluesky's domain handle breaks if the `_atproto` record is removed | Note it on the owner's DNS checklist |
| Reputation | A public GitHub link leads to KINGDOM and personal material | The r1-lexicon rule blocks github.com/cambridgetcg/*, docs.rewardspro.io and KINGDOM domains |
| Reputation | KINGDOM TXT records on the domain become more visible once a domain handle invites lookups | Remove them **before** setting `_atproto` (the owner's DNS hand) |
| Reputation | Lookalike accounts and stale mirrors (LetsMetrix "Raffles & Mystery Box", PickYourApp $39/$149/$499) | Consistency; ME-1 watches; mirrors refresh from the listing [I] |
| Reputation | A rival card shop as the maker reads as a conflict | Ask in interviews first (H4); no card-shop framing before then |
| Operational | An install-inviting post brings a real merchant before PITR or the data-request email exist | S2 condition (e) |
| Operational | B5 deletes `apps/rewardspro/`, and this kit with it | `social/` is self-contained; the owner picks the new home before B5 |
| Security | Account takeover, or logins shared with agents | 2FA, Keychain, a non-public sign-up alias, no agent logins |

---

## 12. Costs

**Default: £0 a month.** The real cost is the owner's time (§8).

| Option | Price (source, date read) | Recommendation |
|---|---|---|
| Bluesky domain handle | £0, one DNS TXT record (atproto spec, 2026-11-07) | Yes, after the KINGDOM TXT decision |
| LinkedIn Page verification | no fee stated; eligibility may need an "established commercial relationship" (LinkedIn help a7174627, 2026-11-07) | Ask for it if eligible, after S2 |
| LinkedIn Premium Company Page | £79.67/mo or £668.04/yr; US$99.99/mo or $839.88/yr; may exclude VAT (premium.linkedin.com via a summariser, 2026-11-07) | No |
| X Premium Business | Basic $200/mo or $2,000/yr (one version says $2,500/yr); Full Access $1,000/mo or $10,000/yr (search snippets only, 2026-11-07) | No; X is reserve only |
| Meta One (badge) | from US$14.99/mo, announced 2026-09-15; UK price not stated | No |
| Third-party scheduler | varies | No; native scheduling covers ≤2 posts a month |
| Ads (App Store, social) | — | Not until ~5–10 genuine reviews. If ever: no "Shopify" in copy or keywords, and add "Shopify" as a phrase-match negative keyword (PPA, ppa.txt:454) |
| **Triggered by posting:** Supabase PITR plus a rehearsed restore | about $100 a month (`docs/switch.md` row 9) | Before S2, or the owner accepts in writing going without |
| **First-real-merchant, if EU merchants are in scope:** an EU Art. 27 representative | GDPR Local from £999/yr, Prighter €420/yr, EDPO €1,920/yr (PR #131, 2026-11-03) | The owner's decision |

---

## 13. Actions in order

**Y** = the owner. **Y-W** = the owner's word (a decision). **Y-H** = the owner's hand (only he does it). **A** = agents (local and read-only work, drafts, and PRs that change no live service; the owner merges). The order runs downwards.

**Now (S0 and S1).** The owner's words first, about 25 minutes:
1. **Y-W.** Are Instagram `@rewardspro.io`, TikTok `@rewardspro`, the GitHub org `RewardsPro` and X `@RewardsPro` yours?
2. **Y-W.** Yes, no or edits on: the channel roles (§3), the handle `rewardsproapp` plus Bluesky `@rewardspro.io`, and the S0 texts (§3.2).
3. **Y-W.** The PPA question. **Decided for email on 7 Nov:** "Emailing business directly is fine." (§9, last paragraph). Still open: letters (does the word cover post?), and whether to send the Shopify question as protection (recommended; ROADMAP action 1). A legal read is optional (OUTREACH D16).
4. **Y-W.** Remove the KINGDOM TXT records and one DMARC record? Which form of G0 do you accept? Where does `marketing/` move before B5?

Agents, in parallel:

5. **A, claims maker.** Re-source `rp-store-credit`, `rp-vip-tiers` and `rp-free` to apps/rewards and add the §6.3 rows as `proposed`. Verify `rp-maker`, `rp-on-app-store`, `rp-merchant-funds` and the sh-* rows (raw re-fetch, sha256, a second session).
6. **A, makers** (each in its own files under `social/`):
   - the A2–A4 banners;
   - the profile text pack (§3.2), with counts and claim ids;
   - the A6–A9 templates, with sidecars and alt texts;
   - the S1 shot list (two admin frames to replace listing screenshots #1 and #3, captured on rewardsprotesting with @example.com buyers and the admin name cropped);
   - the G0 shot list (8 screens and 3 recordings).
7. **A, checker** (a different session). Writes the G4 social rules as dated data:
   - free-pair;
   - no-shopify-in-identity, covering names, handles, slugs, UTM values and hashtags;
   - r1-lexicon (KINGDOM words and domains, github.com/cambridgetcg, docs.rewardspro.io);
   - banned spellings, chance words, numbers-from-ledger;
   - badge-unaltered, no-outbound-dm, personal-reshare-ad-label;
   - sh-freshness ≤30 days;
   - per-platform limits, each with `review_after`.

   Then builds the S0 review pack (exact bytes, hashes, destinations).
8. **A.** Further drafts:
   - listing replacement text: a new Feature 3 (refund take-back, or the widget after B3) and alt texts, as a PROPOSAL;
   - a read-only re-capture of App Store search positions;
   - the brand-lane notes for #83 (§7);
   - the interview-guide additions;
   - the partner terms draft;
   - a read-only UKIPO/EUIPO search for REWARDSPRO, report only.

Then the owner's hand, about 1 h 30 m, with nothing posted:

9. **Y-H, Partner Dashboard (~30 min).**
   - Delete "you can sell a tier as a product", Feature 3, the meta description's tier-membership words, and the Memberships and Membership perks tags.
   - Remove video IHgTl5oQZlg.
   - Swap screenshots #1 and #3 for the S1 captures.
   - Trim the protected-data request to names, plus email for search.
   - Note the date. **This makes S1.**
10. **Y-H (2 min).** Send a test message to contact@rewardspro.io from an outside address and confirm it arrives.
11. **Y-H (~45 min).** Create the LinkedIn Page, YouTube `@rewardsproapp`, X `@rewardsproapp` and Bluesky `rewardsproapp.bsky.social`; Instagram and TikTok only as step 1 decides. Use the steps in §3, with 2FA. Add the avatar, banners and S0 texts. No link, no posts.
12. **Y-H, DNS (~10 min, after step 4).** Remove the KINGDOM TXT records and keep one DMARC record. Then add `_atproto` and verify Bluesky `@rewardspro.io`.

**To S2** (the real marketing work is product and site):

13. **Y-W + Y-H.**
    - Approve the admin name "RewardsPro" in `shopify.app.toml:10` for the next `shopify app deploy` (agent PR).
    - Record B2 step 6 and B3, with the release name and date.
    - Run B4 into `gates.md`, or the narrower production test order plus refund.
    - In the same 60–90 minute sitting, capture the G0 shot list and recording V1. **This makes G0.**
14. **A.** The claims maker verifies the rows the observations support, with a second session.
15. **Y-H.** Replace the listing screenshots with the G0 set, and put in a real recording or a still feature image (A13).
16. **A, then Y.** Agents rewrite #130 against the rebuild: landing, privacy, terms, subprocessors and `/changes`. They rebase #83, then #95. The owner reads, merges and deploys.
17. **Y-W + Y-H.** The first-real-merchant steps: PITR plus a restore drill, the Sentry Crons decision, the data-request email decision, cancelling the 2 frozen charges, and the EU representative decision. Or the owner's written acceptance of their absence. **S2 holds.**
18. **A.** The M1 pack: text, card or V1, alt text, claim ids, gate report and a "valid until" date.
19. **Y-H (~25 min).** Approve M1. Swap to T1, L1 and R1 with UTM links. Post and pin M1. Upload V1 to YouTube and, if wanted, the listing's video slot.

**S3 and after:**

20. **Y-W.** Answer the PPA question if it's still open, and approve the partner terms.
21. **A.** The M2 pack and the reply for merchants who wrote in.
22. **Y-H.** Post M2. Hold partner calls, about 60 minutes each. Answer inbound mail and fitting Ask & Offer requests in his own words.
23. **A, monthly.** ME-1 and ME-6, read-only, plus a one-page digest of expiring claims, ME rows and stale surfaces.
24. **A + Y, on each milestone.** A pack of up to 4 posts; the owner approves (~20 min) and schedules them natively.
25. **Week 12.** Apply the §10 rules.

---

## 14. What we deliberately do not do

- Open every channel with a content calendar, or post "coming soon" teasers before G0.
- Post anything before S2, or link the listing or rewardspro.io before they are true.
- Run more than one active feed, or mirror posts to X or Bluesky by default.
- Send cold email or DMs from social, or buy or build lists of shops we may not contact. (First emails run only in the outreach design, under its W-gate: §9, last paragraph.)
- Write Community answers, Reddit posts or reviews for the owner, or anything shaped like a reply for him to paste.
- Post on Reddit, Facebook groups, Mastodon or TikTok, or post Instagram content.
- Use paid badges, ads, boosts, third-party schedulers, automation or AI reply bots.
- Make founder-led posts on the owner's personal profiles (only with "Ad ·" first, if he ever chooses to).
- Post build-in-public numbers, "first merchant" posts, review counts, install counts, outcome or ROI claims.
- Compare ourselves with competitors, or use any "only free cashback app" line (Koin and Casa are free).
- Use TCG or card-shop positioning before the interviews.
- Use AI imagery, seals or ticks, Shopify logos (other than the unaltered badge), or reuse `og.jpg` before its rebuild.
- Link GitHub, docs.rewardspro.io or any KINGDOM site; use KINGDOM language anywhere on RewardsPro.
- Say "free forever", "instant", "set up in minutes", "works with POS" or "GDPR compliant".
- Let agents hold any login, or post, like, follow or schedule.

---

## 15. Decisions for the owner, and open questions

**Decisions (agents assume nothing):**
- D1 The channel roles and the single active feed.
- D2 The handle `rewardsproapp` and Bluesky `@rewardspro.io`.
- D3 The S0 and S2 texts.
- D4 The free wording "Free app, no paid plans; you fund the cashback you give.", and whether "no paid plans" holds for at least the life of a post.
- D5 Where the AI line goes: profile About and video descriptions (proposed), or every post.
- D6 Which form of G0.
- D7 Whether posting may start before the site is fixed (default no).
- D8 The PPA question: decided for email on 7 Nov (§9, last paragraph). Still open: letters, whether to send the Shopify question as protection, and whether to get a legal read (optional).
- D9 Whether to name removed features in any public note (default no).
- D10 Whether M2 names card and collectibles shops or UK Shopify shops in general.
- D11 The new home of `marketing/` before B5.
- D12 Whether to post personally at all (default no).

**Open questions (not guessed):**
- Were B2 step 6 and B3 done, and when?
- Is `read_all_orders` granted in production?
- Which Sentry region does production use?
- Does contact@ deliver?
- Does the LinkedIn form accept `rewardsproapp` or `rewardspro`, and are Page admins publicly visible?
- Does the Partner Dashboard report `utm_source`?
- Does the listing form allow screenshots #1 and #3 to be removed without replacements? It may require a minimum [U].
- Do merchants read vendor changelogs, and is a card-shop maker a plus or a conflict? Both are for the interviews.

---

## 16. How this plan was made

**Base:** the **minimum viable presence** strategy, which scored highest across the three judges' lenses: truth risk 7.5, acquisition 6.5, the owner's time 8.

**Grafted from the maker-log plan:**
- its strict posting gate (now S2), with every post treated as an install invitation;
- the claim-free "reserved" bio;
- never linking GitHub or the docs;
- the rejected-claims list;
- batch approval with native scheduling;
- counting PITR as a cost that posting triggers;
- the card-shop interview question;
- deleting the false listing text now.

**Grafted from the merchant-help plan:**
- the sh-* sourcing discipline;
- "never say Shopify can't" and no tax or legal advice;
- The owner's optional, own-words Community track;
- "a missed week means nothing goes out";
- the week-8 and week-12 pass marks.

**Fixed:**
- Every bio that said "free" without "you fund the cashback" (now a mechanical rule).
- Posting or linking before the site rewrite: min-presence's P1/P2 gates allowed it; S2 now forbids it.
- contact@ in bios before a delivery check.
- "Shopify" in URLs and hashtags.
- The unread PPA §2.1 marketing clause (now read, and sent to the legal read).
- The unsupported "guest orders earn nothing" (held).
- The over-read Community name rule (the owner's username is his own choice).
- Two locator slips (`shopify.app.toml:10`; the PPA summary is ppa.txt:330).
- An unmarked banned spelling in a YouTube description (dropped).

**Sources:**
- the phase-1 notes (truth, status, live, drafts, market, platforms);
- the three phase-2 strategies and the judges' scores;
- the 2026-10-20 design (README §4–§9, ASSETS B1–B5 and D3, RESEARCH §4.1);
- the kernel and kit in this worktree (`claims.toml`, `kernel.toml`, `brand.json`, `kit/BRAND.md`, `kit/colour/contrast.md`, `kit/web/og.jpg` viewed);
- the rebuild at origin/main 6f3a57b6, with the locators in §6.3 re-read on 2026-11-07;
- https://www.shopify.com/partners/terms, read 2026-11-07 (raw text in the session scratchpad, `p2raw/ppa.txt`, lines 330, 335–337, 453–454, 718).

None of this is legal advice.
