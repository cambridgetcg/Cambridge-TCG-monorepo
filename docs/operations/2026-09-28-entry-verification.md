# Entry and module map verification — 2026-09-28

Local implementation and verification by Codex (OpenAI GPT-6), with parallel
source inventory, navigation and documentation reviews. No publication or
deployment was performed.

## Completed

- [Module map](../modules/README.md): 28 source roots, 24 pnpm workspace
  packages, nine storefront domains, 68 library directories and 74 route
  families. Purpose, scope, progress, next review and evidence live in one
  catalog; 39 Markdown pages are generated views.
- [Entry design](../connections/the-entry-map.md): visitor homepage, separate
  agent/API landing, shared compact navigation and footer, and compatibility
  redirects. New paid-commerce prompts were removed from these entry surfaces.
- Repository human and agent guides point to the module map and their own
  working context. The old development plan is explicitly historical.

## Checks performed

| Check | Observed result |
|---|---|
| Frozen dependency installation | pnpm 9.15.0, Node 24.21.0, storefront and workspace dependencies; dependency install scripts disabled; no lockfile changes |
| Storefront TypeScript | Passed |
| Full storefront production build | Passed with isolated local initialization settings |
| Entry/navigation unit tests | Nine files, 71 tests passed |
| Local Chromium entry tests | Four tests passed: desktop/mobile search, agent entry, compatibility redirects |
| Visual inspection | Desktop and mobile entry pages; high-contrast and text-mode layouts; Japanese mobile render also checked for overflow |
| Module map | Generation, syntax, coverage, evidence and drift checks passed; eight invalid fixture cases rejected in an isolated temporary repository |
| Documentation links | Changed entry guides and generated module pages resolve their relative links |
| Navigation audit | Passed hard gates; existing informational coverage findings remain |

The unit checks cover the two home components, navigation configuration,
breadcrumbs, Nav, Footer, footer controls, welcome redirects and the agent page.
The browser test lives at
[entry-pages.spec.ts](../../apps/storefront/tests/entry-pages.spec.ts). Run it
against an already-running loopback server:

    STOREFRONT_BASE_URL=http://127.0.0.1:3001 pnpm --filter cambridgetcg-storefront exec playwright test tests/entry-pages.spec.ts

This spec requires an explicit local target. It intercepts native search
submission to check the query without calling the catalogue backend.

## What this establishes

The entry pages compile, render and route under the tested local setup.
The shared layout still initializes authentication and fetches public display
FX rates. The preview used a non-listening loopback database target, an
ephemeral local authentication secret and no copied credential files.
Account data, catalogue retrieval, provider delivery and production behavior
were not verified by this UI pass.

App Router can stream the shared layout before a page redirects. In that case,
the response is HTTP 200 with Next.js's redirect metadata; browser navigation
still reaches the fixed local destination. Tests cover both header and streamed
redirects, including rejection of arbitrary external destination input.

Existing build warnings about broad filesystem patterns are separate from
these entry changes. A passing module audit establishes documentation coverage
and selected source paths, not service health or feature completion.

## Maintaining progress

Edit [catalog.json](../modules/catalog.json), then run `pnpm docs:modules`
and `pnpm audit:modules`. CI now runs that audit. Do not hand-edit generated
module cards. Record future check results with their date and scope rather
than replacing unknown runtime state with a completion percentage.
