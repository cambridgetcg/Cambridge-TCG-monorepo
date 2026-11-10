# RewardsPro shot list: screenshots of the rebuilt app

Agents' proposal for the owner, 2026-11-07 (maker "shots"). **Nothing has been captured.** Nothing was posted,
logged in to, changed in Shopify, committed or deployed. The owner captures every frame himself, because agents hold
no logins and can't click inside the embedded admin's cross-origin frame (`docs/staging-run.md:14`).

Labels, as in [STRATEGY.md](STRATEGY.md): **[V]** verified (file:line or URL plus date), **[I]** inferred,
**[U]** unknown, **PROPOSAL** a choice for the owner. Code paths are in the read-only checkout of origin/main
6f3a57b6, relative to `apps/rewards/` unless marked.

**Social use of every frame here waits for S2** (STRATEGY §2). The only exception is the S1 frames,
which go to the App Store listing only, to replace false images, once their preconditions in §5 hold.

---

## Summary

1. **Two sets.** S1 is two frames that need no orders: Home "Set up cashback" and Tiers, plus an empty Orders page only if the listing form needs a third. The owner can capture them now. They replace all three of the listing's old screenshots, which show the old app. They bring two claims the live listing doesn't make (`rp-setup-steps`, `rp-cashback-base`), so §5 sets preconditions before upload. The G0 set is 8 shots plus evidence frames and 3 recordings (the third as two clips), captured in the G0 sitting (STRATEGY §13 step 13), with a small test dataset that covers all 5 admin pages and the widget.
2. **Test orders earn nothing.** An order Shopify flags as a test (the test payment gateway) is recorded with no cashback (`app/lib/record-order.server.ts:66`). Every dataset order is a draft order marked as paid, as the runbook does (`docs/switch.md:177`).
3. **PROPOSAL: a fresh development store.** It has clean data, shows the first-open setup card, and proves what a new install from the listing gets. rewardsprotesting (STRATEGY §7 A10) holds imported old test customers whose names we haven't seen, and its setup card has probably closed for good.
4. **Every frame is real, cropped and scaled only.** No painting out, no blurring and no added captions on social. If something mustn't show, the owner changes the setup and captures again.
5. **Screenshots double as claim evidence.** The claims map (§9) says which claim ids each frame supports, and what a frame can't prove alone. UI text is not proof of behaviour.

---

## 1. When, where and who

| Set | When | Store | Use | Who |
|---|---|---|---|---|
| **S1** (2 frames, a third only if the form needs it) | Now, before the owner edits the listing (STRATEGY §13 step 9), in the order §5 sets | PROPOSAL: a new development store, "Test Store" (see below), or rewardsprotesting | App Store listing only. Never social. | The owner captures; agents crop, scale and check |
| **G0 set** (8 shots, evidence frames, 3 recordings, the third as two clips) | The G0 sitting (STRATEGY §13 step 13), after B3 is recorded | The same store | Listing (S2 step 15), rewardspro.io, LinkedIn from S2 | The owner sets up, places the orders and captures; agents crop, scale and check; the claims maker records the evidence |

**The store (the owner's word, D-shots-1).**
- **Option A (PROPOSAL, recommended): a new development store**, created by the owner in the Partner or Dev Dashboard (no fee stated to us [I]), with RewardsPro installed from https://apps.shopify.com/rewards-pro.
  - Its data is only the dataset below. Create it empty: no generated test data, sample products or sample customers [I: the store-creation flow can offer them]. Generated customers and orders would appear on Home, Customers and Orders.
  - Home shows "Set up cashback" on first open (`app/routes/app._index.tsx:363`). The card closes for good once every step has been done once (`app/admin/home-rules.ts:94-103`).
  - A fresh install from the listing shows what a new store really gets. That is evidence for `rp-live-release`, together with the B3 release record (§9).
  - The dev store's name shows in the storefront header. Name it "Test Store", so it says what it is.
- **Option B: rewardsprotesting** (STRATEGY §7 A10; gate C's store in `docs/switch.md:208-214`).
  - Opening the app there ran the past-orders import (`docs/switch.md:160`): 12 months if `read_all_orders` is granted, otherwise 60 days (`docs/switch.md:171`) [U: which, for production, is STRATEGY §15's open question]. Its buyers appear by name on Home's Recent rewards, Customers and Orders (the Tiers page shows only member counts, `app/routes/app.tiers.tsx:298-326`). We haven't seen those names [U]. The old listing screenshot came from that store's era and showed a gmail test address.
  - The setup card has probably closed for good (base rate and cashback set at B2 step 6, embed on from the old app [I]).
  - With Option B, gate C still runs there as the runbook says. With Option A, gate C's evidence frames (EV-6) can also come from rewardsprotesting.

---

## 2. Setting up the test store (the owner's hand, about 20 minutes)

Every step is a change in Shopify on a development store, so the owner does it. Agents can supply plain product
images if wanted.

**Store settings**
- Currency GBP. Settings → Taxes and duties: prices include tax. The A7 card says "prices including VAT", and staging used the same (`docs/staging-run.md:8`).
- New customer accounts on, sign-in links shown, store credit on. Otherwise Home shows "Buyers can't spend their store credit yet: …" (`app/admin/home-rules.ts:183-214`).
- Storefront: the default theme. Hide the dynamic checkout buttons (Shop Pay, "Buy it now") in the product section's settings where the theme offers that [I: the setting's name varies by theme].

**Products.** Three products, with no image or a plain one-colour image. Never card art, licensed characters or photos of real stock.

| Product | Price |
|---|---|
| Example item A | £300.00 |
| Example item B | £150.00 |
| Example item C | £250.00 |

**Customers** (Shopify → Customers → Add customer, never captured; email marketing left unsubscribed; no invite sent; no address, phone or note, so Shopify's order and customer pages show none)

| Name | Email | Why |
|---|---|---|
| Alex Example | alex@example.com | The video's order, the order panel, the refund |
| Priya Example | priya@example.com | Crosses two tiers (Everyone → Silver → Gold) |
| Sam Example | **a non-public alias the owner can read** (see note) | The signed-in widget and the customer panel |

*Note on Sam.* New customer accounts sign in with a one-time code sent by email [I], and @example.com
can't receive mail. So the one storefront buyer needs an inbox the owner can read. It should be a business alias, never a personal or gmail address. Example: a plus-alias of the contact mailbox, such as contact+test-sam@rewardspro.io, once STRATEGY §13 step 10 shows contact@ delivers [I: Workspace delivers plus-addresses to the base mailbox].

The alias must appear in **no frame**:
- The widget shows no email; proxy answers carry no email or name (`docs/staging-run.md:21`).
- The admin shows first and last names only (`app/shopify/names.server.ts:4-12, 31-38`).
- Never capture Sam's Shopify customer page or the storefront account page.

**Tiers** (in RewardsPro)
1. On Home, type 5 into "Your base cashback rate" and press Save. This creates the tier "Everyone" with minimum spend £0 (`app/lib/tiers.server.ts:33, 353`).
2. On Tiers, add "Silver" with minimum spend £250 at 7%, and "Gold" with minimum spend £500 at 10%.
3. Leave "Spend counted over" at "Last 12 months", the default (`prisma/schema.prisma:147`).
4. Switch cashback on (Home).
5. Turn the widget on in the theme editor: App embeds → "RewardsPro Widget" (`extensions/rewards-widget/blocks/membership_widget.liquid:49`). Colours: Light (the default, `:80-87`).

**The dataset: four orders and one refund**, in this order. Each one is Orders → Create order → add the customer and products → Collect payment → Mark as paid. Don't send an invoice, and **fulfil nothing** until every capture is done (`rp-paid-trigger` needs "Paid, Unfulfilled").

| # | Customer | Lines | Discount | Shipping | Total | Expected cashback [I] | Tier after [I] |
|---|---|---|---|---|---|---|---|
| O1 | Alex | 2 × Example item A | −£60.00 (order discount) | £10.00 | £550.00 | £27.00 at 5% (base £540, as staging check B, `docs/staging-run.md:23`) | Gold (spend £540) |
| O2 | Sam | 1 × Example item B | — | £5.00 | £155.00 | £7.50 at 5% | Everyone (spend £150) |
| O3 | Priya | 1 × Example item A | — | £5.00 | £305.00 | £15.00 at 5% | Silver (spend £300) |
| O4 | Priya | 1 × Example item C | — | £5.00 | £255.00 | £17.50 at Silver's 7% | Gold (spend £550) |
| R1 | Alex, on O1 | Refund 1 × Example item A; don't refund shipping | | | refund £270.00 [I] | takes back £13.50 [I] | Silver (spend £270) |

*Expected end state [I], from the rules in code, not observed in production:*
- Alex: Silver at 7%, spend £270.00, "£230.00 more to reach Gold", store credit £13.50.
- Sam: Everyone at 5%, spend £150.00, "£100.00 more to reach Silver (7%)", store credit £7.50.
- Priya: Gold at 10%, spend £550.00, "In the top tier.", store credit £32.50.
- Tiers: 1 member each.

These come from:
- tier spend as product value minus refunds (`app/lib/tiers.server.ts:1-9`);
- a tier resolved at once after a paid order and after a refund (`app/routes/webhooks.orders.paid.tsx:62`, `webhooks.orders.refunded.tsx:102`);
- a new buyer starting in the lowest tier (`tiers.server.ts:12`);
- staging check E's half-of-two-items take-back (`docs/staging-run.md:26`).

**If a screen shows other numbers, stop and tell the agents.** It's a finding, not a reason to retake. The
frame then shows what the app really did.

*Optional, last (it changes Sam's numbers):* O5, Sam signed in on the storefront, spending store credit at
checkout with a manual payment method, then marked as paid. It shows "Paid with store credit" on the order
panel and Home's "Store credit spent at checkout" (staging check D, `docs/staging-run.md:25`). Do it only
after every widget capture.

---

## 3. How to capture

**Stills of the admin (the app's frame only).**
1. Chrome at 100% zoom. DevTools → device toolbar → Responsive, DPR 2. Set the viewport so the app's frame is exactly 1600×900 CSS px. Read the frame's offset in Elements (the RewardsPro `iframe`'s box), then set the viewport to that offset plus 1600 × 900.
2. Capture the viewport ("Capture screenshot") and note the iframe's rectangle. Agents crop exactly that rectangle with sharp, giving the **master at 3200×1800**. "Capture node screenshot" on the iframe may do this in one step [I, not tested].
3. **[U]** We don't know whether the page heading and its header buttons (Export CSV on Customers, "Open the buyer in Shopify" on a customer's page) draw inside the app's frame or in Shopify's title bar. ("All orders" is not one: it is Recent rewards' own section action, `app/routes/app._index.tsx:470`.) The title bar probably shows the app name "Rewards Pro" [I: from the local `shopify.app.toml:10`, not observed in the admin; whether a release carries it depends on B3, which isn't recorded]. Until the name reads "RewardsPro" in a deployed release, crop below it. If the heading sits in the title bar, the frame loses it; that is acceptable.

**Storefront stills.**
- Use a private window, signed out of the Shopify admin, so Shopify's preview bar never shows. Enter the storefront password once.
- If a cookie or privacy banner appears, answer it before capturing [I].
- **Phone:** device toolbar 390×844 at DPR 3 (an iPhone preset of that size), giving a **master of 1170×2532**.
- **Laptop:** 1600×900 at DPR 2, giving a 3200×1800 master.
- Tap the "Rewards" button to open the panel.

**Derived sizes.** Agents make these from each master by crop and scale only, always scaling down:

| Use | Size | From the master |
|---|---|---|
| App Store screenshot (ASSETS B2; shopify.dev best practices, read 2026-11-07: "Screenshots should be 1600px by 900px (16:9)") | 1600×900 PNG, or JPEG at quality 90 or more | whole master × 0.5 |
| LinkedIn post, 4:5 (STRATEGY A10) | 1080×1350 PNG | a 1440×1800 crop × 0.75 (admin), or a 1168×1460 crop × 0.92466 (phone; exactly 4:5, so it scales to 1080×1350 with no rounding) |
| Landscape post or site | 1200×675 PNG | whole master × 0.375, from landscape masters only (3200×1800). The phone master has no 16:9 derivative. |
| Milestone card top (A6 template) | the A6 maker's crop | from the master, never from a derivative |

**Never:** paint out, blur, retouch, re-type text, stitch two captures, add device frames, or add captions to
a social image. Changing the setup and capturing again is the only fix. Stills hide the cursor. There is no
exception in this plan; a side-by-side phone image would need the owner's explicit one (§11).

**Files.**
- Raw captures and masters go to `apps/rewardspro/marketing/social/private/shots/`. `private/` is git-ignored by `apps/rewardspro/marketing/.gitignore` [V].
- Only derivatives the checker has passed move to `apps/rewardspro/marketing/social/shots/`. PNGs are kept by `!*.png` in the same file [V]; they are committed only on the owner's word.
- Evidence frames (§7) stay in `private/` for good. Their sha256 goes into the claim's `sources`.
- Names follow STRATEGY §7: `rewardspro_<campaign>_<asset>_<variant>_<WxH>_<yyyymmdd>_v<NN>.<ext>`, for example `rewardspro_g0_shot06-order_listing_1600x900_20261120_v01.png`. Campaigns are `s1` and `g0`. Variants are `master`, `listing`, `post4x5`, `land16x9`, `light`, `dark`, `signedin`, `guest`.
- Each file has a sidecar `<file>.meta.json` (ASSETS D3). `shots/` is not git-ignored and the monorepo is public (STRATEGY §3, GitHub row), so a committed sidecar names roles, never people, and carries no session ids. The full sidecar, with the checker's session id, stays in `private/`. Example of the committed form:

```json
{
  "asset": "rewardspro_g0_shot06-order_listing_1600x900_20261120_v01.png",
  "derived_from": { "file": "rewardspro_g0_shot06-order_master_3200x1800_20261120_v01.png", "sha256": "<hex>", "crop": [0, 0, 3200, 1800], "scale": 0.5 },
  "captured": { "at": "2026-11-20T14:05:00Z", "by": "owner", "tool": "Chrome <version>, DevTools device toolbar", "viewport": "1600x900", "dpr": 2 },
  "store": { "kind": "development store", "data": "test data only (dataset in shot-list.md section 2)" },
  "app_release": "<B3 release name and date>",
  "ai_involvement": "none",
  "licence": "our own screenshot",
  "claims_shown": ["rp-cashback-base", "rp-store-credit", "rp-refund-takeback"],
  "alt_text": "<as checked>",
  "checker": { "role": "checker", "result": "<pass|look|block>", "date": "<yyyy-mm-dd>" }
}
```

**The checker** (a different session from this maker) opens every master at 200% and reads every line
against §4 before any derivative is made.

---

## 4. What must never appear (every frame)

1. **Any email address except the @example.com test buyers and the published support address contact@rewardspro.io** (which the app itself prints on Settings, `app/routes/app.settings._index.tsx:16, 67`). Never Sam's alias or any other rewardspro.io alias.
2. **Real people's names, or the owner's name, initials or avatar.** The admin account menu sits in the top bar, which is cropped. Inside the content area, Shopify's order, draft-order and customer pages have a Timeline and comment box: Shopify shows a staff profile photo beside comments ("You can add a custom photo to your profile so that it displays next to your comments", help.shopify.com/en/manual/shopify-admin/productivity-tools/timeline, read 2026-11-07), and the Timeline may name the staff account on events [I]. So no Timeline, comment box, staff avatar, initials or staff name in any frame. No Shopify Customers index, customer search or draft-order customer picker either: they list every customer, Sam's alias included. No personal details of anyone.
3. **Real shop names or domains:** the store's `.myshopify.com` address, "rewardsprotesting", "cashbackpro", or Cambridge TCG's shops.
4. **Browser chrome, tabs, bookmarks, the address bar, the macOS menu bar or Dock, notifications or a desktop background.** shopify.dev requirement 4.4.4 (read 2026-11-07): "Screenshots should not include desktop backgrounds or browser windows." Best practices: "Crop out browser chrome and sensitive information."
5. **Shopify trademarks:** the Shopify logo or wordmark (admin top bar), Shop Pay buttons, "Powered by Shopify", the storefront preview bar, the Sidekick icon. Requirement 4.4.3: "Do not use our trademarks in your app icon, banner, or screenshots." For social, STRATEGY §7 says the same.
6. **The admin name "Rewards Pro"** (title bar, sidebar, the app embed list, and any Shopify page that may name the app, such as a customer's store-credit history or the Timeline [I]), until `shopify.app.toml:10` reads "RewardsPro" in a released version. On a Shopify customer page, keep only the store credit balance in frame.
7. **Other apps** in the sidebar, theme editor or storefront (Shopify Inbox's chat button included).
8. **Card art, licensed characters, third-party logos, or photos of real stock.**
9. **Prices of RewardsPro, "Free", ratings, reviews, or review prompts.** Requirements 4.2.2 and 4.3.6. That includes the Home section "A review helps other merchants find RewardsPro." (`app/routes/app._index.tsx:511-525`) and Shopify's review dialog.
10. **States that aren't the point of the frame:** "Test order", "Needs a look", the customer-data banner, errors, "Shopify didn't answer", "Store credit: Shopify didn't say", the import line.
11. **Dollar amounts, and anything from the old app** (points, raffles, tier products).

*The review ask, and the order of Home captures.* The ask is due once the store has 3 cashback entries and
at least 7 days have passed since the app's first open on this store (the merchant record's creation,
`app/lib/stats.server.ts:238-244`; under Option A that first open is the S1 capture). While due, every Home
load shows the review section and the app asks Shopify to show its review dialog by itself
(`app/routes/app._index.tsx:265-277`). The ask ends for good once the card is dismissed, or once Shopify
answers that it showed the dialog (`app/admin/home-rules.ts:43-44`), so Shopify's dialog may close the ask on
its own. Opening the app from Shopify's sidebar lands on Home [I]. So:
- **If the G0 sitting is 7 or more days after the first open:** the first app open after O3 (the third cashback entry) is EV-7. Capture the card, and Shopify's dialog if it opens, before any other Home capture. Close the dialog without reviewing, then Dismiss the card. After that, SH-2 shows no review section.
- **If the sitting is within 7 days of the first open:** capture SH-2 in the sitting. EV-7 is then the first app open after day 7, before anything else that day.

Nobody at Cambridge TCG reviews RewardsPro: that breaks App Store rule 1.3 and the honest-by-design promise.

---

## 5. S1: frames for the listing, now

**What S1 replaces.** All three of today's screenshots show the old app, so all three come out at S1:
#1 (old orders, a gmail address), #2 (the old "Loyalty Tiers" page) and #3 (tier products, a removed feature).
#2 is false too: each tier carries its own "Annual" duration (the listing image, fetched 2026-11-07), and the
rebuild has one "Spend counted over" setting for the whole store (`app/routes/app.tiers.tsx:411-432`), so a
new install no longer gets that page. Keeping it would also put two Tiers views beside S1-B (requirement 4.4.5:
"Screenshots should showcase different features, views, or states of your app").

**How many.** Shopify's best practices recommend "3-6 desktop screenshots" (read 2026-11-07). That is a
recommendation, not the form's rule: whether the form enforces a minimum is still [U] (STRATEGY §15). S1 is
two frames, S1-A and S1-B. S1-C is captured too, and uploaded only if the form refuses two.

**What S1 adds to the listing.** The S1 frames need no orders, but they are not claim-free. Against the live
listing text (fetched 2026-11-07: tiers by spend over 12 months or all time, store credit when an order is
paid, the widget), they add two rows that are still `proposed` in `claims.toml`:
- `rp-setup-steps` (S1-A's "Set up cashback" card);
- `rp-cashback-base` (S1-B's sentence "Cashback is paid on the product price after discounts. Shipping, and anything paid with store credit or gift cards, earns nothing.", `app/routes/app.tiers.tsx:354-357`). Its gift-card part rests on code only (`app/lib/order-facts.ts`); no gift-card order has been run (`docs/staging-run.md:36-44`).

**Preconditions before any S1 upload** (the owner's word, D-shots-2):
1. Either the claims maker verifies `rp-setup-steps` and `rp-cashback-base` from code and staging (and decides whether the gift-card part needs an observed order first), or the owner records, through the checker in `approvals.jsonl`, that real-UI listing frames may carry the app's own sentences while those rows are still `proposed`.
2. The 4.3.4 reading (§11) for frames with figures: S1-A shows £0.00 tiles, S1-B rates and minimum spends.
3. The checker passes each frame against §4.

**Order.** First the §2 store settings (without them, Home shows "Buyers can't spend their store credit
yet: …", `app/admin/home-rules.ts:207-213`). Then S1-A, on the first open, before any RewardsPro setting.
Then S1-C if needed, at any point before the first order. Then §2's Tiers steps 1–2 (the base rate and
Silver and Gold), and S1-B.

### S1-A Home: "Set up cashback"
- **Purpose:** what a merchant sees first.
- **Claim:** `rp-setup-steps`.
- **State:** the first open, before anything is saved. The card shows:
  - "Your base cashback rate" with Save;
  - "Switch cashback on";
  - "Turn on the widget in your theme".

  Also in frame at 1600 px [I: from the layout code, `app/routes/app._index.tsx:66, 530-561`]: the side column's Running card (switch "Cashback", off; "Off: orders still count toward tiers but earn no cashback.", `app/admin/home-rules.ts:49`; its three checks) and Tiers card ("No tiers yet. …"), and "This month" with £0.00 tiles and the empty chart ("No cashback given or store credit spent in the last 30 days."). The checker reads these lines too; none of them is a ledger claim we use.

  The info banner "The rewards widget is off in your theme." may show above the card [I]: it shows only when Shopify reports the embed present and not active, and nothing shows when no activation is found (`app/admin/home-rules.ts:31-40, 226`). Either state is real, so the checker accepts whichever shows. Dismiss the import line ("Done: there were no past orders to bring in.") first, if it shows.
- **Evidence bonus:** while the import runs, the card says "Bringing in your last 12 months of orders…" or "…last 60 days…" (`app/routes/app._index.tsx:304, 414`). That answers the open question about `read_all_orders` for this install. If it shows, capture it once as EV-0b (evidence only).
- **Must not appear (extra):** the title bar.
- **Listing alt (PROPOSAL):** "RewardsPro's Home page on first open in a test store. A card headed Set up cashback lists: Your base cashback rate, Switch cashback on, Turn on the widget in your theme."

### S1-B Tiers
- **Purpose:** tiers by spend, each with its own rate.
- **Claims:** `rp-vip-tiers`, `rp-cashback-base` (the page's own sentence, `app/routes/app.tiers.tsx:354-357`), and `rp-tier-window` only if the "Spend counted over" section is in frame.
- **State:**
  - Everyone 5% (£0, "Everyone starts here"), Silver 7% from £250, Gold 10% from £500.
  - "0 members" is fine.
  - The "Spend counted over" section comes after the table, the sentence and the whole "Add a tier" form (`app/routes/app.tiers.tsx:293-359, 361-409, 411-432`), so at 1600×900 it is probably below the fold [I]. If it isn't in frame, the frame claims no window. A second frame scrolled to it is evidence only, not a listing image (4.4.5).
- **Listing alt template (PROPOSAL; the checker fills it from the captured frame):** "RewardsPro's Tiers page in a test store: a table of tiers, [Everyone at 5% from £0, Silver at 7% from £250, Gold at 10% from £500], and the page's note on what earns cashback[; below it, Spend counted over set to Last 12 months]." The bracketed last part goes in only if the section is in frame.

### S1-C Orders, empty (only if the form refuses two)
- **Purpose:** a third, distinct view that carries no row still held. It replaces the Settings frame planned before: that one shows "RewardsPro sends no email.", the negative claim `rp-no-own-email`, which may not go in the listing (its channels have no "listing", it is `proposed`, and its guard test doesn't exist; STRATEGY §6 allows C4 only at S2 "with its guard test"). Settings is now SH-7, at S2.
- **State:** the Orders page before any order: "No orders yet. They appear here after a buyer's first paid order." (`app/routes/app.orders._index.tsx:75`). The empty-state sentence is app text, not a ledger claim [I].
- **Listing alt (PROPOSAL):** "RewardsPro's Orders page in a new test store, before any order."

---

## 6. The G0 set: 8 shots

Each shot below has a master plus the 1600×900, 1080×1350 and 1200×675 derivatives (§3); the phone
masters (SH-8a, SH-8b) have only the 1080×1350 crop. Alt texts are
**templates**: the checker fills the bracketed values from the captured image, never from this plan.
Social alt texts stay under 1,000 characters (STRATEGY §7).

### SH-1 Home: "Set up cashback"
The S1-A frame. Reuse it if the app's Home hasn't changed since. Otherwise capture it again on a new store's first open.
- **Claims:** `rp-setup-steps`.
- **Social crop (4:5):** the setup card.

### SH-2 Home, running
- **Purpose:** the app at work on one page.
- **Claims:** `rp-store-credit`, `rp-refund-takeback` (a "Taken back" row in Recent rewards), `rp-vip-tiers` (tier chips).
- **State:** after R1, scrolled to the top, after the review ask has ended (§4). On the page:
  - the main column: "This month" (Cashback given, Store credit spent at checkout, Came back) and Recent rewards rows with order, buyer, tier chip, status and amount (`app/routes/app._index.tsx:447-509`);
  - the side column (`app/routes/app._index.tsx:530-561`): the Running card, which shows a switch labelled "Cashback" (on), the sentence "On: every paid order earns cashback as store credit." (`app/admin/home-rules.ts:49`, rendered at `app._index.tsx:534`) and the checks "Store credit can be spent", "Widget is on", "Tiers are set"; and the Tiers card with "1 member" on each tier (`app._index.tsx:556`).
- **Must not appear (extra):** the review section; any banner; **the Running sentence "On: every paid order earns cashback as store credit."** The claims ledger marks it an overclaim and bans it from marketing, because guest and test orders don't earn (`claims.toml` rp-paid-trigger).
- **The listing frame (PROPOSAL, D-shots-3):** either an app-copy fix to that sentence is released before G0 (an agent PR that the owner merges; a merge deploys production), and the frame is the whole 1600×900 page; or the listing derivative is a 16:9 crop of the main column only, scaled down to 1600×900. That crop needs the main column to be at least 1600 device px wide in the 3200×1800 master [I: not measured; the side column sits beside the main one from 784 px, `app._index.tsx:66`]. If neither works, SH-1 takes SH-2's listing slot.
- **Social crop (4:5):** Recent rewards (main column only, so the Running card is out).
- **Figures:** under the one 4.3.4 reading (§11), with every other frame that shows amounts.
- **Alt template:** "RewardsPro's Home page in a test store: this month's cashback given [£x] and store credit spent [£y]; recent rewards for three test customers, including [£13.50] taken back for a refund."

### SH-3 Tiers
As S1-B, now with "1 member" on each tier.
- **Claims:** `rp-vip-tiers`, `rp-cashback-base` (the sentence), and `rp-tier-window` only if the "Spend counted over" section is in frame (see S1-B).
- **Social crop (4:5):** the table with the sentence under it.
- **Alt template:** as S1-B, filled from this frame ("1 member" each).

### SH-4 Customer panel (RewardsPro → Customers → Sam Example; the app's own page, never Shopify's Customers list)
- **Purpose:** one customer's tier, progress, lock control and store credit.
- **Claims:** `rp-vip-tiers`, `rp-tier-window`, `rp-tier-lock` (the control only; EV-4 shows it working), `rp-store-credit`.
- **State:** Sam, unlocked (`app/routes/app.customers.$id.tsx:124-205`):
  - the tier chip "Everyone 5%" with "In this tier since [date]";
  - "Spend counted (last 12 months): £150.00";
  - the progress bar with "£100.00 more to reach Silver (7%)";
  - "Lock to a tier" with Lock;
  - Store credit "£7.50, As Shopify holds it now, from any source.";
  - Cashback history.
- **Must not appear (extra):** "Open the buyer in Shopify" if it draws in the title bar.
- **The word "Shopify":** the frame shows "As Shopify holds it now" (`app/routes/app.customers.$id.tsx:202`), and perhaps "Open the buyer in Shopify" (`app/admin/words.ts:21`). It is a listing frame only once the 4.4.3 reading (§11) allows it.
- **Social crop (4:5):** the Tier and Store credit sections.
- **Alt template:** "A test customer's page in RewardsPro: tier Everyone at 5%, spend over the last 12 months £150.00, £100.00 more to reach Silver at 7%, a Lock to a tier control, and £7.50 of Shopify store credit."

### SH-5 Orders list
- **Purpose:** every paid order with its cashback and status.
- **Claims:** `rp-store-credit`, `rp-vip-tiers` (O4 earned at Silver's 7% after O3 moved Priya up).
- **State:** All orders, newest first. Four rows with columns Order, Buyer, Tier, Total, Cashback and Status (`app/routes/app.orders._index.tsx:100-127`). The Show filter reads "All orders".
- **Social crop (4:5):** not used (a table reads badly at 4:5). 16:9 only.
- **Alt template:** "RewardsPro's Orders page in a test store: four paid orders, each with its test customer, the tier it earned at, total, cashback and status."

### SH-6 Order panel (Orders → O1, after R1)
- **Purpose:** the cashback maths and a refund taking back its share, on one order. It is also the A7 rule card's source.
- **Claims:** `rp-cashback-base`, `rp-store-credit`, `rp-refund-takeback`.
- **State** (`app/routes/app.orders.$id.tsx:210-299`):
  - the Order section: Buyer Alex Example, Total £550.00, "Products after discounts: £540.00", "Earns cashback on: £540.00";
  - "Cashback and take-backs": Cashback £27.00 Everyone 5% Issued, then "Taken back for a refund" −£13.50 Taken back;
  - Refunds: Products returned £270.00, Cashback taken back £13.50.
- **Social crop (4:5):** the Order section and the take-back table.
- **Alt template:** "A test order in RewardsPro: £550.00 total with £540.00 of products after discounts, so cashback is worked out on £540.00. £27.00 at 5% was issued, and a refund of one item took back £13.50."

### SH-7 Settings
Captured in the G0 sitting before the switch is ever touched, so it shows the default (off).
- **Purpose:** what the app does and doesn't send.
- **Claims:** `rp-no-own-email`, as the app's own words only (`app/routes/app.settings._index.tsx:48-51`). The negative part also needs its guard test (STRATEGY §6.3). The help address in frame also needs `rp-contact-delivers` (STRATEGY §13 step 10).
- **State:**
  - "Email buyers when they earn store credit", **off**, as a fresh store starts (`prisma/schema.prisma:148`), with "Shopify sends this email itself. RewardsPro sends no email.";
  - "Customer data requests";
  - "Email us at contact@rewardspro.io".
- **Use:** rewardspro.io and C4 (STRATEGY §6.2), at S2, once `rp-no-own-email` is verified with its guard test. Not the listing: the row's channels have no "listing". It could go there only if the claims maker adds "listing" and the 4.4.3 reading (§11) allows "Shopify sends this email itself.".
- **Alt template:** "RewardsPro's Settings page: a switch, [off], for Shopify to email buyers when they earn store credit, with the app's note that Shopify sends the email and RewardsPro sends none; customer data requests; and the help address."

### SH-8 The storefront widget (after B3 is recorded; social only once `rp-widget` is verified)
- **Purpose:** what customers see.
- **Claims:** `rp-widget`; with the B3 record, `rp-live-release` (§9).
- **Page:** the "All products" collection, with Example items A–C and their prices. Use no product page here: the product page is gate C's (EV-6).
- **Panel text** is the widget's own (`extensions/rewards-widget/locales/en.default.json:2-15`).
- **Variants** (8a and 8b are each captured in Light and in Dark; Colours is set in the theme editor, `membership_widget.liquid:80-87`, and saved between them):

| Variant | Viewport | State | Panel shows (expected) |
|---|---|---|---|
| **8a signed in** | 390×844, DPR 3 | Sam signed in, panel open | "Your tier", "Everyone", "5% back as store credit", "Your store credit £7.50", "£100.00 more to reach Silver", the bar, "Sign in and choose Apply store credit at checkout" (new accounts only, `rewards-widget.js:153-155`); the button reads "Rewards £7.50" |
| **8b guest** | 390×844, DPR 3 | Signed out, panel open | "Sign in to see your rewards", "Earn 5% back as store credit", "Sign in" (`rewards-widget.js:163-177`) |
| **8c listing and site** | 1600×900, DPR 2 | As 8a, Light | as 8a |

- **No side-by-side phone frame.** The earlier 8d (8a and 8b placed side by side on a white ground) is dropped: it stitches two captures, which §3 forbids. shopify.dev best practices say "If your app is mobile-responsive or works with POS, include screenshots showing those experiences" (read 2026-11-07), so a phone image in the listing stays an open choice for the owner (§11).
- **Must not appear (extra):** Sam's alias, the account menu, the cookie banner, a chat button, Shop Pay, "Powered by Shopify", or any other "Shopify" the theme prints (the 4.4.3 reading, §11).
- **Social crop (4:5):** the open panel with the launcher, from 8a or 8b.
- **Alt templates:**
  - 8a: "A test store's product list on a phone, with the RewardsPro widget open for a signed-in customer: tier Everyone, 5% back as store credit, £7.50 of store credit, and £100.00 more to reach Silver."
  - 8b: "The RewardsPro widget for a guest on a phone: Sign in to see your rewards, Earn 5% back as store credit, and a Sign in button."
  - Add "Dark colours." for the Dark variants.

**Time for the owner [I]:** about 20 minutes of setup, 10 for the orders, 25 for the stills and 15 for the
recordings: roughly 70 minutes, inside the 60–90 minute G0 sitting.

---

## 7. Evidence-only frames (never published)

These show Shopify's side of each claim. They are evidence, captured whole (Shopify's top bar, Timeline and
all, where a frame needs them), so they stay in `private/`. The only public Shopify-admin footage in this
plan is V1's content-area scenes, under the conditions in [video-walkthrough.md](video-walkthrough.md) §2 and
§10. The claims maker stores their sha256, date and locator in `claims.toml` `sources`.

| # | Frame | Claim ids | When |
|---|---|---|---|
| EV-0 | The install from https://apps.shopify.com/rewards-pro on the new store (the listing's Install, then the first open) | `rp-live-release` (with the B3 record) | first, Option A only |
| EV-0b | The import line "last 12 months" or "last 60 days" | the open question on `read_all_orders` (STRATEGY §15) | first open, if visible |
| EV-1 | O1 in Shopify reading Paid and **Unfulfilled**, and RewardsPro's panel for O1 reading Issued, in the same minute | `rp-paid-trigger`, `rp-shopify-deploy` | after O1 |
| EV-2 | Alex's Shopify customer page, store credit £27.00; again after R1 at £13.50 | `rp-store-credit`, `rp-refund-takeback`, `rp-shopify-deploy` | after O1, after R1 |
| EV-3 | Theme editor → App embeds → "RewardsPro Widget" on, with its Colours setting | `rp-setup-steps`, `rp-widget` | setup |
| EV-4 | Priya's panel after Lock to Gold: "Locked to Gold." and "Return to automatic", then after returning | `rp-tier-lock` | last; return her to automatic afterwards |
| EV-5 | Priya's panel "In the top tier."; Alex's panel at Silver after R1 | `rp-vip-tiers` (moves up and down) | after R1 |
| EV-6 | Gate C at 390 px, Light and Dark, signed in and guest, on a product page and with the cart drawer open: the launcher sits under the drawer, and every panel line reads | `rp-widget` (gate C, `docs/switch.md:214`) | with SH-8; on rewardsprotesting if the runbook's gate C needs that store |
| EV-7 | Home's review section once due (3 cashback entries, and 7 days after the app's first open on this store), and Shopify's dialog if it opens; then close the dialog and Dismiss | `rp-review-ask` | in the order §4 sets: the first app open after O3 if the sitting is 7+ days after the first open, otherwise the first app open after day 7. Never leave a review. Shopify's dialog may end the ask by itself, so the card may show for one load only. |
| EV-8 | Optional O5: the order panel's "Paid with store credit" line | `rp-cashback-base` (the store-credit part) | last |

---

## 8. Recordings

Three raw recordings in the same sitting, the third as two clips. [video-walkthrough.md](video-walkthrough.md) has the script and
specs.

| # | What | Becomes |
|---|---|---|
| REC-1 | Tiers; O1 marked as paid in Shopify (Paid, Unfulfilled); RewardsPro Orders → O1's panel; Alex's store credit in Shopify | V1 scenes 2–8 |
| REC-2 | R1 in Shopify; O1's panel with the take-back; Alex's store credit left | V1 scenes 9–11 |
| REC-3a | The widget at 390 px, Sam signed in: open and close | Raw material for a later video, only once `rp-widget` is verified. Not in V1. |
| REC-3b | The widget at 390 px as a guest: open and close | as REC-3a |

O1 and R1 are recorded as they happen, so REC-1 and REC-2 replace placing them separately. REC-3a and
REC-3b are two separate clips: recording stops while Sam signs in or out, because Shopify's sign-in, sign-out
and account pages can show his alias (§2). Every recording uses the pre-record steps in video-walkthrough.md
§2 (Focus on, no autofill or extension popups in the region).

---

## 9. Claims map: what each frame can and can't show

A frame shows what one test store's screen said on one date, with one release. It supports a behaviour claim
only beside Shopify's own record (the EV frames) and the code locator. UI wording on its own proves only that
the app says it.

| Claim id | Frames | What they show | What they don't prove alone |
|---|---|---|---|
| rp-live-release | EV-0, SH-8b | A new install from the listing gets the rebuild's admin and the new widget copy ("Sign in to see your rewards"; the old block's default was "Join our rewards program!", `rewards-widget.js:20`) | The release itself. That needs the B3 record (`docs/switch.md:203-215`). |
| rp-store-credit | SH-6, SH-4, EV-2 | RewardsPro says Issued; Shopify holds the credit on the customer | Other stores or currencies (gate N is open) |
| rp-paid-trigger | EV-1, REC-1 | Credit while the order is still unfulfilled | Timing. Never "instant" (STRATEGY §4 never-say 4). |
| rp-vip-tiers | SH-3, SH-5, EV-5 | Tiers by spend with their own rates; Priya moves up, Alex moves down after a refund | Large stores; the nightly pass |
| rp-tier-window | SH-3 (only if its section is in frame), SH-4 | The setting and its label | The window's maths (needs orders older than 12 months) |
| rp-cashback-base | SH-6, EV-8; the sentence on S1-B and SH-3 | £540 base from £600 − £60, with shipping excluded; store-credit tender (O5) | Tax-exclusive prices (not tested; don't mention them). Gift cards: no gift-card order is in the dataset or was run on staging (`docs/staging-run.md:36-44`), so that part rests on code. The claims maker decides whether a gift-card order is needed before the row is verified as worded. |
| rp-refund-takeback | SH-6, EV-2, REC-2 | £13.50 taken back from credit the buyer still held | A refund after the credit was spent (staging check F only) |
| rp-tier-lock | SH-4, EV-4 | The control, and a locked state | — |
| rp-setup-steps | S1-A/SH-1, EV-3 | The three steps, and the embed in the theme editor | — |
| rp-widget | SH-8a–c, EV-6 | Both states, Light and Dark, at 390 px | Lighthouse and speed (never claimed) |
| rp-no-own-email | SH-7 | The switch defaults to off, and the app's own sentence | That no email is ever sent. That needs the guard test. |
| rp-contact-delivers | SH-7 | The app prints the help address | That mail to it arrives (STRATEGY §13 step 10) |
| rp-review-ask | EV-7 | The ask and its Dismiss | "Nothing is offered" (code: `/usr/bin/grep incentiv` = 0) |
| rp-shopify-deploy (internal, G0) | EV-1, EV-2, REC-1, REC-2 | A production test order earned store credit and a refund took back its share, on a dated day | Everything else in B4 |

`rp-maker`, `rp-on-app-store`, `rp-free`, `rp-merchant-funds`, `rp-ai-drafted`, `rp-design-partner-offer`
and the `sh-*` rows have no frame. Their evidence is the listing, the code and Shopify's help pages.

---

## 10. Which frame goes where (PROPOSAL)

| Surface | Frames | Earliest |
|---|---|---|
| App Store listing, S1 | S1-A and S1-B, replacing all three old screenshots; S1-C only if the form refuses two | now, once the §5 preconditions hold |
| App Store listing, after G0 (3–6 recommended, best practices) | SH-2 (or SH-1: see SH-2's listing frame and the 4.3.4 reading), SH-3, SH-6, SH-4 (after the 4.4.3 reading), SH-8c | S2 step 15 |
| rewardspro.io (#130 rewrite) | the 1200×675 derivatives of SH-1, SH-3, SH-6, SH-7 (once `rp-no-own-email` is verified), SH-8c | when the owner deploys the rewrite |
| LinkedIn (M1, C1–C4 in STRATEGY §6.2) | the 1080×1350 derivatives: SH-6 for M1 and C1, SH-7 for C4, SH-8a or b only after `rp-widget` | S2 |
| X, Bluesky, Instagram, TikTok | none (they don't post) | — |

---

## 11. Doubts we couldn't resolve

- **Store choice** (§1). Option A is a new dev store, but STRATEGY §7 named rewardsprotesting. That is the owner's word.
- **Sam's sign-in address.** New customer accounts' sign-in by emailed code is [I]. If a store had a way to sign in as a customer without email, the alias wouldn't be needed [U].
- **The page header's place.** Inside the app's frame or in Shopify's title bar [U]. It decides whether headings and buttons survive the crop.
- **The 4.4.3 reading (a precondition, D-shots-4).** The word "Shopify" inside the app's UI: "Open the buyer in Shopify", "As Shopify holds it now" (SH-4), "Shopify sends this email itself" (SH-7), and anything a theme prints on the storefront (SH-8c). Requirement 4.4.3 says "Do not use our trademarks in your app icon, banner, or screenshots" and allows them "to communicate your app's compatibility with Shopify". Whether app text naming Shopify counts is [U]. The owner or the checker decides it once, before any frame that shows the word is "safe" for the listing. Logos are out either way.
- **The 4.3.4 reading (a precondition, D-shots-5).** Requirement 4.3.4 says "Do not use any statistics or data … This includes verifiable and unverifiable information." It reads as written for listing text and marketing claims, but its wording doesn't exclude test amounts in real UI [I]. One reading covers every listing frame with figures: S1-A (£0.00 tiles and the empty chart), S1-B and SH-3 (rates and minimum spends), SH-2, SH-4 and SH-6 (amounts). The owner or the checker decides it before the S1 upload.
- **A phone image in the listing.** Best practices ask for mobile screenshots where an app is mobile-responsive. A 1600×900 listing image can't hold a 390 px phone capture without a ground, which makes it a composite. If the owner wants one, it needs his explicit exception to §3's no-stitching rule: the alt text and sidecar would say it is two captures placed side by side, `derived_from` would list both masters, and the 4.4.4 question goes with it to the checker. Otherwise mobile shows on social only (SH-8a, SH-8b).
- **The UI says "Members"** (the Tiers column, "1 member"; `app/routes/app.tiers.tsx:305, 326`; Home's Tiers card prints "1 member" or "0 members" too, `app/routes/app._index.tsx:556`, which is in the SH-2 frame; on S1-A/SH-1's first open it reads "No tiers yet. …" instead). The voice guide lists "members" under words to avoid. Screenshots keep the real UI, so this is an app-copy question for the owner, not something to edit in a frame.
- **Expected numbers** (§2) are inferred from code and staging. The £13.50, the tier moves and the progress bar's length haven't been observed in production.
- **The listing's alt-text length limit** and its file-size limit [U]. Today's images are 1600×900 JPEG (phase-1 live note).
- **"Capture node screenshot" on a cross-origin iframe** isn't tested. The viewport-plus-crop route is the fallback.

## Sources

- Code and runbook: origin/main 6f3a57b6, read 2026-11-07. `app/routes/app.tsx:27-37` (the five pages), `app._index.tsx`, `app.tiers.tsx`, `app.customers._index.tsx`, `app.customers.$id.tsx`, `app.orders._index.tsx`, `app.orders.$id.tsx`, `app.settings._index.tsx`, `app/admin/home-rules.ts`, `app/admin/words.ts`, `app/lib/record-order.server.ts`, `app/lib/tiers.server.ts`, `app/lib/stats.server.ts`, `app/shopify/names.server.ts`, `extensions/rewards-widget/*`, `shopify.app.toml`, `docs/staging-run.md`, `docs/switch.md`.
- https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements, read 2026-11-07 (4.2.2, 4.3.4, 4.3.6, 4.4.3, 4.4.4, 4.4.5).
- https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices, read 2026-11-07 (screenshots and feature media).
- https://help.shopify.com/en/manual/shopify-admin/productivity-tools/timeline, read 2026-11-07 (the profile photo beside Timeline comments).
- https://apps.shopify.com/rewards-pro, fetched 2026-11-07: the listing text and its three screenshots (#2 viewed at 1600×900).
- STRATEGY.md §2, §4, §6, §7, §13 and §15; the design ASSETS B2–B4 and D3; phase-1 notes p1-live (the listing's media) and p1-drafts.
