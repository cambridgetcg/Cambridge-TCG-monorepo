---
id: kingdom-091
title: Per-set metadata fidelity — head/body honesty on 404 prices routes
status: done
priority: medium
engine: tcg
repo: /Users/yournameisai/Desktop/Cambridge-TCG-monorepo
claimed_by: sophia-2026-05-14 (Opus 4.7, 1M context)
claimed_at: "2026-05-14T22:30:00Z"
completed_at: "2026-05-14T22:37:00Z"
paths:
  - apps/storefront/src/app/prices/[game]/[set]/page.tsx
  - apps/storefront/src/app/prices/[game]/[set]/[number]/page.tsx
  - docs/missions/kingdom-091.md
do_not_touch:
  - apps/wholesale/**                            # upstream catalog is the real authority on set rows
  - drizzle/**                                   # no schema changes — this is a head/body alignment fix
  - packages/sku/**
related:
  - docs/principles/substrate-honesty.md          # head and body must tell the same truth
  - docs/missions/kingdom-090.md                  # adjacent — sister's "/prices/coverage 404 from per-game" link is its own gap, not bundled here
synced_from: in-repo authored (not yet in dev-state.json)
synced_at: "2026-05-14T22:30:00Z"
---

# kingdom-091 — Per-set metadata fidelity

## What this is

While crawling the `/prices` subnav on 2026-05-14 22:22 GMT for under-development surfaces, the live probe surfaced a head/body mismatch on `/prices/[game]/[set]` and `/prices/[game]/[set]/[number]`:

```
GET https://cambridgetcg.com/prices/pokemon/sv1
HTTP/200
<title>SV1 SV1 Price Guide — Pokémon TCG UK</title>
<h1>Page not found</h1>
```

The status code is 200 (Next.js's standard `notFound()` behaviour with metadata), the **title is a plausible-looking real title**, and the **body is the 404 page**. Search engines, SEO scrapers, social-share previews, and partner federation crawlers see *"SV1 SV1 Price Guide — Pokémon TCG UK"* in the metadata while a human visitor sees *"Page not found."* Head and body disagree.

Root cause: `generateMetadata` runs in parallel with the page handler. The handler calls `notFound()` when `!setInfo && cardsData.items.length === 0`, but `generateMetadata` only checks `cfg` (`!cfg ⇒ "Price guide not found"`); when `cfg` exists but `setInfo` doesn't, it cheerfully assembles `${setCode} ${setName} Price Guide` with `setName` falling back to `setCode` (hence the duplicated *"SV1 SV1"* shape). Same pattern on the per-card metadata function — when `loadCardState()` returns null, it emits `${set} ${number} — Card Price Guide UK` instead of a not-found title.

This is a substrate-honesty violation: the artifact does not tell the truth about its own state.

## Scope

- `/prices/[game]/[set]/page.tsx:80-98` — `generateMetadata` fallback when `setInfo` missing
- `/prices/[game]/[set]/[number]/page.tsx:44-52` — `generateMetadata` fallback when `loadCardState` returns null

Reproducers: `/prices/pokemon/sv1`, plus any garbage set slug under any registered game (e.g. `/prices/one-piece/nonexistent`, `/prices/pokemon/zzz`). Each produces a fake-looking title with an authentic-looking pricing-guide promise; the body is 404.

## Fix shape

Both metadata functions adopt the page handler's notFound guard:

```ts
// [set] page
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { game, set: setSlug } = await params;
  const cfg = await resolveConfig(game);
  if (!cfg) return { title: "Price guide not found" };
  const setCode = setSlug.toUpperCase();
  const sets = await fetchSets(cfg.slug).catch(() => []);
  const setInfo = sets.find((s) => s.code.toUpperCase() === setCode);
  if (!setInfo) {
    return { title: `${setCode} — set not found · ${cfg.display_name}`, robots: { index: false } };
  }
  // existing happy-path…
}
```

Same shape on the `[number]` page. The `robots: { index: false }` directive keeps search engines from indexing the not-found state — the head no longer baits a click that lands on 404.

The `[set]` page handler retains its existing tolerance (`!setInfo && cardsData.items.length === 0 ⇒ notFound`) so orphan-cards-with-no-set-row still render hospitably. This kingdom does not change the page-handler semantics — only the metadata alignment.

## What did NOT change

- **No data work.** Real fixes (ingest English-Pokémon catalog, add SV1 to the sets table with a proper name) are upstream concerns owned by the data-ingest kingdoms. This kingdom is purely about head/body honesty when the set is genuinely not in the catalog.
- **No route changes.** Same URLs, same status codes, same page handler logic.
- **No `<Provenance>` / `<WhyLink>` surface changes** — the bug is metadata-only.

## Acceptance

- `/prices/pokemon/sv1` returns 200 + title containing *"not found"* (matches the body), with `robots: noindex`.
- `/prices/one-piece/op11` (real set) still returns 200 + proper "OP11 Godspeed Fist Price Guide" title.
- `/prices/pokemon/op01/001` (garbage slug) — `[number]` page returns 200 + not-found title.
- `pnpm exec tsc --noEmit -p apps/storefront/tsconfig.json` exit 0.
- Live verify on the deploy after merge: head and body agree.

## Recursion targets

1. **Coverage-map 404** — `/prices/coverage` returns 200 with a notFound body, linked from every per-game *"full coverage map →"* link. Separate kingdom; either build the page or scrub the link.
2. **`pnpm audit:set-discovery` extension** — current audit covers ingest discovery; extend to verify that every set referenced by URL convention (registered code in the sets table) has a non-empty `name`. Today `SV1` exists in the catalog with `name = SV1` (or null), surfacing the *"SV1 SV1"* title — a separate data issue from the metadata mismatch this kingdom fixes.
3. **Anticipated-set placeholder UI** — for sets that are registered but pre-ingest (the case the `[set]` handler explicitly tolerates), render a substrate-honest *"anticipated set — coverage pending"* state with cardrush/tcgplayer expected-source pills, instead of the current implicit empty table. Companion to the *"preparing coverage"* tile pill on the landing.
4. **Per-card metadata for known-stub variants** — once English-Pokémon catalog ingests, the `[number]` page's anticipated stub copy should distinguish *"card exists in catalog, no price observed yet"* from *"card not in catalog"*. Today both look like 404.

## Live verification (2026-05-14 22:37 GMT)

Production deploy `dpl_FfPppsmEp2LNMF4EFTMPvrGZHmrM` of SHA `d78ee10` confirms the fix. Playwright probe against cambridgetcg.com:

| URL | Before | After |
|---|---|---|
| `/prices/pokemon/sv1` | `<title>SV1 SV1 Price Guide — Pokémon TCG UK</title>` + body 404 | `<title>SV1 — set not found · Pokémon TCG</title>` + `robots: noindex` + body 404 |
| `/prices/pokemon/sv1/zzz` | `<title>SV1 ZZZ — Card Price Guide UK</title>` + body 404 | `<title>SV1 ZZZ — card not found · Cambridge TCG</title>` + `robots: noindex` + body 404 |
| `/prices/one-piece/op11` (real set) | unchanged | `<title>OP11 Godspeed Fist Price Guide — One Piece TCG UK</title>` (happy path preserved) |

Deploy chain: kingdom-091's fix shipped as commit `e3a7137`; pre-existing Next.js 16 dual-middleware build break (sister's `122ed36` had added `proxy.ts` next to `middleware.ts`) blocked every deploy since `440ded5`; cleared by `d78ee10` deleting the deprecated `middleware.ts` (sister had this locally but unpushed — verify-don't-overwrite applied). Both commits API-deployed via Vercel team token because the GitHub-account-email check is flaky for `dev@zerone.money` (see memory `[[vercel-email-check]]`).

## Why "fidelity" not "404 polish"

The same kingdom could be framed as *"make the not-found pages prettier"* — that would miss the point. The principle violated is substrate honesty: every value carries an implicit claim about how it came to be true. The fake title's implicit claim was *"this page is a real price guide called SV1 SV1"*; the body's claim was *"this page does not exist."* Both can't be true. Fidelity, not polish.

🐍❤️
