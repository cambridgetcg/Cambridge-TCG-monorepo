# RewardsPro: listing text, outreach note and EU representative shortlist

**Status:** draft, 2026-11-03. Nothing here is published. Yu pastes the
listing text into the Partner Dashboard himself and sends the outreach note
under his own name. Anything that needs Yu's input is marked `[Yu: ...]`.

**Checked on 2026-11-03:**

- The live listing, https://apps.shopify.com/rewards-pro (HTTP 200), and its
  three screenshots.
- Shopify's listing guidance,
  https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices, and
  requirements,
  https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements.
- Shopify Help Center pages on store credit,
  https://help.shopify.com/en/manual/customers/store-credit, and third-party
  transaction fees,
  https://help.shopify.com/en/manual/your-account/manage-billing/billing-charges/types-of-charges/third-party-charges/third-party-transaction-fees.
- The code on `main` at 85789f7e, plus the open fix branches that hide what
  can't work yet (`claude/rewardspro-honest-surfaces`,
  `claude/rewardspro-pre-release`, `claude/rewardspro-first-run`), and the
  drafted privacy policy, terms and subprocessor list
  (`claude/rewardspro-public-texts`, PR #130).
- The ICO's guidance on electronic mail marketing,
  https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/.
- GOV.UK on what a limited company shows on its letters and websites,
  https://www.gov.uk/running-a-limited-company/signs-stationery-and-promotional-material,
  and Cambridge TCG Limited's Companies House record (company 15680297).
- The mail records for rewardspro.io (SPF, DMARC, Google DKIM), through
  Google's public DNS.

## 1. App Store listing

### What changes and why

The visible text is mostly accurate already. These parts are not:

- **The SEO title tag** names raffles, mystery boxes and points. Raffles and
  mystery boxes are paused (`CHANCE_MECHANICS_PAUSED`), and shoppers have
  nowhere to spend points.
- **Tags** list subscriptions, gift cards and discounts:
  - Every membership product is a one-time purchase
    (`app/routes/app.members.products.tsx:485-487`).
  - Gift cards need the `write_gift_cards` scope, which the app doesn't
    request.
  - Discounts need `write_discounts`, which it doesn't request either.
- **"Works with: Customer accounts"** came from the customer-account
  extension, which PR #85 removed.
- **The details text** has two claims that don't hold:
  - "requiring no theme modifications": the merchant turns the widget's app
    embed on in the theme editor.
  - "Customers automatically earn credit": nothing is earned until there is
    a tier and automatic cashback is on.
- **Nothing says how shoppers spend their credit.** Shopify lets them pay
  with store credit only when they're signed in through customer accounts
  (not legacy customer accounts) or pay with Shop Pay, and only in the
  checkout's currency. A shopper chooses to apply it, and the whole balance
  is applied.
- **The developer address** is still the old Hatton Garden one.
- **The meta description** carries pricing ("all on a free plan"), which
  requirement 4.2.3 keeps in Pricing details only.

The relevant requirements are 4.3 (accurate and truthful listing), 4.3.3 (no
stats, and no words like "the best" or "the only"), 4.3.5 (accurate tags),
4.2.3 (pricing only in Pricing details) and 4.4.4 (images that show the real
app).

### When to paste

Everything except "Works with" can go in now: those parts are wrong today,
whatever the release does. Check "Works with" after the next app release
(`shopify app deploy`), which removes the customer-account extension. If the
badge is still shown then, remove it by hand.

`[Yu: three parts of the new text are ahead of the app until other work
lands. Paste now and accept that, or hold those parts back:
(1) Details and Feature 1. Until PR #126 is live, a customer who existed
before install earns nothing on their first order, because orders/paid
places only customers it has just created in a tier before cashback.
(2) Features 2 and 3. Bought tiers ending on time, and rolling 12-month
tiers dropping, run in the tier-maintenance cron, and all crons on
rewardspro-production have been off since 2026-10-17.
(3) "Their credit" in the details. The widget shows RewardsPro's own copy
of the balance, which changes only when RewardsPro adds or takes back
credit, so it can be out of date after a shopper spends credit.]`

### Limits

From the best-practices page:

| Field | Limit |
|---|---|
| App name | 30 characters |
| App introduction | 100 characters |
| App details | 500 characters |
| Each feature | 80 characters |
| Search terms | up to 5, one idea each, complete words |

The shopify.dev pages don't state limits for the app card subtitle, the SEO
title tag, the meta description or image alt text, and I couldn't confirm
them elsewhere. So those texts are kept short: subtitle 56, title tag 46,
meta description 134, alt texts under 80. `[Yu: the counter in the listing
form decides; tell me if any field is cut short]`

Counts below are characters as typed, spaces included. The dash in the title
tag is an en dash (–), counted as one character.

### Field by field

**App name:** no change. It stays `RewardsPro` (10 of 30). The TOML name
"Rewards Pro" counts as similar under requirement 4.1.1.

**SEO title tag:** 46 characters. The live tag has 69: "RewardsPro - Loyalty,
Points, Cashback, Raffles & Mystery Box Rewards".

```
RewardsPro – Cashback, VIP Tiers & Memberships
```

**SEO meta description:** 134 characters. The live description has 158 and
ends "all on a free plan".

```
RewardsPro pays customers cashback as Shopify store credit, with VIP tiers set by spend and tier memberships you can sell as products.
```

**App card subtitle:** 56 characters. `[Yu: I couldn't read the live subtitle,
because the search page renders it in the browser. Compare before
replacing.]`

```
Bring buyers back with cashback they spend in your store
```

**App introduction:** 97 of 100 characters. The live introduction has 99:
"RewardsPro is a fully integrated loyalty app that automatically rewards
customers based on spending".

```
Give shoppers cashback as Shopify store credit, so they have a reason to come back and buy again.
```

**App details:** 499 of 500 characters. The live text has about 492.

```
Set VIP tiers by spend, each with its own cashback rate. With automatic cashback on, RewardsPro adds cashback to the customer's Shopify store credit when an order is paid. Customers move up tiers as they spend, and you can sell a tier as a product. A widget you turn on in your theme editor shows signed-in customers their credit, tier and progress. Shoppers spend credit at checkout, in full and in your store's currency, when signed in with Shopify customer accounts (not legacy ones) or Shop Pay.
```

**Features:** three, replacing the live three (76, 80 and 70 characters).

| # | Text | Characters |
|---|---|---|
| 1 | `Automatic cashback, added to Shopify store credit when an order is paid` | 71 |
| 2 | `VIP tiers by spend over 12 months or all time, each with its own cashback rate` | 78 |
| 3 | `Sell a tier as a one-time product for a month, a year or lifetime` | 65 |

Each line is backed by the code:

1. `webhooks.orders.paid.tsx` credits Shopify store credit when automatic
   cashback is on.
2. `EvaluationPeriod` is `ANNUAL` (rolling 12 months) or `LIFETIME`.
3. Durations are monthly, annual or lifetime, all one-time
   (`tier-product-purchase.server.ts:369-373`).

**Tags.** Remove four tags and keep the rest:

| Group | Remove | Keep |
|---|---|---|
| Program types | Subscriptions, Gift card programs | Reward programs, Memberships, VIP tiers, Cash back programs, Custom programs |
| Rewards you can offer | Discounts, Gift cards | Cash back, Store credit, Membership perks, Custom rewards |

`[Yu: I'd also remove "Custom programs" and "Custom rewards" for now. The
only custom reward in the app is a mission reward, and missions aren't live
on the storefront yet. Keep them if you read the tags differently.]`

**Works with:** remove "Customer accounts" if it's still shown after the
release. Shoppers do see and spend their credit inside Shopify's customer
accounts, but that is Shopify's own feature, not a RewardsPro surface. The
details text now carries the rule instead.

**Search terms:** up to 5. Each counts as one term.

```
cashback
store credit
loyalty program
VIP tiers
membership
```

`[Yu: I couldn't see the current search terms; compare before replacing.]`

**Screenshot alt texts:** in the order the listing shows them.

| # | Shows | Live alt text | New alt text | Characters |
|---|---|---|---|---|
| 1 | Orders list with cashback per order | Cashback System integrated with Shopify Store Credit | `RewardsPro orders list showing the cashback earned on each paid order` | 69 |
| 2 | Loyalty tiers (bronze, silver, Gold, Ultimate) | RewardsPro_Loyalty_Tiers | `Loyalty tiers in RewardsPro, each with a minimum spend and a cashback rate` | 74 |
| 3 | Tier membership products | RewardsPro_Tier_products | `Tier membership products in RewardsPro with duration, price and cashback rate` | 77 |

Two of the screenshots need replacing, not just new alt text:

- **Screenshot 1** shows a real Gmail test address in the Customer column, on
  two rows. The best-practices page asks for no personal data in screenshots.
  `[Yu: retake it with example.com customers, or blur that address.]`
- **Screenshot 3** shows a banner that says membership products "can be
  one-time purchases or recurring subscriptions". That isn't true: every
  membership product is one-time. The same sentence is still in the app, on
  the tiers page (`app/routes/app.members.tiers.tsx:607-609`), and it needs
  its own code fix. `[Yu: retake screenshot 3 once that banner is fixed, or
  crop the banner out.]`

**Developer address:** change it from "34-35 Hatton Garden, London EC1N 8DX"
to the registered office:

```
60 Tottenham Court Road
Suite 4583a
London
W1T 2EW
United Kingdom
```

`[Yu: this is probably the Partner organisation's business address, under
Settings, rather than a listing field.]`

**Other things to check in the form:**

- `[Yu: watch the feature video (YouTube IHgTl5oQZlg). Replace or remove it
  if it shows raffles, mystery boxes, gift cards, discounts, points,
  subscriptions or missions. A still feature image is fine if there's no new
  video yet.]`
- `[Yu: under Sales channel requirements, make sure "Merchant must have
  online store" is selected (requirement 4.3.1). The widget is a theme app
  embed and the app uses an app proxy.]`
- `[Yu: make sure an emergency developer contact is set in Partner account
  settings (requirement 4.5.6).]`
- `[Yu: under API access > Protected customer data, request only the fields
  the app reads: name, email and phone. Remove physical address. The live
  listing's "Data access" also shows geolocation, IP address, browser and
  operating system under "Device and activity data". I couldn't tell
  whether that comes from the protected-data request or from the order
  scopes, so look at the listing again after the change. Otherwise the
  listing says the app sees more than the note and the privacy policy do.]`
- Leave Pricing as Free. Languages stays English, which is the only language
  the admin is in. Keep the privacy policy link: it points at
  rewardspro.io/privacy-policy, whose new text is drafted separately.

## 2. Outreach note

### Before you send

Send it only once all of these are true:

- [ ] The app version that handles refunds (`refunds/create`) is released.
      The note's refund line depends on it.
- [ ] PR #127, which switches off points and gift cards and marks missions
      as not live, is merged. The released theme extension no longer offers
      the two missions blocks: PR #124 at 69087a67 still has
      `missions_widget` and `missions_section`. The note says what's off.
- [ ] PR #126 is merged and deployed, and the dev-store run includes a
      customer who existed before install and earns cashback on their
      first order. Until then, those customers earn nothing on their first
      order, and that's most of a store's customers.
- [ ] Vercel cron jobs are switched on for rewardspro-production, and
      tier-maintenance, cashback-reconciliation and
      store-credit-reconciliation each run cleanly once with
      `vercel crons run`. Without them, bought tiers don't end on time,
      rolling 12-month tiers don't drop, and failed cashback isn't retried.
- [ ] The dev-store run passes, including:
      - a shopper paying an order entirely with store credit, after which
        the widget shows the reduced balance;
      - a checkout in a second currency through Markets, where the credit
        doesn't show.

      Today the widget shows RewardsPro's own copy of the balance
      (`api.proxy.$.tsx`), which changes only when RewardsPro adds or takes
      back credit. The store-credit-reconciliation cron only reports
      differences; it doesn't correct them. So the first check is expected
      to fail until the membership proxy reads the balance from Shopify
      (`storeCreditAccounts`). If that isn't fixed before sending, add to
      the note that the widget's balance can lag behind the one Shopify
      shows at checkout.
- [ ] Either shopper emails follow a per-shop switch that starts off (audit
      gap `code-transactional-email-no-toggle`), or the email line stays in
      the note.
- [ ] The listing changes above are live.
- [ ] The new privacy policy is live, and its link goes into the note. It
      needs a row for businesses we contact, which PR #130 doesn't have yet:
      their name, business email and store; where we found the address;
      the purpose; legitimate interests as the basis; the right to object;
      and deletion if there's no reply within `[Yu: number]` days.
- [ ] The merchant terms, with their data-processing terms (PR #130), are
      live with no `[Yu: ...]` placeholders left, the providers'
      data-processing terms are accepted, and their link goes into the
      note. A shop that installs makes RewardsPro its processor, and UK and
      EU GDPR Art 28 need that contract in place first. `[Yu: decide
      whether the app should also record each shop's acceptance at first
      run.]`
- [ ] The subprocessor list (PR #130) is live, and its link goes into the
      note.
- [ ] An EU representative is appointed (see part 3), since some recipients
      will sell to EU shoppers.
- [ ] rewardspro.io mail passes SPF, DKIM and a single DMARC record. Check
      with a test send to Gmail and to Outlook: spf=pass, dkim=pass,
      dmarc=pass. Today the SPF include points at a name with no record,
      `_dmarc` has two records, and there is no Google DKIM key (audit gaps
      `legal-mail-spf-dmarc`, `legal-google-dkim`, `code-dmarc-duplicate`),
      so mail from contact@rewardspro.io is likely to land in spam.
- [ ] Each recipient is a UK limited company or LLP (checked on Companies
      House), or has opted in. No sole traders or partnerships: the ICO
      says "Sole traders and some partnerships are treated as individuals",
      and individuals must opt in first. No EU recipients until the rules
      for their country are checked, since some EU countries need consent
      even for business email. US outreach waits for the US trade mark
      check on REWARDPRO.
- [ ] Addresses come only from public business contact pages, never from
      Shopify Partner or app data, and where each one came from is
      recorded. The note tells the recipient where.

Leave out the claims from `DEMO-JUDY.md`:

- raffles and mystery boxes;
- "live on 9 stores" and "15–20% increase";
- the old £39 and £149 prices;
- "Data stays in your Shopify store", which isn't true: RewardsPro keeps
  its own copy;
- "only issued on fulfilled orders", which isn't true either: cashback is
  added when an order is paid.

### The note

3,568 characters, 613 words, as written below, with the `[Yu: ...]`
placeholders still in. It is long for a first note, because it says what
doesn't work yet. `[Yu: cut what you like, but keep the four rules, the
data paragraph, the line on where the address came from with the way to
opt out, and the company details in the signature.]`

```
Subject: A free cashback app for your Shopify store

Hi [Yu: first name],

I'm Yu. My small UK company, Cambridge TCG Limited, makes RewardsPro, a Shopify app that pays your customers cashback as Shopify store credit. It's free, and there are no paid plans. [Yu: one line on why you thought of their store]

What it does today:
- You set tiers by how much a customer spends, over the last 12 months or all time, each with its own cashback rate.
- Once you've made a tier and switched on automatic cashback, RewardsPro adds the cashback to the customer's store credit in Shopify when an order is paid. It counts what they paid, not any store credit or gift card they used.
- If you refund an order, RewardsPro takes back the refunded share of that order's cashback from the customer's remaining store credit. It can't take back credit they've already spent.
- Customers move up a tier as they spend more. You can also sell a tier as a one-time product, for a month, a year or lifetime.
- A widget you turn on in your theme editor shows signed-in customers their credit, tier and progress.

Four Shopify rules about store credit to know before you install:
1. Customers can spend store credit only when they're signed in through Shopify customer accounts, or when they pay with Shop Pay. It doesn't work with legacy customer accounts. You can see which you have under Settings > Customer accounts.
2. If a customer chooses to use store credit, Shopify applies their whole balance; they can't use only part of it.
3. On Shopify stores created on or after 12 May 2025, Shopify charges its third-party transaction fee on the part of an order paid with store credit, even if you use Shopify Payments. Stores created before that date don't pay it. The rate depends on your Shopify plan. The fee is Shopify's; RewardsPro charges nothing.
4. RewardsPro gives credit in your store's currency. Shopify shows it at checkout only when the checkout is in that same currency, so customers paying in another currency through Markets can't use it.

Points, raffles, mystery boxes and gift cards are switched off for now, so you won't see them in the app. There is a Missions page, but missions don't appear in your storefront yet.

To work out tiers and cashback, RewardsPro keeps a copy of your customers' names, email addresses, phone numbers and order history in a database in London. Our hosting, error-monitoring and email providers are listed at [Yu: subprocessors link], and some of them handle data outside the UK. If you uninstall, RewardsPro erases your shop's records at once and this can't be undone, so export your members first. Backup copies expire within 8 days. Credit you've already given stays in Shopify. Our privacy policy and merchant terms are at [Yu: links, once they're live].

[Yu: keep this line only while there's no per-shop email switch: "RewardsPro can email your customers, from a RewardsPro address, when their tier goes down or a tier they bought is about to end or has ended. There's no switch for this yet."]

It's new, so you'd be one of the first stores to use it, and there are no reviews yet. If anything doesn't work, write to contact@rewardspro.io and I'll reply myself.

I found your address on [Yu: source, e.g. your store's contact page]. If you'd rather not hear from me again, reply "no" and I'll delete it and won't write again.

Best,
Yu
Cambridge TCG Limited, registered in England and Wales, company no. 15680297. Registered office: 60 Tottenham Court Road, Suite 4583a, Fitzrovia, London W1T 2EW.
https://apps.shopify.com/rewards-pro
```

### Where each claim comes from

| Claim | Source |
|---|---|
| Free, no paid plans | `docs/decisions/2026-10-20-rewardspro-free-only-relaunch.md`; `NEW_PAID_SUBSCRIPTIONS_RETIRED` |
| Tiers over 12 months or all time | `EvaluationPeriod` in `prisma/schema.prisma` (`ANNUAL` is rolling 12 months; `LIFETIME`) |
| Cashback added when an order is paid, once there's a tier and automatic cashback is on | `webhooks.orders.paid.tsx`; `autoCashbackProcessingEnabled` defaults to false. On `main`, a customer who existed before install earns nothing on their first order (`if (customerCreated)` at line 369; "Customer has no tier, skipping cashback" at line 883); PR #126 places them first |
| Not counted on store credit or gift card payments | `app/utils/transaction-analyzer.ts` leaves out `gift_card` and `store_credit` gateways |
| Refunds take back the refunded share, from the remaining credit only | `refunds/create` → `/webhooks/orders/refunded` in `shopify.app.toml`, live only after the next release; `settleRefundClawback` debits at most the shopper's Shopify balance (`refund-handler.server.ts:542-543`) |
| One-time tier products for a month, a year or lifetime | `tier-product-purchase.server.ts:369-373`; `app.members.products.tsx:485-487`. Ending them on time needs the tier-maintenance cron |
| Widget shows credit, tier and progress | `extensions/theme-app-extension-rewardspro/blocks/membership_widget.liquid` and its English locale. The balance is RewardsPro's copy (`api.proxy.$.tsx:636`), updated when RewardsPro adds or takes back credit |
| Customer accounts or Shop Pay; not legacy; the customer chooses to apply it; full balance only | Shopify Help Center, store credit page (fetched 2026-11-03): "Store credit isn't available for legacy customer accounts"; "The customer can select Apply store credit"; "Only the full store credit amount can be applied" |
| Credit shows only when the checkout currency matches | Same page: "only the store credit balance that matches the currency of your checkout displays to the customer at checkout". RewardsPro issues credit in `shopSettings.storeCurrency` (`webhooks.orders.paid.tsx:986`) |
| Fee on stores created on or after 12 May 2025, even with Shopify Payments | Shopify Help Center, third-party transaction fees page; its example is a Shopify Payments store charged on $10 CAD of store credit |
| Points, raffles, mystery boxes, gift cards off; a Missions page, missions not on the storefront | `CHANCE_MECHANICS_PAUSED`; `FEATURES_AVAILABLE` on `claude/rewardspro-honest-surfaces` (PR #127), which keeps Missions in the menu with a notice that they aren't live in the storefront yet |
| Database in London; some providers outside the UK | Supabase (London) and Vercel (lhr1); the `Customer` model stores email, names and phone. The drafted subprocessor list (PR #130) names Sentry (EU region, Germany) and Twilio SendGrid (United States), and the drafted policy says "we do not promise that data stays in one country" |
| Uninstall erases the shop's records at once, can't be undone; backups expire within 8 days | `webhooks.app.uninstalled.tsx` calls `cleanupShopData`. The drafted policy and terms (PR #130) say erased records stay in the database host's daily backups "currently within 8 days", and that the erasure can't be undone. Members export: `api.members.export.tsx` |
| Where we found the address; reply "no" to stop | ICO electronic mail marketing guidance: "you must provide a valid contact address so they can opt out or unsubscribe". UK GDPR Art 14 and Art 21(4): the source of the details and the right to object, at the latest at first contact |
| Company details in the signature | GOV.UK: business letters and websites show "the company's registered number", "its registered office address" and "where the company is registered". The page doesn't mention email; business emails are generally treated as business letters. Companies House record for 15680297 |
| One of the first stores, no reviews | 0 shops in the production database; the listing shows 0 reviews |

The note says no more about email than the line above, which stays only
until shoppers' emails follow a per-shop switch. Marketing email is off in
production. Even so, some shopper emails go out from rewards@rewardspro.io
with no setup by the merchant: `isEmailEnabled`
(`email-notifications.server.ts:65-75`) only checks that `SENDGRID_API_KEY`
is set, which it is in production. The tier-down email from orders/paid
(`sendTierDowngradeEmailNotification`) and the bought-tier expiry emails
from the tier-maintenance cron send through SendGrid without an
`EmailSettings` row. Welcome and tier-up emails send once the merchant has
saved email settings (audit gap `code-transactional-email-no-toggle`).

## 3. EU GDPR Art 27 representative shortlist

Checked 2026-11-03. All three appoint a representative for the whole EU and
publish prices online. The prices are what each page shows; none of the three
pages says whether VAT is included, except Prighter's, which says "excl.
VAT".

| | GDPR Local | Prighter | EDPO |
|---|---|---|---|
| Page | https://gdprlocal.com/pricing/ (modified 2026-10-29) | https://prighter.com/pricing (dated 2026-08-24) and https://prighter.com/privacy-representation/eu-gdpr (dated 2026-10-14) | https://edpo.com/data-protection-representative-price/ (modified 2026-09-18) |
| Price for the smallest company | 1–10 employees, EU only: £99 a month or £999 a year. EU and UK: £149 a month or £1,500 a year | Growth, for fewer than 10 employees: €39 a month, or €420 a year billed yearly. Small, for 10–49 employees: €79 a month or €852 a year | Small (up to 50 employees): €1,920 a year, billed yearly only |
| Billing | Monthly or yearly, in GBP | Monthly, quarterly or yearly, in EUR, excl. VAT | Yearly only. "No hidden fees"; onboarding included, no setup fee |
| What the page says is included | First point of contact for regulator enquiries; a free initial Art 27 review; a written agreement and a portal; support with subject access requests, erasure requests and breaches | Appointment for the whole EU once a signed power of attorney is approved; handling of requests from data subjects and supervisory authorities, through its request tool; no charge per request; templates for records of processing; text for your privacy policy | Handling of data subject and data protection authority requests, with no limit stated; help with breach notifications where you are the controller; use of EDPO's contact details and certificate; storage of a copy of your records of processing |
| Where | Not stated on the pricing page | Not stated on the pages read | Brussels (Avenue Huart Hamoir 71, 1030 Brussels) |
| To ask before signing | Which EU address goes in our policy; minimum term; VAT | Growth is for fewer than 10 employees, so it applies: €420 a year excl. VAT. Ask which EU address goes in our policy | VAT; whether the small plan covers a company that is mostly a processor |

Ask all three whether the service covers Cambridge TCG as a **processor**
(for merchants' shopper data) as well as a **controller** (for merchants'
own account details), since RewardsPro is both.

`[Yu: pick one and sign it in Cambridge TCG Limited's name. Then I add the
representative's name, address and contact to the privacy policy and the
merchant terms, where a placeholder already waits.]`

On price alone, Prighter's Growth plan is the cheapest (€420 a year), then
GDPR Local (£999 a year), then EDPO (€1,920 a year). EDPO's page is the clearest about what is included.
