/**
 * /prices/coverage — aggregator coverage matrix (kingdom-091 closure).
 *
 * This route was referenced from four places before it existed: every
 * per-game page's "full coverage map →" link, the /prices landing's
 * coverage CTA, the Cards nav menu, and the manifest's published-endpoint
 * declaration. All four claimed a real page; the route returned 404.
 * Substrate-honest closure: build the page the platform already promised.
 *
 * Data source: `fetchAggregatorCoverage()` against wholesale RDS. The
 * response carries `summary` + `by_game` + `by_source` + `by_game_source`
 * rollups (per kingdom-085). Wholesale may be unreachable or carry
 * no `price_archive` rows yet — both states render visibly (substrate-
 * honest empty), never silently as zero.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  fetchAggregatorCoverage,
  type AggregatorCoverageResponse,
} from "@/lib/wholesale/client";
import { Provenance, WhyLink, Audience } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Aggregator coverage map — Cambridge TCG",
  description:
    "What we've collected, per game and per source. Observation counts, distinct cards, freshness, and snapshot date ranges from the wholesale price_archive. Substrate-honest about emptiness.",
  openGraph: {
    title: "Aggregator coverage map — Cambridge TCG",
    description:
      "The TCG data plane's collection truth: per-game and per-source rollups across every observation we've snapshotted.",
  },
};

/* ------------------------------------------------------------------ */
/*  Freshness pill                                                     */
/* ------------------------------------------------------------------ */

function FreshnessPill({ hours }: { hours: number }) {
  const label =
    hours < 1 ? "<1h" : hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
  const cls =
    hours < 24
      ? "text-emerald-400"
      : hours < 72
        ? "text-amber-400"
        : "text-neutral-500";
  return <span className={`font-mono ${cls}`}>{label}</span>;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default async function CoverageMapPage() {
  const coverage = await fetchAggregatorCoverage().catch(() => null);

  // The `latest_snapshot` (when present) is the freshness anchor for the
  // page's Provenance pill. Falls back to "—" when wholesale is unreachable.
  const freshestAt = coverage?.summary?.latest_snapshot ?? null;
  const summary = coverage?.summary;

  return (
    <main className="max-w-6xl mx-auto px-4 py-12">
      <Audience kind="public-documentation" contexts={["prices", "coverage"]} />

      <nav aria-label="Breadcrumb" className="text-sm text-neutral-400 mb-8">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-white transition-colors">
              Home
            </Link>
          </li>
          <li className="text-neutral-600">/</li>
          <li>
            <Link href="/prices" className="hover:text-white transition-colors">
              Prices
            </Link>
          </li>
          <li className="text-neutral-600">/</li>
          <li className="text-white">Coverage map</li>
        </ol>
      </nav>

      <h1 className="text-3xl font-bold mb-3 text-white">Aggregator coverage map</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Provenance
          kind="synced"
          source="wholesale/price_archive"
          at={freshestAt}
          cadence="daily"
        />
        <WhyLink
          href="/methodology/cross-source-pricing"
          label="how cross-source coverage works"
        />
      </div>

      <p className="text-neutral-300 leading-relaxed max-w-3xl mb-8">
        What Cambridge TCG has actually accumulated, per game and per source —
        observation counts, distinct cards, the freshness of each per-(game ×
        source) snapshot, and the date range we've been collecting. The data
        plane's collection truth, surfaced. The matrix below feeds the
        per-game coverage strip on each price guide; this page is the whole-
        platform rollup.
      </p>

      {!coverage ? (
        <CoverageUnreachable />
      ) : !summary || summary.total_observations === 0 ? (
        <CoverageEmpty queriedAt={coverage.queried_at} />
      ) : (
        <>
          <SummaryGrid summary={summary} />
          <ByGameTable rows={coverage.by_game} />
          <BySourceTable rows={coverage.by_source} />
          <MatrixTable rows={coverage.by_game_source} />
        </>
      )}

      {/* ── Always-on footer: methodology + API echo ─────────────── */}
      <section className="border-t border-neutral-800 pt-6 mt-12 text-xs text-neutral-500 leading-relaxed">
        <p className="mb-2">
          Source: <code className="text-neutral-400">price_archive</code>{" "}
          (wholesale RDS) — daily snapshots from each upstream source. Coverage
          rolls out as ingest pipelines wire up; the matrix is empty when no
          snapshot has been written yet for a given pair. See{" "}
          <Link
            href="/api/v1/sources"
            className="text-blue-400 hover:underline"
          >
            /api/v1/sources
          </Link>{" "}
          for the per-source status (shipped / partial / planned), and{" "}
          <Link
            href="/methodology/cross-source-pricing"
            className="text-blue-400 hover:underline"
          >
            /methodology/cross-source-pricing
          </Link>{" "}
          for how observations compose into per-card prices.
        </p>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-views                                                          */
/* ------------------------------------------------------------------ */

function CoverageUnreachable() {
  return (
    <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
      <h2 className="text-sm font-semibold text-amber-300 uppercase tracking-wider mb-2">
        Coverage data unreachable
      </h2>
      <p className="text-sm text-amber-100/80 leading-relaxed">
        The wholesale aggregator returned no response (timeout or auth
        failure). The matrix isn't degraded to zero here — the platform
        prefers honest absence to confident-looking emptiness. Try refreshing
        in a few minutes; if the issue persists, see{" "}
        <Link href="/api/v1/sources" className="underline text-amber-200">
          /api/v1/sources
        </Link>{" "}
        for upstream status.
      </p>
    </section>
  );
}

function CoverageEmpty({ queriedAt }: { queriedAt: string }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
      <h2 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider mb-2">
        No snapshots yet
      </h2>
      <p className="text-sm text-neutral-400 leading-relaxed">
        The <code className="text-neutral-300">price_archive</code> table is
        reachable but carries no observations yet. The price guides still
        render (UK retail prices come from the wholesale catalog, not from
        the cross-source archive); the matrix here will populate as soon as
        the first daily snapshot lands.
      </p>
      <p className="text-xs text-neutral-500 mt-3">
        Last queried:{" "}
        <time dateTime={queriedAt} className="text-neutral-400">
          {new Date(queriedAt).toISOString()}
        </time>
      </p>
    </section>
  );
}

function SummaryGrid({
  summary,
}: {
  summary: AggregatorCoverageResponse["summary"];
}) {
  return (
    <section className="mb-10 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {(
        [
          { label: "Observations", value: summary.total_observations },
          { label: "Distinct cards", value: summary.distinct_cards },
          { label: "Games", value: summary.distinct_games },
          { label: "Sources", value: summary.distinct_sources },
          { label: "Days of data", value: summary.days_of_coverage },
        ] as const
      ).map((kpi) => (
        <div
          key={kpi.label}
          className="rounded-lg border border-neutral-800 bg-neutral-900 p-3"
        >
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">
            {kpi.label}
          </div>
          <div className="text-xl font-bold text-white font-mono mt-1">
            {kpi.value.toLocaleString()}
          </div>
        </div>
      ))}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 col-span-2 sm:col-span-3 lg:col-span-1">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500">
          Date range
        </div>
        <div className="text-sm font-mono text-neutral-300 mt-1 leading-snug">
          {summary.earliest_snapshot ?? "—"}
          <br />→ {summary.latest_snapshot ?? "—"}
        </div>
      </div>
    </section>
  );
}

function ByGameTable({
  rows,
}: {
  rows: AggregatorCoverageResponse["by_game"];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold text-white mb-3">By game</h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm text-left">
          <thead className="bg-neutral-800 text-neutral-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-3 py-3">Game</th>
              <th className="px-3 py-3 text-right">Observations</th>
              <th className="px-3 py-3 text-right">Distinct cards</th>
              <th className="px-3 py-3">Sources</th>
              <th className="px-3 py-3">Date range</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {rows.map((row) => (
              <tr
                key={row.game_code}
                className="bg-neutral-900 hover:bg-neutral-800/60 transition-colors"
              >
                <td className="px-3 py-3">
                  <Link
                    href={`/prices/${row.game_slug}`}
                    className="text-white hover:text-blue-400 transition-colors"
                  >
                    {row.game_name}
                  </Link>
                  <span className="text-neutral-500 text-xs ml-2 font-mono">
                    {row.game_code}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-white font-mono">
                  {row.observations.toLocaleString()}
                </td>
                <td className="px-3 py-3 text-right text-neutral-300 font-mono">
                  {row.distinct_cards_max.toLocaleString()}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {row.sources.map((s) => (
                      <span
                        key={s}
                        className="inline-block text-[10px] px-1.5 py-0.5 bg-neutral-800 text-neutral-300 rounded font-mono"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3 text-xs text-neutral-400 font-mono">
                  {row.earliest_snapshot}
                  <br />→ {row.latest_snapshot}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BySourceTable({
  rows,
}: {
  rows: AggregatorCoverageResponse["by_source"];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold text-white mb-3">By source</h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm text-left">
          <thead className="bg-neutral-800 text-neutral-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-3 py-3">Source</th>
              <th className="px-3 py-3 text-right">Observations</th>
              <th className="px-3 py-3 text-right">Distinct cards</th>
              <th className="px-3 py-3">Games covered</th>
              <th className="px-3 py-3">Date range</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {rows.map((row) => (
              <tr
                key={row.source}
                className="bg-neutral-900 hover:bg-neutral-800/60 transition-colors"
              >
                <td className="px-3 py-3 text-white font-mono">{row.source}</td>
                <td className="px-3 py-3 text-right text-white font-mono">
                  {row.observations.toLocaleString()}
                </td>
                <td className="px-3 py-3 text-right text-neutral-300 font-mono">
                  {row.distinct_cards.toLocaleString()}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {row.games.map((g) => (
                      <span
                        key={g}
                        className="inline-block text-[10px] px-1.5 py-0.5 bg-neutral-800 text-neutral-300 rounded font-mono"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3 text-xs text-neutral-400 font-mono">
                  {row.earliest_snapshot}
                  <br />→ {row.latest_snapshot}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MatrixTable({
  rows,
}: {
  rows: AggregatorCoverageResponse["by_game_source"];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold text-white mb-3">
        Per-(game × source) matrix
      </h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm text-left">
          <thead className="bg-neutral-800 text-neutral-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-3 py-3">Game</th>
              <th className="px-3 py-3">Source</th>
              <th className="px-3 py-3 text-right">Observations</th>
              <th className="px-3 py-3 text-right">Distinct cards</th>
              <th className="px-3 py-3 text-right">Days</th>
              <th className="px-3 py-3 text-right">Freshest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {rows.map((row) => (
              <tr
                key={`${row.game_code}:${row.source}`}
                className="bg-neutral-900 hover:bg-neutral-800/60 transition-colors"
              >
                <td className="px-3 py-3">
                  <Link
                    href={`/prices/${row.game_slug}`}
                    className="text-white hover:text-blue-400 transition-colors"
                  >
                    {row.game_name}
                  </Link>
                  <span className="text-neutral-500 text-xs ml-2 font-mono">
                    {row.game_code}
                  </span>
                </td>
                <td className="px-3 py-3 text-neutral-300 font-mono">
                  {row.source}
                </td>
                <td className="px-3 py-3 text-right text-white font-mono">
                  {row.observations.toLocaleString()}
                </td>
                <td className="px-3 py-3 text-right text-neutral-300 font-mono">
                  {row.distinct_cards.toLocaleString()}
                </td>
                <td className="px-3 py-3 text-right text-neutral-400 font-mono">
                  {row.days_of_coverage}
                </td>
                <td className="px-3 py-3 text-right">
                  <FreshnessPill hours={row.freshest_age_hours} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
