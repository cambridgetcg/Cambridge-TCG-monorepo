> **An agents' proposal, written on 2026-11-09 under Yu's delegation ("Lets just go with what yuou think is sensible and the best choice."). Yu has not read it yet.**
> Nothing here is Yu's decision until he says so. Every write below still waits for his yes at the time, as in [switch.md](switch.md).

# RewardsPro operator runbook

This file is for Yu as the operator once real merchants use the app: what to finish before the first one, what to do when something goes wrong, and what merchants should be told. [switch.md](switch.md) stays the record of the switch; this file doesn't repeat it.

**How to read it.**

- Code cites are `path:line` at commit 9efc2f34, relative to `apps/rewards/`. Nothing under `apps/rewards` changed between 9efc2f34 and 0006fb33. Doc cites such as `switch.md:7` are files beside this one, in `docs/`.
- **[observed]** means read in the code or docs. **[inferred]** means worked out from a chain of code steps, or Shopify behaviour nobody here has run.
- Everything here was found by code reading; none of it was run. Where a dev-store run would confirm an entry, the entry says so.
- Issues: #190, and #193–#201, filed on 2026-11-09 from the same review.

**SQL in this file.**

- Every block is untested: rehearse it on a scratch copy first, such as row 9's scratch project.
- Only Yu runs SQL, in the Supabase SQL editor; no agent holds a `rewards_app` URL (switch.md:7, 190). Agents keep production read-only outside the switch steps (the rebuild spec's standing rules, line 90, on branch `docs/rewardspro-rebuild-design`), so each write here is Yu's call at the time.
- Each read and each write is its own block. Run the read on its own first. Run the write only when the read shows exactly the rows you expect, and check the row count it reports.
- The time columns are `timestamp(3)` with no time zone (`prisma/migrations/20261105000000_init/migration.sql:76-78`), so the writes use `now() AT TIME ZONE 'UTC'`. [inferred: the app writes them in UTC]
- Nothing here touches `ledger_entry`. Its trigger refuses UPDATE and DELETE (`prisma/migrations/20261105000000_init/migration.sql:451-453`). An INSERT there would get past the app's payout locks, so it isn't offered either.
- Never paste a buyer's id, a shop's data or a secret into GitHub. Placeholders look like `<shop>.myshopify.com`.

## 1. Before the first real merchant

switch.md rows 4 and 9 already wait for this point. The review adds three items to them. Do the pause switch before point-in-time recovery is turned on.

| # | What | Where it stands | Issue |
|---|---|---|---|
| 1 | **Sentry Crons** (switch.md row 4). Set `REWARDS_SENTRY_CRON_MONITORS=true` in Production; it costs Sentry billing. Until then, a stop of every cron is silent (switch.md:55; `app/lib/cron.server.ts:251-256`). | Row 4's choice is kept: wait for the first real merchant. No new spend now (an agent's call under the delegation quoted above). | none |
| 2 | **A payout pause switch.** Today nothing stops money that is already owed. Off stops new cashback only (`app/lib/record-order.server.ts:107-109`), and the hourly job sends every due payout of an active store (`app/lib/payout-check.server.ts:186-205`). [observed] | Proposed. Needed before row 3. | #198 |
| 3 | **Point-in-time recovery and one rehearsed restore** of schema `rewards` into a scratch project (switch.md row 9, :45, :60). Rehearse §2.11's steps at the same time. | Waiting for the first real merchant. | #198 |
| 4 | **Sweep catch-up.** The sweep looks back 3 days at most (`app/lib/payout-check.server.ts:56, 264`) and reads at most 500 orders a store, newest updated first (`app/shopify/order-source.server.ts:45-46, 766-771`). So a store that is dark for longer loses orders for good. [observed in code; inferred for how long stores stay dark] | Proposed. | #193 |
| 5 | **Seeing what is stuck.** Most first sends happen after a webhook answers, and their result is dropped (`app/routes/webhooks.orders.paid.tsx:59-64`). A needs-a-look counts only in the run that made it (`app/lib/payout-check.server.ts:138-143`). [observed] | Proposed. | #196 |

## 2. When something goes wrong

Each entry says what you see, what it means, what to do and what not to do. "By hand" means in Shopify admin, on the buyer's page. In RewardsPro, the buyer page's "Open the buyer in Shopify" button opens it (`app/routes/app.customers.$id.tsx:54, 120-122`; `app/admin/words.ts:21`). Any credit or debit made by hand leaves "Cashback given" off by that amount, because the totals sum the app's ledger only (`app/lib/stats.server.ts:128, 375`).

### 2.1 "Could not be reached" or "no usable offline session": a 3-day clock is running

- **You see:**
  - Sentry "Cron payouts finished with problems", whose `firstProblem` can read "The store of connection … could not be reached" (`app/lib/payout-check.server.ts:118`; `app/lib/cron.server.ts:347-353`);
  - Sentry errors "The store has no usable offline session", tagged `webhook.topic` and `shop` (`app/routes/webhooks.orders.paid.tsx:45`; `app/routes/webhooks.orders.refunded.tsx:61`; `app/lib/webhook-helpers.server.ts:27-31, 44-48, 59`), or "authenticate.webhook answered HTTP …" when the token renewal fails (:50-53). Vercel's log line names the store: "No usable session for <shop>".
- **It means:** the store has no working token. [observed in code; inferred for the durations]
  - Shopify retries a webhook up to 8 times in 4 hours, then stops (https://shopify.dev/docs/apps/build/webhooks/troubleshooting-webhooks).
  - The sweep skips the store while it is dark (`app/lib/payout-check.server.ts:221-223`). Once the store is back, the sweep looks only 3 days back (:56, :264).
  - So an order whose last change came more than 3 days before the store is back is lost for good: no cashback, no tier spend, and no take-back for its refunds.
  - The store's payouts back off. After 24 hours they need a look as "Sending kept failing" (:86-95; `app/lib/payouts.server.ts:221-225`).
- **Do:**
  - Ask the merchant to open the app today. Opening it stores a fresh token (`app/shopify/session-storage.server.ts:11-13`).
  - Check that the next hourly run is clean.
  - Then the merchant presses Retry on each "Sending kept failing" order. There is no bulk Retry (#201).
- **Don't:**
  - Rotate `ENCRYPTION_SECRET` or `ENCRYPTION_SALT` without a re-encryption step. That sends every store dark at once (switch.md:39).
  - Credit missing orders by hand (§2.2).

### 2.2 After an outage longer than 3 days

- **You see** a dark store (§2.1), or an app or database outage, longer than 3 days. `health.yml` probes `/api/health` hourly (switch.md:44, 59), which checks the database only (`app/routes/api.health.tsx:17-27`). Or the Vercel log line "[order-source] The sweep read … orders …; older ones were not read" (`app/shopify/order-source.server.ts:766-771`), on a run recorded as succeeded (`app/lib/cron.server.ts:354-355`).
- **It means:** some orders and refunds from the gap were never recorded, and nothing tells the merchant. Fixing this properly is #193.
- **Do:**
  - List the gap's paid orders in Shopify admin and compare them with RewardsPro's Orders page. Orders can't be searched, only paged (`app/lib/stats.server.ts:691-702`).
  - [inferred, not run] Any change to an order in Shopify admin, such as a tag, should move its `updatedAt` ("when the order was last modified", https://shopify.dev/docs/api/admin-graphql/latest/objects/Order). The next hourly sweep then records the order as a late one, with its refunds, and pays it at today's rate and switch (`app/lib/payout-check.server.ts:264-299, 323-331`; `app/lib/record-order.server.ts:80-84, 107-109, 149-156`).
  - The sweep reads at most 500 orders a run (`app/shopify/order-source.server.ts:46`). So ask the merchant to tag in batches well under 500, one batch an hour, and check Orders between batches.
  - Rehearse the tagging on a dev store before asking a merchant to do it.
- **Don't** credit a missing order by hand. If the order changes later, the sweep records it and pays it again, and a fresh credit checks no history first (`app/lib/payout-check.server.ts:289-299, 323-331`; `app/lib/payouts.server.ts:215-241`).

### 2.3 A past-orders import failed

- **You see:**
  - Home's card: "Your past orders couldn't be brought in, so buyers start in the lowest tier." or "Brought in N of your past orders; the rest couldn't be read." (`app/admin/home-rules.ts:128-129`);
  - in Vercel's log only, "[import] The past-orders import of <shop> failed" (`app/shopify/bulk-import.server.ts:155`). The cron doesn't count it (:433-448), and the merchant can dismiss the card (`app/lib/merchant.server.ts:214-218`).
- **It means:** buyers' tier spend is missing the import's orders, and nothing retries a failed import (`app/lib/import.server.ts:56`). The alert is part of #201 (G14).
- **Do (Yu, SQL):**

  ```sql
  -- untested: rehearse on a scratch copy first
  -- A. read, on its own
  SELECT id, status, import_state, import_error, imported_count, import_horizon_days
  FROM rewards.connection
  WHERE external_account_id = '<shop>.myshopify.com';
  ```

  ```sql
  -- untested: rehearse on a scratch copy first
  -- B. write, only if A shows status active and import_state failed
  UPDATE rewards.connection
  SET import_state = 'not_started', import_dismissed_at = NULL
  WHERE external_account_id = '<shop>.myshopify.com'
    AND status = 'active' AND import_state = 'failed';
  -- expect: UPDATE 1
  ```

  - The next hourly run's poll starts the import again. startImport resets its attempts, cursor and error as it claims the row (`app/shopify/bulk-import.server.ts:115-130, 344-349, 421-426`).
  - While it runs, refunds of orders from before install, and redacts of buyers not seen yet, answer 503 and come again, as at install (`app/lib/import.server.ts:48-70`).
  - Orders already written are skipped by their natural key (`app/lib/import.server.ts:1-9`).
  - Clearing `import_dismissed_at` should let Home show the new outcome (`app/lib/stats.server.ts:280, 297`). [inferred]
  - A re-run without duplicates is untested.
- **Don't:**
  - Reset `import_cursor` or delete orders by hand.
  - Use uninstall-and-reinstall as a retry. After shop/redact, that erases tiers, locks and history (`app/lib/erasure.server.ts:95-136`).

### 2.4 A lost customers/redact: find the id within 7 days, finish within 30

- **You see:**
  - a Sentry error tagged `webhook.topic` `customers/redact` and `shop` (`app/routes/webhooks.compliance.tsx:121-123`; `app/shopify/webhook-hmac.server.ts:126`), with the Vercel log line "[customers/redact] <shop> failed; Shopify will deliver it again" (`app/lib/webhook-helpers.server.ts:28`);
  - or, in Vercel's log only, "no such customer while the past-orders import runs", answered 503 (:101-104), past Shopify's 4 hours of retries. [inferred: the privacy page below doesn't say compliance topics are retried like others]
- **It means:** a buyer's data wasn't erased.
  - The buyer's id is only in the delivery's payload (:92-107). The app's logs and Sentry carry no buyer id (:22-24; `app/lib/webhook-helpers.server.ts:21-31`).
  - Shopify expects the action within 30 days of the request (https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance).
  - The Dev Dashboard's delivery log covers 7 days, and its documented fields include the payload's size but not its body (troubleshooting page above). [inferred: the id may not be recoverable there]
- **Do:**
  - Within 7 days, look for the failed delivery in the Dev Dashboard.
  - If it doesn't show the customer, ask the merchant which customer asked to be erased.
  - Keep the id out of GitHub and out of agents' chats.
  - Then use #200's tool.
  - If #200 hasn't landed with 10 of the 30 days left, don't improvise SQL. Ask an agent to write a one-off script from `redactCustomer` (`app/lib/erasure.server.ts:178-217`), the code a delivered redact runs, and rehearse it on the scratch copy (§1 row 3) before you run it. Run it only when the store's import is done or failed, or the store is uninstalled: while the import can still write, it can bring the buyer back (:159-166).
  - To see what it would touch, read first:

  ```sql
  -- untested: rehearse on a scratch copy first
  -- A. read, on its own: expect exactly one row, with import_state done or failed
  SELECT c.id, c.redacted_at, n.status, n.import_state
  FROM rewards.customer c JOIN rewards.connection n ON n.id = c.connection_id
  WHERE n.external_account_id = '<shop>.myshopify.com' AND c.external_customer_id = '<customer id>';
  ```

- **Don't** erase a customer the merchant hasn't confirmed.

### 2.5 A read-limit order (20 refunds, or one very large refund)

- **You see:**
  - for about 4 hours, Sentry errors tagged `webhook.topic` and `shop` whose message names the limit, such as "Shopify gave 20 refunds, the most one read takes; there may be more" (`app/shopify/order-source.server.ts:307, 331, 675`; `app/routes/webhooks.orders.refunded.tsx:65-68`; `app/routes/webhooks.orders.paid.tsx:48-51`; `app/lib/webhook-helpers.server.ts:66-78`). Vercel's log names the order or refund: "Could not read refund … for <shop>";
  - after that, for an order with 20 or more refunds, only the log line "past what one read takes" (`app/lib/payout-check.server.ts:247-250`);
  - for a refund with 20 or more transactions or shipping lines, or more than 100 lines, a problem in every hourly run for 3 days (`app/shopify/order-source.server.ts:330-332, 351-352`; `app/lib/payout-check.server.ts:399-400`).
- **It means:**
  - That refund, and every later refund of the order, is never recorded (`app/shopify/order-source.server.ts:672-678, 725-731`). Nothing is taken back, and the buyer's spend stays too high.
  - If the limit was hit at payment, the order itself is never recorded: no cashback and no spend (`app/lib/payout-check.server.ts:301-310`).
  - Tracked in #201 (G15). [observed]
- **Do:**
  - For each unrecorded refund, work out the take-back as the app would: the cashback × the refund's product value ÷ the order's product value, rounded down and capped at what is left; a refund that returns the last items takes all that is left (`app/lib/order-facts.ts:106-120`). The merchant debits that by hand.
  - For an unrecorded order, the merchant credits the cashback by hand.
  - Either way, lock the buyer to the tier their true spend reaches (`app/routes/app.customers.$id.tsx:88-97`).
- **Don't** expect "Cashback given" to match afterwards.

### 2.6 A store still "active" after it uninstalled

- **You see:**
  - every hourly run reports the store as unreachable (§2.1), and its payouts end "Sending kept failing";
  - the Dev Dashboard, which lists the app's installs (switch.md:107), no longer lists it;
  - its shop/redact at 48 h was skipped because the store looked active (`app/lib/erasure.server.ts:115-123`).
- **It means:** app/uninstalled was lost after Shopify's retries. The store is never erased, and it adds a problem to every run. [inferred]
- **Do (Yu, SQL)**, only once the Dev Dashboard shows the app isn't installed there:

  ```sql
  -- untested: rehearse on a scratch copy first
  -- A. read, on its own
  SELECT id, status, activated_at, last_auth_at, uninstalled_at
  FROM rewards.connection
  WHERE external_account_id = '<shop>.myshopify.com';
  ```

  ```sql
  -- untested: rehearse on a scratch copy first
  -- B. write, only if A shows status active and no last_auth_at after the uninstall
  UPDATE rewards.connection
  SET status = 'uninstalled', uninstalled_at = now() AT TIME ZONE 'UTC'
  WHERE external_account_id = '<shop>.myshopify.com' AND status = 'active';
  -- expect: UPDATE 1
  ```

  - A `last_auth_at` after the uninstall means the merchant opened the app since, so it is installed: stop (`app/lib/merchant.server.ts:243-253`).
  - The jobs then skip the store (`app/lib/payout-check.server.ts:144, 208-209`).
  - Housekeeping erases it 30 days later, which can't be undone (`app/routes/api.cron.housekeeping.tsx:15-20, 111-133`).
  - If the merchant opens the app before then, the store becomes active again and keeps its data (`app/lib/merchant.server.ts:118-121`).
- **Don't** delete its rows by hand.

### 2.7 After a shop/redact, RewardsPro holds nothing

- **You see:** a merchant who uninstalled more than 48 hours ago (when Shopify sends shop/redact: the privacy page in §2.4) asks about earlier cashback, and RewardsPro shows nothing from before.
- **It means:** shop/redact deleted every row of the store, the ledger included (`app/lib/erasure.server.ts:95-136`). A reinstall starts afresh, and refunds of first-install orders take nothing back (`app/lib/record-order.server.ts:61`). By design. [observed]
- **Do:** answer from Shopify. Each buyer's store credit history in Shopify admin is now the only record.
- **Don't** try to rebuild the old ledger.

### 2.8 A wrong needs-a-look answer

There is no undo in the app (`app/lib/payouts.server.ts:707-780`). Each wrong answer is fixed by hand in Shopify, as below. Every answer except Close leaves the app's books consistent afterwards. [observed]

| Answer given wrongly | What happened | Fix by hand | Books after |
|---|---|---|---|
| It arrived (it hadn't) | The buyer didn't get it; the app counts it given | Add the credit | Consistent |
| It didn't arrive, send it (it had) | The buyer got it twice | Take one back | Consistent |
| It was taken back (it wasn't) | The buyer keeps it | Take it back | Consistent. If the take-back died mid-send, the amount taken is unknown (:758-763) |
| It wasn't taken back, try again (it was) | Taken twice | Add one back | Consistent |
| Retry, after a credit added by hand | Paid twice | Take the extra back | Consistent |
| Close without sending, then a credit by hand | "Given" leaves it out, and later refunds never take it back (`app/lib/refunds.server.ts:103-105`) | On each later refund, also take back its share by hand | Off: "given" stays low |
| Close without taking back, then a debit by hand | The history says "Take-back closed: the buyer keeps it" (`app/admin/customer-history.server.ts:117`) | Nothing more | Off: "given" stays high |

- **Don't** choose Close plus a hand credit while Retry could still work. Retry is safe as long as nothing was added by hand. #199 proposes "I added it by hand" and "I took it back by hand" answers.

### 2.9 A large tier won't delete

- **You see:** deleting a tier with many members ends in an error page. [inferred: the 60-second transaction ran out] (`app/lib/tiers.server.ts:459, 582-606`). It has never been timed (gates.md:48).
- **Do:**
  - Edit the tier and raise its minimum above every buyer's spend, to a number no other tier uses.
  - That save asks for a tier pass. Members then move during the after-save run and the nightly passes, outside one transaction (`app/lib/tiers.server.ts:513-516, 558`; `app/routes/api.cron.tiers.tsx:42-45`). Buyers locked to it stay until the delete clears their lock (`app/lib/tiers.server.ts:597-602`). Delete the tier once few members are left.
  - To stop its effect at once, set its rate to the next lower tier's. The rate is read as each order is recorded (`app/lib/record-order.server.ts:149-156`).
- **Don't** retry the delete during the merchant's busy hours. It holds the merchant's tier lock while it runs (`app/lib/tiers.server.ts:451-459`).

### 2.10 A wrong rate went out

- **You see:** a tier or base rate far too high, such as 50 for 5. It saved with no confirm and shows at once in Tiers and in the widget (`app/lib/tiers.server.ts:36-40`; `app/routes/app.tiers.tsx:119-131`; `app/routes/app._index.tsx:173-181`).
- **It means:** every order paid since the change earned at that rate, and its credit went out right after payment (`app/routes/webhooks.orders.paid.tsx:59-64`). Off doesn't recall it (`app/lib/record-order.server.ts:107-109`).
- **Do:**
  - Fix the rate first.
  - For each order paid since the change, the excess is the cashback given less the cashback at the right rate. The merchant debits that by hand from each buyer.
- **Numbers that stay off:**
  - "Cashback given" keeps the full cashback (`app/lib/stats.server.ts:128, 375`).
  - A later refund of one of those orders takes back a share of the full cashback (`app/lib/refunds.server.ts:222-229`), capped at the live balance (`app/lib/payouts.server.ts:255-258`). After the hand debit it takes too much, so the merchant adds the difference back by hand, or accepts it.
  - The confirm is #201 (G9).
- **Don't** switch cashback off as the fix. It stops new cashback only.

### 2.11 Before any restore of the database

- **It means:** a pending credit is sent with no check of Shopify's history (`app/lib/payouts.server.ts:215-241`). A restore to a point before some sends would put them back to pending, and the hourly job would send them again. [inferred] There is no pause today (§1 row 2).
- **Do:**
  - Until #198 exists, restore only into a scratch project.
  - With #198: pause payouts, restore, and check every payout sent after the restore point against the buyer's store credit history in Shopify. Then resume.
- **Don't** restore schema `rewards` in production while payouts can move.

### 2.12 A take-back on an order edited after payment, or an exchange

- **You see:** an order whose items were added after payment, or one with an exchange, then a refund marked "Taken back" for cashback the kept items earned. [observed in code; inferred for exchanges] The order was recorded once, at payment (`app/lib/record-order.server.ts:177-178, 197-204`). Its refunds are valued on the order's current lines (`app/shopify/order-source.server.ts:502-507, 731`) against the value stored at payment (`app/lib/refunds.server.ts:199-217`).
- **Do:**
  - The merchant credits the wrongly taken part back by hand.
  - Lock the tier if it dropped.
  - A later refund of the same order never takes that hand credit back (`app/lib/order-facts.ts:114-115`). So on a later full return, take it back by hand too.
  - The fix is #190; the exchange case needs a dev-store run.

### 2.13 Old orders imported after install by a migration app

- **You see:** a burst of Issued orders with old processed dates, and a jump in "Cashback given".
- **It means:** the app dates an order by its `createdAt` (`app/shopify/order-source.server.ts:294`; `app/lib/record-order.server.ts:62`). An order created through the API can't set `createdAt`: the input has none, and an importing app sets `processedAt` in the past instead (https://shopify.dev/docs/api/admin-graphql/latest/input-objects/OrderCreateOrderInput). So each imported paid order with a customer earns, and counts toward tiers. [inferred: not run with orderCreate]
- **Do:**
  - Before: the merchant switches cashback off. It stops the cashback, but the orders still count toward tiers, so plan the tier locks too.
  - After: the merchant debits each buyer by hand and locks tiers. There is no bulk undo.
  - The fix is #194.

### 2.14 "Products returned £0.00" on a money-only refund

- **You see:** a money-only refund valued at £0.00.
- **It means:** a money-only refund is valued on settled money only, and its row is final (`app/shopify/order-source.server.ts:354, 463`; `app/lib/refunds.server.ts:152-169`). Shopify sends refunds/create "independent from the movement of money" (https://shopify.dev/docs/api/admin-graphql/latest/enums/WebhookSubscriptionTopic). So money still pending at that moment counts for nothing. [inferred for which gateways do this]
- **Do:** the merchant debits by hand the cashback × (the refund less its shipping) ÷ the order's product value. The fix is #195.

### 2.15 "Checking with Shopify whether it arrived", for days

- **You see:** an order stays Waiting with that line (`app/lib/order-status.ts:92`), and every hourly run counts it as a problem (`app/lib/payout-check.server.ts:138-143`).
- **It means:** an unclear answer that never clears loops each hour and never needs a look (`app/lib/payouts.server.ts:103-105, 480-493, 640-644`). [inferred] If Home's banner says store credit is turned off, the merchant turning it back on ends the loop (`app/admin/home-rules.ts:186, 207-214`). The fix is #197.
- **Do (Yu, SQL)**, otherwise. Starting the failure clock lets the app's own steps decide what happens next:

  ```sql
  -- untested: rehearse on a scratch copy first
  -- A. read, on its own: this store's credits that keep looping
  SELECT p.id, p.state, p.attempts, p.last_error, p.created_at
  FROM rewards.payout p JOIN rewards.connection n ON n.merchant_id = p.merchant_id
  WHERE n.external_account_id = '<shop>.myshopify.com'
    AND p.direction = 'credit' AND p.state IN ('unconfirmed', 'pending')
    AND p.first_failed_at IS NULL AND p.attempts >= 3
  ORDER BY p.created_at;
  ```

  ```sql
  -- untested: rehearse on a scratch copy first
  -- B. write, one payout at a time, away from :30, when the hourly payouts job starts (vercel.json:8)
  UPDATE rewards.payout
  SET first_failed_at = (now() AT TIME ZONE 'UTC') - interval '24 hours'
  WHERE id = '<payout id>' AND state IN ('unconfirmed', 'pending') AND first_failed_at IS NULL;
  -- expect: UPDATE 1
  ```

  - An unconfirmed one is settled by the next run from Shopify's history (`app/lib/payouts.server.ts:619-647`). Found there: it becomes sent. Unclear: it needs a look as "couldn't confirm". Not there: it goes back to pending.
  - A pending one needs a look as "Sending kept failing" at its next claim, without asking Shopify (`app/lib/payouts.server.ts:221-225`). Settle had already found it not there.
  - The merchant can then Retry or Close.
  - Retry starts the loop again unless its cause is gone. Close ends it, and §2.8's Close row then applies.
- **Don't** set `state` by hand.

### 2.16 A chargeback, or a refund made outside Shopify

- **It means:** Shopify's transaction kinds have no chargeback (https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderTransactionKind), and the app subscribes to no disputes topic (`shopify.app.toml:21-49`). So nothing is taken back, and the order still counts toward tiers (`app/lib/tiers.server.ts:96-104`).
- **Do:**
  - The merchant records a £0 refund of the items in Shopify. The app values it by its items, takes the share back, and its numbers stay consistent (`app/shopify/order-source.server.ts:380`; `test/unit/shopify/order-source.test.ts:488-492`).
  - [inferred: that Shopify accepts it after a chargeback; a dev-store check in #201]
  - A money-only refund made outside Shopify has no such mirror: the merchant debits by hand.

### 2.17 A changed or merged customer

- **It means:** Shopify can set a new customer on an order (https://shopify.dev/docs/api/admin-graphql/latest/mutations/orderCustomerSet). The app keeps an order on its first buyer (`app/lib/record-order.server.ts:166-204`) and has no customers/merge topic (`shopify.app.toml:18-44`). Shopify won't merge a customer who holds store credit (https://shopify.dev/docs/api/admin-graphql/latest/enums/CustomerMergeErrorFieldType), so a merge mostly splits the tier spend of buyers who never earned. [inferred] #201 (G8).
- **Do:**
  - Lock the right buyer to the tier their spend reaches, and move the credit by hand.
  - After a merge in Shopify, lock the customer that was kept.

## 3. What merchants should be told

Each line below is how RewardsPro behaves today, and nothing a merchant reads says it. Line 13 is a stopgap until #194 lands. These are **proposals**, not live copy:

- for the help page (RP-09, #169);
- for the admin lines (RP-10, #170, and RP-12, #172);
- each needing a row in the claims ledger (RP-06, #166) that a second session concurs on before it ships.

| # | Proposed line | Code it rests on |
|---|---|---|
| 1 | RewardsPro takes cashback back by itself when you refund, from the buyer's whole store credit balance. Don't also take it back by hand. | `app/lib/payouts.server.ts:242-262`; Home today says only "every paid order earns" (`app/admin/home-rules.ts:49`) |
| 2 | Credit you add or remove by hand in Shopify isn't counted in "Cashback given", in the app or its CSV. | `app/lib/stats.server.ts:6-9, 128, 375`; `app/routes/app.customers.export.tsx:71` |
| 3 | Off stops new cashback only. Cashback already earned is still sent, and still taken back on a refund. | `app/lib/record-order.server.ts:107-109`; `app/lib/refunds.server.ts:206-229` (no switch check before a take-back) |
| 4 | Uninstalling erases your tiers and history after 48 hours, and cashback still owed is never paid. Clear any "needs a look" first. | `app/routes/webhooks.app.uninstalled.tsx:1-5`; `app/lib/erasure.server.ts:95-136`; 48 hours: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance |
| 5 | If your prices exclude tax, refunding an amount also takes back the tax's share. Refund the items instead. | `app/shopify/order-source.server.ts:316-321, 463` (Ruling 12) |
| 6 | RewardsPro doesn't see chargebacks or refunds made outside Shopify. Record a £0 refund of the items in Shopify. | `shopify.app.toml:21-49`; `app/shopify/order-source.server.ts:380` [inferred: Shopify accepts it after a chargeback] |
| 7 | A refund made as store credit can come back less the cashback that order earned. | `app/lib/payouts.server.ts:242-262` [inferred] |
| 8 | Cashback is sent as soon as an order is paid, so a fraudster can spend it before you cancel. | `app/routes/webhooks.orders.paid.tsx:59-64`; `app/lib/payouts.server.ts:255-258` |
| 9 | Every sales channel earns when the order has a customer (POS, marketplaces, subscriptions). Orders with no customer don't earn. | `app/lib/record-order.server.ts:92`; no sales-channel field is read anywhere in `app/` (git grep at 9efc2f34); Home's "every paid order" (`app/admin/home-rules.ts:49`) |
| 10 | "All time" counts orders from 12 months (or 60 days) before you installed RewardsPro. | `app/shopify/bulk-import.server.ts:37-39, 86-91` |
| 11 | A credit of the same amount added by hand a few minutes after a "Waiting" cashback can be taken for it. | `app/lib/payouts.server.ts:335-342, 364-390` |
| 12 | "Cashback given" counts cashback when it is earned, not when it is sent. | `app/lib/stats.server.ts:6-9, 128` |
| 13 | Switch cashback off before importing old orders with a migration app. They still count toward tiers. | §2.13 (#194) [inferred] |
| 14 | Adding a customer to a paid order makes it earn within the hour, at today's rate. | `app/lib/payout-check.server.ts:270-299` [inferred] |

## 4. Sources

- This file comes from a read-only review of manual intervention that agents ran on 2026-11-09. They read the code at 9efc2f34 and ran nothing.
- The review itself is agent work kept outside this repo. The code lines cited in each entry are the evidence, so a reader can check every claim here without it.
- Shopify facts come from shopify.dev only:
  - https://shopify.dev/docs/apps/build/webhooks/troubleshooting-webhooks (8 retries in 4 hours; 7 days of delivery logs; the details panel's fields);
  - https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance (shop/redact 48 hours after an uninstall; 30 days to act);
  - https://shopify.dev/docs/api/admin-graphql/latest/enums/WebhookSubscriptionTopic (refunds/create and the movement of money);
  - https://shopify.dev/docs/api/admin-graphql/latest/input-objects/OrderCreateOrderInput (no `createdAt`; an importing app sets `processedAt` in the past);
  - https://shopify.dev/docs/api/admin-graphql/latest/objects/Order (`updatedAt`);
  - https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderTransactionKind (no chargeback kind);
  - https://shopify.dev/docs/api/admin-graphql/latest/mutations/orderCustomerSet (setting a customer on an order);
  - https://shopify.dev/docs/api/admin-graphql/latest/enums/CustomerMergeErrorFieldType (STORE_CREDIT blocks a merge).
- Dev-store runs that would confirm entries:
  - an even and an uneven exchange (§2.12);
  - an `orderCreate` import (§2.13);
  - a refund on a gateway that settles late (§2.14);
  - a £0 item refund after a chargeback (§2.16);
  - the tag-to-resweep path (§2.2);
  - each SQL block, on a scratch copy.
- `apps/rewardspro/marketing/WORK.md:22-27` keeps `gates.md`, `switch.md` and `staging-run.md` with the session running the B4 gates. This file edits none of them. Whether `switch.md` links here is that lane's call, and Yu merges.
