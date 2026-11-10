# RewardsPro video V1: "One paid order, start to finish"

**AFTER G0. Nothing here may be recorded for publishing, uploaded or posted before S2** (STRATEGY §2,
§6.1). Agents' proposal for the owner, 2026-11-07 (maker "shots"). Nothing was recorded, uploaded, posted or
signed up for.

Labels as in [STRATEGY.md](STRATEGY.md): **[V]** verified (file:line or URL plus date), **[I]** inferred,
**[U]** unknown, **PROPOSAL** a choice for the owner. Brackets such as `[rp-store-credit]` are claim ids. They are
never pasted.

---

## Summary

1. **V1 is an 86-second silent screen recording** of one test order: tiers, the order marked as paid, the cashback recorded, the store credit in Shopify, then a refund taking back its share. It is 1920×1080 H.264 with captions burned into the picture, readable with the sound off.
2. **Its footage is the G0 sitting's own order O1 and refund R1** ([shot-list.md](shot-list.md) §2, recordings REC-1 and REC-2). So the video and G0's evidence are the same events.
3. **Two captions differ from the strategy's A11 proposal.**
   - "A customer pays for an order" became "The order is marked as paid". The dataset's orders are draft orders marked as paid, because an order Shopify flags as a test earns nothing (`apps/rewards/app/lib/record-order.server.ts:66`).
   - "A test store with test customers" moved onto the title card.
4. **V1 belongs on YouTube (@rewardsproapp), LinkedIn and rewardspro.io, not the listing.** It shows Shopify's own admin pages (the order, the refund, the customer's store credit), and requirement 4.4.3 says "Do not use our trademarks in your app icon, banner, or screenshots". Whether that reaches the listing's video is [U]. Shopify's best practice for the listing's feature media is also "promotional rather than instructional", with "screencasts to 25% of the video" (shopify.dev, read 2026-11-07). V1 is instructional and about 85% screencast. **PROPOSAL:** the listing uses the A13 still image. Off the listing, V1 shows Shopify's admin content area only, on the conditions in §2 and §10 (D-video-3).
5. **No vertical cut.** STRATEGY §7 lists "vertical 1080×1920 or Shorts cuts" as not made, and TikTok, Reels and Shorts have no role in the plan (§8 below).

---

## 1. What V1 shows, and its claims

| Shown | Claim ids |
|---|---|
| Tiers set by spend, each with its own rate | rp-vip-tiers |
| Cashback added while the order is paid but not fulfilled | rp-paid-trigger |
| The cashback base: products after discounts, with shipping excluded; £540 at 5% is £27.00 | rp-cashback-base |
| The cashback held as Shopify store credit on the customer | rp-store-credit |
| A refund of one item taking back its share, £13.50, from the credit left | rp-refund-takeback |
| Who makes it (end card) | rp-on-app-store, rp-maker |

STRATEGY §6.1 tagged V1 with `rp-paid-trigger`, `rp-store-credit` and `rp-refund-takeback`. This script also
uses `rp-vip-tiers`, `rp-cashback-base`, `rp-on-app-store` and `rp-maker`. **Every one must be `verified`
and unexpired before V1 is published.** If one isn't, its scene and caption come out; captions are never
softened to fit.

V1 doesn't show the widget: `rp-widget` waits for B3 plus gate C, and the signed-in buyer's address must stay
off screen. It also doesn't show "free" or any claim about speed, data location, POS, currencies or guests
(STRATEGY §4 and §6.4).

---

## 2. Before recording

- **The test store and dataset** in shot-list.md §2: tiers set, cashback on, customers and products made. Build O1's draft order (2 × Example item A, an order discount of £60.00, shipping £10.00, customer Alex Example) but don't mark it as paid yet. Pick the customer before recording, so the draft order's customer picker, which lists every customer, never shows. Nothing is fulfilled.
- **The admin name.** Shopify's title bar probably shows the app name "Rewards Pro" [I: from the local `apps/rewards/shopify.app.toml:10`, not observed in the admin]. Either the fix to "RewardsPro" is released first (STRATEGY §13 step 13), or the recording region starts below the title bar.
- **Shopify's admin in V1 (PROPOSAL, D-video-3).** V1 is the one public use of Shopify's admin pages in this plan (the EV frames stay private, shot-list.md §7). Scenes 3, 4, 8, 9 and 11 show Shopify's content area only: no logo, top bar or sidebar. Whether Shopify's brand guidelines allow that footage on YouTube, LinkedIn and rewardspro.io is [U], and the owner settles it before V1 is published (§10), with a legal and brand read if he wants one (STRATEGY D8 already asks whether to get a legal read on the PPA). If the owner says no, those scenes come out and V1 shows only RewardsPro's frame; Shopify's side then stays in the private EV frames.
- **The recording region** is one fixed 16:9 rectangle over the page content: right of Shopify's sidebar and below its top bar. That keeps out the Shopify logo, the store name, other apps, the owner's account menu, browser chrome and the menu bar (shot-list.md §4). Inside the content area, the owner scrolls each Shopify page so that the region:
  - ends above the Timeline and its comment box. Shopify shows a staff profile photo beside comments (help.shopify.com/en/manual/shopify-admin/productivity-tools/timeline, read 2026-11-07), and the Timeline may name the staff account that created, marked as paid or refunded the order [I];
  - on Alex's customer page, holds the store credit balance only: no store-credit history or Timeline, which may name the app by its admin name "Rewards Pro" [I]. If Shopify's page can't be framed that way inside the region, the scene is cut and its claim rests on RewardsPro's panel plus the private EV-2;
  - never shows Shopify's Customers index or customer search. Scenes 8 and 11 open Alex's page from the customer card on O1's order page, not from the Customers list.
- **The region's size:** 1280×720 points on a Retina screen (2560×1440 px), so scene 7's zoom needs no upscaling. 960×540 points (1920×1080 px) is the floor, and at that size scene 7 has no zoom.
  - On a 13-inch MacBook Air, the default scaled resolution may leave too little room beside the sidebar. Display settings "More Space", or an external display, solves it [I].
- **Tools:** macOS Screenshot → Record Selected Portion (Cmd-Shift-5), microphone None, cursor shown, no click highlights. Chrome at 100% zoom.
- **Before each recording** (the stills avoid this because DevTools captures only the viewport; a screen recording takes whatever is drawn in the region):
  - Focus (Do Not Disturb) on, so no notification banner can appear;
  - other apps quit or hidden;
  - a Chrome profile with no saved addresses, passwords or payment methods, and no extensions that draw popups, so no autofill list, password prompt or extension popup can open in the region;
  - Chrome's download bubble and any permission prompt kept out of the region;
  - before REC-2, the review ask has ended (shot-list.md §4: EV-7 first), because opening the app lands on Home [I], and its review section or Shopify's review dialog must never be in footage.
- **Rules while recording:**
  - Record continuously where possible.
  - Never fake a state, re-type a value, or reload until a number "looks right".
  - If a payout first shows "Waiting" (`apps/rewards/app/lib/status.ts:15-26`), let the recording show it, or cut and start the next caption with "Later:".

---

## 3. Scene list (86 s)

On-screen text is in Inter (Regular and SemiBold). Cards are white on navy `#1A3E5C` (11.13:1, `kit/colour`),
with the reversed lockup `kit/logo/lockup-horizontal-reversed.svg`. Durations allow at least about 3 words a
second plus 1 second [I: a common subtitle reading rate; not re-read today].

| # | Time | On-screen action (source) | Caption (exact) | Words | Claim ids |
|---|---|---|---|---|---|
| 1 | 0:00–0:07 | Title card on navy: the lockup, the title and the subtitle (our art) | Title: "One paid order, start to finish" / subtitle: "Recorded on a Shopify development store with test customers, <D Month YYYY>." | 18 | none (describes the recording) |
| 2 | 0:07–0:13 | RewardsPro → Tiers: Everyone 5% (£0), Silver 7% (£250), Gold 10% (£500); "Spend counted over: Last 12 months" (REC-1) | "Tiers are set by spend, each with its own cashback rate." | 11 | rp-vip-tiers |
| 3 | 0:13–0:20 | Shopify: O1's draft order for Alex Example, showing 2 × Example item A, the £60.00 discount, £10.00 shipping and the £550.00 total (REC-1) | "A test customer's order: £600 of products, £60 off and £10 shipping." | 12 | none (describes the test order) |
| 4 | 0:20–0:26 | Collect payment → Mark as paid. The order page shows Paid and Unfulfilled (REC-1) | "The order is marked as paid. It isn't fulfilled." | 9 | rp-paid-trigger |
| 5 | 0:26–0:33 | RewardsPro → Orders → O1, at the top of the list with its cashback; click it (REC-1) | "In RewardsPro, the order is recorded with its cashback." | 9 | rp-paid-trigger |
| 6 | 0:33–0:41 | O1's panel: "Products after discounts: £540.00", "Earns cashback on: £540.00". The caption bar sits at the top here | "Cashback is paid on the product price after discounts. Shipping earns nothing." | 12 | rp-cashback-base |
| 7 | 0:41–0:47 | The same panel: Cashback £27.00, Everyone 5%, Issued. Zoomed to at most 1.33× only from a 2560×1440 px region (2560 / 1.33 ≈ 1925 px, so the crop still scales down to 1920); from a 1920×1080 px region, no zoom | "£540 at 5%: £27.00." | 4 | rp-cashback-base |
| 8 | 0:47–0:55 | Shopify → O1's order page → the customer card → Alex Example (never the Customers list): Store credit £27.00, the balance only (REC-1) | "The £27.00 is the customer's Shopify store credit." | 8 | rp-store-credit |
| 9 | 0:55–1:04 | Shopify → O1 → Refund: quantity 1 of Example item A, shipping not refunded, Refund £270.00 [I] (REC-2) | "One of the two items is refunded." | 7 | none (describes the action) |
| 10 | 1:04–1:12 | RewardsPro → O1's panel: "Taken back for a refund" −£13.50, Taken back; Refunds: Products returned £270.00, Cashback taken back £13.50 (REC-2) | "The refund takes back its share of the cashback: £13.50." | 10 | rp-refund-takeback |
| 11 | 1:12–1:19 | Shopify → O1's order page → the customer card → Alex Example: Store credit £13.50, the balance only (REC-2) | "Store credit left on the customer: £13.50." | 7 | rp-refund-takeback |
| 12 | 1:19–1:26 | End card on navy: the lockup, one line, the address | "An app for Shopify stores, made by Cambridge TCG Limited, London, UK." / "rewardspro.io" | 13 | rp-on-app-store, rp-maker |

- **The amounts in scenes 9–11** are what the rules in code predict [I]. If the screen shows another amount, the caption changes to the observed one, the agents are told (it's a finding), and the claims maker decides whether the claim still stands.
- **Optional end-card line**, only if the owner settles D4 and `rp-free` and `rp-merchant-funds` are verified: "Free app; you fund the cashback." It meets the free-pair rule in the same card. Without it, V1 never says "free".
- **The cut rule:** any cut that removes waiting time puts "Later:" at the start of the next caption. The sidecar records each cut's length. No caption uses a timing word ("instantly", "seconds", "real-time", "at once", "immediately").

---

## 4. Caption style

- Inter SemiBold, 44 px at 1920×1080, white `#FFFFFF` on an **opaque** navy `#1A3E5C` bar (11.13:1). A semi-transparent bar would leave the contrast to the footage.
- At most 2 lines and 42 characters a line, centred. The bar sits inside the central 90% of the frame (title-safe) [I].
- Bottom by default. Top for scene 6, and wherever the bar would cover the values being read.
- One caption at a time, with no animated words, emoji, arrows, circles or highlights.

---

## 5. The transcript (SRT)

This is the typed source of the burned-in captions. The final times come from the edit. **PROPOSAL:**
upload no caption track where the captions are burned in, because a viewer with captions on would see every
line twice. The transcript goes in the YouTube description instead (§7). If the owner prefers platform captions
(they can be switched off and are searchable), export a clean copy with no burned-in text and upload this
file to it. That is the owner's word (D-video-1). STRATEGY A11 said "burned-in captions plus an SRT", so this
changes that.

```srt
1
00:00:00,000 --> 00:00:07,000
One paid order, start to finish
Recorded on a Shopify development store
with test customers, <D Month YYYY>.

2
00:00:07,000 --> 00:00:13,000
Tiers are set by spend,
each with its own cashback rate.

3
00:00:13,000 --> 00:00:20,000
A test customer's order: £600 of products,
£60 off and £10 shipping.

4
00:00:20,000 --> 00:00:26,000
The order is marked as paid.
It isn't fulfilled.

5
00:00:26,000 --> 00:00:33,000
In RewardsPro, the order is recorded
with its cashback.

6
00:00:33,000 --> 00:00:41,000
Cashback is paid on the product price
after discounts. Shipping earns nothing.

7
00:00:41,000 --> 00:00:47,000
£540 at 5%: £27.00.

8
00:00:47,000 --> 00:00:55,000
The £27.00 is the customer's
Shopify store credit.

9
00:00:55,000 --> 00:01:04,000
One of the two items is refunded.

10
00:01:04,000 --> 00:01:12,000
The refund takes back its share
of the cashback: £13.50.

11
00:01:12,000 --> 00:01:19,000
Store credit left on the customer: £13.50.

12
00:01:19,000 --> 00:01:26,000
An app for Shopify stores,
made by Cambridge TCG Limited, London, UK.
rewardspro.io
```

Entries 1 and 12 are the title and end cards, so they run to three lines. Every caption entry (2–11) keeps to two.
Each entry matches the scene table's caption word for word; the end card's lockup shows the name RewardsPro
as artwork, so the line itself doesn't repeat it.

---

## 6. Edit and export (agents, locally, from the owner's files)

**Inputs:** the owner's REC-1 and REC-2 files, plus the title and end cards and caption images. Agents add
nothing else: no stock footage, no music, no generated media, no synthetic voice. Any voiceover later is the owner's
own voice only.

**The route** (untested end to end [U]; smoke-test it on a throwaway clip before the G0 sitting):
1. Render the cards (1920×1080) and one transparent PNG per caption with vectorcraft-cli, which bundles Inter (STRATEGY §7). ffmpeg here can't draw text: `/opt/homebrew/bin/ffmpeg` 8.1.2 has `overlay`, `crop`, `scale`, `fade`, `xfade`, `concat` and `libx264`, but no `subtitles` or `drawtext` filter [V, checked 2026-11-07].
2. With ffmpeg:
   - trim and crop each scene, and scale to 1920×1080 (scaling down only);
   - convert to 30 fps constant frame rate;
   - overlay each caption PNG for its time;
   - join the scenes with hard cuts (or a 6-frame fade into and out of the cards).
3. Export as H.264 High, yuv420p, 1920×1080, 30 fps, about 8 Mbps [I: YouTube's usual 1080p advice, not re-read], MP4 with `+faststart`. No audio track, or a silent one [U: whether any target needs one].
4. Write a sidecar `rewardspro_s2_v1-paid-order_captioned_1920x1080_<yyyymmdd>_v01.mp4.meta.json` (ASSETS D3). It holds:
   - the sha256 of the inputs;
   - every cut, with what it removed;
   - `ai_involvement: "none"` for the picture;
   - the claims shown;
   - the checker's result.

**The checker** (a different session):
- extracts one frame a second (`ffmpeg -vf fps=1`) plus every caption's first frame;
- reads each at full size against shot-list.md §4: emails, names, domains, the Shopify logo, "Rewards Pro", other apps, the owner's account, staff avatars or initials, the Timeline or comment box, store-credit history, the Customers list or search, and any overlay (a notification, autofill list, password prompt, extension popup or download bubble);
- compares every caption with the SRT and its claim id;
- runs G1–G6 on the captions, title, description and thumbnail text.

---

## 7. YouTube

**Channel:** `@rewardsproapp`, the RewardsPro Brand Account (STRATEGY §3), never @CambridgeTCG. The owner uploads.
Agents never hold the login.

**Title** (PROPOSAL; the limit is 100 characters, "Video titles have a character limit of 100 characters", support.google.com/youtube/answer/57404, read 2026-11-07):
- **YT-T1 (recommended):** "One paid order, start to finish | RewardsPro" (44 characters). It makes no claim.
- **YT-T2:** "RewardsPro: cashback as Shopify store credit, and a refund taking back its share" (80 characters) [rp-store-credit, rp-refund-takeback]. "Shopify" here only says what it works with (PPA Part C s.3; STRATEGY §3.1). The checker confirms.

**Description** (PROPOSAL; 1,887 characters, or 2,148 with the optional block, recounted 2026-11-07 after the business-register edit ("The recording has no sound."), the neutral listing label and the ledger's free and fee sentences, with the bracketed ids out, the transcript pasted in and a 16-character date such as "20 November 2026"; the limit is 5,000 from the same page). Bracketed ids come out before pasting. The cashback paragraph says only what V1 shows. It doesn't use the ledger's full `rp-cashback-base` sentence ("Shipping, and anything paid with store credit or gift cards, earns nothing."): V1 shows neither tender, and no gift-card order has been run anywhere (`apps/rewards/docs/staging-run.md:36-44`).

```text
A screen recording of one order on a Shopify development store with test customers, recorded on <D Month YYYY>. The recording has no sound. The captions are in the picture, and the transcript is below.

When the order was marked as paid, RewardsPro recorded it and added cashback to the customer's Shopify store credit. The order hadn't been fulfilled. [rp-paid-trigger, rp-store-credit]

Cashback is paid on the product price after discounts. Shipping earns nothing. This order had £600 of products, £60 off and £10 shipping, with prices including VAT, so cashback was worked out on £540. At 5%, that is £27.00. [rp-cashback-base]

Refunding one of the two items took back its share of the cashback, £13.50, from the customer's store credit. [rp-refund-takeback]

0:00 Title and tiers
0:13 The order is marked as paid
0:26 RewardsPro records the cashback
0:47 Store credit, and a refund

RewardsPro is an app for Shopify stores, made by Cambridge TCG Limited, London, UK. [rp-on-app-store, rp-maker]
App listing: https://apps.shopify.com/rewards-pro
Website: https://rewardspro.io/?utm_source=youtube&utm_medium=video&utm_campaign=v1-paid-order
Questions: contact@rewardspro.io

This description was drafted with AI help and checked by a person before we posted it. [rp-ai-drafted]

Transcript
<the 12 caption lines from section 5, one per line>
```

- **The optional block**, only with D4, and with `rp-free`, `rp-merchant-funds` and `sh-sc-fee` verified, the last checked within 30 days. It goes after the maker line. It is FREE-ADD (`../MESSAGING.md` §2.2): `rp-free`'s and `sh-sc-fee`'s own sentences ("no paid plans are offered" offers no plan rather than denying the two old paid agreements; "third-party transaction fees", not "its own … fee"; launch-posts §2.1). A field of 300 characters or more that says "free" must also carry Shopify's fee sentence (STRATEGY §4, never-say 2):

  ```text
  RewardsPro is free for every store that installs it, and no paid plans are offered. You fund the cashback you give. For Shopify stores created on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit.
  ```

- **Conditions on lines:**
  - The "Questions" line stays only once contact@ is shown to deliver (S2 f).
  - The website line stays only once rewardspro.io is rewritten (S2 d).
  - The listing line is labelled "App listing", not "On the Shopify App Store": that phrase is outside `rp-on-app-store`, and for social channels no Shopify source allows it (PPA Part A §5.3 bars Shopify marks in social media without written permission). It carries no claim; "On the Shopify App Store" with `rp-app-store-listed`* would wait for D8 or Shopify's written permission. The line stays only once the listing's false text is gone.
  - No link to GitHub, docs.rewardspro.io or any KINGDOM site, and no "shopify" in a UTM value (STRATEGY §3.1).
- **The AI line** adapts `rp-ai-drafted`'s ledger sentence ("Posts here are drafted with AI help…") to a description. The claims maker either records this wording or the line uses the ledger's own.
- **Chapters:** the 4 timestamps start at 0:00, and each chapter is at least 10 s long [I: YouTube's chapter rule, not re-read today].

**Thumbnail (A12)**
- **Size and format:** 3840×2160 JPG or PNG, at most 2 MB. YouTube help, read 2026-11-07: "a resolution of 3840 x 2160 pixels for videos", "a minimum width of 640 pixels", "Mobile: 2 MB for video thumbnails", "Desktop: 50 MB". Keeping under 2 MB works from either.
- **Layout (PROPOSAL):**
  - the left 44% is navy, with "One paid order, start to finish" in white Inter SemiBold on two lines, and the reversed lockup below it in its clear space;
  - the right 56% is a real crop of shot SH-6 (O1's panel with the take-back);
  - the bottom-right corner stays empty, because YouTube draws the duration there [I].
- **The source:** capture SH-6 a second time at DPR 3 (4800×2700), so the crop isn't upscaled (shot-list.md §3).
- **The text** makes no claim. No numbers, "free", arrows, faces, coins, hearts, "$", "NEW", or the Shopify logo.
- **A custom thumbnail needs a verified channel [V]:** "You can choose from auto generated suggested options, or upload your own if your account is verified" (support.google.com/youtube/answer/72431, read 2026-11-07). So A12 needs the owner to verify the channel first, by his own hand at S2 (§10) [I: YouTube verifies by phone, as for uploads over 15 minutes]. Without that, V1 goes out with one of YouTube's auto-picked frames, and the title card, as the first frame, is the safe fallback.

**Settings (PROPOSAL; the owner's hand)**

| Setting | Proposal |
|---|---|
| Visibility | Unlisted for the review pack; Public on the owner's yes at S2 |
| Audience | "No, it's not made for kids" |
| Altered or synthetic content | No: a plain screen recording with no realistic AI content (YouTube's disclosure rule, phase-1 platforms note) |
| Paid promotion | Unticked [I: the box is for paid placements and sponsorships, not a maker's own product] |
| Category | Science & Technology |
| Language | English (United Kingdom) |
| Tags and hashtags | None (STRATEGY §3.1) |
| Comments | The owner's call. Agents never reply, and the owner's time is capped, so either off or "hold all for review" |
| Embedding | Allowed (rewardspro.io; not the listing, §9) |
| End screens, cards, playlists | None |

Uploads over 15 minutes need a phone-verified account (phase-1 platforms note). V1 is 86 seconds.

---

## 8. The vertical cut (Shorts, Reels, TikTok): not made

The strategy doesn't use these:
- STRATEGY §7 says "Not made: vertical 1080×1920 or Shorts cuts … TikTok clips";
- STRATEGY §3's channel table: TikTok "Skip, unless `@rewardspro` is the owner's"; Instagram "Reserve only if `@rewardspro.io` is the owner's; otherwise skip"; YouTube "Secondary: hosts 1–3 videos, with no feed" (STRATEGY.md:106-111).

So no 15–30 s script is written. If the owner later opens one of those channels, that is a new decision of his. STRATEGY
§10 says time a channel frees "goes to outreach, never to a new platform", and never escalates "on reach
numbers alone". The cut would then:
- be re-cropped from the REC masters, never re-staged;
- be 1080×1920, with text out of the top ~14% and bottom ~20% (ASSETS B5, third-party sources);
- have a 2160×3840 thumbnail (YouTube help, read 2026-11-07);
- go through its own claims check and review pack.

---

## 9. LinkedIn, rewardspro.io and the listing

- **LinkedIn:** the owner uploads the captioned MP4 natively to the Page, with the M1 post text (STRATEGY §6.2, another maker's pack). LinkedIn Page video runs from 3 s to 10 min (phase-1 platforms note), and V1 fits. No caption file goes with it, because the captions are burned in (§5). The preview frame is the title card unless the owner sets another [I].
- **rewardspro.io:** embedded from YouTube on the #130 rewrite's page, once both exist (S2).
- **The App Store listing's feature slot (the owner's word, D-video-2).** shopify.dev best practices (read 2026-11-07) say: "Keep it promotional rather than instructional and limit screencasts to 25% of the video"; "If you don't have a video, use a static image that conveys your app's benefit or unique value." V1 is neither promotional nor under 25% screencast.
  - **PROPOSAL:** the listing uses the A13 still feature image, and V1 is not offered for the listing.
  - V1 shows Shopify's admin pages, and requirement 4.4.3 says "Do not use our trademarks in your app icon, banner, or screenshots". Whether that reaches the listing's video is [U]; we don't call V1 allowed there.
  - V1 is also not the review screencast that requirement 4.5.3 asks for ("how to set up your apps core features"). V1 doesn't show setup.

---

## 10. Before V1 is published (all must hold)

1. **S2 holds** (STRATEGY §2): G0 and B3 recorded, the listing fixed, rewardspro.io rewritten, the first-real-merchant steps done or accepted, contact@ delivering, and every claim verified.
2. **Every claim id in §1** (and the optional block's) is `verified` and unexpired. The sh-* rows were re-checked within 30 days.
3. **The admin name** reads "RewardsPro" in the footage, or the region excludes the title bar.
4. **Shopify's admin footage (D-video-3):** the owner has accepted scenes 3, 4, 8, 9 and 11 showing Shopify's content area off the listing [U until he does; §2]. Otherwise those scenes come out first.
5. **The privacy read** of the footage finds no Timeline, comment box, staff avatar, initials or staff name, no Customers list or search, no store-credit history and no overlay (§2, §6).
6. **The thumbnail:** the channel is verified by the owner (his hand) if A12 is used. If not, no custom thumbnail, and the title card is the first frame.
7. **The checker** passes the frame read and G1–G6. The review pack carries:
   - the MP4's and thumbnail's sha256;
   - the title, the description, the settings;
   - the gate report.
8. **The owner says yes** to those exact bytes on YouTube (and LinkedIn). The checker records his words in `approvals.jsonl`. The owner uploads.

---

## 11. Doubts we couldn't resolve

- **The listing slot** (§9). D-video-2. Our proposal is no: Shopify's admin is in the footage (4.4.3, [U] for video), and the 25% screencast guidance.
- **Shopify's admin footage off the listing** (§2). D-video-3. Whether Shopify's brand guidelines allow its admin's content area in our YouTube and LinkedIn video is [U].
- **What Shopify's pages draw** (the Timeline's staff names, the customer page's store-credit history and where the balance sits) is [I]: not observed for this store. The region rules in §2 assume the worst.
- **Burned-in captions plus an SRT would double on screen** (§5). D-video-1.
- **The scene 9–11 amounts** (£270.00 refund, £13.50 taken back) are inferred from code and staging check E (`apps/rewards/docs/staging-run.md:26`), not yet seen in production.
- **The YouTube custom thumbnail needs a verified channel** [V, §7]. Whether the owner verifies it (D-video-4) decides A12.
- **The caption-overlay route** (vectorcraft-cli PNGs plus ffmpeg `overlay`) is untested. FilmCraft, which ASSETS B4 names, isn't installed on this Mac [V: not in `~/craft-apps`, 2026-11-07].
- **The recording region** on a 13-inch Air is a guess [I]. An external display may be needed.
- **"Shopify development store" and "Shopify store credit"** in captions and the title are compatibility wording [I]. The PPA reading of §2.1 is already with the owner's legal read (STRATEGY §9).

## Sources

- STRATEGY.md §2, §3, §4, §6, §7, §10 and §13; [shot-list.md](shot-list.md); the design ASSETS B3, B4, B5 and D3; the phase-1 platforms note (YouTube, LinkedIn limits).
- Code at origin/main 6f3a57b6, read 2026-11-07: `apps/rewards/app/lib/record-order.server.ts:66`, `app/lib/status.ts`, `app/routes/app.orders.$id.tsx`, `app/routes/app.tiers.tsx`, `shopify.app.toml:10`, `docs/staging-run.md`, `docs/switch.md:177`.
- https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices and …/app-store-requirements, read 2026-11-07.
- https://support.google.com/youtube/answer/72431 (thumbnails) and /answer/57404 (title and description limits), read 2026-11-07.
- https://help.shopify.com/en/manual/shopify-admin/productivity-tools/timeline (profile photo beside Timeline comments), read 2026-11-07.
- `/opt/homebrew/bin/ffmpeg -filters` and `-encoders`, run 2026-11-07.
