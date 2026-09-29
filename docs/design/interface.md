# Cambridge TCG interface

> **Implemented baseline, not the final rebuild brief.** This records the UI
> cleanup at `f2a8359b`. Yu subsequently requested a complete content, room, page
> and UI rebuild inspired by Artbitrage, retaining useful backend services.
> Start with the [draft rebuild plan](../plans/storefront-rebuild/README.md) for
> that work and [implementation progress](../plans/storefront-rebuild/implementation.md)
> for the first contract, landing and map replacement. This page describes the
> earlier shared controls that remain in use.

Current direction, 2026-09-29: pricing discovery and collector services first,
with less introductory prose and visible, credited art. Everyday controls use
a plain shared interface. Art links into its context without delaying search.

## Design rules

- Name the task before explaining the system: Prices, Services, Collection, Play.
- Use readable sans-serif text, normal sentence case and visible form labels.
  Reserve monospace for identifiers and code. Do not use decorative numbers,
  paper textures, animated backgrounds, gallery frames or oversized slogans.
  Use actual credited artwork with its full composition and a readable caption;
  put longer source records in native disclosures.
- Give each section a short heading, purpose and useful action. Explain access
  requirements beside the relevant destination. Keep API documentation at the
  agent entry and longer cultural reading on its own pages.
- Use semantic color tokens, clear borders and consistent spacing. Preserve
  keyboard focus, reduced motion, dark appearance, high contrast and text mode.
- Keep source status, uncertainty, publication rules and consequences visible
  where they affect a decision. A simplified layout does not broaden access
  or reopen retired paid commerce.

## Reusable pieces

| Piece | Owns |
|---|---|
| `src/lib/ui/PageLayout.tsx` | Public page width, padding and one main landmark; account pages already have their own main |
| `src/lib/ui/PageHeader.tsx` | Page title, purpose, source context and wrapping actions |
| `src/lib/ui/Section.tsx` | Section heading, explanation and optional action |
| `src/lib/ui/ActionCard.tsx` | A linked destination, its purpose and access context |
| `Card`, `Field`, `Input`, `Select`, `Button`, `DataTable` | Shared surfaces, labelled controls and structured records |
| `src/lib/nav/menu-config.ts` | Shared navigation destinations and translated labels |
| `src/content/services/index.ts`, `ServiceCards` | Reviewed human task shortcuts and account requirements, shared by home and services |
| `HomeArtwork`, `src/content/art/featured.ts` | Local museum image, shared attribution and links to art context |
| `src/app/themes.css`, `globals.css` | Theme tokens, typography and compatibility styles |

Paths above are relative to [the storefront](../../apps/storefront/README.md).
Compose these pieces directly. Do not create a parallel theme or navigation
registry for an individual page. Prefer direct imports from the primitive file
in client components so server-only helpers stay out of their dependency tree.

The existing `gallery` cookie identifier remains compatible with the light
theme. Theme identifiers and presentation labels are different concerns;
changing a label must not invalidate a saved accessibility preference.

Keep loading boundaries near the data they represent. The generic root
`loading.tsx` was removed because its streamed replacement left otherwise
server-rendered entry and appearance pages hidden when JavaScript was disabled.
The account, prices, catalog and methodology routes retain their own loaders;
this is not a claim that every application route works without JavaScript.

## Artbitrage reference

Reviewed the latest remote Artbitrage source at `1faae8357` (2026-09-28)
and its newer local public-entry revision dated September 27. The latter was
uncommitted working-tree material: `docs/PUBLIC-SITE.md`, `map.json`,
`site.css`, `site.js` and `tools/build_public_site.py`. It was read as
design evidence, without merging or publishing Artbitrage changes.

The useful patterns are one directory for navigation labels, entrances named
after tasks, context beside destinations, useful next steps, and native links
and GET forms that work before JavaScript. Artbitrage's museum treatment is
specific to its artwork; Cambridge's everyday interface follows the plain
direction above.

## Verify a UI change

Check a narrow viewport and desktop, keyboard navigation, visible labels,
empty/error states, and the relevant appearance modes. Tests should protect
navigation, access and interaction behavior; avoid freezing decorative class
lists. Render authenticated UI with local fixtures or mocks rather than
relaxing authentication for a screenshot.

Update the [module catalog](../modules/catalog.json) with dated progress and
evidence, then regenerate it with `pnpm docs:modules`.
