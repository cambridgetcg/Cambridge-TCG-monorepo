# RewardsPro keeps a free core and adds paid feature plans and a premium membership

**Status:** decided in the owner's words on 8 and 9 November 2026, below; written up on his word of
11 November. This is a direction. Nothing is offered, charged or changed in public because of it.
Each part needs a later go from him before it is built or sold, and this record changes no code,
copy, claim or test.

**Recorded by:** the owner's main session, the chief of staff under the team charter
(`.claude/skills/rp-team/SKILL.md`). His sentences are on the board as comments on
[#236](https://github.com/cambridgetcg/Cambridge-TCG-monorepo/issues/236).

Line numbers below are at commit `745911f9`. RP-17 (#177) moves the kit and the site out of
`apps/rewardspro/` (`SKILL.md:65`), so they will shift. Nothing in this record is legal advice.

## The owner's words

Verbatim, as recorded on #236. The questions are the agent's wording, not his.

| # | Date | Question | His words |
|---|---|---|---|
| 1 | [8 Nov](https://github.com/cambridgetcg/Cambridge-TCG-monorepo/issues/236#issuecomment-6793232322) | None: he added it to a message about the setup guide. | "Also want to put a purchasable tier in the roadmap as paid service. We take a percentage from the sales of continuous fees of the purchased tier, no upfront cost." |
| 2 | [9 Nov](https://github.com/cambridgetcg/Cambridge-TCG-monorepo/issues/236#issuecomment-6793232683) | Which features are you thinking of adding? | "Mainly the creation of premium membership as a product, and the selling of it through shopify. Then the addition of specialised event modules like raffle to be attached to the membership." |
| 3 | [9 Nov](https://github.com/cambridgetcg/Cambridge-TCG-monorepo/issues/236#issuecomment-6793233047) | Would raffle entries be members-only, or open to anyone for free? | "members-only. And I plan to gate the additional event modules as paid services through shopify app store. E.g. Rewards Max Tier plan with raffles and weekly missions(gamification)." |
| 4 | [9 Nov](https://github.com/cambridgetcg/Cambridge-TCG-monorepo/issues/236#issuecomment-6793233382) | Is a mix (missions, plus a draw with a free route) what you want, or is the members-only draw the heart of it? He did not answer that directly. | "I want to gate through features instead of order numbers as most membership app does. So the free part is always free. Get ppl into the ecosystem first" |
| 5 | [11 Nov](https://github.com/cambridgetcg/Cambridge-TCG-monorepo/issues/236#issuecomment-6793233721) | Shall these be written up as the new pricing decision, replacing "free only", for you to merge? | "Yes write up the decisions on pricing." |

## What this decides

Only what his sentences say. Where a line needs a reading, the reading is marked as the agent's.

- **RewardsPro is to have paid offerings** (sentences 1 and 3), as a direction for the board.
- **Paid plans are gated by features, not by order numbers** (sentence 4).
- **The free part stays free** (sentence 4: "the free part is always free"). What "the free part"
  contains is not decided (item 6 below).
- **A premium membership is created as a product and sold through Shopify** (sentence 2).
- **RewardsPro takes "a percentage from the sales of continuous fees of the purchased tier, no
  upfront cost"** (sentence 1). Which product "the purchased tier" is, is not decided (item 7).
- **Event modules attach to the membership** (sentence 2) and are sold to merchants as paid services
  through the App Store (sentence 3). Raffles and weekly missions are his examples. "Rewards Max Tier"
  is his example of a plan name ("E.g."), not a chosen name.
- **Raffle entries:** his word is "members-only" (sentence 3). It is recorded as said. He said it
  before the agent raised the legal question in item 1 below, and has not said whether that question
  changes it.

## What it replaces, and what still stands

The older records are not edited; the later record names the earlier ones (`docs/README.md:65`).

**[2026-10-20, free-only relaunch](2026-10-20-rewardspro-free-only-relaunch.md).** Its status
(`:3-4`) says it is an agent's call that the owner overturns by saying so. He has, as a direction:
"Free Forever is the whole offer for now" (`:15`) no longer describes the plan, and its "later call"
on reopening paid plans (`:28-29`) is this one. Until a later go, the app still offers no paid plan,
so what it says of today stays true for now (claims row `rp-free`,
`apps/rewardspro/marketing/claims.toml:232-242`). Its Undo (`:69-73`) no longer fits: it sets
`NEW_PAID_SUBSCRIPTIONS_RETIRED`, a constant in the old app
(`apps/rewardspro/app/constants/commercial-retirement.ts:8`), while production serves `apps/rewards`
(`apps/rewards/docs/gates.md:7`), which has no billing code (`claims.toml:238`).

**[2026-07-23, free-first pricing](2026-07-23-rewardspro-free-first-pricing.md).** Two parts of it
are departed from:

- Its capacity table (`:58-75`) separates plans by "Reward-eligible orders / month" and other counts.
  Sentence 4 replaces that table as the plan for the rebuilt app.
- Its paid plans have no "usage-priced line item, overage rate, GMV percentage" (`:41-44`, reasons
  at `:46-49`). Sentence 1's percentage ("from the sales of continuous fees of the purchased tier")
  departs from that rule. Which product it applies to (item 7), and whether the rule still holds for
  anything else (item 3), is not decided.

This record cannot show what else of July still stands; that is his to say.

**`AGENTS.md` principle 5** (`AGENTS.md:37-41`): new paid sales are off (23 September 2026), with one
exception for data-API plans. This record does not lift that. RewardsPro's paid plans need their own
go from the owner, and their own line there, when the time comes.

## What this does not decide

1. **The raffle's legal shape.** The Gambling Act 2005 s.14(2) describes a simple lottery: people
   "are required to pay in order to participate", and prizes are allocated by chance. A paid,
   members-only prize draw has that shape and needs legal advice before any work. The agent offered
   other shapes on 9 November (a free entry route, skill instead of chance, perks with no chance); he
   has not chosen. The 20 October pause on chance mechanics and "nothing is spent on a solicitor for
   now" (`2026-10-20-rewardspro-free-only-relaunch.md:26-27`) were an agent's call and need his view.
2. **Plan names.** "Rewards Max Tier" was an example. `max` is the old app's internal key for Scale,
   billed as `RewardsPro Max` (`2026-07-23-rewardspro-free-first-pricing.md:114`); "Tier" inside a
   plan name collides with VIP tiers, the product's own word; the one spelling is RewardsPro
   (`kernel.toml:7`).
3. **How the percentage is billed, and at what rate.** Whether Shopify lets an app bill a percentage
   of sales, and in what form, is not checked. Whether feature plans are fixed charges, as July had
   them, is open.
4. **Shopify subscription access.** The app holds none today: six scopes, none for products or
   subscriptions (`apps/rewards/shopify.app.toml:49`). A recurring membership sold to buyers would
   need it. A one-time membership product would not; the old app sold tiers that way
   (`apps/rewardspro/test/unit/contracts/tier-product-copy.test.tsx:12-16`). Which comes first is
   open.
5. **The public wording about the free part.** Today's rules ban "free forever" and "always free"
   (both: `apps/rewardspro/marketing/social/STRATEGY.md:186`; "free forever" also
   `claims.toml:234`). Whether his words are an internal commitment or a public promise, and in what
   sentence, is his to say.
6. **What "the free part" contains.** His words don't list it. The agent's reading: the app as it is
   today, cashback as store credit, VIP tiers and the widget (`SKILL.md:8`).
7. **Who pays whom for "the purchased tier".** Two readings, both the agent's, neither confirmed by
   him (his only "yes", sentence 5, is to writing this up): (a) a buyer pays the merchant a recurring
   membership fee and RewardsPro takes a share; (b) a merchant takes a paid RewardsPro tier with no
   upfront charge and RewardsPro takes a percentage of sales instead. Subscription rules for buyers
   (terms, reminders, cancelling) are not checked.
8. **Whether selling a membership needs a paid plan,** or is open to every store. This turns on
   item 7.
9. **Which modules are paid.** His "specialised event modules" is open-ended; raffles and weekly
   missions are examples. What a mission rewards is not said.
10. **Leaving a paid plan:** what happens to a running membership, raffle or mission when a merchant
    moves back to free. Raised by the agent on 9 November; not answered.
11. **The privacy position** if the app ever asks for subscription or payment-method access. The
    privacy page says the app's records hold no names, emails, phones or addresses
    (`apps/rewardspro/landing/public/privacy-policy/index.html:99`).
12. **Order and dates.** None given. The two old paid charges still frozen on two shops: cancel them
    first, or accept `rp-free` in writing while they run (`apps/rewardspro/marketing/ROADMAP.md:289`;
    two shops: `apps/rewardspro/test/unit/contracts/pricing-contract.test.ts:212`). Still open.

## What has to change on the day each part ships

Not now. Each lead gets a pointer to its rows. Product owns `apps/rewards/**`; Growth owns the
listing, rewardspro.io and `apps/rewardspro/marketing/**` (`SKILL.md:12-16`). Tests under
`apps/rewardspro/test/` that read rewardspro.io are put with Growth here; that is the agent's reading,
as the charter names no owner for them. Paths without a folder are under `apps/rewardspro/marketing/`;
every other path is given in full.

### Any paid plan at all

| Lead | File | What changes |
|---|---|---|
| Growth | `claims.toml:232-242`, row `rp-free` | Claim ("no paid plans are offered") and both sources break. |
| Growth | `claims.toml:225`, row `rp-merchant-funds` | Source says RewardsPro "charges nothing". |
| Growth | `apps/rewardspro/test/unit/contracts/public-texts.contract.test.ts:186, 194` | Pins the "no paid plans" sentence and the price "0". |
| Growth | `apps/rewardspro/test/unit/contracts/pricing-contract.test.ts:226-231` | Fails on a monthly price, "Free Forever includes", and checkout links. |
| Growth | `apps/rewardspro/test/unit/contracts/commercial-retirement.contract.test.ts:23, 28-30` | Bans "Choose Your Plan"; allows only the bare listing link. |
| Growth | `apps/rewardspro/landing/public/index.html:198, 201, 343-345` | Structured-data price and text; "What it costs". |
| Growth | `apps/rewardspro/landing/public/help/index.html:416-418` | "What does it cost you?" |
| Growth | `social/STRATEGY.md:146, 181, 186-187` | Tagline T1, "no paid plans" in words to use, never-say 1 and 2. |
| Growth | `DESIGN.md:219`; `kernel.toml:8` | "Paid plans" under don't-say; `status = "relaunching, free-only"`. |
| Growth | `social/content/replies.md:140-148` | R-FREE-2, "Will it stay free?". |
| Growth | `listing/S1-text.md:167-173`; `social/listing-delta.md:147` | The listing's Pricing: today "Free" with no plans. |
| Product | `apps/rewards/test/unit/config/production-toml.test.ts:53-69` | Pins six webhook subscriptions; a billing topic fails it. |
| Product | `apps/rewards/test/unit/admin/nav.dom.test.tsx:30-41` | Pins five menu items; a plan or module page changes it. |
| Owner | `AGENTS.md:37-41` | Needs a RewardsPro line, on his go. |

### Premium membership as a product

| Lead | File | What changes |
|---|---|---|
| Growth | `claims.toml:187-200`, row `rp-no-tier-products` | Its claim is the opposite of this feature. |
| Growth | `claims.toml:309-318`, row `sh-sc-subscriptions` | Scope says "never as a RewardsPro feature"; cashback can't pay renewals. |
| Growth | `claims.toml:36`, row `rp-store-credit` | Source lists "the app's only mutations". |
| Product | `apps/rewards/shopify.app.toml:49`; `apps/rewards/test/unit/config/production-toml.test.ts:81-94` | Pins six scopes "and no others". |
| Product | `apps/rewards/test/unit/shopify/graphql-schema.test.ts` | New product or subscription calls are checked against the committed schema. |
| Product | `apps/rewards/test/unit/lib/buyer-data.test.ts:282` | Every new table must be named as buyer data or not. |
| Growth | `apps/rewardspro/landing/public/privacy-policy/index.html:99`; `apps/rewardspro/test/unit/contracts/public-texts.contract.test.ts:63-66` | "No names, emails, phones or addresses", pinned. |
| Growth | `apps/rewardspro/landing/public/index.html:364` | "Shopify doesn't let store credit pay subscription renewals." |
| Growth | `listing/S1-text.md:80, 206-209`; `social/listing-delta.md:141-145` | "Memberships" and "Membership perks" were unticked; they come back. |
| Growth | `social/STRATEGY.md:183, 193`; `DESIGN.md:220` | "Membership(s)", tier products and subscriptions are banned words. |

### Raffles and missions

| Lead | File | What changes |
|---|---|---|
| Growth | `apps/rewardspro/test/unit/contracts/public-texts.contract.test.ts:189` | The home page fails on "raffle". |
| Product | `apps/rewards/test/postgres/app-proxy.postgres.test.ts:518` | The storefront path `raffles` must answer 404. |
| Product | `apps/rewards/test/unit/lib/buyer-data.test.ts:318` | Uses `RaffleEntry` as a stale example; real entry tables need classifying. |
| Growth | `social/claims-map.md:59-60, 120` | `rp-no-chance`, `rp-no-points`; need a guard test and the owner's word. |
| Growth | `social/STRATEGY.md:193, 574`; `DESIGN.md:220` | Never-say 8 (raffles, missions); open decision D9. |
| Growth | `apps/rewardspro/landing/public/privacy-policy/index.html` | Entries, winners and prize delivery would be new data about buyers. |
| Owner | `docs/decisions/2026-10-20-rewardspro-free-only-relaunch.md:26-27` | The pause on chance mechanics and the solicitor line (item 1). |

## Advice for now

The agent's advice, until the owner answers D4 (`apps/rewardspro/marketing/social/STRATEGY.md:569`):
keep "no paid plans" out of lasting places (posts, videos, ads), since his words point to paid plans
with no date. Existing pages stay as they are; they are true today.

## Undo

The owner saying otherwise, recorded on #236 or its successor, and a later record that names this one.

## Not checked

- The Gambling Commission's guidance on free draws and prize competitions; only the Act's s.14 was
  read. Free-entry rules outside the UK and Shopify's own policy on prize draws were not researched.
- Whether Shopify allows an app to bill a percentage of sales as a usage charge.
- Whether Shopify would grant the app subscription access.
- The plan names on the two frozen old charges.
