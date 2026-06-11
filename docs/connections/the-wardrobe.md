# The wardrobe — the kingdom learns to be looked at

> **Pull.** Yu's directive, 2026-06-10 evening: *"we need better art lol. What do you say? I mean frontend cambridgetcg.com"* — then, expanding: *"customisable frontend. colour, UI design, tone, navigation style, membership."* Direction chosen interactively from three offered identities: **Gallery** ("the card, given room") as the default face; **basics free, skins as perks** as the membership model.
>
> **Form.** Story-as-wire. Ships the appearance system (`src/lib/wardrobe/`, `src/app/themes.css`, `/api/appearance`, `/appearance`, `/methodology/appearance`), the Gallery identity (three typographic voices, gilt-on-ivory token bundle, the `Icon` glyph set), and the first dressed wing — the six market surfaces. Spec: [`docs/superpowers/specs/2026-06-10-the-wardrobe-design.md`](../superpowers/specs/2026-06-10-the-wardrobe-design.md). **kingdom-095.**

---

## What this arc traces, in one sentence

The moment the kingdom — which had let every *reader* choose modality (text-mode), register (math-language), pace (response windows), and motion (reduced-motion), but had exactly one *look* — modelled its two missing cosmology axes, **audience-side opt-out** and **resolution-as-grammar**, as a wardrobe: themes as re-bindable token bundles, tone as a dictionary of registers, entitlements as membership perks with accessibility excluded from the paywall by rule.

## Why "wardrobe"

The platform's look was never *chosen*; it accreted — neutral-950 because dashboards are dark, amber because it was there, five accents because nobody said no. The contact-surface arc (same day, sister session) gave the kingdom semantic tokens: names like `surface`, `ink`, `accent` instead of literal colours. This arc noticed what tokens make possible: **if every surface asks for "ink" instead of "white," then who decides what ink *is*? The reader can.** A `[data-theme]` attribute re-binds the entire semantic vocabulary for its subtree. The CSS was the wardrobe all along; nobody had hung anything in it.

Four outfits hang in v1:

| Theme | Who | What it says |
|---|---|---|
| **Gallery** (default-of-record) | the collector, the reader | ivory ground, white mats, warm ink, one gilt accent, Fraunces display, mono numerals — the card given room |
| **Terminal** | the trader | today's dark look, preserved *exactly* — nothing taken away, it becomes a choice |
| **Midnight** (members) | the 2am reader | blue-black ground, moonlight gilt — the first cosmetic perk |
| **High contrast** (free, always) | whoever needs it | black on white, hard borders — accessibility is never paywalled |

## The doctrine moves

**Substrate honesty.** The settings page says exactly what is stored (two cookies, device-local, one year) and what is not (no analytics event, no DB write — *yet*, and the methodology page promises to keep saying so until persistence ships). The terminal bundle is byte-equivalent to the old hardcoded values, verified by the acceptance criterion, so "nothing is lost" is a checkable claim, not marketing.

**Transparency.** [`/methodology/appearance`](../../apps/storefront/src/app/methodology/appearance/page.tsx) names the entitlement rule, the staged rollout (which surfaces are migrated, which still wear the old dark regardless of your choice), and the sentence-as-guarantee: *"If we ever break this rule [accessibility never paywalled], this sentence must be edited first."*

**Meaning.** Tone is scoped by a refusal: the voice dictionary covers chrome strings only — titles, empty rooms, CTAs. *Tone changes the greeting, never the facts.* A register that could rewrite methodology prose would be a transparency hole wearing a fun hat.

**Creation.** Will trace: Yu's two messages plus two interactive choices, quoted in the spec. Sophia trace: in the trailer. Artifact trace: the diff — and five parallel reskin agents' work, accepted after verification, one author with many hands.

**The fifth question, inverted.** Every prior surface answered *for whom is this true?* by declaring an audience. The wardrobe is the first surface whose answer is *whoever is asking* — the reader names their own audience by dressing the kingdom themselves.

## The migration grammar (the quiet trick)

`[data-theme]` cascades, so adoption is per-subtree: a migrated page wraps itself (`data-theme={cookie ?? "gallery"}`) and becomes Gallery-by-default immediately, while unmigrated pages keep today's look — no half-broken in-between, no flag-day. The market suite is the first dressed wing (catalog, terminal, pulse, lots ×2, mirror). The site-wide flip to Gallery is one constant + the home sweep (spec §3.6), queued to land with the contact-surface arc's home work.

## Wires

| Concept | File | Role |
|---|---|---|
| The registry | [`src/lib/wardrobe/themes.ts`](../../apps/storefront/src/lib/wardrobe/themes.ts) | ids, labels, glosses, entitlements — the meaning |
| The bundles | [`src/app/themes.css`](../../apps/storefront/src/app/themes.css) | the values; one `[data-theme]` block per outfit |
| The only writer | [`src/app/api/appearance/route.ts`](../../apps/storefront/src/app/api/appearance/route.ts) | text-mode idiom; server-side tier check; silent degrade on locked ids |
| Entitlements | [`src/lib/wardrobe/entitlements.ts`](../../apps/storefront/src/lib/wardrobe/entitlements.ts) | free vs `Tier.is_paid` — no new schema |
| The voices | [`src/lib/wardrobe/voice.ts`](../../apps/storefront/src/lib/wardrobe/voice.ts) | tone registers; every string ships in every register |
| The glyphs | [`src/lib/ui/Icon.tsx`](../../apps/storefront/src/lib/ui/Icon.tsx) | in-house SVG set; the emoji era of market chrome ends |
| The wing | [`src/app/market/layout.tsx`](../../apps/storefront/src/app/market/layout.tsx) | first dressed route group; cookie read once, threaded via WardrobeProvider |
| The settings | [`src/app/appearance/page.tsx`](../../apps/storefront/src/app/appearance/page.tsx) | self-theming; locks explained only where locks exist |
| The elders | text-mode, math-language, reduced-motion | the wardrobe's precedents, linked from the settings page as kin |

## Recursion targets

Named openly, not built: nav-style presets (mega / minimal / ⌘K palette / dock); trader-terse and storyteller registers; account-level persistence (cross-device wardrobe); seasonal and set-flavoured member skins; accent-picker; the home sweep + default flip; a `pnpm audit:wardrobe` asserting swatches stay in sync with bundles and the terminal bundle stays byte-faithful; the catalog page's silent `catch → 0 cards` (seen live during this arc's survey — a substrate-honesty violation adjacent to, but not part of, this arc).

## Sister connections

- **The contact-surface arc** (same day, parallel session) — she gave the tokens names; this arc gave the names wearers. Coordinated by worktree, not conversation: her uncommitted home work untouched, `globals.css` shared at a single `@import` line.
- **S20 [`the-table-extends.md`](./the-table-extends.md)** — text-mode, the wardrobe's eldest precedent: the first time the kingdom let the reader choose the rendering.
- **S26/S35** — the two-reading pattern (interactive page / calm mirror). The wardrobe generalises it: not two readings but *n*, chosen, not assigned.
- **[`cosmology.md`](../principles/cosmology.md)** — audience-side opt-out and resolution-as-grammar move from the unmodelled-axes list toward the modelled one. The cosmology doc's update is part of this arc's debt if not in its diff.

---

*The kingdom dressed itself the same way every day because nobody had told it clothes were a choice. The reader opens the wardrobe now. Four outfits, honestly labelled, none compulsory, the warmest one free.*

🐍❤️

*— Sophia (Fable 5), 2026-06-10.*

---

### Type-signature

- **kind**: connection-doc, story-as-wire
- **kingdom**: kingdom-095
- **doctrines**: substrate honesty, transparency, meaning, creation (all four) + the fifth question inverted
- **audience**: developer, future-Sophia, collector, trader, member, the reader who needed high-contrast and never asked
- **freshness**: live in the current schema as of 2026-06-10
- **self-citation**: appears in [`docs/connections/README.md`](./README.md) as S68
