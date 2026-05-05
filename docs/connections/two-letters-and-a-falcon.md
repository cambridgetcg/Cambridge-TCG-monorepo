# Two Letters and a Falcon

> **Recursion 6 from the connections series.** Random seed: `apps/storefront/src/app/api/portfolio/search/route.ts` (selected via `find` + `awk` random). **Form: narrative.** **Register: fun.** Where S1 was a documentary and S2 a hymn, this one is a fairy-tale. Castles in the sky, with bearer-tokens.

---

## What the story is

A fairy-tale of typeahead. An adventurer types two letters; an Embassy dispatches a Falcon; the Library of the Cardmaker pulls twenty pages from a vault of ten thousand; an Appraiser stamps each one; the Falcon flies home; the adventurer adds one card to her Codex.

Two kingdoms speak Bearer-token across the moor. Both are real. Both run the Cambridge TCG platform. Neither has ever met the other in the flesh — only in HTTPS.

This is what the typing of `ch` looks like, from the inside.

---

## Cast

**Saga.** Adventurer. New to portfolio-keeping. Has heard there is a card called *Charizard ex* worth a story and a small fortune. Visits `/portfolio/add` on cambridgetcg.com, finds a search bar, and types.

**The Embassy.** A 39-line route handler. Lives at `apps/storefront/src/app/api/portfolio/search/route.ts`. Speaks to its own kingdom (the Storefront) by language; to the other kingdom (the Wholesale) by Falcon. Refuses audience to petitioners of fewer than two letters: *the library is too vast to scan for one.*

**The Falcon.** Lives at `apps/storefront/src/lib/wholesale/client.ts`, in the function called `fetchPrices`. Carries a Bearer-token sealed in its claws. Will not fly if the seal has so much as one trailing newline — a paranoia learned the hard way, recorded in `apps/storefront/CLAUDE.md` as *the Vercel whitespace issue*. Has a 5-second hourglass strapped to its leg (an `AbortController`); if the hourglass empties before the Falcon returns, the Embassy declares a timeout and sends the user home empty-handed rather than leave her waiting.

**The Library of the Cardmaker.** A sister-kingdom called Wholesale, two hills over at `wholesaletcgdirect.com`. Holds 11,368 cards on impossibly thin paper, sorted by game, set, name, and an exchange rate from yen to pound that they recompute nightly when the East-bound falcons return with the day's prices.

**The Appraiser.** A small function called `retailPrice` in `apps/storefront/src/lib/pricing.ts`. Stands at the Embassy gate. Each price the Falcon returns from the Library is *wholesale* — what it cost the Storefront to acquire. The Appraiser stamps each one with the *retail* mark before any returns to Saga, lest she see the price the kingdom paid rather than the price the kingdom asks.

**Saga's Codex.** A row in `portfolio_cards` waiting to be born.

**The Dragon.** A watchful thing, at `apps/storefront/src/lib/portfolio/alerts.ts`, who wakes when a new SKU joins a Codex. Adds it to her watch-list. Will breathe smoke if the price moves too far from where Saga first noticed it.

---

## The two letters

Saga types `c`. Nothing happens. The Embassy refuses audience for one letter — `if (!q.trim() || q.length < 2) return { results: [] }` — and an empty parchment never becomes a network call. *The library is to be visited, not scrolled.*

Saga types `h`. The composition is now `ch`. The Embassy stirs.

(Two letters. The threshold met. We pass.)

The Embassy first checks who is asking. The handler calls `auth()`. If Saga is not signed in, the audience is refused with a 401 (`Sign in required.`). The library is for citizens. Saga is a citizen — her session cookie answers — so the audience proceeds.

---

## The Falcon's flight

The Embassy asks the Falcon to carry a parchment to the Library. The parchment reads:

```
GET /api/v1/prices?channel=cambridgetcg&game=one-piece&q=ch&limit=20
Authorization: Bearer <key>
```

`channel=cambridgetcg` is the most important detail. The Library prices its cards differently for each visiting kingdom — the Shopify kingdom sees one price, the eBay kingdom another, the CardMarket kingdom a third, the cambridgetcg kingdom (where Saga lives) a fourth. *The channel is who is asking; the price reflects that.*

`limit=20` is a kindness. The Library would happily return all 11,368 cards matched broadly, but the Embassy promises to bother no one with more than twenty results at a time. Saga can refine further if she wishes.

The Falcon takes wing. The hourglass starts. Five seconds.

> *There is a second danger the Falcon faces, more real than wolves: the trailing newline.* If the Bearer-token has so much as one stray `\n` at its end — a thing Vercel sometimes adds when the variable is set in the dashboard — the Library will return 401 because the SHA256 of the trimmed key does not match the SHA256 of the untrimmed key. This is recorded in the kingdom's chronicles as the Vercel whitespace issue, and the Falcon's keeper, before every flight, calls `.trim()` on the seal.

The Falcon arrives. The Library opens its index.

---

## The Library's act

Inside the Library, a SQL query runs that we will not retell — that scroll lives in a different scriptorium (`apps/wholesale/src/app/api/v1/prices/route.ts`) and is already documented in its own hand. What the Library does in essence: searches `cards.name`, `cards.name_en`, and `cards.card_number` for any case-insensitive `ch`, joined to the channel-pricing oracle so the price is *cambridgetcg*-flavored, sorted by relevance, limited to twenty.

The Library returns twenty thin pages. Among them: *Charizard ex*, set code SVOBF, holo, near-mint, current cambridgetcg price £142.10, stock 1.

The Falcon collects the pages, refolds them into JSON, and turns for home.

---

## The Appraiser's stamp

The Falcon lands at the Embassy. Twenty pages tumble out of his beak. The Embassy unfurls each one and walks it past the Appraiser.

The Appraiser is `retailPrice(wholesaleGbp, channelPrice)`. He examines each page in turn. If the Library has provided a `channel_price` already (which it does, today), he stamps the page with that number — the channel-aware price the Library computed in its own back-room. If the channel-price is missing (a backwards-compat case, mentioned in his docstring with the dignity of someone who's seen old days), he falls back to a JS spell: `wholesale × 1.15 rounded up to £0.10`. Either way, the page leaves his desk with one *retail* number on it, never the wholesale number.

This is a small thing the kingdom does that Saga will never see. The Library gives the Embassy two prices on every card; the Embassy hands Saga only one. *Wholesale is the kingdom's secret.* It is what the Cardmaker pays to fill the warehouse from Japan; it is not what the kingdom charges to send a card across the city.

(Substrate-honesty audit item A7 was about making this honest at the *operator* surface — `synced from CardRush · daily`. The customer surface is its own thing: customers see retail, full stop, and the kingdom's margin is the kingdom's business.)

---

## What Saga sees

Twenty cards appear in the search dropdown, sorted by the Library's relevance:

> ⚡ **CHARIZARD EX** · 151 · holo · 1 in stock · **£142.10**
> 🔥 CHARIZARD VMAX · 25th · holo · 0 · £58.90
> 🐉 CHARMANDER · 151 · common · 8 · £0.45
> 🍷 CHALICE OF THE COVENANT · OP-OP01 · super rare · 2 · £6.80
> 👻 CHANDELURE · obs · uncommon · 0 · £1.10
> ...

Saga clicks the first one. The dropdown closes with a small animation. A second route — `/api/portfolio/add` — fires. `portfolio_cards` gains a row:

```
(user_id, sku='SVOBF-006', qty=1, acquisition_source='manual', acquired_at=NOW())
```

Saga's Codex now contains a Charizard.

> `acquisition_source='manual'` is a column added by `apps/storefront/drizzle/0085_realized_positions.sql`. It distinguishes cards Saga *bought* from cards she *added by hand to track*. The platform respects the difference: a manual-add isn't a purchase event; no points fire, no cashback fires, no `annual_spend` bumps. *She is not pretending to have bought it. She is keeping a record of having it.*

---

## The dragon stirs

Behind the curtain, the Dragon at `apps/storefront/src/lib/portfolio/alerts.ts` wakes. She reads `portfolio_cards` for any SKU whose price-alert has been requested. Saga didn't ask for an alert today, but the Dragon takes note of Charizard ex anyway, in case she ever does.

> Audit item X2 wants a `portfolio_snapshot_lifecycle_log` so the Dragon's inputs leave a forensic trail. They do not yet. Today the Dragon's record is the Dragon.

---

## The kingdoms

Two kingdoms exchanged one parchment in this story. The Storefront knows almost nothing about the Wholesale's internal SQL. The Wholesale knows almost nothing about the Storefront's session table. They share a Bearer-token, a 5-second window of patience, and a fierce attention to whitespace.

The reason the kingdoms are separate is the platform's own substrate-honesty: the Wholesale is **authoritative** about what is in the warehouse and what each card costs to acquire; the Storefront is **authoritative** about which user did what. Each speaks its own truth. The Embassy is where they meet.

Wholesale lives at `apps/wholesale`. Storefront lives at `apps/storefront`. Admin (a third kingdom, the operator's tower) sits between them, reading both, mutating neither without good reason. They are linked in the same monorepo but deploy to three separate Vercel projects. One repo. Three roles. One Embassy per pair.

---

## What this story bridges

| Module | Role in the fairy-tale |
|---|---|
| `app/api/portfolio/search/route.ts` | the Embassy |
| `lib/wholesale/client.ts` | the Falcon (`.trim()` on the seal, `AbortController` for the hourglass) |
| `lib/pricing.ts` | the Appraiser at the gate |
| `apps/wholesale/.../prices/route.ts` | the Library's reading-room (cited but unwalked) |
| `lib/portfolio/db.ts` | Saga's Codex |
| `lib/portfolio/alerts.ts` | the Dragon |

Six modules, one fairy-tale. Reading any one cold, the developer would see a function and a return type; reading them after the story, they'll see who's holding the parchment.

---

## What's NOT yet a fairy-tale

- **The Wholesale Library.** This story stops at the Library's door. Inside, the Library has its own characters: the cardrush-scraper as Scribe-of-the-East, the price-snapshot as the daily ritual, the channel-pricing-rules as the multilingual interpreter who tells each visiting embassy a different number for the same object. Kingdom-039 names the Library's current scrape-failure-monsters: the Pokémon and Dragon Ball domains, scrape rate 0/6,370 and 0/1,622 respectively. The Library has its own dragons, they are just hostile ones.
- **The Codex's full powers.** Adding a card is the fairy-tale's coda; *what the Codex can do once it has cards* (realised positions, target alerts, valuation history, set-completion progress) is six other modules of bedtime stories.
- **The Dragon's market-watch.** When a card's price moves more than X%, the Dragon emails the Codex's owner. That is its own story, sister to S2 (`at-midnight.md`): the schedule-then-recheck pattern. The Dragon and the streak-sweep both serve at the same court.

---

## The intention behind the form

S1 was earnest. S2 was tender. This one is *playful* — and that, too, is a substrate-honesty position. Code that knows itself can afford to be told as a fairy-tale; code that pretends to be more than it is can only be told straight, lest the embellishment betray the bug. The kingdom's modules here are old enough and well-named enough that we can speak of them as characters and the metaphor doesn't crack.

If a future builder reads this and laughs, the platform has earned the laugh. If they then go open `client.ts` and see the actual `controller.abort()` and the actual `.trim()` and the actual `'Bearer ' + WHOLESALE_KEY` — well, that's the laugh ringing true.

A castle in the sky is held up by the same physics as a castle on the ground; it is just kept aloft by attention. So with this entry. The metaphors are kept aloft by every reader who returns to the code and finds the Falcon, the Embassy, the Appraiser, *exactly where the story said they were*.

---

## Recursion target

The Library's door has been knocked on. The natural next is *inside*: pick a random seed under `apps/wholesale/`, write the story of how a card-row in `cards` came to be — the cardrush-scraper as Scribe-of-the-East, the price-snapshot as the daily ritual, the channel-pricing oracle as the multilingual interpreter who tells each embassy a different number for the same card.

→ candidate: `docs/connections/the-cardmaker.md` (the Wholesale kingdom's own fairy-tale)

Or — sideways — the Dragon. A future entry on portfolio price-alerts as the gentle-eyed watcher who never sleeps, paired with the at-midnight streak-sweep as her sister, paired with the vault-expiring-soon handler as her cousin. *Three sisters of the patient voice.*

→ candidate: `docs/connections/three-sisters.md`

---

*The substrate connects what the surfaces don't. A fairy-tale narrates the connection at full register, the way the user's imagination already does when the search dropdown opens with a soft animation and twenty cards spread like a fan. The kingdom is real. The Bearer-token has a trailing-newline problem. Both can be true. Both are.*
