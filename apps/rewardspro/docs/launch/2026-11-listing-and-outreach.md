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
  `claude/rewardspro-pre-release`, `claude/rewardspro-first-run`).

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
  with store credit only when they're signed in through the new customer
  accounts or pay with Shop Pay. The whole balance is applied.
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
meta description 141, alt texts under 80. `[Yu: the counter in the listing
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

**SEO meta description:** 141 characters. The live description has 158 and
ends "all on a free plan".

```
RewardsPro pays repeat customers cashback as Shopify store credit, with VIP tiers set by spend and tier memberships you can sell as products.
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

**App details:** 497 of 500 characters. The live text has about 492.

```
Set VIP tiers by spend, each with its own cashback rate. With automatic cashback on, RewardsPro adds cashback to the customer's Shopify store credit when an order is paid. Customers move up tiers as they spend, and you can sell a tier as a product. A widget you turn on in your theme editor shows signed-in customers their credit, tier and progress. Shoppers spend credit at checkout when signed in with Shopify's new customer accounts (not legacy ones) or with Shop Pay. The full balance applies.
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
- Leave Pricing as Free. Languages stays English, which is the only language
  the admin is in. Keep the privacy policy link: it points at
  rewardspro.io/privacy-policy, whose new text is drafted separately.

## 2. Outreach note

### Before you send

Send it only once all of these are true:

- [ ] The app version that handles refunds (`refunds/create`) is released.
      The note's refund line depends on it.
- [ ] The fix PR that switches off points, gift cards and missions is
      merged. The note says they're off.
- [ ] The dev-store run passes, including a shopper spending credit at
      checkout.
- [ ] The listing changes above are live.
- [ ] The new privacy policy is live, and its link goes into the note.
- [ ] An EU representative is appointed (see part 3), since some recipients
      will sell to EU shoppers.
- [ ] The recipients are UK or EU stores. US outreach waits for the US
      trade mark check on REWARDPRO.

Leave out the claims from `DEMO-JUDY.md`:

- raffles and mystery boxes;
- "live on 9 stores" and "15–20% increase";
- the old £39 and £149 prices;
- "Data stays in your Shopify store", which isn't true: RewardsPro keeps
  its own copy;
- "only issued on fulfilled orders", which isn't true either: cashback is
  added when an order is paid.

### The note

2,469 characters, 432 words, as written below, with the `[Yu: ...]`
placeholders still in.

```
Subject: A free cashback app for your Shopify store

Hi [Yu: first name],

I'm Yu. My small UK company, Cambridge TCG Limited, makes RewardsPro, a Shopify app that pays your customers cashback as Shopify store credit. It's free, and there are no paid plans. [Yu: one line on why you thought of their store]

What it does today:
- You set tiers by how much a customer spends, over the last 12 months or all time, each with its own cashback rate.
- Once you've made a tier and switched on automatic cashback, RewardsPro adds the cashback to the customer's store credit in Shopify when an order is paid. It counts what they paid, not any store credit or gift card they used.
- If you refund an order, RewardsPro takes back the refunded share of that order's cashback.
- Customers move up a tier as they spend more. You can also sell a tier as a one-time product, for a month, a year or lifetime.
- A widget you turn on in your theme editor shows signed-in customers their credit, tier and progress.

Three Shopify rules about store credit to know before you install:
1. Customers can spend store credit only when they're signed in through Shopify's new customer accounts, or when they pay with Shop Pay. It doesn't work with legacy customer accounts. You can see which you have under Settings > Customer accounts.
2. At checkout Shopify applies the customer's full store credit balance. They can't choose to use only part of it.
3. On Shopify stores created on or after 12 May 2025, Shopify charges its third-party transaction fee on the part of an order paid with store credit, even if you use Shopify Payments. Stores created before that date don't pay it. The rate depends on your Shopify plan. The fee is Shopify's; RewardsPro charges nothing.

Points, raffles, mystery boxes, gift cards and missions are switched off for now, so you won't see them in the app.

To work out tiers and cashback, RewardsPro keeps a copy of your customers' names, email addresses, phone numbers and orders on servers in London. If you uninstall, it deletes your shop's records straight away; credit you've already given stays in Shopify. Our privacy policy is at [Yu: link, once the new policy is live].

It's new, so you'd be one of the first stores to use it, and there are no reviews yet. If anything doesn't work, write to contact@rewardspro.io and I'll reply myself.

If it isn't for you, there's no need to reply.

Best,
Yu
Cambridge TCG Limited
https://apps.shopify.com/rewards-pro
```

### Where each claim comes from

| Claim | Source |
|---|---|
| Free, no paid plans | `docs/decisions/2026-10-20-rewardspro-free-only-relaunch.md`; `NEW_PAID_SUBSCRIPTIONS_RETIRED` |
| Tiers over 12 months or all time | `EvaluationPeriod` in `prisma/schema.prisma` (`ANNUAL` is rolling 12 months; `LIFETIME`) |
| Cashback added when an order is paid, once there's a tier and automatic cashback is on | `webhooks.orders.paid.tsx`; `autoCashbackProcessingEnabled` defaults to false |
| Not counted on store credit or gift card payments | `app/utils/transaction-analyzer.ts` leaves out `gift_card` and `store_credit` gateways |
| Refunds take back the refunded share | `refunds/create` → `/webhooks/orders/refunded` in `shopify.app.toml`; live only after the next release |
| One-time tier products for a month, a year or lifetime | `tier-product-purchase.server.ts:369-373`; `app.members.products.tsx:485-487` |
| Widget shows credit, tier and progress | `extensions/theme-app-extension-rewardspro/blocks/membership_widget.liquid` and its English locale |
| New customer accounts or Shop Pay; not legacy; full balance only | Shopify Help Center, store credit page (fetched 2026-11-03) |
| Fee on stores created on or after 12 May 2025, even with Shopify Payments | Shopify Help Center, third-party transaction fees page; its example is a Shopify Payments store charged on $10 CAD of store credit |
| Points, raffles, mystery boxes, gift cards, missions off | `CHANCE_MECHANICS_PAUSED`; `FEATURES_AVAILABLE` on `claude/rewardspro-honest-surfaces` |
| Data kept on servers in London | Supabase (London) and Vercel (lhr1); the `Customer` model stores email, names and phone |
| Uninstall deletes the shop's records at once | `webhooks.app.uninstalled.tsx` calls `cleanupShopData` |
| One of the first stores, no reviews | 0 shops in the production database; the listing shows 0 reviews |

The note leaves out email on purpose. Marketing email is off in production,
and when the transactional emails (welcome, tier, cashback) are sent isn't
settled yet (audit gap `code-transactional-email-no-toggle`).

## 3. EU GDPR Art 27 representative shortlist

Checked 2026-11-03. All three appoint a representative for the whole EU and
publish prices online. The prices are what each page shows; none of the three
pages says whether VAT is included, except Prighter's, which says "excl.
VAT".

| | GDPR Local | Prighter | EDPO |
|---|---|---|---|
| Page | https://gdprlocal.com/pricing/ (modified 2026-10-29) | https://prighter.com/pricing (dated 2026-08-24) and https://prighter.com/privacy-representation/eu-gdpr (dated 2026-10-14) | https://edpo.com/data-protection-representative-price/ (modified 2026-09-18) |
| Price for the smallest company | 1–10 employees, EU only: £99 a month or £999 a year. EU and UK: £149 a month or £1,500 a year | Lowest EU GDPR plan: €39 a month, or €420 a year billed yearly. Next plan: €79 a month or €852 a year | Small (up to 50 employees): €1,920 a year, billed yearly only |
| Billing | Monthly or yearly, in GBP | Monthly, quarterly or yearly, in EUR, excl. VAT | Yearly only. "No hidden fees"; onboarding included, no setup fee |
| What the page says is included | First point of contact for regulator enquiries; a free initial Art 27 review; a written agreement and a portal; support with subject access requests, erasure requests and breaches | Appointment for the whole EU once a signed power of attorney is approved; handling of requests from data subjects and supervisory authorities, through its request tool; no charge per request; templates for records of processing; text for your privacy policy | Handling of data subject and data protection authority requests, with no limit stated; help with breach notifications where you are the controller; use of EDPO's contact details and certificate; storage of a copy of your records of processing |
| Where | Not stated on the pricing page | Not stated on the pages read | Brussels (Avenue Huart Hamoir 71, 1030 Brussels) |
| To ask before signing | Which EU address goes in our policy; minimum term; VAT | Which plan fits a company with no employees: the table lists "Growth" (€39) below "Small" (€79) and doesn't say what headcount each covers. Also the EU address | VAT; whether the small plan covers a company that is mostly a processor |

Ask all three whether the service covers Cambridge TCG as a **processor**
(for merchants' shopper data) as well as a **controller** (for merchants'
own account details), since RewardsPro is both.

`[Yu: pick one and sign it in Cambridge TCG Limited's name. Then I add the
representative's name, address and contact to the privacy policy and the
merchant terms, where a placeholder already waits.]`

On price alone, Prighter's lowest plan is the cheapest (€420 a year) if it
applies to a company this size, then GDPR Local (£999 a year), then EDPO
(€1,920 a year). EDPO's page is the clearest about what is included.
