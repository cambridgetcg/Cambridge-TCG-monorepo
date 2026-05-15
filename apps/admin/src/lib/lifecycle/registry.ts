/**
 * Admin lifecycle registry — the bookshelf, bound to admin's
 * cross-RDS query functions.
 *
 * Today: every lifecycle log lives on the storefront RDS, so all
 * sixteen slots use `sfQuery` from `@cambridge-tcg/db`. When wholesale
 * gains a user-keyed lifecycle log (e.g. wholesale-side reviews,
 * order events for B2B clients), add slots that use `wsQuery` and
 * include them here.
 *
 * The slot SQL lives in `@cambridge-tcg/lifecycle`'s factories so
 * admin and storefront share one source of truth. This file binds the
 * factories to admin's query functions and exports the resulting
 * registry. See docs/connections/the-scribe.md.
 *
 * ── Why this exists separately from storefront's registry ────────────
 *
 * The CLAUDE.md rule "don't import storefront/wholesale internals from
 * admin" means admin can't `import { REGISTRY } from "@storefront/...".
 * The package extraction lets both apps share the SQL without coupling
 * either to the other's internals.
 */

import { sfQuery } from "@/lib/db";
import { createAllSlots, type LifecycleSlot } from "@cambridge-tcg/lifecycle";

export const REGISTRY: readonly LifecycleSlot[] = createAllSlots(sfQuery);
