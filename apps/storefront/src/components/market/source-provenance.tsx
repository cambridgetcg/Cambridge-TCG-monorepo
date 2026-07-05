/**
 * Server-only provenance nodes for the catalog's three substrates.
 *
 * <Provenance> is an async server component (it reads the lang-mode
 * cookie), so client surfaces can't render it directly. The /market and
 * /market/list server pages call this and hand the pre-rendered nodes to
 * their client components, which pick the right one off the response's
 * `source` field — including after client-side refetches, where the
 * source can flip between substrates.
 *
 * Do NOT import this from a "use client" file.
 */

import type { ReactNode } from "react";
import { Provenance } from "@/lib/ui";
import type { CatalogSource } from "./catalog";

export function catalogSourceBadges(): Record<CatalogSource, ReactNode> {
  return {
    // Live HTTP read of the wholesale pricing API, queried this request.
    "wholesale-api": <Provenance kind="live" />,
    // Direct read of the wholesale Postgres — prices there are synced
    // from upstream on a daily cadence, so this must not claim "live".
    "wholesale-db": <Provenance kind="synced" source="wholesale db" cadence="daily" />,
    unavailable: <Provenance kind="unavailable" />,
  };
}
