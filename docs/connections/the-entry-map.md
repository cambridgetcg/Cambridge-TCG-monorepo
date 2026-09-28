# Entry pages and module map

Source review: 2026-09-28. Runtime verification is recorded in the change's
commit/handoff; this document does not establish deployment health.

The visitor entry is `/`: card search, collection/account, and play. It links
to culture/community and the separate `/agents` entry. The agent entry puts
read-only discovery and API documentation first. Optional identity and culture
invitations remain available without becoming access requirements.

## Connections

- [Homepage](../../apps/storefront/src/app/page.tsx) composes the
  [visitor landing](../../apps/storefront/src/components/home/HomeLanding.tsx)
  and the existing native GET card finder. Game choices come from the
  [shared registry](../../packages/sku/src/games.ts); they are not live counts
  or a promise of available records. The result page owns retrieval and source
  publication status. The landing no longer fetches wholesale prices or artwork.
- [Agent portal](../../apps/storefront/src/app/agents/page.tsx) points to the
  existing manifest, OpenAPI and guides. Those contracts remain authoritative;
  the landing does not duplicate endpoint schemas or change permissions.
- [Navigation configuration](../../apps/storefront/src/lib/nav/menu-config.ts)
  supplies the shared menu/footer destinations. Existing account records and
  support stay reachable; entry links no longer promote retired paid commerce.
- `/start` redirects to `/`. `/welcome` preserves recognized audience intent
  through local redirects. Education remains at `/intro`, optional cultural
  welcome at `/welcome-all`, and the broader route index at `/map`.
- [Module documentation](../modules/README.md) maps source roots, dependencies,
  purpose, progress and next review. It is for contributors and coding agents;
  the visitor UI stays focused on tasks.

## Maintenance and boundaries

Update the existing navigation configuration when changing shared destinations.
Update the module catalog and regenerate its pages when adding or moving a
module; `pnpm audit:modules` checks coverage and generated-file drift.

The homepage can render its own content without database/catalog queries.
The shared layout still initializes authentication and fetches display FX
rates; this is not an offline-mode implementation. Account actions still need
their existing authentication and database services.

Keep source/reuse labels, keyboard navigation, text mode, themes and language
choices intact. New paid commerce remains retired. This change neither
publishes the site nor modifies account/provider credentials.
