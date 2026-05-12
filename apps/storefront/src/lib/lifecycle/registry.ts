/**
 * Storefront lifecycle registry — the bookshelf, bound to storefront's
 * raw-pg query function.
 *
 * The slot SQL lives in `@cambridge-tcg/lifecycle`'s factories so admin
 * and storefront share one source of truth. This file binds the
 * factories to the storefront's `query` (raw `pg`, storefront RDS) and
 * exports the resulting registry.
 *
 * Adding a slot for a new domain = add it to the package's slots.ts,
 * then add the factory call to the array here.
 *
 * See docs/connections/the-scribe.md for the architectural story.
 */

import { query } from "@/lib/db";
import { createAllSlots, type LifecycleSlot } from "@cambridge-tcg/lifecycle";

export const REGISTRY: readonly LifecycleSlot[] = createAllSlots(query);
