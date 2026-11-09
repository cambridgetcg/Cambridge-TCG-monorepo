# RewardsPro listing text: the S1 sitting sheet

**For Yu's hand: about 45–50 minutes, or about 70–80 with the optional "before" check. An agents' proposal, written
2026-11-09 for package RP-02 (issue #162) and revised the same evening after review. Nothing here has been pasted,
submitted or decided.** It turns ROADMAP §4 action 4 and [`../social/listing-delta.md`](../social/listing-delta.md)
§0–§2 into steps you can follow field by field in the Partner Dashboard: what to delete, what to untick, what to
paste and what to keep. Every paste text carries its character count. RP-21 writes the screenshots sheet
(`S1-screenshots.md`) beside this one. In the sitting you need §0–§5 only; §6–§8 are reference.

**Why it comes first.** Shopify's Sidekick builds its app cards from the listing, and search snippets and the
directory sites copy it (ROADMAP §2; `…/wf10/status.md` §1.A), so it is the first thing assistants repeat about
RewardsPro. Today it still says things the rebuilt app doesn't do. S1 removes what is known to be false. What stays
is unverified, not shown true, until G0 (listing-delta §0); the state B texts replace it at S2.

**What S1 needs.** Nothing to prepare for the deletions: removing a false sentence needs no claim. Every new
sentence below names its claim row in [`../claims.toml`](../claims.toml). Rows marked `*` aren't in the ledger
yet (RP-06 adds them). **HELD** items are marked where they appear and gathered in §5: of the three limit lines,
the first is already live and the other two wait until their rows verify; the Pricing text waits until
`rp-merchant-funds` and `sh-sc-fee` verify and you answer Pre-5; and a Feature 3 line is only needed if the form
insists on three features.

Labels: **[V]** checked in this session (a file, a commit, the saved capture of 7 Nov, or a shopify.dev page read
on 9 Nov); **[I]** inferred; **[U]** unknown. "The capture" is the listing as saved on 2026-11-07 11:46 UTC
(sha256 `126aa3b4…7877`, the hash `claims.toml` records); no agent opened the listing or the Partner Dashboard for
this sheet. "#187" is RP-05's first-session check of the code-backed rows (`claims-checks/code-rows.md` at
2c0e2c17, draft PR #187): it narrows several rows this sheet leans on, and a second session's concur on its revised
sentences is still pending. Counts are Python `len()`: characters as typed, spaces included, the en dash as one (§8).

---

## At a glance

**Order.** The steps follow the map of the listing form in Shopify's best practices, §5 "App listing": A. Branding
your app, B. App Store listing content, C. Pricing, D. Translate your app listing, E. App discovery, F. Merchant
install eligibility, G. App review preparation [V]. G is the reviewer's test instructions and screencast; nothing in
it changes today [I]. Shopify's map puts the title tag and meta description advice under E [V]; where those fields
sit in the form is [U]. No agent has seen the form itself, so its own order may differ [U]. If it does, work through
the numbers below in any order, except that step 19 comes before step 20.

| # | Field | Do | Minutes |
|---|---|---|---|
| 0 | The "before" AI check | **Optional, first**, and on its own: Q1 and Q2, logged out (§0) | 25–30 |
| 1 | App name; App icon | Keep "RewardsPro" (10 of 30) and the icon | 1 |
| 2 | Feature media | **Remove** the old video | 3 |
| 3 | Demo store URL | Leave as it is (the capture shows none) | — |
| 4 | Screenshots | If the form allows fewer than three: **remove** #1 and #3 (and #2 if you choose). If not: leave them, or re-upload #1 blurred | 2 |
| 5 | App introduction | Keep (89 of 100) | — |
| 6 | App details | **Delete** the tier-product clause (about 497 → 459). Recommended: **delete** the widget sentence too (→ 358) | 4 |
| 7 | Features | **Delete** Feature 3; if the form insists on three, see step 7 (a recommended exception). Recommended: **trim** Feature 2 (78 → 51) | 3 |
| 8 | Integrations | Keep empty | — |
| 9 | Pricing | Keep "Free". **Look** for an additional-charges field and note what you see. The pair text is **HELD** | 2 |
| 10 | Translations | **Check** for custom translated listings; recommended: delete any | 1 |
| 11 | Category details | **Untick** Memberships and Membership perks | 2 |
| 12 | Resources | Keep the privacy policy URL; no Terms URL yet | — |
| 13 | App card subtitle | Keep (56) | — |
| 14 | Search terms | **Paste** five terms, with your word on Pre-5 | 3 |
| 15 | SEO title tag | **Check**: delete "& Memberships" if #131's title is there; clear anything else | 1 |
| 16 | SEO meta description | **Paste** the deletion-only text (141 → 88) | 2 |
| 17 | Install eligibility | **Look**: "Merchant must have online store" selected; geography unchanged | 1 |
| 18 | Contact information; Partner settings | **Check** the submission email is one you read today; allow noreply@shopify.com; emergency contact and developer address set | 3 |
| 19 | Protected customer data | **Before submitting**: untick Phone and Address; replace old reasons; read the data protection details (§2) | 8 |
| 20 | Submit | **Submit** once; check the status reads Submitted; write down the date | 2 |
| 21 | Same sitting, not the listing | Now-4: PITR or your written acceptance of going without, and the EU representative | ~10 |
| — | After, on the live day | **Note the date it shows live**; set the mirrors' 30-day reminder (§4) | 2 |

Steps 1–20 take about 35–40 minutes, step 21 about 10 [I].

---

## 0. Optional, first: the "before" AI check (25–30 minutes)

**Why now and only now.** Once the edit shows live, assistants start reading the new listing, and what they said
about the old one can't be asked again. Without this check there is no "before" to compare later months against
(`…/wf6/GROWTH.md` §4.2 act 0; `…/wf6/ai-rec.md` §5.2). It can wait until just before step 20, but no later. It
is optional: skipping it costs only the comparison.

The Lite check (`ai-rec.md` §5.1–§5.3):
1. Two questions, word for word, never changed:
   - Q1: `What is RewardsPro?`
   - Q2: `How much does the RewardsPro Shopify app cost, and what does it do?`
2. ChatGPT, 8 runs of each; Google AI Mode (google.co.uk), 4 runs of each: 24 runs.
3. A new private window for each surface, logged out, on your normal connection. A new chat for every run. Paste
   the question; no follow-ups, no thumbs.
4. Copy each full answer and any links into one CSV in `marketing/social/private/`, which git ignores (create the
   folder if it isn't there). Note whether it searched (sources shown) and whether an ad appeared. The CSV's first
   line is `ai-rec.md` §5.4's column list · 185 characters
   ```text
   month,date_utc,surface,mode,question_id,run,searched,rewardspro_named,rank_among_apps,apps_named,facts_correct,stale_codes,cited_urls,ours_cited,ad_shown,ad_advertiser,notes,answer_text
   ```
   Keep a copy in the private research folder too (ROADMAP Now-6). These answers can't be retaken, and git
   doesn't carry ignored files when RP-17 moves `marketing/` or B5 deletes `apps/rewardspro/`.
5. Never sign in, and never say who is asking. Agents code what you paste; they never run the chat apps.

---

## 1. The listing form, field by field

**Where:** Partner Dashboard → App distribution → RewardsPro → Distribution → Manage listing. Shopify's best
practices name this path for translated listings ("go to App distribution > your app > Distribution > Manage
listing") [V]; that the main listing is edited from the same page is [I]. Shopify's protected-data page says "go to
Apps" instead (§2) [V], so the sidebar may read either [I].

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

The 7 Nov capture shows no demo store link [V, the capture], so the field is probably empty [I]. Leave it.

### 4 · Screenshots: remove what the form allows

The replacements are RP-21's sheet and act 8 (by Fri 18 Dec).

- **If the form saves with fewer than three [U]:** remove **#1** (it shows a real gmail.com test address) and **#3**
  (tier products). Remove **#2** too if you choose: the shot list finds it false as well, because each tier carries
  its own "Annual" duration where the rebuild has one "Spend counted over" setting (listing-delta §0). Keep at least
  as many as the form asks for. The trade-off: Shopify's best practices ask for "3-6 desktop screenshots" (§6), so
  the reviewer may ask for more and hold the submission, deletions included. If that happens, reply that act 8
  replaces them by 18 Dec [I].
- **If the form needs three:** leave all three, or, if you have the file to hand [U], re-upload #1 with the address
  blurred or cropped out. It is the same image, so it needs no new claim, and Shopify asks for it: "Crop out browser
  chrome and sensitive information" (§6) [V]. If you leave #1 as it is, say why in #162.
- **Alt texts: leave them.** Each describes an image that stays until act 8, and goes when its image goes.

### 5 · App introduction: keep

89 of 100 [V, the capture]: "Give shoppers cashback as store credit, so they have a reason to come back and buy
again." (quoted from listing-delta §2). It matches the code. Its second half is positioning, and close to the
outcome phrases MESSAGING §4 avoids ("keep them coming back", "come back more"), like the subtitle in step 13.
Changing it is your call at S2; state B may replace it.

### 6 · App details: two deletions

The counter should read about **497** [I: the 7 Nov page has 497 characters; the form may count differently]. If
it shows another number, check that the 38-character fragment in 6a is there word for word: the drop of 38 (then
101) is the real check. If the fragment isn't there, leave this step and note it in #162.

**6a. Delete the tier-product clause.** False: the rebuild sells no tiers (`rp-no-tier-products`, an internal row).
Delete · 38 characters, comma included; the counter drops by 38, to about **459**
```text
, and you can sell a tier as a product
```

**6b. Recommended: delete the widget sentence.** It is unverified: every widget sentence is held back until
`rp-widget` is verified, which needs gate C to count (listing-delta §0). And #187 narrows `rp-widget`: showing
customers "their credit" is false when Shopify returns no amount, for example for a buyer whose only credit is in
another currency, which production has shown.
Delete · 100 characters, plus the space before it; the counter drops by 101, to about **358**
```text
A widget you turn on in your theme editor shows signed-in customers their credit, tier and progress.
```
Keeping it is your call. It then stays as kept-but-unverified text.

**6c. Keep the rest, knowing some of it is wider than #187's revised rows.** S1 removes only what is known false;
these stay, unverified, until S2's text replaces the whole field (`social/entity-card.md` §3, E500-B-listing):
- the sentence on adding cashback when an order is paid (`rp-store-credit`, `rp-paid-trigger`): #187 finds that
  test orders, cancelled orders, orders created before install but paid after it, and orders paid fully with store
  credit earn nothing;
- "Customers move up tiers as they spend" (`rp-vip-tiers`): they move down too, and a customer locked to a tier
  doesn't move (#187);
- the two closing sentences, on spending credit when signed in with new customer accounts or Shop Pay and on the
  full balance. They are the first of the three limit lines (L1, §5) [V, the capture], resting on
  `sh-sc-signin-legacy` and `sh-sc-full` (both proposed).

E500-B-listing was written before #187 and uses the same wider wording, so it needs the same re-check before S2 [I].

### 7 · Features: delete Feature 3, trim Feature 2

**Feature 1: keep** · 71 of 80 · rests on `rp-store-credit`, `rp-paid-trigger` (proposed). It is wider than #187's
revised `rp-paid-trigger` in the same way as 6c; S2 replaces it.

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
False: there are no tier products (`rp-no-tier-products`).

**If the form won't save with two features [U]:**
- **Recommended:** write one line in #162 giving your exception to the claims gate for this line (gate G1), and
  paste §5's F3 line (77 characters) as Feature 3. Why: it replaces a line known to be false with one the code backs
  (`app/lib/payouts.server.ts:256-257`) and production refunds E and F showed (`docs/gates.md:23-24`). It is
  unverified, like the lines S1 keeps, but it stays inside #187's revised sentence. If that sentence has been
  challenged again by the day, take the other path.
- **Otherwise:** leave Feature 3 as it is, finish the other steps, and say so in #162. It then stays until
  `rp-refund-takeback` verifies.

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

### 10 · Translations: check, and delete any custom listing

English listings are translated automatically, but "Adding your own translated listing for an automatically
translated language overwrites and disables automatic translation for that language" [V, best practices §5 D].
If any custom translated listing exists [U], it still carries the old text. **Recommended: delete it**, with
More actions > Delete listing [V]. Automated translation then resumes and follows the corrected English. Editing it
by hand instead means repeating every change in this sheet in that language.

### 11 · Category details: untick two

Shopify calls Program types and Rewards you can offer the category's "structured features" [V, app listing
categories], and "These details can be updated at any time and don't require an appeal for review" [V].

**Untick:** "Memberships" (Program types) and "Membership perks" (Rewards you can offer). The rebuild has no
memberships (`rp-no-tier-products`). "Your tags should accurately reflect the primary function(s) of your app"
(4.3.5) [V].

**Keep:** Reward programs, VIP tiers, Cash back programs (Program types); Cash back, Store credit (Rewards you can
offer). The tag stays Loyalty and rewards, which Shopify lists under Customer loyalty [V, app listing categories].

### 12 · Resources: keep

Keep the privacy policy URL; act 7 replaces the page behind it. Add the Terms of Service URL only once
`rewardspro.io/terms/` is live (listing-delta §2). The FAQ link waits for `/help/` (RP-09; see §5 on the limit
lines).

### 13 · App card subtitle: keep

56: "Bring buyers back with cashback they spend in your store" (listing-delta §2). Not false, but positioning, and
MESSAGING §4 lists "bring buyers back" among the outcome phrases to avoid; changing it is your call at S2, after
the interviews. "Don't add keywords to your subtitle with the intent of improving search performance" (4.4.1) [V].

### 14 · Search terms: five, with your word on Pre-5

Replace what is there (#131 proposed a set with "membership"; the live set can't be read from outside [U]) with
these five, one per box. "For search terms, enter up to five relevant terms using complete words (not partial) and
limit to one idea per term" [V, best practices §5 E]. The length of a term is unconfirmed: check the field's own
counter.

| # | Term | Characters | Basis |
|---|---|---|---|
| 1 | `store credit` | 12 | `rp-store-credit` |
| 2 | `cashback` | 8 | `rp-store-credit`, `rp-paid-trigger` |
| 3 | `VIP tiers` | 9 | `rp-vip-tiers` |
| 4 | `loyalty program` | 15 | the tag the listing sits under, Loyalty and rewards (§6) |
| 5 | `rewards program` | 15 | the same |

- US "program" on purpose: terms follow what merchants type, aren't shown on the listing [I], and are translated
  automatically [V]. MESSAGING keeps "loyalty program" out of copy; a search term isn't copy.
- Never: trade-in, tcg, membership, points or free (`…/wf10/status.md` A3; "free" belongs only in Pricing
  details, 4.2.3).
- **If you'd rather not decide Pre-5 today:** remove every term that names something the rebuild doesn't have
  (membership, points, raffle, mystery box, mission, subscription, gift card, discount, referral, email campaign,
  trade-in, tcg; STRATEGY never-say 8) and "free", and keep the rest. The live terms may still be the old app's
  [U].

### 15 · SEO title tag: check

On 7 Nov the page title showed the app name and subtitle, which suggests this field is empty [I].
- **Empty:** leave it; its text comes at S2.
- **#131's "RewardsPro – Cashback, VIP Tiers & Memberships":** delete these words and the space before them
  · 13 characters (the counter drops by 14)
  ```text
  & Memberships
  ```
  What remains · 32 characters. The field's limit is unconfirmed: check its own counter.
  ```text
  RewardsPro – Cashback, VIP Tiers
  ```
- **Anything else:** clear the field. #131 recorded a different title on 3 Nov, naming points, raffles and mystery
  boxes, and the old app may have left something else. Clearing is a deletion and needs no claim; Shopify then shows
  the name and subtitle, as the 7 Nov page did [I].

### 16 · SEO meta description: paste

The 7 Nov page has 141 characters [V, the capture]; the form's counter may differ [I]. First check that the field
still holds the 7 Nov text, which starts "RewardsPro pays repeat customers cashback" (listing-delta §2). If it doesn't,
leave the field and note it in #162. If it does, select all and paste the text below. Deletion only: the live words
in the same order, with "repeat" and the tier-membership clause taken out [V, word by word against the capture].
What remains rests on `rp-store-credit` and `rp-vip-tiers` (proposed).
Paste · 88 characters (the limit is unconfirmed: check the field's own counter)
```text
RewardsPro pays customers cashback as Shopify store credit, with VIP tiers set by spend.
```
"Repeat" goes because a new buyer earns on a first paid order too (listing-delta §2, meta row).

### 17 · Install eligibility: look

Shopify's section F asks you to "Specify which sales channels your app needs (Online Store or POS) and geography
criteria (country, shipping, currency)" [V]. Under Sales channel requirements, "Merchant must have online store"
should be selected, because the widget is a theme app embed with an app proxy (requirement 4.3.1; listing-delta
§2). If it isn't selected, select it. Look at the geography criteria (4.3.8), change nothing, and note in #162 what
they show [U].

### 18 · Contact information, and two Partner settings

- **Contact information, in the listing form.** Shopify writes to the app submission email during review [V]. Check
  that it is a mailbox you read today. contact@rewardspro.io isn't proven to receive mail yet (ROADMAP §4 actions
  5–6), so don't switch to it today [I]. Add noreply@shopify.com to that mailbox's allowed senders, as Shopify asks
  [V]. If review emails go unanswered after repeated attempts, Shopify can pause the app in a cooldown [V].
- **Partner account settings, not the listing.** Check that an emergency developer contact is set, with an email
  and a phone number (requirement 4.5.6) [V]. Look at the developer address: the listing showed "London, GB" on
  7 Nov, and #131 part 1 proposed the registered office (listing-delta §2). Change either only if it is wrong.

---

## 2. Protected customer data, before you submit (step 19, about 8 minutes)

**Why before step 20.** "Applying for protected customer data isn't possible while the app is under review."
[V, shopify.dev submit-app-for-review, read 2026-11-09 22:20 UTC]. Shopify's request steps also end with "Submit
your app for review.", so step 20's one submit is meant to cover both the request and the listing [I].

**Where:** Shopify's steps read "From the Partner Dashboard, go to Apps, and then select your app.", then "In the
sidebar, click API access requests.", then "Find Protected customer data access" [V, shopify.dev
protected-customer-data]. Editing an existing request may look different [U].

**Keep Name. Keep Email (recommended). Untick Phone and Address.**

- The rebuild reads first and last names only, live, for its admin pages and the customer CSV export, and stores
  none (`apps/rewards/app/shopify/graphql.ts:439-449`, `app/shopify/names.server.ts:4-12`,
  `app/routes/app.customers.export.tsx:13-15` at 2fe85336) [V].
- The Customers search ("Search by name or email", `app/routes/app.customers._index.tsx:136`) passes what the
  merchant types to Shopify and reads back customer IDs only (`graphql.ts:452-458`). The code's own note says a
  search on email "may also need protected customer data access to those fields" [I], so Email stays unless you
  accept that searching by email might stop working.
- The host's request logs keep the Customers search text for one day; you accepted that, with no log drain
  (`apps/rewards/docs/switch.md` row 6, lines 42 and 57) [V].
- Nothing in `apps/rewards/app` or `extensions` reads a phone number or an address (`git grep` at 2fe85336) [V].
- Shopify's rule: it approves access "if the requested data is the minimum amount required by your app to provide
  the merchant with the app functionality" [V]. Shopify's field list puts geolocation under Address ("address
  line 1, address line 2, geolocation, and zip codes") [V], so unticking Address may also clear "Geolocation" from
  the listing's device-data line [I].

**Reasons.** Shopify asks for a reason for each field ("provide your reasons for using them") [V]. The request on
file was made for the old app [I], which had marketing email of its own (`apps/rewardspro/CLAUDE.md`) [V]; what its
reasons say is [U]. Read the reasons on file for Name and Email, and replace any that describe the old app with the
texts below. They go to Shopify's reviewers, not onto the listing, so they carry code locators (above); the Name
reason's proposed row is `rp-no-shopper-names`* (MESSAGING §7).

Name · 275 characters (limit unconfirmed: check the field's own counter)
```text
The admin pages and the customer CSV export show each buyer's first and last name, read from Shopify when a page loads or a file is made. RewardsPro's database stores no customer names. Its host's request logs keep the Customers search text, which can be a name, for one day.
```
Email · 287 characters (limit unconfirmed: check the field's own counter)
```text
So the merchant can find a customer by email on the Customers page: the search sends what the merchant types to Shopify's customer search and reads back customer IDs only. RewardsPro's database stores no customer email addresses. Its host's request logs keep the search text for one day.
```

**Data protection details.** Shopify's next step is "Complete your Data protection details, making sure that your
app meets the protected customer data requirements." [V]. Read them; change nothing unless a statement is now false
for the rebuild, and note in #162 anything that disagrees with the code or that you aren't sure of.

Then save. If the form asks you to submit the request on its own, do that, then go on to step 20.

Two things to know:
- If the edit puts Name access back into review [U], the admin shows each buyer as "Customer ····1234" until it is
  approved (`names.server.ts:8-12`) [V, the code].
- The privacy page the listing's Data access section points to [V, the capture] still describes the old app, listing
  email, name, phone and more for shoppers (`landing/public/privacy-policy/index.html:625-627`), until act 7
  replaces it. Until then, the request and the policy disagree.

---

## 3. Submit, then the other call (steps 20–21)

### 20 · Submit

Check step 18's submission email first. Then submit once. "Any changes that you make to your app listing are
subject to review" [V]. The check that it worked: "After you submit your public app for review, it moves to the
Submitted status and you receive an email confirming that your submission was received." [V, shopify.dev
review-process, read 2026-11-09 22:15 UTC; for an update to an app that is already published, that it works the
same way is [I]]. How long the review takes is [U]. Write down today's date; the clock in §4 starts on the day the
edit **shows live**, not today.

### 21 · Same sitting, not the listing (about 10 minutes)

ROADMAP §5 Now-4, because the listing is installable today and the new search terms make it easier to find. Both
are your call; no agent acts on either.
- **PITR** (about US$100 a month; `apps/rewards/docs/switch.md` row 9; GROWTH G10), or your written acceptance of
  going without. To accept, one line in #162 in your own words is enough, for example "Now-4: I accept running
  without PITR until (an event or a date)."
- **The EU Art. 27 representative.** The shortlist is #131 part 3, with prices read on 3 Nov; ROADMAP §7 repeats the
  three prices. Re-check them before signing (listing-delta §2). Record your choice, or "not now", the same way.

---

## 4. After you submit: the live date and the 30-day reminder

1. **Note the date it shows live.** When Shopify's review passes, open the public listing yourself, logged out,
   and check that the old Feature 3 is gone. Write the date in #162 as `live: YYYY-MM-DD`. The "before" picture,
   the mirrors' 30 days and Sidekick's source all run from that date, not from the day you submitted
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
| L1: buyers spend credit only when signed in with new customer accounts or Shop Pay | **Live** in App details (step 6c), kept but unverified. Nothing to paste | `sh-sc-signin-legacy`, `sh-sc-full` | Stays live. Its rows are re-checked by 7 Dec (`review_after` 2026-12-07) from your paste of the Help Center page |
| L2: store credit can't pay subscription renewals | **HELD** | `sh-sc-subscriptions`* | The row exists and reads `status = "verified"` in `claims.toml`, its Shopify text from your paste of the Help Center page, never an agent's read |
| L3: no per-product or per-channel rules | **HELD** | `rp-no-order-rules`* | The row exists with its guard test and reads `status = "verified"` |

**Where L2 and L3 go: your choice.**
- **Default, MESSAGING §4:** "a description of 500 characters or fewer carries the sign-in limit wherever it
  mentions spending, and leaves the other two to the page it links to." So L2 and L3 go on `/help/` (RP-09) with
  Shopify's link beside each, as R-0 asks, and reach the listing as its FAQ resource (step 12) once `/help/` is
  live [I]. App details couldn't carry those links anyway: "Keep support info, links, and testimonials in their
  designated fields" (best practices §5 B5) [V].
- **Alternative, a recorded departure from MESSAGING §4:** append them to App details once their rows verify (R-0
  allows "details or FAQ"). Assistants that read the listing then see the limits, but without Shopify's links. It
  needs 6b done: click at the very end of App details, type a space, paste L2, type a space, paste L3, and the
  counter goes from about 358 to about **490** (with the widget sentence kept it would reach 591, over 500). At S2,
  E500-B-listing (498 characters, `social/entity-card.md` §3) replaces the whole field and has no room for them, so
  they drop out unless that text is cut.

Either sentence can go in alone once its own row verifies.

HELD, not today · L2 · 59 characters · `sh-sc-subscriptions`*, MESSAGING §3's wording
```text
Shopify doesn't let store credit pay subscription renewals.
```
HELD, not today · L3 · 71 characters · `rp-no-order-rules`*, MESSAGING §4's wording
```text
There is no setting to exclude products, collections or sales channels.
```
L3 says what the merchant can't set, never that everything earns: gift-card lines earn nothing, and POS earning has
never been observed (MESSAGING §3 P2, §4).

### The Pricing pair (`…/wf10/status.md` A9; listing-delta §2, Pricing row)

**HELD** until `rp-merchant-funds` and `sh-sc-fee` read `status = "verified"` and you answer Pre-5. `sh-sc-fee` is
Shopify's rule, re-checked before each use (its `review_after` is 2026-12-07), from your paste of the Help Center
page, never an agent's read.

**Option A**, if the form has an additional-charges field that takes it. By sentence: (1) `rp-merchant-funds`;
(2) `sh-sc-fee`.
HELD, not today · 205 characters (limit unconfirmed: check the field's own counter)
```text
You fund the cashback you give: it is store credit in your own shop. For stores created on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit.
```

**Option B**, if the field exists but is short. `rp-merchant-funds`, `sh-sc-fee`.
HELD, not today · 70 characters (limit unconfirmed: check the field's own counter)
```text
You fund the cashback you give. Shopify's store-credit fees may apply.
```

**If there is no such field:** the pricing-details link to a rewardspro.io page that carries Option A
(listing-delta §2, fallback 1). That page would be RP-08's or a later one, on your yes.

### F3: only if the form insists on three features

**HELD** until `rp-refund-takeback` reads `status = "verified"`: a second session's concur on #187's revised
sentence, and your D6 (Pre-1: whether `gates.md`'s production refunds E and F count). Or today, by your written
exception (step 7, where it is recommended). That exception is yours alone (gate G1).
HELD unless you give step 7's exception · 77 characters · `rp-refund-takeback`
```text
Refunded items take back their share of cashback, up to the credit still held
```
It follows #187's revised sentence: "When items are refunded, RewardsPro takes back their share of the cashback, up to
the store credit the customer still holds in the order's currency. A refund of shipping alone takes nothing back."
Eighty characters have no room for the currency, or for the row's scope: stores whose prices include tax, and orders
not edited to add items after payment. This replaces the sheet's first F3 line, which was wider than the revised
sentence.

listing-delta §2 offered an email line instead ("Sends no email itself; …"). Its row, `rp-no-own-email`, has no
`listing` channel and waits for your Now-5 decision, so it is further off than this one.

---

> **Reference: not needed in the sitting.** §6–§8 are for reviewers and for checking this sheet.

## 6. Field limits and rules, read 2026-11-09

The first five pages were fetched once each on 2026-11-09 between 21:37 and 21:40 UTC, and the last two (their
Markdown versions) at 22:15 and 22:20 UTC, each with a generic browser User-Agent, after checking
`shopify.dev/robots.txt` (none of these paths is disallowed). Shopify's pages carry dynamic markup, so compare the
quoted sentence, not the hash (the `claims.toml` convention). The raw copies stay in the session scratchpad.

| Page | URL | sha256 of the body |
|---|---|---|
| Best practices | https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices | `6a046289…a77fde3c` |
| App Store requirements | https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements | `17d94531…3c063eaf` |
| Protected customer data | https://shopify.dev/docs/apps/launch/protected-customer-data | `b496ddee…a45fe107` |
| Create ads | https://shopify.dev/docs/apps/launch/marketing/advertising/create-ads | `eeda79bb…ebf7b036` |
| App listing categories | https://shopify.dev/docs/apps/launch/app-store-review/app-listing-categories | `6374b6c1…cdb8449e` |
| About the app review process | https://shopify.dev/docs/apps/launch/app-store-review/review-process | `360c3cfb…a8b767c8` |
| Submit your app for review | https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review | `a16371e2…c67aa0a9` |

| Field or rule | Shopify's words (2026-11-09) | Where |
|---|---|---|
| App name | "Keep it short: Use 30 characters or fewer, which is the maximum length that an app name can be." | Best practices §5 A1 |
| App introduction | "Your app introduction (100 characters) should clearly highlight the benefits merchants can expect. Tie your unique offering to measurable business outcomes. Avoid keyword stuffing, data claims, and incomplete sentences." MESSAGING §4 avoids outcome phrases that have no evidence, so the kit doesn't follow the middle sentence | Best practices §5 B4 |
| App details | "In your app details (500 characters), describe functional elements and what makes your app unique. Avoid excessive marketing language, keyword stuffing, and outcome guarantees. Keep support info, links, and testimonials in their designated fields." | Best practices §5 B5 |
| Features | "Keep features short and scannable (up to 80 characters per feature)" | Best practices §5 B6 |
| Number of features, and whether fewer than three is allowed | Not stated | Unconfirmed: check the form |
| Feature media | "If you don't have a video, use a static image that conveys your app's benefit or unique value." "Don't use Shopify logos or repeat your app card subtitle in the image." | Best practices §5 B1 |
| Logo-only images | "Feature images and screenshots that solely contain your app logo are not permitted." | Requirement 4.4.4 |
| Screenshots | "Include 3-6 desktop screenshots, including at least one of your app's UI. Ensure images are clear and focused on your app's functionality. Crop out browser chrome and sensitive information. Provide alt text, avoid PII, and don't include pricing, reviews, or outcome guarantees." | Best practices §5 B3 |
| Whether feature media may be empty | Not stated | Unconfirmed: check the form |
| Pricing | "Choose your primary billing method (Free to install, Recurring charge, or One-time payment) and provide clear pricing information in the designated section only." The example lists "A description of any additional charges for this plan" and "A link to a page that describes any charges that are billed outside of Shopify's app billing system." | Best practices §5 C |
| Pricing, complete | "Ensure your pricing information includes all pricing options such as, free trial time and charge details." | Requirement 4.2.1 |
| Pricing, nowhere else | "Do not include pricing information in undesignated areas like your app logo, to prevent merchant confusion. Keep this information in Pricing details." | Requirement 4.2.3 |
| Additional-charges field for Free to install, and its length | Not stated | Unconfirmed: check the field's own counter (step 9) |
| Truthful listing | "Your app store listing should be truthful and accurate. Merchants should know based on your listing if your app will work for them." | Requirement 4.3 |
| Factual only | "Your app and app listing should only include factual information." | Requirement 1.1.4 |
| No stats | "Do not use any statistics or data in your app's listing content … avoid using terms like "the first", "the best", or "the only"." | Requirement 4.3.3 |
| Tags | "Your tags should accurately reflect the primary function(s) of your app." | Requirement 4.3.5 |
| Category details | "You can select up to 25 structured features per category field in the app submission form and they will appear on the app listing. These details can be updated at any time and don't require an appeal for review." | App listing categories |
| Category | "Loyalty and rewards: Apps that manage customer rewards and loyalty programs." | App listing categories |
| SEO fields | "Optimize your title tag and meta description for search engines." | Best practices §5 E |
| Install eligibility | "Specify which sales channels your app needs (Online Store or POS) and geography criteria (country, shipping, currency) to target the right merchants." | Best practices §5 F |
| Online store | "If your app embeds features in a merchant's Online Store, then select "Merchant must have online store" under the Sales channel requirements section of your app listing form." | Requirement 4.3.1 |
| Geography | "Specify geographic requirements or specific API permissions in your app's listing if they are needed for your app to function." | Requirement 4.3.8 |
| App card subtitle | "Don't add keywords to your subtitle with the intent of improving search performance." Length not stated | Requirement 4.4.1. Length unconfirmed: check the field's own counter |
| Search terms | "For search terms, enter up to five relevant terms using complete words (not partial) and limit to one idea per term". Length of a term not stated | Best practices §5 E. Length unconfirmed: check the field's own counter |
| SEO title tag, SEO meta description, image alt text | Limits not stated on any of these pages | Unconfirmed: check the field's own counter |
| Translations | "Automated translation covers: App card subtitle, App introduction, App details, Features, Pricing details, Search terms, and image alt text." "To delete a custom translation (which re-enables automation), use More actions > Delete listing." | Best practices §5 D |
| Review | "Any changes that you make to your app listing are subject to review." | Create ads |
| Review status | "After you submit your public app for review, it moves to the Submitted status and you receive an email confirming that your submission was received." | About the app review process |
| Review contact | "The app submission email that you provided in the Contact information section of your listing form is where Shopify will email you during review. To ensure that you receive all emails, add noreply@shopify.com to your allowed senders list in your email service provider's settings." | Submit your app for review |
| Cooldown | "Shopify may place your app in a temporary cooldown period if you do any of the following." One of them: "Don't respond to review emails after repeated attempts" | Submit your app for review |
| Emergency contact | "You need to provide an email and phone number in case critical technical issues with your app arise and we need to contact you." "Add an emergency developer contact on the Partner account settings page" | Submit your app for review; requirement 4.5.6 |
| Protected data, timing | "Applying for protected customer data isn't possible while the app is under review." | Submit your app for review |
| Protected data, steps | "If your app needs access to protected customer fields, then select the relevant fields, provide your reasons for using them, and click Save." "Complete your Data protection details, making sure that your app meets the protected customer data requirements." "Submit your app for review." | Protected customer data |
| Protected data, rule | "Shopify will approve your app to use protected customer data if the requested data is the minimum amount required by your app to provide the merchant with the app functionality." | Protected customer data |

The five numeric limits (30, 100, 500, 80, five terms) are the same as listing-delta §1 read on 2026-11-07.
New since then, for this sheet: the details' "links" sentence (§5), requirement 4.4.4 (step 2), and the review,
contact and protected-data timing sentences (steps 18–20).

---

## 7. What changed since #131

Draft PR #131 (`claude/rewardspro-launch-copy` at ced404ab, 2026-11-03) wrote the listing text for the old app
(`apps/rewardspro` at 85789f7e). Production has run the rebuild (`apps/rewards`) since the 2026-11-06 switch, and
by the 7 Nov capture most of #131's listing block was already live, with small edits (listing-delta §2).

| Part of #131 | Since then | In this sheet |
|---|---|---|
| SEO title tag "…VIP Tiers & Memberships" (46); the live tag it recorded on 3 Nov, naming points, raffles and mystery boxes | "Memberships" is false for the rebuild. The 7 Nov page title suggests the field may be empty [I] | Step 15: delete "& Memberships" if there; clear anything else |
| Meta description (134), with "tier memberships you can sell as products" | Live at 141, with "repeat" added | Step 16: 88-character deletion-only text |
| App card subtitle (56) | Live as written | Step 13: keep |
| App introduction (97) | Live at 89, edited | Step 5: keep |
| App details (499), with "and you can sell a tier as a product" and the currency words | Live at 497: the currency words are gone, the sign-in sentence reworded; the tier-product clause is still there | Step 6: delete the clause; the widget sentence recommended |
| Features (71, 78, 65) | Live as written. Feature 3 is false; `rp-tier-window` was narrowed on 7 Nov | Step 7: delete Feature 3; trim Feature 2 recommended |
| Tags: remove Subscriptions, Gift card programs, Discounts, Gift cards; keep Memberships and Membership perks | Those four, and both "Custom" tags, are gone. Memberships and Membership perks are still ticked, and are false now | Step 11: untick both |
| "Works with: Customer accounts" | Not on the 7 Nov capture | Nothing to do |
| Search terms, with "membership" | Not readable from outside [U] | Step 14: five terms, no "membership" |
| Screenshot alt texts; retake #1 with example.com customers or blur the address; retake #3 | All three are the old admin; the shot list finds #2 false too | Step 4: remove if the form allows, or re-upload #1 blurred; RP-21's sheet and act 8 |
| Feature video: watch, then decide | It shows the old app and a speed claim the never-say list bars | Step 2: remove |
| Sales channel: "Merchant must have online store" (4.3.1) | Still needed: the widget is a theme app embed (listing-delta §2: keep) | Step 17: look |
| Emergency developer contact (4.5.6) | Unchanged; it lives in Partner account settings | Step 18: look |
| Developer address | The listing shows "London, GB"; Partner account settings hold it | Step 18: look |
| Protected data: name, email and phone; drop address | The rebuild reads names only; email may be needed for search | Step 19: untick Phone and Address, before submitting |
| Pricing: leave "Free" | "Free" needs its pair (`rp-free`'s scope) | Step 9: keep and look; the pair HELD (§5) |
| `[Yu: …]` notes (1)–(3), "When to paste", the claim-source table | Old-app issues (PR #126, crons off, the widget's local balance), and old-app paths | Dropped; claim ids instead |
| Field limits | The same five, re-read 2026-11-09, plus the rules in §6 | §6 |
| Outreach note | Not this package. MESSAGING.md §5 now holds the proposed email set | — |
| EU representative shortlist (part 3) | Not this package. listing-delta §2: unaffected; re-check prices before signing. ROADMAP §7 repeats the three prices | Step 21 points to it |

**For your decision on #131:** with steps 17 and 18 added, every part of #131's listing section is either carried
here, already live or superseded. Its outreach note isn't RP-02's, and ROADMAP §7 keeps only the shortlist's three
prices, not #131's comparison of what each includes. If you want that comparison kept in git, keep #131 open for it;
otherwise it can be closed once you've read this. Your call; no agent closes it.

---

## 8. How this sheet was checked

- **Counts:** Python `len()` on the exact text inside each `text` block, with no trailing newline. A second session
  can re-run every count in this file from the repo root (21 lines, all "ok", when this was committed):
  ````sh
  python3 -I - apps/rewardspro/marketing/listing/S1-text.md <<'EOF'
  import re, sys
  t = open(sys.argv[1], encoding="utf-8").read()
  pairs = re.findall(r"· (\d+) characters[^\n]*\n *```text\n *(.*?)\n *```", t, re.S)
  pairs += [(n, s) for s, n in re.findall(r"\| `([^`]+)` \| (\d+) \|", t)]
  for n, s in pairs:
      print("ok " if len(s) == int(n) else "BAD", n, len(s), s[:50])
  EOF
  ````
  The counter steps were checked by the same script's arithmetic: 497 − 38 = 459, 459 − 101 = 358,
  358 + 1 + 59 + 1 + 71 = 490, 459 + 1 + 131 = 591, 78 − 27 = 51, 46 − 14 = 32.
- **Live values:** read from listing-delta §2, #131, and the capture of 7 Nov (sha256 `126aa3b4…7877`). The
  capture was used only to confirm that each deleted fragment occurs word for word, to count the fields before and
  after, and to see that it shows no demo store link; none of its text is copied here beyond what listing-delta
  already quotes.
- **Code:** read in this worktree at origin/main 2fe85336 (`graphql.ts`, `names.server.ts`,
  `app.customers._index.tsx`, `app.customers.export.tsx`, `session-storage.server.ts`, `payouts.server.ts`,
  `shopify.app.toml`, `docs/switch.md`, `docs/gates.md`, and a `git grep` for phone and address reads). Each file
  cited is unchanged at origin/main 5c953f5c.
- **#187:** `apps/rewardspro/marketing/claims-checks/code-rows.md` at 2c0e2c17, read for `rp-paid-trigger`,
  `rp-vip-tiers`, `rp-refund-takeback` and `rp-widget`. It is a first-session check; nothing in it is verified yet.
- **Not opened:** apps.shopify.com, help.shopify.com and the Partner Dashboard, by any tool. Shopify's own text
  above comes from shopify.dev only (§6).
