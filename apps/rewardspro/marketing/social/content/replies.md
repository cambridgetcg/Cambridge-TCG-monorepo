# RewardsPro reply templates

Content maker (agent), 2026-11-07, revised the same day after the verifier's review. **PROPOSAL for the owner.** Claim ids
and stages work as in [`launch-posts.md`](launch-posts.md) ("How to read this file"). Character counts are code
points, counted by script on 2026-11-07.

## 0. Where these may be used, and how

**Use them for:**
- comments on the RewardsPro LinkedIn Page and YouTube channel, from S2;
- email to and from contact@rewardspro.io, once the owner's delivery test has passed and rp-contact-delivers is `verified`
  (STRATEGY §13 step 10);
- developer replies to reviews on the App Store listing (the owner's hand in the Partner Dashboard).

**Never use them on:**
- **Shopify Community:** "Posting generic, templated, or AI-generated messages" is prohibited
  (community.shopify.com/guidelines, fetched 2026-11-07), and the strategy says agents never write anything shaped
  like a Community reply (§3, §14). The owner answers there in his own words.
- **Reddit:** r/shopify Rule 10: "Obvious or suspected AI content is not welcome here in any form." (`p1-market.md`,
  rendered once on 2026-11-07; not re-verifiable later that day, see `community-rules.md` §4.1.)
- **Private messages to anyone who didn't write first.** PECR counts social DMs as electronic mail (ICO, key
  concepts for electronic mail, read 2026-11-07), and the PPA says "Do not email a Merchant without their prior
  consent." (ppa.txt:330)

**Limits per channel:** LinkedIn comment and YouTube comment caps weren't researched [U]. Shopify's review page
(shopify.dev/docs/apps/launch/marketing/manage-app-reviews, read 2026-11-07) states no cap for a developer reply
[U]. The longest public reply here is R-FREE-1 (349 characters); R-PARTNER is email only.

**How:**
- The owner (or whoever he names) reads, edits and sends every reply by hand. No auto-replies, no reply bots, no scheduled
  replies. LinkedIn bans automated commenting (help answer a1341387); X bans automated keyword replies and AI reply
  bots without approval (X Automation rules, April 2026).
- **Answer in public in one or two sentences, then move the detail to email.** Never ask anyone to post order
  details, store data or customers' details in a comment.
- **Never paste or ask for shopper personal data.** The order number is enough to find an order; RewardsPro stores
  order names like that (`p1-truth.md` §8; `prisma/schema.prisma`). In public comments write it without the # (like
  1001), because LinkedIn may turn "#1001" into a hashtag [I]; in email, #1001 is fine. Examples use @example.com.
- **Use only ledger sentences** for facts, with their rows `verified`. If a question needs a fact that has no row,
  say you'll answer by email, and ask the claims maker for a row. Don't improvise a fact in public.
- **Every sentence that gives contact@rewardspro.io** relies on rp-contact-delivers ("Questions reach us at
  contact@rewardspro.io."), so none is used before that row is `verified`.
- **Voice** (STRATEGY §4): plain and calm, the company "we", no exclamation marks, at most one emoji (default none),
  no "instant", no "seamless", no "loyalty program", no "points" in our own words. **Register: business** (the owner,
  2026-11-07: "用loyal customers, take a more business approach on wordings."; `../../approvals.jsonl`): "Thank you"
  rather than "Thanks", no chatty openers ("Good question", "that's useful to know"), and "loyal customers",
  never "regulars", if a reply needs to name them (`../../MESSAGING.md` §4).
- **No time promises.** Not "within 24 hours", not "24/7" (STRATEGY §4, never-say 15).
- **Email replies** are signed "Cambridge TCG Limited, for RewardsPro" plus contact@rewardspro.io, with no personal
  details. Where the AI-drafting line goes (profile only, or every message) is D5. Until the owner decides, the templated
  emails below (R-SUP-2, R-PARTNER) carry "Drafted with AI help and checked by a person." above the signature, so a
  copy can't drop it.
- **Personal data** from inbound mail (names, addresses, notes) stays in `marketing/social/private/` or the mailbox,
  never in git. `private/` is git-ignored (`marketing/.gitignore:9`).

**Stage of each template:**
- `pre-S2` means it may be used in email once contact@ delivers, and its rows are `verified`.
- `after G0` means at least one of its rows needs the G0 observation.
- `S2` means it may be used once the channels open.
- `S3` means after the PPA answer and the partner terms.

---

## 1. Support questions: send them to contact@rewardspro.io

**R-SUP-1 · public comment, someone asks for help · 254 chars · S2 (comments), after rp-contact-delivers verified**

> Thank you for your question. To keep private details out of a public comment, please email contact@rewardspro.io
> with your store's .myshopify.com address and, if it is about an order, the order number (like 1001), but not your
> customers' names or emails.

- Claims: [rp-contact-delivers]. The address is the app's own help address
  (`app/routes/app.settings._index.tsx:16, 65-69`) and the listing's support email (apps.shopify.com/rewards-pro,
  2026-11-07), but that it delivers is what the row's test proves.
- Never give `support@rewardspro.io` (docs.rewardspro.io still shows it; whether it delivers is [U], `p1-live.md`
  G22), and never link docs.rewardspro.io.

**R-SUP-2 · first email reply · skeleton · pre-S2**

```
Subject: Re: <their subject>

Hello,

Thank you for your email about <topic>.

<The answer, using only verified ledger sentences. One fact per sentence. If a fact has no row:
"We'll check that and come back to you." Nothing else.>

If this is about a specific order, its order number (like #1001) is enough for us to find it. Please don't
send your customers' names or emails.

In the app, Settings has a Help section with our address, contact@rewardspro.io.

Drafted with AI help and checked by a person.

Cambridge TCG Limited, for RewardsPro
contact@rewardspro.io
```

- The Settings line is rp-help-in-settings word for word (added to the ledger 2026-11-07;
  `app/routes/app.settings._index.tsx:65-69`). It travels with rp-contact-delivers, so the skeleton waits for both.
- The AI line stays until the owner's D5 says otherwise (§0).
- No reply-time promise, and no "we'll fix it" before we know there is a fault.

---

## 2. "Is it really free?"

**R-FREE-1 · public comment or email · 349 chars · after G0 (email once contact@ delivers; comments at S2)**

> RewardsPro is free for every store that installs it, and no paid plans are offered. [rp-free] The cashback is
> store credit in your own shop, so you fund the cashback you give. [rp-merchant-funds] For Shopify stores created
> on or after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store
> credit. [sh-sc-fee] The rate depends on your Shopify plan. [rate clause: NO-ROW until the claims maker adds it to
> sh-sc-fee]

- Every sentence is a ledger sentence word for word, except the rate clause. The first draft opened "RewardsPro
  itself charges nothing", which is no ledger sentence, sits next to never-say 1 ("costs nothing") and says more
  than rp-free.
- **Stage:** `after G0`, because rp-merchant-funds' sentence states the store-credit mechanism, which rp-store-credit
  says needs the G0 observation (`launch-posts.md` §1.1).
- **Never to a store that still has an active paid agreement.** "A shop that still has an active paid agreement is
  never told RewardsPro is free" (`docs/decisions/2026-10-20-rewardspro-free-only-relaunch.md:22`), and two frozen
  stores still hold paid charges from the old app until RewardsPro's owner cancels them (`docs/switch.md:235` at 6f3a57b6, `:267` at
  6bd092cb, Decision 20; rp-free's contrary evidence). If the asker might be one of them, answer by email after
  checking. rp-free itself isn't to be verified until those charges are cancelled or the owner accepts the row in writing
  (its uncertainties).
- **Is the fee note confirmed?** Yes, two Shopify pages fetched 2026-11-07 say so:
  - help.shopify.com/en/manual/customers/store-credit: "For Shopify stores created on or after May 12, 2025, orders
    that include store credit as a payment method are charged third-party transaction fees on the order amount paid
    for using store credit."
  - help.shopify.com/en/manual/your-account/manage-billing/billing-charges/types-of-charges/third-party-charges/third-party-transaction-fees:
    it applies "on the amount paid for using store credit or gift cards" and doesn't apply to stores created before
    12 May 2025; "The rate for third-party transaction charges varies depending on your pricing plan."

  Never quote a percentage. "No transaction fees" is false as worded (`p1-truth.md` §11 row 40).
- If they ask what else they need, add [sh-sc-signin-legacy]: "Customers can spend store credit at checkout when
  signed in with Shopify's new customer accounts or with Shop Pay; it isn't available for legacy customer accounts."

**R-FREE-2 · "Will it stay free?" · 77 chars · pre-S2 (email), S2**

> No paid plans are offered today. We don't make promises about future pricing.

- Claims: [rp-free], following its wording ("no paid plans are offered"). Being free-only was an agents' reversible call
  (`docs/decisions/2026-10-20-rewardspro-free-only-relaunch.md`, repo root), so nothing about the future is promised.
  Never "free forever" or "always free". The same rule as R-FREE-1 applies to stores with a paid agreement.
- If the owner decides D4 the other way (a commitment of notice before any paid plan), replace the second sentence with his
  exact words. Agents don't write that promise.

---

## 3. Feature requests

**R-FEAT-1 · any feature request · 190 chars · S2 (comments), pre-S2 (email); after rp-contact-delivers verified**

> Thank you. We've recorded the request. We can't say whether or when it will be in RewardsPro, so we won't give
> a date. If you'd like to tell us how you'd use it, email contact@rewardspro.io. [rp-contact-delivers]

- "We've recorded the request" has to be true: the request goes into `marketing/social/private/requests.md` (git-ignored), with
  the date and channel and no personal data beyond what is needed.
- In an email reply, end with "reply to this email" instead of the address.
- No "coming soon", "on our roadmap" or "great idea, we'll build it".

**Questions about things we haven't checked.** These answer honestly instead of guessing. Each one stays this way
until its held item (STRATEGY §6.4) is observed and has a row.

| Id | Question | Reply (chars) | Claims | Stage |
|---|---|---|---|---|
| R-HELD-POS | Does it work with POS? | "Shopify lets customers spend store credit on POS. Whether orders taken on POS earn cashback in RewardsPro is something we haven't checked in a store yet, so we won't say they do until we have." (192) | sh-sc-channels; POS earning never observed (STRATEGY §6.4) | after claim sh-sc-channels verified |
| R-HELD-CUR | Multiple currencies? | "We haven't checked RewardsPro with orders in more than one currency yet, so we won't say how it behaves until we have. At checkout, Shopify shows only the store-credit balance in the checkout's currency." (203) | sh-sc-currency; gate N open (`app/lib/money.ts:26`) | after claim sh-sc-currency verified |
| R-HELD-GUEST | Do guests earn? | "Guests see your base rate and a sign-in prompt in the widget. Whether an order placed as a guest earns cashback is something we haven't checked yet, so we won't say either way." (176) | rp-widget; guest checkout is [U] (STRATEGY §6.4) | after G0 (rp-widget) |
| R-HELD-LEGACY | Legacy customer accounts? | "Shopify's store credit isn't available for legacy customer accounts. Customers spend it at checkout when signed in with Shopify's new customer accounts or with Shop Pay." (169) | sh-sc-signin-legacy | after claim sh-sc-signin-legacy verified |
| R-HELD-TIME | How fast is cashback added? | "Cashback is added when an order is paid; it doesn't wait for the order to be fulfilled. We haven't timed it on a live store, so we don't quote a time." (150) | rp-paid-trigger; production timing not observed | after G0 |
| R-HELD-SPEED | Will it slow my store? | "We haven't measured the widget's effect on page speed, so we don't make a claim about it." (89) | Lighthouse not run (`docs/staging-run.md:81`) | pre-S2 |
| R-HELD-PAST | Does it count past orders? | "When you first open RewardsPro, it brings in your past orders, from up to 12 months before install, so customers start in the right tier. Past orders earn no cashback." (167) | rp-import-past (added to the ledger 2026-11-07; "up to 12 months" holds where Shopify grants `read_all_orders`, which production has on rewardsprotesting, `docs/switch.md:75` at 6bd092cb) | after claim rp-import-past verified (its B4 check P is MISSING) |
| R-HELD-DATA | Where is my data? / GDPR? | Before S2: "Please email contact@rewardspro.io and we'll answer there." (58). From S2: "Our privacy page lists what RewardsPro stores and who processes it: rewardspro.io/privacy-policy" (96) | rp-contact-delivers for the first; the rewritten privacy page is S2 condition (d). Never "data in London" or "GDPR compliant" (STRATEGY §4, never-say 6). | after rp-contact-delivers verified / S2 |

---

## 4. Complaints

**R-COMP-1 · public complaint, facts unclear · 211 chars · S2, after rp-contact-delivers verified**

> We're sorry to hear this. Please email contact@rewardspro.io with your store's .myshopify.com address and, if
> there is one, the order number, so we can look into it. Please leave customers' names and emails out.
> [rp-contact-delivers]

- It opens with sympathy, not an admission: the facts aren't known yet (§1, no "we'll fix it" before we know there
  is a fault).
- Don't argue in public, and don't delete or hide criticism. Remove only spam or abuse, under the platform's own
  rules.
- If they already emailed: "We've got your email and we're looking into it." Only say it if it's true.

**R-COMP-2 · we said something wrong · 167 chars with placeholders as written · S2**

> Thank you for pointing this out. You are right. We said: <old sentence>. What is true: <new sentence>. We've
> posted a correction and added it to rewardspro.io/changes.

- Send it only after the correction (CORR, A9) is posted and `/changes` is updated. The correction rule is
  STRATEGY §5.

**R-COMP-3 · the complaint is about one of Shopify's rules · 171 chars with placeholders as written · S2**

> That part is Shopify's rule rather than one RewardsPro sets: <sentence of the sh-* row>. Shopify's help page
> explains it: help.shopify.com/en/manual/customers/store-credit

- Fill it with one sh-* sentence, word for word, such as [sh-sc-full]: "Shopify applies the full store-credit balance
  at checkout; customers can't choose part of it."
- Plain fact, no blame. PPA §2.1 bars "false, misleading or disparaging" statements about Shopify (ppa.txt:337).
  Never say Shopify "can't" do something unless a Shopify page says so (STRATEGY §4, never-say 16).

**R-COMP-4 · reply to a negative App Store review · 178 chars with placeholders as written · whenever a review
exists, after rp-contact-delivers verified**

> Thank you for the review. <One sentence on what we found or changed, only if it is true and its claim is
> verified.> If you'd like us to look further, email contact@rewardspro.io. [rp-contact-delivers]

- Never ask for the review to be changed or removed, and never offer anything in return. Shopify App Store
  requirement 1.3.1: "It is forbidden to offer incentives or withhold features in exchange for reviews, regardless
  of whether this occurs through the app or external channels." (shopify.dev app-store-requirements, read
  2026-11-07.) Also DMCCA 2024 Sch 20 para 13, and CMA208 on suppressing genuine negatives
  (`ref/be-marketing-RESEARCH.md` §3.1).
- PROPOSAL (ours, not a Shopify rule): reply to every review, in neutral words. Shopify's page says replying "can
  help you identify issues, engage with merchants" (shopify.dev/docs/apps/launch/marketing/manage-app-reviews, read
  2026-11-07).

**R-LEAVE · "How do I stop / uninstall?" · 125 chars · pre-S2 (email), S2; after rp-contact-delivers verified**

> You can uninstall RewardsPro from the Apps page in your Shopify admin. If you'd like help first, email
> contact@rewardspro.io. [rp-contact-delivers]

- Source: help.shopify.com/en/manual/apps/uninstalling-apps, fetched 2026-11-07 (HTTP 200): "You can uninstall an
  app from your store from the Apps page in your Shopify admin."
- **Optional** (196 chars): "If you only want to stop new cashback for a while, you can switch cashback off in
  RewardsPro; orders still count towards tiers while it's off. Orders paid while it's off don't earn cashback
  later." [rp-switch-off, word for word; the last sentence is the limit the row's
  uncertainties ask for, from staging check H, "nothing was owed later"]. Stage: after claim rp-switch-off verified
  (its B4 check H is MISSING). The row already reads UK "towards" (ledger checked 2026-11-07, 12:58 UTC).
- **Held:** what happens to data after uninstall (erasure timing needs gate J), and whether store credit already given
  stays with customers (code reading only, no row). Answer those by email once rows exist.

---

## 5. "Do you do points / raffles / mystery boxes?"

The rebuild has none of these. The ledger's rp-scope ("RewardsPro pays cashback as Shopify store credit and runs VIP
tiers by spend; it offers no other reward types.", added 2026-11-07, channels social-post and outreach) says so
without naming any removed feature, so it doesn't wait on D9; it waits on G0 for its positive half and on its guard
test. The rows that name features, rp-no-points ("RewardsPro has no points or missions; it rewards with store credit
only.") and rp-no-chance ("RewardsPro has no raffles, mystery boxes or instant wins."), are `channels =
["internal"]`, each without its guard test. So **no absence answer below can be used yet.** The honest answer is **"absent", not "paused"**: "paused" described the old app's
`CHANCE_MECHANICS_PAUSED` constant, and the rebuild has no such feature to pause. By default we don't name removed
features in public (D9), and the checker's chance-word rule blocks those words.

**R-PTS-1 · default, D9 = no · 110 chars · after G0, and after rp-scope's guard test**

> RewardsPro pays cashback as Shopify store credit and runs VIP tiers by spend; it offers no other reward types.
> [rp-scope]

- rp-scope word for word. It names no removed feature, so it doesn't depend on D9.
- The earlier "before G0, by email only" variant ("RewardsPro doesn't do that.") is withdrawn: it rested on the
  internal-only rows.

**R-PTS-2 · "Will you add it?" · 103 chars · as R-PTS-1**

> It isn't part of the current version. If that changes, we'll post it here and on rewardspro.io/changes.

- The first sentence rests on rp-scope, like R-PTS-1. The first draft said "It isn't planned", sourced to the
  rebuild design's non-goals, which sit only on PR #142's branch and are headed "Non-goals (not in this project)":
  they cover the rebuild, not the future, so that sentence is withdrawn.
- The second sentence is a promise; the corrections and `/changes` rules make it keepable.

**R-PTS-D9 · only if the owner decides D9 = yes and the chance-word rule is amended · 174 chars**

> The current version of RewardsPro has no points or missions, and no raffles, mystery boxes or instant wins. It
> pays cashback as Shopify store credit, with VIP tiers by spend.

- Claims: [rp-no-points, rp-no-chance] in their own words, plus [rp-store-credit, rp-vip-tiers]. Stage: after G0,
  and once those two rows have an outward channel and their guard tests.
- Never say "coming back", "paused" or "for now", and never discuss odds, entries or prizes.

---

## 6. Reviews: asked for neutrally, with no incentive

**Rules.** Shopify App Store requirement 1.3.1: "Asking for reviews must be done so in neutral language. It is
forbidden to offer incentives or withhold features in exchange for reviews, regardless of whether this occurs
through the app or external channels." (shopify.dev app-store-requirements, read 2026-11-07.) Also DMCCA 2024 Sch 20
para 13; CAP 3.45–3.46; CMA208, which bans asking only satisfied customers to review (review gating); and Shopify's
review guidance to ask after a real value moment, never during onboarding, with no unsolicited review emails. All
are summarised in `ref/be-marketing-RESEARCH.md` §3.1 and §3.4, and `p1-market.md` §4.4.
- Ask **everyone** the same way, or no one. Never only the merchants who seem happy.
- Never offer anything: no discount, no extra help, no early feature, no "thank you" gift.
- Never ask in an unsolicited email. Never ask staff, friends or family to review.
- Never write, draft or "improve" a review for anyone, with or without AI.
- Never quote a review publicly without the author's permission (CAP 3.50) and evidence that it's genuine (CAP 3.47).
- There are 0 reviews today (apps.shopify.com/rewards-pro, 2026-11-07), so there is nothing to quote.

**R-REV-1 · the in-app ask (exists; no template needed)**

RewardsPro asks for a review only after the store's third cashback entry and at least seven days with the app, and
stops once the merchant dismisses it or Shopify has shown the request [rp-review-ask]. While it is due, each Home
visit asks Shopify to show its request and shows the card; a cooldown answer leaves it for a later visit
(`app/routes/app._index.tsx:189-197, 265-277`; `app/admin/home-rules.ts:43-44`; `app/lib/stats.server.ts:238-245`).
The card's words are "A review helps other merchants find RewardsPro.", with "Leave a review" and "Dismiss"
(`app/routes/app._index.tsx:511-525`). This is the main way we ask, and every store gets it the same way. Don't add a
second automated ask.

**R-REV-2 · design partners: dropped by default**

The first draft had a spoken review request for design partners at their week-6 call. It is dropped. Partners get
extra free help (set-up on a call, two feedback calls), so a request made only to them breaks "ask everyone the same
way" and ties the request to a benefit already received; their reviews would be connected reviews with no
disclosure (CAP 3.45, Shopify 1.3.1 above, DMCCA Sch 20 para 13). "Our help doesn't depend on it" doesn't remove
that. Partners get the same in-app ask as every store (R-REV-1). If the owner wants a partner ask anyway, that is his
decision, under D8's legal read, and the ask should invite partners to say in any review that we set the app up
with them on a call. No paste text is kept.

**R-REV-3 · someone asks "How can I support you?" · 158 chars · S2, once at least one real merchant uses the app**

> Thank you. If your store uses RewardsPro, a review on its app listing helps other merchants decide, whatever you
> think of it. Nothing is offered for a review.

- Claims: [rp-review-ask] for "Nothing is offered for a review". "Its app listing", not "the Shopify App Store": rp-on-app-store now rules naming the App Store outside social use. Use it only in reply to that question, and the
  same way for whoever asks. A review request isn't a milestone, so it is never a post.

**R-REV-4 · reply to a positive App Store review · 96 chars · whenever a review exists, after rp-contact-delivers
verified**

> Thank you for taking the time to review RewardsPro. Questions reach us at contact@rewardspro.io. [rp-contact-delivers]

- Neutral, the same tone as R-COMP-4. Don't quote the review elsewhere without permission.

---

## 7. Merchants who wrote in (design-partner reply)

**R-PARTNER · email reply to a merchant who wrote to contact@ · 556 chars with the AI line and signature · S3 only**

> Thank you for getting in touch. We set RewardsPro up with a few UK shops on a call, free as for everyone, with two
> feedback calls in the first six weeks. Our help never depends on a review. [rp-design-partner-offer, rp-free] You fund the
> cashback your customers earn, [rp-merchant-funds, short form as STRATEGY M2] and for Shopify stores created on or
> after 12 May 2025, Shopify charges third-party transaction fees on the part of an order paid with store credit.
> [sh-sc-fee] If you'd like a call, reply with two or three times that suit you.
>
> Drafted with AI help and checked by a person.
>
> Cambridge TCG Limited, for RewardsPro
> contact@rewardspro.io

- Only to someone who wrote first. The PPA consent clause (ppa.txt:330, 335) and PECR apply, and the owner's answer to the
  PPA question comes first (STRATEGY §9).
- **For the claims maker (added 2026-11-07):** "free as for everyone" is `rp-design-partner-offer`'s own sentence,
  so it stays until the row changes, but it reads as broken English in the business register and asserts the free
  claim, so `rp-free` is now tagged beside it. Proposed variant: "We set RewardsPro up with a few UK shops on a call,
  at no charge, as for every store, with two feedback calls in the first six weeks." The row's scope also needs
  rewording before any brand owner hears it (`../../MESSAGING.md` §7).
- No deadline, no place count, no "limited spots" (CAP 3.30). No review request (R-REV-2).
- "You fund the cashback your customers earn" is the strategy's M2 wording, not the ledger sentence: NO-ROW until
  the claims maker adopts it as an rp-merchant-funds variant.

---

## 8. Sentences without a ledger row (for the claims maker)

The first draft's suggested rows rp-help-in-settings, rp-switch-off, rp-import-past and rp-scope now exist (added
to the ledger 2026-11-07, all `proposed`), and the templates above use their sentences. What is left:

| Template | Sentence | Locator | Suggested id |
|---|---|---|---|
| R-PTS-D9 | the named absences | rp-no-points, rp-no-chance exist but are internal only | add an outward channel and the guard tests (and the owner's D9) |
| H0-LI | "We post here when something merchants can see changes, or when we have checked a new fact about how it works, and not otherwise." | rp-post-on-change (profiles only) and its contrary evidence | widen rp-post-on-change, or add a post variant |
| R-LEAVE (optional) | "towards" | rp-switch-off | resolved: the row now reads "towards" (checked 2026-11-07, 12:58 UTC) |
| R-FREE-1, E2, CAR1 p8 | "The rate depends on your Shopify plan." | the third-party transaction fees page (2026-11-07) | extend sh-sc-fee |
| H0-LI; R-PARTNER | "You fund the cashback you give." / "You fund the cashback your customers earn" | short forms of rp-merchant-funds (L1, STRATEGY M2) | variants of rp-merchant-funds |
| E1, CAR1 p3 | the £600 / £60 / £10 / £540 / £27.00 example | `docs/staging-run.md:23`; the G0 order O1 (`../shot-list.md` §2) | rp-cashback-example |
| E6 | "refunding one of two items took back £13.50 of the £27.00 cashback" | the G0 capture SH-6 (planned, [I]) | rp-refund-example |
| L-C2, CAR1 p7 | "signed in with new customer accounts or using Shop Pay" wording ("using", Shopify's word, for the ledger's "with") | help.shopify.com/en/manual/customers/store-credit (2026-11-07) | amend sh-sc-signin-legacy |
| `community-rules.md` §3 | The owner's own relationship to Cambridge TCG Limited, for the disclosure line | Companies House officers and PSC register for company 15680297 (not yet read) | yu-relationship (internal, channel community) |

The suggested ids are only suggestions; the claims maker alone edits `claims.toml`.
