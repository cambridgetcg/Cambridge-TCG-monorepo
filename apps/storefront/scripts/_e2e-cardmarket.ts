#!/usr/bin/env tsx
/**
 * RETIRED — Cardmarket proxy/download proof of concept.
 *
 * The current source review is blocked/no-fetch. A proxy, Web Unlocker,
 * historical credential or downloadable-looking URL does not establish
 * permission to access, store, display or redistribute Cardmarket data.
 * Reopening starts with written Cardmarket approval and a reviewed rights
 * record in `packages/data-ingest/src/cardmarket/index.ts`.
 *
 * This file intentionally imports no HTTP client and performs no request.
 */

console.error(
  "RETIRED: Cardmarket is blocked/no-fetch until written approval and exact data/image/storage/display/redistribution terms are recorded.",
);
process.exitCode = 1;
