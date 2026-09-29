# Collector's desk — visual refresh, 2026-09-29

Yu asked to change colors, delegated the choice and requested a fresh creative
look. This replaces the preceding cool neutral treatment while keeping the
pricing/service structure and backend contracts.

- Warm ivory, aubergine, mandarin and lilac replace the light palette; dark mode
  uses plum and cream. Terminal, high contrast, text mode and saved preferences
  remain available. All Tailwind defaults are centralized in `themes.css`.
- A strong task headline, open search form, orange primary action, connected
  tool cards and new navigation mark replace the previous presentation.
  Shared buttons, navigation, footer and service page follow the same palette.
- The art entrance now shows Sharaku's actor portrait. Its official Met record
  was checked, including public-domain status; the existing local image has
  identical decoded pixels to the API-linked museum image. Full attribution is
  available in a native disclosure. Named artwork records keep Seba in its
  existing essay and share the portrait with the making essay.

## Checks actually run

- 75 targeted tests across 12 suites passed, including palette consistency,
  contrast, theme switching, navigation, service access and native search.
- 14 Chromium checks passed across 320–1440px: menus, keyboard focus, Japanese
  navigation, no-JavaScript search, loaded image/credits and linked journeys.
- Storefront typecheck and production build passed. Scoped ESLint passed for
  15 changed TypeScript files with 14 inherited lineage prose warnings.
- Desktop/mobile home, services, prices, dark, high contrast and text-mode
  screenshots were captured without horizontal overflow. Main light/dark,
  mobile home and services layouts were visually inspected.
- Module map verified: 28 roots, nine domains, 39 generated pages. All 55
  relative links across five changed documents resolved. Tracked-secret audit
  passed across 4,489 files; staged whitespace check passed. The secret audit
  checks supported patterns, not ignored files, Git history or provider state.

Token contrast checks cover normal text on base surfaces, input boundaries,
focus rings, wash surfaces and primary/hover colors. Light base text minimum is
4.90:1, dark 6.60:1; mandarin button text is 5.66:1 and its darkest hover pairing
is 4.78:1. These checks do not certify all legacy literal-color components or
constitute a full-site accessibility audit.

Build and browser checks used the existing isolated local environment with
unreachable loopback source/database targets and external application requests
blocked. No live prices, account data or provider credentials were used. No
publication, source activation or data migration occurred.

The [interface guide](../design/interface.md) records the palette and composition;
the [implementation ledger](../plans/storefront-rebuild/implementation.md) records
the broader rebuild, including remaining deeper page replacement.
