# RewardsPro social profiles: the kit

Agents' proposal for the owner, 2026-11-07, revised the same day after a verifier pass (§8). **Nothing
is created, posted or decided.** "The owner" is the one person who publishes, sends or spends for
RewardsPro (STRATEGY §2); this file names no person. This is the profile half of the kit in
[STRATEGY.md](STRATEGY.md): handles, names, bios, links, images and alt texts for every channel the
strategy marks primary, secondary or reserve-only. [SETUP.md](SETUP.md) gives the order of hands.
[profiles.json](profiles.json) holds the same data for scripts and the checker.

**Labels.** [V] read today on the platform's own page or API. [V-arch] read raw from a Wayback copy of
the platform's page. [D-src] the platform's own source or schema. [O] observed by a probe. [S] secondary
source or search snippet. [I] inferred. [U] unknown. **PROPOSAL** means wording or a choice for the owner.

**Counting.** Every count below was made by a script (`node`, `Intl.Segmenter`), not by eye. All texts
are plain ASCII (straight apostrophes, no dashes or symbols), so characters = graphemes (Bluesky's unit)
= UTF-16 units = UTF-8 bytes. "97 / 160" means 97 characters against a limit of 160.

**Claim ids** in brackets are never pasted. A text is usable only when every claim id it lists is
`verified` and unexpired in `claims.toml` (gate G1), and the stage in STRATEGY §2 holds. Today
`claims.toml` has none of these ids verified, so **no text here can be pasted yet**, not even set A:
S0 itself waits for `rp-maker` and `rp-on-app-store` (STRATEGY §2). Four ids listed below were
requested from the claims maker (profiles.json `claim_ids_requested`). `rp-post-cadence` has since been
added to `claims.toml` as `proposed` (channel `social-profile` only). Three still have **no row**
(`rp-ai-drafted-video`, `rp-ai-drafted-profile`, `rp-maker-also-sells`; entity-card.md and
listing-delta.md asked for the same sentence as `rp-maker-other-sales` and now use this id too), and G1 fails
those texts until a row exists or the claims maker names an existing row that covers the sentence
(completeness check, 2026-11-07).

---

## 1. At a glance

| Platform | Role | Handle (first choice) | Display name | Set A (before G0) | Set B (after G0) | Avatar | Banner | Pinned |
|---|---|---|---|---|---|---|---|---|
| LinkedIn Company Page | primary, the only active feed | `linkedin.com/company/rewardsproapp` | RewardsPro | T0 + A0 | T1 + L1 | avatar-400 | A3 1512x256 | after G0: M1 |
| YouTube | secondary, hosts 1-3 videos | `@rewardsproapp` | RewardsPro | YT0 | YT1 | avatar-1024 | A4 2560x1440 | after G0: V1 featured |
| Shopify Community | secondary, optional, the owner's own personal account | the owner's own username | the owner's own | no paste text: the owner writes it (§4.3) | the same | the owner's own | none | none |
| Bluesky | reserve-only, pointer bio | `@rewardspro.io` (created as `rewardsproapp.bsky.social`) | RewardsPro | R0 | R1 | avatar-1024 | A2 1500x500 | none, ever |
| X | reserve-only, pointer bio | `@rewardsproapp` | RewardsPro | R0 | R1 | avatar-400 | A2 1500x500 | none, ever |
| Instagram (Threads follows) | reserve-only, only if `@rewardspro.io` is the owner's | `@rewardspro.io` if so | RewardsPro | R0 | R1 | avatar-1024 | none | none |
| TikTok | skip; only if `@rewardspro` is the owner's | `@rewardspro` if so | RewardsPro | TK0 | TK0 | avatar-1024 | none | none |

The App Store listing and rewardspro.io are primary **surfaces**, not social profiles. Their only part in
this kit is where profile links go at S2 (§5).

**Pinned posts.** No platform has a pinned post that is safe before G0, because nothing is posted before
S2. LinkedIn pins M1 in the S2 week, and YouTube features V1 (STRATEGY §6.2, §13 step 19). X and Bluesky
never post, so they never pin.

---

## 2. The texts

### 2.1 Set A: safe before G0

These say who makes RewardsPro, that it is an app for Shopify stores on the Shopify App Store, and that
the profile has no posts, which anyone can see on the profile itself. The first two can be checked on the
listing, with no dev-store run (`rp-maker`, `rp-on-app-store`). They are STRATEGY §3.2's S0 texts with
three changes, plus a contact variant, a short TikTok variant and an optional AI line:
- **R0 no longer opens "Reserved name for".** X prohibits username squatting, and those words describe
  the account in squatting terms (help.x.com/en/rules-and-policies/x-username-squatting, Wayback
  20260331203759, read 2026-11-07). R0 is now R1 without its link sentence.
- **A0 ends "Nothing is posted here yet."**, as YT0 does. STRATEGY's A0 ended "We post here when the app
  changes, and not otherwise." That promise had no claim row, would be false from S0 to S2 (no posts
  while B3 and B5 change the app), and the post plan goes beyond app changes after S2: STRATEGY §8 counts
  a claim becoming verified as a milestone, and content/launch-posts.md plans E1, E2, E11, L-C2 and
  correction posts.
- **CB is gone.** The Community bio is the owner's own words (§4.3).

| Id | Text | Chars | Claim ids | Used on |
|---|---|---|---|---|
| R0 | RewardsPro, an app for Shopify stores, made by Cambridge TCG Limited, London. We don't post here. | 97 | rp-maker, rp-on-app-store | X, Bluesky, Instagram bio |
| T0 | An app for Shopify stores, made by Cambridge TCG Limited, London. | 65 | rp-maker, rp-on-app-store | LinkedIn tagline |
| A0 | RewardsPro is an app for Shopify stores, listed on the Shopify App Store. It is made by Cambridge TCG Limited, a UK company in London. Nothing is posted here yet. | 162 | rp-maker, rp-on-app-store | LinkedIn About |
| YT0 | RewardsPro's channel, run by Cambridge TCG Limited, London. RewardsPro is an app for Shopify stores. Nothing is posted here yet. | 128 | rp-maker, rp-on-app-store | YouTube description |
| TK0 | RewardsPro: an app for Shopify stores by Cambridge TCG Limited. No posts here. | 78 | rp-maker, rp-on-app-store | TikTok bio, only if the account is the owner's |

**Open: A0 and A0c against the narrowed `rp-on-app-store` (completeness check, 2026-11-07).** The claims
fix pass narrowed `rp-on-app-store` to "RewardsPro is an app for Shopify stores." Its uncertainties say
"listed on the Shopify App Store" is outside the row and that A0 "needs cutting, or Shopify's written
permission" (PPA Part A §5.3; `../claims.toml`, `claims-map.md` "What is safe before G0"). A0 and A0c
above still carry the phrase, so G1 can't pass them as written. The cut forms, for the owner and the
profiles maker to pick from (counted by script, not yet in profiles.json): "RewardsPro is an app for
Shopify stores. It is made by Cambridge TCG Limited, a UK company in London. Nothing is posted here yet."
(129), and the same with " Questions: contact@rewardspro.io" (162).

**Contact variants.** Use these only once `rp-contact-delivers` is `verified`: the owner sends a test
message to contact@rewardspro.io from an outside address and sees it arrive, the claims maker records
that result as the row's evidence, and a second session concurs (STRATEGY §3.2, §13 step 10). MX being
Google Workspace doesn't prove the mailbox delivers. R0 never gets the address: the reserve accounts point
elsewhere from S2.

| Id | Text | Chars | Claim ids | Replaces |
|---|---|---|---|---|
| A0c | RewardsPro is an app for Shopify stores, listed on the Shopify App Store. It is made by Cambridge TCG Limited, a UK company in London. Nothing is posted here yet. Questions: contact@rewardspro.io | 195 | rp-maker, rp-on-app-store, rp-contact-delivers | A0 |
| YT0c | RewardsPro's channel, run by Cambridge TCG Limited, London. RewardsPro is an app for Shopify stores. Nothing is posted here yet. Questions: contact@rewardspro.io | 161 | rp-maker, rp-on-app-store, rp-contact-delivers | YT0 |

**The AI line at S0 (the owner's decision D5).** A0 and YT0 are agent-drafted public text, and neither
says so. `rp-ai-drafted` ("Posts here are drafted with AI help…") has no subject at S0, when nothing is
posted. So either S0 goes without an AI line, as a known choice, or AI0 is added after "Nothing is posted
here yet." in A0/A0c and YT0/YT0c. AI0 needs a claim row of its own (`rp-ai-drafted-profile`, requested;
none exists). With AI0: A0 233, A0c 266, YT0 199, YT0c 232 characters, all far under the limits. R0, T0
and TK0 stay without it, as D5 proposes the line for About fields and video descriptions only.

| Id | Text | Chars | Claim ids | Used on |
|---|---|---|---|---|
| AI0 | The text on this page is drafted with AI help and checked by a person. | 70 | rp-ai-drafted-profile | optional, after A0/A0c and YT0/YT0c |

**The purpose line (PROPOSAL, added later on 2026-11-07).** The owner approved "loyal customers" as the term for
RewardsPro copy, in a business register (`../approvals.jsonl`, `rp-term-loyal-customers`), and his umbrella idea
is in `../MESSAGING.md` §0–§1. PU0 carries that idea into the About and description fields, as an option like AI0.
It goes straight after the sentence "RewardsPro is an app for Shopify stores…" in A0/A0c, YT0/YT0c, L1/L1W and YT1.
With it: A0 205, A0c 238, YT0 171, YT0c 204, L1 1,213, L1W 1,384, YT1 490 characters, all under the limits in §4.
R0, R1, T0, T1 and TK0 stay without it: they are claim-light or near their limits. It says what RewardsPro is for,
not what it achieves, so it carries no outcome.

| Id | Text | Chars | Claim ids | Used on |
|---|---|---|---|---|
| PU0 | It is built for rewarding loyal customers. | 42 | rp-purpose | optional, after "RewardsPro is an app for Shopify stores…" in A0/A0c, YT0/YT0c, L1/L1W and YT1 |

`rp-purpose` has no row yet: `../MESSAGING.md` §7 proposes it ("RewardsPro is made for rewarding a shop's loyal
customers.", intent) with the `social-profile` channel. G1 fails PU0 until the claims maker adds it. PU0 was
added to profiles.json by hand, not by the generator, so its lint is a hand check against §2.3's list: plain ASCII,
no banned spelling, avoid word, "!", "free", address or first-person word.

### 2.2 Set B: after G0 (stage S2)

Each text names its claim ids. All of them must be `verified` first. Most need G0's production
observation (STRATEGY §6.3, "needs a dev-store or production observation").

| Id | Text | Chars | Claim ids | Used on |
|---|---|---|---|---|
| R1 | RewardsPro, an app for Shopify stores, made by Cambridge TCG Limited, London. We don't post here. Updates and contact: rewardspro.io | 132 | rp-maker, rp-on-app-store | X, Bluesky, Instagram bio. Claim-light for good |
| T1 | Cashback as Shopify store credit, with VIP tiers. You fund the cashback. | 72 | rp-store-credit, rp-vip-tiers, rp-merchant-funds | LinkedIn tagline |
| T1F | Cashback as Shopify store credit, with VIP tiers. Free app; you fund the cashback. | 82 | rp-store-credit, rp-vip-tiers, rp-free, rp-merchant-funds | LinkedIn tagline, only if the owner picks it under D4 |
| YT1 | RewardsPro is an app for Shopify stores, made by Cambridge TCG Limited, London. With cashback switched on, it adds cashback to a customer's Shopify store credit when their order is paid, at their tier's rate. A refund takes back its share of the cashback, from store credit the customer still holds. Video titles, descriptions and captions here are drafted with AI help and checked by a person before we post them. Questions: contact@rewardspro.io | 447 | rp-on-app-store, rp-maker, rp-paid-trigger, rp-store-credit, rp-vip-tiers, rp-refund-takeback, rp-ai-drafted-video, rp-contact-delivers | YouTube description |

**L1, the LinkedIn About** (1,170 characters including the blank lines between paragraphs; claim ids:
rp-on-app-store, rp-paid-trigger, rp-store-credit, rp-vip-tiers, rp-tier-window, rp-refund-takeback,
rp-cashback-base, sh-sc-signin-legacy, sh-sc-full, rp-free, rp-merchant-funds, sh-sc-fee,
rp-post-cadence, rp-ai-drafted, rp-maker, rp-contact-delivers). It is STRATEGY §3.2's L1 with the claim
tags taken out and four sentences changed (notes below). It also waits on D8 (the PPA note below).

> RewardsPro is an app for Shopify stores. With cashback switched on, it adds cashback to a customer's Shopify store credit when their order is paid, at their tier's rate. You set tiers by spend, counted over the last 12 months or all time, and customers move between tiers as their spend changes. A refund takes back its share of the cashback, from store credit the customer still holds.
>
> Cashback is paid on the product price after discounts. Shipping, and anything paid with store credit or gift cards, earns nothing.
>
> Customers spend store credit at checkout when signed in with Shopify's new customer accounts or with Shop Pay. Store credit isn't available for legacy customer accounts, and Shopify applies the full balance.
>
> RewardsPro is free, with no paid plans. You fund the cashback you give. For stores created on or after 12 May 2025, Shopify charges its own third-party transaction fee on the part of an order paid with store credit.
>
> We post here rarely: when the app changes or when we can show how it works. Posts are drafted with AI help and checked by a person before we post them.
>
> Made by Cambridge TCG Limited, London. Questions: contact@rewardspro.io

**W1, the widget paragraph.** Add it to L1, before "We post here rarely…", only once `rp-widget` is
verified (B3 plus gate C at 390 px, light and dark). It is the `rp-widget` sentence word for word. L1 with
W1 (L1W) is **1,341** characters.

> A widget you turn on in your theme editor shows signed-in customers their tier, cashback rate, store credit and progress; guests see your base rate and a sign-in prompt.

**MK1, what else the maker sells (PROPOSAL; a new decision for the owner).** If chosen, it goes straight
after "Made by Cambridge TCG Limited, London." in L1/L1W, and after "…London." in YT1. With it: L1 1,218,
L1W 1,389, YT1 495 characters.

| Id | Text | Chars | Claim ids | Used on |
|---|---|---|---|---|
| MK1 | Cambridge TCG Limited also sells trading cards. | 47 | rp-maker-also-sells | optional, in the maker line of L1/L1W and YT1 |

**Notes on set B:**
- **The free rule.** "Free" appears only in L1 and L1W, which also say "you fund the cashback" and, being
  longer than 300 characters, carry Shopify's fee sentence (STRATEGY §4, never-say 2). T1 no longer says
  "Free app". A tagline is the field most often seen on its own (under the Page name, in search, beside
  posts [I]), where nobody sees L1's fee sentence. It passes the kit's 300-character rule, but falls short
  of the design's "the total price, shown" and leans on CAP 3.23–3.26. T1F keeps STRATEGY's wording for
  the owner to pick under D4, with that risk stated. R1, YT1 and TK0 leave "free" out.
- **Four sentences changed from STRATEGY's L1 and YT1:**
  - *Paid orders.* "When an order is paid, it adds cashback…" read as "every paid order earns". The app
    records no cashback for an order with no customer, a test, cancelled or pre-install order, while the
    switch is off (the default) or before any tier exists (apps/rewards/app/lib/record-order.server.ts:61-69,
    92; prisma/schema.prisma:146 `running Boolean @default(false)`, @6f3a57b6). The new sentence is
    qualified to match `rp-paid-trigger`'s scope. Guest wording stays out until the held "guests don't
    earn" claim is resolved.
  - *Refunds.* Now `rp-refund-takeback`'s own wording, "from store credit the customer still holds": a
    take-back that falls short records a shortfall and isn't chased (refunds.server.ts:23;
    payouts.server.ts:122-131).
  - *Cadence.* "We post here rarely: when the app changes or when we can show how it works." replaces "…and
    not otherwise", which the post plan would break (§2.1). It is a process claim, so it lists
    `rp-post-cadence` (requested), like `rp-ai-drafted`.
  - *Contact.* L1, L1W and YT1 now list `rp-contact-delivers` for "Questions: contact@rewardspro.io".
- **YT1's AI line** names "Video titles, descriptions and captions", because V1's burned-in captions
  are agent-drafted text too (video-walkthrough.md:15, :68-75). "Posts here…" could be read as the videos
  being AI, and they are real screen recordings. It lists `rp-ai-drafted-video` (requested): the claims
  maker adds a variant row, or a scope note on `rp-ai-drafted` and tells us to use that id. Where the AI
  line goes is the owner's D5.
- **Limits kept in the claim rows, not the texts.** These are recorded in each row's `uncertainties`, and
  the texts stay as they are:
  - W1's "store credit": when Shopify can't give the balance in time, the widget reads "Your store credit
    shows at checkout" (rewards-widget.js:142-150; en.default.json:7). `rp-widget` records it, and W1 stays
    the row's sentence word for word.
  - "Counted over the last 12 months or all time": in a store's first year, the spend that counts is what
    the past-orders import read, the 12 months before install, or only 60 days without `read_all_orders`
    (bulk-import.server.ts:2-4, 37-40). `rp-tier-window` records it. "Past orders count" stays out.
  - Shopify's fee: the fees page says "Transaction fees don't apply for POS orders or for manual payment
    methods". L1 follows the store-credit page's own sentence, which overstates a cost, not a benefit. This
    is deliberate, and `sh-sc-fee` records it. POS stays a held claim.
- **The PPA question, for D8 (PROPOSAL).** L1 names Shopify five times and Shop Pay once; T1, YT1 and R1
  only say "for Shopify stores" or "Shopify store credit". PPA 5.3 bars Shopify marks in "branding,
  advertising, social media" (ppa.txt:453); Part C s.3 allows them "for the sole purpose of notifying
  Merchants that the App is compatible" (ppa.txt:718). STRATEGY §3.1 reads 5.3 as covering names,
  handles and slugs, and D8 as planned covers the email and §2.1 marketing clauses. Nobody has asked
  whether restating Shopify's store-credit rules, its fee and Shop Pay (L1 paragraphs 3 and 4) counts as
  notifying compatibility. Add it to D8's legal read before S2. Until it is answered, L1 waits on D8 too,
  and every other text keeps to compatibility phrasing. A fallback is to link Shopify's store-credit help
  page instead of restating those paragraphs; then "free" leaves L1 as well (never-say 2).
- **Who makes it, and what else they sell (MK1).** The design promises "who makes it, and what else they
  sell, disclosed" (design README:117). STRATEGY §5 H4 holds the card-trade fact back until the interviews
  ("a card-shop maker reads as a conflict (then never say it)"). The two conflict. It matters most if D10
  aims M2 at card and collectibles shops, because those merchants would hand order data to an app made by a
  seller in their own trade. PROPOSAL: a named decision for the owner, with MK1 required at the latest
  before any outreach to card shops. Disclosure is not card-shop framing, which stays out. MK1 names no
  sales channels: STRATEGY says eBay and Cardmarket (design README, 2026-10-20), but no claim row holds
  evidence for that today. `rp-maker-also-sells` is requested.
- **Left out on purpose:** outcome words ("bring buyers back", "retention") and the held claims (POS,
  currency, "data in London", 12-month import, "guests don't earn"). See STRATEGY §4 and §6.4.

### 2.3 Lint

`profiles.json` → `lint.problems` is empty. The generator checked every text for:
- the four banned spellings;
- STRATEGY §4's words to avoid and never-say words, including "relaunch", "official", "instant", "points"
  and "only", plus "reserved" and "not otherwise";
- exclamation marks, emoji, hashtags and any non-ASCII character;
- the free-pair and fee rule;
- `contact@` without `rp-contact-delivers`;
- first-person words ("I", "my"), since `rp-maker` is the company only;
- a paid-order sentence without "switched on", and a refund sentence without "still holds";
- links to GitHub, docs.rewardspro.io and KINGDOM domains;
- "shopify" in handles, UTM values and the YouTube link title.

A banned-spelling pass over the whole of profiles.md, profiles.json and SETUP.md also comes back clean:
the third-party lookalikes are described, not quoted. The only hit is the allowed lowercase slug in
`apps.shopify.com/rewards-pro`. This is a self-check, not gate G1–G4. The checker session runs those.

---

## 3. Shared pieces

### 3.1 Display name

Exactly `RewardsPro` (10 characters) on every brand account, with no suffix. "RewardsPro for Shopify" or
"RewardsPro App" are out: a name is branding, and PPA 5.3 bans Shopify marks in it (STRATEGY §3.1).

### 3.2 Images

All banner files are in `apps/rewardspro/marketing/social/assets/png/`, each with a `.meta.json` sidecar.
Measured 2026-11-07 with `stat`, `sips` and `sharp`; every file is opaque.

| Id | File | Size | Bytes | Used on |
|---|---|---|---|---|
| avatar-400 | `kit/social/avatar-400.png` (kit, #83; never edited here) | 400x400 | 2,953 | LinkedIn logo, X |
| avatar-1024 | `kit/social/avatar-1024.png` (kit; same decoded pixels as `social/assets/png/rewardspro_social_avatar_tile_1024x1024_20261107_v01.png`, 8,710 bytes, which has the kit file's PNG text chunks stripped; sharp, 2026-11-07) | 1024x1024 | 8,884 | YouTube, Bluesky, Instagram, TikTok |
| A2, dark | `rewardspro_social_header_dark_1500x500_20261107_v01.png` | 1500x500 | 17,190 | X header, Bluesky banner |
| A2, navy | `rewardspro_social_header_navy_1500x500_20261107_v01.png` | 1500x500 | 17,091 | the same, if navy is chosen |
| A3, dark | `rewardspro_social_linkedin-cover_dark_1512x256_20261107_v01.png` | 1512x256 | 13,479 | LinkedIn cover |
| A3, navy | `rewardspro_social_linkedin-cover_navy_1512x256_20261107_v01.png` | 1512x256 | 13,373 | the same, if navy is chosen |
| A4, dark | `rewardspro_social_youtube-banner_dark_2560x1440_20261107_v01.png` | 2560x1440 | 36,332 | YouTube banner |
| A4, navy | `rewardspro_social_youtube-banner_navy_2560x1440_20261107_v01.png` | 2560x1440 | 36,236 | the same, if navy is chosen |
| A2, neutral950 | `rewardspro_social_header_neutral950_1500x500_20261107_v01.png` | 1500x500 | 17,141 | the same, if `#1B1D1F` is chosen |
| A3, neutral950 | `rewardspro_social_linkedin-cover_neutral950_1512x256_20261107_v01.png` | 1512x256 | 13,496 | the same, if `#1B1D1F` is chosen |
| A4, neutral950 | `rewardspro_social_youtube-banner_neutral950_2560x1440_20261107_v01.png` | 2560x1440 | 36,333 | the same, if `#1B1D1F` is chosen |

- **Which 400 px avatar.** Upload `kit/social/avatar-400.png`, the kit's own cut, as STRATEGY §3 names
  it. `social/assets/png/rewardspro_social_avatar_tile_400x400_20261107_v01.png` (2,779 bytes) has the
  same decoded pixels with the kit file's PNG text chunks stripped (the kit's Description chunk names the
  internal generator); the same holds for the 1024 copy. The banners maker suggests uploading the stripped
  copies (assets/README.md); which one is the owner's call. Upload one of the two, not both.
- **A third ground, added by the banners fix pass (2026-11-07):** neutral 950 `#1B1D1F`, the dark ground of the
  kit approved on 2026-10-20, where the R shape measures 4.66:1 (assets/README.md; the neutral950 sidecars'
  notes). The banners maker now suggests it, since `#09110F` came with the 10-27 kit rebuild, which has no
  approval line. profiles.json still lists only dark (default) and navy (alternative); the choice is the owner's.
- **Dark or navy: the owner's call, one variant for all three banners.** The banners maker offers the dark
  ground `#09110F` as the default, because the kit's reversed lockup was made for it, and navy `#1A3E5C`
  as the alternative (STRATEGY §7 A2 says navy). On navy, the lockup's R shape `#658AAD` measures 3.07:1
  and APCA Lc -29.34. That is just under the kit's own bar for a mark on a dark ground (3:1 and Lc 30,
  kit/BRAND.md "Colour versions"; the navy sidecars' notes). Logos are exempt from WCAG.
- **Placement, in the dark files** (logo bounding box, sharp): header x 445–1054, y 190–309, clear of X's
  top and bottom 60 px and of the lower-left avatar; cover x 502–1009, y 78–177, centred (re-measured after the banners fix pass); YouTube x
  772–1786, y 620–819, inside the centred safe band (about x 508–2052, y 509–931). The navy files use the
  same layout. How each platform really crops and compresses them is [U] until one is uploaded and looked
  at.
- Each banner carries only the name "RewardsPro", so all are safe before G0 (STRATEGY §7, A2–A4).

Every file is far under every known cap: Bluesky 1,000,000 bytes [D-src]; X 2 MB [V-arch]; LinkedIn
3 MB [V a563309]; YouTube 6 MB for the banner and 15 MB for the picture [V 10456525]. Instagram's and
TikTok's image caps weren't read [U].

### 3.3 Alt texts

One alt text per image, taken from that image's own sidecar (`alt_text` in the `.meta.json` beside each
PNG), so there is a single source. The kit's avatar files have no sidecar; their text is the avatar_tile
sidecars', which describe the same image. None of the platforms in this kit documents an alt-text field
for a profile picture or banner (§4, [U] or [I] per platform), so these texts live in the sidecars and
wherever the images are reused, such as rewardspro.io. All are under 150 characters, the tightest
profile-image alt limit seen, on Mastodon, which the kit skips [O].

| For | Alt text | Chars |
|---|---|---|
| Avatar (both sizes) | The RewardsPro R mark, navy with a teal block, on a white square tile. | 70 |
| Banners A2, A3, A4, dark | The RewardsPro logo: the R mark in blue-grey and teal beside the white word RewardsPro, centred on a near-black ground. No other text. | 134 |
| Banners A2, A3, A4, navy | The RewardsPro logo: the R mark in blue-grey and teal beside the white word RewardsPro, centred on a navy ground. No other text. | 128 |

The dark header was looked at on 2026-11-07: a near-black ground, the blue-grey and teal R, and the white
wordmark, with nothing else on it. The navy header shows the same layout on navy.

### 3.4 Links

- **S0 and S1: no link on any profile.** The listing still links a false privacy page, and rewardspro.io
  carries retired copy (STRATEGY §6.1).
- **From S2: rewardspro.io**, once its rewrite is deployed, with one UTM set per platform. No "shopify" in
  any value (STRATEGY §3.1):
  - LinkedIn: `https://rewardspro.io/?utm_source=linkedin&utm_medium=social&utm_campaign=profile`
  - YouTube: `https://rewardspro.io/?utm_source=youtube&utm_medium=social&utm_campaign=profile`, with the
    link title `rewardspro.io` (13 characters). YouTube asks for "the title and URL of your site"
    [V, answer 2657964]. The title is plain, with no "Shopify" or "official".
  - X: `https://rewardspro.io/?utm_source=x&utm_medium=social&utm_campaign=profile`
  - Instagram: `https://rewardspro.io/?utm_source=instagram&utm_medium=social&utm_campaign=profile`
  - Bluesky, optional: `https://rewardspro.io/?utm_source=bluesky&utm_medium=social&utm_campaign=profile`,
    if the released app offers a profile links field. The lexicon has one (`links`, "Links shown on the
    profile", up to 10, with `website` deprecated [D-src]), but whether the app shows it is [U]. Leaving it
    out is a choice. R1 names `rewardspro.io` in the bio text anyway, untagged, so Bluesky visits can't be
    told apart.
- **Never linked:** GitHub (including the `RewardsPro` org and github.com/cambridgetcg/*),
  docs.rewardspro.io, any KINGDOM site, link-in-bio services.

---

## 4. Per platform

### 4.1 LinkedIn Company Page (primary: the only active feed)

**Handle.** `linkedin.com/company/rewardsproapp` (13 characters). Fallbacks: `rewardspro`, only if the form
offers it and the owner prefers it; then `rewardspro-io`.
- Availability is **unknown**. Logged-out requests get a Cloudflare 403 for real and nonsense slugs alike
  [O, p1-platforms §2]. Only the Page-creation form shows it.
- LinkedIn's rule: the URL "Can't contain uppercase alphabet letters. Can contain lowercase alphabet,
  numeric, hyphen". If the URL is taken, "you can still create a Page … by using a different URL"
  [V, help a553289, read 2026-11-07].

**Before the form.** A Page is created from a personal LinkedIn profile, and LinkedIn says to "Build your
professional network to ensure you have enough connections to create a Page" [V, a553289]. The number
isn't stated [U]. Android can't create Pages; desktop and iOS can [V, a543852].

**Page type:** Company. The desktop form offers "Company, Showcase page, Educational institution" [V, help
a543852, read 2026-11-07]. A Showcase Page hangs under a parent Page, so it would need a Cambridge TCG
Limited Page first [I]. The strategy doesn't propose that, so it is noted here only as an option.

**Form fields.** On desktop, the form asks for "Page identity, Company or Institution details, and Profile
details information". On iOS it lists "Company name, LinkedIn public URL, Website, Industry, Company size,
Company type, and Tagline (optional)". Both end with a box confirming "you have the right to act on behalf
of the company" [V, a543852]. Only Tagline is marked optional, so **Website is probably required** [I], and
the Page probably waits for S2, when the site is fixed.

| Field | Before G0 (S0) | After G0 (S2) |
|---|---|---|
| Company name | RewardsPro (10; limit [U], 100 widely quoted) | same |
| Public URL | `rewardsproapp` | same |
| Website | **empty**. If the form insists on one (likely [I]), stop and create the Page at S2 (STRATEGY §3) | the LinkedIn UTM link (§3.4) |
| Industry | PROPOSAL: Software Development [I: the label as I expect it in LinkedIn's picker; the owner picks the closest] | same |
| Company size | the true size of Cambridge TCG Limited (the owner's word; agents don't know it) | same |
| Company type | PROPOSAL: Privately held [I, for a UK private limited company; the owner confirms] | same |
| Location | PROPOSAL: **empty**. "London, United Kingdom" (city and country only, no street address) only if the owner checks that LinkedIn doesn't show it as a headquarters or offer directions [I]. London is a serviced registered office, never to be implied as an office open to visitors (claims.toml `rp-maker` uncertainties) | same |
| Tagline | **T0**, 65 / 120 [S] | **T1**, 72 / 120 [S]; or **T1F**, 82 / 120, under D4 |
| About | **A0**, 162 / 2,000 [S]; **A0c**, 195 / 2,000 once `rp-contact-delivers` is verified | **L1**, 1,170 / 2,000 [S]; **L1W**, 1,341 / 2,000 once `rp-widget` is verified |
| Logo | `kit/social/avatar-400.png` (LinkedIn recommends 400x400, PNG or JPEG, <=3 MB [V a563309]) | same |
| Cover | A3, 1512x256, dark or navy (§3.2) | same |
| Custom button | none | optional "Visit website" to the UTM link |
| Messages to the Page | off | off |
| Verification | not requested | unlikely to be offered under this plan (below) |
| Pinned post | none (no posts) | M1, pinned in the S2 week |

The tagline (120) and About (2,000) limits are [S]: LinkedIn Learning via the phase-1 note, not read on a
LinkedIn help page today. Every text is well under both.

**Verification.** Eligibility "may be based on meaningful engagement with LinkedIn, such as posting
regularly, or responding to members, as well as having an established commercial relationship with
LinkedIn … Ads, Jobs, or a Premium Company Page subscription. Meeting these criteria does not guarantee
verification." The website "must accurately represent the organization associated with your page"
[V, a7174627, read 2026-11-07]. This plan posts 0–2 times a month and buys no ads or Premium, and the
Page is named for the product, not Cambridge TCG Limited. So verification is unlikely to be offered. It is
requested only if Settings shows the "Verification controls" option. No fee is stated, but it is not
counted as a benefit of the plan.

**Alt text:** the Page logo and cover take none, as far as read [U]. The §3.3 texts stay in the sidecars.

**Sources:** linkedin.com/help/linkedin/answer/a543852, a553289, a563309 and a7174627 (all four re-read
raw 2026-11-07).

### 4.2 YouTube (secondary: hosts 1-3 real recordings, no feed)

**Handle.** `@rewardsproapp` (13 characters). Fallbacks: `@rewardspro_io`, then `@getrewardspro`.

| Handle | Result | Checked | Reliability |
|---|---|---|---|
| `@rewardsproapp` | HTTP 404, free at probe time | 10:41–10:59 UTC and re-probed 11:46 UTC, 2026-11-07 | good signal; YouTube's handle picker is final |
| `@rewardspro_io` | HTTP 404 | same | same |
| `@getrewardspro` | HTTP 404 | same | same |
| `@rewardspro` | HTTP 200: taken by an unrelated Portuguese game-cheat channel | same | high |

Method: GET `youtube.com/@<handle>` with a consent cookie (not a login) and a generic User-Agent.
YouTube's rules: 3–30 characters; letters and digits; `_ - .` allowed except at the start or end; handle
and name each changeable twice in 14 days [V, answers 11585688 and 2657964].

| Field | Before G0 (S0) | After G0 (S2) |
|---|---|---|
| Channel type | a Brand Account, so managers can be added later without sharing a login [I] | same |
| Name | RewardsPro (10; limit [U]) | same |
| Description | **YT0**, 128; **YT0c**, 161 once `rp-contact-delivers` is verified | **YT1**, 447 |
| Description limit | [U]: help answer 2657964 states none (read 2026-11-07); 1,000 is widely quoted. Every text is far under it | same |
| Links (up to 14 [V, 2657964]) | none | the YouTube UTM link, title `rewardspro.io` (§3.4) |
| Contact info (email) | empty | contact@rewardspro.io, once `rp-contact-delivers` is verified |
| Country | United Kingdom [I: Advanced settings] | same |
| Audience | "not made for kids" | same |
| Picture | `kit/social/avatar-1024.png` ("Image size should not exceed 15 MB. Image that renders at 98 x 98 px." [V 10456525]) | same |
| Banner | A4, 2560x1440, <=6 MB, dark or navy (§3.2). Safe area 1235x338 at the 2048x1152 minimum [V 10456525], so about 1544x423 at 2560x1440 [I, scaled] | same |
| Featured video / pinned | none (no uploads) | V1, the 60–90 s real recording |
| AI disclosure at upload | — | the "AI use" setting, under Attributes in the upload flow: "select Yes if your content meets the disclosure requirements or No if not" [V 14328491]. Disclosure is for realistic AI-generated or altered content; V1 is a real screen recording with AI-drafted text only, so **No**. The label as Studio shows it is [I] until the owner sees it |

**Sources:** support.google.com/youtube/answer/11585688, 2657964, 10456525 and 14328491 (all re-read
2026-11-07). Answer 2972003 now serves the same page as 2657964 (identical extracted text), so it is no
longer cited.

### 4.3 Shopify Community (secondary, optional: the owner's own account, the owner's own words)

**No paste text.** The owner writes the profile bio in their own words, or leaves it as it is. Agents
draft none of it, and nothing shaped like a reply (STRATEGY §3, §14). The guidelines bar "Posting generic,
templated, or AI-generated messages", say "AI-generated content is highly discouraged and will be
removed", and allow promotion only on the Ask & Offer board, with disclosure [V, community.shopify.com/guidelines,
read 2026-11-07]. An agent-drafted bio for a personal account would sit badly with all of that.

**Handle:** the owner's own username. Agents don't propose one, and there is no brand account: "Each
person is permitted one account" [V, same page]. Usernames are 3–20 characters [O, site settings].
`rewardspro` and `rewardsproapp` both return 404 on community.shopify.com and community.shopify.dev
[O, high], but neither is to be used.

**Facts the owner may choose to mention** (not text to paste):
- the company: Cambridge TCG Limited (UK) [`rp-maker`, company only];
- once `rp-contact-delivers` is verified: contact@rewardspro.io.

**Not offered, and why:**
- **A first-person maker line** ("I make RewardsPro…"). It ties a person to the company, and `rp-maker`'s
  scope is "The company only, never a person" (claims.toml). It would need a person-scoped claim row and
  the owner's approval of that personal link. If the owner does mention RewardsPro, STRATEGY §4 has the
  interest come first ("Ad · I make RewardsPro, …" shows the shape, not text to paste).
- **Any product description**, such as cashback as store credit. Product talk belongs in a disclosed
  Ask & Offer post, from S2, in the owner's words.

| Field | From S1 | After G0 (S2) |
|---|---|---|
| Bio ("About me") | the owner's own words, or unchanged | the same |
| Bio limit | [U] (Discourse profile; not read) | same |
| Website | none | optional, the owner's choice: rewardspro.io (no UTM needed) |
| Picture | the owner's own, or none. PROPOSAL: not the RewardsPro mark, so a personal account doesn't read as a brand account | same |

### 4.4 Bluesky (reserve-only: pointer bio, no posts)

**Handle.** `@rewardspro.io`, the domain handle. Create the account first as `rewardsproapp.bsky.social`
(13 characters). Fallbacks before the switch: `getrewardspro.bsky.social`, `rewardspro-io.bsky.social`.

| Handle | Result | Checked | Reliability |
|---|---|---|---|
| `rewardsproapp.bsky.social` | "Unable to resolve handle" (free) | 10:41–10:59, 11:46 and 12:28 UTC, 2026-11-07 | high (public API `com.atproto.identity.resolveHandle`; the control `bsky.app` resolved at 12:28) |
| `rewardspro.io` | "Unable to resolve handle"; `dig TXT _atproto.rewardspro.io` empty | same (12:28: resolveHandle only) | high |
| `getrewardspro.bsky.social` | free | same | high |
| `rewardspro-io.bsky.social` | free | 10:41–10:59 UTC (phase-1 note) and 12:28 UTC, 2026-11-07 | high |

`.bsky.social` names are 3–18 characters before the suffix: a–z, 0–9 and hyphens, no underscores [D-src].
After the switch to `rewardspro.io`, the `rewardsproapp.bsky.social` name is probably released [I]. That's
why the strategy creates the account under it rather than under `rewardspro`.

| Field | Before G0 (S0) | After G0 (S2) |
|---|---|---|
| Display name | RewardsPro, 10 / 64 graphemes [D-src] | same |
| Bio | **R0**, 97 / 256 graphemes [D-src] | **R1**, 132 / 256 |
| Avatar | `kit/social/avatar-1024.png` (8,884 bytes / 1,000,000 [D-src]) | same |
| Banner | A2, 1500x500, dark or navy (3:1 crop in the app), <=1,000,000 bytes [D-src] | same |
| Link | none | optional: the Bluesky UTM link, if the app offers a links field [U]; otherwise R1's bio text names rewardspro.io (§3.4) |
| Chat | nobody can start a chat | same |
| Pinned post | none, ever | none |

**Domain handle:** set it only after the two KINGDOM TXT records come off rewardspro.io (STRATEGY §11,
§13 step 12). The steps are in SETUP.md, Phase 4.

### 4.5 X (reserve-only: pointer bio, DMs off, no posts)

**Handle.** `@rewardsproapp` (13 / 15 [V-arch]). Fallbacks: `@rewardspro_io` (13), then `@getrewardspro`
(13).

| Handle | Result | Checked | Reliability |
|---|---|---|---|
| `@rewardsproapp` | 404 "User Profile Not Found" | 10:41–10:59 UTC and 11:46 UTC, 2026-11-07 | medium-high |
| `@rewardspro_io` | 404 | same | medium-high |
| `@getrewardspro` | 404 | same | medium-high |
| `@RewardsPro` | 200: "Pro Rewards (@RewardsPro)", someone else's | same | high |

The probe tells a taken name apart from a free one: a nonsense control also returned 404, and the taken
`@RewardsPro` returned 200. But suspended or deactivated names also show as missing, and they "are not
immediately available" [V-arch]. X "cannot release inactive usernames" [V-arch]. The sign-up form decides.

**Squatting.** "Username squatting is prohibited by the X Rules. Please note that if an account has had no
updates, no profile image, and there is no intent to mislead, it typically means there's no name-squatting
or impersonation." [V-arch, help.x.com/en/rules-and-policies/x-username-squatting, Wayback
20260331203759, read 2026-11-07]. The account holds our own product's name with no intent to mislead, but
R0 no longer calls it a "Reserved name" (§2.1).

**Staying active.** A reserve account exists only to hold the name, so losing it to inactivity defeats it.
X's inactive-account page returned HTTP 403 to a logged-out fetch at 12:25 UTC, 2026-11-07 [U]. From prior
knowledge, X has asked accounts to log in at least every 30 days [I]. SETUP.md 2.6.3 has the step.

| Field | Before G0 (S0) | After G0 (S2) |
|---|---|---|
| Name | RewardsPro, 10 / 50 [V-arch] | same |
| Bio | **R0**, 97 / 160 [V-arch] | **R1**, 132 / 160. If X counts R1's `rewardspro.io` as a 23-character link, it is 142, still under the limit [I] |
| Location | optional: "London, UK" (10; X's location limit not read [U]) | same |
| Website | empty | the X UTM link (§3.4) |
| Birth date | the operator's own, as X requires; visibility "only you". Never written in any file | same |
| Profile photo | `kit/social/avatar-400.png` (2,953 bytes). X: "Use JPEG, GIF, or PNG files under 2MB with recommended dimensions of 400x400 pixels." [V-arch] | same |
| Header | A2, 1500x500, dark or navy ("Recommended dimensions for header images are 1500x500 pixels." [V-arch]; top and bottom 60 px may crop) | same |
| Direct messages | off / nobody | same |
| Pinned post | none, ever | none |

**Sources:** help.x.com/en/managing-your-account/x-username-rules,
…/how-to-customize-your-profile, …/common-issues-when-uploading-profile-photo (raw Wayback copies
2026-09-19 to 10-07, re-read from the phase-1 captures today), and
help.x.com/en/rules-and-policies/x-username-squatting (Wayback 20260331203759).

### 4.6 Instagram, with Threads (reserve-only, and only if `@rewardspro.io` is the owner's)

**Handle.** `@rewardspro.io`, **if it is the owner's**. It exists today, owner unknown, with 2 posts. Its
display name and bio use two of the banned spellings and retired paid wording (quoted in the phase-1
platforms note, §1.1) [O, headless render]. `@rewardsproapp` showed "Profile isn't available", the same as
a nonsense control, so it is free or restricted [O, medium]. Holding it is optional and the owner's call:
it adds one more login to keep.

**Order matters.** R0 says "We don't post here.", which is false while old posts show. So: first archive
the 2 old posts (reversible), or deactivate the account; then check any Threads profile for posts and
archive or delete them; only then set the bio.

| Field | If kept (S0) | After G0 (S2) |
|---|---|---|
| Old posts | first: archive the 2 (reversible), or deactivate the account | — |
| Name | RewardsPro (limit [U]) | same |
| Bio | **R0**, 97 / 150 [S], after the old posts are archived | **R1**, 132 / 150 [S] |
| Website | none | the Instagram UTM link (§3.4) |
| Picture | `kit/social/avatar-1024.png` (circle crop; the mark sits inside the safe circle, kit BRAND.md:41) | same |
| Threads | it takes the Instagram name. If a Threads profile exists, archive or delete any posts first, then give it the same bio (Threads bio limit [U]). Don't create one | same |

If it isn't the owner's, the account is recorded as a lookalike for ME-1 and nothing else happens.

### 4.7 TikTok (skip, unless `@rewardspro` is the owner's)

The strategy skips TikTok. This entry exists only because `@rewardspro` might be the owner's. It exists
(status code 0 in the page JSON; created 2026-10-28; 0 videos; owner unknown), and `@rewardsproapp`
returned 10221 (not found). Both were probed at 10:41–10:59 and 11:46 UTC, 2026-11-07 [O, medium-high].

If it is the owner's: name RewardsPro; bio **TK0**, 78 / 80 [U, "80, or 160 in reports"]; avatar
`avatar-1024.png`; no link; dormant. The strategy said "bio R0", but R0 is 97 characters, which wouldn't
fit an 80-character limit. TK0 says the same thing shorter.

### 4.8 GitHub (skip, never linked)

No profile. The owner only says whether the empty `RewardsPro` org (created 2026-02-08) is theirs. It is
never linked from any RewardsPro surface (STRATEGY §3).

---

## 5. Surfaces: where profile links go at S2

| Surface | What changes, and when | Who |
|---|---|---|
| rewardspro.io | In the rewritten site (the #130 successor, written against the rebuild): footer links to the LinkedIn Page and the YouTube channel. JSON-LD `sameAs` lists LinkedIn, YouTube, X and Bluesky (it ties the accounts to the domain without inviting visits to the silent ones [I]). Never GitHub, docs.rewardspro.io or KINGDOM sites | a landing PR by agents; the owner merges and deploys |
| App Store listing | If the listing form offers a website or social field [U], add rewardspro.io at S2. The listing copy itself belongs to the listing pack, not this file | the owner, in the Partner Dashboard |

---

## 6. Left out, and why

- **"Being relaunched"** (asked for in this maker's brief). STRATEGY §4 lists "relaunch" among the
  internal words to avoid, and set A works without it.
- **"Reserved name"** in R0, and **"and not otherwise"** in A0 and L1 (§2.1, §2.2).
- **A Community bio drafted by agents**, and any first-person maker line (§4.3).
- **"Free" in the default tagline.** T1F keeps it for D4 (§2.2).
- **A category line before G0**, for example "listed in the Shopify App Store's Loyalty and rewards
  category". The listing shows that category [V, p1-live §2], but no claim id in the agreed list covers it.
  If the owner wants it, the claims maker would first need a row for it.
- **"Free" on the reserve accounts.** It would need the fund-the-cashback pair, and R1 has no room or need
  for it.
- **contact@ on R0, and any address before `rp-contact-delivers` is verified.**
- **Location on Bluesky** (no such field), on TikTok (dormant), and on LinkedIn by default (§4.1).

---

## 7. Open points

- **For the owner:** dark or navy banners (§3.2); D4, T1 or T1F; D5, whether S0 carries AI0; D8, widened
  to the PPA 5.3 question (§2.2); the new MK1 decision (§2.2); the LinkedIn location (§4.1); whether the About
  and description fields carry PU0 (§2.1), alongside the umbrella line (`../MESSAGING.md` O1).
- **For the claims maker (added 2026-11-07):** the `rp-purpose` row that PU0 needs, with `social-profile` in its
  channels (`../MESSAGING.md` §7).
- **For the claims maker:** the four requested rows (`rp-post-cadence`, `rp-ai-drafted-video`,
  `rp-ai-drafted-profile`, `rp-maker-also-sells`), or a note naming an existing row that covers each
  sentence; and recording the owner's contact test on `rp-contact-delivers`.
- **For the strategy maker:** STRATEGY §3.2 and §8 still quote the old R0, A0, CB, T1 and L1 wording
  ("Reserved name for…", "We post here when the app changes, and not otherwise", "When an order is paid…").
  For the profiles, this file's texts replace them; STRATEGY is not this maker's file.
- **For the banners maker:** the YouTube sidecars and assets README say "1546x423". Scaled from YouTube's
  own figure it is about 1544x423 (1235x338 at 2048x1152 [V 10456525]). The render sits well inside
  either band.
- Whether the LinkedIn form accepts a product-name Company Page, the `rewardsproapp` slug, or no website:
  only the form shows it [U]. If it refuses, the strategy's fallback applies: create the Page at S2, or
  Bluesky becomes the feed (STRATEGY §11).
- Who owns Instagram `@rewardspro.io`, TikTok `@rewardspro`, the GitHub org `RewardsPro` and X
  `@RewardsPro`: only the owner knows.
- These limits weren't read on a primary page today: the LinkedIn tagline and About, all name limits
  except X's and Bluesky's, YouTube's description, Instagram's bio, TikTok's bio and Community's bio.
  Every text sits far under the quoted numbers, except TK0 at 78 / 80 [U].
- Each platform's inactive-account terms (X [U] after a 403 today; the others not read). SETUP 0.7 asks
  agents to read them before the accounts are made, and 2.6.3 is the owner's log-in step. STRATEGY's monthly ME-1 check should add "account
  still present"; STRATEGY is not this maker's file.
- The rest of the kit (STRATEGY.md and the other makers' files) still names the owner. These operational
  files go to a public repository (cambridgetcg/Cambridge-TCG-monorepo), so whether they live in the
  git-ignored `marketing/private/` instead is the owner's call, together with D11.
- This file sits under `apps/rewardspro/`, which switch step B5 deletes. The owner picks the kit's new home
  before B5 (decision D11).

---

## 8. Revision note (2026-11-07)

A verifier pass raised 42 findings on the first version (truth, wording and platform lenses). Each was
re-checked against the code at origin/main 6f3a57b6, claims.toml, the asset files and sidecars, and the
platforms' pages. The changes are in §2–§4 and SETUP.md. Nothing here marks any claim verified.
