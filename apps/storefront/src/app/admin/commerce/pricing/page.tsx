/**
 * Pricing — Manager page.
 *
 * Second pilot using the @/lib/admin/ui primitives. Wholesale-side data (cards
 * table). Demonstrates the same pattern with a different DB and a
 * row-level inline edit action.
 *
 * Tables: cards (wholesale).
 *
 * Out of scope for this pilot:
 *   - S3 price-feed sync — left as a punch-list item; the legacy
 *     wholesale page calls /api/sync which lives in apps/wholesale.
 *     Wiring it via Server Action requires moving the S3-fetch logic
 *     into a shared package or calling the wholesale API.
 *   - CSV upload — same constraint as the sync.
 */

import { wsQuery } from "@/lib/admin/db";
import { fmtGBP, fmtJPY, fmtDateTime, fmtRelative } from "@/lib/format";
import {
  PageHeader, FilterPills, SearchForm, DataTable, Pagination,
  KpiGrid, KpiCard, SectionHeading, ExternalLink, ActionBanner, Provenance,
  WhyLink,
  type Column,
} from "@/lib/admin/ui";
import { CARDRUSH_SUBDOMAINS } from "@cambridge-tcg/data-ingest";
import { PriceCell } from "./_components";

export const metadata = { title: "Pricing" };

const PAGE_SIZE = 50;
const WHOLESALE_ADMIN = process.env.WHOLESALE_URL ?? "https://wholesale.cambridgetcg.com";

interface CardRow {
  id: number;
  sku: string;
  card_number: string;
  name: string | null;
  set_code: string | null;
  cardrush_jpy: number | null;
  base_gbp: string | null;
  price: string | null;
  last_synced_at: string | null;
  category: string | null;
}

type PriceFilter = "" | "available" | "missing" | "stale";

const FILTER_LABEL: Record<PriceFilter, string> = {
  "":          "All",
  available:   "Has price",
  missing:     "No JPY",
  stale:       "Stale (>7d)",
};

// Note: a "Manual override" filter previously lived here, defined as
// ABS(price - base_gbp) > 0.005. Removed 2026-05-05: the wholesale
// pricing engine ALWAYS produces price ≠ base_gbp (margin + flat fee +
// VAT, see apps/wholesale/src/lib/pricing.ts), so the filter matched
// 100% of the catalog and carried no signal. There is no manual_override
// column on `cards` — see kingdom-NNN to add one and reintroduce a real
// filter.
function whereForFilter(filter: PriceFilter): string {
  switch (filter) {
    case "available":  return "cardrush_jpy IS NOT NULL AND cardrush_jpy > 0";
    case "missing":    return "(cardrush_jpy IS NULL OR cardrush_jpy <= 0)";
    case "stale":      return "(last_synced_at IS NULL OR last_synced_at < NOW() - INTERVAL '7 days')";
    default:           return "";
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const filter = ((sp.filter ?? "") as PriceFilter);
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (q) {
    where.push(`(sku ILIKE $${i} OR name ILIKE $${i} OR card_number ILIKE $${i})`);
    params.push(`%${q}%`);
    i += 1;
  }
  const filterClause = whereForFilter(filter);
  if (filterClause) where.push(filterClause);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rowsResult, totalResult, kpiResult, gameResult, recentChangesResult, ingestRunResult] = await Promise.all([
    wsQuery<CardRow>(
      `SELECT id, sku, card_number, name, set_code,
              cardrush_jpy, base_gbp::text, price::text,
              last_synced_at, category
         FROM cards
         ${whereSql}
         ORDER BY last_synced_at DESC NULLS LAST, id DESC
         LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      params,
    ),
    wsQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM cards ${whereSql}`,
      params,
    ),
    wsQuery<{
      total: string; missing: string; stale: string; last_sync: string | null;
    }>(
      `SELECT
         COUNT(*)::text                                                           AS total,
         COUNT(*) FILTER (WHERE cardrush_jpy IS NULL OR cardrush_jpy <= 0)::text  AS missing,
         COUNT(*) FILTER (
           WHERE last_synced_at IS NULL OR last_synced_at < NOW() - INTERVAL '7 days'
         )::text                                                                  AS stale,
         MAX(last_synced_at)::text                                                AS last_sync
       FROM cards`,
      [],
    ),
    // Per-game sync coverage — surfaces silent scrape failures (e.g. the
    // Pokémon / Dragon Ball domains failing while One Piece succeeds).
    wsQuery<{
      id: number; name: string | null; code: string | null; with_url: string; fresh_7d: string;
    }>(
      `SELECT g.id, g.name, g.code,
              COUNT(c.*) FILTER (WHERE c.cardrush_url IS NOT NULL)::text AS with_url,
              COUNT(c.*) FILTER (
                WHERE c.last_synced_at >= NOW() - INTERVAL '7 days'
              )::text AS fresh_7d
         FROM games g
         LEFT JOIN cards c ON c.game_id = g.id
         WHERE g.active = true
         GROUP BY g.id, g.name, g.code
        HAVING COUNT(c.*) FILTER (WHERE c.cardrush_url IS NOT NULL) > 0
         ORDER BY COUNT(c.*) FILTER (WHERE c.cardrush_url IS NOT NULL) DESC`,
      [],
    ),
    // Recent price changes — Phase 2.5 of kingdom-049. Reads the lifecycle
    // log added in Phase 2 (drizzle/0009_card_price_change_log.sql). Joined
    // with cards for the SKU label; left-joined since the FK cascade
    // means an orphaned log row shouldn't happen but we degrade visibly.
    // See docs/connections/the-pricing-arrow.md (S17) Act 4.
    // Use to_regclass to no-op gracefully on databases where the migration
    // hasn't been applied yet — log table simply doesn't exist yet.
    wsQuery<{
      sku: string | null;
      action: string;
      source: string | null;
      actor_label: string | null;
      before_value: { price?: number; baseGbp?: number } | null;
      after_value: { price?: number; baseGbp?: number } | null;
      created_at: string;
    }>(
      `SELECT c.sku,
              log.action,
              log.source,
              log.actor_label,
              log.before_value,
              log.after_value,
              log.created_at::text
         FROM card_price_change_log log
         LEFT JOIN cards c ON c.id = log.card_id
        WHERE to_regclass('card_price_change_log') IS NOT NULL
        ORDER BY log.created_at DESC
        LIMIT 20`,
      [],
    ).catch(() => ({ rows: [] as Array<{
      sku: string | null;
      action: string;
      source: string | null;
      actor_label: string | null;
      before_value: { price?: number; baseGbp?: number } | null;
      after_value: { price?: number; baseGbp?: number } | null;
      created_at: string;
    }> })),
    // Latest cardrush ingest run — the scrape-side truth (kingdom-039
    // step 3). Complements cards.last_synced_at: that column says "how
    // fresh is the DB", this row says "what did the last scrape attempt
    // and why did its failures fail". events JSONB carries the read()
    // loop's 'done' event with per_game buckets. Degrades to no row when
    // the table is absent (dev DBs) — absence renders as unavailable,
    // never as 0%.
    wsQuery<{
      id: number;
      status: string;
      triggered_at: string;
      finished_at: string | null;
      rows_read: number | null;
      rows_written: number | null;
      rows_quarantined: number | null;
      errors: number | null;
      notes: string | null;
      events: unknown;
    }>(
      `SELECT id, status, triggered_at::text, finished_at::text,
              rows_read, rows_written, rows_quarantined, errors, notes, events
         FROM ingest_run
        WHERE source_id = 'cardrush'
        ORDER BY triggered_at DESC
        LIMIT 1`,
      [],
    ).catch(() => ({ rows: [] as Array<{
      id: number;
      status: string;
      triggered_at: string;
      finished_at: string | null;
      rows_read: number | null;
      rows_written: number | null;
      rows_quarantined: number | null;
      errors: number | null;
      notes: string | null;
      events: unknown;
    }> })),
  ]);

  const total = parseInt(totalResult.rows[0]?.count ?? "0", 10);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const kpi = kpiResult.rows[0]!;

  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    const newQ = overrides.q !== undefined ? overrides.q : q;
    if (newQ) next.set("q", newQ);
    const newFilter = overrides.filter !== undefined ? overrides.filter : filter;
    if (newFilter) next.set("filter", newFilter);
    const newPage = overrides.page ?? String(page);
    if (newPage !== "1") next.set("page", newPage);
    const qs = next.toString();
    return `/admin/commerce/pricing${qs ? `?${qs}` : ""}`;
  };

  const columns: Column<CardRow>[] = [
    {
      key: "card",
      header: "Card",
      render: (r) => (
        <div className="min-w-0">
          <p className="text-white font-medium line-clamp-1 max-w-[280px]">
            {r.name ?? r.sku}
          </p>
          <p className="text-xs text-neutral-500 font-mono">{r.sku}</p>
        </div>
      ),
    },
    {
      key: "set",
      header: "Set",
      hideOnMobile: true,
      render: (r) => (
        <span className="text-neutral-400 text-xs uppercase">{r.set_code ?? "—"}</span>
      ),
    },
    {
      key: "jpy",
      header: "JPY (CardRush)",
      align: "right",
      cellClass: "font-mono text-neutral-400 text-xs",
      render: (r) => (r.cardrush_jpy && r.cardrush_jpy > 0 ? fmtJPY(r.cardrush_jpy) : "—"),
    },
    {
      key: "base",
      header: "Base £",
      align: "right",
      hideOnMobile: true,
      cellClass: "font-mono text-neutral-400 text-xs",
      render: (r) => (r.base_gbp ? fmtGBP(r.base_gbp) : "—"),
    },
    {
      key: "price",
      header: "Price £",
      align: "right",
      render: (r) => (
        <PriceCell
          cardId={r.id}
          sku={r.sku}
          price={r.price ? parseFloat(r.price) : null}
          base={r.base_gbp ? parseFloat(r.base_gbp) : null}
        />
      ),
    },
    {
      key: "synced",
      header: "Last Sync",
      align: "right",
      hideOnMobile: true,
      cellClass: "text-xs text-neutral-500 whitespace-nowrap",
      render: (r) => (r.last_synced_at ? fmtRelative(r.last_synced_at) : "never"),
    },
  ];

  const filterPills = (["", "available", "missing", "stale"] as PriceFilter[]).map((f) => ({
    value: f,
    label: FILTER_LABEL[f],
    count:
      f === ""          ? kpi.total
        : f === "missing"   ? kpi.missing
        : f === "stale"     ? kpi.stale
        : undefined,
    href: buildHref({ filter: f, page: "1" }),
  }));

  // ── Latest scrape run, parsed (kingdom-039 step 3) ──────────────────
  // Success rate must come from the per-game buckets / rows_written, NOT
  // from ingest_run.status: the runner counts only writer exceptions as
  // 'errors', so a run where every scrape failed can still be 'done'.
  interface PerGameRunBucket {
    attempted: number;
    succeeded: number;
    failed: number;
    failure_reasons: Record<string, number>;
  }
  const latestRun = ingestRunResult.rows[0] ?? null;
  const runPerGame: Record<string, PerGameRunBucket> = (() => {
    if (!latestRun?.events || !Array.isArray(latestRun.events)) return {};
    for (let i = latestRun.events.length - 1; i >= 0; i -= 1) {
      const e = latestRun.events[i] as {
        kind?: string;
        detail?: { per_game?: Record<string, PerGameRunBucket> };
      };
      if (e?.kind === "done" && e.detail?.per_game) return e.detail.per_game;
    }
    return {};
  })();
  const runProxySkipped = latestRun?.notes?.includes("proxy_skipped") ?? false;
  // Games only reachable through the Bright Data unlocker (today: pkm).
  const unlockerGames = new Set(
    Object.values(CARDRUSH_SUBDOMAINS)
      .filter((entry) => entry.access === "bright-data-unlocker")
      .map((entry) => entry.game as string),
  );

  // Per-game coverage — figure out the urgency for each game.
  // Third state first (mission acceptance #4): a proxy-gated game with no
  // configured proxy is a NAMED gap (warning + label), not silent
  // breakage. Otherwise: 0% fresh = critical, <50% = warning, ≥50% = ok.
  const gameCoverage = gameResult.rows.map((g) => {
    const withUrl = parseInt(g.with_url, 10);
    const fresh = parseInt(g.fresh_7d, 10);
    const pct = withUrl > 0 ? Math.round((100 * fresh) / withUrl) : 0;
    const code = g.code ?? "";
    const run = runPerGame[code];
    const proxyBlocked = runProxySkipped && unlockerGames.has(code) && !run;
    const urgency: "critical" | "warning" | "ok" = proxyBlocked
      ? "warning"
      : withUrl === 0 || fresh === 0
        ? "critical"
        : pct < 50
          ? "warning"
          : "ok";
    const topFailure = run && run.failed > 0
      ? Object.entries(run.failure_reasons).sort((a, b) => b[1] - a[1])[0]?.[0]
      : null;
    const runSub = proxyBlocked
      ? "scrape paused — Bright Data proxy not configured"
      : run
        ? `last run: ${run.succeeded}/${run.attempted} ok${topFailure ? ` · top failure: ${topFailure}` : ""}`
        : latestRun
          ? "not in last chunk (stalest-first rotation)"
          : null;
    return {
      id: g.id,
      name: g.name ?? `Game ${g.id}`,
      withUrl,
      fresh,
      pct,
      urgency,
      runSub,
    };
  });
  const anyBroken = gameCoverage.some((g) => g.urgency === "critical");

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title="Pricing"
        provenance={
          <>
            <Provenance
              kind="synced"
              source="CardRush"
              at={kpi.last_sync}
              cadence="daily"
            />
            <WhyLink
              href="https://cambridgetcg.com/methodology/pricing"
              tooltip="How is the price computed? (margin, fee, VAT)"
            />
          </>
        }
        description={<>{parseInt(kpi.total, 10).toLocaleString()} cards in catalog.</>}
        action={
          <ExternalLink href={`${WHOLESALE_ADMIN}/admin/prices`} variant="primary">
            Open legacy
          </ExternalLink>
        }
      />

      <KpiGrid cols={3}>
        <KpiCard label="Total cards" value={parseInt(kpi.total, 10).toLocaleString()} urgency="neutral" />
        <KpiCard
          label="No JPY price"
          value={parseInt(kpi.missing, 10).toLocaleString()}
          urgency={parseInt(kpi.missing, 10) > 0 ? "warning" : "ok"}
          sub="needs CardRush mapping"
          href={buildHref({ filter: "missing", page: "1" })}
        />
        <KpiCard
          label="Stale (>7d)"
          value={parseInt(kpi.stale, 10).toLocaleString()}
          urgency={parseInt(kpi.stale, 10) > 0 ? "warning" : "ok"}
          sub="needs sync"
          href={buildHref({ filter: "stale", page: "1" })}
        />
      </KpiGrid>

      {anyBroken && (
        <ActionBanner tone="critical" title="Price scrape is failing for one or more games">
          Cards with a CardRush URL exist but ZERO have been refreshed in the last 7 days
          for at least one active game. The chunked ingest at{" "}
          <code className="text-xs">apps/wholesale/src/app/api/cron/ingest/cardrush</code>{" "}
          runs every 2 hours; check the latest run line below and the{" "}
          <code className="text-xs">ingest_run</code> notes for the named failure reasons.
        </ActionBanner>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline gap-3 flex-wrap">
          <SectionHeading count={gameCoverage.length}>Sync coverage by game</SectionHeading>
          <Provenance
            kind="synced"
            source="CardRush"
            at={kpi.last_sync}
            cadence="2-hourly"
          />
        </div>
        <KpiGrid cols={(gameCoverage.length === 1 ? 2 : gameCoverage.length === 2 ? 2 : gameCoverage.length >= 4 ? 4 : 3) as 2 | 3 | 4}>
          {gameCoverage.map((g) => (
            <KpiCard
              key={g.id}
              label={g.name}
              value={`${g.fresh.toLocaleString()} / ${g.withUrl.toLocaleString()}`}
              urgency={g.urgency}
              sub={g.runSub ? `${g.pct}% fresh in 7d · ${g.runSub}` : `${g.pct}% fresh in 7d`}
            />
          ))}
        </KpiGrid>
        {/* Run-derived signal (kingdom-039 step 3): what the last scrape
            attempted, distinct from DB-side freshness. Absence is data —
            no run row means "never run", not 0%. */}
        {latestRun ? (
          <div className="flex items-baseline gap-3 flex-wrap text-xs text-neutral-500">
            <Provenance
              kind="snapshot"
              source={`ingest_run #${latestRun.id}`}
              at={latestRun.finished_at ?? latestRun.triggered_at}
              cadence="2-hourly"
            />
            <span>
              Latest scrape run: {latestRun.status}
              {latestRun.rows_read != null &&
                ` · ${latestRun.rows_written ?? 0}/${latestRun.rows_read} written`}
              {(latestRun.rows_quarantined ?? 0) > 0 &&
                ` · ${latestRun.rows_quarantined} quarantined`}
            </span>
            {latestRun.notes && (
              <span className="text-neutral-600 italic">{latestRun.notes}</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-neutral-600 italic">
            No cardrush ingest_run rows — the chunked scrape has never run
            against this database.
          </p>
        )}
      </section>

      {/* S3 sync + CSV upload not yet wired — punch-list item */}
      <ActionBanner tone="info" title="Sync and CSV upload not yet wired in admin app">
        Use the legacy wholesale admin for bulk-sync from S3 (price feed) or
        CSV upload — those calls live in <code className="text-xs">apps/wholesale</code>.
        Inline price edit (below) is wired and writes via a Server Action with governance log.
      </ActionBanner>

      <SectionHeading count={total}>Cards</SectionHeading>

      <FilterPills selected={filter} pills={filterPills} />

      <SearchForm
        action="/admin/commerce/pricing"
        value={q}
        placeholder="Search by SKU, name, or card number"
        clearHref={buildHref({ q: "", page: "1" })}
        preserve={{ filter }}
      />

      <DataTable
        columns={columns}
        rows={rowsResult.rows}
        rowKey={(r) => r.id}
        emptyMessage={
          total === 0 && q === "" && !filter
            ? "Wholesale cards table is empty."
            : "No cards match the current filter."
        }
        minWidth={840}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRows={total}
        pageSize={PAGE_SIZE}
        href={(p) => buildHref({ page: String(p) })}
      />

      <p className="text-xs text-neutral-600 italic">
        Last DB sync timestamp: {kpi.last_sync ? fmtDateTime(kpi.last_sync) : "never"}.
      </p>

      {/* Recent price changes — Phase 2.5 of kingdom-049. Reads the
          lifecycle log added in Phase 2. See docs/connections/the-pricing-arrow.md
          (S17) Act 4 — the Archive's log made visible. */}
      <section>
        <SectionHeading count={recentChangesResult.rows.length}>
          Recent price changes
        </SectionHeading>
        {recentChangesResult.rows.length === 0 ? (
          <p className="text-xs text-neutral-500">
            No price changes recorded yet. (Empty after a fresh deploy of
            Phase 2; the snapshot cron + admin edits will populate it.)
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left py-2 pr-3">When</th>
                  <th className="text-left py-2 pr-3">SKU</th>
                  <th className="text-left py-2 pr-3">Action</th>
                  <th className="text-left py-2 pr-3">Actor</th>
                  <th className="text-right py-2 pr-3">Before</th>
                  <th className="text-right py-2 pr-3">After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {recentChangesResult.rows.map((r, i) => {
                  const before = r.before_value?.price ?? null;
                  const after = r.after_value?.price ?? null;
                  const delta =
                    before !== null && after !== null ? after - before : null;
                  return (
                    <tr key={i} className="text-neutral-300">
                      <td className="py-2 pr-3 whitespace-nowrap" title={r.created_at}>
                        {fmtRelative(r.created_at)}
                      </td>
                      <td className="py-2 pr-3 font-mono text-neutral-400">
                        {r.sku ?? "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            r.action === "admin_edit"
                              ? "text-amber-400"
                              : "text-neutral-400"
                          }
                        >
                          {r.action}
                        </span>
                        {r.source && (
                          <span className="text-neutral-600 ml-2">
                            via {r.source}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-neutral-500 font-mono">
                        {r.actor_label ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {before !== null ? `£${before.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        {after !== null ? `£${after.toFixed(2)}` : "—"}
                        {delta !== null && Math.abs(delta) > 0.001 && (
                          <span
                            className={
                              delta > 0
                                ? "ml-2 text-emerald-500"
                                : "ml-2 text-red-400"
                            }
                          >
                            {delta > 0 ? "+" : ""}{delta.toFixed(2)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
