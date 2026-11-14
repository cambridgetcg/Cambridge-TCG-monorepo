# RewardsPro entity card

> **Pointer, added later on 2026-11-07:** [`../MESSAGING.md`](../MESSAGING.md) now carries the descriptions,
> built on the owner's words of that day ("A credit system to give back to customers who are loyal, so that a ecosystem
> can be built.") and written in the business register he asked for after ("用loyal customers, take a more business
> approach on wordings."). Where its state A or B texts differ from this card's, MESSAGING.md supersedes them. Its state A
> drops "on the Shopify App Store", because `rp-on-app-store` now covers compatibility only. For surfaces it
> doesn't cover (the listing's App details and SEO fields, the JSON-LD, `brand.json`), this card stays the working
> proposal, but its texts that say "on" or "listed on the Shopify App Store" (the JSON-LD `description`, and
> `sentence`, `meta_160` and `long_500` in §6) need the same cut, or a verified row such as `rp-app-store-listed`
> (proposed in MESSAGING.md §7), before use. Both files are proposals.

**PROPOSAL for the owner, 2026-11-07. Nothing here is decided or published.** `kernel.toml` keeps its
`[entity]` table empty until the owner approves a version of this card. Its own comment says `[entity]`
waits for about five merchant interviews (`kernel.toml`, last comment). This card is plain
description, not positioning, so the owner can either:
- (a) keep `[entity]` empty and treat this file as the working proposal (the default); or
- (b) approve state A now, as plain fact.

Agents don't edit `kernel.toml`, `brand.json` or `kit/`.

Labels: **[V]** verified (file:line, or URL plus date), **[I]** inferred, **[U]** unknown. Code
paths are in the read-only checkout of origin/main 6f3a57b6, relative to `apps/rewards/`. Claim
ids are those in `STRATEGY.md` §6.3 and `claims.toml`. A text may go public only once **every** id
it carries is `verified` in `claims.toml` (gate G1). No id here is verified today.

*Revised 2026-11-07 after the verifiers' review (truth, wording and platform lenses). What changed
is listed in the fix maker's report; the texts below are the current proposal.*

---

## 1. What the card is for

The design's entity card is one description of RewardsPro (business-ecosystem `docs/marketing/ASSETS.md` C1,
README "Marketing to agents"). People, search engines, AI assistants and Shopify's Sidekick should
all read the same facts. It is reused in:
- the rewardspro.io meta description;
- the Organization and SoftwareApplication JSON-LD;
- the App Store text fields;
- bios;
- `brand.json`'s description;
- press or partner mentions.

It carries an as-of date.

**Rules every version below follows:**
1. **Facts only.** No outcome words ("bring buyers back", "retention"), no "only", "first" or
   "best", and no numbers. "Loyal" only in the owner's term "loyal customers" (approved 2026-11-07,
   `approvals.jsonl`; amended from "no 'loyal'"), describing who they are; never "loyalty
   program" or "makes customers loyal". Positioning beyond his umbrella idea waits for the
   interviews.
2. **Price never appears in an App Store field other than Pricing details.** Requirement 4.2.3 says
   "Don't include pricing information elsewhere in the listing" [V, shopify.dev
   app-store-requirements, fetched 2026-11-07 11:47 UTC, sha256 `6b8575b4…c733`]. So the
   listing-safe versions have no "free" in them. **The free rule still fires on the listing:** its
   Pricing details say "Free" today [V, live listing 2026-11-07]. It is met there by the
   additional-charges text, which is required, not optional (`listing-delta.md` §2, Pricing row).
3. **The free rule, everywhere else.** "Free" appears only beside "you fund the cashback".
   STRATEGY never-say 2 ties the fee sentence to **what the field allows**, not to how long the
   text is: where a field allows 300 characters or more, it also carries Shopify's fee sentence
   [`sh-sc-fee`]. Most surfaces here have no hard cap (a site meta description, an og
   description, a JSON-LD `description`, a block on a web page), so they count as allowing 300 or
   more. **PROPOSAL:** where a text has to stay short anyway, because it's seen on its own (a search
   snippet, a link card, a stat tile), it carries the short fee pointer "Shopify's store-credit fees
   may apply" (37) [`sh-sc-fee`] instead. Dropping even the pointer needs the owner's written acceptance,
   recorded against `rp-free` and `sh-sc-fee` (§8).
4. **The limit sits beside the feature.** The legacy-accounts rule sits next to "spend credit". A
   text that carries a claim id keeps that claim's limit: cashback is on the product price "less
   store credit and gift cards used" [`rp-cashback-base`], and a refund takes back its share "from
   credit still held" [`rp-refund-takeback`].
5. **R1 commerce voice, UK English.** No KINGDOM, love, citizen or liturgical words. Name only
   "RewardsPro". Don't name removed features.
6. **"Shopify" only to say what RewardsPro works with, and where it is listed.** PPA Part C s.3
   lets Shopify be named "for the sole purpose of notifying Merchants that the App is compatible"
   (`claims.toml` `rp-on-app-store`, PPA raw text line 718). The state A texts also say where the
   app is listed ("on the Shopify App Store"), the wording `rp-on-app-store`'s claim and STRATEGY's
   words-to-use list carry. No Shopify page that permits the listing-location use was read
   **[U]**, so this is **the owner's call** (§8). Never "Shopify" in a name, handle or slug, and never "a
   Shopify app".

**Two free forms, both waiting on the owner's D4 wording** (STRATEGY D4): the long form is D4's own text,
"Free app, no paid plans; you fund the cashback you give." (56). The short form "Free app; you
fund the cashback" (31) is used only where length forces it. If the owner changes D4, both change.

**How the counts were made:** Python `len()` (Unicode code points), spaces and punctuation
included, straight ASCII apostrophes. The en dash in a title counts as 1. Scripts:
`/private/tmp/claude-501/-Users-macair/be982085-a904-436a-8476-20067b564f5a/scratchpad/entity/scripts/`
(first pass) and
`/private/tmp/claude-501/-Users-macair/be982085-a904-436a-8476-20067b564f5a/scratchpad/entity-fix/scripts/count_fix.py`
(every text changed in the fix pass). Counts are for the text inside each block, with no
trailing newline.

---

## 2. State A: before G0 (stages S0 and S1)

Usable once `rp-on-app-store` and `rp-maker` are `verified` (E500-A's last sentence also needs
`rp-contact-delivers`). None of them needs a dev store. The claims maker has written all three
rows as `proposed` (`claims.toml`, rows `rp-maker`, `rp-on-app-store`, `rp-contact-delivers`); they
await verification. State A says who makes the app and where it is listed, and nothing about what
it does. Every product sentence needs a production observation (G0) first.

**E1-A**: the one sentence · 111 characters · claims: `rp-on-app-store`, `rp-maker`
```text
RewardsPro is an app for Shopify stores, on the Shopify App Store, made by Cambridge TCG Limited in London, UK.
```

**E100-A**: 100-character version · 83 characters · claims: `rp-on-app-store`, `rp-maker`
```text
RewardsPro is an app for Shopify stores, made by Cambridge TCG Limited, London, UK.
```

**E160-A**: meta description · 134 characters · claims: `rp-on-app-store`, `rp-maker`
```text
RewardsPro is an app for Shopify stores, listed on the Shopify App Store. It is made by Cambridge TCG Limited, a UK company in London.
```

**E500-A**: 500-character version · 173 characters · claims: `rp-on-app-store`, `rp-maker`,
`rp-contact-delivers`
```text
RewardsPro is an app for Shopify stores, listed on the Shopify App Store. It is made by Cambridge TCG Limited, a UK company in London. Questions go to contact@rewardspro.io.
```
- **Short on purpose.** Padding it with process words (relaunch, checked, staging) would break the
  voice guide. The one more fact that could go in, what else the maker sells, is the owner's decision
  D-maker (below and §8).
- **The last sentence carries `rp-contact-delivers`,** whose delivery source is `MISSING` (a test
  message from an outside address, seen arriving). So G1 blocks E500-A as written until that row
  is verified. Without the sentence, E500-A is 134 characters, identical to E160-A.

**E500-A-maker** (optional, only if the owner decides D-maker that way) · 205 characters (166 without the
contact sentence) · claims: `rp-on-app-store`, `rp-maker`, `rp-contact-delivers`, plus a new row
for the claims maker, proposed id `rp-maker-also-sells` ("Cambridge TCG Limited also sells
trading cards.")
```text
RewardsPro is an app for Shopify stores, listed on the Shopify App Store. It is made by Cambridge TCG Limited, a UK company in London, which also sells trading cards. Questions go to contact@rewardspro.io.
```
- **Why it's here.** The design's honest-by-design promise includes "who makes it, and what else
  they sell, disclosed", and says "Each part is a gate rule" (business-ecosystem
  `docs/marketing/README.md`, honest-by-design list). STRATEGY's pillar H4 holds card-shop framing
  back until the interviews, and says "then never say it" if a card-shop maker reads as a
  conflict (STRATEGY.md H4; "Until the interviews: no card-shop or TCG framing"). The two pull
  against each other, so this card doesn't settle it: it's the owner's named decision D-maker (§8).
- **What the sentence rests on [I].** The design README quotes the owner on 2026-10-20: "For now only ebay
  and cardmarket sales". The same README says the eBay account is "Registered as a private
  seller" and that whether it is the company's is unknown. So the sentence names no marketplace,
  and its row needs a source that ties the sales to the company before it can be verified.
- **No data-use sentence is offered.** A trading-card store deciding whether to give its order data
  to a company that also sells cards would want to know the data isn't used for that. No
  evidence for such a sentence was found, so none is drafted. It would need its own claim and
  evidence.

**State A and the S0 profile texts** (STRATEGY §3.2): R0, T0, A0 and YT0 carry the same two claims
as E1-A. CB carries `rp-maker` only (STRATEGY.md, CB row). T0 is E100-A without the subject and
", UK".

**Where state A does not go:** the App Store intro, details or SEO meta description. Before G0 the
listing keeps its own live text, and S1 deletes only what is known to be false (see
`listing-delta.md` §0 and §2). What stays is unverified, not shown true: for example "when an
order is paid" waits for G0. Moving the listing to state A would drop that text without making the
listing more proven, so the listing waits for state B.

---

## 3. State B: from S2 (after G0, B3 and the named claims are verified)

Each text lists its claim ids. "Listing-safe" means it has no price, no statistics, no links and
no support details, so it can go in App Store fields (requirements 4.2.3 and 4.3.3; best
practices "keep support info, links, and testimonials in their designated fields"
[V, shopify.dev best-practices, fetched 2026-11-07, sha256 `504c34a4…5528`]).

**E1-B**: the one sentence · 179 characters · claims: `rp-on-app-store`, `rp-maker`,
`rp-store-credit`, `rp-paid-trigger`, `rp-vip-tiers`
```text
RewardsPro is an app for Shopify stores that adds cashback to customers' Shopify store credit when an order is paid, at their VIP tier's rate. It is made by Cambridge TCG Limited.
```

**E100-B**: 100-character version, listing-safe (App introduction, limit 100) · 96 characters ·
claims: `rp-store-credit`, `rp-paid-trigger`, `rp-vip-tiers`
```text
Give customers cashback as Shopify store credit when an order is paid, at their VIP tier's rate.
```

**E160-B**: meta description, listing-safe (also the listing's SEO meta description), no price ·
154 characters · claims: `rp-store-credit`, `rp-paid-trigger`, `rp-vip-tiers`,
`rp-refund-takeback`
```text
RewardsPro adds cashback to Shopify store credit when an order is paid, at the customer's tier rate. A refund takes back its share from credit still held.
```
Kept to 155 characters or fewer, because search results usually show about 155–160 [I: Google
measures in pixels; no Google page was fetched].

**E160-B-site**: meta description for rewardspro.io only, if the owner wants the price on the meta (open
point §8, separate from D4's wording) · 147 characters · claims: `rp-store-credit`,
`rp-paid-trigger`, `rp-free`, `rp-merchant-funds`, `sh-sc-fee`. **Never in a listing field.** A
meta description has no hard cap, and a search snippet is read on its own, so it carries the short
fee pointer (rule 3). It drops the tier clause to fit.
```text
RewardsPro adds cashback to Shopify store credit when an order is paid. Free app; you fund the cashback, and Shopify's store-credit fees may apply.
```

**E500-B-listing**: 500-character version, listing-safe (App details, limit 500), **before
`rp-widget` is verified** · 498 characters · claims: `rp-vip-tiers`, `rp-tier-window`,
`rp-setup-steps` ("once cashback is on"), `rp-store-credit`, `rp-paid-trigger`, `rp-cashback-base`,
`rp-refund-takeback`, `rp-tier-lock`, `sh-sc-signin-legacy`, `sh-sc-full`
```text
Set VIP tiers by spend over the last 12 months or all time, each with its own cashback rate. Once cashback is on, RewardsPro adds cashback to the customer's Shopify store credit when an order is paid, on the product price after discounts, less store credit and gift cards used. A refund takes back its share from credit still held. You can lock a customer to a tier. Customers spend credit when signed in with Shopify's new customer accounts (not legacy ones) or Shop Pay. The full balance applies.
```
To keep both limits (rule 4) within 500, it drops "Customers move between tiers as their spend
changes".

**E500-B-listing-widget**: the same field, **once `rp-widget` is verified** (B3 plus gate C at
390 px, light and dark) · 493 characters · claims: `rp-vip-tiers`, `rp-setup-steps`,
`rp-store-credit`, `rp-paid-trigger`, `rp-cashback-base`, `rp-refund-takeback`, `rp-widget`,
`sh-sc-signin-legacy`. To fit, it drops the tier window (Feature 2 carries it), the tier-lock
sentence and the full-balance sentence.
```text
Set VIP tiers by spend, each with its own cashback rate. Once cashback is on, RewardsPro adds cashback to Shopify store credit when an order is paid, on the product price after discounts, less store credit and gift cards used. A refund takes back its share from credit still held. A widget you turn on in your theme editor shows signed-in customers their tier, store credit and progress. Customers spend credit when signed in with Shopify's new customer accounts (not legacy ones) or Shop Pay.
```

**E500-B-site**: 500-character version for rewardspro.io, press, partner mentions and the "About
RewardsPro" boilerplate. **Not for the listing.** · 491 characters · claims: `rp-on-app-store`,
`rp-maker`, `rp-paid-trigger`, `rp-store-credit`, `rp-vip-tiers`, `rp-cashback-base`,
`rp-refund-takeback`, `rp-free`, `rp-merchant-funds`, `sh-sc-fee`. It says "free" in a field with
room, so it carries the fee sentence. It uses D4's long free form.
```text
RewardsPro is an app for Shopify stores, made by Cambridge TCG Limited, London, UK. When an order is paid, it adds cashback to the customer's Shopify store credit at their VIP tier's rate, on the product price after discounts, less store credit and gift cards used. A refund takes back its share from credit still held. Free app, no paid plans; you fund the cashback you give. For stores created on or after 12 May 2025, Shopify charges third-party transaction fees on store-credit payments.
```
If the owner decides D-maker for disclosure, the maker sentence (47) doesn't fit inside 500 here. It goes
on the same page as its own line, next to the boilerplate.

**Review dates.** Any text carrying an `sh-*` id is re-checked against the Help Center page no
more than 30 days before each use (`sh-*` rows have a 30-day `review_after`). That covers
E160-B-site, E500-B-listing, E500-B-listing-widget, E500-B-site and the JSON-LD `offers` (§5). The
`rp-*` texts follow the earliest `review_after` of their rows. As-of date for every text above:
**2026-11-07**.

**State B and STRATEGY §3.2's S2 texts:** T1 and L1 draw on the same claim ids, in their own
wording. L1 is longer (1,082 characters) and adds an `rp-cashback-base` paragraph, the
legacy-accounts paragraph and the `rp-ai-drafted` line (STRATEGY.md L1). T1 ("Cashback as Shopify
store credit, with VIP tiers. Free app; you fund the cashback.", 82) is a LinkedIn tagline seen on
its own; under rule 3 it would also carry the fee pointer. That's for the profiles maker and the owner
(§8).

**Kept out of every version, even after G0** (STRATEGY §6.4 and never-say):
- "guests earn nothing";
- 12 months of past orders counting;
- POS, multi-currency, "data in London";
- the widget's size or speed;
- "instant";
- "set up in minutes";
- any count of stores, reviews or credit;
- "free forever";
- the removed features.

---

## 4. Where each version goes

| Surface | State A | State B | Note |
|---|---|---|---|
| rewardspro.io `<meta name="description">`, `og:description`, `twitter:description` | E160-A | **E160-B (recommended, no price)**, or E160-B-site if the owner wants the price on the meta (§8) | og:title is the page title (kit `head-snippet.html` note). **Don't paste the kit's `head-snippet.html` social block as it is:** it sets og:title "Cashback your customers spend in your store", og:description "Paid as Shopify store credit, with VIP tiers. Free." (fails the free rule), og:image og.jpg (whose image prints "Free."), og:locale `en_US` and twitter:card `summary_large_image`. Until A5 is rebuilt, override og:title, og:description, og:locale (`en_GB`) and twitter:card (`summary`), and leave og:image out. |
| rewardspro.io JSON-LD | §5 state A | §5 state B | one `@graph` that merges the kit's `head-home.html` blocks (§5) |
| App Store: App introduction (100) | not used; the live intro stays | E100-B, optional | The live intro is unverified, not known to be false. Its tail, "so they have a reason to come back", is positioning, the owner's call (`listing-delta.md` §2) |
| App Store: App details (500) | not used; S1 deletes the false clause (and, recommended, the widget sentence) only | E500-B-listing, then E500-B-listing-widget | |
| App Store: SEO meta description | not used; S1 deletes the false clause only | E160-B | |
| App Store: Pricing details | "Free" (live) **plus** the additional-charges text, required | the same | The free rule fires here. The additional-charges text in `listing-delta.md` §2 is the only listing place for "you fund the cashback" and the fee. Whether a Free-to-install listing offers that field is [U]; the fallback is a pricing-details link (`listing-delta.md` §2) |
| `brand.json` `description`, then `kit/web/site.webmanifest`, `kit/kit.json` and `kit/BRAND.md:3` | E100-A | E100-A (it stays true at every stage), or T1 if the owner prefers | §7 |
| Profiles (STRATEGY §3.2) | R0, T0, A0, YT0, CB | R1, T1, L1 | the profile pack's own files; they draw on this card |
| Press, partner, directory "About RewardsPro" | E500-A (or E500-A-maker, D-maker) | E500-B-site | |
| MCP or registry metadata, if any is ever made | E1-A | E1-B | same text, so machines read one description |

---

## 5. JSON-LD (PROPOSAL for the #130 rewrite and the brand lane)

**One graph for the home page.** The kit's `kit/web/head-home.html` already has two home-page
blocks: an Organization named "RewardsPro" (url `https://rewardspro.io`, logo
`https://rewardspro.io/icon-512.png`) and a WebSite named "RewardsPro". Its own comment says: "If
your site already has a WebSite or Organization block, add these properties to that node instead
of pasting a second one." So the home page carries **one** `@graph`, built like this:
- **WebSite:** the kit's node, kept, with an `@id` and a `publisher` pointing at the maker.
- **The kit's Organization "RewardsPro": dropped.** RewardsPro is a product, not an organisation,
  and a second Organization would tell machines two different things about who stands behind
  it. Its logo moves to the SoftwareApplication as `image` (#95 serves `icon-512.png` at the root
  [V, `origin/claude/rewardspro-landing-icons`, `apps/rewardspro/landing/public/icon-512.png`]).
  Since 14 Nov 2026 (#252) the `#maker` node also gives that icon as its `logo`, so Google's
  organisation-logo feature has a logo to read [I].
- **Organization `#maker`:** Cambridge TCG Limited. Live since 14 Nov 2026 (#252): name, `legalName`,
  address, `url` `https://rewardspro.io/` (the owner's choice of 13 Nov 2026, `approvals.jsonl`), `logo`
  `https://rewardspro.io/icon-512.png` (RewardsPro's icon) and `email` `contact@rewardspro.io`.
- **SoftwareApplication `#app`.**
- **Every node has an `@id`.** Other pages refer to them by `@id` instead of repeating them.

**State A** (replaces #130's block, whose description says "pays loyal customers" and makes the
tier claim before G0). Claims: `rp-on-app-store`, `rp-maker`.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://rewardspro.io/#website",
      "name": "RewardsPro",
      "url": "https://rewardspro.io/",
      "publisher": { "@id": "https://rewardspro.io/#maker" }
    },
    {
      "@type": "Organization",
      "@id": "https://rewardspro.io/#maker",
      "name": "Cambridge TCG Limited",
      "address": { "@type": "PostalAddress", "addressLocality": "London", "addressCountry": "GB" }
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://rewardspro.io/#app",
      "name": "RewardsPro",
      "url": "https://rewardspro.io/",
      "image": "https://rewardspro.io/icon-512.png",
      "applicationCategory": "BusinessApplication",
      "description": "RewardsPro is an app for Shopify stores, on the Shopify App Store, made by Cambridge TCG Limited in London, UK.",
      "publisher": { "@id": "https://rewardspro.io/#maker" }
    }
  ]
}
```

**State B** changes the SoftwareApplication node only:
- `description` becomes E1-B [`rp-on-app-store`, `rp-maker`, `rp-store-credit`,
  `rp-paid-trigger`, `rp-vip-tiers`].
- `sameAs` is added: `["https://apps.shopify.com/rewards-pro"]`. Only once the listing is fully
  fixed (S2).
- `offers` is added **only after the owner settles D4** and once `rp-free`, `rp-merchant-funds` and
  `sh-sc-fee` are all verified. Until then it's left out. A `description` has no cap and AI
  assistants read it on its own, so it carries the full fee sentence (193 characters) and uses
  D4's long form [`rp-free`, `rp-merchant-funds`, `sh-sc-fee`]:

```json
"offers": {
  "@type": "Offer",
  "price": "0",
  "priceCurrency": "USD",
  "description": "Free app, no paid plans; you fund the cashback you give. For stores created on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit."
}
```

**Notes:**
- **The Organization node's `url` is `https://rewardspro.io/`,** not cambridgetcg.com: the owner's choice
  of 13 Nov 2026 (`approvals.jsonl`), live since 14 Nov 2026 (#252). Whether to say what else the maker
  sells is still the owner's named decision (D-maker, §8). The design's honest-by-design list asks for
  the disclosure; STRATEGY H4 holds card-shop framing back. This card doesn't settle that by leaving
  things out.
- **Company number and registered office** are printed on #130's privacy page (3 times) and terms
  page (2 times), not in its landing footer, which reads "© 2026 Cambridge TCG Limited. Love is the
  design." [V, `grep -c 15680297` over the #130 files: index 0, privacy 3, terms 2].
  `listing-delta.md` §3 proposes a footer that prints them. Companies House shows the number and
  the London registered office [V, find-and-update.company-information.service.gov.uk/company/15680297,
  fetched 2026-11-07 12:36 UTC, sha256 `b2526c43…406f`]. There's no claim id for them in the shared
  list, so they're not in the JSON-LD.
- **`priceCurrency` USD** is [I]: Shopify bills apps in USD. A price of 0 makes the currency moot.
- **Rich results [U].** Whether Google shows a rich result for a SoftwareApplication without
  ratings wasn't re-checked. The block is for machine readers, not for a rich result.
- **`og:locale`** should be `en_GB` (UK English copy). See §7 for how the kit sets it.

---

## 6. Proposed `[entity]` table for `kernel.toml` (text only: not applied)

If the owner chooses (b) in the status note, this is what would go into `kernel.toml`. Until then
`kernel.toml` stays as it is.

```toml
[entity]
# Approved by the owner on <date> (approvals.jsonl line <n>). Source: marketing/social/entity-card.md.
as_of = "2026-11-07"
state = "A"            # A: before G0 (S0, S1). B: from S2, once every id in `claims` is verified.
sentence  = "RewardsPro is an app for Shopify stores, on the Shopify App Store, made by Cambridge TCG Limited in London, UK."
short_100 = "RewardsPro is an app for Shopify stores, made by Cambridge TCG Limited, London, UK."
meta_160  = "RewardsPro is an app for Shopify stores, listed on the Shopify App Store. It is made by Cambridge TCG Limited, a UK company in London."
long_500  = "RewardsPro is an app for Shopify stores, listed on the Shopify App Store. It is made by Cambridge TCG Limited, a UK company in London."
claims = ["rp-on-app-store", "rp-maker"]
listing_price_rule = "No price in any App Store field but Pricing details (requirement 4.2.3). Pricing details pairs 'Free' with the additional-charges text."
review_after = "2026-12-07"
```

`long_500` leaves out the contact sentence until `rp-contact-delivers` is verified (§2); adding it
adds that id to `claims`. State B replaces the four texts, `claims` and `review_after`, and adds
the listing-safe and site variants from §3 as named keys.

---

## 7. `brand.json` description and share card: suggested diff for #83 (not applied)

**Today's value is wrong for the rebuild.** "Read Shopify cashback, points, tier rules and
existing customer records." (72 characters) [V, `brand.json:5`]:
- **Points:** the rebuild has none (p1-truth §5: the `points` absence grep finds 0).
- **Retirement framing:** "read existing records" describes the retired app.
- **It has spread through the kit:** `kit/source/brand.json:5`, `kit/kit.json:14`,
  `kit/BRAND.md:3` and `kit/web/site.webmanifest:5` [V].
- **And on to the site:** #95 copies the same manifest into the landing
  (`origin/claude/rewardspro-landing-icons`, `apps/rewardspro/landing/public/site.webmanifest`) [V].

The kit's README says why the description was kept claim-light: the old one "made the three claims
in `claims.toml`, and the served manifest would have carried them" (`marketing/README.md`,
"Metadata change, 2026-10-27"). That reason still holds, so the proposal keeps the manifest
claim-light at every stage.

**Recommended: one kit rebuild now.** It fixes the description and the share card together.
og.jpg stays off every live surface until its claims are verified (STRATEGY §7, A5).

**The share card today** (`kit/web/og.jpg`, 1200×630, looked at 2026-11-07): title "Cashback your
customers spend in your store", subtitle "Paid as Shopify store credit, with VIP tiers. Free.",
footer "RewardsPro · rewardspro.io". Two faults:
- **"Free."** fails the free rule (no "you fund the cashback").
- **"Cashback your customers spend"** says customers can spend the credit, with no
  legacy-accounts limit anywhere on the card. A link card is seen on its own, so rule 4 can't be
  met by a hero note elsewhere. Store credit "isn't available for legacy customer accounts"
  [`sh-sc-signin-legacy`; Shopify Help Center store-credit page, fetched 2026-11-07].

**PROPOSAL:** a title with no unqualified "spend", and a claim-light subtitle with no price, so
the card needs neither the free rule nor the legacy limit.

```diff
--- a/apps/rewardspro/marketing/brand.json
+++ b/apps/rewardspro/marketing/brand.json
@@ -2,13 +2,13 @@
   "name": "RewardsPro",
   "slug": "rewardspro",
   "url": "https://rewardspro.io",
-  "description": "Read Shopify cashback, points, tier rules and existing customer records.",
-  "lang": "en",
+  "description": "RewardsPro is an app for Shopify stores, made by Cambridge TCG Limited, London, UK.",
+  "lang": "en-GB",
   "colours": {"primary": "#1A3E5C", "accent": "#17BEBB"},
   "ground": {"dark": "#09110F"},
   "mark": {"svg": "rewardspro-mark.svg"},
   "wordmark": {"text": "RewardsPro", "font": "Inter", "style": "Semi Bold", "tracking": -10},
   "icon": {"tile": "#FFFFFF", "ink": "original", "padding": 0.18, "radius": 0.22},
-  "og": {"title": "Cashback your customers spend in your store", "subtitle": "Paid as Shopify store credit, with VIP tiers. Free.", "theme": "light"},
+  "og": {"title": "Cashback as store credit, with VIP tiers", "subtitle": "An app for Shopify stores, made by Cambridge TCG Limited.", "theme": "light"},
   "app": {"theme": "dark", "color_scheme": "dark"}
 }
```

**The four changes:**

| Field | Old (chars) | New (chars) | Claims | Why |
|---|---|---|---|---|
| `description` | 72 | E100-A, 83 | `rp-on-app-store`, `rp-maker` | No points, no retirement framing; true now and later |
| `og.title` | 43 | 40 | `rp-store-credit`, `rp-vip-tiers` | No unqualified "spend", so no legacy limit is needed on a card seen alone. Same words as STRATEGY's A13 feature-image text. |
| `og.subtitle` | 51 | 57 | `rp-on-app-store`, `rp-maker` | No price on the card, so the free rule doesn't fire there. Price-bearing alternative, if the owner wants one: "Free app; you fund the cashback. Shopify's store-credit fees may apply." (71) [`rp-free`, `rp-merchant-funds`, `sh-sc-fee`]. STRATEGY §7's A5 proposal ("…Free app; you fund the cashback.", 78) lacks the fee pointer that rule 3 asks of a card seen alone. |
| `lang` | `en` | `en-GB` | — | To get `og:locale` `en_GB`. **[I]:** the kit's output already derives a locale: `kit/web/head-snippet.html:15` has `og:locale` `en_US` while `brand.json:6` has `lang` `en`, so the generator likely maps `lang` to `og:locale`. How it maps `en-GB` wasn't run: the generator (artcraft-brand `brandkit.py`) isn't on this Mac (`~/.kingdom/tools/artcraft-brand/` is absent). If it doesn't give `en_GB`, drop this line and set the locale in the page's head instead. |

**Alternative for S2 only:** a `description` of T1, "Cashback as Shopify store credit, with VIP
tiers. Free app; you fund the cashback." (82 characters; `rp-store-credit`, `rp-vip-tiers`,
`rp-free`, `rp-merchant-funds`). That makes the manifest carry four claims, against the kit's own
2026-10-27 reasoning, and under rule 3 it would also need the fee pointer. Not recommended.

**What applying it takes (all the owner's or a brand-lane PR, none of it here):**
1. **Edit and rebuild.** Edit `brand.json` on #83's branch, then rebuild the kit with
   `brandkit.py --rebuild-check` (README "Rebuild"). The generator isn't installed on this Mac.
2. **Check og.jpg's layout** [I, not rendered with the generator]. Measured in today's og.jpg with
   sharp: title lines at y215–260 (x90–693) and y267–313 (x90–531); subtitle lines at y341–369
   (x91–379, "Paid as Shopify store") and y384–410 (x90–448); footer from y548. The 51-character
   subtitle already sets on two lines. Its breaks suggest a subtitle measure of about 360–385 px, or
   balanced line breaks across a wider one; which, isn't known without the generator.
   - The 40-character title should keep two lines, as the 43-character one does.
   - The 57-character subtitle needs two lines, and **a third line is likely** if the measure is
     the narrow one (the 71-character price variant likely takes three).
   - Check that a third line clears the footer at y548, and that everything survives X's centred
     1200×600 crop (15 px off the top and bottom).
3. **Record a new approval.** Append a line to `approvals.jsonl` in the owner's words, with the new
   sha256 values. Line 1's hash already no longer matches `brand.json`.
4. **Re-copy the manifest into #95.** #95 serves `site.webmanifest` as a byte copy of the kit.

---

## 8. Open points (all the owner's, unless marked)

- **The claim rows exist as `proposed`** (`rp-on-app-store`, `rp-maker`, `rp-contact-delivers`, and
  every id in §3). They await verification; nothing here may go public before that.
- **The owner's choice (a) or (b)** in the status note.
- **D-maker, one named decision:** say what else Cambridge TCG Limited sells (E500-A-maker, a new
  claim row `rp-maker-also-sells` for the claims maker, and a line on the site and the privacy
  page), or don't, as STRATEGY H4 holds until the interviews. Its other part, the Organization
  `url`, was settled on 13 Nov 2026: `https://rewardspro.io/`, not cambridgetcg.com (`approvals.jsonl`),
  live since 14 Nov (#252). The honest-by-design rule and H4 disagree; the card doesn't pick.
- **Price on the rewardspro.io meta description:** E160-B (no price, recommended) or E160-B-site.
  This is its own choice, separate from D4.
- **D4, the free wording.** Both free forms (§1) follow it.
- **The short fee pointer (rule 3).** Accept it on short, stand-alone texts (E160-B-site, T1, the
  stat tile, an og price variant), or accept in writing that those texts may omit the fee,
  recorded against `rp-free` and `sh-sc-fee`.
- **Rule 6:** whether "on the Shopify App Store" (the listing location) is fine beside PPA Part C
  s.3's compatibility wording [U: no Shopify brand page on it was read].
- **The JSON-LD merge** with the kit's `head-home.html` (§5): drop the kit's "RewardsPro"
  Organization, or keep it. Brand lane.
- **The share card:** the new og title and subtitle (§7), and the layout check after the rebuild.
- **The `lang` mapping** in the generator [I].
- **Ratings in the JSON-LD** (rich results) [U].
- **For the profiles maker, not the owner:** T1 against rule 3's fee pointer.
