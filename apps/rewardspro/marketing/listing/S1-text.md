# RewardsPro listing text: the S1 sitting sheet

**For Yu's hand, about 40–50 minutes. An agents' proposal, written 2026-11-09 for package RP-02 (issue #162).
Nothing here has been pasted, submitted or decided.** It turns ROADMAP §4 action 4 and
[`../social/listing-delta.md`](../social/listing-delta.md) §0–§2 into steps you can follow field by field in the
Partner Dashboard: what to delete, what to untick, what to paste and what to keep. Every paste text carries its
character count. RP-21 writes the screenshots sheet (`S1-screenshots.md`) beside this one.

**Why it comes first.** Shopify's Sidekick builds its app cards from the listing, and search snippets and the
directory sites copy it (ROADMAP §2; `…/wf10/status.md` §1.A), so it is the first thing assistants repeat about
RewardsPro. Today it still
says things the rebuilt app doesn't do. S1 removes what is known to be false. What stays is unverified, not shown
true, until G0 (listing-delta §0); the state B texts replace it at S2.

**What S1 needs.** Nothing to prepare for the deletions: removing a false sentence needs no claim. Every new
sentence below names its claim row in [`../claims.toml`](../claims.toml). Rows marked `*` aren't in the ledger
yet (RP-06 adds them). Three things are **HELD**, each marked where it appears and gathered in §5: the limit lines
until their rows verify, the Pricing text until `rp-merchant-funds` and `sh-sc-fee` verify and you answer Pre-5,
and a Feature 3 fallback that is only needed if the form insists on three features.

Labels: **[V]** checked in this session (a file, a commit, the saved capture of 7 Nov, or a shopify.dev page read
on 9 Nov); **[I]** inferred; **[U]** unknown. "The capture" is the listing as saved on 2026-11-07 11:46 UTC
(sha256 `126aa3b4…7877`, the hash `claims.toml` records); no agent opened the listing or the Partner Dashboard for
this sheet. Counts are Python `len()`: characters as typed, spaces included, the en dash as one (§8).

---

## At a glance

**Order.** The steps follow the map of the listing form in Shopify's best practices, §5 "App listing" (A. Branding,
B. Listing content, C. Pricing, D. Translations, E. App discovery) [V]. No agent has seen the form itself, so its
own order may differ [U]; if it does, work through the numbers below in any order. Where the SEO fields sit isn't
published [U].

| # | Field | Do | Minutes |
|---|---|---|---|
| 0 | The "before" AI check | **Optional, first**, and on its own: Q1 and Q2, logged out (§0) | 25–30 |
| 1 | Open the listing; App name; App icon | Keep "RewardsPro" (10 of 30) and the icon | 1 |
| 2 | Feature media | **Remove** the old video | 3 |
| 3 | Demo store URL | Leave as it is | — |
| 4 | Screenshots | **Try** removing #1 and #3; if the form refuses, leave all three for act 8 | 2 |
| 5 | App introduction | Keep (89 of 100) | — |
| 6 | App details | **Delete** the tier-product clause (497 → 459). Recommended: **delete** the widget sentence too (→ 358) | 4 |
| 7 | Features | **Delete** Feature 3. Recommended: **trim** Feature 2 (78 → 51) | 3 |
| 8 | Integrations | Keep empty | — |
| 9 | Pricing | Keep "Free". **Look** for an additional-charges field and note what you see. The pair text is **HELD** | 2 |
| 10 | Translations | **Check** for custom translated listings | 1 |
| 11 | Categories and tags | **Untick** Memberships and Membership perks | 2 |
| 12 | Resources | Keep the privacy policy URL; no Terms URL yet | — |
| 13 | App card subtitle | Keep (56) | — |
| 14 | Search terms | **Paste** five terms, with your word on Pre-5 | 3 |
| 15 | SEO title tag | **Check**; delete "& Memberships" only if it's there | 1 |
| 16 | SEO meta description | **Paste** the deletion-only text (141 → 88) | 2 |
| 17 | Submit | **Submit** for review; write down the date | 2 |
| 18 | Protected customer data | **Untick** Phone and Address (API access requests, a separate page) | 5 |
| 19 | Same sitting, not the listing | Now-4: PITR or your written acceptance of going without | ~10 |
| — | After | **Note the date it shows live**; set the mirrors' 30-day reminder (§4) | 2 |

Steps 1–18 take about 30–35 minutes, step 19 about 10.

---

## 0. Optional, first: the "before" AI check (25–30 minutes)

**Why now and only now.** Once the edit shows live, assistants start reading the new listing, and what they said
about the old one can't be asked again. Without this check there is no "before" to compare later months against
(`…/wf6/GROWTH.md` §4.2 act 0; `…/wf6/ai-rec.md` §5.2). It can wait until just before step 17, but no later. It
is optional: skipping it costs only the comparison.

The Lite check (`ai-rec.md` §5.1–§5.3):
1. Two questions, word for word, never changed:
   - Q1: `What is RewardsPro?`
   - Q2: `How much does the RewardsPro Shopify app cost, and what does it do?`
2. ChatGPT, 8 runs of each; Google AI Mode (google.co.uk), 4 runs of each: 24 runs.
3. A new private window for each surface, logged out, on your normal connection. A new chat for every run. Paste
   the question; no follow-ups, no thumbs.
4. Copy each full answer and any links into the private CSV (`marketing/social/private/`, which git ignores).
   Note whether it searched (sources shown) and whether an ad appeared.
5. Never sign in, and never say who is asking. Agents code what you paste; they never run the chat apps.

Q3 isn't part of the Lite check. If you add it, reword it first for the reorder-led focus (`…/wf10/status.md` C6).

---

## 1. The listing form, field by field

**Where:** Partner Dashboard → App distribution → RewardsPro → Distribution → Manage listing. Shopify's best
practices name this path for translated listings ("go to App distribution > your app > Distribution > Manage
listing") [V]; that the main listing is edited from the same page is [I].

### 1 · App name and App icon: keep

`RewardsPro`, 10 of 30 ("Use 30 characters or fewer, which is the maximum length that an app name can be") [V].
A descriptor ("RewardsPro Cashback & Tiers") is a Pre-5 question for S2, not for today.

### 2 · Feature media: remove the video

Remove the feature video (YouTube `IHgTl5oQZlg`). It shows the old app, and its cashback headline makes a speed
claim the never-say list bars (listing-delta §2, Feature video row).

- **If the form won't save without feature media [U]:** keep the video for now and say so in #162. A still that
  shows only the RewardsPro mark won't do: "Feature images and screenshots that solely contain your app logo are
  not permitted" (requirement 4.4.4) [V]. That rules out the "claim-light still" listing-delta §0 and §2 suggest.
  The next image that fits is a real frame of the app (act 8, RP-21's sheet) or A13's image at S2.

### 3 · Demo store URL: leave as it is

Not reviewed for this sheet [U].

### 4 · Screenshots: try, then stop

The replacements are RP-21's sheet and act 8. Today, only this: if the form saves with fewer than three
screenshots [U], remove **#1** (it shows a real gmail.com test address) and **#3** (tier products). If it asks for
three, leave all three until act 8. Don't change alt texts in this sitting.

### 5 · App introduction: keep

89 of 100 [V, the capture]: "Give shoppers cashback as store credit, so they have a reason to come back and buy
again." (quoted from listing-delta §2). It matches the code; its second half is positioning. State B may replace
it at S2.

### 6 · App details: two deletions

The counter should read **497** before you start [V, the capture].

**6a. Delete the tier-product clause.** False: the rebuild sells no tiers (`rp-no-tier-products`, an internal row).
Delete · 38 characters, comma included; the counter drops to **459**
```text
, and you can sell a tier as a product
```

**6b. Recommended: delete the widget sentence.** It is unverified, and every widget sentence is held back until
`rp-widget` is verified, which needs gate C to count (listing-delta §0).
Delete · 100 characters, plus the space before it; the counter drops by 101, to **358**
```text
A widget you turn on in your theme editor shows signed-in customers their credit, tier and progress.
```
Keeping it is your call. If you keep it, it is kept-but-unverified, and the two HELD limit lines (§5) won't fit
in 500 later (459 + 133 = 592).

**6c. Keep the rest.** Its two closing sentences, on spending credit when signed in with new customer accounts or
Shop Pay and on the full balance, are already the first of the three limit lines [V, the capture], resting on
`sh-sc-signin-legacy` and `sh-sc-full` (both proposed). "Customers move up tiers as they spend" is incomplete (they move down too: `rp-vip-tiers`); S2's
text replaces the whole field (`social/entity-card.md` §3, E500-B-listing).

### 7 · Features: delete Feature 3, trim Feature 2

**Feature 1: keep** · 71 of 80 · rests on `rp-store-credit`, `rp-paid-trigger` (proposed).

**Feature 2: recommended, trim.** Delete these words and the space before them.
Delete · 26 characters; the counter drops by 27, from 78 to **51**
```text
over 12 months or all time
```
What remains · 51 characters · rests on `rp-vip-tiers` (proposed)
```text
VIP tiers by spend, each with its own cashback rate
```
Why: the ledger narrowed `rp-tier-window` on 2026-11-07. "All time" counts only orders RewardsPro has recorded,
reaching back up to 12 months before install, and the row says public copy uses "All time" only beside that limit.
Eighty characters have no room for it. Keeping Feature 2 as it is, is your call (listing-delta §2 said keep; the
narrowing came the same day).

**Feature 3: delete** · 65 characters
```text
Sell a tier as a one-time product for a month, a year or lifetime
```
False: there are no tier products (`rp-no-tier-products`). If the form insists on three features [U], don't paste
anything here today: see §5, HELD row F3.

### 8 · Integrations: keep empty

The capture shows none. "Don't include Shopify itself" (best practices §5 B7) [V].

### 9 · Pricing: keep "Free", look, paste nothing

- **Keep** "Free" (Free to install). It is true of the code (no billing code: `rp-free`'s source). `rp-free`
  itself stays proposed while two old paid agreements stand (its contrary evidence).
- **Look, change nothing:** with Free to install selected, does the form offer "A description of any additional
  charges", or a link to "a page that describes any charges that are billed outside of Shopify's app billing
  system" (both from Shopify's pricing example) [V]? Note yes or no, and the counter if there is one, in #162.
  That answers listing-delta's open question [U] and decides which HELD option in §5 fits.
- **HELD:** the pair text ("You fund the cashback you give" with Shopify's fee sentence). §5 has both options with
  counts. A bare "Free" breaks the free rule, so the pair goes in as soon as its rows verify and you answer Pre-5.

### 10 · Translations: check

English listings are translated automatically, but "Adding your own translated listing for an automatically
translated language overwrites and disables automatic translation for that language" [V, best practices §5 D].
If any custom translated listing exists [U], it still carries the old text: delete it (that "resumes automated
translation") or edit it the same way.

### 11 · Categories and tags: untick two

**Untick:** "Memberships" (Program types) and "Membership perks" (Rewards you can offer). The rebuild has no
memberships (`rp-no-tier-products`). "Your tags should accurately reflect the primary function(s) of your app"
(4.3.5) [V].

**Keep:** Reward programs, VIP tiers, Cash back programs (Program types); Cash back, Store credit (Rewards you can
offer). Category: Loyalty and rewards.

### 12 · Resources: keep

Keep the privacy policy URL; act 7 replaces the page behind it. Add the Terms of Service URL only once
`rewardspro.io/terms/` is live (listing-delta §2). The FAQ link waits for `/help/` (S2).

### 13 · App card subtitle: keep

56: "Bring buyers back with cashback they spend in your store" (listing-delta §2). Not false, but positioning, and
MESSAGING §4 lists "bring buyers back" among the outcome phrases to avoid; changing it is your call at S2, after
the interviews. "Don't add keywords to your subtitle with the intent of improving search performance" (4.4.1) [V].

### 14 · Search terms: five, with your word on Pre-5

Replace what is there (#131 proposed a set with "membership"; the live set can't be read from outside [U]) with
these five, one per box. "For search terms, enter up to five relevant terms using complete words (not partial) and
limit to one idea per term" [V, best practices §5 E]. The length of a term is unconfirmed: check the field's own counter.

| # | Term | Characters | Basis |
|---|---|---|---|
| 1 | `store credit` | 12 | `rp-store-credit` |
| 2 | `cashback` | 8 | `rp-store-credit`, `rp-paid-trigger` |
| 3 | `VIP tiers` | 9 | `rp-vip-tiers` |
| 4 | `loyalty program` | 15 | the category the listing sits in, Loyalty and rewards (§6) |
| 5 | `rewards program` | 15 | the same |

- US "program" on purpose: terms follow what merchants type, aren't shown on the listing [I], and are translated
  automatically [V]. MESSAGING keeps "loyalty program" out of copy; a search term isn't copy.
- Never: trade-in, tcg, membership, points or free (`…/wf10/status.md` A3; "free" belongs only in Pricing
  details, 4.2.3).
- If you'd rather not decide Pre-5 today: remove "membership" and leave the other terms as they are.

### 15 · SEO title tag: check

On 7 Nov the page title showed the app name and subtitle, which suggests this field is empty [I]. If it is empty,
leave it: its text comes at S2. If it holds #131's "RewardsPro – Cashback, VIP Tiers & Memberships", delete these
words and the space before them · 13 characters (the counter drops by 14)
```text
& Memberships
```
What remains · 32 characters. The field's limit is unconfirmed: check its own counter.
```text
RewardsPro – Cashback, VIP Tiers
```

### 16 · SEO meta description: paste

Select all (141 characters today [V, the capture]) and paste the text below. Deletion only: the live words in the
same order, with "repeat" and the tier-membership clause taken out [V, word by word against the capture]. What
remains rests on `rp-store-credit` and `rp-vip-tiers` (proposed).
Paste · 88 characters (the limit is unconfirmed: check the field's own counter)
```text
RewardsPro pays customers cashback as Shopify store credit, with VIP tiers set by spend.
```
"Repeat" goes because a new buyer earns on a first paid order too (listing-delta §2, meta row).

### 17 · Submit

Submit the listing for review at once, so Shopify's review starts. "Any changes that you make to your app listing
are subject to review" [V]. How long the review takes is [U]. Write down today's date; the clock in §4 starts on
the day the edit **shows live**, not today.

---

## 2. Protected customer data (step 18, about 5 minutes)

**Where:** Shopify's steps read "From the Partner Dashboard, go to Apps, and then select your app.", then "In the
sidebar, click API access requests.", then "Find Protected customer data access" [V, shopify.dev
protected-customer-data]. Editing an existing request may look different [U].

**Keep Name. Keep Email (recommended). Untick Phone and Address.**

- The rebuild reads first and last names only, live, and stores none (`apps/rewards/app/shopify/graphql.ts:439-449`,
  `app/shopify/names.server.ts:4-12` at 2fe85336) [V].
- The Customers search passes what the merchant types to Shopify and reads back customer IDs only
  (`graphql.ts:451-476`). The code's own note says a search on email "may also need protected customer data access
  to those fields" [I], so Email stays unless you accept that searching by email might stop working.
- Nothing in `apps/rewards/app` or `extensions` reads a phone number or an address (`git grep` at 2fe85336) [V].
- Shopify's rule: it approves access "if the requested data is the minimum amount required by your app to provide
  the merchant with the app functionality" [V]. Shopify's field list puts geolocation under Address ("address
  line 1, address line 2, geolocation, and zip codes") [V], so unticking Address may also clear "Geolocation" from
  the listing's device-data line [I].

**Reasons, only if the form asks you to state them again.** These go to Shopify's reviewers, not onto the listing,
so they carry code locators instead of claim rows.

Name · 120 characters
```text
The admin pages show each buyer's first and last name, asked from Shopify when a page loads. RewardsPro stores no names.
```
Email · 167 characters
```text
The Customers page search sends what the merchant types to Shopify's customer search and reads back customer IDs only. RewardsPro doesn't use or store email addresses.
```

Then save and submit as the form asks. Whether the change starts a review of its own is [U].

---

## 3. Same sitting, not the listing (step 19, about 10 minutes)

ROADMAP §5 Now-4, because the listing is installable today and the new search terms make it easier to find: PITR
(about US$100 a month) or your written acceptance of going without, and the EU representative. Both are your call;
no agent acts on either.

---

## 4. After you submit: the live date and the 30-day reminder

1. **Note the date it shows live.** When Shopify's review passes, open the public listing yourself, logged out,
   and check that Feature 3 is gone. Write the date in #162 as `live: YYYY-MM-DD`. The "before" picture, the
   mirrors' 30 days and Sidekick's source all run from that date, not from the day you submitted
   (`GROWTH.md` §4.2 act 2). Agents don't open the listing.
2. **In the same look,** read the Data access section: are Phone and Address gone, and do the device-data and
   store-owner lines remain? Where those two lines come from is still [U] (listing-delta §9).
3. **The mirrors' 30-day reminder.** Put a reminder in your calendar for the live date plus 30 days. Then look once
   at LetsMetrix and PickYourApp, which copy listings. If either still shows the old text, ask each once for one
   factual correction, pointing at the listing (`…/wf10/status.md` C7). This step isn't in ROADMAP §4's eleven
   actions yet (`status.md` §3, gap 1), so this sheet carries it.

---

## 5. HELD: what waits, for what, and where it goes

Each later paste is a new listing edit, and each edit is reviewed again. Putting held lines in with act 8's
screenshots or act 9's Pricing paste means fewer reviews [I].

### The three limit lines (`…/wf8/reviews.md` §6.1, R-0)

| Limit | State | Rows | Un-held when |
|---|---|---|---|
| L1: buyers spend credit only when signed in with new customer accounts or Shop Pay | **Already live** in App details (step 6c). Nothing to paste | `sh-sc-signin-legacy`, `sh-sc-full` | — |
| L2: store credit can't pay subscription renewals | **HELD** | `sh-sc-subscriptions`* | RP-06 adds the row, and a second session concurs on its evidence |
| L3: no per-product or per-channel rules | **HELD** | `rp-no-order-rules`* | RP-06 adds the row with its guard test, and a second session concurs |

When both rows are verified, click at the very end of App details, type a space and paste the two sentences. With
6b done the counter goes from 358 to **491**; with 6b undone it would reach 592, over the 500 limit.
Paste · 132 characters, after a space you type
```text
Shopify doesn't let store credit pay subscription renewals. You can't exclude products, collections or sales channels from cashback.
```
By sentence: (1) `sh-sc-subscriptions`*, MESSAGING §3's wording; (2) `rp-no-order-rules`*, worded as what the merchant can't
set, never "every product" or "no exclusions" (MESSAGING §4).

R-0 asked for Shopify's link beside each limit. App details can't carry it: "Keep support info, links, and
testimonials in their designated fields" (best practices §5 B5) [V]. So the links go on the `/help/` page (RP-09)
and reach the listing as its FAQ resource at S2 [I].

### The Pricing pair (`…/wf10/status.md` A9; listing-delta §2, Pricing row)

**HELD** until `rp-merchant-funds` and `sh-sc-fee` are verified and you answer Pre-5. `sh-sc-fee` is Shopify's
rule, re-checked before each use (its `review_after` is 2026-12-07), from your paste of the Help Center page,
never an agent's read.

**Option A**, if the form has an additional-charges field that takes it. By sentence: (1) `rp-merchant-funds`;
(2) `sh-sc-fee`.
Paste · 205 characters
```text
You fund the cashback you give: it is store credit in your own shop. For stores created on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit.
```

**Option B**, if the field exists but is short · 70 characters · `rp-merchant-funds`, `sh-sc-fee`
```text
You fund the cashback you give. Shopify's store-credit fees may apply.
```

**If there is no such field:** the pricing-details link to a rewardspro.io page that carries Option A
(listing-delta §2, fallback 1). That page would be RP-08's or a later one, on your yes.

### F3: only if the form insists on three features

**HELD** for `rp-refund-takeback`, which needs a production refund (G0), or for your written exception to put a
code-backed, staging-observed line up before its row verifies. That exception is yours alone (gate G1).
Paste as Feature 3 · 79 characters · `rp-refund-takeback`
```text
Refunds take back their share of cashback, from credit the customer still holds
```
listing-delta §2 offered an email line instead ("Sends no email itself; …"). Its row, `rp-no-own-email`, has no
`listing` channel and waits for your Now-5 decision, so it is further off than this one.

---

## 6. Field limits and rules, read 2026-11-09

Fetched once each on 2026-11-09 between 21:37 and 21:40 UTC with a generic browser User-Agent, after checking
`shopify.dev/robots.txt` (none of these paths is disallowed). Shopify's pages carry dynamic markup, so compare the
quoted sentence, not the hash (the `claims.toml` convention). The raw copies stay in the session scratchpad.

| Page | URL | sha256 of the body |
|---|---|---|
| Best practices | https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices | `6a046289…a77fde3c` |
| App Store requirements | https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements | `17d94531…3c063eaf` |
| Protected customer data | https://shopify.dev/docs/apps/launch/protected-customer-data | `b496ddee…a45fe107` |
| Create ads | https://shopify.dev/docs/apps/launch/marketing/advertising/create-ads | `eeda79bb…ebf7b036` |
| App listing categories | https://shopify.dev/docs/apps/launch/app-store-review/app-listing-categories | `6374b6c1…cdb8449e` |

| Field or rule | Shopify's words (2026-11-09) | Where |
|---|---|---|
| App name | "Keep it short: Use 30 characters or fewer, which is the maximum length that an app name can be." | Best practices §5 A1 |
| App introduction | "Your app introduction (100 characters) should clearly highlight the benefits merchants can expect. … Avoid keyword stuffing, data claims, and incomplete sentences." | Best practices §5 B4 |
| App details | "In your app details (500 characters), describe functional elements and what makes your app unique. Avoid excessive marketing language, keyword stuffing, and outcome guarantees. Keep support info, links, and testimonials in their designated fields." | Best practices §5 B5 |
| Features | "Keep features short and scannable (up to 80 characters per feature)" | Best practices §5 B6 |
| Number of features, and whether fewer than three is allowed | Not stated | Unconfirmed: check the form |
| Feature media | "If you don't have a video, use a static image that conveys your app's benefit or unique value." "Don't use Shopify logos or repeat your app card subtitle in the image." | Best practices §5 B1 |
| Logo-only images | "Feature images and screenshots that solely contain your app logo are not permitted." | Requirement 4.4.4 |
| Screenshots | "Include 3-6 desktop screenshots, including at least one of your app's UI. … Provide alt text, avoid PII, and don't include pricing, reviews, or outcome guarantees." | Best practices §5 B3 |
| Whether feature media may be empty | Not stated | Unconfirmed: check the form |
| Pricing | "Choose your primary billing method (Free to install, Recurring charge, or One-time payment) and provide clear pricing information in the designated section only." The example lists "A description of any additional charges for this plan" and "A link to a page that describes any charges that are billed outside of Shopify's app billing system." | Best practices §5 C |
| Pricing, complete | "Ensure your pricing information includes all pricing options such as, free trial time and charge details." | Requirement 4.2.1 |
| Pricing, nowhere else | "Do not include pricing information in undesignated areas like your app logo, to prevent merchant confusion. Keep this information in Pricing details." | Requirement 4.2.3 |
| Additional-charges field for Free to install, and its length | Not stated | Unconfirmed: check the field's own counter (step 9) |
| Truthful listing | "Your app store listing should be truthful and accurate. Merchants should know based on your listing if your app will work for them." | Requirement 4.3 |
| Factual only | "Your app and app listing should only include factual information." | Requirement 1.1.4 |
| No stats | "Do not use any statistics or data in your app's listing content … avoid using terms like "the first", "the best", or "the only"." | Requirement 4.3.3 |
| Tags | "Your tags should accurately reflect the primary function(s) of your app." | Requirement 4.3.5 |
| Category | "Loyalty and rewards: Apps that manage customer rewards and loyalty programs." | App listing categories |
| Online store | "If your app embeds features in a merchant's Online Store, then select "Merchant must have online store" under the Sales channel requirements section of your app listing form." | Requirement 4.3.1 |
| App card subtitle | "Don't add keywords to your subtitle with the intent of improving search performance." Length not stated | Requirement 4.4.1. Length unconfirmed: check the field's own counter |
| Search terms | "For search terms, enter up to five relevant terms using complete words (not partial) and limit to one idea per term". Length of a term not stated | Best practices §5 E. Length unconfirmed: check the field's own counter |
| SEO title tag, SEO meta description, image alt text | Not stated on either page | Unconfirmed: check the field's own counter |
| Translations | "Automated translation covers: App card subtitle, App introduction, App details, Features, Pricing details, Search terms, and image alt text." | Best practices §5 D |
| Review | "Any changes that you make to your app listing are subject to review." | Create ads |
| Protected data | "Shopify will approve your app to use protected customer data if the requested data is the minimum amount required by your app to provide the merchant with the app functionality." | Protected customer data |

The five numeric limits (30, 100, 500, 80, five terms) are the same as listing-delta §1 read on 2026-11-07.
New since then, for this sheet: the details' "links" sentence (§5) and requirement 4.4.4 (step 2).

---

## 7. What changed since #131

Draft PR #131 (`claude/rewardspro-launch-copy` at ced404ab, 2026-11-03) wrote the listing text for the old app
(`apps/rewardspro` at 85789f7e). Production has run the rebuild (`apps/rewards`) since the 2026-11-06 switch, and
by the 7 Nov capture most of #131's listing block was already live, with small edits (listing-delta §2).

| Part of #131 | Since then | In this sheet |
|---|---|---|
| SEO title tag "…VIP Tiers & Memberships" (46) | "Memberships" is false for the rebuild. The 7 Nov page title suggests the field may be empty [I] | Step 15: check, delete "& Memberships" if there |
| Meta description (134), with "tier memberships you can sell as products" | Live at 141, with "repeat" added | Step 16: 88-character deletion-only text |
| App card subtitle (56) | Live as written | Step 13: keep |
| App introduction (97) | Live at 89, edited | Step 5: keep |
| App details (499), with "and you can sell a tier as a product" and the currency words | Live at 497: the currency words are gone, the sign-in sentence reworded; the tier-product clause is still there | Step 6: delete the clause; the widget sentence recommended |
| Features (71, 78, 65) | Live as written. Feature 3 is false; `rp-tier-window` was narrowed on 7 Nov | Step 7: delete Feature 3; trim Feature 2 recommended |
| Tags: remove Subscriptions, Gift card programs, Discounts, Gift cards; keep Memberships and Membership perks | Those four, and both "Custom" tags, are gone. Memberships and Membership perks are still ticked, and are false now | Step 11: untick both |
| "Works with: Customer accounts" | Not on the 7 Nov capture | Nothing to do |
| Search terms, with "membership" | Not readable from outside [U] | Step 14: five terms, no "membership" |
| Screenshot alt texts; retake #1 and #3 | All three are the old admin; the shot list finds #2 false too | Step 4 only; RP-21's sheet and act 8 |
| Feature video: watch, then decide | It shows the old app and a speed claim the never-say list bars | Step 2: remove |
| Protected data: name, email and phone; drop address | The rebuild reads names only; email may be needed for search | Step 18: untick Phone and Address |
| Pricing: leave "Free" | "Free" needs its pair (`rp-free`'s scope) | Step 9: keep and look; the pair HELD (§5) |
| Developer address | The listing shows "London, GB" | Not in this sheet (Partner account settings) |
| `[Yu: …]` notes (1)–(3), "When to paste", the claim-source table | Old-app issues (PR #126, crons off, the widget's local balance), and old-app paths | Dropped; claim ids instead |
| Field limits | The same five, re-read 2026-11-09, plus two rules (§6) | §6 |
| Outreach note | Not this package. MESSAGING.md §5 now holds the proposed email set | — |
| EU representative shortlist | Not this package. listing-delta §2: unaffected; re-check prices before signing | — |

**For your decision on #131:** this sheet and listing-delta replace its listing part, all of which is either live
or superseded. Its other two parts aren't RP-02's. If you want the EU shortlist kept in git, keep #131 open for
that; otherwise it can be closed once you've read this. Your call; no agent closes it.

---

## 8. How this sheet was checked

- **Counts:** Python `len()` on the exact text inside each `text` block, with no trailing newline. A second session
  can re-run every count in this file from the repo root (19 lines, all "ok", when this was committed):
  ````sh
  python3 -I - apps/rewardspro/marketing/listing/S1-text.md <<'EOF'
  import re, sys
  t = open(sys.argv[1], encoding="utf-8").read()
  pairs = re.findall(r"· (\d+) characters[^\n]*\n```text\n(.*?)\n```", t, re.S)
  pairs += [(n, s) for s, n in re.findall(r"\| `([^`]+)` \| (\d+) \|", t)]
  for n, s in pairs:
      print("ok " if len(s) == int(n) else "BAD", n, len(s), s[:50])
  EOF
  ````
- **Live values:** read from listing-delta §2, #131, and the capture of 7 Nov (sha256 `126aa3b4…7877`). The
  capture was used only to confirm that each deleted fragment occurs word for word and to count the fields before
  and after; none of its text is copied here beyond what listing-delta already quotes.
- **Code:** read in this worktree at origin/main 2fe85336 (`graphql.ts`, `names.server.ts`, `shopify.app.toml`,
  and a `git grep` for phone and address reads).
- **Not opened:** apps.shopify.com, help.shopify.com and the Partner Dashboard, by any tool. Shopify's own text
  above comes from shopify.dev only (§6).
