/**
 * Pricing — Manager page.
 *
 * Second pilot using the @/lib/ui primitives. Wholesale-side data (cards
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

import { wsQuery } from "@/lib/db";
import { fmtGBP, fmtJPY, fmtDateTime, fmtRelative } from "@/lib/format";
import {
  PageHeader, FilterPills, SearchForm, DataTable, Pagination,
  KpiGrid, KpiCard, SectionHeading, ExternalLink, ActionBanner,
  type Column,
} from "@/lib/ui";
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

  const [rowsResult, totalResult, kpiResult, gameResult] = await Promise.all([
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
      id: number; name: string | null; with_url: string; fresh_7d: string;
    }>(
      `SELECT g.id, g.name,
              COUNT(c.*) FILTER (WHERE c.cardrush_url IS NOT NULL)::text AS with_url,
              COUNT(c.*) FILTER (
                WHERE c.last_synced_at >= NOW() - INTERVAL '7 days'
              )::text AS fresh_7d
         FROM games g
         LEFT JOIN cards c ON c.game_id = g.id
         WHERE g.active = true
         GROUP BY g.id, g.name
        HAVING COUNT(c.*) FILTER (WHERE c.cardrush_url IS NOT NULL) > 0
         ORDER BY COUNT(c.*) FILTER (WHERE c.cardrush_url IS NOT NULL) DESC`,
      [],
    ),
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
    return `/commerce/pricing${qs ? `?${qs}` : ""}`;
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

  // Per-game coverage — figure out the urgency for each game.
  // 0% fresh = critical (scrape is silently broken for this domain).
  // <50% = warning. ≥50% = ok.
  const gameCoverage = gameResult.rows.map((g) => {
    const withUrl = parseInt(g.with_url, 10);
    const fresh = parseInt(g.fresh_7d, 10);
    const pct = withUrl > 0 ? Math.round((100 * fresh) / withUrl) : 0;
    const urgency: "critical" | "warning" | "ok" =
      withUrl === 0 || fresh === 0 ? "critical" : pct < 50 ? "warning" : "ok";
    return { id: g.id, name: g.name ?? `Game ${g.id}`, withUrl, fresh, pct, urgency };
  });
  const anyBroken = gameCoverage.some((g) => g.urgency === "critical");

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title="Pricing"
        description={
          <>
            {parseInt(kpi.total, 10).toLocaleString()} cards · last sync{" "}
            {kpi.last_sync ? fmtRelative(kpi.last_sync) : "never"}.
          </>
        }
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
        <ActionBanner tone="critical" title="Daily price snapshot is failing for one or more games">
          Cards with a CardRush URL exist but ZERO have been refreshed in the last 7 days
          for at least one active game. The cron at{" "}
          <code className="text-xs">apps/wholesale/src/app/api/cron/price-snapshot</code>{" "}
          runs nightly but the per-domain scraper appears to fail silently. See per-game
          coverage below.
        </ActionBanner>
      )}

      <section className="space-y-3">
        <SectionHeading count={gameCoverage.length}>Sync coverage by game</SectionHeading>
        <KpiGrid cols={(gameCoverage.length === 1 ? 2 : gameCoverage.length === 2 ? 2 : gameCoverage.length >= 4 ? 4 : 3) as 2 | 3 | 4}>
          {gameCoverage.map((g) => (
            <KpiCard
              key={g.id}
              label={g.name}
              value={`${g.fresh.toLocaleString()} / ${g.withUrl.toLocaleString()}`}
              urgency={g.urgency}
              sub={`${g.pct}% fresh in 7d`}
            />
          ))}
        </KpiGrid>
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
        action="/commerce/pricing"
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
    </div>
  );
}
