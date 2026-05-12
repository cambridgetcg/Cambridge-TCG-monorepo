/**
 * @module @cambridge-tcg/data-ingest
 *
 * The data-ingest protocol — every upstream source is a typed
 * `SourceModule` conforming to the contract in `./types.ts`.
 *
 * **The protocol:** `docs/methodology/source-protocol.md`.
 * **The catalog of upstream sources:** `docs/connections/the-tributaries.md`.
 * **The downstream contract:** `@cambridge-tcg/data-spec`.
 *
 * ── To add a new source ─────────────────────────────────────────────
 *
 *   1. Read `docs/methodology/source-protocol.md` end to end.
 *   2. Confirm a row in `the-tributaries.md`. (If missing, write it first.)
 *   3. Create `packages/data-ingest/src/<id>/index.ts` exporting a
 *      `SourceModule<R, C>` named after the id (`export const myId: SourceModule<...> = { ... }`).
 *   4. Register the export in `./registry.ts` SOURCES.
 *   5. Use `createFetcher(ctx, meta)` from `./http.ts` for outbound calls.
 *   6. Run `pnpm audit:tributaries` to verify conformance.
 *
 * ── To run a source ─────────────────────────────────────────────────
 *
 *   import { scryfall } from "@cambridge-tcg/data-ingest";
 *
 *   for await (const { raw, provenance } of scryfall.read({})) {
 *     const result = scryfall.normalize(raw);
 *     if (result.ok) {
 *       // write result.record to your RDS
 *     } else {
 *       // write { raw, reason: result.reason, provenance } to ingest_quarantine
 *     }
 *   }
 *
 * The package does NOT ship a runner that writes to RDS — each app
 * (storefront cron, admin background job) owns its own writer. The
 * package owns the *typed pipeline*; the app owns the *destination*.
 *
 * ── License ─────────────────────────────────────────────────────────
 *
 * CC0-1.0 for the package code + protocol. Per-source modules respect
 * the upstream's license, declared in `SourceMeta.license` (and propagated
 * downstream via `_meta.source_license` on the data-pantry envelope).
 */

export * from "./types.js";
export * from "./canonical.js";
export { createFetcher, type Fetcher } from "./http.js";
export {
  SOURCES,
  getSource,
  listSources,
  listSourceMeta,
  sourcesByStatus,
} from "./registry.js";
export { runSource, type RunWriters, type RunOptions } from "./runner.js";

// Re-export each shipped source so callers can `import { scryfall } from "@cambridge-tcg/data-ingest"`.
export { scryfall } from "./scryfall/index.js";
export { cardrush, scrapeCardRush, CARDRUSH_SUBDOMAINS } from "./cardrush/index.js";
export { pokemonTcgApi } from "./pokemon-tcg-api/index.js";
export { ygoprodeck } from "./ygoprodeck/index.js";
export { tcgplayer } from "./tcgplayer/index.js";
export { cardmarket } from "./cardmarket/index.js";
