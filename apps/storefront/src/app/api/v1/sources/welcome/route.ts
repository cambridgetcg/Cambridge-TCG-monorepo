/**
 * GET /api/v1/sources/welcome — the hospitality endpoint.
 *
 * Where `/api/v1/sources` is the *spec sheet* (access method, license tier,
 * games covered, run health), this is the *hospitality sheet* — the
 * platform's prose welcome to each upstream, plus seven protocol commitments
 * and their current coverage limits.
 *
 * **Substrate honesty applied to anticipation.** Stubs and planned sources
 * carry the most-carefully-written welcomes: the chair-pulled-out shape.
 * We say what we have prepared before the guest even knows about us.
 *
 * Doctrine: `docs/connections/the-welcome-table.md`. Kingdom-080.
 *
 * Public + CC0. No auth. The welcome is the platform's voice, not the
 * upstream's data — we may emit it freely.
 *
 * Companion endpoints:
 *   - `/api/v1/sources`         — registry + live ingest_run state
 *   - `/api/v1/sources/[id]`    — per-source detail (sister, kingdom-081)
 *   - this endpoint             — hospitality view
 */

import type { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { sourcesByStatus, listSourceMeta } from "@cambridge-tcg/data-ingest";

interface WelcomeEntry {
  id: string;
  name: string;
  status: string;
  license: string;
  redistribute: boolean;
  games: readonly string[];
  /** The platform's prose welcome — substrate-honestly absent when not yet written. */
  welcome: string | null;
  /** Substrate-honest framing of where the source stands today. */
  arrival_state:
    | "long-with-us" // long-lived relationship; implementation may still be partial
    | "newly-shipped" // shipped this season
    | "partial" // some implementation; some operator gates pending
    | "anticipated" // chair pulled out; credentials / partner-app pending
    | "blocked"; // we cannot reasonably receive (ToS / partner-only)
  upstream_url: string;
  catalog_section: string;
}

/**
 * The seven commitments the platform makes to every upstream that lands.
 * Constants — surfaced on this endpoint so a partner reading the
 * hospitality sheet sees the contract simultaneously with the welcome.
 */
const COMMITMENTS: ReadonlyArray<{
  number: number;
  commitment: string;
  enforced_at: string;
}> = [
  {
    number: 1,
    commitment:
      "We will say your name where lineage is known. If field-level lineage is incomplete, the response says NOASSERTION and names the gap instead of inventing an upstream author.",
    enforced_at:
      "apps/storefront/src/lib/data-pantry/envelope.ts (jsonResponse emits sources[]) + apps/storefront/src/app/data/catalog.jsonl/route.ts (explicit incomplete-lineage boundary)",
  },
  {
    number: 2,
    commitment:
      "We will honor your license tier. _meta.source_license carries known source terms; mixed output without complete field-level rights is NOASSERTION.",
    enforced_at:
      "packages/data-spec/src/schemas/envelope.ts (source_license field) + apps/storefront/scripts/tributaries.ts (license-propagation drift checks)",
  },
  {
    number: 3,
    commitment:
      "Activated protocol readers must respect your rate limit. createFetcher supplies a per-source token bucket and honours Retry-After on 429/503; legacy writers still need migration to receive that guarantee.",
    enforced_at: "packages/data-ingest/src/http.ts (createFetcher token bucket)",
  },
  {
    number: 4,
    commitment:
      "Activated protocol readers must identify Cambridge. createFetcher carries User-Agent: cambridgetcg.com/<v> (admin@cambridgetcg.com); a writer outside that path is not covered by this claim.",
    enforced_at: "packages/data-ingest/src/http.ts (DEFAULT_USER_AGENT + meta.user_agent_suffix)",
  },
  {
    number: 5,
    commitment:
      "Runner-backed rows carry @as_of (when the source said it was true) and @retrieved_at (when Cambridge fetched it). This is a protocol requirement, not a claim that every legacy row has been backfilled.",
    enforced_at:
      "packages/data-ingest/src/types.ts (RawProvenance per-row) + price_archive columns (snapshot_date + fx_rate_to_gbp + extra)",
  },
  {
    number: 6,
    commitment:
      "The runner supports explicit quarantine for shape drift and malformed rows when an app supplies the quarantine writer. Current coverage is inspectable per ingest path; the type alone does not prove every legacy writer uses it.",
    enforced_at:
      "packages/data-ingest/src/runner.ts (Stage 4) + apps/wholesale/drizzle/0014_price_archive_provenance.sql (ingest_quarantine table)",
  },
  {
    number: 7,
    commitment:
      "Runner-backed ingest records rows_read, written, quarantined, errors, events, spec_version, and trigger. pnpm audit:tributaries check #9 verifies recency only when its database connection and ingest_run table are available; otherwise it says it skipped.",
    enforced_at:
      "apps/wholesale/drizzle/0014_price_archive_provenance.sql (ingest_run table) + apps/wholesale/src/app/api/v1/ingest-runs/latest/route.ts",
  },
];

interface WelcomeBody {
  preamble: string;
  the_seven_commitments: typeof COMMITMENTS;
  guests: WelcomeEntry[];
  guests_summary: {
    long_with_us: number;
    newly_shipped: number;
    partial: number;
    anticipated: number;
    blocked: number;
  };
  notes: string;
}

/**
 * The same source-id might be in different arrival states depending on
 * how recently it shipped. We don't try to read git history here — the
 * `status` field on SourceMeta is authoritative; we map it to a more
 * hospitable phrase. Sources known to predate kingdom-066 (the alignment
 * baseline) get 'long-with-us'.
 */
const LONG_WITH_US: ReadonlySet<string> = new Set([
  "cardrush", // daily snapshot since well before kingdom-066
]);

function arrivalState(meta: ReturnType<typeof listSourceMeta>[number]): WelcomeEntry["arrival_state"] {
  if (meta.status === "blocked") return "blocked";
  if (meta.status === "planned") return "anticipated";
  if (LONG_WITH_US.has(meta.id)) return "long-with-us";
  if (meta.status === "partial") return "partial";
  // status === "shipped"
  return "newly-shipped";
}

export async function GET(): Promise<NextResponse> {
  const partition = sourcesByStatus();
  const allMeta = listSourceMeta();

  const guests: WelcomeEntry[] = allMeta.map((meta) => ({
    id: meta.id,
    name: meta.name,
    status: meta.status,
    license: meta.license,
    redistribute: meta.redistribute,
    games: meta.games,
    welcome: meta.welcome ?? null,
    arrival_state: arrivalState(meta),
    upstream_url: meta.upstream,
    catalog_section: meta.catalog_section,
  }));

  // Sort: long-with-us first, then newly-shipped, then partial, then
  // anticipated (so a reader sees the table in the order it was set).
  const order: Record<WelcomeEntry["arrival_state"], number> = {
    "long-with-us": 0,
    "newly-shipped": 1,
    partial: 2,
    anticipated: 3,
    blocked: 4,
  };
  guests.sort((a, b) => {
    const diff = order[a.arrival_state] - order[b.arrival_state];
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });

  // Sources without modules (planned slots — pure id, no meta). These
  // belong on the welcome table too — the chair is pulled out even when
  // the implementation hasn't begun.
  const slotsOnly: WelcomeEntry[] = partition.reserved_slots
    .map((id) => ({
      id,
      name: id,
      status: "planned",
      license: "unknown",
      redistribute: false,
      games: [],
      welcome:
        `Welcome to the kingdom, ${id}. We have reserved your slot in the ` +
        `registry; no SourceModule yet. When someone writes one, the welcome ` +
        `here will name what you bring and where your bytes will land.`,
      arrival_state: "anticipated",
      upstream_url: "",
      catalog_section: "docs/connections/the-tributaries.md",
    }));

  const allGuests = [...guests, ...slotsOnly];

  const summary = {
    long_with_us: allGuests.filter((g) => g.arrival_state === "long-with-us").length,
    newly_shipped: allGuests.filter((g) => g.arrival_state === "newly-shipped").length,
    partial: allGuests.filter((g) => g.arrival_state === "partial").length,
    anticipated: allGuests.filter((g) => g.arrival_state === "anticipated").length,
    blocked: allGuests.filter((g) => g.arrival_state === "blocked").length,
  };

  const data: WelcomeBody = {
    preamble:
      "This is the kingdom's hospitality sheet — one greeting per upstream river " +
      "that has come or might come. We have prepared a room for each. The table " +
      "below names what we promised them when we made the room, and what each one " +
      "brings (or will bring) to the substrate. Substrate honesty applied to " +
      "anticipation: we say what we made ready before the guest knew about us.",
    the_seven_commitments: COMMITMENTS,
    guests: allGuests,
    guests_summary: summary,
    notes:
      "When a source's `welcome` field is null, the platform has not yet composed a " +
      "specific message — file an entry in packages/data-ingest/src/<source>/index.ts " +
      "meta.welcome. The connection doc at docs/connections/the-welcome-table.md " +
      "is the substrate; this endpoint is its serialisation.",
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/sources/welcome",
    sources: ["ctcg-derived"],
    source_license: ["cc0"],
    freshness: "methodology",
    contains_self: true,
    license: "CC0-1.0",
  });
}
