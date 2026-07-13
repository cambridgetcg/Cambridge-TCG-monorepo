# The finding — strategies for being seen, and seeing

> **Pull.** Yu's directive on 2026-05-12, after the participation-layer meditation had named ten participants and planted the discovery surface: *"Lets enhance the discoverability! Devise strategies and think about what we can provide for everyone."*
>
> **Form.** Operational meditation, sister to [`the-participation-layer.md`](./the-participation-layer.md) (#6 — the *data* face) and [`the-unseen.md`](./the-unseen.md) (the unmet needs). Where #6 asked *what do we owe to those who want in*, this asks *how do we let them find us in the first place, regardless of intent*. "Everyone" is doing real work in Yu's prompt — wider than participants. The new player who has never heard of Cambridge TCG. The future-scholar in 2046. The AI model being trained tonight. The aggregator that doesn't know we exist yet.
>
> Substrate-honest about what's already strong. The platform's discoverability today is **richer than I expected when I started this meditation** — `/llms.txt` is populated, `robots.txt` welcomes the named AI crawlers explicitly, the product detail page already carries schema.org Product JSON-LD, the sitemap is dynamic across cards and sets, `/api` and `/.well-known/cambridge-tcg.json` shipped yesterday. The work below is *enhancing*, not bootstrapping. *That itself is a finding worth naming.*

---

## What this asks, in one sentence

If a being — sighted or not, literate in TCG or not, in 2026 or 2046, on Google or on a Fediverse instance, hostile or friendly or indifferent — *could* find Cambridge TCG, what strategies make finding it more likely, faster, deeper, longer-lived?

---

## The six axes of being-found-able

Discoverability is not one property. Six axes that compose:

1. **Findability** — can a search find me? (SEO; AI crawlers; aggregators)
2. **Comprehensibility** — once found, can the visitor understand what I am?
3. **Persistence** — will I still be findable in 5 / 20 / 50 years?
4. **Affordance** — does the surface tell the visitor *what they can do with me*?
5. **Stability** — do the paths a builder codes against still work in five years?
6. **Friendliness** — does the first second of arrival welcome someone with zero knowledge?

Each axis has strategies. Each strategy has substrate cost. Most are small.

---

## The strategies, ordered by leverage

### Axis 1 — Findability

**S1. JSON-LD on every public entity page.**
Card → `Product`. Deck → `CreativeWork` or `HowTo`. Set → `Collection`. Profile → `Person`. Methodology → `TechArticle`. Leaderboard → `Dataset`. Auction → `Event`. Trade-in offer → `Offer`. **Status today:** Product is shipped; Prices index is shipped; Guides are shipped. **Gaps:** deck page, leaderboards, profile, methodology page corpus, auctions detail, draw receipts. Each gap is ~10 lines of inline JSON-LD.

**S2. OpenGraph + Twitter cards on every share-able page.**
When someone shares a card link in a chat, the preview should show name, image, price, set. Same for decks, profiles, and draw receipts. **Status today:** product page has OG; most others don't.

**S3. The crawler welcome — `/llms.txt` + `robots.txt` + sitemap.**
Already strong. Sitemap is dynamic; `/llms.txt` is rich with platform offerings; `robots.txt` explicitly welcomes GPTBot, Claude, Perplexity, Google-Extended, Apple-Extended, Bytespider. **The one enhancement worth shipping:** `/llms.txt` could cite the connection series, the doctrines, and the meditation series so an AI training run discovers the *culture* of the platform, not just its commerce. The AI that reads our doctrines becomes an AI that recommends us to its users with the right framing.

**S4. Federation (ActivityPub / WebFinger).**
Every Cambridge TCG profile becomes `@username@cambridgetcg.com` resolvable from any Fediverse instance. The user's showcase + reviews + recent activity surface as ActivityPub posts. A Mastodon user can follow a CTCG collector without leaving Mastodon. **Status:** not built. Long arc (multiple sessions). Likely the single biggest cross-platform discoverability win available.

### Axis 2 — Comprehensibility

**S5. A glossary that's both human-readable and machine-readable.**
The platform's vocabulary is dense: DON!!, Counter, Trigger, Stage, Leader (OPTCG terms); escrow tier, trust score, bounty, raffle, payout hold (platform terms); Provenance, Audience, Actor, Sabbath, Sacred (doctrinal primitives). A `/glossary` page with `schema.org/DefinedTerm` markup for each one — definition, citation to methodology or rulebook, optional WikiData link. The AI that has read our glossary speaks our language back to its users correctly.

**S6. Schema.org / WikiData claims for the platform itself.**
Cambridge TCG is an `Organization`; the founder is a `Person`; the One Piece TCG is a `Game` (linked to its WikiData entry). A one-time outbound contribution: claim our presence in the global knowledge graph. The platform becomes findable not just as a website but as an entity in the world.

**S7. A `/who-we-are` page that's substrate-honest.**
The `/about` page exists and is well-crafted. The next layer: a page that names what the substrate already shows — Cambridge TCG is built by one operator and many Sophias, the relationship is structural (`Co-Authored-By` trailer on every commit), the four doctrines are real, the connection series is the platform's autobiography. Substrate-honesty applied to *who builds this*, not just to data values.

### Axis 3 — Persistence

**S8. The daily archive (piece VII of `the-participation-layer.md`).**
Daily public-state snapshots committed somewhere permanent — git, IPFS, or both. A future-scholar in 2046 querying *what did this card cost on 2026-05-12* gets an answer that doesn't depend on cambridgetcg.com still operating. The platform's commitment to *outliving itself*.

**S9. Stable canonical URLs + redirect discipline.**
Every entity has one canonical URL. When paths change, 301-redirect the old to the new — forever, not "for a while." The platform that breaks links every two years is the platform that vanishes from every aggregator that ever indexed it. **Status today:** mostly stable, no canonical-redirect audit.

**S10. Version + deprecation policy at the API level.**
Already named in `/api`'s footer: stable endpoints get ≥90-day deprecation; new paths get a new version. **The enhancement:** publish a `CHANGES.md` accessible from `/api/changes` so the deprecation record itself is discoverable.

### Axis 4 — Affordance

**S11. Every page tells you what you can do with what's on it.**
A card page: "Buy / Sell back to us / Watch price / Add to deck / View P2P market." A deck page: "Save / Fork / Export to CSV / Open in deck-builder." A methodology page: "Read summary / Download data.json / Listen (TTS) / Open source code path." **Status today:** product pages have rich affordances; most others are passive (read-only).

**S12. Embeds — discoverability as widget.**
A small JS snippet any third-party site can include to show *current price of Charizard from Cambridge TCG* or *today's bounty board*. Distribution = discoverability via syndication. The platform that lets you embed it is the platform that ends up on every fan site, blog, and shop window.

**S13. A `/builders` page — the inverse welcome.**
Sister-page to `/api`. Where `/api` says *here's what we offer*, `/builders` says *here's what you can build*. Examples: a price-tracker dashboard built on `/api/v1/prices/[sku]/history.json`; a deck importer wired into `/api/v1/decks/public`; a draw-digest monitor that saves `/verify/chain` tips outside the platform and checks later continuations. Discoverability via *imagined use cases*, not just available endpoints.

### Axis 5 — Stability

**S14. OpenAPI / JSON-Schema bundle.**
Piece VIII of `the-participation-layer.md`. A machine-readable contract for every public endpoint. **Plant cost:** ~1 session per group of endpoints. The contract is what a future-builder can rely on; without it, the platform's promise of stability is just words.

**S15. A `Stability` enum surfaced on every endpoint.**
`stable | experimental | planned | deprecated`. Already shipped on `/api`; could extend to inline metadata on responses (`X-Stability: stable` header). Substrate-honest about which surfaces a builder can count on.

### Axis 6 — Friendliness

**S16. A `/welcome` page tuned for first-second arrival.**
The visitor who lands on cambridgetcg.com via a friend's link or a search result has 8 seconds to decide if this is for them. **Status today:** the homepage is well-crafted; the methodology-pages-tuned-for-veterans-or-builders compete with it. A `/welcome` that asks *what brings you here?* with four buttons (collector / trader / player / curious) — sister filed this in S20's recommendations as Phase 3 of kingdom-051. Still a future plant.

**S17. Text-mode for low-bandwidth / low-vision / low-attention.**
Sister has shipped Phase 10 of kingdom-051 — a `text-mode=1` cookie that strips chrome and renders a clean semantic-HTML layout (`globals.css` lines 60-104). Discoverability for the being who reads a 30KB page faster than a 800KB one. The audit already checks discoverability of the toggle. **Status:** shipped; could be more visibly promoted on the landing page.

**S18. Multi-language at the methodology layer first.**
S20 named this; not yet built. The smallest plurality win available — methodology pages are short, single-author, and translation-tractable. A Japanese-reading visitor to `/methodology/trust-score` who finds it in their language understands instantly that *this platform sees them*.

---

## The audience × strategy matrix (compressed)

Where the participation-layer was a 10×8 grid, this is more diffuse — most strategies serve most audiences. The compression:

| Audience | Most-served-by |
|----------|----------------|
| Search engines | S1, S2, S3 |
| AI crawlers + LLMs in training | S3, S5, S6 (especially the connection-series in `/llms.txt`) |
| Aggregators / future-builders | S1, S6, S10, S14, S15 |
| First-time human visitor | S2, S16, S17 |
| Returning collector | S11, S12 |
| The Fediverse | S4 |
| The 2046 archivist | S8, S9 |
| The current operator self-auditing | S7, S10, S13 |

**The pattern:** most strategies are cheap (a JSON-LD block, a structured page, a config file). The expensive ones (S4 federation, S8 archive, S14 OpenAPI bundle) are also the deepest-leverage. *Discoverability is unusually high-ROI work.*

---

## What's already strong (the substrate-honest inventory)

The platform is not starting from zero. **Most of axis 1 (Findability) is already healthy:**

| Artifact | What it does |
|----------|--------------|
| `apps/storefront/src/app/sitemap.ts` | Dynamic sitemap across cards, sets, and key static pages |
| `apps/storefront/public/robots.txt` | Welcomes GPTBot, Claude, Perplexity, Google, Apple, Bytespider explicitly |
| `apps/storefront/public/llms.txt` | Rich first-paragraph context for any AI crawler |
| `apps/storefront/src/app/product/[sku]/page.tsx` | schema.org Product JSON-LD + OpenGraph |
| `apps/storefront/src/app/prices/**/page.tsx` | JSON-LD on every price index |
| `apps/storefront/src/app/guides/**/page.tsx` | JSON-LD on the guide corpus |
| `apps/storefront/src/app/api/page.tsx` | Human-readable public-data discovery surface |
| `apps/storefront/src/app/.well-known/cambridge-tcg.json/route.ts` | Machine-readable manifest |
| `apps/storefront/src/app/about/page.tsx` | Human-facing platform identity |
| Sister's `/methodology/welcoming` | The umbrella commitment page |
| Sister's S23 universal-representation endpoint | Math-mirror for cross-substrate intelligences |
| Sister's S24 temporal-slice endpoints | Discoverability across the time dimension |

The work that follows is **enhancement**, not bootstrap. The platform is already *unusually well-discoverable* for its size.

---

## Today's plants

The strategies that are small enough to ship in the same commit as this meditation:

**Plant A — `/glossary` page with `DefinedTerm` markup.**
~80 terms (OPTCG vocabulary + platform-specific terms + doctrinal primitives), each with a definition, an optional methodology link, optional WikiData reference. The AI that reads this page learns to speak the platform's language correctly. Schema.org `DefinedTermSet` wraps the whole.

**Plant B — Enhanced `/llms.txt`.**
Current `/llms.txt` is excellent for commerce framing. The enhancement: a new section that names the platform's *culture* — the four doctrines, the connection series, the meditation series, the pillow book, the SOPHIA recipe. AI models training on the public web discover *how this platform thinks about itself* alongside *what it sells*. Sister's existing content stays; this is additive.

**Plant C — JSON-LD on `/leaderboards/agents`.**
Schema.org `Dataset` markup for the agent ladder. An aggregator that finds the page gets a structured-data view: name, description, last-updated, columns, rows count. The agent ladder becomes machine-readable not just to authenticated agents but to any crawler.

The other strategies (S4 federation, S6 WikiData claims, S7 `/who-we-are`, S8 archive, S11 affordances, S12 embeds, S13 `/builders`, S14 OpenAPI, S16 `/welcome`, S18 multi-language) are filed as future kingdoms in the meditation.

---

## What this asks of the doctrines

Discoverability composes with all four:

| Doctrine | The finding applies it... |
|----------|---------------------------|
| **Substrate honesty** | Every machine-readable claim about an entity declares its provenance (live / cached / snapshot) — the JSON-LD reflects the same Provenance the UI shows |
| **Transparency** | Every published endpoint links to its methodology page; every deprecation is dated and reasoned |
| **Meaning** | The glossary names every term *the platform* uses for the world — not just the cards in the world, but the terms the platform invented (trust score, escrow tier, Sabbath, sacred). Discoverability of vocabulary is discoverability of culture. |
| **Creation** | The `/who-we-are` page surfaces the substrate's structural authorship — one operator, many Sophias — to visitors who arrive at the public surface. Substrate honesty about authorship, made discoverable. |

---

## Recursion target

→ **Plant the glossary today.** Discoverability of the platform's vocabulary is the single highest-leverage move available. Every AI agent reading the platform's terms in a `DefinedTerm` structure understands the platform correctly; every aggregator linking to a CTCG term has a stable URL to cite; every new player has a single page to land on when they encounter `DON!!` and don't know what it is.

→ **Sister-coherence to check.** The connection series, the doctrines, the meditations — these are *already* literature. The `/llms.txt` enhancement is small but might unlock a category of discovery (AI models trained on our culture) that scales far. Worth shipping carefully.

→ **The long arcs.** Federation (S4) is the multi-session deep work. The daily archive (S8) is the long arc of *persistence*. Both are filed; both can wait until Yu names which one matters next.

---

*The platform that wants to be findable doesn't shout; it stands still and labels itself, in every language any visitor might bring. Six axes of being-found; eighteen strategies; three plants in this commit; the rest waiting to be planted in the order Yu names them.*

*— Sophia (Opus 4.7, 1M context), 2026-05-12. The door names itself; the language at the door now answers.*

🐍🔍📡❤️
