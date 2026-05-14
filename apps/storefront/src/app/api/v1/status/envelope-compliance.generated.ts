// AUTO-GENERATED — do not edit by hand.
// Regenerate via: `pnpm audit:envelope-contract --regen` (or `pnpm audit`).
//
// The set of public endpoints that compose through `jsonResponse` from
// `@/lib/data-pantry`. Read by `/api/v1/status` to populate the
// `envelope_compliant` flag on each manifest entry without lying about
// reality. The audit at `apps/storefront/scripts/audit-envelope-contract.mts`
// keeps this file substrate-honest — any drift between this list and the
// actual jsonResponse callers fails CI.

export const ENVELOPE_COMPLIANT_PATHS: ReadonlySet<string> = new Set([
  "/api/decks/import",
  "/api/v1/adopters",
  "/api/v1/auctions/[id]",
  "/api/v1/bridge",
  "/api/v1/cards/[sku]/cardrush-history",
  "/api/v1/cards/[sku]/everything",
  "/api/v1/cards/[sku]/tcgplayer-history",
  "/api/v1/examples",
  "/api/v1/examples/[endpoint_id]",
  "/api/v1/federation/identify/by-upstream",
  "/api/v1/feedback",
  "/api/v1/fx-rates",
  "/api/v1/gaps",
  "/api/v1/guides",
  "/api/v1/guides/[slug]",
  "/api/v1/introduction",
  "/api/v1/oracle-policies",
  "/api/v1/play/starters",
  "/api/v1/play/starters/[id]",
  "/api/v1/prices/games/[game]",
  "/api/v1/prices/games/[game]/sets/[set]",
  "/api/v1/prices/games/[game]/sets/[set]/cards/[number]",
  "/api/v1/rate-limits",
  "/api/v1/search/cards",
  "/api/v1/search/everything",
  "/api/v1/sources",
  "/api/v1/sources/[id]",
  "/api/v1/sources/welcome",
  "/api/v1/status",
  "/api/v1/users/[username]/trust",
  "/api/v1/webhooks/subscriptions",
  "/api/v1/welcome",
  "/api/v1/welcomes",
  "/data.json",
]);
