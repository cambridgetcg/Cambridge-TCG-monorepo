/**
 * /api/v1/sources — the ingestion-side inspectability surface.
 *
 * Inverse of `/api/v1/status` (which inspects emission). Lists every
 * source registered in `@cambridge-tcg/data-ingest` with its meta —
 * what's shipped, what's planned, what's stubbed, the upstream URL,
 * the access method, the license tier, the freshness budget, the game
 * coverage, the ToS notes. Substrate-honest: declares both what we have
 * and what we don't yet have.
 *
 * **Self-referential.** This endpoint reports on its own registration.
 *
 * Companion to:
 *   - apps/storefront/src/app/api/v1/status/route.ts (emission inspection)
 *   - packages/data-ingest/src/registry.ts (the registry it reads)
 *   - docs/connections/the-pipeline.md §16 (the design)
 *   - docs/connections/the-cardrush-alignment.md §9 (the recursion target this fulfils)
 *
 * Future iteration: when `ingest_run` rows are queryable (post-Phase A
 * migration), this endpoint joins per-source last-known-good structured
 * status. Free-text run notes remain operator-only because they can contain
 * upstream titles, queries, or exception text.
 */

import type { NextResponse } from "next/server";
import { jsonResponse, type FreshnessKey } from "@/lib/data-pantry";
import { sourcesByStatus, listSourceMeta } from "@cambridge-tcg/data-ingest";
import { fetchSourceLastRuns, type SourceRunRow } from "@/lib/wholesale/client";

/**
 * Live last-run block (kingdom-079). Substrate-honest:
 *   - present when wholesale's /api/v1/ingest-runs/latest returned a row
 *     for this source
 *   - { _unavailable: true } when the lookup ran but found no row (never run)
 *   - absent entirely when the Falcon fetch itself failed (the top-level
 *     `_meta.ingest_runs_available` flag declares the failure)
 */
interface LastRunBlock {
  triggered_at: string;
  finished_at: string | null;
  status: string;
  spec_version: string;
  rows_read: number;
  rows_normalized: number;
  rows_written: number;
  rows_quarantined: number;
  errors: number;
  /** Hours since `triggered_at`. Lets a reader judge "stale" without parsing. */
  age_hours: number;
}

interface SourceEntry {
  id: string;
  name: string;
  description: string;
  upstream: string;
  catalog_section: string;
  access: string;
  license: string;
  license_spdx?: string;
  redistribute: boolean;
  freshness: FreshnessKey;
  canonical_effort: string;
  status: string;
  games: readonly string[];
  tos_notes: string;
  user_agent_suffix?: string;
  rate_limit?: { rps: number; burst: number };
  /** Live ingest_run join (kingdom-079). Substrate-honest about absence. */
  last_run?: LastRunBlock | { _unavailable: true; reason: "never_run" };
}

interface SourcesBody {
  protocol: {
    package: string;
    doctrine: string;
    catalog: string;
    audit_command: string;
  };
  counts: {
    shipped: number;
    partial: number;
    planned: number;
    blocked: number;
    registered_total: number;
    planned_slot_total: number;
  };
  /**
   * Substrate-honesty for the live `last_run` block. True when the Falcon
   * fetch to wholesale's /api/v1/ingest-runs/latest returned a usable
   * payload; false when it failed (network / 401 / parse). When false,
   * per-source `last_run` is absent entirely.
   */
  ingest_runs_available: boolean;
  sources: SourceEntry[];
  /** Source ids registered in the SOURCES table but without an implementation yet. */
  planned_slots: string[];
  /** Conventions partners should know. */
  conventions: {
    license_tiers: string;
    access_methods: string;
    freshness_keys: string;
    source_license_propagation: string;
  };
}

function buildLastRun(row: SourceRunRow, now: Date): LastRunBlock {
  const triggered = new Date(row.triggered_at);
  const age_hours = (now.getTime() - triggered.getTime()) / (1000 * 60 * 60);
  return {
    triggered_at: row.triggered_at,
    finished_at: row.finished_at,
    status: row.status,
    spec_version: row.spec_version,
    rows_read: row.rows_read,
    rows_normalized: row.rows_normalized,
    rows_written: row.rows_written,
    rows_quarantined: row.rows_quarantined,
    errors: row.errors,
    age_hours: Math.round(age_hours * 10) / 10,
  };
}

export async function GET(): Promise<NextResponse> {
  const partition = sourcesByStatus();
  const allMeta = listSourceMeta();

  // Live last-run state (kingdom-079). Falcon returns null on failure,
  // [] when no runs exist yet — distinct facts. The body's
  // `ingest_runs_available` flag carries the distinction so a downstream
  // reader can tell "couldn't query" from "queried, got nothing".
  const lastRuns = await fetchSourceLastRuns();
  const ingest_runs_available = lastRuns !== null;
  const lastRunByEntry = new Map((lastRuns ?? []).map((r) => [r.source_id, r]));
  const now = new Date();

  const sources: SourceEntry[] = allMeta.map((meta) => {
    const runRow = lastRunByEntry.get(meta.id);
    const last_run: SourceEntry["last_run"] = ingest_runs_available
      ? runRow
        ? buildLastRun(runRow, now)
        : { _unavailable: true as const, reason: "never_run" as const }
      : undefined;
    return {
      id: meta.id,
      name: meta.name,
      description: meta.description,
      upstream: meta.upstream,
      catalog_section: meta.catalog_section,
      access: meta.access,
      license: meta.license,
      ...(meta.license_spdx ? { license_spdx: meta.license_spdx } : {}),
      redistribute: meta.redistribute,
      freshness: meta.freshness,
      canonical_effort: meta.canonical_effort,
      status: meta.status,
      games: meta.games,
      tos_notes: meta.tos_notes,
      ...(meta.user_agent_suffix ? { user_agent_suffix: meta.user_agent_suffix } : {}),
      ...(meta.rate_limit ? { rate_limit: meta.rate_limit } : {}),
      ...(last_run !== undefined ? { last_run } : {}),
    };
  });

  const data: SourcesBody = {
    protocol: {
      package: "@cambridge-tcg/data-ingest",
      doctrine: "docs/methodology/source-protocol.md",
      catalog: "docs/connections/the-tributaries.md",
      audit_command: "pnpm audit:tributaries",
    },
    counts: {
      shipped: partition.shipped.length,
      partial: partition.partial.length,
      planned: partition.planned.length,
      blocked: partition.blocked.length,
      registered_total: allMeta.length,
      planned_slot_total: partition.reserved_slots.length,
    },
    ingest_runs_available,
    sources,
    planned_slots: partition.reserved_slots,
    conventions: {
      license_tiers:
        "cc0 / cc-by / cc-by-nc / cc-by-sa / mit / partner-redistributable / internal-only / proprietary. `redistribute: true` is only valid with cc0/cc-by/cc-by-sa/mit; the audit (pnpm audit:tributaries check 7) enforces this.",
      access_methods:
        "public-api / public-file / app-token / oauth2 / oauth1 / scrape / partner / paid-feed / blocked.",
      freshness_keys:
        "catalog (24h) / price_current (5min) / price_historical (immutable) / market_signal (1min) / status (30s) / methodology (24h) / identity (1h) / adopters (24h). See packages/data-spec/src/freshness.ts.",
      source_license_propagation:
        "When a response is composed from multiple sources, _meta.sources lists them in contribution order and _meta.source_license (optional, when declared) carries each one's redistribution tier. Absence is substrate-honest; presence is the platform's declaration.",
    },
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/sources",
    sources: ingest_runs_available
      ? ["ctcg-derived", "wholesale-rds.ingest_run"]
      : ["ctcg-derived"],
    source_license: ingest_runs_available
      ? ["proprietary", "internal-only"]
      : ["proprietary"],
    license: "NOASSERTION",
    freshness: "status",
    contains_self: true,
    does_not_include: [
      "Ingest-run notes and trigger labels are operator-only and are not returned here.",
      "Quarantine reasons, rows, payload keys, and payload bytes are not returned here.",
    ],
  });
}
