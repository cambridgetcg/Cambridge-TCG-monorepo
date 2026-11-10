# RP-05: code-backed claim rows, checked at 9efc2f34

The first-session check for [RP-05](https://github.com/cambridgetcg/Cambridge-TCG-monorepo/issues/165). It was made on
2026-11-08 by a lab Claude Code session (Claude Opus 5.5, session `2f4c6449`) against origin/main **9efc2f34**.

**Nothing here is verified.** Each verdict waits for a different session to post `concur:` or `challenge:` on #165,
using the same evidence (WORK.md §2.6). After that, RP-06 updates `claims.toml`, which has one writer; this file
does not change it. Whether a `gates.md` record counts as G0 is Yu's Pre-1/D6 decision, not this file's. Where a
`MISSING:` source now has a record on main, this file gives the record as a **candidate** only.

**Second read, 2026-11-09.** A different lab session (`74cb7025`) read every row on #165. It concurred with 17 and
challenged the proposed sentence of 4: rp-cashback-base, rp-refund-takeback, rp-review-ask and rp-widget. This session
re-read each challenge's lines at 9efc2f34 and agrees with all four. Those rows now carry revised sentences, marked
**Revised after challenge**, and each needs a concur on its new wording. The second read's corrective notes on other
rows are folded in below, marked "(second read)".

**Third read, 2026-11-10.** An Air session (`5b65f404`) read the four revised sentences at origin/main 5c953f5c. It
concurred with rp-review-ask and challenged the other three, each with a real case inside the stated scope. This
session re-read every line it cites and agrees with all three. Those rows now carry a second revision, marked
**Revised after third read**, which needs a concur from a session other than `2f4c6449`. Of the files cited, only
`app/routes/app._index.tsx` and `app/lib/tiers.server.ts` differ between 9efc2f34 and 5c953f5c; their moved lines are
listed under "Locators that moved". New locators added in this revision are the same at both commits unless marked
@5c953f5c.

## How it was checked

1. **Hashes, in code.** Each source with a file locator was hashed as `git show <commit>:<path> | sha256`, at
   the cited commit and at 9efc2f34, and compared with the sha256 the ledger records.
   - Every cited `apps/rewards` code file is byte-identical at main, so code line numbers still point at the same
     text.
   - These differ:
     - `apps/rewards/docs/switch.md` (9a89a39b… → 72ad5424…; two lines were inserted after :248 and :298 was
       edited).
     - `app/routes/webhooks.orders.fulfilled.tsx`, deleted by #153 and already kept in the ledger as history.
     - The rebuild spec. It is cited at b0b18bd1, which is PR #142's branch, and is not on main.
2. **Verdicts, by two blind readers per group.** Two independent read-only readers checked each group of rows:
   - one traced the code path from the Shopify event to the effect;
   - the other tried to break the sentence with edge cases.

   They agreed on 20 of 21 rows. For `rp-vip-tiers` (holds against narrow), a third reader re-checked the code and
   chose narrow.

   The load-bearing lines were then re-read by hand. All three readers are agents inside one session, so this is
   one session's check, not a concurrence.
3. **Greps.** Every absence grep a row cites was re-run at 9efc2f34 with `git grep`.
4. **Not checkable from the lab.** Web captures (help.shopify.com, apps.shopify.com, Companies House) are on the
   Air, and agents don't fetch those hosts. Only the code part of those rows is judged here.

Verdicts: **holds** means the code supports the sentence within its scope. **narrow** means the code supports a
narrower sentence, which is given. **fails** means the code contradicts it. No row fails.

## Summary

| Row | Verdict | Rests on (@9efc2f34) | What still stands between it and `verified` |
|---|---|---|---|
| rp-store-credit | holds | `app/lib/record-order.server.ts:230` `rail: "shopify_store_credit"` | Concur; D6 (candidate `gates.md:20`) |
| rp-paid-trigger | narrow | `app/routes/webhooks.orders.paid.tsx:55` | New sentence; concur; D6 (`gates.md:20`, `:40`) |
| rp-cashback-base | narrow | `app/lib/order-facts.ts:81` `baseOf(...)` | Scope revised after third read; gift-card order never run; concur on the revision; D6 (`gates.md:20`, `:22`, `:44`) |
| rp-refund-takeback | narrow | `app/lib/payouts.server.ts:257` `Money.min(amount, held)` | New sentence, scope revised after third read; concur on the revision; D6 (`gates.md:23`, `:24`) |
| rp-merchant-funds | holds (code part) | `app/shopify/store-credit-rail.server.ts:307` | Air re-read of the help.shopify.com capture; concur |
| rp-vip-tiers | narrow | `app/lib/tiers.server.ts:236`, reached only when no lock applies (`:233-235`) | New sentence; no downgrade observed; concur; D6 (`gates.md:19`, `:25`) |
| rp-tier-window | narrow | `app/lib/tiers.server.ts:101` | New sentence; a window change never observed; concur; D6 |
| rp-tier-lock | holds | `app/lib/tiers.server.ts:280` | A lock observed on a dev store; concur |
| rp-import-past | narrow | `app/shopify/install.server.ts:53-55` | New sentence; concur; D6 (`gates.md:34`, `:27`) |
| rp-setup-steps | holds | `app/routes/app._index.tsx:363` | A capture of the card; concur |
| rp-switch-off | holds | `app/lib/record-order.server.ts:68` and `app/lib/tiers.server.ts:96-103` | The tier half observed on production; concur; D6 (`gates.md:26`) |
| rp-review-ask | narrow | `app/lib/stats.server.ts:242` | Revised sentence concurred (third read); guard test |
| rp-help-in-settings | holds | `app/routes/app.settings._index.tsx:67` | A capture of Settings > Help; concur |
| rp-contact-delivers | narrow (code shows publication only) | `app/routes/app.settings._index.tsx:16` | Yu's outside delivery test; concur |
| rp-widget | narrow | `extensions/rewards-widget/assets/rewards-widget.js:137`, `:169` | Sentence and scope revised after third read; #205's fix or the scope; rest of gate C; concur on the revision; D6 (`gates.md:21`) |
| rp-live-release | holds | `docs/switch.md:85` | Concur; rp-production-rebuild |
| rp-no-tier-products | holds | `shopify.app.toml:49` (six scopes) | Guard test, or accept the scope pin; D9; concur |
| rp-no-own-email | holds | `app/shopify/store-credit-rail.server.ts:307` (`notify`) | Yu's data-request email decision; guard test; concur |
| rp-no-chance | holds | `app/lib/money.ts:90` (a fixed rate, no draw) | Guard test; D9; concur |
| rp-no-points | holds | `prisma/schema.prisma:90` (one payout rail) | Guard test; D9; concur |
| rp-scope | holds | `app/lib/record-order.server.ts:230` and `shopify.app.toml:49` | Exact grep patterns recorded; guard test; concur |

Paths are relative to `apps/rewards/` unless they start with `apps/`. "D6" means Yu's choice of G0's form (ROADMAP
Pre-1, STRATEGY D6); the `gates.md` lines named are candidates only. Where a row says "concur", the second read
(`74cb7025`) has given it for the verdict. The third read (`5b65f404`) concurred with rp-review-ask's revised
sentence; the other three challenged rows still need one for their second revision.

## Findings that cut across rows

- **`gates.md` exists.** It merged in #158 on 7 Nov, 13 minutes before the marketing kit (#159), so the ledger,
  `claims-map.md:22-23`, ROADMAP §1 and STRATEGY §1.1 still say it is absent and that no production refund is
  recorded. It records production checks A–P on rewardsprotesting and different-currency-test. Candidate
  replacements for the `MISSING:` sources are under each row below.
- **Still unobserved anywhere,** on staging or production:
  - a tier downgrade (the test buyers all ended in the top tier, `gates.md:21`);
  - a tier lock;
  - a change of tier window;
  - on production, that an order paid while cashback is off still counts towards tier spend;
  - an order paid with a gift card;
  - a tipped order (accepted from tests, `gates.md:43`);
  - a money-only refund on a tax-exclusive shop;
  - an order edit that adds items after payment (only removals ran, `gates.md:41-42`);
  - the widget's progress line on production;
  - the setup card and Settings > Help, as captures;
  - a test message to contact@ seen arriving.
- **A possible live observation, probably unseeable.** On rewardsprotesting the imported buyer "Rewards Pro" is in
  Gold on five orders dated 19–24 Nov 2025 (`gates.md:34`). If the store uses "Last 12 months" and that buyer places
  no new order, the nightly tier passes around 19–25 Nov 2026 should move them down. The store's window is not
  recorded, so this is an inference. (Second read:) the same buyer is check I's erasure subject (`gates.md:10`,
  `:27`), with customers/redact due around 17 Nov. Once erased, the buyer panel has no buyer (`stats.server.ts:478-485`),
  so the downgrade can't be seen from the admin. A visible downgrade is easier made by hand: refund a Gold test
  buyer's order below the threshold, and refunds/create resolves the tier at once
  (`app/routes/webhooks.orders.refunded.tsx:102`).
- **Order edits that add items after payment (second read; re-read here).** An order's product value is written
  once, when orders/paid records it (`record-order.server.ts:177`). A repeat delivery writes nothing
  (`:197-204`), and no order-edit topic is subscribed (`shopify.app.toml`). So an item added by an edit after
  payment earns nothing. Refunding that item is a worse problem. readRefund values the refund on the order's lines
  as they are today (`order-source.server.ts:726-733`, through `boughtValue`, `:502-507`). The take-back then divides
  by, and checks completion against, the product value stored at payment (`refunds.server.ts:212`, `:217`). Example
  at 5%: £100 paid, £5 earned; an edit adds a £100 item, which earns nothing; refunding the added item counts as
  £100 of £100 refunded, completes the order and takes back all £5, although the £100 item that earned it was kept.
  This is code reading only and has never been run. It affects rp-cashback-base, rp-refund-takeback and
  rp-vip-tiers. The second-read session has since filed it as #190.
  - **The reverse case (third read).** "Once, at payment" means once, when the order is first recorded. A failed
    orders/paid answers 500 and Shopify delivers it again (`webhook-helpers.server.ts:27-31`), and each delivery
    reads the order as it is then (`webhooks.orders.paid.tsx:48-55`). recordOrder checks no payment status
    (`record-order.server.ts:54-71`), and an added line counts in full (`order-source.server.ts:396`, `:502-507`).
    The hourly sweep records a missed order the same way (`payout-check.server.ts:299`, `:323-327`), up to
    SWEEP_DAYS = 3 back (`:56`). So an item an edit adds before that first record earns cashback: £50 paid, a £30
    item added before the redelivery, gives a base of £80 and £4.00 at 5%, not £2.50. An edit's removal before the
    first record goes through the same read of today's lines (`removedUnits`, `:390-397`); this session hasn't
    traced that case either way.
  - **Exchanges (third read, on #190).** An exchange is a Shopify return, not an order edit, so "edited" doesn't
    name it. Whether an exchange's new item behaves like an added line depends on how Shopify writes it, which
    nobody has run.
- **Locators that moved:**
  - `docs/switch.md`: lines after :248 moved by 2. For example :259 → :261, :262 → :264, :263 → :265, :267 → :269
    and :269 → :271. :298 is now :300 and reads "OK" (row 7b is closed by `gates.md:40`). The same diff also
    edits old :291, now :293, row 3, to "OK" (second read); no ledger row cites it.
  - `app/shopify/order-source.server.ts` changed in #156; the ledger cites it only in uncertainties.
    - The read limits moved: :572 → :643, :590 → :661 and :603-604 → :674-675. The refund limits moved too:
      :308-312 → :328-332 and :344-347 → :349-352, which throws at :351-352.
    - Since #156, `refundMoney` runs for every refund (`:462`), so the 20-transaction and 20-shipping-line limit
      now applies to item refunds, not only to money-only ones.
    - (Second read:) readOrder and readRefund value all of an order's refunds together (`:540`, `:731`), so one
      refund past a limit blocks every later refund of that order.
  - `social/STRATEGY.md`: the data-request email decision the ledger cites at :58 and :506 is now at :79 and :528.
  - (Third read; each checked line for line.) Two cited files changed between 9efc2f34 and 5c953f5c.
    - `app/routes/app._index.tsx` (#157): lines up to :379 are unchanged (:178, :192-195, :271-273, :363, :365).
      The review card moved by 3: :511-525 → :514-528, :511 → :514 and :516 → :519.
    - `app/lib/tiers.server.ts`: :96-103 → :97-104, :101 → :102, :123-131 → :124-132, :233-236 → :234-237
      (:236 → :237), :280 → :281, :595 → :683 and :602 → :690.
- **Negative rows have no guard test.** That covers rp-no-own-email, rp-no-chance, rp-no-points, rp-scope,
  rp-no-tier-products and rp-review-ask's "nothing is offered".
  - `test/unit/config/production-toml.test.ts:81-93` pins the six scopes. It would fail on a new products,
    discounts or gift-card scope, but not on a reward kept inside the app's own data, a mail library or a billing
    call. (Second read:) it reads only `access_scopes.scopes`, so an `optional_scopes` entry, `graphql.ts` or the
    `SCOPES` env (`shopify.server.ts:37`) would pass it: a backstop, not a guard.
  - Partial pins exist for rp-no-own-email's default-off half: `settings.dom.test.tsx:57-63`,
    `settings-page.postgres.test.ts:135` and `send-payout.postgres.test.ts:173` (second read).
  - Whether to add a hard guard is Yu's choice (AGENTS.md principle 8). If he wants one, it would be a small agent
    PR in `apps/rewards/test/`. A merge there deploys production.
- **Two of the app's own sentences overclaim:**
  - `app/admin/home-rules.ts:49` says "On: every paid order earns cashback as store credit." Open PR #157 fixes it.
  - `app/routes/app.tiers.tsx:355-356` says "Cashback is paid on the product price after discounts. Shipping, and
    anything paid with store credit or gift cards, earns nothing." It leaves out gift cards bought as products,
    which earn nothing (`order-source.server.ts:250`). Neither sentence should be copied into marketing.

## Rows

### rp-store-credit: holds

- **Rests on:** `app/lib/record-order.server.ts:230` @9efc2f34, `rail: "shopify_store_credit",`. The payout enum has
  one value (`prisma/schema.prisma:89-90`), and the rail credits only through `storeCreditAccountCredit` on the
  store's own customer (`app/shopify/store-credit-rail.server.ts:306-307`); the same rail debits take-backs (`:307`,
  second read). No discount, gift-card or billing mutation exists (grep 0).
- **Locators:** all same-hash and still say what they cite. `docs/switch.md:77` is unchanged.
- **MISSING → candidate:** B4 check B, at `apps/rewards/docs/gates.md:20`: "#1011 … The shopper got £19.98 in store
  credit within 3 s: 5% of £399.60".
- **Stale in the row:**
  - "Not yet observed end to end on a dev store since the 2026-10-19 rebuild."
  - "no production refund yet" (now `gates.md:23-24`).
  - The read-limit lines in `order-source.server.ts`, which moved (see the cross-row findings).
  - `claims.toml:73`, "B4 check B is still to run" (second read; check B is `gates.md:20`).
- **Still between it and verified:** a concur; D6; screenshots of a credit need the app's name fixed or cropped,
  because Shopify's timeline shows "Rewards Pro" (`shopify.app.toml:10`).

### rp-paid-trigger: narrow

- **Rests on:** `app/routes/webhooks.orders.paid.tsx:55` @9efc2f34, `const result = await recordOrder(conn, facts, "live");`.
  orders/paid is the only order-earning subscription (`shopify.app.toml:25-27`), and the orders/fulfilled route is
  gone. The payout is created pending with `nextAttemptAt: now` (`app/lib/record-order.server.ts:234-235`), and the
  sweep lists only paid orders (`order-source.server.ts:743`). Nothing waits for fulfilment.
- **Why narrow:** "Cashback is added when an order is paid" is false, within the scope, for paid orders that earn
  nothing:
  - test orders (`record-order.server.ts:66`), the usual way a merchant tries an app;
  - orders cancelled before they are read (`:67`);
  - orders created before install but paid after it (`:62`);
  - orders paid fully with store credit (`:157-160`);
  - orders past the read limits.

  A failed send can also land hours later (`app/lib/payouts.server.ts:40-41`).
- **Proposed sentence:** "For an order that earns cashback, payment is what triggers it; RewardsPro doesn't wait
  for the order to be fulfilled." Where there is room, pair it with the exclusions in rp-cashback-base.
- **Candidates:**
  - `gates.md:20` (#1011 credited within 3 s);
  - `gates.md:40` (a delivery that renewed the token first answered 200 in 1,275 ms, which closes row 7b, now
    `switch.md:300`);
  - `gates.md:41` (#1016, placed unpaid, credited only once it was marked paid).
- **Stale:** "Still open: a delivery that renews the store's token first (row 7b, B4)." The ban on "instant",
  "within seconds" and "real-time" still stands.
- **Still between:** that the credited orders were unfulfilled when credited is still an inference [I]; a concur;
  D6.

### rp-cashback-base: narrow

- **Rests on:** `app/lib/order-facts.ts:81` @9efc2f34,
  `return Money.max(0, new Money(productValue).minus(storeCreditUsed).minus(giftCardUsed));`.
- **Why narrow:**
  - **Gift cards bought as products.** They are "the product price" but earn nothing:
    `order-source.server.ts:250`, `value: giftCard ? zero() : value`.
  - **Store credit and gift-card payments.** They come off the product value even when they paid for shipping.
    For £100 of products plus £10 of shipping with £10 of credit applied, the base is £90, not £100.
  - **Tenders by gateway name.** They are recognised by name (`order-source.server.ts:206-210`). A third-party
    gift-card gateway named another way would earn. This is code reading only.
  - **Items added by an edit after payment** (second read's challenge). The base is written once, when the order is
    first recorded (`record-order.server.ts:177`, `:182`), so an item added after that earns nothing (see the
    cross-row finding).
  - **An order first recorded after an edit** (third read's challenge). A redelivered orders/paid, or the sweep,
    reads the order as it is then, so an item added before the first record earns: £50 paid and £30 added gives
    £4.00 at 5%, not £2.50 (the cross-row finding's reverse case).
- **Proposed sentence, revised after challenge:** "Cashback is paid on the product price after discounts, as the
  order stood when it was paid, less any part of the order paid with store credit or gift cards. Shipping, and gift
  cards bought as products, earn nothing." The first version left out "as the order stood when it was paid" and was
  false for an item added after payment.
- **Scope, revised after third read:** "for orders no edit changed before RewardsPro first records them". The third
  read proposed "with no item added by an edit"; this session widened it to any edit, because a removal before the
  first record is read from today's lines too and hasn't been traced. The sentence stays. Rewording it to "as the
  order stood when RewardsPro recorded it" was the other route, and the third read showed why not: refunds are
  never netted from the base (`app/lib/order-facts.ts:84-90`), so an order refunded before it is recorded would
  read wrongly.
- **Candidates:**
  - `gates.md:20` (B: "5% of £399.60, the product price after the discount, with shipping earning nothing");
  - `gates.md:22` (D: #1013, paid fully with store credit, earned nothing);
  - `gates.md:44` (a tax-exclusive order on different-currency-test: "nothing on the VAT or the shipping").
- **Stale:**
  - The scope "observed on a tax-inclusive GBP store only". A tax-exclusive GBP order (`gates.md:44`) and a USD
    presentment order (`gates.md:32`) are now recorded.
  - The tax uncertainty (`claims.toml:416`), "No tax-exclusive order has been run" (now `gates.md:44`).
  - The tipped order is still not run: it was "Accepted from tests (Yu)" (`gates.md:43`).
- **Not stale, corrected after challenge:** the edit uncertainty (`claims.toml:415`) stays. The first version of this
  file called it stale, but `gates.md:41-42` ran removals only; an item added after payment hasn't run and earns
  nothing by code.
- **Still between:**
  - No order paid with a gift card has ever run.
  - C1's worked example uses staging figures (£540, £27.00), while production B used £399.60 and £19.98.
  - A concur; D6.

### rp-refund-takeback: narrow

- **Rests on:** `app/lib/payouts.server.ts:257` @9efc2f34, `const debitedAmount = Money.min(amount, held);`. The
  share is the cashback × refunded product value ÷ product value, rounded down; the refund that completes the order
  takes the rest (`app/lib/order-facts.ts:106-119`).
- **Why narrow:**
  1. On a tax-exclusive shop, a money-only refund counts item VAT as product value (`order-source.server.ts:463`;
     Ruling 12), so it takes back more than its share. Never observed.
  2. "Still holds" means Shopify's balance in the order's currency from any source, not only RewardsPro's credit
     (`store-credit-rail.server.ts:363-370`; `gates.md:45`).
  3. A refund too large to read takes nothing back. That covers more than 100 lines (`order-source.server.ts:328-332`),
     20 or more transactions or shipping lines on any refund (`:351-352`, called at `:462`), or the 20th refund
     (`:674-675`, checked at `:725` before the refund itself is left out). readRefund values all of an order's
     refunds together (`:727-731`), so one such refund also blocks every later refund of that order.
     refunds/create answers 500 before recordRefund runs (`app/routes/webhooks.orders.refunded.tsx:65-74`), and
     the sweep logs the limit, or counts a problem, and records nothing (`payout-check.server.ts:365-368`,
     `:395-400`) while the order is inside 3 days (`:56`). A tax-inclusive, unedited order of 120 different singles
     refunded in one refund takes back £0.
  4. An erased buyer's take-back is closed (`refunds.server.ts:278-284`).
  5. (Second read's challenge.) Refunding an item added by an edit after payment takes back more than its share,
     up to all of the order's cashback, because the refund is valued on today's lines against the product value
     stored at payment (see the cross-row finding).
- **Proposed sentence:** "When items are refunded, RewardsPro takes back their share of the cashback, up to the
  store credit the customer still holds in the order's currency. A refund of shipping alone takes nothing back."
- **Scope, revised after third read:** "on stores whose prices include tax (until Ruling 12's bend is fixed or
  accepted), for orders with no item added after payment by an edit or an exchange (until that is fixed), and for
  refunds within the app's read limits: fewer than 20 refunds on the order, and no refund of it with more than 100
  lines or with 20 or more transactions or shipping lines". The first version carried only the tax limit. The second
  left out "Why narrow" 3, the read limits, and didn't name exchanges (third read's challenge). Exchanges are scoped
  out because nobody has run one, not because the sentence is known to be false for them.
- **Candidates:**
  - `gates.md:23` (E: "Refunding 1 of #1011's 2 items took back £9.99, half of the £19.98.");
  - `gates.md:24` (F: "asked for £9.99 and took the £8.99 left");
  - `gates.md:42` (edit refunds);
  - `gates.md:44` (a shipping-only refund took nothing back).
- **Stale:**
  - The `MISSING:` line (a production refund).
  - "What then happens to the take-back is not traced here." It is now traced: nothing is taken back.
  - The refund-limit line numbers.
- **Still between:**
  - No production money-only refund outside an edit (staging step 5 ran one).
  - The planned rp-refund-example figures (£13.50 of £27.00) differ from production (£9.99 of £19.98).
  - A concur; D6.

### rp-merchant-funds: holds (code part)

- **Rests on:** `app/shopify/store-credit-rail.server.ts:307` @9efc2f34. The credit is a `storeCreditAccountCredit` on
  the store's own customer, made through that store's own admin session (`rail-for.server.ts:27-28`). The app has
  no billing or payment code (grep 0 for `appSubscriptionCreate|appPurchaseOneTime|usageRecord`) and sets no expiry.
- **Not checkable from the lab:** the help.shopify.com sentence that "you fund" rests on.
- **Understated (second read):** the uncertainty "as part-payment of their orders" (`claims.toml:581`); credit paid
  whole orders on production (`gates.md:22`, `:32`).
- **Still between:**
  - An Air session re-reads the capture inside review_after.
  - A concur.
  - Every "free" still needs sh-sc-fee beside it.

### rp-vip-tiers: narrow

- **Rests on:** `app/lib/tiers.server.ts:236` @9efc2f34,
  `target = qualify(await tierSpend(customerId, customer.merchant.tierWindow, now, db), tiers);`. This line is reached
  only when no lock applies (`:233-235`).
- **Why narrow:** a customer locked to a tier never moves, whatever they spend. The app says so itself: "Spend doesn't
  move this buyer while they're locked …" (`app/routes/app.customers.$id.tsx:139`). The row names the lock only as an
  uncertainty, and uncertainties don't travel with the sentence (the og-card shows the sentence alone).

  Smaller gaps, from code reading and never observed:
  - orders with no customer and orders past the read limits add no spend;
  - an order's product value is written once (`record-order.server.ts:178`), so items added in an edit after
    payment never count;
  - on a large store the nightly pass can take several nights (`api.cron.tiers.tsx:27`).
- **Proposed sentence (third reader's wording):** "Set tiers by spend, each with its own cashback rate. Loyal
  customers move between tiers as their spend changes, unless you lock them to a tier."
- **Candidates:**
  - `gates.md:19` (A: the widget showed tier "Everyone");
  - `gates.md:25` (G: "#1015 (£222.00) earned £22.20 at Gold's 10%").
- **Stale:**
  - "Still missing on production: B4 checks A and G" and "(absent at 6bd092cb)".
  - "Moves happen after each paid order, refund and cancellation … and in the nightly pass" is incomplete. A tier
    delete, the first base-rate save and the end of the import also move buyers (`app.tiers.tsx:136`,
    `app._index.tsx:178`, `bulk-import.server.ts:393`), and so does the hourly sweep (`payout-check.server.ts:331`,
    `:410`). (Second read:) it was already incomplete at 6f3a57b6, so it is an omission, not stale.
- **Still between:** no downgrade observed (see the live observation above); a concur; D6.

### rp-tier-window: narrow

- **Rests on:** `app/lib/tiers.server.ts:101` @9efc2f34, `orderedAt: start ? { gte: start } : undefined,`. This is a
  filter over recorded orders only (`record-order.server.ts:10-12`).
- **Why narrow:** the row carries the import limit for "all time" only, but "the last 12 months" counts the same
  recorded orders. It falls short:
  - when the import ran at 60 days (no `read_all_orders`; `bulk-import.server.ts:89`), failed, or skipped unreadable
    orders (`home-rules.ts:129`);
  - possibly for a reinstall gap longer than the sweep's 3 days (`payout-check.server.ts:56`, `:264`). (Second
    read:) a gap past shop/redact's 48 hours normally ends in erasure, and a later install then imports afresh
    (`erasure.server.ts:96-98`), so the first version's "the import doesn't run again" overstated.
- **Proposed sentence:** "Tiers count a loyal customer's spend over the last 12 months or over all time, from the
  orders RewardsPro has recorded: those since install, and past orders from up to 12 months before it."
- **Candidate (partial):** `gates.md:34` (P: the import ran at 365 days). P doesn't tell the two windows apart: the
  imported orders fall inside both, and the store's window isn't recorded.
- **Partly stale:** uncertainty 4. Both removal edits ran on production (`gates.md:41-42`). The after-payment double
  count was real (#1017) and was fixed in #156. An item added after payment hasn't run and never counts towards
  spend by code (`record-order.server.ts:177`). `switch.md:263` is now `:265`.
- **Still between:**
  - A window change observed on a dev store (not among B4 A–P).
  - The 365-day horizon for other installs is still an inference [I].
  - A concur; D6.

### rp-tier-lock: holds

- **Rests on:** `app/lib/tiers.server.ts:280` @9efc2f34,
  `tx.customer.updateMany({ where: { id: customerId, merchantId }, data: { lockedTierId: tierId } })`. The locked
  tier then wins:
  - in resolveTier (`:233-235`);
  - in the order's rate (`record-order.server.ts:149`);
  - in the widget (`api.proxy.$.tsx:73`).

  The control shows only when the store has tiers (`app.customers.$id.tsx:168`). Customer rows are created only by
  recordOrder (`record-order.server.ts:120`), which matches the scope.
- **Incomplete (already at 6f3a57b6, so not stale; second read):** uncertainty 1. A lock also ends when its tier is
  deleted (`tiers.server.ts:602`; the dialog says "Buyers locked to … go back to automatic.", `app.tiers.tsx:162`) or
  when the buyer is erased (`erasure.server.ts:215`). An erased buyer has no panel (`stats.server.ts:478-485`).
- **Still between:**
  - A lock and a "Return to automatic" observed on a dev store. This isn't among B4 A–P; a natural check is to lock
    a Gold member to "Everyone" and see the next order earn 5%.
  - A concur.

### rp-import-past: narrow

- **Rests on:** `app/shopify/install.server.ts:53-55` @9efc2f34. The import starts on the first open, only while
  `importState` is `not_started`, and reads orders from 365 days before install (60 without `read_all_orders`,
  `bulk-import.server.ts:89-91`). Imported orders always earn nothing (`record-order.server.ts:61`); so does any
  order created before install but paid after it (`:62`).
- **Why narrow:** "so customers start in the right tier" holds only on the happy path.
  - After 3 restarts the import ends "failed", and the app says "Your past orders couldn't be brought in, so buyers
    start in the lowest tier." (`home-rules.ts:129`).
  - Placement waits until a tier exists (`home-rules.ts:145`), and the import finishes over later Home polls and the
    hourly job.
- **Proposed sentence:** "When you first open RewardsPro, it starts bringing in your paid orders from up to 12
  months before install, so loyal customers can start in the tier their past spend reaches. Past orders earn no
  cashback."
- **Candidates:**
  - `gates.md:34` (P: "Done: 2 buyers placed in tiers" … "no credit was issued for imported orders");
  - `gates.md:27` ("5 imported orders (`source: import`, `noCashbackReason: import`), no ledger entries and no
    payouts").
- **Stale:**
  - "Unobserved with real imported orders (B4 P)" and the `MISSING:` text.
  - Uncertainty 3 understates the failure path: `:129` is the whole-import failure, not only "some orders" (`:128`).
    It is understated rather than stale (second read), and `:129` shows only when no orders came in (`:141`).
  - (Second read:) money-only refunds from before the import count as spend (`bulk-import.server.ts:19-21`).
- **Still between:** the 365-day horizon for other installs [I]; a concur; D6.

### rp-setup-steps: holds

- **Rests on:** `app/routes/app._index.tsx:363` @9efc2f34,
  `heading={d.setup.completed ? "Your past orders" : "Set up cashback"}`. Exactly three steps follow, in the order
  claimed:
  1. the base rate (`:367`);
  2. "Switch cashback on" (`:393-398`);
  3. "Turn on the widget in your theme" (`:402-407`), which links to the theme editor deep link
     (`home-rules.ts:22`).

  A new store starts switched off with no tiers (`prisma/schema.prisma:146`). The scope's three Shopify-admin
  prerequisites are exactly those the code checks (`shop-checks.server.ts:97-99`). (Second read:) the scope's "only
  once … new customer accounts" is Home's rule; Shopify also lets a buyer spend credit using Shop Pay
  (`shop-checks.server.ts:4-6`).
- **Candidate (partial, not a capture):** `gates.md:28` ("cashback on, all three checks pass") and `gates.md:9`
  ("Everyone" at 5%) replace the `[I]` that steps 1–2 were done on production.
- **Still between:**
  - A capture of the card with its steps. rewardsprotesting has completed setup, so the card no longer shows them
    (`app._index.tsx:365`); it needs a store opening the rebuilt app for the first time.
  - A concur.
  - The help.shopify.com wording, which only the Air can re-read.

### rp-switch-off: holds

- **Rests on:** `app/lib/record-order.server.ts:68` @9efc2f34, `if (!running) return "off";`. The order row is
  still written (`:166-196`). Tier spend filters only on test, cancelled, the window and refunds, never on
  `noCashbackReason` (`app/lib/tiers.server.ts:96-103`). Switching off always succeeds (`merchant.server.ts:163-165`).
- **Candidate (one half only):** `gates.md:26` (H: "With cashback off, #1014 (£222.00) earned nothing … nothing was
  owed."). It does not record #1014 adding to tier spend; that half is observed only on staging
  (`staging-run.md:29`).
- **For the replies** (not stale: the file is identical since 6f3a57b6; second read):
  - Uncertainty 1, "Orders paid while it's off never earn later", overstates. The switch is read when the order is
    recorded (`record-order.server.ts:107-109`), so a redelivered or swept order recorded after cashback is back on
    does earn. The accurate form is "orders recorded while it's off never earn later".
  - Switching off doesn't stop credit already due from going out: there is no switch check in payouts or the
    sweep. This matters for R-LEAVE.
- **Still between:** the tier half observed on production, or RP-06 and Yu accepting staging H for it; a concur;
  D6.

### rp-review-ask: narrow

- **Rests on:** `app/lib/stats.server.ts:242` @9efc2f34,
  `if (now.getTime() - merchant.createdAt.getTime() < REVIEW_MIN_AGE_DAYS * DAY_MS) return false;`.
- **Why narrow:**
  - The seven days run from `merchant.createdAt`, set at the first open (`merchant.server.ts:84-85`). A reinstall
    keeps the row (`merchant.server.ts:55-58`; `gates.md:28` "The store's rows stayed"), so days without the app
    count. "Seven days with the app" overstates. (Third read:) once shop/redact has erased an uninstalled store, the
    row is gone (`erasure.server.ts:123-132`), so a store that dismissed the card and later reinstalls is asked
    again, after a new seven days and three new cashback entries.
  - The request also stops when Shopify answers "already-reviewed" (`home-rules.ts:44`), which Shopify doesn't show.
    Only Shopify's answer counts (`app._index.tsx:192-195`, `:271-273`): a merchant who reviews through the card's
    own link (`:516`) gets the card again on the next visit (`:511`), as the second read's challenge showed.
  - "Nothing is offered" holds in code. The card's words are "A review helps other merchants find RewardsPro.",
    "Leave a review" and "Dismiss" (`app._index.tsx:511-525`), and the incentive grep finds 0.
- **Proposed sentence, revised after challenge:** "RewardsPro asks for a review only after your store's third
  cashback entry, and no sooner than seven days after you first opened the app. It stops once you dismiss it,
  Shopify has shown its request, or Shopify says you have already reviewed the app. Nothing is offered for a review."
  The first version said "or you have already reviewed the app", which is false for a review left through the link.
  **Concurred** by the third read (`5b65f404`, 2026-11-10), with the notes folded in here. At 5c953f5c the card is at
  `app._index.tsx:514-528` (#157 moved it by 3), and both the card and Shopify's request wait on `reviewDue`
  (`:269`, `:514`).
- **Note:** while the request is due, it is asked on every Home visit, because every answer from Shopify but
  "success" and "already-reviewed" records nothing (`app._index.tsx:193-195`). STRATEGY's "asks once" is false;
  the sentence above doesn't say "once". If RP-13 changes the timing, this row is re-read after it merges (#165).
- **Inference [I]:** rewardsprotesting's merchant row dates from 2026-11-06 and has more than three cashback
  entries, so Home there should start asking around 2026-11-13 unless dismissed.
- **Still between:** a guard test for "nothing is offered" (none exists; `test/` has 0 incentive hits); a concur.

### rp-help-in-settings: holds

- **Rests on:** `app/routes/app.settings._index.tsx:67` @9efc2f34,
  ``Email us at <s-link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</s-link>``. It sits inside
  `<s-section heading="Help">` (`:65`), with `CONTACT_EMAIL = "contact@rewardspro.io"` (`:16`).
  - Nothing hides it; Settings is in the nav (`app.tsx:36`).
  - `test/unit/routes/settings.dom.test.tsx:89-95` pins the link and that there is no docs link.
  - It is the only email address in `apps/rewards/app/` and `extensions/`; the tests hold `@example.com` fixtures
    (second read).
- **Still between:** the A10 Settings capture; a concur; it travels with rp-contact-delivers.

### rp-contact-delivers: narrow (the code shows publication only)

- **Rests on:** `app/routes/app.settings._index.tsx:16` @9efc2f34, `const CONTACT_EMAIL = "contact@rewardspro.io";`.
  Code can show that the address is published and is the only one. It can't show that mail sent there arrives,
  which is what "reach us" says.
- **Recommendation:** keep the sentence as written and leave it unverified until Yu's outside test passes
  (STRATEGY.md §13 step 10). STRATEGY puts that test before the DNS step (12); running it again after the DNS
  sitting is this file's advice, not STRATEGY's order (second read). The narrow form ("Our contact address is
  contact@rewardspro.io, shown in the app's Help section") only repeats rp-help-in-settings.
- **Not checkable from the lab:** the listing's support-email attribute and the mail DNS.

### rp-widget: narrow

- **Rests on:** `extensions/rewards-widget/assets/rewards-widget.js:137` @9efc2f34,
  `if (data.running !== false && isNumber(tier.cashbackPercent)) {` for signed-in customers. For guests it is `:169`,
  `if (root.getAttribute("data-running") === "true" && isFinite(base) && base > 0) {`.
- **Why narrow:** the sentence holds on the happy path only.
  - **Progress.** It shows only where a higher tier can be reached (`:115-116`; `api.proxy.$.tsx:80-81`). A one-tier
    store, which is what setup creates, shows "You are on the top tier", and a locked customer sees no progress.
  - **Guest rate.** It doesn't show at a 0% base (`:169`).
  - **Guest view lag.** The guest view follows the last metafield write, so a failed write lags until the next app
    open or the nightly rewrite (`widget-config.server.ts:11-13`).
  - **Signed-in view hidden.** It stays hidden after a call over 8 s with no retry, after a failed call, past 30
    calls a minute (`:16`, `:197`; `proxy.server.ts:45`), or on a proxy path other than `/apps/rewardspro`
    (`membership_widget.liquid:21`; seen again in `gates.md:45`).
  - **Merchant's own words.** The merchant's guest words and link replace the sign-in prompt (`:165`, `:173-174`).
  - **No amount** (second read's challenge). When Shopify can't give a balance in the cart's currency, the panel
    shows no amount, only "Your store credit shows at checkout" (`:141-150`). That includes a buyer whose only credit
    is in another currency (`shopify/live-balance.server.ts:92-97`), seen on production (`gates.md:32`), as well as a
    slow or refused read.
  - **A buyer from before the first tier** (third read's challenge). A buyer recorded while the store had no tier
    has no tier (`record-order.server.ts:126`). Until a tier pass places them, the widget shows the tier their spend
    reaches, with its rate (`app/routes/api.proxy.$.tsx:74`, `?? qualify(spend, tiers)`; the rate at `:87`). Their
    next order is placed in the lowest tier and paid at its rate (`record-order.server.ts:136-149`), and the tier
    moves only after that order (`webhooks.orders.paid.tsx:55`, `:62`; `resolveTier`, `tiers.server.ts:237`
    @5c953f5c). The pass after a tier save stops at 25 s (`tiers.server.ts:320-322`, `:362` @5c953f5c), so this
    needs more unplaced buyers than that pass reaches, and lasts until the nightly pass. `api.proxy.$.tsx` is the
    same at 9efc2f34. Draft #205 (head e8557485) changes `:74` to `?? tiers[0]`; once that is on main, this row is
    re-read and the scope's last clause can go.
- **Proposed sentence, revised after third read:** "While cashback is on, a widget you turn on in your theme editor
  shows guests your base rate and a sign-in prompt, and shows signed-in customers their tier and cashback rate, their
  store credit in the currency they are shopping in when Shopify returns it, and how far they are from the next tier
  when there is one they can reach." The guests' clause now sits inside "While cashback is on": on its own sentence
  it lost that condition, and guests see nothing when cashback is off (`rewards-widget.js:164`). The first version
  said plainly that customers see "their … store credit", which is false when no amount comes back.
- **Scope, revised after third read:** "on the app proxy path `/apps/rewardspro`; for guests, with a base rate above
  0% and the widget's own guest words; and except a customer recorded before your first tier whom no tier pass has
  placed yet (until #205's fix is on main)". The first two limits were named above but missing from the
  scope (third read). The guest words (`:165`, `:173-174`) are this session's addition: a merchant's own message and
  link replace the sign-in prompt.
- **Candidates:**
  - `gates.md:21` (C: "Pass" on Yu's iPhone, signed in, as a guest and in Dark). It still states no 390 px, no Light
    and no product page, and C is not among Yu's acceptances at `gates.md:12`.
  - `gates.md:51`: Lighthouse "Accepted (Yu)", not run.
- **Stale:**
  - "A signed-in customer with no tier sees nothing" can't happen while cashback is on. Switching on needs a tier
    (`merchant.server.ts:164`), and the lowest tier can't be deleted (`tiers.server.ts:595`).
  - `switch.md:259` is now `:261`.
- **Still between:**
  - The rest of gate C, or RP-06 and Yu counting `gates.md:21`.
  - The progress line has been seen on staging only (`staging-run.md:22`).
  - A concur; D6.

### rp-live-release: holds

- **Rests on:** `apps/rewards/docs/switch.md:85` @9efc2f34, "Version `rewardspromembership-217` (74a0be5a), released
  by Yu on 2026-11-07". Code can't show a release. It does show that the release still matches main:
  - `git diff --quiet 74a0be5a 9efc2f34 -- apps/rewards/extensions apps/rewards/shopify.app.toml` exits 0;
  - App Store distribution with no allowlist (`app/shopify.server.ts:41`).
- **Candidates:**
  - `gates.md:7` ("version `rewardspromembership-217`, served by `rewardspro-production` from `apps/rewards` at
    main");
  - `gates.md:28` (Yu reinstalled from the App Store: "the same 8 scopes, and Home as before").
- **Stale, in part:** "Still open … Lighthouse … and gate C at 390 px". Lighthouse is now accepted, not run
  (`gates.md:51`), and `:259` is now `:261`. C is recorded as Pass, but `gates.md:21` records it without 390 px, Light
  or a product page (second read), so the "gate C at 390 px" clause should be reworded, not dropped.
- **Still between:**
  - A concur.
  - rp-production-rebuild.
  - The listing's "Data access" capture (Air).
  - Re-checking whenever an extension or toml change merges without a new Shopify release.

### rp-no-tier-products: holds

- **Rests on:** `apps/rewards/shopify.app.toml:49` @9efc2f34. There are six scopes, none for products, selling plans
  or subscriptions.
  - The app has four mutations only: `graphql.ts:62` credit, `:91` debit, `:655` bulk order read, `:716`
    metafieldsSet.
  - A tier comes from spend or a lock, never a purchase (`tiers.server.ts:233-236`).
- **Greps at main:** `sellingPlan|purchaseOption|productCreate|write_products|membership product|tier product` = 0.
  Product, subscription and billing mutation names = 0.
- **Locators:** the spec `:51` is at b0b18bd1 only (not on main). The RESOLVED note's `switch.md:205` is now `:235`.
- **Still between:**
  - A guard test, or RP-06 accepting the scope pin (`production-toml.test.ts:81-93`) as one; it doesn't catch a
    billing call, and it reads only `access_scopes.scopes`, so an `optional_scopes` entry would pass it (second
    read).
  - Yu's D9.
  - The listing's tier-product text (Yu's S1 fix).
  - A concur.

### rp-no-own-email: holds

- **Rests on:** `app/shopify/store-credit-rail.server.ts:307` @9efc2f34,
  `creditInput: { creditAmount: money, notify: i.notify === true }`. That `notify` flag is the only way the app causes
  an email. It comes from `notifyBuyers`, which defaults to false (`prisma/schema.prisma:148`) and is read at send
  time (`payouts.server.ts:229`, `:241`).
- **Greps at main:**
  - The mail-library grep is 0, and there is no mail library in `package.json`.
  - A wider grep (`resend|ses|sendMail|…`) hits only comments, the mailto link, payout "resend" wording and
    Sentry's `beforeSend` config (`entry.server.tsx:30-31`, second read).
- **Scope note:** Sentry's alert email goes to Yu as the maker (`handle-error.server.ts:3-4`). That is outside "no
  email to shoppers or merchants", but the row could say so in one line.
- **Stale:**
  - `switch.md:269` is now `:271`.
  - The decision cited at STRATEGY.md:58 and :506 is now at :79 and :528.
  - The in-app-only data request is now observed on production (`gates.md:27`).
- **Still between:**
  - Yu's data-request email decision (still open at `switch.md:271`). If he chooses an email to the shop owner, the
    sentence changes first.
  - A guard test.
  - The help.shopify.com "Notify customer" re-read (Air).
  - A concur.

### rp-no-chance: holds

- **Rests on:** `app/lib/money.ts:90` @9efc2f34, `return roundMoney(new Money(base).times(percent).div(100), currency);`.
  Every reward is a fixed rate on the order's base. The only randomness is `crypto.randomUUID`/`randomBytes` for
  locks, sessions and encryption. The proxy serves only `membership` (`api.proxy.$.tsx:110`).
- **Greps at main:** `raffle`, `mystery`, `instant.?win`, `CHANCE_MECHANICS` and `lottery|sweepstake|prize draw` = 0
  each. A wider sweep (random, luck, spin, wheel, prize, draw, odds, ticket, jackpot) finds only crypto calls and
  comments.
- **Note:** the spec's non-goals (`:50` @b0b18bd1) name raffles and mystery boxes but not instant wins, so the grep
  alone carries "instant wins". The old app's paused constant (`apps/rewardspro/app/constants/chance-mechanics.ts:14`)
  is outside the scope.
- **Still between:**
  - A guard test. If it greps, it should leave out `test/`, because `app-proxy.postgres.test.ts:461` names
    "raffles".
  - Yu's D9 and the G4 chance-word rule.
  - rp-production-rebuild (candidate `gates.md:7`).
  - A concur.

### rp-no-points: holds

- **Rests on:** `prisma/schema.prisma:90` @9efc2f34. `shopify_store_credit` is the only value of `PayoutRailKind`.
  Ledger kinds are cashback, reversal and adjustment, and adjustments are bookkeeping for shortfalls and closes, not
  a reward.
- **Greps at main:**
  - The cited `points?.{0,20}(earn|redeem|balance)|redeem` = 0, and `mission|challenge|streak` = 0.
  - A bare `points?` hits chart data points, GraphQL cost points, `cursor: pointer` and `endpoint`, with no loyalty
    points anywhere.
- **Still between:**
  - A guard test.
  - Yu's D9.
  - The brand lane's fix of `brand.json:5`, which still says "points".
  - A concur.

### rp-scope: holds

- **Rests on:** `app/lib/record-order.server.ts:230` and `apps/rewards/shopify.app.toml:49` @9efc2f34. There is one
  payout rail, tiers by spend (`tiers.server.ts:123-131`), four mutations and one theme extension. A lock overrides
  spend, but that is a control, not another reward type; rp-vip-tiers and rp-tier-lock carry it.
- **Greps at main:** every reward-shaped pattern returns 0:
  - points/redeem in the reward form;
  - missions;
  - raffles;
  - discount codes and price rules;
  - gift-card creation;
  - selling plans;
  - referral, birthday or incentive;
  - billing;
  - mail libraries.
- **The row should record its exact patterns.** The literal `points?|redeem` gives 44 non-reward hits (the same at
  6bd092cb), so "0 hits for points" reproduces only with the reward-shaped pattern.
- **Not on this Mac:** the scratchpad source `wf/p1-truth.md §5`, which has probably expired. Its campaign,
  analytics and customer-account-extension checks were re-run here and give 0, 0, and only `rewards-widget` under
  `extensions/`.
- **Still between:** the exact patterns; a guard test; the positive half via rp-store-credit and rp-vip-tiers (D6); a
  concur.

## Next

- **Concur:** done for the verdicts. The second read (`74cb7025`, 2026-11-09) concurred with 17 rows and challenged
  4 sentences. The third read (`5b65f404`, 2026-11-10) concurred with rp-review-ask's revised sentence and challenged
  the other three. Their second revisions (rp-cashback-base's scope, rp-refund-takeback's scope, and rp-widget's
  sentence and scope) need a concur from a session other than `2f4c6449`. Much of the new wording is `5b65f404`'s
  own proposal, so a read by `74cb7025` or a fresh session is the stronger check; `5b65f404` may still give it.
- **RP-06 (Air, #207):** apply the concurred verdicts, the new sentences where taken (the revised ones once
  concurred), the candidate `gates.md` locators under D6, and the moved line numbers, including the third read's.
- **For Yu:**
  - D6 (whether `gates.md` counts as G0).
  - Whether the negative rows need a guard test (AGENTS.md principle 8).
  - The data-request email decision behind rp-no-own-email.
  - The order-edit finding (cross-row, #190): whether to fix it, and in which lane. Until then the revised scopes keep
    edited orders out of the sentences.
