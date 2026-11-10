# RewardsPro listing text: the S1 sitting sheet

**One sitting, by Sun 22 Nov 2026.** An agent fills the Shopify App Store listing form in the owner's Chrome,
field by field, and never presses Save or Submit. The owner reads each field, then presses Save and Submit himself.
His part takes about 20–30 minutes [I], plus about 5 if he runs the optional "before" check (§6). The agent's
preparation (§1) takes about 20 minutes and none of his, after one yes. Written by agents for issue #162 (RP-02) and
revised on 10 Nov 2026 after the second read on #162. Nothing here has been pasted or submitted.

**Why it comes first.** An App Store ad "is based on information in the associated app listing, and can't be
customized" (create-ads). Shopify's Sidekick, search snippets and the directory sites copy the listing too.

**Sources.** Every new public sentence names the code on origin/main under `apps/rewards/` that makes it true, and
its row in [`../claims.toml`](../claims.toml). Shopify's words are quoted from the pages in §8. "Today" is the public
listing as read on 10 Nov 2026 at 09:48 UTC. Labels: **[V]** checked, **[I]** inferred, **[U]** unknown. Counts
are Python `len()`, spaces included; §8 re-runs every one.

## The three faults in today's listing

| Fault | Where it shows today | Fixed at |
|---|---|---|
| It says a shop can sell a tier as a product. The app sells no tiers: `shopify.app.toml` has no product scope, and `apps/rewards` makes no product, selling-plan or purchase-option call [V, `git grep`, 10 Nov] | App details, Feature 3, the SEO meta description, the Memberships and Membership perks tags, and screenshot #3 with its alt text "Tier membership products with duration, price and cashback" | Steps 4, 6, 7, 11, 16 |
| Screenshot #1 shows a real person's email address | Screenshot #1, the old app's Orders list | Step 4: **#1 is replaced in this sitting** with a clean shot made in §1 |
| "Free" stands alone | Pricing | Step 9: the funding sentence goes beside it |

---

## 1. Before the sitting: the agent's preparation (about 20 minutes)

On the owner's yes, because it saves on a store. It happens on one of the company's development stores with
RewardsPro installed (`apps/rewards/docs/switch.md` lists them), never on a merchant's store.

1. **Test data.** At least two tiers with plain invented names (for example Silver and Gold, at different minimum
   spends), and cashback on. One test customer with an invented name (for example "Alex Example") and an
   `example.com` email address. One draft order for that customer, marked as paid, so that it isn't a test order:
   test orders earn nothing (`app/lib/record-order.server.ts:66`) [I: that a draft order marked as paid isn't one;
   the order's page will show it]. Then, on that customer's page, **Lock to a tier**, and afterwards **Return to
   automatic** once. That is the first time Feature 3's line is seen working (`app/lib/tiers.server.ts:276`,
   `app/routes/app.customers.$id.tsx:158-185`). Lock the customer again for shot #2.
2. **Screenshots.** "Screenshots should be 1600px by 900px (16:9)" and "should not include desktop backgrounds or
   browser windows" (best practices §5 B3; requirement 4.4.4). Capture only the app's own frame: no browser window,
   and not the Shopify admin's top bar or sidebar, which show the staff account's name and the store's name.
   - **#1: the Tiers page.** It shows each tier's name, minimum spend, cashback rate and member count, the line on
     what cashback is paid on, and no customer data (`app/routes/app.tiers.tsx:286-354`).
   - **#2: the test customer's page, while locked**, and **#3: the draft order's page.** They are used only if the
     form needs three screenshots (step 4).
3. **Look at each image at full size.** No real person's name or email address, no store name or domain, no
   Shopify logo, no review prompt. If any shows, don't use that image.
4. Save the images in the private research folder on the Air, never in a repo.

If the owner says no to the saves: make #1 from a development store whose Tiers page already has plainly named
tiers, skip #2 and #3, and Feature 3's line goes in without being seen on a store.

---

## 2. The sitting

**How it runs.** The agent works in the owner's Chrome: Partner Dashboard, then Apps, RewardsPro, Distribution,
Manage listing [I: Shopify gives this path for translated listings]. It says it is an agent wherever Shopify asks.
For each field it first checks that the text matches "Today" below. If it doesn't, it leaves that field, tells the
owner and notes it on #162. After each section it shows the owner what it typed. If the owner runs the "before"
check (§6), he runs it before the agent starts.

| # | Field | The agent | The owner reads |
|---|---|---|---|
| 1 | App name, icon | Keeps `RewardsPro` and the icon | — |
| 2 | Feature media | Removes the old video | yes |
| 3 | Demo store URL | Leaves it (none shows today) | — |
| 4 | Screenshots | Replaces #1; removes #2 and #3, or replaces them | yes |
| 5 | App introduction | Keeps it (89 of 100) | — |
| 6 | App details | Pastes the new text (497 → 358) | yes |
| 7 | Features | Keeps Feature 1; pastes Features 2 and 3 | yes |
| 8 | Integrations | Leaves it empty | — |
| 9 | Pricing | Keeps "Free"; pastes the funding text beside it | yes |
| 10 | Translations | Deletes any custom translated listing | yes |
| 11 | Category details | Unticks Memberships and Membership perks | yes |
| 12 | Resources | Keeps the privacy policy URL | — |
| 13 | App card subtitle | Pastes the new subtitle, if the owner agrees | yes |
| 14 | Search terms | Pastes five terms | yes |
| 15 | SEO title tag | Clears it, or deletes "& Memberships" | — |
| 16 | SEO meta description | Pastes the new text (141 → 88) | yes |
| 17 | Install eligibility | Checks "Merchant must have online store"; changes nothing else | — |
| 18 | Contact information | Checks the submission email is one the owner reads | yes |
| 19 | Protected customer data | Unticks Phone and Address; pastes three reasons (§3) | yes, then **Save** |
| 20 | App review preparation | Reads the test instructions and screencast; runs the automated checks (§4) | yes |
| 21 | Submit | Stops | **Submit** (§5) |

### 2 · Feature media

Remove the feature video (YouTube `IHgTl5oQZlg`). It shows the old app under an "INSTANT CASHBACK" headline. If the
form won't save without feature media [U], keep the video for now and note it on #162. A logo-only image won't do:
"Feature images and screenshots that solely contain your app logo are not permitted" (requirement 4.4.4). The
feature image comes with the full screenshot set by 18 Dec (act 8).

### 4 · Screenshots

**#1 is replaced in this sitting.** Today's #1, the old Orders list, shows a real person's email address. Upload §1's
Tiers shot in its place, with this alt text.
Alt #1 · 64 characters
```text
Tiers page: each tier's minimum spend, cashback rate and members
```

**#2 and #3** show the old app. #3 shows tier products, which the app doesn't have; #2 gives each tier an "Annual"
duration, where the app has one "Spend counted over" setting for the shop (`app.tiers.tsx:408`). If the form saves
with fewer than three screenshots [U], remove both. If it needs three, upload §1's #2 and #3 with these alt texts.
Shopify asks for "3-6 desktop screenshots", so a reviewer may ask for more; the full set comes by 18 Dec (act 8).
Alt #2 · 65 characters
```text
A customer's page: tier locked, store credit and cashback history
```
Alt #3 · 47 characters
```text
An order's page, showing the cashback it earned
```

### 6 · App details

Today · 497 characters
```text
Set VIP tiers by spend, each with its own cashback rate. With automatic cashback on, RewardsPro adds cashback to the customer's Shopify store credit when an order is paid. Customers move up tiers as they spend, and you can sell a tier as a product. A widget you turn on in your theme editor shows signed-in customers their credit, tier and progress. Shoppers spend credit at checkout when signed in with Shopify's new customer accounts (not legacy ones) or with Shop Pay. The full balance applies.
```
Paste · 358 characters
```text
Set VIP tiers by spend, each with its own cashback rate. With automatic cashback on, RewardsPro adds cashback to the customer's Shopify store credit when an order is paid. Customers move up tiers as they spend. Shoppers spend credit at checkout when signed in with Shopify's new customer accounts (not legacy ones) or with Shop Pay. The full balance applies.
```
Two deletions and nothing new. The tier-product clause is false. The widget sentence is false in a case production
has shown: when Shopify gives no amount, for example for credit held only in another currency, the widget says "Your
store credit shows at checkout" instead (`app/shopify/live-balance.server.ts:91-97`,
`extensions/rewards-widget/locales/en.default.json:7`). What stays is true in general terms, not in every case: test
and cancelled orders earn nothing (`record-order.server.ts:66-67`), and customers also move down tiers, or not at all
while locked. S2's text replaces the field. If step 9 finds no text field in Pricing, the funding line goes at the
end of this field (358 → 427).

### 7 · Features

**Feature 1: keep** (71): "Automatic cashback, added to Shopify store credit when an order is paid".

Feature 2 · Today · 78 characters
```text
VIP tiers by spend over 12 months or all time, each with its own cashback rate
```
Feature 2 · Paste · 51 characters
```text
VIP tiers by spend, each with its own cashback rate
```
"All time" counts only the orders RewardsPro has recorded, reaching back up to 12 months before install
(`rp-tier-window`), and 80 characters have no room to say so. Source: the Tiers table, with a minimum spend and a
cashback rate per tier (`app.tiers.tsx:298-352`; `rp-vip-tiers`).

Feature 3 · Today · 65 characters
```text
Sell a tier as a one-time product for a month, a year or lifetime
```
Feature 3 · Paste · 33 characters
```text
You can lock a customer to a tier
```
Source: a customer's page has "Lock to a tier" and "Return to automatic" (`app.customers.$id.tsx:158-185`), and
`lockTier` keeps a locked customer on that tier whatever their spend (`tiers.server.ts:235-239`, `:263-285`; `rp-tier-lock`).
A customer can be locked once the app has recorded an order for them. §1 sees it work on a development store.

### 9 · Pricing

Keep "Free": the app has no billing code [V, `git grep` for `appSubscription`, `recurringApplicationCharge`,
`appUsageRecord`, `appPurchaseOneTime` and `billing.` calls over `apps/rewards`, 10 Nov: 0]. Beside it, in the
plan's "description of any additional charges" or whatever text field the pricing section offers [U], paste:
Pricing · Paste · 205 characters
```text
You fund the cashback you give: it is store credit in your own shop. For stores created on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit.
```
If that field is shorter than 205 characters:
Pricing, short · Paste · 70 characters
```text
You fund the cashback you give. Shopify's store-credit fees may apply.
```
If the pricing section has no text field, add this line at the end of App details instead (step 6, 358 → 427) and
note it on #162. Requirement 4.2.3 keeps pricing information "in Pricing details". The line says who funds the
cashback, not what RewardsPro costs, but a reviewer may read it as pricing [I]; if one does, it moves.
Funding line · 68 characters
```text
You fund the cashback you give: it is store credit in your own shop.
```
Sources. The first sentence: RewardsPro adds the cashback with Shopify's `storeCreditAccountCredit`, through the
store's own Admin API, to the store's own customer (`app/shopify/graphql.ts:63`; `rp-merchant-funds`). The second:
Shopify's store credit page, read 10 Nov 2026 at 11:28 UTC: "For Shopify stores created on or after May 12, 2025,
orders that include store credit as a payment method are charged third-party transaction fees on the order amount
paid for using store credit." (`sh-sc-fee`). The app card and search results show Shopify's own price label, where
no text of ours can sit [I]; the listing page carries the pair.

### 10 · Translations

"Adding your own translated listing for an automatically translated language overwrites and disables automatic
translation for that language." If any custom translated listing exists [U], it still carries the old text: delete
it ("use More actions > Delete listing", best practices §5 D). Automatic translation then follows the new English.

### 11 · Category details

Untick "Memberships" (Program types) and "Membership perks" (Rewards you can offer). Keep Reward programs, VIP tiers
and Cash back programs; Cash back and Store credit. "These details can be updated at any time and don't require an
appeal for review" (app listing categories). That these two fields are what Shopify calls structured features is
[I], from the listing's "Show features".

### 13 · App card subtitle: the owner's choice

Today · 56 characters
```text
Bring buyers back with cashback they spend in your store
```
Paste · 52 characters
```text
Give loyal customers cashback to spend in your store
```
"Bring buyers back" states an outcome no shop has shown yet; the new line says what the app does. Source: the
cashback is store credit in the store (step 9's first source), spent at checkout when the customer is signed in, as
App details says. If the owner keeps today's line, the agent leaves the field.

### 14 · Search terms

Replace whatever is there with these five, one per box: "enter up to five relevant terms using complete words (not
partial) and limit to one idea per term" (best practices §5 E). US "program", because terms follow what merchants
type and aren't shown on the listing [I]. Never: membership, points, free, trade-in or tcg.

| # | Term | Characters | Source |
|---|---|---|---|
| 1 | `store credit` | 12 | `rp-store-credit` |
| 2 | `cashback` | 8 | `rp-store-credit`, `rp-paid-trigger` |
| 3 | `VIP tiers` | 9 | `rp-vip-tiers` |
| 4 | `loyalty program` | 15 | the category, Loyalty and rewards |
| 5 | `rewards program` | 15 | the same |

### 15 · SEO title tag

The page title today is the app name and subtitle, which suggests the field is empty [I]. Empty: leave it. If it
reads #131's "RewardsPro – Cashback, VIP Tiers & Memberships" (46), paste this:
Paste · 32 characters
```text
RewardsPro – Cashback, VIP Tiers
```
Anything else: clear it. If the form won't save it empty [U], type `RewardsPro`.

### 16 · SEO meta description

Today · 141 characters
```text
RewardsPro pays repeat customers cashback as Shopify store credit, with VIP tiers set by spend and tier memberships you can sell as products.
```
Paste · 88 characters
```text
RewardsPro pays customers cashback as Shopify store credit, with VIP tiers set by spend.
```
Deletion only: "repeat" goes, because a first paid order earns too, and so does the tier-membership clause.

### 17, 18 · Install eligibility and contact information

- "Merchant must have online store" stays selected (requirement 4.3.1): the widget is a theme app embed behind an
  app proxy (`shopify.app.toml`, `[app_proxy]`). Geography: change nothing, and note on #162 what it shows.
- "The app submission email that you provided in the Contact information section of your listing form is where
  Shopify will email you during review." Shopify also asks you to "add noreply@shopify.com to your allowed senders
  list". So it must be a mailbox the owner reads now.
  contact@rewardspro.io isn't proven to receive mail yet, so don't switch to it today. In Partner account settings,
  check that an emergency developer contact with an email and a phone number is set (requirement 4.5.6).

---

## 3. Protected customer data (step 19, before Submit)

"Applying for protected customer data isn't possible while the app is under review." So this is saved before step
21. Shopify's path: "From the Partner Dashboard, go to Apps, and then select your app.", "In the sidebar, click API
access requests.", "Find Protected customer data access".

**Keep Name and Email; untick Phone and Address.**
- Name: the app reads first and last names only, live, for its admin pages and the customer CSV export
  (`app/shopify/graphql.ts:439-449`, `app/routes/app.customers.export.tsx:13-15`), and its database has no customer
  name column (`prisma/schema.prisma:223-236`).
- Email: the Customers search, "Search by name or email" (`app/routes/app.customers._index.tsx:136`), sends what the
  merchant types to Shopify and reads back customer IDs only (`graphql.ts:465-476`). The code's note says a search
  on email "may also need protected customer data access to those fields" [I].
- Phone and Address: nothing in `app` or `extensions` reads either [V, `git grep`].

**Reasons.** The reasons on file were written for the old app [I]. The agent replaces them with these. They go to
Shopify's reviewers, not onto the listing, and rest on the code above; the limits are [U], so check each counter.

Protected customer data · 381 characters
```text
RewardsPro records each paid order, refund and cancellation, and reads past orders when the store first opens it, to add cashback to the customer's Shopify store credit, take back a refund's share and place customers in VIP tiers by spend. It stores Shopify customer and order IDs, order names, amounts and dates, and no customer names, email addresses, phone numbers or addresses.
```
Sources: the `orders/paid`, `refunds/create` and `orders/cancelled` webhooks (`shopify.app.toml`), the past-orders
import on first open (`app/shopify/install.server.ts`), and the Customer and Order models (`schema.prisma:223-322`).

Name · 275 characters
```text
The admin pages and the customer CSV export show each buyer's first and last name, read from Shopify when a page loads or a file is made. RewardsPro's database stores no customer names. Its host's request logs keep the Customers search text, which can be a name, for one day.
```
Email · 287 characters
```text
So the merchant can find a customer by email on the Customers page: the search sends what the merchant types to Shopify's customer search and reads back customer IDs only. RewardsPro's database stores no customer email addresses. Its host's request logs keep the search text for one day.
```
The one-day logs: `apps/rewards/docs/switch.md` row 6.

Read the data protection details; change nothing unless a statement is false for the app, and note anything unsure
on #162. Then the owner presses Save. Two things to know: if the edit puts Name back into review [U], the admin
shows each buyer as "Customer ····1234" until it is approved (`app/shopify/names.server.ts:4-12`); and the privacy
page still describes the old app until #167 replaces it, so the request and the policy disagree until then.

## 4. App review preparation (step 20, about 2 minutes)

Requirement 4.5.3 asks for a screencast "to demonstrate your app's onboarding and features as described in its
listing". The test instructions and screencast on file were most likely made for the old app [I]. The agent reads
the instructions and watches the start of the screencast.
- If they describe old features (memberships, points, raffles, email campaigns), it says so. The owner chooses:
  submit anyway, so the false lines go (a reviewer's question changes nothing live), or wait. Either way it goes on
  #162, and an agent drafts new instructions afterwards.
- Test orders earn no cashback (`record-order.server.ts:66`). If the instructions don't say so, a reviewer's test
  order will show none: note it on #162 for the new instructions.
- The automated checks "must be run and completed successfully". If one fails, note it and stop.

## 5. Submit, and after (step 21)

The owner presses Submit once. "After you submit your public app for review, it moves to the Submitted status and
you receive an email confirming that your submission was received." [that an update works the same way is [I]].
"Any changes that you make to your app listing are subject to review", so nothing changes live until Shopify
approves, and a sitting that stops early changes nothing [I].

1. **Live date.** Once it shows, an agent opens the public listing logged out, checks that the deletions, the new
   #1 and the funding text show and that Data access no longer lists phone or address, and writes
   `live: YYYY-MM-DD` on #162. The ads' day-0 check and the 30 days below run from that date.
2. **Live plus 30 days.** Look once at LetsMetrix and PickYourApp, which copy listings. If either still shows the
   old text, ask each once for one factual correction, on the owner's word (`…/wf10/status.md` C7).

## 6. Optional, the owner's: the "before" AI check (about 5 minutes)

Once the edit shows live, assistants read the new listing, and what they said about the old one can't be asked
again. Before the agent starts (category tags may show without review [U]), the owner asks each question once on
ChatGPT and once on Google AI Mode (google.co.uk), each in a new private window, logged out: 4 runs.
- Q1: `What is RewardsPro?`
- Q2: `How much does the RewardsPro Shopify app cost, and what does it do?`

Agents don't run chat assistants. Paste each full answer and its links into one CSV in the private research folder,
never in git. Its first line is `…/wf6/ai-rec.md` §5.4's column list · 185 characters
```text
month,date_utc,surface,mode,question_id,run,searched,rewardspro_named,rank_among_apps,apps_named,facts_correct,stale_codes,cited_urls,ours_cited,ad_shown,ad_advertiser,notes,answer_text
```

## 7. Not in this sitting

- The two limits App details can't carry with Shopify's links, "Shopify doesn't let store credit pay subscription
  renewals." and "There is no setting to exclude products, collections or sales channels.", go on `/help/` (#211),
  which later becomes the listing's FAQ link. Why: App details keeps "links … in their designated fields" (§5 B5),
  and MESSAGING §4 puts them there.
- S2's full texts (`social/entity-card.md` §3) need re-checking against #187 before use.
- PITR and the EU representative are on the board (Now-4), not here.
- This sheet replaces the listing section of draft PR #131 (3 Nov), which was written for the old app.

---

## 8. Reference: Shopify's words, and the count check

Pages: [best practices](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices),
[App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements),
[protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data),
[create ads](https://shopify.dev/docs/apps/launch/marketing/advertising/create-ads),
[app listing categories](https://shopify.dev/docs/apps/launch/app-store-review/app-listing-categories),
[review process](https://shopify.dev/docs/apps/launch/app-store-review/review-process),
[submit for review](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review), all read and
matched word for word on 10 Nov 2026; and [store credit](https://help.shopify.com/en/manual/customers/store-credit),
read 10 Nov 2026 at 11:28 UTC. Each was fetched once with a generic browser User-Agent.

| Field or rule | Shopify's words | Where |
|---|---|---|
| App name | "Use 30 characters or fewer, which is the maximum length that an app name can be." | Best practices §5 A1 |
| App introduction | "Your app introduction (100 characters) should clearly highlight the benefits merchants can expect." | §5 B4 |
| App details | "In your app details (500 characters), describe functional elements and what makes your app unique. Avoid excessive marketing language, keyword stuffing, and outcome guarantees. Keep support info, links, and testimonials in their designated fields." | §5 B5 |
| Features | "Keep features short and scannable (up to 80 characters per feature)" | §5 B6 |
| Screenshots | "Screenshots should be 1600px by 900px (16:9). Include 3-6 desktop screenshots, including at least one of your app's UI. Ensure images are clear and focused on your app's functionality. Crop out browser chrome and sensitive information. Provide alt text, avoid PII, and don't include pricing, reviews, or outcome guarantees." | §5 B3 |
| Images | "Screenshots should not include desktop backgrounds or browser windows. Feature images and screenshots that solely contain your app logo are not permitted." | Requirement 4.4.4 |
| Pricing | "Choose your primary billing method (Free to install, Recurring charge, or One-time payment) and provide clear pricing information in the designated section only." The example lists "A description of any additional charges for this plan." | §5 C |
| Pricing, nowhere else | "Do not include pricing information in undesignated areas like your app logo, to prevent merchant confusion. Keep this information in Pricing details." | Requirement 4.2.3 |
| Factual only | "Your app and app listing should only include factual information." | Requirement 1.1.4 |
| Tags | "Your tags should accurately reflect the primary function(s) of your app." | Requirement 4.3.5 |
| Category details | "These details can be updated at any time and don't require an appeal for review." | App listing categories |
| Subtitle | "Don't add keywords to your subtitle with the intent of improving search performance." | Requirement 4.4.1 |
| Search terms | "For search terms, enter up to five relevant terms using complete words (not partial) and limit to one idea per term" | §5 E |
| Translations | "Adding your own translated listing for an automatically translated language overwrites and disables automatic translation for that language." "To delete a custom translation (which re-enables automation), use More actions > Delete listing." | §5 D |
| Online store | "If your app embeds features in a merchant's Online Store, then select "Merchant must have online store" under the Sales channel requirements section of your app listing form." | Requirement 4.3.1 |
| Screencast | "Include a screencast to demonstrate your app's onboarding and features as described in its listing." | Requirement 4.5.3 |
| Ads | "The appearance of your ad is based on information in the associated app listing, and can't be customized." "Any changes that you make to your app listing are subject to review." | Create ads |
| Protected data, timing | "Applying for protected customer data isn't possible while the app is under review." | Submit for review |
| Protected data, rule | "Shopify will approve your app to use protected customer data if the requested data is the minimum amount required by your app to provide the merchant with the app functionality." | Protected customer data |
| Automated checks | "These checks must be run and completed successfully to ensure functionality and reduce your app's time spent in review." | Submit for review |

Field limits not stated on these pages (subtitle, SEO title, meta description, alt text, reasons, the pricing text,
how many features and screenshots the form requires): the form's own counter decides [U].

**Count check.** From the repo root; every line should read "ok" (26 when this was committed):
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
Arithmetic: 497 − 38 (", and you can sell a tier as a product") − 101 (the widget sentence and the space before
it) = 358; 358 + 1 + 68 = 427.
