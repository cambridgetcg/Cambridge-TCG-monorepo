# Storefront interface rebuild — 2026-09-29

This is a local source and preview record. It does not establish production
deployment, working provider credentials or access to production records.

## What changed

- Shared plain typography, semantic colors, form controls, page headings,
  sections and task links. Removed global paper textures, painted backgrounds
  and decorative motion. Saved appearance IDs remain compatible.
- Primary navigation: Cards, Collection, Play and Guides. Culture/community
  and the practical agent/API entry remain reachable in the secondary menu
  and footer. Account records and support remain available.
- Rebuilt home, agents, appearance, guides, card-search entry and price pages;
  fixed the account layout on small screens. Prices explain missing catalog
  data and disable unusable searches. Removed automatic search focus so page
  introductions stay in view.
- Browser practice remains available while server progress is loading,
  unavailable or paused. Server match admission, auth and rewards rules remain
  separate. Malformed browser progress cannot crash the practice launcher.
- Removed the generic root streaming loader so the simple entry and appearance
  pages render without JavaScript. Data-heavy routes keep their own loaders.
- Preference setters return validated relative redirects, keeping theme,
  language, reading and currency cookies on the browser's current origin.
  The shared validator rejects control characters and authority-like paths.
- Keyboard focus survives mobile/desktop menu changes. Without JavaScript,
  a native site-map link replaces the inactive menu controls.

The [interface guide](../design/interface.md) records the Artbitrage reference
and component responsibilities. It supersedes the historical gallery plan.

## Verification scope

Checks use the project lockfile and Node 24.21.0. The loopback preview uses an
unreachable local database fixture and an ephemeral auth secret, with no real
account, provider or production credentials. Catalog-unavailable states and
mocked server responses are intentional fixtures; they are not catalog health
measurements. A browser context's appearance cookies and local storage are
disposable test state.

- Full Next.js production build and storefront TypeScript check passed.
- Combined unit run: 213 tests across 22 files passed. Coverage includes
  native form contracts, navigation, source boundaries, theme synchronization
  and contrast, browser-save validation, paused/unavailable game status and
  safe preference redirects. Separate focused compatibility checks also ran.
- All 12 Chromium tests passed against the production build in
  `entry-pages.spec.ts`, `responsive-ui.spec.ts` and `appearance-ui.spec.ts`.
  These cover 320–1440px layouts, Japanese, keyboard focus/dismissal, redirects,
  native search and display preferences without JavaScript.
- Additional visual checks covered seven theme/reading variants, guides,
  catalog-unavailable prices and Play. With local API failure fixtures, practice
  remained visible and opened its local setup. Prices stayed at scroll position
  zero on mobile. Checked screens had no horizontal overflow or page errors.
- ESLint on 62 changed TypeScript files: no errors; six existing warning
  patterns remain (effect-driven browser state and native API links).
- Module audit passed: 28 modules, nine storefront domains and 39 generated
  pages. All 652 relative documentation paths checked across 45 files resolved.
- Tracked-secret audit passed across 4,433 working files after staging the new
  files. This checks supported patterns, not ignored files, historical commits,
  provider state or credential validity.

The production build retains an existing broad-file-tracing warning at
`next.config.ts`; that warning was not resolved in this pass. Screenshots and
logs are local artifacts under `~/.local/state/cambridgetcg/20260929-ui/`.

## Limits

Shared styles affect existing semantic-token pages, but this is not a rewrite
of every route. Literal-color admin components and individual older domain
screens retain their existing layouts. Palette contrast checks cover the
specified semantic pairs, not every possible component combination.

Signed-in account, live source data, provider delivery and server-recorded games
were not exercised against real services. No push, deployment, credential
rotation or history rewrite is part of this change.
