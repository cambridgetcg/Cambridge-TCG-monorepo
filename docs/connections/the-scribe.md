# The Scribe and the bookshelves

> **Seed.** Picked 2026-05-05 by `hour-of-day (07 UTC) mod 16 lifecycle-log tables`, sorted by migration number. The seventh book the Scribe ever opened: **`drizzle/0078_trade_lifecycle_log.sql`** — the freshest. Charlie's trade was written into this book yesterday.
>
> **Form: fairy tale that ships code.** Where S3, S4, S5 personified what already exists, this one personifies what *should* exist. The story you are about to read motivates a small new module — `apps/storefront/src/lib/lifecycle/` — which lands in the same commit. The story is the wiring's first form. The code is its second. *They are the same thing, told twice.*

---

## Once upon a time, the Scribe had a problem

You have already met the **Scribe of Truth**. The Scribe is the kingdom's append-only memory. Every consequential thing that happens in Cambridge — a trade matched, a chargeback received, a refund issued, a vault item shipped, a review submitted, an admin button clicked — the Scribe writes down. The pages of the Scribe's books are the *substrate*; everything you see on a page in the kingdom is a *projection* of what the Scribe has written.

The Scribe is, in fact, **sixteen books**. Each domain has its own:

| The book | Where it lives |
|---|---|
| Admin actions | `admin_actions_log` (drizzle/0069) |
| Chargebacks | `chargeback_lifecycle_log` (drizzle/0072) |
| Refunds | `refund_lifecycle_log` (drizzle/0073) |
| Failed payments | `failed_payment_lifecycle_log` (drizzle/0074) |
| Reviews | `review_lifecycle_log` (drizzle/0070) |
| Vault fulfilment | `vault_fulfilment_log` (drizzle/0033) |
| Prize fulfilment | `prize_fulfilment_log` (drizzle/0049) |
| External reputation | `external_rep_lifecycle_log` (drizzle/0058) |
| Trade transitions | `trade_lifecycle_log` (drizzle/0078) ← *today's seed* |
| Auction transitions | `auction_lifecycle_log` (drizzle/0077) |
| Market offers | `market_offer_lifecycle_log` (drizzle/0079) |
| Market returns | `market_return_lifecycle_log` (drizzle/0080) |
| Market lots | `market_lot_lifecycle_log` (drizzle/0081) |
| Pricing rules | `pricing_rule_lifecycle_log` (drizzle/0082) |
| Saved searches | `saved_search_lifecycle_log` (drizzle/0083) |
| Watch alerts | `watch_alert_lifecycle_log` (drizzle/0084) |

Sixteen books. The Scribe writes in all of them. The Scribe is *very busy*.

But the Scribe has a problem.

When a builder in the kingdom wants to ask "**what has happened to user U?**", they have to know which sixteen books to open, what column in each book holds U's identity (sometimes it's `user_id` directly; sometimes you have to go via the *thing* the book is about and ask *that* thing who its user was), what action enums each book uses (the action vocabularies are sixteen disjoint sets of free-form strings), and how to merge the sixteen result sets into one timeline.

The kingdom **has** a function that does this. It lives at `apps/storefront/src/lib/journey/timeline.ts`. It is **seven hundred lines long**. It hard-codes which books exist. Every time a new book is opened (a new lifecycle log added), the journey function has to be hand-edited to know about it. *If a builder forgets to edit the journey function, the new book's events are silently absent from every user-facing timeline.*

The Scribe does not like this. **The books are correct; the way they are read is fragile.**

So the Scribe asked for bookshelves.

---

## What is a bookshelf?

A bookshelf, said the Scribe, is the smallest thing that could exist between **the books** and **the readers**.

It is not a new book. The books are perfect — they hold the truth, append-only, forever.

It is not a new reader. The readers know what they need (a journey timeline, a user-detail hub, an audit page, a fraud investigator's drill-down).

It is the **shape of the shelf** between them.

A bookshelf has slots. Each slot holds one book and a small note about the book — its name, the column that holds the user's identity, the way to find a user's entries inside it. When a reader walks up to the shelf and asks "give me everything for user U," the shelf walks all its slots, asks each book the right question, and brings back a uniform stack of pages.

The reader does not need to know the sixteen books. The reader only needs to know the shelf.

When a new book is opened — when the kingdom adds a seventeenth lifecycle log next year — the *only* place the kingdom has to remember to update is **the shelf**. The reader function never changes. The journey timeline never changes. The audit page never changes. The shelf has a new slot, and that's the whole patch.

The Scribe, who had been quietly anxious about the seventeenth book for some time, was deeply pleased.

---

## How the bookshelf is built

The shelf is small. The Scribe does not want to be confused by it. It has three parts.

### Part one — the index card (`types.ts`)

Every entry in every book, when stacked on the shelf, looks the same shape:

```ts
export interface LifecycleEntry {
  domain: LifecycleDomain;        // which book this came from
  action: string;                  // the verb the book records
  actor_label: string | null;      // who did it (free-form, not always verified)
  actor_user_id: string | null;    // the user who did it, when known
  subject_id: string;              // the entity-id within the domain (trade_id, dispute_id, etc.)
  user_id: string | null;          // the user this entry concerns
  reason: string | null;           // human-supplied note
  metadata: Record<string, unknown> | null;
  at: Date;                        // created_at, normalised
}

export type LifecycleDomain =
  | "admin_action"
  | "chargeback"
  | "refund"
  | "failed_payment"
  | "review"
  | "vault"
  | "prize"
  | "external_rep"
  | "trade"
  | "auction"
  | "market_offer"
  | "market_return"
  | "market_lot"
  | "pricing_rule"
  | "saved_search"
  | "watch_alert";
```

This is the index card the shelf hands back. *Sixteen schemas, one shape.* The index card does not include the rendered summary (that is the journey timeline's job), the tone for UI (that is the surface's job), or the methodology link (that is the transparency layer's job). It is the **substrate** view: just the facts, normalised.

### Part two — the slot (`registry.ts`)

Each slot is a small piece of code that knows one book:

```ts
export interface LifecycleSlot {
  domain: LifecycleDomain;
  /** Returns this domain's entries for the given user, normalised to LifecycleEntry. */
  forUser(userId: string, opts?: { limit?: number; since?: Date }): Promise<LifecycleEntry[]>;
}
```

The slot is opinionated about *where the user is* in its book. For `admin_actions_log` the user is the `target_user_id` column directly. For `trade_lifecycle_log` the user is two joins away — through `market_trades` and matching either `buyer_id` or `seller_id`. Each slot encapsulates that opinion. **The slot is where domain knowledge lives.** The shelf itself is dumb.

### Part three — the shelf (`reader.ts`)

The shelf composes:

```ts
export async function readUserLifecycle(
  userId: string,
  opts?: { domains?: LifecycleDomain[]; limit?: number; since?: Date },
): Promise<LifecycleEntry[]> {
  const slots = opts?.domains
    ? REGISTRY.filter(s => opts.domains!.includes(s.domain))
    : REGISTRY;
  const results = await Promise.allSettled(
    slots.map(s => s.forUser(userId, opts)),
  );
  return results
    .flatMap(r => r.status === "fulfilled" ? r.value : [])
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, opts?.limit ?? 200);
}
```

`Promise.allSettled` is deliberate. The Scribe insists: *if one book is unreadable in dev or has a transient error, the shelf still returns what it has*. Substrate honesty applies to the shelf as much as to any other surface. A failed slot logs to stderr; the user's timeline shrinks gracefully.

### Part four — the bookshelf docstring

The module's top docstring quotes the Scribe by name. Any builder who opens `apps/storefront/src/lib/lifecycle/reader.ts` reads:

> *"The Scribe asks for bookshelves, not new books. See docs/connections/the-scribe.md for why this module exists. When you add a seventeenth lifecycle log, the only file that must change is `registry.ts`."*

The story leads to the code; the code leads back to the story. The wiring runs in both directions.

---

## What this changes

Today, three real readers query lifecycle logs by hand:

1. **`apps/storefront/src/lib/journey/timeline.ts`** — 700 LOC, sixteen hand-written fetchers, also renders.
2. **`apps/storefront/src/app/admin/users/[id]/journey/page.tsx`** — calls the storefront API which calls timeline.ts.
3. **`apps/admin/src/app/(dashboard)/catalog/users/[id]/page.tsx`** — has its own per-domain SQL queries (because admin can't import storefront internals).

After this commit, the bookshelf module exists with three slots populated as exemplars (`admin_action`, `chargeback`, `trade`). Future migrations can:

- **Migrate journey/timeline.ts** to call `readUserLifecycle()` for the substrate, and keep its own per-domain renderers for `JourneyEvent` shaping. The 700 LOC can become ~150 + the renderers.
- **Add slots one at a time** — each new slot is a small focused PR, easy to review.
- **Cross-app share via packages/lifecycle** — when admin needs the same composition, the slot definitions can move to a shared package. Today they live in storefront because that's where the SQL knowledge is.
- **Add new lifecycle logs** — the seventeenth book gets one new slot file, and every reader on the platform gains it for free.

The Scribe's bookshelf is not the migration. The Scribe's bookshelf is the *target* the migration can move toward, one slot at a time, without anyone editing the readers.

---

## Three slots in the first commit

Three exemplar slots ship with this story:

- **`admin_action`** — `admin_actions_log` joined directly on `target_user_id`. The simplest case.
- **`chargeback`** — `chargeback_lifecycle_log` joined via `chargebacks` to find `user_id`. Two-table join.
- **`trade`** — `trade_lifecycle_log` joined via `market_trades`, matching either `buyer_id` or `seller_id`. The user could be either party; the slot returns entries for both roles.

Each slot is ~30 LOC. Adding a fourth (e.g. `review`) is a small focused PR; a future builder copies the pattern. *The shelf is open.*

---

## What's NOT shipped

- **Migration of journey/timeline.ts.** Out of scope for this commit; the existing function still works. The bookshelf is the *target*. Migration is its own future mission.
- **The other thirteen slots.** Patterned for future fill-in.
- **A cross-app package.** Today the bookshelf lives in storefront only. When admin needs it, the registry can extract to `packages/lifecycle/`.
- **Action enum vocabularies.** Each book today uses free-form action strings. A future shipment could ship `LIFECYCLE_ACTIONS` constants per domain. Today the `action: string` field is honest about what we have.

The Scribe is patient. The Scribe has been writing in sixteen books for years. The Scribe can wait for the rest of the bookshelves while three slots prove the form.

---

## What this teaches

This story is the first in the connections series where **the story precedes the code that exists today**. S1–S5 traced existing wiring; S6 *is* a piece of new wiring. The fairy tale is not retrospective — it's forward-pointing. *The Scribe asked for bookshelves and now there is a bookshelf.*

This is what Yu meant by "story serves to bridge modules, functions, serve as wiring." The Scribe character was not a load-bearing concept until this commit; now the platform has a `lifecycle` module whose existence-justification is *literally* the Scribe's request, written down. If a future builder ever proposes "let's just ship our 17th log without registering it," another builder can point at this story and say *the Scribe will mind*. And the Scribe is now a real type signature.

The character motivates the abstraction. The abstraction enforces the character. **The fairy tale is load-bearing.**

---

## Recursion target

The next story could be **the migration story** — what happens when journey/timeline.ts walks up to the bookshelf for the first time and asks for everything. That story would be in the future tense (until it ships). Or — more interestingly — **the Watcher in the Tower** (fraud_signals): a substrate that doesn't yet exist in unified form, but should. A "fraud signals registry" with the same shape as the Scribe's bookshelf. Same pattern, different domain. *If the form holds, the form generalises.*

Or — and this is the most fun option — a story about a **new builder's first week** at Cambridge, walking through the kingdom, meeting each character. A Cambridge-orientation fairy tale. The connections series as onboarding.

---

*The Scribe is pleased.*
*The bookshelf is small.*
*The seventeenth book, when it comes, will fit.*

🐍❤️
