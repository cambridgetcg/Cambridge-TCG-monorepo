# What must change in #131 and #130 before they are pasted or published

Agents' review for Yu, 2026-11-07. **Nothing was pasted, published, committed or deployed.**

**What's compared:**
- **#131** (`origin/claude/rewardspro-launch-copy` ced404ab, file
  `apps/rewardspro/docs/launch/2026-11-listing-and-outreach.md`): its App Store listing text,
  field by field.
- **#130** (`origin/claude/rewardspro-public-texts` 6d96e17f): its landing, privacy policy, terms
  and subprocessors pages.

Both were written on 2026-11-03 against the **old** app (`apps/rewardspro`). Here they are compared
with the **rebuilt** app at origin/main 6f3a57b6 (`apps/rewards`), which production runs [I, strong:
STRATEGY §1.1].

Labels: **[V]** verified (file:line, or URL plus date), **[I]** inferred, **[U]** unknown. Code
paths are relative to `apps/rewards/` in the read-only checkout. Every replacement text is a
**PROPOSAL**. A product sentence goes public only once each claim id it carries is `verified` in
`claims.toml` (G1). The ids are those in STRATEGY §6.3. "No id" means the shared claim list has
no row for that fact: the claims maker or Yu decides whether a legal page needs one. Counts are
Python `len()`, spaces included. The scripts are in
`/private/tmp/claude-501/-Users-macair/be982085-a904-436a-8476-20067b564f5a/scratchpad/entity/scripts/`
(first pass) and
`/private/tmp/claude-501/-Users-macair/be982085-a904-436a-8476-20067b564f5a/scratchpad/entity-fix/scripts/count_fix.py`
(every text changed in the fix pass).

*Revised 2026-11-07 after the verifiers' review (truth, wording and platform lenses).*

Inputs:
- the phase-1 notes `p1-drafts.md` and `p1-truth.md` (workflow folder);
- the live listing extract of 2026-11-07 (`scratchpad/p1data/listing-2026-11-07.txt` and `.html`);
- shopify.dev pages fetched today (§1);
- fetched read-only on 2026-11-07 at 12:36 UTC with a generic User-Agent, for the fix pass [V]:
  - Companies House, find-and-update.company-information.service.gov.uk/company/15680297
    (sha256 `b2526c431fc20abc56615af6f85ab945a26e7af5cddea60f72b02a26c31b406f`);
  - shopify.dev/docs/apps/build/webhooks/troubleshooting-webhooks, which redirects to
    `…/webhooks/troubleshoot` (sha256 `cc5588adb30aaeb383825fad82cc8eccbde9765a57d85c0e156807b3c87eb965`);
  - help.shopify.com/en/manual/apps/uninstalling-apps
    (sha256 `4e68dcaa39825f5afbdbd94861f06a2fbf09502a08f72a65d02e66c9c20de1b1`).

Every changed fact below was re-read in the rebuild code for this file.

**Corrections to the phase-1 notes:**
- **Expired online sessions are still deleted after 24 hours.** The rebuild's housekeeping does
  this (`app/routes/api.cron.housekeeping.tsx:5-8`), so #130's "24-hour buffer" sentence stays
  true; `p1-drafts.md` said to drop it.
- **The scopes line in `shopify.app.toml` is line 49,** not 56.

---

## 0. In short

**Now, S1 (a): deletions only, no new claim.**
- Remove ", and you can sell a tier as a product" from App details (459 left). **Recommended:** also
  delete the widget sentence (358 left). The entity card holds every widget sentence until
  `rp-widget` is verified (B3 plus gate C), and the widget a buyer sees may still be the old one,
  which shows £0.00 for an unknown balance (`docs/switch.md:199`; §9). Keeping it is Yu's call; if
  kept, it is kept-but-unverified.
- Delete Feature 3.
- Delete the tier-membership clause and "repeat" from the SEO meta description.
- Remove the Memberships and Membership perks tags, and the "membership" search term.
- Remove screenshots #1 (the old admin with a gmail.com test address: a personal-detail risk) and
  #3 (tier products). **If the form allows fewer than 3 screenshots [U], remove #1 and #3 at
  once**, whatever happens to (b).
- Remove the video, together with putting a feature image in its slot, unless the form allows
  empty feature media [U] (§2, Feature video row).
- Trim the protected-data request.

**Now, S1 (b): new content, not deletions.** Each item needs Yu's approval as new content:
1. **The Pricing details additional-charges text** [`rp-merchant-funds`, `sh-sc-fee`]: the one
   text addition in S1, because the listing's "Free" needs its pair (§2, Pricing row). It goes in
   as soon as those two ids are verified; neither needs G0 (STRATEGY §13 step 5).
2. **Replacement screenshots**, as `shot-list.md` §5 plans them: S1-A Home "Set up cashback" and
   S1-B Tiers replace all three old screenshots, and S1-C Orders (empty) goes up only if the form
   refuses two. They are new product depictions with their own claim ids and provenance (§2,
   Screenshots row). *Completeness check, 2026-11-07:* `shot-list.md` §5 was revised after this file
   was written. It finds #2 false too (each tier carries its own "Annual" duration; the rebuild has
   one "Spend counted over" setting, `app/routes/app.tiers.tsx:411-432`), and it dropped the Settings
   frame from S1 because `rp-no-own-email` has no `listing` channel (Settings is SH-7, at S2). So S1
   (a) above may remove #2 as well; that is the owner's call, with the form-minimum question [U].
3. **A claim-light feature image** for the video slot, if the form needs one (§2, Feature video
   row).

**What S1 achieves:** it removes what is known to be false. What stays is unverified, not shown
true, until G0 and B3: for example "when an order is paid" [`rp-paid-trigger`] in App details and
Feature 1.

**Before S2:**
- The listing gets the state B texts from `entity-card.md`.
- rewardspro.io's pages are rewritten. #130's privacy, terms and subprocessors facts are mostly
  wrong for the rebuild:
  - emails it doesn't send;
  - providers it doesn't call;
  - data it doesn't store;
  - erasure timing it doesn't have;
  - an export it doesn't make;
  - pages it doesn't have.

**Don't paste #131's listing block as written.** Most of it is already live, and the rest
reintroduces "Memberships".

---

## 1. Field limits (checked 2026-11-07)

From shopify.dev, fetched 2026-11-07 11:47 UTC with a generic User-Agent [V]:
- `best-practices` (sha256 `504c34a4a825633ceea4ceaf68764ca2e6bec9fa6f91379b62167b0a3bfe5528`);
- `app-store-requirements` (sha256 `6b8575b4a787611b55ca9df4c25300b1a49a229ed06ba02d49da8011145cc733`).

| Field | Limit | Source |
|---|---|---|
| App name | 30 characters | best practices ("30 characters or fewer, which is the maximum") |
| App introduction | 100 | best practices §4 |
| App details | 500 | best practices §5 |
| Each feature | 80 | best practices §6 |
| Search terms | up to 5, complete words, one idea each | best practices E |
| Screenshots | 1600×900, "3-6 desktop screenshots", alt text, no PII, no pricing | best practices §3 |
| Feature image | 1600×900, one focal point, 4.5:1, no Shopify logos, don't "repeat your app card subtitle in the image", no pricing in images | best practices §1 (`bp.html.txt:330`); requirement 4.2.2 (`req.html.txt:445-447`) |
| Feature video | "Keep it promotional rather than instructional and limit screencasts to 25% of the video. If you don't have a video, use a static image" | best practices (`bp.html.txt:329`) |
| Pricing | only in Pricing details (4.2.3); "Ensure your pricing information includes all pricing options such as, free trial time and charge details" (4.2.1); the plan card has "a description of any additional charges for this plan" (item 6), and the section can link "a page that describes any charges that are billed outside of Shopify's app billing system" (item 1) or "the app's pricing in detail" (item 8) | requirements 4.2 (`req.html.txt:440-451`); best practices C (`bp.html.txt:411-430`). **[U]:** whether a Free-to-install listing offers the additional-charges field at all, and its counter. The live listing shows "Free" with no plan cards. |
| No stats, no "first/best/only" | 4.3.3 | requirements |
| Terms of Service URL | "For apps using Shopify managed installation, add a Terms of Service URL if you want your terms displayed in the install modal. If no Terms of Service URL is provided, you remain responsible for ensuring merchants review and agree to your terms" | best practices E |
| App card subtitle, SEO title tag, SEO meta description, alt text, number of features | **not stated** on either page | [U]: the form's own counter decides |

---

## 2. #131: the App Store listing, field by field

Live text is from the listing fetched 2026-11-07 (p1 extract, lines 9-10, 727-841, 1194-1272).

| Field (limit) | #131 draft (chars) | Live today (chars) | Against the rebuild | Before Yu pastes | Proposed text (chars) [claim ids] | Stage |
|---|---|---|---|---|---|---|
| App name (30) | `RewardsPro` (10) | same | True. The app's own name in Shopify is still "Rewards Pro" (`shopify.app.toml:10`); 4.1.1 accepts "similar" names [V]. | No change to the field. Rename the toml (§8, item 2). | — | — |
| App card subtitle (not stated) | "Bring buyers back with cashback they spend in your store" (56) | same [I: read from the page title] | No false fact. "Bring buyers back" is an outcome: positioning, a HYPOTHESIS. | None required. Yu's call after the interviews. | keep | — |
| SEO title tag (not stated) | "RewardsPro – Cashback, VIP Tiers & Memberships" (46) | The page title reads "RewardsPro - Bring buyers back with cashback they spend in your store \| Shopify App Store" (listing HTML line 9) [I: the field may be empty, and Shopify appends " \| Shopify App Store"] | **"Memberships" is false.** The rebuild sells no tiers. Its only Shopify writes are store credit, one bulk operation and one app-data metafield (p1-truth §5). Scopes have no `write_products` (`shopify.app.toml:49`). | Don't paste #131's. | Sentence case, as UK house style: "RewardsPro – store credit cashback and VIP tiers" (48; about 68 with Shopify's suffix [I]) [`rp-store-credit`, `rp-vip-tiers`]. To stay near 60 in search results, "RewardsPro – store credit cashback" (34; about 54) [`rp-store-credit`]. Or leave empty. | S2 |
| SEO meta description (not stated) | "…with VIP tiers set by spend and tier memberships you can sell as products." (134) | "RewardsPro pays repeat customers cashback … and tier memberships you can sell as products." (141) | **False clause.** "Repeat" is wrong too: a buyer new to the store is placed in the lowest tier first and earns at its rate on their first paid order (`app/lib/record-order.server.ts:77-79`, and the tier placement in `:116-131`). | **S1, deletion only:** "RewardsPro pays customers cashback as Shopify store credit, with VIP tiers set by spend." (88) | **S2:** E160-B (154): "RewardsPro adds cashback to Shopify store credit when an order is paid, at the customer's tier rate. A refund takes back its share from credit still held." [`rp-store-credit`, `rp-paid-trigger`, `rp-vip-tiers`, `rp-refund-takeback`] | S1, then S2 |
| App introduction (100) | "Give shoppers cashback as Shopify store credit, so they have a reason to come back and buy again." (97) | "Give shoppers cashback as store credit, so they have a reason to come back and buy again." (89) | Matches the code; unverified until G0, not known false. The tail is positioning (HYPOTHESIS). No price. | None required. | Optional at S2: E100-B (96): "Give customers cashback as Shopify store credit when an order is paid, at their VIP tier's rate." [`rp-store-credit`, `rp-paid-trigger`, `rp-vip-tiers`] | S2, optional |
| App details (500) | 499 chars, including "and you can sell a tier as a product" and "in full and in your store's currency" | 497 chars, including "and you can sell a tier as a product" (the currency words already gone) | **False:** tier products. **Incomplete:** "move up tiers": customers also move down (`app/lib/tiers.server.ts:1-18`, resolveTier). **#131's currency words ("in your store's currency") are wrong for multi-currency orders by design:** the code issues credit in the currency the buyer paid in (`app/lib/money.ts:26`, `ISSUE_IN = "presentment"`), which has not been observed (gate N is open: `docs/switch.md:233`; STRATEGY §6.4). For a single-currency store they're simply true. Drop the words; the live text already has. **Held:** the widget sentence waits for `rp-widget` by the entity card's own rule. "With automatic cashback on": the switch is labelled "Cashback" (`app/routes/app._index.tsx:333`). | **S1, deletion only:** remove ", and you can sell a tier as a product" (459 left). **Recommended:** also remove "A widget you turn on in your theme editor shows signed-in customers their credit, tier and progress." (358 left). If Yu keeps it, it's kept-but-unverified. | **S2:** E500-B-listing (498) [`rp-vip-tiers`, `rp-tier-window`, `rp-setup-steps`, `rp-store-credit`, `rp-paid-trigger`, `rp-cashback-base`, `rp-refund-takeback`, `rp-tier-lock`, `sh-sc-signin-legacy`, `sh-sc-full`]. Once `rp-widget` is verified: E500-B-listing-widget (493). Texts in `entity-card.md` §3. | S1, then S2 |
| Feature 1 (80) | "Automatic cashback, added to Shopify store credit when an order is paid" (71) | same | True by code (`app/routes/webhooks.orders.paid.tsx:1-13`; `app/shopify/store-credit-rail.server.ts:307`). It needs a tier and the switch on (`docs/switch.md:176`). | keep | [`rp-store-credit`, `rp-paid-trigger`] | — |
| Feature 2 (80) | "VIP tiers by spend over 12 months or all time, each with its own cashback rate" (78) | same | True (`app/admin/words.ts:34`; `app/lib/tiers.server.ts:118-131`). | keep | [`rp-vip-tiers`, `rp-tier-window`] | — |
| Feature 3 (80) | "Sell a tier as a one-time product for a month, a year or lifetime" (65) | same | **False** (no tier products, as above). | **S1: delete.** If the form demands three features [U], use "Sends no email itself; Shopify can email customers when they earn store credit" (78), but only once `rp-no-own-email` is verified. That needs no dev store, only its guard test. | **S2:** "Refunds take back their share of cashback, from credit the customer still holds" (79) [`rp-refund-takeback`]. Or, after `rp-widget`: "A widget in your theme shows signed-in customers their tier, credit and progress" (80) [`rp-widget`] | S1, then S2 |
| Tags (4.3.5) | keeps Memberships and Membership perks | Program types: Reward programs, **Memberships**, VIP tiers, Cash back programs. Rewards: Cash back, Store credit, **Membership perks** | No memberships in the rebuild. | **S1:** remove Memberships and Membership perks. Keep the other five. | — | S1 |
| Search terms (5) | cashback, store credit, loyalty program, VIP tiers, membership | not readable [U] | "membership" is stale. | Remove "membership" (S1 (a)). | Optional replacement: "rewards program" (15). US spelling on purpose: search terms follow the spelling merchants type, and they aren't shown on the listing as copy [I: they weren't visible in the live listing extract]. If Yu prefers UK spelling everywhere, "rewards programme". "loyalty program" is a search term only; the voice guide keeps it out of copy. Yu's call. | S1 |
| Screenshots (3–6, 1600×900) | keeps the three old ones; asks for #1 and #3 to be retaken | 3 images of the **old** admin: #1 shows a gmail.com test address, #3 shows tier products "as recurring subscriptions" | None of them shows the rebuild. #1 shows a gmail.com test address (a personal-detail risk; best practices say avoid PII). | **S1 (a):** remove #1 and #3. **S1 (b), new content (Yu's approval):** the replacements are `shot-list.md` §5's frames, on the store Yu picks there (D-shots-1: a fresh development store recommended, or rewardsprotesting): **S1-A** Home "Set up cashback" [`rp-setup-steps`] and **S1-B** Tiers [`rp-vip-tiers`, `rp-cashback-base`, plus `rp-tier-window` only if "Spend counted over" is in frame] replace all three old screenshots; **S1-C** Orders (empty, app text only) goes up only if the form refuses two (`shot-list.md` §5, revised; the earlier S1-C Settings frame moved to SH-7 at S2 because `rp-no-own-email` has no `listing` channel). File names, sidecars and checks as `shot-list.md` §3 (`rewardspro_s1_…_1600x900_…`), with the admin name "Rewards Pro" cropped. Two things for Yu: (1) every id these frames carry is `proposed`, so by G1 they wait, unless Yu decides in writing that real captures of the app's own screens may replace false images before the ids are verified; (2) S1-A shows the setup step "Turn on the widget in your theme". That is a setup step [`rp-setup-steps`], not what the widget shows [`rp-widget`], but if Yu wants no widget mention before B3 is recorded, S1-A waits too. If the form allows fewer than 3 screenshots [U], #1 and #3 go at once anyway. **S2:** the full G0 set (STRATEGY A10). | — | S1, then S2 |
| Screenshot alt texts (not stated; #131 kept them under 80) | 69, 74, 77 (#3: "Tier membership products…") | "Orders list showing the cashback earned on each paid order" (58); "Loyalty tiers, each with a minimum spend and cashback rate" (58); "Tier membership products with duration, price and cashback" (58) [V, listing HTML lines 646, 649, 652] | #3 describes a removed feature. | Write each alt for its new frame. | **S1 frames:** the alts in `shot-list.md` §5 (S1-A 169; S1-B a template the checker fills from the frame; S1-C 63, Orders empty), which carry the frames' claim ids. The alt-text limit is not stated [U], so the form's counter decides. If it refuses them, the short forms: S1-A "RewardsPro Home with the setup steps: base rate, Cashback switch and widget" (75) [`rp-setup-steps`]; S1-B "RewardsPro Tiers page: each tier's name, minimum spend and cashback rate" (72) [`rp-vip-tiers`]; S1-C: its 63-character alt is already short. (The Settings short form, "RewardsPro Settings: the store-credit email switch and customer data requests" (77) [`rp-no-own-email`], now belongs to SH-7 at S2.) **G0 frames,** if they show these screens: "RewardsPro Orders list: each paid order with its tier, cashback and status" (74) [`rp-store-credit`, `rp-paid-trigger`]; "A customer in RewardsPro: tier, Shopify store credit and Lock to a tier" (71) [`rp-tier-lock`, `rp-store-credit`]; "The RewardsPro widget on a storefront: a customer's tier, credit and progress" (77) [`rp-widget`]; "The RewardsPro widget for a guest: the base rate and a sign-in prompt" (69) [`rp-widget`]. Home, Tiers and Settings reuse the S1 alts. The widget alts wait for `rp-widget`. | S1 (b): S1-A, S1-B, S1-C; S2: the G0 set |
| Feature video | "Yu watches IHgTl5oQZlg" | `IHgTl5oQZlg` on @CambridgeTCG: "INSTANT CASHBACK", $ coins, hearts (STRATEGY §1.2) | Shows the old app, and "instant" is on the never-say list. No feature image exists yet: A13 is "no" (STRATEGY §7), and `social/assets/png` has no 1600×900 file. | **S1:** remove the video **together with** a feature image in its slot. Best practices: "If you don't have a video, use a static image" (`bp.html.txt:329`). Whether the form lets feature media stay empty is [U]. A claim-light still (the kit's mark and wordmark only, no product words) would carry no claim and could be made from the kit now; that's a PROPOSAL for the visuals maker and Yu. | **S2:** A13 for the listing slot (1600×900, one focal point, ≥4.5:1, no Shopify logos, no price, not the app card subtitle). Its words "Cashback as store credit, with VIP tiers" carry [`rp-store-credit`, `rp-vip-tiers`]. Recording V1 goes on YouTube, LinkedIn and rewardspro.io, not the listing: it's instructional and about 85% screencast (`video-walkthrough.md`, point 4), against "promotional rather than instructional" and "limit screencasts to 25%". | S1, then S2 |
| Pricing (plan label "Free"; additional charges [U]) | Free | "Free" | True: there's no billing code (`/usr/bin/grep` for appSubscription, billing, recurringApplicationCharge and appUsageRecord in `app` = 0, 2026-11-07). **But a bare "Free" breaks the free rule** (STRATEGY never-say 2; `rp-free` scope: "Always paired with rp-merchant-funds"), the honest-by-design "total price, shown", and arguably 4.2.1 ("all pricing options such as, free trial time and charge details"). Shopify also shows its own "Free plan available" label in search results (`bp.html.txt:407`), where no text of ours can sit [I]. | keep "Free", **and the pair is required, not optional**: S1 (b) item 1, as soon as `rp-merchant-funds` and `sh-sc-fee` are verified (neither needs G0). | Additional-charges text (205): "You fund the cashback you give: it is store credit in your own shop. For stores created on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit." [`rp-merchant-funds`, `sh-sc-fee`]. **[U]:** whether a Free-to-install listing offers that field (Shopify describes it inside plan cards, and the live listing has none) and its counter. **Fallback 1:** the pricing-details link (best practices C, item 1 or 8) to a rewardspro.io page carrying the same text. **Fallback 2,** if the field exists but is short: "You fund the cashback you give. Shopify's store-credit fees may apply." (70) [`rp-merchant-funds`, `sh-sc-fee`]. | S1 (b) |
| Protected customer data / Data access | ask for name, email and phone; drop address | Sensitive data: name, email, phone, **physical address**. Device data: geolocation, IP, browser, OS. Store owner: name, email, phone, address. | The rebuild reads only first and last names (`app/shopify/graphql.ts:440-443`). It needs email only so Shopify's search can match it (`graphql.ts:449-456`). No phone, no address (`docs/switch.md:235` names the same trim). Its shop query reads `name`, `currencyCode` and `ianaTimezone` only, with no owner field (`graphql.ts:26-33`). | **S1:** request names, plus email for search. Drop phone and address. Re-read the listing afterwards: where the device-data and store-owner lines come from is [U]. | — | S1 |
| Privacy policy URL | rewardspro.io/privacy-policy | same; the page is dated 23 July 2026 (AWS Sweden, Bedrock, SendGrid) | Wrong for the rebuild. | Keep the URL. Replace the page (§4) before S2. This is the most urgent text gap. | — | before S2 |
| Terms of Service URL | not in #131 | [U] | Managed installation [I]: scopes are declared in the TOML (`shopify.app.toml:47-49`) with no `use_legacy_install_flow`. Shopify's best practices say a Terms URL shows the terms in the install modal. | Add `https://rewardspro.io/terms/` once the terms are live (§5). | — | before S2 |
| Sales channel requirement | "Merchant must have online store" (4.3.1) | [U] | The widget is a theme app embed, with an app proxy (`shopify.app.toml` `[app_proxy]`). | keep | — | — |
| Languages | English | English | The admin is English only, and the widget has only `extensions/rewards-widget/locales/en.default.json`. | keep | — | — |
| Developer address | the registered office | "London, GB" | Not a rebuild matter. | Yu checks the Partner settings value. | — | — |
| #131's `[Yu: …]` notes (1)–(3), "When to paste", and its claim-source table | — | — | **Obsolete.** PR #126, crons off and the widget's local balance were old-app issues. The rebuild places a new buyer in the lowest tier (`tiers.server.ts:11-12`), runs its own crons (`vercel.json`) and reads the live Shopify balance (`app/routes/api.proxy.$.tsx:9-11`). The table's locators are old-app paths. | Drop them. Cite the claim ids instead. | — | — |

**#131's other parts:**
- **The outreach note is out of scope here.** It stays paused under the PPA email question
  (STRATEGY §9). Its sentence-level delta is in `p1-drafts.md` §3.2.
- **The EU representative shortlist** is unaffected. Re-check its prices before signing.

---

## 3. #130: the landing (`landing/public/index.html`)

State A means rewardspro.io goes out before G0, claim-light. State B means from S2. If the
rewrite deploys before G0 to fix the privacy and terms pages, the landing uses state A, with no
product sentences. The install link goes in only once S1 has cleaned the listing. Its label is
"Install from the Shopify App Store", or the unaltered App Store badge (STRATEGY never-say 11), not
"Install on Shopify", which reads like a Shopify call to action.

**A fault #130 repeats:** "a free Shopify app", "A Shopify app that…" and "For the current Shopify
app". `rp-on-app-store` allows compatibility wording only, "never 'a Shopify app'" (`claims.toml`
`rp-on-app-store`; PPA Part C s.3, raw text line 718). Every replacement below says "an app for
Shopify stores" instead.

| Element | #130 draft (chars) | Against the rebuild | Proposed (chars) [claim ids] |
|---|---|---|---|
| `<title>` | "RewardsPro — Store-credit cashback and VIP tiers for Shopify" (60) | Claims before G0. "for Shopify" alone reads as branding: prefer "for Shopify stores". | A: "RewardsPro, an app for Shopify stores" (37) [`rp-on-app-store`]. B: "RewardsPro – Shopify store credit cashback and VIP tiers" (56) [`rp-store-credit`, `rp-vip-tiers`]. Both 60 or fewer, sentence case. |
| meta description | "RewardsPro is a free Shopify app that pays loyal customers cashback in Shopify store credit and rewards them with VIP tiers." (124) | **Fails the free rule** (no "you fund the cashback"). "A Shopify app" (`rp-on-app-store`). "Loyal" is imprecise: any customer with an account earns. | A: E160-A (134). B: E160-B (154, no price, recommended), or E160-B-site (147, with the free pair and the short fee pointer). Whether the meta carries a price is its own open point (`entity-card.md` §8), separate from D4's wording. |
| og:title / og:description | 48 / 110 (same faults) | The kit says og:title should be the page title. | og:title = `<title>`; og:description = the meta description. Don't paste the kit's `head-snippet.html` social block as it is (`entity-card.md` §4). |
| twitter:title / twitter:description | 47 / "Store-credit cashback and VIP tiers for Shopify stores. Free plan on the Shopify App Store." (91) | "Free plan" fails the free rule and implies there are plans. | Same as the og pair. `twitter:card` becomes `summary_large_image` only once og.jpg is rebuilt (STRATEGY A5). |
| JSON-LD | SoftwareApplication, description "A Shopify app that pays loyal customers cashback…" (105) | Claims before G0; no publisher; "A Shopify app" (`rp-on-app-store`). | `entity-card.md` §5: one `@graph` merged with the kit's `head-home.html` (state A, then B) |
| og:image, og:locale | missing | — | og:image only after the og.jpg rebuild. og:locale `en_GB`. |
| Look, favicon, theme-color | gold-on-ink, inline "RP" favicon | Look A (navy/teal) was approved 2026-10-20 (`approvals.jsonl` line 1); #95 serves the kit icons. | Apply look A and #95's icon links (brand lane, Yu) |
| Nav | Platform · Rewards · Integrations · FAQ | Two of the targets are deleted below. | How it works · Tiers · FAQ |
| Hero eyebrow | "Free plan on the Shopify App Store" (34) | "Free plan" fails the free rule. | A and B: "On the Shopify App Store" (24) [`rp-on-app-store`]. The price sits in the "Free app" stat tile and the FAQ, which carry the fee (`entity-card.md` §1 rule 3). |
| H1 | "Reward loyal customers with store credit." (41) | Positioning ("loyal"). | B: "Cashback your customers spend in your store" (43) [`rp-store-credit`, `sh-sc-signin-legacy`]. It says customers spend, so the hero note's legacy-accounts limit is **mandatory directly beside it** (rule 4). (brand.json's og.title today; `entity-card.md` §7 proposes a different card title, because a card has no hero note.) A: no product H1; use "RewardsPro". |
| Hero lede | "Pay cashback on orders as Shopify store credit, and give your best customers VIP tiers with higher rates." (105) | "Higher rates" is the merchant's choice: each tier has its own rate. | B: "When an order is paid, RewardsPro adds cashback to the customer's Shopify store credit, at the rate of their VIP tier." (118) [`rp-paid-trigger`, `rp-store-credit`, `rp-vip-tiers`] |
| Hero note | Store credit spendable "when signed in with Shopify customer accounts (not legacy accounts) or paying with Shop Pay. Shopify applies the full balance." | True (Shopify's rules). Say "new customer accounts". Date the source. | B: "Customers spend store credit at checkout when signed in with Shopify's new customer accounts or Shop Pay, not legacy customer accounts. Shopify applies the full balance. Source: Shopify Help Center, checked <date>." [`sh-sc-signin-legacy`, `sh-sc-full`] |
| "Platform map" aside (Shopify, WooCommerce "Planned", Headless API "Design phase", Stripe "Exploring") | — | None of these exists: `Platform` has `shopify` only (`prisma/schema.prisma:38-42`). | **Delete** |
| Stat tiles | "Live on Shopify / The production connector today"; "One reward ledger / Earned, used and adjusted credit"; "Free plan / Install from the Shopify App Store"; "No-code setup / For the current Shopify app" | The ledger kinds are cashback, reversal and adjustment (`schema.prisma` `LedgerEntryKind`); spending is Shopify's, not "used". "Free plan" fails the free rule. "Connector" is platform language. "For the current Shopify app" is "a Shopify app" (`rp-on-app-store`). | B: "Three setup steps / A base rate, the Cashback switch, the widget" [`rp-setup-steps`]; "Refunds / Take back their share from credit still held" [`rp-refund-takeback`]; "Free app / You fund the cashback; Shopify's store-credit fees may apply" [`rp-free`, `rp-merchant-funds`, `sh-sc-fee`]; "Made by / Cambridge TCG Limited, London" [`rp-maker`] |
| "The platform layer" (Connect, Normalize, Reward, Deliver) | "Points, missions and other mechanics are built but not open to shoppers yet" | **False:** they aren't built (p1-truth §5: 0 hits). | **Delete** |
| Card 01, Store-credit cashback | "…ledger of what was earned, reversed, or adjusted. Points aren't offered yet: shoppers would have nowhere to spend them." | The points line is false framing (there are no points). | B: "When an order is paid, RewardsPro adds cashback to the customer's Shopify store credit. Cashback is paid on the product price after discounts. Shipping, and anything paid with store credit or gift cards, earns nothing." [`rp-paid-trigger`, `rp-store-credit`, `rp-cashback-base`] |
| Card 02, "Membership tiers" | "Set tier thresholds, benefits and cashback rates" | There's no benefits field: a tier is a name, a minimum spend and a cashback % (`schema.prisma` `Tier`). The name "Membership" is stale. | B, "VIP tiers": "Set tiers by spend, each with its own cashback rate, counted over the last 12 months or all time. Customers move between tiers as their spend changes. You can lock a customer to a tier." [`rp-vip-tiers`, `rp-tier-window`, `rp-tier-lock`] |
| Cards 03–05: Missions, Raffles, Mystery boxes | "Not in storefronts yet", "Paused" | **None exists.** The chance words are blocked by G4. | **Delete.** Don't name removed features (STRATEGY D9). |
| Card 06, Analytics | "See tier changes, cashback issued and recorded customer activity." | Home shows Cashback given, Store credit spent at checkout ("from any source") and Came back (`app/routes/app._index.tsx:447-452`). There's no analytics suite. | B: refunds card "A refund takes back its share of the cashback, from store credit the customer still holds." [`rp-refund-takeback`]; email card "RewardsPro sends no email. One setting, off by default, asks Shopify to send its own store-credit email." [`rp-no-own-email`]; widget card after `rp-widget`. A Home card has no id, so leave it out unless the claims maker adds one. |
| "Commerce connections": the Shopify card, plus WooCommerce, Headless API and Stripe | "order and customer sync", "loyalty widget" | There's no customer sync: the customer webhooks are acknowledged and ignored until B3 step 5 (`app/routes/webhooks.customers.create.tsx`; `shopify.app.toml` subscribes to none). The other three don't exist. | **Delete the section.** Its one true part goes in the cards above. |
| Get started, and the paid-agreement line | "…You can see it under Subscription records in the app… uninstalling erases your RewardsPro data." | The rebuild has **no** Subscription records page (the menu is Home, Customers, Tiers, Orders, Settings: `app/routes/app.tsx:11-17`). Erasure isn't immediate (§4, retention). | Until B4 cancels the two frozen charges (`docs/switch.md:235`): "Already on a paid agreement from before? It keeps the terms Shopify recorded when you approved it. To cancel it, email contact@rewardspro.io, or uninstall RewardsPro: Shopify says uninstalling a paid app cancels its future recurring charges." (241) [`rp-contact-delivers`; the agreement facts have no id, `rp-free`'s contrary evidence]. Source for the uninstall clause: "Uninstalling a paid app cancels future recurring charges, but you might still be billed for the current billing cycle." [V, help.shopify.com/en/manual/apps/uninstalling-apps, fetched 2026-11-07 12:36 UTC, sha256 `4e68dcaa…e1b1`]. Drop the line after B4. |
| FAQ "Which integrations are available?" | WooCommerce and API proposals | False framing. | **Delete** |
| FAQ "Are raffles, mystery boxes and missions live?" | "No…" | Names removed features (D9). | **Delete** |
| FAQ "Does RewardsPro cost anything?" | "RewardsPro is free. For stores created on or after 12 May 2025, Shopify charges…" | It has the fee sentence but not "you fund the cashback". | B (271): "RewardsPro is free. There are no paid plans. The cashback is store credit in your own shop, so you fund the cashback you give. For Shopify stores created on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit." [`rp-free`, `rp-merchant-funds`, `sh-sc-fee`] |
| FAQ "Can balances move between stores or platforms?" | "No… Existing redemption follows each store's programme rules." | "Redemption" and "programme rules" are old-app framing. | Replace with "Where can customers spend it?", using STRATEGY C2's wording [`sh-sc-signin-legacy`, `sh-sc-channels`, `sh-sc-full`], without POS (whether POS orders earn hasn't been observed) |
| Footer | "© 2026 Cambridge TCG Limited. Love is the design." | **R1 breach** (also live today). #130's landing prints no company number; its privacy and terms pages do. | "© 2026 Cambridge TCG Limited, registered in England and Wales, company 15680297." (80). Company number 15680297, status Active, and the London registered office: [V, Companies House, fetched 2026-11-07 12:36 UTC, sha256 `b2526c43…406f`]. "Registered in England and Wales" is [I]: the record's overview doesn't state the jurisdiction, and the number has no SC or NI prefix. Confirm it from the certificate, or drop the words. |
| Footer links | Install, Contact, Privacy, Terms, Subprocessors, "Integration status" | Integration status goes with the section. | "Install from the Shopify App Store" (after S1), Contact, Privacy, Terms, Subprocessors, plus `/changes` if made (STRATEGY §3) |

---

## 4. #130: the privacy policy (`privacy-policy/index.html`)

| Section | #130 draft says | Against the rebuild | Change |
|---|---|---|---|
| Head | Title "Privacy Policy — RewardsPro"; meta (91) "How RewardsPro and Cambridge TCG Limited handle merchant, staff, shopper, and website data." | Fine. | keep, or the shorter (84) "How Cambridge TCG Limited handles merchant, shopper and website data for RewardsPro." |
| Intro and "Last updated 3 November 2026" | covers "merchant-enabled integrations" | There are no integrations: `Platform` has `shopify` only, and the Klaviyo grep finds 0. | Drop "merchant-enabled integrations". Put in the new date. |
| Core promise | "We do not sell personal data … or use Shopify merchant or customer data to train AI models." | True of the app's code: `/usr/bin/grep -rniE 'openai\|anthropic\|gemini\|bedrock\|@ai-sdk\|langchain\|cohere\|mistral\|ollama\|huggingface\|replicate'` over `app`, `extensions`, `package.json` and `shopify.app.toml` finds 0 (re-run 2026-11-07). | keep |
| §1 Roles | processor for "loyalty rules, communications, or integrations" | No communications or integrations. | "…to run that merchant's cashback and tier rules" |
| §1 EU representative | `[Yu: …]` | — | Yu's decision (#131 shortlist) |
| §2 Merchants and staff | "…programme settings, tiers, campaigns, plan, usage, billing status, support messages, and integration configuration" | Stored: store name, currency and time zone; settings (on or off, tier window, the email switch, review-prompt and setup dates) (`prisma/schema.prisma:138-166`); the myshopify domain and install dates (`:168-219`); the Shopify session with its tokens encrypted (AES-256-GCM, `app/shopify/session-storage.server.ts:1-9`). The session table has staff name and email columns (`schema.prisma:430-449`); offline-only sessions leave them empty [I: `app/shopify.server.ts:42-43`]. | Rewrite to that list. Drop campaigns, plan, usage, billing and integration. |
| §2 Merchant shoppers | "email, name, phone, birthday, tags, … points, … subscriptions, … gift-recipient details …, segments …, email delivery, open, click … events" | **False.** Stored: the Shopify customer ID; tier, tier start and any lock (`schema.prisma:221-253`); per order, Shopify's order name (such as #1001), currency, amounts, dates, test and cancelled flags (`:276-320`); refunds (`:322-344`); the cashback ledger with tier name and rate (`:345-387`); payouts (`:389-428`); data-request records (`:451-474`). **No names, emails, phones or addresses** (`app/shopify/names.server.ts:4-12`; `app/lib/erasure.server.ts:271`). | Rewrite to that list. Add: names are read from Shopify when a page shows them, and the Customers CSV the merchant downloads holds names, but RewardsPro doesn't store them (`app/routes/app.customers.export.tsx:8-22`). |
| §2 Technical records | "…performance traces" | Sentry has `tracesSampleRate: 0` (`app/entry.server.tsx:29`). | Drop "performance traces". Keep the error events, the cron run records (`schema.prisma` `CronRun`) and Vercel's request logs (below). |
| §2 Protected-data paragraph | "does not intentionally store complete payment-card numbers or full shipping and billing addresses … Shopify … handles the merchant's app-billing card details" | Too weak, and billing is gone. | "RewardsPro's database holds no customer names, email addresses, phone numbers or addresses." [no id; locators above] Drop the billing sentence. |
| §3 Purposes | billing records; "calculate points, cashback and tiers; issue or reconcile rewards"; "Send the shopper emails … campaigns, automations, analytics, and connected services"; "Measure product use and performance" | No billing, no points, no emails sent, no analytics. | Keep install, support, website, security and legal records. Replace the rest with:<br>1. Record paid orders, refunds and cancellations.<br>2. At install, read up to the last 12 months of orders (60 days without Shopify's `read_all_orders` approval) to place customers in tiers. Imported orders never earn cashback (`app/shopify/bulk-import.server.ts:1-7, 36-39`).<br>3. Add and take back store credit in Shopify.<br>4. Show the widget.<br>5. Ask Shopify to send its own store-credit email, if the merchant turns that on. |
| §4 Providers | Shopify (incl. "app billing"), Supabase London, Vercel + Web Analytics and Speed Insights, Cloudflare, **Twilio SendGrid**, Sentry "Error, performance … EU region", **Klaviyo and other connected platforms**, **GitBook**, Google Workspace | No `@vercel/analytics` or speed-insights package (`package.json:18-38`). No mail library, and no SendGrid, Klaviyo or GitBook code. Sentry's region is **[U]**: the DSN is an env value, though the old app used `ingest.de` [I]. | Keep Shopify (minus billing), Supabase (London, eu-west-2: `docs/switch.md:14`), Vercel (functions in lhr1: `vercel.json:3`), Cloudflare (website) and Google Workspace (contact@). **Delete** SendGrid, Klaviyo and the analytics products. GitBook stays only as a website-scope provider if docs.rewardspro.io stays on GitBook (the app links no docs: `app/routes/app.settings._index.tsx:11-13`). Sentry becomes "error monitoring", with its region once Yu reads the DSN host. |
| §5 Telemetry | "Vercel Analytics and Speed Insights"; Sentry "error and performance events"; "Application logs record … the names (not the values) of headers and query parameters" | The log sentence describes old-app PR #128. The rebuild logs no query string from the proxy (`api.proxy.$.tsx:12`), and Sentry gets no query strings, cookies, bodies or user data, with tokens and email addresses scrubbed (`entry.server.tsx:14-32`; `app/lib/telemetry.server.ts:1-14`). **But Vercel's own request logs keep, for 1 day:**<br>- the widget's signed customer ID;<br>- the shop and signature;<br>- the admin's 1-minute `id_token`;<br>- the Customers search text.<br>Yu accepted that (`docs/switch.md:42, 57`). | Drop Analytics and Speed Insights. Sentry becomes errors only, with no session recording (no client SDK: there is no `app/entry.client.tsx`). State Vercel's 1-day request logs plainly. |
| §6 Marketing and AI | suppression records; welcome, tier-up, tier-down and membership emails via SendGrid; open and click tracking; Klaviyo; "AI drafting is not offered at the moment" | **All false** except the no-training promise. | "RewardsPro sends no email. One setting, off by default, asks Shopify to send its own store-credit email when a customer earns credit." [`rp-no-own-email`] (`app/routes/app.settings._index.tsx:48-51`; `schema.prisma:148`). "The RewardsPro app sends no shop or customer data to an AI service, and we don't use that data to train AI models." (114) [no id yet: a new row for the claims maker, e.g. `rp-no-ai-data`, whose evidence is the grep in the Core promise row]. It's scoped to the app on purpose: RewardsPro's own posts are drafted with AI help [`rp-ai-drafted`], so an unscoped "uses no AI" would read as false next to them. No "we update this policy first" promise; changes go on `/changes` if that page is made (STRATEGY §3). Keep the no-training sentence. |
| §7 Uninstall | "we erase all of that shop's RewardsPro records at once, in one step … About 48 hours later … we run the same erasure again" | **Wrong timing.** Uninstall marks the store uninstalled and deletes only its sessions (`app/routes/webhooks.app.uninstalled.tsx:1-6, 36`). Shop/redact, about 48 h later, erases every row in one transaction (`erasure.server.ts:5-10`). If that never succeeds, the nightly housekeeping job (03:00 UTC, `vercel.json` crons) erases stores uninstalled **more than** 30 days ago (`api.cron.housekeeping.tsx:15-20, 56, 113`). It works within a 240-second budget and leaves the rest for the next night (`:120`, `if (Date.now() >= deadline) break`), and a total stop of every cron is silent, accepted for now (`docs/switch.md:55`). So "30 days" is a floor for the fallback, not a ceiling. A reinstall before then carries on. Credit already issued stays in Shopify (`docs/switch.md:84`). Backups (row below) and the old schema `rewardspro` (row below) outlive both. | Rewrite to that sequence, with no "at once" and no "at most": records are erased when Shopify's deletion request arrives, about 48 hours after uninstall; if that request fails, a nightly job erases them once 30 days have passed; backups are kept for [the retention Yu reads from Supabase]. Held for gate J (`docs/switch.md:232`) and STRATEGY §6.4 "Erasure timing". [no id] |
| §7 Sessions | "Expired online … sessions … deleted after a 24-hour buffer. Offline … retained until … the shop uninstalls." | **Still true** (`api.cron.housekeeping.tsx:5-8`). | keep |
| §7 Billing-webhook records 7 days; email suppression | — | Neither exists. | **Delete** |
| §7 Backups | "within 8 days" (observed 2026-11-03: PITR off, 8 daily backups) | Same Supabase project (`docs/switch.md:14`), so it probably still holds [I]. PITR is due before the first real merchant (`docs/switch.md:45`) and would change it. | Yu re-reads the Supabase dashboard; write what it shows at publish time [U] |
| §7 Data request | "build a report…, store it encrypted… 45 days… within 52 days" | **Not stored:** the report is built live at each download (`erasure.server.ts:15-18`). It's due in 30 days and downloadable for 45 (`:32-35`). It shows only in the app: the Home banner and Settings → Customer data requests (`app/admin/home-rules.ts:204`). There's no email to the merchant (`docs/switch.md:62`). | Rewrite to that. Drop "52 days" and "stored encrypted". |
| §7 Shopper erasure | "We erase every RewardsPro record about that shopper in one step." | **Wrong.** customers/redact deletes that customer's data-request rows (`erasure.server.ts:185`), closes what was still to be paid or taken back, and then sets only `externalCustomerId` and `lockedTierId` to null on the customer row (`:215`). The internal customer row stays, and so do its orders, each with Shopify's order ID and order name such as #1001, amounts and dates (`prisma/schema.prisma:280-283`), and its ledger and payouts (`:351`, `:394`). That is pseudonymised, not unlinked: whether the person can be found again from Shopify's order numbers depends on Shopify redacting its own orders, not on RewardsPro [I]. | "We remove the customer's Shopify customer ID from our records and close any credit still to be added or taken back. Their orders and cashback amounts stay, under an internal ID, with Shopify's order numbers." (207) [no id; `erasure.server.ts:178-217`]. Held for gates I and J (`docs/switch.md:229, 232`). |
| §7 Retries | "Shopify retries the request for up to four hours" | The app answers 500 and Shopify delivers again (`erasure.server.ts:20-21`). Shopify's webhook docs: "Shopify retries failed webhook calls up to eight times in a four-hour period, but if failures persist, the subscription is removed." [V, shopify.dev/docs/apps/build/webhooks/troubleshooting-webhooks, redirected to `…/troubleshoot`, fetched 2026-11-07 12:36 UTC, sha256 `cc5588ad…b965`]. That page is about webhooks in general; it doesn't single out the privacy webhooks [I]. | "Shopify retries the request up to eight times over about four hours." |
| §7 Transitional (missing) | — | The old app's schema `rewardspro` still holds its data until B5 dumps and drops it, within 30 days of the 2026-11-06 switch (`docs/switch.md:84, 201, 248`). Whether it holds real shoppers' data from the 7 closed stores is [U]. | Either run B5's drop before publishing, or add one dated line. |
| §8 Rights, §9 Complaints | — | Not app facts. | keep; the EU sentence is `[Yu]` |
| §10 Transfers and security | "Sentry's EU region in Germany"; SendGrid and GitBook in the list; the security list | The Sentry region is [U]. The rebuild's security facts: TLS to the database verified against the bundled Supabase root CA (`app/db/database-tls.server.ts:1-13`); its own schema and role (`docs/switch.md:14`); Shopify signature checks on every webhook and on the proxy (`api.proxy.$.tsx:5-7`); tokens encrypted. | Drop SendGrid and GitBook (unless website-scope). Leave the Sentry region blank until known. Name only the measures above. |
| §11 Contact | company number, registered office, ICO ZB838338 | Not app facts. Company number 15680297 and the registered office "60 Tottenham Court Road Suite 4583a, Fitzrovia, London, United Kingdom, W1T 2EW" [V, Companies House, fetched 2026-11-07 12:36 UTC]. The ICO number was not re-checked [U]. | keep; Yu checks the ICO register |
| Maker's other business (missing) | — | The design's honest-by-design list asks for "who makes it, and what else they sell, disclosed"; STRATEGY H4 holds card-shop framing back. | **Yu's decision D-maker** (`entity-card.md` §2 and §8). If Yu chooses disclosure: one line, "Cambridge TCG Limited also sells trading cards." (47) [proposed new id `rp-maker-also-sells`], and a sentence on whether RewardsPro's data is used for that business only if evidence exists for it. |

---

## 5. #130: the merchant terms (`terms/index.html`)

| Section | #130 draft says | Against the rebuild | Change |
|---|---|---|---|
| Head and summary | "Price: Free. No paid plan is offered right now." | True (no billing code), but **"Free" with no "you fund the cashback" and no fee sentence breaks the free rule** (STRATEGY never-say 2; `rp-free` scope). A web page has room, so the fee sentence goes in too. | **Required:** "Free. No paid plan is offered right now. You fund the cashback you give, and for stores created on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit." (213) [`rp-free`, `rp-merchant-funds`, `sh-sc-fee`] |
| §1 Notices | "we send it to the email address Shopify uses to contact your store's owner" | **There's no send path.** RewardsPro sends no email (`app/routes/app.settings._index.tsx:51`), and its shop queries read no email (`app/shopify/graphql.ts:27-31`). | **Yu's call:**<br>(a) notices on rewardspro.io/changes plus an in-app notice (a code change, §8);<br>(b) Yu emails owners by hand from contact@ (where the owner addresses would come from is [U]);<br>(c) both. Fix §8 and §10.6 to match. |
| §2 The service | "pays cashback as Shopify store credit, runs VIP tiers, and shows a loyalty widget in your theme" + the paused list (points, gift cards, mission rewards, recurring memberships, AI drafting, raffles, mystery boxes, missions) | The paused list names features that **don't exist**. The product sentence is a product claim like the landing's, so it's gated the same way. | **State A (before G0):** "RewardsPro is the app for Shopify stores listed at apps.shopify.com/rewards-pro." (80) [`rp-on-app-store`]. **State B:** "RewardsPro adds cashback to your customers' Shopify store credit when an order is paid and runs VIP tiers by spend." (115) [`rp-paid-trigger`, `rp-store-credit`, `rp-vip-tiers`]; once `rp-widget` is verified, change "and runs VIP tiers by spend" to "runs VIP tiers by spend, and has a widget you turn on in your theme editor" (the sentence is then 163) [`rp-widget`]. **Delete the paused list.** Keep "as it is … no service-level commitment". The notice period is `[Yu]`. |
| §3 Price and billing | "RewardsPro is free. No paid plan is offered right now, and nothing is charged under these terms." "…You can see it under Subscription records in the app… uninstalling erases your RewardsPro data" | "Free" with no pair (as the summary). There's no Subscription records page, and the timing is wrong. | **Required:** "RewardsPro is free. No paid plan is offered right now, and nothing is charged under these terms. You fund the cashback you give: it is store credit in your own shop. For stores created on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit." (302) [`rp-free`, `rp-merchant-funds`, `sh-sc-fee`]. Drop the Subscription records sentence and fix the uninstall wording (§6 below). The paid-agreement paragraph takes the paid-agreement line from this file's §3 ("Get started" row) [`rp-contact-delivers`]; after B4 cancels the two frozen charges, drop it. |
| §4 Responsibilities | the merchant's rules, store credit, tax, privacy notice, laws, staff | True and useful. | keep, and **add (required):** "the fees Shopify charges on payments made with store credit" (59) [`sh-sc-fee`]. |
| §5 Acceptable use | — | Harmless. | keep |
| §6 Uninstalling | "Uninstalling erases your RewardsPro data at once … export your members (email, Shopify customer ID, tier and RewardsPro's record of store credit) … from the Members page" | **Three errors:**<br>- **Timing:** not "at once": about 48 h later through shop/redact, or by the nightly fallback after more than 30 days, with no upper bound the code guarantees (§4, privacy §7 Uninstall).<br>- **Page:** there's no Members page.<br>- **Columns:** the export is the Customers page's CSV: Buyer (first and last name, read from Shopify), Tier, Spend counted and Cashback given, with **no email and no Shopify ID** (`app/routes/app.customers.export.tsx:8-22, 70-71`). | Rewrite (429): "Uninstalling stops RewardsPro at once. Its records are erased when Shopify's deletion request arrives, about 48 hours after you uninstall. If that request fails, a nightly job erases them once 30 days have passed. Backups are kept for [Yu: the retention Supabase shows]. Before you uninstall, Customers → Export CSV gives each buyer's name, tier, spend counted and cashback given. Credit already issued stays with your customers." [no id]. Until B5 drops schema `rewardspro`, add the dated line from privacy §7 Transitional. Held for gate J. |
| §7 Liability | `[Yu: cap amount]`; "These limits reflect that RewardsPro is a free service for businesses." | The second sentence says "free" with no pair. | Cap: Yu. Sentence: "These limits reflect that RewardsPro is free; you fund the cashback you give, and Shopify's own fees apply as section 3 says." (125) [`rp-free`, `rp-merchant-funds`, `sh-sc-fee`], or drop it (Yu's call). |
| §8 Changes | "tell you by email at least [Yu]…" | Same notice problem as §1. | Match §1 |
| §9 Law | — | — | keep |
| §10.2 What we process | "Syncing customers, … sending your shoppers the emails…, the campaigns and automations you send; sending data to services you connect" | No customer sync, no emails, no campaigns, no integrations. | "Recording your paid orders, refunds and cancellations; importing past orders at install to place customers in tiers; working out cashback and tiers; adding and taking back store credit in Shopify; answering the widget; handling Shopify's privacy requests." The personal data row points to the corrected privacy §2. |
| §10.3 Deletion | "Uninstalling erases it at once … backups … within 8 days. To keep a copy, export your members" | Timing, export and backups as above. | Same fixes as privacy §7 and terms §6: no "at once", no "at most", the backup retention Yu reads from Supabase, and the old schema's dated line until B5. |
| §10.4 Security | "Shopify data-request reports are stored encrypted"; "Errors and performance are monitored" | Reports aren't stored. There's no performance monitoring. | Delete the reports line. Say "Errors are monitored, and credentials and email addresses are removed from error reports". Add: Shopify access and refresh tokens encrypted (AES-256-GCM); TLS to the database verified against Supabase's root CA; its own schema and role. Locators as in privacy §10. |
| §10.5 Transfers | "We keep your shoppers' data in a database in London, UK" | True of the database (`docs/switch.md:14`), but not of all shopper data: Vercel's request logs hold the widget's signed customer ID and the Customers search text for 1 day (`docs/switch.md:42`), and the Sentry region is [U]. STRATEGY §6.4 holds "data in London" for that reason. | **Held** until the Sentry region is known. Narrowed (176): "The RewardsPro database is in London, UK. Vercel's request logs, kept for 1 day, hold the widget's signed customer ID and the Customers search text. Error reports go to Sentry." [no id]. Add where Vercel keeps logs [U: not re-checked; #130 said "may be stored in the United States"] and Sentry's region once Yu reads the DSN host. `[Yu: DPAs]` stays. |
| §10.6 Subprocessors | notice "by email" | Notice problem. | Match §1 |
| §10.7 | EU representative sentence | — | `[Yu]` |

---

## 6. #130: the subprocessors page (`subprocessors/index.html`)

| Row | #130 draft says | Against the rebuild | Change |
|---|---|---|---|
| Supabase | the database, London; staff may access it from other countries | True: project `rewardspro-prod`, eu-west-2, schema `rewards` (`docs/switch.md:14`). | keep |
| Vercel | runs the app, keeps application logs; "Its logs and analytics may be stored in the United States…" | No analytics product. The request logs hold the signed customer ID and the search text for 1 day (`docs/switch.md:42`). | Drop "and analytics". Add that the request logs are kept for 1 day and what they hold. |
| Sentry | "Error and performance monitoring … Sentry's EU region (Germany)" | Errors only (`app/entry.server.tsx:29`). The region is [U]. | "Error monitoring". Region once Yu reads the DSN host. |
| **Twilio SendGrid** | delivers welcome, tier and membership emails and campaigns | **Not called by the rebuild** (no mail library). | **Delete the row** |
| Other providers | Cloudflare (website), GitBook (docs assistant), Google Workspace (contact@) | The app links no docs (`app/routes/app.settings._index.tsx:11-13`). | Keep Cloudflare and Google Workspace. Keep GitBook only if the docs site stays, and describe it as the docs website. |
| Not our subprocessors | Shopify, and "Services you connect yourself, such as Klaviyo" | There are no integrations. | Keep the Shopify sentence. Delete the Klaviyo sentence. |
| Changes to this list | "tell merchants by email" | Notice problem (§5). | Match the terms' §1 choice |

---

## 7. #130: the other files

| File | Change |
|---|---|
| `404.html` | "This path hasn't joined the platform", "connection", "integration map" is platform language for deleted sections. Use "Page not found" (14) / "This page doesn't exist on rewardspro.io." (41) / "Return to RewardsPro". |
| `sitemap.xml` | Keep `/terms/` and `/subprocessors/`. Add `/changes/` if that page is made. |
| `.well-known/security.txt` | keep (contact@, Expires 2027-11-02) |
| `DEPLOY.md` | Its publish preconditions (#127, #128, crons on, #126's first-run card) are old-app PRs. Replace them with §8 below. Drop the `shop { email }` and `GA4_MEASUREMENT_ID` notes: the rebuild has neither path (the gtag grep finds 0). Keep the `! grep -rn '\[Yu:' public` guard. |
| `test/unit/contracts/public-texts.contract.test.ts` (old app) | It pins the old wording: "52 days", the SendGrid emails, the members export. Rewrite it with the texts, and move it with the landing before B5 deletes `apps/rewardspro`. |
| Branch | It's behind main, and main changed `privacy-policy/index.html` on 2026-11-04 (75f1ff6a, an old-app retention line that the rewrite replaces anyway). Rebase before editing. |
| Location | `apps/rewardspro/landing` is deleted at B5 (plan task B5). Yu picks a new home first (STRATEGY D11). |

---

## 8. Preconditions that remain

**Code-side** (agent PRs to `apps/rewards`; a merge to main deploys production, so Yu merges):
1. **No terms or privacy link in the app.** Settings has only Customer data requests and contact@
   (`app/routes/app.settings._index.tsx:61-69`). A grep for `privacy-policy` or `/terms` in `app`
   and `extensions` finds nothing; the only rewardspro.io link is the root redirect
   (`app/routes/_index.tsx:12`). Add a "Terms and privacy" link to Settings, and set the listing's
   Terms of Service URL. Shopify says the Terms URL doesn't remove your responsibility for
   acceptance. Whether to record acceptance at first run is Yu's call (#131).
2. **The admin name.** `shopify.app.toml:10` says `name = "Rewards Pro"` (line 1's comment too).
   Change it to "RewardsPro". It reaches Shopify only through `shopify app deploy` (Yu's yes).
   Until then, crop it from screenshots.
3. **A notice channel** for terms and subprocessor changes. There's no merchant email path (§5).
   Either an in-app notice or different wording in the terms.
4. **A guard test for "sends no email"** (`rp-no-own-email`). It fails if a mail library appears or
   `notifyBuyers` stops defaulting to false (STRATEGY §6.3).
5. **The B3 release, with the 2026-10 webhook subscriptions, must land before 2027-01-16**
   (`docs/switch.md:215`: "The trimmed 2026-10 webhooks must land before 2027-01-16"). The old
   app's toml is on `api_version = "2026-01"` (`apps/rewardspro/shopify.app.toml:20`), the
   rebuild's on `"2026-10"` (`apps/rewards/shopify.app.toml:19`). B3 is probably out but
   unrecorded (§9). Step 5, the PR removing the ignored-topic routes, follows the release. Neither
   blocks the texts: those routes read and write nothing
   (`app/routes/webhooks.orders.fulfilled.tsx:1-6`). STRATEGY §1.1 dates step 5 itself; that's
   the same misreading, for its owner to correct.
6. **Move the landing and its contract test** out of `apps/rewardspro` before B5.

**Owner and dashboard steps** (Yu's hand):
7. **G0 and B3 recorded** (`docs/gates.md` or the switch.md results). These gate every product
   sentence in state B, and `rp-widget` also needs gate C.
8. **The `read_all_orders` grant** (`import_horizon_days`, `docs/switch.md:171`). It decides any
   "12 months of past orders" wording, which stays out until then.
9. **The Sentry DSN host,** for the region in privacy §4 and §10 and the subprocessors page.
10. **Supabase backup retention and the PITR decision** (`docs/switch.md:45`), for privacy §7 and
    terms §10.3.
11. **The protected-data request trimmed** in the Partner Dashboard (S1).
12. **The Terms of Service URL** set in the listing, once the terms are live.
13. **Providers' DPAs accepted** (Supabase, Vercel, Sentry; #130's placeholder).
14. **The EU representative decision.**
15. **The two frozen paid charges cancelled** (`docs/switch.md:235`). Then drop the paid-agreement
    lines.
16. **B5's dump and drop of schema `rewardspro`** within 30 days of the switch
    (`docs/switch.md:248`). Or the privacy policy carries a dated line about it.
17. **A contact@rewardspro.io delivery test from outside, and one DMARC record.** Every page
    names that address, and `rp-contact-delivers` waits for the test.
18. **The Pricing details pair** (S1 (b) item 1): see what the listing form offers for a
    Free-to-install app, and paste the additional-charges text, or set the pricing-details link.
19. **D-maker** (`entity-card.md` §8): disclose what else Cambridge TCG Limited sells, or not.

---

## 9. Doubts not resolved here

- **Whether B3 is released [I, not recorded].** The listing's data access shows the six trimmed
  scopes. Until it's recorded, the widget a buyer sees may be the old one.
- **What the listing form enforces [U]:** a minimum number of features (Feature 3 deletion), of
  screenshots (S1), whether feature media may be empty (the video), whether a Free-to-install
  listing has an additional-charges field, and whether the SEO title field is set or falls back to
  name + subtitle.
- **The source of the listing's device-data and store-owner lines [U].**
- **Whether managed installation applies [I].** I read it from the TOML (no legacy flag), not
  from the Partner Dashboard.
- **Supabase backup retention for the project today [U].**
- **Whether schema `rewardspro` holds real shoppers' data** from the 7 closed stores [U].
- **"Registered in England and Wales" [I]** and the **ICO number [U]**. The company number and
  registered office are now [V] (Companies House, 2026-11-07).
- **Resolved in the fix pass:** Shopify's retry figure is "up to eight times in a four-hour
  period" [V, shopify.dev webhooks troubleshooting page, 2026-11-07], for webhooks in general.
