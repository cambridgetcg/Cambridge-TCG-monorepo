# RewardsPro content kit: posts

Content maker (agent), 2026-11-07, revised the same day after the verifier's truth, wording and platform review.
**PROPOSAL for Yu. Nothing is posted, scheduled or decided.** Built on [`../STRATEGY.md`](../STRATEGY.md) (§2 stages,
§3 channels, §4 voice, §5 pillars, §6 claims, §7 assets, §8 cadence). The profile texts (R0, T0, A0, A0c, YT0, YT0c, TK0,
AI0, R1, T1, T1F, L1, L1W, MK1, YT1) are the profiles maker's, in [`../profiles.json`](../profiles.json); this file doesn't repeat them.
The Community bio has no paste text: it is the owner's own words (`../profiles.md` §4.3, which dropped CB and CB1).

## How to read this file

- **Phase-1 notes** (`p1-truth.md`, `p1-platforms.md`, `p1-market.md`) are the workflow's research notes from
  2026-11-07. They sit outside git, in the session's scratchpad (`…/scratchpad/wf/`). Each fact used here also gives
  its primary source: a URL with the date read, or a file:line in origin/main 6f3a57b6 (`apps/rewards/`).
- **Claim ids** in square brackets, such as [rp-free], are never pasted. Every factual sentence carries one, or a
  cited source. A sentence with neither is marked **NO-ROW** and must not be used until the claims maker adds a row.
  The posts use the ledger sentences word for word wherever they can, so the claims check stays mechanical. Where a
  text uses a shortened or reworded form, the note under it says so, and the form is NO-ROW until the claims maker
  adopts it as a variant.
- **Chars** are Unicode code points of the text exactly as pasted (brackets removed; a blank line between paragraphs
  counts as 2). They were counted by script on 2026-11-07. `<D Month YYYY>` is counted as "30 September 2026"
  (17 characters), the longest likely date. Other placeholders, such as `<old sentence>`, are counted as written.
- **Limits** (read 2026-11-07):
  - LinkedIn post: 3,000 characters [V, `p1-platforms.md`].
  - LinkedIn photo: at least 552×276, 1080 wide recommended, ratio 3:1 to 4:5, at most 5 MB; a taller image "will be
    centered and cropped" [V, LinkedIn help a527229, raw capture `p1-raw/li/a527229.html`].
  - A LinkedIn post carries "either a URL link or an image … but not both" (a527229) [V]. An address typed into the
    text of an image or document post stays in the text, with no preview card [I].
  - LinkedIn document: PDF, ≤100 MB and 300 pages [V]. The upload asks for a document title; "PDFs with multiple
    layers must be flattened or merged"; viewers can download the PDF "for accessibility purposes" [V, help a518909,
    raw capture `p1-raw/li/a518909.html`].
  - Alt text on every image, kept ≤1,000 (STRATEGY §7). LinkedIn's own cap for organic posts is unknown [U]: its
    alt-text help page (a519856, the verifier's read of 2026-11-07) states none, and the 300 figure in circulation
    is the ad Description field. **Check the ALT field's counter in the composer before the first image post.**
  - YouTube: title 100 characters and description 5,000 (help 57404, "Video titles have a character limit of 100
    characters", "Video descriptions have a character limit of 5,000 characters"); the Data API gives the
    description as 5,000 bytes and bars `<` and `>` in both [V, developers.google.com/youtube/v3/docs/videos]. So
    every `<D Month YYYY>` is replaced before pasting.
- **Status** is one of `text final`, `after G0` or `after claim X verified`. Above every status sits the strategy's
  stage rule: **no post goes out before S2** (STRATEGY §2, §14). `after claim X verified` means the claims need no
  dev-store or production observation (`../claims-map.md`); `after G0` means at least one does.
- **Nothing in this file can be posted now.** On 2026-11-07 the ledger has 35 rows, all `proposed`, none `verified`
  (`../../claims.toml`, read 12:45; the claims fix maker was still editing it; 36 rows, all `proposed`, at 12:58), and S0 allows no posts. H0-CH's text is
  final, but it ships only with the S2 site deploy.
- **Ledger rows are cited by id, not line**, because the ledger is being revised. This file follows the sentences as
  read at 12:45 on 2026-11-07, including three the claims fix maker reworded that day: rp-free ("RewardsPro is free
  for every store that installs it, and no paid plans are offered."), rp-on-app-store ("RewardsPro is an app for
  Shopify stores.", with "on the Shopify App Store" ruled outside social use) and rp-tier-window (now carrying the
  import limit). Code locators are at origin/main 6f3a57b6; the switch record they mention is
  `docs/switch.md:64-90` at 6bd092cb (B2 step 6 and B3, recorded 2026-11-07).
- **Before any post:** G1 (every claim `verified` and unexpired; sh-* rows checked ≤30 days ago, re-checked on
  publish day), the checker's G4 rules (free pair, no "shopify" in names, handles, slugs, UTM values or hashtags,
  R1 lexicon, banned spellings, chance words, numbers only from the ledger), G6 on every image, Yu's approval
  recorded, then Yu posts by hand or with LinkedIn's own scheduler.
- **Links.** Our links appear only from S2, and only to rewardspro.io with UTM tags:
  `https://rewardspro.io/?utm_source=<platform>&utm_medium=<social|video>&utm_campaign=<post-id>` (the path is
  `/changes` for a correction), where the post id is this file's id in lower case (m1, car1, v1, e12, corr). Never
  GitHub, docs.rewardspro.io or any KINGDOM site.
  A Shopify Help Center page may be named as a source. Its address is written out only in a post that also carries
  an image or a document, so no Shopify preview card is made (a527229); a text-only post names the page without its
  address. Whether LinkedIn turns a bare address into a link is [I].
- **No hashtags, no emoji, no exclamation marks.** "Shopify" appears only to say what the app works with
  (PPA Part C s.3, ppa.txt:718).
- **Register: business** (Yu, 2026-11-07: "用loyal customers, take a more business approach on wordings.";
  `../../approvals.jsonl`). The posts below already state facts in short declarative sentences, so none changed;
  any new line says "loyal customers", never "regulars", and follows `../../MESSAGING.md` §4.
- **Images** are the assets maker's, under `social/assets/png/`, named
  `rewardspro_<campaign>_<asset>_<variant>_<WxH>_<yyyymmdd>_v<NN>.<ext>` with a `.meta.json` sidecar
  (STRATEGY §7). On 2026-11-07 four card drafts exist. Each is 1080×1350 (`sips`), 80–159 kB, carries a draft band
  and rests on `proposed` claims, so none is postable until its claims are verified and it is rebuilt without the
  band:
  - A6 milestone card: `rewardspro_social_milestone-card_claim-rp-paid-trigger+rp-store-credit+rp-vip-tiers-draft_1080x1350_20261107_v01.png`
  - A7 rule card: `rewardspro_social_rule-card_claim-rp-cashback-base+rp-store-credit-draft_1080x1350_20261107_v01.png`
  - A8 store-credit limits card: `rewardspro_social_limits-card_claim-sh-sc-signin-legacy+sh-sc-channels+sh-sc-full-draft_1080x1350_20261107_v01.png`
  - A9 correction card: `rewardspro_social_correction-card_placeholders-draft_1080x1350_20261107_v01.png`

  No file exists yet for the screenshots (A10), V1 (A11), A12, V2 or the proposed A15 (CAR1). Screenshots are named
  by their shot-list id (SH-1 to SH-8, [`../shot-list.md`](../shot-list.md) §6) and used as its 1080×1350 crop.
- **Alt text.** G6 checks the alt text in the posted image's own sidecar. The template sidecars describe the empty
  template. For the cards (A6–A8) `assets/render.mjs` writes the instance's `alt_text` itself, so that sidecar is
  the only copy and this file points to it. For screenshots, CAR1 pages and the A9 template, the alt texts in this
  file are drafts for each post's instance, and the assets maker copies the final one into that instance's sidecar
  when rendering it.

---

## 1. Hello texts: held

### 1.1 What these texts lean on

H0-LI uses rp-free, rp-on-app-store, rp-maker, sh-sc-fee, rp-ai-drafted and rp-contact-delivers. None of these needs
a dev-store observation (`../claims-map.md`).

The first draft also used rp-merchant-funds' full sentence and said these texts "make no claim about what the app
does". That was wrong. "The cashback is store credit in your own shop" states the mechanism rp-store-credit covers,
so no text using it can be verified before rp-store-credit is. rp-store-credit is `proposed`: it now has one
production observation (test order #1010, `docs/switch.md:77` at 6bd092cb), but no production refund, and whether
B4 check B is needed too follows Yu's D6. STRATEGY §6.3 and `claims-map.md` class rp-merchant-funds as needing no
observation and rp-store-credit as needing one; the claims maker should settle that split. Until then:
- H0-LI uses only the short form "You fund the cashback you give." (the form L1 uses). It isn't a ledger sentence,
  so it is **NO-ROW** until the claims maker adopts it as an rp-merchant-funds variant. It still takes for granted
  that the app gives cashback, which the listing says; the claims maker decides whether that is enough.
- Every text here that carries rp-merchant-funds' full sentence (E2, R-FREE-1) waits for G0.

Two things the brief asked for are left out on purpose:
- **"What we are rebuilding."** rp-live-release is a `proposed` row. B3 is now recorded (`docs/switch.md:83-89` at
  6bd092cb), but the row still lacks gate C at 390 px (Light, product page) and Lighthouse, and no hello may lean on
  it before S2. The voice guide also bans "relaunch" and the other internal words (STRATEGY §4).
- **"Relaunches free."** Being free is stated as a present fact [rp-free], never as news or a launch.

### 1.2 Can these be posted?

**Not by default.** Every post waits for S2 (STRATEGY §14: "Post anything before S2"), and §14 also rules out
"coming soon" teasers before G0. D7 covers only S2 condition (d), posting before the site is fixed. A hello before
S2 would also skip whichever of (a) G0, (b) B3, (c) the listing fully fixed and (f) contact@ delivering don't hold
yet, while (g), every claim verified, holds whatever Yu decides. So:
- H0-LI before S2 needs Yu's explicit word waiving each unmet S2 condition, not just D7. PROPOSAL: put it to him as
  one new decision, **D13: one claim-light hello on LinkedIn before S2** (default no). Without D13, S1 holding and
  every row it uses `verified`, it is **not usable**. It never carries a link.
- Otherwise it doesn't run. At S2, M1 (§2.1) is the first post and H0-LI is dropped.

### 1.3 Per channel

| Channel (role) | Hello | Notes |
|---|---|---|
| App Store listing (primary surface) | none | It has no feed. Its text belongs to the listing pack (the #131 rewrite), not here. |
| rewardspro.io (primary surface) | H0-CH, the `/changes` intro | It ships only inside the #130 rewrite deploy, which is Yu's (S2 condition d). |
| LinkedIn Page (primary social) | H0-LI | Held, see §1.2 (D13). The Page's About is A0 (profiles.json). |
| YouTube (secondary) | none; the channel description YT0 is the whole hello | YT1 replaces it in the S2 sitting. No upload before S2 (STRATEGY §3). |
| Shopify Community (secondary, Yu's own words) | none from agents | His bio is his own words from S1, with no paste text (`../profiles.md` §4.3). Agents never write posts or replies for him there (STRATEGY §3, §14; Community bans "generic, templated, or AI-generated messages"). See `community-rules.md`. |
| X, Bluesky (reserve only) | none | Bio R0, then R1 at S2. They never post (STRATEGY §3). |

**H0-LI** · LinkedIn Page · 616 / 3,000 chars (570 without the last line)

> RewardsPro is free for every store that installs it, and no paid plans are offered. You fund the cashback you
> give. [rp-free; short form of rp-merchant-funds, NO-ROW, §1.1] For Shopify stores created on or after 12 May 2025,
> Shopify charges third-party transaction fees on the part of an order paid with store credit. [sh-sc-fee]
>
> RewardsPro is an app for Shopify stores. RewardsPro is made by Cambridge TCG Limited, London, UK. [rp-on-app-store,
> rp-maker]
>
> We post here when something merchants can see changes, or when we have checked a new fact about how it works, and
> not otherwise. [NO-ROW: the widened form of rp-post-on-change, see below] Posts here are drafted with AI help and checked by a person before
> we post them. [rp-ai-drafted]
>
> Questions reach us at contact@rewardspro.io. [rp-contact-delivers; drop the line until that row is verified]

- "Free" (character 15) and "fund the cashback" (character 89) both sit in the first 110 characters, so a "…see
  more" fold can't separate them. Where LinkedIn folds organic posts is [U].
- The posting line matches the milestone rule (STRATEGY §8: "a merchant-visible change shipping, or a held claim
  becoming verified"), so the evergreen candidates in §3 don't break it. The first draft's "we post here only when
  the app changes" would have been broken by this file's own calendar (L-C2, CAR1). The ledger's new row
  rp-post-on-change (added 12:43 on 2026-11-07, channel social-profile only) says "We post here when the app
  changes, and not otherwise." for A0 and L1, and its contrary evidence names the same conflict and proposes
  widening it. One sentence for profiles and posts is for the claims maker, the profiles maker and Yu to agree;
  until then this line is NO-ROW.
- Image: none (text only). Link: none.
- Status: `after claim rp-free, rp-on-app-store, rp-maker, sh-sc-fee, rp-ai-drafted verified` (and
  rp-contact-delivers for the last line), plus rows for the short form and the posting line, S1 holding and Yu's
  D13. Default: never posted.

**H0-CH** · rewardspro.io `/changes`, intro paragraph · 193 chars (no platform limit)

> This page lists the changes to RewardsPro that merchants can see, newest first, each with its date. If something
> we said turns out to be wrong, the correction is listed here too, with its date.

- Claims: none. It describes the page and repeats the corrections rule (STRATEGY §5) as a promise.
- Status: `text final`. It ships only with the site rewrite at S2.

---

## 2. Launch posts: after G0, posted only once S2 holds

Order of the S2 week (STRATEGY §13 step 19): Yu approves M1; swaps the bios to T1, L1 and R1, and **YT0 to YT1**
(`../profiles.md` §2.2, set B); his Community bio stays his own words (§4.3); posts and pins M1; checks that the YouTube channel
is verified (§2.4); and uploads V1. Step 19 lists only T1, L1 and R1, so the strategy owner should add YT1:
once V1 is up, YT0's "Nothing is posted here yet" is false. The carousel and the store-credit limits post follow as
the first batch (`calendar.md`). No thread is written: X and Bluesky never post, and mirroring is on the strategy's
"do not" list (§14).

### 2.1 M1, the announcement · LinkedIn Page, pinned · 522 / 3,000 chars

> The current version of RewardsPro is live. [rp-live-release] When an order is paid, it adds cashback to the
> customer's Shopify store credit at their tier's rate. [rp-paid-trigger, rp-store-credit, rp-vip-tiers] A refund
> takes back its share of the cashback, from store credit the customer still holds. [rp-refund-takeback] Free app, no
> paid plans offered; you fund the cashback you give. [rp-free, rp-merchant-funds; D4 wording] For Shopify stores created on
> or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit.
> [sh-sc-fee]
>
> https://rewardspro.io/?utm_source=linkedin&utm_medium=social&utm_campaign=m1

- Text: STRATEGY §6.2 M1 (444 characters here) plus the link line (78 with its line break), with four changes. The
  strategy owner should make the same changes in §6.2:
  - "no paid plans" becomes "no paid plans offered", following rp-free's rewording: it offers no plan rather than
    denying the two old paid agreements, and a public post reaches those shops too. The wording is Yu's D4.
  - The refund sentence is rp-refund-takeback in full. The short "A refund takes back its share." drops "from store
    credit the customer still holds", and staging check F took only £16.06 of £27.00 because the buyer had spent the
    rest (`docs/staging-run.md:27`; `app/lib/refunds.server.ts:22-24`).
  - "Tiers count spend over the last 12 months or all time." is dropped. "All time" starts at the import horizon, at
    most 12 months before install, or 60 days without `read_all_orders` (`app/shopify/bulk-import.server.ts:1-4,
    37-39`; `app/lib/tiers.server.ts:67-68, 95-103`). rp-tier-window now carries that limit, and E7 and CAR1 page 4
    use it; adding it here would cost about 160 characters, which Yu may prefer.
  - The fee sentence is sh-sc-fee word for word ("third-party transaction fees", not "its own … fee").
- **Optional opening line (PROPOSAL, added later on 2026-11-07):** "RewardsPro is built for rewarding loyal
  customers with store credit in your own shop." (85) [rp-purpose, no row yet (`../../MESSAGING.md` §7);
  rp-merchant-funds, rp-store-credit], before "The current version of RewardsPro is live." It is the umbrella idea
  in Yu's term (`../../MESSAGING.md` §1, O1). With it, M1 is 608 / 3,000. It carries rp-store-credit because "store
  credit in your own shop" states that row's mechanism (§1.1); M1 posts only at S2, after G0.
- Media, one of:
  - **V1** (A11), uploaded natively. Its pack is `../video-walkthrough.md` (§2.4).
  - **A6 milestone card**, M1 instance, 1080×1350, with the SH-6 crop on top (`../shot-list.md` §10).
    Alt text: the instance sidecar's `alt_text`, which `assets/render.mjs` builds from the embedded screenshot
    (the authoritative copy; this file no longer keeps its own draft). The card's sentence is now "When a
    customer's order is paid, RewardsPro adds cashback at their tier's rate to their Shopify store credit."
    (assets fix pass, claims rp-paid-trigger, rp-store-credit, rp-vip-tiers), which differs from M1's second
    sentence above; the two makers align one wording before the M1 pack (completeness check, 2026-11-07).
- Status: `after G0`. It needs rp-live-release (B3 is recorded; gate C at 390 px and Lighthouse are still open),
  rp-paid-trigger, rp-store-credit, rp-vip-tiers and rp-refund-takeback (a production refund) verified, plus rp-free,
  rp-merchant-funds and sh-sc-fee.

### 2.2 CAR1, "How it works" carousel · LinkedIn document post (PDF) · post text 304 / 3,000 chars

Post text:

> How cashback works in RewardsPro, one page at a time: when it is added, what earns it, VIP tiers, refunds, where
> customers can spend store credit, and what it costs. Pages 2 to 9 each say where we checked them, and the date.
>
> https://rewardspro.io/?utm_source=linkedin&utm_medium=social&utm_campaign=car1

**Document title** (LinkedIn asks for one, a518909) · 31 chars: "How RewardsPro's cashback works"

The document is 10 pages at 1080×1350, in the A7/A8 card style: white on navy `#1A3E5C`, or navy on white, Inter.
It is **not in the strategy's asset list** (A1–A14), so it's a request to the assets maker (call it A15), and a
PROPOSAL. The PDF has one layer (layers merged, as a518909 asks), with live text kept, not rasterised, and is tagged,
with the alt texts below written in as alternate text on the screenshot pages. Viewers can download the PDF "for
accessibility purposes" (a518909), so the PDF's own tags are the accessible copy. Whether LinkedIn's viewer reads
page alt text is [U].

| Page | Text on the page (exact) | Image | Alt text (draft; match it to the capture) | Claims |
|---|---|---|---|---|
| 1 | "How RewardsPro's cashback works" / "Cashback as Shopify store credit, with VIP tiers" / lockup | none | none (text only) | rp-store-credit, rp-vip-tiers |
| 2 | "When an order is paid" / "RewardsPro adds cashback to the customer's Shopify store credit. It doesn't wait for the order to be fulfilled." / "Checked on a Shopify development store, <D Month YYYY>." | SH-6, crop of the Order section | "A test order's panel in RewardsPro, showing the cashback it earned as Shopify store credit." | rp-paid-trigger, rp-store-credit |
| 3 | "What earns cashback" / "Cashback is paid on the product price after discounts. Shipping, and anything paid with store credit or gift cards, earns nothing." / "Test store, prices including VAT: £600 of products, £60 off, £10 shipping. Cashback on £540. At 5%: £27.00." / "Checked on a Shopify development store, <D Month YYYY>." | none (the A7 layout) | none (text only) | rp-cashback-base; the example is **NO-ROW** (see E1: suggested rp-cashback-example) |
| 4 | "VIP tiers" / "Set tiers by spend, each with its own cashback rate. Customers move between tiers as their spend changes." / "Tiers count each customer's spend over the last 12 months, or over all time since RewardsPro started counting, which reaches back up to 12 months before install." / "Checked on a Shopify development store, <D Month YYYY>." | SH-3, the table with the sentence under it | "RewardsPro's Tiers page in a test store: a table of tiers, each with a minimum spend and a cashback rate, and the choice of how spend is counted." | rp-vip-tiers, rp-tier-window |
| 5 | "Lock a customer to a tier" / "You can lock a customer to a tier." / "Checked on a Shopify development store, <D Month YYYY>." | SH-4, the Tier and Store credit sections | "A test customer's page in RewardsPro, with their tier, the spend counted, and a Lock to a tier control." | rp-tier-lock |
| 6 | "Refunds" / "A refund takes back its share of the cashback, from store credit the customer still holds." / "Checked on a Shopify development store, <D Month YYYY>." | SH-6, the take-back table | "An order in RewardsPro, showing its cashback and the part a refund took back." | rp-refund-takeback |
| 7 | "Some of Shopify's rules for spending store credit" / "Signed in with Shopify's new customer accounts, or using Shop Pay" / "Not with legacy customer accounts" / "Not on draft or edited orders" / "The full balance applies at checkout" / "Shopify's page lists the rest, including which sales channels accept it" / "Source: Shopify Help Center, checked <D Month YYYY>." | none (the A8 layout) | none (text only) | sh-sc-signin-legacy ("using Shop Pay" is Shopify's word; the ledger says "with Shop Pay"), sh-sc-channels (the draft and edited part only; POS is left out on purpose, STRATEGY §6.2 C2), sh-sc-full |
| 8 | "What it costs" / "RewardsPro is free for every store that installs it, and no paid plans are offered." / "The cashback is store credit in your own shop, so you fund the cashback you give." / "For Shopify stores created on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit. The rate depends on your Shopify plan." / "Source: Shopify Help Center, checked <D Month YYYY>." | none | none (text only) | rp-free, rp-merchant-funds, sh-sc-fee. "The rate depends on your Shopify plan" is true today (the fees page, read 2026-11-07: "The rate for third-party transaction charges varies depending on your pricing plan"), but it sits only in sh-sc-fee's uncertainties. **The claims maker adds it to sh-sc-fee's sentence, or the clause is dropped.** |
| 9 | "Setting up" / "Setup is three steps: set a base cashback rate, switch cashback on, and turn on the widget in your theme editor." / "Checked on a Shopify development store, <D Month YYYY>." | SH-1, the setup card | "RewardsPro's Home page with the Set up cashback card: a base cashback rate, a switch to turn cashback on, and a step to turn on the widget in the theme." | rp-setup-steps |
| 10 | "Who makes it" / "Made by Cambridge TCG Limited, London, UK." / "Questions reach us at contact@rewardspro.io." / "rewardspro.io" / lockup | none | none (text only) | rp-maker, rp-contact-delivers (drop the contact line until that row is verified) |

- Page 7 is headed as a selection, because Shopify's page has more limits than the card lists: "It isn't accepted on
  other sales channels", D2C online stores only, and "not towards recurring subscription bills"
  (help.shopify.com/en/manual/customers/store-credit, read 2026-11-07). Naming the channels would mean naming POS,
  which the plan leaves out until POS earning is observed. The A8 card now carries this heading and "using Shop
  Pay" (assets fix pass); its first line reads "Signed in to Shopify's new customer accounts, or using Shop Pay"
  where this page says "Signed in with", and it has no "Shopify's page lists the rest" line. Align before the pack.
- A widget page is added between pages 9 and 10 **only once rp-widget is verified** (B3 plus gate C at 390 px,
  light and dark). Until then the deck says nothing about what shoppers see.
- Whether LinkedIn's native scheduler accepts document posts is [U] (`p1-platforms.md` records only "Native
  scheduling [V]").
- Status: `after G0` (rp-paid-trigger, rp-store-credit, rp-cashback-base, rp-vip-tiers, rp-tier-window, rp-tier-lock,
  rp-refund-takeback and rp-setup-steps need observations), plus the NO-ROW rows named on pages 3 and 8. The sh-*
  rows on pages 7 and 8 are checked ≤30 days before publishing.

### 2.3 L-C2, Shopify's store-credit limits · LinkedIn Page · 436 / 3,000 chars

> RewardsPro pays cashback as Shopify store credit, so Shopify's rules decide where customers can spend it.
> [rp-store-credit] Among them: signed in with new customer accounts or using Shop Pay, not legacy accounts;
> [sh-sc-signin-legacy] not on draft or edited orders; [sh-sc-channels] and the full balance applies. [sh-sc-full]
> Shopify's page lists the rest, including which sales channels accept it.
>
> Source: Shopify Help Center, help.shopify.com/en/manual/customers/store-credit, checked <D Month YYYY>.

- Text: STRATEGY §6.2 C2, made plainly partial ("Among them", "Shopify's page lists the rest"), with "using Shop Pay"
  from Shopify's own sentence ("only when signed in through customer accounts or using Shop Pay"), plus the source
  line. POS isn't mentioned: whether POS orders earn hasn't been observed (STRATEGY §6.4). The address may appear
  because the post carries the A8 image (Links rule above).
- Image: **A8 store-credit limits card**, 1080×1350 (draft file above).
  Alt text: the card's sidecar `alt_text` (authoritative, ≤300 characters; the card is now headed "Some of
  Shopify's rules for spending store credit"). This file's earlier draft described the old heading and is
  withdrawn (completeness check, 2026-11-07).
- Status: `after G0`, because rp-store-credit needs an observation. The three sh-* rows need no dev store, but each
  is re-checked ≤30 days before publishing.

### 2.4 V1, the first recording · YouTube (also LinkedIn and rewardspro.io)

**The V1 upload pack is [`../video-walkthrough.md`](../video-walkthrough.md) §5 and §7, and only that file:** title,
description, captions, the transcript and caption-track decision (D-video-1), thumbnail and settings. An earlier
copy here disagreed with it on the title, description, UTM value and captions, so it is removed. Whether V1 also
fills the listing's video slot is D-video-2 there.

Points from this file for that pack and for Yu:
- **For the video maker to reconcile** (that file as read at 12:45 on 2026-11-07; it was being revised too): the
  Links rule here asks `utm_campaign=v1` (the pack uses `v1-paid-order`); the optional free block says "its own
  third-party transaction fee" where sh-sc-fee says "third-party transaction fees", and "free, with no paid plans"
  where rp-free now says "free for every store that installs it, and no paid plans are offered"; and the "On the
  Shopify App Store:" line names the App Store, which rp-on-app-store now rules outside social use.
- **Captions:** the pack's "The order is marked as paid" is right. The G0 order is a draft order marked as paid
  (`docs/switch.md:177` at 6f3a57b6, `:205` at 6bd092cb, where production test order #1010 was one, `:77`; `../shot-list.md` §2, O1), because RewardsPro gives no cashback on orders Shopify flags as
  test orders (`app/lib/record-order.server.ts:66`, `if (facts.test) return "test";`). "A customer pays for an
  order" (STRATEGY A11) is used only if a real checkout is recorded; the strategy owner should update A11.
- **Before the upload (Yu's hand, in the S2 sitting):** phone-verify the `@rewardsproapp` channel and check that its
  advanced features are on. "For URLs in the description to be rendered as clickable links in the YouTube UI, the
  channel must meet platform-level requirements, such as channel verification or having Advanced Features enabled"
  (Data API videos resource), and a custom thumbnail can be uploaded "if your account is verified" (help 72431),
  both read 2026-11-07. Otherwise the link shows as plain text and YouTube picks a frame.
- **A12 thumbnail:** 3840×2160, 16:9, JPG or PNG, at most 2 MB so it uploads from a phone or a computer (help 72431:
  "a minimum width of 640 pixels", "Mobile: 2 MB for video thumbnails", "Desktop: 50MB").
- **Limits:** title 100 characters, description 5,000, no `<` or `>` (see "How to read").
- Status: `after G0`. The recording is captured in the G0 sitting (STRATEGY §13 step 13) on a dev store with
  @example.com buyers, with the admin name fixed to "RewardsPro" or cropped (`shopify.app.toml:10` still carries the
  old two-word spelling).

### 2.5 CH1, the first dated entry · rewardspro.io `/changes` · 292 chars

> <D Month YYYY>. The current version of RewardsPro is live for every store that installs it from the Shopify App
> Store. [rp-live-release] When an order is paid, it adds cashback to the customer's Shopify store credit.
> [rp-paid-trigger, rp-store-credit] A refund takes back its share of the cashback, from store credit the customer
> still holds. [rp-refund-takeback]

- This is for whoever rewrites #130. It is updated only inside a deploy Yu is already doing (STRATEGY §3).
- Status: `after G0`.

### 2.6 Shopify Community at S2

Nothing from agents. From S2, Yu may write **one** disclosed Ask & Offer post in his own words, and reply to Ask &
Offer requests that fit. What it must contain is listed in `community-rules.md` §2.4.

---

## 3. Evergreen drafts (12)

These are candidates, not a schedule. One goes out only when it is a milestone, meaning a merchant-visible change
shipped or a held claim became verified, and only inside the cadence of 0–2 LinkedIn posts in any 30 days
(STRATEGY §8). Pillars are HYPOTHESES (STRATEGY §5).

| Id | Pillar | Channel | Chars / limit | Image | Claims | Status |
|---|---|---|---|---|---|---|
| E1 | H3 the rules, exactly | LinkedIn | 350 / 3,000 | A7 rule card | rp-cashback-base; example NO-ROW (rp-cashback-example) | `after G0`, and the example row |
| E2 | H3 | LinkedIn | 549 / 3,000 | none | rp-free, rp-merchant-funds, sh-sc-fee; rate clause NO-ROW | `after G0` (rp-merchant-funds states rp-store-credit's mechanism, §1.1), unless the claims maker rules otherwise |
| E3 | H1 what changed | LinkedIn | 208 / 3,000 | none (no frame in the shot list) | rp-review-ask | `after claim rp-review-ask verified` (with its guard test) |
| E4 | H1 | LinkedIn | 104 / 3,000 | SH-7 Settings | rp-no-own-email | `after claim rp-no-own-email verified` (with its guard test) |
| E5 | H2 shown working | LinkedIn | 152 / 3,000 | SH-6, Order section | rp-paid-trigger, rp-store-credit | `after G0` |
| E6 | H2 | LinkedIn | 261 / 3,000 | SH-6, take-back table | rp-refund-takeback; example NO-ROW (rp-refund-example) | `after G0`, and the example row |
| E7 | H2 | LinkedIn | 285 / 3,000 | SH-3 Tiers | rp-vip-tiers, rp-tier-window | `after G0` |
| E8 | H2 | LinkedIn | 141 / 3,000 | SH-4 customer panel | rp-tier-lock | `after G0` |
| E9 | H2 | LinkedIn | 128 / 3,000 | SH-1 Home, "Set up cashback" | rp-setup-steps | `after G0` |
| E10 | H2 | LinkedIn | 188 / 3,000 | SH-8a and SH-8b, 1080×1350 crops | rp-widget | `after G0` plus the rest of gate C |
| E11 | H4 who makes it | LinkedIn | 101 / 3,000 | none | rp-maker, rp-contact-delivers | `after claim rp-maker, rp-contact-delivers verified` |
| E12 | H2 | YouTube | title 46 / 100; description 823 / 5,000 | a new recording, V2 | rp-setup-steps, rp-on-app-store, rp-free, rp-merchant-funds, sh-sc-fee, rp-ai-drafted, rp-maker, rp-contact-delivers | `after G0`, and only if H2 holds |

**E1 · Cashback maths · LinkedIn · 350 chars**

> Cashback in RewardsPro is paid on the product price after discounts. Shipping, and anything paid with store credit
> or gift cards, earns nothing. [rp-cashback-base] Example from our test store, prices including VAT: £600 of
> products, £60 off, £10 shipping. Cashback is worked out on £540; at 5%, that is £27.00. Checked on a Shopify
> development store, <D Month YYYY>. [example: NO-ROW, suggested rp-cashback-example]

- Image: **A7 rule card** (draft file above). Alt text: the card's sidecar `alt_text` (authoritative, 299
  characters). This file's earlier 387-character draft is withdrawn: the card now also carries the kicker
  "Cashback, paid as Shopify store credit" and the date line "Checked with a test build on our development
  store, <D Month YYYY>.", where E1's text says "Checked on a Shopify development store". Align the date line
  before the pack (completeness check, 2026-11-07).
- **The figures need a row.** They match staging check B (`docs/staging-run.md:23`) and the G0 order O1 the shot
  list plans (`../shot-list.md` §2), but they sit in no ledger sentence, so G4's numbers-from-ledger rule blocks
  them. Staging ran on a staging app whose local database was thrown away (`docs/staging-run.md:7-10`). Suggested
  row for the claims maker: rp-cashback-example, its sentence holding the figures, its evidence the G0 capture
  (SH-6) or production check B. The date line names the store and date, as rp-cashback-base asks.
- Prices excluding tax weren't tested, so they are never mentioned (STRATEGY §6.2 C1). No tax or VAT advice.

**E2 · What "free" means · LinkedIn · 549 chars**

> What "free" means for RewardsPro.
>
> RewardsPro is free for every store that installs it, and no paid plans are offered. The cashback is store credit
> in your own shop, so you fund the cashback you give. [rp-free, rp-merchant-funds]
>
> There is also a Shopify cost to know about. For Shopify stores created on or after 12 May 2025, Shopify charges
> third-party transaction fees on the part of an order paid with store credit. [sh-sc-fee] The rate depends on your
> Shopify plan. [rate clause: NO-ROW until the claims maker adds it to sh-sc-fee; otherwise the sentence goes]
>
> Source: Shopify Help Center, its pages on store credit and on third-party transaction fees, checked <D Month YYYY>.

- Image: none, so the source line names the pages without their address (Links rule above). It never says "free
  forever", "no fees" or "costs nothing" (STRATEGY §4, never-say 1).
- "The rate depends on your Shopify plan" is true today: the fees page says "The rate for third-party transaction
  charges varies depending on your pricing plan" (GET 2026-11-07, generic User-Agent, HTTP 200). The same page says
  "Transaction fees don't apply for POS orders or for manual payment methods"; this post keeps to the store-credit
  page's wording and doesn't extend the fee to those.
- Not a pre-G0 candidate: its free paragraph is rp-merchant-funds in full, which states the store-credit mechanism
  (§1.1).

**E3 · How we ask for a review · LinkedIn · 208 chars**

> RewardsPro asks for a review only after your store's third cashback entry and at least seven days with the app,
> and stops once you dismiss it or Shopify has shown the request. Nothing is offered for a review. [rp-review-ask]

- Text: rp-review-ask word for word. The strategy's C3 says "once", which the code doesn't do: while the request is
  due, every Home visit asks Shopify to show it and shows the card, until the merchant dismisses it or Shopify
  answers `success` or `already-reviewed` (`app/routes/app._index.tsx:265-277, 189-197`; `app/admin/home-rules.ts:43-44`;
  `app/lib/stats.server.ts:238-245`; rp-review-ask's uncertainties). The strategy owner should fix C3 in STRATEGY §6.2.
- Image: none. The shot list has no frame of Home's review card (SH-1 to SH-8). If one is wanted, it's a request to
  the shot-list maker: the card reads "A review helps other merchants find RewardsPro." with "Leave a review" and
  "Dismiss" (`app/routes/app._index.tsx:511-525`), and it needs a store with 3 cashback entries that is 7 days old
  (`app/lib/stats.server.ts:224-245`).

**E4 · No email of our own · LinkedIn · 104 chars**

> RewardsPro sends no email. One setting, off by default, asks Shopify to send its own store-credit email.
> [rp-no-own-email]

- Image: **SH-7 Settings**. Alt text: "RewardsPro's Settings page. Under Cashback emails, a switch labelled Email
  buyers when they earn store credit is off, with the note: Shopify sends this email itself. RewardsPro sends no
  email." (UI text: `app/routes/app.settings._index.tsx:48-51`.)
- The guard test that fails if a mail library appears comes first (STRATEGY §6.3).

**E5 · Paid, not fulfilled · LinkedIn · 152 chars**

> In RewardsPro, cashback is added when an order is paid; it doesn't wait for the order to be fulfilled. RewardsPro
> pays cashback as Shopify store credit. [rp-paid-trigger, rp-store-credit]

- Image: **SH-6**, the Order section (the Orders list, SH-5, is 16:9 only). Alt text (match it to the capture): "A
  test order's panel in RewardsPro, showing the cashback it earned and its status."
- Never "instantly" or a time (STRATEGY §4, never-say 4).

**E6 · Refunds take back their share · LinkedIn · 261 chars**

> In RewardsPro, a refund takes back its share of the cashback, from store credit the customer still holds.
> [rp-refund-takeback] Example from our test store: refunding one of two items took back £13.50 of the £27.00
> cashback. Checked on a Shopify development store, <D Month YYYY>. [example: NO-ROW, suggested rp-refund-example]

- Image: **SH-6**, its 1080×1350 crop of the Order section and the take-back table (`../shot-list.md` §6). Alt text
  (match it to the capture): "A test order in RewardsPro: £27.00 of cashback at 5% was issued, and a refund of one
  item took back £13.50."
- **The figures are the ones SH-6 is planned to show** (O1 and R1, `../shot-list.md` §2; the £13.50 is marked [I]
  there). Replace them with what the capture shows. Like E1's, they need a row (suggested rp-refund-example, its
  evidence the G0 capture). Staging checks E (£10.00 of £20.00) and F (£16.06 of £27.00) were other orders, so they
  aren't used, and the text and image tell one example.

**E7 · Tiers by spend · LinkedIn · 285 chars**

> In RewardsPro you set tiers by spend, each with its own cashback rate. Customers move between tiers as their spend
> changes. [rp-vip-tiers] Tiers count each customer's spend over the last 12 months, or over all time since
> RewardsPro started counting, which reaches back up to 12 months before install. [rp-tier-window]

- **Why the window carries its limit:** "all time" counts only the orders RewardsPro holds, which start at the import
  horizon, at most 12 months before install, or 60 days without `read_all_orders`
  (`app/shopify/bulk-import.server.ts:1-4, 37-39`; `app/lib/tiers.server.ts:67-68, 95-103`). The first draft used the
  bare "…or all time"; the claims fix maker has since reworded rp-tier-window to this sentence, used here word for
  word. Production's import on rewardsprotesting ran at 365 days (`docs/switch.md:75` at 6bd092cb); "up to 12 months"
  stays true either way.
- Image: **SH-3 Tiers**. Alt text: "RewardsPro's Tiers page in a test store: a table of tiers, each with a minimum
  spend and a cashback rate, and the choice of how spend is counted." (`app/routes/app.tiers.tsx:411-416`.)
- Outcome words ("bring buyers back", "retention") stay out; they are hypotheses (STRATEGY §3.2).

**E8 · Lock a tier · LinkedIn · 141 chars**

> In RewardsPro you can lock a customer to a tier. Open the customer and choose a tier under "Lock to a tier";
> "Return to automatic" undoes it. [rp-tier-lock; labels at `app/routes/app.customers.$id.tsx:158-180`]

- Image: **SH-4 customer panel**. Alt text: "A customer's page in RewardsPro, with their tier, the spend counted, and a
  Lock to a tier control." Use an @example.com buyer, or crop the name out.

**E9 · Setup in three steps · LinkedIn · 128 chars**

> Setting up RewardsPro is three steps: set a base cashback rate, switch cashback on, and turn on the widget in your
> theme editor. [rp-setup-steps]

- Image: **SH-1 Home**, "Set up cashback". Alt text: "RewardsPro's Home page with the Set up cashback card: a base
  cashback rate, a switch to turn cashback on, and a step to turn on the widget in the theme."
- Never "in minutes" or "no theme changes" (STRATEGY §4, never-say 5).

**E10 · The widget · LinkedIn · 188 chars**

> RewardsPro has a widget you turn on in your theme editor. It shows signed-in customers their tier, cashback rate,
> store credit and progress; guests see your base rate and a sign-in prompt. [rp-widget]

- Images: **SH-8a (signed in)** and **SH-8b (guest)**, each as its 1080×1350 (4:5) crop of the open panel with the
  launcher, made from the 1170×2532 phone master as `../shot-list.md` §3 and SH-8 describe. 390 px is the
  capture viewport, not the image size: LinkedIn needs at least 552 px wide and centre-crops anything taller than
  4:5 (a527229). Light; the Dark variants too if gate C covered them. Alt texts: "A test store's product list on a
  phone, with the RewardsPro widget open for a signed-in customer: Your tier, the cashback rate as store credit, Your
  store credit, and progress to the next tier." / "The RewardsPro widget for a guest on a phone: Sign in to see your
  rewards, Earn 5% back as store credit, and a Sign in button." (Words:
  `extensions/rewards-widget/locales/en.default.json:2-15`; the 5% is the test store's base rate.)
- Since B3's release, buyers see the new widget on stores whose app proxy path is `/apps/rewardspro` (rp-live-release's
  uncertainties). Gate C at 390 px, in Light and on a product page, is still open. Never "lightweight" or "doesn't slow your store" (Lighthouse not run).

**E11 · Who makes it · LinkedIn · 101 chars**

> RewardsPro is made by Cambridge TCG Limited, London, UK. [rp-maker] Questions reach us at contact@rewardspro.io.
> [rp-contact-delivers]

- Both sentences are ledger sentences word for word. "London, UK" names the registered office, a serviced address,
  so nothing implies an office open to visitors (rp-maker's uncertainties).
- Image: none. No card-shop or TCG framing before the interviews, and nothing implying we run a Shopify card shop
  (STRATEGY §5, H4).

**E12 · Setup recording, V2 · YouTube**

Title · 46 chars:

> RewardsPro: setting up cashback in three steps

Description · 823 chars:

> A screen recording from a test store. Setting up RewardsPro is three steps: set a base cashback rate, switch
> cashback on, and turn on the widget in your theme editor. [rp-setup-steps]
>
> RewardsPro is an app for Shopify stores. [rp-on-app-store] RewardsPro is free for every store that installs it, and
> no paid plans are offered. The cashback is store credit in your own shop, so you fund the cashback you give.
> [rp-free, rp-merchant-funds] For Shopify stores created on or after 12 May 2025, Shopify charges third-party transaction fees
> on the part of an order paid with store credit. [sh-sc-fee]
>
> Recorded on <D Month YYYY>. This description and the captions were drafted with AI help and checked by a person
> before we posted them. [rp-ai-drafted, worded for a video; D5 decides where the AI line goes]
>
> Made by Cambridge TCG Limited, London, UK. Questions reach us at contact@rewardspro.io. [rp-maker,
> rp-contact-delivers]
> https://rewardspro.io/?utm_source=youtube&utm_medium=video&utm_campaign=e12

- Replace `<D Month YYYY>` before pasting: YouTube bars `<` and `>`.
- The link is clickable only on a verified channel (§2.4).
- Media: a 60–90 s real recording (one of the G0 shot list's 3 recordings, STRATEGY §13 step 6), with captions
  that name the app's own labels. If the widget shows on screen, rp-widget must be verified first.
- Status: `after G0`, and only if H2 holds, because the strategy allows at most 2 more videos in 90 days after V1
  (STRATEGY §8).

---

## 4. Corrections: a rule, not a pillar

**CORR** · LinkedIn, on the channel where the error appeared · 225 chars (`<D Month YYYY>` at 17; the other
placeholders as written, so the real sentences add to it)

> Correction, <D Month YYYY>. We said: <old sentence>. What is true: <new sentence>. Source: <source>, checked
> <date>. The note is also on https://rewardspro.io/changes?utm_source=linkedin&utm_medium=social&utm_campaign=corr

- `/changes` exists only once the #130 rewrite is deployed (S2 condition d); neither main nor #130 has it today.
- Image: **A9 correction card** (draft file above) with the same text. Alt text: "A card headed Correction, <D Month
  YYYY>. We said: <old sentence>. What is true: <new sentence>. Source: <source>, checked <date>. The RewardsPro logo
  is at the bottom."
- Posted within 7 days of finding the error. The ledger's `correction_url` is filled in, and nothing is silently
  edited, typos aside (STRATEGY §5).
- PROPOSAL: a correction doesn't count towards the 0–2 a month ceiling, because it is a duty, not promotion. Yu
  decides.

---

## 5. What this file deliberately leaves out

- Any post naming points, raffles, mystery boxes, memberships, tier products or other removed features (D9, default
  no; chance-word rule).
- POS, multi-currency, "data in London", erasure timing, "12 months of past orders count", "guests don't earn", the
  widget's size as a speed claim (STRATEGY §6.4).
- Numbers that aren't in the ledger, testimonials, merchant names, "first merchant" posts, comparisons with other
  apps, "only", "best" (STRATEGY §4, §14).
- Teasers, countdowns, deadlines, "spots left".
- Any text for Shopify Community, Reddit or Facebook groups.
- The Shopify App Store badge (A14). Only Shopify's unaltered file, from S2, if Yu wants it.
